(function initCompras() {
  const $ = (id) => document.getElementById(id);
  const state = { lines: [], purchases: [] };
  const padronTimers = {};
  const pageView = document.querySelector('.dashboard-layout')?.dataset.purchasesView || 'register';
  const purchaseSearchInput = $('purchase-search');
  const purchaseDateFromInput = $('purchase-date-from');
  const purchaseDateToInput = $('purchase-date-to');
  const purchaseDetailModal = $('purchase-detail-modal');
  const purchaseDetailTitle = $('purchase-detail-title');
  const purchaseDetailSubtitle = $('purchase-detail-subtitle');
  const purchaseDetailMeta = $('purchase-detail-meta');
  const purchaseDetailExtra = $('purchase-detail-extra');
  const purchaseDetailLines = $('purchase-detail-lines');
  const purchaseDetailDocument = $('purchase-detail-document');
  const purchasesPager = window.TablePaginator?.create({
    key: 'purchases',
    tableBody: $('purchases-body'),
    totalColumns: 7,
    emptyMessage: 'Sin compras registradas.',
    rowRenderer: (item) => {
      const currency = item.currency || 'CRC';
      return `
        <tr>
          <td>${escapeHtml(item.issue_date)}</td>
          <td>${escapeHtml(item.supplier_name)}</td>
          <td>${escapeHtml(item.invoice_number)}</td>
          <td>${escapeHtml(formatMoney(item.subtotal, currency))}</td>
          <td>${escapeHtml(formatMoney(item.tax_total, currency))}</td>
          <td>${escapeHtml(formatMoney(item.total, currency))}</td>
          <td><button class="btn btn-secondary" data-detail="${item.id}">Ver detalles</button></td>
        </tr>
      `;
    },
  });

  function orgId() {
    const id = Number($('organization-id')?.value || window.AppSession?.getActiveOrganizationId?.());
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
    const feedbackNode = $('feedback');
    if (!feedbackNode) return;
    feedbackNode.textContent = message;
    feedbackNode.style.color = isError ? '#ff7d7d' : 'var(--muted)';
  }

  function currencySymbol(code) {
    return code === 'USD' ? '$' : 'CRC ';
  }

  function formatMoney(amount, currency = 'CRC') {
    const numeric = Number(amount || 0);
    if (!Number.isFinite(numeric)) return `${currencySymbol(currency)}0.00`;
    return `${currencySymbol(currency)}${numeric.toFixed(2)}`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function renderMeta(container, entries) {
    if (!container) return;
    container.innerHTML = entries
      .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
      .join('');
  }

  function applyPurchaseFilters() {
    if (!$('purchases-body')) return;

    const searchTerm = purchaseSearchInput?.value.trim().toLowerCase() || '';
    const dateFrom = purchaseDateFromInput?.value || '';
    const dateTo = purchaseDateToInput?.value || '';

    const filtered = state.purchases.filter((item) => {
      const haystack = `${item.supplier_name || ''} ${item.invoice_number || ''} ${item.numeric_key || ''}`.toLowerCase();
      const matchesText = !searchTerm || haystack.includes(searchTerm);
      const matchesFrom = !dateFrom || item.issue_date >= dateFrom;
      const matchesTo = !dateTo || item.issue_date <= dateTo;
      return matchesText && matchesFrom && matchesTo;
    });

    if (purchasesPager) {
      purchasesPager.update(filtered);
    } else {
      $('purchases-body').innerHTML =
        filtered
          .map((item) => {
            const currency = item.currency || 'CRC';
            return `
              <tr>
                <td>${escapeHtml(item.issue_date)}</td>
                <td>${escapeHtml(item.supplier_name)}</td>
                <td>${escapeHtml(item.invoice_number)}</td>
                <td>${escapeHtml(formatMoney(item.subtotal, currency))}</td>
                <td>${escapeHtml(formatMoney(item.tax_total, currency))}</td>
                <td>${escapeHtml(formatMoney(item.total, currency))}</td>
                <td><button class="btn btn-secondary" data-detail="${item.id}">Ver detalles</button></td>
              </tr>
            `;
          })
          .join('') || '<tr><td colspan="7">Sin compras registradas.</td></tr>';
    }

  }

  function openPurchaseDetail(purchase) {
    if (!purchaseDetailModal || !purchase) return;
    const currency = purchase.currency || 'CRC';
    purchaseDetailTitle.textContent = `Compra ${purchase.invoice_number}`;
    purchaseDetailSubtitle.textContent = `${purchase.supplier_name} · ${purchase.issue_date}`;
    renderMeta(purchaseDetailMeta, [
      ['Proveedor', purchase.supplier_name],
      ['Cédula proveedor', purchase.supplier_tax_id || 'No disponible'],
      ['Factura', purchase.invoice_number],
      ['Fecha de emisión', purchase.issue_date],
      ['Subtotal', formatMoney(purchase.subtotal, currency)],
      ['IVA', formatMoney(purchase.tax_total, currency)],
      ['Total', formatMoney(purchase.total, currency)],
      ['Registrada', purchase.created_at || 'No disponible'],
    ]);
    renderMeta(purchaseDetailExtra, [
      ['Comprador', purchase.buyer_name || 'No disponible'],
      ['Cédula comprador', purchase.buyer_tax_id || 'No disponible'],
      ['Clave numérica', purchase.numeric_key || 'No disponible'],
      ['Moneda', currency],
      ['Tipo de cambio', purchase.exchange_rate || '1.0000'],
      ['Origen', purchase.source || 'manual'],
    ]);
    purchaseDetailLines.innerHTML =
      (purchase.items || [])
        .map(
          (line) => `
            <div class="purchase-detail-line">
              <div>
                <strong>${escapeHtml(line.description)}</strong><br />
                <span>${escapeHtml(line.quantity)} × ${escapeHtml(line.unit_price)}</span>
              </div>
              <strong>${escapeHtml(formatMoney(line.subtotal, currency))}</strong>
            </div>
          `
        )
        .join('') || '<p class="subtitle">Esta compra no tiene líneas cargadas.</p>';
    renderMeta(purchaseDetailDocument, [
      ['PDF', 'No disponible para compras registradas manualmente'],
      ['Observación', 'Si necesitas respaldo visual, puedes usar la bandeja de facturas recibidas cuando el documento venga por correo.'],
    ]);
    purchaseDetailModal.classList.add('is-open');
    purchaseDetailModal.setAttribute('aria-hidden', 'false');
  }

  function closePurchaseDetail() {
    if (!purchaseDetailModal) return;
    purchaseDetailModal.classList.remove('is-open');
    purchaseDetailModal.setAttribute('aria-hidden', 'true');
  }

  async function syncNameFromPadron(taxInputId, nameInputId, actorLabel) {
    if (!window.CedulaPadron || !$(taxInputId) || !$(nameInputId)) {
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
    if (!$('organization-id')) return;
    const organizations = window.AppSession?.getOrganizations?.() || [];
    const activeId = Number(window.AppSession?.getActiveOrganizationId?.());
    $('organization-id').innerHTML = organizations.map((org) => `<option value="${org.id}">${org.name}</option>`).join('');
    if (activeId) $('organization-id').value = String(activeId);
  }

  function renderLines() {
    if (!$('lines-body') || !$('purchase-total')) return;
    let total = 0;
    $('lines-body').innerHTML =
      state.lines
        .map((line, idx) => {
          const subtotal = Number(line.quantity) * Number(line.unit_price);
          total += subtotal;
          return `<tr><td>${line.description}</td><td>${line.quantity}</td><td>${line.unit_price}</td><td>${subtotal.toFixed(2)}</td><td><button class="btn btn-secondary" data-rm="${idx}">Quitar</button></td></tr>`;
        })
        .join('') || '<tr><td colspan="5">Sin líneas</td></tr>';
    $('purchase-total').textContent = `Subtotal compra: ₡${total.toFixed(2)}`;
  }

  async function loadPurchases() {
    if (!$('purchases-body')) return;
    const purchases = await request(`/purchases/?organization_id=${orgId()}`);
    state.purchases = purchases;
    applyPurchaseFilters();
  }

  if ($('add-line')) {
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
  }

  if ($('lines-body')) {
    $('lines-body').addEventListener('click', (event) => {
      const idx = event.target.dataset.rm;
      if (idx === undefined) return;
      state.lines.splice(Number(idx), 1);
      renderLines();
    });
  }

  if ($('purchase-form')) {
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
        if ($('issue-date')) {
          $('issue-date').valueAsDate = new Date();
        }
        setFeedback('Compra registrada correctamente.');
      } catch (error) {
        setFeedback(error.message, true);
      }
    });
  }

  if ($('organization-id')) {
    $('organization-id').addEventListener('change', () => {
      window.AppSession?.setActiveOrganizationId?.($('organization-id').value);
      if (pageView === 'list') {
        loadPurchases().catch((error) => setFeedback(error.message, true));
      }
    });
  }

  if ($('supplier-tax-id')) {
    $('supplier-tax-id').addEventListener('blur', () => syncNameFromPadron('supplier-tax-id', 'supplier-name', 'proveedor').catch(() => null));
    $('supplier-tax-id').addEventListener('input', () => {
      if (padronTimers.supplier) clearTimeout(padronTimers.supplier);
      padronTimers.supplier = setTimeout(() => {
        syncNameFromPadron('supplier-tax-id', 'supplier-name', 'proveedor').catch(() => null);
      }, 250);
    });
  }

  if ($('buyer-tax-id')) {
    $('buyer-tax-id').addEventListener('blur', () => syncNameFromPadron('buyer-tax-id', 'buyer-name', 'comprador').catch(() => null));
    $('buyer-tax-id').addEventListener('input', () => {
      if (padronTimers.buyer) clearTimeout(padronTimers.buyer);
      padronTimers.buyer = setTimeout(() => {
        syncNameFromPadron('buyer-tax-id', 'buyer-name', 'comprador').catch(() => null);
      }, 250);
    });
  }

  if ($('reload-purchases')) {
    $('reload-purchases').addEventListener('click', () => loadPurchases().catch((error) => setFeedback(error.message, true)));
  }

  purchaseSearchInput?.addEventListener('input', applyPurchaseFilters);
  purchaseDateFromInput?.addEventListener('change', applyPurchaseFilters);
  purchaseDateToInput?.addEventListener('change', applyPurchaseFilters);

  $('purchases-body')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-detail]');
    if (!button) return;
    const target = state.purchases.find((item) => String(item.id) === String(button.dataset.detail));
    if (target) {
      openPurchaseDetail(target);
    }
  });

  $('purchase-detail-close')?.addEventListener('click', closePurchaseDetail);
  purchaseDetailModal?.addEventListener('click', (event) => {
    if (event.target === purchaseDetailModal) {
      closePurchaseDetail();
    }
  });

  renderOrganizations();
  renderLines();
  if ($('issue-date')) {
    $('issue-date').valueAsDate = new Date();
  }
  if (pageView === 'list') {
    loadPurchases().catch((error) => setFeedback(error.message, true));
  }
})();
