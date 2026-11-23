"""
What every page on the site shares: the dock along the bottom of the screen,
the All apps sheet it opens, and day or night.

The dock is plain links with a picture and a name under each, so it works
even before (or without) any script. The script adds the rest: icons that
grow under the pointer, a note saying what each app does, the All apps sheet
you can search by typing, and the Day / Night switch.

The mascot pictures are turned into tiny images here, from pages/art.js, so
the dock looks the same inside pigeon and gossip (whose pages don't allow
pictures to be drawn by other scripts).
"""

import base64
import html
import json
import os
import re
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
SHELL = os.path.join(HERE, 'pages', 'shell')

# Every app, in the order the dock shows them. `words` are what someone might
# type in the All apps sheet to find it.
APPS = [
    # ask and learn
    dict(id='scout', blurb='Ask anything, answered from the web', name='scout', c='#7c9cff', group='learn', line='Ask anything. It searches the web and explains the answer, with a link to every source.',
         words='ask question search web answer google research explain find out'),
    dict(id='tot', blurb='Lots of free AIs in one place', name='Tree of Thought', short='tot', c='#8fd16a', group='learn', line='Talk to lots of free AIs in one place. Ask one, or all of them at once.',
         words='ai chat chatbot gpt claude gemini models assistant tree of thought'),
    dict(id='flash', blurb='Study cards and practice tests', name='flash', c='#d7f07a', group='learn', line='Study cards that come back just before you\'d forget them, and practice tests.',
         words='study cards flashcards test exam quiz learn school homework revise memorize'),
    dict(id='den', blurb='A friendly code editor for learning', name='den', c='#f0843c', group='learn', line='A friendly code editor in your browser, with a fox who explains things.',
         words='code coding learn editor programming python javascript html ide'),
    dict(id='hey', blurb='Plain words in, Terminal commands out', name='hey', c='#f2c14e', group='learn', line='Say what you want to do in plain words and get the Terminal command.',
         words='command terminal shell help how do i'),
    # talk and share
    dict(id='gossip', blurb='Private chat, calls and files', name='gossip', c='#7cc4ff', group='talk', line='Private chat with friends: messages, calls and files only you two can read.',
         words='chat message messages friends call talk text dm'),
    dict(id='pigeon', blurb='Your own locked drive', name='pigeon', c='#2bc4b2', group='talk', line='Your own locked drive. Send files to your other computers and get files from anyone.',
         words='files drive send share upload storage transfer backup cloud'),
    # files and your mac
    dict(id='tidy', blurb='Sorts a messy folder for you', name='tidy', c='#e8913a', group='mac', line='Sorts a messy folder, like Downloads, into neat folders. Shows you first.',
         words='folder organize organise sort downloads mess messy files clean'),
    dict(id='roomy', blurb='Frees up space, safely', name='roomy', c='#ff7a59', group='mac', line='Frees up space on your computer, safely. Everything goes to the Trash first.',
         words='space disk storage full clean free up room'),
    dict(id='morph', blurb='Turns any file into any other', name='morph', c='#d39cf5', group='mac', line='Turn any file into any other: videos, songs, photos, documents and PDFs.',
         words='convert converter file video photo pdf mp3 mp4 image png jpg heic'),
    dict(id='medic', blurb='Why your Mac is slow, and the fix', name='medic', c='#f6a6b8', group='mac', line='Why your Mac is slow, hot or low on battery, in plain words, with safe fixes.',
         words='slow battery hot fix health mac fan speed'),
    dict(id='shoo', blurb='Blocks ads, YouTube\'s too', name='shoo', c='#d9a877', group='mac', line='Blocks ads, trackers and YouTube\'s ads on every site. No administrator needed.',
         words='ads adblock ad blocker youtube block trackers popups'),
    # every day
    dict(id='hum', blurb='Your music, off to one side', name='hum', c='#f5c431', group='day', line='Your music in a little panel at the side of the screen: files, links, playlists.',
         words='music songs song play playlist audio listen'),
    dict(id='magpie', blurb='Everything you copied, to paste again', name='magpie', c='#6a9be6', group='day', line='Remembers everything you copy, so you can paste something from earlier.',
         words='clipboard copy paste history copied'),
    dict(id='locket', blurb='Your passwords, filled in for you', name='locket', c='#ef6a1f', group='day', line='All your passwords, locked with one. Fills them in on websites, too.',
         words='passwords password login logins vault security keys sign in autofill'),
    dict(id='usual', blurb='Order the usual, quickly', name='usual', c='#ff7a5c', group='day', line='Order the usual: your details, who it\'s for, what to say, and who owes what.',
         words='food order restaurant pizza lunch dinner takeout delivery'),
    # the menu
    dict(id='pca', blurb='Installs and updates them all', name='pca', c='#b9a6ff', group='menu', line='The menu that installs every app here, opens them, and keeps them up to date.',
         words='install update menu all apps project cli access'),
]
GROUPS = [
    ('learn', 'Ask and learn', 'Answers from the web, lots of AIs, studying, and learning to code.'),
    ('talk', 'Talk and share', 'Messages, calls and files, kept between you and the people you choose.'),
    ('mac', 'Files and your Mac', 'Tidy folders, free up space, convert files, fix a slow Mac and block ads.'),
    ('day', 'Every day', 'Your music, what you copied, your passwords, and food.'),
    ('menu', 'One menu for all of them', 'Installs every app here, opens them, and keeps them up to date.'),
]
BY_ID = {a['id']: a for a in APPS}

