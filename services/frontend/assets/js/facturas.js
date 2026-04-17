(function initFacturas() {
  const $ = (id) => document.getElementById(id);
  const apiBase = () => '/api';
  const logPrefix = '[Facturas API]';
  const modal = $('invoice-detail-modal');
  const modalTitle = $('invoice-detail-title');
  const modalSubtitle = $('invoice-detail-subtitle');
  const modalMeta = $('invoice-detail-meta');
  const modalExtra = $('invoice-detail-extra');
  const modalLines = $('invoice-detail-lines');
  const modalActions = $('invoice-detail-actions');
  const monthFilter = $('month-filter');
  const searchFilter = $('search-filter');
  const paymentFilter = $('payment-filter');
  const documentFilter = $('document-filter');
  const pointsFilter = $('points-filter');
  const invoicesPager = window.TablePaginator?.create({
    key: 'invoices',
    tableBody: $('invoices-body'),
    totalColumns: 5,
    emptyMessage: 'Sin facturas emitidas',
    rowRenderer: (invoice) =>
      `<tr><td>${escapeHtml(invoice.invoice_number)}</td><td>${escapeHtml(invoice.customer_name)}</td><td>${formatMoney(invoice.total, invoice.currency)}</td><td>${formatDate(invoice.issue_date)}</td><td><button class='btn btn-secondary' data-detail='${invoice.id}'>Ver detalles</button> <a class='btn btn-secondary' href='${apiBase()}/invoices/${invoice.id}/pdf/' target='_blank'>PDF</a> <button class='btn btn-secondary' data-mail='${invoice.id}'>Correo</button></td></tr>`,
  });
  let currentInvoices = [];
  const documentTypeLabels = { '01': 'Factura electrónica', '03': 'Nota de crédito' };
  const paymentMethodLabels = { '01': 'Efectivo', '02': 'Tarjeta', '03': 'Transferencia', '04': 'A plazos' };
  const taxRegimeLabels = { simplified: 'Régimen simplificado', general: 'Régimen general' };
  const statusLabels = { draft: 'Borrador', issued: 'Emitida', void: 'Anulada' };

  const orgId = () => {
    const id = Number($('organization-id')?.value || window.AppSession?.getActiveOrganizationId?.());
    if (!id || id < 1) {
      throw new Error('No hay organización activa. Selecciona una organización en la barra superior.');
    }
    return id;
  };

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
    if (!contentType.includes('application/json')) {
      throw new Error('Respuesta no JSON. Revise la configuración del backend/proxy.');
    }
    return JSON.parse(text);
  }

  function feedback(msg, error = false) {
    $('feedback').textContent = msg;
    $('feedback').style.color = error ? '#ff6b6b' : 'var(--muted)';
  }

  function renderOrganizations() {
    const select = $('organization-id');
    if (!select) return;
    const organizations = window.AppSession?.getOrganizations?.() || [];
    const activeId = Number(window.AppSession?.getActiveOrganizationId?.());
    select.innerHTML = organizations.map((org) => `<option value="${org.id}">${org.name}</option>`).join('');
    if (activeId) select.value = String(activeId);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function formatMoney(value, currency = 'CRC') {
    const amount = Number(value || 0);
    const normalizedCurrency = String(currency || 'CRC').toUpperCase();
    return new Intl.NumberFormat('es-CR', {
      style: 'currency',
      currency: normalizedCurrency,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  function formatDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString('es-CR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  function renderMeta(container, entries) {
    container.innerHTML = entries
      .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
      .join('');
  }

  function getRequestedInvoiceId() {
    return Number(new URLSearchParams(window.location.search).get('invoice_id') || 0);
  }

  function getCurrentMonthValue() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${now.getFullYear()}-${month}`;
  }

  function getInvoiceMonth(invoice) {
    const date = new Date(invoice.issue_date);
    if (Number.isNaN(date.getTime())) return '';
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${date.getFullYear()}-${month}`;
  }

  function getFilteredInvoices() {
    const monthValue = monthFilter?.value || getCurrentMonthValue();
    const searchValue = searchFilter?.value.trim().toLowerCase() || '';
    const paymentValue = paymentFilter?.value || '';
    const documentValue = documentFilter?.value || '';
    const pointsValue = pointsFilter?.value || '';

    return currentInvoices.filter((invoice) => {
      const matchesMonth = !monthValue || getInvoiceMonth(invoice) === monthValue;
      const matchesSearch =
        !searchValue ||
        `${invoice.invoice_number || ''} ${invoice.customer_name || ''} ${invoice.notes || ''}`.toLowerCase().includes(searchValue);
      const matchesPayment = !paymentValue || invoice.payment_method === paymentValue;
      const matchesDocument = !documentValue || invoice.document_type === documentValue;
      const hasPoints = Number(invoice.loyalty_redeemed_points || 0) > 0;
      const matchesPoints =
        !pointsValue ||
        (pointsValue === 'with-points' && hasPoints) ||
        (pointsValue === 'without-points' && !hasPoints);
      return matchesMonth && matchesSearch && matchesPayment && matchesDocument && matchesPoints;
    });
  }

  function renderSummary(filteredInvoices) {
    const total = filteredInvoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
    const count = filteredInvoices.length;
    const average = count ? total / count : 0;
    const monthValue = monthFilter?.value || getCurrentMonthValue();
    const [year, month] = monthValue.split('-');
    const captionMonth = year && month ? new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('es-CR', { month: 'long', year: 'numeric' }) : 'mes actual';

    $('month-income-total').textContent = formatMoney(total, 'CRC');
    $('month-income-caption').textContent = `Vista mensual de ${captionMonth} con los filtros actuales.`;
    $('month-income-count').textContent = String(count);
    $('month-income-average').textContent = `Promedio: ${formatMoney(average, 'CRC')}`;
  }

  function renderInvoiceTable() {
    const filteredInvoices = getFilteredInvoices();
    renderSummary(filteredInvoices);
    if (invoicesPager) {
      invoicesPager.update(filteredInvoices);
    } else {
      $('invoices-body').innerHTML =
        filteredInvoices
          .map(
            (invoice) =>
              `<tr><td>${escapeHtml(invoice.invoice_number)}</td><td>${escapeHtml(invoice.customer_name)}</td><td>${formatMoney(invoice.total, invoice.currency)}</td><td>${formatDate(invoice.issue_date)}</td><td><button class='btn btn-secondary' data-detail='${invoice.id}'>Ver detalles</button> <a class='btn btn-secondary' href='${apiBase()}/invoices/${invoice.id}/pdf/' target='_blank'>PDF</a> <button class='btn btn-secondary' data-mail='${invoice.id}'>Correo</button></td></tr>`,
          )
          .join('') || '<tr><td colspan="5">Sin facturas emitidas</td></tr>';
    }
    feedback(`Mostrando ${filteredInvoices.length} factura(s) del mes filtrado.`);
  }

  async function loadInvoices() {
    const invoices = await request(`/invoices/?organization_id=${orgId()}`);
    currentInvoices = invoices;
    renderInvoiceTable();

    const requestedInvoiceId = getRequestedInvoiceId();
    if (requestedInvoiceId) {
      const exists = invoices.some((invoice) => Number(invoice.id) === requestedInvoiceId);
      if (exists) {
        await openInvoiceDetail(requestedInvoiceId);
      }
    }
  }

  async function openInvoiceDetail(id) {
    const invoice = await request(`/invoices/${id}/?organization_id=${orgId()}`);
    modalTitle.textContent = `Factura ${invoice.invoice_number}`;
    modalSubtitle.textContent = `${invoice.customer_name} · ${formatDate(invoice.issue_date)}`;
    renderMeta(modalMeta, [
      ['Cliente', invoice.customer_name],
      ['Número', invoice.invoice_number],
      ['Documento', documentTypeLabels[invoice.document_type] || invoice.document_type],
      ['Estado', statusLabels[invoice.status] || invoice.status],
      ['Moneda', invoice.currency],
      ['Tipo de cambio', invoice.exchange_rate],
      ['Subtotal', formatMoney(invoice.subtotal, invoice.currency)],
      ['Impuesto', formatMoney(invoice.tax_total, invoice.currency)],
      ['Descuento', formatMoney(invoice.discount_total, invoice.currency)],
      ['Total', formatMoney(invoice.total, invoice.currency)],
    ]);
    renderMeta(modalExtra, [
      ['Condición de venta', invoice.sale_condition === '01' ? 'Contado' : invoice.sale_condition === '02' ? 'Crédito' : invoice.sale_condition],
      ['Método de pago', paymentMethodLabels[invoice.payment_method] || invoice.payment_method],
      ['Régimen fiscal', taxRegimeLabels[invoice.tax_regime] || invoice.tax_regime],
      ['Cuotas', invoice.installment_count],
      ['Intervalo cuotas', invoice.installment_interval_days],
      ['Correo enviado', invoice.email_sent_at || 'Pendiente'],
      ['Notas', invoice.notes || 'Sin notas'],
      ['Puntos otorgados', `${invoice.loyalty_awarded_points || 0} pts`],
      ['Puntos redimidos', `${invoice.loyalty_redeemed_points || 0} pts`],
    ]);
    modalLines.innerHTML =
      (invoice.items || [])
        .map(
          (item) => `
            <div class="invoice-detail-line">
              <div>
                <strong>${escapeHtml(item.description)}</strong><br />
                <span>${escapeHtml(item.quantity)} × ${escapeHtml(formatMoney(item.unit_price, invoice.currency))}</span>
              </div>
              <strong>${escapeHtml(formatMoney(item.total, invoice.currency))}</strong>
            </div>
          `,
        )
        .join('') || '<p class="subtitle">Esta factura no tiene líneas cargadas.</p>';
    modalActions.innerHTML = `
      <a class="btn btn-secondary" href="${apiBase()}/invoices/${invoice.id}/pdf/" target="_blank">Descargar PDF</a>
      <button class="btn btn-secondary" data-send-mail="${invoice.id}">Enviar por correo</button>
    `;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  $('reload').addEventListener('click', () => loadInvoices().catch((e) => feedback(e.message, true)));
  $('clear-filters')?.addEventListener('click', () => {
    if (monthFilter) monthFilter.value = getCurrentMonthValue();
    if (searchFilter) searchFilter.value = '';
    if (paymentFilter) paymentFilter.value = '';
    if (documentFilter) documentFilter.value = '';
    if (pointsFilter) pointsFilter.value = '';
    renderInvoiceTable();
  });
  $('organization-id').addEventListener('change', () => {
    window.AppSession?.setActiveOrganizationId?.($('organization-id').value);
    loadInvoices().catch((e) => feedback(e.message, true));
  });
  monthFilter?.addEventListener('change', renderInvoiceTable);
  searchFilter?.addEventListener('input', renderInvoiceTable);
  paymentFilter?.addEventListener('change', renderInvoiceTable);
  documentFilter?.addEventListener('change', renderInvoiceTable);
  pointsFilter?.addEventListener('change', renderInvoiceTable);
  $('invoices-body').addEventListener('click', async (e) => {
    const id = e.target.dataset.mail;
    const detailId = e.target.dataset.detail;
    try {
      if (detailId) {
        await openInvoiceDetail(detailId);
        return;
      }
      if (!id) return;
      await request(`/invoices/${id}/send-email/`, { method: 'POST' });
      feedback('Correo enviado al cliente.');
    } catch (error) {
      feedback(error.message, true);
    }
  });
  modalActions?.addEventListener('click', async (e) => {
    const id = e.target.dataset.sendMail;
    if (!id) return;
    try {
      await request(`/invoices/${id}/send-email/`, { method: 'POST' });
      feedback('Correo enviado al cliente.');
    } catch (error) {
      feedback(error.message, true);
    }
  });
  $('invoice-detail-close')?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  renderOrganizations();
  if (monthFilter) {
    monthFilter.value = getCurrentMonthValue();
  }
  loadInvoices().catch((e) => feedback(e.message, true));
})();
