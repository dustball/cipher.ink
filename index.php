<?php
include "lib.php";
ci_headers(true, array('index' => true));
include "content/partials.php";
ci_head('cipher.ink · Encrypted, self-destructing messages', 'compose',
  'Send a message only your recipient can read. cipher.ink seals it in your browser with AES-256-GCM, so the server only ever holds ciphertext.');
include "partials.php";
?>
<body class="compose">
<?php ob_start(); ?>
  <div class="dock" id="dock">
  <div class="seg" role="radiogroup" aria-label="How to lock it">
    <button type="button" role="radio" data-mode="p" aria-checked="true" title="They need a passphrase you tell them separately">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V8a3 3 0 0 0-6 0z"/></svg>
      <span>Passphrase</span></button>
    <button type="button" role="radio" data-mode="k" aria-checked="false" title="The key rides inside the link, after the #">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 3a6.5 6.5 0 0 1 0 13c-.8 0-1.6-.1-2.3-.4L11 17h-2v2H7v2H3v-4l6.4-6.4A6.5 6.5 0 0 1 14.5 3zm1.5 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/></svg>
      <span>Secret link</span></button>
  </div>

  <div class="passwrap" id="passwrap">
    <input id="pass" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="passphrase" aria-label="Passphrase" maxlength="200" aria-describedby="pw-word">
    <span class="pw-word" id="pw-word" aria-live="polite"></span>
    <button type="button" class="ghost icon" id="dice" title="Make one up for me" aria-label="Generate a passphrase">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2.5 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-4.5 4.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/></svg></button>
    <div class="meter" id="meter" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
  </div>
  <div class="linknote" id="linknote" hidden>The key rides in the link, after the <b>#</b>.</div>

  <div class="optwrap">
    <button type="button" class="chip" id="opt-btn" aria-expanded="false" aria-controls="opts"><span id="opt-sum">1 week</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5z"/></svg></button>
    <div class="pop" id="opts" hidden>
      <div class="poprow">
        <div class="poplabel">Destroy after</div>
        <div class="chips" id="ttl">
          <button type="button" data-ttl="600">10 min</button>
          <button type="button" data-ttl="3600">1 hour</button>
          <button type="button" data-ttl="86400">1 day</button>
          <button type="button" data-ttl="604800" class="on">1 week</button>
          <button type="button" data-ttl="2592000">30 days</button>
          <button type="button" data-ttl="0">Never</button>
        </div>
      </div>
      <label class="switch poprow"><input type="checkbox" id="burn"><span class="track"><i></i></span>
        <span><b>Burn after reading</b><small>Deleted from the server the moment it is opened.</small></span></label>
      <div class="poprow" id="hintrow">
        <div class="poplabel">Passphrase hint <small>(optional)</small></div>
        <input id="hint" type="text" placeholder="the dog's name + the year we met" maxlength="120" autocomplete="off">
        <small class="fine">Shown on the lock screen to anyone with the link. It is not encrypted.</small>
      </div>
    </div>
  </div>

  <button type="button" class="seal" id="seal-btn">
    <span class="lbl">Seal it</span><kbd>⌘↵</kbd>
  </button>
  </div>
<?php ci_topbar(true, ob_get_clean()); ?>

<div class="toolrow" id="toolrow">
  <div class="toolbar" id="toolbar" role="toolbar" aria-label="Formatting"></div>
  <button type="button" class="ghost attach" id="attach-btn" title="Attach files (up to 5 MB, encrypted)">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 6v11.5a4 4 0 0 1-8 0V5a2.5 2.5 0 0 1 5 0v10.5a1 1 0 0 1-2 0V6H10v9.5a2.5 2.5 0 0 0 5 0V5a4 4 0 0 0-8 0v12.5a5.5 5.5 0 0 0 11 0V6z"/></svg><span>Attach</span></button>
  <input type="file" id="file-in" multiple hidden>
  <div class="count" id="count" aria-live="polite"></div>
</div>

<main class="desk" id="desk">
  <h1 class="sr-only">Write an encrypted message</h1>
  <div class="page" id="sheet">
    <div id="editor" class="prose editor empty" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true"
      aria-label="Your message" data-placeholder="Write something only they should read."><p><br></p></div>
    <div class="atts" id="atts" hidden></div>
    <div class="dropzone" id="dropzone" aria-hidden="true"><span>Drop to attach. Files are encrypted before they leave this tab.</span></div>
  </div>
</main>

<div class="bubble" id="bubble" role="toolbar" aria-label="Add a link" hidden></div>

<?php ci_compose_lines(); ?>


<section class="sealed" id="sealed" hidden aria-live="polite">
  <div class="sealcard">
    <div class="wax" aria-hidden="true"><svg viewBox="0 0 120 120"><defs><radialGradient id="wx" cx=".35" cy=".3" r=".9"><stop offset="0" class="s1"/><stop offset="1" class="s2"/></radialGradient></defs><path fill="url(#wx)" d="M60 6c6 0 9 5 14 6s11-2 15 2 2 10 5 14 9 6 10 12-4 9-4 14 4 9 2 14-8 6-11 10-2 10-7 13-10 0-15 1-9 5-14 5-9-4-14-5-11 2-15-1-4-9-7-13-9-5-11-10 2-9 2-14-5-8-4-14 7-8 10-12 1-10 5-14 10-1 15-2 8-6 14-6z"/><circle cx="60" cy="60" r="31" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="2"/><path d="M60 41c5 6 10 12 10 18a10 10 0 0 1-20 0c0-6 5-12 10-18z" fill="rgba(255,255,255,.85)"/></svg></div>
    <h2>Sealed.</h2>
    <p class="lede" id="sealed-lede"></p>
    <div class="linkbox">
      <code id="sealed-url"></code>
      <button type="button" class="primary" id="copy-url">Copy link</button>
    </div>
    <div class="passbox" id="passbox">
      <span>Passphrase</span><code id="sealed-pass" class="masked"></code>
      <button type="button" class="ghost" id="show-pass">show</button>
      <button type="button" class="ghost" id="copy-pass">copy</button>
    </div>
    <div class="qrbox" id="qrbox" hidden><div id="qr"></div><p class="fine">Scan to open the link on a phone.</p></div>
    <div class="trackbox">
      <span>Read receipt</span>
      <code id="status-url"></code>
      <button type="button" class="ghost" id="copy-status">copy</button>
    </div>
    <p class="fine trackfine">Keep this private link to see when it is opened, or to destroy it. It is also saved under <b>My messages</b> in this browser.</p>
    <ul class="facts" id="facts"></ul>
    <div class="actions">
      <button type="button" class="ghost" id="qr-btn">QR code</button>
      <button type="button" class="ghost" id="share-btn" hidden>Share…</button>
      <a class="ghost btn" id="open-btn" target="_blank" rel="noopener noreferrer">Preview it ↗</a>
      <button type="button" class="ghost" id="again-btn">Write another</button>
    </div>
  </div>
</section>

<?php ci_about(); ci_feedback('compose'); ?>
<script type="application/json" id="ci-data"><?php echo ci_json(array('base' => $CI_BASE)); ?></script>
<?php ci_mine(); ci_scripts(array('purify.min.js', 'qrcode.js', 'crypto.js', 'app.js', 'editor.js', 'mine.js', 'compose.js')); ?>
</body>
</html>
