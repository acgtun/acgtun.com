from django.conf.urls import url
from django.conf import settings
from django.conf.urls.static import static

from . import views
from . import page

urlpatterns = [
    url(r'^page/(?P<problem>[-\.\(\),\'Pa-zA-Z0-9\s]+)$', page.as_view, name='solution'),
    url(r'^page/(?P<problem>[-\.\(\),\'Pa-zA-Z0-9\s]+)/(?P<lang>[a-z]*)$', page.as_view, name='solution'),
    url(r'^$', views.index, name='index'),
]
