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

sys.path.append('/Users/haifeng.chen/gitcode/acgtun.com/acgtun/common')
sys.path.append('/Users/haifeng.chen/gitcode/acgtun.com/acgtun/database')

db_path = '/home/chenhaifeng88888/apps/django/django_projects/acgtun/database'
def get_solution(response):
    db = Database(os.path.join(db_path, 'db.sqlite3'))
    solutions = db.query("SELECT id,problem,cpptime,cppcode,javatime,javacode,pythontime,pythoncode FROM {}".format(
        db_table.leetcode_solution_table))

    problems = OrderedDict()
    for r in solutions:
        pn = r[1]
        pn = pn.rstrip()
        if pn not in problems.keys():
            problems[pn] = OrderedDict()
        problems[pn]['cpp'] = r[3]
        problems[pn]['java'] = r[5]
        problems[pn]['python'] = r[7]
	  
    problems = OrderedDict(sorted(problems.items(), key=lambda t: t[0])) 
    # print(problems)
    return response.write(render_to_string('leetcode/index.html', {'problems': problems}))


def index(request):
    response = HttpResponse();
    get_solution(response)
    response.close()
    return response