# pictures for the dock's own buttons, and for pca (which has no mascot)
ICONS = {
    'home': (['.......RR.......', '......RRRR......', '.....RrrrrR.....', '....RRRRRRRR....', '...RrrrrrrrrR...', '..RRRRRRRRRRRR..',
              '.RrrrrrrrrrrrrR.', '..WWWWWWWWWWWW..', '..WbbWWWWWWWWW..', '..WbbWWWWDDWWW..', '..WWWWWWWDdWWW..', '..WWWWWWWDDWWW..',
              'gGGGGGGGGGGGGGGg'],
             {'R': '#e2574c', 'r': '#c4433a', 'W': '#f6efe2', 'b': '#7cc4ff', 'D': '#8a5a3c', 'd': '#f2c14e', 'G': '#74a85a', 'g': '#5a8a45'}),
    'all': (['AAAA.BBBB.CCCC', 'AAAA.BBBB.CCCC', 'AAAA.BBBB.CCCC', 'AAAA.BBBB.CCCC', '..............', 'DDDD.EEEE.FFFF', 'DDDD.EEEE.FFFF',
             'DDDD.EEEE.FFFF', 'DDDD.EEEE.FFFF', '..............', 'GGGG.HHHH.IIII', 'GGGG.HHHH.IIII', 'GGGG.HHHH.IIII', 'GGGG.HHHH.IIII'],
            {'A': '#7c9cff', 'B': '#8fd16a', 'C': '#f2c14e', 'D': '#2bc4b2', 'E': '#ef6a1f', 'F': '#f6a6b8', 'G': '#d39cf5', 'H': '#ff7a59', 'I': '#7cc4ff'}),
    'start': (['..PFFFFFFF......', '..PFFFFFFFFF....', '..PFFfFFFFFFF...', '..PFFFFFFFFF....', '..PFFFFFFF......', '..P.............',
               '..P.............', '..P.............', '..P.............', '..P.............', '.PPP............', 'gGGGGGGGGGGGGGGg'],
              {'P': '#8a8f99', 'F': '#8fd16a', 'f': '#f6efe2', 'G': '#74a85a', 'g': '#5a8a45'}),
    'new': (['...YY....YY...', '..Y..Y..Y..Y..', '...YYYYYYYY...', 'RRRRRRYYRRRRRR', 'RRRRRRYYRRRRRR', 'rrrrrrYYrrrrrr', '.RRRRRYYRRRRR.',
             '.RRRRRYYRRRRR.', '.RRRRRYYRRRRR.', '.RRRRRYYRRRRR.', '.rrrrrYYrrrrr.'],
            {'Y': '#f5c431', 'R': '#d39cf5', 'r': '#a879d6'}),
    'pca': (['KKKKKKKKKKKKKKKK', 'KRKYKGKKKKKKKKKK', 'KKKKKKKKKKKKKKKK', 'Kddddddddddddddk', 'Kd>dBBBBBBdddddk', 'Kddddddddddddddk',
             'KdddPPPPPPPPdddk', 'Kddddddddddddddk', 'KdddOOOOOddddddk', 'Kddddddddddddddk', 'KdddGGGGGGGddddk', 'Kddddddddddddddk', 'kkkkkkkkkkkkkkkk'],
            {'K': '#3a3d4a', 'k': '#2b2d38', 'd': '#17181f', 'R': '#ff6b6b', 'Y': '#f2c14e', 'G': '#8fd16a', '>': '#8fd16a', 'B': '#7cc4ff', 'P': '#d39cf5', 'O': '#f0843c'}),
    # the Dice die (drawn by DiceWeb's die3d.js at 16 pixels): the 1 on the left, 2 on top, 3 on the right
    'dice': (['......c.........', '.....ccbbb......', '....cccbbbbee...', '...cccccbbbee...', '..ccccccbbbbb...', '.ccceecccebbbb..', '..cceccccbbbbb..', '..cccccbaaaabb..', '..ccccbaaaaaaaa.', '...ccbaaaaaddd..', '...cbadaddaaa...', '...baddaaaaa....', '......aaaaa.....', '.........a......'],
             {'a': '#1f1f25', 'b': '#2f2f35', 'c': '#47474d', 'd': '#aaaaaa', 'e': '#e2e2e2'}),
    'find': (['..KKKK......', '.KbbbbK.....', 'KbWbbbbK....', 'KbWbbbbK....', 'KbbbbbbK....', 'KbbbbbbK....', '.KbbbbK.....', '..KKKKSS....',
              '......SSS...', '.......SSS..', '........SSS.', '.........SS.'],
             {'K': '#55555f', 'b': '#9fd3ff', 'W': '#ffffff', 'S': '#c08a4a'}),
}

