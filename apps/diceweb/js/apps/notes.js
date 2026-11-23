// Notes: quick notes, saved as you type. Each one is a file in ~/notes.
(function () {
  'use strict';
  const D = window.Dice, L = D.L, esc = D.esc, h = D.h;

  D.register({ id: 'notes', mount(root, ctx) {
    root.classList.add('notes');
    root.innerHTML = '<aside class="no-side"><div class="no-head"><h2 class="pix">Notes</h2><button class="b small" data-nav data-key="no:new">' + D.glyph('plus', 2) + 'New</button></div><div class="no-list" data-scroll="20"></div></aside>' +
      '<section class="no-page"><input class="no-title" data-nav data-key="no:title" aria-label="Title" maxlength="60"><textarea class="no-text" data-key="no:text" aria-label="Note" placeholder="Write something…"></textarea><div class="no-foot"><span class="muted no-saved"></span><button class="b small danger" data-nav data-key="no:del">' + D.glyph('trash', 2) + 'Delete</button></div></section>';
    const list = root.querySelector('.no-list'), title = root.querySelector('.no-title'), text = root.querySelector('.no-text'), saved = root.querySelector('.no-saved');
    const dir = () => D.home() + '/notes';
    function folder() { let n = L.walk(D.state.disk, dir()); if (!n) { L.makeDir(D.state.disk, dir()); n = L.walk(D.state.disk, dir()); } return n; }
    let cur = null, saveT = null;
    function names() { const f = folder(); return Object.keys(f.kids).filter((k) => f.kids[k].type === 'file').sort((a, b) => f.kids[b].t - f.kids[a].t); }
    function render() {
      const f = folder();
      list.innerHTML = '';
      const ns = names();
      if (!ns.length) list.innerHTML = '<p class="muted" style="padding:8px 12px">No notes. Press New to start one.</p>';
      ns.forEach((n) => {
        const node = f.kids[n];
        const b = h('<button class="qrow ' + (n === cur ? 'on' : '') + '" data-nav data-key="no:' + esc(n) + '"><span><b>' + esc(n.replace(/\.txt$/, '')) + '</b><span>' + esc((node.text.split('\n').find((l) => l.trim()) || 'Empty').slice(0, 60)) + '</span></span><small class="muted">' + D.ago(node.t) + '</small></button>');
        b.onclick = () => { open(n); text.focus(); };
        list.appendChild(b);
      });
    }
    function open(n) {
      cur = n;
      const node = n ? folder().kids[n] : null;
      title.value = n ? n.replace(/\.txt$/, '') : '';
      text.value = node ? node.text : '';
      title.disabled = text.disabled = !n;
      root.querySelector('[data-key="no:del"]').disabled = !n;
      saved.textContent = node ? 'Saved ' + D.ago(node.t) : '';
      render();
      ctx.setTitle(n ? n.replace(/\.txt$/, '') + ' – Notes' : 'Notes');
    }
    function unique(base) { const f = folder(); let n = base + '.txt', i = 2; while (f.kids[n]) n = base + ' ' + (i++) + '.txt'; return n; }
    function create() {
      const n = unique('Note');
      L.writeFile(D.state.disk, dir() + '/' + n, '');
      D.save(); open(n);
      title.focus(); title.select();
    }
    function save() {
      if (!cur) return;
      const f = folder();
      const want = (title.value.trim().replace(/[/\\]/g, '-') || 'Untitled') + '.txt';
      if (want !== cur && !f.kids[want]) { f.kids[want] = f.kids[cur]; delete f.kids[cur]; cur = want; }
      f.kids[cur].text = text.value; f.kids[cur].t = Date.now();
      D.save();
      saved.textContent = 'Saved';
      if (text.value.trim().length > 3) ctx.achieve('note');
      ctx.setTitle(cur.replace(/\.txt$/, '') + ' – Notes');
      const row = list.querySelector('.qrow.on');
      if (row) { row.querySelector('b').textContent = cur.replace(/\.txt$/, ''); row.querySelector('span span').textContent = (text.value.split('\n').find((l) => l.trim()) || 'Empty').slice(0, 60); row.dataset.key = 'no:' + cur; }
    }
    const later = () => { saved.textContent = 'Saving…'; clearTimeout(saveT); saveT = setTimeout(save, 350); };
    title.addEventListener('input', later); text.addEventListener('input', later);
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); text.focus(); } }, true);
    root.querySelector('[data-key="no:new"]').onclick = create;
    root.querySelector('[data-key="no:del"]').onclick = () => {
      if (!cur) return;
      D.ask({ title: 'Delete "' + cur.replace(/\.txt$/, '') + '"?', text: 'It can\'t be brought back.', buttons: [{ label: 'Delete', value: true, go: true, danger: true }, { label: 'Keep it', value: false }] })
        .then((ok) => { if (!ok) return; L.remove(D.state.disk, dir() + '/' + cur); D.save(); const ns = names(); open(ns[0] || null); });
    };
    const offDisk = D.on('disk', () => { if (!L.walk(D.state.disk, dir() + '/' + cur)) open(names()[0] || null); else render(); });
    open(names()[0] || null);
    setTimeout(() => { const first = list.querySelector('[data-nav]') || root.querySelector('[data-key="no:new"]'); if (ctx.mode === 'run') D.nav.focus(first); }, 40);
    ctx.legend([['a', 'Open'], ['b', 'Home']]);
    return {
      onAction(a) {
        // Esc while writing goes back to the list instead of leaving
        if (a === 'b' && (document.activeElement === text || document.activeElement === title)) {
          document.activeElement.blur();
          const row = list.querySelector('.qrow.on') || list.querySelector('[data-nav]');
          if (row) D.nav.focus(row);
          return true;
        }
        return false;
      },
      unmount() { clearTimeout(saveT); save(); offDisk(); },
    };
  } });
})();
