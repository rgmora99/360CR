(function initSaasAdmin() {
  const $ = (id) => document.getElementById(id);

  const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];
  const SOURCE_LABELS = {
    plan: 'Plan',
    addon: 'Add-on',
    custom: 'Personalizado',
  };

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
        throw new Error(
          payload?.detail ||
            payload?.slug?.[0] ||
            payload?.email?.[0] ||
            payload?.non_field_errors?.[0] ||
            text ||
            'No se pudo completar la accion.',
        );
      }
      return payload;
    });
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
    node.style.color = isError ? '#ff8f8f' : 'var(--muted)';
    if (message && window.appAlerts?.toast) {
      window.appAlerts.toast(message, isError ? 'error' : 'success');
    }
  }

  function setGuardState(message, redirect = false) {
    $('access-guard').classList.remove('hidden');
    $('access-guard-message').textContent = message;
    document.querySelectorAll('.saas-admin-hero, .saas-admin-stats, .saas-admin-tabs, .saas-admin-panel').forEach((node) => {
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
    document.querySelectorAll('[data-admin-tab]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.adminTab === tabId);
    });
    document.querySelectorAll('[data-admin-panel]').forEach((panel) => {
      panel.classList.toggle('is-active', panel.dataset.adminPanel === tabId);
    });
  }

  function getSubscriptionByOrganizationId(organizationId) {
    return state.subscriptions.find((item) => Number(item.organization) === Number(organizationId)) || null;
  }

  function getSelectedSubscription() {
    const organizationId = Number($('subscription-organization').value);
    return getSubscriptionByOrganizationId(organizationId);
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
    $('organizations-body').innerHTML =
      rows
        .map((organization) => {
          const subscription = getSubscriptionByOrganizationId(organization.id);
          return `
            <tr data-org-id="${organization.id}">
              <td>${escapeHtml(organization.name)}</td>
              <td>${escapeHtml(organization.slug)}</td>
              <td>${escapeHtml(subscription?.plan_catalog_name || organization.subscription_plan_name || 'Sin plan')}</td>
              <td>${escapeHtml(subscription?.status || organization.subscription_status || 'Sin suscripcion')}</td>
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

    if (!select) return;

    if (!availableModules.length) {
      select.innerHTML = '<option value="">Todos los modulos ya estan asignados</option>';
      return;
    }

    select.innerHTML = availableModules
      .map((module) => `<option value="${module.id}">${escapeHtml(module.name)} (${escapeHtml(module.group)})</option>`)
      .join('');
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
      renderSubscriptionModuleOptions();
      return;
    }

    const modules = (subscription.active_modules || []).slice().sort((left, right) => {
      if (left.is_enabled !== right.is_enabled) return left.is_enabled ? -1 : 1;
      return String(left.module_name || '').localeCompare(String(right.module_name || ''));
    });

    if (!modules.length) {
      list.innerHTML = '<li class="saas-admin-empty-state">Esta suscripcion aun no tiene modulos activos ni add-ons configurados.</li>';
      renderSubscriptionModuleOptions();
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

    renderSubscriptionModuleOptions();
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

  function resetOrganizationForm() {
    $('org-record-id').value = '';
    $('org-name').value = '';
    $('org-slug').value = '';
    $('org-branch').value = '001';
    $('org-terminal').value = '00001';
  }

  function resetUserForm() {
    $('user-record-id').value = '';
    $('user-email').value = '';
    $('user-first-name').value = '';
    $('user-last-name').value = '';
    $('user-is-staff').value = 'false';
  }

  function resetMembershipForm() {
    $('membership-record-id').value = '';
    if ($('membership-user').options.length) $('membership-user').selectedIndex = 0;
    if ($('membership-organization').options.length) $('membership-organization').selectedIndex = 0;
    $('membership-role').value = 'owner';
  }

  function resetModuleForm() {
    $('module-record-id').value = '';
    $('module-code').value = '';
    $('module-name').value = '';
    $('module-group').value = 'base';
    $('module-route').value = '';
    $('module-description').value = '';
  }

  function resetPlanForm() {
    $('plan-record-id').value = '';
    $('plan-code').value = '';
    $('plan-name').value = '';
    $('plan-monthly-price').value = '';
    $('plan-annual-price').value = '';
    $('plan-description').value = '';
  }

  function resetFlagForm() {
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

    $('subscription-record-id').value = subscription?.id || '';
    $('subscription-organization').value = String(organization.id);
    $('subscription-plan').value = subscription?.plan_catalog || '';
    $('subscription-status').value = subscription?.status || 'trial';
    $('subscription-cycle').value = subscription?.billing_cycle || 'monthly';
    $('subscription-next-billing').value = subscription?.next_billing_date || '';
    $('subscription-base-price').value = subscription?.base_price || 0;
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
      row.addEventListener('click', () => hydrateOrganizationForm(row.dataset.orgId));
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
      button.addEventListener('click', () => activateTab(button.dataset.adminTab));
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
    if (!subscription?.id) {
      setFeedback('subscription-feedback', 'Debes guardar o seleccionar una suscripcion antes de asignar modulos.', true);
      return;
    }
    if (!moduleId) {
      setFeedback('subscription-feedback', 'Selecciona un modulo disponible.', true);
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
    $('reset-organization-form').addEventListener('click', resetOrganizationForm);
    $('reset-user-form').addEventListener('click', resetUserForm);
    $('reset-membership-form').addEventListener('click', resetMembershipForm);
    $('reset-module-form').addEventListener('click', resetModuleForm);
    $('reset-plan-form').addEventListener('click', resetPlanForm);
    $('reset-flag-form').addEventListener('click', resetFlagForm);

    $('subscription-organization').addEventListener('change', () => {
      hydrateOrganizationForm($('subscription-organization').value);
      renderSubscriptionModuleOptions();
      renderSubscriptionModules();
    });

    $('add-subscription-module').addEventListener('click', () => {
      addSubscriptionModule().catch(() => null);
    });

    $('save-organization').addEventListener('click', async () => {
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
    });

    $('save-subscription').addEventListener('click', async () => {
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
    });

    $('save-user').addEventListener('click', async () => {
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
    });

    $('save-membership').addEventListener('click', async () => {
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
    });

    $('save-module').addEventListener('click', async () => {
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
    });

    $('save-plan').addEventListener('click', async () => {
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
    });

    $('link-plan-module').addEventListener('click', async () => {
      try {
        const planId = Number($('plan-module-plan').value);
        const existingPlan = state.plans.find((plan) => Number(plan.id) === planId);
        const nextSortOrder = (existingPlan?.modules_detail?.length || 0) + 1;
        await request('/system-admin/plan-modules/', {
          method: 'POST',
          body: JSON.stringify({
            plan: planId,
            module: Number($('plan-module-module').value),
            is_included: true,
            sort_order: nextSortOrder,
          }),
        });
        await loadAll();
        setFeedback('catalog-feedback', 'Modulo agregado al plan.');
      } catch (error) {
        setFeedback('catalog-feedback', error.message, true);
      }
    });

    $('save-flag').addEventListener('click', async () => {
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
    });
  }

  async function bootstrap() {
    bindTabs();
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
