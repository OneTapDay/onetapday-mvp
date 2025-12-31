// Extracted from public/js/app/app.js (lines 3606-4102)
/* ==== P0 RELIABILITY: namespaced localStorage + safe JSON backup ==== */
function _otdSafeEmailKey(email){
  return String(email||'').trim().toLowerCase().replace(/[^a-z0-9@.]/g,'_').slice(0,120);
}
function _otdWsIdStorageKey(){
  const email = localStorage.getItem(USER_KEY) || '';
  const safe = _otdSafeEmailKey(email);
  return safe ? ('otd_ws_id::' + safe) : 'otd_ws_id';
}
function _otdGetWsId(){
  try { return localStorage.getItem(_otdWsIdStorageKey()) || ''; } catch(e){ return ''; }
}
function _otdSetWsId(id){
  try { localStorage.setItem(_otdWsIdStorageKey(), String(id||'')); } catch(e){}
}
function _otdIsWorkspaceScopedKey(baseKey){
  // Workspace-scoped means: should be separated between accounts/clients.
  // Keep this list small and safe; add more when you’re ready.
  const k = String(baseKey || '');
  return k === 'kasa'
    || k === 'tx_manual_import'
    || k === 'bills_manual_import'
    || k === 'accMeta'
    || k === 'invoice_templates'
    || k === 'inventory_templates';
}
function _otdDataKey(baseKey){
  // data keys must be per-user to avoid cross-account mixing;
  // and (for workspace-scoped keys) per-account/client to avoid cross-client mixing.
  const email = localStorage.getItem(USER_KEY) || '';
  const safe = _otdSafeEmailKey(email);
  if(!safe) return baseKey; // guest falls back to legacy key

  if (_otdIsWorkspaceScopedKey(baseKey)) {
    const wsId = _otdGetWsId() || 'ws_default';
    return baseKey + '::' + safe + '::' + wsId;
  }

  return baseKey + '::' + safe;
}
function _otdGetJSON(baseKey, defVal){
  const key = _otdDataKey(baseKey);
  let raw = localStorage.getItem(key);

  // migrate legacy -> namespaced on first run (and legacy per-user -> per-workspace when needed)
  if((raw === null || raw === undefined || raw === "") && key !== baseKey){
    // 1) if this is workspace-scoped key, first try legacy per-user key (without wsId)
    const email = localStorage.getItem(USER_KEY) || '';
    const safe = _otdSafeEmailKey(email);
    if (safe && _otdIsWorkspaceScopedKey(baseKey)) {
      const legacyUserKey = baseKey + '::' + safe; // previous schema: per-user only
      const legacyUserVal = localStorage.getItem(legacyUserKey);
      if (legacyUserVal) {
        try { localStorage.setItem(key, legacyUserVal); } catch(_){}
        raw = legacyUserVal;
      }
    }

    // 2) fallback: super-legacy global key (guest schema)
    if((raw === null || raw === undefined || raw === "") ){
      const legacy = localStorage.getItem(baseKey);
      if(legacy){
        try{ localStorage.setItem(key, legacy); }catch(_){}
        raw = legacy;
      }
    }
  }

  try{
    return JSON.parse(raw || (Array.isArray(defVal)?'[]':'{}'));
  }catch(e){
    // try backup
    const bak = localStorage.getItem(key + '__bak');
    try{
      const parsed = JSON.parse(bak || (Array.isArray(defVal)?'[]':'{}'));
      try{ localStorage.setItem(key, bak); }catch(_){}
      return parsed;
    }catch(_){
      return defVal;
    }
  }
}
function _otdSetJSON(baseKey, value){
  const key = _otdDataKey(baseKey);
  try{
    const prev = localStorage.getItem(key);
    if(prev !== null && prev !== undefined){
      localStorage.setItem(key + '__bak', prev);
    }
    localStorage.setItem(key, JSON.stringify(value));
  }catch(e){
    console.warn('[otd] failed to save', baseKey, e);
  }
}
function _otdSetSchemaV(v){
  try{ localStorage.setItem(_otdDataKey('otd_schema_v'), String(v||'')); }catch(_){}
}
function _otdGetSchemaV(){
  const v = localStorage.getItem(_otdDataKey('otd_schema_v'));
  const n = parseInt(String(v||'0'), 10);
  return Number.isFinite(n) ? n : 0;
}

