"""Checks every address on the site answers the way the projects expect.

    python3 -m unittest discover tests
"""
import io
import json
import re
import os
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = tempfile.mkdtemp(prefix='site-test-')
os.environ['GOSSIP_DATA'] = os.path.join(DATA, 'gossip-data')
os.environ['PIGEON_DATA'] = os.path.join(DATA, 'pigeon-data')
os.environ['SITE_DATA'] = os.path.join(DATA, 'site-data')
sys.path.insert(0, HERE)
import site_app  # noqa: E402


def call(path, method='GET', body=b'', host='djp7.pythonanywhere.com', headers=None):
    path, _, query = path.partition('?')
    environ = {
        'REQUEST_METHOD': method, 'PATH_INFO': path, 'QUERY_STRING': query, 'SCRIPT_NAME': '',
        'HTTP_HOST': host, 'wsgi.url_scheme': 'http', 'wsgi.input': io.BytesIO(body),
        'CONTENT_LENGTH': str(len(body)), 'REMOTE_ADDR': '127.0.0.1',
    }
    environ.update(headers or {})
    got = {}

    def start_response(status, hdrs, exc_info=None):
        got['status'], got['headers'] = status, dict(hdrs)

    data = b''.join(site_app.application(environ, start_response))
    assert int(got['headers']['Content-Length']) == len(data), path
    return int(got['status'][:3]), got['headers'], data


