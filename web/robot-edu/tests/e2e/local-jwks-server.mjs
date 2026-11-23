import { createServer } from 'node:http';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const host = '127.0.0.1';
const port = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
if (![54321, 54323].includes(port)) throw new Error('Local E2E JWKS server requires an approved isolated loopback port.');
const issuer = `http://${host}:${port}/auth/v1`;
// Keep the disposable signer stable across Playwright retries: the running API
// caches the JWKS and must see the same key after this server restarts.
const keyFile = '/tmp/vista-phase243-jwks-private.pem';
let privateKey;
try { privateKey = createPrivateKey(readFileSync(keyFile)); }
catch (error) {
  if (error?.code !== 'ENOENT') throw error;
  const generated = generateKeyPairSync('rsa', { modulusLength: 2048 });
  writeFileSync(keyFile, generated.privateKey.export({ format: 'pem', type: 'pkcs8' }), { flag: 'wx', mode: 0o600 });
  privateKey = generated.privateKey;
}
const publicKey = createPublicKey(privateKey);
const kid = 'vista-phase243-local-e2e';
const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

const invited = new Map();
const passwordUsers = new Map();
const inviteCalls = new Map(); // test hook: how many invitation e-mails were requested per address
const emailsBySub = new Map(); // like GoTrue, tokens of known identities carry their e-mail claim
function mint(sub, ttl, refresh = 'local-e2e-no-refresh') {
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: 'RS256', typ: 'JWT', kid });
  const payload = b64({ iss: issuer, aud: 'authenticated', role: 'authenticated', sub, iat: now, exp: now + ttl, ...(emailsBySub.has(sub) ? { email: emailsBySub.get(sub) } : {}) });
  const input = `${header}.${payload}`;
  const token = `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
  const email = emailsBySub.get(sub);
  return { access_token: token, token_type: 'bearer', expires_in: ttl, expires_at: now + ttl, refresh_token: refresh, user: { id: sub, aud: 'authenticated', role: 'authenticated', ...(email ? { email } : {}) } };
}
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', issuer);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,content-type,x-client-info,x-supabase-api-version');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'GET' && url.pathname === '/auth/v1/.well-known/jwks.json') {
    res.end(JSON.stringify({ keys: [jwk] })); return;
  }
  // --- Minimal GoTrue stub for local acceptance only (never a real identity provider) ---
  const readBody = (cb) => { let raw = ''; req.on('data', (c) => { raw += c; }); req.on('end', () => { let json = {}; try { json = JSON.parse(raw || '{}'); } catch { /* empty */ } cb(json); }); };
  const listUsers = () => [...invited.values(), ...[...passwordUsers.values()].map(({ id, email }) => ({ id, email }))];
  if (url.pathname === '/auth/v1/admin/users' && req.method === 'GET') { res.end(JSON.stringify({ users: listUsers() })); return; }
  if (url.pathname === '/auth/v1/admin/users' && req.method === 'POST') {
    readBody((b) => {
      const email = String(b.email ?? '').toLowerCase();
      if (!email) { res.writeHead(422); res.end(JSON.stringify({ error: 'email required' })); return; }
      if (passwordUsers.has(email) || invited.has(email)) { res.writeHead(422); res.end(JSON.stringify({ error: 'exists' })); return; }
      const user = { id: randomUUID(), email, password: String(b.password ?? '') };
      passwordUsers.set(email, user); emailsBySub.set(user.id, email); res.end(JSON.stringify({ id: user.id, email }));
    }); return;
  }
  const adminUser = url.pathname.match(/^\/auth\/v1\/admin\/users\/([0-9a-f-]{36})$/i);
  if (adminUser && (req.method === 'PUT' || req.method === 'DELETE')) {
    const entry = [...passwordUsers.entries()].find(([, u]) => u.id === adminUser[1]);
    if (!entry) { res.writeHead(404); res.end(JSON.stringify({ error: 'not found' })); return; }
    if (req.method === 'DELETE') { passwordUsers.delete(entry[0]); res.end('{}'); return; }
    readBody((b) => {
      const user = entry[1];
      if (typeof b.password === 'string') user.password = b.password;
      if (typeof b.email === 'string') { passwordUsers.delete(entry[0]); user.email = b.email.toLowerCase(); passwordUsers.set(user.email, user); emailsBySub.set(user.id, user.email); }
      res.end(JSON.stringify({ id: user.id, email: user.email }));
    }); return;
  }
  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password' && req.method === 'POST') {
    readBody((b) => {
      const user = passwordUsers.get(String(b.email ?? '').toLowerCase());
      if (!user || user.password !== b.password) { res.writeHead(400); res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' })); return; }
      res.end(JSON.stringify(mint(user.id, 3600, `stub-refresh:${user.id}`)));
    }); return;
  }
  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token' && req.method === 'POST') {
    readBody((b) => {
      const m = String(b.refresh_token ?? '').match(/^stub-refresh:([0-9a-f-]{36})$/i);
      if (!m) { res.writeHead(400); res.end(JSON.stringify({ error: 'invalid_grant' })); return; }
      res.end(JSON.stringify(mint(m[1], 3600, `stub-refresh:${m[1]}`)));
    }); return;
  }
  if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
    try { const sub = JSON.parse(Buffer.from(String(req.headers.authorization ?? '').split('.')[1] ?? '', 'base64url').toString()).sub; const email = emailsBySub.get(sub); res.end(JSON.stringify({ id: sub, aud: 'authenticated', role: 'authenticated', ...(email ? { email } : {}) })); }
    catch { res.writeHead(401); res.end(JSON.stringify({ error: 'invalid token' })); }
    return;
  }
  if (url.pathname === '/auth/v1/logout' && req.method === 'POST') { res.writeHead(204); res.end(); return; }
  if (req.method === 'GET' && url.pathname === '/token') {
    const sub = url.searchParams.get('sub');
    const ttl = Number(url.searchParams.get('ttl') ?? 3600); // tests may mint an already-expired token with a negative ttl
    if (!sub || !/^[0-9a-f-]{36}$/i.test(sub)) { res.writeHead(400); res.end(JSON.stringify({ error: 'sub UUID is required' })); return; }
    if (url.searchParams.get('email')) emailsBySub.set(sub, String(url.searchParams.get('email')).toLowerCase()); // test-only: mint a token that carries an e-mail claim
    if (url.searchParams.get('noemail') === '1') emailsBySub.delete(sub);
    res.end(JSON.stringify(mint(sub, ttl)));
    return;
  }
  if (url.pathname === '/__test/invites' && req.method === 'GET') { res.end(JSON.stringify({ count: inviteCalls.get(String(url.searchParams.get('email') ?? '').toLowerCase()) ?? 0 })); return; }
  if (url.pathname === '/auth/v1/invite' && req.method === 'POST') {
    readBody((b) => {
      const key = String(b.email ?? '').toLowerCase();
      if (!key) { res.writeHead(422); res.end(JSON.stringify({ error: 'email required' })); return; }
      inviteCalls.set(key, (inviteCalls.get(key) ?? 0) + 1);
      if (!invited.has(key)) { const created = { id: randomUUID(), email: key }; invited.set(key, created); emailsBySub.set(created.id, key); }
      res.end(JSON.stringify(invited.get(key)));
    }); return;
  }
  res.writeHead(404); res.end(JSON.stringify({ error: 'not found' }));
});
server.listen(port, host);
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