function loadLocal(){
  // P0: read from namespaced keys (per user), with legacy migration + backup restore
  kasa = _otdGetJSON('kasa', []);
  tx = _otdGetJSON('tx_manual_import', []);
  bills = _otdGetJSON('bills_manual_import', []);
  accMeta = _otdGetJSON('accMeta', {});
  invoiceTemplates = _otdGetJSON('invoice_templates', []);

  // schema marker for future migrations
  if(_otdGetSchemaV() < 2) _otdSetSchemaV(2);

  ensureTxIds();
  ensureKasaIds();
}

function saveLocal(){
  // P0: atomic-ish save with backups
  _otdSetJSON('kasa', kasa);
  _otdSetJSON('tx_manual_import', tx);
  _otdSetJSON('bills_manual_import', bills);
  _otdSetJSON('accMeta', accMeta);

  // NEW: обновляем облако
  pushCloudState();
}


function demoLeftMs(){
  // Prefer explicit demo-until (used by access page + server sync)
  const until = localStorage.getItem('otd_demo_until');
  if(until){
    const end = new Date(until).getTime();
    const left = end - Date.now();
    if(left > 0) return left;
  }

  // Fallback: DEMO_START + 24h (legacy)
  const t = localStorage.getItem(DEMO_START);
  if (t) {
    const start = new Date(t).getTime();
    const left  = (start + 24*3600*1000) - Date.now();
    if (left > 0) return left;
  }

  return 0;
}

function isSubActive(){
  try{
    const flag = localStorage.getItem(SUB_KEY);
    if (flag !== '1') return false;
    const to = localStorage.getItem(SUB_TO) || '';
    if (!to) return true;
    const end = new Date(to).getTime();
    if (!isFinite(end)) return true;
    return end > Date.now();
  }catch(_e){
    return false;
  }
}


function isDemoActive(){ 
  return demoLeftMs() > 0; 
}

function gateAccess(){
  const gate = $id('gate');
  const tabs = document.querySelectorAll('.tabs .tab');
  const isAdmin = localStorage.getItem('otd_isAdmin') === '1';

  if (!gate) return;

  // Админ: всегда полный доступ, без баннеров и блокировок
  if (isAdmin) {
    gate.classList.add('hidden');
    if (document && document.body) {
      document.body.classList.remove('app-locked');
    }
    tabs.forEach(t => t.classList.remove('disabled'));
    return;
  }

  // Обычные пользователи: проверяем демо / подписку
  const ok = isSubActive() || isDemoActive();

  gate.classList.toggle('hidden', ok);

  if (document && document.body) {
    document.body.classList.toggle('app-locked', !ok);
  }

  tabs.forEach(t=>{
    if (t.dataset.sec === 'ustawienia') {
      t.classList.remove('disabled');
    } else {
      t.classList.toggle('disabled', !ok);
    }
  });

  if (!ok){
    const settingsTab = document.querySelector('[data-sec=ustawienia]');
    if (settingsTab) settingsTab.click();
  }
}

