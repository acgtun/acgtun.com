"""acgtun URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/1.11/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  url(r'^$', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  url(r'^$', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.conf.urls import url, include
    2. Add a URL to urlpatterns:  url(r'^acgtun/', include('acgtun.urls'))
"""
from django.conf.urls import url, include
from django.contrib import admin
from . import home, about

urlpatterns = [
    # url(r'^admin/', admin.site.urls),
    url(r'^$', home.index, name='home'),
    url(r'^about/$', about.index, name='about'),
    url(r'^leetcode/', include('leetcode.urls')),
    url(r'^words/', include('words.urls')),
    url(r'^dict/', include('dict.urls')),
]
