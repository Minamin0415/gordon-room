// PCで試すためだけの簡易サーバー。本番のPWAには不要です。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const configuredBase = (process.env.GORDON_BASE_PATH || '/').replace(/^\/+|\/+$/g, '');
const basePath = configuredBase ? `/${configuredBase}/` : '/';
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

http.createServer((req, res) => {
  let target;
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!pathname.startsWith(basePath)) { res.writeHead(404).end(); return; }
    target = path.resolve(root, pathname.slice(basePath.length) || '.');
  }
  catch { res.writeHead(400).end(); return; }
  if (!target.startsWith(root + path.sep) && target !== root) { res.writeHead(403).end(); return; }
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  fs.readFile(target, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': (mime[path.extname(target)] || 'application/octet-stream') + '; charset=utf-8' });
    res.end(data);
  });
}).listen(Number(process.env.GORDON_PORT || 8000), '127.0.0.1', () => {
  console.log(`ブラウザで http://localhost:${process.env.GORDON_PORT || 8000}${basePath} を開いてください。`);
});
