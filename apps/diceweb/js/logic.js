// DiceWeb's plain logic: nothing in here touches the screen, so Node can test it.
// In the browser it becomes window.DiceLogic; in Node, require('./js/logic.js').
(function (root) {
  'use strict';

  // ---- Day and night -------------------------------------------------------
  // True between sunset and sunrise, worked out from the date (the same sum the
  // website uses, for a place about as far north as New Jersey).
  function clockNight(d) {
    d = d || new Date();
    const y = d.getFullYear(), n = Math.floor((d - new Date(y, 0, 0)) / 864e5);
    const e = 23.44 * Math.sin(2 * Math.PI * (284 + n) / 365) * Math.PI / 180;
    const x = -Math.tan(0.698) * Math.tan(e);
    const h = Math.acos(Math.max(-1, Math.min(1, x))) * 12 / Math.PI;
    const s = d.getTimezoneOffset() < Math.max(new Date(y, 0, 1).getTimezoneOffset(), new Date(y, 6, 1).getTimezoneOffset()) ? 1 : 0;
    const t = d.getHours() + d.getMinutes() / 60;
    return t < 12 + s - h || t >= 12 + s + h;
  }

  // ---- Moving around with arrows or a controller ----------------------------
  // `from` and each candidate's `r` are boxes {x, y, w, h}. Picks the nearest
  // one in that direction, preferring ones lined up with where you are.
  function pickNext(from, cands, dir) {
    const cx = from.x + from.w / 2, cy = from.y + from.h / 2;
    let best = null, bestScore = Infinity;
    for (const c of cands) {
      const r = c.r;
      if (r.w === 0 && r.h === 0) continue;
      let main, side;
      if (dir === 'right' || dir === 'left') {
        main = dir === 'right' ? r.x - (from.x + from.w) : from.x - (r.x + r.w);
        if (main < -Math.min(from.w, r.w) * 0.5) continue;
        const ccx = r.x + r.w / 2;
        if (dir === 'right' ? ccx <= cx + 1 : ccx >= cx - 1) continue;
        side = Math.max(0, Math.max(r.y, from.y) - Math.min(r.y + r.h, from.y + from.h));
        if (side === 0) side = -Math.min(r.y + r.h, from.y + from.h) + Math.max(r.y, from.y); // overlap counts in its favour
      } else {
        main = dir === 'down' ? r.y - (from.y + from.h) : from.y - (r.y + r.h);
        if (main < -Math.min(from.h, r.h) * 0.5) continue;
        const ccy = r.y + r.h / 2;
        if (dir === 'down' ? ccy <= cy + 1 : ccy >= cy - 1) continue;
        side = Math.max(0, Math.max(r.x, from.x) - Math.min(r.x + r.w, from.x + from.w));
        if (side === 0) side = -0.25 * (Math.min(r.x + r.w, from.x + from.w) - Math.max(r.x, from.x));
        side += Math.abs((r.x + r.w / 2) - cx) * 0.15; // in a grid, stay in the same column
      }
      const score = Math.max(0, main) + side * 2;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  // ---- A pretend disk, kept in the browser -----------------------------------
  function newDisk(name) {
    const now = Date.now();
    const f = (text) => ({ type: 'file', text, t: now });
    return { type: 'dir', kids: {
      home: { type: 'dir', kids: {
        [name || 'player']: { type: 'dir', kids: {
          'readme.txt': f('Welcome to DiceWeb.\n\nThis is a pretend disk that lives in your browser.\nType "help" to see what you can do here.\nNotes you write in the Notes app are saved in the notes folder.'),
          notes: { type: 'dir', kids: { 'first note.txt': f('Things to try:\n- Put a song on in Music\n- Type neofetch in Terminal\n- Plug in a controller\n- Try DiceTV and Dice Home from the app grid') } },
          music: { type: 'dir', kids: {} },
        } },
      } },
      apps: { type: 'dir', kids: {} },
    } };
  }
  function splitPath(p) { return p.split('/').filter(Boolean); }
  function resolve(cwd, p, home) {
    if (!p) return cwd;
    if (p === '~') return home;
    if (p.startsWith('~/')) p = home + p.slice(1);
    const parts = p.startsWith('/') ? [] : splitPath(cwd);
    for (const bit of splitPath(p)) {
      if (bit === '.') continue;
      if (bit === '..') parts.pop(); else parts.push(bit);
    }
    return '/' + parts.join('/');
  }
  function walk(disk, path) {
    let node = disk;
    for (const bit of splitPath(path)) {
      if (!node || node.type !== 'dir') return null;
      node = node.kids[bit];
    }
    return node || null;
  }
  function parentOf(disk, path) {
    const parts = splitPath(path);
    const name = parts.pop();
    return { dir: walk(disk, '/' + parts.join('/')), name };
  }
  function writeFile(disk, path, text, append) {
    const { dir, name } = parentOf(disk, path);
    if (!dir || dir.type !== 'dir' || !name) return 'No such folder';
    const old = dir.kids[name];
    if (old && old.type === 'dir') return name + ' is a folder';
    dir.kids[name] = { type: 'file', text: (append && old ? old.text + '\n' : '') + text, t: Date.now() };
    return null;
  }
  function makeDir(disk, path) {
    const { dir, name } = parentOf(disk, path);
    if (!dir || dir.type !== 'dir' || !name) return 'No such folder';
    if (dir.kids[name]) return name + ' is already there';
    dir.kids[name] = { type: 'dir', kids: {} };
    return null;
  }
  function remove(disk, path, recursive) {
    const { dir, name } = parentOf(disk, path);
    if (!dir || !dir.kids[name]) return 'Nothing called ' + (name || path);
    if (dir.kids[name].type === 'dir' && Object.keys(dir.kids[name].kids).length && !recursive) return name + ' is a folder with things in it (use rm -r to remove it all)';
    delete dir.kids[name];
    return null;
  }

  // ---- Terminal ---------------------------------------------------------------
  const FORTUNES = [
    'roll 2d6 rolls two dice. roll d20 rolls one with twenty sides.',
    'Press Q for Quick access, M for the menu, / to search.',
    'Plug in a controller: every screen works with it.',
    'Switch to Desktop from the Power menu for windows you can drag around.',
    'The look follows the sun: light by day, dark after sunset.',
    'On Dice, the Files app shows the real files on the computer.',
    'Ctrl+1 opens the menu and Ctrl+2 Quick access.',
    'Notes are files too: try "ls ~/notes".',
  ];
  const HELP = [
    'Things you can type:',
    '  ls [folder]        what\'s in a folder',
    '  cd <folder>        go into a folder (cd .. goes back out)',
    '  cat <file>         show a file',
    '  echo hi > f.txt    write a file (>> adds to the end)',
    '  mkdir, touch, rm   make a folder, make a file, remove one',
    '  roll [2d6]         roll some dice',
    '  apps               every app in DiceWeb',
    '  open <app>         open one, like "open music"',
    '  say <friend> hi    a friend says something',
    '  look day|night|auto',
    '  neofetch, date, whoami, uptime, history, fortune, clear, exit',
  ];
  function parseDice(arg, rand) {
    const m = /^(\d{0,2})d(\d{1,3})$/i.exec(arg || 'd6');
    if (!m) return null;
    const n = Math.max(1, Math.min(20, +(m[1] || 1))), sides = Math.max(2, Math.min(100, +m[2]));
    const rolls = [];
    for (let i = 0; i < n; i++) rolls.push(1 + Math.floor(rand() * sides));
    return { n, sides, rolls, total: rolls.reduce((a, b) => a + b, 0) };
  }
  function tokens(line) {
    const out = []; let cur = '', q = null, had = false;
    for (const ch of line) {
      if (q) { if (ch === q) q = null; else cur += ch; continue; }
      if (ch === '"' || ch === "'") { q = ch; had = true; continue; }
      if (/\s/.test(ch)) { if (cur || had) out.push(cur); cur = ''; had = false; continue; }
      cur += ch;
    }
    if (cur || had) out.push(cur);
    return out;
  }
  // env: {disk, cwd, user, apps:[{id,name,kind}], friends:{id:name}, rand, now, started, history, look, screen, version}
  // Returns {out:[lines], cwd, clear, open, look, exit, changed}
  function run(line, env) {
    const res = { out: [], cwd: env.cwd, changed: false };
    const home = '/home/' + env.user;
    line = line.trim();
    if (!line) return res;
    // "echo x > file" and "echo x >> file"
    let redirect = null;
    const rm = /^(.*?)\s*(>>?)\s*([^>]+)$/.exec(line);
    if (rm && /^echo\b/.test(line)) { line = rm[1]; redirect = { append: rm[2] === '>>', path: rm[3].trim() }; }
    const [cmd, ...args] = tokens(line);
    const say = (s) => res.out.push(s);
    const at = (p) => resolve(env.cwd, p, home);
    switch (cmd.toLowerCase()) {
      case 'help': case '?': HELP.forEach(say); break;
      case 'clear': case 'cls': res.clear = true; break;
      case 'exit': case 'quit': res.exit = true; break;
      case 'pwd': say(env.cwd); break;
      case 'whoami': say(env.user); break;
      case 'date': say(new Date(env.now).toString().replace(/ GMT.*/, '')); break;
      case 'uptime': { const m = Math.max(0, Math.round((env.now - env.started) / 60000)); say('up ' + (m < 1 ? 'less than a minute' : m + (m === 1 ? ' minute' : ' minutes'))); break; }
      case 'fortune': say(FORTUNES[Math.floor(env.rand() * FORTUNES.length)]); break;
      case 'history': (env.history || []).forEach((h, i) => say(String(i + 1).padStart(4) + '  ' + h)); break;
      case 'echo': {
        const text = args.join(' ');
        if (redirect) { const err = writeFile(env.disk, at(redirect.path), text, redirect.append); if (err) say('echo: ' + err); else res.changed = true; }
        else say(text);
        break;
      }
      case 'ls': case 'dir': {
        const p = at(args.filter((a) => !a.startsWith('-'))[0] || '.');
        const node = walk(env.disk, p);
        if (!node) { say('ls: nothing called ' + (args[0] || p)); break; }
        if (node.type === 'file') { say(p.split('/').pop()); break; }
        const names = Object.keys(node.kids).sort();
        if (!names.length) { say('(empty)'); break; }
        say({ s: names.map((n) => [node.kids[n].type === 'dir' ? n + '/  ' : n + '  ', node.kids[n].type === 'dir' ? 'dir' : 'file']) });
        break;
      }
      case 'cd': {
        const p = at(args[0] || '~');
        const node = walk(env.disk, p);
        if (!node) say('cd: nothing called ' + args[0]);
        else if (node.type !== 'dir') say('cd: ' + args[0] + ' is a file, not a folder');
        else res.cwd = p;
        break;
      }
      case 'cat': case 'type': case 'open-file': {
        if (!args.length) { say('cat: which file? Like: cat readme.txt'); break; }
        for (const a of args) {
          const node = walk(env.disk, at(a));
          if (!node) say('cat: nothing called ' + a);
          else if (node.type === 'dir') say('cat: ' + a + ' is a folder (try ls ' + a + ')');
          else node.text.split('\n').forEach(say);
        }
        break;
      }
      case 'mkdir': { if (!args.length) { say('mkdir: what should the folder be called?'); break; } for (const a of args) { const e = makeDir(env.disk, at(a)); if (e) say('mkdir: ' + e); else res.changed = true; } break; }
      case 'touch': { if (!args.length) { say('touch: what should the file be called?'); break; } for (const a of args) { if (!walk(env.disk, at(a))) { const e = writeFile(env.disk, at(a), ''); if (e) say('touch: ' + e); else res.changed = true; } } break; }
      case 'rm': case 'del': {
        const r = args.some((a) => /^-\w*r/.test(a));
        const names = args.filter((a) => !a.startsWith('-'));
        if (!names.length) { say('rm: what should go?'); break; }
        for (const a of names) {
          const p = at(a);
          if (p === '/' || p === home || p === '/home') { say('rm: DiceWeb won\'t remove ' + p + '. It holds everything else.'); continue; }
          const e = remove(env.disk, p, r); if (e) say('rm: ' + e); else res.changed = true;
        }
        break;
      }
      case 'roll': {
        const d = parseDice(args[0], env.rand);
        if (!d) { say('roll: try "roll", "roll 2d6" or "roll d20"'); break; }
        say({ s: [['🎲 ' + d.rolls.join(' + ') + (d.n > 1 ? ' = ' : ''), 'out'], [d.n > 1 ? String(d.total) : '', 'hi']] });
        res.rolled = d;
        break;
      }
      case 'apps': case 'ls-apps': {
        for (const a of env.apps) say({ s: [[a.id.padEnd(9), 'hi'], [a.name + (a.kind === 'suite' ? '  (for your computer)' : ''), 'out']] });
        break;
      }
      case 'open': case 'start': case 'play': {
        const want = (args.join(' ') || '').toLowerCase();
        const app = env.apps.find((a) => a.id === want || a.name.toLowerCase() === want) || env.apps.find((a) => want && a.name.toLowerCase().startsWith(want));
        if (!app) { say(want ? 'open: no app called ' + want + ' (type "apps" to see them all)' : 'open: which app? Like: open music'); break; }
        say('Opening ' + app.name + '…'); res.open = app.id;
        break;
      }
      case 'say': case 'cowsay': {
        const who = (args[0] || '').toLowerCase();
        const id = Object.keys(env.friends).find((k) => k === who || env.friends[k].toLowerCase() === who);
        const words = (id ? args.slice(1) : args).join(' ') || 'Hello!';
        const name = id ? env.friends[id] : 'Cubby';
        const w = Math.min(44, Math.max(words.length, 4));
        const lines = [];
        for (let i = 0; i < words.length; i += w) lines.push(words.slice(i, i + w));
        say(' ' + '_'.repeat(w + 2));
        lines.forEach((l) => say('( ' + l.padEnd(w) + ' )'));
        say(' ' + '‾'.repeat(w + 2));
        say({ s: [['    \\  ', 'out'], [name, 'hi']] });
        res.say = id || 'cubby';
        break;
      }
      case 'look': case 'theme': {
        const v = (args[0] || '').toLowerCase();
        if (!['day', 'night', 'auto'].includes(v)) { say('look: it\'s ' + env.look + ' now. Try: look day, look night, look auto'); break; }
        res.look = v; say(v === 'auto' ? 'The look follows the clock again.' : 'Switched to ' + v + '.');
        break;
      }
      case 'neofetch': case 'fetch': case 'about': {
        const info = [
          [env.user + '@diceweb', 'hi'], ['-'.repeat(env.user.length + 8), 'dim'],
          ['OS: DiceWeb ' + env.version, 'out'], ['Shell: dicesh', 'out'],
          ['Uptime: ' + Math.max(1, Math.round((env.now - env.started) / 60000)) + ' min', 'out'],
          ['Apps: ' + env.apps.filter((a) => a.kind !== 'suite').length + ' built in, ' + env.apps.filter((a) => a.kind === 'suite').length + ' for your computer', 'out'],
          ['Look: ' + env.look, 'out'], ['Screen: ' + env.screen, 'out'],
        ];
        const art = [
          // the Dice die: black, with white dots
          [['           ', 'die']],
          [['  ●     ●  ', 'die']],
          [['     ●     ', 'die']],
          [['  ●     ●  ', 'die']],
          [['           ', 'die']],
          [['', '']], [['', '']], [['', '']],
        ];
        for (let i = 0; i < info.length; i++) {
          const left = art[i] || [['', '']];
          const pad = 13 - left.reduce((n, s) => n + s[0].length, 0);
          say({ s: left.concat([[' '.repeat(Math.max(1, pad)), ''], info[i]]) });
        }
        say({ s: [[' '.repeat(13), ''], ['███', 'p1'], ['███', 'p2'], ['███', 'p3'], ['███', 'p4'], ['███', 'p5'], ['███', 'p6']] });
        break;
      }
      case 'sudo': say('DiceWeb has no administrator. It\'s just you, so you can already do everything here.'); break;
      case 'hi': case 'hello': case 'hey': say('Hi, ' + env.user + '! Type "help" to see what this Terminal can do.'); break;
      case 'notes': { const n = walk(env.disk, home + '/notes'); say(n && Object.keys(n.kids).length ? Object.keys(n.kids).join('\n') : 'No notes yet. Open Notes to write one.'); break; }
      case 'curl': case 'wget': case 'npm': case 'node': case 'python': case 'python3': case 'pip': case 'git': case 'brew': case 'ssh':
        say(cmd + ': this Terminal lives in your browser, so it can\'t run real programs.');
        say('To get the real apps on your computer, open Store (type "open store").');
        break;
      default:
        say(cmd + ': not a command here. Type "help" to see what is.');
    }
    return res;
  }

  // ---- Search -------------------------------------------------------------------
  function score(q, item) {
    q = q.trim().toLowerCase();
    if (!q) return 0;
    const name = item.name.toLowerCase(), words = (item.words || '').toLowerCase();
    if (name === q) return 100;
    if (name.startsWith(q)) return 80;
    if (name.split(/\s+/).some((w) => w.startsWith(q))) return 60;
    if (name.includes(q)) return 45;
    const qs = q.split(/\s+/);
    const hits = qs.filter((w) => words.split(/\s+/).some((x) => x.startsWith(w))).length;
    return hits ? 20 + 10 * hits / qs.length : 0;
  }

  // ---- Calculator: reads the sum itself (no eval), with × ÷ − and % ----------------------
  function calc(src) {
    if (/[^0-9.\s+\-*/%()×÷−–,eE]/.test(String(src))) throw new Error('not a sum');
    const toks = String(src).replace(/×/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/,/g, '').match(/\d*\.?\d+(?:e[+-]?\d+)?|[-+*/%()]/gi) || [];
    if (!toks.length) throw new Error('empty');
    let i = 0;
    const peek = () => toks[i], next = () => toks[i++];
    function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const op = next(), r = term(); v = op === '+' ? v + r : v - r; } return v; }
    function term() { let v = factor(); while (peek() === '*' || peek() === '/') { const op = next(), r = factor(); v = op === '*' ? v * r : v / r; } return v; }
    function factor() {
      if (peek() === '-') { next(); return -factor(); }
      if (peek() === '+') { next(); return factor(); }
      let v;
      if (peek() === '(') { next(); v = expr(); if (peek() === ')') next(); } else { const t = next(); if (t === undefined || isNaN(+t)) throw new Error('bad'); v = +t; }
      while (peek() === '%') { next(); v /= 100; }
      return v;
    }
    const v = expr();
    if (i < toks.length) throw new Error('bad');
    return v;
  }
  function calcText(v) {
    if (!isFinite(v)) return 'Can\'t divide by zero';
    if (v !== 0 && (Math.abs(v) >= 1e15 || Math.abs(v) < 1e-9)) return v.toExponential(6).replace(/\.?0+e/, 'e');
    const s = String(+v.toPrecision(12));
    const [a, b] = s.split('.');
    return a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (b ? '.' + b : '');
  }

  // ---- Calendar: the 6 weeks shown for a month, Sunday first --------------------------
  function monthGrid(year, month) {
    const first = new Date(year, month, 1), start = new Date(year, month, 1 - first.getDay());
    const out = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      out.push({ y: d.getFullYear(), m: d.getMonth(), d: d.getDate(), inMonth: d.getMonth() === month, key: dayKey(d) });
    }
    return out;
  }
  function dayKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // ---- SereneTab: the sun and moon over a city ---------------------------------------
  // Good to about a degree, which is plenty for painting a sky.
  const RAD = Math.PI / 180;
  const days = (d) => d.getTime() / 864e5 - 10957.5; // days since noon, 1 Jan 2000 (UTC)
  function toSky(ra, dec, n, lat, lon) {
    const gmst = (280.46061837 + 360.98564736629 * n) % 360;
    const ha = (gmst + lon) * RAD - ra, la = lat * RAD;
    const alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha));
    const az = Math.atan2(-Math.sin(ha) * Math.cos(dec), Math.cos(la) * Math.sin(dec) - Math.sin(la) * Math.cos(dec) * Math.cos(ha));
    return { alt: alt / RAD, az: (az / RAD + 360) % 360 };
  }
  function sunLon(n) {
    const L = 280.46 + 0.9856474 * n, g = (357.528 + 0.9856003 * n) * RAD;
    return (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  }
  // where the sun is: alt (degrees above the horizon) and az (compass degrees, 90 = east)
  function sunPos(d, lat, lon) {
    const n = days(d), lam = sunLon(n), eps = 23.439 * RAD;
    return toSky(Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)), Math.asin(Math.sin(eps) * Math.sin(lam)), n, lat, lon);
  }
  // the moon: where it is, how much of it is lit (0 new, 1 full) and whether it's growing
  function moonPos(d, lat, lon) {
    const n = days(d), eps = 23.439 * RAD;
    const Mp = (134.963 + 13.064993 * n) * RAD, F = (93.272 + 13.22935 * n) * RAD;
    const lam = (218.316 + 13.176396 * n) * RAD + 6.289 * RAD * Math.sin(Mp), bet = 5.128 * RAD * Math.sin(F);
    const ra = Math.atan2(Math.sin(lam) * Math.cos(eps) - Math.tan(bet) * Math.sin(eps), Math.cos(lam));
    const dec = Math.asin(Math.sin(bet) * Math.cos(eps) + Math.cos(bet) * Math.sin(eps) * Math.sin(lam));
    const el = lam - sunLon(n);
    return Object.assign(toSky(ra, dec, n, lat, lon), { lit: (1 - Math.cos(el)) / 2, waxing: Math.sin(el) > 0 });
  }
  // the time on a city's clocks, like "8:42 pm"
  function cityTime(d, tz) {
    try { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }).toLowerCase(); } catch (e) { return ''; }
  }

  // ---- SereneTab: what you typed in the address bar ------------------------------------
  const ENGINES = {
    ddg: { name: 'DuckDuckGo', mark: 'D', c: '#de5833', url: 'https://duckduckgo.com/?q=' },
    google: { name: 'Google', mark: 'G', c: '#4285f4', url: 'https://www.google.com/search?q=' },
    bing: { name: 'Bing', mark: 'B', c: '#1aa39a', url: 'https://www.bing.com/search?q=' },
    brave: { name: 'Brave Search', mark: 'Br', c: '#e2552b', url: 'https://search.brave.com/search?q=' },
    wiki: { name: 'Wikipedia', mark: 'W', c: '#6b7280', url: 'https://en.wikipedia.org/w/index.php?search=' },
  };
  // a web address if it looks like one (example.com, localhost:8123, 192.168.1.4), else a search
  function omni(text, engine) {
    const v = String(text || '').trim();
    if (!v) return null;
    if (/^https?:\/\/\S+$/i.test(v)) return { url: v, search: false };
    if (/^[a-z][\w+.-]*:/i.test(v) && !/^(localhost|[\w-]+(\.[\w-]+)+):\d/i.test(v)) return { url: (ENGINES[engine] || ENGINES.ddg).url + encodeURIComponent(v), search: true }; // other schemes: just search for them
    const local = /^(localhost|\d{1,3}(\.\d{1,3}){3}|[\w-]+\.local)(:\d+)?(\/\S*)?$/i.test(v);
    if (local) return { url: 'http://' + v, search: false };
    if (!/\s/.test(v) && /^[\w-]+(\.[\w-]+)*\.[a-z]{2,}(:\d+)?([/?#]\S*)?$/i.test(v)) return { url: 'https://' + v, search: false };
    return { url: (ENGINES[engine] || ENGINES.ddg).url + encodeURIComponent(v), search: true };
  }
  // Big sites that refuse to be shown inside another page: these open in their own window
  const OWN_WINDOW = ['google.com', 'youtube.com', 'duckduckgo.com', 'bing.com', 'brave.com', 'github.com', 'gitlab.com', 'x.com', 'twitter.com', 'facebook.com', 'instagram.com',
    'reddit.com', 'amazon.com', 'netflix.com', 'linkedin.com', 'microsoft.com', 'live.com', 'office.com', 'apple.com', 'icloud.com', 'stackoverflow.com', 'discord.com', 'twitch.tv',
    'spotify.com', 'chatgpt.com', 'openai.com', 'claude.ai', 'anthropic.com', 'tiktok.com', 'pinterest.com', 'khanacademy.org', 'quizlet.com', 'instructure.com', 'schoology.com', 'zoom.us', 'paypal.com'];
  const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch (e) { return ''; } };
  // how to show an address: 'frame' (inside SereneTab) or 'window' (its own window), and the address to use
  function howToShow(url, here) {
    let u;
    try { u = new URL(url); } catch (e) { return { how: 'window', url }; }
    if (!/^https?:$/.test(u.protocol)) return { how: 'window', url };
    const h = u.hostname.toLowerCase();
    // YouTube videos play in YouTube's own player, which is made to sit inside other pages
    const yt = /(^|\.)youtube\.com$/.test(h) ? (u.pathname === '/watch' ? u.searchParams.get('v') : (u.pathname.match(/^\/(shorts|embed|live)\/([\w-]{6,})/) || [])[2]) : h === 'youtu.be' ? u.pathname.slice(1) : null;
    if (yt && /^[\w-]{6,20}$/.test(yt)) return { how: 'frame', url: 'https://www.youtube-nocookie.com/embed/' + yt, video: true };
    let base = null;
    try { base = here ? new URL(here) : null; } catch (e) { base = null; }
    if (base && base.origin === u.origin) return { how: 'frame', url: u.href };
    if (base && base.protocol === 'https:' && u.protocol === 'http:') return { how: 'window', url: u.href }; // a secure page can't show an insecure one
    if (OWN_WINDOW.some((d) => h === d || h.endsWith('.' + d))) return { how: 'window', url: u.href };
    return { how: 'frame', url: u.href };
  }
  // ---- SereneTab: history and suggestions -------------------------------------------
  // the newest visit goes first; the same address only once; at most `max` kept
  function remember(list, entry, max) {
    const out = [entry].concat((list || []).filter((x) => x.url !== entry.url));
    return out.slice(0, max || 300);
  }
  // what to offer while you type: where it would go first, then shortcuts and pages you've been to
  function suggest(text, shortcuts, history, engine) {
    const v = String(text || '').trim();
    if (!v) return [];
    const first = omni(v, engine), e = ENGINES[engine] || ENGINES.ddg, low = v.toLowerCase();
    const out = [first.search ? { kind: 'search', url: first.url, title: 'Search ' + e.name + ' for \u201c' + v + '\u201d' } : { kind: 'go', url: first.url, title: first.url }];
    const seen = new Set([first.url]);
    const hit = (s) => String(s || '').toLowerCase().includes(low);
    const add = (kind, x) => { if (out.length >= 7 || seen.has(x.url)) return; seen.add(x.url); out.push({ kind, url: x.url, title: x.title || x.name || x.url }); };
    (shortcuts || []).forEach((s) => { if (hit(s.name) || hit(s.url)) add('shortcut', s); });
    (history || []).forEach((x) => { if (!x.search && (hit(x.title) || hit(x.url))) add('history', x); });
    (history || []).forEach((x) => { if (x.search && hit(x.title)) add('history', x); });
    return out;
  }

  // ---- SereneTab: weather codes (WMO, as Open-Meteo sends them) in words ----------------
  function weatherWords(code) {
    const c = +code;
    if (c === 0) return { text: 'Clear', kind: 'clear' };
    if (c === 1) return { text: 'Mostly clear', kind: 'clear' };
    if (c === 2) return { text: 'Partly cloudy', kind: 'some' };
    if (c === 3) return { text: 'Cloudy', kind: 'cloud' };
    if (c === 45 || c === 48) return { text: 'Fog', kind: 'fog' };
    if (c >= 51 && c <= 57) return { text: 'Drizzle', kind: 'rain' };
    if (c >= 61 && c <= 67) return { text: c === 61 ? 'Light rain' : c >= 66 ? 'Freezing rain' : 'Rain', kind: 'rain' };
    if (c >= 71 && c <= 77) return { text: c === 71 ? 'Light snow' : 'Snow', kind: 'snow' };
    if (c >= 80 && c <= 82) return { text: 'Showers', kind: 'rain' };
    if (c === 85 || c === 86) return { text: 'Snow showers', kind: 'snow' };
    if (c >= 95) return { text: 'Thunderstorm', kind: 'storm' };
    return { text: '', kind: 'clear' };
  }

  // ---- Axiom: sorting a student's tasks into what matters now ----------------------------
  function addDays(key, n) { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n)); }
  const TESTS = ['test', 'quiz', 'exam'];
  // overdue, due today, due in the next week, and tests and quizzes coming up (open tasks only)
  function planBuckets(tasks, today) {
    const open = tasks.filter((t) => !t.done && t.due), week = addDays(today, 7), by = (a, b) => (a.due + (a.time || '99')).localeCompare(b.due + (b.time || '99'));
    return {
      overdue: open.filter((t) => t.due < today).sort(by),
      today: open.filter((t) => t.due === today).sort(by),
      week: open.filter((t) => t.due > today && t.due <= week).sort(by),
      tests: open.filter((t) => TESTS.includes(t.type) && t.due >= today).sort(by),
    };
  }
  // the old Calendar kept {day: [{text, time}]}; Axiom keeps them as tasks
  function eventsToTasks(events) {
    const out = [];
    Object.keys(events || {}).sort().forEach((k) => (events[k] || []).forEach((e, i) => { if (e && e.text) out.push({ id: 'ev-' + k + '-' + i, title: e.text, type: 'event', due: k, time: e.time || '', done: false, classId: null }); }));
    return out;
  }

  // ---- DiceTV: Watch shortcuts, the sleep timer, and backups -----------------------------
  // the letters on a Watch tile: the first letter, or two for two words (Prime Video: PV)
  function monogram(name) {
    const s = String(name || '?').trim() || '?', words = s.split(/\s+/);
    return (words.length > 1 ? words[0][0] + words[1][0] : s[0] + (/\+$/.test(s) ? '+' : '')).toUpperCase();
  }
  // what someone typed as a web address, made whole (or null if it isn't one). Things on
  // your own network (a Plex or Jellyfin box at 192.168.1.20:32400, or name.local) get http.
  function cleanUrl(u) {
    u = String(u || '').trim();
    if (!u || /\s/.test(u)) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u) && !/^(javascript|data|mailto|file|about|blob):/i.test(u)) u = (/^(\d{1,3}(\.\d{1,3}){3}|[\w-]+\.local)(:\d+)?(\/|$)/i.test(u) ? 'http://' : 'https://') + u;
    try {
      const x = new URL(u), ip = /^\d{1,3}(\.\d{1,3}){3}$/.test(x.hostname);
      return /^https?:$/.test(x.protocol) && (ip || /\.[a-z]{2,}$/i.test(x.hostname)) ? x.href : null;
    } catch (e) { return null; }
  }
  // the sleep timer goes round: off, 15, 30, 60, 90, off
  const SLEEPS = [0, 15, 30, 60, 90];
  function nextSleep(mins) { const i = SLEEPS.indexOf(mins); return SLEEPS[(i + 1) % SLEEPS.length]; }
  // a backup file, if it is one
  function readBackup(text) {
    let d = null;
    try { d = JSON.parse(text); } catch (e) { return null; }
    if (!d || d.kind !== 'dice-backup' || !d.state || typeof d.state !== 'object' || Array.isArray(d.state)) return null;
    return d;
  }

  // ---- the Dice Bar: units, timers and quick tasks ---------------------------------------
  // "5 km in miles", "72 f to c", "3 cups in ml", "2 gb in mb"
  const U = {};
  const unit = (kind, f, ...names) => names.forEach((n) => { U[n] = [kind, f, names[0]]; });
  unit('len', 0.001, 'mm', 'millimetre', 'millimetres', 'millimeter', 'millimeters'); unit('len', 0.01, 'cm', 'centimetre', 'centimetres', 'centimeter', 'centimeters');
  unit('len', 1, 'm', 'metre', 'metres', 'meter', 'meters'); unit('len', 1000, 'km', 'kilometre', 'kilometres', 'kilometer', 'kilometers');
  unit('len', 0.0254, 'in', 'inch', 'inches'); unit('len', 0.3048, 'ft', 'foot', 'feet'); unit('len', 0.9144, 'yd', 'yard', 'yards'); unit('len', 1609.344, 'mi', 'mile', 'miles');
  unit('mass', 0.001, 'mg', 'milligram', 'milligrams'); unit('mass', 1, 'g', 'gram', 'grams'); unit('mass', 1000, 'kg', 'kilo', 'kilos', 'kilogram', 'kilograms');
  unit('mass', 28.349523125, 'oz', 'ounce', 'ounces'); unit('mass', 453.59237, 'lb', 'lbs', 'pound', 'pounds'); unit('mass', 6350.29318, 'st', 'stone', 'stones');
  unit('vol', 0.001, 'ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters'); unit('vol', 1, 'l', 'litre', 'litres', 'liter', 'liters');
  unit('vol', 0.00492892159375, 'tsp', 'teaspoon', 'teaspoons'); unit('vol', 0.01478676478125, 'tbsp', 'tablespoon', 'tablespoons'); unit('vol', 0.0295735295625, 'floz', 'fl oz');
  unit('vol', 0.2365882365, 'cup', 'cups'); unit('vol', 0.473176473, 'pt', 'pint', 'pints'); unit('vol', 0.946352946, 'qt', 'quart', 'quarts'); unit('vol', 3.785411784, 'gal', 'gallon', 'gallons');
  unit('time', 1, 's', 'sec', 'secs', 'second', 'seconds'); unit('time', 60, 'min', 'mins', 'minute', 'minutes'); unit('time', 3600, 'h', 'hr', 'hrs', 'hour', 'hours');
  unit('time', 86400, 'day', 'days'); unit('time', 604800, 'week', 'weeks'); unit('time', 31557600, 'year', 'years');
  unit('data', 1, 'byte', 'bytes'); unit('data', 1e3, 'kb', 'kilobyte', 'kilobytes'); unit('data', 1e6, 'mb', 'megabyte', 'megabytes'); unit('data', 1e9, 'gb', 'gigabyte', 'gigabytes'); unit('data', 1e12, 'tb', 'terabyte', 'terabytes');
  unit('speed', 1, 'm/s'); unit('speed', 1 / 3.6, 'km/h', 'kmh', 'kph'); unit('speed', 0.44704, 'mph');
  const TEMP = { c: 'c', '°c': 'c', celsius: 'c', f: 'f', '°f': 'f', fahrenheit: 'f', k: 'k', kelvin: 'k' };
  function convert(q) {
    const m = /^\s*(-?\d[\d,]*(?:\.\d+)?|-?\.\d+)\s*([a-z°/ ]+?)\s+(?:in|to|as|into)\s+([a-z°/ ]+?)\s*$/i.exec(String(q || ''));
    if (!m) return null;
    const v = parseFloat(m[1].replace(/,/g, '')), a = m[2].trim().toLowerCase(), b = m[3].trim().toLowerCase();
    let out, from, to;
    if (TEMP[a] && TEMP[b]) {
      from = TEMP[a]; to = TEMP[b];
      const c = from === 'c' ? v : from === 'f' ? (v - 32) * 5 / 9 : v - 273.15;
      out = to === 'c' ? c : to === 'f' ? c * 9 / 5 + 32 : c + 273.15;
      from = from === 'k' ? 'K' : '°' + from.toUpperCase(); to = to === 'k' ? 'K' : '°' + to.toUpperCase();
    } else {
      const ua = U[a] || U[a.replace(/s$/, '')], ub = U[b] || U[b.replace(/s$/, '')];
      if (!ua || !ub || ua[0] !== ub[0]) return null;
      out = v * ua[1] / ub[1]; from = ua[2]; to = ub[2];
    }
    const nice = (n) => calcText(+n.toPrecision(6));
    return { value: out, text: nice(v) + ' ' + from + ' = ' + nice(out) + ' ' + to };
  }
  // "timer 10", "timer 90s", "set a timer for 1.5 hours": how long, in milliseconds
  function parseTimer(q) {
    const m = /^\s*(?:set\s+(?:a\s+)?)?timer(?:\s+for)?\s+(\d+(?:\.\d+)?)\s*(s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?)?\s*$/i.exec(String(q || ''));
    if (!m) return 0;
    const n = parseFloat(m[1]), u = (m[2] || 'm').toLowerCase();
    const ms = n * (u[0] === 's' ? 1000 : u[0] === 'h' ? 3600000 : 60000);
    return ms > 0 && ms <= 24 * 3600000 ? Math.round(ms) : 0;
  }
  // "todo read chapter 7 friday", "task lab report tomorrow": a task for Axiom
  const WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  function parseTask(q, today) {
    const m = /^\s*(?:todo|to do|task|remind me to|add task)\s*:?\s+(.+?)\s*$/i.exec(String(q || ''));
    if (!m) return null;
    let title = m[1], due = today;
    const tail = /\s+(?:(?:due|by|on|for)\s+)?(today|tonight|tomorrow|next week|(?:this\s+|next\s+)?(?:sun|mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?)(?:day)?)$/i.exec(title);
    if (tail) {
      title = title.slice(0, tail.index).trim();
      const w = tail[1].toLowerCase();
      if (w === 'tomorrow') due = addDays(today, 1);
      else if (w === 'next week') due = addDays(today, 7);
      else if (w !== 'today' && w !== 'tonight') {
        const day = WEEK.findIndex((d) => d.startsWith(w.replace(/^(this|next)\s+/, '').slice(0, 3)));
        const [y, mo, d] = today.split('-').map(Number), now = new Date(y, mo - 1, d).getDay();
        let ahead = (day - now + 7) % 7 || 7;
        if (/^next\s/.test(w) && ahead < 7) ahead += 7;
        due = addDays(today, ahead);
      }
    }
    title = title.replace(/^["']|["']$/g, '').trim();
    return title ? { title: title.charAt(0).toUpperCase() + title.slice(1), due } : null;
  }

  // ---- Axiom: when classes meet ---------------------------------------------------------------
  // a class can meet on some days of the week (0 is Sunday), from start to end ('09:00')
  const hm = (t) => /^\d\d:\d\d$/.test(t || '') ? +t.slice(0, 2) * 60 + +t.slice(3, 5) : NaN;
  function classesOn(classes, key) {
    const [y, m, d] = String(key).split('-').map(Number), wd = new Date(y, m - 1, d).getDay();
    return (classes || []).filter((c) => Array.isArray(c.days) && c.days.includes(wd) && hm(c.start) < hm(c.end))
      .map((c) => ({ cls: c, start: c.start, end: c.end, from: hm(c.start), to: hm(c.end) })).sort((a, b) => a.from - b.from);
  }
  // what's on now, and what's next, today
  function classNow(classes, date) {
    const key = dayKey(date), mins = date.getHours() * 60 + date.getMinutes(), list = classesOn(classes, key);
    return { now: list.find((s) => s.from <= mins && mins < s.to) || null, next: list.find((s) => s.from > mins) || null, mins };
  }
  // how much was studied, per class, in the 7 days up to today
  function studyWeek(study, today) {
    const from = addDays(today, -6), by = {};
    let total = 0;
    (study || []).forEach((s) => { if (s.day >= from && s.day <= today) { total += s.mins; by[s.classId || ''] = (by[s.classId || ''] || 0) + s.mins; } });
    return { total, by };
  }

  // ---- the desktop: where a window goes when it's snapped ---------------------------------------
  // zones: left, right, top (the whole screen), tl tr bl br (quarters), and thirds l3 c3 r3, l23 r23
  function snapRect(zone, area, gap) {
    gap = gap === undefined ? 6 : gap;
    const W = area.w, H = area.h, hw = Math.round(W / 2), hh = Math.round(H / 2), t3 = Math.round(W / 3);
    const R = { top: [0, 0, W, H], left: [0, 0, hw, H], right: [hw, 0, W - hw, H], tl: [0, 0, hw, hh], tr: [hw, 0, W - hw, hh], bl: [0, hh, hw, H - hh], br: [hw, hh, W - hw, H - hh],
      l3: [0, 0, t3, H], c3: [t3, 0, t3, H], r3: [2 * t3, 0, W - 2 * t3, H], l23: [0, 0, 2 * t3, H], r23: [t3, 0, W - t3, H] }[zone];
    if (!R) return null;
    return { x: R[0] + gap, y: R[1] + gap, w: R[2] - gap * 2, h: R[3] - gap * 2 };
  }
  // which zone the pointer is in while dragging a window (null when it's nowhere near an edge)
  function edgeZone(x, y, area, edge) {
    edge = edge || 14;
    const corner = Math.min(120, area.h / 4), L = x <= edge, Rt = x >= area.w - edge, T = y <= edge;
    if (T && x < corner) return 'tl';
    if (T && x > area.w - corner) return 'tr';
    if (T) return 'top';
    if (L) return y < corner ? 'tl' : y > area.h - corner ? 'bl' : 'left';
    if (Rt) return y < corner ? 'tr' : y > area.h - corner ? 'br' : 'right';
    return null;
  }
  // n windows in a grid for the overview: the box each one fits in
  function fitGrid(n, W, H, pad) {
    pad = pad === undefined ? 24 : pad;
    if (!n) return [];
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * (W / H) / 1.5))), rows = Math.ceil(n / cols), cw = W / cols, ch = H / rows;
    return Array.from({ length: n }, (_, i) => {
      const r = Math.floor(i / cols), inRow = r === rows - 1 ? n - r * cols : cols, off = (W - inRow * cw) / 2;
      return { x: Math.round(off + (i % cols) * cw + pad / 2), y: Math.round(r * ch + pad / 2), w: Math.round(cw - pad), h: Math.round(ch - pad) };
    });
  }

  // ---- remotes: the keys TV remotes, media keyboards and air mice send ----------------------------
  const REMOTE = { BrowserBack: 'b', GoBack: 'b', Exit: 'b', Back: 'b', Select: 'a', Accept: 'a', Execute: 'a', ContextMenu: 'menu', Info: 'x', Guide: 'guide', BrowserHome: 'home',
    MediaPlayPause: 'play', MediaPlay: 'play', MediaPause: 'play', MediaStop: 'stop', MediaTrackNext: 'next', MediaTrackPrevious: 'prev', MediaFastForward: 'ff', MediaRewind: 'rew',
    AudioVolumeUp: 'volup', AudioVolumeDown: 'voldown', AudioVolumeMute: 'mute', ChannelUp: 'rb', ChannelDown: 'lb', ColorF0Red: 'red', ColorF1Green: 'green', ColorF2Yellow: 'yellow', ColorF3Blue: 'blue',
    Settings: 'quick', Sleep: 'sleep', StandBy: 'sleep', BrowserSearch: 'search' };
  const remoteKey = (key) => REMOTE[key] || null;

  const api = { clockNight, pickNext, newDisk, calc, calcText, monthGrid, dayKey, resolve, walk, writeFile, makeDir, remove, tokens, parseDice, run, HELP, score,
    sunPos, moonPos, cityTime, ENGINES, omni, howToShow, hostOf, weatherWords, addDays, planBuckets, eventsToTasks, remember, suggest, monogram, cleanUrl, nextSleep, readBackup,
    convert, parseTimer, parseTask, classesOn, classNow, studyWeek, snapRect, edgeZone, fitGrid, remoteKey, REMOTE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DiceLogic = api;
})(this);
