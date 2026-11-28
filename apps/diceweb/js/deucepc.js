// Deuce for PC: Deuce on the desktop, in a side panel like Cortana's, with a living orb.
//
// - Today: hello, the weather, what's coming up (your reminders and Axiom), your teams'
//   games, what Shield kept out, your week.
// - Ask anything: Deuce looks it up on the web, reads the best pages and explains them
//   with a number after each fact for where it came from (like scout).
// - Do things: open apps and sites, settings ("dark mode", "night light on"), modes
//   ("focus mode"), reminders, notes, timers, the TV's inputs, screenshots.
// - Reminders and a Notebook (what Deuce knows about you, kept on this computer).
// Open it with the orb in the dock, Super + C, or the microphone button. The words are
// understood by the same brain as on the TV (js/deucebrain.js).
(function () {
  'use strict';
  const D = window.Dice, DU = D.deuce, B = window.DeuceBrain, h = D.h, esc = D.esc;
  if (!DU || !DU.attachPC) return;
  let el = null, body = null, input = null, orb = null, open = false, tab = 'today', turn = null, oid = 0, history = [];
  const num = (n) => Number(n || 0).toLocaleString();

  // ---- the orb: Deuce's two pips in a ring of three colours --------------------------------------------------
  function orbSvg(size) {
    const id = 'dpo' + (++oid);
    return '<svg class="dp-orbsvg" viewBox="0 0 64 64" width="' + size + '" height="' + size + '" aria-hidden="true"><defs>' +
      '<linearGradient id="' + id + 'r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3fd0b8"/><stop offset=".5" stop-color="#4b7bec"/><stop offset="1" stop-color="#b06bf0"/></linearGradient>' +
      '<radialGradient id="' + id + 'c" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#fff" stop-opacity=".98"/><stop offset=".55" stop-color="#e6ecff" stop-opacity=".82"/><stop offset="1" stop-color="#b8c6f2" stop-opacity=".7"/></radialGradient></defs>' +
      '<circle class="o-wave" cx="32" cy="32" r="27" fill="none" stroke="url(#' + id + 'r)" stroke-width="2"/>' +
      '<circle class="o-ring" cx="32" cy="32" r="26" fill="none" stroke="url(#' + id + 'r)" stroke-width="5"/>' +
      '<circle class="o-core" cx="32" cy="32" r="21.5" fill="url(#' + id + 'c)"/>' +
      '<g class="o-pips"><circle cx="25" cy="25" r="4.6"/><circle cx="39" cy="39" r="4.6"/></g></svg>';
  }
  DU.orbSvg = orbSvg;

  // ---- building the panel -------------------------------------------------------------------------------------
  const MIC = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>';
  const SEND = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
  const CLOSE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>';
  function build() {
    el = h('<section id="deucepc" class="dp" role="dialog" aria-label="Deuce" hidden>' +
      '<div class="dp-sky" aria-hidden="true"></div>' +
      '<header class="dp-head"><div class="dp-orb" data-phase="idle">' + orbSvg(58) + '</div><div class="dp-hello"><b></b><span></span></div>' +
      '<button class="dp-x" data-nav data-key="dp:x" aria-label="Close Deuce (Esc)">' + CLOSE + '</button></header>' +
      '<nav class="dp-tabs" role="tablist"><button role="tab" data-nav data-key="dp:t-today" data-tab="today">Today</button><button role="tab" data-nav data-key="dp:t-rem" data-tab="reminders">Reminders</button><button role="tab" data-nav data-key="dp:t-nb" data-tab="notebook">Notebook</button></nav>' +
      '<div class="dp-body" tabindex="-1"></div>' +
      '<form class="dp-ask"><button type="button" class="dp-mic" data-nav data-key="dp:mic" aria-label="Talk to Deuce">' + MIC + '</button>' +
      '<input data-nav data-key="dp:in" placeholder="Ask me anything, or tell me what to do" autocomplete="off" spellcheck="false" enterkeyhint="send" aria-label="Ask Deuce">' +
      '<button class="dp-send" data-nav data-key="dp:go" aria-label="Ask">' + SEND + '</button></form></section>');
    document.body.appendChild(el);
    body = el.querySelector('.dp-body'); input = el.querySelector('.dp-ask input'); orb = el.querySelector('.dp-orb');
    el.querySelector('.dp-x').onclick = () => P.hide();
    el.querySelector('.dp-mic').onclick = () => { if (orb.dataset.phase === 'listen') DU.stop(); else DU.listen(); };
    el.querySelector('.dp-ask').onsubmit = (e) => { e.preventDefault(); const t = input.value.trim(); if (!t) return; input.value = ''; DU.ask(t); };
    el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => P.tab(b.dataset.tab); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); P.hide(); } });
    orb.onclick = () => { if (orb.dataset.phase === 'listen') DU.stop(); else DU.listen(); };
  }
  function place() {
    const dock = D.$('#desk .dshelf');
    const r = dock ? dock.getBoundingClientRect() : { left: 16, top: innerHeight - 70 };
    el.style.left = Math.max(12, Math.min(innerWidth - el.offsetWidth - 12, r.left)) + 'px';
    el.style.bottom = Math.max(12, innerHeight - r.top + 10) + 'px';
  }
  function greet() {
    const hr = new Date().getHours(), name = D.state.name && D.state.name !== 'player' ? ', ' + D.state.name : '';
    el.querySelector('.dp-hello b').textContent = (hr < 5 ? 'Up late' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : hr < 22 ? 'Good evening' : 'Good night') + name;
    el.querySelector('.dp-hello span').textContent = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    // the sky behind the orb follows the time of day
    el.dataset.sky = hr < 6 || hr >= 21 ? 'night' : hr < 10 ? 'dawn' : hr < 17 ? 'day' : 'dusk';
  }

  // ---- what deuce.js calls -------------------------------------------------------------------------------------
  const P = {
    isOpen: () => open,
    root: () => (turn ? turn : body) || document.createElement('div'),
    show() {
      if (!el) build();
      if (!open) { open = true; el.hidden = false; el.classList.add('navtrap'); place(); greet(); D.S.play('open'); requestAnimationFrame(() => el.classList.add('on')); paintTab(); P.prev = document.activeElement; D.emit('deuce-open'); }
      setTimeout(() => { if (open && !turn) try { input.focus(); } catch (e) { /* not on screen */ } }, 60);
      paintDock();
    },
    hide() {
      if (!open) return;
      open = false; DU.stop(true);
      el.classList.remove('on', 'navtrap');
      setTimeout(() => { if (!open) el.hidden = true; }, 220);
      D.S.play('close'); paintDock();
    },
    phase(p) { if (!el) return ''; if (p === undefined) return orb.dataset.phase; orb.dataset.phase = p === 'answer' ? 'idle' : p; paintDock(); },
    heard(t) { if (!turn || turn.dataset.listen !== '1') { P.asked(t); turn.dataset.listen = '1'; } turn.querySelector('.dp-you').textContent = t; },
    listening() { P.tab('today', true); turn = null; P.phase('listen'); D.S.play('listen'); input.placeholder = 'Listening… say what you want'; setTimeout(() => { input.placeholder = 'Ask me anything, or tell me what to do'; }, 6000); },
    typing() { try { input.focus(); } catch (e) { /* not on screen */ } },
    asked(text) {
      if (turn && turn.dataset.listen === '1') { turn.querySelector('.dp-you').textContent = text; turn.dataset.listen = '0'; return; }
      if (tab !== 'today') P.tab('today', true);
      let th = body.querySelector('.dp-thread');
      if (!th) { body.innerHTML = ''; th = h('<div class="dp-thread"><button class="dp-back" data-nav data-key="dp:today"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5L8 12l6.5 6.5"/></svg>Today</button></div>'); th.firstChild.onclick = () => { history = []; turn = null; paintTab(); }; body.appendChild(th); }
      turn = h('<article class="dp-turn"><p class="dp-you"></p><div class="dp-me"><p class="dp-steps"><i></i><i></i><i></i><span>Thinking</span></p><div class="dp-text"></div><div class="dp-card"></div></div></article>');
      turn.querySelector('.dp-you').textContent = text;
      th.appendChild(turn);
      body.scrollTop = body.scrollHeight;
    },
    status(t) { if (!turn) return; const s = turn.querySelector('.dp-steps'); s.hidden = false; s.querySelector('span').textContent = t.replace(/…$/, ''); },
    say(text, card) {
      if (!turn) P.asked('');
      turn.querySelector('.dp-steps').hidden = true;
      const tx = turn.querySelector('.dp-text');
      tx.innerHTML = paras(text);
      const c = turn.querySelector('.dp-card');
      c.replaceChildren();
      if (card) c.appendChild(card);
      P.phase('answer');
      body.scrollTop = body.scrollHeight;
    },
    // Deuce's brain (js/deucemind.js): the steps it takes, its words as they come, and its answer with sources
    step(t, how) {
      if (!turn) P.asked('');
      let ul = turn.querySelector('.dp-tools');
      if (!ul) { ul = h('<ul class="dp-tools" aria-label="What Deuce did"></ul>'); turn.querySelector('.dp-me').insertBefore(ul, turn.querySelector('.dp-text')); }
      ul.querySelectorAll('li.now').forEach((li) => li.classList.remove('now'));
      if (t !== 'Thinking') { const li = h('<li class="now' + (how === 'x' ? ' x' : '') + '"><i></i><span></span></li>'); li.querySelector('span').textContent = t; ul.appendChild(li); }
      P.status(t === 'Thinking' ? 'Thinking' : 'Working');
      body.scrollTop = body.scrollHeight;
    },
    stream(text) {
      if (!turn) P.asked('');
      turn.querySelector('.dp-steps').hidden = true;
      turn.querySelector('.dp-text').innerHTML = paras(text);
      body.scrollTop = body.scrollHeight;
    },
    answer(text, sources, box, by) {
      if (!turn) P.asked('');
      turn.querySelector('.dp-steps').hidden = true;
      turn.querySelectorAll('.dp-tools li.now').forEach((li) => li.classList.remove('now'));
      const tx = turn.querySelector('.dp-text');
      DU.renderAnswer(tx, { answer: text, sources, note: by && sources.length ? 'Answered by ' + by + ' on this computer, from ' + sources.length + ' web page' + (sources.length === 1 ? '' : 's') + '. Check the sources for anything important.' : 'x' });
      if (!by || !sources.length) { const f = tx.querySelector('.dp-foot'); if (f) f.remove(); }
      turn.querySelector('.dp-card').replaceChildren(...(box ? [box] : []));
      history.push({ q: turn.querySelector('.dp-you').textContent, a: text });
      P.phase('answer');
      body.scrollTop = body.scrollHeight;
    },
    tab(t, quiet) { tab = t; if (t !== 'today') { turn = null; history = []; } paintTab(quiet); },
    DO: {},
  };
  DU.attachPC(P);
  const paras = (text) => String(text || '').split(/\n{2,}/).map((p) => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join('');

  // ---- the scout-style answer ----------------------------------------------------------------------------------
  function letter(site) { return (String(site || '?').replace(/^(www|en|m)\./, '')[0] || '?').toUpperCase(); }
  const HUES = ['#e0705a', '#e9a23b', '#5aa469', '#3f8fd8', '#8a6bd8', '#d45d9a', '#2fa5a0', '#7a86a3'];
  const hue = (s) => HUES[D.G.hash(String(s || '')) % HUES.length];
  // the answer's words, with each [1] as a little button for its source
  DU.renderAnswer = function (box, r, opts) {
    opts = opts || {};
    const open1 = (u) => (opts.open ? opts.open(u) : D.browse(u));
    const html = String(r.answer || '').split(/\n{2,}/).map((p) => {
      const lines = p.split('\n'), list = lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l));
      const fmt = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/((?:\s*\[\d{1,2}\])+)/g, (m) => ' ' + m.match(/\d{1,2}/g).map((n) => '<button class="dp-cite" data-n="' + n + '" aria-label="Source ' + n + '">' + n + '</button>').join(''));
      return list ? '<ul>' + lines.map((l) => '<li>' + fmt(l.replace(/^\s*([-*•]|\d+\.)\s+/, '')) + '</li>').join('') + '</ul>' : '<p>' + fmt(p) + '</p>';
    }).join('');
    box.innerHTML = '<div class="dp-ans">' + html + '</div>';
    const srcs = (r.sources || []).filter((s) => s && /^https?:/.test(s.url));
    if (srcs.length) {
      const row = h('<div class="dp-srcs" role="list" aria-label="Sources"></div>');
      srcs.forEach((s) => {
        const a = h('<button class="dp-src" role="listitem" data-nav data-key="dp:s' + s.n + '" title="' + esc(s.url) + '"><span class="dp-n">' + s.n + '</span><span class="dp-mono" style="--c:' + hue(s.site) + '">' + esc(letter(s.site)) + '</span><b></b><small></small></button>');
        a.querySelector('b').textContent = s.title; a.querySelector('small').textContent = s.site;
        a.onclick = () => open1(s.url);
        row.appendChild(a);
      });
      box.appendChild(row);
    }
    box.querySelectorAll('.dp-cite').forEach((b) => { b.onclick = () => { const s = srcs.find((x) => String(x.n) === b.dataset.n); if (s) open1(s.url); }; });
    const foot = r.note ? r.note : r.ai ? 'Explained by ' + r.ai + ' from ' + srcs.length + ' website' + (srcs.length === 1 ? '' : 's') + '. Check the sources for anything important.' :
      'From the top of the search. For fuller answers, add a free AI in Settings, Deuce.';
    box.appendChild(h('<p class="dp-foot">' + esc(foot) + '</p>'));
  };
  P.DO.ask = async (it) => {
    P.status('Searching the web');
    const t0 = turn;
    const slow = setTimeout(() => { if (turn === t0) P.status('Reading the best pages'); }, 1400);
    const r = await DU.answer(it.q, history);
    clearTimeout(slow);
    if (turn !== t0) return;
    if (!r || !r.ok) return P.say((r && r.error) || 'I couldn\'t look that up just now.', DU.card('', '', [{ label: 'Search the web instead', icon: 'search', go: true, run: () => DU.DO.web({ q: it.q }) }]));
    turn.querySelector('.dp-steps').hidden = true;
    DU.renderAnswer(turn.querySelector('.dp-text'), r);
    turn.querySelector('.dp-card').replaceChildren(DU.card('', '', [{ label: 'Open in SereneTab', icon: 'link', run: () => { P.hide(); D.browse('serene:ask?q=' + encodeURIComponent(it.q)); } }]));
    history.push({ q: it.q, a: r.answer });
    P.phase('answer');
    body.scrollTop = body.scrollHeight;
    // Deuce reads the first sentence out, if it talks
    if (DU.cfg().talk && D.sys && !D.sys.info.emulated) D.sys.post('/api/voice', { action: 'say', text: r.answer.replace(/\s*\[\d+\]/g, '').split(/(?<=[.!?])\s/)[0] });
  };
  // on a PC, anything Deuce can't do itself, it looks up
  P.DO.unknown = (it) => (String(it.q || it.text || '').split(/\s+/).length >= 2 ? P.DO.ask({ q: it.q || it.text }) : DU.say('I\'m not sure what "' + (it.q || it.text) + '" means. Try "what can you do?"'));
  P.DO.help = () => {
    const groups = [['Ask', ['Why is the sky blue?', 'Who won the Knicks game?', 'What\'s the weather tomorrow?']],
      ['Do', ['Turn on dark mode', 'Start focus mode', 'Open github.com', 'Set a timer for 10 minutes', 'Take a screenshot']],
      ['Remember', ['Remind me to call Mom at 6', 'Remember that my locker is 42', 'Note: buy milk', 'What do you know about me?']]];
    const c = h('<div class="dp-help"></div>');
    groups.forEach(([g, list]) => { const sec = h('<div><h4>' + g + '</h4></div>'); list.forEach((x) => { const b = h('<button class="dp-chip" data-nav data-key="dp:ex:' + esc(x) + '"></button>'); b.textContent = x; b.onclick = () => DU.ask(x); sec.appendChild(b); }); c.appendChild(sec); });
    P.say('Here\'s some of what I can do. Type it, or press the microphone and say it.', c);
  };

  // ---- the tabs ------------------------------------------------------------------------------------------------
  function paintTab(quiet) {
    if (!el) return;
    el.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    if (tab === 'today' && quiet && body.querySelector('.dp-thread')) return;
    body.innerHTML = '';
    body.scrollTop = 0;
    if (tab === 'today') today();
    else if (tab === 'reminders') reminders();
    else notebook();
  }
  function cardEl(cls, icon, c, title) {
    return h('<section class="dp-cardx ' + cls + '" style="--c:' + c + '"><h3>' + D.icon(icon, c, 2) + '<span>' + esc(title) + '</span></h3></section>');
  }
  async function today() {
    const box = h('<div class="dp-today"></div>');
    body.appendChild(box);
    // the weather where you are
    const place = (D.state.st && D.state.st.place) || (D.state.home && D.state.home.place);
    const wx = cardEl('dp-wx', 'sun', '#f5a524', 'Weather');
    if (place && D.weather) {
      wx.appendChild(h('<p class="muted">Looking at the sky in ' + esc(place.name) + '…</p>'));
      const units = (D.state.st && D.state.st.units) || (/^en-US$/i.test(navigator.language || '') ? 'f' : 'c');
      D.weather.get(place.lat, place.lon, units).then((d) => {
        const w = D.weather.words(d.code);
        wx.lastChild.replaceWith(h('<div class="dp-wxrow">' + D.weather.icon(w.kind, D.night()) + '<b>' + d.t + '°</b><div><span>' + esc(w.text) + ' in ' + esc(place.name) + '</span><small>High ' + d.hi + '°, low ' + d.lo + '°</small></div></div>'));
      }).catch(() => { wx.lastChild.textContent = 'No weather right now. It needs the internet.'; });
    } else {
      const b = h('<button class="b small" data-nav data-key="dp:town">Tell me your town</button>');
      b.onclick = () => { input.value = 'remember that I live in '; input.focus(); };
      wx.appendChild(h('<p class="muted">Where are you? Then I\'ll know the weather.</p>')); wx.appendChild(b);
    }
    box.appendChild(wx);
    // what's coming up
    const up = cardEl('dp-up', 'bell', '#4b7bec', 'Up next');
    const items = [];
    DU.reminders.upcoming().slice(0, 4).forEach((r) => items.push({ t: r.at, what: r.what, when: DU.whenWords(r.at), kind: 'Reminder' }));
    const A = D.state.axiom;
    if (A && Array.isArray(A.tasks) && D.L.planBuckets) {
      const tk = D.L.dayKey(new Date()), bk = D.L.planBuckets(A.tasks, tk);
      bk.overdue.concat(bk.today).slice(0, 3).forEach((t) => items.push({ t: Infinity, what: t.title, when: t.due < tk ? 'overdue' : 'due today', kind: 'Axiom' }));
    }
    if (D.timer && D.timer.running) items.unshift({ t: D.timer.end, what: 'Timer', when: 'rings ' + DU.whenWords(D.timer.end), kind: 'Clock' });
    if (!items.length) up.appendChild(h('<p class="muted">Nothing coming up. Try "remind me to call Mom at 6".</p>'));
    items.slice(0, 5).forEach((x) => up.appendChild(h('<div class="dp-item"><i></i><div><b>' + esc(x.what.replace(/^./, (c) => c.toUpperCase())) + '</b><small>' + esc(x.kind + ', ' + x.when) + '</small></div></div>')));
    box.appendChild(up);
    // your teams
    const nb = DU.notebook.get();
    if (nb.teams.length) {
      const tc = cardEl('dp-teams', 'trophy', '#e8913a', 'Your teams');
      box.appendChild(tc);
      nb.teams.slice(0, 3).forEach((nick) => {
        const row = h('<div class="dp-item"><i></i><div><b>' + esc(nick) + '</b><small>Looking…</small></div></div>');
        tc.appendChild(row);
        DU.nextGame(nick).then((g) => {
          const sm = row.querySelector('small');
          if (!g) { sm.textContent = 'No game this week'; return; }
          const when = new Date(g.at), vs = g.us + (g.home ? ' vs ' : ' at ') + g.them;
          row.querySelector('b').textContent = vs;
          sm.textContent = g.state === 'in' ? g.us + ' ' + g.usScore + ', ' + g.them + ' ' + g.themScore + (g.detail ? ', ' + g.detail : '') : g.state === 'post' ? 'Final: ' + g.usScore + ' to ' + g.themScore : DU.whenWords(when.getTime()).replace(/^in /, 'starts in ');
          if (g.state !== 'post') { const w = h('<button class="b small" data-nav data-key="dp:watch-' + esc(nick) + '">' + D.glyph('play', 2) + 'Watch</button>'); w.onclick = () => DU.ask('put on the ' + nick + ' game'); row.appendChild(w); }
        }).catch(() => { row.querySelector('small').textContent = 'Couldn\'t reach the scores'; });
      });
    }
    // Shield and your week, side by side
    const pair = h('<div class="dp-pair"></div>');
    if (D.shield && D.shield.available()) {
      const sc = cardEl('dp-sh', 'shield', '#4b7bec', 'Shield');
      sc.appendChild(h('<p class="dp-bignum">…</p>'));
      pair.appendChild(sc);
      D.shield.get().then((s) => { sc.querySelector('.dp-bignum').innerHTML = s ? num(s.today) + '<small>ads kept out today</small>' : 'On<small>for every app</small>'; });
      sc.onclick = () => { P.hide(); D.launch('settings', { arg: 'shield' }); };
    }
    if (D.recap) {
      const wk = cardEl('dp-wk', 'chart', '#2bc4b2', 'Your week');
      const r = D.recap.summary();
      wk.appendChild(h('<p class="dp-bignum">' + esc(r.todayText) + '<small>on the computer today</small></p>'));
      wk.onclick = () => { P.hide(); D.recap.open(); };
      pair.appendChild(wk);
    }
    if (pair.children.length) box.appendChild(pair);
    // things to try
    const tr = h('<div class="dp-try"><h4>Try</h4></div>');
    ['What can you do?', 'Why is the sky blue?', 'Start focus mode', 'Remind me to stretch in 30 minutes'].forEach((x) => { const b = h('<button class="dp-chip" data-nav data-key="dp:try:' + esc(x) + '"></button>'); b.textContent = x; b.onclick = () => DU.ask(x); tr.appendChild(b); });
    box.appendChild(tr);
  }
  function reminders() {
    const box = h('<div class="dp-rem"></div>');
    const form = h('<form class="dp-remform"><input data-nav data-key="dp:remwhat" placeholder="Remind me to…" aria-label="What to remind you about" maxlength="200"><select data-nav data-key="dp:remwhen" aria-label="When">' +
      '<option value="10">In 10 minutes</option><option value="60">In an hour</option><option value="tonight">Tonight at 8</option><option value="morning">Tomorrow at 9</option><option value="pick">Pick a time…</option></select>' +
      '<input type="datetime-local" class="dp-pick" hidden aria-label="The time"><button class="b small go" data-nav data-key="dp:remadd">Add</button></form>');
    const sel = form.querySelector('select'), pick = form.querySelector('.dp-pick');
    sel.onchange = () => { pick.hidden = sel.value !== 'pick'; };
    form.onsubmit = (e) => {
      e.preventDefault();
      const what = form.querySelector('input').value.trim();
      if (!what) return;
      const d = new Date(); let at;
      if (sel.value === 'tonight') at = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (d.getHours() >= 20 ? 1 : 0), 20).getTime();
      else if (sel.value === 'morning') at = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 9).getTime();
      else if (sel.value === 'pick') { at = pick.value ? new Date(pick.value).getTime() : NaN; if (!(at > Date.now())) { pick.focus(); return; } }
      else at = Date.now() + +sel.value * 60000;
      DU.reminders.add(what, at); D.S.play('select'); paintTab();
    };
    box.appendChild(form);
    const list = DU.reminders.list().slice().sort((a, b) => a.at - b.at);
    if (!list.length) box.appendChild(h('<p class="dp-empty">No reminders. Add one above, or just say "remind me to water the plants tomorrow".</p>'));
    list.forEach((r) => {
      const row = h('<div class="dp-item' + (r.done ? ' done' : '') + '"><i></i><div><b></b><small>' + esc(r.done ? 'Done' : DU.whenWords(r.at)) + ', ' + esc(new Date(r.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })) + '</small></div><button class="dp-del" data-nav data-key="dp:rx-' + esc(r.id) + '" aria-label="Remove">' + CLOSE + '</button></div>');
      row.querySelector('b').textContent = r.what.replace(/^./, (c) => c.toUpperCase());
      row.querySelector('.dp-del').onclick = () => { DU.reminders.remove(r.id); paintTab(); };
      box.appendChild(row);
    });
    body.appendChild(box);
  }
  function notebook() {
    const nb = DU.notebook.get();
    const box = h('<div class="dp-nb"><p class="dp-lead">What Deuce knows about you. It stays on this computer, and you can change or forget any of it.</p></div>');
    const add = (title, sub, ctl) => { const s = h('<section class="dp-nbrow"><h4>' + esc(title) + '</h4>' + (sub ? '<p class="muted">' + esc(sub) + '</p>' : '') + '</section>'); s.appendChild(ctl); box.appendChild(s); return s; };
    // your name
    const nm = h('<form class="dp-inline"><input data-nav data-key="dp:nbname" maxlength="20" aria-label="What Deuce calls you"><button class="b small" data-nav data-key="dp:nbnamego">Save</button></form>');
    nm.querySelector('input').value = D.state.name && D.state.name !== 'player' ? D.state.name : '';
    nm.onsubmit = (e) => { e.preventDefault(); const v = nm.querySelector('input').value.trim().slice(0, 20); if (v) { D.set('name', v); D.emit('name'); greet(); D.toast({ icon: 'person', c: '#4b7bec', title: 'Hi, ' + v, text: 'Deuce will call you that.' }); } };
    add('What to call you', '', nm);
    // your town
    const place = (D.state.st && D.state.st.place) || (D.state.home && D.state.home.place);
    const town = h('<form class="dp-inline"><input data-nav data-key="dp:nbtown" placeholder="Town or city" aria-label="Your town"><button class="b small" data-nav data-key="dp:nbtowngo">' + (place ? 'Change' : 'Save') + '</button></form>');
    if (place) town.querySelector('input').value = place.name;
    town.onsubmit = async (e) => { e.preventDefault(); const v = town.querySelector('input').value.trim(); if (!v || !D.weather) return; try { const p = await D.weather.find(v); if (!p) { town.querySelector('input').value = ''; town.querySelector('input').placeholder = 'No town called that'; return; } D.state.st = D.state.st || {}; D.state.st.place = p; D.save(); paintTab(); } catch (err) { town.querySelector('input').placeholder = 'Can\'t look that up offline'; } };
    add('Your town', 'For the weather.', town);
    // teams
    const tm = h('<div><div class="dp-chips"></div><form class="dp-inline"><input data-nav data-key="dp:nbteam" placeholder="Knicks, Jets, Devils…" aria-label="A team you follow"><button class="b small" data-nav data-key="dp:nbteamgo">Add</button></form></div>');
    nb.teams.forEach((t, i) => { const c = h('<button class="dp-chip on" data-nav data-key="dp:nbt' + i + '">' + esc(t) + '<span aria-hidden="true">' + CLOSE + '</span></button>'); c.setAttribute('aria-label', 'Stop following the ' + t); c.onclick = () => { nb.teams = nb.teams.filter((x) => x !== t); D.save(); paintTab(); }; tm.firstChild.appendChild(c); });
    tm.querySelector('form').onsubmit = (e) => { e.preventDefault(); const v = tm.querySelector('input').value; const hits = B ? B.teamsIn(v) : []; if (!hits.length) { tm.querySelector('input').value = ''; tm.querySelector('input').placeholder = 'I don\'t know that team'; return; } hits.slice(0, 1).forEach((x) => { if (!nb.teams.includes(x.nick)) nb.teams.push(x.nick); }); D.save(); paintTab(); };
    add('Teams you follow', 'Their games show up in Today, with how to watch.', tm);
    // things to remember
    const facts = h('<div><div class="dp-facts"></div><form class="dp-inline"><input data-nav data-key="dp:nbfact" placeholder="My locker is 42" aria-label="Something to remember"><button class="b small" data-nav data-key="dp:nbfactgo">Remember</button></form></div>');
    if (!nb.facts.length) facts.firstChild.appendChild(h('<p class="muted">Nothing yet. Say "remember that…" any time.</p>'));
    nb.facts.slice().reverse().forEach((f, i) => { const r = h('<div class="dp-item"><i></i><div><b></b><small>' + esc(D.ago ? D.ago(f.at) : '') + '</small></div><button class="dp-del" data-nav data-key="dp:nbf' + i + '" aria-label="Forget this">' + CLOSE + '</button></div>'); r.querySelector('b').textContent = f.t.replace(/^./, (c) => c.toUpperCase()); r.querySelector('.dp-del').onclick = () => { DU.notebook.forget(f.t); paintTab(); }; facts.firstChild.appendChild(r); });
    facts.querySelector('form').onsubmit = (e) => { e.preventDefault(); const v = facts.querySelector('input').value.trim(); if (!v) return; const it = B.understand('remember ' + v); if (it.secret) { D.toast({ icon: 'lock', c: '#96969f', title: 'Not that', text: 'Deuce doesn\'t keep passwords or codes. A password manager is the safe place.' }); return; } DU.notebook.add(v); paintTab(); };
    add('Things to remember', 'Ask "what do you know about me?" any time. Deuce won\'t keep passwords or codes.', facts);
    const wipe = h('<button class="b small danger" data-nav data-key="dp:nbwipe">' + D.glyph('trash', 2) + 'Forget everything</button>');
    wipe.onclick = () => { if (!wipe.dataset.sure) { wipe.dataset.sure = '1'; wipe.lastChild.textContent = 'Forget everything? Press again'; return; } DU.notebook.clear(); paintTab(); };
    box.appendChild(wipe);
    body.appendChild(box);
  }
  D.on('reminders', () => { if (open && tab === 'reminders') paintTab(); });
  D.on('notebook', () => { if (open && tab === 'notebook') paintTab(); });

  // ---- the orb in the dock, Super + C, and clicking away --------------------------------------------------------
  let dockBtn = null;
  function paintDock() { if (dockBtn) { dockBtn.classList.toggle('on', open); dockBtn.querySelector('.dp-orb').dataset.phase = el ? orb.dataset.phase : 'idle'; } }
  function addDock() {
    const shelf = D.$('#desk .dshelf'), launch = shelf && shelf.querySelector('.launch');
    if (!shelf || dockBtn) return;
    dockBtn = h('<button class="launch dp-dock" aria-label="Deuce (Super + C)" title="Deuce"><span class="dp-orb" data-phase="idle">' + orbSvg(30) + '</span></button>');
    dockBtn.onclick = () => { if (open) P.hide(); else P.show(); };
    shelf.insertBefore(dockBtn, launch);
    const paint = () => { dockBtn.hidden = !DU.cfg().on; };
    D.on('deuce', paint); paint();
  }
  D.on('desk', (on) => { if (on) addDock(); else P.hide(); });
  addEventListener('keydown', (e) => {
    if (!D.desk.on || D.asleep) return;
    if (e.metaKey && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); e.stopPropagation(); if (!DU.cfg().on) return; if (open) P.hide(); else P.show(); }
  }, true);
  // the panel's own keys: Enter sends what you typed (or presses the button), Esc closes it
  D.keyFirst.push((e) => {
    if (!open || !el || !el.contains(e.target) || e.ctrlKey || e.metaKey || e.altKey) return false;
    const t = e.target;
    if (e.key === 'Escape') { e.preventDefault(); P.hide(); return true; }
    if (e.key === 'Enter' && (t.tagName === 'INPUT' || t.tagName === 'SELECT')) { e.preventDefault(); if (t.form) t.form.requestSubmit(); return true; }
    if ((e.key === 'Enter' || e.key === ' ') && t.tagName === 'BUTTON') { e.preventDefault(); t.click(); return true; }
    return false;
  });
  addEventListener('pointerdown', (e) => { if (open && el && !el.contains(e.target) && !(dockBtn && dockBtn.contains(e.target)) && !e.target.closest('#dialog,.toast,#osk')) P.hide(); }, true);
  addEventListener('resize', () => { if (open) place(); });

  // the Dice Bar: a question goes to Deuce
  D.deuceAsk = (q) => { P.show(); DU.ask(q); };
})();
