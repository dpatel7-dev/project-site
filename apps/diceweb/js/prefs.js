// Your preferences: the same ones a dice.json carries. They come in from a dice.json (made on the
// website before installing, or used later in Settings, This computer), and go back out as a
// dice.json to keep, or to set up another computer the same way. Passwords never go in one made
// here: they stay on the computer they belong to.
//
//   name, look (auto/day/night), buddy, boot (full/quick/off), start (desktop/gaming/home), world,
//   homeassistant, looks (normal/heaven), accent (auto or #rrggbb), text (normal/large/larger),
//   clock (auto/12/24), units (f/c), sounds, nightlight (off/night/on), motion (full/less),
//   ambient {after: minutes, show}, deuce {on, talk}, tv {live, have, tuner}, desk {snap, hotCorner, homeIcon}
(function () {
  'use strict';
  const D = window.Dice;
  const P = D.prefs = {};
  const isHex = (c) => /^#[0-9a-f]{6}$/i.test(String(c || ''));
  P.ACCENTS = ['#ff707a', '#f5a623', '#f5c431', '#8fd16a', '#2bc4b2', '#3a9be8', '#7c9cff', '#d39cf5', '#ff7ac8'];

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
    if (['normal', 'heaven'].includes(s.looks)) put('looks', s.looks);
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
      looks: st.looks === 'heaven' ? 'heaven' : 'normal', accent: st.accent || 'auto', text: st.text || 'normal', clock: st.clock || 'auto',
      units: (st.st && st.st.units) || (/^en-US$/i.test(navigator.language || '') ? 'f' : 'c'), sounds: st.ui !== false, nightlight: st.warm || 'off', motion: st.motion || 'full',
      ambient: { after: st.idle === undefined ? 10 : st.idle, show: st.amb || 'world' },
      deuce: { on: !(st.deuce && st.deuce.on === false), talk: !(st.deuce && st.deuce.talk === false) },
      tv: { live: tv.live || null, have: tv.have || [], tuner: tv.tuner || '' },
      desk: { snap: st.snap !== false, hotCorner: st.hotCorner !== false, homeIcon: st.deskIcons !== 'none' },
    };
    if (st.ha) out.homeassistant = st.ha;
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
    html.dataset.looks = D.state.looks === 'heaven' ? 'heaven' : 'normal';
    html.style.fontSize = { large: '112.5%', larger: '125%' }[D.state.text] || '';
    if (D.S && D.S.setUi) D.S.setUi(D.state.ui);
    if (D.tools && D.tools.applyWarm) D.tools.applyWarm();
    if (D.state.accent && D.state.accent !== 'auto') html.style.setProperty('--c', D.state.accent);
    if (D.applyLook) D.applyLook(true);
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
