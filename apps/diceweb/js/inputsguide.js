// Inputs, step by step: how to set up DiceOS as a KVM switch, for anyone.
//   1. Things plugged into your TV (HDMI-CEC)
//   2. Your computer screen's other inputs (DDC/CI)
//   3. One keyboard and mouse for two computers (Deskflow)
// Inside Dice it's a guide over the screen, with buttons that check each step for real
// (D.inputs.guide()). The website's page (/dice/inputs) shows the same steps and drawings,
// from window.DiceInputsGuide.
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // ---- drawings ---------------------------------------------------------------------------------------------
  const C = { tv: '#2b2f45', screen: '#bfe0ff', screen2: '#e6dcff', dice: '#4b7bec', ps: '#2f6fd6', box: '#3a3f4b', cable: '#8a8fa6', laptop: '#9aa3b8', on: '#2f9e6e', warm: '#ef6a55', gold: '#e9a23b', violet: '#8a6bd8' };
  const defs = '<defs><linearGradient id="ig-sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cfe6ff"/><stop offset=".55" stop-color="#e5dcff"/><stop offset="1" stop-color="#ffe2cf"/></linearGradient>' +
    '<linearGradient id="ig-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity=".55"/></linearGradient></defs>';
  const die = (x, y, s) => '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"><rect x="-10" y="-10" width="20" height="20" rx="5" fill="#26262e"/><circle cx="-4" cy="-4" r="2.2" fill="#fff"/><circle cx="4" cy="4" r="2.2" fill="#fff"/></g>';
  const label = (x, y, t, c, size) => '<text x="' + x + '" y="' + y + '" text-anchor="middle" font-family="Atkinson Hyperlegible, system-ui, sans-serif" font-weight="700" font-size="' + (size || 12) + '" fill="' + (c || '#20243a') + '">' + esc(t) + '</text>';
  const tvBox = (x, y, w, h, inner) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="10" fill="' + C.tv + '"/><rect x="' + (x + 7) + '" y="' + (y + 7) + '" width="' + (w - 14) + '" height="' + (h - 14) + '" rx="5" fill="url(#ig-sky)"/>' + (inner || '') +
    '<rect x="' + (x + w / 2 - 16) + '" y="' + (y + h) + '" width="32" height="10" fill="' + C.tv + '"/><rect x="' + (x + w / 2 - 40) + '" y="' + (y + h + 10) + '" width="80" height="6" rx="3" fill="' + C.tv + '"/>';
  const port = (x, y, n, c) => '<rect x="' + x + '" y="' + y + '" width="34" height="16" rx="3" fill="#fff" stroke="' + (c || C.cable) + '" stroke-width="2"/>' + label(x + 17, y + 12, 'HDMI ' + n, c || '#5a5f75', 9);
  const cable = (d, c) => '<path d="' + d + '" fill="none" stroke="' + (c || C.cable) + '" stroke-width="4" stroke-linecap="round"/>';
  const ART = {
    tvPlug: () => '<svg viewBox="0 0 480 250" role="img" aria-label="A TV with DiceOS on HDMI 1, a PlayStation on HDMI 2 and a cable box on HDMI 3">' + defs +
      tvBox(130, 18, 220, 130, die(240, 83, 1.6)) + port(162, 160, 1, C.dice) + port(223, 160, 2, C.ps) + port(284, 160, 3, C.gold) +
      cable('M179 176 C179 210 90 200 70 212', C.dice) + cable('M240 176 C240 205 240 205 240 214', C.ps) + cable('M301 176 C301 210 390 200 410 212', C.gold) +
      '<rect x="36" y="212" width="68" height="24" rx="6" fill="#2a2a33"/>' + die(70, 224, 0.7) + label(70, 248, 'DiceOS', C.dice, 11) +
      '<rect x="206" y="214" width="68" height="20" rx="8" fill="#f4f6fb" stroke="#c9d0e0"/><path d="M222 224h36" stroke="' + C.ps + '" stroke-width="3"/>' + label(240, 248, 'PlayStation', C.ps, 11) +
      '<rect x="376" y="212" width="68" height="24" rx="4" fill="' + C.box + '"/><circle cx="430" cy="224" r="3" fill="#7cf0b0"/>' + label(410, 248, 'Cable box', '#8a5a10', 11) + '</svg>',
    tvMenu: () => '<svg viewBox="0 0 480 230" role="img" aria-label="A TV\'s settings menu with HDMI-CEC switched on">' + defs + tvBox(90, 14, 300, 170,
      '<rect x="120" y="38" width="240" height="122" rx="10" fill="url(#ig-glass)"/>' + label(240, 62, 'Settings, General', '#20243a', 13) +
      '<rect x="134" y="76" width="212" height="30" rx="8" fill="#fff" stroke="' + C.dice + '" stroke-width="2"/><text x="146" y="96" font-family="Atkinson Hyperlegible, system-ui" font-weight="700" font-size="12" fill="#20243a">Anynet+ (HDMI-CEC)</text>' +
      '<rect x="300" y="84" width="34" height="16" rx="8" fill="' + C.on + '"/><circle cx="326" cy="92" r="6" fill="#fff"/>' +
      '<text x="146" y="128" font-family="Atkinson Hyperlegible, system-ui" font-size="11" fill="#5a5f75">LG: SIMPLINK. Sony: BRAVIA Sync.</text><text x="146" y="144" font-family="Atkinson Hyperlegible, system-ui" font-size="11" fill="#5a5f75">TCL, Vizio, Hisense: CEC.</text>') + '</svg>',
    consoles: () => '<svg viewBox="0 0 480 200" role="img" aria-label="A game console and a streaming stick, each with HDMI-CEC turned on">' + defs +
      '<rect x="50" y="40" width="150" height="110" rx="14" fill="url(#ig-glass)" stroke="#d6dbea"/>' + label(125, 70, 'PlayStation 5', C.ps, 13) + label(125, 92, 'Settings, System, HDMI', '#5a5f75', 10) +
      '<rect x="66" y="104" width="118" height="28" rx="8" fill="#fff" stroke="' + C.ps + '" stroke-width="2"/>' + label(110, 122, 'Device Link', '#20243a', 10) + '<rect x="150" y="111" width="26" height="14" rx="7" fill="' + C.on + '"/><circle cx="169" cy="118" r="5" fill="#fff"/>' +
      '<rect x="280" y="40" width="150" height="110" rx="14" fill="url(#ig-glass)" stroke="#d6dbea"/>' + label(355, 70, 'Xbox', '#2f9e44', 13) + label(355, 92, 'TV & display options', '#5a5f75', 10) +
      '<rect x="296" y="104" width="118" height="28" rx="8" fill="#fff" stroke="#2f9e44" stroke-width="2"/>' + label(340, 122, 'HDMI-CEC', '#20243a', 10) + '<rect x="380" y="111" width="26" height="14" rx="7" fill="' + C.on + '"/><circle cx="399" cy="118" r="5" fill="#fff"/>' +
      label(240, 182, 'Fire TV, Roku and Apple TV usually have it on already.', '#5a5f75', 11) + '</svg>',
    monitorPlug: () => '<svg viewBox="0 0 480 250" role="img" aria-label="A computer screen with the DiceOS PC on one input and a laptop on another">' + defs +
      tvBox(120, 14, 240, 140, die(240, 84, 1.6)) + port(150, 166, 1, C.dice) + '<rect x="210" y="166" width="58" height="16" rx="3" fill="#fff" stroke="' + C.violet + '" stroke-width="2"/>' + label(239, 178, 'HDMI 2', C.violet, 9) +
      '<rect x="276" y="166" width="54" height="16" rx="3" fill="#fff" stroke="#2f8f9e" stroke-width="2"/>' + label(303, 178, 'DisplayPort', '#2f8f9e', 8) +
      cable('M167 182 C167 214 90 206 76 214', C.dice) + cable('M239 182 C239 214 360 204 384 212', C.violet) +
      '<rect x="40" y="204" width="72" height="34" rx="5" fill="#2a2a33"/>' + die(76, 221, 0.8) + label(76, 248, 'DiceOS PC', C.dice, 11) +
      '<path d="M354 206h70l10 16h-90z" fill="' + C.laptop + '"/><rect x="360" y="190" width="58" height="18" rx="2" fill="url(#ig-sky)" stroke="' + C.laptop + '" stroke-width="2"/>' + label(390, 248, 'Laptop', C.violet, 11) + '</svg>',
    monitorMenu: () => '<svg viewBox="0 0 480 240" role="img" aria-label="A screen\'s own menu, opened with its buttons, with DDC/CI switched on">' + defs + tvBox(110, 14, 260, 160,
      '<rect x="230" y="34" width="128" height="120" rx="8" fill="#1f2333" opacity=".92"/>' + '<text x="244" y="58" font-family="Atkinson Hyperlegible, system-ui" font-weight="700" font-size="12" fill="#fff">System</text>' +
      '<text x="244" y="84" font-family="Atkinson Hyperlegible, system-ui" font-size="11" fill="#c9cfe0">Language</text><rect x="238" y="94" width="112" height="24" rx="5" fill="#3b4a8a"/><text x="244" y="110" font-family="Atkinson Hyperlegible, system-ui" font-weight="700" font-size="11" fill="#fff">DDC/CI</text>' +
      '<text x="318" y="110" font-family="Atkinson Hyperlegible, system-ui" font-weight="700" font-size="11" fill="#7cf0b0">On</text><text x="244" y="138" font-family="Atkinson Hyperlegible, system-ui" font-size="11" fill="#c9cfe0">Reset</text>') +
      [0, 1, 2, 3, 4].map((i) => '<circle cx="' + (310 + i * 13) + '" cy="196" r="4.5" fill="' + (i === 1 ? C.warm : '#5a5f75') + '"/>').join('') +
      '<path d="M336 222 L 336 206" stroke="' + C.warm + '" stroke-width="2.5" marker-end="none"/>' + label(336, 236, 'its own buttons', C.warm, 11) + '</svg>',
    deskflow: () => '<svg viewBox="0 0 480 220" role="img" aria-label="Two computers side by side; the pointer moves off one screen onto the other, with one keyboard and mouse">' + defs +
      tvBox(40, 20, 180, 110, die(130, 75, 1.3)) + tvBox(262, 20, 180, 110, '<rect x="290" y="40" width="124" height="70" rx="4" fill="#fff" opacity=".7"/>') +
      '<path d="M196 60 C 230 40 250 40 286 60" fill="none" stroke="' + C.violet + '" stroke-width="3" stroke-dasharray="5 5"/><path d="M286 60 l -10 -8 l 2 12 z" fill="' + C.violet + '"/>' +
      '<path d="M300 66 l0 18 l5 -5 l4 8 l3 -1.5 l-4 -8 l7 0 z" fill="#20243a" stroke="#fff" stroke-width="1"/>' +
      '<rect x="120" y="170" width="150" height="34" rx="8" fill="#e9ecf5" stroke="#c9d0e0"/>' + [0, 1, 2, 3, 4, 5, 6, 7].map((i) => '<rect x="' + (128 + i * 17) + '" y="178" width="13" height="8" rx="2" fill="#fff"/>').join('') + '<rect x="150" y="190" width="90" height="8" rx="2" fill="#fff"/>' +
      '<rect x="292" y="168" width="28" height="40" rx="14" fill="#e9ecf5" stroke="#c9d0e0"/><path d="M306 168v14" stroke="#c9d0e0"/>' +
      label(240, 214, 'One keyboard and mouse, on the DiceOS computer', '#5a5f75', 11) + '</svg>',
    together: () => '<svg viewBox="0 0 480 160" role="img" aria-label="Inputs switches the screen; Deskflow moves the keyboard and mouse">' + defs +
      '<rect x="30" y="30" width="190" height="100" rx="18" fill="url(#ig-glass)" stroke="#d6dbea"/>' + label(125, 70, 'Inputs', C.dice, 16) + label(125, 94, 'switches the screen', '#5a5f75', 12) +
      label(240, 88, '+', '#20243a', 26) +
      '<rect x="260" y="30" width="190" height="100" rx="18" fill="url(#ig-glass)" stroke="#d6dbea"/>' + label(355, 70, 'Deskflow', C.violet, 16) + label(355, 94, 'moves the keyboard', '#5a5f75', 12) + '</svg>',
  };

  // ---- the steps ----------------------------------------------------------------------------------------------
  // check: a test DiceOS can run for real; do: a button that does the step
  const PATHS = [
    { id: 'tv', title: 'Things plugged into my TV', blurb: 'A PlayStation, a cable box, a Fire TV: switch the TV to them from DiceOS, and back.', c: '#4b7bec', art: 'tvPlug', steps: [
      { title: 'Plug everything into the TV', art: 'tvPlug', text: ['DiceOS (the Raspberry Pi) goes into one of the TV\'s HDMI ports.', 'Your other things go into the others: the PlayStation in HDMI 2, the cable box in HDMI 3, and so on.', 'Any HDMI cable works. The one each thing came with is fine.'] },
      { title: 'Turn on HDMI-CEC on the TV', art: 'tvMenu', text: ['HDMI-CEC lets things plugged into the TV talk to it. TV makers give it their own name.', 'Samsung: Settings, General, External Device Manager, Anynet+ (HDMI-CEC): On.', 'LG: SIMPLINK. Sony: BRAVIA Sync. TCL, Vizio and Hisense: CEC.'] },
      { title: 'Turn it on in each thing too', art: 'consoles', text: ['PlayStation 5: Settings, System, HDMI, then turn on Enable HDMI Device Link.', 'Xbox: Settings, General, TV & display options, Device control, then HDMI-CEC.', 'Nintendo Switch: System Settings, TV Output, then Match TV Power State.', 'Fire TV, Roku and Apple TV usually have it on already.'] },
      { title: 'Check that DiceOS can see them', check: 'cec', text: ['Turn on your other things, then press Look.', 'Each one that answers shows up by name. Things that don\'t speak HDMI-CEC still show as their HDMI port.'] },
      { title: 'Try it', do: 'open', text: ['Open Inputs: Quick access (Q, or the Blue button on the remote), then Inputs. Or just say "switch to the PlayStation" to Deuce.', 'Pick a tile. The TV changes to it, and the remote\'s buttons go to it too.', 'To come back to DiceOS, press Home on the remote, or say "back to Dice".'] },
      { title: 'Give them names (if you like)', do: 'open', text: ['In Inputs, press X (Info on the remote) on a tile and call it "PlayStation" or "Mom\'s laptop".', 'Deuce knows those names too: "switch to Mom\'s laptop".'] },
    ] },
    { id: 'screen', title: 'My computer screen\'s other inputs', blurb: 'One screen, two computers: switch the screen from DiceOS to your laptop and back.', c: '#8a6bd8', art: 'monitorPlug', steps: [
      { title: 'Plug both computers into the screen', art: 'monitorPlug', text: ['The DiceOS computer goes into one input on the screen (HDMI 1 or DisplayPort).', 'The other computer (a laptop, a console, a school computer) goes into another one.', 'Plug straight into the screen. Some USB-C docks and adapters don\'t pass on what DiceOS says to the screen.'] },
      { title: 'Turn on DDC/CI in the screen\'s own menu', art: 'monitorMenu', text: ['DDC/CI lets a computer tell the screen which input to show. Most screens have it on already.', 'Use the buttons on the screen itself (under the bottom edge, or on the back) to open its menu.', 'Look under System, Setup or Others for DDC/CI, and set it to On.'] },
      { title: 'Check that DiceOS can talk to the screen', check: 'ddc', text: ['Press Look. DiceOS asks the screen which inputs it has.', 'A laptop\'s own built-in screen can\'t do this, only a separate one.'] },
      { title: 'Try it', do: 'open', text: ['Open Inputs: Quick access (Q), then Inputs, or the Dice Bar (Ctrl + Space) and type "inputs". Or say "switch to HDMI 2" to Deuce.', 'Pick the other input. The screen changes to the other computer.', 'Coming back: the keyboard is still plugged into the DiceOS computer, so press Esc (or Home) and the screen switches back. If it doesn\'t, press the screen\'s own input button once.'] },
      { title: 'Give them names (if you like)', do: 'open', text: ['In Inputs, press X on a tile (or right-click it) and call it "Work laptop".', 'Then: "Deuce, switch to the work laptop".'] },
    ] },
    { id: 'keys', title: 'One keyboard and mouse for two computers', blurb: 'Move the pointer off the edge of one screen and it carries on on the other computer.', c: '#2f9e6e', art: 'deskflow', steps: [
      { title: 'What this does', art: 'deskflow', text: ['Deskflow shares DiceOS\'s keyboard and mouse with another computer over your network. No cables between them.', 'Both computers need to be on the same Wi-Fi or network.', 'With Inputs switching the screen too, that\'s a whole KVM switch.'] },
      { title: 'Get Deskflow on DiceOS', check: 'deskflow', text: ['Press Get Deskflow. It comes from Flathub and takes a minute or two.', 'It shows up in Your apps when it\'s ready.'] },
      { title: 'Get Deskflow on the other computer', text: ['On the other computer, go to deskflow.org, download it, and install it.', 'It works on Windows, Macs and Linux. A school or work computer may need whoever looks after it to install it.'] },
      { title: 'On DiceOS: share this keyboard and mouse', do: 'deskflow', text: ['Open Deskflow on DiceOS and pick "Use this computer\'s keyboard and mouse" (it\'s called the server).', 'Press Configure Server, and drag a new screen next to DiceOS\'s: to the left or right, where the other computer is on your desk.', 'Give that screen the other computer\'s name, exactly as it shows on the other computer, then Start.'] },
      { title: 'On the other computer: connect', check: 'address', text: ['Open Deskflow there and pick "Use another computer\'s keyboard and mouse" (the client).', 'Type DiceOS\'s address (shown below), then Connect or Start.', 'A Mac asks to allow Deskflow to control it (Privacy & Security, Accessibility): say yes.'] },
      { title: 'Try it', art: 'together', text: ['Move the pointer off the edge of DiceOS\'s screen, toward the other computer. It carries on over there, and so does the keyboard.', 'Nothing happens? Check the names match, both are on the same network, and the other computer let Deskflow in.'] },
    ] },
  ];
  const G = window.DiceInputsGuide = { PATHS, ART, art: (n) => (ART[n] ? ART[n]() : '') };

  // ---- inside Dice: the guide over the screen ------------------------------------------------------------------
  const D = window.Dice;
  if (!D || !D.h) return;
  const h = D.h;
  let el = null, path = null, at = 0;
  function build() {
    el = h('<div id="in-guide" class="ig" role="dialog" aria-label="Set up Inputs, step by step"><div class="ig-box glass"><button class="ig-x" data-nav data-key="ig:x" aria-label="Close">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg></button><div class="ig-in"></div></div></div>');
    document.body.appendChild(el);
    el.querySelector('.ig-x').onclick = () => G.close();
    el.addEventListener('pointerdown', (e) => { if (e.target === el) G.close(); });
  }
  G.open = function (which) {
    if (!el) build();
    if (D.inputs && D.inputs.isOpen()) D.inputs.close(true);
    el.classList.add('on', 'navtrap');
    G.prev = D.nav.el;
    path = which ? PATHS.find((p) => p.id === which) : null; at = 0;
    paint();
    D.S.play('open');
  };
  G.close = function () { if (!el || !el.classList.contains('on')) return; el.classList.remove('on', 'navtrap'); D.S.play('close'); if (G.prev && G.prev.isConnected) D.nav.focus(G.prev, { scroll: false }); };
  G.isOpen = () => !!(el && el.classList.contains('on'));
  function paint() {
    const box = el.querySelector('.ig-in');
    if (!path) {
      box.innerHTML = '<h2>Set up Inputs, step by step</h2><p class="ig-lead">DiceOS can switch your TV or screen to the other things plugged into it, and back, like a KVM switch. What do you want to do?</p><div class="ig-paths"></div>';
      const list = box.querySelector('.ig-paths');
      PATHS.forEach((p, i) => {
        const b = h('<button class="ig-path" data-nav data-key="ig:p' + i + '" style="--c:' + p.c + '"><span class="ig-art">' + G.art(p.art) + '</span><b>' + D.esc(p.title) + '</b><span>' + D.esc(p.blurb) + '</span></button>');
        b.onclick = () => { path = p; at = 0; paint(); };
        list.appendChild(b);
      });
      D.nav.focus(list.querySelector('[data-nav]'));
      return;
    }
    const st = path.steps[at];
    box.innerHTML = '<div class="ig-top" style="--c:' + path.c + '"><button class="ig-crumb" data-nav data-key="ig:all">All guides</button><span>' + D.esc(path.title) + '</span></div>' +
      '<ol class="ig-dots" aria-label="Steps">' + path.steps.map((s, i) => '<li class="' + (i < at ? 'done' : i === at ? 'here' : '') + '" style="--c:' + path.c + '"><span>' + (i + 1) + '</span></li>').join('') + '</ol>' +
      '<div class="ig-step"><div class="ig-words"><p class="ig-n" style="--c:' + path.c + '">Step ' + (at + 1) + ' of ' + path.steps.length + '</p><h2></h2><ul>' + st.text.map((t) => '<li>' + D.esc(t) + '</li>').join('') + '</ul><div class="ig-check"></div></div>' +
      '<div class="ig-pic">' + G.art(st.art || path.art) + '</div></div>' +
      '<div class="ig-nav"><button class="b" data-nav data-key="ig:back">' + (at ? 'Back' : 'All guides') + '</button><button class="b go" data-nav data-key="ig:next" style="--c:' + path.c + '">' + (at === path.steps.length - 1 ? 'Done' : 'Next') + '</button></div>';
    box.querySelector('h2').textContent = st.title;
    box.querySelector('[data-key="ig:all"]').onclick = () => { path = null; paint(); };
    box.querySelector('[data-key="ig:back"]').onclick = () => { if (at) at--; else path = null; paint(); };
    box.querySelector('[data-key="ig:next"]').onclick = () => { if (at < path.steps.length - 1) { at++; paint(); } else G.close(); };
    const ck = box.querySelector('.ig-check');
    if (st.check || st.do) checkRow(ck, st);
    D.nav.focus(box.querySelector('[data-key="ig:next"]'));
  }
  // the buttons that try each step for real
  function checkRow(box, st) {
    const say = (ok, html) => { let r = box.querySelector('.ig-result'); if (!r) { r = h('<div class="ig-result"></div>'); box.appendChild(r); } r.className = 'ig-result ' + (ok === true ? 'ok' : ok === false ? 'no' : ''); r.innerHTML = html; };
    const btn = (label, run) => { const b = h('<button class="b small" data-nav data-key="ig:do">' + D.esc(label) + '</button>'); b.onclick = run; box.appendChild(b); return b; };
    if (!D.sys) { say(null, 'On DiceOS, a button here checks this step for you.'); return; }
    if (st.check === 'cec' || st.check === 'ddc') {
      btn('Look', async () => {
        say(null, 'Asking…');
        const L = D.inputs && await D.inputs.list('fresh');
        if (!L) return say(false, 'Inputs isn\'t on this computer.');
        if (st.check === 'cec') {
          if (!L.cec.ok) return say(false, D.esc(L.cec.error || 'The TV isn\'t answering.') + ' Check HDMI-CEC is on in the TV\'s settings, then try again.');
          const n = L.cec.devices.length;
          return say(n > 0, n ? 'Found ' + n + ': ' + L.cec.devices.map((d) => D.esc(d.name || 'a device')).join(', ') + '. Next.' : 'The TV answered, but nothing else did yet. Turn the other things on, check step 3, then Look again.');
        }
        if (!L.screens.length) return say(false, D.esc(L.monError || 'No screen answered.') + ' Turn on DDC/CI (step 2), plug straight into the screen, and look again. On DiceOS before 2.2, run sudo dice-update first.');
        return say(true, L.screens.map((s) => D.esc(s.name) + ': ' + s.inputs.map((x) => D.esc(x.name) + (x.here ? ' (DiceOS)' : '')).join(', ')).join('<br>') + '. Next.');
      });
    }
    if (st.do === 'open') btn('Open Inputs', () => { G.close(); if (D.inputs) D.inputs.open(); });
    if (st.check === 'deskflow' || st.do === 'deskflow') {
      const has = () => D.myApps && D.myApps.list().some((a) => a.id === 'fp:org.deskflow.deskflow');
      if (has()) { say(true, 'Deskflow is on this computer.'); btn('Open Deskflow', () => { G.close(); D.sys.post('/api/apps', { action: 'launch', id: 'org.deskflow.deskflow' }); }); }
      else btn('Get Deskflow', async () => { say(null, 'Getting it…'); const j = await D.sys.post('/api/apps', { action: 'install', id: 'org.deskflow.deskflow' }); say(j && j.ok !== false ? true : false, j && j.ok !== false ? 'On its way. It\'s in Your apps in a minute or two.' : D.esc((j && j.error) || 'Couldn\'t get it.')); });
    }
    if (st.check === 'address') {
      const s = D.sys.status || {};
      say(null, 'DiceOS\'s address: <b class="ig-addr">' + D.esc(s.ip || 'unknown') + '</b>' + (s.host ? ' (or <b class="ig-addr">' + D.esc(s.host) + '.local</b>)' : ''));
    }
  }
  // Esc and Back close it
  const fire0 = D.input.fire;
  D.input.fire = function (a, src) {
    if (G.isOpen() && !D.$('#dialog.open') && (a === 'b' || a === 'home')) { if (path && a === 'b') { if (at) at--; else path = null; paint(); } else G.close(); return; }
    return fire0.call(D.input, a, src);
  };
  if (D.inputs) D.inputs.guide = G.open;
})();
