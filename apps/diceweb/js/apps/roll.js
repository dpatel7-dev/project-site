// Roll: the dice game called Pig, against one of the friends.
(function () {
  'use strict';
  const D = window.Dice, G = D.G, L = D.L, esc = D.esc, h = D.h;
  const TALK = {
    roll: ['Here goes!', 'Feeling lucky.', 'One more…', 'Come on, no ones!'],
    hold: ['I\'ll keep that.', 'Safe!', 'Banked it.', 'That\'ll do.'],
    bust: ['Oh no!', 'Not a one!', 'Unlucky…', 'Aw, beans.'],
    win: ['Good game!', 'Yes! Again?', 'That was close!'],
    lose: ['You got me!', 'Well played!', 'Next time…'],
  };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  D.register({ id: 'roll', mount(root, ctx) {
    root.classList.add('roll');
    const friends = D.friends.map((f) => f.id);
    let vs = (ctx.arg && ctx.arg.vs) || null;
    let phase = vs ? 'play' : 'pick', pickIdx = Math.max(0, friends.indexOf(vs || friends[Math.floor(Math.random() * friends.length)]));
    let st = null, face = 6, rolling = false, timer = null, paused = false, aiT = null;
    root.innerHTML = '<canvas class="roll-bg"></canvas><div class="roll-ui"></div>';
    const bg = root.querySelector('.roll-bg'), ui = root.querySelector('.roll-ui');
    let world = null;
    function paintBg() {
      const W = Math.max(40, Math.round(root.clientWidth / 8)), H = Math.max(30, Math.round(root.clientHeight / 8));
      bg.width = W; bg.height = H;
      world = new G.World({ land: 'table', c: '#ff707a', who: null, night: D.night(), W, H, layout: 'wall', seed: 'rolltable', plain: true });
      world.draw(bg.getContext('2d'), 0, true);
    }
    const ro = new ResizeObserver(() => paintBg()); ro.observe(root);
    const meName = D.state.name, meWho = D.state.avatar;
    function faceCanvas(who, size) { const c = G.face(who, size, G.hexA(G.colourOf(who), 0.25)); return c; }

    // ---- choosing who to play ------------------------------------------------------------
    function drawPick() {
      ui.innerHTML = '<div class="rpick glass"><h2 class="pix">Who do you want to play?</h2><p class="muted">Everyone plays a bit differently. Some are brave, some are careful.</p><div class="rfaces" data-row></div><div class="rwho"></div><button class="b go" data-nav data-key="rp:go" style="--c:#ff707a">Play</button></div>';
      const row = ui.querySelector('.rfaces');
      friends.forEach((id, i) => {
        const b = h('<button class="rface" data-nav data-key="rp:' + id + '" aria-label="' + esc(ART.mascots[id].name) + '" aria-pressed="' + (i === pickIdx) + '"></button>');
        b.appendChild(faceCanvas(id, 64));
        b.onclick = () => { pickIdx = i; who(); if (D.input.source !== 'mouse') start(friends[pickIdx]); };
        b.addEventListener('focus', () => { pickIdx = i; who(); });
        row.appendChild(b);
      });
      ui.querySelector('[data-key="rp:go"]').onclick = () => start(friends[pickIdx]);
      who();
      const cur = ui.querySelector('[data-key="rp:' + friends[pickIdx] + '"]');
      setTimeout(() => D.nav.focus(cur), 30);
      ctx.legend([['a', 'Play'], ['b', 'Home']]);
    }
    function who() {
      const id = friends[pickIdx], f = D.friends.find((x) => x.id === id);
      const brave = L.NERVE[id] || 17;
      ui.querySelectorAll('.rface').forEach((b, i) => b.setAttribute('aria-pressed', i === pickIdx));
      const el = ui.querySelector('.rwho');
      if (el) el.innerHTML = '<b class="pix">' + esc(f.name) + '</b> <span class="muted">' + esc(f.kind) + '. ' + (brave >= 20 ? 'Brave: keeps rolling for big turns.' : brave <= 13 ? 'Careful: holds early.' : 'Steady: holds around ' + brave + '.') + '</span>';
    }

    // ---- the game -----------------------------------------------------------------------
    function start(id) {
      vs = id; phase = 'play';
      st = { turn: 0, scores: [0, 0], who: 0, bust: false, won: -1 };
      D.state.stats.rollGames = (D.state.stats.rollGames || 0) + 1; D.save();
      drawGame();
      say(1, 'Hi! You go first.');
    }
    function drawGame() {
      const op = D.friends.find((x) => x.id === vs);
      ui.innerHTML = '<div class="rtop"><div class="rp glass" data-p="0"><span class="rpic"></span><div><b>' + esc(meName) + '</b><div class="rbar"><i></i></div><span class="rs pix">0</span></div></div>' +
        '<div class="rgoal pix">First to ' + L.PIG_TARGET + '</div>' +
        '<div class="rp glass" data-p="1"><span class="rpic"></span><div><b>' + esc(op.name) + '</b><div class="rbar"><i></i></div><span class="rs pix">0</span></div><span class="rbub glass" hidden></span></div></div>' +
        '<div class="rmid"><canvas class="rdie" width="34" height="34" aria-label="The die"></canvas><div class="rturn"><span class="muted">This turn</span><b class="pix" id="rt">0</b></div></div>' +
        '<div class="rbot"><p class="rmsg" aria-live="polite"></p><div class="actions"><button class="b go" data-nav data-key="r:roll" style="--c:#ff707a">' + D.glyph('die', 2) + 'Roll</button><button class="b" data-nav data-key="r:hold">Hold</button></div></div>';
      ui.querySelector('[data-p="0"] .rpic').appendChild(faceCanvas(meWho, 52));
      ui.querySelector('[data-p="1"] .rpic').appendChild(faceCanvas(vs, 52));
      ui.querySelector('[data-key="r:roll"]').onclick = () => act('roll');
      ui.querySelector('[data-key="r:hold"]').onclick = () => act('hold');
      ui.querySelector('[data-key="r:roll"]').dataset.sound = 'none';
      ui.querySelector('[data-key="r:hold"]').dataset.sound = 'none';
      drawDie(face, 0);
      update();
      setTimeout(() => D.nav.focus(ui.querySelector('[data-key="r:roll"]')), 30);
      ctx.legend([['a', 'Roll'], ['x', 'Hold'], ['b', 'Home']]);
    }
    const COLS = ['#ff707a', '#f5c431', '#8fd16a', '#7cc4ff', '#d39cf5', '#2bc4b2'];
    function drawDie(f, wob) {
      const c = ui.querySelector('.rdie'); if (!c) return;
      const g = c.getContext('2d'), night = D.night();
      g.clearRect(0, 0, 34, 34);
      const s = 26, x = 4 + Math.round(wob * 2), y = 4 - Math.round(Math.abs(wob) * 3);
      g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(6, 31, 24, 2);
      g.fillStyle = '#2a2833'; g.fillRect(x + 1, y, s - 2, s); g.fillRect(x, y + 1, s, s - 2);
      g.fillStyle = night ? '#ecebe6' : '#ffffff'; g.fillRect(x + 2, y + 1, s - 4, s - 2); g.fillRect(x + 1, y + 2, s - 2, s - 4);
      g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(x + 2, y + s - 4, s - 4, 2);
      G.PIPS[f].forEach(([a, b], i) => { g.fillStyle = f === 1 ? '#ff4d5e' : COLS[i]; g.fillRect(x + Math.round(s * (0.22 + a * 0.28)), y + Math.round(s * (0.22 + b * 0.28)), 4, 4); });
    }
    function update() {
      if (!st) return;
      ['0', '1'].forEach((p) => {
        const el = ui.querySelector('[data-p="' + p + '"]'); if (!el) return;
        el.querySelector('.rs').textContent = st.scores[p];
        el.querySelector('.rbar i').style.width = Math.min(100, st.scores[p] / L.PIG_TARGET * 100) + '%';
        el.classList.toggle('on', st.who === +p && st.won < 0);
      });
      const rt = ui.querySelector('#rt'); if (rt) rt.textContent = st.turn;
      const mine = st.who === 0 && st.won < 0 && !rolling;
      ui.querySelectorAll('.rbot .b').forEach((b) => { b.disabled = !mine; });
      ui.querySelector('[data-key="r:hold"]').disabled = !mine || st.turn === 0;
      const msg = ui.querySelector('.rmsg');
      if (msg && st.won < 0) msg.textContent = st.who === 0 ? (st.turn ? 'Roll again, or hold to keep ' + st.turn + '.' : 'Your turn. Roll the die.') : D.friends.find((x) => x.id === vs).name + ' is thinking…';
    }
    function say(p, text) {
      if (p !== 1) return;
      const b = ui.querySelector('.rbub'); if (!b) return;
      b.textContent = text; b.hidden = false;
      clearTimeout(say.t); say.t = setTimeout(() => { b.hidden = true; }, 1800);
    }
    function roll(then) {
      rolling = true; update();
      ctx.sound.play('rattle');
      const t0 = performance.now(), dur = D.reduced() ? 120 : 620;
      const final = 1 + Math.floor(Math.random() * 6);
      const spin = () => {
        if (paused) { timer = requestAnimationFrame(spin); return; }
        const k = (performance.now() - t0) / dur;
        if (k >= 1) { face = final; drawDie(face, 0); ctx.sound.play('land'); D.S.rumble(80, 0.25); rolling = false; then(final); return; }
        if (Math.floor(k * 14) !== spin.last) { spin.last = Math.floor(k * 14); face = 1 + Math.floor(Math.random() * 6); }
        drawDie(face, Math.sin(k * 18) * (1 - k));
        timer = requestAnimationFrame(spin);
      };
      timer = requestAnimationFrame(spin);
    }
    function act(what) {
      if (!st || st.won >= 0 || rolling || st.who !== 0) return;
      if (what === 'hold' && st.turn === 0) return;
      if (what === 'hold') { ctx.sound.play('hold'); st = L.pigHold(st); afterMove(0); return; }
      ctx.achieve('first-roll');
      roll((f) => {
        st = L.pigStep(st, f);
        if (st.bust) { ctx.sound.play('bust'); ctx.achieve('bust'); flash('A one! Your turn\'s points are gone.'); say(1, 'Ooh, unlucky!'); }
        afterMove(0);
      });
    }
    function afterMove() {
      update();
      if (st.won >= 0) return finish();
      if (st.who === 1) { clearTimeout(aiT); aiT = setTimeout(ai, 900); }
    }
    function ai() {
      if (paused) { aiT = setTimeout(ai, 400); return; }
      if (!st || st.won >= 0 || st.who !== 1) return;
      const choice = L.pigChoice(vs, st.turn, st.scores[1], st.scores[0]);
      if (choice === 'hold' && st.turn > 0) {
        say(1, pick(TALK.hold)); ctx.sound.play('hold');
        st = L.pigHold(st); flash(D.friends.find((x) => x.id === vs).name + ' kept ' + st.scores[1] + '. Your turn.');
        return afterMove();
      }
      if (st.turn === 0 || Math.random() < 0.3) say(1, pick(TALK.roll));
      roll((f) => {
        st = L.pigStep(st, f);
        update();
        if (st.bust) { say(1, pick(TALK.bust)); ctx.sound.play('bust'); flash('They rolled a one. Your turn!'); }
        if (st.won >= 0) return finish();
        if (st.who === 1) aiT = setTimeout(ai, 750); else update();
      });
    }
    function flash(t) { const m = ui.querySelector('.rmsg'); if (m) { m.textContent = t; m.classList.remove('pop'); void m.offsetWidth; m.classList.add('pop'); } }
    function finish() {
      const won = st.won === 0;
      const op = D.friends.find((x) => x.id === vs);
      if (won) { D.state.stats.rollWins = (D.state.stats.rollWins || 0) + 1; ctx.achieve('pig-win'); ctx.sound.play('win'); D.S.rumble(300, 0.6); }
      else ctx.sound.play('bust');
      D.save();
      say(1, pick(won ? TALK.lose : TALK.win));
      const card = h('<div class="rend glass"><h2 class="pix">' + (won ? 'You win!' : esc(op.name) + ' wins') + '</h2><p class="muted">' + st.scores[0] + ' to ' + st.scores[1] + '. You\'ve won ' + D.state.stats.rollWins + ' of ' + D.state.stats.rollGames + '.</p><div class="actions"><button class="b go" data-nav data-key="r:again" style="--c:#ff707a">Play again</button><button class="b" data-nav data-key="r:other">Someone else</button></div></div>');
      card.querySelector('[data-key="r:again"]').onclick = () => start(vs);
      card.querySelector('[data-key="r:other"]').onclick = () => { phase = 'pick'; drawPick(); };
      ui.appendChild(card);
      if (won) confetti();
      setTimeout(() => D.nav.focus(card.querySelector('[data-key="r:again"]')), 40);
      ctx.legend([['a', 'Select'], ['b', 'Home']]);
    }
    function confetti() {
      if (D.reduced()) return;
      const c = h('<canvas class="rconf"></canvas>'); ui.appendChild(c);
      const W = c.width = Math.round(root.clientWidth / 6), H = c.height = Math.round(root.clientHeight / 6), g = c.getContext('2d');
      const bits = Array.from({ length: 90 }, () => ({ x: Math.random() * W, y: -Math.random() * H * 0.5, v: 20 + Math.random() * 40, c: COLS[Math.floor(Math.random() * 6)], s: Math.random() * 6 }));
      const t0 = performance.now();
      const step = (now) => {
        const t = (now - t0) / 1000;
        g.clearRect(0, 0, W, H);
        bits.forEach((b) => { g.fillStyle = b.c; g.fillRect(Math.round(b.x + Math.sin(t * 3 + b.s) * 3), Math.round(b.y + b.v * t), 1 + (b.s > 3), 1 + (b.s > 4.5)); });
        if (t < 3.5 && c.isConnected) requestAnimationFrame(step); else c.remove();
      };
      requestAnimationFrame(step);
    }

    if (phase === 'pick') drawPick(); else start(vs);
    return {
      onAction(a) {
        if (phase === 'play' && st && st.won < 0) {
          if (a === 'a') { act('roll'); return true; }
          if (a === 'x') { act('hold'); return true; }
          if (['up', 'down', 'left', 'right'].includes(a)) return true;
        }
        return false;
      },
      pause() { paused = true; },
      resume() { paused = false; },
      unmount() { cancelAnimationFrame(timer); clearTimeout(aiT); ro.disconnect(); },
    };
  } });
})();
