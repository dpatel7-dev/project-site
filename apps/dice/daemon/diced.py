#!/usr/bin/env python3
"""
diced: DiceOS's system helper. Runs on the Pi or PC as a system service and
serves the DiceOS desktop (DiceWeb, in "system" mode) to the screen's browser,
plus a small API that does the real things: Wi-Fi, Bluetooth, sound,
brightness, files, screenshots, a real Terminal, opening the web browser,
power, updates, and the TV's own remote through the HDMI cable (HDMI-CEC).

Only the computer itself can reach it (it listens on 127.0.0.1). Every API call
needs a secret that changes each time diced starts; only the desktop page
diced serves is told it. Calls from websites are refused (they can't add the
secret's header, and the Host and Origin must be this machine).

Standard library only.  python3 diced.py --help
"""

import argparse
import base64
import glob
import queue
import hashlib
import json
import mimetypes
import os
import pwd
import re
import secrets
import shutil
import signal
import socket
import stat
import struct
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def _version():
    """DiceOS's version, from the VERSION file next to the daemon folder."""
    try:
        with open(os.path.join(ROOT, 'VERSION')) as f:
            return f.read().strip() or '0'
    except OSError:
        return '0'


VERSION = _version()
DEFAULTS = {
    'web': os.path.join(ROOT, 'diceweb'),
    'settings': '/etc/dice/settings.json',
    'port': 7070,
}
TOKEN = secrets.token_urlsafe(24)
MAX_UPLOAD = 200 * 1024 * 1024


# ---------------------------------------------------------------------------
# little helpers

def run(cmd, user=None, timeout=15, env=None, input_text=None):
    """Run a command; return (code, output). Never raises for a missing program."""
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env, input=input_text,
                           preexec_fn=demote(user) if user else None)
        return p.returncode, (p.stdout + p.stderr).strip()
    except FileNotFoundError:
        return 127, cmd[0] + ' is not installed'
    except subprocess.TimeoutExpired:
        return 124, cmd[0] + ' took too long'
    except Exception as e:  # noqa: BLE001 - report anything else as a failure
        return 1, str(e)


def has(prog):
    return shutil.which(prog) is not None


def demote(user):
    """For running things as the person using the Pi rather than as root."""
    def go():
        if os.getuid() != 0 or not user:
            return
        pw = pwd.getpwnam(user)
        os.initgroups(user, pw.pw_gid)
        os.setgid(pw.pw_gid)
        os.setuid(pw.pw_uid)
    return go


def desktop_user():
    """Whoever owns the desktop: the person signed in on the screen, else UID 1000."""
    forced = os.environ.get('DICE_USER')
    if forced:
        return forced
    if os.getuid() != 0:
        return pwd.getpwuid(os.getuid()).pw_name
    try:
        return pwd.getpwuid(1000).pw_name
    except KeyError:
        return 'root'


def user_env(user):
    pw = pwd.getpwnam(user)
    run_dir = '/run/user/%d' % pw.pw_uid
    env = {'HOME': pw.pw_dir, 'USER': user, 'LOGNAME': user, 'SHELL': pw.pw_shell or '/bin/bash',
           'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': os.environ.get('LANG', 'C.UTF-8'),
           'TERM': 'xterm-256color', 'COLORTERM': 'truecolor'}
    if os.path.isdir(run_dir):
        env['XDG_RUNTIME_DIR'] = run_dir
        env['DBUS_SESSION_BUS_ADDRESS'] = 'unix:path=%s/bus' % run_dir
        for name in sorted(os.listdir(run_dir)):
            if name.startswith('wayland-') and not name.endswith('.lock'):
                env['WAYLAND_DISPLAY'] = name
                break
    return env


def read(path, default=''):
    try:
        with open(path) as f:
            return f.read()
    except OSError:
        return default


def load_settings(path):
    try:
        with open(path) as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save_settings(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, path)


# -- Dice Home's Home Assistant token: its own file, readable only by this helper --
def ha_token_path(settings_path):
    return os.path.join(os.path.dirname(settings_path), 'ha-token')


