/* cipher.ink "My messages" drawer and the read-receipt status page (/s/<id>#<token>).
 * The list lives in this browser (App.sent); the server only answers, per message, whether the
 * token matches and what state the message is in.
 *
 * What it never does: send a message's text. It sends only message ids and tokens, and shows what the server answers.
 * Annotated at https://cipher.ink/code
 */
(function () {
  'use strict';
  var $ = App.$;

  function when(ts) {
    var d = new Date(ts * 1000), now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    return sameDay ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function times(n) { return n === 1 ? 'once' : n === 2 ? 'twice' : n + ' times'; }

  /* One description of a message's state, used by both the drawer and the status page. */
  function describe(st) {
    var d = { kind: st.state, title: '', lines: [] };
    if (st.state === 'gone') { d.title = 'Gone'; d.lines.push('The server has no record of it any more.'); return d; }
    if (st.state === 'denied') { d.title = 'Not yours'; d.lines.push('This receipt’s token does not match the message.'); return d; }
    if (st.state === 'live') d.title = st.opens ? 'Opened' : 'Not opened yet';
    if (st.state === 'burned') d.title = 'Opened and burned';
    if (st.state === 'destroyed') d.title = 'Destroyed';
    if (st.state === 'expired') d.title = st.opens ? 'Expired, after being read' : 'Expired unread';
    if (st.state === 'live' && st.opens) d.kind = 'opened';
    d.lines.push('Sealed ' + when(st.created));
    if (st.opens) d.lines.push('Opened ' + (st.state === 'burned' ? '' : times(st.opens) + ', first ') + when(st.opened_at));
    if (st.state === 'destroyed') d.lines.push('Destroyed ' + when(st.ended_at));
    if (st.state === 'expired') d.lines.push('Expired ' + when(st.ended_at));
    if (st.state === 'live') {
      d.lines.push(st.burn ? 'Burns the moment it is opened' : st.expires ? 'Self-destructs in ' + App.until(st.expires) : 'No expiry');
      if (st.files) d.lines.push(st.files + (st.files === 1 ? ' attachment' : ' attachments'));
    }
    return d;
  }

  function status(items) {
    return App.post('status', { ids: items.map(function (x) { return x.id; }), tokens: items.map(function (x) { return x.token; }) })
      .then(function (r) { return r.status || {}; });
  }

  function destroyBtn(item, onDone) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'ghost danger'; b.textContent = 'Destroy';
    var armed = false, t;
    b.addEventListener('click', function () {
      if (!armed) { armed = true; b.textContent = 'Click again to destroy'; b.classList.add('armed'); t = setTimeout(function () { armed = false; b.textContent = 'Destroy'; b.classList.remove('armed'); }, 3500); return; }
      clearTimeout(t); b.disabled = true;
      App.post('burn', { id: item.id, token: item.token }).then(function () { App.toast('Destroyed', 'ok'); onDone(); },
        function (e) { b.disabled = false; App.toast(e.message || 'Could not destroy it.', 'err'); });
    });
    return b;
  }
  function btn(label, fn) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'ghost'; b.textContent = label;
    b.addEventListener('click', fn); return b;
  }
  App.receiptUrl = function (item) { return location.origin + App.data.base + 's/' + item.id + '#' + item.token; };

  /* --- the drawer --- */
  var drawer = $('#mine'), scrim = $('#mine-scrim'), listEl = $('#mine-list'), timer = 0;
  function render(states) {
    var items = App.sent.list();
    listEl.innerHTML = '';
    if (!items.length) {
      var e = document.createElement('p'); e.className = 'mineempty';
      e.textContent = 'Nothing yet. Messages you seal here will show up in this list, with whether they have been opened.';
      listEl.appendChild(e); return;
    }
    items.forEach(function (item) {
      var st = states && states[item.id], d = st ? describe(st) : { kind: 'loading', title: '…', lines: ['Sealed ' + when(item.created)] };
      var row = document.createElement('div'); row.className = 'mine-item';
      var top = document.createElement('div'); top.className = 'mine-top';
      var lab = document.createElement('b'); lab.textContent = item.label || 'Untitled message';
      var chip = document.createElement('span'); chip.className = 'state s-' + d.kind; chip.textContent = d.title;
      top.appendChild(lab); top.appendChild(chip);
      var meta = document.createElement('div'); meta.className = 'mine-meta';
      meta.textContent = d.lines.join(' · ') + (item.mode === 'k' ? ' · secret link' : ' · passphrase');
      var act = document.createElement('div'); act.className = 'mine-act';
      var live = st && st.state === 'live';
      if (live && item.url) act.appendChild(btn('Copy link', function () { App.copy(item.url, 'Link copied'); }));
      act.appendChild(btn('Receipt', function () { window.open(App.receiptUrl(item), '_blank', 'noopener'); }));
      if (live) act.appendChild(destroyBtn(item, refresh));
      act.appendChild(btn('Forget', function () { App.sent.remove(item.id); render(states); }));
      row.appendChild(top); row.appendChild(meta); row.appendChild(act);
      listEl.appendChild(row);
    });
  }
  function refresh() {
    var items = App.sent.list();
    render(null);
    if (!items.length) return;
    status(items).then(render, function () { App.toast('Could not reach the server to check them.', 'err'); });
  }
  function openDrawer(on) {
    if (!drawer) return;
    drawer.hidden = !on; scrim.hidden = !on;
    clearInterval(timer);
    if (on) { refresh(); timer = setInterval(refresh, 30000); $('#mine-close').focus(); }
  }
  App.openMine = function () { openDrawer(true); };
  var mb = $('#mine-btn');
  mb && mb.addEventListener('click', function () { openDrawer(drawer.hidden); });
  $('#mine-close') && $('#mine-close').addEventListener('click', function () { openDrawer(false); });
  scrim && scrim.addEventListener('click', function () { openDrawer(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer && !drawer.hidden) openDrawer(false); });
  $('#mine-clear') && $('#mine-clear').addEventListener('click', function (e) {
    var b = e.currentTarget;
    if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Click again to clear (messages stay on the server)'; setTimeout(function () { b.classList.remove('armed'); b.textContent = 'Clear this list'; }, 3500); return; }
    App.sent.clear(); b.classList.remove('armed'); b.textContent = 'Clear this list'; render(null);
  });

  /* --- the status page --- */
  if (App.data.page !== 'status') return;
  var token = location.hash.slice(1), card = $('#receipt');
  var item = { id: App.data.id, token: token };
  var known = App.sent.list().filter(function (x) { return x.id === item.id; })[0];
  function show() {
    if (!token) { $('#r-title').textContent = 'Missing its token'; $('#r-lines').textContent = 'A receipt link ends in # and a long token. Copy the whole link.'; return; }
    status([item]).then(function (s) {
      var st = s[item.id] || { state: 'gone' }, d = describe(st);
      card.className = 'card receipt s-' + d.kind;
      $('#r-title').textContent = d.title;
      var ul = $('#r-lines'); ul.innerHTML = '';
      d.lines.forEach(function (l) { var li = document.createElement('li'); li.textContent = l; ul.appendChild(li); });
      if (st.hint) { var li = document.createElement('li'); li.textContent = 'Hint shown to readers: “' + st.hint + '”'; ul.appendChild(li); }
      var act = $('#r-act'); act.innerHTML = '';
      if (st.state === 'live') act.appendChild(destroyBtn(item, show));
      if (st.state !== 'denied' && st.state !== 'gone' && !known) {
        act.appendChild(btn('Add to My messages', function (e) {
          App.sent.add({ id: item.id, token: token, url: '', label: 'Tracked message', created: st.created, mode: st.mode });
          known = true; e.currentTarget.remove(); App.toast('Added to My messages', 'ok');
        }));
      }
      act.appendChild(btn('Refresh', show));
    }, function (e) { $('#r-title').textContent = 'Could not check'; $('#r-lines').textContent = e.message; });
  }
  show();
  setInterval(show, 30000);
})();
