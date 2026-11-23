// Axiom: Dhruv's planner for school, built into DiceWeb (it takes the
// Calendar's place, and keeps whatever was on the Calendar).
// Classes with their own colours, tasks by class, a Today page that sorts
// out what's overdue, due today, due this week and which tests are coming,
// a month calendar with a dot per class, notes linked to a class, and a
// reminder when a task with a time comes due. Two looks, as in Axiom:
// Dawn (Mt. Fuji at sunrise) and Calm (a quiet green field).
// Everything is kept in this browser (on Dice, on the computer).
(function () {
  'use strict';
  const D = window.Dice, G = window.DiceGfx, L = D.L, h = D.h, esc = D.esc;
  const TYPES = [['homework', 'Homework'], ['essay', 'Essay'], ['test', 'Test'], ['quiz', 'Quiz'], ['project', 'Project'], ['lab', 'Lab'], ['study', 'Study'], ['event', 'Event']];
  const TYPE = Object.fromEntries(TYPES);
  const SWATCH = ['#f0945a', '#d4a857', '#8fb67c', '#6fa8c9', '#9b8ad8', '#d47a9a', '#c05a3e', '#8a9aa8'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const two = (n) => String(n).padStart(2, '0');
  function data() {
    const a = D.state.axiom || (D.state.axiom = { classes: [], tasks: [], notes: [], theme: 'dawn' });
    ['classes', 'tasks', 'notes'].forEach((k) => { if (!Array.isArray(a[k])) a[k] = []; });
    if (!a.migrated) { a.tasks.push(...L.eventsToTasks(D.state.events)); a.migrated = true; }
    return a;
  }
  const nice = (key, o) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString([], o || { weekday: 'short', month: 'short', day: 'numeric' }); };
  const time12 = (t) => { if (!t) return ''; const [hh, mm] = t.split(':').map(Number); return (hh % 12 || 12) + ':' + two(mm) + (hh < 12 ? ' am' : ' pm'); };

  // a reminder when a task with a time comes due (while DiceWeb is open)
  setInterval(() => {
    const a = D.state && D.state.axiom;
    if (!a || !a.tasks) return;
    const now = new Date(), key = L.dayKey(now), hm = two(now.getHours()) + ':' + two(now.getMinutes());
    a.tasks.forEach((t) => {
      if (t.done || !t.time || t.due !== key || t.time > hm || t.rang) return;
      t.rang = true;
      const c = a.classes.find((x) => x.id === t.classId);
      D.toast({ icon: 'bell', c: c ? c.color : '#d4a857', title: t.title, text: (c ? c.name + ': ' : '') + (TYPE[t.type] || 'Task') + ', due now.' });
      D.save();
    });
  }, 15000);

  // ---- the backdrop: Mt. Fuji at dawn, in pixels ---------------------------------------------
  function fuji(W, H, night) {
    const c = G.canvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    const rgb = (hx) => [parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16)];
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const set = (x, y, col) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
    const sky = night ? ['#0b1026', '#232a52', '#4a3f6b'] : ['#2b3a6a', '#c88a94', '#ffcf94'];
    const hz = Math.round(H * 0.78);
    for (let y = 0; y < H; y++) { const t = Math.min(1, y / hz), col = t < 0.55 ? mix(rgb(sky[0]), rgb(sky[1]), t / 0.55) : mix(rgb(sky[1]), rgb(sky[2]), (t - 0.55) / 0.45); for (let x = 0; x < W; x++) set(x, y, col); }
    // the sun coming up on the left, with its glow
    const sx = Math.round(W * 0.2), sy = Math.round(H * 0.7), sr = Math.max(3, Math.round(H * 0.05));
    for (let y = -sr * 5; y <= sr * 5; y++) for (let x = -sr * 5; x <= sr * 5; x++) {
      const dd = Math.hypot(x, y), i = ((sy + y) * W + sx + x) * 4;
      if (sy + y < 0 || sy + y >= H || sx + x < 0 || sx + x >= W) continue;
      const a = dd <= sr ? 1 : Math.pow(Math.max(0, 1 - (dd - sr) / (sr * 4)), 2.2) * (night ? 0.15 : 0.5);
      const col = dd <= sr ? (night ? rgb('#efe9d2') : rgb('#fff0c4')) : night ? rgb('#c9d4ff') : rgb('#ffd9a0');
      d[i] = d[i] + (col[0] - d[i]) * a; d[i + 1] = d[i + 1] + (col[1] - d[i + 1]) * a; d[i + 2] = d[i + 2] + (col[2] - d[i + 2]) * a;
    }
    // the mountain: a wide cone with a flat top, snow on its shoulders
    const cx = Math.round(W * 0.6), peak = Math.round(H * 0.28), base = Math.round(H * 0.8), half = W * 0.46, top = W * 0.035;
    const body = night ? rgb('#2a2c4a') : rgb('#5b4f78'), shade = night ? rgb('#1f2140') : rgb('#4a4068'), snow = night ? rgb('#b9c0dc') : rgb('#fff1ea'), snowS = night ? rgb('#8e96b8') : rgb('#d9c9d8');
    const wob = (x) => Math.sin(x * 0.37) * 1.4 + Math.sin(x * 0.91 + 1) * 0.9 + Math.sin(x * 2.3) * 0.5;
    for (let y = peak; y < H; y++) {
      const t = (y - peak) / (base - peak), w = top + (half - top) * Math.pow(Math.max(0, t), 0.82);
      for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) {
        const lit = x < cx + (y - peak) * 0.2, snowLine = peak + (base - peak) * (0.34 + 0.06 * Math.sin(x * 0.21)) + wob(x) * 2;
        let col = lit ? body : shade;
        if (y < snowLine || (y < snowLine + (base - peak) * 0.16 && ((x * 7) % 11 < 2) && Math.abs(x - cx) < w * 0.8)) col = lit ? snow : snowS;
        set(x, y, col);
      }
    }
    // soft clouds round the mountain's foot: puffs, lit from below by the dawn
    const cloud = night ? rgb('#3d4470') : rgb('#f6cdb8'), cloudS = night ? rgb('#2c3258') : rgb('#d9a8a8');
    for (let i = 0; i < W / 9; i++) {
      const px = (i * 9 + Math.sin(i * 7.1) * 6), py = H * 0.735 + Math.sin(i * 1.7) * H * 0.012, r = H * (0.018 + 0.012 * Math.abs(Math.sin(i * 2.3)));
      for (let y = Math.floor(py - r); y <= py + r * 0.6; y++) for (let x = Math.floor(px - r * 1.8); x <= px + r * 1.8; x++) if (Math.hypot((x - px) / 1.8, y - py) <= r) set(x, y, y > py ? cloudS : cloud);
    }
    // the lake: the mountain upside down, darker, with a few bright ripples
    const ly = Math.round(H * 0.8), lake = night ? rgb('#141a36') : rgb('#6e7096');
    for (let y = ly; y < H; y++) for (let x = 0; x < W; x++) {
      const sy2 = ly - (y - ly) - 1, i = (Math.max(0, sy2) * W + x) * 4, src = [d[i], d[i + 1], d[i + 2]];
      set(x, y, mix(lake, src, 0.42 - (y - ly) / (H - ly) * 0.25));
      if ((y - ly) % 5 === 2 && Math.sin(x * 0.7 + y) > 0.985) set(x, y, mix(lake, rgb(sky[2]), 0.6));
    }
    // dark pines along the near shore, each one a little tree
    const pine = night ? rgb('#0a0d1e') : rgb('#2b2540');
    for (let i = 0, x = 0; x < W; i++) {
      const tall = Math.round(H * (0.05 + 0.06 * Math.abs(Math.sin(i * 1.93) * Math.cos(i * 0.71)))), wid = Math.max(3, Math.round(tall * 0.42));
      for (let k = 0; k < tall; k++) { const half = Math.round((k / tall) * wid / 2 + (k % 3 === 0 ? 1 : 0)); for (let dx = -half; dx <= half; dx++) set(x + dx, H - tall + k, pine); }
      x += Math.max(2, Math.round(wid * (0.55 + 0.4 * Math.abs(Math.sin(i * 3.1)))));
    }
    for (let x = 0; x < W; x++) set(x, H - 1, pine);
    g.putImageData(img, 0, 0);
    return c;
  }

  D.register({ id: 'calendar', mount(root, ctx) {
    const A = data();
    root.classList.add('ax');
    root.innerHTML = '<canvas class="ax-bg" aria-hidden="true"></canvas><div class="ax-veil"></div>' +
      '<nav class="ax-side" aria-label="Axiom"><div class="ax-brand"></div>' +
      [['today', 'Today'], ['tasks', 'Tasks'], ['classes', 'Classes'], ['calendar', 'Calendar'], ['notes', 'Notes']].map(([k, n]) => '<button class="ax-tab" data-nav data-key="ax:' + k + '" data-v="' + k + '">' + n + '</button>').join('') +
      '<div class="ax-look" role="group" aria-label="Look"><button data-nav data-key="ax:dawn" data-th="dawn">Dawn</button><button data-nav data-key="ax:calm" data-th="calm">Calm</button></div></nav>' +
      '<main class="ax-main"></main>';
    root.querySelector('.ax-brand').append(G.appIconEl('calendar', 30), h('<b>Axiom</b>'));
    const main = root.querySelector('.ax-main'), bg = root.querySelector('.ax-bg'), bgg = bg.getContext('2d');
    let view = 'today', taskFilter = 'open', classFilter = '', calY = new Date().getFullYear(), calM = new Date().getMonth(), calPick = L.dayKey(new Date()), noteId = null, adding = false;
    let scene = null, sceneKey = '';
    const save = () => D.save();
    const cls = (id) => A.classes.find((c) => c.id === id);
    const today = () => L.dayKey(new Date());

    // ---- bits used everywhere ----
    function chip(c) { return c ? '<i class="ax-chip" style="--c:' + c.color + '">' + esc(c.name) + '</i>' : ''; }
    function taskRow(t) {
      const c = cls(t.classId), late = !t.done && t.due && t.due < today();
      const when = t.due ? (t.due === today() ? 'Today' : nice(t.due)) + (t.time ? ', ' + time12(t.time) : '') : '';
      const row = h('<div class="ax-task' + (t.done ? ' done' : '') + (late ? ' late' : '') + '" style="--c:' + (c ? c.color : 'var(--ax-gold)') + '">' +
        '<button class="ax-check" data-nav data-key="ax:c-' + t.id + '" role="checkbox" aria-checked="' + !!t.done + '" aria-label="Done: ' + esc(t.title) + '"></button>' +
        '<div class="ax-tt"><b>' + esc(t.title) + '</b><span class="ax-meta">' + chip(c) + '<i class="ax-type">' + esc(TYPE[t.type] || 'Task') + '</i>' + (when ? '<span class="ax-when">' + esc(when) + '</span>' : '') + '</span></div>' +
        '<button class="ax-del" data-nav data-key="ax:d-' + t.id + '" aria-label="Delete ' + esc(t.title) + '">' + D.glyph('trash', 1) + '</button></div>');
      row.querySelector('.ax-check').onclick = () => { t.done = !t.done; t.doneAt = t.done ? today() : null; if (t.done) D.S.play('select'); save(); render(); };
      row.querySelector('.ax-del').onclick = () => { A.tasks = A.tasks.filter((x) => x !== t); save(); render(); };
      return row;
    }
    function taskForm(preset) {
      preset = preset || {};
      const f = h('<form class="ax-form"><input data-nav data-key="ax:ft" name="title" placeholder="What needs doing?" aria-label="Task" maxlength="120" required>' +
        '<select data-nav data-key="ax:fc" name="cls" aria-label="Class"><option value="">No class</option>' + A.classes.map((c) => '<option value="' + c.id + '"' + (c.id === preset.classId ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select>' +
        '<select data-nav data-key="ax:fy" name="type" aria-label="Kind">' + TYPES.map(([k, n]) => '<option value="' + k + '"' + (k === (preset.type || 'homework') ? ' selected' : '') + '>' + n + '</option>').join('') + '</select>' +
        '<input data-nav data-key="ax:fd" type="date" name="due" aria-label="Due" value="' + (preset.due || L.addDays(today(), 1)) + '">' +
        '<input data-nav data-key="ax:fm" type="time" name="time" aria-label="Time (optional, for a reminder)">' +
        '<button class="ax-btn gold" data-nav data-key="ax:fadd">Add</button></form>');
      f.onsubmit = (e) => {
        e.preventDefault();
        const v = (n) => f.elements[n].value;
        if (!v('title').trim()) return;
        A.tasks.push({ id: uid(), title: v('title').trim(), classId: v('cls') || null, type: v('type'), due: v('due') || today(), time: v('time') || '', done: false });
        save(); D.S.play('select'); adding = false; render();
      };
      return f;
    }
    function list(tasks, empty) {
      const box = h('<div class="ax-list"></div>');
      if (!tasks.length) box.innerHTML = '<p class="ax-empty">' + esc(empty) + '</p>';
      tasks.forEach((t) => box.appendChild(taskRow(t)));
      return box;
    }

    // ---- the pages ----
    function pageToday() {
      const b = L.planBuckets(A.tasks, today()), hr = new Date().getHours(), name = D.state.name && D.state.name !== 'player' ? ', ' + D.state.name : '';
      const doneToday = A.tasks.filter((t) => t.doneAt === today()).length, total = doneToday + b.today.length;
      main.innerHTML = '<header class="ax-hero"><h1>' + (hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') + esc(name) + '.</h1><p>Here\'s where things stand.</p>' +
        '<div class="ax-stat"><b>' + doneToday + '</b><span>of ' + total + ' done today</span></div></header><div class="ax-quick"></div><div class="ax-cols"></div>';
      const q = main.querySelector('.ax-quick');
      if (adding) q.appendChild(taskForm({ due: today() }));
      else {
        const add = h('<button class="ax-btn gold" data-nav data-key="ax:quick">+ Quick task</button>'); add.onclick = () => { adding = true; render(); setTimeout(() => main.querySelector('.ax-form input').focus(), 0); };
        const cl = h('<button class="ax-btn" data-nav data-key="ax:qclass">+ Class</button>'); cl.onclick = () => { view = 'classes'; adding = true; render(); };
        q.append(add, cl);
      }
      const cols = main.querySelector('.ax-cols');
      [['Overdue', b.overdue, 'Nothing overdue.', 'late'], ['Due today', b.today, 'Nothing due today.'], ['This week', b.week, 'A clear week.'], ['Tests and quizzes', b.tests, 'No tests coming up.']].forEach(([t, arr, empty, cl]) => {
        const s = h('<section class="ax-card' + (cl ? ' ' + cl : '') + '"><h3>' + t + '<span>' + arr.length + '</span></h3></section>');
        s.appendChild(list(arr.slice(0, 6), empty));
        if (arr.length > 6) { const more = h('<button class="ax-link" data-nav>See all ' + arr.length + '</button>'); more.onclick = () => { view = 'tasks'; taskFilter = t === 'Overdue' ? 'overdue' : t === 'Due today' ? 'today' : t === 'This week' ? 'week' : 'tests'; render(); }; s.appendChild(more); }
        cols.appendChild(s);
      });
    }
    function pageTasks() {
      const b = L.planBuckets(A.tasks, today());
      const F = { all: ['All', () => A.tasks], open: ['Open', () => A.tasks.filter((t) => !t.done)], done: ['Done', () => A.tasks.filter((t) => t.done)], overdue: ['Overdue', () => b.overdue], today: ['Today', () => b.today], week: ['This week', () => b.week], tests: ['Tests and quizzes', () => b.tests] };
      main.innerHTML = '<header class="ax-head"><h1>Tasks</h1><p>What needs doing.</p></header><div class="ax-filters" role="group" aria-label="Show"></div>';
      const fl = main.querySelector('.ax-filters');
      Object.entries(F).forEach(([k, [n]]) => { const p = h('<button class="ax-pill" data-nav data-key="ax:f-' + k + '" aria-pressed="' + (k === taskFilter) + '">' + n + '</button>'); p.onclick = () => { taskFilter = k; render(); }; fl.appendChild(p); });
      const sel = h('<select class="ax-pill" data-nav data-key="ax:fclass" aria-label="Class"><option value="">All classes</option>' + A.classes.map((c) => '<option value="' + c.id + '"' + (c.id === classFilter ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select>');
      sel.onchange = () => { classFilter = sel.value; render(); };
      fl.appendChild(sel);
      main.appendChild(taskForm({ classId: classFilter || null }));
      let tasks = F[taskFilter][1]();
      if (classFilter) tasks = tasks.filter((t) => t.classId === classFilter);
      tasks = tasks.slice().sort((a, b2) => (a.done - b2.done) || ((a.due || '9') + (a.time || '99')).localeCompare((b2.due || '9') + (b2.time || '99')));
      main.appendChild(list(tasks, A.tasks.length ? 'Nothing here.' : 'No tasks yet. Add one above.'));
    }
    function pageClasses() {
      main.innerHTML = '<header class="ax-head"><h1>Classes</h1><p>Each one keeps its own colour, teacher and tasks.</p></header>';
      let colour = SWATCH[A.classes.length % SWATCH.length];
      const f = h('<form class="ax-form ax-classform"><input data-nav data-key="ax:cn" name="name" placeholder="Class, like Period 4 Math" aria-label="Class name" maxlength="60" required><input data-nav data-key="ax:ct" name="teacher" placeholder="Teacher (optional)" aria-label="Teacher" maxlength="60">' +
        '<div class="ax-swatches" role="radiogroup" aria-label="Colour">' + SWATCH.map((c, i) => '<button type="button" role="radio" data-nav data-key="ax:sw' + i + '" aria-checked="' + (c === colour) + '" aria-label="Colour ' + (i + 1) + '" style="--c:' + c + '"></button>').join('') + '</div>' +
        '<button class="ax-btn gold" data-nav data-key="ax:cadd">Add class</button></form>');
      f.querySelectorAll('[role=radio]').forEach((b, i) => { b.onclick = () => { colour = SWATCH[i]; f.querySelectorAll('[role=radio]').forEach((x, j) => x.setAttribute('aria-checked', String(j === i))); }; });
      f.onsubmit = (e) => { e.preventDefault(); const n = f.elements.name.value.trim(); if (!n) return; A.classes.push({ id: uid(), name: n, teacher: f.elements.teacher.value.trim(), color: colour }); save(); adding = false; render(); };
      main.appendChild(f);
      const grid = h('<div class="ax-classes"></div>');
      if (!A.classes.length) grid.innerHTML = '<p class="ax-empty">Add your first class above. Tasks and notes can then belong to it.</p>';
      A.classes.forEach((c) => {
        const open = A.tasks.filter((t) => t.classId === c.id && !t.done).length;
        const card = h('<div class="ax-class" style="--c:' + c.color + '"><button class="ax-classgo" data-nav data-key="ax:cl-' + c.id + '"><b>' + esc(c.name) + '</b><span>' + esc(c.teacher || 'No teacher set') + '</span><em>' + open + ' open task' + (open === 1 ? '' : 's') + '</em></button><button class="ax-link small" data-nav data-key="ax:cr-' + c.id + '">Remove</button></div>');
        card.querySelector('.ax-classgo').onclick = () => { view = 'tasks'; classFilter = c.id; taskFilter = 'open'; render(); };
        const rm = card.querySelector('.ax-link');
        rm.onclick = () => {
          if (rm.dataset.sure) { A.classes = A.classes.filter((x) => x !== c); A.tasks.forEach((t) => { if (t.classId === c.id) t.classId = null; }); A.notes.forEach((n) => { if (n.classId === c.id) n.classId = null; }); save(); render(); return; }
          rm.dataset.sure = '1'; rm.textContent = 'Remove ' + c.name + '? Its tasks stay.';
        };
        grid.appendChild(card);
      });
      main.appendChild(grid);
      if (adding) setTimeout(() => f.elements.name.focus(), 0);
    }
    function pageCalendar() {
      main.innerHTML = '<header class="ax-head row"><h1></h1><span class="ax-nav"><button class="ax-btn" data-nav data-key="ax:prev" aria-label="Last month">‹</button><button class="ax-btn" data-nav data-key="ax:now">Today</button><button class="ax-btn" data-nav data-key="ax:next" aria-label="Next month">›</button></span></header>' +
        '<div class="ax-cal"><div class="ax-month"><div class="ax-days">' + DAYS.map((d) => '<span>' + d + '</span>').join('') + '</div><div class="ax-grid" role="grid"></div></div><aside class="ax-day"></aside></div>';
      main.querySelector('h1').textContent = new Date(calY, calM, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
      const grid = main.querySelector('.ax-grid'), tk = today();
      L.monthGrid(calY, calM).forEach((c) => {
        const due = A.tasks.filter((t) => t.due === c.key);
        const dots = due.slice(0, 4).map((t) => '<b style="--c:' + ((cls(t.classId) || {}).color || '#d4a857') + '"' + (t.done ? ' class="d"' : '') + '></b>').join('');
        const b = h('<button role="gridcell" data-nav data-key="ax:' + c.key + '" class="' + (c.inMonth ? '' : 'out ') + (c.key === tk ? 'today ' : '') + (c.key === calPick ? 'on' : '') + '"><span>' + c.d + '</span>' + (dots ? '<i class="ax-dots">' + dots + '</i>' : '') + '</button>');
        b.setAttribute('aria-label', nice(c.key, { weekday: 'long', month: 'long', day: 'numeric' }) + (due.length ? ', ' + due.length + ' due' : ''));
        b.onclick = () => { calPick = c.key; if (!c.inMonth) { calY = c.y; calM = c.m; } render(); };
        grid.appendChild(b);
      });
      const side = main.querySelector('.ax-day');
      side.appendChild(h('<h3>' + esc(calPick === tk ? 'Today' : nice(calPick, { weekday: 'long', month: 'long', day: 'numeric' })) + '</h3>'));
      side.appendChild(list(A.tasks.filter((t) => t.due === calPick).sort((a, b) => (a.time || '99').localeCompare(b.time || '99')), 'Nothing due.'));
      side.appendChild(taskForm({ due: calPick }));
      main.querySelector('[data-key="ax:prev"]').onclick = () => { calM--; if (calM < 0) { calM = 11; calY--; } render(); };
      main.querySelector('[data-key="ax:next"]').onclick = () => { calM++; if (calM > 11) { calM = 0; calY++; } render(); };
      main.querySelector('[data-key="ax:now"]').onclick = () => { const t = new Date(); calY = t.getFullYear(); calM = t.getMonth(); calPick = L.dayKey(t); render(); };
    }
    function pageNotes() {
      main.innerHTML = '<header class="ax-head row"><div><h1>Notes</h1><p>Your thoughts.</p></div><button class="ax-btn gold" data-nav data-key="ax:nnew">+ New note</button></header><div class="ax-notes"><div class="ax-nlist"></div><div class="ax-ned"></div></div>';
      main.querySelector('[data-key="ax:nnew"]').onclick = () => { const n = { id: uid(), title: '', body: '', classId: null, at: Date.now() }; A.notes.unshift(n); noteId = n.id; save(); render(); setTimeout(() => main.querySelector('.ax-ned input').focus(), 0); };
      const nl = main.querySelector('.ax-nlist'), ed = main.querySelector('.ax-ned');
      const notes = A.notes.slice().sort((a, b) => b.at - a.at);
      if (!notes.length) { nl.innerHTML = '<p class="ax-empty">No notes yet.</p>'; ed.innerHTML = '<p class="ax-empty">Make a note, and link it to a class if you like.</p>'; return; }
      if (!notes.find((n) => n.id === noteId)) noteId = notes[0].id;
      notes.forEach((n) => {
        const b = h('<button class="ax-nitem' + (n.id === noteId ? ' on' : '') + '" data-nav data-key="ax:n-' + n.id + '"><b>' + esc(n.title || 'Untitled') + '</b><span>' + chip(cls(n.classId)) + esc((n.body || '').slice(0, 60) || 'Empty') + '</span></button>');
        b.onclick = () => { noteId = n.id; render(); };
        nl.appendChild(b);
      });
      const n = A.notes.find((x) => x.id === noteId);
      ed.innerHTML = '<input data-nav data-key="ax:ntitle" placeholder="Title" aria-label="Title" maxlength="100"><div class="ax-nrow"><select data-nav data-key="ax:nclass" aria-label="Class"><option value="">No class</option>' +
        A.classes.map((c) => '<option value="' + c.id + '"' + (c.id === n.classId ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select><button class="ax-link small" data-nav data-key="ax:ndel">Delete note</button></div><textarea aria-label="Note" placeholder="Write here"></textarea>';
      const ti = ed.querySelector('input'), ta = ed.querySelector('textarea');
      ti.value = n.title; ta.value = n.body;
      let t0 = 0;
      const keep = () => { n.title = ti.value; n.body = ta.value; n.at = Date.now(); clearTimeout(t0); t0 = setTimeout(() => { save(); const it = nl.querySelector('.on b'); if (it) it.textContent = n.title || 'Untitled'; }, 400); };
      ti.oninput = keep; ta.oninput = keep;
      ed.querySelector('select').onchange = (e) => { n.classId = e.target.value || null; save(); render(); };
      ed.querySelector('[data-key="ax:ndel"]').onclick = (e) => { const b = e.currentTarget; if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Delete it?'; return; } A.notes = A.notes.filter((x) => x !== n); noteId = null; save(); render(); };
    }

    function look() { return A.theme === 'calm' ? 'calm' : 'dawn'; }
    function render() {
      root.dataset.look = look();
      root.querySelectorAll('.ax-tab').forEach((b) => b.setAttribute('aria-current', String(b.dataset.v === view)));
      root.querySelectorAll('[data-th]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.th === look())));
      ({ today: pageToday, tasks: pageTasks, classes: pageClasses, calendar: pageCalendar, notes: pageNotes })[view]();
      ctx.setTitle('Axiom');
    }
    root.querySelectorAll('.ax-tab').forEach((b) => { b.onclick = () => { view = b.dataset.v; adding = false; render(); main.scrollTop = 0; }; });
    root.querySelectorAll('[data-th]').forEach((b) => { b.onclick = () => { A.theme = b.dataset.th; save(); sceneKey = ''; render(); }; });
    render();
    setTimeout(() => { if (ctx.mode === 'run') D.nav.first(root); }, 40);
    ctx.legend([['a', 'Choose'], ['b', 'Back'], ['lb', 'Last month'], ['rb', 'Next month']]);

    return {
      frame(now) {
        const W = Math.ceil(root.clientWidth / 3), H = Math.ceil(root.clientHeight / 3);
        if (!W || !H) return;
        const night = D.night(), key = look() + W + 'x' + H + night;
        if (key !== sceneKey) {
          sceneKey = key; bg.width = W; bg.height = H; bg.style.width = W * 3 + 'px'; bg.style.height = H * 3 + 'px';
          scene = look() === 'calm' ? new G.Scape({ world: 'meadow', night, W, H, seed: 'axiom' }) : { still: fuji(W, H, night) };
        }
        if (scene.still) { if (!scene.drawn) { bgg.drawImage(scene.still, 0, 0); scene.drawn = true; } }
        else scene.draw(bgg, now / 1000, D.state.motion === 'less');
      },
      onAction(a) {
        if (a === 'a') { const el = document.activeElement; if (el && root.contains(el) && el.form && el.tagName !== 'BUTTON') { el.form.requestSubmit(); return true; } if (el && root.contains(el) && el.tagName === 'BUTTON') { el.click(); return true; } return false; }
        if (view === 'calendar' && (a === 'lb' || a === 'rb')) { main.querySelector('[data-key="ax:' + (a === 'lb' ? 'prev' : 'next') + '"]').click(); return true; }
        if (a === 'b' && view !== 'today') { view = 'today'; adding = false; render(); return true; }
        return false;
      },
    };
  } });
})();
