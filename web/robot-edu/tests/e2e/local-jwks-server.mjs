import { createServer } from 'node:http';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
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

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', issuer);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,content-type');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'GET' && url.pathname === '/auth/v1/.well-known/jwks.json') {
    res.end(JSON.stringify({ keys: [jwk] })); return;
  }
  if (req.method === 'GET' && url.pathname === '/token') {
    const sub = url.searchParams.get('sub');
    const ttl = Number(url.searchParams.get('ttl') ?? 3600); // tests may mint an already-expired token with a negative ttl
    if (!sub || !/^[0-9a-f-]{36}$/i.test(sub)) { res.writeHead(400); res.end(JSON.stringify({ error: 'sub UUID is required' })); return; }
    const now = Math.floor(Date.now() / 1000);
    const header = b64({ alg: 'RS256', typ: 'JWT', kid });
    const payload = b64({ iss: issuer, aud: 'authenticated', role: 'authenticated', sub, iat: now, exp: now + ttl });
    const input = `${header}.${payload}`;
    const token = `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
    res.end(JSON.stringify({ access_token: token, token_type: 'bearer', expires_in: ttl, expires_at: now + ttl, refresh_token: 'local-e2e-no-refresh', user: { id: sub, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: new Date().toISOString() } }));
    return;
  }
  res.writeHead(404); res.end(JSON.stringify({ error: 'not found' }));
});
server.listen(port, host);
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
