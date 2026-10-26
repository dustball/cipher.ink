<?php
// Secret Santa pages that belong to one exchange (the landing page and the form are /secret-santa, a content page).
//   /santa/<id>#<key>        one participant's card: an ordinary secret-link message that holds their draw
//   /santa/g/<gid>#<key>     the organizer's page: hand out the cards, see who has opened theirs, redraw, end
include "lib.php";
ci_headers();
include "partials.php";

$data = array('base' => $CI_BASE, 'kind' => 'gone');
$isGroup = !empty($_GET['g']);
if ($isGroup) {
  $g = ci_group_get((string)$_GET['g']);
  if ($g) $data = array('base' => $CI_BASE, 'kind' => 'group', 'gid' => $g['id'], 'admin' => $g['admin'], 'expires' => (int)$g['expires']);
} elseif (!empty($_GET['id'])) {
  $id = (string)$_GET['id'];
  $row = ci_get($id);
  if ($row && $row['state'] === 'live' && empty($row['grp'])) { header('Location: ' . $CI_BASE . 'm/' . rawurlencode($id), true, 302); exit; }
  if ($row && $row['state'] === 'live') {
    $data = array('base' => $CI_BASE, 'kind' => 'card', 'id' => $id, 'payload' => $row['payload'], 'expires' => (int)$row['expires']);
    // The card's group may have ended a moment ago (redrawn, ended or expired); then the card is gone too.
    if (!ci_group_get($row['grp'])) { $row = ci_get($id); $data = array('base' => $CI_BASE, 'kind' => 'gone', 'ended' => $row ? $row['state'] : ''); }
  } elseif ($row) {
    $data['ended'] = $row['state'];
  }
}
if ($data['kind'] === 'gone') header("HTTP/1.0 404 Not Found");
$gone = $isGroup
  ? array('This exchange has ended.', 'The organizer ended it, or it reached its end date and deleted itself. Its cards, wishlists and notes are gone from the server.')
  : (isset($data['ended']) && $data['ended'] === 'destroyed'
    ? array('This card was torn up.', 'The organizer redrew the names or ended the exchange, so this card no longer opens. Ask them for your new link.')
    : array('Nothing here.', 'This card expired, or it never existed. Whatever it said, it is not on this server.'));

ci_head($isGroup ? 'Your Secret Santa exchange' : 'Your Secret Santa draw', 'santa');
?>
<body class="<?php echo $data['kind'] === 'group' ? '' : 'view '; ?>santa kind-<?php echo ci_h($data['kind']); ?>">
<?php if ($data['kind'] === 'card') { ?><canvas id="wall" aria-hidden="true"></canvas><?php } ?>
<?php ci_topbar(false); ?>

