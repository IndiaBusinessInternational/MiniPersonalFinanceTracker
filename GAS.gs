/* ═══════════════════════════════════════════════════════════════════════════
   Mini Personal Finance Tracker — Google Apps Script backend  v2.0
   For: N. Sowdhamini Sasimurugan
   ───────────────────────────────────────────────────────────────────────────
   This script is BOUND to her own Google Sheet, in her own Google account.
   Open the Sheet → Extensions → Apps Script → paste this file → Save.

   BEFORE DEPLOYING, set the password:
     Apps Script editor → ⚙ Project Settings → Script Properties → Add
        Property : APP_PASSWORD     Value : <the password she will type>
        Property : APP_USER         Value : Sowdhamini        (optional)

   Then: Deploy → New deployment → Web app
        Execute as        : Me (her own account)
        Who has access    : Anyone
   Copy the /exec URL and paste it into the app's Connect screen.

   ⚠ UPDATING FROM v1.x
   After pasting this file: Deploy → Manage deployments → ✏ edit → Version:
   NEW VERSION → Deploy.  Use "New version", NOT "New deployment" — a new
   deployment issues a different /exec URL and every signed-in device is cut
   off until it is re-connected by hand.

   What v2.0 adds, and why it needs new storage:
     • Commitments — the standing list from her diary: savings schemes, RD,
       gold scheme, loans, EMIs, school fees, monthly bills. Each one carries
       its own instalment counter (2 of 60), its running total paid, and for a
       loan its outstanding balance.
     • Monthly Plan — the diary's Proposed vs Actual page, one row per item
       per month, so a month can be planned before it is spent and reported
       against afterwards.
     • Paid By / Mode on a transaction — the diary's Remarks column (NSM, TSM,
       Cash, GPay). It was being written into the free-text note, where nothing
       could total it.
   All three are new columns or new sheets. They are created automatically the
   first time this version runs; nothing already in the Sheet is moved.
   ═════════════════════════════════════════════════════════════════════════ */

const APP_NAME    = 'MPFT';                 // identifies this backend to the app
const APP_VERSION = '2.0';
// Lets the app detect what this backend can do, so a page newer than the
// deployment can say "update your Apps Script" instead of failing oddly.
const FEATURES    = ['profile', 'plans', 'commitments', 'paidby'];

const SHEET_NAME  = 'Transactions';
/* PaidBy and Mode are appended AFTER CreatedAt rather than inserted in the
   middle: an existing sheet keeps every column exactly where it was, so a
   formula or a filter she has set up by hand in the Sheet still points at the
   same thing. Order in the Sheet is not the order in the form. */
const HEADERS     = ['ID', 'Date', 'Type', 'Description', 'Party', 'Amount', 'Note', 'CreatedAt',
                     'PaidBy', 'Mode'];

const COMMIT_SHEET = 'Commitments';
const COMMIT_HDRS  = ['ID', 'Name', 'Kind', 'Category', 'Party', 'Amount', 'DueDay', 'Freq',
                      'StartMonth', 'TotalInst', 'OpeningInst', 'OpeningPaid', 'Principal',
                      'Outstanding', 'Unit', 'UnitPerInst', 'OpeningUnits', 'PayMode',
                      'Active', 'Note', 'CreatedAt'];

const PLAN_SHEET = 'Plans';
const PLAN_HDRS  = ['ID', 'Month', 'Side', 'CommitmentId', 'Item', 'Category', 'Party',
                    'Proposed', 'Actual', 'DueDate', 'PaidDate', 'Status', 'PayMode',
                    'PaidBy', 'TxId', 'Note', 'Sort', 'CreatedAt'];

/* Profile (display name, subtitle, photo) lives in the Sheet, not on the
   device — otherwise a photo set on the laptop never reaches the phone.
   A Sheet cell holds 50,000 characters, which is why the photo is capped
   below that rather than being stored in Script Properties (9 KB a value). */
