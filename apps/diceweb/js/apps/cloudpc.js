// Dice Cloud PC: a computer of your own, in the cloud.
//
// Rent a computer (a "VM") from any cloud company, with Ubuntu, and run one line on it
// (DiceOS's cloudpc/install.sh). Then add it here with its address and key, and:
//   - Dice Cloud keeps your files on it, with all the room its disk has (still locked here first);
//   - its desktop opens on the TV or the desktop (in the browser, behind a password);
//   - on the desktop, DiceGaming plays its games (with a graphics card and Sunshine).
(function () {
  'use strict';
  const D = window.Dice, h = D.h, esc = D.esc;
  const LINE = 'curl -fsSL https://raw.githubusercontent.com/dpatel7-dev/DiceOS/main/cloudpc/install.sh | sudo sh -s -- --desktop';
  const list = () => (Array.isArray(D.state.cloudpcs) ? D.state.cloudpcs : (D.state.cloudpcs = []));
  const GB = (n) => (n >= 1024 ** 4 ? (n / 1024 ** 4).toFixed(1) + ' TB' : n >= 1024 ** 3 ? Math.round(n / 1024 ** 3) + ' GB' : Math.round(n / 1048576) + ' MB');
  const clean = (u) => { u = String(u || '').trim().replace(/\/+$/, ''); return /^https?:\/\//.test(u) ? u : 'https://' + u; };
  async function status(pc) {
    try {
      const r = await fetch(pc.url + '/api/status', { headers: { 'X-Dice-Key': pc.key }, cache: 'no-store' });
      if (r.status === 401) return { ok: false, error: 'It didn\'t take the key. Check it against the end of the setup.' };
      if (!r.ok) return { ok: false, error: 'It answered ' + r.status + '.' };
      return await r.json();
    } catch (e) { return { ok: false, error: 'Can\'t reach it. Is it switched on (in your cloud company\'s page), and are ports 80 and 443 open?' }; }
  }
  D.cloudpc = { list, status };

  D.register({ id: 'cloudpc', mount(root, ctx) {
    const tv = ctx.mode === 'run';
    root.classList.add('cpc');
    root.innerHTML = '<div class="cpc-in" data-scroll="30"></div>';
    const inner = root.querySelector('.cpc-in');
    const info = {};
    let alive = true;

    function paint() {
      if (!alive) return;
      const k = D.nav.el && root.contains(D.nav.el) && D.nav.el.dataset.key;
      const pcs = list();
      let out = '<header class="cpc-head"><span class="cpc-ico"></span><div><h1>Dice Cloud PC</h1><p>A computer of your own, in the cloud. Its desktop on your ' + (tv ? 'TV' : 'screen') + ', far more room for Dice Cloud, and (with a graphics card) its games.</p></div></header>';
      pcs.forEach((pc, i) => {
        const s = info[pc.url];
        const st = s && s.storage, frac = st && st.quota ? Math.min(1, st.used / st.quota) : 0;
        const kept = D.drive && D.drive.ownServer && D.drive.ownServer() && D.drive.server() === pc.url;
        out += '<section class="cpc-pc glass"><div class="cpc-top"><span class="cpc-dot ' + (!s ? 'wait' : s.ok === false ? 'off' : 'on') + '"></span><div><h2>' + esc(pc.name || (s && s.name) || new URL(pc.url).hostname) + '</h2><small>' + esc(pc.url.replace(/^https?:\/\//, '')) + '</small></div>' +
          '<button class="b small" data-nav data-key="cpc:more:' + i + '">' + D.glyph('dots', 2) + 'More</button></div>';
        if (!s) out += '<p class="muted">Asking it how it is…</p>';
        else if (s.ok === false) out += '<p class="cpc-err">' + esc(s.error) + '</p><div class="cpc-acts"><button class="b small" data-nav data-key="cpc:retry:' + i + '">Try again</button></div>';
        else {
          out += '<div class="cpc-facts"><span><b>' + GB(Math.max(0, st.quota - st.used)) + '</b> free for Dice Cloud</span>' + (s.cpus ? '<span><b>' + s.cpus + '</b> processors</span>' : '') + '<span>Up for <b>' + D.mins(Math.round(s.uptime / 60)) + '</b></span></div>' +
            '<span class="cpc-meter" aria-hidden="true"><i style="width:' + (frac * 100).toFixed(1) + '%"></i></span>' +
            '<div class="cpc-acts" data-row>' +
            (s.desktop ? '<button class="b go" data-nav data-key="cpc:desk:' + i + '"' + (i === 0 ? ' data-first' : '') + '>' + D.glyph('desktop', 2) + 'Open its desktop</button>' : '') +
            (kept ? '<button class="b" data-nav data-key="cpc:files:' + i + '">' + D.glyph('cloud', 2) + 'Dice Cloud is kept here</button>' : '<button class="b' + (s.desktop ? '' : ' go') + '" data-nav data-key="cpc:store:' + i + '">' + D.glyph('cloud', 2) + 'Keep Dice Cloud here</button>') +
            (s.gaming && !tv ? '<button class="b" data-nav data-key="cpc:games:' + i + '">' + D.glyph('pad', 2) + 'Play its games</button>' : '') + '</div>' +
            (s.desktop && s.login ? '<p class="muted cpc-login">Its desktop asks for a name and password: <b>' + esc(s.login.user) + '</b> and <b class="cpc-pw" data-pw="' + esc(s.login.password) + '">••••••••</b> <button class="b small" data-nav data-key="cpc:pw:' + i + '">Show</button></p>' : '') +
            (!s.desktop ? '<p class="muted">No desktop on it yet: run the setup again on it with <code>--desktop</code> at the end.</p>' : '');
        }
        out += '</section>';
      });
      out += '<section class="cpc-add"><button class="b' + (pcs.length ? '' : ' go') + '" data-nav data-key="cpc:add"' + (pcs.length ? '' : ' data-first') + '>' + D.glyph('plus', 2) + 'Add your Cloud PC</button></section>';
      out += '<section class="cpc-how"><h2>' + (pcs.length ? 'Another one' : 'Getting one') + '</h2><ol class="dg-steps">' +
        '<li><b>Rent a computer in the cloud</b> from any cloud company, with <b>Ubuntu 24.04</b>. A small one (2 processors, 4 GB of memory) is plenty for a desktop and files; for games, one with an NVIDIA graphics card, by the hour.</li>' +
        '<li><b>Let in ports 80 and 443</b> in its firewall settings (for games, Sunshine\'s too: the setup says which).</li>' +
        '<li><b>Run this one line on it</b> (in its own terminal, or over SSH):<div class="cpc-line"><code>' + esc(LINE) + '</code><button class="b small" data-nav data-key="cpc:copy">' + D.glyph('copy', 2) + 'Copy</button></div>Add <code>--gaming</code> on a computer with a graphics card.</li>' +
        '<li><b>Add it here</b> with the address and key the setup shows at the end.</li></ol>' +
        '<p class="muted">The rent is between you and the cloud company. Switch it off in their page when you\'re not using it, and it costs less.</p></section>';
      inner.innerHTML = out;
      const ico = inner.querySelector('.cpc-ico'); if (ico) ico.appendChild(D.G.appIconEl('cloudpc', 56));
      wire();
      const el = k && inner.querySelector('[data-key="' + k + '"]');
      if (el) D.nav.focus(el, { scroll: false }); else if (tv) D.nav.first(root);
    }
    function wire() {
      const on = (sel, f) => inner.querySelectorAll(sel).forEach((b) => { b.onclick = () => f(+b.dataset.key.split(':')[2], b); });
      on('[data-key="cpc:add"]', add);
      on('[data-key="cpc:copy"]', (n, b) => D.copy(LINE, b));
      on('[data-key^="cpc:retry:"]', (i) => { delete info[list()[i].url]; paint(); look(list()[i]); });
      on('[data-key^="cpc:desk:"]', (i) => desk(list()[i]));
      on('[data-key^="cpc:store:"]', (i) => keepHere(list()[i]));
      on('[data-key^="cpc:files:"]', () => D.launch('cloud'));
      on('[data-key^="cpc:games:"]', (i) => D.launch('gaming', { arg: 'addhost:' + new URL(list()[i].url).hostname }));
      on('[data-key^="cpc:pw:"]', (i, b) => { const pw = b.parentElement.querySelector('.cpc-pw'); const shown = b.textContent === 'Hide'; pw.textContent = shown ? '••••••••' : pw.dataset.pw; b.textContent = shown ? 'Show' : 'Hide'; });
      on('[data-key^="cpc:more:"]', more);
    }
    async function look(pc) { info[pc.url] = await status(pc); paint(); }
    function desk(pc) {
      const url = pc.url + '/desktop/vnc.html?path=desktop/websockify&autoconnect=1&resize=remote&reconnect=1';
      if (D.sys) return D.sys.open(url, { app: true, full: tv, name: (pc.name || 'Cloud PC') + ' desktop' });
      window.open(url, '_blank', 'noopener');
    }
    async function keepHere(pc) {
      if (!D.drive || !D.cloud || !D.cloud.on()) return D.ask({ title: 'Turn on Dice Cloud first', text: 'Then your files can be kept on your Cloud PC.', buttons: [{ label: 'Open Dice Cloud', value: true, go: true }, { label: 'Cancel', value: false }] }).then((y) => y && D.launch('cloud'));
      const y = await D.ask({ title: 'Keep Dice Cloud on ' + (pc.name || 'your Cloud PC') + '?', text: 'Your files move there (still locked, so it can\'t open them), and all your computers use it. Links to share files come from the Dice website, so they stop working while your files are on your own server.', buttons: [{ label: 'Move my files', value: true, go: true }, { label: 'Cancel', value: false }] });
      if (!y) return;
      D.toast({ icon: 'cloud', c: '#3a9be8', title: 'Moving your files', text: 'You can keep going; it carries on.' });
      try { await D.drive.setServer(pc.url, pc.key); D.toast({ icon: 'cloud', c: '#4fc16b', title: 'Dice Cloud is on your Cloud PC', text: 'Your other computers follow.' }); } catch (e) { D.toast({ icon: 'cloud', c: '#e5534b', title: 'Couldn\'t move them', text: e.message }); }
      paint();
    }
    async function add() {
      const a = await D.ask({ title: 'Add your Cloud PC', text: 'The address the setup showed at the end (it starts with https://).', input: { label: 'Address', placeholder: 'https://203-0-113-7.sslip.io' }, buttons: [{ label: 'Next', value: true, go: true }, { label: 'Cancel', value: false }] });
      if (!a || !a.value || !a.value.trim()) return;
      const k = await D.ask({ title: 'Its key', text: 'The key the setup showed, just under the address.', input: { label: 'Key', placeholder: 'Key' }, buttons: [{ label: 'Add it', value: true, go: true }, { label: 'Cancel', value: false }] });
      if (!k || !k.value || !k.value.trim()) return;
      const pc = { url: clean(a.value), key: k.value.trim(), at: Date.now() };
      const s = await status(pc);
      if (s.ok === false) return D.toast({ icon: 'cloud', c: '#e5534b', title: 'Couldn\'t add it', text: s.error });
      pc.name = s.name || '';
      D.state.cloudpcs = list().filter((x) => x.url !== pc.url).concat(pc); D.save();
      info[pc.url] = s;
      D.toast({ icon: 'cloud', c: '#4fc16b', title: 'Added ' + (pc.name || 'your Cloud PC'), text: GB(Math.max(0, s.storage.quota - s.storage.used)) + ' of room.' });
      paint();
    }
    async function more(i) {
      const pc = list()[i];
      const v = await D.ask({ title: pc.name || pc.url, text: pc.url, buttons: [{ label: 'Rename', value: 'name', go: true }, { label: 'Take it off this list', value: 'rm', danger: true }, { label: 'Cancel', value: null }] });
      if (v === 'name') { const r = await D.ask({ title: 'Its name', input: { label: 'Name', value: pc.name || '' }, buttons: [{ label: 'Save', value: true, go: true }, { label: 'Cancel', value: false }] }); if (r && r.value && r.value.trim()) { pc.name = r.value.trim().slice(0, 40); D.save(); paint(); } }
      if (v === 'rm') {
        if (D.drive && D.drive.server && D.drive.server() === pc.url) return D.toast({ icon: 'cloud', c: '#e5534b', title: 'Dice Cloud is kept on it', text: 'Move your files back first: Dice Cloud, Where your files are kept.' });
        D.state.cloudpcs = list().filter((x) => x !== pc); D.save(); paint();
      }
    }
    paint();
    list().forEach(look);
    const t = setInterval(() => { if (root.isConnected) list().forEach(look); }, 60000);
    ctx.legend([['a', 'Select'], ['b', 'Back']]);
    return { unmount() { alive = false; clearInterval(t); } };
  } });
})();
