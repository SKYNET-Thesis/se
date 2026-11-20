// Local acceptance only: stands in for the hosted Supabase gateway in front of a REAL GoTrue container.
// Strips the /auth/v1 prefix and adds CORS. Usage: node local-gotrue-proxy.mjs <listenPort> <gotruePort>
import { createServer, request } from 'node:http';
const [listen, target] = [Number(process.argv[2] ?? 54323), Number(process.argv[3] ?? 9999)];
createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,content-type,x-client-info,x-supabase-api-version');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const path = (req.url ?? '/').replace(/^\/auth\/v1/, '') || '/';
  const upstream = request({ host: '127.0.0.1', port: target, method: req.method, path, headers: { ...req.headers, host: `127.0.0.1:${target}` } }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
  upstream.on('error', () => { res.writeHead(502); res.end('{"error":"gotrue unavailable"}'); });
  req.pipe(upstream);
}).listen(listen, '127.0.0.1');
