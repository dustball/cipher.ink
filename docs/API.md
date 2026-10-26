# URLs and API

## Pages

| URL | File | What |
|---|---|---|
| `/` | `index.php` | compose |
| `/m/<id>` | `show.php?id=` | a v2 message. `<id>` is 12 characters from `a-z A-Z 2-9` minus look-alikes. A secret link adds `#<key>` (43 base64url chars) |
| `/ivt/<id>` | `show.php?ivt=` | a 2016-format message (16-character id) |
| `/s/<id>#<token>` | `status.php?id=` | read receipt; the token never leaves the fragment except in the POST to `status` |
| `/secret-santa` | `secret-santa.php` | Secret Santa: the landing page and the organizer's form (on cipher.ink, one of the site's pages) |
| `/santa/<id>#<key>` | `santa.php?id=` | one participant's card: an ordinary secret-link message holding `app: 'santa'`. `/m/<id>` of a card hands over here after decrypting |
| `/santa/g/<gid>#<adminkey>` | `santa.php?g=` | the organizer's page: links, QR codes, printed cards, opened/wishlist status, forget, redraw, end |
| `/contact` | `contact.php` | contact / report form, emailed to the site's owner (not encrypted) |
| `/favicon.ico` | | 16, 32 and 48 px icon, made from `assets/icon.svg` |
| `/learn`, `/ciphers`, `/tools`, `/primes`, `/puzzles` and `/<hub>/<slug>` | `page.php` | the content hubs and their pages (articles, ciphers, tools, puzzles). Not in this repository |
| `/how-it-works`, `/security`, `/faq`, `/about`, `/by-the-numbers`, `/code`, `/credits`, `/glossary`, `/timeline` | `page.php` | site pages, also from the registry |
| `/sitemap.xml`, `/feed.xml` | `sitemap.php`, `feed.php` | generated from the registry (URLs of published, indexable pages; the 30 newest articles) |
| `/robots.txt` | static | disallows only `/api.php` and `/next/`, and names the sitemap |
| anything else unknown | `404.php` | a real 404 in the site's look (`ErrorDocument`) |
| `/api.php` | `api.php` | the JSON API below |
| `/assets/…` | | scripts, styles, fonts, icons (all self-hosted) |

Content pages (below) are indexable too. Messages, receipts and the API are never: they send `<meta name="robots" content="noindex">`
**and** `X-Robots-Tag: noindex` (they stay crawlable, so a crawler can see the `noindex`; `robots.txt` blocks only `/api.php` and `/next/`). Every page carries Open Graph tags for link previews. A
message page's preview says only "A sealed message" and "Someone sent you a sealed message", never
anything from the message.

`show.php` returns **404** for a message that never existed or has ended, with a page saying which:
*Burned.*, *Destroyed.*, *Expired.* or *Nothing here.* `.htaccess` redirects http→https, forbids
the includes (`lib.php`, `cfip.php`, `partials.php`, `local.php`), `content/`, `docs/`, `tests/` and the repository's own files, and disables
directory listings.

Every page carries its data in `<script type="application/json" id="ci-data">`, read by `app.js` as
`App.data`. On `show.php` that is:

| Field | When | Meaning |
|---|---|---|
| `base` | always | URL path of the install (`/`, or `/next/` on staging) |
| `kind` | always | `v2`, `legacy` or `gone` |
| `ended` | `gone` only | `burned`, `destroyed` or `expired` (absent if it never existed) |
| `id`, `mode` | v2, legacy | message id; `p` (passphrase) or `k` (secret link) |
| `payload` | v2, **not** burn | the sealed payload, so a kept message opens without another request |
| `burn`, `created`, `expires`, `files`, `hint` | v2 | flags, Unix seconds (`expires` 0 = never), attachment count, hint text |
| `enc` | legacy | the 2016 ciphertext, a JSON byte array |

## `api.php`

**POST only** (anything else is 405). Form-encoded, or `multipart/form-data` when uploading
attachments. Every response is JSON except `file`. Errors are `{"error": "…"}` with a non-200 status.
The client wrapper is `App.post(action, params, {raw})` in `app.js`: arrays are sent as `name[]`,
`Blob`s switch it to multipart.

