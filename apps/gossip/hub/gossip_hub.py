#!/usr/bin/env python3
"""The gossip website: the install page AND a place that passes messages along.

It does the same job as `gossip serve` (the relay), but over ordinary web
requests, so it runs on any plain Python web host - PythonAnywhere's free plan
is enough. It can't read messages: it only ever holds public keys and sealed
envelopes, and it deletes an envelope as soon as the recipient confirms it.

  On PythonAnywhere: point the WSGI file at `application` (see docs/HOSTING.md).
  On your own machine, to try it:  python3 hub/gossip_hub.py --port 8080

Needs nothing but Python 3.8+ (no pip installs).
"""

import base64
import hashlib
import json
import os
import re
import secrets
import sqlite3
import sys
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(HERE)

PROTOCOL = 1
NAME_RE = re.compile(r'[a-z0-9][a-z0-9_-]{2,19}')
ROOM_RE = re.compile(r'[a-z0-9][a-z0-9_-]{1,23}')
ID_RE = re.compile(r'[A-Za-z0-9_-]{8,32}')
KEY_RE = re.compile(r'[A-Za-z0-9_-]{43}')
SIG_RE = re.compile(r'[A-Za-z0-9_-]{86}')
NONCE_RE = re.compile(r'[A-Za-z0-9_-]{16}')
CT_RE = re.compile(r'[A-Za-z0-9_-]{22,}')
WRAP_RE = re.compile(r'[A-Za-z0-9_-]{64}')
HOST_RE = re.compile(r'[A-Za-z0-9.-]{1,253}(:[0-9]{1,5})?')
RESERVED = {
    'you', 'me', 'system', 'server', 'admin', 'gossip', 'everyone', 'all',
    'here', 'root', 'support', 'home', 'help', 'null', 'undefined',
}
LIMIT_BODY = 512 * 1024      # bytes per request
REPLY_BYTES = 1200 * 1024    # most bytes of messages handed over in one reply
LIMIT_MEMBERS = 256
LIMIT_QUEUE = 500            # undelivered messages kept per person
LIMIT_QUEUE_DAYS = 30
LIMIT_WATCH = 500
NAME_HELP = 'Usernames are 3-20 characters: a-z, 0-9, _ and -'
ROOM_HELP = 'Server names are 2-24 characters: a-z, 0-9, _ and -'
DH_CONTEXT = 'gossip/v1/dh-key\n'
SESSION_TTL = {'live': 30000, 'peek': 30000, 'post': 60000}  # ms without a request


def _version():
    try:
        with open(os.path.join(REPO_DIR, 'package.json'), encoding='utf-8') as f:
            return str(json.load(f).get('version', '0'))
    except Exception:
        return '0'


VERSION = _version()


# ── Ed25519 signature checks ─────────────────────────────────────────────────
# Uses the `cryptography` package when the host has it, and otherwise a small
# pure-Python verifier (RFC 8032). Only public data is involved, so the slow,
# simple version is perfectly safe - it just takes a few milliseconds.

_P = 2 ** 255 - 19
_L = 2 ** 252 + 27742317777372353535851937790883648493
_D = -121665 * pow(121666, _P - 2, _P) % _P
_I = pow(2, (_P - 1) // 4, _P)


def _recover_x(y, sign):
    if y >= _P:
        return None
    x2 = (y * y - 1) * pow(_D * y * y + 1, _P - 2, _P) % _P
    if x2 == 0:
        return None if sign else 0
    x = pow(x2, (_P + 3) // 8, _P)
    if (x * x - x2) % _P != 0:
        x = x * _I % _P
    if (x * x - x2) % _P != 0:
        return None
    if (x & 1) != sign:
        x = _P - x
    return x


_GY = 4 * pow(5, _P - 2, _P) % _P
_GX = _recover_x(_GY, 0)
_G = (_GX, _GY, 1, _GX * _GY % _P)


def _add(a, b):
    x1, y1, z1, t1 = a
    x2, y2, z2, t2 = b
    aa = (y1 - x1) * (y2 - x2) % _P
    bb = (y1 + x1) * (y2 + x2) % _P
    cc = 2 * t1 * t2 * _D % _P
    dd = 2 * z1 * z2 % _P
    e, f, g, h = bb - aa, dd - cc, dd + cc, bb + aa
    return (e * f % _P, g * h % _P, f * g % _P, e * h % _P)


def _mul(s, p):
    q = (0, 1, 1, 0)
    while s > 0:
        if s & 1:
            q = _add(q, p)
        p = _add(p, p)
        s >>= 1
    return q


def _decompress(b):
    if len(b) != 32:
        return None
    y = int.from_bytes(b, 'little')
    sign = y >> 255
    y &= (1 << 255) - 1
    x = _recover_x(y, sign)
    if x is None:
        return None
    return (x, y, 1, x * y % _P)


def _same(a, b):
    return (a[0] * b[2] - b[0] * a[2]) % _P == 0 and (a[1] * b[2] - b[1] * a[2]) % _P == 0


def _verify_pure(pub, msg, sig):
    if len(pub) != 32 or len(sig) != 64:
        return False
    a = _decompress(pub)
    r = _decompress(sig[:32])
    if a is None or r is None:
        return False
    s = int.from_bytes(sig[32:], 'little')
    if s >= _L:
        return False
    h = int.from_bytes(hashlib.sha512(sig[:32] + pub + msg).digest(), 'little') % _L
    return _same(_mul(s, _G), _add(r, _mul(h, a)))


try:  # pragma: no cover - depends on the host
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    def _verify_fast(pub, msg, sig):
        try:
            Ed25519PublicKey.from_public_bytes(pub).verify(sig, msg)
            return True
        except Exception:
            return False
except Exception:  # pragma: no cover
    _verify_fast = None


def ed25519_verify(pub, msg, sig):
    if _verify_fast is not None and os.environ.get('GOSSIP_PURE_CRYPTO') != '1':
        return _verify_fast(pub, msg, sig)
    return _verify_pure(pub, msg, sig)


def _unb64(s):
    return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))


def verify_text(sign_pub, text, sig):
    if not isinstance(sign_pub, str) or not isinstance(sig, str):
        return False
    if not KEY_RE.fullmatch(sign_pub) or not SIG_RE.fullmatch(sig):
        return False
    try:
        return ed25519_verify(_unb64(sign_pub), text.encode('utf-8'), _unb64(sig))
    except Exception:
        return False


# ── the same rules the app uses (src/proto.js) ───────────────────────────────

