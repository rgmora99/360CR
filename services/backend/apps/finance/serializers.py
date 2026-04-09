from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from rest_framework import serializers

from apps.customers.models import Customer
from apps.finance.models import Invoice, InvoiceItem, Product
from apps.suppliers.models import Supplier
from apps.tenants.models import Membership


def money(value):
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


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
        elif stock_value is None or stock_value < 0:
            raise serializers.ValidationError({"stock": "El stock debe ser un entero mayor o igual a 0."})

        if supplier and organization and not Supplier.objects.filter(id=supplier.id, organization_id=organization.id).exists():
            raise serializers.ValidationError({"supplier": "El proveedor debe pertenecer a la misma organización del producto."})
        return attrs

    def _generate_sku(self, organization_id, product_type):
        next_number = Product.objects.filter(organization_id=organization_id).count() + 1
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
        validated_data["sku"] = self._resolve_sku(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data["sku"] = self._resolve_sku(validated_data, instance=instance)
        return super().update(instance, validated_data)


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
    items = InvoiceItemWriteSerializer(many=True)

    def validate(self, attrs):
        request = self.context.get("request")
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

        consecutive_base = f"00100001{attrs['document_type']}"
        if len(consecutive_base) != 10:
            raise serializers.ValidationError("Error interno generando consecutivo base.")

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        organization_id = validated_data["organization"]
        invoice_count = Invoice.objects.filter(organization_id=organization_id).count() + 1
        invoice_number = f"F-{organization_id:03d}-{invoice_count:08d}"
        consecutive_number = f"00100001{validated_data['document_type']}{invoice_count:010d}"

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
        return invoice
