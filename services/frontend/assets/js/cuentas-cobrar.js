(function initCuentasCobrar() {
  const $ = (id) => document.getElementById(id);
  const apiBase = () => '/api';
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
  let isSubmittingPayment = false;

  function getRequestedInvoiceId() {
    return Number(new URLSearchParams(window.location.search).get('invoice_id') || 0);
  }

  function orgId() {
    const id = Number($('organization-id')?.value || window.AppSession?.getActiveOrganizationId?.());
    if (!id || id < 1) {
      throw new Error('No hay organizacion activa. Selecciona una organizacion valida.');
    }
    return id;
  }

  async function request(path, options) {
    const response = await fetch(`${apiBase()}${path}`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      credentials: 'include',
      ...options,
    });
    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      if (contentType.includes('application/json') && text) {
        const payload = JSON.parse(text);
        throw new Error(formatApiError(payload) || 'Error de API');
      }
      throw new Error(text || 'Error de API');
    }
    if (!text) return null;
    if (!contentType.includes('application/json')) {
      throw new Error('Respuesta no JSON. Revise la configuracion del backend/proxy.');
    }
    return JSON.parse(text);
  }

  function formatApiError(payload) {
    if (!payload) return '';
    if (typeof payload === 'string') return payload;
    if (payload.detail) return payload.detail;
    if (Array.isArray(payload)) return payload.join(' | ');
    return Object.entries(payload)
      .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
      .join(' | ');
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
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('es-CR', { dateStyle: 'medium' });
  }

  function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function feedback(msg, error = false, { showInline = false, showToast = true } = {}) {
    if ($('feedback')) {
      $('feedback').textContent = showInline ? msg : '';
      $('feedback').style.color = error ? '#ff6b6b' : 'var(--muted)';
    }
    if (msg && showToast && window.appAlerts?.toast) {
      window.appAlerts.toast(msg, error ? 'error' : 'success');
    }
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

  function isPaid(invoice) {
    return invoice?.receivable_status === 'paid' || Number(invoice?.receivable_amount_due || 0) <= 0;
  }

  function renderReceivableRow(invoice) {
    const paidPercent = Math.min(100, Math.max(0, Number(invoice.receivable_paid_percent || 0)));
    const paid = isPaid(invoice);
    return `
      <tr>
        <td><strong>${escapeHtml(invoice.invoice_number)}</strong><span class="receivable-row-meta">${paidPercent.toFixed(0)}% cobrado</span></td>
        <td><strong>${escapeHtml(invoice.customer_name)}</strong></td>
        <td>${formatMoney(invoice.total, invoice.currency)}</td>
        <td>${formatMoney(invoice.receivable_amount_paid, invoice.currency)}</td>
        <td>${formatMoney(invoice.receivable_amount_due, invoice.currency)}</td>
        <td>${formatDate(invoice.receivable_next_due_date || invoice.receivable_final_due_date)}</td>
        <td>${renderStatusBadge(invoice.receivable_status)}</td>
        <td><button class="btn ${paid ? 'btn-secondary' : 'btn-primary'}" type="button" data-manage="${invoice.id}">${paid ? 'Ver detalle' : 'Gestionar'}</button></td>
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

  function renderTable() {
    const filtered = getFilteredReceivables();
    if (receivablesPager) {
      receivablesPager.update(filtered);
    } else {
      $('receivables-body').innerHTML =
        filtered.map((item) => renderReceivableRow(item)).join('') ||
        '<tr><td colspan="8">Sin cuentas por cobrar para mostrar.</td></tr>';
    }
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
    const paidPercent = Math.min(100, Math.max(0, Number(invoice.receivable_paid_percent || 0)));
    const paid = isPaid(invoice);
    $('receivable-detail-title').textContent = `Cuenta ${invoice.invoice_number}`;
    $('receivable-detail-subtitle').textContent = `${invoice.customer_name} · Emitida ${formatDateTime(invoice.issue_date)}`;
    $('receivable-hero-balance').textContent = formatMoney(invoice.receivable_amount_due, invoice.currency);
    $('receivable-hero-status').innerHTML = `${renderStatusBadge(invoice.receivable_status)} ${
      paid
        ? 'Cuenta cerrada'
        : `Proximo vencimiento: ${escapeHtml(formatDate(invoice.receivable_next_due_date || invoice.receivable_final_due_date))}`
    }`;
    $('receivable-progress-bar').style.width = `${paidPercent}%`;
    $('receivable-progress-label').textContent = `${paidPercent.toFixed(2)}% cobrado`;
    $('receivable-detail-meta').innerHTML = [
      ['Total factura', formatMoney(invoice.total, invoice.currency)],
      ['Abonado', formatMoney(invoice.receivable_amount_paid, invoice.currency)],
      ['Saldo pendiente', formatMoney(invoice.receivable_amount_due, invoice.currency)],
      ['Estado', receivableStatusLabel(invoice.receivable_status)],
      ['Proximo vencimiento', formatDate(invoice.receivable_next_due_date)],
      ['Vencimiento final', formatDate(invoice.receivable_final_due_date)],
      ['Dias de mora', String(invoice.receivable_days_overdue || 0)],
      ['Cuotas vencidas', String(invoice.receivable_overdue_installments || 0)],
      ['Cuotas totales', String(invoice.installment_count || 0)],
      ['Intervalo', `${invoice.installment_interval_days || 0} dias`],
      ['Metodo', invoice.payment_method === '05' ? 'A plazos' : invoice.payment_method],
      ['Avance cobrado', `${paidPercent.toFixed(2)}%`],
    ]
      .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
      .join('');
    $('receivable-current-balance').value = formatMoney(invoice.receivable_amount_due, invoice.currency);
    syncPaymentFormState(invoice);
  }

  function syncPaymentFormState(invoice = currentDetail) {
    if (!invoice) return;
    const amountDue = Number(invoice.receivable_amount_due || 0);
    const amount = Number($('receivable-payment-amount').value || 0);
    const paymentDate = $('receivable-payment-date').value;
    const paid = isPaid(invoice);
    const invalidAmount = !Number.isFinite(amount) || amount <= 0 || amount > amountDue;
    const invalidDate = !paymentDate;
    const submit = $('receivable-payment-submit');
    const help = $('receivable-payment-help');

    $('receivable-payment-amount').max = amountDue > 0 ? amountDue.toFixed(2) : '0.00';
    submit.disabled = isSubmittingPayment || paid || invalidAmount || invalidDate;
    help.classList.toggle('is-error', !paid && (invalidAmount || invalidDate));

    if (paid) {
      help.textContent = 'Cuenta pagada. No se pueden registrar mas abonos.';
    } else if (invalidAmount && amount > amountDue) {
      help.textContent = `El monto no puede superar el saldo pendiente: ${formatMoney(amountDue, invoice.currency)}.`;
    } else if (invalidAmount) {
      help.textContent = 'Ingresa un monto mayor a cero.';
    } else if (invalidDate) {
      help.textContent = 'Selecciona la fecha del abono.';
    } else {
      help.textContent = `Saldo disponible para aplicar: ${formatMoney(amountDue, invoice.currency)}.`;
    }
  }

  function renderInstallmentPlan(invoice) {
    const rows = invoice.receivable_installment_plan || [];
    $('receivable-installments').innerHTML =
      rows
        .map(
          (item) => `
            <div class="receivable-installment-row receivable-installment-row--${escapeHtml(item.status)}">
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
                <div class="actions">
                  <a class="btn btn-secondary" href="/api/invoices/${invoice.id}/receivable-payments/${payment.id}/receipt/?organization_id=${invoice.organization}" target="_blank" rel="noopener">Comprobante</a>
                </div>
              </div>
            </div>
          `,
        )
        .join('') || '<p class="subtitle">Todavia no hay abonos registrados para esta cuenta.</p>';
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
    document.body.classList.add('modal-open');
    window.setTimeout(() => {
      if (!isPaid(invoice)) {
        $('receivable-payment-amount')?.focus();
        $('receivable-payment-amount')?.select();
      }
    }, 20);
  }

  function closeDetail() {
    currentDetail = null;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  async function registerPayment(event) {
    event.preventDefault();
    if (isSubmittingPayment || !currentDetail) return;

    const invoiceId = Number($('receivable-payment-invoice-id').value);
    const amountDue = Number(currentDetail.receivable_amount_due || 0);
    const amount = Number($('receivable-payment-amount').value);
    if (isPaid(currentDetail)) {
      return feedback('La cuenta ya esta pagada. No se pueden registrar mas abonos.', true);
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      syncPaymentFormState();
      return feedback('Ingresa un monto valido para el abono.', true);
    }
    if (amount > amountDue) {
      syncPaymentFormState();
      return feedback(`El abono supera el saldo pendiente: ${formatMoney(amountDue, currentDetail.currency)}.`, true);
    }

    try {
      const payload = {
        amount,
        payment_date: $('receivable-payment-date').value,
        reference: $('receivable-payment-reference').value.trim(),
        notes: $('receivable-payment-notes').value.trim(),
      };
      isSubmittingPayment = true;
      $('receivable-payment-submit').disabled = true;
      $('receivable-payment-submit').textContent = 'Registrando...';
      const paymentResult = await request(`/invoices/${invoiceId}/receivable-payments/?organization_id=${orgId()}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const updatedInvoice = paymentResult?.invoice || paymentResult;
      const index = allReceivables.findIndex((item) => Number(item.id) === invoiceId);
      if (index >= 0) allReceivables[index] = updatedInvoice;
      currentDetail = updatedInvoice;
      $('receivable-payment-amount').value = Number(updatedInvoice.receivable_amount_due || 0).toFixed(2);
      $('receivable-payment-reference').value = '';
      $('receivable-payment-notes').value = '';
      renderDetailMeta(updatedInvoice);
      renderInstallmentPlan(updatedInvoice);
      renderPayments(updatedInvoice);
      renderTable();
      feedback('Abono registrado correctamente.');
      if (paymentResult?.receipt_url) {
        window.open(paymentResult.receipt_url, '_blank', 'noopener');
      }
    } catch (error) {
      feedback(error.message, true);
    } finally {
      isSubmittingPayment = false;
      $('receivable-payment-submit').textContent = 'Registrar abono';
      syncPaymentFormState();
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
    const button = event.target.closest('[data-manage]');
    if (!button) return;
    openDetail(button.dataset.manage).catch((error) => feedback(error.message, true));
  });
  $('receivable-payment-form')?.addEventListener('submit', registerPayment);
  $('receivable-payment-amount')?.addEventListener('input', () => syncPaymentFormState());
  $('receivable-payment-date')?.addEventListener('change', () => syncPaymentFormState());
  $('receivable-detail-close')?.addEventListener('click', closeDetail);
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) closeDetail();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal?.classList.contains('is-open')) closeDetail();
  });

  renderOrganizations();
  loadReceivables().catch((error) => feedback(error.message, true));
})();
