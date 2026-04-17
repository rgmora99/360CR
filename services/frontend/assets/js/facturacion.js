(function initFacturacion() {
  const $ = (id) => document.getElementById(id);
  const state = {
    customers: [],
    products: [],
    filteredProducts: [],
    lines: [],
    organizations: [],
    selectedCustomer: null,
    prefillAgendaEventId: null,
  };
  const BILLING_PREFILL_KEY = 'cr360.billing.prefill';

  const apiBase = () => '/api';
  const orgId = () => {
    const id = Number($('organization-id').value || window.AppSession?.getActiveOrganizationId?.());
    if (!id || id < 1) {
      throw new Error('No hay organización activa. Selecciona una organización válida.');
    }
    return id;
  };
  const logPrefix = '[Facturacion API]';

  async function request(path, options) {
    const url = `${apiBase()}${path}`;
    const method = options?.method || 'GET';
    const payload = options?.body;
    console.info(`${logPrefix} ${method} ${url}`, payload ? { body: payload } : '');
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      credentials: 'include',
      ...options,
    });
    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    console.info(`${logPrefix} ${method} ${url} -> ${response.status}`, { contentType, bodyPreview: text.slice(0, 180) });
    if (!response.ok) throw new Error(text || 'Error de API');
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_error) {
      throw new Error('Respuesta no JSON. Revise la configuración del backend/proxy.');
    }
  }

  function normalizeTaxId(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function setFeedback(msg, error) {
    $('feedback').textContent = msg;
    $('feedback').style.color = error ? '#ff6b6b' : 'var(--muted)';
    if (window.appAlerts?.toast) {
      window.appAlerts.toast(msg, error ? 'error' : 'success');
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

  function setAgendaPrefillBanner(prefill, customerFound, lineAdded) {
    const banner = $('agenda-prefill-banner');
    const summary = $('agenda-prefill-summary');
    if (!banner || !summary) {
      return;
    }
    if (!prefill?.eventId) {
      banner.classList.add('hidden');
      summary.textContent = 'Se completarán automáticamente los datos disponibles de la cita.';
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

  function syncInstallmentsUI() {
    const isInstallments = $('payment-method').value === '04';
    $('installments-count-wrap').classList.toggle('hidden', !isInstallments);
    $('installments-interval-wrap').classList.toggle('hidden', !isInstallments);
  }

  function renderOrganizations() {
    state.organizations = window.AppSession?.getOrganizations?.() || [];
    const activeId = Number(window.AppSession?.getActiveOrganizationId?.());
    $('organization-id').innerHTML =
      state.organizations.map((org) => `<option value="${org.id}">${org.name}</option>`).join('') || '<option value="">Sin organizaciones</option>';
    if (activeId && state.organizations.some((org) => org.id === activeId)) {
      $('organization-id').value = String(activeId);
    }
  }

  function renderCustomerSelect() {
    const select = $('customer-select');
    const wrap = $('customer-select-wrap');
    const currentId = Number(state.selectedCustomer?.id || 0);

    select.innerHTML = ['<option value="">Selecciona un cliente</option>']
      .concat(
        state.customers.map(
          (customer) =>
            `<option value="${customer.id}">${escapeHtml(customer.legal_name)} (${escapeHtml(customer.tax_id || 'sin cédula')})</option>`,
        ),
      )
      .join('');

    if (currentId && state.customers.some((customer) => customer.id === currentId)) {
      select.value = String(currentId);
    } else {
      select.value = '';
    }

    wrap.classList.toggle('hidden', state.customers.length <= 1);
  }

  async function loadCustomers(term = '') {
    const query = String(term || '').trim();
    const data = await request(`/invoices/customer-autocomplete/?organization_id=${orgId()}&q=${encodeURIComponent(query)}`);
    state.customers = Array.isArray(data) ? data : [];
    renderCustomerSelect();
    updateCustomerMeta();
  }

  function selectCustomer(customer, syncInput = true) {
    state.selectedCustomer = customer || null;
    $('customer-select').value = customer ? String(customer.id) : '';
    if (syncInput) {
      $('customer-tax-id').value = customer?.tax_id || '';
    }
    updateCustomerMeta();
  }

  function updateCustomerMeta() {
    const customer = state.selectedCustomer || state.customers.find((item) => item.id === Number($('customer-select').value)) || null;
    state.selectedCustomer = customer;

    if (!customer) {
      $('customer-meta').textContent = 'No hay cliente seleccionado.';
      $('customer-meta').classList.add('customer-meta-empty');
      syncPointsPaymentUI();
      return;
    }

    const loyaltyText = customer.loyalty?.program_name
      ? ` · Fidelización: ${customer.loyalty.program_name} (${customer.loyalty.available_points} pts)`
      : ' · Sin membresía de fidelización';
    $('customer-meta').textContent = `${customer.legal_name} · Cédula: ${customer.tax_id || 'sin cédula'} · ${customer.email || 'sin correo'} · ${customer.phone || 'sin teléfono'}${loyaltyText}`;
    $('customer-meta').classList.remove('customer-meta-empty');
    syncPointsPaymentUI();
  }

  async function searchCustomerByTaxId() {
    const rawValue = $('customer-tax-id').value.trim();
    const normalized = normalizeTaxId(rawValue);
    if (!normalized) {
      throw new Error('Ingresa una cédula antes de buscar.');
    }

    await loadCustomers(normalized);
    const exactMatch = state.customers.find((customer) => normalizeTaxId(customer.tax_id) === normalized);

    if (!exactMatch) {
      selectCustomer(null, false);
      throw new Error('No encontramos un cliente con esa cédula en la organización seleccionada.');
    }

    selectCustomer(exactMatch);
    setFeedback(`Cliente cargado correctamente: ${exactMatch.legal_name}.`, false);
  }

  function clearCustomerSelection() {
    state.selectedCustomer = null;
    state.customers = [];
    $('customer-tax-id').value = '';
    $('customer-select').innerHTML = '<option value="">Selecciona un cliente</option>';
    $('customer-select-wrap').classList.add('hidden');
    updateCustomerMeta();
  }

  function ensurePrefillLine(productId) {
    const parsedId = Number(productId);
    if (!parsedId || state.lines.some((line) => Number(line.product) === parsedId)) {
      return false;
    }
    const productDetail = state.products.find((item) => item.id === parsedId);
    if (!productDetail) {
      return false;
    }
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

    const parts = [];
    if (customerFound) parts.push('cliente');
    if (lineAdded) parts.push('servicio');
    else if (prefill.serviceId) parts.push('servicio pendiente de validar manualmente');
    parts.push('notas');

    setAgendaPrefillBanner(prefill, customerFound, lineAdded);
    setFeedback(`Datos precargados desde Agenda: ${parts.join(', ')}.`, false);
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
    state.products = data.filter((product) => product.is_active);
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
    const stockLabel = product.product_type === 'service' ? 'Disponible para agenda/facturación' : `Stock actual: ${product.stock}`;
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
      help.textContent = customer ? 'El cliente seleccionado no tiene membresía activa.' : 'Selecciona un cliente para validar puntos.';
      $('points-result').textContent = 'No disponible';
      return;
    }

    if (!subtotal) {
      checkbox.checked = false;
      checkbox.disabled = true;
      panel.classList.add('is-disabled');
      help.textContent = `Disponible: ${availablePoints} pts. Agrega líneas para validar pago con puntos.`;
      $('points-result').textContent = 'Sin líneas';
      return;
    }

    const hasEnough = availablePoints >= requiredPoints;
    checkbox.disabled = !hasEnough;
    if (!hasEnough) checkbox.checked = false;
    if (checkbox.checked && hasEnough) {
      panel.classList.add('is-active');
      $('points-result').textContent = 'Canje aplicado';
      help.textContent = `Se descontarán ${requiredPoints} pts y esta compra no acumulará puntos nuevos.`;
      return;
    }

    panel.classList.add(hasEnough ? 'is-warning' : 'is-disabled');
    $('points-result').textContent = hasEnough ? 'Disponible para usar' : 'Saldo insuficiente';
    help.textContent = hasEnough
      ? `Disponible: ${availablePoints} pts. Requeridos aprox.: ${requiredPoints} pts.`
      : `Disponible: ${availablePoints} pts. Requiere aprox. ${requiredPoints} pts para cubrir la factura.`;
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
        .join('') || '<tr><td colspan="5">Sin líneas</td></tr>';

    $('totals').textContent = `Subtotal aproximado: ${subtotal.toFixed(2)} CRC`;
    syncPointsPaymentUI();
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
    setFeedback('Cliente limpiado. Puedes buscar otra cédula.', false);
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

  $('payment-method').addEventListener('change', syncInstallmentsUI);

  $('pay-with-points').addEventListener('change', () => {
    if ($('pay-with-points').checked) {
      $('payment-method').value = '03';
      syncInstallmentsUI();
    }
  });

  $('line-product-search').addEventListener('input', filterProducts);
  $('line-product').addEventListener('change', updateSelectedProductMeta);

  $('add-line').addEventListener('click', () => {
    const product = Number($('line-product').value);
    const quantity = Number($('line-qty').value);
    const discountPercent = Number($('line-discount').value);
    const productDetail = state.products.find((item) => item.id === product);

    if (!product || !productDetail) return setFeedback('Selecciona un producto válido.', true);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999999) return setFeedback('Cantidad inválida.', true);
    if (productDetail.product_type === 'physical' && !Number.isInteger(quantity)) {
      return setFeedback('Los productos físicos deben usar cantidad entera.', true);
    }
    if (productDetail.product_type === 'physical' && quantity > Number(productDetail.stock || 0)) {
      return setFeedback(`Stock insuficiente para ${productDetail.name}.`, true);
    }
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      return setFeedback('El descuento debe estar entre 0 y 100.', true);
    }

    state.lines.push({ product, quantity, discount_percent: discountPercent });
    renderLines();
    setFeedback(`Línea agregada: ${productDetail.name}.`, false);
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
      if (!state.lines.length) return setFeedback('Debe agregar líneas a la factura.', true);

      const customerId = Number(state.selectedCustomer?.id || $('customer-select').value);
      if (!customerId) return setFeedback('Busca y selecciona un cliente válido antes de facturar.', true);

      const paymentMethod = $('payment-method').value;
      const installmentCount = Number($('installment-count').value || 1);
      const installmentIntervalDays = Number($('installment-interval-days').value || 30);
      if (paymentMethod === '04' && installmentCount < 2) return setFeedback('Para pago a plazos usa al menos 2 cuotas.', true);
      if (paymentMethod === '04' && $('sale-condition').value !== '02') {
        return setFeedback('Para pago a plazos debes seleccionar condición de venta: Crédito.', true);
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
        installment_count: paymentMethod === '04' ? installmentCount : 1,
        installment_interval_days: paymentMethod === '04' ? installmentIntervalDays : 30,
        currency,
        exchange_rate: 1,
        notes: $('notes').value.trim(),
        items: buildPayloadLines(),
        use_loyalty_points: $('pay-with-points').checked,
      };

      const invoice = await request('/invoices/', { method: 'POST', body: JSON.stringify(payload) });
      const awarded = Number(invoice.loyalty_awarded_points || 0);
      const redeemed = Number(invoice.loyalty_redeemed_points || 0);
      const loyaltyMsg = redeemed
        ? ` Se cobraron ${redeemed} puntos de fidelización y la compra no acumuló puntos nuevos.`
        : awarded
          ? ` Se acreditaron ${awarded} puntos al cliente.`
          : '';

      setFeedback(`Factura emitida: ${invoice.invoice_number}. Puede verla en "Ver facturas emitidas".${loyaltyMsg}`, false);
      state.lines = [];
      state.prefillAgendaEventId = null;
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
