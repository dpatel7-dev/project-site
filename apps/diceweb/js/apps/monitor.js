// System Monitor: how busy the computer is, how much memory and storage are
// used, and what's open (with a button to close it). On Dice the numbers come
// from the computer itself; in a browser, from what the browser will say.
(function () {
  'use strict';
  const D = window.Dice, h = D.h, esc = D.esc;
  const GB = (b) => (b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.round(b / 1e6) + ' MB');
  const ago = (s) => { const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return (d ? d + ' d ' : '') + (d || hh ? hh + ' h ' : '') + m + ' min'; };

  // how busy, in a browser: how late each frame turns up (a busy computer is late)
  const busy = { hist: [], late: 0, last: 0 };
  (function measure(now) {
    if (busy.last) { const gap = now - busy.last; busy.late = busy.late * 0.9 + Math.max(0, gap - 16.7) * 0.1; }
    busy.last = now;
    requestAnimationFrame(measure);
  })(performance.now());
  setInterval(() => {
    const st = D.sys && D.sys.status;
    const cores = navigator.hardwareConcurrency || 4;
    const v = st && st.load != null ? Math.min(100, (st.load / cores) * 100) : Math.min(100, busy.late * 4);
    busy.hist.push(v); if (busy.hist.length > 60) busy.hist.shift();
  }, 1000);

  D.register({ id: 'monitor', mount(root) {
    root.classList.add('mon');
    root.innerHTML = '<section class="mon-cards"><div class="mon-card"><h3>How busy</h3><output class="mon-cpu"></output><canvas class="mon-graph" width="300" height="80" aria-hidden="true"></canvas></div>' +
      '<div class="mon-card"><h3>Memory</h3><output class="mon-mem"></output><div class="mon-bar"><i class="mon-mem-bar"></i></div><span class="mon-sub mon-mem-sub"></span></div>' +
      '<div class="mon-card"><h3>Storage</h3><output class="mon-disk"></output><div class="mon-bar"><i class="mon-disk-bar"></i></div><span class="mon-sub mon-disk-sub"></span></div>' +
      '<div class="mon-card"><h3>This computer</h3><dl class="mon-facts"></dl></div></section>' +
      '<section class="mon-procs"><h3>Open now</h3><div class="mon-list"></div></section>';
    const g = root.querySelector('.mon-graph').getContext('2d');
    let disk = null;
    if (!D.sys && navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then((e) => { disk = { used: e.usage || 0, total: e.quota || 0, browser: true }; draw(); }).catch(() => {});
    function draw() {
      const st = D.sys && D.sys.status;
      const cpu = busy.hist[busy.hist.length - 1] || 0;
      root.querySelector('.mon-cpu').textContent = Math.round(cpu) + '%';
      // the graph: the last minute
      const cv = g.canvas, W = cv.width, H = cv.height;
      g.clearRect(0, 0, W, H);
      g.fillStyle = 'rgba(128,128,140,.12)'; for (let y = 0; y <= 4; y++) g.fillRect(0, Math.round((y / 4) * (H - 1)), W, 1);
      g.fillStyle = 'rgba(58,157,104,.25)'; g.strokeStyle = '#3a9d68'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(W, H);
      busy.hist.forEach((v, i) => g.lineTo(W - (busy.hist.length - 1 - i) * (W / 59), H - (v / 100) * (H - 4) - 2));
      g.lineTo(W - (busy.hist.length - 1) * (W / 59), H); g.closePath(); g.fill();
      g.beginPath(); busy.hist.forEach((v, i) => { const x = W - (busy.hist.length - 1 - i) * (W / 59), y = H - (v / 100) * (H - 4) - 2; if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
      // memory
      let mem = st && st.mem;
      const pm = performance.memory;
      if (!mem && pm && pm.usedJSHeapSize > 0 && pm.jsHeapSizeLimit > 0) mem = { used: pm.usedJSHeapSize, total: pm.jsHeapSizeLimit, browser: true };
      root.querySelector('.mon-mem').textContent = mem ? GB(mem.used) : 'Not shared';
      root.querySelector('.mon-mem-bar').style.width = mem ? Math.round((mem.used / mem.total) * 100) + '%' : '0';
      root.querySelector('.mon-mem-sub').textContent = mem ? 'of ' + GB(mem.total) + (mem.browser ? ' this page may use' : '') : 'This browser doesn\'t say.';
      // storage
      const dk = (st && st.disk) || disk;
      root.querySelector('.mon-disk').textContent = dk ? GB(dk.used) : '…';
      root.querySelector('.mon-disk-bar').style.width = dk && dk.total ? Math.max(1, Math.round((dk.used / dk.total) * 100)) + '%' : '0';
      root.querySelector('.mon-disk-sub').textContent = dk ? 'of ' + GB(dk.total) + (dk.browser ? ' this browser lets DiceWeb keep' : ' in your home folder\'s drive') : '';
      // facts
      const facts = [];
      if (st) { facts.push(['Computer', st.model], ['Name', st.host], ['On for', ago(st.uptime || 0)]); if (st.temp != null) facts.push(['Temperature', st.temp + ' °C']); if (st.ip) facts.push(['Address', st.ip]); }
      else facts.push(['Running in', 'Your browser'], ['Processor', (navigator.hardwareConcurrency || '?') + ' cores'], ['Memory', navigator.deviceMemory ? 'About ' + navigator.deviceMemory + ' GB' : 'Not shared'], ['Screen', screen.width + ' × ' + screen.height]);
      root.querySelector('.mon-facts').innerHTML = facts.map(([k, v]) => '<div><dt>' + esc(k) + '</dt><dd>' + esc(String(v)) + '</dd></div>').join('');
      // what's open
      const list = root.querySelector('.mon-list');
      const open = D.desk.on ? D.desk.wins : D.running() ? [D.running()] : [];
      const sig = open.map((w) => w.id).join();
      if (list.dataset.sig !== sig) {
        list.dataset.sig = sig;
        list.innerHTML = open.length ? '' : '<p class="muted">Nothing else is open.</p>';
        open.forEach((w) => {
          const row = h('<div class="mon-row"><span>' + esc(w.app.name) + '</span><span class="muted">' + (w.min ? 'Minimised' : 'Open') + '</span><button class="b small" data-nav' + (w.id === 'monitor' ? ' disabled' : '') + '>End</button></div>');
          row.prepend(D.appIconEl(w.app, 22));
          row.querySelector('button').onclick = () => { if (D.desk.on) w.close(); else D.closeApp(); };
          list.appendChild(row);
        });
      }
    }
    const t = setInterval(draw, 1000);
    draw();
    return { unmount() { clearInterval(t); } };
  } });
})();
