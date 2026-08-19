# Mini Personal Finance Tracker

**Live:** <https://indiabusinessinternational.github.io/MiniPersonalFinanceTracker/>

A private household finance app for **N. Sowdhamini Sasimurugan** in three
parts, matching the way her diary is actually kept:

- a **Ledger** of income, expense, credit and settlement;
- a **Monthly Plan** of proposed against actual, ticked off as the month goes;
- a standing list of **Commitments** — savings schemes, gold scheme, loans,
  EMIs, term fees and monthly bills, each with its own instalment count and
  running total.

On top of all three sits an eleven-tab financial analysis pack. Installable as
an app on phone and laptop, and readable offline.

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

## The three sections

A tab bar switches between them — pinned to the bottom of the screen on a
phone, where the thumb is, and sitting under the hero as a normal tab strip on
a computer.

### Ledger
What actually happened. The four entry types below, plus **Paid by** and
**Mode** — the diary's Remarks column ("NSM", "TSM", "Cash", "GPay") split into
the two facts it was carrying: who settled it, and how. Written into the free
text note they could be read but never totalled.

### Monthly Plan
The diary page kept as data: one row per item per month, with Proposed against
Actual, a due date, and a status. **Fill from commitments** writes the month's
standing items in one call and is idempotent, so pressing it twice does not
double the month; **Copy last month** brings the rest forward, proposing last
month's *actual* because that is what the thing really costs.

Marking a line paid asks for the amount **once** and writes both the plan's
Actual column and the ledger entry, so the two can never drift apart by a typo.
Untick *Also record it in my ledger* when somebody else's money paid for it —
the gas cylinder TSM settled still counts in the plan, but is not her spending.
Undo offers to remove the ledger entry it created, because leaving it behind is
how one rupee gets counted twice.

### Commitments
Everything that comes round again: a recurring deposit, the gold scheme
(1 gram a month for 12), a car loan, insurance, school fees by term, the fibre
bill. Each holds only its *opening* position — what had already been paid before
this app existed. The instalment count, the running total, the grams held and
the loan's outstanding balance are all **counted from the plan rows every time
they are shown**, so a payment recorded on the phone and one recorded on the
laptop cannot leave two different counters behind.

The editor asks only for the fields the chosen kind actually has: a fibre bill
has no instalment count and a loan has no grams.

---

## Financial Analysis

Eleven tabs over any period — Indian financial year, Apr–Mar, quarters following
it — with an optional like-for-like comparison against the previous window of
the same length:

Overview (12 KPIs plus the standing position) · **Budget** (plan vs actual,
line by line) · **Savings** (schemes, progress, what is being built up) ·
**Loans** (what is still owed and when each one closes) · Statement (cash book
with running balance) · Trends (auto-bucketed, inline SVG charts — no chart
library, because the app must work offline) · Categories · Parties
(ABC/Pareto) · Payables (FIFO ageing) · Recurring · Insights with a
data-quality audit.

### How the budget variance is stated

Two conventions are followed, and both matter:

1. **Favourable / adverse is not symmetrical.** On a cost line, spending *less*
   than planned is favourable; on an income line, receiving less is adverse.
   The two are never netted into one signed number.
2. **Mid-month, the headline compares only what is settled.** Half way through
   August, planned-versus-spent says "under budget by ₹27,000" when the truth
   is that the car loan has not gone out yet — a figure that reads as good news
   right up until the money leaves. The headline therefore compares what the
   *settled* lines were planned to cost against what they did cost, and reports
   the unspent remainder separately. Once every line is closed, the two
   readings coincide and the report says so.

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

## Profile sync

Display name, subtitle and photo live in the Sheet, not on the device — a photo
set on the laptop has to reach the phone, and `localStorage` is per-browser.

They are kept in a hidden **Settings** sheet as key/value rows. A Sheet cell
holds 50,000 characters, which is why the photo goes there rather than into
Script Properties (9 KB a value). The picture is centre-cropped square and
re-encoded down the ladder `320@0.85 → 288 → 256 → 224 → 192@0.55` until the
data URL is under 40,000 characters; even pure noise, the worst case for JPEG,
lands around 36,000.

Traffic is kept honest with a version stamp:

- **`login`** returns the whole profile, so a new device paints her name and
  photo on its first screen with no extra round trip.
- **`getAll`** returns only `profileAt`, a number. The app fetches the profile —
  and therefore the photo — only when that stamp has moved.
- **Saving** writes the device copy first, so the screen never waits on the
  network, then pushes.

If her Apps Script predates this (`Unknown action: saveProfile`), the save still
lands locally and the app says the backend needs updating, because that is a
paste-and-redeploy she has to do — see [SETUP.md](SETUP.md).

## Version

**v2.0** — August 2026. **Monthly Plan** and **Commitments** sections, **Paid by**
and **Mode** on every transaction, and three new report tabs (Budget, Savings,
Loans) carried through to the print pack and the CSV.
**Requires re-pasting `GAS.gs` and redeploying as a New version** — the new
sections save into two new sheets (`Plans`, `Commitments`) and two new columns
on `Transactions`, all created automatically on first run. Until that is done
the app says so plainly at the top of the two new sections rather than failing
at Save; the Ledger keeps working throughout.

**v1.3** — August 2026. Profile (name, subtitle, photo) syncs across her devices
through the Sheet. **Requires re-pasting `GAS.gs` and redeploying.**

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
