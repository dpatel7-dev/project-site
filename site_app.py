"""
project-site: one website for every project.

    /            the front door: every project, and the one command that installs them all
    /gossip      gossip's page        /api, /install.sh, /install.ps1, /healthz  stay gossip's
    /tot         Tree of Thought      /tot/install.sh, /tot/install.ps1
    /pigeon      pigeon (the whole web app lives under here)
    /pca         Project CLI Access   /pca/install.sh, /pca/install.ps1
    /tidy        tidy                 /tidy/install.sh, /tidy/install.ps1
    /den         den                  /den/install.sh, /den/install.ps1

gossip's chat hub and pigeon's file server run inside this one program, from the
copies in apps/. Their data lives outside this folder (~/gossip-data and
~/pigeon-data), so you can delete this folder, clone it again, and lose nothing.

PythonAnywhere imports `application` from here. To try it on your own computer:

    python3 site_app.py --port 8080
"""

import glob
import html
import importlib.util
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
APPS = os.path.join(HERE, 'apps')
PAGES = os.path.join(HERE, 'pages')
HOST_RE = re.compile(r'[A-Za-z0-9.-]{1,253}(:[0-9]{1,5})?')


def _load(name, *parts):
    spec = importlib.util.spec_from_file_location(name, os.path.join(APPS, *parts))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


sys.path.insert(0, HERE)
import site_check  # noqa: E402  (the quick "are you a person?" check)
import site_shell  # noqa: E402  (the dock along the bottom of every page)

gossip = _load('gossip_hub', 'gossip', 'hub', 'gossip_hub.py')
pigeon = _load('pigeon_server', 'pigeon', 'server', 'pigeon_server.py')

PROJECTS = [
    # id, path, name, colour
    ('gossip', '/gossip', 'gossip', '#7cc4ff'),
    ('tot', '/tot', 'tree of thought|tot', '#8fd16a'),
    ('pigeon', '/pigeon', 'pigeon', '#2bc4b2'),
    ('tidy', '/tidy', 'tidy', '#e8913a'),
    ('den', '/den', 'den', '#f0843c'),
    ('scout', '/scout', 'scout', '#7c9cff'),
    ('roomy', '/roomy', 'roomy', '#ff7a59'),
    ('hey', '/hey', 'hey', '#f2c14e'),
    ('morph', '/morph', 'morph', '#d39cf5'),
    ('shoo', '/shoo', 'shoo', '#d9a877'),
    ('magpie', '/magpie', 'magpie', '#6a9be6'),
    ('medic', '/medic', 'medic', '#f6a6b8'),
    ('flash', '/flash', 'flash', '#d7f07a'),
    ('hum', '/hum', 'hum', '#f5c431'),
    ('usual', '/usual', 'usual', '#ff7a5c'),
    ('locket', '/locket', 'locket', '#ef6a1f'),
    ('pca', '/pca', 'pca', '#d9d4e8'),
]

APPS = ('gossip', 'tot', 'pigeon', 'pca', 'tidy', 'den', 'scout', 'roomy', 'hey', 'morph', 'shoo', 'magpie', 'medic', 'flash', 'hum', 'usual', 'locket')
# newest news first: the order "what's new" lists the apps in (move an app up when it changes)
NEWS_ORDER = ('locket', 'usual', 'hum', 'flash', 'medic', 'magpie', 'pigeon', 'pca', 'shoo', 'morph', 'scout', 'den', 'roomy', 'hey', 'tidy', 'tot', 'gossip')
NAMES = {'gossip': 'gossip', 'tot': 'Tree of Thought', 'pigeon': 'pigeon', 'pca': 'Project CLI Access', 'tidy': 'tidy',
         'den': 'den', 'scout': 'scout', 'roomy': 'roomy', 'hey': 'hey', 'morph': 'morph', 'shoo': 'shoo', 'magpie': 'magpie', 'medic': 'medic', 'flash': 'flash', 'hum': 'hum', 'usual': 'usual', 'locket': 'locket'}

# pages with a look all their own (they still get the dock)
OWN_LOOK = {'tot', 'tidy', 'den', 'pca'}  # (each has its own day and night colours)

_cache = {}


