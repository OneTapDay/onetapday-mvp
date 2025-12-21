// public/main.js
(() => {
  // минимальная i18n для страницы доступа
  const DEFAULT_LANG = 'ru';
  const T = {
    ru: {
      access_title: 'Доступ к MVP',
      access_note: 'Оплата даёт мгновенный доступ. Демо — 24 часа.',
      after_login_hint: 'После входа можно оплатить или включить демо.',
      status_title: 'Статус',
      status_guest: 'Гость — войдите или зарегистрируйтесь.',
      demo_24: 'Демо 24 часа',
      stripe_2m: 'Оплатить (Stripe)',
      login_tab: 'Вход',
      reg_tab: 'Регистрация'
    },
    pl: {
      access_title: 'Dostęp do MVP',
      access_note: 'Płatność daje natychmiastowy dostęp. Demo — 24h.',
      after_login_hint: 'Po zalogowaniu możesz zapłacić lub włączyć demo.',
      status_title: 'Status',
      status_guest: 'Gość — zaloguj się lub zarejestruj.',
      demo_24: 'Demo 24h',
      stripe_2m: 'Opłać (Stripe)',
      login_tab: 'Logowanie',
      reg_tab: 'Rejestracja'
    },
    en: {
      access_title: 'Access to MVP',
      access_note: 'Payment gives instant access. Demo lasts 24 hours.',
      after_login_hint: 'After login you can pay or start a demo.',
      status_title: 'Status',
      status_guest: 'Guest — log in or sign up.',
      demo_24: '24-hour demo',
      stripe_2m: 'Pay for (Stripe)',
      login_tab: 'Login',
      reg_tab: 'Sign up'
    },
    uk: {
      access_title: 'Доступ до MVP',
      access_note: 'Оплата дає миттєвий доступ. Демо — 24 години.',
      after_login_hint: 'Після входу можна оплатити або ввімкнути демо.',
      status_title: 'Статус',
      status_guest: 'Гість — увійдіть або зареєструйтесь.',
      demo_24: 'Демо 24 години',
      stripe_2m: 'Оплатити (Stripe)',
      login_tab: 'Вхід',
      reg_tab: 'Реєстрація'
    }
  };

  const apiBase = ''; // same origin

    const SUB_KEY       = 'otd_sub_active';
  const SUB_FROM_KEY  = 'otd_sub_from';
  const SUB_TO_KEY    = 'otd_sub_to';
  const DEMO_START_KEY = 'otd_demo_started_at';
  const DEMO_USED_KEY  = 'otd_demo_used';

  const $ = id => document.getElementById(id);

  // simple GET wrapper
  async function getJSON(path){
    try {
      const r = await fetch((apiBase||'') + path, { credentials:'include' });
      let parsed;
      try { parsed = await r.json(); } catch(e) { parsed = { _raw: await r.text().catch(()=>'') }; }
      return { ok: r.ok, status: r.status, body: parsed };
    } catch(e){ return { ok:false, status:0, body: String(e) }; }
  }

  // Universal POST wrapper (cookies included)
  async function postJSON(path, body = {}) {
    try {
      const r = await fetch((apiBase||'') + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body || {})
      });
      let parsed;
      try { parsed = await r.json(); } catch(e) { parsed = { _raw: await r.text().catch(()=>'') }; }
      return { ok: r.ok, status: r.status, body: parsed };
    } catch (err) {
      return { ok: false, status: 0, body: { error: String(err) } };
    }
  }

  function applyLang(lang) {
    const dict = T[lang] || T[DEFAULT_LANG];
    document.querySelectorAll('[data-i]').forEach(el => {
      const k = el.getAttribute('data-i');
      if (dict[k]) el.textContent = dict[k];
    });
    document.querySelectorAll('.tabs button').forEach(b=>{
      if (b.dataset.tab === 'login') b.textContent = dict.login_tab;
      if (b.dataset.tab === 'reg') b.textContent = dict.reg_tab;
    });
    document.querySelectorAll('#langBar button').forEach(btn=>btn.classList.toggle('on', btn.dataset.lang === lang));
    localStorage.setItem('otd_lang', lang);
  }

  // --- canonical keys and normalization helpers ---
  const TX_KEYS = {
    date: "Data księgowania",
    id: "ID transakcji",
    account: "ID konta",
    counterparty: "Kontrahent",
    desc: "Tytuł/Opis",
    amount: "Kwota",
    currency: "Waluta",
    status: "Status transakcji",
    balance: "Saldo po operacji"
  };
  const BILL_KEYS = {
    due: "Termin płatności",
    number: "Numer faktury",
    supplier: "Dostawca",
    amount: "Kwota do zapłaty",
    currency: "Waluta",
    status: "Status faktury",
    candidate: "Kandidat (AI)",
    score: "AI score"
  };

  function mapRowToTx(row) {
    const out = {};
    // try common headers
    out[TX_KEYS.date] = row[TX_KEYS.date] || row['date'] || row['Дата'] || row['Data'] || row['data'] || '';
    out[TX_KEYS.id] = row[TX_KEYS.id] || row['ID transakcji'] || row['id'] || row['transaction_id'] || ('TX-' + Date.now() + '-' + Math.floor(Math.random()*1000));
    out[TX_KEYS.account] = row[TX_KEYS.account] || row['ID konta'] || row['IBAN'] || row['account'] || 'UNKNOWN';
    out[TX_KEYS.counterparty] = row[TX_KEYS.counterparty] || row['Kontrahent'] || row['counterparty'] || row['Kontrahent'] || '';
    out[TX_KEYS.desc] = row[TX_KEYS.desc] || row['Tytuł/Opis'] || row['Opis operacji'] || row['desc'] || row['Описание'] || '';
    // normalize amount (remove non-numeric except minus and dot/comma)
    let rawAmt = (row[TX_KEYS.amount] || row['Kwota'] || row['amount'] || row['Kwота'] || '').toString();
    rawAmt = rawAmt.replace(/\s/g, '').replace(/,/g, '.').replace(/[^\d\.\-]/g, '');
    out[TX_KEYS.amount] = rawAmt === '' ? '' : rawAmt;
    out[TX_KEYS.currency] = (row[TX_KEYS.currency] || row['Waluta'] || row['currency'] || 'PLN').toString().toUpperCase() || 'PLN';
    out[TX_KEYS.status] = row[TX_KEYS.status] || row['Status transakcji'] || row['status'] || 'imported';
    out[TX_KEYS.balance] = row[TX_KEYS.balance] || row['Saldo po operacji'] || row['balance'] || '';
    return out;
  }
  function mapRowToBill(row) {
    const out = {};
    out[BILL_KEYS.due] = row[BILL_KEYS.due] || row['Termin płatności'] || row['due'] || row['data'] || '';
    out[BILL_KEYS.number] = row[BILL_KEYS.number] || row['Numer faktury'] || row['invoice'] || '';
    let rawAmt = (row[BILL_KEYS.amount] || row['Kwota do zapłaty'] || row['amount'] || '').toString();
    rawAmt = rawAmt.replace(/\s/g, '').replace(/,/g, '.').replace(/[^\d\.\-]/g, '');
    out[BILL_KEYS.amount] = rawAmt === '' ? '' : rawAmt;
    out[BILL_KEYS.currency] = (row[BILL_KEYS.currency] || row['Waluta'] || row['currency'] || 'PLN').toString().toUpperCase() || 'PLN';
    out[BILL_KEYS.supplier] = row[BILL_KEYS.supplier] || row['Dostawca'] || row['supplier'] || '';
    out[BILL_KEYS.status] = row[BILL_KEYS.status] || row['Status faktury'] || row['status'] || 'do zapłaty';
    out[BILL_KEYS.candidate] = row[BILL_KEYS.candidate] || '';
    out[BILL_KEYS.score] = row[BILL_KEYS.score] || '';
    return out;
  }

  function normalizeTxArray(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(r => mapRowToTx(r));
  }
  function normalizeBillsArray(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(r => mapRowToBill(r));
  }

  // --- per-user localStorage helpers ---
  function _currentUserEmail() {
    const e = localStorage.getItem('otd_user') || '';
    return (e && typeof e === 'string') ? e.toLowerCase() : '';
  }
  function _localKeyForUser(email) {
    if (!email) return 'otd_app_state_guest';
    return 'otd_app_state_' + email.replace(/[^a-z0-9@.]/g,'_');
  }

  function readLocalState() {
    try {
      const email = _currentUserEmail();
      const key = _localKeyForUser(email);
      const raw = localStorage.getItem(key) || '{}';
      return JSON.parse(raw || '{}') || {};
    } catch (e) { return {}; }
  }
  function writeLocalState(state) {
    try {
      const email = _currentUserEmail();
      const key = _localKeyForUser(email);
      localStorage.setItem(key, JSON.stringify(state || {}));
    } catch (e) {}
  }

  // push incoming local state to server (merge endpoint)
  async function pushLocalStateToServer() {
    const email = _currentUserEmail();
    if (!email) return { ok:false, error: 'no user' };
    const state = readLocalState();
    try {
      const r = await postJSON('/app-state/merge', { state });
      return r;
    } catch (e) { return { ok:false, error: String(e) }; }
  }

  // pull server state and merge into local; then persist merged state locally and to server
  async function syncStateFromServerToLocal() {
    const r = await getJSON('/app-state');
    if (!r.ok) return r;
    const remote = r.body && r.body.state;
    if (!remote) return { ok:true };
    const local = readLocalState() || {};
    // merge transactions by id
    if (Array.isArray(remote.transactions)) {
      const map = {};
      (local.transactions||[]).forEach(t=>{ if(t && t.id) map[t.id]=t; });
      remote.transactions.forEach(t=>{ if(t && t.id) map[t.id]=t; });
      local.transactions = Object.values(map);
    }
    // copy other keys from remote (override)
    Object.keys(remote).forEach(k => { if (k !== 'transactions') local[k] = remote[k]; });
    writeLocalState(local);
    // push merged back (best effort)
    await postJSON('/app-state', { state: local });
    return { ok:true };
  }

  // Demo timer
  let demoTimerInterval = null;
  function startDemoCountdown(untilTimestamp){
    clearInterval(demoTimerInterval);
    if (!untilTimestamp) return;
    let until = (typeof untilTimestamp === 'number') ? untilTimestamp : Date.parse(String(untilTimestamp));
    if (!until || isNaN(until)) until = Date.now() + 24*60*60*1000;
    localStorage.setItem('otd_demo_until', String(until));
    updateDemoUI(until);
    demoTimerInterval = setInterval(()=>updateDemoUI(until), 1000);
  }
  function stopDemoCountdown(){
    clearInterval(demoTimerInterval);
    localStorage.removeItem('otd_demo_until');
    const lang = localStorage.getItem('otd_lang') || DEFAULT_LANG;
    if ($('statusText')) $('statusText').textContent = T[lang].status_guest || 'No access';
  }
  function updateDemoUI(until){
    const now = Date.now();
    const diff = until - now;
    if (diff <= 0) { stopDemoCountdown(); return; }
    const hours = Math.floor(diff/3600000);
    const mins = Math.floor((diff%3600000)/60000);
    const secs = Math.floor((diff%60000)/1000);
    const hh = String(hours).padStart(2,'0'), mm = String(mins).padStart(2,'0'), ss = String(secs).padStart(2,'0');
    const lang = localStorage.getItem('otd_lang') || DEFAULT_LANG;
    if ($('statusText')) $('statusText').textContent = `${localStorage.getItem('otd_user')||'User'} — DEMO ${hh}:${mm}:${ss} (оплатить)`;
  }

 
  // Try start demo: /start-demo preferred, fallback /demo
  async function tryStartDemo(){
    const email = localStorage.getItem('otd_user') || '';
    if (!email) {
      return { ok:false, status:401, body:{ error:'no_user' } };
    }

    // демо уже использовано — второй раз не даём
    if (localStorage.getItem(DEMO_USED_KEY) === '1') {
      return { ok:false, status:403, body:{ error:'demo_used' } };
    }

    // 1) /start-demo (authenticated)
    let resp = await postJSON('/start-demo', {});
    if (resp.ok && resp.body && (resp.body.demoUntil || resp.body.demo_until || resp.body.success)) {
      const untilRaw = resp.body.demoUntil || resp.body.demo_until || resp.body.demoUntilISO || null;
      const ts = untilRaw
        ? (isNaN(Number(untilRaw)) ? Date.parse(String(untilRaw)) : Number(untilRaw))
        : (Date.now() + 24*60*60*1000);

      // фиксируем демо как "один раз" и старт для app.html
      localStorage.setItem(DEMO_START_KEY, new Date().toISOString());
      localStorage.setItem(DEMO_USED_KEY, '1');

      startDemoCountdown(ts);
      // merge server state after starting demo
      await syncStateFromServerToLocal().catch(()=>null);
      return { ok: true, status: 200, body: resp.body };
    }

    // 2) fallback /demo (server may not have)
    resp = await postJSON('/demo', {});
    if (resp.ok && resp.body && (resp.body.demo_until || resp.body.demoUntil || resp.body.success)) {
      const untilRaw = resp.body.demo_until || resp.body.demoUntil || null;
      const ts = untilRaw
        ? (isNaN(Number(untilRaw)) ? Date.parse(String(untilRaw)) : Number(untilRaw))
        : (Date.now() + 24*60*60*1000);

      localStorage.setItem(DEMO_START_KEY, new Date().toISOString());
      localStorage.setItem(DEMO_USED_KEY, '1');

      startDemoCountdown(ts);
      await syncStateFromServerToLocal().catch(()=>null);
      return { ok: true, status: 200, body: resp.body };
    }

    return { ok:false, status: resp.status, body: resp.body };
  }


  document.addEventListener('DOMContentLoaded', () => {
    // initial language
    applyLang(localStorage.getItem('otd_lang') || DEFAULT_LANG);
    document.querySelectorAll('#langBar button').forEach(b => b.addEventListener('click', ()=>applyLang(b.dataset.lang)));
    document.querySelectorAll('.tabs button').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('on'));
        btn.classList.add('on');
        applyLang(localStorage.getItem('otd_lang') || DEFAULT_LANG);
      });
    });

    const emailEl = $('email'), passEl = $('pass'), loginBtn = $('doLogin'), doPayBtn = $('doPay'), stripeBtn = $('payStripe'), demoBtn = $('demoBtn');

    // Registration / Login
    if (loginBtn) loginBtn.addEventListener('click', async ()=>{
      const email = (emailEl && emailEl.value||'').trim(), pass = passEl && passEl.value || '';
      if (!email || !pass) return alert('Введите email и пароль');

      const activeTab = document.querySelector('.tabs button.on');
      const isReg = activeTab && activeTab.dataset.tab === 'reg';
      const endpoint = isReg ? '/register' : '/login';

      const resp = await postJSON(endpoint, { email, password: pass });
      if (!resp.ok) {
        const err = (resp.body && (resp.body.error || resp.body.message || JSON.stringify(resp.body))) || `HTTP ${resp.status}`;
        return alert('Ошибка: ' + err);
      }

      const data = resp.body;
      const user = data && (data.user || data);
      if (user && user.email) localStorage.setItem('otd_user', user.email);
      
      // Демо теперь активируется автоматически при первом логине на сервере
      // Обновляем локальное состояние демо из ответа сервера
      if (user && user.endAt && user.status === 'active') {
        const demoUntil = new Date(user.endAt).getTime();
        localStorage.setItem(DEMO_START_KEY, user.startAt || new Date().toISOString());
        localStorage.setItem(DEMO_USED_KEY, user.demoUsed ? '1' : '0');
        if (demoUntil > Date.now()) {
          startDemoCountdown(demoUntil);
        }
      }
      
      if (typeof setStatusAfterAuth === 'function') setStatusAfterAuth(user);

      // Sync server state into local after successful auth
      await syncStateFromServerToLocal().catch(()=>null);

      if (isReg) {
        // При регистрации демо активируется автоматически при первом логине
        // Просто перенаправляем на app.html
        alert('Регистрация прошла успешно. Демо активируется автоматически при первом входе.');
        setTimeout(()=>{ window.location.href = '/app.html'; }, 300);
      } else {
        // При логине демо уже активировано автоматически (если еще не использовано)
        if (user && user.status === 'active' && user.endAt) {
          const demoUntil = new Date(user.endAt).getTime();
          if (demoUntil > Date.now()) {
            alert('Вход успешен. Демо активно до ' + new Date(demoUntil).toLocaleString());
          } else {
            alert('Вход успешен. Демо истекло.');
          }
        } else {
          alert('Вход успешен');
        }
        setTimeout(()=>{ window.location.href = '/app.html'; }, 300);
      }
    });

    // Demo button manual
       
    if (demoBtn) demoBtn.addEventListener('click', async ()=>{
      const md = await tryStartDemo();
      if (md.ok) {
        alert('Демо активировано — 24 часа');
      } else if (md.status === 401) {
        alert('Сначала войдите в систему.');
      } else if (md.status === 403 && md.body && md.body.error === 'demo_used') {
        alert('Демо уже было использовано. Доступ только по оплате.');
      } else {
        alert('Не удалось включить демо. Посмотри логи.');
      }
    });


    // Stripe
    if (stripeBtn) stripeBtn.addEventListener('click', async (e)=>{
      e.preventDefault();
      const resp = await postJSON('/create-checkout-session', {});
      if (!resp.ok) {
        const err = (resp.body && (resp.body.error || JSON.stringify(resp.body))) || `HTTP ${resp.status}`;
        return alert('Ошибка платежа: ' + err);
      }
      const body = resp.body || {};
      const redirect = body.url || body.sessionUrl || (body.session && body.session.url);
      if (redirect) { window.location.href = redirect; return; }
      alert('Неожиданный ответ сервера платежа: ' + JSON.stringify(body));
    });

    if (doPayBtn) doPayBtn.addEventListener('click', ()=>{ stripeBtn && stripeBtn.scrollIntoView({behavior:'smooth', block:'center'}); });

    // restore demo timer if present (local only)
    const savedUntil = localStorage.getItem('otd_demo_until');
    if (savedUntil) {
      const n = Number(savedUntil);
      if (n && !isNaN(n)) startDemoCountdown(n);
      else startDemoCountdown(savedUntil);
    }

    // finalize stripe session_id return (if present)
    (async ()=>{
      try {
        const params = new URLSearchParams(location.search);
        const sid = params.get('session_id');
        if (!sid) return;
        // call /session to finalize and set cookie if possible
        await fetch('/session?session_id=' + encodeURIComponent(sid), { credentials: 'include' });
        setTimeout(()=> location.href = location.pathname, 900);
      } catch(e){ console.warn('session finalize failed', e); }
    })();

    // whoami + sync
    (async ()=>{
      try {
        const saved = localStorage.getItem('otd_user') || '';
        if (!saved) return;
        const r = await fetch('/user?email=' + encodeURIComponent(saved), { credentials:'include' });
        if (r.ok){ const j = await r.json().catch(()=>null); if (j && j.user) {
          setStatusAfterAuth(j.user);
          // pull server state into local upon page load
          await syncStateFromServerToLocal().catch(()=>null);
        } }
      } catch(e){}
    })();

    // helper to update UI after auth; keep simple
    // helper to update UI after auth; привязываем статус к локальным ключам подписки
    window.setStatusAfterAuth = function(user){
      const lang    = localStorage.getItem('otd_lang') || DEFAULT_LANG;
      const statusEl = $('statusText');
      const payBtn   = $('payStripe');

      if (!user) {
        if (statusEl) statusEl.textContent = T[lang].status_guest || 'No access';
        return;
      }

      const email  = user.email || localStorage.getItem('otd_user') || 'User';
           const status = user.status || (user.demo_until ? 'active' : 'none');

      // считаем, что это платный / активный доступ
      const hasAccess =
        (user && user.isAdmin) ||      // админ всегда имеет доступ
        status === 'active' ||
        status === 'discount_active';


      if (hasAccess) {
                const untilRaw =
          user.sub_until ||
          user.sub_until_ts ||
          user.demo_until ||
          user.demoUntil ||
          user.endAt ||
          user.end_at ||
          null;

        let ts = null;
        if (untilRaw) {
          ts = isNaN(Number(untilRaw)) ? Date.parse(String(untilRaw)) : Number(untilRaw);
        }

        // если это админ и нет явной даты окончания — даём ему доступ на год вперёд
        if ((!ts || isNaN(ts)) && user && user.isAdmin) {
          ts = Date.now() + 365 * 24 * 3600 * 1000; // +1 год
        }


        if (ts && !isNaN(ts)) {
          // таймер на лендинге
          startDemoCountdown(ts);

          // фиксируем подписку для app.html (SUB_KEY / SUB_TO_KEY)
          localStorage.setItem(SUB_KEY, '1');
          localStorage.setItem(SUB_TO_KEY, new Date(ts).toISOString());
          if (!localStorage.getItem(SUB_FROM_KEY)) {
            localStorage.setItem(SUB_FROM_KEY, new Date().toISOString().slice(0,10));
          }

          // демо в таком случае нам больше не интересно
          localStorage.removeItem(DEMO_START_KEY);
        }

        if (statusEl) statusEl.textContent = `${email} — ${T[lang].status_active || 'Sub active'}`;
        if (payBtn)  payBtn.style.display = '';
      } else {
        if (statusEl) statusEl.textContent = `${email} — ${T[lang].status_none || 'Awaiting deposit'}`;
        if (payBtn)  payBtn.style.display = '';
      }
    };


  }); // DOMContentLoaded end

})();
