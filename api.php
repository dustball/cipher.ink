<?php
// cipher.ink JSON API. POST only. The server stores and returns opaque ciphertext; it never
// sees a passphrase, a link key, a file name, or a word of any message.
//
//   create   payload, mode (p|k), burn, ttl, del (sha256 hex of the token), hint?, files f0..f9 (multipart)
//   open     id            → payload; a burn-after-reading message ends ('burned') as it is handed over
//   opened   id, token     → records a successful unseal (read receipt); the token proves it was decrypted
//   file     id, n         → one encrypted attachment, raw bytes
//   burn     id, token     → "Destroy it now"
//   status   ids[], tokens[] → state + timestamps for the sender's "My messages" and status page
//   contact  from?, body, site (honeypot) → emails the site's owner through Mailgun (NOT encrypted)
// Secret Santa (an exchange = sealed cards + sealed wishlists and notes; names and pairings never arrive here):
//   group_create  gid, adm, admin, expires, ids[], cards[], dels[], slots[], wkeys[], tkeys[]  → stores it all at once
//   group_redraw  the same, plus admin_token → destroys the old cards, slots and notes, stores the new ones
//   group_admin   gid (+ admin_token, admin to rewrite) → the organizer's sealed blob
//   group_end     gid, admin_token → destroys everything now
//   group_read    gid → every slot and note of the group (all sealed), so a card's reads reveal nothing
//   group_status  gid → per slot: when its wishlist was written, how many notes
//   slot_put      slot, wtoken, payload → replaces a wishlist
//   note_add      slot, ttoken, payload → appends a note to a thread
// The token is the random string sealed inside the message; the server holds only its sha256.

include "lib.php";
ci_headers(false);

function out($a, $code = 200) {
  if ($code != 200) header("HTTP/1.0 $code");
  header('Content-Type: application/json; charset=utf-8');
  print json_encode($a);
  exit;
}
function arg($k) { return isset($_POST[$k]) && is_string($_POST[$k]) ? $_POST[$k] : ''; }
function args($k) {
  $out = array();
  if (isset($_POST[$k]) && is_array($_POST[$k])) foreach ($_POST[$k] as $v) $out[] = is_string($v) ? $v : '';
  return $out;
}

/* The cards and slots of a draw, checked. Returns array(n, bytes) or stops with an error. */
function santa_check_draw() {
  $ids = args('ids'); $cards = args('cards'); $dels = args('dels'); $slots = args('slots'); $wk = args('wkeys'); $tk = args('tkeys');
  $n = count($ids);
  if ($n < CI_SANTA_MIN || $n > CI_SANTA_MAX) out(array('error' => 'An exchange needs ' . CI_SANTA_MIN . ' to ' . CI_SANTA_MAX . ' people.'), 400);
  if (count($cards) !== $n || count($dels) !== $n || count($slots) !== $n || count($wk) !== $n || count($tk) !== $n) out(array('error' => 'The draw arrived incomplete.'), 400);
  if (count(array_unique($ids)) !== $n || count(array_unique($slots)) !== $n) out(array('error' => 'The draw arrived incomplete.'), 400);
  $bytes = 0;
  for ($i = 0; $i < $n; $i++) {
    if (!ci_is_id($ids[$i]) || !ci_is_id($slots[$i]) || !ci_is_hash($dels[$i]) || !ci_is_hash($wk[$i]) || !ci_is_hash($tk[$i]))
      out(array('error' => 'The draw arrived incomplete.'), 400);
    if (!ci_is_sealed($cards[$i], CI_SANTA_CARD_BYTES)) out(array('error' => 'A card is too large. Shorten the note to everyone.'), 413);
    $bytes += strlen($cards[$i]);
  }
  return array($n, $bytes);
}

