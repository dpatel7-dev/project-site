// Dice Home: DiceOS on the wall. A big clock and the date, the weather, the
// day's tasks from Axiom, and buttons for Home Assistant (lights, switches,
// fans, scenes) that work with a tap. Made for a 7 inch screen by the door.
//
// On DiceOS, the Home Assistant buttons go through DiceOS's helper (diced),
// which keeps the token on the computer and talks to Home Assistant itself.
// In a browser tab there's no helper, so Dice Home offers the dashboard instead.
// Everything shifts a few pixels each minute so the screen doesn't burn in.
(function () {
  'use strict';
  const D = window.Dice, G = window.DiceGfx, L = D.L, h = D.h, esc = D.esc;
  const W = D.wall = { on: false };
  const DOMAINS = ['light', 'switch', 'fan', 'input_boolean', 'scene', 'script', 'cover', 'lock'];
  const cfg = () => { const c = D.state.home || (D.state.home = {}); if (!Array.isArray(c.entities)) c.entities = []; return c; };
  const two = (n) => String(n).padStart(2, '0');
  let root = null, scene = null, sceneKey = '', poll = 0, states = null, haError = '', lastMin = -1, busy = {};
  const PIC = {
    light: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    switch: '<rect x="4" y="8" width="16" height="8" rx="4"/><circle cx="15.5" cy="12" r="2.2"/>',
    fan: '<circle cx="12" cy="12" r="1.6"/><path d="M12 10.4c0-4 1-6.4 3.2-6.4 2.4 0 2.4 3.6-1.6 6.6M13.6 12c4 0 6.4 1 6.4 3.2 0 2.4-3.6 2.4-6.6-1.6M12 13.6c0 4-1 6.4-3.2 6.4-2.4 0-2.4-3.6 1.6-6.6M10.4 12c-4 0-6.4-1-6.4-3.2 0-2.4 3.6-2.4 6.6 1.6"/>',
    scene: '<path d="M12 3l2.2 5.2L20 9l-4.4 3.8L17 18.5 12 15.6 7 18.5l1.4-5.7L4 9l5.8-.8z"/>',
    cover: '<rect x="5" y="4" width="14" height="16" rx="1.5"/><path d="M5 9h14M5 14h14"/>',
    lock: '<rect x="6" y="11" width="12" height="9" rx="2"/><path d="M9 11V8a3 3 0 0 1 6 0v3"/>',
  };
  PIC.input_boolean = PIC.switch; PIC.script = PIC.scene;
  const pic = (d) => '<svg class="wl-pic" viewBox="0 0 24 24" aria-hidden="true">' + (PIC[d] || PIC.switch) + '</svg>';

  function build() {
    root = h('<div id="wall" hidden role="dialog" aria-label="Dice Home"><canvas class="wl-bg" aria-hidden="true"></canvas><div class="wl-veil"></div>' +
      '<div class="wl-in"><div class="wl-time"><b class="wl-clock"></b><span class="wl-date"></span></div>' +
      '<section class="wl-wx wl-glass" aria-label="Weather"></section>' +
      '<section class="wl-ha wl-glass" aria-label="Home Assistant"><h2>Home</h2><div class="wl-tiles"></div></section>' +
      '<section class="wl-due wl-glass" aria-label="Due today, from Axiom"><h2>Due today</h2><div class="wl-list"></div></section>' +
      '<div class="wl-bar"><span class="wl-mark"></span><button class="wl-btn" data-nav data-key="wl:setup">Set up</button><button class="wl-btn" data-nav data-key="wl:leave">Leave Dice Home</button></div></div>' +
      '<div class="wl-setup wl-glass" hidden></div></div>');
    root.querySelector('.wl-mark').append(G.productIcon('home', 28), h('<b>Dice Home</b>'));
    root.querySelector('[data-key="wl:leave"]').onclick = () => W.exit();
    root.querySelector('[data-key="wl:setup"]').onclick = setup;
    document.body.appendChild(root);
  }

  // ---- the parts --------------------------------------------------------------------------
  function paintTime() {
    const now = new Date();
    root.querySelector('.wl-clock').textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '');
    root.querySelector('.wl-date').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    if (now.getMinutes() !== lastMin) {
      lastMin = now.getMinutes();
      // move everything a little each minute, so nothing sits on the same pixels all day
      const k = lastMin % 8, dx = [0, 4, 8, 4, 0, -4, -8, -4][k], dy = [0, 3, 0, -3, 0, 3, 0, -3][k];
      root.querySelector('.wl-in').style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      paintDue();
      if (lastMin % 15 === 0) paintWeather();
    }
  }
  function place() { return cfg().place || (D.state.st && D.state.st.place) || null; }
  async function paintWeather() {
    const box = root.querySelector('.wl-wx'), p = place(), units = (D.state.st && D.state.st.units) || 'f';
    if (!p || !D.weather) { box.innerHTML = '<p class="wl-muted">Add your town in Set up to see the weather here.</p>'; return; }
    try {
      const d = await D.weather.get(p.lat, p.lon, units), w = D.weather.words(d.code);
      box.innerHTML = '<div class="wl-wxtop">' + D.weather.icon(w.kind, D.night()) + '<b>' + d.t + '°</b></div><p>' + esc(w.text) + '</p><p class="wl-muted">High ' + d.hi + '°, low ' + d.lo + '°. ' + esc(p.name) + '</p>';
    } catch (e) { box.innerHTML = '<p class="wl-muted">No weather right now. It needs the internet.</p>'; }
  }
  function paintDue() {
    const box = root.querySelector('.wl-due'), A = D.state.axiom;
    if (!A || !Array.isArray(A.tasks) || !A.tasks.length) { box.hidden = true; return; }
    const today = L.dayKey(new Date()), b = L.planBuckets(A.tasks, today), list = b.overdue.concat(b.today).slice(0, 4);
    box.hidden = false;
    const l = box.querySelector('.wl-list');
    l.innerHTML = list.length ? '' : '<p class="wl-muted">Nothing due today.</p>';
    list.forEach((t) => {
      const c = (A.classes || []).find((x) => x.id === t.classId);
      const r = h('<div class="wl-task" style="--c:' + (c ? c.color : '#d4a857') + '"><button class="wl-tick" data-nav data-key="wl:t-' + esc(t.id) + '" role="checkbox" aria-checked="false" aria-label="Done: ' + esc(t.title) + '"></button><span><b>' + esc(t.title) + '</b><small>' + esc(c ? c.name : '') + (t.due < today ? ' overdue' : '') + '</small></span></div>');
      r.querySelector('button').onclick = () => { t.done = true; t.doneAt = today; D.save(); D.S.play('select'); paintDue(); };
      l.appendChild(r);
    });
  }
  // Home Assistant, through DiceOS's helper
  const ha = (path, body) => D.sys.post('/api/ha', { path, body });
  async function loadStates() {
    if (!D.sys) return;
    const r = await ha('/api/states');
    if (!W.on) return;
    if (r && r.ok && Array.isArray(r.data)) { states = r.data.filter((s) => DOMAINS.includes(s.entity_id.split('.')[0])); haError = ''; }
    else { states = null; haError = (r && r.error) || 'Couldn\'t reach Home Assistant.'; }
    paintTiles();
  }
  function chosen() {
    if (!states) return [];
    const want = cfg().entities;
    if (want.length) return want.map((id) => states.find((s) => s.entity_id === id)).filter(Boolean);
    return states.filter((s) => /^(light|switch|fan)\./.test(s.entity_id)).slice(0, 8);
  }
  function paintTiles() {
    const box = root.querySelector('.wl-tiles'), haUrl = (D.sys && D.sys.settings.homeassistant) || D.state.ha || '';
    box.innerHTML = '';
    if (!D.sys) {
      box.innerHTML = '<p class="wl-muted">Buttons for your lights and switches work when Dice Home runs on DiceOS.' + (haUrl ? '' : ' Add your Home Assistant address in Set up to open its dashboard from here.') + '</p>';
      if (haUrl) { const b = h('<button class="wl-btn" data-nav data-key="wl:dash">Open Home Assistant</button>'); b.onclick = () => (D.browse ? D.browse(haUrl) : window.open(haUrl, '_blank', 'noopener')); box.appendChild(b); }
      return;
    }
    if (!D.sys.settings.homeassistant || !D.sys.settings.ha_token_set) { box.innerHTML = '<p class="wl-muted">Connect Home Assistant in Set up, and your lights and switches show up here.</p>'; return; }
    if (haError) { box.innerHTML = '<p class="wl-muted">' + esc(haError) + '</p>'; return; }
    if (!states) { box.innerHTML = '<p class="wl-muted">Asking Home Assistant…</p>'; return; }
    const list = chosen();
    if (!list.length) { box.innerHTML = '<p class="wl-muted">No lights or switches yet. Pick some in Set up.</p>'; return; }
    list.forEach((s) => {
      const dom = s.entity_id.split('.')[0], on = s.state === 'on' || s.state === 'open' || s.state === 'unlocked', name = (s.attributes && s.attributes.friendly_name) || s.entity_id;
      const word = dom === 'scene' || dom === 'script' ? 'Tap to run' : s.state === 'unavailable' ? 'Not answering' : on ? 'On' : 'Off';
      const t = h('<button class="wl-tile' + (on ? ' on' : '') + '" data-nav data-key="wl:e-' + esc(s.entity_id) + '" aria-pressed="' + on + '"' + (s.state === 'unavailable' ? ' disabled' : '') + '>' + pic(dom) + '<b>' + esc(name) + '</b><span>' + word + '</span></button>');
      t.onclick = async () => {
        if (busy[s.entity_id]) return;
        busy[s.entity_id] = true;
        const svc = dom === 'scene' || dom === 'script' ? 'turn_on' : dom === 'lock' ? (on ? 'lock' : 'unlock') : dom === 'cover' ? 'toggle' : 'toggle';
        if (dom !== 'scene' && dom !== 'script') { t.classList.toggle('on'); t.querySelector('span').textContent = t.classList.contains('on') ? 'On' : 'Off'; }
        D.S.play('select');
        const r = await ha('/api/services/' + dom + '/' + svc, { entity_id: s.entity_id });
        busy[s.entity_id] = false;
        if (!r || !r.ok) D.toast({ icon: 'bell', c: '#e5534b', title: 'Home Assistant', text: (r && r.error) || 'That didn\'t work.' });
        setTimeout(loadStates, 700);
      };
      box.appendChild(t);
    });
  }

  // ---- Set up: your town, Home Assistant, which buttons ----------------------------------------
  function setup() {
    const box = root.querySelector('.wl-setup'), c = cfg(), haUrl = (D.sys && D.sys.settings.homeassistant) || D.state.ha || '';
    box.hidden = false;
    box.innerHTML = '<h2>Set up Dice Home</h2>' +
      '<label class="wl-f"><span>Your town, for the weather</span><input data-nav data-key="wl:town" placeholder="Town or city" value="' + esc((place() || {}).name || '') + '"></label>' +
      '<label class="wl-f"><span>Home Assistant address</span><input data-nav data-key="wl:haurl" type="url" placeholder="http://homeassistant.local:8123" value="' + esc(haUrl) + '"></label>' +
      (D.sys ? '<label class="wl-f"><span>Home Assistant token</span><input data-nav data-key="wl:hatok" type="password" autocomplete="off" placeholder="' + (D.sys.settings.ha_token_set ? 'Saved. Paste a new one to change it.' : 'A long-lived access token') + '"><small>Make one in Home Assistant: your profile, Security, Long-lived access tokens. It stays on this computer.</small></label>' : '') +
      '<div class="wl-pick"></div><p class="wl-err" role="status"></p><div class="wl-row"><button class="wl-btn go" data-nav data-key="wl:save">Save</button><button class="wl-btn" data-nav data-key="wl:close">Close</button></div>';
    const pick = box.querySelector('.wl-pick');
    if (states && states.length) {
      pick.innerHTML = '<span class="wl-f"><span>Buttons to show (up to 12)</span></span>';
      const grid = h('<div class="wl-picks"></div>');
      states.slice(0, 80).forEach((s) => {
        const id = s.entity_id, name = (s.attributes && s.attributes.friendly_name) || id;
        const b = h('<label class="wl-chk"><input type="checkbox" value="' + esc(id) + '"' + (c.entities.includes(id) ? ' checked' : '') + '><span>' + esc(name) + '</span></label>');
        grid.appendChild(b);
      });
      pick.appendChild(grid);
    }
    const err = box.querySelector('.wl-err');
    box.querySelector('[data-key="wl:close"]').onclick = () => { box.hidden = true; D.nav.first(root); };
    box.querySelector('[data-key="wl:save"]').onclick = async () => {
      err.textContent = '';
      const town = box.querySelector('[data-key="wl:town"]').value.trim(), url = box.querySelector('[data-key="wl:haurl"]').value.trim();
      if (town && town !== (place() || {}).name) {
        try { const p = await D.weather.find(town); if (!p) { err.textContent = 'No town called ' + town + '.'; return; } c.place = p; } catch (e) { err.textContent = 'Can\'t look up towns without the internet.'; return; }
      }
      if (url && !/^https?:\/\/\S+$/i.test(url)) { err.textContent = 'The address starts with http:// or https://'; return; }
      const boxes = [...box.querySelectorAll('.wl-picks input')];
      if (boxes.length) c.entities = boxes.filter((x) => x.checked).map((x) => x.value).slice(0, 12);
      D.state.ha = url;
      if (D.sys) {
        const tok = box.querySelector('[data-key="wl:hatok"]').value.trim(), s = { homeassistant: url };
        if (tok) s.ha_token = tok;
        const r = await D.sys.saveSettings(s);
        if (r && r.settings) { D.sys.settings.ha_token_set = !!r.settings.ha_token_set; delete D.sys.settings.ha_token; }
      }
      D.save(); box.hidden = true; paintWeather(); loadStates(); D.nav.first(root);
    };
    setTimeout(() => D.nav.first(box), 30);
  }

  // ---- in and out ---------------------------------------------------------------------------------
  W.enter = function () {
    if (W.on) return;
    if (!root) build();
    W.on = true; root.hidden = false; root.classList.add('on');
    document.documentElement.classList.add('wall-on');
    lastMin = -1; paintTime(); paintWeather(); paintDue(); paintTiles(); loadStates();
    clearInterval(poll); poll = setInterval(() => { if (W.on) loadStates(); }, 15000);
    setTimeout(() => D.nav.first(root), 40);
    D.S.play('select');
  };
  W.exit = function () {
    if (!W.on) return;
    W.on = false; root.hidden = true; root.classList.remove('on');
    document.documentElement.classList.remove('wall-on');
    clearInterval(poll);
    D.S.play('back');
  };
  W.action = function (a) {
    if (D.$('#dialog.open')) return false;
    const set = root.querySelector('.wl-setup');
    if (a === 'b') { if (!set.hidden) { set.hidden = true; D.nav.first(root); } else W.exit(); return true; }
    if (a === 'a') { const el = document.activeElement; if (el && root.contains(el) && el.tagName === 'INPUT' && el.type !== 'checkbox') return true; D.nav.press(); return true; }
    if (['up', 'down', 'left', 'right'].includes(a)) { D.nav.move(a); return true; }
    return true; // the menus stay closed while Dice Home is up
  };
  W.frame = function (now) {
    if (!W.on || document.hidden) return;
    paintTime();
    const cv = root.querySelector('.wl-bg'), cell = D.scapeCell ? D.scapeCell() : 3;
    const Wd = Math.ceil(innerWidth / cell), Hd = Math.ceil(innerHeight / cell), night = D.night(), key = Wd + 'x' + Hd + night + D.state.world;
    if (key !== sceneKey) { sceneKey = key; cv.width = Wd; cv.height = Hd; cv.style.width = Wd * cell + 'px'; cv.style.height = Hd * cell + 'px'; scene = new G.Scape({ world: D.state.world, night, W: Wd, H: Hd, seed: 'home' }); }
    scene.draw(cv.getContext('2d'), now / 1000, D.state.motion === 'less');
  };
})();
