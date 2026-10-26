/* cipher.ink reading page: the wall of ciphertext behind the lock card, unsealing a message with Cipher.open, the
 * reveal, attachments, the read receipt and Destroy.
 *
 * What it never does: send a passphrase, a link key or the decrypted text anywhere. Decryption happens in this tab; the
 *                     server is only asked for the sealed payload and told that a message was opened (with a token it
 *                     can check but not read).
 * Plain ES2017, unminified, no build step; this file is served exactly as you see it.
 * Annotated at https://cipher.ink/code
 */
(function () {
  'use strict';
  var $ = App.$, D = App.data;

  /* --- the wall (wall.js): this message's own ciphertext, tiled across the screen --- */
  var src = '';
  if (D.kind === 'legacy') { try { src = JSON.parse(D.enc).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); } catch (e) {} }
  else if (D.payload) { try { src = JSON.parse(D.payload).c; } catch (e) {} }
  var Wall = App.wall($('#wall'), src);

  if (D.kind === 'gone') return;

  /* --- state --- */
  var payload = D.payload || null, burned = false, linkKey = null;
  var form = $('#unlock'), btn = $('#open-btn'), err = $('#err'), passEl = $('#pass');

  function keyFrom(s) {
    s = String(s || '').trim();
    var i = s.indexOf('#'); if (i >= 0) s = s.slice(i + 1);
    return /^[A-Za-z0-9_-]{43}$/.test(s) ? s : null;
  }
  if (D.mode === 'k') {
    $('#passrow').hidden = true;
    linkKey = keyFrom(location.hash);
    if (!linkKey) $('#keyrow').hidden = false;
  }

  var meta = [];
  if (D.kind === 'legacy') meta.push('sealed before 2026');
  if (D.created) meta.push('sealed ' + App.ago(D.created));
  if (D.expires) meta.push('self-destructs in ' + App.until(D.expires));
  meta.push(D.mode === 'k' ? 'the key is in your link' : 'needs the passphrase');
  if (D.hint) { var he = $('#hint'); he.hidden = false; he.textContent = 'Hint: ' + D.hint; }
  if (D.files) meta.splice(meta.length - 1, 0, D.files + (D.files === 1 ? ' attachment' : ' attachments'));
  $('#meta').textContent = meta.join(' · ');
  if (D.burn) { $('#burnwarn').hidden = false; btn.querySelector('.lbl').textContent = 'Unseal and burn'; }

  $('#peek').addEventListener('click', function () {
    passEl.type = passEl.type === 'password' ? 'text' : 'password'; passEl.focus();
  });
  setTimeout(function () { (D.mode === 'k' ? (linkKey ? btn : $('#keyin')) : passEl).focus(); }, 60);

  function fail(msg) {
    err.textContent = msg;
    form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
    btn.classList.remove('busy'); btn.disabled = false;
    btn.querySelector('.lbl').textContent = burned ? 'Try again' : (D.burn ? 'Unseal and burn' : 'Unseal');
  }

  /* Unsealing. Pressing the button does everything, in this order:
   * (1) take the passphrase, or the link key from the URL fragment;
   * (2) get the sealed payload. A message that is not burn-after-reading already has it in the page. A burn message is asked for
   *     from the server, and handing it over is the moment the server destroys its copy;
   * (3) decrypt in this tab with Cipher.open. A wrong passphrase or key fails the GCM tag check, and nothing is shown;
   * (4) only after a successful decryption, tell the server the message was read, using the token that was sealed inside it. A link
   *     preview or a scanner cannot do this, because it cannot decrypt, so it never counts as a read;
   * (5) show the message (reveal), after sanitising it again with App.sanitize. */
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (btn.disabled) return;
    err.textContent = '';
    var pass = passEl.value;
    if (D.mode === 'k' && !linkKey) {
      linkKey = keyFrom($('#keyin').value);
      if (!linkKey) return fail('That doesn’t contain a key. It is the long part after the #.');
    }
    if (D.mode === 'p' && !pass) { passEl.focus(); return fail('Enter the passphrase you were given.'); }
    btn.disabled = true; btn.classList.add('busy');
    btn.querySelector('.lbl').textContent = D.mode === 'p' && D.kind === 'v2' ? 'Deriving key…' : 'Unsealing…';

    if (!payload && D.kind === 'v2') {
      try {
        var r = await App.post('open', { id: D.id });
        payload = r.payload; burned = r.burned;
      } catch (x) {
        if (x.status === 404) return gone();
        return fail(x.message || 'Could not reach the server.');
      }
    }
    var obj, key = null;
    try {
      if (D.kind === 'legacy') obj = await Cipher.legacyOpen(JSON.parse(D.enc), D.id, pass);
      else { var o = await Cipher.open(payload, D.mode === 'k' ? { linkKey: linkKey } : { passphrase: pass }); obj = o.data; key = o.key; }
    } catch (x) {
      if (D.mode === 'k') { linkKey = null; $('#keyrow').hidden = false; return fail('That key doesn’t open this message. Check you copied the whole link.'); }
      return fail(burned
        ? 'Not that one. The server copy is already destroyed, so it lives only in this tab now. Keep trying, and don’t close it.'
        : 'That passphrase doesn’t open it.');
    }
    // A Secret Santa card opened through its /m/ link: hand over to the card page, which records the open itself.
    if (obj && obj.app === 'santa' && D.mode === 'k') { location.replace(D.base + 'santa/' + D.id + '#' + linkKey); return; }
    // Read receipt: only a successful unseal counts (link-preview bots can't decrypt). Burn messages
    // were counted when the server handed them over. The sender previewing their own message (it is in
    // this browser's My messages) is not a read.
    var mine = App.sent.list().some(function (x) { return x.id === D.id; });
    if (D.kind === 'v2' && !burned && obj.d && !mine) App.post('opened', { id: D.id, token: obj.d }).catch(function () {});
    reveal(obj, key);
  });

  /* Attachments are fetched and decrypted as soon as the message opens. For a burn-after-reading
   * message the server releases each file once, within 15 minutes of the burn. */
  function showFiles(att, key) {
    var box = $('#atts'); box.hidden = false; box.innerHTML = '';
    att.forEach(function (a, n) {
      var el = document.createElement('div'); el.className = 'att';
      var meta = document.createElement('span'); meta.className = 'attmeta';
      var nm = document.createElement('b'); nm.textContent = a.name; var sz = document.createElement('small'); sz.textContent = App.bytes(a.size) + ' · decrypting…';
      meta.appendChild(nm); meta.appendChild(sz);
      var ic = document.createElement('span'); ic.className = 'atticon'; ic.textContent = (a.name.split('.').pop() || 'file').slice(0, 4);
      el.appendChild(ic); el.appendChild(meta); box.appendChild(el);
      App.post('file', { id: D.id, n: n }, { raw: true })
        .then(function (bytes) { return Cipher.openFile(key, a.iv, bytes); })
        .then(function (plain) {
          // Only known image types render inline; everything else is a download, never opened in the page.
          var img = /^image\/(png|jpe?g|gif|webp|avif)$/.test(a.type);
          var blob = new Blob([plain], { type: img ? a.type : 'application/octet-stream' });
          var url = URL.createObjectURL(blob);
          if (img) { var im = document.createElement('img'); im.src = url; im.alt = a.name; el.replaceChild(im, ic); el.classList.add('isimg'); }
          sz.textContent = App.bytes(a.size);
          var dl = document.createElement('a'); dl.className = 'ghost btn'; dl.href = url; dl.download = a.name; dl.textContent = 'Save';
          el.appendChild(dl);
        }, function () { sz.textContent = App.bytes(a.size) + ' · could not be fetched (already taken, or expired)'; el.classList.add('failed'); });
    });
  }

  function gone() {
    document.title = 'Nothing here · cipher.ink';
    form.classList.add('fade');
    setTimeout(function () {
      form.innerHTML = '<div class="ash" aria-hidden="true">∅</div><h1>Already gone.</h1><p class="lede">Someone opened this message first, or it expired. It burned, and the server no longer has it.</p>';
      form.classList.remove('fade');
    }, 260);
  }

  async function reveal(obj, key) {
    btn.querySelector('.lbl').textContent = 'Unsealed';
    document.body.classList.add('opening');
    Wall.dissolve();
    form.classList.add('unlocked');
    await new Promise(function (r) { setTimeout(r, App.reduced ? 0 : 650); });
    $('#vault').hidden = true;
    var reader = $('#reader'), msg = $('#msg');
    msg.innerHTML = App.sanitize(obj.html || '');
    reader.hidden = false;
    document.body.classList.add('reading');
    requestAnimationFrame(function () { reader.classList.add('show'); });
    var len = (msg.textContent || '').length;
    App.scramble(msg, 'decrypt', Math.min(2200, 800 + len * 1.2));

    var stamp = [];
    if (obj.att && obj.att.length && key) showFiles(obj.att, key);
    if (obj.t) stamp.push('sealed ' + new Date(obj.t * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }));
    $('#stamp').textContent = stamp.join(' · ');

    var banner = $('#banner');
    // A burned message lives only in this tab: ask before anything navigates away from it.
    if (burned) addEventListener('beforeunload', function (e) { e.preventDefault(); e.returnValue = ''; });
    if (burned) {
      banner.hidden = false; banner.className = 'banner burn';
      banner.textContent = 'This message has been destroyed on the server. When you close this tab, it is gone for good.';
    } else if (D.expires) {
      banner.hidden = false; banner.className = 'banner';
      banner.textContent = 'This message deletes itself in ' + App.until(D.expires) + '.';
    }
    if (D.kind === 'v2' && !burned && obj.d) {
      var b = $('#burn-now'), armed = false;
      b.hidden = false;
      b.addEventListener('click', function () {
        if (!armed) { armed = true; b.textContent = 'Click again to destroy'; b.classList.add('armed'); setTimeout(function () { armed = false; b.textContent = 'Destroy it now'; b.classList.remove('armed'); }, 3500); return; }
        b.disabled = true;
        App.post('burn', { id: D.id, token: obj.d }).then(function () {
          b.hidden = true;
          banner.hidden = false; banner.className = 'banner burn';
          banner.textContent = 'Destroyed. The server copy is gone, and the link no longer opens anything.';
          App.toast('Destroyed', 'ok');
        }, function (x) { b.disabled = false; App.toast(x.message || 'Could not destroy it.', 'err'); });
      });
    }
    $('#copy-text').addEventListener('click', function () { App.copy(msg.innerText, 'Text copied'); });
  }
})();
