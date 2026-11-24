// Settings: you, the look (and Night light), sound (and Do not disturb), controllers and keys,
// performance, start up, Dice Cloud, storage and backups. On DiceOS also Wi-Fi, Bluetooth,
// the screen, power and updates.
(function () {
  'use strict';
  const D = window.Dice, G = D.G, S = D.S, esc = D.esc, h = D.h;
  const SECTIONS = [['you', 'You', 'person', '#ff707a'], ['look', 'Look', 'sun', '#f5c431'], ['desk', 'Desktop', 'desktop', '#2f9e6e'], ['sound', 'Sound', 'volume', '#d39cf5'], ['pads', 'Controllers and keys', 'pad', '#7c9cff'], ['remote', 'Remotes', 'tv', '#3a7bd5'],
    ['perf', 'Performance', 'chart', '#8fd16a'], ['start', 'Starting up', 'power', '#ef6a1f'], ['cloud', 'Dice Cloud', 'link', '#3a9be8'], ['storage', 'Storage', 'lock', '#2bc4b2'], ['about', 'About', 'help', '#96969f']];

  // on a computer running Dice, there's more to set: Wi-Fi, the screen, power and updates
  if (D.sys) {
    SECTIONS.splice(2, 0, ['wifi', 'Wi-Fi', 'wifi', '#2bc4b2'], ['bt', 'Bluetooth', 'bt', '#3a7bd5'], ['display', 'Screen', 'desktop', '#7cc4ff']);
    SECTIONS.splice(SECTIONS.findIndex((x) => x[0] === 'storage'), 0, ['system', 'Power and updates', 'restart', '#ef6a1f']);
  }
  D.settingsSections = () => SECTIONS.map((s) => [s[0], s[1]]); // for the Dice Bar
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
        pane.appendChild(row('Night light', 'A warmer screen, kinder to your eyes in the evening. At night means sunset to sunrise.', seg([['off', 'Off'], ['night', 'At night'], ['on', 'Always']], D.state.warm || 'off', (v) => D.tools.setWarm(v), 'look:warm')));
        pane.appendChild(row('How warm', 'For Night light.', ui.slider(typeof D.state.warmth === 'number' ? D.state.warmth : 0.5, 0, 1, (v) => { D.set('warmth', v); D.tools.applyWarm(); }, 'look:warmth', 'How warm')));
        pane.appendChild(row('Ambient screen', 'On DiceTV, when nothing is open: a big clock over your world. Any key brings DiceTV back.', seg([[5, '5 min'], [10, '10 min'], [30, '30 min'], [0, 'Never']], D.state.idle === undefined ? 10 : D.state.idle, (v) => D.set('idle', v), 'look:idle')));
        if (D.ambient) {
          const tryIt = h('<button class="b small" data-nav data-key="look:ambtry">Try it now</button>');
          tryIt.onclick = () => { D.ambient.enter(); };
          const r = row('Behind the clock', 'What the ambient screen shows. "Just the clock" is kindest to OLED TVs.', seg(D.ambient.CHOICES, D.state.amb || 'world', (v) => D.set('amb', v), 'look:amb'));
          r.appendChild(tryIt);
          r.classList.add('srow-wide');
          pane.appendChild(r);
        }
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
        pane.appendChild(row('Do not disturb', 'Notifications go in the list without popping up or chiming. Timers still ring.', sw(!!D.state.dnd, (v) => D.tools.setQuiet(v), 'snd:dnd', 'Do not disturb')));
        const t = h('<button class="b small" data-nav data-key="snd:test">' + D.glyph('volume', 2) + 'Play a test chime</button>');
        t.onclick = () => S.play('achieve');
        pane.appendChild(row('Test', 'Can\'t hear anything? Check the volume on your computer too.', t));
      },
      desk() {
        pane.appendChild(h('<h2>Desktop</h2>'));
        pane.appendChild(row('Snap windows', 'Drag a window to an edge or a corner and it fills that part of the screen. Hold the pointer on its maximise button for more layouts.', sw(D.state.snap !== false, (v) => D.set('snap', v), 'dk:snap', 'Snap windows')));
        pane.appendChild(row('Hot corner', 'Push the pointer into the top-left corner for the overview of every window.', sw(D.state.hotCorner !== false, (v) => D.set('hotCorner', v), 'dk:hot', 'Hot corner')));
        const wl = Array.isArray(D.state.widgets) ? D.state.widgets : null;
        const wb = h('<button class="b small" data-nav data-key="dk:wid">' + D.glyph('plus', 2) + 'Add a widget</button>');
        wb.onclick = () => { if (D.desk.on && D.deskplus) D.deskplus.gallery(innerWidth / 2 - 200, innerHeight / 3); else D.toast({ icon: 'desktop', title: 'On the desktop', text: 'Right-click the desktop, then Widgets.' }); };
        pane.appendChild(row('Widgets', (wl ? wl.length : 3) + ' on the desktop now: a clock, the weather, Axiom, music, sticky notes and more. Drag them by their name.', wb));
        const rs = h('<button class="b small" data-nav data-key="dk:wreset">Put the first ones back</button>');
        rs.onclick = () => { delete D.state.widgets; D.save(); D.emit('look'); D.toast({ icon: 'desktop', title: 'Widgets reset', text: 'The clock, the weather and Axiom are back.' }); };
        pane.appendChild(row('Start the widgets again', 'Takes away the ones you added.', rs));
        pane.appendChild(h('<div class="srow" style="display:block"><b>Quick ways round</b><div class="keys" style="padding:10px 0 0;grid-template-columns:auto 1fr">' +
          [['Ctrl + Space', 'The Dice Bar: apps, settings, sums, units, timers, tasks'], ['Super, F3', 'Overview of every window'], ['Ctrl + Alt + ← →', 'The other desktops (or Ctrl + Alt + 1 to 4)'], ['Super + ← → ↑ ↓', 'Snap the window (Ctrl + Alt + Shift works too)'], ['Alt + Tab', 'Flip between windows (Alt + ` too)'], ['Super + V', 'Things you copied lately'], ['Super + D', 'Show the desktop']].map(([k, t]) => '<span class="bt bt-keys">' + esc(k) + '</span><span>' + esc(t) + '</span>').join('') + '</div></div>'));
      },
      remote() {
        pane.appendChild(h('<h2>Remotes</h2>'));
        pane.appendChild(h('<p class="muted" style="margin:0 0 8px">Remotes work on DiceTV and everywhere else: OK picks, Back goes back, the arrows move, Home goes home. The colours: <b style="color:#e5484d">red</b> Channels, <b style="color:#3fa26b">green</b> Axiom, <b style="color:#c99a10">yellow</b> Weather, <b style="color:#3a7bd5">blue</b> Quick settings. Guide opens Axiom\'s guide, the numbers tune Live channels, CH + and − change channel.</p>'));
        const test = h('<div class="srow"><div><b>Try a button</b><span class="muted rm-last">Press anything on your remote.</span></div></div>');
        pane.appendChild(test);
        const off = D.on('remote', (r) => { const el = test.querySelector('.rm-last'); if (el && el.isConnected) el.textContent = 'You pressed ' + r.key + (r.key !== r.a ? ' (' + r.a + ')' : '') + '.'; else off(); });
        pane.appendChild(row('Show buttons as', 'What the hints at the bottom of the screen look like.', seg([['auto', 'By what you use'], ['keys', 'Keyboard'], ['pad', 'Controller'], ['remote', 'TV remote']], D.state.btns || 'auto', (v) => { D.set('btns', v); D.legend.update(); }, 'rm:btns')));
        pane.appendChild(row('On-screen keyboard', 'Comes up when you pick a box to type in on DiceTV. Type on a real keyboard (like the one on the back of an air mouse) and it gets out of the way by itself.', seg([['auto', 'Until I type on a keyboard'], ['always', 'Always'], ['never', 'Never']], D.state.osk || 'auto', (v) => D.set('osk', v), 'rm:osk')));
        // air mice: a remote you point at the screen, often with a keyboard on the back
        const air = D.air.get();
        pane.appendChild(h('<h3 style="margin:22px 0 4px">Air mouse</h3>'));
        pane.appendChild(h('<p class="muted" style="margin:0 0 8px">For remotes you point at the screen, like the iPazzPort. Pair it in Bluetooth (or plug in its little USB stick) and it just works: OK picks, Back and the right button go back, Home goes home, and resting the pointer near the end of a row scrolls it.</p>'));
        pane.appendChild(row('Pointer size', 'Big is easier to see from the sofa. Auto is big on DiceTV and the usual size on the desktop.', seg([['auto', 'Auto'], ['normal', 'Normal'], ['big', 'Big'], ['huge', 'Huge']], air.ptr, (v) => D.air.set('ptr', v), 'air:ptr')));
        pane.appendChild(row('Hide the pointer when it\'s still', 'It comes back as soon as you move it.', sw(air.hide, (v) => D.air.set('hide', v), 'air:hide', 'Hide the pointer')));
        pane.appendChild(row('Right button goes back', 'On DiceTV. The desktop keeps its menus.', sw(air.right, (v) => D.air.set('right', v), 'air:right', 'Right button goes back')));
        pane.appendChild(row('Scroll at the edges', 'Rest the pointer near the end of a row, or the top or bottom of the screen.', sw(air.edge, (v) => D.air.set('edge', v), 'air:edge', 'Scroll at the edges')));
        pane.appendChild(row('Power button', D.sys ? 'Holding it down for 5 seconds still turns the computer off.' : 'On DiceOS, the remote\'s power button.', seg([['sleep', 'Sleep'], ['ask', 'Ask'], ['off', 'Nothing']], air.power, (v) => D.air.set('power', v), 'air:power')));
        const fit = h('<div class="fitbox"><button class="b small" data-nav data-key="air:fit-" aria-label="Smaller">−</button><b></b><button class="b small" data-nav data-key="air:fit+" aria-label="Bigger">+</button></div>');
        const fitShow = () => { fit.querySelector('b').textContent = Math.round((D.state.fit || 1) * 100) + '%'; };
        fit.querySelector('[data-key="air:fit-"]').onclick = () => { D.air.fit((D.state.fit || 1) - 0.01); fitShow(); };
        fit.querySelector('[data-key="air:fit+"]').onclick = () => { D.air.fit((D.state.fit || 1) + 0.01); fitShow(); };
        fitShow();
        pane.appendChild(row('Fit the picture to the TV', 'If the TV cuts off the edges, make it smaller until you can see them. The zoom keys do this too.', fit));
        if (!D.sys) { pane.appendChild(h('<p class="note">On DiceOS, your TV\'s own remote works too, through the HDMI cable (HDMI-CEC).</p>')); return; }
        const cec = h('<div class="spane" style="gap:6px;padding:0"><p class="muted">Looking for the TV…</p></div>');
        pane.appendChild(cec);
        const paint = (r) => {
          if (cur !== 'remote') return;
          cec.innerHTML = '';
          if (!r || !r.available) { cec.appendChild(h('<p class="note">' + esc((r && r.why) || 'No HDMI-CEC here.') + ' A remote that plugs in by USB or pairs by Bluetooth works anyway. On a Raspberry Pi, your TV\'s remote works once CEC is on in the TV\'s settings: it\'s called Anynet+ (Samsung), Bravia Sync (Sony), SimpLink (LG) or just HDMI-CEC.</p>')); return; }
          cec.appendChild(row('Your TV\'s remote', r.tv ? 'Working, through the HDMI cable. ' + (r.tv === true ? '' : 'TV: ' + r.tv) : 'Ready. If it doesn\'t answer, turn on CEC in the TV\'s settings (Anynet+, Bravia Sync, SimpLink).', null));
          cec.appendChild(row('Turn the TV on with DiceOS', 'When DiceOS starts, the TV comes on and switches to it.', sw(D.sys.settings.cec_tv_on !== false, (v) => D.sys.saveSettings({ cec_tv_on: v }), 'rm:on', 'Turn the TV on')));
          cec.appendChild(row('Turn the TV off when DiceOS sleeps', 'And back on when it wakes.', sw(!!D.sys.settings.cec_tv_off, (v) => D.sys.saveSettings({ cec_tv_off: v }), 'rm:off', 'Turn the TV off')));
          cec.appendChild(row('Volume buttons change', 'The TV\'s own volume, or DiceOS\'s.', seg([['tv', 'The TV'], ['dice', 'DiceOS']], D.sys.settings.cec_volume === 'tv' ? 'tv' : 'dice', (v) => D.sys.saveSettings({ cec_volume: v }), 'rm:vol')));
          const b = h('<button class="b small" data-nav data-key="rm:switch">Switch the TV to DiceOS</button>');
          b.onclick = () => D.sys.post('/api/remote', { cmd: 'active' });
          cec.appendChild(row('On the wrong input?', 'Ask the TV to show DiceOS.', b));
        };
        D.sys.get('/api/remote').then(paint);
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
        const ks = h('<button class="b small" data-nav data-key="pad:keys">' + D.glyph('keys', 2) + 'Show them all</button>');
        ks.onclick = () => D.tools.shortcuts();
        pane.appendChild(row('Keyboard shortcuts', 'For the desktop, DiceTV, SereneTab and Terminal. Ctrl + / shows them anywhere.', ks));
        if (D.sys) {
          const bt = h('<button class="b small" data-nav data-key="pad:bt">' + D.glyph('bt', 2) + 'Bluetooth</button>');
          bt.onclick = () => show('bt');
          pane.appendChild(row('Wireless controllers', 'Pair them in Bluetooth.', bt));
        }
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
        const b = h('<button class="b small" data-nav data-key="st:restart">' + D.glyph('restart', 2) + 'Restart now</button>');
        b.onclick = () => D.restart();
        pane.appendChild(row('Restart', 'See the start-up animation again.', b));
      },
      cloud() {
        const C = D.cloud, c = D.state.cloud;
        const head = h('<div class="cl-head"></div>'); head.append(G.productIcon('cloud', 48), h('<div><h2>Dice Cloud</h2><p class="note">Keeps ' + esc(C.what) + ' the same on every computer with DiceOS or DiceWeb, and sends links and notes between them with Dice Drop.</p></div>'));
        pane.appendChild(head);
        const open = h('<button class="b small go" data-nav data-key="cl:open">Open Dice Cloud</button>');
        open.onclick = () => D.launch('cloud');
        if (!C.on()) {
          pane.appendChild(row('Off here', 'Turn it on, type your code, or add this computer with a short code (best on a TV).', open));
        } else {
          pane.appendChild(row(C.busy ? 'Syncing…' : C.error ? 'Not synced' : 'On', C.error ? C.error : (c.last ? 'Synced ' + D.ago(c.last) : 'Not synced yet') + '. ' + C.devices().length + (C.devices().length === 1 ? ' computer.' : ' computers.'), open));
          const sync = h('<button class="b small" data-nav data-key="cl:sync">Sync now</button>');
          sync.onclick = async () => { sync.disabled = true; sync.textContent = 'Syncing…'; await C.sync({ force: true }); show('cloud'); };
          pane.appendChild(row('Sync now', 'It also syncs by itself, every few seconds.', sync));
        }
        pane.appendChild(h('<p class="note">Everything is locked on this computer with your Dice Cloud code before it leaves, so the website only keeps a box it can\'t open.</p>'));
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
        const bk = h('<button class="b small go" data-nav data-key="sto:backup">' + D.glyph('box', 2) + 'Back up</button>');
        bk.onclick = () => D.tools.backup();
        pane.appendChild(row('Back up', 'Your settings, notes, files, Axiom, SereneTab and Dice Home, in one file' + (D.sys ? ' in your Home folder' : '') + '. Songs and your Dice Cloud code stay out.', bk));
        const rs = h('<button class="b small" data-nav data-key="sto:restore">Pick a backup</button>');
        rs.onclick = () => D.tools.restore();
        pane.appendChild(row('Put a backup back', 'Replaces what\'s here with what\'s in the file.', rs));
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
      bt() {
        pane.appendChild(h('<h2>Bluetooth</h2>'));
        const box = h('<div class="spane" style="gap:6px;padding:0"><p class="muted">Looking…</p></div>');
        pane.appendChild(box);
        const BT = D.tools.bt;
        const refocus = () => { if (D.input.source !== 'mouse' && (!D.nav.el || !D.nav.el.isConnected)) D.nav.focus(box.querySelector('[data-nav]')); };
        const paint = (r) => {
          if (cur !== 'bt') return;
          box.innerHTML = '';
          if (!r || !r.ok && !r.devices) { box.appendChild(h('<p class="note">' + esc((r && r.error) || 'Bluetooth isn\'t answering.') + '</p>')); return; }
          if (!r.adapter) { box.appendChild(h('<p class="note">This computer has no Bluetooth. A small USB Bluetooth adapter adds it.</p>')); return; }
          box.appendChild(row('Bluetooth', r.powered ? 'On. Paired things connect by themselves.' : 'Off.', sw(r.powered, async (v) => paint(await BT.power(v)), 'bt:power', 'Bluetooth')));
          if (!r.powered) return refocus();
          const mine = r.devices.filter((d) => d.paired), near = r.devices.filter((d) => !d.paired);
          box.appendChild(h('<h3 class="shead">Your devices</h3>'));
          if (!mine.length) box.appendChild(h('<p class="note">Nothing paired yet.</p>'));
          mine.forEach((d, i) => {
            const r2 = row(d.name, BT.kind(d.icon) + ', ' + (d.connected ? 'connected' : 'not connected') + (typeof d.battery === 'number' ? ', battery ' + d.battery + '%' : ''), null);
            const btns = h('<div style="display:flex;gap:8px;flex-wrap:wrap"></div>');
            const c = h('<button class="b small' + (d.connected ? '' : ' go') + '" data-nav data-key="bt:c' + i + '">' + (d.connected ? 'Disconnect' : 'Connect') + '</button>');
            c.onclick = () => act(d.connected ? 'disconnect' : 'connect', d, c);
            const f = h('<button class="b small" data-nav data-key="bt:f' + i + '">Forget</button>');
            f.onclick = () => D.ask({ title: 'Forget ' + d.name + '?', text: 'To use it again, you\'ll pair it again.', buttons: [{ label: 'Forget it', value: true, go: true }, { label: 'Cancel', value: false }] }).then((y) => { if (y) act('remove', d, f); });
            btns.append(c, f); r2.appendChild(btns); box.appendChild(r2);
          });
          const look = h('<button class="b small" data-nav data-key="bt:scan">' + D.glyph('search', 2) + 'Look for devices</button>');
          look.onclick = async () => { look.disabled = true; look.textContent = 'Looking for 10 seconds…'; paint(await BT.scan()); };
          box.appendChild(row('Add a device', 'Put it in pairing mode first. Controllers: hold the pair button until the light flashes fast. Headphones: hold the power button.', look));
          if (near.length) {
            box.appendChild(h('<h3 class="shead">Nearby</h3>'));
            near.forEach((d, i) => {
              const p = h('<button class="b small go" data-nav data-key="bt:p' + i + '">Pair</button>');
              p.onclick = () => act('pair', d, p);
              box.appendChild(row(d.name, BT.kind(d.icon), p));
            });
          }
          refocus();
        };
        const act = async (action, d, btn) => {
          btn.disabled = true;
          btn.textContent = { pair: 'Pairing…', connect: 'Connecting…', disconnect: 'Disconnecting…', remove: 'Forgetting…' }[action];
          const r = await BT.act(action, d.mac);
          if (!r || !r.ok) D.toast({ icon: 'bt', c: '#ff4d5e', title: 'That didn\'t work', text: (r && r.error) || 'Is it still in pairing mode, and close by?' });
          else if (action === 'pair') D.toast({ icon: 'bt', c: '#4fc16b', title: d.name + ' is paired', text: 'It connects by itself from now on.' });
          paint(r && r.devices ? r : await BT.list());
        };
        BT.list().then(paint);
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
