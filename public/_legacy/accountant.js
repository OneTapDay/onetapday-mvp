(() => {
  const DEFAULT_LANG = 'ru';

  const T = {
    ru: {
      title: 'Кабинет бухгалтера',
      subtitle: 'Минимальный скелет, чтобы показывать идею уже сейчас: список клиентов и быстрые запросы.',
      logout: 'Выйти',
      add_client_label: 'Добавить клиента по email',
      add: 'Добавить',
      empty: 'Пока пусто. Добавь 1–2 email клиента и покажи это бухгалтеру вживую.',
      next_title: 'Что дальше в MVP',
      next_text: '1) Клиент загружает документы в одно место (фото/файлы).\n2) Бухгалтер отмечает “ок/не хватает”.\n3) Комментарии прямо на документе.\n4) Экспорт пачкой (CSV/PDF) + напоминания.',
      req_docs: 'Запросить документы',
      remove: 'Убрать',
      need_email: 'Введи email',
      not_auth: 'Сессии нет. Верну на вход.',
      not_acc: 'Этот аккаунт не бухгалтер. Верну на вход.',
    },
    pl: {
      title: 'Panel księgowego',
      subtitle: 'Minimalny szkielet do demo: lista klientów i szybkie prośby.',
      logout: 'Wyloguj',
      add_client_label: 'Dodaj klienta po emailu',
      add: 'Dodaj',
      empty: 'Pusto. Dodaj 1–2 emaile i pokaż księgowemu na żywo.',
      next_title: 'Co dalej w MVP',
      next_text: '1) Klient wrzuca dokumenty w jedno miejsce.\n2) Księgowy oznacza “ok/brakuje”.\n3) Komentarze na dokumencie.\n4) Eksport (CSV/PDF) + przypomnienia.',
      req_docs: 'Poproś o dokumenty',
      remove: 'Usuń',
      need_email: 'Wpisz email',
      not_auth: 'Brak sesji. Cofam do logowania.',
      not_acc: 'To nie konto księgowego. Cofam do logowania.',
    },
    en: {
      title: 'Accountant portal',
      subtitle: 'Minimal skeleton for demo: clients list and quick requests.',
      logout: 'Logout',
      add_client_label: 'Add client by email',
      add: 'Add',
      empty: 'Empty. Add 1–2 client emails and demo it live.',
      next_title: 'Next in MVP',
      next_text: '1) Client uploads documents to one place.\n2) Accountant marks “ok/missing”.\n3) Comments on the document.\n4) Bulk export (CSV/PDF) + reminders.',
      req_docs: 'Request docs',
      remove: 'Remove',
      need_email: 'Enter an email',
      not_auth: 'No session. Redirecting to login.',
      not_acc: 'Not an accountant account. Redirecting to login.',
    },
    uk: {
      title: 'Кабінет бухгалтера',
      subtitle: 'Мінімальний скелет для демо: список клієнтів і швидкі запити.',
      logout: 'Вийти',
      add_client_label: 'Додати клієнта по email',
      add: 'Додати',
      empty: 'Поки порожньо. Додай 1–2 email і покажи це наживо.',
      next_title: 'Що далі в MVP',
      next_text: '1) Клієнт завантажує документи в одне місце.\n2) Бухгалтер відмічає “ок/не вистачає”.\n3) Коментарі на документі.\n4) Експорт (CSV/PDF) + нагадування.',
      req_docs: 'Запросити документи',
      remove: 'Прибрати',
      need_email: 'Введи email',
      not_auth: 'Сесії немає. Повертаю на вхід.',
      not_acc: 'Це не бухгалтерський акаунт. Повертаю на вхід.',
    },
  };

  const $ = (id) => document.getElementById(id);

  function getLang() {
    return localStorage.getItem('otd_lang') || DEFAULT_LANG;
  }

  function applyLang(lang) {
    const dict = T[lang] || T[DEFAULT_LANG];
    document.querySelectorAll('[data-i]').forEach((el) => {
      const k = el.getAttribute('data-i');
      if (dict[k]) {
        if (k === 'next_text') {
          // allow line breaks
          el.innerHTML = dict[k].replace(/\n/g, '<br/>');
        } else {
          el.textContent = dict[k];
        }
      }
    });
    document.querySelectorAll('#langBar button').forEach((btn) =>
      btn.classList.toggle('on', btn.dataset.lang === lang)
    );
    localStorage.setItem('otd_lang', lang);
  }

  function sanitizeRole(role) {
    return role === 'accountant' ? 'accountant' : 'business';
  }

  function loadClients() {
    try {
      const raw = localStorage.getItem('otd_acc_clients');
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveClients(arr) {
    localStorage.setItem('otd_acc_clients', JSON.stringify(arr || []));
  }

  function renderClients(lang) {
    const dict = T[lang] || T[DEFAULT_LANG];
    const list = $('clientsList');
    const empty = $('emptyState');
    if (!list) return;
    const clients = loadClients();
    list.innerHTML = '';
    if (empty) empty.style.display = clients.length ? 'none' : 'block';

    clients.forEach((email) => {
      const row = document.createElement('div');
      row.className = 'item';
      row.innerHTML = `
        <div class="meta">
          <div class="email">${email}</div>
          <div class="note">${dict.req_docs} (stub)</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn ghost" data-act="req" data-email="${email}">${dict.req_docs}</button>
          <button class="btn ghost" data-act="rm" data-email="${email}">${dict.remove}</button>
        </div>
      `;
      list.appendChild(row);
    });
  }

  async function getMe() {
    const r = await fetch('/me', { credentials: 'include' });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, body: j };
  }

  async function post(path) {
    const r = await fetch(path, { method: 'POST', credentials: 'include' });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, body: j };
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const lang = getLang();
    applyLang(lang);
    document.querySelectorAll('#langBar button').forEach((b) =>
      b.addEventListener('click', () => {
        applyLang(b.dataset.lang);
        renderClients(b.dataset.lang);
      })
    );

    // auth gate
    const me = await getMe().catch(() => ({ ok: false }));
    const dict = T[lang] || T[DEFAULT_LANG];
    if (!me.ok || !me.body || !me.body.user) {
      alert(dict.not_auth);
      window.location.href = '/';
      return;
    }
    const role = sanitizeRole(me.body.user.role);
    if (role !== 'accountant') {
      alert(dict.not_acc);
      window.location.href = '/';
      return;
    }

    // header tag
    const meTag = $('meTag');
    if (meTag) meTag.textContent = `${me.body.user.email || ''} • accountant`;

    // logout
    const logout = $('logout');
    if (logout)
      logout.addEventListener('click', async () => {
        await post('/logout').catch(() => null);
        localStorage.removeItem('otd_user');
        window.location.href = '/';
      });

    // add client
    const addBtn = $('addClient');
    const input = $('clientEmail');
    if (addBtn)
      addBtn.addEventListener('click', () => {
        const val = (input && input.value ? input.value.trim().toLowerCase() : '');
        if (!val) return alert(dict.need_email);
        const arr = loadClients();
        if (!arr.includes(val)) arr.unshift(val);
        saveClients(arr.slice(0, 50));
        if (input) input.value = '';
        renderClients(getLang());
      });

    // list actions (stubs)
    const list = $('clientsList');
    if (list)
      list.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest && e.target.closest('button');
        if (!btn) return;
        const act = btn.getAttribute('data-act');
        const email = btn.getAttribute('data-email');
        if (!act || !email) return;
        if (act === 'rm') {
          const arr = loadClients().filter((x) => x !== email);
          saveClients(arr);
          renderClients(getLang());
          return;
        }
        if (act === 'req') {
          alert(dict.req_docs + ': ' + email + '\n(пока заглушка, без backend)');
        }
      });

    renderClients(lang);
  });
})();
