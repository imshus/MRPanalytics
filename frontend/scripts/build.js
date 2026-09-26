// Builds the static web app: src/ -> dist/, filling the app name and writing config.js.
// dist/ can be served by any static host (nginx, the bundled server.js, ...).
const fs = require('fs');
const path = require('path');
const { loadEnv } = require('./env');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function build() {
  const env = loadEnv();
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  for (const name of fs.readdirSync(SRC)) {
    const from = path.join(SRC, name);
    if (!fs.statSync(from).isFile()) continue;
    let content = fs.readFileSync(from);
    if (name === 'index.html') {
      content = content.toString('utf8')
        .replace(/\{\{APP_NAME\}\}/g, escHtml(env.appName))
        .replace(/\{\{APP_INITIAL\}\}/g, escHtml(env.appName.charAt(0).toUpperCase() || 'M'));
    }
    fs.writeFileSync(path.join(DIST, name), content);
  }
  const config = { appName: env.appName, apiUrl: env.apiUrl };
  fs.writeFileSync(path.join(DIST, 'config.js'), `window.MRP_CONFIG = ${JSON.stringify(config)};\n`);
  return env;
}

if (require.main === module) {
  const env = build();
  console.log(`Built frontend/dist for "${env.appName}" (API: ${env.apiUrl || 'same address, /api'})`);
}

module.exports = { build };