def valid_name(s):
    return isinstance(s, str) and NAME_RE.fullmatch(s) is not None and s not in RESERVED


def valid_room(s):
    return isinstance(s, str) and ROOM_RE.fullmatch(s) is not None


def valid_bundle(b):
    if not isinstance(b.get('signPub'), str) or not KEY_RE.fullmatch(b['signPub']):
        return False
    if not isinstance(b.get('dhPub'), str) or not KEY_RE.fullmatch(b['dhPub']):
        return False
    return verify_text(b['signPub'], DH_CONTEXT + b['dhPub'], b.get('dhSig'))


def parse_conv(conv):
    if not isinstance(conv, str) or len(conv) > 64:
        return None
    parts = conv.split(':')
    if parts[0] == 'dm' and len(parts) == 3:
        a, b = parts[1], parts[2]
        if NAME_RE.fullmatch(a) and NAME_RE.fullmatch(b) and a < b:
            return {'kind': 'dm', 'a': a, 'b': b}
        return None
    if parts[0] == 'room' and len(parts) == 2 and ROOM_RE.fullmatch(parts[1]):
        return {'kind': 'room', 'room': parts[1]}
    return None


def _is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def valid_envelope(env):
    if not isinstance(env, dict) or not _is_int(env.get('v')) or env['v'] != 1:
        return False

    def text(key, rx):
        return isinstance(env.get(key), str) and rx.fullmatch(env[key]) is not None

    if not text('id', ID_RE) or not text('from', NAME_RE) or not parse_conv(env.get('conv')):
        return False
    if not _is_int(env.get('ts')) or env['ts'] < 0 or env['ts'] > 2 ** 53 - 1:
        return False
    if not text('eph', KEY_RE) or not text('n', NONCE_RE) or not text('ct', CT_RE) or not text('sig', SIG_RE):
        return False
    keys = env.get('keys')
    if not isinstance(keys, dict) or len(keys) > LIMIT_MEMBERS:
        return False
    for n, wrap in keys.items():
        if not NAME_RE.fullmatch(n) or not isinstance(wrap, str) or not WRAP_RE.fullmatch(wrap):
            return False
    return True


class Err(Exception):
    def __init__(self, code, msg=None):
        Exception.__init__(self, msg or code)
        self.code = code
        self.msg = msg or code


SCHEMA = """
CREATE TABLE IF NOT EXISTS users(name TEXT PRIMARY KEY, sign_pub TEXT, dh_pub TEXT, dh_sig TEXT, created INTEGER, seen INTEGER);
CREATE TABLE IF NOT EXISTS blocks(owner TEXT, name TEXT, PRIMARY KEY(owner, name));
CREATE TABLE IF NOT EXISTS rooms(name TEXT PRIMARY KEY, private INTEGER, owner TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS members(id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT, name TEXT, UNIQUE(room, name));
CREATE TABLE IF NOT EXISTS invited(room TEXT, name TEXT, by TEXT, PRIMARY KEY(room, name));
CREATE TABLE IF NOT EXISTS banned(room TEXT, name TEXT, PRIMARY KEY(room, name));
CREATE TABLE IF NOT EXISTS notices(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, body TEXT);
CREATE TABLE IF NOT EXISTS bodies(key TEXT PRIMARY KEY, env TEXT, ts INTEGER, dm INTEGER);
CREATE TABLE IF NOT EXISTS queue(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, body TEXT, wrap TEXT);
CREATE INDEX IF NOT EXISTS queue_name ON queue(name);
CREATE INDEX IF NOT EXISTS queue_body ON queue(body);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, name TEXT, mode TEXT, seen INTEGER, made INTEGER,
  tokens REAL, refilled INTEGER, last_typing INTEGER);
CREATE INDEX IF NOT EXISTS sessions_name ON sessions(name);
CREATE TABLE IF NOT EXISTS watch(token TEXT, name TEXT, PRIMARY KEY(token, name));
CREATE INDEX IF NOT EXISTS watch_name ON watch(name);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT, body TEXT);
CREATE INDEX IF NOT EXISTS events_token ON events(token);
CREATE TABLE IF NOT EXISTS nonces(nonce TEXT PRIMARY KEY, ts INTEGER);
CREATE TABLE IF NOT EXISTS aliases(old TEXT PRIMARY KEY, new TEXT);
"""


