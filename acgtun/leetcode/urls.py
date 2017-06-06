from django.conf.urls import url
from django.conf import settings
from django.conf.urls.static import static

from . import views
from . import solution

urlpatterns = [
    url(r'^solution/(?P<problem>[-\.\(\),\'Pa-zA-Z0-9\s]+)$', solution.as_view, name='solution'),
    url(r'^solution/(?P<problem>[-\.\(\),\'Pa-zA-Z0-9\s]+)/(?P<lang>[a-z]*)$', solution.as_view, name='solution'),
    url(r'^$', views.index, name='index'),
    url(r'^solution$', views.index, name='index'),
]