/* Inserts the cards (ordinary secret-link messages that belong to the group) and the empty slots. Inside a transaction. */
function santa_insert_draw($gid, $expires) {
  $ids = args('ids'); $cards = args('cards'); $dels = args('dels'); $slots = args('slots'); $wk = args('wkeys'); $tk = args('tkeys');
  $now = time(); $g = ci_q($gid);
  foreach ($ids as $i => $cid) {
    if (!ci_query("insert into cipher_msg (id,payload,mode,files,burn,del,created,expires,grp) values (" . ci_q($cid) . "," . ci_q($cards[$i]) .
      ",'k',0,0," . ci_q($dels[$i]) . ",$now,$expires,$g)")) return false;
    if (!ci_query("insert into cipher_slot (id,grp,payload,wkey,tkey) values (" . ci_q($slots[$i]) . ",$g,''," . ci_q($wk[$i]) . "," . ci_q($tk[$i]) . ")")) return false;
  }
  return true;
}

// Gift date + 30 days, as the browser computed it, kept between one day from now and CI_SANTA_DAYS after the group began.
function santa_expires($created) {
  $e = (int)arg('expires'); $now = time();
  return max($now + 86400, min($e, $created + CI_SANTA_DAYS * 86400));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(array('error' => 'POST only'), 405);
// PHP has already parsed the body by now (post_max_size is the server's, 512M); this stops anything bigger than the largest legal seal
// (payload + 5 MB of attachments + the Secret Santa draw, with slack) from going any further.
if (isset($_SERVER['CONTENT_LENGTH']) && (int)$_SERVER['CONTENT_LENGTH'] > 12 * 1048576) out(array('error' => 'That request is too large.'), 413);
$action = arg('action');
$id = arg('id');

if ($action === 'create') {
  $payload = arg('payload');
  $mode = arg('mode') === 'k' ? 'k' : 'p';
  $burn = arg('burn') ? 1 : 0;
  $ttl = (int)arg('ttl');
  $del = strtolower(arg('del'));
  $hint = $mode === 'p' ? trim(arg('hint')) : '';
  if (strlen($payload) < 20) out(array('error' => 'Nothing to store.'), 400);
  if (strlen($payload) > CI_MAX_PAYLOAD) out(array('error' => 'That message is too large to seal.'), 413);
  $p = json_decode($payload, true);
  if (!is_array($p) || !isset($p['v']) || $p['v'] !== 2 || !isset($p['c'])) out(array('error' => 'Not a sealed payload.'), 400);
  if (!in_array($ttl, array(0, 600, 3600, 86400, 604800, 2592000), true)) $ttl = 604800;
  if (!preg_match('/^[0-9a-f]{64}$/', $del)) out(array('error' => 'Missing token.'), 400);
  if (function_exists('mb_substr')) $hint = mb_substr($hint, 0, 120, 'UTF-8'); else $hint = substr($hint, 0, 360);

  $files = array(); $fbytes = 0;
  for ($n = 0; $n < CI_MAX_FILES; $n++) {
    if (!isset($_FILES["f$n"])) break;
    $f = $_FILES["f$n"];
    if ($f['error'] !== UPLOAD_ERR_OK) out(array('error' => 'An attachment did not upload.'), 400);
    $fbytes += $f['size'];
    if ($fbytes > CI_MAX_FILE_BYTES) out(array('error' => 'Attachments are limited to 5 MB in total.'), 413);
    $files[] = $f['tmp_name'];
  }
  if (!ci_rate_allow(strlen($payload) + $fbytes)) out(array('error' => 'Too many messages from your connection this hour. Try again later.'), 429);

  ci_tidy();
  $id = ci_new_id();
  $now = time();
  $sql = "insert into cipher_msg (id,payload,mode,hint,files,burn,del,created,expires) values (" .
    ci_q($id) . "," . ci_q($payload) . "," . ci_q($mode) . "," . ($hint !== '' ? ci_q(base64_encode($hint)) : "NULL") . "," .
    count($files) . ",$burn," . ci_q($del) . ",$now," . ($ttl ? $now + $ttl : 0) . ")";
  ci_query($sql) or out(array('error' => 'Could not store the message.'), 500);
  foreach ($files as $n => $tmp) {
    $data = file_get_contents($tmp);
    if (!ci_query("insert into cipher_file (msg_id,n,data) values (" . ci_q($id) . ",$n," . ci_q($data) . ")")) {
      ci_query("delete from cipher_file where msg_id=" . ci_q($id));
      ci_query("delete from cipher_msg where id=" . ci_q($id));
      out(array('error' => 'Could not store an attachment.'), 500);
    }
  }
  out(array('id' => $id));
}

if ($action === 'open') {
  ci_tidy();   // also here, so a burned message's leftover files go soon after their window even when nobody is sealing
  $row = ci_get($id);
  if (!$row || $row['state'] !== 'live') out(array('error' => 'gone'), 404);
  if ($row['burn']) {
    // Two people opening at once: only the one whose update lands gets the message.
    ci_query("update cipher_msg set opened_at=" . time() . ", opens=opens+1 where id=" . ci_q($id) . " and state='live'");
    if (ci_end($id, 'burned') < 1) out(array('error' => 'gone'), 404);
  }
  out(array('payload' => $row['payload'], 'burned' => (bool)$row['burn'], 'files' => (int)$row['files'],
    'created' => (int)$row['created'], 'expires' => (int)$row['expires']));
}

if ($action === 'opened') {
  $row = ci_get($id);
  if (!$row || !ci_token_ok($row, arg('token'))) out(array('error' => 'Not allowed.'), 403);
  if ($row['state'] === 'live')
    ci_query("update cipher_msg set opens=opens+1, opened_at=if(opened_at=0," . time() . ",opened_at) where id=" . ci_q($id));
  out(array('ok' => true));
}

if ($action === 'file') {
  $n = (int)arg('n');
  $row = ci_get($id);
  $burnWindow = $row && $row['state'] === 'burned' && time() - $row['ended_at'] < CI_BURN_FILE_WINDOW;
  if (!$row || !($row['state'] === 'live' || $burnWindow)) out(array('error' => 'gone'), 404);
  $r = ci_query("select data from cipher_file where msg_id=" . ci_q($id) . " and n=$n");
  $f = $r ? ci_fetch($r) : null;
  if (!$f) out(array('error' => 'gone'), 404);
  if ($burnWindow) ci_query("delete from cipher_file where msg_id=" . ci_q($id) . " and n=$n");
  header('Content-Type: application/octet-stream');
  header('Content-Length: ' . strlen($f['data']));
  print $f['data'];
  exit;
}

if ($action === 'burn') {
  $row = ci_get($id);
  if (!$row) out(array('error' => 'gone'), 404);
  if (!ci_token_ok($row, arg('token'))) out(array('error' => 'Not allowed.'), 403);
  if ($row['state'] === 'live') ci_end($id, 'destroyed');
  else ci_query("delete from cipher_file where msg_id=" . ci_q($id));
  out(array('ok' => true));
}

if ($action === 'status') {
  $ids = isset($_POST['ids']) && is_array($_POST['ids']) ? array_slice($_POST['ids'], 0, 100) : array();
  $toks = isset($_POST['tokens']) && is_array($_POST['tokens']) ? $_POST['tokens'] : array();
  $res = array();
  foreach ($ids as $i => $mid) {
    $mid = (string)$mid;
    $row = ci_get($mid);
    if (!$row) { $res[$mid] = array('state' => 'gone'); continue; }
    if (!ci_token_ok($row, isset($toks[$i]) ? (string)$toks[$i] : '')) { $res[$mid] = array('state' => 'denied'); continue; }
    $res[$mid] = array('state' => $row['state'], 'burn' => (bool)$row['burn'], 'mode' => $row['mode'],
      'created' => (int)$row['created'], 'expires' => (int)$row['expires'], 'opened_at' => (int)$row['opened_at'],
      'opens' => (int)$row['opens'], 'ended_at' => (int)$row['ended_at'], 'files' => (int)$row['files'], 'hint' => ci_hint($row));
  }
  out(array('status' => $res));
}

if ($action === 'contact') {
  $from = trim(arg('from'));
  $body = trim(str_replace("\r\n", "\n", arg('body')));
  if (arg('site') !== '') out(array('ok' => true));   // the hidden field: only bots fill it in
  if ($body === '') out(array('error' => 'Write a message first.'), 400);
  if (strlen($body) > 20000) out(array('error' => 'That is too long. Keep it under 5,000 characters.'), 413);
  if ($from !== '' && (strlen($from) > 200 || !filter_var($from, FILTER_VALIDATE_EMAIL))) out(array('error' => 'That email address doesn’t look right.'), 400);
  if (!ci_bucket_allow(ci_rate_key('contact'), 0, CI_CONTACT_PER_IP, PHP_INT_MAX) ||
      !ci_bucket_allow(hash('sha256', 'cipher.ink/contact-all'), 0, CI_CONTACT_ALL, PHP_INT_MAX))
    out(array('error' => 'Too many messages through this form just now. Try again in an hour.'), 429);
  $first = preg_replace('/\s+/', ' ', $body);
  $subject = 'cipher.ink contact: ' . (function_exists('mb_substr') ? mb_substr($first, 0, 60, 'UTF-8') : substr($first, 0, 60));
  $when = new DateTime('now', new DateTimeZone('America/Chicago'));
  $text = $body . "\n\n--\nFrom: " . ($from !== '' ? $from . ' (reply to this email to answer)' : 'no address given') .
    "\nSent through " . (isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'cipher.ink') . $CI_BASE . 'contact, ' . $when->format('M j, g:i A T') . "\n";
  if (!ci_send_contact($subject, $text, $from)) out(array('error' => 'Could not send it. Try again in a minute.'), 502);
  out(array('ok' => true));
}

if ($action === 'group_create' || $action === 'group_redraw') {
  $gid = arg('gid'); $admin = arg('admin');
  if (!ci_is_id($gid)) out(array('error' => 'The draw arrived incomplete.'), 400);
  if (!ci_is_sealed($admin, CI_SANTA_ADMIN_BYTES)) out(array('error' => 'The organizer’s copy is too large.'), 413);
  list($n, $bytes) = santa_check_draw();
  $old = null;
  if ($action === 'group_redraw') {
    $old = ci_group_get($gid);
    if (!$old) out(array('error' => 'gone'), 404);
    if (!ci_group_token_ok($old, arg('admin_token'))) out(array('error' => 'Not allowed.'), 403);
  } elseif (!ci_is_hash(arg('adm'))) out(array('error' => 'Missing token.'), 400);
  if (!ci_bucket_allow(ci_rate_key('santa'), $bytes + strlen($admin), CI_SANTA_PER_HOUR, CI_RATE_BYTES))
    out(array('error' => 'Too many draws from your connection this hour. Try again later.'), 429);
  ci_tidy();
  $now = time();
  $created = $old ? (int)$old['created'] : $now;
  $expires = santa_expires($created);
  $g = ci_q($gid);
  ci_query('start transaction');
  if ($old) {
    // The old cards end as destroyed (their links say so); their wishlists and notes go.
    $ok = ci_query("update cipher_msg set state='destroyed', payload='', ended_at=$now where grp=$g and state='live'") &&
      ci_query("delete n from cipher_note n join cipher_slot s on s.id=n.slot where s.grp=$g") &&
      ci_query("delete from cipher_slot where grp=$g") &&
      ci_query("update cipher_group set admin=" . ci_q($admin) . ", cards=$n, expires=$expires where id=$g");
  } else {
    $ok = ci_query("insert into cipher_group (id,admin,adm,cards,created,expires) values ($g," . ci_q($admin) . "," . ci_q(arg('adm')) . ",$n,$now,$expires)");
  }
  if (!$ok || !santa_insert_draw($gid, $expires)) {
    ci_query('rollback');
    out(array('error' => 'clash'), 409);    // an id was already taken: the browser draws new ids and sends it again
  }
  ci_query('commit');
  out(array('ok' => true, 'expires' => $expires));
}

if ($action === 'group_admin') {
  $g = ci_group_get(arg('gid'));
  if (!$g) out(array('error' => 'gone'), 404);
  if (arg('admin') !== '') {
    if (!ci_group_token_ok($g, arg('admin_token'))) out(array('error' => 'Not allowed.'), 403);
    if (!ci_is_sealed(arg('admin'), CI_SANTA_ADMIN_BYTES)) out(array('error' => 'The organizer’s copy is too large.'), 413);
    ci_query("update cipher_group set admin=" . ci_q(arg('admin')) . " where id=" . ci_q($g['id']));
    out(array('ok' => true));
  }
  out(array('admin' => $g['admin'], 'cards' => (int)$g['cards'], 'created' => (int)$g['created'], 'expires' => (int)$g['expires']));
}

if ($action === 'group_end') {
  $g = ci_group_get(arg('gid'));
  if (!$g) out(array('error' => 'gone'), 404);
  if (!ci_group_token_ok($g, arg('admin_token'))) out(array('error' => 'Not allowed.'), 403);
  ci_group_wipe($g['id'], 'destroyed');
  out(array('ok' => true));
}

if ($action === 'group_read' || $action === 'group_status') {
  $g = ci_group_get(arg('gid'));
  if (!$g) out(array('error' => 'gone'), 404);
  $q = ci_q($g['id']); $full = $action === 'group_read';
  $slots = array();
  $r = ci_query("select s.id, s.payload, s.updated, count(n.seq) notes from cipher_slot s left join cipher_note n on n.slot=s.id where s.grp=$q group by s.id");
  while ($r && ($x = ci_fetch($r)))
    $slots[$x['id']] = $full ? array('payload' => $x['payload'], 'updated' => (int)$x['updated'], 'notes' => array())
      : array('updated' => (int)$x['updated'], 'notes' => (int)$x['notes']);
  if ($full) {
    $r = ci_query("select n.slot, n.seq, n.payload, n.created from cipher_note n join cipher_slot s on s.id=n.slot where s.grp=$q order by n.slot, n.seq");
    while ($r && ($x = ci_fetch($r)))
      $slots[$x['slot']]['notes'][] = array('seq' => (int)$x['seq'], 'payload' => $x['payload'], 'created' => (int)$x['created']);
  }
  out(array('slots' => $slots, 'expires' => (int)$g['expires']));
}

if ($action === 'slot_put') {
  $s = ci_slot_get(arg('slot'));
  if (!$s) out(array('error' => 'gone'), 404);
  if (!ci_is_hash($s['wkey']) || hash('sha256', arg('wtoken')) !== $s['wkey']) out(array('error' => 'Not allowed.'), 403);
  $p = arg('payload');
  if ($p !== '' && !ci_is_sealed($p, CI_SANTA_SLOT_BYTES)) out(array('error' => 'That wishlist is too long.'), 413);
  ci_query("update cipher_slot set payload=" . ci_q($p) . ", updated=" . ($p === '' ? 0 : time()) . " where id=" . ci_q($s['id']));
  out(array('ok' => true));
}

if ($action === 'note_add') {
  $s = ci_slot_get(arg('slot'));
  if (!$s) out(array('error' => 'gone'), 404);
  if (hash('sha256', arg('ttoken')) !== $s['tkey']) out(array('error' => 'Not allowed.'), 403);
  $p = arg('payload');
  if (!ci_is_sealed($p, CI_SANTA_NOTE_BYTES)) out(array('error' => 'That note is too long.'), 413);
  $q = ci_q($s['id']);
  $r = ci_query("select count(*) c, coalesce(max(seq),0) m from cipher_note where slot=$q");
  $x = $r ? ci_fetch($r) : array('c' => 0, 'm' => 0);
  if ($x['c'] >= CI_SANTA_NOTES) out(array('error' => 'This thread is full.'), 413);
  if (!ci_bucket_allow(ci_rate_key('note'), 0, CI_SANTA_NOTES_PER_HOUR, PHP_INT_MAX)) out(array('error' => 'Too many notes from your connection this hour.'), 429);
  $seq = $x['m'] + 1;
  if (!ci_query("insert into cipher_note (slot,seq,payload,created) values ($q,$seq," . ci_q($p) . "," . time() . ")")) out(array('error' => 'Could not store the note. Try again.'), 500);
  out(array('ok' => true, 'seq' => (int)$seq));
}

out(array('error' => 'Unknown action.'), 400);
