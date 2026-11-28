// Lookouts: Deuce keeps watch, and tells you.
//
// "Tell me when the Knicks game starts." "Let me know when it stops raining." "Tell me when this
// page changes." "Let me know when bestbuy.com says in stock." Deuce looks every so often (a game
// every two minutes, the sky every ten, a page every fifteen) and, the moment it happens, says so,
// with a button to do the obvious next thing (Watch it, Open it). Then that lookout is done.
// Up to 12 at once; they're kept across restarts, and stop by themselves after a week.
(function () {
  'use strict';
  const D = window.Dice, h = D.h, esc = D.esc;
  const LK = (D.lookouts = {});
  const list = () => (Array.isArray(D.state.lookouts) ? D.state.lookouts : (D.state.lookouts = []));
  LK.list = () => list().slice();
  const DU = () => D.deuce, Mind = () => D.deuce && D.deuce.mind;
  const EVERY = { game: 2 * 60e3, weather: 10 * 60e3, page: 15 * 60e3, online: 20e3 };
  const LIFE = 7 * 864e5;
  // the weather's codes (WMO): drizzle and rain, snow, thunder
  const RAIN = (c) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;
  const SNOW = (c) => (c >= 71 && c <= 77) || c === 85 || c === 86;
  const units = () => (D.state.st && D.state.st.units) || (/^en-US$/i.test(navigator.language || '') ? 'f' : 'c');
  const placeOf = () => (D.state.st && D.state.st.place) || (D.state.home && D.state.home.place);
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return 'the page'; } };
  const hash = (s) => { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0; return (x >>> 0).toString(36); };
  const cap = (s) => String(s).replace(/^./, (c) => c.toUpperCase());

  // what a lookout is waiting for, in words ("when the Knicks game starts")
  LK.words = function (l) {
    if (l.what === 'game') return 'when the ' + l.team + ' game ' + (l.end ? 'ends' : 'starts');
    if (l.what === 'weather') {
      const deg = '°' + (l.units === 'c' ? 'C' : 'F');
      return ({ dry: 'when it stops raining', rain: 'when it starts to rain', snow: 'when it starts to snow', storm: 'if a storm comes', freezing: 'if it drops below freezing',
        above: 'when it gets above ' + l.n + deg, below: 'when it drops below ' + l.n + deg })[l.cond] + (l.place ? ' in ' + l.place.name : '');
    }
    if (l.what === 'page') {
      const where = l.title ? '"' + l.title + '"' : host(l.url);
      return l.cond === 'below' ? 'when the price on ' + where + ' drops below ' + l.n : l.cond === 'says' ? 'when ' + where + ' says ' + l.words : 'when ' + where + ' changes';
    }
    if (l.what === 'online') return 'when the internet is back';
    return 'about that';
  };
  const ICON = { game: ['trophy', '#e8913a'], weather: ['sun', '#3a9be8'], page: ['link', '#8a6fd8'], online: ['wifi', '#2fa59a'] };

  // can Deuce read web pages here? (DiceOS reads any page; a browser, only Wikipedia's)
  const canRead = (url) => !!(Mind() && (Mind().onDice() || /^https:\/\/en\.wikipedia\.org\/wiki\//.test(url)));

  // ---- starting one --------------------------------------------------------------------------------------------------
  // it: what Deuce's rules worked out ({ what: 'game', team } etc.). → { ok, lookout } or { ok: false, why }
  LK.add = function (it) {
    const l = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), what: it.what, at: Date.now(), next: 0 };
    if (it.what === 'game') Object.assign(l, { team: it.team, full: it.full || it.team, end: !!it.end });
    else if (it.what === 'weather') { const p = placeOf(); if (!p) return { ok: false, why: 'town' }; Object.assign(l, { cond: it.cond, n: it.n, units: units(), place: { name: p.name, lat: p.lat, lon: p.lon } }); }
    else if (it.what === 'page') {
      let url = it.url, title = '';
      if (url === 'this') {
        const pg = D.serene && D.serene.page && D.serene.page();
        if (!pg) return { ok: false, why: 'nopage' };
        url = pg.url; title = pg.title || '';
      }
      if (!canRead(url)) return { ok: false, why: 'dice' };
      Object.assign(l, { url, title: title.slice(0, 48), cond: it.cond, n: it.n, words: it.words });
    } else if (it.what === 'online') { if (navigator.onLine) return { ok: false, why: 'online' }; }
    else return { ok: false, why: 'what' };
    // the same one twice is one
    const same = list().find((x) => LK.words(x) === LK.words(l));
    if (same) return { ok: true, lookout: same, again: true };
    if (list().length >= 12) return { ok: false, why: 'full' };
    list().push(l);
    D.save(); D.emit('lookouts');
    setTimeout(() => check(l), 1200); // a first look straight away
    return { ok: true, lookout: l };
  };
  LK.remove = function (id) { D.state.lookouts = list().filter((l) => l.id !== id); D.save(); D.emit('lookouts'); };
  // "stop watching the Knicks" → the ones that match; "stop all the lookouts" → every one
  LK.stop = function (what) {
    const w = String(what || '').toLowerCase().replace(/^(the|my|for|on) /, '').trim();
    const gone = list().filter((l) => !w || /^(all|everything|them all|all of them|it all)$/.test(w) || LK.words(l).toLowerCase().includes(w) || (l.team && l.team.toLowerCase().includes(w)));
    D.state.lookouts = list().filter((l) => !gone.includes(l)); D.save(); D.emit('lookouts');
    return gone.length;
  };

  // ---- it happened ---------------------------------------------------------------------------------------------------
  function fire(l, title, text, buttons) {
    if (!list().includes(l)) return;
    D.state.lookouts = list().filter((x) => x !== l); D.save(); D.emit('lookouts');
    if (D.asleep && D.wake) D.wake();
    const [icon, c] = ICON[l.what] || ['bell', '#4b7bec'];
    D.notify({ icon, c, title, text, urgent: true });
    D.S.play('wake');
    // with something to do next, Deuce says it, with the buttons; otherwise, just out loud
    const du = DU();
    if (du && buttons && buttons.length && du.cfg && du.cfg().on !== false) {
      du.show();
      const heard = document.querySelector('#deuce .du-heard');
      if (heard) heard.textContent = 'Lookout: ' + LK.words(l).replace(/^when |^if /, '');
      du.say(title + '. ' + text, du.card('', '', buttons.concat([{ label: 'OK', run: () => du.hide() }])));
    } else if (du) du.talk(title + '. ' + text);
  }

  // ---- looking -------------------------------------------------------------------------------------------------------
  const busy = new Set();
  async function check(l) {
    if (busy.has(l.id) || !list().includes(l)) return;
    busy.add(l.id);
    l.next = Date.now() + (EVERY[l.what] || 60e3);
    try {
      if (l.what === 'game') await game(l);
      else if (l.what === 'weather') await weather(l);
      else if (l.what === 'page') await page(l);
      else if (l.what === 'online') { if (navigator.onLine) fire(l, 'The internet is back', 'You\'re online again.'); }
      l.fails = 0;
    } catch (e) {
      // the internet down, a site not answering: try again next time, and give up after a while
      l.fails = (l.fails || 0) + 1;
      if (l.fails >= 12) fire(l, 'Lookout stopped', 'I couldn\'t check ' + LK.words(l).replace(/^when |^if /, '') + ' for a while, so I stopped.');
    } finally {
      busy.delete(l.id);
      D.save();
    }
  }
  async function game(l) {
    const g = await DU().nextGame(l.team);
    if (!g) return;
    const score = g.usScore != null ? g.us + ' ' + g.usScore + ', ' + g.them + ' ' + g.themScore : g.us + (g.home ? ' vs ' : ' at ') + g.them;
    if (!l.end && g.state === 'in') {
      fire(l, 'The ' + l.team + ' game is on', score + (g.detail ? ', ' + g.detail : '') + '.', [{ label: 'Watch it', icon: 'play', go: true, run: () => DU().ask('put on the ' + l.team + ' game') }]);
    } else if (g.state === 'post' && (l.end || new Date(g.at).getTime() > l.at - 4 * 3600e3)) {
      fire(l, l.end ? 'The ' + l.team + ' game is over' : 'The ' + l.team + ' game already finished', 'Final: ' + score + '.');
    }
  }
  async function weather(l) {
    const p = l.place, d = await D.weather.get(p.lat, p.lon, l.units || units());
    const w = D.weather.words(d.code), now = w.text.toLowerCase() + ', ' + d.t + '°';
    const hit = { dry: !RAIN(d.code) && !SNOW(d.code), rain: RAIN(d.code), snow: SNOW(d.code), storm: d.code >= 95, freezing: d.t <= (l.units === 'c' ? 0 : 32), above: d.t >= l.n, below: d.t <= l.n }[l.cond];
    if (!hit) return;
    const title = { dry: 'It\'s stopped raining', rain: 'It\'s raining', snow: 'It\'s snowing', storm: 'A storm\'s here', freezing: 'It\'s freezing out', above: 'It\'s ' + d.t + '° out', below: 'It\'s down to ' + d.t + '°' }[l.cond];
    fire(l, title + ' in ' + p.name, cap(now) + '.');
  }
  // a page: changed (new sentences on it), says something, or a price under a number
  const sentences = (text) => String(text).replace(/\s+/g, ' ').split(/(?<=[.!?])\s+|\s{2,}|\n/).map((s) => s.trim()).filter((s) => s.length > 24 && s.length < 400);
  async function page(l) {
    const text = await Mind().readPage(l.url);
    if (!text) throw new Error('no page');
    const where = l.title || host(l.url), open = [{ label: 'Open it', icon: 'link', go: true, run: () => { DU().hide(); D.browse(l.url); } }];
    if (l.cond === 'change') {
      const now = sentences(text).slice(0, 400).map(hash);
      if (!l.seen) { l.seen = now; return; } // the first look: how it is now
      const was = new Set(l.seen), fresh = sentences(text).filter((s) => !was.has(hash(s)));
      if (fresh.length >= 2 || (fresh.length && now.length < 12)) fire(l, where + ' changed', 'New: "' + fresh[0].slice(0, 140) + (fresh[0].length > 140 ? '…' : '') + '"', open);
      else l.seen = now;
      return;
    }
    if (l.cond === 'says') {
      const low = text.toLowerCase(), at = low.indexOf(String(l.words).toLowerCase());
      if (at >= 0) return fire(l, where + ' says ' + l.words, '"…' + text.slice(Math.max(0, at - 50), at + l.words.length + 70).replace(/\s+/g, ' ').trim() + '…"', open);
      // in other words? Deuce's brain reads it (only when the page has changed since it last did)
      const hs = hash(text);
      if (String(l.words).split(/\s+/).length >= 2 && l.judged !== hs) {
        l.judged = hs;
        const yes = await Mind().judge('Does this page say that ' + l.words + '?', text).catch(() => null);
        if (yes) fire(l, where + ': ' + l.words, 'Deuce\'s brain read the page, and it looks like it does.', open);
      }
      return;
    }
    if (l.cond === 'below') {
      const m = /(?:\$|£|€|USD\s?)\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/.exec(text);
      if (!m) return;
      const price = parseFloat(m[1].replace(/,/g, ''));
      l.price = price;
      if (price <= l.n) fire(l, 'The price dropped on ' + where, 'It\'s ' + m[0].replace(/\s+/g, '') + ' now.', open);
    }
  }
  setInterval(() => {
    const now = Date.now();
    list().slice().forEach((l) => {
      if (now - l.at > LIFE) { LK.remove(l.id); D.notify({ icon: 'bell', c: '#96969f', title: 'A lookout ended', text: 'I stopped watching ' + LK.words(l).replace(/^when |^if /, 'for ') + ' after a week.', toast: false }); return; }
      if (now >= (l.next || 0)) check(l);
    });
  }, 30e3);
  addEventListener('online', () => list().filter((l) => l.what === 'online').forEach(check));

  // ---- the list, in Deuce for PC's Reminders tab ---------------------------------------------------------------------
  LK.panel = function (repaint) {
    const box = h('<section class="lk-list" aria-label="Lookouts"><h4>' + D.glyph('search', 2) + 'Lookouts</h4></section>');
    const L = list();
    if (!L.length) box.appendChild(h('<p class="dp-empty">Deuce can keep watch for you. Say "tell me when the Knicks game starts", "let me know when it stops raining", or "tell me when this page changes".</p>'));
    L.forEach((l) => {
      const [icon, c] = ICON[l.what] || ['bell', '#4b7bec'];
      const row = h('<div class="dp-item lk-item"><span class="lk-k" style="--c:' + c + '">' + D.icon(icon, c, 2) + '</span><div><b></b><small></small></div><button class="b small" data-nav data-key="lk:x-' + esc(l.id) + '">Stop</button></div>');
      row.querySelector('b').textContent = cap(LK.words(l));
      row.querySelector('small').textContent = 'Started ' + new Date(l.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) + (l.what === 'page' && l.cond === 'below' && l.price ? '. Now ' + l.price : '');
      row.querySelector('button').onclick = () => { LK.remove(l.id); if (repaint) repaint(); };
      box.appendChild(row);
    });
    return box;
  };
})();
