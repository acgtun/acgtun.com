"""
WSGI config for acgtun project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/1.11/howto/deployment/wsgi/
"""

import os
import sys

from django.conf import settings

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "acgtun.settings")

sys.path.append(settings.BASE_DIR)
sys.path.append(os.path.join(settings.BASE_DIR, 'common'))
sys.path.append(os.path.join(settings.BASE_DIR, 'database'))
sys.path.append(os.path.join(settings.BASE_DIR, 'leetcode'))
sys.path.append(os.path.join(settings.BASE_DIR, 'words'))
sys.path.append(os.path.join(settings.BASE_DIR, 'dict'))
os.environ.setdefault("PYTHON_EGG_CACHE", os.path.join(settings.BASE_DIR, "egg_cache"))

from django.core.wsgi import get_wsgi_application

application = get_wsgi_application()
