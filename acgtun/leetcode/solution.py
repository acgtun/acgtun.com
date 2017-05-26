# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from __future__ import absolute_import

from django.shortcuts import render

# Create your views here.
from django.http import HttpResponse

from . import page
import os
from os import listdir
from os import walk

from django.conf import settings



def as_view(request, problem=None, lang='java'):

    return HttpResponse(problem + lang)

