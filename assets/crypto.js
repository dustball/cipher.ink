/* cipher.ink crypto: everything that seals or opens a message is in this one file.
 *
 * What it does:       AES-256-GCM through the browser's own Web Crypto API. The key is either derived from a passphrase
 *                     (PBKDF2-SHA256, 600,000 rounds, a fresh random salt) or is 32 random bytes that travel in the
 *                     link's #fragment, which browsers never send to a server.
 * What it never does: send anything anywhere. There is no network code in this file. The server receives only the sealed
 *                     result, and never a passphrase, a link key, a file name or a word of the message.
 * Also here:          a read-only decryptor for the messages sealed between 2016 and 2026 (AES-256-OFB), so old links
 *                     still open. Nothing new is ever written in that format.
 *
 * Annotated, section by section, at https://cipher.ink/code
 */
(function (root) {
  'use strict';
  var C = root.crypto, S = C.subtle;
  var te = new TextEncoder();
  var ITER = 600000;

  /* Base64url. Bytes become text that is safe in a URL: "+" and "/" are swapped for "-" and "_", and the "=" padding is dropped.
   * The secret link's key, every salt and IV, and the ciphertext itself are written this way. The chunked loop keeps
   * String.fromCharCode from choking on large files. */
  function b64u(bytes) {
    var s = '', b = new Uint8Array(bytes);
    for (var i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64u(str) {
    str = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    var s = atob(str), b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }

  /* Random bytes. crypto.getRandomValues is the browser's cryptographically secure generator, the same source it uses for TLS.
   * Math.random is never used for anything secret: the 2016 version of this site did, and that was a mistake. */
  function rand(n) { var b = new Uint8Array(n); C.getRandomValues(b); return b; }
  /* A fair integer in [0, n). The obvious `random % n` favours the low numbers whenever n does not divide 2^32, because the
   * top slice of values is shorter than the others. So any draw from that uneven slice is thrown away and drawn again (rejection
   * sampling), and every outcome gets exactly the same number of chances. The passphrase dice use this. */
  function randInt(n) {
    var lim = Math.floor(4294967296 / n) * n, x = new Uint32Array(1);
    do C.getRandomValues(x); while (x[0] >= lim);
    return x[0] % n;
  }

  /* Passphrases. The same words must give the same key on every device, so the passphrase is first put into Unicode NFC form
   * ("é" typed as one character or as an "e" plus an accent becomes the same bytes). PBKDF2-HMAC-SHA256 then turns it into an
   * AES-256 key: 600,000 rounds of HMAC, mixed with a random salt. Each round must wait for the one before it, so every guess an
   * attacker makes costs as much as opening the message does for you. The key is created non-extractable: JavaScript can use it
   * but cannot read its bytes back out. */
  function norm(p) { return String(p).normalize('NFC'); }

  async function passKey(pass, salt, iter) {
    var base = await S.importKey('raw', te.encode(norm(pass)), 'PBKDF2', false, ['deriveKey']);
    return S.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iter },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  /* A secret-link key is already 256 random bits, so it needs no stretching: it goes straight in as an AES key. */
  function rawKey(bytes) {
    return S.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  /* Sealing: seal(obj, {passphrase} | {link:true, linkKey?}, files?) → {payload, linkKey?, blobs[]}
   * A secret link normally gets a fresh random key; passing linkKey seals under that key instead (the Secret Santa seals
   * every wishlist and note under its owner's list key, which travels inside the cards).
   * One random 12-byte IV per encryption, and AES-GCM, which both hides the message and signs it: a 128-bit tag is appended to
   * the ciphertext, so any change to it, or a wrong key, makes decryption fail instead of returning garbage. Passphrase mode
   * records the iteration count and salt in the payload (they are not secret); link mode records nothing about the key.
   * Attachments (files: [{name, type, bytes: Uint8Array}]) are encrypted with the same key and each with its own IV; their names,
   * types, sizes and IVs go into obj.att, so they are sealed inside the message too. The server gets the payload and the
   * encrypted file bytes, nothing else. */
  async function seal(obj, opt, files) {
    var iv = rand(12), p = { v: 2 }, key, linkKey = null, blobs = [];
    if (opt.link) {
      var kb = rand(32);
      if (opt.linkKey) kb = unb64u(opt.linkKey);
      key = await rawKey(kb);
      linkKey = b64u(kb);
      p.m = 'k';
    } else {
      var salt = rand(16);
      key = await passKey(opt.passphrase, salt, ITER);
      p.m = 'p'; p.it = ITER; p.s = b64u(salt);
    }
    if (files && files.length) {
      obj.att = [];
      for (var i = 0; i < files.length; i++) {
        var fiv = rand(12);
        blobs.push(new Uint8Array(await S.encrypt({ name: 'AES-GCM', iv: fiv }, key, files[i].bytes)));
        obj.att.push({ name: files[i].name, type: files[i].type, size: files[i].bytes.length, iv: b64u(fiv) });
      }
    }
    p.n = b64u(iv);
    p.c = b64u(await S.encrypt({ name: 'AES-GCM', iv: iv }, key, te.encode(JSON.stringify(obj))));
    return { payload: JSON.stringify(p), linkKey: linkKey, blobs: blobs };
  }

  /* Opening: open(payloadString, {passphrase} | {linkKey}) → {data, key}, or throws Error('wrong').
   * The key is rebuilt the same way it was made. If the passphrase or link key is wrong, or the payload was altered, the GCM tag
   * does not verify and decrypt() rejects; nothing is ever rendered from a failed decryption. */
  async function open(payload, opt) {
    var p = typeof payload === 'string' ? JSON.parse(payload) : payload, key;
    if (p.v !== 2) throw new Error('format');
    if (p.m === 'k') key = await rawKey(unb64u(opt.linkKey));
    else key = await passKey(opt.passphrase, unb64u(p.s), p.it);
    var pt;
    try { pt = await S.decrypt({ name: 'AES-GCM', iv: unb64u(p.n) }, key, unb64u(p.c)); }
    catch (e) { throw new Error('wrong'); }
    return { data: JSON.parse(new TextDecoder().decode(pt)), key: key };
  }

  /* Attachments. An attachment is fetched as encrypted bytes and opened with the key open() returned and the IV listed in
   * data.att[n], so only someone who could open the message can open its files. */
  async function openFile(key, ivB64, bytes) {
    return new Uint8Array(await S.decrypt({ name: 'AES-GCM', iv: unb64u(ivB64) }, key, bytes));
  }

  /* The 2016 format (read-only). Messages sealed before October 2026 used AES-256-OFB from a JavaScript library, with the key
   * made from the lowercased passphrase and the message's own id as the IV. The Web Crypto API has no OFB mode, but there is a
   * way round it: OFB's keystream is E(IV), E(E(IV)), E(E(E(IV))), …, and AES-CBC applied to a run of zero blocks produces exactly
   * that, because each zero block XORs into the previous ciphertext block and changes nothing. So CBC-encrypting zeros under
   * the IV *is* the keystream, and XORing it with the old ciphertext decrypts it.
   * OFB has no integrity check, so a wrong passphrase cannot be detected by a failing tag. Instead the output is accepted only
   * if it is clean UTF-8 text without control characters, which random bytes almost never are. */
  async function legacyTry(bytes, ivt, pass) {
    var kb = te.encode(('x'.repeat(32) + pass).slice(-32));
    if (kb.length !== 32) return null;
    var key = await S.importKey('raw', kb, { name: 'AES-CBC' }, false, ['encrypt']);
    var blocks = Math.ceil(bytes.length / 16);
    var ks = new Uint8Array(await S.encrypt({ name: 'AES-CBC', iv: te.encode(ivt) }, key, new Uint8Array(blocks * 16)));
    var out = new Uint8Array(bytes.length);
    for (var i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ ks[i];
    var s;
    try { s = new TextDecoder('utf-8', { fatal: true }).decode(out); } catch (e) { return null; }
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s)) return null;
    return s.replace(/\s+$/, '');
  }
  async function legacyOpen(bytes, ivt, pass) {
    pass = String(pass).replace(/\n/g, '');
    var tries = [pass.toLowerCase().substr(0, 32)];
    if (pass.substr(0, 32) !== tries[0]) tries.push(pass.substr(0, 32));
    for (var i = 0; i < tries.length; i++) {
      var r = await legacyTry(bytes, ivt, tries[i]);
      if (r !== null) return { html: r };
    }
    throw new Error('wrong');
  }

  /* A SHA-256 of a string, as hex. The page uses it to send the server only a hash of the receipt token, never the token. */
  async function sha256hex(str) {
    var h = new Uint8Array(await S.digest('SHA-256', te.encode(str)));
    return Array.prototype.map.call(h, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }

  root.Cipher = { seal: seal, open: open, openFile: openFile, legacyOpen: legacyOpen, b64u: b64u, unb64u: unb64u,
    rand: rand, randInt: randInt, sha256hex: sha256hex, ITER: ITER };
})(typeof window !== 'undefined' ? window : globalThis);
