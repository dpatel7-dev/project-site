// System mode: when DiceWeb runs on a Raspberry Pi or a PC as Dice, the computer's helper
// (diced) puts a secret in the page (window.DICE_SYS). Then the Terminal is
// real, Files shows real files, and Settings changes real Wi-Fi, sound,
// brightness and power. Anywhere else, Dice.sys is null and DiceWeb carries
// on as a browser console.
(function () {
  'use strict';
  const D = window.Dice, info = window.DICE_SYS;
  D.sys = null;
  if (!info || !info.token) return;
  document.documentElement.classList.add('on-pi');
  const json = (r) => (r.headers.get('content-type') || '').includes('json') ? r.json() : r;
  const call = (method, path, body, raw) => fetch(path, { method, headers: Object.assign({ 'X-Dice': info.token }, raw ? {} : { 'Content-Type': 'application/json' }), body: raw ? body : body === undefined ? undefined : JSON.stringify(body) })
    .then(json).catch(() => ({ ok: false, error: 'DiceOS\'s helper isn\'t answering. Try again in a moment.' }));
  const Sys = D.sys = {
    info, settings: info.settings || {}, status: null,
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b),
    upload: (path, blob, more) => call('POST', '/api/file?path=' + encodeURIComponent(path) + (more ? '&' + new URLSearchParams(more).toString() : ''), blob, true),
    blob: (path) => fetch('/api/file?path=' + encodeURIComponent(path), { headers: { 'X-Dice': info.token } }).then((r) => (r.ok ? r.blob() : Promise.reject(new Error('Couldn\'t open it')))),
    termUrl: (cols, rows) => 'ws://' + location.host + '/api/term?token=' + encodeURIComponent(info.token) + '&cols=' + cols + '&rows=' + rows,
    open: (url, o) => call('POST', '/api/open', { url, app: !!(o && o.app), full: !!(o && o.full), name: (o && o.name) || '' }).then((r) => {
      if (r.ok) D.toast({ icon: o && o.full ? 'tv' : 'link', c: '#7c9cff', title: o && o.name ? 'Opening ' + o.name : 'Opening in the browser', text: 'Home on the remote (or Super + Esc) comes back to DiceOS.' });
      else D.toast({ icon: 'link', c: '#96969f', title: 'Couldn\'t open it', text: r.error || '' });
      return r;
    }),
    saveSettings: (s) => { Object.assign(Sys.settings, s); return call('POST', '/api/settings', s); },
    power: (action) => {
      if (action === 'standby') return Promise.resolve(D.standby());
      // a full shut down can't be undone with the remote (a Pi turns back on with its own button, or
      // by unplugging it): so Turn off (standby) comes first
      if (action === 'shutdown') {
        return D.ask({ title: 'Turn off, or shut down completely?', text: 'Turn off is like a TV\'s off: the screen and the TV go off, and the remote\'s power button (or turning the TV on) brings DiceOS back in a second. After shutting down completely, it only comes back with the power button on the Raspberry Pi, or by unplugging it and plugging it back in.',
          buttons: [{ label: 'Turn off', value: 'standby', go: true }, { label: 'Shut down completely', value: 'shutdown', danger: true }, { label: 'Cancel', value: null }] })
          .then((v) => { if (v === 'standby') D.standby(); if (v === 'shutdown') { D.save(true); call('POST', '/api/power', { action }); } return !!v; });
      }
      const words = { reboot: ['Restart the computer?', 'Everything closes and DiceOS starts again.', 'Restart'],
        'restart-desktop': ['Restart the desktop?', 'DiceOS reloads. The computer stays on.', 'Restart desktop'] }[action];
      return D.ask({ title: words[0], text: words[1], buttons: [{ label: words[2], value: true, go: true }, { label: 'Cancel', value: false }] })
        .then((ok) => { if (ok) { D.save(true); call('POST', '/api/power', { action }); } return ok; });
    },
  };
  // keep an eye on Wi-Fi, sound, temperature and so on
  function poll() {
    Sys.get('/api/status').then((s) => {
      if (!s || !s.version) return;
      Sys.status = s; D.emit('sys', s);
      // DiceOS was updated underneath this screen: pick the new one up (when nothing's being typed)
      const cmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
      const newer = cmp(s.version, CATALOG.version) > 0;
      if (newer && !Sys.reloading && !(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) {
        Sys.reloading = true;
        D.save(true);
        D.toast({ icon: 'restart', c: '#4fc16b', title: 'DiceOS ' + s.version + ' is in', text: 'Starting the new one…' });
        setTimeout(() => location.reload(), 2500);
      }
    });
  }
  poll();
  setInterval(poll, 5000);
})();
