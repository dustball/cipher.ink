<?php
// Shared by every cipher.ink page. PHP 8.5 (the .htaccess pins php85.cgi) with mysqli; the DB login is in a private file
// outside the web root, named by local.php (CI_DB_FILE).

// This install's own settings: the database connection, the contact address, the mail domain and where the mail key is.
// local.php is not in the public repository; local.sample.php there shows what it must define.
include dirname(__FILE__) . '/local.php';

// Behind Cloudflare's proxy: restore the visitor's address into REMOTE_ADDR (only when the peer is a Cloudflare edge). See cfip.php.
include_once dirname(__FILE__) . '/cfip.php';

define('CI_VERSION', '20261026b');          // bump when assets change, so browsers refetch them
define('CI_MAX_PAYLOAD', 700000);           // bytes of ciphertext JSON (~500k of message HTML)
define('CI_MAX_FILES', 10);
define('CI_MAX_FILE_BYTES', 5 * 1048576 + 65536);   // all attachments together, encrypted (5 MB + GCM tags)
define('CI_BURN_FILE_WINDOW', 900);         // a burned message's files can still be fetched once, for 15 minutes
define('CI_TOMBSTONE_DAYS', 90);            // ended messages keep their timestamps (no content) this long, for status
define('CI_RATE_CREATES', 30);              // per IP per hour
define('CI_RATE_BYTES', 60 * 1048576);      // per IP per hour
define('CI_CONTACT_PER_IP', 5);             // contact-form emails per IP per hour
define('CI_CONTACT_ALL', 20);               // contact-form emails per hour from everyone together
// Secret Santa: an exchange is a group of ordinary secret-link cards plus sealed wishlists and notes.
define('CI_SANTA_MIN', 3);
define('CI_SANTA_MAX', 60);                 // people per exchange
define('CI_SANTA_PER_HOUR', 5);             // exchanges drawn (or redrawn) per IP per hour, apart from the 30-seal limit
define('CI_SANTA_DAYS', 120);               // an exchange lives until gift date + 30 days, and never more than this
define('CI_SANTA_CARD_BYTES', 8192);        // one sealed card
define('CI_SANTA_ADMIN_BYTES', 65536);      // the organizer's sealed blob
define('CI_SANTA_SLOT_BYTES', 4096);        // one sealed wishlist
define('CI_SANTA_NOTE_BYTES', 1536);        // one sealed note
define('CI_SANTA_NOTES', 100);              // notes per thread
define('CI_SANTA_NOTES_PER_HOUR', 60);      // notes per IP per hour

// The shared feedback service: the widget script and its API, named in the CSP (script-src, connect-src). Set by local.php
// (this install's own service); empty means no feedback widget at all, which is what a fresh copy of the public repository gets.
if (!defined('CI_FB_HOST')) define('CI_FB_HOST', '');

// Root URL path of this install, so the site works at / or in a subdirectory (e.g. a staging copy).
$CI_BASE = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/') . '/';

/* Headers for every page. Messages, receipts and the API are private: no-store and noindex.
 * $opt: 'index' => true for pages meant for search engines (no X-Robots-Tag);
 *       'cache' => seconds for a public, cacheable page (the content pages), with 'lastmod' => unix time
 *       for Last-Modified and If-Modified-Since. Everything on a staging copy (any install not at /)
 *       is noindex, nofollow whatever else is asked. */
