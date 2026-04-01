from django.contrib import admin

from apps.customers.models import Customer, CustomerAddress, CustomerContact, CustomerType

admin.site.register(CustomerType)
admin.site.register(Customer)
admin.site.register(CustomerContact)
admin.site.register(CustomerAddress)
