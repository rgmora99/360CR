(function initSaasAdmin() {
  const $ = (id) => document.getElementById(id);

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
        throw new Error(payload?.detail || payload?.slug?.[0] || payload?.email?.[0] || payload?.non_field_errors?.[0] || text || 'No se pudo completar la acción.');
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

  function renderSummary() {
    const summary = state.overview?.summary || {};
    const stats = [
      ['Organizaciones', summary.organizations || 0],
      ['Suscripciones', summary.subscriptions || 0],
      ['Activas', summary.active_subscriptions || 0],
      ['Usuarios', summary.users || 0],
      ['Módulos', summary.modules || 0],
      ['Planes', summary.plans || 0],
      ['Flags', summary.feature_flags || 0],
    ];

    $('system-summary').innerHTML = stats
      .map(([label, value]) => `<article class="saas-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
      .join('');
  }

  function renderSelectOptions(targetIds, rows, getLabel, includeEmptyLabel = '') {
    const options = rows
      .map((row) => `<option value="${row.id}">${escapeHtml(getLabel(row))}</option>`)
      .join('');
    targetIds.forEach((id) => {
      $(id).innerHTML = (includeEmptyLabel ? `<option value="">${escapeHtml(includeEmptyLabel)}</option>` : '') + (options || `<option value="">Sin datos</option>`);
    });
  }

  function renderOrganizationsTable() {
    $('organizations-body').innerHTML = state.organizations
      .map((organization) => {
        const subscription = state.subscriptions.find((item) => Number(item.organization) === Number(organization.id));
        return `
          <tr data-org-id="${organization.id}">
            <td>${escapeHtml(organization.name)}</td>
            <td>${escapeHtml(organization.slug)}</td>
            <td>${escapeHtml(subscription?.plan_catalog_name || organization.subscription_plan_name || 'Sin plan')}</td>
            <td>${escapeHtml(subscription?.status || organization.subscription_status || 'Sin suscripción')}</td>
            <td>${escapeHtml(organization.memberships_count)}</td>
          </tr>
        `;
      })
      .join('') || '<tr><td colspan="5">No hay organizaciones registradas.</td></tr>';
  }

  function renderUsersTable() {
    $('users-body').innerHTML = state.users
      .map((user) => {
        const memberships = (user.memberships || []).map((membership) => `${membership.organization_name} (${membership.role})`).join(', ') || 'Sin accesos';
        return `
          <tr data-user-id="${user.id}">
            <td>${escapeHtml(user.email || user.username)}</td>
            <td>${user.is_active ? 'Activo' : 'Inactivo'}</td>
            <td>${user.is_staff ? 'Sí' : 'No'}</td>
            <td>${escapeHtml(memberships)}</td>
          </tr>
        `;
      })
      .join('') || '<tr><td colspan="4">No hay usuarios registrados.</td></tr>';
  }

  function renderMembershipsTable() {
    $('memberships-body').innerHTML = state.memberships
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
  }

  function renderModulesList() {
    $('modules-list').innerHTML = state.modules
      .map(
        (module) => `
          <li data-module-id="${module.id}">
            <strong>${escapeHtml(module.name)}</strong>
            <span>${escapeHtml(module.code)} · ${escapeHtml(module.group)} · ${escapeHtml(module.route_hint || 'sin ruta')}</span>
          </li>
        `,
      )
      .join('') || '<li><span>Sin módulos.</span></li>';
  }

  function renderPlansList() {
    $('plans-list').innerHTML = state.plans
      .map((plan) => {
        const modules = (plan.modules_detail || []).map((item) => item.module_name).join(', ') || 'Sin módulos';
        return `
          <li data-plan-id="${plan.id}">
            <strong>${escapeHtml(plan.name)}</strong>
            <span>${escapeHtml(plan.code)} · CRC ${escapeHtml(plan.monthly_price)} mensual · ${escapeHtml(modules)}</span>
          </li>
        `;
      })
      .join('') || '<li><span>Sin planes.</span></li>';
  }

  function renderFlagsTable() {
    $('flags-body').innerHTML = state.flags
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
    const subscription = state.subscriptions.find((item) => Number(item.organization) === Number(organization.id));

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
    renderSelectOptions(['plan-module-module', 'flag-module'], state.modules, (item) => `${item.name} (${item.group})`, 'Sin módulo');
    renderOrganizationsTable();
    renderUsersTable();
    renderMembershipsTable();
    renderModulesList();
    renderPlansList();
    renderFlagsTable();
    bindInteractiveRows();
  }

  async function ensureAccess() {
    try {
      const session = await request('/auth/session/', { headers: { Accept: 'application/json' } });
      state.session = session;
      window.AppSession?.save?.(session);
      if (!session?.user?.is_system_owner) {
        setGuardState('Esta consola solo está disponible para el propietario del sistema.', true);
        return false;
      }
      return true;
    } catch (_error) {
      setGuardState('Debes iniciar sesión con una cuenta del sistema para acceder a esta consola.', true);
      return false;
    }
  }

  function bindTabs() {
    document.querySelectorAll('[data-admin-tab]').forEach((button) => {
      button.addEventListener('click', () => activateTab(button.dataset.adminTab));
    });
  }

  function bindActions() {
    $('reset-organization-form').addEventListener('click', resetOrganizationForm);
    $('reset-user-form').addEventListener('click', resetUserForm);
    $('reset-membership-form').addEventListener('click', resetMembershipForm);
    $('reset-module-form').addEventListener('click', resetModuleForm);
    $('reset-plan-form').addEventListener('click', resetPlanForm);
    $('reset-flag-form').addEventListener('click', resetFlagForm);

    $('subscription-organization').addEventListener('change', () => hydrateOrganizationForm($('subscription-organization').value));

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
        setFeedback('org-feedback', recordId ? 'Organización actualizada correctamente.' : 'Organización creada correctamente.');
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
        setFeedback('org-feedback', 'Suscripción guardada correctamente.');
      } catch (error) {
        setFeedback('org-feedback', error.message, true);
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
        setFeedback('catalog-feedback', recordId ? 'Módulo actualizado correctamente.' : 'Módulo creado correctamente.');
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
        setFeedback('catalog-feedback', 'Módulo agregado al plan.');
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
    } catch (error) {
      setFeedback('system-admin-feedback', error.message, true);
    }
  }

  bootstrap();
})();
