// node tests/crypto.test.mjs: legacy OFB compatibility + v2 round trips
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const aesjs = require('./aes-js-2.x.js');
eval(fs.readFileSync(new URL('../assets/crypto.js', import.meta.url), 'utf8'));
const C = globalThis.Cipher;
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };

// Exactly what the 2016 index.php did
function oldEncrypt(plaintext, passphrase, ivt) {
  passphrase = ('x'.repeat(32) + passphrase.substr(0, 32)).slice(-32);
  let text = plaintext.length < 64 ? (plaintext + ' '.repeat(63)).substring(0, 63) : plaintext;
  const key = aesjs.util.convertStringToBytes(passphrase);
  const iv = aesjs.util.convertStringToBytes(ivt);
  const ofb = new aesjs.ModeOfOperation.ofb(key, iv);
  return Array.from(ofb.encrypt(aesjs.util.convertStringToBytes(text)));
}
const cases = [
  ['<p>hi</p>\n', 'secret'],
  ['<p>Long message with ünïcødé → and emoji 🔐 ' + 'lorem ipsum '.repeat(80) + '</p>\n', 'correct horse battery'],
  ['<p>x</p>', 'abcdefghijklmnopqrstuvwxyz0123456789zzzz'],
];
for (const [pt, pass] of cases) {
  const ivt = 'Ab3dEf6hIj9lMn0p';
  const bytes = oldEncrypt(pt, pass, ivt);
  const r = await C.legacyOpen(bytes, ivt, pass);
  ok(r.html === pt.replace(/\s+$/, ''), 'legacy decrypt ' + pass);
  let wrong = false; try { await C.legacyOpen(bytes, ivt, 'q' + pass); } catch (e) { wrong = e.message === 'wrong'; }
  ok(wrong, 'legacy wrong passphrase rejected ' + pass);
}
// randInt: every value reachable, none favoured (the passphrase words used byte % 288 until 2026-10-23)
{
  const n = 288, N = 288000, seen = new Array(n).fill(0);
  for (let i = 0; i < N; i++) seen[C.randInt(n)]++;
  ok(seen.every(c => c > 0), 'randInt(288) reaches every word');
  ok(Math.min(...seen) > 700 && Math.max(...seen) < 1300, 'randInt(288) is roughly uniform (' + Math.min(...seen) + '..' + Math.max(...seen) + ')');
  let inRange = true; for (let i = 0; i < 10000; i++) { const x = C.randInt(90); if (x < 0 || x >= 90) inRange = false; }
  ok(inRange, 'randInt(90) stays in range');
}
const obj = { html: '<p>héllo</p>', t: 1, d: 'tok' };
const a = await C.seal(obj, { passphrase: 'Pässword' });
ok((await C.open(a.payload, { passphrase: 'Pässword' })).data.html === obj.html, 'v2 passphrase round trip');
let w = false; try { await C.open(a.payload, { passphrase: 'password' }); } catch (e) { w = e.message === 'wrong'; }
ok(w, 'v2 wrong passphrase rejected');
const b = await C.seal(obj, { link: true });
ok(b.linkKey.length === 43 && (await C.open(b.payload, { linkKey: b.linkKey })).data.d === 'tok', 'v2 link-key round trip');
const fbytes = new TextEncoder().encode('file body ✓');
const c = await C.seal({ html: '<p>x</p>' }, { passphrase: 'pw' }, [{ name: 'a.txt', type: 'text/plain', bytes: fbytes }]);
const oc = await C.open(c.payload, { passphrase: 'pw' });
const back = await C.openFile(oc.key, oc.data.att[0].iv, c.blobs[0]);
ok(oc.data.att[0].name === 'a.txt' && new TextDecoder().decode(back) === 'file body ✓', 'attachment round trip, name sealed inside');
ok((await C.sha256hex('abc')).startsWith('ba7816bf'), 'sha256');
// The published test vectors (tests/vectors.json, docs/FORMAT.md) must keep opening, byte for byte.
const V = JSON.parse(fs.readFileSync(new URL('./vectors.json', import.meta.url), 'utf8'));
for (const x of V.v2) {
  let r = null; try { r = await C.open(x.payload, x.linkKey ? { linkKey: x.linkKey } : { passphrase: x.passphrase }); } catch (e) { r = null; }
  if (x.fails) { ok(r === null, 'vector: ' + x.name); continue; }
  let same = !!r && JSON.stringify(r.data) === JSON.stringify(x.plaintext);
  for (const [i, f] of (x.files || []).entries()) {
    const back = await C.openFile(r.key, r.data.att[i].iv, C.unb64u(f.encrypted));
    same = same && C.b64u(back) === f.plaintext;
  }
  ok(same, 'vector: ' + x.name);
}
for (const x of V.legacy) ok((await C.legacyOpen(x.enc, x.ivt, x.passphrase)).html === x.html, 'vector: ' + x.name);
process.exit(fail ? 1 : 0);
