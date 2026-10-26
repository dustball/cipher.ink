/* cipher.ink Secret Santa: what the organizer's page and the card page share. Making a draw into sealed cards, sealing
 * and opening wishlists and notes, plain-text rendering, dates, and this browser's lists.
 *
 * The keys. Per participant P, all made here with crypto.getRandomValues:
 *   K_P  card key (the secret link's key)        L_P  list key: P's wishlist and P's thread are sealed under it
 *   W_P  wishlist write token (P only)            T_P  thread write token (P and P's Santa)
 *   S_P  slot id (where P's wishlist and thread live on the server)
 * P's card holds P's own L, W, T, S, and the giftee's L, T, S (never the giftee's W). The server gets the sealed cards and
 * sha256 of every token. The organizer's copy (the admin blob) holds the names, the card links and the rules, never who
 * drew whom.
 *
 * What it never does: send a name, a key, a token or a word of a wishlist anywhere. Plain ES2017; runs in Node for tests.
 */
(function (root) {
  'use strict';
  var Santa = root.Santa = {};
  var C = function () { return root.Cipher; };
  var ABC = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // the server's own id alphabet (lib.php)

  Santa.MAX = 60; Santa.MIN = 3; Santa.NAME = 40; Santa.NOTE = 500; Santa.WISH = 1500; Santa.MSG = 500;
  Santa.id = function () { var s = ''; for (var i = 0; i < 12; i++) s += ABC.charAt(C().randInt(ABC.length)); return s; };
  Santa.token = function () { return C().b64u(C().rand(18)); };
  Santa.key = function () { return C().b64u(C().rand(32)); };
  Santa.box = async function (obj, key) { return (await C().seal(obj, { link: true, linkKey: key })).payload; };
  Santa.unbox = async function (payload, key) { return (await C().open(payload, { linkKey: key })).data; };

  /* Names: trimmed, inner spaces collapsed, at most 40 characters. */
  Santa.cleanName = function (s) { return String(s).replace(/\s+/g, ' ').trim().slice(0, Santa.NAME); };
  function low(s) { return s.toLocaleLowerCase(); }

  /* Reads the organizer's form text: names one per line, exclusions one group per line, names separated by commas.
   * Returns {names, groups (index lists), groupNames} or {error}. */
  Santa.parse = function (namesText, exclText) {
    var names = [], seen = {};
    String(namesText).split(/\n/).forEach(function (l) { var n = Santa.cleanName(l); if (n) names.push(n); });
    for (var i = 0; i < names.length; i++) {
      if (seen[low(names[i])] !== undefined) return { error: names[i] + ' is on the list twice. Give each person a different name (add an initial).' };
      seen[low(names[i])] = i;
    }
    if (names.length < Santa.MIN) return { error: 'Add at least ' + Santa.MIN + ' people, one name per line.' };
    if (names.length > Santa.MAX) return { error: 'An exchange can have up to ' + Santa.MAX + ' people.' };
    var groups = [], groupNames = [];
    var lines = String(exclText || '').split(/\n/);
    for (var k = 0; k < lines.length; k++) {
      var parts = lines[k].split(/[,;&+]|\band\b/i).map(Santa.cleanName).filter(Boolean);
      if (!parts.length) continue;
      if (parts.length < 2) return { error: 'Exclusion line ' + (k + 1) + ' has one name. Put two or more on a line, separated by commas.' };
      var g = [];
      for (var j = 0; j < parts.length; j++) {
        var at = seen[low(parts[j])];
        if (at === undefined) return { error: '"' + parts[j] + '" (exclusion line ' + (k + 1) + ') is not on the list of people.' };
        if (g.indexOf(at) < 0) g.push(at);
      }
      groups.push(g); groupNames.push(g.map(function (x) { return names[x]; }));
    }
    return { names: names, groups: groups, groupNames: groupNames };
  };

  /* The exchange's expiry: the end of the gift date (local time) plus 30 days, in Unix seconds. */
  Santa.expires = function (ymd) {
    var d = ymd ? new Date(ymd + 'T23:59:59') : new Date(Date.now() + 60 * 86400000);
    return Math.floor(d.getTime() / 1000) + 30 * 86400;
  };

  /* Draw and seal. s: {ex: {title, budget, date, note}, names, groups, groupNames, loop, me, gid?, at?, ak?}.
   * Returns {params (for api.php group_create / group_redraw), gid, ak, admin} or {error}. The assignment exists only
   * inside this function and inside the sealed cards. */
  Santa.build = async function (s) {
    var n = s.names.length;
    var r = root.SantaDraw.draw(n, { groups: s.groups, loop: !!s.loop }, s.names);
    if (!r.ok) return { error: r.reason };
    var gid = s.gid || Santa.id(), ak = s.ak || Santa.key(), at = s.at || Santa.token();
    var P = [];
    for (var i = 0; i < n; i++) P.push({ name: s.names[i], id: Santa.id(), slot: Santa.id(), lk: Santa.key(), wt: Santa.token(), tt: Santa.token(), d: Santa.token() });
    var t = Math.floor(Date.now() / 1000);
    var params = { gid: gid, expires: Santa.expires(s.ex.date), ids: [], cards: [], dels: [], slots: [], wkeys: [], tkeys: [] };
    var people = [];
    for (var a = 0; a < n; a++) {
      var me = P[a], to = P[r.to[a]];
      var sealed = await C().seal({ app: 'santa', v: 1, gid: gid, t: t, d: me.d, ex: s.ex,
        me: { name: me.name, slot: me.slot, lk: me.lk, wt: me.wt, tt: me.tt },
        to: { name: to.name, slot: to.slot, lk: to.lk, tt: to.tt } }, { link: true });
      params.ids.push(me.id); params.cards.push(sealed.payload);
      params.dels.push(await C().sha256hex(me.d)); params.slots.push(me.slot);
      params.wkeys.push(await C().sha256hex(me.wt)); params.tkeys.push(await C().sha256hex(me.tt));
      people.push({ name: me.name, id: me.id, k: sealed.linkKey, d: me.d, slot: me.slot });
    }
    r = null; P = null;   // forget the pairing: from here on it is only inside the sealed cards
    var admin = { app: 'santa-admin', v: 1, gid: gid, at: at, ex: s.ex,
      rules: { names: s.names, groups: s.groupNames, loop: !!s.loop, me: s.me || '' },
      people: people, forgot: false, created: t };
    params.admin = await Santa.box(admin, ak);
    if (!s.at) params.adm = await C().sha256hex(at);
    else params.admin_token = at;
    return { params: params, gid: gid, ak: ak, admin: admin };
  };

  /* Sends a draw, drawing fresh ids if one clashed with a row already on the server (409). */
  Santa.send = async function (s, action) {
    for (var tries = 0; tries < 4; tries++) {
      var b = await Santa.build(s);
      if (b.error) return b;
      try { await root.App.post(action, b.params); return b; }
      catch (e) { if (e.status !== 409) return { error: e.message || 'Could not reach the server.' }; if (!s.at) s.gid = null; }
    }
    return { error: 'Could not store the draw. Try again.' };
  };

  /* Plain text into an element: line breaks kept, http(s) addresses made into links, never HTML. */
  Santa.text = function (el, txt) {
    el.textContent = '';
    String(txt).split(/(https?:\/\/[^\s<>"']+)/).forEach(function (part, i) {
      if (i % 2) {
        var url = part.replace(/[).,;:!?]+$/, ''), rest = part.slice(url.length);
        var a = document.createElement('a'); a.href = url; a.textContent = url;
        a.target = '_blank'; a.rel = 'noopener noreferrer nofollow';
        el.appendChild(a); if (rest) el.appendChild(document.createTextNode(rest));
      } else if (part) el.appendChild(document.createTextNode(part));
    });
  };

  /* "Friday, Dec 18" from "2026-12-18" (no time zone shifts: it is a calendar date). */
  Santa.day = function (ymd) {
    if (!ymd) return '';
    var d = new Date(ymd + 'T12:00:00');
    return isNaN(d) ? ymd : d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  };
  Santa.when = function (ts) { return new Date(ts * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  Santa.today = function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };

  /* This browser's lists, all in try/catch: the pages work without storage. */
  function store(key) {
    return {
      list: function () { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; } },
      save: function (l) { try { localStorage.setItem(key, JSON.stringify(l.slice(0, 100))); return true; } catch (e) { return false; } },
      put: function (item, k) { var l = this.list().filter(function (x) { return x[k] !== item[k]; }); l.unshift(item); return this.save(l); },
      drop: function (v, k) { this.save(this.list().filter(function (x) { return x[k] !== v; })); }
    };
  }
  Santa.groups = store('ci-santa-groups');   // exchanges organized here: {gid, url, title, created}
  Santa.cards = store('ci-santa-cards');     // cards kept here: {id, url, label}
  /* How many times each card was opened in this browser, so a card can tell its owner which earlier opens were theirs. */
  Santa.opens = {
    get: function (id) { try { return (JSON.parse(localStorage.getItem('ci-santa-opens') || '{}')[id]) || 0; } catch (e) { return 0; } },
    bump: function (id) { try { var o = JSON.parse(localStorage.getItem('ci-santa-opens') || '{}'); o[id] = (o[id] || 0) + 1; localStorage.setItem('ci-santa-opens', JSON.stringify(o)); } catch (e) {} }
  };
})(typeof window !== 'undefined' ? window : globalThis);
