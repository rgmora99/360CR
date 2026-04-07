(function initFacturacion() {
  const $ = (id) => document.getElementById(id);
  const state = { customers: [], products: [], lines: [] };

  const apiBase = () => '/api';
  const orgId = () => Number($('organization-id').value || window.AppSession?.getActiveOrganizationId?.());
  const logPrefix = '[Facturacion API]';

  async function request(path, options) {
    const url = `${apiBase()}${path}`;
    const method = options?.method || 'GET';
    const payload = options?.body;
    console.info(`${logPrefix} ${method} ${url}`, payload ? { body: payload } : '');
    const response = await fetch(url, { headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, credentials: 'include', ...options });
    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    console.info(`${logPrefix} ${method} ${url} -> ${response.status}`, { contentType, bodyPreview: text.slice(0, 180) });
    if (!response.ok) throw new Error(text || 'Error de API');
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Respuesta no JSON. Revise la configuración del backend/proxy.');
    }
  }

  function setFeedback(msg, error) {
    $('feedback').textContent = msg;
    $('feedback').style.color = error ? '#ff6b6b' : 'var(--muted)';
    if (window.appAlerts?.toast) {
      window.appAlerts.toast(msg, error ? 'error' : 'success');
    }
  }

  function syncInstallmentsUI() {
    const isInstallments = $('payment-method').value === '04';
    $('installments-count-wrap').classList.toggle('hidden', !isInstallments);
    $('installments-interval-wrap').classList.toggle('hidden', !isInstallments);
  }

  async function loadCustomers(term = '') {
    const data = await request(`/invoices/customer-autocomplete/?organization_id=${orgId()}&q=${encodeURIComponent(term)}`);
    state.customers = data;
    $('customer-select').innerHTML =
      data.map((c) => `<option value="${c.id}">${c.legal_name} (${c.tax_id || 'sin cédula'})</option>`).join('') ||
      '<option value="">Sin clientes activos</option>';
    updateCustomerMeta();
  }

  function updateCustomerMeta() {
    const customer = state.customers.find((c) => c.id === Number($('customer-select').value));
    $('customer-meta').textContent = customer ? `${customer.email || 'sin correo'} · ${customer.phone || 'sin teléfono'}` : '';
  }

  async function loadProducts() {
    const data = await request(`/products/?organization_id=${orgId()}`);
    state.products = data.filter((p) => p.is_active);
    $('line-product').innerHTML =
      state.products
        .map((p) => `<option value='${p.id}'>${p.name} (${p.product_type === 'service' ? 'Servicio' : `Stock: ${p.stock}`}) - ₡${p.unit_price}</option>`)
        .join('') ||
      '<option value="">No hay productos. Cree inventario primero.</option>';
  }

  function renderLines() {
    let subtotal = 0;
    $('lines-body').innerHTML =
      state.lines
        .map((line, idx) => {
          const p = state.products.find((it) => it.id === line.product);
          if (!p) return '';
          const lineSubtotal = Number(line.quantity) * Number(p.unit_price);
          subtotal += lineSubtotal;
          return `<tr><td>${p.name}</td><td>${line.quantity}</td><td>${line.discount_percent}</td><td>${lineSubtotal.toFixed(2)}</td><td><button class='btn btn-secondary' data-rm='${idx}'>Quitar</button></td></tr>`;
        })
        .join('') || '<tr><td colspan="5">Sin líneas</td></tr>';
    $('totals').textContent = `Subtotal aproximado: ${subtotal.toFixed(2)} CRC`;
  }

  $('search-customer').addEventListener('click', () => loadCustomers($('customer-search').value).catch((e) => setFeedback(e.message, true)));
  $('customer-select').addEventListener('change', updateCustomerMeta);
  $('payment-method').addEventListener('change', syncInstallmentsUI);

  $('add-line').addEventListener('click', () => {
    const product = Number($('line-product').value);
    const quantity = Number($('line-qty').value);
    const discount_percent = Number($('line-discount').value);
    if (!product || quantity <= 0 || discount_percent < 0 || discount_percent > 100) return setFeedback('Línea inválida.', true);
    state.lines.push({ product, quantity, discount_percent });
    renderLines();
  });

  $('lines-body').addEventListener('click', (e) => {
    const idx = e.target.dataset.rm;
    if (idx === undefined) return;
    state.lines.splice(Number(idx), 1);
    renderLines();
  });

  $('invoice-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      if (!state.lines.length) return setFeedback('Debe agregar líneas a la factura.', true);
      const customerId = Number($('customer-select').value);
      if (!customerId) return setFeedback('Seleccione un cliente válido.', true);

      const paymentMethod = $('payment-method').value;
      const installmentCount = Number($('installment-count').value || 1);
      const installmentIntervalDays = Number($('installment-interval-days').value || 30);
      if (paymentMethod === '04' && installmentCount < 2) return setFeedback('Para pago a plazos use al menos 2 cuotas.', true);

      const payload = {
        organization: orgId(),
        customer: customerId,
        document_type: $('document-type').value,
        sale_condition: $('sale-condition').value,
        payment_method: paymentMethod,
        tax_regime: $('tax-regime').value,
        installment_count: paymentMethod === '04' ? installmentCount : 1,
        installment_interval_days: paymentMethod === '04' ? installmentIntervalDays : 30,
        currency: $('currency').value.toUpperCase(),
        exchange_rate: 1,
        notes: $('notes').value,
        items: state.lines,
      };

      const invoice = await request('/invoices/', { method: 'POST', body: JSON.stringify(payload) });
      setFeedback(`Factura emitida: ${invoice.invoice_number}. Puede verla en "Ver facturas emitidas".`);
      state.lines = [];
      renderLines();
      await loadProducts();
    } catch (err) {
      setFeedback(err.message || 'No se pudo insertar la factura.', true);
    }
  });

  syncInstallmentsUI();
  $('organization-id').value = window.AppSession?.getActiveOrganizationId?.() || $('organization-id').value;
  $('organization-id').addEventListener('change', () => localStorage.setItem('activeOrganizationId', $('organization-id').value));
  Promise.all([loadCustomers(), loadProducts()]).catch((e) => setFeedback(e.message, true));
})();
