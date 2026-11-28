// SereneTab: DiceWeb's web browser, rebuilt in 2.6 to fit more on the screen.
//
// The tabs live down the left side, so there's room for lots of them (and they
// fold down to little tiles on a small screen, or with Ctrl+\). One slim bar
// across the top holds back, forward, reload and the address bar; Shield,
// zoom and "Save for later" sit inside the address bar. Everything else is page.
//
// The new tab page is a calm city skyline under its real sky, with more on it:
// the clock (a focus timer too), the weather and the next few hours, up to 24
// shortcuts, "Jump back in" (tabs you closed and places you've been), "Later"
// (pages you saved to read), what's due today from Axiom, and a note.
//
// Pages open inside SereneTab when the site allows it. Big sites that refuse to
// be shown inside another page open in their own window instead: on DiceOS a
// SereneTab window (Chromium with this new tab page and Shield), or a new tab
// in your browser. Also here: Deuce's answers in a tab ("?" or a question in the
// address bar), pinned and private tabs, split view, zoom and History.
// D.browse(url) opens any address here: on DiceOS, links from every app come this way.
(function () {
  'use strict';
  const D = window.Dice, G = window.DiceGfx, L = window.DiceLogic, h = D.h, esc = D.esc;
  const CITY_IDS = Object.keys(G.Skyline.CITIES);
  const HUES = ['#e0705a', '#e9a23b', '#5aa469', '#3f8fd8', '#8a6bd8', '#d45d9a', '#2fa5a0', '#7a86a3'];
  const MAX_KEYS = 24;
  const host = (u) => L.hostOf(u).replace(/^www\./, '');
  // the letter on a site's tile: en.wikipedia.org is W, not E
  const letter = (u) => (host(u).replace(/^(m|[a-z]{2})\./, '') || '?')[0].toUpperCase();
  const colourOf = (s) => HUES[G.hash(host(s) || s) % HUES.length];
  const ago = (t) => {
    const s = (Date.now() - t) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' hr ago';
    const d = Math.round(s / 86400);
    return d === 1 ? 'yesterday' : d + ' days ago';
  };

  function defaults() {
    const ha = (D.sys && D.sys.settings && D.sys.settings.homeassistant) || D.state.ha || '';
    return [ha && { name: 'Home Assistant', url: ha }, { name: 'djp7', url: D.origin }, { name: 'Wikipedia', url: 'https://en.wikipedia.org' },
      { name: 'YouTube', url: 'https://www.youtube.com' }, { name: 'GitHub', url: 'https://github.com' }, { name: 'MDN', url: 'https://developer.mozilla.org' },
      { name: 'OpenStreetMap', url: 'https://www.openstreetmap.org' }].filter(Boolean);
  }
  // a SereneTab window's new tab page (DiceOS gives it SereneTab's settings, nothing else)
  D.serenePage = !!window.DICE_SERENE || /[?&]serene=1(&|$)/.test(location.search);
  function settings() {
    const s = D.state.st || (D.state.st = {});
    const from = window.DICE_SERENE && window.DICE_SERENE.serene;
    if (from && !settings.took) {
      settings.took = true;
      if (Array.isArray(from.shortcuts) && from.shortcuts.length) s.shortcuts = from.shortcuts.filter((x) => x && /^https?:/.test(x.url)).slice(0, MAX_KEYS);
      ['engine', 'city', 'units'].forEach((k) => { if (typeof from[k] === 'string') s[k] = from[k]; });
      if (window.DICE_SERENE.name) D.state.name = String(window.DICE_SERENE.name).slice(0, 20);
      if (window.DICE_SERENE.looks) D.state.looks = /^(traced|heaven)$/.test(window.DICE_SERENE.looks) ? 'traced' : 'normal';
    }
    if (!L.ENGINES[s.engine]) s.engine = 'ddg';
    if (!G.Skyline.CITIES[s.city]) s.city = 'newyork';
    if (!Array.isArray(s.shortcuts)) s.shortcuts = defaults();
    if (!Array.isArray(s.later)) s.later = [];
    if (!Array.isArray(s.history)) s.history = [];
    if (s.units !== 'f' && s.units !== 'c') s.units = /^en-US$/i.test(navigator.language || '') ? 'f' : 'c';
    if (!/^(auto|open|shut)$/.test(s.rail || '')) s.rail = 'auto';
    if (typeof s.note !== 'string') s.note = '';
    return s;
  }

  // ---- the weather, from Open-Meteo (free, no key). Dice Home, DiceTV and Deuce use it too --------
  const wxCache = new Map();
  async function weather(lat, lon, units) {
    const key = lat.toFixed(2) + ',' + lon.toFixed(2) + units, hit = wxCache.get(key);
    if (hit && Date.now() - hit.at < 15 * 60e3) return hit.data;
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2' +
      (units === 'f' ? '&temperature_unit=fahrenheit' : ''));
    if (!r.ok) throw new Error('weather ' + r.status);
    const j = await r.json(), c = j.current, hr = j.hourly || { time: [] };
    // the next few hours, from the one after now
    const from = Math.max(0, hr.time.findIndex((t) => t > c.time));
    const hours = hr.time.slice(from, from + 6).map((t, i) => ({ time: t, t: Math.round(hr.temperature_2m[from + i]), code: hr.weather_code[from + i] }));
    const data = { t: Math.round(c.temperature_2m), code: c.weather_code, hi: Math.round(j.daily.temperature_2m_max[0]), lo: Math.round(j.daily.temperature_2m_min[0]), daily: j.daily, hours };
    wxCache.set(key, { at: Date.now(), data });
    return data;
  }
  async function findPlace(q) {
    const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=' + encodeURIComponent(q));
    if (!r.ok) throw new Error('place ' + r.status);
    const j = await r.json(), p = j.results && j.results[0];
    return p ? { name: p.name, lat: p.latitude, lon: p.longitude } : null;
  }
  D.weather = { get: weather, find: findPlace, words: L.weatherWords };

  // ---- small pictures (smooth line drawings, to suit the glass) ----------------------------
  const ICON = {
    back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>', fwd: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
    reload: '<path d="M18.5 12a6.5 6.5 0 1 1-2-4.7"/><path d="M17.5 4v4h-4"/>', plus: '<path d="M12 6v12M6 12h12"/>', close: '<path d="M7.5 7.5l9 9M16.5 7.5l-9 9"/>',
    out: '<path d="M13 5h6v6"/><path d="M19 5l-8 8"/><path d="M17 14v4a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 18V8.5A1.5 1.5 0 0 1 6.5 7H10"/>',
    edit: '<path d="M5 19l1-4L15.5 5.5a2 2 0 0 1 3 3L9 18z"/>', search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="M15 15l4.5 4.5"/>',
    more: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>', history: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 4.5v3.5h3.5"/><path d="M12 8v4.2l2.8 1.8"/>',
    undo: '<path d="M9 7L4.5 11.5 9 16"/><path d="M5 11.5h9a5 5 0 0 1 0 10h-2"/>', trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>', check: '<path d="M5.5 12.5l4 4 9-9"/>',
    shield: '<path d="M12 3.5l7 2.6v5.6c0 4.4-3 7.6-7 8.8-4-1.2-7-4.4-7-8.8V6.1z"/>', pin: '<path d="M9.5 4.5h5l-.8 5 3.3 3v1.5h-10V12.5l3.3-3z"/><path d="M12 14v5.5"/>',
    mask: '<path d="M4 9c2.5-1.5 13.5-1.5 16 0 0 4-2 7-4.5 7-1.8 0-2.3-2-3.5-2s-1.7 2-3.5 2C6 16 4 13 4 9z"/><circle cx="8.6" cy="11" r="1.2"/><circle cx="15.4" cy="11" r="1.2"/>',
    split: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M12 5v14"/>', ask: '<circle cx="12" cy="12" r="8"/><circle cx="9.5" cy="9.5" r="1.6" fill="currentColor"/><circle cx="14.5" cy="14.5" r="1.6" fill="currentColor"/>',
    minus: '<path d="M6 12h12"/>', rail: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M9 5v14"/><path d="M5.8 8.5h1.2M5.8 11h1.2"/>',
    later: '<path d="M7 4.5h10v15l-5-3.6-5 3.6z"/>', copy: '<rect x="8.5" y="8.5" width="10.5" height="10.5" rx="2"/><path d="M5 15V6.5A1.5 1.5 0 0 1 6.5 5H15"/>',
    star: '<path d="M12 4.5l2.3 4.7 5.2.7-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1-3.8-3.6 5.2-.7z"/>', send: '<path d="M4.5 12L19.5 5l-4 14-3.5-5.5z"/><path d="M12 13.5l7.5-8.5"/>',
  };
  const icon = (n) => '<svg class="st-svg" viewBox="0 0 24 24" aria-hidden="true">' + ICON[n] + '</svg>';
  const mono = (c, inner, cls) => '<span class="st-mono' + (cls ? ' ' + cls : '') + '" style="--c:' + c + '">' + inner + '</span>';
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
  D.weather.icon = wxIcon;
  // the glass clock's face: ticks, then hands we turn each second
  const CLOCK = '<svg viewBox="0 0 100 100" class="st-face">' +
    Array.from({ length: 12 }, (_, i) => '<path d="M50 ' + (i % 3 ? 9 : 7) + 'V' + (i % 3 ? 13 : 15) + '" transform="rotate(' + i * 30 + ' 50 50)" class="tick' + (i % 3 ? '' : ' big') + '"/>').join('') +
    '<circle class="track" cx="50" cy="50" r="46.5"/><circle class="ring" cx="50" cy="50" r="46.5" pathLength="100" transform="rotate(-90 50 50)"/>' +
    '<path class="hh" d="M50 50V27"/><path class="mh" d="M50 50V15"/><path class="sh" d="M50 58V12"/><circle cx="50" cy="50" r="3" class="hub"/></svg>';

  // ---- SereneTab, the browser for everything: D.browse(url) -------------------------------------
  const SR = D.serene = { live: 0, site: () => '', reload: () => {}, open: null, page: () => null };
  D.browse = function (url) {
    if (!url) return;
    if (SR.open && SR.live > 0) {
      SR.open(url);
      if (D.desk && D.desk.on) { const w = D.desk.wins.filter((x) => x.id === 'browser').pop(); if (w) D.desk.focus(w); } else if (!D.$('#app.running')) D.launch('browser');
      return;
    }
    if (D.app('browser')) D.launch('browser', { arg: url });
    else window.open(url, '_blank', 'noopener');
  };
  // a question for Deuce, as a page in a tab
  const askUrl = (q) => 'serene:ask?q=' + encodeURIComponent(q);
  const askOf = (u) => { const m = /^serene:ask\?q=(.*)$/.exec(u || ''); return m ? decodeURIComponent(m[1]) : null; };
  const looksLikeQuestion = (v) => /\?\s*$/.test(v) || /^(who|what|whats|when|where|why|how|which|is|are|can|does|do|should|explain|define)\b/i.test(v.trim()) && v.trim().split(/\s+/).length >= 3;

  D.register({ id: 'browser', mount(root, ctx) {
    const S = settings();
    const solo = !!D.serenePage; // a SereneTab window's new tab page on DiceOS: just the page
    SR.live++;
    root.classList.add('st');
    root.classList.toggle('st-solo', solo);
    root.classList.toggle('st-run', ctx.mode === 'run'); // full screen on DiceTV, with its hints along the bottom
    root.tabIndex = -1;
    root.innerHTML =
      '<aside class="st-rail" aria-label="Tabs">' +
        '<div class="st-rhead"><button class="st-ic st-logo" data-nav data-key="st:home" data-a="new" aria-label="New tab (Ctrl+T)">' + G.sereneSvg(22, 'light') + '</button>' +
          '<button class="st-ic small st-railbtn" data-nav data-key="st:rail" data-a="rail">' + icon('rail') + '</button></div>' +
        '<label class="st-tfind" hidden><span class="st-svgw">' + icon('search') + '</span><input data-nav data-key="st:tfind" placeholder="Find a tab" aria-label="Find a tab" autocomplete="off" spellcheck="false"></label>' +
        '<div class="st-pins" aria-label="Pinned tabs"></div>' +
        '<div class="st-tlist" role="tablist" aria-orientation="vertical"></div>' +
        '<button class="st-newtab" data-nav data-key="st:new" data-a="new" aria-label="New tab (Ctrl+T)">' + icon('plus') + '<span>New tab</span><kbd>Ctrl T</kbd></button>' +
        '<div class="st-rfoot">' +
          '<button class="st-ic small" data-nav data-key="st:fhist" data-a="history" aria-label="History (Ctrl+H)" title="History">' + icon('history') + '</button>' +
          '<button class="st-ic small" data-nav data-key="st:fpriv" data-a="priv" aria-label="New private tab (Ctrl+Shift+N)" title="New private tab">' + icon('mask') + '</button>' +
          '<button class="st-ic small" data-nav data-key="st:fundo" data-a="reopen" aria-label="Reopen closed tab (Ctrl+Shift+T)" title="Reopen closed tab">' + icon('undo') + '</button>' +
        '</div>' +
      '</aside>' +
      '<div class="st-view"><div class="st-bar">' +
        '<button class="st-ic" data-nav data-key="st:back" data-a="back" aria-label="Back (Alt+Left)">' + icon('back') + '</button>' +
        '<button class="st-ic st-fwd" data-nav data-key="st:fwd" data-a="fwd" aria-label="Forward (Alt+Right)">' + icon('fwd') + '</button>' +
        '<button class="st-ic" data-nav data-key="st:reload" data-a="reload" aria-label="Reload (Ctrl+R)">' + icon('reload') + '</button>' +
        '<form class="st-omni" role="search"><button type="button" class="st-eng" data-nav data-key="st:eng" aria-haspopup="menu"></button>' +
          '<input data-nav data-key="st:omni" aria-label="Search or type a web address" autocomplete="off" spellcheck="false">' +
          '<button type="button" class="st-zoom" data-nav data-key="st:zoom" hidden title="Back to 100%"></button>' +
          '<button type="button" class="st-ic small st-save" data-nav data-key="st:save" data-a="save" hidden>' + icon('later') + '</button>' +
          '<button type="button" class="st-ic small st-shield" data-nav data-key="st:shield" data-a="shield" aria-haspopup="dialog" hidden>' + icon('shield') + '<span class="st-badge" hidden></span></button></form>' +
        '<button class="st-ic st-splitbtn" data-nav data-key="st:split" data-a="split" aria-label="Split view">' + icon('split') + '</button>' +
        '<button class="st-ic" data-nav data-key="st:menu" data-a="menu" aria-label="More" aria-haspopup="menu">' + icon('more') + '</button>' +
      '</div><div class="st-pages"></div></div>' +
      '<div class="st-pop" hidden role="menu"></div><div class="st-sugg" hidden role="listbox" aria-label="Suggestions"></div>';
    const $ = (s) => root.querySelector(s);
    const pinsEl = $('.st-pins'), tlist = $('.st-tlist'), tfind = $('.st-tfind input'), pages = $('.st-pages'), omni = $('.st-omni input'), pop = $('.st-pop');
    let tabs = [], cur = null, seq = 0, sky = null, skyAt = 0, wxCity = null, wxHere = null, dead = false, split = null, railShut = false;
    const closed = []; // tabs you closed, newest last, so Ctrl+Shift+T can bring them back
    const offs = [];
    const openOutside = (url) => (D.sys ? D.sys.open(url) : window.open(url, '_blank', 'noopener'));
    const entry = (t) => (t && t.hist[t.at]) || { how: 'ntp', url: '' };
    const isWeb = (e) => /^https?:/.test((e && e.url) || '');
    // the tabs, kept for next time (private tabs aren't; pinned ones remember they're pinned)
    const save = () => {
      if (solo) return;
      const keep = tabs.filter((t) => !t.priv);
      S.tabs = keep.map((t) => { const e = entry(t), u = /^(ntp|history)$/.test(e.how) ? '' : e.url; return t.pin ? { u, p: 1 } : u; });
      S.active = Math.max(0, keep.indexOf(cur));
      D.save();
    };
    // what a SereneTab window's new tab page shows on DiceOS: your shortcuts, search engine and city
    let shareT = 0;
    const share = () => { if (!D.sys || D.sys.info.emulated) return; clearTimeout(shareT); shareT = setTimeout(() => D.sys.saveSettings({ serene: { shortcuts: S.shortcuts.slice(0, MAX_KEYS), engine: S.engine, city: S.city, units: S.units } }), 1500); };

    // ---- pop-up menus, placed by a button and kept inside SereneTab ----
    function popUp(html, at, side) {
      pop.innerHTML = html; pop.hidden = false;
      const rr = root.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
      let x, y;
      if (at instanceof Element) { const r = at.getBoundingClientRect(); x = side === 'right' ? r.right - rr.left - pw : r.left - rr.left; y = r.bottom - rr.top + 6; if (y + ph > rr.height - 8) y = r.top - rr.top - ph - 6; }
      else { x = at.x - rr.left; y = at.y - rr.top; if (y + ph > rr.height - 8) y = at.y - rr.top - ph; }
      pop.style.left = Math.max(8, Math.min(rr.width - pw - 8, x)) + 'px'; pop.style.top = Math.max(8, Math.min(rr.height - ph - 8, y)) + 'px';
      setTimeout(() => { const f = pop.querySelector('[aria-checked="true"]') || pop.querySelector('button:not([disabled]), input'); if (f) f.focus(); }, 0);
    }
    const popItem = (key, ic, label, kbd, extra) => '<button role="menuitem" data-nav data-key="st:m-' + key + '" data-m="' + key + '"' + (extra || '') + '>' + icon(ic) + '<span>' + label + '</span>' + (kbd ? '<kbd>' + kbd + '</kbd>' : '') + '</button>';
    const onPick = (fn) => pop.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { pop.hidden = true; fn(b.dataset.m, b); }; });
    root.addEventListener('pointerdown', (e) => { if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('[aria-haspopup]')) pop.hidden = true; });

    // ---- the search engine button and its menu ----
    function paintEngine() {
      const e = L.ENGINES[S.engine];
      root.querySelectorAll('.st-bar .st-eng').forEach((b) => { b.textContent = e.mark; b.style.setProperty('--c', e.c); b.setAttribute('aria-label', 'Search with ' + e.name + ' (change)'); });
      omni.placeholder = 'Search with ' + e.name + ' or type an address';
      const b2 = ntp.querySelector('.st-find .st-eng'); b2.textContent = e.mark; b2.style.setProperty('--c', e.c); b2.setAttribute('aria-label', 'Search with ' + e.name + ' (change)');
      ntp.querySelector('.st-find input').placeholder = omni.placeholder;
    }
    function engineMenu(from) {
      popUp('<p class="st-pop-t">Search with</p>' + Object.entries(L.ENGINES).map(([k, e]) => '<button role="menuitemradio" aria-checked="' + (k === S.engine) + '" data-nav data-key="st:e-' + k + '" data-e="' + k + '"><span class="st-eng" style="--c:' + e.c + '">' + e.mark + '</span>' + esc(e.name) + '</button>').join(''), from);
      pop.querySelectorAll('[data-e]').forEach((b) => { b.onclick = () => { S.engine = b.dataset.e; D.save(); share(); paintEngine(); pop.hidden = true; from.focus(); }; });
    }

    // ---- the sidebar: open, or folded down to tiles (on its own when the window is narrow) ----
    const autoShut = () => root.clientWidth < 1100;
    function paintRail() {
      railShut = !solo && (S.rail === 'shut' || (S.rail === 'auto' && autoShut()));
      root.classList.toggle('st-railshut', railShut);
      const b = $('.st-railbtn');
      b.setAttribute('aria-label', (railShut ? 'Show tab names' : 'Fold the tabs away') + ' (Ctrl+\\)'); b.title = b.getAttribute('aria-label');
    }
    function toggleRail() {
      const want = railShut ? 'open' : 'shut';
      S.rail = (want === 'shut') === autoShut() ? 'auto' : want; // back to "auto" when that's what auto would do anyway
      D.save(); paintRail(); paintTabs();
    }

    // ---- tabs ----
    function titleOf(t) {
      const e = entry(t);
      return e.how === 'ntp' ? 'New tab' : e.how === 'history' ? 'History' : e.title || host(e.url) || e.url;
    }
    function tileOf(t) {
      const e = entry(t);
      if (t.priv) return mono('#6a4fb0', icon('mask'));
      if (e.how === 'ntp') return '<span class="st-mono st-ntpmono">' + G.sereneSvg(16, 'light') + '</span>';
      if (e.how === 'history') return mono('#7a86a3', icon('history'));
      if (e.how === 'ask') return mono('#4b7bec', icon('ask'), 'st-askmono');
      return mono(colourOf(e.url), esc(letter(e.url)));
    }
    function newTab(url, opts) {
      opts = opts || {};
      const t = { id: ++seq, hist: [], at: -1, el: h('<div class="st-page" hidden></div>'), zoom: 1, priv: !!opts.priv };
      pages.appendChild(t.el);
      if (cur && opts.after) tabs.splice(tabs.indexOf(cur) + 1, 0, t); else tabs.push(t);
      if (url) go(t, url, opts); else { t.hist = [{ url: '', how: 'ntp', title: 'New tab' }]; t.at = 0; }
      if (!opts.bg) select(t); else paintTabs();
      if (!url && !opts.quiet && !opts.bg) setTimeout(() => { const f = ntp.querySelector('.st-find input'); if (f) f.focus(); }, 30);
      return t;
    }
    function closeTab(t) {
      const i = tabs.indexOf(t);
      if (i < 0) return;
      tabs.splice(i, 1); t.el.remove();
      if (split && (split.a === t || split.b === t)) endSplit(t);
      const e = entry(t);
      if (!t.priv && e.how !== 'ntp') { closed.push({ hist: t.hist, at: t.at, title: titleOf(t), url: e.url, when: Date.now() }); if (closed.length > 10) closed.shift(); }
      if (!tabs.length) newTab(null, { quiet: true });
      else if (t === cur) select(tabs[Math.min(i, tabs.length - 1)]);
      else paintTabs();
      paintJump(); save();
    }
    function reopen(c) {
      c = c || closed.pop();
      if (!c) return;
      const k = closed.indexOf(c); if (k >= 0) closed.splice(k, 1);
      const t = newTab(null, { quiet: true, bg: true });
      t.hist = c.hist; t.at = c.at; show(t); select(t); paintJump();
    }
    function select(t) {
      // split view: two tabs side by side; picking another tab puts it where the focused one was
      if (split && t !== split.a && t !== split.b) { if (cur === split.b) split.b = t; else split.a = t; }
      cur = t;
      const shown = split ? [split.a, split.b] : [t];
      tabs.forEach((x) => {
        x.el.hidden = !shown.includes(x);
        x.el.classList.toggle('st-paneon', !!split && x === t);
        x.el.classList.toggle('st-left', !!split && x === split.a);
        x.el.classList.toggle('st-right', !!split && x === split.b);
      });
      pages.classList.toggle('split', !!split);
      const e = entry(t);
      if (e.how === 'ntp') { if (ntp.parentNode !== t.el) { t.el.innerHTML = ''; t.el.appendChild(ntp); } fitSky(); }
      // the other half of a split whose page is a new tab: the new tab page can only be in one place
      shown.forEach((x) => { if (x !== t && entry(x).how === 'ntp' && !x.el.firstChild) x.el.innerHTML = '<div class="st-blank st-wash"><p>' + G.sereneSvg(40, 'light') + '<span>New tab. Pick this side to search.</span></p></div>'; });
      omni.value = e.how === 'ntp' ? '' : e.how === 'ask' ? '?' + (askOf(e.url) || '') : e.how === 'history' ? 'serene:history' : e.url;
      if (e.how === 'history') historyPage(t.el);
      root.classList.toggle('st-private', !!t.priv);
      paintTabs(); paintNav(); paintZoom(); paintShield(); paintSave(); save();
      ctx.setTitle(e.how !== 'ntp' ? titleOf(t) + ' — SereneTab' : 'SereneTab');
      const row = tlist.querySelector('.st-tab.on'); if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
    }
    function cycle(d) { const i = tabs.indexOf(cur); select(tabs[(i + d + tabs.length) % tabs.length]); }
    function startSplit(b) {
      if (split || tabs.length < 1) return;
      const a = cur;
      if (!b || b === a) b = tabs.filter((x) => x !== a && entry(x).how !== 'ntp').pop() || tabs.filter((x) => x !== a).pop() || newTab(null, { quiet: true, after: true, bg: true });
      split = { a, b };
      select(a);
    }
    function endSplit(gone) {
      if (!split) return;
      const keep = gone ? (split.a === gone ? split.b : split.a) : cur;
      split = null;
      pages.classList.remove('split');
      tabs.forEach((x) => { x.el.classList.remove('st-paneon', 'st-left', 'st-right'); const b = x.el.querySelector(':scope > .st-blank'); if (b) b.remove(); });
      if (tabs.includes(keep)) select(keep);
    }
    // in split view, clicking into a page focuses its tab (the page itself keeps the click)
    const onBlur = () => setTimeout(() => {
      if (!split) return;
      const f = document.activeElement;
      if (!f || f.tagName !== 'IFRAME' || !pages.contains(f)) return;
      const t = tabs.find((x) => x.el.contains(f));
      if (t && t !== cur) select(t);
    }, 0);
    addEventListener('blur', onBlur);
    pages.addEventListener('pointerdown', (ev) => { if (!split) return; const t = tabs.find((x) => x.el.contains(ev.target)); if (t && t !== cur) select(t); });

    function paintTabs() {
      const q = tfind.value.trim().toLowerCase();
      pinsEl.innerHTML = ''; tlist.innerHTML = '';
      tabs.forEach((t) => {
        const e = entry(t), name = titleOf(t), paired = !!split && (t === split.a || t === split.b);
        if (t.pin) {
          const b = h('<button class="st-pin' + (t === cur ? ' on' : '') + (paired ? ' paired' : '') + '" data-nav data-key="st:p' + t.id + '" title="' + esc(name) + '" aria-label="' + esc(name) + ', pinned">' + tileOf(t) + '</button>');
          b.onclick = () => select(t);
          b.oncontextmenu = (ev) => tabMenu(ev, t);
          pinsEl.appendChild(b);
          return;
        }
        if (q && !name.toLowerCase().includes(q) && !(e.url || '').toLowerCase().includes(q)) return;
        const row = h('<div class="st-tab' + (t === cur ? ' on' : '') + (t.priv ? ' priv' : '') + (paired ? ' paired' : '') + '" role="tab" aria-selected="' + (t === cur) + '" style="--c:' + (t.priv ? '#6a4fb0' : e.how === 'ntp' ? '#4b7bec' : colourOf(e.url)) + '">' +
          '<button class="st-tabgo" data-nav data-key="st:t' + t.id + '" title="' + esc(name) + '">' + tileOf(t) + '<span>' + (t.priv ? '<i>Private</i> ' : '') + esc(name) + '</span></button>' +
          '<button class="st-x" data-nav data-key="st:x' + t.id + '" aria-label="Close ' + esc(name) + '">' + icon('close') + '</button></div>');
        const go1 = row.querySelector('.st-tabgo');
        go1.onclick = () => select(t);
        go1.onauxclick = (ev) => { if (ev.button === 1) closeTab(t); };
        row.oncontextmenu = (ev) => tabMenu(ev, t);
        row.querySelector('.st-x').onclick = () => closeTab(t);
        tlist.appendChild(row);
      });
      if (q && !tlist.children.length) tlist.innerHTML = '<p class="st-empty small">No tab matches.</p>';
      pinsEl.hidden = !tabs.some((t) => t.pin);
      tfind.parentNode.hidden = railShut || (tabs.length < 8 && !q);
      $('.st-splitbtn').classList.toggle('on', !!split);
      $('.st-splitbtn').setAttribute('aria-label', split ? 'Close split view' : 'Split view: two tabs side by side');
      $('[data-a="reopen"]').disabled = !closed.length;
    }
    tfind.addEventListener('input', paintTabs);
    // Enter picks the first tab that matches; Esc (or B) clears the box (see onAction)
    const pickFound = () => { const b = tlist.querySelector('.st-tabgo'); tfind.value = ''; if (b) b.click(); else paintTabs(); };

    // right-click on a tab
    function tabMenu(ev, t) {
      ev.preventDefault();
      const e = entry(t);
      popUp(popItem('pin', 'pin', t.pin ? 'Unpin' : 'Pin') + popItem('dup', 'copy', 'Duplicate') +
        (t !== cur ? popItem('pair', 'split', split ? 'Show in the other half' : 'Open beside this one') : '') +
        (isWeb(e) ? popItem('later', 'later', S.later.some((x) => x.url === e.url) ? 'Remove from Later' : 'Save for later') : '') +
        popItem('others', 'close', 'Close other tabs', '', tabs.filter((x) => x !== t && !x.pin).length ? '' : ' disabled') + popItem('close', 'close', 'Close tab'), { x: ev.clientX, y: ev.clientY });
      onPick((m) => {
        if (m === 'pin') pinTab(t);
        else if (m === 'dup') { const n = newTab(null, { after: true, bg: true, priv: t.priv }); n.hist = t.hist.map((x) => Object.assign({}, x, { thread: x.thread && x.thread.slice() })); n.at = t.at; show(n); select(n); }
        else if (m === 'pair') { if (split) select(t); else startSplit(t); }
        else if (m === 'later') saveLater(t);
        else if (m === 'others') tabs.filter((x) => x !== t && !x.pin).forEach(closeTab);
        else closeTab(t);
      });
    }
    // pinned tabs: tiles at the top of the sidebar, kept between visits
    function pinTab(t) {
      t.pin = !t.pin;
      tabs.splice(tabs.indexOf(t), 1);
      tabs.splice(tabs.reduce((n, x, i) => (x.pin ? i + 1 : n), 0), 0, t);
      paintTabs(); save();
    }
    function paintNav() {
      const e = cur && entry(cur);
      root.classList.toggle('st-darkchrome', !!(sky && sky.night && e && e.how === 'ntp' && !split));
      $('[data-a="back"]').disabled = !cur || cur.at <= 0;
      $('[data-a="fwd"]').disabled = !cur || cur.at >= cur.hist.length - 1;
    }

    // ---- going places ----
    function go(t, url, opts) {
      opts = opts || {};
      const push = (e) => { t.hist = t.hist.slice(0, t.at + 1); t.hist.push(e); t.at = t.hist.length - 1; };
      if (url === 'serene:history') { push({ url, how: 'history', title: 'History' }); show(t); return; }
      const q = askOf(url);
      if (q !== null) { push({ url, how: 'ask', title: q, thread: [] }); show(t); return; }
      const how = L.howToShow(url, location.href);
      if (solo) { location.href = url; return; } // a SereneTab window's new tab page: the window itself goes there
      push({ url, how: how.how, show: how.url, video: !!how.video, title: opts.title || host(url) });
      if (!S.noHistory && !t.priv) S.history = L.remember(S.history, { url, title: opts.title || host(url), at: Date.now(), search: !!opts.search }, 300);
      show(t, opts);
    }
    function show(t, opts) {
      const e = entry(t);
      if (e.how !== 'ntp' && ntp.parentNode === t.el) ntp.remove();
      if (e.how === 'ntp') { t.el.innerHTML = ''; t.el.appendChild(ntp); fitSky(); }
      else if (e.how === 'history') historyPage(t.el);
      else if (e.how === 'ask') askPage(t, e);
      else if (e.how === 'frame') {
        t.el.innerHTML = '';
        const sameOrigin = L.hostOf(e.show) === location.hostname;
        const f = h('<iframe class="st-frame" title="' + esc(e.title) + '" allow="fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write" referrerpolicy="strict-origin-when-cross-origin"></iframe>');
        if (!sameOrigin) f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-presentation');
        f.src = e.show;
        zoomFrame(t, f);
        t.el.classList.add('loading');
        f.onload = () => {
          t.el.classList.remove('loading');
          try {
            const w = f.contentWindow, doc = f.contentDocument;
            if (doc) {
              e.title = doc.title || e.title; e.url = w.location.href;
              if (!S.noHistory && !t.priv) { S.history = L.remember(S.history, { url: e.url, title: e.title, at: Date.now() }, 300); D.save(); }
              if (t === cur) { omni.value = e.url; ctx.setTitle(e.title + ' — SereneTab'); }
              paintTabs();
            }
          } catch (err) { /* another site: we can't read its title */ }
          if (t === cur) { paintShield(); paintSave(); }
        };
        t.el.appendChild(f);
        if (!sameOrigin && !e.video) {
          const hint = h('<div class="st-hint"><span>Blank or an error? Some sites won\'t show inside another page.</span><button class="st-pill small" data-nav data-key="st:own">' + icon('out') + 'Open in its own window</button><button class="st-ic small" data-nav data-key="st:hintx" aria-label="Hide this">' + icon('close') + '</button></div>');
          hint.querySelector('[data-key="st:own"]').onclick = () => openOutside(e.url);
          hint.querySelector('[data-key="st:hintx"]').onclick = () => hint.remove();
          setTimeout(() => hint.classList.add('quiet'), 9000); // it fades back once you've seen it
          t.el.appendChild(hint);
        }
      } else {
        const where = D.sys ? 'It opened in Chromium, on top of ' + D.brand + '. Close that window (×) to come back.' : 'It opened in a new tab of your browser.';
        t.el.innerHTML = '<div class="st-away st-wash"><div class="st-awaycard">' + mono(colourOf(e.url), esc(letter(e.url)), 'big') +
          '<h2>' + esc(host(e.url) || e.url) + ' opens in its own window</h2><p>This site doesn\'t let other pages show it inside them. ' + (opts && opts.user ? where : 'Open it when you\'re ready.') + '</p>' +
          '<button class="st-pill go" data-nav data-key="st:again">' + icon('out') + (opts && opts.user ? 'Open it again' : 'Open it') + '</button></div></div>';
        t.el.querySelector('[data-key="st:again"]').onclick = () => openOutside(e.url);
        if (opts && opts.user) openOutside(e.url);
      }
      if (t === cur) {
        omni.value = e.how === 'ntp' ? '' : e.how === 'history' ? 'serene:history' : e.how === 'ask' ? '?' + askOf(e.url) : e.url;
        paintNav(); paintZoom(); paintShield(); paintSave();
        ctx.setTitle(e.how === 'ntp' ? 'SereneTab' : titleOf(t) + ' — SereneTab');
      }
      paintTabs(); save();
    }
    function visit(text, opts) {
      const v = String(text || '').trim();
      if (/^serene:\/*history$/i.test(v)) { go(cur, 'serene:history'); return; }
      // "?why is the sky blue" asks Deuce, as a page
      if (/^\?\s*\S/.test(v) && D.deuce && D.deuce.answer) { const u = askUrl(v.replace(/^\?\s*/, '')); if (opts && opts.newTab) newTab(u, { after: true }); else go(cur, u); root.focus({ preventScroll: true }); return; }
      // "/dice" means a page on this website
      const r = /^\/[^/]/.test(v) ? { url: new URL(v, D.origin + '/').href, search: false } : L.omni(v, S.engine);
      if (!r) return;
      const o = { user: true, search: r.search, title: r.search ? '“' + v + '” on ' + L.ENGINES[S.engine].name : null };
      if (opts && opts.newTab) newTab(r.url, Object.assign(o, { after: true }));
      else go(cur, r.url, o);
      root.focus({ preventScroll: true }); // keep the keys (Ctrl+L, Alt+Left…) with SereneTab
    }
    $('.st-omni').onsubmit = (ev) => { ev.preventDefault(); closeSugg(); visit(omni.value); };
    omni.addEventListener('focus', () => omni.select());
    $('.st-bar .st-eng').onclick = (ev) => engineMenu(ev.currentTarget);
    const back = () => { if (cur.at > 0) { cur.at--; show(cur); } };
    const fwd = () => { if (cur.at < cur.hist.length - 1) { cur.at++; show(cur); } };
    const reload = () => { const e = entry(cur); if (e.how === 'ntp') { skyAt = 0; loadWeather(true); } else show(cur); };
    const ACT = {
      back, fwd, reload, new: () => newTab(), priv: () => newTab(null, { priv: true }), reopen: () => reopen(), rail: toggleRail,
      history: () => newTab('serene:history', { after: true }), save: () => saveLater(cur),
      split: () => (split ? endSplit() : startSplit()), menu: (b) => moreMenu(b), shield: () => shieldMenu(),
    };
    root.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => ACT[b.dataset.a](b); });

    // ---- the ⋯ menu ----
    function moreMenu(from) {
      const e = entry(cur), web = isWeb(e), saved = web && S.later.some((x) => x.url === e.url), keyed = web && S.shortcuts.some((x) => x.url === e.url);
      popUp(popItem('new', 'plus', 'New tab', 'Ctrl T') + popItem('priv', 'mask', 'New private tab', 'Ctrl Shift N') +
        popItem('reopen', 'undo', 'Reopen closed tab', 'Ctrl Shift T', closed.length ? '' : ' disabled') +
        '<hr>' + popItem('pin', 'pin', cur.pin ? 'Unpin this tab' : 'Pin this tab') +
        popItem('split', 'split', split ? 'Close split view' : 'Split view', '', split || tabs.length > 1 || web ? '' : ' disabled') +
        '<div class="st-zoomrow" role="group" aria-label="Zoom"><span>Zoom</span><button class="st-ic small" data-nav data-key="st:m-zout" data-z="-1" aria-label="Zoom out (Ctrl −)">' + icon('minus') + '</button><b>' + Math.round(cur.zoom * 100) + '%</b><button class="st-ic small" data-nav data-key="st:m-zin" data-z="1" aria-label="Zoom in (Ctrl +)">' + icon('plus') + '</button></div>' +
        (web ? popItem('later', 'later', saved ? 'Remove from Later' : 'Save for later', 'Ctrl D') + popItem('key', 'star', keyed ? 'On your new tab page' : 'Add to the new tab page', '', keyed || S.shortcuts.length >= MAX_KEYS ? ' disabled' : '') : '') +
        // Dice Drop: this page, on another computer (the TV, say)
        (D.cloud && web ? popItem('send', 'send', 'Send to…') : '') +
        '<hr>' + popItem('history', 'history', 'History', 'Ctrl H') + popItem('keep', 'check', 'Remember sites I visit', '', ' aria-pressed="' + !S.noHistory + '"') +
        popItem('rail', 'rail', railShut ? 'Show tab names' : 'Fold the tabs away', 'Ctrl \\'), from, 'right');
      pop.querySelectorAll('[data-z]').forEach((b) => { b.onclick = () => { zoomBy(+b.dataset.z); pop.querySelector('.st-zoomrow b').textContent = Math.round(cur.zoom * 100) + '%'; }; });
      onPick((m) => {
        if (m === 'pin') pinTab(cur);
        else if (m === 'later') saveLater(cur);
        else if (m === 'key') { S.shortcuts.push({ name: (e.title || host(e.url)).slice(0, 40), url: e.url }); D.save(); share(); paintKeys(); D.toast({ icon: 'link', c: '#3d86d6', title: 'SereneTab', text: 'Added to your new tab page.' }); }
        else if (m === 'send') {
          if (!D.cloud.on()) D.ask({ title: 'Send to another computer', text: 'This uses Dice Cloud, which shares between your computers. Turn it on first?', buttons: [{ label: 'Open Dice Cloud', value: true, go: true }, { label: 'Cancel', value: false }] }).then((y) => { if (y) D.launch('cloud'); });
          else D.launch('cloud', { arg: 'send:' + encodeURIComponent(e.url) });
        } else if (m === 'keep') { S.noHistory = !S.noHistory; D.save(); D.toast({ icon: 'link', c: '#3d86d6', title: 'SereneTab', text: S.noHistory ? 'Sites you visit won\'t be remembered.' : 'SereneTab will remember the sites you visit, on this computer only.' }); }
        else ACT[m]();
      });
    }

    root.addEventListener('keydown', (ev) => {
      const k = ev.key.toLowerCase(), mod = ev.ctrlKey || ev.metaKey;
      const stop = (fn) => { ev.preventDefault(); fn(); };
      if (mod && (k === '=' || k === '+')) return stop(() => zoomBy(1));
      if (mod && (k === '-' || k === '_')) return stop(() => zoomBy(-1));
      if (mod && k === '0') return stop(() => zoomBy(0));
      // the next and previous tab (Ctrl+Tab where the browser lets us have it, or Ctrl+Shift+] and [)
      if (mod && k === 'tab') return stop(() => cycle(ev.shiftKey ? -1 : 1));
      if (mod && ev.shiftKey && (ev.code === 'BracketRight' || ev.code === 'BracketLeft')) return stop(() => cycle(ev.code === 'BracketRight' ? 1 : -1));
      if (mod && ev.shiftKey && k === 'n') return stop(() => newTab(null, { priv: true }));
      if (mod && ev.shiftKey && k === 't') return stop(() => reopen());
      if (mod && k === 't') return stop(() => newTab());
      if (mod && k === 'h') return stop(() => newTab('serene:history', { after: true }));
      if (mod && k === 'w') return stop(() => closeTab(cur));
      if (mod && k === 'l') return stop(() => omni.focus());
      if (mod && k === 'd') return stop(() => saveLater(cur));
      if (mod && k === 'r' || k === 'f5') return stop(reload);
      if (mod && k === '\\') return stop(toggleRail);
      if (ev.altKey && k === 'arrowleft') return stop(back);
      if (ev.altKey && k === 'arrowright') return stop(fwd);
      if (k === 'escape' && !pop.hidden) { pop.hidden = true; }
    });

    // ---- zoom, for each tab ----
    const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
    function zoomFrame(t, f) {
      f = f || t.el.querySelector('.st-frame');
      if (!f) return;
      const z = t.zoom;
      f.style.zoom = z === 1 ? '' : String(z);
      f.style.width = f.style.height = z === 1 ? '' : (100 / z) + '%';
    }
    function zoomBy(d) {
      const i = ZOOMS.indexOf(cur.zoom);
      cur.zoom = d === 0 ? 1 : ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 4 : i) + d))];
      zoomFrame(cur); paintZoom();
      const b = ntp.parentNode === cur.el ? ntp.querySelector('.st-board') : null; if (b) b.style.zoom = cur.zoom === 1 ? '' : cur.zoom;
    }
    function paintZoom() { const z = $('.st-zoom'); z.hidden = !cur || cur.zoom === 1; if (cur) z.textContent = Math.round(cur.zoom * 100) + '%'; }
    $('.st-zoom').onclick = () => zoomBy(0);

    // ---- Later: pages you saved to read, on the new tab page ----
    const saveBtn = $('.st-save');
    function paintSave() {
      const e = cur && entry(cur), web = isWeb(e), on = web && S.later.some((x) => x.url === e.url);
      saveBtn.hidden = !web || solo;
      saveBtn.classList.toggle('on', !!on);
      saveBtn.setAttribute('aria-pressed', String(!!on));
      saveBtn.setAttribute('aria-label', on ? 'Saved for later (Ctrl+D to remove)' : 'Save for later (Ctrl+D)'); saveBtn.title = saveBtn.getAttribute('aria-label');
    }
    function saveLater(t) {
      const e = entry(t);
      if (!isWeb(e)) return;
      const had = S.later.some((x) => x.url === e.url);
      S.later = had ? S.later.filter((x) => x.url !== e.url) : [{ url: e.url, title: titleOf(t), at: Date.now() }].concat(S.later).slice(0, 60);
      D.save(); paintSave(); paintLater();
      D.toast({ icon: 'link', c: '#8a6bd8', title: 'Later', text: had ? 'Taken off your Later list.' : 'Saved. It\'s on your new tab page, under Later.' });
    }

    // ---- Shield: what it kept out on this site, and pausing it here ----
    const shieldBtn = $('.st-shield');
    const siteOf = (t) => { const e = t && entry(t); return e && (e.how === 'frame' || e.how === 'window') ? host(e.url) : ''; };
    let shieldT = 0;
    function paintShield() {
      const SH = D.shield;
      shieldBtn.hidden = !(SH && SH.available()) || solo;
      if (shieldBtn.hidden) return;
      const site = siteOf(cur), badge = shieldBtn.querySelector('.st-badge');
      clearTimeout(shieldT);
      SH.get(site).then((s) => {
        if (!s || dead) return;
        const n = s.site ? s.site.n : 0, paused = s.site && s.site.paused;
        shieldBtn.classList.toggle('off', !s.on || !!paused);
        badge.hidden = !n || paused || !s.on; badge.textContent = n > 99 ? '99+' : String(n);
        shieldBtn.setAttribute('aria-label', 'Shield: ' + (!s.on ? 'off' : paused ? 'paused here' : n + ' ads kept out here today')); shieldBtn.title = shieldBtn.getAttribute('aria-label');
      });
      if (site) shieldT = setTimeout(paintShield, 5000);
    }
    offs.push(D.on('shield', paintShield));
    async function shieldMenu() {
      const SH = D.shield, site = siteOf(cur), s = await SH.get(site);
      if (!s) { D.launch('settings', { arg: 'shield' }); return; }
      const paused = s.site && s.site.paused;
      popUp('<div class="st-shieldpop">' + (SH.art ? SH.art(s.on && !paused, 40) : '') + '<div><b>' + (!s.on ? 'Shield is off' : !site ? 'Shield is on' : paused ? 'Paused on ' + esc(site) : esc(site)) + '</b><span>' +
        (!s.on ? 'Ads aren\'t being blocked.' : site && !paused ? Number(s.site.n).toLocaleString() + ' ads and trackers kept out here today' : Number(s.today).toLocaleString() + ' kept out today, on every site') + '</span></div></div>' +
        (site && s.on ? popItem(paused ? 'resume' : 'pause', 'shield', paused ? 'Block ads here again' : 'Pause Shield on this site') : '') +
        (!s.on ? popItem('on', 'shield', 'Turn Shield on') : '') + popItem('settings', 'more', 'Shield settings'), shieldBtn, 'right');
      onPick(async (a) => {
        if (a === 'settings') return D.launch('settings', { arg: 'shield' });
        if (a === 'on') await SH.set({ on: true });
        else if (a === 'pause') await SH.pause(site);
        else await SH.resume(site);
        D.toast({ icon: 'shield', c: '#4b7bec', title: 'Shield', text: a === 'pause' ? 'Paused on ' + site + '. Ads show here now.' : a === 'resume' ? 'Blocking ads on ' + site + ' again.' : 'Shield is on.' });
        show(cur); paintShield();
      });
    }

    // ---- a question for Deuce, answered in the tab ----
    function askPage(t, e) {
      const q = askOf(e.url) || '';
      t.el.innerHTML = '<div class="st-ask st-wash"><div class="st-askin"><div class="st-askthread"></div>' +
        '<form class="st-askmore"><span class="st-askorb">' + (D.deuce && D.deuce.orbSvg ? D.deuce.orbSvg(26) : '') + '</span><input data-nav data-key="st:askmore" placeholder="Ask a follow-up" aria-label="Ask a follow-up" autocomplete="off"><button class="st-pill go small" data-nav data-key="st:askgo">Ask</button></form></div></div>';
      const th = t.el.querySelector('.st-askthread'), open = { open: (u) => newTab(u, { user: true, after: true }) };
      if (!e.thread) e.thread = [];
      const block = (qq) => {
        const b = h('<section class="st-askblock"><h1></h1><div class="st-askans"><p class="dp-steps"><i></i><i></i><i></i><span>Searching the web</span></p></div></section>');
        b.querySelector('h1').textContent = qq;
        th.appendChild(b);
        return b;
      };
      const ask = async (qq) => {
        const b = block(qq);
        const slow = setTimeout(() => { const s = b.querySelector('.dp-steps span'); if (s) s.textContent = 'Reading the best pages'; }, 1400);
        const r = await D.deuce.answer(qq, e.thread);
        clearTimeout(slow);
        if (dead || !b.isConnected) return;
        const box = b.querySelector('.st-askans');
        if (!r || !r.ok) { box.innerHTML = '<p class="st-empty">' + esc((r && r.error) || 'Couldn\'t look that up.') + '</p>'; return; }
        D.deuce.renderAnswer(box, r, open);
        e.thread.push({ q: qq, a: r.answer, r });
      };
      // the answers already here (coming back to this tab), else the first one
      if (e.thread.length) e.thread.forEach((x) => { const b = block(x.q); D.deuce.renderAnswer(b.querySelector('.st-askans'), x.r, open); });
      else if (q) ask(q);
      t.el.querySelector('.st-askmore').onsubmit = (ev) => { ev.preventDefault(); const inp = t.el.querySelector('.st-askmore input'), v = inp.value.trim(); if (!v) return; inp.value = ''; ask(v); };
      e.title = q;
    }

    // ---- History: the sites you've been to, newest first, grouped by day ----
    function historyPage(el) {
      el.innerHTML = '<div class="st-hist st-wash"><div class="st-histin"><div class="st-histhead"><h2>History</h2>' +
        '<label class="st-histfind"><span class="st-svgw">' + icon('search') + '</span><input data-nav data-key="st:hq" placeholder="Search your history" aria-label="Search your history" autocomplete="off"></label>' +
        '<button class="st-pill small" data-nav data-key="st:hclear">' + icon('trash') + '<span>Clear all</span></button></div><div class="st-histlist"></div></div></div>';
      const box = el.querySelector('.st-histlist'), q = el.querySelector('input'), clear = el.querySelector('[data-key="st:hclear"]');
      function paint() {
        const low = q.value.trim().toLowerCase();
        const items = S.history.filter((x) => !low || (x.title || '').toLowerCase().includes(low) || x.url.toLowerCase().includes(low));
        box.innerHTML = '';
        if (!items.length) { box.innerHTML = '<p class="st-empty">' + (S.history.length ? 'Nothing matches.' : S.noHistory ? 'SereneTab isn\'t remembering sites right now (see the ⋯ menu).' : 'Sites you visit show up here. They stay on this computer.') + '</p>'; return; }
        let day = '';
        const today = L.dayKey(new Date());
        items.slice(0, 300).forEach((x) => {
          const d = new Date(x.at), key = L.dayKey(d);
          if (key !== day) { day = key; box.appendChild(h('<h3>' + (key === today ? 'Today' : key === L.addDays(today, -1) ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })) + '</h3>')); }
          const row = h('<div class="st-hrow"><button class="st-hgo" data-nav data-key="st:h-' + x.at + '">' + mono(colourOf(x.url), x.search ? icon('search') : esc(letter(x.url))) +
            '<b>' + esc(x.title || host(x.url)) + '</b><span>' + esc(x.search ? L.hostOf(x.url) : host(x.url)) + '</span><time>' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '</time></button>' +
            '<button class="st-ic small" data-nav data-key="st:hx-' + x.at + '" aria-label="Forget this one">' + icon('close') + '</button></div>');
          row.querySelector('.st-hgo').onclick = () => go(cur, x.url, { user: true, title: x.title, search: x.search });
          row.querySelector('.st-ic').onclick = () => { S.history = S.history.filter((y) => y !== x); D.save(); paint(); paintJump(); };
          box.appendChild(row);
        });
      }
      q.oninput = paint;
      clear.onclick = () => {
        const label = clear.querySelector('span');
        if (!clear.dataset.sure) { clear.dataset.sure = '1'; label.textContent = 'Clear all? Click again'; return; }
        S.history = []; D.save(); delete clear.dataset.sure; label.textContent = 'Clear all'; paint(); paintJump();
      };
      paint();
    }

    // ---- suggestions under the address bar while you type ----
    const sugg = $('.st-sugg');
    let suggFor = null, suggItems = [], suggAt = -1;
    function suggestFor(input) {
      suggItems = L.suggest(input.value, S.shortcuts, S.history, S.engine);
      const typed = input.value.trim();
      if (D.deuce && D.deuce.answer && typed && (looksLikeQuestion(typed) || /^\?/.test(typed))) suggItems.unshift({ kind: 'ask', title: 'Ask Deuce: ' + typed.replace(/^\?\s*/, ''), url: askUrl(typed.replace(/^\?\s*/, '')) });
      // an open tab that matches: switch to it instead of opening it again
      const low = typed.toLowerCase();
      if (low.length > 1) tabs.filter((t) => t !== cur && (titleOf(t).toLowerCase().includes(low) || (entry(t).url || '').toLowerCase().includes(low))).slice(0, 2).forEach((t) => suggItems.splice(1, 0, { kind: 'tab', tab: t, title: 'Switch to ' + titleOf(t), url: entry(t).url }));
      suggItems = suggItems.slice(0, 8);
      suggFor = input; suggAt = -1;
      if (!suggItems.length || document.activeElement !== input) { closeSugg(); return; }
      const r = input.closest('form').getBoundingClientRect(), rr = root.getBoundingClientRect();
      sugg.style.left = (r.left - rr.left) + 'px'; sugg.style.top = (r.bottom - rr.top + 6) + 'px'; sugg.style.width = r.width + 'px';
      sugg.innerHTML = suggItems.map((x, i) => {
        const tile = x.kind === 'search' ? mono(L.ENGINES[S.engine].c, icon('search')) : x.kind === 'ask' ? mono('#4b7bec', icon('ask')) : x.kind === 'history' ? mono('#7a86a3', icon('history')) :
          x.kind === 'tab' ? tileOf(x.tab) : mono(colourOf(x.url), esc(x.kind === 'shortcut' ? (x.title || '?')[0].toUpperCase() : letter(x.url)));
        return '<button role="option" tabindex="-1" data-i="' + i + '" class="st-s-' + x.kind + '">' + tile + '<b>' + esc(x.title) + '</b>' + (/^(search|go|ask)$/.test(x.kind) ? '' : '<span>' + esc(x.kind === 'tab' ? 'Open tab' : host(x.url)) + '</span>') + '</button>';
      }).join('');
      sugg.hidden = false;
      sugg.querySelectorAll('button').forEach((b) => { b.onpointerdown = (ev) => { ev.preventDefault(); pickSugg(+b.dataset.i); }; });
    }
    function moveSugg(d) {
      suggAt = Math.max(-1, Math.min(suggItems.length - 1, suggAt + d));
      sugg.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-selected', String(i === suggAt)));
      if (suggFor) suggFor.value = suggAt >= 0 ? (/^(search|ask|tab)$/.test(suggItems[suggAt].kind) ? suggFor.dataset.typed : suggItems[suggAt].url) : suggFor.dataset.typed;
    }
    function pickSugg(i) {
      const x = suggItems[i], input = suggFor;
      closeSugg();
      if (!x || !input) return;
      input.value = input === omni ? x.url : '';
      if (x.kind === 'tab') { if (tabs.includes(x.tab)) select(x.tab); }
      else if (x.kind === 'search') visit(input.dataset.typed);
      else if (x.kind === 'ask') go(cur, x.url);
      else go(cur, x.url, { user: true, title: x.kind === 'go' ? null : x.title });
      root.focus({ preventScroll: true });
    }
    function closeSugg() { sugg.hidden = true; suggItems = []; suggAt = -1; }
    function wireSuggest(input) {
      input.addEventListener('input', () => { input.dataset.typed = input.value; suggestFor(input); });
      input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) closeSugg(); }, 120));
    }
    wireSuggest(omni);

    // ---- the new tab page ----
    const ntp = h('<div class="st-ntp"><canvas class="st-sky" aria-hidden="true"></canvas><div class="st-board">' +
      '<header class="st-mast"><button class="st-clock" data-nav data-key="st:focus">' + CLOCK + '</button>' +
        '<div class="st-hello"><h1 class="st-greet"></h1><p class="st-date"></p><p class="st-focus" hidden></p></div>' +
        '<section class="st-wx" aria-label="Weather"></section></header>' +
      '<form class="st-find" role="search"><button type="button" class="st-eng" data-nav data-key="st:eng2" aria-haspopup="menu"></button>' +
        '<input data-nav data-key="st:find" autocomplete="off" spellcheck="false" aria-label="Search or type a web address">' +
        '<button class="st-ic small" data-nav data-key="st:findgo" aria-label="Go">' + icon('search') + '</button></form>' +
      '<div class="st-keys" aria-label="Shortcuts"></div>' +
      '<div class="st-tray">' +
        '<section class="st-jump" aria-label="Jump back in"></section>' +
        '<section class="st-later" aria-label="Later"></section>' +
        '<section class="st-due" aria-label="Due today, from Axiom" hidden></section>' +
        '<section class="st-note"><label for="st-note-' + ctx.id + '">Note</label><textarea id="st-note-' + ctx.id + '" data-nav data-key="st:note" placeholder="Anything you want to keep in mind"></textarea></section>' +
      '</div></div>' +
      '<div class="st-city"><button class="st-ic small" data-nav data-key="st:cprev" data-c="-1" aria-label="Previous city">' + icon('back') + '</button><span class="st-cityname"></span><button class="st-ic small" data-nav data-key="st:cnext" data-c="1" aria-label="Next city">' + icon('fwd') + '</button></div></div>');
    const canvas = ntp.querySelector('.st-sky'), g = canvas.getContext('2d'), find = ntp.querySelector('.st-find input');
    ntp.querySelector('.st-find').onsubmit = (ev) => { ev.preventDefault(); closeSugg(); const v = find.value; find.value = ''; visit(v); };
    ntp.querySelector('.st-find .st-eng').onclick = (ev) => engineMenu(ev.currentTarget);
    wireSuggest(find);

    // a focus timer on the glass clock: it's the Clock app's timer, so it rings even if SereneTab closes
    const T = D.timer || (D.timer = { end: 0, left: 0, total: 0, running: false });
    ntp.querySelector('.st-clock').onclick = () => {
      if (T.running) { T.running = false; T.left = 0; D.S.play('back'); }
      else { T.total = T.left = 25 * 60000; T.end = Date.now() + T.left; T.running = true; D.S.play('select'); D.toast({ icon: 'bell', c: '#ef6a55', title: 'Focus for 25 minutes', text: 'The clock\'s ring shows how far along you are. Click it again to stop.' }); }
      lastSec = -1; tickClock();
    };

    // shortcuts: little glass cubes, up to 24 of them
    let editing = false;
    function paintKeys() {
      const box = ntp.querySelector('.st-keys');
      box.innerHTML = '';
      box.classList.toggle('editing', editing);
      S.shortcuts.slice(0, MAX_KEYS).forEach((sc, i) => {
        const name = sc.name || host(sc.url);
        const b = h('<div class="st-key"><button class="st-cube" data-nav data-key="st:sc' + i + '" style="--c:' + colourOf(sc.url) + '" title="' + esc(sc.url) + '"><span class="st-cf">' + esc((name || '?')[0].toUpperCase()) + '</span></button><span class="st-cn">' + esc(name) + '</span></div>');
        const cube = b.querySelector('.st-cube');
        cube.onclick = (ev) => {
          if (editing) { S.shortcuts.splice(i, 1); D.save(); share(); paintKeys(); return; }
          if (ev.ctrlKey || ev.metaKey) newTab(sc.url, { user: true, after: true }); else go(cur, sc.url, { user: true });
        };
        cube.onauxclick = (ev) => { if (ev.button === 1 && !editing) newTab(sc.url, { user: true, after: true, bg: true }); };
        if (editing) cube.setAttribute('aria-label', 'Remove ' + name);
        box.appendChild(b);
      });
      if (S.shortcuts.length < MAX_KEYS) {
        const add = h('<div class="st-key"><button class="st-cube add" data-nav data-key="st:scadd" aria-label="Add a shortcut"><span class="st-cf">' + icon('plus') + '</span></button><span class="st-cn">Add</span></div>');
        add.querySelector('button').onclick = (ev) => addShortcut(ev.currentTarget);
        box.appendChild(add);
      }
      const ed = h('<div class="st-key st-keyedit"><button class="st-pill small" data-nav data-key="st:scedit">' + (editing ? icon('check') + 'Done' : icon('edit') + 'Edit') + '</button></div>');
      ed.querySelector('button').onclick = () => { editing = !editing; paintKeys(); };
      box.appendChild(ed);
    }
    function addShortcut(from) {
      popUp('<p class="st-pop-t">New shortcut</p><form class="st-addform"><input data-nav data-key="st:scname" placeholder="Name" aria-label="Name"><input data-nav data-key="st:scurl" placeholder="Web address" aria-label="Web address" required><button class="st-pill go" data-nav data-key="st:scsave">Add it</button></form>', from);
      const [nm, ad] = pop.querySelectorAll('input');
      pop.querySelector('form').onsubmit = (ev) => {
        ev.preventDefault();
        const r2 = L.omni(ad.value, S.engine);
        if (!r2 || r2.search) { ad.setCustomValidity('Type a web address, like example.com'); ad.reportValidity(); ad.oninput = () => ad.setCustomValidity(''); return; }
        S.shortcuts.push({ name: nm.value.trim() || host(r2.url), url: r2.url }); D.save(); share(); pop.hidden = true; paintKeys();
      };
    }

    // Jump back in: tabs you closed, then places you've been
    function listRow(key, x, meta, onGo, onX) {
      const row = h('<div class="st-lrow"><button class="st-lgo" data-nav data-key="' + key + '" title="' + esc(x.url) + '">' + mono(colourOf(x.url), x.search ? icon('search') : esc(letter(x.url))) +
        '<b>' + esc(x.title || host(x.url)) + '</b><small>' + esc(meta) + '</small></button>' + (onX ? '<button class="st-ic small" data-nav data-key="' + key + 'x" aria-label="Remove ' + esc(x.title || host(x.url)) + '">' + icon('close') + '</button>' : '') + '</div>');
      row.querySelector('.st-lgo').onclick = onGo;
      if (onX) row.querySelector('.st-ic').onclick = onX;
      return row;
    }
    function paintJump() {
      const box = ntp.querySelector('.st-jump');
      box.innerHTML = '<h3>' + icon('history') + 'Jump back in' + (S.history.length ? '<button class="st-link" data-nav data-key="st:jall">History</button>' : '') + '</h3>';
      const seen = new Set(), list = [];
      closed.slice().reverse().forEach((c) => { if (list.length < 3 && isWeb(c) && !seen.has(c.url)) { seen.add(c.url); list.push({ c, url: c.url, title: c.title, meta: 'Closed ' + ago(c.when) }); } });
      S.history.forEach((x) => { if (list.length < 6 && !x.search && !seen.has(x.url)) { seen.add(x.url); list.push({ url: x.url, title: x.title, meta: host(x.url) + ', ' + ago(x.at) }); } });
      if (!list.length) box.appendChild(h('<p class="st-empty">' + (S.noHistory ? 'SereneTab isn\'t remembering sites right now.' : 'Places you visit show up here, so you can get back to them.') + '</p>'));
      list.forEach((x, i) => box.appendChild(listRow('st:j' + i, x, x.meta, () => (x.c ? reopen(x.c) : go(cur, x.url, { user: true, title: x.title })))));
      const all = box.querySelector('[data-key="st:jall"]'); if (all) all.onclick = () => newTab('serene:history', { after: true });
    }
    function paintLater() {
      const box = ntp.querySelector('.st-later');
      box.innerHTML = '<h3>' + icon('later') + 'Later' + (S.later.length ? '<small>' + S.later.length + '</small>' : '') + '</h3>';
      if (!S.later.length) { box.appendChild(h('<p class="st-empty">Save a page to read later with Ctrl+D, or the ribbon in the address bar.</p>')); return; }
      const list = h('<div class="st-llist"></div>');
      S.later.slice(0, 12).forEach((x, i) => list.appendChild(listRow('st:l' + i, x, host(x.url) + ', saved ' + ago(x.at),
        () => go(cur, x.url, { user: true, title: x.title }), () => { S.later = S.later.filter((y) => y !== x); D.save(); paintLater(); paintSave(); })));
      box.appendChild(list);
    }
    // what's due today, from Axiom
    function paintDue() {
      const box = ntp.querySelector('.st-due'), A = D.state.axiom;
      if (!A || !Array.isArray(A.tasks) || !A.tasks.length || !D.app('calendar')) { box.hidden = true; return; }
      const today = L.dayKey(new Date()), b = L.planBuckets(A.tasks, today), list = b.overdue.concat(b.today).slice(0, 5);
      box.hidden = false;
      box.innerHTML = '<h3>' + icon('check') + 'Due today<button class="st-link" data-nav data-key="st:axiom">Axiom</button></h3>' + (list.length ? '' : '<p class="st-empty">Nothing due. Nice.</p>');
      list.forEach((t) => {
        const c = (A.classes || []).find((x) => x.id === t.classId);
        const row = h('<div class="st-duerow' + (t.due < today ? ' late' : '') + '" style="--c:' + (c ? c.color : '#d4a857') + '"><button class="st-tick" data-nav data-key="st:d-' + esc(t.id) + '" role="checkbox" aria-checked="false" aria-label="Done: ' + esc(t.title) + '"></button><span><b>' + esc(t.title) + '</b><small>' + esc((c ? c.name : '') + (t.due < today ? (c ? ', ' : '') + 'late' : '')) + '</small></span></div>');
        row.querySelector('.st-tick').onclick = () => { t.done = true; t.doneAt = today; D.save(); D.S.play('select'); paintDue(); };
        box.appendChild(row);
      });
      box.querySelector('[data-key="st:axiom"]').onclick = () => D.launch('calendar');
    }
    const note = ntp.querySelector('textarea');
    note.value = S.note;
    let noteT = 0;
    note.oninput = () => { S.note = note.value; clearTimeout(noteT); noteT = setTimeout(() => D.save(), 400); };
    ntp.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => { S.city = CITY_IDS[(CITY_IDS.indexOf(S.city) + +b.dataset.c + CITY_IDS.length) % CITY_IDS.length]; D.save(); share(); skyAt = 0; wxCity = null; loadWeather(); paintCity(); }; });

    function greet() {
      const now = new Date(), hr = now.getHours(), name = D.state.name && D.state.name !== 'player' ? ', ' + D.state.name : '';
      ntp.querySelector('.st-greet').textContent = (hr < 5 ? 'Good night' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : hr < 22 ? 'Good evening' : 'Good night') + name;
      ntp.querySelector('.st-date').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    }
    function paintCity() {
      const C = G.Skyline.CITIES[S.city], w = wxCity && L.weatherWords(wxCity.code);
      ntp.querySelector('.st-cityname').textContent = C.name + ', ' + L.cityTime(new Date(), C.tz) + (w && w.text ? ', ' + w.text.toLowerCase() : '');
    }
    const hourName = (t) => { const hh = +t.slice(11, 13); return (hh % 12 || 12) + (hh < 12 ? ' am' : ' pm'); };
    function paintWeather(err) {
      const box = ntp.querySelector('.st-wx'), C = G.Skyline.CITIES[S.city];
      const place = S.place || { name: C.name }, d = S.place ? wxHere : wxCity;
      if (!d) box.innerHTML = '<p class="st-wx-what">' + (err ? 'No weather right now. It needs the internet.' : 'Looking at the sky…') + '</p>';
      else {
        const w = L.weatherWords(d.code), night = sky ? sky.night : D.night();
        box.innerHTML = '<div class="st-wxnow">' + wxIcon(w.kind, night) + '<b class="st-temp" data-nav data-key="st:units" role="button" tabindex="0" title="Switch between °F and °C">' + d.t + '°<small>' + S.units.toUpperCase() + '</small></b>' +
          '<span class="st-wxw"><b>' + esc(w.text) + '</b><small>High ' + d.hi + '°, low ' + d.lo + '°</small></span></div>' +
          (d.hours && d.hours.length ? '<div class="st-hours">' + d.hours.slice(0, 5).map((x) => { const hh = +x.time.slice(11, 13); return '<span><small>' + hourName(x.time) + '</small>' + wxIcon(L.weatherWords(x.code).kind, hh < 6 || hh >= 19) + '<b>' + x.t + '°</b></span>'; }).join('') + '</div>' : '');
        const tmp = box.querySelector('.st-temp');
        tmp.onclick = () => { S.units = S.units === 'f' ? 'c' : 'f'; D.save(); share(); wxCity = wxHere = null; loadWeather(); };
        tmp.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); tmp.click(); } };
      }
      const line = h('<p class="st-wx-place"><span>' + esc(place.name) + '</span><button class="st-link" data-nav data-key="st:place">Change</button></p>');
      line.querySelector('button').onclick = () => {
        line.innerHTML = '<form class="st-placeform"><input data-nav data-key="st:placein" placeholder="Town or city" aria-label="Town or city for the weather"><button class="st-link" data-nav data-key="st:placego">Show</button>' +
          (S.place ? '<button type="button" class="st-link" data-nav data-key="st:placeoff">Use ' + esc(C.name) + '</button>' : '') + '</form>';
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
      paintNav();
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
      const ring = face.querySelector('.ring'), fl = ntp.querySelector('.st-focus'), clockBtn = ntp.querySelector('.st-clock');
      if (T.running && T.total) {
        const left = Math.max(0, T.end - Date.now()), done = 1 - left / T.total, mins = Math.ceil(left / 60000);
        ring.style.strokeDasharray = Math.max(0.5, done * 100).toFixed(2) + ' 100'; ring.style.opacity = 1; face.querySelector('.track').style.opacity = 1;
        fl.hidden = false; fl.textContent = 'Focus: ' + mins + ' minute' + (mins === 1 ? '' : 's') + ' left';
        clockBtn.setAttribute('aria-label', 'Stop the focus timer, ' + mins + ' minutes left');
      } else {
        ring.style.opacity = 0; face.querySelector('.track').style.opacity = 0; fl.hidden = true;
        clockBtn.setAttribute('aria-label', 'Start a 25 minute focus timer');
      }
      if (sec === 0 || !ntp.querySelector('.st-greet').textContent) { greet(); paintCity(); paintDue(); }
      if (sec % 30 === 0) paintJump(); // "5 min ago" stays true
    }

    paintRail(); paintEngine(); greet(); paintKeys(); paintJump(); paintLater(); paintWeather(); paintDue(); loadWeather();
    // put back the tabs from last time (a SereneTab window's new tab page is only that)
    const saved = solo ? [''] : (Array.isArray(S.tabs) ? S.tabs.slice(0, 40) : []);
    if (ctx.arg && typeof ctx.arg === 'string' && !solo) saved.push(ctx.arg);
    if (!saved.length) saved.push('');
    saved.forEach((x) => {
      const u = typeof x === 'string' ? x : (x && x.u) || '';
      const t = { id: ++seq, hist: [], at: -1, el: h('<div class="st-page" hidden></div>'), zoom: 1, pin: !!(x && x.p) };
      pages.appendChild(t.el); tabs.push(t);
      if (u) go(t, u); else { t.hist = [{ url: '', how: 'ntp', title: 'New tab' }]; t.at = 0; }
    });
    select(tabs[ctx.arg && !solo ? tabs.length - 1 : Math.max(0, Math.min(tabs.length - 1, S.active | 0))]);
    // links from anywhere (other apps on DiceOS, Deuce, the Dice Bar) open as a new tab here
    SR.open = (url) => { newTab(url, { user: true, after: true }); };
    SR.site = () => siteOf(cur);
    // the page in front (Deuce and Lookouts read it when you ask about "this page")
    SR.page = () => { const e = entry(cur); return isWeb(e) ? { url: e.url, title: e.title || '' } : null; };
    SR.reload = () => { if (cur) show(cur); };
    // the sidebar folds itself away when the window gets narrow
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { const was = railShut; paintRail(); if (was !== railShut) paintTabs(); skyAt = 0; }) : null;
    if (ro) ro.observe(root);
    setTimeout(() => { if (ctx.mode === 'run') D.nav.first(root); }, 40);
    ctx.legend([['a', 'Open'], ['b', 'Back']]);

    return {
      frame(now) {
        if (!ntp.isConnected || ntp.parentNode.hidden) return;
        tickClock();
        if (!sky || Date.now() - skyAt > 5 * 60e3 || !skyAt) buildSky();
        if (sky) sky.draw(g, now / 1000, D.state.motion === 'less');
      },
      resize() { skyAt = 0; paintRail(); },
      onAction(a) {
        if (!sugg.hidden) {
          if (a === 'down' || a === 'up') { moveSugg(a === 'down' ? 1 : -1); return true; }
          if (a === 'a' && suggAt >= 0) { pickSugg(suggAt); return true; }
          if (a === 'b') { closeSugg(); return true; }
          if (a === 'a') closeSugg();
        }
        const el = document.activeElement;
        if (el === tfind && (a === 'a' || a === 'b')) { if (a === 'a') pickFound(); else { tfind.value = ''; paintTabs(); root.focus({ preventScroll: true }); } return true; }
        if (a === 'a') { // Enter or the A button: send the box you're typing in, or press the button
          if (!el || !root.contains(el)) return false;
          if (el.form) { el.form.requestSubmit(); return true; }
          if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') { el.click(); return true; }
          return false;
        }
        if (a === 'b') {
          if (!pop.hidden) { pop.hidden = true; return true; }
          // Esc in a text box just leaves the box (it doesn't take the tab back a page)
          if (el && root.contains(el) && /^(INPUT|TEXTAREA)$/.test(el.tagName)) { el.blur(); root.focus({ preventScroll: true }); return true; }
          if (cur && cur.at > 0) { back(); return true; }
          return false;
        }
        return false;
      },
      unmount() {
        dead = true; clearTimeout(noteT); clearTimeout(shieldT);
        removeEventListener('blur', onBlur); offs.forEach((f) => f()); if (ro) ro.disconnect();
        SR.live = Math.max(0, SR.live - 1); if (SR.live === 0) { SR.open = null; SR.page = () => null; SR.site = () => ''; }
        S.note = note.value; save();
      },
    };
  } });
})();
