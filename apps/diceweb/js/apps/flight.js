// Bumble's Flight: tap to flap, fly between the flowers.
(function () {
  'use strict';
  const D = window.Dice, G = D.G, h = D.h;
  const BEE = {
    up: ['....wwww....', '...wWWWWw...', '....wwww....', '..yYKYYKYY..', '.yYYKYYKYYE.', 'yYYYKYYKYYYY', '.yYYKYYKYYY.', '..yyKyyKyy..'],
    down: ['............', '............', '............', '..yYKYYKYY..', '.yYYKYYKYYE.', 'yYYYKYYKYYYY', '.yYwwwwKYYY.', '..wWWWWwyy..'],
  };
  const INK = { Y: '#f5c431', y: '#d99e17', K: '#4a4038', E: '#1a1e2a', W: '#eef6fc', w: '#a9c7df' };
  const FLOWERS = ['tulip', 'sunflower', 'rose', 'lavender', 'moonflower', 'clover'];

  D.register({ id: 'flight', mount(root, ctx) {
    root.classList.add('flight');
    root.innerHTML = '<canvas class="fl-cv"></canvas><div class="fl-ui"></div>';
    const cv = root.querySelector('canvas'), g = cv.getContext('2d'), ui = root.querySelector('.fl-ui');
    let W = 200, H = 144, bgW = null, state = 'ready', score = 0, best = D.state.stats.flight || 0, paused = false;
    let bee, stems, t = 0, last = 0, speed, sinceStem, parts = [], shake = 0;
    function size() {
      const cw = root.clientWidth || 800, ch = root.clientHeight || 600;
      H = 144; W = Math.max(110, Math.min(340, Math.round(H * cw / ch)));
      cv.width = W; cv.height = H;
      const cell = Math.min(cw / W, ch / H);
      cv.style.width = Math.round(W * cell) + 'px'; cv.style.height = Math.round(H * cell) + 'px';
      bgW = new G.World({ land: 'meadow', c: '#f5c431', who: null, night: D.night(), W: W * 2, H, layout: 'wall', seed: 'flight' });
    }
    function reset() {
      bee = { x: Math.round(W * 0.28), y: H * 0.42, v: 0 };
      stems = []; score = 0; speed = 44; sinceStem = 40; parts = [];
    }
    function panel(html) { ui.innerHTML = html ? '<div class="fl-panel glass">' + html + '</div>' : ''; }
    function ready() {
      state = 'ready'; reset();
      panel('<h2 class="pix">Bumble\'s Flight</h2><p>Tap, click, or press ' + D.btn('a') + ' to flap. Fly between the flowers.</p><p class="muted">Best: ' + best + '</p>');
      ctx.legend([['a', 'Flap'], ['b', 'Home']]);
    }
    function flap() {
      if (paused) return;
      if (state === 'ready') { state = 'fly'; panel(''); }
      if (state === 'over') { if (performance.now() - flap.over > 500) ready(); return; }
      bee.v = -112; ctx.sound.play('flap');
    }
    function addStem() {
      const gap = 46 - Math.min(10, score * 0.4), ground = Math.round(H * 0.84);
      const mid = 20 + gap / 2 + Math.random() * (ground - gap - 30);
      stems.push({ x: W + 4, mid, gap, passed: false, top: FLOWERS[Math.floor(Math.random() * FLOWERS.length)], bot: FLOWERS[Math.floor(Math.random() * FLOWERS.length)] });
    }
    function crash() {
      state = 'over'; flap.over = performance.now(); shake = 0.35;
      ctx.sound.play('crash'); D.S.rumble(250, 0.7);
      const nb = score > best;
      if (nb) { best = score; D.state.stats.flight = best; D.save(); }
      panel('<h2 class="pix">' + (nb && score ? 'New best!' : 'Bump!') + '</h2><p>You flew past <b>' + score + '</b> flower' + (score === 1 ? '' : 's') + '.</p><p class="muted">Best: ' + best + '. Flap to try again.</p>');
      ctx.legend([['a', 'Try again'], ['b', 'Home']]);
    }
    function step(dt) {
      t += dt;
      if (state === 'fly') {
        bee.v += 330 * dt; bee.y += bee.v * dt;
        speed = 44 + Math.min(24, score * 0.8);
        sinceStem += speed * dt;
        if (sinceStem > 72) { sinceStem = 0; addStem(); }
        stems.forEach((s) => { s.x -= speed * dt; });
        stems = stems.filter((s) => s.x > -12);
        const ground = Math.round(H * 0.84);
        if (bee.y > ground - 6 || bee.y < -10) return crash();
        for (const s of stems) {
          if (bee.x + 10 > s.x && bee.x + 1 < s.x + 5) {
            if (bee.y + 1 < s.mid - s.gap / 2 || bee.y + 7 > s.mid + s.gap / 2) return crash();
          }
          if (!s.passed && s.x + 5 < bee.x) {
            s.passed = true; score++; ctx.sound.play('point');
            for (let i = 0; i < 8; i++) parts.push({ x: bee.x + 6, y: bee.y + 4, vx: -20 + Math.random() * 40, vy: -30 + Math.random() * 30, life: 0.6 });
            if (score >= 5) ctx.achieve('flight-5');
            if (score >= 20) ctx.achieve('flight-20');
          }
        }
      } else if (state === 'ready') bee.y = H * 0.42 + Math.sin(t * 3) * 3;
      parts.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.life -= dt; });
      parts = parts.filter((p) => p.life > 0);
      shake = Math.max(0, shake - dt);
    }
    function draw() {
      const night = D.night();
      // the background world scrolls slowly behind
      const off = Math.round((t * (state === 'fly' ? speed * 0.25 : 6)) % W);
      const bgc = draw.bg || (draw.bg = G.canvas(W * 2, H));
      if (draw.bgw !== bgW) { draw.bgw = bgW; bgc.width = W * 2; bgc.height = H; }
      bgW.draw(bgc.getContext('2d'), t, D.reduced());
      g.drawImage(bgc, off, 0, W, H, 0, 0, W, H);
      const sx = shake ? Math.round((Math.random() - 0.5) * 3) : 0;
      g.save(); g.translate(sx, 0);
      const ground = Math.round(H * 0.84);
      const stem = night ? '#3f6b3a' : '#5aa354', stem2 = night ? '#2f5530' : '#468a43';
      for (const s of stems) {
        const x = Math.round(s.x), a = Math.round(s.mid - s.gap / 2), b = Math.round(s.mid + s.gap / 2);
        g.fillStyle = stem; g.fillRect(x + 1, 0, 3, a); g.fillRect(x + 1, b, 3, ground - b);
        g.fillStyle = stem2; g.fillRect(x + 3, 0, 1, a); g.fillRect(x + 3, b, 1, ground - b);
        for (let y = 8; y < a - 6; y += 11) { g.fillStyle = stem; g.fillRect(x + 4, y, 2, 1); g.fillRect(x + 5, y - 1, 1, 1); }
        for (let y = b + 10; y < ground - 4; y += 11) { g.fillStyle = stem; g.fillRect(x - 1, y, 2, 1); g.fillRect(x - 1, y - 1, 1, 1); }
        const pt = ART.plants[s.top], pb = ART.plants[s.bot];
        g.save(); g.translate(x - 1, a + 5); g.scale(1, -1); g.drawImage(G.sprite(pt.grid, pt.ink, 'p:' + s.top), 0, 0); g.restore();
        g.drawImage(G.sprite(pb.grid, pb.ink, 'p:' + s.bot), x - 1, b - 5);
      }
      // the bee
      const frame = state === 'fly' ? (bee.v < 0 || Math.floor(t * 12) % 2 ? 'up' : 'down') : (Math.floor(t * 8) % 2 ? 'up' : 'down');
      const tilt = state === 'fly' ? Math.max(-1, Math.min(2, Math.round(bee.v / 70))) : 0;
      const sp = G.sprite(BEE[frame], INK, 'bee:' + frame);
      g.drawImage(sp, Math.round(bee.x), Math.round(bee.y) + (tilt > 1 ? 1 : 0));
      if (tilt > 0) { g.fillStyle = 'rgba(0,0,0,.0)'; }
      parts.forEach((p) => { g.globalAlpha = Math.max(0, p.life / 0.6); g.fillStyle = '#ffe680'; g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); });
      g.globalAlpha = 1;
      g.restore();
      // the score
      if (state === 'fly' || state === 'over') {
        const s = String(score);
        g.font = '16px "Pixelify Sans", monospace'; g.textAlign = 'center'; g.textBaseline = 'top';
        g.fillStyle = 'rgba(0,0,0,.3)'; g.fillText(s, W / 2 + 1, 7);
        g.fillStyle = '#ffffff'; g.fillText(s, W / 2, 6);
      }
    }
    function frame(now) {
      if (!last) last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!paused) step(dt);
      draw();
    }
    let raf = 0, own = false;
    function loop(now) { frame(now); raf = requestAnimationFrame(loop); }
    cv.addEventListener('pointerdown', (e) => { e.preventDefault(); flap(); });
    ui.addEventListener('pointerdown', (e) => { e.preventDefault(); flap(); });
    const ro = new ResizeObserver(() => { size(); if (state !== 'fly') reset(); draw(); }); ro.observe(root);
    const looked = D.on('look', () => size());
    size(); ready();
    own = true; raf = requestAnimationFrame(loop);
    return {
      onAction(a) { if (a === 'a' || a === 'up') { flap(); return true; } if (['down', 'left', 'right', 'x', 'y'].includes(a)) return true; return false; },
      pause() { paused = true; cancelAnimationFrame(raf); },
      resume() { paused = false; last = 0; if (own) raf = requestAnimationFrame(loop); },
      unmount() { cancelAnimationFrame(raf); ro.disconnect(); looked(); },
    };
  } });
})();