const SETTINGS_SHEET = 'Settings';
const MAX_SETTING    = 45000;

const TOKEN_TTL_MS   = 30 * 24 * 60 * 60 * 1000;  // stay signed in for 30 days
const MAX_SESSIONS   = 25;                        // her phone + laptop + a few re-logins
const SESSIONS_KEY   = 'SESSIONS';
const DEFAULT_USER   = 'Sowdhamini';

/* ── ROUTER ─────────────────────────────────────────────────────────────────
   Everything travels by GET query parameters. Apps Script web apps answer a
   POST with a 302 to googleusercontent.com, which fetch() re-issues as a GET
   and so drops the body — GET sidesteps that whole class of failure. doPost
   stays as a fallback and merges any parsed body over the query params.      */
function doGet(e)  { return respond(route((e && e.parameter) || {})); }

function doPost(e) {
  const p = (e && e.parameter) || {};
  try {
    if (e && e.postData && e.postData.contents) {
      const body = JSON.parse(e.postData.contents);
      Object.keys(body).forEach(function (k) { p[k] = body[k]; });
    }
  } catch (err) { /* not JSON — the query params stand on their own */ }
  return respond(route(p));
}

function respond(result) {
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function route(p) {
  const action = String(p.action || '');
  try {
    // Open actions — no token needed.
    if (action === 'ping')  return ping();
    if (action === 'login') return login(p);

    // Everything below is gated.
    const auth = checkToken(p.token);
    if (!auth.ok) return { status: 'auth', message: auth.message };

    switch (action) {
      case 'getAll':           return getAllData();
      case 'add':              return addTransaction(p);
      case 'update':           return updateTransaction(p);
      case 'delete':           return deleteTransaction(p.id);

      case 'saveCommitment':   return saveCommitment(p);
      case 'deleteCommitment': return deleteRowById(COMMIT_SHEET, COMMIT_HDRS, p.id);

      case 'savePlan':         return savePlan(p);
      case 'savePlans':        return savePlans(p);
      case 'deletePlan':       return deleteRowById(PLAN_SHEET, PLAN_HDRS, p.id);

      case 'getProfile':       return getProfile();
      case 'saveProfile':      return saveProfile(p);
      case 'logout':           return logout(p.token);
      default:                 return { status: 'error', message: 'Unknown action: ' + action };
    }
  } catch (err) {
    return { status: 'error', message: String(err && err.message ? err.message : err) };
  }
}

/* ── HEALTH CHECK ───────────────────────────────────────────────────────────
   The Connect screen calls this to prove the URL really is this backend
   before it lets her move on. `configured:false` means the password property
   was never added, and the app says so plainly instead of failing at login. */
function ping() {
  return {
    status: 'ok',
    app: APP_NAME,
    version: APP_VERSION,
    features: FEATURES,
    configured: !!scriptPassword(),
    user: scriptUser(),
    message: 'Mini Personal Finance Tracker backend v' + APP_VERSION + ' is live.'
  };
}

/* ── AUTH ───────────────────────────────────────────────────────────────── */

function scriptPassword() {
  const v = PropertiesService.getScriptProperties().getProperty('APP_PASSWORD');
  return v == null ? '' : String(v);
}

function scriptUser() {
  const v = PropertiesService.getScriptProperties().getProperty('APP_USER');
  return (v == null || String(v).trim() === '') ? DEFAULT_USER : String(v).trim();
}

/* Constant-time-ish compare. Apps Script gives us no crypto.timingSafeEqual,
   but comparing every character regardless of where the first mismatch falls
   costs nothing and removes the easy timing signal. */
function sameSecret(a, b) {
  a = String(a == null ? '' : a);
  b = String(b == null ? '' : b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readSessions() {
  const raw = PropertiesService.getScriptProperties().getProperty(SESSIONS_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
}

function writeSessions(map) {
  PropertiesService.getScriptProperties().setProperty(SESSIONS_KEY, JSON.stringify(map));
}

function login(p) {
  const pw = scriptPassword();
  if (!pw) {
    return {
      status: 'error',
      message: 'This backend has no password yet. In the Apps Script editor open ' +
               'Project Settings → Script Properties and add APP_PASSWORD.'
    };
  }
  const wantUser = scriptUser();
  const gotUser  = String(p.user == null ? '' : p.user).trim();

  // The username is a label, not a second secret — but a blank one is still
  // a typo worth naming, and a wrong one must not leak which half was wrong.
  if (!sameSecret(pw, p.pw) || gotUser.toLowerCase() !== wantUser.toLowerCase()) {
    Utilities.sleep(600);                       // blunt the speed of guessing
    return { status: 'error', message: 'Wrong username or password.' };
  }

  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const now   = Date.now();

  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { /* proceed unlocked rather than fail login */ }
  try {
    const map = readSessions();
    // Drop anything expired, then keep only the newest MAX_SESSIONS.
    const live = {};
    Object.keys(map).forEach(function (t) { if (Number(map[t]) > now) live[t] = Number(map[t]); });
    live[token] = now + TOKEN_TTL_MS;
    const keys = Object.keys(live).sort(function (a, b) { return live[b] - live[a]; });
    const trimmed = {};
    keys.slice(0, MAX_SESSIONS).forEach(function (t) { trimmed[t] = live[t]; });
    writeSessions(trimmed);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }

  // The profile rides along with the login so a brand-new device paints her
  // name and photo on its very first screen, with no extra round trip.
  const prof = getProfile();

  return {
    status: 'ok',
    token: token,
    expires: now + TOKEN_TTL_MS,
    user: wantUser,
    sheetUrl: sheetUrl(),
    app: APP_NAME,
    version: APP_VERSION,
    features: FEATURES,
    profile: prof.profile,
    profileAt: prof.profileAt
  };
}

function checkToken(token) {
  const t = String(token == null ? '' : token).trim();
  if (!t) return { ok: false, message: 'Please sign in.' };
  const map = readSessions();
  const exp = Number(map[t] || 0);
  if (!exp)             return { ok: false, message: 'Session not recognised — please sign in again.' };
  if (exp < Date.now()) return { ok: false, message: 'Session expired — please sign in again.' };
  return { ok: true };
}

function logout(token) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) {}
  try {
    const map = readSessions();
    delete map[String(token || '').trim()];
    writeSessions(map);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
  return { status: 'ok', message: 'Signed out.' };
}

/* Run this by hand from the editor after setting the property — it reports
   whether the password is in place without ever printing it. */
function checkSetup() {
  const pw = scriptPassword();
  Logger.log('APP_PASSWORD : ' + (pw ? 'set (' + pw.length + ' characters)' : 'NOT SET — add it in Project Settings'));
  Logger.log('APP_USER     : ' + scriptUser());
  Logger.log('Sheet        : ' + sheetUrl());
  Logger.log('Backend      : v' + APP_VERSION);
  Logger.log('Transactions : ' + Math.max(0, getSheet().getLastRow() - 1));
  Logger.log('Commitments  : ' + Math.max(0, getNamedSheet(COMMIT_SHEET, COMMIT_HDRS).getLastRow() - 1));
  Logger.log('Plan rows    : ' + Math.max(0, getNamedSheet(PLAN_SHEET, PLAN_HDRS).getLastRow() - 1));
}

/* Wipes every signed-in device. Run it if a password is ever changed or
   suspected — changing APP_PASSWORD alone does not end live sessions. */
function signOutAllDevices() {
  writeSessions({});
  Logger.log('All sessions cleared. Every device must sign in again.');
}

/* ── SHEET PLUMBING ─────────────────────────────────────────────────────────
   One helper builds every data sheet, so a new sheet added in a later version
   gets the same frozen header row, the same styling, and — the part that
   matters on an upgrade — the same "append any header this version added"
   migration. Columns are only ever appended, never renumbered.             */
function getNamedSheet(name, headers, widths) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    styleHeader(sh, headers.length);
    if (widths) widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
    return sh;
  }
  // Existing sheet from an older version — add only the columns it is missing.
  const have = sh.getLastColumn();
  if (have < headers.length) {
    sh.getRange(1, have + 1, 1, headers.length - have)
      .setValues([headers.slice(have)]);
    styleHeader(sh, headers.length);
  }
  return sh;
}

function styleHeader(sh, n) {
  sh.getRange(1, 1, 1, n)
    .setFontWeight('bold')
    .setBackground('#000000')
    .setFontColor('#00c5ff');
}

function getSheet() {
  return getNamedSheet(SHEET_NAME, HEADERS,
                       [130, 100, 90, 240, 170, 100, 210, 150, 110, 100]);
}

function sheetUrl() {
  try { return SpreadsheetApp.getActiveSpreadsheet().getUrl(); } catch (e) { return ''; }
}

function sheetTZ() {
  try { return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || 'Asia/Kolkata'; }
  catch (e) { return 'Asia/Kolkata'; }
}

function stamp() {
  return Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd-MMM-yyyy HH:mm:ss');
}

/* A date cell can come back as a Date object (Sheets parsed it) or as the
   plain 'yyyy-MM-dd' text we wrote. Formatting a Date in a timezone that is
   not the Sheet's own shifts it by a day, so always format in the Sheet's
   timezone; ISO text is unambiguous everywhere and passes straight through. */
function toISODate(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}

/* A month cell is 'yyyy-MM'. Sheets loves to read that as a date and hand back
   a Date object, which would otherwise come out as '2026-08-01' and no longer
   match the month key the app wrote. */
function toMonthKey(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM');
  const s = String(v == null ? '' : v).trim();
  const m = s.match(/^(\d{4})-(\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) : s;
}

const num = function (v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const str = function (v) { return v == null ? '' : String(v); };
const bool = function (v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return !(s === 'false' || s === 'no' || s === '0' || s === '');
};

/* ── SETTINGS (key/value) ───────────────────────────────────────────────────
   A second, hidden sheet. It is hidden rather than deleted-and-recreated so
   she can still find it if she ever needs to clear a bad value by hand. */
function getSettingsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SETTINGS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SETTINGS_SHEET);
    sh.appendRow(['Key', 'Value', 'UpdatedAt']);
    sh.setFrozenRows(1);
    styleHeader(sh, 3);
    sh.setColumnWidth(1, 140);
    sh.setColumnWidth(2, 420);
    sh.setColumnWidth(3, 170);
    sh.hideSheet();
  }
  return sh;
}

