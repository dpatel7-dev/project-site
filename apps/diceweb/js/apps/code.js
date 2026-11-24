// Code: a small code editor for your own files. Your folders down the side, a tab for
// each open file, line numbers, colours for JavaScript, Python, HTML, CSS, JSON, shell
// and Markdown, and a preview that runs web pages and JavaScript right beside the code.
// On DiceOS it edits your real files; in a browser, DiceWeb's pretend disk.
//
// Keys: Ctrl+S saves, Ctrl+N makes a new file, Ctrl+W closes the tab, Ctrl+F finds,
// Ctrl+/ comments lines in or out, Tab and Shift+Tab indent, Ctrl+Enter runs it.
(function () {
  'use strict';
  const D = window.Dice, h = D.h, esc = D.esc;
  const TEXT = /\.(txt|md|markdown|js|mjs|cjs|ts|json|py|sh|bash|html?|css|csv|log|conf|cfg|ini|ya?ml|toml|xml|svg|c|h|cpp|java|rs|go|rb|lua|sql|env|gitignore)$|^[^.]+$/i;
  const LANG = (name) => {
    const m = /\.([a-z0-9]+)$/i.exec(name || ''), x = m ? m[1].toLowerCase() : '';
    return { js: 'js', mjs: 'js', cjs: 'js', ts: 'js', json: 'json', py: 'py', sh: 'sh', bash: 'sh', html: 'html', htm: 'html', svg: 'html', xml: 'html', css: 'css', md: 'md', markdown: 'md' }[x] || 'text';
  };
  const NAMES = { js: 'JavaScript', json: 'JSON', py: 'Python', sh: 'Shell', html: 'HTML', css: 'CSS', md: 'Markdown', text: 'Plain text' };
  const COMMENT = { js: '//', py: '#', sh: '#', css: null, html: null, json: null, md: null, text: null };

  // ---- colours: one pass over the text, one pattern per kind of thing ------------------------
  const STR = '`(?:\\\\[\\s\\S]|[^`\\\\])*`?|\'(?:\\\\.|[^\'\\\\\\n])*\'?|"(?:\\\\.|[^"\\\\\\n])*"?';
  const NUM = '\\b(?:0[xX][\\da-fA-F]+|\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b';
  const RULES = {
    js: [['c', '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)'], ['s', STR], ['n', NUM],
      ['k', '\\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|export|from|default|try|catch|finally|throw|async|await|yield|typeof|instanceof|in|of|this|null|undefined|true|false|void|delete|interface|type)\\b'],
      ['f', '\\b[A-Za-z_$][\\w$]*(?=\\s*\\()']],
    py: [['c', '#[^\\n]*'], ['s', '[rbfuRBFU]{0,2}(?:"""[\\s\\S]*?(?:"""|$)|\'\'\'[\\s\\S]*?(?:\'\'\'|$)|\'(?:\\\\.|[^\'\\\\\\n])*\'?|"(?:\\\\.|[^"\\\\\\n])*"?)'], ['n', NUM],
      ['k', '\\b(?:def|class|return|if|elif|else|for|while|in|not|and|or|is|import|from|as|with|try|except|finally|raise|pass|break|continue|lambda|yield|global|nonlocal|None|True|False|async|await|self)\\b'],
      ['f', '\\b[A-Za-z_]\\w*(?=\\s*\\()'], ['p', '@[\\w.]+']],
    sh: [['c', '(?:^|\\s)#[^\\n]*'], ['s', '\'[^\']*\'?|"(?:\\\\.|[^"\\\\])*"?'], ['p', '\\$\\{?[\\w@#?*!-]+\\}?'],
      ['k', '\\b(?:if|then|else|elif|fi|for|in|do|done|while|until|case|esac|function|return|exit|export|local|readonly|set|unset|shift|source|echo|printf|cd|sudo|apt|true|false)\\b'], ['n', NUM]],
    css: [['c', '\\/\\*[\\s\\S]*?(?:\\*\\/|$)'], ['s', STR], ['k', '@[\\w-]+|!important'], ['p', '[\\w-]+(?=\\s*:(?!:)[^{;]*[;}])'],
      ['n', '#[\\da-fA-F]{3,8}\\b|-?\\b\\d+(?:\\.\\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\\b'], ['f', '[.#][A-Za-z_][\\w-]*|::?[\\w-]+']],
    html: [['c', '<!--[\\s\\S]*?(?:-->|$)'], ['t', '<\\/?[\\w-]+|\\/?>'], ['p', '\\b[\\w:-]+(?==)'], ['s', '"[^"]*"?|\'[^\']*\'?']],
    json: [['p', '"(?:\\\\.|[^"\\\\\\n])*"(?=\\s*:)'], ['s', '"(?:\\\\.|[^"\\\\\\n])*"?'], ['n', '-?' + NUM], ['k', '\\b(?:true|false|null)\\b']],
    md: [['k', '^#{1,6} [^\\n]*'], ['s', '`[^`\\n]*`?|^```[^\\n]*'], ['f', '\\*\\*[^*\\n]+\\*\\*|\\[[^\\]\\n]+\\]\\([^)\\n]*\\)?'], ['c', '^> [^\\n]*'], ['p', '^\\s*(?:[-*+]|\\d+\\.) ']],
  };
  const RE = {};
  Object.entries(RULES).forEach(([lang, rules]) => { RE[lang] = { re: new RegExp(rules.map(([, s]) => '(' + s + ')').join('|'), 'gm'), kinds: rules.map(([k]) => k) }; });
  function paint(text, lang) {
    const r = RE[lang];
    if (!r || text.length > 300000) return esc(text);
    let out = '', at = 0, m;
    r.re.lastIndex = 0;
    while ((m = r.re.exec(text))) {
      if (!m[0]) { r.re.lastIndex++; continue; }
      const k = r.kinds[m.slice(1).findIndex((x) => x !== undefined)];
      out += esc(text.slice(at, m.index)) + '<span class="tk-' + k + '">' + esc(m[0]) + '</span>';
      at = m.index + m[0].length;
    }
    return out + esc(text.slice(at));
  }
  D.codePaint = paint; // (for the tests)

  D.register({ id: 'code', mount(root, ctx) {
    const fs = D.fileSource ? D.fileSource() : null;
    root.classList.add('cda');
    root.innerHTML = '<aside class="cd-side"><div class="cd-where"><button class="b small" data-nav data-key="cd:up" aria-label="Up a folder">Up</button><b class="cd-path"></b></div><div class="cd-files" role="list"></div>' +
      '<div class="cd-side-btns"><button class="b small" data-nav data-key="cd:new">' + D.glyph('plus', 2) + 'New file</button></div></aside>' +
      '<section class="cd-main"><nav class="cd-tabs" role="tablist"></nav><div class="cd-find" hidden><input aria-label="Find" placeholder="Find" spellcheck="false"><span class="cd-count"></span><button class="b small" data-key="cd:fnext">Next</button><button class="b small" data-key="cd:fclose" aria-label="Close find">' + D.glyph('close', 1) + '</button></div>' +
      '<div class="cd-body"><div class="cd-ed"><pre class="cd-gut" aria-hidden="true"></pre><div class="cd-wrap"><pre class="cd-hl" aria-hidden="true"></pre><textarea class="cd-ta" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Code"></textarea></div></div>' +
      '<div class="cd-run" hidden><div class="cd-run-bar"><b>Preview</b><button class="b small" data-key="cd:rclose" aria-label="Close the preview">' + D.glyph('close', 1) + '</button></div><iframe title="Preview" sandbox="allow-scripts"></iframe><pre class="cd-out" aria-live="polite"></pre></div></div>' +
      '<footer class="cd-status"><span class="cd-pos"></span><span class="cd-lang"></span><span class="cd-msg"></span><button class="b small" data-key="cd:run">' + D.glyph('play', 1) + 'Run</button><button class="b small go" data-key="cd:save">Save</button></footer></section>';
    const $ = (s) => root.querySelector(s);
    const ta = $('.cd-ta'), hl = $('.cd-hl'), gut = $('.cd-gut'), tabsEl = $('.cd-tabs'), filesEl = $('.cd-files');
    const tabs = [];
    let cur = null, dir = null, msgT = 0;
    const home = () => (fs && fs.real ? (D.sys.status && D.sys.status.home) || '~' : '~');

    // ---- the folder down the side ----------------------------------------------------------------
    async function openDir(p) {
      if (!fs) { filesEl.innerHTML = '<p class="muted">No files here.</p>'; return; }
      try {
        const r = await fs.list(p);
        dir = r.path;
        $('.cd-path').textContent = r.path === '~' ? 'Home' : r.path.split('/').filter(Boolean).pop() || '/';
        $('.cd-path').title = r.path;
        filesEl.innerHTML = '';
        r.items.filter((it) => !it.name.startsWith('.') || it.name === '.gitignore').forEach((it) => {
          const b = h('<button class="cd-f' + (it.dir ? ' dir' : '') + '" role="listitem" data-nav data-key="cd:f:' + esc(it.name) + '">' + D.glyph(it.dir ? 'box' : 'copy', 1) + '<span>' + esc(it.name) + '</span></button>');
          b.onclick = () => (it.dir ? openDir(join(dir, it.name)) : TEXT.test(it.name) ? openFile(join(dir, it.name)) : say('Code opens text files. Try Files for that one.'));
          filesEl.appendChild(b);
        });
        if (!r.items.length) filesEl.innerHTML = '<p class="muted cd-empty">Nothing in this folder yet.</p>';
      } catch (e) { say(e.message); }
    }
    const join = (a, b) => (a.endsWith('/') ? a + b : a + '/' + b);
    $('[data-key="cd:up"]').onclick = () => { if (dir && dir !== '/' && dir !== '~') openDir(dir.replace(/\/[^/]+$/, '') || '/'); };

    // ---- tabs ------------------------------------------------------------------------------------------
    async function openFile(path) {
      const have = tabs.find((t) => t.path === path);
      if (have) return show(have);
      try {
        const text = await (await fs.read(path)).text();
        const t = { path, name: path.split('/').pop(), text, saved: text, lang: LANG(path), sel: 0, top: 0 };
        tabs.push(t); show(t);
        recent(path);
      } catch (e) { say(e.message); }
    }
    function newFile(name) {
      const t = { path: null, name: name || 'untitled.js', text: '', saved: null, lang: LANG(name || 'untitled.js'), sel: 0, top: 0 };
      tabs.push(t); show(t);
    }
    function show(t) {
      if (cur) { cur.text = ta.value; cur.sel = ta.selectionStart; cur.top = ta.scrollTop; }
      cur = t;
      ta.value = t.text; ta.disabled = false;
      try { ta.setSelectionRange(t.sel, t.sel); } catch (e) { /* fine */ }
      ta.scrollTop = t.top;
      repaint(); paintTabs(); status();
      ctx.setTitle && ctx.setTitle(t.name + ' — Code');
      setTimeout(() => ta.focus(), 0);
    }
    function paintTabs() {
      tabsEl.innerHTML = '';
      tabs.forEach((t) => {
        const dirty = t === cur ? ta.value !== t.saved : t.text !== t.saved;
        const b = h('<span class="cd-tab' + (t === cur ? ' on' : '') + '" role="tab" aria-selected="' + (t === cur) + '"><button class="cd-tab-n" data-nav data-key="cd:t:' + esc(t.path || t.name) + '">' + esc(t.name) + (dirty ? '<i class="cd-dot" aria-label="not saved"></i>' : '') + '</button><button class="cd-tab-x" aria-label="Close ' + esc(t.name) + '">' + D.glyph('close', 1) + '</button></span>');
        b.querySelector('.cd-tab-n').onclick = () => show(t);
        b.querySelector('.cd-tab-x').onclick = () => close(t);
        tabsEl.appendChild(b);
      });
      if (!tabs.length) { ta.value = ''; ta.disabled = true; hl.innerHTML = '<span class="cd-hint">Pick a file on the left, or make a new one.</span>'; gut.textContent = ''; }
    }
    async function close(t) {
      const dirty = (t === cur ? ta.value : t.text) !== t.saved;
      if (dirty) {
        const v = await D.ask({ title: 'Save ' + t.name + '?', text: 'Your changes go if you don\'t.', buttons: [{ label: 'Save', value: 'save', go: true }, { label: 'Don\'t save', value: 'drop', danger: true }, { label: 'Cancel', value: null }] });
        if (!v) return;
        if (v === 'save') { show(t); if (!(await save())) return; }
      }
      const i = tabs.indexOf(t);
      tabs.splice(i, 1);
      if (t === cur) { cur = null; if (tabs.length) show(tabs[Math.min(i, tabs.length - 1)]); }
      paintTabs(); status();
    }

    // ---- saving ----------------------------------------------------------------------------------------
    async function save() {
      if (!cur || !fs) return false;
      if (!cur.path) {
        const r = await D.ask({ title: 'Save as', text: 'In ' + (dir || 'your home folder') + '.', input: { label: 'File name', value: cur.name }, buttons: [{ label: 'Save', value: true, go: true }, { label: 'Cancel', value: false }] });
        const n = r && r.value && r.value.trim();
        if (!n || /[\\/]/.test(n)) return false;
        cur.path = join(dir || home(), n); cur.name = n; cur.lang = LANG(n);
      }
      try {
        await fs.op({ op: 'text', path: cur.path, text: ta.value });
        cur.saved = cur.text = ta.value;
        say('Saved'); paintTabs(); repaint(); openDir(dir || home()); recent(cur.path);
        return true;
      } catch (e) { say(e.message); return false; }
    }
    function recent(p) { const r = (D.state.codeRecent || []).filter((x) => x !== p); r.unshift(p); D.state.codeRecent = r.slice(0, 8); D.save(); }

    // ---- the editor: a see-through text box over the coloured copy --------------------------------
    let rq = 0;
    function repaint() {
      cancelAnimationFrame(rq);
      rq = requestAnimationFrame(() => {
        if (!cur) return;
        hl.innerHTML = paint(ta.value, cur.lang) + '\n';
        const n = ta.value.split('\n').length;
        if (gut.childElementCount !== n || !gut.dataset.n || +gut.dataset.n !== n) { gut.dataset.n = n; gut.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); }
        sync();
      });
    }
    function sync() { hl.style.transform = 'translate(' + -ta.scrollLeft + 'px,' + -ta.scrollTop + 'px)'; gut.style.transform = 'translateY(' + -ta.scrollTop + 'px)'; }
    function status() {
      if (!cur) { $('.cd-pos').textContent = ''; $('.cd-lang').textContent = ''; return; }
      const before = ta.value.slice(0, ta.selectionStart), line = before.split('\n').length, col = before.length - before.lastIndexOf('\n');
      $('.cd-pos').textContent = 'Line ' + line + ', column ' + col;
      $('.cd-lang').textContent = NAMES[cur.lang];
      $('[data-key="cd:run"]').hidden = !['html', 'js', 'md'].includes(cur.lang);
    }
    function say(t) { const m = $('.cd-msg'); m.textContent = t; clearTimeout(msgT); msgT = setTimeout(() => { m.textContent = ''; }, 2600); }
    ta.addEventListener('input', () => { repaint(); status(); if (cur && (ta.value === cur.saved) !== !tabsEl.querySelector('.on .cd-dot')) paintTabs(); });
    ta.addEventListener('scroll', sync);
    ['keyup', 'click', 'select'].forEach((ev) => ta.addEventListener(ev, status));

    // lines the selection touches, for indenting and commenting
    function lines(fn) {
      const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
      const a = v.lastIndexOf('\n', s - 1) + 1, bEnd = v.indexOf('\n', e - (e > s && v[e - 1] === '\n' ? 1 : 0)), b = bEnd < 0 ? v.length : bEnd;
      const chunk = v.slice(a, b).split('\n'), out = fn(chunk).join('\n');
      ta.setRangeText(out, a, b, 'select');
      if (s === e) { const d = out.length - (b - a); ta.setSelectionRange(Math.max(a, s + (chunk.length === 1 ? d : 0)), Math.max(a, s + (chunk.length === 1 ? d : 0))); }
      ta.dispatchEvent(new Event('input'));
    }
    ta.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (mod && k === 's') { e.preventDefault(); e.stopPropagation(); save(); return; }
      if (mod && k === 'n') { e.preventDefault(); e.stopPropagation(); newFile(); return; }
      if (mod && k === 'w') { e.preventDefault(); e.stopPropagation(); if (cur) close(cur); return; }
      if (mod && k === 'f') { e.preventDefault(); e.stopPropagation(); find(); return; }
      if (mod && k === 'enter') { e.preventDefault(); e.stopPropagation(); run(); return; }
      if (mod && k === '/') {
        e.preventDefault(); e.stopPropagation();
        const c = COMMENT[cur && cur.lang];
        if (!c) return say('No comments in ' + NAMES[cur ? cur.lang : 'text'] + '.');
        lines((ls) => { const all = ls.filter((l) => l.trim()).every((l) => l.trim().startsWith(c)); return ls.map((l) => (!l.trim() ? l : all ? l.replace(new RegExp('^(\\s*)' + c.replace(/[/]/g, '\\/') + ' ?'), '$1') : l.replace(/^(\s*)/, '$1' + c + ' '))); });
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault(); e.stopPropagation();
        if (e.shiftKey) lines((ls) => ls.map((l) => l.replace(/^ {1,2}/, '')));
        else if (ta.selectionStart !== ta.selectionEnd && ta.value.slice(ta.selectionStart, ta.selectionEnd).includes('\n')) lines((ls) => ls.map((l) => '  ' + l));
        else { ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
        return;
      }
      if (e.key === 'Enter' && !mod && !e.shiftKey) {
        // keep the indent, and go one further after an opening bracket or a colon
        e.preventDefault(); e.stopPropagation();
        const v = ta.value, s = ta.selectionStart, line = v.slice(v.lastIndexOf('\n', s - 1) + 1, s), ind = /^\s*/.exec(line)[0];
        const more = /[{[(]\s*$/.test(line) || (cur && cur.lang === 'py' && /:\s*$/.test(line)) ? '  ' : '';
        const closeNext = more && /^[}\])]/.test(v.slice(s));
        ta.setRangeText('\n' + ind + more + (closeNext ? '\n' + ind : ''), s, ta.selectionEnd, 'end');
        if (closeNext) ta.setSelectionRange(s + 1 + ind.length + more.length, s + 1 + ind.length + more.length);
        ta.dispatchEvent(new Event('input'));
        return;
      }
      if (e.key === 'Escape') { e.stopPropagation(); if (!$('.cd-find').hidden) { closeFind(); e.preventDefault(); } }
    });
    // pairs: a bracket or quote typed over a selection wraps it
    ta.addEventListener('beforeinput', (e) => {
      const pair = { '(': ')', '[': ']', '{': '}', '"': '"', '\'': '\'', '`': '`' }[e.data];
      if (e.inputType !== 'insertText' || !pair || ta.selectionStart === ta.selectionEnd) return;
      e.preventDefault();
      const s = ta.selectionStart, t = ta.value.slice(s, ta.selectionEnd);
      ta.setRangeText(e.data + t + pair, s, ta.selectionEnd, 'end'); ta.setSelectionRange(s + 1, s + 1 + t.length);
      ta.dispatchEvent(new Event('input'));
    });

    // ---- finding ---------------------------------------------------------------------------------------
    const fbox = $('.cd-find'), fin = fbox.querySelector('input');
    function find() { fbox.hidden = false; const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd); if (sel && !sel.includes('\n')) fin.value = sel; fin.focus(); fin.select(); count(); }
    function closeFind() { fbox.hidden = true; ta.focus(); }
    function count() { const q = fin.value; fbox.querySelector('.cd-count').textContent = q ? ta.value.split(q).length - 1 + ' found' : ''; }
    function next() {
      const q = fin.value; if (!q) return;
      let i = ta.value.indexOf(q, ta.selectionEnd);
      if (i < 0) i = ta.value.indexOf(q);
      if (i < 0) return say('Not found');
      ta.focus(); ta.setSelectionRange(i, i + q.length);
      const line = ta.value.slice(0, i).split('\n').length, lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
      ta.scrollTop = Math.max(0, (line - 4) * lh); sync(); status();
    }
    fin.addEventListener('input', count);
    fin.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); next(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind(); } });
    $('[data-key="cd:fnext"]').onclick = next;
    $('[data-key="cd:fclose"]').onclick = closeFind;

    // ---- running: web pages and JavaScript beside the code, in a sealed-off frame --------------
    const runBox = $('.cd-run'), frame = runBox.querySelector('iframe'), out = runBox.querySelector('.cd-out');
    const CATCH = '<script>(function(){var send=function(k,a){parent.postMessage({diceCode:1,k:k,t:[].map.call(a,function(x){try{return typeof x==="object"?JSON.stringify(x):String(x)}catch(e){return String(x)}}).join(" ")},"*")};["log","info","warn","error"].forEach(function(k){var o=console[k];console[k]=function(){send(k,arguments);o.apply(console,arguments)}});addEventListener("error",function(e){send("error",[e.message+" (line "+e.lineno+")"])})})()<\/script>';
    function run() {
      if (!cur) return;
      const v = ta.value;
      runBox.hidden = false; out.textContent = '';
      if (cur.lang === 'html') { frame.hidden = false; out.hidden = false; frame.srcdoc = CATCH + v; }
      else if (cur.lang === 'md') { frame.hidden = false; out.hidden = true; frame.srcdoc = '<style>body{font:16px/1.6 system-ui;max-width:42em;margin:20px auto;padding:0 16px}code{background:#eee;padding:1px 4px;border-radius:4px}</style>' + md(v); }
      else if (cur.lang === 'js') { frame.hidden = true; out.hidden = false; frame.srcdoc = CATCH + '<script>' + v.replace(/<\/script/gi, '<\\/script') + '<\/script>'; }
      else say('Run works for web pages, JavaScript and Markdown.');
    }
    function md(t) {
      return esc(t).replace(/^### (.*)$/gm, '<h3>$1</h3>').replace(/^## (.*)$/gm, '<h2>$1</h2>').replace(/^# (.*)$/gm, '<h1>$1</h1>')
        .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/^\s*[-*] (.*)$/gm, '<li>$1</li>').replace(/\n{2,}/g, '<p>');
    }
    const onMsg = (e) => {
      if (e.source !== frame.contentWindow || !e.data || !e.data.diceCode) return;
      const line = h('<div class="cd-o-' + e.data.k + '"></div>'); line.textContent = e.data.t; out.appendChild(line); out.scrollTop = out.scrollHeight;
    };
    addEventListener('message', onMsg);
    $('[data-key="cd:rclose"]').onclick = () => { runBox.hidden = true; frame.srcdoc = ''; };
    $('[data-key="cd:run"]').onclick = run;
    $('[data-key="cd:save"]').onclick = save;
    $('[data-key="cd:new"]').onclick = async () => {
      const r = await D.ask({ title: 'New file', text: 'The ending decides the colours: .js, .py, .html, .css, .md, .sh, .json…', input: { label: 'File name', value: 'hello.js' }, buttons: [{ label: 'Make it', value: true, go: true }, { label: 'Cancel', value: false }] });
      const n = r && r.value && r.value.trim();
      if (n && !/[\\/]/.test(n)) newFile(n);
    };

    // start in ~/code if there is one, and open what was open last time
    (async () => {
      let start = home();
      if (fs) { try { await fs.list(join(home(), 'code')); start = join(home(), 'code'); } catch (e) { /* no code folder */ } }
      await openDir(typeof ctx.arg === 'string' && ctx.arg ? ctx.arg.replace(/\/[^/]*$/, '') || start : start);
      if (typeof ctx.arg === 'string' && ctx.arg && TEXT.test(ctx.arg)) openFile(ctx.arg);
      else if ((D.state.codeRecent || [])[0]) openFile(D.state.codeRecent[0]).catch(() => {});
      else paintTabs();
    })();
    paintTabs();
    return {
      onAction(a) {
        if (a === 'b' && !fbox.hidden) { closeFind(); return true; }
        if (a === 'b' && !runBox.hidden) { runBox.hidden = true; return true; }
        return false;
      },
      unmount() { removeEventListener('message', onMsg); },
    };
  } });
})();
