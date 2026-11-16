# Copy everything in this file into PythonAnywhere's WSGI configuration file
# (Web tab -> "WSGI configuration file" link), replacing what's there.
# Change "djp7" if your PythonAnywhere username is different.

import sys

path = '/home/djp7/project-site'
if path not in sys.path:
    sys.path.insert(0, path)

from site_app import application  # noqa: E402,F401