def _read(*parts):
    """A file from this folder, re-read only when it changes."""
    path = os.path.join(HERE, *parts)
    try:
        stamp = os.path.getmtime(path)
    except OSError:
        return None
    hit = _cache.get(path)
    if not hit or hit[0] != stamp:
        with open(path, encoding='utf-8') as f:
            hit = (stamp, f.read())
        _cache[path] = hit
    return hit[1]


def version(app):
    try:
        return json.loads(_read('apps', app, 'package.json'))['version']
    except Exception:
        return '?'


def _inline(text):
    """A line of a changelog as safe HTML: **bold**, `code` and [links](https://...)."""
    t = html.escape(text, quote=False)
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    t = re.sub(r'\[([^\]]+)\]\((https?://[^)\s]+)\)', lambda m: '<a href="%s">%s</a>' % (m.group(2).replace('"', '%22'), m.group(1)), t)
    return t


def changes(app, sections=1):
    """The newest sections of an app's changelog: [(version, intro, [points])]."""
    text = _read('apps', app, 'CHANGELOG.md') or ''
    out = []
    for block in re.split(r'^## ', text, flags=re.M)[1:sections + 1]:
        head, _, body = block.partition('\n')
        intro, points, cur = [], [], None
        for line in body.split('\n'):
            if re.match(r'^\s*- ', line) and not line.startswith('  '):
                cur = line.strip()[2:]
                points.append(cur)
            elif line.strip() and points and (line.startswith('  ') or not line.startswith('#')):
                points[-1] += ' ' + line.strip().lstrip('- ')
            elif line.strip() and not points:
                intro.append(line.strip())
        out.append((head.strip(), ' '.join(intro), points))
    return out


def _lead(point):
    """The short version of a change: its bold lead (or first sentence), as plain words."""
    m = re.match(r'^\*\*(.+?)\*\*:?\s*(.*)', point)
    if m:
        lead = m.group(1).rstrip(':').rstrip()
        rest = re.split(r'(?<=[.!?])\s+', m.group(2))[0] if len(lead) < 30 and m.group(2) else ''
        out = lead + (': ' + rest.replace('**', '') if rest else '')
        return out if len(out) <= 140 else out[:137].rsplit(' ', 1)[0] + '…'
    parts = re.split(r'(?<=[.!?])\s+', point)
    out = parts[0]
    if len(out) < 40 and len(parts) > 1:
        out += ' ' + parts[1]
    out = out.rstrip(':').rstrip()
    return out if len(out) <= 220 else out[:217].rsplit(' ', 1)[0] + '…'


def news_html(per_app=1, apps=NEWS_ORDER, points=99):
    """What's new, as HTML: one block per app, newest first."""
    blocks = []
    for app in apps:
        for ver, intro, pts in changes(app, per_app):
            if points == 1:  # the short version: the bold lead of the first point, or its first sentence or two
                pts = [_lead(p) for p in pts[:1]]
                intro = ''
            items = ''.join('<li>%s</li>' % _inline(p) for p in pts[:points])
            blocks.append('<article class="news" data-app="%s"><header><a href="/%s">%s</a> <span>%s</span></header>%s<ul>%s</ul></article>' % (
                app, app if app != 'gossip' else 'gossip', html.escape(NAMES[app]), html.escape(ver), ('<p>%s</p>' % _inline(intro)) if intro else '', items))
    return ''.join(blocks)


def origin(environ):
    """This site's own address, e.g. https://djp7.pythonanywhere.com"""
    public = os.environ.get('SITE_PUBLIC_URL', '').rstrip('/')
    if public:
        return public
    host = environ.get('HTTP_HOST') or ''
    if not HOST_RE.fullmatch(host):  # it ends up inside shell scripts, so be strict
        return ''
    secure = (environ.get('wsgi.url_scheme') == 'https' or environ.get('HTTP_X_FORWARDED_PROTO') == 'https'
              or host.endswith('.pythonanywhere.com'))
    return ('https://' if secure else 'http://') + host


# ── our own pages ──────────────────────────────────────────────────────────

