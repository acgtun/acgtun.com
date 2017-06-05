# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from __future__ import absolute_import

from django.shortcuts import render

# Create your views here.
from django.http import HttpResponse
from django.template.loader import render_to_string

import os
from . import db_table
from database.database import Database

db_path = '/home/chenhaifeng88888/apps/django/django_projects/acgtun/database'

def as_view(request, problem=None, lang='java'):
    response = HttpResponse()
    return response
