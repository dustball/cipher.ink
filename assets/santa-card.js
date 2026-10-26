/* cipher.ink Secret Santa: one participant's card (/santa/<id>#<key>). It opens the card in this tab, says whether anyone
 * opened it before, reveals who you're buying for, and runs the two sealed threads: you and your giftee, you and your Santa.
 *
 * Opening, in this order: (1) decrypt the card with the key from the #fragment; (2) ask the server how many times this card
 * was opened before (status, with the token sealed inside the card); (3) record this open (opened, the same token);
 * (4) fetch every slot and note of the whole group at once (group_read), so the server can't tell from the reads whose
 * wishlist this card wanted; (5) open only the two lists this card holds keys for.
 *
 * What it never does: send a name, a key, a wishlist or a note in the clear. Everything written here is sealed under its
 * owner's list key before it leaves the tab. Wishlists and notes are plain text, shown with textContent, never as HTML.
 * Plain ES2017, unminified, no build step; this file is served exactly as you see it.
 */
(function () {
  'use strict';
  var $ = App.$, D = App.data;
  var Wall = App.wall($('#wall'), (function () { try { return JSON.parse(D.payload).c; } catch (e) { return ''; } })());
  var form = $('#unlock'), btn = $('#open-btn'), err = $('#err');
  var linkKey = keyFrom(location.hash), card = null, prior = null;

  function keyFrom(s) {
    s = String(s || '').trim();
    var i = s.indexOf('#'); if (i >= 0) s = s.slice(i + 1);
    return /^[A-Za-z0-9_-]{43}$/.test(s) ? s : null;
  }
  if (!linkKey) $('#keyrow').hidden = false;
  if (D.expires) $('#meta').textContent = 'Sealed in the organizer’s browser · deletes itself in ' + App.until(D.expires);
  setTimeout(function () { (linkKey ? btn : $('#keyin')).focus(); }, 60);

  function fail(msg) {
    err.textContent = msg;
    form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
    btn.classList.remove('busy'); btn.disabled = false; btn.querySelector('.lbl').textContent = 'Open my card';
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (btn.disabled) return;
    err.textContent = '';
    if (!linkKey) { linkKey = keyFrom($('#keyin').value); if (!linkKey) return fail('That doesn’t contain a key. It is the long part after the #.'); }
    btn.disabled = true; btn.classList.add('busy'); btn.querySelector('.lbl').textContent = 'Opening…';
    try { card = (await Cipher.open(D.payload, { linkKey: linkKey })).data; }
    catch (x) { linkKey = null; $('#keyrow').hidden = false; return fail('That key doesn’t open this card. Check you copied the whole link.'); }
    if (card.app !== 'santa') { location.replace(D.base + 'm/' + D.id + '#' + linkKey); return; }
    // Opened before? Ask first, then record this open. A link preview can't do either: it can't decrypt the card.
    try {
      var st = await App.post('status', { ids: [D.id], tokens: [card.d] });
      prior = st.status[D.id];
    } catch (x) { prior = null; }
    App.post('opened', { id: D.id, token: card.d }).catch(function () {});
    var here = Santa.opens.get(D.id);
    Santa.opens.bump(D.id);
    reveal(here);
  });

  async function reveal(here) {
    btn.querySelector('.lbl').textContent = 'Opened';
    document.body.classList.add('opening');
    Wall.dissolve();
    form.classList.add('unlocked');
    await new Promise(function (r) { setTimeout(r, App.reduced ? 0 : 650); });
    $('#vault').hidden = true;
    var reader = $('#reader');
    reader.hidden = false;
    document.body.classList.add('reading');
    requestAnimationFrame(function () { reader.classList.add('show'); });

    var ex = card.ex || {}, to = card.to.name, me = card.me.name;
    document.title = 'Your Secret Santa draw';
    $('#c-title').textContent = (ex.title ? ex.title + ' · ' : '') + 'for ' + me;
    var who = $('#c-who');
    who.textContent = 'You’re buying for ' + to + '.';
    App.scramble(who, 'decrypt', 1400);
    var bits = [];
    if (ex.budget) bits.push('Budget ' + ex.budget);
    if (ex.date) bits.push('Gifts on ' + Santa.day(ex.date));
    $('#c-details').textContent = bits.join(' · ');
    if (ex.note) { var n = $('#c-note'); n.hidden = false; Santa.text(n, ex.note); }

    // Tamper evidence: the owner knows whether the earlier opens were theirs.
    var o = $('#c-opened');
    if (!prior || !prior.state || prior.state === 'denied') o.textContent = 'Could not check whether this card was opened before.';
    else if (!prior.opens) { o.textContent = 'You’re the first to open this card.'; o.className = 'ss-opened first'; }
    else {
      var t = prior.opens === 1 ? 'once' : prior.opens + ' times';
      var mine = here >= prior.opens ? ' Every one of those was in this browser.' : here ? ' ' + here + ' of those ' + (here === 1 ? 'was' : 'were') + ' in this browser.' : ' None of those was in this browser.';
      o.textContent = 'This card was opened ' + t + ' before, first on ' + Santa.when(prior.opened_at) + '.' + mine;
      o.className = 'ss-opened' + (here >= prior.opens ? '' : ' warn');
    }

    $('#c-wish-h').textContent = to + '’s wishlist';
    $('#c-ask-h').textContent = 'Ask ' + to + ' anonymously';
    $('#c-ask-fine').textContent = to + ' sees your question as “Your Santa asks” and can answer without knowing who you are. Nobody else can read it, us included.';
    $('#c-ask-in').placeholder = 'What size are you? Allergic to anything?';
    $('#c-mine-in').placeholder = 'Answer here';
    $('#c-mywish').placeholder = 'Ideas, sizes, a link or two. Plain text.';
    if (D.expires) $('#c-expiry').textContent = 'This card, both wishlists and every note delete themselves on ' + new Date(D.expires * 1000).toLocaleDateString([], { dateStyle: 'long' }) + '.';
    if (ex.date && Santa.today() >= ex.date) {
      $('#c-unmask').hidden = false;
      $('#c-unmask-btn').textContent = 'The gifts are out: tell ' + to + ' it was you';
    }
    await load();
  }

  /* Everything in the group, sealed; this card opens only its giftee's list and its own. */
  async function load() {
    var g;
    try { g = await App.post('group_read', { gid: card.gid }); }
    catch (x) { $('#c-wish').textContent = x.status === 404 ? 'This exchange has ended.' : 'Could not load the wishlists. Try Refresh.'; return; }
    var theirs = g.slots[card.to.slot] || { payload: '', notes: [] }, mine = g.slots[card.me.slot] || { payload: '', notes: [] };
    var w = $('#c-wish');
    if (!theirs.payload) { w.textContent = card.to.name + ' hasn’t written a wishlist yet. Ask below, or check back later.'; w.className = 'ss-wish empty'; }
    else {
      try { var x = await Santa.unbox(theirs.payload, card.to.lk); Santa.text(w, x.txt); w.className = 'ss-wish'; }
      catch (e) { w.textContent = 'This wishlist could not be opened.'; }
    }
    if (mine.payload && !$('#c-mywish').dataset.loaded) {
      try { $('#c-mywish').value = (await Santa.unbox(mine.payload, card.me.lk)).txt; } catch (e) {}
    }
    $('#c-mywish').dataset.loaded = '1';
    await thread($('#c-ask'), theirs.notes, card.to.lk, { s: 'You asked', g: card.to.name + ' answered' });
    await thread($('#c-mine'), mine.notes, card.me.lk, { s: 'Your Santa', g: 'You answered' });
  }

  async function thread(box, notes, key, who) {
    box.textContent = '';
    if (!notes.length) { var e = document.createElement('p'); e.className = 'fine'; e.textContent = 'Nothing here yet.'; box.appendChild(e); return; }
    for (var i = 0; i < notes.length; i++) {
      var n;
      try { n = await Santa.unbox(notes[i].payload, key); } catch (x) { continue; }
      var row = document.createElement('div'); row.className = 'ss-msg ' + (n.r === 'g' ? 'g' : 's') + (n.u ? ' unmask' : '');
      var h = document.createElement('b'); h.textContent = (n.u ? 'Your Santa unmasked' : who[n.r === 'g' ? 'g' : 's']) + ' · ' + Santa.when(notes[i].created);
      var p = document.createElement('p'); Santa.text(p, n.txt);
      row.appendChild(h); row.appendChild(p); box.appendChild(row);
    }
  }

  async function send(slot, key, token, r, txt, extra) {
    var obj = { r: r, txt: txt, t: Math.floor(Date.now() / 1000) };
    if (extra) obj.u = 1;
    var payload = await Santa.box(obj, key);
    if (payload.length > 1536) throw new Error('That note is too long. Keep it shorter.');
    await App.post('note_add', { slot: slot, ttoken: token, payload: payload });
  }

  function sayForm(formEl, input, side, r) {
    formEl.addEventListener('submit', async function (e) {
      e.preventDefault();
      var txt = input.value.trim(), b = formEl.querySelector('button');
      if (!txt) return input.focus();
      b.disabled = true;
      try { await send(card[side].slot, card[side].lk, card[side].tt, r, txt.slice(0, Santa.MSG)); input.value = ''; await load(); App.toast('Sent, sealed', 'ok'); }
      catch (x) { App.toast(x.message || 'Could not send it.', 'err'); }
      b.disabled = false;
    });
  }
  sayForm($('#c-ask-form'), $('#c-ask-in'), 'to', 's');     // into the giftee's thread, as their Santa
  sayForm($('#c-mine-form'), $('#c-mine-in'), 'me', 'g');   // into my own thread, as the giftee

  $('#c-mywish-save').addEventListener('click', async function () {
    var b = this, st = $('#c-mywish-st'), txt = $('#c-mywish').value.trim().slice(0, Santa.WISH);
    b.disabled = true; st.textContent = 'Sealing…';
    try {
      var payload = txt ? await Santa.box({ txt: txt, t: Math.floor(Date.now() / 1000) }, card.me.lk) : '';
      if (payload.length > 4096) throw new Error('That wishlist is too long. Trim it a little.');
      await App.post('slot_put', { slot: card.me.slot, wtoken: card.me.wt, payload: payload });
      st.textContent = txt ? 'Saved. Only your Santa can read it.' : 'Cleared.';
    } catch (x) { st.textContent = x.message || 'Could not save it.'; }
    b.disabled = false;
  });

  $('#c-unmask-btn').addEventListener('click', async function () {
    var b = this;
    if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Click again to sign “It was me, ' + card.me.name + '”'; return; }
    b.disabled = true;
    try { await send(card.to.slot, card.to.lk, card.to.tt, 's', 'It was me, ' + card.me.name + '.', true); await load(); b.hidden = true; }
    catch (x) { App.toast(x.message || 'Could not send it.', 'err'); b.disabled = false; }
  });

  $('#c-refresh').addEventListener('click', function () { load(); });
  $('#c-keep').addEventListener('click', function () {
    var ok = Santa.cards.put({ id: D.id, url: location.origin + D.base + 'santa/' + D.id + '#' + linkKey,
      label: (card.ex && card.ex.title ? card.ex.title + ' · ' : '') + card.me.name, kept: Math.floor(Date.now() / 1000) }, 'id');
    this.textContent = ok ? 'Kept in this browser' : 'This browser won’t store it';
    this.disabled = true;
  });
})();
