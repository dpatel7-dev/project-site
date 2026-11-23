// Calendar: a month at a time. Pick a day to see what's on and add things.
// Everything is kept in this browser (or on the computer, on Dice).
(function () {
  'use strict';
  const D = window.Dice, L = D.L, h = D.h, esc = D.esc;
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  D.register({ id: 'calendar', mount(root, ctx) {
    root.classList.add('cal');
    root.innerHTML = '<section class="cal-month"><header><h2 class="pix"></h2><span class="cal-nav"><button class="b small" data-nav data-key="cal:prev" aria-label="Last month">‹</button>' +
      '<button class="b small" data-nav data-key="cal:today">Today</button><button class="b small" data-nav data-key="cal:next" aria-label="Next month">›</button></span></header>' +
      '<div class="cal-days">' + DAYS.map((d) => '<span>' + d + '</span>').join('') + '</div><div class="cal-grid" role="grid"></div></section>' +
      '<aside class="cal-side"><h3></h3><div class="cal-list"></div><form class="cal-add"><input data-nav data-key="cal:text" placeholder="Add something" aria-label="What\'s on" maxlength="80"><input type="time" data-nav data-key="cal:time" aria-label="Time (optional)"><button class="b small go" data-nav data-key="cal:add">Add</button></form>' +
      '<h3 class="cal-soon-h">Coming up</h3><div class="cal-soon"></div></aside>';
    const title = root.querySelector('h2'), grid = root.querySelector('.cal-grid'), side = root.querySelector('.cal-side h3'), list = root.querySelector('.cal-list'), soon = root.querySelector('.cal-soon');
    const form = root.querySelector('.cal-add'), text = form.querySelector('[data-key="cal:text"]'), time = form.querySelector('[type=time]');
    const ev = () => (D.state.events = D.state.events || {});
    const today = new Date();
    let y = today.getFullYear(), m = today.getMonth(), pick = L.dayKey(today);
    const nice = (key, opts) => { const [yy, mm, dd] = key.split('-').map(Number); return new Date(yy, mm - 1, dd).toLocaleDateString([], opts || { weekday: 'long', month: 'long', day: 'numeric' }); };
    const sorted = (arr) => arr.slice().sort((a, b) => (a.time || '99') < (b.time || '99') ? -1 : 1);
    function render() {
      title.textContent = new Date(y, m, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
      grid.innerHTML = '';
      const tk = L.dayKey(new Date());
      L.monthGrid(y, m).forEach((c) => {
        const n = (ev()[c.key] || []).length;
        const b = h('<button role="gridcell" data-nav data-key="cal:' + c.key + '" class="' + (c.inMonth ? '' : 'out ') + (c.key === tk ? 'today ' : '') + (c.key === pick ? 'on' : '') + '"><span>' + c.d + '</span>' + (n ? '<i class="dots">' + '<b></b>'.repeat(Math.min(3, n)) + '</i>' : '') + '</button>');
        b.setAttribute('aria-label', nice(c.key) + (n ? ', ' + n + ' thing' + (n === 1 ? '' : 's') : ''));
        b.onclick = () => { pick = c.key; if (!c.inMonth) { y = c.y; m = c.m; } render(); };
        grid.appendChild(b);
      });
      side.textContent = pick === tk ? 'Today' : nice(pick);
      const items = sorted(ev()[pick] || []);
      list.innerHTML = items.length ? '' : '<p class="muted">Nothing on.</p>';
      items.forEach((it) => {
        const row = h('<div class="cal-item"><b>' + esc(it.time || 'All day') + '</b><span>' + esc(it.text) + '</span><button class="b small" data-nav aria-label="Remove">' + D.glyph('trash', 1) + '</button></div>');
        row.querySelector('button').onclick = () => { ev()[pick] = (ev()[pick] || []).filter((x) => x !== it); if (!ev()[pick].length) delete ev()[pick]; D.save(); render(); };
        list.appendChild(row);
      });
      // the next few things, from today on
      const up = Object.keys(ev()).filter((k) => k >= tk).sort().flatMap((k) => sorted(ev()[k]).map((it) => ({ k, it }))).slice(0, 5);
      soon.innerHTML = up.length ? up.map(({ k, it }) => '<div class="cal-item small"><b>' + esc(k === tk ? 'Today' : nice(k, { weekday: 'short', month: 'short', day: 'numeric' })) + '</b><span>' + esc((it.time ? it.time + '  ' : '') + it.text) + '</span></div>').join('') : '<p class="muted">Nothing coming up.</p>';
      ctx.setTitle('Calendar');
    }
    form.onsubmit = (e) => {
      e.preventDefault();
      const t = text.value.trim();
      if (!t) { text.focus(); return; }
      (ev()[pick] = ev()[pick] || []).push({ text: t, time: time.value || '' });
      D.save(); text.value = ''; time.value = '';
      D.S.play('select'); render();
    };
    root.querySelector('[data-key="cal:prev"]').onclick = () => { m--; if (m < 0) { m = 11; y--; } render(); };
    root.querySelector('[data-key="cal:next"]').onclick = () => { m++; if (m > 11) { m = 0; y++; } render(); };
    root.querySelector('[data-key="cal:today"]').onclick = () => { const t = new Date(); y = t.getFullYear(); m = t.getMonth(); pick = L.dayKey(t); render(); };
    render();
    return { onAction(a) { if (a === 'lb') { root.querySelector('[data-key="cal:prev"]').click(); return true; } if (a === 'rb') { root.querySelector('[data-key="cal:next"]').click(); return true; } return false; } };
  } });
})();
