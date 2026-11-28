// Deuce's calculator: maths and unit conversions, worked out exactly, on this computer.
//   "15% of 80", "(3 + 4) × 2", "what's 12 times 7", "square root of 81", "2 to the power of 10",
//   "5 miles in km", "70 f to c", "3 cups in ml", "2.5 hours in minutes", "1 gb in mb", "6 feet 2 in cm"
// Deuce's rules use it for questions like those; Deuce's brain (js/deucemind.js) uses it as a tool,
// because even a clever language model gets sums wrong. No eval(): it's its own small parser.
(function (root) {
  'use strict';

  // ---- units: how many of the base unit one of each is ------------------------------------------------------
  const U = {};
  const def = (dim, names, f) => names.split('|').forEach((n) => { U[n] = { dim, f }; });
  def('len', 'mm|millimeter|millimeters|millimetre|millimetres', 0.001); def('len', 'cm|centimeter|centimeters|centimetre|centimetres', 0.01);
  def('len', 'm|meter|meters|metre|metres', 1); def('len', 'km|kilometer|kilometers|kilometre|kilometres|k', 1000);
  def('len', 'in|inch|inches|"', 0.0254); def('len', 'ft|foot|feet|\'', 0.3048); def('len', 'yd|yard|yards', 0.9144); def('len', 'mi|mile|miles', 1609.344);
  def('len', 'nmi|nautical mile|nautical miles', 1852); def('len', 'light year|light years|ly', 9.4607e15);
  def('mass', 'mg|milligram|milligrams', 1e-6); def('mass', 'g|gram|grams', 0.001); def('mass', 'kg|kilo|kilos|kilogram|kilograms', 1);
  def('mass', 'oz|ounce|ounces', 0.028349523125); def('mass', 'lb|lbs|pound|pounds', 0.45359237); def('mass', 'st|stone|stones', 6.35029318);
  def('mass', 'ton|tons|short ton|short tons', 907.18474); def('mass', 'tonne|tonnes|metric ton|metric tons', 1000);
  def('vol', 'ml|milliliter|milliliters|millilitre|millilitres', 0.001); def('vol', 'l|liter|liters|litre|litres', 1);
  def('vol', 'tsp|teaspoon|teaspoons', 0.00492892159375); def('vol', 'tbsp|tablespoon|tablespoons', 0.01478676478125);
  def('vol', 'fl oz|fluid ounce|fluid ounces', 0.0295735295625); def('vol', 'cup|cups', 0.2365882365); def('vol', 'pt|pint|pints', 0.473176473);
  def('vol', 'qt|quart|quarts', 0.946352946); def('vol', 'gal|gallon|gallons', 3.785411784);
  def('time', 'ms|millisecond|milliseconds', 0.001); def('time', 's|sec|secs|second|seconds', 1); def('time', 'min|mins|minute|minutes', 60);
  def('time', 'h|hr|hrs|hour|hours', 3600); def('time', 'day|days', 86400); def('time', 'week|weeks', 604800); def('time', 'month|months', 2629746);
  def('time', 'year|years|yr|yrs', 31556952);
  def('data', 'b|byte|bytes', 1); def('data', 'kb|kilobyte|kilobytes', 1e3); def('data', 'mb|megabyte|megabytes', 1e6); def('data', 'gb|gigabyte|gigabytes', 1e9);
  def('data', 'tb|terabyte|terabytes', 1e12); def('data', 'kib', 1024); def('data', 'mib', 1048576); def('data', 'gib', 1073741824); def('data', 'bit|bits', 0.125);
  def('speed', 'mph|miles per hour', 0.44704); def('speed', 'kph|km/h|kmh|kilometers per hour|kilometres per hour', 1 / 3.6); def('speed', 'm/s|meters per second|metres per second', 1);
  def('speed', 'knot|knots', 0.514444);
  def('area', 'sq ft|square foot|square feet', 0.09290304); def('area', 'sq m|square meter|square meters|square metre|square metres|m2', 1);
  def('area', 'acre|acres', 4046.8564224); def('area', 'hectare|hectares|ha', 10000); def('area', 'sq mi|square mile|square miles', 2589988.110336);
  def('area', 'sq km|square kilometer|square kilometers|square kilometre|square kilometres|km2', 1e6);
  def('temp', 'c|celsius|centigrade|°c|degrees c|degrees celsius', 'c'); def('temp', 'f|fahrenheit|°f|degrees f|degrees fahrenheit', 'f'); def('temp', 'k|kelvin', 'k');
  const NAMES = Object.keys(U).sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'));
  const UNIT = '(' + NAMES.join('|') + ')';
  const toK = (v, u) => (u === 'c' ? v + 273.15 : u === 'f' ? (v - 32) * 5 / 9 + 273.15 : v);
  const fromK = (v, u) => (u === 'c' ? v - 273.15 : u === 'f' ? (v - 273.15) * 9 / 5 + 32 : v);
  const SHORT = { len: { m: 'meters', km: 'kilometers', cm: 'centimeters', mm: 'millimeters', mi: 'miles', ft: 'feet', in: 'inches', yd: 'yards' } };

  // ---- numbers, nicely ------------------------------------------------------------------------------------------
  function nice(v) {
    if (!isFinite(v)) return v > 0 ? 'infinity' : v < 0 ? 'minus infinity' : 'not a number';
    if (Math.abs(v) >= 1e15 || (Math.abs(v) < 1e-6 && v !== 0)) return v.toExponential(4).replace(/\.?0+e/, 'e');
    const r = Math.round(v * 1e8) / 1e8;
    return r.toLocaleString('en-US', { maximumFractionDigits: Math.abs(r) < 1 ? 6 : 4 });
  }

  // ---- words to symbols ----------------------------------------------------------------------------------------
  function tidy(s) {
    return String(s || '').toLowerCase()
      .replace(/^(hey |ok )?deuce,? /, '').replace(/^(what'?s|what is|whats|how much is|calculate|compute|work out|figure out|solve|tell me)\s+/, '').replace(/[?!=]+\s*$/, '')
      .replace(/(\d),(\d{3})\b/g, '$1$2').replace(/(\d),(\d{3})\b/g, '$1$2')
      .replace(/×|\bx\b(?=\s*[\d(])/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
      .replace(/\bsquare root of\b|\bsqrt of\b|√/g, 'sqrt ').replace(/\bcube root of\b/g, 'cbrt ')
      .replace(/\bmultiplied by\b|\btimes\b/g, '*').replace(/\bdivided by\b|\bover\b/g, '/').replace(/\bplus\b|\band\b/g, '+').replace(/\bminus\b|\btake away\b/g, '-')
      .replace(/\bto the power of\b|\braised to( the)?\b/g, '^').replace(/\bsquared\b/g, '^2').replace(/\bcubed\b/g, '^3')
      .replace(/\bpercent\b/g, '%').replace(/\bpi\b/g, 'π').replace(/\s+/g, ' ').trim();
  }

  // ---- the parser (precedence climbing) ------------------------------------------------------------------------
  const FN = { sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, ln: Math.log, log: Math.log10, exp: Math.exp,
    sin: (d) => Math.sin(d * Math.PI / 180), cos: (d) => Math.cos(d * Math.PI / 180), tan: (d) => Math.tan(d * Math.PI / 180) };
  function parse(src) {
    const toks = src.match(/\d*\.\d+|\d+|[a-z]+|π|[-+*/^%()]/g);
    if (!toks || toks.join('') !== src.replace(/\s+/g, '')) throw new Error('not maths');
    let i = 0;
    const peek = () => toks[i], next = () => toks[i++];
    function atom() {
      const t = next();
      if (t === undefined) throw new Error('ends early');
      if (t === '(') { const v = expr(); if (next() !== ')') throw new Error('bracket'); return v; }
      if (t === '-') return -factor();
      if (t === '+') return factor();
      if (t === 'π') return Math.PI;
      if (t === 'e') return Math.E;
      if (FN[t]) return FN[t](factor());
      if (/^[\d.]/.test(t)) return parseFloat(t);
      throw new Error('word ' + t);
    }
    function postfix() {
      let v = atom();
      while (peek() === '%') {
        next();
        // "15% of 80" → 0.15 * 80; "80 + 15%" → 80 * 1.15 (handled in expr); otherwise a fraction
        if (peek() === 'of') { next(); v = (v / 100) * factor(); } else v = v / 100;
      }
      if (peek() === 'of') { next(); v *= factor(); }
      return v;
    }
    function factor() {
      const b = postfix();
      if (peek() === '^') { next(); return Math.pow(b, factor()); }
      return b;
    }
    function term() {
      let v = factor();
      while (peek() === '*' || peek() === '/' || (peek() && /^[\d(π]|^[a-z]/.test(peek()) && (FN[peek()] || peek() === '(' || peek() === 'π'))) {
        const op = peek() === '*' || peek() === '/' ? next() : '*';
        const r = factor();
        v = op === '*' ? v * r : v / r;
      }
      return v;
    }
    function expr() {
      let v = term();
      while (peek() === '+' || peek() === '-') {
        const op = next(), start = i;
        let r = term();
        // "200 + 10%": ten percent of 200
        if (toks[i - 1] === '%' && toks.slice(start, i).filter((x) => x === '%').length === 1 && !toks.slice(start, i).includes('of')) r = v * r;
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    const v = expr();
    if (i < toks.length) throw new Error('leftover');
    return v;
  }

  // ---- conversions: "5 miles in km", "6 feet 2 inches in cm", "how many cups in a liter" ------------------------------
  function convert(s) {
    let m = new RegExp('^how many ' + UNIT + ' (?:are )?(?:in|is) (?:a |an |one )?(\\d*\\.?\\d+)? ?' + UNIT + '$').exec(s);
    if (m) return conv(m[2] ? parseFloat(m[2]) : 1, m[3], m[1]);
    m = new RegExp('^(?:convert )?(-?\\d*\\.?\\d+(?:e\\d+)?) ?' + UNIT + '(?: (\\d*\\.?\\d+) ?' + UNIT + ')? (?:in|to|into|as|in to) ' + UNIT + '$').exec(s);
    if (m) {
      let v = parseFloat(m[1]), from = m[2];
      if (m[3] && m[4]) { // 6 feet 2 inches: add the second in the first's units
        const a = U[from], b = U[m[4]];
        if (!a || !b || a.dim !== b.dim || a.dim === 'temp') return null;
        v += parseFloat(m[3]) * b.f / a.f;
        return conv(v, from, m[5], m[1] + ' ' + from + ' ' + m[3] + ' ' + m[4]);
      }
      return conv(v, from, m[5]);
    }
    return null;
  }
  function conv(v, from, to, said) {
    const a = U[from], b = U[to];
    if (!a || !b) return null;
    if (a.dim !== b.dim) return { ok: false, text: 'Those don\'t convert: ' + from + ' and ' + to + ' measure different things.' };
    const out = a.dim === 'temp' ? fromK(toK(v, a.f), b.f) : (v * a.f) / b.f;
    const unitWord = (u, n) => (a.dim === 'temp' ? '°' + ({ c: 'C', f: 'F', k: 'K' })[U[u].f] : u);
    const sp = a.dim === 'temp' ? '' : ' ';
    const n = a.dim === 'temp' ? (x) => nice(Math.round(x * 10) / 10) : nice;
    return { ok: true, value: out, text: (said || n(v) + sp + unitWord(from, v)) + ' is ' + n(out) + sp + unitWord(to, out) + '.' };
  }

  const Calc = {
    // anything that looks like a sum or a conversion: { ok, value, text } or null if it isn't one
    eval(input) {
      const s = tidy(input);
      if (!s) return null;
      const c = convert(s);
      if (c) return c;
      if (!/\d|π/.test(s) || !/^[\d\s.+\-*/^%()πa-z]+$/.test(s)) return null;
      if (/[a-z]{2,}/.test(s.replace(/\b(sqrt|cbrt|abs|round|floor|ceil|ln|log|exp|sin|cos|tan|of)\b/g, ''))) return null;
      try {
        const v = parse(s);
        if (typeof v !== 'number' || isNaN(v)) return null;
        return { ok: true, value: v, text: nice(v) };
      } catch (e) {
        return null;
      }
    },
    looks(input) { // a quick check, for Deuce's rules
      const s = tidy(input);
      return !!s && (!!convert(s) || (/\d/.test(s) && /[-+*/^%]|sqrt|cbrt|\bof\b/.test(s) && Calc.eval(input) !== null));
    },
    nice,
    UNITS: U,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
  else root.DeuceCalc = Calc;
})(typeof window !== 'undefined' ? window : this);
