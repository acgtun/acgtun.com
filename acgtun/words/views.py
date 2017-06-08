# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from __future__ import absolute_import

import os
import sys
from collections import OrderedDict

from django.template.loader import render_to_string
from django.http import HttpResponse

from database.database import Database

sys.path.append('/Users/haifeng.chen/gitcode/acgtun.com/acgtun/common')
sys.path.append('/Users/haifeng.chen/gitcode/acgtun.com/acgtun/database')


def index(request):
    return HttpResponse('no');
