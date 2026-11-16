#!/usr/bin/env python3
"""pigeon's server: a place to keep files and pass them between your devices.

It only ever sees locked bytes: names, contents and keys are encrypted on your
device before they're sent (see src/crypto.js and web/index.html). What it
knows: your nest's name, how big each file is, and when it arrived.

Runs anywhere Python 3.8+ runs, with nothing to install:

    python3 server/pigeon_server.py --port 8080        # try it on your computer
    from pigeon_server import application               # WSGI (PythonAnywhere)

Settings: ~/pigeon-data/config.json (or PIGEON_* environment variables)
    "signups":     "first" (default: only until the first nest exists), "open", or "closed"
    "quota_mb":    400     total space for all files (PythonAnywhere's free plan has 512 MB)
    "max_file_mb": 400     the biggest single file
    "public_url":  ""      the site's address, if it can't be worked out
"""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import sqlite3
import sys
import threading
import time

REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHUNK = 4 * 1024 * 1024
MAX_PIECE = CHUNK + 64
NEST_RE = re.compile(r'^[a-z0-9][a-z0-9_-]{1,23}$')
ID_RE = re.compile(r'^[a-f0-9]{16}$')
CODE_RE = re.compile(r'^[a-z2-9]{8}$')
CODE_ABC = 'abcdefghijkmnpqrstuvwxyz23456789'
HOST_RE = re.compile(r'^[A-Za-z0-9.-]+(:\d{1,5})?$')
TOKEN_DAYS = 60
UPLOAD_HOURS = 24


def _version():
    try:
        with open(os.path.join(REPO_DIR, 'package.json'), encoding='utf-8') as f:
            return str(json.load(f).get('version', '0'))
    except Exception:
        return '0'


VERSION = _version()


class Err(Exception):
    def __init__(self, status, msg):
        super().__init__(msg)
        self.status = status
        self.msg = msg


def _b64ok(s, lo, hi):
    if not isinstance(s, str) or len(s) > hi * 2:
        return False
    try:
        n = len(base64.b64decode(s, validate=True))
    except Exception:
        return False
    return lo <= n <= hi


