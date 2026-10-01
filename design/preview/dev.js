// Preview the UI without MongoDB: a mock API (4555), the real frontend server (4100)
// pointed at it, and an Android-style phone frame (4101).
//   node design/preview/dev.js   ->   open http://localhost:4101
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.BACKEND_URL = 'http://127.0.0.1:4555';
process.env.API_URL = ''; // the browser uses /api on 4100, which forwards to the mock
process.env.FRONTEND_PORT = '4100';
require('./mock-api.js');
require(path.join(__dirname, '..', '..', 'frontend', 'server.js'));

const phoneFile = path.join(__dirname, 'phone.html');
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(phoneFile));
}).listen(4101, () => console.log('Android phone view on http://localhost:4101'));
