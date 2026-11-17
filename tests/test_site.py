"""Checks every address on the site answers the way the projects expect.

    python3 -m unittest discover tests
"""
import io
import json
import os
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = tempfile.mkdtemp(prefix='site-test-')
os.environ['GOSSIP_DATA'] = os.path.join(DATA, 'gossip-data')
os.environ['PIGEON_DATA'] = os.path.join(DATA, 'pigeon-data')
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
        self.assertEqual(text.count('class="psnav"'), 1, path)
        for link in ('href="/gossip"', 'href="/tot"', 'href="/pigeon"', 'href="/tidy"', 'href="/pca"'):
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
        gossip = self.page('/gossip', 'gossip')
        self.assertIn('"hub": "https://djp7.pythonanywhere.com"', gossip)
        pigeon = self.page('/pigeon', 'pigeon')
        self.assertIn('"base": "/pigeon"', pigeon)
        self.assertIn('Content-Security-Policy', call('/pigeon/')[1])
        code, _, body = call('/no/such/page')
        self.assertEqual(code, 404)
        self.assertIn(b'psnav', body)

    def test_installers_remember_this_site(self):
        for path, line in [
            ('/install.sh', 'GOSSIP_HUB="${GOSSIP_HUB:-https://djp7.pythonanywhere.com}"'),
            ('/tot/install.sh', 'TOT_HUB="${TOT_HUB:-https://djp7.pythonanywhere.com}"'),
            ('/pca/install.sh', 'PCA_HUB="${PCA_HUB:-https://djp7.pythonanywhere.com}"'),
            ('/tidy/install.sh', 'TIDY_HUB="${TIDY_HUB:-https://djp7.pythonanywhere.com}"'),
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
        self.assertEqual(set(v), {'gossip', 'tot', 'pigeon', 'pca', 'tidy'})
        self.assertTrue(all(isinstance(x, str) and x.count('.') == 2 for x in v.values()))

    def test_only_get_for_our_pages(self):
        self.assertEqual(call('/tot', 'POST', b'x')[0], 405)


if __name__ == '__main__':
    unittest.main()