<?php if ($data['kind'] === 'gone') { ?>
<main class="vault">
  <div class="card gonecard">
    <div class="ash" aria-hidden="true">∅</div>
    <h1><?php echo ci_h($gone[0]); ?></h1>
    <p class="lede"><?php echo ci_h($gone[1]); ?></p>
    <a class="primary btn" href="<?php echo ci_h($CI_BASE); ?>secret-santa">Start a new exchange</a>
  </div>
</main>
<?php } elseif ($data['kind'] === 'card') { ?>
<main class="vault" id="vault">
  <form class="card lockcard" id="unlock" autocomplete="off">
    <div class="sigil" aria-hidden="true">
      <svg viewBox="0 0 120 120"><circle class="ring r1" cx="60" cy="60" r="54"/><circle class="ring r2" cx="60" cy="60" r="44"/>
        <rect class="body" x="30" y="52" width="60" height="40" rx="5"/><rect class="hole" x="56" y="52" width="8" height="40"/>
        <path class="shackle" d="M60 52c-6-14-24-16-24-6 0 6 12 6 24 6m0 0c6-14 24-16 24-6 0 6-12 6-24 6"/></svg>
    </div>
    <h1>Your Secret Santa draw</h1>
    <p class="meta" id="meta">Sealed in the organizer's browser · the key is in your link</p>
    <div class="keyrow" id="keyrow" hidden>
      <p class="fine">This link arrived without its key, the part after the <b>#</b>. Paste the whole link you were sent:</p>
      <input id="keyin" type="text" placeholder="https://cipher.ink/santa/…#…" aria-label="The full link" spellcheck="false">
    </div>
    <button type="submit" class="seal" id="open-btn"><span class="lbl">Open my card</span></button>
    <p class="err" id="err" role="alert"></p>
  </form>
</main>

<main class="desk reader ss-card" id="reader" hidden>
  <div class="page ss-page">
    <p class="ss-kicker" id="c-title"></p>
    <h1 class="ss-big" id="c-who"></h1>
    <p class="ss-details" id="c-details"></p>
    <p class="ss-note" id="c-note" hidden></p>
    <p class="ss-opened" id="c-opened" role="status"></p>

    <section class="ss-sec">
      <h2 id="c-wish-h">Their wishlist</h2>
      <div class="ss-wish" id="c-wish"></div>
    </section>

    <section class="ss-sec">
      <h2 id="c-ask-h">Ask them anonymously</h2>
      <p class="fine" id="c-ask-fine"></p>
      <div class="ss-thread" id="c-ask"></div>
      <form class="ss-say" id="c-ask-form"><textarea id="c-ask-in" rows="2" maxlength="500" aria-labelledby="c-ask-h"></textarea><button type="submit" class="primary">Send</button></form>
      <div class="ss-unmask" id="c-unmask" hidden><button type="button" class="ghost" id="c-unmask-btn"></button></div>
    </section>

    <section class="ss-sec">
      <h2>Your wishlist</h2>
      <p class="fine">Only your Santa can read it. It is sealed in this tab before it is saved.</p>
      <textarea id="c-mywish" rows="5" maxlength="1500" aria-label="Your wishlist"></textarea>
      <div class="ss-row"><button type="button" class="primary" id="c-mywish-save">Save my wishlist</button><span class="fine" id="c-mywish-st" role="status"></span></div>
    </section>

    <section class="ss-sec">
      <h2>Notes from your Santa</h2>
      <p class="fine">Your Santa can ask you things here without saying who they are. You answer without knowing either.</p>
      <div class="ss-thread" id="c-mine"></div>
      <form class="ss-say" id="c-mine-form"><textarea id="c-mine-in" rows="2" maxlength="500" aria-label="Answer your Santa"></textarea><button type="submit" class="primary">Answer</button></form>
    </section>

    <div class="ss-foot">
      <button type="button" class="ghost" id="c-refresh">Refresh</button>
      <button type="button" class="ghost" id="c-keep">Keep this card in this browser</button>
      <p class="fine" id="c-expiry"></p>
      <p class="fine">This link is the only way back to your card. Nobody can send it to you again except the organizer, and only if they kept it.</p>
      <p class="fine ss-again">Running another exchange? <a href="<?php echo ci_h($CI_BASE); ?>secret-santa">Make a sealed one.</a></p>
    </div>
  </div>
</main>
<?php } else { ?>
<main class="desk ss-group" id="group">
  <div class="page ss-page">
    <p class="ss-kicker">Secret Santa · organizer</p>
    <h1 class="ss-big" id="g-title">Your exchange</h1>
    <p class="ss-details" id="g-details"></p>
    <p class="err" id="g-err" role="alert"></p>
    <div id="g-body" hidden>
      <p class="lede ss-lede" id="g-lede"></p>
      <div class="ss-row ss-tools">
        <button type="button" class="ghost" id="g-refresh">Refresh</button>
        <button type="button" class="ghost" id="g-copyall">Copy every link</button>
        <button type="button" class="ghost" id="g-print">Print cards</button>
      </div>
      <ul class="ss-people" id="g-people"></ul>
      <section class="ss-sec">
        <h2>Keep this page</h2>
        <p class="fine">This page's own link is how you get back here. It is saved in this browser's list of exchanges, and you can copy it:</p>
        <div class="linkbox"><code id="g-self"></code><button type="button" class="ghost" id="g-self-copy">Copy</button></div>
      </section>
      <section class="ss-sec" id="g-forget-sec">
        <h2>Handed out every card?</h2>
        <p class="fine">Then forget the links. This page keeps showing who has opened their card, but nobody, you included, can open a card from here any more. If someone loses their link after that, the only fix is a redraw.</p>
        <button type="button" class="ghost danger" id="g-forget">Forget the links</button>
      </section>
      <section class="ss-sec">
        <h2>Someone joined or dropped out?</h2>
        <p class="fine">Redraw tears up every card and draws again. Everyone needs their new link, and wishlists and notes start over.</p>
        <button type="button" class="ghost" id="g-redraw-open">Change the list and redraw</button>
        <form class="ss-redraw" id="g-redraw" hidden>
          <label for="g-names">People, one per line</label><textarea id="g-names" rows="8"></textarea>
          <label for="g-excl">Can't draw each other (one group per line, names separated by commas)</label><textarea id="g-excl" rows="3"></textarea>
          <label class="checkline"><input type="checkbox" id="g-loop"> One big loop</label>
          <div class="ss-row"><button type="submit" class="primary" id="g-redraw-go">Redraw</button><span class="err" id="g-redraw-err" role="alert"></span></div>
        </form>
      </section>
      <section class="ss-sec">
        <h2>End the exchange</h2>
        <p class="fine" id="g-expiry"></p>
        <button type="button" class="ghost danger" id="g-end">End it now and delete everything</button>
      </section>
    </div>
  </div>
  <div class="ss-print" id="g-printcards" aria-hidden="true"></div>
</main>
<?php } ?>

<?php ci_mine(); ci_about(); ci_feedback($data['kind'] === 'card' ? 'santa-card' : ($data['kind'] === 'group' ? 'santa-group' : 'santa')); ?>
<script type="application/json" id="ci-data"><?php echo ci_json($data); ?></script>
<?php
if ($data['kind'] === 'card') ci_scripts(array('crypto.js', 'app.js', 'mine.js', 'wall.js', 'santa-lib.js', 'santa-card.js'));
elseif ($data['kind'] === 'group') ci_scripts(array('qrcode.js', 'crypto.js', 'santa-draw.js', 'app.js', 'mine.js', 'santa-lib.js', 'santa.js'));
else ci_scripts(array('app.js', 'mine.js'));
?>
</body>
</html>
