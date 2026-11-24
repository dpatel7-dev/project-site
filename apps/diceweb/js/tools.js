// Little things for every part of DiceOS and DiceWeb: Night light (a warmer
// screen in the evening), Do not disturb, the sleep timer, screenshots (on
// DiceOS), backups you can keep, Bluetooth (on DiceOS) and the sheet of
// keyboard shortcuts. The desktop, DiceTV and Settings all use these.
(function () {
  'use strict';
  const D = window.Dice, L = D.L, h = D.h, esc = D.esc;
  const T = D.tools = {};

  // ---- Night light ---------------------------------------------------------------------
  // A warm layer over everything, so the screen is kinder to your eyes at night.
  // 'off', 'night' (from sunset to sunrise) or 'on'.
  const warm = h('<div id="warm" aria-hidden="true"></div>');
  document.body.appendChild(warm);
  T.warmOn = () => { const m = D.state.warm || 'off'; return m === 'on' || (m === 'night' && L.clockNight(new Date())); };
  T.applyWarm = function () {
    const k = typeof D.state.warmth === 'number' ? D.state.warmth : 0.5;
    warm.style.opacity = T.warmOn() ? (0.1 + 0.3 * k).toFixed(3) : '0';
    D.emit('warm');
  };
  T.setWarm = (mode) => { D.set('warm', mode); T.applyWarm(); };
  setInterval(T.applyWarm, 60000);

  // ---- Do not disturb --------------------------------------------------------------------
  // Notifications still go in the list; they just don't pop up or chime. Things you
  // asked for yourself (a timer ringing) still come through.
  T.quiet = () => !!D.state.dnd;
  T.setQuiet = (on) => { D.set('dnd', !!on); D.emit('dnd'); };

  // ---- Sleep timer -------------------------------------------------------------------------
  // In 15, 30, 60 or 90 minutes, the music stops and the screen goes to sleep.
  const sl = { end: 0, t: 0, mins: 0 };
  T.setSleep = function (mins) {
    clearTimeout(sl.t); sl.end = 0; sl.mins = 0;
    if (mins > 0) {
      sl.mins = mins; sl.end = Date.now() + mins * 60000;
      sl.t = setTimeout(() => { sl.end = 0; sl.mins = 0; D.emit('sleeptimer'); D.sleep(); }, mins * 60000);
      D.toast({ icon: 'timer', c: '#a487dd', title: 'Sleep timer', text: 'Going to sleep in ' + mins + ' minutes.' });
    }
    D.emit('sleeptimer');
  };
  T.sleepLeft = () => (sl.end ? Math.max(1, Math.ceil((sl.end - Date.now()) / 60000)) : 0);
  T.sleepMins = () => sl.mins;
  setInterval(() => { if (sl.end) D.emit('sleeptimer'); }, 30000);

  // ---- Screenshots (DiceOS) ---------------------------------------------------------------
  T.canShoot = () => !!D.sys;
  T.screenshot = async function () {
    if (!D.sys) return;
    await new Promise((r) => setTimeout(r, 450)); // let menus close first, so they aren't in the picture
    const r = await D.sys.post('/api/screenshot', {});
    if (r && r.ok) { D.S.play('select'); D.toast({ icon: 'camera', c: '#7cc4ff', title: 'Screenshot saved', text: 'In Files, ' + String(r.path || '').replace(/^~\//, '') }); }
    else D.toast({ icon: 'camera', c: '#96969f', title: 'No screenshot', text: (r && r.error) || 'That didn\'t work.' });
  };

  // ---- Backups ---------------------------------------------------------------------------------
  // Everything this computer keeps (settings, notes, the disk, Axiom, SereneTab,
  // Dice Home) in one file you can keep somewhere safe. Your Dice Cloud code is
  // left out: it's a secret. Songs stay out too; they're your own files already.
  T.backupData = function () {
    const s = JSON.parse(JSON.stringify(D.state));
    delete s.fresh; delete s.cloud;
    return { kind: 'dice-backup', v: 1, from: D.brand, at: new Date().toISOString(), state: s };
  };
  T.backup = async function () {
    const name = 'dice-backup-' + L.dayKey(new Date()) + '.json';
    const blob = new Blob([JSON.stringify(T.backupData())], { type: 'application/json' });
    if (D.sys && !D.sys.info.emulated) {
      const r = await D.sys.upload('~/' + name, blob);
      if (r && r.ok !== false) return D.toast({ icon: 'box', c: '#2bc4b2', title: 'Backed up', text: 'Saved in your Home folder as ' + name + '.' });
      return D.toast({ icon: 'box', c: '#ff4d5e', title: 'Not backed up', text: (r && r.error) || '' });
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    D.toast({ icon: 'box', c: '#2bc4b2', title: 'Backed up', text: 'Look in your Downloads for ' + name + '.' });
  };
  T.readBackup = L.readBackup;
  T.restore = function () {
    const pick = h('<input type="file" accept=".json,application/json" hidden>');
    document.body.appendChild(pick);
    pick.onchange = async () => {
      const f = pick.files && pick.files[0];
      pick.remove();
      if (!f) return;
      const data = T.readBackup(await f.text());
      if (!data) return D.toast({ icon: 'box', c: '#ff4d5e', title: 'That isn\'t a Dice backup', text: 'Pick a file called dice-backup-….json.' });
      const when = new Date(data.at);
      const ok = await D.ask({ title: 'Put this backup back?', text: 'From ' + (isNaN(when) ? 'a while ago' : when.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })) + '. Everything here now is replaced by what\'s in it, then ' + D.brand + ' starts again.', buttons: [{ label: 'Put it back', value: true, go: true }, { label: 'Cancel', value: false }] });
      if (!ok) return;
      const cloud = D.state.cloud;
      Object.keys(D.state).forEach((k) => { delete D.state[k]; });
      Object.assign(D.state, data.state);
      if (cloud) D.state.cloud = cloud;
      D.save(true);
      location.reload();
    };
    pick.click();
  };

  // ---- Bluetooth (DiceOS) ---------------------------------------------------------------------
  // Controllers, headphones and speakers, through DiceOS's helper (bluetoothctl).
  T.bt = {
    list: () => D.sys.get('/api/bluetooth'),
    scan: () => D.sys.post('/api/bluetooth', { action: 'scan' }),
    act: (action, mac) => D.sys.post('/api/bluetooth', { action, mac }),
    power: (on) => D.sys.post('/api/bluetooth', { action: on ? 'on' : 'off' }),
    kind: (icon) => (/gaming|joystick/.test(icon || '') ? 'Controller' : /audio|headset|headphone/.test(icon || '') ? 'Headphones or speaker' : /keyboard/.test(icon || '') ? 'Keyboard' : /mouse/.test(icon || '') ? 'Mouse' : /phone/.test(icon || '') ? 'Phone' : 'Device'),
  };

  // ---- Keyboard shortcuts --------------------------------------------------------------------
  T.KEYS = [
    ['Everywhere', [['Ctrl + /', 'This list'], ['Q or Ctrl + 2', 'Quick settings'], ['M or Ctrl + 1', 'The menu, or all apps on the desktop'], ['/', 'Search'], ['Print Screen', 'Take a screenshot (DiceOS)']]],
    ['DiceTV', [['Arrow keys', 'Move around'], ['Enter or Space', 'Pick'], ['Esc or Backspace', 'Back'], ['X', 'More things to do'], ['[  ]', 'Previous and next tab']]],
    ['SereneTab', [['Ctrl + T', 'New tab'], ['Ctrl + W', 'Close the tab'], ['Ctrl + Shift + T', 'Open the last closed tab again'], ['Ctrl + L', 'Type an address'], ['Ctrl + H', 'History'], ['Alt + ← →', 'Back and forward']]],
    ['Terminal', [['Tab', 'Finish a name'], ['↑ ↓', 'Earlier commands'], ['Ctrl + C', 'Stop what\'s running']]],
  ];
  T.shortcuts = function () {
    D.ask({ title: 'Keyboard shortcuts', buttons: [{ label: 'Close', value: true, go: true }] });
    const box = D.$('#dialog .box');
    if (!box) return;
    box.classList.add('keysheet');
    const sheet = h('<div class="ksheet"></div>');
    T.KEYS.forEach(([title, rows]) => {
      if (title === 'Everywhere' || title === 'DiceTV' || D.app(title === 'SereneTab' ? 'browser' : 'terminal')) {
        sheet.appendChild(h('<section><h3>' + esc(title) + '</h3>' + rows.filter((r) => D.sys || !/DiceOS/.test(r[1])).map(([k, t]) => '<div><kbd>' + esc(k) + '</kbd><span>' + esc(t) + '</span></div>').join('') + '</section>'));
      }
    });
    box.insertBefore(sheet, box.querySelector('.actions'));
  };

  window.addEventListener('keydown', (e) => {
    const typing = e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.isContentEditable);
    if (e.key === 'PrintScreen' && D.sys) { e.preventDefault(); T.screenshot(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === '/' && !D.$('#dialog.open')) { e.preventDefault(); T.shortcuts(); return; }
    if (e.key === '?' && !typing && !e.ctrlKey && !e.metaKey && !D.$('#dialog.open')) { e.preventDefault(); T.shortcuts(); }
  });

  T.applyWarm();
})();
