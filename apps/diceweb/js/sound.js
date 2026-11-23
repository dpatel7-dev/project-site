// Sounds, all made on the spot with the Web Audio API (no sound files):
// little clicks and chimes for the interface, and Dice Radio, which writes
// chiptune songs as it plays. Your own songs play through the same speakers,
// so the pictures can dance to whatever is on.
(function () {
  'use strict';
  const S = {};
  window.DiceSound = S;
  let ctx = null, master, uiBus, musicBus, analyser, pulse, noiseBuf;
  let vol = 0.7, uiOn = true, musicVol = 0.8;

  S.ready = () => !!ctx && ctx.state === 'running';
  S.ctx = () => ctx;
  // Browsers only allow sound after you've pressed something, so this runs on the first key or click.
  S.unlock = function () {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
        uiBus = ctx.createGain(); uiBus.gain.value = uiOn ? 0.9 : 0; uiBus.connect(master);
        musicBus = ctx.createGain(); musicBus.gain.value = musicVol;
        analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.72;
        musicBus.connect(analyser); analyser.connect(master);
        // a 25% pulse wave: the classic chiptune lead
        const n = 32, re = new Float32Array(n), im = new Float32Array(n);
        for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25) * 1.2;
        pulse = ctx.createPeriodicWave(re, im);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { /* no sound, that's all */ }
  };
  S.setVolume = (v) => { vol = v; if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.02); };
  S.setUi = (on) => { uiOn = on; if (uiBus) uiBus.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.02); };
  S.setMusic = (v) => { musicVol = v; if (musicBus) musicBus.gain.setTargetAtTime(v, ctx.currentTime, 0.02); };
  S.bus = () => musicBus;
  S.analyser = () => analyser;

  function tone(f, dur, type, v, at, slide, bus) {
    const t = (at || 0) + ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    if (type === 'pulse') o.setPeriodicWave(pulse); else o.type = type || 'square';
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || uiBus);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, v, freq, at, kind, slideTo, bus) {
    const t = (at || 0) + ctx.currentTime;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    f.type = kind || 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = kind === 'bandpass' ? 1.2 : 0.7;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus || uiBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);
  S.note = NOTE;

  // The interface's sounds.
  S.play = function (name, arg) {
    if (!ctx || ctx.state !== 'running') return;
    try {
      switch (name) {
        case 'move': tone(1500 + (arg === 'left' || arg === 'up' ? -120 : 120), 0.03, 'triangle', 0.05); break;
        case 'select': tone(880, 0.05, 'pulse', 0.05); tone(1320, 0.08, 'pulse', 0.05, 0.045); break;
        case 'back': tone(990, 0.05, 'pulse', 0.045); tone(660, 0.08, 'pulse', 0.045, 0.045); break;
        case 'open': noise(0.14, 0.05, 500, 0, 'bandpass', 2600); tone(520, 0.1, 'triangle', 0.04, 0, 780); break;
        case 'close': noise(0.12, 0.04, 2400, 0, 'bandpass', 500); tone(700, 0.09, 'triangle', 0.035, 0, 480); break;
        case 'tab': tone(1180, 0.04, 'triangle', 0.05); break;
        case 'toast': tone(1568, 0.5, 'sine', 0.06); tone(2349, 0.45, 'sine', 0.035, 0.07); break;
        case 'achieve': [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.16, 'pulse', 0.045, i * 0.06)); tone(3136, 0.6, 'sine', 0.025, 0.24); break;
        case 'error': tone(180, 0.14, 'sawtooth', 0.04); break;
        case 'pip': tone(NOTE([72, 74, 76, 79, 81, 84][arg % 6]), 0.35, 'pulse', 0.05); tone(NOTE([72, 74, 76, 79, 81, 84][arg % 6] + 12), 0.25, 'sine', 0.02, 0.01); break;
        case 'boot': [60, 64, 67, 72].forEach((m) => { tone(NOTE(m), 1.4, 'triangle', 0.045, 0.02); tone(NOTE(m + 12), 1.1, 'sine', 0.015, 0.05); }); break;
        case 'land': tone(150, 0.12, 'sine', 0.12, 0, 70); noise(0.05, 0.06, 900, 0, 'lowpass'); break;
        case 'rattle': for (let i = 0; i < 6; i++) noise(0.03, 0.05, 2000 + Math.random() * 2000, i * 0.07 + Math.random() * 0.03, 'bandpass'); break;
        case 'flap': tone(520, 0.08, 'triangle', 0.05, 0, 900); break;
        case 'point': tone(1046, 0.05, 'pulse', 0.045); tone(1568, 0.1, 'pulse', 0.045, 0.05); break;
        case 'crash': noise(0.35, 0.09, 900, 0, 'lowpass', 120); tone(300, 0.3, 'square', 0.04, 0, 80); break;
        case 'win': [[60, 0], [64, 0.1], [67, 0.2], [72, 0.3], [76, 0.3]].forEach(([m, t]) => tone(NOTE(m), 0.5, 'pulse', 0.04, t)); break;
        case 'bust': tone(440, 0.3, 'sawtooth', 0.035, 0, 180); break;
        case 'hold': tone(660, 0.06, 'triangle', 0.06); tone(880, 0.06, 'triangle', 0.06, 0.06); tone(1320, 0.12, 'triangle', 0.05, 0.12); break;
        case 'wake': [67, 72, 76].forEach((m, i) => tone(NOTE(m), 0.4, 'sine', 0.05, i * 0.08)); break;
        case 'sleep': [76, 72, 67].forEach((m, i) => tone(NOTE(m), 0.4, 'sine', 0.05, i * 0.1)); break;
        case 'type': noise(0.02, 0.025, 3500, 0, 'highpass'); break;
      }
    } catch (e) { /* ignore */ }
  };
  S.rumble = function (ms, strong) {
    for (const p of (navigator.getGamepads ? navigator.getGamepads() : [])) {
      if (p && p.vibrationActuator && p.vibrationActuator.playEffect) {
        try { p.vibrationActuator.playEffect('dual-rumble', { duration: ms || 120, strongMagnitude: strong || 0.5, weakMagnitude: 0.4 }); } catch (e) { /* ignore */ }
      }
    }
  };

  // ---- Music ---------------------------------------------------------------------
  const M = {};
  window.DiceMusic = M;
  const MODES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], mixo: [0, 2, 4, 5, 7, 9, 10], dorian: [0, 2, 3, 5, 7, 9, 10] };
  M.RADIO = [
    { id: 'hills', name: 'Morning Hills', bpm: 116, root: 60, mode: 'major', prog: [0, 4, 5, 3], arp: true, kick: 'half', c: '#8fd16a' },
    { id: 'drive', name: 'Night Drive', bpm: 104, root: 57, mode: 'minor', prog: [0, 5, 2, 6], arp: true, kick: 'four', c: '#6a9be6' },
    { id: 'beach', name: 'Pebble Beach', bpm: 124, root: 62, mode: 'mixo', prog: [0, 6, 3, 0], arp: false, kick: 'half', c: '#7cc4ff' },
    { id: 'garden', name: 'Lofi Garden', bpm: 80, root: 65, mode: 'dorian', prog: [0, 3, 1, 4], arp: false, kick: 'lazy', swing: 0.2, soft: true, c: '#d39cf5' },
    { id: 'cubby', name: 'Cubby\'s Theme', bpm: 136, root: 67, mode: 'major', prog: [0, 3, 4, 0], arp: true, kick: 'four', c: '#ff707a' },
    { id: 'snow', name: 'Snow Day', bpm: 92, root: 64, mode: 'major', prog: [0, 5, 3, 4], arp: true, bells: true, kick: 'lazy', c: '#eef4fa' },
  ];
  M.songs = [];       // your own songs: {id, name, blob}
  M.now = null;       // {kind: 'radio'|'song', i, name, playing}
  const listeners = new Set();
  M.on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  const tell = () => listeners.forEach((fn) => { try { fn(M.now); } catch (e) { /* ignore */ } });

  // Writes a song from a track's settings: a melody for A and B sections that
  // follows the chords, a bass line, arpeggios and drums.
  function compose(tr) {
    const r = DiceGfx.seeded(DiceGfx.hash(tr.id + 'song'));
    const scale = MODES[tr.mode];
    const deg = (d) => tr.root + scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
    const RHYTHMS = [
      [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0], [1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0],
      [1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0], [1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0],
      [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    ];
    const section = () => {
      const bars = [];
      let cur = 7 + Math.floor(r() * 3);
      for (let b = 0; b < 8; b++) {
        const chord = tr.prog[b % 4];
        const rh = RHYTHMS[Math.floor(r() * (tr.soft ? 3 : RHYTHMS.length))];
        const notes = [];
        for (let s = 0; s < 16; s++) {
          if (!rh[s]) { notes.push(null); continue; }
          const strong = s % 4 === 0;
          if (strong) { // land on a note of the chord
            const tones = [chord, chord + 2, chord + 4].map((d) => d + 7);
            cur = tones.reduce((a, d) => (Math.abs(d - cur) < Math.abs(a - cur) ? d : a), tones[0]);
          } else cur += r() > 0.5 ? 1 : -1;
          cur = Math.max(5, Math.min(14, cur));
          notes.push(deg(cur));
        }
        if (b % 4 === 3) { for (let s = 12; s < 16; s++) notes[s] = null; notes[12] = deg(chord + 7); } // breathe at the end of a phrase
        bars.push(notes);
      }
      return bars;
    };
    return { A: section(), B: section(), deg };
  }

  let sched = null, song = null, step = 0, nextAt = 0, bars = 0;
  function voice(m, at, dur, type, v, bus) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    if (type === 'pulse') o.setPeriodicWave(pulse); else o.type = type;
    o.frequency.setValueAtTime(NOTE(m), at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(v, at + 0.008);
    g.gain.exponentialRampToValueAtTime(v * 0.5, at + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(bus);
    o.start(at); o.stop(at + dur + 0.03);
  }
  function drum(kind, at, soft) {
    const k = soft ? 0.6 : 1;
    if (kind === 'kick') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(140, at); o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
      g.gain.setValueAtTime(0.22 * k, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      o.connect(g); g.connect(musicBus); o.start(at); o.stop(at + 0.18);
    } else {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7000 : 1800;
      const d = kind === 'hat' ? 0.03 : 0.12;
      g.gain.setValueAtTime((kind === 'hat' ? 0.04 : 0.09) * k, at); g.gain.exponentialRampToValueAtTime(0.0001, at + d);
      s.connect(f); f.connect(g); g.connect(musicBus); s.start(at, Math.random() * 0.5); s.stop(at + d + 0.02);
    }
  }
  function tick() {
    if (!song) return;
    const ahead = document.hidden ? 1.6 : 0.15;
    const tr = song.tr, spb = 60 / tr.bpm / 4;
    while (nextAt < ctx.currentTime + ahead) {
      const bar = Math.floor(step / 16), s = step % 16;
      const part = Math.floor(bar / 8) % 2 ? song.B : song.A;
      const chord = tr.prog[bar % 4];
      const swing = tr.swing && s % 2 ? spb * tr.swing : 0;
      const at = nextAt + swing;
      const m = part[bar % 8][s];
      if (m) voice(m, at, spb * (tr.soft ? 2.6 : 1.8), tr.bells ? 'sine' : 'pulse', tr.soft ? 0.05 : 0.055, musicBus);
      if (tr.bells && m && s % 4 === 0) voice(m + 12, at, spb * 3, 'sine', 0.02, musicBus);
      if (s % 8 === 0 || (tr.kick === 'four' && s % 4 === 2)) voice(song.deg(chord) - 24 + (s === 8 && tr.kick !== 'lazy' ? 12 : 0), at, spb * 3, 'triangle', 0.16, musicBus);
      if (tr.arp && bar >= 2) voice(song.deg(chord + [0, 2, 4, 7][s % 4]) - (s % 8 < 4 ? 0 : 12), at, spb * 0.9, 'pulse', 0.018, musicBus);
      if (tr.kick === 'four' ? s % 4 === 0 : (s === 0 || s === 10 || (tr.kick === 'half' && s === 8))) drum('kick', at, tr.soft);
      if (s === 4 || s === 12) drum('snare', at, tr.soft);
      if (s % 2 === 0 && !(tr.soft && s % 4)) drum('hat', at, tr.soft);
      nextAt += spb; step++;
      if (s === 15) { bars++; if (bars >= 32) { setTimeout(() => M.next(), 0); return; } }
    }
  }
  function stopRadio() { if (sched) clearInterval(sched); sched = null; song = null; }
  let audio = null, src = null;
  function getAudio() {
    if (!audio) {
      audio = new Audio(); audio.preload = 'auto';
      audio.addEventListener('ended', () => M.next());
      audio.addEventListener('play', tell); audio.addEventListener('pause', tell);
    }
    if (!src && ctx) { try { src = ctx.createMediaElementSource(audio); src.connect(musicBus); } catch (e) { /* ignore */ } }
    return audio;
  }
  let lastUrl = null;
  M.play = function (kind, i) {
    S.unlock();
    if (!ctx) return;
    stopRadio();
    if (audio) audio.pause();
    if (kind === 'radio') {
      const tr = M.RADIO[(i + M.RADIO.length) % M.RADIO.length];
      song = Object.assign({ tr }, compose(tr));
      step = 0; bars = 0; nextAt = ctx.currentTime + 0.08;
      sched = setInterval(tick, 25); tick();
      M.now = { kind, i: M.RADIO.indexOf(tr), name: tr.name, by: 'Dice Radio', c: tr.c, playing: true, started: Date.now() };
    } else {
      const sng = M.songs[(i + M.songs.length) % M.songs.length];
      if (!sng) return;
      const a = getAudio();
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(sng.blob);
      a.src = lastUrl; a.play().catch(() => {});
      M.now = { kind, i: M.songs.indexOf(sng), name: sng.name, by: 'Your songs', c: '#d39cf5', playing: true };
    }
    tell();
    if (window.Dice) Dice.achieve('dj');
  };
  M.pause = function () {
    if (!M.now) return;
    if (M.now.kind === 'radio') { if (sched) { clearInterval(sched); sched = null; } }
    else if (audio) audio.pause();
    M.now.playing = false; tell();
  };
  M.resume = function () {
    if (!M.now) return M.play('radio', 0);
    S.unlock();
    if (M.now.kind === 'radio') { if (!song) return M.play('radio', M.now.i); nextAt = ctx.currentTime + 0.05; if (!sched) sched = setInterval(tick, 25); }
    else if (audio) audio.play().catch(() => {});
    M.now.playing = true; tell();
  };
  M.toggle = () => (M.now && M.now.playing ? M.pause() : M.resume());
  M.next = () => M.play(M.now ? M.now.kind : 'radio', M.now ? M.now.i + 1 : 0);
  M.prev = () => M.play(M.now ? M.now.kind : 'radio', M.now ? M.now.i - 1 : 0);
  M.stop = () => { stopRadio(); if (audio) audio.pause(); M.now = null; tell(); };
  M.progress = () => (M.now && M.now.kind === 'song' && audio && audio.duration ? { t: audio.currentTime, d: audio.duration } : null);
  M.seek = (frac) => { if (audio && audio.duration) audio.currentTime = frac * audio.duration; };

  // How loud each part of the sound is right now, low to high, for pictures that dance.
  let freq = null, lastBass = 0, beatAt = 0;
  M.levels = function (n) {
    if (!analyser || !M.now || !M.now.playing) return null;
    if (!freq) freq = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freq);
    const out = [], top = freq.length * 0.7;
    for (let i = 0; i < n; i++) {
      const a = Math.floor(Math.pow(i / n, 2) * top) + 1, b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / n, 2) * top) + 1);
      let s = 0; for (let k = a; k < b; k++) s += freq[k];
      out.push(Math.min(1, s / (b - a) / 230));
    }
    return out;
  };
  // A beat: the low notes suddenly getting louder.
  M.beat = function () {
    if (!analyser || !M.now || !M.now.playing) return { bass: 0, hit: false };
    if (!freq) freq = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freq);
    const hz = ctx.sampleRate / analyser.fftSize;
    let s = 0, n = 0;
    for (let k = Math.floor(40 / hz); k <= Math.ceil(160 / hz); k++) { s += freq[k]; n++; }
    const bass = s / n / 255;
    const hit = bass - lastBass > 0.08 && performance.now() - beatAt > 180;
    if (hit) beatAt = performance.now();
    lastBass = lastBass * 0.6 + bass * 0.4;
    return { bass, hit };
  };

  // ---- Your songs, kept in the browser's own storage ---------------------------
  const DB = 'diceweb', STORE = 'songs';
  function db() {
    return new Promise((ok, no) => {
      if (!window.indexedDB) return no(new Error('no storage'));
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => ok(req.result); req.onerror = () => no(req.error);
    });
  }
  function tx(mode, fn) {
    return db().then((d) => new Promise((ok, no) => {
      const t = d.transaction(STORE, mode), st = t.objectStore(STORE);
      const out = fn(st);
      t.oncomplete = () => ok(out && out.result !== undefined ? out.result : out); t.onerror = () => no(t.error);
    }));
  }
  M.load = function () {
    return tx('readonly', (st) => st.getAll()).then((all) => { M.songs = (all || []).sort((a, b) => a.added - b.added); tell(); return M.songs; }).catch(() => M.songs);
  };
  M.add = function (files) {
    const list = [...files].filter((f) => /^audio\//.test(f.type) || /\.(mp3|m4a|wav|ogg|flac|aac|opus)$/i.test(f.name));
    if (!list.length) return Promise.resolve(0);
    const now = Date.now();
    const items = list.map((f, i) => ({ id: now + '-' + i + '-' + f.name, name: f.name.replace(/\.[^.]+$/, ''), blob: f, added: now + i }));
    return tx('readwrite', (st) => items.forEach((it) => st.put(it))).then(() => M.load()).then(() => items.length)
      .catch(() => { M.songs = M.songs.concat(items); tell(); return items.length; });
  };
  M.remove = function (id) {
    if (M.now && M.now.kind === 'song' && M.songs[M.now.i] && M.songs[M.now.i].id === id) M.stop();
    return tx('readwrite', (st) => st.delete(id)).then(() => M.load()).catch(() => { M.songs = M.songs.filter((s) => s.id !== id); tell(); });
  };
  M.clear = () => tx('readwrite', (st) => st.clear()).then(() => M.load()).catch(() => {});
})();
