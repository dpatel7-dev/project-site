// hey: plain words in, a Terminal command out.
//
// The OS version of hey from the suite, with Biscuit the dog. Say what you want ("find big files in my
// downloads") and get the command, what it does in plain words, each part explained, and how risky it is:
// Safe (it only looks), Careful (it changes something: asks first) or Risky (deleting, sudo, scripts from
// the internet: type yes). Run puts it in Terminal for you to press Enter; Copy copies it; Change it asks
// again with what you'd like different. "explain <command>" takes any command apart.
// Everyday things work with no AI; Deuce's brain (if it's set up) does the rest. The risk is always hey's.
(function () {
  'use strict';
  const D = window.Dice, h = D.h, esc = D.esc, S = D.S, G = D.G, H = window.HeyBrain;
  const IDEAS = ['find big files in my downloads', 'how much space is left', 'what is taking up space in my home folder', 'make a folder called school in documents', 'is the internet working', 'what is my ip', 'explain ls -lah ~/Downloads', 'update everything'];
  const COL = { safe: '#2fa59a', careful: '#e8913a', risky: '#ef4b5a' };

  async function ask(said, change, before) {
    const plain = !change && H.hey(said);
    if (plain) return plain;
    const Mind = D.deuce && D.deuce.mind;
    if (!Mind || !Mind.once) return null;
    const sys = 'You turn plain English into ONE Linux (Debian, bash) command for a beginner on DiceOS. Home is ~. Prefer safe, read-only commands. Never use rm -rf. Keep it to one line.';
    const q = change ? 'They asked: "' + said + '". You gave: ' + before + '\nThey want this changed: ' + change : 'They want to: ' + said;
    const r = await Mind.once(sys, q, { type: 'object', properties: { command: { type: 'string' }, what: { type: 'string' } }, required: ['command', 'what'] }).catch(() => null);
    if (!r || !r.command) return null;
    const cmd = String(r.command).replace(/^`+|`+$/g, '').replace(/^\$\s*/, '').split('\n')[0].trim();
    return { cmd, parts: H.parts(cmd), risk: H.risk(cmd), said, what: r.what, ai: true };
  }

  D.register({ id: 'hey', mount(root, ctx) {
    root.classList.add('hey');
    root.innerHTML = '<div class="hy-in"><header class="hy-top"><canvas class="hy-dog" width="40" height="40" aria-hidden="true"></canvas><div><b class="pix">hey</b><span>Say what you want to do. Biscuit finds the command.</span></div></header>' +
      '<form class="hy-ask"><input data-nav data-key="hy:ask" placeholder="find big files in my downloads" aria-label="What do you want to do?" autocomplete="off" spellcheck="false"><button class="b go" data-nav data-key="hy:go">Ask</button></form>' +
      '<div class="hy-ideas" data-row></div><section class="hy-out" aria-live="polite"></section></div>';
    const input = root.querySelector('input'), out = root.querySelector('.hy-out'), ideas = root.querySelector('.hy-ideas');
    const dog = G.mascot('hey');
    if (dog) { const g = root.querySelector('.hy-dog').getContext('2d'); g.imageSmoothingEnabled = false; const k = 40 / Math.max(dog.width, dog.height); g.drawImage(dog, (40 - dog.width * k) / 2, (40 - dog.height * k) / 2, dog.width * k, dog.height * k); }
    IDEAS.forEach((t, i) => { const b = h('<button class="hy-idea" data-nav data-key="hy:i' + i + '"></button>'); b.textContent = t; b.onclick = () => { input.value = t; go(); }; ideas.appendChild(b); });
    let last = null;
    root.querySelector('form').onsubmit = (e) => { e.preventDefault(); go(); };
    async function go(change) {
      const said = input.value.trim();
      if (!said) return input.focus();
      out.innerHTML = '<p class="hy-wait">Biscuit is sniffing around…</p>';
      const r = await ask(said, change, last && last.cmd);
      if (!r) { out.innerHTML = '<p class="hy-none">Biscuit doesn\'t know that one yet. Try saying it another way' + (D.deuce && D.deuce.mind ? ', or set up Deuce\'s brain (Settings, Deuce) and hey can work out almost anything.' : '.') + '</p>'; return; }
      last = r;
      show(r);
    }
    function show(r) {
      out.innerHTML = '';
      const card = h('<div class="hy-card" style="--r:' + COL[r.risk] + '"><div class="hy-risk"><i></i><span></span></div><pre class="hy-cmd" tabindex="0"></pre><p class="hy-what"></p><ul class="hy-parts"></ul>' +
        '<div class="hy-acts"><button class="b go" data-nav data-key="hy:run">' + D.glyph('play', 2) + 'Run in Terminal</button><button class="b" data-nav data-key="hy:copy">' + D.glyph('copy', 2) + 'Copy</button><button class="b" data-nav data-key="hy:change">Change it</button></div></div>');
      card.querySelector('.hy-risk span').textContent = H.RISK_WORDS[r.risk];
      card.querySelector('.hy-cmd').textContent = r.cmd;
      card.querySelector('.hy-what').textContent = r.explain ? 'Here\'s what it does, piece by piece:' : r.what || ('It ' + (r.parts[0] && r.parts[0][0] === 'sudo' ? (r.parts[1] || [])[1] : (r.parts[0] || [])[1] || 'runs') + '.') + (r.ai ? ' (Deuce\'s brain wrote it; hey checked how risky it is.)' : '');
      const ul = card.querySelector('.hy-parts');
      r.parts.forEach(([p, m]) => { const li = h('<li><code></code><span></span></li>'); li.querySelector('code').textContent = p; li.querySelector('span').textContent = m; ul.appendChild(li); });
      card.querySelector('[data-key="hy:copy"]').onclick = () => { try { navigator.clipboard.writeText(r.cmd); } catch (e) { /* fine */ } if (D.magpie) D.magpie.remember(r.cmd, 'hey'); D.toast({ icon: 'copy', c: '#f2c14e', title: 'Copied', text: r.cmd }); };
      card.querySelector('[data-key="hy:run"]').onclick = () => run(r);
      card.querySelector('[data-key="hy:change"]').onclick = () => D.ask({ title: 'What should be different?', input: { label: 'What to change', placeholder: 'only pdfs, and in Documents' }, buttons: [{ label: 'Ask again', value: true, go: true }, { label: 'Never mind', value: false }] }).then((a) => { if (a && a.ok && a.value) go(a.value); });
      out.appendChild(card);
      S.play(r.risk === 'risky' ? 'error' : 'select');
    }
    function run(r) {
      const send = () => { D.launch('terminal'); setTimeout(() => D.emit('terminal-type', r.cmd), D.sys && !D.sys.info.emulated ? 900 : 350); };
      if (r.risk === 'safe') return send();
      if (r.risk === 'careful') return D.ask({ title: 'Run it?', text: r.cmd + '\n\nIt changes something on your computer.', buttons: [{ label: 'Put it in Terminal', value: true, go: true }, { label: 'Not now', value: false }] }).then((ok) => { if (ok) send(); });
      D.ask({ title: 'This one is risky', text: r.cmd + '\n\nIt can delete or change things for good. Type yes to put it in Terminal.', input: { label: 'Type yes', placeholder: 'yes' }, buttons: [{ label: 'Put it in Terminal', value: true, go: true, danger: true }, { label: 'Not now', value: false }] })
        .then((a) => { if (a && a.ok && /^yes$/i.test(String(a.value).trim())) send(); else if (a && a.ok) D.toast({ icon: 'help', c: '#ef4b5a', title: 'Not run', text: 'Type yes, exactly, to run a risky one.' }); });
    }
    if (ctx.arg && typeof ctx.arg === 'string') { input.value = ctx.arg; go(); }
    setTimeout(() => (ctx.mode === 'run' ? D.nav.focus(input) : input.focus()), 60);
    ctx.legend([]);
    return { unmount() {} };
  } });
})();
