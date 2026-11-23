// Pixel art shared by the pages: the mascots and Tree of Thought's plants.
// The data line is refreshed by tools/sync.py from the projects themselves.
const ART = {"mascots":{"gossip":{"name":"Pebble","color":"#7cc4ff","grid":["..........................","...........BBBB...........",".........BBBBBBBB.........","........BBBBBBBBBB........",".......BBWWWBBWWWBB.......",".......BWWEWWWWEWWB.......",".......BWWWWOOWWWWB.......",".......BBWWWooWWWBB.......","........RRRRRRRRRR........",".......BBrRWWWWWWBB.......","......BBBRRWWWWWWBBB......",".....BBB.RWWWWWWW.BBB.....",".....BB..WWWWWWWW..BB.....",".........BWWWWWWB.........",".........BBwwwwBB.........","........OOOBBBBOOO........",".......OOOO....OOOO......."],"ink":{"B":"#567ab0","D":"#3a5480","W":"#f4f7fc","w":"#d6deeb","O":"#ffb048","o":"#e48a34","E":"#1a1e2a","R":"#ff707a","r":"#d45262"}},"tot":{"name":"Rowan","color":"#8fd16a","grid":["..........................","..........LLLL............","........LLHHLLLL..........",".......LHHLLLLLLL.........","......LLHLLLLLLLLl........",".....LLLLLLLLLLLLLl.......",".....LLLLLLLLLLLLll.......","....LLLLLLLLLLLLLLll......","....lLLLLLLLLLLLLLll......",".....lLLLLLLLLLLLll.......","......llLLTTTTLLll........","........lTTTTTTl..........",".........TETTET...........",".........TTmmTT...........",".........TTTTtT...........","........TTTttTTT..........","...GgGGTTTGGGGTTTGgG......"],"ink":{"L":"#8fd16a","l":"#618e48","H":"#b6e19e","T":"#b88a62","t":"#816145","E":"#1b1410","m":"#654c36","G":"#7ab25a","g":"#567d40"}},"pigeon":{"name":"Coo","color":"#2bc4b2","grid":["..........................","..........................","..............GGG.........",".............GGGGG........",".............GEKGGB.......",".............GGGGGBB......","............NnNGG.........","...........NnNnN..........","......GGGGGNnNnG..........",".....GGWWWWGGGGGG.........","....TGWWWWWWGGGGG.........","...TTGGWWWWWWGGGG.........","...TTTGGGGGGGGGG..........","......TTGGGGGGG...........","..........F..F............",".........FF.FF............",".........................."],"ink":{"G":"#8f9aab","W":"#c8d0dc","N":"#22b3a2","n":"#8a5cf6","E":"#ff8a3d","K":"#151a22","B":"#4a505c","F":"#ff8a3d","T":"#56606f"}},"tidy":{"name":"Hazel","color":"#e8913a","grid":["..........................","..........................","......TTTT................",".....TTTTTT.....oO.oO.....","....TTTooTTT....OOOOOO....","....TTo..oTT...OOOOOOO....","....TTo...TT...OOEOOON....",".....To...TT..OOOOOOOO....","......o..TTT..OOCCOOO.....","........TTT..OOCCCC.......",".......TTT.OOOOCCCaA......","......TTT.OOOOOCCaaaA.....","......TT.OOOOOOCCaaaA.....","......TT.OOOOOOOCCaa......",".......TTOOOOOOOOCC.......","........toOOOoo.oOOo......",".......tttoo....ooo......."],"ink":{"O":"#d9823b","o":"#a2581f","T":"#eda865","t":"#c97a35","C":"#f3e0c2","E":"#1b1410","N":"#3a2418","A":"#6e4a2c","a":"#c99a58"}},"den":{"name":"Ember","color":"#f0843c","grid":["..........................","....K...............K.....","....KK.............KK.....","....KWK...........KWK.....","....OWWO.........OWWO.....","...OOOOOOOOOOOOOOOOOOO....","...OOOOWEOOOOOOOWEOOOO....","...WWOOEEOOOOOOOEEOOWW....","....WWWOOOOOOOOOOOWWW.....",".....WWWWWWWWWWWWWWW......",".......WWWWWNWWWWW........",".........WWWWWWW....OOo...","........OOWWWWWOO..OOOWW..",".......OOOOWWWWWOOOOOOWWW.",".......OOOOOWWWOOOOOOWWWW.",".......oOOOOOOOOOOOOOWWW..","........KKK.oOOOo.KKKoW..."],"ink":{"O":"#f0843c","o":"#c4602a","W":"#f6ead8","E":"#1b1410","N":"#2a1a12","K":"#4a2c1c"}},"scout":{"name":"Pip","color":"#7c9cff","grid":["..........................",".......D..........D.......",".......DD........DD.......",".......DBBBBBBBBBBD.......","......DBWWWWBBWWWWBD......","......DWYYYWBBWYYYWD......","......DWYKYWBBWYKYWD......","......DWYYYWOOWYYYWD......","......DBWWWBOOBWWWBD......","......DBBCCCCCCCCBBD......",".....DBBCBCCBCCBCCBBD.....",".....DBBCCCCCCCCCCBBD.....",".....DBBCCBCCBCCBCBBD.....","......DBBCCCCCCCCBBD......",".......DBBBBBBBBBBD.......","........FF......FF........",".........................."],"ink":{"D":"#4a2f1f","B":"#8a5a3c","W":"#f3e6cc","Y":"#f2b632","K":"#1b1410","O":"#e8792b","C":"#e2c391","F":"#e8792b"}},"roomy":{"name":"Shelly","color":"#ff7a59","grid":["..........................","..........................","..........................","......K...K...............","......R...R....SSSSS......","......R...R...SSsssSS.....",".......R.R...SSsSSSsSS....","....CC..RR..SSsSsssSsS....","...CCCC.RRRRSSsSsSSsSS....","....CCRRRRRRSSsSSssSSS....",".....CRRRRRRRSSsssSSS.....","......RRRRRRRRSSSSSS......","......R.R.R.R.............",".....R..R..R..R...........","..........................","..........................",".........................."],"ink":{"K":"#1b1410","R":"#e5553b","C":"#f07a52","S":"#e3c08f","s":"#9a6a44"}},"hey":{"name":"Biscuit","color":"#f2c14e","grid":["..........................",".......BBBBBBBBBBBB.......",".......BBBBBBBBBBBB.......",".....EEBBBBBBBBBBBBEE.....",".....EEBBBBBBBBBBBBEE.....","...EEEEBBKKBBBBKKBBEEEE...","...EEEEBBKKBBBBKKBBEEEE...","...EEEEBBBBBBBBBBBBEEEE...","...EEEEBBBBBBBBBBBBEEEE...","...EE..BBWWNNNNWWBB..EE...","...EE..BBWWNNNNWWBB..EE...",".......BBWWWWWWWWBB.......",".......BBWWWWWWWWBB.......",".........WWPPPPWW.........",".........WWPPPPWW.........","...........PPPP...........","...........PPPP..........."],"ink":{"E":"#8a5a2b","B":"#d9a05b","K":"#1b1410","N":"#1b1410","W":"#f6e7cf","P":"#f08a9a"}},"morph":{"name":"Luma","color":"#d39cf5","grid":["..........................",".........bbbbbbbb.........",".......bbBBBBBBBBbb.......","......bBBBBBBBBBBBBb......",".....bBHHBBBBBBBBBBBb.....",".....bBHBBBBBBBBBBBBb.....","....bBBBBBBBBBBBBBBBBb....","....bBBBEEBBBBBBEEBBBb....","...bBBBBEEBBBBBBEEBBBBb...","...bBBPPBBBBMMBBBBPPBBb...","...bBBBBBBBBBBBBBBBBBBb...","...bb.bb.bb.bb.bb.bb.bb...","....T..T..AA..AA..T..T....","...T....T.AA..AA.T....T...","....T..T.AA....AA.T..T....",".....T.T..AA..AA..T.T.....","....t...t.aa..aa.t...t...."],"ink":{"B":"#e6e0ff","b":"#b9a8f2","H":"#ffffff","E":"#1b1430","M":"#1b1430","P":"#ff9cc8","A":"#f29ad6","a":"#c96fb0","T":"#8fd4f2","t":"#5aa9d9"}},"shoo":{"name":"Bramble","color":"#d9a877","grid":["..........................","..........................",".........k...k............","......k.kSk.kSk.k.........",".....kSkSSSkSSSkSk........","...k.SSSSsSSSSsSSSk.......","..kSSSsSSSSSsSSSSSSk......",".kSSsSSSSsSSSSSsSSSSFf....",".SSSSSSsSSSSsSSSSSSFFFFf..","kSsSSSSSSSSSSSSsSSFFEHFFf.","SSSSSsSSSsSSSSSSSSFFEEFFFN","SSsSSSSSSSSSsSSSSFFFFFFFFN",".SSSSSSsSSSSSSSSFFPPFFFFf.","..fFFFFFFFFFFFFFFFFFFFFf..","...fFFFFFFFFFFFFFFFFFff...","....LL..LL.......LL..LL...",".........................."],"ink":{"S":"#5e4030","s":"#7d5a40","k":"#b08a64","F":"#f2dcb8","f":"#dcbc90","E":"#1d1410","N":"#2a1a14","P":"#f2a0a6","L":"#a8784e","H":"#ffffff"}},"magpie":{"name":"Pica","color":"#6a9be6","grid":["..........................","...................kkk....","..................kKKKk...",".................kKKEKKk..",".................KKKKKKYYY",".................KKKKKKk..","................kKKKKKk...","...............kKKKKWW....","............kBBbKKWWWWW...","..........kBBbbWWBWWWWW...","........kBBBBBWWWBBWWWw...",".....GGkBBBBBBBBBBWWWw....","...gGGGGkkKKKKKKKKKww.....",".gGGG..........L..L.......","gGG............L..L.......","g.............LL.LL.......",".........................."],"ink":{"K":"#2a3042","k":"#6a7694","W":"#f7f7f4","w":"#c9ced6","B":"#2f62b8","b":"#6a9be6","G":"#1f7f78","g":"#45bfae","E":"#ffffff","L":"#4a505c","Y":"#59606e"}},"medic":{"name":"Lotl","color":"#f6a6b8","grid":["..........................","..........r...............","...........R..r...........","..........rR.R..r.........","............RR.R.R........","..............RRQPPPPP....","........rRRRRRQPPPPPPPP...","..............QPPPPPPPEPP.","............rRQPPPPPPPPPP.","....f......r.QPPPPPPPPMMP.","..ffFf......QPPPPPPPPPPPP.",".fFFFPPPPPPPPPPPPpppppppQ.","fFFPPPPPPPPPPPPpppppppQQ..",".fFFQQPPPPPPPPPPPPPPQQ....","..ff..QQLLQQQQQQLLQ.......",".......LL......LL.........","......LL......LL.........."],"ink":{"P":"#f6a6b8","p":"#ffd3dd","Q":"#e5859c","R":"#d84a7a","r":"#f27aa6","E":"#1d1416","e":"#ffffff","M":"#b8506c","F":"#fbc4d1","f":"#e98aa5","L":"#e5859c"}},"flash":{"name":"Blink","color":"#d7f07a","grid":["..........................","............www...........","...........wwWww..www.....","..........wwWWWwwwWww.....","..........wWWWWwWWWw......","...........wwWWWWWw.....a.","............oOOOOOOO...a..",".....g.....oOOOOOOOORKKa..","...g..YYYYOOOOOOOOOORKKKa.","..g..YYGGYYOOOOOOOORRKEK..","...g.YYGGYYdddddddddKKK...","..g..yYYYYyddddddddd......",".......yyy..l..l..l.......","....g......l..l..l........","..........................","..........................",".........................."],"ink":{"O":"#7a6646","o":"#9a8460","K":"#4d453a","R":"#d9553b","Y":"#e8f25c","y":"#c9e03a","G":"#f6ff9a","g":"#d7f07a","W":"#b7c9d9","w":"#e3edf5","E":"#ffffff","a":"#8f7c5a","l":"#8f7c5a","d":"#a8926a"}},"hum":{"name":"Bumble","color":"#f5c431","grid":["..........................",".........ww....ww.........","........wWWw..wWWw........","........wWWWwwWWWw........",".........wWWWWWWw.....a...","..........wwKwww.....a....",".......YYYYKKYYYKKk.a.....",".....YYYYYYKKYYYKKKkkk....","....yYYYYYYKKYYYKKKkkEk...","...KyYYYYYYKKYYYKKKkkkk...","....yYYYYYYKKYYYKKKkkkk...",".....yyYYYYKKYYYKKKkkk....",".......yyyyKKyyyKKk.......","..........l..l..l.........",".........l..l..l..........","..........................",".........................."],"ink":{"Y":"#f5c431","y":"#d99e17","K":"#4a4038","k":"#5c5046","E":"#ffffff","W":"#eef6fc","w":"#a9c7df","a":"#6e6153","l":"#6e6153"}},"usual":{"name":"Rocco","color":"#ff7a5c","grid":["..........................","...................g....g.","..................gGg..gGg","..................GGGGGGGG",".................WGGGGGGGW",".................WKKKgKKKW",".................KKeKgKeKK",".................WWWWgWWWN","..TT..............WWWWWWW.",".TttT...........GGGGGGG...",".TTTT.........GGGGGGGGGG..","..tttt......GGGGGGGGGGGG..","...TTTT...GGGGGgggGGGGGG..","....tttGGGGGGgggggGGGG....","......TGGGGGGgggggGGGG....","........GGGGGGGGGGGGG.....",".........KK..KK...KK......"],"ink":{"G":"#8a8f99","g":"#c3c7ce","W":"#f4f4f2","K":"#3d4149","e":"#ffffff","N":"#4a4f58","T":"#5a5f69","t":"#c3c7ce"}},"locket":{"name":"Bastion","color":"#ef6a1f","grid":["..........................","..........................","..........................",".....................k....",".........kkkk.......kEk...","......kkkaabokkk....kEEk..","....kkoobaaboobakk..kEEk..","...krroobaaboobayykkHHHk..","..krrroobaaboobayyykHeHHk.","..krrroobaaboobayyykHHHHHk",".kTkkkkkkkkkkkkkkkkkkHHHHn","kTkkHHk.kHHk.kHHkkHHkkkkkk","Tk.kHHk.kHHk.kHHkkHHk.....","....kk...kk...kk..kk......","..........................","..........................",".........................."],"ink":{"k":"#6b5446","y":"#ffd23f","a":"#ffae1a","o":"#ff8a1f","b":"#c4541a","r":"#f2541b","H":"#e8b89a","E":"#d48f72","e":"#1a1310","n":"#1a1310","t":"#c9885a","T":"#e0a07c"}}},"plants":{"maple":{"about":"maple leaf","ink":{"O":"#ee8a3c","o":"#bf5d22","s":"#7a5232"},"grid":[".O..O.","OOOOOO","OOoOOO",".OOOO.","..OO..","..s..."]},"fern":{"about":"fern","ink":{"G":"#68c07a","g":"#3e8a52"},"grid":["...G..","..GgG.",".GgGgG","GgGgG.",".GgG..","..g..."]},"tulip":{"about":"tulip","ink":{"R":"#ee5d72","r":"#b93a52","S":"#5aa354"},"grid":[".R.R.R",".RRRRR",".RRrRR","..RRR.","S..S..",".SSS.."]},"lotus":{"about":"lotus","ink":{"P":"#f4a3c8","p":"#d26a9d","W":"#5fa9c4"},"grid":["..PP..",".pPPp.","PpPPpP",".PPPP.","WWWWWW",".WWWW."]},"cactus":{"about":"cactus","ink":{"C":"#5fae74","c":"#3d7f52","F":"#f6a9c6","D":"#c58a55"},"grid":["..F...","C.CC..","CcCC.C",".CCcCC","..CC..",".DDDD."]},"mushroom":{"about":"mushroom","ink":{"M":"#e0574f","w":"#f6efe4","s":"#e6d8c2"},"grid":[".MMMM.","MwMMwM","MMMMMM","..ss..","..ss..",".ssss."]},"lavender":{"about":"lavender","ink":{"V":"#a487dd","v":"#7b5fb5","S":"#6f9a5e"},"grid":["V..V..","vV.vV.","Vv.Vv.",".S..S.",".S.S..","..S..."]},"bamboo":{"about":"bamboo","ink":{"B":"#97c95f","b":"#5f8f3a","L":"#b8e07a"},"grid":[".B..LL",".BL...","bb.B..",".B.B..",".B.bb.",".B.B.."]},"pine":{"about":"pine","ink":{"N":"#4f9a6c","n":"#2f6a4a","T":"#8a6040"},"grid":["..NN..",".NnNN.","..NN..",".NNnN.","NnNNNN","..TT.."]},"moonflower":{"about":"moonflower","ink":{"W":"#f3efff","w":"#cfc6f0","Y":"#f2d16b","S":"#6f9a5e"},"grid":[".W.W..","WwYwW.",".WwW..",".W.W..","..S...",".SS..."]},"sunflower":{"about":"sunflower","ink":{"Y":"#f6c945","y":"#d99a1e","B":"#6b4423","S":"#6f9a5e"},"grid":[".YYY..","YyByY.","YBBBY.",".YyY..","..S.S.","..SS.."]},"acorn":{"about":"acorn","ink":{"A":"#c08850","a":"#8a5a30","c":"#6b4a2e"},"grid":["...c..",".cccc.","cccccc",".AAAA.",".AaAA.","..AA.."]},"rose":{"about":"rose","ink":{"R":"#d64560","r":"#9e2a42","S":"#5aa354"},"grid":[".RRR..","RrRrR.",".RRR..","..S.S.",".SS...","..S..."]},"clover":{"about":"four-leaf clover (Auto: free, and lucky)","ink":{"C":"#4fc16b","c":"#2f8a46","s":"#6a8a3a"},"grid":[".CC.CC","CCcCCc",".cCCc.","CCcCCc",".CC.CC","...s.."]},"sprout":{"about":"sprout","ink":{"G":"#8fd16a","g":"#5c9c45","s":"#9a7350"},"grid":["......","GG..GG",".GgGg.","..g...","..g...",".ssss."]}}};
function drawPixels(canvas, grid, ink, scale) {
  const w = Math.max(...grid.map((r) => r.length));
  canvas.width = w * scale;
  canvas.height = grid.length * scale;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  grid.forEach((row, y) => [...row].forEach((ch, x) => {
    const c = ink[ch];
    if (!c) return;
    g.fillStyle = c;
    g.fillRect(x * scale, y * scale, scale, scale);
  }));
  return canvas;
}
function trimGrid(grid) {
  // drop empty columns on both sides so pictures centre properly
  const filled = (x) => grid.some((r) => r[x] && r[x] !== '.' && r[x] !== ' ');
  const w = Math.max(...grid.map((r) => r.length));
  let a = 0, b = w - 1;
  while (a < b && !filled(a)) a++;
  while (b > a && !filled(b)) b--;
  const rows = grid.map((r) => r.padEnd(w, '.').slice(a, b + 1));
  while (rows.length && !/[^. ]/.test(rows[0])) rows.shift();
  while (rows.length && !/[^. ]/.test(rows[rows.length - 1])) rows.pop();
  return rows;
}

