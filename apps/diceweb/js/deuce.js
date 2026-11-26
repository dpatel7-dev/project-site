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
  const phase = (p) => { if (p === undefined) return el ? el.dataset.phase : ''; el.dataset.phase = p; };
  DU.show = function () {
    if (!el) build();
    if (D.ambient && D.ambient.on) D.ambient.exit();
    if (!DU.on) { DU.prev = D.nav.el; S.play('open'); }
    DU.on = true;
    el.classList.add('on', 'navtrap');
    if (D.legend) D.legend.update && D.legend.update();
  };
  DU.hide = function () {
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
  function clear() { heardEl.textContent = ''; sayEl.textContent = ''; cardEl.hidden = true; cardEl.replaceChildren(); clearTimeout(cdT); cdT = 0; clearTimeout(laterT); }
  // something Deuce does in a moment (after you've seen what it heard); a new question cancels it
  let laterT = 0;
  const later = (fn, ms) => { clearTimeout(laterT); laterT = setTimeout(fn, ms); };
  // say something (and out loud, if Deuce talks)
  function say(text, card) {
    phase('answer');
    sayEl.textContent = text;
    cardEl.replaceChildren();
    cardEl.hidden = !card;
    if (card) { cardEl.appendChild(card); const first = card.querySelector('[data-first]') || card.querySelector('[data-nav]'); if (first && DU.on) D.nav.focus(first); }
    else if (DU.on) D.nav.focus(el.querySelector('.du-talk'));
    talk(text);
  }
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
    const b = cardEl.querySelector('[data-key="du:b' + btnIndex + '"] span');
    if (!b) return run();
    const label = b.textContent;
    let n = secs;
    const step = () => {
      if (!DU.on && !front()) return;
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
    DU.show(); clear(); phase('listen'); gotText = false;
    sayEl.textContent = 'Listening…';
    D.nav.focus(el.querySelector('.du-talk'));
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
          heardEl.textContent = t;
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
    if (v.partial) { heardEl.textContent = v.partial; return; }
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
    heardEl.textContent = text;
    phase('think');
    sayEl.textContent = '';
    let it;
    try { it = B.understand(text); } catch (e) { it = { kind: 'unknown', q: text }; }
    DU.last = it;
    try { await (DO[it.kind] || DO.unknown)(it); } catch (e) { say('Something went wrong doing that. Try again?'); }
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
    time: () => done('It\'s ' + timeWords(new Date()) + '.', 4000),
    date: () => done('It\'s ' + new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) + '.', 4000),
    weather: async (it) => {
      const p = (D.state.home && D.state.home.place) || (D.state.st && D.state.st.place);
      if (!p || !D.weather) return say('Which town are you in? Set it once and I\'ll know.', card('', '', [{ label: 'Set my town', icon: 'sun', go: true, run: () => { DU.hide(); D.tv.askTown(); } }]));
      sayEl.textContent = 'Looking…';
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
    input: async (it) => {
      if (!D.inputs || !D.sys) return say('Switching the TV\'s inputs works on DiceOS, plugged into the TV.');
      if (it.dice) { if (D.inputs.away) D.inputs.back(); else if (D.sys) D.sys.post('/api/cec', { action: 'back' }); return done('Here I am.'); }
      sayEl.textContent = 'Looking for the ' + it.name + '…';
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
    unknown: (it) => {
      const q = it.q || it.text || '';
      say('I\'m not sure what "' + q + '" means.', card('', '', [
        { label: 'Search YouTube for it', icon: 'search', go: true, run: () => { DU.hide(); D.watch.find('youtube', q); } },
        { label: 'Search Dice', icon: 'search', run: () => { DU.hide(); D.search.open(); setTimeout(() => { const s = D.$('#sq'); if (s) { s.value = q; D.search.run(q); } }, 60); } },
        { label: 'What can you do?', icon: 'help', run: () => DO.help() }]));
    },
  };
  // a short answer that goes away by itself
  function done(text, ms) { say(text); clearTimeout(DU.doneT); DU.doneT = setTimeout(() => { if (DU.on && sayEl.textContent === text && phase() === 'answer') DU.hide(); }, ms || 2200); }

  function helpCard() {
    const ex = ['Put on the Knicks game', 'Put on MSG', 'Open Netflix', 'Play lofi on YouTube', 'Switch to the PlayStation', 'Turn it up', 'Set a timer for 10 minutes', 'Wake me up at 7', 'What\'s the weather?', 'Turn off the TV'];
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
    sayEl.textContent = 'Looking up ' + name + '…';
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
