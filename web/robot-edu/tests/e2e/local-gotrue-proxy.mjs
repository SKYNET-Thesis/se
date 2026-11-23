// Local acceptance only: stands in for the hosted Supabase gateway in front of a REAL GoTrue container.
// Strips the /auth/v1 prefix and adds CORS. Usage: node local-gotrue-proxy.mjs <listenPort> <gotruePort>
import { createServer, request } from 'node:http';
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [listen, target] = [Number(process.argv[2] ?? 54323), Number(process.argv[3] ?? 9999)];
const serviceRoleKey = process.env.VISTA_E2E_GOTRUE_SERVICE_ROLE_KEY ?? '';
const fixturePassword = process.env.VISTA_E2E_GOTRUE_FIXTURE_PASSWORD ?? '';
const inviteCalls = new Map(); // test-only count of invitation requests forwarded to local GoTrue
const issuer = process.env.VISTA_E2E_GOTRUE_ISSUER ?? `http://127.0.0.1:${listen}/auth/v1`;
const signingKid = process.env.VISTA_E2E_GOTRUE_SIGNING_KID ?? '';
const signingKeyPath = process.env.VISTA_E2E_GOTRUE_SIGNING_KEY ?? '';
let signingKey;
if (signingKeyPath) signingKey = createPrivateKey(readFileSync(signingKeyPath));

const respond = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
};

async function fixtureSession(req, res, url) {
  if (!serviceRoleKey || !fixturePassword) {
    respond(res, 503, { error: 'Real GoTrue fixture credentials are not configured.' });
    return;
  }
  const sub = url.searchParams.get('sub') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(sub)) {
    respond(res, 400, { error: 'sub UUID is required' });
    return;
  }

  const identityResponse = await fetch(`http://127.0.0.1:${target}/admin/users/${encodeURIComponent(sub)}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!identityResponse.ok) {
    respond(res, identityResponse.status, { error: 'Fixture identity is not provisioned in local GoTrue.' });
    return;
  }
  const identity = await identityResponse.json();
  const requestedEmail = url.searchParams.get('email');
  if (requestedEmail && requestedEmail.toLowerCase() !== String(identity.email ?? '').toLowerCase()) {
    respond(res, 400, { error: 'Requested email does not match the local GoTrue identity.' });
    return;
  }

  const identityLogin = identity.email ? { email: identity.email } : { phone: `+${String(identity.phone ?? '').replace(/^\+/, '')}` };
  const passwordGrant = () => fetch(`http://127.0.0.1:${target}/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: process.env.VISTA_E2E_GOTRUE_ANON_KEY ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...identityLogin, password: fixturePassword }),
  });
  let grantResponse = await passwordGrant();
  // UI journeys create invitation-only identities. Their email-delivery/acceptance flow is a separate suite;
  // give only synthetic .test identities the shared local fixture password, then obtain a real GoTrue session.
  if (!grantResponse.ok && (identity.phone || /@(example|vista)\.test$|@students\.auth\.vista\.invalid$/i.test(String(identity.email ?? '')))) {
    const setup = await fetch(`http://127.0.0.1:${target}/admin/users/${encodeURIComponent(sub)}`, {
      method: 'PUT',
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: fixturePassword, email_confirm: true }),
    });
    if (setup.ok) grantResponse = await passwordGrant();
  }
  const grant = await grantResponse.json();
  if (!grantResponse.ok) {
    respond(res, grantResponse.status, { error: 'The local GoTrue password grant failed.' });
    return;
  }

  const ttl = Number(url.searchParams.get('ttl') ?? grant.expires_in);
  if (ttl < 0) {
    if (!signingKey || !signingKid) {
      respond(res, 503, { error: 'Expired-token signing key is not configured.' });
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const header = encode({ alg: 'ES256', typ: 'JWT', kid: signingKid });
    const payload = encode({
      iss: issuer, aud: 'authenticated', role: 'authenticated', sub,
      iat: now, exp: now + ttl, email: identity.email,
    });
    const input = `${header}.${payload}`;
    grant.access_token = `${input}.${sign('sha256', Buffer.from(input), { key: signingKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
    grant.expires_in = ttl;
    grant.expires_at = now + ttl;
    grant.refresh_token = 'expired-e2e-no-refresh';
  }
  respond(res, 200, grant);
}

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,content-type,x-client-info,x-supabase-api-version');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${listen}`);
  if (req.method === 'POST' && url.pathname === '/__test/users') {
    if (!serviceRoleKey || !fixturePassword) { respond(res, 503, { error: 'Local GoTrue fixture credentials are not configured.' }); return; }
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', async () => {
      try {
        const body = JSON.parse(raw || '{}');
        const validId = typeof body.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id);
        const validIdentity = typeof body.email === 'string' || typeof body.phone === 'string';
        if (!validId || !validIdentity) { respond(res, 400, { error: 'Fixture UUID and e-mail or phone are required.' }); return; }
        const created = await fetch(`http://127.0.0.1:${target}/admin/users`, {
          method: 'POST',
          headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: body.id, ...(body.email ? { email: body.email } : { phone: body.phone }), password: fixturePassword, email_confirm: true, phone_confirm: true }),
        });
        const payload = await created.json().catch(() => ({}));
        respond(res, created.status, payload);
      } catch { respond(res, 400, { error: 'Fixture identity request was invalid.' }); }
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/__test/invites') {
    const email = String(url.searchParams.get('email') ?? '').toLowerCase();
    respond(res, 200, { count: inviteCalls.get(email) ?? 0 });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/token') {
    try { await fixtureSession(req, res, url); }
    catch { respond(res, 502, { error: 'Could not obtain a fixture session from local GoTrue.' }); }
    return;
  }
  const path = (req.url ?? '/').replace(/^\/auth\/v1/, '') || '/';
  const upstream = request({ host: '127.0.0.1', port: target, method: req.method, path, headers: { ...req.headers, host: `127.0.0.1:${target}` } }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
  upstream.on('error', () => { res.writeHead(502); res.end('{"error":"gotrue unavailable"}'); });
  if (req.method === 'POST' && url.pathname === '/auth/v1/invite') {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try {
        const email = String(JSON.parse(raw || '{}').email ?? '').toLowerCase();
        if (email) inviteCalls.set(email, (inviteCalls.get(email) ?? 0) + 1);
      } catch { /* GoTrue will return the authoritative malformed-body response. */ }
      upstream.end(raw);
    });
  } else req.pipe(upstream);
}).listen(listen, '127.0.0.1');
