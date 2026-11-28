// den: a friendly code editor for learning, with Ember the fox.
//
// The OS version of den from the suite. Your project's files down the side, a tab for each, colours, line
// numbers, and Run: web pages and JavaScript run right beside the code (in a box of their own), with a
// console underneath; Python runs in Terminal on DiceOS. Ember sits on the right and says, in plain
// words, what the line you're on does; when something goes wrong she says what it means and where.
// With Deuce's brain set up you can ask her anything about your code. Examples to start from on the
// welcome page: a web page, a Python program, a quiz, an arcade game, and notes. Ctrl+S saves,
// Ctrl+Enter runs.
(function () {
  'use strict';
  const D = window.Dice, h = D.h, esc = D.esc, S = D.S, G = D.G;
  const LANG = (n) => ({ js: 'js', mjs: 'js', html: 'html', htm: 'html', css: 'css', py: 'py', json: 'json', md: 'md', sh: 'sh' })[(/\.([a-z0-9]+)$/i.exec(n || '') || [, ''])[1].toLowerCase()] || 'text';
  const NAMES = { js: 'JavaScript', html: 'HTML', css: 'CSS', py: 'Python', json: 'JSON', md: 'Notes (Markdown)', sh: 'Shell', text: 'Text' };

  // ---- examples to start from --------------------------------------------------------------------------------------
  const EX = {
    'A web page': { 'index.html': '<!doctype html>\n<html>\n<head>\n  <title>My page</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Hello! I made this.</h1>\n  <p>Change these words, then press Run.</p>\n  <button id="hi">Press me</button>\n  <script>\n    document.querySelector(\'#hi\').addEventListener(\'click\', () => {\n      alert(\'You pressed it!\');\n    });\n  </script>\n</body>\n</html>\n', 'style.css': 'body {\n  font-family: system-ui, sans-serif;\n  background: #fff6e8;\n  color: #2a1f14;\n  padding: 40px;\n}\n\nh1 {\n  color: #f0843c;\n}\n\nbutton {\n  font-size: 18px;\n  padding: 10px 18px;\n  border-radius: 10px;\n}\n' },
    'A Python program': { 'guess.py': 'import random\n\n# The computer picks a number, and you guess it.\nsecret = random.randint(1, 20)\nprint("I\'m thinking of a number from 1 to 20.")\n\nfor turn in range(5):\n    guess = int(input("Your guess: "))\n    if guess == secret:\n        print("You got it!")\n        break\n    elif guess < secret:\n        print("Higher!")\n    else:\n        print("Lower!")\nelse:\n    print("Out of turns. It was", secret)\n' },
    'A quiz': { 'quiz.html': '<!doctype html>\n<html>\n<body style="font-family: system-ui; padding: 30px">\n  <h1 id="q">Question</h1>\n  <div id="answers"></div>\n  <p id="score"></p>\n  <script src="quiz.js"></script>\n</body>\n</html>\n', 'quiz.js': 'const questions = [\n  { q: \'What colour is the sky on a clear day?\', answers: [\'Green\', \'Blue\', \'Red\'], right: 1 },\n  { q: \'How many legs does a spider have?\', answers: [\'6\', \'8\', \'10\'], right: 1 },\n  { q: \'Which planet do we live on?\', answers: [\'Mars\', \'Earth\', \'Venus\'], right: 1 },\n];\nlet now = 0;\nlet score = 0;\n\nfunction show() {\n  const item = questions[now];\n  document.querySelector(\'#q\').textContent = item.q;\n  const box = document.querySelector(\'#answers\');\n  box.innerHTML = \'\';\n  item.answers.forEach((text, i) => {\n    const b = document.createElement(\'button\');\n    b.textContent = text;\n    b.onclick = () => pick(i);\n    box.appendChild(b);\n  });\n}\n\nfunction pick(i) {\n  if (i === questions[now].right) score = score + 1;\n  now = now + 1;\n  if (now < questions.length) show();\n  else document.querySelector(\'#score\').textContent = \'You got \' + score + \' out of \' + questions.length;\n  console.log(\'Score so far:\', score);\n}\n\nshow();\n' },
    'An arcade game': { 'game.html': '<!doctype html>\n<html>\n<body style="margin:0;background:#101421">\n<canvas id="c" width="480" height="320"></canvas>\n<script>\n// Catch the falling stars with the arrow keys.\nconst c = document.querySelector(\'#c\');\nconst g = c.getContext(\'2d\');\nlet x = 220, score = 0;\nconst stars = [];\nconst keys = {};\naddEventListener(\'keydown\', (e) => { keys[e.key] = true; });\naddEventListener(\'keyup\', (e) => { keys[e.key] = false; });\n\nfunction loop() {\n  if (keys.ArrowLeft) x -= 5;\n  if (keys.ArrowRight) x += 5;\n  if (Math.random() < 0.03) stars.push({ x: Math.random() * 470, y: 0 });\n  g.fillStyle = \'#101421\';\n  g.fillRect(0, 0, 480, 320);\n  g.fillStyle = \'#f0843c\';\n  g.fillRect(x, 300, 40, 10);\n  g.fillStyle = \'#ffd77a\';\n  stars.forEach((s) => {\n    s.y += 3;\n    g.fillRect(s.x, s.y, 8, 8);\n    if (s.y > 295 && s.x > x - 8 && s.x < x + 40) { score++; s.y = 999; }\n  });\n  g.fillText(\'Score: \' + score, 10, 20);\n  requestAnimationFrame(loop);\n}\nloop();\n</script>\n</body>\n</html>\n' },
    'Notes': { 'notes.md': '# My notes\n\n- Things I learned today\n- **Bold** words and `code` look like this\n\n## Ideas\n\n1. A game about a fox\n2. A website for my class\n' },
  };

  // ---- Ember: what a line does, in plain words ----------------------------------------------------------------------
  const RULES = {
    js: [[/^\s*\/\//, 'A comment: a note for people. The computer skips it.'], [/^\s*(const)\s+(\w+)\s*=/, (m) => 'Makes a box called ' + m[2] + ' and puts something in it. const means it stays that thing.'], [/^\s*let\s+(\w+)/, (m) => 'Makes a box called ' + m[1] + ' that can change later.'],
      [/^\s*function\s+(\w+)\s*\(([^)]*)\)/, (m) => 'Makes a function (a little machine) called ' + m[1] + (m[2].trim() ? ' that takes ' + m[2].trim() : '') + '. It runs when something calls ' + m[1] + '().'], [/\bfor\s*\(/, 'A loop: does the lines inside { } again and again, as it counts.'],
      [/\.forEach\(/, 'Goes through every item in the list, one at a time.'], [/^\s*if\s*\(/, 'Checks something: the lines inside { } only run if it\'s true.'], [/^\s*}\s*else/, 'Otherwise: runs when the if above was false.'], [/console\.log\(/, 'Prints something in the console underneath, so you can see what\'s going on.'],
      [/addEventListener\(\s*['"](\w+)/, (m) => 'Waits for a ' + m[1] + ', then runs the code inside.'], [/document\.querySelector\(/, 'Finds a part of the web page (by its tag, #id or .class) so the code can change it.'], [/\.textContent\s*=/, 'Changes the words shown in that part of the page.'],
      [/^\s*return\b/, 'Hands an answer back to whoever called this function, and stops it.'], [/=>/, 'A short way to write a function: what\'s on the left goes in, the right side is what it does.'], [/requestAnimationFrame/, 'Asks to run again at the next frame: that\'s what makes things move.'], [/Math\.random\(\)/, 'A random number between 0 and 1.'], [/\[\s*$|=\s*\[/, 'A list: things in [ ], separated by commas.'], [/=\s*\{|^\s*\{/, 'An object: named things in { }, like name: value.']],
    py: [[/^\s*#/, 'A comment: a note for people. Python skips it.'], [/^\s*import\s+(\w+)/, (m) => 'Brings in ' + m[1] + ', a box of ready-made tools.'], [/^\s*def\s+(\w+)\s*\(([^)]*)\)/, (m) => 'Makes a function called ' + m[1] + (m[2].trim() ? ' that takes ' + m[2].trim() : '') + '. Everything indented under it is what it does.'],
      [/^\s*for\s+(\w+)\s+in\s+range\((\d+)\)/, (m) => 'A loop: does the indented lines ' + m[2] + ' times, with ' + m[1] + ' counting 0, 1, 2…'], [/^\s*for\s+(\w+)\s+in\s+(\w+)/, (m) => 'A loop: goes through ' + m[2] + ' one at a time, calling each one ' + m[1] + '.'], [/^\s*while\b/, 'A loop that keeps going while something is true.'],
      [/^\s*if\b/, 'Checks something: the indented lines run only if it\'s true.'], [/^\s*elif\b/, 'Or else, if this is true instead…'], [/^\s*else\s*:/, 'Otherwise: runs when nothing above was true.'], [/\binput\(/, 'Asks the person a question and waits for them to type.'], [/\bint\(/, 'Turns words like "7" into the number 7.'],
      [/\bprint\(/, 'Shows something on the screen.'], [/\brandom\.randint\((\d+),\s*(\d+)\)/, (m) => 'A random whole number from ' + m[1] + ' to ' + m[2] + '.'], [/^\s*break\b/, 'Stops the loop straight away.'], [/^\s*return\b/, 'Hands an answer back and leaves the function.'], [/^\s*(\w+)\s*=[^=]/, (m) => 'Puts something in a box called ' + m[1] + '.']],
    html: [[/<!doctype/i, 'Tells the browser this is a modern web page.'], [/<h1/i, 'The biggest heading on the page.'], [/<h[2-6]/i, 'A smaller heading.'], [/<p\b/i, 'A paragraph of words.'], [/<a\b/i, 'A link: href is where it goes.'], [/<img\b/i, 'A picture: src is where it comes from; alt says what it shows.'], [/<button/i, 'A button people can press.'],
      [/<link[^>]+stylesheet/i, 'Brings in a CSS file that sets the colours and looks.'], [/<script\s+src/i, 'Brings in a JavaScript file and runs it.'], [/<script/i, 'JavaScript starts here: code that makes the page do things.'], [/<style/i, 'CSS starts here: how things look.'], [/<div/i, 'A box to group things together.'], [/<canvas/i, 'A space to draw on with code (games use this).'], [/<title/i, 'The name on the tab.'], [/<body/i, 'Everything people see goes inside here.']],
    css: [[/^\s*[.#]?[\w-]+.*\{\s*$/, 'Picks which parts of the page this style is for (a tag name, .class or #id).'], [/^\s*color\s*:/, 'The colour of the words.'], [/^\s*background/, 'What\'s behind it: a colour or a picture.'], [/^\s*font-size/, 'How big the words are.'], [/^\s*font-family/, 'Which font the words use.'], [/^\s*padding/, 'Space inside the box, around what\'s in it.'], [/^\s*margin/, 'Space outside the box.'], [/^\s*border-radius/, 'Rounds the corners.'], [/^\s*display\s*:\s*flex/, 'Lines the things inside up in a row (or a column).']],
  };
  function explain(lang, line) {
    if (!line.trim()) return null;
    const rules = RULES[lang === 'json' ? 'js' : lang] || [];
    for (const [re, say] of rules) { const m = re.exec(line); if (m) return typeof say === 'function' ? say(m) : say; }
    return null;
  }
  function friendly(err) {
    const m = String(err || '');
    let x;
    if ((x = /(\w+) is not defined/.exec(m))) return 'You used ' + x[1] + ' before making it. Check the spelling (capitals count), or make it first with let ' + x[1] + ' = …';
    if ((x = /Cannot read propert(?:y|ies) of (null|undefined)/.exec(m))) return 'Something was ' + x[1] + ' (empty) when the code tried to use it. Often that\'s querySelector not finding the part of the page: check the #id or .class.';
    if (/Unexpected token|Unexpected end|missing \)|Invalid or unexpected/.test(m)) return 'A typing slip: maybe a missing ), } or quote mark, or one too many. Look at the line Ember shows, and the one before it.';
    if ((x = /(\w+(?:\.\w+)?) is not a function/.exec(m))) return x[1] + ' isn\'t a function, so it can\'t be called with (). Check the name.';
    return null;
  }

  D.register({ id: 'den', mount(root, ctx) {
    const fs = D.fileSource ? D.fileSource() : null;
    root.classList.add('den');
    let dir = '~/den', files = [], tabs = [], cur = null, out = [];
    root.innerHTML = '<aside class="dn-side"><header><canvas class="dn-fox" width="30" height="30" aria-hidden="true"></canvas><b class="pix">den</b></header><div class="dn-where"><button class="dn-up" aria-label="Up a folder">‹</button><span></span></div><div class="dn-files" role="tree"></div>' +
      '<div class="dn-sbtn"><button class="b small" data-k="new">' + D.glyph('plus', 2) + 'New file</button><button class="b small" data-k="home">Examples</button></div></aside>' +
      '<section class="dn-main"><nav class="dn-tabs"></nav><div class="dn-edwrap"><div class="dn-ed" hidden><pre class="dn-gut" aria-hidden="true"></pre><div class="dn-wrap"><pre class="dn-hl" aria-hidden="true"></pre><textarea class="dn-ta" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Your code"></textarea></div></div><div class="dn-home"></div></div>' +
      '<div class="dn-bar"><button class="b small go" data-k="run">' + D.glyph('play', 2) + 'Run</button><button class="b small" data-k="save">Save</button><span class="dn-status"></span></div>' +
      '<div class="dn-bottom"><iframe class="dn-view" title="What your code makes" sandbox="allow-scripts allow-modals" hidden></iframe><pre class="dn-console" aria-label="Console" aria-live="polite"></pre></div></section>' +
      '<aside class="dn-ember"><header><canvas class="dn-fox2" width="56" height="56" aria-hidden="true"></canvas><div><b>Ember</b><span>says what your code does</span></div></header><div class="dn-says"></div>' +
      '<form class="dn-askf"><textarea rows="2" placeholder="Ask Ember about your code" aria-label="Ask Ember"></textarea><button class="b small">Ask</button></form></aside>';
    const $ = (s) => root.querySelector(s), ta = $('.dn-ta'), hl = $('.dn-hl'), gut = $('.dn-gut');
    const fox = G.mascot('den');
    [['.dn-fox', 30], ['.dn-fox2', 56]].forEach(([s, n]) => { if (!fox) return; const g = $(s).getContext('2d'); g.imageSmoothingEnabled = false; const k = n / Math.max(fox.width, fox.height); g.drawImage(fox, (n - fox.width * k) / 2, (n - fox.height * k) / 2, fox.width * k, fox.height * k); });
    const say = (html, kind) => { const box = $('.dn-says'); const p = h('<div class="dn-say ' + (kind || '') + '"></div>'); p.innerHTML = html; box.prepend(p); while (box.children.length > 8) box.lastChild.remove(); };
    const status = (t) => { $('.dn-status').textContent = t; };
    const join = (a, b) => a.replace(/\/+$/, '') + '/' + b;

    // files
    async function list(p) {
      if (!fs) return;
      try { const r = await fs.list(p); dir = r.path || p; files = (r.items || []).filter((x) => !x.name.startsWith('.')).sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name)); }
      catch (e) { try { await fs.op({ op: 'mkdir', path: p }); return list(p); } catch (e2) { files = []; } }
      $('.dn-where span').textContent = dir;
      const box = $('.dn-files'); box.innerHTML = '';
      files.forEach((f) => {
        const b = h('<button class="dn-file ' + (f.dir ? 'dir' : 'l-' + LANG(f.name)) + '" role="treeitem"><i></i><span></span></button>');
        b.querySelector('span').textContent = f.name;
        b.classList.toggle('on', !!(cur && cur.path === join(dir, f.name)));
        b.onclick = () => (f.dir ? list(join(dir, f.name)) : open(join(dir, f.name)));
        box.appendChild(b);
      });
      if (!files.length) box.appendChild(h('<p class="dn-empty">Nothing here yet. Make a new file, or start from an example.</p>'));
    }
    async function open(path) {
      let t = tabs.find((x) => x.path === path);
      if (!t) {
        let text = '';
        try { const b = await fs.read(path); text = typeof b === 'string' ? b : await b.text(); } catch (e) { return say('I couldn\'t open that one: ' + esc(e.message || ''), 'bad'); }
        t = { path, name: path.split('/').pop(), text, saved: text };
        tabs.push(t);
      }
      show(t);
      const lang = LANG(t.name);
      say('<b>' + esc(t.name) + '</b> is ' + (lang === 'text' ? 'a text file' : NAMES[lang]) + '. ' + (lang === 'py' ? (D.sys && !D.sys.info.emulated ? 'Run opens it in Terminal, where you can answer its questions.' : 'Python runs on DiceOS (in Terminal). Here you can read and change it.') : lang === 'html' || lang === 'js' ? 'Press Run (or Ctrl+Enter) to see it work, right below.' : lang === 'md' ? 'Notes: # makes a heading, - makes a list.' : ''));
    }
    function show(t) {
      cur = t;
      $('.dn-home').hidden = !!t; $('.dn-ed').hidden = !t;
      tabsPaint();
      if (!t) return;
      ta.value = t.text; paintCode(); ta.focus(); ta.setSelectionRange(0, 0);
      $('.dn-files').querySelectorAll('.dn-file').forEach((b) => b.classList.toggle('on', join(dir, b.textContent) === t.path));
    }
    function tabsPaint() {
      const nav = $('.dn-tabs'); nav.innerHTML = '';
      tabs.forEach((t) => {
        const b = h('<span class="dn-tab ' + (t === cur ? 'on' : '') + ' l-' + LANG(t.name) + '"><button class="dn-tn"></button><button class="dn-tx" aria-label="Close">×</button></span>');
        b.querySelector('.dn-tn').textContent = t.name + (t.text !== t.saved ? ' •' : '');
        b.querySelector('.dn-tn').onclick = () => show(t);
        b.querySelector('.dn-tx').onclick = () => { tabs = tabs.filter((x) => x !== t); show(cur === t ? tabs[tabs.length - 1] || null : cur); };
        nav.appendChild(b);
      });
    }
    function paintCode(badLine) {
      const lang = LANG(cur.name), text = ta.value;
      hl.innerHTML = (D.codePaint ? D.codePaint(text, lang) : esc(text)) + '\n';
      const n = text.split('\n').length;
      gut.innerHTML = Array.from({ length: n }, (_, i) => '<span' + (i + 1 === badLine ? ' class="bad"' : '') + '>' + (i + 1) + '</span>').join('\n');
    }
    let lastLine = -1, sayT = 0;
    ta.addEventListener('input', () => { if (!cur) return; cur.text = ta.value; paintCode(); tabsPaint(); });
    ta.addEventListener('scroll', () => { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; gut.scrollTop = ta.scrollTop; });
    const where = () => { const before = ta.value.slice(0, ta.selectionStart).split('\n'); return { n: before.length, line: ta.value.split('\n')[before.length - 1] || '' }; };
    ['keyup', 'click'].forEach((ev) => ta.addEventListener(ev, () => {
      if (!cur) return;
      const w = where();
      status('Line ' + w.n + ', ' + NAMES[LANG(cur.name)]);
      if (w.n === lastLine) return;
      lastLine = w.n;
      clearTimeout(sayT);
      sayT = setTimeout(() => { const s = explain(LANG(cur.name), w.line); if (s) say('<small>Line ' + w.n + '</small> ' + esc(s)); }, 450);
    }));
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); }
      else if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
      else if (e.key === 'Enter') { const w = where(); const ind = (/^\s*/.exec(w.line) || [''])[0] + (/[{(:\[]\s*$/.test(w.line) ? '  ' : ''); if (ind) { e.preventDefault(); document.execCommand('insertText', false, '\n' + ind); } }
    });
    async function save() {
      if (!cur || !fs) return;
      try { await fs.op({ op: 'text', path: cur.path, text: cur.text }); cur.saved = cur.text; tabsPaint(); status('Saved'); S.play('select'); } catch (e) { say('Saving didn\'t work: ' + esc(e.message || ''), 'bad'); }
    }
    // running: web pages and JavaScript in a box of their own; Python in Terminal
    const con = $('.dn-console'), view = $('.dn-view');
    const log = (kind, text) => { out.push([kind, text]); con.appendChild(h('<span class="' + kind + '"></span>')).textContent = text + '\n'; con.scrollTop = con.scrollHeight; };
    addEventListener('message', onMsg);
    function onMsg(e) {
      if (e.source !== view.contentWindow || !e.data || !e.data.den) return;
      const d = e.data;
      if (d.den === 'log') log(d.kind, d.text);
      if (d.den === 'error') {
        log('err', d.text + (d.line ? ' (line ' + d.line + ')' : ''));
        const f = friendly(d.text);
        say('<b>Something went wrong' + (d.line ? ' on line ' + d.line : '') + '.</b> ' + esc(f || d.text) + (D.deuce && D.deuce.mind ? ' <button class="b small dn-fix">Fix it with Ember</button>' : ''), 'bad');
        const fix = root.querySelector('.dn-fix'); if (fix) fix.onclick = () => askEmber('This error happened: ' + d.text + (d.line ? ' on line ' + d.line : '') + '. What is wrong and how do I fix it? Show the fixed lines.');
        if (d.line && cur && d.file === cur.name) paintCode(d.line);
      }
    }
    const SPY = '<script>(function(){var P=function(k,a){try{parent.postMessage({den:"log",kind:k,text:[].map.call(a,function(x){try{return typeof x==="object"?JSON.stringify(x):String(x)}catch(e){return String(x)}}).join(" ")},"*")}catch(e){}};' +
      '["log","info","warn","error"].forEach(function(k){var o=console[k];console[k]=function(){P(k,arguments);o.apply(console,arguments)}});window.onerror=function(m,s,l){parent.postMessage({den:"error",text:String(m),line:l,file:FILE},"*")}})()<\/script>';
    async function run() {
      if (!cur) return;
      await save();
      const lang = LANG(cur.name);
      con.innerHTML = ''; out = [];
      if (lang === 'py' || lang === 'sh') {
        if (!(D.sys && !D.sys.info.emulated)) return say('Python runs on DiceOS, in Terminal. In a browser you can still write it, and Ember explains each line.');
        D.launch('terminal');
        setTimeout(() => D.emit('terminal-type', 'cd ' + JSON.stringify(dir) + ' && ' + (lang === 'py' ? 'python3 ' : 'bash ') + JSON.stringify(cur.name)), 900);
        return say('It\'s in Terminal: press Enter there to run it.');
      }
      if (lang === 'html' || lang === 'js') {
        let html = lang === 'js' ? '<!doctype html><body><script>\n' + cur.text + '\n<\/script></body>' : cur.text;
        // files next to it (style.css, quiz.js) come along
        const near = await Promise.all(files.filter((f) => !f.dir && /\.(css|js)$/i.test(f.name)).map(async (f) => { const t = tabs.find((x) => x.path === join(dir, f.name)); if (t) return [f.name, t.text]; try { const b = await fs.read(join(dir, f.name)); return [f.name, typeof b === 'string' ? b : await b.text()]; } catch (e) { return [f.name, '']; } }));
        near.forEach(([n, t]) => {
          html = html.replace(new RegExp('<link[^>]+href=["\']' + n.replace(/\./g, '\\.') + '["\'][^>]*>', 'i'), '<style>\n' + t + '\n</style>');
          html = html.replace(new RegExp('<script[^>]+src=["\']' + n.replace(/\./g, '\\.') + '["\'][^>]*>\\s*<\\/script>', 'i'), '<script>\n' + t.replace(/<\/script/gi, '<\\/script') + '\n<\/script>');
        });
        view.hidden = false;
        view.srcdoc = SPY.replace('FILE', JSON.stringify(lang === 'js' ? cur.name : cur.name)) + html;
        status('Running ' + cur.name);
        return;
      }
      if (lang === 'json') { try { JSON.parse(cur.text); say('That JSON is fine: every bracket and quote is where it should be.'); } catch (e) { say('<b>The JSON has a slip:</b> ' + esc(e.message), 'bad'); } return; }
      say('There\'s nothing to run in ' + (lang === 'md' ? 'notes' : 'a text file') + '. Try an HTML, JavaScript or Python file.');
    }
    async function askEmber(q) {
      const Mind = D.deuce && D.deuce.mind;
      if (!Mind || !Mind.once) return say('To answer questions, Ember uses Deuce\'s brain. Set it up in Settings, Deuce (it runs on this computer).');
      say('<i>Ember is thinking…</i>', 'wait');
      const ans = await Mind.once('You are Ember, a friendly fox who teaches coding to a beginner. Answer in plain, short words. When you show code, show only the lines that change.', (cur ? 'The file ' + cur.name + ':\n' + cur.text.slice(0, 6000) + '\n\n' : '') + 'Question: ' + q).catch(() => null);
      const w = root.querySelector('.dn-say.wait'); if (w) w.remove();
      say(ans ? esc(String(ans)).replace(/```[a-z]*\n?([\s\S]*?)```/g, '<pre>$1</pre>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>') : 'Ember couldn\'t answer just now.');
    }
    $('.dn-askf').onsubmit = (e) => { e.preventDefault(); const t = $('.dn-askf textarea'); if (t.value.trim()) { askEmber(t.value.trim()); t.value = ''; } };
    $('.dn-askf textarea').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('.dn-askf').requestSubmit(); } };
    root.querySelector('[data-k="run"]').onclick = run;
    root.querySelector('[data-k="save"]').onclick = save;
    root.querySelector('[data-k="home"]').onclick = () => show(null);
    root.querySelector('.dn-up').onclick = () => list(dir.replace(/\/[^/]+\/?$/, '') || '/');
    root.querySelector('[data-k="new"]').onclick = () => D.ask({ title: 'A new file', text: 'Its name says what it is: page.html, game.js, hello.py, notes.md…', input: { label: 'Name', value: 'hello.py' }, buttons: [{ label: 'Make it', value: true, go: true }, { label: 'Never mind', value: false }] })
      .then(async (r) => { if (!r || !r.ok || !String(r.value).trim()) return; const p = join(dir, String(r.value).trim().replace(/[\\/]/g, '-')); try { await fs.op({ op: 'text', path: p, text: '' }); await list(dir); open(p); } catch (e) { say(esc(e.message || 'That didn\'t work.'), 'bad'); } });
    // the welcome page: examples to start from
    const home = $('.dn-home');
    home.innerHTML = '<h2 class="pix">Make something</h2><p>Pick one to start from. It goes in its own folder in den, and you can change anything.</p><div class="dn-ex"></div>';
    Object.keys(EX).forEach((name, i) => {
      const b = h('<button class="dn-exb" style="--i:' + i + '"><b></b><span></span></button>');
      b.querySelector('b').textContent = name;
      b.querySelector('span').textContent = Object.keys(EX[name]).join(', ');
      b.onclick = async () => {
        const folder = join('~/den', name.replace(/^an? /i, '').replace(/\s+/g, '-').toLowerCase());
        try { await fs.op({ op: 'mkdir', path: '~/den' }); } catch (e) { /* there */ }
        try { await fs.op({ op: 'mkdir', path: folder }); } catch (e) { /* there */ }
        for (const [f, text] of Object.entries(EX[name])) { try { await fs.op({ op: 'text', path: join(folder, f), text }); } catch (e) { /* fine */ } }
        await list(folder);
        open(join(folder, Object.keys(EX[name])[0]));
      };
      home.querySelector('.dn-ex').appendChild(b);
    });
    say('Hi, I\'m Ember. Open a file, or start from an example. Click on any line and I\'ll say what it does.');
    list(ctx.arg && typeof ctx.arg === 'string' ? ctx.arg : '~/den');
    show(null);
    ctx.legend([]);
    return { unmount() { removeEventListener('message', onMsg); } };
  } });
})();
