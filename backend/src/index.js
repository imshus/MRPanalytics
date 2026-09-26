// MRPanalytics backend: read-only JSON API over the MRPscan MongoDB database.
// The web app lives in ../frontend and talks to this API; nothing here serves HTML.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const { getDb } = require('./db');
const analytics = require('./analytics');

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '127.0.0.1';
const ACCESS_KEY = (process.env.ANALYTICS_TOKEN || '').trim();
const CORS_ORIGINS = String(process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

app.disable('x-powered-by');

// CORS: only needed when the browser calls this API directly from another address
// (frontend API_URL set). The default setup goes through the frontend's /api forwarder.
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && (CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(origin))) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'x-access-key, content-type');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});

// Every request must send the access key (ANALYTICS_TOKEN) in the x-access-key header.
// TRUST_LOCALHOST=true lets requests from this same computer skip it (handy on a laptop).
// A forwarding proxy (the frontend server, nginx) appends the real visitor to
// x-forwarded-for; only its last hop is trusted, so a phone behind the proxy never counts
// as local. Keep TRUST_LOCALHOST=false on servers.
const TRUST_LOCALHOST = String(process.env.TRUST_LOCALHOST || 'false').trim().toLowerCase() === 'true';
const LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
function isLocal(req) {
  if (!TRUST_LOCALHOST || !LOOPBACK.includes(req.socket.remoteAddress)) return false;
  if (req.get('x-real-ip')) return LOOPBACK.includes(req.get('x-real-ip').trim());
  const fwd = req.get('x-forwarded-for');
  if (!fwd) return true;
  const lastHop = fwd.split(',').pop().trim();
  return LOOPBACK.includes(lastHop);
}
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

app.get('/', (req, res) => res.json({ service: 'mrpanalytics-backend', ok: true, api: '/api' }));
app.get('/api/health', (req, res) => res.json({ ok: true, authRequired: Boolean(ACCESS_KEY) && !isLocal(req) }));
app.use('/api', requireKey);
app.get('/api/overview', wrap((db, req) => analytics.overview(db, Number(req.query.days) || 30)));
app.get('/api/users', wrap((db, req) => analytics.listUsers(db, String(req.query.q || ''))));
app.get('/api/users/:id', wrap((db, req) => analytics.userDetail(db, req.params.id, Number(req.query.days) || 30)));
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, HOST, () => {
  console.log(`MRPanalytics backend API on http://${HOST}:${PORT}/api`);
  console.log(ACCESS_KEY ? `Access key required (ANALYTICS_TOKEN)${TRUST_LOCALHOST ? ', except from this computer (TRUST_LOCALHOST=true)' : ' for every request'}.` : 'WARNING: ANALYTICS_TOKEN is empty, the API is open to anyone who can reach it.');
  if (CORS_ORIGINS.length) console.log(`CORS allowed for: ${CORS_ORIGINS.join(', ')}`);
  getDb()
    .then((db) => console.log(`[db] connected to ${db.databaseName}`))
    .catch((err) => console.error('[db] connection failed:', err.message));
});
