(function initConfiguracionesModule() {
  const usersList = document.getElementById('users-list');
  const newUserEmailInput = document.getElementById('new-user-email');
  const newUserFirstNameInput = document.getElementById('new-user-first-name');
  const newUserLastNameInput = document.getElementById('new-user-last-name');
  const createCollaboratorUserButton = document.getElementById('create-collaborator-user');
  const userFeedback = document.getElementById('user-feedback');
  const usersPagination = document.getElementById('users-pagination');
  const rolesGroups = document.getElementById('roles-groups');
  const systemSettingsGroups = document.getElementById('system-settings-groups');
  const organizationsList = document.getElementById('organizations-list');
  const orgNameInput = document.getElementById('org-name');
  const orgParentSelect = document.getElementById('org-parent');
  const orgBranchCodeInput = document.getElementById('org-branch-code');
  const orgTerminalCodeInput = document.getElementById('org-terminal-code');
  const createOrganizationButton = document.getElementById('create-organization');
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
  const API_BASE = '/api';
  const USER_ROLE_FALLBACK = 'colaborador';
  let rolesCache = [];
  let usersCache = [];
  let usersPage = 1;
  const usersPageSize = 5;
  let collaboratorsCache = [];
  let availabilityRulesCache = [];
  let editingEmailInboxId = null;
  let editingRoleId = null;

  if (
    !usersList ||
    !newUserEmailInput ||
    !newUserFirstNameInput ||
    !newUserLastNameInput ||
    !createCollaboratorUserButton ||
    !userFeedback ||
    !usersPagination ||
    !rolesGroups ||
    !systemSettingsGroups ||
    !organizationsList ||
    !orgNameInput ||
    !orgParentSelect ||
    !orgBranchCodeInput ||
    !orgTerminalCodeInput ||
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
    disponibilidad: 'agenda',
    correo: 'purchases',
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
        ['users.read', 'Ver usuarios'],
        ['users.update', 'Editar usuarios'],
        ['users.lock', 'Bloquear usuarios'],
      ],
    },
    {
      label: 'Ventas y clientes',
      permissions: [
        ['customers.read', 'Ver clientes'],
        ['dashboards.executive', 'Dashboard ejecutivo'],
        ['approvals.high', 'Aprobaciones especiales'],
      ],
    },
    {
      label: 'Finanzas',
      permissions: [
        ['invoices.manage', 'Facturación'],
        ['credit.manage', 'Crédito'],
        ['reports.finance', 'Reportes financieros'],
      ],
    },
    {
      label: 'Operación',
      permissions: [
        ['inventory.manage', 'Inventario'],
        ['suppliers.manage', 'Proveedores'],
        ['operations.kpi', 'KPIs operativos'],
      ],
    },
    {
      label: 'Reportes',
      permissions: [
        ['reports.read', 'Reportes generales'],
        ['suppliers.read', 'Consulta proveedores'],
        ['tickets.manage', 'Soporte'],
      ],
    },
    {
      label: 'Seguridad',
      systemOwnerOnly: true,
      permissions: [
        ['security.manage', 'Seguridad'],
        ['audit.read', 'Auditoría'],
        ['*', 'Control total'],
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
  const hasActiveModule = (moduleCode) => !moduleCode || getActiveModuleCodes().has(moduleCode);
  const isSystemOwner = () => Boolean(window.AppSession?.getSession?.()?.user?.is_system_owner);
  const canUseRole = (role) => isSystemOwner() || !systemOwnerRoleCodes.has(role?.code);
  const getVisibleRoles = () => rolesCache.filter(canUseRole);

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
    const groups = permissionGroups.filter((group) => !group.systemOwnerOnly || isSystemOwner());

    permissionsPicker.innerHTML = groups
      .map((group) => `
        <fieldset class="permission-group">
          <legend>${escapeHtml(group.label)}</legend>
          ${group.permissions
            .filter(([code]) => isSystemOwner() || code !== '*')
            .map(([code, label]) => `
              <label class="permission-option">
                <input type="checkbox" value="${escapeHtml(code)}" ${selected.has(code) ? 'checked' : ''} />
                <span>${escapeHtml(label)}</span>
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
    const targetPanel = enabledSections.includes(section) ? section : 'usuarios';
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
          <small>Hacienda: sucursal ${organization.hacienda_branch_code || '001'} · terminal ${organization.hacienda_terminal_code || '00001'}</small>
        </li>`,
      )
      .join('');
  };



  const renderEmailOrganizations = (organizations) => {
    const options = organizations.map((organization) => `<option value="${organization.id}">${organization.name}</option>`).join('');
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
        (inbox) => `<li>
          <strong>${inbox.label}</strong>
          <span>${inbox.email} - ${inbox.is_primary ? 'Principal' : 'Secundario'} - ${inbox.is_active ? 'Activo' : 'Inactivo'}</span>
          <small>${inbox.imap_host}:${inbox.imap_port} - Carpeta ${inbox.folder} - ${inbox.imap_ssl ? 'SSL' : 'Sin SSL'}</small>
          <div class="actions">
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
      renderOrganizations(organizations);
      renderEmailOrganizations(organizations);
      setOrgFeedback(`Se cargaron ${organizations.length} organizaciones.`);
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
      setOrgFeedback('Debe indicar un nombre para crear la organización.', true);
      return;
    }
    if (!/^\d{3}$/.test(branchCode)) {
      setOrgFeedback('La sucursal de Hacienda debe tener exactamente 3 dígitos.', true);
      return;
    }
    if (!/^\d{5}$/.test(terminalCode)) {
      setOrgFeedback('La terminal/caja de Hacienda debe tener exactamente 5 dígitos.', true);
      return;
    }

    try {
      const parentOrganization = orgParentSelect.value ? Number(orgParentSelect.value) : null;
      const created = await orgRequest('/organizations/', {
        method: 'POST',
        body: JSON.stringify({
          name,
          parent_organization: parentOrganization,
          hacienda_branch_code: branchCode,
          hacienda_terminal_code: terminalCode,
        }),
      });
      orgNameInput.value = '';
      orgParentSelect.value = '';
      orgBranchCodeInput.value = '001';
      orgTerminalCodeInput.value = '00001';
      setOrgFeedback(`Organización creada: ${created.name} (#${created.id}).`);
      await loadOrganizations();
      if (hasActiveModule('purchases')) {
        await loadEmailInboxes();
      }
    } catch (error) {
      setOrgFeedback(error.message || 'No fue posible crear la organización.', true);
    }
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
    const assignableRoles = getVisibleRoles();

    usersList.innerHTML = pageUsers
      .map((user) => {
        const visibleAssignments = Array.isArray(user.role_assignments)
          ? user.role_assignments.filter((assignment) => isSystemOwner() || !systemOwnerRoleCodes.has(assignment.role_code))
          : [];
        const assignedRoles = visibleAssignments.length
          ? visibleAssignments.map((assignment) => `<span class="settings-chip">${escapeHtml(assignment.role_name)}</span>`).join('')
          : 'Sin rol especifico';
        const roleOptions = assignableRoles
          .map((role) => `<option value="${role.id}">${escapeHtml(role.name)}</option>`)
          .join('');
        return `<li class="settings-user-row" data-user-id="${user.id}">
          <div class="settings-user-main">
            <strong>${escapeHtml(user.email || user.username)}</strong>
            <div class="settings-user-meta">
              <span class="settings-chip ${user.is_active ? 'is-success' : 'is-muted'}">${user.is_active ? 'Activo' : 'Inactivo'}</span>
              <span class="settings-chip">${escapeHtml(user.organization_name || 'Negocio activo')}</span>
            </div>
            <small>${user.requires_password_setup ? 'Pendiente: debe crear contrasena al primer ingreso.' : 'Acceso con contrasena configurada.'}</small>
            <div class="settings-user-roles">${assignedRoles}</div>
          </div>
          <div class="inline-role-assignment">
            <select data-user-role-select="${user.id}">
              ${roleOptions || '<option value="">Sin roles disponibles</option>'}
            </select>
            <button class="btn btn-secondary" type="button" data-user-role-assign="${user.id}">Asignar rol</button>
          </div>
        </li>`;
      })
      .join('');

    usersPagination.innerHTML = `
      <button class="btn btn-secondary" type="button" data-users-page="${usersPage - 1}" ${usersPage <= 1 ? 'disabled' : ''}>Anterior</button>
      <span>Mostrando ${startIndex + 1}-${Math.min(startIndex + usersPageSize, sortedUsers.length)} de ${sortedUsers.length}</span>
      <button class="btn btn-secondary" type="button" data-users-page="${usersPage + 1}" ${usersPage >= totalPages ? 'disabled' : ''}>Siguiente</button>
    `;
  };

  const createCollaboratorUser = async () => {
    const organizationId = Number(window.AppSession?.getActiveOrganizationId?.());
    const email = newUserEmailInput.value.trim().toLowerCase();
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
          membership_role: 'viewer',
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
    const visibleRoles = roles.filter(canUseRole);
    if (!visibleRoles.length) {
      rolesGroups.innerHTML = '<p>No hay roles configurados.</p>';
      return;
    }

    const grouped = visibleRoles.reduce((acc, role) => {
      if (!acc[role.persona]) acc[role.persona] = [];
      acc[role.persona].push(role);
      return acc;
    }, {});

    rolesGroups.innerHTML = Object.entries(grouped)
      .map(
        ([persona, roleList]) => `<section class="role-group">
          <h3>${escapeHtml(personaLabels[persona] || persona)}</h3>
          <ul class="settings-list">
            ${roleList
              .map(
                (role) => `<li>
                    <strong>${escapeHtml(role.name)}</strong>
                    <span>${escapeHtml(role.description)}</span>
                    <small>Escenarios: ${escapeHtml(role.typical_scenarios)}</small>
                    <small>${role.is_system_default ? 'Rol base' : 'Rol personalizado'} - Permisos: ${escapeHtml((role.default_permissions || []).join(', ') || 'Sin permisos definidos')}</small>
                    <div class="actions">
                      <button class="btn btn-secondary" type="button" data-role-edit="${role.id}">Editar</button>
                      ${role.is_system_default ? '' : `<button class="btn btn-secondary" type="button" data-role-delete="${role.id}">Eliminar</button>`}
                    </div>
                  </li>`,
              )
              .join('')}
          </ul>
        </section>`,
      )
      .join('');
  };

  const renderRoleOptions = (roles) => {
    const visibleRoles = roles.filter(canUseRole);
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

  const renderRoleAssignments = async () => {
    try {
      const organizationId = getActiveOrganizationId();
      const query = organizationId ? `?organization_id=${organizationId}` : '';
      const response = await fetch(`/api/config/user-role-assignments/${query}`, { credentials: 'include' });
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
            <strong>${escapeHtml(assignment.role_detail?.name || 'Rol')}</strong>
            <span>${escapeHtml(assignedUser?.email || assignedUser?.username || `Usuario #${assignment.user}`)}</span>
            <small>${assignment.is_active ? 'Asociacion activa' : 'Asociacion inactiva'}</small>
          </li>`;
        })
        .join('');
    } catch (error) {
      roleAssignmentsList.innerHTML = `<li>${error.message || 'No se pudo cargar asociaciones.'}</li>`;
    }
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
      await loadData();
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

    try {
      const existing = availabilityRulesCache.find(
        (rule) =>
          Number(rule.organization) === organizationId &&
          Number(rule.collaborator) === collaboratorId &&
          Number(rule.weekday) === weekday,
      );

      await orgRequest(existing ? `/agenda-availability/${existing.id}/` : '/agenda-availability/', {
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
      setAvailabilityFeedback(
        `Horario guardado para ${getCollaboratorLabel(collaboratorId)} (${weekdayLabels[weekday]} ${start}-${end}).`,
      );
      await loadAvailabilityRules();
    } catch (error) {
      setAvailabilityFeedback(parseApiError(error) || 'No fue posible guardar la disponibilidad.', true);
    }
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
  createRoleButton.addEventListener('click', saveRole);
  cancelRoleEditButton.addEventListener('click', resetRoleForm);
  assignRoleButton.addEventListener('click', assignRole);
  createCollaboratorUserButton.addEventListener('click', createCollaboratorUser);
  usersList.addEventListener('click', (event) => {
    const userId = event.target?.dataset?.userRoleAssign;
    if (!userId) return;
    const roleId = usersList.querySelector(`[data-user-role-select="${userId}"]`)?.value;
    assignRole(userId, roleId).catch(() => null);
  });
  usersPagination.addEventListener('click', (event) => {
    const nextPage = Number(event.target?.dataset?.usersPage);
    if (!nextPage) return;
    usersPage = nextPage;
    renderUsers(usersCache);
  });
  permissionsPicker.addEventListener('change', syncPermissionInput);
  rolesGroups.addEventListener('click', (event) => {
    const editId = event.target?.dataset?.roleEdit;
    const deleteId = event.target?.dataset?.roleDelete;
    if (editId) {
      startRoleEdit(editId);
    }
    if (deleteId) {
      deleteRole(deleteId).catch(() => null);
    }
  });
  saveAvailabilityRuleButton.addEventListener('click', () => {
    saveAvailabilityRule().catch(() => null);
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
  document.addEventListener('change', (event) => {
    if (event.target?.id === 'organization-switcher') {
      loadCollaborators();
    }
  });
  setupSubmenuTabs();
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
