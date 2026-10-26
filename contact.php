<?php
// Contact form: /contact. assets/contact.js posts it to api.php's contact action, which emails it to the
// site's owner through Mailgun. Unlike a sealed message, what is typed here is NOT encrypted.
include "lib.php";
ci_headers(true, array('index' => true));
include "partials.php";
ci_head('Contact · cipher.ink', 'contact');
?>
<body class="statuspage contactpage">
<?php ci_topbar(false); ?>
<main class="desk">
  <form class="card receipt contact" id="contact" autocomplete="off" novalidate>
    <div class="poplabel">Contact</div>
    <h1>Write to us</h1>
    <p class="fine">A question, a bug, or a message that should not be here. To report a message, paste its link; the
      part from <b>/m/</b> to the <b>#</b> is enough for us to remove it. Anything after the <b>#</b> is its key, so leave that
      off unless you want us to be able to read it.</p>
    <p class="fine"><b>This form is not encrypted.</b> It arrives as an ordinary email.</p>
    <label class="field"><span>Your email <small>(optional, if you want a reply)</small></span>
      <input id="c-from" type="email" maxlength="200" autocomplete="email" spellcheck="false"></label>
    <label class="field"><span>Message</span>
      <textarea id="c-body" rows="7" maxlength="5000" required></textarea></label>
    <label class="field trap" aria-hidden="true"><span>Leave this empty</span>
      <input id="c-site" type="text" tabindex="-1" autocomplete="off"></label>
    <button type="submit" class="seal" id="c-send"><span class="lbl">Send</span></button>
    <p class="err" id="c-err" role="alert"></p>
  </form>
</main>
<?php ci_mine(); ci_about(); ci_feedback('contact'); ?>
<script type="application/json" id="ci-data"><?php echo ci_json(array('base' => $CI_BASE, 'page' => 'contact')); ?></script>
<?php ci_scripts(array('app.js', 'mine.js', 'contact.js')); ?>
</body>
</html>
