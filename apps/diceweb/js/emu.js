// The Dice emulator's pretend computer. When the emulator on the website
// (/dice/try) opens DiceWeb with ?emu=1, this stands in for Dice's helper
// (diced): it puts the settings in the page the same way, and answers the same
// /api/ calls with a pretend Raspberry Pi or PC. So DiceWeb behaves as it
// would running as Dice: the welcome, Wi-Fi, sound, brightness, restart and
// shut down all work. Files and Terminal stay pretend. It does nothing anywhere else.
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
  window.DICE_SYS = { token: 'emulator', version: cfg.version || '1.4.0', settings: sys.settings, user: sys.user, host: sys.host, emulated: true };
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
    return new Promise((res) => setTimeout(() => res(route(method, url.pathname, body || {})), 80 + Math.random() * 160));
  };
  let updateAsked = 0;
  const HA = [['light.living_room', 'Living room', 'on'], ['light.desk_lamp', 'Desk lamp', 'off'], ['light.bedroom', 'Bedroom', 'off'], ['switch.fan', 'Fan', 'off'],
    ['light.led_strip', 'LED strip', 'on'], ['scene.movie_time', 'Movie time', 'scening']].map(([id, name, state]) => ({ entity_id: id, state, attributes: { friendly_name: name } }));
  function route(method, path, b) {
    switch (path) {
      case '/api/status':
        return reply({ version: window.DICE_SYS.version, host: sys.host, user: sys.user, model: sys.model, uptime: Math.round((Date.now() - started) / 1000) + 9,
          ip: sys.wifi.ssid ? '192.168.1.42' : null, temp: dev.pi ? 44 + Math.round(Math.random() * 30) / 10 : null,
          mem: { total: dev.mem || 8e9, used: (dev.mem || 8e9) * (0.21 + Math.random() * 0.02) }, disk: { total: dev.disk || 64e9, used: (dev.disk || 64e9) * 0.18 },
          load: 0.3 + Math.random() * 0.4, wifi: sys.wifi, volume: sys.volume, brightness: sys.brightness, battery: sys.battery });
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
      case '/api/open': tell({ event: 'log', text: 'Opened ' + b.url + ' in the browser' }); window.open(b.url, '_blank', 'noopener'); return reply({ ok: true });
      case '/api/update':
        if (method === 'POST') { updateAsked = Date.now(); return reply({ ok: true }); }
        return reply({ log: Date.now() - updateAsked < 2500 ? 'Checking the website for a newer DiceOS…' : 'Checking the website for a newer DiceOS…\nThis is the newest DiceOS.' });
      default:
        return reply({ ok: false, error: 'The emulator doesn\'t do that.' }, 404);
    }
  }
  // tell the emulator when DiceWeb has started, so it can hide the start-up screen
  addEventListener('load', () => tell({ event: 'ready' }));
})();
