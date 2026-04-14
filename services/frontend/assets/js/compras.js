(function initCompras() {
  const $ = (id) => document.getElementById(id);
  const state = { lines: [], purchases: [] };
  const padronTimers = {};

  function orgId() {
    const id = Number($('organization-id').value || window.AppSession?.getActiveOrganizationId?.());
    if (!id || id < 1) throw new Error('No hay organización activa.');
    return id;
  }

  async function request(path, options) {
    const response = await fetch(`/api${path}`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      credentials: 'include',
      ...options,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(text || 'Error de API');
    return text ? JSON.parse(text) : null;
  }

  function setFeedback(message, isError = false) {
    $('feedback').textContent = message;
    $('feedback').style.color = isError ? '#ff7d7d' : 'var(--muted)';
  }

  function currencySymbol(code) {
    return code === 'USD' ? '$' : 'CRC ';
  }

  function formatMoney(amount, currency = 'CRC') {
    const numeric = Number(amount || 0);
    if (!Number.isFinite(numeric)) return `${currencySymbol(currency)}0.00`;
    return `${currencySymbol(currency)}${numeric.toFixed(2)}`;
  }

  async function syncNameFromPadron(taxInputId, nameInputId, actorLabel) {
    if (!window.CedulaPadron) {
      return;
    }

    const taxId = $(taxInputId).value.trim();
    if (!taxId) return;
    const normalizedTaxId = window.CedulaPadron.normalizeCedula(taxId);
    if (normalizedTaxId.length < 9) return;

    const record = await window.CedulaPadron.resolveByCedula(taxId);
    if (!record) {
      setFeedback(`La cédula de ${actorLabel} (${taxId}) no existe en el padrón electoral.`, true);
      return;
    }

    const nameInput = $(nameInputId);
    if (!nameInput.value.trim()) {
      nameInput.value = record.fullName;
      setFeedback(`Nombre de ${actorLabel} autocompletado desde padrón.`);
      return;
    }

    const isSameName = window.CedulaPadron.compareName(nameInput.value, record);
    if (isSameName === false) {
      setFeedback(`La cédula de ${actorLabel} corresponde a "${record.fullName}". Verifica el nombre digitado.`, true);
    }
  }

  function renderOrganizations() {
    const organizations = window.AppSession?.getOrganizations?.() || [];
    const activeId = Number(window.AppSession?.getActiveOrganizationId?.());
    $('organization-id').innerHTML = organizations.map((org) => `<option value="${org.id}">${org.name}</option>`).join('');
    if (activeId) $('organization-id').value = String(activeId);
  }

  function renderLines() {
    let total = 0;
    $('lines-body').innerHTML = state.lines.map((line, idx) => {
      const subtotal = Number(line.quantity) * Number(line.unit_price);
      total += subtotal;
      return `<tr><td>${line.description}</td><td>${line.quantity}</td><td>${line.unit_price}</td><td>${subtotal.toFixed(2)}</td><td><button class="btn btn-secondary" data-rm="${idx}">Quitar</button></td></tr>`;
    }).join('') || '<tr><td colspan="5">Sin líneas</td></tr>';
    $('purchase-total').textContent = `Subtotal compra: ₡${total.toFixed(2)}`;
  }

  async function loadPurchases() {
    const purchases = await request(`/purchases/?organization_id=${orgId()}`);
    state.purchases = purchases;
    $('purchases-body').innerHTML = purchases.map((item) => {
      const currency = item.currency || 'CRC';
      return `<tr><td>${item.issue_date}</td><td>${item.supplier_name}</td><td>${item.invoice_number}</td><td>${formatMoney(item.subtotal, currency)}</td><td>${formatMoney(item.tax_total, currency)}</td><td>${formatMoney(item.total, currency)}</td></tr>`;
    }).join('') || '<tr><td colspan="6">Sin compras registradas.</td></tr>';
    setFeedback(`Mostrando ${purchases.length} compra(s).`);
  }

  $('add-line').addEventListener('click', () => {
    const description = $('line-description').value.trim();
    const unit_price = Number($('line-unit-price').value);
    const quantity = Number($('line-qty').value || 1);
    if (!description) return setFeedback('Ingresa la descripción del producto/servicio.', true);
    if (!Number.isFinite(unit_price) || unit_price <= 0) return setFeedback('Precio unitario inválido.', true);
    if (!Number.isFinite(quantity) || quantity <= 0) return setFeedback('Cantidad inválida.', true);
    state.lines.push({ description, unit_price, quantity });
    $('line-description').value = '';
    $('line-unit-price').value = '';
    $('line-qty').value = '1';
    renderLines();
  });

  $('lines-body').addEventListener('click', (event) => {
    const idx = event.target.dataset.rm;
    if (idx === undefined) return;
    state.lines.splice(Number(idx), 1);
    renderLines();
  });

  $('purchase-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await syncNameFromPadron('supplier-tax-id', 'supplier-name', 'proveedor');
      await syncNameFromPadron('buyer-tax-id', 'buyer-name', 'comprador');
      if (!state.lines.length) return setFeedback('Debe agregar al menos una línea de compra.', true);
      const numericKey = $('numeric-key').value.trim();
      if (!/^\d{50}$/.test(numericKey)) return setFeedback('La clave numérica debe tener exactamente 50 dígitos.', true);
      const payload = {
        organization: orgId(),
        supplier_name: $('supplier-name').value.trim(),
        supplier_tax_id: $('supplier-tax-id').value.trim(),
        buyer_name: $('buyer-name').value.trim(),
        buyer_tax_id: $('buyer-tax-id').value.trim(),
        issue_date: $('issue-date').value,
        invoice_number: $('invoice-number').value.trim(),
        numeric_key: numericKey,
        tax_total: Number($('tax-total').value || 0),
        items: state.lines,
      };
      await request('/purchases/', { method: 'POST', body: JSON.stringify(payload) });
      state.lines = [];
      renderLines();
      $('purchase-form').reset();
      renderOrganizations();
      $('issue-date').valueAsDate = new Date();
      await loadPurchases();
      setFeedback('Compra registrada correctamente.');
    } catch (error) {
      setFeedback(error.message, true);
    }
  });

  $('organization-id').addEventListener('change', () => {
    window.AppSession?.setActiveOrganizationId?.($('organization-id').value);
    loadPurchases().catch((error) => setFeedback(error.message, true));
  });

  renderOrganizations();
  renderLines();
  $('supplier-tax-id').addEventListener('blur', () => syncNameFromPadron('supplier-tax-id', 'supplier-name', 'proveedor').catch(() => null));
  $('buyer-tax-id').addEventListener('blur', () => syncNameFromPadron('buyer-tax-id', 'buyer-name', 'comprador').catch(() => null));
  $('supplier-tax-id').addEventListener('input', () => {
    if (padronTimers.supplier) clearTimeout(padronTimers.supplier);
    padronTimers.supplier = setTimeout(() => {
      syncNameFromPadron('supplier-tax-id', 'supplier-name', 'proveedor').catch(() => null);
    }, 250);
  });
  $('buyer-tax-id').addEventListener('input', () => {
    if (padronTimers.buyer) clearTimeout(padronTimers.buyer);
    padronTimers.buyer = setTimeout(() => {
      syncNameFromPadron('buyer-tax-id', 'buyer-name', 'comprador').catch(() => null);
    }, 250);
  });
  $('issue-date').valueAsDate = new Date();
  loadPurchases().catch((error) => setFeedback(error.message, true));
})();
