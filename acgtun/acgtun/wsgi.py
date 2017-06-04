"""
WSGI config for acgtun project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/1.11/howto/deployment/wsgi/
"""

import os
import sys

sys.path.append('/opt/bitnami/apps/django/django_projects/acgtun')
sys.path.append('/opt/bitnami/apps/django/django_projects/acgtun/common')
sys.path.append('/opt/bitnami/apps/django/django_projects/acgtun/database')
sys.path.append('/opt/bitnami/apps/django/django_projects/acgtun/leetcode')
os.environ.setdefault("PYTHON_EGG_CACHE", "/opt/bitnami/apps/django/django_projects/acgtun/egg_cache")

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "acgtun.settings")

application = get_wsgi_application()
