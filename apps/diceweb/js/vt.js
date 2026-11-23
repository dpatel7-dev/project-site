// A terminal screen: understands the escape codes programs use to move the
// cursor, clear, colour and scroll, so things like nano, htop and less work.
// Feed it what the shell prints; it draws rows of text into an element.
(function () {
  'use strict';
  const BASE16 = {
    light: ['#26262c', '#d9363e', '#3f8f2f', '#b07d0f', '#2f6fd6', '#a34fd1', '#11897d', '#c9c9d2', '#6c6c76', '#ff5a64', '#58b84a', '#d9a21b', '#4f8cff', '#c27ae8', '#22b3a2', '#ffffff'],
    dark: ['#26262c', '#ff707a', '#8fd16a', '#f5c431', '#7cc4ff', '#d39cf5', '#2bc4b2', '#c9c9d2', '#6c6c76', '#ff8f97', '#a9e08a', '#ffd75e', '#9fd3ff', '#e2b8fa', '#5fdccd', '#f3f3f5'],
  };
  function palette256(night) {
    const p = BASE16[night ? 'dark' : 'light'].slice();
    const v = [0, 95, 135, 175, 215, 255];
    for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) p.push('#' + [v[r], v[g], v[b]].map((x) => x.toString(16).padStart(2, '0')).join(''));
    for (let i = 0; i < 24; i++) { const x = (8 + i * 10).toString(16).padStart(2, '0'); p.push('#' + x + x + x); }
    return p;
  }
  const blank = (a) => ({ ch: ' ', fg: a.fg, bg: a.bg, b: 0, i: 0, u: 0, inv: 0, dim: 0 });
  const plain = () => ({ fg: null, bg: null, b: 0, i: 0, u: 0, inv: 0, dim: 0 });

  class VT {
    constructor(el, opts) {
      this.el = el; this.opts = opts || {};
      this.cols = 80; this.rows = 24;
      el.classList.add('vt');
      el.innerHTML = '<div class="vt-hist"></div><div class="vt-screen"></div>';
      this.histEl = el.querySelector('.vt-hist'); this.scrEl = el.querySelector('.vt-screen');
      this.dec = new TextDecoder('utf-8');
      this.reset();
    }
    reset() {
      this.attr = plain();
      this.main = this.makeScreen(); this.alt = this.makeScreen(); this.screen = this.main; this.isAlt = false;
      this.x = 0; this.y = 0; this.saved = { x: 0, y: 0, attr: plain() }; this.top = 0; this.bot = this.rows - 1;
      this.wrapNext = false; this.autowrap = true; this.cursorOn = true; this.appKeys = false; this.paste = false; this.insert = false;
      this.state = 0; this.params = ''; this.osc = '';
      this.dirty = new Set(); for (let i = 0; i < this.rows; i++) this.dirty.add(i);
      this.histEl.innerHTML = ''; this.histCount = 0;
      this.schedule();
    }
    makeScreen() { return Array.from({ length: this.rows }, () => Array.from({ length: this.cols }, () => blank(plain()))); }
    resize(cols, rows) {
      cols = Math.max(10, Math.min(400, cols | 0)); rows = Math.max(4, Math.min(200, rows | 0));
      if (cols === this.cols && rows === this.rows) return false;
      const fit = (scr, keepBottom) => {
        let s = scr.map((r) => (r.length >= cols ? r.slice(0, cols) : r.concat(Array.from({ length: cols - r.length }, () => blank(plain())))));
        if (s.length > rows) {
          let cut = s.length - rows;
          // first drop rows below the cursor; only then push lines off the top into the history
          const below = keepBottom ? Math.max(0, Math.min(cut, s.length - 1 - this.y)) : cut;
          s = s.slice(0, s.length - below);
          cut -= below;
          if (cut > 0) { s.slice(0, cut).forEach((r) => this.pushHistory(r)); s = s.slice(cut); this.y = Math.max(0, this.y - cut); }
        }
        while (s.length < rows) s.push(Array.from({ length: cols }, () => blank(plain())));
        return s;
      };
      const wasAlt = this.isAlt;
      this.cols = cols;
      this.main = fit(this.main, !wasAlt);
      this.alt = fit(this.alt, false);
      this.rows = rows;
      this.screen = wasAlt ? this.alt : this.main;
      this.top = 0; this.bot = rows - 1;
      this.x = Math.min(this.x, cols - 1); this.y = Math.min(this.y, rows - 1);
      this.dirty = new Set(Array.from({ length: rows }, (_, i) => i));
      this.scrEl.innerHTML = '';
      this.schedule();
      return true;
    }
    // ---- input from the program ----
    write(data) {
      const text = typeof data === 'string' ? data : this.dec.decode(data, { stream: true });
      for (const ch of text) this.feed(ch);
      this.schedule();
    }
    feed(ch) {
      const c = ch.codePointAt(0);
      switch (this.state) {
        case 0:
          if (c === 0x1b) { this.state = 1; return; }
          if (c < 0x20 || c === 0x7f) return this.control(c);
          return this.put(ch);
        case 1: // after ESC
          this.state = 0;
          if (ch === '[') { this.state = 2; this.params = ''; return; }
          if (ch === ']') { this.state = 3; this.osc = ''; return; }
          if (ch === 'P' || ch === '_' || ch === '^') { this.state = 4; return; }
          if (ch === '(' || ch === ')' || ch === '*' || ch === '+' || ch === '#' || ch === '%') { this.state = 5; return; }
          if (ch === '7') return this.save();
          if (ch === '8') return this.restore();
          if (ch === 'D') return this.lineFeed();
          if (ch === 'E') { this.x = 0; return this.lineFeed(); }
          if (ch === 'M') return this.reverseIndex();
          if (ch === 'c') return this.reset();
          return;
        case 2: // CSI
          if (c >= 0x40 && c <= 0x7e) { this.state = 0; return this.csi(ch, this.params); }
          this.params += ch;
          if (this.params.length > 64) this.state = 0;
          return;
        case 3: // OSC: titles and such, until BEL or ESC \
          if (c === 7) { this.state = 0; return this.oscDone(); }
          if (c === 0x1b) { this.state = 6; return; }
          this.osc += ch;
          if (this.osc.length > 512) this.state = 0;
          return;
        case 4: // DCS and friends: skip until ESC \
          if (c === 0x1b) this.state = 6;
          return;
        case 5: this.state = 0; return; // charset choice: ignored
        case 6: this.state = 0; if (ch === '\\' && this.osc) this.oscDone(); this.osc = ''; return;
      }
    }
    oscDone() { const m = /^(0|2);(.*)$/.exec(this.osc); if (m && this.opts.onTitle) this.opts.onTitle(m[2]); this.osc = ''; }
    control(c) {
      if (c === 7) { if (this.opts.onBell) this.opts.onBell(); return; }
      if (c === 8) { this.wrapNext = false; if (this.x > 0) this.x--; return; }
      if (c === 9) { this.x = Math.min(this.cols - 1, (Math.floor(this.x / 8) + 1) * 8); return; }
      if (c === 10 || c === 11 || c === 12) return this.lineFeed();
      if (c === 13) { this.x = 0; this.wrapNext = false; }
    }
    put(ch) {
      if (this.wrapNext && this.autowrap) { this.x = 0; this.lineFeed(); }
      this.wrapNext = false;
      const row = this.screen[this.y];
      if (this.insert) { row.splice(this.x, 0, blank(this.attr)); row.length = this.cols; }
      row[this.x] = Object.assign({ ch }, this.attr);
      this.dirty.add(this.y);
      if (this.x >= this.cols - 1) this.wrapNext = true; else this.x++;
    }
    lineFeed() {
      this.wrapNext = false;
      if (this.y === this.bot) this.scrollUp(1); else if (this.y < this.rows - 1) this.y++;
    }
    reverseIndex() { if (this.y === this.top) this.scrollDown(1); else if (this.y > 0) this.y--; }
    scrollUp(n) {
      for (let k = 0; k < n; k++) {
        const gone = this.screen.splice(this.top, 1)[0];
        if (!this.isAlt && this.top === 0) this.pushHistory(gone);
        this.screen.splice(this.bot, 0, Array.from({ length: this.cols }, () => blank(this.attr)));
      }
      for (let i = this.top; i <= this.bot; i++) this.dirty.add(i);
    }
    scrollDown(n) {
      for (let k = 0; k < n; k++) {
        this.screen.splice(this.bot, 1);
        this.screen.splice(this.top, 0, Array.from({ length: this.cols }, () => blank(this.attr)));
      }
      for (let i = this.top; i <= this.bot; i++) this.dirty.add(i);
    }
    pushHistory(row) {
      const div = document.createElement('div');
      div.className = 'vt-row';
      this.paintRow(div, row, -1);
      this.histEl.appendChild(div);
      if (++this.histCount > 2000) { this.histEl.firstChild.remove(); this.histCount--; }
    }
    save() { this.saved = { x: this.x, y: this.y, attr: Object.assign({}, this.attr) }; }
    restore() { this.x = this.saved.x; this.y = this.saved.y; this.attr = Object.assign({}, this.saved.attr); this.wrapNext = false; }
    clamp() { this.x = Math.max(0, Math.min(this.cols - 1, this.x)); this.y = Math.max(0, Math.min(this.rows - 1, this.y)); }
    erase(row, from, to) { const r = this.screen[row]; for (let i = Math.max(0, from); i < Math.min(this.cols, to); i++) r[i] = blank(this.attr); this.dirty.add(row); }
    csi(fin, raw) {
      const priv = raw[0] === '?' || raw[0] === '>' || raw[0] === '=' ? raw[0] : '';
      const ps = (priv ? raw.slice(1) : raw).replace(/[^0-9;:]/g, '').split(';').map((s) => (s === '' ? NaN : parseInt(s, 10)));
      const p = (i, d) => (isNaN(ps[i]) || ps[i] === undefined ? d : ps[i]);
      const n = Math.max(1, p(0, 1));
      this.wrapNext = false;
      switch (fin) {
        case 'A': this.y = Math.max(this.y < this.top ? 0 : this.top, this.y - n); break;
        case 'B': this.y = Math.min(this.y > this.bot ? this.rows - 1 : this.bot, this.y + n); break;
        case 'C': this.x = Math.min(this.cols - 1, this.x + n); break;
        case 'D': this.x = Math.max(0, this.x - n); break;
        case 'E': this.x = 0; this.y = Math.min(this.rows - 1, this.y + n); break;
        case 'F': this.x = 0; this.y = Math.max(0, this.y - n); break;
        case 'G': case '`': this.x = Math.min(this.cols - 1, p(0, 1) - 1); break;
        case 'd': this.y = Math.min(this.rows - 1, p(0, 1) - 1); break;
        case 'H': case 'f': this.y = p(0, 1) - 1; this.x = p(1, 1) - 1; this.clamp(); break;
        case 'J': {
          const m = p(0, 0);
          if (m === 0) { this.erase(this.y, this.x, this.cols); for (let r = this.y + 1; r < this.rows; r++) this.erase(r, 0, this.cols); }
          else if (m === 1) { this.erase(this.y, 0, this.x + 1); for (let r = 0; r < this.y; r++) this.erase(r, 0, this.cols); }
          else { for (let r = 0; r < this.rows; r++) this.erase(r, 0, this.cols); if (m === 3) { this.histEl.innerHTML = ''; this.histCount = 0; } }
          break;
        }
        case 'K': { const m = p(0, 0); if (m === 0) this.erase(this.y, this.x, this.cols); else if (m === 1) this.erase(this.y, 0, this.x + 1); else this.erase(this.y, 0, this.cols); break; }
        case 'L': if (this.y >= this.top && this.y <= this.bot) { const t = this.top; this.top = this.y; this.scrollDown(n); this.top = t; } break;
        case 'M': if (this.y >= this.top && this.y <= this.bot) { const t = this.top; this.top = this.y; this.scrollUp(n); this.top = t; } break;
        case 'P': { const r = this.screen[this.y]; r.splice(this.x, n); while (r.length < this.cols) r.push(blank(this.attr)); this.dirty.add(this.y); break; }
        case '@': { const r = this.screen[this.y]; for (let k = 0; k < n; k++) r.splice(this.x, 0, blank(this.attr)); r.length = this.cols; this.dirty.add(this.y); break; }
        case 'X': this.erase(this.y, this.x, this.x + n); break;
        case 'S': this.scrollUp(n); break;
        case 'T': if (!priv) this.scrollDown(n); break;
        case 'r': this.top = Math.max(0, p(0, 1) - 1); this.bot = Math.min(this.rows - 1, p(1, this.rows) - 1); if (this.top >= this.bot) { this.top = 0; this.bot = this.rows - 1; } this.x = 0; this.y = 0; break;
        case 's': this.save(); break;
        case 'u': this.restore(); break;
        case 'm': this.sgr(ps); break;
        case 'h': case 'l': this.mode(priv, ps, fin === 'h'); break;
        case 'n': if (p(0, 0) === 6) this.reply('\x1b[' + (this.y + 1) + ';' + (this.x + 1) + 'R'); else if (p(0, 0) === 5) this.reply('\x1b[0n'); break;
        case 'c': if (!priv) this.reply('\x1b[?62;22c'); else if (priv === '>') this.reply('\x1b[>0;10;0c'); break;
      }
    }
    mode(priv, ps, on) {
      for (const m of ps) {
        if (priv === '?') {
          if (m === 25) this.cursorOn = on;
          else if (m === 1) this.appKeys = on;
          else if (m === 7) this.autowrap = on;
          else if (m === 2004) this.paste = on;
          else if (m === 1049 || m === 47 || m === 1047) {
            if (on === this.isAlt) continue;
            if (on) { if (m === 1049) this.save(); this.alt = this.makeScreen(); this.screen = this.alt; this.isAlt = true; }
            else { this.screen = this.main; this.isAlt = false; if (m === 1049) this.restore(); }
            this.top = 0; this.bot = this.rows - 1;
            for (let i = 0; i < this.rows; i++) this.dirty.add(i);
            this.el.classList.toggle('vt-alt', this.isAlt);
          }
        } else if (m === 4) this.insert = on;
      }
    }
    sgr(ps) {
      if (!ps.length || (ps.length === 1 && isNaN(ps[0]))) ps = [0];
      for (let i = 0; i < ps.length; i++) {
        const v = isNaN(ps[i]) ? 0 : ps[i], a = this.attr;
        if (v === 0) this.attr = plain();
        else if (v === 1) a.b = 1; else if (v === 2) a.dim = 1; else if (v === 3) a.i = 1; else if (v === 4) a.u = 1; else if (v === 7) a.inv = 1;
        else if (v === 22) { a.b = 0; a.dim = 0; } else if (v === 23) a.i = 0; else if (v === 24) a.u = 0; else if (v === 27) a.inv = 0;
        else if (v >= 30 && v <= 37) a.fg = v - 30; else if (v >= 90 && v <= 97) a.fg = v - 82;
        else if (v >= 40 && v <= 47) a.bg = v - 40; else if (v >= 100 && v <= 107) a.bg = v - 92;
        else if (v === 39) a.fg = null; else if (v === 49) a.bg = null;
        else if (v === 38 || v === 48) {
          let col = null;
          if (ps[i + 1] === 5) { col = ps[i + 2]; i += 2; }
          else if (ps[i + 1] === 2) { col = '#' + [ps[i + 2], ps[i + 3], ps[i + 4]].map((x) => Math.max(0, Math.min(255, x | 0)).toString(16).padStart(2, '0')).join(''); i += 4; }
          if (v === 38) a.fg = col; else a.bg = col;
        }
      }
    }
    reply(s) { if (this.opts.onReply) this.opts.onReply(s); }
    // ---- drawing ----
    schedule() { if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.render(); }); }
    colour(c, night) { if (c === null || c === undefined) return null; if (typeof c === 'string') return c; return (this.pal || (this.pal = palette256(night)))[c] || null; }
    paintRow(div, row, cursorX) {
      let html = '', run = '', key = null, style = '';
      const flush = () => { if (run) html += style ? '<span style="' + style + '">' + run + '</span>' : run; run = ''; };
      row.forEach((c, x) => {
        let fg = this.colour(c.fg), bg = this.colour(c.bg);
        if (c.b && typeof c.fg === 'number' && c.fg < 8) fg = this.colour(c.fg + 8);
        let inv = c.inv;
        if (x === cursorX) inv = !inv;
        if (inv) { const t = fg || 'var(--vt-fg)'; fg = bg || 'var(--vt-bg)'; bg = t; }
        const s = (fg ? 'color:' + fg + ';' : '') + (bg ? 'background:' + bg + ';' : '') + (c.b ? 'font-weight:700;' : '') + (c.i ? 'font-style:italic;' : '') + (c.u ? 'text-decoration:underline;' : '') + (c.dim ? 'opacity:.6;' : '');
        if (s !== key) { flush(); key = s; style = s; }
        run += c.ch === '<' ? '&lt;' : c.ch === '&' ? '&amp;' : c.ch === '>' ? '&gt;' : c.ch;
      });
      flush();
      div.innerHTML = html.replace(/\s+$/, (m) => m) || ' ';
    }
    render() {
      const night = document.documentElement.getAttribute('data-look') === 'dark';
      if (night !== this.night) { this.night = night; this.pal = null; for (let i = 0; i < this.rows; i++) this.dirty.add(i); }
      while (this.scrEl.children.length < this.rows) { const d = document.createElement('div'); d.className = 'vt-row'; this.scrEl.appendChild(d); }
      while (this.scrEl.children.length > this.rows) this.scrEl.lastChild.remove();
      if (this.lastCursor !== undefined) this.dirty.add(this.lastCursor);
      this.dirty.add(this.y);
      for (const r of this.dirty) if (r < this.rows) this.paintRow(this.scrEl.children[r], this.screen[r], r === this.y && this.cursorOn && this.focused !== false ? Math.min(this.x, this.cols - 1) : -1);
      this.lastCursor = this.y;
      this.dirty.clear();
      if (this.opts.onDraw) this.opts.onDraw();
    }
    // ---- keys to bytes ----
    keyBytes(e) {
      const app = this.appKeys;
      const arrows = { ArrowUp: 'A', ArrowDown: 'B', ArrowRight: 'C', ArrowLeft: 'D' };
      const mod = (e.shiftKey ? 1 : 0) + (e.altKey ? 2 : 0) + (e.ctrlKey ? 4 : 0);
      if (arrows[e.key]) return mod ? '\x1b[1;' + (mod + 1) + arrows[e.key] : (app ? '\x1bO' : '\x1b[') + arrows[e.key];
      const fixed = { Enter: '\r', Backspace: e.ctrlKey ? '\x08' : '\x7f', Tab: e.shiftKey ? '\x1b[Z' : '\t', Escape: '\x1b', Home: app ? '\x1bOH' : '\x1b[H', End: app ? '\x1bOF' : '\x1b[F',
        PageUp: '\x1b[5~', PageDown: '\x1b[6~', Delete: '\x1b[3~', Insert: '\x1b[2~',
        F1: '\x1bOP', F2: '\x1bOQ', F3: '\x1bOR', F4: '\x1bOS', F5: '\x1b[15~', F6: '\x1b[17~', F7: '\x1b[18~', F8: '\x1b[19~', F9: '\x1b[20~', F10: '\x1b[21~', F11: '\x1b[23~', F12: '\x1b[24~' };
      if (fixed[e.key] !== undefined) return fixed[e.key];
      if (e.ctrlKey && !e.altKey && e.key.length === 1) {
        const k = e.key.toLowerCase();
        if (k >= 'a' && k <= 'z') return String.fromCharCode(k.charCodeAt(0) - 96);
        const special = { ' ': '\x00', '@': '\x00', '[': '\x1b', '\\': '\x1c', ']': '\x1d', '^': '\x1e', '_': '\x1f', '/': '\x1f', '?': '\x7f' };
        if (special[e.key] !== undefined) return special[e.key];
      }
      if (e.altKey && !e.ctrlKey && e.key.length === 1) return '\x1b' + e.key;
      return null;
    }
    text() { return this.screen.map((r) => r.map((c) => c.ch).join('').replace(/\s+$/, '')).join('\n'); }
  }
  if (typeof window !== "undefined") window.DiceVT = VT;
  if (typeof module !== 'undefined' && module.exports) module.exports = VT;
})();
