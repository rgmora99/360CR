(function initLoyaltyModule() {
  const API_BASE = '/api';
  const SESSION_KEY = 'cr360.session';

  const dom = {
    organization: document.getElementById('organization-id'),
    program: document.getElementById('program-id'),
    reload: document.getElementById('reload-data'),
    feedback: document.getElementById('feedback'),

    tabs: Array.from(document.querySelectorAll('[data-loyalty-tab]')),
    panels: Array.from(document.querySelectorAll('[data-loyalty-panel]')),

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
  const programsPager = window.TablePaginator?.create({
    key: 'loyalty-programs',
    tableBody: dom.programsBody,
    totalColumns: 4,
    emptyMessage: 'No hay programas en esta organizacion.',
    rowRenderer: (program) => `
      <tr>
        <td>${program.code}</td>
        <td>${program.name}</td>
        <td>${program.is_active ? 'Si' : 'No'}</td>
        <td>
          <button class="btn btn-secondary" data-program-edit="${program.id}" type="button">Editar</button>
          <button class="btn btn-secondary" data-program-delete="${program.id}" type="button">Eliminar</button>
        </td>
      </tr>
    `,
  });
  const membersPager = window.TablePaginator?.create({
    key: 'loyalty-members',
    tableBody: dom.membersBody,
    totalColumns: 4,
    emptyMessage: 'Sin miembros en el programa.',
    rowRenderer: (member) => `
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
  });
  const rewardsPager = window.TablePaginator?.create({
    key: 'loyalty-rewards',
    tableBody: dom.rewardsBody,
    totalColumns: 4,
    emptyMessage: 'Sin recompensas configuradas.',
    rowRenderer: (reward) => `
      <tr>
        <td>${reward.name}</td>
        <td>${reward.points_cost}</td>
        <td>${reward.is_unlimited_stock ? 'Ilimitado' : reward.stock}</td>
        <td>
          <button class="btn btn-secondary" data-reward-edit="${reward.id}" type="button">Editar</button>
          <button class="btn btn-secondary" data-reward-delete="${reward.id}" type="button">Eliminar</button>
        </td>
      </tr>
    `,
  });
  const entriesPager = window.TablePaginator?.create({
    key: 'loyalty-entries',
    tableBody: dom.entriesBody,
    totalColumns: 5,
    emptyMessage: 'Sin movimientos para el programa seleccionado.',
    rowRenderer: (entry) => {
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
    },
  });

  const toBool = (value) => String(value) === 'true';

  function notify(message, type = 'info') {
    if (window.appAlerts?.toast) window.appAlerts.toast(message, type);
  }

  function setFeedback(message, isError) {
    if (!dom.feedback) return;
    dom.feedback.textContent = message;
    dom.feedback.style.color = isError ? '#ff7d7d' : 'var(--color-muted)';
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

  function slugify(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 36);
  }

  function uniqueCode(base, existingCodes, fallbackPrefix) {
    const normalized = slugify(base) || fallbackPrefix;
    let candidate = normalized;
    let index = 2;
    const lookup = new Set(existingCodes.map((item) => String(item || '').toLowerCase()));
    while (lookup.has(candidate.toLowerCase())) {
      candidate = `${normalized}-${index}`;
      index += 1;
    }
    return candidate;
  }

  function memberCodeFromCustomer(customerId, currentId) {
    const customer = state.customers.find((item) => item.id === Number(customerId));
    const baseName = customer?.legal_name || 'miembro';
    const prefix = `MEM-${slugify(baseName).replace(/-/g, '').slice(0, 6).toUpperCase() || 'CLIENT'}`;
    const existingCodes = state.members
      .filter((member) => Number(member.id) !== Number(currentId || 0))
      .map((member) => member.member_code);
    let sequence = 1;
    let candidate = `${prefix}-${String(sequence).padStart(4, '0')}`;
    const lookup = new Set(existingCodes.map((item) => String(item || '').toUpperCase()));
    while (lookup.has(candidate.toUpperCase())) {
      sequence += 1;
      candidate = `${prefix}-${String(sequence).padStart(4, '0')}`;
    }
    return candidate;
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function toPositiveNumber(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER, allowZero = true } = {}) {
    const numeric = Number(value);
    assert(Number.isFinite(numeric), `${field}: valor inválido.`);
    if (!allowZero) {
      assert(numeric > min, `${field}: debe ser mayor a ${min}.`);
    } else {
      assert(numeric >= min, `${field}: debe ser mayor o igual a ${min}.`);
    }
    assert(numeric <= max, `${field}: no debe superar ${max}.`);
    return numeric;
  }

  function formatDecimalForInput(value) {
    if (value === null || value === undefined || value === '') return '';
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return String(value);
    if (Number.isInteger(numeric)) return String(numeric);
    return numeric.toString();
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

    if (!response.ok) throw new Error(payload?.detail || text || 'Error del servidor');
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

  function switchPanel(tabKey) {
    dom.tabs.forEach((button) => button.classList.toggle('is-active', button.dataset.loyaltyTab === tabKey));
    dom.panels.forEach((panel) => panel.classList.toggle('is-active', panel.dataset.loyaltyPanel === tabKey));
  }

  function renderOrganizations() {
    if (!state.organizations.length) {
      dom.organization.innerHTML = '<option value="">Sin organizaciones</option>';
      return;
    }

    dom.organization.innerHTML = state.organizations.map((org) => `<option value="${org.id}">${org.name} (#${org.id})</option>`).join('');

    const fromSession = getSessionOrganizationId();
    if (state.organizations.some((item) => item.id === fromSession)) dom.organization.value = String(fromSession);
  }

  function renderPrograms() {
    if (!state.programs.length) {
      dom.program.innerHTML = '<option value="">Sin programas</option>';
      if (programsPager) {
        programsPager.update([]);
      }
      dom.programsBody.innerHTML = '<tr><td colspan="4">No hay programas en esta organización.</td></tr>';
      return;
    }

    dom.program.innerHTML = state.programs.map((program) => `<option value="${program.id}">${program.name} (${program.code})</option>`).join('');
    if (programsPager) {
      programsPager.update(state.programs);
      return;
    }

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
    maybeGenerateMemberCode();
  }

  function renderMembers() {
    const memberOptions = state.members.length
      ? state.members.map((item) => `<option value="${item.id}">${item.customer_name || item.member_code}</option>`).join('')
      : '<option value="">Sin miembros</option>';

    dom.accrueMember.innerHTML = memberOptions;
    dom.redeemMember.innerHTML = memberOptions;

    if (membersPager) {
      membersPager.update(state.members);
      return;
    }

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

    if (rewardsPager) {
      rewardsPager.update(state.rewards);
      return;
    }

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
    if (entriesPager) {
      entriesPager.update(state.entries);
      return;
    }

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
    dom.rulePointsPerCurrency.value = formatDecimalForInput(rule.points_per_currency_unit);
    dom.ruleExpireDays.value = rule.points_expire_in_days ?? '';
    dom.ruleMinPurchase.value = formatDecimalForInput(rule.minimum_purchase_amount || '0');
    dom.ruleActive.value = String(rule.is_active);
  }

  function maybeGenerateProgramCode() {
    const programId = Number(dom.programFormId.value || 0);
    if (programId) return;
    const code = uniqueCode(
      dom.programName.value,
      state.programs.map((item) => item.code),
      'programa',
    );
    dom.programCode.value = code;
  }

  function maybeGenerateRewardCode() {
    const rewardId = Number(dom.rewardFormId.value || 0);
    if (rewardId) return;
    const code = uniqueCode(
      dom.rewardName.value,
      state.rewards.map((item) => item.code),
      'recompensa',
    );
    dom.rewardCode.value = code;
  }

  function maybeGenerateMemberCode() {
    const memberId = Number(dom.memberFormId.value || 0);
    if (memberId) return;
    const customerId = Number(dom.memberCustomer.value || 0);
    if (!customerId) {
      dom.memberCode.value = '';
      return;
    }
    dom.memberCode.value = memberCodeFromCustomer(customerId, null);
  }

  function resetProgramForm() {
    dom.programForm.reset();
    dom.programFormId.value = '';
    dom.pointsName.value = 'Puntos';
    dom.programActive.value = 'true';
    dom.programFormTitle.textContent = 'Nuevo programa';
    maybeGenerateProgramCode();
  }

  function resetMemberForm() {
    dom.memberForm.reset();
    dom.memberFormId.value = '';
    dom.memberStatus.value = 'active';
    dom.memberFormTitle.textContent = 'Nuevo miembro';
    maybeGenerateMemberCode();
  }

  function resetRewardForm() {
    dom.rewardForm.reset();
    dom.rewardFormId.value = '';
    dom.rewardActive.value = 'true';
    dom.rewardStock.value = '0';
    dom.rewardFormTitle.textContent = 'Nueva recompensa';
    maybeGenerateRewardCode();
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
      resetProgramForm();
      resetMemberForm();
      resetRewardForm();
      setFeedback('Módulo listo. Validaciones y códigos automáticos habilitados.', false);
    } catch (error) {
      setFeedback(error.message, true);
      notify(error.message, 'error');
    }
  }

  dom.tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchPanel(tab.dataset.loyaltyTab));
  });

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

  dom.programName?.addEventListener('input', maybeGenerateProgramCode);
  dom.rewardName?.addEventListener('input', maybeGenerateRewardCode);
  dom.memberCustomer?.addEventListener('change', maybeGenerateMemberCode);

  dom.programForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const name = dom.programName.value.trim();
      const pointsName = dom.pointsName.value.trim() || 'Puntos';
      const description = dom.programDescription.value.trim();
      const currentId = Number(dom.programFormId.value || 0);
      const generatedCode = uniqueCode(
        name,
        state.programs.filter((item) => item.id !== currentId).map((item) => item.code),
        'programa',
      );

      assert(name.length >= 3, 'El nombre del programa debe tener al menos 3 caracteres.');
      assert(pointsName.length >= 2, 'El nombre de puntos debe tener al menos 2 caracteres.');
      assert(description.length <= 500, 'La descripción no puede superar 500 caracteres.');

      const payload = {
        organization: selectedOrganizationId(),
        code: generatedCode,
        name,
        points_name: pointsName,
        description,
        is_active: toBool(dom.programActive.value),
      };

      if (currentId) {
        await request(`/loyalty-programs/${currentId}/`, { method: 'PUT', body: JSON.stringify(payload) });
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
      const pointsPerCurrency = toPositiveNumber(dom.rulePointsPerCurrency.value, 'Puntos por unidad', {
        min: 0,
        max: 10000,
        allowZero: false,
      });
      const minimumPurchase = toPositiveNumber(dom.ruleMinPurchase.value || 0, 'Mínimo de compra', {
        min: 0,
        max: 99999999,
      });
      const expireDays = dom.ruleExpireDays.value
        ? toPositiveNumber(dom.ruleExpireDays.value, 'Días para expirar', { min: 0, max: 3650 })
        : null;

      const payload = {
        program: selectedProgramId(),
        rule_type: 'earn',
        name: 'Regla base de acumulación',
        points_per_currency_unit: pointsPerCurrency,
        minimum_purchase_amount: minimumPurchase,
        points_expire_in_days: expireDays,
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
      const customerId = Number(dom.memberCustomer.value);
      assert(customerId > 0, 'Selecciona un cliente válido.');

      const memberId = Number(dom.memberFormId.value);
      const memberCode = memberCodeFromCustomer(customerId, memberId || null);
      const payload = {
        program: selectedProgramId(),
        customer: customerId,
        member_code: memberCode,
        status: dom.memberStatus.value,
      };

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
      const name = dom.rewardName.value.trim();
      assert(name.length >= 3, 'El nombre de recompensa debe tener al menos 3 caracteres.');

      const rewardId = Number(dom.rewardFormId.value || 0);
      const code = uniqueCode(
        name,
        state.rewards.filter((item) => item.id !== rewardId).map((item) => item.code),
        'recompensa',
      );

      const pointsCost = toPositiveNumber(dom.rewardPoints.value, 'Puntos de recompensa', {
        min: 0,
        max: 1000000,
        allowZero: false,
      });
      const stock = toPositiveNumber(dom.rewardStock.value || 0, 'Stock', {
        min: 0,
        max: 1000000,
      });

      const payload = {
        program: selectedProgramId(),
        code,
        name,
        points_cost: pointsCost,
        stock,
        is_active: toBool(dom.rewardActive.value),
      };

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
      const member = Number(dom.accrueMember.value);
      assert(member > 0, 'Selecciona un miembro válido para acumular.');
      const purchaseAmount = toPositiveNumber(dom.purchaseAmount.value, 'Monto de compra', {
        min: 0,
        max: 99999999,
        allowZero: false,
      });
      const reference = dom.accrueReference.value.trim();
      assert(reference.length <= 100, 'La referencia no puede superar 100 caracteres.');

      await request('/loyalty-members/accrue/', {
        method: 'POST',
        body: JSON.stringify({
          member,
          purchase_amount: purchaseAmount,
          source_reference: reference,
        }),
      });
      await loadProgramOperationalData();
      dom.accrueForm.reset();
      notify('Acumulación registrada.', 'success');
    } catch (error) {
      notify(error.message, 'error');
    }
  });

  dom.redeemForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const member = Number(dom.redeemMember.value);
      const reward = Number(dom.redeemReward.value);
      const quantity = toPositiveNumber(dom.redeemQty.value || 1, 'Cantidad', { min: 0, max: 1000, allowZero: false });
      const reference = dom.redeemReference.value.trim();

      assert(member > 0, 'Selecciona un miembro válido para canjear.');
      assert(reward > 0, 'Selecciona una recompensa válida.');
      assert(reference.length <= 100, 'La referencia no puede superar 100 caracteres.');

      await request('/loyalty-members/redeem/', {
        method: 'POST',
        body: JSON.stringify({
          member,
          reward,
          quantity,
          source_reference: reference,
        }),
      });
      await loadProgramOperationalData();
      dom.redeemForm.reset();
      dom.redeemQty.value = '1';
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
      switchPanel('programas');
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
      switchPanel('miembros');
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
      switchPanel('miembros');
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

  switchPanel('programas');
  loadAll();
})();
