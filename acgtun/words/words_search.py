# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from __future__ import absolute_import

from django.shortcuts import render

# Create your views here.
from django.http import HttpResponse
from django.template.loader import render_to_string

import os
import sys

sys.path.append('/opt/bitnami/apps/django/django_projects/acgtun/common')
from load_csv_file import load_csv_file


def to_html(starts, ends, word):
    message = ''
    if len(starts) > 0:
        message += '<h2> words start with {}</h2>'.format(word)
        message += '<table width=100%>\n'
        # print(message)
        for i in range(0, len(starts), 4):
            message += '<tr>\n'
            link = 'https://www.merriam-webster.com/dictionary/' + starts[i]
            message += '<td width="25%"><a href="{}">{}</a></td>\n'.format(link, starts[i])
            if i + 1 < len(starts):
                link = 'https://www.merriam-webster.com/dictionary/' + starts[i + 1]
                message += '<td width="25%"><a href="{}">{}</a></td>\n'.format(link, starts[i + 1])
            if i + 2 < len(starts):
                link = 'https://www.merriam-webster.com/dictionary/' + starts[i + 2]
                message += '<td width="25%"><a href="{}">{}</a></td>\n'.format(link, starts[i + 2])
            if i + 3 < len(starts):
                link = 'https://www.merriam-webster.com/dictionary/' + starts[i + 3]
                message += '<td width="25%"><a href="{}">{}</a></td>\n'.format(link, starts[i + 3])
            message += '</tr>\n'
        message += '</table>\n'
    # print(message)
    message += '<br><hr>'
    if len(ends) > 0:
        message += '<h2> words end with {}</h2>'.format(word)
        message += '<table width=100%>\n'
        print('yessss')
        print(message)
        for i in range(0, len(ends), 4):
            print('{} {}'.format(i, len(ends))
            message += '<tr>\n'
            link = 'https://www.merriam-webster.com/dictionary/' + ends[i]
            message += '<td width="25%"><a href="{}">{}</a></td>\n'.format(link, ends[i])
            if i + 1 < len(end):
                link = 'https://www.merriam-webster.com/dictionary/' + ends[i + 1]
            message += '<td width="25%"><a href="{}">{}</a></td>\n'.format(link, ends[i + 1])
            if i + 2 < len(ends):
                link = 'https://www.merriam-webster.com/dictionary/' + ends[i + 2]
            message += '<td width="25%"><a href="{}">{}</a></td>\n'.format(link, ends[i + 2])
            if i + 3 < len(starts):
                link = 'https://www.merriam-webster.com/dictionary/' + ends[i + 3]
            message += '<td width="25%"><a href="{}">{}</a></td>\n'.format(link, ends[i + 3])
            message += '</tr>\n'
            message += '</table>\n'
            print(message)
    return message


def search(request):
    word = request.GET.get('word')
    return as_view(request, word)


def as_view(request, word=None):
    if word.find(' ') >= 0:
        response = HttpResponse()
        response.write(render_to_string('words/word.html',
                                        {'word': word, 'valid': False,
                                         'message': 'The search sequence should not contain space.'}))
        response.close()
        return response

    if len(word) == 0:
        response = HttpResponse()
        response.write(render_to_string('words/word.html',
                                        {'word': word, 'valid': False,
                                         'message': 'The search sequence should not be empty.'}))
        response.close()
        return response

    l = len(word)
    #############################
    starts = ''
    ends = ''
    prefix_file = '/home/chenhaifeng88888/apps/django/django_projects/acgtun/database/words/prefix_{}.csv'.format(l)
    if os.path.exists(prefix_file):
        [field, prefix] = load_csv_file(prefix_file)

        start_conn = ''
        for w in prefix:
            if word == w['prefix']:
                start_conn = w['words']
                break
        starts = start_conn.split('&')
        print('starts')
        print(starts)

    suffix_file = '/home/chenhaifeng88888/apps/django/django_projects/acgtun/database/words/suffix_{}.csv'.format(l)
    print(suffix_file)
    if os.path.exists(suffix_file):
        [field, suffix] = load_csv_file(suffix_file)
        print(field)

        end_conn = ''
        for w in suffix:
            if word == w['suffix']:
                end_conn = w['words']
                break
        ends = end_conn.split('&')
        print('ends')
        print(ends)

    message = to_html(starts, ends, word)
    print(message)
    response = HttpResponse()
    response.write(render_to_string('words/word.html',
                                    {'word': word, 'valid': True, 'message': message}))
    response.close()
    return response
