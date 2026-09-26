# MRPanalytics

Read-only user analytics for MRPscan. Search any user by phone number or name and see
every parameter of their activity: scans, credits, payments, invoices, wishlist, OTP
logins, license, wallet, employees and all configured settings, with a timeline and charts.

The project has three separate parts, each with its own `.env`:

```
backend/    API server (Node + Express + MongoDB). Also serves the web app: ONE port for everything.
frontend/   Web app source (static HTML/JS/CSS), built into frontend/dist. Optional dev server.
android/    Phone app (WebView shell) that opens the frontend. Holds no secrets.
```

## Quick start (this computer)

```bash
npm run setup      # installs backend dependencies (frontend has none)
npm start          # starts the backend on ONE port (4100): web app at /, data at /api
```

Open http://localhost:4100. The backend prints the Wi-Fi address for phones.
The backend builds `frontend/dist` from `frontend/src` + `frontend/.env` every time it starts.
Frontend development only: `npm run start:dev` also runs the frontend dev server on port 5173.

Create each `.env` by copying the `.env.example` next to it.

## backend/.env

| Key | Purpose |
|---|---|
| `MONGO_URI`, `MONGO_DB` | Database connection. Never leaves the backend. |
| `PORT` | The one port for web app + API, default 4100 |
| `HOST` | `0.0.0.0` = phones on the Wi-Fi can open it (default). On a server behind nginx use `127.0.0.1`. |
| `SERVE_FRONTEND` | `true` (default) = also serve the web app on `PORT`. `false` = API only. |
| `ANALYTICS_TOKEN` | Access key every browser and phone must enter. |
| `TRUST_LOCALHOST` | `true` lets this computer skip the key. Keep `false` on a server behind nginx. |
| `CORS_ORIGINS` | Web addresses allowed to call the API from another site. Empty when the web app is served on the same port. |

API: `GET /api/health`, `GET /api/overview?days=30`, `GET /api/users?q=<phone|name|business|gst>`,
`GET /api/users/:idOrPhone?days=30`. Send the key in the `x-access-key` header. Read-only.

## frontend/.env

| Key | Purpose |
|---|---|
| `APP_NAME` | Name on the web page |
| `FRONTEND_PORT` | Dev server port only, default 5173 (normally the backend serves the web app) |
| `BACKEND_URL` | Where the dev server forwards `/api`, default `http://127.0.0.1:4100` |
| `API_URL` | Keep empty: the page then calls `/api` on the address it was opened from, which works on this computer, on phones and on analytics.mrpscan.com alike. Set it only when the API lives on a different site (then add this site to the backend's `CORS_ORIGINS`). |

`npm run build --prefix frontend` writes a static site to `frontend/dist/`.

## android/.env

| Key | Purpose |
|---|---|
| `APP_NAME` | Name under the phone icon |
| `SERVER_URL` | Address the app opens (the frontend), e.g. `https://analytics.mrpscan.com`. Empty = this computer's Wi-Fi address. |
| `SERVER_PORT` | Port used when `SERVER_URL` is empty, default 4100 |

Build the APK (Android Studio's JDK must be `JAVA_HOME`):

```bash
cd android
./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`. Signing uses
`android/keystore.properties` and `android/app/keystore/` (git-ignored). Keep a private
backup of both: every future update must be signed with the same key.

On first open the app asks for the access key (`ANALYTICS_TOKEN` from `backend/.env`).
If the server address is wrong or unreachable, a connect screen lets you change it.

## Deploying on a server with nginx

1. `npm run setup`, then create `backend/.env` with `HOST=127.0.0.1`, `TRUST_LOCALHOST=false` and a strong `ANALYTICS_TOKEN`.
2. Keep `API_URL` empty in `frontend/.env`.
3. Run `npm start` (the backend, one port 4100) under PM2 or systemd.
4. Point nginx at that one port:

```nginx
server {
    server_name analytics.mrpscan.com;
    location / {
        proxy_pass http://127.0.0.1:4100;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
    }
}
```

Add https (for example with certbot) so the access key is not sent in plain text.
