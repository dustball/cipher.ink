# Security model

The promise: **the server stores ciphertext and never receives anything that would
decrypt it.** This page is what that rests on, what the server *does* see, and where the edges are.

All crypto is in [`assets/crypto.js`](../assets/crypto.js) and uses the browser's own Web Crypto API.

## Sealing (v2, since 2026-10-22)

| | Passphrase mode (`m: "p"`) | Secret-link mode (`m: "k"`) |
|---|---|---|
| Key | PBKDF2-SHA256, **600,000** iterations, 16-byte random salt, over the passphrase (Unicode NFC) | 32 random bytes |
| Where the key lives | in the reader's head; you tell them | in the URL fragment, after `#` |
| Cipher | AES-256-GCM, 12-byte random IV | AES-256-GCM, 12-byte random IV |

The sealed **payload** is JSON, stored as-is by the server:

```json
{"v":2, "m":"p", "it":600000, "s":"<salt, base64url>", "n":"<iv, base64url>", "c":"<ciphertext+tag, base64url>"}
```

Secret-link payloads have no `it` or `s`. Inside the ciphertext is another JSON object:

```json
{"html":"<p>…</p>", "t":1792727044, "d":"<token>", "att":[{"name":"photo.jpg","type":"image/jpeg","size":81234,"iv":"…"}]}
```

- `html`: the message, already sanitised (below).
- `t`: when it was sealed (seconds).
- `d`: the **token**, 18 random bytes, base64url. The server keeps only `sha256(token)` (column `del`).
  Whoever holds the token can check the message's status and destroy it. That is the sender (who keeps
  it in My messages or the receipt link) and anyone who has decrypted the message.
- `att`: attachments. Each file is encrypted separately with **the same key** and its **own random IV**,
  and uploaded as raw bytes. The names, types, sizes and IVs exist only here, inside the sealed message.

Fragments (`#…`) are never sent to a server by browsers, so a secret link's key and a receipt link's
token never appear in a request line or an access log. The pages also send `Referrer-Policy: no-referrer`.

**A wrong passphrase is detected, not guessed at:** GCM's authentication tag fails. Nothing is
rendered from a failed decrypt.

## Legacy messages (2016-2026)

The 81 messages in `cipher_enc` used **AES-256-OFB** through aes-js 2.x:

- key = the passphrase, **lowercased** by the old page and cut to 32 characters, left-padded with `x` to 32 bytes;
- IV = the message's own 16-character id (`/ivt/<id>`), made with `Math.random`;
- no authentication tag; text under 64 characters was padded with spaces.

`Cipher.legacyOpen` decrypts these read-only. Web Crypto has no OFB, but AES-CBC-encrypting N zero
blocks under IV gives E(IV), E(E(IV)), …, which *is* the OFB keystream. With no tag, a wrong passphrase
is caught by the output not being clean UTF-8 (random bytes almost never are). It tries the passphrase
lowercased first, then as typed. `tests/crypto.test.mjs` checks this byte-for-byte against the real
2016 library (`tests/aes-js-2.x.js`).

**These old messages are weaker** (low-entropy lowercased passphrases, no integrity, predictable IVs).
Nothing new is ever written in that format.

## What the server sees and keeps

| The server sees | Kept |
|---|---|
| the payload (ciphertext) and encrypted attachment bytes | until the message ends (burn, destroy, expiry), then wiped at once |
| mode (passphrase / secret link), burn flag, expiry, number of attachments and their encrypted sizes | with the message; mode, burn, expiry and count also in the tombstone |
| **the hint, in plain text** | until the message ends, then wiped with the payload |
| `sha256(token)` | with the message and tombstone |
| when it was sealed, first opened, how many times opened, when it ended | 90 days after it ends (the tombstone) |
| the visitor's IP, as `sha256("cipher.ink/rate/" + IP)` in hourly buckets | 2 days (`cipher_rate`) |
| **Secret Santa** (`cipher_group`): the exchange id, the organizer's copy sealed under the admin key (names, card links, rules; never the pairing), `sha256(admin token)`, the number of cards, when it began and when it expires | until the exchange ends (organizer ends it, or gift date + 30 days, at most 120 days), then deleted |
| **Secret Santa cards**: ordinary secret-link `cipher_msg` rows with `grp` set, so the server knows which cards belong to one exchange, and (by insert order) which card owns which slot. Opens are counted with the card's token, as for any message | as messages; a redraw or end tears them up (`destroyed`, payload wiped), tombstone 90 days |
| **Secret Santa slots and notes** (`cipher_slot`, `cipher_note`): each person's wishlist and each thread, sealed under that person's list key; `sha256` of the wishlist and thread write tokens; when the wishlist was last written; each note's time and its order in the thread | until the exchange ends or is redrawn, then deleted |
| **the feedback box, in plain text**, kept by a **separate feedback service** at `feedback.cipher.ink`, run by the same owner as this site (not in this database): the mood (Love it / Problem / Idea) and whatever was typed, which the server can read; with it a coarse **page kind** the page itself declares (`compose`, `view`, `receipt`, `contact`, `santa-card`, `santa-group`, or a public content key such as `learn/aes-gcm`), a width bucket (`xs`/`s`/`m`/`l`), the theme, the site version, a browser family from the User-Agent, a **one-way hash of the sender's address**, the country (looked up from the address), the time, and a spam score with the rules that fired. No email address, no screenshot, no address of the page | until deleted by hand |
| IP, time and URL path of every request (not the `#` part) | Dreamhost's Apache logs, outside this app's control |
| **the contact form, in plain text**: the message and the optional reply address | not stored; emailed at once to the site's owner through Mailgun, so it sits in Mailgun's logs and the owner's mailbox. The IP is counted as `sha256("cipher.ink/contact/" + IP)` in `cipher_rate`, 2 days |

