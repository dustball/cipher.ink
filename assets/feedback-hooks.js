/* cipher.ink's side of the shared feedback widget (a script from the site's own feedback host, async, loaded right after this file).
 * The widget draws its own tab; this file only tells it what kind of page it is on and wires the "Send feedback" links.
 *
 * fbw.context() is read when someone presses Send, and returns scalars only:
 *   kind  the page kind, chosen on the SERVER (data-kind below): compose, view, receipt, contact, santa-card, santa-group, santa,
 *         notfound, or a public content key such as learn/aes-gcm. Never the address, the #fragment or anything typed.
 *   vw    a viewport bucket (xs, s, m, l), theme (paper or ink), ver (this release)
 *   page  always '': the widget would otherwise send location.pathname, and a message link's path is the message id
 * Nothing else on the page is read: no address bar, no editor, no passphrase, no token, no message id, no localStorage.
 * Plain ES2017, unminified, no build step; this file is served exactly as you see it.
 */
(function () {
  'use strict';
  var me = document.currentScript;
  var kind = (me && me.getAttribute('data-kind')) || 'other';
  var ver = (me && me.getAttribute('data-ver')) || '';

  function widthBucket() { var w = window.innerWidth || 0; return w < 480 ? 'xs' : w < 720 ? 's' : w < 1080 ? 'm' : 'l'; }
  function theme() { return document.documentElement.getAttribute('data-theme') === 'ink' ? 'ink' : 'paper'; }

  window.fbw = {
    context: function () { return { kind: kind, vw: widthBucket(), theme: theme(), ver: ver, page: '' }; },
    theme: function () { return theme() === 'ink' ? 'dark' : 'light'; },   // the widget follows the site's own switch, not the OS
    source: function () { return 'widget'; }
  };

  /* Any button marked data-fb-open (the About box) opens the widget's panel. It stays hidden until the widget has
   * drawn its tab (the <fb-widget> element), so a page where the widget failed to load shows no dead link. An open About box is
   * closed first: it sits above everything, so the panel would be hidden behind it. */
  var links = Array.prototype.slice.call(document.querySelectorAll('[data-fb-open]'));
  links.forEach(function (el) {
    el.addEventListener('click', function () {
      var dlg = el.closest && el.closest('dialog');
      if (dlg && dlg.open) dlg.close();
      if (window.fbw && typeof window.fbw.open === 'function') window.fbw.open({ source: 'widget' });
    });
  });
  function reveal() {
    if (!document.querySelector('fb-widget')) return false;
    links.forEach(function (el) { el.hidden = false; });
    return true;
  }
  function watch() {
    if (reveal() || !window.MutationObserver) return;
    var mo = new MutationObserver(function () { if (reveal()) mo.disconnect(); });
    mo.observe(document.body, { childList: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();
