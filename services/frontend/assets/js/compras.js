(function initCompras() {
  const $ = (id) => document.getElementById(id);
  const state = { lines: [], purchases: [] };
  const lookupTimers = {};
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
  const purchaseSummaryTotal = $('purchase-summary-total');
  const purchaseSummaryTax = $('purchase-summary-tax');
  const purchaseSummaryCount = $('purchase-summary-count');
  const purchaseSummaryAverage = $('purchase-summary-average');
  const purchaseSummaryCaption = $('purchase-summary-caption');
  const supplierTaxStatus = $('supplier-tax-status');
  const buyerTaxStatus = $('buyer-tax-status');
  const purchaseSubtotalNode = $('purchase-subtotal');
  const purchaseTaxPreviewNode = $('purchase-tax-preview');
  const purchaseGrandTotalNode = $('purchase-grand-total');
  const purchasesPager = window.TablePaginator?.create({
    key: 'purchases',
    tableBody: $('purchases-body'),
    totalColumns: 7,
    emptyMessage: 'Sin compras registradas.',
    rowRenderer: renderPurchaseRow,
  });

  function orgId() {
    const id = Number($('organization-id')?.value || window.AppSession?.getActiveOrganizationId?.());
    if (!id || id < 1) throw new Error('No hay organizacion activa.');
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
    window.appAlerts?.toast?.(message, isError ? 'error' : 'success');
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

  function normalizeTaxId(value) {
    if (window.CedulaPadron?.normalizeCedula) return window.CedulaPadron.normalizeCedula(value || '');
    return String(value || '').replace(/\D/g, '');
  }

  function isUnknownPurchaseValue(value) {
    const cleanValue = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!cleanValue) return true;
    const unknownValues = ['desconocido', 'desconocida', 'no identificado', 'no identificada', 'no disponible', 'n/a', 'na', 'unknown'];
    return unknownValues.some((token) => cleanValue === token || (token.length > 3 && cleanValue.includes(token)));
  }

  function validatePurchaseParty({ nameInputId, taxInputId, actorLabel }) {
    const nameInput = $(nameInputId);
    const taxInput = $(taxInputId);
    const name = nameInput?.value.trim() || '';
    const taxId = normalizeTaxId(taxInput?.value || '');
    if (taxInput) taxInput.value = taxId;
    if (isUnknownPurchaseValue(name)) {
      nameInput?.focus();
      throw new Error(`El nombre del ${actorLabel} es obligatorio y no puede ser desconocido.`);
    }
    if (isUnknownPurchaseValue(taxId)) {
      taxInput?.focus();
      throw new Error(`La cedula del ${actorLabel} es obligatoria y no puede ser desconocida.`);
    }
    if (![9, 10].includes(taxId.length)) {
      taxInput?.focus();
      throw new Error(`La cedula del ${actorLabel} debe tener 9 o 10 digitos.`);
    }
  }

  function setLookupStatus(node, label, stateName = 'pending') {
    if (!node) return;
    node.textContent = label;
    node.classList.remove('is-loading', 'is-valid', 'is-missing');
    if (stateName !== 'pending') node.classList.add(`is-${stateName}`);
  }

  function renderPurchaseRow(item) {
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

    updatePurchaseSummary(filtered);
    if (purchasesPager) {
      purchasesPager.update(filtered);
      return;
    }
    $('purchases-body').innerHTML = filtered.map(renderPurchaseRow).join('') || '<tr><td colspan="7">Sin compras registradas.</td></tr>';
  }

  function updatePurchaseSummary(rows) {
    if (!purchaseSummaryTotal || !purchaseSummaryTax || !purchaseSummaryCount || !purchaseSummaryAverage) return;
    const totalsByCurrency = rows.reduce((acc, item) => {
      const currency = item.currency || 'CRC';
      acc[currency] ||= { total: 0, tax: 0, count: 0 };
      acc[currency].total += Number(item.total || 0);
      acc[currency].tax += Number(item.tax_total || 0);
      acc[currency].count += 1;
      return acc;
    }, {});
    const preferredCurrency = totalsByCurrency.CRC ? 'CRC' : Object.keys(totalsByCurrency)[0] || 'CRC';
    const summary = totalsByCurrency[preferredCurrency] || { total: 0, tax: 0, count: 0 };
    const average = summary.count ? summary.total / summary.count : 0;
    purchaseSummaryTotal.textContent = formatMoney(summary.total, preferredCurrency);
    purchaseSummaryTax.textContent = formatMoney(summary.tax, preferredCurrency);
    purchaseSummaryCount.textContent = String(rows.length);
    purchaseSummaryAverage.textContent = `Promedio: ${formatMoney(average, preferredCurrency)}`;
    if (purchaseSummaryCaption) {
      const currencyCount = Object.keys(totalsByCurrency).length;
      purchaseSummaryCaption.textContent =
        currencyCount > 1
          ? `Mostrando ${preferredCurrency}; hay compras visibles en ${currencyCount} monedas.`
          : 'Calculado con los filtros actuales.';
    }
  }

  function openPurchaseDetail(purchase) {
    if (!purchaseDetailModal || !purchase) return;
    const currency = purchase.currency || 'CRC';
    purchaseDetailTitle.textContent = `Compra ${purchase.invoice_number}`;
    purchaseDetailSubtitle.textContent = `${purchase.supplier_name} - ${purchase.issue_date}`;
    renderMeta(purchaseDetailMeta, [
      ['Proveedor', purchase.supplier_name],
      ['Cedula proveedor', purchase.supplier_tax_id || 'No disponible'],
      ['Factura', purchase.invoice_number],
      ['Fecha de emision', purchase.issue_date],
      ['Subtotal', formatMoney(purchase.subtotal, currency)],
      ['IVA', formatMoney(purchase.tax_total, currency)],
      ['Total', formatMoney(purchase.total, currency)],
      ['Registrada', purchase.created_at || 'No disponible'],
    ]);
    renderMeta(purchaseDetailExtra, [
      ['Comprador', purchase.buyer_name || 'No disponible'],
      ['Cedula comprador', purchase.buyer_tax_id || 'No disponible'],
      ['Clave numerica', purchase.numeric_key || 'No disponible'],
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
                <span>${escapeHtml(line.quantity)} x ${escapeHtml(line.unit_price)}</span>
              </div>
              <strong>${escapeHtml(formatMoney(line.subtotal, currency))}</strong>
            </div>
          `,
        )
        .join('') || '<p class="subtitle">Esta compra no tiene lineas cargadas.</p>';
    renderMeta(purchaseDetailDocument, [
      ['PDF', 'No disponible para compras registradas manualmente'],
      ['Observacion', 'Si necesitas respaldo visual, puedes usar la bandeja de facturas recibidas cuando el documento venga por correo.'],
    ]);
    purchaseDetailModal.classList.add('is-open');
    purchaseDetailModal.setAttribute('aria-hidden', 'false');
  }

  function closePurchaseDetail() {
    if (!purchaseDetailModal) return;
    purchaseDetailModal.classList.remove('is-open');
    purchaseDetailModal.setAttribute('aria-hidden', 'true');
  }

  async function lookupPadronName(taxId) {
    if (!window.CedulaPadron) return null;
    const record = await window.CedulaPadron.resolveByCedula(taxId);
    return record?.fullName || null;
  }

  async function lookupSupplierTaxRegistryName(taxId) {
    const record = await request(`/suppliers/tax-registry/?tax_id=${taxId}`);
    return record?.nombre || record?.name || record?.legal_name || null;
  }

  async function syncIdentityFromTaxId({ taxInputId, nameInputId, statusNode, actorLabel, allowLegal = false, overwriteName = false, showFeedback = true }) {
    const taxInput = $(taxInputId);
    const nameInput = $(nameInputId);
    if (!taxInput || !nameInput) return null;
    const normalizedTaxId = normalizeTaxId(taxInput.value);
    taxInput.value = normalizedTaxId;

    if (!normalizedTaxId || normalizedTaxId.length < 9) {
      setLookupStatus(statusNode, 'Pendiente');
      return null;
    }

    if (![9, 10].includes(normalizedTaxId.length) || (normalizedTaxId.length === 10 && !allowLegal)) {
      setLookupStatus(statusNode, 'No encontrado', 'missing');
      return null;
    }

    setLookupStatus(statusNode, 'Validando', 'loading');
    try {
      const resolvedName =
        normalizedTaxId.length === 10
          ? await lookupSupplierTaxRegistryName(normalizedTaxId)
          : await lookupPadronName(normalizedTaxId);
      const source = normalizedTaxId.length === 10 ? 'Hacienda' : 'padron';

      if (!resolvedName) {
        setLookupStatus(statusNode, 'No encontrado', 'missing');
        if (showFeedback) setFeedback(`No se encontro ${actorLabel}. Puedes digitar el nombre manualmente.`, true);
        return null;
      }

      if (overwriteName || !nameInput.value.trim()) {
        nameInput.value = resolvedName;
      } else if (normalizedTaxId.length === 9 && window.CedulaPadron?.compareName) {
        const record = await window.CedulaPadron.resolveByCedula(normalizedTaxId);
        const isSameName = window.CedulaPadron.compareName(nameInput.value, record);
        if (isSameName === false && showFeedback) {
          setFeedback(`La cedula de ${actorLabel} corresponde a "${resolvedName}". Verifica el nombre digitado.`, true);
        }
      }

      setLookupStatus(statusNode, normalizedTaxId.length === 10 ? 'Validado en Hacienda' : 'Validado en padron', 'valid');
      if (showFeedback) setFeedback(`${actorLabel} validado en ${source}.`);
      return resolvedName;
    } catch (_error) {
      setLookupStatus(statusNode, 'No encontrado', 'missing');
      if (showFeedback) setFeedback(`No se pudo validar ${actorLabel}. Puedes continuar digitando manualmente.`, true);
      return null;
    }
  }

  function queueIdentityLookup(timerKey, options) {
    if (lookupTimers[timerKey]) clearTimeout(lookupTimers[timerKey]);
    const normalizedTaxId = normalizeTaxId($(options.taxInputId)?.value || '');
    if (!normalizedTaxId || normalizedTaxId.length < 9) {
      setLookupStatus(options.statusNode, 'Pendiente');
      return;
    }
    lookupTimers[timerKey] = setTimeout(() => {
      syncIdentityFromTaxId({ ...options, showFeedback: false }).catch(() => null);
    }, 250);
  }

  function renderOrganizations() {
    if (!$('organization-id')) return;
    const organizations = window.AppSession?.getOrganizations?.() || [];
    const activeId = Number(window.AppSession?.getActiveOrganizationId?.());
    $('organization-id').innerHTML = organizations.map((org) => `<option value="${org.id}">${escapeHtml(org.name)}</option>`).join('');
    if (activeId) $('organization-id').value = String(activeId);
  }

  function getLinesSubtotal() {
    return state.lines.reduce((total, line) => total + Number(line.quantity) * Number(line.unit_price), 0);
  }

  function renderLines() {
    if (!$('lines-body')) return;
    const subtotal = getLinesSubtotal();
    const taxTotal = Number($('tax-total')?.value || 0);
    const grandTotal = subtotal + (Number.isFinite(taxTotal) ? taxTotal : 0);
    $('lines-body').innerHTML =
      state.lines
        .map((line, idx) => {
          const lineSubtotal = Number(line.quantity) * Number(line.unit_price);
          return `<tr><td>${escapeHtml(line.description)}</td><td>${escapeHtml(line.quantity)}</td><td>${escapeHtml(formatMoney(line.unit_price))}</td><td>${escapeHtml(formatMoney(lineSubtotal))}</td><td><button class="btn btn-secondary" data-rm="${idx}">Quitar</button></td></tr>`;
        })
        .join('') || '<tr><td colspan="5">Sin lineas</td></tr>';
    if ($('purchase-total')) $('purchase-total').textContent = state.lines.length ? `${state.lines.length} linea(s) agregada(s).` : '';
    if (purchaseSubtotalNode) purchaseSubtotalNode.textContent = formatMoney(subtotal);
    if (purchaseTaxPreviewNode) purchaseTaxPreviewNode.textContent = formatMoney(taxTotal);
    if (purchaseGrandTotalNode) purchaseGrandTotalNode.textContent = formatMoney(grandTotal);
  }

  async function loadPurchases() {
    if (!$('purchases-body')) return;
    const purchases = await request(`/purchases/?organization_id=${orgId()}`);
    state.purchases = purchases;
    applyPurchaseFilters();
  }

  function resetPurchaseForm() {
    state.lines = [];
    $('purchase-form')?.reset();
    renderOrganizations();
    if ($('issue-date')) $('issue-date').valueAsDate = new Date();
    setLookupStatus(supplierTaxStatus, 'Pendiente');
    setLookupStatus(buyerTaxStatus, 'Pendiente');
    renderLines();
  }

  $('add-line')?.addEventListener('click', () => {
    const description = $('line-description').value.trim();
    const unit_price = Number($('line-unit-price').value);
    const quantity = Number($('line-qty').value || 1);
    if (!description) {
      setFeedback('Ingresa la descripcion del producto/servicio.', true);
      $('line-description')?.focus();
      return;
    }
    if (!Number.isFinite(unit_price) || unit_price <= 0) return setFeedback('Precio unitario invalido.', true);
    if (!Number.isFinite(quantity) || quantity <= 0) return setFeedback('Cantidad invalida.', true);
    state.lines.push({ description, unit_price, quantity });
    $('line-description').value = '';
    $('line-unit-price').value = '';
    $('line-qty').value = '1';
    renderLines();
    $('line-description')?.focus();
  });

  $('lines-body')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-rm]');
    if (!button) return;
    state.lines.splice(Number(button.dataset.rm), 1);
    renderLines();
  });

  $('tax-total')?.addEventListener('input', renderLines);

  $('purchase-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await syncIdentityFromTaxId({
        taxInputId: 'supplier-tax-id',
        nameInputId: 'supplier-name',
        statusNode: supplierTaxStatus,
        actorLabel: 'proveedor',
        allowLegal: true,
        overwriteName: true,
      });
      await syncIdentityFromTaxId({
        taxInputId: 'buyer-tax-id',
        nameInputId: 'buyer-name',
        statusNode: buyerTaxStatus,
        actorLabel: 'comprador',
      });
      validatePurchaseParty({
        taxInputId: 'supplier-tax-id',
        nameInputId: 'supplier-name',
        actorLabel: 'proveedor',
      });
      validatePurchaseParty({
        taxInputId: 'buyer-tax-id',
        nameInputId: 'buyer-name',
        actorLabel: 'comprador',
      });
      if (!state.lines.length) return setFeedback('Debe agregar al menos una linea de compra.', true);
      const numericKey = $('numeric-key').value.trim();
      if (!/^\d{50}$/.test(numericKey)) return setFeedback('La clave numerica debe tener exactamente 50 digitos.', true);
      const payload = {
        organization: orgId(),
        supplier_name: $('supplier-name').value.trim(),
        supplier_tax_id: normalizeTaxId($('supplier-tax-id').value),
        buyer_name: $('buyer-name').value.trim(),
        buyer_tax_id: normalizeTaxId($('buyer-tax-id').value),
        issue_date: $('issue-date').value,
        invoice_number: $('invoice-number').value.trim(),
        numeric_key: numericKey,
        tax_total: Number($('tax-total').value || 0),
        items: state.lines,
      };
      await request('/purchases/', { method: 'POST', body: JSON.stringify(payload) });
      resetPurchaseForm();
      setFeedback('Compra registrada correctamente.');
    } catch (error) {
      setFeedback(error.message, true);
    }
  });

  $('organization-id')?.addEventListener('change', () => {
    window.AppSession?.setActiveOrganizationId?.($('organization-id').value);
    if (pageView === 'list') loadPurchases().catch((error) => setFeedback(error.message, true));
  });

  $('supplier-tax-id')?.addEventListener('blur', () => {
    syncIdentityFromTaxId({
      taxInputId: 'supplier-tax-id',
      nameInputId: 'supplier-name',
      statusNode: supplierTaxStatus,
      actorLabel: 'proveedor',
      allowLegal: true,
      overwriteName: true,
    }).catch(() => null);
  });
  $('supplier-tax-id')?.addEventListener('input', () => {
    queueIdentityLookup('supplier', {
      taxInputId: 'supplier-tax-id',
      nameInputId: 'supplier-name',
      statusNode: supplierTaxStatus,
      actorLabel: 'proveedor',
      allowLegal: true,
      overwriteName: true,
    });
  });

  $('buyer-tax-id')?.addEventListener('blur', () => {
    syncIdentityFromTaxId({
      taxInputId: 'buyer-tax-id',
      nameInputId: 'buyer-name',
      statusNode: buyerTaxStatus,
      actorLabel: 'comprador',
    }).catch(() => null);
  });
  $('buyer-tax-id')?.addEventListener('input', () => {
    queueIdentityLookup('buyer', {
      taxInputId: 'buyer-tax-id',
      nameInputId: 'buyer-name',
      statusNode: buyerTaxStatus,
      actorLabel: 'comprador',
    });
  });

  purchaseSearchInput?.addEventListener('input', applyPurchaseFilters);
  purchaseDateFromInput?.addEventListener('change', applyPurchaseFilters);
  purchaseDateToInput?.addEventListener('change', applyPurchaseFilters);

  $('purchases-body')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-detail]');
    if (!button) return;
    const target = state.purchases.find((item) => String(item.id) === String(button.dataset.detail));
    if (target) openPurchaseDetail(target);
  });

  $('purchase-detail-close')?.addEventListener('click', closePurchaseDetail);
  purchaseDetailModal?.addEventListener('click', (event) => {
    if (event.target === purchaseDetailModal) closePurchaseDetail();
  });

  renderOrganizations();
  renderLines();
  if ($('issue-date')) $('issue-date').valueAsDate = new Date();
  if (pageView === 'list') loadPurchases().catch((error) => setFeedback(error.message, true));
})();
