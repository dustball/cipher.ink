/* cipher.ink: the wall. A message's own ciphertext, tiled across the screen behind the lock card, slowly mutating and
 * brighter near the pointer, redrawn at 10 fps. It dissolves outward from the centre when the message is unsealed, and
 * then stops drawing. Used by the reading page (view.js) and the Secret Santa card (santa-card.js).
 * App.wall(canvas, text) → {dissolve()}; with no text it tiles random cipher glyphs.
 * Plain ES2017, unminified, no build step; this file is served exactly as you see it.
 */
(function () {
  'use strict';
  App.wall = function (cv, src) {
    var ctx = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
    var cells = [], cols = 0, rows = 0, cw = 0, ch = 0, mx = -1e4, my = -1e4, t0 = 0;
    var dissolve = 0, dissolving = false, raf = 0, last = 0, colors = {};
    if (!src) { src = ''; for (var i = 0; i < 4000; i++) src += App.glyph(); }

    function theme() {
      var s = getComputedStyle(document.documentElement);
      colors.fg = s.getPropertyValue('--wall').trim() || '140,130,255';
      colors.hot = s.getPropertyValue('--wall-hot').trim() || '120,240,220';
    }
    function size() {
      var w = innerWidth, h = innerHeight, fs = w < 600 ? 12 : 14;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = fs + 'px "JetBrains Mono", ui-monospace, monospace';
      ctx.textBaseline = 'top';
      cw = Math.ceil(ctx.measureText('M').width); ch = Math.round(fs * 1.45);
      cols = Math.ceil(w / cw) + 1; rows = Math.ceil(h / ch) + 1;
      cells = new Array(cols * rows);
      for (var k = 0; k < cells.length; k++) cells[k] = src.charAt(k % src.length);
      draw(performance.now(), true);
    }
    function draw(now, force) {
      if (!force && now - last < 100) { raf = requestAnimationFrame(draw); return; }
      last = now;
      var w = innerWidth, h = innerHeight;
      ctx.clearRect(0, 0, w, h);
      var mut = App.reduced ? 0 : Math.max(2, (cells.length / 260) | 0);
      for (var m = 0; m < mut; m++) cells[(Math.random() * cells.length) | 0] = App.glyph();
      var cx = w / 2, cy = h / 2, maxR = Math.hypot(cx, cy), R = dissolve * maxR * 1.25;
      var drift = App.reduced ? 0 : ((now - t0) / 90) % ch;
      for (var y = 0; y < rows; y++) {
        var py = y * ch - drift;
        for (var x = 0; x < cols; x++) {
          var px = x * cw, d = Math.hypot(px - mx, py - my);
          var a = 0.075 + Math.max(0, 1 - d / 190) * 0.5;
          var hot = d < 120;
          if (dissolving) {
            var dc = Math.hypot(px - cx, py - cy);
            if (dc < R - 80) continue;
            if (dc < R) { a = 0.9 * (1 - (R - dc) / 80); hot = true; }
          }
          ctx.fillStyle = 'rgba(' + (hot ? colors.hot : colors.fg) + ',' + a.toFixed(3) + ')';
          ctx.fillText(cells[y * cols + x], px, py);
        }
      }
      if (dissolving && R > maxR * 1.25 + 80) { cancelAnimationFrame(raf); cv.classList.add('gone'); return; }
      raf = requestAnimationFrame(draw);
    }
    theme(); t0 = performance.now();
    addEventListener('resize', size);
    addEventListener('pointermove', function (e) { mx = e.clientX; my = e.clientY; });
    addEventListener('pointerleave', function () { mx = my = -1e4; });
    document.addEventListener('ci-theme', function () { theme(); });
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(size);
    size();
    raf = requestAnimationFrame(draw);
    return {
      dissolve: function () {
        dissolving = true;
        var s = performance.now();
        (function grow(n) { dissolve = Math.min(1.2, (n - s) / 1100); if (dissolve < 1.2) requestAnimationFrame(grow); })(s);
        if (App.reduced) cv.classList.add('gone');
      }
    };
  };
})();
