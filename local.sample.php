<?php
// Copy this file to local.php and fill it in. lib.php includes it before anything else.
// The site runs on PHP 8 with mysqli (see README.md). The database login lives in a file outside the web root that returns an array:
//   <?php return array('host' => 'localhost', 'user' => 'cipher', 'pass' => 'change-me', 'name' => 'cipher');
// Make it mode 600 and point CI_DB_FILE at it.
define('CI_DB_FILE', '/path/outside/the/site/cipher-ink-db.php');

define('CI_CONTACT_TO', 'you@example.com');          // the contact form's only recipient; never chosen by a request
define('CI_MAILGUN_DOMAIN', 'mg.example.com');        // the contact form sends through Mailgun
define('CI_MAILGUN_KEY_FILE', '/path/outside/the/site/api.secret');   // no file: the form answers "Could not send it"

// Optional: a feedback widget from a service you run (a script at <host>/w.js?site=cipher). Empty or unset means no widget and no
// extra host in the Content-Security-Policy. cipher.ink's own install points this at its own service.
// define('CI_FB_HOST', 'https://feedback.example.com');
