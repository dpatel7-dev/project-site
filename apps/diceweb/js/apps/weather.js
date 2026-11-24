// Weather: right now, the next twelve hours and the week ahead, for your town
// (the same town as DiceTV's Today row, Dice Home and SereneTab). Big enough to
// read from the sofa, and every day is a button you can move between with a
// remote. From Open-Meteo, which needs no account.
(function () {
  'use strict';
  const D = window.Dice, L = D.L, h = D.h, esc = D.esc;
  const place = () => (D.state.home && D.state.home.place) || (D.state.st && D.state.st.place) || null;
  const units = () => (D.state.st && D.state.st.units) || (/^en-US$/i.test(navigator.language || '') ? 'f' : 'c');
  const SKY = { clear: ['#3b8fe0', '#8cc8ff'], some: ['#4a86c8', '#a9c9e8'], cloud: ['#5d6f86', '#a5b1c2'], fog: ['#7d8794', '#c3c8cf'], rain: ['#3a4c66', '#7d8ea6'], snow: ['#8aa3c0', '#dbe6f2'], storm: ['#2a2f45', '#5b5f7a'] };
  const NIGHT = ['#0d1530', '#2a3560'];
  let cache = null;

  D.register({ id: 'weather', mount(root, ctx) {
    root.classList.add('wxa');
    root.innerHTML = '<canvas class="wx-fx" aria-hidden="true"></canvas><div class="wx-in"><p class="muted">Looking…</p></div>';
    const inner = root.querySelector('.wx-in'), fx = root.querySelector('.wx-fx'), fg = fx.getContext('2d');
    let kind = 'clear', night = D.night(), parts = [];
    const hourOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric' });
    const dayOf = (iso, i) => (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(iso + 'T12:00').toLocaleDateString([], { weekday: 'long' }));
    function paint(d) {
      const p = place(), c = d.current || {}, w = D.weather.words(c.weather_code);
      kind = w.kind; night = c.is_day === 0 || (c.is_day === undefined && D.night());
      const sky = night ? NIGHT : SKY[kind] || SKY.clear;
      root.style.setProperty('--sky1', sky[0]); root.style.setProperty('--sky2', sky[1]);
      const u = units() === 'f' ? 'mph' : 'km/h';
      const daily = d.daily || {}, hourly = d.hourly || {}, days = (daily.time || []).length;
      const lo = Math.min(...(daily.temperature_2m_min || [0])), hi = Math.max(...(daily.temperature_2m_max || [1]));
      let start = 0;
      if (hourly.time) { const now = Date.now(); start = Math.max(0, hourly.time.findIndex((t) => new Date(t).getTime() > now - 3600000)); }
      inner.innerHTML = '<header class="wx-hero"><div><button class="wx-place" data-nav data-key="wx:town" data-a="Change town">' + D.glyph('home', 2) + esc(p.name) + '</button>' +
        '<div class="wx-now">' + D.weather.icon(w.kind, night) + '<b>' + Math.round(c.temperature_2m) + '°</b></div><p class="wx-words">' + esc(w.text) + '</p>' +
        '<p class="wx-more">' + (c.apparent_temperature !== undefined ? 'Feels like ' + Math.round(c.apparent_temperature) + '°' : '') + (c.wind_speed_10m !== undefined ? ' · Wind ' + Math.round(c.wind_speed_10m) + ' ' + u : '') + (c.relative_humidity_2m !== undefined ? ' · Humidity ' + Math.round(c.relative_humidity_2m) + '%' : '') + '</p></div>' +
        (daily.sunrise ? '<div class="wx-sun"><span>' + D.glyph('sun', 2) + 'Sunrise ' + esc(new Date(daily.sunrise[0]).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) + '</span><span>' + D.glyph('moon', 2) + 'Sunset ' + esc(new Date(daily.sunset[0]).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) + '</span></div>' : '') + '</header>' +
        (hourly.time ? '<section class="wx-hours" aria-label="The next twelve hours"><h3>Next 12 hours</h3><div class="wx-hrow" data-row>' + hourly.time.slice(start, start + 12).map((t, i) => {
          const k = start + i, ww = D.weather.words(hourly.weather_code[k]), hr = new Date(t).getHours(), n = hr < 6 || hr >= 19;
          return '<div class="wx-h" data-nav data-key="wx:h' + i + '"><span>' + (i === 0 ? 'Now' : esc(hourOf(t))) + '</span>' + D.weather.icon(ww.kind, n) + '<b>' + Math.round(hourly.temperature_2m[k]) + '°</b>' + (hourly.precipitation_probability && hourly.precipitation_probability[k] >= 20 ? '<small>' + hourly.precipitation_probability[k] + '%</small>' : '<small></small>') + '</div>';
        }).join('') + '</div></section>' : '') +
        (days ? '<section class="wx-days" aria-label="The week"><h3>' + days + ' days</h3>' + daily.time.map((t, i) => {
          const ww = D.weather.words(daily.weather_code[i]), a = daily.temperature_2m_min[i], b = daily.temperature_2m_max[i], span = Math.max(1, hi - lo);
          const rain = daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : null;
          return '<div class="wx-d" data-nav data-key="wx:d' + i + '"><b>' + esc(dayOf(t, i)) + '</b>' + D.weather.icon(ww.kind, false) + '<span class="wx-dw">' + esc(ww.text) + (rain >= 20 ? ', ' + rain + '% rain' : '') + '</span><span class="wx-lo">' + Math.round(a) + '°</span><span class="wx-range"><i style="left:' + ((a - lo) / span * 100).toFixed(1) + '%;right:' + ((hi - b) / span * 100).toFixed(1) + '%"></i></span><span class="wx-hi">' + Math.round(b) + '°</span></div>';
        }).join('') + '</section>' : '') +
        '<p class="wx-credit">Weather from Open-Meteo.</p>';
      inner.querySelector('[data-key="wx:town"]').onclick = change;
      ctx.setTitle('Weather in ' + p.name);
      parts = [];
      if (ctx.mode === 'run') setTimeout(() => D.nav.first(root), 30);
    }
    async function change() { if (D.tv && D.tv.askTown) { await D.tv.askTown(); cache = null; load(); } }
    async function load() {
      const p = place();
      if (!p) {
        inner.innerHTML = '<div class="wx-empty"><h2>Where are you?</h2><p>Add your town once. DiceTV, Dice Home and SereneTab use it too.</p><button class="b go" data-nav data-key="wx:add" data-first>Add your town</button></div>';
        inner.querySelector('button').onclick = change;
        if (ctx.mode === 'run') setTimeout(() => D.nav.first(root), 30);
        return;
      }
      if (cache && cache.name === p.name && Date.now() - cache.at < 10 * 60000) return paint(cache.d);
      const f = units() === 'f' ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : '';
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + p.lat + '&longitude=' + p.lon + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=auto&forecast_days=7' + f;
      try {
        const d = await fetch(url).then((r) => r.json());
        if (!d || !d.current) throw new Error('no weather');
        cache = { name: p.name, at: Date.now(), d };
        if (root.isConnected) paint(d);
      } catch (e) {
        inner.innerHTML = '<div class="wx-empty"><h2>No weather right now</h2><p>It needs the internet. Is the Wi-Fi on?</p><button class="b" data-nav data-key="wx:retry">Try again</button></div>';
        inner.querySelector('button').onclick = load;
      }
    }
    load();
    const timer = setInterval(() => { cache = null; load(); }, 15 * 60000);
    ctx.legend([['a', 'Change town'], ['b', 'Back']]);
    return {
      frame(now) {
        // rain and snow falling behind it all
        if (!/rain|snow|storm/.test(kind) || D.reduced()) { if (fx.width) { fx.width = 0; } return; }
        const W = Math.ceil(root.clientWidth / 3), H = Math.ceil(root.clientHeight / 3);
        if (fx.width !== W || fx.height !== H) { fx.width = W; fx.height = H; fx.style.width = W * 3 + 'px'; fx.style.height = H * 3 + 'px'; parts = []; }
        while (parts.length < W / 2) parts.push({ x: Math.random() * W, y: Math.random() * H, v: kind === 'snow' ? 0.3 + Math.random() * 0.4 : 2 + Math.random() * 2 });
        fg.clearRect(0, 0, W, H);
        fg.fillStyle = kind === 'snow' ? 'rgba(255,255,255,.8)' : 'rgba(200,220,255,.35)';
        for (const q of parts) { q.y += q.v; q.x += kind === 'snow' ? Math.sin(now / 900 + q.v * 9) * 0.2 : 0.3; if (q.y > H) { q.y = -3; q.x = Math.random() * W; } fg.fillRect(Math.round(q.x), Math.round(q.y), 1, kind === 'snow' ? 1 : 3); }
      },
      onAction(a) { if (a === 'a' && D.nav.el && root.contains(D.nav.el) && D.nav.el.tagName !== 'BUTTON') { change(); return true; } return false; },
      unmount() { clearInterval(timer); },
    };
  } });
})();
