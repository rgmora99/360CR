(function initFacturacion() {
  const $ = (id) => document.getElementById(id);
  const state = { customers: [], products: [], lines: [] };

  const apiBase = () => ($('api-base').value.trim() || '/api').replace(/\/$/, '');
  const orgId = () => Number($('organization-id').value);

  async function request(path, options) {
    const response = await fetch(`${apiBase()}${path}`, { headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, ...options });
    const text = await response.text();
    if (!response.ok) throw new Error(text || 'Error de API');
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Respuesta no JSON. Configure API base como http://localhost:8000/api');
    }
  }

  function setFeedback(msg, error) {
    $('feedback').textContent = msg;
    $('feedback').style.color = error ? '#ff6b6b' : 'var(--muted)';
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
      state.products.map((p) => `<option value='${p.id}'>${p.name} (${p.stock}) - ₡${p.unit_price}</option>`).join('') ||
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
    if (!state.lines.length) return setFeedback('Debe agregar líneas a la factura.', true);
    const customerId = Number($('customer-select').value);
    if (!customerId) return setFeedback('Seleccione un cliente válido.', true);

    const payload = {
      organization: orgId(),
      customer: customerId,
      document_type: $('document-type').value,
      sale_condition: $('sale-condition').value,
      payment_method: $('payment-method').value,
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
  });

  Promise.all([loadCustomers(), loadProducts()]).catch((e) => setFeedback(e.message, true));
})();
