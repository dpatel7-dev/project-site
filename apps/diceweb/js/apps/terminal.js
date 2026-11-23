// Terminal: a pretend command line, with its own disk kept in the browser.
(function () {
  'use strict';
  const D = window.Dice, L = D.L, esc = D.esc;
  const COMMANDS = ['help', 'ls', 'cd', 'pwd', 'cat', 'echo', 'mkdir', 'touch', 'rm', 'roll', 'apps', 'open', 'say', 'look', 'neofetch', 'date', 'whoami', 'uptime', 'history', 'fortune', 'clear', 'exit', 'notes'];

  D.register({ id: 'terminal', mount(root, ctx) {
    root.classList.add('term');
    root.innerHTML = '<div class="term-out" aria-live="polite"></div><form class="term-line"><label class="term-ps"></label><input class="term-in" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Type a command"></form>';
    const out = root.querySelector('.term-out'), input = root.querySelector('.term-in'), ps = root.querySelector('.term-ps');
    let cwd = D.home(), hist = D.state.hist || [], hi = hist.length;
    function prompt() {
      const where = cwd === D.home() ? '~' : cwd.startsWith(D.home() + '/') ? '~' + cwd.slice(D.home().length) : cwd;
      ps.innerHTML = '<span class="t-hi">' + esc(D.user()) + '@diceweb</span> <span class="t-dir">' + esc(where) + '</span> <span class="t-dim">$</span>';
    }
    function line(x, cls) {
      const el = document.createElement('div');
      el.className = 'tl ' + (cls || '');
      if (typeof x === 'string') el.textContent = x;
      else x.s.forEach(([t, c]) => { const s = document.createElement('span'); s.textContent = t; if (c) s.className = 't-' + c; el.appendChild(s); });
      out.appendChild(el);
    }
    function ensureHome() {
      if (!L.walk(D.state.disk, D.home())) {
        const homes = L.walk(D.state.disk, '/home');
        const old = homes && Object.keys(homes.kids)[0];
        if (old) { homes.kids[D.user()] = homes.kids[old]; delete homes.kids[old]; } else L.makeDir(D.state.disk, D.home());
        D.save();
      }
    }
    ensureHome();
    function run(text) {
      line({ s: [[ps.textContent + ' ', 'dim'], [text, '']] }, 'tl-cmd');
      if (text.trim()) { hist.push(text); hist = hist.slice(-200); D.state.hist = hist; hi = hist.length; }
      const apps = D.all().map((a) => ({ id: a.id, name: a.name, kind: a.suite ? 'suite' : a.kind }));
      const friends = {}; D.friends.forEach((f) => { friends[f.id] = f.name; });
      const res = L.run(text, { disk: D.state.disk, cwd, user: D.user(), apps, friends, rand: Math.random, now: Date.now(), started: D.started, history: hist, look: D.state.look === 'auto' ? 'follows the clock (' + (D.night() ? 'night' : 'day') + ' now)' : D.state.look, screen: innerWidth + 'x' + innerHeight, version: D.version });
      if (res.clear) out.innerHTML = '';
      res.out.forEach((l) => line(l));
      cwd = res.cwd;
      if (res.changed) D.emit('disk');
      if (res.look) { D.set('look', res.look); D.applyLook(true); }
      if (res.rolled) ctx.sound.play('rattle');
      if (text.trim()) { D.state.stats.cmds = (D.state.stats.cmds || 0) + 1; if (D.state.stats.cmds >= 10) ctx.achieve('terminal-10'); }
      D.save();
      prompt();
      out.scrollTop = out.scrollHeight;
      if (res.open) setTimeout(() => ctx.open(res.open), 250);
      if (res.exit) setTimeout(() => ctx.close(), 150);
    }
    root.querySelector('form').onsubmit = (e) => { e.preventDefault(); const v = input.value; input.value = ''; run(v); };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); if (hi > 0) { hi--; input.value = hist[hi] || ''; } }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (hi < hist.length) { hi++; input.value = hist[hi] || ''; } }
      else if (e.key === 'Tab') { e.preventDefault(); complete(); }
      else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); out.innerHTML = ''; }
    });
    function complete() {
      const v = input.value, parts = v.split(' ');
      const last = parts[parts.length - 1];
      let options;
      if (parts.length === 1) options = COMMANDS.filter((c) => c.startsWith(last));
      else if (/^(open|play|start)$/.test(parts[0])) options = D.all().map((a) => a.id).filter((id) => id.startsWith(last));
      else {
        const slash = last.lastIndexOf('/');
        const dir = slash >= 0 ? last.slice(0, slash + 1) : '';
        const node = L.walk(D.state.disk, L.resolve(cwd, dir || '.', D.home()));
        options = node && node.type === 'dir' ? Object.keys(node.kids).filter((n) => n.startsWith(last.slice(slash + 1))).map((n) => dir + n + (node.kids[n].type === 'dir' ? '/' : '')) : [];
      }
      if (options.length === 1) { parts[parts.length - 1] = options[0] + (options[0].endsWith('/') ? '' : ' '); input.value = parts.join(' '); }
      else if (options.length > 1) { line({ s: [[options.join('   '), 'dim']] }); out.scrollTop = out.scrollHeight; }
    }
    root.addEventListener('pointerup', () => { if (!getSelection().toString()) input.focus(); });
    line({ s: [['DiceWeb ' + D.version + ' Terminal. ', 'hi'], ['Type ', 'out'], ['help', 'hi'], [' to see what you can do.', 'out']] });
    prompt();
    setTimeout(() => input.focus(), 60);
    ctx.legend([]);
    return {
      resume() { setTimeout(() => input.focus(), 60); },
      onAction(a) { if (a === 'a' && document.activeElement !== input) { input.focus(); return true; } return false; },
      unmount() {},
    };
  } });
})();
