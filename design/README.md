# UI redesign (design/)

Simpler UX for the MRPanalytics web app and the Android app (the APK bundles `frontend/src`,
so one UI serves both). The redesigned UI itself lives in `frontend/src`; this folder holds
the notes, screenshots and a no-database preview.

![Home with category dropdown](screenshots/home-dropdown.jpg)
![User detail](screenshots/detail-top.jpg)
![Tables become cards on phones](screenshots/detail-scans-cards.jpg)

## What changed

**Home**
- Compact user cards show only: company, person, mobile, last seen, city and state (plus the category chip). License tag and stats live inside the user (tap the card).
- Scrollable category capsules under the search bar: **Favorite, All, Purchased, Free trial, Inactive**
  plus `+ Category` for your own. Every category can be renamed. All except Favorite and All can be deleted; a deleted
  Purchased / Free trial / Inactive can be brought back from the `+ Category` sheet.
- **Purchased / Free trial / Inactive fill themselves** from each user's license tag every time the list
  loads, so a user moves on their own when their status changes:
  - Purchased: permanent (paid) license
  - Free trial: trial still running
  - Inactive: inactive user, expired license, or finished trial
- The dropdown on each card overrides that (pick any category). `Automatic · <category>` at the bottom
  of the dropdown goes back to automatic. Picking `All` keeps the card out of every category.
- The dropdown is a custom menu (rounded, themed), not the phone's native picker.

**User detail**
- Top bar with a back button; search and categories hide here.
- Profile card: company, person, license and status, mobile, last seen, location. GST, login ID, business type, role, joined and referral code sit under "More details".
- 4 summary tiles (Scans, Credits left, Paid, Invoices).
- 8 tabs in two rows: Overview (scans chart 7/30/90 days, extra numbers, other charts), Timeline, Scans, Payments, Invoices, Wishlist, Team, More
  (More = login history, settings, license payments, gateway events, all stored fields).
- On phones tables turn into cards (no sideways scrolling); technical columns (ids, tokens,
  GST split) are hidden there and still shown on desktop.

**Everywhere**: no seconds in times, friendlier loading and error states (with "Try again").

## Known limits
- Category choices (manual ones, custom categories, renames) are saved per device in `localStorage`.
  Syncing them across devices needs a backend field.
- Checked in a browser against fake data only; not yet run in the Android WebView or against the real database.

## Preview without MongoDB
```bash
node design/preview/dev.js
```
Open http://localhost:4101 (Android-style phone frame; the plain app is on http://localhost:4100).
`frontend/dist` is rebuilt when the server starts. To rebuild while it runs: `API_URL= node frontend/scripts/build.js`
(an empty `API_URL` matters: `frontend/.env` points the browser at the live server).
