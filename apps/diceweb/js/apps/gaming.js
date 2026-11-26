// DiceGaming: big games on any computer, with no gaming PC. On the desktop (games are a
// computer thing; the TV has TV).
//
//   Cloud gaming:    Xbox Cloud Gaming, GeForce NOW and Amazon Luna run the games on their
//                    computers and stream them here (each needs its own account, some a subscription).
//   Dice Cloud PC:   your own computer in the cloud (js/apps/cloudpc.js), streamed the same way.
//   A gaming PC:     if you happen to have one: it runs Sunshine (free), DiceOS runs Moonlight
//                    (free, from the Store), and the game streams over your home network.
(function () {
  'use strict';
  const D = window.Dice, esc = D.esc, h = D.h;
  const MOONLIGHT = 'com.moonlight_stream.Moonlight';
  const CLOUD = [
    { id: 'xbox', name: 'Xbox Cloud Gaming', url: 'https://www.xbox.com/play', c: '#107c10', mono: 'XB', about: 'Xbox games from Game Pass, with a controller' },
    { id: 'gfn', name: 'GeForce NOW', url: 'https://play.geforcenow.com/', c: '#5e9e10', mono: 'GN', about: 'Your own Steam and Epic games, on NVIDIA\'s computers' },
    { id: 'luna', name: 'Amazon Luna', url: 'https://luna.amazon.com/', c: '#6c3ce0', mono: 'LU', about: 'Games from Luna\'s channels, and Prime Gaming' },
  ];
  const QUALITY = [['720p', '720p'], ['1080p', '1080p'], ['1440p', '1440p'], ['4k', '4K']];
  const FPS = [[30, '30'], [60, '60'], [120, '120']];
  const PAL = ['#ff707a', '#f5a623', '#3fb6a8', '#4b9bec', '#7c6cf0', '#d27adf', '#ef6a8a', '#e0753a'];
  const colorOf = (s) => { let x = 0; for (const ch of String(s)) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return PAL[x % PAL.length]; };
  const mono = (n) => { const w = String(n).replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/); return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2)).toUpperCase(); };
  const G = () => D.state.gaming || (D.state.gaming = { hosts: [], quality: '1080p', fps: 60, recent: [] });
  D.gaming = { CLOUD, G };

  function openCloud(s) {
    D.touch && D.touch('gaming');
    if (D.sys) return D.sys.open(s.url, { app: true, name: s.name });
    const w = window.open(s.url, '_blank', 'noopener,popup,width=1440,height=900');
    if (!w) location.href = s.url;
  }
  D.gaming.openCloud = openCloud;
  D.gaming.play = function (host, game) {
    const g = G();
    return D.sys.post('/api/games', { action: 'play', host, game, quality: g.quality, fps: g.fps }).then((r) => {
      if (r && r.ok) {
        g.recent = [{ host, game, at: Date.now() }].concat(g.recent.filter((x) => !(x.host === host && x.game === game))).slice(0, 8);
        D.save();
        D.toast({ icon: 'pad', c: '#7c6cf0', title: 'Starting ' + game, text: 'From ' + host + '. Press Home on the remote to stop playing.' });
      } else D.toast({ icon: 'pad', c: '#96969f', title: 'Couldn\'t start it', text: (r && r.error) || '' });
      return r;
    });
  };

  D.register({ id: 'gaming', mount(root, ctx) {
    const tv = ctx.mode === 'run', os = !!D.sys;
    root.classList.add('dg');
    root.classList.toggle('dg-tv', tv);
    root.innerHTML = '<div class="dg-glow" aria-hidden="true"></div><div class="dg-in" data-scroll="30"></div>';
    const inner = root.querySelector('.dg-in');
    let status = null, hostInfo = {}, pairing = null, timer = 0, alive = true, showPc = false;

    async function refresh() {
      if (os) status = await D.sys.get('/api/apps').catch(() => null);
      await Promise.all(G().hosts.map((x) => look(x.host)));
      paint();
    }
    async function look(host) {
      if (!os || !(status && status.moonlight)) return;
      hostInfo[host] = Object.assign(hostInfo[host] || {}, { busy: true });
      const r = await D.sys.get('/api/games?host=' + encodeURIComponent(host));
      hostInfo[host] = { busy: false, ok: r && r.ok, games: (r && r.games) || [], error: r && !r.ok ? r.error : '', paired: r ? r.paired !== false : true };
    }
    const keep = (f) => { const k = D.nav.el && root.contains(D.nav.el) && D.nav.el.dataset.key; f(); const el = k && root.querySelector('[data-key="' + CSS.escape(k) + '"]'); if (el) D.nav.focus(el, { scroll: false }); else if (tv && !root.contains(D.nav.el)) { const f2 = root.querySelector('[data-nav]'); if (f2) D.nav.focus(f2); } };
    const seg = (key, list, cur) => '<div class="seg" role="group">' + list.map(([v, n]) => '<button data-nav data-key="dg:' + key + ':' + v + '" aria-pressed="' + (String(v) === String(cur)) + '">' + esc(n) + '</button>').join('') + '</div>';

    function paint() {
      if (!alive) return;
      const g = G(), jobs = Object.fromEntries(((status && status.jobs) || []).map((j) => [j.key, j]));
      keep(() => {
        let out = '<header class="dg-head"><div class="dg-logo" aria-hidden="true">' + D.glyph('pad', 4) + '</div><div><h1>DiceGaming</h1><p>Big games on this computer, with your controller. They run in the cloud, so you don\'t need a gaming PC.</p></div></header>';
        const headEnd = out.length;;
        // ---- your gaming PC ----
        out += '<section class="dg-sec"><div class="dg-h2"><h2>Your gaming PC</h2>' + (os && status && status.moonlight ? '<button class="b small go" data-nav data-key="dg:addhost">' + D.glyph('plus', 2) + 'Add a gaming PC</button>' : '') + '</div>';
        if (!os) {
          out += '<div class="dg-card glass"><b>On DiceOS, your own PC\'s games play here</b><p>Your gaming PC runs the game and sends the picture to DiceOS, like a cloud of your own. It uses Moonlight and Sunshine, which are free. In a browser, try the cloud gaming services below.</p></div>';
        } else if (!status) {
          out += '<p class="muted">Looking…</p>';
        } else if (!status.moonlight) {
          const j = jobs[MOONLIGHT];
          out += '<div class="dg-card glass"><b>First: Moonlight</b><p>DiceGaming plays your PC\'s games with Moonlight, from the Store. ' + (status.flathub ? '' : 'The Store gets ready first (a few minutes, the first time).') + '</p>' +
            (j && j.state === 'working' ? '<div class="sto-prog"><i style="width:' + Math.max(4, j.pct) + '%"></i></div><small class="muted">Installing Moonlight… ' + j.pct + '%</small>'
              : (j && j.state === 'failed' ? '<p class="dg-err">' + esc(j.error) + '</p>' : '') + '<button class="b go" data-nav data-key="dg:getml">' + D.glyph('store', 2) + (status.flathub ? 'Install Moonlight' : 'Get the Store ready') + '</button>') + '</div>';
        } else if (!g.hosts.length) {
          out += '<div class="dg-card glass"><b>Add your gaming PC</b><p>On the PC, install Sunshine and leave it running (how, below). Then add the PC here by its name or address, like <code>my-pc.local</code> or <code>192.168.1.20</code>.</p></div>';
        }
        g.hosts.forEach((x) => {
          const info = hostInfo[x.host] || {};
          out += '<div class="dg-host glass"><div class="dg-host-top"><span class="dg-pc" aria-hidden="true">' + D.glyph('desktop', 3) + '</span><div><b>' + esc(x.name || x.host) + '</b><small>' + esc(x.host) + '</small></div>' +
            '<button class="b small" data-nav data-key="dg:hmore:' + esc(x.host) + '">' + D.glyph('dots', 2) + 'More</button></div>';
          if (pairing && pairing.host === x.host) {
            const j = jobs['pair:' + x.host];
            out += '<div class="dg-pair"><p>On the gaming PC, open Sunshine (in its browser: <code>https://localhost:47990</code>), go to <b>PIN</b>, and type:</p><div class="dg-pin">' + esc(pairing.pin) + '</div>' +
              (j && j.state === 'failed' ? '<p class="dg-err">' + esc(j.error) + '</p><button class="b small" data-nav data-key="dg:pair:' + esc(x.host) + '">Try again</button>' : '<p class="muted">Waiting for the PC…</p>') + '</div>';
          } else if (info.busy && !info.games) out += '<p class="muted">Asking it for its games…</p>';
          else if (info.ok) {
            out += '<div class="dg-games" data-row>' + (info.games.length ? info.games.map((n) => '<button class="dg-game" data-nav data-key="dg:play:' + esc(x.host) + '|' + esc(n) + '" data-a="Play" style="--gc:' + colorOf(n) + '"><span class="dg-gm">' + esc(mono(n)) + '</span><span class="dg-gn">' + esc(n) + '</span></button>').join('')
              : '<p class="muted">No games listed. Add some in Sunshine on the PC (Applications).</p>') + '</div>';
          } else if (info.error) {
            out += '<p class="' + (info.paired ? 'dg-err' : 'muted') + '">' + esc(info.paired ? info.error : 'This TV isn\'t paired with it yet.') + '</p><div class="dca-btns">' +
              (!info.paired ? '<button class="b go small" data-nav data-key="dg:pair:' + esc(x.host) + '">Pair with it</button>' : '') + '<button class="b small" data-nav data-key="dg:retry:' + esc(x.host) + '">Try again</button></div>';
          }
          out += '</div>';
        });
        if (os && status && status.moonlight && g.hosts.length) out += '<div class="dg-set"><span>Picture</span>' + seg('q', QUALITY, g.quality) + '<span>Frames a second</span>' + seg('fps', FPS, g.fps) + '</div>';
        out += '</section>';
        // (your own gaming PC goes after the cloud, and stays folded away till you want it)
        let pcPart = out.slice(headEnd);
        out = out.slice(0, headEnd);
        if (!g.hosts.length && !showPc) pcPart = '<section class="dg-sec"><div class="dg-card glass dg-optional"><b>Got a gaming PC at home?</b><p>You don\'t need one. But if you have one, its games can stream here too, over your home network.</p><button class="b small" data-nav data-key="dg:showpc">' + D.glyph('desktop', 2) + 'Use my gaming PC</button></div></section>';
        // ---- cloud gaming ----
        out += '<section class="dg-sec"><div class="dg-h2"><h2>Play in the cloud</h2></div><p class="muted dg-sub">Each opens in its own window and needs your own account there (some need a subscription).' + (os ? ' Home on the remote comes back.' : '') + '</p><div class="dg-clouds" data-row>' +
          CLOUD.map((s) => '<button class="dg-cloud" data-nav data-key="dg:cloud:' + s.id + '" data-a="Open" style="--gc:' + s.c + '"><span class="dg-cico"><b>' + s.mono + '</b></span><span class="dg-cn">' + esc(s.name) + '</span><small>' + esc(s.about) + '</small></button>').join('') + '</div>' +
          (D.app('cloudpc') ? '<div class="dg-card glass dg-cpc"><b>Or your own Dice Cloud PC</b><p>A whole computer in the cloud that\'s yours: rent one with a graphics card by the hour, put DiceOS\'s Cloud PC kit on it, and its games and desktop stream here. It\'s your Dice Cloud storage too.</p><button class="b small go" data-nav data-key="dg:cpc">' + D.glyph('cloud', 2) + 'Open Dice Cloud PC</button></div>' : '') + '</section>';
        out += pcPart;
        // ---- how to set up the PC ----
        if (g.hosts.length || showPc) out += '<section class="dg-sec"><div class="dg-h2"><h2>Setting up a gaming PC</h2></div><ol class="dg-steps">' +
          '<li><b>Install Sunshine on the gaming PC.</b> It\'s free, from LizardByte (on Windows: their installer, from github.com/LizardByte/Sunshine; on Linux: Sunshine on Flathub).</li>' +
          '<li><b>Open Sunshine on the PC</b> (in its browser, <code>https://localhost:47990</code>) and make a name and password for it.</li>' +
          '<li><b>Put both on the same home network.</b> A cable on the PC (and on the TV, if you can) makes it smoothest.</li>' +
          '<li><b>Here: Add a gaming PC</b>, then <b>Pair with it</b>, and type the 4 numbers you\'re shown into Sunshine\'s PIN page.</li>' +
          '<li><b>Pick a game.</b> Your controller works the same as on the PC. Press Home on the remote when you\'re done.</li></ol></section>';
        inner.innerHTML = out;
      });
      wire();
      clearTimeout(timer);
      const busy = Object.values(jobs).some((j) => j.state === 'working') || pairing;
      if (busy) timer = setTimeout(tick, 1200);
    }
    async function tick() {
      if (!alive || !root.isConnected) return;
      status = await D.sys.get('/api/apps').catch(() => status);
      if (pairing) {
        const j = (status.jobs || []).find((x) => x.key === 'pair:' + pairing.host);
        if (j && j.state === 'done') { const host = pairing.host; pairing = null; D.toast({ icon: 'pad', c: '#4fc16b', title: 'Paired', text: 'This TV can play ' + host + '\'s games now.' }); await look(host); }
      }
      if (status.moonlight && G().hosts.some((x) => !hostInfo[x.host])) await Promise.all(G().hosts.map((x) => look(x.host)));
      paint();
    }
    function wire() {
      const on = (sel, f) => inner.querySelectorAll(sel).forEach((b) => { b.onclick = () => f(b.dataset.key.split(':').slice(2).join(':'), b); });
      on('[data-key^="dg:cloud:"]', (id) => openCloud(CLOUD.find((s) => s.id === id)));
      on('[data-key="dg:getml"]', () => D.sys.post('/api/apps', status.flathub ? { action: 'install', id: MOONLIGHT } : { action: 'setup' }).then(refresh));
      on('[data-key="dg:addhost"]', addHost);
      on('[data-key="dg:showpc"]', () => { showPc = true; paint(); });
      on('[data-key="dg:cpc"]', () => D.launch('cloudpc'));
      on('[data-key^="dg:retry:"]', (host) => { hostInfo[host] = { busy: true }; paint(); look(host).then(paint); });
      on('[data-key^="dg:pair:"]', pair);
      on('[data-key^="dg:play:"]', (v) => { const i = v.indexOf('|'); D.gaming.play(v.slice(0, i), v.slice(i + 1)); });
      on('[data-key^="dg:hmore:"]', hostMore);
      on('[data-key^="dg:q:"]', (v) => { G().quality = v; D.save(); paint(); });
      on('[data-key^="dg:fps:"]', (v) => { G().fps = +v; D.save(); paint(); });
    }
    async function addHost() {
      const r = await D.ask({ title: 'Add a gaming PC', text: 'Its name or address on your network, like my-pc.local or 192.168.1.20. (In Sunshine on the PC, or in its network settings.)', input: { value: '', label: 'Name or address' }, buttons: [{ label: 'Add it', value: true, go: true }, { label: 'Cancel', value: false }] });
      const host = r && r.value && r.value.trim().replace(/^https?:\/\//, '').replace(/[/:]\d*$/, '').replace(/\/.*$/, '');
      if (!host) return;
      if (!/^[A-Za-z0-9._:\-[\]%]{1,100}$/.test(host)) return D.toast({ icon: 'help', c: '#ff4d5e', title: 'That isn\'t an address', text: 'Like my-pc.local or 192.168.1.20.' });
      if (!G().hosts.some((x) => x.host === host)) G().hosts.push({ host, name: host.replace(/\.(local|lan|home)$/i, '') });
      D.save();
      hostInfo[host] = { busy: true };
      paint();
      await look(host);
      paint();
    }
    async function pair(host) {
      const pin = String(1000 + Math.floor(Math.random() * 9000));
      pairing = { host, pin };
      await D.sys.post('/api/games', { action: 'pair', host, pin });
      status = await D.sys.get('/api/apps').catch(() => status);
      paint();
    }
    async function hostMore(host) {
      const v = await D.ask({ title: host, buttons: [{ label: 'Stop the game on it', value: 'quit', go: true }, { label: 'Pair again', value: 'pair' }, { label: 'Take it off this list', value: 'rm', danger: true }, { label: 'Cancel', value: null }] });
      if (v === 'quit') D.sys.post('/api/games', { action: 'quit', host }).then((r) => D.toast({ icon: 'pad', c: r && r.ok ? '#4fc16b' : '#96969f', title: r && r.ok ? 'Stopped' : 'Couldn\'t stop it', text: (r && r.error) || 'The game on ' + host + ' has closed.' }));
      if (v === 'pair') pair(host);
      if (v === 'rm') { G().hosts = G().hosts.filter((x) => x.host !== host); D.save(); paint(); }
    }
    // from Dice Cloud PC: "Play its games" adds it as a gaming PC
    const arg = String(ctx.arg || '');
    if (arg.startsWith('addhost:')) {
      const host = arg.slice(8);
      if (/^[A-Za-z0-9.-]{1,100}$/.test(host) && !G().hosts.some((x) => x.host === host)) { G().hosts.push({ host, name: host.split('.')[0] }); D.save(); }
      showPc = true;
    }
    paint();
    refresh();
    ctx.legend([['a', 'Play'], ['b', 'Back']]);
    return {
      onAction(a) { if (a === 'b' && pairing) { pairing = null; paint(); return true; } return false; },
      unmount() { alive = false; clearTimeout(timer); },
    };
  } });
})();
