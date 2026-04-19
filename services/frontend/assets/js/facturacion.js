(function initFacturacion() {
  const $ = (id) => document.getElementById(id);
  const BILLING_PREFILL_KEY = 'cr360.billing.prefill';
  const PAYMENT_INSTALLMENTS = '05';
  const CREDIT_SALE_CONDITION = '02';
  const SHIPMENT_OWN_COURIER = 'own_courier';
  const SHIPMENT_CORREOS_CR = 'correos_cr';

  const PAYMENT_METHOD_OPTIONS = [
    { value: '01', label: 'Efectivo' },
    { value: '02', label: 'Tarjeta' },
    { value: '03', label: 'Transferencia' },
    { value: '04', label: 'SINPE Movil' },
    { value: PAYMENT_INSTALLMENTS, label: 'A plazos', creditOnly: true },
  ];

  const state = {
    customers: [],
    products: [],
    filteredProducts: [],
    lines: [],
    organizations: [],
    selectedCustomer: null,
    prefillAgendaEventId: null,
    shipment: null,
  };

  const apiBase = () => '/api';
  const orgId = () => {
    const id = Number($('organization-id').value || window.AppSession?.getActiveOrganizationId?.());
    if (!id || id < 1) {
      throw new Error('No hay organizacion activa. Selecciona una organizacion valida.');
    }
    return id;
  };

  function request(path, options) {
    return fetch(`${apiBase()}${path}`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      credentials: 'include',
      ...options,
    }).then(async (response) => {
      const text = await response.text();
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok) {
        if (contentType.includes('application/json')) {
          try {
            const payload = JSON.parse(text);
            throw new Error(formatApiError(payload) || 'Error de API');
          } catch (error) {
            if (error instanceof Error) throw error;
          }
        }
        throw new Error(text || 'Error de API');
      }
      if (!text) return null;
      return JSON.parse(text);
    });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function normalizeTaxId(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function formatApiError(payload) {
    if (!payload) return '';
    if (typeof payload === 'string') return payload;
    if (payload.detail) return payload.detail;
    return Object.entries(payload)
      .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
      .join(' | ');
  }

  function setFeedback(msg, error, options = {}) {
    const silentPrefixes = ['Cliente cargado correctamente:', 'Linea agregada:', 'Cliente limpiado.'];
    const shouldSilence = !error && silentPrefixes.some((prefix) => String(msg || '').startsWith(prefix));
    const { showInline = !shouldSilence, showToast = !shouldSilence } = options;

    $('feedback').textContent = showInline ? msg : '';
    $('feedback').style.color = error ? '#ff6b6b' : 'var(--muted)';
    if (showToast && window.appAlerts?.toast) {
      window.appAlerts.toast(msg, error ? 'error' : 'success');
    }
  }

  function emptyShipment() {
    return {
      method: SHIPMENT_OWN_COURIER,
      recipient_name: '',
      address_line_1: '',
      address_line_2: '',
      city: '',
      state: '',
      country: 'Costa Rica',
      postal_code: '',
      phone_primary: '',
      phone_secondary: '',
      contact_reference: '',
      delivery_notes: '',
      correos_branch: '',
      correos_guide: '',
    };
  }

  function getBillingPrefill() {
    try {
      return JSON.parse(sessionStorage.getItem(BILLING_PREFILL_KEY) || 'null');
    } catch (_error) {
      return null;
    }
  }

  function clearBillingPrefill() {
    sessionStorage.removeItem(BILLING_PREFILL_KEY);
  }

  function renderOrganizations() {
    state.organizations = window.AppSession?.getOrganizations?.() || [];
    const activeId = Number(window.AppSession?.getActiveOrganizationId?.());
    $('organization-id').innerHTML =
      state.organizations.map((org) => `<option value="${org.id}">${escapeHtml(org.name)}</option>`).join('') ||
      '<option value="">Sin organizaciones</option>';

    if (activeId && state.organizations.some((org) => org.id === activeId)) {
      $('organization-id').value = String(activeId);
    }
  }

  function syncInstallmentsUI() {
    const saleCondition = $('sale-condition').value;
    const paymentSelect = $('payment-method');
    const selectedValue = paymentSelect.value;
    const availableOptions = PAYMENT_METHOD_OPTIONS.filter((option) => saleCondition === CREDIT_SALE_CONDITION || !option.creditOnly);

    paymentSelect.innerHTML = availableOptions
      .map((option) => `<option value="${option.value}">${escapeHtml(option.label)}</option>`)
      .join('');

    const nextValue = availableOptions.some((option) => option.value === selectedValue)
      ? selectedValue
      : saleCondition === CREDIT_SALE_CONDITION
        ? PAYMENT_INSTALLMENTS
        : '01';
    paymentSelect.value = nextValue;

    const isInstallments = paymentSelect.value === PAYMENT_INSTALLMENTS;
    $('installments-count-wrap').classList.toggle('hidden', !isInstallments);
    $('installments-interval-wrap').classList.toggle('hidden', !isInstallments);
  }

  function renderCustomerSelect() {
    const select = $('customer-select');
    const currentId = Number(state.selectedCustomer?.id || 0);

    select.innerHTML = ['<option value="">Selecciona un cliente</option>']
      .concat(
        state.customers.map(
          (customer) => `<option value="${customer.id}">${escapeHtml(customer.legal_name)} (${escapeHtml(customer.tax_id || 'sin cedula')})</option>`,
        ),
      )
      .join('');

    if (currentId && state.customers.some((customer) => customer.id === currentId)) {
      select.value = String(currentId);
    } else {
      select.value = '';
    }

    $('customer-select-wrap').classList.toggle('hidden', state.customers.length <= 1);
  }

  async function loadCustomers(term = '') {
    const query = String(term || '').trim();
    const data = await request(`/invoices/customer-autocomplete/?organization_id=${orgId()}&q=${encodeURIComponent(query)}`);
    state.customers = Array.isArray(data) ? data : [];
    renderCustomerSelect();
    updateCustomerMeta();
  }

  function buildShipmentFromCustomer() {
    const customer = state.selectedCustomer;
    const shipping = customer?.shipping || null;
    return {
      ...emptyShipment(),
      recipient_name: customer?.legal_name || '',
      address_line_1: shipping?.address_line_1 || '',
      address_line_2: shipping?.address_line_2 || '',
      city: shipping?.city || '',
      state: shipping?.state || '',
      country: shipping?.country || 'Costa Rica',
      postal_code: shipping?.postal_code || '',
      phone_primary: customer?.phone || '',
    };
  }

  function ensureShipmentState() {
    if (!state.shipment) {
      state.shipment = buildShipmentFromCustomer();
      return;
    }

    if (!state.shipment.recipient_name && state.selectedCustomer?.legal_name) {
      state.shipment.recipient_name = state.selectedCustomer.legal_name;
    }
    if (!state.shipment.phone_primary && state.selectedCustomer?.phone) {
      state.shipment.phone_primary = state.selectedCustomer.phone;
    }
    if (!state.shipment.address_line_1 && state.selectedCustomer?.shipping?.address_line_1) {
      Object.assign(state.shipment, {
        address_line_1: state.selectedCustomer.shipping.address_line_1 || '',
        address_line_2: state.selectedCustomer.shipping.address_line_2 || '',
        city: state.selectedCustomer.shipping.city || '',
        state: state.selectedCustomer.shipping.state || '',
        country: state.selectedCustomer.shipping.country || 'Costa Rica',
        postal_code: state.selectedCustomer.shipping.postal_code || '',
      });
    }
  }

  function selectCustomer(customer, syncInput = true) {
    state.selectedCustomer = customer || null;
    if (syncInput) $('customer-tax-id').value = customer?.tax_id || '';
    $('customer-select').value = customer ? String(customer.id) : '';
    state.shipment = buildShipmentFromCustomer();
    updateCustomerMeta();
  }

  function updateCustomerMeta() {
    const customer = state.selectedCustomer || state.customers.find((item) => item.id === Number($('customer-select').value)) || null;
    state.selectedCustomer = customer;

    if (!customer) {
      $('customer-meta').textContent = 'No hay cliente seleccionado.';
      $('customer-meta').classList.add('customer-meta-empty');
      syncPointsPaymentUI();
      syncShipmentUI();
      return;
    }

    const loyaltyText = customer.loyalty?.program_name
      ? ` · Fidelizacion: ${customer.loyalty.program_name} (${customer.loyalty.available_points} pts)`
      : ' · Sin membresia de fidelizacion';
    $('customer-meta').textContent = `${customer.legal_name} · Cedula: ${customer.tax_id || 'sin cedula'} · ${customer.email || 'sin correo'} · ${customer.phone || 'sin telefono'}${loyaltyText}`;

    const credit = customer.credit || null;
    if (credit) {
      const daysText = Number(credit.payment_terms_days || 0) > 0
        ? `plazo ${Number(credit.payment_terms_days)} dias`
        : 'sin dias de pago configurados';
      const creditText = credit.approved
        ? ` · Credito aprobado: disponible CRC ${Number(credit.available || 0).toFixed(2)} de ${Number(credit.limit || 0).toFixed(2)} · ${daysText}`
        : ` · Credito no aprobado · limite CRC ${Number(credit.limit || 0).toFixed(2)} · ${daysText}`;
      $('customer-meta').textContent = `${$('customer-meta').textContent}${creditText}`;
    }

    if (customer.shipping?.printable) {
      $('customer-meta').textContent = `${$('customer-meta').textContent} · Envio sugerido: ${customer.shipping.printable}`;
    }

    $('customer-meta').classList.remove('customer-meta-empty');
    syncPointsPaymentUI();
    syncShipmentUI();
  }

  async function searchCustomerByTaxId() {
    const normalized = normalizeTaxId($('customer-tax-id').value.trim());
    if (!normalized) throw new Error('Ingresa una cedula antes de buscar.');

    await loadCustomers(normalized);
    const exactMatch = state.customers.find((customer) => normalizeTaxId(customer.tax_id) === normalized);
    if (!exactMatch) {
      selectCustomer(null, false);
      throw new Error('No encontramos un cliente con esa cedula en la organizacion seleccionada.');
    }

    selectCustomer(exactMatch);
    setFeedback(`Cliente cargado correctamente: ${exactMatch.legal_name}.`, false, { showInline: false, showToast: false });
  }

  function clearCustomerSelection() {
    state.selectedCustomer = null;
    state.customers = [];
    state.shipment = emptyShipment();
    $('customer-tax-id').value = '';
    $('customer-select').innerHTML = '<option value="">Selecciona un cliente</option>';
    $('customer-select-wrap').classList.add('hidden');
    updateCustomerMeta();
  }

  function setAgendaPrefillBanner(prefill, customerFound, lineAdded) {
    const banner = $('agenda-prefill-banner');
    const summary = $('agenda-prefill-summary');
    if (!prefill?.eventId) {
      banner.classList.add('hidden');
      summary.textContent = 'Se completaran automaticamente los datos disponibles de la cita.';
      return;
    }

    const parts = [
      prefill.title ? `Evento: ${prefill.title}` : 'Evento desde agenda',
      prefill.startsAt ? `Fecha: ${new Date(prefill.startsAt).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' })}` : '',
      customerFound ? 'Cliente cargado' : 'Cliente pendiente de validar manualmente',
      lineAdded ? 'Servicio agregado a la factura' : prefill.serviceId ? 'Servicio pendiente de validar manualmente' : '',
    ].filter(Boolean);

    summary.textContent = parts.join(' · ');
    banner.classList.remove('hidden');
  }

  function ensurePrefillLine(productId) {
    const parsedId = Number(productId);
    if (!parsedId || state.lines.some((line) => Number(line.product) === parsedId)) return false;
    const productDetail = state.products.find((item) => item.id === parsedId);
    if (!productDetail) return false;

    state.lines.push({ product: parsedId, quantity: 1, discount_percent: 0 });
    renderLines();
    return true;
  }

  async function applyBillingPrefill() {
    const prefill = getBillingPrefill();
    if (!prefill) {
      setAgendaPrefillBanner(null, false, false);
      return;
    }

    state.prefillAgendaEventId = Number(prefill.eventId) || null;

    if (Number(prefill.organizationId) && Number(prefill.organizationId) !== orgId()) {
      $('organization-id').value = String(prefill.organizationId);
      window.AppSession?.setActiveOrganizationId?.($('organization-id').value);
      await Promise.all([loadCustomers(), loadProducts()]);
    }

    let customerFound = false;
    if (prefill.customerId) {
      await loadCustomers();
      const found = state.customers.find((item) => item.id === Number(prefill.customerId));
      if (found) {
        selectCustomer(found);
        customerFound = true;
      }
    }

    let lineAdded = false;
    if (prefill.serviceId) {
      lineAdded = ensurePrefillLine(prefill.serviceId);
      if (lineAdded) {
        $('line-product').value = String(prefill.serviceId);
        updateSelectedProductMeta();
      }
    }

    if (prefill.notes) {
      const currentNotes = $('notes').value.trim();
      $('notes').value = currentNotes ? `${currentNotes}\n${prefill.notes}` : prefill.notes;
    }

    setAgendaPrefillBanner(prefill, customerFound, lineAdded);
    clearBillingPrefill();
  }

  function getProductLabel(product) {
    const code = product.sku || product.code || `ID ${product.id}`;
    const stockLabel = product.product_type === 'service' ? 'Servicio' : `Stock: ${product.stock}`;
    return `${code} · ${product.name} · ${stockLabel} · CRC ${Number(product.unit_price || 0).toFixed(2)}`;
  }

  function renderProductOptions() {
    const select = $('line-product');
    const selectedId = Number(select.value || 0);

    select.innerHTML =
      state.filteredProducts.map((product) => `<option value="${product.id}">${escapeHtml(getProductLabel(product))}</option>`).join('') ||
      '<option value="">No hay productos disponibles.</option>';

    if (selectedId && state.filteredProducts.some((product) => product.id === selectedId)) {
      select.value = String(selectedId);
    } else if (state.filteredProducts.length) {
      select.value = String(state.filteredProducts[0].id);
    } else {
      select.value = '';
    }

    updateSelectedProductMeta();
  }

  function filterProducts() {
    const term = $('line-product-search').value.trim().toLowerCase();
    state.filteredProducts = state.products.filter((product) => {
      const code = String(product.sku || product.code || '').toLowerCase();
      const name = String(product.name || '').toLowerCase();
      return !term || code.includes(term) || name.includes(term);
    });
    renderProductOptions();
  }

  async function loadProducts() {
    const data = await request(`/products/?organization_id=${orgId()}`);
    state.products = (Array.isArray(data) ? data : []).filter((product) => product.is_active);
    state.filteredProducts = state.products.slice();
    renderProductOptions();
  }

  function updateSelectedProductMeta() {
    const product = state.products.find((item) => item.id === Number($('line-product').value));
    if (!product) {
      $('line-product-meta').textContent = 'Selecciona un producto para ver su detalle.';
      return;
    }

    const typeLabel = product.product_type === 'service' ? 'Servicio' : 'Producto';
    const stockLabel = product.product_type === 'service' ? 'Disponible para agenda/facturacion' : `Stock actual: ${product.stock}`;
    $('line-product-meta').textContent = `${typeLabel} · Codigo: ${product.sku || product.code || 'N/D'} · ${product.name} · ${stockLabel} · Precio: CRC ${Number(product.unit_price || 0).toFixed(2)}`;
  }

  function calculateSubtotal() {
    return state.lines.reduce((acc, line) => {
      const product = state.products.find((item) => item.id === line.product);
      if (!product) return acc;
      const rawSubtotal = Number(line.quantity) * Number(product.unit_price);
      const discountAmount = rawSubtotal * (Number(line.discount_percent || 0) / 100);
      return acc + (rawSubtotal - discountAmount);
    }, 0);
  }

  function syncPointsPaymentUI() {
    const checkbox = $('pay-with-points');
    const help = $('points-payment-help');
    const panel = $('points-payment-panel');
    const customer = state.selectedCustomer;
    const availablePoints = Number(customer?.loyalty?.available_points || 0);
    const subtotal = calculateSubtotal();
    const requiredPoints = Math.round(subtotal);

    $('points-customer-name').textContent = customer?.legal_name || 'Sin cliente seleccionado';
    $('points-available').textContent = `${availablePoints} pts`;
    $('points-required').textContent = `${requiredPoints || 0} pts`;
    $('points-result').textContent = 'Pendiente';
    panel.classList.remove('is-active', 'is-warning', 'is-disabled');

    if (!customer?.loyalty?.program_name) {
      checkbox.checked = false;
      checkbox.disabled = true;
      panel.classList.add('is-disabled');
      help.textContent = customer ? 'El cliente seleccionado no tiene membresia activa.' : 'Selecciona un cliente para validar puntos.';
      $('points-result').textContent = 'No disponible';
      return;
    }

    if (!subtotal) {
      checkbox.checked = false;
      checkbox.disabled = true;
      panel.classList.add('is-disabled');
      help.textContent = `Disponible: ${availablePoints} pts. Agrega lineas para validar pago con puntos.`;
      $('points-result').textContent = 'Sin lineas';
      return;
    }

    const hasEnough = availablePoints >= requiredPoints;
    checkbox.disabled = !hasEnough;
    if (!hasEnough) checkbox.checked = false;

    if (checkbox.checked && hasEnough) {
      panel.classList.add('is-active');
      $('points-result').textContent = 'Canje aplicado';
      help.textContent = `Se descontaran ${requiredPoints} pts y esta compra no acumulara puntos nuevos.`;
      return;
    }

    panel.classList.add(hasEnough ? 'is-warning' : 'is-disabled');
    $('points-result').textContent = hasEnough ? 'Disponible para usar' : 'Saldo insuficiente';
    help.textContent = hasEnough
      ? `Disponible: ${availablePoints} pts. Requeridos aprox.: ${requiredPoints} pts.`
      : `Disponible: ${availablePoints} pts. Requiere aprox. ${requiredPoints} pts para cubrir la factura.`;
  }

  function hasShippableLines() {
    return state.lines.some((line) => {
      const product = state.products.find((item) => item.id === line.product);
      return product?.product_type === 'physical';
    });
  }

  function shipmentIsComplete() {
    if (!$('requires-shipment').checked) return false;
    ensureShipmentState();
    if (!state.shipment?.recipient_name || !state.shipment?.address_line_1 || !state.shipment?.city || !state.shipment?.phone_primary) {
      return false;
    }
    if (state.shipment.method === SHIPMENT_CORREOS_CR && !state.shipment.correos_branch) {
      return false;
    }
    return true;
  }

  function syncShipmentMethodFields() {
    $('shipment-correos-fields').classList.toggle('hidden', $('shipment-method').value !== SHIPMENT_CORREOS_CR);
  }

  function fillShipmentForm() {
    ensureShipmentState();
    const shipment = state.shipment || emptyShipment();
    $('shipment-method').value = shipment.method || SHIPMENT_OWN_COURIER;
    $('shipment-recipient-name').value = shipment.recipient_name || '';
    $('shipment-phone-primary').value = shipment.phone_primary || '';
    $('shipment-phone-secondary').value = shipment.phone_secondary || '';
    $('shipment-country').value = shipment.country || 'Costa Rica';
    $('shipment-state').value = shipment.state || '';
    $('shipment-city').value = shipment.city || '';
    $('shipment-postal-code').value = shipment.postal_code || '';
    $('shipment-address-line-1').value = shipment.address_line_1 || '';
    $('shipment-address-line-2').value = shipment.address_line_2 || '';
    $('shipment-delivery-notes').value = shipment.delivery_notes || '';
    $('shipment-contact-reference').value = shipment.contact_reference || '';
    $('shipment-correos-guide').value = shipment.correos_guide || '';
    $('shipment-correos-branch').value = shipment.correos_branch || '';
    syncShipmentMethodFields();
  }

  function readShipmentForm() {
    return {
      method: $('shipment-method').value,
      recipient_name: $('shipment-recipient-name').value.trim(),
      address_line_1: $('shipment-address-line-1').value.trim(),
      address_line_2: $('shipment-address-line-2').value.trim(),
      city: $('shipment-city').value.trim(),
      state: $('shipment-state').value.trim(),
      country: $('shipment-country').value.trim() || 'Costa Rica',
      postal_code: $('shipment-postal-code').value.trim(),
      phone_primary: $('shipment-phone-primary').value.trim(),
      phone_secondary: $('shipment-phone-secondary').value.trim(),
      contact_reference: $('shipment-contact-reference').value.trim(),
      delivery_notes: $('shipment-delivery-notes').value.trim(),
      correos_branch: $('shipment-correos-branch').value.trim(),
      correos_guide: $('shipment-correos-guide').value.trim(),
    };
  }

  function shipmentReferenceSummary(shipment) {
    if (!shipment) return 'Pendiente';
    if (shipment.method === SHIPMENT_CORREOS_CR) {
      return shipment.correos_guide || shipment.correos_branch || 'Sucursal pendiente';
    }
    return shipment.contact_reference || shipment.delivery_notes || 'Coordinacion directa';
  }

  function syncShipmentUI() {
    const panel = $('shipment-panel');
    const checked = $('requires-shipment').checked;
    const shippable = hasShippableLines();

    ensureShipmentState();
    panel.classList.remove('is-active', 'is-disabled');

    if (!shippable) {
      $('requires-shipment').checked = false;
      $('configure-shipment').disabled = true;
      $('shipment-status').textContent = 'No aplica';
      $('shipment-method-summary').textContent = 'Sin definir';
      $('shipment-destination-summary').textContent = 'Sin direccion configurada';
      $('shipment-reference-summary').textContent = 'Pendiente';
      $('shipment-help').textContent = 'Agrega productos fisicos para habilitar el envio.';
      panel.classList.add('is-disabled');
      return;
    }

    $('configure-shipment').disabled = !checked;
    $('shipment-status').textContent = checked ? (shipmentIsComplete() ? 'Listo para emitir' : 'Configuracion pendiente') : 'No solicitado';
    $('shipment-method-summary').textContent = checked
      ? state.shipment.method === SHIPMENT_CORREOS_CR
        ? 'Correos de Costa Rica'
        : 'Mensajeria propia'
      : 'Sin definir';
    $('shipment-destination-summary').textContent = checked
      ? [state.shipment.address_line_1, state.shipment.city].filter(Boolean).join(' · ') || 'Sin direccion configurada'
      : 'Sin direccion configurada';
    $('shipment-reference-summary').textContent = checked ? shipmentReferenceSummary(state.shipment) : 'Pendiente';

    if (!checked) {
      panel.classList.add('is-disabled');
      $('shipment-help').textContent = 'Activa la solicitud de envio para capturar direccion, telefonos y referencias.';
      return;
    }

    panel.classList.add('is-active');
    $('shipment-help').textContent = shipmentIsComplete()
      ? 'El envio esta configurado y se guardara junto con la factura.'
      : 'Completa la configuracion del envio antes de emitir la factura.';
  }

  function openShipmentModal() {
    if (!hasShippableLines()) {
      setFeedback('El envio solo esta disponible cuando la factura incluye productos fisicos.', true);
      return;
    }
    fillShipmentForm();
    $('shipment-modal').classList.add('is-open');
    $('shipment-modal').setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    window.setTimeout(() => $('shipment-recipient-name')?.focus(), 20);
  }

  function closeShipmentModal() {
    $('shipment-modal').classList.remove('is-open');
    $('shipment-modal').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  function renderLines() {
    let subtotal = 0;

    $('lines-body').innerHTML =
      state.lines
        .map((line, index) => {
          const product = state.products.find((item) => item.id === line.product);
          if (!product) return '';

          const rawSubtotal = Number(line.quantity) * Number(product.unit_price);
          const discountAmount = rawSubtotal * (Number(line.discount_percent || 0) / 100);
          const lineSubtotal = rawSubtotal - discountAmount;
          subtotal += lineSubtotal;

          return `<tr><td>${escapeHtml(product.name)}</td><td>${line.quantity}</td><td>${line.discount_percent}</td><td>${lineSubtotal.toFixed(2)}</td><td><button class="btn btn-secondary" data-rm="${index}">Quitar</button></td></tr>`;
        })
        .join('') || '<tr><td colspan="5">Sin lineas</td></tr>';

    $('totals').textContent = `Subtotal aproximado: ${subtotal.toFixed(2)} CRC`;
    syncPointsPaymentUI();
    syncShipmentUI();
  }

  function buildPayloadLines() {
    return state.lines.map((line) => ({
      product: line.product,
      quantity: line.quantity,
      discount_percent: line.discount_percent,
    }));
  }

  $('search-customer').addEventListener('click', () => {
    searchCustomerByTaxId().catch((error) => setFeedback(error.message, true));
  });

  $('clear-customer').addEventListener('click', () => {
    clearCustomerSelection();
    setFeedback('Cliente limpiado. Puedes buscar otra cedula.', false, { showInline: false, showToast: false });
  });

  $('customer-tax-id').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    $('search-customer').click();
  });

  $('customer-select').addEventListener('change', () => {
    const customer = state.customers.find((item) => item.id === Number($('customer-select').value)) || null;
    selectCustomer(customer);
  });

  $('sale-condition').addEventListener('change', syncInstallmentsUI);
  $('payment-method').addEventListener('change', syncInstallmentsUI);

  $('pay-with-points').addEventListener('change', () => {
    if ($('pay-with-points').checked) {
      $('payment-method').value = '03';
      syncInstallmentsUI();
    }
  });

  $('requires-shipment').addEventListener('change', () => {
    if ($('requires-shipment').checked) {
      ensureShipmentState();
      syncShipmentUI();
      openShipmentModal();
      return;
    }
    syncShipmentUI();
  });

  $('configure-shipment').addEventListener('click', openShipmentModal);
  $('shipment-method').addEventListener('change', syncShipmentMethodFields);
  $('close-shipment-modal').addEventListener('click', closeShipmentModal);
  $('cancel-shipment-modal').addEventListener('click', closeShipmentModal);
  $('shipment-modal').addEventListener('click', (event) => {
    if (event.target === $('shipment-modal')) closeShipmentModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && $('shipment-modal').classList.contains('is-open')) {
      closeShipmentModal();
    }
  });

  $('shipment-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const shipment = readShipmentForm();

    if (!shipment.recipient_name || !shipment.address_line_1 || !shipment.city || !shipment.phone_primary) {
      setFeedback('Completa persona que recibe, direccion principal, ciudad y telefono principal para guardar el envio.', true);
      return;
    }
    if (shipment.method === SHIPMENT_CORREOS_CR && !shipment.correos_branch) {
      setFeedback('Para Correos de Costa Rica indica la sucursal u oficina de referencia.', true);
      return;
    }

    state.shipment = shipment;
    syncShipmentUI();
    closeShipmentModal();
    setFeedback('Envio configurado correctamente.', false, { showInline: false, showToast: false });
  });

  $('line-product-search').addEventListener('input', filterProducts);
  $('line-product').addEventListener('change', updateSelectedProductMeta);

  $('add-line').addEventListener('click', () => {
    const productId = Number($('line-product').value);
    const quantity = Number($('line-qty').value);
    const discountPercent = Number($('line-discount').value);
    const product = state.products.find((item) => item.id === productId);

    if (!productId || !product) return setFeedback('Selecciona un producto valido.', true);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999999) return setFeedback('Cantidad invalida.', true);
    if (product.product_type === 'physical' && !Number.isInteger(quantity)) {
      return setFeedback('Los productos fisicos deben usar cantidad entera.', true);
    }
    if (product.product_type === 'physical' && quantity > Number(product.stock || 0)) {
      return setFeedback(`Stock insuficiente para ${product.name}.`, true);
    }
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      return setFeedback('El descuento debe estar entre 0 y 100.', true);
    }

    state.lines.push({ product: productId, quantity, discount_percent: discountPercent });
    renderLines();
    setFeedback(`Linea agregada: ${product.name}.`, false, { showInline: false, showToast: false });
  });

  $('lines-body').addEventListener('click', (event) => {
    const index = event.target.dataset.rm;
    if (index === undefined) return;
    state.lines.splice(Number(index), 1);
    renderLines();
  });

  $('invoice-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      if (!state.lines.length) return setFeedback('Debe agregar lineas a la factura.', true);

      const customerId = Number(state.selectedCustomer?.id || $('customer-select').value);
      if (!customerId) return setFeedback('Busca y selecciona un cliente valido antes de facturar.', true);

      const paymentMethod = $('payment-method').value;
      const installmentCount = Number($('installment-count').value || 1);
      const installmentIntervalDays = Number($('installment-interval-days').value || 30);

      if (paymentMethod === PAYMENT_INSTALLMENTS && installmentCount < 2) {
        return setFeedback('Para pago a plazos usa al menos 2 cuotas.', true);
      }
      if (paymentMethod === PAYMENT_INSTALLMENTS && $('sale-condition').value !== CREDIT_SALE_CONDITION) {
        return setFeedback('Para pago a plazos debes seleccionar condicion de venta: Credito.', true);
      }
      if ($('sale-condition').value === CREDIT_SALE_CONDITION && paymentMethod !== PAYMENT_INSTALLMENTS) {
        return setFeedback('Para facturar a credito debes usar metodo de pago: A plazos.', true);
      }

      if ($('requires-shipment').checked) {
        if (!hasShippableLines()) {
          return setFeedback('El envio solo se puede solicitar cuando hay productos fisicos en la factura.', true);
        }
        if (!shipmentIsComplete()) {
          openShipmentModal();
          return setFeedback('Completa la configuracion del envio antes de emitir la factura.', true);
        }
      }

      const currentCustomer = state.selectedCustomer;
      if (($('sale-condition').value === CREDIT_SALE_CONDITION || paymentMethod === PAYMENT_INSTALLMENTS) && currentCustomer?.credit) {
        if (!currentCustomer.credit.approved) return setFeedback('El cliente no tiene aprobado el limite de credito.', true);
        if (Number(currentCustomer.credit.payment_terms_days || 0) <= 0) {
          return setFeedback('El cliente no tiene dias de pago configurados para ventas a credito.', true);
        }
        if (Number(currentCustomer.credit.available || 0) <= 0) {
          return setFeedback('El cliente no tiene credito disponible para esta compra.', true);
        }
      }

      const currency = $('currency').value.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) return setFeedback('La moneda debe tener formato de 3 letras, por ejemplo CRC.', true);
      if ($('notes').value.length > 500) return setFeedback('Las notas no pueden superar 500 caracteres.', true);

      const payload = {
        organization: orgId(),
        customer: customerId,
        agenda_event: state.prefillAgendaEventId,
        document_type: $('document-type').value,
        sale_condition: $('sale-condition').value,
        payment_method: paymentMethod,
        tax_regime: $('tax-regime').value,
        installment_count: paymentMethod === PAYMENT_INSTALLMENTS ? installmentCount : 1,
        installment_interval_days: paymentMethod === PAYMENT_INSTALLMENTS ? installmentIntervalDays : 30,
        currency,
        exchange_rate: 1,
        notes: $('notes').value.trim(),
        items: buildPayloadLines(),
        use_loyalty_points: $('pay-with-points').checked,
        shipment_required: $('requires-shipment').checked,
        shipment_details: $('requires-shipment').checked ? state.shipment : {},
      };

      const invoice = await request('/invoices/', { method: 'POST', body: JSON.stringify(payload) });
      const awarded = Number(invoice.loyalty_awarded_points || 0);
      const redeemed = Number(invoice.loyalty_redeemed_points || 0);
      const loyaltyMsg = redeemed
        ? ` Se cobraron ${redeemed} puntos de fidelizacion y la compra no acumulo puntos nuevos.`
        : awarded
          ? ` Se acreditaron ${awarded} puntos al cliente.`
          : '';
      const receivableMsg = paymentMethod === PAYMENT_INSTALLMENTS
        ? ' La cuenta quedo disponible en "Cuentas x cobrar" para registrar abonos y controlar vencimientos.'
        : '';
      const shipmentMsg = $('requires-shipment').checked ? ' Se guardo la configuracion de envio en la factura.' : '';

      setFeedback(`Factura emitida: ${invoice.invoice_number}. Puede verla en "Ver facturas emitidas".${loyaltyMsg}${receivableMsg}${shipmentMsg}`, false);

      state.lines = [];
      state.prefillAgendaEventId = null;
      state.shipment = emptyShipment();
      $('requires-shipment').checked = false;
      $('pay-with-points').checked = false;
      renderLines();
      await loadProducts();
      if (state.selectedCustomer?.tax_id) {
        $('customer-tax-id').value = state.selectedCustomer.tax_id;
      }
    } catch (error) {
      setFeedback(error.message || 'No se pudo insertar la factura.', true);
    }
  });

  syncInstallmentsUI();
  renderOrganizations();
  clearCustomerSelection();

  $('organization-id').addEventListener('change', () => {
    window.AppSession?.setActiveOrganizationId?.($('organization-id').value);
    clearCustomerSelection();
    Promise.all([loadProducts(), loadCustomers()]).catch((error) => setFeedback(error.message, true));
  });

  Promise.all([loadProducts(), loadCustomers()])
    .then(() => {
      clearCustomerSelection();
      return applyBillingPrefill();
    })
    .catch((error) => setFeedback(error.message, true));
})();
