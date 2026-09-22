/**
 * 轻课表 · 本地静态服务器（零依赖，仅用 Node 内置模块）
 *   node server.js                  默认 http://127.0.0.1:5188
 *   node server.js 8080             指定端口
 *   node server.js 5188 0.0.0.0     允许手机在同一 WiFi 下访问
 *   node server.js 5188 lan         （同上，并打印局域网地址）
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 5188);
let HOST = process.argv[3] || process.env.HOST || '127.0.0.1';
if (HOST === 'lan') HOST = '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://' + HOST).pathname || '/');
  } catch (e) {
    res.writeHead(400); res.end('Bad Request'); return;
  }

  if (pathname === '/') pathname = '/index.html';

  const safeRel = path.normalize(pathname).replace(/^([/\\])+/, '');
  const filePath = path.resolve(ROOT, safeRel);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + pathname);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('\n[错误] 端口 ' + PORT + ' 已被占用。换一个端口：node server.js 5189\n');
  } else {
    console.error('\n[错误] ' + err.message + '\n');
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const lan = [];
  if (HOST === '0.0.0.0' || HOST === '::') {
    const ifs = os.networkInterfaces();
    Object.keys(ifs).forEach((name) => {
      (ifs[name] || []).forEach((a) => {
        if (a.family === 'IPv4' && !a.internal) lan.push(a.address);
      });
    });
  }
  console.log('');
  console.log('  轻课表 已启动');
  console.log('  ------------------------------------------');
  console.log('  电脑访问：http://127.0.0.1:' + PORT + '/');
  if (lan.length) {
    console.log('  手机访问（同一 WiFi）：');
    lan.forEach((ip) => console.log('      http://' + ip + ':' + PORT + '/'));
  } else if (HOST !== '0.0.0.0') {
    console.log('  想让手机访问：node server.js ' + PORT + ' lan');
  }
  console.log('  目录：' + ROOT);
  console.log('  ------------------------------------------');
  console.log('  按 Ctrl + C 停止服务');
  console.log('');
});
