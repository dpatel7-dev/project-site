// Inputs: DiceOS as the switch for everything plugged into the TV (through HDMI-CEC, the
// HDMI cable's own control line, like a KVM switch for the TV).
//
// The other things on the TV's HDMI inputs (a PlayStation, an Xbox, a cable box, an Apple TV)
// show up here. Pick one and the TV switches to it. While you're on it, the air mouse's buttons
// go on to that device through the cable (arrows, OK, Back, play and pause), and Home comes
// back to DiceOS. ("Switch to the PlayStation" to Deuce does the same.)
(function () {
  'use strict';
  const D = window.Dice, h = D.h, esc = D.esc, S = D.S;
  const I = D.inputs = { away: null };

  // what a device probably is, for its picture and for what Deuce hears
  const KINDS = [
    [/playstation|ps5|ps4|sony/i, 'PlayStation', '#2e6fd8', 'pad'], [/xbox|microsoft/i, 'Xbox', '#2f9e44', 'pad'], [/nintendo|switch/i, 'Nintendo Switch', '#e0453a', 'pad'],
    [/apple/i, 'Apple TV', '#56565e', 'tv'], [/roku/i, 'Roku', '#6c3fc0', 'tv'], [/fire|amazon/i, 'Fire TV', '#e08a1e', 'tv'], [/chromecast|google/i, 'Chromecast', '#3b82e0', 'tv'],
    [/tuner|cable|satellite|dvr|recorder|xfinity|optimum|fios|spectrum|directv|dish/i, 'Cable box', '#8a6d3b', 'box'], [/blu.?ray|dvd|playback/i, 'Player', '#7a7f8c', 'play'],
  ];
  const kindOf = (d) => { const s = (d.name || '') + ' ' + (d.vendor || '') + ' ' + (d.kind || ''); const k = KINDS.find((x) => x[0].test(s)); return k ? { label: k[1], c: k[2], icon: k[3] } : { label: 'HDMI device', c: '#5d6b8a', icon: 'tv' }; };
  const port = (pa) => { const n = parseInt(String(pa || '').split('.')[0], 10); return n > 0 ? n : 0; };
  // the things you watch, not the TV or a sound bar
  const watchable = (d) => d.la !== 0 && d.la !== 5 && d.la !== 15;

  I.list = async function () {
    if (!D.sys) return { ok: false, error: 'Inputs work on DiceOS, plugged into the TV.' };
    const r = await D.sys.get('/api/cec/devices');
    return r && r.ok ? { ok: true, devices: (r.devices || []).filter(watchable) } : { ok: false, error: (r && r.error) || 'The TV isn\'t answering over HDMI.' };
  };

  // switch the TV to a device (or a bare HDMI port), and pass the remote on to it
  I.go = async function (d) {
    const pa = d.pa || (d.port ? d.port + '.0.0.0' : '');
    if (!pa) return { ok: false };
    const r = await D.sys.post('/api/cec', { action: 'switch', pa });
    if (!r || r.ok === false) { D.toast({ icon: 'tv', c: '#ff4d5e', title: 'The TV didn\'t switch', text: (r && r.error) || 'Is HDMI-CEC on in the TV\'s settings? (Samsung calls it Anynet+.)' }); return r; }
    I.away = { la: d.la, name: d.name || 'HDMI ' + port(pa), pa };
    I.close(true);
    bar();
    S.play('select');
    return { ok: true };
  };
  I.back = function () {
    if (!I.away) return;
    I.away = null;
    if (D.sys) D.sys.post('/api/cec', { action: 'back' });
    bar();
    D.toast({ icon: 'die', c: '#4fc16b', title: 'Back on DiceOS', text: '' });
  };
  // "the playstation", "xbox", "hdmi 2": the device it means
  I.find = async function (said) {
    const L = await I.list();
    if (!L.ok) return L;
    const s = String(said.name || '').toLowerCase();
    let d = null;
    if (said.port) d = L.devices.find((x) => port(x.pa) === said.port) || { port: said.port, name: 'HDMI ' + said.port };
    else {
      const k = KINDS.find((x) => x[0].test(s));
      d = L.devices.find((x) => (x.name || '').toLowerCase().includes(s)) || (k && L.devices.find((x) => k[0].test((x.name || '') + ' ' + (x.vendor || '') + ' ' + (x.kind || ''))));
      if (!d && /computer|laptop|pc|mac/.test(s)) d = L.devices.find((x) => /recorder|playback/i.test(x.kind || ''));
    }
    return d ? { ok: true, device: d } : { ok: false, error: 'I can\'t see ' + (said.name || 'that') + ' on the TV. Is it on, with HDMI-CEC turned on?', devices: L.devices };
  };

  // ---- while you're on another input: the remote's buttons go to it --------------------------------
  const PASS = ['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'menu', 'play', 'pause', 'stop', 'next', 'prev', 'ff', 'rew', 'chup', 'chdown', 'd0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9'];
  const fire0 = D.input.fire;
  D.input.fire = function (a, src) {
    if (I.away && D.sys) {
      if (a === 'home' || a === 'quick') { I.back(); return; }
      if (PASS.includes(a) && !D.$('#dialog.open') && !(D.deuce && D.deuce.on)) { D.sys.post('/api/cec', { action: 'key', la: I.away.la, key: a }); return; }
    }
    return fire0.call(D.input, a, src);
  };
  let barEl = null;
  function bar() {
    if (!barEl) { barEl = h('<div id="awaybar" class="glass" hidden role="status"></div>'); document.body.appendChild(barEl); }
    barEl.hidden = !I.away;
    if (I.away) barEl.innerHTML = D.glyph('tv', 2) + '<span><b>' + esc(I.away.name) + '</b> is on the TV. The remote\'s buttons go to it; ' + D.btn('home') + ' comes back to DiceOS.</span>';
  }

  // ---- the Inputs panel --------------------------------------------------------------------------------
  let panel = null;
  I.isOpen = () => !!(panel && panel.classList.contains('on'));
  I.open = async function () {
    if (!panel) { panel = h('<div id="inputs" class="inputs" aria-label="Inputs"><div class="in-box glass"><h2>Inputs</h2><p class="muted">Everything plugged into the TV. Pick one and the TV switches to it; ' + D.btn('home') + ' comes back.</p><div class="in-grid" data-row></div><p class="in-foot muted"></p></div></div>'); document.body.appendChild(panel); panel.addEventListener('pointerdown', (e) => { if (e.target === panel) I.close(); }); }
    I.prev = D.nav.el;
    panel.classList.add('on', 'navtrap');
    S.play('open');
    const grid = panel.querySelector('.in-grid'), foot = panel.querySelector('.in-foot');
    grid.innerHTML = '<p class="muted">Asking the TV what\'s plugged in…</p>';
    const L = await I.list();
    if (!I.isOpen()) return;
    grid.replaceChildren();
    const devs = L.ok ? L.devices : [];
    const ports = new Set(devs.map((d) => port(d.pa)));
    const dice = h('<button class="in-tile here" data-nav data-key="in:dice" data-first style="--ic:#4b7bec">' + D.icon('die', null, 4) + '<b>DiceOS</b><small>You\'re here</small></button>');
    dice.onclick = () => I.close();
    grid.appendChild(dice);
    devs.forEach((d) => {
      const k = kindOf(d);
      const b = h('<button class="in-tile" data-nav data-key="in:' + d.la + '" style="--ic:' + k.c + '">' + D.glyph(k.icon, 4) + '<b>' + esc(d.name || k.label) + '</b><small>' + esc((port(d.pa) ? 'HDMI ' + port(d.pa) : k.label) + (d.power && d.power !== 'on' ? ', ' + d.power.replace(/^in transition.*/, 'waking up') : '')) + '</small></button>');
      b.onclick = () => I.go(d);
      grid.appendChild(b);
    });
    // the bare inputs too, for things that don't speak HDMI-CEC
    [1, 2, 3, 4].filter((n) => !ports.has(n)).forEach((n) => {
      const b = h('<button class="in-tile bare" data-nav data-key="in:p' + n + '" style="--ic:#3a3f4b">' + D.glyph('tv', 4) + '<b>HDMI ' + n + '</b><small>Whatever\'s on it</small></button>');
      b.onclick = () => I.go({ port: n, name: 'HDMI ' + n });
      grid.appendChild(b);
    });
    foot.textContent = L.ok ? (devs.length ? 'Something missing? Turn it on, and turn on HDMI-CEC in its settings (PlayStation: "Enable HDMI Device Link"; Xbox: "HDMI-CEC").' : 'Nothing else answered. Turn your other things on, with HDMI-CEC on in their settings; the HDMI numbers still work.') : L.error;
    D.nav.focus(dice);
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
