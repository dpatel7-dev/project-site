#!/usr/bin/env python3
"""pigeon's server: your own encrypted drive, and a way to pass files between devices.

It only ever sees locked bytes: names, contents and keys are encrypted on your
device before they're sent (see src/crypto.js and web/index.html), and since
pigeon 3 every request travels sealed too (src/wire.js): what you asked, your
sign-in, which file. What it knows: your nest's name, how big each file is,
and when it arrived.

Runs anywhere Python 3.8+ runs, with nothing to install:

    python3 server/pigeon_server.py --port 8080        # try it on your computer
    from pigeon_server import application               # WSGI (PythonAnywhere)

Settings: ~/pigeon-data/config.json (or PIGEON_* environment variables)
    "signups":     "open" (default: anyone can make a nest) or "closed" (nobody new)
    "quota_mb":    400     space on this server for everyone's files (PythonAnywhere's free plan has 512 MB)
    "nest_mb":     100     how much each nest may use (the owner can change it per nest; the owner's own nest can use it all)
    "max_file_mb": 400     the biggest single file
    "public_url":  ""      the site's address, if it can't be worked out
More room: the owner can add storage "barns" (free Backblaze B2 or Cloudflare R2
buckets) from the app; files then go straight from your devices to the bucket,
still locked, and this server only signs short-lived permission slips for them.
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
import urllib.parse

REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHUNK = 4 * 1024 * 1024
MAX_PIECE = CHUNK + 64
NEST_RE = re.compile(r'^[a-z0-9][a-z0-9._-]{1,31}$')
NEST_HELP = 'A nest name is 2-32 characters: letters, numbers, dots, _ and -'
DID_RE = re.compile(r'^[a-f0-9]{16}$')
ID_RE = re.compile(r'^[a-f0-9]{16}$')
CODE_RE = re.compile(r'^[a-z2-9]{8}$')
BOX_RE = re.compile(r'^[a-z2-9]{10}$')
PRINT_RE = re.compile(r'^[a-f0-9]{64}$')
CODE_ABC = 'abcdefghijkmnpqrstuvwxyz23456789'
HOST_RE = re.compile(r'^[A-Za-z0-9.-]+(:\d{1,5})?$')
BUCKET_RE = re.compile(r'^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$')
TOKEN_DAYS = 60
UPLOAD_HOURS = 24
TRASH_DAYS = 30
TIGHT_TRASH_DAYS = 3    # when the site is nearly full, the trash empties sooner
KEEP_VERSIONS = 20      # old versions kept per file (Rewind)
VERSION_DAYS = 90       # ...and for how long
DELIVER_HOURS = 168     # things sent to a device wait this long for it, unless the sender says otherwise
RECEIPT_DAYS = 30
MB = 1024 * 1024
GB = 1024 * MB
DROP_WRAP = 65 + 12 + 32 + 16   # a drop box upload's key: their one-time public key, a nonce, the locked key, its tag


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


def _now():
    return int(time.time() * 1000)


# ── the wire: every request sealed (the same steps as src/wire.js) ──────────

P = int('FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF', 16)
WIRE_SKEW = 15 * 60 * 1000
# asking things doesn't change anything, so a replayed copy is harmless: only the rest are checked for repeats
READ_ONLY = {'hello', 'list', 'devices', 'inbox', 'links', 'shared', 'shared_piece', 'piece_get', 'versions', 'sent',
             'console', 'box_info', 'chores', 'where_get'}


class Rewire(Exception):
    """The site doesn't know this channel (it restarted, or it expired): the device starts a new one."""


def _hkdf(ikm, salt, info, n):
    prk = hmac.new(salt, ikm, hashlib.sha256).digest()
    out, prev, i = b'', b'', 1
    while len(out) < n:
        prev = hmac.new(prk, prev + info + bytes([i]), hashlib.sha256).digest()
        out += prev
        i += 1
    return out[:n]


