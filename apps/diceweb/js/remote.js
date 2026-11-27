// TV remotes, and anything else without a keyboard.
//
// - The extra keys remotes, media keyboards and air mice send (Back, Home, Info,
//   Guide, the four colours, channel up and down, play and pause, volume, the
//   numbers, which tune Live channels) become DiceTV buttons. Red is Channels, green Axiom, yellow the
//   weather and blue Quick settings, on every remote.
// - On DiceOS the TV's own remote works through the HDMI cable (HDMI-CEC): diced
//   passes its presses here as a stream of events (/api/events).
// - An on-screen keyboard comes up for typing with a remote or a controller.
// - A small bar shows the volume when it changes.
(function () {
  'use strict';
  const D = window.Dice, L = D.L, M = D.M, S = D.S, h = D.h, esc = D.esc;
  const R = D.remote = {};
  const isField = (el) => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(range|checkbox|radio|button|submit|file|color|date|time)$/i.test(el.type)) || el.isContentEditable);

  // ---- the keys -----------------------------------------------------------------------------
  // core.js already turns arrows, Enter and Esc into buttons; these are the rest.
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    let a = L.remoteKey(e.key);
    if (!a && /^[0-9]$/.test(e.key) && !isField(e.target) && !(D.desk && D.desk.on) && !D.$('#osk.open')) a = 'd' + e.key;
    // F3 is Search on air mice (on the desktop it's the window overview)
    if (!a && e.key === 'F3' && !(D.desk && D.desk.on)) a = 'search';
    if (!a) return;
    e.preventDefault();
    S.unlock();
    if (a[0] !== 'd' || a.length !== 2) D.input.setSource('remote');
    R.last = { a, key: e.key, at: Date.now() };
    D.emit('remote', R.last);
    D.input.fire(a, 'remote');
  }, true);
  // On DiceOS a remote's Back key can also come as the browser going back: catch it
  if (D.sys && !D.sys.info.emulated) {
    history.pushState({ dice: 1 }, '');
    addEventListener('popstate', () => { history.pushState({ dice: 1 }, ''); D.input.setSource('remote'); D.input.fire('b', 'remote'); });
  }

  // ---- the little bar for volume, channels and play/pause ----------------------------------
  let osdT = 0;
  const osd = h('<div id="osd" class="glass" role="status" aria-live="polite" hidden><span class="osd-ico"></span><span class="osd-txt"></span><span class="osd-bar"><i></i></span></div>');
  document.body.appendChild(osd);
  R.osd = function (icon, text, frac) {
    osd.querySelector('.osd-ico').innerHTML = D.glyph(icon, 2);
    osd.querySelector('.osd-txt').textContent = text;
    const bar = osd.querySelector('.osd-bar');
    bar.hidden = typeof frac !== 'number';
    if (!bar.hidden) bar.firstChild.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
    osd.hidden = false; osd.classList.add('on');
    clearTimeout(osdT);
    osdT = setTimeout(() => { osd.classList.remove('on'); setTimeout(() => { if (!osd.classList.contains('on')) osd.hidden = true; }, 300); }, 1600);
  };

  // ---- volume ----------------------------------------------------------------------------------------
  // DiceOS: the computer's sound, or the TV's own volume if you'd rather (HDMI-CEC).
  // In a browser: Dice's own music and sounds.
  R.volume = async function (a) {
    if (D.sys) {
      if (R.cec && R.cec.available && D.sys.settings.cec_volume === 'tv') { D.sys.post('/api/remote', { cmd: a }); return R.osd(a === 'mute' ? 'mute' : 'volume', a === 'mute' ? 'TV sound' : 'TV volume'); }
      const st = (D.sys.status && D.sys.status.volume) || { level: 0.6, muted: false };
      let level = st.level, muted = st.muted;
      if (a === 'mute') muted = !muted; else { level = Math.max(0, Math.min(1, Math.round((level + (a === 'volup' ? 0.05 : -0.05)) * 20) / 20)); muted = false; }
      st.level = level; st.muted = muted;
      D.sys.status = Object.assign(D.sys.status || {}, { volume: st });
      D.sys.post('/api/volume', a === 'mute' ? { muted } : { level });
      return R.osd(muted ? 'mute' : 'volume', muted ? 'Muted' : 'Volume ' + Math.round(level * 100), muted ? 0 : level);
    }
    let v = typeof D.state.volume === 'number' ? D.state.volume : 0.8;
    if (a === 'mute') { D.state.muted = !D.state.muted; } else { v = Math.max(0, Math.min(1, Math.round((v + (a === 'volup' ? 0.05 : -0.05)) * 20) / 20)); D.state.volume = v; D.state.muted = false; }
    D.save();
    if (S.setVolume) S.setVolume(D.state.muted ? 0 : v);
    R.osd(D.state.muted ? 'mute' : 'volume', D.state.muted ? 'Muted' : 'Dice volume ' + Math.round(v * 100), D.state.muted ? 0 : v);
  };

  // ---- buttons every part of Dice understands --------------------------------------------------
  // Called after the app in front (and DiceTV or the desktop) didn't want the button.
  R.COLOURS = { red: ['channels', 'Channels', '#e5484d'], green: ['calendar', 'Axiom', '#3fa26b'], yellow: ['weather', 'Weather', '#e5b62e'], blue: [null, 'Quick settings', '#3a7bd5'] };
  R.global = function (a) {
    if (a === 'home') {
      if (D.wall && D.wall.on) { D.wall.exit(); return true; }
      if (D.desk && D.desk.on) { if (D.desk.overview) D.desk.overview(); else D.desk.toggleStart(); return true; }
      D.menu.close(true); D.qam.close(true); D.search.close(true);
      if (D.running() && D.$('#app').classList.contains('running')) D.suspend();
      D.shell.go('home', null, { root: true });
      return true;
    }
    if (a === 'guide') { D.launch('calendar', { arg: 'guide', swap: true }); return true; }
    if (R.COLOURS[a]) {
      const [id, name, c] = R.COLOURS[a];
      R.osd('dots', name); osd.style.setProperty('--osd', c);
      if (id) D.launch(id, { swap: true }); else if (D.qam.isOpen()) D.qam.close(); else D.qam.open('quick');
      return true;
    }
    if (a === 'play') { if (M.now) M.toggle(); else M.play('radio', 0); setTimeout(() => R.osd(M.now && M.now.playing ? 'play' : 'pause', M.now ? M.now.name : 'Music'), 30); return true; }
    if (a === 'stop') { M.stop(); R.osd('pause', 'Stopped'); return true; }
    if (a === 'next' || a === 'prev') { M[a](); setTimeout(() => R.osd('music', M.now ? M.now.name : 'Music'), 30); return true; }
    if (a === 'ff' || a === 'rew') { const p = M.progress(); if (p) M.seek(Math.max(0, Math.min(1, (p.t + (a === 'ff' ? 10 : -10)) / p.d))); else M[a === 'ff' ? 'next' : 'prev'](); return true; }
    if (a === 'volup' || a === 'voldown' || a === 'mute') { R.volume(a); return true; }
    if (a === 'sleep') { D.sleep(); return true; }
    if (a === 'power') return D.air ? D.air.power() : (D.sleep(), true);
    if (/^d\d$/.test(a)) {
      if (D.desk && D.desk.on) return false;
      if (D.running() && D.$('#app').classList.contains('running')) return false;
      // the numbers tune Live channels, like a TV
      const n = +a[1], i = n === 0 ? 9 : n - 1, c = D.channels && D.app('channels') && D.channels.LIST[i];
      if (!c) return false;
      R.osd('tv', (i + 1) + '  ' + c.name);
      D.launch('channels', { arg: c.id, swap: true });
      return true;
    }
    return false;
  };

  // ---- the on-screen keyboard ----------------------------------------------------------------------
  const LAYOUT = {
    abc: [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'], ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '\''], ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.'], ['sym', '@', '.com', 'space', 'back', 'done']],
    sym: [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], ['!', '?', '#', '$', '%', '&', '*', '(', ')', '-'], ['_', '=', '+', '/', '\\', ':', ';', '"', '~', '`'], ['abc', '<', '>', '[', ']', '{', '}', '|', ',', '.'], ['abc', '@', '.com', 'space', 'back', 'done']],
  };
  const NAMES = { shift: '⇧', sym: '?123', abc: 'ABC', space: 'Space', back: '⌫', done: 'Done' };
  const K = R.osk = { open: false, field: null, caret: 0, layer: 'abc', shift: false };
  const box = h('<div id="osk" class="glass" hidden role="dialog" aria-label="On-screen keyboard"><div class="osk-top"><span class="osk-text"></span><span class="osk-help"></span></div><div class="osk-keys"></div></div>');
  document.body.appendChild(box);
  const val = () => (K.field.isContentEditable ? K.field.textContent : K.field.value);
  function setVal(v) {
    if (K.field.isContentEditable) K.field.textContent = v; else K.field.value = v;
    K.field.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function paintText() {
    const v = val(), shown = K.field.type === 'password' ? '•'.repeat(v.length) : v;
    const t = box.querySelector('.osk-text');
    t.innerHTML = shown ? esc(shown.slice(0, K.caret)) + '<i class="osk-caret"></i>' + esc(shown.slice(K.caret)) : '<span class="osk-ph">' + esc(K.field.placeholder || K.field.getAttribute('aria-label') || 'Type here') + '</span><i class="osk-caret"></i>';
    box.querySelector('.osk-help').innerHTML = D.btn('x') + ' delete &nbsp; ' + D.btn('y') + ' space &nbsp; ' + D.btn('b') + ' close &nbsp; <span class="osk-kb">Or just type on a keyboard</span>';
  }
  function paintKeys(focusKey) {
    const keys = box.querySelector('.osk-keys');
    keys.innerHTML = '';
    LAYOUT[K.layer].forEach((row, r) => {
      const rowEl = h('<div class="osk-row"></div>');
      row.forEach((k) => {
        const label = NAMES[k] || (K.shift && k.length === 1 ? k.toUpperCase() : k);
        const b = h('<button class="osk-k' + (NAMES[k] ? ' osk-' + k : '') + (k === 'shift' && K.shift ? ' on' : '') + '" data-nav data-key="osk:' + r + ':' + esc(k) + '">' + esc(label) + '</button>');
        b.onclick = () => press(k);
        rowEl.appendChild(b);
      });
      keys.appendChild(rowEl);
    });
    D.nav.focus(keys.querySelector('[data-key="' + (focusKey || 'osk:1:q') + '"]') || keys.querySelector('[data-nav]'), { scroll: false });
  }
  function type(s) {
    const v = val();
    setVal(v.slice(0, K.caret) + s + v.slice(K.caret));
    K.caret += s.length;
    paintText();
  }
  function press(k) {
    S.play('move');
    const focusKey = D.nav.el && D.nav.el.dataset.key;
    if (k === 'shift') { K.shift = !K.shift; return paintKeys(focusKey); }
    if (k === 'sym' || k === 'abc') { K.layer = k === 'sym' ? 'sym' : 'abc'; return paintKeys('osk:4:' + (k === 'sym' ? 'abc' : 'sym')); }
    if (k === 'space') return type(' ');
    if (k === 'back') { const v = val(); if (K.caret > 0) { setVal(v.slice(0, K.caret - 1) + v.slice(K.caret)); K.caret--; paintText(); } return; }
    if (k === 'done') return K.close(true);
    type(K.shift && k.length === 1 ? k.toUpperCase() : k);
    if (K.shift) { K.shift = false; paintKeys(focusKey); }
  }
  K.show = function (field) {
    if (!field || !isField(field) || field.readOnly || field.disabled) return;
    K.field = field; K.open = true; K.layer = 'abc'; K.shift = false;
    K.caret = typeof field.selectionEnd === 'number' && field.selectionEnd !== null ? field.selectionEnd : val().length;
    if (field.type === 'url' || field.type === 'email') K.caret = val().length;
    box.hidden = false; box.classList.add('open');
    document.documentElement.classList.add('osk-on');
    paintText(); paintKeys();
    S.play('open');
  };
  K.close = function (enter) {
    if (!K.open) return;
    K.open = false; K.closedAt = Date.now();
    box.classList.remove('open'); box.hidden = true;
    document.documentElement.classList.remove('osk-on');
    const f = K.field;
    if (!f || !f.isConnected) return;
    D.nav.focus(f);
    try { f.focus(); if (f.setSelectionRange) f.setSelectionRange(K.caret, K.caret); } catch (e) { /* some fields have no caret */ }
    if (enter) {
      const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      f.dispatchEvent(ev);
      if (!ev.defaultPrevented && f.form && f.form.requestSubmit) f.form.requestSubmit();
    }
  };
  // what the buttons do while it's open
  K.action = function (a) {
    if (['up', 'down', 'left', 'right'].includes(a)) { D.nav.move(a); return true; }
    if (a === 'a') { D.nav.press(); return true; }
    if (a === 'b') { K.close(false); S.play('back'); return true; }
    if (a === 'x') { press('back'); return true; }
    if (a === 'y') { press('space'); return true; }
    if (a === 'lb' || a === 'rb') { K.caret = Math.max(0, Math.min(val().length, K.caret + (a === 'rb' ? 1 : -1))); paintText(); return true; }
    if (a === 'menu') { K.close(true); return true; }
    return true;
  };
  // When it comes up by itself: on DiceTV whatever you point with (a remote, an air mouse,
  // a controller), and on the desktop with a remote or a controller, until you type on a
  // real keyboard (like the one on the back of an air mouse). Then it keeps out of the way
  // for half an hour, and comes back if you stop.
  K.hwAt = 0;
  K.hwRecent = () => Date.now() - K.hwAt < 30 * 60000;
  const mode = () => D.state.osk || 'auto';
  const wanted = () => {
    const m = mode();
    if (m === 'never') return false;
    if (m === 'always') return true;
    if (K.hwRecent()) return false;
    return !(D.desk && D.desk.on) || D.input.source === 'pad' || D.input.source === 'remote';
  };
  K.wanted = wanted;
  // a letter typed on a real keyboard: put the on-screen one away, and keep the letter
  D.keyFirst.push((e) => {
    if (!e.isTrusted || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || /\d/.test(e.key)) return false;
    const fresh = !K.hwRecent();
    K.hwAt = Date.now();
    if (!K.open || !K.field || !K.field.isConnected) return false;
    e.preventDefault(); e.stopPropagation();
    const f = K.field, ch = e.key;
    K.close(false);
    try { f.setRangeText(ch, f.selectionStart, f.selectionEnd, 'end'); } catch (x) { if (f.isContentEditable) f.textContent += ch; else f.value += ch; }
    f.dispatchEvent(new Event('input', { bubbles: true }));
    if (fresh) R.osd('keys', 'Typing on your keyboard: the on-screen one stays away');
    return true;
  });
  // moving onto a box with the arrows doesn't open it; pressing OK on it does
  let moving = false;
  const move0 = D.nav.move;
  D.nav.move = function () { moving = true; try { return move0.apply(D.nav, arguments); } finally { moving = false; } };
  document.addEventListener('focusin', (e) => {
    if (K.open || moving || !wanted() || !isField(e.target) || e.target.closest('#osk') || Date.now() - (K.closedAt || 0) < 400) return;
    const f = e.target;
    setTimeout(() => { if (document.activeElement === f && !K.open) K.show(f); }, 40);
  });

  // ---- every button goes through here first -------------------------------------------------------
  const fire0 = D.input.fire;
  D.input.fire = function (a, src) {
    if (K.open) { if (!K.field || !K.field.isConnected) K.close(false); else { K.action(a); return; } }
    // (Enter in a box you're already typing in means "done", not "show the keyboard")
    if (a === 'a' && wanted() && isField(D.nav.el) && !D.booting && !D.asleep && !(src === 'keys' && document.activeElement === D.nav.el)) { K.show(D.nav.el); return; }
    return fire0.call(D.input, a, src);
  };

  // ---- the remote's own Back, Home and microphone buttons (diced reads them straight from it) -------
  //   Back: back (held: Home)   Home: Home, or closes an app on top (held: Quick access)
  //   Microphone: Deuce listens while it's held (a quick press: until you stop talking)
  const downs = {};
  function held(ev) {
    D.input.setSource('remote');
    if (D.booting) { if (ev.down) D.skipBoot(); return; }
    if (ev.a === 'voice') { if (D.asleep && ev.down) D.wake(); D.emit('voicekey', ev.down); return; }
    if (ev.down) {
      if (D.asleep) { D.wake(); downs[ev.a] = -1; return; }
      downs[ev.a] = Date.now();
      clearTimeout(downs[ev.a + 'T']);
      downs[ev.a + 'T'] = setTimeout(() => { if (downs[ev.a] > 0) { downs[ev.a] = -1; D.input.fire(ev.a === 'home' ? 'quick' : 'home', 'remote'); } }, 700);
      return;
    }
    clearTimeout(downs[ev.a + 'T']);
    if (downs[ev.a] > 0) D.input.fire(ev.a, 'remote');
    downs[ev.a] = 0;
  }
  // when diced reads these buttons itself, the browser's copies of them (which can also mean
  // "go back a page") are ignored
  D.keyFirst.push((e) => {
    if (!D.sys || !D.sys.status || !D.sys.status.remote_keys || !/^(BrowserBack|BrowserHome|BrowserSearch|GoBack)$/.test(e.key)) return false;
    e.preventDefault();
    return true;
  });

  // ---- the TV's own remote, through the HDMI cable (DiceOS) --------------------------------------
  R.cec = null;
  R.last = null;
  R.event = function (ev) {
    if (ev.cec) { R.cec = ev.cec; D.emit('cec', ev.cec); }
    // the TV turned itself off (its own remote), or on again
    if (ev.tv === 'standby') { if (!D.asleep) D.sleep(); return; }
    if (ev.tv === 'on') { if (D.asleep) D.wake(); return; }
    if (ev.learned != null) { D.emit('learned', ev.learned); return; }
    if (ev.voice) { D.emit('voice', ev.voice); return; }
    // a link from another app on DiceOS (dice-open): it opens in SereneTab
    if (typeof ev.browse === 'string') { if (D.asleep) D.wake(); if (D.browse) D.browse(ev.browse); return; }
    if (ev.a && 'down' in ev) return held(ev);
    if (!ev.a) return;
    R.last = { a: ev.a, key: ev.key || ev.a, at: Date.now() };
    D.input.setSource('remote');
    D.emit('remote', R.last);
    D.input.fire(ev.a, 'remote');
  };
  async function listen() {
    if (!D.sys) return;
    try {
      const res = await fetch('/api/events', { headers: { 'X-Dice': D.sys.info.token } });
      if (!res.ok || !res.body) throw new Error('no events');
      const rd = res.body.getReader(), dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await rd.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const line = buf.slice(0, i).split('\n').find((l) => l.startsWith('data:'));
          buf = buf.slice(i + 2);
          if (line) { try { R.event(JSON.parse(line.slice(5))); } catch (e) { /* not for us */ } }
        }
      }
    } catch (e) { /* the helper restarted, or there's no remote: try again in a bit */ }
    setTimeout(listen, 4000);
  }
  if (D.sys) {
    D.sys.get('/api/remote').then((r) => { if (r && r.ok) { R.cec = r; D.emit('cec', r); } });
    setTimeout(listen, 600);
    // the TV sleeps and wakes with DiceOS, if you like
    const sleep0 = D.sleep, wake0 = D.wake;
    D.sleep = function () { const r = sleep0.apply(D, arguments); if (R.cec && R.cec.available && D.sys.settings.cec_tv_off) D.sys.post('/api/remote', { cmd: 'tv-off' }); return r; };
    D.wake = function () { const r = wake0.apply(D, arguments); if (R.cec && R.cec.available && D.sys.settings.cec_tv_off) D.sys.post('/api/remote', { cmd: 'tv-on' }); return r; };
  }
})();