The feedback box is the second exception, and the panel says so on its face. The widget comes from that service, loaded as one async script from
`feedback.cipher.ink` (named in the CSP's `script-src` and `connect-src`, and nowhere else), and it draws inside a Shadow DOM the page's CSS and script cannot reach.
**What it can never carry** is anything that opens a message. The page hands the widget only `fbw.context()` from `assets/feedback-hooks.js`: the page kind (written by the
server, never from the URL), a width bucket, the theme, the release, and an **empty page field** (the widget would otherwise send the path, and a message link's path is
its id). The hooks file reads no address bar, `#fragment`, referrer, page text, editor, passphrase, token, message id or storage, and a test
checks that. A page's `Referrer-Policy: no-referrer` keeps the page address out of the widget's requests. No email, Signal message or notification of any kind follows a
submission; the owner reads it in the service's reader, which only the owner can open, and `/fb` on this site only forwards there (a 404 for any other
address). The service files spam and abuse out of the inbox itself.

It never sees: the message text, file names, the passphrase, a secret link's key, or the token itself.
For Secret Santa it never sees a name, who drew whom, a wishlist or a note: those exist in the clear only in
the organizer's tab during the draw and in each participant's tab. A card's reads go through `group_read`,
which returns every slot in the exchange at once, so what a card fetches says nothing about whose list it opens.
The contact form is an exception to "nothing readable reaches the server", and the page says so
in bold. It tells people a report needs only `/m/<id>`, and to leave off the key unless they want the
message read.

The About dialog's *Privacy* paragraph is the public summary of this table. Change both together.

## Rendering untrusted HTML

A message is HTML written by whoever sealed it, so it is treated as hostile:

1. **DOMPurify 3.1.6** (self-hosted) with an allowlist: `p br b strong i em u s strike del h1 h2 h3
   blockquote ul ol li pre code a hr div` (22 tags), and only the `href` attribute. Links must be `http(s):` or
   `mailto:` and are forced to `target="_blank" rel="noopener noreferrer nofollow"`. This runs on paste,
   on seal, and again on render (`App.sanitize` in `app.js`).
2. **Content-Security-Policy** on every page: `default-src 'none'; script-src 'self'; style-src 'self';
   font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; base-uri 'none';
   form-action 'self'; manifest-src 'self'; frame-ancestors 'none'`. (`manifest-src` lets the browser read `/manifest.webmanifest`, the home-screen app description; `worker-src` is for the tools, which hash big files and run the sieve in same-origin Web Workers.) No inline script runs at all, so even HTML that slipped past the sanitiser
   could not execute. Page data travels in `<script type="application/json" id="ci-data">`, which is
   never executed, and `ci_json()` escapes `<`, `>` and `&` inside it.
3. **Attachments** render inline only for `png, jpeg, gif, webp, avif`, as `blob:` images. Anything
   else, SVG included, is offered as a download (`application/octet-stream`), never opened in the page.

The site's browser test seals a message containing `<img onerror>`, `<script>` and a `javascript:` link and
checks that none of it survives or runs.

## Burn after reading

`api.php open` on a burn message records the open and ends it (`state='burned'`, payload wiped) in a
conditional update (`… where state='live'`). If two people open it at once, only the request whose
update lands receives the payload; the other gets 404. The burn payload is never embedded in the page,
so a link preview or a page load cannot burn it: only pressing *Unseal and burn* does.

If the passphrase is then typed wrong, the ciphertext is already gone from the server and lives only in
that tab; the page says so and lets them keep trying.

A burned message's **attachments** can be fetched **once** each, within **15 minutes**, so the reader's
page can download them right after unsealing. A fetched file is deleted as it is served; one never
fetched is refused after 15 minutes and deleted by the next `ci_tidy()` (on the next seal or burn
open). They are encrypted, and the key never left the reader's browser.

