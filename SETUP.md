# Setting up Mini Personal Finance Tracker

You do this **once**. It takes about ten minutes, all of it inside
N. Sowdhamini Sasimurugan's own Google account. Nothing in these steps touches
anybody else's Google Drive, and no data ever leaves her account.

The app itself is hosted at
**https://indiabusinessinternational.github.io/MiniPersonalFinanceTracker/** —
that page is only the screen. Every rupee she records lives in her own Google
Sheet.

---

## Step 1 — Create the Google Sheet

1. Sign in to **her** Gmail account.
2. Go to <https://sheets.new> — a blank spreadsheet opens.
3. Rename it (top-left) to **Mini Personal Finance Tracker**.

Leave the tabs alone. The script creates the `Transactions` sheet with the right
headings the first time it runs.

---

## Step 2 — Add the backend script

1. In that Sheet: **Extensions → Apps Script**.
2. Delete whatever is in `Code.gs` (usually an empty `myFunction`).
3. Open **`GAS.gs`** from this app's folder, copy **all** of it, and paste it in.
4. Click the 💾 **Save** icon.
5. Rename the Apps Script project (click "Untitled project" at the top) to
   **Mini Finance Backend** — it makes it findable later.

---

## Step 3 — Set the password

This is the important one. The password is **not** stored in the app; it is
stored here, in her own script, where only she can read it.

1. Still in the Apps Script editor, click **⚙ Project Settings** in the left rail.
2. Scroll to **Script Properties** → **Add script property**.
3. Enter:

   | Property | Value |
   |---|---|
   | `APP_PASSWORD` | the password she will type into the app |
   | `APP_USER` | `Sowdhamini` *(optional — this is the default anyway)* |

4. Click **Save script properties**.

**Choose a real password.** Eight characters or more, not a birthday. Write it
down somewhere she can find it — there is no reset link; if it is lost you just
edit this property again.

> To check it later without revealing it: in the editor pick the `checkSetup`
> function from the dropdown, press **Run**, and read the execution log. It
> reports whether the password is set and how long it is, never what it is.

---

## Step 4 — Deploy it as a Web app

1. Top-right: **Deploy → New deployment**.
2. Click the ⚙ next to "Select type" and choose **Web app**.
3. Fill in:
   - **Description**: `v1`
   - **Execute as**: **Me** (her own address)
   - **Who has access**: **Anyone**
4. **Deploy**.
5. Google asks for authorisation the first time:
   **Review permissions → choose her account → Advanced → Go to Mini Finance
   Backend (unsafe) → Allow**.
   That warning appears for every personal script that is not on Google's paid
   review list. It is her own code, running on her own Sheet.
6. Copy the **Web app URL**. It looks like:

   ```
   https://script.google.com/macros/s/AKfycb..................../exec
   ```

   It must end in **`/exec`**. The `/dev` link only works while she is signed
   into the editor and will fail on her phone.

> **"Who has access: Anyone" — is that safe?** Anyone who guesses that URL can
> reach the script, but the script answers nothing without the password. That
> setting only means "do not demand a Google login first", which is what lets
> the app work on her phone without an OAuth dance. The gate is `APP_PASSWORD`.

---

## Step 5 — Open the app and connect

On **each** device (her phone, her laptop):

1. Open <https://indiabusinessinternational.github.io/MiniPersonalFinanceTracker/>
2. Paste the `/exec` URL into **Connect your Google Sheet** → **Connect**.
3. Sign in: username `Sowdhamini`, and the password from Step 3.

That is it. She stays signed in for **30 days** per device before it asks again.

---

## Step 6 — Install it as an app

Open the **☰ menu → Install on this Device**. The app works out which browser
she is using and either installs itself or shows her the exact steps for it.

If you would rather do it by hand:

**Android (Chrome)** — tap **Install App** on the banner, or ⋮ menu →
*Add to Home screen*.

**iPhone / iPad** — this must be done in **Safari**: the Share button
<kbd>⌴</kbd> at the bottom → **Add to Home Screen** → **Add**. Chrome, Edge and
Firefox on iOS cannot do it; they only make a bookmark that reopens the browser.
There is no one-tap install button on iOS — Apple does not provide one, so this
is how every app-like site is added on an iPhone.