function updateSubUI(){
  const box = $id('subStatus');
  if (!box) return;

  const badge = $id('subBadge');

  const lang = (localStorage.getItem('otd_lang') || 'pl').toLowerCase();
  const locale = (lang === 'uk') ? 'uk-UA' : (lang === 'ru') ? 'ru-RU' : (lang === 'en') ? 'en-US' : 'pl-PL';

  const fmtDate = (iso) => {
    try {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso).slice(0,10);
      return d.toLocaleDateString(locale, { year:'numeric', month:'2-digit', day:'2-digit' });
    } catch (e) {
      return iso ? String(iso).slice(0,10) : '—';
    }
  };

  const hasSub  = isSubActive();
  const hasDemo = isDemoActive();

  let badgeText = '—';
  let badgeClass = '';
  let mainText = '—';
  let metaText = '';

  if (hasSub) {
    const toStr = fmtDate(localStorage.getItem(SUB_TO));
    badgeText = TT('sub.badge_active', null, 'ACTIVE');
    badgeClass = 'ok';
    mainText = TT('sub.status_active', { to: toStr }, `Active until ${toStr}`);
    metaText = '';
  } else if (hasDemo) {
    // Demo access: show until date if available
    let endMs = 0;
    const raw = (localStorage.getItem('otd_demo_until') || '').trim();
    if (raw) {
      const n = Number(raw);
      if (!isNaN(n)) endMs = n;
      else {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) endMs = d.getTime();
      }
    }
    if (!endMs) {
      const t = localStorage.getItem(DEMO_START);
      if (t) {
        const start = new Date(t).getTime();
        if (isFinite(start)) endMs = start + 24*3600*1000;
      }
    }

    const toStr = endMs ? fmtDate(new Date(endMs).toISOString()) : '—';
    badgeText = TT('sub.badge_demo', null, 'DEMO');
    badgeClass = 'warn';

    if (toStr && toStr !== '—') {
      mainText = TT('sub.status_demo_until', { to: toStr }, `Demo active until ${toStr}`);
    } else {
      mainText = TT('sub.status_demo', { hours: Math.max(1, Math.ceil(demoLeftMs() / 3600000)) }, 'Demo');
    }
    metaText = '';
  } else {
    badgeText = TT('sub.badge_inactive', null, 'LOCKED');
    badgeClass = 'bad';
    mainText = TT('sub.status_locked', null, TT('sub.status_no_access', null, 'Access locked'));
    metaText = '';
  }

  // Ensure structure exists
  let mainEl = box.querySelector('.subStatusMain');
  let metaEl = box.querySelector('.subStatusMeta');
  if (!mainEl || !metaEl) {
    box.innerHTML = '<div class="subStatusMain"></div><div class="subStatusMeta"></div>';
    mainEl = box.querySelector('.subStatusMain');
    metaEl = box.querySelector('.subStatusMeta');
  }

  if (mainEl) mainEl.textContent = mainText;
  if (metaEl) {
    metaEl.textContent = metaText;
    metaEl.style.display = metaText ? 'block' : 'none';
  }

  box.classList.remove('ok','warn','bad');
  if (badgeClass) box.classList.add(badgeClass);
  box.dataset.state = hasSub ? 'active' : hasDemo ? 'demo' : 'locked';

  if (badge) {
    badge.textContent = badgeText;
    badge.classList.remove('ok','warn','bad');
    if (badgeClass) badge.classList.add(badgeClass);
  }

  // Sync language bar highlight (it was confusing for humans)
  try {
    const bar = $id('langBarMain');
    if (bar) {
      bar.querySelectorAll('button[data-lang]').forEach(btn => {
        btn.classList.toggle('on', (btn.dataset.lang || '').toLowerCase() === lang);
      });
    }
  } catch(_e){}
}

try{ document.addEventListener('otd:lang', ()=>{ try{ updateSubUI(); }catch(_e){} }); }catch(_e){}

