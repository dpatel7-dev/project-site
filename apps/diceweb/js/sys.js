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
    .then(json).catch(() => ({ ok: false, error: 'Dice\'s helper isn\'t answering. Try again in a moment.' }));
  const Sys = D.sys = {
    info, settings: info.settings || {}, status: null,
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b),
    upload: (path, blob) => call('POST', '/api/file?path=' + encodeURIComponent(path), blob, true),
    blob: (path) => fetch('/api/file?path=' + encodeURIComponent(path), { headers: { 'X-Dice': info.token } }).then((r) => (r.ok ? r.blob() : Promise.reject(new Error('Couldn\'t open it')))),
    termUrl: (cols, rows) => 'ws://' + location.host + '/api/term?token=' + encodeURIComponent(info.token) + '&cols=' + cols + '&rows=' + rows,
    open: (url) => call('POST', '/api/open', { url }).then((r) => {
      if (r.ok) D.toast({ icon: 'link', c: '#7c9cff', title: 'Opening in the browser', text: 'Close it (×) to come back to Dice.' });
      else D.toast({ icon: 'link', c: '#96969f', title: 'Couldn\'t open it', text: r.error || '' });
      return r;
    }),
    saveSettings: (s) => { Object.assign(Sys.settings, s); return call('POST', '/api/settings', s); },
    power: (action) => {
      const words = { reboot: ['Restart the computer?', 'Everything closes and Dice starts again.', 'Restart'], shutdown: ['Shut down the computer?', 'On a Pi, wait for the green light to stop blinking before unplugging it.', 'Shut down'],
        'restart-desktop': ['Restart the desktop?', 'Dice reloads. The computer stays on.', 'Restart desktop'] }[action];
      return D.ask({ title: words[0], text: words[1], buttons: [{ label: words[2], value: true, go: true }, { label: 'Cancel', value: false }] })
        .then((ok) => { if (ok) { D.save(true); call('POST', '/api/power', { action }); } return ok; });
    },
  };
  // keep an eye on Wi-Fi, sound, temperature and so on
  function poll() {
    Sys.get('/api/status').then((s) => { if (s && s.version) { Sys.status = s; D.emit('sys', s); } });
  }
  poll();
  setInterval(poll, 5000);
})();