def save_ha_token(settings_path, token):
    path = ha_token_path(settings_path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd = os.open(path + '.tmp', os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write(token.strip())
    os.replace(path + '.tmp', path)


def public_settings(settings_path):
    """The settings the desktop may see: never the token, just whether there is one."""
    s = load_settings(settings_path)
    s.pop('ha_token', None)
    s['ha_token_set'] = bool(read(ha_token_path(settings_path)).strip())
    return s


HA_PATH = re.compile(r'/api/(states|services/[a-z_]+/[a-z_]+)')


def ha_call(settings_path, b):
    """Dice Home's buttons: asks Home Assistant (on your network) for the desktop, so
    Home Assistant doesn't need to let other web pages in, and the token stays here."""
    base = str(load_settings(settings_path).get('homeassistant') or '').rstrip('/')
    token = read(ha_token_path(settings_path)).strip()
    if not re.fullmatch(r'https?://[^\s/]+(/\S*)?', base) or not token:
        return {'ok': False, 'error': 'Add your Home Assistant address and token in Dice Home first.'}
    path = str(b.get('path') or '')
    if not HA_PATH.fullmatch(path):
        return {'ok': False, 'error': 'Not something Dice Home asks for.'}
    post = path.startswith('/api/services/')
    body = b.get('body') if isinstance(b.get('body'), dict) else {}
    req = urllib.request.Request(base + path, data=json.dumps(body).encode() if post else None, method='POST' if post else 'GET',
                                 headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return {'ok': True, 'data': json.loads(r.read(4_000_000) or b'null')}
    except urllib.error.HTTPError as e:
        return {'ok': False, 'error': 'Home Assistant said no (%d). Check the token in Dice Home.' % e.code if e.code in (401, 403) else 'Home Assistant answered %d.' % e.code}
    except (urllib.error.URLError, OSError, ValueError):
        return {'ok': False, 'error': 'Couldn\'t reach Home Assistant at %s.' % base}


# ---------------------------------------------------------------------------
# the system: what the desktop can see and change


def model():
    """What the computer is: the Pi's own name for itself, or a PC's maker and model."""
    pi = read('/proc/device-tree/model').strip('\x00 \n')
    if pi:
        return pi
    vendor = read('/sys/class/dmi/id/sys_vendor').strip()
    name = read('/sys/class/dmi/id/product_name').strip()
    junk = ('to be filled', 'default string', 'system product name', 'system manufacturer', 'o.e.m.')
    parts = [p for p in (vendor, name) if p and not any(j in p.lower() for j in junk)]
    if parts and len(parts) == 2 and parts[1].lower().startswith(parts[0].lower()):
        parts = parts[1:]
    return ' '.join(parts) or 'PC'

# ---------------------------------------------------------------------------
# Real apps: Linux apps from Flathub, installed with Flatpak for everyone on this computer,
# and opened on top of Dice. Home on a remote (or Super + Esc on a keyboard) closes the
# one on top, and Dice is back. Games from your own gaming PC come the same way, through
# Moonlight (DiceGaming).
APP_ID = re.compile(r'^[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+){2,}$')
HOST = re.compile(r'^[A-Za-z0-9._:\-\[\]%]{1,100}$')
MOONLIGHT = 'com.moonlight_stream.Moonlight'
XML_LANG = '{http://www.w3.org/XML/1998/namespace}lang'


def parse_appstream(path):
    """The apps Flathub has for this kind of computer, from Flatpak's own copy of its list
    (appstream.xml or .xml.gz): id, name, one line about it, its categories."""
    import gzip
    import xml.etree.ElementTree as ET
    out = []
    with (gzip.open if path.endswith('.gz') else open)(path, 'rb') as f:
        for _, el in ET.iterparse(f, events=('end',)):
            if el.tag != 'component':
                continue
            if el.get('type') in ('desktop-application', 'desktop', 'console-application'):
                cid = (el.findtext('id') or '').strip()
                if cid.endswith('.desktop'):
                    cid = cid[:-8]
                plain = lambda tag: next(((e.text or '').strip() for e in el.findall(tag) if not e.get(XML_LANG)), '')
                name, summary = plain('name'), plain('summary')
                if APP_ID.match(cid) and name and el.get('type') != 'console-application':
                    out.append({'id': cid, 'name': name[:60], 'summary': summary[:160],
                                'cats': [c.text for c in el.findall('categories/category') if c.text][:6],
                                'icon': any(i.get('type') == 'cached' for i in el.findall('icon'))})
            el.clear()
    return out


# An antenna tuner on your network (HDHomeRun): free local channels (ABC, CBS, NBC, FOX, PBS…)
# from an antenna, played full screen with mpv (or VLC from the Store). Only local addresses.
def local_host(host):
    host = (host or '').strip().lower()
    if not re.fullmatch(r'[a-z0-9.\-]{1,80}', host):
        return False
    if host.endswith('.local') or host.endswith('.lan') or '.' not in host:
        return True
    return bool(re.fullmatch(r'(10\.\d+|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+', host))


def tuner_lineup(host):
    if not local_host(host):
        return {'ok': False, 'error': 'That isn\'t a tuner on your home network.'}
    try:
        with urllib.request.urlopen('http://%s/lineup.json' % host, timeout=8) as r:
            lineup = json.loads(r.read(2 * 1024 * 1024))
        chans = [{'num': str(c.get('GuideNumber', '')), 'name': str(c.get('GuideName', '')), 'url': str(c.get('URL', '')), 'hd': bool(c.get('HD'))}
                 for c in lineup if isinstance(c, dict) and c.get('URL')]
        return {'ok': True, 'channels': chans}
    except (OSError, ValueError, urllib.error.URLError) as e:
        return {'ok': False, 'error': 'The tuner didn\'t answer (%s).' % (getattr(e, 'reason', None) or e)}


# Deuce looks up a few things (which channel a game is on) from sites browsers can't always
# reach directly; only these, and only to read.
LOOKUP_HOSTS = ('site.api.espn.com',)


def lookup(url):
    try:
        u = urllib.parse.urlsplit(url or '')
    except ValueError:
        return {'ok': False, 'error': 'That isn\'t an address.'}
    if u.scheme != 'https' or u.hostname not in LOOKUP_HOSTS:
        return {'ok': False, 'error': 'Deuce only looks things up from a few places.'}
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'DiceOS/' + VERSION, 'Accept': 'application/json'})
        with urllib.request.urlopen(req, timeout=12) as r:
            body = r.read(3 * 1024 * 1024)
        return {'ok': True, 'data': json.loads(body)}
    except (OSError, ValueError, urllib.error.URLError) as e:
        return {'ok': False, 'error': 'Couldn\'t look it up (%s).' % (getattr(e, 'reason', None) or e)}


class Apps:
    FLATHUB = 'https://dl.flathub.org/repo/flathub.flatpakrepo'

    def __init__(self, push=None, root='/var/lib/flatpak'):
        self.push = push or (lambda ev: None)
        self.root = root
        self.lock = threading.Lock()
        self.jobs = {}
        self.running = []
        self.cache = (None, [])
        self.listed = (0.0, [])

    @staticmethod
    def arch():
        m = os.uname().machine
        return {'arm64': 'aarch64', 'amd64': 'x86_64'}.get(m, m)

    def appstream(self):
        return os.path.join(self.root, 'appstream', 'flathub', self.arch(), 'active')

    def has_flatpak(self):
        return bool(shutil.which('flatpak'))

    def has_flathub(self):
        if not self.has_flatpak():
            return False
        code, out = run(['flatpak', 'remotes', '--system', '--columns=name'], timeout=15)
        return code == 0 and 'flathub' in out.split()

    def catalog(self):
        base = self.appstream()
        path = next((p for p in (os.path.join(base, 'appstream.xml.gz'), os.path.join(base, 'appstream.xml')) if os.path.exists(p)), None)
        if not path:
            return []
        stamp = (path, os.path.getmtime(path))
        if self.cache[0] != stamp:
            try:
                self.cache = (stamp, parse_appstream(path))
            except Exception:  # a half-written list: try again next time
                return self.cache[1]
        return self.cache[1]

    def search(self, q='', cat='', limit=60):
        words = [w for w in (q or '').lower().split() if w][:5]
        out = []
        for a in self.catalog():
            if cat and cat not in a['cats']:
                continue
            if words:
                name, rest = a['name'].lower(), (a['id'] + ' ' + a['summary']).lower()
                if not all(w in name or w in rest for w in words):
                    continue
                score = (0 if name.startswith(words[0]) else 1 if words[0] in name else 2, len(a['name']))
            else:
                score = (0, a['name'].lower())
            out.append((score, a))
        out.sort(key=lambda x: x[0])
        return [a for _, a in out[:limit]]

    def icon(self, app_id):
        if not APP_ID.match(app_id or ''):
            return None
        for size in ('128x128', '64x64'):
            p = os.path.join(self.appstream(), 'icons', size, app_id + '.png')
            if os.path.exists(p):
                return p
        return None

    def installed(self, fresh=False):
        if not self.has_flatpak():
            return []
        if not fresh and time.time() - self.listed[0] < 5:
            return self.listed[1]
        code, out = run(['flatpak', 'list', '--system', '--app', '--columns=application,name,version,size'], timeout=20)
        apps = []
        if code == 0:
            for line in out.splitlines():
                bits = line.split('\t')
                if len(bits) >= 2 and APP_ID.match(bits[0]):
                    apps.append({'id': bits[0], 'name': bits[1], 'version': bits[2] if len(bits) > 2 else '', 'size': bits[3] if len(bits) > 3 else ''})
        self.listed = (time.time(), apps)
        return apps

    # -- jobs that take a while: getting set up, installing, removing ------------------------------------
    def job(self, key, title, cmds, as_user=False, timeout=1800):
        with self.lock:
            j = self.jobs.get(key)
            if j and j['state'] == 'working':
                return dict(j)
            j = self.jobs[key] = {'key': key, 'title': title, 'state': 'working', 'pct': 0, 'error': '', 'at': int(time.time())}
        threading.Thread(target=self._work, args=(j, cmds, as_user, timeout), daemon=True).start()
        return dict(j)

    def _work(self, j, cmds, as_user, timeout):
        user = desktop_user()
        env = user_env(user) if as_user and user != 'root' else dict(os.environ, DEBIAN_FRONTEND='noninteractive', LANG='C.UTF-8')
        for n, args in enumerate(cmds):
            try:
                p = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, text=True, env=env,
                                     preexec_fn=demote(user) if as_user and user != 'root' else None)
                timer = threading.Timer(timeout, p.kill)
                timer.start()
                last = ''
                for line in p.stdout:  # (universal newlines: the progress Flatpak redraws with \r arrives line by line)
                    line = line.strip()
                    if not line:
                        continue
                    last = line
                    pct = re.findall(r'(\d{1,3})%', line)
                    if pct:
                        j['pct'] = int(min(99, (n + int(pct[-1]) / 100) / len(cmds) * 100))
                code = p.wait()
                timer.cancel()
            except OSError as e:
                code, last = 1, str(e)
            if code:
                j.update(state='failed', error=re.sub(r'^(error|warning):\s*', '', last, flags=re.I)[:300] or 'It stopped (code %d).' % code)
                return
            j['pct'] = max(j['pct'], int((n + 1) / len(cmds) * 100) - 1)
        j.update(state='done', pct=100)
        self.listed = (0.0, self.listed[1])

    def setup(self):
        cmds = []
        if not self.has_flatpak():
            cmds += [['apt-get', 'update'], ['apt-get', 'install', '-y', 'flatpak', 'xwayland']]
        cmds += [['flatpak', 'remote-add', '--system', '--if-not-exists', 'flathub', self.FLATHUB], ['flatpak', 'update', '--system', '--appstream', '-y', 'flathub']]
        return self.job('setup', 'Getting apps ready', cmds)

    def install(self, app_id):
        if not APP_ID.match(app_id or ''):
            return {'state': 'failed', 'error': 'That isn\'t an app.'}
        return self.job(app_id, 'Installing', [['flatpak', 'install', '--system', '-y', '--noninteractive', 'flathub', app_id]])

    def remove(self, app_id):
        if not APP_ID.match(app_id or ''):
            return {'state': 'failed', 'error': 'That isn\'t an app.'}
        return self.job(app_id, 'Removing', [['flatpak', 'uninstall', '--system', '-y', '--noninteractive', app_id]])

    def update_all(self):
        return self.job('update', 'Updating apps', [['flatpak', 'update', '--system', '-y', '--noninteractive']])

    # -- opening, and closing what's on top -------------------------------------------------------------
    def launch(self, args, name, kind, key):
        user = desktop_user()
        env = user_env(user) if user != 'root' else dict(os.environ)
        try:
            p = subprocess.Popen(args, env=env, preexec_fn=demote(user) if user != 'root' else None, stdin=subprocess.DEVNULL,
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        except OSError as e:
            return {'ok': False, 'error': str(e)}
        with self.lock:
            self.running = [r for r in self.running if r['proc'].poll() is None]
            self.running.append({'key': key, 'name': name, 'kind': kind, 'proc': p, 'at': time.time()})
        return {'ok': True}

    def open(self, app_id):
        if not APP_ID.match(app_id or ''):
            return {'ok': False, 'error': 'That isn\'t an app.'}
        app = next((a for a in self.installed() if a['id'] == app_id), None)
        if not app:
            return {'ok': False, 'error': 'That app isn\'t installed.'}
        return self.launch(['flatpak', 'run', app_id], app['name'], 'app', app_id)

    def front(self):
        with self.lock:
            self.running = [r for r in self.running if r['proc'].poll() is None]
            r = self.running[-1] if self.running else None
        return {'name': r['name'], 'kind': r['kind'], 'key': r['key']} if r else None

    def close_front(self):
        """Close the app on top of Dice, if there is one. True if something closed."""
        with self.lock:
            self.running = [r for r in self.running if r['proc'].poll() is None]
            if not self.running:
                return False
            r = self.running.pop()
        if r['kind'] == 'app' and self.has_flatpak():
            user = desktop_user()
            try:
                subprocess.run(['flatpak', 'kill', r['key']], env=user_env(user) if user != 'root' else None, preexec_fn=demote(user) if user != 'root' else None,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
            except (OSError, subprocess.SubprocessError):
                pass
        pid = r['proc'].pid
        try:
            os.killpg(pid, signal.SIGTERM)
        except OSError:
            pass

        def finish():
            time.sleep(3)
            if r['proc'].poll() is None:
                try:
                    os.killpg(pid, signal.SIGKILL)
                except OSError:
                    pass
        threading.Thread(target=finish, daemon=True).start()
        return True

    def status(self):
        flatpak = self.has_flatpak()
        with self.lock:
            jobs = [dict(j) for j in self.jobs.values() if j['state'] == 'working' or time.time() - j['at'] < 600]
        return {'ok': True, 'flatpak': flatpak, 'flathub': flatpak and self.has_flathub(), 'arch': self.arch(), 'catalog': len(self.catalog()),
                'installed': self.installed(), 'jobs': jobs, 'front': self.front(), 'moonlight': bool(self.moonlight())}

    # -- DiceGaming: games from your own PC, streamed with Moonlight (the PC runs Sunshine) ---------------
    def moonlight(self):
        for b in ('moonlight-qt', 'moonlight'):
            p = shutil.which(b)
            if p:
                return [p]
        if any(a['id'] == MOONLIGHT for a in self.installed()):
            return ['flatpak', 'run', MOONLIGHT]
        return None

    def as_user(self, args, timeout):
        user = desktop_user()
        try:
            r = subprocess.run(args, env=user_env(user) if user != 'root' else None, preexec_fn=demote(user) if user != 'root' else None,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.DEVNULL, text=True, timeout=timeout)
            return r.returncode, r.stdout, r.stderr
        except subprocess.TimeoutExpired:
            return 124, '', 'Your gaming PC didn\'t answer in time. Is it on, with Sunshine running?'
        except OSError as e:
            return 1, '', str(e)

    @staticmethod
    def parse_games(out):
        """Moonlight's list of a PC's games: one name a line (or CSV, with a header row)."""
        lines = [l.strip() for l in (out or '').splitlines() if l.strip()]
        if lines and lines[0].lower().startswith('name,'):
            import csv
            return [row[0].strip() for row in csv.reader(lines[1:]) if row and row[0].strip()]
        return [l for l in lines if not re.match(r'^\d{2}:\d{2}:\d{2}', l) and not l.lower().startswith(('warning', 'error', 'info:', 'debug'))]

    def games(self, host):
        ml = self.moonlight()
        if not ml:
            return {'ok': False, 'error': 'Moonlight isn\'t installed yet.', 'need': 'moonlight'}
        if not HOST.match(host or ''):
            return {'ok': False, 'error': 'That isn\'t a computer\'s name or address.'}
        code, out, err = self.as_user(ml + ['list', host], 30)
        if code:
            why = (err or out).strip().splitlines()
            msg = why[-1] if why else 'Couldn\'t reach it.'
            return {'ok': False, 'error': msg[:240], 'paired': not re.search(r'not paired|pair', msg, re.I)}
        return {'ok': True, 'games': self.parse_games(out)}

    def pair(self, host, pin):
        ml = self.moonlight()
        if not ml:
            return {'state': 'failed', 'error': 'Moonlight isn\'t installed yet.'}
        if not HOST.match(host or '') or not re.fullmatch(r'\d{4}', pin or ''):
            return {'state': 'failed', 'error': 'That isn\'t a computer\'s name, or a 4-number PIN.'}
        return self.job('pair:' + host, 'Pairing', [ml + ['pair', host, '--pin', pin]], as_user=True, timeout=180)

    QUALITY = {'720p': ('1280x720', 10000), '1080p': ('1920x1080', 20000), '1440p': ('2560x1440', 40000), '4k': ('3840x2160', 80000)}

    def play(self, host, game, quality='1080p', fps=60):
        ml = self.moonlight()
        if not ml:
            return {'ok': False, 'error': 'Moonlight isn\'t installed yet.'}
        if not HOST.match(host or '') or not game or len(game) > 120 or '\n' in game:
            return {'ok': False, 'error': 'That isn\'t a game on a computer.'}
        res, kbps = self.QUALITY.get(quality, self.QUALITY['1080p'])
        fps = fps if fps in (30, 60, 90, 120) else 60
        return self.launch(ml + ['stream', host, game, '--resolution', res, '--fps', str(fps), '--bitrate', str(kbps * (2 if fps > 60 else 1))], game, 'game', 'game:' + host)

    def watch(self, url, name):
        """A channel from an antenna tuner, full screen on top of Dice (Home comes back)."""
        u = urllib.parse.urlsplit(url or '')
        if u.scheme != 'http' or not local_host(u.hostname or ''):
            return {'ok': False, 'error': 'Only a tuner on your home network.'}
        if shutil.which('mpv'):
            return self.launch(['mpv', '--fs', '--really-quiet', '--force-window=immediate', '--title=' + (name or 'TV'), url], name or 'TV', 'tv', url)
        if any(a['id'] == 'org.videolan.VLC' for a in self.installed()):
            return self.launch(['flatpak', 'run', 'org.videolan.VLC', '--fullscreen', url], name or 'TV', 'tv', url)
        return {'ok': False, 'error': 'Nothing to play it with yet: get VLC from the Store.', 'need': 'org.videolan.VLC'}

    def quit_game(self, host):
        ml = self.moonlight()
        if not ml or not HOST.match(host or ''):
            return {'ok': False, 'error': 'Moonlight isn\'t installed yet.'}
        code, out, err = self.as_user(ml + ['quit', host], 30)
        return {'ok': code == 0, 'error': (err or out).strip()[-240:] if code else ''}


# ---------------------------------------------------------------------------
# Deuce's ears: on DiceOS, speech is understood right on the computer (Vosk, offline, with a
# small English model), from the remote's microphone. It's set up the first time Deuce is used.
class Voice:
    ROOT = '/opt/dice/voice'
    MODEL = 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip'

    def __init__(self, push, apps):
        self.push = push
        self.apps = apps
        self.proc = None

    def python(self):
        return os.path.join(self.ROOT, 'bin', 'python')

    def ready(self):
        return os.path.exists(self.python()) and os.path.isdir(os.path.join(self.ROOT, 'model')) and bool(shutil.which('arecord'))

    def mics(self):
        if not shutil.which('arecord'):
            return []
        code, out = run(['arecord', '-l'], timeout=8)
        return re.findall(r'^card (\d+): [^\[]*\[([^\]]*)\], device (\d+)', out, re.M) if code == 0 else []

    def status(self):
        with self.apps.lock:
            job = dict(self.apps.jobs['voice']) if 'voice' in self.apps.jobs else None
        return {'ok': True, 'ready': self.ready(), 'mics': [m[1] for m in self.mics()], 'listening': bool(self.proc and self.proc.poll() is None), 'job': job}

    def setup(self):
        fetch = ('import io, os, shutil, urllib.request, zipfile; d = %r; z = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(%r, timeout=300).read())); '
                 'top = z.namelist()[0].split("/")[0]; z.extractall(d); shutil.rmtree(os.path.join(d, "model"), True); os.rename(os.path.join(d, top), os.path.join(d, "model"))') % (self.ROOT, self.MODEL)
        cmds = [['apt-get', 'install', '-y', 'python3-venv', 'alsa-utils'], [sys.executable, '-m', 'venv', self.ROOT],
                [os.path.join(self.ROOT, 'bin', 'pip'), 'install', '--disable-pip-version-check', 'vosk'], [sys.executable, '-c', fetch]]
        return self.apps.job('voice', 'Getting Deuce ready', cmds)

    def start(self):
        if self.proc and self.proc.poll() is None:
            return {'ok': True}
        if not self.ready():
            return {'ok': False, 'error': 'Deuce isn\'t set up on this computer yet.', 'need': 'setup'}
        mics = self.mics()
        usb = [m for m in mics if re.search(r'usb|remote|mic|audio', m[1], re.I) and not re.search(r'hdmi', m[1], re.I)]
        pick = (usb or mics or [None])[0]
        env = dict(os.environ, DICE_MIC='plughw:%s,%s' % (pick[0], pick[2]) if pick else 'default', DICE_VOICE_MODEL=os.path.join(self.ROOT, 'model'))
        try:
            self.proc = subprocess.Popen([self.python(), os.path.join(ROOT, 'bin', 'dice-listen')], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, env=env)
        except OSError as e:
            return {'ok': False, 'error': str(e)}
        p = self.proc

        def read():
            for line in p.stdout:
                try:
                    self.push({'voice': json.loads(line)})
                except ValueError:
                    pass
            p.wait()
            self.push({'voice': {'done': True}})
        threading.Thread(target=read, daemon=True).start()
        return {'ok': True}

    def stop(self):
        p = self.proc
        if p and p.poll() is None:
            p.send_signal(signal.SIGTERM)  # it finishes what it heard and says so
        return {'ok': True}

    def say(self, text):
        """Deuce's answer out loud, even with an app on top of Dice (speech-dispatcher or espeak-ng)."""
        text = re.sub(r'[\x00-\x1f]', ' ', str(text or ''))[:300].strip()
        speak = shutil.which('spd-say') or shutil.which('espeak-ng')
        if not text or not speak:
            return {'ok': False, 'error': 'Nothing to talk with (sudo apt install speech-dispatcher espeak-ng).'}
        args = [speak, '-w', '--', text] if speak.endswith('spd-say') else [speak, '-s', '165', '--', text]
        user = desktop_user()
        env = user_env(user) if user != 'root' else dict(os.environ)
        try:
            subprocess.Popen(args, env=env, preexec_fn=demote(user) if user != 'root' else None, stdin=subprocess.DEVNULL,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        except OSError as e:
            return {'ok': False, 'error': str(e)}
        return {'ok': True}


class System:
    def __init__(self, settings_path):
        self.settings_path = settings_path
        self.remote = Remote(settings_path)
        self.monitors = Monitors()
        self.apps = Apps(self.remote.push)
        self.remote.intercept = lambda ev: ev.get('a') in ('home', 'menu') and self.apps.close_front()  # a TV remote's Home is CEC's "root menu"
        self.power_keys = PowerKeys(self.remote.push, home=self.apps.close_front, front=self.apps.front,
                                    voice_key=lambda: load_settings(self.settings_path).get('voice_key'))
        self.voice = Voice(self.remote.push, self.apps)
        self.standby_on = False

    # -- status --
    def status(self):
        user = desktop_user()
        out = {'version': VERSION, 'host': socket.gethostname(), 'user': user, 'model': model(),
               'uptime': self.uptime(), 'ip': self.ip(), 'temp': self.temp(), 'mem': self.mem(), 'disk': self.disk(user), 'load': self.load(),
               'wifi': self.wifi_now(), 'volume': self.volume(), 'brightness': self.brightness(), 'battery': self.battery(),
               'remote_keys': self.power_keys.remote_keys, 'standby': self.standby_on, 'front': self.apps.front(), 'voice': self.voice.ready()}
        return out

    def uptime(self):
        try:
            return int(float(read('/proc/uptime', '0').split()[0]))
        except (ValueError, IndexError):
            return 0

    def ip(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(('10.255.255.255', 1))  # no packet is sent; this just picks the outgoing address
            return s.getsockname()[0]
        except OSError:
            return None
        finally:
            s.close()

    def temp(self):
        t = read('/sys/class/thermal/thermal_zone0/temp').strip()
        return round(int(t) / 1000, 1) if t.isdigit() else None

    def mem(self):
        info = {}
        for line in read('/proc/meminfo').splitlines():
            k, _, v = line.partition(':')
            info[k] = int(v.split()[0]) * 1024 if v.split() else 0
        total = info.get('MemTotal', 0)
        return {'total': total, 'used': total - info.get('MemAvailable', 0)} if total else None

    def disk(self, user):
        try:
            u = shutil.disk_usage(pwd.getpwnam(user).pw_dir)
            return {'total': u.total, 'used': u.used}
        except (KeyError, OSError):
            return None

    def load(self):
        try:
            return os.getloadavg()[0]
        except OSError:
            return None

    def battery(self):
        for b in sorted(os.listdir('/sys/class/power_supply')) if os.path.isdir('/sys/class/power_supply') else []:
            cap = read('/sys/class/power_supply/%s/capacity' % b).strip()
            if cap.isdigit():
                return {'level': int(cap) / 100, 'charging': read('/sys/class/power_supply/%s/status' % b).strip() == 'Charging'}
        return None

    # -- Wi-Fi (NetworkManager) --
    def wifi_now(self):
        if not has('nmcli'):
            return None
        code, out = run(['nmcli', '-t', '-f', 'ACTIVE,SSID,SIGNAL', 'dev', 'wifi'], timeout=6)
        if code:
            return None
        for line in out.splitlines():
            parts = split_nm(line)
            if len(parts) >= 3 and parts[0] == 'yes':
                return {'ssid': parts[1], 'signal': int(parts[2]) if parts[2].isdigit() else None}
        return {'ssid': None, 'signal': None}

    def wifi_list(self):
        if not has('nmcli'):
            return {'error': 'Wi-Fi settings need NetworkManager (nmcli), which isn\'t on this computer.'}
        run(['nmcli', 'dev', 'wifi', 'rescan'], timeout=8)
        code, out = run(['nmcli', '-t', '-f', 'IN-USE,SSID,SIGNAL,SECURITY', 'dev', 'wifi', 'list'], timeout=10)
        if code:
            return {'error': out}
        seen, nets = set(), []
        for line in out.splitlines():
            p = split_nm(line)
            if len(p) < 4 or not p[1] or p[1] in seen:
                continue
            seen.add(p[1])
            nets.append({'ssid': p[1], 'signal': int(p[2]) if p[2].isdigit() else 0, 'secure': bool(p[3] and p[3] != '--'), 'active': p[0] == '*'})
        nets.sort(key=lambda n: (not n['active'], -n['signal']))
        return {'networks': nets}

    def wifi_connect(self, ssid, password=None):
        if not ssid:
            return {'ok': False, 'error': 'Which network?'}
        cmd = ['nmcli', 'dev', 'wifi', 'connect', ssid] + (['password', password] if password else [])
        code, out = run(cmd, timeout=40)
        return {'ok': code == 0, 'error': None if code == 0 else friendly_nm(out)}

    def wifi_power(self, on):
        code, out = run(['nmcli', 'radio', 'wifi', 'on' if on else 'off'])
        return {'ok': code == 0, 'error': out if code else None}

    # -- sound (PipeWire, else ALSA) --
    def volume(self):
        user = desktop_user()
        if has('wpctl'):
            code, out = run(['wpctl', 'get-volume', '@DEFAULT_AUDIO_SINK@'], user=user, env=user_env(user) if user != 'root' else None, timeout=4)
            m = re.search(r'([\d.]+)', out or '')
            if code == 0 and m:
                return {'level': min(1.0, float(m.group(1))), 'muted': 'MUTED' in out}
        if has('amixer'):
            code, out = run(['amixer', '-M', 'get', 'Master'], timeout=4)
            m = re.search(r'\[(\d+)%\].*\[(on|off)\]', out or '')
            if code == 0 and m:
                return {'level': int(m.group(1)) / 100, 'muted': m.group(2) == 'off'}
        return None

    def set_volume(self, level=None, muted=None):
        user = desktop_user()
        if has('wpctl'):
            env = user_env(user) if user != 'root' else None
            if level is not None:
                run(['wpctl', 'set-volume', '@DEFAULT_AUDIO_SINK@', '%.2f' % max(0, min(1, float(level)))], user=user, env=env)
            if muted is not None:
                run(['wpctl', 'set-mute', '@DEFAULT_AUDIO_SINK@', '1' if muted else '0'], user=user, env=env)
        elif has('amixer'):
            if level is not None:
                run(['amixer', '-M', 'set', 'Master', '%d%%' % round(max(0, min(1, float(level))) * 100)])
            if muted is not None:
                run(['amixer', 'set', 'Master', 'mute' if muted else 'unmute'])
        else:
            return {'ok': False, 'error': 'No sound controls on this computer.'}
        return {'ok': True, 'volume': self.volume()}

    # -- screen brightness (the official touch displays and most laptops) --
    def backlight(self):
        base = '/sys/class/backlight'
        if not os.path.isdir(base):
            return None
        for name in sorted(os.listdir(base)):
            return os.path.join(base, name)
        return None

    def brightness(self):
        b = self.backlight()
        if not b:
            return None
        try:
            return int(read(b + '/brightness')) / max(1, int(read(b + '/max_brightness')))
        except ValueError:
            return None

    def set_brightness(self, level):
        b = self.backlight()
        if not b:
            return {'ok': False, 'error': 'This screen\'s brightness can\'t be changed from here.'}
        top = int(read(b + '/max_brightness') or 255)
        value = max(1, round(max(0.05, min(1, float(level))) * top))
        try:
            with open(b + '/brightness', 'w') as f:
                f.write(str(value))
            return {'ok': True}
        except OSError as e:
            return {'ok': False, 'error': str(e)}

    # -- power --
    def screen(self, on):
        """The picture on or off (DiceOS keeps running): wlopm, if it's installed."""
        if not shutil.which('wlopm'):
            return False
        user = desktop_user()
        try:
            r = subprocess.run(['wlopm', '--on' if on else '--off', '*'], env=user_env(user) if user != 'root' else None,
                               preexec_fn=demote(user) if user != 'root' else None, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8)
            return r.returncode == 0
        except (OSError, subprocess.SubprocessError):
            return False

    def power(self, action):
        # standby: what a TV calls off. The screen goes dark and the TV turns off (over HDMI), but
        # DiceOS keeps running, so the remote's power button (or the TV turning on) brings it back.
        # After a real shut down, only the Pi's own button (or unplugging it) can.
        if action == 'standby':
            self.standby_on = True
            tv = self.remote.send('tv-off') if self.remote.available else {'ok': False}
            return {'ok': True, 'screen': self.screen(False), 'tv': tv.get('ok', False)}
        if action == 'wake':
            was, self.standby_on = self.standby_on, False
            self.screen(True)
            if self.remote.available:
                self.remote.send('tv-on')
                self.remote.send('active')
            return {'ok': True, 'was': was}
        cmds = {'shutdown': ['systemctl', 'poweroff'], 'reboot': ['systemctl', 'reboot'], 'restart-desktop': ['systemctl', 'restart', 'dice-session@%s.service' % desktop_user()]}
        if action not in cmds:
            return {'ok': False, 'error': 'Unknown action'}
        threading.Timer(0.6, lambda: run(cmds[action])).start()
        return {'ok': True}

    # -- opening the real web browser over the desktop --
    def open_url(self, url, app=False, name=None, full=False):
        if not re.match(r'^https?://', url or ''):
            return {'ok': False, 'error': 'Only web addresses (http or https) can be opened.'}
        user = desktop_user()
        browser = shutil.which('chromium') or shutil.which('chromium-browser')
        if not browser:
            return {'ok': False, 'error': 'No web browser is installed.'}
        env = user_env(user) if user != 'root' else dict(os.environ)
        home = env.get('HOME', '/tmp')
        host = urllib.parse.urlsplit(url).hostname or url
        profile = '%s/.config/dice/browser' % home
        if full:
            # a TV app (Netflix, YouTube TV, DAZN…): full screen, no browser around it, and its own
            # profile, so it runs as its own app (you sign in once, inside it) and Home really closes it
            profile = '%s/.config/dice/apps/%s' % (home, re.sub(r'[^a-z0-9.-]', '', host.lower())[:60] or 'app')
        args = [browser, '--ozone-platform=wayland', '--user-data-dir=' + profile, '--no-first-run', '--password-store=basic', '--autoplay-policy=no-user-gesture-required']
        # as an app (no address bar: a web app you installed, a cloud gaming service) or a browser window
        args += (['--app=' + url, '--start-fullscreen', '--kiosk'] if full else ['--app=' + url]) if app or full else ['--new-window', url]
        return self.apps.launch(args, (name or host)[:60], 'tvapp' if full else 'web', url)

    # -- Bluetooth (bluetoothctl, from BlueZ): controllers, headphones and speakers --
    def bt(self, args, timeout=10):
        return run(['bluetoothctl'] + args, timeout=timeout)

    def bluetooth(self):
        if not has('bluetoothctl'):
            return {'ok': False, 'error': "Bluetooth isn't installed. In Terminal: sudo apt install bluez"}
        code, out = self.bt(['show'], timeout=6)
        if code != 0 or 'No default controller' in out or 'Controller' not in out:
            return {'ok': True, 'adapter': False, 'powered': False, 'devices': []}
        powered = 'Powered: yes' in out
        devices = []
        if powered:
            _, out = self.bt(['devices'], timeout=6)
            for d in parse_bt_devices(out)[:40]:
                _, info = self.bt(['info', d['mac']], timeout=4)
                d.update(parse_bt_info(info))
                devices.append(d)
        devices.sort(key=lambda d: (not d['connected'], not d['paired'], d['name'].lower()))
        return {'ok': True, 'adapter': True, 'powered': powered, 'devices': devices}

    def bluetooth_do(self, action, mac=None):
        if not has('bluetoothctl'):
            return self.bluetooth()
        mac = str(mac or '').upper()
        if action in ('pair', 'connect', 'disconnect', 'remove') and not BT_MAC.match(mac):
            return {'ok': False, 'error': "That isn't a Bluetooth device."}
        if action in ('on', 'off'):
            if action == 'on':
                run(['rfkill', 'unblock', 'bluetooth'], timeout=4)
            code, out = self.bt(['power', action], timeout=8)
        elif action == 'scan':
            self.bt(['--timeout', '10', 'scan', 'on'], timeout=16)
            code, out = 0, ''  # finding nothing new isn't a failure
        elif action == 'pair':
            # controllers and headphones pair with no code to type ("just works")
            code, out = self.bt(['--agent', 'NoInputNoOutput', '--timeout', '25', 'pair', mac], timeout=32)
            if bt_worked(code, out) or 'AlreadyExists' in out:
                self.bt(['trust', mac], timeout=6)  # so it connects by itself next time
                code, out = self.bt(['--timeout', '15', 'connect', mac], timeout=20)
        elif action in ('connect', 'disconnect', 'remove'):
            code, out = self.bt(['--timeout', '15', action, mac], timeout=20)
        else:
            return {'ok': False, 'error': 'Unknown action'}
        state = self.bluetooth()
        if not bt_worked(code, out):
            state['ok'] = False
            state['error'] = friendly_bt(out)
        return state

    # -- screenshots (grim), into ~/Pictures/Screenshots --
    def screenshot(self):
        user = desktop_user()
        if not has('grim'):
            return {'ok': False, 'error': 'Screenshots need grim. In Terminal: sudo apt install grim'}
        env = user_env(user) if user != 'root' else dict(os.environ)
        if not env.get('WAYLAND_DISPLAY'):
            return {'ok': False, 'error': "The screen isn't running."}
        files = Files(user)
        folder = os.path.join(files.home, 'Pictures', 'Screenshots')
        for d in (os.path.dirname(folder), folder):
            if not os.path.isdir(d):
                os.makedirs(d, exist_ok=True)
                files.chown(d)
        path = os.path.join(folder, time.strftime('Screenshot %Y-%m-%d at %H.%M.%S.png'))
        code, out = run(['grim', path], user=user if user != 'root' else None, env=env, timeout=15)
        if code != 0 or not os.path.exists(path):
            return {'ok': False, 'error': out or "grim couldn't take it."}
        files.chown(path)
        return {'ok': True, 'path': files.show(path)}

    # -- updates --
    def update(self):
        tool = os.path.join(ROOT, 'bin', 'dice-update')
        if not os.path.exists(tool):
            return {'ok': False, 'error': 'The updater is missing.'}
        log = '/var/log/dice-update.log' if os.getuid() == 0 else os.path.expanduser('~/.dice-update.log')
        with open(log, 'w') as f:
            subprocess.Popen([tool], stdout=f, stderr=subprocess.STDOUT, start_new_session=True)
        return {'ok': True}


# -- the TV's own remote, through the HDMI cable (HDMI-CEC) ------------------------------------------
# cec-client (from libcec, what Kodi uses too) talks to the TV. Each button pressed on
# the TV's remote comes out as a line like "key pressed: up (1) ...", which becomes one
# of DiceWeb's buttons and goes to the desktop through /api/events.
CEC_KEYS = {0x00: 'a', 0x01: 'up', 0x02: 'down', 0x03: 'left', 0x04: 'right', 0x09: 'menu', 0x0A: 'quick', 0x0B: 'menu', 0x0D: 'b',
            0x10: 'menu', 0x11: 'x', 0x30: 'rb', 0x31: 'lb', 0x35: 'x', 0x41: 'volup', 0x42: 'voldown', 0x43: 'mute',
            0x44: 'play', 0x45: 'stop', 0x46: 'play', 0x48: 'rew', 0x49: 'ff', 0x4B: 'next', 0x4C: 'prev', 0x53: 'guide',
            0x71: 'blue', 0x72: 'red', 0x73: 'green', 0x74: 'yellow', 0x91: 'b'}
CEC_KEYS.update({0x20 + n: 'd%d' % n for n in range(10)})
CEC_KEY_LINE = re.compile(r'key pressed: (.+?) \(([0-9a-f]{1,2})\)', re.I)
CEC_CMDS = {'tv-on': 'on 0', 'tv-off': 'standby 0', 'active': 'as', 'volup': 'volup', 'voldown': 'voldown', 'mute': 'mute'}


def parse_cec_key(line):
    """A 'key pressed' line from cec-client, as (DiceWeb button, the key's name), or None."""
    m = CEC_KEY_LINE.search(line or '')
    if not m:
        return None
    a = CEC_KEYS.get(int(m.group(2), 16))
    return (a, m.group(1).strip()) if a else None


# ---- this computer's own details, after it's set up: its name, time zone, keyboard, Wi-Fi country,
#      SSH and updates. Changing them uses dice-boot's own apply(), the same as a dice.json at start-up.
_boot = None


def boot_module():
    global _boot
    if _boot is None:
        import importlib.machinery
        import importlib.util
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'bin', 'dice-boot')
        loader = importlib.machinery.SourceFileLoader('dice_boot', path)
        spec = importlib.util.spec_from_loader('dice_boot', loader)
        mod = importlib.util.module_from_spec(spec)
        loader.exec_module(mod)
        _boot = mod
    return _boot


def device_info(settings_path):
    s = load_settings(settings_path)
    code, tz = run(['timedatectl', 'show', '-p', 'Timezone', '--value'], timeout=5)
    if code != 0 or not tz:
        tz = read('/etc/timezone').strip() or os.path.realpath('/etc/localtime').split('zoneinfo/')[-1]
    kb = dict(re.findall(r'^(XKBLAYOUT|XKBVARIANT)="?([^"\n]*)"?', read('/etc/default/keyboard'), re.M))
    keyboard = (kb.get('XKBLAYOUT') or 'us') + ('(%s)' % kb['XKBVARIANT'] if kb.get('XKBVARIANT') else '')
    code, reg = run(['iw', 'reg', 'get'], timeout=5)
    m = re.search(r'country ([A-Z]{2})', reg or '') if code == 0 else None
    enabled = lambda unit: run(['systemctl', 'is-enabled', unit], timeout=5)[1].strip() == 'enabled'
    return {'ok': True, 'computer': socket.gethostname(), 'timezone': tz, 'keyboard': keyboard, 'wifi_country': m.group(1) if m and m.group(1) != '00' else '',
            'ssh': enabled('ssh'), 'updates': enabled('dice-update.timer'), 'password_set': bool(s.get('password_set')), 'user': desktop_user()}


def device_change(settings_path, b):
    """Settings, This computer: change some details, or use a whole dice.json."""
    cfg = {}
    for k in ('computer', 'timezone', 'keyboard', 'name', 'look', 'world', 'buddy', 'boot', 'start', 'homeassistant', 'screen', 'updates', 'ssh', 'password', 'suite',
              'looks', 'accent', 'text', 'clock', 'units', 'sounds', 'nightlight', 'motion', 'ambient', 'deuce', 'tv', 'desk'):
        if k in b:
            cfg[k] = b[k]
    if isinstance(b.get('wifi'), dict):
        cfg['wifi'] = {k: v for k, v in b['wifi'].items() if k in ('ssid', 'password', 'country', 'hidden')}
    if 'computer' in cfg:
        cfg['computer'] = str(cfg['computer'] or '').strip().lower()
        if not cfg['computer']:
            del cfg['computer']
    if not cfg:
        return {'ok': False, 'error': 'Nothing to change.'}
    boot = boot_module()
    boot.SETTINGS = settings_path
    done, problems = boot.apply(cfg, quiet=True)
    return {'ok': not problems or bool(done), 'done': done, 'problems': problems, 'device': device_info(settings_path)}


# ---- a PC's screens: the video half of a KVM switch, over DDC/CI ---------------------------------
# A monitor's own computer link (DDC/CI, in every HDMI and DisplayPort cable) can ask it to show
# another of its inputs: VCP code 0x60, "Input Source". ddcutil does the asking. (A TV doesn't
# speak it: a TV is switched with HDMI-CEC, above.)
INPUT_NAMES = {0x01: 'VGA 1', 0x02: 'VGA 2', 0x03: 'DVI 1', 0x04: 'DVI 2', 0x05: 'Composite 1', 0x06: 'Composite 2', 0x07: 'S-Video 1', 0x08: 'S-Video 2',
               0x09: 'Tuner 1', 0x0A: 'Tuner 2', 0x0B: 'Tuner 3', 0x0C: 'Component 1', 0x0D: 'Component 2', 0x0E: 'Component 3', 0x0F: 'DisplayPort 1',
               0x10: 'DisplayPort 2', 0x11: 'HDMI 1', 0x12: 'HDMI 2', 0x13: 'HDMI 3', 0x14: 'HDMI 4', 0x1B: 'USB-C'}


class Monitors:
    """The screens plugged into this computer, and which of their inputs they show."""
    def __init__(self):
        self.found = (0.0, [])
        self.home = {}  # screen number -> the input DiceOS is on, to come back to
        self.lock = threading.Lock()

    def why(self):
        if not has('ddcutil'):
            return 'ddcutil isn\'t installed. In Terminal: sudo apt install ddcutil'
        if not glob.glob('/dev/i2c-*'):
            return 'This computer can\'t talk to its screens yet. In Terminal: sudo modprobe i2c-dev'
        return ''

    @staticmethod
    def parse_detect(text):
        """`ddcutil detect --brief`: Display 1 / I2C bus: /dev/i2c-4 / DRM connector: card1-HDMI-A-1 / Monitor: DEL:DELL U2720Q:SERIAL"""
        out, cur = [], None
        for line in text.splitlines():
            m = re.match(r'\s*Display (\d+)\s*$', line)
            if m:
                cur = {'n': int(m.group(1)), 'bus': '', 'connector': '', 'name': 'Screen ' + m.group(1)}
                out.append(cur)
                continue
            if re.match(r'\s*Invalid display', line):
                cur = None
                continue
            m = re.match(r'\s*(I2C bus|DRM connector|Monitor):\s*(.+)', line)
            if m and cur:
                k, v = m.group(1), m.group(2).strip()
                if k == 'I2C bus':
                    cur['bus'] = v
                elif k == 'DRM connector':
                    cur['connector'] = v
                else:
                    parts = v.split(':')
                    if len(parts) >= 2 and parts[1].strip():
                        cur['name'] = parts[1].strip()
        return out

    @staticmethod
    def parse_caps(text):
        """The input codes a screen lists for VCP 60 in `ddcutil capabilities`."""
        codes, inside = [], False
        for line in text.splitlines():
            if re.match(r'\s*Feature:\s*60\b', line):
                inside = True
                continue
            if inside and re.match(r'\s*Feature:', line):
                break
            m = re.match(r'\s*([0-9a-fA-F]{2}):\s*(.*)', line) if inside else None
            if m:
                codes.append(int(m.group(1), 16))
        return codes

    @staticmethod
    def parse_current(text):
        """`ddcutil getvcp 60 --terse`: VCP 60 SNC x0f (or the long form: ... (sl=0x0f))"""
        m = re.search(r'VCP 60 SNC x([0-9a-fA-F]+)', text) or re.search(r'sl=0x([0-9a-fA-F]+)', text)
        return int(m.group(1), 16) & 0xFF if m else None

    def list(self, fresh=False):
        problem = self.why()
        if problem:
            return {'ok': False, 'error': problem, 'screens': []}
        with self.lock:
            if fresh or time.time() - self.found[0] > 300:
                code, out = run(['ddcutil', 'detect', '--brief'], timeout=25)
                screens = self.parse_detect(out) if code == 0 else []
                for s in screens:
                    code, caps = run(['ddcutil', '--display', str(s['n']), 'capabilities'], timeout=20)
                    s['codes'] = self.parse_caps(caps) if code == 0 else []
                self.found = (time.time(), screens)
            screens = [dict(s) for s in self.found[1]]
        for s in screens:
            code, out = run(['ddcutil', '--display', str(s['n']), 'getvcp', '60', '--terse'], timeout=10)
            cur = self.parse_current(out) if code == 0 else None
            s['current'] = cur
            if cur and s['n'] not in self.home:
                self.home[s['n']] = cur  # where DiceOS is: what "come back" goes to
            here = self.home.get(s['n'])
            codes = s.pop('codes', None) or ([cur] if cur else [])
            s['inputs'] = [{'code': c, 'name': INPUT_NAMES.get(c, 'Input %02X' % c), 'here': c == here, 'on': c == cur} for c in codes]
        return {'ok': True, 'screens': screens}

    def switch(self, n, code):
        """Show another input on screen n. (Asked of the screen while it still shows DiceOS, so it hears.)"""
        problem = self.why()
        if problem:
            return {'ok': False, 'error': problem}
        if not isinstance(n, int) or not 1 <= n <= 16 or not isinstance(code, int) or not 1 <= code <= 0xFF:
            return {'ok': False, 'error': 'That isn\'t a screen\'s input.'}
        if n not in self.home:
            c, out = run(['ddcutil', '--display', str(n), 'getvcp', '60', '--terse'], timeout=10)
            cur = self.parse_current(out) if c == 0 else None
            if cur:
                self.home[n] = cur
        c, out = run(['ddcutil', '--display', str(n), '--noverify', 'setvcp', '60', '0x%02x' % code], timeout=15)
        if c != 0:
            return {'ok': False, 'error': 'The screen didn\'t switch: ' + (out.splitlines() or [''])[-1]}
        return {'ok': True, 'home': self.home.get(n)}

    def back(self):
        """Every screen back to DiceOS. Most screens still hear this while they show something else."""
        done = []
        for n, code in list(self.home.items()):
            c, _ = run(['ddcutil', '--display', str(n), '--noverify', 'setvcp', '60', '0x%02x' % code], timeout=15)
            if c == 0:
                done.append(n)
        return {'ok': bool(done) or not self.home, 'screens': done}


class Remote:
    """Keeps cec-client running while there's an HDMI-CEC port, and passes the presses on."""
    def __init__(self, settings_path):
        self.settings_path = settings_path
        self.intercept = None
        self.la = 4  # this computer's address on the HDMI bus (cec-client says which when it starts)
        self.scan_buf = None
        self.scan_done = threading.Event()
        self.found = (0.0, [])
        self.proc = None
        self.available = False
        self.tv = None
        self.why = ''
        self.subs = set()
        self.lock = threading.Lock()
        self.last = (None, 0.0)
        self.started = False

    def ports(self):
        return glob.glob('/dev/cec[0-9]*') + glob.glob('/dev/serial/by-id/*Pulse-Eight*')

    def start(self):
        if self.started:
            return
        self.started = True
        if not has('cec-client'):
            self.why = "cec-client isn't installed. In Terminal: sudo apt install cec-utils"
            return
        if not self.ports():
            self.why = 'This computer\'s HDMI has no CEC.'
            return
        threading.Thread(target=self.run, daemon=True).start()

    def state(self):
        return {'ok': True, 'available': self.available, 'tv': self.tv, 'why': self.why}

    # -- other HDMI things on the TV: a games console, a cable box. Dice can switch the TV to them,
    #    pass the remote's buttons on to them, and come back (a KVM switch, over the HDMI cable)
    def heard(self, line):
        m = re.search(r'logical address\(es\) = .*?\((\d+)\)', line)
        if m:
            self.la = int(m.group(1))
        m = re.search(r"TV \(0\): power status changed from '([^']+)' to '([^']+)'", line)
        if m:
            self.push({'tv': 'on' if m.group(2) == 'on' else 'standby'})
        if self.scan_buf is not None:
            self.scan_buf.append(line)
            if 'currently active source' in line:
                self.scan_done.set()

    @staticmethod
    def parse_scan(lines):
        devs, cur = [], None
        for line in lines:
            m = re.match(r'\s*device #(\d+):\s*(.+)', line)
            if m:
                cur = {'la': int(m.group(1)), 'kind': m.group(2).strip(), 'name': m.group(2).strip(), 'pa': '', 'vendor': '', 'power': '', 'active': False}
                devs.append(cur)
                continue
            m = re.match(r'\s*(address|active source|vendor|osd string|power status):\s*(.*)', line)
            if m and cur:
                k, v = m.group(1), m.group(2).strip()
                if k == 'address':
                    cur['pa'] = v
                elif k == 'active source':
                    cur['active'] = v == 'yes'
                elif k == 'vendor':
                    cur['vendor'] = v
                elif k == 'osd string' and v:
                    cur['name'] = v
                elif k == 'power status':
                    cur['power'] = v
        return devs

    def scan(self):
        if not self.available:
            return {'ok': False, 'error': self.why or 'The TV isn\'t answering over HDMI.', 'devices': []}
        if time.time() - self.found[0] < 30:
            return {'ok': True, 'devices': self.found[1]}
        self.scan_buf = []
        self.scan_done.clear()
        self.raw('scan')
        self.scan_done.wait(12)
        lines, self.scan_buf = self.scan_buf or [], None
        devs = [d for d in self.parse_scan(lines) if d['la'] not in (self.la, 15)]
        self.found = (time.time(), devs)
        return {'ok': True, 'devices': devs, 'me': self.la}

    def raw(self, line):
        p = self.proc
        if not p or p.poll() is not None:
            return {'ok': False, 'error': 'The TV isn\'t answering.'}
        try:
            p.stdin.write(line + '\n')
            p.stdin.flush()
            return {'ok': True}
        except (OSError, ValueError) as e:
            return {'ok': False, 'error': str(e)}

    def switch(self, pa):
        """Ask the TV to show the thing at this HDMI address (Set Stream Path)."""
        m = re.fullmatch(r'(\d)\.(\d)\.(\d)\.(\d)', pa or '')
        if not m:
            return {'ok': False, 'error': 'That isn\'t an HDMI address.'}
        a, b, c, d = (int(x) for x in m.groups())
        return self.raw('tx %XF:86:%X%X:%X%X' % (self.la, a, b, c, d))

    UI = {'a': 0x00, 'up': 0x01, 'down': 0x02, 'left': 0x03, 'right': 0x04, 'menu': 0x09, 'b': 0x0D, 'rb': 0x30, 'lb': 0x31, 'x': 0x35,
          'power': 0x40, 'volup': 0x41, 'voldown': 0x42, 'mute': 0x43, 'play': 0x44, 'stop': 0x45, 'pause': 0x46, 'rew': 0x48, 'ff': 0x49,
          'next': 0x4B, 'prev': 0x4C, 'guide': 0x53, 'blue': 0x71, 'red': 0x72, 'green': 0x73, 'yellow': 0x74}

    def key(self, la, a):
        """A remote button, passed on to another HDMI thing (User Control Pressed, then Released)."""
        code = self.UI.get(a)
        if code is None and re.fullmatch(r'd\d', a or ''):
            code = 0x20 + int(a[1])
        if code is None or not isinstance(la, int) or not 0 <= la <= 14:
            return {'ok': False, 'error': 'That button can\'t be passed on.'}
        r = self.raw('tx %X%X:44:%02X' % (self.la, la, code))
        self.raw('tx %X%X:45' % (self.la, la))
        return r

    def send(self, cmd):
        line = CEC_CMDS.get(cmd)
        if not line:
            return {'ok': False, 'error': 'Unknown command'}
        p = self.proc
        if not p or p.poll() is not None:
            return {'ok': False, 'error': 'The TV isn\'t answering.'}
        try:
            p.stdin.write(line + '\n')
            p.stdin.flush()
            return {'ok': True}
        except (OSError, ValueError) as e:
            return {'ok': False, 'error': str(e)}

    def push(self, ev):
        with self.lock:
            subs = list(self.subs)
        for q in subs:
            try:
                q.put_nowait(ev)
            except queue.Full:
                pass

    def press(self, line):
        k = parse_cec_key(line)
        if not k:
            return None
        now = time.monotonic()
        if self.last[0] == k[0] and now - self.last[1] < 0.06:  # the same press, said twice
            return None
        self.last = (k[0], now)
        ev = {'a': k[0], 'key': k[1]}
        if self.intercept and self.intercept(ev):  # Home while an app is open on top: diced closes it
            return ev
        self.push(ev)
        return ev

    def run(self):
        while True:
            try:
                self.proc = subprocess.Popen(['cec-client', '-t', 'p', '-o', 'DiceOS', '-d', '16'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                             stderr=subprocess.STDOUT, text=True, bufsize=1)
                woke = False
                for line in self.proc.stdout:
                    if not self.available and ('connection opened' in line or 'CEC client registered' in line):
                        self.available, self.why = True, ''
                        self.push({'cec': self.state()})
                    if self.available and not woke:
                        woke = True
                        if load_settings(self.settings_path).get('cec_tv_on', True):
                            self.send('tv-on')
                            self.send('active')
                    m = re.search(r'TV \(0\).*?(?:vendor|OSD name)[^\']*\'([^\']+)\'', line)
                    if m:
                        self.tv = m.group(1)
                    self.heard(line)
                    self.press(line)
                self.proc.wait()
            except OSError as e:
                self.why = str(e)
            if self.available:
                self.available = False
                self.push({'cec': self.state()})
            self.why = self.why or 'No TV answered. Is CEC on in the TV\'s settings?'
            time.sleep(15)  # try again: the TV may have been off


# The power button on an air mouse or a media keyboard is an ordinary key (KEY_POWER).
# Left alone, the system would turn the whole computer off when it's pressed, so
# DiceOS tells logind to ignore it (system/logind-dice.conf) and catches it here
# instead, passing it to the desktop like a remote button: there it sleeps, or asks.
# (Holding it for 5 seconds still turns the computer off, through logind.)
POWER_KEYS = {116: 'Power', 142: 'Sleep', 143: 'WakeUp'}  # KEY_POWER, KEY_SLEEP, KEY_WAKEUP
HOME_KEY, KEY_ESC, KEY_LEFTMETA, KEY_RIGHTMETA = 172, 1, 125, 126  # KEY_HOMEPAGE (a remote's Home), and Super + Esc
# a remote's own buttons, read straight from it (the browser doesn't see them all, or sees them as
# "go back a page"): Back, Home, and the microphone button (which remotes send as one of these)
KEY_BACK, KEY_SEARCH, KEY_VOICECOMMAND, KEY_ASSISTANT = 158, 217, 582, 583
REMOTE_KEYS = {KEY_BACK: 'b', HOME_KEY: 'home', KEY_SEARCH: 'voice', KEY_VOICECOMMAND: 'voice', KEY_ASSISTANT: 'voice'}
EV_KEY = 1
INPUT_EVENT = struct.Struct('llHHi')  # struct input_event: a time, then type, code and value


def kernel_long_bits():
    """How many bits the kernel's long has (a Pi can run a 64-bit kernel under 32-bit programs)."""
    m = os.uname().machine.lower()
    return 64 if m.endswith('64') or m in ('aarch64', 'x86_64', 's390x') else 32


def key_bits(text, bits=None):
    """The set of key codes a device has, from /sys/class/input/eventN/device/capabilities/key.

    That file is hex words, each the size of the kernel's long, most significant first
    (a Power Button reads '10000000000000 0' on a 64-bit kernel: bit 116, KEY_POWER)."""
    words = (text or '').split()
    if not words:
        return set()
    bits = bits or kernel_long_bits()
    out = set()
    for i, w in enumerate(reversed(words)):
        try:
            v = int(w, 16)
        except ValueError:
            return set()
        n = 0
        while v:
            if v & 1:
                out.add(i * bits + n)
            v >>= 1
            n += 1
    return out


def parse_input_events(data):
    """(code, value) for each key event in raw bytes read from /dev/input/eventN."""
    out = []
    size = INPUT_EVENT.size
    for i in range(0, len(data) - size + 1, size):
        _, _, typ, code, value = INPUT_EVENT.unpack_from(data, i)
        if typ == EV_KEY:
            out.append((code, value))
    return out


class PowerKeys:
    """Watches every keyboard-like device that has a power or sleep key (air mice, media
    keyboards, some remotes) and sends a 'power' button to the desktop when one is pressed."""
    def __init__(self, push, root='/dev/input', home=None, front=None, voice_key=None):
        self.push = push
        self.root = root
        self.home = home  # called for Home on a remote, or Super + Esc: closes an app that's on top of Dice
        self.front = front or (lambda: None)  # what's open on top of Dice, if anything
        self.voice_key = voice_key or (lambda: None)  # a button taught in Settings, for remotes that send something else
        self.fds = {}
        self.started = False
        self.last = 0.0
        self.meta = set()
        self.swallow = set()
        self.learn = 0.0
        self.remote_keys = False

    def devices(self):
        out = []
        for path in sorted(glob.glob(os.path.join(self.root, 'event*'))):
            cap = '/sys/class/input/%s/device/capabilities/key' % os.path.basename(path)
            try:
                with open(cap) as f:
                    bits = key_bits(f.read())
                if bits & set(POWER_KEYS) or bits & set(REMOTE_KEYS) or (self.home and {KEY_ESC, KEY_LEFTMETA} <= bits):
                    out.append(path)
                    if bits & set(REMOTE_KEYS):
                        self.remote_keys = True
            except OSError:
                continue
        return out

    def start(self):
        if self.started or not os.path.isdir(self.root):
            return
        self.started = True
        threading.Thread(target=self.run, daemon=True).start()

    def handle(self, data):
        for code, value in parse_input_events(data):
            if code in (KEY_LEFTMETA, KEY_RIGHTMETA):
                (self.meta.add if value else self.meta.discard)(code)
                continue
            if self.learn and value == 1 and time.monotonic() < self.learn and code not in (KEY_LEFTMETA, KEY_RIGHTMETA):
                self.learn = 0.0
                self.push({'learned': code})
                continue
            taught = self.voice_key()
            if code in REMOTE_KEYS or (taught and code == taught):
                a = 'voice' if code == taught else REMOTE_KEYS[code]
                if value == 2:  # held: repeats aren't new presses
                    continue
                if value == 1 and a == 'home' and self.home and self.home():
                    self.swallow.add(code)  # Home closed the app on top: that's all it does
                    continue
                if value == 0 and code in self.swallow:
                    self.swallow.discard(code)
                    continue
                if a == 'b' and self.front():
                    continue  # the app on top has its own Back
                self.push({'a': a, 'down': value == 1, 'key': 'remote'})
                continue
            if self.home and value == 1 and code == KEY_ESC and self.meta:
                self.home()
                continue
            if code in POWER_KEYS and value == 1:
                now = time.monotonic()
                if now - self.last < 0.5:  # one press can come from two devices at once
                    continue
                self.last = now
                self.push({'a': 'power', 'key': POWER_KEYS[code]})

    def run(self):
        import select
        scanned = 0.0
        while True:
            now = time.monotonic()
            if now - scanned > 10:  # Bluetooth remotes come and go
                scanned = now
                for path in self.devices():
                    if path not in self.fds:
                        try:
                            self.fds[path] = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
                        except OSError:
                            pass
            if not self.fds:
                time.sleep(5)
                continue
            try:
                ready, _, _ = select.select(list(self.fds.values()), [], [], 5)
            except (OSError, ValueError):
                ready = []
            for fd in ready:
                try:
                    data = os.read(fd, INPUT_EVENT.size * 64)
                except BlockingIOError:
                    continue
                except OSError:
                    data = b''
                if not data:  # the device went away
                    for path, f in list(self.fds.items()):
                        if f == fd:
                            del self.fds[path]
                    try:
                        os.close(fd)
                    except OSError:
                        pass
                    continue
                self.handle(data)


BT_MAC = re.compile(r'^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$')


def parse_bt_devices(text):
    """The 'Device AA:BB:CC:DD:EE:FF Name' lines bluetoothctl lists."""
    out, seen = [], set()
    for line in (text or '').splitlines():
        m = re.match(r'^\s*Device ([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})\s*(.*)$', line)
        if m and m.group(1).upper() not in seen:
            seen.add(m.group(1).upper())
            out.append({'mac': m.group(1).upper(), 'name': m.group(2).strip() or m.group(1).upper()})
    return out


def parse_bt_info(text):
    """The useful lines of 'bluetoothctl info'."""
    info = {'paired': False, 'connected': False, 'trusted': False, 'icon': '', 'battery': None}
    for line in (text or '').splitlines():
        k, _, v = line.strip().partition(': ')
        v = v.strip()
        if k in ('Paired', 'Connected', 'Trusted'):
            info[k.lower()] = v == 'yes'
        elif k == 'Icon':
            info['icon'] = v
        elif k in ('Name', 'Alias') and v and 'name' not in info:
            info['name'] = v
        elif k == 'Battery Percentage':
            m = re.search(r'\((\d+)\)', v)
            if m:
                info['battery'] = int(m.group(1))
    return info


def bt_worked(code, out):
    out = out or ''
    if re.search(r'successful|Changing power \w+ succeeded|Device has been removed', out):
        return True
    return code == 0 and not re.search(r'Failed|Error|not available|Unable', out)


def friendly_bt(out):
    out = out or ''
    if re.search(r'Authentication(Failed|Canceled|Rejected)', out):
        return "It didn't pair. Put it in pairing mode again (its light flashing fast), then press Pair."
    if re.search(r'not available|DoesNotExist', out):
        return "That device isn't nearby any more. Look for devices again."
    if re.search(r'ConnectionAttemptFailed|Failed to connect|br-connection', out):
        return "It didn't connect. Is it switched on and close by?"
    if re.search(r'Blocked|rfkill|NotReady', out):
        return 'Bluetooth is switched off on this computer.'
    lines = [l for l in out.splitlines() if l.strip() and not l.startswith('[')]
    return (lines[-1] if lines else 'Bluetooth said no.')[:160]


def split_nm(line):
    """nmcli -t output: fields split by ':' with '\\:' meaning a real colon."""
    out, cur, i = [], '', 0
    while i < len(line):
        ch = line[i]
        if ch == '\\' and i + 1 < len(line):
            cur += line[i + 1]
            i += 2
            continue
        if ch == ':':
            out.append(cur)
            cur = ''
        else:
            cur += ch
        i += 1
    out.append(cur)
    return out


def friendly_nm(text):
    t = text or ''
    if 'Secrets were required' in t or 'password' in t.lower():
        return 'That password didn\'t work.'
    if 'No network with SSID' in t:
        return 'That network isn\'t in range.'
    return t.replace('Error: ', '') or 'It didn\'t connect.'


# ---------------------------------------------------------------------------
# files: only inside your home folder and plugged-in drives

class Files:
    def __init__(self, user):
        self.user = user
        self.home = os.path.realpath(pwd.getpwnam(user).pw_dir) if user != 'root' or os.getuid() == 0 else os.path.expanduser('~')
        self.roots = [self.home, '/media', '/mnt']

    def resolve(self, path):
        path = (path or '~').strip()
        if path == '~' or path.startswith('~/'):
            path = self.home + path[1:]
        if not os.path.isabs(path):
            path = os.path.join(self.home, path)
        real = os.path.realpath(path)
        for r in self.roots:
            if real == r or real.startswith(r.rstrip('/') + '/'):
                return real
        raise PermissionError('DiceOS can only open things in your home folder and on plugged-in drives.')

    def show(self, real):
        return '~' + real[len(self.home):] if real == self.home or real.startswith(self.home + '/') else real

    def chown(self, path):
        if os.getuid() == 0 and self.user != 'root':
            pw = pwd.getpwnam(self.user)
            try:
                os.chown(path, pw.pw_uid, pw.pw_gid)
            except OSError:
                pass

    def list(self, path):
        real = self.resolve(path)
        items = []
        with os.scandir(real) as it:
            for e in it:
                if e.name.startswith('.'):
                    continue
                try:
                    st = e.stat()
                    items.append({'name': e.name, 'dir': e.is_dir(), 'size': st.st_size, 'mtime': int(st.st_mtime)})
                except OSError:
                    continue
        items.sort(key=lambda x: (not x['dir'], x['name'].lower()))
        drives = []
        for base in ('/media', '/mnt'):
            if os.path.isdir(base):
                for root, dirs, _ in os.walk(base):
                    for d in dirs:
                        p = os.path.join(root, d)
                        if os.path.ismount(p):
                            drives.append({'name': d, 'path': p})
                    if root.count('/') > 2:
                        dirs[:] = []
        return {'path': self.show(real), 'real': real, 'home': self.home, 'items': items, 'drives': drives}

    SKIP = {'node_modules', '__pycache__', 'snap', 'venv', '.venv'}

    def tree(self, path, limit=5000):
        """Every file under a folder (for Dice Cloud's folder on this computer): its path inside the
        folder, size and time. Hidden things and half-written files are left out."""
        real = self.resolve(path)
        if not os.path.isdir(real):
            os.makedirs(real, exist_ok=True)
            self.chown(real)
        out = []
        for root, dirs, files in os.walk(real):
            dirs[:] = sorted(d for d in dirs if not d.startswith('.') and d not in self.SKIP and not os.path.islink(os.path.join(root, d)))
            for n in sorted(files):
                if n.startswith('.') or n.endswith('.dice-part'):
                    continue
                p = os.path.join(root, n)
                try:
                    st = os.lstat(p)
                except OSError:
                    continue
                if not stat.S_ISREG(st.st_mode):
                    continue
                out.append({'path': os.path.relpath(p, real), 'size': st.st_size, 'mtime': int(st.st_mtime)})
                if len(out) >= limit:
                    return {'ok': True, 'path': self.show(real), 'files': out, 'more': True}
        return {'ok': True, 'path': self.show(real), 'files': out, 'more': False}

    def find(self, query, limit=20, budget=6000):
        """Files and folders in your home folder whose names contain the words, best first
        (for the Dice Bar). Hidden folders and the usual heavy ones are skipped, links aren't
        followed, and it stops after looking at a few thousand things."""
        words = [w for w in (query or '').lower().split() if w][:4]
        if not words:
            return []
        found, seen = [], 0
        for root, dirs, names in os.walk(self.home, followlinks=False):
            dirs[:] = sorted(d for d in dirs if not d.startswith('.') and d not in self.SKIP)
            if root.count(os.sep) - self.home.count(os.sep) >= 6:
                dirs[:] = []
            for n, is_dir in [(d, True) for d in dirs] + [(f, False) for f in names if not f.startswith('.')]:
                seen += 1
                low = n.lower()
                if all(w in low for w in words):
                    full = os.path.join(root, n)
                    score = (0 if low.startswith(words[0]) else 1, full.count(os.sep), len(n))
                    found.append((score, {'name': n, 'path': self.show(full), 'dir': is_dir}))
            if seen > budget:
                break
        found.sort(key=lambda x: x[0])
        return [f for _, f in found[:limit]]

    def mkdir(self, path):
        real = self.resolve(path)
        os.makedirs(real, exist_ok=False)
        self.chown(real)

    def rename(self, path, to):
        src = self.resolve(path)
        if '/' in to or not to.strip() or to in ('.', '..'):
            raise ValueError('That name won\'t work.')
        dst = os.path.join(os.path.dirname(src), to.strip())
        self.resolve(dst)
        if os.path.exists(dst):
            raise FileExistsError('Something called %s is already there.' % to)
        os.rename(src, dst)

    # The Trash is the usual one for Linux (the freedesktop.org one): the thing goes in
    # Trash/files, and a little .trashinfo note in Trash/info says where it came from and
    # when, so it can go back (and other Linux apps understand it too).
    def bin(self):
        base = os.path.join(self.home, '.local', 'share', 'Trash')
        for d in ('files', 'info'):
            os.makedirs(os.path.join(base, d), exist_ok=True)
        return os.path.join(base, 'files'), os.path.join(base, 'info')

    @staticmethod
    def free_name(folder, name):
        stem, ext = os.path.splitext(name)
        if name.startswith('.') and not ext:
            stem, ext = name, ''
        dst, n = os.path.join(folder, name), 1
        while os.path.lexists(dst):
            n += 1
            dst = os.path.join(folder, '%s (%d)%s' % (stem, n, ext))
        return dst

    def trash(self, path):
        src = self.resolve(path)
        if src == self.home:
            raise PermissionError('DiceOS won\'t put your whole home folder in the Trash.')
        files_dir, info_dir = self.bin()
        if src == files_dir or src.startswith(files_dir + '/'):
            raise PermissionError('That\'s already in the Trash.')
        dst = self.free_name(files_dir, os.path.basename(src))
        with open(os.path.join(info_dir, os.path.basename(dst) + '.trashinfo'), 'w') as f:
            f.write('[Trash Info]\nPath=%s\nDeletionDate=%s\n' % (urllib.parse.quote(src), time.strftime('%Y-%m-%dT%H:%M:%S')))
        shutil.move(src, dst)
        return os.path.basename(dst)

    def trash_info(self, name):
        _, info_dir = self.bin()
        out = {}
        try:
            with open(os.path.join(info_dir, name + '.trashinfo')) as f:
                for line in f:
                    k, _, v = line.strip().partition('=')
                    if k == 'Path':
                        out['from'] = urllib.parse.unquote(v)
                    elif k == 'DeletionDate':
                        try:
                            out['at'] = int(time.mktime(time.strptime(v[:19], '%Y-%m-%dT%H:%M:%S')))
                        except ValueError:
                            pass
        except OSError:
            pass
        return out

    @staticmethod
    def size_of(path):
        if not os.path.isdir(path) or os.path.islink(path):
            try:
                return os.lstat(path).st_size
            except OSError:
                return 0
        total = 0
        for root, _, names in os.walk(path):
            for n in names:
                try:
                    total += os.lstat(os.path.join(root, n)).st_size
                except OSError:
                    pass
        return total

    def trash_list(self):
        files_dir, _ = self.bin()
        items = []
        for e in os.scandir(files_dir):
            info = self.trash_info(e.name)
            try:
                mtime = int(e.stat(follow_symlinks=False).st_mtime)
            except OSError:
                mtime = 0
            frm = info.get('from', '')
            items.append({'name': e.name, 'dir': e.is_dir(follow_symlinks=False), 'size': self.size_of(e.path), 'mtime': info.get('at', mtime),
                          'from': self.show(frm) if frm else ''})
        items.sort(key=lambda x: -x['mtime'])
        return items

    def in_bin(self, name):
        files_dir, _ = self.bin()
        if not name or '/' in name or name in ('.', '..'):
            raise ValueError('That isn\'t in the Trash.')
        p = os.path.join(files_dir, name)
        if not os.path.lexists(p):
            raise FileNotFoundError('That isn\'t in the Trash any more.')
        return p

    def restore(self, name):
        src = self.in_bin(name)
        frm = self.trash_info(name).get('from') or os.path.join(self.home, name)
        folder = os.path.dirname(frm)
        try:
            folder = self.resolve(folder)
        except PermissionError:
            folder = self.home
        if not os.path.isdir(folder):
            folder = self.home  # its folder's gone: it comes back to Home
        dst = self.free_name(folder, os.path.basename(frm))
        shutil.move(src, dst)
        try:
            os.remove(os.path.join(self.bin()[1], name + '.trashinfo'))
        except OSError:
            pass
        return self.show(dst)

    def forget(self, name=None):
        """Gone for good: one thing from the Trash, or (no name) all of it."""
        files_dir, info_dir = self.bin()
        names = [name] if name else os.listdir(files_dir)
        for n in names:
            p = self.in_bin(n)
            if os.path.isdir(p) and not os.path.islink(p):
                shutil.rmtree(p)
            else:
                os.remove(p)
            try:
                os.remove(os.path.join(info_dir, n + '.trashinfo'))
            except OSError:
                pass
        return len(names)

    def move(self, path, to_dir):
        src, dst_dir = self.resolve(path), self.resolve(to_dir)
        if not os.path.isdir(dst_dir):
            raise NotADirectoryError('That folder isn\'t there.')
        if dst_dir == src or dst_dir.startswith(src + '/'):
            raise ValueError('A folder can\'t go inside itself.')
        if os.path.dirname(src) == dst_dir:
            return self.show(src)
        dst = os.path.join(dst_dir, os.path.basename(src))
        if os.path.lexists(dst):
            raise FileExistsError('Something called %s is already there.' % os.path.basename(src))
        shutil.move(src, dst)
        return self.show(dst)

    def usage(self):
        u = shutil.disk_usage(self.home)
        return {'used': u.used, 'quota': u.total, 'free': u.free, 'trash': self.size_of(self.bin()[0])}

    def copy(self, path, to_dir):
        src, dst_dir = self.resolve(path), self.resolve(to_dir)
        if dst_dir == src or dst_dir.startswith(src + '/'):
            raise ValueError('A folder can\'t go inside itself.')
        dst = os.path.join(dst_dir, os.path.basename(src))
        if os.path.dirname(src) == dst_dir:  # a copy next to it
            stem, ext = os.path.splitext(os.path.basename(src))
            dst = self.free_name(dst_dir, stem + ' copy' + ext)
        elif os.path.exists(dst):
            raise FileExistsError('Something with that name is already there.')
        (shutil.copytree if os.path.isdir(src) else shutil.copy2)(src, dst)
        for root, dirs, names in os.walk(dst) if os.path.isdir(dst) else [(os.path.dirname(dst), [], [os.path.basename(dst)])]:
            for n in dirs + names:
                self.chown(os.path.join(root, n))
        self.chown(dst)
        return self.show(dst)

    def write(self, path, data, mtime=None, make_dirs=False):
        real = self.resolve(path)
        if os.path.isdir(real):
            raise IsADirectoryError('That\'s a folder.')
        if make_dirs:  # (Dice Cloud's folder on this computer: its folders come as their files do)
            parent = os.path.dirname(real)
            if not os.path.isdir(parent):
                os.makedirs(parent, exist_ok=True)
                d = parent
                while d.startswith(self.home + os.sep) and d != self.home:
                    self.chown(d)
                    d = os.path.dirname(d)
        tmp = real + '.dice-part'
        with open(tmp, 'wb') as f:
            f.write(data)
        os.replace(tmp, real)
        if mtime:
            os.utime(real, (mtime, mtime))
        self.chown(real)
        return {'ok': True, 'mtime': int(os.stat(real).st_mtime), 'size': len(data)}


# ---------------------------------------------------------------------------
# a real Terminal: a shell in a pseudo-terminal, over a WebSocket

WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'


def ws_accept(key):
    return base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()


def ws_frame(payload, opcode=0x2):
    head = bytes([0x80 | opcode])
    n = len(payload)
    if n < 126:
        head += bytes([n])
    elif n < 65536:
        head += bytes([126]) + struct.pack('>H', n)
    else:
        head += bytes([127]) + struct.pack('>Q', n)
    return head + payload


def ws_read(sock):
    """One frame from the browser: (opcode, payload), or (None, None) when it's gone."""
    def need(n):
        buf = b''
        while len(buf) < n:
            chunk = sock.recv(n - len(buf))
            if not chunk:
                return None
            buf += chunk
        return buf
    h = need(2)
    if not h:
        return None, None
    op, n, masked = h[0] & 0x0F, h[1] & 0x7F, h[1] & 0x80
    if n == 126:
        n = struct.unpack('>H', need(2))[0]
    elif n == 127:
        n = struct.unpack('>Q', need(8))[0]
    if n > 4 * 1024 * 1024:
        return None, None
    mask = need(4) if masked else b'\0\0\0\0'
    data = need(n) if n else b''
    if data is None or mask is None:
        return None, None
    return op, bytes(b ^ mask[i % 4] for i, b in enumerate(data))


def pty_session(sock, user, cols, rows):
    import fcntl
    import pty
    import termios
    # work everything out before forking: the child only makes plain system calls
    switch = os.getuid() == 0 and user != 'root'
    env = user_env(user) if switch else dict(os.environ, TERM='xterm-256color', COLORTERM='truecolor')
    shell = env.get('SHELL') or '/bin/bash'
    if not os.path.exists(shell):
        shell = '/bin/sh'
    ids = None
    if switch:
        import grp
        pw = pwd.getpwnam(user)
        groups = sorted({g.gr_gid for g in grp.getgrall() if user in g.gr_mem} | {pw.pw_gid})
        ids = (pw.pw_uid, pw.pw_gid, groups)
    home = env.get('HOME', '/')
    pid, fd = pty.fork()
    if pid == 0:  # the shell
        try:
            if ids:
                os.setgroups(ids[2])
                os.setgid(ids[1])
                os.setuid(ids[0])
            os.chdir(home if os.path.isdir(home) else '/')
            os.execve(shell, [shell, '-l'], env)
        finally:
            os._exit(1)

    def size(c, r):
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', r, c, 0, 0))
    size(cols, rows)
    alive = [True]

    def pump():
        while alive[0]:
            try:
                data = os.read(fd, 65536)
            except OSError:
                break
            if not data:
                break
            try:
                sock.sendall(ws_frame(data))
            except OSError:
                break
        alive[0] = False
        try:
            sock.sendall(ws_frame(b'\x03\xe8', 0x8))
        except OSError:
            pass
    t = threading.Thread(target=pump, daemon=True)
    t.start()
    try:
        while alive[0]:
            op, data = ws_read(sock)
            if op is None or op == 0x8:
                break
            if op == 0x9:
                sock.sendall(ws_frame(data, 0xA))
            elif op == 0x1:  # text: a control message, like a new size
                try:
                    msg = json.loads(data.decode())
                    if msg.get('resize'):
                        size(int(msg['resize'][0]), int(msg['resize'][1]))
                except (ValueError, KeyError, TypeError):
                    pass
            elif op == 0x2:  # binary: what you typed
                os.write(fd, data)
    finally:
        alive[0] = False
        try:
            os.kill(pid, signal.SIGHUP)
        except OSError:
            pass
        try:
            os.waitpid(pid, 0)
        except ChildProcessError:
            pass
        os.close(fd)


# ---------------------------------------------------------------------------
# the web server

class Handler(BaseHTTPRequestHandler):
    server_version = 'diced/' + VERSION
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        if self.server.verbose:
            sys.stderr.write('diced: ' + (fmt % args) + '\n')

    # -- answers --
    def send(self, code, body, ctype='application/json', extra=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body)
        if isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def fail(self, code, message):
        self.send(code, {'ok': False, 'error': message})

    # -- who's asking --
    def local_host(self):
        host = (self.headers.get('Host') or '').lower()
        port = self.server.server_address[1]
        return host in ('127.0.0.1:%d' % port, 'localhost:%d' % port)

    def trusted(self, token=None):
        if not self.local_host():
            return False
        origin = self.headers.get('Origin')
        if origin and origin.lower() not in ('http://127.0.0.1:%d' % self.server.server_address[1], 'http://localhost:%d' % self.server.server_address[1]):
            return False
        return secrets.compare_digest(token or self.headers.get('X-Dice') or '', TOKEN)

    def body(self, limit=1024 * 1024):
        n = int(self.headers.get('Content-Length') or 0)
        if n > limit:
            raise ValueError('That\'s too big.')
        return self.rfile.read(n) if n else b''

    def json_body(self):
        try:
            data = json.loads(self.body() or b'{}')
            return data if isinstance(data, dict) else {}
        except ValueError:
            return {}

    # -- requests --
    def do_HEAD(self):
        self.do_GET()

    def do_OPTIONS(self):
        # no cross-site access, ever
        self.send(403, {'ok': False, 'error': 'Not from here.'})

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        path, q = url.path, dict(urllib.parse.parse_qsl(url.query))
        if path == '/healthz':
            return self.send(200, 'ok', 'text/plain')
        if path.startswith('/api/'):
            if path == '/api/term':
                return self.terminal(q)
            if not self.trusted():
                return self.fail(403, 'Not allowed.')
            return self.api_get(path, q)
        if not self.local_host():
            return self.fail(403, 'Not allowed.')
        return self.static(path)

    def do_POST(self):
        url = urllib.parse.urlsplit(self.path)
        path, q = url.path, dict(urllib.parse.parse_qsl(url.query))
        if not path.startswith('/api/') or not self.trusted():
            return self.fail(403, 'Not allowed.')
        try:
            return self.api_post(path, q)
        except (PermissionError, FileExistsError, FileNotFoundError, IsADirectoryError, NotADirectoryError, ValueError) as e:
            return self.fail(400, str(e).split('] ')[-1])

    # -- the desktop's files --
    def static(self, path):
        web = self.server.web
        if path in ('', '/'):
            path = '/index.html'
        real = os.path.realpath(os.path.join(web, path.lstrip('/')))
        if not (real == web or real.startswith(web + os.sep)) or not os.path.isfile(real):
            return self.fail(404, 'Not found.')
        with open(real, 'rb') as f:
            data = f.read()
        ctype = mimetypes.guess_type(real)[0] or 'application/octet-stream'
        if real.endswith('index.html'):
            settings = public_settings(self.server.settings_path)
            tag = '<script>window.DICE_SYS=%s;</script>' % json.dumps({'token': TOKEN, 'version': VERSION, 'settings': settings,
                                                                        'user': desktop_user(), 'host': socket.gethostname()}).replace('</', '<\\/')
            data = data.replace(b'<head>', b'<head>' + tag.encode(), 1)
        if ctype.startswith('text/') or ctype in ('application/javascript', 'application/json'):
            ctype += '; charset=utf-8'
        self.send(200, data, ctype, {'Content-Security-Policy': "frame-ancestors 'none'"})

    def api_get(self, path, q):
        sysm, files = self.server.system, Files(desktop_user())
        if path == '/api/status':
            return self.send(200, sysm.status())
        if path == '/api/wifi':
            return self.send(200, sysm.wifi_list())
        if path == '/api/settings':
            return self.send(200, public_settings(self.server.settings_path))
        if path == '/api/find':
            return self.send(200, {'ok': True, 'items': files.find(q.get('q', '')[:80])})
        if path == '/api/trash':
            return self.send(200, {'ok': True, 'items': files.trash_list()})
        if path == '/api/apps':
            return self.send(200, sysm.apps.status())
        if path == '/api/apps/search':
            if q.get('ids'):  # just these (the Store's picks: the ones Flathub has for this computer)
                want = set(q['ids'].split(',')[:100])
                return self.send(200, {'ok': True, 'items': [a for a in sysm.apps.catalog() if a['id'] in want]})
            return self.send(200, {'ok': True, 'items': sysm.apps.search(q.get('q', '')[:80], q.get('cat', '')[:30], min(200, int(q.get('n', '60') or 60)))})
        if path == '/api/apps/icon':
            p = sysm.apps.icon(q.get('id', ''))
            if not p:
                return self.fail(404, 'No icon.')
            with open(p, 'rb') as f:
                return self.send(200, f.read(), 'image/png', {'Cache-Control': 'max-age=86400'})
        if path == '/api/games':
            return self.send(200, sysm.apps.games(q.get('host', '')))
        if path == '/api/cec/devices':
            return self.send(200, sysm.remote.scan())
        if path == '/api/device':
            return self.send(200, device_info(self.server.settings_path))
        if path == '/api/kvm':  # everything Dice can switch to: the TV's HDMI things, and a PC's screens' inputs
            cec = sysm.remote.scan() if sysm.remote.available else {'ok': False, 'error': sysm.remote.why or 'No HDMI-CEC here.', 'devices': []}
            return self.send(200, {'ok': True, 'cec': cec, 'monitors': sysm.monitors.list(q.get('fresh') == '1')})
        if path == '/api/voice':
            return self.send(200, sysm.voice.status())
        if path == '/api/lookup':
            return self.send(200, lookup(q.get('url', '')))
        if path == '/api/tuner':
            return self.send(200, tuner_lineup(q.get('host', '')))
        if path == '/api/files/tree':
            try:
                return self.send(200, Files(desktop_user()).tree(q.get('path', '~/Dice Cloud')))
            except OSError as e:
                return self.send(200, {'ok': False, 'error': str(e).split('] ')[-1]})
        if path == '/api/files/usage':
            return self.send(200, dict(files.usage(), ok=True))
        if path == '/api/files':
            try:
                return self.send(200, files.list(q.get('path', '~')))
            except (PermissionError, FileNotFoundError, NotADirectoryError) as e:
                return self.fail(400, str(e).split('] ')[-1])
        if path == '/api/file':
            try:
                real = files.resolve(q.get('path', ''))
                with open(real, 'rb') as f:
                    data = f.read(MAX_UPLOAD)
            except (PermissionError, OSError) as e:
                return self.fail(400, str(e).split('] ')[-1])
            ctype = mimetypes.guess_type(real)[0] or 'application/octet-stream'
            return self.send(200, data, ctype, {'Content-Disposition': '%s; filename="%s"' % ('attachment' if q.get('download') else 'inline', urllib.parse.quote(os.path.basename(real)))})
        if path == '/api/update':
            log = '/var/log/dice-update.log' if os.getuid() == 0 else os.path.expanduser('~/.dice-update.log')
            return self.send(200, {'log': read(log)[-4000:]})
        if path == '/api/bluetooth':
            return self.send(200, sysm.bluetooth())
        if path == '/api/remote':
            sysm.remote.start()
            return self.send(200, sysm.remote.state())
        if path == '/api/events':
            sysm.power_keys.start()
            return self.events(sysm.remote)
        return self.fail(404, 'No such thing.')

    def api_post(self, path, q):
        sysm = self.server.system
        if path == '/api/file':  # the body is the file itself
            try:
                mtime = float(q['mtime']) if q.get('mtime') else None
            except ValueError:
                mtime = None
            return self.send(200, Files(desktop_user()).write(q.get('path', ''), self.body(MAX_UPLOAD), mtime, q.get('dirs') == '1'))
        b = self.json_body()
        if path == '/api/wifi':
            if 'on' in b:
                return self.send(200, sysm.wifi_power(bool(b['on'])))
            return self.send(200, sysm.wifi_connect(b.get('ssid'), b.get('password')))
        if path == '/api/volume':
            return self.send(200, sysm.set_volume(b.get('level'), b.get('muted')))
        if path == '/api/brightness':
            return self.send(200, sysm.set_brightness(b.get('level', 1)))
        if path == '/api/power':
            return self.send(200, sysm.power(b.get('action')))
        if path == '/api/open':
            return self.send(200, sysm.open_url(b.get('url'), bool(b.get('app')), str(b.get('name') or '') or None, bool(b.get('full'))))
        if path == '/api/apps':
            act, app_id, apps = b.get('action'), str(b.get('id') or ''), sysm.apps
            if act == 'setup':
                return self.send(200, {'ok': True, 'job': apps.setup()})
            if act == 'install':
                return self.send(200, {'ok': True, 'job': apps.install(app_id)})
            if act == 'remove':
                return self.send(200, {'ok': True, 'job': apps.remove(app_id)})
            if act == 'update':
                return self.send(200, {'ok': True, 'job': apps.update_all()})
            if act == 'open':
                return self.send(200, apps.open(app_id))
            if act == 'close':
                return self.send(200, {'ok': True, 'closed': apps.close_front()})
            return self.fail(400, 'Unknown action.')
        if path == '/api/cec':
            act, rm = b.get('action'), sysm.remote
            if act == 'switch':
                return self.send(200, rm.switch(str(b.get('pa') or '')))
            if act == 'back':
                return self.send(200, rm.send('active'))
            if act == 'key':
                return self.send(200, rm.key(int(b.get('la', -1)), str(b.get('key') or '')))
            if act == 'learn':
                sysm.power_keys.learn = time.monotonic() + 12
                return self.send(200, {'ok': True})
            return self.fail(400, 'Unknown action.')
        if path == '/api/device':
            return self.send(200, device_change(self.server.settings_path, b if isinstance(b, dict) else {}))
        if path == '/api/kvm':
            act = b.get('action')
            if act == 'monitor':
                try:
                    n, code = int(b.get('n')), int(b.get('code'))
                except (TypeError, ValueError):
                    return self.fail(400, 'Which screen, and which input?')
                return self.send(200, sysm.monitors.switch(n, code))
            if act == 'back':
                r = sysm.monitors.back() if sysm.monitors.home else {'ok': True}
                if sysm.remote.available:
                    sysm.remote.send('active')
                return self.send(200, r)
            return self.fail(400, 'Unknown action.')
        if path == '/api/tuner':
            return self.send(200, sysm.apps.watch(str(b.get('url') or ''), str(b.get('name') or '')[:60]))
        if path == '/api/voice':
            act = b.get('action')
            if act == 'setup':
                return self.send(200, {'ok': True, 'job': sysm.voice.setup()})
            if act == 'start':
                return self.send(200, sysm.voice.start())
            if act == 'stop':
                return self.send(200, sysm.voice.stop())
            if act == 'say':
                return self.send(200, sysm.voice.say(b.get('text')))
            return self.fail(400, 'Unknown action.')
        if path == '/api/games':
            act, host, apps = b.get('action'), str(b.get('host') or ''), sysm.apps
            if act == 'pair':
                return self.send(200, {'ok': True, 'job': apps.pair(host, str(b.get('pin') or ''))})
            if act == 'play':
                return self.send(200, apps.play(host, str(b.get('game') or ''), str(b.get('quality') or '1080p'), int(b.get('fps') or 60)))
            if act == 'quit':
                return self.send(200, apps.quit_game(host))
            return self.fail(400, 'Unknown action.')
        if path == '/api/bluetooth':
            return self.send(200, sysm.bluetooth_do(b.get('action'), b.get('mac')))
        if path == '/api/screenshot':
            return self.send(200, sysm.screenshot())
        if path == '/api/remote':
            return self.send(200, sysm.remote.send(str(b.get('cmd') or '')))
        if path == '/api/update':
            return self.send(200, sysm.update())
        if path == '/api/password':
            pw = str(b.get('password') or '')
            if len(pw) < 4 or '\n' in pw:
                return self.fail(400, 'Use at least 4 characters.')
            code, out = run(['chpasswd'], input_text='%s:%s\n' % (desktop_user(), pw))
            if code == 0:  # (so SSH may be turned on: it isn't the starting password any more)
                cur = load_settings(self.server.settings_path)
                cur['password_set'] = True
                save_settings(self.server.settings_path, cur)
            return self.send(200, {'ok': code == 0, 'error': None if code == 0 else out})
        if path == '/api/settings':
            cur = load_settings(self.server.settings_path)
            if isinstance(b.get('ha_token'), str) and b['ha_token'].strip():
                save_ha_token(self.server.settings_path, b['ha_token'])
            for k, v in b.items():
                if k not in ('password', 'wifi', 'ha_token', 'ha_token_set'):  # secrets never go in here
                    cur[k] = v
            save_settings(self.server.settings_path, cur)
            return self.send(200, {'ok': True, 'settings': public_settings(self.server.settings_path)})
        if path == '/api/ha':
            return self.send(200, ha_call(self.server.settings_path, b))
        if path == '/api/files':
            files, op, out = Files(desktop_user()), b.get('op'), None
            if op == 'mkdir':
                files.mkdir(b.get('path'))
            elif op == 'rename':
                files.rename(b.get('path'), b.get('to', ''))
            elif op == 'trash':
                out = files.trash(b.get('path'))
            elif op == 'copy':
                out = files.copy(b.get('path'), b.get('to'))
            elif op == 'move':
                out = files.move(b.get('path'), b.get('to'))
            elif op == 'restore':
                out = files.restore(b.get('name'))
            elif op == 'forget':
                out = files.forget(b.get('name') or None)
            elif op == 'text':
                files.write(b.get('path'), str(b.get('text', '')).encode())
            else:
                return self.fail(400, 'Unknown action.')
            return self.send(200, {'ok': True, 'path': out} if isinstance(out, str) else {'ok': True, 'count': out} if isinstance(out, int) else {'ok': True})
        return self.fail(404, 'No such thing.')

    def events(self, remote):
        """The TV remote's presses as they happen (server-sent events), for as long as the desktop listens."""
        remote.start()
        q = queue.Queue(maxsize=100)
        with remote.lock:
            remote.subs.add(q)
        try:
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Connection', 'close')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(('data: ' + json.dumps({'cec': remote.state()}) + '\n\n').encode())
            self.wfile.flush()
            while True:
                try:
                    chunk = 'data: ' + json.dumps(q.get(timeout=15)) + '\n\n'
                except queue.Empty:
                    chunk = ': still here\n\n'
                self.wfile.write(chunk.encode())
                self.wfile.flush()
        except OSError:
            pass
        finally:
            with remote.lock:
                remote.subs.discard(q)
            self.close_connection = True

    def terminal(self, q):
        if self.headers.get('Upgrade', '').lower() != 'websocket' or not self.trusted(q.get('token')):
            return self.fail(403, 'Not allowed.')
        key = self.headers.get('Sec-WebSocket-Key', '')
        self.send_response(101)
        self.send_header('Upgrade', 'websocket')
        self.send_header('Connection', 'Upgrade')
        self.send_header('Sec-WebSocket-Accept', ws_accept(key))
        self.end_headers()
        self.wfile.flush()
        self.close_connection = True
        try:
            pty_session(self.connection, desktop_user(), int(q.get('cols', 80)), int(q.get('rows', 24)))
        except Exception as e:  # noqa: BLE001 - tell the Terminal what went wrong
            try:
                self.connection.sendall(ws_frame(('\r\nThe Terminal couldn\'t start: %s\r\n' % e).encode()))
            except OSError:
                pass


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def make_server(port, web, settings_path, verbose=False, host='127.0.0.1'):
    srv = Server((host, port), Handler)
    srv.web = os.path.realpath(web)
    srv.settings_path = settings_path
    srv.system = System(settings_path)
    srv.verbose = verbose
    return srv


def ensure_system_files(root=ROOT, etc='/etc'):
    """Things outside /opt/dice that this version needs, for computers that got it as an
    update (which only swaps /opt/dice): the rule that makes a remote's power button
    sleep DiceOS instead of switching everything off. Says whether anything changed."""
    src = os.path.join(root, 'system', 'logind-dice.conf')
    dst = os.path.join(etc, 'systemd', 'logind.conf.d', 'dice.conf')
    try:
        with open(src, 'rb') as f:
            want = f.read()
        try:
            with open(dst, 'rb') as f:
                if f.read() == want:
                    return False
        except OSError:
            pass
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(dst, 'wb') as f:
            f.write(want)
        os.chmod(dst, 0o644)
        if etc == '/etc':
            run(['systemctl', 'kill', '-s', 'HUP', 'systemd-logind'], timeout=10)
        return True
    except OSError:
        return False


def main(argv=None):
    ap = argparse.ArgumentParser(description='DiceOS\'s system helper: serves the DiceOS desktop and does the real things for it.')
    ap.add_argument('--port', type=int, default=int(os.environ.get('DICE_PORT', DEFAULTS['port'])))
    ap.add_argument('--web', default=os.environ.get('DICE_WEB', DEFAULTS['web']), help='the DiceWeb folder to serve')
    ap.add_argument('--settings', default=os.environ.get('DICE_SETTINGS', DEFAULTS['settings']))
    ap.add_argument('--verbose', action='store_true')
    a = ap.parse_args(argv)
    if hasattr(os, 'geteuid') and os.geteuid() == 0 and os.path.isdir('/etc/systemd'):
        ensure_system_files()
    srv = make_server(a.port, a.web, a.settings, a.verbose)
    print('diced %s: the DiceOS desktop is at http://127.0.0.1:%d/' % (VERSION, a.port), flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
