(function initConfiguracionesModule() {
  const usersList = document.getElementById('users-list');
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
  const INVITATIONS_STORAGE_KEY = 'cr360.config.invitations';
  let rolesCache = [];

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
    !teamFeedback
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
    // eslint-disable-next-line no-alert
    alert(message);
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
    } catch (error) {
      setOrgFeedback(error.message || 'No fue posible crear la organización.', true);
    }
  };

  const renderUsers = (users) => {
    if (!users.length) {
      usersList.innerHTML = '<li>Sin usuarios registrados por ahora.</li>';
      return;
    }

    usersList.innerHTML = users
      .map(
        (user) => `<li>
          <strong>${user.email || user.username}</strong>
          <span>${user.is_active ? 'Activo' : 'Inactivo'} · ${user.is_staff ? 'Staff' : 'Operativo'}</span>
        </li>`,
      )
      .join('');
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

  const renderRoleOptions = (roles) => {
    if (!roles.length) {
      inviteRoleSelect.innerHTML = '<option value="">Sin roles disponibles</option>';
      return;
    }

    inviteRoleSelect.innerHTML = roles
      .map((role) => `<option value="${role.id}">${role.name}</option>`)
      .join('');
  };

  const getStoredInvitations = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(INVITATIONS_STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  };

  const saveInvitations = (invitations) => {
    localStorage.setItem(INVITATIONS_STORAGE_KEY, JSON.stringify(invitations));
  };

  const renderInvitations = () => {
    const invitations = getStoredInvitations();
    if (!invitations.length) {
      invitationsList.innerHTML = '<li>Sin invitaciones pendientes.</li>';
      return;
    }

    invitationsList.innerHTML = invitations
      .map(
        (invitation) => `<li>
          <strong>${invitation.email}</strong>
          <span>Rol: ${invitation.roleName}</span>
          <small>Creada: ${new Date(invitation.createdAt).toLocaleString('es-CR')}</small>
        </li>`,
      )
      .join('');
  };

  const createInvitation = () => {
    const email = inviteEmailInput.value.trim().toLowerCase();
    const roleId = Number(inviteRoleSelect.value);
    const selectedRole = rolesCache.find((role) => role.id === roleId);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setTeamFeedback('Ingresa un correo válido para crear la invitación.', true);
      return;
    }

    if (!selectedRole) {
      setTeamFeedback('Selecciona un rol para la invitación.', true);
      return;
    }

    const invitations = getStoredInvitations();
    invitations.unshift({
      id: Date.now(),
      email,
      roleId: selectedRole.id,
      roleName: selectedRole.name,
      createdAt: new Date().toISOString(),
    });
    saveInvitations(invitations);
    inviteEmailInput.value = '';
    setTeamFeedback(`Invitación registrada para ${email} con rol ${selectedRole.name}.`);
    renderInvitations();
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
      const [usersRes, rolesRes, settingsRes] = await Promise.all([
        fetch('/api/config/users/'),
        fetch('/api/config/roles/'),
        fetch('/api/config/system-settings/'),
      ]);

      if (!usersRes.ok || !rolesRes.ok || !settingsRes.ok) {
        throw new Error('No fue posible cargar el módulo de configuraciones.');
      }

      const [users, roles, systemSettings] = await Promise.all([usersRes.json(), rolesRes.json(), settingsRes.json()]);
      rolesCache = roles;
      renderUsers(users);
      renderRoles(roles);
      renderRoleOptions(roles);
      renderInvitations();
      renderSettings(systemSettings);
    } catch (error) {
      showError(error.message || 'Error inesperado al cargar configuraciones.');
    }
  };

  createOrganizationButton.addEventListener('click', createOrganization);
  createInvitationButton.addEventListener('click', createInvitation);
  loadData();
  loadOrganizations();
})();