function ci_headers($html = true, $opt = array()) {
  global $CI_BASE;
  $cache = isset($opt['cache']) ? (int)$opt['cache'] : 0;
  $lastmod = isset($opt['lastmod']) ? (int)$opt['lastmod'] : 0;
  if ($cache > 0) {
    header('Cache-Control: public, max-age=' . $cache);
    if ($lastmod > 0) {
      header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $lastmod) . ' GMT');
      if (isset($_SERVER['HTTP_IF_MODIFIED_SINCE']) && @strtotime($_SERVER['HTTP_IF_MODIFIED_SINCE']) >= $lastmod) {
        header('HTTP/1.1 304 Not Modified');
        exit;
      }
    }
  } else {
    header('Cache-Control: no-store');
  }
  header('Referrer-Policy: no-referrer');
  header('X-Content-Type-Options: nosniff');
  header('Strict-Transport-Security: max-age=31536000');
  if ($CI_BASE !== '/') header('X-Robots-Tag: noindex, nofollow');
  elseif (empty($opt['index'])) header('X-Robots-Tag: noindex');
  if ($html) {
    header('Content-Type: text/html; charset=utf-8');
    $fb = CI_FB_HOST !== '' ? ' ' . CI_FB_HOST : '';   // the feedback tab's own server (local.php): the one origin besides this one
    // No inline script, nothing from another origin but the feedback tab's server ($fb, in script-src and connect-src only).
    // Decrypted messages are rendered as HTML, so this is the second wall behind DOMPurify. blob: is for decrypted image
    // attachments. worker-src: the tools hash big files and run the sieve in Web Workers (same-origin files only).
    header("Content-Security-Policy: default-src 'none'; script-src 'self'$fb; style-src 'self'; " .
      "font-src 'self'; img-src 'self' data: blob:; connect-src 'self'$fb; worker-src 'self'; base-uri 'none'; " .
      "form-action 'self'; manifest-src 'self'; frame-ancestors 'none'");
  }
}

