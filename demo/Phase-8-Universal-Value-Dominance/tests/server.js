const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4175);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const relativePath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.join(root, decodeURIComponent(relativePath));

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    if (stats.isDirectory()) {
      const indexPath = path.join(filePath, 'index.html');
      fs.stat(indexPath, (indexErr, indexStats) => {
        if (indexErr || !indexStats.isFile()) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        streamFile(indexPath, res);
      });
      return;
    }

    streamFile(filePath, res);
  });
});

function streamFile(filePath, res) {
  const ext = path.extname(filePath);
  const mime = mimeTypes[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(filePath).pipe(res);
}

server.listen(port, '127.0.0.1', () => {
  console.log(`Static server running at http://127.0.0.1:${port}`);
});
