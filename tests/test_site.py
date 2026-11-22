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
        home = self.page('/', None)
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
        home = self.page('/', None)
        self.assertIn('href="/start"', home)
        self.assertIn('class="news"', home)
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
        self.assertEqual(set(v), {'gossip', 'tot', 'pigeon', 'pca', 'tidy', 'den', 'scout', 'roomy', 'hey', 'morph', 'shoo', 'magpie', 'medic', 'flash', 'hum', 'usual', 'locket'})
        self.assertTrue(all(isinstance(x, str) and x.count('.') == 2 for x in v.values()))

    def test_the_dock(self):
        import base64
        import site_shell
        home = self.page('/', None)
        self.assertRegex(home, r'href="/"[^>]*aria-current="page"')
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
        self.assertNotIn('console', call('/robots.txt')[2].decode())

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
