// Shield: DiceOS's ad blocker, for everything.
//
// - Websites: in SereneTab and every browser window, a Chromium extension that comes with
//   DiceOS (DiceOS/shield) stops requests to ad and tracker addresses, hides the boxes ads
//   leave behind, drops Google's full-page ads and takes the ads out of YouTube's videos.
//   This page talks to it through its bridge (window.postMessage).
// - Every app: diced keeps a list of ad addresses in the computer's hosts file, so they go
//   nowhere for any app (/api/shield).
// Here: Settings, Shield; and D.shield, which SereneTab's shield button uses.
(function () {
  'use strict';
  const D = window.Dice, h = D.h, esc = D.esc;
  const SH = D.shield = { here: false };
  const emu = () => !!(D.sys && D.sys.info.emulated);
  const num = (n) => Number(n || 0).toLocaleString();

  // ---- the extension, through its bridge -------------------------------------------------
  let seq = 0;
  const waiting = new Map();
  addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin || !e.data) return;
    if (e.data.dice === 'shield-here' && !SH.here) { SH.here = true; D.emit('shield'); }
    if (e.data.dice === 'shield-re') { const w = waiting.get(e.data.id); if (w) { waiting.delete(e.data.id); w(e.data.data); } }
  });
  // the emulator has a pretend one, so you can see how it looks
  const fake = { on: true, yt: true, paused: ['example.org'], allow: [], today: 1284, total: 48211, here: true, version: 'emulated',
    week: {}, top: [{ site: 'news.example.com', n: 412 }, { site: 'recipes.example.net', n: 268 }, { site: 'youtube.com', n: 96 }, { site: 'weather.example.org', n: 61 }] };
  (function () { const d = new Date(); for (let i = 6; i >= 0; i--) { const x = new Date(d.getTime() - i * 864e5); fake.week[x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0')] = i ? [910, 1430, 760, 1702, 1188, 840][i - 1] : 1284; } })();
  function fakeAsk(m) {
    const s = (m.site || '').replace(/^www\./, '');
    if (m.cmd === 'set') { if (typeof m.on === 'boolean') fake.on = m.on; if (typeof m.yt === 'boolean') fake.yt = m.yt; }
    if (m.cmd === 'pause' && s && !fake.paused.includes(s)) fake.paused.push(s);
    if (m.cmd === 'resume') fake.paused = fake.paused.filter((x) => x !== s);
    if (m.cmd === 'allow' && s && !fake.allow.includes(s)) fake.allow.push(s);
    if (m.cmd === 'unallow') fake.allow = fake.allow.filter((x) => x !== s);
    return JSON.parse(JSON.stringify(Object.assign({}, fake, { site: s ? { site: s, n: s.length * 3, paused: fake.paused.includes(s) } : null })));
  }
  SH.ask = function (msg) {
    if (emu()) { SH.here = true; return Promise.resolve(fakeAsk(msg)); }
    return new Promise((res) => {
      const id = ++seq;
      waiting.set(id, (d) => { if (d) SH.here = true; res(d); });
      postMessage({ dice: 'shield', id, msg }, location.origin);
      setTimeout(() => { if (waiting.has(id)) { waiting.delete(id); res(null); } }, 1500);
    });
  };
  SH.get = (site) => SH.ask({ cmd: 'get', site: site || '' });
  SH.set = (o) => SH.ask(Object.assign({ cmd: 'set' }, o));
  SH.pause = (site) => SH.ask({ cmd: 'pause', site });
  SH.resume = (site) => SH.ask({ cmd: 'resume', site });
  SH.allow = (site) => SH.ask({ cmd: 'allow', site });
  SH.unallow = (site) => SH.ask({ cmd: 'unallow', site });
  // the whole computer (DiceOS)
  SH.system = () => (D.sys ? D.sys.get('/api/shield') : Promise.resolve(null));
  SH.systemSet = (b) => D.sys.post('/api/shield', b);
  // is there a Shield here at all?
  SH.available = () => !!(D.sys || SH.here);
  // "kept out today", for Deuce's Today and Your week
  SH.today = async () => { const s = await SH.get(); return s ? s.today : null; };

  // ---- pictures ----------------------------------------------------------------------------
  // a shield in three colours of glass, with a tick (or a gap, when it's off)
  SH.art = function (on, size) {
    const id = 'shg' + (++seq);
    return '<svg class="sh-art" viewBox="0 0 64 72" width="' + size + '" height="' + Math.round(size * 72 / 64) + '" aria-hidden="true">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + (on ? '#3fd0b8' : '#b9bcc8') + '"/><stop offset=".5" stop-color="' + (on ? '#4b7bec' : '#9a9eae') + '"/><stop offset="1" stop-color="' + (on ? '#9b6bf0' : '#7d8191') + '"/></linearGradient>' +
      '<linearGradient id="' + id + 'l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="M32 3 L58 12 V34 C58 52 46 63 32 69 C18 63 6 52 6 34 V12 Z" fill="url(#' + id + ')"/>' +
      '<path d="M32 3 L58 12 V34 C58 52 46 63 32 69 C18 63 6 52 6 34 V12 Z" fill="url(#' + id + 'l)"/>' +
      '<path d="M32 3 L58 12 V34 C58 52 46 63 32 69 C18 63 6 52 6 34 V12 Z" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.5"/>' +
      (on ? '<path d="M21 36 l8 8 l15 -17" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' : '<path d="M22 36 h20" stroke="#fff" stroke-width="5" stroke-linecap="round"/>') + '</svg>';
  };
  // the last seven days, as bars
  function weekBars(week) {
    const days = [], now = new Date();
    for (let i = 6; i >= 0; i--) { const x = new Date(now.getTime() - i * 864e5); const k = x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); days.push({ d: x, n: (week || {})[k] || 0 }); }
    const max = Math.max(1, ...days.map((x) => x.n));
    return '<div class="sh-week" role="img" aria-label="' + esc(days.map((x) => x.d.toLocaleDateString([], { weekday: 'long' }) + ' ' + x.n).join(', ')) + '">' +
      days.map((x, i) => '<div class="sh-bar' + (i === 6 ? ' today' : '') + '" title="' + esc(x.d.toLocaleDateString([], { weekday: 'long' }) + ': ' + num(x.n)) + '"><i style="height:' + Math.max(4, Math.round(x.n / max * 100)) + '%"></i><span>' + esc(x.d.toLocaleDateString([], { weekday: 'narrow' })) + '</span></div>').join('') + '</div>';
  }
  SH.weekBars = weekBars;

  // ---- Settings, Shield --------------------------------------------------------------------
  D.moreSettings = D.moreSettings || [];
  D.moreSettings.push({ id: 'shield', name: 'Shield', icon: 'shield', c: '#4b7bec', after: 'sound', pane: shieldPane });
  async function shieldPane(pane, k) {
    const { row, sw } = k;
    pane.appendChild(h('<h2>Shield</h2>'));
    const box = h('<div class="sh-pane"><p class="muted">Looking…</p></div>');
    pane.appendChild(box);
    const [ext, sys] = await Promise.all([SH.get(), SH.system()]);
    if (!k.here()) return;
    box.innerHTML = '';
    if (!ext && !(sys && sys.ok !== undefined)) {
      box.appendChild(h('<div class="sh-hero glass off">' + SH.art(false, 64) + '<div><b>Shield comes with DiceOS</b><p>On DiceOS it blocks ads, pop-ups and trackers in every website and every app. In this browser, an ad blocker of its own (uBlock Origin, say) does the same job.</p></div></div>'));
      return;
    }
    const on = ext ? ext.on : !!(sys && sys.system);
    const today = ext ? ext.today : 0, weekTotal = ext ? Object.values(ext.week || {}).reduce((a, b) => a + b, 0) : 0;
    const hero = h('<div class="sh-hero glass' + (on ? '' : ' off') + '">' + SH.art(on, 72) + '<div class="sh-words"><b>' + (on ? 'Shield is on' : 'Shield is off') + '</b>' +
      (ext ? '<p><span class="sh-big">' + num(today) + '</span> ads and trackers kept out today, ' + num(weekTotal) + ' this week.</p>' : '<p>Ads and trackers are blocked for every app on this computer.</p>') + '</div>' +
      (ext ? weekBars(ext.week) : '') + '</div>');
    box.appendChild(hero);

    if (ext) {
      box.appendChild(row('Block ads on websites', 'In SereneTab and every browser window: ads, pop-ups, trackers, Google\'s full-page ads.', sw(ext.on, async (v) => { await SH.set({ on: v }); k.again(); }, 'sh:on', 'Block ads on websites')));
      box.appendChild(row('YouTube ads', 'Takes the ads out of YouTube\'s videos and pages. YouTube changes often, so now and then one may get through.', sw(ext.yt, async (v) => { await SH.set({ yt: v }); }, 'sh:yt', 'Block YouTube ads')));
    }
    if (sys && sys.system !== undefined) {
      const sub = sys.system ? num(sys.blocking) + ' ad addresses go nowhere, for every app on this computer (games, TV apps, everything).' : 'Off: only websites are covered.';
      box.appendChild(row('Block ads in every app', sub, sw(sys.system, async (v) => { await SH.systemSet({ system: v }); k.again(); }, 'sh:sys', 'Block ads in every app')));
      const when = sys.updated ? new Date(sys.updated * 1000) : null;
      const ago = when ? Math.round((Date.now() - when) / 864e5) : null;
      const upd = h('<button class="b small" data-nav data-key="sh:upd">' + D.glyph('restart', 2) + (sys.busy ? 'Updating…' : 'Update now') + '</button>');
      upd.disabled = !!sys.busy;
      upd.onclick = async () => { upd.disabled = true; upd.lastChild.textContent = 'Updating…'; await SH.systemSet({ action: 'update' }); const t = setInterval(async () => { const s = await SH.system(); if (!k.here()) return clearInterval(t); if (s && !s.busy) { clearInterval(t); k.again(); D.toast({ icon: 'shield', c: '#4b7bec', title: s.error ? 'Couldn\'t update the list' : 'Shield\'s list is up to date', text: s.error || num(s.blocking) + ' addresses blocked.' }); } }, 1500); };
      box.appendChild(row('Lists', 'Shield\'s own (' + num(sys.builtin) + ' addresses)' + (sys.big ? ' and a big one kept up to date (StevenBlack\'s, ' + num(sys.big) + '), ' + (ago === 0 ? 'updated today' : ago === 1 ? 'updated yesterday' : 'updated ' + ago + ' days ago') : '. The big list (about 100,000 addresses) comes once DiceOS is online') + '.', upd));
      if (sys.error) box.appendChild(h('<p class="note">' + esc(sys.error) + '</p>'));
    }
    if (ext && ext.top && ext.top.length) {
      const list = h('<div class="sh-top"></div>');
      ext.top.slice(0, 5).forEach((t) => list.appendChild(h('<div><span>' + esc(t.site) + '</span><b>' + num(t.n) + '</b></div>')));
      const r = row('Most blocked today', 'The sites with the most ads Shield kept out.', null);
      r.classList.add('col'); r.appendChild(list);
      box.appendChild(r);
    }
    // sites where it's paused
    const paused = ext ? ext.paused : [];
    if (paused.length) {
      const chips = h('<div class="sh-chips"></div>');
      paused.forEach((s, i) => { const c = h('<button class="b small" data-nav data-key="sh:res' + i + '">' + esc(s) + '<span class="muted">Resume</span></button>'); c.onclick = async () => { await SH.resume(s); k.again(); }; chips.appendChild(c); });
      const r = row('Paused on', 'Shield lets everything through on these sites. Pause or resume a site from the shield button in SereneTab.', null);
      r.classList.add('col'); r.appendChild(chips); box.appendChild(r);
    }
    // addresses never blocked
    const allow = Array.from(new Set((ext ? ext.allow : []).concat(sys && sys.allow ? sys.allow : [])));
    const form = h('<form class="sh-allow"><input data-nav data-key="sh:allowin" placeholder="ads.example.com" aria-label="An address to let through" autocomplete="off" spellcheck="false"><button class="b small" data-nav data-key="sh:allowgo">Let it through</button></form>');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const v = form.querySelector('input').value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v)) { D.toast({ icon: 'shield', c: '#96969f', title: 'That isn\'t an address', text: 'Type it like ads.example.com.' }); return; }
      if (ext) await SH.allow(v);
      if (sys && sys.system !== undefined) await SH.systemSet({ action: 'allow', site: v });
      k.again();
    };
    const r = row('Let these through', 'If something you need stops working, let its address through. Shield never blocks these.', null);
    const chips = h('<div class="sh-chips"></div>');
    allow.forEach((s, i) => { const c = h('<button class="b small" data-nav data-key="sh:un' + i + '">' + esc(s) + '<span class="muted">Block again</span></button>'); c.onclick = async () => { if (ext) await SH.unallow(s); if (sys && sys.system !== undefined) await SH.systemSet({ action: 'unallow', site: s }); k.again(); }; chips.appendChild(c); });
    r.classList.add('col'); r.appendChild(chips); r.appendChild(form);
    box.appendChild(r);
  }
})();
