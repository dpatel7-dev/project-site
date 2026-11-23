// SereneTab: DiceWeb's web browser. Tabs, an address bar that also searches,
// and a calm new tab page: a city skyline under its real sky right now, a
// glass clock, the weather, your shortcuts as a little lattice of cubes, and
// a note that stays put.
//
// Pages open inside SereneTab when the site allows it. Big sites that refuse
// to be shown inside another page (Google, GitHub and so on) open in their
// own window instead: Chromium on top of Dice, or a new tab in your browser.
(function () {
  'use strict';
  const D = window.Dice, G = window.DiceGfx, L = window.DiceLogic, h = D.h, esc = D.esc;
  const CITY_IDS = Object.keys(G.Skyline.CITIES);
  const CUBE = ['#e0705a', '#e9a23b', '#5aa469', '#3f8fd8', '#8a6bd8', '#d45d9a', '#2fa5a0', '#7a86a3'];
  const host = (u) => L.hostOf(u).replace(/^www\./, '');
  const colourOf = (s) => CUBE[G.hash(host(s) || s) % CUBE.length];

  function defaults() {
    const ha = (D.sys && D.sys.settings && D.sys.settings.homeassistant) || D.state.ha || '';
    return [ha && { name: 'Home Assistant', url: ha }, { name: 'djp7', url: D.origin }, { name: 'Wikipedia', url: 'https://en.wikipedia.org' },
      { name: 'YouTube', url: 'https://www.youtube.com' }, { name: 'GitHub', url: 'https://github.com' }, { name: 'MDN', url: 'https://developer.mozilla.org' },
      { name: 'OpenStreetMap', url: 'https://www.openstreetmap.org' }].filter(Boolean);
  }
  function settings() {
    const s = D.state.st || (D.state.st = {});
    if (!L.ENGINES[s.engine]) s.engine = 'ddg';
    if (!G.Skyline.CITIES[s.city]) s.city = 'newyork';
    if (!Array.isArray(s.shortcuts)) s.shortcuts = defaults();
    if (s.units !== 'f' && s.units !== 'c') s.units = /^en-US$/i.test(navigator.language || '') ? 'f' : 'c';
    if (typeof s.note !== 'string') s.note = '';
    return s;
  }

  // ---- the weather, from Open-Meteo (free, no key) -------------------------------------
  const wxCache = new Map();
  async function weather(lat, lon, units) {
    const key = lat.toFixed(2) + ',' + lon.toFixed(2) + units, hit = wxCache.get(key);
    if (hit && Date.now() - hit.at < 15 * 60e3) return hit.data;
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1' + (units === 'f' ? '&temperature_unit=fahrenheit' : ''));
    if (!r.ok) throw new Error('weather ' + r.status);
    const j = await r.json();
    const data = { t: Math.round(j.current.temperature_2m), code: j.current.weather_code, hi: Math.round(j.daily.temperature_2m_max[0]), lo: Math.round(j.daily.temperature_2m_min[0]) };
    wxCache.set(key, { at: Date.now(), data });
    return data;
  }
  async function findPlace(q) {
    const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=' + encodeURIComponent(q));
    if (!r.ok) throw new Error('place ' + r.status);
    const j = await r.json(), p = j.results && j.results[0];
    return p ? { name: p.name, lat: p.latitude, lon: p.longitude } : null;
  }

  // ---- small pictures (smooth, to suit the glass) -----------------------------------------
  const ICON = {
    back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>', fwd: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
    reload: '<path d="M18.5 12a6.5 6.5 0 1 1-2-4.7"/><path d="M17.5 4v4h-4"/>', plus: '<path d="M12 6v12M6 12h12"/>', close: '<path d="M7.5 7.5l9 9M16.5 7.5l-9 9"/>',
    out: '<path d="M13 5h6v6"/><path d="M19 5l-8 8"/><path d="M17 14v4a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 18V8.5A1.5 1.5 0 0 1 6.5 7H10"/>',
    edit: '<path d="M5 19l1-4L15.5 5.5a2 2 0 0 1 3 3L9 18z"/>', search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="M15 15l4.5 4.5"/>',
  };
  const icon = (n) => '<svg class="st-svg" viewBox="0 0 24 24" aria-hidden="true">' + ICON[n] + '</svg>';
  const CLOUD = 'M7.5 19h9.5a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7.2 9.6 4.7 4.7 0 0 0 7.5 19z';
  function wxIcon(kind, night) {
    const sun = '<circle cx="12" cy="12" r="4.6" fill="#ffc94a"/>' + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => '<path d="M12 3.2v2.2" stroke="#ffb52e" stroke-width="1.8" stroke-linecap="round" transform="rotate(' + a + ' 12 12)"/>').join('');
    const moon = '<path d="M15.5 4.5a7.5 7.5 0 1 0 4 12.5 6 6 0 0 1-4-12.5z" fill="#eee8cf"/>';
    const cloud = (dy, c) => '<path d="' + CLOUD + '" transform="translate(0 ' + (dy || 0) + ')" fill="' + (c || '#eef2f8') + '" stroke="#9aa8bc" stroke-width="1"/>';
    let body;
    if (kind === 'clear') body = night ? moon : sun;
    else if (kind === 'some') body = '<g transform="translate(-3.5 -3.5) scale(.8)">' + (night ? moon : sun) + '</g>' + cloud(2);
    else if (kind === 'fog') body = '<path d="M4 9h16M6 13h12M4 17h16" stroke="#9aa8bc" stroke-width="2" stroke-linecap="round"/>';
    else if (kind === 'rain') body = cloud(-3) + '<path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3" stroke="#4a90e2" stroke-width="1.8" stroke-linecap="round"/>';
    else if (kind === 'snow') body = cloud(-3) + '<g fill="#fff" stroke="#9aa8bc" stroke-width=".8"><circle cx="9" cy="19.5" r="1.3"/><circle cx="13" cy="21" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/></g>';
    else if (kind === 'storm') body = cloud(-3, '#d5dbe5') + '<path d="M13 16l-3 4h3l-1.5 3.5" fill="none" stroke="#f0b02c" stroke-width="1.8" stroke-linejoin="round"/>';
    else body = cloud(0);
    return '<svg class="st-wxsvg" viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>';
  }
  // the glass clock's face: ticks, then hands we turn each second
  const CLOCK = '<svg viewBox="0 0 100 100" class="st-face">' +
    Array.from({ length: 12 }, (_, i) => '<path d="M50 ' + (i % 3 ? 9 : 7) + 'V' + (i % 3 ? 13 : 15) + '" transform="rotate(' + i * 30 + ' 50 50)" class="tick' + (i % 3 ? '' : ' big') + '"/>').join('') +
    '<path class="hh" d="M50 50V27"/><path class="mh" d="M50 50V15"/><path class="sh" d="M50 58V12"/><circle cx="50" cy="50" r="3" class="hub"/></svg>';

  D.register({ id: 'browser', mount(root, ctx) {
    const S = settings();
    root.classList.add('st');
    root.tabIndex = -1;
    root.classList.toggle('st-run', ctx.mode === 'run'); // full screen, with the Big screen's hints along the bottom
    root.innerHTML =
      '<div class="st-chrome"><div class="st-tabs" role="tablist" aria-label="Tabs"></div>' +
      '<div class="st-bar">' +
        '<button class="st-ic" data-nav data-key="st:back" data-a="back" aria-label="Back (Alt+Left)">' + icon('back') + '</button>' +
        '<button class="st-ic" data-nav data-key="st:fwd" data-a="fwd" aria-label="Forward (Alt+Right)">' + icon('fwd') + '</button>' +
        '<button class="st-ic" data-nav data-key="st:reload" data-a="reload" aria-label="Reload">' + icon('reload') + '</button>' +
        '<form class="st-omni" role="search"><button type="button" class="st-eng" data-nav data-key="st:eng" aria-haspopup="menu"></button>' +
          '<input data-nav data-key="st:omni" aria-label="Search or type a web address" autocomplete="off" spellcheck="false"></form>' +
        '<button class="st-ic st-logo" data-nav data-key="st:home" data-a="home" aria-label="New tab (Ctrl+T)">' + G.sereneSvg(22, 'light') + '</button>' +
      '</div></div><div class="st-pages"></div><div class="st-pop" hidden role="menu"></div>';
    const tabsEl = root.querySelector('.st-tabs'), pages = root.querySelector('.st-pages'), omni = root.querySelector('.st-omni input'), pop = root.querySelector('.st-pop');
    let tabs = [], cur = null, seq = 0, sky = null, skyAt = 0, wxCity = null, wxHere = null, dead = false;
    const openOutside = (url) => (D.sys ? D.sys.open(url) : window.open(url, '_blank', 'noopener'));
    const save = () => { S.tabs = tabs.map((t) => (t.hist[t.at] && t.hist[t.at].how !== 'ntp' ? t.hist[t.at].url : '')); S.active = tabs.indexOf(cur); D.save(); };

    // ---- the engine button and its menu ----
    function paintEngine() {
      const e = L.ENGINES[S.engine];
      root.querySelectorAll('.st-eng').forEach((b) => { b.textContent = e.mark; b.style.setProperty('--c', e.c); b.setAttribute('aria-label', 'Search with ' + e.name + ' (change)'); });
      omni.placeholder = 'Search with ' + e.name + ' or type an address';
      const f = root.querySelector('.st-find input'); if (f) f.placeholder = omni.placeholder;
    }
    function engineMenu(from) {
      const r = from.getBoundingClientRect(), rr = root.getBoundingClientRect();
      pop.innerHTML = '<p class="st-pop-t">Search with</p>' + Object.entries(L.ENGINES).map(([k, e]) => '<button role="menuitemradio" aria-checked="' + (k === S.engine) + '" data-nav data-key="st:e-' + k + '" data-e="' + k + '"><span class="st-eng" style="--c:' + e.c + '">' + e.mark + '</span>' + esc(e.name) + '</button>').join('');
      pop.style.left = Math.max(8, r.left - rr.left) + 'px'; pop.style.top = (r.bottom - rr.top + 6) + 'px';
      pop.hidden = false;
      pop.querySelectorAll('[data-e]').forEach((b) => { b.onclick = () => { S.engine = b.dataset.e; D.save(); paintEngine(); pop.hidden = true; from.focus(); }; });
      setTimeout(() => (pop.querySelector('[aria-checked="true"]') || pop.querySelector('button')).focus(), 0);
    }
    root.addEventListener('pointerdown', (e) => { if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('.st-eng')) pop.hidden = true; });

    // ---- tabs ----
    function newTab(url, opts) {
      const t = { id: ++seq, hist: [], at: -1, el: h('<div class="st-page" hidden></div>') };
      pages.appendChild(t.el); tabs.push(t);
      if (cur && opts && opts.after) { tabs.splice(tabs.indexOf(t), 1); tabs.splice(tabs.indexOf(cur) + 1, 0, t); }
      if (url) go(t, url, opts); else { t.hist = [{ url: '', how: 'ntp', title: 'New tab' }]; t.at = 0; }
      select(t);
      if (!url) setTimeout(() => { const f = ntp.querySelector('.st-find input'); if (f && !(opts && opts.quiet)) f.focus(); }, 30);
      return t;
    }
    function closeTab(t) {
      const i = tabs.indexOf(t);
      if (i < 0) return;
      tabs.splice(i, 1); t.el.remove();
      if (!tabs.length) newTab(null, { quiet: true });
      else if (t === cur) select(tabs[Math.min(i, tabs.length - 1)]);
      else paintTabs();
      save();
    }
    function select(t) {
      cur = t;
      tabs.forEach((x) => { x.el.hidden = x !== t; });
      const e = t.hist[t.at];
      if (e && e.how === 'ntp') { t.el.appendChild(ntp); fitSky(); }
      omni.value = e && e.how !== 'ntp' ? e.url : '';
      paintTabs(); paintNav(); save();
      ctx.setTitle(e && e.how !== 'ntp' ? (e.title || host(e.url)) + ' — SereneTab' : 'SereneTab');
    }
    function paintTabs() {
      tabsEl.innerHTML = '';
      tabs.forEach((t, i) => {
        const e = t.hist[t.at] || { how: 'ntp' }, name = e.how === 'ntp' ? 'New tab' : e.title || host(e.url) || e.url;
        const mark = e.how === 'ntp' ? G.sereneSvg(14, 'light') : '<span class="st-mono" style="--c:' + colourOf(e.url) + '">' + esc((host(e.url) || '?')[0].toUpperCase()) + '</span>';
        const b = h('<div class="st-tab' + (t === cur ? ' on' : '') + '" role="tab" aria-selected="' + (t === cur) + '"><button class="st-tabgo" data-nav data-key="st:t' + i + '">' + mark + '<span>' + esc(name) + '</span></button><button class="st-x" data-nav data-key="st:x' + i + '" aria-label="Close ' + esc(name) + '">' + icon('close') + '</button></div>');
        b.querySelector('.st-tabgo').onclick = () => select(t);
        b.querySelector('.st-tabgo').onauxclick = (ev) => { if (ev.button === 1) closeTab(t); };
        b.querySelector('.st-x').onclick = () => closeTab(t);
        tabsEl.appendChild(b);
      });
      const add = h('<button class="st-ic st-add" data-nav data-key="st:new" aria-label="New tab (Ctrl+T)">' + icon('plus') + '</button>');
      add.onclick = () => newTab();
      tabsEl.appendChild(add);
    }
    function paintNav() {
      root.querySelector('[data-a="back"]').disabled = !cur || cur.at <= 0;
      root.querySelector('[data-a="fwd"]').disabled = !cur || cur.at >= cur.hist.length - 1;
    }

    // ---- going places ----
    function go(t, url, opts) {
      const how = L.howToShow(url, location.href);
      const e = { url, how: how.how, show: how.url, video: !!how.video, title: host(url) };
      t.hist = t.hist.slice(0, t.at + 1); t.hist.push(e); t.at = t.hist.length - 1;
      show(t, opts);
    }
    function show(t, opts) {
      const e = t.hist[t.at];
      if (!e) return;
      if (e.how === 'ntp') { t.el.innerHTML = ''; t.el.appendChild(ntp); fitSky(); }
      else if (e.how === 'frame') {
        if (ntp.parentNode === t.el) ntp.remove();
        t.el.innerHTML = '';
        const sameOrigin = L.hostOf(e.show) === location.hostname;
        const f = h('<iframe class="st-frame" title="' + esc(e.title) + '" allow="fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write" referrerpolicy="strict-origin-when-cross-origin"></iframe>');
        if (!sameOrigin) f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-presentation');
        f.src = e.show;
        f.onload = () => {
          try { const w = f.contentWindow, doc = f.contentDocument; if (doc) { e.title = doc.title || e.title; e.url = w.location.href; if (t === cur) omni.value = e.url; paintTabs(); ctx.setTitle(e.title + ' — SereneTab'); } } catch (err) { /* another site: we can't read its title */ }
        };
        t.el.appendChild(f);
        if (!sameOrigin && !e.video) {
          const hint = h('<div class="st-hint"><span>Blank or an error? Some sites won\'t show inside another page.</span><button class="st-pill" data-nav data-key="st:own">' + icon('out') + 'Open in its own window</button><button class="st-ic small" data-nav data-key="st:hintx" aria-label="Hide this">' + icon('close') + '</button></div>');
          hint.querySelector('[data-key="st:own"]').onclick = () => openOutside(e.url);
          hint.querySelector('[data-key="st:hintx"]').onclick = () => hint.remove();
          t.el.appendChild(hint);
        }
      } else {
        if (ntp.parentNode === t.el) ntp.remove();
        const where = D.sys ? 'It opened in Chromium, on top of Dice. Close that window (×) to come back.' : 'It opened in a new tab of your browser.';
        t.el.innerHTML = '<div class="st-away"><div class="st-awaycard"><span class="st-mono big" style="--c:' + colourOf(e.url) + '">' + esc((host(e.url) || '?')[0].toUpperCase()) + '</span>' +
          '<h2>' + esc(host(e.url) || e.url) + ' opens in its own window</h2><p>This site doesn\'t let other pages show it inside them. ' + (opts && opts.user ? where : 'Open it when you\'re ready.') + '</p>' +
          '<button class="st-pill go" data-nav data-key="st:again">' + icon('out') + (opts && opts.user ? 'Open it again' : 'Open it') + '</button></div></div>';
        t.el.querySelector('[data-key="st:again"]').onclick = () => openOutside(e.url);
        if (opts && opts.user) openOutside(e.url);
      }
      if (t === cur) { omni.value = e.how === 'ntp' ? '' : e.url; paintNav(); ctx.setTitle(e.how === 'ntp' ? 'SereneTab' : (e.title || host(e.url)) + ' — SereneTab'); }
      paintTabs(); save();
    }
    function visit(text, opts) {
      const v = String(text || '').trim();
      // "/dice" means a page on this website
      const r = /^\/[^/]/.test(v) ? { url: new URL(v, D.origin + '/').href, search: false } : L.omni(v, S.engine);
      if (!r) return;
      if (opts && opts.newTab) newTab(r.url, { user: true, after: true });
      else go(cur, r.url, { user: true });
      root.focus({ preventScroll: true }); // keep the keys (Ctrl+L, Alt+Left…) with SereneTab
    }
    root.querySelector('.st-omni').onsubmit = (ev) => { ev.preventDefault(); visit(omni.value); };
    omni.addEventListener('focus', () => omni.select());
    root.querySelector('.st-bar .st-eng').onclick = (ev) => engineMenu(ev.currentTarget);
    root.querySelector('[data-a="back"]').onclick = () => { if (cur.at > 0) { cur.at--; show(cur); } };
    root.querySelector('[data-a="fwd"]').onclick = () => { if (cur.at < cur.hist.length - 1) { cur.at++; show(cur); } };
    root.querySelector('[data-a="reload"]').onclick = () => { const e = cur.hist[cur.at]; if (e.how === 'ntp') { skyAt = 0; loadWeather(true); } else show(cur); };
    root.querySelector('[data-a="home"]').onclick = () => newTab();
    root.addEventListener('keydown', (ev) => {
      const k = ev.key.toLowerCase(), mod = ev.ctrlKey || ev.metaKey;
      if (mod && k === 't') { ev.preventDefault(); newTab(); }
      else if (mod && k === 'w') { ev.preventDefault(); closeTab(cur); }
      else if (mod && k === 'l') { ev.preventDefault(); omni.focus(); }
      else if (ev.altKey && k === 'arrowleft') { ev.preventDefault(); root.querySelector('[data-a="back"]').click(); }
      else if (ev.altKey && k === 'arrowright') { ev.preventDefault(); root.querySelector('[data-a="fwd"]').click(); }
      else if (k === 'escape' && !pop.hidden) { pop.hidden = true; }
    });

    // ---- the new tab page ----
    const ntp = h('<div class="st-ntp"><canvas class="st-sky" aria-hidden="true"></canvas><div class="st-ntp-in">' +
      '<div class="st-main"><div class="st-top"><div class="st-clock" aria-hidden="true">' + CLOCK + '</div><div class="st-hello"><h1 class="st-greet"></h1><p class="st-date"></p></div></div>' +
        '<form class="st-find" role="search"><button type="button" class="st-eng" data-nav data-key="st:eng2" aria-haspopup="menu"></button><input data-nav data-key="st:find" autocomplete="off" spellcheck="false" aria-label="Search or type a web address"><button class="st-ic" data-nav data-key="st:findgo" aria-label="Go">' + icon('search') + '</button></form>' +
        '<div class="st-lattice" aria-label="Shortcuts"></div></div>' +
      '<div class="st-side"><section class="st-wx" aria-label="Weather"></section><section class="st-note"><label for="st-note-' + ctx.id + '">Note</label><textarea id="st-note-' + ctx.id + '" placeholder="Anything you want to keep in mind"></textarea></section></div>' +
      '</div><div class="st-city"><button class="st-ic small" data-nav data-key="st:cprev" data-c="-1" aria-label="Previous city">' + icon('back') + '</button><span class="st-cityname"></span><button class="st-ic small" data-nav data-key="st:cnext" data-c="1" aria-label="Next city">' + icon('fwd') + '</button></div></div>');
    const canvas = ntp.querySelector('.st-sky'), g = canvas.getContext('2d');
    ntp.querySelector('.st-find').onsubmit = (ev) => { ev.preventDefault(); const v = ntp.querySelector('.st-find input').value; ntp.querySelector('.st-find input').value = ''; visit(v); };
    ntp.querySelector('.st-find .st-eng').onclick = (ev) => engineMenu(ev.currentTarget);
    const note = ntp.querySelector('textarea');
    note.value = S.note;
    let noteT = 0;
    note.oninput = () => { S.note = note.value; clearTimeout(noteT); noteT = setTimeout(() => D.save(), 400); };
    ntp.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => { S.city = CITY_IDS[(CITY_IDS.indexOf(S.city) + +b.dataset.c + CITY_IDS.length) % CITY_IDS.length]; D.save(); skyAt = 0; wxCity = null; loadWeather(); paintCity(); }; });

    let editing = false;
    function paintLattice() {
      const box = ntp.querySelector('.st-lattice');
      box.innerHTML = '';
      box.classList.toggle('editing', editing);
      S.shortcuts.forEach((sc, i) => {
        const b = h('<div class="st-cubewrap"><button class="st-cube" data-nav data-key="st:sc' + i + '" style="--c:' + colourOf(sc.url) + '" title="' + esc(sc.url) + '"><span class="st-cf">' + esc((sc.name || host(sc.url) || '?')[0].toUpperCase()) + '</span></button><span class="st-cn">' + esc(sc.name || host(sc.url)) + '</span></div>');
        b.querySelector('.st-cube').onclick = (ev) => { if (editing) { S.shortcuts.splice(i, 1); D.save(); paintLattice(); return; } if (ev.ctrlKey || ev.metaKey) newTab(sc.url, { user: true, after: true }); else go(cur, sc.url, { user: true }); };
        if (editing) b.querySelector('.st-cube').setAttribute('aria-label', 'Remove ' + (sc.name || host(sc.url)));
        box.appendChild(b);
      });
      if (S.shortcuts.length < 12) {
        const add = h('<div class="st-cubewrap"><button class="st-cube add" data-nav data-key="st:scadd" aria-label="Add a shortcut"><span class="st-cf">' + icon('plus') + '</span></button><span class="st-cn">Add</span></div>');
        add.querySelector('button').onclick = addShortcut;
        box.appendChild(add);
      }
      const ed = h('<button class="st-pill small st-edit" data-nav data-key="st:scedit">' + (editing ? 'Done' : icon('edit') + 'Edit') + '</button>');
      ed.onclick = () => { editing = !editing; paintLattice(); };
      box.appendChild(ed);
    }
    function addShortcut() {
      pop.innerHTML = '<p class="st-pop-t">New shortcut</p><form class="st-addform"><input data-nav data-key="st:scname" placeholder="Name" aria-label="Name"><input data-nav data-key="st:scurl" placeholder="Web address" aria-label="Web address" required><button class="st-pill go" data-nav data-key="st:scsave">Add it</button></form>';
      const r = ntp.querySelector('.st-lattice').getBoundingClientRect(), rr = root.getBoundingClientRect();
      pop.style.left = Math.max(8, r.left - rr.left) + 'px'; pop.style.top = Math.max(8, r.top - rr.top - 150) + 'px';
      pop.hidden = false;
      const [nm, ad] = pop.querySelectorAll('input');
      setTimeout(() => nm.focus(), 0);
      pop.querySelector('form').onsubmit = (ev) => {
        ev.preventDefault();
        const r2 = L.omni(ad.value, S.engine);
        if (!r2 || r2.search) { ad.setCustomValidity('Type a web address, like example.com'); ad.reportValidity(); ad.oninput = () => ad.setCustomValidity(''); return; }
        S.shortcuts.push({ name: nm.value.trim() || host(r2.url), url: r2.url }); D.save(); pop.hidden = true; paintLattice();
      };
    }

    function greet() {
      const now = new Date(), hr = now.getHours(), name = D.state.name && D.state.name !== 'player' ? ', ' + D.state.name : '';
      ntp.querySelector('.st-greet').textContent = (hr < 5 ? 'Good night' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : hr < 22 ? 'Good evening' : 'Good night') + name;
      ntp.querySelector('.st-date').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    }
    function paintCity() {
      const C = G.Skyline.CITIES[S.city], w = wxCity && L.weatherWords(wxCity.code);
      ntp.querySelector('.st-cityname').textContent = C.name + ', ' + L.cityTime(new Date(), C.tz) + (w && w.text ? ', ' + w.text.toLowerCase() : '');
    }
    function paintWeather(err) {
      const box = ntp.querySelector('.st-wx'), C = G.Skyline.CITIES[S.city];
      const place = S.place || { name: C.name }, d = S.place ? wxHere : wxCity;
      const u = '°';
      if (!d) {
        box.innerHTML = '<p class="st-wx-what">' + (err ? 'No weather right now. It needs the internet.' : 'Looking at the sky…') + '</p>';
      } else {
        const w = L.weatherWords(d.code), night = sky ? sky.night : D.night();
        box.innerHTML = '<div class="st-wx-top">' + wxIcon(w.kind, night) + '<b class="st-temp" data-nav data-key="st:units" role="button" tabindex="0" title="Switch between °F and °C">' + d.t + u + '<small>' + S.units.toUpperCase() + '</small></b></div>' +
          '<p class="st-wx-what">' + esc(w.text) + '</p><p class="st-wx-hl">High ' + d.hi + u + ', low ' + d.lo + u + '</p>';
        const tmp = box.querySelector('.st-temp');
        tmp.onclick = () => { S.units = S.units === 'f' ? 'c' : 'f'; D.save(); wxCity = wxHere = null; loadWeather(); };
        tmp.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); tmp.click(); } };
      }
      const line = h('<p class="st-wx-place"><span>' + esc(place.name) + '</span><button class="st-link" data-nav data-key="st:place">Change</button></p>');
      line.querySelector('button').onclick = () => {
        line.innerHTML = '<form class="st-placeform"><input data-nav data-key="st:placein" placeholder="Town or city" aria-label="Town or city for the weather"><button class="st-link" data-nav data-key="st:placego">Show</button>' + (S.place ? '<button type="button" class="st-link" data-nav data-key="st:placeoff">Use ' + esc(C.name) + '</button>' : '') + '</form>';
        const f = line.querySelector('form'), inp = f.querySelector('input');
        inp.focus();
        const off = f.querySelector('[data-key="st:placeoff"]');
        if (off) off.onclick = () => { S.place = null; D.save(); paintWeather(); };
        f.onsubmit = async (ev) => {
          ev.preventDefault();
          if (!inp.value.trim()) return;
          try { const p = await findPlace(inp.value.trim()); if (!p) { inp.value = ''; inp.placeholder = 'No town by that name'; return; } S.place = p; wxHere = null; D.save(); loadWeather(); } catch (e2) { inp.value = ''; inp.placeholder = 'Can\'t look that up offline'; }
        };
      };
      box.appendChild(line);
    }
    async function loadWeather(fresh) {
      if (fresh) wxCache.clear();
      const C = G.Skyline.CITIES[S.city];
      let err = false;
      try { wxCity = await weather(C.lat, C.lon, S.units); } catch (e) { err = true; }
      if (S.place) { try { wxHere = await weather(S.place.lat, S.place.lon, S.units); } catch (e) { err = true; } }
      if (dead) return;
      skyAt = 0; paintWeather(err); paintCity();
    }

    // the skyline fills the page, a few screen pixels to each of its pixels
    let cell = 3;
    function fitSky() {
      const w = ntp.clientWidth, hh = ntp.clientHeight;
      if (!w || !hh) return;
      cell = Math.max(2, Math.round(Math.max(w, hh * 1.5) / 440));
      const W = Math.ceil(w / cell), H = Math.ceil(hh / cell);
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; skyAt = 0; }
      canvas.style.width = W * cell + 'px'; canvas.style.height = H * cell + 'px';
    }
    function buildSky() {
      fitSky();
      if (!canvas.width || canvas.width < 2) return;
      sky = new G.Skyline({ city: S.city, W: canvas.width, H: canvas.height, now: new Date(), weather: wxCity ? L.weatherWords(wxCity.code) : { kind: 'clear' } });
      skyAt = Date.now();
      ntp.classList.toggle('dark', sky.night);
      root.classList.toggle('st-darkchrome', sky.night && cur && cur.hist[cur.at] && cur.hist[cur.at].how === 'ntp');
    }
    let lastSec = -1;
    function tickClock() {
      const now = new Date(), sec = now.getSeconds();
      if (sec === lastSec) return;
      lastSec = sec;
      const m = now.getMinutes() + sec / 60, hr = (now.getHours() % 12) + m / 60, face = ntp.querySelector('.st-face');
      face.querySelector('.hh').setAttribute('transform', 'rotate(' + hr * 30 + ' 50 50)');
      face.querySelector('.mh').setAttribute('transform', 'rotate(' + m * 6 + ' 50 50)');
      face.querySelector('.sh').setAttribute('transform', 'rotate(' + sec * 6 + ' 50 50)');
      if (sec === 0 || !ntp.querySelector('.st-greet').textContent) { greet(); paintCity(); }
    }

    paintEngine(); greet(); paintLattice(); paintWeather(); loadWeather();
    // put back the tabs from last time
    const saved = Array.isArray(S.tabs) ? S.tabs.slice(0, 12) : [];
    if (ctx.arg && typeof ctx.arg === 'string') saved.push(ctx.arg);
    if (!saved.length) saved.push('');
    saved.forEach((u) => {
      const t = { id: ++seq, hist: [], at: -1, el: h('<div class="st-page" hidden></div>') };
      pages.appendChild(t.el); tabs.push(t);
      if (u) go(t, u); else { t.hist = [{ url: '', how: 'ntp', title: 'New tab' }]; t.at = 0; }
    });
    select(tabs[ctx.arg ? tabs.length - 1 : Math.max(0, Math.min(tabs.length - 1, S.active | 0))]);
    paintEngine();
    setTimeout(() => { if (ctx.mode === 'run') D.nav.first(root); }, 40);
    ctx.legend([['a', 'Open'], ['b', 'Back']]);

    return {
      frame(now) {
        if (!ntp.isConnected || ntp.parentNode.hidden) return;
        tickClock();
        if (!sky || Date.now() - skyAt > 5 * 60e3 || !skyAt) buildSky();
        if (sky) sky.draw(g, now / 1000, D.state.motion === 'less');
      },
      resize() { skyAt = 0; },
      onAction(a) {
        if (a === 'a') { // Enter or the A button: send the box you're typing in, or press the button
          const el = document.activeElement;
          if (!el || !root.contains(el)) return false;
          if (el.form) { el.form.requestSubmit(); return true; }
          if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') { el.click(); return true; }
          return false;
        }
        if (a === 'b') {
          if (!pop.hidden) { pop.hidden = true; return true; }
          if (cur && cur.at > 0) { cur.at--; show(cur); return true; }
          return false;
        }
        return false;
      },
      unmount() { dead = true; clearTimeout(noteT); S.note = note.value; save(); },
    };
  } });
})();
