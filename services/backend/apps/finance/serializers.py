from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.db import IntegrityError, transaction
from django.db.models import IntegerField, Max
from django.db.models.functions import Cast, Substr
from django.utils import timezone
from rest_framework import serializers

from apps.customers.models import Customer, CustomerAddress
from apps.finance.models import (
    Invoice,
    InvoiceItem,
    InvoiceReceivablePayment,
    Product,
    Purchase,
    PurchaseInboxInvoice,
    PurchaseItem,
    TaxReport,
)
from apps.loyalty.models import LoyaltyMember, LoyaltyPointEntry, LoyaltyRule
from apps.suppliers.models import Supplier
from apps.tenants.access import organization_has_enabled_module
from apps.tenants.models import Membership, Organization


def money(value):
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


MAX_CREATE_RETRIES = 3
SUPPORTED_INVOICE_SALE_CONDITIONS = {"01", "02"}
SUPPORTED_INVOICE_CURRENCIES = {"CRC", "USD"}
MODULE_LOYALTY = "loyalty"
MODULE_SHIPPING = "shipping"
MODULE_RECEIVABLES = "receivables"
MODULE_PURCHASES = "purchases"
MODULE_BILLING = "billing_basic"


def build_installment_amounts(total, installment_count):
    count = max(int(installment_count or 1), 1)
    normalized_total = money(Decimal(total or 0))
    base_amount = money(normalized_total / Decimal(count))
    amounts = [base_amount for _ in range(count)]
    distributed = sum(amounts, Decimal("0.00"))
    remainder = money(normalized_total - distributed)
    index = 0
    while remainder != Decimal("0.00"):
        step = Decimal("0.01") if remainder > 0 else Decimal("-0.01")
        amounts[index] = money(amounts[index] + step)
        remainder = money(remainder - step)
        index = (index + 1) % count
    return amounts


def build_receivable_summary(invoice):
    if invoice.payment_method != Invoice.PAYMENT_INSTALLMENTS or invoice.sale_condition != "02":
        return {
            "amount_paid": Decimal("0.00"),
            "amount_due": Decimal("0.00"),
            "payment_count": 0,
            "next_due_date": None,
            "final_due_date": None,
            "days_overdue": 0,
            "is_overdue": False,
            "status": "not_applicable",
            "overdue_installments": 0,
            "paid_percent": Decimal("0.00"),
            "installment_plan": [],
        }

    today = timezone.localdate()
    issue_date = timezone.localdate(invoice.issue_date)
    payments = list(invoice.receivable_payments.all())
    total_paid = money(sum((payment.amount for payment in payments), Decimal("0.00")))
    total_amount = money(invoice.total or Decimal("0.00"))
    amount_due = money(max(total_amount - total_paid, Decimal("0.00")))
    installment_amounts = build_installment_amounts(total_amount, invoice.installment_count)
    remaining_paid = total_paid
    installment_plan = []
    next_due_date = None
    overdue_installments = 0
    days_overdue = 0

    for index, amount in enumerate(installment_amounts, start=1):
        due_date = issue_date + timedelta(days=(invoice.installment_interval_days or 30) * index)
        paid_amount = money(min(amount, remaining_paid))
        remaining_paid = money(max(remaining_paid - paid_amount, Decimal("0.00")))
        pending_amount = money(max(amount - paid_amount, Decimal("0.00")))
        if pending_amount == Decimal("0.00"):
            status = "paid"
        elif paid_amount > Decimal("0.00"):
            status = "partial"
        elif due_date < today:
            status = "overdue"
        elif due_date == today:
            status = "due_today"
        else:
            status = "pending"

        if pending_amount > Decimal("0.00") and next_due_date is None:
            next_due_date = due_date
        if status == "overdue":
            overdue_installments += 1
            days_overdue = max(days_overdue, (today - due_date).days)

        installment_plan.append(
            {
                "number": index,
                "due_date": due_date,
                "amount": amount,
                "paid_amount": paid_amount,
                "pending_amount": pending_amount,
                "status": status,
            }
        )

    if amount_due == Decimal("0.00"):
        status = "paid"
    elif overdue_installments > 0:
        status = "overdue"
    elif total_paid > Decimal("0.00"):
        status = "partial"
    else:
        status = "pending"

    paid_percent = Decimal("0.00")
    if total_amount > Decimal("0.00"):
        paid_percent = money((total_paid / total_amount) * Decimal("100"))

    return {
        "amount_paid": total_paid,
        "amount_due": amount_due,
        "payment_count": len(payments),
        "next_due_date": next_due_date,
        "final_due_date": installment_plan[-1]["due_date"] if installment_plan else None,
        "days_overdue": days_overdue,
        "is_overdue": overdue_installments > 0,
        "status": status,
        "overdue_installments": overdue_installments,
        "paid_percent": paid_percent,
        "installment_plan": installment_plan,
    }


def build_customer_credit_summary(customer, organization_id, pending_invoice_total=Decimal("0.00"), exclude_invoice_id=None):
    invoices = (
        Invoice.objects.filter(
            organization_id=organization_id,
            customer_id=customer.id,
            status=Invoice.STATUS_ISSUED,
            sale_condition="02",
            payment_method=Invoice.PAYMENT_INSTALLMENTS,
        )
        .exclude(id=exclude_invoice_id)
        .prefetch_related("receivable_payments")
    )

    current_balance = Decimal("0.00")
    for invoice in invoices:
        current_balance += build_receivable_summary(invoice)["amount_due"]

    approved_limit = money(customer.credit_limit or Decimal("0.00"))
    current_balance = money(current_balance)
    pending_total = money(Decimal(pending_invoice_total or Decimal("0.00")))
    available_credit = money(max(approved_limit - current_balance, Decimal("0.00")))
    projected_available_credit = money(max(available_credit - pending_total, Decimal("0.00")))

    return {
        "approved": bool(customer.credit_approved),
        "limit": approved_limit,
        "used": current_balance,
        "available": available_credit,
        "payment_terms_days": int(customer.payment_terms_days or 0),
        "pending_invoice_total": pending_total,
        "projected_available": projected_available_credit,
    }


def build_customer_shipping_summary(customer):
    address = (
        CustomerAddress.objects.filter(customer=customer, address_type=CustomerAddress.TYPE_SHIPPING)
        .order_by("-is_primary", "-id")
        .first()
        or CustomerAddress.objects.filter(customer=customer).order_by("-is_primary", "-id").first()
    )
    if not address:
        return None

    address_parts = [address.address_line_1, address.address_line_2, address.city, address.state, address.country]
    printable_address = ", ".join(part for part in address_parts if part)

    return {
        "address_id": address.id,
        "address_type": address.address_type,
        "country": address.country,
        "state": address.state,
        "city": address.city,
        "postal_code": address.postal_code,
        "address_line_1": address.address_line_1,
        "address_line_2": address.address_line_2,
        "printable": printable_address,
    }


