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
  window.DICE_SYS = { token: 'emulator', version: cfg.version || '2.4.0', settings: sys.settings, user: sys.user, host: sys.host, emulated: true };
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
    if (url.pathname === '/api/brain/chat') return Promise.resolve(fakeBrain(body || {}));
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
  // the tests' pretend brain: a few scripted answers, streamed a word at a time like Ollama's
  const FAKE_BRAIN = /[?&]fakebrain=1\b/.test(location.search);
  let brainModel = 'qwen3.5:4b';
  function fakeBrain(b) {
    const msgs = b.messages || [], last = msgs[msgs.length - 1] || {}, said = String(last.content || '').toLowerCase();
    const user = String((msgs.filter((m) => m.role === 'user').pop() || {}).content || '').toLowerCase();
    const call = (name, args) => ({ function: { name, arguments: args } });
    let words = '', calls = [];
    if (last.role === 'tool') {
      if (last.tool_name === 'web_search') words = 'Blue light is scattered more than the other colours because its waves are shorter [1], which is called Rayleigh scattering [2].';
      else if (last.tool_name === 'calculate') words = 'That comes to ' + last.content.replace(/\.$/, '') + '.';
      else if (last.tool_name === 'look_at_screen') words = 'You have ' + (last.content.match(/The (\w+) window/) || [0, 'a'])[1] + ' window in front.';
      else if (last.tool_name === 'write_draft') words = 'Here is the email. Copy it when you are ready.';
      else words = 'Done: ' + last.content;
      if (last.tool_name === 'do' && /and play/.test(user) && msgs.filter((m) => m.role === 'tool').length < 2) { words = ''; calls = [call('do', { command: 'play some music' })]; }
    } else if (/timer/.test(said)) { words = 'Sure. '; calls = [call('do', { command: 'set a timer for ' + ((said.match(/\d+/) || ['10'])[0]) + ' minutes' })]; }
    else if (/dark mode and play/.test(said)) calls = [call('do', { command: 'turn on dark mode' })];
    else if (/%|percent|miles|km|tip/.test(said)) calls = [call('calculate', { expression: said.match(/\d+%? of \d+|\d+ miles in km/) ? said.match(/\d+%? of \d+|\d+ miles in km/)[0] : '15% of 80' })];
    else if (/why|who|what is/.test(said)) calls = [call('web_search', { query: said })];
    else if (/write|email/.test(said)) calls = [call('write_draft', { title: 'Email to my teacher', text: 'Hi Ms. Lee,\n\nI\'m sick today and won\'t be in class. I\'ll catch up on the homework tomorrow.\n\nThanks,\nDhruv' })];
    else if (/screen|this window|this page/.test(said)) calls = [call('look_at_screen', {})];
    else if (/and tomorrow|what about/.test(said)) words = 'Following on from before: you asked "' + String((msgs.filter((m) => m.role === 'user').slice(-2, -1)[0] || {}).content || '') + '".';
    else words = 'I am a pretend brain, for the tests.';
    tell({ event: 'log', text: 'Deuce\'s brain (pretend): ' + (calls.length ? calls.map((c) => c.function.name).join(', ') : words.slice(0, 60)) });
    const lines = words.split(/(?<= )/).filter(Boolean).map((w) => ({ message: { role: 'assistant', content: w } }));
    if (calls.length) lines.push({ message: { role: 'assistant', content: '', tool_calls: calls } });
    lines.push({ done: true });
    let i = 0;
    const stream = new ReadableStream({ pull(c) { return new Promise((res) => setTimeout(() => { if (i >= lines.length) c.close(); else c.enqueue(enc.encode(JSON.stringify(lines[i++]) + '\n')); res(); }, 30)); } });
    return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
  }
  const emuShield = { system: true, allow: [] };
  let emuAi = null;
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
          load: 0.3 + Math.random() * 0.4, wifi: sys.wifi, volume: { level: sys.volume, muted: false }, brightness: sys.brightness, battery: sys.battery,
          remote_keys: false, standby: false, front: running, voice: false });
      // pretend things on the TV's other HDMI inputs, and a pretend antenna tuner
      case '/api/cec/devices':
        return reply({ ok: true, me: 4, devices: [{ la: 1, kind: 'Playback 1', name: 'PlayStation 5', pa: '1.0.0.0', vendor: 'Sony', power: 'on', active: false },
          { la: 8, kind: 'Playback 2', name: 'Xbox', pa: '3.0.0.0', vendor: 'Microsoft', power: 'standby', active: false }, { la: 3, kind: 'Tuner 1', name: 'Cable box', pa: '4.0.0.0', vendor: 'Arris', power: 'on', active: false }] });
      case '/api/device': {
        const dv = sys.device || (sys.device = { ok: true, computer: 'dice', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', keyboard: 'us', wifi_country: 'US', ssh: false, updates: true, password_set: false, user: 'dice' });
        if (method === 'POST') {
          const done = [], problems = [];
          if (b.computer) { if (/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(b.computer)) { dv.computer = b.computer; done.push('Named this computer ' + b.computer); } else problems.push('The computer name "' + b.computer + '" has letters it can\'t use, so it wasn\'t changed.'); }
          if (b.timezone) { dv.timezone = b.timezone; done.push('Set the time zone to ' + b.timezone); }
          if (b.keyboard) { dv.keyboard = b.keyboard; done.push('Set the keyboard to ' + b.keyboard); }
          if (b.wifi && b.wifi.country) dv.wifi_country = b.wifi.country;
          if ('updates' in b) { dv.updates = !!b.updates; done.push('Turned automatic updates ' + (b.updates ? 'on' : 'off')); }
          if ('ssh' in b) { if (b.ssh && !dv.password_set) problems.push('SSH stayed off because no password was set. Set one first.'); else { dv.ssh = !!b.ssh; if (b.ssh) done.push('Turned on SSH'); } }
          return reply({ ok: !problems.length || !!done.length, done, problems, device: dv });
        }
        return reply(dv);
      }
      case '/api/shield': {
        if (method === 'POST') {
          if (typeof b.system === 'boolean') emuShield.system = b.system;
          if (b.action === 'allow' && b.site) emuShield.allow.push(b.site);
          if (b.action === 'unallow') emuShield.allow = emuShield.allow.filter((x) => x !== b.site);
        }
        return reply(Object.assign({ ok: true, error: null, busy: false, builtin: 362, big: 118204, updated: Math.round(Date.now() / 1000) - 2 * 86400 }, emuShield, { blocking: emuShield.system ? 118566 - emuShield.allow.length : 0 }));
      }
      case '/api/ask/ai':
        if (method === 'POST') emuAi = b.provider ? { provider: b.provider, model: b.model || '' } : null;
        return reply({ ok: true, set: !!emuAi, provider: emuAi && emuAi.provider, model: emuAi && emuAi.model, providers: [{ id: 'groq', name: 'Groq', model: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys' }, { id: 'openrouter', name: 'OpenRouter', model: 'meta-llama/llama-3.3-70b-instruct:free', keyUrl: 'https://openrouter.ai/keys' }, { id: 'google', name: 'Google AI Studio', model: 'gemini-2.5-flash', keyUrl: 'https://aistudio.google.com/apikey' }, { id: 'ollama', name: 'Ollama, on this computer', model: 'llama3.2', keyUrl: 'https://ollama.com/download', noKey: true }] });
      // Deuce's brain: only pretended for the tests (?fakebrain=1); otherwise the emulator has none
      case '/api/brain': {
        if (!FAKE_BRAIN) return reply({ ok: false, running: false, ready: false, error: 'The emulator has no brain of its own.' });
        if (b.action === 'choose' && b.model) brainModel = b.model;
        const choices = [['qwen3.5:2b', 'Quick', 2, 4], ['qwen3.5:4b', 'Smart', 3.4, 7], ['qwen3.5:9b', 'Smarter', 6.6, 14], ['qwen3.5:27b', 'Very smart', 17, 22], ['qwen3.5:35b', 'Smartest', 24, 40]]
          .map(([tag, name, size, need]) => ({ tag, name, size, need, about: 'A pretend model.', fits: need <= 8, here: tag === brainModel }));
        return reply({ ok: true, installed: true, running: true, ready: true, version: '0.40.17', models: [brainModel], model: brainModel, recommended: 'qwen3.5:4b', choices, busy: null, error: null, machine: { ram: 8, gpu: null, vram: 0, pi: true } });
      }
      case '/api/search':
        return reply({ ok: true, results: [{ title: 'Why Is the Sky Blue? | NASA Space Place', url: 'https://spaceplace.nasa.gov/blue-sky/', snippet: 'Sunlight reaches Earth\'s atmosphere and is scattered in all directions by all the gases and particles in the air. Blue light is scattered more than the other colors because it travels as shorter, smaller waves.' },
          { title: 'Rayleigh scattering - Wikipedia', url: 'https://en.wikipedia.org/wiki/Rayleigh_scattering', snippet: 'Rayleigh scattering is the scattering of light by particles much smaller than its wavelength; it is why the sky looks blue.' }] });
      case '/api/read':
        return reply({ ok: true, url: b.url, text: 'A pretend page for the tests. ' + b.url });
      case '/api/ask': {
        const qq = String(b.q || '').toLowerCase();
        tell({ event: 'log', text: 'Deuce looked up: ' + b.q + ' (pretend)' });
        if (/sky/.test(qq)) return reply({ ok: true, ai: emuAi ? 'Groq' : null, answer: 'Sunlight is made of every colour. As it comes through the air, the tiny gas molecules scatter short blue waves much more than red ones [1][2], so blue light reaches your eyes from all over the sky [2]. At sunset the light crosses more air, the blue is scattered away, and reds and oranges are left [3].',
          sources: [{ n: 1, title: 'Why Is the Sky Blue? | NASA Space Place', url: 'https://spaceplace.nasa.gov/blue-sky/', site: 'spaceplace.nasa.gov' }, { n: 2, title: 'Rayleigh scattering - Wikipedia', url: 'https://en.wikipedia.org/wiki/Rayleigh_scattering', site: 'en.wikipedia.org' }, { n: 3, title: 'Why are sunsets red? - Met Office', url: 'https://www.metoffice.gov.uk/weather/learn-about/weather/optical-effects/why-is-the-sky-blue', site: 'metoffice.gov.uk' }] });
        return reply({ ok: true, ai: null, answer: 'This is the emulator, so Deuce pretends here. On DiceOS it searches the web, reads the best pages and explains them, with a number after each fact for where it came from [1].', sources: [{ n: 1, title: 'DiceOS on GitHub', url: 'https://github.com/dpatel7-dev/DiceOS', site: 'github.com' }] });
      }
      case '/api/browse': tell({ event: 'log', text: 'Opened ' + b.url + ' in SereneTab (pretend)' }); return reply({ ok: true, where: 'serenetab' });
      case '/api/kvm':
        if (method === 'POST') { tell({ event: 'log', text: 'Screen: ' + (b.action === 'back' ? 'back to DiceOS' : 'input 0x' + Number(b.code).toString(16) + ' on screen ' + b.n) + ' (pretend)' }); return reply({ ok: true }); }
        return reply({ ok: true, cec: { ok: true, me: 4, devices: [{ la: 1, kind: 'Playback 1', name: 'PlayStation 5', pa: '1.0.0.0', vendor: 'Sony', power: 'on', active: false }, { la: 3, kind: 'Tuner 1', name: 'Cable box', pa: '4.0.0.0', vendor: 'Arris', power: 'on', active: false }] },
          monitors: { ok: true, screens: [{ n: 1, name: 'DELL U2720Q', bus: '/dev/i2c-6', connector: 'card1-DP-1', current: 15, inputs: [{ code: 15, name: 'DisplayPort 1', here: true, on: true }, { code: 17, name: 'HDMI 1', here: false, on: false }, { code: 27, name: 'USB-C', here: false, on: false }] }] } });
      case '/api/cec':
        tell({ event: 'log', text: 'HDMI-CEC: ' + b.action + (b.pa ? ' to ' + b.pa : '') + (b.key ? ' ' + b.key + ' to device ' + b.la : '') + ' (pretend)' });
        return reply({ ok: true });
      case '/api/tuner':
        if (method === 'POST') { tell({ event: 'log', text: 'Playing ' + b.name + ' from the antenna (pretend)' }); running = { name: b.name, kind: 'tv', key: b.url }; setTimeout(() => { running = null; }, 4000); return reply({ ok: true }); }
        return reply({ ok: true, channels: [['2.1', 'WCBS-HD'], ['4.1', 'WNBC-HD'], ['5.1', 'WNYW-FOX'], ['7.1', 'WABC-HD'], ['11.1', 'WPIX'], ['13.1', 'WNET-PBS']].map(([num, name]) => ({ num, name, url: 'http://192.168.1.60:5004/auto/v' + num, hd: true })) });
      case '/api/voice':
        if (method === 'POST') { if (b.action === 'say') tell({ event: 'log', text: 'Deuce says: ' + b.text }); return reply(b.action === 'start' ? { ok: false, error: 'Deuce isn\'t set up on this computer yet.', need: 'setup' } : { ok: true }); }
        return reply({ ok: true, ready: false, mics: ['iPazzPort Mic'], listening: false, job: null });
      case '/api/lookup': return reply({ ok: false, error: 'The emulator doesn\'t go online.' });
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
      case '/api/open': tell({ event: 'log', text: 'Opened ' + (b.name || b.url) + (b.full ? ' as a full-screen app' : ' in the browser') + ' (pretend)' }); if (!b.full) window.open(b.url, '_blank', 'noopener'); return reply({ ok: true });
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
