// A few things for every day, on the desktop and on DiceTV:
// - The lock screen (Super + L): a big clock over a blurred screen. With a PIN, it takes the
//   PIN, typed or picked with a remote; without one, any key opens it. It keeps people off
//   your screen; it isn't a password for the computer itself.
// - Emoji and symbols (Super + . or Ctrl + Alt + .): pick one and it goes where you were
//   typing (or is copied). The Dice Bar finds them too: type a colon, like ":heart".
// - Finding files by name, for the Dice Bar (your home folder on DiceOS, the pretend disk here).
(function () {
  'use strict';
  const D = window.Dice, L = D.L, h = D.h, esc = D.esc, S = D.S;
  const X = D.extras = {};
  const te = new TextEncoder();
  const isField = (el) => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(range|checkbox|radio|button|submit|file|color)$/i.test(el.type)) || el.isContentEditable);

  // ---- the lock screen --------------------------------------------------------------------------------
  const hashPin = async (pin) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode('dice-pin:' + pin)))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  X.hasPin = () => !!D.state.pin;
  X.setPin = async function (pin) { D.set('pin', pin ? await hashPin(pin) : null); };
  const lk = { on: false, el: null, typed: '', wrong: 0, waitUntil: 0, t: 0 };
  X.locked = () => lk.on;
  function build() {
    lk.el = h('<div id="lock" class="navtrap" hidden role="dialog" aria-label="Locked"><div class="lk-in"><b class="lk-time"></b><span class="lk-date"></span><span class="lk-note"></span>' +
      '<div class="lk-pin" hidden><div class="lk-dots" aria-live="polite"></div><div class="lk-pad">' +
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map((k) => '<button data-nav data-key="lk:' + k + '" class="lk-k' + (k === 'ok' ? ' go' : '') + '">' + (k === 'del' ? '⌫' : k === 'ok' ? 'OK' : k) + '</button>').join('') +
      '</div><p class="lk-msg"></p></div><p class="lk-hint"></p></div></div>');
    lk.el.querySelectorAll('.lk-k').forEach((b) => { b.onclick = () => key(b.dataset.key.slice(3)); });
    lk.el.addEventListener('pointerdown', (e) => { if (!X.hasPin() && !e.target.closest('.lk-k')) X.unlock(); });
    document.body.appendChild(lk.el);
  }
  function paint() {
    const now = new Date();
    lk.el.querySelector('.lk-time').textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '');
    lk.el.querySelector('.lk-date').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    const n = D.unread ? D.unread() : 0;
    lk.el.querySelector('.lk-note').textContent = n ? n + (n === 1 ? ' notification' : ' notifications') : '';
    const pin = X.hasPin();
    lk.el.querySelector('.lk-pin').hidden = !pin;
    lk.el.querySelector('.lk-dots').innerHTML = pin ? Array.from({ length: Math.max(4, lk.typed.length) }, (_, i) => '<i' + (i < lk.typed.length ? ' class="on"' : '') + '></i>').join('') : '';
    const wait = Math.ceil((lk.waitUntil - Date.now()) / 1000);
    lk.el.querySelector('.lk-msg').textContent = wait > 0 ? 'Too many tries. Wait ' + wait + ' seconds.' : lk.msg || '';
    lk.el.querySelector('.lk-hint').innerHTML = pin ? 'Type your PIN, or pick the numbers' : 'Press any key to unlock';
  }
  D.lock = function () {
    if (lk.on) return;
    if (!lk.el) build();
    D.menu && D.menu.close(true); D.qam && D.qam.close(true);
    if (D.remote && D.remote.osk && D.remote.osk.open) D.remote.osk.close(false);
    lk.on = true; lk.typed = ''; lk.msg = '';
    lk.el.hidden = false; requestAnimationFrame(() => lk.el.classList.add('on'));
    paint();
    clearInterval(lk.t); lk.t = setInterval(paint, 1000);
    if (X.hasPin()) setTimeout(() => D.nav.focus(lk.el.querySelector('[data-key="lk:1"]'), { scroll: false }), 30);
    S.play('sleep');
  };
  X.unlock = function () {
    if (!lk.on) return;
    lk.on = false; clearInterval(lk.t);
    lk.el.classList.remove('on');
    setTimeout(() => { if (!lk.on) lk.el.hidden = true; }, 260);
    S.play('wake');
    if (D.nav.el && lk.el.contains(D.nav.el)) D.nav.first();
  };
  async function key(k) {
    if (!X.hasPin()) return X.unlock();
    if (Date.now() < lk.waitUntil) return paint();
    lk.msg = '';
    if (k === 'del') lk.typed = lk.typed.slice(0, -1);
    else if (k === 'ok') {
      if (!lk.typed) return;
      if ((await hashPin(lk.typed)) === D.state.pin) { lk.wrong = 0; lk.typed = ''; return X.unlock(); }
      lk.wrong++; lk.typed = '';
      lk.msg = 'That isn\'t it. Try again.';
      if (lk.wrong >= 5) { lk.wrong = 0; lk.waitUntil = Date.now() + 30000; }
      const pad = lk.el.querySelector('.lk-pin'); pad.classList.remove('shake'); void pad.offsetWidth; pad.classList.add('shake');
      S.play('error');
    } else if (/^\d$/.test(k) && lk.typed.length < 8) { lk.typed += k; S.play('move'); }
    paint();
  }
  // while it's locked, keys and buttons go to the lock and nowhere else
  D.keyFirst.push((e) => {
    if (!lk.on) return false;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!X.hasPin()) { X.unlock(); return true; }
    if (/^\d$/.test(e.key)) key(e.key);
    else if (e.key === 'Backspace') key('del');
    else if (e.key === 'Enter') { if (lk.typed) key('ok'); else D.nav.press(); }
    else if (e.key === 'Escape') { lk.typed = ''; paint(); }
    else if (e.key.startsWith('Arrow')) D.nav.move(e.key.slice(5).toLowerCase());
    return true;
  });
  const fire0 = D.input.fire;
  D.input.fire = function (a, src) {
    if (!lk.on) return fire0.call(D.input, a, src);
    if (!X.hasPin()) return X.unlock();
    if (['up', 'down', 'left', 'right'].includes(a)) D.nav.move(a);
    else if (a === 'a') D.nav.press();
    else if (a === 'b' || a === 'x') key('del');
    else if (/^d\d$/.test(a)) key(a[1]);
  };
  // lock when waking up, if you'd like
  const wake0 = D.wake;
  D.wake = function () { const was = D.asleep; const r = wake0.apply(D, arguments); if (was && D.state.lockWake && X.hasPin()) D.lock(); return r; };

  // ---- emoji and symbols --------------------------------------------------------------------------------
  const EMOJI = {
    Faces: '😀 grin smile happy|😃 smile big|😄 laugh smile|😁 grin teeth|😆 laugh lol|😅 sweat nervous|😂 tears joy lol|🤣 rofl laugh|🙂 slight smile|😉 wink|😊 blush happy|😇 halo angel|🥰 love hearts|😍 heart eyes love|🤩 star struck wow|😘 kiss|😋 yum tasty|😛 tongue|😜 wink tongue silly|🤪 zany crazy|🤓 nerd glasses|😎 cool sunglasses|🥳 party|🤔 thinking hmm|🤨 raised eyebrow|😐 neutral|😑 expressionless|😶 no mouth|🙄 eye roll|😏 smirk|😬 grimace awkward|😌 relieved|😔 pensive sad|😪 sleepy|😴 sleep zzz|😷 mask sick|🤒 thermometer sick|🤧 sneeze|🥵 hot|🥶 cold freezing|😵 dizzy|🤯 mind blown|🤠 cowboy|😕 confused|😟 worried|🙁 frown|😮 wow open mouth|😲 astonished|😳 flushed|🥺 pleading puppy eyes|😢 cry sad tear|😭 sob crying|😱 scream fear|😖 confounded|😣 persevere|😞 disappointed|😤 huff triumph|😡 angry mad|🤬 swearing|😈 devil|💀 skull dead|👻 ghost|👽 alien|🤖 robot|💩 poop|😺 cat smile',
    Hands: '👍 thumbs up yes ok like|👎 thumbs down no|👌 ok perfect|✌️ peace victory|🤞 fingers crossed luck|🤟 love you|🤘 rock horns|👋 wave hi hello bye|🤙 call me|👏 clap|🙌 raise hands hooray|👐 open hands|🤲 palms|🙏 pray please thanks|✍️ write|💪 strong muscle flex|👀 eyes look|🧠 brain smart|👂 ear listen|👉 point right|👈 point left|👆 point up|👇 point down|✋ hand stop high five|🤝 handshake deal|🫶 heart hands',
    Hearts: '❤️ red heart love|🧡 orange heart|💛 yellow heart|💚 green heart|💙 blue heart|💜 purple heart|🖤 black heart|🤍 white heart|🤎 brown heart|💔 broken heart|❣️ heart exclamation|💕 two hearts|💞 revolving hearts|💓 beating heart|💗 growing heart|💖 sparkling heart|💘 cupid arrow|💝 gift heart|💯 hundred 100|✨ sparkles|⭐ star|🌟 glowing star|💫 dizzy star|🔥 fire lit|💥 boom|💤 zzz sleep|💬 speech chat|💭 thought',
    Animals: '🐶 dog puppy|🐱 cat kitten|🐭 mouse|🐹 hamster|🐰 rabbit bunny|🦊 fox|🐻 bear|🐼 panda|🐨 koala|🐯 tiger|🦁 lion|🐮 cow|🐷 pig|🐸 frog|🐵 monkey|🐔 chicken|🐧 penguin|🐦 bird|🦆 duck|🦉 owl|🦄 unicorn|🐝 bee|🦋 butterfly|🐢 turtle|🐍 snake|🐙 octopus|🐠 fish tropical|🐬 dolphin|🐳 whale|🦈 shark|🐊 crocodile|🦒 giraffe|🐘 elephant|🦖 dinosaur t-rex|🌵 cactus|🌲 tree|🌸 blossom flower|🌻 sunflower|🍀 clover luck|🍁 maple leaf autumn',
    Food: '🍎 apple|🍌 banana|🍉 watermelon|🍇 grapes|🍓 strawberry|🍑 peach|🍍 pineapple|🥑 avocado|🥕 carrot|🌽 corn|🍞 bread|🧀 cheese|🍳 egg cooking|🥞 pancakes|🍔 burger|🍟 fries|🍕 pizza|🌭 hot dog|🌮 taco|🌯 burrito|🍜 noodles ramen|🍣 sushi|🍛 curry|🍚 rice|🥟 dumpling|🍦 ice cream|🍩 donut|🍪 cookie|🎂 birthday cake|🍰 cake|🍫 chocolate|🍿 popcorn|☕ coffee|🍵 tea|🧋 bubble tea boba|🥤 drink soda|🧃 juice',
    Things: '⚽ soccer football|🏀 basketball|🏈 american football|⚾ baseball|🎾 tennis|🏐 volleyball|🎮 game controller|🕹️ joystick|🎲 die dice|♟️ chess|🎯 target|🎨 art paint|🎬 movie film|🎧 headphones music|🎤 microphone sing|🎸 guitar|🎹 piano keyboard|🥁 drum|🏆 trophy win|🥇 gold medal first|🎉 party tada|🎁 gift present|🎈 balloon|📱 phone|💻 laptop computer|🖥️ desktop computer|⌨️ keyboard|🖱️ mouse|📺 tv television|📷 camera|💡 idea bulb|🔋 battery|🔌 plug|📚 books study|📖 book read|✏️ pencil|📝 memo note|📌 pin|📎 paperclip|📅 calendar date|⏰ alarm clock|⌛ hourglass|🔒 lock|🔑 key|🔨 hammer|🛠️ tools|🧪 test tube science|🔭 telescope|🚀 rocket launch|✈️ plane travel|🚗 car|🚲 bike|🏠 house home|🏫 school|🌍 earth world|🌙 moon night|☀️ sun|🌈 rainbow|⛄ snowman|❄️ snowflake|🌧️ rain|⚡ lightning zap',
    Symbols: '✅ check yes done|❌ cross no wrong|❗ exclamation|❓ question|⚠️ warning|🚫 no forbidden|➕ plus|➖ minus|✖️ times multiply|➗ divide|♾️ infinity|💲 dollar|© copyright|® registered|™ trademark|° degree|± plus minus|≈ about approximately|≠ not equal|≤ less or equal|≥ greater or equal|÷ divide|× times|√ square root|π pi|∞ infinity|→ arrow right|← arrow left|↑ arrow up|↓ arrow down|↔ arrows|⇒ implies|• bullet|… ellipsis dots|— em dash|– en dash|« quote|» quote|€ euro|£ pound|¥ yen|¢ cent|§ section|¶ paragraph|♪ note music|♥ heart suit|★ star solid|☆ star outline|☑ ballot box check|☐ box empty',
  };
  const ALL = [];
  Object.entries(EMOJI).forEach(([cat, s]) => s.split('|').forEach((x) => { const i = x.indexOf(' '); ALL.push({ e: x.slice(0, i), words: x.slice(i + 1), cat }); }));
  X.emojiFind = (q) => {
    q = String(q || '').toLowerCase().replace(/^:/, '').trim();
    if (!q) return ALL.slice(0, 12);
    return ALL.filter((x) => x.words.split(' ').some((w) => w.startsWith(q)) || x.words.includes(q));
  };
  let em = null, emTarget = null, emSel = null, emCat = 'Faces';
  X.put = function (text, target) {
    const f = target && target.isConnected ? target : null;
    const recent = (D.state.emojiRecent || []).filter((x) => x !== text); recent.unshift(text); D.state.emojiRecent = recent.slice(0, 16); D.save();
    if (f && isField(f)) {
      f.focus();
      try { if (f.isContentEditable) document.execCommand('insertText', false, text); else { f.setRangeText(text, f.selectionStart, f.selectionEnd, 'end'); f.dispatchEvent(new Event('input', { bubbles: true })); } } catch (e) { f.value += text; }
      return true;
    }
    if (D.copy) D.copy(text); else if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
    D.toast({ icon: 'copy', c: '#e5b62e', title: text + ' copied', text: 'Paste it anywhere.' });
    return false;
  };
  function emPaint() {
    const q = em.querySelector('input').value, list = q ? X.emojiFind(q) : emCat === 'Recent' ? (D.state.emojiRecent || []).map((e) => ({ e, words: '' })) : ALL.filter((x) => x.cat === emCat);
    em.querySelectorAll('.em-tabs button').forEach((b) => b.setAttribute('aria-pressed', !q && b.dataset.c === emCat));
    em.querySelector('.em-grid').innerHTML = list.length ? list.slice(0, 120).map((x, i) => '<button data-nav data-key="em:' + i + '" title="' + esc(x.words) + '">' + esc(x.e) + '</button>').join('') : '<p class="muted">Nothing called that. Try another word.</p>';
    em.querySelectorAll('.em-grid button').forEach((b, i) => { b.onclick = () => { const t = emTarget; X.closeEmoji(); X.put(list[i].e, t); }; });
  }
  X.emoji = function (target) {
    if (em) return X.closeEmoji();
    emTarget = target || (isField(document.activeElement) ? document.activeElement : null);
    emSel = D.nav.el;
    em = h('<div id="emoji" class="glass navtrap" role="dialog" aria-label="Emoji and symbols"><input type="search" data-nav data-key="em:q" placeholder="Search emoji and symbols" aria-label="Search emoji and symbols" spellcheck="false"><div class="em-tabs" role="group">' +
      ['Recent'].concat(Object.keys(EMOJI)).map((c) => '<button data-nav data-key="em:t:' + c + '" data-c="' + c + '">' + esc(c) + '</button>').join('') + '</div><div class="em-grid"></div></div>');
    document.body.appendChild(em);
    if ((D.state.emojiRecent || []).length) emCat = 'Recent';
    em.querySelectorAll('.em-tabs button').forEach((b) => { b.onclick = () => { emCat = b.dataset.c; em.querySelector('input').value = ''; emPaint(); }; });
    const inp = em.querySelector('input');
    inp.addEventListener('input', emPaint);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); X.closeEmoji(); }
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); const b = em.querySelector('.em-grid button'); if (b) b.click(); }
    });
    emPaint();
    setTimeout(() => { inp.focus(); D.nav.focus(inp, { scroll: false }); }, 20);
  };
  X.closeEmoji = function () {
    if (!em) return;
    em.remove(); em = null;
    if (emSel && emSel.isConnected) D.nav.focus(emSel, { scroll: false });
  };
  addEventListener('keydown', (e) => {
    if (e.key === '.' && (e.metaKey || (e.ctrlKey && e.altKey))) { e.preventDefault(); X.emoji(); }
    else if (em && e.key === 'Escape') { e.preventDefault(); X.closeEmoji(); }
  }, true);
  const fire1 = D.input.fire;
  D.input.fire = function (a, src) {
    if (!em || lk.on) return fire1.call(D.input, a, src);
    if (a === 'b') return X.closeEmoji();
    if (['up', 'down', 'left', 'right'].includes(a)) return D.nav.move(a);
    if (a === 'a') return D.nav.press();
  };
  addEventListener('pointerdown', (e) => { if (em && !em.contains(e.target)) X.closeEmoji(); }, true);

  // ---- finding files by name --------------------------------------------------------------------------
  // (for the Dice Bar) real files on DiceOS, the pretend disk in a browser
  X.findFiles = async function (q) {
    q = String(q || '').trim().toLowerCase();
    if (q.length < 2) return [];
    if (D.sys && !(D.sys.info && D.sys.info.emulated)) {
      const r = await D.sys.get('/api/find?q=' + encodeURIComponent(q)).catch(() => null);
      return (r && r.items) || [];
    }
    const words = q.split(/\s+/), home = D.home(), out = [];
    const walk = (node, path, depth) => {
      Object.entries(node.kids || {}).forEach(([name, kid]) => {
        if (name.startsWith('.')) return;
        const full = path + '/' + name, low = name.toLowerCase();
        if (words.every((w) => low.includes(w))) out.push({ name, path: '~' + full.slice(home.length), dir: kid.type === 'dir', score: (low.startsWith(words[0]) ? 0 : 1) * 100 + depth });
        if (kid.type === 'dir' && depth < 6) walk(kid, full, depth + 1);
      });
    };
    const root = L.walk(D.state.disk, home);
    if (root) walk(root, home, 0);
    return out.sort((a, b) => a.score - b.score).slice(0, 20);
  };
  X.openFile = function (f) {
    const open = (id, arg) => (D.desk && D.desk.on ? D.desk.open(id, { arg }) : D.launch(id, { arg }));
    if (f.dir) return open('files', f.path);
    if (/\.(txt|md|js|json|py|sh|html?|css|csv|log|conf|cfg|ini|ya?ml)$/i.test(f.name) && D.app('code')) return open('code', f.path);
    return open('files', f.path.replace(/\/[^/]*$/, '') || '~');
  };
})();
