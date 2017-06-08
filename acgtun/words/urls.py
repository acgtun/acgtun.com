from django.conf.urls import url
from django.conf import settings
from django.conf.urls.static import static

from . import views
from . import words_search

urlpatterns = [
    url(r'^word/(?P<word>[-\.\(\),\'Pa-zA-Z0-9\s]+)$', words_search.as_view, name='word'),
    url(r'^$', views.index, name='index'),
    url(r'^word/$', views.index, name='index'),
]
