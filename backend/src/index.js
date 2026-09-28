// MRPanalytics backend: read-only JSON API over the MRPscan MongoDB database at /api.
// Opening the server address shows the web app directly: the backend builds the separate
// frontend project (../frontend) on start and serves it at / (SERVE_FRONTEND=false = API only).
const path = require('path');
const os = require('os');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const { getDb } = require('./db');
const analytics = require('./analytics');

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '0.0.0.0';
const ACCESS_KEY = (process.env.ANALYTICS_TOKEN || '').trim();
// Web app addresses allowed to call this API from the browser. Used as-is when CORS_ORIGINS
// is set in .env; otherwise these defaults (the live site and a local frontend) apply.
const DEFAULT_CORS = 'https://analytics.mrpscan.com,http://analytics.mrpscan.com,http://localhost:4100,http://127.0.0.1:4100,http://localhost:4000,http://127.0.0.1:4000';
const CORS_ORIGINS = String(process.env.CORS_ORIGINS ?? DEFAULT_CORS)
  .split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
const SERVE_FRONTEND = String(process.env.SERVE_FRONTEND || 'true').trim().toLowerCase() !== 'false';
const FRONTEND_ROOT = path.resolve(__dirname, '..', '..', 'frontend');
const FRONTEND_DIST = path.join(FRONTEND_ROOT, 'dist');
const TRUST_LOCALHOST = String(process.env.TRUST_LOCALHOST || 'false').trim().toLowerCase() === 'true';
const LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

app.disable('x-powered-by');

// CORS: lets the frontend call this API directly from the browser when it runs on a
// different address (frontend API_URL set). Only the listed origins are allowed.
const originAllowed = (origin) => Boolean(origin) && (CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(origin.replace(/\/+$/, '')));
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (originAllowed(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'x-access-key, content-type');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(originAllowed(origin) ? 204 : 403);
  next();
});

// Every request must send the access key (ANALYTICS_TOKEN) in the x-access-key header.
// TRUST_LOCALHOST=true lets requests from this same computer skip it (laptop only):
// - a forwarding proxy (frontend server, nginx) appends the real visitor to
//   x-forwarded-for, and only that last hop is trusted, so a phone never counts as local;
// - a browser request from a web page that is not an allowed origin never counts as local,
//   so a random website opened on this laptop cannot read data through localhost.
// Keep TRUST_LOCALHOST=false on servers.
function isLocal(req) {
  if (!TRUST_LOCALHOST || !LOOPBACK.includes(req.socket.remoteAddress)) return false;
  const origin = req.get('origin');
  if (origin && !originAllowed(origin)) return false;
  if (req.get('x-real-ip')) return LOOPBACK.includes(req.get('x-real-ip').trim());
  const fwd = req.get('x-forwarded-for');
  if (!fwd) return true;
  return LOOPBACK.includes(fwd.split(',').pop().trim());
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

app.get('/api/health', (req, res) => res.json({ ok: true, authRequired: Boolean(ACCESS_KEY) && !isLocal(req) }));
app.use('/api', requireKey);
app.get('/api/overview', wrap((db, req) => analytics.overview(db, Number(req.query.days) || 30)));
app.get('/api/users', wrap((db, req) => analytics.listUsers(db, String(req.query.q || ''))));
app.get('/api/users/:id', wrap((db, req) => analytics.userDetail(db, req.params.id, Number(req.query.days) || 30)));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ---- Web app at / ----
let uiReady = false;
let uiAppName = 'MRPanalytics';
if (SERVE_FRONTEND) {
  try {
    // Rebuild frontend/dist from frontend/src + frontend/.env so changes apply on every restart.
    const built = require(path.join(FRONTEND_ROOT, 'scripts', 'build.js')).build();
    if (built && built.appName) uiAppName = built.appName;
  } catch (err) {
    console.error('[web app] build failed:', err.message);
  }
  uiReady = fs.existsSync(path.join(FRONTEND_DIST, 'index.html'));
}
if (uiReady) {
  // The app served here always uses THIS server's /api (the default API), whatever
  // frontend/.env API_URL says; API_URL only matters when the frontend is hosted elsewhere.
  app.get('/config.js', (req, res) => res.set('Cache-Control', 'no-store').type('js')
    .send(`window.MRP_CONFIG = ${JSON.stringify({ appName: uiAppName, apiUrl: '' })};\n`));
  app.use(express.static(FRONTEND_DIST, { etag: false, maxAge: 0 }));
  app.get('*', (req, res) => res.set('Cache-Control', 'no-store').sendFile(path.join(FRONTEND_DIST, 'index.html')));
} else {
  app.use((req, res) => res.status(404).type('text').send(
    SERVE_FRONTEND ? 'Web app not available: the frontend folder is missing next to backend.' : 'Not found',
  ));
}

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}/api`);
  }
  return out;
}

app.listen(PORT, HOST, () => {
  console.log(uiReady
    ? `MRPanalytics on http://localhost:${PORT}  (web app at /, API at /api)`
    : `MRPanalytics backend (API only) on http://localhost:${PORT}/api`);
  if (HOST === '0.0.0.0') { const lan = lanUrls(); if (lan.length) console.log(`Network address: ${lan.join('  ')}`); }
  console.log(ACCESS_KEY ? `Access key required (ANALYTICS_TOKEN)${TRUST_LOCALHOST ? ', except from this computer (TRUST_LOCALHOST=true)' : ' for every request'}.` : 'WARNING: ANALYTICS_TOKEN is empty, the API is open to anyone who can reach it.');
  console.log(CORS_ORIGINS.length ? `Browsers may call it directly from: ${CORS_ORIGINS.join(', ')}` : 'No CORS origins: browsers reach it only through the frontend server.');
  getDb()
    .then((db) => console.log(`[db] connected to ${db.databaseName}`))
    .catch((err) => console.error('[db] connection failed:', err.message));
});
