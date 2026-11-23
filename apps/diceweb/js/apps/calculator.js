// Calculator: type a sum or press the keys. It works the sum out as you go,
// and keeps the last few answers.
(function () {
  'use strict';
  const D = window.Dice, L = D.L, h = D.h, esc = D.esc;
  const KEYS = [['C', 'clear'], ['(', '('], [')', ')'], ['÷', 'op'], ['7'], ['8'], ['9'], ['×', 'op'], ['4'], ['5'], ['6'], ['−', 'op'], ['1'], ['2'], ['3'], ['+', 'op'], ['0'], ['.'], ['⌫', 'back'], ['=', 'eq']];

  D.register({ id: 'calculator', mount(root) {
    root.classList.add('calc');
    root.innerHTML = '<div class="ca-screen"><div class="ca-sum" aria-label="Sum"></div><output class="ca-out" aria-live="polite">0</output></div><div class="ca-keys"></div><div class="ca-hist" aria-label="Earlier answers"></div>';
    const sumEl = root.querySelector('.ca-sum'), out = root.querySelector('.ca-out'), keys = root.querySelector('.ca-keys'), hist = root.querySelector('.ca-hist');
    let sum = '', done = false;
    const past = (D.state.calcHist || []).slice(0, 4);
    function show() {
      sumEl.textContent = sum || ' ';
      let v = null;
      try { v = L.calc(sum); } catch (e) { /* not a whole sum yet */ }
      out.textContent = v === null ? (sum ? out.textContent : '0') : L.calcText(v);
      out.classList.toggle('done', done);
      hist.innerHTML = past.map((p, i) => '<button data-nav data-key="ca:h' + i + '" data-i="' + i + '"><span>' + esc(p.sum) + ' =</span><b>' + esc(p.ans) + '</b></button>').join('');
      hist.querySelectorAll('button').forEach((b) => { b.onclick = () => { sum = past[+b.dataset.i].ans.replace(/,/g, ''); done = false; show(); }; });
    }
    function press(k, kind) {
      if (kind === 'clear') { sum = ''; done = false; }
      else if (kind === 'back') { sum = sum.slice(0, -1); done = false; }
      else if (kind === 'eq') {
        try {
          const v = L.calc(sum), ans = L.calcText(v);
          if (isFinite(v)) { past.unshift({ sum, ans }); past.length = Math.min(past.length, 4); D.state.calcHist = past; D.save(); sum = String(+v.toPrecision(12)); }
          done = true;
        } catch (e) { out.textContent = 'Not a whole sum yet'; return; }
      } else {
        if (done && kind !== 'op') sum = '';
        done = false;
        if (kind === 'op' && /[+−×÷]$/.test(sum)) sum = sum.slice(0, -1);
        sum += k;
      }
      D.S.play('type');
      show();
    }
    KEYS.forEach(([k, kind]) => {
      const b = h('<button class="ca-k ' + (kind || 'num') + '" data-nav data-key="ca:' + esc(k) + '">' + esc(k) + '</button>');
      b.onclick = () => press(k, kind);
      keys.appendChild(b);
    });
    // typing works too
    const MAP = { '*': '×', x: '×', '/': '÷', '-': '−', '+': '+', '(': '(', ')': ')', '.': '.', '%': '%' };
    function onKey(e) {
      if (!root.isConnected || e.ctrlKey || e.metaKey || e.altKey) return;
      const win = root.closest('.win');
      if (win ? !win.classList.contains('active') : D.desk.on) return;
      if (/input|textarea/i.test((document.activeElement || {}).tagName || '')) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (MAP[e.key]) press(MAP[e.key], '+−×÷'.includes(MAP[e.key]) ? 'op' : undefined);
      else if ((e.key === 'Enter' && !root.querySelector('.is-focus')) || e.key === '=') press('=', 'eq');
      else if (e.key === 'Backspace') press('⌫', 'back');
      else if (e.key === 'Escape' && sum) press('C', 'clear');
      else return;
      e.preventDefault(); e.stopPropagation();
    }
    addEventListener('keydown', onKey, true);
    show();
    return { unmount() { removeEventListener('keydown', onKey, true); } };
  } });
})();
