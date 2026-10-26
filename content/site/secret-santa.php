<section class="tbox ss-tool" id="t-ss">
<form id="ss-form" autocomplete="off" novalidate>
  <div class="row">
    <div><label for="ss-title">Name of the exchange <span class="opt">(optional)</span></label><input id="ss-title" type="text" maxlength="60" placeholder="Family, 2026"></div>
    <div><label for="ss-budget">Budget <span class="opt">(optional)</span></label><input id="ss-budget" type="text" maxlength="24" placeholder="$25"></div>
    <div><label for="ss-date">Gifts on</label><input id="ss-date" type="date" required></div>
  </div>
  <label for="ss-names">Who's in, one name per line (<?php ci_fact('santa_min'); ?> to <?php ci_fact('santa_max'); ?> people)</label>
  <textarea id="ss-names" rows="8" spellcheck="false" placeholder="Ana&#10;Bob&#10;Chloe&#10;Dev&#10;Ed"></textarea>
  <label for="ss-excl">Who can't draw each other <span class="opt">(optional: one couple or household per line, names separated by commas)</span></label>
  <textarea id="ss-excl" rows="3" spellcheck="false" placeholder="Ana, Bob"></textarea>
  <div class="row ss-opts">
    <label class="checkline"><input type="checkbox" id="ss-loop"> One big loop: nobody swaps gifts with each other</label>
    <div><label for="ss-me">Are you in the draw?</label><select id="ss-me"><option value="">I'm not in the draw</option></select></div>
  </div>
  <label for="ss-note">A note to everyone <span class="opt">(optional, plain text)</span></label>
  <textarea id="ss-note" rows="2" maxlength="500" placeholder="Wrap it. Bring it on the 18th. No socks."></textarea>
  <p class="hint" id="ss-count" aria-live="polite"></p>
  <div class="btnrow"><button type="submit" class="go" id="ss-go">Draw names</button><span class="err" id="ss-err" role="alert"></span></div>
</form>
<div class="ss-mine" id="ss-mine" hidden><h3>In this browser</h3><ul id="ss-mine-list"></ul></div>
</section>
<p class="toolnote">The names are drawn and sealed in this tab. Our server gets only ciphertext and never sees a name.</p>

<p>This <strong>Secret Santa generator</strong> draws names in your browser and hands each person a sealed link. Nobody can peek at who has whom: not the organizer, and not us. There's no sign-up and no emails are collected. And if anyone opens someone else's link, the owner of that card sees it was opened before.</p>

<p>Type the names, add anyone who shouldn't draw each other, and press <em>Draw names</em>. You get a page with one link per person. Send each link however you like (a chat, a text, a QR code), or print a folded card for everyone and hand them out at the party.</p>

<h2>Why the organizer can't see the draw</h2>
<p>Every other Secret Santa site shows the organizer a screen of names. Some promise not to look. This one never puts the pairs anywhere a person could read them.</p>
<p>When you press <em>Draw names</em>, your browser picks the assignment, then seals each person's draw into its own card with <?= ci_l('learn/aes-gcm', 'AES-256-GCM') ?>. Each card gets a fresh random key, and that key goes only into the part of the card's link after the <code>#</code>. Browsers never send that part to a server (<?= ci_l('learn/url-fragments', 'here is why') ?>), so we store a card we can't open. Then the tab throws the pairing away. What you see next is a list of names and their links, never who drew whom.</p>
<p>Could you, the organizer, open everyone's link and read them all? Yes, the links are on your page until you hand them out. That's why the card keeps a count. Before a card records its own opening, it asks the server how many times it was opened before, and tells its owner: <em>"You're the first to open this card"</em>, or <em>"This card was opened 2 times before, first on Nov 30 at 8:14 PM."</em> The owner knows whether that was them. It's the same <?= ci_l('learn/read-receipts-without-tracking', 'read receipt without tracking') ?> every cipher.ink message has, and a chat app's link preview can't trip it, because a preview can't decrypt the card.</p>
<p>Once every card is handed out, press <em>Forget the links</em>. Your page keeps showing who has opened their card, but it can't open any of them, yours included.</p>

<h2>The one gap, said plainly</h2>
<p>The draw runs in the organizer's browser for about a second. An organizer who opened their browser's developer tools before pressing <em>Draw names</em> and stopped the code mid-draw could read the pairs. No screen shows them, but the code is in a tab you control.</p>
<p>A fully trustless Secret Santa exists. It's the same mathematics as <?= ci_l('learn/mental-poker', 'mental poker') ?>, dealing cards over the phone with nobody trusted to shuffle, and it needs every person online taking a turn to shuffle and encrypt. For a family exchange that means herding a dozen people into the same five minutes. We chose the version where one browser draws for a second, and told you about it here.</p>
<p>One more, for completeness. The cards, wishlists and notes are sealed, but our web host's access logs record which IP address made each request and when. Someone with those logs and our database could line up the second a note was posted with the second a card was opened from the same address, and guess who's writing to whom. We don't do that, and nothing in the code does. But "we can't see it" is true of what's stored, not of every trace a web server leaves, so we're telling you.</p>