class Site(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(DATA, ignore_errors=True)

    def page(self, path, here):
        code, h, body = call(path)
        self.assertEqual(code, 200, path)
        self.assertTrue(h['Content-Type'].startswith('text/html'), path)
        text = body.decode()
        self.assertEqual(len(re.findall(r'<nav class="dk[" ]', text)), 1, path)  # the dock along the bottom
        self.assertNotIn('psnav', text, path)  # the old bar across the top is gone
        self.assertIn("localStorage.getItem('djp7-look')", text, path)  # day or night, before anything is drawn
        for link in ('href="/gossip"', 'href="/tot"', 'href="/pigeon"', 'href="/tidy"', 'href="/den"', 'href="/pca"'):
            self.assertIn(link, text, path)
        if here:
            self.assertRegex(text, r'href="/%s"[^>]*aria-current="page"' % here)
        self.assertNotRegex(text, r'\{\{\w+\}\}', path)
        return text

    def test_pages(self):
        home = self.page('/apps', None)
        self.assertIn('https://djp7.pythonanywhere.com/pca/install.sh', home)
        self.assertIn('const ART = {"mascots"', home)
        self.assertIn('https://djp7.pythonanywhere.com/tot/install.sh', self.page('/tot', 'tot'))
        self.page('/tot/', 'tot')
        self.page('/pca', 'pca')
        tidy = self.page('/tidy', 'tidy')
        self.assertIn('https://djp7.pythonanywhere.com/tidy/install.sh', tidy)
        self.assertIn('Carefully', tidy)
        den = self.page('/den', 'den')
        self.assertIn('https://djp7.pythonanywhere.com/den/install.sh', den)
        self.assertIn('learn to code', den)
        self.assertIn('"den":{"name":"Ember"', den)
        self.page('/den/', 'den')
        gossip = self.page('/gossip', 'gossip')
        self.assertIn('"hub": "https://djp7.pythonanywhere.com"', gossip)
        pigeon = self.page('/pigeon', 'pigeon')
        self.assertIn('"base": "/pigeon"', pigeon)
        self.assertIn('Content-Security-Policy', call('/pigeon/')[1])
        code, _, body = call('/no/such/page')
        self.assertEqual(code, 404)
        self.assertIn(b'<nav class="dk"', body)

    def test_new_apps_and_guides(self):
        for app, mascot in (('scout', 'Pip'), ('roomy', 'Shelly'), ('hey', 'Biscuit'), ('morph', 'Luma'), ('shoo', 'Bramble'), ('magpie', 'Pica'), ('medic', 'Lotl'), ('flash', 'Blink'), ('hum', 'Bumble'), ('usual', 'Rocco'), ('locket', 'Bastion')):
            text = self.page('/' + app, app)
            self.assertIn('https://djp7.pythonanywhere.com/%s/install.sh' % app, text)
            self.assertIn('"%s":{"name":"%s"' % (app, mascot), text)
            self.page('/%s/' % app, app)
            self.assertIn('class="getbox"', text, app)
            self.assertIn('<nav class="wrap pn"', text, app)  # the apps before and after this one
            self.assertNotIn('Dilly', text)
            code, _, body = call('/%s/install.sh' % app)
            self.assertEqual(code, 200)
            self.assertIn(('%s_HUB="${%s_HUB:-https://djp7.pythonanywhere.com}"' % (app.upper(), app.upper())).encode(), body)
            self.assertIn(('dpatel7-dev/%s' % app).encode(), body)
        start = self.page('/start', 'start')
        self.assertIn('Your first time in Terminal', start)
        self.assertIn('pigeon home', start)
        new = self.page('/new', 'new')
        self.assertRegex(new, r'<article class="news" data-app="scout">')
        self.assertIn('<b>', new, 'changelog bold becomes HTML')
        self.assertNotIn('**', new)
        home = self.page('/apps', None)
        self.assertIn('href="/start"', home)
        self.assertIn('href="/new"', home)  # what's new is one click away, in the dock
        self.assertIn('rel="icon"', home)  # every page has its own picture in the tab
        v = json.loads(call('/versions.json')[2])
        for app in ('scout', 'roomy', 'hey', 'morph', 'shoo', 'magpie', 'medic', 'flash', 'hum', 'usual', 'locket', 'tidy', 'pigeon'):
            self.assertIn(app, v)

    def test_installers_remember_this_site(self):
        for path, line in [
            ('/install.sh', 'GOSSIP_HUB="${GOSSIP_HUB:-https://djp7.pythonanywhere.com}"'),
            ('/tot/install.sh', 'TOT_HUB="${TOT_HUB:-https://djp7.pythonanywhere.com}"'),
            ('/pca/install.sh', 'PCA_HUB="${PCA_HUB:-https://djp7.pythonanywhere.com}"'),
            ('/tidy/install.sh', 'TIDY_HUB="${TIDY_HUB:-https://djp7.pythonanywhere.com}"'),
            ('/den/install.sh', 'DEN_HUB="${DEN_HUB:-https://djp7.pythonanywhere.com}"'),
            ('/den/install.ps1', "$env:DEN_HUB = 'https://djp7.pythonanywhere.com'"),
            ('/pigeon/install.sh', 'PIGEON_HUB="${PIGEON_HUB:-https://djp7.pythonanywhere.com/pigeon}"'),
            ('/install.ps1', "$env:GOSSIP_HUB = 'https://djp7.pythonanywhere.com'"),
            ('/tot/install.ps1', "$env:TOT_HUB = 'https://djp7.pythonanywhere.com'"),
            ('/pca/install.ps1', "$env:PCA_HUB = 'https://djp7.pythonanywhere.com'"),
            ('/pigeon/install.ps1', "$env:PIGEON_HUB = 'https://djp7.pythonanywhere.com/pigeon'"),
        ]:
            code, h, body = call(path)
            self.assertEqual(code, 200, path)
            self.assertTrue(h['Content-Type'].startswith('text/plain'), path)
            text = body.decode()
            self.assertIn(line, text.split('\n')[1] if path.endswith('.sh') else text.split('\n')[0], path)
            if path.endswith('.sh'):
                self.assertTrue(text.startswith('#!/bin/sh\n'), path)
        # a strange Host header never ends up inside a script
        code, _, body = call('/pca/install.sh', host='evil.com";rm -rf ~;"')
        self.assertNotIn(b'evil', body)

    def test_gossip_hub_still_answers_where_it_always_did(self):
        code, _, body = call('/api')
        self.assertEqual(code, 200)
        self.assertTrue(json.loads(body)['gossip'])
        code, _, body = call('/api', 'POST', json.dumps({'t': 'hello'}).encode(), headers={'CONTENT_TYPE': 'application/json'})
        self.assertEqual(code, 200)
        self.assertIsInstance(json.loads(body), dict)
        self.assertEqual(call('/healthz')[0], 200)

    def test_pigeon_api_lives_under_pigeon(self):
        code, _, body = call('/pigeon/api')
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body)['name'], 'pigeon')
        code, _, body = call('/pigeon/api/list', 'POST', b'{}')
        self.assertEqual(code, 401)
        code, _, _ = call('/pigeon/api/piece?id=x&n=0', 'PUT', b'locked bytes')
        self.assertEqual(code, 401)
        self.assertEqual(call('/pigeon/healthz')[0], 200)
        self.assertEqual(call('/pigeon/s/abcdefgh')[0], 200)  # the share page; the browser asks for the file itself

    def test_versions_for_pca(self):
        code, h, body = call('/versions.json')
        self.assertEqual(code, 200)
        v = json.loads(body)
        # pca only looks at the apps it knows, so Dice and DiceWeb being here too is fine
        self.assertEqual(set(v), {'gossip', 'tot', 'pigeon', 'pca', 'tidy', 'den', 'scout', 'roomy', 'hey', 'morph', 'shoo', 'magpie', 'medic', 'flash', 'hum', 'usual', 'locket', 'dice', 'diceweb'})
        self.assertTrue(all(isinstance(x, str) and x.count('.') == 2 for x in v.values()))

    def test_the_dock(self):
        import base64
        import site_shell
        home = self.page('/apps', None)
        self.assertRegex(home, r'href="/"[^>]*aria-current="page"')
        self.assertIn('href="/dice" data-id="dice"', home)  # Dice has a spot in the dock
        for a in site_shell.APPS:  # every app is in the dock, with its picture
            self.assertRegex(home, r'<a class="dk-i dk-app[^"]*" href="/%s" data-id="%s"' % (a['id'], a['id']))
        # the pictures are real PNG images
        for uri, w, h in site_shell.icons().values():
            data = base64.b64decode(uri.split(',', 1)[1])
            self.assertEqual(data[:8], b'\x89PNG\r\n\x1a\n')
            self.assertGreater(w, 8)
        # pigeon fills the window, so it leaves room for the dock itself; the dock never loads anything from elsewhere
        pigeon = self.page('/pigeon/', 'pigeon')
        self.assertIn('<nav class="dk dk-onapp"', pigeon)
        dock = pigeon[pigeon.index('<nav class="dk dk-onapp"'):]
        self.assertNotRegex(dock, r'src="(https?:)?//')
        # the shared styles come before a page's own, so the page can change them
        hum = self.page('/hum', 'hum')
        self.assertLess(hum.index('--dk-glass'), hum.index('.page { --c:'))
        # pages with a look all their own still get the dock, and day and night
        for path in ('/tot', '/tidy', '/den', '/pca'):
            text = self.page(path, path[1:])
            self.assertIn('data-look=light', text.replace('"', ''), path)
        self.assertIn('Bastion the armadillo', home + self.page('/locket', 'locket'))
        # day or night by the time of day, unless Day or Night was picked
        self.assertIn('window.djp7ClockNight=', home)
        with open(os.path.join(site_app.HERE, 'pages', 'check.html'), encoding='utf-8') as f:
            self.assertIn('window.djp7ClockNight=', f.read())  # the "are you a person?" check too
        self.assertNotIn('console', call('/robots.txt')[2].decode())

    def test_two_doors(self):
        code, h, body = call('/')
        door = body.decode()
        self.assertEqual(code, 200)
        self.assertNotIn('<nav class="dk', door)  # just the two doors, no dock
        for bit in ('href="/dice"', 'href="/apps"', 'href="/diceweb/"', 'rel="icon"', "localStorage.getItem('djp7-look')", '/diceweb/js/gfx.js'):
            self.assertIn(bit, door)
        code, h, body = call('/dice')
        dice = body.decode()
        self.assertEqual(code, 200)
        self.assertNotIn('<nav class="dk', dice)
        self.assertIn('releases/latest/download/dice-arm64.img.xz', dice)
        self.assertIn('https://djp7.pythonanywhere.com/dice/install.sh', dice)
        self.assertNotRegex(dice, r'\{\{\w+\}\}')
        # Dice is for PCs too, and every page that draws the die loads it first
        self.assertIn('releases/latest/download/dice-amd64.iso', dice)
        self.assertIn('data-dev="pc"', dice)
        self.assertIn('>Big screen<', dice)
        self.assertNotIn('Gaming Mode', dice)
        for page in (door, dice):
            self.assertLess(page.index('/diceweb/js/die3d.js'), page.index('/diceweb/js/gfx.js'))

    def test_personal_page(self):
        code, h, body = call('/')
        self.assertIn('<a class="me" href="/me">Made by Dhruv</a>', body.decode())
        code, h, body = call('/me')
        me = body.decode()
        self.assertEqual(code, 200)
        self.assertNotIn('<nav class="dk', me)
        for bit in ('<h1>Dhruv</h1>', 'https://github.com/dpatel7-dev', 'href="/dice"', 'href="/apps"', '/diceweb/js/die3d.js'):
            self.assertIn(bit, me)
        # nothing private: no email address, no home town
        self.assertNotRegex(me, r'[\w.+-]+@[\w-]+\.[\w.]+')
        self.assertNotIn('New Jersey', me)
        self.assertNotRegex(me, r'\{\{\w+\}\}')
        self.assertEqual(call('/me/')[0], 200)

    def test_diceweb_is_served(self):
        code, h, _ = call('/diceweb')
        self.assertEqual((code, h.get('Location')), (301, '/diceweb/'))
        code, h, body = call('/diceweb/')
        self.assertEqual(code, 200)
        self.assertIn(b'<title>DiceWeb</title>', body)
        self.assertNotIn(b'<nav class="dk', body)  # it's a whole console: no dock
        code, h, body = call('/diceweb/js/gfx.js')
        self.assertEqual((code, h['Content-Type']), (200, 'text/javascript; charset=utf-8'))
        for bad in ('/diceweb/../site_app.py', '/diceweb/js/../../../site_app.py', '/diceweb/nope.js', '/diceweb/package.json/x'):
            self.assertEqual(call(bad)[0], 404, bad)

    def test_dice_install_and_download(self):
        import io
        import tarfile
        code, h, body = call('/dice/install.sh')
        self.assertEqual(code, 200)
        self.assertIn(b'/dice/dice.tar.gz', body)
        code, h, body = call('/dice/dice.tar.gz')
        self.assertEqual((code, h['Content-Type']), (200, 'application/gzip'))
        with tarfile.open(fileobj=io.BytesIO(body)) as tar:
            names = {m.name: m for m in tar.getmembers()}
        for need in ('dice/daemon/diced.py', 'dice/bin/dice-boot', 'dice/bin/dice-session', 'dice/system/dice.service', 'dice/plymouth/dice/die6.png', 'dice/diceweb/index.html', 'dice/diceweb/js/sys.js', 'dice/VERSION'):
            self.assertIn(need, names)
        self.assertTrue(names['dice/bin/dice-boot'].mode & 0o111)
        self.assertFalse(any('test' in n for n in names))
        self.assertTrue(all(n.startswith('dice/') and '..' not in n for n in names))

    def test_dice_setup_codes_keep_no_secrets(self):
        settings = {'dice': 1, 'name': 'Dhruv', 'password': 'hunter2', 'wifi': {'ssid': 'Home', 'password': 'wifi-secret', 'country': 'US'},
                    'suite': ['scout', 'rm -rf'], 'screen': {'rotate': 45}, 'evil': '<script>'}
        code, h, body = call('/dice/setup', method='POST', body=json.dumps(settings).encode(), headers={'CONTENT_TYPE': 'application/json'})
        self.assertEqual(code, 200)
        c = json.loads(body)['code']
        self.assertRegex(c, r'^[A-Z2-9]{6}$')
        code, h, body = call('/dice/setup/%s.json' % c)
        got = json.loads(body)
        self.assertEqual(got['name'], 'Dhruv')
        self.assertEqual(got['wifi'], {'ssid': 'Home', 'country': 'US'})
        self.assertEqual(got['suite'], ['scout'])
        self.assertEqual(got['screen'], {})
        for gone in (b'hunter2', b'wifi-secret', b'evil'):
            self.assertNotIn(gone, body)
        self.assertEqual(call('/dice/setup/%s.json' % c.lower())[0], 200)  # codes aren't fussy about capitals
        self.assertEqual(call('/dice/setup/NOPE99.json')[0], 404)
        self.assertEqual(call('/dice/setup')[0], 405)
        self.assertEqual(call('/dice/setup', method='POST', body=b'x' * 9000, headers={'CONTENT_TYPE': 'application/json'})[0], 400)
        self.assertEqual(call('/dice/setup', method='POST', body=b'[1, 2]', headers={'CONTENT_TYPE': 'application/json'})[0], 400)

    def test_reloads_itself_after_a_git_pull(self):
        # pretend PythonAnywhere's WSGI file lives here, and the code on disk just changed
        wsgi = os.path.join(DATA, 'djp7_pythonanywhere_com_wsgi.py')
        with open(wsgi, 'w') as f:
            f.write("path = '%s'\n" % site_app.HERE)
        other = os.path.join(DATA, 'someone_else_wsgi.py')
        with open(other, 'w') as f:
            f.write("path = '/home/someone/else'\n")
        os.utime(wsgi, (1, 1))
        os.utime(other, (1, 1))
        old = (site_app.WSGI_FILES, dict(site_app._loaded), dict(site_app._reload))
        try:
            site_app.WSGI_FILES = os.path.join(DATA, '*_wsgi.py')
            self.assertNotIn('just updated', call('/hum')[2].decode())
            site_app._loaded[site_app.CODE[0]] = 1.0  # as if site_app.py changed after it started
            page = call('/hum')[2].decode()
            self.assertIn('This website was just updated and is restarting', page)
            self.assertGreater(os.path.getmtime(wsgi), 1, 'asked PythonAnywhere to reload')
            self.assertEqual(os.path.getmtime(other), 1, "someone else's site is left alone")
            self.assertIn('just updated', call('/pigeon/')[2].decode())
            self.assertNotIn(b'just updated', call('/versions.json')[2])
        finally:
            site_app.WSGI_FILES, site_app._loaded, site_app._reload = old[0], old[1], old[2]

    def test_only_get_for_our_pages(self):
        self.assertEqual(call('/tot', 'POST', b'x')[0], 405)




