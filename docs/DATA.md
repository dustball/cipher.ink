# Data

Everything is in one MySQL database; `schema.sql` creates the tables. The PHP side connects in `local.php`
(copy `local.sample.php`), with mysqli (PHP 8); the login is a small file outside the web root.

## Tables

### `cipher_msg`: messages (v2)

| Column | Type | Meaning |
|---|---|---|
| `id` | varchar(16) PK | 12 random characters (`ci_new_id`) |
| `payload` | mediumtext | the sealed JSON ([SECURITY.md](SECURITY.md)); `''` once ended |
| `mode` | char(1) | `p` passphrase, `k` secret link |
| `state` | varchar(10) | `live`, `burned`, `destroyed`, `expired` |
| `hint` | varchar(700) NULL | passphrase hint, **base64 of UTF-8** (the table is ASCII); `NULL` once ended |
| `files` | tinyint | number of attachments |
| `burn` | tinyint | burn after reading |
| `del` | char(64) | `sha256(token)`; the token itself is sealed inside the message |
| `created` | int | Unix seconds |
| `expires` | int | Unix seconds, `0` = never |
| `opened_at` | int | first successful unseal, `0` = never |
| `opens` | int | successful unseals |
| `ended_at` | int | when it burned / was destroyed / expired, `0` while live |
| `grp` | varchar(16) NULL | the Secret Santa exchange a card belongs to; `NULL` for every ordinary message |

Keys: `PRIMARY (id)`, `expires (expires)`, `state_ended (state, ended_at)`, `grp (grp)`. Charset ASCII.

### `cipher_file`: encrypted attachments

| Column | Type | Meaning |
|---|---|---|
| `msg_id` | varchar(16) | the message |
| `n` | tinyint | index, matching `att[n]` inside the sealed message |
| `data` | longblob | AES-GCM ciphertext of the file. No name, no type: those are sealed in the message |

`PRIMARY (msg_id, n)`. At most 10 per message, 5 MB in total.

### `cipher_rate`: per-IP limits

