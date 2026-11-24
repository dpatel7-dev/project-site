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

class System:
    def __init__(self, settings_path):
        self.settings_path = settings_path
        self.remote = Remote(settings_path)
        self.power_keys = PowerKeys(self.remote.push)

    # -- status --
    def status(self):
        user = desktop_user()
        out = {'version': VERSION, 'host': socket.gethostname(), 'user': user, 'model': model(),
               'uptime': self.uptime(), 'ip': self.ip(), 'temp': self.temp(), 'mem': self.mem(), 'disk': self.disk(user), 'load': self.load(),
               'wifi': self.wifi_now(), 'volume': self.volume(), 'brightness': self.brightness(), 'battery': self.battery()}
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
    def power(self, action):
        cmds = {'shutdown': ['systemctl', 'poweroff'], 'reboot': ['systemctl', 'reboot'], 'restart-desktop': ['systemctl', 'restart', 'dice-session@%s.service' % desktop_user()]}
        if action not in cmds:
            return {'ok': False, 'error': 'Unknown action'}
        threading.Timer(0.6, lambda: run(cmds[action])).start()
        return {'ok': True}

    # -- opening the real web browser over the desktop --
    def open_url(self, url):
        if not re.match(r'^https?://', url or ''):
            return {'ok': False, 'error': 'Only web addresses (http or https) can be opened.'}
        user = desktop_user()
        browser = shutil.which('chromium') or shutil.which('chromium-browser')
        if not browser:
            return {'ok': False, 'error': 'No web browser is installed.'}
        env = user_env(user) if user != 'root' else dict(os.environ)
        home = env.get('HOME', '/tmp')
        args = [browser, '--ozone-platform=wayland', '--user-data-dir=%s/.config/dice/browser' % home, '--no-first-run', '--password-store=basic', '--new-window', url]
        try:
            subprocess.Popen(args, env=env, preexec_fn=demote(user) if user != 'root' else None, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
            return {'ok': True}
        except OSError as e:
            return {'ok': False, 'error': str(e)}

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


class Remote:
    """Keeps cec-client running while there's an HDMI-CEC port, and passes the presses on."""
    def __init__(self, settings_path):
        self.settings_path = settings_path
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
    def __init__(self, push, root='/dev/input'):
        self.push = push
        self.root = root
        self.fds = {}
        self.started = False
        self.last = 0.0

    def devices(self):
        out = []
        for path in sorted(glob.glob(os.path.join(self.root, 'event*'))):
            cap = '/sys/class/input/%s/device/capabilities/key' % os.path.basename(path)
            try:
                with open(cap) as f:
                    if key_bits(f.read()) & set(POWER_KEYS):
                        out.append(path)
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

    def trash(self, path):
        src = self.resolve(path)
        if src == self.home:
            raise PermissionError('DiceOS won\'t put your whole home folder in the Trash.')
        bin_ = os.path.join(self.home, '.local', 'share', 'Trash', 'files')
        os.makedirs(bin_, exist_ok=True)
        name, n = os.path.basename(src), 1
        dst = os.path.join(bin_, name)
        while os.path.exists(dst):
            n += 1
            dst = os.path.join(bin_, '%s (%d)' % (name, n))
        shutil.move(src, dst)

    def copy(self, path, to_dir):
        src, dst_dir = self.resolve(path), self.resolve(to_dir)
        dst = os.path.join(dst_dir, os.path.basename(src))
        if os.path.exists(dst):
            raise FileExistsError('Something with that name is already there.')
        (shutil.copytree if os.path.isdir(src) else shutil.copy2)(src, dst)
        self.chown(dst)

    def write(self, path, data):
        real = self.resolve(path)
        if os.path.isdir(real):
            raise IsADirectoryError('That\'s a folder.')
        tmp = real + '.dice-part'
        with open(tmp, 'wb') as f:
            f.write(data)
        os.replace(tmp, real)
        self.chown(real)


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
            Files(desktop_user()).write(q.get('path', ''), self.body(MAX_UPLOAD))
            return self.send(200, {'ok': True})
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
            return self.send(200, sysm.open_url(b.get('url')))
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
            files, op = Files(desktop_user()), b.get('op')
            if op == 'mkdir':
                files.mkdir(b.get('path'))
            elif op == 'rename':
                files.rename(b.get('path'), b.get('to', ''))
            elif op == 'trash':
                files.trash(b.get('path'))
            elif op == 'copy':
                files.copy(b.get('path'), b.get('to'))
            elif op == 'text':
                files.write(b.get('path'), str(b.get('text', '')).encode())
            else:
                return self.fail(400, 'Unknown action.')
            return self.send(200, {'ok': True})
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
