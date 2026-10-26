# The message format

Enough to write your own client that opens (or seals) cipher.ink messages without our JavaScript.
The reference is [`assets/crypto.js`](../assets/crypto.js); the test vectors are
[`tests/vectors.json`](../tests/vectors.json), and `node tests/crypto.test.mjs` checks every one of them.

Notation: **b64u** is base64url (RFC 4648 §5: `-` and `_` for `+` and `/`) with the `=` padding removed.
All text is UTF-8.

## v2 (every message sealed since October 2026)

### The payload

What the server stores and hands back is one JSON object, the *payload*:

| Field | Mode | Value |
|---|---|---|
| `v` | both | `2` |
| `m` | both | `"k"` for a secret link, `"p"` for a passphrase |
| `it` | `p` | PBKDF2 iteration count (600000 today; read it, don't assume it) |
| `s` | `p` | b64u of the 16-byte random salt |
| `n` | both | b64u of the 12-byte random AES-GCM nonce |
| `c` | both | b64u of the AES-256-GCM ciphertext with its 16-byte tag appended (the Web Crypto layout) |

There is no additional authenticated data. A secret-link payload records nothing about its key.

### The key

- **Secret link** (`m: "k"`): 32 random bytes. They travel in the link's fragment, `https://cipher.ink/m/<id>#<b64u key>`
  (43 characters), which browsers never send to a server. The bytes are the AES-256 key as they are.
- **Passphrase** (`m: "p"`): normalise the passphrase to Unicode **NFC**, encode it as UTF-8, and derive 32 bytes with
  **PBKDF2-HMAC-SHA256** using salt `s` and `it` iterations. That is the AES-256 key.

### Opening

Decrypt `c` with AES-256-GCM, key as above, nonce `n`. If the tag does not verify, the key is wrong or the payload was
altered; show nothing. On success the plaintext is UTF-8 JSON, the *message object*:

| Field | Value |
|---|---|
| `html` | the message, as HTML. **Treat it as hostile**: sanitise it before rendering (cipher.ink uses DOMPurify with an allowlist and a strict CSP; see [SECURITY.md](SECURITY.md)) |
| `t` | when it was sealed, Unix seconds |
| `d` | the message's token. The server keeps only `sha256(d)` (hex), and asks for `d` itself to record an open, to burn the message after reading, or to destroy it |
| `att` | optional: one entry per attachment, `{name, type, size, iv}`, with `iv` the b64u of that file's own 12-byte nonce |

### Attachments

Each attachment is stored on the server as its own ciphertext (`POST api.php` with `action=file`, `id` and `n`, the
attachment's index; see [API.md](API.md)). Decrypt it with AES-256-GCM under **the same key** as the message and the nonce `att[n].iv`. The file's
name and type exist only inside the message object, so the server never sees them.

### Sealing

The reverse, with fresh randomness every time: a new 12-byte nonce for the message and for every file, and in
passphrase mode a new 16-byte salt. Never reuse a nonce under the same key. Then `POST api.php` with `action=create`
(the fields are in [API.md](API.md)).

### Secret Santa

A Secret Santa card is an ordinary secret-link message whose message object is `{app: "santa", v: 1, …}` instead of
`{html, …}`; the organizer's copy (`app: "santa-admin"`), each wishlist and each note are v2 payloads sealed the same
way under keys that travel inside the cards. The objects are built in [`assets/santa-lib.js`](../assets/santa-lib.js)
and [`assets/santa-card.js`](../assets/santa-card.js); what the server can and cannot see is in
[SECURITY.md](SECURITY.md).

## The 2016 format (read-only)

Messages sealed from 2016 until October 2026 open at `https://cipher.ink/ivt/<ivt>`. Nothing new is written in this format.

- `ivt` is a 16-character ASCII string; its bytes are the IV. The server stores the ciphertext as a JSON array of byte values.
- The key is the passphrase cut to its first 32 characters and **left-padded with `x`** to exactly 32 bytes
  (`("x" × 32 + passphrase).slice(-32)`). The 2016 page lowercased passphrases first; to open an old message, try the
  lowercased passphrase, then the passphrase as typed.
- The cipher is **AES-256-OFB**. The plaintext was HTML, padded with spaces to 63 characters if it was shorter than 64; strip
  trailing whitespace after decrypting.
- OFB has no integrity check, so a wrong passphrase decrypts to noise rather than failing. cipher.ink accepts a result only
  if it is valid UTF-8 with no control characters other than tab, newline and carriage return.

Web Crypto has no OFB mode. `crypto.js` gets the keystream by AES-CBC-encrypting a run of zero blocks under the IV, which
yields E(IV), E(E(IV)), …, exactly OFB's keystream, and XORs it with the ciphertext.

## Test vectors

[`tests/vectors.json`](../tests/vectors.json) holds:

| Vector | What it checks |
|---|---|
| `secret link` | a link-mode payload, its key and the message object it opens to |
| `passphrase` | PBKDF2 at 600,000 iterations |
| `passphrase, NFC` | sealed with "é" as one code point, opened with "e" plus a combining accent |
| `secret link with one attachment` | the attachment's ciphertext and its plaintext bytes |
| `tampered ciphertext (must fail)` | one changed character in `c`: opening must fail |
| `2016 format` | an OFB message, opened with a passphrase in a different case than it was sealed with |

`tests/make-vectors.mjs` is the script that made them.
