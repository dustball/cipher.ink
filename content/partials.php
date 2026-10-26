<?php
// Public build only. On cipher.ink, content/partials.php is the article system (registry, glossary, tools, about
// 170 pages), which is not in this repository. These are the few functions the app pages call from it; links go
// to the articles on cipher.ink.

function ci_l($key, $text = null, $cls = '') {
  if ($text === null) $text = ci_h(ucfirst(str_replace('-', ' ', substr(strrchr('/' . $key, '/'), 1))));
  return '<a href="https://cipher.ink/' . ci_h($key) . '"' . ($cls ? ' class="' . ci_h($cls) . '"' : '') . '>' . $text . '</a>';
}

// The figures the Secret Santa form quotes. On cipher.ink they come from content/facts.php.
function ci_fact($key, $echo = true) {
  $f = array('santa_min' => CI_SANTA_MIN, 'santa_max' => CI_SANTA_MAX, 'santa_days' => CI_SANTA_DAYS,
    'santa_hat10_pct' => round(100 - 100 * 1334961 / 3628800));   // 10 people: D(10) / 10! valid draws
  $v = isset($f[$key]) ? $f[$key] : '?';
  if ($echo) echo $v;
  return $v;
}

function ci_site_footer() {
  global $CI_BASE;
  $b = ci_h($CI_BASE);
  ?>
<footer class="sitefoot">
  <p class="footlead"><b>cipher<em>.</em>ink</b> encrypts in your browser. The server only ever holds ciphertext.</p>
  <nav class="footnav footmore" aria-label="About this site"><a href="<?php echo $b; ?>secret-santa">Secret Santa</a><a href="https://cipher.ink/how-it-works">How it works</a><a href="https://cipher.ink/security">Security</a><a href="<?php echo $b; ?>contact">Contact</a><a class="footgh" href="https://github.com/dustball/cipher.ink"><svg class="gh" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>Source on GitHub</a></nav>
</footer>
<?php
}

// The three lines and slim footer under the compose page.
function ci_compose_lines() {
  ?>
<section class="below" aria-label="About cipher.ink">
  <ul class="threelines">
    <li><b>AES-256-GCM in your browser.</b> <?php echo ci_l('learn/aes-gcm', 'How the lock works'); ?>, and why a wrong passphrase is detected rather than guessed.</li>
    <li><b>The key never reaches us.</b> <?php echo ci_l('learn/url-fragments', 'The part after the # is not sent to a server'); ?>, which is where a secret link keeps its key.</li>
    <li><b>Burn after reading.</b> <?php echo ci_l('learn/burn-after-reading', 'How a message deletes itself'); ?>, and what no website can promise.</li>
  </ul>
</section>
<?php
  ci_site_footer();
}