def _stream(key, nonce, data):
    n = len(data)
    if not n:
        return b''
    ks = b''.join(hmac.digest(key, nonce + i.to_bytes(4, 'big'), 'sha256') for i in range((n + 31) // 32))[:n]
    return (int.from_bytes(data, 'big') ^ int.from_bytes(ks, 'big')).to_bytes(n, 'big')


class Sealed:
    def __init__(self, action, msg, token, raw, keys, nonce, cid):
        self.action, self.msg, self.token, self.raw, self.keys, self.nonce, self.cid = action, msg, token, raw, keys, nonce, cid


class Wire:
    def __init__(self, data_dir, pigeon):
        self.pg = pigeon
        path = os.path.join(data_dir, 'wire.key')
        x = None
        try:
            with open(path, encoding='utf-8') as f:
                x = int(f.read().strip(), 16)
        except (OSError, ValueError):
            pass
        if not x:
            x = int.from_bytes(secrets.token_bytes(32), 'big') | 1
            tmp = path + '.part'
            with open(tmp, 'w', encoding='utf-8') as f:
                f.write('%064x\n' % x)
            try:
                os.chmod(tmp, 0o600)
            except OSError:
                pass
            os.replace(tmp, path)
        self.x = x
        self.y = pow(2, x, P).to_bytes(256, 'big')
        self.public = self.y.hex()

    def _keys(self, cid, yc=None):
        r = self.pg.one('SELECT keys FROM wires WHERE cid = ?', cid)
        if r:
            if _now() - 0 > 0:
                self.pg.q('UPDATE wires SET seen = ? WHERE cid = ?', _now(), cid)
            return bytes(r['keys'])
        if yc is None:
            raise Rewire()
        y = int.from_bytes(yc, 'big')
        if not (1 < y < P - 1):
            raise Err('400 Bad Request', 'Malformed request')
        secret = pow(y, self.x, P).to_bytes(256, 'big')
        keys = _hkdf(secret, b'pigeon-wire-1', yc + self.y, 128)
        self.pg.q('INSERT OR IGNORE INTO wires (cid, keys, made, seen) VALUES (?, ?, ?, ?)', cid, keys, _now(), _now())
        return keys

    def unseal(self, body):
        if len(body) < 1 + 16 + 16 + 4 + 32:
            raise Err('400 Bad Request', 'Malformed request')
        kind = body[:1]
        if kind == b'O':
            if len(body) < 257 + 52:
                raise Err('400 Bad Request', 'Malformed request')
            yc = body[1:257]
            cid = hashlib.sha256(yc).digest()[:16]
            keys = self._keys(cid, yc)
            at = 257
        elif kind == b'N':
            cid = body[1:17]
            keys = self._keys(cid)
            at = 17
        else:
            raise Err('400 Bad Request', 'Malformed request')
        nonce = body[at:at + 16]
        n = int.from_bytes(body[at + 16:at + 20], 'big')
        end = at + 20 + n
        if end + 32 > len(body) or n > 1024 * 1024:
            raise Err('400 Bad Request', 'Malformed request')
        tag = body[end:end + 32]
        if not hmac.compare_digest(hmac.digest(keys[32:64], body[:end], 'sha256'), tag):
            raise Err('400 Bad Request', "That request didn't check out.")
        try:
            msg = json.loads(_stream(keys[:32], nonce, body[at + 20:end]).decode('utf-8'))
            if not isinstance(msg, dict) or not isinstance(msg.get('a'), str) or not isinstance(msg.get('m', {}), dict):
                raise ValueError
        except Exception:
            raise Err('400 Bad Request', 'Malformed request')
        t = msg.get('t')
        if not isinstance(t, (int, float)) or abs(_now() - t) > WIRE_SKEW:
            raise Err('400 Bad Request', "This computer's clock is more than 15 minutes off. Set the right time, then try again.")
        token = msg.get('k') if isinstance(msg.get('k'), str) else None
        return Sealed(msg['a'], msg.get('m') or {}, token, body[end + 32:], keys, nonce, cid)

    def fresh(self, s):
        """Refuse a request that changes something if it was already handled (someone played it back)."""
        if s.action in READ_ONLY:
            return
        try:
            self.pg.q('INSERT INTO wnonce (cid, nonce, at) VALUES (?, ?, ?)', s.cid, s.nonce, _now())
        except sqlite3.IntegrityError:
            raise Err('409 Conflict', 'That request was already handled.')

    def seal(self, keys, req_nonce, obj, raw=b''):
        nonce = secrets.token_bytes(16)
        ct = _stream(keys[64:96], nonce, json.dumps(obj, separators=(',', ':')).encode('utf-8'))
        head = b'R' + nonce + len(ct).to_bytes(4, 'big') + ct
        return head + hmac.digest(keys[96:128], req_nonce + head, 'sha256') + (raw or b'')


# ── storage barns: S3-compatible buckets (Backblaze B2, Cloudflare R2, ...) ──
# The site never moves file bytes to a bucket itself (PythonAnywhere's free plan
# can't reach most of the internet). It signs short-lived URLs (AWS Signature
# Version 4, "presigned"), and your devices send the locked pieces straight there.

def _q(s):
    return urllib.parse.quote(s, safe='-_.~')


def presign(method, scheme, host, path, region, akid, secret, expires=3600, query=None, headers=None, when=None):
    """A presigned S3 URL. `path` is the already-joined object path, like /bucket/key."""
    t = time.gmtime(when if when is not None else time.time())
    amz = time.strftime('%Y%m%dT%H%M%SZ', t)
    day = amz[:8]
    scope = '%s/%s/s3/aws4_request' % (day, region)
    hdrs = {'host': host}
    for k, v in (headers or {}).items():
        hdrs[k.lower()] = str(v).strip()
    signed = ';'.join(sorted(hdrs))
    q = dict(query or {})
    q.update({'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': '%s/%s' % (akid, scope), 'X-Amz-Date': amz,
              'X-Amz-Expires': str(int(expires)), 'X-Amz-SignedHeaders': signed})
    cq = '&'.join('%s=%s' % (_q(k), _q(v)) for k, v in sorted(q.items()))
    uri = urllib.parse.quote(path, safe='/-_.~')
    creq = '\n'.join([method, uri, cq, ''.join('%s:%s\n' % (k, hdrs[k]) for k in sorted(hdrs)), signed, 'UNSIGNED-PAYLOAD'])
    sts = '\n'.join(['AWS4-HMAC-SHA256', amz, scope, hashlib.sha256(creq.encode()).hexdigest()])
    k = hmac.new(('AWS4' + secret).encode(), day.encode(), hashlib.sha256).digest()
    for part in (region, 's3', 'aws4_request'):
        k = hmac.new(k, part.encode(), hashlib.sha256).digest()
    sig = hmac.new(k, sts.encode(), hashlib.sha256).hexdigest()
    return '%s://%s%s?%s&X-Amz-Signature=%s' % (scheme, host, uri, cq, sig)


CORS_XML = ('<?xml version="1.0" encoding="UTF-8"?><CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><CORSRule>'
            '<AllowedOrigin>*</AllowedOrigin><AllowedMethod>GET</AllowedMethod><AllowedMethod>PUT</AllowedMethod>'
            '<AllowedMethod>DELETE</AllowedMethod><AllowedMethod>HEAD</AllowedMethod><AllowedHeader>*</AllowedHeader>'
            '<ExposeHeader>ETag</ExposeHeader><MaxAgeSeconds>3600</MaxAgeSeconds></CORSRule></CORSConfiguration>')
TEST_BODY = b'pigeon was here\n'


def barn_parts(kind, endpoint, region):
    """(scheme, host, region) for a barn, worked out from what the owner typed."""
    e = (endpoint or '').strip()
    if kind == 'r2' and re.match(r'^[a-f0-9]{32}$', e):
        e = 'https://%s.r2.cloudflarestorage.com' % e
    if not re.match(r'^https?://', e):
        e = 'https://' + e
    u = urllib.parse.urlsplit(e)
    host = u.netloc.lower()
    if not HOST_RE.fullmatch(host) or '.' not in host:
        raise Err('400 Bad Request', "That endpoint doesn't look right. It looks like s3.us-west-004.backblazeb2.com")
    if u.scheme != 'https' and not host.startswith(('127.0.0.1', 'localhost')):
        raise Err('400 Bad Request', 'The endpoint has to start with https://')
    m = re.match(r'^s3\.([a-z0-9-]+)\.backblazeb2\.com$', host)
    if m:
        return u.scheme, host, m.group(1)
    if host.endswith('.r2.cloudflarestorage.com'):
        return u.scheme, host, 'auto'
    m = re.match(r'^s3[.-]([a-z0-9-]+)\.amazonaws\.com$', host)
    if m and not region:
        return u.scheme, host, m.group(1)
    return u.scheme, host, (region or 'us-east-1').strip()


# ── the developer console: recent requests and errors, for the site's owner ──

class Console:
    """Requests and errors, one JSON line each, in <data>/console.jsonl (kept to about 2 MB)."""
    LIMIT = 2 * MB

    def __init__(self, data_dir):
        self.path = os.path.join(data_dir, 'console.jsonl')
        self.lock = threading.Lock()

    def add(self, rec):
        line = json.dumps(rec, separators=(',', ':'), default=str) + '\n'
        with self.lock:
            try:
                with open(self.path, 'a', encoding='utf-8') as f:
                    f.write(line)
                if os.path.getsize(self.path) > self.LIMIT:
                    with open(self.path, 'rb') as f:
                        f.seek(-self.LIMIT // 2, os.SEEK_END)
                        keep = f.read()
                    keep = keep[keep.find(b'\n') + 1:]
                    with open(self.path + '.part', 'wb') as f:
                        f.write(keep)
                    os.replace(self.path + '.part', self.path)
            except OSError:
                pass

    def tail(self, since=0, limit=400):
        try:
            with open(self.path, 'rb') as f:
                f.seek(0, os.SEEK_END)
                size = f.tell()
                f.seek(max(0, size - 900 * 1024))
                data = f.read()
        except OSError:
            return []
        out = []
        for line in data.split(b'\n'):
            try:
                r = json.loads(line)
            except ValueError:
                continue
            if isinstance(r, dict) and r.get('t', 0) > since:
                out.append(r)
        return out[-limit:] if limit else out


def _mask(ip):
    if re.match(r'^\d+\.\d+\.\d+\.\d+$', ip or ''):
        return '.'.join(ip.split('.')[:3]) + '.x'
    if ':' in (ip or ''):
        return ':'.join(ip.split(':')[:3]) + ':…'
    return ip or '?'


class Pigeon:
    def __init__(self, data_dir, signups='open', quota_mb=400, max_file_mb=400, public_url='', nest_mb=100):
        self.dir = data_dir
        self.files_dir = os.path.join(data_dir, 'files')
        os.makedirs(self.files_dir, exist_ok=True)
        self.signups = 'closed' if signups == 'closed' else 'open'  # ("first", the old invite-only setting, now means open)
        self.quota = int(float(quota_mb) * 1024 * 1024)
        self.max_file = int(float(max_file_mb) * 1024 * 1024)
        self.nest_default = int(float(nest_mb) * MB)
        self.public_url = (public_url or '').rstrip('/')
        self.lock = threading.RLock()
        # No write-ahead log: PythonAnywhere keeps files on a network disk, where
        # SQLite's WAL mode fails ("disk I/O error"). The classic journal works there.
        self.db = sqlite3.connect(os.path.join(data_dir, 'pigeon.db'), timeout=20, check_same_thread=False, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        try:
            self.db.execute('PRAGMA journal_mode=DELETE')
        except sqlite3.Error:
            pass
        self.db.executescript('''
            CREATE TABLE IF NOT EXISTS nests (name TEXT PRIMARY KEY, salt TEXT, proof TEXT, made INTEGER);
            CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, nest TEXT, device TEXT, made INTEGER, seen INTEGER);
            CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, nest TEXT, size INTEGER, chunks INTEGER, meta TEXT,
                wrapped TEXT, made INTEGER, done INTEGER DEFAULT 0, stored INTEGER DEFAULT 0, device TEXT);
            CREATE TABLE IF NOT EXISTS shares (code TEXT PRIMARY KEY, file TEXT, nest TEXT, expires INTEGER, hits INTEGER DEFAULT 0);
            CREATE TABLE IF NOT EXISTS fails (key TEXT, at INTEGER);
            DROP TABLE IF EXISTS invites;
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
            CREATE TABLE IF NOT EXISTS wires (cid BLOB PRIMARY KEY, keys BLOB, made INTEGER, seen INTEGER);
            CREATE TABLE IF NOT EXISTS wnonce (cid BLOB, nonce BLOB, at INTEGER, PRIMARY KEY (cid, nonce));
            CREATE TABLE IF NOT EXISTS barns (id TEXT PRIMARY KEY, kind TEXT, scheme TEXT, host TEXT, region TEXT, bucket TEXT,
                akid TEXT, secret TEXT, cap INTEGER, made INTEGER, state TEXT, signlen INTEGER DEFAULT 1, note TEXT);
            CREATE TABLE IF NOT EXISTS bpieces (blob TEXT, n INTEGER, size INTEGER, PRIMARY KEY (blob, n));
            CREATE TABLE IF NOT EXISTS chores (id INTEGER PRIMARY KEY AUTOINCREMENT, barn TEXT, key TEXT, size INTEGER, made INTEGER);
            CREATE TABLE IF NOT EXISTS receipts (id INTEGER PRIMARY KEY AUTOINCREMENT, nest TEXT, file TEXT, from_did TEXT, to_did TEXT,
                made INTEGER, got INTEGER DEFAULT 0, gone TEXT, meta TEXT, wrapped TEXT, size INTEGER);
            CREATE TABLE IF NOT EXISTS boxes (code TEXT PRIMARY KEY, nest TEXT, title TEXT, note TEXT, pub TEXT, priv TEXT,
                made INTEGER, expires INTEGER, max INTEGER, files INTEGER DEFAULT 0, used INTEGER DEFAULT 0, open INTEGER DEFAULT 1);
            CREATE TABLE IF NOT EXISTS consoles (hash TEXT PRIMARY KEY, made INTEGER, seen INTEGER);
        ''')
        # newer columns (older pigeon sites get them added in place)
        for table, col, kind in [('nests', 'owner', 'INTEGER DEFAULT 0'), ('nests', 'quota', 'INTEGER DEFAULT 0'), ('tokens', 'did', 'TEXT'), ('files', 'kind', "TEXT DEFAULT 'file'"),
                                 ('files', 'trashed', 'INTEGER DEFAULT 0'), ('files', 'to_did', 'TEXT'), ('files', 'from_did', 'TEXT'),
                                 ('files', 'got', 'INTEGER DEFAULT 0'), ('files', 'blob', 'TEXT'), ('files', 'barn', 'TEXT'), ('files', 'line', 'TEXT'),
                                 ('files', 'old', 'INTEGER DEFAULT 0'), ('files', 'prev', 'TEXT'), ('files', 'print', 'TEXT'), ('files', 'box', 'TEXT'),
                                 ('files', 'hop', 'INTEGER DEFAULT 0'), ('files', 'ttl', 'INTEGER DEFAULT 0'), ('files', 'ticket', 'TEXT')]:
            have = [r[1] for r in self.db.execute('PRAGMA table_info(%s)' % table).fetchall()]
            if col not in have:
                self.db.execute('ALTER TABLE %s ADD COLUMN %s %s' % (table, col, kind))
        self.db.execute('UPDATE files SET blob = id WHERE blob IS NULL')
        for ix in ('files(nest)', 'files(blob)', 'files(line)', 'files(print)', 'files(to_did)', 'receipts(nest)'):
            self.db.execute('CREATE INDEX IF NOT EXISTS ix_%s ON %s' % (re.sub(r'\W', '_', ix), ix))
        if not self.db.execute('SELECT 1 FROM nests WHERE owner = 1').fetchall():
            first = self.db.execute('SELECT name FROM nests ORDER BY made LIMIT 1').fetchall()
            if first:
                self.db.execute('UPDATE nests SET owner = 1 WHERE name = ?', (first[0][0],))
        # Who can make a nest is the owner's choice, made in the app (People and space) and kept
        # here. pigeon 2.5 opened every site once, as asked; after that the owner's switch decides.
        if not self._setting('signups_opened_once'):
            self.db.execute("INSERT OR REPLACE INTO settings VALUES ('signups', 'open')")
            self.db.execute("INSERT OR REPLACE INTO settings VALUES ('signups_opened_once', '1')")
        saved = self._setting('signups')
        if saved in ('open', 'closed'):
            self.signups = saved
        self._swept = 0
        self._pages = {}
        self.wire = Wire(data_dir, self)
        self.console = Console(data_dir)

    def _setting(self, key):
        r = self.db.execute('SELECT value FROM settings WHERE key = ?', (key,)).fetchall()
        return r[0][0] if r else None

    def _set(self, key, value):
        if value is None:
            self.q('DELETE FROM settings WHERE key = ?', key)
        else:
            self.q('INSERT OR REPLACE INTO settings VALUES (?, ?)', key, str(value))

    # ── storage ─────────────────────────────────────────────────────────────
    def q(self, sql, *args):
        with self.lock:
            return self.db.execute(sql, args).fetchall()

    def one(self, sql, *args):
        rows = self.q(sql, *args)
        return rows[0] if rows else None

    def used(self, nest=None):
        if nest:
            r = self.one('SELECT COALESCE(SUM(stored), 0) AS n FROM files WHERE nest = ?', nest)
        else:
            r = self.one('SELECT COALESCE(SUM(stored), 0) AS n FROM files')
        return int(r['n'])

    def disk_used(self):
        return int(self.one('SELECT COALESCE(SUM(stored), 0) AS n FROM files WHERE barn IS NULL')['n'])

    def barn_used(self, bid):
        a = self.one('SELECT COALESCE(SUM(stored), 0) AS n FROM files WHERE barn = ?', bid)['n']
        b = self.one('SELECT COALESCE(SUM(size), 0) AS n FROM chores WHERE barn = ?', bid)['n']
        return int(a) + int(b)

    def barns_ok(self):
        return self.q("SELECT * FROM barns WHERE state = 'ok' ORDER BY made")

    def capacity(self):
        """Room for everyone's files: this server's share plus every working barn."""
        return self.quota + sum(int(b['cap']) for b in self.barns_ok())

    def limit_of(self, nest):
        """How much one nest may use: the owner's nest can use the whole site; others get their share."""
        r = self.one('SELECT owner, quota FROM nests WHERE name = ?', nest)
        if not r:
            return 0
        cap = self.capacity()
        if r['owner'] and not r['quota']:
            return cap
        return min(cap, int(r['quota'] or self.nest_default))

    def _place(self, nest, more, barns=False):
        """Where `more` new bytes go: a barn's id, or None for this server's disk. Raises if they fit nowhere."""
        mine, cap = self.used(nest), self.limit_of(nest)
        if mine + more > cap + MB:
            raise Err('507 Insufficient Storage', "Your nest is full (%d of %d MB). Empty the trash or delete some files first%s." % (
                mine // MB, cap // MB, '' if self._owner(nest) else ", or ask the site's owner for more room"))
        if barns:
            best, room = None, 0
            for b in self.barns_ok():
                free = int(b['cap']) - self.barn_used(b['id'])
                if free >= more + MB and free > room:
                    best, room = b['id'], free
            if best:
                return best
        total = self.disk_used()
        if total + more > self.quota + MB:
            raise Err('507 Insufficient Storage', "This site is full (everyone's files together use %d of %d MB). Delete some files, or ask the site's owner to add a storage barn." % (
                (total + sum(self.barn_used(b['id']) for b in self.barns_ok())) // MB, self.capacity() // MB))
        return None

    def _room(self, nest, more, barn=None):
        """Raise a friendly error if `more` bytes won't fit in this nest, or where its pieces live."""
        mine, cap = self.used(nest), self.limit_of(nest)
        if more > 0 and mine + more > cap + MB:
            raise Err('507 Insufficient Storage', "Your nest is full (%d of %d MB). Empty the trash or delete some files first%s." % (
                mine // MB, cap // MB, '' if self._owner(nest) else ", or ask the site's owner for more room"))
        if more > 0 and barn:
            b = self.one('SELECT cap FROM barns WHERE id = ?', barn)
            if b and self.barn_used(barn) + more > int(b['cap']) + MB:
                raise Err('507 Insufficient Storage', 'That storage barn is full. Ask the site owner to give it more room or add another.')
        elif more > 0 and self.disk_used() + more > self.quota + MB:
            raise Err('507 Insufficient Storage', "This site is full (%d of %d MB on the server). Delete some files, or ask the site's owner to add a storage barn." % (
                self.disk_used() // MB, self.quota // MB))

    def _piece_path(self, blob, n):
        return os.path.join(self.files_dir, blob, '%d' % n)

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
        self.q('DELETE FROM wires WHERE seen < ?', ms - 24 * 3600000)
        self.q('DELETE FROM wnonce WHERE at < ?', ms - 2 * WIRE_SKEW)
        self.q('DELETE FROM consoles WHERE seen < ?', ms - 12 * 3600000)
        self.q('DELETE FROM receipts WHERE made < ?', ms - RECEIPT_DAYS * 86400000)
        for r in self.q('SELECT id FROM files WHERE trashed > 0 AND trashed < ?', ms - TRASH_DAYS * 86400000):
            self._drop(r['id'])
        if self.used() > self.capacity() * 0.9:  # nearly full: the trash empties after a few days instead
            for r in self.q('SELECT id FROM files WHERE trashed > 0 AND trashed < ?', ms - TIGHT_TRASH_DAYS * 86400000):
                self._drop(r['id'])
        for r in self.q('SELECT id FROM files WHERE old > 0 AND old < ?', ms - VERSION_DAYS * 86400000):
            self._drop(r['id'])
        # things sent to a device that never came for them
        for r in self.q('SELECT id, hop FROM files WHERE to_did IS NOT NULL AND got = 0 AND ttl > 0 AND ttl < ?', ms):
            self.q("UPDATE receipts SET gone = 'expired' WHERE file = ? AND got = 0", r['id'])
            if r['hop']:
                self._drop(r['id'])
            else:
                self.q('UPDATE files SET to_did = NULL, ttl = 0 WHERE id = ?', r['id'])
        self.q('UPDATE boxes SET open = 0 WHERE expires < ?', ms)
        self.q('DELETE FROM boxes WHERE expires < ?', ms - 30 * 86400000)

    def _drop(self, fid):
        r = self.one('SELECT id, blob, barn, stored FROM files WHERE id = ?', fid)
        if not r:
            return
        self.q('DELETE FROM files WHERE id = ?', fid)
        self.q('DELETE FROM shares WHERE file = ?', fid)
        self._release(r['blob'] or r['id'], r['barn'], int(r['stored'] or 0))

    def _release(self, blob, barn, stored):
        """The bytes behind a file go once nothing points at them any more."""
        left = self.q('SELECT id, stored FROM files WHERE blob = ? ORDER BY stored DESC, made', blob)
        if left:
            if stored and not any(int(x['stored'] or 0) for x in left):  # the entry that counted the bytes went: the next one counts them
                self.q('UPDATE files SET stored = ? WHERE id = ?', stored, left[0]['id'])
            return
        if barn:
            now = _now()
            for p in self.q('SELECT n, size FROM bpieces WHERE blob = ?', blob):
                self.q('INSERT INTO chores (barn, key, size, made) VALUES (?, ?, ?, ?)', barn, 'pigeon/%s/%d' % (blob, p['n']), p['size'], now)
            self.q('DELETE FROM bpieces WHERE blob = ?', blob)
        else:
            shutil.rmtree(os.path.join(self.files_dir, blob), ignore_errors=True)

    # ── accounts ────────────────────────────────────────────────────────────
    def _token(self, nest, device, did=None):
        token = secrets.token_hex(32)
        now = _now()
        did = did if isinstance(did, str) and DID_RE.match(did) else secrets.token_hex(8)
        self.q('INSERT INTO tokens (hash, nest, device, made, seen, did) VALUES (?, ?, ?, ?, ?, ?)',
               hashlib.sha256(token.encode()).hexdigest(), nest, str(device or '')[:400], now, now, did)
        return token, did

    def auth_token(self, token):
        if not isinstance(token, str) or not re.match(r'^[a-f0-9]{64}$', token):
            raise Err('401 Unauthorized', 'Please log in.')
        th = hashlib.sha256(token.encode()).hexdigest()
        r = self.one('SELECT nest, seen, did FROM tokens WHERE hash = ?', th)
        if not r:
            raise Err('401 Unauthorized', 'You were logged out. Please log in again.')
        now = _now()
        if now - r['seen'] > 30000:
            self.q('UPDATE tokens SET seen = ? WHERE hash = ?', now, th)
        return r['nest'], th, (r['did'] or th[:16])

    def auth(self, environ):
        m = re.match(r'^Bearer ([a-f0-9]{64})$', environ.get('HTTP_AUTHORIZATION') or '')
        if not m:
            raise Err('401 Unauthorized', 'Please log in.')
        return self.auth_token(m.group(1))

    def _slow_down(self, key, limit=8):
        n = self.one('SELECT COUNT(*) AS n FROM fails WHERE key = ? AND at > ?', key, _now() - 600000)['n']
        if n >= limit:
            raise Err('429 Too Many Requests', 'Too many wrong passwords. Wait 10 minutes, then try again.')

    def hello(self, m):
        nest = str(m.get('nest') or '').strip().lower()
        if not NEST_RE.match(nest):
            raise Err('400 Bad Request', NEST_HELP)
        r = self.one('SELECT salt FROM nests WHERE name = ?', nest)
        if r:
            return {'exists': True, 'salt': r['salt']}
        return {'exists': False, 'canMake': self._can_make()}

    def _can_make(self):
        return self.signups != 'closed'

    def signup(self, m, ip):
        nest = str(m.get('nest') or '').strip().lower()
        if not NEST_RE.match(nest):
            raise Err('400 Bad Request', NEST_HELP)
        if not _b64ok(m.get('salt'), 16, 16) or not re.match(r'^[a-f0-9]{64}$', str(m.get('proof') or '')):
            raise Err('400 Bad Request', 'Malformed request')
        with self.lock:
            if self.one('SELECT 1 AS x FROM nests WHERE name = ?', nest):
                raise Err('409 Conflict', 'That nest already exists. Open it instead (same name and password).')
            first = self.one('SELECT COUNT(*) AS n FROM nests')['n'] == 0
            if not self._can_make():
                raise Err('403 Forbidden', "This pigeon site isn't taking new nests right now. Open the nest you already have.")
            self.q('INSERT INTO nests (name, salt, proof, made, owner) VALUES (?, ?, ?, ?, ?)', nest, m['salt'],
                   hashlib.sha256(m['proof'].encode()).hexdigest(), _now(), 1 if first else 0)
        token, did = self._token(nest, m.get('device'), m.get('did'))
        return {'token': token, 'did': did}

    def login(self, m, ip):
        nest = str(m.get('nest') or '').strip().lower()
        proof = str(m.get('proof') or '')
        key = nest + '|' + ip
        self._slow_down(key)
        r = self.one('SELECT proof FROM nests WHERE name = ?', nest)
        if not r or not hmac.compare_digest(r['proof'], hashlib.sha256(proof.encode()).hexdigest()):
            self.q('INSERT INTO fails VALUES (?, ?)', key, _now())
            raise Err('403 Forbidden', 'Wrong nest name or password.')
        token, did = self._token(nest, m.get('device'), m.get('did'))
        return {'token': token, 'did': did}

    def _owner(self, nest):
        r = self.one('SELECT owner FROM nests WHERE name = ?', nest)
        return bool(r and r['owner'])

    def _must_own(self, nest):
        if not self._owner(nest):
            raise Err('403 Forbidden', "Only this site's owner can do that.")

    def people(self, nest, m):
        """For the site's owner: every nest, how much it uses, and a way to give more room or remove one."""
        self._must_own(nest)
        act = m.get('do')
        who = str(m.get('nest') or '').strip().lower()
        if act == 'signups':
            self.signups = 'open' if m.get('open') else 'closed'
            self._set('signups', self.signups)
        if act == 'sealed':
            self._set('sealed_only', '1' if m.get('on') else None)
        if act in ('limit', 'remove'):
            r = self.one('SELECT owner FROM nests WHERE name = ?', who)
            if not r:
                raise Err('404 Not Found', 'There is no nest called %s.' % who)
            if act == 'limit':
                mb = m.get('mb')
                cap = self.capacity()
                if not isinstance(mb, (int, float)) or not (0 <= mb <= cap / MB):
                    raise Err('400 Bad Request', 'Give a number of MB between 0 and %d.' % (cap // MB))
                self.q('UPDATE nests SET quota = ? WHERE name = ?', int(mb * MB), who)
            else:
                if r['owner']:
                    raise Err('409 Conflict', "That's your own nest: it can't be removed from here.")
                for f in self.q('SELECT id FROM files WHERE nest = ?', who):
                    self._drop(f['id'])
                self.q('DELETE FROM tokens WHERE nest = ?', who)
                self.q('DELETE FROM shares WHERE nest = ?', who)
                self.q('DELETE FROM boxes WHERE nest = ?', who)
                self.q('DELETE FROM receipts WHERE nest = ?', who)
                self.q('DELETE FROM nests WHERE name = ?', who)
        rows = []
        for r in self.q('SELECT name, owner, made FROM nests ORDER BY made'):
            seen = self.one('SELECT MAX(seen) AS s FROM tokens WHERE nest = ?', r['name'])['s'] or 0
            n = self.one("SELECT COUNT(*) AS n FROM files WHERE nest = ? AND kind != 'dir' AND hop = 0 AND old = 0", r['name'])['n']
            rows.append({'nest': r['name'], 'owner': bool(r['owner']), 'used': self.used(r['name']), 'limit': self.limit_of(r['name']),
                         'files': n, 'made': r['made'], 'seen': seen})
        # (no disk-free figure: on shared hosts like PythonAnywhere it shows the whole
        # server's disk, not your own allowance, so it would only mislead)
        return {'nests': rows, 'used': self.used(), 'quota': self.capacity(), 'disk': {'used': self.disk_used(), 'quota': self.quota},
                'nestDefault': self.nest_default, 'signups': self.signups, 'sealedOnly': bool(self._setting('sealed_only')),
                'console': bool(self._setting('console_hash') or os.environ.get('PIGEON_CONSOLE_PASSWORD')),
                'barns': len(self.barns_ok())}

    def _row(self, r, vers=None):
        return {'id': r['id'], 'size': r['size'], 'chunks': r['chunks'], 'meta': r['meta'], 'wrapped': r['wrapped'],
                'made': r['made'], 'done': bool(r['done']), 'device': r['device'] or '', 'kind': r['kind'] or 'file',
                'trashed': r['trashed'] or 0, 'to': r['to_did'] or '', 'from': r['from_did'] or '', 'got': r['got'] or 0,
                'barn': bool(r['barn']), 'line': r['line'] or r['id'], 'old': r['old'] or 0, 'box': r['box'] or '',
                'hop': bool(r['hop']), 'vers': (vers or {}).get(r['line'] or r['id'], 0)}

    def list(self, nest, did):
        rows = self.q('SELECT * FROM files WHERE nest = ? AND old = 0 AND hop = 0 ORDER BY made DESC', nest)
        vers = {r['line']: r['n'] for r in self.q('SELECT line, COUNT(*) AS n FROM files WHERE nest = ? AND old > 0 GROUP BY line', nest)}
        cap = self.capacity()
        tight = self.used() > cap * 0.9
        return {'files': [self._row(r, vers) for r in rows], 'used': self.used(nest), 'quota': self.limit_of(nest), 'siteUsed': self.used(), 'siteQuota': cap,
                'trashSoon': tight, 'maxFile': self.max_file, 'chores': self.one('SELECT COUNT(*) AS n FROM chores')['n'],
                'me': did, 'owner': self._owner(nest), 'signups': self.signups, 'trashDays': TRASH_DAYS}

    def _deliver_ttl(self, m):
        h = m.get('hours', DELIVER_HOURS)
        if not isinstance(h, (int, float)) or not (0.05 <= h <= 24 * 30):
            h = DELIVER_HOURS
        return _now() + int(h * 3600000)

    def start(self, nest, did, m):
        if not _b64ok(m.get('meta'), 28, 8192):
            raise Err('400 Bad Request', 'Malformed request')
        now = _now()
        device = str(m.get('device') or '')[:400]
        line = m.get('line') if isinstance(m.get('line'), str) and ID_RE.match(m.get('line')) else None
        prev = None
        if m.get('replaces'):  # a new version of a file that's already here (Rewind keeps the old one)
            old = self._mine(nest, m.get('replaces'))
            prev, line = old['id'], old['line'] or old['id']
            if not old['line']:
                self.q('UPDATE files SET line = ? WHERE id = ?', line, old['id'])
        to = m.get('to') or None
        if to is not None and not (isinstance(to, str) and DID_RE.match(to)):
            raise Err('400 Bad Request', 'Malformed request')
        if m.get('copy'):  # a new entry for bytes that are already here: sending the same file again, or bringing back an old version
            src = self._mine(nest, m.get('copy'))
            if not src['done'] or src['kind'] == 'dir':
                raise Err('409 Conflict', "That can't be copied yet.")
            fid = secrets.token_hex(8)
            self.q('INSERT INTO files (id, nest, size, chunks, meta, wrapped, made, device, kind, done, stored, from_did, blob, barn, line, prev, print, to_did, hop, ttl) '
                   'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                   fid, nest, src['size'], src['chunks'], m['meta'], src['wrapped'], now, device, src['kind'], did,
                   src['blob'] or src['id'], src['barn'], line or fid, prev, src['print'], to,
                   1 if (to and m.get('drop')) else 0, self._deliver_ttl(m) if to else 0)
            self._finished(nest, did, fid, m)
            return {'id': fid, 'copied': True}
        if not _b64ok(m.get('wrapped'), 60, 60):
            raise Err('400 Bad Request', 'Malformed request')
        if m.get('dir'):  # a folder: just a name, nothing to upload
            fid = secrets.token_hex(8)
            self.q("INSERT INTO files (id, nest, size, chunks, meta, wrapped, made, device, kind, done, from_did, blob) VALUES (?, ?, 0, 0, ?, ?, ?, ?, 'dir', 1, ?, ?)",
                   fid, nest, m['meta'], m['wrapped'], now, device, did, fid)
            return {'id': fid}
        size = m.get('size')
        chunks = m.get('chunks')
        if not isinstance(size, int) or size < 0 or not isinstance(chunks, int) or chunks < 1:
            raise Err('400 Bad Request', 'Malformed request')
        if chunks != max(1, -(-size // CHUNK)):
            raise Err('400 Bad Request', 'Malformed request')
        if size > self.max_file:
            raise Err('413 Payload Too Large', 'That file is bigger than this site allows (%d MB).' % (self.max_file // MB))
        fp = m.get('print') if isinstance(m.get('print'), str) and PRINT_RE.match(m.get('print')) else None
        if fp and not m.get('fresh'):  # the very same bytes are already in this nest: no need to send them again
            same = self.one("SELECT id, wrapped FROM files WHERE nest = ? AND print = ? AND done = 1 AND kind != 'dir' AND box IS NULL ORDER BY made DESC", nest, fp)
            if same:
                return {'same': {'id': same['id'], 'wrapped': same['wrapped']}}
        with self.lock:
            barn = self._place(nest, size + chunks * 29, barns=bool(m.get('barns')))
            fid = secrets.token_hex(8)
            self.q('INSERT INTO files (id, nest, size, chunks, meta, wrapped, made, device, kind, to_did, from_did, blob, barn, line, prev, print, hop, ttl) '
                   'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                   fid, nest, size, chunks, m['meta'], m['wrapped'], now, device,
                   'bundle' if m.get('bundle') else 'file', to, did, fid, barn, line or fid, prev, fp,
                   1 if (to and m.get('drop')) else 0, self._deliver_ttl(m) if to else 0)
        if not barn:
            os.makedirs(os.path.join(self.files_dir, fid), exist_ok=True)
        return {'id': fid, 'barn': bool(barn)}

    def _mine(self, nest, fid):
        if not isinstance(fid, str) or not ID_RE.match(fid):
            raise Err('400 Bad Request', 'Malformed request')
        r = self.one('SELECT * FROM files WHERE id = ? AND nest = ?', fid, nest)
        if not r:
            raise Err('404 Not Found', "That file isn't here any more.")
        return r

    def _ids(self, m):
        ids = m.get('ids') if isinstance(m.get('ids'), list) else [m.get('id')]
        if not ids or len(ids) > 2000 or not all(isinstance(i, str) and ID_RE.match(i) for i in ids):
            raise Err('400 Bad Request', 'Malformed request')
        return ids

    def _write_piece(self, r, n, body):
        if r['done'] or not (0 <= n < r['chunks']) or not (28 <= len(body) <= MAX_PIECE):
            raise Err('400 Bad Request', 'Malformed request')
        if r['barn']:
            raise Err('409 Conflict', 'This file goes to a storage barn. Update pigeon (pigeon update) to send it.')
        blob = r['blob'] or r['id']
        path = self._piece_path(blob, n)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        old = os.path.getsize(path) if os.path.exists(path) else 0
        with self.lock:
            self._room(r['nest'], len(body) - old)
            tmp = path + '.part'
            with open(tmp, 'wb') as f:
                f.write(body)
            os.replace(tmp, path)
            self.q('UPDATE files SET stored = stored + ? WHERE id = ?', len(body) - old, r['id'])
        return {'ok': True}

    def put_piece(self, nest, fid, n, body):
        return self._write_piece(self._mine(nest, fid), n, body)

    def _barn(self, bid):
        b = self.one('SELECT * FROM barns WHERE id = ?', bid)
        if not b:
            raise Err('410 Gone', "The storage barn that held this file was removed, so it can't be opened.")
        return b

    def _barn_url(self, b, method, key, expires=3600, headers=None, query=None):
        return presign(method, b['scheme'], b['host'], '/%s/%s' % (b['bucket'], key) if key else '/%s' % b['bucket'], b['region'],
                       b['akid'], b['secret'], expires=expires, headers=headers, query=query)

    def _where_put(self, r, n, length):
        """A URL to send one locked piece straight to the barn."""
        if r['done'] or not r['barn'] or not (0 <= n < r['chunks']) or not isinstance(length, int) or not (28 <= length <= MAX_PIECE):
            raise Err('400 Bad Request', 'Malformed request')
        b = self._barn(r['barn'])
        blob = r['blob'] or r['id']
        with self.lock:
            old = self.one('SELECT size FROM bpieces WHERE blob = ? AND n = ?', blob, n)
            more = length - (old['size'] if old else 0)
            self._room(r['nest'], more, r['barn'])
            self.q('INSERT OR REPLACE INTO bpieces (blob, n, size) VALUES (?, ?, ?)', blob, n, length)
            self.q('UPDATE files SET stored = stored + ? WHERE id = ?', more, r['id'])
        headers = {'content-length': str(length)} if b['signlen'] else None
        return {'url': self._barn_url(b, 'PUT', 'pigeon/%s/%d' % (blob, n), headers=headers)}

    def _where_get(self, r, hours=6):
        b = self._barn(r['barn'])
        blob = r['blob'] or r['id']
        return {'urls': [self._barn_url(b, 'GET', 'pigeon/%s/%d' % (blob, n), expires=hours * 3600) for n in range(r['chunks'])]}

    def where(self, nest, m):
        r = self._mine(nest, m.get('id'))
        if m.get('op') == 'put':
            return self._where_put(r, m.get('n') if isinstance(m.get('n'), int) else -1, m.get('len'))
        if not r['barn']:
            raise Err('400 Bad Request', "That file isn't in a storage barn.")
        return self._where_get(r)

    def _pieces_missing(self, r):
        blob = r['blob'] or r['id']
        if r['barn']:
            have = {p['n'] for p in self.q('SELECT n FROM bpieces WHERE blob = ?', blob)}
            return [n for n in range(r['chunks']) if n not in have]
        return [n for n in range(r['chunks']) if not os.path.exists(self._piece_path(blob, n))]

    def finish(self, nest, did, m):
        r = self._mine(nest, m.get('id'))
        missing = self._pieces_missing(r)
        if missing:
            raise Err('409 Conflict', 'Some pieces are missing: %s' % missing[:10])
        self.q('UPDATE files SET done = 1 WHERE id = ?', r['id'])
        self._finished(nest, did, r['id'], m)
        return {'ok': True}

    def _finished(self, nest, did, fid, m):
        """A file just arrived: it may be a new version of another, or on its way to a device."""
        r = self.one('SELECT * FROM files WHERE id = ?', fid)
        if r['prev']:
            self.q('UPDATE files SET old = ? WHERE id = ? AND old = 0', _now(), r['prev'])
            self._prune(nest, r['line'])
        if r['to_did']:
            self._receipt(nest, r, r['to_did'], did)

    def _prune(self, nest, line):
        olds = self.q('SELECT id FROM files WHERE nest = ? AND line = ? AND old > 0 ORDER BY old DESC', nest, line)
        for x in olds[KEEP_VERSIONS:]:
            self._drop(x['id'])

    def _receipt(self, nest, r, to, frm):
        self.q('INSERT INTO receipts (nest, file, from_did, to_did, made, meta, wrapped, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
               nest, r['id'], frm, to, _now(), r['meta'], r['wrapped'], r['size'])

    def get_piece(self, fid, n, nest=None):
        r = self.one('SELECT * FROM files WHERE id = ?' + (' AND nest = ?' if nest else ''), *((fid, nest) if nest else (fid,)))
        if not r or not (0 <= n < r['chunks']):
            raise Err('404 Not Found', 'not found')
        if r['barn']:
            raise Err('409 Conflict', 'This file is in a storage barn. Update pigeon (pigeon update) to open it.')
        try:
            with open(self._piece_path(r['blob'] or r['id'], n), 'rb') as f:
                return f.read()
        except OSError:
            raise Err('404 Not Found', 'That piece is missing.')

    def set_meta(self, nest, m):
        items = m.get('items')
        if not isinstance(items, list) or not 0 < len(items) <= 2000:
            raise Err('400 Bad Request', 'Malformed request')
        for it in items:
            if not isinstance(it, dict) or not _b64ok(it.get('meta'), 28, 8192):
                raise Err('400 Bad Request', 'Malformed request')
            self._mine(nest, it.get('id'))
        with self.lock:
            for it in items:
                self.q('UPDATE files SET meta = ? WHERE id = ? AND nest = ?', it['meta'], it['id'], nest)
        return {'ok': True}

    def trash(self, nest, m):
        ids = self._ids(m)
        when = 0 if m.get('restore') else _now()
        with self.lock:
            for fid in ids:
                self.q('UPDATE files SET trashed = ? WHERE id = ? AND nest = ?', when, fid, nest)
                if when:  # its old versions go with it
                    r = self.one('SELECT line FROM files WHERE id = ? AND nest = ?', fid, nest)
                    if r and r['line']:
                        self.q('UPDATE files SET trashed = ? WHERE nest = ? AND line = ? AND old > 0 AND trashed = 0', when, nest, r['line'])
                else:
                    r = self.one('SELECT line FROM files WHERE id = ? AND nest = ?', fid, nest)
                    if r and r['line']:
                        self.q('UPDATE files SET trashed = 0 WHERE nest = ? AND line = ? AND old > 0', nest, r['line'])
        return {'ok': True}

    def delete(self, nest, m):
        for fid in self._ids(m):
            r = self.one('SELECT id, line FROM files WHERE id = ? AND nest = ?', fid, nest)
            if r:
                if r['line']:
                    for x in self.q('SELECT id FROM files WHERE nest = ? AND line = ? AND old > 0', nest, r['line']):
                        self._drop(x['id'])
                self._drop(fid)
        return {'ok': True, 'used': self.used()}

    def versions(self, nest, m):
        """Rewind: every kept version of a file, newest first (the current one too)."""
        r = self._mine(nest, m.get('id'))
        line = r['line'] or r['id']
        rows = self.q('SELECT * FROM files WHERE nest = ? AND (line = ? OR id = ?) AND hop = 0 AND done = 1 ORDER BY made DESC', nest, line, line)
        return {'versions': [self._row(x) for x in rows], 'keep': KEEP_VERSIONS, 'days': VERSION_DAYS}

    def share(self, nest, m):
        r = self._mine(nest, m.get('id'))
        if not r['done'] or r['kind'] == 'dir':
            raise Err('409 Conflict', "That can't be shared yet.")
        hours = m.get('hours', 24)
        if not isinstance(hours, (int, float)) or not (0.1 <= hours <= 24 * 30):
            hours = 24
        code = ''.join(secrets.choice(CODE_ABC) for _ in range(8))
        expires = int((time.time() + hours * 3600) * 1000)
        self.q('INSERT INTO shares VALUES (?, ?, ?, ?, 0)', code, r['id'], nest, expires)
        return {'code': code, 'expires': expires}

    def links(self, nest):
        rows = self.q('SELECT code, file, expires, hits FROM shares WHERE nest = ? AND expires > ? ORDER BY expires DESC', nest, _now())
        return {'links': [{'code': r['code'], 'file': r['file'], 'expires': r['expires'], 'hits': r['hits']} for r in rows]}

    def unshare(self, nest, m):
        self.q('DELETE FROM shares WHERE code = ? AND nest = ?', str(m.get('code') or ''), nest)
        return {'ok': True}

    def shared(self, code):
        if not CODE_RE.match(code or ''):
            raise Err('404 Not Found', 'That link is not valid.')
        s = self.one('SELECT * FROM shares WHERE code = ?', code)
        if not s or s['expires'] < _now():
            raise Err('410 Gone', 'That link has expired. Ask for a new one.')
        r = self.one('SELECT * FROM files WHERE id = ?', s['file'])
        if not r or r['trashed']:
            raise Err('410 Gone', 'That file was deleted.')
        return s, r

    def shared_info(self, code):
        s, r = self.shared(code)
        self.q('UPDATE shares SET hits = hits + 1 WHERE code = ?', s['code'])
        out = {'size': r['size'], 'chunks': r['chunks'], 'meta': r['meta'], 'expires': s['expires'], 'made': r['made'], 'barn': bool(r['barn'])}
        if r['barn']:
            out.update(self._where_get(r, hours=2))
        return out

    def logout(self, th):
        self.q('DELETE FROM tokens WHERE hash = ?', th)
        return {'ok': True}

    # ── devices: every computer, phone or browser that's logged in ─────────
    def _dids(self, nest):
        return {r['did'] or r['hash'][:16] for r in self.q('SELECT did, hash FROM tokens WHERE nest = ?', nest)}

    def devices(self, nest, did):
        rows = self.q('SELECT did, device, made, seen, hash FROM tokens WHERE nest = ? ORDER BY seen DESC', nest)
        out = {}
        for r in rows:
            key = r['did'] or r['hash'][:16]
            if key not in out:
                out[key] = {'did': key, 'name': r['device'] or 'a device', 'made': r['made'], 'seen': r['seen'], 'me': key == did}
            else:
                out[key]['made'] = min(out[key]['made'], r['made'])
        waiting = {r['to_did']: r['n'] for r in self.q(
            'SELECT to_did, COUNT(*) AS n FROM files WHERE nest = ? AND to_did IS NOT NULL AND got = 0 AND done = 1 AND trashed = 0 GROUP BY to_did', nest)}
        for d in out.values():
            d['waiting'] = waiting.get(d['did'], 0)
        return {'devices': list(out.values()), 'me': did}

    def rename_device(self, nest, did, m):
        name = str(m.get('name') or '').strip()[:400]
        if not name:
            raise Err('400 Bad Request', 'Give this device a name.')
        self.q('UPDATE tokens SET device = ? WHERE nest = ? AND did = ?', name, nest, did)
        return {'ok': True}

    def forget(self, nest, m):
        target = str(m.get('did') or '')
        if not DID_RE.match(target):
            raise Err('400 Bad Request', 'Malformed request')
        self.q('DELETE FROM tokens WHERE nest = ? AND (did = ? OR substr(hash, 1, 16) = ?)', nest, target, target)
        return {'ok': True}

    def deliver(self, nest, did, m):
        """Send files that are already in the nest to one device, several, or 'all' (every other one).
        Each one gets its own entry pointing at the same bytes; it disappears once it lands."""
        to = m.get('to')
        if to == 'all':
            targets = sorted(self._dids(nest) - {did})
        else:
            targets = to if isinstance(to, list) else [to]
        if not targets or len(targets) > 50 or not all(isinstance(t, str) and DID_RE.match(t) for t in targets):
            raise Err('400 Bad Request', 'Malformed request' if to != 'all' else 'There are no other devices signed in to your nest yet.')
        ttl = self._deliver_ttl(m)
        made = []
        with self.lock:
            for fid in self._ids(m):
                r = self._mine(nest, fid)
                if r['kind'] == 'dir' or not r['done']:
                    continue
                for t in targets:
                    cid = secrets.token_hex(8)
                    self.q('INSERT INTO files (id, nest, size, chunks, meta, wrapped, made, done, stored, device, kind, to_did, from_did, blob, barn, line, hop, ttl, print) '
                           'VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
                           cid, nest, r['size'], r['chunks'], r['meta'], r['wrapped'], _now(), r['device'], r['kind'], t, did,
                           r['blob'] or r['id'], r['barn'], cid, ttl, r['print'])
                    self._receipt(nest, self.one('SELECT * FROM files WHERE id = ?', cid), t, did)
                    made.append(cid)
        return {'ok': True, 'sent': len(made), 'to': targets}

    def inbox(self, nest, did):
        rows = self.q('SELECT * FROM files WHERE nest = ? AND to_did = ? AND got = 0 AND done = 1 AND trashed = 0 ORDER BY made', nest, did)
        return {'files': [self._row(r) for r in rows]}

    def got(self, nest, did, m):
        r = self._mine(nest, m.get('id'))
        now = _now()
        self.q('UPDATE receipts SET got = ? WHERE file = ? AND got = 0', now, r['id'])
        if r['hop'] or m.get('drop'):
            self._drop(r['id'])
        else:
            self.q('UPDATE files SET got = ? WHERE id = ?', now, r['id'])
        return {'ok': True}

    def sent(self, nest, did, m):
        """What was sent to devices lately, and whether it landed: receipts."""
        since = m.get('since') if isinstance(m.get('since'), (int, float)) else 0
        mine = '' if m.get('all') else ' AND from_did = ?'
        args = [nest, max(since, _now() - RECEIPT_DAYS * 86400000)] + ([] if m.get('all') else [did])
        rows = self.q('SELECT * FROM receipts WHERE nest = ? AND (made > ? OR got > 0)' + mine + ' ORDER BY made DESC LIMIT 200', *args)
        return {'sent': [{'id': r['id'], 'file': r['file'], 'from': r['from_did'], 'to': r['to_did'], 'made': r['made'], 'got': r['got'],
                          'gone': r['gone'] or '', 'meta': r['meta'], 'wrapped': r['wrapped'], 'size': r['size']} for r in rows]}

    # ── drop boxes: a link anyone can send files into, locked for you alone ──
    def boxes(self, nest, m):
        act = m.get('do')
        if act == 'new':
            title = str(m.get('title') or '').strip()[:60]
            note = str(m.get('note') or '').strip()[:280]
            if not title:
                raise Err('400 Bad Request', 'Give the drop box a name, like "Homework" or "Photos from the trip".')
            if not _b64ok(m.get('pub'), 65, 65) or base64.b64decode(m['pub'])[0] != 4 or not _b64ok(m.get('priv'), 40, 400):
                raise Err('400 Bad Request', 'Malformed request')
            days = m.get('days', 14)
            if not isinstance(days, (int, float)) or not (0.04 <= days <= 90):
                days = 14
            mb = m.get('mb', 200)
            if not isinstance(mb, (int, float)) or not (1 <= mb <= 4000):
                mb = 200
            if self.one('SELECT COUNT(*) AS n FROM boxes WHERE nest = ? AND open = 1', nest)['n'] >= 20:
                raise Err('409 Conflict', 'You have 20 open drop boxes already. Close one first.')
            code = ''.join(secrets.choice(CODE_ABC) for _ in range(10))
            self.q('INSERT INTO boxes (code, nest, title, note, pub, priv, made, expires, max) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                   code, nest, title, note, m['pub'], m['priv'], _now(), _now() + int(days * 86400000), int(mb * MB))
        elif act in ('close', 'open', 'delete'):
            b = self.one('SELECT * FROM boxes WHERE code = ? AND nest = ?', str(m.get('code') or ''), nest)
            if not b:
                raise Err('404 Not Found', "That drop box isn't here any more.")
            if act == 'delete':
                self.q('DELETE FROM boxes WHERE code = ?', b['code'])
            else:
                self.q('UPDATE boxes SET open = ?, expires = MAX(expires, ?) WHERE code = ?', 1 if act == 'open' else 0,
                       _now() + 86400000 if act == 'open' else 0, b['code'])
        rows = self.q('SELECT * FROM boxes WHERE nest = ? ORDER BY made DESC', nest)
        out = []
        for b in rows:
            out.append({'code': b['code'], 'title': b['title'], 'note': b['note'], 'pub': b['pub'], 'priv': b['priv'], 'made': b['made'],
                        'expires': b['expires'], 'max': b['max'], 'files': b['files'], 'used': b['used'], 'open': bool(b['open']) and b['expires'] > _now()})
        return {'boxes': out}

    def _box(self, code):
        if not BOX_RE.match(str(code or '')):
            raise Err('404 Not Found', "That drop box link isn't right. Check you have all of it.")
        b = self.one('SELECT * FROM boxes WHERE code = ?', code)
        if not b:
            raise Err('404 Not Found', "That drop box doesn't exist (any more).")
        if not b['open'] or b['expires'] < _now():
            raise Err('410 Gone', 'This drop box is closed. Ask its owner for a new link.')
        return b

    def box_info(self, m):
        b = self._box(m.get('code'))
        left = max(0, int(b['max']) - int(b['used']))
        return {'title': b['title'], 'note': b['note'], 'pub': b['pub'], 'left': left, 'maxFile': min(self.max_file, left), 'expires': b['expires']}

    def box_start(self, m, ip):
        b = self._box(m.get('code'))
        key = 'box|%s|%s' % (b['code'], ip)
        if self.one('SELECT COUNT(*) AS n FROM fails WHERE key = ? AND at > ?', key, _now() - 3600000)['n'] >= 60:
            raise Err('429 Too Many Requests', "That's a lot of files for one hour. Wait a while, then send the rest.")
        if not _b64ok(m.get('meta'), 28, 8192) or not _b64ok(m.get('wrapped'), DROP_WRAP, DROP_WRAP):
            raise Err('400 Bad Request', 'Malformed request')
        size, chunks = m.get('size'), m.get('chunks')
        if not isinstance(size, int) or size < 0 or not isinstance(chunks, int) or chunks != max(1, -(-size // CHUNK)):
            raise Err('400 Bad Request', 'Malformed request')
        if size > min(self.max_file, int(b['max']) - int(b['used'])):
            raise Err('413 Payload Too Large', "That's bigger than this drop box has room for (%d MB left)." % ((int(b['max']) - int(b['used'])) // MB))
        self.q('INSERT INTO fails VALUES (?, ?)', key, _now())  # (counts uploads per hour; it's not a failure)
        ticket = secrets.token_hex(16)
        with self.lock:
            barn = self._place(b['nest'], size + chunks * 29, barns=bool(m.get('barns')))
            fid = secrets.token_hex(8)
            self.q("INSERT INTO files (id, nest, size, chunks, meta, wrapped, made, device, kind, blob, barn, line, box, ticket) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'file', ?, ?, ?, ?, ?)",
                   fid, b['nest'], size, chunks, m['meta'], m['wrapped'], _now(), 'drop box', fid, barn, fid, b['code'], hashlib.sha256(ticket.encode()).hexdigest())
        if not barn:
            os.makedirs(os.path.join(self.files_dir, fid), exist_ok=True)
        return {'id': fid, 'ticket': ticket, 'barn': bool(barn)}

    def _ticketed(self, m):
        fid = m.get('id')
        if not isinstance(fid, str) or not ID_RE.match(fid) or not isinstance(m.get('ticket'), str):
            raise Err('400 Bad Request', 'Malformed request')
        r = self.one('SELECT * FROM files WHERE id = ?', fid)
        if not r or not r['ticket'] or r['done'] or not hmac.compare_digest(r['ticket'], hashlib.sha256(m['ticket'].encode()).hexdigest()):
            raise Err('403 Forbidden', 'That upload has finished or expired. Try sending the file again.')
        return r

    def box_finish(self, m):
        r = self._ticketed(m)
        missing = self._pieces_missing(r)
        if missing:
            raise Err('409 Conflict', 'Some pieces are missing: %s' % missing[:10])
        stored = int(self.one('SELECT stored FROM files WHERE id = ?', r['id'])['stored'])
        self.q('UPDATE files SET done = 1, ticket = NULL WHERE id = ?', r['id'])
        self.q('UPDATE boxes SET files = files + 1, used = used + ? WHERE code = ?', stored, r['box'])
        return {'ok': True}

    def adopt(self, nest, m):
        """The owner's device unlocked drop-box uploads and locks them with the nest's key, like any other file."""
        items = m.get('items')
        if not isinstance(items, list) or not 0 < len(items) <= 500:
            raise Err('400 Bad Request', 'Malformed request')
        for it in items:
            if not isinstance(it, dict) or not _b64ok(it.get('wrapped'), 60, 60) or not _b64ok(it.get('meta'), 28, 8192):
                raise Err('400 Bad Request', 'Malformed request')
            r = self._mine(nest, it.get('id'))
            if not r['box']:
                raise Err('400 Bad Request', 'Malformed request')
            self.q('UPDATE files SET wrapped = ?, meta = ? WHERE id = ?', it['wrapped'], it['meta'], r['id'])
        return {'ok': True}

    # ── storage barns (the site's owner adds them) ─────────────────────────
    def barns(self, nest, m):
        self._must_own(nest)
        act = m.get('do')
        bid = str(m.get('id') or '')
        if act == 'add':
            kind = m.get('kind') if m.get('kind') in ('b2', 'r2', 's3') else 's3'
            scheme, host, region = barn_parts(kind, m.get('endpoint'), m.get('region'))
            bucket = str(m.get('bucket') or '').strip()
            akid = str(m.get('akid') or '').strip()
            secret = str(m.get('secret') or '').strip()
            if not BUCKET_RE.match(bucket):
                raise Err('400 Bad Request', "That bucket name doesn't look right: 3-63 lowercase letters, numbers, dots and dashes.")
            if not re.match(r'^[A-Za-z0-9/+=_.-]{8,128}$', akid) or not re.match(r'^[A-Za-z0-9/+=_.-]{16,256}$', secret):
                raise Err('400 Bad Request', "That key doesn't look right. Copy the key ID and the secret key again (no spaces).")
            gb = m.get('gb', 9)
            if not isinstance(gb, (int, float)) or not (0.1 <= gb <= 10000):
                raise Err('400 Bad Request', 'Give a size in GB, like 9.')
            bid = secrets.token_hex(4)
            self.q("INSERT INTO barns (id, kind, scheme, host, region, bucket, akid, secret, cap, made, state, signlen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 1)",
                   bid, kind, scheme, host, region, bucket, akid, secret, int(gb * GB), _now())
            return {'id': bid, 'setup': self._setup(bid), 'barns': self._barn_list()}
        if act in ('fix', 'ok', 'remove', 'size'):
            b = self.one('SELECT * FROM barns WHERE id = ?', bid)
            if not b:
                raise Err('404 Not Found', "That storage barn isn't here any more.")
            if act == 'fix':
                return {'id': bid, 'setup': self._setup(bid), 'barns': self._barn_list()}
            if act == 'ok':
                good = bool(m.get('works')) and bool(m.get('cors'))
                note = str(m.get('note') or '')[:300]
                self.q('UPDATE barns SET state = ?, signlen = ?, note = ? WHERE id = ?', 'ok' if good else 'broken', 1 if m.get('signlen', True) else 0, note, bid)
            if act == 'size':
                gb = m.get('gb')
                if not isinstance(gb, (int, float)) or not (0.1 <= gb <= 10000):
                    raise Err('400 Bad Request', 'Give a size in GB, like 9.')
                self.q('UPDATE barns SET cap = ? WHERE id = ?', int(gb * GB), bid)
            if act == 'remove':
                n = self.one('SELECT COUNT(*) AS n FROM files WHERE barn = ?', bid)['n']
                if n and not m.get('force'):
                    raise Err('409 Conflict', '%d files live in this barn. Delete them first (or remove it anyway, and they can no longer be opened).' % n)
                self.q('DELETE FROM files WHERE barn = ?', bid)
                self.q('DELETE FROM chores WHERE barn = ?', bid)
                self.q('DELETE FROM barns WHERE id = ?', bid)
        return {'barns': self._barn_list(), 'disk': {'used': self.disk_used(), 'quota': self.quota}, 'capacity': self.capacity()}

    def _barn_list(self):
        return [{'id': b['id'], 'kind': b['kind'], 'endpoint': '%s://%s' % (b['scheme'], b['host']), 'region': b['region'], 'bucket': b['bucket'],
                 'key': b['akid'][:4] + '…' + b['akid'][-4:], 'cap': b['cap'], 'used': self.barn_used(b['id']), 'state': b['state'],
                 'note': b['note'] or '', 'made': b['made']} for b in self.q('SELECT * FROM barns ORDER BY made')]

    def _setup(self, bid):
        """Permission slips for a device to set up and test a barn: CORS (so browsers may use it), and a test file."""
        b = self.one('SELECT * FROM barns WHERE id = ?', bid)
        md5 = base64.b64encode(hashlib.md5(CORS_XML.encode()).digest()).decode()
        key = 'pigeon/.hello'
        return {
            'cors': {'url': self._barn_url(b, 'PUT', '', expires=900, headers={'content-md5': md5}, query={'cors': ''}), 'xml': CORS_XML, 'md5': md5},
            'put': self._barn_url(b, 'PUT', key, expires=900, headers={'content-length': str(len(TEST_BODY))}),
            'putPlain': self._barn_url(b, 'PUT', key, expires=900),
            'get': self._barn_url(b, 'GET', key, expires=900),
            'del': self._barn_url(b, 'DELETE', key, expires=900),
            'body': TEST_BODY.decode(), 'origin': '%s://%s' % (b['scheme'], b['host']), 'kind': b['kind'], 'bucket': b['bucket'],
        }

    def chores(self, nest, m):
        """Leftover pieces in barns to delete: any signed-in device does it, a few at a time."""
        rows = self.q('SELECT c.id, c.key, c.barn FROM chores c JOIN barns b ON b.id = c.barn ORDER BY c.id LIMIT 20')
        out = []
        for r in rows:
            b = self.one('SELECT * FROM barns WHERE id = ?', r['barn'])
            out.append({'id': r['id'], 'url': self._barn_url(b, 'DELETE', r['key'], expires=900)})
        return {'chores': out}

    def chores_done(self, nest, m):
        ids = m.get('ids')
        if not isinstance(ids, list) or len(ids) > 100 or not all(isinstance(i, int) for i in ids):
            raise Err('400 Bad Request', 'Malformed request')
        for i in ids:
            self.q('DELETE FROM chores WHERE id = ?', i)
        return {'ok': True}

    # ── the developer console ──────────────────────────────────────────────
    def console_set(self, nest, m):
        self._must_own(nest)
        pw = m.get('password')
        if pw is None:
            self._set('console_hash', None)
            self._set('console_salt', None)
            self.q('DELETE FROM consoles')
            return {'console': False}
        if not isinstance(pw, str) or len(pw) < 8:
            raise Err('400 Bad Request', 'Use a console password of at least 8 characters.')
        salt = secrets.token_hex(16)
        self._set('console_salt', salt)
        self._set('console_hash', hashlib.pbkdf2_hmac('sha256', pw.encode(), bytes.fromhex(salt), 200000).hex())
        self.q('DELETE FROM consoles')
        return {'console': True}

    def console_login(self, m, ip):
        key = 'console|' + ip
        self._slow_down(key, 6)
        pw = str(m.get('password') or '')
        salt, want = self._setting('console_salt'), self._setting('console_hash')
        env = os.environ.get('PIGEON_CONSOLE_PASSWORD')
        ok = False
        if salt and want:
            ok = hmac.compare_digest(hashlib.pbkdf2_hmac('sha256', pw.encode(), bytes.fromhex(salt), 200000).hex(), want)
        elif env:
            ok = hmac.compare_digest(pw.encode(), env.encode())
        else:
            raise Err('403 Forbidden', "The console is off on this site. Its owner can turn it on in the app: People and space > Developer console.")
        if not ok:
            self.q('INSERT INTO fails VALUES (?, ?)', key, _now())
            raise Err('403 Forbidden', 'Wrong console password.')
        token = secrets.token_hex(32)
        self.q('INSERT INTO consoles VALUES (?, ?, ?)', hashlib.sha256(token.encode()).hexdigest(), _now(), _now())
        return {'token': token}

    def console_view(self, m):
        token = m.get('token')
        th = hashlib.sha256(str(token or '').encode()).hexdigest()
        r = self.one('SELECT made FROM consoles WHERE hash = ?', th)
        if not r or _now() - r['made'] > 12 * 3600000:
            raise Err('401 Unauthorized', 'Sign in to the console again.')
        self.q('UPDATE consoles SET seen = ? WHERE hash = ?', _now(), th)
        since = m.get('since') if isinstance(m.get('since'), (int, float)) else 0
        hour = _now() - 3600000
        recent = self.console.tail(hour, 0)
        rows = [x for x in recent if x.get('t', 0) > since][-500:] if since >= hour else self.console.tail(since, 500)
        errors = [x for x in (recent if since else self.console.tail(0, 0)) if x.get('s', 0) >= 500 or x.get('tb')][-60:]
        return {'rows': rows, 'errors': errors, 'now': _now(), 'version': VERSION,
                'stats': {'hour': len(recent), 'errorsHour': len([x for x in recent if x.get('s', 0) >= 500]),
                          'slowHour': len([x for x in recent if x.get('ms', 0) > 2000]), 'nests': self.one('SELECT COUNT(*) AS n FROM nests')['n'],
                          'used': self.used(), 'capacity': self.capacity(), 'files': self.one('SELECT COUNT(*) AS n FROM files')['n'],
                          'barns': len(self.barns_ok()), 'chores': self.one('SELECT COUNT(*) AS n FROM chores')['n']}}

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

    def page(self, environ, base, which='index.html'):
        html = self._read('web', which)
        if html is None:
            return None
        origin = self.origin(environ)
        conf = json.dumps({'base': base, 'origin': origin, 'version': VERSION, 'sh': origin + base + '/install.sh', 'ps1': origin + base + '/install.ps1',
                           'home': bool(os.environ.get('PIGEON_HOME_MODE')), 'wire': self.wire.public})
        html = html.replace('/*PIGEON_CONFIG*/{}', conf.replace('<', '\\u003c'))
        html = html.replace('/*PIGEON_WIRE*/', (self._read('src', 'wire.js') or '').replace('</script', '<\\/script'))
        html = html.replace('/*PIGEON_DIFF*/', (self._read('src', 'diff.js') or '').replace('</script', '<\\/script'))
        qr = self._read('src', 'qr.js') or ''
        return html.replace('/*PIGEON_QR*/', qr.replace('</script', '<\\/script'))

    def csp(self):
        barns = ' '.join(sorted({'%s://%s' % (b['scheme'], b['host']) for b in self.barns_ok()}))
        return ("default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' blob: data:; media-src blob:; frame-src blob:; "
                "connect-src 'self' %s; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" % barns).replace("'self' ;", "'self';")

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
        began = time.time()
        rec = {'t': _now(), 'ip': _mask(ip), 'm': method, 'p': path[:80], 'in': 0}
        try:
            rec['in'] = int(environ.get('CONTENT_LENGTH') or 0)
        except ValueError:
            pass

        def send(status, body, ctype='application/json', extra=()):
            data = body if isinstance(body, bytes) else (body.encode('utf-8') if isinstance(body, str) else json.dumps(body, separators=(',', ':')).encode())
            start_response(status, [('Content-Type', ctype), ('Content-Length', str(len(data))), ('Cache-Control', 'no-store'),
                                    ('X-Content-Type-Options', 'nosniff'), ('Referrer-Policy', 'no-referrer')] + list(extra))
            rec.setdefault('s', int(status[:3]))
            rec['out'] = len(data)
            if isinstance(body, dict) and body.get('error') and 'e' not in rec:
                rec['e'] = str(body['error'])[:200]
            return [data]

        try:
            try:
                self.sweep()
                if path == '/api' and method == 'GET':
                    return send('200 OK', {'name': 'pigeon', 'version': VERSION, 'signups': self.signups, 'chunk': CHUNK, 'quota': self.capacity(),
                                           'wire': self.wire.public, 'sealed': True})
                if path == '/api/w' and method == 'POST':
                    return self.sealed(environ, ip, send, rec)
                if path.startswith('/api/'):
                    if self._setting('sealed_only'):
                        return send('403 Forbidden', {'error': "This pigeon site only takes sealed requests now. Update pigeon: pigeon update"})
                    return self.api(environ, method, path[5:], ip, send, rec)
                if method not in ('GET', 'HEAD'):
                    return send('405 Method Not Allowed', {'error': 'not allowed'})
                if path in ('/', '/index.html') or re.match(r'^/s/[a-z2-9]{8}$', path) or re.match(r'^/d/[a-z2-9]{10}$', path):
                    html = self.page(environ, base)
                    if html is None:
                        return send('200 OK', 'pigeon v%s\n' % VERSION, 'text/plain; charset=utf-8')
                    return send('200 OK', html, 'text/html; charset=utf-8', [('Content-Security-Policy', self.csp())])
                if path in ('/console', '/console/'):
                    html = self.page(environ, base, 'console.html')
                    if html is not None:
                        return send('200 OK', html, 'text/html; charset=utf-8', [('Content-Security-Policy', self.csp())])
                if path in ('/install.sh', '/install.ps1'):
                    text = self.installer(path.rsplit('.', 1)[1], environ, base)
                    if text is not None:
                        return send('200 OK', text, 'text/plain; charset=utf-8')
                if path == '/healthz':
                    return send('200 OK', 'pigeon v%s - %d MB used\n' % (VERSION, self.used() // MB), 'text/plain; charset=utf-8')
                return send('404 Not Found', {'error': 'not found'})
            except Err as e:
                return send(e.status, {'error': e.msg})
            except Exception as e:  # never show a traceback to the world (it goes to the error log, and the console)
                import traceback
                tb = traceback.format_exc()
                sys.stderr.write('pigeon: %s\n' % tb)
                rec['tb'] = tb[-4000:]
                return send('500 Internal Server Error', {'error': 'Something went wrong on the server (%s). Its error log has the details.' % type(e).__name__})
        finally:
            rec['ms'] = int((time.time() - began) * 1000)
            if not path.startswith('/healthz'):
                self.console.add(rec)

    def sealed(self, environ, ip, send, rec):
        """POST /api/w: one sealed request in, one sealed answer out (src/wire.js)."""
        try:
            size = int(environ.get('CONTENT_LENGTH') or 0)
        except ValueError:
            size = 0
        if size > MAX_PIECE + 2 * MB or size <= 0:
            return send('413 Payload Too Large', {'error': 'That request is too big.'})
        body = environ['wsgi.input'].read(size)
        try:
            s = self.wire.unseal(body)
        except Rewire:
            return send('401 Unauthorized', {'error': 'Starting a new connection…', 'wire': 'again'})
        except Err as e:
            return send(e.status, {'error': e.msg, 'wire': 'bad'})
        rec['a'] = s.action[:40]
        raw = b''
        try:
            self.wire.fresh(s)
            result, raw = self.dispatch(s.action, s.msg, ip, s.token, s.raw, rec)
            obj = {'s': 200, 'r': result}
        except Err as e:
            obj = {'s': int(e.status[:3]), 'e': e.msg}
            rec['e'] = e.msg[:200]
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            sys.stderr.write('pigeon: %s\n' % tb)
            rec['tb'] = tb[-4000:]
            obj = {'s': 500, 'e': 'Something went wrong on the server (%s). Its error log has the details.' % type(e).__name__}
        rec['s'] = obj['s']
        return send('200 OK', self.wire.seal(s.keys, s.nonce, obj, raw), 'application/x-pigeon')

    def dispatch(self, a, m, ip, token, raw, rec, who=None):
        """One action, from a sealed request. Returns (result, raw bytes to send back).
        `who` is (nest, token hash, device) when the caller already checked the sign-in."""
        n = lambda k: m.get(k) if isinstance(m.get(k), int) and not isinstance(m.get(k), bool) else -1  # noqa: E731
        if a == 'hello':
            return self.hello(m), b''
        if a == 'signup':
            return self.signup(m, ip), b''
        if a == 'login':
            return self.login(m, ip), b''
        if a == 'shared':
            return self.shared_info(str(m.get('code') or '')), b''
        if a == 'shared_piece':
            s, r = self.shared(str(m.get('code') or ''))
            return {}, self.get_piece(r['id'], n('n'))
        if a == 'box_info':
            return self.box_info(m), b''
        if a == 'box_start':
            return self.box_start(m, ip), b''
        if a == 'box_piece':
            return self._write_piece(self._ticketed(m), n('n'), raw), b''
        if a == 'box_where':
            return self._where_put(self._ticketed(m), n('n'), m.get('len')), b''
        if a == 'box_finish':
            return self.box_finish(m), b''
        if a == 'console_login':
            return self.console_login(m, ip), b''
        if a == 'console':
            return self.console_view(m), b''
        nest, th, did = who or self.auth_token(token)
        rec['n'] = nest
        rec['d'] = did[:6]
        if a == 'piece_put':
            return self.put_piece(nest, m.get('id'), n('n'), raw), b''
        if a == 'piece_get':
            fid = m.get('id')
            if not isinstance(fid, str) or not ID_RE.match(fid):
                raise Err('400 Bad Request', 'Malformed request')
            return {}, self.get_piece(fid, n('n'), nest)
        handlers = {
            'list': lambda: self.list(nest, did), 'start': lambda: self.start(nest, did, m), 'finish': lambda: self.finish(nest, did, m),
            'meta': lambda: self.set_meta(nest, m), 'trash': lambda: self.trash(nest, m), 'delete': lambda: self.delete(nest, m),
            'share': lambda: self.share(nest, m), 'unshare': lambda: self.unshare(nest, m), 'links': lambda: self.links(nest),
            'logout': lambda: self.logout(th), 'devices': lambda: self.devices(nest, did), 'forget': lambda: self.forget(nest, m),
            'name': lambda: self.rename_device(nest, did, m), 'inbox': lambda: self.inbox(nest, did), 'got': lambda: self.got(nest, did, m),
            'deliver': lambda: self.deliver(nest, did, m), 'people': lambda: self.people(nest, m), 'where': lambda: self.where(nest, m),
            'where_get': lambda: self.where(nest, dict(m, op='get')), 'versions': lambda: self.versions(nest, m), 'sent': lambda: self.sent(nest, did, m),
            'boxes': lambda: self.boxes(nest, m), 'adopt': lambda: self.adopt(nest, m), 'barns': lambda: self.barns(nest, m),
            'chores': lambda: self.chores(nest, m), 'chores_done': lambda: self.chores_done(nest, m), 'console_set': lambda: self.console_set(nest, m),
        }
        if a not in handlers:
            raise Err('404 Not Found', 'pigeon on this site is older than the one you have (it doesn\'t know "%s"). Ask its owner to update it.' % a[:40])
        return handlers[a](), b''

    def api(self, environ, method, what, ip, send, rec):
        """The plain API of pigeon 1 and 2, kept so older apps keep working."""
        qs = dict(p.split('=', 1) for p in (environ.get('QUERY_STRING') or '').split('&') if '=' in p)
        rec['a'] = what.split('/')[0][:40] + ' (plain)'

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
                nest, _, _ = self.auth(environ)
                return send('200 OK', self.put_piece(nest, fid, n, body(MAX_PIECE)))
            if method == 'GET':
                nest, _, _ = self.auth(environ)
                if not ID_RE.match(fid):
                    raise Err('400 Bad Request', 'Malformed request')
                return send('200 OK', self.get_piece(fid, n, nest), 'application/octet-stream')
        m = re.match(r'^shared/([a-z2-9]{8})(?:/(\d{1,6}))?$', what)
        if m and method == 'GET':
            if m.group(2) is None:
                return send('200 OK', self.shared_info(m.group(1)))
            s, r = self.shared(m.group(1))
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
        if what in ('hello', 'signup', 'login'):
            return send('200 OK', {'hello': self.hello, 'signup': lambda x: self.signup(x, ip), 'login': lambda x: self.login(x, ip)}[what](msg))
        nest, th, did = self.auth(environ)
        rec['n'] = nest
        plain = {'list', 'start', 'finish', 'meta', 'trash', 'delete', 'share', 'unshare', 'links', 'logout', 'devices', 'forget',
                 'name', 'inbox', 'got', 'deliver', 'people'}
        if what not in plain:
            raise Err('404 Not Found', 'not found')
        result, _ = self.dispatch(what, msg, ip, None, b'', rec, who=(nest, th, did))
        return send('200 OK', result)


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
        signups=env.get('PIGEON_SIGNUPS') or conf.get('signups') or 'open',
        quota_mb=env.get('PIGEON_QUOTA_MB') or conf.get('quota_mb') or 400,
        max_file_mb=env.get('PIGEON_MAX_FILE_MB') or conf.get('max_file_mb') or 400,
        public_url=env.get('PIGEON_PUBLIC_URL') or conf.get('public_url') or '',
        nest_mb=env.get('PIGEON_NEST_MB') or conf.get('nest_mb') or 100,
    )


def application(environ, start_response):
    """The WSGI entry point."""
    global _app
    if _app is None:
        with _app_lock:
            if _app is None:
                try:
                    _app = from_env()
                except Exception as e:  # say what's wrong instead of a blank error page
                    import traceback
                    sys.stderr.write('pigeon could not start: %s\n' % traceback.format_exc())
                    body = json.dumps({'error': "pigeon's server couldn't start (%s: %s). Check the folder in PIGEON_DATA (default ~/pigeon-data)." % (type(e).__name__, e)}).encode()
                    start_response('500 Internal Server Error', [('Content-Type', 'application/json'), ('Content-Length', str(len(body)))])
                    return [body]
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
