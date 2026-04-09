(function initLoyaltyModule() {
  const API_BASE = '/api';
  const SESSION_KEY = 'cr360.session';

  const organizationSelect = document.getElementById('organization-id');
  const programSelect = document.getElementById('program-id');
  const reloadButton = document.getElementById('reload-data');
  const feedbackNode = document.getElementById('feedback');

  const accrueForm = document.getElementById('accrue-form');
  const redeemForm = document.getElementById('redeem-form');

  const accrueMember = document.getElementById('accrue-member');
  const redeemMember = document.getElementById('redeem-member');
  const redeemReward = document.getElementById('redeem-reward');

  const entriesBody = document.getElementById('entries-body');

  const kpiMembers = document.getElementById('kpi-members');
  const kpiRewards = document.getElementById('kpi-rewards');
  const kpiEntries = document.getElementById('kpi-entries');

  let organizations = [];
  let programs = [];
  let members = [];
  let rewards = [];
  let entries = [];

  function toast(message, type) {
    if (window.appAlerts?.toast) {
      window.appAlerts.toast(message, type || 'info');
    }
  }

  function setFeedback(message, isError) {
    feedbackNode.textContent = message;
    feedbackNode.style.color = isError ? '#ff7d7d' : 'var(--muted)';
  }

  function getSessionOrganizationId() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
      return Number(session?.active_organization_id) || null;
    } catch (_error) {
      return null;
    }
  }

  function getApiBase() {
    return API_BASE.replace(/\/+$/, '');
  }

  async function request(path, options) {
    const response = await fetch(`${getApiBase()}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
      ...options,
    });

    const text = await response.text();
    const isJson = (response.headers.get('content-type') || '').includes('application/json');
    const payload = text && isJson ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(payload?.detail || text || 'Error del servidor');
    }

    return payload;
  }

  function renderOrganizations() {
    if (!organizations.length) {
      organizationSelect.innerHTML = '<option value="">Sin organizaciones</option>';
      return;
    }

    organizationSelect.innerHTML = organizations
      .map((org) => `<option value="${org.id}">${org.name} (#${org.id})</option>`)
      .join('');

    const sessionOrgId = getSessionOrganizationId();
    const exists = organizations.some((org) => org.id === sessionOrgId);
    if (exists) {
      organizationSelect.value = String(sessionOrgId);
    }
  }

  function renderPrograms() {
    if (!programs.length) {
      programSelect.innerHTML = '<option value="">Sin programas</option>';
      return;
    }

    programSelect.innerHTML = programs
      .map((program) => `<option value="${program.id}">${program.name} (${program.code})</option>`)
      .join('');
  }

  function renderMembers() {
    const options = members.length
      ? members.map((member) => `<option value="${member.id}">${member.customer_name || `Miembro #${member.id}`}</option>`).join('')
      : '<option value="">Sin miembros</option>';

    accrueMember.innerHTML = options;
    redeemMember.innerHTML = options;
  }

  function renderRewards() {
    redeemReward.innerHTML = rewards.length
      ? rewards.map((reward) => `<option value="${reward.id}">${reward.name} (${reward.points_cost} pts)</option>`).join('')
      : '<option value="">Sin rewards</option>';
  }

  function renderEntries() {
    if (!entries.length) {
      entriesBody.innerHTML = '<tr><td colspan="5">Sin movimientos para el programa seleccionado.</td></tr>';
      return;
    }

    entriesBody.innerHTML = entries
      .map((entry) => {
        const member = members.find((item) => item.id === entry.member);
        return `
          <tr>
            <td>${new Date(entry.event_at).toLocaleString('es-CR')}</td>
            <td>${member?.customer_name || `#${entry.member}`}</td>
            <td>${entry.entry_type}</td>
            <td>${entry.points}</td>
            <td>${entry.source_reference || '-'}</td>
          </tr>
        `;
      })
      .join('');
  }

  function refreshKpis() {
    kpiMembers.textContent = String(members.length);
    kpiRewards.textContent = String(rewards.filter((item) => item.is_active).length);

    const today = new Date();
    const day = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
    const movementsToday = entries.filter((entry) => String(entry.event_at || '').startsWith(day)).length;
    kpiEntries.textContent = String(movementsToday);
  }

  function getOrganizationId() {
    const id = Number(organizationSelect.value);
    if (!id) throw new Error('Selecciona una organización válida.');
    return id;
  }

  function getProgramId() {
    const id = Number(programSelect.value);
    if (!id) throw new Error('Selecciona un programa de fidelización.');
    return id;
  }

  async function loadPrograms() {
    const organizationId = getOrganizationId();
    programs = await request(`/loyalty-programs/?organization_id=${organizationId}`);
    renderPrograms();
  }

  async function loadProgramData() {
    const programId = getProgramId();
    const organizationId = getOrganizationId();

    members = await request(`/loyalty-members/?organization_id=${organizationId}`).then((items) =>
      items.filter((item) => item.program === programId),
    );
    rewards = await request(`/loyalty-rewards/?organization_id=${organizationId}`).then((items) =>
      items.filter((item) => item.program === programId),
    );
    entries = await request(`/loyalty-entries/?organization_id=${organizationId}`).then((items) =>
      items.filter((item) => item.program === programId).slice(0, 50),
    );

    renderMembers();
    renderRewards();
    renderEntries();
    refreshKpis();
  }

  async function loadAll() {
    try {
      organizations = await request('/organizations/');
      renderOrganizations();
      await loadPrograms();
      await loadProgramData();
      setFeedback('Datos cargados correctamente.', false);
    } catch (error) {
      setFeedback(error.message, true);
      toast(error.message, 'error');
    }
  }

  reloadButton?.addEventListener('click', loadAll);

  organizationSelect?.addEventListener('change', async () => {
    try {
      await loadPrograms();
      await loadProgramData();
      setFeedback('Datos de organización actualizados.', false);
    } catch (error) {
      setFeedback(error.message, true);
    }
  });

  programSelect?.addEventListener('change', async () => {
    try {
      await loadProgramData();
      setFeedback('Programa actualizado.', false);
    } catch (error) {
      setFeedback(error.message, true);
    }
  });

  accrueForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const payload = {
        member: Number(accrueMember.value),
        purchase_amount: Number(document.getElementById('purchase-amount').value),
        source_reference: document.getElementById('accrue-reference').value.trim(),
      };
      await request('/loyalty-members/accrue/', { method: 'POST', body: JSON.stringify(payload) });
      toast('Puntos acumulados correctamente.', 'success');
      await loadProgramData();
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  redeemForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const payload = {
        member: Number(redeemMember.value),
        reward: Number(redeemReward.value),
        quantity: Number(document.getElementById('redeem-qty').value || 1),
        source_reference: document.getElementById('redeem-reference').value.trim(),
      };
      await request('/loyalty-members/redeem/', { method: 'POST', body: JSON.stringify(payload) });
      toast('Canje confirmado correctamente.', 'success');
      await loadProgramData();
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  loadAll();
})();