class ProductSerializer(serializers.ModelSerializer):
    sku = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    supplier_name = serializers.CharField(source="supplier.legal_name", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "organization",
            "sku",
            "product_type",
            "name",
            "description",
            "physical_location",
            "supplier",
            "supplier_name",
            "unit_price",
            "cost_price",
            "tax_rate",
            "stock",
            "item_status",
            "is_active",
            "service_duration_minutes",
            "created_at",
        ]
        validators = []

    def validate_name(self, value):
        clean_name = value.strip()
        if len(clean_name) < 2:
            raise serializers.ValidationError("El nombre debe tener al menos 2 caracteres.")
        return clean_name

    def validate(self, attrs):
        attrs = super().validate(attrs)
        product_type = attrs.get("product_type") or getattr(self.instance, "product_type", Product.TYPE_PHYSICAL)
        stock_value = attrs.get("stock", getattr(self.instance, "stock", 0))
        organization = attrs.get("organization") or getattr(self.instance, "organization", None)
        supplier = attrs.get("supplier", getattr(self.instance, "supplier", None))
        if product_type == Product.TYPE_SERVICE:
            attrs["stock"] = 0
            duration = attrs.get("service_duration_minutes", getattr(self.instance, "service_duration_minutes", 30))
            if duration < 1:
                raise serializers.ValidationError({"service_duration_minutes": "La duración del servicio debe ser mayor a 0 minutos."})
        elif stock_value is None or stock_value < 0:
            raise serializers.ValidationError({"stock": "El stock debe ser un entero mayor o igual a 0."})

        if supplier and organization and not Supplier.objects.filter(id=supplier.id, organization_id=organization.id).exists():
            raise serializers.ValidationError({"supplier": "El proveedor debe pertenecer a la misma organización del producto."})
        return attrs

    def _get_next_product_sequence(self, organization_id, product_type):
        Organization.objects.select_for_update().filter(id=organization_id).first()
        prefix = "SVC" if product_type == Product.TYPE_SERVICE else "PRD"
        current_max = (
            Product.objects.select_for_update()
            .filter(organization_id=organization_id, sku__startswith=f"{prefix}-{organization_id:03d}-")
            .annotate(sequence_number=Cast(Substr("sku", 9, 6), IntegerField()))
            .aggregate(max_sequence=Max("sequence_number"))
            .get("max_sequence")
            or 0
        )
        return current_max + 1

    def _generate_sku(self, organization_id, product_type):
        next_number = self._get_next_product_sequence(organization_id, product_type)
        prefix = "SVC" if product_type == Product.TYPE_SERVICE else "PRD"
        for sequence in range(next_number, next_number + 10000):
            candidate = f"{prefix}-{organization_id:03d}-{sequence:06d}"
            exists = Product.objects.filter(organization_id=organization_id, sku=candidate).exclude(id=getattr(self.instance, "id", None)).exists()
            if not exists:
                return candidate
        raise serializers.ValidationError({"sku": "No fue posible generar un SKU único. Intente con otro nombre."})

    def _resolve_sku(self, validated_data, instance=None):
        organization = validated_data.get("organization") or getattr(instance, "organization", None)
        product_type = validated_data.get("product_type") or getattr(instance, "product_type", Product.TYPE_PHYSICAL)
        explicit_sku = (validated_data.get("sku") or "").strip()

        if explicit_sku:
            exists = Product.objects.filter(organization_id=organization.id, sku=explicit_sku).exclude(id=getattr(instance, "id", None)).exists()
            if exists:
                raise serializers.ValidationError({"sku": "Ya existe un producto con ese SKU en la organización."})
            return explicit_sku

        if instance and instance.sku:
            name_changed = "name" in validated_data and validated_data["name"] != instance.name
            organization_changed = "organization" in validated_data and validated_data["organization"].id != instance.organization.id
            if not name_changed and not organization_changed:
                return instance.sku

        return self._generate_sku(organization.id, product_type)

    def create(self, validated_data):
        for attempt in range(MAX_CREATE_RETRIES):
            try:
                with transaction.atomic():
                    validated_data["sku"] = self._resolve_sku(validated_data)
                    return super().create(validated_data)
            except IntegrityError:
                if attempt == MAX_CREATE_RETRIES - 1:
                    raise serializers.ValidationError({"sku": "No fue posible generar un SKU único. Intente nuevamente."})
        raise serializers.ValidationError({"sku": "No fue posible generar un SKU único. Intente nuevamente."})

    def update(self, instance, validated_data):
        for attempt in range(MAX_CREATE_RETRIES):
            try:
                with transaction.atomic():
                    validated_data["sku"] = self._resolve_sku(validated_data, instance=instance)
                    return super().update(instance, validated_data)
            except IntegrityError:
                if attempt == MAX_CREATE_RETRIES - 1:
                    raise serializers.ValidationError({"sku": "No fue posible generar un SKU único. Intente nuevamente."})
        raise serializers.ValidationError({"sku": "No fue posible generar un SKU único. Intente nuevamente."})


class InvoiceItemWriteSerializer(serializers.Serializer):
    product = serializers.IntegerField()
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0.001"))
    unit_price = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
        required=False,
    )
    discount_percent = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=Decimal("0.00"),
        max_value=Decimal("100.00"),
        required=False,
        default=Decimal("0.00"),
    )


class InvoiceItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = InvoiceItem
        fields = [
            "id",
            "line_number",
            "product",
            "product_name",
            "description",
            "quantity",
            "unit_price",
            "discount_percent",
            "tax_rate",
            "subtotal",
            "discount_amount",
            "tax_amount",
            "total",
        ]