def fill(page, environ, extra=None, here=''):
    o = origin(environ) or ''
    values = dict(extra or {})
    values.update({
        'origin': o,
        'host': o.split('://', 1)[-1],
        'gossip_version': version('gossip'),
        'tot_version': version('tot'),
        'pigeon_version': version('pigeon'),
        'pca_version': version('pca'),
        'tidy_version': version('tidy'),
        'den_version': version('den'),
        'scout_version': version('scout'),
        'roomy_version': version('roomy'),
        'hey_version': version('hey'),
        'morph_version': version('morph'),
        'shoo_version': version('shoo'),
        'magpie_version': version('magpie'),
        'medic_version': version('medic'),
        'flash_version': version('flash'),
        'hum_version': version('hum'),
        'usual_version': version('usual'),
        'locket_version': version('locket'),
        'art': _read('pages', 'art.js') or '',
    })
    raw = {'art'}
    if '{{apps_json}}' in page:
        values['apps_json'] = site_shell.apps_json(version, NEWS_ORDER[:3])
        values['groups_json'] = site_shell.groups_json()
        raw.update(('apps_json', 'groups_json'))
    if '{{neighbours}}' in page:
        values['neighbours'] = site_shell.neighbours(here)
        raw.add('neighbours')
    if '{{news}}' in page:
        values['news'] = news_html()
        raw.add('news')
    if '{{news_short}}' in page:
        values['news_short'] = news_html(apps=NEWS_ORDER[:4], points=1)
        raw.add('news_short')
    return re.sub(r'\{\{(\w+)\}\}', lambda m: values[m.group(1)] if m.group(1) in raw
                  else html.escape(values.get(m.group(1), m.group(0))), page)


def installer(app, kind, environ):
    text = _read('apps', app, 'install.sh' if kind == 'sh' else 'install.ps1')
    if text is None:
        return None
    o = origin(environ)
    if not o:
        return text
    var = app.upper() + '_HUB'
    if kind == 'sh':
        head, _, rest = text.partition('\n')
        return '%s\n%s="${%s:-%s}"\n%s' % (head, var, var, o, rest)
    return "if (-not $env:%s) { $env:%s = '%s' }\n%s" % (var, var, o, text)


# ── staying in step with the files after a git pull ────────────────────────
# PythonAnywhere keeps running the code it loaded until the website is reloaded,
# so after a `git pull` the old program would carry on serving the new pages (and
# an old pigeon). The first visit after a pull notices the code changed and asks
# PythonAnywhere to reload, the same as the Reload button: by touching the WSGI
# file in /var/www that points here.

CODE = [os.path.join(HERE, 'site_app.py'), os.path.join(HERE, 'site_shell.py'), os.path.join(HERE, 'site_check.py'),
        os.path.join(HERE, 'apps', 'gossip', 'hub', 'gossip_hub.py'), os.path.join(HERE, 'apps', 'pigeon', 'server', 'pigeon_server.py')]
WSGI_FILES = '/var/www/*_wsgi.py'


def _mtime(path):
    try:
        return os.path.getmtime(path)
    except OSError:
        return None


_loaded = {p: _mtime(p) for p in CODE}
_reload = {'asked': False}


def code_changed():
    """True when the code on disk is newer than the code running. Asks for a reload once."""
    if all(_mtime(p) == t for p, t in _loaded.items()):
        return False
    if not _reload['asked']:
        _reload['asked'] = True
        for wsgi in glob.glob(WSGI_FILES):
            try:
                with open(wsgi, encoding='utf-8') as f:
                    if HERE not in f.read():
                        continue
                os.utime(wsgi)
            except OSError:
                pass
    return True


NOTICE = ('<div role="status" style="position:sticky;top:0;z-index:2147483002;margin:0;padding:10px 16px;background:#f2c14e;color:#141416;'
          'font:600 15px/1.4 system-ui,-apple-system,sans-serif;text-align:center">This website was just updated and is restarting. '
          'Refresh the page in a few seconds. (Still showing this after a minute? On PythonAnywhere, open the Web tab and click Reload.)</div>')


def _noticed(page):
    """A page, with a note at the top while the new code is still starting."""
    if not code_changed():
        return page
    return re.sub(r'(<body[^>]*>)', lambda m: m.group(1) + NOTICE, page, count=1)


# ── the dispatcher ─────────────────────────────────────────────────────────

