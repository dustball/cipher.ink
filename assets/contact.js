/* cipher.ink contact page: posts the contact form to api.php, which emails it to the site owner.
 *
 * What it never does: encrypt anything. Unlike a sealed message, what is typed in this form is NOT encrypted, and the
 *                     page says so. It is the only place the site accepts readable text.
 * Plain ES2017, unminified, no build step; this file is served exactly as you see it.
 * Annotated at https://cipher.ink/code
 */
(function () {
  'use strict';
  var $ = App.$;
  var form = $('#contact'), btn = $('#c-send'), err = $('#c-err');
  setTimeout(function () { $('#c-body').focus(); }, 60);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (btn.disabled) return;
    var from = $('#c-from').value.trim(), body = $('#c-body').value.trim();
    err.textContent = '';
    if (!body) { $('#c-body').focus(); err.textContent = 'Write a message first.'; return; }
    if (from && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) { $('#c-from').focus(); err.textContent = 'That email address doesn’t look right.'; return; }
    btn.disabled = true; btn.classList.add('busy'); btn.querySelector('.lbl').textContent = 'Sending…';
    App.post('contact', { from: from, body: body, site: $('#c-site').value }).then(function () {
      form.innerHTML = '';
      var h = document.createElement('h1'); h.textContent = 'Sent.';
      var p = document.createElement('p'); p.className = 'lede';
      p.textContent = from ? 'Thanks. If it needs an answer, it will come to ' + from + '.' : 'Thanks. You didn’t leave an address, so there is no way to reply.';
      var a = document.createElement('a'); a.className = 'primary btn'; a.href = App.data.base; a.textContent = 'Back to cipher.ink';
      form.appendChild(h); form.appendChild(p); form.appendChild(a);
    }, function (x) {
      btn.disabled = false; btn.classList.remove('busy'); btn.querySelector('.lbl').textContent = 'Send';
      err.textContent = x.message || 'Could not send it. Try again in a minute.';
    });
  });
})();
