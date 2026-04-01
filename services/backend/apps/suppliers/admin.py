from django.contrib import admin

from apps.suppliers.models import Supplier, SupplierAddress, SupplierContact, SupplierType

admin.site.register(SupplierType)
admin.site.register(Supplier)
admin.site.register(SupplierContact)
admin.site.register(SupplierAddress)