class Hub:
    def __init__(self, data_dir=None, name='gossip', motd='', signups=True, max_members=LIMIT_MEMBERS,
                 max_users=20000, max_mb=300, signups_per_hour=30, trust_proxy=False, public_url='', turn=None,
                 turn_server='', turn_secret=''):
        self.name = name
        self.motd = motd
        self.signups = signups
        self.max_members = max(2, min(int(max_members), LIMIT_MEMBERS))
        self.max_users = max_users
        self.max_bytes = max_mb * 1024 * 1024
        self.signups_per_hour = signups_per_hour
        self.trust_proxy = trust_proxy
        self.public_url = public_url.rstrip('/')
        self.turn = turn or []
        self.turn_server = str(turn_server or '').strip()
        self.turn_secret = str(turn_secret or '').strip()
        self.lock = threading.RLock()
        self.ip_signups = {}
        self.ip_hellos = {}
        self._swept = 0
        self._expired = 0
        self._files = {}
        if data_dir:
            os.makedirs(data_dir, mode=0o700, exist_ok=True)
            self.db_file = os.path.join(data_dir, 'hub.sqlite3')
        else:
            self.db_file = ':memory:'
        self.db = sqlite3.connect(self.db_file, timeout=15, isolation_level=None, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)
        try:  # databases made by older versions don't have this column yet
            self.db.execute('ALTER TABLE sessions ADD COLUMN ip TEXT')
        except sqlite3.OperationalError:
            pass

    # ── small helpers ────────────────────────────────────────────────────────

    def q(self, sql, *args):
        return self.db.execute(sql, args)

    def one(self, sql, *args):
        return self.db.execute(sql, args).fetchone()

    def _sessions(self, name):
        return self.q('SELECT * FROM sessions WHERE name=?', name).fetchall()

    def _is_live(self, name):
        return self.one("SELECT 1 FROM sessions WHERE name=? AND mode='live' LIMIT 1", name) is not None

    def _watches(self, name, target):
        """Does `name` (while live) have `target` in their contacts?"""
        return self.one(
            "SELECT 1 FROM sessions s JOIN watch w ON w.token=s.token WHERE s.name=? AND s.mode='live' AND w.name=? LIMIT 1",
            name, target) is not None

    def _push(self, token, obj):
        self.q('INSERT INTO events(token, body) VALUES(?, ?)', token, json.dumps(obj, separators=(',', ':')))

    def _push_to(self, name, obj, skip=None):
        for s in self._sessions(name):
            if s['mode'] != 'post' and s['token'] != skip:
                self._push(s['token'], obj)

    def _push_live(self, name, obj):
        for s in self._sessions(name):
            if s['mode'] == 'live':
                self._push(s['token'], obj)

    def _pub(self, u):
        return {'name': u['name'], 'signPub': u['sign_pub'], 'dhPub': u['dh_pub'], 'dhSig': u['dh_sig']}

    def _user(self, name):
        return self.one('SELECT * FROM users WHERE name=?', name) if valid_name(name) else None

    def _room(self, name):
        return self.one('SELECT * FROM rooms WHERE name=?', name) if valid_room(name) else None

    def _member_names(self, room):
        return [r['name'] for r in self.q('SELECT name FROM members WHERE room=? ORDER BY id', room)]

    def _is_member(self, room, name):
        return self.one('SELECT 1 FROM members WHERE room=? AND name=?', room, name) is not None

    def _room_info(self, r):
        n = self.one('SELECT COUNT(*) AS n FROM members WHERE room=?', r['name'])['n']
        return {'name': r['name'], 'private': bool(r['private']), 'owner': r['owner'], 'members': n}

    def _members_list(self, room):
        out = []
        for n in self._member_names(room):
            u = self._user(n)
            if u:
                item = self._pub(u)
                item['online'] = self._is_live(n)
                out.append(item)
        return out

    def _room_cast(self, room, obj, skip_name=None):
        for n in self._member_names(room):
            if n != skip_name:
                self._push_to(n, obj)

    def _blocked(self, owner, name):
        return self.one('SELECT 1 FROM blocks WHERE owner=? AND name=?', owner, name) is not None

    def _blocked_list(self, owner):
        return [r['name'] for r in self.q('SELECT name FROM blocks WHERE owner=? ORDER BY name', owner)]

    def _msg_event(self, name, body_key, wrap):
        b = self.one('SELECT * FROM bodies WHERE key=?', body_key)
        if not b:
            return None
        env = json.loads(b['env'])
        env['keys'] = {name: wrap}
        return {'t': 'msg', 'mid': body_key, 'ts': b['ts'], 'env': env}

    def _unref(self, body_key):
        self.q('DELETE FROM bodies WHERE key=? AND NOT EXISTS (SELECT 1 FROM queue WHERE body=?)', body_key, body_key)

    def _close(self, s, now):
        """A session ended (said bye, or stopped asking for news)."""
        watched = [r['name'] for r in self.q('SELECT name FROM watch WHERE token=?', s['token'])]
        self.q('DELETE FROM sessions WHERE token=?', s['token'])
        self.q('DELETE FROM watch WHERE token=?', s['token'])
        self.q('DELETE FROM events WHERE token=?', s['token'])
        self.q('UPDATE users SET seen=? WHERE name=?', now, s['name'])
        if s['mode'] == 'live' and not self._is_live(s['name']):
            for n in watched:
                if self._watches(n, s['name']):
                    self._push_live(n, {'t': 'presence', 'name': s['name'], 'online': False})

    def _sweep(self, now):
        if now - self._swept < 2000:
            return
        self._swept = now
        for s in self.q('SELECT * FROM sessions').fetchall():
            if now - s['seen'] > SESSION_TTL.get(s['mode'], 30000):
                self._close(s, now)
        if now - self._expired > 10 * 60 * 1000:
            self._expired = now
            cutoff = now - LIMIT_QUEUE_DAYS * 24 * 3600 * 1000
            self.q('DELETE FROM queue WHERE body IN (SELECT key FROM bodies WHERE ts < ?)', cutoff)
            self.q('DELETE FROM bodies WHERE NOT EXISTS (SELECT 1 FROM queue WHERE queue.body = bodies.key)')
            self.q('DELETE FROM nonces WHERE ts < ?', now - 120000)
            for table in (self.ip_signups, self.ip_hellos):
                for ip in list(table):
                    table[ip] = [t for t in table[ip] if now - t < 3600000]
                    if not table[ip]:
                        del table[ip]

    def _allow(self, table, ip, limit, window, now):
        times = [t for t in table.get(ip, []) if now - t < window]
        if len(times) >= limit:
            table[ip] = times
            return False
        times.append(now)
        table[ip] = times
        return True

    # ── one request ──────────────────────────────────────────────────────────

    OPEN = {'hello', 'auth'}                    # allowed before signing in
    FREE = {'poll', 'got', 'typing', 'ping', 'bye'}  # not counted against the rate limit

    def handle(self, m, ip='?'):
        """Takes one request (a dict) and returns the reply (a dict)."""
        if not isinstance(m, dict) or not isinstance(m.get('t'), str):
            return {'t': 'err', 'code': 'bad_request', 'msg': 'Malformed request'}
        t = m['t']
        fn = getattr(self, 'h_' + t, None) if re.fullmatch(r'[a-z]{2,12}', t) else None
        if fn is None:
            return {'t': 'err', 'code': 'unknown', 'msg': 'Unknown request'}
        now = int(time.time() * 1000)
        with self.lock:
            self.db.execute('BEGIN IMMEDIATE')
            try:
                self._sweep(now)
                if t in self.OPEN:
                    out = fn(m, ip, now)
                else:
                    s = self.one('SELECT * FROM sessions WHERE token=?', m.get('token')) if isinstance(m.get('token'), str) else None
                    if not s:
                        raise Err('bad_session', 'Sign in first')
                    tokens = s['tokens']
                    if t not in self.FREE:
                        tokens = min(40.0, tokens + (now - s['refilled']) / 250.0)
                        if tokens < 1:
                            raise Err('slow_down', "You're sending too fast - give it a second")
                        tokens -= 1
                        self.q('UPDATE sessions SET seen=?, tokens=?, refilled=? WHERE token=?', now, tokens, now, s['token'])
                    else:
                        self.q('UPDATE sessions SET seen=? WHERE token=?', now, s['token'])
                    out = fn(s, m, now)
                self.db.execute('COMMIT')
            except Err as e:
                self.db.execute('COMMIT')  # keep the bookkeeping (rate limit, used nonce)
                return {'t': 'err', 'code': e.code, 'msg': e.msg}
            except Exception as e:  # a bug here must never take the site down
                self.db.execute('ROLLBACK')
                sys.stderr.write('[gossip hub] error in %s: %r\n' % (t, e))
                return {'t': 'err', 'code': 'server_error', 'msg': 'The server hit a problem with that request'}
        reply = {'t': 'ok'}
        reply.update(out or {})
        return reply

    def info(self):
        return {'gossip': True, 'v': PROTOCOL, 'server': self.name, 'version': VERSION}

    def h_hello(self, m, ip, now):
        if not self._allow(self.ip_hellos, ip, 240, 60000, now):
            raise Err('slow_down', 'Too many sign-ins from this network - give it a minute')
        nonce = secrets.token_urlsafe(24)
        self.q('INSERT INTO nonces(nonce, ts) VALUES(?, ?)', nonce, now)
        return {'v': PROTOCOL, 'nonce': nonce, 'server': self.name, 'motd': self.motd, 'version': VERSION}

    def h_auth(self, m, ip, now):
        nonce = m.get('nonce')
        row = self.one('SELECT ts FROM nonces WHERE nonce=?', nonce) if isinstance(nonce, str) else None
        if not row or now - row['ts'] > 120000:
            raise Err('bad_proof', 'Sign-in took too long - try again')
        self.q('DELETE FROM nonces WHERE nonce=?', nonce)
        name = m.get('name')
        if not valid_name(name):
            raise Err('bad_name', NAME_HELP)
        bundle = {'signPub': m.get('signPub'), 'dhPub': m.get('dhPub'), 'dhSig': m.get('dhSig')}
        if not valid_bundle(bundle):
            raise Err('bad_keys', 'Invalid keys')
        if not verify_text(bundle['signPub'], 'gossip/v1/auth\n%s\n%s' % (nonce, name), m.get('sig')):
            raise Err('bad_proof', 'Sign-in proof was not valid')

        user = self._user(name)
        created = False
        if user:
            if user['sign_pub'] != bundle['signPub']:
                raise Err('name_taken', 'The username "%s" is already taken' % name)
            if user['dh_pub'] != bundle['dhPub']:
                self.q('UPDATE users SET dh_pub=?, dh_sig=? WHERE name=?', bundle['dhPub'], bundle['dhSig'], name)
        else:
            moved = self.one('SELECT new FROM aliases WHERE old=?', name)  # a name someone used to have stays theirs
            if moved:
                owner = self._user(moved['new'])
                if owner and owner['sign_pub'] == bundle['signPub']:
                    raise Err('renamed', 'This account is now called "%s"' % moved['new'])
                raise Err('name_taken', 'The username "%s" is already taken' % name)
            if not m.get('create'):
                raise Err('unknown_user', 'There\'s no account called "%s" here' % name)
            if not self.signups:
                raise Err('signups_closed', "This relay isn't taking new accounts")
            if self.one('SELECT COUNT(*) AS n FROM users')['n'] >= self.max_users:
                raise Err('signups_closed', 'This relay is full')
            if not self._allow(self.ip_signups, ip, self.signups_per_hour, 3600000, now):
                raise Err('signup_limit', 'Too many new accounts from this network - try again in an hour')
            self.q('INSERT INTO users(name, sign_pub, dh_pub, dh_sig, created, seen) VALUES(?,?,?,?,?,?)',
                   name, bundle['signPub'], bundle['dhPub'], bundle['dhSig'], now, now)
            created = True
        self.q('UPDATE users SET seen=? WHERE name=?', now, name)

        mode = m.get('mode') if m.get('mode') in ('live', 'peek', 'post') else 'live'
        token = secrets.token_urlsafe(32)
        self.q('INSERT INTO sessions(token, name, mode, seen, made, tokens, refilled, last_typing, ip) VALUES(?,?,?,?,?,?,?,0,?)',
               token, name, mode, now, now, 40.0, now, str(ip)[:64])
        mine = self.q('SELECT * FROM sessions WHERE name=? ORDER BY made', name).fetchall()
        for old in mine[:max(0, len(mine) - 8)]:
            self._close(old, now)

        # Tell your open chats when the account is opened somewhere else as well.
        others = self.one("SELECT COUNT(*) AS n FROM sessions WHERE name=? AND mode='live' AND token<>?", name, token)['n']
        if mode == 'live' and others:
            self._push_to(name, {'t': 'session', 'event': 'new', 'n': others + 1}, token)

        rooms = [self._room_info(r) for r in self.q(
            'SELECT r.* FROM rooms r JOIN members m ON m.room=r.name WHERE m.name=? ORDER BY r.name', name)]
        invites = [{'room': r['room'], 'by': r['by']} for r in self.q('SELECT room, by FROM invited WHERE name=?', name)]
        waiting = self.q('SELECT * FROM queue WHERE name=? ORDER BY id', name).fetchall()
        notices, events = [], []
        if mode != 'post':
            for n in self.q('SELECT * FROM notices WHERE name=? ORDER BY id', name).fetchall():
                notices.append(json.loads(n['body']))
            self.q('DELETE FROM notices WHERE name=?', name)
            # Hand over what's waiting, but not more than about a megabyte in one reply (files
            # can be big): the rest is queued for the app's next "anything new?".
            size = 0
            later = False
            for item in waiting:
                ev = self._msg_event(name, item['body'], item['wrap'])
                if not ev:
                    continue
                n = len(json.dumps(ev, separators=(',', ':')))
                if later or size + n > REPLY_BYTES:
                    later = True
                    self._push(token, ev)
                else:
                    size += n
                    events.append(ev)
            if later:
                self._push(token, {'t': 'caught_up', 'n': len(waiting)})
            else:
                events.append({'t': 'caught_up', 'n': len(waiting)})
        return {'name': name, 'created': created, 'rooms': rooms, 'invites': invites,
                'blocked': self._blocked_list(name), 'waiting': len(waiting), 'notices': notices,
                'token': token, 'events': events, 'others': others}

    def h_ice(self, s, m, now):
        """Extra servers that help calls get through strict networks (TURN), if this site has any."""
        ice = list(self.turn)
        if self.turn_server and self.turn_secret:
            # gossip's own call relay (gossip turn): hand out a login that works for a day
            import hmac
            username = '%d:%s' % (int(time.time()) + 86400, s['name'])
            credential = base64.b64encode(hmac.new(self.turn_secret.encode(), username.encode(), hashlib.sha1).digest()).decode()
            ice.append({'urls': 'stun:' + self.turn_server})
            ice.append({'urls': ['turn:%s?transport=udp' % self.turn_server, 'turn:%s?transport=tcp' % self.turn_server],
                        'username': username, 'credential': credential})
        return {'ice': ice}

    def h_sessions(self, s, m, now):
        """Every place your account is open right now (for the dashboard)."""
        rows = self.q('SELECT token, mode, made, ip FROM sessions WHERE name=? ORDER BY made', s['name']).fetchall()
        return {'sessions': [{'you': r['token'] == s['token'], 'mode': r['mode'], 'since': r['made'], 'ip': r['ip'] or ''} for r in rows]}

    def h_ping(self, s, m, now):
        return {}

    def h_bye(self, s, m, now):
        self._close(s, now)
        return {}

    def h_poll(self, s, m, now):
        rows = self.q('SELECT id, body FROM events WHERE token=? ORDER BY id LIMIT 500', s['token']).fetchall()
        take, size = [], 0
        for r in rows:  # (at most about a megabyte per reply)
            if take and size + len(r['body']) > REPLY_BYTES:
                break
            take.append(r)
            size += len(r['body'])
        if take:
            self.q('DELETE FROM events WHERE token=? AND id<=?', s['token'], take[-1]['id'])
        return {'events': [json.loads(r['body']) for r in take], 'more': len(take) < len(rows)}

    def h_lookup(self, s, m, now):
        u = self._user(m.get('name'))
        if not u and valid_name(m.get('name')):  # someone who changed their username is still found under the old one
            moved = self.one('SELECT new FROM aliases WHERE old=?', m['name'])
            u = self._user(moved['new']) if moved else None
        if not u:
            raise Err('no_such_user', 'There\'s no user called "%s"' % str(m.get('name'))[:24])
        return {'user': self._pub(u)}

    def h_rename(self, s, m, now):
        """Change your username. Everything moves with you; the old name stays yours."""
        old = s['name']
        name = m.get('name')
        if not valid_name(name):
            raise Err('bad_name', NAME_HELP)
        if name == old:
            raise Err('bad_name', 'That is already your username')
        holder = self.one('SELECT new FROM aliases WHERE old=?', name)
        if self._user(name) or (holder and holder['new'] != old):
            raise Err('name_taken', 'The username "%s" is already taken' % name)
        if self.one('SELECT 1 FROM queue WHERE name=?', old):
            raise Err('busy', 'Messages are still on their way to you - try again in a moment')
        audience = set(r['name'] for r in self.q(
            'SELECT DISTINCT b.name AS name FROM members a JOIN members b ON a.room=b.room WHERE a.name=?', old))
        audience |= set(r['name'] for r in self.q(
            'SELECT DISTINCT x.name AS name FROM watch w JOIN sessions x ON x.token=w.token WHERE w.name=?', old))
        for sql in (
                'UPDATE users SET name=? WHERE name=?', 'UPDATE blocks SET owner=? WHERE owner=?',
                'UPDATE OR REPLACE blocks SET name=? WHERE name=?', 'UPDATE rooms SET owner=? WHERE owner=?',
                'UPDATE members SET name=? WHERE name=?', 'UPDATE OR REPLACE invited SET name=? WHERE name=?',
                'UPDATE invited SET by=? WHERE by=?', 'UPDATE OR REPLACE banned SET name=? WHERE name=?',
                'UPDATE notices SET name=? WHERE name=?', 'UPDATE sessions SET name=? WHERE name=?',
                'UPDATE OR REPLACE watch SET name=? WHERE name=?', 'UPDATE aliases SET new=? WHERE new=?'):
            self.q(sql, name, old)
        self.q('DELETE FROM aliases WHERE old=?', name)
        self.q('INSERT OR REPLACE INTO aliases(old, new) VALUES(?,?)', old, name)
        note = {'t': 'renamed', 'from': old, 'to': name, 'user': self._pub(self._user(name))}
        audience.discard(old)
        audience.discard(name)
        for n in audience:
            self._push_to(n, note)
        self._push_to(name, note, s['token'])  # your other terminals
        return {'name': name}

    def h_signout(self, s, m, now):
        """Close every other place this account is open."""
        closed = 0
        for x in self._sessions(s['name']):
            if x['token'] != s['token']:
                self._push(x['token'], {'t': 'signed_out'})
                closed += 1
        return {'closed': closed}

    def h_send(self, s, m, now):
        env = m.get('env')
        me = s['name']
        if not valid_envelope(env) or env['from'] != me:
            raise Err('bad_message', 'Malformed message')
        c = parse_conv(env['conv'])
        body_key = '%s/%s' % (me, env['id'])
        dup = self.one('SELECT ts FROM bodies WHERE key=?', body_key)
        if dup:
            return {'id': env['id'], 'ts': dup['ts']}

        targets = []
        if c['kind'] == 'dm':
            other = c['b'] if c['a'] == me else c['a'] if c['b'] == me else None
            if not other:
                raise Err('bad_message', 'Malformed message')
            if not self._user(other):
                raise Err('no_such_user', 'There\'s no user called "%s"' % other)
            if not isinstance(env['keys'].get(other), str):
                raise Err('bad_message', 'Malformed message')
            # A blocked sender gets a normal "sent" - the message just never arrives.
            if not self._blocked(other, me):
                targets = [other]
        else:
            if not self._room(c['room']) or not self._is_member(c['room'], me):
                raise Err('not_member', "You're not in #%s" % c['room'])
            targets = [n for n in self._member_names(c['room']) if n != me and isinstance(env['keys'].get(n), str)]

        if targets:
            if self.db_file != ':memory:' and os.path.getsize(self.db_file) > self.max_bytes:
                raise Err('relay_full', 'This relay is out of space right now - try again later')
            keys = env['keys']
            bare = dict(env)
            del bare['keys']
            self.q('INSERT INTO bodies(key, env, ts, dm) VALUES(?,?,?,?)', body_key,
                   json.dumps(bare, separators=(',', ':')), now, 1 if c['kind'] == 'dm' else 0)
            for t in targets:
                self.q('INSERT INTO queue(name, body, wrap) VALUES(?,?,?)', t, body_key, keys[t])
                over = self.q('SELECT id, body FROM queue WHERE name=? ORDER BY id DESC LIMIT -1 OFFSET ?', t, LIMIT_QUEUE).fetchall()
                for row in over:
                    self.q('DELETE FROM queue WHERE id=?', row['id'])
                    self._unref(row['body'])
                ev = self._msg_event(t, body_key, keys[t])
                for ts in self._sessions(t):
                    if ts['mode'] != 'post':
                        self._push(ts['token'], ev)
        self.q('UPDATE sessions SET last_typing=0 WHERE token=?', s['token'])
        return {'id': env['id'], 'ts': now}

    # The recipient confirms it has stored these messages; only then are they deleted here.
    def h_got(self, s, m, now):
        mids = m.get('mids')
        if not isinstance(mids, list):
            return {}
        me = s['name']
        for mid in [x for x in mids[:1000] if isinstance(x, str)]:
            if not self.one('SELECT 1 FROM queue WHERE name=? AND body=?', me, mid):
                continue
            b = self.one('SELECT env, dm FROM bodies WHERE key=?', mid)
            if b and b['dm']:
                env = json.loads(b['env'])
                self._push_to(env['from'], {'t': 'receipt', 'id': env['id'], 'by': me, 'ts': now})
            self.q('DELETE FROM queue WHERE name=? AND body=?', me, mid)
            self._unref(mid)
        return {}

    def h_create(self, s, m, now):
        name = m.get('room')
        if not valid_room(name):
            raise Err('bad_room', ROOM_HELP)
        if self._room(name):
            raise Err('room_exists', '#%s already exists - try joining it' % name)
        self.q('INSERT INTO rooms(name, private, owner, created) VALUES(?,?,?,?)', name, 1 if m.get('private') else 0, s['name'], now)
        self.q('INSERT INTO members(room, name) VALUES(?,?)', name, s['name'])
        self._push_to(s['name'], {'t': 'room', 'room': name, 'event': 'self_join'}, s['token'])
        return {'room': self._room_info(self._room(name)), 'members': self._members_list(name)}

    def h_join(self, s, m, now):
        name = m.get('room')
        me = s['name']
        if not valid_room(name):
            raise Err('bad_room', ROOM_HELP)
        room = self._room(name)
        if not room:
            raise Err('no_such_room', "There's no server called #%s" % name)
        if not self._is_member(name, me):
            if self.one('SELECT 1 FROM banned WHERE room=? AND name=?', name, me):
                raise Err('removed', 'You were removed from #%s by its owner - only they can invite you back' % name)
            if room['private'] and not self.one('SELECT 1 FROM invited WHERE room=? AND name=?', name, me):
                raise Err('invite_only', '#%s is invite-only - ask a member to invite you' % name)
            if len(self._member_names(name)) >= self.max_members:
                raise Err('room_full', '#%s is full' % name)
            self.q('INSERT INTO members(room, name) VALUES(?,?)', name, me)
            self.q('DELETE FROM invited WHERE room=? AND name=?', name, me)
            self._room_cast(name, {'t': 'room', 'room': name, 'event': 'join', 'user': self._pub(self._user(me))}, me)
            self._push_to(me, {'t': 'room', 'room': name, 'event': 'self_join'}, s['token'])
        return {'room': self._room_info(self._room(name)), 'members': self._members_list(name)}

    def h_leave(self, s, m, now):
        room = self._room(m.get('room'))
        me = s['name']
        if not room or not self._is_member(room['name'], me):
            return {}
        name = room['name']
        self.q('DELETE FROM members WHERE room=? AND name=?', name, me)
        left = self._member_names(name)
        if not left:
            for table in ('rooms',):
                self.q('DELETE FROM %s WHERE name=?' % table, name)
            self.q('DELETE FROM invited WHERE room=?', name)
            self.q('DELETE FROM banned WHERE room=?', name)
        else:
            owner = room['owner']
            if owner == me:
                owner = left[0]  # the longest-standing member takes over
                self.q('UPDATE rooms SET owner=? WHERE name=?', owner, name)
            self._room_cast(name, {'t': 'room', 'room': name, 'event': 'leave', 'name': me, 'owner': owner}, me)
        self._push_to(me, {'t': 'room', 'room': name, 'event': 'self_leave'}, s['token'])
        return {}

    def h_invite(self, s, m, now):
        room = self._room(m.get('room'))
        me = s['name']
        if not room or not self._is_member(room['name'], me):
            raise Err('not_member', "You're not in that server")
        target = self._user(m.get('name'))
        if not target:
            raise Err('no_such_user', 'There\'s no user called "%s"' % str(m.get('name'))[:24])
        name, who = room['name'], target['name']
        if self._is_member(name, who):
            raise Err('already_member', '%s is already in #%s' % (who, name))
        if self.one('SELECT 1 FROM banned WHERE room=? AND name=?', name, who):
            if room['owner'] != me:
                raise Err('removed', '%s was removed by the owner - only %s can invite them back' % (who, room['owner']))
            self.q('DELETE FROM banned WHERE room=? AND name=?', name, who)
        if self._blocked(who, me):
            return {}
        self.q('INSERT OR REPLACE INTO invited(room, name, by) VALUES(?,?,?)', name, who, me)
        self._push_to(who, {'t': 'room', 'room': name, 'event': 'invite', 'by': me})
        return {}

    # Only the owner can remove someone. They can't rejoin unless the owner invites
    # them back, and (because each message is encrypted per member) nothing sent
    # after this moment can be read by them.
    def h_kick(self, s, m, now):
        room = self._room(m.get('room'))
        me = s['name']
        who = m.get('name')
        if not room or not self._is_member(room['name'], me):
            raise Err('not_member', "You're not in that server")
        name = room['name']
        if room['owner'] != me:
            raise Err('not_owner', 'Only the owner of #%s (%s) can remove people' % (name, room['owner']))
        if not valid_name(who):
            raise Err('bad_name', 'Who do you want to remove?')
        if who == me:
            raise Err('bad_name', "You can't remove yourself - leave instead")
        if not self._is_member(name, who):
            # Not in the server (maybe only invited, maybe never here): keep them out.
            if not self._user(who):
                raise Err('not_there', 'There\'s no user called "%s"' % who)
            self.q('DELETE FROM invited WHERE room=? AND name=?', name, who)
            self.q('INSERT OR IGNORE INTO banned(room, name) VALUES(?,?)', name, who)
            return {'blocked': True}
        self.q('DELETE FROM members WHERE room=? AND name=?', name, who)
        self.q('DELETE FROM invited WHERE room=? AND name=?', name, who)
        self.q('INSERT OR IGNORE INTO banned(room, name) VALUES(?,?)', name, who)
        if any(x['mode'] != 'post' for x in self._sessions(who)):
            self._push_to(who, {'t': 'room', 'room': name, 'event': 'kicked', 'by': me})
        elif self.one('SELECT COUNT(*) AS n FROM notices WHERE name=?', who)['n'] < 20:
            self.q('INSERT INTO notices(name, body) VALUES(?,?)', who, json.dumps({'kind': 'kicked', 'room': name, 'by': me}))
        note = {'t': 'room', 'room': name, 'event': 'kick', 'name': who, 'by': me}
        self._room_cast(name, note, me)
        self._push_to(me, note, s['token'])
        return {}

    def h_owner(self, s, m, now):
        """The owner hands the server to another member."""
        room = self._room(m.get('room'))
        me = s['name']
        who = m.get('name')
        if not room or not self._is_member(room['name'], me):
            raise Err('not_member', "You're not in that server")
        name = room['name']
        if room['owner'] != me:
            raise Err('not_owner', 'Only the owner of #%s (%s) can hand it over' % (name, room['owner']))
        if who == me:
            raise Err('bad_name', 'You already own it')
        if not valid_name(who) or not self._is_member(name, who):
            raise Err('not_there', "%s isn't in #%s" % (str(who)[:24], name))
        self.q('UPDATE rooms SET owner=? WHERE name=?', who, name)
        note = {'t': 'room', 'room': name, 'event': 'owner', 'name': who, 'by': me}
        self._room_cast(name, note, me)
        self._push_to(me, note, s['token'])
        return {}

    def h_rooms(self, s, m, now):
        rows = self.q(
            'SELECT r.name AS name, (SELECT COUNT(*) FROM members m WHERE m.room=r.name) AS n,'
            ' EXISTS(SELECT 1 FROM members m WHERE m.room=r.name AND m.name=?) AS joined'
            ' FROM rooms r WHERE r.private=0 ORDER BY n DESC, r.name LIMIT 200', s['name']).fetchall()
        return {'rooms': [{'name': r['name'], 'members': r['n'], 'joined': bool(r['joined'])} for r in rows]}

    def h_members(self, s, m, now):
        room = self._room(m.get('room'))
        if not room or not self._is_member(room['name'], s['name']):
            raise Err('not_member', "You're not in that server")
        return {'room': self._room_info(room), 'members': self._members_list(room['name'])}

    # Presence is mutual: you only appear online to people who are in your contacts
    # AND have you in theirs. Anyone can ask; only live sessions are ever shown.
    def h_watch(self, s, m, now):
        raw = m.get('names') if isinstance(m.get('names'), list) else []
        names = []
        for n in raw:
            if valid_name(n) and n not in names:
                names.append(n)
        names = names[:LIMIT_WATCH]
        me = s['name']
        online = [n for n in names if self._watches(n, me)]
        if s['mode'] == 'live':
            before = set(r['name'] for r in self.q('SELECT name FROM watch WHERE token=?', s['token']))
            self.q('DELETE FROM watch WHERE token=?', s['token'])
            for n in names:
                self.q('INSERT INTO watch(token, name) VALUES(?,?)', s['token'], n)
            for n in names:
                if n not in before and self._watches(n, me):
                    self._push_live(n, {'t': 'presence', 'name': me, 'online': True})
            for n in before:
                if n not in names and not self._watches(me, n) and self._watches(n, me):
                    self._push_live(n, {'t': 'presence', 'name': me, 'online': False})
        return {'online': online}

    def h_typing(self, s, m, now):
        if now - (s['last_typing'] or 0) < 1500:
            return {}
        self.q('UPDATE sessions SET last_typing=? WHERE token=?', now, s['token'])
        c = parse_conv(m.get('conv'))
        if not c:
            return {}
        me = s['name']
        note = {'t': 'typing', 'from': me, 'conv': m['conv']}
        if c['kind'] == 'dm':
            other = c['b'] if c['a'] == me else c['a'] if c['b'] == me else None
            if other and self._user(other) and not self._blocked(other, me):
                self._push_live(other, note)
        elif self._room(c['room']) and self._is_member(c['room'], me):
            names = self._member_names(c['room'])
            if len(names) <= 30:
                for n in names:
                    if n != me:
                        self._push_live(n, note)
        return {}

    def h_block(self, s, m, now):
        who = m.get('name')
        me = s['name']
        if not valid_name(who) or who == me:
            raise Err('bad_name', 'Who do you want to block?')
        if len(self._blocked_list(me)) >= 1000:
            raise Err('limit', 'Your block list is full')
        self.q('INSERT OR IGNORE INTO blocks(owner, name) VALUES(?,?)', me, who)
        return {'blocked': self._blocked_list(me)}

    def h_unblock(self, s, m, now):
        self.q('DELETE FROM blocks WHERE owner=? AND name=?', s['name'], str(m.get('name')))
        return {'blocked': self._blocked_list(s['name'])}

    # ── the web side ─────────────────────────────────────────────────────────

    def _file(self, *parts):
        path = os.path.join(REPO_DIR, *parts)
        try:
            stamp = os.path.getmtime(path)
        except OSError:
            return None
        hit = self._files.get(path)
        if not hit or hit[0] != stamp:
            with open(path, encoding='utf-8') as f:
                hit = (stamp, f.read())
            self._files[path] = hit
        return hit[1]

    def _origin(self, environ):
        """This site's own address, e.g. https://dhruv.pythonanywhere.com"""
        if self.public_url:
            return self.public_url
        host = environ.get('HTTP_HOST') or ''
        if not HOST_RE.fullmatch(host):  # it ends up inside a shell script, so be strict
            return ''
        secure = (environ.get('wsgi.url_scheme') == 'https' or environ.get('HTTP_X_FORWARDED_PROTO') == 'https'
                  or host.endswith('.pythonanywhere.com'))
        return ('https://' if secure else 'http://') + host

    def _ip(self, environ):
        if self.trust_proxy:
            fwd = environ.get('HTTP_X_REAL_IP') or (environ.get('HTTP_X_FORWARDED_FOR') or '').split(',')[0].strip()
            if fwd:
                return fwd[:64]
        return environ.get('REMOTE_ADDR') or '?'

    def page(self, origin):
        html = self._file('site', 'index.html')
        if html is None:
            return None
        if origin:
            conf = json.dumps({'sh': origin + '/install.sh', 'ps1': origin + '/install.ps1', 'hub': origin, 'name': self.name})
            html = re.sub(r'(<script id="gossip-site" type="application/json">).*?(</script>)',
                          lambda mm: mm.group(1) + conf.replace('<', '\\u003c') + mm.group(2), html, count=1, flags=re.S)
        return html

    def installer(self, kind, origin):
        text = self._file('install.sh' if kind == 'sh' else 'install.ps1')
        if text is None:
            return None
        if not origin:
            return text
        if kind == 'sh':
            head, _, rest = text.partition('\n')
            return '%s\nGOSSIP_HUB="${GOSSIP_HUB:-%s}"\n%s' % (head, origin, rest)
        return "if (-not $env:GOSSIP_HUB) { $env:GOSSIP_HUB = '%s' }\n%s" % (origin, text)

    def wsgi(self, environ, start_response):
        method = environ.get('REQUEST_METHOD', 'GET')
        path = environ.get('PATH_INFO') or '/'

        def send(status, body, ctype='text/plain; charset=utf-8', extra=()):
            data = body.encode('utf-8') if isinstance(body, str) else body
            start_response(status, [('Content-Type', ctype), ('Content-Length', str(len(data))),
                                    ('Cache-Control', 'no-store'), ('X-Content-Type-Options', 'nosniff')] + list(extra))
            return [data]

        def send_json(obj, status='200 OK'):
            return send(status, json.dumps(obj, separators=(',', ':')), 'application/json')

        if path == '/api':
            if method == 'GET':
                return send_json(self.info())
            if method != 'POST':
                return send('405 Method Not Allowed', 'use POST\n')
            try:
                size = int(environ.get('CONTENT_LENGTH') or 0)
            except ValueError:
                size = 0
            if size <= 0 or size > LIMIT_BODY:
                return send_json({'t': 'err', 'code': 'bad_request', 'msg': 'Request too large'}, '413 Payload Too Large')
            try:
                m = json.loads(environ['wsgi.input'].read(size).decode('utf-8'))
            except Exception:
                return send_json({'t': 'err', 'code': 'bad_request', 'msg': 'Malformed request'}, '400 Bad Request')
            return send_json(self.handle(m, self._ip(environ)))
        if method not in ('GET', 'HEAD'):
            return send('405 Method Not Allowed', 'not allowed\n')
        origin = self._origin(environ)
        if path in ('/', '/index.html'):
            html = self.page(origin)
            if html is not None:
                return send('200 OK', html, 'text/html; charset=utf-8')
            return send('200 OK', 'gossip v%s (%s)\n' % (VERSION, self.name))
        if path in ('/install.sh', '/install.ps1'):
            text = self.installer(path.rsplit('.', 1)[1], origin)
            if text is not None:
                return send('200 OK', text)
        if path == '/healthz':
            with self.lock:
                live = self.one("SELECT COUNT(DISTINCT name) AS n FROM sessions WHERE mode='live'")['n']
            return send('200 OK', 'gossip v%s (%s) - %d online\n' % (VERSION, self.name, live))
        if path == '/favicon.ico':
            return send('204 No Content', b'')
        return send('404 Not Found', 'not found\n')


