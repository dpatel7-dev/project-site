// Clock: the time here and in other cities, a timer and a stopwatch.
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

  D.register({ id: 'clock', mount(root) {
    root.classList.add('clk');
    root.innerHTML = '<nav class="clk-tabs" role="tablist"><button role="tab" data-nav data-key="clk:clock" data-t="clock">Clock</button><button role="tab" data-nav data-key="clk:timer" data-t="timer">Timer</button><button role="tab" data-nav data-key="clk:watch" data-t="watch">Stopwatch</button></nav><div class="clk-body"></div>';
    const body = root.querySelector('.clk-body');
    let tab = 'clock', sw = D.stopwatch = D.stopwatch || { start: 0, acc: 0, running: false, laps: [] }, raf = 0;
    const cities = () => (D.state.cities = D.state.cities || []);
    function render() {
      root.querySelectorAll('.clk-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.t === tab)));
      if (tab === 'clock') {
        body.innerHTML = '<div class="clk-big"><output class="clk-time"></output><span class="clk-date"></span></div><div class="clk-cities"></div><div class="clk-addrow"><select data-nav data-key="clk:city" aria-label="Add a city"><option value="">Add a city…</option>' +
          CITIES.filter(([, z]) => !cities().includes(z)).map(([n, z]) => '<option value="' + z + '">' + esc(n) + '</option>').join('') + '</select></div>';
        body.querySelector('select').onchange = (e) => { if (e.target.value) { cities().push(e.target.value); D.save(); render(); } };
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
      if (!t) return;
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
    root.querySelectorAll('.clk-tabs button').forEach((b) => { b.onclick = () => { tab = b.dataset.t; render(); }; });
    const loop = () => { tick(); raf = setTimeout(loop, tab === 'watch' ? 100 : 500); };
    const onTimer = () => { if (tab === 'timer') tick(); };
    const offTimer = D.on('timer', onTimer);
    render(); loop();
    return {
      onAction(a) { const order = ['clock', 'timer', 'watch']; if (a === 'lb' || a === 'rb') { tab = order[(order.indexOf(tab) + (a === 'rb' ? 1 : 2)) % 3]; render(); return true; } return false; },
      unmount() { clearTimeout(raf); offTimer(); },
    };
  } });
})();