_cache = {}


def _read(path):
    try:
        stamp = os.path.getmtime(path)
    except OSError:
        return ''
    hit = _cache.get(path)
    if not hit or hit[0] != stamp:
        with open(path, encoding='utf-8') as f:
            hit = (stamp, f.read())
        _cache[path] = hit
    return hit[1]


def mascots():
    text = _read(os.path.join(HERE, 'pages', 'art.js'))
    m = re.search(r'const ART = (\{.*?\});\n', text)
    try:
        return json.loads(m.group(1))['mascots'] if m else {}
    except ValueError:
        return {}


# ── little pixel pictures as PNG images ────────────────────────────────────

def _trim(grid):
    w = max(len(r) for r in grid)
    rows = [r.ljust(w, '.') for r in grid]
    cols = [x for x in range(w) if any(r[x] not in '. ' for r in rows)]
    if not cols:
        return ['.']
    rows = [r[cols[0]:cols[-1] + 1] for r in rows]
    while rows and not re.search(r'[^. ]', rows[0]):
        rows.pop(0)
    while rows and not re.search(r'[^. ]', rows[-1]):
        rows.pop()
    return rows


def _rgba(colour):
    c = (colour or '').lstrip('#')
    if len(c) in (3, 4):
        c = ''.join(ch * 2 for ch in c)
    if len(c) == 6:
        c += 'ff'
    try:
        return bytes(int(c[i:i + 2], 16) for i in (0, 2, 4, 6))
    except ValueError:
        return b'\0\0\0\0'


