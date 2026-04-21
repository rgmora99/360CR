(function initSaasAdmin() {
  const $ = (id) => document.getElementById(id);

  const state = {
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
        throw new Error(payload?.detail || payload?.slug?.[0] || payload?.email?.[0] || text || 'No se pudo completar la acción.');
      }
      return payload;
    });
  }

  function setFeedback(id, message, isError = false) {
    const node = $(id);
    if (!node) return;
    node.textContent = message;
    node.style.color = isError ? '#ff8f8f' : 'var(--muted)';
    if (window.appAlerts?.toast && message) {
      window.appAlerts.toast(message, isError ? 'error' : 'success');
    }
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
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

  function renderOrganizationOptions() {
    const options = state.organizations
      .map((organization) => `<option value="${organization.id}">${escapeHtml(organization.name)}</option>`)
      .join('');

    ['subscription-organization', 'membership-organization', 'flag-organization'].forEach((id) => {
      $(id).innerHTML = options || '<option value="">Sin organizaciones</option>';
    });
  }

  function renderUserOptions() {
    $('membership-user').innerHTML = state.users
      .map((user) => `<option value="${user.id}">${escapeHtml(user.email || user.username)}</option>`)
      .join('') || '<option value="">Sin usuarios</option>';
  }

  function renderModuleOptions() {
    const options = state.modules
      .map((module) => `<option value="${module.id}">${escapeHtml(module.name)} (${escapeHtml(module.group)})</option>`)
      .join('');
    $('plan-module-module').innerHTML = options || '<option value="">Sin módulos</option>';
    $('flag-module').innerHTML = '<option value="">Sin módulo</option>' + options;
  }

  function renderPlanOptions() {
    $('subscription-plan').innerHTML = state.plans
      .map((plan) => `<option value="${plan.id}">${escapeHtml(plan.name)}</option>`)
      .join('') || '<option value="">Sin planes</option>';
    $('plan-module-plan').innerHTML = state.plans
      .map((plan) => `<option value="${plan.id}">${escapeHtml(plan.name)}</option>`)
      .join('') || '<option value="">Sin planes</option>';
  }

  function renderOrganizationsTable() {
    $('organizations-body').innerHTML = state.organizations
      .map(
        (organization) => `
          <tr>
            <td>${escapeHtml(organization.name)}</td>
            <td>${escapeHtml(organization.slug)}</td>
            <td>${escapeHtml(organization.subscription_plan_name || 'Sin plan')}</td>
            <td>${escapeHtml(organization.subscription_status || 'Sin suscripción')}</td>
            <td>${escapeHtml(organization.memberships_count)}</td>
          </tr>
        `,
      )
      .join('') || '<tr><td colspan="5">No hay organizaciones registradas.</td></tr>';
  }

  function renderUsersTable() {
    $('users-body').innerHTML = state.users
      .map((user) => {
        const memberships = (user.memberships || []).map((membership) => `${membership.organization_name} (${membership.role})`).join(', ') || 'Sin accesos';
        return `
          <tr>
            <td>${escapeHtml(user.email || user.username)}</td>
            <td>${user.is_active ? 'Activo' : 'Inactivo'}</td>
            <td>${user.is_staff ? 'Sí' : 'No'}</td>
            <td>${escapeHtml(memberships)}</td>
          </tr>
        `;
      })
      .join('') || '<tr><td colspan="4">No hay usuarios registrados.</td></tr>';
  }

  function renderModulesList() {
    $('modules-list').innerHTML = state.modules
      .map(
        (module) => `
          <li>
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
          <li>
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
          <tr>
            <td>${escapeHtml(flag.organization_name)}</td>
            <td>${escapeHtml(flag.key)}</td>
            <td>${escapeHtml(flag.module_name || 'General')}</td>
            <td>${flag.is_enabled ? 'Activa' : 'Inactiva'}</td>
          </tr>
        `,
      )
      .join('') || '<tr><td colspan="4">No hay feature flags registradas.</td></tr>';
  }

  function syncSubscriptionForm() {
    const organizationId = Number($('subscription-organization').value);
    const subscription = state.subscriptions.find((item) => Number(item.organization) === organizationId);
    if (!subscription) return;

    $('subscription-plan').value = subscription.plan_catalog || '';
    $('subscription-status').value = subscription.status;
    $('subscription-cycle').value = subscription.billing_cycle;
    $('subscription-next-billing').value = subscription.next_billing_date || '';
    $('subscription-base-price').value = subscription.base_price || 0;
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
    renderOrganizationOptions();
    renderUserOptions();
    renderModuleOptions();
    renderPlanOptions();
    renderOrganizationsTable();
    renderUsersTable();
    renderModulesList();
    renderPlansList();
    renderFlagsTable();
    syncSubscriptionForm();
  }

  $('subscription-organization').addEventListener('change', syncSubscriptionForm);

  $('create-organization').addEventListener('click', async () => {
    try {
      await request('/system-admin/organizations/', {
        method: 'POST',
        body: JSON.stringify({
          name: $('org-name').value.trim(),
          slug: $('org-slug').value.trim(),
          hacienda_branch_code: $('org-branch').value.trim() || '001',
          hacienda_terminal_code: $('org-terminal').value.trim() || '00001',
        }),
      });
      $('org-name').value = '';
      $('org-slug').value = '';
      await loadAll();
      setFeedback('org-feedback', 'Organización creada correctamente.');
    } catch (error) {
      setFeedback('org-feedback', error.message, true);
    }
  });

  $('save-subscription').addEventListener('click', async () => {
    try {
      const organizationId = Number($('subscription-organization').value);
      const existing = state.subscriptions.find((item) => Number(item.organization) === organizationId);
      const payload = {
        organization: organizationId,
        plan: 'starter',
        plan_catalog: Number($('subscription-plan').value),
        status: $('subscription-status').value,
        billing_cycle: $('subscription-cycle').value,
        next_billing_date: $('subscription-next-billing').value || null,
        base_price: Number($('subscription-base-price').value || 0),
        is_active: $('subscription-status').value !== 'cancelled',
      };

      if (existing) {
        await request(`/system-admin/subscriptions/${existing.id}/`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await request('/system-admin/subscriptions/', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      await loadAll();
      setFeedback('org-feedback', 'Suscripción guardada correctamente.');
    } catch (error) {
      setFeedback('org-feedback', error.message, true);
    }
  });

  $('create-user').addEventListener('click', async () => {
    try {
      await request('/system-admin/users/', {
        method: 'POST',
        body: JSON.stringify({
          email: $('user-email').value.trim(),
          first_name: $('user-first-name').value.trim(),
          last_name: $('user-last-name').value.trim(),
          is_staff: $('user-is-staff').value === 'true',
          is_active: true,
        }),
      });
      $('user-email').value = '';
      $('user-first-name').value = '';
      $('user-last-name').value = '';
      await loadAll();
      setFeedback('user-feedback', 'Usuario creado correctamente.');
    } catch (error) {
      setFeedback('user-feedback', error.message, true);
    }
  });

  $('create-membership').addEventListener('click', async () => {
    try {
      await request('/system-admin/memberships/', {
        method: 'POST',
        body: JSON.stringify({
          user: Number($('membership-user').value),
          organization: Number($('membership-organization').value),
          role: $('membership-role').value,
        }),
      });
      await loadAll();
      setFeedback('user-feedback', 'Acceso asignado correctamente.');
    } catch (error) {
      setFeedback('user-feedback', error.message, true);
    }
  });

  $('create-module').addEventListener('click', async () => {
    try {
      await request('/system-admin/modules/', {
        method: 'POST',
        body: JSON.stringify({
          code: $('module-code').value.trim(),
          name: $('module-name').value.trim(),
          group: $('module-group').value,
          route_hint: $('module-route').value.trim(),
          description: $('module-description').value.trim(),
          is_active: true,
          is_public: true,
        }),
      });
      $('module-code').value = '';
      $('module-name').value = '';
      $('module-route').value = '';
      $('module-description').value = '';
      await loadAll();
      setFeedback('catalog-feedback', 'Módulo creado correctamente.');
    } catch (error) {
      setFeedback('catalog-feedback', error.message, true);
    }
  });

  $('create-plan').addEventListener('click', async () => {
    try {
      await request('/system-admin/plans/', {
        method: 'POST',
        body: JSON.stringify({
          code: $('plan-code').value.trim(),
          name: $('plan-name').value.trim(),
          description: $('plan-description').value.trim(),
          monthly_price: Number($('plan-monthly-price').value || 0),
          annual_price: Number($('plan-annual-price').value || 0),
          is_active: true,
        }),
      });
      $('plan-code').value = '';
      $('plan-name').value = '';
      $('plan-description').value = '';
      $('plan-monthly-price').value = '';
      $('plan-annual-price').value = '';
      await loadAll();
      setFeedback('catalog-feedback', 'Plan creado correctamente.');
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

  $('create-flag').addEventListener('click', async () => {
    try {
      await request('/system-admin/feature-flags/', {
        method: 'POST',
        body: JSON.stringify({
          organization: Number($('flag-organization').value),
          module: $('flag-module').value ? Number($('flag-module').value) : null,
          key: $('flag-key').value.trim(),
          label: $('flag-label').value.trim(),
          description: $('flag-description').value.trim(),
          is_enabled: $('flag-enabled').value === 'true',
          config: {},
        }),
      });
      $('flag-key').value = '';
      $('flag-label').value = '';
      $('flag-description').value = '';
      await loadAll();
      setFeedback('flag-feedback', 'Feature flag guardada correctamente.');
    } catch (error) {
      setFeedback('flag-feedback', error.message, true);
    }
  });

  async function bootstrap() {
    const session = window.AppSession?.getSession?.();
    if (!session?.user?.is_system_owner) {
      $('system-admin-feedback').textContent = 'Esta consola solo está disponible para el propietario del sistema.';
      $('system-admin-feedback').style.color = '#ff8f8f';
      return;
    }

    try {
      await loadAll();
    } catch (error) {
      setFeedback('system-admin-feedback', error.message, true);
    }
  }

  bootstrap();
})();
