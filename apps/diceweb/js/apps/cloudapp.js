// Dice Cloud, the app: your computers, Dice Drop (send a link or a note to another
// computer, like the TV), what's shared, how much room it takes, older versions to go
// back to, and what happened lately. Works with a remote: everything is a button.
// The syncing itself is in js/cloud.js.
(function () {
  'use strict';
  const D = window.Dice, G = window.DiceGfx, h = D.h, esc = D.esc;
  const KB = (n) => (n >= 1024 * 100 ? Math.round(n / 1024) : (n / 1024).toFixed(1)) + ' KB';
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };

  D.register({ id: 'cloud', mount(root, ctx) {
    const C = D.cloud;
    root.classList.add('dca');
    root.innerHTML = '<div class="dca-sky" aria-hidden="true"></div><div class="dca-in"></div>';
    const inner = root.querySelector('.dca-in');
    let pairing = null, versions = null, showCode = false, busyNote = '';

    // ---- off: three ways in ----------------------------------------------------------------------
    function paintOff() {
      inner.innerHTML = '<header class="dca-hero"><div class="dca-ico"></div><div><h1>Dice Cloud</h1><p>Keeps ' + esc(C.what) + ' the same on every computer with DiceOS or DiceWeb, and sends links and notes between them.</p></div></header>' +
        (pairing ? '<section class="dca-pair glass"><h2>Add this computer</h2><p>On a computer that already has Dice Cloud, open Dice Cloud, pick <b>Add a computer</b> and type:</p><b class="dca-big">' + esc(pairing.code) + '</b><p class="muted dca-wait">Waiting for it… This code works for 10 minutes.</p><button class="b small" data-nav data-key="dc:pairstop">Stop</button></section>' :
          '<section class="dca-ways"><button class="dca-way glass" data-nav data-first data-key="dc:new"><b>Turn on Dice Cloud</b><span>Makes your own Dice Cloud code. Start here on your first computer.</span></button>' +
          '<button class="dca-way glass" data-nav data-key="dc:pair"><b>Add this computer with a short code</b><span>Best on a TV: this one shows 8 letters, and you type them on a computer that already has Dice Cloud.</span></button>' +
          '<button class="dca-way glass" data-nav data-key="dc:code"><b>Type my Dice Cloud code</b><span>The 20 letters and numbers from your other computer.</span></button></section>') +
        '<p class="dca-lock">' + D.glyph('lock', 2) + 'Everything is locked on this computer with your code before it leaves, so the website only keeps a box it can\'t open.</p>' +
        (C.error ? '<p class="dca-err">' + esc(C.error) + '</p>' : '');
      const on = (k, f) => { const b = inner.querySelector('[data-key="dc:' + k + '"]'); if (b) b.onclick = f; };
      on('new', async () => { busy('Turning on…'); await C.turnOn(); paint(); });
      on('code', async () => {
        const r = await D.ask({ title: 'Your Dice Cloud code', text: 'It\'s on your other computer, in Dice Cloud: 20 letters and numbers like 7K2QM-….', input: { label: 'Dice Cloud code', placeholder: 'XXXXX-XXXXX-XXXXX-XXXXX' }, buttons: [{ label: 'Join', value: true, go: true }, { label: 'Cancel', value: false }] });
        if (!r || !r.value) return;
        if (!C.valid(r.value)) return D.toast({ icon: 'link', c: '#e5534b', title: 'That isn\'t a Dice Cloud code', text: 'It\'s 20 letters and numbers, like 7K2QM-…' });
        busy('Joining…');
        const ok = await C.turnOn(r.value);
        if (ok) D.toast({ icon: 'cloud', c: '#3a9be8', title: 'Dice Cloud is on', text: 'This computer now shares with your others.' });
        paint();
      });
      on('pair', () => {
        pairing = C.pairStart((ok, from, why) => {
          pairing = null;
          if (ok) D.toast({ icon: 'cloud', c: '#3a9be8', title: 'Dice Cloud is on', text: 'Added by ' + (from || 'your other computer') + '.' });
          else if (why === 'time') D.toast({ icon: 'cloud', c: '#96969f', title: 'The code ran out', text: 'Make a new one and try again.' });
          if (root.isConnected) paint();
        });
        paint();
      });
      on('pairstop', () => { if (pairing) pairing.stop(); pairing = null; paint(); });
      drawIcon();
    }

    // ---- on ----------------------------------------------------------------------------------------------
    function paintOn() {
      const c = D.state.cloud, devs = C.devices(), inbox = C.inbox(), used = c.size || 0, frac = Math.min(1, used / C.LIMIT);
      const status = C.busy ? 'Syncing…' : C.error ? C.error : c.last ? 'Up to date. Synced ' + D.ago(c.last) + '.' : 'Not synced yet.';
      const devCard = (d) => '<button class="dca-dev glass' + (d.me ? ' me' : '') + '" data-nav data-key="dc:dev:' + esc(d.id) + '">' + D.glyph(d.tv ? 'tv' : 'desktop', 3) +
        '<b>' + esc(d.name) + '</b><span>' + esc(d.kind || 'DiceWeb') + (d.v ? ' ' + esc(d.v) : '') + '</span><small>' + (d.me ? 'This one' : d.seen ? 'Seen ' + D.ago(d.seen) : '') + '</small></button>';
      const drop = (d) => '<div class="dca-drop"><div><b>' + esc(d.title || (d.url ? host(d.url) : 'A note')) + '</b><span>' + esc(d.url || d.text.slice(0, 140)) + '</span><small>From ' + esc(d.fromName || 'another computer') + ', ' + D.ago(d.at) + '</small></div>' +
        '<button class="b small go" data-nav data-key="dc:open:' + esc(d.id) + '">' + (d.url ? 'Open' : 'Show') + '</button><button class="b small" data-nav data-key="dc:forget:' + esc(d.id) + '" aria-label="Remove">' + D.glyph('close', 2) + '</button></div>';
      const counts = {};
      Object.entries(C.SECTIONS).forEach(([n, S]) => { try { counts[n] = Object.keys(S.items()).length; } catch (e) { counts[n] = 0; } });
      inner.innerHTML = '<header class="dca-hero"><div class="dca-ico"></div><div><h1>Dice Cloud</h1><p class="' + (C.error ? 'dca-err' : '') + '">' + esc(busyNote || status) + '</p></div>' +
        '<button class="b small go' + (C.busy ? ' syncing' : '') + '" data-nav data-first data-key="dc:sync">' + D.glyph('restart', 2) + (C.busy ? 'Syncing' : 'Sync now') + '</button></header>' +
        '<section><h2>Your computers</h2><div class="dca-devs" data-row>' + devs.map(devCard).join('') +
        '<button class="dca-dev dca-add glass" data-nav data-key="dc:add">' + D.glyph('plus', 3) + '<b>Add a computer</b><span>With the short code it shows</span></button></div></section>' +
        '<section><div class="dca-h2"><h2>Dice Drop</h2><button class="b small go" data-nav data-key="dc:send">' + D.glyph('link', 2) + 'Send a link or a note</button></div>' +
        (inbox.length ? '<div class="dca-drops glass">' + inbox.slice(0, 8).map(drop).join('') + '</div>' : '<p class="muted dca-empty">Links and notes sent here from your other computers show up here, and on DiceTV they pop up as they arrive. From SereneTab, use <b>Send to…</b> in its menu.</p>') + '</section>' +
        '<section><h2>What\'s shared</h2><div class="dca-parts">' + Object.entries(C.SECTIONS).map(([n, S]) => '<div class="srow"><div><b>' + esc(S.name) + '</b><span>' + (counts[n] ? (S.whole ? 'Set up here' : counts[n] + (counts[n] === 1 ? ' thing' : ' things') + ' here') : 'Nothing here yet') + '</span></div><button class="switch ' + (C.shares(n) ? 'on' : '') + '" data-nav data-key="dc:part:' + n + '" role="switch" aria-checked="' + C.shares(n) + '" aria-label="Share ' + esc(S.name) + '"></button></div>').join('') + '</div></section>' +
        '<section><h2>Room</h2><div class="srow"><div><b>' + (used ? KB(used) + ' of ' + KB(C.LIMIT) : 'Not measured yet') + '</b><span>Everything, locked. Notes take the most room.</span></div><span class="dca-meter" aria-hidden="true"><i style="width:' + (frac * 100).toFixed(1) + '%;--m:' + (frac > 0.85 ? '#e5534b' : frac > 0.6 ? '#e5b62e' : '#3fa26b') + '"></i></span></div></section>' +
        '<section><div class="dca-h2"><h2>Older versions</h2>' + (versions ? '' : '<button class="b small" data-nav data-key="dc:vers">See them</button>') + '</div>' +
        (versions ? (versions.length ? '<div class="dca-vers">' + versions.map((v) => '<div class="srow"><div><b>' + esc(new Date(v.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })) + '</b><span>' + D.ago(v.at) + ', ' + KB(v.size) + '</span></div><button class="b small" data-nav data-key="dc:back:' + v.n + '">Go back to this</button></div>').join('') + '</div>' : '<p class="muted dca-empty">None yet. The website keeps the last 5, one every 10 minutes or more apart.</p>') : '<p class="muted dca-empty">Changed or deleted something by mistake? The website keeps the last 5 versions.</p>') + '</section>' +
        '<section><h2>Lately</h2>' + ((c.log || []).length ? '<ul class="dca-log">' + c.log.slice(0, 8).map((l) => '<li><span>' + esc(l.text) + '</span><small>' + D.ago(l.at) + '</small></li>').join('') + '</ul>' : '<p class="muted dca-empty">Nothing yet.</p>') + '</section>' +
        '<section><h2>Your code</h2><div class="cl-code"><span>Type it on your other computers to share with them</span><b>' + (showCode ? esc(c.code) : '•••••-•••••-•••••-•••••') + '</b><small>Anyone who has it can open your Dice Cloud, so keep it like a password.</small></div>' +
        '<div class="dca-btns"><button class="b small" data-nav data-key="dc:show">' + (showCode ? 'Hide it' : 'Show it') + '</button><button class="b small" data-nav data-key="dc:newcode">Make a new code</button><button class="b small" data-nav data-key="dc:off">Turn off here</button><button class="b small danger" data-nav data-key="dc:del">Delete everything from Dice Cloud</button></div></section>';
      drawIcon();
      const on = (sel, f) => inner.querySelectorAll(sel).forEach((b) => { b.onclick = () => f(b.dataset.key.split(':').slice(2).join(':'), b); });
      on('[data-key="dc:sync"]', async () => { await C.sync({ force: true }); });
      on('[data-key^="dc:dev:"]', (id) => device(devs.find((d) => d.id === id)));
      on('[data-key="dc:add"]', addComputer);
      on('[data-key="dc:send"]', () => send());
      on('[data-key^="dc:open:"]', (id) => { const d = inbox.find((x) => x.id === id); if (d) openDrop(d); });
      on('[data-key^="dc:forget:"]', (id) => { C.forget(id); paint(); });
      on('[data-key^="dc:part:"]', (n, b) => { const v = !C.shares(n); b.classList.toggle('on', v); b.setAttribute('aria-checked', v); C.setShare(n, v); });
      on('[data-key="dc:vers"]', async () => { try { versions = await C.versions(); } catch (e) { versions = []; D.toast({ icon: 'cloud', c: '#96969f', title: 'Couldn\'t look', text: e.message }); } paint('dc:vers'); });
      on('[data-key^="dc:back:"]', goBack);
      on('[data-key="dc:show"]', () => { showCode = !showCode; paint(); });
      on('[data-key="dc:newcode"]', () => D.ask({ title: 'Make a new code?', text: 'The old code stops working everywhere, so a lost computer (or anyone who saw it) can\'t get in. You\'ll type the new code on your other computers.', buttons: [{ label: 'Make a new code', value: true, go: true }, { label: 'Cancel', value: false }] })
        .then(async (y) => { if (!y) return; busy('Making a new code…'); const ok = await C.changeCode(); busyNote = ''; showCode = ok; paint(); }));
      on('[data-key="dc:off"]', () => D.ask({ title: 'Turn off Dice Cloud here?', text: 'This computer stops sharing and comes off the list. What\'s in Dice Cloud stays for your other computers, and everything here stays here.', buttons: [{ label: 'Turn off', value: true, go: true }, { label: 'Cancel', value: false }] })
        .then(async (y) => { if (y) { busy('Turning off…'); await C.turnOff(false); busyNote = ''; paint(); } }));
      on('[data-key="dc:del"]', () => D.ask({ title: 'Delete your Dice Cloud?', text: 'The locked box and its older versions are deleted from the website. Each computer keeps its own copy of everything.', buttons: [{ label: 'Delete it', value: true, go: true, danger: true }, { label: 'Cancel', value: false }] })
        .then(async (y) => { if (y) { await C.turnOff(true); paint(); } }));
    }

    // ---- the bits that ask things -------------------------------------------------------------------
    function busy(text) { busyNote = text; const p = inner.querySelector('.dca-hero p'); if (p) p.textContent = text; }
    async function device(d) {
      if (!d) return;
      if (d.me) {
        const r = await D.ask({ title: 'This computer', text: 'What your other computers call it.', input: { label: 'Name', value: d.name }, buttons: [{ label: 'Save', value: true, go: true }, { label: 'Cancel', value: false }] });
        if (r && r.value && r.value.trim()) { C.rename(r.value); paint('dc:dev:' + d.id); }
        return;
      }
      const v = await D.ask({ title: d.name, text: (d.kind || 'DiceWeb') + (d.v ? ' ' + d.v : '') + (d.seen ? ', last seen ' + D.ago(d.seen) : '') + '.', buttons: [{ label: 'Send something', value: 'send', go: true }, { label: 'Take it out', value: 'out', danger: true }, { label: 'Close', value: null }] });
      if (v === 'send') send(d.id);
      if (v === 'out') {
        const y = await D.ask({ title: 'Take ' + d.name + ' out?', text: 'It stops sharing the next time it looks. If it\'s lost or not yours any more, make a new code too, since it still knows this one.', buttons: [{ label: 'Take it out', value: true, go: true, danger: true }, { label: 'Cancel', value: false }] });
        if (y) { await C.removeDevice(d.id); paint(); }
      }
    }
    async function addComputer() {
      const r = await D.ask({ title: 'Add a computer', text: 'On the new computer (or TV), open Dice Cloud and pick "Add this computer with a short code". Then type the 8 letters it shows.', input: { label: 'Short code', placeholder: 'XXXX-XXXX' }, buttons: [{ label: 'Add it', value: true, go: true }, { label: 'Cancel', value: false }] });
      if (!r || !r.value) return;
      try { await C.pairSend(r.value); D.toast({ icon: 'cloud', c: '#3a9be8', title: 'Sent', text: 'The other computer joins in a few seconds.' }); }
      catch (e) { D.toast({ icon: 'cloud', c: '#e5534b', title: 'Couldn\'t add it', text: e.message }); }
    }
    async function send(to, preset) {
      let what = preset;
      if (!what) {
        const r = await D.ask({ title: 'Send a link or a note', text: 'A web address opens in SereneTab over there; anything else shows as a note.', input: { label: 'Link or note', placeholder: 'https://… or a few words' }, buttons: [{ label: 'Next', value: true, go: true }, { label: 'Cancel', value: false }] });
        const v = r && r.value && r.value.trim();
        if (!v) return;
        const isUrl = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(v) && !/\s/.test(v);
        what = isUrl ? { url: /^https?:/i.test(v) ? v : 'https://' + v, title: '' } : { text: v };
      }
      if (!to) {
        const others = C.devices().filter((d) => !d.me);
        if (!others.length) return D.toast({ icon: 'cloud', c: '#96969f', title: 'No other computers yet', text: 'Add one first, with Add a computer.' });
        const tv = others.find((d) => d.tv);
        const buttons = others.slice(0, 4).map((d) => ({ label: d.name, value: d.id, go: tv ? d === tv : d === others[0] }));
        if (others.length > 1) buttons.push({ label: 'All of them', value: 'all' });
        buttons.push({ label: 'Cancel', value: null });
        to = await D.ask({ title: 'Send to…', text: what.url || what.text.slice(0, 120), buttons });
        if (!to) return;
      }
      busy('Sending…');
      const ok = await C.send(to, what);
      busyNote = '';
      D.toast({ icon: 'cloud', c: ok ? '#3a9be8' : '#e5534b', title: ok ? 'Sent' : 'Not sent yet', text: ok ? 'It shows up there in a few seconds.' : 'It goes as soon as Dice Cloud can be reached.' });
      paint();
    }
    function openDrop(d) {
      if (d.url) return C.open(d);
      const buttons = [{ label: 'Close', value: null, go: true }];
      if (D.app('notes')) buttons.unshift({ label: 'Save as a note', value: 'note' });
      if (navigator.clipboard && D.desk && D.desk.on) buttons.unshift({ label: 'Copy', value: 'copy' });
      D.ask({ title: 'From ' + (d.fromName || 'another computer'), text: d.text, buttons }).then((v) => {
        if (v === 'copy') navigator.clipboard.writeText(d.text).catch(() => {});
        if (v === 'note') {
          const dir = D.home() + '/notes', name = 'From ' + (d.fromName || 'Dice Drop').replace(/[\\/:]/g, ' ') + ' ' + new Date(d.at).toLocaleDateString([], { month: 'short', day: 'numeric' }) + '.txt';
          if (!D.L.walk(D.state.disk, dir)) D.L.makeDir(D.state.disk, dir);
          D.L.writeFile(D.state.disk, dir + '/' + name, d.text); D.save(); D.emit('disk');
          D.toast({ icon: 'copy', c: '#e8913a', title: 'Saved', text: name + ', in Notes.' });
        }
      });
    }
    async function goBack(n) {
      busy('Looking…');
      let peek;
      try { peek = await C.peek(+n); } catch (e) { busyNote = ''; paint(); return D.toast({ icon: 'cloud', c: '#96969f', title: 'Couldn\'t look', text: e.message }); }
      busyNote = ''; paint('dc:back:' + n);
      const had = Object.entries(peek.counts).filter(([, k]) => k).map(([name, k]) => C.SECTIONS[name].name + ' (' + k + ')').join(', ');
      const y = await D.ask({ title: 'Go back to this version?', text: 'It had: ' + (had || 'nothing') + '. Every computer goes back to it, and anything newer is replaced. (What\'s there now is kept as an older version, so you can come back.)', buttons: [{ label: 'Go back', value: true, go: true, danger: true }, { label: 'Cancel', value: false }] });
      if (!y) return;
      busy('Going back…');
      const ok = await C.restore(+n);
      busyNote = ''; versions = null;
      D.toast({ icon: 'cloud', c: ok ? '#3a9be8' : '#e5534b', title: ok ? 'Gone back' : 'Couldn\'t go back', text: ok ? 'Your other computers follow in a few seconds.' : C.error });
      paint();
    }

    // ---- painting, keeping your place ---------------------------------------------------------------
    function drawIcon() { const box = inner.querySelector('.dca-ico'); if (box && !box.firstChild) box.appendChild(G.productIcon('cloud', 64)); }
    function paint(keep) {
      const k = keep || (D.nav.el && root.contains(D.nav.el) && D.nav.el.dataset.key);
      const top = inner.scrollTop;
      if (C.on()) paintOn(); else paintOff();
      inner.scrollTop = top;
      const el = k && inner.querySelector('[data-key="' + k + '"]');
      if (el) D.nav.focus(el, { scroll: false }); else if (ctx.mode === 'run') D.nav.first(root);
    }
    paint();
    const offs = [D.on('cloud', () => { if (root.isConnected) paint(); })];
    const tick = setInterval(() => { if (root.isConnected && !C.busy) { const p = inner.querySelector('.dca-hero p'); if (p && C.on() && !busyNote && !C.error && D.state.cloud.last) p.textContent = 'Up to date. Synced ' + D.ago(D.state.cloud.last) + '.'; } }, 20000);
    // asked for something on the way in: a drop to show, a link to send, or a short code to show
    const arg = String(ctx.arg || '');
    if (arg.startsWith('drop:')) { const d = C.inbox().find((x) => x.id === arg.slice(5)); if (d) setTimeout(() => openDrop(d), 200); }
    else if (arg.startsWith('send:') && C.on()) { const u = decodeURIComponent(arg.slice(5)); setTimeout(() => send(null, /^https?:/.test(u) ? { url: u, title: '' } : { text: u }), 200); }
    else if (arg === 'pair' && !C.on()) inner.querySelector('[data-key="dc:pair"]').click();
    ctx.setTitle && ctx.setTitle('Dice Cloud');
    return {
      unmount() { offs.forEach((f) => f && f()); clearInterval(tick); if (pairing) pairing.stop(); },
    };
  } });
})();