def _png_bytes(w, h, rows):
    """PNG bytes from rows of RGBA bytes (each row w * 4 long)."""
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    raw = b''.join(b'\0' + r for r in rows)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def _uri(data):
    return 'data:image/png;base64,' + base64.b64encode(data).decode()


def png(grid, ink):
    """A pixel picture as a PNG data address, with its width and height in pixels."""
    rows = _trim(grid)
    w, h = max(len(r) for r in rows), len(rows)
    clear = b'\0\0\0\0'
    return _uri(_png_bytes(w, h, [b''.join(_rgba(ink[ch]) if ch in ink else clear for ch in r.ljust(w, '.')) for r in rows])), w, h


def _mix(colour, other, t):
    a, b = _rgba(colour), _rgba(other)
    return bytes(round(a[i] + (b[i] - a[i]) * t) for i in range(3)) + b'\xff'


def tile(grid, ink, colour=None, size=32):
    """A square picture for a browser tab: the pixel art as big as fits, crisp, on a
    rounded tile of a pale version of the colour (or on nothing, with no colour)."""
    rows = _trim(grid)
    w, h = max(len(r) for r in rows), len(rows)
    pad = 3 if colour else 1
    scale = max(1, min((size - 2 * pad) // w, (size - 2 * pad) // h))
    canvas = [[b'\0\0\0\0'] * size for _ in range(size)]
    if colour:
        fill, edge = _mix(colour, '#ffffff', 0.62), _mix(colour, '#ffffff', 0.25)
        r = max(3, size // 5)
        for y in range(size):
            for x in range(size):
                cx = r if x < r else size - 1 - r if x > size - 1 - r else x
                cy = r if y < r else size - 1 - r if y > size - 1 - r else y
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    canvas[y][x] = edge if y >= size - max(2, size // 10) else fill
    ox, oy = (size - w * scale) // 2, (size - h * scale) // 2
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in ink:
                c = _rgba(ink[ch])
                if c[3] == 0:
                    continue
                for dy in range(scale):
                    for dx in range(scale):
                        canvas[oy + y * scale + dy][ox + x * scale + dx] = c
    return _png_bytes(size, size, [b''.join(r) for r in canvas])


# which picture each page's tab gets
TAB = {'home': ('all', None), 'start': ('start', '#8fd16a'), 'new': ('new', '#d39cf5'), '': ('scout', '#7c9cff')}


def favicon(here):
    """<link> tags for this page's tab picture: its app's mascot, or the site's own."""
    key = ('favicon', here)
    stamp = _read(os.path.join(HERE, 'pages', 'art.js'))
    hit = _cache.get(key)
    if hit and hit[0] is stamp:
        return hit[1]
    pic, colour = TAB.get(here, (here, BY_ID[here]['c'] if here in BY_ID else None))
    art = mascots().get(pic)
    grid, ink = (art['grid'], art['ink']) if art else ICONS.get(pic, ICONS['all'])
    small, big = tile(grid, ink, colour, 32), tile(grid, ink, colour or '#ffffff', 180)
    out = ('<link rel="icon" type="image/png" sizes="32x32" href="%s"><link rel="apple-touch-icon" href="%s">' % (_uri(small), _uri(big)))
    _cache[key] = (stamp, out)
    return out


def icons():
    """{id: (data address, width, height)} for every app and the dock's own buttons."""
    stamp = _read(os.path.join(HERE, 'pages', 'art.js'))
    hit = _cache.get('icons')
    if hit and hit[0] is stamp:
        return hit[1]
    out = {}
    art = mascots()
    for a in APPS:
        m = art.get(a['id'])
        if m:
            out[a['id']] = png(m['grid'], m['ink'])
    for key, (grid, ink) in ICONS.items():
        out.setdefault(key, png(grid, ink))
    _cache['icons'] = (stamp, out)
    return out


# ── the dock ───────────────────────────────────────────────────────────────

def _img(icon, cls=''):
    uri, w, h = icon
    return '<img%s src="%s" alt="" style="--w:%d;--h:%d" width="%d" height="%d">' % (
        (' class="%s"' % cls) if cls else '', uri, w, h, w * 2, h * 2)


def _item(href, label, icon, here_is, key, colour='', extra=''):
    return '<a class="dk-i%s" href="%s" data-id="%s"%s%s><span class="dk-ic">%s</span><span class="dk-l">%s</span></a>' % (
        extra, href, key, ' style="--c:%s"' % colour if colour else '', ' aria-current="page"' if here_is else '', _img(icon), html.escape(label))


def dock(here):
    ic = icons()
    parts = ['<nav class="dk" id="dk" aria-label="Every page on this site"><div class="dk-bar">',
             _item('/', 'Home', ic['home'], here == 'home', 'home', '#e2574c', ' dk-side'),
             '<a class="dk-i dk-side dk-all" href="/apps#apps" data-id="all" role="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="dk-sheet">'
             '<span class="dk-ic">%s</span><span class="dk-l">All apps</span></a>' % _img(ic['all']),
             '<span class="dk-sep" aria-hidden="true"></span><span class="dk-apps">']
    last = None
    for a in APPS:
        if a['id'] not in ic:
            continue
        if last and a['group'] != last:
            parts.append('<span class="dk-gap" aria-hidden="true"></span>')
        last = a['group']
        parts.append(_item('/' + a['id'], a.get('short', a['name']), ic[a['id']], here == a['id'], a['id'], a['c'],
                           ' dk-app' + (' dk-here' if here == a['id'] else '')))
    parts += ['</span><span class="dk-sep" aria-hidden="true"></span>',
              _item('/dice', 'Dice', ic['dice'], here == 'dice', 'dice', '#8a8a96', ' dk-side'),
              _item('/start', 'Start here', ic['start'], here == 'start', 'start', '#8fd16a', ' dk-side'),
              _item('/new', "What's new", ic['new'], here == 'new', 'new', '#d39cf5', ' dk-side dk-new'),
              '</div></nav>']
    return ''.join(parts)


def _data(here, kind):
    apps = [{k: a[k] for k in ('id', 'name', 'c', 'line', 'group', 'words')} for a in APPS]
    names = {k: v.get('name', '') for k, v in mascots().items()}
    for a in apps:
        a['mascot'] = names.get(a['id'], '')
    body = json.dumps({'apps': apps, 'groups': [g[:2] for g in GROUPS], 'here': here, 'kind': kind, 'find': icons()['find'][0]}, separators=(',', ':'))
    return body.replace('</', '<\\/')


# Day or night, set before anything is drawn. Chosen in All apps (Day or Night), or
# Auto: by the time of day. Night is from sunset to sunrise, worked out from the
# date (for about 40 degrees north, the middle of the US and Europe).
CLOCK = ("function(d){d=d||new Date();var y=d.getFullYear(),n=Math.floor((d-new Date(y,0,0))/864e5),"
         "e=23.44*Math.sin(2*Math.PI*(284+n)/365)*Math.PI/180,x=-Math.tan(0.698)*Math.tan(e),"
         "h=Math.acos(Math.max(-1,Math.min(1,x)))*12/Math.PI,"
         "s=d.getTimezoneOffset()<Math.max(new Date(y,0,1).getTimezoneOffset(),new Date(y,6,1).getTimezoneOffset())?1:0,"
         "t=d.getHours()+d.getMinutes()/60;return t<12+s-h||t>=12+s+h}")
LOOK = ("<script>(function(){var r=document.documentElement,l=null;window.djp7ClockNight=" + CLOCK + ";"
        "try{l=localStorage.getItem('djp7-look')}catch(e){}"
        "r.setAttribute('data-look',l==='light'||l==='dark'?l:(djp7ClockNight()?'dark':'light'));"
        "window.djp7Night=function(){return r.getAttribute('data-look')==='dark'}})()</script>")
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@500;700&family=Atkinson+Hyperlegible:wght@400;700&display=swap" rel="stylesheet">')


def head(styled, here=''):
    """What goes at the top of <head>: day or night before anything is drawn, the tab's picture, and the styles."""
    css = _read(os.path.join(SHELL, 'dock.css'))
    if styled:
        return LOOK + favicon(here) + FONTS + '<style>' + _read(os.path.join(SHELL, 'site.css')) + '\n' + css + '</style>'
    return LOOK + favicon(here) + '<style>' + css + '</style>'


def tail(here, kind):
    """What goes at the end of <body>: the dock, and the script that brings it to life."""
    return dock(here) + '<script>window.DOCK=' + _data(here, kind) + ';\n' + _read(os.path.join(SHELL, 'dock.js')) + '</script>'


def inject(page, here, kind='page', styled=True, dock=True):
    """Add the shell to a whole HTML page. kind: 'page' for this site's own pages;
    'scroll' for a page made by an app that keeps its own look (gossip); 'fit' for an
    app that fills the window and leaves room at the bottom by itself (pigeon).
    styled: whether the page is built on the site's shared styles (pages/shell/site.css)."""
    page = re.sub(r'<link rel="icon"[^>]*href="data:,"[^>]*>', '', page)  # an empty "no picture" placeholder (pigeon's)
    top, bottom = head(styled and kind == 'page', here), (tail(here, kind) if dock else '')
    if kind == 'fit':
        bottom = bottom.replace('<nav class="dk"', '<nav class="dk dk-onapp"', 1)
    # the shared styles go first in <head>, so a page's own styles can change them
    spot = re.search(r'<meta name="viewport"[^>]*>', page, re.I) or re.search(r'<head[^>]*>', page, re.I)
    if spot:
        page = page[:spot.end()] + top + page[spot.end():]
    else:
        bottom = top + bottom
    if re.search(r'</body>', page, re.I):
        idx = [m.start() for m in re.finditer(r'</body>', page, re.I)][-1]
        return page[:idx] + bottom + page[idx:]
    return page + bottom


def neighbours(here):
    """Links to the apps before and after this one, for the bottom of an app's page."""
    ids = [a['id'] for a in APPS]
    if here not in ids:
        return ''
    ic = icons()
    i = ids.index(here)
    out = []
    for cls, label, a in (('prev', 'Previous app', APPS[i - 1]), ('next', 'Next app', APPS[(i + 1) % len(APPS)])):
        uri, w, h = ic[a['id']]
        img = '<img class="pix" src="%s" alt="" width="%d" height="%d">' % (uri, w * 3, h * 3)
        text = '<span><small>%s</small><b>%s</b><em>%s</em></span>' % (label, html.escape(a.get('short', a['name'])), html.escape(a['line']))
        out.append('<a class="%s" href="/%s" style="--pc:%s">%s</a>' % (cls, a['id'], a['c'], img + text if cls == 'prev' else text + img))
    return '<nav class="wrap pn" aria-label="More apps">%s</nav>' % ''.join(out)


def apps_json(version, fresh=()):
    """Every app for the home page: what it is, its version, and whether it's new."""
    names = {k: v.get('name', '') for k, v in mascots().items()}
    out = []
    for a in APPS:
        x = {k: a[k] for k in ('id', 'name', 'c', 'line', 'blurb', 'group', 'words')}
        x.update(short=a.get('short', a['name']), v=version(a['id']), mascot=names.get(a['id'], ''), fresh=a['id'] in fresh)
        if a['id'] not in names:
            x['icon'] = icons()[a['id']][0]
        out.append(x)
    return json.dumps(out, separators=(',', ':')).replace('</', '<\\/')


def groups_json():
    return json.dumps(GROUPS, separators=(',', ':')).replace('</', '<\\/')
