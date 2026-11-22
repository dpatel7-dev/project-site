#!/usr/bin/env python3
"""
Refresh the copies in apps/ (and the pixel art in pages/art.js) from the
projects' own repositories, cloned next to this one:

    parent/
      project-site/            <- this repo
      gossip/
      pigeon/
      Tree-Of-Thought/          (or tree-of-thought)
      Project-CLI-Access/       (or project-cli-access)
      tidy/
      den/                      (or Den)

    python3 tools/sync.py            # copy what changed
    python3 tools/sync.py --check    # just say whether anything is out of date

You only need this when one of the projects changes. The website itself never
runs it.
"""

import filecmp
import json
import os
import shutil
import subprocess
import sys

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARENT = os.path.dirname(SITE)

COPIES = {
    'gossip': (['gossip'], ['hub/gossip_hub.py', 'site/index.html', 'install.sh', 'install.ps1', 'package.json', 'CHANGELOG.md']),
    'pigeon': (['pigeon'], ['server/pigeon_server.py', 'web/index.html', 'web/console.html', 'src/qr.js', 'src/wire.js', 'src/diff.js', 'install.sh', 'install.ps1', 'package.json', 'CHANGELOG.md']),
    'tot': (['Tree-Of-Thought', 'tree-of-thought'], ['install.sh', 'install.ps1', 'package.json', 'CHANGELOG.md']),
    'pca': (['Project-CLI-Access', 'project-cli-access'], ['install.sh', 'install.ps1', 'package.json', 'CHANGELOG.md']),
    'tidy': (['tidy', 'Tidy'], ['install.sh', 'install.ps1', 'package.json', 'CHANGELOG.md']),
    'den': (['den', 'Den'], ['install.sh', 'install.ps1', 'package.json', 'CHANGELOG.md']),
    'scout': (['scout'], ['install.sh', 'install.ps1', 'package.json', 'CHANGELOG.md']),
    'roomy': (['roomy'], ['install.sh', 'install.ps1', 'package.json', 'CHANGELOG.md']),
    'hey': (['hey'], ['install.sh', 'install.ps1', 'package.json', 'CHANGELOG.md']),
    'morph': (['morph'], ['install.sh', 'install.ps1', 'package.json', 'CHANGELOG.md']),
    'shoo': (['shoo'], ['install.sh', 'install.ps1', 'package.json', 'CHANGELOG.md']),
    'magpie': (['magpie'], ['install.sh', 'install.ps1', 'package.json', 'CHANGELOG.md']),
    'medic': (['medic'], ['install.sh', 'install.ps1', 'package.json', 'CHANGELOG.md']),
    'flash': (['flash'], ['install.sh', 'install.ps1', 'package.json', 'CHANGELOG.md']),
    'hum': (['hum'], ['install.sh', 'install.ps1', 'package.json', 'CHANGELOG.md']),
    'usual': (['usual'], ['install.sh', 'install.ps1', 'package.json', 'CHANGELOG.md']),
    'locket': (['locket'], ['install.sh', 'install.ps1', 'package.json', 'CHANGELOG.md']),
}

ART = r"""
const path = require('path');
const [pca, tot] = process.argv.slice(1);
const A = require(path.join(pca, 'src', 'apps.js'));
const P = require(path.join(tot, 'src', 'plants.js'));
const out = { mascots: {}, plants: P.PLANTS };
for (const a of A.APPS) out.mascots[a.id] = { name: a.mascot, color: a.color, grid: a.grid, ink: a.ink };
process.stdout.write(JSON.stringify(out));
"""


def find(names):
    for n in names:
        p = os.path.join(PARENT, n)
        if os.path.isdir(p):
            return p
    return None


def main(argv):
    check = '--check' in argv
    stale = []
    roots = {}
    for app, (names, files) in COPIES.items():
        root = find(names)
        roots[app] = root
        if not root:
            print('  skip %-7s (no %s next to this folder)' % (app, ' or '.join(names)))
            continue
        for rel in files:
            src = os.path.join(root, rel)
            dst = os.path.join(SITE, 'apps', app, rel)
            if not os.path.exists(src):
                print('  missing %s/%s' % (app, rel))
                continue
            if os.path.exists(dst) and filecmp.cmp(src, dst, shallow=False):
                continue
            stale.append('%s/%s' % (app, rel))
            if not check:
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.copyfile(src, dst)
    if roots.get('pca') and roots.get('tot'):
        try:
            data = subprocess.run(['node', '-e', ART, roots['pca'], roots['tot']], check=True, capture_output=True, text=True).stdout
            art_path = os.path.join(SITE, 'pages', 'art.js')
            with open(art_path, encoding='utf-8') as f:
                old = f.read()
            head, sep, tail = old.partition('const ART = ')
            body, sep2, rest = tail.partition(';\n')
            new = head + sep + json.dumps(json.loads(data), separators=(',', ':')) + sep2 + rest
            if new != old:
                stale.append('pages/art.js')
                if not check:
                    with open(art_path, 'w', encoding='utf-8') as f:
                        f.write(new)
        except (OSError, subprocess.CalledProcessError) as e:
            print('  (pixel art not refreshed: %s)' % e)
    for s in stale:
        print(('  out of date  ' if check else '  updated  ') + s)
    if not stale:
        print('  everything is up to date')
    return 1 if (check and stale) else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
