// node tests/make-vectors.mjs > tests/vectors.json
// Test vectors for docs/FORMAT.md, made once with the real assets/crypto.js (and, for the 2016 format, the same aes-js 2.x
// encryption the old site ran). Every value is random at creation, so re-running gives different but equally valid vectors;
// tests/crypto.test.mjs checks that every vector in the committed file still opens.
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const aesjs = require('./aes-js-2.x.js');
eval(fs.readFileSync(new URL('../assets/crypto.js', import.meta.url), 'utf8'));
const C = globalThis.Cipher;
const te = new TextEncoder();

function oldEncrypt(plaintext, passphrase, ivt) {   // exactly what the 2016 index.php did
  passphrase = ('x'.repeat(32) + passphrase.substr(0, 32)).slice(-32);
  const text = plaintext.length < 64 ? (plaintext + ' '.repeat(63)).substring(0, 63) : plaintext;
  const ofb = new aesjs.ModeOfOperation.ofb(aesjs.util.convertStringToBytes(passphrase), aesjs.util.convertStringToBytes(ivt));
  return Array.from(ofb.encrypt(aesjs.util.convertStringToBytes(text)));
}

const v = { note: 'See docs/FORMAT.md. Binary values are base64url without padding, as in the payload.', v2: [], legacy: [] };
const msg = { html: '<p>Meet at the <b>north</b> gate at 7.</p>', t: 1761264000, d: 'Zm9yLXRoZS12ZWN0b3JzLW9ubHk' };

let s = await C.seal(msg, { link: true });
v.v2.push({ name: 'secret link', linkKey: s.linkKey, payload: s.payload, plaintext: msg });

s = await C.seal(msg, { passphrase: 'correct horse battery staple' });
v.v2.push({ name: 'passphrase', passphrase: 'correct horse battery staple', payload: s.payload, plaintext: msg });

// NFC: sealed with "é" as one code point, opened with "e" + combining acute (both normalise to the same bytes).
s = await C.seal({ html: '<p>café</p>', t: 1761264000, d: 'bmZj' }, { passphrase: 'caf' + String.fromCharCode(0xe9) + ' au lait' });
v.v2.push({ name: 'passphrase, NFC', passphrase: 'cafe' + String.fromCharCode(0x301) + ' au lait', payload: s.payload, plaintext: { html: '<p>café</p>', t: 1761264000, d: 'bmZj' } });

const file = te.encode('attachment body: 42\n');
s = await C.seal({ html: '<p>See the file.</p>', t: 1761264000, d: 'ZmlsZQ' }, { link: true }, [{ name: 'notes.txt', type: 'text/plain', bytes: file }]);
const o = await C.open(s.payload, { linkKey: s.linkKey });
v.v2.push({ name: 'secret link with one attachment', linkKey: s.linkKey, payload: s.payload, plaintext: o.data,
  files: [{ encrypted: C.b64u(s.blobs[0]), plaintext: C.b64u(file) }] });

// Tampered: one character of the ciphertext changed. Must fail to open.
s = await C.seal(msg, { link: true });
const p = JSON.parse(s.payload); p.c = (p.c[0] === 'A' ? 'B' : 'A') + p.c.slice(1);
v.v2.push({ name: 'tampered ciphertext (must fail)', linkKey: s.linkKey, payload: JSON.stringify(p), fails: true });

const ivt = 'Ab3dEf6hIj9lMn0p';
v.legacy.push({ name: '2016 format', ivt, passphrase: 'Secret', enc: oldEncrypt('<p>sealed in 2016</p>', 'secret', ivt), html: '<p>sealed in 2016</p>' });
console.log(JSON.stringify(v, null, 1));
