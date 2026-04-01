from django.db import models
from apps.tenants.models import Organization


class Category(models.Model):
    TYPE_INCOME = "income"
    TYPE_EXPENSE = "expense"
    TYPE_CHOICES = [
        (TYPE_INCOME, "Income"),
        (TYPE_EXPENSE, "Expense"),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    name = models.CharField(max_length=150)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)

    class Meta:
        unique_together = ("organization", "name", "type")

    def __str__(self) -> str:
        return f"{self.name} ({self.type})"


class Transaction(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    category = models.ForeignKey(Category, on_delete=models.PROTECT)
    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.organization.slug}: {self.description} - {self.amount}"
