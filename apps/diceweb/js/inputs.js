// Inputs: DiceOS as a KVM switch for everything around it.
//
//   On a TV:  the other things on the TV's HDMI inputs (a PlayStation, an Xbox, a cable box)
//             show up through HDMI-CEC, the HDMI cable's own control line. Pick one and the TV
//             switches to it; the air mouse's buttons go on to it through the cable (arrows, OK,
//             Back, play and pause), and Home comes back to DiceOS.
//   On a PC:  each screen's other inputs (HDMI 2, DisplayPort, USB-C…) through DDC/CI, the
//             screen's own computer link (ddcutil). Pick one and the screen shows it; Esc (or
//             Home on a remote) brings it back to DiceOS. A PC with a USB HDMI-CEC adapter (like
//             Pulse-Eight's) can switch a TV too. To use this keyboard and mouse on the other
//             computer as well, there's Deskflow.
// Each input can have a name of your own ("Work laptop"), and Deuce knows them:
// "switch to the work laptop".
(function () {
  'use strict';
  const D = window.Dice, h = D.h, esc = D.esc, S = D.S;
  const I = D.inputs = { away: null };
  const DESKFLOW = 'org.deskflow.deskflow';

  // what a device probably is, for its picture and for what Deuce hears
  const KINDS = [
    [/playstation|ps5|ps4|sony/i, 'PlayStation', '#2e6fd8', 'pad'], [/xbox|microsoft/i, 'Xbox', '#2f9e44', 'pad'], [/nintendo|switch/i, 'Nintendo Switch', '#e0453a', 'pad'],
    [/apple/i, 'Apple TV', '#56565e', 'tv'], [/roku/i, 'Roku', '#6c3fc0', 'tv'], [/fire|amazon/i, 'Fire TV', '#e08a1e', 'tv'], [/chromecast|google/i, 'Chromecast', '#3b82e0', 'tv'],
    [/tuner|cable|satellite|dvr|recorder|xfinity|optimum|fios|spectrum|directv|dish/i, 'Cable box', '#8a6d3b', 'box'], [/blu.?ray|dvd|playback/i, 'Player', '#7a7f8c', 'play'],
    [/laptop|macbook|notebook|computer|pc\b|desktop|work/i, 'Computer', '#5b6ee0', 'desktop'],
  ];
  const kindOf = (s) => { const k = KINDS.find((x) => x[0].test(s)); return k ? { label: k[1], c: k[2], icon: k[3] } : { label: 'HDMI device', c: '#5d6b8a', icon: 'tv' }; };
  const port = (pa) => { const n = parseInt(String(pa || '').split('.')[0], 10); return n > 0 ? n : 0; };
  // the things you watch, not the TV or a sound bar
  const watchable = (d) => d.la !== 0 && d.la !== 5 && d.la !== 15;
  // names of your own, for any input
  const names = () => (D.state.inputNames && typeof D.state.inputNames === 'object' ? D.state.inputNames : (D.state.inputNames = {}));
  const keyOf = (t) => (t.kind === 'screen' ? 'scr:' + t.n + ':' + t.code : 'cec:' + (t.pa || (t.port ? t.port + '.0.0.0' : '')));
  const nameOf = (t, fallback) => names()[keyOf(t)] || fallback;

  // ---- what's there --------------------------------------------------------------------------------
  // { ok, cec: { ok, devices }, screens: [{ n, name, inputs: [{ code, name, here, on }] }] }
  I.list = async function (fresh) {
    if (!D.sys) return { ok: false, error: 'Inputs work on DiceOS, plugged into a TV or a screen.', cec: { ok: false, devices: [] }, screens: [] };
    let r = await D.sys.get('/api/kvm' + (fresh ? '?fresh=1' : ''));
    if (!r || r.ok === false || !r.cec) { // (an older DiceOS: HDMI-CEC only)
      const c = await D.sys.get('/api/cec/devices');
      r = { ok: true, cec: c || { ok: false }, monitors: { ok: false, screens: [] } };
    }
    const cec = r.cec && r.cec.ok ? { ok: true, devices: (r.cec.devices || []).filter(watchable) } : { ok: false, devices: [], error: (r.cec && r.cec.error) || '' };
    const mon = r.monitors || {};
    const screens = mon.ok ? (mon.screens || []).filter((s) => (s.inputs || []).length > 1) : [];
    return { ok: cec.ok || screens.length > 0, cec, screens, monError: mon.ok ? ((mon.screens || []).length ? '' : 'No screen answered over DDC/CI.') : mon.error || '' };
  };

  // ---- switching -------------------------------------------------------------------------------------
  // a TV's HDMI thing (or a bare HDMI port), with the remote passed on to it
  I.go = async function (d) {
    if (d.kind === 'screen') return I.screen(d);
    const pa = d.pa || (d.port ? d.port + '.0.0.0' : '');
    if (!pa) return { ok: false };
    const r = await D.sys.post('/api/cec', { action: 'switch', pa });
    if (!r || r.ok === false) { D.toast({ icon: 'tv', c: '#ff4d5e', title: 'The TV didn\'t switch', text: (r && r.error) || 'Is HDMI-CEC on in the TV\'s settings? (Samsung calls it Anynet+.)' }); return r; }
    I.away = { kind: 'cec', la: d.la, name: nameOf({ pa }, d.name || 'HDMI ' + port(pa)), pa };
    I.close(true); bar(); S.play('select');
    return { ok: true };
  };
  // a screen's other input
  I.screen = async function (t) {
    const r = await D.sys.post('/api/kvm', { action: 'monitor', n: t.n, code: t.code });
    if (!r || r.ok === false) { D.toast({ icon: 'desktop', c: '#ff4d5e', title: 'The screen didn\'t switch', text: (r && r.error) || 'Is DDC/CI on in the screen\'s own menu?' }); return r; }
    I.away = { kind: 'screen', n: t.n, code: t.code, name: nameOf(t, t.name), screen: t.screen };
    I.close(true); bar(); S.play('select');
    return { ok: true };
  };
  I.back = function () {
    if (!I.away) return;
    I.away = null;
    if (D.sys) D.sys.post('/api/kvm', { action: 'back' }).then((r) => { if (!r || r.ok === false) D.sys.post('/api/cec', { action: 'back' }); });
    bar();
    D.toast({ icon: 'die', c: '#4fc16b', title: 'Back on DiceOS', text: '' });
  };
  // what Deuce heard ("the playstation", "xbox", "hdmi 2", "my work laptop"): the input it means
  I.find = async function (said) {
    const L = await I.list();
    if (!L.ok) return { ok: false, error: L.cec.error || L.monError || 'Nothing else is plugged in that DiceOS can switch to.' };
    const s = String(said.name || '').toLowerCase().replace(/^(my|the) /, '');
    const all = L.cec.devices.map((d) => Object.assign({ label: nameOf(d, d.name || '') }, d))
      .concat(...L.screens.map((sc) => sc.inputs.filter((x) => !x.here).map((x) => ({ kind: 'screen', n: sc.n, code: x.code, name: x.name, screen: sc.name, label: nameOf({ kind: 'screen', n: sc.n, code: x.code }, x.name) }))));
    let d = all.find((x) => x.label.toLowerCase() === s) || all.find((x) => s && x.label && x.label.toLowerCase().includes(s)) || all.find((x) => s && x.label.length > 2 && s.includes(x.label.toLowerCase()));
    if (!d && said.port) d = all.find((x) => x.kind === 'screen' && new RegExp('hdmi ' + said.port + '$', 'i').test(x.name)) || L.cec.devices.find((x) => port(x.pa) === said.port) || (L.cec.ok ? { port: said.port, name: 'HDMI ' + said.port } : null);
    if (!d) {
      const k = KINDS.find((x) => x[0].test(s));
      d = k && L.cec.devices.find((x) => k[0].test((x.name || '') + ' ' + (x.vendor || '') + ' ' + (x.kind || '')));
      if (!d && /usb.?c|type.?c/.test(s)) d = all.find((x) => /usb-c/i.test(x.name));
      if (!d && /display ?port|\bdp\b/.test(s)) d = all.find((x) => /displayport/i.test(x.name));
      if (!d && /computer|laptop|pc|mac/.test(s)) d = L.cec.devices.find((x) => /recorder|playback/i.test(x.kind || '')) || (all.length === 1 ? all[0] : null);
    }
    return d ? { ok: true, device: d } : { ok: false, error: 'I can\'t see ' + (said.name || 'that') + '. Give your inputs names in Inputs and I\'ll know them.', devices: all };
  };

  // ---- while you're on another input ----------------------------------------------------------------
  // on a TV the remote's buttons go to the device; on a screen, Esc or Home comes back
  const PASS = ['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'menu', 'play', 'pause', 'stop', 'next', 'prev', 'ff', 'rew', 'chup', 'chdown', 'd0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9'];
  const fire0 = D.input.fire;
  D.input.fire = function (a, src) {
    if (I.away && D.sys) {
      if (a === 'home' || a === 'quick') { I.back(); return; }
      if (I.away.kind === 'screen' && (a === 'b' || a === 'menu')) { I.back(); return; }
      if (I.away.kind === 'cec' && PASS.includes(a) && !D.$('#dialog.open') && !(D.deuce && D.deuce.on)) { D.sys.post('/api/cec', { action: 'key', la: I.away.la, key: a }); return; }
    }
    return fire0.call(D.input, a, src);
  };
  let barEl = null;
  function bar() {
    if (!barEl) { barEl = h('<div id="awaybar" class="glass" hidden role="status"></div>'); document.body.appendChild(barEl); }
    barEl.hidden = !I.away;
    if (!I.away) return;
    barEl.innerHTML = I.away.kind === 'screen'
      ? D.glyph('desktop', 2) + '<span>The screen is showing <b>' + esc(I.away.name) + '</b>. ' + D.btn('b') + ' or ' + D.btn('home') + ' brings DiceOS back.</span>'
      : D.glyph('tv', 2) + '<span><b>' + esc(I.away.name) + '</b> is on the TV. The remote\'s buttons go to it; ' + D.btn('home') + ' comes back to DiceOS.</span>';
  }

  // ---- the Inputs panel --------------------------------------------------------------------------------
  let panel = null;
  I.isOpen = () => !!(panel && panel.classList.contains('on'));
  function tile(t, label, sub, k, run, here) {
    const b = h('<button class="in-tile' + (t.bare ? ' bare' : '') + (here ? ' here' : '') + '" data-nav data-key="' + esc(t.key) + '" data-a="' + (here ? 'Stay' : 'Switch') + '"' + (here ? '' : ' data-x="Name it"') + ' style="--ic:' + k.c + '">' + (here ? D.icon('die', null, 4) : D.glyph(k.icon, 4)) + '<b></b><small></small></button>');
    b.querySelector('b').textContent = label;
    b.querySelector('small').textContent = sub;
    b.onclick = run;
    if (!here) b._x = () => rename(t, label);
    return b;
  }
  async function rename(t, label) {
    const r = await D.ask({ title: 'Name this input', text: 'What\'s on it? Deuce knows the name too: "switch to the ' + (label.length < 18 ? label.toLowerCase() : 'work laptop') + '".', input: { label: 'Name', value: names()[keyOf(t)] || '', placeholder: 'Work laptop' }, buttons: [{ label: 'Save', value: true, go: true }, { label: 'Use its own name', value: 'clear' }, { label: 'Cancel', value: false }] });
    if (!r) return;
    if (r.ok === 'clear' || (r.ok === true && !r.value.trim())) delete names()[keyOf(t)];
    else if (r.ok === true) names()[keyOf(t)] = r.value.trim().slice(0, 30);
    else return;
    D.save(); I.open(true);
  }
  I.open = async function (again) {
    if (!panel) { panel = h('<div id="inputs" class="inputs" aria-label="Inputs"><div class="in-box glass"><h2>Inputs</h2><p class="muted in-lead"></p><div class="in-body"></div><p class="in-foot muted"></p></div></div>'); document.body.appendChild(panel); panel.addEventListener('pointerdown', (e) => { if (e.target === panel) I.close(); }); }
    if (!I.isOpen()) { I.prev = D.nav.el; S.play('open'); }
    panel.classList.add('on', 'navtrap');
    const body = panel.querySelector('.in-body'), foot = panel.querySelector('.in-foot'), lead = panel.querySelector('.in-lead');
    lead.innerHTML = 'Everything DiceOS can switch to. Pick one to show it; ' + D.btn('home') + ' comes back. ' + D.btn('x') + ' gives one a name. ';
    if (I.guide) { const how = h('<button class="b small in-how" data-nav data-key="in:how">' + D.glyph('help', 2) + 'Set it up, step by step</button>'); how.onclick = () => I.guide(); lead.appendChild(how); }
    if (!again) body.innerHTML = '<p class="muted">Asking what\'s plugged in…</p>';
    const L = await I.list(again === 'fresh');
    if (!I.isOpen()) return;
    body.replaceChildren();
    const grid = (title) => { const s = h('<section class="in-sec">' + (title ? '<h3></h3>' : '') + '<div class="in-grid" data-row></div></section>'); if (title) s.querySelector('h3').textContent = title; body.appendChild(s); return s.querySelector('.in-grid'); };
    let first = null;
    // the TV, over HDMI-CEC
    if (L.cec.ok) {
      const g = grid(L.screens.length ? 'On the TV' : '');
      first = tile({ key: 'in:dice' }, 'DiceOS', 'You\'re here', { c: '#4b7bec' }, () => I.close(), true);
      g.appendChild(first);
      const ports = new Set(L.cec.devices.map((d) => port(d.pa)));
      L.cec.devices.forEach((d) => {
        const k = kindOf((d.name || '') + ' ' + (d.vendor || '') + ' ' + (d.kind || '') + ' ' + (names()[keyOf(d)] || ''));
        const sub = (port(d.pa) ? 'HDMI ' + port(d.pa) : k.label) + (d.power && d.power !== 'on' ? ', ' + d.power.replace(/^in transition.*/, 'waking up') : '');
        g.appendChild(tile(Object.assign({ key: 'in:' + d.la }, d), nameOf(d, d.name || k.label), names()[keyOf(d)] ? (d.name || k.label) + ', ' + sub : sub, k, () => I.go(d)));
      });
      // the bare inputs too, for things that don't speak HDMI-CEC
      [1, 2, 3, 4].filter((n) => !ports.has(n)).forEach((n) => {
        const t = { key: 'in:p' + n, port: n, bare: true }, own = names()[keyOf(t)];
        g.appendChild(tile(t, own || 'HDMI ' + n, own ? 'HDMI ' + n : 'Whatever\'s on it', own ? kindOf(own) : { c: '#3a3f4b', icon: 'tv' }, () => I.go({ port: n, name: own || 'HDMI ' + n })));
      });
    }
    // a PC's screens, over DDC/CI
    L.screens.forEach((sc) => {
      const g = grid(sc.name + (L.screens.length > 1 ? ' (screen ' + sc.n + ')' : ''));
      sc.inputs.forEach((x) => {
        const t = { kind: 'screen', n: sc.n, code: x.code, name: x.name, screen: sc.name, key: 'in:s' + sc.n + ':' + x.code }, own = names()[keyOf(t)];
        if (x.here) { const b = tile(t, 'DiceOS', x.name + ', you\'re here', { c: '#4b7bec' }, () => I.close(), true); g.appendChild(b); if (!first) first = b; return; }
        const k = own ? kindOf(own) : { c: /usb-c/i.test(x.name) ? '#7a5bd6' : /displayport/i.test(x.name) ? '#2f8f9e' : '#5b6ee0', icon: 'desktop' };
        g.appendChild(tile(t, own || x.name, own ? x.name : 'Its other input', k, () => I.screen(t)));
      });
    });
    // this keyboard and mouse on the other computer too (Deskflow), on a PC
    if (L.screens.length || !L.cec.ok) {
      const has = D.myApps && D.myApps.list().some((a) => a.id === 'fp:' + DESKFLOW);
      const row = h('<div class="in-kb"><div><b>This keyboard and mouse on the other computer too</b><span class="muted">Deskflow shares them over your network: move the pointer off the edge of the screen and it carries on there. It goes on both computers (deskflow.org has it for Windows and Macs).</span></div><button class="b small" data-nav data-key="in:kb">' + D.glyph(has ? 'keys' : 'box', 2) + (has ? 'Open Deskflow' : 'Get Deskflow') + '</button></div>');
      row.querySelector('button').onclick = async () => {
        if (has) { I.close(); D.sys.post('/api/apps', { action: 'launch', id: DESKFLOW }); return; }
        const j = await D.sys.post('/api/apps', { action: 'install', id: DESKFLOW });
        D.toast(j && j.ok !== false ? { icon: 'box', c: '#4fc16b', title: 'Getting Deskflow', text: 'It\'s in Your apps in a minute or two.' } : { icon: 'box', c: '#ff4d5e', title: 'Couldn\'t get Deskflow', text: (j && j.error) || '' });
      };
      body.appendChild(row);
    }
    if (!L.ok) body.prepend(h('<p class="in-none">' + esc(D.sys ? 'Nothing else answered. On a TV, turn on HDMI-CEC in its settings (Samsung calls it Anynet+) and in each device\'s. On a PC, turn on DDC/CI in the screen\'s own menu; a PC can switch a TV too, with a USB HDMI-CEC adapter.' : 'Inputs work on DiceOS.') + '</p>'));
    const fresh = h('<button class="b small" data-nav data-key="in:fresh">' + D.glyph('restart', 2) + 'Look again</button>');
    fresh.onclick = () => I.open('fresh');
    foot.replaceChildren(fresh, document.createTextNode(L.cec.ok ? ' Something missing? Turn it on, with HDMI-CEC on in its settings (PlayStation: "Enable HDMI Device Link"; Xbox: "HDMI-CEC").' : L.screens.length ? ' A screen that doesn\'t come back by itself: press its own input button once.' : ''));
    if (!first) first = body.querySelector('[data-nav]') || fresh;
    if (!again) D.nav.focus(first);
  };
  I.close = function (quiet) {
    if (!I.isOpen()) return;
    panel.classList.remove('on', 'navtrap');
    if (!quiet) S.play('close');
    if (I.prev && I.prev.isConnected) D.nav.focus(I.prev, { scroll: false });
  };
  const fire1 = D.input.fire;
  D.input.fire = function (a, src) {
    if (I.isOpen() && !D.$('#dialog.open') && (a === 'b' || a === 'home')) { I.close(); return; }
    return fire1.call(D.input, a, src);
  };
})();