When the sender previews their own message (its id is in this browser's My messages), `view.js` does
not report an open, so the receipt is not fooled by the sender. A burn message is counted when the
server hands it over, before anyone knows whether the passphrase is right, so the receipt says
*Opened and burned*, not *read*.

## Limits

- 30 seals and 60 MB per IP per hour (`CI_RATE_CREATES`, `CI_RATE_BYTES` in `lib.php`); the 31st gets
  HTTP 429. Only `create` is limited.
- Message payload ≤ 700 KB (about 500 KB of HTML); attachments ≤ 10 files and 5 MB in total.
- `status` answers at most 100 messages per request.
- The contact form: 5 emails per IP per hour and 20 per hour from everyone together
  (`CI_CONTACT_PER_IP`, `CI_CONTACT_ALL`), plus a hidden honeypot field. The recipient is fixed in
  `local.php` (`CI_CONTACT_TO`), so the form cannot be used to mail anyone else.

## Hosting hardening (2026-10-24)

- **PHP 8.5.12 or later only.** PHP2Shell (CVE-2026-109618, CVE-2026-109619) is an unauthenticated RCE in the engine, fixed in 8.5.12 (and 8.4.27, 8.3.36, 8.2.35);
  there is no fix for 5.x. The site moved from 5.6 to 8.5 on 2026-10-24.
- **The DB login is a mode-600 file outside the web root** (`CI_DB_FILE` in `local.php`), not shared with other sites and not in git. A failed
  connection answers 503 with a plain sentence and logs only the driver's error, never the credentials.
- **No site files are served from backups**: snapshots live outside the web root, and `.htaccess` 403s `/.backups`. Until 2026-10-24 the
  whole-site `.tgz` snapshots were downloadable.
- **No sessions, no upload progress:** the site never calls `session_start()`, so `session.upload_progress` is irrelevant to it (the host also has it off).
- **Request size:** `api.php` rejects bodies over 12 MB (`Content-Length`) on top of the per-field limits above. `post_max_size` itself is the server's.

## Known edges

- **You trust the server to serve honest JavaScript.** This is true of every web-based encryption tool:
  a compromised server could ship a page that leaks what you type. Everything is self-hosted under a
  strict CSP, which narrows the ways to do that, but it does not remove the need to trust the host.
- **The hint is plain text**, by design, and the page says so.
- **My messages lives in the sender's browser** (`localStorage['ci-sent']`): message ids, tokens, the
  links (a secret link includes its key) and a 48-character label taken from the start of the message.
  Anyone using that browser profile can open those messages. The drawer tells people to clear it on a
  shared computer.
- **Holding the token is enough to destroy a message** and to read its status. Readers get the token by
  decrypting, so a reader can destroy what they were sent. That is intended.
- **Metadata** (timestamps, open counts, mode, sizes, and the hint while the message is live) is visible to whoever controls the
  database, for up to 90 days after a message ends.
- **Rate limiting is per IP only**, and the IP is the visitor's: behind Cloudflare's proxy `cfip.php` takes it from `CF-Connecting-IP`, believed only from a Cloudflare peer. There is no CAPTCHA and no account system.
- **Cloudflare is in the path since 2026-10-26** (TLS ends at its edge, so it can see requests and responses in clear). Messages stay sealed in the browser and the key lives in the URL fragment, which is never sent, so it sees only ciphertext.
- **Passphrase strength is the sender's choice.** The meter is advice; PBKDF2 at 600k slows guessing
  but cannot save a weak passphrase on a non-burn message, whose ciphertext anyone with the link can
  download and attack offline.
- **Secret Santa: the organizer's tab draws.** The assignment exists in clear in the organizer's browser for
  the second it takes to draw and seal. An organizer who opens developer tools and pauses the code then can
  read it. The landing page says so and links `/learn/mental-poker` for the trustless alternative.
- **Secret Santa: the organizer holds every card link until *Forget the links*.** Opening someone's card
  leaves a trace the owner sees ("opened N times before … none of those was in this browser"). After
  *Forget the links* the stored admin blob has no card keys (checked by the site's browser test); a copy the
  organizer took before that (copied links, printed cards) still opens cards.
- **Secret Santa: write timing.** Reads hide which list a card wants, but writes don't: `slot_put` and
  `note_add` name a slot. The database keeps each note's time, the card's first-open time and nothing about
  IPs, but Dreamhost's access logs keep IP and time of every POST. Whoever holds both could match a note's
  second to a card open from the same IP and infer a pairing. Nothing in the code does this; the landing
  page states it in plain words.
- **Secret Santa: anyone with a card can write to its giftee's thread and its own**, as intended; the
  wishlist write token is only on its owner's card, so a Santa can't change their giftee's list.