class InvoiceSerializer(serializers.ModelSerializer):
    items = InvoiceItemSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source="customer.legal_name", read_only=True)
    loyalty_awarded_points = serializers.SerializerMethodField()
    loyalty_redeemed_points = serializers.SerializerMethodField()
    agenda_event = serializers.SerializerMethodField()
    receivable_payments = serializers.SerializerMethodField()
    receivable_amount_paid = serializers.SerializerMethodField()
    receivable_amount_due = serializers.SerializerMethodField()
    receivable_payment_count = serializers.SerializerMethodField()
    receivable_next_due_date = serializers.SerializerMethodField()
    receivable_final_due_date = serializers.SerializerMethodField()
    receivable_days_overdue = serializers.SerializerMethodField()
    receivable_is_overdue = serializers.SerializerMethodField()
    receivable_status = serializers.SerializerMethodField()
    receivable_overdue_installments = serializers.SerializerMethodField()
    receivable_paid_percent = serializers.SerializerMethodField()
    receivable_installment_plan = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            "id",
            "organization",
            "customer",
            "customer_name",
            "invoice_number",
            "document_type",
            "consecutive_number",
            "sale_condition",
            "payment_method",
            "tax_regime",
            "installment_count",
            "installment_interval_days",
            "issue_date",
            "currency",
            "exchange_rate",
            "subtotal",
            "tax_total",
            "discount_total",
            "total",
            "status",
            "email_sent_at",
            "shipment_required",
            "shipment_details",
            "notes",
            "agenda_event",
            "items",
            "loyalty_awarded_points",
            "loyalty_redeemed_points",
            "receivable_payments",
            "receivable_amount_paid",
            "receivable_amount_due",
            "receivable_payment_count",
            "receivable_next_due_date",
            "receivable_final_due_date",
            "receivable_days_overdue",
            "receivable_is_overdue",
            "receivable_status",
            "receivable_overdue_installments",
            "receivable_paid_percent",
            "receivable_installment_plan",
        ]

    def get_agenda_event(self, obj):
        try:
            agenda_event = obj.agenda_event
        except Invoice.agenda_event.RelatedObjectDoesNotExist:
            return None
        return agenda_event.id

    def _get_loyalty_entries(self, obj):
        return LoyaltyPointEntry.objects.filter(source_reference=obj.invoice_number)

    def _get_receivable_summary(self, obj):
        cache_attr = "_receivable_summary_cache"
        summary = getattr(obj, cache_attr, None)
        if summary is None:
            summary = build_receivable_summary(obj)
            setattr(obj, cache_attr, summary)
        return summary

    def get_loyalty_awarded_points(self, obj):
        awarded = (
            self._get_loyalty_entries(obj)
            .filter(entry_type=LoyaltyPointEntry.TYPE_EARN)
            .values_list("points", flat=True)
        )
        return sum(int(points or 0) for points in awarded)

    def get_loyalty_redeemed_points(self, obj):
        redeemed = (
            self._get_loyalty_entries(obj)
            .filter(entry_type=LoyaltyPointEntry.TYPE_REDEEM)
            .values_list("points", flat=True)
        )
        return abs(sum(int(points or 0) for points in redeemed))

    def get_receivable_payments(self, obj):
        payments = obj.receivable_payments.all()
        return [
            {
                "id": payment.id,
                "amount": payment.amount,
                "payment_date": payment.payment_date,
                "reference": payment.reference,
                "notes": payment.notes,
                "created_at": payment.created_at,
                "created_by": getattr(payment.created_by, "email", "") or getattr(payment.created_by, "username", "") or "",
            }
            for payment in payments
        ]

    def get_receivable_amount_paid(self, obj):
        return self._get_receivable_summary(obj)["amount_paid"]

    def get_receivable_amount_due(self, obj):
        return self._get_receivable_summary(obj)["amount_due"]

    def get_receivable_payment_count(self, obj):
        return self._get_receivable_summary(obj)["payment_count"]

    def get_receivable_next_due_date(self, obj):
        return self._get_receivable_summary(obj)["next_due_date"]

    def get_receivable_final_due_date(self, obj):
        return self._get_receivable_summary(obj)["final_due_date"]

    def get_receivable_days_overdue(self, obj):
        return self._get_receivable_summary(obj)["days_overdue"]

    def get_receivable_is_overdue(self, obj):
        return self._get_receivable_summary(obj)["is_overdue"]

    def get_receivable_status(self, obj):
        return self._get_receivable_summary(obj)["status"]

    def get_receivable_overdue_installments(self, obj):
        return self._get_receivable_summary(obj)["overdue_installments"]

    def get_receivable_paid_percent(self, obj):
        return self._get_receivable_summary(obj)["paid_percent"]

    def get_receivable_installment_plan(self, obj):
        return self._get_receivable_summary(obj)["installment_plan"]


class InvoiceReceivablePaymentCreateSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    payment_date = serializers.DateField(default=timezone.localdate)
    reference = serializers.CharField(required=False, allow_blank=True, max_length=80)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        invoice = self.context["invoice"]
        summary = build_receivable_summary(invoice)
        if summary["status"] == "not_applicable":
            raise serializers.ValidationError("La factura seleccionada no pertenece a cuentas por cobrar.")
        if summary["amount_due"] <= Decimal("0.00"):
            raise serializers.ValidationError("La factura ya no tiene saldo pendiente.")
        if attrs["amount"] > summary["amount_due"]:
            raise serializers.ValidationError(
                f"El abono supera el saldo pendiente. Saldo actual: {summary['amount_due']}."
            )
        return attrs

    def create(self, validated_data):
        invoice = self.context["invoice"]
        request = self.context.get("request")
        return InvoiceReceivablePayment.objects.create(
            invoice=invoice,
            amount=validated_data["amount"],
            payment_date=validated_data["payment_date"],
            reference=validated_data.get("reference", "").strip(),
            notes=validated_data.get("notes", "").strip(),
            created_by=request.user if request and request.user.is_authenticated else None,
        )


