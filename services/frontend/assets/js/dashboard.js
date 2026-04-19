(function initDashboardNavigation() {
  const $ = (id) => document.getElementById(id);
  const cards = document.querySelectorAll('.module-card[data-href]');

  async function request(path) {
    const response = await fetch(`/api${path}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      let detail = text || 'No se pudo cargar el dashboard.';
      if (contentType.includes('application/json')) {
        try {
          detail = JSON.parse(text)?.detail || detail;
        } catch (_error) {}
      }
      throw new Error(detail);
    }
    return text && contentType.includes('application/json') ? JSON.parse(text) : null;
  }

  function formatMoney(value, currency = 'CRC') {
    return new Intl.NumberFormat('es-CR', {
      style: 'currency',
      currency: String(currency || 'CRC').toUpperCase(),
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  function formatWhen(value) {
    if (!value) return '';
    return new Date(value).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function renderSummary(data) {
    const summary = data?.summary || {};
    $('dashboard-sales-count').textContent = `${summary.sales_today_count || 0} · ${formatMoney(summary.sales_today_total || 0)}`;
    $('dashboard-customers-count').textContent = String(summary.new_customers_today || 0);
    $('dashboard-events-count').textContent = String(summary.pending_events_today || 0);
    $('dashboard-weekly-total').textContent = formatMoney(summary.weekly_sales_total || 0);

    const weeklyChange = Number(summary.weekly_change_percent || 0);
    const weeklyChangeNode = $('dashboard-weekly-change');
    weeklyChangeNode.textContent = `${weeklyChange >= 0 ? '+' : ''}${weeklyChange.toFixed(2)}%`;
    weeklyChangeNode.classList.toggle('success', weeklyChange >= 0);
    weeklyChangeNode.classList.toggle('danger', weeklyChange < 0);

    const progressBar = $('dashboard-progress-bar');
    if (progressBar) {
      progressBar.style.width = `${Math.max(0, Math.min(Number(summary.weekly_progress_percent || 0), 100))}%`;
    }
  }

  function renderActivity(data) {
    const activityList = $('dashboard-activity-list');
    const items = Array.isArray(data?.recent_activity) ? data.recent_activity : [];
    if (!items.length) {
      activityList.innerHTML = '<li>No hay actividad reciente para esta organización todavía.</li>';
      return;
    }

    activityList.innerHTML = items
      .map(
        (item) =>
          `<li><strong>${item.module}</strong>: ${item.title}<br /><span class="subtitle">${item.description || ''}${item.timestamp ? ` · ${formatWhen(item.timestamp)}` : ''}</span></li>`,
      )
      .join('');
  }

  async function loadDashboard() {
    const organizationId = Number(window.AppSession?.getActiveOrganizationId?.());
    if (!organizationId) return;
    const data = await request(`/dashboard/summary/?organization_id=${organizationId}`);
    renderSummary(data);
    renderActivity(data);
  }

  cards.forEach((card) => {
    card.setAttribute('role', 'link');
    card.setAttribute('tabindex', '0');
    card.style.cursor = 'pointer';

    const goToModule = () => {
      const href = card.getAttribute('data-href');
      if (href) {
        window.location.href = href;
      }
    };

    card.addEventListener('click', goToModule);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        goToModule();
      }
    });
  });

  loadDashboard().catch((error) => {
    const activityList = $('dashboard-activity-list');
    if (activityList) {
      activityList.innerHTML = `<li>${error.message}</li>`;
    }
  });

  document.getElementById('organization-switcher')?.addEventListener('change', () => {
    loadDashboard().catch((error) => {
      const activityList = $('dashboard-activity-list');
      if (activityList) {
        activityList.innerHTML = `<li>${error.message}</li>`;
      }
    });
  });
})();