### `create`: store a sealed message

| Param | Required | |
|---|---|---|
| `payload` | yes | the sealed JSON from `Cipher.seal` (`v` must be 2), 20 bytes to 700 KB |
| `mode` | | `p` or `k` (anything else is `p`) |
| `burn` | | truthy = burn after reading |
| `ttl` | | seconds: `600`, `3600`, `86400`, `604800`, `2592000`, or `0` (never). Anything else becomes 604800 |
| `del` | yes | `sha256(token)` as 64 lowercase hex |
| `hint` | | passphrase mode only; trimmed, cut to 120 characters, stored base64 |
| `f0` … `f9` | | encrypted attachment blobs, in the same order as `att` inside the payload; ≤ 5 MB + 64 KB in total |

→ `200 {"id": "cAeMr4WRGKyi"}`

| Status | Error |
|---|---|
| 400 | `Nothing to store.` / `Not a sealed payload.` / `Missing token.` / `An attachment did not upload.` |
| 413 | `That message is too large to seal.` / `Attachments are limited to 5 MB in total.` |
| 429 | `Too many messages from your connection this hour. Try again later.` (30 seals or 60 MB per IP per hour) |
| 500 | `Could not store the message.` / `Could not store an attachment.` (the message is rolled back) |

`create` also runs the housekeeping (`ci_tidy`, see [DATA.md](DATA.md)).

### `open`: fetch a payload

| Param | |
|---|---|
| `id` | message id |

→ `200 {"payload": "…", "burned": bool, "files": n, "created": t, "expires": t}`
→ `404 {"error": "gone"}` if it never existed, has ended, or another reader burned it a moment earlier.

Used for burn-after-reading messages, whose payload is never embedded in the page. For a burn message
this **is** the burn: it records the open and ends the message in one conditional update, so only one
caller ever receives it.

### `opened`: read receipt

| Param | |
|---|---|
| `id`, `token` | the token comes out of the decrypted message, which proves it was really unsealed |

→ `200 {"ok": true}`; increments `opens` and sets `opened_at` the first time (live messages only).
→ `403 {"error": "Not allowed."}` for a missing message or a wrong token.

`view.js` calls it after every successful unseal of a kept message, except when the message is in this
browser's My messages (the sender previewing it). Burn messages are counted by `open`.

### `file`: one encrypted attachment

| Param | |
|---|---|
| `id`, `n` | message id, attachment index (0-based) |

→ `200`, `application/octet-stream`, the encrypted bytes (decrypt with `Cipher.openFile(key, att[n].iv, bytes)`).
→ `404 {"error": "gone"}` if the message has ended. Exception: for 15 minutes after a **burn**, each
file can be fetched **once**, then it is deleted.

### `burn`: destroy now

| Param | |
|---|---|
| `id`, `token` | |

→ `200 {"ok": true}`: a live message ends as `destroyed` (payload, hint and files wiped). On an
already-ended message it just deletes any leftover files.
→ `403 {"error": "Not allowed."}` wrong token; `404 {"error": "gone"}` no such message.

### `status`: what happened to these messages

| Param | |
|---|---|
| `ids[]`, `tokens[]` | parallel arrays, up to 100 |

→ `200 {"status": {"<id>": {…}, …}}`, one entry per id:

| `state` | Fields |
|---|---|
| `gone` | none (no record: never existed, or the tombstone is past 90 days) |
| `denied` | none (the token does not match) |
| `live`, `burned`, `destroyed`, `expired` | `burn`, `mode`, `created`, `expires`, `opened_at`, `opens`, `ended_at`, `files`, `hint` |

All times are Unix seconds; `0` means "not yet" or "never". Used by the My messages drawer and the
receipt page (`mine.js`, `describe()` turns a status into the words shown).

### `contact`: email the site's owner

| Param | |
|---|---|
| `body` | the message, up to 5,000 characters |
| `from` | optional reply address; becomes the email's `Reply-To` |
| `site` | honeypot, hidden on the page. If it has anything in it, the answer is `{"ok": true}` and nothing is sent |

