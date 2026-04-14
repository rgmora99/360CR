from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.db import IntegrityError, transaction
from django.db.models import IntegerField, Max
from django.db.models.functions import Cast, Substr
from django.utils import timezone
from rest_framework import serializers

from apps.customers.models import Customer
from apps.finance.models import (
    Invoice,
    InvoiceItem,
    Product,
    Purchase,
    PurchaseInboxInvoice,
    PurchaseItem,
    TaxReport,
)
from apps.loyalty.models import LoyaltyMember, LoyaltyPointEntry, LoyaltyRule
from apps.suppliers.models import Supplier
from apps.tenants.models import Membership, Organization


def money(value):
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


MAX_CREATE_RETRIES = 3


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
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    discount_percent = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, default=Decimal("0.00"))


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
    loyalty_awarded_points = serializers.IntegerField(read_only=True, default=0)
    loyalty_redeemed_points = serializers.IntegerField(read_only=True, default=0)

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
            "notes",
            "items",
            "loyalty_awarded_points",
            "loyalty_redeemed_points",
        ]


class InvoiceCreateSerializer(serializers.Serializer):
    organization = serializers.IntegerField()
    customer = serializers.IntegerField()
    document_type = serializers.ChoiceField(choices=Invoice.DOCUMENT_CHOICES, default=Invoice.DOCUMENT_INVOICE)
    sale_condition = serializers.RegexField(r"^\d{2}$")
    payment_method = serializers.ChoiceField(choices=Invoice.PAYMENT_METHOD_CHOICES)
    tax_regime = serializers.ChoiceField(choices=Invoice.TAX_REGIME_CHOICES, default=Invoice.REGIME_SIMPLIFIED)
    installment_count = serializers.IntegerField(required=False, min_value=1, default=1)
    installment_interval_days = serializers.IntegerField(required=False, min_value=1, default=30)
    currency = serializers.RegexField(r"^[A-Z]{3}$", default="CRC")
    exchange_rate = serializers.DecimalField(max_digits=10, decimal_places=4, default=Decimal("1.0000"))
    notes = serializers.CharField(required=False, allow_blank=True)
    use_loyalty_points = serializers.BooleanField(required=False, default=False)
    items = InvoiceItemWriteSerializer(many=True)

    def validate(self, attrs):
        request = self.context.get("request")
        organization = Organization.objects.filter(id=attrs["organization"]).first()
        if not organization:
            raise serializers.ValidationError("La organización seleccionada no existe.")

        if request and request.user.is_authenticated:
            has_access = Membership.objects.filter(user=request.user, organization_id=attrs["organization"]).exists()
            if not has_access:
                raise serializers.ValidationError("No tiene acceso a la organización seleccionada.")

        if not attrs["items"]:
            raise serializers.ValidationError("Debe incluir al menos una línea.")

        customer = Customer.objects.filter(id=attrs["customer"], organization_id=attrs["organization"]).first()
        if not customer:
            raise serializers.ValidationError("El cliente no existe en la organización seleccionada.")

        if customer.status != Customer.STATUS_ACTIVE:
            raise serializers.ValidationError("Solo se puede facturar clientes activos.")

        if attrs["payment_method"] == Invoice.PAYMENT_INSTALLMENTS:
            if attrs["installment_count"] < 2:
                raise serializers.ValidationError("La facturación a plazos requiere al menos 2 cuotas.")
            if attrs["sale_condition"] != "02":
                raise serializers.ValidationError("Para pago a plazos, la condición de venta debe ser crédito (02).")
        else:
            attrs["installment_count"] = 1

        consecutive_base = f"{organization.hacienda_branch_code}{organization.hacienda_terminal_code}{attrs['document_type']}"
        if len(consecutive_base) != 10:
            raise serializers.ValidationError("Error interno generando consecutivo base.")

        return attrs

    def _get_next_invoice_sequence(self, organization_id, document_type):
        organization = Organization.objects.select_for_update().filter(id=organization_id).first()
        if not organization:
            raise serializers.ValidationError("La organización seleccionada no existe.")

        consecutive_prefix = f"{organization.hacienda_branch_code}{organization.hacienda_terminal_code}{document_type}"
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
        organization_id = validated_data["organization"]
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
                    customer_id=validated_data["customer"],
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

        subtotal = Decimal("0.00")
        discount_total = Decimal("0.00")
        tax_total = Decimal("0.00")

        for index, item in enumerate(validated_data["items"], start=1):
            product = Product.objects.select_for_update().filter(id=item["product"], organization_id=organization_id, is_active=True).first()
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
            discount_amount = money(line_subtotal * (item.get("discount_percent", Decimal("0.00")) / Decimal("100")))
            taxable = line_subtotal - discount_amount
            applied_tax_rate = Decimal("0.00") if invoice.tax_regime == Invoice.REGIME_SIMPLIFIED else product.tax_rate
            line_tax = money(taxable * (applied_tax_rate / Decimal("100")))
            line_total = taxable + line_tax

            InvoiceItem.objects.create(
                invoice=invoice,
                product=product,
                line_number=index,
                description=product.name,
                quantity=quantity,
                unit_price=unit_price,
                discount_percent=item.get("discount_percent", Decimal("0.00")),
                tax_rate=applied_tax_rate,
                subtotal=line_subtotal,
                discount_amount=discount_amount,
                tax_amount=line_tax,
                total=line_total,
            )

            if product.product_type == Product.TYPE_PHYSICAL:
                product.stock -= int(quantity)
                product.save(update_fields=["stock"])

            subtotal += line_subtotal
            discount_total += discount_amount
            tax_total += line_tax

        invoice.subtotal = money(subtotal)
        invoice.discount_total = money(discount_total)
        invoice.tax_total = money(tax_total)
        invoice.total = money(subtotal - discount_total + tax_total)
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
            if redeemed_points > 0
            else self._accrue_loyalty_points(
                organization_id=organization_id,
                customer_id=validated_data["customer"],
                invoice=invoice,
            )
        )
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
            source_metadata={"invoice_id": invoice.id, "invoice_total": str(invoice.total), "payment_with_points": True},
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
            source_metadata={"invoice_id": invoice.id, "invoice_total": str(invoice.total), "tier_multiplier": str(multiplier)},
            event_at=timezone.now(),
            expires_at=expires_at,
        )

        member.lifetime_points += awarded_points
        member.available_points += awarded_points
        member.last_activity_at = timezone.now()
        member.save(update_fields=["lifetime_points", "available_points", "last_activity_at", "updated_at"])
        return awarded_points


class PurchaseItemWriteSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=220)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3)


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
            "subtotal",
            "tax_total",
            "total",
            "source",
            "created_at",
            "items",
        ]


class PurchaseCreateSerializer(serializers.Serializer):
    organization = serializers.IntegerField()
    supplier_name = serializers.CharField(max_length=200)
    supplier_tax_id = serializers.CharField(max_length=50)
    buyer_name = serializers.CharField(max_length=200)
    buyer_tax_id = serializers.CharField(max_length=50)
    issue_date = serializers.DateField()
    invoice_number = serializers.CharField(max_length=40)
    numeric_key = serializers.RegexField(r"^\d{50}$")
    tax_total = serializers.DecimalField(max_digits=14, decimal_places=2, required=False, default=Decimal("0.00"))
    source = serializers.CharField(max_length=20, required=False, default="manual")
    items = PurchaseItemWriteSerializer(many=True)

    def validate(self, attrs):
        request = self.context.get("request")
        has_access = Membership.objects.filter(user=request.user, organization_id=attrs["organization"]).exists()
        if not has_access:
            raise serializers.ValidationError("No tiene acceso a la organización seleccionada.")
        if not attrs["items"]:
            raise serializers.ValidationError("Debe incluir al menos una línea.")
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        validated_data["organization_id"] = validated_data.pop("organization")
        items = validated_data.pop("items")
        tax_total = validated_data.pop("tax_total", Decimal("0.00"))
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
    class Meta:
        model = PurchaseInboxInvoice
        fields = "__all__"


class TaxReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxReport
        fields = "__all__"
