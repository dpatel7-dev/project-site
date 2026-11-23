// Files: your folders. On a computer running Dice, your real home folder and any
// USB stick you plug in. In a browser, DiceWeb's pretend disk (the same one
// Terminal and Notes use).
(function () {
  'use strict';
  const D = window.Dice, L = D.L, esc = D.esc, h = D.h;
  const KIND = [[/\.(png|jpe?g|gif|webp|bmp|svg)$/i, 'Picture', '#f6a6b8'], [/\.(mp3|m4a|wav|ogg|flac|aac|opus)$/i, 'Song', '#d39cf5'], [/\.(mp4|mkv|webm|mov)$/i, 'Video', '#ff7a59'],
    [/\.(txt|md|json|js|py|sh|html|css|csv|log|conf|cfg|ini|yaml|yml)$/i, 'Text', '#8fd16a'], [/\.(zip|tar|gz|xz|7z)$/i, 'Archive', '#f5c431'], [/\.pdf$/i, 'PDF', '#ef6a1f']];
  const kindOf = (name, dir) => (dir ? ['Folder', '#7cc4ff'] : (KIND.find(([re]) => re.test(name)) || [null, 'File', '#96969f']).slice(1));
  const size = (n) => (n < 1024 ? n + ' bytes' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB');

  // the same few things, for the real disk and the pretend one
  function source() {
    if (D.sys && !D.sys.info.emulated) {
      return {
        real: true,
        list: (p) => D.sys.get('/api/files?path=' + encodeURIComponent(p)).then((r) => (r.error ? Promise.reject(new Error(r.error)) : r)),
        op: (b) => D.sys.post('/api/files', b).then((r) => (r.ok ? r : Promise.reject(new Error(r.error || 'That didn\'t work.')))),
        read: (p) => D.sys.blob(p),
        upload: (p, f) => D.sys.upload(p, f).then((r) => (r.ok ? r : Promise.reject(new Error(r.error || 'Couldn\'t add it.')))),
      };
    }
    const home = D.home();
    const real = (p) => L.resolve(home, p.replace(/^~/, home), home);
    const show = (p) => (p === home || p.startsWith(home + '/') ? '~' + p.slice(home.length) : p);
    const fail = (e) => (e ? Promise.reject(new Error(e)) : (D.save(), D.emit('disk'), Promise.resolve({ ok: true })));
    return {
      real: false,
      list: (p) => {
        const r = real(p), node = L.walk(D.state.disk, r);
        if (!node || node.type !== 'dir') return Promise.reject(new Error('That folder isn\'t there.'));
        const items = Object.keys(node.kids).map((n) => ({ name: n, dir: node.kids[n].type === 'dir', size: node.kids[n].type === 'dir' ? 0 : node.kids[n].text.length, mtime: Math.round((node.kids[n].t || Date.now()) / 1000) }))
          .sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
        return Promise.resolve({ path: show(r), real: r, home, items, drives: [] });
      },
      op: (b) => {
        const p = real(b.path);
        if (b.op === 'mkdir') return fail(L.makeDir(D.state.disk, p));
        if (b.op === 'trash') return fail(p === home ? 'Not your whole home folder.' : L.remove(D.state.disk, p, true));
        if (b.op === 'text') return fail(L.writeFile(D.state.disk, p, b.text));
        if (b.op === 'rename') {
          const parent = L.walk(D.state.disk, p.replace(/\/[^/]+$/, '') || '/'), name = p.split('/').pop();
          if (!b.to || /\//.test(b.to)) return fail('That name won\'t work.');
          if (parent.kids[b.to]) return fail('Something called ' + b.to + ' is already there.');
          parent.kids[b.to] = parent.kids[name]; delete parent.kids[name];
          return fail(null);
        }
        return fail('Can\'t do that here.');
      },
      read: (p) => { const n = L.walk(D.state.disk, real(p)); return n ? Promise.resolve(new Blob([n.text], { type: 'text/plain' })) : Promise.reject(new Error('It\'s gone.')); },
      upload: (p, f) => f.text().then((t) => fail(L.writeFile(D.state.disk, real(p), t))),
    };
  }

  D.register({ id: 'files', mount(root, ctx) {
    const fs = source();
    root.classList.add('files');
    root.innerHTML = '<aside class="fi-side"><h2 class="pix">Files</h2><nav class="fi-places"></nav></aside>' +
      '<section class="fi-main"><header class="fi-bar"><div class="fi-crumbs"></div><div class="fi-tools">' +
      '<button class="b small" data-nav data-key="fi:new">' + D.glyph('plus', 2) + 'New folder</button>' +
      '<label class="b small" data-nav data-key="fi:add" tabindex="0">' + D.glyph('copy', 2) + 'Add files<input type="file" multiple hidden></label></div></header>' +
      '<div class="fi-list" role="list" data-scroll="20"></div><footer class="fi-foot muted"></footer></section>';
    const places = root.querySelector('.fi-places'), list = root.querySelector('.fi-list'), crumbs = root.querySelector('.fi-crumbs'), foot = root.querySelector('.fi-foot');
    let cur = '~', data = null;
    function placesFor(d) {
      const base = [['~', 'Home', 'home', '#ff707a']];
      ['Documents', 'Downloads', 'Music', 'Pictures', 'notes'].forEach((n) => { if (d && d.path === '~' && d.items.some((i) => i.dir && i.name === n)) base.push(['~/' + n, n === 'notes' ? 'Notes' : n, n === 'Music' ? 'music' : 'library', '#7cc4ff']); });
      places.innerHTML = '';
      base.concat((d && d.drives || []).map((x) => [x.path, x.name, 'lock', '#f5c431'])).forEach(([p, n, ic, c]) => {
        const b = h('<button class="mi" data-nav data-key="fi:p:' + esc(p) + '">' + D.icon(ic, c, 2) + esc(n) + '</button>');
        b.classList.toggle('here', p === cur);
        b.onclick = () => go(p);
        places.appendChild(b);
      });
      if (!fs.real) places.appendChild(h('<p class="muted" style="font-size:.85rem;margin:14px 12px">This is DiceWeb\'s pretend disk. On a computer running Dice, these are your real files.</p>'));
    }
    function go(p) {
      cur = p;
      list.innerHTML = '<p class="muted" style="padding:20px">Opening…</p>';
      fs.list(p).then((d) => { data = d; cur = d.path; draw(); }).catch((e) => { list.innerHTML = '<p class="muted" style="padding:20px">' + esc(e.message) + '</p>'; });
    }
    function draw() {
      const d = data;
      placesFor(d);
      const parts = d.path === '~' ? ['~'] : d.path.split('/').filter(Boolean);
      crumbs.innerHTML = '';
      let acc = d.path.startsWith('~') ? '' : '';
      parts.forEach((part, i) => {
        acc = i === 0 ? (part === '~' ? '~' : '/' + part) : acc + '/' + part;
        const target = acc;
        const b = h('<button class="crumb" data-nav data-key="fi:c:' + esc(target) + '">' + esc(part === '~' ? 'Home' : part) + '</button>');
        b.onclick = () => go(target);
        crumbs.appendChild(b);
        if (i < parts.length - 1) crumbs.appendChild(h('<span class="sep">/</span>'));
      });
      list.innerHTML = '';
      if (!d.items.length) list.innerHTML = '<p class="muted" style="padding:20px">This folder is empty. Add files, or drop them here.</p>';
      d.items.forEach((it, i) => {
        const [kind, c] = kindOf(it.name, it.dir);
        const row = h('<button class="fi-row" role="listitem" data-nav data-key="fi:i:' + esc(it.name) + '" data-a="Open" data-x="More"><span class="fi-ico" style="--fc:' + c + '">' + (it.dir ? D.glyph('library', 2) : esc(kind.slice(0, 3))) + '</span><b>' + esc(it.name) + '</b><span class="muted">' + esc(kind) + '</span><span class="muted">' + (it.dir ? '' : size(it.size)) + '</span><span class="muted">' + D.ago(it.mtime * 1000) + '</span></button>');
        if (!i) row.setAttribute('data-first', '');
        row.onclick = () => open(it);
        row._x = () => more(it);
        row.addEventListener('contextmenu', (e) => { e.preventDefault(); more(it); });
        list.appendChild(row);
      });
      foot.textContent = d.items.length + (d.items.length === 1 ? ' thing' : ' things') + (fs.real ? '' : ' (pretend disk)');
      ctx.setTitle((d.path === '~' ? 'Home' : d.path.split('/').pop()) + ' – Files');
    }
    const join = (name) => (cur.endsWith('/') ? cur : cur + '/') + name;
    function open(it) {
      const p = join(it.name);
      if (it.dir) return go(p);
      const [kind] = kindOf(it.name, false);
      fs.read(p).then((blob) => {
        if (kind === 'Song' && D.M) { const f = new File([blob], it.name, { type: blob.type || 'audio/mpeg' }); D.M.add([f]).then(() => { const i = D.M.songs.findIndex((s) => s.name === it.name.replace(/\.[^.]+$/, '')); D.M.play('song', i >= 0 ? i : D.M.songs.length - 1); }); return; }
        if (kind === 'Picture' || kind === 'Text' || kind === 'PDF' || kind === 'Video') return preview(it, blob, kind);
        download(it.name, blob);
      }).catch((e) => D.toast({ icon: 'help', title: 'Couldn\'t open it', text: e.message }));
    }
    function download(name, blob) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    function preview(it, blob, kind) {
      const box = h('<div class="fi-preview"><header><b>' + esc(it.name) + '</b><button class="b small" data-nav data-key="fi:pv:close">Close</button></header><div class="fi-pv"></div></div>');
      const pv = box.querySelector('.fi-pv');
      const url = URL.createObjectURL(blob);
      if (kind === 'Picture') pv.innerHTML = '<img alt="" src="' + url + '">';
      else if (kind === 'Video') pv.innerHTML = '<video controls src="' + url + '"></video>';
      else if (kind === 'PDF') pv.innerHTML = '<iframe title="PDF" src="' + url + '"></iframe>';
      else blob.text().then((t) => { pv.innerHTML = '<pre></pre>'; pv.querySelector('pre').textContent = t.slice(0, 200000); });
      const close = () => { box.remove(); URL.revokeObjectURL(url); };
      box.querySelector('button').onclick = close;
      box._close = close;
      root.appendChild(box);
      D.nav.focus(box.querySelector('button'));
    }
    function more(it) {
      D.ask({ title: it.name, text: it.dir ? 'A folder.' : kindOf(it.name, false)[0] + ', ' + size(it.size) + '.', buttons: [{ label: 'Rename', value: 'rename', go: true }, ...(it.dir ? [] : [{ label: 'Download', value: 'download' }]), { label: 'Move to Trash', value: 'trash', danger: true }, { label: 'Cancel', value: null }] })
        .then((v) => {
          if (v === 'rename') D.ask({ title: 'Rename "' + it.name + '"', input: { value: it.name, label: 'New name' }, buttons: [{ label: 'Rename', value: true, go: true }, { label: 'Cancel', value: false }] })
            .then((r) => { if (r && r.value && r.value !== it.name) fs.op({ op: 'rename', path: join(it.name), to: r.value.trim() }).then(() => go(cur), err); });
          if (v === 'download') fs.read(join(it.name)).then((b) => download(it.name, b), err);
          if (v === 'trash') fs.op({ op: 'trash', path: join(it.name) }).then(() => { D.toast({ icon: 'trash', c: '#96969f', title: 'In the Trash', text: it.name + (fs.real ? ' is in ~/.local/share/Trash.' : ' is gone.') }); go(cur); }, err);
        });
    }
    const err = (e) => D.toast({ icon: 'help', c: '#ff4d5e', title: 'That didn\'t work', text: e.message });
    root.querySelector('[data-key="fi:new"]').onclick = () => D.ask({ title: 'New folder', input: { value: '', label: 'Folder name' }, buttons: [{ label: 'Make it', value: true, go: true }, { label: 'Cancel', value: false }] })
      .then((r) => { if (r && r.value && r.value.trim()) fs.op({ op: 'mkdir', path: join(r.value.trim()) }).then(() => go(cur), err); });
    const input = root.querySelector('input[type=file]');
    root.querySelector('[data-key="fi:add"]').addEventListener('click', (e) => { if (e.target !== input) { e.preventDefault(); input.click(); } });
    const upload = (files) => Promise.all([...files].map((f) => fs.upload(join(f.name), f))).then(() => { D.toast({ icon: 'copy', c: '#4fc16b', title: 'Added', text: files.length + (files.length === 1 ? ' file' : ' files') + ' to ' + (cur === '~' ? 'Home' : cur) }); go(cur); }, err);
    input.onchange = () => { if (input.files.length) upload(input.files); input.value = ''; };
    root.addEventListener('dragover', (e) => { e.preventDefault(); root.classList.add('drop'); });
    root.addEventListener('dragleave', () => root.classList.remove('drop'));
    root.addEventListener('drop', (e) => { e.preventDefault(); root.classList.remove('drop'); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); });
    const off = D.on('disk', () => { if (!fs.real) go(cur); });
    go(ctx.arg || '~');
    ctx.legend([['a', 'Open'], ['x', 'More'], ['b', 'Home']]);
    return {
      onAction(a) {
        const pv = root.querySelector('.fi-preview');
        if (a === 'b' && pv) { pv._close(); return true; }
        if (a === 'b' && cur !== '~' && data && data.path !== '~') { const up = cur.replace(/\/[^/]+$/, '') || '/'; go(up === '' ? '~' : up); D.S.play('back'); return true; }
        return false;
      },
      unmount() { off(); },
    };
  } });
})();
