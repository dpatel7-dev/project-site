"""
The quick "are you a person?" check in front of the site's pages.

The first time a browser opens a page, it gets a short loading screen instead
(a mascot on a black backdrop). While the mascot plays, the page does a small
puzzle in JavaScript (a proof of work: easy for one visitor, costly for a bot
opening thousands of pages) and checks for signs of an automated browser.
If it passes, the server hands back a signed cookie and the page reloads; for
30 days after that, pages open straight away.

What it never touches: installers (/…/install.sh), /versions.json, gossip's
and pigeon's APIs and websockets, and anything that isn't a browser asking
for a web page. So `curl … | sh`, pca's updates, gossip and pigeon keep
working exactly as before.

The loading screen carries the site's real title and description, so
nothing about what the site is gets hidden from anyone.
"""

import hashlib
import hmac
import json
import os
import secrets
import time

COOKIE = 'djp7_ok'
DAYS = 30
BITS = 14            # the puzzle: a hash starting with 14 zero bits (~16,000 tries, under a second)
FRESH = 10 * 60      # a puzzle must be solved within ten minutes
EXEMPT_EXT = ('.sh', '.ps1', '.json', '.js', '.css', '.png', '.svg', '.ico', '.txt', '.woff2', '.webmanifest', '.xml')


def _secret_file():
    base = os.environ.get('SITE_DATA') or os.path.join(os.path.expanduser('~'), 'site-data')
    return os.path.join(base, 'check-secret')


_secret = None


def secret():
    """A random key kept outside the site's folder, made the first time it's needed."""
    global _secret
    if _secret:
        return _secret
    path = _secret_file()
    try:
        with open(path, 'rb') as f:
            _secret = f.read().strip()
    except OSError:
        _secret = b''
    if len(_secret) < 32:
        _secret = secrets.token_hex(32).encode()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + '.tmp'
        with open(tmp, 'wb') as f:
            f.write(_secret)
        os.replace(tmp, path)
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
    return _secret


def _sign(text):
    return hmac.new(secret(), text.encode(), hashlib.sha256).hexdigest()[:32]


def _cookie_ok(environ):
    raw = environ.get('HTTP_COOKIE') or ''
    for part in raw.split(';'):
        name, _, value = part.strip().partition('=')
        if name != COOKIE:
            continue
        until, _, sig = value.partition('.')
        if until.isdigit() and int(until) > time.time() and hmac.compare_digest(sig, _sign('ok.' + until)):
            return True
    return False


def needs_check(environ, path):
    """Should this request see the loading screen first?"""
    if os.environ.get('SITE_CHECK', '').lower() in ('off', '0', 'no'):
        return False
    if environ.get('REQUEST_METHOD', 'GET') not in ('GET', 'HEAD'):
        return False
    if 'text/html' not in (environ.get('HTTP_ACCEPT') or ''):
        return False  # curl, pca, gossip, pigeon's own requests, feeds…
    if environ.get('HTTP_UPGRADE'):
        return False  # websockets
    low = path.lower()
    if low.endswith(EXEMPT_EXT) or low in ('/api', '/healthz', '/robots.txt', '/favicon.ico', '/__check') or '/api/' in low or low.endswith('/api'):
        return False
    return not _cookie_ok(environ)


def challenge():
    """A puzzle to send with the loading screen: (text, signature, bits)."""
    text = '%d.%s' % (int(time.time()), secrets.token_hex(8))
    return text, _sign('c.' + text), BITS


def _leading_zero_bits(digest):
    bits = 0
    for byte in digest:
        if byte == 0:
            bits += 8
            continue
        bits += 8 - byte.bit_length()
        break
    return bits


def verify(body):
    """Check a solved puzzle. Returns (ok, why)."""
    try:
        m = json.loads(body or b'{}')
        text, sig, nonce = str(m['c']), str(m['s']), str(m['n'])
    except (ValueError, KeyError, TypeError):
        return False, 'bad request'
    if not hmac.compare_digest(sig, _sign('c.' + text)):
        return False, 'not our puzzle'
    try:
        made = int(text.split('.', 1)[0])
    except ValueError:
        return False, 'bad puzzle'
    if not (time.time() - FRESH <= made <= time.time() + 60):
        return False, 'too old: reload the page'
    if len(nonce) > 32:
        return False, 'bad answer'
    if _leading_zero_bits(hashlib.sha256((text + ':' + nonce).encode()).digest()) < BITS:
        return False, 'wrong answer'
    if m.get('w') is True:
        return False, 'automated browser'
    return True, ''


def pass_cookie(secure):
    until = str(int(time.time()) + DAYS * 86400)
    value = '%s.%s' % (until, _sign('ok.' + until))
    return '%s=%s; Max-Age=%d; Path=/; SameSite=Lax; HttpOnly%s' % (COOKIE, value, DAYS * 86400, '; Secure' if secure else '')


def mascot_for(path):
    for name in ('gossip', 'tot', 'pigeon', 'tidy', 'den', 'scout', 'roomy', 'hey', 'morph', 'shoo', 'magpie', 'medic', 'flash', 'hum', 'usual', 'locket'):
        if path == '/' + name or path.startswith('/' + name + '/'):
            return name
    return ''