class BotCheck(unittest.TestCase):
    BROWSER = {'HTTP_ACCEPT': 'text/html,application/xhtml+xml,*/*;q=0.8'}

    def solve(self, c, bits):
        import hashlib
        n = 0
        while True:
            d = hashlib.sha256(('%s:%d' % (c, n)).encode()).digest()
            if int.from_bytes(d[:4], 'big') >> (32 - bits) == 0:
                return str(n)
            n += 1

    def test_browsers_get_the_check_first_and_then_the_page(self):
        import re
        code, h, body = call('/tot', headers=self.BROWSER)
        page = body.decode()
        self.assertEqual(code, 200)
        self.assertIn("checking you're a person", page)
        self.assertIn('Tree of Thought', page, 'the real description is on the check page too')
        self.assertIn("var who = 'tot'", page.replace("'{{mascot}}'", ''), 'Rowan for the Tree of Thought page')
        c = re.search(r"c: '([^']+)'", page).group(1)
        s = re.search(r"s: '([^']+)'", page).group(1)
        bits = int(re.search(r'bits: (\d+)', page).group(1))
        # a wrong answer, a forged puzzle and an automated browser are turned away
        bad = json.dumps({'c': c, 's': s, 'n': 'nope'}).encode()
        self.assertEqual(call('/__check', 'POST', bad)[0], 403)
        forged = json.dumps({'c': c + '1', 's': s, 'n': '0'}).encode()
        self.assertEqual(call('/__check', 'POST', forged)[0], 403)
        n = self.solve(c, bits)
        robot = json.dumps({'c': c, 's': s, 'n': n, 'w': True}).encode()
        self.assertEqual(call('/__check', 'POST', robot)[0], 403)
        code, h, body = call('/__check', 'POST', json.dumps({'c': c, 's': s, 'n': n, 'w': False}).encode())
        self.assertEqual(code, 200, body)
        cookie = h['Set-Cookie'].split(';')[0]
        self.assertIn('HttpOnly', h['Set-Cookie'])
        code, h, body = call('/tot', headers=dict(self.BROWSER, HTTP_COOKIE=cookie))
        self.assertNotIn("checking you're a person", body.decode())
        # a tampered cookie doesn't count
        code, h, body = call('/tot', headers=dict(self.BROWSER, HTTP_COOKIE=cookie[:-2] + 'xx'))
        self.assertIn("checking you're a person", body.decode())

    def test_tools_and_apis_never_see_the_check(self):
        for path in ('/tidy/install.sh', '/install.sh', '/pca/install.ps1', '/versions.json', '/robots.txt'):
            code, h, body = call(path, headers=self.BROWSER)
            self.assertNotIn(b"checking you're a person", body, path)
        code, h, body = call('/tot', headers={'HTTP_ACCEPT': '*/*'})  # curl
        self.assertNotIn(b"checking you're a person", body)
        code, h, body = call('/tot', headers=dict(self.BROWSER, HTTP_UPGRADE='websocket'))
        self.assertNotIn(b"checking you're a person", body)


if __name__ == '__main__':
    unittest.main()