class InvoiceCreateSerializer(serializers.Serializer):
    organization = serializers.IntegerField()
    customer = serializers.IntegerField()
    agenda_event = serializers.IntegerField(required=False, allow_null=True)
    document_type = serializers.ChoiceField(choices=Invoice.DOCUMENT_CHOICES, default=Invoice.DOCUMENT_INVOICE)
    sale_condition = serializers.RegexField(r"^\d{2}$")
    payment_method = serializers.ChoiceField(choices=Invoice.PAYMENT_METHOD_CHOICES)
    tax_regime = serializers.ChoiceField(choices=Invoice.TAX_REGIME_CHOICES, default=Invoice.REGIME_SIMPLIFIED)
    installment_count = serializers.IntegerField(required=False, min_value=1, default=1)
    installment_interval_days = serializers.IntegerField(required=False, min_value=1, default=30)
    currency = serializers.RegexField(r"^[A-Z]{3}$", default="CRC")
    exchange_rate = serializers.DecimalField(
        max_digits=10,
        decimal_places=4,
        min_value=Decimal("0.0001"),
        default=Decimal("1.0000"),
    )
    notes = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True, max_length=500)
    use_loyalty_points = serializers.BooleanField(required=False, default=False)
    shipment_required = serializers.BooleanField(required=False, default=False)
    shipment_details = serializers.JSONField(required=False, default=dict)
    items = InvoiceItemWriteSerializer(many=True)

    def _is_credit_sale(self, attrs):
        return attrs["sale_condition"] == "02" or attrs["payment_method"] == Invoice.PAYMENT_INSTALLMENTS

    def _build_invoice_lines(self, organization_id, tax_regime, items, lock=False):
        prepared_lines = []
        subtotal = Decimal("0.00")
        discount_total = Decimal("0.00")
        tax_total = Decimal("0.00")

        for index, item in enumerate(items, start=1):
            product_queryset = Product.objects.filter(id=item["product"], organization_id=organization_id, is_active=True)
            if lock:
                product_queryset = product_queryset.select_for_update()
            product = product_queryset.first()
            if not product:
                raise serializers.ValidationError(f"Producto inválido en la línea {index}.")

            quantity = item["quantity"]
            if quantity <= 0:
                raise serializers.ValidationError(f"Cantidad inválida en la línea {index}.")
            if product.product_type == Product.TYPE_PHYSICAL and quantity != quantity.to_integral_value():
                raise serializers.ValidationError(
                    f"La línea {index} usa cantidad decimal ({quantity}), pero el inventario maneja unidades enteras."
                )
            if product.product_type == Product.TYPE_PHYSICAL and quantity > product.stock:
                raise serializers.ValidationError(f"Stock insuficiente para {product.name}.")

            unit_price = item.get("unit_price") or product.unit_price
            line_subtotal = money(quantity * unit_price)
            discount_percent = item.get("discount_percent", Decimal("0.00"))
            discount_amount = money(line_subtotal * (discount_percent / Decimal("100")))
            taxable = line_subtotal - discount_amount
            applied_tax_rate = Decimal("0.00") if tax_regime == Invoice.REGIME_SIMPLIFIED else product.tax_rate
            line_tax = money(taxable * (applied_tax_rate / Decimal("100")))
            line_total = money(taxable + line_tax)

            prepared_lines.append(
                {
                    "product": product,
                    "line_number": index,
                    "description": product.name,
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "discount_percent": discount_percent,
                    "tax_rate": applied_tax_rate,
                    "subtotal": line_subtotal,
                    "discount_amount": discount_amount,
                    "tax_amount": line_tax,
                    "total": line_total,
                }
            )
            subtotal += line_subtotal
            discount_total += discount_amount
            tax_total += line_tax

        return {
            "lines": prepared_lines,
            "subtotal": money(subtotal),
            "discount_total": money(discount_total),
            "tax_total": money(tax_total),
            "total": money(subtotal - discount_total + tax_total),
        }

    def _has_shippable_lines(self, invoice_breakdown):
        return any(line["product"].product_type == Product.TYPE_PHYSICAL for line in invoice_breakdown["lines"])

    def _validate_shipment_details(self, attrs, invoice_breakdown):
        if not attrs.get("shipment_required"):
            attrs["shipment_details"] = {}
            return

        if not self._has_shippable_lines(invoice_breakdown):
            raise serializers.ValidationError(
                {"shipment_required": "El envio solo aplica cuando la factura incluye productos fisicos."}
            )

        shipment = attrs.get("shipment_details") or {}
        if not isinstance(shipment, dict):
            raise serializers.ValidationError({"shipment_details": "Los datos de envio deben enviarse en formato valido."})

        method = str(shipment.get("method") or "").strip()
        if method not in {Invoice.SHIPMENT_OWN_COURIER, Invoice.SHIPMENT_CORREOS_CR}:
            raise serializers.ValidationError({"shipment_details": "Selecciona un medio de envio valido."})

        required_fields = {
            "recipient_name": "Debe indicar la persona que recibe.",
            "address_line_1": "La direccion principal de envio es obligatoria.",
            "city": "La ciudad o localidad de envio es obligatoria.",
            "phone_primary": "Debes registrar al menos un telefono de contacto.",
        }
        for field, message in required_fields.items():
            if not str(shipment.get(field) or "").strip():
                raise serializers.ValidationError({"shipment_details": message})

        if method == Invoice.SHIPMENT_CORREOS_CR and not str(shipment.get("correos_branch") or "").strip():
            raise serializers.ValidationError(
                {"shipment_details": "Para Correos de Costa Rica debes indicar la sucursal o referencia principal."}
            )

        normalized = {
            "method": method,
            "status": "pending",
            "recipient_name": str(shipment.get("recipient_name") or "").strip(),
            "address_line_1": str(shipment.get("address_line_1") or "").strip(),
            "address_line_2": str(shipment.get("address_line_2") or "").strip(),
            "city": str(shipment.get("city") or "").strip(),
            "state": str(shipment.get("state") or "").strip(),
            "country": str(shipment.get("country") or "").strip() or "Costa Rica",
            "postal_code": str(shipment.get("postal_code") or "").strip(),
            "phone_primary": str(shipment.get("phone_primary") or "").strip(),
            "phone_secondary": str(shipment.get("phone_secondary") or "").strip(),
            "contact_reference": str(shipment.get("contact_reference") or "").strip(),
            "delivery_notes": str(shipment.get("delivery_notes") or "").strip(),
            "correos_branch": str(shipment.get("correos_branch") or "").strip(),
            "correos_guide": str(shipment.get("correos_guide") or "").strip(),
            "delivered_at": None,
            "status_updated_at": None,
        }
        length_limits = {
            "recipient_name": 160,
            "address_line_1": 180,
            "address_line_2": 180,
            "city": 80,
            "state": 80,
            "country": 80,
            "postal_code": 20,
            "phone_primary": 30,
            "phone_secondary": 30,
            "contact_reference": 160,
            "delivery_notes": 300,
            "correos_branch": 120,
            "correos_guide": 80,
        }
        for field, max_length in length_limits.items():
            if len(normalized[field]) > max_length:
                raise serializers.ValidationError({"shipment_details": f"{field} no debe superar {max_length} caracteres."})

        phone_digits = "".join(char for char in normalized["phone_primary"] if char.isdigit())
        if len(phone_digits) < 8:
            raise serializers.ValidationError({"shipment_details": "El telefono principal debe tener al menos 8 digitos."})

        if len(normalized["recipient_name"]) < 3:
            raise serializers.ValidationError({"shipment_details": "La persona que recibe debe tener al menos 3 caracteres."})
        if len(normalized["address_line_1"]) < 8:
            raise serializers.ValidationError({"shipment_details": "La direccion principal debe ser mas especifica."})
        if len(normalized["city"]) < 2:
            raise serializers.ValidationError({"shipment_details": "La ciudad o canton debe tener al menos 2 caracteres."})

        attrs["shipment_details"] = normalized

    def _validate_customer_credit(self, customer, organization_id, invoice_total):
        if not customer.credit_approved:
            raise serializers.ValidationError(
                {"customer": "El cliente no tiene aprobado el límite de crédito. Activa la aprobación del crédito antes de facturar."}
            )
        if money(customer.credit_limit or Decimal("0.00")) <= Decimal("0.00"):
            raise serializers.ValidationError(
                {"customer": "El cliente no tiene un límite de crédito válido. Configura un monto mayor a 0 antes de facturar a crédito."}
            )
        if int(customer.payment_terms_days or 0) <= 0:
            raise serializers.ValidationError(
                {"customer": "El cliente no tiene días de pago configurados para compras a crédito."}
            )

        credit = build_customer_credit_summary(
            customer=customer,
            organization_id=organization_id,
            pending_invoice_total=invoice_total,
        )
        if credit["available"] <= Decimal("0.00"):
            raise serializers.ValidationError(
                {
                    "customer": (
                        f"El cliente no tiene crédito disponible. Límite aprobado: {credit['limit']}, "
                        f"saldo comprometido: {credit['used']}."
                    )
                }
            )
        if invoice_total > credit["available"]:
            raise serializers.ValidationError(
                {
                    "customer": (
                        f"La factura excede el crédito disponible del cliente. Total factura: {invoice_total}, "
                        f"disponible: {credit['available']}, límite aprobado: {credit['limit']}."
                    )
                }
            )

    def validate(self, attrs):
        from apps.agenda.models import AgendaEvent

        request = self.context.get("request")
        organization = Organization.objects.filter(id=attrs["organization"]).first()
        if not organization:
            raise serializers.ValidationError("La organización seleccionada no existe.")

        if request and request.user.is_authenticated:
            has_access = Membership.objects.filter(user=request.user, organization_id=attrs["organization"]).exists()
            if not has_access:
                raise serializers.ValidationError("No tiene acceso a la organización seleccionada.")

        if not organization_has_enabled_module(attrs["organization"], MODULE_BILLING):
            raise serializers.ValidationError("El modulo de facturacion no esta activo para esta organizacion.")

        loyalty_enabled = organization_has_enabled_module(attrs["organization"], MODULE_LOYALTY)
        shipping_enabled = organization_has_enabled_module(attrs["organization"], MODULE_SHIPPING)
        receivables_enabled = organization_has_enabled_module(attrs["organization"], MODULE_RECEIVABLES)
        attrs["loyalty_enabled"] = loyalty_enabled

        if attrs.get("use_loyalty_points") and not loyalty_enabled:
            raise serializers.ValidationError({"use_loyalty_points": "El modulo de fidelizacion no esta activo para esta organizacion."})
        if not loyalty_enabled:
            attrs["use_loyalty_points"] = False

        if attrs.get("shipment_required") and not shipping_enabled:
            raise serializers.ValidationError({"shipment_required": "El modulo de envios no esta activo para esta organizacion."})
        if not shipping_enabled:
            attrs["shipment_required"] = False
            attrs["shipment_details"] = {}

        if not attrs["items"]:
            raise serializers.ValidationError("Debe incluir al menos una línea.")

        if attrs["sale_condition"] not in SUPPORTED_INVOICE_SALE_CONDITIONS:
            raise serializers.ValidationError(
                {
                    "sale_condition": (
                        "Este flujo solo soporta contado (01) y credito (02). "
                        "Otras condiciones de Hacienda requieren datos adicionales antes de emitir."
                    )
                }
            )

        if attrs["currency"] not in SUPPORTED_INVOICE_CURRENCIES:
            raise serializers.ValidationError({"currency": "Moneda no soportada para facturacion en este flujo. Use CRC o USD."})

        if attrs["currency"] == "CRC" and attrs["exchange_rate"] != Decimal("1.0000"):
            raise serializers.ValidationError({"exchange_rate": "Para facturas en CRC el tipo de cambio debe ser 1.0000."})

        if attrs["document_type"] == Invoice.DOCUMENT_CREDIT_NOTE:
            raise serializers.ValidationError(
                {
                    "document_type": (
                        "Las notas de credito requieren informacion de referencia del comprobante original. "
                        "Este flujo todavia no debe emitirlas directamente."
                    )
                }
            )

        customer = Customer.objects.filter(id=attrs["customer"], organization_id=attrs["organization"]).first()
        if not customer:
            raise serializers.ValidationError("El cliente no existe en la organización seleccionada.")

        if customer.status != Customer.STATUS_ACTIVE:
            raise serializers.ValidationError("Solo se puede facturar clientes activos.")

        customer_name = (customer.legal_name or "").strip()
        customer_tax_id = (customer.tax_id or "").strip()
        if not customer_name:
            raise serializers.ValidationError({"customer": "El cliente debe tener nombre o razon social antes de facturar."})
        if len(customer_name) > 100:
            raise serializers.ValidationError({"customer": "El nombre del cliente excede el maximo permitido para comprobantes."})
        if not customer_tax_id:
            raise serializers.ValidationError({"customer": "El cliente debe tener identificacion registrada antes de emitir factura electronica."})
        if len(customer_tax_id) > 20:
            raise serializers.ValidationError({"customer": "La identificacion del cliente no debe exceder 20 caracteres."})

        invoice_breakdown = self._build_invoice_lines(
            organization_id=attrs["organization"],
            tax_regime=attrs["tax_regime"],
            items=attrs["items"],
            lock=False,
        )
        self._validate_shipment_details(attrs, invoice_breakdown)
        attrs["invoice_breakdown"] = invoice_breakdown

        is_credit_sale = self._is_credit_sale(attrs)
        if is_credit_sale:
            if not receivables_enabled:
                raise serializers.ValidationError({"sale_condition": "El modulo de cuentas por cobrar no esta activo para esta organizacion."})
            if attrs["sale_condition"] != "02":
                raise serializers.ValidationError({"sale_condition": "Para facturar a crédito, la condición de venta debe ser crédito (02)."})
            if attrs["payment_method"] != Invoice.PAYMENT_INSTALLMENTS:
                raise serializers.ValidationError({"payment_method": "Para facturar a crédito, el método de pago debe ser a plazos."})
            if attrs["installment_count"] < 2:
                raise serializers.ValidationError({"installment_count": "La facturación a crédito requiere al menos 2 cuotas."})
            if attrs.get("use_loyalty_points"):
                raise serializers.ValidationError({"use_loyalty_points": "No se puede combinar pago con puntos en una factura a crédito."})
        else:
            attrs["installment_count"] = 1

        consecutive_base = f"{organization.hacienda_branch_code}{organization.hacienda_terminal_code}{attrs['document_type']}"
        if (
            len(consecutive_base) != 10
            or not organization.hacienda_branch_code.isdigit()
            or not organization.hacienda_terminal_code.isdigit()
            or organization.hacienda_branch_code == "000"
            or organization.hacienda_terminal_code == "00000"
        ):
            raise serializers.ValidationError({
                "organization": "La organizacion no tiene sucursal/terminal Hacienda validas para generar consecutivo."
            })

        agenda_event_id = attrs.get("agenda_event")
        if agenda_event_id:
            agenda_event = (
                AgendaEvent.objects.select_related("customer", "invoice")
                .filter(id=agenda_event_id, organization_id=attrs["organization"])
                .first()
            )
            if not agenda_event:
                raise serializers.ValidationError({"agenda_event": "La cita seleccionada no existe en la organización activa."})
            if agenda_event.invoice_id:
                raise serializers.ValidationError(
                    {"agenda_event": f"Esta cita ya está asociada a la factura {agenda_event.invoice.invoice_number}."}
                )
            if agenda_event.status == AgendaEvent.STATUS_CANCELLED:
                raise serializers.ValidationError({"agenda_event": "No se puede facturar una cita cancelada."})
            if agenda_event.service_id and not any(int(item["product"]) == agenda_event.service_id for item in attrs["items"]):
                raise serializers.ValidationError(
                    {"agenda_event": "La factura debe incluir el servicio de la cita para poder asociarla correctamente."}
                )
            if agenda_event.customer_id and agenda_event.customer_id != attrs["customer"]:
                raise serializers.ValidationError(
                    {"agenda_event": "La cita pertenece a otro cliente. Ajusta el cliente o factura la cita correcta."}
                )
            attrs["agenda_event_instance"] = agenda_event

        return attrs

    def _get_next_invoice_sequence(self, organization_id, document_type):
        organization = Organization.objects.select_for_update().filter(id=organization_id).first()
        if not organization:
            raise serializers.ValidationError("La organización seleccionada no existe.")

        consecutive_prefix = f"{organization.hacienda_branch_code}{organization.hacienda_terminal_code}{document_type}"
        if (
            len(consecutive_prefix) != 10
            or not organization.hacienda_branch_code.isdigit()
            or not organization.hacienda_terminal_code.isdigit()
            or organization.hacienda_branch_code == "000"
            or organization.hacienda_terminal_code == "00000"
        ):
            raise serializers.ValidationError({
                "organization": "La organizacion no tiene sucursal/terminal Hacienda validas para generar consecutivo."
            })
        current_max = (
            Invoice.objects.select_for_update()
            .filter(consecutive_number__startswith=consecutive_prefix)
            .annotate(sequence_number=Cast(Substr("consecutive_number", 11, 10), IntegerField()))
            .aggregate(max_sequence=Max("sequence_number"))
            .get("max_sequence")
            or 0
        )
        return current_max + 1

    @transaction.atomic
    def create(self, validated_data):
        agenda_event = validated_data.pop("agenda_event_instance", None)
        validated_data.pop("agenda_event", None)
        invoice_breakdown = validated_data.pop("invoice_breakdown", None)
        organization_id = validated_data["organization"]
        customer = Customer.objects.select_for_update().get(id=validated_data["customer"], organization_id=organization_id)
        if invoice_breakdown is None:
            invoice_breakdown = self._build_invoice_lines(
                organization_id=organization_id,
                tax_regime=validated_data["tax_regime"],
                items=validated_data["items"],
                lock=True,
            )
        if self._is_credit_sale(validated_data):
            self._validate_customer_credit(
                customer=customer,
                organization_id=organization_id,
                invoice_total=invoice_breakdown["total"],
            )

        invoice = None
        for attempt in range(MAX_CREATE_RETRIES):
            try:
                organization = Organization.objects.get(id=organization_id)
                invoice_sequence = self._get_next_invoice_sequence(organization_id, validated_data["document_type"])
                consecutive_number = (
                    f"{organization.hacienda_branch_code}{organization.hacienda_terminal_code}"
                    f"{validated_data['document_type']}{invoice_sequence:010d}"
                )
                invoice_number = f"F-{consecutive_number}"

                invoice = Invoice.objects.create(
                    organization_id=organization_id,
                    customer_id=customer.id,
                    invoice_number=invoice_number,
                    document_type=validated_data["document_type"],
                    consecutive_number=consecutive_number,
                    sale_condition=validated_data["sale_condition"],
                    payment_method=validated_data["payment_method"],
                    tax_regime=validated_data["tax_regime"],
                    installment_count=validated_data.get("installment_count", 1),
                    installment_interval_days=validated_data.get("installment_interval_days", 30),
                    currency=validated_data["currency"],
                    exchange_rate=validated_data["exchange_rate"],
                    shipment_required=validated_data.get("shipment_required", False),
                    shipment_details=validated_data.get("shipment_details", {}),
                    notes=validated_data.get("notes", ""),
                    status=Invoice.STATUS_ISSUED,
                )
                break
            except IntegrityError:
                if attempt == MAX_CREATE_RETRIES - 1:
                    raise serializers.ValidationError(
                        {"invoice_number": "No fue posible generar un número de factura único. Intente nuevamente."}
                    )
        if invoice is None:
            raise serializers.ValidationError({"invoice_number": "No fue posible generar un número de factura único. Intente nuevamente."})

        for line in invoice_breakdown["lines"]:
            InvoiceItem.objects.create(
                invoice=invoice,
                product=line["product"],
                line_number=line["line_number"],
                description=line["description"],
                quantity=line["quantity"],
                unit_price=line["unit_price"],
                discount_percent=line["discount_percent"],
                tax_rate=line["tax_rate"],
                subtotal=line["subtotal"],
                discount_amount=line["discount_amount"],
                tax_amount=line["tax_amount"],
                total=line["total"],
            )

            if line["product"].product_type == Product.TYPE_PHYSICAL:
                line["product"].stock -= int(line["quantity"])
                line["product"].save(update_fields=["stock"])

        invoice.subtotal = invoice_breakdown["subtotal"]
        invoice.discount_total = invoice_breakdown["discount_total"]
        invoice.tax_total = invoice_breakdown["tax_total"]
        invoice.total = invoice_breakdown["total"]
        invoice.save(update_fields=["subtotal", "discount_total", "tax_total", "total"])

        redeemed_points = 0
        if validated_data.get("use_loyalty_points"):
            redeemed_points = self._redeem_loyalty_points_for_invoice(
                organization_id=organization_id,
                customer_id=validated_data["customer"],
                invoice=invoice,
            )

        invoice.loyalty_redeemed_points = redeemed_points
        invoice.loyalty_awarded_points = (
            0
            if redeemed_points > 0 or not validated_data.get("loyalty_enabled")
            else self._accrue_loyalty_points(
                organization_id=organization_id,
                customer_id=validated_data["customer"],
                invoice=invoice,
            )
        )

        if agenda_event:
            agenda_event.invoice = invoice
            agenda_event.save(update_fields=["invoice", "updated_at"])

        return invoice

    def _redeem_loyalty_points_for_invoice(self, organization_id, customer_id, invoice):
        member = (
            LoyaltyMember.objects.select_for_update()
            .select_related("program")
            .filter(
                program__organization_id=organization_id,
                customer_id=customer_id,
                status=LoyaltyMember.STATUS_ACTIVE,
                program__is_active=True,
            )
            .order_by("id")
            .first()
        )
        if not member:
            raise serializers.ValidationError("El cliente no tiene membresía activa para pagar con puntos.")

        points_to_use = int(invoice.total.to_integral_value(rounding=ROUND_HALF_UP))
        if points_to_use <= 0:
            raise serializers.ValidationError("La factura debe tener un monto mayor a 0 para usar puntos.")

        if member.available_points < points_to_use:
            raise serializers.ValidationError(
                f"El cliente tiene {member.available_points} puntos disponibles y requiere {points_to_use} para cubrir la factura."
            )

        LoyaltyPointEntry.objects.create(
            member=member,
            program=member.program,
            entry_type=LoyaltyPointEntry.TYPE_REDEEM,
            points=-points_to_use,
            source_reference=invoice.invoice_number,
            source_metadata={
                "invoice_id": invoice.id,
                "invoice_number": invoice.invoice_number,
                "invoice_total": str(invoice.total),
                "payment_with_points": True,
                "awards_blocked": True,
                "reason": "invoice_paid_with_points",
            },
            event_at=timezone.now(),
        )
        member.available_points -= points_to_use
        member.last_activity_at = timezone.now()
        member.save(update_fields=["available_points", "last_activity_at", "updated_at"])
        return points_to_use

    def _accrue_loyalty_points(self, organization_id, customer_id, invoice):
        member = (
            LoyaltyMember.objects.select_for_update()
            .select_related("program")
            .filter(
                program__organization_id=organization_id,
                customer_id=customer_id,
                status=LoyaltyMember.STATUS_ACTIVE,
                program__is_active=True,
            )
            .order_by("id")
            .first()
        )
        if not member:
            return 0

        active_rule = (
            LoyaltyRule.objects.filter(program=member.program, rule_type=LoyaltyRule.RULE_EARN, is_active=True)
            .order_by("id")
            .first()
        )
        if not active_rule or not active_rule.points_per_currency_unit:
            return 0

        purchase_amount = invoice.total
        if purchase_amount < active_rule.minimum_purchase_amount:
            return 0

        base_points = (purchase_amount * active_rule.points_per_currency_unit).to_integral_value(rounding=ROUND_HALF_UP)
        multiplier = member.tier.multiplier if member.tier else Decimal("1.00")
        awarded_points = int((base_points * multiplier).to_integral_value(rounding=ROUND_HALF_UP))
        if awarded_points <= 0:
            return 0

        expires_at = None
        if active_rule.points_expire_in_days:
            expires_at = timezone.now() + timedelta(days=active_rule.points_expire_in_days)

        LoyaltyPointEntry.objects.create(
            member=member,
            program=member.program,
            related_rule=active_rule,
            entry_type=LoyaltyPointEntry.TYPE_EARN,
            points=awarded_points,
            source_reference=invoice.invoice_number,
            source_metadata={
                "invoice_id": invoice.id,
                "invoice_number": invoice.invoice_number,
                "invoice_total": str(invoice.total),
                "tier_multiplier": str(multiplier),
                "payment_with_points": False,
            },
            event_at=timezone.now(),
            expires_at=expires_at,
        )

        member.lifetime_points += awarded_points
        member.available_points += awarded_points
        member.last_activity_at = timezone.now()
        member.save(update_fields=["lifetime_points", "available_points", "last_activity_at", "updated_at"])
        return awarded_points


class PurchaseItemWriteSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=220, trim_whitespace=True)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0.001"))

    def validate_description(self, value):
        clean_value = (value or "").strip()
        if len(clean_value) < 2:
            raise serializers.ValidationError("La descripcion debe tener al menos 2 caracteres.")
        return clean_value


class PurchaseItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseItem
        fields = ["id", "line_number", "description", "unit_price", "quantity", "subtotal"]


class PurchaseSerializer(serializers.ModelSerializer):
    items = PurchaseItemSerializer(many=True, read_only=True)

    class Meta:
        model = Purchase
        fields = [
            "id",
            "organization",
            "supplier_name",
            "supplier_tax_id",
            "buyer_name",
            "buyer_tax_id",
            "issue_date",
            "invoice_number",
            "numeric_key",
            "currency",
            "exchange_rate",
            "subtotal",
            "tax_total",
            "total",
            "source",
            "created_at",
            "items",
        ]


class PurchaseCreateSerializer(serializers.Serializer):
    organization = serializers.IntegerField()
    supplier_name = serializers.CharField(max_length=200, allow_blank=True, required=False, default="")
    supplier_tax_id = serializers.CharField(max_length=50, allow_blank=True, required=False, default="")
    buyer_name = serializers.CharField(max_length=200, allow_blank=True, required=False, default="")
    buyer_tax_id = serializers.CharField(max_length=50, allow_blank=True, required=False, default="")
    issue_date = serializers.DateField()
    invoice_number = serializers.CharField(max_length=40)
    numeric_key = serializers.RegexField(r"^\d{50}$")
    currency = serializers.RegexField(r"^[A-Z]{3}$", required=False, default="CRC")
    exchange_rate = serializers.DecimalField(max_digits=10, decimal_places=4, required=False, default=Decimal("1.0000"))
    tax_total = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=Decimal("0.00"), min_value=Decimal("0.00"))
    total = serializers.DecimalField(max_digits=14, decimal_places=2, required=False)
    source = serializers.CharField(max_length=20, required=False, default="manual")
    items = PurchaseItemWriteSerializer(many=True)

    def validate(self, attrs):
        request = self.context.get("request")
        has_access = Membership.objects.filter(user=request.user, organization_id=attrs["organization"]).exists()
        if not has_access:
            raise serializers.ValidationError("No tiene acceso a la organizacion seleccionada.")
        if not organization_has_enabled_module(attrs["organization"], MODULE_PURCHASES):
            raise serializers.ValidationError("El modulo de compras no esta activo para esta organizacion.")
        if not attrs["items"]:
            raise serializers.ValidationError("Debe incluir al menos una linea.")
        attrs["supplier_name"] = (attrs.get("supplier_name") or "").strip() or "Proveedor no identificado"
        attrs["supplier_tax_id"] = (attrs.get("supplier_tax_id") or "").strip() or "No disponible"
        attrs["buyer_name"] = (attrs.get("buyer_name") or "").strip()
        attrs["buyer_tax_id"] = (attrs.get("buyer_tax_id") or "").strip()
        subtotal = money(sum((item["unit_price"] * item["quantity"] for item in attrs["items"]), Decimal("0.00")))
        tax_total = money(attrs.get("tax_total", Decimal("0.00")))
        calculated_total = money(subtotal + tax_total)
        expected_total = attrs.get("total")
        if expected_total is not None and abs(money(expected_total) - calculated_total) > Decimal("0.01"):
            raise serializers.ValidationError(
                {
                    "total": (
                        "El total no coincide con subtotal + impuestos. "
                        f"Calculado: {calculated_total}, recibido: {money(expected_total)}."
                    )
                }
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        validated_data["organization_id"] = validated_data.pop("organization")
        items = validated_data.pop("items")
        tax_total = validated_data.pop("tax_total", Decimal("0.00"))
        validated_data.pop("total", None)
        subtotal = Decimal("0.00")
        purchase = Purchase.objects.create(**validated_data)
        for idx, item in enumerate(items, start=1):
            line_subtotal = money(item["unit_price"] * item["quantity"])
            subtotal += line_subtotal
            PurchaseItem.objects.create(
                purchase=purchase,
                line_number=idx,
                description=item["description"],
                unit_price=item["unit_price"],
                quantity=item["quantity"],
                subtotal=line_subtotal,
            )
        purchase.subtotal = money(subtotal)
        purchase.tax_total = money(tax_total)
        purchase.total = money(purchase.subtotal + purchase.tax_total)
        purchase.save(update_fields=["subtotal", "tax_total", "total"])

        PurchaseInboxInvoice.objects.get_or_create(
            organization_id=purchase.organization_id,
            numeric_key=purchase.numeric_key,
            defaults={
                "supplier_name": purchase.supplier_name,
                "supplier_tax_id": purchase.supplier_tax_id,
                "buyer_name": purchase.buyer_name,
                "buyer_tax_id": purchase.buyer_tax_id,
                "issue_date": purchase.issue_date,
                "invoice_number": purchase.invoice_number,
                "currency": purchase.currency,
                "exchange_rate": purchase.exchange_rate,
                "subtotal": purchase.subtotal,
                "tax_total": purchase.tax_total,
                "total": purchase.total,
                "status": PurchaseInboxInvoice.STATUS_REGISTERED,
                "source": purchase.source,
                "purchase": purchase,
            },
        )
        return purchase


class PurchaseInboxSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    attachments = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseInboxInvoice
        fields = "__all__"

    def get_attachments(self, obj):
        return [
            {
                "id": attachment.id,
                "type": attachment.attachment_type,
                "filename": attachment.original_filename,
                "content_type": attachment.content_type,
                "size_bytes": attachment.size_bytes,
                "expires_at": attachment.expires_at,
            }
            for attachment in obj.attachments.all()
        ]


class TaxReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxReport
        fields = "__all__"


class TaxQuarterReportCreateSerializer(serializers.Serializer):
    organization = serializers.IntegerField(min_value=1)
    year = serializers.IntegerField(min_value=2000, max_value=2100)
    quarter = serializers.IntegerField(min_value=1, max_value=4)
    economic_activity = serializers.CharField(max_length=120, trim_whitespace=True)
    rts_factor = serializers.DecimalField(max_digits=8, decimal_places=4, min_value=Decimal("0.0001"))

    def validate_economic_activity(self, value):
        clean_value = (value or "").strip()
        if len(clean_value) < 3:
            raise serializers.ValidationError("La actividad economica debe tener al menos 3 caracteres.")
        return clean_value

    def validate(self, attrs):
        request = self.context.get("request")
        organization_id = attrs["organization"]
        if request and request.user.is_authenticated:
            has_access = Membership.objects.filter(user=request.user, organization_id=organization_id).exists()
            if not has_access:
                raise serializers.ValidationError({"organization": "No tiene acceso a la organizacion seleccionada."})
        if not organization_has_enabled_module(organization_id, MODULE_PURCHASES):
            raise serializers.ValidationError({"organization": "El modulo de compras no esta activo para esta organizacion."})
        if TaxReport.objects.filter(organization_id=organization_id, year=attrs["year"], quarter=attrs["quarter"]).exists():
            raise serializers.ValidationError({"quarter": "Ya existe un reporte para esa organizacion, anio y trimestre."})
        return attrs


class PurchaseInboxSyncSerializer(serializers.Serializer):
    organization = serializers.IntegerField(min_value=1)
    date_from = serializers.DateField()
    date_to = serializers.DateField()
    limit = serializers.IntegerField(min_value=1)

    def validate_limit(self, value):
        max_limit = self.context.get("max_limit")
        if max_limit and value > max_limit:
            raise serializers.ValidationError(f"El limite maximo permitido es {max_limit}.")
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        target_year = self.context.get("target_year")
        organization_id = attrs["organization"]
        if request and request.user.is_authenticated:
            has_access = Membership.objects.filter(user=request.user, organization_id=organization_id).exists()
            if not has_access:
                raise serializers.ValidationError({"organization": "No tiene acceso a la organizacion seleccionada."})
        if not organization_has_enabled_module(organization_id, MODULE_PURCHASES):
            raise serializers.ValidationError({"organization": "El modulo de compras no esta activo para esta organizacion."})
        if attrs["date_from"] > attrs["date_to"]:
            raise serializers.ValidationError({"date_from": "La fecha inicial no puede ser mayor a la fecha final."})
        if target_year and (attrs["date_from"].year != target_year or attrs["date_to"].year != target_year):
            raise serializers.ValidationError({"date_from": f"Solo se permite sincronizar fechas del {target_year}."})
        return attrs
