from django.contrib import admin

from apps.configuration.models import RoleCatalog, SystemSetting, UserPreference, UserRoleAssignment

admin.site.register(RoleCatalog)
admin.site.register(SystemSetting)
admin.site.register(UserPreference)
admin.site.register(UserRoleAssignment)
