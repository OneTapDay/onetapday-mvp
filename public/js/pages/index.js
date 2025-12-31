// public/js/pages/index.js
(() => {
  const DEFAULT_LANG = 'pl';

  // tiny i18n for access page (kept intentionally small)
  const STR = {
    pl: {
      access_title: 'Zaloguj się do OneTapDay',
      login_tab: 'Logowanie',
      reg_tab: 'Rejestracja',
      btn_login: 'Zaloguj',
      btn_register: 'Zarejestruj',
      role_business: 'Biznes / Freelancer',
      role_business_desc: 'Pieniądze, dokumenty, codzienna kontrola (2–3 tapnięcia dziennie).',
      role_accountant: 'Księgowy',
      role_accountant_desc: 'Klienci, prośby o dokumenty, statusy, eksport.',
      google_login: 'Zaloguj z Google',
      google_register: 'Zarejestruj z Google'
    },
    en: {
      access_title: 'Sign in to OneTapDay',
      login_tab: 'Login',
      reg_tab: 'Register',
      btn_login: 'Sign in',
      btn_register: 'Create account',
      role_business: 'Business / Freelancer',
      role_business_desc: 'Money, docs, daily control (2–3 taps/day).',
      role_accountant: 'Accountant',
      role_accountant_desc: 'Clients, doc requests, statuses, export.',
      google_login: 'Sign in with Google',
      google_register: 'Sign up with Google'
    },
    uk: {
      access_title: 'Вхід до OneTapDay',
      login_tab: 'Вхід',
      reg_tab: 'Реєстрація',
      btn_login: 'Увійти',
      btn_register: 'Зареєструватися',
      role_business: 'Бізнес / Фріланс',
      role_business_desc: 'Гроші, документи, щоденний контроль (2–3 тапи на день).',
      role_accountant: 'Бухгалтер',
      role_accountant_desc: 'Клієнти, запити документів, статуси, експорт.',
      google_login: 'Увійти через Google',
      google_register: 'Реєстрація через Google'
    },
    ru: {
      access_title: 'Вход в OneTapDay',
      login_tab: 'Вход',
      reg_tab: 'Регистрация',
      btn_login: 'Войти',
      btn_register: 'Зарегистрироваться',
      role_business: 'Бизнес / Фриланс',
      role_business_desc: 'Деньги, документы, ежедневный контроль (2–3 тапа в день).',
      role_accountant: 'Бухгалтер',
      role_accountant_desc: 'Клиенты, запросы документов, статусы, экспорт.',
      google_login: 'Войти через Google',
      google_register: 'Регистрация через Google'
    }
  };

  const $ = (id) => document.getElementById(id);

  function getLang() {
    return localStorage.getItem('otd_lang') || DEFAULT_LANG;
  }
  function setLang(lang) {
    localStorage.setItem('otd_lang', lang);
  }

  function t(key) {
    const lang = getLang();
    return (STR[lang] && STR[lang][key]) || (STR[DEFAULT_LANG] && STR[DEFAULT_LANG][key]) || key;
  }

  function applyLang(lang) {
    setLang(lang);

    // lang buttons
    document.querySelectorAll('#langBar button').forEach(b => {
      b.classList.toggle('on', b.dataset.lang === lang);
    });

    // translate elements with data-i="key"
    document.querySelectorAll('[data-i]').forEach(el => {
      const key = el.getAttribute('data-i');
      if (!key) return;
      const val = t(key);
      if (val && typeof val === 'string') el.textContent = val;
    });

    // tab titles
    const tabs = document.querySelectorAll('.tabs button');
    tabs.forEach(btn => {
      const tab = btn.dataset.tab;
      if (tab === 'login') btn.textContent = t('login_tab');
      if (tab === 'reg') btn.textContent = t('reg_tab');
    });

    // role cards
    const rb = document.querySelector('label.roleCard input[value="freelance_business"]');
    const ra = document.querySelector('label.roleCard input[value="accountant"]');
    if (rb) {
      const card = rb.closest('.roleCard');
      if (card) {
        const title = card.querySelector('.roleTitle');
        const desc = card.querySelector('.roleDesc');
        if (title) title.textContent = t('role_business');
        if (desc) desc.textContent = t('role_business_desc');
      }
    }
    if (ra) {
      const card = ra.closest('.roleCard');
      if (card) {
        const title = card.querySelector('.roleTitle');
        const desc = card.querySelector('.roleDesc');
        if (title) title.textContent = t('role_accountant');
        if (desc) desc.textContent = t('role_accountant_desc');
      }
    }

    updateRoleWrap();
  }

  function activeTab() {
    const btn = document.querySelector('.tabs button.on');
    return (btn && btn.dataset.tab) || 'login';
  }

  function selectedRole() {
    const el = document.querySelector('input[name="role"]:checked');
    return el ? el.value : 'freelance_business';
  }

  function updateRoleWrap() {
    const isReg = activeTab() === 'reg';

    const wrap = $('roleWrap');
    if (wrap) wrap.style.display = isReg ? 'block' : 'none';

    const btn = $('doLogin');
    if (btn) btn.textContent = isReg ? t('btn_register') : t('btn_login');

    // toggle Google button blocks
    const gl = $('googleLoginWrap');
    const gr = $('googleRegWrap');
    if (gl) gl.style.display = isReg ? 'none' : 'block';
    if (gr) gr.style.display = isReg ? 'block' : 'none';
  }

  // Universal POST wrapper (cookies included)
  async function postJSON(path, body = {}) {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body || {})
    });
    let parsed = null;
    try { parsed = await r.json(); } catch (e) { parsed = { raw: await r.text().catch(() => '') }; }
    return { ok: r.ok, status: r.status, body: parsed };
  }

  async function doLoginOrRegister() {
    const email = (($('email') && $('email').value) || '').trim();
    const password = (($('pass') && $('pass').value) || '');

    if (!email || !password) {
      alert(getLang() === 'pl' ? 'Podaj email i hasło' : 'Введите email и пароль');
      return;
    }

    const isReg = activeTab() === 'reg';
    if (isReg) {
      const role = selectedRole();
      const res = await postJSON('/register', { email, password, role, lang: getLang() });
      if (!res.ok || !res.body || !res.body.success) {
        alert((res.body && (res.body.error || res.body.detail)) || 'Register failed');
        return;
      }
      const u = res.body.user || { role };
      // Bind local state to the current account (fix: switching accounts on same device keeps old data)
      try {
        const newEmail = String(u.email || email || '').trim().toLowerCase();
        if (newEmail) {
          const prevEmail = String(localStorage.getItem('otd_user') || '').trim().toLowerCase();
          if (prevEmail && prevEmail !== newEmail) {
            const wipe = [
              'tx_manual_import','bills_manual_import','kasa','accMeta','invoice_templates',
              'otd_workspaces','otd_active_ws','otd_last_ws',
              'otd_demo_start','otd_demo_until','otd_demo_used',
              'otd_sub','otd_sub_from','otd_sub_to'
            ];
            wipe.forEach(k => { try { localStorage.removeItem(k); } catch(e){} });
            try { sessionStorage.removeItem('otd_me_force_sync_tried'); } catch(e){}
          }
          localStorage.setItem('otd_user', newEmail);
        }
      } catch(e){}

      localStorage.setItem('otd_role', u.role || role);
      setTimeout(() => { window.location.href = (u.role === 'accountant') ? '/accountant.html' : '/app.html'; }, 150);
    } else {
      const res = await postJSON('/login', { email, password, lang: getLang() });
      if (!res.ok || !res.body || !res.body.success) {
        alert((res.body && (res.body.error || res.body.detail)) || 'Login failed');
        return;
      }
      const u = res.body.user || {};
      // Bind local state to the current account (fix: switching accounts on same device keeps old data)
      try {
        const newEmail = String(u.email || email || '').trim().toLowerCase();
        if (newEmail) {
          const prevEmail = String(localStorage.getItem('otd_user') || '').trim().toLowerCase();
          if (prevEmail && prevEmail !== newEmail) {
            const wipe = [
              'tx_manual_import','bills_manual_import','kasa','accMeta','invoice_templates',
              'otd_workspaces','otd_active_ws','otd_last_ws',
              'otd_demo_start','otd_demo_until','otd_demo_used',
              'otd_sub','otd_sub_from','otd_sub_to'
            ];
            wipe.forEach(k => { try { localStorage.removeItem(k); } catch(e){} });
            try { sessionStorage.removeItem('otd_me_force_sync_tried'); } catch(e){}
          }
          localStorage.setItem('otd_user', newEmail);
        }
      } catch(e){}

      const role = u.role || localStorage.getItem('otd_role') || 'freelance_business';
      localStorage.setItem('otd_role', role);
      setTimeout(() => { window.location.href = (role === 'accountant') ? '/accountant.html' : '/app.html'; }, 150);
    }
  }

  // Google Sign-In
  let googleReady = false;

  function gWidth(node, fallback=340){
    try{
      const w = (node && node.getBoundingClientRect && node.getBoundingClientRect().width) ||
                (node && node.parentElement && node.parentElement.getBoundingClientRect && node.parentElement.getBoundingClientRect().width) ||
                fallback;
      return Math.max(240, Math.min(420, Math.round(w)));
    }catch(e){
      return fallback;
    }
  }

  function ensureGoogleHint(show) {
    const hint = $('googleHint');
    if (hint) hint.style.display = show ? 'block' : 'none';
  }

  async function initGoogle() {
    try {
      const cfg = await fetch('/config', { credentials: 'include' }).then(r => r.json()).catch(() => ({}));
      const clientId = (cfg && cfg.googleClientId) ? String(cfg.googleClientId) : '';
      if (!clientId) {
        // Server didn't expose GOOGLE_CLIENT_ID → show hint and keep email/password flow working
        ensureGoogleHint(true);
        const gLogin = $('googleLoginWrap'); const gReg = $('googleRegWrap');
        if (gLogin) gLogin.style.display = 'none';
        if (gReg) gReg.style.display = 'none';
        return;
      }
      if (!window.google || !google.accounts || !google.accounts.id) {
        // Script didn't load, nothing we can do here
        ensureGoogleHint(true);
        return;
      }

      google.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp) => {
          try {
            const isReg = activeTab() === 'reg';
            const payload = {
              credential: resp.credential,
              lang: getLang()
            };
            if (isReg) payload.role = selectedRole(); // only meaningful on first creation

            const r = await postJSON('/auth/google', payload);
            if (!r.ok || !r.body || !r.body.success) {
              alert((r.body && (r.body.error || r.body.detail)) || 'Google auth failed');
              return;
            }
            const u = r.body.user || {};
            // Bind local state to the current account (fix: switching accounts on same device keeps old data)
            try {
              const newEmail = String(u.email || '').trim().toLowerCase();
              if (newEmail) {
                const prevEmail = String(localStorage.getItem('otd_user') || '').trim().toLowerCase();
                if (prevEmail && prevEmail !== newEmail) {
                  const wipe = [
                    'tx_manual_import','bills_manual_import','kasa','accMeta','invoice_templates',
                    'otd_workspaces','otd_active_ws','otd_last_ws',
                    'otd_demo_start','otd_demo_until','otd_demo_used',
                    'otd_sub','otd_sub_from','otd_sub_to'
                  ];
                  wipe.forEach(k => { try { localStorage.removeItem(k); } catch(e){} });
                  try { sessionStorage.removeItem('otd_me_force_sync_tried'); } catch(e){}
                }
                localStorage.setItem('otd_user', newEmail);
              }
            } catch(e){}

            const role = u.role || localStorage.getItem('otd_role') || 'freelance_business';
            localStorage.setItem('otd_role', role);
            setTimeout(() => { window.location.href = (role === 'accountant') ? '/accountant.html' : '/app.html'; }, 150);
          } catch (e) {
            alert('Google auth failed');
          }
        }
      });

      const gLogin = $('gLoginBtn');
      const gReg = $('gRegBtn');

      if (gLogin) {
        google.accounts.id.renderButton(gLogin, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          width: gWidth(gLogin, 340)
        });
      }
      if (gReg) {
        google.accounts.id.renderButton(gReg, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          text: 'signup_with',
          shape: 'pill',
          width: gWidth(gReg, 340)
        });
      }

      googleReady = true;
      ensureGoogleHint(false);
    } catch (e) {
      ensureGoogleHint(true);
    }
  }

  function wireUI() {
    // tabs
    document.querySelectorAll('.tabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tabs button').forEach(x => x.classList.remove('on'));
        btn.classList.add('on');
        updateRoleWrap();
        // change Google button visibility
        applyLang(getLang());
      });
    });

    // main button
    const doBtn = $('doLogin');
    if (doBtn) doBtn.addEventListener('click', doLoginOrRegister);

    // Enter key
    const pass = $('pass');
    if (pass) pass.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doLoginOrRegister();
    });

    // language buttons
    document.querySelectorAll('#langBar button').forEach(b => {
      b.addEventListener('click', () => applyLang(b.dataset.lang));
    });

    // initial
    applyLang(getLang());
    updateRoleWrap();

    // init Google when script is ready
    // The GSI script is loaded async, so poll for it shortly.
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (window.google && google.accounts && google.accounts.id) {
        clearInterval(timer);
        initGoogle();
      } else if (tries > 40) {
        clearInterval(timer);
        // if server has GOOGLE_CLIENT_ID but script didn't load, hint won't help much.
      }
    }, 125);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireUI);
  } else {
    wireUI();
  }
})();