def _send(start_response, status, body, ctype='text/html; charset=utf-8'):
    data = body.encode('utf-8')
    start_response(status, [('Content-Type', ctype), ('Content-Length', str(len(data))), ('Cache-Control', 'no-store'),
                            ('X-Content-Type-Options', 'nosniff'), ('Referrer-Policy', 'strict-origin-when-cross-origin')])
    return [data]


def _docked(app, environ, start_response, here, kind):
    """Run another app; if it answers with a web page, add the dock along the bottom."""
    got = {}

    def capture(status, headers, exc_info=None):
        got['status'], got['headers'] = status, headers
        return lambda data: None  # nobody here uses write()

    body = app(environ, capture)
    headers = got['headers']
    ctype = next((v for k, v in headers if k.lower() == 'content-type'), '')
    if not ctype.startswith('text/html'):
        start_response(got['status'], headers)
        return body
    try:
        page = b''.join(body).decode('utf-8')
    finally:
        if hasattr(body, 'close'):
            body.close()
    data = _noticed(site_shell.inject(page, here, kind)).encode('utf-8')
    headers = [(k, v) for k, v in headers if k.lower() != 'content-length'] + [('Content-Length', str(len(data)))]
    start_response(got['status'], headers)
    return [data]


MASCOTS = {'gossip': 'Pebble the penguin', 'tot': 'Rowan the tree', 'pigeon': 'Coo the pigeon', 'tidy': 'Hazel the squirrel', 'den': 'Ember the fox',
           'scout': 'Pip the owl', 'roomy': 'Shelly the hermit crab', 'hey': 'Biscuit the dog', 'morph': 'Luma the jellyfish', 'shoo': 'Bramble the hedgehog',
           'magpie': 'Pica the magpie', 'medic': 'Lotl the axolotl', 'flash': 'Blink the firefly',
           'hum': 'Bumble the bumblebee', 'usual': 'Rocco the raccoon', 'locket': 'Bastion the armadillo'}


def check_page(environ, start_response, path):
    """The loading screen that checks for a person, served in place of the page (the address stays the same)."""
    c, sig, bits = site_check.challenge()
    who = site_check.mascot_for(path)
    page = fill(_read('pages', 'check.html') or '', environ, {
        'c': c, 's': sig, 'bits': str(bits), 'mascot': who,
        'mascot_label': (MASCOTS.get(who, 'A mascot') + ', while the page checks you\'re a person'),
    })
    data = page.encode('utf-8')
    start_response('200 OK', [('Content-Type', 'text/html; charset=utf-8'), ('Content-Length', str(len(data))), ('Cache-Control', 'no-store'),
                              ('X-Content-Type-Options', 'nosniff'), ('Referrer-Policy', 'strict-origin-when-cross-origin'), ('Vary', 'Cookie, Accept')])
    return [data] if environ.get('REQUEST_METHOD') != 'HEAD' else [b'']


def check_answer(environ, start_response):
    try:
        size = min(int(environ.get('CONTENT_LENGTH') or 0), 4096)
    except ValueError:
        size = 0
    ok, why = site_check.verify(environ['wsgi.input'].read(size) if size else b'')
    body = json.dumps({'ok': True} if ok else {'error': why}).encode()
    headers = [('Content-Type', 'application/json'), ('Content-Length', str(len(body))), ('Cache-Control', 'no-store')]
    if ok:
        headers.append(('Set-Cookie', site_check.pass_cookie(origin(environ).startswith('https://'))))
    start_response('200 OK' if ok else '403 Forbidden', headers)
    return [body]


