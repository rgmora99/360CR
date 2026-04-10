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
  const settingsTabs = document.querySelectorAll('[data-settings-tab]');
  const settingsPanels = document.querySelectorAll('[data-settings-panel]');
  const availabilityCollaborator = document.getElementById('availability-collaborator');
  const availabilityWeekday = document.getElementById('availability-weekday');
  const availabilityStart = document.getElementById('availability-start');
  const availabilityEnd = document.getElementById('availability-end');
  const availabilityActive = document.getElementById('availability-active');
  const saveAvailabilityRuleButton = document.getElementById('save-availability-rule');
  const availabilityRulesList = document.getElementById('availability-rules-list');
  const availabilityFeedback = document.getElementById('availability-feedback');
  const API_BASE = '/api';
  const INVITATIONS_STORAGE_KEY = 'cr360.config.invitations';
  const AVAILABILITY_STORAGE_KEY = 'cr360.config.availability-rules';
  let rolesCache = [];
  let collaboratorsCache = [];

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
    !availabilityCollaborator ||
    !availabilityWeekday ||
    !availabilityStart ||
    !availabilityEnd ||
    !availabilityActive ||
    !saveAvailabilityRuleButton ||
    !availabilityRulesList ||
    !availabilityFeedback
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
  const weekdayLabels = {
    0: 'Domingo',
    1: 'Lunes',
    2: 'Martes',
    3: 'Miércoles',
    4: 'Jueves',
    5: 'Viernes',
    6: 'Sábado',
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
  const setAvailabilityFeedback = (message, isError = false) => {
    availabilityFeedback.textContent = message;
    availabilityFeedback.style.color = isError ? '#b42318' : 'var(--color-muted)';
    if (window.appAlerts?.toast) {
      window.appAlerts.toast(message, isError ? 'error' : 'success');
    }
  };

  const setupSubmenuTabs = () => {
    if (!settingsTabs.length || !settingsPanels.length) return;

    settingsTabs.forEach((tabButton) => {
      tabButton.addEventListener('click', () => {
        const targetPanel = tabButton.dataset.settingsTab;
        settingsTabs.forEach((button) => {
          button.classList.toggle('is-active', button === tabButton);
        });
        settingsPanels.forEach((panel) => {
          panel.classList.toggle('is-active', panel.dataset.settingsPanel === targetPanel);
        });
      });
    });
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
  const getStoredAvailabilityRules = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(AVAILABILITY_STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  };
  const saveAvailabilityRules = (rules) => {
    localStorage.setItem(AVAILABILITY_STORAGE_KEY, JSON.stringify(rules));
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

  const getCollaboratorLabel = (collaboratorId) => {
    const collaborator = collaboratorsCache.find((item) => Number(item.id) === Number(collaboratorId));
    return collaborator?.email || `Colaborador #${collaboratorId}`;
  };

  const renderCollaboratorsOptions = (collaborators) => {
    if (!collaborators.length) {
      availabilityCollaborator.innerHTML = '<option value="">Sin colaboradores</option>';
      return;
    }

    availabilityCollaborator.innerHTML = collaborators
      .map((collaborator) => `<option value="${collaborator.id}">${collaborator.email} · ${collaborator.role}</option>`)
      .join('');
  };

  const renderAvailabilityRules = () => {
    const activeOrganizationId = Number(window.AppSession?.getActiveOrganizationId?.());
    const rules = getStoredAvailabilityRules().filter((rule) => Number(rule.organizationId) === activeOrganizationId);

    if (!rules.length) {
      availabilityRulesList.innerHTML = '<li>No hay horarios definidos para este negocio.</li>';
      return;
    }

    availabilityRulesList.innerHTML = rules
      .sort((left, right) => Number(left.weekday) - Number(right.weekday))
      .map(
        (rule) => `<li>
          <strong>${getCollaboratorLabel(rule.collaboratorId)}</strong>
          <span>${weekdayLabels[rule.weekday] || 'Día no definido'} · ${rule.start} a ${rule.end}</span>
          <small>${rule.active ? 'Disponible para agenda' : 'Bloqueado para agenda'}</small>
        </li>`,
      )
      .join('');
  };

  const saveAvailabilityRule = () => {
    const organizationId = Number(window.AppSession?.getActiveOrganizationId?.());
    const collaboratorId = Number(availabilityCollaborator.value);
    const weekday = Number(availabilityWeekday.value);
    const start = availabilityStart.value;
    const end = availabilityEnd.value;
    const active = availabilityActive.checked;

    if (!organizationId) {
      setAvailabilityFeedback('Selecciona un negocio activo antes de configurar horarios.', true);
      return;
    }
    if (!collaboratorId) {
      setAvailabilityFeedback('Selecciona un colaborador para guardar la disponibilidad.', true);
      return;
    }
    if (!start || !end || start >= end) {
      setAvailabilityFeedback('Define una franja horaria válida (hora inicio menor a hora fin).', true);
      return;
    }

    const currentRules = getStoredAvailabilityRules().filter(
      (rule) =>
        !(
          Number(rule.organizationId) === organizationId &&
          Number(rule.collaboratorId) === collaboratorId &&
          Number(rule.weekday) === weekday
        ),
    );

    currentRules.push({
      id: Date.now(),
      organizationId,
      collaboratorId,
      weekday,
      start,
      end,
      active,
      updatedAt: new Date().toISOString(),
    });

    saveAvailabilityRules(currentRules);
    setAvailabilityFeedback(
      `Horario guardado para ${getCollaboratorLabel(collaboratorId)} (${weekdayLabels[weekday]} ${start}-${end}).`,
    );
    renderAvailabilityRules();
  };

  const loadCollaborators = async () => {
    const organizationId = Number(window.AppSession?.getActiveOrganizationId?.());
    if (!organizationId) {
      collaboratorsCache = [];
      renderCollaboratorsOptions([]);
      renderAvailabilityRules();
      setAvailabilityFeedback('Sin organización activa para cargar colaboradores.', true);
      return;
    }

    try {
      const response = await fetch(`/api/agenda/agenda-events/collaborators/?organization_id=${organizationId}`);
      if (!response.ok) {
        throw new Error('No fue posible cargar colaboradores para disponibilidad.');
      }
      collaboratorsCache = await response.json();
      renderCollaboratorsOptions(collaboratorsCache);
      renderAvailabilityRules();
      setAvailabilityFeedback(`Se cargaron ${collaboratorsCache.length} colaboradores para esta agenda.`);
    } catch (error) {
      collaboratorsCache = [];
      renderCollaboratorsOptions([]);
      renderAvailabilityRules();
      setAvailabilityFeedback(error.message || 'Error al cargar colaboradores.', true);
    }
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
  saveAvailabilityRuleButton.addEventListener('click', saveAvailabilityRule);
  document.addEventListener('change', (event) => {
    if (event.target?.id === 'organization-switcher') {
      loadCollaborators();
    }
  });
  setupSubmenuTabs();
  loadData();
  loadOrganizations();
  loadCollaborators();
  setTimeout(loadCollaborators, 1200);
})();
