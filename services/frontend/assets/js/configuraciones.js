(function initConfiguracionesModule() {
  const usersList = document.getElementById('users-list');
  const newUserEmailInput = document.getElementById('new-user-email');
  const newUserRoleSelect = document.getElementById('new-user-role');
  const newUserFirstNameInput = document.getElementById('new-user-first-name');
  const newUserLastNameInput = document.getElementById('new-user-last-name');
  const createCollaboratorUserButton = document.getElementById('create-collaborator-user');
  const userFeedback = document.getElementById('user-feedback');
  const rolesGroups = document.getElementById('roles-groups');
  const systemSettingsGroups = document.getElementById('system-settings-groups');
  const organizationsList = document.getElementById('organizations-list');
  const orgNameInput = document.getElementById('org-name');
  const orgParentSelect = document.getElementById('org-parent');
  const createOrganizationButton = document.getElementById('create-organization');
  const orgFeedback = document.getElementById('org-feedback');
  const newRoleNameInput = document.getElementById('new-role-name');
  const newRoleCodeInput = document.getElementById('new-role-code');
  const newRolePersonaSelect = document.getElementById('new-role-persona');
  const newRolePermissionsInput = document.getElementById('new-role-permissions');
  const newRoleDescriptionInput = document.getElementById('new-role-description');
  const newRoleScenariosInput = document.getElementById('new-role-scenarios');
  const createRoleButton = document.getElementById('create-role');
  const assignRoleUserSelect = document.getElementById('assign-role-user');
  const assignRoleRoleSelect = document.getElementById('assign-role-role');
  const assignRoleButton = document.getElementById('assign-role');
  const roleAssignmentsList = document.getElementById('role-assignments-list');
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
  const availabilityViewCollaborator = document.getElementById('availability-view-collaborator');
  const availabilityFeedback = document.getElementById('availability-feedback');
  const API_BASE = '/api';
  const AVAILABILITY_STORAGE_KEY = 'cr360.config.availability-rules';
  const USER_ROLE_FALLBACK = 'colaborador';
  let rolesCache = [];
  let usersCache = [];
  let collaboratorsCache = [];

  if (
    !usersList ||
    !newUserEmailInput ||
    !newUserRoleSelect ||
    !newUserFirstNameInput ||
    !newUserLastNameInput ||
    !createCollaboratorUserButton ||
    !userFeedback ||
    !rolesGroups ||
    !systemSettingsGroups ||
    !organizationsList ||
    !orgParentSelect ||
    !newRoleNameInput ||
    !newRoleCodeInput ||
    !newRolePersonaSelect ||
    !newRolePermissionsInput ||
    !newRoleDescriptionInput ||
    !newRoleScenariosInput ||
    !createRoleButton ||
    !assignRoleUserSelect ||
    !assignRoleRoleSelect ||
    !assignRoleButton ||
    !roleAssignmentsList ||
    !teamFeedback ||
    !availabilityCollaborator ||
    !availabilityWeekday ||
    !availabilityStart ||
    !availabilityEnd ||
    !availabilityActive ||
    !saveAvailabilityRuleButton ||
    !availabilityRulesList ||
    !availabilityViewCollaborator ||
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
  const setUserFeedback = (message, isError = false) => {
    userFeedback.textContent = message;
    userFeedback.style.color = isError ? '#b42318' : 'var(--color-muted)';
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
          <small>${user.requires_password_setup ? 'Pendiente: debe crear contraseña al primer ingreso.' : 'Acceso con contraseña configurada.'}</small>
        </li>`,
      )
      .join('');
  };

  const createCollaboratorUser = async () => {
    const organizationId = Number(window.AppSession?.getActiveOrganizationId?.());
    const email = newUserEmailInput.value.trim().toLowerCase();
    const membershipRole = newUserRoleSelect.value;
    const firstName = newUserFirstNameInput.value.trim();
    const lastName = newUserLastNameInput.value.trim();

    if (!organizationId) {
      setUserFeedback('Debes seleccionar un negocio activo para crear usuarios.', true);
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setUserFeedback('Ingresa un correo válido para el colaborador.', true);
      return;
    }

    try {
      await fetch('/api/config/users/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          username: email,
          first_name: firstName,
          last_name: lastName,
          organization_id: organizationId,
          membership_role: membershipRole,
        }),
      }).then(async (response) => {
        if (!response.ok) {
          const raw = await response.text();
          let message = raw;
          try {
            const parsed = JSON.parse(raw);
            message = parsed.detail || Object.values(parsed || {}).flat().join(' ');
          } catch (_error) {
            message = raw;
          }
          throw new Error(message || 'No fue posible crear el usuario colaborador.');
        }
      });

      setUserFeedback(`Usuario ${email} creado. Al iniciar sesión deberá definir su contraseña.`);
      newUserEmailInput.value = '';
      newUserFirstNameInput.value = '';
      newUserLastNameInput.value = '';
      await loadData();
      await loadCollaborators();
    } catch (error) {
      setUserFeedback(error.message || 'Error al crear usuario colaborador.', true);
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

  const renderRoleOptions = (roles) => {
    if (!roles.length) {
      assignRoleRoleSelect.innerHTML = '<option value="">Sin roles disponibles</option>';
      return;
    }

    assignRoleRoleSelect.innerHTML = roles
      .map((role) => `<option value="${role.id}">${role.name}</option>`)
      .join('');
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

  const renderUsersOptions = (users) => {
    if (!users.length) {
      assignRoleUserSelect.innerHTML = '<option value="">Sin usuarios activos</option>';
      return;
    }
    assignRoleUserSelect.innerHTML = users
      .map((user) => `<option value="${user.id}">${user.email || user.username}</option>`)
      .join('');
  };

  const renderRoleAssignments = async () => {
    try {
      const response = await fetch('/api/config/user-role-assignments/', { credentials: 'include' });
      if (!response.ok) throw new Error('No fue posible cargar asociaciones de roles.');
      const assignments = await response.json();
      if (!assignments.length) {
        roleAssignmentsList.innerHTML = '<li>Sin asociaciones de roles registradas.</li>';
        return;
      }

      roleAssignmentsList.innerHTML = assignments
        .map((assignment) => {
          const assignedUser = usersCache.find((user) => Number(user.id) === Number(assignment.user));
          return `<li>
            <strong>${assignment.role_detail?.name || 'Rol'}</strong>
            <span>${assignedUser?.email || assignedUser?.username || `Usuario #${assignment.user}`}${assignment.organization ? ` · Organización #${assignment.organization}` : ''}</span>
            <small>${assignment.is_active ? 'Asociación activa' : 'Asociación inactiva'}</small>
          </li>`;
        })
        .join('');
    } catch (error) {
      roleAssignmentsList.innerHTML = `<li>${error.message || 'No se pudo cargar asociaciones.'}</li>`;
    }
  };

  const createRole = async () => {
    const name = newRoleNameInput.value.trim();
    const code = newRoleCodeInput.value.trim().toLowerCase().replace(/\s+/g, '_');
    const persona = newRolePersonaSelect.value;
    const description = newRoleDescriptionInput.value.trim();
    const typicalScenarios = newRoleScenariosInput.value.trim();
    const defaultPermissions = newRolePermissionsInput.value
      .split(',')
      .map((permission) => permission.trim())
      .filter(Boolean);

    if (!name || !code || !description || !typicalScenarios) {
      setTeamFeedback('Completa nombre, código, descripción y escenarios para crear el rol.', true);
      return;
    }

    try {
      const response = await fetch('/api/config/roles/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          code,
          persona,
          description,
          typical_scenarios: typicalScenarios,
          default_permissions: defaultPermissions,
          is_system_default: false,
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'No fue posible crear el rol.');
      }
      setTeamFeedback(`Rol ${name} creado correctamente.`);
      newRoleNameInput.value = '';
      newRoleCodeInput.value = '';
      newRolePermissionsInput.value = '';
      newRoleDescriptionInput.value = '';
      newRoleScenariosInput.value = '';
      await loadData();
    } catch (error) {
      setTeamFeedback(error.message || 'Error al crear rol.', true);
    }
  };

  const assignRole = async () => {
    const userId = Number(assignRoleUserSelect.value);
    const roleId = Number(assignRoleRoleSelect.value);
    const organizationId = Number(window.AppSession?.getActiveOrganizationId?.());

    if (!userId || !roleId) {
      setTeamFeedback('Selecciona usuario y rol para asociarlos.', true);
      return;
    }

    try {
      const response = await fetch('/api/config/user-role-assignments/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          user: userId,
          role: roleId,
          organization: organizationId || null,
          is_active: true,
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'No fue posible asociar el rol.');
      }
      const selectedUser = usersCache.find((user) => Number(user.id) === userId);
      const selectedRole = rolesCache.find((role) => Number(role.id) === roleId);
      setTeamFeedback(`Rol ${selectedRole?.name || roleId} asociado a ${selectedUser?.email || selectedUser?.username}.`);
      renderRoleAssignments();
    } catch (error) {
      setTeamFeedback(error.message || 'Error al asociar rol.', true);
    }
  };

  const getCollaboratorLabel = (collaboratorId) => {
    const collaborator = collaboratorsCache.find((item) => Number(item.id) === Number(collaboratorId));
    return collaborator?.email || `Colaborador #${collaboratorId}`;
  };

  const renderCollaboratorsOptions = (collaborators) => {
    if (!collaborators.length) {
      availabilityCollaborator.innerHTML = '<option value="">Sin colaboradores</option>';
      availabilityViewCollaborator.innerHTML = '<option value="">Sin colaboradores</option>';
      return;
    }

    const collaboratorOptions = collaborators
      .map((collaborator) => `<option value="${collaborator.id}">${collaborator.email} · ${collaborator.role}</option>`)
      .join('');
    availabilityCollaborator.innerHTML = collaborators
      .map((collaborator) => `<option value="${collaborator.id}">${collaborator.email} · ${collaborator.role}</option>`)
      .join('');
    availabilityViewCollaborator.innerHTML = `<option value="">Todos los colaboradores</option>${collaboratorOptions}`;
  };

  const fallbackCollaboratorsFromUsers = () => {
    if (!usersCache.length) return [];
    return usersCache
      .filter((user) => user.is_active)
      .map((user) => ({
        id: user.id,
        email: user.email || user.username || `usuario-${user.id}`,
        role: USER_ROLE_FALLBACK,
      }));
  };

  const renderAvailabilityRules = () => {
    const activeOrganizationId = Number(window.AppSession?.getActiveOrganizationId?.());
    const rules = getStoredAvailabilityRules().filter((rule) => Number(rule.organizationId) === activeOrganizationId);

    const collaboratorFilter = Number(availabilityViewCollaborator.value);
    const filteredRules = collaboratorFilter
      ? rules.filter((rule) => Number(rule.collaboratorId) === collaboratorFilter)
      : rules;

    if (!filteredRules.length) {
      availabilityRulesList.innerHTML = '<li>No hay horarios definidos para este negocio.</li>';
      return;
    }

    const groupedRules = filteredRules.reduce((acc, rule) => {
      const key = String(rule.collaboratorId);
      if (!acc[key]) acc[key] = [];
      acc[key].push(rule);
      return acc;
    }, {});

    availabilityRulesList.innerHTML = Object.entries(groupedRules)
      .sort(([a], [b]) => getCollaboratorLabel(a).localeCompare(getCollaboratorLabel(b), 'es'))
      .map(([collaboratorId, collaboratorRules]) => {
        const rows = collaboratorRules
          .sort((left, right) => Number(left.weekday) - Number(right.weekday))
          .map(
            (rule) => `<div class="availability-row">
              <span>${weekdayLabels[rule.weekday] || 'Día no definido'}</span>
              <span>${rule.start} - ${rule.end}</span>
              <small>${rule.active ? 'Disponible' : 'Bloqueado'}</small>
            </div>`,
          )
          .join('');
        return `<li>
          <strong>${getCollaboratorLabel(collaboratorId)}</strong>
          <div class="availability-user-grid">${rows}</div>
        </li>`;
      })
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
      const response = await fetch(`/api/agenda-events/collaborators/?organization_id=${organizationId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('No fue posible cargar colaboradores para disponibilidad.');
      }
      collaboratorsCache = await response.json();
      if (!collaboratorsCache.length) {
        collaboratorsCache = fallbackCollaboratorsFromUsers();
      }
      renderCollaboratorsOptions(collaboratorsCache);
      renderAvailabilityRules();
      setAvailabilityFeedback(`Se cargaron ${collaboratorsCache.length} colaboradores para esta agenda.`);
    } catch (error) {
      collaboratorsCache = fallbackCollaboratorsFromUsers();
      renderCollaboratorsOptions(collaboratorsCache);
      renderAvailabilityRules();
      if (collaboratorsCache.length) {
        setAvailabilityFeedback('No fue posible consultar agenda; se muestran usuarios activos como respaldo.', true);
        return;
      }
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
      usersCache = users;
      rolesCache = roles;
      renderUsers(users);
      renderUsersOptions(users.filter((user) => user.is_active));
      renderRoles(roles);
      renderRoleOptions(roles);
      renderRoleAssignments();
      renderSettings(systemSettings);
      if (!collaboratorsCache.length) {
        loadCollaborators();
      }
    } catch (error) {
      showError(error.message || 'Error inesperado al cargar configuraciones.');
    }
  };

  createOrganizationButton.addEventListener('click', createOrganization);
  createRoleButton.addEventListener('click', createRole);
  assignRoleButton.addEventListener('click', assignRole);
  createCollaboratorUserButton.addEventListener('click', createCollaboratorUser);
  saveAvailabilityRuleButton.addEventListener('click', saveAvailabilityRule);
  availabilityViewCollaborator.addEventListener('change', renderAvailabilityRules);
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
