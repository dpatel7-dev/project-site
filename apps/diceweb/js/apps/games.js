// Games: the games Dhruv made for dpatel.dev, played right here.
// Each one is its own page in games/; this shows them and runs the one you pick.
(function () {
  'use strict';
  const D = window.Dice, G = window.DiceGfx, h = D.h, esc = D.esc;
  const GAMES = [
    { id: 'algebradash', name: 'Algebra Dash', line: 'Flip gravity to dodge the spikes, and dash through the phases.', keys: 'Click or Space: flip gravity. Shift: dash.', c: '#22e3e3' },
    { id: 'ballandwall', name: 'Ball and Wall', line: 'Swing at the ball, keep it off your side of the wall, and spend coins on new skins.', keys: 'W A D: jump and move. Space: swing. Shift: slow motion.', c: '#ff4a5a' },
    { id: 'neonvoids', name: 'Neon Voids', line: 'Run the neon corridor and flip between floor and ceiling. How far can you get?', keys: 'Space or tap: reverse gravity.', c: '#ff4fd8' },
    { id: 'lunarlander', name: 'Pixel Lander', line: 'Ease the lander down onto the blue pad before the fuel runs out.', keys: 'Up: thrust. Left and right: turn.', c: '#4f8cff' },
  ];
  // a little cover for each, drawn in pixels: what the game looks like, more or less
  function cover(id) {
    const W = 96, H = 60, c = G.canvas(W, H), g = c.getContext('2d');
    const r = (x, y, w, hh, col) => { g.fillStyle = col; g.fillRect(x, y, w, hh); };
    if (id === 'algebradash') {
      r(0, 0, W, H, '#05080c');
      for (let i = 0; i < 14; i++) r((i * 23) % W, 6 + (i * 13) % 40, 8 + (i % 3) * 4, 1, '#0f2a2f');
      r(0, 12, W, 1, '#22e3e3'); r(0, 47, W, 1, '#22e3e3'); r(0, 11, W, 1, 'rgba(34,227,227,.3)'); r(0, 48, W, 1, 'rgba(34,227,227,.3)');
      r(22, 39, 8, 8, '#22e3e3'); r(23, 40, 6, 6, '#0b3d40'); r(25, 42, 2, 2, '#bffcff');
      for (const x of [52, 60, 80]) for (let k = 0; k < 5; k++) r(x + k, 46 - k, 9 - k * 2, 1, '#ff2e8a');
      for (const x of [40, 70]) for (let k = 0; k < 5; k++) r(x + k, 13 + k, 9 - k * 2, 1, '#ff2e8a');
      for (let k = 0; k < 6; k++) r(12 - k * 2, 42, 2, 1, 'rgba(34,227,227,' + (0.5 - k * 0.08) + ')');
    } else if (id === 'ballandwall') {
      r(0, 0, W, H, '#1a1a1a'); r(0, 50, W, 1, '#444'); r(84, 4, 4, 46, '#ffffff'); r(88, 4, 2, 46, '#444');
      r(80, 30, 4, 8, '#d62b2b'); r(14, 40, 4, 10, '#22c7ff'); r(30, 51, 26, 2, '#111'); r(22, 4, 50, 2, '#27e02d');
      for (let k = 0; k < 5; k++) { g.fillStyle = 'rgba(255,255,255,' + (0.15 + k * 0.17) + ')'; g.beginPath(); g.arc(40 + k * 6, 30 - k * 3, 2 + k * 0.4, 0, 7); g.fill(); }
    } else if (id === 'neonvoids') {
      r(0, 0, W, H, '#0b0b10');
      for (let x = 0; x < W; x += 12) { r(x, 8, 8, 2, '#ff4fd8'); r(x + 6, 50, 8, 2, '#4ff2ff'); }
      r(0, 7, W, 1, 'rgba(255,79,216,.25)'); r(0, 52, W, 1, 'rgba(79,242,255,.25)');
      r(30, 11, 6, 6, '#ffffff'); r(31, 12, 4, 4, '#ff4fd8');
      for (let k = 1; k < 6; k++) r(30 - k * 4, 13, 3, 2, 'rgba(255,79,216,' + (0.5 - k * 0.08) + ')');
      r(58, 26, 3, 3, '#ffe14f'); r(70, 34, 3, 3, '#ffe14f');
    } else {
      r(0, 0, W, H, '#1c2752');
      for (let i = 0; i < 30; i++) r((i * 37) % W, (i * 17) % 34, 1, 1, i % 4 ? 'rgba(255,255,255,.5)' : '#fff');
      g.fillStyle = '#6b6f80'; g.beginPath(); g.moveTo(0, H); [[0, 46], [14, 40], [26, 44], [36, 38], [46, 50], [62, 50], [70, 42], [84, 46], [96, 40], [96, 60]].forEach(([x, y]) => g.lineTo(x, y)); g.fill();
      r(46, 49, 16, 2, '#4f8cff'); r(47, 47, 1, 2, '#9ec0ff'); r(60, 47, 1, 2, '#9ec0ff');
      r(51, 22, 6, 5, '#d9dde8'); r(52, 23, 4, 2, '#7cc4ff'); r(50, 27, 8, 2, '#9aa0b0'); r(49, 29, 1, 3, '#9aa0b0'); r(58, 29, 1, 3, '#9aa0b0');
      r(53, 31, 2, 3, '#ffb020'); r(53, 34, 2, 2, '#ff5a20');
    }
    c.className = 'gm-cover';
    return c;
  }

  D.register({ id: 'games', mount(root, ctx) {
    root.classList.add('gm');
    let playing = null;
    function list() {
      playing = null;
      root.innerHTML = '<div class="gm-in"><h2 class="pix">Games</h2><p class="muted">The games Dhruv made for dpatel.dev.</p><div class="gm-grid"></div></div>';
      const grid = root.querySelector('.gm-grid');
      GAMES.forEach((gm, i) => {
        const b = h('<button class="gm-card" data-nav data-key="gm:' + gm.id + '"' + (i ? '' : ' data-first') + ' style="--c:' + gm.c + '"><span class="gm-pic"></span><b>' + esc(gm.name) + '</b><span>' + esc(gm.line) + '</span><small>' + esc(gm.keys) + '</small></button>');
        b.querySelector('.gm-pic').appendChild(cover(gm.id));
        b.onclick = () => play(gm);
        grid.appendChild(b);
      });
      ctx.setTitle('Games');
      ctx.legend([['a', 'Play'], ['b', 'Home']]);
      setTimeout(() => { if (ctx.mode === 'run') D.nav.first(root); }, 30);
    }
    function play(gm) {
      playing = gm;
      root.innerHTML = '<div class="gm-bar"><button class="b small" data-nav data-key="gm:back">‹ Games</button><b>' + esc(gm.name) + '</b><span class="muted">' + esc(gm.keys) + '</span><button class="b small" data-nav data-key="gm:full">Full screen</button></div>' +
        '<iframe class="gm-frame" title="' + esc(gm.name) + '" src="games/' + gm.id + '.html" allow="fullscreen; autoplay"></iframe>';
      const f = root.querySelector('iframe');
      root.querySelector('[data-key="gm:back"]').onclick = list;
      root.querySelector('[data-key="gm:full"]').onclick = () => { if (f.requestFullscreen) f.requestFullscreen().catch(() => {}); f.focus(); };
      f.onload = () => { try { f.contentWindow.focus(); } catch (e) { /* fine */ } };
      ctx.setTitle(gm.name);
      ctx.legend([['b', 'Back to games']]);
      D.S.play('select');
    }
    list();
    return {
      onAction(a) {
        if (a === 'b' && playing) { list(); return true; }
        if (a === 'a') { const el = document.activeElement; if (el && root.contains(el) && el.tagName === 'BUTTON') { el.click(); return true; } }
        return false;
      },
    };
  } });
})();