// Mix two colours like "#ff7a59": t = 0 gives a, t = 1 gives b.
function mixHex(a, b, t) {
  const p = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
  const x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
// A sky in flat bands from `top` to `low`, with a checkerboard of the next
// colour where two bands meet, the way pixel artists blend.
function skyBands(g, W, H, top, low, bands) {
  const bh = H / bands;
  for (let y = 0; y < H; y++) {
    const k = Math.min(bands - 1, Math.floor(y / bh));
    const left = (k + 1) * bh - y;
    const here = mixHex(top, low, k / (bands - 1));
    g.fillStyle = here;
    g.fillRect(0, y, W, 1);
    if (k >= bands - 1 || left > 2) continue;
    g.fillStyle = mixHex(top, low, (k + 1) / (bands - 1));
    for (let x = 0; x < W; x++) if (left <= 1 ? (x + y) % 2 === 0 : (x % 2 === 0 && y % 2 === 0)) g.fillRect(x, y, 1, 1);
  }
}
// A smooth sky from `top` to `low`: each row of pixels a little lighter than the one above.
function skyGradient(g, W, H, top, low) {
  for (let y = 0; y < H; y++) { g.fillStyle = mixHex(top, low, H > 1 ? y / (H - 1) : 0); g.fillRect(0, y, W, 1); }
}
function isNight() { return typeof djp7Night === 'function' ? djp7Night() : matchMedia('(prefers-color-scheme: dark)').matches; }

// An app's own little world: a sky in its colour, the ground, and its mascot
// standing on it. Sun and clouds by day; moon and stars at night.
function drawStage(stage, id) {
  const m = ART.mascots[id];
  if (!stage || !m) return;
  const bg = stage.querySelector('.stage-bg');
  const who = stage.querySelector('.stage-who');
  const c = (getComputedStyle(stage).getPropertyValue('--c') || m.color).trim();
  const rnd = (x, y) => { const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - Math.floor(v); };
  function paint() {
    const night = isNight();
    const W = stage.clientWidth, H = stage.clientHeight;
    if (!W) return;
    const cell = Math.max(5, Math.round(W / 52));
    const cols = Math.ceil(W / cell), rows = Math.ceil(H / cell);
    bg.width = cols; bg.height = rows;
    bg.style.width = cols * cell + 'px'; bg.style.height = rows * cell + 'px';
    const g = bg.getContext('2d');
    const top = night ? mixHex(c, '#000000', 0.9) : mixHex(c, '#ffffff', 0.62);
    const low = night ? mixHex(c, '#000000', 0.72) : mixHex(c, '#ffffff', 0.86);
    const ground = Math.round(rows * 0.79);
    skyGradient(g, cols, ground, top, low);
    if (night) {
      for (let y = 1; y < ground * 0.7; y++) for (let x = 0; x < cols; x++) {
        const r = rnd(x * 3.1, y * 1.7);
        if (r > 0.99) { g.fillStyle = r > 0.997 ? '#fff6c8' : '#ffffff'; g.globalAlpha = 0.45 + (r - 0.99) * 55; g.fillRect(x, y, 1, 1); }
      }
      g.globalAlpha = 1;
      const mx = Math.round(cols * 0.76), my = Math.round(rows * 0.2), R = 4;
      for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
        if (x * x + y * y > R * R + 2) continue;
        if ((x + 2.2) * (x + 2.2) + (y + 1.2) * (y + 1.2) < 11) continue; // the bite out of the moon
        g.fillStyle = '#f6f0d8'; g.fillRect(mx + x, my + y, 1, 1);
      }
    } else {
      const sx = Math.round(cols * 0.78), sy = Math.round(rows * 0.2), R = 3;
      for (let y = -R - 1; y <= R + 1; y++) for (let x = -R - 1; x <= R + 1; x++) {
        const d = x * x + y * y;
        if (d <= R * R + 1) { g.fillStyle = '#ffd96b'; g.fillRect(sx + x, sy + y, 1, 1); }
        else if (d <= (R + 1) * (R + 1) + 1) { g.fillStyle = 'rgba(255,230,150,.55)'; g.fillRect(sx + x, sy + y, 1, 1); }
      }
      const CLOUD = ['...WWW....', '.WWWWWWW.W', 'WWWWWWWWWW', '.wwwwwwww.'];
      [[0.08, 0.13], [0.42, 0.06]].forEach(([fx, fy]) => CLOUD.forEach((row, r) => [...row].forEach((ch, k) => {
        if (ch === '.') return;
        g.fillStyle = ch === 'W' ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.6)';
        g.fillRect(Math.round(cols * fx) + k, Math.round(rows * fy) + r, 1, 1);
      })));
    }
    // the ground: a light edge, then the app's colour with darker flecks
    const turf = night ? mixHex(c, '#000000', 0.42) : c;
    const deep = night ? mixHex(c, '#000000', 0.62) : mixHex(c, '#000000', 0.22);
    const edge = night ? mixHex(c, '#000000', 0.25) : mixHex(c, '#ffffff', 0.35);
    for (let y = ground; y < rows; y++) for (let x = 0; x < cols; x++) {
      const fleck = (x * 7 + y * 13) % 19 === 0 || (y - ground > 2 && (x * 3 + y * 5) % 17 === 0);
      g.fillStyle = y === ground ? edge : (fleck ? deep : turf);
      g.fillRect(x, y, 1, 1);
    }
    for (let x = 0; x < cols; x++) if (rnd(x, 7) < 0.18) { g.fillStyle = edge; g.fillRect(x, ground - 1, 1, 1); }
    // the mascot, as big as fits, standing on the ground with a shadow under it
    const grid = trimGrid(m.grid);
    const gw = Math.max(...grid.map((r) => r.length));
    const scale = Math.max(3, Math.min(Math.floor((W * 0.5) / gw), Math.floor((H * 0.46) / grid.length)));
    drawPixels(who, grid, m.ink, scale);
    who.style.bottom = (H - ground * cell - scale * 0.5) + 'px';
    const half = Math.ceil((gw * scale) / cell / 2.4), cx = Math.round(cols / 2);
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.fillRect(cx - half, ground, half * 2, 1);
    g.fillRect(cx - half + 1, ground + 1, half * 2 - 2, 1);
  }
  paint();
  addEventListener('resize', paint);
  addEventListener('djp7look', paint);
}

// "Get it": the Mac / Windows switch and the Copy button, for one app's install command.
function setupGet(app) {
  const ORIGIN = location.origin;
  const cmds = { sh: 'curl -fsSL ' + ORIGIN + '/' + app + '/install.sh | sh', ps1: 'irm ' + ORIGIN + '/' + app + '/install.ps1 | iex' };
  const cmd = document.getElementById('cmd');
  function pick(os) {
    if (cmd) cmd.textContent = cmds[os];
    document.querySelectorAll('.where').forEach((w) => { w.textContent = os === 'sh' ? 'Terminal' : 'PowerShell'; });
    document.querySelectorAll('.os button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.os === os)));
  }
  document.querySelectorAll('.os button').forEach((b) => b.addEventListener('click', () => pick(b.dataset.os)));
  pick(/Win/.test(navigator.platform || navigator.userAgent) ? 'ps1' : 'sh');
  const copy = document.getElementById('copy');
  if (copy) copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(cmd.textContent); } catch (e) {
      const r = document.createRange(); r.selectNodeContents(cmd); getSelection().removeAllRanges(); getSelection().addRange(r);
    }
    copy.textContent = 'Copied';
    setTimeout(() => { copy.textContent = 'Copy'; }, 1600);
  });
}
