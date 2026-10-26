/* cipher.ink compose page: the lock options, the passphrase generator and strength meter, attachments, and sealing
 * a message with Cipher.seal.
 *
 * What it never does: send plaintext, a passphrase, a file name or a link key. Only the sealed payload, the encrypted
 *                     attachment bytes and a hash of the receipt token are uploaded.
 * Plain ES2017, unminified, no build step; this file is served exactly as you see it.
 * Annotated at https://cipher.ink/code
 */
(function () {
  'use strict';
  var $ = App.$, $$ = App.$$;
  var MAX_HTML = 480000;

  var editorEl = $('#editor'), toolbar = $('#toolbar'), bubble = $('#bubble');
  var countT;
  var ed = new Editor(editorEl, {
    bar: toolbar, bubble: bubble, sanitize: App.sanitize,
    noBubble: function () { return true; },   // the toolbar is always there; the bubble only asks for links
    onHint: function (m) { App.toast(m); },
    // counting reads layout, so it waits until typing pauses instead of running on every key
    onChange: function () { clearTimeout(countT); countT = setTimeout(count, 250); }
  });
  var state = { mode: 'p', ttl: 604800, burn: false, sealed: false };

  /* --- counter --- */
  function count() {
    var t = editorEl.textContent.replace(/\u200B/g, '').trim(), words = t ? t.split(/\s+/).length : 0;
    var size = editorEl.innerHTML.length;
    var c = $('#count');
    c.textContent = words ? words.toLocaleString() + (words === 1 ? ' word' : ' words') : '';
    c.classList.toggle('over', size > MAX_HTML);
    if (size > MAX_HTML * 0.8) c.textContent += ' · ' + Math.round(size / MAX_HTML * 100) + '% of the limit';
  }

  /* --- lock mode --- */
  function setMode(m) {
    state.mode = m;
    $$('.seg [data-mode]').forEach(function (b) { b.setAttribute('aria-checked', b.dataset.mode === m ? 'true' : 'false'); });
    $('#passwrap').hidden = m !== 'p';
    $('#linknote').hidden = m !== 'k';
    $('#hintrow').hidden = m !== 'p';
    document.body.dataset.mode = m;
  }
  $$('.seg [data-mode]').forEach(function (b) { b.addEventListener('click', function () { setMode(b.dataset.mode); if (b.dataset.mode === 'p') $('#pass').focus(); }); });
  setMode('p');

  /* --- passphrase strength + generator --- */
  var WORDS = ('acid acorn actor adapt alarm album alley amber anchor angle ankle apple april arena armor arrow atlas attic ' +
    'autumn award bacon badge bagel baker bamboo banjo barn basil beach beacon beard bench berry bison blade blank ' +
    'blaze bloom board bonus boost brass bread brick bridge brook brush bubble bucket buffalo bugle cabin cable cactus ' +
    'camel candle canoe canyon carbon cargo carpet castle cedar cellar chalk chapel cherry chess chimney cider cinema ' +
    'circus citrus clay cliff clover coast cobalt cocoa comet coral cotton cougar crane crater crayon cricket crystal ' +
    'cube curtain cymbal daisy delta denim desert diesel dolphin domino donkey dragon drift drum dune eagle easel ' +
    'echo eclipse elbow ember emerald engine falcon fable feather fern ferry fiddle fig flame flint fog forest ' +
    'fossil fountain fox frost galaxy garden garlic gazelle geyser ginger glacier globe goblin goose granite grape ' +
    'gravel guitar gull hammer harbor harp hazel hedge helmet heron hollow honey hornet husky igloo index indigo ' +
    'iris island ivory jacket jaguar jasmine jelly jewel jungle kayak kettle kiwi koala ladder lagoon lantern laser ' +
    'lemon lentil lily lime linen lobster locket lotus lunar magnet mango maple marble meadow melon meteor mint ' +
    'mirror mocha monsoon moose mosaic moss mural nectar needle nickel nimbus noodle nutmeg oasis ocean olive onyx ' +
    'opal orbit orchid otter oyster paddle palm panda paper parrot pebble pepper piano pickle pigeon pillow pine ' +
    'pixel planet plum pocket polar pony poppy prism pumpkin quartz quill rabbit radar radish raven reef ribbon ' +
    'river robin rocket rose ruby saddle saffron salmon satin scarf shadow shell signal silver sketch sled sparrow ' +
    'spice spiral sponge spruce squid stable stamp starling stone storm sugar summit sunset swan tango thistle ' +
    'thunder tiger timber toast topaz torch tulip tundra turtle velvet violet walnut walrus willow zebra').split(' ');
  function gen() {
    var out = [];
    for (var i = 0; i < 5; i++) out.push(WORDS[Cipher.randInt(WORDS.length)]);
    return out.join('-') + '-' + (10 + Cipher.randInt(90));
  }
  function strength(p) {
    if (!p) return 0;
    var words = p.split(/[-\s.]+/).filter(function (w) { return WORDS.indexOf(w.toLowerCase()) >= 0; }).length;
    var pool = (/[a-z]/.test(p) ? 26 : 0) + (/[A-Z]/.test(p) ? 26 : 0) + (/\d/.test(p) ? 10 : 0) + (/[^a-zA-Z\d]/.test(p) ? 33 : 0);
    var bits = Math.max(p.length * Math.log2(Math.max(pool, 2)) * 0.6, words * 8);
    if (/^(.)\1+$/.test(p) || /^(password|letmein|qwerty|123456)/i.test(p)) bits = 5;
    return bits < 28 ? 1 : bits < 45 ? 2 : bits < 64 ? 3 : 4;
  }
  var passEl = $('#pass');
  function meter() {
    var s = strength(passEl.value), m = $('#meter'), w = $('#pw-word');
    m.dataset.s = s; w.dataset.s = s;
    m.title = w.textContent = ['', 'weak', 'fair', 'good', 'strong'][s];
    passEl.closest('.passwrap').classList.remove('need');
  }
  passEl.addEventListener('input', meter);
  $('#dice').addEventListener('click', function () {
    var target = gen(), el = passEl;
    if (App.reduced) { el.value = target; meter(); return; }
    var t0 = performance.now();
    (function roll(now) {
      var p = Math.min(1, (now - t0) / 420), keep = Math.floor(target.length * p);
      el.value = target.slice(0, keep) + target.slice(keep).replace(/[a-z0-9]/g, App.glyph);
      if (p < 1) requestAnimationFrame(roll); else { el.value = target; meter(); }
    })(t0);
  });

  /* --- options popover --- */
  var optBtn = $('#opt-btn'), opts = $('#opts');
  var TTL = { 600: '10 min', 3600: '1 hour', 86400: '1 day', 604800: '1 week', 2592000: '30 days' };
  function summary() {
    var s = state.ttl ? TTL[state.ttl] : 'No expiry';
    if (state.burn) s = 'Burn · ' + s;
    $('#opt-sum').textContent = s;
    optBtn.classList.toggle('hot', state.burn);
  }
  function openOpts(on) {
    opts.hidden = !on; optBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  optBtn.addEventListener('click', function (e) { e.stopPropagation(); openOpts(opts.hidden); });
  document.addEventListener('click', function (e) { if (!opts.hidden && !e.target.closest('.optwrap')) openOpts(false); });
  $$('#ttl [data-ttl]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.ttl = +b.dataset.ttl;
      $$('#ttl [data-ttl]').forEach(function (x) { x.classList.toggle('on', x === b); });
      summary();
    });
  });
  $('#burn').addEventListener('change', function (e) { state.burn = e.target.checked; summary(); });
  summary();

  /* --- keys --- */
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (!state.sealed) seal(); }
    if (e.key === 'Escape') { openOpts(false); ed.hideBubble(); }
  });
  passEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); seal(); } });
  $('#seal-btn').addEventListener('click', seal);
  if (!App.mac) $('#seal-btn kbd').textContent = 'Ctrl ↵';

  window.addEventListener('beforeunload', function (e) {
    if (!state.sealed && (!ed.isEmpty() || files.length)) { e.preventDefault(); e.returnValue = ''; }
  });

  /* --- attachments: read into memory, encrypted with the message at seal time --- */
  var MAX_FILES = 10, MAX_BYTES = 5 * 1048576;
  var files = [];   // {name, type, size, file, url?}
  function totalBytes() { return files.reduce(function (n, f) { return n + f.size; }, 0); }
  function addFiles(list) {
    Array.prototype.forEach.call(list, function (f) {
      if (files.length >= MAX_FILES) { App.toast('Up to ' + MAX_FILES + ' attachments.', 'err'); return; }
      if (totalBytes() + f.size > MAX_BYTES) { App.toast(f.name + ' would go over the 5 MB limit.', 'err'); return; }
      var item = { name: f.name || 'pasted-image.png', type: f.type || 'application/octet-stream', size: f.size, file: f };
      if (/^image\/(png|jpe?g|gif|webp|avif)$/.test(item.type)) item.url = URL.createObjectURL(f);
      files.push(item);
    });
    renderFiles();
  }
  function renderFiles() {
    var box = $('#atts');
    box.innerHTML = '';
    box.hidden = !files.length;
    files.forEach(function (f, i) {
      var el = document.createElement('div'); el.className = 'att';
      if (f.url) { var im = document.createElement('img'); im.src = f.url; im.alt = ''; el.appendChild(im); }
      else { var ic = document.createElement('span'); ic.className = 'atticon'; ic.textContent = (f.name.split('.').pop() || 'file').slice(0, 4); el.appendChild(ic); }
      var meta = document.createElement('span'); meta.className = 'attmeta';
      var nm = document.createElement('b'); nm.textContent = f.name; var sz = document.createElement('small'); sz.textContent = App.bytes(f.size);
      meta.appendChild(nm); meta.appendChild(sz); el.appendChild(meta);
      var x = document.createElement('button'); x.type = 'button'; x.className = 'ghost icon'; x.textContent = '✕'; x.title = 'Remove';
      x.addEventListener('click', function () { if (f.url) URL.revokeObjectURL(f.url); files.splice(i, 1); renderFiles(); });
      el.appendChild(x);
      box.appendChild(el);
    });
    var ab = $('#attach-btn span');
    ab.textContent = files.length ? 'Attach · ' + App.bytes(totalBytes()) : 'Attach';
  }
  $('#attach-btn').addEventListener('click', function () { $('#file-in').click(); });
  $('#file-in').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
  var dragDepth = 0;
  document.addEventListener('dragenter', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0) { dragDepth++; document.body.classList.add('dragging'); } });
  document.addEventListener('dragleave', function () { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
  document.addEventListener('dragover', function (e) { if (document.body.classList.contains('dragging')) e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    dragDepth = 0; document.body.classList.remove('dragging');
    if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); if (!state.sealed) addFiles(e.dataTransfer.files); }
  });
  // a pasted screenshot becomes an attachment
  editorEl.addEventListener('paste', function (e) {
    var cd = e.clipboardData;
    if (cd && cd.files && cd.files.length && !cd.getData('text/plain')) { e.preventDefault(); e.stopImmediatePropagation(); addFiles(cd.files); }
  }, true);

  /* --- seal --- */
  var busy = false;
  function seal() {
    if (busy || state.sealed) return;
    if (ed.isEmpty() && !files.length) { App.toast('Write something first.'); editorEl.focus(); return; }
    var pass = passEl.value;
    if (state.mode === 'p' && !pass) {
      passEl.closest('.passwrap').classList.add('need');
      passEl.focus();
      App.toast('Pick a passphrase, or switch to a secret link.');
      return;
    }
    var html = ed.html();
    if (html.length > MAX_HTML) { App.toast('That is too long to seal. Trim it a little.', 'err'); return; }
    var hint = state.mode === 'p' ? $('#hint').value.trim() : '';
    // (a passphrase of 1-3 characters would match almost any hint, so it is not checked)
    if (hint && pass.length >= 4 && hint.toLowerCase().indexOf(pass.toLowerCase()) >= 0) { openOpts(true); $('#hint').focus(); App.toast('The hint contains the passphrase.', 'err'); return; }

    busy = true; openOpts(false); ed.hideBubble();
    var btn = $('#seal-btn'), saved = editorEl.innerHTML;
    btn.classList.add('busy'); btn.querySelector('.lbl').textContent = state.mode === 'p' ? 'Forging key…' : 'Sealing…';
    document.body.classList.add('sealing');
    editorEl.setAttribute('contenteditable', 'false');
    var token = Cipher.b64u(Cipher.rand(18));
    var label = ed.text().replace(/\s+/g, ' ').trim().slice(0, 48) || (files[0] && files[0].name) || '';

    var work = (async function () {
      var raw = [];
      for (var i = 0; i < files.length; i++) raw.push({ name: files[i].name, type: files[i].type, bytes: new Uint8Array(await files[i].file.arrayBuffer()) });
      var s = await Cipher.seal({ html: html, t: Math.floor(Date.now() / 1000), d: token },
        state.mode === 'k' ? { link: true } : { passphrase: pass }, raw);
      var params = { payload: s.payload, mode: state.mode, burn: state.burn ? 1 : 0, ttl: state.ttl,
        del: await Cipher.sha256hex(token), hint: hint || null };
      s.blobs.forEach(function (b, n) { params['f' + n] = new Blob([b], { type: 'application/octet-stream' }); });
      var r = await App.post('create', params);
      return { id: r.id, key: s.linkKey };
    })();
    var anim = App.scramble(editorEl, 'encrypt', Math.min(1600, 700 + html.length / 6));

    Promise.all([work, anim]).then(function (res) {
      var r = res[0];
      r.token = token; r.label = label; r.files = files.length;
      document.body.classList.add('collapse');
      setTimeout(function () { showSealed(r, pass); }, App.reduced ? 0 : 520);
    }).catch(function (err) {
      editorEl.innerHTML = saved;
      editorEl.setAttribute('contenteditable', 'true');
      document.body.classList.remove('sealing');
      App.toast(err && err.message ? err.message : 'Sealing failed.', 'err');
    }).then(function () {
      busy = false; btn.classList.remove('busy'); btn.querySelector('.lbl').textContent = 'Seal it';
    });
  }

  function drawQR(text) {
    var box = $('#qr'); box.innerHTML = '';
    if (!window.qrcode) return;
    var q = qrcode(0, 'M'); q.addData(text); q.make();
    var n = q.getModuleCount(), cell = Math.max(3, Math.floor(232 / (n + 8))), size = (n + 8) * cell;
    var cv = document.createElement('canvas'); cv.width = size; cv.height = size;
    var c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, size, size); c.fillStyle = '#111';
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (q.isDark(y, x)) c.fillRect((x + 4) * cell, (y + 4) * cell, cell, cell);
    cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'QR code of the link');
    box.appendChild(cv);
  }

  function showSealed(r, pass) {
    state.sealed = true;
    var url = location.origin + App.data.base + 'm/' + r.id + (r.key ? '#' + r.key : '');
    var item = { id: r.id, token: r.token, url: url, label: r.label, created: Math.floor(Date.now() / 1000), mode: state.mode };
    var kept = App.sent.add(item);
    document.body.classList.add('done');
    var sec = $('#sealed');
    sec.hidden = false;
    $('#sealed-url').textContent = url;
    $('#status-url').textContent = App.receiptUrl(item);
    $('.trackfine').hidden = !kept;
    $('#open-btn').href = url;
    $('#open-btn').hidden = state.burn;
    $('#sealed-lede').textContent = state.mode === 'p'
      ? 'Send the link. Tell them the passphrase some other way: in person, on a call, in a different app.'
      : 'Send the link. It is the whole key, so send it only to them, somewhere private.';
    var pb = $('#passbox');
    pb.hidden = state.mode !== 'p';
    var pe = $('#sealed-pass'); pe.textContent = pass; pe.classList.add('masked');
    var facts = [state.mode === 'p' ? 'AES-256-GCM · PBKDF2 ×600k' : 'AES-256-GCM · 256-bit link key'];
    facts.push(state.ttl ? 'Gone in ' + TTL[state.ttl].replace('1 ', 'a ').replace('a hour', 'an hour') : 'No expiry');
    if (state.burn) facts.push('Burns when opened');
    if (r.files) facts.push(r.files + (r.files === 1 ? ' attachment' : ' attachments') + ', encrypted');
    if (state.mode === 'p' && $('#hint').value.trim()) facts.push('With a hint');
    $('#facts').innerHTML = '';
    facts.forEach(function (f) { var li = document.createElement('li'); li.textContent = f; $('#facts').appendChild(li); });
    $('#qrbox').hidden = true; $('#qr-btn').textContent = 'QR code';
    $('#qr-btn').onclick = function () {
      var box = $('#qrbox'); box.hidden = !box.hidden;
      if (!box.hidden) drawQR(url);
      this.textContent = box.hidden ? 'QR code' : 'Hide QR code';
    };
    if (navigator.share) {
      var sb = $('#share-btn'); sb.hidden = false;
      sb.onclick = function () { navigator.share({ url: url, title: 'A sealed message' }).catch(function () {}); };
    }
    requestAnimationFrame(function () { sec.classList.add('show'); });
    setTimeout(function () { $('#copy-url').focus(); }, 50);
    // The plaintext, files and passphrase stay out of the page from here on.
    editorEl.innerHTML = '';
    passEl.value = ''; meter();   // the card keeps its own (blurred) copy for Copy
    files.forEach(function (f) { if (f.url) URL.revokeObjectURL(f.url); });
    files = []; renderFiles();
  }
  $('#copy-url').addEventListener('click', function () { App.copy($('#sealed-url').textContent, 'Link copied'); });
  $('#copy-status').addEventListener('click', function () { App.copy($('#status-url').textContent, 'Receipt link copied'); });
  $('#copy-pass').addEventListener('click', function () { App.copy($('#sealed-pass').textContent, 'Passphrase copied'); });
  $('#show-pass').addEventListener('click', function (e) {
    var m = $('#sealed-pass').classList.toggle('masked');
    e.target.textContent = m ? 'show' : 'hide';
  });
  $('#again-btn').addEventListener('click', function () {
    state.sealed = false;
    document.body.classList.remove('sealing', 'collapse', 'done');
    $('#sealed').classList.remove('show'); $('#sealed').hidden = true;
    ed.set(''); editorEl.setAttribute('contenteditable', 'true');
    passEl.value = ''; $('#sealed-pass').textContent = ''; $('#hint').value = ''; $('#qr').innerHTML = ''; meter(); count();
    editorEl.focus();
  });

  count(); meter();
  setTimeout(function () { editorEl.focus(); ed.ensureBlock(); }, 30);
})();
