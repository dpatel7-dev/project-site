// The Dice emulator's pretend computer. When the emulator on the website
// (/dice/try) opens DiceWeb with ?emu=1, this stands in for Dice's helper
// (diced): it puts the settings in the page the same way, and answers the same
// /api/ calls with a pretend Raspberry Pi or PC. So DiceWeb behaves as it
// would running as Dice: the welcome, Wi-Fi, Bluetooth, sound, brightness,
// screenshots, restart and shut down all work. Files and Terminal stay pretend.
// It does nothing anywhere else.
(function () {
  'use strict';
  if (!/[?&]emu=1(&|$)/.test(location.search)) return;
  let cfg = {};
  try { cfg = JSON.parse(sessionStorage.getItem('dice-emu') || '{}'); } catch (e) { /* start blank */ }
  const dev = cfg.device || {};
  const started = Date.now();
  const sys = {
    host: cfg.host || 'dice', user: cfg.user || 'dice', model: dev.model || 'Raspberry Pi 5 Model B Rev 1.0',
    wifi: cfg.wifi && cfg.wifi.ssid ? { ssid: cfg.wifi.ssid, signal: 82 } : { ssid: null }, volume: 0.7,
    brightness: dev.backlight ? 0.9 : null, battery: dev.battery ? { percent: 76, charging: false } : null,
    settings: cfg.settings || {},
  };
  window.DICE_SYS = { token: 'emulator', version: cfg.version || '2.0.0', settings: sys.settings, user: sys.user, host: sys.host, emulated: true };
  const NETS = [[cfg.wifi && cfg.wifi.ssid ? cfg.wifi.ssid : 'Home', 84, true], ['Upstairs 5G', 61, true], ['Library Guest', 42, false], ['Printer-4F2A', 23, true]];
  const tell = (msg) => { try { parent.postMessage(Object.assign({ dice: 'emu' }, msg), location.origin); } catch (e) { /* not in the emulator after all */ } };
  const reply = (data, status) => new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return realFetch(input, init);
    let body = null;
    try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (e) { body = null; }
    const method = ((init && init.method) || 'GET').toUpperCase();
    if (url.pathname === '/api/events') return Promise.resolve(events());
    const query = Object.fromEntries(url.searchParams);
    return new Promise((res) => setTimeout(() => res(route(method, url.pathname, body || {}, query)), 80 + Math.random() * 160));
  };
  // the pretend TV remote beside the screen sends its buttons here, as HDMI-CEC would through diced
  const streams = new Set(), enc = new TextEncoder();
  function events() {
    let ctl;
    const stream = new ReadableStream({ start(c) { ctl = c; streams.add(c); }, cancel() { streams.delete(ctl); } });
    return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }
  addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.dice !== 'remote' || typeof e.data.a !== 'string') return;
    const line = enc.encode('data: ' + JSON.stringify({ a: e.data.a, key: e.data.key || e.data.a }) + '\n\n');
    streams.forEach((c) => { try { c.enqueue(line); } catch (err) { streams.delete(c); } });
  });
  let updateAsked = 0;
  // a pretend Bluetooth: a controller and a speaker already paired, two more nearby when you look
  const BT = { powered: true, devices: [
    { mac: '5C:BA:37:1F:20:8A', name: 'Wireless Controller', icon: 'input-gaming', paired: true, connected: true, battery: 80 },
    { mac: '00:1B:66:A2:4C:17', name: 'Living Room Speaker', icon: 'audio-card', paired: true, connected: false }] };
  const NEAR = [{ mac: '98:B6:E9:0D:3E:21', name: 'Xbox Wireless Controller', icon: 'input-gaming' }, { mac: '74:45:CE:91:7A:02', name: 'Headphones', icon: 'audio-headphones' }];
  const btState = (extra) => Object.assign({ ok: true, adapter: true, powered: BT.powered, devices: BT.powered ? BT.devices : [] }, extra || {});
  const HA = [['light.living_room', 'Living room', 'on'], ['light.desk_lamp', 'Desk lamp', 'off'], ['light.bedroom', 'Bedroom', 'off'], ['switch.fan', 'Fan', 'off'],
    ['light.led_strip', 'LED strip', 'on'], ['scene.movie_time', 'Movie time', 'scening']].map(([id, name, state]) => ({ entity_id: id, state, attributes: { friendly_name: name } }));
  function route(method, path, b, q) {
    lastQuery = q || {};
    switch (path) {
      case '/api/status':
        return reply({ version: window.DICE_SYS.version, host: sys.host, user: sys.user, model: sys.model, uptime: Math.round((Date.now() - started) / 1000) + 9,
          ip: sys.wifi.ssid ? '192.168.1.42' : null, temp: dev.pi ? 44 + Math.round(Math.random() * 30) / 10 : null,
          mem: { total: dev.mem || 8e9, used: (dev.mem || 8e9) * (0.21 + Math.random() * 0.02) }, disk: { total: dev.disk || 64e9, used: (dev.disk || 64e9) * 0.18 },
          load: 0.3 + Math.random() * 0.4, wifi: sys.wifi, volume: { level: sys.volume, muted: false }, brightness: sys.brightness, battery: sys.battery });
      case '/api/settings':
        if (method === 'POST') {
          if (b.ha_token) { sys.settings.ha_token_set = true; delete b.ha_token; } // like DiceOS, the token never comes back to the page
          Object.assign(sys.settings, b); tell({ event: 'settings', settings: sys.settings }); return reply({ ok: true, settings: sys.settings });
        }
        return reply(sys.settings);
      case '/api/ha': { // a pretend Home Assistant, so Dice Home has something to switch
        if (!sys.settings.homeassistant || !sys.settings.ha_token_set) return reply({ ok: false, error: 'Add your Home Assistant address and token in Dice Home first.' });
        if (b.path === '/api/states') return reply({ ok: true, data: HA });
        const m = /^\/api\/services\/(\w+)\/(\w+)$/.exec(b.path || ''), e = HA.find((x) => b.body && x.entity_id === b.body.entity_id);
        if (!m || !e) return reply({ ok: false, error: 'Not something Dice Home asks for.' });
        if (m[2] === 'toggle') e.state = e.state === 'on' ? 'off' : 'on';
        tell({ event: 'log', text: 'Home Assistant: ' + e.attributes.friendly_name + (m[2] === 'toggle' ? ' turned ' + e.state : ' ran') + ' (pretend)' });
        return reply({ ok: true, data: [e] });
      }
      case '/api/wifi':
        if (method === 'POST') {
          const n = NETS.find(([s]) => s === b.ssid);
          if (n && n[2] && !b.password) return reply({ ok: false, error: 'That network needs a password.' });
          sys.wifi = { ssid: b.ssid, signal: n ? n[1] : 60 };
          tell({ event: 'log', text: 'Joined the Wi-Fi network ' + b.ssid + ' (pretend)' });
          return reply({ ok: true });
        }
        return reply({ networks: NETS.map(([ssid, signal, secure]) => ({ ssid, signal, secure, active: sys.wifi.ssid === ssid })) });
      case '/api/volume': sys.volume = +b.level || 0; return reply({ ok: true });
      case '/api/brightness': sys.brightness = +b.level || 0; tell({ event: 'brightness', level: sys.brightness }); return reply({ ok: true });
      case '/api/password': tell({ event: 'log', text: 'Changed the password (pretend)' }); return reply({ ok: true });
      case '/api/power': tell({ event: 'power', action: b.action }); return reply({ ok: true });
      case '/api/bluetooth': {
        if (method === 'GET') return reply(btState());
        const d = BT.devices.find((x) => x.mac === b.mac);
        if (b.action === 'on' || b.action === 'off') BT.powered = b.action === 'on';
        else if (b.action === 'scan') NEAR.forEach((n) => { if (!BT.devices.some((x) => x.mac === n.mac)) BT.devices.push(Object.assign({ paired: false, connected: false }, n)); });
        else if (!d) return reply(btState({ ok: false, error: 'That device isn\'t nearby any more.' }));
        else if (b.action === 'pair') { d.paired = true; d.connected = true; }
        else if (b.action === 'connect') d.connected = true;
        else if (b.action === 'disconnect') d.connected = false;
        else if (b.action === 'remove') BT.devices.splice(BT.devices.indexOf(d), 1);
        tell({ event: 'log', text: 'Bluetooth: ' + b.action + (d ? ' ' + d.name : '') + ' (pretend)' });
        return reply(btState());
      }
      case '/api/remote':
        if (method === 'GET') return reply({ ok: true, available: true, tv: 'the pretend TV', why: '' });
        tell({ event: 'log', text: 'TV remote: ' + (b.cmd || '?') + ' (pretend HDMI-CEC)' });
        return reply({ ok: true });
      case '/api/screenshot': {
        const p = '~/Pictures/Screenshots/Screenshot ' + new Date().toISOString().slice(0, 19).replace('T', ' at ').replace(/:/g, '.') + '.png';
        tell({ event: 'log', text: 'Took a screenshot: ' + p + ' (pretend)' });
        return reply({ ok: true, path: p });
      }
      case '/api/open': tell({ event: 'log', text: 'Opened ' + b.url + ' in the browser' }); window.open(b.url, '_blank', 'noopener'); return reply({ ok: true });
      case '/api/update':
        if (method === 'POST') { updateAsked = Date.now(); return reply({ ok: true }); }
        return reply({ log: Date.now() - updateAsked < 2500 ? 'Checking the website for a newer DiceOS…' : 'Checking the website for a newer DiceOS…\nThis is the newest DiceOS.' });
      case '/api/apps': return reply(method === 'POST' ? appsDo(b) : appsStatus());
      case '/api/apps/search': return reply({ ok: true, items: appsSearch(lastQuery) });
      case '/api/apps/icon': return reply({ ok: false }, 404);
      case '/api/games':
        if (method === 'POST') {
          if (b.action === 'pair') { startJob('pair:' + b.host, 'Pairing', 3000, () => { PC.paired = true; }); return reply({ ok: true, job: jobOf('pair:' + b.host) }); }
          if (b.action === 'play') { tell({ event: 'log', text: 'Streaming ' + b.game + ' from ' + b.host + ' at ' + (b.quality || '1080p') + ' (pretend)' }); running = { name: b.game, kind: 'game', key: 'game:' + b.host }; return reply({ ok: true }); }
          if (b.action === 'quit') return reply({ ok: true });
          return reply({ ok: false, error: 'Unknown action.' }, 400);
        }
        if (!installed.some((a) => a.id === 'com.moonlight_stream.Moonlight')) return reply({ ok: false, error: 'Moonlight isn\'t installed yet.', need: 'moonlight' });
        if (!PC.paired) return reply({ ok: false, error: 'This computer isn\'t paired with ' + (lastQuery.host || 'it') + ' yet.', paired: false });
        return reply({ ok: true, games: PC.games });
      default:
        return reply({ ok: false, error: 'The emulator doesn\'t do that.' }, 404);
    }
  }
  // a pretend Flathub (a few real apps), installing in a few seconds
  const CATALOG_APPS = [['org.videolan.VLC', 'VLC', 'Plays almost any video or song file', 'AudioVideo'], ['tv.kodi.Kodi', 'Kodi', 'A media centre for films, shows and music', 'AudioVideo'],
    ['com.moonlight_stream.Moonlight', 'Moonlight', 'Play games streamed from your gaming PC', 'Game'], ['org.libretro.RetroArch', 'RetroArch', 'Old consoles\' games, with a controller', 'Game'],
    ['org.prismlauncher.PrismLauncher', 'Prism Launcher', 'Minecraft: Java Edition, with mods', 'Game'], ['net.supertuxkart.SuperTuxKart', 'SuperTuxKart', 'A free kart racer', 'Game'],
    ['org.gimp.GIMP', 'GIMP', 'Edit photos and pictures', 'Graphics'], ['org.kde.krita', 'Krita', 'Paint and draw', 'Graphics'], ['org.inkscape.Inkscape', 'Inkscape', 'Drawings that scale to any size', 'Graphics'],
    ['org.blender.Blender', 'Blender', '3D models and animation', 'Graphics'], ['org.audacityteam.Audacity', 'Audacity', 'Record and edit sound', 'AudioVideo'], ['com.obsproject.Studio', 'OBS Studio', 'Record and stream your screen', 'AudioVideo'],
    ['org.libreoffice.LibreOffice', 'LibreOffice', 'Documents, spreadsheets and slides', 'Office'], ['org.mozilla.firefox', 'Firefox', 'A web browser', 'Network'], ['com.visualstudio.code', 'Visual Studio Code', 'A code editor', 'Development']]
    .map(([id, name, summary, cat]) => ({ id, name, summary, cats: [cat], icon: false }));
  let installed = [], ready = !!cfg.appsReady, running = null, lastQuery = {};
  const jobs = {}, PC = { paired: false, games: ['Desktop', 'Steam Big Picture', 'Rocket League', 'Minecraft', 'Forza Horizon 5'] };
  const jobOf = (k) => (jobs[k] ? Object.assign({}, jobs[k]) : null);
  function startJob(key, title, ms, done) {
    const j = jobs[key] = { key, title, state: 'working', pct: 0, error: '', at: Date.now() / 1000 };
    const t0 = Date.now();
    const tick = () => { j.pct = Math.min(99, Math.round((Date.now() - t0) / ms * 100)); if (Date.now() - t0 >= ms) { j.state = 'done'; j.pct = 100; done(); } else setTimeout(tick, 200); };
    setTimeout(tick, 200);
    return j;
  }
  function appsStatus() {
    return { ok: true, flatpak: ready, flathub: ready, arch: /PC|x86/i.test(sys.model) ? 'x86_64' : 'aarch64', catalog: ready ? 2600 : 0, installed: installed.map((a) => ({ id: a.id, name: a.name, version: '1.0' })),
      jobs: Object.values(jobs).map((j) => Object.assign({}, j)), front: running, moonlight: installed.some((a) => a.id === 'com.moonlight_stream.Moonlight') };
  }
  function appsDo(b) {
    const a = CATALOG_APPS.find((x) => x.id === b.id);
    switch (b.action) {
      case 'setup': startJob('setup', 'Getting apps ready', 5000, () => { ready = true; }); return { ok: true, job: jobOf('setup') };
      case 'install': if (!a) return { ok: true, job: { state: 'failed', error: 'That isn\'t an app.' } }; startJob(a.id, 'Installing', 4000, () => { if (!installed.includes(a)) installed.push(a); }); return { ok: true, job: jobOf(a.id) };
      case 'remove': startJob(b.id, 'Removing', 1500, () => { installed = installed.filter((x) => x.id !== b.id); }); return { ok: true, job: jobOf(b.id) };
      case 'open': if (!a || !installed.includes(a)) return { ok: false, error: 'That app isn\'t installed.' }; tell({ event: 'log', text: 'Opened ' + a.name + ' (pretend: on DiceOS it opens on top, and Home closes it)' }); running = { name: a.name, kind: 'app', key: a.id }; setTimeout(() => { running = null; }, 4000); return { ok: true };
      case 'close': { const was = !!running; running = null; return { ok: true, closed: was }; }
      case 'update': return { ok: true, job: startJob('update', 'Updating apps', 2000, () => {}) };
      default: return { ok: false, error: 'Unknown action.' };
    }
  }
  function appsSearch(q) {
    if (q.ids) return CATALOG_APPS.filter((a) => q.ids.split(',').includes(a.id));
    const words = String(q.q || '').toLowerCase().split(/\s+/).filter(Boolean);
    return CATALOG_APPS.filter((a) => (!q.cat || a.cats.includes(q.cat)) && words.every((w) => (a.name + ' ' + a.summary + ' ' + a.id).toLowerCase().includes(w)));
  }
  // tell the emulator when DiceWeb has started, so it can hide the start-up screen
  addEventListener('load', () => tell({ event: 'ready' }));
})();