function ci_h($s) { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

// JSON for a <script type="application/json"> block: never lets "</script>" through.
function ci_json($v) {
  return str_replace(array('<', '>', '&'), array('\\' . 'u003c', '\\' . 'u003e', '\\' . 'u0026'), json_encode($v));
}

/* The database: one mysqli connection per request, opened on first use from the private file CI_DB_FILE (local.php), which
 * returns array('host'=>, 'user'=>, 'pass'=>, 'name'=>). mysqli's exceptions are off, so a failed query returns false and the
 * callers' `or out(...)` / `if (!ci_query(...))` paths work. The charset is utf8mb4. */
function ci_db() {
  static $db = null;
  if ($db !== null) return $db;
  mysqli_report(MYSQLI_REPORT_OFF);
  $c = is_readable(CI_DB_FILE) ? include CI_DB_FILE : null;
  $m = mysqli_init();
  if (!is_array($c) || !@$m->real_connect($c['host'], $c['user'], $c['pass'], $c['name'])) {
    error_log('cipher.ink: database connection failed: ' . mysqli_connect_error());
    header('HTTP/1.1 503 Service Unavailable');
    header('Content-Type: text/plain; charset=utf-8');
    echo "The database is not reachable just now. Try again in a minute.\n";
    exit;
  }
  $m->set_charset('utf8mb4');
  $db = $m;
  return $db;
}
function ci_q($s) { return "'" . ci_db()->real_escape_string((string)$s) . "'"; }
// Run a statement: a mysqli_result for a select, true for a write that worked, false for an error.
function ci_query($sql) { return ci_db()->query($sql); }
function ci_fetch($r) { return $r instanceof mysqli_result ? $r->fetch_assoc() : null; }
function ci_num_rows($r) { return $r instanceof mysqli_result ? $r->num_rows : 0; }
function ci_affected() { return ci_db()->affected_rows; }

function ci_new_id() {
  $abc = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  do {
    // 57 letters: bytes 228-255 would favour the first 28, so they are skipped (rejection sampling).
    $id = '';
    while (strlen($id) < 12) {
      $raw = random_bytes(16);
      for ($i = 0; $i < 16 && strlen($id) < 12; $i++) if (ord($raw[$i]) < 228) $id .= $abc[ord($raw[$i]) % 57];
    }
    $r = ci_query("select 1 from cipher_msg where id=" . ci_q($id));
  } while ($r && ci_num_rows($r) > 0);
  return $id;
}

/* A message's life: state 'live' → 'burned' (opened, burn-after-reading), 'destroyed' (someone
 * holding the token pressed Destroy) or 'expired'. Ending wipes the payload and the files at once;
 * the hint goes too; only the timestamps stay, as a tombstone, so the sender's status view can say what happened. */
function ci_end($id, $state) {
  $now = time();
  ci_query("update cipher_msg set state=" . ci_q($state) . ", payload='', hint=NULL, ended_at=$now where id=" . ci_q($id) . " and state='live'");
  $n = ci_affected();
  if ($n > 0 && $state !== 'burned') ci_query("delete from cipher_file where msg_id=" . ci_q($id));
  return $n;
}

// The row for $id (live or tombstone), or null if there never was one. Expiry happens here.
function ci_get($id) {
  $r = ci_query("select * from cipher_msg where id=" . ci_q($id));
  $row = $r ? ci_fetch($r) : null;
  if (!$row) return null;
  if ($row['state'] === 'live' && $row['expires'] > 0 && $row['expires'] < time()) {
    ci_end($id, 'expired');
    $row['state'] = 'expired'; $row['payload'] = ''; $row['ended_at'] = time();
  }
  return $row;
}

function ci_hint($row) { return $row && $row['hint'] ? base64_decode($row['hint']) : ''; }

function ci_token_ok($row, $token) {
  return $row && $row['del'] && is_string($token) && $token !== '' && hash('sha256', $token) === $row['del'];
}

// Housekeeping, run on each create: end what has expired, drop old tombstones, spent files, old rate rows.
function ci_tidy() {
  $now = time();
  $r = ci_query("select id from cipher_msg where state='live' and expires>0 and expires<$now limit 200");
  while ($r && ($x = ci_fetch($r))) ci_end($x['id'], 'expired');
  ci_query("delete from cipher_msg where state<>'live' and ended_at<" . ($now - CI_TOMBSTONE_DAYS * 86400) . " limit 500");
  ci_query("delete f from cipher_file f join cipher_msg m on m.id=f.msg_id where m.state='burned' and m.ended_at<" . ($now - CI_BURN_FILE_WINDOW));
  ci_query("delete from cipher_rate where hour<" . (floor($now / 3600) - 48));
  $r = ci_query("select id from cipher_group where expires<$now limit 50");
  while ($r && ($x = ci_fetch($r))) ci_group_wipe($x['id'], 'expired');
}

/* --- Secret Santa groups. Every id here (group, card, slot) is made in the organizer's browser and checked for shape;
 * a clash with an existing row fails the insert, and the browser tries again with new ones. --- */
function ci_is_id($s) { return is_string($s) && preg_match('/^[A-Za-z0-9]{12}$/', $s); }
function ci_is_hash($s) { return is_string($s) && preg_match('/^[0-9a-f]{64}$/', $s); }
// A sealed payload as Cipher.seal makes it ({"v":2, …, "c":…}), no longer than $max bytes.
function ci_is_sealed($s, $max) {
  if (!is_string($s) || strlen($s) < 20 || strlen($s) > $max) return false;
  $p = json_decode($s, true);
  return is_array($p) && isset($p['v']) && $p['v'] === 2 && isset($p['c']) && is_string($p['c']);
}

// The live group row, or null. A group past its expiry is wiped the moment anyone asks for it.
function ci_group_get($gid) {
  if (!ci_is_id($gid)) return null;
  $r = ci_query("select * from cipher_group where id=" . ci_q($gid));
  $g = $r ? ci_fetch($r) : null;
  if ($g && $g['expires'] < time()) { ci_group_wipe($gid, 'expired'); return null; }
  return $g;
}

// Ends an exchange: its cards end as $state (they keep the usual tombstone), and the slots, notes and group row go at once.
function ci_group_wipe($gid, $state) {
  $q = ci_q($gid); $now = time();
  ci_query("update cipher_msg set state=" . ci_q($state) . ", payload='', hint=NULL, ended_at=$now where grp=$q and state='live'");
  ci_query("delete n from cipher_note n join cipher_slot s on s.id=n.slot where s.grp=$q");
  ci_query("delete from cipher_slot where grp=$q");
  ci_query("delete from cipher_group where id=$q");
}

function ci_group_token_ok($g, $token) {
  return $g && is_string($token) && $token !== '' && hash('sha256', $token) === $g['adm'];
}

// The slot row and its live group, or null.
function ci_slot_get($slot) {
  if (!ci_is_id($slot)) return null;
  $r = ci_query("select * from cipher_slot where id=" . ci_q($slot));
  $s = $r ? ci_fetch($r) : null;
  return $s && ci_group_get($s['grp']) ? $s : null;
}

/* Per-IP limits. The IP is stored only as a salted hash, bucketed by hour, kept two days.
 * $kind keeps separate counters: 'rate' for sealing, 'contact' for the contact form. */
function ci_rate_key($kind = 'rate') {
  return hash('sha256', 'cipher.ink/' . $kind . '/' . (isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : ''));
}
function ci_bucket_allow($key, $bytes, $maxCreates, $maxBytes) {
  $k = ci_q($key); $hour = (int)floor(time() / 3600); $bytes = (int)$bytes;
  $r = ci_query("select creates, bytes from cipher_rate where k=$k and hour=$hour");
  $row = $r ? ci_fetch($r) : null;
  if ($row && ($row['creates'] >= $maxCreates || $row['bytes'] + $bytes > $maxBytes)) return false;
  ci_query("insert into cipher_rate (k,hour,creates,bytes) values ($k,$hour,1,$bytes) on duplicate key update creates=creates+1, bytes=bytes+$bytes");
  return true;
}
function ci_rate_allow($bytes) { return ci_bucket_allow(ci_rate_key(), $bytes, CI_RATE_CREATES, CI_RATE_BYTES); }

/* The contact form's one email, always to CI_CONTACT_TO (local.php), sent with Mailgun's HTTP API.
 * Its secret is read from the file CI_MAILGUN_KEY_FILE names, outside the site and outside git. A staging copy (any install not at /)
 * sends in Mailgun's test mode: accepted, never delivered. */
function ci_mailgun_key() {
  return is_readable(CI_MAILGUN_KEY_FILE) ? trim(file_get_contents(CI_MAILGUN_KEY_FILE)) : '';
}
function ci_send_contact($subject, $text, $replyTo) {
  global $CI_BASE;
  $key = ci_mailgun_key();
  if ($key === '') return false;
  $f = array('from' => 'cipher.ink <contact@' . CI_MAILGUN_DOMAIN . '>', 'to' => CI_CONTACT_TO,
    'subject' => $subject, 'text' => $text);
  if ($replyTo !== '') $f['h:Reply-To'] = $replyTo;
  if ($CI_BASE !== '/') $f['o:testmode'] = 'yes';
  $ch = curl_init('https://api.mailgun.net/v3/' . CI_MAILGUN_DOMAIN . '/messages');
  curl_setopt_array($ch, array(CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query($f),
    CURLOPT_USERPWD => 'api:' . $key, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20));
  curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  return $code == 200;
}

function ci_get_legacy($ivt) {
  $r = ci_query("select enc from cipher_enc where iv=" . ci_q($ivt));
  $row = $r ? ci_fetch($r) : null;
  return $row ? $row['enc'] : null;
}

// Link-preview tags (Open Graph and Twitter/X) shared by every page. $img is the absolute URL of a 1200x630 PNG card.
function ci_social_tags($title, $desc, $img, $alt) {
  echo '<meta property="og:locale" content="en_US">' . "\n";
  echo '<meta property="og:image" content="' . ci_h($img) . "\">\n";
  echo "<meta property=\"og:image:type\" content=\"image/png\">\n<meta property=\"og:image:width\" content=\"1200\">\n<meta property=\"og:image:height\" content=\"630\">\n";
  echo '<meta property="og:image:alt" content="' . ci_h($alt) . "\">\n";
  echo "<meta name=\"twitter:card\" content=\"summary_large_image\">\n";
  echo '<meta name="twitter:title" content="' . ci_h($title) . "\">\n";
  echo '<meta name="twitter:description" content="' . ci_h($desc) . "\">\n";
  echo '<meta name="twitter:image" content="' . ci_h($img) . "\">\n";
  echo '<meta name="twitter:image:alt" content="' . ci_h($alt) . "\">\n";
}

// App and icon tags shared by every page: browser tab icons, the iPhone home-screen icon (180 px, opaque, no rounded corners: iOS applies its own mask),
// the web app manifest, and the colours of the browser chrome. Two tab icons only: a browser that reads SVG takes icon.svg, an old one
// takes favicon.ico. The .ico says 32x32, not "any": with "any" Chrome fetches both. The bigger PNGs are for the manifest, not the tab.
function ci_app_tags($b) {
  echo "<meta name=\"theme-color\" content=\"#f8f9fb\" media=\"(prefers-color-scheme: light)\">\n";
  echo "<meta name=\"theme-color\" content=\"#14141b\" media=\"(prefers-color-scheme: dark)\">\n";
  echo "<meta name=\"application-name\" content=\"cipher.ink\">\n<meta name=\"apple-mobile-web-app-title\" content=\"cipher.ink\">\n";
  echo "<meta name=\"format-detection\" content=\"telephone=no\">\n<meta name=\"msapplication-TileColor\" content=\"#0b0b12\">\n";
  echo "<link rel=\"icon\" href=\"{$b}favicon.ico\" sizes=\"32x32\">\n";
  echo "<link rel=\"icon\" href=\"{$b}assets/icon.svg\" type=\"image/svg+xml\">\n";
  echo "<link rel=\"apple-touch-icon\" href=\"{$b}assets/apple-touch-icon.png\" sizes=\"180x180\">\n";
  echo "<link rel=\"manifest\" href=\"{$b}manifest.webmanifest\">\n";
}

// Common <head> for the app pages (compose, message, receipt, contact). $title is plain text; $desc (optional)
// replaces the default description. Content pages have their own head: content/partials.php, ci_content_head().
function ci_head($title, $page, $desc = null) {
  global $CI_BASE;
  $b = ci_h($CI_BASE);
  $v = CI_VERSION;
  echo "<!doctype html>\n<html lang=\"en\" data-page=\"" . ci_h($page) . "\">\n<head>\n";
  echo "<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n";
  // Link previews. A message page says only that a sealed message is waiting, never anything about it.
  if ($desc === null) $desc = 'Write a message, seal it in your browser, send the link. The server only ever holds ciphertext.';
  $og = $page === 'view' ? array('A sealed message', 'Someone sent you a sealed message. Open the link to unseal it.') : array($title, $desc);
  // A Secret Santa card or group: generic, never a name. A chat app's unfurl doesn't count as an open (only unsealing does).
  if ($page === 'santa') $og = array('Your Secret Santa draw', 'Names were drawn for a Secret Santa. Open the link to see who you\'re buying for. Nobody else can.');
  $ogimg = $page === 'santa' ? 'assets/og/santa-card.png' : 'assets/og/default.png';
  $host = isset($_SERVER['HTTP_HOST']) && preg_match('/^[a-z0-9.-]+$/i', $_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'cipher.ink';
  $abs = 'https://' . $host . $CI_BASE;
  $indexable = ($page === 'compose' || $page === 'contact') && $CI_BASE === '/';
  echo "<title>" . ci_h($title) . "</title>\n";
  echo "<meta name=\"description\" content=\"" . ci_h($desc) . "\">\n";
  // Only the front page and the contact page belong in search results; messages and receipts never do.
  if ($page === 'compose' || $page === 'contact') echo "<link rel=\"canonical\" href=\"https://cipher.ink/" . ($page === 'contact' ? 'contact' : '') . "\">\n";
  if (!$indexable) echo "<meta name=\"robots\" content=\"noindex" . ($CI_BASE !== '/' ? ', nofollow' : '') . "\">\n";
  else echo "<meta name=\"robots\" content=\"max-image-preview:large\">\n";
  echo "<meta property=\"og:site_name\" content=\"cipher.ink\">\n";
  echo "<meta property=\"og:type\" content=\"website\">\n";
  if ($page === 'compose' || $page === 'contact') echo "<meta property=\"og:url\" content=\"https://cipher.ink/" . ($page === 'contact' ? 'contact' : '') . "\">\n";
  echo "<meta property=\"og:title\" content=\"" . ci_h($og[0]) . "\">\n";
  echo "<meta property=\"og:description\" content=\"" . ci_h($og[1]) . "\">\n";
  ci_social_tags($og[0], $og[1], $abs . $ogimg, $page === 'santa' ? 'A sealed envelope over a wall of ciphertext' : 'cipher.ink: write a message, seal it in your browser, send the link');
  ci_app_tags($b);
  echo "<link rel=\"preload\" href=\"{$b}assets/fonts/newsreader.woff2\" as=\"font\" type=\"font/woff2\" crossorigin>\n";
  echo "<link rel=\"preload\" href=\"{$b}assets/fonts/space-mono-bold.woff2\" as=\"font\" type=\"font/woff2\" crossorigin>\n";
  echo "<link rel=\"stylesheet\" href=\"{$b}assets/app.css?v=$v\">\n";
  echo "<script src=\"{$b}assets/theme.js?v=$v\"></script>\n";
  if ($page === 'compose') {
    // What search engines read about the product: the site, its publisher, and the app itself (all free, all in the browser).
    $org = array('@type' => 'Organization', 'name' => 'cipher.ink', 'url' => 'https://cipher.ink/', 'logo' => 'https://cipher.ink/assets/logo-512.png');
    $graph = array(
      array('@type' => 'WebSite', 'name' => 'cipher.ink', 'url' => 'https://cipher.ink/', 'publisher' => $org),
      $org,
      array('@type' => 'WebApplication', 'name' => 'cipher.ink', 'url' => 'https://cipher.ink/', 'description' => $desc,
        'applicationCategory' => 'SecurityApplication', 'operatingSystem' => 'Any', 'browserRequirements' => 'Requires JavaScript and a current browser',
        'offers' => array('@type' => 'Offer', 'price' => '0', 'priceCurrency' => 'USD'), 'isAccessibleForFree' => true, 'publisher' => $org));
    foreach ($graph as $g) { $g['@context'] = 'https://schema.org'; echo '<script type="application/ld+json">' . ci_json($g) . "</script>\n"; }
  }
  echo "</head>\n";
}

function ci_scripts($names) {
  global $CI_BASE;
  foreach ($names as $n) echo "<script src=\"" . ci_h($CI_BASE) . "assets/$n?v=" . CI_VERSION . "\" defer></script>\n";
}

/* The feedback widget is a separate shared service's (the script at CI_FB_HOST/w.js?site=cipher, set in local.php):
 * it draws its own tab in a Shadow DOM. This prints the two script tags it needs, at the end of the page's <body>: assets/feedback-hooks.js
 * (sync, same origin; defines fbw.context() from the data-* attributes here, since the CSP forbids inline script) and then the async
 * embed. $kind is a coarse page kind chosen HERE, on the server, never read from the address: compose, view, receipt, contact,
 * santa-card, santa-group, santa, notfound, or a public content key such as learn/aes-gcm. The footer and About "Send feedback" links
 * ([data-fb-open]) are wired by the hooks file. CSP: CI_FB_HOST is in script-src and connect-src, and nowhere else. */
function ci_feedback($kind) {
  global $CI_BASE;
  if (CI_FB_HOST === '') return;
  if (!preg_match('/^[a-z0-9][a-z0-9\/-]{0,63}$/', $kind)) $kind = 'other';
  $GLOBALS['ci_fb_on'] = true;
  echo '<script src="' . ci_h($CI_BASE) . 'assets/feedback-hooks.js?v=' . CI_VERSION . '" data-kind="' . ci_h($kind) . '" data-ver="' . CI_VERSION . "\"></script>\n";
  echo '<script async src="' . CI_FB_HOST . '/w.js?site=cipher"></script>' . "\n";
}
