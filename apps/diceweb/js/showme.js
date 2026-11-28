// Show me how: Deuce lights the way.
//
// Ask "how do I change the wallpaper?" or "where's Bluetooth?" and, instead of a paragraph of
// directions, Dice opens the right place itself, dims everything else and puts a ring of light
// round the very switch you need, with a line saying what it does. Press it (OK on the remote,
// or a click) and it goes on to the next step, if there is one. Back stops it.
// Help, Show me how (or the die menu) lists every walk-through.
(function () {
  'use strict';
  const D = window.Dice, h = D.h, esc = D.esc, S = D.S;
  const SM = (D.showme = {});
  const set = (pane, at, say) => ({ open: ['settings', pane], at, say });

  // ---- the walk-throughs ------------------------------------------------------------------------------------------
  // each step: open a place (an app, and where in it), light up one thing in it, and say what it's for
  const TOPICS = {
    world: { name: 'Change your world (the wallpaper)', steps: [set('look', '[data-key^="look:w:"]', 'These are the worlds. Pick one and it\'s everywhere: DiceTV, the desktop, the big clock.')] },
    dark: { name: 'Dark or light', steps: [set('look', '[data-key="look:night"]', 'Night keeps everything dark. Follow the clock goes dark at sunset by itself.')] },
    traced: { name: 'Traced mode', steps: [set('look', '[data-key="look:traced"]', 'Switch this on and your world is painted by hand, with an ink line round everything.')] },
    accent: { name: 'The accent colour', steps: [set('look', '[data-key^="look:acc:"]', 'Pick the colour for highlights and buttons. Auto takes it from your world.')] },
    text: { name: 'Bigger or smaller text', steps: [set('look', '[data-key^="look:text"]', 'Choose a text size. It changes straight away, everywhere.')] },
    warm: { name: 'Night light', steps: [set('look', '[data-key="look:warm:night"]', 'At night makes the screen warmer from sunset to sunrise. Always keeps it warm.'), set('look', '[data-key="look:warmth"]', 'And this is how warm. Further right is warmer.')] },
    bright: { name: 'Brightness', steps: [set('look', '[data-key="look:bright"]', 'Slide this to dim the whole screen. Left and right on the remote work too.')] },
    idle: { name: 'The ambient screen (the big clock)', steps: [set('look', '[data-key^="look:idle:"]', 'How long DiceTV waits before the big clock comes up. Never turns it off.'), set('look', '[data-key^="look:amb:"]', 'And what\'s behind the clock.')] },
    clock: { name: '12 or 24 hour clock', steps: [set('look', '[data-key^="look:clock"]', 'Pick how the time is written.')] },
    units: { name: '°F or °C', steps: [set('look', '[data-key^="look:units"]', 'Pick °F or °C for the weather.')] },
    motion: { name: 'Less motion', steps: [set('look', '[data-key="look:motion"]', 'Switch this on for fewer animations, everywhere.')] },
    bt: { dice: true, name: 'Bluetooth (headphones, speakers)', steps: [set('bt', '[data-key="bt:power"]', 'First, make sure Bluetooth is on.'), set('bt', '[data-key="bt:scan"]', 'Put your headphones in pairing mode, then press this. Pick them from the list.')] },
    pad: { name: 'A game controller', steps: [set('pads', '[data-key="pad:bt"]', 'Hold your controller\'s pairing button, then press this. A USB cable works straight away, too.')] },
    wifi: { dice: true, name: 'Wi-Fi', steps: [set('wifi', '.spane [data-nav]', 'Your Wi-Fi networks are here. Pick yours and type its password.')] },
    display: { dice: true, name: 'Screen resolution', steps: [set('display', '[data-key^="disp:r"]', 'Pick a size for the picture. Dice checks it looks right before keeping it.')] },
    sound: { name: 'Sound and volume', steps: [set('sound', '[data-key="snd:vol"]', 'The volume for everything.'), set('sound', '[data-key="snd:ui"]', 'And this switches the little clicks and chimes on or off.')] },
    dnd: { name: 'Do not disturb', steps: [set('sound', '[data-key="snd:dnd"]', 'Switch this on and notifications wait quietly in the list. Urgent ones still come through.')] },
    name: { name: 'Your name', steps: [set('you', '[data-key="you:name"]', 'Type the name you want. Deuce calls you it too.')] },
    pw: { dice: true, name: 'The computer\'s password', steps: [set('you', '[data-key="you:pw"]', 'Press this to set a new password for this computer.')] },
    pin: { name: 'A PIN for the lock screen', steps: [set('you', '[data-key="you:pin"]', 'Press this to set a 4 to 8 number PIN. Super + L locks the screen.')] },
    remote: { name: 'Your phone as a remote', steps: [set('remote', '[data-key="rm:on"]', 'Switch this on, then scan the code with your phone. No app to install.')] },
    brain: { name: 'Deuce\'s brain (make Deuce smarter)', steps: [set('deuce', '[data-key="dm:setup"], [data-key^="dm:"]', 'This sets up Deuce\'s brain: a model that runs on this computer, with nothing sent away.')] },
    voice: { name: 'Deuce\'s voice', steps: [set('deuce', '[data-key="du:on"]', 'Deuce on or off.'), set('deuce', '[data-key="du:talk"]', 'And this is whether Deuce answers out loud.')] },
    update: { dice: true, name: 'Updates', steps: [set('system', '[data-key="sys:update"], [data-key^="sys:"]', 'Press this to look for an update now.'), set('system', '[data-key="sys:auto"]', 'Or switch this on, and updates come by themselves overnight.')] },
    backup: { name: 'Back up your things', steps: [set('storage', '[data-key="sto:backup"], [data-key^="sto:"]', 'This saves your settings and files to one file you can keep somewhere safe.')] },
    snap: { name: 'Snap windows side by side', steps: [set('desk', '[data-key="dk:snap"]', 'With this on, drag a window\'s title to the edge of the screen and it fills that half. Super + ← and → do it too.')] },
    hot: { name: 'The hot corner', steps: [set('desk', '[data-key="dk:hot"]', 'Push the pointer into the top-left corner to see every window at once.')] },
    widgets: { name: 'Desktop widgets', steps: [set('desk', '[data-key="dk:wid"]', 'Press this to pick widgets for the desktop. Drag them by their title.')] },
    menubar: { name: 'The menu bar and dock', steps: [set('desk', '[data-key^="dk:deskMac"], [data-key^="dk:"]', 'Here\'s how the desktop is laid out: the bar at the top and the dock along the bottom.')] },
    modes: { name: 'Modes (Focus, Chill, Sleep…)', steps: [set('modes', '.spane [data-nav]', 'Each mode changes a few things at once. Start one here, or say "Deuce, focus mode".')] },
    shield: { name: 'Shield (blocking ads)', steps: [set('shield', '.spane [data-nav]', 'Shield keeps ads and trackers out of every app. Switch it on or off here.')] },
    start: { name: 'How Dice starts up', steps: [set('start', '[data-key^="st:boot"]', 'Pick what comes up first: DiceTV or the desktop.')] },
    air: { dice: true, name: 'The air mouse', steps: [set('device', '[data-key^="air:"]', 'How fast the pointer moves, and what the air mouse\'s buttons do.')] },
    oops: { name: 'Undo a change (Oops)', steps: [{ run: () => D.oops.open(), at: '#oops .oo-list li', say: 'Everything you change shows up here. Undo takes it back. On the desktop, Super + Z undoes the last one. Or say "Deuce, undo that".' }] },
    float: { desk: true, name: 'Keep a window on top (Float)', steps: [{ at: '.mbar [data-m="Window"]', say: 'Open the Window menu and pick Float on top. Or say "Deuce, float this window".' }] },
  };
  SM.TOPICS = TOPICS;
  SM.has = (id) => !!TOPICS[id];

  // ---- the light ----------------------------------------------------------------------------------------------------
  let el = null, cur = null, raf = 0, target = null, findT = 0, holdUntil = 0;
  function build() {
    el = h('<div id="showme" hidden aria-live="polite"><svg class="sm-dim" aria-hidden="true"><path fill-rule="evenodd"></path></svg><i class="sm-ring" aria-hidden="true"></i><div class="sm-bubble glass" role="dialog" aria-label="Show me how">' +
      '<div class="sm-top"><span class="sm-orb" aria-hidden="true"></span><span class="sm-count"></span><span class="sm-step"></span></div><p class="sm-say"></p><small class="sm-hint"></small>' +
      '<div class="sm-acts"><button class="b small go sm-next">Next</button><button class="b small sm-stop">Stop</button></div></div></div>');
    document.body.appendChild(el);
    if (D.deuce && D.deuce.orbSvg) el.querySelector('.sm-orb').innerHTML = D.deuce.orbSvg(22);
    el.querySelector('.sm-next').onclick = () => next();
    el.querySelector('.sm-stop').onclick = () => SM.stop();
  }
  SM.start = function (id) {
    const t = TOPICS[id];
    if (!t) return false;
    if (t.dice && !D.sys) { D.toast({ icon: 'help', c: '#4b7bec', title: t.name, text: 'That\'s part of DiceOS, on the Raspberry Pi or a PC. It isn\'t in the browser.' }); return false; }
    if (t.desk && !(D.desk && D.desk.on)) { D.toast({ icon: 'desktop', c: '#4b7bec', title: t.name, text: 'That\'s on the desktop. Switch to it from the menu, then ask again.' }); return false; }
    if (!el) build();
    SM.stop(true);
    cur = { id, t, i: 0 };
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('on'));
    step();
    return true;
  };
  SM.stop = function (quiet) {
    cancelAnimationFrame(raf); clearTimeout(findT);
    if (target) target.removeEventListener('click', pressed, true);
    target = null;
    if (!cur) return;
    cur = null;
    el.classList.remove('on', 'found');
    setTimeout(() => { if (!cur) el.hidden = true; }, 260);
    if (!quiet) S.play('close');
  };
  SM.isOn = () => !!cur;
  function step() {
    const s = cur.t.steps[cur.i];
    if (target) target.removeEventListener('click', pressed, true);
    target = null;
    el.classList.remove('found');
    const many = cur.t.steps.length > 1, last = cur.i === cur.t.steps.length - 1;
    el.querySelector('.sm-count').textContent = cur.t.name;
    el.querySelector('.sm-step').textContent = many ? 'Step ' + (cur.i + 1) + ' of ' + cur.t.steps.length : '';
    el.querySelector('.sm-say').textContent = s.say;
    el.querySelector('.sm-next').textContent = last ? 'Got it' : 'Next';
    el.querySelector('.sm-hint').textContent = D.input && D.input.source === 'mouse' ? 'Press the lit-up control, or Next.' : 'OK presses it. Back stops.';
    if (s.open) D.launch(s.open[0], { arg: s.open[1] });
    if (s.run) s.run();
    if (D.deuce && D.deuce.talk) D.deuce.talk(s.say);
    find(s, Date.now());
  }
  // wait for the place to open and the control to appear (it may be drawn a moment later)
  function find(s, t0) {
    const hit = s.at && Array.from(document.querySelectorAll(s.at)).find((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !x.closest('[hidden]'); });
    if (!hit) {
      if (Date.now() - t0 < 3500) { findT = setTimeout(() => find(s, t0), 120); return; }
      // not here (an older DiceOS, or this computer doesn't have it): the words still help
      el.classList.remove('found'); track(); return;
    }
    target = hit;
    try { hit.scrollIntoView({ block: 'center', behavior: D.reduced && D.reduced() ? 'auto' : 'smooth' }); } catch (e) { hit.scrollIntoView(); }
    // with a remote, OK should press it: focus goes there (and back there, if the place opening takes it a moment later)
    holdUntil = Date.now() + 1500;
    if (D.nav && D.input && D.input.source !== 'mouse') D.nav.focus(hit, { scroll: false });
    hit.addEventListener('click', pressed, true);
    el.classList.add('found');
    S.play('toast');
    track();
  }
  function pressed() { setTimeout(() => { if (cur) next(); }, 450); }
  function next() {
    if (!cur) return;
    if (cur.i < cur.t.steps.length - 1) { cur.i++; step(); return; }
    SM.stop();
  }
  // the ring follows the control (windows move, panes scroll) and the bubble sits beside it
  function track() {
    cancelAnimationFrame(raf);
    const ring = el.querySelector('.sm-ring'), bub = el.querySelector('.sm-bubble'), dim = el.querySelector('.sm-dim path');
    const loop = () => {
      if (!cur) return;
      if (target && target.isConnected) {
        if (Date.now() < holdUntil && D.nav && D.nav.el !== target && D.input.source !== 'mouse') D.nav.focus(target, { scroll: false });
        const r = target.getBoundingClientRect(), pad = 7;
        Object.assign(ring.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
        // everything else, dimmed: the whole screen with a rounded hole where the control is
        const x = r.left - pad, y = r.top - pad, w = r.width + pad * 2, hh = r.height + pad * 2, k = Math.min(16, w / 2, hh / 2), W = innerWidth, H = innerHeight;
        dim.setAttribute('d', 'M0 0H' + W + 'V' + H + 'H0Z M' + (x + k) + ' ' + y + 'H' + (x + w - k) + 'A' + k + ' ' + k + ' 0 0 1 ' + (x + w) + ' ' + (y + k) + 'V' + (y + hh - k) + 'A' + k + ' ' + k + ' 0 0 1 ' + (x + w - k) + ' ' + (y + hh) +
          'H' + (x + k) + 'A' + k + ' ' + k + ' 0 0 1 ' + x + ' ' + (y + hh - k) + 'V' + (y + k) + 'A' + k + ' ' + k + ' 0 0 1 ' + (x + k) + ' ' + y + 'Z');
        const bw = bub.offsetWidth, bh = bub.offsetHeight, below = r.bottom + 18 + bh < innerHeight - 8;
        const bx = Math.max(12, Math.min(innerWidth - bw - 12, r.left + r.width / 2 - bw / 2)), by = below ? r.bottom + 18 : Math.max(12, r.top - bh - 18);
        bub.style.transform = 'translate(' + Math.round(bx) + 'px,' + Math.round(by) + 'px)';
      } else {
        el.classList.remove('found');
        bub.style.transform = 'translate(' + Math.round(innerWidth / 2 - bub.offsetWidth / 2) + 'px,' + Math.round(innerHeight * 0.68) + 'px)';
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
  }
  // Back stops it
  const fire0 = D.input.fire;
  D.input.fire = function (a, src) { if (cur && a === 'b' && !document.querySelector('#dialog.open, #osk.open')) { SM.stop(); return; } return fire0.call(D.input, a, src); };

  // ---- every walk-through, to pick from -----------------------------------------------------------------------------
  let list = null;
  SM.pick = function () {
    if (!list) {
      list = h('<div id="smlist" class="navtrap" hidden role="dialog" aria-label="Show me how"><div class="sml-in glass"><header><span class="sm-orb" aria-hidden="true"></span><div><b>Show me how</b><span>Pick one and Deuce lights the way. Or ask: "how do I…"</span></div><button class="oo-x" data-nav aria-label="Close">' + D.glyph('close', 2) + '</button></header><div class="sml-grid" data-row></div></div></div>');
      document.body.appendChild(list);
      if (D.deuce && D.deuce.orbSvg) list.querySelector('.sm-orb').innerHTML = D.deuce.orbSvg(26);
      list.querySelector('.oo-x').onclick = () => closeList();
      list.addEventListener('pointerdown', (e) => { if (e.target === list) closeList(); });
    }
    const grid = list.querySelector('.sml-grid');
    grid.innerHTML = '';
    Object.keys(TOPICS).filter((id) => !(TOPICS[id].dice && !D.sys) && !(TOPICS[id].desk && !(D.desk && D.desk.on))).forEach((id) => {
      const b = h('<button class="sml-t" data-nav data-key="sm:' + id + '"></button>');
      b.textContent = TOPICS[id].name;
      b.onclick = () => { closeList(true); setTimeout(() => SM.start(id), 200); };
      grid.appendChild(b);
    });
    list.hidden = false;
    requestAnimationFrame(() => list.classList.add('on'));
    S.play('open');
    setTimeout(() => { const f = grid.querySelector('button'); if (f && D.nav) D.nav.focus(f); }, 60);
  };
  function closeList(quiet) { if (!list || list.hidden) return; list.classList.remove('on'); setTimeout(() => { list.hidden = true; }, 240); if (!quiet) S.play('close'); }
  const fire1 = D.input.fire;
  D.input.fire = function (a, src) { if (list && !list.hidden && a === 'b') { closeList(); return; } return fire1.call(D.input, a, src); };
})();
