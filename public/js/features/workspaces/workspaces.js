// Extracted from public/js/app/app.js (lines 4103-4367)
/* ==== WORKSPACES (accounts / clients) ==== */
function _otdIsAccountant(){
  return (localStorage.getItem(ROLE_KEY) || '') === 'accountant';
}
function _otdStatus(){
  return localStorage.getItem(STATUS_KEY) || '';
}
function _otdIsAccountantPro(){
  const st = _otdStatus();
  return isSubActive() || st === 'acct_pro_trial' || st === 'active' || st === 'discount_active';
}
function _otdGetWorkspaces(){
  return _otdGetJSON('otd_workspaces', []);
}
function _otdSetWorkspaces(list){
  _otdSetJSON('otd_workspaces', Array.isArray(list) ? list : []);
}
function _otdEnsureWorkspaces(){
  const role = localStorage.getItem(ROLE_KEY) || 'freelance_business';
  let list = _otdGetWorkspaces();
  if (!Array.isArray(list)) list = [];

  // Only accountants have multiple client workspaces.
  if (role !== 'accountant') {
    // Collapse any legacy multi-workspace setup into a single workspace "main"
    const email = localStorage.getItem(USER_KEY) || '';
    const safe = _otdSafeEmailKey(email);
    const wsKeys = ['kasa','tx_manual_import','bills_manual_import','accMeta','invoice_templates','inventory_templates'];

    const makeWsKey = (baseKey, wsId)=>{
      if (!safe) return baseKey;
      return baseKey + '::' + safe + '::' + wsId;
    };

    const copyIfEmpty = (fromId, toId)=>{
      if (!safe) return;
      wsKeys.forEach(k=>{
        const fromK = makeWsKey(k, fromId);
        const toK = makeWsKey(k, toId);
        const fromV = localStorage.getItem(fromK);
        if (fromV == null) return;
        const toV = localStorage.getItem(toK);
        if (toV == null || toV === '' || toV === 'null' || toV === '[]' || toV === '{}') {
          try { localStorage.setItem(toK, fromV); } catch(e){}
        }
      });
    };

    const existingIds = (list || []).map(w=>w && w.id).filter(Boolean);
    if (!existingIds.includes('main')) {
      // best-effort migration from the earlier accidental "personal/business" split
      copyIfEmpty('personal', 'main');
      copyIfEmpty('business', 'main');
      list = [{ id: 'main', name: 'Основной', type: 'freelance_business' }];
      _otdSetWorkspaces(list);
    } else {
      const main = (list || []).find(w=>w && w.id==='main') || { id:'main', name:'Основной', type:'freelance_business' };
      list = [{ id: 'main', name: (main.name || 'Основной'), type: 'freelance_business' }];
      _otdSetWorkspaces(list);
    }

    _otdSetWsId('main');
    return { list, current: 'main', role };
  }

  // Accountant: client workspaces
  if (list.length === 0) {
    list = [{ id: 'c1', name: 'Клиент 1', type: 'client' }];
    _otdSetWorkspaces(list);
  }

  let cur = _otdGetWsId();
  if (!cur || !list.find(w => w && w.id === cur)) {
    cur = (list[0] && list[0].id) ? list[0].id : 'c1';
    _otdSetWsId(cur);
  }

  return { list, current: cur, role };
}


