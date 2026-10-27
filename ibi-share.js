/* IBI Share v1.0 (27 Oct 2026): one "Share this app" button + share sheet for every IBI web app.
   Use: <script src="ibi-share.js" defer data-slot="#topbar-actions"></script>
   Optional attributes: data-slot (CSS selector the button is appended to; without it the
   button floats bottom-left), data-name, data-text, data-url (default og:title,
   og:description, og:url). Apps can also call window.IBIShare.open().
   Self-contained: Shadow DOM, no inline <style> in the page, works under CSP script-src 'self'. */
(function () {
  'use strict';
  if (window.IBIShare) return;
  var me = document.currentScript || document.querySelector('script[src*="ibi-share.js"]');
  var ds = (me && me.dataset) || {};
  function meta(p) {
    var m = document.querySelector('meta[property="' + p + '"],meta[name="' + p + '"]');
    return m ? m.getAttribute('content') || '' : '';
  }
  function cfg() {
    var name = ds.name || meta('og:title') || document.title || 'IBI app';
    var text = ds.text || meta('og:description') || meta('description') || name;
    var url = ds.url || meta('og:url') || (location.origin + location.pathname);
    return { name: name, text: text, url: url };
  }

  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",sans-serif}',
    '.btn{width:40px;height:40px;border-radius:50%;border:0;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer;padding:0}',
    '.btn:hover{background:rgba(127,127,127,.18)}',
    '.btn:focus-visible,.o:focus-visible,.x:focus-visible{outline:2px solid #2f80ed;outline-offset:2px}',
    '.btn svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    '.btn.float{position:fixed;left:12px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:2147482000;background:#7F00FF;color:#fff;width:48px;height:48px;box-shadow:0 4px 14px rgba(0,0,0,.3)}',
    '.btn.float:hover{background:#6a00d6}',
    '.back{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center}',
    '.sh{width:100%;max-height:92dvh;overflow:auto;background:var(--bg);color:var(--fg);padding-bottom:env(safe-area-inset-bottom)}',
    '.hd{display:flex;align-items:center;gap:6px;padding:6px 6px 6px 10px;border-bottom:1px solid var(--ln);min-height:52px}',
    '.hd h2{margin:0;font-size:17px;font-weight:700;flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.x{width:44px;height:44px;border:0;border-radius:50%;background:transparent;color:inherit;font-size:24px;line-height:1;cursor:pointer}',
    '.x:hover{background:var(--hv)}',
    '.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr));gap:8px;padding:10px}',
    '.o{display:flex;align-items:center;gap:10px;min-height:48px;padding:10px;border:1px solid var(--ln);border-radius:10px;background:var(--bt);color:inherit;font-size:16px;text-decoration:none;cursor:pointer;text-align:left}',
    '.o:hover{background:var(--hv)}',
    '.o b{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:14px;flex:0 0 auto}',
    '.cw{background:#25D366}.cf{background:#1877F2}.cx{background:#000}.ct{background:#229ED9}.ce{background:#EA4335}.cc{background:#555}.cm{background:#7F00FF}',
    '.u{margin:0 10px 12px;padding:8px 10px;border-radius:8px;background:var(--bt);font-size:14px;overflow-wrap:anywhere;color:var(--mu)}',
    '.t{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483600;background:#222;color:#fff;padding:10px 16px;border-radius:8px;font-size:16px;max-width:calc(100% - 20px)}',
    '.lt{--bg:#fff;--fg:#1b1b1f;--ln:#e3e3e8;--bt:#f6f6f9;--hv:#ececf2;--mu:#555}',
    '.dk{--bg:#1d1f24;--fg:#f2f2f5;--ln:#33363d;--bt:#262930;--hv:#30343c;--mu:#b9bcc4}',
    '@media (min-width:641px){.back{align-items:center}.sh{width:min(520px,calc(100% - 20px));border-radius:14px}}'
  ].join('\n');
  var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';

  function styleInto(root) {
    try {
      var s = new CSSStyleSheet();
      s.replaceSync(CSS);
      root.adoptedStyleSheets = [s];
    } catch (e) {
      var el = document.createElement('style');
      el.textContent = CSS;
      root.appendChild(el);
    }
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function dark() {
    var r = document.documentElement, b = document.body || r;
    var t = (r.getAttribute('data-theme') || b.getAttribute('data-theme') || r.className + ' ' + b.className).toLowerCase();
    if (/\bdark\b/.test(t)) return true;
    if (/\blight\b/.test(t)) return false;
    return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  }

  var host = null, root = null, lastFocus = null, pushed = false;
  function ensureHost() {
    if (host) return;
    host = document.createElement('ibi-share-layer');
    root = host.attachShadow({ mode: 'open' });
    styleInto(root);
    document.body.appendChild(host);
  }
  function toast(msg) {
    ensureHost();
    var t = document.createElement('div');
    t.className = 't';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    root.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }
  function close(fromPop) {
    if (!root) return;
    var b = root.querySelector('.back');
    if (!b) return;
    b.remove();
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('popstate', onPop);
    if (pushed && !fromPop) { pushed = false; history.back(); }
    pushed = false;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') {
      var f = root.querySelectorAll('.back button,.back a');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1], a = root.activeElement;
      if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    }
  }
  function onPop() { close(true); }

  function open(opts) {
    var c = cfg();
    if (opts) { c.name = opts.name || c.name; c.text = opts.text || c.text; c.url = opts.url || c.url; }
    ensureHost();
    close();
    lastFocus = document.activeElement;
    var q = encodeURIComponent, both = q(c.text + '\n' + c.url);
    function ext(href, cls, sym, label) {
      return '<a class="o" href="' + href + '" target="_blank" rel="noopener"><b class="' + cls + '">' + sym + '</b>' + label + '</a>';
    }
    var html = '<div class="back ' + (dark() ? 'dk' : 'lt') + '"><div class="sh" role="dialog" aria-modal="true" aria-labelledby="ibiShT">' +
      '<div class="hd"><h2 id="ibiShT">Share ' + esc(c.name) + '</h2><button type="button" class="x" aria-label="Close" title="Close (Esc)">\u2715</button></div>' +
      '<div class="g">' +
      ext('https://wa.me/?text=' + both, 'cw', '\u2706', 'WhatsApp') +
      ext('https://www.facebook.com/sharer/sharer.php?u=' + q(c.url), 'cf', 'f', 'Facebook') +
      ext('https://x.com/intent/post?text=' + q(c.text) + '&url=' + q(c.url), 'cx', 'X', 'X') +
      ext('https://t.me/share/url?url=' + q(c.url) + '&text=' + q(c.text), 'ct', '\u2708', 'Telegram') +
      ext('mailto:?subject=' + q(c.name) + '&body=' + both, 'ce', '@', 'Email') +
      '<button type="button" class="o" data-k="copy"><b class="cc">\u29c9</b>Copy link</button>' +
      (navigator.share ? '<button type="button" class="o" data-k="more"><b class="cm">\u22ef</b>More apps</button>' : '') +
      '</div><div class="u">' + esc(c.url) + '</div></div></div>';
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    var back = tmp.firstChild;
    root.appendChild(back);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    root.querySelector('.x').addEventListener('click', function () { close(); });
    back.querySelectorAll('a.o').forEach(function (a) { a.addEventListener('click', function () { setTimeout(close, 50); }); });
    back.querySelector('[data-k="copy"]').addEventListener('click', function () {
      var done = function () { close(); toast('Link copied. Paste it anywhere to share.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(c.url).then(done, function () { toast('Copy did not work here. Press and hold the link to copy it.'); });
      } else { toast('Copy did not work here. Press and hold the link to copy it.'); }
    });
    var more = back.querySelector('[data-k="more"]');
    if (more) more.addEventListener('click', function () {
      navigator.share({ title: c.name, text: c.text, url: c.url }).then(function () { close(); }, function () {});
    });
    document.addEventListener('keydown', onKey, true);
    try { history.pushState({ ibiShare: 1 }, ''); pushed = true; window.addEventListener('popstate', onPop); } catch (e) { pushed = false; }
    root.querySelector('.x').focus();
  }

  function mountButton() {
    var slot = ds.slot ? document.querySelector(ds.slot) : null;
    var el = document.createElement('ibi-share-button');
    var sr = el.attachShadow({ mode: 'open' });
    styleInto(sr);
    sr.innerHTML = '<button type="button" class="btn' + (slot ? '' : ' float') + '" aria-label="Share this app" title="Share this app">' + ICON + '</button>';
    sr.querySelector('button').addEventListener('click', function () { open(); });
    el.style.display = 'inline-flex';
    el.style.flex = '0 0 auto';
    el.style.color = 'inherit';
    if (slot) slot.appendChild(el); else if (ds.slot !== 'none') document.body.appendChild(el);
  }

  window.IBIShare = { open: open, close: close, version: '1.0' };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountButton);
  else mountButton();
})();
