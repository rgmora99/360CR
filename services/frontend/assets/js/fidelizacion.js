(function initLoyaltyModule() {
  const API_BASE = '/api';
  const SESSION_KEY = 'cr360.session';

  const dom = {
    organization: document.getElementById('organization-id'),
    program: document.getElementById('program-id'),
    reload: document.getElementById('reload-data'),
    feedback: document.getElementById('feedback'),

    programForm: document.getElementById('program-form'),
    programFormTitle: document.getElementById('program-form-title'),
    cancelProgramEdit: document.getElementById('cancel-program-edit'),
    programFormId: document.getElementById('program-form-id'),
    programCode: document.getElementById('program-code'),
    programName: document.getElementById('program-name'),
    pointsName: document.getElementById('points-name'),
    programActive: document.getElementById('program-active'),
    programDescription: document.getElementById('program-description'),
    programsBody: document.getElementById('programs-body'),

    ruleForm: document.getElementById('rule-form'),
    ruleId: document.getElementById('rule-id'),
    rulePointsPerCurrency: document.getElementById('rule-points-per-currency'),
    ruleExpireDays: document.getElementById('rule-expire-days'),
    ruleMinPurchase: document.getElementById('rule-min-purchase'),
    ruleActive: document.getElementById('rule-active'),

    memberForm: document.getElementById('member-form'),
    memberFormTitle: document.getElementById('member-form-title'),
    cancelMemberEdit: document.getElementById('cancel-member-edit'),
    memberFormId: document.getElementById('member-form-id'),
    memberCustomer: document.getElementById('member-customer'),
    memberCode: document.getElementById('member-code'),
    memberStatus: document.getElementById('member-status'),
    membersBody: document.getElementById('members-body'),

    rewardForm: document.getElementById('reward-form'),
    rewardFormTitle: document.getElementById('reward-form-title'),
    cancelRewardEdit: document.getElementById('cancel-reward-edit'),
    rewardFormId: document.getElementById('reward-form-id'),
    rewardCode: document.getElementById('reward-code'),
    rewardName: document.getElementById('reward-name'),
    rewardPoints: document.getElementById('reward-points'),
    rewardStock: document.getElementById('reward-stock'),
    rewardActive: document.getElementById('reward-active'),
    rewardsBody: document.getElementById('rewards-body'),

    accrueForm: document.getElementById('accrue-form'),
    accrueMember: document.getElementById('accrue-member'),
    purchaseAmount: document.getElementById('purchase-amount'),
    accrueReference: document.getElementById('accrue-reference'),

    redeemForm: document.getElementById('redeem-form'),
    redeemMember: document.getElementById('redeem-member'),
    redeemReward: document.getElementById('redeem-reward'),
    redeemQty: document.getElementById('redeem-qty'),
    redeemReference: document.getElementById('redeem-reference'),

    entriesBody: document.getElementById('entries-body'),
  };

  const state = {
    organizations: [],
    customers: [],
    programs: [],
    rules: [],
    members: [],
    rewards: [],
    entries: [],
  };

  const toBool = (value) => String(value) === 'true';

  function notify(message, type = 'info') {
    if (window.appAlerts?.toast) {
      window.appAlerts.toast(message, type);
    }
  }

  function setFeedback(message, isError) {
    if (!dom.feedback) return;
    dom.feedback.textContent = message;
    dom.feedback.style.color = isError ? '#ff7d7d' : 'var(--muted)';
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

  function selectedOrganizationId() {
    const id = Number(dom.organization.value);
    if (!id) throw new Error('Selecciona una organización válida.');
    return id;
  }

  function selectedProgramId() {
    const id = Number(dom.program.value);
    if (!id) throw new Error('Selecciona un programa de fidelización.');
    return id;
  }

  function renderOrganizations() {
    if (!state.organizations.length) {
      dom.organization.innerHTML = '<option value="">Sin organizaciones</option>';
      return;
    }

    dom.organization.innerHTML = state.organizations
      .map((org) => `<option value="${org.id}">${org.name} (#${org.id})</option>`)
      .join('');

    const fromSession = getSessionOrganizationId();
    if (state.organizations.some((item) => item.id === fromSession)) {
      dom.organization.value = String(fromSession);
    }
  }

  function renderPrograms() {
    if (!state.programs.length) {
      dom.program.innerHTML = '<option value="">Sin programas</option>';
      dom.programsBody.innerHTML = '<tr><td colspan="4">No hay programas en esta organización.</td></tr>';
      return;
    }

    dom.program.innerHTML = state.programs
      .map((program) => `<option value="${program.id}">${program.name} (${program.code})</option>`)
      .join('');

    dom.programsBody.innerHTML = state.programs
      .map(
        (program) => `
          <tr>
            <td>${program.code}</td>
            <td>${program.name}</td>
            <td>${program.is_active ? 'Sí' : 'No'}</td>
            <td>
              <button class="btn btn-secondary" data-program-edit="${program.id}" type="button">Editar</button>
              <button class="btn btn-secondary" data-program-delete="${program.id}" type="button">Eliminar</button>
            </td>
          </tr>
        `,
      )
      .join('');
  }

  function renderCustomers() {
    dom.memberCustomer.innerHTML = state.customers.length
      ? state.customers.map((item) => `<option value="${item.id}">${item.legal_name}</option>`).join('')
      : '<option value="">Sin clientes</option>';
  }

  function renderMembers() {
    const memberOptions = state.members.length
      ? state.members.map((item) => `<option value="${item.id}">${item.customer_name || item.member_code}</option>`).join('')
      : '<option value="">Sin miembros</option>';

    dom.accrueMember.innerHTML = memberOptions;
    dom.redeemMember.innerHTML = memberOptions;

    dom.membersBody.innerHTML = state.members.length
      ? state.members
          .map(
            (member) => `
              <tr>
                <td>${member.customer_name || '-'}</td>
                <td>${member.member_code}</td>
                <td>${member.available_points}</td>
                <td>
                  <button class="btn btn-secondary" data-member-edit="${member.id}" type="button">Editar</button>
                  <button class="btn btn-secondary" data-member-delete="${member.id}" type="button">Eliminar</button>
                </td>
              </tr>
            `,
          )
          .join('')
      : '<tr><td colspan="4">Sin miembros en el programa.</td></tr>';
  }

  function renderRewards() {
    dom.redeemReward.innerHTML = state.rewards.length
      ? state.rewards.map((item) => `<option value="${item.id}">${item.name} (${item.points_cost} pts)</option>`).join('')
      : '<option value="">Sin recompensas</option>';

    dom.rewardsBody.innerHTML = state.rewards.length
      ? state.rewards
          .map(
            (reward) => `
              <tr>
                <td>${reward.name}</td>
                <td>${reward.points_cost}</td>
                <td>${reward.is_unlimited_stock ? '∞' : reward.stock}</td>
                <td>
                  <button class="btn btn-secondary" data-reward-edit="${reward.id}" type="button">Editar</button>
                  <button class="btn btn-secondary" data-reward-delete="${reward.id}" type="button">Eliminar</button>
                </td>
              </tr>
            `,
          )
          .join('')
      : '<tr><td colspan="4">Sin recompensas configuradas.</td></tr>';
  }

  function renderEntries() {
    dom.entriesBody.innerHTML = state.entries.length
      ? state.entries
          .map((entry) => {
            const member = state.members.find((item) => item.id === entry.member);
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
          .join('')
      : '<tr><td colspan="5">Sin movimientos para el programa seleccionado.</td></tr>';
  }

  function fillRuleForm() {
    const rule = state.rules.find((item) => item.rule_type === 'earn') || null;
    if (!rule) {
      dom.ruleId.value = '';
      dom.rulePointsPerCurrency.value = '';
      dom.ruleExpireDays.value = '';
      dom.ruleMinPurchase.value = '0';
      dom.ruleActive.value = 'true';
      return;
    }

    dom.ruleId.value = String(rule.id);
    dom.rulePointsPerCurrency.value = rule.points_per_currency_unit || '';
    dom.ruleExpireDays.value = rule.points_expire_in_days ?? '';
    dom.ruleMinPurchase.value = rule.minimum_purchase_amount || '0';
    dom.ruleActive.value = String(rule.is_active);
  }

  function resetProgramForm() {
    dom.programForm.reset();
    dom.programFormId.value = '';
    dom.pointsName.value = 'Puntos';
    dom.programActive.value = 'true';
    dom.programFormTitle.textContent = 'Nuevo programa';
  }

  function resetMemberForm() {
    dom.memberForm.reset();
    dom.memberFormId.value = '';
    dom.memberStatus.value = 'active';
    dom.memberFormTitle.textContent = 'Nuevo miembro';
  }

  function resetRewardForm() {
    dom.rewardForm.reset();
    dom.rewardFormId.value = '';
    dom.rewardActive.value = 'true';
    dom.rewardStock.value = '0';
    dom.rewardFormTitle.textContent = 'Nueva recompensa';
  }

  async function loadProgramsAndRule() {
    const organizationId = selectedOrganizationId();
    state.programs = await request(`/loyalty-programs/?organization_id=${organizationId}`);
    renderPrograms();

    if (!state.programs.length) {
      state.rules = [];
      fillRuleForm();
      return;
    }

    const selected = Number(dom.program.value) || state.programs[0].id;
    dom.program.value = String(selected);
    state.rules = await request(`/loyalty-rules/?organization_id=${organizationId}`).then((items) =>
      items.filter((item) => item.program === selected),
    );
    fillRuleForm();
  }

  async function loadProgramOperationalData() {
    if (!state.programs.length) {
      state.members = [];
      state.rewards = [];
      state.entries = [];
      renderMembers();
      renderRewards();
      renderEntries();
      return;
    }

    const organizationId = selectedOrganizationId();
    const programId = selectedProgramId();

    state.members = await request(`/loyalty-members/?organization_id=${organizationId}`).then((items) =>
      items.filter((item) => item.program === programId),
    );
    state.rewards = await request(`/loyalty-rewards/?organization_id=${organizationId}`).then((items) =>
      items.filter((item) => item.program === programId),
    );
    state.entries = await request(`/loyalty-entries/?organization_id=${organizationId}`).then((items) =>
      items.filter((item) => item.program === programId).slice(0, 100),
    );

    renderMembers();
    renderRewards();
    renderEntries();
  }

  async function loadCustomers() {
    const organizationId = selectedOrganizationId();
    state.customers = await request(`/customers/?organization_id=${organizationId}`);
    renderCustomers();
  }

  async function loadAll() {
    try {
      state.organizations = await request('/organizations/');
      renderOrganizations();
      await loadCustomers();
      await loadProgramsAndRule();
      await loadProgramOperationalData();
      setFeedback('Módulo listo. CRUD completo habilitado.', false);
    } catch (error) {
      setFeedback(error.message, true);
      notify(error.message, 'error');
    }
  }

  dom.reload?.addEventListener('click', loadAll);

  dom.organization?.addEventListener('change', async () => {
    try {
      await loadCustomers();
      await loadProgramsAndRule();
      await loadProgramOperationalData();
      resetProgramForm();
      resetMemberForm();
      resetRewardForm();
      setFeedback('Organización actualizada.', false);
    } catch (error) {
      setFeedback(error.message, true);
    }
  });

  dom.program?.addEventListener('change', async () => {
    try {
      await loadProgramsAndRule();
      await loadProgramOperationalData();
      resetMemberForm();
      resetRewardForm();
      setFeedback('Programa actualizado.', false);
    } catch (error) {
      setFeedback(error.message, true);
    }
  });

  dom.programForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const payload = {
        organization: selectedOrganizationId(),
        code: dom.programCode.value.trim(),
        name: dom.programName.value.trim(),
        points_name: dom.pointsName.value.trim() || 'Puntos',
        description: dom.programDescription.value.trim(),
        is_active: toBool(dom.programActive.value),
      };

      const programId = Number(dom.programFormId.value);
      if (programId) {
        await request(`/loyalty-programs/${programId}/`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await request('/loyalty-programs/', { method: 'POST', body: JSON.stringify(payload) });
      }

      resetProgramForm();
      await loadProgramsAndRule();
      await loadProgramOperationalData();
      notify('Programa guardado correctamente.', 'success');
    } catch (error) {
      notify(error.message, 'error');
    }
  });

  dom.ruleForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const payload = {
        program: selectedProgramId(),
        rule_type: 'earn',
        name: 'Regla base de acumulación',
        points_per_currency_unit: dom.rulePointsPerCurrency.value,
        minimum_purchase_amount: dom.ruleMinPurchase.value || '0',
        points_expire_in_days: dom.ruleExpireDays.value ? Number(dom.ruleExpireDays.value) : null,
        is_active: toBool(dom.ruleActive.value),
      };

      const ruleId = Number(dom.ruleId.value);
      if (ruleId) {
        await request(`/loyalty-rules/${ruleId}/`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await request('/loyalty-rules/', { method: 'POST', body: JSON.stringify(payload) });
      }

      await loadProgramsAndRule();
      notify('Regla de acumulación guardada.', 'success');
    } catch (error) {
      notify(error.message, 'error');
    }
  });

  dom.memberForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const payload = {
        program: selectedProgramId(),
        customer: Number(dom.memberCustomer.value),
        member_code: dom.memberCode.value.trim(),
        status: dom.memberStatus.value,
      };

      const memberId = Number(dom.memberFormId.value);
      if (memberId) {
        const existing = state.members.find((item) => item.id === memberId);
        payload.lifetime_points = existing?.lifetime_points ?? 0;
        payload.available_points = existing?.available_points ?? 0;
        payload.reserved_points = existing?.reserved_points ?? 0;
        await request(`/loyalty-members/${memberId}/`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await request('/loyalty-members/', { method: 'POST', body: JSON.stringify(payload) });
      }

      resetMemberForm();
      await loadProgramOperationalData();
      notify('Miembro guardado correctamente.', 'success');
    } catch (error) {
      notify(error.message, 'error');
    }
  });

  dom.rewardForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const payload = {
        program: selectedProgramId(),
        code: dom.rewardCode.value.trim(),
        name: dom.rewardName.value.trim(),
        points_cost: Number(dom.rewardPoints.value),
        stock: Number(dom.rewardStock.value || 0),
        is_active: toBool(dom.rewardActive.value),
      };

      const rewardId = Number(dom.rewardFormId.value);
      if (rewardId) {
        await request(`/loyalty-rewards/${rewardId}/`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await request('/loyalty-rewards/', { method: 'POST', body: JSON.stringify(payload) });
      }

      resetRewardForm();
      await loadProgramOperationalData();
      notify('Recompensa guardada correctamente.', 'success');
    } catch (error) {
      notify(error.message, 'error');
    }
  });

  dom.accrueForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await request('/loyalty-members/accrue/', {
        method: 'POST',
        body: JSON.stringify({
          member: Number(dom.accrueMember.value),
          purchase_amount: Number(dom.purchaseAmount.value),
          source_reference: dom.accrueReference.value.trim(),
        }),
      });
      await loadProgramOperationalData();
      notify('Acumulación registrada.', 'success');
    } catch (error) {
      notify(error.message, 'error');
    }
  });

  dom.redeemForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await request('/loyalty-members/redeem/', {
        method: 'POST',
        body: JSON.stringify({
          member: Number(dom.redeemMember.value),
          reward: Number(dom.redeemReward.value),
          quantity: Number(dom.redeemQty.value || 1),
          source_reference: dom.redeemReference.value.trim(),
        }),
      });
      await loadProgramOperationalData();
      notify('Canje registrado.', 'success');
    } catch (error) {
      notify(error.message, 'error');
    }
  });

  dom.programsBody?.addEventListener('click', async (event) => {
    const programEditId = Number(event.target.getAttribute('data-program-edit'));
    const programDeleteId = Number(event.target.getAttribute('data-program-delete'));

    if (programEditId) {
      const item = state.programs.find((program) => program.id === programEditId);
      if (!item) return;
      dom.programFormId.value = String(item.id);
      dom.programCode.value = item.code;
      dom.programName.value = item.name;
      dom.pointsName.value = item.points_name || 'Puntos';
      dom.programDescription.value = item.description || '';
      dom.programActive.value = String(item.is_active);
      dom.programFormTitle.textContent = `Editar programa #${item.id}`;
      return;
    }

    if (programDeleteId) {
      try {
        await request(`/loyalty-programs/${programDeleteId}/`, { method: 'DELETE' });
        resetProgramForm();
        await loadProgramsAndRule();
        await loadProgramOperationalData();
        notify('Programa eliminado.', 'success');
      } catch (error) {
        notify(error.message, 'error');
      }
    }
  });

  dom.membersBody?.addEventListener('click', async (event) => {
    const memberEditId = Number(event.target.getAttribute('data-member-edit'));
    const memberDeleteId = Number(event.target.getAttribute('data-member-delete'));

    if (memberEditId) {
      const item = state.members.find((member) => member.id === memberEditId);
      if (!item) return;
      dom.memberFormId.value = String(item.id);
      dom.memberCustomer.value = String(item.customer);
      dom.memberCode.value = item.member_code;
      dom.memberStatus.value = item.status;
      dom.memberFormTitle.textContent = `Editar miembro #${item.id}`;
      return;
    }

    if (memberDeleteId) {
      try {
        await request(`/loyalty-members/${memberDeleteId}/`, { method: 'DELETE' });
        resetMemberForm();
        await loadProgramOperationalData();
        notify('Miembro eliminado.', 'success');
      } catch (error) {
        notify(error.message, 'error');
      }
    }
  });

  dom.rewardsBody?.addEventListener('click', async (event) => {
    const rewardEditId = Number(event.target.getAttribute('data-reward-edit'));
    const rewardDeleteId = Number(event.target.getAttribute('data-reward-delete'));

    if (rewardEditId) {
      const item = state.rewards.find((reward) => reward.id === rewardEditId);
      if (!item) return;
      dom.rewardFormId.value = String(item.id);
      dom.rewardCode.value = item.code;
      dom.rewardName.value = item.name;
      dom.rewardPoints.value = item.points_cost;
      dom.rewardStock.value = item.stock;
      dom.rewardActive.value = String(item.is_active);
      dom.rewardFormTitle.textContent = `Editar recompensa #${item.id}`;
      return;
    }

    if (rewardDeleteId) {
      try {
        await request(`/loyalty-rewards/${rewardDeleteId}/`, { method: 'DELETE' });
        resetRewardForm();
        await loadProgramOperationalData();
        notify('Recompensa eliminada.', 'success');
      } catch (error) {
        notify(error.message, 'error');
      }
    }
  });

  dom.cancelProgramEdit?.addEventListener('click', resetProgramForm);
  dom.cancelMemberEdit?.addEventListener('click', resetMemberForm);
  dom.cancelRewardEdit?.addEventListener('click', resetRewardForm);

  loadAll();
})();