<h2>What each person sees</h2>
<p>A card opens on the same sealed lock as every cipher.ink message. Press <em>Open my card</em> and the letters resolve into <em>"You're buying for Bob."</em>, then the budget, the date and your note. Below that:</p>
<ul>
<li><strong>Bob's wishlist</strong>, if Bob has written one. It's sealed under a key only Bob and his Santa hold.</li>
<li><strong>Ask Bob anonymously.</strong> A short thread between Bob and his Santa. Bob sees <em>"Your Santa asks: what size are you?"</em> and can answer without learning who asked.</li>
<li><strong>Your own wishlist</strong> and your own thread with your Santa, who stays a mystery.</li>
<li><strong>Unmask</strong>, from the gift day on. The Santa can post <em>"It was me, Alice"</em> into the thread. It's a choice, never automatic.</li>
</ul>
<p>Wishlists and notes are plain text, sealed in the tab before they're saved. The server stores them as ciphertext, next to the time each was written.</p>

<h2>Rules you can set</h2>
<p><strong>Who can't draw each other.</strong> Couples, housemates, siblings who always swap anyway. Put each group on its own line. It works both ways: if Ana can't draw Bob, Bob can't draw Ana. If your rules make a draw impossible, you'll hear exactly why, for example <em>"Ana is excluded from everyone but herself"</em>, never a spinner that goes forever.</p>
<p><strong>One big loop.</strong> Everyone gives along one chain: Ana gives to Chloe, Chloe to Ed, Ed to Bob, and on until the chain comes back to Ana. Nobody swaps gifts with the person giving to them, and at the party you can do the reveal in a circle.</p>
<p><strong>Are you playing?</strong> Pick your own name and you get a card like everyone else. Be honest with yourself about the one gap above, or have someone else press the button.</p>
<p>Every valid draw is equally likely. Pulling names from a hat goes wrong <?php ci_fact('santa_hat10_pct'); ?>% of the time with 10 people, because someone draws themselves. This doesn't. The draw shuffles fairly and throws away any shuffle that breaks a rule, which keeps the result uniform. <?= ci_l('learn/secret-santa-math', 'The mathematics of Secret Santa') ?> explains why the obvious fix, "just swap if you get yourself", isn't fair.</p>

<h2>Changing your mind</h2>
<p><strong>Someone joined or dropped out:</strong> on your exchange's page, edit the list and redraw. Every old card stops opening, everyone needs their new link, and wishlists start over. <strong>It's over:</strong> press <em>End it now</em> and every card, wishlist and note is deleted from the server at once. If you do nothing, the whole exchange deletes itself 30 days after the gift date, and never more than <?php ci_fact('santa_days'); ?> days after you drew it.</p>

<h2>Common questions</h2>
<div class="faq">
<details><summary>Do I need everyone's email address?</summary><p>No. We don't ask for any, and we can't send any. You give each person their link yourself, by message, by QR code or on a printed card.</p></details>
<details><summary>Someone lost their link. Can you send it again?</summary><p>We can't: we never had it. If you haven't pressed <em>Forget the links</em>, it's still on your exchange's page. If you have, the fix is a redraw, which gives everyone a new card.</p></details>
<details><summary>Can the organizer find out who has them?</summary><p>Not from the screen. The pairs are sealed in the cards and the organizer's page never holds them. An organizer who opens a card leaves a mark the owner sees, and after <em>Forget the links</em> they can't open any. The only way left is the developer-tools gap described above.</p></details>
<details><summary>Can my Santa see my wishlist before I've opened my card?</summary><p>Yes, once you've written it. Your Santa's card holds the key to your wishlist and your thread. Nobody else's card does.</p></details>
<details><summary>Does a group chat link preview count as opening my card?</summary><p>No. A preview fetches the page, but it can't decrypt the card, so it never records an open. It shows a generic "Your Secret Santa draw" card with no name on it.</p></details>
<details><summary>How many people can join?</summary><p>From <?php ci_fact('santa_min'); ?> to <?php ci_fact('santa_max'); ?>. An office of 60 draws in well under a second, even with exclusions.</p></details>
<details><summary>What does the server keep?</summary><p>Sealed cards, sealed wishlists and notes, how many people are in the exchange, when each thing was written and when it all expires. No names, no pairs, no wishes. The full list is on <?= ci_l('security', 'the security page') ?>.</p></details>
<details><summary>Is it free?</summary><p>Yes. No account, no ads, no tracking, and no limit on how many exchanges you run, apart from a few per hour to keep bots out.</p></details>
</div>