→ `200 {"ok": true}` once Mailgun has accepted it. The email goes to `CI_CONTACT_TO` from
`contact@` + `CI_MAILGUN_DOMAIN`, subject `cipher.ink contact: <first 60 characters>`.
→ `400` empty message or a bad address · `413` too long · `429` over the limit (5 per IP, 20 in all,
per hour) · `502` Mailgun refused it or the key file is missing.

**On staging (any install not at `/`) the email is sent in Mailgun's test mode**: Mailgun accepts it
and answers 200, but delivers nothing. So `/next/` can be tested freely, and only a production install sends real mail.

### Feedback

The feedback tab is not part of this API. It is a separate service's script, embedded by `ci_feedback()` in `lib.php` from
`CI_FB_HOST` (`local.php`; unset means no tab). It posts to that host, never to `api.php`, and the page's CSP names the host in `script-src`
and `connect-src` only. The page passes it `fbw.context()` (page kind, width bucket, theme, release; never the address) from `assets/feedback-hooks.js`.

### Secret Santa actions

The design is in [SECURITY.md](SECURITY.md); the tables in
[DATA.md](DATA.md). Ids (group, card, slot) are 12 characters from the message-id alphabet, made in the
organizer's browser. Hashes are 64 lower-case hex. "Sealed" means a v2 payload (`ci_is_sealed`) under a size cap.

| Action | Params | → |
|---|---|---|
| `group_create` | `gid`, `adm` (sha256 of the admin token), `admin` (sealed, ≤ 64 KB), `expires` (Unix s), parallel `ids[]`, `cards[]` (sealed, ≤ 8 KB each), `dels[]`, `slots[]`, `wkeys[]`, `tkeys[]`; 3 to 60 entries | `{ok, expires}` (expiry clamped to between a day from now and 120 days after creation). One transaction. `409 clash` if any id exists (the browser redraws ids and retries); `429` over 5 draws per IP per hour (bucket `santa`, separate from the 30-seal limit) |
| `group_redraw` | the same, `admin_token` instead of `adm` | `{ok, expires}`; old cards `destroyed`, old slots and notes deleted, new ones stored, in one transaction. `403` wrong token, `404` gone |
| `group_admin` | `gid` | `{admin, cards, created, expires}`: the sealed organizer copy |
| `group_admin` | `gid`, `admin_token`, `admin` | `{ok}`: replaces the organizer copy ("Forget the links") |
| `group_end` | `gid`, `admin_token` | `{ok}`: `ci_group_wipe(…, 'destroyed')` |
| `group_read` | `gid` | `{slots: {<slot>: {payload, updated, notes: [{seq, payload, created}]}}, expires}`: everything in the exchange, all sealed, so a card's fetch reveals nothing about whose list it wants |
| `group_status` | `gid` | `{slots: {<slot>: {updated, notes}}, expires}`: for the organizer page (card opens come from `status`) |
| `slot_put` | `slot`, `wtoken`, `payload` (sealed ≤ 4 KB, or `''` to clear) | `{ok}`; `403` unless `sha256(wtoken)` matches |
| `note_add` | `slot`, `ttoken`, `payload` (sealed ≤ 1.5 KB) | `{ok, seq}`; `403` wrong token, `413` thread full (100), `429` over 60 notes per IP per hour |

Any of them answers `404 {"error": "gone"}` for an exchange that ended or expired. A card's "opened before" uses
`status` then `opened` with the token sealed in the card, exactly as a message does.

`santa.php` data (`App.data`): `kind` is `card` (`id`, `payload`, `expires`), `group` (`gid`, `admin`,
`expires`) or `gone` (`ended`: the card's state, if it had one).

## Example (curl)

```bash
A=https://cipher.ink/api.php
D=$(printf 'mytoken' | shasum -a 256 | cut -d' ' -f1)
id=$(curl -s $A -d action=create --data-urlencode 'payload={"v":2,"m":"k","n":"x","c":"not-really-sealed"}' \
       -d mode=k -d ttl=600 -d del=$D | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s $A -d action=status -d "ids[]=$id" -d "tokens[]=mytoken"
curl -s $A -d action=burn -d id=$id -d token=mytoken
```

(The server cannot tell a real payload from a fake one; that is the point.)
