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
          notes: { type: 'dir', kids: { 'first note.txt': f('Things to try:\n- Put a song on in Music\n- Type neofetch in Terminal\n- Plug in a controller\n- Try Big screen from the die menu') } },
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

  const api = { clockNight, pickNext, newDisk, calc, calcText, monthGrid, dayKey, resolve, walk, writeFile, makeDir, remove, tokens, parseDice, run, HELP, score };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DiceLogic = api;
})(this);
