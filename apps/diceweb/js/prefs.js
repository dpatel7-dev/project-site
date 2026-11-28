// Your preferences: the same ones a dice.json carries. They come in from a dice.json (made on the
// website before installing, or used later in Settings, This computer), and go back out as a
// dice.json to keep, or to set up another computer the same way. Passwords never go in one made
// here: they stay on the computer they belong to.
//
//   name, look (auto/day/night), buddy, boot (full/quick/off), start (desktop/gaming/home), world,
//   homeassistant, looks (normal/traced), accent (auto or #rrggbb), text (normal/large/larger),
//   clock (auto/12/24), units (f/c), sounds, nightlight (off/night/on), motion (full/less),
//   ambient {after: minutes, show}, deuce {on, talk}, tv {live, have, tuner}, desk {snap, hotCorner, homeIcon},
//   layout {dock, tv, menu: app ids in order; widgets}, webapps [{name, url}] (websites as apps)
// (apps, Flathub apps to install, and files, a dice-files.zip to copy, are DiceOS's own: bin/dice-boot)
(function () {
  'use strict';
  const D = window.Dice;
  const P = D.prefs = {};
  const isHex = (c) => /^#[0-9a-f]{6}$/i.test(String(c || ''));
  // Traced mode used to be called Heavenly looks
  if (D.state.looks === 'heaven') { D.state.looks = 'traced'; D.save(); }
  P.looks = (v) => (v === 'traced' || v === 'heaven' ? 'traced' : 'normal');
  P.ACCENTS = ['#ff707a', '#f5a623', '#f5c431', '#8fd16a', '#2bc4b2', '#3a9be8', '#7c9cff', '#d39cf5', '#ff7ac8'];
  // app ids in a list (the dock, DiceTV's Home, the Dice menu), kept to ones that look right
  const idList = (a, max) => (Array.isArray(a) ? a.filter((x, i) => typeof x === 'string' && /^[a-z][a-z0-9-]{1,23}$/.test(x) && a.indexOf(x) === i).slice(0, max) : null);
  // a widget: its type, where it sits, and its own few plain settings (a sticky's text, a countdown's date)
  const clamp01 = (n) => (typeof n === 'number' && isFinite(n) ? Math.max(0, Math.min(0.9, n)) : 0.1);
  function widget(w) {
    if (!w || typeof w !== 'object' || !/^[a-z]{2,12}$/.test(w.type)) return null;
    const o = {};
    Object.keys(w).slice(0, 16).forEach((k) => {
      const v = w[k];
      if (!/^[a-zA-Z]{1,16}$/.test(k) || k === 'editing') return;
      if ((typeof v === 'number' && isFinite(v)) || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 600)) o[k] = v;
      else if (Array.isArray(v) && v.length <= 12 && v.every((x) => typeof x === 'string' && x.length <= 60)) o[k] = v.slice();
    });
    o.x = clamp01(o.x); o.y = clamp01(o.y);
    return o;
  }
  P.widget = widget;

  // a dice.json's fields into DiceOS
  P.apply = function (s) {
    if (!s || typeof s !== 'object') return 0;
    const st = D.state;
    let n = 0;
    const put = (k, v) => { st[k] = v; n++; };
    if (s.name) put('name', String(s.name).slice(0, 20));
    if (['auto', 'day', 'night'].includes(s.look)) put('look', s.look);
    if (s.buddy && (s.buddy === 'cubby' || (window.ART && ART.mascots[s.buddy]))) put('avatar', s.buddy);
    if (['full', 'quick', 'off'].includes(s.boot)) put('boot', s.boot);
    if (s.start) put('start', s.start === 'gaming' || s.start === 'tv' ? 'game' : s.start === 'home' ? 'home' : 'desk');
    if (D.WORLDS && D.WORLDS[s.world]) put('world', s.world);
    if (s.homeassistant && /^https?:\/\//.test(s.homeassistant)) put('ha', String(s.homeassistant));
    if (['normal', 'traced', 'heaven'].includes(s.looks)) put('looks', P.looks(s.looks));
    if (s.accent === 'auto' || isHex(s.accent)) put('accent', s.accent);
    if (['normal', 'large', 'larger'].includes(s.text)) put('text', s.text);
    if (['auto', '12', '24'].includes(String(s.clock))) put('clock', String(s.clock));
    if (s.units === 'f' || s.units === 'c') { st.st = Object.assign({}, st.st, { units: s.units }); n++; }
    if (typeof s.sounds === 'boolean') put('ui', s.sounds);
    if (['off', 'night', 'on'].includes(s.nightlight)) put('warm', s.nightlight);
    if (s.motion === 'less' || s.motion === 'full') put('motion', s.motion);
    if (s.ambient && typeof s.ambient === 'object') {
      if ([0, 5, 10, 30].includes(+s.ambient.after)) put('idle', +s.ambient.after);
      if (typeof s.ambient.show === 'string' && s.ambient.show.length < 20) put('amb', s.ambient.show);
    }
    if (s.deuce && typeof s.deuce === 'object') put('deuce', { on: s.deuce.on !== false, talk: s.deuce.talk !== false });
    if (s.tv && typeof s.tv === 'object') {
      const t = Object.assign({ live: null, have: [], tuner: '' }, st.tvsvc);
      if ('live' in s.tv) t.live = typeof s.tv.live === 'string' && s.tv.live ? s.tv.live : null;
      if (Array.isArray(s.tv.have)) t.have = s.tv.have.filter((x) => typeof x === 'string').slice(0, 30);
      if (typeof s.tv.tuner === 'string') t.tuner = s.tv.tuner.replace(/^https?:\/\//, '').replace(/\/.*$/, '').slice(0, 80);
      put('tvsvc', t);
    }
    if (s.desk && typeof s.desk === 'object') {
      if ('snap' in s.desk) put('snap', !!s.desk.snap);
      if ('hotCorner' in s.desk) put('hotCorner', !!s.desk.hotCorner);
      if ('homeIcon' in s.desk) put('deskIcons', s.desk.homeIcon ? 'home' : 'none');
    }
    // your home screens, arranged before installing (Make it yours) or on another computer
    if (s.layout && typeof s.layout === 'object') {
      const dock = idList(s.layout.dock, 20), tv = idList(s.layout.tv, 7), menu = idList(s.layout.menu, 24);
      if (dock && dock.length) put('dock', dock);
      if (tv && tv.length) put('homeApps', tv);
      if (menu && menu.length) put('startPins', menu);
      if (Array.isArray(s.layout.widgets)) put('widgets', s.layout.widgets.slice(0, 16).map(widget).filter(Boolean));
    }
    // websites as apps (the Store's Web apps)
    if (Array.isArray(s.webapps) && D.myApps && D.myApps.addWeb) {
      s.webapps.slice(0, 40).forEach((w) => { try { if (w && /^https?:\/\//.test(String(w.url))) { D.myApps.addWeb(String(w.name || '').slice(0, 40), String(w.url)); n++; } } catch (e) { /* not a web address: skipped */ } });
    }
    D.save();
    P.live();
    return n;
  };

  // what's set now, as a dice.json (with this computer's own details, on DiceOS)
  P.json = function (device) {
    const st = D.state, tv = st.tvsvc || {};
    const out = {
      dice: 1, name: st.name || '', look: st.look || 'auto', buddy: st.avatar || 'cubby', boot: st.boot || 'full',
      start: st.start === 'game' ? 'gaming' : st.start === 'home' ? 'home' : 'desktop', world: st.world || 'hills',
      looks: P.looks(st.looks), accent: st.accent || 'auto', text: st.text || 'normal', clock: st.clock || 'auto',
      units: (st.st && st.st.units) || (/^en-US$/i.test(navigator.language || '') ? 'f' : 'c'), sounds: st.ui !== false, nightlight: st.warm || 'off', motion: st.motion || 'full',
      ambient: { after: st.idle === undefined ? 10 : st.idle, show: st.amb || 'world' },
      deuce: { on: !(st.deuce && st.deuce.on === false), talk: !(st.deuce && st.deuce.talk === false) },
      tv: { live: tv.live || null, have: tv.have || [], tuner: tv.tuner || '' },
      desk: { snap: st.snap !== false, hotCorner: st.hotCorner !== false, homeIcon: st.deskIcons !== 'none' },
    };
    if (st.ha) out.homeassistant = st.ha;
    // your home screens (only what you've changed from the usual) and websites as apps
    const layout = {};
    if (Array.isArray(st.dock) && st.dock.length) layout.dock = st.dock.slice();
    if (Array.isArray(st.homeApps) && st.homeApps.length) layout.tv = st.homeApps.slice();
    if (Array.isArray(st.startPins) && st.startPins.length) layout.menu = st.startPins.slice();
    if (Array.isArray(st.widgets)) layout.widgets = st.widgets.map(widget).filter(Boolean);
    if (Object.keys(layout).length) out.layout = layout;
    const web = st.myapps && Array.isArray(st.myapps.web) ? st.myapps.web : [];
    if (web.length) out.webapps = web.map((a) => ({ name: a.name, url: a.url }));
    if (device && device.ok) {
      out.computer = device.computer; out.timezone = device.timezone; out.keyboard = device.keyboard; out.ssh = !!device.ssh; out.updates = !!device.updates;
      if (device.wifi_country) out.wifi = { country: device.wifi_country };
    }
    return out;
  };
  // save one: on DiceOS into Downloads, in a browser as a download
  P.save = async function (device) {
    const text = JSON.stringify(P.json(device), null, 2) + '\n';
    if (D.sys && !D.sys.info.emulated) {
      const r = await D.sys.upload('~/Downloads/dice.json', new Blob([text], { type: 'application/json' }), { dirs: 1 });
      return { ok: r && r.ok !== false, where: 'Downloads' };
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = 'dice.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return { ok: true, where: 'your downloads' };
  };
  // pick a dice.json and read it
  P.pick = () => new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = async () => {
      const f = i.files && i.files[0];
      if (!f) return resolve(null);
      try { const j = JSON.parse((await f.text()).replace(/^﻿/, '')); resolve(j && typeof j === 'object' && !Array.isArray(j) ? j : null); } catch (e) { resolve(null); }
    };
    i.click();
  });

  // put the ones that show straight away on the screen
  P.live = function () {
    const html = document.documentElement;
    html.dataset.motion = D.state.motion === 'less' ? 'less' : 'full';
    html.dataset.looks = P.looks(D.state.looks);
    html.style.fontSize = { large: '112.5%', larger: '125%' }[D.state.text] || '';
    if (D.S && D.S.setUi) D.S.setUi(D.state.ui);
    if (D.tools && D.tools.applyWarm) D.tools.applyWarm();
    if (D.state.accent && D.state.accent !== 'auto') html.style.setProperty('--c', D.state.accent);
    if (D.applyLook) D.applyLook(true);
    // DiceOS's start-up splash (before the desktop) follows Traced mode too
    const looks = P.looks(D.state.looks);
    if (D.sys && !D.sys.info.emulated && (D.sys.settings.looks || 'normal') !== looks && !D.serenePage) D.sys.saveSettings({ looks });
    D.emit('prefs');
  };
  // the accent: your colour if you picked one, otherwise the colour of what's picked
  D.tint = (c) => (isHex(D.state.accent) ? D.state.accent : c);

  // the clock, 12 or 24 hours, everywhere a time is shown
  const lts = Date.prototype.toLocaleTimeString;
  Date.prototype.toLocaleTimeString = function (loc, o) {
    const c = D.state && D.state.clock;
    if ((c === '24' || c === '12') && !(o && ('hour12' in o || 'hourCycle' in o))) o = Object.assign({}, o, c === '24' ? { hourCycle: 'h23' } : { hour12: true });
    return lts.call(this, loc, o);
  };
})();
