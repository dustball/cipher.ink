<?php
// The reading page. /m/<id> is a v2 message (cipher_msg); /ivt/<id> is a 2016-2026 one (cipher_enc).
include "lib.php";
ci_headers();
include "partials.php";

$data = array('base' => $CI_BASE, 'kind' => 'gone');
if (!empty($_GET['ivt'])) {
  $ivt = (string)$_GET['ivt'];
  $enc = ci_get_legacy($ivt);
  if ($enc) $data = array('base' => $CI_BASE, 'kind' => 'legacy', 'id' => $ivt, 'mode' => 'p', 'enc' => $enc);
} elseif (!empty($_GET['id'])) {
  $id = (string)$_GET['id'];
  $row = ci_get($id);
  if ($row && $row['state'] === 'live') {
    $data = array('base' => $CI_BASE, 'kind' => 'v2', 'id' => $id, 'mode' => $row['mode'], 'hint' => ci_hint($row),
      'files' => (int)$row['files'], 'burn' => (bool)$row['burn'], 'created' => (int)$row['created'], 'expires' => (int)$row['expires']);
    // A burn-after-reading message is only handed over by api.php's open, which ends it.
    if (!$row['burn']) $data['payload'] = $row['payload'];
  } elseif ($row) {
    $data['ended'] = $row['state'];
  }
}
$gone = array(
  'burned' => array('Burned.', 'This message was opened, and destroyed itself the moment it was read.'),
  'destroyed' => array('Destroyed.', 'Someone holding the message destroyed it. The server no longer has it.'),
  'expired' => array('Expired.', 'This message reached the end of its time and deleted itself.'),
  '' => array('Nothing here.', 'This message was burned, expired, or never existed. Whatever it said, it is not on this server.'));
$g = $gone[isset($data['ended']) ? $data['ended'] : ''];
if ($data['kind'] === 'gone') header("HTTP/1.0 404 Not Found");

ci_head($data['kind'] === 'gone' ? 'Nothing here · cipher.ink' : 'A sealed message · cipher.ink', 'view');
?>
<body class="view kind-<?php echo ci_h($data['kind']); ?>">
<canvas id="wall" aria-hidden="true"></canvas>
<?php ci_topbar(false); ?>

<main class="vault" id="vault">
<?php if ($data['kind'] === 'gone') { ?>
  <div class="card gonecard">
    <div class="ash" aria-hidden="true">∅</div>
    <h1><?php echo ci_h($g[0]); ?></h1>
    <p class="lede"><?php echo ci_h($g[1]); ?></p>
    <a class="primary btn" href="<?php echo ci_h($CI_BASE); ?>">Write one of your own</a>
  </div>
<?php } else { ?>
  <form class="card lockcard" id="unlock" autocomplete="off">
    <div class="sigil" aria-hidden="true">
      <svg viewBox="0 0 120 120"><circle class="ring r1" cx="60" cy="60" r="54"/><circle class="ring r2" cx="60" cy="60" r="44"/>
        <path class="shackle" d="M44 56v-9a16 16 0 0 1 32 0v9"/><rect class="body" x="36" y="54" width="48" height="38" rx="8"/>
        <circle class="hole" cx="60" cy="70" r="5"/><path class="hole" d="M58 72h4l1.5 10h-7z"/></svg>
    </div>
    <h1>A sealed message</h1>
    <p class="meta" id="meta"></p>
    <p class="hint" id="hint" hidden></p>
    <div class="passrow" id="passrow">
      <input id="pass" type="password" placeholder="passphrase" aria-label="Passphrase" autocomplete="off" autocapitalize="off" spellcheck="false">
      <button type="button" class="ghost icon peek" id="peek" aria-label="Show passphrase" title="Show">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c5 0 9 4.5 10 7-1 2.5-5 7-10 7S3 14.5 2 12c1-2.5 5-7 10-7zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg></button>
    </div>
    <div class="keyrow" id="keyrow" hidden>
      <p class="fine">This link arrived without its key, the part after the <b>#</b>. Paste the whole link you were sent:</p>
      <input id="keyin" type="text" placeholder="https://cipher.ink/m/…#…" aria-label="The full link" spellcheck="false">
    </div>
    <button type="submit" class="seal" id="open-btn"><span class="lbl">Unseal</span></button>
    <p class="warn" id="burnwarn" hidden>🔥 This message destroys itself when it is opened. Read it now; there is no second look.</p>
    <p class="err" id="err" role="alert"></p>
  </form>
<?php } ?>
</main>

<main class="desk reader" id="reader" hidden>
  <div class="banner" id="banner" hidden></div>
  <div class="page"><div class="prose" id="msg"></div>
    <div class="atts reading-atts" id="atts" hidden></div></div>
  <div class="readbar" id="readbar">
    <span class="stamp" id="stamp"></span>
    <button type="button" class="ghost" id="copy-text">Copy text</button>
    <button type="button" class="ghost danger" id="burn-now" hidden>Destroy it now</button>
    <a class="ghost btn" href="<?php echo ci_h($CI_BASE); ?>" target="_blank" rel="noopener">Write back ↗</a>
  </div>
</main>

<?php ci_mine(); ci_about(); ci_feedback('view'); ?>
<script type="application/json" id="ci-data"><?php echo ci_json($data); ?></script>
<?php ci_scripts(array('purify.min.js', 'crypto.js', 'app.js', 'mine.js', 'wall.js', 'view.js')); ?>
</body>
</html>