def application(environ, start_response):
    path = environ.get('PATH_INFO') or '/'
    method = environ.get('REQUEST_METHOD', 'GET')

    # the quick "are you a person?" check (pages in browsers only; see site_check.py)
    if path == '/__check':
        if method != 'POST':
            return _send(start_response, '405 Method Not Allowed', 'not allowed\n', 'text/plain; charset=utf-8')
        return check_answer(environ, start_response)
    if site_check.needs_check(environ, path):
        return check_page(environ, start_response, path)

    # gossip's chat hub keeps the addresses every gossip install already knows
    if path in ('/api', '/install.sh', '/install.ps1', '/healthz', '/favicon.ico'):
        return gossip.application(environ, start_response)
    if path in ('/gossip', '/gossip/'):
        return _docked(gossip.application, dict(environ, PATH_INFO='/'), start_response, 'gossip', 'scroll')

    if path == '/pigeon' or path.startswith('/pigeon/'):
        env = dict(environ, SCRIPT_NAME=environ.get('SCRIPT_NAME', '') + '/pigeon', PATH_INFO=path[7:] or '/')
        return _docked(pigeon.application, env, start_response, 'pigeon', 'fit')

    if method not in ('GET', 'HEAD'):
        return _send(start_response, '405 Method Not Allowed', 'not allowed\n', 'text/plain; charset=utf-8')

    for app in ('tot', 'pca', 'tidy', 'den', 'scout', 'roomy', 'hey', 'morph', 'shoo', 'magpie', 'medic', 'flash', 'hum', 'usual', 'locket'):
        if path in ('/%s/install.sh' % app, '/%s/install.ps1' % app):
            text = installer(app, path.rsplit('.', 1)[1], environ)
            if text is not None:
                return _send(start_response, '200 OK', text, 'text/plain; charset=utf-8')

    pages = {'/': ('home', 'home'), '/index.html': ('home', 'home'), '/tot': ('tot', 'tot'), '/tot/': ('tot', 'tot'),
             '/pca': ('pca', 'pca'), '/pca/': ('pca', 'pca'), '/tidy': ('tidy', 'tidy'), '/tidy/': ('tidy', 'tidy'),
             '/den': ('den', 'den'), '/den/': ('den', 'den')}
    for name in ('scout', 'roomy', 'hey', 'morph', 'shoo', 'magpie', 'medic', 'flash', 'hum', 'usual', 'locket'):
        pages['/' + name] = pages['/%s/' % name] = (name, name)
    for p, name in (('/start', 'start'), ('/new', 'new')):
        pages[p] = pages[p + '/'] = (name, name)
    if path in pages:
        name, here = pages[path]
        page = _read('pages', name + '.html')
        if page is not None:
            return _send(start_response, '200 OK', _noticed(site_shell.inject(fill(page, environ, here=here), here, 'page', name not in OWN_LOOK)))
    if path == '/versions.json':  # what pca compares against to keep everything up to date
        body = json.dumps({app: version(app) for app in APPS if version(app) != '?'})
        return _send(start_response, '200 OK', body, 'application/json')
    if path == '/robots.txt':
        return _send(start_response, '200 OK', 'User-agent: *\nDisallow: /pigeon/s/\nDisallow: /pigeon/d/\nDisallow: /api\nDisallow: /__check\n', 'text/plain; charset=utf-8')
    return _send(start_response, '404 Not Found', _noticed(site_shell.inject(fill(_read('pages', '404.html') or 'not found', environ), '')))


def main(argv):
    import argparse
    from socketserver import ThreadingMixIn
    from wsgiref.simple_server import WSGIRequestHandler, WSGIServer, make_server

    ap = argparse.ArgumentParser(description='Run the whole site on this computer.')
    ap.add_argument('--port', type=int, default=int(os.environ.get('PORT', 8080)))
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--data', default=None, help='keep gossip-data and pigeon-data in here instead of your home folder')
    ap.add_argument('--quiet', action='store_true')
    args = ap.parse_args(argv)
    if args.data:
        os.environ.setdefault('GOSSIP_DATA', os.path.join(os.path.abspath(args.data), 'gossip-data'))
        os.environ.setdefault('PIGEON_DATA', os.path.join(os.path.abspath(args.data), 'pigeon-data'))
        os.environ.setdefault('SITE_DATA', os.path.join(os.path.abspath(args.data), 'site-data'))

    class Server(ThreadingMixIn, WSGIServer):
        daemon_threads = True
        allow_reuse_address = True

    class Handler(WSGIRequestHandler):
        def log_message(self, fmt, *a):
            if not args.quiet:
                WSGIRequestHandler.log_message(self, fmt, *a)

    httpd = make_server(args.host, args.port, application, server_class=Server, handler_class=Handler)
    print('project-site on http://%s:%d  (Ctrl+C to stop)' % (args.host, httpd.server_address[1]), flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main(sys.argv[1:])
