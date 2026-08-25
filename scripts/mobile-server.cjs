const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const root = path.resolve(process.cwd(), 'mobile');
const port = Number(process.env.MOBILE_PORT || 4174);
const host = process.env.MOBILE_HOST || '0.0.0.0';
const apiHost = process.env.API_HOST || '127.0.0.1';
const apiPort = Number(process.env.API_PORT || 8787);
const cloudApiUrl = String(process.env.MOBILE_CLOUD_API_URL || '').replace(/\/$/, '');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function safePath(urlPath) {
  const pathname = decodeURIComponent((urlPath || '/').split('?')[0]);
  const resolved = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  return resolved.startsWith(root + path.sep) || resolved === path.join(root, 'index.html') ? resolved : null;
}

function proxyApi(req, res) {
  const target = new URL(req.url, `http://${apiHost}:${apiPort}`);
  const headers = { ...req.headers, host: `${apiHost}:${apiPort}` };
  delete headers.connection;
  delete headers['content-length'];
  const proxy = http.request({
    hostname: apiHost,
    port: apiPort,
    method: req.method,
    path: `${target.pathname}${target.search}`,
    headers,
  }, upstream => {
    res.writeHead(upstream.statusCode || 502, upstream.headers);
    upstream.pipe(res);
  });
  proxy.on('error', err => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: false, error: `تعذر الاتصال بالسيرفر المحلي: ${err.message}` }));
    } else {
      res.destroy();
    }
  });
  req.pipe(proxy);
}

const server = http.createServer((req, res) => {
  if (req.url === '/config.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(`window.__BAZAAR_MOBILE_CONFIG__=${JSON.stringify({ cloudApiUrl })};`);
    return;
  }
  if (req.url === '/api' || req.url.startsWith('/api/')) {
    proxyApi(req, res);
    return;
  }
  const file = safePath(req.url);
  if (!file) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404); res.end('Not found'); return;
    }
    res.setHeader('Content-Type', mime[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(port, host, () => {
  console.log(`Mobile app: http://localhost:${port}`);
  console.log(`LAN access (Wi-Fi/Hotspot): http://<YOUR-PC-IP>:${port}`);
});
