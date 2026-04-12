(function initBandeja() {
  const $ = (id) => document.getElementById(id);
  const orgId = () => Number($('organization-id').value || window.AppSession?.getActiveOrganizationId?.());
  const syncMeta = $('sync-meta');
  async function request(path, options) {
    const response = await fetch(`/api${path}`, { headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, credentials: 'include', ...options });
    const text = await response.text();
    if (!response.ok) throw new Error(text || 'Error de API');
    return text ? JSON.parse(text) : null;
  }
  function feedback(msg, err = false) { $('feedback').textContent = msg; $('feedback').style.color = err ? '#ff7d7d' : 'var(--muted)'; }
  function renderOrganizations() {
    const organizations = window.AppSession?.getOrganizations?.() || [];
    const activeId = Number(window.AppSession?.getActiveOrganizationId?.());
    $('organization-id').innerHTML = organizations.map((org) => `<option value="${org.id}">${org.name}</option>`).join('');
    if (activeId) $('organization-id').value = String(activeId);
  }

  async function syncInbox(showToast = true) {
    const result = await request('/purchase-inbox/sync/', {
      method: 'POST',
      body: JSON.stringify({ organization: orgId() }),
    });
    if (syncMeta && result?.synced_at) {
      syncMeta.textContent = `Última sync: ${new Date(result.synced_at).toLocaleString()} · Auto-sync cada 5 min`;
    }
    if (showToast) {
      feedback(result?.detail || 'Sincronización ejecutada.');
    }
  }

  async function loadInbox() {
    const status = $('status-filter').value;
    const query = status ? `&status=${status}` : '';
    const rows = await request(`/purchase-inbox/?organization_id=${orgId()}${query}`);
    $('inbox-body').innerHTML = rows.map((i) => `<tr><td>${i.issue_date}</td><td>${i.supplier_name}</td><td>${i.invoice_number}</td><td>₡${i.subtotal}</td><td>₡${i.tax_total}</td><td>₡${i.total}</td><td>${i.status}</td><td>${i.status === 'pending' || i.status === 'in_process' ? `<button class='btn btn-secondary' data-approve='${i.id}'>Aprobar</button> <button class='btn btn-secondary' data-reject='${i.id}'>Rechazar</button>` : '-'}</td></tr>`).join('') || '<tr><td colspan="8">Sin facturas electrónicas.</td></tr>';
    feedback(`Mostrando ${rows.length} factura(s) en bandeja.`);
  }
  $('inbox-body').addEventListener('click', async (event) => {
    const idApprove = event.target.dataset.approve;
    const idReject = event.target.dataset.reject;
    try {
      if (idApprove) await request(`/purchase-inbox/${idApprove}/approve/`, { method: 'POST' });
      if (idReject) await request(`/purchase-inbox/${idReject}/reject/`, { method: 'POST' });
      await loadInbox();
    } catch (error) {
      feedback(error.message, true);
    }
  });
  $('organization-id').addEventListener('change', () => { window.AppSession?.setActiveOrganizationId?.($('organization-id').value); syncInbox(false).then(loadInbox).catch((e) => feedback(e.message, true)); });
  $('status-filter').addEventListener('change', () => loadInbox().catch((e) => feedback(e.message, true)));
  $('sync-now').addEventListener('click', () => syncInbox(true).then(loadInbox).catch((e) => feedback(e.message, true)));
  renderOrganizations();
  syncInbox(false).then(loadInbox).catch((e) => feedback(e.message, true));
  setInterval(() => {
    syncInbox(false).then(loadInbox).catch(() => null);
  }, 5 * 60 * 1000);
})();
