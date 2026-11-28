// tidy: sorts a messy folder, and shows you first.
//
// The OS version of tidy from the suite, with Hazel the squirrel. Pick a folder (Downloads, Desktop,
// Documents, or any other) and a plan is ready at once: the loose files sorted by kind (installers,
// screenshots, pictures, documents…), or By date, one tab away. Folders you already made are reused.
// "Ask" lets you say how in your own words, and Deuce's brain (on this computer) makes the plan.
// Nothing moves until you press Move. It never deletes anything, never touches folders or hidden files,
// and "Put it all back" (or Oops) undoes the lot.
(function () {
  'use strict';
  const D = window.Dice, h = D.h, esc = D.esc, S = D.S, G = D.G;
  const T = (D.tidy = {});
  const KINDS = [
    ['Installers', '#ef6a55', /\.(deb|appimage|flatpakref|flatpak|exe|msi|dmg|pkg|apk|run|rpm)$/i],
    ['Screenshots', '#4b7bec', null], // by name, below
    ['Pictures', '#f5a623', /\.(jpe?g|png|gif|webp|heic|heif|bmp|svg|tiff?|avif|raw|cr2|nef)$/i],
    ['Videos', '#ff7a59', /\.(mp4|mov|mkv|webm|avi|m4v|wmv|flv)$/i],
    ['Music', '#d39cf5', /\.(mp3|m4a|wav|flac|aiff?|ogg|opus|aac)$/i],
    ['Documents', '#2fa59a', /\.(pdf|docx?|odt|rtf|txt|md|pages|epub)$/i],
    ['Spreadsheets', '#3ea65a', /\.(xlsx?|ods|csv|tsv|numbers)$/i],
    ['Slides', '#e8913a', /\.(pptx?|odp|key)$/i],
    ['Archives', '#8a6fd8', /\.(zip|tar|gz|tgz|bz2|xz|7z|rar|zst)$/i],
    ['Code', '#1f6feb', /\.(js|mjs|ts|py|html?|css|json|sh|c|cpp|h|java|rb|go|rs|php|sql|ipynb|yaml|yml|toml|xml)$/i],
  ];
  const SAME = { Pictures: ['images', 'photos', 'pics', 'pictures'], Documents: ['docs', 'documents', 'papers'], Videos: ['videos', 'movies', 'clips'], Music: ['music', 'songs', 'audio'], Installers: ['installers', 'apps', 'setup'], Archives: ['archives', 'zips', 'compressed'], Code: ['code', 'projects', 'scripts'] };
  const colourOf = (name) => (KINDS.find((k) => k[0] === name) || [0, ['#7c9cff', '#2bc4b2', '#f6a6b8', '#d7f07a', '#9fd3ff'][name.length % 5]])[1];
  const PLACES = [['~/Downloads', 'Downloads'], ['~/Desktop', 'Desktop'], ['~/Documents', 'Documents'], ['~', 'Home']];

  // ---- plans: { folders: [{ name, files: [name…] }] } over the folder's loose files ---------------------------------
  T.byKind = function (files, have) {
    const out = new Map();
    files.forEach((f) => {
      let k = /^(screen ?shot|screenshot|screen recording|capture|snip)/i.test(f.name) && /\.(png|jpe?g|gif|webp|mp4|mov)$/i.test(f.name) ? 'Screenshots' : null;
      if (!k) { const hit = KINDS.find(([, , re]) => re && re.test(f.name)); k = hit ? hit[0] : 'Other'; }
      // reuse a folder you already have ("Images" for Pictures)
      const mine = have.find((d) => d.toLowerCase() === k.toLowerCase() || (SAME[k] || []).includes(d.toLowerCase()));
      const name = mine || k;
      if (!out.has(name)) out.set(name, []);
      out.get(name).push(f.name);
    });
    return { folders: [...out].map(([name, fs]) => ({ name, files: fs })).sort((a, b) => b.files.length - a.files.length) };
  };
  T.byDate = function (files) {
    const out = new Map();
    files.forEach((f) => {
      const d = new Date((f.mtime || Date.now() / 1000) * 1000);
      const name = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + d.toLocaleDateString('en', { month: 'long' });
      if (!out.has(name)) out.set(name, []);
      out.get(name).push(f.name);
    });
    return { folders: [...out].sort((a, b) => b[0].localeCompare(a[0])).map(([name, fs]) => ({ name, files: fs })) };
  };
  // an AI's answer, made safe: real files only, each once, sensible folder names
  T.clean = function (plan, files) {
    const names = new Set(files.map((f) => f.name)), used = new Set();
    const folders = (plan && Array.isArray(plan.folders) ? plan.folders : []).map((f) => ({
      name: String(f.name || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/^\.+/, '').replace(/\s+/g, ' ').trim().slice(0, 60),
      files: (Array.isArray(f.files) ? f.files : []).map((x) => String(x).split('/').pop()).filter((x) => names.has(x) && !used.has(x) && used.add(x)),
    })).filter((f) => f.name && f.files.length);
    return { folders };
  };
  async function askBrain(how, files) {
    const Mind = D.deuce && D.deuce.mind;
    if (!Mind || !Mind.once) return null;
    const sys = 'You sort files into folders for someone. Use ONLY the file names given, each at most once. Short, clear folder names. Leave out files that don\'t fit.';
    const ask = 'How they want it sorted: ' + how + '\nThe files:\n' + files.slice(0, 300).map((f) => f.name).join('\n');
    const r = await Mind.once(sys, ask, { type: 'object', properties: { folders: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } }, required: ['name', 'files'] } } }, required: ['folders'] }).catch(() => null);
    return r ? T.clean(r, files) : null;
  }

  // ---- moving, and putting it back ---------------------------------------------------------------------------------
  const join = (a, b) => (a === '/' ? '/' + b : a.replace(/\/+$/, '') + '/' + b);
  T.apply = async function (dir, plan, src) {
    src = src || D.fileSource();
    const moved = [], made = [];
    for (const f of plan.folders) {
      const to = join(dir, f.name);
      try { await src.op({ op: 'mkdir', path: to }); made.push(to); } catch (e) { /* it's there already */ }
      for (const name of f.files) {
        try { const r = await src.op({ op: 'move', path: join(dir, name), to }); moved.push({ from: dir, name: typeof r === 'string' ? r : r && typeof r.path === 'string' ? r.path.split('/').pop() : name, to }); } catch (e) { /* a file with that name is there already: leave this one */ }
      }
    }
    if (D.oops && moved.length) D.oops.add({ type: 'tidy', moved, made, title: 'tidy sorted ' + moved.length + ' thing' + (moved.length === 1 ? '' : 's') + ' in ' + dir.split('/').pop(), bar: true });
    D.emit('disk'); D.emit('sysfiles');
    return { moved, made };
  };
  T.undo = async function (moved, made, src) {
    src = src || D.fileSource();
    for (const m of moved.slice().reverse()) { try { await src.op({ op: 'move', path: join(m.to, m.name), to: m.from }); } catch (e) { /* moved again since */ } }
    // folders tidy made, if they're empty again
    for (const p of made) { try { const l = await src.list(p); if (!(l.items || []).length) await src.op({ op: 'trash', path: p }); } catch (e) { /* fine */ } }
    D.emit('disk'); D.emit('sysfiles');
  };
  setTimeout(() => { if (D.oops && D.oops.kind) D.oops.kind('tidy', { icon: 'box', undo: (e) => T.undo(e.moved, e.made) }); }, 0);

  D.register({ id: 'tidy', mount(root, ctx) {
    root.classList.add('tidy');
    let dir = (ctx.arg && typeof ctx.arg === 'string' ? ctx.arg : '~/Downloads'), files = [], have = [], plan = null, how = 'kind', last = null;
    root.innerHTML = '<aside class="td-side"><header><canvas class="td-sq" width="44" height="44" aria-hidden="true"></canvas><div><b class="pix">tidy</b><span>Hazel sorts a messy folder.</span></div></header>' +
      '<h3>Which folder?</h3><div class="td-places" data-row></div><form class="td-path"><input data-nav data-key="td:path" aria-label="Or type a folder" placeholder="~/Downloads/school"><button class="b small" data-nav data-key="td:pathgo">Open</button></form>' +
      '<p class="td-safe">' + D.glyph('lock', 1) + ' tidy only moves loose files. It never deletes anything and never touches folders or hidden files. Put it all back undoes everything.</p></aside>' +
      '<main class="td-main"><nav class="td-tabs seg" role="tablist"><button data-nav data-key="td:kind" data-how="kind">By kind</button><button data-nav data-key="td:date" data-how="date">By date</button><button data-nav data-key="td:ask" data-how="ask">Ask</button></nav>' +
      '<form class="td-askf" hidden><input data-nav data-key="td:askin" placeholder="school things by class, photos by trip…" aria-label="How should it sort them?"><button class="b small go" data-nav data-key="td:askgo">Make a plan</button></form>' +
      '<div class="td-plan" aria-live="polite"></div><footer class="td-foot"><span class="td-say"></span><button class="b go" data-nav data-key="td:move">Move</button><button class="b" data-nav data-key="td:back" hidden>Put it all back</button></footer></main>';
    const sq = G.mascot('tidy');
    if (sq) { const g = root.querySelector('.td-sq').getContext('2d'); g.imageSmoothingEnabled = false; const k = 44 / Math.max(sq.width, sq.height); g.drawImage(sq, (44 - sq.width * k) / 2, (44 - sq.height * k) / 2, sq.width * k, sq.height * k); }
    const places = root.querySelector('.td-places');
    PLACES.forEach(([p, n]) => { const b = h('<button class="td-place" data-nav data-key="td:p:' + esc(n) + '" data-p="' + esc(p) + '">' + D.glyph(n === 'Home' ? 'home' : n === 'Desktop' ? 'desktop' : 'library', 2) + '<span>' + esc(n) + '</span><small></small></button>'); b.onclick = () => load(p); places.appendChild(b); });
    root.querySelector('.td-path').onsubmit = (e) => { e.preventDefault(); const v = root.querySelector('.td-path input').value.trim(); if (v) load(v); };
    root.querySelectorAll('[data-how]').forEach((b) => { b.onclick = () => { how = b.dataset.how; root.querySelector('.td-askf').hidden = how !== 'ask'; if (how === 'ask') root.querySelector('.td-askf input').focus(); else make(); }; });
    root.querySelector('.td-askf').onsubmit = async (e) => {
      e.preventDefault();
      const said = root.querySelector('.td-askf input').value.trim();
      if (!said) return;
      say('Hazel is thinking about it…');
      const p = await askBrain(said, files);
      if (!p) { say(D.deuce && D.deuce.mind ? 'Deuce\'s brain isn\'t set up yet (Settings, Deuce), so By kind and By date are what tidy can do for now.' : 'That needs Deuce\'s brain.'); return; }
      plan = p; paint();
    };
    root.querySelector('[data-key="td:move"]').onclick = async () => {
      if (!plan || !count()) return;
      say('Moving…');
      last = await T.apply(dir, plan);
      S.play('select');
      say('Moved ' + last.moved.length + ' thing' + (last.moved.length === 1 ? '' : 's') + ' into ' + plan.folders.length + ' folder' + (plan.folders.length === 1 ? '' : 's') + '.' + (last.moved.length < count() ? ' A few were left where they were (something with the same name was already there).' : ''));
      root.querySelector('[data-key="td:back"]').hidden = false;
      await load(dir, true);
    };
    root.querySelector('[data-key="td:back"]').onclick = async () => {
      if (!last) return;
      await T.undo(last.moved, last.made);
      last = null;
      root.querySelector('[data-key="td:back"]').hidden = true;
      say('Everything is back where it was.');
      await load(dir);
    };
    const count = () => (plan ? plan.folders.reduce((n, f) => n + f.files.length, 0) : 0);
    const say = (t) => { root.querySelector('.td-say').textContent = t; };
    async function load(p, keepSay) {
      dir = p;
      root.querySelectorAll('[data-p]').forEach((b) => b.classList.toggle('on', b.dataset.p === p));
      try {
        const r = await D.fileSource().list(p);
        dir = r.path || p;
        files = (r.items || []).filter((x) => !x.dir && !x.name.startsWith('.'));
        have = (r.items || []).filter((x) => x.dir).map((x) => x.name);
      } catch (e) { files = []; have = []; say(e.message || 'That folder isn\'t there.'); }
      make(keepSay);
    }
    function make(keepSay) {
      if (how === 'ask') return paint(keepSay);
      plan = how === 'date' ? T.byDate(files) : T.byKind(files, have);
      paint(keepSay);
    }
    function paint(keepSay) {
      root.querySelectorAll('[data-how]').forEach((b) => b.setAttribute('aria-selected', b.dataset.how === how));
      const box = root.querySelector('.td-plan');
      box.innerHTML = '';
      if (!files.length) { box.innerHTML = '<p class="td-none">Nothing loose in ' + esc(dir) + ': it\'s tidy already.</p>'; if (!keepSay) say(''); root.querySelector('[data-key="td:move"]').disabled = true; return; }
      if (!plan || !plan.folders.length) { box.innerHTML = '<p class="td-none">' + (how === 'ask' ? 'Say how you\'d like it sorted, and press Make a plan.' : 'No plan yet.') + '</p>'; root.querySelector('[data-key="td:move"]').disabled = true; return; }
      plan.folders.forEach((f) => {
        const c = colourOf(f.name), isNew = !have.includes(f.name);
        const col = h('<section class="td-f" style="--c:' + c + '"><header><b></b><small>' + f.files.length + (isNew ? ', new folder' : ', already there') + '</small></header><ul></ul></section>');
        col.querySelector('b').textContent = f.name;
        f.files.slice(0, 40).forEach((n) => { const li = h('<li></li>'); li.textContent = n; col.querySelector('ul').appendChild(li); });
        if (f.files.length > 40) col.querySelector('ul').appendChild(h('<li class="more">and ' + (f.files.length - 40) + ' more</li>'));
        box.appendChild(col);
      });
      const n = count();
      root.querySelector('[data-key="td:move"]').disabled = !n;
      root.querySelector('[data-key="td:move"]').textContent = 'Move ' + n + ' thing' + (n === 1 ? '' : 's') + ' into ' + plan.folders.length + ' folder' + (plan.folders.length === 1 ? '' : 's');
      if (!keepSay) say(files.length - n > 0 ? (files.length - n) + ' stay where they are.' : '');
    }
    load(dir);
    ctx.legend([]);
    return { unmount() {} };
  } });
})();
