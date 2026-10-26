<?php
// Read receipt: /s/<id>#<token>. The token stays in the fragment; mine.js sends it to api.php status.
include "lib.php";
ci_headers();
include "partials.php";
$id = isset($_GET['id']) ? (string)$_GET['id'] : '';
ci_head('Read receipt · cipher.ink', 'status');
?>
<body class="statuspage">
<?php ci_topbar(false); ?>
<main class="desk">
  <div class="card receipt" id="receipt">
    <div class="poplabel">Read receipt</div>
    <h1 id="r-title">Checking…</h1>
    <ul class="r-lines" id="r-lines"></ul>
    <div class="actions" id="r-act"></div>
    <p class="fine">Only someone holding this exact link can see this. The message itself is not here.</p>
  </div>
</main>
<?php ci_mine(); ci_about(); ci_feedback('receipt'); ?>
<script type="application/json" id="ci-data"><?php echo ci_json(array('base' => $CI_BASE, 'page' => 'status', 'id' => $id)); ?></script>
<?php ci_scripts(array('crypto.js', 'app.js', 'mine.js')); ?>
</body>
</html>
