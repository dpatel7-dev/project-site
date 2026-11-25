// Photos: your pictures, big. On DiceOS, everything in Pictures (screenshots
// and sketches too) and on USB sticks; anywhere else, pictures you open. A
// slideshow drifts through them slowly, for the TV. Postcards from the worlds
// are there from the start, so it's never empty.
(function () {
  'use strict';
  const D = window.Dice, h = D.h, esc = D.esc;
  const IMG = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;
  const opened = []; // pictures opened this time, in a browser: {name, url}
  let cards = null;
  function postcards() {
    if (cards) return cards;
    cards = [];
    if (!D.channels) return cards;
    ['w:mountains', 'w:beach', 'fish', 'aurora', 'c:santorini', 'w:autumn', 'space', 'c:london'].forEach((id) => {
      const W = 320, H = 200, c = D.G.canvas(W, H), s = D.channels.make(id, W, H);
      try { for (let i = 0; i < 3; i++) s.draw(c.getContext('2d'), 2 + i * 0.4); } catch (e) { return; }
      const big = D.G.canvas(W * 4, H * 4), bg = big.getContext('2d');
      bg.imageSmoothingEnabled = false; bg.drawImage(c, 0, 0, W * 4, H * 4);
      cards.push({ name: 'Postcard: ' + D.channels.find(id).name, url: big.toDataURL('image/png'), card: true });
    });
    return cards;
  }
  async function realPictures() {
    if (!D.sys || D.sys.info.emulated) return [];
    const out = [];
    for (const dir of ['~/Pictures', '~/Pictures/Screenshots', '~/Pictures/Sketches']) {
      try {
        const r = await D.sys.get('/api/files?path=' + encodeURIComponent(dir));
        (r.items || []).filter((it) => !it.dir && IMG.test(it.name)).forEach((it) => out.push({ name: it.name, path: dir + '/' + it.name, t: it.mtime }));
      } catch (e) { /* no such folder */ }
    }
    return out.sort((a, b) => b.t - a.t);
  }
  // your photos in Dice Cloud: a small picture for the grid, the whole photo when it's opened
  const cloudPictures = () => (D.drive && D.drive.on() ? D.drive.photos().map((f) => ({ name: f.name, cloud: f.id, t: f.mod })) : []);
  const urlOf = async (p) => (p.url ? p.url : p.cloud ? D.drive.url(p.cloud) : (p.url = URL.createObjectURL(await D.sys.blob(p.path))));
  const thumbOf = async (p) => (p.cloud ? (await D.drive.thumbUrl(p.cloud)) || urlOf(p) : urlOf(p));

  D.register({ id: 'photos', mount(root, ctx) {
    root.classList.add('pho');
    root.innerHTML = '<div class="pho-grid-wrap"><header class="pho-head"><h2 class="pix">Photos</h2><span class="muted pho-count"></span><button class="b small" data-nav data-key="ph:open">' + D.glyph('plus', 2) + 'Open pictures</button><button class="b small go" data-nav data-key="ph:show">' + D.glyph('play', 2) + 'Slideshow</button></header><div class="pho-grid" data-row></div></div>' +
      '<div class="pho-view" hidden><img alt=""><div class="pho-cap glass"></div></div>';
    const grid = root.querySelector('.pho-grid'), view = root.querySelector('.pho-view'), img = view.querySelector('img'), cap = view.querySelector('.pho-cap');
    let list = [], at = 0, show = 0, capT = 0;
    const pick = h('<input type="file" accept="image/*" multiple hidden>');
    root.appendChild(pick);
    pick.onchange = () => { [...pick.files].forEach((f) => opened.unshift({ name: f.name, url: URL.createObjectURL(f) })); pick.value = ''; fill(); };
    root.querySelector('[data-key="ph:open"]').onclick = () => (D.sys && !D.sys.info.emulated ? D.launch('files', { arg: '~/Pictures' }) : pick.click());
    root.querySelector('[data-key="ph:show"]').onclick = () => { if (list.length) { open(0); slideshow(true); } };
    async function fill() {
      list = opened.concat(cloudPictures(), await realPictures(), postcards());
      root.querySelector('.pho-count').textContent = list.length + (list.length === 1 ? ' picture' : ' pictures');
      grid.innerHTML = '';
      list.forEach((p, i) => {
        const b = h('<button class="pho-t" data-nav data-key="ph:' + i + '" aria-label="' + esc(p.name) + '"><span class="pho-name">' + esc(p.name.replace(/^Postcard: /, '')) + '</span></button>');
        thumbOf(p).then((u) => { b.style.backgroundImage = 'url("' + u + '")'; }).catch(() => {});
        if (p.cloud) b.classList.add('pho-cloud');
        b.onclick = () => open(i);
        grid.appendChild(b);
      });
      if (want) { const i = list.findIndex((p) => p.cloud === want); want = null; if (i >= 0) return open(i); }
      if (ctx.mode === 'run') setTimeout(() => D.nav.first(root), 30);
    }
    let want = String(ctx.arg || '').startsWith('cloud:') ? String(ctx.arg).slice(6) : null;
    async function open(i) {
      at = (i + list.length) % list.length;
      const p = list[at];
      view.hidden = false; root.classList.add('viewing');
      img.classList.remove('kb'); void img.offsetWidth;
      if (p.cloud) { cap.innerHTML = '<b>' + esc(p.name) + '</b><span>From Dice Cloud…</span>'; cap.classList.add('on'); img.src = (await D.drive.thumbUrl(p.cloud)) || ''; }
      const u = await urlOf(p).catch(() => null);
      if (list[at] !== p) return; // moved on while it came
      if (u) img.src = u;
      if (show) img.classList.add('kb');
      cap.innerHTML = '<b>' + esc(p.name) + '</b><span>' + (at + 1) + ' of ' + list.length + (p.cloud ? ' · in Dice Cloud' : '') + (show ? ' · slideshow' : '') + '</span>';
      cap.classList.add('on'); clearTimeout(capT); capT = setTimeout(() => cap.classList.remove('on'), 2600);
      ctx.setTitle(p.name + ' · Photos');
    }
    function close() { view.hidden = true; root.classList.remove('viewing'); slideshow(false); ctx.setTitle('Photos'); D.nav.focus(grid.querySelector('[data-key="ph:' + at + '"]')); }
    function slideshow(on) { clearInterval(show); show = 0; if (on) show = setInterval(() => open(at + 1), 7000); }
    view.addEventListener('click', (e) => { const x = e.clientX / innerWidth; if (x < 0.25) open(at - 1); else if (x > 0.75) open(at + 1); else close(); });
    fill();
    let ft = 0;
    const offDrive = D.on('drive', () => { clearTimeout(ft); ft = setTimeout(() => { if (root.isConnected && view.hidden) fill(); }, 400); });
    ctx.legend([['a', 'Open'], ['x', 'Slideshow'], ['b', 'Back']]);
    return {
      onAction(a) {
        if (view.hidden) { if (a === 'x') { root.querySelector('[data-key="ph:show"]').click(); return true; } return false; }
        if (a === 'left' || a === 'lb' || a === 'prev') { slideshow(false); open(at - 1); return true; }
        if (a === 'right' || a === 'rb' || a === 'next') { slideshow(false); open(at + 1); return true; }
        if (a === 'a' || a === 'x' || a === 'play') { slideshow(!show); open(at); return true; }
        if (a === 'b') { close(); return true; }
        return true;
      },
      unmount() { slideshow(false); clearTimeout(capT); clearTimeout(ft); offDrive(); },
    };
  } });
})();
