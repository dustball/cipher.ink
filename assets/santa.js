/* cipher.ink Secret Santa: the organizer. Two pages use it:
 *   /secret-santa     the form: name the exchange, list the people and the rules, draw. The draw and the sealing happen in
 *                     this tab (santa-draw.js, santa-lib.js); only sealed cards and hashes are sent.
 *   /santa/g/<gid>    the hand-out page: each person's link, Copy, Share, QR, printed cards, and whether each card has been
 *                     opened. It never shows who drew whom: it doesn't know. Its sealed copy holds the card links, not the
 *                     pairing, and "Forget the links" removes even the links.
 * Plain ES2017, unminified, no build step; this file is served exactly as you see it.
 */
(function () {
  'use strict';
  var $ = App.$, D = App.data;

  function cardUrl(p) { return location.origin + D.base + 'santa/' + p.id + '#' + p.k; }
  function groupUrl(gid, ak) { return location.origin + D.base + 'santa/g/' + gid + '#' + ak; }

  function qrCanvas(text, px) {
    var q = qrcode(0, 'M'); q.addData(text); q.make();
    var n = q.getModuleCount(), cell = Math.max(2, Math.floor(px / (n + 8))), size = (n + 8) * cell;
    var cv = document.createElement('canvas'); cv.width = size; cv.height = size;
    var c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, size, size); c.fillStyle = '#111';
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (q.isDark(y, x)) c.fillRect((x + 4) * cell, (y + 4) * cell, cell, cell);
    cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'QR code of the card link');
    return cv;
  }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  /* ---------------- the form (/secret-santa) ---------------- */
  var F = $('#ss-form');
  if (F) {
    var namesEl = $('#ss-names'), exclEl = $('#ss-excl'), meEl = $('#ss-me'), errEl = $('#ss-err'), go = $('#ss-go');
    var d = new Date(), y = d.getMonth() === 11 && d.getDate() > 20 ? d.getFullYear() + 1 : d.getFullYear();
    if (!$('#ss-date').value) $('#ss-date').value = y + '-12-18';
    $('#ss-date').min = Santa.today();

    // Who is organizing: a choice among the names, kept in step as the list changes.
    function refresh() {
      var p = Santa.parse(namesEl.value, '');
      var names = p.names || String(namesEl.value).split(/\n/).map(Santa.cleanName).filter(Boolean);
      var cur = meEl.value;
      meEl.textContent = '';
      meEl.appendChild(el('option', '', 'I’m not in the draw')).value = '';
      names.forEach(function (n) { var o = el('option', '', 'I’m ' + n); o.value = n; meEl.appendChild(o); });
      if (names.indexOf(cur) >= 0) meEl.value = cur;
      count();
    }
    // How many valid draws these rules allow (exact for no exclusions, couples, or one big loop without exclusions).
    function count() {
      var out = $('#ss-count'), p = Santa.parse(namesEl.value, exclEl.value);
      if (p.error) { out.textContent = ''; return; }
      var n = p.names.length, loop = $('#ss-loop').checked, couples = p.groups.every(function (g) { return g.length === 2; });
      var used = {}, disjoint = p.groups.every(function (g) { return g.every(function (i) { if (used[i]) return false; used[i] = true; return true; }); });
      var c = null;
      if (loop && !p.groups.length) c = SantaDraw.loops(n);
      else if (!loop && couples && disjoint) c = SantaDraw.countWithCouples(n, p.groups.length);
      out.textContent = c === null ? n + ' people.' : n + ' people, ' + c.toLocaleString() + ' possible draws' + (loop ? ' as one loop' : '') + '. Yours will be one of them, every one equally likely.';
    }
    namesEl.addEventListener('input', refresh);
    exclEl.addEventListener('input', count);
    $('#ss-loop').addEventListener('change', count);
    refresh();

    F.addEventListener('submit', async function (e) {
      e.preventDefault();
      errEl.textContent = '';
      var p = Santa.parse(namesEl.value, exclEl.value);
      if (p.error) { errEl.textContent = p.error; return; }
      var ex = { title: $('#ss-title').value.trim().slice(0, 60), budget: $('#ss-budget').value.trim().slice(0, 24),
        date: $('#ss-date').value, note: $('#ss-note').value.trim().slice(0, Santa.NOTE) };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ex.date)) { errEl.textContent = 'Pick the day the gifts are exchanged.'; return; }
      go.disabled = true; go.textContent = 'Drawing and sealing…';
      var r = await Santa.send({ ex: ex, names: p.names, groups: p.groups, groupNames: p.groupNames, loop: $('#ss-loop').checked, me: meEl.value }, 'group_create');
      if (r.error) { errEl.textContent = r.error; go.disabled = false; go.textContent = 'Draw names'; return; }
      Santa.groups.put({ gid: r.gid, url: groupUrl(r.gid, r.ak), title: ex.title || 'Secret Santa', created: Math.floor(Date.now() / 1000) }, 'gid');
      F.dataset.done = '1';
      location.assign(groupUrl(r.gid, r.ak));
    });

    // Exchanges organized and cards kept in this browser.
    var mine = $('#ss-mine'), gl = Santa.groups.list(), cl = Santa.cards.list();
    if (mine && (gl.length || cl.length)) {
      mine.hidden = false;
      var ul = $('#ss-mine-list');
      gl.forEach(function (g) { var li = el('li'), a = el('a', '', g.title); a.href = g.url; li.appendChild(a); li.appendChild(el('span', 'fine', ' · organized ' + App.ago(g.created))); ul.appendChild(li); });
      cl.forEach(function (c) { var li = el('li'), a = el('a', '', 'Your card: ' + c.label); a.href = c.url; li.appendChild(a); ul.appendChild(li); });
    }
    return;
  }

  /* ---------------- the hand-out page (/santa/g/<gid>) ---------------- */
  if (D.kind !== 'group') return;
  var ak = (location.hash || '').slice(1), admin = null, gerr = $('#g-err');
  if (!/^[A-Za-z0-9_-]{43}$/.test(ak)) { gerr.textContent = 'This link is missing its key, the part after the #. Open the exact link this page gave you, or the one saved in this browser’s list on the Secret Santa page.'; return; }

  Cipher.open(D.admin, { linkKey: ak }).then(function (o) { admin = o.data; render(); }, function () {
    gerr.textContent = 'This key doesn’t open the exchange. Check you copied the whole link.';
  });

  function render() {
    var ex = admin.ex || {};
    document.title = (ex.title || 'Secret Santa') + ' · organizer';
    $('#g-title').textContent = ex.title || 'Your Secret Santa';
    var bits = [admin.people.length + ' people'];
    if (ex.budget) bits.push('budget ' + ex.budget);
    if (ex.date) bits.push('gifts on ' + Santa.day(ex.date));
    if (admin.rules.loop) bits.push('one big loop');
    $('#g-details').textContent = bits.join(' · ');
    $('#g-lede').textContent = admin.forgot
      ? 'You’ve forgotten the links, so this page can’t open any card. It still shows who has opened theirs.'
      : 'Send each person their own link: by chat, by text, as a QR code, or on a printed card. You never see who drew whom, and if anyone opens someone else’s card, its owner is told it was opened before.';
    $('#g-body').hidden = false;
    $('#g-self').textContent = groupUrl(admin.gid, ak);
    $('#g-expiry').textContent = 'Otherwise everything deletes itself on ' + new Date(D.expires * 1000).toLocaleDateString([], { dateStyle: 'long' }) + '.';
    $('#g-copyall').hidden = $('#g-print').hidden = $('#g-forget-sec').hidden = !!admin.forgot;
    Santa.groups.put({ gid: admin.gid, url: groupUrl(admin.gid, ak), title: ex.title || 'Secret Santa', created: admin.created }, 'gid');
    var ul = $('#g-people'); ul.textContent = '';
    admin.people.forEach(function (p) {
      var li = el('li', 'ss-person'); li.dataset.id = p.id;
      var top = el('div', 'ss-ptop');
      top.appendChild(el('b', 'ss-name', p.name + (admin.rules.me === p.name ? ' (you)' : '')));
      top.appendChild(el('span', 'ss-st', 'checking…'));
      top.appendChild(el('span', 'ss-wl', ''));
      li.appendChild(top);
      if (p.k) {
        var row = el('div', 'ss-acts'), url = cardUrl(p);
        var copy = el('button', 'ghost', 'Copy link'); copy.type = 'button';
        copy.addEventListener('click', function () { App.copy(url, p.name + '’s link copied'); });
        row.appendChild(copy);
        if (navigator.share) {
          var sh = el('button', 'ghost', 'Share'); sh.type = 'button';
          sh.addEventListener('click', function () { navigator.share({ title: 'Your Secret Santa draw', text: 'Your Secret Santa card, ' + p.name + ':', url: url }).catch(function () {}); });
          row.appendChild(sh);
        }
        var qb = el('button', 'ghost', 'QR code'); qb.type = 'button';
        var qbox = el('div', 'ss-qr'); qbox.hidden = true;
        qb.addEventListener('click', function () {
          if (!qbox.firstChild) qbox.appendChild(qrCanvas(url, 220));
          qbox.hidden = !qbox.hidden; qb.textContent = qbox.hidden ? 'QR code' : 'Hide QR code';
        });
        row.appendChild(qb);
        if (admin.rules.me === p.name) { var mine = el('a', 'ghost btn', 'Open your card ↗'); mine.href = url; mine.target = '_blank'; mine.rel = 'noopener'; row.appendChild(mine); }
        li.appendChild(row); li.appendChild(qbox);
      }
      ul.appendChild(li);
    });
    statuses();
  }

  function statuses() {
    var ids = admin.people.map(function (p) { return p.id; }), toks = admin.people.map(function (p) { return p.d; });
    App.post('status', { ids: ids, tokens: toks }).then(function (r) {
      admin.people.forEach(function (p) {
        var s = r.status[p.id], li = $('li[data-id="' + p.id + '"] .ss-st');
        if (!li) return;
        if (!s || s.state !== 'live') { li.textContent = s && s.state === 'destroyed' ? 'torn up' : 'gone'; return; }
        li.textContent = s.opens ? 'Opened ' + (s.opens > 1 ? s.opens + ' times, first ' : '') + Santa.when(s.opened_at) : 'Not opened yet';
        li.className = 'ss-st' + (s.opens ? ' on' : '');
      });
    }, function () {});
    App.post('group_status', { gid: admin.gid }).then(function (r) {
      admin.people.forEach(function (p) {
        var s = r.slots[p.slot], w = $('li[data-id="' + p.id + '"] .ss-wl');
        if (w) { w.textContent = s && s.updated ? 'wishlist written' : ''; }
      });
    }, function (x) { if (x.status === 404) gerr.textContent = 'This exchange has ended.'; });
  }

  $('#g-refresh').addEventListener('click', statuses);
  $('#g-self-copy').addEventListener('click', function () { App.copy(groupUrl(admin.gid, ak), 'This page’s link copied'); });
  $('#g-copyall').addEventListener('click', function () {
    App.copy(admin.people.map(function (p) { return p.name + ': ' + cardUrl(p); }).join('\n'), 'Every link copied');
  });

  /* Printed cards: one fold-over card per person, their name outside and the QR code inside. Made here, sent nowhere. */
  $('#g-print').addEventListener('click', function () {
    var box = $('#g-printcards'); box.textContent = '';
    admin.people.forEach(function (p) {
      var c = el('div', 'pc'), out = el('div', 'pc-out'), inn = el('div', 'pc-in');
      var logo = el('img', 'pc-logo'); logo.src = D.base + 'assets/logo.svg'; logo.alt = ''; logo.width = 40; logo.height = 40;
      out.appendChild(logo); out.appendChild(el('p', 'pc-for', 'For ' + p.name));
      out.appendChild(el('p', 'pc-sub', (admin.ex.title || 'Secret Santa') + (admin.ex.date ? ' · ' + Santa.day(admin.ex.date) : '')));
      var img = el('img', 'pc-qr'); img.src = qrCanvas(cardUrl(p), 300).toDataURL('image/png'); img.alt = 'QR code';
      inn.appendChild(img); inn.appendChild(el('p', 'pc-scan', 'Scan to see who you’re buying for.'));
      inn.appendChild(el('p', 'pc-sub', 'Sealed on cipher.ink. Only this card opens it.'));
      c.appendChild(out); c.appendChild(el('div', 'pc-fold')); c.appendChild(inn); c.appendChild(el('div', 'pc-fold'));
      c.appendChild(el('div', 'pc-flap', 'Fold this flap up along the dashed line to cover the code.'));
      box.appendChild(c);
    });
    setTimeout(function () { window.print(); }, 150);
  });

  function armed(b, label, fn) {
    var t0 = b.textContent;
    b.addEventListener('click', function () {
      if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = label; setTimeout(function () { b.classList.remove('armed'); b.textContent = t0; }, 4000); return; }
      b.disabled = true; fn().then(function () { b.disabled = false; }, function (x) { b.disabled = false; App.toast(x.message || 'Could not reach the server.', 'err'); });
    });
  }

  armed($('#g-forget'), 'Click again: forget every link', async function () {
    var copy = JSON.parse(JSON.stringify(admin));
    copy.people.forEach(function (p) { p.k = null; });
    copy.forgot = true;
    await App.post('group_admin', { gid: admin.gid, admin_token: admin.at, admin: await Santa.box(copy, ak) });
    admin = copy; render(); App.toast('Forgotten. This page can no longer open any card.', 'ok');
  });

  armed($('#g-end'), 'Click again: delete everything now', async function () {
    await App.post('group_end', { gid: admin.gid, admin_token: admin.at });
    Santa.groups.drop(admin.gid, 'gid');
    $('#g-body').hidden = true; $('#g-lede').textContent = '';
    gerr.textContent = 'Ended. Every card, wishlist and note is gone from the server.';
  });

  $('#g-redraw-open').addEventListener('click', function () {
    var f = $('#g-redraw'); f.hidden = !f.hidden;
    $('#g-names').value = admin.rules.names.join('\n');
    $('#g-excl').value = (admin.rules.groups || []).map(function (g) { return g.join(', '); }).join('\n');
    $('#g-loop').checked = !!admin.rules.loop;
  });
  $('#g-redraw').addEventListener('submit', async function (e) {
    e.preventDefault();
    var er = $('#g-redraw-err'), b = $('#g-redraw-go'); er.textContent = '';
    var p = Santa.parse($('#g-names').value, $('#g-excl').value);
    if (p.error) { er.textContent = p.error; return; }
    if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Click again: tear up every card'; return; }
    b.disabled = true; b.textContent = 'Drawing and sealing…';
    var me = p.names.indexOf(admin.rules.me) >= 0 ? admin.rules.me : '';
    var r = await Santa.send({ ex: admin.ex, names: p.names, groups: p.groups, groupNames: p.groupNames, loop: $('#g-loop').checked, me: me,
      gid: admin.gid, at: admin.at, ak: ak }, 'group_redraw');
    if (r.error) { er.textContent = r.error; b.disabled = false; b.textContent = 'Redraw'; b.classList.remove('armed'); return; }
    admin = r.admin; $('#g-redraw').hidden = true; b.disabled = false; b.textContent = 'Redraw'; b.classList.remove('armed');
    render(); App.toast('Redrawn. Send everyone their new link.', 'ok');
  });
})();
