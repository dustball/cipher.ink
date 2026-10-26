/* cipher.ink editor: a small writing surface that replaced CKEditor in 2026.
 *
 * contenteditable plus execCommand (deprecated on paper, still the only thing every browser
 * implements with undo), and markdown habits on top:
 *   "# " "## " "### "  heading      "> "  quote       "- " "* " "1. "  list
 *   "``` " code block              "---" + Enter  rule
 *   **bold**  *italic*  _italic_  `code`  ~~strike~~   (converted as you type the closing mark)
 *   ⌘B ⌘I ⌘U ⌘K(link) ⌘⇧X(strike) ⌘⇧7/8(lists)   Backspace at the start of a block turns it back into text.
 * The toolbar above the page is always shown; the small bubble only appears to take a link (⌘K).
 *
 * What it never does: send anything. The editor only edits; sealing and sending are in compose.js.
 * Annotated at https://cipher.ink/code
 */
(function (root) {
  'use strict';
  var BLOCKS = /^(P|DIV|H1|H2|H3|BLOCKQUOTE|PRE|LI)$/;
  var ZW = '\u200B';

  var ICON = {
    quote: '<svg viewBox="0 0 24 24"><path d="M7 7h4v4c0 3-2 5-4 6l-.6-1.2C8 15 9 13.6 9 12H7zm8 0h4v4c0 3-2 5-4 6l-.6-1.2C16 15 17 13.6 17 12h-2z"/></svg>',
    ul: '<svg viewBox="0 0 24 24"><circle cx="5" cy="7" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="5" cy="17" r="1.6"/><path d="M9 6h11v2H9zm0 5h11v2H9zm0 5h11v2H9z"/></svg>',
    ol: '<svg viewBox="0 0 24 24"><path d="M4 5h2v4H5V6H4zm-.2 7.2c.3-.8 1-1.2 1.7-1.2.9 0 1.5.6 1.5 1.3 0 .6-.4 1-.9 1.4l-.7.5H7V15H3.8v-.8l1.5-1.2c.4-.3.6-.5.6-.8 0-.2-.2-.4-.4-.4-.3 0-.4.2-.5.5zM9 6h11v2H9zm0 5h11v2H9zm0 5h11v2H9zM4 17.2h1.4c.6 0 1.4.3 1.4 1.1 0 .5-.3.8-.7 1 .5.1.9.5.9 1.1 0 .9-.8 1.4-1.7 1.4-.8 0-1.4-.4-1.6-1.1l.8-.3c.1.3.4.6.8.6.3 0 .6-.2.6-.5s-.3-.5-.7-.5h-.4v-.8h.4c.4 0 .6-.2.6-.4s-.2-.4-.5-.4c-.3 0-.5.2-.6.5l-.8-.3"/></svg>',
    code: '<svg viewBox="0 0 24 24"><path d="M8.6 16.6 4 12l4.6-4.6L10 8.8 6.8 12l3.2 3.2zm6.8 0L14 15.2l3.2-3.2L14 8.8l1.4-1.4L20 12z"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10.6 13.4a1 1 0 0 1 0-1.4l3.5-3.5a1 1 0 1 1 1.4 1.4L12 13.4a1 1 0 0 1-1.4 0zM8 20a5 5 0 0 1-3.5-8.5l2.1-2.1A1 1 0 1 1 8 10.8L5.9 13A3 3 0 0 0 11 17.1l2.1-2.1a1 1 0 1 1 1.4 1.4l-2.1 2.1A5 5 0 0 1 8 20zm9.4-5.4a1 1 0 0 1-.7-1.7l2.1-2.1A3 3 0 0 0 13 6.9l-2.1 2.1a1 1 0 1 1-1.4-1.4l2.1-2.1a5 5 0 0 1 7.1 7.1l-2.1 2.1a1 1 0 0 1-.7.3z"/></svg>',
    hr: '<svg viewBox="0 0 24 24"><path d="M3 11h18v2H3z"/></svg>',
    clear: '<svg viewBox="0 0 24 24"><path d="M6 5h12v3h-2V7h-3.2l-1.6 5.4-1.8-1.8L10.7 7H8v1H6zm-2.3-.3 1.4-1.4 15.6 15.6-1.4 1.4-5.1-5.1L13 19h-2.1l1.5-5z"/></svg>'
  };
  var TOOLS = [
    { k: 'bold', label: '<b>B</b>', title: 'Bold  ⌘B' },
    { k: 'italic', label: '<i>I</i>', title: 'Italic  ⌘I' },
    { k: 'strike', label: '<s>S</s>', title: 'Strike  ⌘⇧X' },
    { sep: 1 },
    { k: 'h1', label: 'H1', title: 'Big heading  # ', aria: 'H1, big heading' },
    { k: 'h2', label: 'H2', title: 'Heading  ## ', aria: 'H2, heading' },
    { k: 'quote', label: ICON.quote, title: 'Quote  > ' },
    { k: 'ul', label: ICON.ul, title: 'List  - ' },
    { k: 'ol', label: ICON.ol, title: 'Numbered list  1. ' },
    { k: 'code', label: ICON.code, title: 'Code  `x` or ``` ' },
    { sep: 1 },
    { k: 'link', label: ICON.link, title: 'Link  ⌘K' },
    { k: 'hr', label: ICON.hr, title: 'Divider  ---', bar: 1 },
    { k: 'clear', label: ICON.clear, title: 'Plain text' }
  ];

  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function exec(c, v) { return document.execCommand(c, false, v === undefined ? null : v); }

  function Editor(el, opt) {
    this.el = el;
    this.opt = opt || {};
    this.sanitize = this.opt.sanitize || function (h) { return h; };
    var self = this;
    try { exec('defaultParagraphSeparator', 'p'); exec('styleWithCSS', false); } catch (e) {}

    el.addEventListener('keydown', function (e) { self.onKey(e); });
    el.addEventListener('input', function (e) { self.onInput(e); });
    el.addEventListener('paste', function (e) { self.onPaste(e); });
    el.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) e.preventDefault(); });
    el.addEventListener('focus', function () { self.ensureBlock(); });
    document.addEventListener('selectionchange', function () { self.onSelection(); });

    this.bar = this.opt.bar ? this.buildTools(this.opt.bar, true) : null;
    this.bubble = this.opt.bubble ? this.buildTools(this.opt.bubble, false) : null;
    if (this.bubble) {
      this.linkForm = document.createElement('form');
      this.linkForm.className = 'linkform';
      this.linkForm.innerHTML = '<input type="url" placeholder="Paste a link, Enter to apply" spellcheck="false"><button type="button" class="unlink" title="Remove link">✕</button>';
      this.opt.bubble.appendChild(this.linkForm);
      this.linkForm.addEventListener('submit', function (e) { e.preventDefault(); self.applyLink(self.linkForm.firstChild.value); });
      this.linkForm.querySelector('.unlink').addEventListener('mousedown', function (e) { e.preventDefault(); self.restore(); exec('unlink'); self.hideBubble(); });
      this.linkForm.firstChild.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); self.restore(); self.hideBubble(); }
        if (e.key === 'Enter') { e.preventDefault(); self.applyLink(self.linkForm.firstChild.value); }
      });
    }
    this.refresh();
  }

  Editor.prototype.buildTools = function (host, isBar) {
    var self = this;
    TOOLS.forEach(function (t) {
      if (t.sep) { var s = document.createElement('span'); s.className = 'sep'; host.appendChild(s); return; }
      if (t.bar && !isBar) return;
      var b = document.createElement('button');
      var title = root.App && App.keys ? App.keys(t.title) : t.title;
      b.type = 'button'; b.className = 'tool'; b.dataset.k = t.k; b.title = title;
      b.setAttribute('aria-label', t.aria || title); b.innerHTML = t.label;
      // mousedown, not click: keeps the selection in the page instead of moving focus to the button
      b.addEventListener('mousedown', function (e) { e.preventDefault(); self.command(t.k); });
      host.appendChild(b);
    });
    return host;
  };

  /* --- selection helpers --- */
  Editor.prototype.sel = function () {
    var s = window.getSelection();
    if (!s.rangeCount) return null;
    var r = s.getRangeAt(0);
    return this.el.contains(r.commonAncestorContainer) ? { s: s, r: r } : null;
  };
  Editor.prototype.save = function () { var x = this.sel(); this.saved = x ? x.r.cloneRange() : null; };
  Editor.prototype.restore = function () {
    if (!this.saved) return;
    this.el.focus();
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(this.saved);
  };
  Editor.prototype.block = function (node) {
    while (node && node !== this.el) {
      if (node.nodeType === 1 && BLOCKS.test(node.nodeName)) return node;
      node = node.parentNode;
    }
    return null;
  };
  Editor.prototype.topBlock = function (node) {
    while (node && node.parentNode !== this.el) node = node.parentNode;
    return node && node !== this.el ? node : null;
  };
  Editor.prototype.textBefore = function (blk, x) {
    var r = document.createRange();
    r.setStart(blk, 0); r.setEnd(x.r.startContainer, x.r.startOffset);
    return { text: r.toString(), range: r };
  };
  Editor.prototype.atEnd = function (blk, x) {
    var r = document.createRange();
    r.setStart(x.r.endContainer, x.r.endOffset); r.setEnd(blk, blk.childNodes.length);
    return r.toString().replace(/\n$/, '') === '';
  };
  Editor.prototype.within = function (name) {
    var x = this.sel(); if (!x) return null;
    var n = x.r.startContainer;
    while (n && n !== this.el) { if (n.nodeName === name) return n; n = n.parentNode; }
    return null;
  };
  Editor.prototype.caret = function (node, off) {
    var r = document.createRange(), s = window.getSelection();
    r.setStart(node, off); r.collapse(true); s.removeAllRanges(); s.addRange(r);
  };

  Editor.prototype.ensureBlock = function () {
    if (!this.el.firstChild || (this.el.childNodes.length === 1 && this.el.firstChild.nodeName === 'BR')) {
      this.el.innerHTML = '<p><br></p>';
      this.caret(this.el.firstChild, 0);
    }
  };

  /* --- commands --- */
  Editor.prototype.toggleBlock = function (tag) {
    var x = this.sel(); if (!x) { this.el.focus(); x = this.sel(); }
    var b = x && this.block(x.r.startContainer);
    var inList = b && b.nodeName === 'LI';
    if (inList) exec(b.parentNode.nodeName === 'OL' ? 'insertOrderedList' : 'insertUnorderedList');
    var cur = this.within(tag.toUpperCase());
    exec('formatBlock', '<' + (cur ? 'p' : tag) + '>');
  };
  Editor.prototype.command = function (k) {
    if (k !== 'link') this.el.focus();
    switch (k) {
      case 'bold': exec('bold'); break;
      case 'italic': exec('italic'); break;
      case 'strike': exec('strikeThrough'); break;
      case 'h1': case 'h2': this.toggleBlock(k); break;
      case 'quote': this.toggleBlock('blockquote'); break;
      case 'ul': exec('insertUnorderedList'); this.fixLists(); break;
      case 'ol': exec('insertOrderedList'); this.fixLists(); break;
      case 'hr': exec('insertHorizontalRule'); break;
      case 'clear':
        exec('removeFormat'); exec('unlink');
        if (this.within('UL')) exec('insertUnorderedList');
        if (this.within('OL')) exec('insertOrderedList');
        exec('formatBlock', '<p>'); break;
      case 'code':
        var x = this.sel(), t = x ? x.r.toString() : '';
        if (!t || /\n/.test(t) || this.within('PRE')) this.toggleBlock('pre');
        else if (this.within('CODE')) exec('insertText', t);
        else exec('insertHTML', '<code>' + esc(t) + '</code>' + ZW);
        break;
      case 'link': this.openLink(); return;
    }
    this.refresh();
  };
  Editor.prototype.openLink = function () {
    var x = this.sel();
    if (!x || !this.bubble) return;
    if (x.r.collapsed) {
      var a = this.within('A');
      if (!a) { this.opt.onHint && this.opt.onHint('Select some words first, then add a link.'); return; }
      var r = document.createRange(); r.selectNodeContents(a);
      x.s.removeAllRanges(); x.s.addRange(r);
    }
    this.save();
    var cur = this.within('A');
    this.showBubble(true);
    this.opt.bubble.classList.add('linking');
    var inp = this.linkForm.firstChild;
    inp.value = cur ? cur.getAttribute('href') : '';
    setTimeout(function () { inp.focus(); inp.select(); }, 0);
  };
  Editor.prototype.applyLink = function (url) {
    url = (url || '').trim();
    this.restore();
    if (url) {
      if (!/^(https?:|mailto:)/i.test(url)) url = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url) ? 'mailto:' + url : 'https://' + url;
      exec('createLink', url);
    } else exec('unlink');
    this.hideBubble();
    var s = window.getSelection(); if (s.rangeCount) s.collapseToEnd();
  };

  /* --- keys --- */
  Editor.prototype.onKey = function (e) {
    var mod = e.metaKey || e.ctrlKey, k = e.key;
    if (mod && !e.altKey) {
      var lk = k.toLowerCase();
      if (lk === 'k') { e.preventDefault(); this.openLink(); return; }
      if (e.shiftKey && lk === 'x') { e.preventDefault(); this.command('strike'); return; }
      if (e.shiftKey && (k === '7' || k === '&')) { e.preventDefault(); this.command('ol'); return; }
      if (e.shiftKey && (k === '8' || k === '*')) { e.preventDefault(); this.command('ul'); return; }
      if (lk === 'b' || lk === 'i' || lk === 'u') { setTimeout(this.refresh.bind(this), 0); return; }
      return;
    }
    var x = this.sel(); if (!x) return;
    var blk = this.block(x.r.startContainer);
    if (!blk) return;

    if (k === ' ' && x.r.collapsed && (blk.nodeName === 'P' || blk.nodeName === 'DIV')) {
      var tb = this.textBefore(blk, x), m = tb.text;
      var map = { '#': 'h1', '##': 'h2', '###': 'h3', '>': 'blockquote', '```': 'pre' };
      var act = map[m] ? ['block', map[m]] : /^[-*+]$/.test(m) ? ['ul'] : /^1[.)]$/.test(m) ? ['ol'] : null;
      if (act) {
        e.preventDefault();
        x.s.removeAllRanges(); x.s.addRange(tb.range); exec('delete');
        if (act[0] === 'block') exec('formatBlock', '<' + act[1] + '>');
        else { exec(act[0] === 'ul' ? 'insertUnorderedList' : 'insertOrderedList'); this.fixLists(); }
        this.refresh();
      }
      return;
    }
    if (k === 'Enter' && !e.shiftKey) {
      var before = this.textBefore(blk, x);
      if ((blk.nodeName === 'P' || blk.nodeName === 'DIV') && /^(---|\*\*\*|___)$/.test(before.text) && this.atEnd(blk, x)) {
        e.preventDefault();
        x.s.removeAllRanges(); x.s.addRange(before.range); exec('delete');
        exec('insertHorizontalRule');
        return;
      }
      if ((blk.nodeName === 'P' || blk.nodeName === 'DIV') && before.text === '```' && this.atEnd(blk, x)) {
        e.preventDefault();
        x.s.removeAllRanges(); x.s.addRange(before.range); exec('delete');
        exec('formatBlock', '<pre>');
        return;
      }
      // Enter on an empty last line of a code block or quote steps out of it.
      var outer = this.within('PRE') || this.within('BLOCKQUOTE');
      if (outer && this.atEnd(outer, x)) {
        var all = this.textBefore(outer, x).text;
        var emptyLine = all === '' || /\n$/.test(all) || (x.r.startContainer.childNodes[x.r.startOffset - 1] || {}).nodeName === 'BR';
        var lastP = this.block(x.r.startContainer);
        if (lastP && lastP !== outer && lastP.textContent === '') emptyLine = true;
        if (emptyLine) {
          e.preventDefault();
          if (lastP && lastP !== outer && lastP.textContent === '') lastP.remove();
          else {
            var last = outer.lastChild;
            while (last && (last.nodeName === 'BR' || (last.nodeType === 3 && /^\n*$/.test(last.data)))) { var p = last.previousSibling; last.remove(); last = p; }
            if (last && last.nodeType === 3) last.data = last.data.replace(/\n+$/, '');
          }
          var np = document.createElement('p'); np.innerHTML = '<br>';
          outer.parentNode.insertBefore(np, outer.nextSibling);
          if (!outer.textContent) outer.remove();
          this.caret(np, 0);
          this.onInput();
          return;
        }
      }
      if (blk.nodeName === 'PRE') { e.preventDefault(); exec('insertLineBreak') || exec('insertHTML', '<br>'); return; }
    }
    if (k === 'Backspace' && x.r.collapsed && /^(H1|H2|H3|BLOCKQUOTE|PRE)$/.test(blk.nodeName) && this.textBefore(blk, x).text === '') {
      e.preventDefault();
      exec('formatBlock', '<p>');
      this.refresh();
    }
  };

  /* Inline markdown, converted when the closing mark is typed. */
  var INLINE = [   // [typed char, pattern ending at the caret, tag, mark length]
    ['*', /\*\*([^*\n]*[^*\s])\*\*$/, 'b', 2],
    ['~', /~~([^~\n]*[^~\s])~~$/, 's', 2],
    ['`', /`([^`\n]+)`$/, 'code', 1],
    ['*', /(?:^|[^*\w])\*([^*\s](?:[^*\n]*[^*\s])?)\*$/, 'i', 1],
    ['_', /(?:^|[^_\w])_([^_\s](?:[^_\n]*[^_\s])?)_$/, 'i', 1]
  ];
  Editor.prototype.inlineMarkdown = function (ch) {
    var x = this.sel();
    if (!x || !x.r.collapsed || x.r.startContainer.nodeType !== 3 || this.within('PRE') || this.within('CODE')) return;
    var tn = x.r.startContainer, off = x.r.startOffset, head = tn.data.slice(0, off);
    for (var i = 0; i < INLINE.length; i++) {
      var rule = INLINE[i];
      if (rule[0] !== ch) continue;
      var m = head.match(rule[1]);
      if (!m) continue;
      var start = off - m[1].length - 2 * rule[3];
      var after = tn.splitText(off);
      var mid = tn.splitText(start);
      var el = document.createElement(rule[2]);
      el.textContent = m[1];
      mid.parentNode.replaceChild(el, mid);
      var z = document.createTextNode(ZW);   // caret lands outside the new element
      el.parentNode.insertBefore(z, after);
      this.caret(z, 1);
      return true;
    }
  };

  /* Chrome turns a <p> into <p><ul>…</ul></p> when you make it a list; lift the list out. */
  Editor.prototype.fixLists = function () {
    var bad = this.el.querySelectorAll(':scope > p > ul, :scope > p > ol');
    if (!bad.length) return;
    var x = this.sel(), sc = x && x.r.startContainer, so = x && x.r.startOffset;
    Array.prototype.forEach.call(bad, function (list) {
      var p = list.parentNode;
      while (p.firstChild) p.parentNode.insertBefore(p.firstChild, p);
      p.remove();
    });
    if (sc && this.el.contains(sc)) this.caret(sc, so);
  };

  Editor.prototype.onInput = function (e) {
    this.fixLists();
    if (e && e.inputType === 'insertText' && /^[*_`~]$/.test(e.data || '')) this.inlineMarkdown(e.data);
    // Browsers leave a bare <br> or text at the top level after a select-all delete; rewrap it.
    var f = this.el.firstChild;
    if (f && (f.nodeType === 3 || f.nodeName === 'BR') && this.el.childNodes.length === 1) {
      var t = f.nodeType === 3 ? f.data : '';
      this.el.innerHTML = '<p>' + (t ? esc(t) : '<br>') + '</p>';
      var p = this.el.firstChild; this.caret(p.firstChild, p.firstChild.nodeType === 3 ? t.length : 0);
    }
    this.refresh();
    this.opt.onChange && this.opt.onChange();
  };

  Editor.prototype.onPaste = function (e) {
    var cd = e.clipboardData; if (!cd) return;
    e.preventDefault();
    var html = cd.getData('text/html'), text = cd.getData('text/plain');
    if (html && !this.within('PRE')) {
      exec('insertHTML', this.sanitize(html.replace(/<!--[\s\S]*?-->/g, '')));
    } else if (this.within('PRE')) {
      exec('insertText', text);
    } else if (text) {
      var paras = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
      exec('insertHTML', paras.map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join(''));
    }
  };

  /* --- toolbar state + bubble --- */
  Editor.prototype.active = function () {
    var on = {};
    try { on.bold = document.queryCommandState('bold'); on.italic = document.queryCommandState('italic'); on.strike = document.queryCommandState('strikeThrough'); } catch (e) {}
    on.h1 = !!this.within('H1'); on.h2 = !!this.within('H2'); on.quote = !!this.within('BLOCKQUOTE');
    on.ul = !!this.within('UL'); on.ol = !!this.within('OL'); on.code = !!(this.within('PRE') || this.within('CODE'));
    on.link = !!this.within('A');
    return on;
  };
  Editor.prototype.refresh = function () {
    var self = this;
    if (this.rf) return;
    this.rf = requestAnimationFrame(function () { self.rf = 0; self.refreshNow(); });
  };
  Editor.prototype.refreshNow = function () {
    var empty = !this.el.textContent.replace(/[\s\u200B]/g, '') && !this.el.querySelector('hr,li,pre,blockquote,h1,h2,h3');
    this.el.classList.toggle('empty', empty);
    var on = this.sel() ? this.active() : {};
    [this.bar, this.bubble].forEach(function (host) {
      if (!host) return;
      host.querySelectorAll('.tool').forEach(function (b) { b.classList.toggle('on', !!on[b.dataset.k]); });
    });
  };
  Editor.prototype.onSelection = function () {
    var x = this.sel();
    if (this.bubble && this.opt.bubble.classList.contains('linking')) return;
    this.refresh();
    if (!this.bubble) return;
    if (!x || x.r.collapsed || !x.r.toString().trim() || this.opt.noBubble && this.opt.noBubble()) { this.hideBubble(); return; }
    this.showBubble(false);
  };
  Editor.prototype.showBubble = function (linking) {
    var x = this.sel(); if (!x && !this.saved) return;
    var r = (x ? x.r : this.saved).getBoundingClientRect(), b = this.opt.bubble;
    b.classList.toggle('linking', !!linking);
    b.hidden = false;
    var w = b.offsetWidth, h = b.offsetHeight;
    var left = Math.max(10, Math.min(window.innerWidth - w - 10, r.left + r.width / 2 - w / 2));
    var top = r.top - h - 12;
    b.classList.toggle('below', top < 64);
    if (top < 64) top = r.bottom + 12;
    b.style.left = left + 'px'; b.style.top = top + 'px';
    requestAnimationFrame(function () { b.classList.add('show'); });
  };
  Editor.prototype.hideBubble = function () {
    if (!this.bubble) return;
    var b = this.opt.bubble;
    b.classList.remove('show', 'linking');
    b.hidden = true;
  };

  /* --- content --- */
  Editor.prototype.html = function () {
    var box = document.createElement('div');
    box.innerHTML = this.sanitize(this.el.innerHTML.replace(/​/g, ''));
    // drop empty trailing paragraphs and list items left by a last Enter
    var blank = function (n) { return n && n.nodeType === 1 && n.nodeName !== 'HR' && !n.querySelector('hr') && !n.textContent.trim(); };
    for (;;) {
      var last = box.lastChild;
      while (last && last.nodeType === 3 && !last.data.trim()) { last.remove(); last = box.lastChild; }
      if (!last) break;
      if ((last.nodeName === 'UL' || last.nodeName === 'OL') && last.children.length > 1 && blank(last.lastElementChild)) { last.lastElementChild.remove(); continue; }
      if (blank(last)) { last.remove(); continue; }
      break;
    }
    return box.innerHTML;
  };
  Editor.prototype.text = function () { return this.el.innerText.replace(/\u200B/g, ''); };
  Editor.prototype.isEmpty = function () { return this.el.classList.contains('empty'); };
  Editor.prototype.set = function (html) { this.el.innerHTML = html || '<p><br></p>'; this.refresh(); };

  root.Editor = Editor;
})(window);
