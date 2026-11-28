// Deuce's brain: a language model that runs on this computer, so Deuce understands whatever you say,
// keeps up with a conversation ("and tomorrow?"), and does things with DiceOS's own abilities.
//
// Where the model lives:
// - On DiceOS: Ollama, set up from Settings, Deuce (diced's Brain; js runs it through /api/brain/chat).
//   The model is picked for the computer: Qwen 3.5, from 2B on a small Pi to 35B on a big PC.
// - In a browser: Chrome's own built-in model (the Prompt API), if this Chrome has it.
// Nothing you say leaves the computer, except the searches it makes on the web for you.
//
// The quick, sure things ("volume 30", "open Netflix") still go straight to Deuce's rules
// (js/deucebrain.js), which are instant. The brain gets what the rules don't understand, questions,
// follow-ups and anything said at length. It works through six tools:
//   do(command)        anything Deuce's rules can do, in a plain command ("set a timer for 10 minutes")
//   web_search(query)  the web, for anything current; it cites what it read, like [1]
//   read_page(url)     the whole of a page it found
//   calculate(expr)    sums and conversions, exactly (js/deucecalc.js)
//   look_at_screen()   what's in the window or page in front
//   write_draft(text)  something longer it wrote for you, with Copy and Save to Notes
(function () {
  'use strict';
  const D = window.Dice, DU = D.deuce, B = window.DeuceBrain, h = D.h, esc = D.esc;
  if (!DU || !B) return;
  const Mind = DU.mind = { history: [], last: 0 };
  const fake = /[?&]fakebrain=1\b/.test(location.search); // the tests' pretend brain (js/emu.js)

  // ---- the tools, as the model sees them -------------------------------------------------------------------------
  const fn = (name, description, props, req) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties: props, required: req || [] } } });
  const str = (description) => ({ type: 'string', description });
  const TOOLS = [
    fn('do', 'Do one thing on this computer or TV with a short plain command. One thing per call. Commands it knows: open netflix · play lofi on youtube · ' +
      'play some music · put on the knicks game · whats the score of the rangers game · volume 30 · mute · pause · next song · set a timer for 10 minutes · ' +
      'remind me to call mom at 6pm · wake me up at 7 on weekdays · turn on dark mode · turn on night light · brightness 50 · start focus mode · end focus mode · ' +
      'switch to the playstation · take a note buy milk · remember my locker is 42 · forget my locker · find my history essay · go to wikipedia.org · ' +
      'take a screenshot · lock the screen · turn off the tv · whats the weather tomorrow · what time is it in tokyo · how many days until christmas · ' +
      'how many ads were blocked today · show my week · show my notebook · turn on traced mode',
    { command: str('The command, like "set a timer for 10 minutes"') }, ['command']),
    fn('web_search', 'Search the web. Use it for anything current or that you are not sure of: news, sports, prices, people, places, facts, how-tos.', { query: str('What to search for') }, ['query']),
    fn('read_page', 'Read a whole web page from the search results when the snippets are not enough.', { url: str('The page\'s address') }, ['url']),
    fn('calculate', 'Work out maths or convert units exactly. Always use this for numbers. Examples: "15% of 80", "(3+4)*2", "5 miles in km", "70 f in c", "3 cups in ml".', { expression: str('The sum or conversion') }, ['expression']),
    fn('look_at_screen', 'Read what is on the screen now: the window or web page in front. Use it when they ask about "this", the page, the window or the screen.', {}),
    fn('write_draft', 'Show something you wrote for them (an email, a message, a story, a plan, notes) with Copy and Save buttons. Use it for writing longer than two sentences.', { title: str('A short title'), text: str('The full text') }, ['text']),
  ];
  const SYSTEM = 'You are Deuce, the assistant built into DiceOS, a computer system for TVs and PCs. You run on this computer itself, so what people say stays private.\n' +
    'How you answer:\n' +
    '- Warm and brief: one to three short sentences in plain words, unless they ask for detail, steps or writing. No headings, no emoji.\n' +
    '- To do anything on the computer, call do with a short plain command, one thing per call, then say it is done in a few words.\n' +
    '- For anything current or that you are not sure of (news, sports, prices, people, places, facts), call web_search first, then answer only from the results, ' +
    'putting the result\'s number in square brackets after each fact, like [1].\n' +
    '- For any sum or unit conversion, call calculate. Never do arithmetic in your head.\n' +
    '- If they ask about the screen, the page, the window, or "this", call look_at_screen first.\n' +
    '- If they ask you to write something longer than two sentences, call write_draft with it, then say one short line.\n' +
    '- Never make up what a tool said. If you cannot do something, say so plainly and suggest what they can do instead.';
  // what changes every time goes last, so the model can reuse its work on the part above
  function context() {
    const now = new Date(), bits = ['Now: ' + now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + ', ' + now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '.'];
    if (D.state.name && D.state.name !== 'player') bits.push('Their name: ' + D.state.name + '.');
    const p = (D.state.home && D.state.home.place) || (D.state.st && D.state.st.place);
    if (p && p.name) bits.push('Their town: ' + p.name + '.');
    if (D.desk && D.desk.on) {
      const wins = (D.desk.wins || []).filter((w) => !w.min), top = D.desk.top && D.desk.top();
      bits.push('On screen: the desktop' + (wins.length ? ', with ' + wins.map((w) => w.app.name + (w === top ? ' (in front)' : '')).join(', ') : ', no windows open') + '.');
    } else bits.push('On screen: DiceTV (the TV view).');
    if (D.M && D.M.now) bits.push('Playing: ' + D.M.now.name + (D.M.now.playing ? '' : ' (paused)') + '.');
    const mode = D.modes && D.modes.current && D.modes.current();
    if (mode) bits.push(mode.name + ' mode is on.');
    const nb = DU.notebook ? DU.notebook.get() : { facts: [], teams: [] };
    if (nb.facts.length) bits.push('They asked you to remember: ' + nb.facts.slice(-12).map((f) => f.t).join('; ') + '.');
    if (nb.teams.length) bits.push('Teams they follow: ' + nb.teams.join(', ') + '.');
    const rem = DU.reminders ? DU.reminders.upcoming().slice(0, 3) : [];
    if (rem.length) bits.push('Their next reminders: ' + rem.map((r) => r.what + ' (' + DU.whenWords(r.at) + ')').join('; ') + '.');
    return bits.join('\n');
  }

  // ---- where the brain is, and is it ready ---------------------------------------------------------------------------
  let st = null, stAt = 0;
  const onDice = () => !!(D.sys && (!D.sys.info.emulated || fake));
  Mind.status = async function (fresh) {
    if (!fresh && st && Date.now() - stAt < (st.ready ? 60000 : 15000)) return st;
    stAt = Date.now();
    if (onDice()) {
      const r = await D.sys.get('/api/brain');
      st = Object.assign({ where: 'dice' }, r && r.ok ? r : { ready: false, error: r && r.error });
    } else st = await browserStatus();
    D.emit('brain', st);
    return st;
  };
  async function browserStatus() {
    if (!('LanguageModel' in window)) return { where: 'browser', ready: false, none: true };
    try {
      const a = await window.LanguageModel.availability({ expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] });
      return { where: 'browser', ready: a === 'available', avail: a, model: 'Gemini Nano, built into Chrome' };
    } catch (e) {
      return { where: 'browser', ready: false, none: true };
    }
  }
  Mind.name = () => (st && st.where === 'browser' ? 'Chrome\'s built-in model' : st && st.model ? (st.choices || []).reduce((n, c) => (c.tag === st.model ? c.name + ' (' + c.tag + ')' : n), st.model) : 'the brain');

  // ---- who answers: the rules, or the brain -----------------------------------------------------------------------------
  const FAST = ['volume', 'media', 'back', 'home', 'cancel', 'none', 'picture'];
  const FOLLOW = /^(and|but|also|so|then|what about|how about|why|why not|how come|tell me more|more|explain|what does (that|it) mean|which|who|whose|is that|are they|was it|thanks|thank you|ok|okay|it|that|this|those|them|do it|yes|yeah|no|nope|sure|really|wait|actually|instead|again)\b/;
  Mind.wants = async function (text, it) {
    const c = DU.cfg();
    if (c.brain === 'off') return false;
    const s = await Mind.status().catch(() => null);
    if (!s || !s.ready) return false;
    if (c.brain === 'always') return !FAST.includes(it.kind);
    if (['unknown', 'ask'].includes(it.kind)) return true;
    if (Date.now() - Mind.last < 3 * 60000 && FOLLOW.test(B.clean(text))) return true;
    return String(text).split(/\s+/).length >= 14; // said at length: the rules would only catch part of it
  };

  // ---- the conversation ---------------------------------------------------------------------------------------------
  Mind.run = async function (text, it) {
    const s = await Mind.status();
    if (Date.now() - Mind.last > 10 * 60000) Mind.history = [];
    Mind.last = Date.now();
    const ui = UI(), sources = [], cards = [];
    ui.step('Thinking');
    const msgs = [{ role: 'system', content: SYSTEM }].concat(Mind.history, [{ role: 'system', content: context() }, { role: 'user', content: String(text).slice(0, 4000) }]);
    let reply = '';
    try {
      for (let round = 0; round < 5; round++) {
        const r = s.where === 'dice' ? await chatDice(msgs, ui) : await chatBrowser(msgs, ui);
        msgs.push(r.msg);
        reply = r.msg.content;
        if (!r.calls.length) break;
        for (const call of r.calls.slice(0, 4)) msgs.push({ role: 'tool', tool_name: call.name, content: await tool(call, ui, sources, cards) });
        if (round === 4) reply = reply || 'Done.';
      }
    } catch (e) {
      // the brain didn't answer: do what the rules would have done
      st = null;
      if (it && !['unknown', 'ask'].includes(it.kind)) { const r = await DU.run(it); return ui.finish(r.said.join(' ') || 'Done.', [], r.cards, true); }
      return ui.finish((e && e.message ? e.message.replace(/\.?$/, '. ') : '') + 'Deuce\'s brain didn\'t answer just now. ' + (onDice() ? 'Settings, Deuce shows how it is.' : ''), [], [], true);
    }
    reply = visible(reply).trim() || (cards.length ? 'Here you go.' : 'Done.');
    ui.finish(reply, sources, cards);
    Mind.history.push({ role: 'user', content: String(text).slice(0, 2000) }, { role: 'assistant', content: reply.slice(0, 3000) });
    Mind.history = Mind.history.slice(-12);
  };
  // what the quick rules did, so the brain can follow on from it
  Mind.note = function (text, said) {
    if (!said) return;
    if (Date.now() - Mind.last > 10 * 60000) Mind.history = [];
    Mind.last = Date.now();
    Mind.history.push({ role: 'user', content: String(text).slice(0, 1000) }, { role: 'assistant', content: String(said).slice(0, 1500) });
    Mind.history = Mind.history.slice(-12);
  };
  // what the model writes, without its thinking out loud
  const visible = (t) => String(t || '').replace(/<think>[\s\S]*?(<\/think>|$)/g, '').replace(/^\s+/, '');

  // the model on DiceOS: its answer streams in a few words at a time
  async function chatDice(msgs, ui) {
    const res = await fetch('/api/brain/chat', { method: 'POST', headers: { 'X-Dice': D.sys.info.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: msgs, tools: TOOLS }) });
    if (!res.ok || !res.body) { let e = ''; try { e = (await res.json()).error; } catch (x) { /* no reason given */ } throw new Error(e || 'The brain isn\'t answering'); }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '', content = '';
    const calls = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let j;
        try { j = JSON.parse(line); } catch (e) { continue; }
        if (j.error) throw new Error(j.error);
        const m = j.message || {};
        if (m.content) { content += m.content; const v = visible(content); if (v) ui.stream(v); }
        if (Array.isArray(m.tool_calls)) calls.push(...m.tool_calls);
      }
    }
    return {
      msg: Object.assign({ role: 'assistant', content }, calls.length ? { tool_calls: calls } : {}),
      calls: calls.map((c) => { const f = c.function || {}; let a = f.arguments || {}; if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { a = {}; } } return { name: f.name, args: a }; }),
    };
  }
  // Chrome's built-in model: no tools of its own, so it answers in JSON, picking a tool or replying
  async function chatBrowser(msgs) {
    const names = TOOLS.map((t) => t.function.name);
    const how = '\nYou can use these tools: ' + TOOLS.map((t) => t.function.name + ' (' + Object.keys(t.function.parameters.properties).join(', ') + '): ' + t.function.description).join('\n') +
      '\nAnswer in JSON only. To use a tool: {"tool": "<name>", "args": {...}}. To answer them: {"tool": "none", "reply": "<what you say>"}.';
    const initial = [{ role: 'system', content: msgs[0].content + how }];
    msgs.slice(1, -1).forEach((m) => initial.push(m.role === 'tool' ? { role: 'user', content: 'Result of ' + m.tool_name + ': ' + m.content } : m.role === 'assistant' ? { role: 'assistant', content: m.content || JSON.stringify({ tool: (m.calls || [{}])[0].name }) } : { role: m.role === 'system' ? 'user' : m.role, content: m.content }));
    const last = msgs[msgs.length - 1];
    const prompt = last.role === 'tool' ? 'Result of ' + last.tool_name + ': ' + last.content : last.content;
    const session = await window.LanguageModel.create({ initialPrompts: initial, expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] });
    try {
      const out = await session.prompt(prompt, { responseConstraint: { type: 'object', properties: { tool: { type: 'string', enum: names.concat('none') }, args: { type: 'object' }, reply: { type: 'string' } }, required: ['tool'] } });
      let j = {};
      try { j = JSON.parse(out); } catch (e) { j = { tool: 'none', reply: out }; }
      if (j.tool && j.tool !== 'none' && names.includes(j.tool)) return { msg: { role: 'assistant', content: '', calls: [{ name: j.tool }] }, calls: [{ name: j.tool, args: j.args || {} }] };
      return { msg: { role: 'assistant', content: j.reply || '' }, calls: [] };
    } finally {
      try { session.destroy(); } catch (e) { /* gone already */ }
    }
  }

  // ---- doing the tools ------------------------------------------------------------------------------------------------
  const NOT_COMMANDS = ['unknown', 'ask', 'none', 'help', 'cancel'];
  async function tool(call, ui, sources, cards) {
    const a = call.args || {};
    try {
      if (call.name === 'do') {
        const cmd = String(a.command || '').trim().slice(0, 300);
        const it = B.understand(cmd, new Date(), { inputs: Object.values(D.state.inputNames || {}) });
        if (NOT_COMMANDS.includes(it.kind)) { ui.step('No command for “' + cmd + '”', 'x'); return 'There is no command for "' + cmd + '". Try another wording from the list, or tell them you can\'t do that.'; }
        if (it.kind === 'power' && it.act !== 'standby') return 'Restarting or shutting down needs them to tell you directly, like "restart the computer". Tell them that.';
        ui.step(cap(cmd));
        const r = await DU.run(it);
        cards.push(...r.cards);
        return r.said.join(' ') || 'Done.';
      }
      if (call.name === 'web_search') {
        const q = String(a.query || '').trim().slice(0, 200);
        ui.step('Searching the web for “' + q + '”');
        const found = await search(q);
        if (!found.length) return 'The search found nothing (or the internet is off). Say so.';
        return found.map((r) => { sources.push({ n: sources.length + 1, title: r.title, url: r.url, site: site(r.url) }); return '[' + sources.length + '] ' + r.title + ' (' + site(r.url) + ')\n' + String(r.snippet || r.text || '').slice(0, 700); }).join('\n\n');
      }
      if (call.name === 'read_page') {
        const url = String(a.url || '');
        ui.step('Reading ' + site(url));
        const text = await readPage(url);
        if (!text) return 'Couldn\'t read that page.';
        if (!sources.some((s) => s.url === url)) sources.push({ n: sources.length + 1, title: site(url), url, site: site(url) });
        const n = sources.find((s) => s.url === url).n;
        return 'Page [' + n + ']:\n' + text.slice(0, 5000);
      }
      if (call.name === 'calculate') {
        const r = window.DeuceCalc && window.DeuceCalc.eval(String(a.expression || ''));
        ui.step('Working out ' + String(a.expression || '').slice(0, 60));
        return r ? r.text : 'That isn\'t something the calculator understands. Write it like "15% of 80" or "5 miles in km".';
      }
      if (call.name === 'look_at_screen') {
        ui.step('Looking at the screen');
        return await screen();
      }
      if (call.name === 'write_draft') {
        ui.step('Writing');
        cards.push(draft(String(a.title || ''), String(a.text || '')));
        return 'It is on the screen with Copy and Save buttons. Now say one short line about it; don\'t repeat it.';
      }
      return 'There is no tool called ' + call.name + '.';
    } catch (e) {
      return 'That didn\'t work: ' + (e.message || 'something went wrong') + '.';
    }
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const site = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return String(u || '').slice(0, 40); } };
  async function search(q) {
    if (onDice()) { const r = await D.sys.post('/api/search', { q }); return (r && r.results) || []; }
    // in a browser: Wikipedia (it lets pages ask it directly)
    const s = await fetch('https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=4&srsearch=' + encodeURIComponent(q)).then((r) => r.json());
    return ((s.query && s.query.search) || []).map((x) => ({ title: x.title + ' - Wikipedia', url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(x.title.replace(/ /g, '_')), snippet: String(x.snippet || '').replace(/<[^>]+>/g, '') }));
  }
  async function readPage(url) {
    if (onDice()) { const r = await D.sys.post('/api/read', { url }); return r && r.ok ? r.text : ''; }
    const m = /^https:\/\/en\.wikipedia\.org\/wiki\/(.+)$/.exec(url);
    if (!m) return '';
    const j = await fetch('https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&origin=*&titles=' + m[1]).then((r) => r.json());
    const pg = Object.values((j.query && j.query.pages) || {})[0];
    return (pg && pg.extract) || '';
  }
  // what's in front: the window's words, or the page SereneTab has open
  async function screen() {
    if (D.desk && D.desk.on) {
      const w = D.desk.top && D.desk.top();
      if (!w) return 'The desktop, with no windows open.';
      const page = w.id === 'browser' && D.serene && D.serene.page && D.serene.page();
      if (page && /^https?:/.test(page.url)) {
        const text = await readPage(page.url).catch(() => '');
        return 'SereneTab, showing ' + (page.title || page.url) + ' (' + page.url + ')' + (text ? ':\n' + text.slice(0, 6000) : '. (Its words can\'t be read from here.)');
      }
      const body = w.el.querySelector('.wbody');
      return 'The ' + w.app.name + ' window (' + (w.el.querySelector('.wt') || {}).textContent + '):\n' + String((body && body.innerText) || '').replace(/\n{3,}/g, '\n\n').slice(0, 6000);
    }
    const view = D.$('#app') || document.body;
    return 'DiceTV:\n' + String(view.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 4000);
  }
  // something written, with Copy and Save to Notes
  function draft(title, text) {
    const c = h('<div class="dm-draft"><div class="dm-dh"><b></b></div><div class="dm-dt" tabindex="0"></div><div class="du-acts" data-row></div></div>');
    c.querySelector('b').textContent = title || 'Draft';
    c.querySelector('.dm-dt').textContent = text;
    const add = (label, icon, run) => { const b = h('<button class="b small" data-nav>' + D.glyph(icon, 2) + '<span>' + esc(label) + '</span></button>'); b.onclick = run; c.querySelector('.du-acts').appendChild(b); };
    add('Copy', 'copy', () => { try { navigator.clipboard.writeText(text); D.toast({ icon: 'copy', c: '#4b7bec', title: 'Copied', text: (title || 'The draft') + ' is ready to paste.' }); } catch (e) { /* no clipboard */ } });
    add('Save to Notes', 'box', () => {
      const L = D.L, dir = D.home() + '/notes';
      if (!L.walk(D.state.disk, dir)) L.makeDir(D.state.disk, dir);
      const base = (title || 'Draft').replace(/[/\\]/g, '-').slice(0, 50);
      let n = base + '.txt', i = 2;
      while (L.walk(D.state.disk, dir + '/' + n)) n = base + ' ' + (i++) + '.txt';
      L.writeFile(D.state.disk, dir + '/' + n, text);
      D.save();
      D.toast({ icon: 'box', c: '#e8913a', title: 'Saved to Notes', text: n.replace(/\.txt$/, '') });
    });
    return c;
  }

  // ---- showing it: Deuce for PC's thread, or the TV's panel -------------------------------------------------------------
  function UI() {
    const P = DU.pcPanel && DU.pcPanel();
    let said = '';
    return {
      step(t, how) { if (P) P.step(t, how); else DU.status(t + '…'); },
      stream(t) { said = t; DU.stream(t.replace(/\s*\[\d{1,2}\]/g, '')); },
      finish(text, sources, cards, plain) {
        const box = cards.length ? h('<div class="du-many"></div>') : null;
        cards.forEach((c) => box.appendChild(c));
        if (P) P.answer(text, sources, box, plain ? null : Mind.name());
        else DU.say(text.replace(/\s*\[\d{1,2}\]/g, ''), box);
        // say it out loud too: the first few sentences, without the source numbers
        if (P) DU.talk(text.replace(/\s*\[\d{1,2}\]/g, '').split(/(?<=[.!?])\s+/).slice(0, 3).join(' ').slice(0, 400));
        return said;
      },
    };
  }

  // ---- Settings, Deuce: the brain ---------------------------------------------------------------------------------------
  const gb = (n) => (n < 10 ? n.toFixed(1).replace(/\.0$/, '') : Math.round(n)) + ' GB';
  Mind.pane = function (pane, kit) {
    const { row, seg } = kit;
    pane.appendChild(h('<h3 style="margin:22px 0 4px">Deuce\'s brain</h3>'));
    const box = h('<div class="spane dm-set" style="gap:8px;padding:0"><p class="muted">Checking…</p></div>');
    pane.appendChild(box);
    let pollT = 0;
    const btn = (label, go, run, key) => { const b = h('<button class="b small' + (go ? ' go' : '') + '" data-nav data-key="dm:' + key + '">' + esc(label) + '</button>'); b.onclick = run; return b; };
    const when = () => row('When Deuce uses it', 'Its quick rules answer the simple things instantly; the brain takes questions, follow-ups and anything they don\'t understand.',
      seg([['auto', 'When needed'], ['always', 'For everything'], ['off', 'Never']], DU.cfg().brain || 'auto', (v) => { DU.cfg().brain = v; D.save(); }, 'dm:when'));
    async function paint(fresh) {
      clearTimeout(pollT);
      if (!kit.here()) return;
      const s = await Mind.status(true).catch(() => null);
      if (!kit.here()) return;
      box.innerHTML = '';
      if (!s) { box.appendChild(h('<p class="note">Couldn\'t check. Try again in a moment.</p>')); return; }
      if (s.where === 'browser') return paintBrowser(s);
      if (s.busy) {
        const b = s.busy, r = h('<div class="srow"><div><b></b><span></span><div class="sto-prog" style="margin-top:8px"><i></i></div></div></div>');
        r.querySelector('b').textContent = b.what === 'install' ? 'Setting up Deuce\'s brain' : 'Getting the model';
        r.querySelector('span').textContent = b.text + (b.pct ? ' (' + b.pct + '%)' : '') + '. You can keep using the computer.';
        r.querySelector('.sto-prog i').style.width = Math.max(3, b.pct || 0) + '%';
        box.appendChild(r);
        pollT = setTimeout(paint, 1500);
        return;
      }
      if (s.error) box.appendChild(h('<p class="note">' + esc(s.error) + '</p>'));
      const pick = (s.choices || []).find((c) => c.tag === s.recommended) || {};
      if (!s.running || !s.ready) {
        box.appendChild(row('Give Deuce a brain', 'A language model that runs right on this computer, so Deuce understands anything you say, keeps up with a conversation, ' +
          'answers questions from the web with its sources, writes things for you and does several things at once. Nothing you say leaves the computer. ' +
          'For this computer: ' + (pick.name || '') + ' (' + (pick.tag || '') + '), a one-time download of about ' + gb(pick.size || 3) + '.',
          btn('Set it up', true, async () => { await D.sys.post('/api/brain', { action: 'install', model: s.recommended }); paint(); }, 'setup')));
        return;
      }
      box.appendChild(row('Ready', 'Deuce is using ' + Mind.name() + ', on this computer.' + (s.machine && s.machine.gpu ? ' It runs on your ' + s.machine.gpu + '.' : ''),
        btn('Try it', true, () => DU.listen(), 'try')));
      box.appendChild(when());
      // the models: the one picked for this computer first; bigger is smarter but slower
      const list = h('<div class="dm-models" role="radiogroup" aria-label="Which model"></div>');
      (s.choices || []).forEach((c) => {
        const on = c.tag === s.model;
        const b = h('<button class="dm-model' + (on ? ' on' : '') + (c.fits ? '' : ' big') + '" role="radio" aria-checked="' + on + '" data-nav data-key="dm:m:' + c.tag + '">' +
          '<span class="dm-dot" aria-hidden="true"></span><span class="dm-mt"><b></b><small></small></span><span class="dm-tags"></span></button>');
        b.querySelector('b').textContent = c.name + ' · ' + c.tag;
        b.querySelector('small').textContent = c.about + ' About ' + gb(c.size) + '.';
        const tags = b.querySelector('.dm-tags');
        if (c.tag === s.recommended) tags.appendChild(h('<i class="rec">Best for this computer</i>'));
        if (c.here && !on) tags.appendChild(h('<i>Downloaded</i>'));
        if (!c.fits) tags.appendChild(h('<i class="warn">Too big for this computer</i>'));
        b.onclick = async () => { if (on) return; if (!c.fits && !confirm(c.name + ' wants more memory than this computer has, so it may be very slow. Use it anyway?')) return; await D.sys.post('/api/brain', { action: 'choose', model: c.tag }); paint(); };
        list.appendChild(b);
      });
      box.appendChild(row('Which model', 'Bigger models are smarter but slower. Switching downloads the new one once.', null));
      box.appendChild(list);
      const extra = (s.models || []).filter((m) => m !== s.model && (s.choices || []).some((c) => c.tag === m));
      if (extra.length) box.appendChild(row('Free up space', 'Delete the models Deuce isn\'t using: ' + extra.join(', ') + '.', btn('Delete them', false, async () => { for (const m of extra) await D.sys.post('/api/brain', { action: 'remove', model: m }); paint(); }, 'rm')));
    }
    async function paintBrowser(s) {
      if (s.ready) { box.appendChild(row('Ready', 'Deuce is using Chrome\'s built-in model, in this browser. Nothing you say leaves the computer.', btn('Try it', true, () => DU.listen(), 'try'))); box.appendChild(when()); return; }
      if (s.avail === 'downloadable' || s.avail === 'downloading') {
        const r = row('Give Deuce a brain', 'Chrome has a language model built in. Get it once (Chrome downloads it, a few GB) and Deuce understands anything you say, in this browser.', null);
        const go = btn('Get it', true, async () => {
          go.disabled = true; go.textContent = 'Getting it…';
          try {
            const sess = await window.LanguageModel.create({ monitor(m) { m.addEventListener('downloadprogress', (e) => { go.textContent = 'Getting it… ' + Math.round((e.loaded || 0) * 100) + '%'; }); } });
            sess.destroy(); paint();
          } catch (e) { go.disabled = false; go.textContent = 'Try again'; }
        }, 'get');
        r.appendChild(go);
        box.appendChild(r);
        return;
      }
      box.appendChild(h('<p class="note">On DiceOS, Deuce gets a brain of its own: a language model that runs on the computer. In a browser, Chrome 148 or newer has one built in on Windows, Mac and Linux. ' +
        'Without one, Deuce does what its quick rules know and looks things up on the web.</p>'));
    }
    paint();
  };

  // keep the brain loaded on DiceOS when Deuce opens, so it answers straight away
  D.on('deuce-open', () => { if (onDice()) Mind.status().then((s) => { if (s.ready) D.sys.post('/api/brain', { action: 'warm' }); }); });
  Mind.TOOLS = TOOLS;
  Mind.SYSTEM = SYSTEM;
  Mind.context = context;
})();
