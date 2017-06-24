from django.conf.urls import url
from django.conf import settings
from django.conf.urls.static import static

from . import dictionary

urlpatterns = [
    url(r'^', dictionary.search, name='dictionary'),
    url(r'^(?P<word>[^/]+)$', dictionary.as_view, name='word'),
]