# ── start-up ─────────────────────────────────────────────────────────────────

_hub = None
_hub_lock = threading.Lock()


def _turn(value):
    """TURN servers for calls: a list like the browser's own, or "turn:host:port user pass, ..."."""
    if not value:
        return []
    if isinstance(value, str) and value.strip()[:1] in '[{':
        value = json.loads(value)
    if isinstance(value, dict):
        value = [value]
    out = []
    if isinstance(value, str):
        for part in value.split(','):
            bits = part.split()
            if bits and re.match(r'turns?:', bits[0]):
                out.append({'urls': bits[0], 'username': bits[1] if len(bits) > 1 else None, 'credential': bits[2] if len(bits) > 2 else None})
        return out
    for x in value if isinstance(value, list) else []:
        if isinstance(x, dict) and isinstance(x.get('urls'), (str, list)):
            out.append({'urls': x['urls'], 'username': x.get('username'), 'credential': x.get('credential')})
    return out


def _from_env():
    env = os.environ
    data = env.get('GOSSIP_DATA') or os.path.join(os.path.expanduser('~'), 'gossip-data')
    conf = {}
    try:  # optional: ~/gossip-data/config.json  {"name": "...", "motd": "...", "signups": true}
        with open(os.path.join(data, 'config.json'), encoding='utf-8') as f:
            conf = json.load(f)
    except Exception:
        conf = {}
    signups = conf.get('signups', True)
    if re.fullmatch(r'(?i)off|0|no|false', env.get('GOSSIP_SIGNUPS', '')):
        signups = False
    return Hub(
        data_dir=data,
        name=str(env.get('GOSSIP_NAME') or conf.get('name') or 'gossip')[:60],
        motd=str(env.get('GOSSIP_MOTD') or conf.get('motd') or '')[:300],
        signups=bool(signups),
        max_members=int(env.get('GOSSIP_MAX_MEMBERS') or conf.get('max_members') or LIMIT_MEMBERS),
        trust_proxy=env.get('GOSSIP_TRUST_PROXY', '1' if 'PYTHONANYWHERE_DOMAIN' in env else '0') == '1',
        public_url=str(env.get('GOSSIP_PUBLIC_URL') or conf.get('public_url') or ''),
        turn=_turn(env.get('GOSSIP_TURN') or conf.get('turn')),
        turn_server=env.get('GOSSIP_TURN_SERVER') or conf.get('turn_server') or '',
        turn_secret=env.get('GOSSIP_TURN_SECRET') or conf.get('turn_secret') or '',
    )


