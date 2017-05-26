# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from __future__ import absolute_import

from django.template.loader import render_to_string
from django.http import HttpResponse
import os

from load_csv_file import load_csv_file
from django.conf import settings


def getSolutions(response):
    file = 'static/leetcode/leetcode_problems.csv'
    file = os.path.join(settings.BASE_DIR, file)
    [fields, solutions] = load_csv_file(file)

    # 'problem,C++,C++Link,Java,JavaLink,Python3,Python3Link\n')
    problemName = 'problem'
    CLink = 'C++Link'
    JLink = 'JavaLink'
    PLink = 'Python3Link'

    problem = {}
    for r in solutions:
        pn = r[problemName]
        #pn = str(pn).replace('-', '')
        pn = pn.rstrip()
        if pn not in problem.keys():
            problem[pn] = {}
        problem[pn]['cpp'] = r[CLink]
        problem[pn]['java'] = r[JLink]
        problem[pn]['python'] = r[PLink]

    return response.write(render_to_string('leetcode/index.html', {'problems': problem}))


def index(request):
    response = HttpResponse();
    getSolutions(response)
    response.close()
    return response
