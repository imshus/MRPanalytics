# MRPanalytics

Read-only user analytics for MRPscan. Search any user by phone number or name and see
every parameter of their activity: scans, credits, payments, invoices, wishlist, OTP
logins, license, wallet, employees and all configured settings, with a timeline and charts.

Three separate projects, each with its own `.env` and its own way to run:

```
backend/    API server (Node + Express + MongoDB). Data only, port 4000. Holds the database password.
frontend/   Web app (static HTML/JS/CSS) + its own server, port 4100. Calls the backend for data.
android/    Phone app (WebView shell) that opens the frontend. Holds no secrets.
```

The backend never serves web pages, and the frontend never touches the database.

## Quick start (this computer)

```bash
npm run setup           # installs backend dependencies (frontend has none)
npm start               # starts backend (4000) and frontend (4100) together
```

Or run each on its own, in two terminals:

```bash
npm run start:backend   # API on http://localhost:4000/api
npm run start:frontend  # web app on http://localhost:4100
```

Open http://localhost:4100. The frontend prints the Wi-Fi address for phones.
Create each `.env` by copying the `.env.example` next to it.

## How the frontend reaches the backend

- `API_URL` empty (default): the browser calls `/api` on the web app's own address and the
  frontend server forwards it to `BACKEND_URL`. Works on this computer, on phones and behind nginx.
- `API_URL` set, e.g. `https://api.analytics.mrpscan.com`: the browser calls the backend directly.
  The backend's `CORS_ORIGINS` must list the web app's address, and that backend must be running there.

## backend/.env

| Key | Purpose |
|---|---|
| `MONGO_URI`, `MONGO_DB` | Database connection. Never leaves the backend. |
| `PORT` | API port, default 4000 |
| `HOST` | `0.0.0.0` = reachable from other machines (default). `127.0.0.1` = only this machine. |
| `ANALYTICS_TOKEN` | Access key every browser and phone must enter. |
| `TRUST_LOCALHOST` | `true` lets this computer skip the key. Keep `false` on a server. |
| `CORS_ORIGINS` | Web app addresses allowed to call the API directly from the browser, comma separated. |

API: `GET /api/health`, `GET /api/overview?days=30`, `GET /api/users?q=<phone|name|business|gst>`,
`GET /api/users/:idOrPhone?days=30`. Send the key in the `x-access-key` header. Read-only.

## frontend/.env

| Key | Purpose |
|---|---|
| `APP_NAME` | Name on the web page |
| `FRONTEND_PORT` | Web app port, default 4100 |
| `BACKEND_URL` | Backend the frontend server forwards `/api` to, default `http://127.0.0.1:4000` |
| `API_URL` | Backend the browser calls directly. Empty = go through the frontend server (see above). |

`npm run build:frontend` writes a static site to `frontend/dist/` for any static host.

## android/.env

| Key | Purpose |
|---|---|
| `APP_NAME` | Name under the phone icon |
| `SERVER_URL` | Address the app opens (the frontend), e.g. `https://analytics.mrpscan.com`. Empty = this computer's Wi-Fi address. |
| `SERVER_PORT` | Frontend port used when `SERVER_URL` is empty, default 4100 |

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

1. Backend: `npm run setup`, create `backend/.env` with `HOST=127.0.0.1`, `TRUST_LOCALHOST=false`
   and a strong `ANALYTICS_TOKEN`, then run `npm run start:backend` under PM2 or systemd.
2. Frontend: create `frontend/.env` with `API_URL` empty, then `npm run build:frontend`.
3. nginx serves the frontend files and passes `/api` to the backend:

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

The backend and frontend can also live on different servers: set the frontend's `API_URL`
to the backend's address and add the frontend's address to the backend's `CORS_ORIGINS`.
Add https (for example with certbot) so the access key is not sent in plain text.
