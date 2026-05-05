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
    { value: '04', label: 'SINPE Móvil' },
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
    shipmentServiceProductId: null,
    enabledModules: new Set(),
  };

  const apiBase = () => '/api';
  const orgId = () => {
    const id = Number($('organization-id').value || window.AppSession?.getActiveOrganizationId?.());
    if (!id || id < 1) {
      throw new Error('No hay organización activa. Selecciona una organización válida.');
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
        if (contentType.includes('text/html')) {
          throw new Error('No se pudo completar la accion en este momento. Intenta de nuevo en unos segundos.');
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

  function formatMoney(value) {
    return `CRC ${Number(value || 0).toFixed(2)}`;
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

  function shipmentRequested() {
    return Boolean($('requires-shipment')?.checked);
  }

  function setShipmentRequested(nextValue) {
    const checked = Boolean(nextValue);
    if ($('requires-shipment')) $('requires-shipment').checked = checked;
  }

  function hasModule(moduleCode) {
    return state.enabledModules.has(moduleCode);
  }

  function syncModuleVisibility() {
    state.enabledModules = new Set(window.AppSession?.getActiveModuleCodes?.() || []);
    document.querySelectorAll('[data-module-code]').forEach((element) => {
      const moduleCode = element.dataset.moduleCode;
      element.classList.toggle('hidden', Boolean(moduleCode) && !hasModule(moduleCode));
    });

    const loyaltyEnabled = hasModule('loyalty');
    $('points-option-card')?.classList.toggle('hidden', !loyaltyEnabled);
    $('points-modal')?.classList.toggle('hidden', !loyaltyEnabled);
    if (!loyaltyEnabled && $('pay-with-points')) {
      $('pay-with-points').checked = false;
      $('pay-with-points').disabled = true;
    }

    const shippingEnabled = hasModule('shipping');
    $('shipment-option-card')?.classList.toggle('hidden', !shippingEnabled);
    if (!shippingEnabled) {
      setShipmentRequested(false);
      removeShipmentServiceLine();
      state.shipment = emptyShipment();
    }
  }

  async function loadBillingInsights() {
    const organizationId = orgId();
    const dashboard = await request(`/invoices/sales-dashboard/?organization_id=${organizationId}&period=month`);
    $('billing-dashboard-total').textContent = formatMoney(dashboard?.total_sales || 0);
    $('billing-dashboard-count').textContent = `${Number(dashboard?.invoice_count || 0)} facturas emitidas`;

    if (hasModule('receivables')) {
      const overdue = await request(`/invoices/overdue-alerts/?organization_id=${organizationId}`);
      const count = Number(overdue?.count || 0);
      $('billing-overdue-count').textContent = String(count);
      $('billing-overdue-detail').textContent = count
        ? `${formatMoney((overdue.alerts || []).reduce((sum, item) => sum + Number(item.amount_due || 0), 0))} vencidos por cobrar.`
        : 'Sin alertas vencidas.';
    } else {
      $('billing-overdue-count').textContent = '0';
      $('billing-overdue-detail').textContent = 'Modulo de CxC no activo.';
    }
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

  function resetInvoiceForm(options = {}) {
    const { keepOrganization = true } = options;
    state.lines = [];
    state.prefillAgendaEventId = null;
    state.shipment = emptyShipment();
    state.shipmentServiceProductId = null;
    setShipmentRequested(false);
    $('document-type').value = '01';
    $('sale-condition').value = '01';
    $('payment-method').value = '01';
    $('tax-regime').value = 'simplified';
    $('installment-count').value = 3;
    $('installment-interval-days').value = 30;
    $('currency').value = 'CRC';
    $('notes').value = '';
    $('line-product-search').value = '';
    $('line-qty').value = 1;
    $('line-discount').value = 0;
    $('pay-with-points').checked = false;
    clearCustomerSelection();
    syncInstallmentsUI();
    filterProducts();
    renderLines();
    setAgendaPrefillBanner(null, false, false);
    if (!keepOrganization) {
      renderOrganizations();
    }
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
          (customer) => `<option value="${customer.id}">${escapeHtml(customer.legal_name)} (${escapeHtml(customer.tax_id || 'sin cédula')})</option>`,
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
      $('customer-meta').innerHTML = 'No hay cliente seleccionado.';
      $('customer-meta').classList.add('customer-meta-empty');
      syncPointsPaymentUI();
      syncShipmentUI();
      return;
    }

    const credit = customer.credit || null;
    const loyaltyHtml = hasModule('loyalty') && customer.loyalty?.program_name
      ? `
        <div class="customer-meta-chip">
          <span class="customer-meta-chip__label">Fidelización</span>
          <strong>${escapeHtml(customer.loyalty.program_name)}</strong>
          <small>${Number(customer.loyalty.available_points || 0)} pts disponibles</small>
        </div>
      `
      : hasModule('loyalty') ? `
        <div class="customer-meta-chip customer-meta-chip--muted">
          <span class="customer-meta-chip__label">Fidelización</span>
          <strong>Sin membresía</strong>
          <small>No hay programa activo</small>
        </div>
      ` : '';

    const creditHtml = credit
      ? `
        <div class="customer-meta-chip ${credit.approved ? 'customer-meta-chip--success' : 'customer-meta-chip--warning'}">
          <span class="customer-meta-chip__label">Crédito</span>
          <strong>${credit.approved ? 'Aprobado' : 'No aprobado'}</strong>
          <small>${credit.approved ? `Disponible CRC ${Number(credit.available || 0).toFixed(2)} de ${Number(credit.limit || 0).toFixed(2)}` : `Límite CRC ${Number(credit.limit || 0).toFixed(2)}`}</small>
          <small>${Number(credit.payment_terms_days || 0) > 0 ? `Plazo ${Number(credit.payment_terms_days)} días` : 'Sin plazo configurado'}</small>
        </div>
      `
      : '';

    const shippingHtml = customer.shipping?.printable
      ? `
        <div class="customer-meta-chip customer-meta-chip--muted">
          <span class="customer-meta-chip__label">Envío sugerido</span>
          <strong>${escapeHtml(customer.shipping.city || 'Dirección cargada')}</strong>
          <small>${escapeHtml(customer.shipping.printable)}</small>
        </div>
      `
      : '';

    $('customer-meta').innerHTML = `
      <div class="customer-meta-card">
        <div class="customer-meta-card__identity">
          <div>
            <strong class="customer-meta-card__name">${escapeHtml(customer.legal_name)}</strong>
            <p class="customer-meta-card__contact">
              <span>${escapeHtml(customer.tax_id || 'Sin cédula')}</span>
              <span>${escapeHtml(customer.email || 'Sin correo')}</span>
              <span>${escapeHtml(customer.phone || 'Sin telefono')}</span>
            </p>
          </div>
        </div>
        <div class="customer-meta-card__details">
          ${loyaltyHtml}
          ${creditHtml}
          ${shippingHtml}
        </div>
      </div>
    `;

    $('customer-meta').classList.remove('customer-meta-empty');
    syncPointsPaymentUI();
    syncShipmentUI();
  }

  async function searchCustomerByTaxId() {
    const normalized = normalizeTaxId($('customer-tax-id').value.trim());
    if (!normalized) throw new Error('Ingresa una cédula antes de buscar.');

    await loadCustomers(normalized);
    const exactMatch = state.customers.find((customer) => normalizeTaxId(customer.tax_id) === normalized);
    if (!exactMatch) {
      selectCustomer(null, false);
      throw new Error('No encontramos un cliente con esa cédula en la organización seleccionada.');
    }

    selectCustomer(exactMatch);
    setFeedback(`Cliente cargado correctamente: ${exactMatch.legal_name}.`, false, { showInline: false, showToast: false });
  }

  function clearCustomerSelection() {
    state.selectedCustomer = null;
    state.customers = [];
    state.shipment = emptyShipment();
    state.shipmentServiceProductId = null;
    setShipmentRequested(false);
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
      summary.innerHTML = '';
      return;
    }

    const chips = [
      prefill.title ? `<span class="agenda-prefill-banner__chip">${escapeHtml(prefill.title)}</span>` : '',
      prefill.startsAt ? `<span class="agenda-prefill-banner__chip">${escapeHtml(new Date(prefill.startsAt).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' }))}</span>` : '',
      `<span class="agenda-prefill-banner__chip ${customerFound ? 'is-ready' : ''}">${customerFound ? 'Cliente cargado' : 'Cliente pendiente'}</span>`,
      lineAdded ? `<span class="agenda-prefill-banner__chip is-ready">Servicio agregado</span>` : prefill.serviceId ? `<span class="agenda-prefill-banner__chip">Servicio pendiente</span>` : '',
    ].filter(Boolean);

    summary.innerHTML = chips.join('');
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
      $('line-product-meta').textContent = '';
      return;
    }

    const typeLabel = '';
    const stockLabel = product.product_type === 'service' ? 'Servicio' : `Stock ${product.stock}`;
    $('line-product-meta').textContent = `${typeLabel} · Código: ${product.sku || product.code || 'N/D'} · ${product.name} · ${stockLabel} · Precio: CRC ${Number(product.unit_price || 0).toFixed(2)}`;
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

  function findShipmentServiceProduct() {
    const shipmentMethod = state.shipment?.method || SHIPMENT_OWN_COURIER;
    const serviceProducts = state.products.filter((product) => product.product_type === 'service' && product.is_active);
    if (!serviceProducts.length) return null;

    const normalizedMethodTerms = shipmentMethod === SHIPMENT_CORREOS_CR
      ? ['correos', 'correo']
      : ['mensajeria', 'mensajería', 'envio', 'envío', 'delivery'];
    const genericTerms = ['mensajeria', 'mensajería', 'envio', 'envío', 'delivery', 'reparto', 'despacho', 'correos', 'correo'];

    const pickMatch = (terms) =>
      serviceProducts.find((product) => {
        const haystack = `${product.name || ''} ${product.sku || ''} ${product.description || ''}`.toLowerCase();
        return terms.some((term) => haystack.includes(term));
      });

    return pickMatch(normalizedMethodTerms) || pickMatch(genericTerms) || null;
  }

  function removeShipmentServiceLine() {
    state.lines = state.lines.filter((line) => !line.auto_shipment);
    state.shipmentServiceProductId = null;
  }

  function syncShipmentServiceLine() {
    removeShipmentServiceLine();
    if (!shipmentRequested()) return;

    const serviceProduct = findShipmentServiceProduct();
    if (!serviceProduct) return;
    if (state.lines.some((line) => !line.auto_shipment && Number(line.product) === Number(serviceProduct.id))) {
      state.shipmentServiceProductId = serviceProduct.id;
      return;
    }

    state.lines.push({
      product: serviceProduct.id,
      quantity: 1,
      discount_percent: 0,
      auto_shipment: true,
    });
    state.shipmentServiceProductId = serviceProduct.id;
  }

  function syncPointsPaymentUI() {
    const checkbox = $('pay-with-points');
    const help = $('points-payment-help');
    const card = $('points-option-card');
    const detailButton = $('open-points-modal');
    const confirmButton = $('confirm-points-usage');
    const customer = state.selectedCustomer;
    const availablePoints = Number(customer?.loyalty?.available_points || 0);
    const subtotal = calculateSubtotal();
    const requiredPoints = Math.round(subtotal);

    if (!hasModule('loyalty')) {
      checkbox.checked = false;
      checkbox.disabled = true;
      card.classList.add('is-disabled');
      detailButton.disabled = true;
      confirmButton.disabled = true;
      return;
    }

    $('points-customer-name').textContent = customer?.legal_name || 'Sin cliente seleccionado';
    $('points-available').textContent = `${availablePoints} pts`;
    $('points-required').textContent = `${requiredPoints || 0} pts`;
    $('points-result').textContent = 'Pendiente';
    $('points-option-status').textContent = 'Pendiente';
    $('points-option-summary').textContent = 'Selecciona un cliente y agrega lineas para validar esta opcion.';
    card.classList.remove('is-active', 'is-warning', 'is-disabled');
    detailButton.disabled = false;
    confirmButton.disabled = false;

    if (!customer?.loyalty?.program_name) {
      checkbox.checked = false;
      checkbox.disabled = true;
      card.classList.add('is-disabled');
      help.textContent = customer ? 'El cliente seleccionado no tiene membresia activa.' : 'Selecciona un cliente para validar puntos.';
      $('points-result').textContent = 'No disponible';
      $('points-option-status').textContent = 'No disponible';
      $('points-option-summary').textContent = help.textContent;
      confirmButton.disabled = true;
      return;
    }

    if (!subtotal) {
      checkbox.checked = false;
      checkbox.disabled = true;
      card.classList.add('is-disabled');
      help.textContent = `Disponible: ${availablePoints} pts. Agrega lineas para validar pago con puntos.`;
      $('points-result').textContent = 'Sin lineas';
      $('points-option-status').textContent = 'Sin lineas';
      $('points-option-summary').textContent = help.textContent;
      confirmButton.disabled = true;
      return;
    }

    const hasEnough = availablePoints >= requiredPoints;
    checkbox.disabled = !hasEnough;
    if (!hasEnough) checkbox.checked = false;
    confirmButton.disabled = !hasEnough;

    if (checkbox.checked && hasEnough) {
      card.classList.add('is-active');
      $('points-result').textContent = 'Canje aplicado';
      help.textContent = `Se descontaran ${requiredPoints} pts y esta compra no acumulara puntos nuevos.`;
      $('points-option-status').textContent = 'Canje aplicado';
      $('points-option-summary').textContent = help.textContent;
      return;
    }

    card.classList.add(hasEnough ? 'is-warning' : 'is-disabled');
    $('points-result').textContent = hasEnough ? 'Disponible para usar' : 'Saldo insuficiente';
    help.textContent = hasEnough
      ? `Disponible: ${availablePoints} pts. Requeridos aprox.: ${requiredPoints} pts.`
      : `Disponible: ${availablePoints} pts. Requiere aprox. ${requiredPoints} pts para cubrir la factura.`;
    $('points-option-status').textContent = hasEnough ? 'Disponible' : 'Saldo insuficiente';
    $('points-option-summary').textContent = hasEnough
      ? `Cliente con ${availablePoints} pts. Puedes activar esta opcion para cubrir la factura.`
      : help.textContent;
  }

  function hasShippableLines() {
    return state.lines.some((line) => {
      const product = state.products.find((item) => item.id === line.product);
      return product?.product_type === 'physical';
    });
  }

  function shipmentIsComplete() {
    if (!shipmentRequested()) return false;
    if (!hasModule('shipping')) return false;
    ensureShipmentState();
    if (!state.shipment?.recipient_name || !state.shipment?.address_line_1 || !state.shipment?.city || !state.shipment?.phone_primary) {
      return false;
    }
    if (state.shipment.recipient_name.length < 3 || state.shipment.address_line_1.length < 8 || state.shipment.city.length < 2) {
      return false;
    }
    if (state.shipment.phone_primary.replace(/\D/g, '').length < 8) {
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
    const card = $('shipment-option-card');
    if (!hasModule('shipping')) {
      setShipmentRequested(false);
      removeShipmentServiceLine();
      card?.classList.add('hidden');
      return;
    }
    const checked = shipmentRequested();
    const shippable = hasShippableLines();
    const serviceProduct = findShipmentServiceProduct();

    ensureShipmentState();
    card.classList.remove('is-active', 'is-disabled');

    if (!shippable) {
      setShipmentRequested(false);
      $('configure-shipment').disabled = true;
      $('shipment-option-status').textContent = 'No aplica';
      $('shipment-option-summary').textContent = 'Agrega productos fisicos para habilitar el envio.';
      card.classList.add('is-disabled');
      removeShipmentServiceLine();
      return;
    }

    $('configure-shipment').disabled = !checked;
    $('shipment-option-status').textContent = checked ? (shipmentIsComplete() ? 'Listo para emitir' : 'Configuracion pendiente') : 'No solicitado';
    const methodLabel = state.shipment.method === SHIPMENT_CORREOS_CR ? 'Correos de Costa Rica' : 'Mensajeria propia';
    const destination = checked
      ? [state.shipment.address_line_1, state.shipment.city].filter(Boolean).join(' · ') || 'Sin direccion configurada'
      : 'Sin direccion configurada';
    const reference = shipmentReferenceSummary(state.shipment);

    if (!checked) {
      panel.classList.add('is-disabled');
      $('shipment-help').textContent = 'Activa la solicitud de envio para capturar direccion, telefonos y referencias.';
      if (inline) inline.classList.add('is-disabled');
      if ($('shipment-inline-summary')) {
        const serviceHint = serviceProduct
          ? ` Se agregara como linea ${serviceProduct.name}.`
          : ' Si existe un servicio de mensajeria en inventario, se agregara automaticamente.';
        $('shipment-inline-summary').textContent = `Marca el check si el cliente necesita envio.${serviceHint}`;
      }
      removeShipmentServiceLine();
      return;
    }

    panel.classList.add('is-active');
    if (shipmentIsComplete()) {
      syncShipmentServiceLine();
    } else {
      removeShipmentServiceLine();
    }
    $('shipment-help').textContent = shipmentIsComplete()
      ? 'El envio esta configurado y se guardara junto con la factura.'
      : 'Completa la configuracion del envio antes de emitir la factura.';
    if ($('shipment-inline-summary')) {
      const methodLabel = state.shipment.method === SHIPMENT_CORREOS_CR ? 'Correos de Costa Rica' : 'Mensajeria propia';
      const destination = [state.shipment.city, state.shipment.state].filter(Boolean).join(', ') || 'direccion pendiente';
      const serviceLineText = serviceProduct
        ? ` Linea: ${serviceProduct.name}.`
        : ' Sin servicio de mensajeria detectado en inventario.';
      $('shipment-inline-summary').textContent = shipmentIsComplete()
        ? `Envio listo por ${methodLabel} para ${destination}.${serviceLineText}`
        : `Envio activo con datos pendientes.${serviceLineText}`;
    }
  }

  function openShipmentModal() {
    if (!hasShippableLines()) {
      syncShipmentUI();
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

  function syncShipmentUI() {
    const card = $('shipment-option-card');
    if (!hasModule('shipping')) {
      setShipmentRequested(false);
      removeShipmentServiceLine();
      card?.classList.add('hidden');
      return;
    }
    const checked = shipmentRequested();
    const shippable = hasShippableLines();
    const serviceProduct = findShipmentServiceProduct();

    ensureShipmentState();
    card.classList.remove('is-active', 'is-disabled');

    if (!shippable) {
      setShipmentRequested(false);
      $('configure-shipment').disabled = true;
      $('shipment-option-status').textContent = 'No aplica';
      $('shipment-option-summary').textContent = 'Agrega productos fisicos para habilitar el envio.';
      card.classList.add('is-disabled');
      removeShipmentServiceLine();
      return;
    }

    $('configure-shipment').disabled = !checked;

    if (!checked) {
      card.classList.add('is-disabled');
      $('shipment-option-status').textContent = 'No solicitado';
      $('shipment-option-summary').textContent = serviceProduct
        ? `Marca el check si el cliente necesita entrega. Se agregara la linea ${serviceProduct.name}.`
        : 'Marca el check si el cliente necesita entrega. Si existe un servicio de mensajeria, se agregara automaticamente.';
      removeShipmentServiceLine();
      return;
    }

    card.classList.add('is-active');
    if (shipmentIsComplete()) {
      syncShipmentServiceLine();
    } else {
      removeShipmentServiceLine();
    }

    const methodLabel = state.shipment.method === SHIPMENT_CORREOS_CR ? 'Correos de Costa Rica' : 'Mensajeria propia';
    const destination = [state.shipment.city, state.shipment.state].filter(Boolean).join(', ') || 'direccion pendiente';
    const reference = shipmentReferenceSummary(state.shipment);
    $('shipment-option-status').textContent = shipmentIsComplete() ? 'Listo para emitir' : 'Configuracion pendiente';
    $('shipment-option-summary').textContent = shipmentIsComplete()
      ? `${methodLabel} para ${destination}. Referencia: ${reference}.`
      : 'Completa destinatario, direccion, ciudad y telefono para terminar el envio.';
  }

  function openModal(modalId, focusId) {
    $(modalId).classList.add('is-open');
    $(modalId).setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    if (focusId) {
      window.setTimeout(() => $(focusId)?.focus(), 20);
    }
  }

  function closeModal(modalId) {
    $(modalId).classList.remove('is-open');
    $(modalId).setAttribute('aria-hidden', 'true');
    if (![...document.querySelectorAll('.receivable-detail-modal.is-open')].length) {
      document.body.classList.remove('modal-open');
    }
  }

  function openShipmentModal() {
    if (!hasShippableLines()) {
      syncShipmentUI();
      return;
    }
    fillShipmentForm();
    openModal('shipment-modal', 'shipment-recipient-name');
  }

  function closeShipmentModal() {
    closeModal('shipment-modal');
  }

  function openPointsModal() {
    if (!hasModule('loyalty')) return;
    syncPointsPaymentUI();
    openModal('points-modal', 'confirm-points-usage');
  }

  function closePointsModal() {
    closeModal('points-modal');
  }

  function renderLines() {
    if (shipmentRequested()) {
      if (hasShippableLines() && shipmentIsComplete()) {
        syncShipmentServiceLine();
      } else {
        removeShipmentServiceLine();
      }
    } else {
      removeShipmentServiceLine();
    }

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
    if (!hasModule('loyalty')) {
      $('pay-with-points').checked = false;
      return;
    }
    if ($('pay-with-points').checked) {
      $('payment-method').value = '03';
      syncInstallmentsUI();
    }
    syncPointsPaymentUI();
  });

  function handleShipmentToggleChange(checked) {
    if (checked && !hasModule('shipping')) {
      setShipmentRequested(false);
      setFeedback('El modulo de envios no esta activo para esta organizacion.', true);
      return;
    }
    setShipmentRequested(checked);
    if (checked) {
      ensureShipmentState();
      syncShipmentUI();
      openShipmentModal();
      return;
    }
    renderLines();
  }

  $('requires-shipment').addEventListener('change', () => {
    handleShipmentToggleChange($('requires-shipment').checked);
  });

  $('configure-shipment').addEventListener('click', openShipmentModal);
  $('open-points-modal').addEventListener('click', openPointsModal);
  $('shipment-method').addEventListener('change', syncShipmentMethodFields);
  $('close-shipment-modal').addEventListener('click', closeShipmentModal);
  $('cancel-shipment-modal').addEventListener('click', closeShipmentModal);
  $('close-points-modal').addEventListener('click', closePointsModal);
  $('cancel-points-usage').addEventListener('click', closePointsModal);
  $('confirm-points-usage').addEventListener('click', () => {
    if ($('pay-with-points').disabled) {
      closePointsModal();
      return;
    }
    $('pay-with-points').checked = true;
    $('payment-method').value = '03';
    syncInstallmentsUI();
    syncPointsPaymentUI();
    closePointsModal();
  });
  $('shipment-modal').addEventListener('click', (event) => {
    if (event.target === $('shipment-modal')) closeShipmentModal();
  });
  $('points-modal').addEventListener('click', (event) => {
    if (event.target === $('points-modal')) closePointsModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && $('shipment-modal').classList.contains('is-open')) {
      closeShipmentModal();
    } else if (event.key === 'Escape' && $('points-modal').classList.contains('is-open')) {
      closePointsModal();
    }
  });

  $('shipment-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const shipment = readShipmentForm();

    if (!shipment.recipient_name || !shipment.address_line_1 || !shipment.city || !shipment.phone_primary) {
      setFeedback('Completa persona que recibe, direccion principal, ciudad y telefono principal para guardar el envio.', true);
      return;
    }
    if (shipment.recipient_name.length < 3) {
      setFeedback('La persona que recibe debe tener al menos 3 caracteres.', true);
      return;
    }
    if (shipment.address_line_1.length < 8) {
      setFeedback('La direccion principal debe ser mas especifica.', true);
      return;
    }
    if (shipment.phone_primary.replace(/\D/g, '').length < 8) {
      setFeedback('El telefono principal debe tener al menos 8 digitos.', true);
      return;
    }
    if (shipment.method === SHIPMENT_CORREOS_CR && !shipment.correos_branch) {
      setFeedback('Para Correos de Costa Rica indica la sucursal u oficina de referencia.', true);
      return;
    }

    state.shipment = shipment;
    renderLines();
    closeShipmentModal();
    $('feedback').textContent = '';
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

      if (shipmentRequested()) {
        if (!hasModule('shipping')) {
          setShipmentRequested(false);
          return setFeedback('El modulo de envios no esta activo para esta organizacion.', true);
        }
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
        use_loyalty_points: hasModule('loyalty') && $('pay-with-points').checked,
        shipment_required: shipmentRequested(),
        shipment_details: shipmentRequested() ? state.shipment : {},
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
      setFeedback(`Factura emitida: ${invoice.invoice_number}.${loyaltyMsg}${receivableMsg}`, false, {
        showInline: false,
        showToast: true,
      });

      resetInvoiceForm();
      await loadProducts();
      await loadBillingInsights();
    } catch (error) {
      setFeedback(error.message || 'No se pudo insertar la factura.', true);
    }
  });

  syncInstallmentsUI();
  renderOrganizations();
  syncModuleVisibility();
  resetInvoiceForm();

  $('organization-id').addEventListener('change', () => {
    window.AppSession?.setActiveOrganizationId?.($('organization-id').value);
    syncModuleVisibility();
    clearCustomerSelection();
    Promise.all([loadProducts(), loadCustomers(), loadBillingInsights()]).catch((error) => setFeedback(error.message, true));
  });

  Promise.all([loadProducts(), loadCustomers(), loadBillingInsights()])
    .then(() => {
      resetInvoiceForm();
      return applyBillingPrefill();
    })
    .catch((error) => setFeedback(error.message, true));
})();
