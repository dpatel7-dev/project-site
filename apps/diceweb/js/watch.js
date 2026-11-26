// TV channels and streaming apps on DiceTV.
//
// Channels like MSG, NBC, CBS, ABC and ESPN, each opened the real way:
//   1. an antenna (free local channels: ABC, CBS, NBC, FOX, PBS) through a tuner on your
//      network like an HDHomeRun, played full screen by DiceOS;
//   2. your live TV service (YouTube TV, Fubo, Hulu + Live TV, DirecTV Stream, Sling, or your
//      cable company's app), if you have one;
//   3. the channel's own app (MSG and YES are on DAZN, ESPN in the ESPN app, CBS on Paramount+,
//      NBC on Peacock, FOX on FOX One).
// On DiceOS, streaming services open as full-screen apps (each its own, signed in once),
// not browser tabs; Home on the remote comes back.
(function () {
  'use strict';
  const D = window.Dice, h = D.h, esc = D.esc, S = D.S;
  const W = D.watch = {};

  // ---- the services ------------------------------------------------------------------------------
  W.SVC = {
    netflix: { name: 'Netflix', url: 'https://www.netflix.com', c: '#a3202a', find: 'https://www.netflix.com/search?q=' },
    youtube: { name: 'YouTube', url: 'https://www.youtube.com/tv', c: '#d9443c', find: 'https://www.youtube.com/results?search_query=' },
    ytmusic: { name: 'YouTube Music', url: 'https://music.youtube.com', c: '#c4302b', find: 'https://music.youtube.com/search?q=' },
    disney: { name: 'Disney+', url: 'https://www.disneyplus.com', c: '#2a4fb8' },
    hulu: { name: 'Hulu', url: 'https://www.hulu.com', c: '#14a865' },
    prime: { name: 'Prime Video', url: 'https://www.primevideo.com', c: '#1f8fc0' },
    hbomax: { name: 'HBO Max', url: 'https://play.hbomax.com', c: '#3b2bb3', icon: 'hbomax.com' },
    peacock: { name: 'Peacock', url: 'https://www.peacocktv.com', c: '#2b2f6b' },
    paramount: { name: 'Paramount+', url: 'https://www.paramountplus.com', c: '#0b5fd8' },
    apple: { name: 'Apple TV', url: 'https://tv.apple.com', c: '#2b2b30' },
    spotify: { name: 'Spotify', url: 'https://open.spotify.com', c: '#1f9e58', icon: 'spotify.com', find: 'https://open.spotify.com/search/' },
    twitch: { name: 'Twitch', url: 'https://www.twitch.tv', c: '#7a4fd8', find: 'https://www.twitch.tv/search?term=' },
    tubi: { name: 'Tubi', url: 'https://tubitv.com', c: '#5b2bd6' },
    pluto: { name: 'Pluto TV', url: 'https://pluto.tv/live-tv', c: '#2d2d6b', icon: 'pluto.tv' },
    crunchyroll: { name: 'Crunchyroll', url: 'https://www.crunchyroll.com', c: '#e8691c' },
    // sports
    dazn: { name: 'DAZN', url: 'https://www.dazn.com', c: '#3a3a40', line: 'MSG, MSG Sportsnet and YES stream here. With cable, sign in with your TV provider at no extra cost.' },
    espn: { name: 'ESPN', url: 'https://www.espn.com/watch/', c: '#c8102e', icon: 'espn.com', line: 'ESPN, ESPN2, ESPNU and the games on ABC.' },
    foxone: { name: 'FOX One', url: 'https://www.foxone.com', c: '#1f3b8f', line: 'FOX, FS1, FS2, Big Ten Network and FOX News.' },
    nba: { name: 'NBA League Pass', url: 'https://www.nba.com/watch', c: '#1d428a', icon: 'nba.com' },
    nfl: { name: 'NFL+', url: 'https://www.nfl.com/plus/', c: '#013369', icon: 'nfl.com' },
    mlb: { name: 'MLB.TV', url: 'https://www.mlb.com/tv', c: '#0b2a5b', icon: 'mlb.com' },
    fdsn: { name: 'FanDuel Sports Network', url: 'https://www.fanduelsportsnetwork.com', c: '#1474d4' },
    nesn: { name: 'NESN 360', url: 'https://nesn.com/watch', c: '#1b365d', icon: 'nesn.com' },
    // the networks' own sites, for live TV with your TV provider's sign-in
    abc: { name: 'the ABC app', url: 'https://abc.com/watch-live', c: '#1a1a1d', icon: 'abc.com', line: 'Sign in with your TV provider.' },
    nbc: { name: 'the NBC app', url: 'https://www.nbc.com/live', c: '#3b3fbf', icon: 'nbc.com', line: 'Sign in with your TV provider.' },
    cbs: { name: 'Paramount+', url: 'https://www.paramountplus.com/live-tv/', c: '#0b5fd8', icon: 'paramountplus.com' },
    pbs: { name: 'the PBS app', url: 'https://www.pbs.org/livestream/', c: '#2638c4', icon: 'pbs.org' },
    // live TV services: most channels, with a guide
    ytv: { name: 'YouTube TV', url: 'https://tv.youtube.com', c: '#d9443c', live: true },
    hululive: { name: 'Hulu + Live TV', url: 'https://www.hulu.com/live', c: '#14a865', icon: 'hulu.com', live: true },
    fubo: { name: 'Fubo', url: 'https://www.fubo.tv', c: '#e8491d', live: true },
    directv: { name: 'DirecTV Stream', url: 'https://stream.directv.com', c: '#1a6fd6', icon: 'directv.com', live: true },
    sling: { name: 'Sling TV', url: 'https://watch.sling.com', c: '#2b6fd8', icon: 'sling.com', live: true },
    optimum: { name: 'Optimum TV', url: 'https://www.optimum.net/tv/', c: '#e36d1e', icon: 'optimum.net', live: true, cable: true },
    fios: { name: 'Fios TV', url: 'https://tv.verizon.com', c: '#d6202a', icon: 'verizon.com', live: true, cable: true },
    xfinity: { name: 'Xfinity Stream', url: 'https://www.xfinity.com/stream', c: '#5a3fd8', icon: 'xfinity.com', live: true, cable: true },
    spectrum: { name: 'Spectrum TV', url: 'https://watch.spectrum.net', c: '#1c5fbf', icon: 'spectrum.net', live: true, cable: true },
  };
  W.LIVE = ['ytv', 'hululive', 'fubo', 'directv', 'sling', 'optimum', 'fios', 'xfinity', 'spectrum'];

  // ---- the channels ---------------------------------------------------------------------------------
  // app: the channel's own way to watch. local: free with an antenna (tune: what a tuner calls it).
  // notOn: live TV services that don't carry it.
  const NOT_RSN = ['ytv', 'hululive', 'sling'];
  W.CHANNELS = [
    { id: 'abc', name: 'ABC', c: '#2b2b30', local: true, tune: ['abc', 'wabc'], app: ['abc', 'hululive'], line: 'Your local ABC station.' },
    { id: 'cbs', name: 'CBS', c: '#1f4fa8', local: true, tune: ['cbs', 'wcbs'], app: ['cbs'], line: 'Your local CBS station.' },
    { id: 'nbc', name: 'NBC', c: '#5a3fd8', local: true, tune: ['nbc', 'wnbc'], app: ['peacock', 'nbc'], line: 'Your local NBC station. On Peacock too.' },
    { id: 'fox', name: 'FOX', c: '#1f3b8f', local: true, tune: ['fox', 'wnyw'], app: ['foxone'], line: 'Your local FOX station.' },
    { id: 'pbs', name: 'PBS', c: '#2638c4', local: true, tune: ['pbs', 'wnet', 'njpbs', 'thirteen', 'njn'], app: ['pbs'], line: 'Your local PBS station. Free to stream.' },
    { id: 'msg', name: 'MSG', c: '#1f4a9c', app: ['dazn'], notOn: NOT_RSN, line: 'The Knicks and the Rangers.' },
    { id: 'msgsn', name: 'MSG Sportsnet', mono: 'MSG SN', c: '#2a5bb8', app: ['dazn'], notOn: NOT_RSN, line: 'The Devils, the Islanders and the Sabres.' },
    { id: 'yes', name: 'YES', c: '#13386b', app: ['dazn'], notOn: NOT_RSN, line: 'The Yankees, the Nets and NYCFC.' },
    { id: 'sny', name: 'SNY', c: '#e2701e', app: [], notOn: NOT_RSN, line: 'The Mets. With a live TV service that has it, like Fubo or cable.' },
    { id: 'espn', name: 'ESPN', c: '#c8102e', app: ['espn'], line: 'And ESPN2, ESPNU and ABC\'s games, in the ESPN app.' },
    { id: 'fs1', name: 'FS1', c: '#2d3b8f', app: ['foxone'], line: 'And FS2 and the Big Ten Network, on FOX One.' },
    { id: 'tnt', name: 'TNT', c: '#2a2a33', app: ['hbomax'], line: 'TNT Sports, TBS and truTV are on HBO Max.' },
    { id: 'nbatv', name: 'NBA TV', c: '#1d428a', app: ['nba'] },
    { id: 'nfln', name: 'NFL Network', mono: 'NFL N', c: '#013369', app: ['nfl'] },
    { id: 'mlbn', name: 'MLB Network', mono: 'MLB N', c: '#0b2a5b', app: ['mlb'] },
    { id: 'nhln', name: 'NHL Network', mono: 'NHL N', c: '#3a3a40', app: [] },
    { id: 'usa', name: 'USA', c: '#2b5fc8', app: ['peacock'], line: 'Its shows, and some of its sports, are on Peacock.' },
    { id: 'cnbc', name: 'CNBC', c: '#3a6fd8', app: ['peacock'] },
  ];
  // the networks a listing might say that aren't channels in the guide
  const NET_SVC = { peacock: 'peacock', paramount: 'paramount', hbomax: 'hbomax', prime: 'prime', apple: 'apple', netflix: 'netflix', ytv: 'ytv', youtube: 'youtube', dazn: 'dazn', foxone: 'foxone', nba: 'nba', fdsn: 'fdsn', nesn: 'nesn' };
  W.channel = (id) => W.CHANNELS.find((c) => c.id === id);

  // ---- what you have ------------------------------------------------------------------------------
  const st = () => { const s = D.state.tvsvc && typeof D.state.tvsvc === 'object' ? D.state.tvsvc : (D.state.tvsvc = { live: null, have: [], tuner: '' }); if (!Array.isArray(s.have)) s.have = []; return s; };
  W.settings = st;
  W.liveSvc = () => (st().live && W.SVC[st().live] ? st().live : null);
  W.hasSvc = (id) => st().have.includes(id) || st().live === id;

  // ---- the antenna tuner (DiceOS) ---------------------------------------------------------------------
  let lineup = null, lineupAt = 0, lineupBusy = null;
  W.tuner = () => (D.sys && st().tuner) || '';
  W.lineup = async function (fresh) {
    if (!W.tuner()) return null;
    if (lineup && !fresh && Date.now() - lineupAt < 10 * 60000) return lineup;
    if (lineupBusy) return lineupBusy;
    lineupBusy = D.sys.get('/api/tuner?host=' + encodeURIComponent(W.tuner())).then((r) => { lineupBusy = null; if (r && r.ok) { lineup = r.channels; lineupAt = Date.now(); } return r && r.ok ? lineup : null; });
    return lineupBusy;
  };
  const tunerHas = (c, list) => (list || lineup || []).find((x) => c.tune && c.tune.some((t) => x.name.toLowerCase().replace(/[^a-z0-9]/g, '').startsWith(t) || x.name.toLowerCase().split(/[^a-z0-9]+/).includes(t)));
  const byNum = (num, list) => (list || lineup || []).find((x) => x.num === num) || (list || lineup || []).find((x) => x.num.split('.')[0] === String(num).split('.')[0]);

  // ---- the ways to watch a channel, best first ----------------------------------------------------------
  // { how: 'antenna'|'live'|'app', name, url, svc, note }
  W.ways = function (id) {
    const c = W.channel(id), out = [];
    if (!c) {
      // a network that's a service in itself (Peacock, Prime Video, Netflix)
      const s = NET_SVC[id] && W.SVC[NET_SVC[id]];
      if (s) out.push({ how: 'app', svc: NET_SVC[id], name: s.name, url: s.url, have: W.hasSvc(NET_SVC[id]) });
      if (W.liveSvc()) out.push({ how: 'live', svc: W.liveSvc(), name: W.SVC[W.liveSvc()].name, url: W.SVC[W.liveSvc()].url, have: true });
      return out;
    }
    const tuned = c.local && tunerHas(c);
    if (tuned) out.push({ how: 'antenna', name: 'Antenna, channel ' + tuned.num, url: tuned.url, ch: tuned, have: true, note: 'Free, from your antenna.' });
    const mine = c.app.filter((a) => W.hasSvc(a)), live = W.liveSvc();
    mine.forEach((a) => out.push({ how: 'app', svc: a, name: W.SVC[a].name, url: W.SVC[a].url, have: true }));
    if (live && !(c.notOn || []).includes(live) && !mine.includes(live)) out.push({ how: 'live', svc: live, name: W.SVC[live].name, url: W.SVC[live].url, have: true, note: 'Your live TV service.' });
    c.app.filter((a) => !mine.includes(a)).forEach((a) => out.push({ how: 'app', svc: a, name: W.SVC[a].name, url: W.SVC[a].url, have: false, note: W.SVC[a].line }));
    if (!out.length) W.LIVE.filter((l) => !(c.notOn || []).includes(l)).slice(0, 3).forEach((l) => out.push({ how: 'live', svc: l, name: W.SVC[l].name, url: W.SVC[l].url, have: false, note: 'A live TV service that has ' + c.name + '.' }));
    return out;
  };

  // ---- opening things -----------------------------------------------------------------------------------
  // a service as a full-screen app on DiceOS; a new tab in a browser
  W.open = function (svcOrUrl, name) {
    const s = W.SVC[svcOrUrl], url = s ? s.url : svcOrUrl, nm = name || (s ? s.name : D.tv.host(url));
    D.emit('watching', { name: nm, url });
    // one thing on at a time, like a TV: what was on top closes first
    if (D.sys) return W.clear().then(() => D.sys.open(url, { full: true, name: nm }));
    window.open(url, '_blank', 'noopener');
    return Promise.resolve({ ok: true });
  };
  W.find = function (svc, q) {
    const s = W.SVC[svc];
    if (!s) return W.open(svc);
    return W.open(s.find ? s.find + encodeURIComponent(q) : s.url, s.name);
  };
  W.go = function (way) {
    if (!way) return;
    if (way.how === 'antenna') return W.antenna(way.ch);
    return W.open(way.svc || way.url, way.name);
  };
  W.clear = () => (D.sys && D.sys.status && D.sys.status.front ? D.sys.post('/api/apps', { action: 'close' }).then(() => { D.sys.status.front = null; }) : Promise.resolve());
  W.antenna = async function (ch) {
    if (!D.sys) return;
    await W.clear();
    if (D.remote) D.remote.osd('tv', ch.num + '  ' + ch.name);
    const r = await D.sys.post('/api/tuner', { url: ch.url, name: ch.num + ' ' + ch.name });
    if (r && r.ok) D.toast({ icon: 'tv', c: '#3a7bd5', title: 'Channel ' + ch.num + ', ' + ch.name, text: 'From your antenna. Home on the remote comes back.' });
    else if (r && r.need) {
      const ok = await D.ask({ title: 'Get VLC to watch the antenna?', text: 'DiceOS needs a video player for antenna channels. VLC is free, from Flathub.', buttons: [{ label: 'Get VLC', value: true, go: true }, { label: 'Not now', value: false }] });
      if (ok) { const j = await D.sys.post('/api/apps', { action: 'install', id: r.need }); D.toast(j && j.ok ? { icon: 'box', c: '#4fc16b', title: 'Getting VLC', text: 'Try the channel again in a minute or two.' } : { icon: 'box', c: '#ff4d5e', title: 'Couldn\'t get VLC', text: (j && j.error) || '' }); }
    }
    else D.toast({ icon: 'tv', c: '#96969f', title: 'Couldn\'t play channel ' + ch.num, text: (r && r.error) || '' });
    return r;
  };
  // a channel: the best way straight away
  W.watch = async function (id) {
    await W.lineup();
    const ways = W.ways(id), c = W.channel(id);
    const best = ways.find((w) => w.have) || ways[0];
    if (!best) return D.toast({ icon: 'tv', c: '#96969f', title: (c ? c.name : id) + ' needs a live TV service', text: 'Pick yours in TV setup.' });
    if (D.remote && best.how !== 'antenna') D.remote.osd('tv', (c ? c.name : '') + ' on ' + best.name);
    return W.go(best);
  };
  // "channel 7": the antenna's 7.1, or the guide's 7th
  W.number = async function (num) {
    const list = await W.lineup(), hit = list && byNum(num, list);
    if (hit) return W.antenna(hit);
    const n = parseInt(num, 10), c = W.CHANNELS[n - 1];
    if (c) return W.watch(c.id);
    return null;
  };

  // ---- setting up: your live TV service, the apps you have, an antenna ---------------------------------------
  W.setup = async function () {
    const s = st();
    const pick = await D.ask({ title: 'TV setup', text: 'So channels and games open the way you can watch them.',
      buttons: [{ label: 'Live TV service: ' + (W.liveSvc() ? W.SVC[W.liveSvc()].name : 'none'), value: 'live', go: true },
        { label: 'Apps you pay for: ' + (s.have.length ? s.have.length : 'none'), value: 'have' },
        D.sys ? { label: 'Antenna tuner: ' + (s.tuner || 'none'), value: 'tuner' } : null, { label: 'Done', value: null }].filter(Boolean) });
    if (pick === 'live') {
      const v = await D.ask({ title: 'Your live TV service', text: 'The one you watch cable channels with. Its app opens for channels you don\'t have another way.',
        buttons: W.LIVE.map((id, i) => ({ label: W.SVC[id].name, value: id, go: s.live ? s.live === id : i === 0 })).concat([{ label: 'None', value: 'none' }]) });
      if (v) { s.live = v === 'none' ? null : v; D.save(); D.emit('tvsvc'); }
      return W.setup();
    }
    if (pick === 'have') {
      const ids = ['dazn', 'espn', 'foxone', 'peacock', 'paramount', 'hbomax', 'prime', 'netflix', 'disney', 'hulu', 'apple', 'nba', 'nfl', 'mlb'];
      for (;;) {
        const v = await D.ask({ title: 'Apps you pay for', text: 'Ticked ones are tried first. Press one to tick or untick it.',
          buttons: ids.map((id) => ({ label: (s.have.includes(id) ? '✓ ' : '') + W.SVC[id].name, value: id })).concat([{ label: 'Done', value: 'done', go: true }]) });
        if (!v || v === 'done') break;
        s.have = s.have.includes(v) ? s.have.filter((x) => x !== v) : s.have.concat(v);
        D.save();
      }
      D.emit('tvsvc');
      return W.setup();
    }
    if (pick === 'tuner') {
      const r = await D.ask({ title: 'Antenna tuner', text: 'A tuner on your network, like an HDHomeRun, gets free local channels (ABC, CBS, NBC, FOX, PBS) from an antenna. Its name or address:', input: { label: 'Tuner', placeholder: 'hdhomerun.local', value: s.tuner || 'hdhomerun.local' },
        buttons: [{ label: 'Find its channels', value: true, go: true }, { label: 'No tuner', value: 'off' }, { label: 'Cancel', value: false }] });
      if (r && r.ok === 'off') { s.tuner = ''; lineup = null; D.save(); D.emit('tvsvc'); }
      else if (r && r.ok === true && r.value.trim()) {
        s.tuner = r.value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        D.save();
        const list = await W.lineup(true);
        D.toast(list ? { icon: 'tv', c: '#4fc16b', title: list.length + ' antenna channels', text: 'They\'re in TV channels on Home.' } : { icon: 'tv', c: '#ff4d5e', title: 'The tuner didn\'t answer', text: 'Check it\'s on and on the same network. Its address is in its own app.' });
        D.emit('tvsvc');
      }
      return W.setup();
    }
  };

  // ---- the TV channels row on Home ----------------------------------------------------------------------------
  function sub(c) {
    const ways = W.ways(c.id), best = ways.find((w) => w.have) || ways[0];
    if (!best || (best.how === 'live' && !best.have)) return 'Needs live TV';
    if (best.how === 'antenna') return 'Antenna ' + best.ch.num;
    return best.name.replace(/^the /, '').replace(/^\w/, (x) => x.toUpperCase());
  }
  function tile(c) {
    const b = h('<button class="wtile chtile" data-nav data-key="ch:' + c.id + '" data-a="Watch" data-x="Other ways" style="--wc:' + esc(c.c) + '" aria-label="' + esc(c.name) + '"><span class="wmono">' + esc(c.mono || c.name) + '</span><span class="wname">' + esc(sub(c)) + '</span></button>');
    b.onclick = () => { S.play('select'); W.watch(c.id); };
    b._x = () => W.choose(c.id);
    return b;
  }
  W.choose = async function (id) {
    await W.lineup();
    const c = W.channel(id), ways = W.ways(id);
    if (!ways.length) return W.setup();
    const v = await D.ask({ title: 'Watch ' + (c ? c.name : id), text: c && c.line ? c.line : 'Pick how.',
      buttons: ways.map((w, i) => ({ label: w.name + (w.have ? '' : ' (sign up)'), value: 'w' + i, go: i === 0 })).concat([{ label: 'TV setup', value: 'setup' }, { label: 'Cancel', value: null }]) });
    if (v === 'setup') return W.setup();
    if (v) W.go(ways[+v.slice(1)]);
  };
  function antennaTile(ch) {
    const b = h('<button class="wtile chtile ant" data-nav data-key="an:' + esc(ch.num) + '" data-a="Watch" style="--wc:#2f6f8f" aria-label="Channel ' + esc(ch.num) + ', ' + esc(ch.name) + '"><span class="wmono">' + esc(ch.num) + '</span><span class="wname">' + esc(ch.name) + '</span><span class="chtag">Antenna</span></button>');
    b.onclick = () => { S.play('select'); W.antenna(ch); };
    return b;
  }
  let row = null;
  function paint() {
    if (!row || !row.isConnected) return;
    const at = D.nav.el && row.contains(D.nav.el) ? D.nav.el.dataset.key : null;
    row.replaceChildren();
    (lineup || []).slice(0, 24).forEach((ch) => row.appendChild(antennaTile(ch)));
    W.CHANNELS.forEach((c) => row.appendChild(tile(c)));
    if (D.sys && D.inputs) {
      const inp = h('<button class="wtile add" data-nav data-key="ch:inputs" data-a="Open"><span class="wico-box"><span class="wmono">' + D.glyph('tv', 3) + '</span></span><span class="wname">Inputs</span></button>');
      inp.onclick = () => D.inputs.open();
      row.appendChild(inp);
    }
    const set = h('<button class="wtile add" data-nav data-key="ch:setup" data-a="Set up"><span class="wico-box"><span class="wmono">' + D.glyph('gear', 3) + '</span></span><span class="wname">TV setup</span></button>');
    set.onclick = () => W.setup();
    row.appendChild(set);
    if (at) D.nav.focus(row.querySelector('[data-key="' + at + '"]') || set, { scroll: false });
  }
  W.row = function () {
    const s = h('<section class="shelf" data-block id="chshelf"><h2>TV channels <small>Each opens the way you can watch it. ' + D.btn('x') + ' shows the other ways.</small></h2><div class="row" data-row id="chrow"></div></section>');
    row = s.querySelector('#chrow');
    setTimeout(paint);
    if (W.tuner()) W.lineup().then(paint);
    return s;
  };
  D.on('tvsvc', paint);
  W.spot = function (key) {
    if (key === 'ch:inputs') return { kick: 'TV channels', name: 'Inputs', line: 'Your PlayStation, Xbox, cable box and everything else on the TV\'s HDMI. Pick one and the TV switches to it; the remote works it, and Home comes back.' };
    if (key === 'ch:setup') return { kick: 'TV channels', name: 'TV setup', line: 'Your live TV service, the apps you pay for, and an antenna tuner for free local channels.' };
    if (key.startsWith('an:')) { const ch = byNum(key.slice(3)); return ch ? { kick: 'Antenna · channel ' + ch.num, name: ch.name, line: 'Free over the air, from your antenna. Home on the remote comes back.' } : null; }
    const c = W.channel(key.slice(3));
    if (!c) return null;
    const ways = W.ways(c.id), best = ways.find((w) => w.have) || ways[0];
    return { kick: 'TV channels', name: c.name, line: (c.line ? c.line + ' ' : '') + (best ? 'Opens ' + (best.how === 'antenna' ? 'from your antenna, channel ' + best.ch.num : best.name) + (best.have ? '.' : ' (it needs a subscription, or your TV provider\'s sign-in).') : 'Pick your live TV service in TV setup.'), c: c.c };
  };
})();
