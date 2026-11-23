// Settings: you, the look, sound, controllers, performance, start up, storage.
(function () {
  'use strict';
  const D = window.Dice, G = D.G, S = D.S, esc = D.esc, h = D.h;
  const SECTIONS = [['you', 'You', 'person', '#ff707a'], ['look', 'Look', 'sun', '#f5c431'], ['sound', 'Sound', 'volume', '#d39cf5'], ['pads', 'Controllers', 'pad', '#7c9cff'],
    ['perf', 'Performance', 'chart', '#8fd16a'], ['start', 'Starting up', 'power', '#ef6a1f'], ['cloud', 'Dice Cloud', 'link', '#3a9be8'], ['storage', 'Storage', 'lock', '#2bc4b2'], ['about', 'About', 'help', '#96969f']];

  // on a computer running Dice, there's more to set: Wi-Fi, the screen, power and updates
  if (D.sys) {
    SECTIONS.splice(2, 0, ['wifi', 'Wi-Fi', 'wifi', '#2bc4b2'], ['display', 'Screen', 'desktop', '#7cc4ff']);
    SECTIONS.splice(SECTIONS.findIndex((x) => x[0] === 'storage'), 0, ['system', 'Power and updates', 'restart', '#ef6a1f']);
  }
  const gb = (n) => (n / 1073741824).toFixed(1) + ' GB';

  D.register({ id: 'settings', mount(root, ctx) {
    root.innerHTML = '<div class="settings"><nav class="slist" aria-label="Settings sections"></nav><div class="spane" aria-live="polite"></div></div>';
    const listEl = root.querySelector('.slist'), pane = root.querySelector('.spane');
    let cur = ctx.arg && SECTIONS.some((s) => s[0] === ctx.arg) ? ctx.arg : 'you', raf = 0;
    SECTIONS.forEach(([id, n, ic, c]) => {
      const b = h('<button class="mi" data-nav data-key="set:' + id + '" data-sound="tab">' + D.icon(ic, c, 2) + esc(n) + '</button>');
      b.onclick = () => { show(id); const f = pane.querySelector('[data-nav]'); if (f && D.input.source !== 'mouse') D.nav.focus(f); };
      b.addEventListener('focus', () => { if (cur !== id) show(id); });
      listEl.appendChild(b);
    });
    const ro = new ResizeObserver(() => root.querySelector('.settings').classList.toggle('narrow', root.clientWidth < 720)); ro.observe(root);

    function row(title, sub, control) {
      const r = h('<div class="srow"><div><b>' + esc(title) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div></div>');
      if (control) r.appendChild(control);
      return r;
    }
    function seg(opts, val, set, key) {
      const el = h('<div class="seg" role="group"></div>');
      opts.forEach(([v, n]) => {
        const b = h('<button data-nav data-key="' + key + ':' + v + '" aria-pressed="' + (v === val) + '">' + esc(n) + '</button>');
        b.onclick = () => { el.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b)); set(v); };
        el.appendChild(b);
      });
      return el;
    }
    function sw(on, set, key, label) {
      const b = h('<button class="switch ' + (on ? 'on' : '') + '" data-nav data-key="' + key + '" role="switch" aria-checked="' + on + '" aria-label="' + esc(label) + '"></button>');
      b.onclick = () => { on = !on; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); set(on); };
      return b;
    }
    const ui = ctx.ui;

    const PANES = {
      you() {
        pane.appendChild(h('<h2>You</h2>'));
        const name = h('<input type="text" data-nav data-key="you:name" maxlength="20" aria-label="Your name">');
        name.value = D.state.name;
        name.addEventListener('change', () => {
          const v = name.value.trim().slice(0, 20) || 'player';
          const oldHome = D.home();
          D.set('name', v);
          // move your folder in the pretend disk to the new name
          const homes = D.L.walk(D.state.disk, '/home');
          const was = oldHome.split('/').pop();
          if (homes && homes.kids[was] && was !== D.user()) { homes.kids[D.user()] = homes.kids[was]; delete homes.kids[was]; D.save(); }
          D.toast({ who: D.state.avatar, title: 'Hello, ' + v, text: 'That\'s your name in ' + D.brand + ' now.' });
        });
        pane.appendChild(row('Name', 'Shown in the menu and in Terminal.', name));
        const av = h('<div class="avatars" data-row></div>');
        ['cubby'].concat(Object.keys(ART.mascots)).forEach((id) => {
          const b = h('<button data-nav data-key="you:av:' + id + '" aria-label="' + esc(id === 'cubby' ? 'Cubby' : ART.mascots[id].name) + '" aria-pressed="' + (D.state.avatar === id) + '" style="--c:' + G.colourOf(id) + '"></button>');
          b.appendChild(G.face(id, 52, G.hexA(G.colourOf(id), 0.25)));
          b.onclick = () => { D.set('avatar', id); av.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b)); };
          av.appendChild(b);
        });
        if (D.sys) {
          const pw = h('<button class="b small" data-nav data-key="you:pw">' + D.glyph('lock', 2) + 'Change</button>');
          pw.onclick = () => D.ask({ title: 'A new password', text: 'For signing in to this computer (sudo, SSH). At least 4 characters.', input: { type: 'password', label: 'New password' }, buttons: [{ label: 'Save it', value: true, go: true }, { label: 'Cancel', value: false }] })
            .then((r) => { if (r && r.value) D.sys.post('/api/password', { password: r.value }).then((x) => D.toast(x.ok ? { icon: 'lock', c: '#4fc16b', title: 'Password changed', text: 'Use it next time this computer asks.' } : { icon: 'lock', c: '#ff4d5e', title: 'Not changed', text: x.error || '' })); });
          pane.appendChild(row('Password', 'The user on this computer is ' + (D.sys.info.user || 'dice') + '.', pw));
        }
        const r = row('Picture', 'Any of the friends, or Cubby.', null);
        r.style.cssText = 'flex-direction:column;align-items:stretch';
        r.appendChild(av);
        pane.appendChild(r);
      },
      look() {
        pane.appendChild(h('<h2>Look</h2>'));
        pane.appendChild(h('<p class="note">Light by day and dark at night, worked out from the time of sunrise and sunset. Or pick one to keep.</p>'));
        pane.appendChild(row('Day or night', D.state.look === 'auto' ? 'It\'s ' + (D.night() ? 'night' : 'day') + ' now.' : '', seg([['auto', 'Follow the clock'], ['day', 'Day'], ['night', 'Night']], D.state.look, (v) => { D.set('look', v); D.applyLook(true); }, 'look')));
        pane.appendChild(row('Brightness', 'Dims the whole screen.', ui.slider(D.state.bright, 0.3, 1, (v) => { D.set('bright', v); D.applyBright(); }, 'look:bright', 'Brightness')));
        const worlds = h('<div class="worlds" data-row></div>');
        const NAMES = { hills: 'Hills', mountains: 'Mountains', beach: 'Beach', city: 'City', forest: 'Forest', autumn: 'Autumn', desert: 'Desert', garden: 'Garden', ice: 'Ice', deep: 'Under the sea', meadow: 'Meadow', pond: 'Pond' };
        Object.keys(D.WORLDS).forEach((w) => {
          const b = h('<button data-nav data-key="look:w:' + w + '" aria-label="' + (NAMES[w] || w) + '" aria-pressed="' + ((D.state.world || 'hills') === w) + '"><span>' + (NAMES[w] || w) + '</span></button>');
          const c = G.Scape.preview(w, D.night(), 160, 100);
          const cv = document.createElement('canvas'); cv.width = c.width; cv.height = c.height; cv.getContext('2d').drawImage(c, 0, 0); cv.className = 'art';
          b.prepend(cv);
          b.onclick = () => { D.set('world', w); if (D.sys) D.sys.saveSettings({ world: w }); worlds.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b)); };
          worlds.appendChild(b);
        });
        const wr = row('Background', 'The moving landscape behind the desktop, DiceTV and Dice Home.', null);
        wr.style.cssText = 'flex-direction:column;align-items:stretch';
        wr.appendChild(worlds);
        pane.appendChild(wr);
        pane.appendChild(row('Home on the desktop', 'The Home folder in the top corner of the desktop.', sw(D.state.deskIcons !== 'none', (v) => D.set('deskIcons', v ? 'home' : 'none'), 'look:icons', 'Home on the desktop')));
        pane.appendChild(row('Less motion', 'Calmer screens: no dissolves, no flying tiles.', sw(D.state.motion === 'less', (v) => { D.set('motion', v ? 'less' : 'full'); document.documentElement.dataset.motion = v ? 'less' : 'full'; }, 'look:motion', 'Less motion')));
      },
      sound() {
        pane.appendChild(h('<h2>Sound</h2>'));
        const sv = D.sys && D.sys.status && D.sys.status.volume;
        if (sv) pane.appendChild(row('Speaker volume', 'This computer\'s own sound output.', ui.slider(sv.level, 0, 1, (v) => { clearTimeout(PANES.vt); PANES.vt = setTimeout(() => D.sys.post('/api/volume', { level: v, muted: false }), 120); }, 'snd:sys', 'Speaker volume')));
        pane.appendChild(row(sv ? 'Dice sounds' : 'Volume', sv ? 'Clicks and Dice Radio, before the speaker.' : 'Everything ' + D.brand + ' plays.', ui.slider(D.state.volume, 0, 1, (v) => { D.set('volume', v); S.setVolume(v); }, 'snd:vol', 'Volume')));
        pane.appendChild(row('Music volume', 'Dice Radio and your songs.', ui.slider(D.state.musicVol, 0, 1, (v) => { D.set('musicVol', v); S.setMusic(v); }, 'snd:music', 'Music volume')));
        pane.appendChild(row('Interface sounds', 'Clicks and chimes as you move around.', sw(D.state.ui, (v) => { D.set('ui', v); S.setUi(v); if (v) S.play('select'); }, 'snd:ui', 'Interface sounds')));
        const t = h('<button class="b small" data-nav data-key="snd:test">' + D.glyph('volume', 2) + 'Play a test chime</button>');
        t.onclick = () => S.play('achieve');
        pane.appendChild(row('Test', 'Can\'t hear anything? Check the volume on your computer too.', t));
      },
      pads() {
        pane.appendChild(h('<h2>Controllers</h2>'));
        const names = D.input.padNames();
        pane.appendChild(h('<p class="note">' + (names.length ? 'Connected: ' + esc(names.map((n) => n.replace(/\(.*?\)/g, '').trim()).join(', ')) : 'No controller yet. Plug one in (or pair it), then press any button on it.') + '</p>'));
        const test = h('<div class="padtest"><canvas width="96" height="56" aria-label="Controller test"></canvas><div><b>Press buttons and move the sticks</b><p class="muted" style="margin:6px 0 12px">They light up here as you press them.</p></div></div>');
        const rum = h('<button class="b small" data-nav data-key="pad:rumble">' + D.glyph('pad', 2) + 'Test rumble</button>');
        rum.onclick = () => S.rumble(500, 0.9);
        test.lastElementChild.appendChild(rum);
        pane.appendChild(test);
        const cv = test.querySelector('canvas');
        const tick = () => { drawPad(cv); raf = requestAnimationFrame(tick); };
        raf = requestAnimationFrame(tick);
        const k = (b, t) => '<span>' + D.btn(b) + '</span><span>' + t + '</span>';
        pane.appendChild(h('<div class="srow" style="display:block"><b>Keys and buttons</b><div class="keys" style="padding:10px 0 0">' + k('a', 'Select') + k('b', 'Back') + k('x', 'More things to do') + k('menu', 'Menu (Ctrl+1 too)') + k('quick', 'Quick access (Ctrl+2 too)') + k('lb', 'Previous tab') + k('rb', 'Next tab') + '</div></div>'));
      },
      perf() {
        pane.appendChild(h('<h2>Performance</h2>'));
        pane.appendChild(row('Overlay', 'Frames a second in the corner of the screen.', seg([[0, 'Off'], [1, 'FPS'], [2, 'Graph'], [3, 'All']], D.state.perf, (v) => { D.set('perf', v); D.perf.show(); }, 'perf:o')));
        pane.appendChild(row('Frame limit for backgrounds', 'The moving pictures. Lower saves battery.', seg([[15, '15'], [30, '30'], [60, '60'], [0, 'None']], D.state.fps, (v) => D.set('fps', v), 'perf:f')));
      },
      start() {
        pane.appendChild(h('<h2>Starting up</h2>'));
        pane.appendChild(row('Start-up animation', 'The die that rolls in when ' + D.brand + ' opens.', seg([['full', 'Full'], ['quick', 'Quick'], ['off', 'Off']], D.state.boot, (v) => D.set('boot', v), 'st:boot')));
        pane.appendChild(row('Start in', 'Where ' + D.brand + ' opens.', seg([['desk', 'Desktop'], ['game', 'DiceTV'], ['home', 'Dice Home']], D.state.start, (v) => D.set('start', v), 'st:in')));
        pane.appendChild(row('Friends\' pop-ups', 'When a friend starts playing something.', sw(D.state.friendPops, (v) => D.set('friendPops', v), 'st:pops', 'Friends\' pop-ups')));
        const b = h('<button class="b small" data-nav data-key="st:restart">' + D.glyph('restart', 2) + 'Restart now</button>');
        b.onclick = () => D.restart();
        pane.appendChild(row('Restart', 'See the start-up animation again.', b));
      },
      cloud() {
        const C = D.cloud, c = D.state.cloud;
        const head = h('<div class="cl-head"></div>'); head.append(G.productIcon('cloud', 48), h('<div><h2>Dice Cloud</h2><p class="note">Keeps ' + esc(C.what) + ' the same on every computer with DiceOS or DiceWeb.</p></div>'));
        pane.appendChild(head);
        if (!C.on()) {
          pane.appendChild(h('<p class="note">Everything is locked on this computer with your Dice Cloud code before it leaves, so the website only keeps a box it can\'t open.</p>'));
          const on = h('<button class="b small go" data-nav data-key="cl:on">Turn on Dice Cloud</button>');
          on.onclick = async () => { on.disabled = true; on.textContent = 'Turning on…'; await C.turnOn(); show('cloud'); };
          pane.appendChild(row('New here', 'Makes a Dice Cloud code for you.', on));
          const join = h('<form class="cl-join"><input data-nav data-key="cl:code" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" aria-label="Your Dice Cloud code" autocomplete="off" spellcheck="false"><button class="b small" data-nav data-key="cl:join">Join</button></form>');
          join.onsubmit = async (e) => {
            e.preventDefault();
            const v = join.querySelector('input').value;
            if (!C.valid(v)) { D.toast({ icon: 'link', c: '#e5534b', title: 'That isn\'t a Dice Cloud code', text: 'It\'s 20 letters and numbers, like 7K2QM-…' }); return; }
            join.querySelector('button').disabled = true;
            const ok = await C.turnOn(v);
            show('cloud');
            if (ok) D.toast({ icon: 'link', c: '#3a9be8', title: 'Dice Cloud is on', text: 'This computer now shares with your others.' });
          };
          pane.appendChild(row('Already using it', 'Type the code from your other computer.', join));
        } else {
          const when = c.last ? D.ago(c.last) : 'not yet';
          pane.appendChild(h('<div class="cl-code"><span>Your Dice Cloud code</span><b>' + esc(c.code) + '</b><small>Type it on your other computers to share with them. Anyone who has it can open your Dice Cloud, so keep it like a password.</small></div>'));
          const sync = h('<button class="b small go" data-nav data-key="cl:sync">' + (C.busy ? 'Syncing…' : 'Sync now') + '</button>');
          sync.onclick = async () => { sync.disabled = true; sync.textContent = 'Syncing…'; await C.sync(); show('cloud'); };
          pane.appendChild(row('Last synced', C.error ? C.error : when, sync));
          const off = h('<button class="b small" data-nav data-key="cl:off">Turn off here</button>');
          off.onclick = () => D.ask({ title: 'Turn off Dice Cloud here?', text: 'This computer stops sharing and forgets the code. What\'s in Dice Cloud stays for your other computers.', buttons: [{ label: 'Turn off', value: true, go: true }, { label: 'Cancel', value: false }] }).then(async (y) => { if (y) { await C.turnOff(false); show('cloud'); } });
          pane.appendChild(row('This computer', 'Stop sharing on this one.', off));
          const del = h('<button class="b small danger" data-nav data-key="cl:del">Delete from Dice Cloud</button>');
          del.onclick = () => D.ask({ title: 'Delete your Dice Cloud?', text: 'The locked box on the website is deleted. Each computer keeps its own copy of everything.', buttons: [{ label: 'Delete it', value: true, go: true }, { label: 'Cancel', value: false }] }).then(async (y) => { if (y) { await C.turnOff(true); show('cloud'); } });
          pane.appendChild(row('Delete', 'Takes your box off the website.', del));
        }
      },
      storage() {
        pane.appendChild(h('<h2>Storage</h2>'));
        pane.appendChild(h('<p class="note">Everything ' + D.brand + ' keeps stays on this computer. Nothing is sent anywhere unless you turn on Dice Cloud.</p>'));
        let bytes = 0; try { bytes = (localStorage.getItem('diceweb') || '').length; } catch (e) { /* ignore */ }
        const used = h('<span class="muted"></span>');
        used.textContent = 'Settings, notes and the disk: ' + (bytes / 1024).toFixed(1) + ' KB. Songs: ' + D.M.songs.length + '.';
        pane.appendChild(row('Used', '', used));
        if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then((e) => { used.textContent += ' In all: ' + (e.usage / 1048576).toFixed(1) + ' MB.'; }).catch(() => {});
        const clr = h('<button class="b small" data-nav data-key="sto:notifs">Clear</button>');
        clr.onclick = () => { D.state.notifs = []; D.save(); D.emit('notifs'); D.toast({ icon: 'bell', title: 'Cleared', text: 'No notifications.' }); };
        pane.appendChild(row('Notifications', D.state.notifs.length + ' kept.', clr));
        const songs = h('<button class="b small" data-nav data-key="sto:songs">Remove all</button>');
        songs.onclick = () => D.ask({ title: 'Remove all your songs?', text: 'They come out of ' + D.brand + '. The files on your computer stay where they are.', buttons: [{ label: 'Remove them', value: true, go: true, danger: true }, { label: 'Keep them', value: false }] }).then((ok) => { if (ok) { D.M.stop(); D.M.clear(); } });
        pane.appendChild(row('Your songs', 'Songs you added to Music.', songs));
        const reset = h('<button class="b small danger" data-nav data-key="sto:reset">Reset ' + D.brand + '</button>');
        reset.onclick = () => D.ask({ title: 'Reset ' + D.brand + '?', text: 'Your name, notes, the disk, songs and settings all go. ' + D.brand + ' starts fresh, like the first time.', buttons: [{ label: 'Reset everything', value: true, go: true, danger: true, c: '#ff4d5e' }, { label: 'Cancel', value: false }] }).then((ok) => { if (ok) D.reset(); });
        pane.appendChild(row('Start fresh', 'Takes everything away.', reset));
      },
      wifi() {
        pane.appendChild(h('<h2>Wi-Fi</h2>'));
        const now = D.sys.status && D.sys.status.wifi;
        pane.appendChild(h('<p class="note">' + (now && now.ssid ? 'Connected to <b>' + esc(now.ssid) + '</b>.' : 'Not connected to Wi-Fi.') + ' Pick a network to join it.</p>'));
        const box = h('<div class="spane" style="gap:6px"><p class="muted">Looking for networks…</p></div>');
        pane.appendChild(box);
        D.sys.get('/api/wifi').then((r) => {
          if (cur !== 'wifi') return;
          box.innerHTML = '';
          if (r.error) { box.appendChild(h('<p class="note">' + esc(r.error) + '</p>')); return; }
          if (!r.networks.length) box.appendChild(h('<p class="note">No networks in range.</p>'));
          r.networks.forEach((n, i) => {
            const b = h('<button class="srow" data-nav data-key="wifi:' + i + '" style="width:100%;text-align:left"><div><b>' + esc(n.ssid) + '</b><span>' + (n.active ? 'Connected' : n.secure ? 'Needs a password' : 'Open') + ', signal ' + n.signal + '%</span></div>' + D.glyph(n.secure ? 'lock' : 'wifi', 2) + '</button>');
            b.onclick = () => {
              if (n.active) return;
              const join = (password) => { D.toast({ icon: 'wifi', c: '#2bc4b2', title: 'Joining ' + n.ssid + '…', text: 'This takes a few seconds.' });
                D.sys.post('/api/wifi', { ssid: n.ssid, password }).then((x) => { D.toast(x.ok ? { icon: 'wifi', c: '#4fc16b', title: 'Connected', text: 'You\'re on ' + n.ssid + '.' } : { icon: 'wifi', c: '#ff4d5e', title: 'Didn\'t connect', text: x.error || '' }); if (cur === 'wifi') show('wifi'); }); };
              if (!n.secure) return join();
              D.ask({ title: n.ssid, text: 'The Wi-Fi password:', input: { type: 'password', label: 'Wi-Fi password' }, buttons: [{ label: 'Join', value: true, go: true }, { label: 'Cancel', value: false }] }).then((r2) => { if (r2) join(r2.value); });
            };
            box.appendChild(b);
          });
        });
        const again = h('<button class="b small" data-nav data-key="wifi:again">' + D.glyph('restart', 2) + 'Look again</button>');
        again.onclick = () => show('wifi');
        pane.appendChild(again);
      },
      display() {
        pane.appendChild(h('<h2>Screen</h2>'));
        const st = D.sys.status || {};
        if (st.brightness !== null && st.brightness !== undefined) pane.appendChild(row('Brightness', 'The screen\'s backlight.', ui.slider(st.brightness, 0.05, 1, (v) => { clearTimeout(PANES.bt); PANES.bt = setTimeout(() => D.sys.post('/api/brightness', { level: v }), 120); }, 'disp:b', 'Brightness')));
        else pane.appendChild(row('Brightness', 'This screen\'s brightness is set on the screen itself.', null));
        const rot = ((D.sys.settings.screen || {}).rotate) || 0;
        pane.appendChild(row('Turn the screen', 'For screens mounted sideways or upside down. Takes effect when the desktop restarts.', seg([[0, 'Normal'], [90, '90°'], [180, '180°'], [270, '270°']], rot, (v) => D.sys.saveSettings({ screen: Object.assign({}, D.sys.settings.screen, { rotate: v }) }), 'disp:r')));
        const rs = h('<button class="b small" data-nav data-key="disp:restart">' + D.glyph('restart', 2) + 'Restart desktop</button>');
        rs.onclick = () => D.sys.power('restart-desktop');
        pane.appendChild(row('Restart the desktop', 'Reloads Dice without restarting the computer.', rs));
      },
      system() {
        pane.appendChild(h('<h2>Power and updates</h2>'));
        [['Restart', 'Starts the computer again.', 'restart', 'reboot'], ['Shut down', 'On a Pi, wait for the green light to stop blinking before unplugging.', 'power', 'shutdown']].forEach(([t, sub, ic, a]) => {
          const b = h('<button class="b small" data-nav data-key="sys:' + a + '">' + D.glyph(ic, 2) + t + '</button>'); b.onclick = () => D.sys.power(a); pane.appendChild(row(t, sub, b));
        });
        const up = h('<button class="b small" data-nav data-key="sys:update">' + D.glyph('restart', 2) + 'Check now</button>');
        const log = h('<pre class="uplog" hidden></pre>');
        up.onclick = () => { D.sys.post('/api/update').then(() => { log.hidden = false; log.textContent = 'Checking…'; const t = setInterval(() => D.sys.get('/api/update').then((r) => { log.textContent = r.log || 'Checking…'; if (/newest|Done|Couldn't|wasn't right/.test(r.log || '')) clearInterval(t); }), 1500); }); };
        pane.appendChild(row('Update DiceOS', 'DiceOS ' + esc(D.sys.info.version) + '. Gets the newest DiceOS from the website.', up));
        pane.appendChild(log);
        pane.appendChild(row('Automatic updates', 'Checks once a week.', sw(D.sys.settings.updates !== false, (v) => D.sys.saveSettings({ updates: v }), 'sys:auto', 'Automatic updates')));
      },
      about() {
        pane.appendChild(h('<h2>About</h2>'));
        const ua = navigator.userAgent;
        const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Your browser';
        pane.appendChild(h('<div class="srow" style="display:block"><div style="display:flex;gap:16px;align-items:center"><canvas width="64" height="64" style="width:64px;height:64px;border-radius:16px"></canvas><div><b class="pix" style="font-size:1.6rem">' + (D.sys ? 'DiceOS ' + esc(D.sys.info.version) : 'DiceWeb ' + esc(D.version)) + '</b><span class="muted" style="display:block">' + (D.sys ? 'An operating system for your Raspberry Pi or PC.' : 'The DiceOS desktop, in your browser.') + ' Made by Dhruv.</span></div></div></div>'));
        pane.querySelector('canvas').getContext('2d').drawImage(G.face('cubby', 64, G.hexA('#8a8a96', 0.2)), 0, 0);
        const st = D.sys && D.sys.status;
        const pi = st ? [['Computer', st.model], ['Name on the network', st.host + (st.ip ? ' (' + st.ip + ')' : '')], ['Temperature', st.temp ? st.temp + ' °C' : 'Unknown'],
          ['Memory', st.mem ? gb(st.mem.used) + ' of ' + gb(st.mem.total) + ' in use' : 'Unknown'], ['Storage', st.disk ? gb(st.disk.used) + ' of ' + gb(st.disk.total) + ' used' : 'Unknown'], ['DiceOS', D.sys.info.version]] : [];
        const facts = pi.concat([['Browser', browser], ['Screen', innerWidth + ' × ' + innerHeight + (devicePixelRatio > 1 ? ' (sharp)' : '')], ['Controllers', D.input.padNames().length ? D.input.padNames().length + ' connected' : 'None connected'], ['Time here', D.mins(Object.values(D.state.played).reduce((a, b) => a + b, 0)) + ' in apps']]);
        facts.forEach(([a, b]) => pane.appendChild(row(a, '', h('<span class="muted">' + esc(b) + '</span>'))));
        const link = h('<a class="b small" data-nav data-key="ab:site" href="' + esc(D.origin) + '" target="_blank" rel="noopener">' + D.glyph('link', 2) + 'The website</a>');
        pane.appendChild(row('More apps', 'The whole suite lives on the website.', link));
      },
    };
    function show(id) {
      cur = id;
      cancelAnimationFrame(raf);
      listEl.querySelectorAll('.mi').forEach((b) => { b.classList.toggle('here', b.dataset.key === 'set:' + id); b.toggleAttribute('data-first', b.dataset.key === 'set:' + id); });
      pane.innerHTML = '';
      PANES[id]();
      ctx.setTitle(SECTIONS.find((s) => s[0] === id)[1] + ' – Settings');
    }
    show(cur);
    const offCloud = D.on('cloud', () => { if (cur === 'cloud' && !pane.contains(document.activeElement)) show('cloud'); });
    setTimeout(() => { if (ctx.mode !== 'desk') D.nav.focus(listEl.querySelector('[data-key="set:' + cur + '"]')); }, 30);
    return {
      onAction(a) {
        // back out of the right side to the list first
        if (a === 'b' && D.nav.el && pane.contains(D.nav.el)) { D.nav.focus(listEl.querySelector('[data-key="set:' + cur + '"]')); D.S.play('back'); return true; }
        return false;
      },
      unmount() { cancelAnimationFrame(raf); ro.disconnect(); offCloud(); },
    };
  } });

  // A picture of a controller with whatever's pressed lit up.
  function drawPad(cv) {
    const g = cv.getContext('2d'), night = D.night();
    const pad = Object.values(D.input.pads)[0];
    const body = night ? '#2a2a32' : '#e6e6ec', edge = night ? '#4a4a55' : '#b8b8c4', dim = night ? '#3a3a44' : '#cfcfd8';
    g.clearRect(0, 0, 96, 56);
    g.fillStyle = edge;
    g.fillRect(14, 10, 68, 26); g.fillRect(8, 16, 80, 20); g.fillRect(6, 22, 26, 26); g.fillRect(64, 22, 26, 26);
    g.fillStyle = body;
    g.fillRect(15, 11, 66, 24); g.fillRect(9, 17, 78, 18); g.fillRect(7, 23, 24, 24); g.fillRect(65, 23, 24, 24);
    const b = (i) => (pad && pad.buttons[i] > 0.4);
    const ax = (i) => (pad ? pad.axes[i] || 0 : 0);
    // shoulder buttons
    g.fillStyle = b(4) || b(6) ? '#7c9cff' : edge; g.fillRect(14, 5, 16, 4);
    g.fillStyle = b(5) || b(7) ? '#7c9cff' : edge; g.fillRect(66, 5, 16, 4);
    // d-pad
    const dp = [[12, 22, 18, 4], [12, 20, 4, 18]];
    g.fillStyle = dim; g.fillRect(12, 25, 12, 4); g.fillRect(16, 21, 4, 12);
    g.fillStyle = '#7c9cff';
    if (b(12)) g.fillRect(16, 21, 4, 4); if (b(13)) g.fillRect(16, 29, 4, 4); if (b(14)) g.fillRect(12, 25, 4, 4); if (b(15)) g.fillRect(20, 25, 4, 4);
    void dp;
    // face buttons
    [[76, 31, 0], [81, 26, 1], [71, 26, 2], [76, 21, 3]].forEach(([x, y, i]) => { g.fillStyle = b(i) ? '#7c9cff' : dim; g.fillRect(x - 2, y - 2, 4, 4); });
    // sticks
    [[33, 37, 0, 1, 10], [60, 37, 2, 3, 11]].forEach(([x, y, a1, a2, press]) => {
      g.fillStyle = dim; g.fillRect(x - 5, y - 5, 10, 10);
      g.fillStyle = b(press) ? '#7c9cff' : (night ? '#8a8a96' : '#5f5f69');
      g.fillRect(Math.round(x - 2 + ax(a1) * 3), Math.round(y - 2 + ax(a2) * 3), 4, 4);
    });
    // menu buttons
    g.fillStyle = b(8) ? '#7c9cff' : dim; g.fillRect(40, 20, 4, 2);
    g.fillStyle = b(9) ? '#7c9cff' : dim; g.fillRect(52, 20, 4, 2);
    if (!pad) { g.fillStyle = night ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.45)'; g.fillRect(0, 0, 96, 56); }
  }
})();
