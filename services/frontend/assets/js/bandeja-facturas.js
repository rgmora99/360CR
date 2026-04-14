(function initBandeja() {
  const $ = (id) => document.getElementById(id);
  const orgId = () => Number($('organization-id').value || window.AppSession?.getActiveOrganizationId?.());
  const syncMeta = $('sync-meta');
  const syncNowButton = $('sync-now');
  const syncPrevButton = $('sync-prev');
  const syncNextButton = $('sync-next');
  const syncProgress = $('sync-progress');
  const syncElapsed = $('sync-elapsed');
  const syncYear = $('sync-year');
  const syncRange = $('sync-range');
  const syncNewCount = $('sync-new-count');
  const syncProcessedCount = $('sync-processed-count');
  const syncScannedCount = $('sync-scanned-count');
  const syncSkippedCount = $('sync-skipped-count');
  const syncOffsetInput = $('sync-offset');
  const syncLimitInput = $('sync-limit');
  const syncYearInput = $('sync-year-input');
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

  function getSyncFilters() {
    const year = 2026;
    const offset = Math.max(0, Number(syncOffsetInput.value || 0));
    const limit = Math.min(500, Math.max(1, Number(syncLimitInput.value || 150)));
    syncYearInput.value = String(year);
    syncOffsetInput.value = String(offset);
    syncLimitInput.value = String(limit);
    return { year, offset, limit };
  }

  function renderSyncRange(offset, limit) {
    const end = offset + Math.max(limit - 1, 0);
    syncRange.textContent = `Lote ${offset} - ${end}`;
  }

  function startSyncProgress() {
    const { year, offset, limit } = getSyncFilters();
    syncStartedAt = Date.now();
    syncNowButton.disabled = true;
    syncPrevButton.disabled = true;
    syncNextButton.disabled = true;
    syncProgress.classList.add('is-active');
    syncElapsed.textContent = '0s';
    syncYear.textContent = `Año ${year}`;
    renderSyncRange(offset, limit);
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
    syncPrevButton.disabled = false;
    syncNextButton.disabled = false;
    syncNowButton.textContent = 'Sincronizar ahora';
    if (result) {
      syncYear.textContent = `Año ${result?.year || 2026}`;
      renderSyncRange(result?.offset || 0, result?.limit || getSyncFilters().limit);
      syncNewCount.textContent = `Nuevas: ${result?.created || 0}`;
      syncProcessedCount.textContent = `Procesadas: ${result?.processed_messages || 0}`;
      syncScannedCount.textContent = `Leídas: ${result?.scanned_messages || 0}`;
      syncSkippedCount.textContent = `Descartadas: ${result?.skipped_non_invoice || 0}`;
    } else {
      syncProgress.classList.remove('is-active');
    }
  }

  async function syncInbox(showToast = true) {
    const filters = getSyncFilters();
    startSyncProgress();
    try {
      const result = await request('/purchase-inbox/sync/', {
        method: 'POST',
        body: JSON.stringify({ organization: orgId(), ...filters }),
      });

      finishSyncProgress(result);

      if (syncMeta && result?.synced_at) {
        const hasMore = result?.has_more ? ' · Hay más correos por revisar' : ' · Fin del rango actual';
        syncMeta.textContent =
          `Última sync: ${new Date(result.synced_at).toLocaleString()} · Año ${result?.year || 2026} · ` +
          `Rango ${result?.offset || 0}-${(result?.offset || 0) + Math.max((result?.limit || filters.limit) - 1, 0)} · ` +
          `Incluye leídos y no leídos${hasMore}`;
      }

      if (showToast) {
        const errors = Array.isArray(result?.errors) ? result.errors.filter(Boolean) : [];
        const truncationNote = result?.truncated
          ? ` Lote leído: ${result?.scanned_messages || 0} de ${result?.total_candidates || 0} correos encontrados en 2026.`
          : '';
        const continuationNote = result?.has_more ? ' Puedes avanzar al siguiente lote para seguir cargando.' : '';
        const message =
          `Sync ${result?.year || 2026} completada. Nuevas: ${result?.created || 0}. ` +
          `Actualizadas: ${result?.updated || 0}. Procesadas: ${result?.processed_messages || 0}. ` +
          `Descartadas por no ser factura: ${result?.skipped_non_invoice || 0}.${truncationNote}${continuationNote}`;
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
        .join('') || '<tr><td colspan="8">Sin facturas electrónicas.</td></tr>';
    if (showMessage) {
      feedback(`Mostrando ${rows.length} factura(s) en bandeja.`);
    }
  }

  function moveBatch(direction) {
    const { offset, limit } = getSyncFilters();
    const nextOffset = direction === 'next' ? offset + limit : Math.max(0, offset - limit);
    syncOffsetInput.value = String(nextOffset);
    renderSyncRange(nextOffset, limit);
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
    syncOffsetInput.value = '0';
    syncInbox(false).then(() => loadInbox(false)).catch((e) => feedback(e.message, true));
  });
  $('status-filter').addEventListener('change', () => loadInbox().catch((e) => feedback(e.message, true)));
  syncOffsetInput.addEventListener('change', () => renderSyncRange(getSyncFilters().offset, getSyncFilters().limit));
  syncLimitInput.addEventListener('change', () => renderSyncRange(getSyncFilters().offset, getSyncFilters().limit));
  syncNowButton.addEventListener('click', () => syncInbox(true).then(() => loadInbox(false)).catch((e) => feedback(e.message, true)));
  syncPrevButton.addEventListener('click', () => {
    moveBatch('prev');
    syncInbox(true).then(() => loadInbox(false)).catch((e) => feedback(e.message, true));
  });
  syncNextButton.addEventListener('click', () => {
    moveBatch('next');
    syncInbox(true).then(() => loadInbox(false)).catch((e) => feedback(e.message, true));
  });

  renderOrganizations();
  renderSyncRange(getSyncFilters().offset, getSyncFilters().limit);
  syncInbox(false).then(() => loadInbox(false)).catch((e) => feedback(e.message, true));
  setInterval(() => {
    syncInbox(false).then(() => loadInbox(false)).catch(() => null);
  }, 5 * 60 * 1000);
})();
