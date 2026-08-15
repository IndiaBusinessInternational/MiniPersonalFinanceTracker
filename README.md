# Mini Personal Finance Tracker

**Live:** <https://indiabusinessinternational.github.io/MiniPersonalFinanceTracker/>

A private income, expense, credit and settlement ledger for
**N. Sowdhamini Sasimurugan**, with an eight-tab financial analysis pack.
Installable as an app on phone and laptop, and readable offline.

Cloned from **IBI Personal Finance Tracker** v5.1, rebuilt around a backend that
lives in her own Google account and is protected by a password held in Apps
Script Properties.

**→ First-time setup: [SETUP.md](SETUP.md)**

---

## How it is put together

| Layer | Where it lives |
|---|---|
| The app | Static HTML/CSS/JS on GitHub Pages, in this repo. No build step, no framework, no bundler. |
| Her data | A Google Sheet in **her own** Google account. |
| The API | An Apps Script Web app (`GAS.gs`), bound to that Sheet, deployed from **her own** account. |
| The password | `APP_PASSWORD` in that script's **Script Properties**. Never in this repo, never in the page. |

The two halves are deliberately separate: this repo is public and holds no
secret and no data, so hosting it on the India Business International GitHub
account gives nobody any access to her ledger.

### Why the password is checked in Apps Script

A browser cannot keep a secret. To have a page check a password you must first
hand the page the answer, and anything handed to the page can be read by anyone
who opens it — View Source is enough. So the page only forwards what was typed.
Her Apps Script — private to her account — does the comparison and returns a
30-day session token. Every call after sign-in carries only that token.

---

## Files

```
index.html               the whole app — markup, styles and logic in one file
sw.js                    service worker: offline shell + update notice
manifest.json            PWA manifest (installable, standalone, NSS icons)
GAS.gs                   the Apps Script backend — paste into HER Apps Script editor
icon-192/512.png         launcher icons
icon-maskable-512.png    Android adaptive icon (content inside the middle 80%)
apple-touch-icon.png     iOS home-screen tile — iOS ignores the manifest
favicon.ico, favicon-32  browser tab
og-banner.png            1200×630 social preview
SETUP.md                 step-by-step first-time setup
```

`GAS.gs` is **not** executed by this repo. It is a copy of the code that has to
be pasted into her Apps Script editor — keep the two in step by hand, and after
editing it there always redeploy as a **new version**.

---

## What it records

Four kinds of entry, which is what makes the totals honest:

- **Income** — money in.
- **Expense** — money out, paid on the spot.
- **Credit** — taken now, not paid for yet (the daily milk). Real spend on the
  day it happens, and it raises what is owed to that party.
- **Settlement** — money paid to clear what is already owed. Deliberately **not**
  counted as spend a second time; the expense was booked by the credit entries.

Party balances (credit taken − settled) are shown per party, and only
credit/settlement rows form a balance — a cash expense is square the moment it
happens and must never look like a debt.

## Financial Analysis

Eight tabs over any period — Indian financial year, Apr–Mar, quarters following
it — with an optional like-for-like comparison against the previous window of
the same length:

Overview (12 KPIs) · Statement (cash book with running balance) · Trends
(auto-bucketed, inline SVG charts — no chart library, because the app must work
offline) · Categories · Parties (ABC/Pareto) · Payables (FIFO ageing) ·
Recurring · Insights with a data-quality audit.

Print/PDF and CSV carry every section, not only the visible tab.

Categories are derived from the description, party and note rather than asked
for a second time — the rules are first-match-wins and side-aware (`in`/`out`),
which is what stops a tenant named "Provision Shop" being read as groceries.

---

## Changes from the app it was cloned from

- **Backend is not baked in.** A Connect screen asks for her own `/exec` URL and
  keeps it per device, so nothing here points at anybody else's Sheet.
- **Password gate**, verified server-side against Script Properties, issuing a
  30-day token. The original had no gate at all.
- **Profile is editable in the app** — name, subtitle and photo. The original
  carried a 360 KB JPEG hard-coded into the page; dropping it makes this build
  **64% smaller** and lets her set her own picture from her phone.
- **Offline read.** The last good sync is kept locally and painted immediately
  on open, with an explicit banner saying new entries will not save until the
  connection is back.
- **Service worker precaches with `cache: 'reload'`**, so a version bump cannot
  ship yesterday's file under today's cache name.
- **Backend hardening**: `LockService` on every write, one `setValues` per
  update instead of six round trips, blank rows skipped on read, and dates
  formatted in the Sheet's own timezone so a cell parsed as a real date cannot
  drift a day.
- Escape closes dialogs, the sign-in form is a real `<form>` with proper
  `autocomplete` so password managers work, and safe-area insets keep the
  installed app clear of the gesture bar.

---

## Installing it as an app

**Menu → Install on this Device.** That option is always present, on every
browser — which is the point of it.

Only Chromium browsers fire `beforeinstallprompt`, so an install button gated on
that event is invisible on iOS, where Safari installs through
Share → Add to Home Screen and offers no API at all. Gating it that way would
hide the install path on exactly the device she uses most. So:

- **Chromium (Android Chrome, desktop Chrome/Edge)** — the dialog shows a real
  **Install now** button wired to the captured prompt.
- **Everything else** — the dialog names the browser and gives its actual steps:
  iOS Safari, iOS Chrome/Firefox (which must be sent to Safari), Samsung
  Internet, Android Firefox, macOS Safari's *Add to Dock*, and the in-app
  webviews (Instagram, Facebook, WhatsApp) where installing is impossible and
  the only fix is *Open in browser*.
- **Already installed** — it says so, but never dead-ends there. Deleting an app
  does not notify an open page, and on Android removing the home-screen icon can
  leave the app installed, so the detection is a hint for wording only. A
  **Deleted it? Install it again** button always reveals the manual steps.
  A live `beforeinstallprompt` outranks the hint entirely: a browser does not
  offer to install something it already has.
- **iOS Safari** also gets a permanent top-bar Install button and a one-off
  banner a week apart, because iOS gives no other hint that this is possible.

Icons are real PNGs, including a `maskable` variant with its content inside the
middle 80% for Android's adaptive shapes, and an `apple-touch-icon` — without
that last one iOS uses a **screenshot of the page** as the home-screen tile.

## Version

**v1.2** — August 2026. The mark reads **Mini** everywhere (app monogram, not
the user's initials — it no longer follows the display name), icons regenerated
to match. Install detection no longer treats F11 fullscreen as "installed" and
can always be overridden. Top bar no longer collides its version badge with the
theme switch at phone widths.

**v1.1** — August 2026. Install-as-an-app flow for every browser, real PNG icon
set, `apple-touch-icon`.

**v1.0** — August 2026. First release.

The badge next to the app name in the top bar, the drawer's About line, the
footer, the gate subtitle and `CACHE` in `sw.js` must all move together on a
release.
