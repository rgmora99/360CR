(function initFacturas() {
  const $ = (id) => document.getElementById(id);
  const apiBase = () => '/api';
  const modal = $('invoice-detail-modal');
  const modalTitle = $('invoice-detail-title');
  const modalSubtitle = $('invoice-detail-subtitle');
  const modalMeta = $('invoice-detail-meta');
  const modalExtra = $('invoice-detail-extra');
  const modalLines = $('invoice-detail-lines');
  const modalActions = $('invoice-detail-actions');
  const modalAudit = $('invoice-detail-audit');
  const monthFilter = $('month-filter');
  const searchFilter = $('search-filter');
  const paymentFilter = $('payment-filter');
  const documentFilter = $('document-filter');
  const statusFilter = $('status-filter');
  const pointsFilter = $('points-filter');
  let currentInvoices = [];
  let selectedInvoiceId = null;

  const documentTypeLabels = { '01': 'Factura electronica', '03': 'Nota de credito' };
  const paymentMethodLabels = { '01': 'Efectivo', '02': 'Tarjeta', '03': 'Transferencia', '04': 'SINPE Movil', '05': 'A plazos' };
  const taxRegimeLabels = { simplified: 'Regimen simplificado', general: 'Regimen general' };
  const statusLabels = { draft: 'Borrador', issued: 'Emitida', sent: 'Enviada', paid: 'Pagada', overdue: 'Vencida', void: 'Anulada' };
  const actionLabels = { void: 'Anulacion', credit_note: 'Nota de credito', email_sent: 'Correo enviado', payment: 'Pago registrado' };

  const invoicesPager = window.TablePaginator?.create({
    key: 'invoices',
    tableBody: $('invoices-body'),
    totalColumns: 7,
    emptyMessage: 'Sin facturas emitidas',
    rowRenderer: renderInvoiceRow,
  });

  const orgId = () => {
    const id = Number($('organization-id')?.value || window.AppSession?.getActiveOrganizationId?.());
    if (!id || id < 1) throw new Error('No hay organizacion activa. Selecciona una organizacion en la barra superior.');
    return id;
  };

  async function request(path, options) {
    const response = await fetch(`${apiBase()}${path}`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      credentials: 'include',
      ...options,
    });
    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      if (contentType.includes('application/json')) {
        try {
          throw new Error(formatApiError(JSON.parse(text)) || 'Error de API');
        } catch (error) {
          if (error instanceof Error) throw error;
        }
      }
      throw new Error(text || 'Error de API');
    }
    if (!text) return null;
    if (!contentType.includes('application/json')) throw new Error('Respuesta no JSON. Revise la configuracion del backend/proxy.');
    return JSON.parse(text);
  }

  function formatApiError(payload) {
    if (!payload) return '';
    if (typeof payload === 'string') return payload;
    if (payload.detail) return payload.detail;
    return Object.entries(payload)
      .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
      .join(' | ');
  }

  function feedback(msg, error = false) {
    $('feedback').textContent = msg;
    $('feedback').style.color = error ? '#ff6b6b' : 'var(--muted)';
    if (window.appAlerts?.toast && msg) window.appAlerts.toast(msg, error ? 'error' : 'success');
  }

  function renderOrganizations() {
    const select = $('organization-id');
    if (!select) return;
    const organizations = window.AppSession?.getOrganizations?.() || [];
    const activeId = Number(window.AppSession?.getActiveOrganizationId?.());
    select.innerHTML = organizations.map((org) => `<option value="${org.id}">${escapeHtml(org.name)}</option>`).join('');
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
    return new Intl.NumberFormat('es-CR', { style: 'currency', currency: String(currency || 'CRC').toUpperCase() }).format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function formatDateOnly(value) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('es-CR', { dateStyle: 'medium' });
  }

  function effectiveStatus(invoice) {
    return invoice.effective_status || invoice.status || 'issued';
  }

  function statusBadge(invoice) {
    const status = effectiveStatus(invoice);
    return `<span class="invoice-status-badge invoice-status-badge--${escapeHtml(status)}">${escapeHtml(statusLabels[status] || status)}</span>`;
  }

  function receivableStatusLabel(status) {
    const labels = { pending: 'Pendiente', partial: 'Parcial', overdue: 'Vencida', paid: 'Pagada', due_today: 'Vence hoy', not_applicable: 'No aplica' };
    return labels[status] || '-';
  }

  function renderPendingBalance(invoice) {
    if (invoice.payment_method !== '05') return 'N/A';
    const toneClass = invoice.receivable_is_overdue ? 'receivable-highlight' : '';
    return `<span class="${toneClass}">${escapeHtml(formatMoney(invoice.receivable_amount_due, invoice.currency))}</span><br /><small>${escapeHtml(receivableStatusLabel(invoice.receivable_status))}</small>`;
  }

  function renderRowActions(invoice) {
    const canCreditNote = invoice.status !== 'void' && invoice.document_type === '01' && Number(invoice.credit_note_count || 0) === 0;
    const canVoid = canCreditNote && Number(invoice.receivable_payment_count || 0) === 0;
    return `
      <div class="invoice-actions-cell">
        <button class="btn btn-secondary invoice-action-primary" data-detail="${invoice.id}">Detalles</button>
        <div class="invoice-actions-menu">
          <button class="btn btn-secondary invoice-actions-trigger" type="button" data-actions-toggle="${invoice.id}" aria-haspopup="true" aria-expanded="false">Mas</button>
          <div class="invoice-actions-dropdown" data-actions-menu="${invoice.id}" role="menu">
            <a href="${apiBase()}/invoices/${invoice.id}/pdf/" target="_blank" role="menuitem">Descargar PDF</a>
            <button type="button" data-mail="${invoice.id}" role="menuitem" ${invoice.status === 'void' ? 'disabled' : ''}>Enviar correo</button>
            ${canCreditNote ? `<button type="button" data-credit-note="${invoice.id}" role="menuitem">Crear nota credito</button>` : ''}
            ${canVoid ? `<button type="button" data-void="${invoice.id}" role="menuitem" class="is-danger">Anular factura</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function renderInvoiceRow(invoice) {
    return `<tr>
      <td>${escapeHtml(invoice.invoice_number)}</td>
      <td>${escapeHtml(invoice.customer_name)}</td>
      <td>${statusBadge(invoice)}</td>
      <td>${formatMoney(invoice.total, invoice.currency)}</td>
      <td>${renderPendingBalance(invoice)}</td>
      <td>${formatDate(invoice.issue_date)}</td>
      <td>${renderRowActions(invoice)}</td>
    </tr>`;
  }

  function positionActionMenu(toggle, menu) {
    const rect = toggle.getBoundingClientRect();
    const menuWidth = 178;
    const margin = 10;
    const left = Math.min(window.innerWidth - menuWidth - margin, Math.max(margin, rect.right - menuWidth));
    const top = Math.min(window.innerHeight - margin, rect.bottom + 6);
    menu.style.setProperty('--menu-left', `${left}px`);
    menu.style.setProperty('--menu-top', `${top}px`);
  }

  function getCurrentMonthValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  function getInvoiceMonth(invoice) {
    const date = new Date(invoice.issue_date);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function getFilteredInvoices() {
    const monthValue = monthFilter?.value || getCurrentMonthValue();
    const searchValue = searchFilter?.value.trim().toLowerCase() || '';
    const paymentValue = paymentFilter?.value || '';
    const documentValue = documentFilter?.value || '';
    const statusValue = statusFilter?.value || '';
    const pointsValue = pointsFilter?.value || '';
    return currentInvoices.filter((invoice) => {
      const haystack = `${invoice.invoice_number || ''} ${invoice.customer_name || ''} ${invoice.notes || ''}`.toLowerCase();
      const hasPoints = Number(invoice.loyalty_redeemed_points || 0) > 0;
      return (
        (!monthValue || getInvoiceMonth(invoice) === monthValue) &&
        (!searchValue || haystack.includes(searchValue)) &&
        (!paymentValue || invoice.payment_method === paymentValue) &&
        (!documentValue || invoice.document_type === documentValue) &&
        (!statusValue || effectiveStatus(invoice) === statusValue) &&
        (!pointsValue || (pointsValue === 'with-points' ? hasPoints : !hasPoints))
      );
    });
  }

  function renderInvoiceTable() {
    const filteredInvoices = getFilteredInvoices();
    if (invoicesPager) {
      invoicesPager.update(filteredInvoices);
      return;
    }
    $('invoices-body').innerHTML = filteredInvoices.map(renderInvoiceRow).join('') || '<tr><td colspan="7">Sin facturas emitidas</td></tr>';
  }

  function monthDateRange() {
    const monthValue = monthFilter?.value || getCurrentMonthValue();
    const [year, month] = monthValue.split('-').map(Number);
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0);
    const end = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
    return { start, end };
  }

  async function loadInvoices() {
    currentInvoices = await request(`/invoices/?organization_id=${orgId()}`);
    renderInvoiceTable();
    const requestedInvoiceId = Number(new URLSearchParams(window.location.search).get('invoice_id') || 0);
    if (requestedInvoiceId && currentInvoices.some((invoice) => Number(invoice.id) === requestedInvoiceId)) await openInvoiceDetail(requestedInvoiceId);
  }

  function renderMeta(container, entries) {
    container.innerHTML = entries.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  }

  function renderAudit(invoice) {
    const rows = invoice.audit_logs || [];
    modalAudit.innerHTML =
      rows
        .map(
          (log) => `
            <div class="invoice-detail-audit__item">
              <strong>${escapeHtml(actionLabels[log.action] || log.action)}</strong>
              <small>${escapeHtml(formatDate(log.created_at))}${log.created_by ? ` · ${escapeHtml(log.created_by)}` : ''}</small>
              ${log.reason ? `<small>${escapeHtml(log.reason)}</small>` : ''}
            </div>
          `,
        )
        .join('') || '<p class="subtitle">Sin movimientos auditados.</p>';
  }

  async function openInvoiceDetail(id) {
    selectedInvoiceId = Number(id);
    const invoice = await request(`/invoices/${id}/?organization_id=${orgId()}`);
    modalTitle.textContent = `${documentTypeLabels[invoice.document_type] || 'Documento'} ${invoice.invoice_number}`;
    modalSubtitle.textContent = `${invoice.customer_name} · ${formatDate(invoice.issue_date)}`;
    renderMeta(modalMeta, [
      ['Cliente', invoice.customer_name],
      ['Numero', invoice.invoice_number],
      ['Documento', documentTypeLabels[invoice.document_type] || invoice.document_type],
      ['Estado', statusLabels[effectiveStatus(invoice)] || effectiveStatus(invoice)],
      ['Factura origen', invoice.original_invoice_number || 'N/A'],
      ['Notas de credito', String(invoice.credit_note_count || 0)],
      ['Subtotal', formatMoney(invoice.subtotal, invoice.currency)],
      ['Impuesto', formatMoney(invoice.tax_total, invoice.currency)],
      ['Descuento', formatMoney(invoice.discount_total, invoice.currency)],
      ['Total', formatMoney(invoice.total, invoice.currency)],
    ]);
    renderMeta(modalExtra, [
      ['Condicion de venta', invoice.sale_condition === '01' ? 'Contado' : invoice.sale_condition === '02' ? 'Credito' : invoice.sale_condition],
      ['Metodo de pago', paymentMethodLabels[invoice.payment_method] || invoice.payment_method],
      ['Regimen fiscal', taxRegimeLabels[invoice.tax_regime] || invoice.tax_regime],
      ['Saldo pendiente', formatMoney(invoice.receivable_amount_due, invoice.currency)],
      ['Abonado', formatMoney(invoice.receivable_amount_paid, invoice.currency)],
      ['Estado CxC', receivableStatusLabel(invoice.receivable_status)],
      ['Proximo vencimiento', formatDateOnly(invoice.receivable_next_due_date)],
      ['Correo enviado', invoice.email_sent_at ? formatDate(invoice.email_sent_at) : 'Pendiente'],
      ['Anulada', invoice.voided_at ? formatDate(invoice.voided_at) : 'No'],
      ['Motivo anulacion', invoice.void_reason || 'N/A'],
    ]);
    modalLines.innerHTML =
      (invoice.items || [])
        .map(
          (item) => `<div class="invoice-detail-line"><div><strong>${escapeHtml(item.description)}</strong><br /><span>${escapeHtml(item.quantity)} x ${escapeHtml(formatMoney(item.unit_price, invoice.currency))}</span></div><strong>${escapeHtml(formatMoney(item.total, invoice.currency))}</strong></div>`,
        )
        .join('') || '<p class="subtitle">Esta factura no tiene lineas cargadas.</p>';
    const canCreditNote = invoice.status !== 'void' && invoice.document_type === '01' && Number(invoice.credit_note_count || 0) === 0;
    const canVoid = canCreditNote && Number(invoice.receivable_payment_count || 0) === 0;
    modalActions.innerHTML = `
      <a class="btn btn-secondary" href="${apiBase()}/invoices/${invoice.id}/pdf/" target="_blank">Descargar PDF</a>
      <button class="btn btn-secondary" data-send-mail="${invoice.id}" ${invoice.status === 'void' ? 'disabled' : ''}>Enviar por correo</button>
      ${invoice.payment_method === '05' ? `<a class="btn btn-secondary" href="/cuentas-cobrar.html?invoice_id=${invoice.id}">Abrir CxC</a>` : ''}
      ${canCreditNote ? `<button class="btn btn-secondary" data-credit-note-action="${invoice.id}">Crear nota credito</button>` : ''}
      ${canVoid ? `<button class="btn btn-secondary" data-void-action="${invoice.id}">Anular</button>` : ''}
    `;
    renderAudit(invoice);
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  async function askReason(title, placeholder) {
    if (window.Swal) {
      const result = await window.Swal.fire({
        title,
        input: 'textarea',
        inputPlaceholder: placeholder,
        inputAttributes: { maxlength: 500 },
        showCancelButton: true,
        confirmButtonText: 'Confirmar',
        cancelButtonText: 'Cancelar',
        inputValidator: (value) => (!value || value.trim().length < 10 ? 'Indica un motivo de al menos 10 caracteres.' : undefined),
      });
      return result.isConfirmed ? result.value.trim() : '';
    }
    return (window.prompt(`${title}\n${placeholder}`) || '').trim();
  }

  async function sendEmail(id) {
    await request(`/invoices/${id}/send-email/`, { method: 'POST' });
    feedback('Correo enviado al cliente.');
    await loadInvoices();
    if (selectedInvoiceId) await openInvoiceDetail(selectedInvoiceId);
  }

  async function voidInvoice(id) {
    const reason = await askReason('Anular factura', 'Describe por que se anula esta factura.');
    if (!reason) return;
    await request(`/invoices/${id}/void/?organization_id=${orgId()}`, { method: 'POST', body: JSON.stringify({ reason }) });
    feedback('Factura anulada correctamente.');
    await loadInvoices();
    await openInvoiceDetail(id);
  }

  async function createCreditNote(id) {
    const reason = await askReason('Crear nota de credito', 'Describe el motivo de la nota de credito.');
    if (!reason) return;
    const creditNote = await request(`/invoices/${id}/credit-note/?organization_id=${orgId()}`, { method: 'POST', body: JSON.stringify({ reason }) });
    feedback(`Nota de credito creada: ${creditNote.invoice_number}.`);
    await loadInvoices();
    await openInvoiceDetail(creditNote.id);
  }

  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    selectedInvoiceId = null;
  }

  $('reload').addEventListener('click', () => loadInvoices().catch((e) => feedback(e.message, true)));
  $('clear-filters')?.addEventListener('click', () => {
    if (monthFilter) monthFilter.value = getCurrentMonthValue();
    if (searchFilter) searchFilter.value = '';
    if (paymentFilter) paymentFilter.value = '';
    if (documentFilter) documentFilter.value = '';
    if (statusFilter) statusFilter.value = '';
    if (pointsFilter) pointsFilter.value = '';
    renderInvoiceTable();
  });
  $('organization-id').addEventListener('change', () => {
    window.AppSession?.setActiveOrganizationId?.($('organization-id').value);
    loadInvoices().catch((e) => feedback(e.message, true));
  });
  [monthFilter, searchFilter, paymentFilter, documentFilter, statusFilter, pointsFilter].forEach((element) => {
    element?.addEventListener(element === searchFilter ? 'input' : 'change', () => {
      renderInvoiceTable();
    });
  });
  document.addEventListener('click', async (event) => {
    const target = event.target;
    const toggle = target.closest('[data-actions-toggle]');
    if (toggle) {
      const menuId = toggle.dataset.actionsToggle;
      const menu = document.querySelector(`[data-actions-menu="${menuId}"]`);
      const isOpen = menu?.classList.contains('is-open');
      document.querySelectorAll('.invoice-actions-dropdown.is-open').forEach((node) => node.classList.remove('is-open'));
      document.querySelectorAll('[data-actions-toggle][aria-expanded="true"]').forEach((node) => node.setAttribute('aria-expanded', 'false'));
      if (menu && !isOpen) {
        positionActionMenu(toggle, menu);
        menu.classList.add('is-open');
        toggle.setAttribute('aria-expanded', 'true');
      }
      return;
    }
    if (!target.closest('.invoice-actions-menu')) {
      document.querySelectorAll('.invoice-actions-dropdown.is-open').forEach((node) => node.classList.remove('is-open'));
      document.querySelectorAll('[data-actions-toggle][aria-expanded="true"]').forEach((node) => node.setAttribute('aria-expanded', 'false'));
    }
    const detailId = target.dataset.detail;
    const mailId = target.dataset.mail || target.dataset.sendMail;
    const voidId = target.dataset.void || target.dataset.voidAction;
    const noteId = target.dataset.creditNote || target.dataset.creditNoteAction;
    try {
      if (detailId) return openInvoiceDetail(detailId);
      if (mailId) return sendEmail(mailId);
      if (voidId) return voidInvoice(voidId);
      if (noteId) return createCreditNote(noteId);
    } catch (error) {
      feedback(error.message, true);
    }
  });
  $('invoice-detail-close')?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  renderOrganizations();
  if (monthFilter) monthFilter.value = getCurrentMonthValue();
  loadInvoices().catch((e) => feedback(e.message, true));
})();
