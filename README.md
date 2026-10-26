# cipher.ink

Client-side encrypted messages, live at <https://cipher.ink/>. You write a message, your browser seals it with
AES-256-GCM, the server stores only ciphertext, and the recipient's browser unseals it. Messages can burn after
reading. The same machinery runs a [Secret Santa](https://cipher.ink/secret-santa) that nobody, the organizer
included, can peek at.

This repository is the app: the code that makes the privacy claim, so you can check it. The site's articles,
tools and puzzles are not in it.

## The threat model, in five lines

1. The server never receives anything that decrypts a message: no plaintext, passphrase, link key or file name.
   A secret link's key lives after the `#`, which browsers do not send.
2. It does see metadata: when a message was sealed and opened, its size, the passphrase hint if you write one, and
   (like every web server) IPs in its access logs. The full table is in [docs/SECURITY.md](docs/SECURITY.md).
3. A message is hostile HTML. It is rendered only through DOMPurify with an allowlist, under a CSP with no inline script.
4. You trust the server to serve honest JavaScript. That is true of every web-based encryption tool; the next
   section is how you check it.
5. Burn after reading deletes the ciphertext from the server. It cannot stop the reader from copying what they read.

## Verify it yourself

Each release is one commit, `Release <version>`, where the version is `CI_VERSION` in `lib.php`. `SHA256SUMS` lists the
SHA-256 of every static file in that release. The site loads every asset as `assets/<file>?v=<version>`, so you can
compare what your browser received with this repository:

```
curl -s https://cipher.ink/assets/crypto.js | sha256sum
grep ' assets/crypto.js$' SHA256SUMS
```

or check them all with `sha256sum -c SHA256SUMS` against a copy of the site, or drop the files and `SHA256SUMS` on
<https://cipher.ink/tools/file-checksum>. If the site's `?v=` is newer than the latest release here, the release has
not been published yet.

What this proves: that the code served at the moment you check is the code published here. It cannot
prove what will be served tomorrow. That limit is the same for every website.

## Run the tests

Node 20 or later, nothing to install:

```
node tests/crypto.test.mjs   # the v2 format, the 2016 format, and the published test vectors
node tests/santa.test.mjs    # the Secret Santa draw: uniformity, exclusions, impossible rules, single loops
```

[docs/FORMAT.md](docs/FORMAT.md) specifies the message format well enough to write your own client, and
`tests/vectors.json` has vectors to check it against.

## Run it locally

The site runs on PHP 8 with mysqli and MySQL 8, behind Apache with `mod_rewrite`.

1. Create a database and load `schema.sql`.
2. Copy `local.sample.php` to `local.php` and fill in the connection and the contact settings.
3. Point Apache at the directory. The `.htaccess` holds the routes.

Everything the app needs is here: the compose page (`index.php`), message and receipt pages (`show.php`,
`status.php`), the API (`api.php`), the Secret Santa (`secret-santa.php`, `santa.php`) and the contact form.
`content/partials.php` is a small stand-in for the site's article system; its links go to the articles on cipher.ink.

## Layout

| Path | What |
|---|---|
| `assets/crypto.js` | all the cryptography, in one file with no network code |
| `assets/*.js`, `assets/*.css` | the pages' scripts and styles |
| `api.php`, `lib.php` | the server: what it stores, rate limits, housekeeping |
| `docs/SECURITY.md` | what the server sees and keeps, sanitising, the known edges |
| `docs/API.md`, `docs/DATA.md` | every API action; the tables and the message lifecycle |
| `docs/FORMAT.md` | the payload formats, v2 and 2016 |
| `schema.sql` | the tables |

## Licence

AGPL-3.0 (see `LICENSE`). If you run a modified copy as a service, you must offer its users the source.

Bundled: DOMPurify 3.1.6 (Apache-2.0 or MPL-2.0, notice in the file), Kazuhiko Arase's QR Code Generator
(`assets/qrcode.js`, MIT, notice in the file), the fonts (SIL Open Font License 1.1,
`assets/fonts/OFL.txt`), and in `tests/` aes-js 2.x (MIT, Richard Moore, `tests/aes-js.LICENSE`), used only to check the 2016 format.

By B Klug ([GitHub](https://github.com/dustball)). Security reports: <https://cipher.ink/contact>.
