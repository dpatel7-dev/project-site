// Sketch: pixel art, in DiceOS's own style. Draw with the mouse or a finger,
// or move a cursor with the arrows, a controller or a remote and press OK to
// paint. Pencil, fill, eraser and a picker; 32, 48 or 64 pixels across; undo.
// Saved pictures go in Pictures/Sketches (on DiceOS) or your Downloads.
(function () {
  'use strict';
  const D = window.Dice, h = D.h, esc = D.esc;
  const PAL = ['#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179', '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57'];
  const TOOLS = [['pen', 'Pencil'], ['fill', 'Fill'], ['erase', 'Eraser'], ['pick', 'Picker']];
  D.register({ id: 'sketch', mount(root, ctx) {
    const st = D.state.sketch || (D.state.sketch = { n: 32, px: null });
    let n = st.n || 32, px = Array.isArray(st.px) && st.px.length === n * n ? st.px.slice() : new Array(n * n).fill(''), col = 4, tool = 'pen', cur = [Math.floor(n / 2), Math.floor(n / 2)];
    const undo = [];
    root.classList.add('skt');
    root.innerHTML = '<aside class="skt-side"><div class="skt-tools" role="group" aria-label="Tool"></div><div class="skt-pal" role="radiogroup" aria-label="Colour"></div><div class="skt-size" role="group" aria-label="Size"></div>' +
      '<div class="skt-acts"><button class="b small" data-nav data-key="sk:undo">Undo</button><button class="b small" data-nav data-key="sk:clear">Clear</button><button class="b small go" data-nav data-key="sk:save">Save</button></div><p class="muted skt-help"></p></aside><div class="skt-stage"><canvas class="skt-cv" data-nav data-key="sk:cv" data-a="Paint" aria-label="Picture"></canvas></div>';
    const cv = root.querySelector('.skt-cv'), g = cv.getContext('2d'), stage = root.querySelector('.skt-stage');
    const keep = () => { st.n = n; st.px = px; D.save(); };
    function paintUI() {
      root.querySelector('.skt-tools').innerHTML = TOOLS.map(([k, name]) => '<button class="b small' + (k === tool ? ' go' : '') + '" data-nav data-key="sk:t-' + k + '">' + name + '</button>').join('');
      root.querySelector('.skt-pal').innerHTML = PAL.map((c, i) => '<button role="radio" aria-checked="' + (i === col) + '" aria-label="Colour ' + (i + 1) + '" data-nav data-key="sk:c' + i + '" style="--c:' + c + '"></button>').join('');
      root.querySelector('.skt-size').innerHTML = [32, 48, 64].map((s) => '<button class="b small' + (s === n ? ' go' : '') + '" data-nav data-key="sk:s' + s + '">' + s + '</button>').join('');
      root.querySelectorAll('[data-key^="sk:t-"]').forEach((b) => { b.onclick = () => { tool = b.dataset.key.slice(5); paintUI(); }; });
      root.querySelectorAll('[data-key^="sk:c"]').forEach((b) => { b.onclick = () => { col = +b.dataset.key.slice(4); if (tool === 'erase' || tool === 'pick') tool = 'pen'; paintUI(); }; });
      root.querySelectorAll('[data-key^="sk:s"]').forEach((b) => { b.onclick = () => resize(+b.dataset.key.slice(4)); });
      root.querySelector('.skt-help').innerHTML = 'Arrows move the cursor, ' + D.btn('a') + ' paints, ' + D.btn('x') + ' changes tool, ' + D.btn('lb') + D.btn('rb') + ' change colour.';
    }
    function resize(s) {
      if (s === n) return;
      const old = px, on = n; n = s; px = new Array(n * n).fill('');
      for (let y = 0; y < Math.min(on, n); y++) for (let x = 0; x < Math.min(on, n); x++) px[y * n + x] = old[y * on + x];
      cur = [Math.min(cur[0], n - 1), Math.min(cur[1], n - 1)]; keep(); paintUI(); draw();
    }
    function draw() {
      const size = Math.max(n, Math.floor(Math.min(stage.clientWidth - 24, stage.clientHeight - 24) / n) * n) || n * 8, k = size / n;
      cv.width = cv.height = size; cv.style.width = cv.style.height = size + 'px';
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = px[y * n + x] || ((x + y) % 2 ? '#e9e9ee' : '#f6f6f9'); g.fillRect(x * k, y * k, k, k); }
      if (D.input.source !== 'mouse' && D.input.source !== 'touch') { g.strokeStyle = '#111'; g.lineWidth = 2; g.strokeRect(cur[0] * k + 1, cur[1] * k + 1, k - 2, k - 2); g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(cur[0] * k + 3, cur[1] * k + 3, k - 6, k - 6); }
    }
    function snap() { undo.push(px.slice()); if (undo.length > 40) undo.shift(); }
    function apply(x, y, fresh) {
      if (x < 0 || y < 0 || x >= n || y >= n) return;
      const i = y * n + x;
      if (tool === 'pick') { const c = PAL.indexOf(px[i]); if (c >= 0) { col = c; tool = 'pen'; paintUI(); } return; }
      if (fresh) snap();
      if (tool === 'fill') {
        const from = px[i], to = PAL[col];
        if (from === to) return;
        const stack = [[x, y]];
        while (stack.length) { const [a, b] = stack.pop(); if (a < 0 || b < 0 || a >= n || b >= n || px[b * n + a] !== from) continue; px[b * n + a] = to; stack.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]); }
      } else px[i] = tool === 'erase' ? '' : PAL[col];
      draw();
    }
    let down = false;
    const at = (e) => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / r.width * n), Math.floor((e.clientY - r.top) / r.height * n)]; };
    cv.addEventListener('pointerdown', (e) => { down = true; cv.setPointerCapture(e.pointerId); const [x, y] = at(e); cur = [x, y]; apply(x, y, true); });
    cv.addEventListener('pointermove', (e) => { if (!down || tool === 'fill' || tool === 'pick') return; const [x, y] = at(e); apply(x, y, false); });
    cv.addEventListener('pointerup', () => { down = false; keep(); });
    root.querySelector('[data-key="sk:undo"]').onclick = () => { if (undo.length) { px = undo.pop(); keep(); draw(); } };
    root.querySelector('[data-key="sk:clear"]').onclick = () => { snap(); px = new Array(n * n).fill(''); keep(); draw(); };
    root.querySelector('[data-key="sk:save"]').onclick = async () => {
      const k = Math.max(8, Math.floor(512 / n)), out = D.G.canvas(n * k, n * k), og = out.getContext('2d');
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (px[y * n + x]) { og.fillStyle = px[y * n + x]; og.fillRect(x * k, y * k, k, k); }
      const name = 'Sketch ' + new Date().toISOString().slice(0, 16).replace('T', ' at ').replace(':', '.') + '.png';
      const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
      if (D.sys && !D.sys.info.emulated) {
        await D.sys.post('/api/files', { op: 'mkdir', path: '~/Pictures/Sketches' });
        const r = await D.sys.upload('~/Pictures/Sketches/' + name, blob);
        D.toast({ icon: 'copy', c: '#ef7d57', title: r && r.ok !== false ? 'Saved' : 'Not saved', text: r && r.ok !== false ? 'In Pictures, Sketches.' : (r && r.error) || '' });
      } else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
        D.toast({ icon: 'copy', c: '#ef7d57', title: 'Saved', text: 'Look in your Downloads.' });
      }
    };
    paintUI(); requestAnimationFrame(draw);
    if (ctx.mode === 'run') setTimeout(() => D.nav.focus(cv), 40);
    ctx.legend([['a', 'Paint'], ['x', 'Tool'], ['lb', 'Colour'], ['b', 'Back']]);
    return {
      resize: draw,
      onAction(a) {
        const onCanvas = D.nav.el === cv;
        if (a === 'b' && onCanvas) { D.nav.focus(root.querySelector('[data-key="sk:t-' + tool + '"]')); return true; }
        if (a === 'x') { const i = TOOLS.findIndex((t) => t[0] === tool); tool = TOOLS[(i + 1) % TOOLS.length][0]; paintUI(); draw(); return true; }
        if (a === 'lb' || a === 'rb') { col = (col + (a === 'rb' ? 1 : -1) + PAL.length) % PAL.length; if (tool !== 'fill') tool = 'pen'; paintUI(); return true; }
        if (!onCanvas) return false;
        const mv = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[a];
        if (mv) { cur = [Math.max(0, Math.min(n - 1, cur[0] + mv[0])), Math.max(0, Math.min(n - 1, cur[1] + mv[1]))]; if (down) apply(cur[0], cur[1], false); else draw(); return true; }
        if (a === 'a') { apply(cur[0], cur[1], true); keep(); return true; }
        return false;
      },
    };
  } });
})();