class Pigeon:
    def __init__(self, data_dir, signups='first', quota_mb=400, max_file_mb=400, public_url=''):
        self.dir = data_dir
        self.files_dir = os.path.join(data_dir, 'files')
        os.makedirs(self.files_dir, exist_ok=True)
        self.signups = signups if signups in ('first', 'open', 'closed') else 'first'
        self.quota = int(float(quota_mb) * 1024 * 1024)
        self.max_file = int(float(max_file_mb) * 1024 * 1024)
        self.public_url = (public_url or '').rstrip('/')
        self.lock = threading.RLock()
        self.db = sqlite3.connect(os.path.join(data_dir, 'pigeon.db'), check_same_thread=False, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.executescript('''
            CREATE TABLE IF NOT EXISTS nests (name TEXT PRIMARY KEY, salt TEXT, proof TEXT, made INTEGER);
            CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, nest TEXT, device TEXT, made INTEGER, seen INTEGER);
            CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, nest TEXT, size INTEGER, chunks INTEGER, meta TEXT,
                wrapped TEXT, made INTEGER, done INTEGER DEFAULT 0, stored INTEGER DEFAULT 0, device TEXT);
            CREATE TABLE IF NOT EXISTS shares (code TEXT PRIMARY KEY, file TEXT, nest TEXT, expires INTEGER, hits INTEGER DEFAULT 0);
            CREATE TABLE IF NOT EXISTS fails (key TEXT, at INTEGER);
        ''')
        self._swept = 0
        self._pages = {}

    # ── storage ─────────────────────────────────────────────────────────────
    def q(self, sql, *args):
        with self.lock:
            return self.db.execute(sql, args).fetchall()

    def one(self, sql, *args):
        rows = self.q(sql, *args)
        return rows[0] if rows else None

    def used(self):
        r = self.one('SELECT COALESCE(SUM(stored), 0) AS n FROM files')
        return int(r['n'])

    def _piece_path(self, fid, n):
        return os.path.join(self.files_dir, fid, '%d' % n)

    def sweep(self):
        now = time.time()
        if now - self._swept < 600:
            return
        self._swept = now
        ms = int(now * 1000)
        for r in self.q('SELECT id FROM files WHERE done = 0 AND made < ?', ms - UPLOAD_HOURS * 3600000):
            self._drop(r['id'])
        self.q('DELETE FROM shares WHERE expires < ?', ms)
        self.q('DELETE FROM tokens WHERE seen < ?', ms - TOKEN_DAYS * 86400000)
        self.q('DELETE FROM fails WHERE at < ?', ms - 3600000)

    def _drop(self, fid):
        shutil.rmtree(os.path.join(self.files_dir, fid), ignore_errors=True)
        self.q('DELETE FROM files WHERE id = ?', fid)
        self.q('DELETE FROM shares WHERE file = ?', fid)

    # ── accounts ────────────────────────────────────────────────────────────
    def _token(self, nest, device):
        token = secrets.token_hex(32)
        now = int(time.time() * 1000)
        self.q('INSERT INTO tokens VALUES (?, ?, ?, ?, ?)', hashlib.sha256(token.encode()).hexdigest(), nest, str(device or '')[:60], now, now)
        return token

    def auth(self, environ):
        h = environ.get('HTTP_AUTHORIZATION') or ''
        m = re.match(r'^Bearer ([a-f0-9]{64})$', h)
        if not m:
            raise Err('401 Unauthorized', 'Please log in.')
        th = hashlib.sha256(m.group(1).encode()).hexdigest()
        r = self.one('SELECT nest, seen FROM tokens WHERE hash = ?', th)
        if not r:
            raise Err('401 Unauthorized', 'You were logged out. Please log in again.')
        now = int(time.time() * 1000)
        if now - r['seen'] > 60000:
            self.q('UPDATE tokens SET seen = ? WHERE hash = ?', now, th)
        return r['nest'], th

    def _slow_down(self, key):
        now = int(time.time() * 1000)
        n = self.one('SELECT COUNT(*) AS n FROM fails WHERE key = ? AND at > ?', key, now - 600000)['n']
        if n >= 8:
            raise Err('429 Too Many Requests', 'Too many wrong passwords. Wait 10 minutes, then try again.')

    def hello(self, m):
        nest = str(m.get('nest') or '').lower()
        if not NEST_RE.match(nest):
            raise Err('400 Bad Request', 'A nest name is 2-24 characters: a-z, 0-9, _ and -')
        r = self.one('SELECT salt FROM nests WHERE name = ?', nest)
        if r:
            return {'exists': True, 'salt': r['salt']}
        return {'exists': False, 'canMake': self._can_make()}

    def _can_make(self):
        if self.signups == 'open':
            return True
        if self.signups == 'closed':
            return False
        return self.one('SELECT COUNT(*) AS n FROM nests')['n'] == 0

    def signup(self, m, ip):
        nest = str(m.get('nest') or '').lower()
        if not NEST_RE.match(nest):
            raise Err('400 Bad Request', 'A nest name is 2-24 characters: a-z, 0-9, _ and -')
        if not _b64ok(m.get('salt'), 16, 16) or not re.match(r'^[a-f0-9]{64}$', str(m.get('proof') or '')):
            raise Err('400 Bad Request', 'Malformed request')
        with self.lock:
            if self.one('SELECT 1 AS x FROM nests WHERE name = ?', nest):
                raise Err('409 Conflict', 'That nest already exists. Log in instead.')
            if not self._can_make():
                raise Err('403 Forbidden', "This pigeon site isn't taking new nests. (Its owner can allow it: \"signups\": \"open\" in pigeon-data/config.json)")
            self.q('INSERT INTO nests VALUES (?, ?, ?, ?)', nest, m['salt'], hashlib.sha256(m['proof'].encode()).hexdigest(), int(time.time() * 1000))
        return {'token': self._token(nest, m.get('device'))}

    def login(self, m, ip):
        nest = str(m.get('nest') or '').lower()
        proof = str(m.get('proof') or '')
        key = nest + '|' + ip
        self._slow_down(key)
        r = self.one('SELECT proof FROM nests WHERE name = ?', nest)
        if not r or not hmac.compare_digest(r['proof'], hashlib.sha256(proof.encode()).hexdigest()):
            self.q('INSERT INTO fails VALUES (?, ?)', key, int(time.time() * 1000))
            raise Err('403 Forbidden', 'Wrong nest name or password.')
        return {'token': self._token(nest, m.get('device'))}

    # ── files ───────────────────────────────────────────────────────────────
    def list(self, nest):
        rows = self.q('SELECT * FROM files WHERE nest = ? ORDER BY made DESC', nest)
        files = [{'id': r['id'], 'size': r['size'], 'chunks': r['chunks'], 'meta': r['meta'], 'wrapped': r['wrapped'],
                  'made': r['made'], 'done': bool(r['done']), 'device': r['device'] or ''} for r in rows]
        return {'files': files, 'used': self.used(), 'quota': self.quota, 'maxFile': self.max_file}

    def start(self, nest, m):
        size = m.get('size')
        chunks = m.get('chunks')
        if not isinstance(size, int) or size < 0 or not isinstance(chunks, int) or chunks < 1:
            raise Err('400 Bad Request', 'Malformed request')
        if chunks != max(1, -(-size // CHUNK)):
            raise Err('400 Bad Request', 'Malformed request')
        if not _b64ok(m.get('meta'), 28, 8192) or not _b64ok(m.get('wrapped'), 60, 60):
            raise Err('400 Bad Request', 'Malformed request')
        if size > self.max_file:
            raise Err('413 Payload Too Large', 'That file is bigger than this site allows (%d MB).' % (self.max_file // 1048576))
        with self.lock:
            if self.used() + size + chunks * 28 > self.quota:
                raise Err('507 Insufficient Storage', "There's no room left: delete some files first (%d of %d MB used)." % (self.used() // 1048576, self.quota // 1048576))
            fid = secrets.token_hex(8)
            self.q('INSERT INTO files (id, nest, size, chunks, meta, wrapped, made, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                   fid, nest, size, chunks, m['meta'], m['wrapped'], int(time.time() * 1000), str(m.get('device') or '')[:60])
        os.makedirs(os.path.join(self.files_dir, fid), exist_ok=True)
        return {'id': fid}

    def _mine(self, nest, fid):
        if not isinstance(fid, str) or not ID_RE.match(fid):
            raise Err('400 Bad Request', 'Malformed request')
        r = self.one('SELECT * FROM files WHERE id = ? AND nest = ?', fid, nest)
        if not r:
            raise Err('404 Not Found', "That file isn't here any more.")
        return r

    def put_piece(self, nest, fid, n, body):
        r = self._mine(nest, fid)
        if r['done'] or not (0 <= n < r['chunks']) or not (28 <= len(body) <= MAX_PIECE):
            raise Err('400 Bad Request', 'Malformed request')
        path = self._piece_path(fid, n)
        old = os.path.getsize(path) if os.path.exists(path) else 0
        with self.lock:
            if self.used() - old + len(body) > self.quota + 1024 * 1024:
                raise Err('507 Insufficient Storage', "There's no room left: delete some files first.")
            tmp = path + '.part'
            with open(tmp, 'wb') as f:
                f.write(body)
            os.replace(tmp, path)
            self.q('UPDATE files SET stored = stored + ? WHERE id = ?', len(body) - old, fid)
        return {'ok': True}

    def finish(self, nest, m):
        r = self._mine(nest, m.get('id'))
        missing = [n for n in range(r['chunks']) if not os.path.exists(self._piece_path(r['id'], n))]
        if missing:
            raise Err('409 Conflict', 'Some pieces are missing: %s' % missing[:10])
        self.q('UPDATE files SET done = 1 WHERE id = ?', r['id'])
        return {'ok': True}

    def get_piece(self, fid, n, nest=None):
        r = self.one('SELECT * FROM files WHERE id = ?' + (' AND nest = ?' if nest else ''), *((fid, nest) if nest else (fid,)))
        if not r or not (0 <= n < r['chunks']):
            raise Err('404 Not Found', 'not found')
        try:
            with open(self._piece_path(fid, n), 'rb') as f:
                return f.read()
        except OSError:
            raise Err('404 Not Found', 'That piece is missing.')

    def delete(self, nest, m):
        r = self._mine(nest, m.get('id'))
        self._drop(r['id'])
        return {'ok': True, 'used': self.used()}

    def share(self, nest, m):
        r = self._mine(nest, m.get('id'))
        if not r['done']:
            raise Err('409 Conflict', "That file hasn't finished arriving yet.")
        hours = m.get('hours', 24)
        if not isinstance(hours, (int, float)) or not (0.1 <= hours <= 24 * 30):
            hours = 24
        code = ''.join(secrets.choice(CODE_ABC) for _ in range(8))
        expires = int((time.time() + hours * 3600) * 1000)
        self.q('INSERT INTO shares VALUES (?, ?, ?, ?, 0)', code, r['id'], nest, expires)
        return {'code': code, 'expires': expires}

    def unshare(self, nest, m):
        self.q('DELETE FROM shares WHERE code = ? AND nest = ?', str(m.get('code') or ''), nest)
        return {'ok': True}

    def shared(self, code):
        if not CODE_RE.match(code or ''):
            raise Err('404 Not Found', 'That link is not valid.')
        s = self.one('SELECT * FROM shares WHERE code = ?', code)
        if not s or s['expires'] < time.time() * 1000:
            raise Err('410 Gone', 'That link has expired. Ask for a new one.')
        r = self.one('SELECT * FROM files WHERE id = ?', s['file'])
        if not r:
            raise Err('410 Gone', 'That file was deleted.')
        return s, r

    def logout(self, th):
        self.q('DELETE FROM tokens WHERE hash = ?', th)
        return {'ok': True}

    def devices(self, nest):
        rows = self.q('SELECT device, made, seen FROM tokens WHERE nest = ? ORDER BY seen DESC', nest)
        return {'devices': [{'device': r['device'], 'made': r['made'], 'seen': r['seen']} for r in rows]}

    # ── pages ───────────────────────────────────────────────────────────────
    def _read(self, *parts):
        path = os.path.join(REPO_DIR, *parts)
        try:
            stamp = os.path.getmtime(path)
        except OSError:
            return None
        hit = self._pages.get(path)
        if not hit or hit[0] != stamp:
            with open(path, encoding='utf-8') as f:
                hit = (stamp, f.read())
            self._pages[path] = hit
        return hit[1]

    def origin(self, environ):
        if self.public_url:
            return self.public_url
        host = environ.get('HTTP_HOST') or ''
        if not HOST_RE.fullmatch(host):
            return ''
        secure = (environ.get('wsgi.url_scheme') == 'https' or environ.get('HTTP_X_FORWARDED_PROTO') == 'https'
                  or host.endswith('.pythonanywhere.com'))
        return ('https://' if secure else 'http://') + host

    def page(self, environ, base):
        html = self._read('web', 'index.html')
        if html is None:
            return None
        origin = self.origin(environ)
        conf = json.dumps({'base': base, 'origin': origin, 'version': VERSION, 'sh': origin + base + '/install.sh', 'ps1': origin + base + '/install.ps1'})
        html = html.replace('/*PIGEON_CONFIG*/{}', conf.replace('<', '\\u003c'))
        qr = self._read('src', 'qr.js') or ''
        return html.replace('/*PIGEON_QR*/', qr.replace('</script', '<\\/script'))

    def installer(self, kind, environ, base):
        text = self._read('install.sh' if kind == 'sh' else 'install.ps1')
        if text is None:
            return None
        origin = self.origin(environ)
        if not origin:
            return text
        hub = origin + base
        if kind == 'sh':
            head, _, rest = text.partition('\n')
            return '%s\nPIGEON_HUB="${PIGEON_HUB:-%s}"\n%s' % (head, hub, rest)
        return "if (-not $env:PIGEON_HUB) { $env:PIGEON_HUB = '%s' }\n%s" % (hub, text)

    # ── the web server ──────────────────────────────────────────────────────
    def wsgi(self, environ, start_response):
        method = environ.get('REQUEST_METHOD', 'GET')
        base = (environ.get('SCRIPT_NAME') or '').rstrip('/')
        path = environ.get('PATH_INFO') or '/'
        ip = (environ.get('HTTP_X_REAL_IP') or environ.get('REMOTE_ADDR') or '?')[:64]

        def send(status, body, ctype='application/json', extra=()):
            data = body if isinstance(body, bytes) else (body.encode('utf-8') if isinstance(body, str) else json.dumps(body, separators=(',', ':')).encode())
            start_response(status, [('Content-Type', ctype), ('Content-Length', str(len(data))), ('Cache-Control', 'no-store'),
                                    ('X-Content-Type-Options', 'nosniff'), ('Referrer-Policy', 'no-referrer')] + list(extra))
            return [data]

        try:
            self.sweep()
            if path == '/api' and method == 'GET':
                return send('200 OK', {'name': 'pigeon', 'version': VERSION, 'signups': self.signups, 'chunk': CHUNK})
            if path.startswith('/api/'):
                return self.api(environ, method, path[5:], ip, send)
            if method not in ('GET', 'HEAD'):
                return send('405 Method Not Allowed', {'error': 'not allowed'})
            if path in ('/', '/index.html') or re.match(r'^/s/[a-z2-9]{8}$', path):
                html = self.page(environ, base)
                if html is None:
                    return send('200 OK', 'pigeon v%s\n' % VERSION, 'text/plain; charset=utf-8')
                csp = "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' blob: data:; media-src blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"
                return send('200 OK', html, 'text/html; charset=utf-8', [('Content-Security-Policy', csp)])
            if path in ('/install.sh', '/install.ps1'):
                text = self.installer(path.rsplit('.', 1)[1], environ, base)
                if text is not None:
                    return send('200 OK', text, 'text/plain; charset=utf-8')
            if path == '/healthz':
                return send('200 OK', 'pigeon v%s - %d MB used\n' % (VERSION, self.used() // 1048576), 'text/plain; charset=utf-8')
            return send('404 Not Found', {'error': 'not found'})
        except Err as e:
            return send(e.status, {'error': e.msg})
        except Exception as e:  # never show a traceback to the world
            sys.stderr.write('pigeon: %r\n' % (e,))
            return send('500 Internal Server Error', {'error': 'Something went wrong on the server.'})

    def api(self, environ, method, what, ip, send):
        qs = dict(p.split('=', 1) for p in (environ.get('QUERY_STRING') or '').split('&') if '=' in p)

        def body(limit):
            try:
                size = int(environ.get('CONTENT_LENGTH') or 0)
            except ValueError:
                size = 0
            if size > limit:
                raise Err('413 Payload Too Large', 'That piece is too big.')
            return environ['wsgi.input'].read(size) if size > 0 else b''

        if what == 'piece':
            n = int(qs.get('n', '-1')) if re.match(r'^\d{1,6}$', qs.get('n', '')) else -1
            fid = qs.get('id', '')
            if method == 'PUT':
                nest, _ = self.auth(environ)
                return send('200 OK', self.put_piece(nest, fid, n, body(MAX_PIECE)))
            if method == 'GET':
                nest, _ = self.auth(environ)
                if not ID_RE.match(fid):
                    raise Err('400 Bad Request', 'Malformed request')
                return send('200 OK', self.get_piece(fid, n, nest), 'application/octet-stream')
        m = re.match(r'^shared/([a-z2-9]{8})(?:/(\d{1,6}))?$', what)
        if m and method == 'GET':
            s, r = self.shared(m.group(1))
            if m.group(2) is None:
                self.q('UPDATE shares SET hits = hits + 1 WHERE code = ?', s['code'])
                return send('200 OK', {'size': r['size'], 'chunks': r['chunks'], 'meta': r['meta'], 'expires': s['expires'], 'made': r['made']})
            return send('200 OK', self.get_piece(r['id'], int(m.group(2))), 'application/octet-stream')
        if method != 'POST':
            raise Err('405 Method Not Allowed', 'use POST')
        try:
            msg = json.loads(body(65536).decode('utf-8') or '{}')
            if not isinstance(msg, dict):
                raise ValueError
        except Err:
            raise
        except Exception:
            raise Err('400 Bad Request', 'Malformed request')
        if what == 'hello':
            return send('200 OK', self.hello(msg))
        if what == 'signup':
            return send('200 OK', self.signup(msg, ip))
        if what == 'login':
            return send('200 OK', self.login(msg, ip))
        nest, th = self.auth(environ)
        handlers = {
            'list': lambda: self.list(nest), 'start': lambda: self.start(nest, msg), 'finish': lambda: self.finish(nest, msg),
            'delete': lambda: self.delete(nest, msg), 'share': lambda: self.share(nest, msg), 'unshare': lambda: self.unshare(nest, msg),
            'logout': lambda: self.logout(th), 'devices': lambda: self.devices(nest),
        }
        if what not in handlers:
            raise Err('404 Not Found', 'not found')
        return send('200 OK', handlers[what]())


# ── start-up ─────────────────────────────────────────────────────────────────

_app = None
_app_lock = threading.Lock()


def from_env():
    env = os.environ
    data = env.get('PIGEON_DATA') or os.path.expanduser('~/pigeon-data')
    conf = {}
    try:
        with open(os.path.join(data, 'config.json'), encoding='utf-8') as f:
            conf = json.load(f)
    except (OSError, ValueError):
        pass
    return Pigeon(
        data,
        signups=env.get('PIGEON_SIGNUPS') or conf.get('signups') or 'first',
        quota_mb=env.get('PIGEON_QUOTA_MB') or conf.get('quota_mb') or 400,
        max_file_mb=env.get('PIGEON_MAX_FILE_MB') or conf.get('max_file_mb') or 400,
        public_url=env.get('PIGEON_PUBLIC_URL') or conf.get('public_url') or '',
    )


def application(environ, start_response):
    """The WSGI entry point."""
    global _app
    if _app is None:
        with _app_lock:
            if _app is None:
                _app = from_env()
    return _app.wsgi(environ, start_response)


def main(argv):
    import argparse
    from socketserver import ThreadingMixIn
    from wsgiref.simple_server import WSGIServer, WSGIRequestHandler, make_server

    ap = argparse.ArgumentParser(description='pigeon server')
    ap.add_argument('--port', type=int, default=8080)
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--data', default=None)
    ap.add_argument('--signups', default=None)
    ap.add_argument('--quota-mb', type=float, default=None)
    a = ap.parse_args(argv)
    if a.data:
        os.environ['PIGEON_DATA'] = a.data
    if a.signups:
        os.environ['PIGEON_SIGNUPS'] = a.signups
    if a.quota_mb:
        os.environ['PIGEON_QUOTA_MB'] = str(a.quota_mb)

    class Threaded(ThreadingMixIn, WSGIServer):
        daemon_threads = True

    class Quiet(WSGIRequestHandler):
        def log_message(self, *args):
            pass

    srv = make_server(a.host, a.port, application, server_class=Threaded, handler_class=Quiet)
    print('pigeon v%s on http://%s:%d' % (VERSION, a.host, srv.server_port), flush=True)
    srv.serve_forever()


if __name__ == '__main__':
    main(sys.argv[1:])
