# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from __future__ import absolute_import

import os
import sys
from collections import OrderedDict

from django.template.loader import render_to_string
from django.http import HttpResponse

from . import db_table
from database.database import Database


def index(request):
    response = HttpResponse('test');
    return response