**Laptop (Chrome/Edge)** — the install icon in the address bar, or the
**Install** button in the app's top bar.

**Mac (Safari)** — File menu → **Add to Dock** (macOS Sonoma or newer).

> If she opens the link from inside WhatsApp or Instagram, the page runs in that
> app's own mini-browser, which cannot install anything. Use its menu →
> **Open in browser** first.

Once installed it opens like a normal app — full screen, its own **NSS** icon,
no browser bar — and it opens straight to her last-saved ledger even with no
signal.

---

## Updating the backend (needed for v1.3 — profile sync)

The app on GitHub updates itself. The Apps Script does **not** — it is a copy
living in her account, so a new feature that needs backend support has to be
pasted in again.

**Required for v2.0.** The **Plan** and **Commitments** sections save into two
new sheets, and **Paid by / Mode** into two new columns on `Transactions`. All
of them are created automatically the first time the new script runs, and
nothing already in the Sheet is moved or renumbered.

Until this is done the app says so at the top of those two sections and offers
an *I have done it — check again* button. The Ledger and the reports keep
working throughout; only the new sections wait.

Profile sync (name, subtitle and photo shared across her devices) needs this
too — without it a photo set on the laptop stays on the laptop.

1. Open her Sheet → **Extensions → Apps Script**.
2. Select everything in the editor and paste in the current **`GAS.gs`**.
3. 💾 **Save**.
4. **Deploy → Manage deployments** → pencil ✏ on the existing deployment →
   **Version: New version** → **Deploy**.

> Use **Manage deployments → New version**, not *New deployment*. A new
> deployment gets a **different URL**, and every device would have to be
> reconnected. Editing the existing one keeps the URL she already has.

The script adds these sheets on first use:

| Sheet | What is in it |
|---|---|
| `Transactions` | the ledger — gains a **PaidBy** and a **Mode** column in v2.0 |
| `Commitments` | the standing list: savings, schemes, loans, fees, bills |
| `Plans` | one row per item per month — proposed, actual, due, paid |
| `Settings` | hidden; holds the profile. To see it, right-click any sheet tab → *Show sheets*. |

They are hers to read and to correct by hand. Keep the `ID` column of each
intact — it is how the app finds a row.

One figure is worth knowing about: a loan's **Outstanding** is an *opening*
balance. The app shows it less every instalment ticked off here. If the bank's
number moves for another reason — interest, a part-payment made elsewhere —
type the bank's current figure into the loan and it re-bases from there.

## Day-to-day notes

- **Changing the password**: edit `APP_PASSWORD` in Script Properties. Devices
  already signed in stay signed in — run the `signOutAllDevices` function from
  the editor if you want to force everyone out.
- **Forgot the password**: there is nothing to recover; set a new value in
  Script Properties.
- **Editing rows directly**: the Sheet is hers to edit. Keep the `ID` column
  intact — it is how the app finds a row to update or delete.
- **Backup**: the Sheet is the master copy and Google versions it
  (File → Version history). The **CSV** button in the app exports a copy too.
- **Changing the app code later**: after a redeploy in Apps Script, choose
  **Manage deployments → edit → Version: New version**, otherwise the old code
  keeps serving the same URL.

---

## If something goes wrong

| What she sees | What it means |
|---|---|
| *"That is not a deployment link"* | The URL does not end in `/exec`. Copy it again from Deploy → Manage deployments. |
| *"That link answered, but it is not a Mini Personal Finance Tracker backend"* | Some other Apps Script is deployed at that URL. Re-paste `GAS.gs` and deploy a **new version**. |
| *"Connected — but no password is set yet"* | Step 3 was skipped. Add `APP_PASSWORD` in Script Properties. |
| *"Wrong username or password"* | The username must match `APP_USER` (default `Sowdhamini`), and the password must match `APP_PASSWORD` exactly — including case. |
| *"Could not reach that link"* | No internet, or **Who has access** is not set to **Anyone**. |
| *"Session expired"* | Normal after 30 days. Sign in again. |
| *"Offline — this is the last copy saved on this device"* | No connection. She can read everything, but a new entry will not save until the signal is back. |
