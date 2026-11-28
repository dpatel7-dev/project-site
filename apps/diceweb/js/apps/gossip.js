// gossip: private chat with your friends, as part of DiceOS.
//
// The OS version of gossip from the suite, with Pebble the penguin. It talks to the same relay as gossip
// in Terminal, with the same end-to-end encryption (js/gossipcrypto.js), so DiceOS and Terminal users chat
// with each other. The relay only ever sees sealed envelopes. Your keys stay on this computer.
// The People list holds only the people you add yourself. Someone new who writes to you shows up under
// "Wants to talk", where you can add or block them. Safety numbers let two people check nobody swapped a key.
// Text messages and servers (#rooms you're in) work here; files and calls are for gossip in Terminal.
(function () {
  'use strict';
  const D = window.Dice, h = D.h, esc = D.esc, S = D.S, G = D.G, C = window.GossipCrypto;
  const GS = (D.gossip = {});
  const KEY = 'dice-gossip';
  let V = null;
  try { V = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { V = null; }
  const fresh = () => ({ name: '', identity: null, relay: '', people: [], strangers: {}, rooms: [], chats: {}, unread: {}, blocked: [], changed: {} });
  V = Object.assign(fresh(), V || {});
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(V)); } catch (e) { /* full */ } };
  GS.v = () => V;
  const relayUrl = () => V.relay || (D.onSite ? location.origin + '/api' : 'https://djp7.pythonanywhere.com/api');
  const viaDice = () => D.sys && !D.sys.info.emulated && !D.onSite && !V.relay;
  const N = { state: 'off', token: null, online: new Set(), typing: {}, timer: 0, polling: false, open: false, err: '' };
  GS.net = N;

  // ---- talking to the relay -----------------------------------------------------------------------------------------
  async function post(m) {
    let r;
    if (viaDice()) r = await D.sys.post('/api/gossip', m);
    else { const res = await fetch(relayUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m) }); r = await res.json(); }
    if (!r || r.t === 'err') throw Object.assign(new Error((r && r.msg) || 'The relay didn\'t answer.'), { code: r && r.code });
    return r;
  }
  const call = (t, body) => post(Object.assign({ t, token: N.token }, body || {}));
  const set = (s, err) => { N.state = s; N.err = err || ''; D.emit('gossip'); };
  GS.signIn = async function (create) {
    if (!V.identity || !V.name) return;
    set('connecting');
    try {
      const hello = await post({ t: 'hello' });
      const res = await post({ t: 'auth', nonce: hello.nonce, name: V.name, ...C.bundleOf(V.identity), sig: await C.authProof(V.identity, String(hello.nonce), V.name), create: !!create, mode: 'live' });
      N.token = res.token;
      V.rooms = (res.rooms || []).map((r) => r.name);
      save(); set('online');
      await deliver(res.events);
      watch();
      poll();
      return res;
    } catch (e) {
      N.token = null;
      set('offline', e.code === 'name_taken' ? 'Someone already has the name ' + V.name + '.' : e.code === 'unknown_user' ? 'There\'s no account called ' + V.name + ' on this relay.' : /fetch|network|Failed/i.test(e.message) ? 'gossip\'s relay can\'t be reached from here.' : e.message);
      clearTimeout(N.timer); N.timer = setTimeout(() => GS.signIn(false), 20000);
      throw e;
    }
  };
  function poll() {
    clearTimeout(N.timer);
    if (N.state !== 'online') return;
    N.timer = setTimeout(async () => {
      try { const r = await call('poll'); await deliver(r.events); poll(); }
      catch (e) { if (e.code === 'bad_session' || /fetch|network/i.test(e.message)) GS.signIn(false).catch(() => {}); else poll(); }
    }, document.hidden ? 15000 : N.open ? 1500 : 5000);
  }
  async function watch() { try { const r = await call('watch', { names: V.people.map((p) => p.name) }); N.online = new Set(r.online || []); D.emit('gossip'); } catch (e) { /* later */ } }

  // ---- people and their keys (pinned the first time, warned about if they change) -----------------------------------
  const person = (n) => V.people.find((p) => p.name === n) || V.strangers[n] || null;
  async function lookup(name) {
    const r = await call('lookup', { name });
    const u = r.user;
    if (!(await C.validBundle(u))) throw new Error('Those keys don\'t check out.');
    return u;
  }
  async function peer(name, refresh) {
    let p = person(name);
    if (p && !refresh) return p;
    const u = await lookup(name);
    if (p && p.signPub !== u.signPub) { V.changed[name] = u; save(); D.emit('gossip'); return p; } // keep the old key until you trust the new one
    if (p) { p.dhPub = u.dhPub; save(); return p; }
    V.strangers[u.name] = { name: u.name, signPub: u.signPub, dhPub: u.dhPub };
    save();
    return V.strangers[u.name];
  }
  GS.add = async function (name) {
    name = String(name || '').trim().replace(/^@/, '').toLowerCase();
    if (!C.NAME_RE.test(name) || C.RESERVED.includes(name)) throw new Error('Usernames are 3 to 20 letters, numbers, _ and -.');
    if (name === V.name) throw new Error('That\'s you.');
    if (V.people.some((p) => p.name === name)) return name;
    const u = await lookup(name);
    V.people.push({ name: u.name, signPub: u.signPub, dhPub: u.dhPub, added: Date.now() });
    delete V.strangers[u.name];
    save(); watch(); D.emit('gossip');
    return u.name;
  };
  GS.trust = function (name) { const u = V.changed[name], p = V.people.find((x) => x.name === name); if (u && p) { p.signPub = u.signPub; p.dhPub = u.dhPub; } delete V.changed[name]; save(); D.emit('gossip'); };
  GS.block = async function (name) { if (!V.blocked.includes(name)) V.blocked.push(name); V.people = V.people.filter((p) => p.name !== name); delete V.strangers[name]; save(); try { await call('block', { name }); } catch (e) { /* noted here anyway */ } D.emit('gossip'); };

  // ---- messages -----------------------------------------------------------------------------------------------------
  const chat = (k) => V.chats[k] || (V.chats[k] = []);
  const keep = (k, msg) => { const L = chat(k); if (L.some((x) => x.id === msg.id)) return false; L.push(msg); L.sort((a, b) => a.ts - b.ts); if (L.length > 400) L.splice(0, L.length - 400); return true; };
  async function deliver(events) {
    if (!Array.isArray(events)) return;
    const acks = [];
    for (const ev of events) {
      if (!ev || typeof ev !== 'object') continue;
      if (ev.t === 'msg') { if (await incoming(ev)) acks.push(ev.mid); }
      else if (ev.t === 'presence') { if (ev.online) N.online.add(ev.name); else N.online.delete(ev.name); D.emit('gossip'); }
      else if (ev.t === 'typing') { const k = ev.conv && ev.conv.startsWith('room:') ? '#' + ev.conv.slice(5) : '@' + ev.from; N.typing[k] = { who: ev.from, until: Date.now() + 4000 }; D.emit('gossip'); }
      else if (ev.t === 'renamed') { const p = person(ev.from); if (p) p.name = ev.to; if (V.chats['@' + ev.from]) { V.chats['@' + ev.to] = V.chats['@' + ev.from]; delete V.chats['@' + ev.from]; } save(); D.emit('gossip'); }
      else if (ev.t === 'signed_out') { N.token = null; set('offline', 'Signed out from another place.'); }
    }
    if (acks.length) call('got', { mids: acks }).catch(() => {});
  }
  async function incoming(m) {
    const env = m.env, from = env && env.from;
    if (!from || V.blocked.includes(from)) return true;
    let k;
    if (String(env.conv).startsWith('dm:')) { if (env.conv !== C.dmConv(from, V.name)) return true; k = '@' + from; }
    else if (String(env.conv).startsWith('room:')) k = '#' + env.conv.slice(5);
    else return true;
    if (chat(k).some((x) => x.id === env.id)) return true;
    let p;
    try { p = await peer(from); } catch (e) { return false; } // can't fetch their key now: leave it on the relay
    let payload;
    try { payload = await C.open({ identity: V.identity, me: V.name, env, senderSignPub: p.signPub }); }
    catch (e) {
      if (e.code === 'not_for_me') return true;
      if (e.code === 'bad_signature') { try { await peer(from, true); } catch (er) { /* stay */ } keep(k, { id: env.id, from: '', ts: env.ts, sys: 'A message from ' + from + ' couldn\'t be checked, so it was hidden.' }); save(); D.emit('gossip'); return true; }
      return true;
    }
    const ts = Number.isSafeInteger(m.ts) ? m.ts : env.ts;
    if (payload && payload.call) { if (payload.call.kind === 'offer' || payload.call.type === 'offer') keep(k, { id: env.id, from: '', ts, sys: from + ' called. Calls are in gossip in Terminal.' }); }
    else if (payload && payload.watch) return true;
    else if (payload && payload.file) keep(k, { id: env.id, from, ts, sys: from + ' sent a file (' + String(payload.file.name || 'a file').slice(0, 80) + '). Files are in gossip in Terminal for now.' });
    else if (payload && payload.chunk) return true;
    else if (payload && typeof payload.text === 'string' && payload.text.trim()) keep(k, { id: env.id, from, ts, text: payload.text.slice(0, 4000) });
    else return true;
    delete N.typing[k];
    if (GS.viewing !== k) {
      V.unread[k] = (V.unread[k] || 0) + 1;
      if (payload.text) D.notify({ icon: 'friends', c: '#7cc4ff', title: (k.startsWith('#') ? from + ' in ' + k : from), text: payload.text.slice(0, 140), app: 'gossip' });
    }
    save(); D.emit('gossip');
    return true;
  }
  GS.send = async function (k, text) {
    text = String(text || '').trim().slice(0, 4000);
    if (!text) return;
    const id = C.randomId(), ts = Date.now(), msg = { id, from: V.name, ts, text, mine: true, state: 'sending' };
    keep(k, msg); save(); D.emit('gossip');
    try {
      let recipients, conv;
      if (k.startsWith('@')) {
        const name = k.slice(1);
        if (V.changed[name]) throw new Error(name + '\'s security key changed. Check your safety numbers, then press Trust.');
        const p = await peer(name);
        recipients = [{ name: p.name, dhPub: p.dhPub }]; conv = C.dmConv(V.name, p.name);
      } else {
        const room = k.slice(1), r = await call('members', { room });
        recipients = [];
        for (const u of r.members || []) { if (u.name === V.name || !(await C.validBundle(u))) continue; const p = person(u.name); if (p && p.signPub !== u.signPub) continue; recipients.push({ name: u.name, dhPub: u.dhPub }); }
        conv = 'room:' + room;
      }
      const env = await C.seal({ identity: V.identity, from: V.name, conv, recipients, payload: { text }, id, ts });
      const r = await call('send', { env });
      msg.state = 'sent'; if (r.ts) msg.ts = r.ts;
    } catch (e) { msg.state = 'failed'; msg.why = e.message; }
    save(); D.emit('gossip');
  };
  GS.typing = function (k) { if (N.state !== 'online') return; const conv = k.startsWith('@') ? C.dmConv(V.name, k.slice(1)) : 'room:' + k.slice(1); call('typing', { conv }).catch(() => {}); };
  GS.start = async function (name) {
    name = String(name || '').trim().replace(/^@/, '').toLowerCase();
    if (!C.NAME_RE.test(name) || C.RESERVED.includes(name)) throw new Error('Usernames are 3 to 20 letters, numbers, _ and -, starting with a letter or number.');
    V.identity = V.identity || await C.createIdentity();
    V.name = name; save();
    try { await GS.signIn(true); } catch (e) { if (e.code === 'name_taken' || e.code === 'bad_name') { V.name = ''; save(); } throw e; }
  };
  GS.leave = function () { clearTimeout(N.timer); if (N.token) call('bye').catch(() => {}); V = fresh(); save(); N.token = null; set('off'); };
  // signed in already: keep listening from start-up, so messages arrive even with the app closed
  if (V.identity && V.name && C) setTimeout(() => GS.signIn(false).catch(() => {}), 3000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && N.state === 'online') poll(); });

  // ---- the app ----------------------------------------------------------------------------------------------------
  const ago = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const pebble = (px) => { const c = G.canvas(px, px), m = G.mascot('gossip'); if (m) { const g = c.getContext('2d'); g.imageSmoothingEnabled = false; const k = px / Math.max(m.width, m.height); g.drawImage(m, (px - m.width * k) / 2, (px - m.height * k) / 2, m.width * k, m.height * k); } c.className = 'gs-peb'; return c; };
  D.register({ id: 'gossip', mount(root, ctx) {
    root.classList.add('gossip');
    N.open = true;
    let k = null;
    const paint = () => (V.identity && V.name ? main() : welcome());
    function welcome() {
      root.innerHTML = '<div class="gs-hi"><div class="gs-card"><div class="gs-hpic"></div><h2 class="pix">gossip</h2><p>Private chat with your friends. Only you two can read what you send: not the relay, not anyone else. The same accounts and people as gossip in Terminal.</p>' +
        '<form class="gs-start"><label>Pick a username<input data-nav data-key="gs:name" maxlength="20" autocomplete="off" spellcheck="false" placeholder="' + esc((D.state.name && D.state.name !== 'player' ? D.state.name : 'you').toLowerCase().replace(/[^a-z0-9_-]/g, '') + '-dice') + '"></label><small>3 to 20: small letters, numbers, _ and -. Already use gossip in Terminal? Pick a new name for this computer (like yourname-pi): each computer has its own keys.</small><p class="gs-err" role="alert"></p><button class="b go" data-nav data-key="gs:go">Start</button></form>' +
        '<details class="gs-relay"><summary>A different relay</summary><input data-nav data-key="gs:relay" placeholder="' + esc(relayUrl()) + '"></details></div></div>';
      root.querySelector('.gs-hpic').appendChild(pebble(96));
      const f = root.querySelector('form'), inp = f.querySelector('input');
      f.onsubmit = async (e) => {
        e.preventDefault();
        const r = root.querySelector('.gs-relay input').value.trim(); V.relay = r ? r.replace(/\/+$/, '').replace(/(\/api)?$/, '/api') : ''; save();
        f.querySelector('.gs-err').textContent = 'Making your keys and signing in…';
        try { await GS.start(inp.value || inp.placeholder); paint(); }
        catch (er) { f.querySelector('.gs-err').textContent = N.err || er.message; }
      };
      setTimeout(() => inp.focus(), 50);
    }
    function main() {
      if (!root.querySelector('.gs-main')) {
        root.innerHTML = '<div class="gs-main"><aside class="gs-side"><header class="gs-me"><span class="gs-mepic"></span><div><b></b><small class="gs-st"></small></div></header>' +
          '<form class="gs-add"><input data-nav data-key="gs:add" placeholder="Add someone by username" aria-label="Add someone by username" autocomplete="off" spellcheck="false"><button class="b small" data-nav data-key="gs:addgo">Add</button></form><p class="gs-adderr" role="alert"></p>' +
          '<div class="gs-lists" data-scroll="30"></div></aside><section class="gs-chat"></section></div>';
        root.querySelector('.gs-mepic').appendChild(pebble(34));
        root.querySelector('.gs-add').onsubmit = async (e) => {
          e.preventDefault();
          const i = root.querySelector('.gs-add input'), err = root.querySelector('.gs-adderr');
          err.textContent = '';
          try { const n = await GS.add(i.value); i.value = ''; k = '@' + n; paint(); } catch (er) { err.textContent = er.message; }
        };
      }
      root.querySelector('.gs-me b').textContent = '@' + V.name;
      root.querySelector('.gs-st').textContent = N.state === 'online' ? 'Online' : N.state === 'connecting' ? 'Connecting…' : N.err || 'Offline';
      root.querySelector('.gs-me').dataset.st = N.state;
      side(); talk();
    }
    function side() {
      const box = root.querySelector('.gs-lists'), keepF = D.nav.el && box.contains(D.nav.el) ? D.nav.el.dataset.key : null;
      box.innerHTML = '';
      const item = (key, label, sub, dot) => {
        const b = h('<button class="gs-item ' + (key === k ? 'on' : '') + '" data-nav data-key="gs:' + esc(key) + '"><span class="gs-dot ' + (dot || '') + '"></span><span class="gs-iw"><b></b><small></small></span>' + (V.unread[key] ? '<em>' + V.unread[key] + '</em>' : '') + '</button>');
        b.querySelector('b').textContent = label; b.querySelector('small').textContent = sub || '';
        b.onclick = () => { k = key; V.unread[key] = 0; save(); paint(); setTimeout(() => { const t = root.querySelector('.gs-compose textarea'); if (t) t.focus(); }, 30); };
        return b;
      };
      const last = (key) => { const L = V.chats[key]; const m = L && L[L.length - 1]; return m ? (m.text || m.sys || '').slice(0, 40) : ''; };
      const wants = Object.keys(V.chats).filter((x) => x.startsWith('@') && !V.people.some((p) => '@' + p.name === x) && !V.blocked.includes(x.slice(1)) && V.chats[x].some((m) => !m.mine));
      if (wants.length) { box.appendChild(h('<h4>Wants to talk</h4>')); wants.forEach((x) => box.appendChild(item(x, x.slice(1), last(x), 'new'))); }
      box.appendChild(h('<h4>People</h4>'));
      if (!V.people.length) box.appendChild(h('<p class="gs-none">Nobody yet. Add a friend by their gossip username above. Only people you add are here.</p>'));
      V.people.slice().sort((a, b) => (N.online.has(b.name) - N.online.has(a.name)) || a.name.localeCompare(b.name)).forEach((p) => box.appendChild(item('@' + p.name, p.name, (V.changed[p.name] ? 'Security key changed' : last('@' + p.name)) || (N.online.has(p.name) ? 'Online' : ''), N.online.has(p.name) ? 'on' : '')));
      if (V.rooms.length) { box.appendChild(h('<h4>Servers</h4>')); V.rooms.forEach((r) => box.appendChild(item('#' + r, '#' + r, last('#' + r), 'room'))); }
      if (keepF) { const e = box.querySelector('[data-key="' + keepF + '"]'); if (e) D.nav.focus(e, { scroll: false }); }
    }
    let typedAt = 0;
    function talk() {
      const box = root.querySelector('.gs-chat');
      GS.viewing = k;
      if (!k) { box.innerHTML = '<div class="gs-empty"><div></div><p>Pick someone on the left, or add a friend by their username.</p></div>'; box.querySelector('div > div').appendChild(pebble(80)); return; }
      const name = k.slice(1), isDm = k.startsWith('@'), known = V.people.some((p) => p.name === name);
      if (!box.querySelector('.gs-log') || box.dataset.k !== k || box.dataset.known !== String(known)) {
        box.dataset.k = k; box.dataset.known = String(known);
        box.innerHTML = '<header class="gs-head"><b></b><small></small><span class="gs-hb"></span></header><div class="gs-warn" hidden></div><div class="gs-log" aria-live="polite"></div><p class="gs-typing"></p>' +
          '<form class="gs-compose"><textarea rows="1" data-nav data-key="gs:msg" placeholder="Message" aria-label="Message"></textarea><button class="b go" data-nav data-key="gs:send">Send</button></form>';
        const ta = box.querySelector('textarea');
        box.querySelector('form').onsubmit = (e) => { e.preventDefault(); const v = ta.value; ta.value = ''; ta.style.height = ''; GS.send(k, v); };
        ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); box.querySelector('form').requestSubmit(); } };
        ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; if (Date.now() - typedAt > 2500) { typedAt = Date.now(); GS.typing(k); } };
        const hb = box.querySelector('.gs-hb');
        if (isDm) {
          const safe = h('<button class="b small" data-nav data-key="gs:safe">Safety number</button>');
          safe.onclick = async () => { const p = person(name); if (!p) return; const n = await C.safetyNumber(V.identity.signPub, p.signPub); D.ask({ title: 'Your safety number with ' + name, text: n + '\n\nCompare it with theirs (in gossip: verify ' + V.name + '). The same numbers mean nobody in between swapped a key.', buttons: [{ label: 'OK', value: true, go: true }] }); };
          hb.appendChild(safe);
          if (!known) { const add = h('<button class="b small go" data-nav data-key="gs:addthem">Add</button>'); add.onclick = () => GS.add(name).then(paint).catch((er) => D.toast({ icon: 'friends', c: '#ef4b5a', title: 'Couldn\'t add', text: er.message })); hb.appendChild(add); }
          const blk = h('<button class="b small" data-nav data-key="gs:block">Block</button>');
          blk.onclick = () => D.ask({ title: 'Block ' + name + '?', text: 'Their messages stop arriving, and they\'re taken off your People.', buttons: [{ label: 'Block', value: true, danger: true, go: true }, { label: 'Never mind', value: false }] }).then((ok) => { if (ok) { GS.block(name); k = null; paint(); } });
          hb.appendChild(blk);
        }
      }
      box.querySelector('.gs-head b').textContent = isDm ? name : '#' + name;
      box.querySelector('.gs-head small').textContent = isDm ? (N.online.has(name) ? 'Online' : known ? '' : 'Not in your People') : 'Server';
      const warn = box.querySelector('.gs-warn');
      warn.hidden = !V.changed[name];
      if (V.changed[name]) { warn.innerHTML = '<b>' + esc(name) + '\'s security key changed.</b> That happens when they reinstall gossip, or (rarely) when someone is pretending. Compare safety numbers, then <button class="b small">Trust the new key</button>'; warn.querySelector('button').onclick = () => { GS.trust(name); paint(); }; }
      const log = box.querySelector('.gs-log'), stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 30;
      log.innerHTML = '';
      let day = '';
      (V.chats[k] || []).forEach((m) => {
        const d = new Date(m.ts).toDateString();
        if (d !== day) { day = d; log.appendChild(h('<p class="gs-day">' + esc(new Date(m.ts).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })) + '</p>')); }
        if (m.sys) { log.appendChild(h('<p class="gs-sys"></p>')).textContent = m.sys; return; }
        const b = h('<div class="gs-msg ' + (m.mine ? 'mine' : '') + (m.state === 'failed' ? ' failed' : '') + '"><span class="gs-who"></span><p></p><small></small></div>');
        b.querySelector('.gs-who').textContent = !m.mine && !isDm ? m.from : '';
        b.querySelector('p').textContent = m.text;
        b.querySelector('small').textContent = ago(m.ts) + (m.mine ? (m.state === 'sending' ? ', sending' : m.state === 'failed' ? ', not sent: ' + (m.why || '') : '') : '');
        if (m.state === 'failed') { b.title = 'Click to try again'; b.onclick = () => { V.chats[k] = V.chats[k].filter((x) => x !== m); GS.send(k, m.text); }; }
        log.appendChild(b);
      });
      if (!(V.chats[k] || []).length) log.appendChild(h('<p class="gs-sys">Say hi. What you send is sealed on this computer and opened only on theirs.</p>'));
      if (stick) log.scrollTop = log.scrollHeight;
      const t = N.typing[k];
      box.querySelector('.gs-typing').textContent = t && t.until > Date.now() ? t.who + ' is typing…' : '';
    }
    const off = D.on('gossip', () => { if (root.isConnected) paint(); });
    if (ctx.arg && typeof ctx.arg === 'string') k = ctx.arg;
    paint();
    if (V.identity && N.state !== 'online' && N.state !== 'connecting') GS.signIn(false).then(paint).catch(paint);
    else poll();
    const tick = setInterval(() => { if (k && N.typing[k] && N.typing[k].until < Date.now()) { delete N.typing[k]; talk(); } }, 1500);
    ctx.legend([]);
    return { unmount() { N.open = false; GS.viewing = null; off(); clearInterval(tick); } };
  } });
})();
