// magpie: everything you copied, to paste again.
//
// The OS version of magpie from the suite: a narrow strip of frosted glass at the right of the screen that
// floats over your work without taking it over (Super + V, Ctrl + Alt + V, or the magpie in the menu bar).
// It remembers what you copy (text, links, colours, code), where from, across restarts. Type to find,
// arrows and Enter (or 1 to 9) to paste it where you were. Pin things to keep them, give them names,
// paste them changed (tidy spaces, UPPERCASE, a link without trackers, pretty JSON…), pick several at once.
// It skips anything that looks like a password, a key, a token or a card number. Nothing leaves the computer.
// Pica the magpie hops along the rooftops at the bottom, collecting shiny things.
(function () {
  'use strict';
  const D = window.Dice, h = D.h, esc = D.esc, S = D.S, G = D.G;
  const MP = (D.magpie = {});
  const KEY = 'dice-magpie';
  let items = [];
  try { items = JSON.parse(localStorage.getItem(KEY) || '[]'); if (!Array.isArray(items)) items = []; } catch (e) { items = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(items.slice(0, 300))); } catch (e) { /* full: keep what's in memory */ } };
  MP.list = () => items.slice();

  // ---- what it won't keep -----------------------------------------------------------------------------------------
  function luhn(d) { let s = 0; for (let i = 0; i < d.length; i++) { let n = +d[d.length - 1 - i]; if (i % 2) { n *= 2; if (n > 9) n -= 9; } s += n; } return s % 10 === 0; }
  MP.secret = function (t) {
    const s = String(t).trim();
    if (/^(sk|pk|rk)[-_][A-Za-z0-9_-]{16,}$|^gh[pousr]_[A-Za-z0-9]{20,}$|^AKIA[0-9A-Z]{16}$|^xox[abpr]-|^AIza[0-9A-Za-z_-]{30,}$|^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./.test(s)) return true; // API keys and tokens
    const digits = s.replace(/[\s-]/g, '');
    if (/^\d{13,19}$/.test(digits) && luhn(digits)) return true; // a card number
    if (!/\s/.test(s) && s.length >= 24 && s.length <= 128 && /[A-Z]/.test(s) && /[a-z]/.test(s) && /\d/.test(s) && !/^https?:|\//.test(s)) return true; // a long random password
    return false;
  };
  const kindOf = (t) => (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$|^rgba?\(/i.test(t.trim()) ? 'colour' : /^https?:\/\/\S+$/i.test(t.trim()) ? 'link' : /[{};]\s*$|^\s*(function|const|let|def|import|class|<\w+)/m.test(t) && t.includes('\n') ? 'code' : 'text');
  MP.remember = function (text, from) {
    text = String(text || '');
    if (!text.trim() || text.length > 20000 || MP.secret(text)) return;
    const i = items.findIndex((x) => x.text === text);
    let it = i >= 0 ? items.splice(i, 1)[0] : { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text, pin: false, name: '' };
    Object.assign(it, { at: Date.now(), from: from || it.from || appNow(), kind: kindOf(text) });
    items.unshift(it);
    // keep 200, but never drop a pinned one
    let n = 0; items = items.filter((x) => x.pin || ++n <= 200);
    save(); D.emit('magpie');
  };
  const appNow = () => { const w = D.desk && D.desk.on && D.desk.top && D.desk.top(); return w ? w.app.name : D.running && D.running() ? D.running().app.name : 'DiceOS'; };
  document.addEventListener('copy', () => { const s = String(getSelection() || ''); if (s) MP.remember(s); });
  document.addEventListener('cut', () => { const s = String(getSelection() || ''); if (s) MP.remember(s); });
  const copy0 = D.copy;
  if (copy0) D.copy = function (text) { MP.remember(text); return copy0.apply(D, arguments); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    const w0 = navigator.clipboard.writeText.bind(navigator.clipboard);
    try { navigator.clipboard.writeText = (t) => { MP.remember(t); return w0(t); }; } catch (e) { /* read-only here */ }
  }

  // ---- pasting, plain or changed ------------------------------------------------------------------------------------
  let lastField = null;
  document.addEventListener('focusin', (e) => { const t = e.target; if (t && !t.closest('#magpie') && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && /^(text|search|url|email|)$/i.test(t.type)) || t.isContentEditable)) lastField = t; });
  const CHANGES = [
    ['Tidy spaces', (t) => t.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()],
    ['UPPERCASE', (t) => t.toUpperCase()], ['lowercase', (t) => t.toLowerCase()],
    ['Title Case', (t) => t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())],
    ['One line', (t) => t.replace(/\s*\n\s*/g, ' ').trim()],
    ['Link without trackers', (t) => { try { const u = new URL(t.trim()); [...u.searchParams.keys()].forEach((k) => { if (/^(utm_|fbclid|gclid|mc_|si$|igshid|ref$|ref_src|spm|_hs|yclid)/i.test(k)) u.searchParams.delete(k); }); return u.toString().replace(/\?$/, ''); } catch (e) { return t; } }],
    ['Sorted lines', (t) => t.split('\n').sort((a, b) => a.localeCompare(b)).join('\n')],
    ['Without repeated lines', (t) => [...new Set(t.split('\n'))].join('\n')],
    ['Bullet list', (t) => t.split('\n').filter((l) => l.trim()).map((l) => '• ' + l.trim()).join('\n')],
    ['Pretty JSON', (t) => JSON.stringify(JSON.parse(t), null, 2)],
    ['Base64', (t) => btoa(unescape(encodeURIComponent(t)))],
    ['From Base64', (t) => decodeURIComponent(escape(atob(t.trim())))],
    ['file-name-style', (t) => t.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')],
  ];
  MP.CHANGES = CHANGES;
  MP.paste = function (text) {
    MP.remember(text, appNow());
    try { navigator.clipboard.writeText(text); } catch (e) { /* not allowed here */ }
    MP.close();
    if (lastField && lastField.isConnected) {
      lastField.focus();
      if (!document.execCommand('insertText', false, text)) { const f = lastField, s = f.selectionStart || 0; f.value = f.value.slice(0, s) + text + f.value.slice(f.selectionEnd || s); f.dispatchEvent(new Event('input', { bubbles: true })); }
    } else D.toast({ icon: 'copy', c: '#6a9be6', title: 'Copied', text: 'Paste it with Ctrl + V.' });
  };

  // ---- the panel --------------------------------------------------------------------------------------------------
  let el = null, q = '', sel = 0, picked = new Set(), raf = 0;
  function build(root, panel) {
    root.innerHTML = '<header class="mp-top"><canvas class="mp-bird" width="24" height="24" aria-hidden="true"></canvas><b class="pix">magpie</b><span class="mp-n"></span>' + (panel ? '<button class="mp-x" aria-label="Close (Esc)">' + D.glyph('close', 2) + '</button>' : '') + '</header>' +
      '<label class="mp-find">' + D.glyph('search', 2) + '<input type="search" placeholder="Find something you copied" aria-label="Find" autocomplete="off" spellcheck="false"></label>' +
      '<div class="mp-list" role="listbox" aria-label="What you copied"></div>' +
      '<div class="mp-multi" hidden><span></span><button class="b small go" data-nav>Copy them together</button><button class="b small" data-nav>Clear</button></div>' +
      '<canvas class="mp-roofs" aria-hidden="true"></canvas>';
    const input = root.querySelector('input');
    input.oninput = () => { q = input.value.trim().toLowerCase(); sel = 0; paint(root); };
    input.onkeydown = (e) => keys(e, root);
    if (panel) root.querySelector('.mp-x').onclick = () => MP.close();
    const multi = root.querySelector('.mp-multi');
    multi.querySelector('.go').onclick = () => { const t = items.filter((x) => picked.has(x.id)).map((x) => x.text).join('\n'); picked.clear(); MP.paste(t); };
    multi.querySelector('.b:not(.go)').onclick = () => { picked.clear(); paint(root); };
    const bird = G.mascot('magpie');
    if (bird) { const g = root.querySelector('.mp-bird').getContext('2d'); g.imageSmoothingEnabled = false; const k = 24 / Math.max(bird.width, bird.height); g.drawImage(bird, (24 - bird.width * k) / 2, (24 - bird.height * k) / 2, bird.width * k, bird.height * k); }
    roofs(root.querySelector('.mp-roofs'));
    paint(root);
    return input;
  }
  const shown = () => {
    const L = items.filter((x) => !q || x.text.toLowerCase().includes(q) || (x.name || '').toLowerCase().includes(q) || (x.from || '').toLowerCase().includes(q));
    return L.filter((x) => x.pin).concat(L.filter((x) => !x.pin));
  };
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min' : m < 1440 ? Math.round(m / 60) + ' h' : new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  function paint(root) {
    const list = root.querySelector('.mp-list'), L = shown();
    root.querySelector('.mp-n').textContent = items.length ? items.length + ' kept' : '';
    list.innerHTML = '';
    if (!L.length) list.innerHTML = '<p class="mp-none">' + (items.length ? 'Nothing like that.' : 'Copy something (Ctrl + C) and it lands here. Pica keeps it, even after a restart.') + '</p>';
    L.slice(0, 120).forEach((x, i) => {
      const b = h('<div class="mp-it ' + (i === sel ? 'sel' : '') + (x.pin ? ' pin' : '') + (picked.has(x.id) ? ' picked' : '') + '" role="option" tabindex="-1" data-nav data-key="mp:' + esc(x.id) + '" data-x="More">' +
        '<span class="mp-k">' + (i < 9 ? i + 1 : '') + '</span><div class="mp-t"></div><div class="mp-meta"><span></span><span class="mp-acts"><button aria-label="Pin">' + (x.pin ? '★' : '☆') + '</button><button aria-label="Change it, then paste">Aa</button><button aria-label="Pick">' + (picked.has(x.id) ? '☑' : '☐') + '</button><button aria-label="Forget">✕</button></span></div></div>');
      const t = b.querySelector('.mp-t');
      if (x.name) t.appendChild(h('<b class="mp-name"></b>')).textContent = x.name;
      if (x.kind === 'colour') { t.appendChild(h('<i class="mp-sw"></i>')).style.background = x.text.trim(); }
      t.appendChild(document.createTextNode(x.text.length > 260 ? x.text.slice(0, 260) + '…' : x.text));
      t.classList.add('k-' + x.kind);
      b.querySelector('.mp-meta > span').textContent = (x.from || '') + '  ' + ago(x.at);
      b.onclick = (e) => { if (e.target.closest('.mp-acts')) return; if (e.shiftKey || picked.size) { toggle(x); paint(root); } else MP.paste(x.text); };
      const [pin, ch, pk, fg] = b.querySelectorAll('.mp-acts button');
      pin.onclick = () => { x.pin = !x.pin; if (x.pin && !x.name) nameIt(x, root); save(); paint(root); };
      ch.onclick = (e) => changeMenu(x, e.clientX, e.clientY);
      pk.onclick = () => { toggle(x); paint(root); };
      fg.onclick = () => { items = items.filter((y) => y !== x); save(); paint(root); };
      b._x = () => { const r = b.getBoundingClientRect(); changeMenu(x, r.left + 20, r.bottom); };
      list.appendChild(b);
    });
    const multi = root.querySelector('.mp-multi');
    multi.hidden = !picked.size;
    multi.querySelector('span').textContent = picked.size + ' picked';
    const s = list.querySelector('.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
  }
  const toggle = (x) => (picked.has(x.id) ? picked.delete(x.id) : picked.add(x.id));
  function nameIt(x, root) {
    D.ask({ title: 'A name for it?', text: 'So it\'s easy to find. You can leave it blank.', input: { label: 'Name', value: x.name || '' }, buttons: [{ label: 'Keep', value: true, go: true }, { label: 'No name', value: false }] }).then((r) => { if (r && r.ok) { x.name = String(r.value || '').slice(0, 40); save(); paint(root); } });
  }
  function changeMenu(x, px, py) {
    const opts = CHANGES.map(([n, f]) => { let out = null; try { out = f(x.text); } catch (e) { out = null; } return out && out !== x.text ? [n, out] : null; }).filter(Boolean);
    const menu = D.deskplus && D.deskplus.menu;
    const run = opts.map(([n, out]) => ({ label: n + ': ' + out.replace(/\s+/g, ' ').slice(0, 34) + (out.length > 34 ? '…' : ''), icon: 'copy', run: () => MP.paste(out) }));
    if (!run.length) return D.toast({ icon: 'copy', c: '#6a9be6', title: 'Nothing to change', text: 'That one is as tidy as it gets.' });
    if (menu && D.desk && D.desk.on) { menu(Math.min(px, innerWidth - 330), py, [{ html: '<p class="dmenu-h">Paste it changed</p>' }].concat(run)); }
    else D.ask({ title: 'Paste it changed', buttons: run.slice(0, 6).map((r, i) => ({ label: r.label, value: i })).concat([{ label: 'Never mind', value: -1 }]) }).then((i) => { if (i >= 0) run[i].run(); });
  }
  function keys(e, root) {
    const L = shown();
    if (e.key === 'ArrowDown') { sel = Math.min(L.length - 1, sel + 1); paint(root); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); paint(root); e.preventDefault(); }
    else if (e.key === 'Enter') { const x = L[sel]; if (x) MP.paste(x.text); e.preventDefault(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); MP.close(); }
    else if (/^[1-9]$/.test(e.key) && (e.metaKey || e.ctrlKey || !e.target.value)) { const x = L[+e.key - 1]; if (x) { e.preventDefault(); MP.paste(x.text); } }
  }
  // rooftops along the bottom, windows lit at night, and Pica hopping along them
  function roofs(cv) {
    const g = cv.getContext('2d'), bird = G.mascot('magpie');
    let W = 0, H = 0, x = 0, dir = 1, hop = 0;
    const size = () => { const r = cv.getBoundingClientRect(); W = Math.max(40, Math.round(r.width / 3)); H = Math.max(14, Math.round(r.height / 3)); cv.width = W; cv.height = H; };
    size();
    const loop = (t) => {
      if (!cv.isConnected) return;
      raf = requestAnimationFrame(loop);
      if (cv.width !== Math.round(cv.getBoundingClientRect().width / 3)) size();
      const night = D.night();
      g.clearRect(0, 0, W, H);
      for (let i = 0, bx = 0; bx < W; i++) {
        const bw = 9 + (i * 7) % 8, bh = 6 + (i * 5) % 7;
        g.fillStyle = night ? ['#2b3550', '#24304a', '#323a58'][i % 3] : ['#8aa3c7', '#9fb3d1', '#7f97bd'][i % 3];
        g.fillRect(bx, H - bh, bw, bh);
        g.fillStyle = night ? '#1c2438' : '#6b7fa3'; g.fillRect(bx, H - bh - 1, bw, 1);
        for (let wy = H - bh + 2; wy < H - 1; wy += 3) for (let wx = bx + 2; wx < bx + bw - 1; wx += 3) { g.fillStyle = night ? ((wx * 3 + wy + i) % 5 ? '#ffd77a' : '#3a4566') : 'rgba(255,255,255,.55)'; g.fillRect(wx, wy, 1, 1); }
        bx += bw + 1;
      }
      if (bird && !D.reduced()) {
        x += dir * 0.18; if (x > W - 10 || x < 0) dir = -dir;
        hop = Math.abs(Math.sin(t / 220)) * 2;
        const k = 9 / Math.max(bird.width, bird.height);
        g.save(); if (dir < 0) { g.translate(Math.round(x) * 2 + 9, 0); g.scale(-1, 1); }
        g.drawImage(bird, Math.round(x), Math.round(H - 15 - hop), bird.width * k, bird.height * k); g.restore();
      }
    };
    raf = requestAnimationFrame(loop);
  }

  MP.isOpen = () => !!(el && el.classList.contains('on'));
  MP.open = function () {
    if (!el) { el = h('<aside id="magpie" class="glass" role="dialog" aria-label="magpie: what you copied"></aside>'); document.body.appendChild(el); el.addEventListener('pointerdown', (e) => e.stopPropagation()); }
    q = ''; sel = 0;
    const input = build(el, true);
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('on'));
    S.play('open');
    setTimeout(() => input.focus(), 40);
  };
  MP.close = function () { if (!MP.isOpen()) return; el.classList.remove('on'); cancelAnimationFrame(raf); setTimeout(() => { if (el && !el.classList.contains('on')) el.hidden = true; }, 220); };
  MP.toggle = () => (MP.isOpen() ? MP.close() : MP.open());
  addEventListener('pointerdown', (e) => { if (MP.isOpen() && !e.target.closest('#magpie') && !e.target.closest('.dmenu') && !e.target.closest('#dialog')) MP.close(); }, true);
  D.on('magpie', () => { if (MP.isOpen()) paint(el); });
  // Ctrl + Alt + V, like magpie's ⌃⌥V (Super + V is the desktop's)
  addEventListener('keydown', (e) => { if (e.ctrlKey && e.altKey && !e.metaKey && (e.key === 'v' || e.key === 'V') && !(D.desk && D.desk.on)) { e.preventDefault(); e.stopPropagation(); MP.toggle(); } }, true);
  setTimeout(() => { if (D.deskplus) D.deskplus.clipboard = () => MP.toggle(); }, 0); // Super + V and Ctrl + Alt + V on the desktop
  // opening magpie on the desktop opens the panel, not a window
  if (D.desk) { const open0 = D.desk.open; D.desk.open = function (id) { if (id === 'magpie') { MP.open(); return null; } return open0.apply(this, arguments); }; }
  // and a magpie in the menu bar, like the Mac one's
  function perch() {
    const r = document.querySelector('#desk .mbar .mb-r');
    if (!r || r.querySelector('.mb-magpie')) return;
    const b = h('<button class="mb-magpie" aria-label="magpie: what you copied (Super + V)" title="magpie (Super + V)"><canvas width="20" height="20"></canvas></button>');
    const bird = G.mascot('magpie');
    if (bird) { const g = b.querySelector('canvas').getContext('2d'); g.imageSmoothingEnabled = false; const k = 20 / Math.max(bird.width, bird.height); g.drawImage(bird, (20 - bird.width * k) / 2, (20 - bird.height * k) / 2, bird.width * k, bird.height * k); }
    b.onclick = (e) => { e.stopPropagation(); MP.toggle(); };
    b.onpointerdown = (e) => e.stopPropagation();
    const s = r.querySelector('.mb-search'); r.insertBefore(b, s);
  }
  D.on('desk', (on) => { if (on) setTimeout(perch, 50); else MP.close(); });

  // as an app: on the desktop it's the panel; on DiceTV, the same list, full screen
  D.register({ id: 'magpie', mount(root, ctx) {
    root.classList.add('magpie-app');
    q = ''; sel = 0;
    build(root, false);
    const off = D.on('magpie', () => paint(root));
    ctx.legend([['a', 'Paste'], ['x', 'More']]);
    return { unmount() { off(); cancelAnimationFrame(raf); } };
  } });
})();
