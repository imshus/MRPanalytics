const path = require('path');
const os = require('os');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const { getDb } = require('./db');
const analytics = require('./analytics');

const app = express();
const PORT = Number(process.env.PORT) || 4100;
const HOST = process.env.HOST || '0.0.0.0';
const ACCESS_KEY = (process.env.ANALYTICS_TOKEN || '').trim();
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const APP_NAME = (process.env.APP_NAME || 'MRPanalytics').trim();

// index.html carries {{APP_NAME}} / {{APP_INITIAL}} placeholders filled from .env.
const escHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function sendIndex(req, res) {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8')
    .replace(/\{\{APP_NAME\}\}/g, escHtml(APP_NAME))
    .replace(/\{\{APP_INITIAL\}\}/g, escHtml(APP_NAME.charAt(0).toUpperCase() || 'M'));
  res.set('Cache-Control', 'no-store').type('html').send(html);
}

app.disable('x-powered-by');
app.get(['/', '/index.html'], sendIndex);
app.use(express.static(PUBLIC_DIR, { etag: false, maxAge: 0, index: false }));

// Every request must send the access key (ANALYTICS_TOKEN) in the x-access-key header.
// TRUST_LOCALHOST=true lets requests from this same computer skip it (handy on a laptop).
// Keep it false on a server behind nginx: proxied visitors also arrive from 127.0.0.1.
const TRUST_LOCALHOST = String(process.env.TRUST_LOCALHOST || 'false').trim().toLowerCase() === 'true';
const isLocal = (req) => TRUST_LOCALHOST
  && !req.get('x-forwarded-for') && !req.get('x-real-ip')
  && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
function requireKey(req, res, next) {
  if (!ACCESS_KEY || isLocal(req)) return next();
  const given = String(req.get('x-access-key') || '').trim().toUpperCase();
  if (given && given === ACCESS_KEY.toUpperCase()) return next();
  return res.status(401).json({ error: 'Access key required', authRequired: true });
}

const wrap = (fn) => async (req, res) => {
  try {
    const db = await getDb();
    res.set('Cache-Control', 'no-store');
    res.json(await fn(db, req));
  } catch (err) {
    console.error(`[api] ${req.method} ${req.originalUrl} ->`, err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
};

app.get('/api/health', (req, res) => res.json({ ok: true, authRequired: Boolean(ACCESS_KEY) && !isLocal(req) }));
app.use('/api', requireKey);
app.get('/api/overview', wrap((db, req) => analytics.overview(db, Number(req.query.days) || 30)));
app.get('/api/users', wrap((db, req) => analytics.listUsers(db, String(req.query.q || ''))));
app.get('/api/users/:id', wrap((db, req) => analytics.userDetail(db, req.params.id, Number(req.query.days) || 30)));
app.get('*', sendIndex);

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
  }
  return out;
}

app.listen(PORT, HOST, () => {
  console.log(`${APP_NAME} running at http://localhost:${PORT}`);
  const lan = lanUrls();
  if (lan.length) console.log(`Phone / LAN address: ${lan.join('  ')}`);
  console.log(ACCESS_KEY ? `Access key required (ANALYTICS_TOKEN)${TRUST_LOCALHOST ? ', except from this computer (TRUST_LOCALHOST=true)' : ' for every request'}.` : 'WARNING: ANALYTICS_TOKEN is empty, the API is open to anyone who can reach it.');
  getDb()
    .then((db) => console.log(`[db] connected to ${db.databaseName}`))
    .catch((err) => console.error('[db] connection failed:', err.message));
});
