(function initConfiguracionesModule() {
  const usersList = document.getElementById('users-list');
  const newUserEmailInput = document.getElementById('new-user-email');
  const newUserFirstNameInput = document.getElementById('new-user-first-name');
  const newUserLastNameInput = document.getElementById('new-user-last-name');
  const createCollaboratorUserButton = document.getElementById('create-collaborator-user');
  const cancelUserEditButton = document.getElementById('cancel-user-edit');
  const userFeedback = document.getElementById('user-feedback');
  const usersPagination = document.getElementById('users-pagination');
  const rolesGroups = document.getElementById('roles-groups');
  const rolesPagination = document.getElementById('roles-pagination');
  const systemSettingsGroups = document.getElementById('system-settings-groups');
  const organizationsList = document.getElementById('organizations-list');
  const orgNameInput = document.getElementById('org-name');
  const orgParentSelect = document.getElementById('org-parent');
  const orgBranchCodeInput = document.getElementById('org-branch-code');
  const orgTerminalCodeInput = document.getElementById('org-terminal-code');
  const createOrganizationButton = document.getElementById('create-organization');
  const cancelOrganizationEditButton = document.getElementById('cancel-organization-edit');
  const orgFeedback = document.getElementById('org-feedback');
  const newRoleNameInput = document.getElementById('new-role-name');
  const newRoleCodeInput = document.getElementById('new-role-code');
  const newRolePersonaSelect = document.getElementById('new-role-persona');
  const newRolePermissionsInput = document.getElementById('new-role-permissions');
  const permissionsPicker = document.getElementById('permissions-picker');
  const newRoleDescriptionInput = document.getElementById('new-role-description');
  const newRoleScenariosInput = document.getElementById('new-role-scenarios');
  const createRoleButton = document.getElementById('create-role');
  const cancelRoleEditButton = document.getElementById('cancel-role-edit');
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
  const emailOrgSelect = document.getElementById('email-org');
  const emailLabelInput = document.getElementById('email-label');
  const emailAddressInput = document.getElementById('email-address');
  const emailUsernameInput = document.getElementById('email-username');
  const emailPasswordInput = document.getElementById('email-password');
  const emailImapHostInput = document.getElementById('email-imap-host');
  const emailImapPortInput = document.getElementById('email-imap-port');
  const emailFolderInput = document.getElementById('email-folder');
  const emailImapSslInput = document.getElementById('email-imap-ssl');
  const emailIsPrimaryInput = document.getElementById('email-is-primary');
  const emailIsActiveInput = document.getElementById('email-is-active');
  const testEmailInboxButton = document.getElementById('test-email-inbox');
  const saveEmailInboxButton = document.getElementById('save-email-inbox');
  const cancelEmailEditButton = document.getElementById('cancel-email-edit');
  const emailInboxesList = document.getElementById('email-inboxes-list');
  const emailFeedback = document.getElementById('email-feedback');
  const availabilityDayInputs = Array.from(document.querySelectorAll('[data-availability-day]'));
  const availabilityPresetButtons = Array.from(document.querySelectorAll('[data-availability-preset]'));
  const API_BASE = '/api';
  const USER_ROLE_FALLBACK = 'colaborador';
  let rolesCache = [];
  let usersCache = [];
  let usersPage = 1;
  const usersPageSize = 5;
  let rolesPage = 1;
  const rolesPageSize = 4;
  let collaboratorsCache = [];
  let organizationsCache = [];
  let availabilityRulesCache = [];
  let editingUserId = null;
  let editingOrganizationId = null;
  let editingEmailInboxId = null;
  let editingRoleId = null;

  if (
    !usersList ||
    !newUserEmailInput ||
    !newUserFirstNameInput ||
    !newUserLastNameInput ||
    !createCollaboratorUserButton ||
    !cancelUserEditButton ||
    !userFeedback ||
    !usersPagination ||
    !rolesGroups ||
    !rolesPagination ||
    !systemSettingsGroups ||
    !organizationsList ||
    !orgNameInput ||
    !orgParentSelect ||
    !orgBranchCodeInput ||
    !orgTerminalCodeInput ||
    !createOrganizationButton ||
    !cancelOrganizationEditButton ||
    !newRoleNameInput ||
    !newRoleCodeInput ||
    !newRolePersonaSelect ||
    !newRolePermissionsInput ||
    !permissionsPicker ||
    !newRoleDescriptionInput ||
    !newRoleScenariosInput ||
    !createRoleButton ||
    !cancelRoleEditButton ||
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
    !availabilityFeedback ||
    !emailOrgSelect ||
    !emailLabelInput ||
    !emailAddressInput ||
    !emailUsernameInput ||
    !emailPasswordInput ||
    !emailImapHostInput ||
    !emailImapPortInput ||
    !emailFolderInput ||
    !emailImapSslInput ||
    !emailIsPrimaryInput ||
    !emailIsActiveInput ||
    !testEmailInboxButton ||
    !saveEmailInboxButton ||
    !cancelEmailEditButton ||
    !emailInboxesList ||
    !emailFeedback
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
  const settingsSections = ['usuarios', 'roles', 'organizaciones', 'disponibilidad', 'correo', 'sistema'];
  const weekdayLabels = {
    0: 'Domingo',
    1: 'Lunes',
    2: 'Martes',
    3: 'Miércoles',
    4: 'Jueves',
    5: 'Viernes',
    6: 'Sábado',
  };
  const addonPanelRequirements = {
    usuarios: 'multiuser_permissions',
    roles: 'multiuser_permissions',
    organizaciones: 'multiuser_permissions',
    disponibilidad: 'agenda',
    correo: 'purchases',
    sistema: 'multiuser_permissions',
  };
  const addonSettingRequirements = {
    finance: ['billing_basic', 'purchases', 'receivables'],
    notifications: ['purchases', 'reminders', 'campaigns'],
    operations: ['agenda', 'inventory', 'suppliers', 'shipping'],
  };
  const systemOwnerRoleCodes = new Set(['ti-super-admin']);
  const permissionGroups = [
    {
      label: 'Usuarios',
      permissions: [
        ['users.read', 'Ver usuarios', ['multiuser_permissions']],
        ['users.update', 'Editar usuarios', ['multiuser_permissions']],
        ['users.lock', 'Bloquear usuarios', ['multiuser_permissions']],
      ],
    },
    {
      label: 'Ventas y clientes',
      permissions: [
        ['customers.read', 'Ver clientes', ['customers']],
        ['dashboards.executive', 'Dashboard ejecutivo', ['dashboard']],
        ['approvals.high', 'Aprobaciones especiales', ['dashboard']],
      ],
    },
    {
      label: 'Finanzas',
      permissions: [
        ['invoices.manage', 'Facturación', ['billing_basic']],
        ['credit.manage', 'Crédito', ['receivables']],
        ['reports.finance', 'Reportes financieros', ['billing_basic', 'receivables']],
      ],
    },
    {
      label: 'Operación',
      permissions: [
        ['inventory.manage', 'Inventario', ['inventory']],
        ['suppliers.manage', 'Proveedores y compras', ['suppliers', 'purchases']],
        ['operations.kpi', 'KPIs operativos', ['dashboard', 'inventory']],
      ],
    },
    {
      label: 'Reportes',
      permissions: [
        ['reports.read', 'Reportes generales', ['dashboard']],
        ['suppliers.read', 'Consulta proveedores', ['suppliers']],
        ['tickets.manage', 'Soporte', ['dashboard']],
      ],
    },
    {
      label: 'Seguridad',
      systemOwnerOnly: true,
      permissions: [
        ['security.manage', 'Seguridad', ['multiuser_permissions']],
        ['audit.read', 'Auditoría', ['audit']],
        ['*', 'Control total', ['*']],
      ],
    },
  ];

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const getActiveOrganizationId = () => Number(window.AppSession?.getActiveOrganizationId?.()) || null;
  const getActiveModuleCodes = () => new Set(window.AppSession?.getActiveModuleCodes?.() || []);
  const getAvailableModuleCodes = () => new Set(window.AppSession?.getActiveOrganization?.()?.available_modules || window.AppSession?.getActiveModuleCodes?.() || []);
  const hasActiveModule = (moduleCode) => !moduleCode || getActiveModuleCodes().has(moduleCode);
  const isSystemOwner = () => Boolean(window.AppSession?.getSession?.()?.user?.is_system_owner);
  const canUseRole = (role) => isSystemOwner() || !systemOwnerRoleCodes.has(role?.code);
  const getVisibleRoles = () => rolesCache.filter(canUseRole);
  const getAssignableRoles = () => rolesCache.filter((role) => canUseRole(role) && role.is_active);

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

  const setEmailFeedback = (message, isError = false) => {
    emailFeedback.textContent = message;
    emailFeedback.style.color = isError ? '#b42318' : 'var(--color-muted)';
    if (window.appAlerts?.toast) {
      window.appAlerts.toast(message, isError ? 'error' : 'success');
    }
  };

  const getAllPermissionCodes = () => permissionGroups.flatMap((group) => group.permissions.map(([code]) => code));

  const syncPermissionInput = () => {
    const selected = Array.from(permissionsPicker.querySelectorAll('input[type="checkbox"]:checked'))
      .map((input) => input.value)
      .filter(Boolean);
    newRolePermissionsInput.value = selected.join(', ');
    return selected;
  };

  const renderPermissionPicker = (selectedPermissions = []) => {
    const selected = new Set(selectedPermissions);
    const knownPermissions = new Set(getAllPermissionCodes());
    const customPermissions = selectedPermissions.filter((permission) => !knownPermissions.has(permission));
    const availableModules = getAvailableModuleCodes();
    const canGrantPermission = (moduleCodes = []) => isSystemOwner() || moduleCodes.includes('*') || moduleCodes.some((moduleCode) => availableModules.has(moduleCode));
    const groups = permissionGroups.filter((group) => !group.systemOwnerOnly || isSystemOwner());

    permissionsPicker.innerHTML = groups
      .map((group) => `
        <fieldset class="permission-group">
          <legend>${escapeHtml(group.label)}</legend>
          ${group.permissions
            .filter(([code, _label, moduleCodes]) => (isSystemOwner() || code !== '*') && canGrantPermission(moduleCodes))
            .map(([code, label, moduleCodes]) => `
              <label class="permission-option">
                <input type="checkbox" value="${escapeHtml(code)}" ${selected.has(code) ? 'checked' : ''} />
                <span>${escapeHtml(label)}<small>${escapeHtml((moduleCodes || []).filter((moduleCode) => moduleCode !== '*').join(', '))}</small></span>
              </label>
            `)
            .join('')}
        </fieldset>
      `)
      .join('');

    if (customPermissions.length) {
      permissionsPicker.insertAdjacentHTML(
        'beforeend',
        `<fieldset class="permission-group">
          <legend>Permisos guardados</legend>
          ${customPermissions
            .map((permission) => `
              <label class="permission-option">
                <input type="checkbox" value="${escapeHtml(permission)}" checked />
                <span>${escapeHtml(permission)}</span>
              </label>
            `)
            .join('')}
        </fieldset>`,
      );
    }
    syncPermissionInput();
  };

  const parseApiError = (error) => {
    const raw = error?.message || 'No fue posible completar la operación.';
    try {
      const parsed = JSON.parse(raw);
      if (parsed.detail) return parsed.detail;
      if (typeof parsed === 'object') {
        return Object.entries(parsed)
          .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
          .filter(Boolean)
          .join(' ');
      }
    } catch (_err) {
      return raw;
    }
    return raw;
  };

  const getSettingsSectionFromHash = () => {
    const section = (window.location.hash || '#usuarios').slice(1);
    return settingsSections.includes(section) ? section : 'usuarios';
  };

  const getEnabledSettingsSections = () => settingsSections.filter((section) => hasActiveModule(addonPanelRequirements[section]));

  const applyAddonVisibility = () => {
    const enabledSections = new Set(getEnabledSettingsSections());
    settingsTabs.forEach((button) => {
      button.hidden = !enabledSections.has(button.dataset.settingsTab);
    });
    document.querySelectorAll('.sidebar-nav a[href^="/configuraciones.html#"]').forEach((link) => {
      const section = (link.getAttribute('href') || '').split('#')[1];
      link.hidden = Boolean(section) && !enabledSections.has(section);
    });
  };

  const syncSettingsSidebarSection = (section) => {
    const targetHref = `/configuraciones.html#${section}`;
    document.querySelectorAll('.sidebar-nav a[href^="/configuraciones.html#"]').forEach((link) => {
      link.classList.toggle('active', link.getAttribute('href') === targetHref);
    });
    const activeLink = document.querySelector(`.sidebar-nav a[href="${targetHref}"]`);
    const submenu = activeLink?.closest('.sidebar-submenu');
    if (submenu) {
      submenu.classList.add('is-open');
      submenu.querySelector('[data-submenu-toggle]')?.classList.add('active');
    }
  };

  const activateSettingsPanel = (section) => {
    const enabledSections = getEnabledSettingsSections();
    const targetPanel = enabledSections.includes(section) ? section : (enabledSections[0] || 'usuarios');
    settingsTabs.forEach((button) => {
      const isActive = button.dataset.settingsTab === targetPanel;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
    settingsPanels.forEach((panel) => {
      panel.classList.toggle('is-active', panel.dataset.settingsPanel === targetPanel);
    });
    syncSettingsSidebarSection(targetPanel);
  };

  const setupSubmenuTabs = () => {
    applyAddonVisibility();
    settingsTabs.forEach((tabButton) => {
      tabButton.addEventListener('click', () => {
        const targetPanel = tabButton.dataset.settingsTab;
        window.location.hash = targetPanel;
        activateSettingsPanel(targetPanel);
      });
    });
    window.addEventListener('hashchange', () => activateSettingsPanel(getSettingsSectionFromHash()));
    activateSettingsPanel(getSettingsSectionFromHash());
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

  const refreshSessionContext = async () => {
    try {
      const session = await orgRequest('/auth/session/');
      window.AppSession?.save?.(session);
      return session;
    } catch (_error) {
      return null;
    }
  };

  const getScopedOrganizations = (organizations) => {
    const activeOrganizationId = Number(window.AppSession?.getActiveOrganizationId?.());
    if (!activeOrganizationId) {
      return organizations;
    }

    const byParentId = new Map();
    organizations.forEach((organization) => {
      const parentId = Number(organization.parent_organization || 0);
      byParentId.set(parentId, [...(byParentId.get(parentId) || []), organization]);
    });

    const scopedIds = new Set([activeOrganizationId]);
    const pending = [activeOrganizationId];
    while (pending.length) {
      const parentId = pending.shift();
      (byParentId.get(parentId) || []).forEach((child) => {
        const childId = Number(child.id);
        if (scopedIds.has(childId)) return;
        scopedIds.add(childId);
        pending.push(childId);
      });
    }

    return organizations.filter((organization) => scopedIds.has(Number(organization.id)));
  };

  const getOrganizationDepth = (organization, byId, scopedIds) => {
    let depth = 0;
    let parentId = Number(organization.parent_organization || 0);
    const visited = new Set([Number(organization.id)]);
    while (parentId && scopedIds.has(parentId) && !visited.has(parentId)) {
      depth += 1;
      visited.add(parentId);
      parentId = Number(byId.get(parentId)?.parent_organization || 0);
    }
    return depth;
  };

  const renderOrganizationParentOptions = (organizations, selectedParentId = '', excludedOrganizationId = null) => {
    const scopedOrganizations = getScopedOrganizations(organizations);
    const byId = new Map(organizations.map((organization) => [Number(organization.id), organization]));
    const activeOrganizationId = Number(window.AppSession?.getActiveOrganizationId?.());
    const selectedId = Number(selectedParentId || 0);
    const excludedId = Number(excludedOrganizationId || 0);
    const optionOrganizations = scopedOrganizations.filter((organization) => Number(organization.id) !== excludedId);

    if (selectedId && !optionOrganizations.some((organization) => Number(organization.id) === selectedId)) {
      const selectedParent = byId.get(selectedId);
      if (selectedParent) {
        optionOrganizations.push(selectedParent);
      }
    }

    orgParentSelect.innerHTML = ['<option value="">Sin padre (organizacion raiz)</option>']
      .concat(
        optionOrganizations.map(
          (organization) => {
            const isParent = organizations.some((item) => Number(item.parent_organization) === Number(organization.id));
            const label = Number(organization.id) === activeOrganizationId ? 'Activa' : isParent ? 'Padre' : 'Hija';
            return `<option value="${organization.id}">${escapeHtml(organization.name)} - ${label} (#${organization.id})</option>`;
          },
        ),
      )
      .join('');
    orgParentSelect.value = selectedId ? String(selectedId) : '';
  };

  const renderOrganizations = (organizations) => {
    const scopedOrganizations = getScopedOrganizations(organizations);
    const byId = new Map(organizations.map((organization) => [Number(organization.id), organization]));
    const scopedIds = new Set(scopedOrganizations.map((organization) => Number(organization.id)));
    const activeOrganizationId = Number(window.AppSession?.getActiveOrganizationId?.());

    if (!scopedOrganizations.length) {
      organizationsList.innerHTML = '<li>Sin organizaciones registradas para este contexto.</li>';
      orgParentSelect.innerHTML = '<option value="">Sin padre (organizacion raiz)</option>';
      return;
    }

    renderOrganizationParentOptions(organizations);

    organizationsList.innerHTML = scopedOrganizations
      .map((organization) => {
        const depth = getOrganizationDepth(organization, byId, scopedIds);
        const parent = byId.get(Number(organization.parent_organization));
        const hasChildren = scopedOrganizations.some((item) => Number(item.parent_organization) === Number(organization.id));
        const relationshipLabel = Number(organization.id) === activeOrganizationId
          ? 'Organizacion activa'
          : organization.parent_organization
            ? 'Organizacion hija'
            : 'Organizacion padre';
        const parentLabel = parent
          ? `Padre: ${escapeHtml(parent.name)} (#${parent.id})`
          : hasChildren
            ? 'Padre visible en este contexto'
            : 'Sin padre';
        return `<li class="settings-org-row" style="--org-depth: ${depth}">
          <div class="settings-org-heading">
            <div>
              <strong>${escapeHtml(organization.name)}</strong>
              <span>ID #${organization.id} - ${parentLabel}</span>
            </div>
            <span class="settings-chip ${organization.parent_organization ? 'is-child' : 'is-parent'}">${relationshipLabel}</span>
          </div>
          <span class="settings-chip ${organization.is_active ? 'is-success' : 'is-muted'}">${organization.is_active ? 'Activa' : 'Inactiva'}</span>
          <small>Hacienda: sucursal ${organization.hacienda_branch_code || '001'} - terminal ${organization.hacienda_terminal_code || '00001'}</small>
          <div class="actions">
            <button class="btn btn-secondary" type="button" data-org-edit="${organization.id}">Editar</button>
            <button class="btn btn-secondary" type="button" data-org-toggle="${organization.id}" data-next-active="${organization.is_active ? 'false' : 'true'}">${organization.is_active ? 'Inactivar' : 'Reactivar'}</button>
            <button class="btn btn-secondary" type="button" data-org-delete="${organization.id}">Eliminar</button>
          </div>
        </li>`;
      })
      .join('');
  };

  const resetOrganizationForm = () => {
    editingOrganizationId = null;
    orgNameInput.value = '';
    orgParentSelect.value = '';
    orgBranchCodeInput.value = '001';
    orgTerminalCodeInput.value = '00001';
    renderOrganizationParentOptions(organizationsCache);
    createOrganizationButton.textContent = 'Crear organizacion';
    cancelOrganizationEditButton.hidden = true;
  };

  const startOrganizationEdit = (organizationId) => {
    const organization = organizationsCache.find((item) => Number(item.id) === Number(organizationId));
    if (!organization) return;
    editingOrganizationId = organization.id;
    orgNameInput.value = organization.name || '';
    renderOrganizationParentOptions(organizationsCache, organization.parent_organization || '', organization.id);
    orgBranchCodeInput.value = organization.hacienda_branch_code || '001';
    orgTerminalCodeInput.value = organization.hacienda_terminal_code || '00001';
    createOrganizationButton.textContent = 'Actualizar organizacion';
    cancelOrganizationEditButton.hidden = false;
    setOrgFeedback(`Editando ${organization.name}.`);
  };

  const setOrganizationActive = async (organizationId, isActive) => {
    const organization = organizationsCache.find((item) => Number(item.id) === Number(organizationId));
    const actionLabel = isActive ? 'reactivar' : 'inactivar';
    if (!window.confirm(`Deseas ${actionLabel} ${organization?.name || 'esta organizacion'}?`)) return;
    try {
      await orgRequest(`/organizations/${organizationId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: isActive }),
      });
      setOrgFeedback(`Organizacion ${isActive ? 'reactivada' : 'inactivada'} correctamente.`);
      await refreshSessionContext();
      await loadOrganizations();
      await loadData();
    } catch (error) {
      setOrgFeedback(parseApiError(error) || `No fue posible ${actionLabel} la organizacion.`, true);
    }
  };

  const deleteOrganization = async (organizationId) => {
    const organization = organizationsCache.find((item) => Number(item.id) === Number(organizationId));
    if (!window.confirm(`Eliminar una organizacion se maneja como inactivacion para proteger datos historicos. Continuar con ${organization?.name || 'esta organizacion'}?`)) return;
    try {
      await orgRequest(`/organizations/${organizationId}/`, { method: 'DELETE' });
      setOrgFeedback('Organizacion inactivada correctamente.');
      await refreshSessionContext();
      await loadOrganizations();
      await loadData();
    } catch (error) {
      setOrgFeedback(parseApiError(error) || 'No fue posible inactivar la organizacion.', true);
    }
  };

  const renderEmailOrganizations = (organizations) => {
    const scopedOrganizations = getScopedOrganizations(organizations);
    const options = scopedOrganizations.map((organization) => `<option value="${organization.id}">${organization.name}</option>`).join('');
    emailOrgSelect.innerHTML = options || '<option value="">Sin organizaciones</option>';
    const activeOrganizationId = Number(window.AppSession?.getActiveOrganizationId?.());
    if (activeOrganizationId) {
      emailOrgSelect.value = String(activeOrganizationId);
    }
  };

  const resetEmailInboxForm = () => {
    editingEmailInboxId = null;
    emailLabelInput.value = '';
    emailAddressInput.value = '';
    emailUsernameInput.value = '';
    emailPasswordInput.value = '';
    emailImapHostInput.value = 'imap.gmail.com';
    emailImapPortInput.value = '993';
    emailFolderInput.value = 'INBOX';
    emailImapSslInput.checked = true;
    emailIsPrimaryInput.checked = false;
    emailIsActiveInput.checked = true;
    saveEmailInboxButton.textContent = 'Guardar correo';
    cancelEmailEditButton.hidden = true;
  };

  const getEmailInboxPayload = () => {
    const organizationId = Number(emailOrgSelect.value || window.AppSession?.getActiveOrganizationId?.());
    const email = emailAddressInput.value.trim().toLowerCase();
    const username = emailUsernameInput.value.trim() || email;
    const password = emailPasswordInput.value;
    const imapHost = emailImapHostInput.value.trim();
    const imapPort = Number(emailImapPortInput.value || 0);
    const folder = emailFolderInput.value.trim() || 'INBOX';

    if (!organizationId) throw new Error('Selecciona una organización válida.');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Ingresa un correo válido.');
    if (!username) throw new Error('El usuario IMAP es requerido.');
    if (!editingEmailInboxId && !password) throw new Error('La contraseña IMAP es requerida.');
    if (!imapHost) throw new Error('El host IMAP es requerido.');
    if (!imapPort || imapPort <= 0) throw new Error('El puerto IMAP debe ser mayor a 0.');

    return {
      id: editingEmailInboxId || undefined,
      organization: organizationId,
      label: emailLabelInput.value.trim() || (emailIsPrimaryInput.checked ? 'Principal' : 'Secundario'),
      email,
      username,
      password,
      imap_host: imapHost,
      imap_port: imapPort,
      imap_ssl: emailImapSslInput.checked,
      folder,
      is_primary: emailIsPrimaryInput.checked,
      is_active: emailIsActiveInput.checked,
    };
  };

  const renderEmailInboxes = (inboxes) => {
    if (!inboxes.length) {
      emailInboxesList.innerHTML = '<li>Sin correos configurados.</li>';
      return;
    }
    emailInboxesList.innerHTML = inboxes
      .map((inbox) => `<li><strong>${inbox.label}</strong> · ${inbox.email} ${inbox.is_primary ? '· Principal' : '· Secundario'} · ${inbox.is_active ? 'Activo' : 'Inactivo'}<small>${inbox.imap_host}:${inbox.imap_port} · Carpeta ${inbox.folder}</small></li>`)
      .join('');
  };

  const loadEmailInboxes = async () => {
    if (!hasActiveModule('purchases')) {
      renderEmailInboxes([]);
      setEmailFeedback('Correo de facturas requiere el add-on de compras activo.', true);
      return;
    }
    const organizationId = Number(emailOrgSelect.value || window.AppSession?.getActiveOrganizationId?.());
    if (!organizationId) {
      renderEmailInboxes([]);
      setEmailFeedback('Selecciona una organización para cargar correos.', true);
      return;
    }
    try {
      const inboxes = await orgRequest(`/config/email-inboxes/?organization_id=${organizationId}`);
      renderEmailInboxesEnhanced(inboxes);
      setEmailFeedback(`Se cargaron ${inboxes.length} correo(s).`);
    } catch (error) {
      renderEmailInboxes([]);
      setEmailFeedback(error.message || 'No fue posible cargar correos.', true);
    }
  };

  const createEmailInbox = async () => {
    const organizationId = Number(emailOrgSelect.value || window.AppSession?.getActiveOrganizationId?.());
    if (!organizationId) return setEmailFeedback('Selecciona una organización válida.', true);
    const email = emailAddressInput.value.trim().toLowerCase();
    if (!email) return setEmailFeedback('El correo es requerido.', true);

    try {
      await orgRequest('/config/email-inboxes/', {
        method: 'POST',
        body: JSON.stringify({
          organization: organizationId,
          label: emailLabelInput.value.trim() || (emailIsPrimaryInput.checked ? 'Principal' : 'Secundario'),
          email,
          username: emailUsernameInput.value.trim() || email,
          password: emailPasswordInput.value,
          imap_host: emailImapHostInput.value.trim() || 'imap.gmail.com',
          imap_port: Number(emailImapPortInput.value || 993),
          imap_ssl: emailImapSslInput.checked,
          folder: emailFolderInput.value.trim() || 'INBOX',
          is_primary: emailIsPrimaryInput.checked,
          is_active: emailIsActiveInput.checked,
        }),
      });
      emailLabelInput.value = '';
      emailAddressInput.value = '';
      emailUsernameInput.value = '';
      emailPasswordInput.value = '';
      emailIsPrimaryInput.checked = false;
      emailIsActiveInput.checked = true;
      setEmailFeedback('Correo guardado correctamente.');
      await loadEmailInboxes();
    } catch (error) {
      setEmailFeedback(error.message || 'No fue posible guardar el correo.', true);
    }
  };

  const renderEmailInboxesEnhanced = (inboxes) => {
    if (!inboxes.length) {
      emailInboxesList.innerHTML = '<li>Sin correos configurados.</li>';
      return;
    }
    emailInboxesList.innerHTML = inboxes
      .map(
        (inbox) => `<li class="email-inbox-row">
          <div class="email-inbox-main">
            <div class="email-inbox-heading">
              <strong>${escapeHtml(inbox.label || inbox.email)}</strong>
              <span class="settings-chip ${inbox.is_primary ? 'is-success' : 'is-muted'}">${inbox.is_primary ? 'Principal' : 'Secundario'}</span>
              <span class="settings-chip ${inbox.is_active ? 'is-success' : 'is-muted'}">${inbox.is_active ? 'Activo' : 'Inactivo'}</span>
              <span class="settings-chip ${inbox.imap_ssl ? 'is-success' : 'is-muted'}">${inbox.imap_ssl ? 'SSL' : 'Sin SSL'}</span>
            </div>
            <span>${escapeHtml(inbox.email)}</span>
            <div class="email-inbox-meta">
              <small>${escapeHtml(inbox.imap_host)}:${escapeHtml(inbox.imap_port)}</small>
              <small>Carpeta ${escapeHtml(inbox.folder)}</small>
            </div>
          </div>
          <div class="email-inbox-actions">
            <button class="btn btn-secondary" type="button" data-email-edit="${inbox.id}">Editar</button>
            <button class="btn btn-secondary" type="button" data-email-delete="${inbox.id}">Eliminar</button>
          </div>
        </li>`,
      )
      .join('');
  };

  const runEmailInboxConnectionTest = async () => {
    try {
      const payload = getEmailInboxPayload();
      const result = await orgRequest('/config/email-inboxes/test-connection/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setEmailFeedback(result?.detail || 'Conexión IMAP exitosa.');
      return true;
    } catch (error) {
      setEmailFeedback(parseApiError(error) || 'La conexión IMAP falló.', true);
      return false;
    }
  };

  const saveEmailInbox = async () => {
    try {
      const payload = getEmailInboxPayload();
      const isOk = await runEmailInboxConnectionTest();
      if (!isOk) return;

      const currentEditId = editingEmailInboxId;
      await orgRequest(currentEditId ? `/config/email-inboxes/${currentEditId}/` : '/config/email-inboxes/', {
        method: currentEditId ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      resetEmailInboxForm();
      setEmailFeedback(currentEditId ? 'Correo actualizado correctamente.' : 'Correo guardado correctamente.');
      await loadEmailInboxes();
    } catch (error) {
      setEmailFeedback(parseApiError(error) || 'No fue posible guardar el correo.', true);
    }
  };

  const startEmailInboxEdit = async (inboxId) => {
    try {
      const organizationId = Number(emailOrgSelect.value || window.AppSession?.getActiveOrganizationId?.());
      const inboxes = await orgRequest(`/config/email-inboxes/?organization_id=${organizationId}`);
      const inbox = inboxes.find((item) => Number(item.id) === Number(inboxId));
      if (!inbox) {
        setEmailFeedback('No se encontró la conexión seleccionada.', true);
        return;
      }

      editingEmailInboxId = inbox.id;
      emailOrgSelect.value = String(inbox.organization);
      emailLabelInput.value = inbox.label || '';
      emailAddressInput.value = inbox.email || '';
      emailUsernameInput.value = inbox.username || inbox.email || '';
      emailPasswordInput.value = '';
      emailImapHostInput.value = inbox.imap_host || 'imap.gmail.com';
      emailImapPortInput.value = String(inbox.imap_port || 993);
      emailFolderInput.value = inbox.folder || 'INBOX';
      emailImapSslInput.checked = Boolean(inbox.imap_ssl);
      emailIsPrimaryInput.checked = Boolean(inbox.is_primary);
      emailIsActiveInput.checked = Boolean(inbox.is_active);
      saveEmailInboxButton.textContent = 'Actualizar correo';
      cancelEmailEditButton.hidden = false;
      setEmailFeedback(`Editando ${inbox.email}. Si no cambias la contraseña, se mantiene la actual.`);
    } catch (error) {
      setEmailFeedback(parseApiError(error) || 'No fue posible preparar la edición del correo.', true);
    }
  };

  const removeEmailInbox = async (inboxId) => {
    if (!window.confirm('¿Deseas eliminar esta conexión de correo?')) return;

    try {
      await orgRequest(`/config/email-inboxes/${inboxId}/`, { method: 'DELETE' });
      if (Number(editingEmailInboxId) === Number(inboxId)) {
        resetEmailInboxForm();
      }
      setEmailFeedback('Conexión eliminada correctamente.');
      await loadEmailInboxes();
    } catch (error) {
      setEmailFeedback(parseApiError(error) || 'No fue posible eliminar el correo.', true);
    }
  };

  const loadOrganizations = async () => {
    try {
      const organizations = await orgRequest('/organizations/');
      organizationsCache = organizations;
      renderOrganizations(organizations);
      renderEmailOrganizations(organizations);
      const scopedOrganizations = getScopedOrganizations(organizations);
      const activeOrganizationId = Number(window.AppSession?.getActiveOrganizationId?.());
      setOrgFeedback(
        activeOrganizationId
          ? `Se cargaron ${scopedOrganizations.length} organizaciones del contexto activo.`
          : `Se cargaron ${organizations.length} organizaciones.`,
      );
    } catch (error) {
      renderOrganizations([]);
      setOrgFeedback(error.message || 'No fue posible cargar organizaciones.', true);
    }
  };

  const createOrganization = async () => {
    const name = orgNameInput.value.trim();
    const branchCode = orgBranchCodeInput.value.trim();
    const terminalCode = orgTerminalCodeInput.value.trim();
    if (!name) {
      setOrgFeedback('Debe indicar un nombre para guardar la organizacion.', true);
      return;
    }
    if (!/^\d{3}$/.test(branchCode)) {
      setOrgFeedback('La sucursal de Hacienda debe tener exactamente 3 digitos.', true);
      return;
    }
    if (!/^\d{5}$/.test(terminalCode)) {
      setOrgFeedback('La terminal/caja de Hacienda debe tener exactamente 5 digitos.', true);
      return;
    }

    try {
      const parentOrganization = orgParentSelect.value ? Number(orgParentSelect.value) : null;
      const currentEditId = editingOrganizationId;
      if (currentEditId && Number(parentOrganization) === Number(currentEditId)) {
        setOrgFeedback('La organizacion no puede ser su propio padre.', true);
        return;
      }
      const saved = await orgRequest(currentEditId ? `/organizations/${currentEditId}/` : '/organizations/', {
        method: currentEditId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name,
          parent_organization: parentOrganization,
          hacienda_branch_code: branchCode,
          hacienda_terminal_code: terminalCode,
        }),
      });
      resetOrganizationForm();
      setOrgFeedback(`Organizacion ${currentEditId ? 'actualizada' : 'creada'}: ${saved.name} (#${saved.id}).`);
      await loadOrganizations();
      if (hasActiveModule('purchases')) {
        await loadEmailInboxes();
      }
    } catch (error) {
      setOrgFeedback(parseApiError(error) || 'No fue posible guardar la organizacion.', true);
    }
  };
  const renderUserActions = (user) => `
    <div class="row-actions-cell settings-user-actions">
      <button class="btn btn-secondary row-action-primary" type="button" data-user-edit="${user.id}">Editar</button>
      <div class="row-actions-menu">
        <button class="btn btn-secondary row-actions-trigger" type="button" data-user-actions-toggle="${user.id}" aria-haspopup="true" aria-expanded="false">Mas</button>
        <div class="row-actions-dropdown" data-user-actions-menu="${user.id}" role="menu">
          <button type="button" data-user-toggle="${user.id}" data-next-active="${user.is_active ? 'false' : 'true'}" role="menuitem">${user.is_active ? 'Inactivar usuario' : 'Reactivar usuario'}</button>
          <div class="row-actions-divider"></div>
          <button type="button" class="is-danger" data-user-delete="${user.id}" role="menuitem">Eliminar usuario</button>
        </div>
      </div>
    </div>
  `;

  const positionSettingsActionMenu = (toggle, menu) => {
    const rect = toggle.getBoundingClientRect();
    const menuWidth = 178;
    const margin = 10;
    const left = Math.min(window.innerWidth - menuWidth - margin, Math.max(margin, rect.right - menuWidth));
    const top = Math.min(window.innerHeight - margin, rect.bottom + 6);
    menu.style.setProperty('--menu-left', `${left}px`);
    menu.style.setProperty('--menu-top', `${top}px`);
  };

  const closeSettingsActionMenus = () => {
    document.querySelectorAll('.row-actions-dropdown.is-open').forEach((node) => node.classList.remove('is-open'));
    document.querySelectorAll('[data-user-actions-toggle][aria-expanded="true"]').forEach((node) => node.setAttribute('aria-expanded', 'false'));
  };

  const renderUsers = (users) => {
    if (!users.length) {
      usersList.innerHTML = '<li>Sin usuarios registrados para este negocio.</li>';
      usersPagination.innerHTML = '';
      return;
    }

    const sortedUsers = [...users].sort((left, right) => {
      const leftLabel = left.email || left.username || '';
      const rightLabel = right.email || right.username || '';
      return leftLabel.localeCompare(rightLabel, 'es');
    });
    const totalPages = Math.max(1, Math.ceil(sortedUsers.length / usersPageSize));
    usersPage = Math.min(Math.max(1, usersPage), totalPages);
    const startIndex = (usersPage - 1) * usersPageSize;
    const pageUsers = sortedUsers.slice(startIndex, startIndex + usersPageSize);
    usersList.innerHTML = pageUsers
      .map((user) => {
        const visibleAssignments = Array.isArray(user.role_assignments)
          ? user.role_assignments.filter((assignment) => isSystemOwner() || !systemOwnerRoleCodes.has(assignment.role_code))
          : [];
        const assignedRoles = visibleAssignments.length
          ? visibleAssignments
            .map(
              (assignment) => `<span class="settings-chip settings-chip-removable">
                ${escapeHtml(assignment.role_name)}
                <button type="button" aria-label="Quitar ${escapeHtml(assignment.role_name)}" data-user-role-remove="${assignment.id}">x</button>
              </span>`,
            )
            .join('')
          : 'Sin rol especifico';
        return `<li class="settings-user-row" data-user-id="${user.id}">
          <div class="settings-user-main">
            <div class="settings-user-heading">
              <div>
                <strong>${escapeHtml(user.email || user.username)}</strong>
                <small>${user.requires_password_setup ? 'Pendiente de contrasena' : 'Acceso configurado'}</small>
              </div>
              <span class="settings-chip ${user.is_active ? 'is-success' : 'is-muted'}">${user.is_active ? 'Activo' : 'Inactivo'}</span>
            </div>
            <div class="settings-user-roles">${assignedRoles}</div>
          </div>
          ${renderUserActions(user)}
        </li>`;
      })
      .join('');

    usersPagination.innerHTML = `
      <button class="btn btn-secondary" type="button" data-users-page="${usersPage - 1}" ${usersPage <= 1 ? 'disabled' : ''}>Anterior</button>
      <span>Mostrando ${startIndex + 1}-${Math.min(startIndex + usersPageSize, sortedUsers.length)} de ${sortedUsers.length}</span>
      <button class="btn btn-secondary" type="button" data-users-page="${usersPage + 1}" ${usersPage >= totalPages ? 'disabled' : ''}>Siguiente</button>
    `;
  };

  const resetUserForm = () => {
    editingUserId = null;
    newUserEmailInput.value = '';
    newUserFirstNameInput.value = '';
    newUserLastNameInput.value = '';
    createCollaboratorUserButton.textContent = 'Crear usuario colaborador';
    cancelUserEditButton.hidden = true;
  };

  const startUserEdit = (userId) => {
    const user = usersCache.find((item) => Number(item.id) === Number(userId));
    if (!user) return;
    editingUserId = user.id;
    newUserEmailInput.value = user.email || user.username || '';
    newUserFirstNameInput.value = user.first_name || '';
    newUserLastNameInput.value = user.last_name || '';
    createCollaboratorUserButton.textContent = 'Actualizar usuario';
    cancelUserEditButton.hidden = false;
    setUserFeedback(`Editando ${user.email || user.username}.`);
  };

  const createCollaboratorUser = async () => {
    const organizationId = Number(window.AppSession?.getActiveOrganizationId?.());
    const email = newUserEmailInput.value.trim().toLowerCase();
    const firstName = newUserFirstNameInput.value.trim();
    const lastName = newUserLastNameInput.value.trim();

    if (!organizationId && !editingUserId) {
      setUserFeedback('Debes seleccionar un negocio activo para crear usuarios.', true);
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setUserFeedback('Ingresa un correo valido para el colaborador.', true);
      return;
    }

    try {
      const currentEditId = editingUserId;
      await orgRequest(currentEditId ? `/config/users/${currentEditId}/` : '/config/users/', {
        method: currentEditId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          email,
          username: email,
          first_name: firstName,
          last_name: lastName,
          organization_id: organizationId,
          membership_role: 'viewer',
        }),
      });

      setUserFeedback(`Usuario ${email} ${currentEditId ? 'actualizado' : 'creado'} correctamente.`);
      resetUserForm();
      await loadData();
      await loadCollaborators();
    } catch (error) {
      setUserFeedback(parseApiError(error) || 'Error al guardar usuario colaborador.', true);
    }
  };

  const setUserActive = async (userId, isActive) => {
    const user = usersCache.find((item) => Number(item.id) === Number(userId));
    const actionLabel = isActive ? 'reactivar' : 'inactivar';
    if (!window.confirm(`Deseas ${actionLabel} ${user?.email || user?.username || 'este usuario'}?`)) return;
    try {
      await orgRequest(`/config/users/${userId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: isActive }),
      });
      setUserFeedback(`Usuario ${isActive ? 'reactivado' : 'inactivado'} correctamente.`);
      await loadData();
      await loadCollaborators();
    } catch (error) {
      setUserFeedback(parseApiError(error) || `No fue posible ${actionLabel} el usuario.`, true);
    }
  };

  const deleteUser = async (userId) => {
    const user = usersCache.find((item) => Number(item.id) === Number(userId));
    if (!window.confirm(`Deseas eliminar ${user?.email || user?.username || 'este usuario'}? Esta accion quita sus accesos y asociaciones.`)) return;
    try {
      await orgRequest(`/config/users/${userId}/`, { method: 'DELETE' });
      if (Number(editingUserId) === Number(userId)) resetUserForm();
      setUserFeedback('Usuario eliminado correctamente.');
      await loadData();
      await loadCollaborators();
    } catch (error) {
      setUserFeedback(parseApiError(error) || 'No fue posible eliminar el usuario.', true);
    }
  };
  const renderRoles = (roles) => {
    const visibleRoles = roles
      .filter(canUseRole)
      .sort((left, right) => {
        const personaDiff = (personaLabels[left.persona] || left.persona).localeCompare(personaLabels[right.persona] || right.persona, 'es');
        if (personaDiff) return personaDiff;
        return (left.name || '').localeCompare(right.name || '', 'es');
      });
    if (!visibleRoles.length) {
      rolesGroups.innerHTML = '<p>No hay roles configurados.</p>';
      rolesPagination.innerHTML = '';
      return;
    }

    const totalPages = Math.max(1, Math.ceil(visibleRoles.length / rolesPageSize));
    rolesPage = Math.min(Math.max(1, rolesPage), totalPages);
    const startIndex = (rolesPage - 1) * rolesPageSize;
    const pageRoles = visibleRoles.slice(startIndex, startIndex + rolesPageSize);

    rolesGroups.innerHTML = `<ul class="settings-list compact-role-list">
      ${pageRoles
        .map(
          (role) => `<li>
            <div class="role-card-header">
              <div>
                <strong>${escapeHtml(role.name)}</strong>
                <span>${escapeHtml(personaLabels[role.persona] || role.persona)}</span>
              </div>
              <span class="settings-chip">${role.is_system_default ? 'Base' : 'Personalizado'} - ${role.is_active ? 'Activo' : 'Inactivo'}</span>
            </div>
            <span>${escapeHtml(role.description)}</span>
            <details class="role-details">
              <summary>Ver detalles</summary>
              <small>Escenarios: ${escapeHtml(role.typical_scenarios || 'Sin escenarios definidos')}</small>
              <small>Permisos: ${escapeHtml((role.default_permissions || []).join(', ') || 'Sin permisos definidos')}</small>
            </details>
            <div class="actions">
              <button class="btn btn-secondary" type="button" data-role-edit="${role.id}">Editar</button>
              <button class="btn btn-secondary" type="button" data-role-toggle="${role.id}" data-next-active="${role.is_active ? 'false' : 'true'}">${role.is_active ? 'Inactivar' : 'Reactivar'}</button>
              ${role.is_system_default ? '' : `<button class="btn btn-secondary" type="button" data-role-delete="${role.id}">Eliminar</button>`}
            </div>
          </li>`,
        )
        .join('')}
    </ul>`;

    rolesPagination.innerHTML = `
      <button class="btn btn-secondary" type="button" data-roles-page="${rolesPage - 1}" ${rolesPage <= 1 ? 'disabled' : ''}>Anterior</button>
      <span>Mostrando ${startIndex + 1}-${Math.min(startIndex + rolesPageSize, visibleRoles.length)} de ${visibleRoles.length}</span>
      <button class="btn btn-secondary" type="button" data-roles-page="${rolesPage + 1}" ${rolesPage >= totalPages ? 'disabled' : ''}>Siguiente</button>
    `;
  };

  const renderRoleOptions = (roles) => {
    const visibleRoles = roles.filter((role) => canUseRole(role) && role.is_active);
    if (!visibleRoles.length) {
      assignRoleRoleSelect.innerHTML = '<option value="">Sin roles disponibles</option>';
      return;
    }

    assignRoleRoleSelect.innerHTML = visibleRoles
      .map((role) => `<option value="${role.id}">${escapeHtml(role.name)}</option>`)
      .join('');
  };

  const renderUsersOptions = (users) => {
    if (!users.length) {
      assignRoleUserSelect.innerHTML = '<option value="">Sin usuarios activos</option>';
      return;
    }
    assignRoleUserSelect.innerHTML = users
      .map((user) => `<option value="${user.id}">${escapeHtml(user.email || user.username)}</option>`)
      .join('');
  };

  const renderRoleAssignments = () => {
    const assignments = usersCache.flatMap((user) =>
      (user.role_assignments || [])
        .filter((assignment) => isSystemOwner() || !systemOwnerRoleCodes.has(assignment.role_code))
        .map((assignment) => ({ ...assignment, user })),
    );
    if (!assignments.length) {
      roleAssignmentsList.innerHTML = '<li>Sin asociaciones de roles registradas.</li>';
      return;
    }

    roleAssignmentsList.innerHTML = assignments
      .map((assignment) => `<li>
        <strong>${escapeHtml(assignment.role_name || 'Rol')}</strong>
        <span>${escapeHtml(assignment.user?.email || assignment.user?.username || 'Usuario')}</span>
        <small>Asociacion activa</small>
        <div class="actions">
          <button class="btn btn-secondary" type="button" data-assignment-delete="${assignment.id}">Quitar rol</button>
        </div>
      </li>`)
      .join('');
  };

  const resetRoleForm = () => {
    editingRoleId = null;
    newRoleNameInput.value = '';
    newRoleCodeInput.value = '';
    newRoleCodeInput.disabled = false;
    newRolePermissionsInput.value = '';
    renderPermissionPicker([]);
    newRoleDescriptionInput.value = '';
    newRoleScenariosInput.value = '';
    createRoleButton.textContent = 'Guardar rol';
    cancelRoleEditButton.hidden = true;
  };

  const startRoleEdit = (roleId) => {
    const role = rolesCache.find((item) => Number(item.id) === Number(roleId));
    if (!role) return;
    if (!canUseRole(role)) {
      setTeamFeedback('Este rol es exclusivo del dueño del sistema.', true);
      return;
    }
    editingRoleId = role.id;
    newRoleNameInput.value = role.name || '';
    newRoleCodeInput.value = role.code || '';
    newRoleCodeInput.disabled = Boolean(role.is_system_default);
    newRolePersonaSelect.value = role.persona || 'business_manager';
    renderPermissionPicker(role.default_permissions || []);
    newRoleDescriptionInput.value = role.description || '';
    newRoleScenariosInput.value = role.typical_scenarios || '';
    createRoleButton.textContent = 'Actualizar rol';
    cancelRoleEditButton.hidden = false;
    window.location.hash = 'roles';
    activateSettingsPanel('roles');
  };

  const deleteRole = async (roleId) => {
    if (!window.confirm('Deseas eliminar este rol personalizado?')) return;
    try {
      const response = await fetch(`/api/config/roles/${roleId}/`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok && response.status !== 204) {
        const message = await response.text();
        throw new Error(message || 'No fue posible eliminar el rol.');
      }
      setTeamFeedback('Rol eliminado correctamente.');
      resetRoleForm();
      await loadData();
    } catch (error) {
      setTeamFeedback(error.message || 'Error al eliminar rol.', true);
    }
  };

  const setRoleActive = async (roleId, isActive) => {
    const role = rolesCache.find((item) => Number(item.id) === Number(roleId));
    const actionLabel = isActive ? 'reactivar' : 'inactivar';
    if (!window.confirm(`Deseas ${actionLabel} ${role?.name || 'este rol'}?`)) return;
    try {
      await orgRequest(`/config/roles/${roleId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: isActive }),
      });
      setTeamFeedback(`Rol ${isActive ? 'reactivado' : 'inactivado'} correctamente.`);
      await loadData();
    } catch (error) {
      setTeamFeedback(parseApiError(error) || `No fue posible ${actionLabel} el rol.`, true);
    }
  };

  const saveRole = async () => {
    const name = newRoleNameInput.value.trim();
    const code = newRoleCodeInput.value.trim().toLowerCase().replace(/\s+/g, '_');
    const persona = newRolePersonaSelect.value;
    const description = newRoleDescriptionInput.value.trim();
    const typicalScenarios = newRoleScenariosInput.value.trim();
    const defaultPermissions = syncPermissionInput();

    if (!name || !code || !description || !typicalScenarios) {
      setTeamFeedback('Completa nombre, código, descripción y escenarios para crear el rol.', true);
      return;
    }
    if (!isSystemOwner() && (systemOwnerRoleCodes.has(code) || defaultPermissions.includes('*'))) {
      setTeamFeedback('El rol Super Administrador TI es exclusivo del dueño del sistema.', true);
      return;
    }

    try {
      const payload = {
        name,
        code,
        persona,
        description,
        typical_scenarios: typicalScenarios,
        default_permissions: defaultPermissions,
      };
      if (!editingRoleId) {
        payload.is_system_default = false;
      }
      const response = await fetch(editingRoleId ? `/api/config/roles/${editingRoleId}/` : '/api/config/roles/', {
        method: editingRoleId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'No fue posible guardar el rol.');
      }
      setTeamFeedback(`Rol ${name} guardado correctamente.`);
      resetRoleForm();
      await loadData();
    } catch (error) {
      setTeamFeedback(error.message || 'Error al guardar rol.', true);
    }
  };

  const assignRole = async (userIdOverride = null, roleIdOverride = null) => {
    const userId = Number(userIdOverride || assignRoleUserSelect.value);
    const roleId = Number(roleIdOverride || assignRoleRoleSelect.value);
    const organizationId = getActiveOrganizationId();
    const roleToAssign = rolesCache.find((role) => Number(role.id) === roleId);

    if (!userId || !roleId) {
      setTeamFeedback('Selecciona usuario y rol para asociarlos.', true);
      return;
    }
    if (!canUseRole(roleToAssign)) {
      setTeamFeedback('El rol Super Administrador TI es exclusivo del dueño del sistema.', true);
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
      setTeamFeedback(`Rol ${roleToAssign?.name || roleId} asociado a ${selectedUser?.email || selectedUser?.username}.`);
      await refreshSessionContext();
      await loadData();
    } catch (error) {
      setTeamFeedback(error.message || 'Error al asociar rol.', true);
    }
  };

  const removeRoleAssignment = async (assignmentId) => {
    if (!window.confirm('Deseas quitar esta asociacion de rol?')) return;
    try {
      await orgRequest(`/config/user-role-assignments/${assignmentId}/`, { method: 'DELETE' });
      setTeamFeedback('Rol quitado del usuario correctamente.');
      await refreshSessionContext();
      await loadData();
    } catch (error) {
      setTeamFeedback(parseApiError(error) || 'No fue posible quitar el rol.', true);
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
    const rules = availabilityRulesCache.filter((rule) => Number(rule.organization) === activeOrganizationId);

    const collaboratorFilter = Number(availabilityViewCollaborator.value);
    const filteredRules = collaboratorFilter
      ? rules.filter((rule) => Number(rule.collaborator) === collaboratorFilter)
      : rules;

    if (!filteredRules.length) {
      availabilityRulesList.innerHTML = '<li>No hay horarios definidos para este negocio.</li>';
      return;
    }

    const groupedRules = filteredRules.reduce((acc, rule) => {
      const key = String(rule.collaborator);
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
              <span>${String(rule.start_time || '').slice(0, 5)} - ${String(rule.end_time || '').slice(0, 5)}</span>
              <small>${rule.is_active ? 'Disponible' : 'Bloqueado'}</small>
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

  const loadAvailabilityRules = async () => {
    const organizationId = Number(window.AppSession?.getActiveOrganizationId?.());
    if (!organizationId) {
      availabilityRulesCache = [];
      renderAvailabilityRules();
      return;
    }
    try {
      availabilityRulesCache = await orgRequest(`/agenda-availability/?organization_id=${organizationId}`);
      renderAvailabilityRules();
    } catch (error) {
      availabilityRulesCache = [];
      renderAvailabilityRules();
      setAvailabilityFeedback(parseApiError(error) || 'No fue posible cargar la disponibilidad.', true);
    }
  };

  const saveAvailabilityRule = async () => {
    const organizationId = Number(window.AppSession?.getActiveOrganizationId?.());
    const collaboratorId = Number(availabilityCollaborator.value);
    const selectedWeekdays = availabilityDayInputs
      .filter((input) => input.checked)
      .map((input) => Number(input.value));
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
    if (!selectedWeekdays.length) {
      setAvailabilityFeedback('Selecciona al menos un dia para aplicar el horario.', true);
      return;
    }
    if (!start || !end || start >= end) {
      setAvailabilityFeedback('Define una franja horaria válida (hora inicio menor a hora fin).', true);
      return;
    }

    try {
      await Promise.all(selectedWeekdays.map((weekday) => {
        const existing = availabilityRulesCache.find(
          (rule) =>
            Number(rule.organization) === organizationId &&
            Number(rule.collaborator) === collaboratorId &&
            Number(rule.weekday) === weekday,
        );

        return orgRequest(existing ? `/agenda-availability/${existing.id}/` : '/agenda-availability/', {
          method: existing ? 'PATCH' : 'POST',
          body: JSON.stringify({
            organization: organizationId,
            collaborator: collaboratorId,
            weekday,
            start_time: start,
            end_time: end,
            is_active: active,
          }),
        });
      }));
      const dayLabel = selectedWeekdays
        .slice()
        .sort((left, right) => left - right)
        .map((weekday) => weekdayLabels[weekday])
        .join(', ');
      setAvailabilityFeedback(`Horario aplicado a ${getCollaboratorLabel(collaboratorId)}: ${dayLabel} ${start}-${end}.`);
      await loadAvailabilityRules();
    } catch (error) {
      setAvailabilityFeedback(parseApiError(error) || 'No fue posible guardar la disponibilidad.', true);
    }
  };

  const applyAvailabilityPreset = (preset) => {
    const presetDays = {
      weekdays: new Set([1, 2, 3, 4, 5]),
      weekend: new Set([0, 6]),
      all: new Set([0, 1, 2, 3, 4, 5, 6]),
      clear: new Set(),
    }[preset] || new Set();

    availabilityDayInputs.forEach((input) => {
      input.checked = presetDays.has(Number(input.value));
    });
  };

  const loadCollaborators = async () => {
    if (!hasActiveModule('agenda')) {
      collaboratorsCache = [];
      renderCollaboratorsOptions([]);
      availabilityRulesCache = [];
      renderAvailabilityRules();
      setAvailabilityFeedback('Disponibilidad requiere el add-on de agenda activo.', true);
      return;
    }
    const organizationId = getActiveOrganizationId();
    if (!organizationId) {
      collaboratorsCache = [];
      renderCollaboratorsOptions([]);
      availabilityRulesCache = [];
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
      await loadAvailabilityRules();
      setAvailabilityFeedback(`Se cargaron ${collaboratorsCache.length} colaboradores para esta agenda.`);
    } catch (error) {
      collaboratorsCache = fallbackCollaboratorsFromUsers();
      renderCollaboratorsOptions(collaboratorsCache);
      await loadAvailabilityRules();
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

    const activeModules = getActiveModuleCodes();
    const visibleSettings = settings.filter((setting) => {
      const requiredModules = addonSettingRequirements[setting.category];
      return !requiredModules || requiredModules.some((moduleCode) => activeModules.has(moduleCode));
    });

    if (!visibleSettings.length) {
      systemSettingsGroups.innerHTML = '<p class="section-help">Sin parametros disponibles para los add-ons activos.</p>';
      return;
    }

    const groupedSettings = visibleSettings.reduce((acc, setting) => {
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
      const organizationId = getActiveOrganizationId();
      const usersQuery = organizationId ? `?organization_id=${organizationId}` : '';
      const [usersRes, rolesRes, settingsRes] = await Promise.all([
        fetch(`/api/config/users/${usersQuery}`),
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
      if (hasActiveModule('agenda') && !collaboratorsCache.length) {
        loadCollaborators();
      }
    } catch (error) {
      showError(error.message || 'Error inesperado al cargar configuraciones.');
    }
  };

  createOrganizationButton.addEventListener('click', createOrganization);
  cancelOrganizationEditButton.addEventListener('click', resetOrganizationForm);
  createRoleButton.addEventListener('click', saveRole);
  cancelRoleEditButton.addEventListener('click', resetRoleForm);
  assignRoleButton.addEventListener('click', assignRole);
  roleAssignmentsList.addEventListener('click', (event) => {
    const deleteId = event.target?.dataset?.assignmentDelete;
    if (deleteId) removeRoleAssignment(deleteId).catch(() => null);
  });
  createCollaboratorUserButton.addEventListener('click', createCollaboratorUser);
  cancelUserEditButton.addEventListener('click', resetUserForm);
  organizationsList.addEventListener('click', (event) => {
    const editId = event.target?.dataset?.orgEdit;
    const toggleId = event.target?.dataset?.orgToggle;
    const deleteId = event.target?.dataset?.orgDelete;
    if (editId) startOrganizationEdit(editId);
    if (toggleId) setOrganizationActive(toggleId, event.target.dataset.nextActive === 'true').catch(() => null);
    if (deleteId) deleteOrganization(deleteId).catch(() => null);
  });
  usersList.addEventListener('click', (event) => {
    const actionToggle = event.target.closest?.('[data-user-actions-toggle]');
    if (actionToggle) {
      const menu = document.querySelector(`[data-user-actions-menu="${actionToggle.dataset.userActionsToggle}"]`);
      const isOpen = menu?.classList.contains('is-open');
      closeSettingsActionMenus();
      if (menu && !isOpen) {
        positionSettingsActionMenu(actionToggle, menu);
        menu.classList.add('is-open');
        actionToggle.setAttribute('aria-expanded', 'true');
      }
      return;
    }

    const editId = event.target?.dataset?.userEdit;
    const toggleId = event.target?.dataset?.userToggle;
    const deleteId = event.target?.dataset?.userDelete;
    const removeRoleId = event.target?.dataset?.userRoleRemove;
    if (editId || toggleId || deleteId) closeSettingsActionMenus();
    if (removeRoleId) removeRoleAssignment(removeRoleId).catch(() => null);
    if (editId) startUserEdit(editId);
    if (toggleId) setUserActive(toggleId, event.target.dataset.nextActive === 'true').catch(() => null);
    if (deleteId) deleteUser(deleteId).catch(() => null);
  });
  usersPagination.addEventListener('click', (event) => {
    const nextPage = Number(event.target?.dataset?.usersPage);
    if (!nextPage) return;
    usersPage = nextPage;
    renderUsers(usersCache);
  });
  rolesPagination.addEventListener('click', (event) => {
    const nextPage = Number(event.target?.dataset?.rolesPage);
    if (!nextPage) return;
    rolesPage = nextPage;
    renderRoles(rolesCache);
  });
  permissionsPicker.addEventListener('change', syncPermissionInput);
  rolesGroups.addEventListener('click', (event) => {
    const editId = event.target?.dataset?.roleEdit;
    const deleteId = event.target?.dataset?.roleDelete;
    const toggleId = event.target?.dataset?.roleToggle;
    if (editId) {
      startRoleEdit(editId);
    }
    if (toggleId) {
      setRoleActive(toggleId, event.target.dataset.nextActive === 'true').catch(() => null);
    }
    if (deleteId) {
      deleteRole(deleteId).catch(() => null);
    }
  });
  saveAvailabilityRuleButton.addEventListener('click', () => {
    saveAvailabilityRule().catch(() => null);
  });
  availabilityPresetButtons.forEach((button) => {
    button.addEventListener('click', () => applyAvailabilityPreset(button.dataset.availabilityPreset));
  });
  testEmailInboxButton.addEventListener('click', () => {
    runEmailInboxConnectionTest().catch(() => null);
  });
  saveEmailInboxButton.addEventListener('click', saveEmailInbox);
  cancelEmailEditButton.addEventListener('click', resetEmailInboxForm);
  emailOrgSelect.addEventListener('change', () => {
    resetEmailInboxForm();
    loadEmailInboxes().catch(() => null);
  });
  emailInboxesList.addEventListener('click', (event) => {
    const editId = event.target?.dataset?.emailEdit;
    const deleteId = event.target?.dataset?.emailDelete;
    if (editId) {
      startEmailInboxEdit(editId).catch(() => null);
    }
    if (deleteId) {
      removeEmailInbox(deleteId).catch(() => null);
    }
  });
  availabilityViewCollaborator.addEventListener('change', renderAvailabilityRules);
  document.addEventListener('click', (event) => {
    if (!event.target.closest?.('.row-actions-menu')) closeSettingsActionMenus();
  });
  document.addEventListener('change', (event) => {
    if (event.target?.id === 'organization-switcher') {
      loadCollaborators();
    }
  });
  setupSubmenuTabs();
  resetUserForm();
  resetOrganizationForm();
  resetRoleForm();
  resetEmailInboxForm();
  loadData();
  loadOrganizations();
  if (hasActiveModule('purchases')) {
    loadEmailInboxes();
  }
  if (hasActiveModule('agenda')) {
    loadCollaborators();
    setTimeout(loadCollaborators, 1200);
  }
})();
