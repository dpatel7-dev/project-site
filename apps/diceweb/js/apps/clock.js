// Clock: the time here and in other cities, alarms that wake the TV, a timer and a stopwatch.
(function () {
  'use strict';
  const D = window.Dice, h = D.h, esc = D.esc;
  const CITIES = [['London', 'Europe/London'], ['Paris', 'Europe/Paris'], ['Berlin', 'Europe/Berlin'], ['Cairo', 'Africa/Cairo'], ['Johannesburg', 'Africa/Johannesburg'],
    ['Dubai', 'Asia/Dubai'], ['Mumbai', 'Asia/Kolkata'], ['Singapore', 'Asia/Singapore'], ['Hong Kong', 'Asia/Hong_Kong'], ['Seoul', 'Asia/Seoul'], ['Tokyo', 'Asia/Tokyo'],
    ['Sydney', 'Australia/Sydney'], ['Auckland', 'Pacific/Auckland'], ['Honolulu', 'Pacific/Honolulu'], ['Los Angeles', 'America/Los_Angeles'], ['Denver', 'America/Denver'],
    ['Chicago', 'America/Chicago'], ['New York', 'America/New_York'], ['Toronto', 'America/Toronto'], ['Mexico City', 'America/Mexico_City'], ['São Paulo', 'America/Sao_Paulo']];
  const two = (n) => String(n).padStart(2, '0');
  const hms = (ms, tenths) => { const s = Math.max(0, ms) / 1000, hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60); return (hh ? hh + ':' + two(mm) : mm) + ':' + two(ss) + (tenths ? '.' + Math.floor((s * 10) % 10) : ''); };
  // a timer keeps going when the window closes, so it lives out here
  const T = D.timer = D.timer || { end: 0, left: 0, total: 0, running: false };
  setInterval(() => {
    if (T.running && Date.now() >= T.end) {
      T.running = false; T.left = 0;
      D.S.play('wake'); setTimeout(() => D.S.play('wake'), 700);
      D.toast({ icon: 'bell', c: '#2f9e8f', title: 'Time\'s up', text: 'Your ' + hms(T.total) + ' timer has finished.' });
      D.emit('timer');
    }
  }, 250);

  // ---- alarms: they wake DiceOS (and the TV, through the HDMI cable) and play something ----
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WAKE = [['chime', 'A chime'], ['radio', 'Dice Radio'], ['fire', 'Fireplace and radio']];
  const alarms = () => (Array.isArray(D.state.alarms) ? D.state.alarms : (D.state.alarms = []));
  const t12 = (t) => { const [hh, mm] = t.split(':').map(Number); return (hh % 12 || 12) + ':' + two(mm) + ' ' + (hh < 12 ? 'am' : 'pm'); };
  const daysText = (a) => (!a.days || !a.days.length ? 'Once' : a.days.length === 7 ? 'Every day' : a.days.join() === '1,2,3,4,5' ? 'Weekdays' : a.days.join() === '0,6' ? 'Weekends' : a.days.map((d) => DAYS[d]).join(', '));
  // the next time it rings, for "in 7 hours"
  function nextRing(a, from) {
    const [hh, mm] = a.time.split(':').map(Number), now = from || new Date();
    for (let i = 0; i < 8; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hh, mm);
      if (d > now && (!a.days || !a.days.length || a.days.includes(d.getDay()))) return d;
    }
    return null;
  }
  D.alarm = { list: alarms, next: nextRing, t12, daysText };
  let ringing = null, chimeT = 0;
  function ring(a) {
    if (ringing) return;
    ringing = a;
    if (D.ambient && D.ambient.on) D.ambient.exit();
    if (D.asleep) D.wake();
    // the TV comes on and switches to DiceOS
    if (D.sys && D.remote && D.remote.cec && D.remote.cec.available) { D.sys.post('/api/remote', { cmd: 'tv-on' }); D.sys.post('/api/remote', { cmd: 'active' }); }
    const how = a.wake || 'radio';
    if (how === 'chime') { const go = () => { D.S.play('wake'); chimeT = setTimeout(go, 1800); }; go(); }
    else { if (how === 'fire' && D.app('channels')) D.launch('channels', { arg: 'fire', swap: true }); if (!(D.M.now && D.M.now.playing)) D.M.play('radio', 0); }
    D.ask({ title: (a.label || 'Alarm') + ', ' + t12(a.time), text: new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) + '. Good morning!',
      buttons: [{ label: 'Snooze 9 minutes', value: 'snooze', go: true }, { label: 'Stop', value: 'stop' }], cancel: 'stop' }).then((v) => {
      clearTimeout(chimeT); ringing = null;
      if (v === 'snooze') { a.snooze = Date.now() + 9 * 60000; D.toast({ icon: 'bell', c: '#2f9e8f', title: 'Snoozing', text: 'Again at ' + new Date(a.snooze).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '.' }); }
      else { delete a.snooze; if (how === 'chime') D.S.play('select'); }
      D.save(); D.emit('alarms');
    });
  }
  setInterval(() => {
    const now = new Date(), key = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate(), hm = two(now.getHours()) + ':' + two(now.getMinutes());
    alarms().forEach((a) => {
      if (a.snooze && Date.now() >= a.snooze) { delete a.snooze; D.save(); return ring(a); }
      if (!a.on || a.time !== hm || a.rang === key + hm) return;
      if (a.days && a.days.length && !a.days.includes(now.getDay())) return;
      a.rang = key + hm;
      if (!a.days || !a.days.length) a.on = false; // a one-off alarm turns itself off
      D.save(); D.emit('alarms');
      ring(a);
    });
  }, 5000);

  D.register({ id: 'clock', mount(root, ctx) {
    root.classList.add('clk');
    root.innerHTML = '<nav class="clk-tabs" role="tablist"><button role="tab" data-nav data-key="clk:clock" data-t="clock">Clock</button><button role="tab" data-nav data-key="clk:alarm" data-t="alarm">Alarms</button><button role="tab" data-nav data-key="clk:timer" data-t="timer">Timer</button><button role="tab" data-nav data-key="clk:watch" data-t="watch">Stopwatch</button></nav><div class="clk-body"></div>';
    const body = root.querySelector('.clk-body');
    let tab = ctx && ctx.arg === 'alarm' ? 'alarm' : 'clock', sw = D.stopwatch = D.stopwatch || { start: 0, acc: 0, running: false, laps: [] }, raf = 0;
    const cities = () => (D.state.cities = D.state.cities || []);
    function render() {
      root.querySelectorAll('.clk-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.t === tab)));
      if (tab === 'clock') {
        body.innerHTML = '<div class="clk-big"><output class="clk-time"></output><span class="clk-date"></span></div><div class="clk-cities"></div><div class="clk-addrow"><select data-nav data-key="clk:city" aria-label="Add a city"><option value="">Add a city…</option>' +
          CITIES.filter(([, z]) => !cities().includes(z)).map(([n, z]) => '<option value="' + z + '">' + esc(n) + '</option>').join('') + '</select></div>';
        body.querySelector('select').onchange = (e) => { if (e.target.value) { cities().push(e.target.value); D.save(); render(); } };
      } else if (tab === 'alarm') {
        renderAlarms();
        return;
      } else if (tab === 'timer') {
        body.innerHTML = '<div class="clk-big"><output class="clk-time"></output><span class="clk-date"></span></div><div class="clk-presets">' +
          [1, 3, 5, 10, 15, 25, 30, 60].map((m) => '<button class="b small" data-nav data-key="clk:p' + m + '" data-m="' + m + '">' + (m < 60 ? m + ' min' : '1 hour') + '</button>').join('') +
          '</div><div class="clk-btns"><button class="b go" data-nav data-key="clk:go"></button><button class="b" data-nav data-key="clk:reset">Reset</button></div>';
        body.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { T.total = T.left = +b.dataset.m * 60000; T.running = true; T.end = Date.now() + T.left; D.S.play('select'); tick(); } ; });
        body.querySelector('[data-key="clk:go"]').onclick = () => { if (!T.total) return; if (T.running) { T.left = T.end - Date.now(); T.running = false; } else { if (!T.left) T.left = T.total; T.end = Date.now() + T.left; T.running = true; } tick(); };
        body.querySelector('[data-key="clk:reset"]').onclick = () => { T.running = false; T.left = T.total; tick(); };
      } else {
        body.innerHTML = '<div class="clk-big"><output class="clk-time"></output></div><div class="clk-btns"><button class="b go" data-nav data-key="clk:sw"></button><button class="b" data-nav data-key="clk:lap"></button></div><ol class="clk-laps"></ol>';
        body.querySelector('[data-key="clk:sw"]').onclick = () => { if (sw.running) { sw.acc += Date.now() - sw.start; sw.running = false; } else { sw.start = Date.now(); sw.running = true; } tick(); };
        body.querySelector('[data-key="clk:lap"]').onclick = () => { if (sw.running) sw.laps.unshift(sw.acc + Date.now() - sw.start); else { sw.acc = 0; sw.laps = []; } tick(); };
      }
      tick();
    }
    function tick() {
      const now = new Date(), t = body.querySelector('.clk-time');
      if (!t || tab === 'alarm') return;
      if (tab === 'clock') {
        t.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
        body.querySelector('.clk-date').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
        const box = body.querySelector('.clk-cities');
        box.innerHTML = cities().length ? '' : '<p class="muted">Add a city to see its time here.</p>';
        cities().forEach((z) => {
          const name = (CITIES.find(([, zz]) => zz === z) || [z])[0];
          let tm = '', diff = '';
          try {
            tm = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: z });
            const there = new Date(now.toLocaleString('en-US', { timeZone: z })), here = new Date(now.toLocaleString('en-US'));
            const hrs = Math.round((there - here) / 360000) / 10;
            diff = hrs === 0 ? 'Same time' : (hrs > 0 ? hrs + ' hours ahead' : -hrs + ' hours behind').replace(/^1 hours/, '1 hour');
          } catch (e) { tm = '?'; }
          const row = h('<div class="clk-city"><span><b>' + esc(name) + '</b><span>' + esc(diff) + '</span></span><output>' + esc(tm) + '</output><button class="b small" data-nav aria-label="Remove ' + esc(name) + '">' + D.glyph('close', 1) + '</button></div>');
          row.querySelector('button').onclick = () => { D.state.cities = cities().filter((x) => x !== z); D.save(); render(); };
          box.appendChild(row);
        });
      } else if (tab === 'timer') {
        const left = T.running ? T.end - Date.now() : T.left;
        t.textContent = hms(T.total ? left + 999 : 0);
        body.querySelector('.clk-date').textContent = T.total ? (T.running ? 'Ends at ' + new Date(T.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : left > 0 && left < T.total ? 'Paused' : 'Ready') : 'Pick how long';
        const go = body.querySelector('[data-key="clk:go"]');
        go.textContent = T.running ? 'Pause' : 'Start'; go.disabled = !T.total;
      } else {
        const ms = sw.acc + (sw.running ? Date.now() - sw.start : 0);
        t.textContent = hms(ms, true);
        body.querySelector('[data-key="clk:sw"]').textContent = sw.running ? 'Stop' : ms ? 'Go on' : 'Start';
        body.querySelector('[data-key="clk:lap"]').textContent = sw.running ? 'Lap' : 'Reset';
        const ol = body.querySelector('.clk-laps');
        if (ol.childElementCount !== sw.laps.length) ol.innerHTML = sw.laps.map((l, i) => '<li><span>Lap ' + (sw.laps.length - i) + '</span><b>' + hms(l, true) + '</b></li>').join('');
      }
    }
    // ---- the Alarms tab: a list, and a little editor made of buttons (fine with a remote) ----
    let edit = null;
    function renderAlarms() {
      if (edit) return renderEditor();
      const list = alarms();
      body.innerHTML = '<div class="clk-alarms">' + (list.length ? list.map((a, i) => {
        const n = a.on && nextRing(a), inH = n ? Math.round((n - Date.now()) / 60000) : 0;
        return '<div class="clk-al' + (a.on ? '' : ' off') + '"><button class="clk-al-t" data-nav data-key="al:e' + i + '"><b>' + esc(t12(a.time)) + '</b><span>' + esc((a.label ? a.label + ', ' : '') + daysText(a)) + (n ? ' · in ' + (inH < 60 ? inH + ' min' : Math.round(inH / 60) + ' hours') : '') + (a.snooze ? ' · snoozing' : '') + '</span></button>' +
          '<button class="switch ' + (a.on ? 'on' : '') + '" data-nav data-key="al:o' + i + '" role="switch" aria-checked="' + !!a.on + '" aria-label="Alarm at ' + esc(t12(a.time)) + '"></button></div>';
      }).join('') : '<p class="muted">No alarms. DiceOS can wake you: the TV comes on (through the HDMI cable, if your TV allows it) and plays something.</p>') +
        '</div><div class="clk-btns"><button class="b go" data-nav data-key="al:add">' + D.glyph('plus', 2) + 'Add an alarm</button></div>' + (D.sys ? '' : '<p class="muted clk-note">In a browser, alarms ring while ' + esc(D.brand) + ' is open.</p>');
      list.forEach((a, i) => {
        body.querySelector('[data-key="al:e' + i + '"]').onclick = () => { edit = Object.assign({ i }, JSON.parse(JSON.stringify(a))); render(); };
        body.querySelector('[data-key="al:o' + i + '"]').onclick = (e) => { a.on = !a.on; delete a.snooze; e.currentTarget.classList.toggle('on', a.on); D.save(); render(); };
      });
      body.querySelector('[data-key="al:add"]').onclick = () => { edit = { i: -1, time: '07:00', days: [1, 2, 3, 4, 5], wake: 'radio', on: true, label: '' }; render(); };
      if (!D.nav.el || !root.contains(D.nav.el) || !D.nav.el.isConnected) D.nav.focus(body.querySelector('[data-key="al:e0"]') || body.querySelector('[data-key="al:add"]'), { scroll: false });
    }
    function renderEditor() {
      const e = edit, [hh, mm] = e.time.split(':').map(Number);
      body.innerHTML = '<div class="clk-ed"><div class="clk-ed-time"><button class="b small" data-nav data-key="ed:h-">−1 h</button><button class="b small" data-nav data-key="ed:m-">−5 min</button><output class="clk-time">' + esc(t12(e.time)) + '</output><button class="b small" data-nav data-key="ed:m+">+5 min</button><button class="b small" data-nav data-key="ed:h+">+1 h</button></div>' +
        '<div class="clk-ed-days" role="group" aria-label="Days">' + DAYS.map((d, i) => '<button class="b small" data-nav data-key="ed:d' + i + '" aria-pressed="' + e.days.includes(i) + '">' + d + '</button>').join('') + '</div>' +
        '<div class="clk-ed-row"><span>Wake me with</span><div class="seg" role="group">' + WAKE.map(([k, n]) => '<button data-nav data-key="ed:w' + k + '" aria-pressed="' + (e.wake === k) + '">' + n + '</button>').join('') + '</div></div>' +
        '<div class="clk-btns"><button class="b go" data-nav data-key="ed:save">Save</button>' + (e.i >= 0 ? '<button class="b danger" data-nav data-key="ed:del">Delete</button>' : '') + '<button class="b" data-nav data-key="ed:cancel">Cancel</button></div></div>';
      const q = (k) => body.querySelector('[data-key="ed:' + k + '"]');
      const set = (h2, m2) => { const t = ((h2 * 60 + m2) % 1440 + 1440) % 1440; e.time = two(Math.floor(t / 60)) + ':' + two(t % 60); renderEditor(); };
      q('h-').onclick = () => set(hh - 1, mm); q('h+').onclick = () => set(hh + 1, mm);
      q('m-').onclick = () => set(hh, mm - 5 - (mm % 5 ? -(5 - (mm % 5)) : 0)); q('m+').onclick = () => set(hh, mm + 5 - (mm % 5));
      DAYS.forEach((d, i) => { q('d' + i).onclick = () => { e.days = e.days.includes(i) ? e.days.filter((x) => x !== i) : e.days.concat([i]).sort(); renderEditor(); }; });
      WAKE.forEach(([k]) => { q('w' + k).onclick = () => { e.wake = k; renderEditor(); }; });
      q('save').onclick = () => { const a = { id: e.id || Date.now().toString(36), time: e.time, days: e.days, wake: e.wake, on: true, label: e.label || '' }; if (e.i >= 0) alarms()[e.i] = a; else alarms().push(a); alarms().sort((x, y) => x.time.localeCompare(y.time)); D.save(); edit = null; render(); const n = nextRing(a); if (n) D.toast({ icon: 'bell', c: '#2f9e8f', title: 'Alarm set', text: 'It rings ' + n.toLocaleDateString([], { weekday: 'long' }) + ' at ' + t12(a.time) + '.' }); };
      q('cancel').onclick = () => { edit = null; render(); };
      if (q('del')) q('del').onclick = () => { alarms().splice(e.i, 1); D.save(); edit = null; render(); };
      const keep = D.nav.el && D.nav.el.dataset.key;
      const el = keep && body.querySelector('[data-key="' + keep + '"]');
      D.nav.focus(el || q('save'), { scroll: false });
    }
    const offAlarms = D.on('alarms', () => { if (tab === 'alarm' && !edit) render(); });
    root.querySelectorAll('.clk-tabs button').forEach((b) => { b.onclick = () => { tab = b.dataset.t; edit = null; render(); }; });
    const loop = () => { tick(); raf = setTimeout(loop, tab === 'watch' ? 100 : 500); };
    const onTimer = () => { if (tab === 'timer') tick(); };
    const offTimer = D.on('timer', onTimer);
    render(); loop();
    return {
      onAction(a) {
        const order = ['clock', 'alarm', 'timer', 'watch'];
        if (a === 'lb' || a === 'rb') { tab = order[(order.indexOf(tab) + (a === 'rb' ? 1 : 3)) % 4]; edit = null; render(); return true; }
        if (a === 'b' && edit) { edit = null; render(); return true; }
        return false;
      },
      unmount() { clearTimeout(raf); offTimer(); offAlarms(); },
    };
  } });
})();
