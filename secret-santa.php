<?php
// Public build only: the Secret Santa form as a page of its own. On cipher.ink the same body,
// content/site/secret-santa.php, is rendered by the article system with the site's header and reading around it.
include "lib.php";
ci_headers();
include "content/partials.php";
ci_head('A Secret Santa nobody can peek at', 'santa-form', 'A Secret Santa drawn in your browser: each person gets a sealed link, and nobody can peek.');
include "partials.php";
?>
<body class="content kind-tool sec-site">
<link rel="stylesheet" href="<?php echo ci_h($CI_BASE); ?>assets/content.css?v=<?php echo CI_VERSION; ?>">
<?php ci_topbar(false); ?>
<main class="desk" id="main">
<article class="cpage">
  <header class="ahead"><h1>A Secret Santa nobody can peek at</h1></header>
  <div class="cbody">
<?php include "content/site/secret-santa.php"; ?>
  </div>
</article>
</main>
<?php ci_mine(); ci_about(); ci_site_footer(); ?>
<script type="application/json" id="ci-data"><?php echo ci_json(array('base' => $CI_BASE, 'page' => 'content', 'key' => 'secret-santa')); ?></script>
<?php ci_scripts(array('app.js', 'mine.js', 'crypto.js', 'santa-draw.js', 'santa-lib.js', 'santa.js')); ?>
</body>
</html>
