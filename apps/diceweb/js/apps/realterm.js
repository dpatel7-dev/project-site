// The real Terminal, when DiceWeb runs on a Pi as Dice: a real shell, in a
// real terminal screen (see vt.js). Elsewhere the pretend Terminal stays.
(function () {
  'use strict';
  const D = window.Dice;
  if (!D.sys) return;
  D.register({ id: 'terminal', mount(root, ctx) {
    root.classList.add('rterm');
    root.innerHTML = '<div class="rterm-in" tabindex="-1"></div><textarea class="rterm-keys" aria-label="Terminal: type here" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"></textarea>';
    const box = root.querySelector('.rterm-in'), keys = root.querySelector('textarea');
    const enc = new TextEncoder();
    let ws = null, closed = false, cw = 8, chh = 18;
    const send = (s) => { if (ws && ws.readyState === 1) ws.send(enc.encode(s)); };
    const vt = new DiceVT(box, { onReply: send, onTitle: (t) => ctx.setTitle(t + ' – Terminal'), onDraw: () => { if (stick) box.scrollTop = box.scrollHeight; } });
    let stick = true;
    box.addEventListener('scroll', () => { stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 4; }, { passive: true });
    function measure() {
      const probe = document.createElement('span');
      probe.className = 'vt-probe'; probe.textContent = 'MMMMMMMMMM';
      box.appendChild(probe);
      const r = probe.getBoundingClientRect();
      cw = r.width / 10 || 8; chh = r.height || 18;
      probe.remove();
    }
    function fit() {
      measure();
      const cols = Math.floor((box.clientWidth - 16) / cw), rows = Math.floor((box.clientHeight - 12) / chh);
      if (vt.resize(cols, rows) && ws && ws.readyState === 1) ws.send(JSON.stringify({ resize: [vt.cols, vt.rows] }));
    }
    function connect() {
      closed = false;
      fit();
      ws = new WebSocket(D.sys.termUrl(vt.cols, vt.rows));
      ws.binaryType = 'arraybuffer';
      ws.onmessage = (e) => vt.write(typeof e.data === 'string' ? e.data : new Uint8Array(e.data));
      ws.onclose = () => { if (!closed) { closed = true; vt.write('\r\n\x1b[2m[The shell has closed. Press Enter for a new one.]\x1b[0m\r\n'); } };
    }
    keys.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) { e.preventDefault(); const t = getSelection().toString(); if (t) navigator.clipboard.writeText(t).catch(() => {}); return; }
      if (e.ctrlKey && e.shiftKey && (e.key === 'V' || e.key === 'v')) return; // the paste event handles it
      if (closed && e.key === 'Enter') { e.preventDefault(); vt.reset(); connect(); return; }
      const b = vt.keyBytes(e);
      if (b !== null) { e.preventDefault(); stick = true; send(b); }
    });
    keys.addEventListener('input', () => { if (keys.value) { stick = true; send(keys.value); keys.value = ''; } });
    keys.addEventListener('paste', (e) => {
      e.preventDefault();
      const t = (e.clipboardData || window.clipboardData).getData('text');
      if (t) send(vt.paste ? '\x1b[200~' + t + '\x1b[201~' : t.replace(/\r?\n/g, '\r'));
    });
    // while you type here, every key belongs to the shell (except Ctrl+1 and Ctrl+2)
    keys.addEventListener('focus', () => { vt.focused = true; vt.render(); D.keyHook = (e) => e.target === keys && !(e.ctrlKey && (e.key === '1' || e.key === '2')); });
    keys.addEventListener('blur', () => { vt.focused = false; vt.render(); D.keyHook = null; });
    root.addEventListener('pointerup', () => { if (!getSelection().toString()) keys.focus({ preventScroll: true }); });
    const ro = new ResizeObserver(() => { clearTimeout(fit.t); fit.t = setTimeout(fit, 60); });
    ro.observe(box);
    connect();
    setTimeout(() => keys.focus({ preventScroll: true }), 80);
    ctx.legend([]);
    return {
      onAction(a) { return a !== 'menu' && a !== 'quick'; },
      resume() { setTimeout(() => keys.focus({ preventScroll: true }), 60); fit(); },
      resize() { fit(); },
      unmount() { closed = true; if (ws) ws.close(); ro.disconnect(); D.keyHook = null; },
    };
  } });
})();
