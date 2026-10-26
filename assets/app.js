/* cipher.ink shared helpers: the page data (App.data), the HTML sanitiser (App.sanitize), the API wrapper, "My
 * messages" storage, the theme button and the scramble animation.
 *
 * What it never does: read or send a message's text. It talks to api.php only with ciphertext, hashes and tokens; every
 *                     message is sanitised here again before it is shown.
 * Plain ES2017, unminified, no build step; this file is served exactly as you see it.
 * Annotated at https://cipher.ink/code
 */
(function (root) {
  'use strict';
  var App = root.App = {};
  var $ = App.$ = function (s, r) { return (r || document).querySelector(s); };
  App.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  try { App.data = JSON.parse($('#ci-data').textContent); } catch (e) { App.data = {}; }
  App.reduced = root.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* Shortcut labels are written Mac-style (⌘, ⇧); elsewhere they read Ctrl+, Shift+. */
  App.mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
  App.keys = function (s) { return App.mac ? s : s.replace(/⌘/g, 'Ctrl+').replace(/⇧/g, 'Shift+'); };
  App.GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=-_#%&*<>{}[]~$@!?';
  App.glyph = function () { return App.GLYPHS.charAt((Math.random() * App.GLYPHS.length) | 0); };

  /* Messages are HTML written by whoever sealed them, so they are sanitised on the way in (paste, seal) and again on the way
   * out (render). The CSP is the wall behind this.
   * The allowlist below is everything a message may contain: these tags, and the href attribute on links, and nothing else. No
   * style, no class, no images, no scripts, no event handlers. The hook then removes the address from any link that is not http(s)
   * or mailto (which kills javascript: links), and makes the rest open in a new tab with noopener, noreferrer and nofollow. */
  var TAGS = ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'h1', 'h2', 'h3',
    'blockquote', 'ul', 'ol', 'li', 'pre', 'code', 'a', 'hr', 'div'];
  if (root.DOMPurify) {
    DOMPurify.addHook('afterSanitizeAttributes', function (n) {
      if (n.tagName !== 'A') return;
      var h = n.getAttribute('href') || '';
      if (!/^(https?:|mailto:)/i.test(h)) n.removeAttribute('href');
      else { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer nofollow'); }
    });
  }
  App.sanitize = function (html) {
    if (!root.DOMPurify) throw new Error('sanitizer missing');
    return DOMPurify.sanitize(html, { ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ['href'] });
  };

  /* POST to api.php. params: plain values, arrays (sent as name[]), or Blobs (multipart uploads).
   * opt.raw returns the response as bytes (attachments). */
  App.post = function (action, params, opt) {
    opt = opt || {};
    var multipart = false;
    Object.keys(params || {}).forEach(function (k) { if (params[k] instanceof Blob) multipart = true; });
    var body = multipart ? new FormData() : new URLSearchParams();
    body.append('action', action);
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null) return;
      if (Array.isArray(v)) v.forEach(function (x) { body.append(k + '[]', x); });
      else body.append(k, v);
    });
    return fetch(App.data.base + 'api.php', { method: 'POST', body: body, credentials: 'omit', cache: 'no-store' })
      .then(function (r) {
        if (opt.raw && r.ok) return r.arrayBuffer().then(function (b) { return new Uint8Array(b); });
        return r.json().catch(function () { return { error: 'The server sent something unexpected (' + r.status + ').' }; })
          .then(function (j) { if (!r.ok || j.error) { var e = new Error(j.error || ('HTTP ' + r.status)); e.status = r.status; throw e; } return j; });
      });
  };

  App.bytes = function (n) {
    return n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
  };

  /* "My messages": what this browser has sealed. Kept only in this browser's localStorage. Each
   * entry holds the link (for a secret link that includes the key) and the token that lets the
   * sender check and destroy it, plus a short label. Never sent anywhere except the token to api.php. */
  App.sent = {
    KEY: 'ci-sent',
    list: function () { try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch (e) { return []; } },
    save: function (l) { try { localStorage.setItem(this.KEY, JSON.stringify(l.slice(0, 200))); return true; } catch (e) { return false; } },
    add: function (item) { var l = this.list().filter(function (x) { return x.id !== item.id; }); l.unshift(item); return this.save(l); },
    remove: function (id) { this.save(this.list().filter(function (x) { return x.id !== id; })); },
    clear: function () { try { localStorage.removeItem(this.KEY); } catch (e) {} }
  };

  var toastT;
  App.toast = function (msg, kind) {
    var t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.className = 'show ' + (kind || '');
    clearTimeout(toastT); toastT = setTimeout(function () { t.className = ''; }, 2600);
  };

  App.copy = function (text, what) {
    var done = function () { App.toast((what || 'Copied') + ' to the clipboard', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(done, fallback);
    fallback();
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { App.toast('Copy failed: select it and copy by hand', 'err'); }
      ta.remove();
    }
  };

  function span(sec) {
    var u = [[86400 * 30, 'month'], [86400 * 7, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
    for (var i = 0; i < u.length; i++) if (sec >= u[i][0]) { var n = Math.floor(sec / u[i][0]); return n + ' ' + u[i][1] + (n > 1 ? 's' : ''); }
    return 'a moment';
  }
  App.ago = function (ts) { return span(Math.max(0, Date.now() / 1000 - ts)) + ' ago'; };
  App.until = function (ts) { return span(Math.max(0, ts - Date.now() / 1000)); };

  /* Scramble: 'encrypt' sweeps a front through the text turning letters into cipher glyphs;
   * 'decrypt' starts as glyphs and resolves into the real text behind a flickering band.
   * Whitespace is left alone so the layout holds. Long texts animate the first CAP chars. */
  App.scramble = function (rootEl, mode, ms) {
    return new Promise(function (resolve) {
      var nodes = [], w = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) if (w.currentNode.data.trim()) nodes.push(w.currentNode);
      var orig = nodes.map(function (n) { return n.data; });
      var noise = orig.map(function (s) { return s.replace(/\S/g, App.glyph); });
      var starts = [], N = 0;
      orig.forEach(function (s) { starts.push(N); N += s.length; });
      if (!N || App.reduced) {
        if (mode === 'decrypt') nodes.forEach(function (n, i) { n.data = orig[i]; });
        return setTimeout(resolve, App.reduced ? 150 : 0);
      }
      var CAP = 4000, span = Math.min(N, CAP), band = Math.max(14, span * 0.12);
      if (mode === 'decrypt') nodes.forEach(function (n, i) { n.data = noise[i]; });
      var t0 = performance.now();
      function frame(now) {
        var p = Math.min(1, (now - t0) / ms);
        var e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        var front = e * (span + band);
        for (var i = 0; i < nodes.length; i++) {
          var s = orig[i], st = starts[i], L = s.length;
          if (st >= span) { nodes[i].data = (mode === 'encrypt') === (p < 1) ? s : noise[i]; continue; }
          var done = front - band, out = '';
          if (st + L <= done) { nodes[i].data = mode === 'encrypt' ? noise[i] : s; continue; }
          if (st >= front) { nodes[i].data = mode === 'encrypt' ? s : noise[i]; continue; }
          for (var j = 0; j < L; j++) {
            var c = s.charAt(j), idx = st + j;
            if (c === ' ' || c === '\n' || c === '\t' || c === ' ') { out += c; continue; }
            if (idx < done) out += mode === 'encrypt' ? noise[i].charAt(j) : c;
            else if (idx < front) out += App.glyph();
            else out += mode === 'encrypt' ? c : noise[i].charAt(j);
          }
          nodes[i].data = out;
        }
        if (p < 1) requestAnimationFrame(frame);
        else { if (mode === 'decrypt') nodes.forEach(function (n, k) { n.data = orig[k]; }); resolve(); }
      }
      requestAnimationFrame(frame);
    });
  };

  /* Chrome shared by both pages: theme, about, fullscreen. */
  document.addEventListener('DOMContentLoaded', function () {
    var tb = $('#theme-btn');
    tb && tb.addEventListener('click', function () {
      var t = document.documentElement.getAttribute('data-theme') === 'ink' ? 'paper' : 'ink';
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('ci-theme', t); } catch (e) {}
      document.dispatchEvent(new Event('ci-theme'));
    });
    var ab = $('#about-btn'), dlg = $('#about');
    ab && dlg && ab.addEventListener('click', function () { dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', ''); });
    dlg && dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
    var fs = $('#fs-btn');
    if (fs) {
      if (!document.documentElement.requestFullscreen) fs.hidden = true;
      fs.addEventListener('click', function () {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(function () {});
      });
      document.addEventListener('fullscreenchange', function () { fs.classList.toggle('on', !!document.fullscreenElement); });
    }
  });
})(window);