function readSetting(key) {
  const sh = getSettingsSheet();
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === key) return String(rows[i][1] == null ? '' : rows[i][1]);
  }
  return '';
}

function writeSetting(key, value) {
  const sh = getSettingsSheet();
  const rows = sh.getDataRange().getValues();
  const now = stamp();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === key) {
      sh.getRange(i + 1, 2, 1, 2).setValues([[value, now]]);
      return;
    }
  }
  sh.appendRow([key, value, now]);
}

/* ── PROFILE ────────────────────────────────────────────────────────────────
   Display name, subtitle and photo, shared by every device she signs in on.
   `profileAt` is the version stamp: the app sends it back on each sync and
   only downloads the (comparatively heavy) photo when it has actually moved. */
function getProfile() {
  const raw = readSetting('profile');
  let profile = null;
  if (raw) { try { profile = JSON.parse(raw); } catch (e) { profile = null; } }
  return { status: 'ok', profile: profile, profileAt: Number(readSetting('profileAt') || 0) };
}

function saveProfile(p) {
  const raw = String(p.profile == null ? '' : p.profile);
  if (!raw) return { status: 'error', message: 'No profile supplied.' };
  if (raw.length > MAX_SETTING) {
    return { status: 'error',
             message: 'That photo is too large to sync. Please choose a smaller picture.' };
  }
  let obj;
  try { obj = JSON.parse(raw); } catch (e) {
    return { status: 'error', message: 'Profile was not valid JSON.' };
  }
  // Store only the three fields we own, so a future app version cannot be
  // tricked into round-tripping something unexpected through the Sheet.
  const clean = JSON.stringify({
    name:  String(obj.name  || '').slice(0, 120),
    sub:   String(obj.sub   || '').slice(0, 160),
    photo: String(obj.photo || '')
  });

  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {
    return { status: 'error', message: 'Busy — please try again in a moment.' };
  }
  try {
    const at = Date.now();
    writeSetting('profile', clean);
    writeSetting('profileAt', String(at));
    SpreadsheetApp.flush();
    return { status: 'ok', profileAt: at, message: 'Profile saved.' };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/* ── READ EVERYTHING ────────────────────────────────────────────────────────
   One call returns the ledger, the standing commitments and every planned
   month. Three separate round trips would each pay the Apps Script cold-start
   cost, and on a phone that is the whole of the wait.                       */
function getAllData() {
  const tz = sheetTZ();
  return {
    status: 'ok',
    transactions: readTransactions(tz),
    commitments:  readCommitments(),
    plans:        readPlans(tz),
    profileAt:    Number(readSetting('profileAt') || 0),
    version:      APP_VERSION,
    features:     FEATURES
  };
}

function readTransactions(tz) {
  const sh = getSheet();
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1)
    .filter(function (r) { return String(r[0] || '').trim() !== ''; })   // ignore blank rows
    .map(function (r) {
      return {
        id:          String(r[0]),
        date:        toISODate(r[1], tz),
        type:        r[2],
        description: r[3],
        party:       r[4],
        amount:      num(r[5]),
        note:        r[6] || '',
        createdAt:   r[7] || '',
        paidBy:      str(r[8]),
        mode:        str(r[9])
      };
    });
}

function readCommitments() {
  const sh = getNamedSheet(COMMIT_SHEET, COMMIT_HDRS,
                           [130, 220, 100, 160, 150, 100, 70, 100, 100, 90, 100, 110,
                            110, 110, 80, 100, 100, 100, 70, 220, 150]);
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1)
    .filter(function (r) { return String(r[0] || '').trim() !== ''; })
    .map(function (r) {
      return {
        id:           String(r[0]),
        name:         str(r[1]),
        kind:         str(r[2]) || 'bill',
        category:     str(r[3]),
        party:        str(r[4]),
        amount:       num(r[5]),
        dueDay:       num(r[6]),
        freq:         str(r[7]) || 'monthly',
        startMonth:   toMonthKey(r[8], sheetTZ()),
        totalInst:    num(r[9]),
        openingInst:  num(r[10]),
        openingPaid:  num(r[11]),
        principal:    num(r[12]),
        outstanding:  num(r[13]),
        unit:         str(r[14]),
        unitPerInst:  num(r[15]),
        openingUnits: num(r[16]),
        payMode:      str(r[17]),
        active:       bool(r[18]),
        note:         str(r[19]),
        createdAt:    str(r[20])
      };
    });
}

