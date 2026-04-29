(function initSaasAdmin() {
  const $ = (id) => document.getElementById(id);

  const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];
  const SOURCE_LABELS = {
    plan: 'Plan',
    addon: 'Add-on',
    custom: 'Personalizado',
  };
  const STATUS_LABELS = {
    trial: 'Prueba',
    active: 'Activa',
    past_due: 'Pendiente',
    suspended: 'Suspendida',
    cancelled: 'Cancelada',
  };
  const CYCLE_LABELS = {
    monthly: 'Mensual',
    annual: 'Anual',
    custom: 'Personalizado',
  };
  const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const ORG_TABS = ['profile', 'subscription', 'list'];

  const state = {
    session: null,
    overview: null,
    organizations: [],
    users: [],
    memberships: [],
    modules: [],
    plans: [],
    subscriptions: [],
    flags: [],
    pagination: {
      organizations: { page: 1, size: 5 },
      users: { page: 1, size: 5 },
      memberships: { page: 1, size: 5 },
      modules: { page: 1, size: 5 },
      plans: { page: 1, size: 5 },
      flags: { page: 1, size: 5 },
    },
  };

  function request(path, options = {}) {
    return fetch(`/api${path}`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      credentials: 'include',
      ...options,
    }).then(async (response) => {
      const text = await response.text();
      const contentType = response.headers.get('content-type') || '';
      const payload = text && contentType.includes('application/json') ? JSON.parse(text) : null;
      if (!response.ok) {
        const error = new Error(formatApiError(payload, text));
        error.payload = payload;
        throw error;
      }
      return payload;
    });
  }

  function formatApiError(payload, fallback = '') {
    if (!payload) {
      return fallback || 'No se pudo completar la accion.';
    }
    if (typeof payload === 'string') {
      return payload;
    }
    if (payload.detail) {
      return payload.detail;
    }
    if (payload.non_field_errors?.length) {
      return payload.non_field_errors[0];
    }
    const firstField = Object.entries(payload).find(([, value]) => Array.isArray(value) ? value.length : Boolean(value));
    if (!firstField) {
      return fallback || 'No se pudo completar la accion.';
    }
    const [field, value] = firstField;
    const message = Array.isArray(value) ? value[0] : value;
    return `${field}: ${message}`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function setFeedback(id, message, isError = false) {
    const node = $(id);
    if (!node) return;
    node.textContent = message;
    node.classList.add('saas-admin-feedback');
    node.classList.toggle('is-error', Boolean(isError));
    node.classList.toggle('is-success', Boolean(message && !isError && !message.startsWith('Sin ')));
    node.style.color = isError ? '#ffb4b4' : 'var(--muted)';
    if (message && window.appAlerts?.toast) {
      window.appAlerts.toast(message, isError ? 'error' : 'success');
    }
  }

  function clearFieldErrors(fieldIds = []) {
    fieldIds.forEach((id) => {
      const field = $(id);
      if (!field) return;
      field.classList.remove('is-invalid');
      field.removeAttribute('aria-invalid');
      const error = document.getElementById(`${id}-error`);
      if (error) {
        error.textContent = '';
      }
    });
  }

  function setFieldError(id, message) {
    const field = $(id);
    if (!field) return false;
    field.classList.add('is-invalid');
    field.setAttribute('aria-invalid', 'true');
    let error = document.getElementById(`${id}-error`);
    if (!error) {
      error = document.createElement('span');
      error.id = `${id}-error`;
      error.className = 'field-error';
      field.insertAdjacentElement('afterend', error);
      field.setAttribute('aria-describedby', error.id);
    }
    error.textContent = message;
    return false;
  }

  function requireText(id, message, minLength = 1) {
    const value = $(id)?.value.trim() || '';
    if (value.length < minLength) {
      return setFieldError(id, message);
    }
    return true;
  }

  function requireSelect(id, message) {
    if (!$(id)?.value) {
      return setFieldError(id, message);
    }
    return true;
  }

  function validateSlugField(id, required = true) {
    const value = $(id)?.value.trim() || '';
    if (!value && !required) return true;
    if (!SLUG_PATTERN.test(value)) {
      return setFieldError(id, 'Usa minusculas, numeros y guiones. Ej: plan-base');
    }
    return true;
  }

  function validateDigitsField(id, length) {
    const value = $(id)?.value.trim() || '';
    if (!new RegExp(`^\\d{${length}}$`).test(value)) {
      return setFieldError(id, `Debe contener exactamente ${length} digitos.`);
    }
    if (Number(value) < 1) {
      return setFieldError(id, 'Debe ser mayor a cero.');
    }
    return true;
  }

  function normalizeCodeField(id, length) {
    const field = $(id);
    if (!field) return '';
    const digits = field.value.replace(/\D/g, '').slice(0, length);
    field.value = digits ? digits.padStart(length, '0') : '';
    return field.value;
  }

  function buildConsecutivePreview(branch, terminal, sequence = 1) {
    const safeBranch = /^\d{3}$/.test(branch) ? branch : '001';
    const safeTerminal = /^\d{5}$/.test(terminal) ? terminal : '00001';
    const safeSequence = Math.max(1, Number(sequence) || 1);
    return `${safeBranch}${safeTerminal}01${String(safeSequence).padStart(10, '0')}`;
  }

  function validateMoneyField(id) {
    const value = Number($(id)?.value || 0);
    if (!Number.isFinite(value) || value < 0) {
      return setFieldError(id, 'Ingresa un monto valido mayor o igual a 0.');
    }
    return true;
  }

  function validateEmailField(id) {
    const value = $(id)?.value.trim() || '';
    if (!EMAIL_PATTERN.test(value)) {
      return setFieldError(id, 'Ingresa un correo valido.');
    }
    return true;
  }

  async function withButtonLock(button, callback) {
    if (!button || button.disabled) return;
    const originalText = button.textContent;
    button.disabled = true;
    button.classList.add('is-loading');
    button.textContent = 'Guardando...';
    try {
      await callback();
    } finally {
      button.disabled = false;
      button.classList.remove('is-loading');
      button.textContent = originalText;
    }
  }

  function setGuardState(message, redirect = false) {
    $('access-guard').classList.remove('hidden');
    $('access-guard-message').textContent = message;
    document.querySelectorAll('.saas-admin-hero, .saas-admin-stats, .saas-admin-panels').forEach((node) => {
      node.classList.add('saas-admin-hidden');
    });
    $('saas-admin-root').classList.remove('saas-admin-content--loading');
    if (redirect) {
      window.setTimeout(() => {
        window.location.href = '/';
      }, 1800);
    }
  }

  function activateTab(tabId) {
    const normalizedTabId = ['organizations', 'users', 'catalog', 'flags'].includes(tabId) ? tabId : 'organizations';
    document.querySelectorAll('[data-admin-tab]').forEach((button) => {
      const isActive = button.dataset.adminTab === normalizedTabId;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
    document.querySelectorAll('[data-admin-panel]').forEach((panel) => {
      panel.classList.toggle('is-active', panel.dataset.adminPanel === normalizedTabId);
    });
    syncSidebarSection(normalizedTabId);
  }

  function getTabFromHash() {
    return (window.location.hash || '#organizations').slice(1);
  }

  function activateOrgPanel(panelId) {
    const normalizedPanelId = ORG_TABS.includes(panelId) ? panelId : 'profile';
    document.querySelectorAll('[data-org-tab]').forEach((button) => {
      const isActive = button.dataset.orgTab === normalizedPanelId;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
    document.querySelectorAll('[data-org-panel]').forEach((panel) => {
      panel.classList.toggle('is-active', panel.dataset.orgPanel === normalizedPanelId);
    });
  }

  function syncSidebarSection(tabId) {
    const targetHref = `/saas-admin.html#${tabId}`;
    document.querySelectorAll('.sidebar-nav a[href^="/saas-admin.html#"]').forEach((link) => {
      link.classList.toggle('active', link.getAttribute('href') === targetHref);
    });
    const activeLink = document.querySelector(`.sidebar-nav a[href="${targetHref}"]`);
    const submenu = activeLink?.closest('.sidebar-submenu');
    if (submenu) {
      submenu.classList.add('is-open');
      submenu.querySelector('[data-submenu-toggle]')?.classList.add('active');
    }
  }

  function getSubscriptionByOrganizationId(organizationId) {
    return state.subscriptions.find((item) => Number(item.organization) === Number(organizationId)) || null;
  }

  function getSelectedSubscription() {
    const organizationId = Number($('subscription-organization').value);
    return getSubscriptionByOrganizationId(organizationId);
  }

  function getPlanById(planId) {
    return state.plans.find((plan) => Number(plan.id) === Number(planId)) || null;
  }

  function getPlanPrice(planId, billingCycle) {
    const plan = getPlanById(planId);
    if (!plan) return 0;
    if (billingCycle === 'annual') return Number(plan.annual_price || 0);
    if (billingCycle === 'monthly') return Number(plan.monthly_price || 0);
    return Number($('subscription-base-price')?.value || plan.monthly_price || 0);
  }

  function updateSubscriptionPriceFromPlan(force = false) {
    const planId = Number($('subscription-plan')?.value || 0);
    const cycle = $('subscription-cycle')?.value || 'monthly';
    const priceField = $('subscription-base-price');
    if (!priceField || !planId) return;
    const suggestedPrice = getPlanPrice(planId, cycle);
    if (force || !priceField.value || Number(priceField.value) === 0) {
      priceField.value = suggestedPrice.toFixed(2);
    }
  }

  function renderSubscriptionOverview() {
    const target = $('subscription-overview');
    if (!target) return;
    const organization = state.organizations.find((item) => Number(item.id) === Number($('subscription-organization')?.value));
    const subscription = getSelectedSubscription();
    const plan = getPlanById($('subscription-plan')?.value);

    if (!organization) {
      target.innerHTML = '<span>Selecciona una organizacion para revisar su plan.</span>';
      return;
    }

    target.innerHTML = `
      <strong>${escapeHtml(organization.name)}</strong>
      <span class="subscription-overview__chip">${escapeHtml(plan?.name || subscription?.plan_catalog_name || 'Sin plan')}</span>
      <span class="subscription-overview__chip">${escapeHtml(STATUS_LABELS[$('subscription-status')?.value] || 'Sin estado')}</span>
      <span class="subscription-overview__chip">${escapeHtml(CYCLE_LABELS[$('subscription-cycle')?.value] || 'Ciclo')}</span>
    `;
  }

  function updateHaciendaPreview(organization = null) {
    const branch = $('org-branch')?.value || '001';
    const terminal = $('org-terminal')?.value || '00001';
    const nextConsecutive = organization?.next_invoice_consecutive || buildConsecutivePreview(branch, terminal);
    const invoiceCount = Number(organization?.invoice_count || 0);
    if ($('org-next-consecutive')) {
      $('org-next-consecutive').textContent = nextConsecutive;
    }
    if ($('org-invoice-count')) {
      $('org-invoice-count').textContent = `${invoiceCount} factura${invoiceCount === 1 ? '' : 's'} emitida${invoiceCount === 1 ? '' : 's'}`;
    }
  }

  function renderSubscriptionModuleSummary(modules = []) {
    const target = $('subscription-modules-summary');
    if (!target) return;
    const enabled = modules.filter((item) => item.is_enabled).length;
    const addons = modules.filter((item) => item.source === 'addon').length;
    const custom = modules.filter((item) => item.source === 'custom').length;
    target.innerHTML = `
      <span>${enabled} activos</span>
      <span>${addons} add-ons</span>
      <span>${custom} personalizados</span>
    `;
  }

  function getPaginationSlice(key, rows) {
    const config = state.pagination[key];
    const size = Number(config?.size || 5);
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / size));
    const page = Math.min(Math.max(Number(config?.page || 1), 1), totalPages);
    const start = (page - 1) * size;
    state.pagination[key] = { page, size };
    return {
      rows: rows.slice(start, start + size),
      page,
      size,
      total,
      totalPages,
      start,
    };
  }

  function buildPageButtons(page, totalPages) {
    const pages = [];
    if (totalPages <= 7) {
      for (let current = 1; current <= totalPages; current += 1) {
        pages.push(current);
      }
      return pages;
    }

    pages.push(1);
    if (page > 3) pages.push('ellipsis-start');
    for (let current = Math.max(2, page - 1); current <= Math.min(totalPages - 1, page + 1); current += 1) {
      pages.push(current);
    }
    if (page < totalPages - 2) pages.push('ellipsis-end');
    pages.push(totalPages);
    return [...new Set(pages)];
  }

  function renderPaginator(key, targetId, total, page, size, totalPages) {
    const target = $(targetId);
    if (!target) return;

    if (!total) {
      target.innerHTML = '';
      return;
    }

    const summaryStart = (page - 1) * size + 1;
    const summaryEnd = Math.min(page * size, total);
    const pageButtons = buildPageButtons(page, totalPages)
      .map((item) => {
        if (String(item).startsWith('ellipsis')) {
          return '<span class="table-paginator__ellipsis">...</span>';
        }
        const isActive = Number(item) === page ? 'btn-primary' : 'btn-secondary';
        return `<button class="btn ${isActive} table-paginator__button" type="button" data-page="${item}">${item}</button>`;
      })
      .join('');

    target.innerHTML = `
      <div class="table-paginator">
        <div class="table-paginator__summary">Mostrando ${summaryStart}-${summaryEnd} de ${total} registros</div>
        <div class="table-paginator__config">
          <label class="table-paginator__size">
            <span>Filas</span>
            <select data-page-size>
              ${PAGE_SIZE_OPTIONS.map((option) => `<option value="${option}" ${option === size ? 'selected' : ''}>${option}</option>`).join('')}
            </select>
          </label>
          <div class="table-paginator__actions">
            <button class="btn btn-secondary table-paginator__button" type="button" data-page="${Math.max(page - 1, 1)}" ${page === 1 ? 'disabled' : ''}>Anterior</button>
            ${pageButtons}
            <button class="btn btn-secondary table-paginator__button" type="button" data-page="${Math.min(page + 1, totalPages)}" ${page === totalPages ? 'disabled' : ''}>Siguiente</button>
          </div>
        </div>
      </div>
    `;

    target.querySelectorAll('[data-page]').forEach((button) => {
      button.addEventListener('click', () => {
        state.pagination[key].page = Number(button.dataset.page);
        renderAllDataViews();
      });
    });

    const sizeSelect = target.querySelector('[data-page-size]');
    sizeSelect?.addEventListener('change', () => {
      state.pagination[key].size = Number(sizeSelect.value) || 5;
      state.pagination[key].page = 1;
      renderAllDataViews();
    });
  }

  function renderSummary() {
    const summary = state.overview?.summary || {};
    const stats = [
      ['Organizaciones', summary.organizations || 0],
      ['Suscripciones', summary.subscriptions || 0],
      ['Activas', summary.active_subscriptions || 0],
      ['Usuarios', summary.users || 0],
      ['Modulos', summary.modules || 0],
      ['Planes', summary.plans || 0],
      ['Flags', summary.feature_flags || 0],
    ];

    $('system-summary').innerHTML = stats
      .map(([label, value]) => `<article class="saas-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
      .join('');
  }

  function renderSelectOptions(targetIds, rows, getLabel, includeEmptyLabel = '') {
    const options = rows.map((row) => `<option value="${row.id}">${escapeHtml(getLabel(row))}</option>`).join('');
    targetIds.forEach((id) => {
      const node = $(id);
      if (!node) return;
      node.innerHTML = (includeEmptyLabel ? `<option value="">${escapeHtml(includeEmptyLabel)}</option>` : '') + (options || '<option value="">Sin datos</option>');
    });
  }

  function renderOrganizationsTable() {
    const { rows, page, size, total, totalPages } = getPaginationSlice('organizations', state.organizations);
    const selectedId = Number($('org-record-id')?.value || 0);
    $('organizations-body').innerHTML =
      rows
        .map((organization) => {
          const subscription = getSubscriptionByOrganizationId(organization.id);
          return `
            <tr data-org-id="${organization.id}" class="${selectedId === Number(organization.id) ? 'is-selected' : ''}">
              <td>${escapeHtml(organization.name)}</td>
              <td>${escapeHtml(organization.slug)}</td>
              <td>${escapeHtml(subscription?.plan_catalog_name || organization.subscription_plan_name || 'Sin plan')}</td>
              <td>${escapeHtml(STATUS_LABELS[subscription?.status || organization.subscription_status] || 'Sin suscripcion')}</td>
              <td>${escapeHtml(organization.memberships_count)}</td>
            </tr>
          `;
        })
        .join('') || '<tr><td colspan="5">No hay organizaciones registradas.</td></tr>';
    renderPaginator('organizations', 'organizations-pagination', total, page, size, totalPages);
  }

  function renderUsersTable() {
    const { rows, page, size, total, totalPages } = getPaginationSlice('users', state.users);
    $('users-body').innerHTML =
      rows
        .map((user) => {
          const memberships = (user.memberships || []).map((membership) => `${membership.organization_name} (${membership.role})`).join(', ') || 'Sin accesos';
          return `
            <tr data-user-id="${user.id}">
              <td>${escapeHtml(user.email || user.username)}</td>
              <td>${user.is_active ? 'Activo' : 'Inactivo'}</td>
              <td>${user.is_staff ? 'Si' : 'No'}</td>
              <td>${escapeHtml(memberships)}</td>
            </tr>
          `;
        })
        .join('') || '<tr><td colspan="4">No hay usuarios registrados.</td></tr>';
    renderPaginator('users', 'users-pagination', total, page, size, totalPages);
  }

  function renderMembershipsTable() {
    const { rows, page, size, total, totalPages } = getPaginationSlice('memberships', state.memberships);
    $('memberships-body').innerHTML =
      rows
        .map(
          (membership) => `
            <tr data-membership-id="${membership.id}">
              <td>${escapeHtml(membership.user_email)}</td>
              <td>${escapeHtml(membership.organization_name)}</td>
              <td>${escapeHtml(membership.role)}</td>
            </tr>
          `,
        )
        .join('') || '<tr><td colspan="3">No hay accesos registrados.</td></tr>';
    renderPaginator('memberships', 'memberships-pagination', total, page, size, totalPages);
  }

  function renderModulesList() {
    const { rows, page, size, total, totalPages } = getPaginationSlice('modules', state.modules);
    $('modules-list').innerHTML =
      rows
        .map(
          (module) => `
            <li data-module-id="${module.id}">
              <strong>${escapeHtml(module.name)}</strong>
              <span>${escapeHtml(module.code)} · ${escapeHtml(module.group)} · ${escapeHtml(module.route_hint || 'sin ruta')}</span>
            </li>
          `,
        )
        .join('') || '<li><span>Sin modulos.</span></li>';
    renderPaginator('modules', 'modules-pagination', total, page, size, totalPages);
  }

  function renderPlansList() {
    const { rows, page, size, total, totalPages } = getPaginationSlice('plans', state.plans);
    $('plans-list').innerHTML =
      rows
        .map((plan) => {
          const modules = (plan.modules_detail || []).map((item) => item.module_name).join(', ') || 'Sin modulos';
          return `
            <li data-plan-id="${plan.id}">
              <strong>${escapeHtml(plan.name)}</strong>
              <span>${escapeHtml(plan.code)} · CRC ${escapeHtml(plan.monthly_price)} mensual · ${escapeHtml(modules)}</span>
            </li>
          `;
        })
        .join('') || '<li><span>Sin planes.</span></li>';
    renderPaginator('plans', 'plans-pagination', total, page, size, totalPages);
  }

  function renderFlagsTable() {
    const { rows, page, size, total, totalPages } = getPaginationSlice('flags', state.flags);
    $('flags-body').innerHTML =
      rows
        .map(
          (flag) => `
            <tr data-flag-id="${flag.id}">
              <td>${escapeHtml(flag.organization_name)}</td>
              <td>${escapeHtml(flag.key)}</td>
              <td>${escapeHtml(flag.module_name || 'General')}</td>
              <td>${flag.is_enabled ? 'Activa' : 'Inactiva'}</td>
            </tr>
          `,
        )
        .join('') || '<tr><td colspan="4">No hay feature flags registradas.</td></tr>';
    renderPaginator('flags', 'flags-pagination', total, page, size, totalPages);
  }

  function renderSubscriptionModuleOptions() {
    const subscription = getSelectedSubscription();
    const linkedModuleIds = new Set((subscription?.active_modules || []).map((item) => Number(item.module)));
    const availableModules = state.modules.filter((module) => !linkedModuleIds.has(Number(module.id)));
    const select = $('subscription-module-select');
    const addButton = $('add-subscription-module');

    if (!select) return;

    if (!availableModules.length) {
      select.innerHTML = '<option value="">Todos los modulos ya estan asignados</option>';
      if (addButton) addButton.disabled = true;
      return;
    }

    select.innerHTML = availableModules
      .map((module) => `<option value="${module.id}">${escapeHtml(module.name)} (${escapeHtml(module.group)})</option>`)
      .join('');
    if (addButton) addButton.disabled = !subscription?.id;
  }

  function getSubscriptionModuleBadgeClass(source, isEnabled) {
    if (!isEnabled) return 'is-disabled';
    if (source === 'plan') return 'is-plan';
    if (source === 'addon') return 'is-addon';
    return 'is-custom';
  }

  function renderSubscriptionModules() {
    const subscription = getSelectedSubscription();
    const list = $('subscription-modules-list');
    if (!list) return;

    if (!subscription) {
      list.innerHTML = '<li class="saas-admin-empty-state">Selecciona o crea una suscripcion para administrar sus modulos.</li>';
      renderSubscriptionModuleSummary([]);
      renderSubscriptionModuleOptions();
      renderSubscriptionOverview();
      return;
    }

    const modules = (subscription.active_modules || []).slice().sort((left, right) => {
      if (left.is_enabled !== right.is_enabled) return left.is_enabled ? -1 : 1;
      return String(left.module_name || '').localeCompare(String(right.module_name || ''));
    });

    if (!modules.length) {
      list.innerHTML = '<li class="saas-admin-empty-state">Esta suscripcion aun no tiene modulos activos ni add-ons configurados.</li>';
      renderSubscriptionModuleSummary([]);
      renderSubscriptionModuleOptions();
      renderSubscriptionOverview();
      return;
    }

    list.innerHTML = modules
      .map((item) => {
        const sourceLabel = SOURCE_LABELS[item.source] || item.source;
        const enableLabel = item.is_enabled ? 'Desactivar' : 'Activar';
        const enableAction = item.is_enabled ? 'disable' : 'enable';
        const canRemove = item.source !== 'plan';
        return `
          <li>
            <div class="subscription-module-card">
              <div class="subscription-module-card__header">
                <div>
                  <strong>${escapeHtml(item.module_name)}</strong>
                  <span>${escapeHtml(item.module_group)} · ${item.is_enabled ? 'Habilitado' : 'Deshabilitado'}</span>
                </div>
                <div class="subscription-module-card__meta">
                  <span class="subscription-module-pill ${getSubscriptionModuleBadgeClass(item.source, item.is_enabled)}">${escapeHtml(sourceLabel)}</span>
                </div>
              </div>
              <div class="subscription-module-card__actions">
                <button class="btn btn-secondary" type="button" data-subscription-module-action="${enableAction}" data-subscription-module-id="${item.id}">${enableLabel}</button>
                ${canRemove ? `<button class="btn btn-secondary" type="button" data-subscription-module-action="remove" data-subscription-module-id="${item.id}">Eliminar</button>` : ''}
              </div>
            </div>
          </li>
        `;
      })
      .join('');

    renderSubscriptionModuleSummary(modules);
    renderSubscriptionModuleOptions();
    renderSubscriptionOverview();
  }

  function renderAllDataViews() {
    renderOrganizationsTable();
    renderUsersTable();
    renderMembershipsTable();
    renderModulesList();
    renderPlansList();
    renderFlagsTable();
    renderSubscriptionModules();
    bindInteractiveRows();
  }

  function validateOrganizationForm() {
    const fields = ['org-name', 'org-slug', 'org-branch', 'org-terminal'];
    clearFieldErrors(fields);
    const recordId = Number($('org-record-id').value || 0);
    const currentOrganization = state.organizations.find((item) => Number(item.id) === recordId);
    let isValid = true;
    normalizeCodeField('org-branch', 3);
    normalizeCodeField('org-terminal', 5);
    isValid = requireText('org-name', 'Ingresa un nombre de al menos 3 caracteres.', 3) && isValid;
    isValid = validateSlugField('org-slug', false) && isValid;
    isValid = validateDigitsField('org-branch', 3) && isValid;
    isValid = validateDigitsField('org-terminal', 5) && isValid;

    const name = $('org-name').value.trim().toLowerCase();
    const slug = $('org-slug').value.trim().toLowerCase();
    const branch = $('org-branch').value.trim();
    const terminal = $('org-terminal').value.trim();
    if (state.organizations.some((item) => Number(item.id) !== recordId && item.name.toLowerCase() === name)) {
      isValid = setFieldError('org-name', 'Ya existe una organizacion con este nombre.') && isValid;
    }
    if (slug && state.organizations.some((item) => Number(item.id) !== recordId && item.slug === slug)) {
      isValid = setFieldError('org-slug', 'Este slug ya esta en uso.') && isValid;
    }
    if (state.organizations.some((item) => Number(item.id) !== recordId && item.hacienda_branch_code === branch && item.hacienda_terminal_code === terminal)) {
      isValid = setFieldError('org-terminal', 'Esta sucursal y terminal ya estan asignadas a otra organizacion.') && isValid;
    }
    if (
      currentOrganization?.invoice_count > 0 &&
      (currentOrganization.hacienda_branch_code !== branch || currentOrganization.hacienda_terminal_code !== terminal)
    ) {
      isValid = setFieldError('org-terminal', 'No puedes cambiar sucursal o terminal porque ya existen facturas con ese consecutivo.') && isValid;
    }
    return isValid;
  }

  function validateSubscriptionForm() {
    const fields = ['subscription-organization', 'subscription-plan', 'subscription-status', 'subscription-cycle', 'subscription-next-billing', 'subscription-base-price'];
    clearFieldErrors(fields);
    let isValid = true;
    isValid = requireSelect('subscription-organization', 'Selecciona una organizacion.') && isValid;
    isValid = requireSelect('subscription-plan', 'Selecciona un plan.') && isValid;
    isValid = requireSelect('subscription-status', 'Selecciona un estado.') && isValid;
    isValid = requireSelect('subscription-cycle', 'Selecciona un ciclo.') && isValid;
    isValid = validateMoneyField('subscription-base-price') && isValid;
    if (['active', 'past_due'].includes($('subscription-status').value) && !$('subscription-next-billing').value) {
      isValid = setFieldError('subscription-next-billing', 'Indica el proximo cobro para estados activos o pendientes.') && isValid;
    }
    return isValid;
  }

  function validateUserForm() {
    const fields = ['user-email', 'user-first-name', 'user-last-name'];
    clearFieldErrors(fields);
    const recordId = Number($('user-record-id').value || 0);
    let isValid = validateEmailField('user-email');
    const email = $('user-email').value.trim().toLowerCase();
    if (state.users.some((item) => Number(item.id) !== recordId && String(item.email || item.username).toLowerCase() === email)) {
      isValid = setFieldError('user-email', 'Ya existe un usuario con este correo.') && isValid;
    }
    return isValid;
  }

  function validateMembershipForm() {
    const fields = ['membership-user', 'membership-organization', 'membership-role'];
    clearFieldErrors(fields);
    const recordId = Number($('membership-record-id').value || 0);
    const userId = Number($('membership-user').value);
    const organizationId = Number($('membership-organization').value);
    let isValid = true;
    isValid = requireSelect('membership-user', 'Selecciona un usuario.') && isValid;
    isValid = requireSelect('membership-organization', 'Selecciona una organizacion.') && isValid;
    if (state.memberships.some((item) => Number(item.id) !== recordId && Number(item.user) === userId && Number(item.organization) === organizationId)) {
      isValid = setFieldError('membership-user', 'Este usuario ya tiene acceso a esa organizacion.') && isValid;
    }
    return isValid;
  }

  function validateModuleForm() {
    const fields = ['module-code', 'module-name', 'module-route'];
    clearFieldErrors(fields);
    const recordId = Number($('module-record-id').value || 0);
    let isValid = true;
    isValid = validateSlugField('module-code') && isValid;
    isValid = requireText('module-name', 'Ingresa un nombre de al menos 3 caracteres.', 3) && isValid;
    if ($('module-route').value.trim() && !$('module-route').value.trim().startsWith('/')) {
      isValid = setFieldError('module-route', 'La ruta debe iniciar con /.') && isValid;
    }
    if (state.modules.some((item) => Number(item.id) !== recordId && item.code === $('module-code').value.trim().toLowerCase())) {
      isValid = setFieldError('module-code', 'Ya existe un modulo con este codigo.') && isValid;
    }
    return isValid;
  }

  function validatePlanForm() {
    const fields = ['plan-code', 'plan-name', 'plan-monthly-price', 'plan-annual-price'];
    clearFieldErrors(fields);
    const recordId = Number($('plan-record-id').value || 0);
    let isValid = true;
    isValid = validateSlugField('plan-code') && isValid;
    isValid = requireText('plan-name', 'Ingresa un nombre de al menos 3 caracteres.', 3) && isValid;
    isValid = validateMoneyField('plan-monthly-price') && isValid;
    isValid = validateMoneyField('plan-annual-price') && isValid;
    if (state.plans.some((item) => Number(item.id) !== recordId && item.code === $('plan-code').value.trim().toLowerCase())) {
      isValid = setFieldError('plan-code', 'Ya existe un plan con este codigo.') && isValid;
    }
    return isValid;
  }

  function validateFlagForm() {
    const fields = ['flag-organization', 'flag-key', 'flag-label'];
    clearFieldErrors(fields);
    const recordId = Number($('flag-record-id').value || 0);
    const organizationId = Number($('flag-organization').value);
    const key = $('flag-key').value.trim().toLowerCase();
    let isValid = true;
    isValid = requireSelect('flag-organization', 'Selecciona una organizacion.') && isValid;
    isValid = validateSlugField('flag-key') && isValid;
    isValid = requireText('flag-label', 'Ingresa una etiqueta de al menos 3 caracteres.', 3) && isValid;
    if (state.flags.some((item) => Number(item.id) !== recordId && Number(item.organization) === organizationId && item.key === key)) {
      isValid = setFieldError('flag-key', 'Esta organizacion ya tiene una flag con esa key.') && isValid;
    }
    return isValid;
  }

  function getNextAvailableHaciendaCodes() {
    const used = new Set(state.organizations.map((item) => `${item.hacienda_branch_code}:${item.hacienda_terminal_code}`));
    const sorted = state.organizations
      .map((item) => ({
        branch: Number(item.hacienda_branch_code || 1),
        terminal: Number(item.hacienda_terminal_code || 0),
      }))
      .sort((left, right) => right.branch - left.branch || right.terminal - left.terminal);
    let branch = sorted[0]?.branch || 1;
    let terminal = (sorted[0]?.terminal || 0) + 1;
    if (terminal > 99999) {
      branch += 1;
      terminal = 1;
    }
    while (branch <= 999) {
      const candidate = {
        branch: String(branch).padStart(3, '0'),
        terminal: String(terminal).padStart(5, '0'),
      };
      if (!used.has(`${candidate.branch}:${candidate.terminal}`)) {
        return candidate;
      }
      terminal += 1;
      if (terminal > 99999) {
        branch += 1;
        terminal = 1;
      }
    }
    return { branch: '001', terminal: '00001' };
  }

  function resetOrganizationForm() {
    clearFieldErrors(['org-name', 'org-slug', 'org-branch', 'org-terminal']);
    $('org-record-id').value = '';
    $('org-name').value = '';
    $('org-slug').value = '';
    const nextCodes = getNextAvailableHaciendaCodes();
    $('org-branch').value = nextCodes.branch;
    $('org-terminal').value = nextCodes.terminal;
    updateHaciendaPreview();
    renderOrganizationsTable();
  }

  function resetUserForm() {
    clearFieldErrors(['user-email', 'user-first-name', 'user-last-name']);
    $('user-record-id').value = '';
    $('user-email').value = '';
    $('user-first-name').value = '';
    $('user-last-name').value = '';
    $('user-is-staff').value = 'false';
  }

  function resetMembershipForm() {
    clearFieldErrors(['membership-user', 'membership-organization', 'membership-role']);
    $('membership-record-id').value = '';
    if ($('membership-user').options.length) $('membership-user').selectedIndex = 0;
    if ($('membership-organization').options.length) $('membership-organization').selectedIndex = 0;
    $('membership-role').value = 'owner';
  }

  function resetModuleForm() {
    clearFieldErrors(['module-code', 'module-name', 'module-route']);
    $('module-record-id').value = '';
    $('module-code').value = '';
    $('module-name').value = '';
    $('module-group').value = 'base';
    $('module-route').value = '';
    $('module-description').value = '';
  }

  function resetPlanForm() {
    clearFieldErrors(['plan-code', 'plan-name', 'plan-monthly-price', 'plan-annual-price']);
    $('plan-record-id').value = '';
    $('plan-code').value = '';
    $('plan-name').value = '';
    $('plan-monthly-price').value = '';
    $('plan-annual-price').value = '';
    $('plan-description').value = '';
  }

  function resetFlagForm() {
    clearFieldErrors(['flag-organization', 'flag-key', 'flag-label']);
    $('flag-record-id').value = '';
    $('flag-key').value = '';
    $('flag-label').value = '';
    $('flag-description').value = '';
    $('flag-enabled').value = 'true';
    if ($('flag-module').options.length) $('flag-module').selectedIndex = 0;
  }

  function hydrateOrganizationForm(organizationId) {
    const organization = state.organizations.find((item) => Number(item.id) === Number(organizationId));
    if (!organization) return;
    const subscription = getSubscriptionByOrganizationId(organization.id);

    $('org-record-id').value = organization.id;
    $('org-name').value = organization.name || '';
    $('org-slug').value = organization.slug || '';
    $('org-branch').value = organization.hacienda_branch_code || '001';
    $('org-terminal').value = organization.hacienda_terminal_code || '00001';
    updateHaciendaPreview(organization);

    $('subscription-record-id').value = subscription?.id || '';
    $('subscription-organization').value = String(organization.id);
    $('subscription-plan').value = subscription?.plan_catalog || '';
    $('subscription-status').value = subscription?.status || 'trial';
    $('subscription-cycle').value = subscription?.billing_cycle || 'monthly';
    $('subscription-next-billing').value = subscription?.next_billing_date || '';
    $('subscription-base-price').value = subscription?.base_price || 0;
    renderOrganizationsTable();
    renderSubscriptionOverview();
    renderSubscriptionModules();
  }

  function hydrateUserForm(userId) {
    const user = state.users.find((item) => Number(item.id) === Number(userId));
    if (!user) return;
    $('user-record-id').value = user.id;
    $('user-email').value = user.email || user.username || '';
    $('user-first-name').value = user.first_name || '';
    $('user-last-name').value = user.last_name || '';
    $('user-is-staff').value = user.is_staff ? 'true' : 'false';
  }

  function hydrateMembershipForm(membershipId) {
    const membership = state.memberships.find((item) => Number(item.id) === Number(membershipId));
    if (!membership) return;
    $('membership-record-id').value = membership.id;
    $('membership-user').value = membership.user;
    $('membership-organization').value = membership.organization;
    $('membership-role').value = membership.role;
  }

  function hydrateModuleForm(moduleId) {
    const module = state.modules.find((item) => Number(item.id) === Number(moduleId));
    if (!module) return;
    $('module-record-id').value = module.id;
    $('module-code').value = module.code || '';
    $('module-name').value = module.name || '';
    $('module-group').value = module.group || 'base';
    $('module-route').value = module.route_hint || '';
    $('module-description').value = module.description || '';
  }

  function hydratePlanForm(planId) {
    const plan = state.plans.find((item) => Number(item.id) === Number(planId));
    if (!plan) return;
    $('plan-record-id').value = plan.id;
    $('plan-code').value = plan.code || '';
    $('plan-name').value = plan.name || '';
    $('plan-monthly-price').value = plan.monthly_price || '';
    $('plan-annual-price').value = plan.annual_price || '';
    $('plan-description').value = plan.description || '';
    $('plan-module-plan').value = plan.id;
  }

  function hydrateFlagForm(flagId) {
    const flag = state.flags.find((item) => Number(item.id) === Number(flagId));
    if (!flag) return;
    $('flag-record-id').value = flag.id;
    $('flag-organization').value = flag.organization;
    $('flag-module').value = flag.module || '';
    $('flag-key').value = flag.key || '';
    $('flag-label').value = flag.label || '';
    $('flag-description').value = flag.description || '';
    $('flag-enabled').value = flag.is_enabled ? 'true' : 'false';
  }

  function bindInteractiveRows() {
    $('organizations-body').querySelectorAll('tr[data-org-id]').forEach((row) => {
      row.addEventListener('click', () => {
        hydrateOrganizationForm(row.dataset.orgId);
        activateOrgPanel('profile');
      });
    });
    $('users-body').querySelectorAll('tr[data-user-id]').forEach((row) => {
      row.addEventListener('click', () => hydrateUserForm(row.dataset.userId));
    });
    $('memberships-body').querySelectorAll('tr[data-membership-id]').forEach((row) => {
      row.addEventListener('click', () => hydrateMembershipForm(row.dataset.membershipId));
    });
    $('modules-list').querySelectorAll('li[data-module-id]').forEach((item) => {
      item.addEventListener('click', () => hydrateModuleForm(item.dataset.moduleId));
    });
    $('plans-list').querySelectorAll('li[data-plan-id]').forEach((item) => {
      item.addEventListener('click', () => hydratePlanForm(item.dataset.planId));
    });
    $('flags-body').querySelectorAll('tr[data-flag-id]').forEach((row) => {
      row.addEventListener('click', () => hydrateFlagForm(row.dataset.flagId));
    });
  }

  async function loadAll() {
    const [overview, organizations, users, memberships, modules, plans, subscriptions, flags] = await Promise.all([
      request('/system-admin/overview/'),
      request('/system-admin/organizations/'),
      request('/system-admin/users/'),
      request('/system-admin/memberships/'),
      request('/system-admin/modules/'),
      request('/system-admin/plans/'),
      request('/system-admin/subscriptions/'),
      request('/system-admin/feature-flags/'),
    ]);

    state.overview = overview;
    state.organizations = organizations || [];
    state.users = users || [];
    state.memberships = memberships || [];
    state.modules = modules || [];
    state.plans = plans || [];
    state.subscriptions = subscriptions || [];
    state.flags = flags || [];

    renderSummary();
    renderSelectOptions(['subscription-organization', 'membership-organization', 'flag-organization'], state.organizations, (item) => item.name);
    renderSelectOptions(['membership-user'], state.users, (item) => item.email || item.username);
    renderSelectOptions(['subscription-plan', 'plan-module-plan'], state.plans, (item) => item.name);
    renderSelectOptions(['plan-module-module', 'flag-module'], state.modules, (item) => `${item.name} (${item.group})`, 'Sin modulo');
    if (state.organizations.length) {
      hydrateOrganizationForm(state.organizations[0].id);
    }
    renderSubscriptionModuleOptions();
    renderAllDataViews();
  }

  async function ensureAccess() {
    try {
      const session = await request('/auth/session/', { headers: { Accept: 'application/json' } });
      state.session = session;
      window.AppSession?.save?.(session);
      if (!session?.user?.is_system_owner) {
        setGuardState('Esta consola solo esta disponible para el propietario del sistema.', true);
        return false;
      }
      return true;
    } catch (_error) {
      setGuardState('Debes iniciar sesion con una cuenta del sistema para acceder a esta consola.', true);
      return false;
    }
  }

  function bindTabs() {
    document.querySelectorAll('[data-admin-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const nextTab = button.dataset.adminTab;
        if (nextTab) {
          window.location.hash = nextTab;
        }
        activateTab(nextTab);
      });
    });
    window.addEventListener('hashchange', () => activateTab(getTabFromHash()));
    document.querySelectorAll('[data-org-tab]').forEach((button) => {
      button.addEventListener('click', () => activateOrgPanel(button.dataset.orgTab));
    });
  }

  async function saveSubscriptionModule(entryId, payload, method = 'PATCH') {
    await request(`/system-admin/subscription-modules/${entryId}/`, {
      method,
      body: JSON.stringify(payload),
    });
    await loadAll();
    renderSubscriptionModules();
  }

  async function addSubscriptionModule() {
    const subscription = getSelectedSubscription();
    const moduleId = Number($('subscription-module-select').value);
    clearFieldErrors(['subscription-module-select']);
    if (!subscription?.id) {
      setFeedback('subscription-feedback', 'Debes guardar o seleccionar una suscripcion antes de asignar modulos.', true);
      return;
    }
    if (!moduleId) {
      setFieldError('subscription-module-select', 'Selecciona un modulo disponible.');
      return;
    }
    if ((subscription.active_modules || []).some((item) => Number(item.module) === moduleId)) {
      setFieldError('subscription-module-select', 'Este modulo ya esta asignado.');
      return;
    }

    try {
      await request('/system-admin/subscription-modules/', {
        method: 'POST',
        body: JSON.stringify({
          subscription: subscription.id,
          module: moduleId,
          is_enabled: true,
          source: $('subscription-module-source').value,
        }),
      });
      await loadAll();
      setFeedback('subscription-feedback', 'Modulo asignado correctamente a la suscripcion.');
    } catch (error) {
      setFeedback('subscription-feedback', error.message, true);
    }
  }

  function bindSubscriptionModuleActions() {
    $('subscription-modules-list').addEventListener('click', async (event) => {
      const button = event.target.closest('[data-subscription-module-action]');
      if (!button) return;

      const action = button.dataset.subscriptionModuleAction;
      const entryId = Number(button.dataset.subscriptionModuleId);
      const subscription = getSelectedSubscription();
      const entry = (subscription?.active_modules || []).find((item) => Number(item.id) === entryId);
      if (!entry) return;

      try {
        if (action === 'enable') {
          await saveSubscriptionModule(entryId, { is_enabled: true });
          setFeedback('subscription-feedback', `Modulo ${entry.module_name} activado correctamente.`);
          return;
        }
        if (action === 'disable') {
          await saveSubscriptionModule(entryId, { is_enabled: false });
          setFeedback('subscription-feedback', `Modulo ${entry.module_name} desactivado correctamente.`);
          return;
        }
        if (action === 'remove') {
          await request(`/system-admin/subscription-modules/${entryId}/`, { method: 'DELETE' });
          await loadAll();
          setFeedback('subscription-feedback', `Modulo ${entry.module_name} eliminado de la suscripcion.`);
        }
      } catch (error) {
        setFeedback('subscription-feedback', error.message, true);
      }
    });
  }

  function bindActions() {
    document.querySelectorAll('.saas-admin-form-grid input, .saas-admin-form-grid select, .saas-admin-form-grid textarea').forEach((field) => {
      field.addEventListener('input', () => clearFieldErrors([field.id]));
      field.addEventListener('change', () => clearFieldErrors([field.id]));
    });

    $('reset-organization-form').addEventListener('click', resetOrganizationForm);
    $('reset-user-form').addEventListener('click', resetUserForm);
    $('reset-membership-form').addEventListener('click', resetMembershipForm);
    $('reset-module-form').addEventListener('click', resetModuleForm);
    $('reset-plan-form').addEventListener('click', resetPlanForm);
    $('reset-flag-form').addEventListener('click', resetFlagForm);

    ['org-branch', 'org-terminal'].forEach((fieldId) => {
      $(fieldId)?.addEventListener('blur', () => {
        normalizeCodeField(fieldId, fieldId === 'org-branch' ? 3 : 5);
        updateHaciendaPreview();
      });
      $(fieldId)?.addEventListener('input', () => updateHaciendaPreview());
    });

    $('subscription-organization').addEventListener('change', () => {
      hydrateOrganizationForm($('subscription-organization').value);
      renderSubscriptionModuleOptions();
      renderSubscriptionModules();
    });

    $('subscription-plan').addEventListener('change', () => {
      updateSubscriptionPriceFromPlan(true);
      renderSubscriptionOverview();
    });

    $('subscription-cycle').addEventListener('change', () => {
      updateSubscriptionPriceFromPlan(true);
      renderSubscriptionOverview();
    });

    $('subscription-status').addEventListener('change', renderSubscriptionOverview);

    $('add-subscription-module').addEventListener('click', (event) => {
      withButtonLock(event.currentTarget, addSubscriptionModule).catch(() => null);
    });

    $('save-organization').addEventListener('click', async (event) => withButtonLock(event.currentTarget, async () => {
      if (!validateOrganizationForm()) return;
      const recordId = $('org-record-id').value;
      const payload = {
        name: $('org-name').value.trim(),
        slug: $('org-slug').value.trim(),
        hacienda_branch_code: $('org-branch').value.trim() || '001',
        hacienda_terminal_code: $('org-terminal').value.trim() || '00001',
      };
      try {
        await request(recordId ? `/system-admin/organizations/${recordId}/` : '/system-admin/organizations/', {
          method: recordId ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        });
        await loadAll();
        resetOrganizationForm();
        setFeedback('org-feedback', recordId ? 'Organizacion actualizada correctamente.' : 'Organizacion creada correctamente.');
      } catch (error) {
        setFeedback('org-feedback', error.message, true);
      }
    }));

    $('save-subscription').addEventListener('click', async (event) => withButtonLock(event.currentTarget, async () => {
      if (!validateSubscriptionForm()) return;
      const recordId = $('subscription-record-id').value;
      const payload = {
        organization: Number($('subscription-organization').value),
        plan: 'starter',
        plan_catalog: Number($('subscription-plan').value),
        status: $('subscription-status').value,
        billing_cycle: $('subscription-cycle').value,
        next_billing_date: $('subscription-next-billing').value || null,
        base_price: Number($('subscription-base-price').value || 0),
        is_active: $('subscription-status').value !== 'cancelled',
      };
      try {
        await request(recordId ? `/system-admin/subscriptions/${recordId}/` : '/system-admin/subscriptions/', {
          method: recordId ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        });
        await loadAll();
        if ($('subscription-organization').value) {
          hydrateOrganizationForm($('subscription-organization').value);
        }
        setFeedback('subscription-feedback', 'Suscripcion guardada correctamente.');
      } catch (error) {
        setFeedback('subscription-feedback', error.message, true);
      }
    }));

    $('save-user').addEventListener('click', async (event) => withButtonLock(event.currentTarget, async () => {
      if (!validateUserForm()) return;
      const recordId = $('user-record-id').value;
      const payload = {
        email: $('user-email').value.trim(),
        first_name: $('user-first-name').value.trim(),
        last_name: $('user-last-name').value.trim(),
        is_staff: $('user-is-staff').value === 'true',
        is_active: true,
      };
      try {
        await request(recordId ? `/system-admin/users/${recordId}/` : '/system-admin/users/', {
          method: recordId ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        });
        await loadAll();
        resetUserForm();
        setFeedback('user-feedback', recordId ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.');
      } catch (error) {
        setFeedback('user-feedback', error.message, true);
      }
    }));

    $('save-membership').addEventListener('click', async (event) => withButtonLock(event.currentTarget, async () => {
      if (!validateMembershipForm()) return;
      const recordId = $('membership-record-id').value;
      const payload = {
        user: Number($('membership-user').value),
        organization: Number($('membership-organization').value),
        role: $('membership-role').value,
      };
      try {
        await request(recordId ? `/system-admin/memberships/${recordId}/` : '/system-admin/memberships/', {
          method: recordId ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        });
        await loadAll();
        resetMembershipForm();
        setFeedback('user-feedback', recordId ? 'Acceso actualizado correctamente.' : 'Acceso asignado correctamente.');
      } catch (error) {
        setFeedback('user-feedback', error.message, true);
      }
    }));

    $('save-module').addEventListener('click', async (event) => withButtonLock(event.currentTarget, async () => {
      if (!validateModuleForm()) return;
      const recordId = $('module-record-id').value;
      const payload = {
        code: $('module-code').value.trim(),
        name: $('module-name').value.trim(),
        group: $('module-group').value,
        route_hint: $('module-route').value.trim(),
        description: $('module-description').value.trim(),
        is_active: true,
        is_public: true,
      };
      try {
        await request(recordId ? `/system-admin/modules/${recordId}/` : '/system-admin/modules/', {
          method: recordId ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        });
        await loadAll();
        resetModuleForm();
        setFeedback('catalog-feedback', recordId ? 'Modulo actualizado correctamente.' : 'Modulo creado correctamente.');
      } catch (error) {
        setFeedback('catalog-feedback', error.message, true);
      }
    }));

    $('save-plan').addEventListener('click', async (event) => withButtonLock(event.currentTarget, async () => {
      if (!validatePlanForm()) return;
      const recordId = $('plan-record-id').value;
      const payload = {
        code: $('plan-code').value.trim(),
        name: $('plan-name').value.trim(),
        description: $('plan-description').value.trim(),
        monthly_price: Number($('plan-monthly-price').value || 0),
        annual_price: Number($('plan-annual-price').value || 0),
        is_active: true,
      };
      try {
        await request(recordId ? `/system-admin/plans/${recordId}/` : '/system-admin/plans/', {
          method: recordId ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        });
        await loadAll();
        resetPlanForm();
        setFeedback('catalog-feedback', recordId ? 'Plan actualizado correctamente.' : 'Plan creado correctamente.');
      } catch (error) {
        setFeedback('catalog-feedback', error.message, true);
      }
    }));

    $('link-plan-module').addEventListener('click', async (event) => withButtonLock(event.currentTarget, async () => {
      clearFieldErrors(['plan-module-plan', 'plan-module-module']);
      let isValid = true;
      isValid = requireSelect('plan-module-plan', 'Selecciona un plan.') && isValid;
      isValid = requireSelect('plan-module-module', 'Selecciona un modulo.') && isValid;
      if (!isValid) return;
      try {
        const planId = Number($('plan-module-plan').value);
        const existingPlan = state.plans.find((plan) => Number(plan.id) === planId);
        const moduleId = Number($('plan-module-module').value);
        if (existingPlan?.modules_detail?.some((item) => Number(item.module) === moduleId)) {
          setFieldError('plan-module-module', 'Este modulo ya esta incluido en el plan.');
          return;
        }
        const nextSortOrder = (existingPlan?.modules_detail?.length || 0) + 1;
        await request('/system-admin/plan-modules/', {
          method: 'POST',
          body: JSON.stringify({
            plan: planId,
            module: moduleId,
            is_included: true,
            sort_order: nextSortOrder,
          }),
        });
        await loadAll();
        setFeedback('catalog-feedback', 'Modulo agregado al plan.');
      } catch (error) {
        setFeedback('catalog-feedback', error.message, true);
      }
    }));

    $('save-flag').addEventListener('click', async (event) => withButtonLock(event.currentTarget, async () => {
      if (!validateFlagForm()) return;
      const recordId = $('flag-record-id').value;
      const payload = {
        organization: Number($('flag-organization').value),
        module: $('flag-module').value ? Number($('flag-module').value) : null,
        key: $('flag-key').value.trim(),
        label: $('flag-label').value.trim(),
        description: $('flag-description').value.trim(),
        is_enabled: $('flag-enabled').value === 'true',
        config: {},
      };
      try {
        await request(recordId ? `/system-admin/feature-flags/${recordId}/` : '/system-admin/feature-flags/', {
          method: recordId ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        });
        await loadAll();
        resetFlagForm();
        setFeedback('flag-feedback', recordId ? 'Feature flag actualizada correctamente.' : 'Feature flag guardada correctamente.');
      } catch (error) {
        setFeedback('flag-feedback', error.message, true);
      }
    }));
  }

  async function bootstrap() {
    bindTabs();
    activateTab(getTabFromHash());
    activateOrgPanel('profile');
    bindActions();
    bindSubscriptionModuleActions();
    const allowed = await ensureAccess();
    if (!allowed) return;

    try {
      await loadAll();
      $('saas-admin-root').classList.remove('saas-admin-content--loading');
      resetOrganizationForm();
      resetUserForm();
      resetMembershipForm();
      resetModuleForm();
      resetPlanForm();
      resetFlagForm();
      renderSubscriptionModules();
    } catch (error) {
      setFeedback('system-admin-feedback', error.message, true);
    }
  }

  bootstrap();
})();
