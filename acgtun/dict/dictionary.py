# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from __future__ import absolute_import

# Create your views here.
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.conf import settings

import os
import sys
import string
import pickle

sys.path.append(os.path.join(settings.BASE_DIR, 'common'))
word_directoin = os.path.join(settings.DATABASE_DIR, 'dictionary')


def to_html(word):
    html = ''
    for w in word:
        attrs = w['attribute']
        for att in attrs[:-1]:
            html += att
            html += '&nbsp;&nbsp;'
        html += attrs[-1]
        html += '<br>'
        definitions = w['definition']
        for definition in definitions:
            head = definition['head']
            means = definition['means']
            if head != None:
                head = str(head)
                head = head.replace('h6', 'h4')
                html += str(head)
            html += '<ol>'
            for mean in means:
                html += '<li>'
                if type(mean) is list:
                    for m in mean:
                        html += m
                        html += '<br>'
                else:
                    html += mean
                html += '</li>'

            html += '</ol>'
        html += '<hr>\n'
    return html


def search(request):
    print('fklsdjflks')
    word = request.GET.get('word')
    return as_view(request, word)


def index(request):
    response = HttpResponse()
    response.write(render_to_string('dict/index.html'))
    response.close()
    return response


def as_view(request, word=None):
    if(word == None):
        return index(request)

    print('word={}'.format(word))
    if len(word) == 0:
        response = HttpResponse()
        response.write(render_to_string('dict/word.html',
                                        {'word': word, 'valid': False,
                                         'message': 'The search sequence should not be empty.'}))
        response.close()
        return response

    word = word.replace(' ', '-')
    l = len(word)
    file = '/^^A'
    if l >= 2 and word[0] in string.ascii_lowercase and word[1] in string.ascii_lowercase:
        file = os.path.join(word_directoin, '{}{}'.format(word[0], word[1]), '{}.dict'.format(word))
    elif word[0] in string.ascii_uppercase:
        file = os.path.join(word_directoin, '{}'.format(word[0]), '{}.dict'.format(word))
    else:
        file = os.path.join(word_directoin, 'other', '{}.dict'.format(word))

    # print(file)
    if not os.path.exists(file):
        new_word = word[0]
        new_word = str(new_word)
        new_word = new_word.upper()
        new_word = new_word + word[1:]
        word = new_word
        # print(word)
        if word[0] in string.ascii_uppercase:
            file = os.path.join(word_directoin, '{}'.format(word[0]), '{}.dict'.format(word))
        else:
            file = os.path.join(word_directoin, 'other', '{}.dict'.format(word))

            # prin(file)
    if os.path.exists(file):
        word_content = pickle.load(open(file, "rb"))
        valid = True
        message = to_html(word_content)
    else:
        message = '{} NOT FOUND'.format(word)
        valid = False

    response = HttpResponse()
    response.write(render_to_string('dict/word.html',
                                    {'word': word, 'valid': valid, 'message': message}))
    response.close()
    return response
