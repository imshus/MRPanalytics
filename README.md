# MRPanalytics

Read-only user analytics for MRPscan. Search any user by phone number or name and see
every parameter of their activity: scans, credits, payments, invoices, wishlist, OTP
logins, license, wallet, employees and all configured settings, with a timeline and charts.

The project has three separate parts, each with its own `.env`:

```
backend/    API server (Node + Express + MongoDB). Holds the database password.
frontend/   Web app (static HTML/JS/CSS) + small server that forwards /api to the backend.
android/    Phone app (WebView shell) that opens the frontend. Holds no secrets.
```

## Quick start (this computer)

```bash
npm run setup      # installs backend dependencies (frontend has none)
npm start          # starts backend (port 4000) and frontend (port 4100) together
```

Open http://localhost:4100. The frontend prints the Wi-Fi address for phones.
Each part can also run alone: `npm start --prefix backend`, `npm start --prefix frontend`.

Create each `.env` by copying the `.env.example` next to it.

## backend/.env

| Key | Purpose |
|---|---|
| `MONGO_URI`, `MONGO_DB` | Database connection. Never leaves the backend. |
| `PORT` | API port, default 4000 |
| `HOST` | `127.0.0.1` = only this machine can reach the API (default). `0.0.0.0` only if the frontend runs elsewhere. |
| `ANALYTICS_TOKEN` | Access key every browser and phone must enter. |
| `TRUST_LOCALHOST` | `true` lets this computer skip the key. Keep `false` on a server behind nginx. |
| `CORS_ORIGINS` | Web addresses allowed to call the API directly. Empty when using the /api forwarder. |

API: `GET /api/health`, `GET /api/overview?days=30`, `GET /api/users?q=<phone|name|business|gst>`,
`GET /api/users/:idOrPhone?days=30`. Send the key in the `x-access-key` header. Read-only.

## frontend/.env

| Key | Purpose |
|---|---|
| `APP_NAME` | Name on the web page |
| `FRONTEND_PORT` | Port the web app listens on, default 4100 |
| `BACKEND_URL` | Where `/api` requests are forwarded, default `http://127.0.0.1:4000` |
| `API_URL` | Leave empty (browser uses `/api` on the same address). Set only to call the backend directly, and add the site to the backend's `CORS_ORIGINS`. |

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

1. `backend/.env` with `TRUST_LOCALHOST=false`, `HOST=127.0.0.1`; run `npm start --prefix backend` (PM2 or systemd).
2. `npm run build --prefix frontend`, then point nginx at `frontend/dist` and proxy `/api` to the backend:

```nginx
server {
    server_name analytics.mrpscan.com;
    root /path/to/MRPanalytics/frontend/dist;
    location / { try_files $uri /index.html; }
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
    }
}
```

Add https (for example with certbot) so the access key is not sent in plain text.
