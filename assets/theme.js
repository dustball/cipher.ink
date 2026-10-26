/* cipher.ink theme: runs in the <head>, before the page paints, so it never flashes the wrong theme. White paper
 * unless you chose ink.
 *
 * What it never does: touch anything but the theme. The choice is kept in this browser's localStorage under ci-theme,
 *                     and nowhere else.
 * Plain ES2017, unminified, no build step; this file is served exactly as you see it.
 * Annotated at https://cipher.ink/code
 */
(function () {
  var t = null;
  try { t = localStorage.getItem('ci-theme'); } catch (e) {}
  if (t !== 'ink' && t !== 'paper') t = 'paper';
  document.documentElement.setAttribute('data-theme', t);
})();
