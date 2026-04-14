(function initBandeja() {
  const $ = (id) => document.getElementById(id);
  const orgId = () => Number($('organization-id').value || window.AppSession?.getActiveOrganizationId?.());
  const syncMeta = $('sync-meta');
  const syncNowButton = $('sync-now');
  const syncProgress = $('sync-progress');
  const syncElapsed = $('sync-elapsed');
  const syncYear = $('sync-year');
  const syncNewCount = $('sync-new-count');
  const syncProcessedCount = $('sync-processed-count');
  const syncScannedCount = $('sync-scanned-count');
  const syncSkippedCount = $('sync-skipped-count');
  let syncTimer = null;
  let syncStartedAt = 0;

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

  function feedback(msg, err = false) {
    $('feedback').textContent = msg;
    $('feedback').style.color = err ? '#ff7d7d' : 'var(--muted)';
  }

  function renderOrganizations() {
    const organizations = window.AppSession?.getOrganizations?.() || [];
    const activeId = Number(window.AppSession?.getActiveOrganizationId?.());
    $('organization-id').innerHTML = organizations.map((org) => `<option value="${org.id}">${org.name}</option>`).join('');
    if (activeId) $('organization-id').value = String(activeId);
  }

  function startSyncProgress() {
    syncStartedAt = Date.now();
    syncNowButton.disabled = true;
    syncProgress.classList.add('is-active');
    syncElapsed.textContent = '0s';
    syncYear.textContent = 'Año 2026';
    syncNewCount.textContent = 'Nuevas: 0';
    syncProcessedCount.textContent = 'Procesadas: 0';
    syncScannedCount.textContent = 'Leídas: 0';
    syncSkippedCount.textContent = 'Descartadas: 0';
    syncNowButton.textContent = 'Sincronizando...';
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(() => {
      const seconds = Math.max(0, Math.floor((Date.now() - syncStartedAt) / 1000));
      syncElapsed.textContent = `${seconds}s`;
    }, 1000);
  }

  function finishSyncProgress(result) {
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = null;
    syncNowButton.disabled = false;
    syncNowButton.textContent = 'Sincronizar ahora';
    if (result) {
      syncYear.textContent = `Año ${result?.year || 2026}`;
      syncNewCount.textContent = `Nuevas: ${result?.created || 0}`;
      syncProcessedCount.textContent = `Procesadas: ${result?.processed_messages || 0}`;
      syncScannedCount.textContent = `Leídas: ${result?.scanned_messages || 0}`;
      syncSkippedCount.textContent = `Descartadas: ${result?.skipped_non_invoice || 0}`;
    } else {
      syncProgress.classList.remove('is-active');
    }
  }

  async function syncInbox(showToast = true) {
    startSyncProgress();
    try {
      const result = await request('/purchase-inbox/sync/', {
        method: 'POST',
        body: JSON.stringify({ organization: orgId() }),
      });

      finishSyncProgress(result);

      if (syncMeta && result?.synced_at) {
        syncMeta.textContent = `Última sync: ${new Date(result.synced_at).toLocaleString()} - Año ${result?.year || 2026} - Auto-sync cada 5 min`;
      }

      if (showToast) {
        const errors = Array.isArray(result?.errors) ? result.errors.filter(Boolean) : [];
        const truncationNote = result?.truncated
          ? ` Se limitaron a las ${result?.scanned_messages || 0} más recientes de ${result?.total_candidates || 0} correos del año.`
          : '';
        const message = `Sync ${result?.year || 2026} completada. Nuevas: ${result?.created || 0}. Actualizadas: ${result?.updated || 0}. Procesadas: ${result?.processed_messages || 0}. Descartadas por no ser factura: ${result?.skipped_non_invoice || 0}.${truncationNote}`;
        feedback(errors.length ? `${message} Errores: ${errors.join(' | ')}` : message, errors.length > 0);
      }
      return result;
    } catch (error) {
      finishSyncProgress();
      throw error;
    }
  }

  async function loadInbox(showMessage = true) {
    const status = $('status-filter').value;
    const query = status ? `&status=${status}` : '';
    const rows = await request(`/purchase-inbox/?organization_id=${orgId()}${query}`);
    $('inbox-body').innerHTML =
      rows
        .map(
          (i) =>
            `<tr><td>${i.issue_date}</td><td>${i.supplier_name}</td><td>${i.invoice_number}</td><td>CRC ${i.subtotal}</td><td>CRC ${i.tax_total}</td><td>CRC ${i.total}</td><td>${i.status}</td><td>${i.status === 'pending' || i.status === 'in_process' ? `<button class='btn btn-secondary' data-approve='${i.id}'>Aprobar</button> <button class='btn btn-secondary' data-reject='${i.id}'>Rechazar</button>` : '-'}</td></tr>`
        )
        .join('') || '<tr><td colspan="8">Sin facturas electronicas.</td></tr>';
    if (showMessage) {
      feedback(`Mostrando ${rows.length} factura(s) en bandeja.`);
    }
  }

  $('inbox-body').addEventListener('click', async (event) => {
    const idApprove = event.target.dataset.approve;
    const idReject = event.target.dataset.reject;
    try {
      if (idApprove) await request(`/purchase-inbox/${idApprove}/approve/`, { method: 'POST' });
      if (idReject) await request(`/purchase-inbox/${idReject}/reject/`, { method: 'POST' });
      await loadInbox(true);
    } catch (error) {
      feedback(error.message, true);
    }
  });

  $('organization-id').addEventListener('change', () => {
    window.AppSession?.setActiveOrganizationId?.($('organization-id').value);
    syncInbox(false).then(() => loadInbox(false)).catch((e) => feedback(e.message, true));
  });
  $('status-filter').addEventListener('change', () => loadInbox().catch((e) => feedback(e.message, true)));
  syncNowButton.addEventListener('click', () => syncInbox(true).then(() => loadInbox(false)).catch((e) => feedback(e.message, true)));

  renderOrganizations();
  syncInbox(false).then(() => loadInbox(false)).catch((e) => feedback(e.message, true));
  setInterval(() => {
    syncInbox(false).then(() => loadInbox(false)).catch(() => null);
  }, 5 * 60 * 1000);
})();
