/* ═══════════════════════════════════════════════════════════════════════════
   Mini Personal Finance Tracker — Google Apps Script backend  v1.0
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

   ── Why the password lives here and not in the page ────────────────────────
   The web app is a public static page; anything shipped in its JavaScript is
   readable by anyone who opens it. A browser cannot be trusted to check a
   secret, because to check it you must first hand it the answer. So the page
   only forwards what was typed, and THIS script — private to her account —
   is the thing that compares it. Nothing else here answers without a token
   this script issued.
   ═════════════════════════════════════════════════════════════════════════ */

const APP_NAME    = 'MPFT';                 // identifies this backend to the app
const APP_VERSION = '1.0';
const SHEET_NAME  = 'Transactions';
const HEADERS     = ['ID', 'Date', 'Type', 'Description', 'Party', 'Amount', 'Note', 'CreatedAt'];

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
      case 'getAll': return getAllTransactions();
      case 'add':    return addTransaction(p);
      case 'update': return updateTransaction(p);
      case 'delete': return deleteTransaction(p.id);
      case 'logout': return logout(p.token);
      default:       return { status: 'error', message: 'Unknown action: ' + action };
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

  return {
    status: 'ok',
    token: token,
    expires: now + TOKEN_TTL_MS,
    user: wantUser,
    sheetUrl: sheetUrl(),
    app: APP_NAME,
    version: APP_VERSION
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
  Logger.log('Rows         : ' + Math.max(0, getSheet().getLastRow() - 1));
}

/* Wipes every signed-in device. Run it if a password is ever changed or
   suspected — changing APP_PASSWORD alone does not end live sessions. */
function signOutAllDevices() {
  writeSessions({});
  Logger.log('All sessions cleared. Every device must sign in again.');
}

/* ── SHEET ──────────────────────────────────────────────────────────────── */

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#000000')
      .setFontColor('#00c5ff');
    [130, 100, 90, 240, 170, 100, 210, 150].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  }
  return sh;
}

function sheetUrl() {
  try { return SpreadsheetApp.getActiveSpreadsheet().getUrl(); } catch (e) { return ''; }
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

function getAllTransactions() {
  const sh = getSheet();
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || 'Asia/Kolkata';
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return { status: 'ok', transactions: [] };

  const rows = data.slice(1)
    .filter(function (r) { return String(r[0] || '').trim() !== ''; })   // ignore blank rows
    .map(function (r) {
      return {
        id:          String(r[0]),
        date:        toISODate(r[1], tz),
        type:        r[2],
        description: r[3],
        party:       r[4],
        amount:      parseFloat(r[5]) || 0,
        note:        r[6] || '',
        createdAt:   r[7] || ''
      };
    });

  return { status: 'ok', transactions: rows };
}

function addTransaction(p) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {
    return { status: 'error', message: 'Busy — please try again in a moment.' };
  }
  try {
    const sh  = getSheet();
    const id  = 'TX' + Date.now();
    const now = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd-MMM-yyyy HH:mm:ss');

    sh.appendRow([
      id,
      p.date || '',
      p.type || 'income',
      p.description || '',
      p.party || '',
      parseFloat(p.amount) || 0,
      p.note || '',
      now
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
        // One setValues call — six single-cell writes are six round trips.
        sh.getRange(i + 1, 2, 1, 6).setValues([[
          p.date || '',
          p.type || 'income',
          p.description || '',
          p.party || '',
          parseFloat(p.amount) || 0,
          p.note || ''
        ]]);
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
  if (!id) return { status: 'error', message: 'No ID provided.' };

  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {
    return { status: 'error', message: 'Busy — please try again in a moment.' };
  }
  try {
    const sh   = getSheet();
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
