# MRPanalytics

Read-only analytics app over the `pratham` MongoDB database (MRPscan backend).
Search any user by phone number or name and see every parameter of their activity:
scans, credits, payments, invoices, wishlist, OTP logins, license, wallet, employees
and all configured settings, plus a unified timeline and charts.

## Run the server

```bash
npm install
npm start
```

Open http://localhost:4100 on this computer. The console also prints the LAN address for phones.

All settings live in one file, `.env` in this folder (copy `.env.example` to start):

| Key | Purpose |
|---|---|
| `MONGO_URI`, `MONGO_DB` | Database connection. Server only, never read by the APK build. |
| `PORT` | Server port, default 4100 |
| `ANALYTICS_TOKEN` | Access key every device must enter. |
| `TRUST_LOCALHOST` | `true` lets this computer skip the key. Keep `false` on a server behind nginx. |
| `APP_NAME` | App name on the web page and under the phone icon (the APK reads it at build time). |
| `ANALYTICS_SERVER_URL` | Address the phone app opens. Empty = this computer's Wi-Fi address at build time. |

After changing `APP_NAME` or `ANALYTICS_SERVER_URL`, restart the server and rebuild the APK.

## Android app (MRPanalytics.apk)

The APK is a native shell that opens the analytics server. It contains **no database
credentials**: the server holds them and exposes a read-only API.

1. Start the server on the computer (`npm start`).
2. Install `MRPanalytics.apk` on the phone (allow "install unknown apps").
3. Phone and computer on the same Wi-Fi. The app opens the server address baked in at
   build time. If the computer's IP changes, the app shows a connect screen to fix it,
   and the server icon in the top bar reopens it later.
4. On first open the app asks for the access key: the `ANALYTICS_TOKEN` value in `.env`.

For use outside the office Wi-Fi, host the server on an https address and enter that
address in the connect screen.

### Rebuild the APK

```bash
cd android
./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`. Set
`ANALYTICS_SERVER_URL=https://your-host` before building to change the default address.
Signing uses `android/keystore.properties` and `android/app/keystore/` (both git-ignored; keep them to ship updates).

## Layout

- `server/index.js` – Express server, access-key check, serves `/public` and the JSON API
- `server/analytics-core.js` – all analytics (overview, user search, per-user detail, timeline)
- `server/mongo-adapter.js` – MongoDB driver adapter for the core
- `server/sanitize.js` – strips password hashes, MPIN, OTP codes and gateway secrets
- `public/` – single-page app (no build step): `app.js` views, `charts.js` SVG charts, `styles.css`
- `android/` – WebView shell app (Java, no third-party dependencies)

## API

- `GET /api/overview?days=30`
- `GET /api/users?q=<phone | name | business | gst | id>`
- `GET /api/users/:idOrPhone?days=30`

Send the access key in the `x-access-key` header from any device other than the server itself.
The app never writes to the database.
