(function initFacturacion() {
  const $ = (id) => document.getElementById(id);
  const state = { customers: [], products: [], lines: [], invoices: [] };

  const apiBase = () => ($('api-base').value.trim() || '/api').replace(/\/$/, '');
  const orgId = () => Number($('organization-id').value);

  async function request(path, options) {
    const response = await fetch(`${apiBase()}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
    const text = await response.text();
    if (!response.ok) throw new Error(text || 'Error de API');
    return text ? JSON.parse(text) : null;
  }

  function setFeedback(msg, error) { $('feedback').textContent = msg; $('feedback').style.color = error ? '#ff6b6b' : 'var(--muted)'; }

  async function loadCustomers(term = '') {
    const data = await request(`/invoices/customer-autocomplete/?organization_id=${orgId()}&q=${encodeURIComponent(term)}`);
    state.customers = data;
    $('customer-select').innerHTML = data.map((c) => `<option value="${c.id}">${c.legal_name} (${c.tax_id || 'sin cédula'})</option>`).join('');
    updateCustomerMeta();
  }

  function updateCustomerMeta() {
    const customer = state.customers.find((c) => c.id === Number($('customer-select').value));
    $('customer-meta').textContent = customer ? `${customer.email || 'sin correo'} · ${customer.phone || 'sin teléfono'}` : '';
  }

  async function loadProducts() {
    const data = await request(`/products/?organization_id=${orgId()}`);
    state.products = data;
    $('products-body').innerHTML = data.map((p) => `<tr><td>${p.sku}</td><td>${p.name}</td><td>${p.unit_price}</td><td>${p.stock}</td><td><button class='btn btn-secondary' data-edit='${p.id}'>Editar</button> <button class='btn btn-secondary' data-delete='${p.id}'>Eliminar</button></td></tr>`).join('') || '<tr><td colspan="5">Sin productos</td></tr>';
    $('line-product').innerHTML = data.filter((p) => p.is_active).map((p) => `<option value='${p.id}'>${p.name} (${p.stock})</option>`).join('');
  }

  async function loadInvoices() {
    const data = await request(`/invoices/?organization_id=${orgId()}`);
    state.invoices = data;
    $('invoices-body').innerHTML = data.map((i) => `<tr><td>${i.invoice_number}</td><td>${i.customer_name}</td><td>${i.total}</td><td><a class='btn btn-secondary' href='${apiBase()}/invoices/${i.id}/pdf/' target='_blank'>PDF</a> <button class='btn btn-secondary' data-mail='${i.id}'>Correo</button></td></tr>`).join('') || '<tr><td colspan="4">Sin facturas</td></tr>';
  }

  function renderLines() {
    let subtotal = 0;
    $('lines-body').innerHTML = state.lines.map((line, idx) => {
      const p = state.products.find((it) => it.id === line.product);
      const lineSubtotal = Number(line.quantity) * Number(p.unit_price);
      subtotal += lineSubtotal;
      return `<tr><td>${p.name}</td><td>${line.quantity}</td><td>${line.discount_percent}</td><td>${lineSubtotal.toFixed(2)}</td><td><button class='btn btn-secondary' data-rm='${idx}'>Quitar</button></td></tr>`;
    }).join('') || '<tr><td colspan="5">Sin líneas</td></tr>';
    $('totals').textContent = `Subtotal aproximado: ${subtotal.toFixed(2)} CRC`;
  }

  $('search-customer').addEventListener('click', () => loadCustomers($('customer-search').value).catch((e) => setFeedback(e.message, true)));
  $('customer-select').addEventListener('change', updateCustomerMeta);

  $('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('product-id').value;
    const payload = { organization: orgId(), sku: $('sku').value.trim(), name: $('product-name').value.trim(), unit_price: Number($('unit-price').value), tax_rate: Number($('tax-rate').value), stock: Number($('stock').value), is_active: true };
    if (!payload.sku || !payload.name) return setFeedback('SKU y nombre son requeridos.', true);
    await request(id ? `/products/${id}/` : '/products/', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    $('product-form').reset(); $('product-id').value = ''; $('tax-rate').value = 13; $('stock').value = 0;
    await loadProducts();
    setFeedback('Producto guardado.');
  });

  $('products-body').addEventListener('click', async (e) => {
    const editId = e.target.dataset.edit;
    const delId = e.target.dataset.delete;
    if (editId) {
      const p = state.products.find((it) => it.id === Number(editId));
      $('product-id').value = p.id; $('sku').value = p.sku; $('product-name').value = p.name; $('unit-price').value = p.unit_price; $('tax-rate').value = p.tax_rate; $('stock').value = p.stock;
    }
    if (delId) {
      await request(`/products/${delId}/`, { method: 'DELETE' });
      await loadProducts();
      setFeedback('Producto eliminado.');
    }
  });

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
    const payload = {
      organization: orgId(),
      customer: Number($('customer-select').value),
      document_type: $('document-type').value,
      sale_condition: $('sale-condition').value,
      payment_method: $('payment-method').value,
      currency: $('currency').value.toUpperCase(),
      exchange_rate: 1,
      notes: $('notes').value,
      items: state.lines,
    };
    const invoice = await request('/invoices/', { method: 'POST', body: JSON.stringify(payload) });
    setFeedback(`Factura emitida: ${invoice.invoice_number}`);
    state.lines = [];
    renderLines();
    await loadProducts();
    await loadInvoices();
  });

  $('invoices-body').addEventListener('click', async (e) => {
    const id = e.target.dataset.mail;
    if (!id) return;
    await request(`/invoices/${id}/send-email/`, { method: 'POST' });
    setFeedback('Correo enviado al cliente.');
    await loadInvoices();
  });

  Promise.all([loadCustomers(), loadProducts(), loadInvoices()]).catch((e) => setFeedback(e.message, true));
})();
