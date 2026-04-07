(function initConfiguracionesModule() {
  const usersList = document.getElementById('users-list');
  const rolesGroups = document.getElementById('roles-groups');
  const systemSettingsList = document.getElementById('system-settings-list');

  if (!usersList || !rolesGroups || !systemSettingsList) {
    return;
  }

  const personaLabels = {
    it_admin: 'Administrador de TI',
    business_manager: 'Jefatura / Dirección',
    cross_functional: 'Uso transversal',
  };

  const showError = (message) => {
    if (window.showErrorAlert) {
      window.showErrorAlert(message);
      return;
    }
    // eslint-disable-next-line no-alert
    alert(message);
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

  const renderSettings = (settings) => {
    if (!settings.length) {
      systemSettingsList.innerHTML = '<li>Sin parámetros cargados.</li>';
      return;
    }

    systemSettingsList.innerHTML = settings
      .map(
        (setting) => `<li>
          <strong>${setting.key}</strong>
          <span>${setting.description}</span>
          <small>Categoría: ${setting.category}${setting.is_sensitive ? ' · Sensible' : ''}</small>
        </li>`,
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
      renderUsers(users);
      renderRoles(roles);
      renderSettings(systemSettings);
    } catch (error) {
      showError(error.message || 'Error inesperado al cargar configuraciones.');
    }
  };

  loadData();
})();