function renderWorkspaceControls(){
  const card = $id('workspaceCard');
  const sel = $id('workspaceSelect');
  const addBtn = $id('workspaceAdd');
  const rmBtn = $id('workspaceRemove');
  const title = $id('workspaceTitle');
  const desc = $id('workspaceDesc');
  const hint = $id('workspaceLimitHint');

  if (!card || !sel || !title) return;

  const { list, current, role } = _otdEnsureWorkspaces();

  // Only accountants should see/select workspaces (clients)
  if (role !== 'accountant') {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';

  const T = (key, fallback)=>{
    try{
      if (window.i18n && typeof window.i18n.t === 'function') {
        const v = window.i18n.t(key);
        if (v && v !== key) return String(v);
      }
    }catch(e){}
    return fallback;
  };

  // Fill select
  sel.innerHTML = '';
  (list || []).forEach(w => {
    if (!w || !w.id) return;
    const opt = document.createElement('option');
    opt.value = w.id;
    opt.textContent = w.name || w.id;
    if (w.id === current) opt.selected = true;
    sel.appendChild(opt);
  });

  title.textContent = T('settings.clients_title', 'Клиенты');
  if (desc) desc.textContent = T('settings.clients_desc', 'Каждый клиент = отдельный набор данных. В Trial можно вести до 3 клиентов.');
  if (addBtn) { addBtn.style.display = ''; addBtn.textContent = T('settings.btn_add_client', '+ Клиент'); }
  if (rmBtn) { rmBtn.style.display = ''; rmBtn.textContent = T('settings.btn_remove_client', 'Удалить'); rmBtn.disabled = (list || []).length <= 1; }

  if (hint) {
    if (_otdIsAccountantPro()) {
      hint.textContent = T('settings.clients_hint_pro', 'PRO: клиентов без лимита.');
    } else {
      const tmpl = T('settings.clients_hint_trial', 'Trial: {n}/3 клиентов.');
      hint.textContent = tmpl.replace('{n}', String((list || []).length));
    }
  }
}


function _otdClearWorkspaceData(wsId){
  const email = localStorage.getItem(USER_KEY) || '';
  const safe = _otdSafeEmailKey(email);
  if (!safe || !wsId) return;

  const suffix = '::' + safe + '::' + wsId;
  const prefixes = [
    'kasa::',
    'tx_manual_import::',
    'bills_manual_import::',
    'accMeta::',
    'invoice_templates::',
    'inventory_templates::'
  ];

  const toDelete = [];
  for (let i=0; i<localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (!k.endsWith(suffix)) continue;
    if (prefixes.some(p => k.startsWith(p))) toDelete.push(k);
  }
  toDelete.forEach(k => { try { localStorage.removeItem(k); } catch(e) {} });
}

async function _otdStartAccountantProTrial(desiredClients){
  // PRO trial only when attempting to exceed 3 clients.
  if (!_otdIsAccountant()) return { ok:true, started:false };
  if (_otdIsAccountantPro()) return { ok:true, started:false };
  if (desiredClients <= 3) return { ok:true, started:false };

  try {
    const r = await fetch('/accountant/start-pro-trial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ clientsCount: desiredClients })
    });
    const data = await r.json().catch(()=>null);

    if (!r.ok || !data || !data.success) {
      const err = (data && (data.error || data.message)) || ('HTTP ' + r.status);
      return { ok:false, error: err };
    }

    const u = data.user || {};
    if (u.role) localStorage.setItem(ROLE_KEY, u.role);
    if (u.status) localStorage.setItem(STATUS_KEY, u.status);

    // store trial end in demo keys to reuse the existing gate
    if (u.endAt) {
      localStorage.setItem(DEMO_START, u.startAt || new Date().toISOString());
      localStorage.setItem('otd_demo_until', u.endAt);
      localStorage.setItem(DEMO_USED, '1');
    }

    gateAccess();
    updateSubUI();
    return { ok:true, started:true };
  } catch (e) {
    return { ok:false, error: String(e && e.message ? e.message : e) };
  }
}

async function _otdAddClientWorkspace(){
  const { list } = _otdEnsureWorkspaces();
  const desired = (list || []).length + 1;

  if (_otdIsAccountant() && desired > 3 && !_otdIsAccountantPro()) {
    const ok = confirm('Trial позволяет вести до 3 клиентов. Чтобы добавить ещё, включи PRO trial на 7 дней (один раз). Продолжить?');
    if (!ok) return;

    const started = await _otdStartAccountantProTrial(desired);
    if (!started.ok) {
      alert(TT('alerts.pro_trial_enable_failed', {err: (started.error || 'unknown')}, 'Не удалось включить PRO trial: {err}'));
      return;
    }
  }

  const n = (list || []).length + 1;
  let id = 'c' + n;
  while ((list || []).find(w => w && w.id === id)) {
    id = 'c' + Math.floor(Math.random() * 1000000);
  }

  list.push({ id, name: 'Клиент ' + n, type: 'client' });
  _otdSetWorkspaces(list);
  _otdSetWsId(id);

  // reload data for the new workspace
  loadLocal();
  render();
  renderWorkspaceControls();
}

function _otdRemoveCurrentWorkspace(){
  const { list, current, role } = _otdEnsureWorkspaces();
  if (role !== 'accountant') return;
  if (!current) return;
  if ((list || []).length <= 1) return alert(TT('alerts.cannot_delete_last_client', null, 'Нельзя удалить последнего клиента.'));

  const curObj = (list || []).find(w => w && w.id === current);
  const name = (curObj && curObj.name) ? curObj.name : current;

  const ok = confirm(TT("dialogs.delete_client", {name:name}, 'Удалить клиента "{name}"? Данные этого клиента будут стерты локально.'));
  if (!ok) return;

  const nextList = (list || []).filter(w => w && w.id !== current);
  _otdClearWorkspaceData(current);

  _otdSetWorkspaces(nextList);
  const nextId = (nextList[0] && nextList[0].id) ? nextList[0].id : '';
  _otdSetWsId(nextId);

  loadLocal();
  render();
  renderWorkspaceControls();
}

function _otdSwitchWorkspace(wsId){
  if (!wsId) return;
  _otdSetWsId(wsId);
  loadLocal();
  render();
  renderWorkspaceControls();
}

