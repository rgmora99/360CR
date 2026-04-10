(function initConfiguracionesModule() {
  const usersList = document.getElementById('users-list');
  const collaboratorsSummary = document.getElementById('collaborators-summary');
  const rolesGroups = document.getElementById('roles-groups');
  const systemSettingsGroups = document.getElementById('system-settings-groups');
  const organizationsList = document.getElementById('organizations-list');
  const orgNameInput = document.getElementById('org-name');
  const orgParentSelect = document.getElementById('org-parent');
  const createOrganizationButton = document.getElementById('create-organization');
  const orgFeedback = document.getElementById('org-feedback');
  const inviteEmailInput = document.getElementById('invite-email');
  const inviteRoleSelect = document.getElementById('invite-role');
  const createInvitationButton = document.getElementById('create-invitation');
  const invitationsList = document.getElementById('invitations-list');
  const teamFeedback = document.getElementById('team-feedback');
  const API_BASE = '/api';

  if (
    !usersList ||
    !rolesGroups ||
    !systemSettingsGroups ||
    !organizationsList ||
    !orgParentSelect ||
    !inviteEmailInput ||
    !inviteRoleSelect ||
    !createInvitationButton ||
    !invitationsList ||
    !teamFeedback ||
    !collaboratorsSummary
  ) {
    return;
  }

  const personaLabels = {
    it_admin: 'Administrador de TI',
    business_manager: 'Jefatura / Dirección',
    cross_functional: 'Uso transversal',
  };
  const settingCategoryLabels = {
    security: 'Seguridad',
    operations: 'Operaciones',
    finance: 'Finanzas',
    notifications: 'Notificaciones',
  };

  const showError = (message) => {
    if (window.showErrorAlert) {
      window.showErrorAlert(message);
      return;
    }
    alert(message);
  };

  const getActiveOrganizationId = () => {
    const id = Number(window.AppSession?.getActiveOrganizationId?.());
    if (!id) {
      throw new Error('Debes seleccionar una organización activa para gestionar colaboradores.');
    }
    return id;
  };

  const normalizeApiBase = (rawBase) => {
    let base = (rawBase || API_BASE).trim();
    if (!base.startsWith('http') && !base.startsWith('/')) {
      base = `/${base}`;
    }
    base = base.replace(/\/+$/, '');
    base = base.replace(/\/organizations(\/.*)?$/i, '');
    if (!/\/api$/i.test(base)) {
      base = `${base}/api`;
    }
    return base;
  };

  const getApiBase = () => {
    return normalizeApiBase(API_BASE);
  };

  const setOrgFeedback = (message, isError = false) => {
    orgFeedback.textContent = message;
    orgFeedback.style.color = isError ? '#b42318' : 'var(--color-muted)';
    if (window.appAlerts?.toast) {
      window.appAlerts.toast(message, isError ? 'error' : 'success');
    }
  };

  const setTeamFeedback = (message, isError = false) => {
    teamFeedback.textContent = message;
    teamFeedback.style.color = isError ? '#b42318' : 'var(--color-muted)';
    if (window.appAlerts?.toast) {
      window.appAlerts.toast(message, isError ? 'error' : 'success');
    }
  };

  const orgRequest = async (path, options) => {
    const response = await fetch(`${getApiBase()}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
      credentials: 'include',
      ...options,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || 'No fue posible completar la operación.');
    }

    if (!text) {
      return null;
    }

    return JSON.parse(text);
  };

  const renderOrganizations = (organizations) => {
    if (!organizations.length) {
      organizationsList.innerHTML = '<li>Sin organizaciones registradas.</li>';
      orgParentSelect.innerHTML = '<option value="">Sin padre (organización raíz)</option>';
      return;
    }

    orgParentSelect.innerHTML = ['<option value="">Sin padre (organización raíz)</option>']
      .concat(
        organizations.map(
          (organization) => `<option value="${organization.id}">${organization.name} (#${organization.id})</option>`,
        ),
      )
      .join('');

    organizationsList.innerHTML = organizations
      .map(
        (organization) => `<li>
          <strong>${organization.name}</strong>
          <span>ID #${organization.id}${organization.parent_organization ? ` · Sucursal de #${organization.parent_organization}` : ' · Organización raíz'}</span>
        </li>`,
      )
      .join('');
  };

  const loadOrganizations = async () => {
    try {
      const organizations = await orgRequest('/organizations/');
      renderOrganizations(organizations);
      setOrgFeedback(`Se cargaron ${organizations.length} organizaciones.`);
    } catch (error) {
      renderOrganizations([]);
      setOrgFeedback(error.message || 'No fue posible cargar organizaciones.', true);
    }
  };

  const createOrganization = async () => {
    const name = orgNameInput.value.trim();
    if (!name) {
      setOrgFeedback('Debe indicar un nombre para crear la organización.', true);
      return;
    }

    try {
      const parentOrganization = orgParentSelect.value ? Number(orgParentSelect.value) : null;
      const created = await orgRequest('/organizations/', {
        method: 'POST',
        body: JSON.stringify({ name, parent_organization: parentOrganization }),
      });
      orgNameInput.value = '';
      orgParentSelect.value = '';
      setOrgFeedback(`Organización creada: ${created.name} (#${created.id}).`);
      await loadOrganizations();
      await loadCollaborators();
    } catch (error) {
      setOrgFeedback(error.message || 'No fue posible crear la organización.', true);
    }
  };

  const renderCollaborators = (summary) => {
    const max = summary.max_collaborators;
    const slotsText = max === null ? 'Ilimitados' : `${summary.current_collaborators}/${max}`;
    collaboratorsSummary.textContent = `Plan: ${summary.plan}. Colaboradores asociados: ${slotsText}.`;

    if (!summary.collaborators.length) {
      usersList.innerHTML = '<li>Sin colaboradores asociados en esta organización.</li>';
      return;
    }

    usersList.innerHTML = summary.collaborators
      .map(
        (collaborator) => `<li>
          <strong>${collaborator.email}</strong>
          <span>Rol: ${collaborator.role}</span>
        </li>`,
      )
      .join('');

    if (max !== null && summary.current_collaborators >= max) {
      setTeamFeedback(`Límite alcanzado: el plan ${summary.plan} permite máximo ${max} colaboradores.`, true);
    }
  };

  const loadCollaborators = async () => {
    try {
      const organizationId = getActiveOrganizationId();
      const summary = await orgRequest(`/config/organization-collaborators/?organization_id=${organizationId}`);
      renderCollaborators(summary);
      invitationsList.innerHTML = summary.collaborators
        .map((collaborator) => `<li><strong>${collaborator.email}</strong><span>Asociado con rol ${collaborator.role}</span></li>`)
        .join('');
      if (!summary.collaborators.length) {
        invitationsList.innerHTML = '<li>Sin colaboradores asociados.</li>';
      }
    } catch (error) {
      collaboratorsSummary.textContent = 'No fue posible cargar colaboradores.';
      usersList.innerHTML = '<li>Error al consultar colaboradores.</li>';
      invitationsList.innerHTML = '<li>Sin datos de colaboradores.</li>';
      setTeamFeedback(error.message || 'No fue posible cargar colaboradores.', true);
    }
  };

  const createInvitation = async () => {
    const email = inviteEmailInput.value.trim().toLowerCase();
    const role = inviteRoleSelect.value;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setTeamFeedback('Ingresa un correo válido para asociar un colaborador.', true);
      return;
    }

    try {
      const organizationId = getActiveOrganizationId();
      const summary = await orgRequest('/config/organization-collaborators/', {
        method: 'POST',
        body: JSON.stringify({ organization_id: organizationId, email, role }),
      });

      inviteEmailInput.value = '';
      renderCollaborators(summary);
      invitationsList.innerHTML = summary.collaborators
        .map((collaborator) => `<li><strong>${collaborator.email}</strong><span>Asociado con rol ${collaborator.role}</span></li>`)
        .join('');
      setTeamFeedback(`Colaborador asociado: ${email}.`);
    } catch (error) {
      setTeamFeedback(error.message || 'No fue posible asociar el colaborador.', true);
    }
  };

  const renderRoles = (roles) => {
    if (!roles.length) {
      rolesGroups.innerHTML = '<p>No hay roles configurados.</p>';
      return;
    }

    const grouped = roles.reduce((acc, role) => {
      if (!acc[role.persona]) acc[role.persona] = [];
      acc[role.persona].push(role);
      return acc;
    }, {});

    rolesGroups.innerHTML = Object.entries(grouped)
      .map(
        ([persona, roleList]) => `<section class="role-group">
          <h3>${personaLabels[persona] || persona}</h3>
          <ul class="settings-list">
            ${roleList
              .map(
                (role) => `<li>
                    <strong>${role.name}</strong>
                    <span>${role.description}</span>
                    <small>Escenarios: ${role.typical_scenarios}</small>
                  </li>`,
              )
              .join('')}
          </ul>
        </section>`,
      )
      .join('');
  };

  const renderSettings = (settings) => {
    if (!settings.length) {
      systemSettingsGroups.innerHTML = '<p class="section-help">Sin parámetros cargados.</p>';
      return;
    }

    const groupedSettings = settings.reduce((acc, setting) => {
      if (!acc[setting.category]) {
        acc[setting.category] = [];
      }
      acc[setting.category].push(setting);
      return acc;
    }, {});

    systemSettingsGroups.innerHTML = Object.entries(groupedSettings)
      .sort(([categoryA], [categoryB]) => categoryA.localeCompare(categoryB))
      .map(
        ([category, categorySettings]) => `
          <section class="settings-group-card">
            <h3>${settingCategoryLabels[category] || category}</h3>
            <ul class="settings-list">
              ${categorySettings
                .map(
                  (setting) => `<li>
                    <strong>${setting.key}</strong>
                    <span>${setting.description}</span>
                    <small>${setting.is_sensitive ? 'Parámetro sensible' : 'Parámetro estándar'}</small>
                  </li>`,
                )
                .join('')}
            </ul>
          </section>
        `,
      )
      .join('');
  };

  const loadData = async () => {
    try {
      const [rolesRes, settingsRes] = await Promise.all([fetch('/api/config/roles/'), fetch('/api/config/system-settings/')]);

      if (!rolesRes.ok || !settingsRes.ok) {
        throw new Error('No fue posible cargar el módulo de configuraciones.');
      }

      const [roles, systemSettings] = await Promise.all([rolesRes.json(), settingsRes.json()]);
      renderRoles(roles);
      renderSettings(systemSettings);
      await loadCollaborators();
    } catch (error) {
      showError(error.message || 'Error inesperado al cargar configuraciones.');
    }
  };

  createOrganizationButton.addEventListener('click', createOrganization);
  createInvitationButton.addEventListener('click', createInvitation);
  loadData();
  loadOrganizations();
})();
