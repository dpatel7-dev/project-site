// The dock: icons grow under the pointer, a note says what each one is, and
// All apps opens a sheet of every app that you can search by typing what you
// want to do ("music", "passwords"). Also the Day / Night switch.
(function () {
  'use strict';
  const D = window.DOCK;
  const dock = document.getElementById('dk');
  if (!D || !dock) return;
  const root = document.documentElement;
  const bar = dock.querySelector('.dk-bar');
  const allBtn = dock.querySelector('.dk-all');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const byId = {};
  D.apps.forEach((a) => { byId[a.id] = a; });
  const iconOf = (id) => dock.querySelector('.dk-i[data-id="' + id + '"] img');
  const NOTES = {
    home: ['Home', 'Every app, and how to get them all at once.'],
    all: ['All apps', 'See every app, or type what you want to do.'],
    start: ['Start here', 'Never used Terminal? A picture guide, one step at a time.'],
    new: ["What's new", 'The newest changes to every app.'],
  };

  // ── icons grow as the pointer gets close, like the Mac's own dock ──
  const tiles = [...dock.querySelectorAll('.dk-i')];
  let px = null;
  let frame = 0;
  function grow() {
    frame = 0;
    tiles.forEach((t) => {
      const ic = t.firstElementChild;
      if (!t.offsetWidth) return;
      let s = 1;
      if (px !== null) {
        const r = t.getBoundingClientRect();
        const d = Math.abs(px - (r.left + r.width / 2));
        s = 1 + 0.36 * Math.pow(Math.max(0, 1 - d / 130), 2);
      }
      ic.style.transform = s > 1.002 ? 'scale(' + s.toFixed(3) + ')' : '';
    });
  }
  bar.addEventListener('pointermove', (e) => {
    if (!fine.matches || still.matches || e.pointerType !== 'mouse') return;
    px = e.clientX;
    if (!frame) frame = requestAnimationFrame(grow);
  });
  bar.addEventListener('pointerleave', () => { px = null; if (!frame) frame = requestAnimationFrame(grow); });

  // ── the note: what this one is ──
  const tip = document.createElement('div');
  tip.className = 'dk-tip';
  tip.setAttribute('aria-hidden', 'true');
  tip.innerHTML = '<b></b><span></span>';
  document.body.appendChild(tip);
  function note(el) {
    if (sheet && !sheet.hidden) return;
    const a = byId[el.dataset.id];
    const said = a ? [a.name + (a.mascot ? ' ' : ''), a.line] : NOTES[el.dataset.id];
    if (!said) return;
    tip.firstChild.textContent = said[0].trim();
    tip.lastChild.textContent = said[1];
    tip.style.setProperty('--c', a ? a.c : getComputedStyle(el).getPropertyValue('--c') || 'transparent');
    const r = el.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    const half = Math.min(150, (innerWidth - 16) / 2);
    tip.style.left = Math.min(innerWidth - half - 8, Math.max(half + 8, r.left + r.width / 2)) + 'px';
    tip.style.bottom = (innerHeight - b.top + 16) + 'px';
    tip.classList.add('on');
  }
  const unnote = () => tip.classList.remove('on');
  tiles.forEach((el) => {
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') note(el); });
    el.addEventListener('pointerleave', unnote);
    el.addEventListener('focus', () => note(el));
    el.addEventListener('blur', unnote);
  });

  // ── All apps ──
  let sheet = null;
  let input;
  let list;
  let back = null;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function card(a, first) {
    const img = iconOf(a.id);
    const pic = img ? '<img src="' + img.src + '" alt="" style="--w:' + img.style.getPropertyValue('--w') + ';--h:' + img.style.getPropertyValue('--h') + '">' : '';
    const here = a.id === D.here;
    return '<a class="dk-card' + (first ? ' first' : '') + '" href="/' + a.id + '" style="--c:' + a.c + '"' + (here ? ' aria-current="page"' : '') + '>'
      + '<span class="dk-pic">' + pic + '</span>'
      + '<b>' + esc(a.name) + (here ? ' <i>you\'re here</i>' : (a.mascot ? ' <i>' + esc(a.mascot) + '</i>' : '')) + '</b>'
      + '<small>' + esc(a.line) + '</small>' + (first ? '<em>Enter</em>' : '') + '</a>';
  }

  // how well an app fits what was typed: its name first, then its mascot, then the words for what it does
  function score(a, q) {
    const words = q.split(/\s+/).filter(Boolean);
    const name = a.name.toLowerCase();
    const id = a.id;
    let s = 0;
    if (id === q || name === q) s += 200;
    else if (id.startsWith(q) || name.startsWith(q)) s += 120;
    if ((a.mascot || '').toLowerCase().startsWith(q)) s += 70;
    const hay = (a.words + ' ' + a.line).toLowerCase();
    words.forEach((w) => {
      if (new RegExp('(^|[^a-z])' + w.replace(/[^a-z0-9]/g, '')).test(hay)) s += 30;
      else if (w.length > 2 && hay.includes(w)) s += 10;
    });
    return s;
  }

  function draw() {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      list.innerHTML = D.groups.map(([g, title]) => {
        const apps = D.apps.filter((a) => a.group === g);
        return apps.length ? '<section class="dk-group"><h2>' + esc(title) + '</h2><div class="dk-grid">' + apps.map((a) => card(a, false)).join('') + '</div></section>' : '';
      }).join('');
      return;
    }
    const found = D.apps.map((a) => [score(a, q), a]).filter((x) => x[0] > 0).sort((x, y) => y[0] - x[0]).map((x) => x[1]);
    list.innerHTML = found.length
      ? '<section class="dk-group"><h2>' + (found.length === 1 ? 'This one' : 'These ones, best first') + '</h2><div class="dk-grid">' + found.map((a, i) => card(a, i === 0)).join('') + '</div></section>'
      : '<p class="dk-none"><b>Nothing here does that yet.</b> Try another word, like <b>music</b>, <b>files</b>, <b>study</b> or <b>passwords</b>.</p>';
  }

  function build() {
    sheet = document.createElement('div');
    sheet.className = 'dk-sheet';
    sheet.id = 'dk-sheet';
    sheet.hidden = true;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'All apps');
    sheet.innerHTML = '<div class="dk-panel">'
      + '<div class="dk-top"><label class="dk-search"><img src="' + D.find + '" alt="">'
      + '<input type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="What do you want to do? Type a word, like music" aria-label="What do you want to do?" aria-describedby="dk-how"></label>'
      + '<button type="button" class="dk-close">Close <kbd>esc</kbd></button></div>'
      + '<p class="dk-how" id="dk-how">Click an app to see what it does and how to get it. Or type, and press <b>Enter</b> to open the first one.</p>'
      + '<div class="dk-list"></div>'
      + '<div class="dk-foot"><nav class="dk-links" aria-label="More"><a href="/">Home</a><a href="/start">Start here</a><a href="/new">What\'s new</a></nav>'
      + '<div class="dk-look" role="group" aria-label="Day or night"><span>Look</span><button type="button" data-look="auto" title="Day from sunrise, night from sunset">Auto</button><button type="button" data-look="light">Day</button><button type="button" data-look="dark">Night</button></div></div>'
      + '</div>';
    document.body.appendChild(sheet);
    input = sheet.querySelector('input');
    list = sheet.querySelector('.dk-list');
    input.addEventListener('input', draw);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = list.querySelector('.dk-card');
        if (first && input.value.trim()) { e.preventDefault(); location.href = first.href; }
      } else if (e.key === 'ArrowDown') {
        const first = list.querySelector('.dk-card');
        if (first) { e.preventDefault(); first.focus(); }
      }
    });
    list.addEventListener('keydown', (e) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const cards = [...list.querySelectorAll('.dk-card')];
      const i = cards.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
      if (i + step < 0) input.focus();
      else cards[Math.min(cards.length - 1, i + step)].focus();
    });
    sheet.querySelector('.dk-close').addEventListener('click', close);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    sheet.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const can = [...sheet.querySelectorAll('input, button, a[href]')].filter((x) => x.offsetParent);
      const first = can[0];
      const last = can[can.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    sheet.querySelectorAll('.dk-look button').forEach((b) => b.addEventListener('click', () => setLook(b.dataset.look)));
    paintLook();
  }

  function open(typed) {
    if (!sheet) build();
    if (!sheet.hidden) { if (typed) { input.value += typed; draw(); } input.focus(); return; }
    back = document.activeElement;
    unnote();
    input.value = typed || '';
    draw();
    sheet.hidden = false;
    root.classList.add('dk-lock');
    allBtn.setAttribute('aria-expanded', 'true');
    sheet.classList.remove('open');
    void sheet.offsetWidth;
    sheet.classList.add('open');
    input.focus();
    if (typed) input.setSelectionRange(input.value.length, input.value.length);
  }
  function close() {
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    root.classList.remove('dk-lock');
    allBtn.setAttribute('aria-expanded', 'false');
    if (back && back.focus) back.focus();
  }
  allBtn.addEventListener('click', (e) => { e.preventDefault(); open(''); });
  allBtn.addEventListener('keydown', (e) => { if (e.key === ' ') { e.preventDefault(); open(''); } });
  window.openAllApps = open;

  // On this site's own pages, just start typing: "music", Enter, and you're there.
  // A page can take the typing for itself first (the home page's Terminal does).
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    if (sheet && !sheet.hidden) return;
    const el = document.activeElement;
    const busy = el && el !== document.body && !(el.tagName === 'A' || el.tagName === 'BUTTON');
    if (busy) return;
    if (e.key === '/') { e.preventDefault(); open(''); return; }
    if (D.kind !== 'page' || e.key.length !== 1 || !/[a-z0-9]/i.test(e.key)) return;
    if (typeof window.DOCK_TYPE === 'function' && window.DOCK_TYPE(e.key)) { e.preventDefault(); return; }
    e.preventDefault();
    open(e.key);
  });

  // ── day or night ──
  function chosen() {
    try { return localStorage.getItem('djp7-look') || 'auto'; } catch (e) { return 'auto'; }
  }
  function paintLook() {
    if (!sheet) return;
    const v = chosen();
    sheet.querySelectorAll('.dk-look button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.look === v)));
  }
  function apply(v) {
    const was = root.getAttribute('data-look');
    const now = v === 'light' || v === 'dark' ? v : (window.djp7ClockNight && djp7ClockNight() ? 'dark' : 'light');
    root.setAttribute('data-look', now);
    paintLook();
    if (now !== was) dispatchEvent(new CustomEvent('djp7look'));
  }
  function setLook(v) {
    try { if (v === 'auto') localStorage.removeItem('djp7-look'); else localStorage.setItem('djp7-look', v); } catch (e) { /* this browser won't remember it */ }
    apply(v);
  }
  addEventListener('storage', (e) => { if (e.key === 'djp7-look') apply(e.newValue || 'auto'); });
  // on Auto, the sun sets (and rises) while the page is open
  setInterval(() => { if (chosen() === 'auto') apply('auto'); }, 60000);

  // the front page's Terminal points at the app it found: its icon in the dock lights up
  let lit = null;
  window.dockShow = function (id) {
    const el = dock.querySelector('.dk-i[data-id="' + id + '"]');
    if (lit) { lit.classList.remove('dk-lit'); lit.firstElementChild.style.transform = ''; }
    if (!el || !el.offsetWidth || px !== null) return;
    lit = el;
    el.classList.add('dk-lit');
    if (!still.matches) el.firstElementChild.style.transform = 'scale(1.3)';
    clearTimeout(window.dockShow.t);
    window.dockShow.t = setTimeout(() => { el.classList.remove('dk-lit'); el.firstElementChild.style.transform = ''; lit = null; }, 2200);
  };
})();