| Column | Type | Meaning |
|---|---|---|
| `k` | char(64) | `sha256("cipher.ink/rate/" . REMOTE_ADDR)` (the visitor's address; `cfip.php` corrects it behind Cloudflare); the IP itself is never stored. Contact-form rows use `cipher.ink/contact/` instead of `rate/`, and one row per hour with `k = sha256("cipher.ink/contact-all")` counts every contact email |
| `hour` | int | `floor(time / 3600)` |
| `creates` | int | seals (or contact emails) this hour |
| `bytes` | bigint | payload + attachment bytes this hour (0 for contact rows) |

`PRIMARY (k, hour)`. Limits: 30 seals, 60 MB (`CI_RATE_CREATES`, `CI_RATE_BYTES`); contact 5 per IP,
20 in all (`CI_CONTACT_PER_IP`, `CI_CONTACT_ALL`).

### `cipher_enc`: the 2016-2026 messages (read-only)

| Column | Type | Meaning |
|---|---|---|
| `iv` | char(16) PK | the message id in `/ivt/<id>`, and its IV |
| `enc` | blob | AES-OFB ciphertext as a JSON array of byte values |

81 rows. The table has no timestamps; the old site could not seal anything after 2026-08-06, when
its crypto library broke, and nothing writes here any more. A couple of rows have junk ids left by
old SQL-injection probes; the old code escaped them, so they were stored harmlessly as text.

### Secret Santa: `cipher_group`, `cipher_slot`, `cipher_note`

Added 2026-10-24 (InnoDB so a draw is one transaction). Every id is made in
the organizer's browser, 12 characters from the message-id alphabet; a clash returns 409 and the browser retries.

| `cipher_group` | Type | Meaning |
|---|---|---|
| `id` | varchar(16) PK | the exchange, in `/santa/g/<id>` |
| `admin` | mediumtext | the organizer's copy, sealed under the admin key in the fragment: names, card links (until *Forget the links*), rules. Never the pairing |
| `adm` | char(64) | `sha256(admin token)`; the token is inside `admin` |
| `cards` | tinyint | how many people |
| `created`, `expires` | int | `expires` = gift date + 30 days, at most `CI_SANTA_DAYS` (120) after `created` |
| `state` | varchar(10) | always `live` (a finished exchange is deleted, not kept) |

| `cipher_slot` | Type | Meaning |
|---|---|---|
| `id` | varchar(16) PK | one per person (S_P) |
| `grp` | varchar(16) | the exchange |
| `payload` | mediumtext | the person's sealed wishlist, `''` until written |
| `wkey`, `tkey` | char(64) | `sha256` of the wishlist write token (owner only) and the thread write token (owner and their Santa) |
| `updated` | int | when the wishlist was last saved, `0` if never |

| `cipher_note` | Type | Meaning |
|---|---|---|
| `slot`, `seq` | PK | the thread (the slot of the person it's about) and the note's place in it; at most 100 |
| `payload` | text | sealed under that person's list key; who wrote it is inside the ciphertext |
| `created` | int | Unix seconds |

An exchange's life: `group_create` inserts the group, n cards (`cipher_msg`, mode `k`, `grp` set, expiring with
the group) and n empty slots. `group_redraw` tears up the old cards (`destroyed`, payload wiped), deletes the
slots and notes, and inserts new ones. `group_end`, or expiry (`ci_tidy`, and lazily in `ci_group_get`), runs
`ci_group_wipe`: cards end as `destroyed`/`expired` with the usual 90-day tombstone, and the slots, notes and
group row are deleted at once.

## A message's life

```
           create                      open (burn msg)
  ──────────────────▶  live  ─────────────────────────────▶  burned
                        │ │   burn action (token)
                        │ └─────────────────────────────────▶  destroyed
                        │     expires < now (seen on read, or by ci_tidy)
                        └───────────────────────────────────▶  expired
```

- **Ending** (`ci_end` in `lib.php`) is one conditional update `… where state='live'`: payload and hint
  become empty, `ended_at` is set, and attachment rows are deleted, except after a burn, when they
  live for 15 more minutes (one fetch each) so the reader's page can download them.
- **Tombstone**: an ended row keeps only `id, mode, state, files, burn, del, created, expires,
  opened_at, opens, ended_at`, so My messages and the receipt can say *Opened and burned* or *Expired
  unread*. Tombstones are deleted **90 days** after they end (`CI_TOMBSTONE_DAYS`).
- **Opens** are counted by `opened` (kept messages, with the token) and by `open` (burn messages).
  Loading the page does not count.

## Housekeeping

There is no cron job. `ci_tidy()` runs at the start of every `create` and every `open` (which only
burn messages use):

1. ends up to 200 live messages whose `expires` has passed;
2. deletes tombstones older than 90 days;
3. deletes burned messages' attachments more than 15 minutes old;
4. deletes `cipher_rate` rows older than 48 hours;
5. wipes up to 50 Secret Santa exchanges past their `expires` (`ci_group_wipe`);

Reading also expires lazily: `ci_get()` ends an overdue message the moment anyone asks for it. So an
expired message is unreadable on time even if nobody has sealed anything since.

## Useful queries

```sql
-- what is in there
select state, count(*), sum(length(payload)) payload_bytes from cipher_msg group by state;
select count(*), sum(length(data)) from cipher_file;

-- recent activity (no content: there is none to see)
select id, mode, state, burn, files, from_unixtime(created) sealed, opens,
       if(opened_at, from_unixtime(opened_at), null) first_open
  from cipher_msg order by created desc limit 20;

-- who is near the rate limit this hour (hashed)
select left(k, 12) who, creates, round(bytes/1048576, 1) mb from cipher_rate
 where hour = floor(unix_timestamp()/3600) order by creates desc limit 10;

-- end a message by hand, the same way the app does
update cipher_msg set state='destroyed', payload='', hint=NULL, ended_at=unix_timestamp()
 where id='…' and state='live';
delete from cipher_file where msg_id='…';

-- one Secret Santa exchange, and that ending it left nothing behind
select 'groups', count(*) from cipher_group where id='…'
union all select 'slots', count(*) from cipher_slot where grp='…'
union all select 'orphan notes', count(*) from cipher_note where slot not in (select id from cipher_slot);
select state, count(*), sum(length(payload)) from cipher_msg where grp='…' group by state;
```

## Schema history

| Date | Change |
|---|---|
| 2016 | `cipher_enc (iv, enc)` |
| 2026-10-22 | `cipher_msg (id, payload, mode, burn, del, created, expires)` |
| 2026-10-23 | `cipher_msg` + `state, hint, files, opened_at, opens, ended_at`, key `state_ended`; new `cipher_file`, `cipher_rate`; hint widened to varchar(700) for base64 |
| 2026-10-24 | `cipher_msg` + `grp` (key `grp`); new `cipher_group`, `cipher_slot`, `cipher_note` for Secret Santa (InnoDB) |
