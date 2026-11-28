// Deuce: Dice's voice assistant (two pips, like the deuce on a die).
//
// Hold the microphone button on the air mouse (or press the Deuce button at the top, or type
// to it) and say what you want:
//   "put on the Knicks game"   finds the game (ESPN's scoreboard), which channel has it, the way
//                              you can watch that channel (DAZN for MSG, your antenna for ABC…),
//                              and opens it
//   "put on MSG", "channel 7", "open Netflix", "play lofi on YouTube", "switch to the PlayStation",
//   "turn it up", "set a timer for 10 minutes", "wake me up at 7", "what's the weather"…
// Understanding what you said happens right here (js/deucebrain.js), not in a cloud AI. On DiceOS
// it hears with Vosk, on the computer itself; in a browser, with the browser's own listening.
(function () {
  'use strict';
  const D = window.Dice, B = window.DeuceBrain, h = D.h, esc = D.esc, S = D.S, M = D.M;
  if (!B) return;
  const DU = D.deuce = { on: false };
  const cfg = () => (D.state.deuce && typeof D.state.deuce === 'object' ? D.state.deuce : (D.state.deuce = { on: true, talk: true }));
  DU.cfg = cfg;
  const front = () => (D.sys && D.sys.status && D.sys.status.front) || null;
  // On the desktop, Deuce for PC (js/deucepc.js) shows things instead of the TV's panel
  let pc = null;
  DU.attachPC = (p) => { pc = p; };
  const usePC = () => !!(pc && D.desk && D.desk.on);
  DU.usePC = usePC;

  // ---- the panel ----------------------------------------------------------------------------------
  let el = null, heardEl, sayEl, cardEl, inEl, cdT = 0;
  const pips = '<span class="du-die" aria-hidden="true"><i></i><i></i></span>';
  const talkBtn = '<button class="du-die du-talk" data-nav data-key="du:talk" aria-label="Talk to Deuce"><i></i><i></i></button>';
  function build() {
    el = h('<div id="deuce" aria-live="polite" aria-label="Deuce"><div class="du-box glass">' +
      '<div class="du-top">' + talkBtn + '<div class="du-words"><span class="du-name">Deuce</span><b class="du-heard"></b><span class="du-say"></span></div></div>' +
      '<div class="du-card" hidden></div>' +
      '<form class="du-type"><input class="du-in" data-nav data-key="du:in" placeholder="Type it: put on the Knicks game" autocomplete="off" spellcheck="false" enterkeyhint="go" aria-label="Ask Deuce"><button class="b small" data-nav data-key="du:go">Ask</button></form>' +
      '</div></div>');
    document.body.appendChild(el);
    heardEl = el.querySelector('.du-heard'); sayEl = el.querySelector('.du-say'); cardEl = el.querySelector('.du-card'); inEl = el.querySelector('.du-in');
    el.querySelector('form').onsubmit = (e) => { e.preventDefault(); const t = inEl.value.trim(); if (t) { inEl.value = ''; DU.ask(t); } };
    el.querySelector('.du-talk').onclick = () => (phase() === 'listen' ? DU.stop() : DU.listen());
    el.addEventListener('pointerdown', (e) => { if (e.target === el) DU.hide(); });
  }
  const phase = (p) => { if (usePC()) return pc.phase(p); if (p === undefined) return el ? el.dataset.phase : ''; el.dataset.phase = p; };
  const heard = (t) => { if (usePC()) pc.heard(t); else heardEl.textContent = t; };
  const status = (t) => { if (DU.capturing) return; if (usePC()) pc.status(t); else sayEl.textContent = t; };
  DU.status = (t) => { if (usePC()) pc.status(t); else if (sayEl) { phase('think'); sayEl.textContent = t; } };
  DU.pcPanel = () => (usePC() ? pc : null);
  // words appearing as Deuce's brain thinks of them (not spoken until the end)
  DU.stream = (t) => { if (usePC()) pc.stream(t); else if (sayEl) { phase('answer'); sayEl.textContent = t; } };
  DU.show = function () {
    if (usePC()) { pc.show(); return; }
    if (!DU.on) D.emit('deuce-open');
    if (!el) build();
    if (D.ambient && D.ambient.on) D.ambient.exit();
    if (!DU.on) { DU.prev = D.nav.el; S.play('open'); }
    DU.on = true;
    el.classList.add('on', 'navtrap');
    if (D.legend) D.legend.update && D.legend.update();
  };
  DU.hide = function () {
    if (pc && pc.isOpen()) pc.hide();
    if (!DU.on) return;
    clearTimeout(cdT); cdT = 0;
    DU.stop(true);
    DU.on = false;
    if (DU.doneT) clearTimeout(DU.doneT);
    clearTimeout(laterT); // (Back before it happens: it doesn't)
    el.classList.remove('on', 'navtrap');
    S.play('close');
    if (DU.prev && DU.prev.isConnected) D.nav.focus(DU.prev, { scroll: false });
  };
  function clear() { if (usePC()) return; heardEl.textContent = ''; sayEl.textContent = ''; cardEl.hidden = true; cardEl.replaceChildren(); clearTimeout(cdT); cdT = 0; clearTimeout(laterT); }
  // something Deuce does in a moment (after you've seen what it heard); a new question cancels it
  let laterT = 0;
  const later = (fn, ms) => { clearTimeout(laterT); laterT = setTimeout(fn, ms); };
  // say something (and out loud, if Deuce talks)
  function say(text, card) {
    // Deuce's brain (js/deucemind.js) running a command: what it says goes back to the brain, cards still show
    if (DU.capturing) { if (text) DU.capturing.said.push(text); if (card) DU.capturing.cards.push(card); return; }
    DU.lastSaid = text;
    if (usePC()) { pc.say(text, card); talk(text); return; }
    phase('answer');
    sayEl.textContent = text;
    cardEl.replaceChildren();
    cardEl.hidden = !card;
    if (card) { cardEl.appendChild(card); const first = card.querySelector('[data-first]') || card.querySelector('[data-nav]'); if (first && DU.on) D.nav.focus(first); }
    else if (DU.on) D.nav.focus(el.querySelector('.du-talk'));
    talk(text);
  }
  DU.talk = (text) => talk(text);
  function talk(text) {
    if (!cfg().talk || !text) return;
    // DiceOS speaks it itself (so it's heard with an app on top, too)
    if (D.sys && !D.sys.info.emulated) { D.sys.post('/api/voice', { action: 'say', text }); return; }
    try { if ('speechSynthesis' in window) { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1.04; u.pitch = 1.05; speechSynthesis.speak(u); } } catch (e) { /* no voice here */ }
  }
  // buttons in an answer
  function card(title, sub, buttons, extra) {
    const c = h('<div class="du-res"><div class="du-rt"><b></b><span></span></div><div class="du-acts" data-row></div></div>');
    c.querySelector('b').textContent = title || '';
    c.querySelector('.du-rt span').textContent = sub || '';
    if (!title && !sub) c.querySelector('.du-rt').remove();
    if (extra) c.insertBefore(extra, c.querySelector('.du-acts'));
    (buttons || []).forEach((b, i) => {
      const el2 = h('<button class="b ' + (b.go ? 'go' : '') + '" data-nav data-key="du:b' + i + '"' + (i === 0 ? ' data-first' : '') + '>' + (b.icon ? D.glyph(b.icon, 2) : '') + '<span>' + esc(b.label) + '</span></button>');
      el2.onclick = () => { clearTimeout(cdT); cdT = 0; b.run(); };
      c.querySelector('.du-acts').appendChild(el2);
    });
    return c;
  }
  // "Opening DAZN in 3…": the answer does itself unless you stop it
  function countdown(btnIndex, secs, run) {
    const b = (usePC() ? pc.root() : cardEl).querySelector('[data-key="du:b' + btnIndex + '"] span');
    if (!b) return run();
    const label = b.textContent;
    let n = secs;
    const step = () => {
      if (!(usePC() ? pc.isOpen() : DU.on) && !front()) return;
      if (n <= 0) { cdT = 0; b.textContent = label; run(); return; }
      b.textContent = label + ' in ' + n;
      n--; cdT = setTimeout(step, 1000);
    };
    step();
  }

  // ---- listening ---------------------------------------------------------------------------------
  let how = '', rec = null, gotText = false, downAt = 0;
  DU.listen = async function () {
    if (!cfg().on) return D.toast({ icon: 'help', c: '#96969f', title: 'Deuce is off', text: 'Turn it on in Settings, Deuce.' });
    gotText = false;
    if (usePC()) { pc.show(); pc.listening(); } else {
      DU.show(); clear(); phase('listen');
      sayEl.textContent = 'Listening…';
      D.nav.focus(el.querySelector('.du-talk'));
    }
    if (D.sys && D.sys.status && D.sys.status.voice) {
      const r = await D.sys.post('/api/voice', { action: 'start' });
      if (r && r.ok) { how = 'os'; return; }
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    // (DiceOS's Chromium can't use the browser's listening: it has no Google speech service)
    if (SR && (!D.sys || D.sys.info.emulated)) {
      try {
        rec = new SR();
        rec.lang = navigator.language || 'en-US'; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
        rec.onresult = (e) => {
          let t = '', fin = false;
          for (let i = e.resultIndex; i < e.results.length; i++) { t += e.results[i][0].transcript; if (e.results[i].isFinal) fin = true; }
          heard(t);
          if (fin) { gotText = true; how = ''; DU.ask(t); }
        };
        rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') typeIt('Deuce needs your microphone: allow it in the browser, or type it.'); else if (e.error === 'no-speech') typeIt('I didn\'t hear anything. Try again, or type it.'); else if (e.error !== 'aborted') typeIt('Listening didn\'t work here (' + e.error + '). Type it instead.'); };
        rec.onend = () => { if (how === 'web' && !gotText && phase() === 'listen') typeIt('I didn\'t catch that. Try again, or type it.'); how = ''; };
        rec.start(); how = 'web';
        return;
      } catch (e) { rec = null; }
    }
    how = '';
    typeIt(D.sys ? 'Deuce can\'t hear yet. Set up its hearing in Settings, Deuce (it needs a microphone). Or type it here.' : 'This browser can\'t listen. Type it here.', !!D.sys);
  };
  DU.stop = function (quiet) {
    if (how === 'os') D.sys.post('/api/voice', { action: 'stop' });
    else if (how === 'web' && rec) { try { quiet ? rec.abort() : rec.stop(); } catch (e) { /* already stopped */ } }
    if (quiet) how = '';
  };
  function typeIt(text, setup) {
    if (usePC()) { pc.say(text, setup ? card('', '', [{ label: 'Set up Deuce\'s hearing', icon: 'gear', go: true, run: () => { DU.hide(); D.launch('settings', { arg: 'deuce' }); } }]) : null); pc.typing(); return; }
    phase('answer');
    sayEl.textContent = text;
    cardEl.hidden = true;
    if (setup) { const c = card('', '', [{ label: 'Set up Deuce\'s hearing', icon: 'gear', go: true, run: () => { DU.hide(); D.launch('settings', { arg: 'deuce' }); } }]); cardEl.replaceChildren(c); cardEl.hidden = false; }
    D.nav.focus(inEl, { keepTyping: true });
    try { inEl.focus(); } catch (e) { /* not on screen */ }
  }
  // what DiceOS heard (diced's dice-listen, with Vosk)
  D.on('voice', (v) => {
    if (how !== 'os') return;
    if (v.partial) { heard(v.partial); return; }
    if ('text' in v) { how = ''; if (v.text) { gotText = true; DU.ask(v.text); } else typeIt('I didn\'t hear anything. Try again, or type it.'); return; }
    if (v.error) { how = ''; typeIt(v.error); }
  });
  // the remote's microphone: hold it and talk (a quick press listens till you stop talking)
  D.on('voicekey', (down) => {
    if (!cfg().on) return;
    if (down) { downAt = Date.now(); if (DU.on && phase() === 'listen') { DU.stop(); return; } DU.listen(); return; }
    if (Date.now() - downAt > 600 && how) DU.stop();
  });
  // in a browser, a remote's search or assistant key (DiceOS reads those itself)
  const VKEYS = /^(BrowserSearch|LaunchAssistant|MicrophoneToggle|VoiceDial|MediaRecord)$/;
  D.keyFirst.push((e) => {
    if (!VKEYS.test(e.key) || (D.sys && D.sys.status && D.sys.status.remote_keys)) return false;
    e.preventDefault();
    if (!e.repeat) D.emit('voicekey', true);
    return true;
  });
  addEventListener('keyup', (e) => { if (VKEYS.test(e.key) && !(D.sys && D.sys.status && D.sys.status.remote_keys)) D.emit('voicekey', false); });
  // Back closes it; Search (or Y) listens again
  const fire0 = D.input.fire;
  D.input.fire = function (a, src) {
    if (DU.on && !D.$('#osk.open') && !D.$('#dialog.open')) {
      if (a === 'b' || a === 'home') { DU.hide(); return; }
      if (a === 'search' || a === 'y') { if (phase() === 'listen') DU.stop(); else DU.listen(); return; }
    }
    return fire0.call(D.input, a, src);
  };

  // ---- understanding and doing ---------------------------------------------------------------------------
  DU.ask = async function (text) {
    DU.show();
    clear();
    if (usePC()) pc.asked(text);
    else { heardEl.textContent = text; sayEl.textContent = ''; }
    phase('think');
    let it;
    const ctx = { inputs: Object.values(D.state.inputNames || {}) };
    try { it = B.understand(text, new Date(), ctx); } catch (e) { it = { kind: 'unknown', q: text }; }
    // two or more things at once, each one Deuce knows: do them in turn
    if (['unknown', 'ask', 'web'].includes(it.kind) && B.split) {
      const its = B.split(text, new Date(), ctx);
      if (its) { DU.last = its[its.length - 1]; return DU.many(its); }
    }
    // Deuce's brain (a language model on this computer) takes what the rules don't understand,
    // questions, follow-ups and anything said at length
    if (DU.mind && (await DU.mind.wants(text, it))) { DU.last = it; return DU.mind.run(text, it); }
    DU.last = it;
    const fn = (usePC() && pc.DO[it.kind]) || DO[it.kind] || DO.unknown;
    DU.lastSaid = '';
    try { await fn(it); } catch (e) { say('Something went wrong doing that. Try again?'); }
    // the brain hears about it too, so "and tomorrow?" makes sense afterwards
    if (DU.mind && DU.mind.note) DU.mind.note(text, DU.lastSaid);
  };
  // run an understood command and hand back what Deuce said about it (for the brain, and for "this and that")
  DU.run = async function (it) {
    const prev = DU.capturing, cap = DU.capturing = { said: [], cards: [] };
    try { await ((usePC() && pc.DO[it.kind] && it.kind !== 'ask' && it.kind !== 'unknown' && it.kind !== 'help') ? pc.DO[it.kind] : DO[it.kind] || DO.unknown)(it); }
    catch (e) { cap.said.push('That didn\'t work: ' + (e.message || 'something went wrong') + '.'); }
    finally { DU.capturing = prev; }
    return cap;
  };
  DU.many = async function (its) {
    const said = [], cards = [];
    for (const it of its) { const r = await DU.run(it); said.push(...r.said); cards.push(...r.cards); }
    const box = cards.length ? h('<div class="du-many"></div>') : null;
    cards.forEach((c) => box.appendChild(c));
    say(said.join(' ') || 'Done.', box);
    if (DU.mind && DU.mind.note) DU.mind.note(its.map((x) => x.text).join(' and '), said.join(' '));
  };
  const pct = (v) => Math.round(v * 100);
  const timeWords = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const dayWords = (d) => {
    const now = new Date(), a = new Date(now.getFullYear(), now.getMonth(), now.getDate()), b = new Date(d.getFullYear(), d.getMonth(), d.getDate()), days = Math.round((b - a) / 864e5);
    return days === 0 ? (d.getHours() >= 17 ? 'tonight' : 'today') : days === 1 ? 'tomorrow' : days === -1 ? 'yesterday' : days > 1 && days < 7 ? d.toLocaleDateString([], { weekday: 'long' }) : d.toLocaleDateString([], { month: 'long', day: 'numeric' });
  };
  const dur = (ms) => { const m = Math.round(ms / 60000); if (ms < 60000) return Math.round(ms / 1000) + ' seconds'; if (m < 60) return m + (m === 1 ? ' minute' : ' minutes'); const hh = Math.floor(m / 60), mm = m % 60; return hh + (hh === 1 ? ' hour' : ' hours') + (mm ? ' and ' + mm + ' minutes' : ''); };
  const APP_IDS = { calc: 'calculator' };

  const DO = {
    none: () => typeIt('I didn\'t hear anything. Try again, or type it.'),
    cancel: () => DU.hide(),
    help: () => say('Here are some things to try. Hold the microphone button while you talk.', helpCard()),
    back: () => { DU.hide(); D.input.fire('b', 'remote'); },
    home: async () => { DU.hide(); if (front()) await D.sys.post('/api/apps', { action: 'close' }); D.input.fire('home', 'remote'); },
    power: (it) => {
      if (it.act === 'standby') { say('Turning off. The power button brings me back.'); later(() => { DU.hide(); if (D.sys) D.standby(); else D.sleep(); }, 1600); return; }
      if (!D.sys) return say('That one\'s for DiceOS, on the TV.');
      DU.hide(); D.sys.power(it.act);
    },
    picture: () => { DU.hide(); D.tools.pictureOff(); },
    volume: (it) => {
      if (D.sys) {
        const v = (D.sys.status && D.sys.status.volume) || { level: 0.5, muted: false };
        if (it.mute !== undefined) v.muted = it.mute;
        else { v.level = Math.max(0, Math.min(1, it.level !== undefined ? it.level : v.level + it.delta)); v.muted = false; }
        D.sys.post('/api/volume', it.mute !== undefined ? { muted: v.muted } : { level: v.level, muted: false });
        if (D.remote) D.remote.osd(v.muted ? 'mute' : 'volume', v.muted ? 'Muted' : 'Volume ' + pct(v.level), v.muted ? 0 : v.level);
        return done(v.muted ? 'Muted.' : 'Volume ' + pct(v.level) + '.');
      }
      let v = typeof D.state.volume === 'number' ? D.state.volume : 0.8;
      if (it.mute !== undefined) D.state.muted = it.mute; else { v = Math.max(0, Math.min(1, it.level !== undefined ? it.level : v + it.delta)); D.state.volume = v; D.state.muted = false; }
      D.save(); if (S.setVolume) S.setVolume(D.state.muted ? 0 : v);
      return done(D.state.muted ? 'Muted.' : 'Volume ' + pct(v) + '.');
    },
    media: (it) => {
      if (front()) return say('Use the play button on the remote in ' + front().name + '.');
      if (it.act === 'pause' || it.act === 'stop') { if (M.now && M.now.playing) M.toggle(); return done(it.act === 'stop' ? 'Stopped.' : 'Paused.'); }
      if (it.act === 'play') { if (M.now) { if (!M.now.playing) M.toggle(); } else M.play('radio', 0); return done('Playing.'); }
      if (D.input) D.input.fire(it.act === 'next' ? 'rb' : 'lb', 'remote');
      return done(it.act === 'next' ? 'Next.' : 'Back one.');
    },
    timer: (it) => {
      const T = D.timer;
      if (!T) return say('The timer is in Clock.');
      if (!it.ms) { T.running = false; T.left = 0; D.emit('timer'); return done('Timer cancelled.'); }
      T.total = T.left = it.ms; T.running = true; T.end = Date.now() + it.ms; D.emit('timer');
      return done('Timer set for ' + dur(it.ms) + '.');
    },
    sleep: (it) => { D.tools.setSleep(it.mins); return done('Going to sleep in ' + it.mins + ' minutes.'); },
    alarm: (it) => {
      if (!D.alarm) return say('Alarms are in Clock.');
      const a = { id: Date.now().toString(36), time: it.time, days: it.days || [], wake: 'radio', on: true, label: '' };
      // "7" without am or pm is the next 7 coming
      const list = D.alarm.list(); list.push(a); list.sort((x, y) => x.time.localeCompare(y.time)); D.save(); D.emit('alarms');
      const n = D.alarm.next(a);
      return say('Alarm set for ' + D.alarm.t12(a.time) + (n ? ', ' + dayWords(n) : '') + (a.days.length ? ', ' + D.alarm.daysText(a).toLowerCase() : '') + '. The TV turns on for it.',
        card('', '', [{ label: 'Done', go: true, run: () => DU.hide() }, { label: 'Undo', run: () => { const i = list.indexOf(a); if (i >= 0) list.splice(i, 1); D.save(); D.emit('alarms'); done('Alarm taken off.'); } }]));
    },
    time: (it) => {
      if (!it.tz) return done('It\'s ' + timeWords(new Date()) + '.', 4000);
      const there = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: it.tz }), day = new Date().toLocaleDateString([], { weekday: 'long', timeZone: it.tz });
      const here = new Date().toLocaleDateString([], { weekday: 'long' });
      return done('It\'s ' + there + (day !== here ? ' on ' + day : '') + ' in ' + it.place + '.', 5000);
    },
    // sums and conversions, worked out exactly (js/deucecalc.js)
    calc: (it) => {
      const r = window.DeuceCalc && window.DeuceCalc.eval(it.expr);
      if (!r) return say('I couldn\'t work that one out. Try writing it like "15% of 80" or "5 miles in km".');
      if (!r.ok) return say(r.text);
      return say(/ is /.test(r.text) ? r.text : 'That\'s ' + r.text + '.', card(r.text.replace(/\.$/, ''), String(it.expr).replace(/^\s*(what'?s|what is|whats|calculate|convert)\s+/i, '').replace(/[?]$/, ''), [
        { label: 'Copy', icon: 'copy', run: () => { try { navigator.clipboard.writeText(String(Math.round(r.value * 1e8) / 1e8)); D.toast({ icon: 'copy', c: '#4b7bec', title: 'Copied', text: String(Math.round(r.value * 1e8) / 1e8) }); } catch (e) { /* no clipboard here */ } } }]));
    },
    until: (it) => {
      const when = new Date(it.at).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
      if (it.days === 0) return say('That\'s today, ' + when + '.');
      const w = it.days >= 14 ? ' (' + Math.floor(it.days / 7) + ' weeks' + (it.days % 7 ? ' and ' + (it.days % 7) + (it.days % 7 === 1 ? ' day' : ' days') : '') + ')' : '';
      return say(it.days + (it.days === 1 ? ' day' : ' days') + w + ' until ' + it.what.replace(/^(christmas|halloween|easter|thanksgiving)/i, (s) => s[0].toUpperCase() + s.slice(1)) + ', on ' + when + '.');
    },
    // "good morning": the day in one go
    brief: async () => {
      const now = new Date(), hr = now.getHours(), name = D.state.name && D.state.name !== 'player' ? ', ' + D.state.name : '';
      const bits = [(hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening') + name + '. It\'s ' + now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) + '.'];
      const rows = h('<ul class="du-brief"></ul>');
      const add = (icon, title, text) => { const li = h('<li>' + D.glyph(icon, 2) + '<div><b></b><span></span></div></li>'); li.querySelector('b').textContent = title; li.querySelector('span').textContent = text; rows.appendChild(li); };
      const p = (D.state.home && D.state.home.place) || (D.state.st && D.state.st.place);
      if (p && D.weather) {
        try {
          const u = (D.state.st && D.state.st.units) || (/^en-US$/i.test(navigator.language || '') ? 'f' : 'c'), d = await D.weather.get(p.lat, p.lon, u), w = D.weather.words(d.code).text.toLowerCase();
          bits.push('It\'s ' + d.t + '° and ' + w + ', with a high of ' + d.hi + '°.');
          add('sun', 'Weather in ' + p.name, d.t + '°, ' + w + '. High ' + d.hi + '°, low ' + d.lo + '°.');
        } catch (e) { /* no weather just now */ }
      }
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
      const today = R.upcoming().filter((r) => r.at < end);
      if (today.length) { bits.push('You have ' + today.length + (today.length === 1 ? ' reminder' : ' reminders') + ' today.'); today.slice(0, 4).forEach((r) => add('bell', r.what.replace(/^./, (c) => c.toUpperCase()), whenWords(r.at))); }
      const key = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      const due = ((D.state.axiom || {}).tasks || []).filter((t) => !t.done && t.due && t.due <= key);
      if (due.length) { bits.push(due.length + (due.length === 1 ? ' thing is' : ' things are') + ' due.'); due.slice(0, 3).forEach((t) => add('timer', t.title || t.name || 'A task', t.due < key ? 'Overdue' : 'Due today')); }
      if (!today.length && !due.length) bits.push('Nothing\'s due and there are no reminders.');
      const mode = D.modes && D.modes.current && D.modes.current();
      if (mode) add('spark', mode.name + ' mode is on', 'Say "end ' + mode.name.toLowerCase() + ' mode" to stop it.');
      return say(bits.join(' '), rows.children.length ? rows : null);
    },
    date: () => done('It\'s ' + new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) + '.', 4000),
    weather: async (it) => {
      const p = (D.state.home && D.state.home.place) || (D.state.st && D.state.st.place);
      if (!p || !D.weather) return say('Which town are you in? Set it once and I\'ll know.', card('', '', [{ label: 'Set my town', icon: 'sun', go: true, run: () => { DU.hide(); D.tv.askTown(); } }]));
      status('Looking…');
      try {
        const u = (D.state.st && D.state.st.units) || (/^en-US$/i.test(navigator.language || '') ? 'f' : 'c');
        const d = await D.weather.get(p.lat, p.lon, u);
        if (it.tomorrow && d.daily && d.daily.time && d.daily.time[1]) {
          const w = D.weather.words(d.daily.weather_code[1]).text.toLowerCase();
          return say('Tomorrow in ' + p.name + ': ' + w + ', with a high of ' + Math.round(d.daily.temperature_2m_max[1]) + '° and a low of ' + Math.round(d.daily.temperature_2m_min[1]) + '°.', card('', '', [{ label: 'Open Weather', icon: 'sun', run: () => { DU.hide(); D.launch('weather'); } }]));
        }
        const w = D.weather.words(d.code).text.toLowerCase();
        return say('It\'s ' + d.t + '° and ' + w + ' in ' + p.name + '. High ' + d.hi + '°, low ' + d.lo + '°.', card('', '', [{ label: 'Open Weather', icon: 'sun', run: () => { DU.hide(); D.launch('weather'); } }]));
      } catch (e) { return say('I couldn\'t get the weather. Is the internet on?'); }
    },
    inputs: () => { DU.hide(); if (D.inputs) D.inputs.open(); },
    guide: () => { DU.hide(); if (D.inputs && D.inputs.guide) D.inputs.guide(); else say('Inputs is on DiceOS.'); },
    input: async (it) => {
      if (!D.inputs || !D.sys) return say('Switching the TV\'s inputs works on DiceOS, plugged into the TV.');
      if (it.dice) { if (D.inputs.away) D.inputs.back(); else if (D.sys) D.sys.post('/api/cec', { action: 'back' }); return done('Here I am.'); }
      status('Looking for the ' + it.name + '…');
      const r = await D.inputs.find(it);
      if (!r.ok) return say(r.error, card('', '', [{ label: 'See all the inputs', icon: 'tv', go: true, run: () => { DU.hide(); D.inputs.open(); } }]));
      say('Switching to ' + (r.device.name || it.name) + '. Home comes back.');
      later(() => { DU.hide(); D.inputs.go(r.device); }, 900);
    },
    channel: async (it) => {
      const W = D.watch;
      if (!W) return say('TV channels aren\'t here yet.');
      if (it.num) {
        const list = await W.lineup(), hit = list && list.find((x) => x.num === it.num || x.num.split('.')[0] === it.num);
        if (hit) { say('Channel ' + hit.num + ', ' + hit.name + '.'); later(() => { DU.hide(); W.antenna(hit); }, 900); return; }
        const c = W.CHANNELS[parseInt(it.num, 10) - 1];
        if (!c) return say('There\'s no channel ' + it.num + '.' + (W.tuner() ? '' : ' Add an antenna tuner in TV setup for your local channels.'));
        it = { id: c.id };
      }
      await W.lineup();
      const c = W.channel(it.id), ways = W.ways(it.id);
      if (!ways.length) return say((c ? c.name : 'That channel') + ' needs a live TV service. Which one do you have?', card('', '', [{ label: 'TV setup', icon: 'gear', go: true, run: () => { DU.hide(); W.setup(); } }]));
      return offer(c ? c.name : it.id, c && c.line ? c.line : '', ways, '', true, c ? c.name : '');
    },
    game: (it) => game(it),
    search: (it) => {
      if (it.app.startsWith('dice:')) return DO.app({ id: it.app });
      const s = D.watch && D.watch.SVC[it.app];
      if (!s) return DO.unknown(it);
      say((it.play ? 'Playing ' : 'Looking for ') + it.q + ' on ' + s.name + '.');
      later(() => { DU.hide(); D.watch.find(it.app, it.q); }, 900);
    },
    app: (it) => {
      const id = it.id;
      if (id.startsWith('dice:')) {
        const a = id.slice(5);
        if (a === 'inputs') return DO.inputs();
        if (a === 'guide') { DU.hide(); D.shell.go('home'); setTimeout(() => { const t = D.$('#chrow [data-nav]'); if (t) D.nav.focus(t); }, 120); return; }
        const app = D.app(APP_IDS[a] || a);
        if (!app) return say('That isn\'t on this ' + (D.sys ? 'TV' : 'computer') + '.');
        if (app.pc && !(D.desk && D.desk.on)) return say(app.name + ' is on the desktop. Switch to it in the menu.');
        DU.hide(); D.launch(app.id); return;
      }
      const s = D.watch && D.watch.SVC[id];
      if (!s) return DO.unknown(it);
      say('Opening ' + s.name + '.');
      later(() => { DU.hide(); D.watch.open(id); }, 700);
    },
    music: () => { M.play('radio', 0); done('Here\'s Dice Radio.'); },
    files: (it) => { DU.hide(); D.launch('files', { arg: 'find:' + it.q }); },
    // ---- reminders, the Notebook, notes ----
    remind: (it) => {
      if (!it.what) return say('What should I remind you about? Say it like "remind me to call Mom at 6".');
      if (it.on) {
        const r = DU.reminders.add(it.what, 0, it.on);
        return say('OK. I\'ll remind you to ' + it.what + ' ' + R.when(r) + '.', card('', '', [{ label: 'Done', go: true, run: () => DU.hide() }, { label: 'Undo', run: () => { DU.reminders.remove(r.id); done('Reminder taken off.'); } }]));
      }
      if (!it.at) {
        const at = (ms) => () => { DU.reminders.add(it.what, ms); done('OK. I\'ll remind you to ' + it.what + ' ' + whenWords(ms) + '.'); };
        const d = new Date(), tonight = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 20).getTime(), morning = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 9).getTime();
        return say('When should I remind you to ' + it.what + '?', card('', '', [{ label: 'In 10 minutes', go: true, run: at(Date.now() + 600000) }, { label: 'In an hour', run: at(Date.now() + 3600000) },
          tonight > Date.now() + 600000 ? { label: 'Tonight at 8', run: at(tonight) } : null, { label: 'Tomorrow at 9', run: at(morning) }].filter(Boolean)));
      }
      const r = DU.reminders.add(it.what, it.at);
      return say('OK. I\'ll remind you to ' + it.what + ' ' + whenWords(it.at) + '.', card('', '', [{ label: 'Done', go: true, run: () => DU.hide() }, { label: 'Undo', run: () => { DU.reminders.remove(r.id); done('Reminder taken off.'); } }]));
    },
    remember: (it) => {
      if (it.secret) return say('I don\'t keep passwords, codes or card numbers. A password manager is the safe place for those.');
      if (it.name) { D.set('name', it.name); D.emit('name'); }
      DU.notebook.add(it.fact);
      return done(it.name ? 'Nice to meet you, ' + it.name + '. I\'ll call you that.' : 'Got it. I\'ll remember ' + it.fact.replace(/^my /, 'your ').replace(/\bi am\b|\bim\b/, 'you\'re').replace(/\bi\b/g, 'you') + '.');
    },
    forget: (it) => {
      if (!it.fact) return say('Forget everything in your Notebook?', card('', '', [{ label: 'Forget it all', go: true, run: () => { DU.notebook.clear(); done('Done. Your Notebook is empty.'); } }, { label: 'Keep it', run: () => DU.hide() }]));
      const n = DU.notebook.forget(it.fact);
      return done(n ? 'Forgotten.' : 'I didn\'t have that written down.');
    },
    notebook: () => {
      const nb = DU.notebook.get(), bits = [];
      if (D.state.name && D.state.name !== 'player') bits.push('your name is ' + D.state.name);
      if (nb.teams.length) bits.push('you follow the ' + nb.teams.join(', the '));
      const place = (D.state.st && D.state.st.place) || (D.state.home && D.state.home.place);
      if (place) bits.push('you\'re near ' + place.name);
      nb.facts.slice(-4).forEach((f) => bits.push(f.t.replace(/^my /, 'your ')));
      return say(bits.length ? 'Here\'s what I know: ' + bits.join('; ') + '. It stays on this computer.' : 'Nothing yet. Tell me things like "remember that my locker is 42" or "my favorite team is the Knicks".',
        card('', '', [{ label: 'Open the Notebook', go: true, run: () => { if (usePC()) pc.tab('notebook'); else DU.hide(); } }]));
    },
    note: (it) => {
      const L = D.L, dir = D.home() + '/notes';
      if (!L.walk(D.state.disk, dir)) L.makeDir(D.state.disk, dir);
      const name = (it.note.slice(0, 32).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Note').replace(/^./, (c) => c.toUpperCase());
      let file = name + '.txt', i = 2;
      while (L.walk(D.state.disk, dir + '/' + file)) file = name + ' ' + (i++) + '.txt';
      L.writeFile(D.state.disk, dir + '/' + file, it.note);
      D.save();
      return say('Saved a note: ' + it.note + '.', card('', '', [{ label: 'Open Notes', go: true, run: () => { DU.hide(); D.launch('notes'); } }, { label: 'OK', run: () => DU.hide() }]));
    },
    // ---- the computer ----
    setting: (it) => {
      if (it.what === 'look') { D.set('look', it.value); D.applyLook(true); return done(it.value === 'night' ? 'Dark mode.' : 'Light mode.'); }
      if (it.what === 'warm') { D.tools.setWarm(it.value ? 'on' : 'off'); return done('Night light ' + (it.value ? 'on.' : 'off.')); }
      if (it.what === 'looks') { D.state.looks = it.value ? 'traced' : 'normal'; D.save(); if (D.prefs) D.prefs.live(); D.emit('prefs'); return done(it.value ? 'Traced mode is on.' : 'Back to the usual look.'); }
      if (it.what === 'quiet') { D.tools.setQuiet(it.value); return done(it.value ? 'Do not disturb is on. Notifications wait quietly.' : 'Do not disturb is off.'); }
      if (it.what === 'bluetooth') { if (!D.sys) return say('Bluetooth is set on DiceOS.'); D.tools.bt.power ? D.tools.bt.power(it.value) : D.sys.post('/api/bluetooth', { action: it.value ? 'on' : 'off' }); return done('Bluetooth ' + (it.value ? 'on.' : 'off.')); }
      if (it.what === 'bright') {
        const st = D.sys && D.sys.status;
        if (st && st.brightness !== null && st.brightness !== undefined) {
          const v = Math.max(0.05, Math.min(1, it.value !== undefined ? it.value : st.brightness + it.delta));
          st.brightness = v; D.sys.post('/api/brightness', { level: v }); return done('Brightness ' + pct(v) + '.');
        }
        const v = Math.max(0.3, Math.min(1, it.value !== undefined ? it.value : (D.state.bright || 1) + it.delta));
        D.set('bright', v); D.applyBright(); return done('Brightness ' + pct(v) + '.');
      }
      return DO.unknown(it);
    },
    mode: (it) => {
      if (!D.modes) return say('Modes aren\'t here yet.');
      if (it.off) { const was = D.modes.current(); if (!was) return done('No mode is on.'); D.modes.end(); return done(was.name + ' mode is off.'); }
      const m = D.modes.find(it.name);
      if (!m) return say('There\'s no ' + it.name + ' mode yet. You can make one in Settings, Modes.', card('', '', [{ label: 'Make modes', icon: 'spark', go: true, run: () => { DU.hide(); D.launch('settings', { arg: 'modes' }); } }]));
      D.modes.start(m.id);
      return done(m.name + ' mode is on.' + (m.blurb ? ' ' + m.blurb : ''));
    },
    shield: async (it) => {
      const SH = D.shield;
      if (!SH || !SH.available()) return say('Shield, the ad blocker, comes with DiceOS.');
      if (it.act === 'count') { const s = await SH.get(); return say(s ? 'Shield kept out ' + Number(s.today).toLocaleString() + ' ads and trackers today, ' + Number(Object.values(s.week || {}).reduce((a, b) => a + b, 0)).toLocaleString() + ' this week.' : 'Shield is blocking ads for every app on this computer.', card('', '', [{ label: 'Shield settings', icon: 'shield', go: true, run: () => { DU.hide(); D.launch('settings', { arg: 'shield' }); } }])); }
      if (it.act === 'pause') { const site = D.serene && D.serene.site(); if (!site) return say('Open the site in SereneTab first, then ask me.'); await SH.pause(site); if (D.serene.reload) D.serene.reload(); return done('Shield is paused on ' + site + '.'); }
      await SH.set({ on: it.act === 'on' });
      if (D.sys && !D.sys.info.emulated) await SH.systemSet({ system: it.act === 'on' });
      return done(it.act === 'on' ? 'Shield is on. Ads are blocked.' : 'Shield is off.');
    },
    shot: async () => { if (!D.sys) return say('Screenshots are for DiceOS.'); DU.hide(); setTimeout(() => D.tools.screenshot(), 400); },
    week: () => { if (D.recap) { DU.hide(); D.recap.open(); } else say('Your week isn\'t here yet.'); },
    lock: () => { DU.hide(); if (D.lock) D.lock(); else D.sleep(); },
    // ---- the web ----
    site: (it) => { DU.hide(); D.browse(it.url); },
    web: (it) => { const L = D.L, st = D.state.st || {}; const e = L.ENGINES[st.engine] || L.ENGINES.ddg; DU.hide(); D.browse(e.url + encodeURIComponent(it.q)); },
    ask: async (it) => {
      status('Looking it up…');
      const r = await DU.answer(it.q);
      if (!r || !r.ok) return say((r && r.error) || 'I couldn\'t look that up just now.', card('', '', [{ label: 'Search the web', icon: 'search', go: true, run: () => DO.web({ q: it.q }) }]));
      const plain = r.answer.replace(/\s*\[\d+\]/g, '').replace(/\n+/g, ' ');
      const short = plain.length > 300 ? plain.slice(0, 300).replace(/\s+\S*$/, '') + '…' : plain;
      return say(short, card('', 'From ' + r.sources.slice(0, 3).map((s) => s.site).join(', '), [{ label: 'Read more', icon: 'link', go: true, run: () => { DU.hide(); D.browse('serene:ask?q=' + encodeURIComponent(it.q)); } }, { label: 'OK', run: () => DU.hide() }]));
    },
    // ---- Oops, Lookouts, Show me how, Roll for it, Float, Fridge notes ----
    oops: (it) => {
      const O = D.oops;
      if (it.act === 'list') { DU.hide(); O.open(); return; }
      const e = O.list().find((x) => !x.undone);
      if (!e) return say('There\'s nothing to undo yet. When you change a setting, close a window or move something to the Trash, I can take it back.');
      if (!O.undo(e.id)) return say('I couldn\'t take that one back: ' + e.title.replace(/^./, (c) => c.toLowerCase()) + '.');
      return say('Undone: ' + e.title.replace(/^./, (c) => c.toLowerCase()) + '.', card('', '', [{ label: 'OK', go: true, run: () => DU.hide() }, { label: 'See every change', icon: 'loop', run: () => { DU.hide(); O.open(); } }]));
    },
    lookout: (it) => {
      const LK = D.lookouts, list = LK.list();
      if (it.act === 'list') {
        if (!list.length) return say('I\'m not watching for anything. Try "tell me when the Knicks game starts" or "let me know when it stops raining".');
        return say('I\'m keeping an eye out ' + list.map((l) => LK.words(l)).join(', and ') + '.', card('', '', [{ label: 'OK', go: true, run: () => DU.hide() }, { label: 'Stop them all', run: () => { LK.stop('all'); done('OK, I stopped watching.'); } }]));
      }
      if (it.act === 'stop') { const n = LK.stop(it.what); return done(n ? 'OK. I stopped watching' + (n > 1 ? ' for ' + n + ' things.' : '.') : 'I wasn\'t watching for that.'); }
      if (it.act === 'cant') return say('I can keep an eye on games, the weather, web pages and the internet. Try "tell me when the Knicks game starts", "let me know if it snows" or "tell me when this page changes".');
      const r = LK.add(it);
      if (!r.ok) {
        return say({
          town: 'Which town should I watch the sky in? Say "remember that I live in" and your town, then ask again.',
          nopage: 'Open the page in SereneTab first, then ask me again. Or say the site, like "tell me when example.com changes".',
          dice: 'Watching web pages needs DiceOS: it reads them for me. In a browser I can watch games, the weather and the internet.',
          full: 'I\'m already keeping an eye on 12 things. Say "stop watching" and one of them first.',
          online: 'You\'re online right now.',
        }[r.why] || 'I can\'t keep an eye on that.');
      }
      return say((r.again ? 'I\'m already on it: I\'ll tell you ' : 'OK. I\'ll tell you ') + LK.words(r.lookout) + '.', card('', '', [{ label: 'Done', go: true, run: () => DU.hide() }, { label: 'Stop watching', run: () => { LK.remove(r.lookout.id); done('OK, I won\'t.'); } }]));
    },
    howto: (it) => {
      if (!D.showme || !D.showme.has(it.topic)) return DO.ask({ q: it.text });
      DU.hide();
      setTimeout(() => D.showme.start(it.topic), 260);
    },
    roll: (it) => { DU.hide(); setTimeout(() => D.roll.open(it.what), 200); },
    float: (it) => {
      const name = D.float && D.float.set(it.on);
      if (!name) return say(D.desk && D.desk.on ? 'There\'s no window open to float.' : 'Float is for windows on the desktop. Switch to the desktop, then ask me again.');
      return done(it.on ? name + ' is floating on top. Move the mouse over it to see it clearly.' : name + ' is back to normal.');
    },
    fridge: (it) => {
      const F = D.fridge, n = F.get();
      if (it.clear) { if (!n) return done('There\'s no note up.'); F.clear(); return done('Note taken down.'); }
      if (it.read) return say(n ? 'The note says: ' + n.text + (n.by ? ', from ' + n.by : '') + '.' : 'There\'s no note up. Say "leave a note on the TV" and what it should say.');
      F.set(it.note);
      return say('Note left on DiceTV: "' + it.note + '". Whoever\'s next sees it on the home screen and the big clock.', card('', '', [{ label: 'Done', go: true, run: () => DU.hide() }, { label: 'Take it down', run: () => { F.clear(); done('Note taken down.'); } }]));
    },
    unknown: (it) => {
      const q = it.q || it.text || '';
      say('I\'m not sure what "' + q + '" means.', card('', '', [
        { label: 'Search YouTube for it', icon: 'search', go: true, run: () => { DU.hide(); D.watch.find('youtube', q); } },
        { label: 'Search Dice', icon: 'search', run: () => { DU.hide(); D.search.open(); setTimeout(() => { const s = D.$('#sq'); if (s) { s.value = q; D.search.run(q); } }, 60); } },
        { label: 'What can you do?', icon: 'help', run: () => DO.help() }]));
    },
  };
  // a short answer that goes away by itself
  function done(text, ms) { say(text); if (usePC()) return; clearTimeout(DU.doneT); DU.doneT = setTimeout(() => { if (DU.on && sayEl.textContent === text && phase() === 'answer') DU.hide(); }, ms || 2200); }

  // "in 20 minutes", "at 6:00 PM", "tomorrow at 9:00 AM"
  function whenWords(at) {
    const d = new Date(at), mins = Math.round((at - Date.now()) / 60000);
    if (mins < 60) return 'in ' + Math.max(1, mins) + (mins === 1 ? ' minute' : ' minutes');
    return (dayWords(d) === 'today' || dayWords(d) === 'tonight' ? 'at ' : dayWords(d) + ' at ') + timeWords(d);
  }
  DU.whenWords = whenWords;
  DU.card = card;
  DU.say = say;
  DU.DO = DO;

  // ---- reminders: "remind me to call Mom at 6" ----------------------------------------------------
  const R = DU.reminders = {
    list: () => (Array.isArray(D.state.reminders) ? D.state.reminders : (D.state.reminders = [])),
    // on: instead of a time, a moment ({ app: 'netflix' } next time it's opened, { place: 'desk' | 'tv' })
    add(what, at, on) { const r = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), what: String(what).slice(0, 200), at: on ? LATER : +at, done: false }; if (on) r.on = on; R.list().push(r); R.list().sort((a, b) => a.at - b.at); D.save(); D.emit('reminders'); return r; },
    remove(id) { D.state.reminders = R.list().filter((r) => r.id !== id); D.save(); D.emit('reminders'); },
    upcoming: () => R.list().filter((r) => !r.done),
    // "in 20 minutes", or "next time you open Netflix"
    when(r) {
      if (!r.on) return whenWords(r.at);
      if (r.on.place) return r.on.place === 'desk' ? 'when you\'re next on the desktop' : 'when you\'re next on DiceTV';
      const a = appNamed(r.on.app);
      return 'next time you open ' + (a ? a.name : r.on.app.replace(/\b\w/g, (c) => c.toUpperCase()));
    },
  };
  const LATER = 8.64e15; // the end of time, as far as a Date goes (moment reminders wait there)
  // which app a name means ("netflix" → Netflix, "files" → Files)
  function appNamed(name) {
    const n = B.clean(name), W = D.watch && D.watch.SVC;
    if (W) { const k = Object.keys(W).find((id) => B.clean(W[id].name) === n || id === n); if (k) return { id: k, name: W[k].name }; }
    const a = Object.values(D.apps || {}).find((x) => x && x.name && B.clean(x.name) === n);
    return a ? { id: a.id, name: a.name } : null;
  }
  // a moment came: the reminders waiting for it go off
  function moment(test) {
    const hit = R.list().filter((r) => !r.done && r.on && test(r.on));
    if (!hit.length) return;
    hit.forEach((r) => {
      r.done = true; r.at = Date.now();
      D.notify({ icon: 'bell', c: '#4b7bec', title: 'Reminder', text: r.what.replace(/^./, (c) => c.toUpperCase()), urgent: true });
      D.S.play('wake');
      talk('Reminder: ' + r.what);
    });
    D.save(); D.emit('reminders');
  }
  const named = (on, name) => { if (!on.app || !name) return false; const a = B.clean(on.app), b = B.clean(name); return a === b || (a.length > 2 && (b.startsWith(a) || a.startsWith(b))); };
  D.on('opened', (id) => { const a = D.app && D.app(id); moment((on) => on.app && (B.clean(on.app) === id || (a && named(on, a.name)))); });
  D.on('watching', (w) => moment((on) => named(on, w && w.name) || (w && w.url && on.app && new RegExp('\\b' + B.clean(on.app).replace(/ /g, '') + '\\.').test(w.url))));
  D.on('desk', (on) => setTimeout(() => moment((m) => m.place === (on ? 'desk' : 'tv')), 1500));
  D.on('booted', () => setTimeout(() => moment((m) => m.place === (D.desk && D.desk.on ? 'desk' : 'tv')), 4000));
  setInterval(() => {
    const now = Date.now(), due = R.list().filter((r) => !r.done && !r.on && r.at <= now);
    if (!due.length) return;
    due.forEach((r) => {
      r.done = true;
      if (D.asleep) D.wake();
      D.notify({ icon: 'bell', c: '#4b7bec', title: 'Reminder', text: r.what.replace(/^./, (c) => c.toUpperCase()), urgent: true });
      D.S.play('wake');
      talk('Reminder: ' + r.what);
    });
    // done ones go after a day
    D.state.reminders = R.list().filter((r) => !r.done || (now - r.at < 864e5 && r.at < LATER));
    D.save(); D.emit('reminders');
  }, 10000);

  // ---- the Notebook: what Deuce knows about you (it stays on this computer) ------------------------
  const NB = DU.notebook = {
    get() { const n = D.state.notebook && typeof D.state.notebook === 'object' ? D.state.notebook : (D.state.notebook = {}); if (!Array.isArray(n.facts)) n.facts = []; if (!Array.isArray(n.teams)) n.teams = []; return n; },
    add(fact) {
      const n = NB.get(), t = String(fact || '').trim().slice(0, 200);
      if (!t) return;
      // teams you follow ("my favorite team is the knicks", "i like the jets") and where you live
      if (/\b(team|follow|fan|root for|like|love|cheer)\b/.test(t)) B.teamsIn(t).slice(0, 2).forEach((tm) => { if (!n.teams.includes(tm.nick)) n.teams.push(tm.nick); });
      const live = /\bi (?:live|am|m) (?:in|near) (.+)$/.exec(t);
      if (live && D.weather) D.weather.find(live[1]).then((p) => { if (p) { D.state.st = D.state.st || {}; D.state.st.place = p; D.save(); D.emit('notebook'); } }).catch(() => {});
      n.facts = n.facts.filter((f) => f.t !== t).concat({ t, at: Date.now() }).slice(-60);
      D.save(); D.emit('notebook');
    },
    forget(fact) {
      const n = NB.get(), low = String(fact || '').toLowerCase(), before = n.facts.length + n.teams.length;
      n.facts = n.facts.filter((f) => !f.t.toLowerCase().includes(low) && !low.includes(f.t.toLowerCase()));
      n.teams = n.teams.filter((tm) => !low.includes(tm.toLowerCase()));
      D.save(); D.emit('notebook');
      return before - n.facts.length - n.teams.length;
    },
    clear() { D.state.notebook = { facts: [], teams: [] }; D.save(); D.emit('notebook'); },
  };

  // ---- answers from the web (scout-style): on DiceOS, diced looks it up; in a browser, Wikipedia ----
  const AI_HERE = 'dice-ai';
  DU.aiHere = () => { try { const c = JSON.parse(localStorage.getItem(AI_HERE) || 'null'); return c && c.provider ? c : null; } catch (e) { return null; } };
  DU.setAiHere = (c) => { try { if (c) localStorage.setItem(AI_HERE, JSON.stringify(c)); else localStorage.removeItem(AI_HERE); } catch (e) { /* storage is off */ } };
  DU.AI_WEB = { groq: ['Groq', 'https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile', 'https://console.groq.com/keys'], openrouter: ['OpenRouter', 'https://openrouter.ai/api/v1', 'meta-llama/llama-3.3-70b-instruct:free', 'https://openrouter.ai/keys'],
    google: ['Google AI Studio', 'https://generativelanguage.googleapis.com/v1beta/openai', 'gemini-2.5-flash', 'https://aistudio.google.com/apikey'], mistral: ['Mistral', 'https://api.mistral.ai/v1', 'mistral-small-latest', 'https://console.mistral.ai/api-keys'] };
  DU.answer = async function (q, history) {
    if (D.sys) { const r = await D.sys.post('/api/ask', { q, history: history || [] }); if (r && (r.ok || !D.sys.info.emulated)) return r; }
    try {
      const s = await (await fetch('https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=3&srsearch=' + encodeURIComponent(q))).json();
      const hits = (s.query && s.query.search) || [];
      const sums = await Promise.all(hits.map((x) => fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(x.title.replace(/ /g, '_'))).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
      const src = sums.filter((x) => x && x.extract && x.type !== 'disambiguation').map((x, i) => ({ n: i + 1, title: x.title + ' - Wikipedia', url: (x.content_urls && x.content_urls.desktop && x.content_urls.desktop.page) || 'https://en.wikipedia.org/wiki/' + encodeURIComponent(x.title), site: 'en.wikipedia.org', text: x.extract }));
      if (!src.length) return { ok: false, error: 'I couldn\'t find that. Try saying it another way, or search the web.' };
      const out = (answer, ai) => ({ ok: true, answer, ai, sources: src.map((x) => ({ n: x.n, title: x.title, url: x.url, site: x.site })) });
      const c = DU.aiHere(), P = c && DU.AI_WEB[c.provider];
      if (P && c.key) {
        try {
          const msgs = [{ role: 'system', content: 'You are Deuce, the helper in Dice. Answer in plain, friendly words a beginner understands, in a short paragraph. Take facts only from the numbered sources and put the number in square brackets after each fact, like [1].' }]
            .concat((history || []).slice(-3).flatMap((x) => [{ role: 'user', content: x.q }, { role: 'assistant', content: x.a }]))
            .concat({ role: 'user', content: 'Sources:\n\n' + src.map((x) => '[' + x.n + '] ' + x.title + '\n' + x.text).join('\n\n') + '\n\nQuestion: ' + q });
          const r = await fetch(P[1] + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.key }, body: JSON.stringify({ model: c.model || P[2], messages: msgs, temperature: 0.3, max_tokens: 600 }) });
          if (r.ok) { const j = await r.json(); const a = j.choices && j.choices[0] && j.choices[0].message.content; if (a) return out(a.trim(), P[0]); }
        } catch (e) { /* the AI didn't answer: Wikipedia's words instead */ }
      }
      return out(src[0].text.split(/(?<=[.!?])\s+/).slice(0, 3).join(' ') + ' [1]' + (src[1] ? '\n\n' + src[1].text.split(/(?<=[.!?])\s+/)[0] + ' [2]' : ''), null);
    } catch (e) { return { ok: false, error: 'I couldn\'t look that up. Is the internet on?' }; }
  };

  function helpCard() {
    const ex = ['Put on the Knicks game', 'Tell me when the Knicks game starts', 'Open Netflix', 'Roll for it', 'Undo that', 'How do I pair headphones?', 'Leave a note on the TV: back at 6', 'Set a timer for 10 minutes', 'What\'s the weather?', 'Turn off the TV'];
    const list = h('<ul class="du-ex"></ul>');
    ex.forEach((x) => { const li = h('<li><button class="du-chip" data-nav data-key="du:ex:' + esc(x) + '"></button></li>'); li.firstChild.textContent = '"' + x + '"'; li.firstChild.onclick = () => DU.ask(x); list.appendChild(li); });
    const c = h('<div class="du-res"></div>');
    c.appendChild(list);
    return c;
  }

  // ---- the ways to watch something: open the best one by itself ---------------------------------------
  // lead: what's going on ("The Knicks are on MSG."); then what Deuce does about it
  function offer(title, sub, ways, lead, auto, what) {
    const W = D.watch;
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const btns = ways.slice(0, 4).map((w, i) => ({ label: w.how === 'antenna' ? 'Antenna, channel ' + w.ch.num : i === 0 ? 'Watch on ' + w.name : cap(w.name), icon: w.how === 'antenna' ? 'tv' : 'play', go: i === 0, run: () => { DU.hide(); W.go(w); } }));
    btns.push({ label: 'Not now', run: () => DU.hide() });
    const best = ways[0];
    const doing = best.how === 'antenna' ? 'Tuning your antenna to channel ' + best.ch.num + '.'
      : 'Opening ' + best.name + (what ? ' for ' + what : '') + '.' + (best.have ? '' : best.note && /cable|provider/i.test(best.note) ? ' If it asks, sign in with your TV provider.' : '');
    say((lead ? lead + ' ' : '') + doing, card(title, sub, btns));
    if (auto) countdown(0, 3, () => { DU.hide(); W.go(best); });
  }
  function gameWays(g) {
    const W = D.watch, out = [];
    g.networks.forEach((n) => (n.id ? W.ways(n.id) : []).forEach((w) => { if (!out.some((o) => o.how === w.how && (o.svc || o.url) === (w.svc || w.url))) out.push(Object.assign({ net: n.name }, w)); }));
    if (!out.length && W.liveSvc()) out.push({ how: 'live', svc: W.liveSvc(), name: W.SVC[W.liveSvc()].name, url: W.SVC[W.liveSvc()].url, have: true });
    // the ones you have first; otherwise the listing's order (national, then your team's channel)
    return out.filter((w) => w.have).concat(out.filter((w) => !w.have));
  }

  // ---- a game ---------------------------------------------------------------------------------------------
  async function lookup(url) {
    try { const r = await fetch(url, { cache: 'no-store' }); if (r.ok) return await r.json(); } catch (e) { /* the browser can't reach it: ask DiceOS */ }
    if (D.sys && !D.sys.info.emulated) { const r = await D.sys.get('/api/lookup?url=' + encodeURIComponent(url)); if (r && r.ok) return r.data; }
    return null;
  }
  async function game(it) {
    const name = it.teams.length === 1 ? 'the ' + it.teams[0].nick : it.teams.map((t) => t.nick).slice(0, 3).join(' and the ');
    status('Looking up ' + name + '…');
    let reached = false;
    const found = (await Promise.all(it.teams.slice(0, 4).map(async (tm) => {
      const data = await lookup(B.scoreboardUrl(tm));
      if (data) reached = true;
      return data ? B.pickGame(data.events, tm) : null;
    }))).filter(Boolean);
    if (!found.length) {
      if (!reached) return say('I couldn\'t reach the sports scores just now. Is the internet on?', card('', '', [{ label: 'Try again', go: true, run: () => DU.ask(DU.last.text) }, { label: 'TV channels', run: () => DO.app({ id: 'dice:guide' }) }]));
      return say('I don\'t see a game for ' + name + ' this week.');
    }
    const at = (g) => new Date(g.at).getTime();
    const g = found.find((x) => x.state === 'in') || found.filter((x) => x.state === 'pre').sort((a, b) => at(a) - at(b))[0] || found.sort((a, b) => at(b) - at(a))[0];
    const when = new Date(g.at), vs = g.us + (g.home ? ' vs ' : ' at ') + g.them;
    // (the other team's local channel isn't one you'd have)
    const ours = g.networks.filter((n) => n.where === 'national' || n.where === (g.home ? 'home' : 'away'));
    const nets = (ours.length ? ours : g.networks).map((n) => n.name).slice(0, 3).join(', ');
    const ways = gameWays(g);
    if (g.state === 'post') {
      const a = +g.usScore, b = +g.themScore;
      return say('The ' + g.us + ' ' + (a > b ? 'beat' : a < b ? 'lost to' : 'tied') + ' the ' + g.them + ', ' + Math.max(a, b) + ' to ' + Math.min(a, b) + ', ' + dayWords(when) + '.', card(vs, 'Final' + (g.detail && !/^final$/i.test(g.detail) ? ', ' + g.detail : ''), [{ label: 'OK', go: true, run: () => DU.hide() }]));
    }
    if (g.state === 'in') {
      const score = g.us + ' ' + g.usScore + ', ' + g.them + ' ' + g.themScore;
      if (it.want === 'score' || !ways.length) return say(score + ', ' + (g.detail || 'live') + '.', card(vs, (g.detail || 'Live') + (nets ? ', on ' + nets : ''), ways.length ? [{ label: 'Watch it', icon: 'play', go: true, run: () => offer(vs, nets, ways, 'Putting it on', false) }, { label: 'OK', run: () => DU.hide() }] : [{ label: 'OK', go: true, run: () => DU.hide() }]));
      return offer(vs, score + ', ' + (g.detail || 'live') + (nets ? '. On ' + nets : ''), ways, 'The ' + g.us + ' are playing the ' + g.them + (ways[0].net ? ' on ' + ways[0].net : '') + ', ' + (+g.usScore >= +g.themScore ? 'up' : 'down') + ' ' + Math.max(+g.usScore, +g.themScore) + ' to ' + Math.min(+g.usScore, +g.themScore) + '.', true);
    }
    // later: say when and where, and open it if it's about to start
    const soon = at(g) - Date.now() < 30 * 60000;
    const line = 'The ' + g.us + ' play the ' + g.them + ' ' + dayWords(when) + ' at ' + timeWords(when) + (nets ? ', on ' + nets : '') + '.';
    if (!ways.length) return say(line + ' I\'m not sure how you can watch it. Pick your live TV service in TV setup.', card(vs, '', [{ label: 'TV setup', icon: 'gear', go: true, run: () => { DU.hide(); D.watch.setup(); } }]));
    if (soon && it.want === 'watch') return offer(vs, dayWords(when) + ' at ' + timeWords(when) + (nets ? ', on ' + nets : ''), ways, 'The ' + g.us + ' game starts at ' + timeWords(when) + (ways[0].net ? ' on ' + ways[0].net : '') + '.', true);
    return say(line, card(vs, dayWords(when) + ' at ' + timeWords(when) + (nets ? ', on ' + nets : ''), [
      { label: 'Remind me', icon: 'bell', go: true, run: () => remind(g, vs) },
      { label: 'Watch ' + ways[0].name + ' now', icon: 'play', run: () => { DU.hide(); D.watch.go(ways[0]); } },
      { label: 'Not now', run: () => DU.hide() }]));
  }

  // a team's game this week, for Deuce's Today on the PC
  DU.lookup = lookup;
  DU.nextGame = async function (nick) {
    const month = new Date().getMonth() + 1;
    const all = B.TEAMS.filter((t) => t.nick === nick), tm = all.find((t) => B.LEAGUES[t.league].months.includes(month)) || all[0];
    if (!tm) return null;
    const data = await lookup(B.scoreboardUrl(tm));
    return data ? B.pickGame(data.events, tm) : null;
  };

  // ---- reminders for a game ------------------------------------------------------------------------------
  const reminders = () => (Array.isArray(D.state.deuceRemind) ? D.state.deuceRemind : (D.state.deuceRemind = []));
  function remind(g, vs) {
    const list = reminders().filter((r) => r.id !== g.id && r.at > Date.now());
    list.push({ id: g.id, at: new Date(g.at).getTime(), vs, team: g.team });
    D.state.deuceRemind = list; D.save();
    done('I\'ll remind you five minutes before.');
  }
  setInterval(() => {
    const now = Date.now(), list = reminders();
    const due = list.filter((r) => r.at - now < 5 * 60000);
    if (!due.length) return;
    D.state.deuceRemind = list.filter((r) => !due.includes(r)); D.save();
    due.filter((r) => now - r.at < 3 * 3600e3).forEach((r) => {
      if (D.asleep) D.wake();
      D.notify({ icon: 'play', c: '#4b7bec', title: r.vs + ' is starting', text: 'Hold the microphone and say "put on the ' + r.team + ' game".' });
      talk(r.vs + ' is starting. Say, put on the ' + r.team + ' game.');
    });
  }, 30000);

  // ---- the Deuce button at the top, and "Ask Deuce" in Search ------------------------------------------------
  const tray = D.$('#tray'), tbs = D.$('#tb-search');
  if (tray && tbs) {
    const b = h('<button class="tb du-tb" id="tb-deuce" aria-label="Ask Deuce">' + pips + '</button>');
    b.onclick = () => { if (DU.on) DU.hide(); else DU.listen(); };
    tray.insertBefore(b, tbs);
    const paint = () => { b.hidden = !cfg().on; };
    D.on('deuce', paint); paint();
  }
  if (D.search && D.search.run) {
    const run0 = D.search.run;
    D.search.run = function (q) {
      run0.call(D.search, q);
      if (!cfg().on || String(q).trim().split(/\s+/).length < 2) return;
      const out = D.$('#sres'); if (!out) return;
      const p = out.querySelector('.qhint'); if (p) p.remove();
      const r = h('<button class="qrow glass du-ask" data-nav data-key="s:deuce"><span class="pic du-pic">' + pips + '</span><span><b></b><span class="kind">Ask Deuce</span></span></button>');
      r.querySelector('b').textContent = q.trim();
      r.onclick = () => { D.search.close(true); DU.ask(q.trim()); };
      out.prepend(r);
    };
  }
})();