function readPlans(tz) {
  const sh = getNamedSheet(PLAN_SHEET, PLAN_HDRS,
                           [130, 90, 70, 130, 220, 160, 150, 100, 100, 110, 110, 90,
                            100, 110, 130, 220, 70, 150]);
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1)
    .filter(function (r) { return String(r[0] || '').trim() !== ''; })
    .map(function (r) {
      return {
        id:           String(r[0]),
        month:        toMonthKey(r[1], tz),
        side:         str(r[2]) || 'out',
        commitmentId: str(r[3]),
        item:         str(r[4]),
        category:     str(r[5]),
        party:        str(r[6]),
        proposed:     num(r[7]),
        actual:       num(r[8]),
        dueDate:      toISODate(r[9], tz),
        paidDate:     toISODate(r[10], tz),
        status:       str(r[11]) || 'planned',
        payMode:      str(r[12]),
        paidBy:       str(r[13]),
        txId:         str(r[14]),
        note:         str(r[15]),
        sort:         num(r[16]),
        createdAt:    str(r[17])
      };
    });
}

/* ── TRANSACTIONS ───────────────────────────────────────────────────────── */

function addTransaction(p) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {
    return { status: 'error', message: 'Busy — please try again in a moment.' };
  }
  try {
    const sh  = getSheet();
    const id  = 'TX' + Date.now();

    sh.appendRow([
      id,
      p.date || '',
      p.type || 'income',
      p.description || '',
      p.party || '',
      num(p.amount),
      p.note || '',
      stamp(),
      p.paidBy || '',
      p.mode || ''
    ]);
    SpreadsheetApp.flush();
    return { status: 'ok', id: id, message: 'Added successfully.' };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function updateTransaction(p) {
  if (!p.id) return { status: 'error', message: 'No ID provided.' };

  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {
    return { status: 'error', message: 'Busy — please try again in a moment.' };
  }
  try {
    const sh   = getSheet();
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(p.id)) {
        // Two ranges rather than one: column 8 is CreatedAt, which records when
        // the row was first written and must survive every later edit.
        sh.getRange(i + 1, 2, 1, 6).setValues([[
          p.date || '',
          p.type || 'income',
          p.description || '',
          p.party || '',
          num(p.amount),
          p.note || ''
        ]]);
        sh.getRange(i + 1, 9, 1, 2).setValues([[p.paidBy || '', p.mode || '']]);
        SpreadsheetApp.flush();
        return { status: 'ok', message: 'Updated: ' + p.id };
      }
    }
    return { status: 'error', message: 'ID not found: ' + p.id };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function deleteTransaction(id) {
  return deleteRowById(SHEET_NAME, HEADERS, id);
}

/* One deleter for every sheet. Row order carries no meaning in any of them —
   each row is found by its ID — so a plain deleteRow is safe throughout. */
function deleteRowById(name, headers, id) {
  if (!id) return { status: 'error', message: 'No ID provided.' };
  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {
    return { status: 'error', message: 'Busy — please try again in a moment.' };
  }
  try {
    const sh = getNamedSheet(name, headers);
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(id)) {
        sh.deleteRow(i + 1);
        SpreadsheetApp.flush();
        return { status: 'ok', message: 'Deleted: ' + id };
      }
    }
    return { status: 'error', message: 'ID not found: ' + id };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/* ── COMMITMENTS ────────────────────────────────────────────────────────────
   A commitment is the standing thing — "HDFC-NSM RD, ₹5,000 on the 20th, 60
   instalments, 2 already done". The month-by-month record of actually paying
   it lives in Plans; nothing here is rewritten when a payment is made, so the
   instalment count and the running total are always derived from the plan
   rows rather than being a second copy that can drift out of step.         */
function commitmentRow(id, p, createdAt) {
  return [
    id,
    str(p.name).slice(0, 160),
    str(p.kind) || 'bill',
    str(p.category).slice(0, 80),
    str(p.party).slice(0, 120),
    num(p.amount),
    num(p.dueDay),
    str(p.freq) || 'monthly',
    str(p.startMonth),
    num(p.totalInst),
    num(p.openingInst),
    num(p.openingPaid),
    num(p.principal),
    num(p.outstanding),
    str(p.unit).slice(0, 20),
    num(p.unitPerInst),
    num(p.openingUnits),
    str(p.payMode).slice(0, 30),
    bool(p.active) ? 'TRUE' : 'FALSE',
    str(p.note).slice(0, 400),
    createdAt
  ];
}

function saveCommitment(p) {
  if (!String(p.name || '').trim()) {
    return { status: 'error', message: 'A commitment needs a name.' };
  }
  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {
    return { status: 'error', message: 'Busy — please try again in a moment.' };
  }
  try {
    const sh = getNamedSheet(COMMIT_SHEET, COMMIT_HDRS);
    const rows = sh.getDataRange().getValues();
    if (p.id) {
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === String(p.id)) {
          const created = rows[i][COMMIT_HDRS.length - 1] || stamp();
          sh.getRange(i + 1, 1, 1, COMMIT_HDRS.length)
            .setValues([commitmentRow(String(p.id), p, created)]);
          SpreadsheetApp.flush();
          return { status: 'ok', id: String(p.id), message: 'Commitment updated.' };
        }
      }
      return { status: 'error', message: 'Commitment not found: ' + p.id };
    }
    const id = 'CM' + Date.now();
    sh.appendRow(commitmentRow(id, p, stamp()));
    SpreadsheetApp.flush();
    return { status: 'ok', id: id, message: 'Commitment saved.' };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/* ── PLAN ROWS ──────────────────────────────────────────────────────────────
   One row per item per month: what was proposed, what was actually paid, and
   when. This is the diary page, kept as data.                              */
function planRow(id, p, createdAt) {
  return [
    id,
    str(p.month),
    str(p.side) || 'out',
    str(p.commitmentId),
    str(p.item).slice(0, 160),
    str(p.category).slice(0, 80),
    str(p.party).slice(0, 120),
    num(p.proposed),
    num(p.actual),
    str(p.dueDate),
    str(p.paidDate),
    str(p.status) || 'planned',
    str(p.payMode).slice(0, 30),
    str(p.paidBy).slice(0, 80),
    str(p.txId),
    str(p.note).slice(0, 400),
    num(p.sort),
    createdAt
  ];
}

function savePlan(p) {
  if (!String(p.month || '').trim()) return { status: 'error', message: 'A plan row needs a month.' };
  if (!String(p.item  || '').trim()) return { status: 'error', message: 'A plan row needs an item name.' };

  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {
    return { status: 'error', message: 'Busy — please try again in a moment.' };
  }
  try {
    const sh = getNamedSheet(PLAN_SHEET, PLAN_HDRS);
    const rows = sh.getDataRange().getValues();
    if (p.id) {
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === String(p.id)) {
          const created = rows[i][PLAN_HDRS.length - 1] || stamp();
          sh.getRange(i + 1, 1, 1, PLAN_HDRS.length)
            .setValues([planRow(String(p.id), p, created)]);
          SpreadsheetApp.flush();
          return { status: 'ok', id: String(p.id), message: 'Plan updated.' };
        }
      }
      return { status: 'error', message: 'Plan row not found: ' + p.id };
    }
    const id = 'PL' + Date.now();
    sh.appendRow(planRow(id, p, stamp()));
    SpreadsheetApp.flush();
    return { status: 'ok', id: id, message: 'Plan row saved.' };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/* Building a month writes twenty-odd rows at once. Sent one at a time that is
   twenty round trips against a quota shared with every other script on the
   account; here it is one call and one setValues.                          */
function savePlans(p) {
  let list;
  try { list = JSON.parse(String(p.rows || '[]')); }
  catch (e) { return { status: 'error', message: 'Plan rows were not valid JSON.' }; }
  if (!list || !list.length) return { status: 'ok', ids: [], message: 'Nothing to add.' };
  if (list.length > 120) return { status: 'error', message: 'Too many rows in one go.' };

  const lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (e) {
    return { status: 'error', message: 'Busy — please try again in a moment.' };
  }
  try {
    const sh = getNamedSheet(PLAN_SHEET, PLAN_HDRS);
    const now = stamp(), base = Date.now(), ids = [];
    const values = list.map(function (row, i) {
      const id = 'PL' + (base + i);          // +i so a batch cannot collide with itself
      ids.push(id);
      return planRow(id, row, now);
    });
    sh.getRange(sh.getLastRow() + 1, 1, values.length, PLAN_HDRS.length).setValues(values);
    SpreadsheetApp.flush();
    return { status: 'ok', ids: ids, message: values.length + ' rows added.' };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}
