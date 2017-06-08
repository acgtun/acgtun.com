# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from __future__ import absolute_import

from django.shortcuts import render

# Create your views here.
from django.http import HttpResponse
from django.template.loader import render_to_string

import os
import sys

sys.path.append('/Users/haifeng.chen/gitcode/acgtun.com/acgtun/common')

from load_csv_file import load_csv_file


def as_view(request, word=None):
    if word.find(' ') >= 0:
        return HttpResponse('The search sequence should not contain space.')
    if len(word) == 0:
        return HttpResponse('The search sequence should not be empty.')
    l = len(word)

    [field, prefix] = load_csv_file('/Users/haifeng.chen/gitcode/acgtun.com/acgtun/words/prefix_{}.csv'.format(l))
    starts = []
    for w in prefix:
        if word == w['prefix']:
            starts.extend(w['words'])

    [field, suffix] = load_csv_file('/Users/haifeng.chen/gitcode/acgtun.com/acgtun/words/sufix_{}.csv'.format(l))
    ends = []

    response = HttpResponse()
    response.write(render_to_string('words/word.html', {'starts': starts, 'ends': ends, 'word': word}))
    response.close()
    return response
