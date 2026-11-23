// Music: Dice Radio and your own songs, with a little stage that dances.
(function () {
  'use strict';
  const D = window.Dice, G = D.G, M = D.M, esc = D.esc, h = D.h;
  const PLANTS = ['tulip', 'sunflower', 'rose', 'lavender', 'moonflower', 'clover', 'fern', 'cactus'];

  D.register({ id: 'music', mount(root, ctx) {
    root.classList.add('music');
    root.innerHTML = '<div class="mu-side" data-scroll="40"><h2 class="pix">Music</h2><h3>Dice Radio</h3><p class="muted">Little songs, written as they play.</p><div class="mu-radio"></div>' +
      '<h3>Your songs</h3><p class="muted">Kept in this browser for next time.</p><div class="mu-songs"></div><label class="b small mu-add" data-nav data-key="mu:add" tabindex="0">' + D.glyph('plus', 2) + 'Add songs<input type="file" accept="audio/*" multiple hidden></label></div>' +
      '<div class="mu-main"><canvas class="mu-stage"></canvas><div class="mu-now glass"><div class="mu-title"><b class="pix" id="mu-name">Nothing playing</b><span class="muted" id="mu-by">Pick a station to start</span></div>' +
      '<div class="mu-prog" hidden><div class="track"><div class="fill"></div></div></div>' +
      '<div class="mu-ctl"><button class="b small" data-nav data-key="mu:prev" aria-label="Previous">' + D.glyph('prev', 2) + '</button><button class="b go" data-nav data-key="mu:play" aria-label="Play or pause">' + D.glyph('play', 2) + '</button><button class="b small" data-nav data-key="mu:next" aria-label="Next">' + D.glyph('next', 2) + '</button><span class="mu-vol"></span></div></div></div>';
    const radio = root.querySelector('.mu-radio'), songs = root.querySelector('.mu-songs');
    const stage = root.querySelector('.mu-stage'), sg = stage.getContext('2d');
    root.querySelector('.mu-vol').appendChild(ctx.ui.slider(D.state.musicVol, 0, 1, (v) => { D.set('musicVol', v); D.S.setMusic(v); }, 'mu:vol', 'Music volume'));
    root.querySelector('[data-key="mu:prev"]').onclick = () => M.prev();
    root.querySelector('[data-key="mu:next"]').onclick = () => M.next();
    root.querySelector('[data-key="mu:play"]').onclick = () => M.toggle();
    const file = root.querySelector('input[type=file]');
    const add = root.querySelector('.mu-add');
    add.addEventListener('click', (e) => { if (e.target !== file) { e.preventDefault(); file.click(); } });
    file.onchange = () => { M.add(file.files).then((n) => { if (n) D.toast({ icon: 'music', c: '#d39cf5', title: 'Added ' + n + ' song' + (n === 1 ? '' : 's'), text: 'They\'re in Your songs.' }); file.value = ''; }); };
    root.addEventListener('dragover', (e) => { e.preventDefault(); root.classList.add('drop'); });
    root.addEventListener('dragleave', () => root.classList.remove('drop'));
    root.addEventListener('drop', (e) => { e.preventDefault(); root.classList.remove('drop'); M.add(e.dataTransfer.files); });

    function lists() {
      const now = M.now;
      radio.innerHTML = '';
      M.RADIO.forEach((tr, i) => {
        const on = now && now.kind === 'radio' && now.i === i;
        const b = h('<button class="qrow ' + (on ? 'on' : '') + '" data-nav data-key="mu:r' + i + '"><span class="pic" style="background:' + tr.c + '"></span><span><b>' + esc(tr.name) + '</b><span>' + tr.bpm + ' beats a minute</span></span>' + (on ? '<span class="eqmini ' + (now.playing ? '' : 'still') + '"><i></i><i></i><i></i></span>' : '') + '</button>');
        b.onclick = () => (on ? M.toggle() : M.play('radio', i));
        radio.appendChild(b);
      });
      songs.innerHTML = '';
      if (!M.songs.length) songs.innerHTML = '<p class="muted" style="margin:4px 10px 10px;font-size:.9rem">None yet. Add some, or drop them here.</p>';
      M.songs.forEach((s, i) => {
        const on = now && now.kind === 'song' && now.i === i;
        const b = h('<button class="qrow ' + (on ? 'on' : '') + '" data-nav data-key="mu:s' + i + '" data-x="Remove"><span class="pic" style="background:var(--soft-2);display:grid;place-items:center">' + D.glyph('music', 2) + '</span><span><b>' + esc(s.name) + '</b><span>Your song</span></span>' + (on ? '<span class="eqmini ' + (now.playing ? '' : 'still') + '"><i></i><i></i><i></i></span>' : '') + '</button>');
        b.onclick = () => (on ? M.toggle() : M.play('song', i));
        b._x = () => D.ask({ title: 'Remove ' + s.name + '?', text: 'It comes out of ' + D.brand + '. The file on your computer stays where it is.', buttons: [{ label: 'Remove', value: true, go: true, danger: true }, { label: 'Keep it', value: false }] }).then((ok) => { if (ok) M.remove(s.id); });
        songs.appendChild(b);
      });
      root.querySelector('#mu-name').textContent = now ? now.name : 'Nothing playing';
      root.querySelector('#mu-by').textContent = now ? now.by : 'Pick a station to start';
      root.querySelector('[data-key="mu:play"]').innerHTML = D.glyph(now && now.playing ? 'pause' : 'play', 2);
      root.querySelector('.mu-prog').hidden = !(now && now.kind === 'song');
      if (now) root.style.setProperty('--c', now.c);
    }
    const off = M.on(() => { const k = D.nav.el && root.contains(D.nav.el) ? D.nav.el.dataset.key : null; lists(); if (k) { const e = root.querySelector('[data-key="' + k + '"]'); if (e) D.nav.focus(e, { scroll: false }); } });
    lists();

    // the stage: a little concert where the flowers dance to the beat
    let world = null, W = 0, H = 0, jumps = [];
    function sizeStage() {
      const r = stage.getBoundingClientRect();
      W = Math.max(60, Math.round(r.width / 6)); H = Math.max(40, Math.round(r.height / 6));
      stage.width = W; stage.height = H;
      world = new G.World({ land: 'concert', c: (M.now && M.now.c) || '#d39cf5', who: 'cubby', night: D.night(), W, H, layout: 'stage', seed: 'stage' });
      jumps = PLANTS.map(() => 0);
    }
    const ro = new ResizeObserver(sizeStage); ro.observe(stage);
    let raf = 0, lastC = null;
    function draw(now) {
      if (!world) { raf = requestAnimationFrame(draw); return; }
      const t = now / 1000;
      if (M.now && M.now.c !== lastC) { lastC = M.now.c; sizeStage(); }
      world.draw(sg, t, D.reduced());
      const beat = M.beat();
      const lv = M.levels(PLANTS.length) || PLANTS.map(() => 0);
      const ground = world.gy;
      PLANTS.forEach((name, i) => {
        if (beat.hit && (i + Math.floor(t * 2)) % 2 === 0) jumps[i] = 3;
        jumps[i] = Math.max(0, jumps[i] - 0.4);
        const p = ART.plants[name];
        const x = Math.round((i + 0.5) / PLANTS.length * W) - 3;
        const sway = M.now && M.now.playing ? Math.round(Math.sin(t * 4 + i) * lv[i] * 2) : 0;
        sg.drawImage(G.sprite(p.grid, p.ink, 'p:' + name), x + sway, ground - 5 - Math.round(jumps[i]) + (i % 2 ? 2 : 0) + 3);
      });
      // progress through your song
      const pr = M.progress();
      if (pr) root.querySelector('.mu-prog .fill').style.width = (pr.t / pr.d * 100) + '%';
      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    root.querySelector('.mu-prog').addEventListener('pointerdown', (e) => { const r = e.currentTarget.getBoundingClientRect(); M.seek((e.clientX - r.left) / r.width); });
    if (!M.songs.length) M.load();
    setTimeout(() => { const f = root.querySelector('[data-key="mu:play"]'); if (ctx.mode === 'run') D.nav.focus(f); }, 40);
    ctx.legend([]);
    return {
      pause() { cancelAnimationFrame(raf); },
      resume() { raf = requestAnimationFrame(draw); },
      unmount() { cancelAnimationFrame(raf); ro.disconnect(); off(); },
    };
  } });
})();
