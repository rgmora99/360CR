(function initCuentasCobrar() {
  const $ = (id) => document.getElementById(id);
  const apiBase = () => '/api';
  const logPrefix = '[CxC API]';
  const modal = $('receivable-detail-modal');
  const receivablesPager = window.TablePaginator?.create({
    key: 'accounts-receivable',
    tableBody: $('receivables-body'),
    totalColumns: 8,
    emptyMessage: 'Sin cuentas por cobrar para mostrar.',
    rowRenderer: renderReceivableRow,
  });

  let allReceivables = [];
  let currentDetail = null;

  function getRequestedInvoiceId() {
    return Number(new URLSearchParams(window.location.search).get('invoice_id') || 0);
  }

  function orgId() {
    const id = Number($('organization-id')?.value || window.AppSession?.getActiveOrganizationId?.());
    if (!id || id < 1) {
      throw new Error('No hay organización activa. Selecciona una organización válida.');
    }
    return id;
  }

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

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function formatMoney(value, currency = 'CRC') {
    return new Intl.NumberFormat('es-CR', {
      style: 'currency',
      currency: String(currency || 'CRC').toUpperCase(),
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('es-CR', { dateStyle: 'medium' });
  }

  function formatDateTime(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' });
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
    select.innerHTML = organizations.map((org) => `<option value="${org.id}">${escapeHtml(org.name)}</option>`).join('');
    if (activeId) select.value = String(activeId);
  }

  function receivableStatusLabel(status) {
    const labels = {
      pending: 'Pendiente',
      partial: 'Parcial',
      overdue: 'Vencida',
      paid: 'Pagada',
      due_today: 'Vence hoy',
      not_applicable: 'N/A',
      paid_installment: 'Pagada',
    };
    return labels[status] || status || '-';
  }

  function renderStatusBadge(status) {
    return `<span class="receivable-status receivable-status--${escapeHtml(status || 'pending')}">${escapeHtml(receivableStatusLabel(status))}</span>`;
  }

  function renderReceivableRow(invoice) {
    return `
      <tr>
        <td>${escapeHtml(invoice.invoice_number)}</td>
        <td>${escapeHtml(invoice.customer_name)}</td>
        <td>${formatMoney(invoice.total, invoice.currency)}</td>
        <td>${formatMoney(invoice.receivable_amount_paid, invoice.currency)}</td>
        <td>${formatMoney(invoice.receivable_amount_due, invoice.currency)}</td>
        <td>${formatDate(invoice.receivable_next_due_date || invoice.receivable_final_due_date)}</td>
        <td>${renderStatusBadge(invoice.receivable_status)}</td>
        <td><button class="btn btn-secondary" data-manage="${invoice.id}">Gestionar</button></td>
      </tr>
    `;
  }

  function getFilteredReceivables() {
    const status = $('status-filter')?.value || '';
    const term = $('search-filter')?.value.trim().toLowerCase() || '';
    return allReceivables.filter((invoice) => {
      const matchesStatus = !status || invoice.receivable_status === status;
      const matchesTerm =
        !term || `${invoice.invoice_number || ''} ${invoice.customer_name || ''} ${invoice.notes || ''}`.toLowerCase().includes(term);
      return matchesStatus && matchesTerm;
    });
  }

  function renderSummary(data) {
    const balance = data.reduce((sum, invoice) => sum + Number(invoice.receivable_amount_due || 0), 0);
    const paid = data.reduce((sum, invoice) => sum + Number(invoice.receivable_amount_paid || 0), 0);
    const overdue = data.filter((invoice) => invoice.receivable_status === 'overdue');
    $('receivable-balance-total').textContent = formatMoney(balance, 'CRC');
    $('receivable-overdue-count').textContent = String(overdue.length);
    $('receivable-overdue-caption').textContent = overdue.length
      ? `${overdue.length} cuenta(s) con mora activa.`
      : 'Sin cuentas vencidas.';
    $('receivable-paid-total').textContent = formatMoney(paid, 'CRC');
    $('receivable-paid-caption').textContent = `Abonos registrados en ${data.length} venta(s) a plazo.`;
  }

  function renderTable() {
    const filtered = getFilteredReceivables();
    renderSummary(filtered);
    if (receivablesPager) {
      receivablesPager.update(filtered);
    } else {
      $('receivables-body').innerHTML = filtered.map((item) => renderReceivableRow(item)).join('') || '<tr><td colspan="8">Sin cuentas por cobrar para mostrar.</td></tr>';
    }
    feedback(`Mostrando ${filtered.length} cuenta(s) por cobrar del filtro actual.`);
  }

  async function loadReceivables() {
    const invoices = await request(`/invoices/accounts-receivable/?organization_id=${orgId()}`);
    allReceivables = Array.isArray(invoices) ? invoices : [];
    renderTable();
    const requestedInvoiceId = getRequestedInvoiceId();
    if (requestedInvoiceId && allReceivables.some((invoice) => Number(invoice.id) === requestedInvoiceId)) {
      await openDetail(requestedInvoiceId);
    }
  }

  function renderDetailMeta(invoice) {
    $('receivable-detail-title').textContent = `Cuenta ${invoice.invoice_number}`;
    $('receivable-detail-subtitle').textContent = `${invoice.customer_name} · Emitida ${formatDateTime(invoice.issue_date)}`;
    $('receivable-detail-meta').innerHTML = [
      ['Total factura', formatMoney(invoice.total, invoice.currency)],
      ['Abonado', formatMoney(invoice.receivable_amount_paid, invoice.currency)],
      ['Saldo pendiente', formatMoney(invoice.receivable_amount_due, invoice.currency)],
      ['Estado', receivableStatusLabel(invoice.receivable_status)],
      ['Próximo vencimiento', formatDate(invoice.receivable_next_due_date)],
      ['Vencimiento final', formatDate(invoice.receivable_final_due_date)],
      ['Días de mora', String(invoice.receivable_days_overdue || 0)],
      ['Cuotas vencidas', String(invoice.receivable_overdue_installments || 0)],
      ['Cuotas totales', String(invoice.installment_count || 0)],
      ['Intervalo', `${invoice.installment_interval_days || 0} días`],
      ['Método', invoice.payment_method === '04' ? 'A plazos' : invoice.payment_method],
      ['Avance cobrado', `${Number(invoice.receivable_paid_percent || 0).toFixed(2)}%`],
    ]
      .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
      .join('');
    $('receivable-current-balance').value = formatMoney(invoice.receivable_amount_due, invoice.currency);
  }

  function renderInstallmentPlan(invoice) {
    const rows = invoice.receivable_installment_plan || [];
    $('receivable-installments').innerHTML =
      rows
        .map(
          (item) => `
            <div class="receivable-installment-row">
              <div>
                <strong>Cuota ${item.number}</strong><br />
                <span>Vence: ${escapeHtml(formatDate(item.due_date))}</span>
              </div>
              <div>
                <strong>${escapeHtml(formatMoney(item.amount, invoice.currency))}</strong><br />
                <span>Abonado: ${escapeHtml(formatMoney(item.paid_amount, invoice.currency))} · Pendiente: ${escapeHtml(formatMoney(item.pending_amount, invoice.currency))}</span>
              </div>
              <div>${renderStatusBadge(item.status)}</div>
            </div>
          `,
        )
        .join('') || '<p class="subtitle">Esta factura no tiene plan de cuotas disponible.</p>';
  }

  function renderPayments(invoice) {
    const rows = invoice.receivable_payments || [];
    $('receivable-payments').innerHTML =
      rows
        .map(
          (payment) => `
            <div class="receivable-payment-row">
              <div>
                <strong>${escapeHtml(formatMoney(payment.amount, invoice.currency))}</strong><br />
                <span>${escapeHtml(formatDate(payment.payment_date))}${payment.reference ? ` · Ref: ${escapeHtml(payment.reference)}` : ''}</span>
                <div>${payment.notes ? escapeHtml(payment.notes) : ''}</div>
              </div>
              <div>
                <strong>${escapeHtml(payment.created_by || 'Usuario interno')}</strong><br />
                <span>${escapeHtml(formatDateTime(payment.created_at))}</span>
              </div>
            </div>
          `,
        )
        .join('') || '<p class="subtitle">Todavía no hay abonos registrados para esta cuenta.</p>';
  }

  async function openDetail(invoiceId) {
    const invoice = await request(`/invoices/${invoiceId}/?organization_id=${orgId()}`);
    currentDetail = invoice;
    $('receivable-payment-invoice-id').value = String(invoice.id);
    $('receivable-payment-amount').value = Number(invoice.receivable_amount_due || 0).toFixed(2);
    $('receivable-payment-date').value = new Date().toISOString().slice(0, 10);
    $('receivable-payment-reference').value = '';
    $('receivable-payment-notes').value = '';
    renderDetailMeta(invoice);
    renderInstallmentPlan(invoice);
    renderPayments(invoice);
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeDetail() {
    currentDetail = null;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function registerPayment(event) {
    event.preventDefault();
    try {
      const invoiceId = Number($('receivable-payment-invoice-id').value);
      const payload = {
        amount: Number($('receivable-payment-amount').value),
        payment_date: $('receivable-payment-date').value,
        reference: $('receivable-payment-reference').value.trim(),
        notes: $('receivable-payment-notes').value.trim(),
      };
      const updatedInvoice = await request(`/invoices/${invoiceId}/receivable-payments/?organization_id=${orgId()}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const index = allReceivables.findIndex((item) => Number(item.id) === invoiceId);
      if (index >= 0) {
        allReceivables[index] = updatedInvoice;
      }
      currentDetail = updatedInvoice;
      renderDetailMeta(updatedInvoice);
      renderInstallmentPlan(updatedInvoice);
      renderPayments(updatedInvoice);
      renderTable();
      feedback('Abono registrado correctamente.');
    } catch (error) {
      feedback(error.message, true);
    }
  }

  $('reload')?.addEventListener('click', () => loadReceivables().catch((error) => feedback(error.message, true)));
  $('clear-filters')?.addEventListener('click', () => {
    $('status-filter').value = '';
    $('search-filter').value = '';
    renderTable();
  });
  $('organization-id')?.addEventListener('change', () => {
    window.AppSession?.setActiveOrganizationId?.($('organization-id').value);
    loadReceivables().catch((error) => feedback(error.message, true));
  });
  $('status-filter')?.addEventListener('change', renderTable);
  $('search-filter')?.addEventListener('input', renderTable);
  $('receivables-body')?.addEventListener('click', (event) => {
    const id = event.target.dataset.manage;
    if (!id) return;
    openDetail(id).catch((error) => feedback(error.message, true));
  });
  $('receivable-payment-form')?.addEventListener('submit', registerPayment);
  $('receivable-detail-close')?.addEventListener('click', closeDetail);
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) closeDetail();
  });

  renderOrganizations();
  loadReceivables().catch((error) => feedback(error.message, true));
})();
