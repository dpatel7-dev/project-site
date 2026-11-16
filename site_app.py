"""
project-site: one website for every project.

    /            the front door: every project, and the one command that installs them all
    /gossip      gossip's page        /api, /install.sh, /install.ps1, /healthz  stay gossip's
    /tot         Tree of Thought      /tot/install.sh, /tot/install.ps1
    /pigeon      pigeon (the whole web app lives under here)
    /pca         Project CLI Access   /pca/install.sh, /pca/install.ps1

gossip's chat hub and pigeon's file server run inside this one program, from the
copies in apps/. Their data lives outside this folder (~/gossip-data and
~/pigeon-data), so you can delete this folder, clone it again, and lose nothing.

PythonAnywhere imports `application` from here. To try it on your own computer:

    python3 site_app.py --port 8080
"""

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


gossip = _load('gossip_hub', 'gossip', 'hub', 'gossip_hub.py')
pigeon = _load('pigeon_server', 'pigeon', 'server', 'pigeon_server.py')

PROJECTS = [
    # id, path, name, colour
    ('gossip', '/gossip', 'gossip', '#7cc4ff'),
    ('tot', '/tot', 'tree of thought|tot', '#8fd16a'),
    ('pigeon', '/pigeon', 'pigeon', '#2bc4b2'),
    ('pca', '/pca', 'pca', '#d9d4e8'),
]

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


# ── the bar across the top of every page ───────────────────────────────────

NAV_CSS = """<style>
.psnav,.psnav *{all:unset;box-sizing:border-box}
.psnav{display:flex;align-items:center;gap:4px;min-height:40px;padding:0 max(12px,env(safe-area-inset-left));background:#17151d;color:#bdb8cb;
  font:500 14px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-x:auto;white-space:nowrap;position:relative;z-index:50;scrollbar-width:none}
.psnav::-webkit-scrollbar{display:none}
.psnav a{display:inline-flex;align-items:center;gap:7px;padding:8px 10px;border-radius:6px;color:#bdb8cb;cursor:pointer;text-decoration:none}
.psnav a:hover{color:#fff;background:#25222e}
.psnav a:focus-visible{outline:2px solid #fff;outline-offset:-2px}
.psnav .psnav-home{font-weight:700;color:#fff;margin-right:auto;letter-spacing:.02em}
.psnav .psnav-dot{width:8px;height:8px;background:var(--c);display:inline-block}
.psnav a[aria-current=page]{color:#fff;box-shadow:inset 0 -2px 0 var(--c)}
.psnav .psnav-short{display:none}
@media (max-width:520px){.psnav{gap:0}.psnav a{padding:8px 7px;gap:6px}.psnav .psnav-full{display:none}.psnav .psnav-short{display:inline}}
</style>"""


def _label(name):
    full, _, short = name.partition('|')
    if not short:
        return full
    return '<span class="psnav-full">%s</span><span class="psnav-short">%s</span>' % (full, short)


def nav(here):
    links = ''.join(
        '<a href="%s" style="--c:%s"%s><span class="psnav-dot"></span>%s</a>'
        % (path, colour, ' aria-current="page"' if pid == here else '', _label(name))
        for pid, path, name, colour in PROJECTS)
    return NAV_CSS + '<nav class="psnav" aria-label="Projects"><a class="psnav-home" href="/"%s>djp7</a>%s</nav>' % (
        ' aria-current="page" style="--c:#fff"' if here == 'home' else '', links)


def with_nav(page, here):
    return re.sub(r'(<body[^>]*>)', lambda m: m.group(1) + nav(here), page, count=1)


# ── our own pages ──────────────────────────────────────────────────────────

def fill(page, environ):
    o = origin(environ) or ''
    values = {
        'origin': o,
        'host': o.split('://', 1)[-1],
        'gossip_version': version('gossip'),
        'tot_version': version('tot'),
        'pigeon_version': version('pigeon'),
        'pca_version': version('pca'),
        'art': _read('pages', 'art.js') or '',
    }
    return re.sub(r'\{\{(\w+)\}\}', lambda m: values[m.group(1)] if m.group(1) == 'art'
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


# ── the dispatcher ─────────────────────────────────────────────────────────

def _send(start_response, status, body, ctype='text/html; charset=utf-8'):
    data = body.encode('utf-8')
    start_response(status, [('Content-Type', ctype), ('Content-Length', str(len(data))), ('Cache-Control', 'no-store'),
                            ('X-Content-Type-Options', 'nosniff'), ('Referrer-Policy', 'strict-origin-when-cross-origin')])
    return [data]


def _navved(app, environ, start_response, here):
    """Run another app; if it answers with a web page, add the bar across the top."""
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
    data = with_nav(page, here).encode('utf-8')
    headers = [(k, v) for k, v in headers if k.lower() != 'content-length'] + [('Content-Length', str(len(data)))]
    start_response(got['status'], headers)
    return [data]


def application(environ, start_response):
    path = environ.get('PATH_INFO') or '/'
    method = environ.get('REQUEST_METHOD', 'GET')

    # gossip's chat hub keeps the addresses every gossip install already knows
    if path in ('/api', '/install.sh', '/install.ps1', '/healthz', '/favicon.ico'):
        return gossip.application(environ, start_response)
    if path in ('/gossip', '/gossip/'):
        return _navved(gossip.application, dict(environ, PATH_INFO='/'), start_response, 'gossip')

    if path == '/pigeon' or path.startswith('/pigeon/'):
        env = dict(environ, SCRIPT_NAME=environ.get('SCRIPT_NAME', '') + '/pigeon', PATH_INFO=path[7:] or '/')
        return _navved(pigeon.application, env, start_response, 'pigeon')

    if method not in ('GET', 'HEAD'):
        return _send(start_response, '405 Method Not Allowed', 'not allowed\n', 'text/plain; charset=utf-8')

    for app in ('tot', 'pca'):
        if path in ('/%s/install.sh' % app, '/%s/install.ps1' % app):
            text = installer(app, path.rsplit('.', 1)[1], environ)
            if text is not None:
                return _send(start_response, '200 OK', text, 'text/plain; charset=utf-8')

    pages = {'/': ('home', 'home'), '/index.html': ('home', 'home'), '/tot': ('tot', 'tot'), '/tot/': ('tot', 'tot'),
             '/pca': ('pca', 'pca'), '/pca/': ('pca', 'pca')}
    if path in pages:
        name, here = pages[path]
        page = _read('pages', name + '.html')
        if page is not None:
            return _send(start_response, '200 OK', with_nav(fill(page, environ), here))
    if path == '/robots.txt':
        return _send(start_response, '200 OK', 'User-agent: *\nDisallow: /pigeon/s/\nDisallow: /api\n', 'text/plain; charset=utf-8')
    return _send(start_response, '404 Not Found', with_nav(_read('pages', '404.html') or 'not found', ''))


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