def application(environ, start_response):
    """The WSGI entry point (this is what PythonAnywhere calls)."""
    global _hub
    if _hub is None:
        with _hub_lock:
            if _hub is None:
                _hub = _from_env()
    return _hub.wsgi(environ, start_response)


def main(argv):
    import argparse
    from socketserver import ThreadingMixIn
    from wsgiref.simple_server import WSGIRequestHandler, WSGIServer, make_server

    ap = argparse.ArgumentParser(description='Run the gossip website + hub on this machine.')
    ap.add_argument('--port', type=int, default=int(os.environ.get('PORT', 8080)))
    ap.add_argument('--host', default='0.0.0.0')
    ap.add_argument('--data', default=None, help='where to keep the database (default ~/gossip-data)')
    ap.add_argument('--quiet', action='store_true')
    args = ap.parse_args(argv)
    if args.data:
        os.environ['GOSSIP_DATA'] = os.path.abspath(args.data)

    class Server(ThreadingMixIn, WSGIServer):
        daemon_threads = True
        allow_reuse_address = True

    class Handler(WSGIRequestHandler):
        def log_message(self, fmt, *a):
            if not args.quiet:
                WSGIRequestHandler.log_message(self, fmt, *a)

    httpd = make_server(args.host, args.port, application, server_class=Server, handler_class=Handler)
    print('gossip website v%s on http://%s:%d  (Ctrl+C to stop)' % (VERSION, args.host, httpd.server_address[1]), flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main(sys.argv[1:])
