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
from django.conf import settings

db_path = os.path.join(settings.BASE_DIR, 'database')

def as_view(request, problem=None, lang='java'):
    db = Database(os.path.join(db_path, 'db.sqlite3'))
    solutions = db.query(
        'SELECT id,problem,cpptime,cppcode,javatime,javacode,pythontime,pythoncode FROM {}'.format(
            db_table.leetcode_solution_table))
    for s in solutions:
	if problem == s[1]:
            # print('{}'.format(problem))
            if lang == 'cpp':
                code = s[3]
            elif lang == 'java':
                code = s[5]
            elif lang == 'python':
                code = s[7]
    response = HttpResponse()
    response.write(render_to_string('leetcode/solution.html', {'problem': problem, 'code': code, 'lang': lang}))
    response.close()
    return response
