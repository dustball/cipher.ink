<?php
// Page chrome shared by index.php and show.php.

function ci_topbar($compose, $slot = '') {
  global $CI_BASE;
  $b = ci_h($CI_BASE);
  ?>
<header class="top" id="top">
  <a class="mark" href="<?php echo $b; ?>" aria-label="cipher.ink home"><img class="drop" src="<?php echo $b; ?>assets/logo.svg" alt="" width="26" height="26"><span>cipher<em>.</em>ink</span></a>
  <?php echo $slot; ?>
  <nav>
    <button type="button" class="ghost mine-btn" id="mine-btn" title="Messages you sealed in this browser" aria-controls="mine">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v7h4a3 3 0 0 0 6 0h4V6zm0 9v3h14v-3h-2.4a5 5 0 0 1-9.2 0z"/></svg><span>My messages</span></button>
    <button type="button" class="ghost icon" id="fs-btn" title="Full screen" aria-label="Full screen">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z"/></svg></button>
    <button type="button" class="ghost icon" id="theme-btn" title="Ink / paper" aria-label="Switch light or dark">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2v14a7 7 0 0 1 0-14z"/></svg></button>
    <button type="button" class="ghost icon" id="about-btn" title="How it works" aria-label="How it works">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 14a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zm.1-10C10 6 8.5 7.3 8.4 9.3h2.2c.1-.9.7-1.4 1.5-1.4.9 0 1.5.5 1.5 1.3 0 .7-.3 1-1.3 1.7-1.1.7-1.6 1.5-1.5 2.8v.6h2.1v-.5c0-.8.3-1.1 1.3-1.8 1.1-.7 1.7-1.6 1.7-2.9C15.9 7.2 14.4 6 12.1 6z"/></svg></button>
  </nav>
</header>
<?php
}

function ci_about() {
  global $CI_BASE;
  $b = ci_h($CI_BASE);
  ?>
<dialog id="about" class="about">
  <div class="aboutin">
    <button type="button" class="ghost icon close" data-close aria-label="Close">✕</button>
    <h2>How cipher.ink works</h2>
    <ol class="steps">
      <li><b>You write.</b> The words stay in this tab. Nothing is sent while you type.</li>
      <li><b>Your browser seals it.</b> AES-256-GCM, through the browser's own Web Crypto. With a passphrase, the key comes from PBKDF2-SHA256 at 600,000 rounds with a fresh random salt. With a secret link, the key is 256 random bits.</li>
      <li><b>The server holds ciphertext.</b> It never receives your words, file names, passphrase or link key. A secret link's key lives after the <code>#</code>, and browsers never send that part to a server.</li>
      <li><b>They unseal it.</b> Their browser does the decryption. A burn-after-reading message is deleted from the server as it is handed over; its attachments can be fetched once, within 15 minutes, and no more.</li>
    </ol>
    <h3>Privacy</h3>
    <p class="fine">No accounts, no cookies, no trackers, no analytics, no ads, and nothing loaded from a third party. The feedback tab is the one script that comes from another address, <b>feedback.cipher.ink</b>, a feedback server I also run.
      The server does see when a message was sealed and opened, how big it is, and the passphrase hint if you write one (hints are not encrypted).
      Your IP address is kept only as a salted hash, for two days, to limit how many messages one connection can seal in an hour; the web host's own access logs also record it.
      When a message ends, its contents go at once and its timestamps after 90 days.</p>
    <p class="fine">The feedback box is the one place that isn’t sealed: what you type there is plain text the server can read. We keep the words you type, your mood pick, the kind of page you were on (not its address), your screen size and theme, your browser, a one-way hash of your address, your country and the time. It is kept on feedback.cipher.ink, my own feedback server, not a third party’s, with no account and no email involved, until it is deleted by hand.</p>
    <p class="fine">Messages sealed on the old cipher.ink still open with their original passphrase.</p>
<?php if (function_exists('ci_meta') && ci_meta('how-it-works')) { ?>
    <p class="fine"><a href="<?php echo $b; ?>how-it-works">Read the full design →</a></p>
<?php } ?>
<?php if (function_exists('ci_meta') && ci_meta('secret-santa')) { ?>
    <p class="fine"><a href="<?php echo $b; ?>secret-santa">Running a Secret Santa? Draw it sealed →</a></p>
<?php } ?>
    <p class="fine"><a href="<?php echo $b; ?>contact">Contact, or report a message</a> · <button type="button" class="linklike" data-fb-open hidden>Send feedback</button></p>
  </div>
</dialog>
<?php
}

// The "My messages" drawer (assets/mine.js fills it).
function ci_mine() {
  ?>
<div class="scrim" id="mine-scrim" hidden></div>
<aside class="drawer" id="mine" aria-label="My messages" hidden>
  <div class="drawerhead">
    <h2>My messages</h2>
    <button type="button" class="ghost icon" id="mine-close" aria-label="Close">✕</button>
  </div>
  <p class="fine drawerfine">Messages sealed in this browser. The list is kept only here, never on the server. On a shared computer, clear it.</p>
  <div class="minelist" id="mine-list"></div>
  <div class="drawerfoot"><button type="button" class="ghost danger" id="mine-clear">Clear this list</button></div>
</aside>
<?php
}