// Subscription UI (Settings): plan cards + Stripe redirect
(function(){
  async function getStripeConfig(){
    try{
      const r = await fetch('/stripe-config', { credentials: 'include' });
      if (!r.ok) return null;
      return await r.json();
    }catch(_e){
      return null;
    }
  }

  const __subEnabled = { monthly: true, m6: true, yearly: true };

  function setEnabled(cardId, enabled){
    const card = document.getElementById(cardId);
    if (!card) return;

    const plan = (card.getAttribute('data-plan') || '').toLowerCase();
    const k = (plan === '6m') ? 'm6' : plan;
    if (k) __subEnabled[k] = !!enabled;

    card.dataset.enabled = enabled ? '1' : '0';

    const btn = card.querySelector('.subBuyBtn');
    if (btn){
      // Always clickable in MVP (even if Stripe isn't configured yet)
      btn.disabled = false;
      btn.setAttribute('data-i18n', 'sub.select');
      if (window.i18n && typeof window.i18n.apply === 'function') window.i18n.apply();
    }
    card.classList.toggle('disabled', !enabled);
  }


  async function startCheckout(plan){
    const p = plan || 'monthly';

    // Optional per-plan direct links (handy for quick MVP):
    // localStorage.stripe_link (legacy) for monthly,
    // localStorage.stripe_link_6m / stripe_link_yearly for others.
    const legacyKey = (p === 'monthly') ? 'stripe_link' : `stripe_link_${p}`;
    const direct = (localStorage.getItem(legacyKey) || '').trim();
    if (direct && /^https?:\/\//i.test(direct)){
      window.location.href = direct;
      return;
    }

    let js = null;
    let resp = null;
    try{
      resp = await fetch('/create-checkout-session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: p })
      });
      js = await resp.json().catch(()=>null);
    }catch(e){
      alert(TT('sub.pay_error', null, 'Stripe error'));
      return;
    }

    if (resp && resp.status === 401){
      alert(TT('sub.login_required', null, 'Please login first'));
      return;
    }

    const url = js && (js.sessionUrl || js.url);
    if (resp && resp.ok && url){
      window.location.href = url;
      return;
    }

    const msg = (js && (js.error || js.message)) ? (js.error || js.message) : TT('sub.pay_error', null, 'Stripe error');
    alert(msg);
  }

  async function handlePlan(plan){
    const p = (plan || 'monthly').toLowerCase();
    const k = (p === '6m') ? 'm6' : p;

    if (__subEnabled[k] === false){
      alert(TT('sub.plan_not_available', null, 'Plan is not available yet'));
      return;
    }
    await startCheckout(p);
  }

  function bindCards(){
    const cards = document.querySelectorAll('#subPlansGrid .planCard');
    cards.forEach((card)=>{
      if (card.__otd_bound) return;
      card.__otd_bound = true;

      card.addEventListener('click', (e)=>{
        // Let buttons handle their own clicks
        const t = e && e.target;
        if (t && t.closest && t.closest('button')) return;

        const plan = card.getAttribute('data-plan') || 'monthly';
        handlePlan(plan);
      });
    });
  }

  function bindButtons(){
    const buttons = document.querySelectorAll('.subBuyBtn');
    buttons.forEach((btn)=>{
      if (btn.__otd_bound) return;
      btn.__otd_bound = true;
      btn.addEventListener('click', (e)=>{
        e.preventDefault();
        const plan = btn.getAttribute('data-plan') || 'monthly';
        handlePlan(plan);
      });
    });
  }

  function _normPlan(v){
    if (v && typeof v === 'object') return v;
    return { enabled: !!v };
  }

  function applyPrices(cfg){
    // Prices are fixed in UI/i18n for now (avoid mismatch if Stripe is not configured yet).
    // We only use Stripe config to enable/disable plan buttons.
  }

  function bindTogglePlans(){
    const btn  = document.getElementById('subTogglePlans');
    const wrap = document.getElementById('subPlansWrap');
    if (!btn || !wrap) return;

    const syncLabel = () => {
      btn.setAttribute('data-i18n', wrap.classList.contains('hidden') ? 'sub.choose_plan' : 'sub.hide_plans');
      if (window.i18n && typeof window.i18n.apply === 'function') window.i18n.apply();
    };

    if (!btn.__otd_bound){
      btn.__otd_bound = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        wrap.classList.toggle('hidden');
        syncLabel();
      });
    }

    syncLabel();
  }

  async function init(){
    bindButtons();
    bindCards();
    bindTogglePlans();

    const cfg = await getStripeConfig();
    if (cfg && cfg.plans){
      const p = cfg.plans || {};
      const m  = _normPlan(p.monthly);
      const m6 = _normPlan(p.m6);
      const y  = _normPlan(p.yearly);

      setEnabled('planMonthly', !!m.enabled);
      setEnabled('plan6m', !!m6.enabled);
      setEnabled('planYearly', !!y.enabled);

      applyPrices(cfg);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();





