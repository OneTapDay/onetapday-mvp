// Extracted from public/js/app/app.js (lines 5209-7316)
/* ==== EVENTS ==== */
document.addEventListener('click',(e)=>{
  const btn=e.target.closest('button'); if(!btn) return;
  const act=btn.getAttribute('data-act'); if(!act) return;
  const kind=btn.getAttribute('data-kind'), id=btn.getAttribute('data-id');

  if(act==='edit') editRow(kind,id);
  if(act==='del') delRow(kind,id);
  if(act==='cat') openCatModal(kind,id);
  if(act==='pay' && kind==='bill') markBillPaid(id);
});

// Переход к конкретному разделу
window.appGoSection = function (secId) {
  const homeEl = document.getElementById('homeScreen');
  const topBar = document.querySelector('.top');

  try {
    const sec = document.getElementById(secId);

    // Если раздела нет — не ломаем всё
    if (!sec) {
      console.warn('appGoSection: section not found:', secId);
      if (homeEl) homeEl.style.display = 'block';
      if (topBar) topBar.classList.remove('hidden');
      return;
    }

    // Прячем домашку
    if (homeEl) {
      homeEl.style.display = 'none';
    }

    // Показываем верхнюю панель
    if (topBar) {
      topBar.classList.remove('hidden');
    }

    // Скрываем все разделы
    document.querySelectorAll('.section').forEach(s => {
      s.classList.remove('active');
      s.style.display = 'none';
    });

    // Включаем нужный
    sec.classList.add('active');
    sec.style.display = 'block';

    // Analytics: render full chart on open
    if (secId === 'analytics') {
      try { renderAnalytics(); } catch(e){ console.warn('analytics', e); }
    }

    // Если есть таб под этот раздел — подсветим его, если нет — просто игнорим
    const tab = document.querySelector('.tabs .tab[data-sec="' + secId + '"]');
    if (tab) {
      document.querySelectorAll('.tabs .tab').forEach(x => x.classList.remove('active'));
      tab.classList.add('active');
    }
  } catch (e) {
    console.warn('appGoSection fatal error', e);
    if (homeEl) homeEl.style.display = 'block';
    if (topBar) topBar.classList.remove('hidden');
  }
};

// Переход на главную (домашний экран с плитками)
window.appGoHome = function () {
  const homeEl = document.getElementById('homeScreen');
  const topBar = document.querySelector('.top');

  // Показываем верхнюю панель
  if (topBar) topBar.classList.remove('hidden');

  // Скрываем все разделы
  document.querySelectorAll('.section').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });

  // Показываем домашку
  if (homeEl) homeEl.style.display = 'block';

  // Снимаем подсветку табов (если есть)
  document.querySelectorAll('.tabs .tab').forEach(x => x.classList.remove('active'));

  try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch(_e){ window.scrollTo(0,0); }
};
// Backward compatibility: some older code used appShowHome
try { if (!window.appShowHome && window.appGoHome) window.appShowHome = window.appGoHome; } catch(_e) {}



   


// Синхронизация статуса пользователя с сервером (для автоматически активированного демо)
async function syncUserStatus(){
  try {
    const resp = await fetch('/me', { credentials: 'include' });
    if (!resp.ok) return;
    const data = await resp.json();
    const user = data && data.user;
    if (!user) return;

    // --- LANG: server is the source-of-truth ---
    try{
      if (user.lang){
        const l = String(user.lang).toLowerCase().trim();
        if (l) {
          localStorage.setItem('otd_lang', l);
          // align cash mic language with UI
          localStorage.setItem('speechLang', (l==='ru')?'ru-RU':(l==='en')?'en-US':(l==='uk')?'uk-UA':'pl-PL');
        }
      } else if (!localStorage.getItem('otd_lang')) {
        // fallback only if server doesn't know
        localStorage.setItem('otd_lang', 'pl');
        localStorage.setItem('speechLang', 'pl-PL');
      }
    }catch(e){}

    // Auto-resync access (Stripe → server → client) once per tab if we look locked.
    // Goal: NO manual buttons. If user paid, access should just unlock.
    try {
      const looksLocked = (String(user.status || '') !== 'active') || !user.endAt;
      const triedKey = 'otd_me_force_sync_tried';
      if (looksLocked && typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(triedKey)) {
        sessionStorage.setItem(triedKey, String(Date.now()));
        const rSync = await fetch('/me?sync=1', { credentials: 'include' });
        if (rSync && rSync.ok) {
          const dSync = await rSync.json().catch(()=>null);
          const u2 = dSync && dSync.user;
          if (u2) {
            // Merge server truth back into current object
            if (u2.role) user.role = u2.role;
            if (u2.status) user.status = u2.status;
            if (u2.startAt) user.startAt = u2.startAt;
            if (u2.endAt) user.endAt = u2.endAt;
            if (u2.discountUntil) user.discountUntil = u2.discountUntil;
            user.isAdmin = !!u2.isAdmin;
          }
        }
      }
    } catch(_e) { /* silent */ }


    // Role + status (server source of truth)
    if (user.role) localStorage.setItem(ROLE_KEY, user.role);
    if (user.status) localStorage.setItem(STATUS_KEY, user.status);

    // Admin flag
    if (user.isAdmin) {
      localStorage.setItem('otd_isAdmin', '1');
    } else {
      localStorage.removeItem('otd_isAdmin');
    }

    const role = (user.role || localStorage.getItem(ROLE_KEY) || 'freelance_business');

    // Enforce accountant landing (different UI)
    try {
      if (role === 'accountant' && !/\/accountant\.html$/.test(window.location.pathname)) {
        window.location.replace('/accountant.html');
        return;
      }
    } catch(e){}

    const status = (user.status || '');
    // Client-side invite banner (live polling: no need to relogin)
    try {
      const r2 = (role || 'freelance_business');
      if (r2 !== 'accountant' && !window.__OTD_INV_POLL_STARTED) {
        window.__OTD_INV_POLL_STARTED = true;

        async function _otdPullInvites(){
          try{
            const rr = await fetch('/api/client/invites', { credentials:'include' });
            if (!rr.ok) return;
            const jj = await rr.json().catch(()=>({}));
            const invs = (jj && Array.isArray(jj.invites)) ? jj.invites : [];

            const existing = document.getElementById('otdInviteBar');
            if (!invs.length){
              if (existing) existing.remove();
              return;
            }

            const inv = invs[0];
            const sig = String((inv && inv.accountantEmail) || '') + '|' + String((inv && inv.createdAt) || '');
            if (existing && existing.getAttribute('data-sig') === sig) return;
            if (existing) existing.remove();

            const bar = document.createElement('div');
            bar.id = 'otdInviteBar';
            bar.setAttribute('data-sig', sig);
            bar.style.position = 'fixed';
            bar.style.left = '12px';
            bar.style.right = '12px';
            bar.style.top = '12px';
            bar.style.zIndex = '9999';
            bar.style.background = 'rgba(15,18,20,.94)';
            bar.style.border = '1px solid rgba(71,181,0,.45)';
            bar.style.borderRadius = '14px';
            bar.style.padding = '12px';
            bar.style.boxShadow = '0 12px 40px rgba(0,0,0,.35)';
            bar.innerHTML = `
              <div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap">
                <div style="min-width:220px">
                  <div style="font-weight:800">${TT('documents.invite_title', null, 'Приглашение от бухгалтера')}</div>
                  <div style="opacity:.8;font-size:12px;margin-top:4px">${(inv && inv.accountantEmail) ? inv.accountantEmail : ''}</div>
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                  <button id="otdInvAccept" style="background:#47b500;color:#08130a;border:none;border-radius:10px;padding:10px 12px;font-weight:800;cursor:pointer">${TT('documents.btn_accept', null, 'Принять')}</button>
                  <button id="otdInvDecline" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:10px 12px;font-weight:700;cursor:pointer">${TT('documents.btn_decline', null, 'Отклонить')}</button>
                </div>
              </div>
            `;
            document.body.appendChild(bar);

            const send = (action)=>{
              fetch('/api/client/invites/respond', {
                method:'POST',
                headers:{ 'Content-Type':'application/json' },
                credentials:'include',
                body: JSON.stringify({ accountantEmail: inv.accountantEmail, action })
              }).then(()=>{ bar.remove(); location.reload(); }).catch(()=>{ bar.remove(); });
            };
            bar.querySelector('#otdInvAccept')?.addEventListener('click', ()=>send('accept'));
            bar.querySelector('#otdInvDecline')?.addEventListener('click', ()=>send('decline'));
          }catch(_e){}
        }

        _otdPullInvites();
        setInterval(()=>{ try{ if (!document.hidden) _otdPullInvites(); }catch(_){ } }, 15000);
      }
    } catch(e){}

// Client: accountant requests + file upload (jpg/png/pdf) + attach from Vault
    try {
      if ((role || 'freelance_business') !== 'accountant') {

        const ensureClientRequestsUI = ()=>{
          // Button
          if (!document.getElementById('openClientRequestsBtn')) {
            const anchor = document.getElementById('openVaultBtn') || document.querySelector('#docs .row') || document.querySelector('#docs') || document.body;
            const btn = document.createElement('button');
            btn.id = 'openClientRequestsBtn';
            btn.className = 'btn secondary';
            btn.type = 'button';
            btn.textContent = TT('documents.req_btn', null, 'Запросы бухгалтера');
            btn.style.marginLeft = '8px';
            if (anchor && anchor.parentNode) {
              // try to place near Vault button
              if (anchor.id === 'openVaultBtn') anchor.insertAdjacentElement('afterend', btn);
              else anchor.insertAdjacentElement('afterbegin', btn);
            } else {
              document.body.appendChild(btn);
            }
          }

          // Modal
          if (!document.getElementById('clientRequestsModal')) {
            const modal = document.createElement('div');
            modal.id = 'clientRequestsModal';
            modal.style.display = 'none';
            modal.style.position = 'fixed';
            modal.style.left = '0';
            modal.style.top = '0';
            modal.style.right = '0';
            modal.style.bottom = '0';
            modal.style.zIndex = '9998';
            modal.style.background = 'rgba(0,0,0,.55)';
            modal.style.backdropFilter = 'blur(6px)';
            modal.style.overflowY = 'auto';
            modal.style.webkitOverflowScrolling = 'touch';
            modal.innerHTML = `

              <div style="max-width:860px;margin:16px auto;padding:0 12px;min-height:calc(100vh - 32px);display:flex;align-items:flex-start">
                <div class="card" style="padding:14px;border-radius:16px;width:100%;max-height:calc(100vh - 32px);display:flex;flex-direction:column">
                  <div class="row between" style="gap:10px;align-items:center;flex-wrap:wrap">
                    <div>
                      <div style="font-weight:900;font-size:16px">${TT('documents.req_title', null, 'Запросы от бухгалтера')}</div>
                      <div class="muted small" style="margin-top:2px">${TT('documents.req_desc', null, 'Прикрепляй файлы к конкретному запросу.')}</div>
                    </div>
                    <div class="row" style="gap:8px;align-items:center">
                      <button id="clientRequestsClose" class="btn secondary" type="button">${TT('buttons.close', null, 'Закрыть')}</button>
                    </div>
                  </div>
                  <div id="clientReqList" style="margin-top:12px;overflow:auto;flex:1;min-height:180px;padding-right:6px"></div>
                  <input id="clientReqFileInput" type="file" accept=".jpg,.jpeg,.png,.pdf" multiple style="display:none" />
                </div>
              </div>
            `;
            document.body.appendChild(modal);
          }
        };

        ensureClientRequestsUI();

        const btnOpen = document.getElementById('openClientRequestsBtn');
        const modal = document.getElementById('clientRequestsModal');
        const listEl = document.getElementById('clientReqList');
        const closeBtn = document.getElementById('clientRequestsClose');
        const fileInput = document.getElementById('clientReqFileInput');

        let currentRid = null;
        let __otdClientReqModalTimer = null;

        // ---- Client Requests: visible indicator (badge + top bar) ----
        const __otdClientEmail = String((user && user.email) || localStorage.getItem('otd_user') || '').trim().toLowerCase();
        const __otdReqSeenKey = 'otd_req_seen_' + encodeURIComponent(__otdClientEmail || 'anon');
        const __otdReqLastKey = 'otd_req_last_' + encodeURIComponent(__otdClientEmail || 'anon');

        function _otdGetSeenReqIds(){
          try { return JSON.parse(localStorage.getItem(__otdReqSeenKey) || '[]'); } catch(_) { return []; }
        }
        function _otdSetSeenReqIds(arr){
          try { localStorage.setItem(__otdReqSeenKey, JSON.stringify((arr||[]).slice(-500))); } catch(_){}
        }
        function _otdRememberLastOpen(ids){
          try { localStorage.setItem(__otdReqLastKey, JSON.stringify((ids||[]).slice(-500))); } catch(_){}
        }
        function _otdGetLastOpen(){
          try { return JSON.parse(localStorage.getItem(__otdReqLastKey) || '[]'); } catch(_) { return []; }
        }

        function _otdEnsureReqBadge(){
          const btn = document.getElementById('openClientRequestsBtn');
          if (!btn) return null;
          let b = btn.querySelector('.otdReqBadge');
          if (!b){
            b = document.createElement('span');
            b.className = 'otdReqBadge';
            b.style.marginLeft = '8px';
            b.style.minWidth = '18px';
            b.style.height = '18px';
            b.style.padding = '0 6px';
            b.style.borderRadius = '999px';
            b.style.display = 'none';
            b.style.alignItems = 'center';
            b.style.justifyContent = 'center';
            b.style.fontSize = '12px';
            b.style.fontWeight = '900';
            b.style.color = '#0b1a07';
            b.style.background = '#47b500';
            b.style.boxShadow = '0 6px 18px rgba(0,0,0,.25)';
            btn.appendChild(b);
          }
          return b;
        }

        function _otdShowReqBar(payload){
          const existing = document.getElementById('otdReqBar');
          if (existing) return existing;

          const bar = document.createElement('div');
          bar.id = 'otdReqBar';
          bar.style.position = 'fixed';
          bar.style.left = '12px';
          bar.style.right = '12px';
          bar.style.top = '64px';
          bar.style.zIndex = '9999';
          bar.style.background = 'rgba(15,18,20,.94)';
          bar.style.border = '1px solid rgba(71,181,0,.45)';
          bar.style.borderRadius = '14px';
          bar.style.padding = '12px';
          bar.style.boxShadow = '0 12px 40px rgba(0,0,0,.35)';

          const title = payload && payload.title ? payload.title : TT('documents.req_bar_title', {n:1}, 'Новый запрос от бухгалтера (1)');
          const sub = payload && payload.sub ? payload.sub : '';

          bar.innerHTML = `
            <div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap">
              <div style="min-width:220px">
                <div style="font-weight:900">${title}</div>
                ${sub ? `<div style="opacity:.82;font-size:12px;margin-top:4px">${sub}</div>` : ''}
              </div>
              <div style="display:flex;gap:8px;align-items:center">
                <button id="otdReqOpen" style="background:#47b500;color:#08130a;border:none;border-radius:10px;padding:10px 12px;font-weight:900;cursor:pointer">${TT('documents.req_bar_btn_open', null, 'Открыть')}</button>
                <button id="otdReqHide" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:10px 12px;font-weight:800;cursor:pointer">${TT('documents.req_bar_btn_hide', null, 'Скрыть')}</button>
              </div>
            </div>
          `;
          document.body.appendChild(bar);
          return bar;
        }

        function _otdHideReqBar(){
          try{ document.getElementById('otdReqBar')?.remove(); }catch(_){}
        }

        async function _otdFetchClientRequests(){
          const rr = await fetch('/api/client/requests', { credentials:'include' });
          const js = await rr.json().catch(()=> ({}));
          if (!rr.ok) throw new Error((js && js.error) || 'Failed to load requests');
          return (js && js.requests) || [];
        }

        async function _otdUpdateReqIndicators(){
          try{
            const reqs = await _otdFetchClientRequests();
            const openReqs = reqs.filter(r=>{
              const st = String((r && r.status) || 'open');
              return st !== 'approved' && st !== 'rejected';
            });

            const openIds = openReqs.map(r=> String(r.id||'')).filter(Boolean);
            _otdRememberLastOpen(openIds);

            // Badge on the "Запросы бухгалтера" button
            const badge = _otdEnsureReqBadge();
            if (badge){
              badge.textContent = String(openReqs.length || 0);
              badge.style.display = openReqs.length ? 'inline-flex' : 'none';
            }

            // Top bar only for NEW (not seen before)
            const seen = new Set(_otdGetSeenReqIds());
            const newOnes = openReqs.filter(r=> !seen.has(String(r.id||'')));
            if (!newOnes.length){
              _otdHideReqBar();
              return;
            }

            const first = newOnes[0];
            const sub = [
              (first && first.month) ? TT('documents.req_month', {month:first.month}, `Месяц: ${first.month}`) : '',
              (newOnes.length > 1) ? TT('documents.req_more', {n:(newOnes.length-1)}, `Ещё: ${newOnes.length-1}`) : ''
            ].filter(Boolean).join(' • ');

            const barTitle = TT('documents.req_bar_title', { n: newOnes.length }, `Новый запрос от бухгалтера (${newOnes.length})`);
            const bar = _otdShowReqBar({ title: barTitle, sub });
            bar.querySelector('#otdReqOpen')?.addEventListener('click', ()=>{
              try{
                // mark as seen right away so it doesn't blink forever
                const next = Array.from(new Set([ ...seen, ...newOnes.map(x=> String(x.id||'')) ]));
                _otdSetSeenReqIds(next);
                _otdHideReqBar();
              }catch(_){}
              try{ window.OTD_OpenClientRequests ? window.OTD_OpenClientRequests(String(first.id||'')) : document.getElementById('openClientRequestsBtn')?.click(); }catch(_){}
            }, { once:true });

            bar.querySelector('#otdReqHide')?.addEventListener('click', ()=>{
              try{
                const next = Array.from(new Set([ ...seen, ...newOnes.map(x=> String(x.id||'')) ]));
                _otdSetSeenReqIds(next);
              }catch(_){}
              _otdHideReqBar();
            }, { once:true });

          }catch(_e){
            // silence for MVP
          }
        }

        const esc = (s)=> String(s||'')
          .replaceAll('&','&amp;')
          .replaceAll('<','&lt;')
          .replaceAll('>','&gt;')
          .replaceAll('"','&quot;')
          .replaceAll("'","&#039;");

        const reqParts = (items)=>{
          const parts = [];
          if (items && items.bank) parts.push(TT('documents.req_part_statement', null, 'Выписка'));
          if (items && items.invoices) parts.push(TT('documents.req_part_invoices', null, 'Фактуры'));
          if (items && items.receipts) parts.push(TT('documents.req_part_receipts', null, 'Чеки'));
          if (items && items.other) parts.push(TT('documents.req_part_other', null, 'Другое') + ': ' + String(items.other).slice(0,80));
          return parts.join(' • ') || '—';
        };

        const normalizeFiles = (r)=>{
          if (Array.isArray(r && r.files) && r.files.length) return r.files;
          if (r && r.fileUrl) return [{ fileUrl: r.fileUrl, fileName: r.fileName || 'download' }];
          return [];
        };

        async function loadAndRender(focusRid){
          if (!listEl) return;
          listEl.innerHTML = '<div class="muted small">'+TT('documents.req_loading', null, 'Загрузка…')+'</div>';
          try{
            const rr = await fetch('/api/client/requests', { credentials:'include' });
            const js = await rr.json();
            const reqs = (js && js.requests) || [];
            if (!reqs.length){
              listEl.innerHTML = '<div class="hintBox">'+TT('documents.req_empty', null, 'Пока нет запросов от бухгалтера.')+'</div>';
              return;
            }
            listEl.innerHTML = reqs.map(r=>{
              const when = (r.month ? r.month : '—');
              const created = (r.createdAt ? new Date(r.createdAt).toLocaleString() : '');
              const stRaw = String(r.status || 'open');
              const st = (stRaw === 'received') ? TT('documents.req_status_sent', null, 'Отправлено')
                : (stRaw === 'approved') ? TT('documents.req_status_approved', null, 'Принято')
                : (stRaw === 'rejected') ? TT('documents.req_status_rejected', null, 'Отклонено')
                : TT('documents.req_status_pending', null, 'Ожидает');
              const dueTxt = r.dueAt ? new Date(r.dueAt).toLocaleDateString() : '';
              const isOverdue = !!(r.dueAt && stRaw !== 'approved' && Date.now() > new Date(r.dueAt).getTime());

              const showAttach = (stRaw !== 'approved');
              const files = normalizeFiles(r);
                            const filesOpen = (files.length <= 2) ? ' open' : '';
              const fileHtml = files.length
                ? `<details style="margin-top:8px"${filesOpen}>
                     <summary class="muted small" style="cursor:pointer;font-weight:800;list-style:none">${TT('documents.req_files', {n: files.length}, 'Файлы ('+files.length+')')}</summary>
                     <div class="muted small" style="margin-top:8px;display:flex;flex-direction:column;gap:4px">
                       ${files.slice(0,6).map(f=>`<div>• <a href="${esc(f.fileUrl)}" target="_blank" rel="noopener">${esc(f.fileName || 'download')}</a></div>`).join('')}
                       ${files.length>6 ? `<div class="muted small">${TT('documents.req_more_files', {n: files.length-6}, '… и ещё '+(files.length-6))}</div>` : ''}
                     </div>
                   </details>`
                : '';

              return `
                <div class="card" data-rid="${esc(r.id)}" style="padding:12px">
                  <div class="row between" style="gap:10px;align-items:flex-start">
                    <div style="flex:1">
                      <div style="font-weight:900">${esc(when)}</div>
                      <div class="muted" style="margin-top:4px">${esc(reqParts(r.items||{}))}</div>
                      ${r.note ? `<div class="muted small" style="margin-top:6px">${esc(r.note)}</div>` : ''}
                      ${(stRaw==='rejected' && r.decisionNote) ? `<div class="muted small" style="margin-top:6px"><b>${TT('common.accountant', null, 'Бухгалтер')}:</b> ${esc(r.decisionNote)}</div>` : ''}
                      ${(stRaw==='approved') ? `<div class="muted small" style="margin-top:6px"><b>${TT('common.accountant', null, 'Бухгалтер')}:</b> ${TT('documents.req_status_approved', null, 'Принято').toLowerCase()}</div>` : ''}
                      ${fileHtml}
                    </div>
                    <div class="muted small" style="text-align:right">
                      <div class="clientReqStatus" style="display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;border:1px solid rgba(71,181,0,.35);background:rgba(71,181,0,.10);font-weight:900">${esc(st)}</div>
                      ${dueTxt ? `<div class="muted small" style="margin-top:4px">${TT('documents.req_due', null, 'Срок')}: ${esc(dueTxt)}${isOverdue ? ' • <span style="color:#ff5050;font-weight:800">' + TT('documents.req_overdue', null, 'Просрочено') + '</span>' : ''}</div>` : ''}
                    </div>
                  </div>
                  <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
                    ${showAttach ? `
                      <button class="btn secondary" type="button" data-attach="${esc(r.id)}">${TT('documents.req_btn_from_phone', null, 'С телефона')}</button>
                      <button class="btn secondary" type="button" data-attach-vault="${esc(r.id)}" data-month="${esc(when)}">${TT('documents.req_btn_from_vault', null, 'Из “Мои документы”')}</button>
                    ` : `<div class="muted small">${TT('documents.req_closed', null, 'Запрос закрыт.')}</div>`}
                  </div>
                </div>
              `;
            }).join('');

            listEl.querySelectorAll('button[data-attach]').forEach(btn=>{
              btn.addEventListener('click', ()=>{
                currentRid = btn.getAttribute('data-attach');
                if (!fileInput) return;
                fileInput.value = '';
                fileInput.click();
              });
            });

            listEl.querySelectorAll('button[data-attach-vault]').forEach(btn=>{
              btn.addEventListener('click', async ()=>{
                const rid = btn.getAttribute('data-attach-vault');
                const month = btn.getAttribute('data-month') || '';
                currentRid = rid;
                if (!rid) return;

                if (window.OTD_Vault && typeof window.OTD_Vault.openPicker === 'function') {
                  await window.OTD_Vault.openPicker({ requestId: rid, suggestedMonth: month });
                  await loadAndRender(rid);
                } else {
                  alert(TT('documents.req_vault_not_ready', null, '“Мои документы” ещё не готовы в этом билде. Обнови страницу.'));
                }
              });
            });

            if (focusRid) {
              setTimeout(()=>{
                const el = listEl.querySelector(`[data-rid="${focusRid}"]`);
                if (el && el.scrollIntoView) el.scrollIntoView({ behavior:'smooth', block:'start' });
              }, 100);
            }

          } catch(e){
            listEl.innerHTML = '<div class="hintBox">'+TT('documents.req_failed', null, 'Не удалось загрузить запросы.')+'</div>';
          }
        }

        const open = async (focusRid)=>{
          if (!modal) return;
          modal.style.display = 'block';
          await loadAndRender(focusRid);

          // mark currently open requests as "seen" (so the banner/badge doesn't lie)
          if (String(role||'') !== 'accountant') {
            try{
              const reqs = await _otdFetchClientRequests();
              const openIds = (reqs||[]).filter(r=>{
                const st = String((r && r.status) || 'open');
                return st !== 'approved' && st !== 'rejected';
              }).map(r=> String(r && r.id || '')).filter(Boolean);

              const prev = _otdGetSeenReqIds();
              const set = new Set(prev);
              openIds.forEach(id=> set.add(id));
              _otdSetSeenReqIds(Array.from(set));
              _otdHideReqBar();
              _otdUpdateReqIndicators();
            }catch(_){}
          }
          // Auto-refresh while modal is open (so you don't have to relogin)
          try{
            if (__otdClientReqModalTimer) clearInterval(__otdClientReqModalTimer);
            __otdClientReqModalTimer = setInterval(()=>{ try{ if (modal && modal.style.display==='block') loadAndRender(); }catch(_){ } }, 15000);
          }catch(_){}

        };
        const close = ()=>{ if(modal) modal.style.display='none'; try{ if(__otdClientReqModalTimer){ clearInterval(__otdClientReqModalTimer); __otdClientReqModalTimer=null; } }catch(_){ } };

        // Expose for notifications deep-link
        window.OTD_OpenClientRequests = open;

        btnOpen?.addEventListener('click', ()=>open());
        closeBtn?.addEventListener('click', close);
        modal?.addEventListener('click', (e)=>{ if(e.target===modal) close(); });

        // Start request indicator polling for clients (badge + top bar)
        if (String(role||'') !== 'accountant' && !window.__OTD_REQ_INDICATORS_STARTED){
          window.__OTD_REQ_INDICATORS_STARTED = true;
          try{ _otdUpdateReqIndicators(); }catch(_){}
          setInterval(()=>{ try{ _otdUpdateReqIndicators(); }catch(_){ } }, 20000);
        }


        fileInput?.addEventListener('change', async ()=>{
          const files = Array.from(fileInput.files || []);
          if (!files.length || !currentRid) return;
          const allowed = ['image/jpeg','image/png','application/pdf'];

          const MAX = 10;
          const pick = files.slice(0, MAX);

          for (let i=0;i<pick.length;i++){
            const f = pick[i];
            if (!allowed.includes((f.type||'').toLowerCase())){
              alert('Только JPG/PNG/PDF');
              continue;
            }

            let dataUrl = '';
            try{
              dataUrl = await new Promise((resolve, reject)=>{
                const fr = new FileReader();
                fr.onload = ()=> resolve(fr.result);
                fr.onerror = ()=> reject(fr.error || new Error('read failed'));
                fr.readAsDataURL(f);
              });
            } catch(e){
              alert('Не удалось прочитать файл');
              continue;
            }

            // lightweight UI feedback
            const card = listEl?.querySelector(`[data-rid="${currentRid}"]`);
            const stEl = card ? card.querySelector('.clientReqStatus') : null;
            if (stEl) stEl.textContent = `Загрузка… (${i+1}/${pick.length})`;

            try{
              const resp = await fetch('/api/client/requests/upload', {
                method: 'POST',
                headers: { 'Content-Type':'application/json' },
                credentials: 'include',
                body: JSON.stringify({ requestId: currentRid, fileName: f.name, dataUrl })
              });
              const js = await resp.json().catch(()=> ({}));
              if (!resp.ok || !js.success){
                alert((js && js.error) ? js.error : 'Upload failed');
              }
            } catch(e){
              alert('Upload failed');
            }
          }

          await loadAndRender(currentRid);
        });
      }
    } catch(e){}



    // Reset helper that keeps localStorage consistent
    const clearAccess = () => {
      localStorage.removeItem(DEMO_START);
      localStorage.removeItem('otd_demo_until');
      localStorage.removeItem(SUB_KEY);
      localStorage.removeItem(SUB_FROM);
      localStorage.removeItem(SUB_TO);
    };

    if (role === 'accountant') {
      // ACCOUNTANT:
      // - acct_trial / acct_pro_trial => timeboxed trial access (stored in demo keys to reuse gate)
      // - active / discount_active => paid PRO (stored in SUB keys)
      if ((status === 'acct_trial' || status === 'acct_pro_trial') && user.endAt) {
        const end = new Date(user.endAt).getTime();
        if (end > Date.now()) {
          localStorage.setItem(DEMO_START, user.startAt || new Date().toISOString());
          localStorage.setItem('otd_demo_until', user.endAt);
          localStorage.setItem(DEMO_USED, '1');
          // disable SUB markers while in trial
          localStorage.removeItem(SUB_KEY);
          localStorage.removeItem(SUB_FROM);
          localStorage.removeItem(SUB_TO);
        } else {
          // trial ended
          clearAccess();
          localStorage.setItem(DEMO_USED, '1');
        }
      } else if (status === 'active' || status === 'discount_active') {
        // paid PRO
        localStorage.setItem(SUB_KEY,  '1');
        localStorage.setItem(SUB_FROM, user.startAt || '');
        localStorage.setItem(SUB_TO,   user.endAt   || '');
        localStorage.setItem(DEMO_USED, '1');
        localStorage.removeItem(DEMO_START);
        localStorage.removeItem('otd_demo_until');
      } else if (status === 'ended') {
        clearAccess();
        localStorage.setItem(DEMO_USED, '1');
      } else {
        // none / unknown
        clearAccess();
      }
    } else {
      // FREELANCE/BUSINESS: keep legacy heuristic (demo ~= 24h, else subscription)
      const dayMs = 24 * 3600 * 1000;

      if ((status === 'active' || status === 'discount_active') && user.endAt && user.startAt) {
        const start = new Date(user.startAt).getTime();
        const end   = new Date(user.endAt).getTime();
        const now   = Date.now();
        const span  = end - start;

        if (span <= dayMs + 5 * 60 * 1000) {
          // ~24h => demo
          if (end > now) {
            localStorage.setItem(DEMO_START, user.startAt);
            localStorage.setItem('otd_demo_until', user.endAt);
            localStorage.setItem(DEMO_USED, user.demoUsed ? '1' : '0');
          } else {
            localStorage.setItem(DEMO_USED, '1');
            localStorage.removeItem(DEMO_START);
            localStorage.removeItem('otd_demo_until');
          }
          // subscription off
          localStorage.removeItem(SUB_KEY);
          localStorage.removeItem(SUB_FROM);
          localStorage.removeItem(SUB_TO);
        } else {
          // subscription
          localStorage.setItem(SUB_KEY,  '1');
          localStorage.setItem(SUB_FROM, user.startAt || '');
          localStorage.setItem(SUB_TO,   user.endAt   || '');
          localStorage.setItem(DEMO_USED, '1');
          localStorage.removeItem(DEMO_START);
          localStorage.removeItem('otd_demo_until');
        }
      } else if (user.demoUsed) {
        localStorage.setItem(DEMO_USED, '1');
        localStorage.removeItem(DEMO_START);
        localStorage.removeItem('otd_demo_until');
        localStorage.removeItem(SUB_KEY);
        localStorage.removeItem(SUB_FROM);
        localStorage.removeItem(SUB_TO);
      } else {
        localStorage.removeItem(DEMO_START);
        localStorage.removeItem('otd_demo_until');
        localStorage.removeItem(SUB_KEY);
        localStorage.removeItem(SUB_FROM);
        localStorage.removeItem(SUB_TO);
      }
    }

    gateAccess();
    updateSubUI();
    if (typeof renderWorkspaceControls === 'function') renderWorkspaceControls();
  } catch (e) {
    console.warn('syncUserStatus error', e);
  }
}



document.addEventListener('DOMContentLoaded', async ()=>{
  // Stripe Checkout return: если пришли с session_id, завершаем сессию на сервере и форсим синк подписки.
  try {
    const url = new URL(window.location.href);
    const sid = url.searchParams.get('session_id');
    if (sid) {
      await fetch('/session?session_id=' + encodeURIComponent(sid), { credentials: 'include' });
      await fetch('/me?sync=1', { credentials: 'include' });
      url.searchParams.delete('session_id');
      window.history.replaceState({}, document.title, url.toString());
    }
  } catch (e) {
    console.warn('[Stripe] checkout session finalize failed', e);
  }
  // Синхронизируем статус пользователя с сервером (для автоматически активированного демо)
  await syncUserStatus();
  
  // Lang bar (persisted per-user on the server; localStorage is just a cache)
  function _otdNormUiLang(l){
    const v = String(l||'').toLowerCase().trim();
    if (v==='pl'||v==='en'||v==='ru'||v==='uk') return v;
    return 'pl';
  }
  function _otdSpeechFromUiLang(ui){
    switch(_otdNormUiLang(ui)){
      case 'ru': return 'ru-RU';
      case 'en': return 'en-US';
      case 'uk': return 'uk-UA';
      default: return 'pl-PL';
    }
  }
  function _otdApplyLangUI(uiLang){
    const lang = _otdNormUiLang(uiLang);
    try{ document.documentElement.setAttribute('lang', lang); }catch(e){}
    try{ localStorage.setItem('otd_lang', lang); }catch(e){}
    // Keep cash mic language aligned with UI language (requested behavior)
    try{
      const sp = _otdSpeechFromUiLang(lang);
      localStorage.setItem('speechLang', sp);
      const sel = document.getElementById('speechLang');
      if (sel) sel.value = sp;
    }catch(e){}
    // Visual state of buttons
    try{
      document.querySelectorAll('#langBarMain button').forEach(b=>{
        b.classList.toggle('on', (b.dataset.lang||'')===lang);
      });
    }catch(e){}
    // Load translations (i18n engine will also persist best-effort to /api/user/lang)
    try{ applyLang(lang); }catch(e){}
  }

  document.querySelectorAll('#langBarMain button').forEach(b=>{
    b.addEventListener('click',()=> _otdApplyLangUI(b.dataset.lang));
  });
  _otdApplyLangUI(localStorage.getItem('otd_lang')||'pl');

initTheme();
  initHelper();
  initSpendingUI();
  initTrendInteractions();
  initAnalyticsUI();
    // --- Фикс поломанной вёрстки: выносим секции из homeScreen ---
  try {
    const home = document.getElementById('homeScreen');
    const host = document.querySelector('.wrap') || document.body;

    if (home && host) {
      // верхняя панель
      const topBar = document.querySelector('.top');
      if (topBar && home.contains(topBar)) {
        host.appendChild(topBar);
      }

      // основные секции
      const moveIds = [
        'gate',
        'pulpit',
        'analytics',
        'analytics',
        'docs',
        'wyciag',
        'faktury',
        'konta',
        'kasa',
        'ustawienia',
        'aiAssist',
        'reports'
      ];

      moveIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && home.contains(el)) {
          host.appendChild(el);
        }
      });

      // helper-виджеты
      ['helperFab', 'helperPanel'].forEach(id => {
        const el = document.getElementById(id);
        if (el && home.contains(el)) {
          host.appendChild(el);
        }
      });
    }
  } catch (e) {
    console.warn('layout fix failed', e);
  }

  // --- Workspaces (accounts / clients) ---
  try {
    if (typeof renderWorkspaceControls === 'function') renderWorkspaceControls();
    const wsSel = $id('workspaceSelect');
    const wsAdd = $id('workspaceAdd');
    const wsRm  = $id('workspaceRemove');

    if (wsSel && !wsSel.__otd_bound) {
      wsSel.__otd_bound = true;
      wsSel.addEventListener('change', () => _otdSwitchWorkspace(wsSel.value));
    }
    if (wsAdd && !wsAdd.__otd_bound) {
      wsAdd.__otd_bound = true;
      wsAdd.addEventListener('click', () => _otdAddClientWorkspace());
    }
    if (wsRm && !wsRm.__otd_bound) {
      wsRm.__otd_bound = true;
      wsRm.addEventListener('click', () => _otdRemoveCurrentWorkspace());
    }
  } catch (e) {
    console.warn('workspace init failed', e);
  }

  // --- Init local state early (so money/categories show without pressing ritual buttons) ---
  try{
    if(typeof loadLocal === 'function') loadLocal();
    if(typeof ensureTxIds === 'function') ensureTxIds();
    if(typeof ensureKasaIds === 'function') ensureKasaIds();
    if(typeof inferAccounts === 'function') inferAccounts();
    if(typeof render === 'function') render();
    try{ if(typeof renderSpendingPanel==='function') renderSpendingPanel(); }catch(_){}
    try{ if(typeof initSpendingUI==='function') initSpendingUI(); }catch(_){}
  }catch(e){
    console.warn('init local render failed', e);
  }

  // Auto-sync on open if URLs are set (removes the need to mash "Zrób dzień..." every time)
  setTimeout(()=>{
    try{
      const u1 = localStorage.getItem('txUrl') || document.getElementById('txUrl')?.value || '';
      const u2 = localStorage.getItem('billUrl') || document.getElementById('billUrl')?.value || '';
      if((u1||u2) && typeof fetchSources==='function') fetchSources();
    }catch(e){}
  }, 450);

  // Home screen and premium tiles
  try{
    // навешиваем fallback на случай, если inline-обработчик не сработал
    document.querySelectorAll('.homeTile').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const t = btn.dataset.target;
        if(!t) return;
        const map = {docs:'docs',money:'pulpit',ai:'aiAssist',kasa:'kasa',accounts:'konta',reports:'reports'};
        const secId = map[t] || t;
        if(window.appGoSection) window.appGoSection(secId);
      });
    });
    // Docs buttons -> underlying file inputs
    const byId = (id)=>document.getElementById(id);
    byId('docTxCsvBtn')?.addEventListener('click', ()=> byId('txFile')?.click());
    byId('docTxImgBtn')?.addEventListener('click', ()=> byId('txImage')?.click());
    byId('docBillCsvBtn')?.addEventListener('click', ()=> byId('billFile')?.click());
    byId('docBillImgBtn')?.addEventListener('click', ()=> byId('billImage')?.click());
    byId('docCashImgBtn')?.addEventListener('click', ()=> byId('cashPhoto')?.click());
// Docs: accountant tools (no share links)
    byId('docExportTxBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); try{ exportTxCSV(); }catch(err){ console.warn(err); } });
    byId('docExportBillsBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); try{ exportBillsCSV(); }catch(err){ console.warn(err); } });
    byId('docExportBookBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); try{ exportBookCSV(); }catch(err){ console.warn(err); } });
    byId('docExportCashBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); try{ exportCashCSV(); }catch(err){ console.warn(err); } });
    byId('openInvoiceTplBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); openInvoiceTplModal(); });

    byId('openInventoryTplBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); openInventoryTplModal(); });

  // Accountant tools modal (single button in Documents)
  const acctModal = byId('accountantToolsModal');
  const acctPanelExports = byId('acctPanelExports');
  const acctPanelTemplates = byId('acctPanelTemplates');
  const acctTabExports = byId('acctTabExports');
  const acctTabTemplates = byId('acctTabTemplates');

  function acctSwitch(mode){
    const isExports = (mode === 'exports');
    if(acctPanelExports) acctPanelExports.style.display = isExports ? 'flex' : 'none';
    if(acctPanelTemplates) acctPanelTemplates.style.display = isExports ? 'none' : 'flex';
    if(acctTabExports) acctTabExports.className = isExports ? 'btn' : 'btn secondary';
    if(acctTabTemplates) acctTabTemplates.className = isExports ? 'btn secondary' : 'btn';
  }
  function acctOpen(){
    if(!acctModal) return;
    acctModal.classList.add('show');
    acctSwitch('exports');
  }
  function acctClose(){
    acctModal?.classList.remove('show');
  }

  byId('openAccountantToolsBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); acctOpen(); });
  byId('accountantToolsClose')?.addEventListener('click', (e)=>{ e.preventDefault(); acctClose(); });
  acctModal?.addEventListener('click', (e)=>{ if(e.target === acctModal) acctClose(); });

  acctTabExports?.addEventListener('click', (e)=>{ e.preventDefault(); acctSwitch('exports'); });
  acctTabTemplates?.addEventListener('click', (e)=>{ e.preventDefault(); acctSwitch('templates'); });

  // Template helpers
  byId('invoiceTplNew')?.addEventListener('click', (e)=>{ e.preventDefault(); _otdTplClearForm(); toast('Nowy szablon'); });
  byId('inventoryTplNew')?.addEventListener('click', (e)=>{ e.preventDefault(); inventoryTplClearForm(); toast('Nowy szablon'); });
  byId('invoiceVoiceBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); invoiceVoiceDictate(); });

    // Invoice template modal actions
    byId('invoiceTplClose')?.addEventListener('click', (e)=>{ e.preventDefault(); closeInvoiceTplModal(); });
    byId('invoiceTplSave')?.addEventListener('click', (e)=>{ e.preventDefault(); invoiceTplSaveFromForm(); });
    byId('invoiceTplDownloadHTML')?.addEventListener('click', (e)=>{ e.preventDefault(); invoiceTplDownloadHTML(); });
    byId('invoiceTplDownloadCSV')?.addEventListener('click', (e)=>{ e.preventDefault(); invoiceTplDownloadCSV(); });


    // Inventory template modal actions
    byId('inventoryTplClose')?.addEventListener('click', (e)=>{ e.preventDefault(); closeInventoryTplModal(); });
    byId('inventoryTplSave')?.addEventListener('click', (e)=>{ e.preventDefault(); inventoryTplSaveFromForm(); });
    byId('inventoryTplDownloadCSV')?.addEventListener('click', (e)=>{ e.preventDefault(); inventoryTplDownloadCSV(); });
    byId('inventoryTplDownloadXLSX')?.addEventListener('click', (e)=>{ e.preventDefault(); inventoryTplDownloadXLSX(); });
    // Reports buttons reuse existing export actions (если они есть)
    byId('reportsTx')?.addEventListener('click', ()=> byId('exportTxCSV')?.click());
    byId('reportsBills')?.addEventListener('click', ()=> byId('exportBillsCSV')?.click());
    byId('reportsBook')?.addEventListener('click', ()=> byId('exportBook')?.click());

    // AI profile + chat UI (с сохранением на сервере для синхронизации между устройствами)
const AI_PROFILE_KEY = 'otd_ai_profile';
const AI_CHATS_META_KEY = 'otd_ai_chats_meta_v1';
const AI_CHAT_ACTIVE_KEY = 'otd_ai_chat_active_v1';
const AI_CHAT_PREFIX = 'otd_ai_chat_msgs_';
const LEGACY_AI_CHAT_KEY = 'otd_ai_chat_v1';
const AI_CLOUD_APPLIED_TS_KEY = 'otd_ai_cloud_applied_ts_v1';

const escHtml = (s)=>String(s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const loadJSON = (k, fallback)=>{
  try{ const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : fallback; }catch(e){ return fallback; }
};
const saveJSON = (k, v)=>{ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} try{ __aiScheduleCloudPush(); }catch(_e){} };

const tSafe = (key, fallback)=>{
  try{
    if(window.i18n && typeof window.i18n.t==='function'){
      const v = window.i18n.t(key);
      if(!v) return fallback;
      const s = String(v).trim();
      if(!s) return fallback;
      // If i18n returns the key itself, treat as missing
      if(s === key) return fallback;
      return s;
    }
  }catch(e){}
  return fallback;
};


const getProfile = ()=>{
  const p = loadJSON(AI_PROFILE_KEY, null);
  return p && typeof p === 'object' ? p : { type:'solo', niche:'', goal:'survive', incomeTarget:0 };
};

const applyProfileToUI = ()=>{
  const p = getProfile();
  if(byId('aiProfileType')) byId('aiProfileType').value = p.type || 'solo';
  if(byId('aiProfileNiche')) byId('aiProfileNiche').value = p.niche || '';
  if(byId('aiProfileGoal')) byId('aiProfileGoal').value = p.goal || 'survive';
  if(byId('aiProfileIncomeTarget')) byId('aiProfileIncomeTarget').value = p.incomeTarget || '';
  if(byId('aiProfileSaved')) byId('aiProfileSaved').style.display = 'block';
};

const openAiSettings = ()=>{
  const ov = byId('aiSettingsOverlay');
  if(!ov) return;
  ov.classList.add('show');
  applyProfileToUI();
};
const closeAiSettings = ()=>{
  const ov = byId('aiSettingsOverlay');
  if(!ov) return;
  ov.classList.remove('show');
};

// Wire settings modal
byId('aiSettingsBtn')?.addEventListener('click', openAiSettings);
byId('aiSettingsClose')?.addEventListener('click', closeAiSettings);
byId('aiSettingsOverlay')?.addEventListener('click', (e)=>{
  if(e.target === byId('aiSettingsOverlay')) closeAiSettings();
});

// Load saved profile into UI (when elements exist)
try{ applyProfileToUI(); }catch(e){}

byId('aiProfileSave')?.addEventListener('click', ()=>{
  const profile = {
    type: byId('aiProfileType')?.value || 'solo',
    niche: byId('aiProfileNiche')?.value || '',
    goal: byId('aiProfileGoal')?.value || 'survive',
    incomeTarget: Number(byId('aiProfileIncomeTarget')?.value || 0) || 0
  };
  saveJSON(AI_PROFILE_KEY, profile);
  if(byId('aiProfileSaved')) byId('aiProfileSaved').style.display='block';
  closeAiSettings();
});

// Chat history (local, multi-chat)
const getChatsMeta = ()=>{
  let m = loadJSON(AI_CHATS_META_KEY, null);
  if(!Array.isArray(m)) m = [];
  return m;
};
const saveChatsMeta = (arr)=> saveJSON(AI_CHATS_META_KEY, arr);
const getActiveChatId = ()=> localStorage.getItem(AI_CHAT_ACTIVE_KEY) || '';
const setActiveChatId = (id)=>{ try{ localStorage.setItem(AI_CHAT_ACTIVE_KEY, id); }catch(e){} try{ __aiScheduleCloudPush(); }catch(_e){} };
const chatKey = (id)=> AI_CHAT_PREFIX + id;
const loadChat = (id)=> loadJSON(chatKey(id), []);
const saveChat = (id, arr)=> saveJSON(chatKey(id), arr);

const makeChatId = ()=> 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const touchChatMeta = (id)=>{
  const meta = getChatsMeta();
  const i = meta.findIndex(x=>x && x.id===id);
  if(i>=0){ meta[i].updatedAt = Date.now(); saveChatsMeta(meta); }
};
const ensureDefaultChat = ()=>{
  // migrate legacy single-chat storage if it exists
  const legacy = loadJSON(LEGACY_AI_CHAT_KEY, null);
  let meta = getChatsMeta();
  if(Array.isArray(legacy) && legacy.length && meta.length===0){
    const id = makeChatId();
    meta = [{ id, title:'Чат', createdAt:Date.now(), updatedAt:Date.now() }];
    saveChatsMeta(meta);
    saveChat(id, legacy);
    try{ localStorage.removeItem(LEGACY_AI_CHAT_KEY); }catch(e){}
    setActiveChatId(id);
  }
  meta = getChatsMeta();
  if(meta.length===0){
    const id = makeChatId();
    meta = [{ id, title:'Чат', createdAt:Date.now(), updatedAt:Date.now() }];
    saveChatsMeta(meta);
    setActiveChatId(id);
  }
  if(!getActiveChatId() && meta[0]?.id) setActiveChatId(meta[0].id);
};

//
// AI Cloud Sync (server-side storage)
// Goal: same AI chat history + titles + AI profile across devices.
// Storage is handled by backend (/api/ai/state) so we don't rely on localStorage and don't expose DB writes in the browser.
//
let __aiCloudInited = false;
let __aiCloudPulling = false;
let __aiCloudPushing = false;
let __aiCloudPushTimer = null;

function __aiEmail(){
  try{ return String(localStorage.getItem(USER_KEY)||'').trim().toLowerCase(); }catch(_){ return ''; }
}
function __aiGetAppliedTs(){
  try{ return parseInt(String(localStorage.getItem(AI_CLOUD_APPLIED_TS_KEY)||'0'),10) || 0; }catch(_){ return 0; }
}
function __aiSetAppliedTs(ts){
  try{ localStorage.setItem(AI_CLOUD_APPLIED_TS_KEY, String(ts||0)); }catch(_){}
}

function __aiBuildLocalState(){
  ensureDefaultChat();
  const meta = getChatsMeta().slice(0, 25);
  const chats = {};
  for (const m of meta){
    if(!m || !m.id) continue;
    const arr = loadChat(m.id);
    chats[m.id] = (Array.isArray(arr) ? arr.slice(-200) : []);
  }
  return {
    v: 1,
    updatedAt: Date.now(),
    profile: getProfile(),
    chatsMeta: meta,
    activeChatId: getActiveChatId(),
    chats
  };
}

function __aiApplyRemoteState(st){
  if(!st || typeof st !== 'object') return;
  // Apply profile
  try{
    if(st.profile && typeof st.profile === 'object'){
      localStorage.setItem(AI_PROFILE_KEY, JSON.stringify(st.profile));
    }
  }catch(_){}
  // Apply meta
  try{
    if(Array.isArray(st.chatsMeta)){
      localStorage.setItem(AI_CHATS_META_KEY, JSON.stringify(st.chatsMeta.slice(0,25)));
    }
  }catch(_){}
  // Apply active chat
  try{
    if(st.activeChatId){
      localStorage.setItem(AI_CHAT_ACTIVE_KEY, String(st.activeChatId));
    }
  }catch(_){}
  // Apply chats
  try{
    if(st.chats && typeof st.chats === 'object'){
      for(const [id, arr] of Object.entries(st.chats)){
        if(!id) continue;
        const msgs = Array.isArray(arr) ? arr.slice(-200) : [];
        localStorage.setItem(chatKey(id), JSON.stringify(msgs));
      }
    }
  }catch(_){}
}

async function __aiPullFromServer(force){
  const email = __aiEmail();
  if(!email) return;
  if(__aiCloudPulling) return;
  __aiCloudPulling = true;

  try{
    const r = await fetch('/api/ai/state', { method:'GET', credentials:'same-origin' });
    if(!r.ok) { __aiCloudPulling=false; return; }
    const j = await r.json().catch(()=>null);
    if(!j || !j.success) { __aiCloudPulling=false; return; }
    const st = j.state;

    if(!st) { __aiCloudPulling=false; return; }

    const rTs = Number(st.updatedAt || 0) || 0;
    const lTs = __aiGetAppliedTs();
    if(!force && rTs && rTs <= lTs) { __aiCloudPulling=false; return; }

    __aiApplyRemoteState(st);
    __aiSetAppliedTs(rTs || Date.now());

    // refresh UI if AI panel is present
    try{ applyProfileToUI(); }catch(_){}
    try{ renderChatList(); }catch(_){}
    try{ renderChat(); }catch(_){}
  }catch(_e){
  }finally{
    __aiCloudPulling = false;
  }
}

async function __aiPushToServerNow(){
  const email = __aiEmail();
  if(!email) return;
  if(__aiCloudPushing) return;
  __aiCloudPushing = true;

  try{
    const st = __aiBuildLocalState();
    const r = await fetch('/api/ai/state', {
      method:'POST',
      credentials:'same-origin',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ state: st })
    });

    // If conflict (newer state on server), pull and apply server version.
    if(r.status === 409){
      const j = await r.json().catch(()=>null);
      if(j && j.state){
        __aiApplyRemoteState(j.state);
        __aiSetAppliedTs(Number(j.serverUpdatedAt || j.state.updatedAt || Date.now()) || Date.now());
        try{ renderChatList(); renderChat(); }catch(_){}
      }
      return;
    }

    const j = await r.json().catch(()=>null);
    if(j && j.success && j.state){
      __aiSetAppliedTs(Number(j.state.updatedAt || Date.now()) || Date.now());
    }
  }catch(_e){
  }finally{
    __aiCloudPushing = false;
  }
}

// called automatically after any local AI state change (debounced)
function __aiScheduleCloudPush(){
  if(__aiCloudPushTimer) clearTimeout(__aiCloudPushTimer);
  __aiCloudPushTimer = setTimeout(()=>{ __aiPushToServerNow(); }, 1200);
}

function __aiInitCloudSync(){
  if(__aiCloudInited) return;
  const email = __aiEmail();
  if(!email){
    setTimeout(__aiInitCloudSync, 1000);
    return;
  }
  __aiCloudInited = true;

  // initial pull (server may have newer history from another device)
  __aiPullFromServer(true);

  // lightweight polling (MVP): keeps devices in sync without websockets
  setInterval(()=>{ __aiPullFromServer(false); }, 15000);

  // pull when the tab becomes active again
  document.addEventListener('visibilitychange', ()=>{
    if(!document.hidden) __aiPullFromServer(true);
  });
}



const formatShortDate = (ts)=>{
  try{ const d=new Date(ts||Date.now()); return d.toISOString().slice(0,10); }catch(e){ return ''; }
};

const renderChatList = ()=>{
  const host = byId('aiChatList');
  if(!host) return;
  const meta = getChatsMeta().slice().sort((a,b)=>(b?.updatedAt||0)-(a?.updatedAt||0));
  const active = getActiveChatId();
  host.innerHTML = meta.map(m=>{
    const isA = m.id===active;
    const name = escHtml(m.title || 'Chat');
    const dt = escHtml(formatShortDate(m.updatedAt||m.createdAt));
    return `<div class="aiChatItem ${isA?'active':''}" data-id="${escHtml(m.id)}">
      <div style="min-width:0;flex:1">
        <div class="name">${name}</div>
        <div class="meta">${dt}</div>
      </div>
      <div class="actions">
        <button class="mini" data-act="rename" title="Rename">✎</button>
        <button class="mini" data-act="del" title="Delete">🗑</button>
      </div>
    </div>`;
  }).join('');
};

const openChatDrawer = ()=>{ const d=byId('aiChatDrawer'); if(!d) return; d.classList.add('show'); renderChatList(); };
const closeChatDrawer = ()=>{ const d=byId('aiChatDrawer'); if(!d) return; d.classList.remove('show'); };

byId('aiChatsBtn')?.addEventListener('click', openChatDrawer);
byId('aiChatDrawerClose')?.addEventListener('click', closeChatDrawer);
byId('aiChatDrawer')?.addEventListener('click', (e)=>{ if(e.target===byId('aiChatDrawer')) closeChatDrawer(); });
byId('aiChatNew')?.addEventListener('click', ()=>{
  ensureDefaultChat();
  const meta = getChatsMeta();
  const id = makeChatId();
  meta.unshift({ id, title:'Новый чат', createdAt:Date.now(), updatedAt:Date.now() });
  saveChatsMeta(meta);
  setActiveChatId(id);
  saveChat(id, []);
  renderChat();
  renderChatList();
});

byId('aiChatList')?.addEventListener('click', (e)=>{
  const item = e.target.closest('.aiChatItem');
  if(!item) return;
  const id = item.getAttribute('data-id')||'';
  if(!id) return;
  const act = e.target?.getAttribute?.('data-act');
  if(act==='rename'){
    const meta = getChatsMeta();
    const i = meta.findIndex(x=>x.id===id);
    const cur = i>=0 ? (meta[i].title||'Chat') : 'Chat';
    const nn = prompt(TT("prompts.chat_name", null, "Название чата"), cur);
    if(nn && i>=0){ meta[i].title = String(nn).trim().slice(0,60) || cur; meta[i].updatedAt=Date.now(); saveChatsMeta(meta); renderChatList(); }
    return;
  }
  if(act==='del'){
    const ok = confirm(TT('dialogs.delete_chat', null, 'Удалить чат? (только локально)'));
    if(!ok) return;
    const meta = getChatsMeta().filter(x=>x.id!==id);
    saveChatsMeta(meta);
    try{ localStorage.removeItem(chatKey(id)); }catch(e){}
    if(getActiveChatId()===id){ setActiveChatId(meta[0]?.id || ''); }
    ensureDefaultChat();
    renderChat();
    renderChatList();
    return;
  }
  setActiveChatId(id);
  renderChat();
  closeChatDrawer();
});

ensureDefaultChat();
__aiInitCloudSync();

const renderChat = ()=>{
  const host = byId('aiChatLog');
  if(!host) return;
  ensureDefaultChat();
  const activeId = getActiveChatId();
  let msgs = loadChat(activeId);
  if(!Array.isArray(msgs)) msgs = [];

  // Seed with greeting once (per chat)
  if(msgs.length === 0){
        let greet = tSafe('ai.chat_intro', 'Привет! Я AI‑бухгалтер OneTapDay. С чем разберёмся сегодня: расходы, доход, платежи, долги или налоги?');
    // If i18n returns the key itself (common "missing translation" behavior), fallback to a real greeting.
    if(!greet || greet === 'ai.chat_intro'){
      greet = (window.OTD_AI && typeof window.OTD_AI.greeting==='function')
        ? window.OTD_AI.greeting(getProfile())
        : 'Привет! Я AI‑бухгалтер OneTapDay. С чем разберёмся сегодня: расходы, доход, платежи, долги или налоги?';
    }

    msgs.push({ role:'assistant', text: greet, ts: Date.now() });
    saveChat(activeId, msgs);
    touchChatMeta(activeId);
  }

  host.innerHTML = msgs.map(m=>{
    const role = (m.role === 'user') ? 'user' : 'bot';
    const atts = Array.isArray(m.attachments) ? m.attachments : [];
    let attHtml = '';
    if(atts.length){
      const items = atts.map(a=>{
        const url = String(a.fileUrl || a.url || '').trim();
        const name = String(a.fileName || a.name || 'file').trim();
        const mime = String(a.fileMime || a.mime || '').toLowerCase();
        const safeUrl = url.replace(/"/g,'&quot;');
        const thumb = (mime.startsWith('image/') && url)
          ? '<img class="aiAttachThumb" src="'+safeUrl+'" alt=""/>'
          : '<div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:8px;border:1px solid #242b30;background:#0f1418;font-size:14px">📎</div>';
        return '<a class="aiAttachItem aiAttachLink" href="'+safeUrl+'" target="_blank" rel="noopener">'+thumb+'<div class="aiAttachName">'+escHtml(name)+'</div></a>';
      }).join('');
      attHtml = '<div class="aiAttachList">'+items+'</div>';
    }
    return '<div class="aiMsg '+role+'"><div class="aiBubble">'+escHtml(m.text||'')+attHtml+'</div></div>';
  }).join('');
  host.scrollTop = host.scrollHeight;
};

const pushMsg = (role, text)=>{
  ensureDefaultChat();
  const activeId = getActiveChatId();
  const msgs = loadChat(activeId);
  msgs.push({ role, text, ts: Date.now() });
  saveChat(activeId, msgs);
  touchChatMeta(activeId);
  renderChat();
};


// --- AI chat attachments + voice (MVP: no OCR/AI required) ---
let __otdAiPendingAtt = [];
const __otdAiInboxKey = 'otd_ai_inbox_folder_id';

const __otdAiNowMonth = ()=>{
  try{ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }catch(_){ return ''; }
};

async function __otdAiEnsureInboxFolder(){
  try{
    const cached = localStorage.getItem(__otdAiInboxKey);
    if(cached) return cached;
    const name = TT('ai.inbox_name', null, 'AI Inbox');
    const r = await fetch('/api/docs/folders/create', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name })
    });
    const j = await r.json().catch(()=>null);
    if(r.ok && j && j.success && j.folder && j.folder.id){
      localStorage.setItem(__otdAiInboxKey, j.folder.id);
      return j.folder.id;
    }
  }catch(_e){}
  // fallback: use smart folder for current month/other
  try{
    const month = __otdAiNowMonth();
    const r = await fetch('/api/docs/folders/ensure', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ month, category:'other' })
    });
    const j = await r.json().catch(()=>null);
    if(r.ok && j && j.success && j.folder && j.folder.id){
      return j.folder.id;
    }
  }catch(_e){}
  return '';
}

function __otdAiRenderAttachRow(){
  const row = byId('aiAttachRow');
  if(!row) return;
  if(!__otdAiPendingAtt.length){
    row.style.display = 'none';
    row.innerHTML = '';
    return;
  }
  row.style.display = 'flex';
  row.innerHTML = __otdAiPendingAtt.map((a, idx)=>{
    const name = escHtml(String(a.fileName || 'file'));
    const mime = String(a.fileMime || '').toLowerCase();
    const status = a.status || 'ready';
    const badge = status === 'uploading' ? '⏳' : (status === 'error' ? '⚠️' : '✅');
    const thumb = (mime.startsWith('image/') && a.fileUrl)
      ? '<img class="aiAttachThumb" src="'+String(a.fileUrl).replace(/"/g,'&quot;')+'" alt=""/>'
      : '<div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:8px;border:1px solid #242b30;background:#0f1418;font-size:14px">📎</div>';
    return '<div class="aiAttachItem" data-ai-att-idx="'+idx+'">'+thumb+'<div class="aiAttachName">'+badge+' '+name+'</div><button class="btn ghost aiAttachRemove" type="button" data-ai-att-remove="'+idx+'">×</button></div>';
  }).join('');

  row.querySelectorAll('[data-ai-att-remove]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const i = parseInt(btn.getAttribute('data-ai-att-remove')||'-1',10);
      if(isNaN(i) || i<0) return;
      __otdAiPendingAtt.splice(i,1);
      __otdAiRenderAttachRow();
    });
  });
}

async function __otdAiUploadFileToDocs(file){
  const MAX = 9.5 * 1024 * 1024;
  if(!file) return null;
  if(file.size > MAX){
    return { ok:false, error: TT('ai.file_too_large', null, 'Файл слишком большой (макс 10MB).') };
  }
  const folderId = await __otdAiEnsureInboxFolder();
  if(!folderId){
    return { ok:false, error: TT('ai.file_no_folder', null, 'Не смог создать папку для файлов (Docs).') };
  }
  const dataUrl = await new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onload = ()=> resolve(String(fr.result||''));
    fr.onerror = ()=> reject(new Error('read_failed'));
    fr.readAsDataURL(file);
  });

  const r = await fetch('/api/docs/upload', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ folderId, fileName: file.name || 'file', dataUrl })
  });
  const j = await r.json().catch(()=>null);
  if(r.ok && j && j.success && j.file){
    return { ok:true, file: j.file };
  }
  return { ok:false, error: (j && j.error) ? j.error : 'upload_failed' };
}

async function __otdAiHandleFiles(files){
  const list = Array.from(files || []).slice(0, 6); // MVP: limit burst
  for(const f of list){
    const tmp = { fileName: f.name, fileMime: f.type, fileSize: f.size, status:'uploading' };
    __otdAiPendingAtt.push(tmp);
    __otdAiRenderAttachRow();
    try{
      const up = await __otdAiUploadFileToDocs(f);
      if(up && up.ok && up.file){
        tmp.status = 'ready';
        tmp.fileId = up.file.id;
        tmp.fileUrl = up.file.fileUrl || up.file.url || '';
        tmp.fileMime = up.file.fileMime || tmp.fileMime;
      }else{
        tmp.status = 'error';
        tmp.error = (up && up.error) ? String(up.error) : 'upload_failed';
      }
    }catch(e){
      tmp.status = 'error';
      tmp.error = (e && e.message) ? e.message : 'upload_failed';
    }
    __otdAiRenderAttachRow();
  }
}

function __otdAiAnyUploading(){
  return __otdAiPendingAtt.some(a=>a && a.status === 'uploading');
}

function __otdAiGetReadyAttachments(){
  return __otdAiPendingAtt
    .filter(a=>a && a.status === 'ready' && a.fileUrl)
    .map(a=>({ fileId:a.fileId || '', fileUrl:a.fileUrl || '', fileName:a.fileName || 'file', fileMime:a.fileMime || '' }));
}
// --- end attachments ---

// --- AI assistant actions (download PDF, etc.) ---
function __otdAiLang(){
  try{ return String(localStorage.getItem('otd_lang')||'pl').toLowerCase().trim(); }catch(_){ return 'pl'; }
}
function __otdAiPdfStartedMsg(fname){
  const lang = __otdAiLang();
  if(lang==='pl') return `📄 PDF: ${fname} (pobieranie rozpoczęte)`;
  if(lang==='en') return `📄 PDF: ${fname} (download started)`;
  if(lang==='uk') return `📄 PDF: ${fname} (завантаження почалося)`;
  return `📄 PDF: ${fname} (скачивание началось)`;
}
async function __otdAiDownloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'file';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>{ try{ URL.revokeObjectURL(url); }catch(_e){} }, 30000);
}
async function __otdAiFetchInvoicePdf(invoice, filename){
  const r = await fetch('/api/pdf/invoice', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(invoice||{})
  });
  if(!r.ok){
    let msg='';
    try{ const j=await r.json().catch(()=>null); msg = j && (j.error||j.message) ? String(j.error||j.message) : ''; }catch(_e){}
    throw new Error(msg || ('HTTP ' + r.status));
  }
  const blob = await r.blob();
  await __otdAiDownloadBlob(blob, filename || 'Faktura.pdf');
}
function __otdAiExtractJsonAction(text){
  const s = String(text||'');
  const m = s.match(/```json\s*([\s\S]*?)```/i);
  if(!m) return { cleaned:s, action:null };
  const raw = String(m[1]||'').trim();
  let obj=null;
  try{ obj = JSON.parse(raw); }catch(_e){ obj=null; }
  const cleaned = s.replace(m[0], '').trim();
  return { cleaned, action: obj };
}
async function __otdAiProcessActions(ans){
  let out = String(ans||'').trim();
  try{
    const ext = __otdAiExtractJsonAction(out);
    out = ext.cleaned;
    const act = ext.action;
    if(act && act.otd_action === 'invoice_pdf' && act.invoice){
      const fname = String(act.filename || 'Faktura.pdf').trim() || 'Faktura.pdf';
      try{ await __otdAiFetchInvoicePdf(act.invoice, fname); }catch(_e){}
      out = (out ? (out + "\n\n") : "") + __otdAiPdfStartedMsg(fname);
    }
  }catch(_e){}
  return out || String(ans||'');
}


const sendAiChat = async ()=>{
  const inp = byId('aiChatInput');
  if(!inp) return;
  const q = (inp.value||'').trim();
  const hasAtt = Array.isArray(__otdAiPendingAtt) && __otdAiPendingAtt.length;
  if(!q && !hasAtt) return;
  if(__otdAiAnyUploading()){
    pushMsg('assistant', TT('ai.file_uploading_wait', null, 'Подожди: файл ещё загружается.'));
    return;
  }
  const attsReady = __otdAiGetReadyAttachments();
  inp.value = '';

  // Write user message and a pending assistant bubble into the active chat
  ensureDefaultChat();
  const activeId = getActiveChatId();
  const msgs0 = loadChat(activeId);
  msgs0.push({ role:'user', text:(q||TT('ai.sent_files', null, '📎 Файлы')), ts: Date.now(), attachments: attsReady });
  __otdAiPendingAtt = [];
  __otdAiRenderAttachRow();
  msgs0.push({ role:'assistant', text:'⌛ Думаю…', ts: Date.now(), _pending:true });
  saveChat(activeId, msgs0);
  touchChatMeta(activeId);
  renderChat();

  try{
    const profile = getProfile();
    let ans = '';
    if(window.OTD_AI && typeof window.OTD_AI.answer === 'function'){
      ans = await window.OTD_AI.answer(String(q||''), { profile, attachments: attsReady });
    }else{
      ans = 'AI модуль не подключен. Проверь, что загружается /js/features/ai/ai-client.js.';
    }

    // handle special AI actions (e.g., invoice PDF)
    ans = await __otdAiProcessActions(ans);

    const msgs = loadChat(activeId);
    for(let i=msgs.length-1;i>=0;i--){
      if(msgs[i] && msgs[i]._pending){
        msgs[i].text = ans;
        delete msgs[i]._pending;
        break;
      }
    }
    saveChat(activeId, msgs);
    touchChatMeta(activeId);
    renderChat();
  }catch(e){
    const msgs = loadChat(activeId);
    for(let i=msgs.length-1;i>=0;i--){
      if(msgs[i] && msgs[i]._pending){
        msgs[i].text = 'Не смог ответить: ' + ((e && e.message) ? e.message : 'ошибка');
        delete msgs[i]._pending;
        break;
      }
    }
    saveChat(activeId, msgs);
    touchChatMeta(activeId);
    renderChat();
  }
};

byId('aiChatSend')?.addEventListener('click', sendAiChat);
byId('aiChatInput')?.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter' && !e.shiftKey){
    e.preventDefault();
    sendAiChat();
  }
});


// Attachments UI
byId('aiAttachBtn')?.addEventListener('click', ()=>{
  byId('aiFileInput')?.click();
});
byId('aiFileInput')?.addEventListener('change', (e)=>{
  try{
    const files = e && e.target && e.target.files ? e.target.files : [];
    if(files && files.length) __otdAiHandleFiles(files);
  }catch(_e){}
  try{ e.target.value = ''; }catch(_){}
});

// Voice input (stable): record → transcribe → put text into input (no auto-send)
(function(){
  const btn = byId('aiVoiceBtn');
  const inp = byId('aiChatInput');
  if(!btn || !inp) return;

  // Prevent duplicate listeners after re-renders / re-inits
  if(btn.dataset && btn.dataset.voiceBound === '1') return;
  try{ btn.dataset.voiceBound = '1'; }catch(_){}

  const langMap = { pl:'pl-PL', en:'en-US', ru:'ru-RU', uk:'uk-UA' };
  const getLang = ()=>{
    try{
      const k = String(localStorage.getItem('otd_lang') || 'pl').toLowerCase().trim();
      return langMap[k] || 'pl-PL';
    }catch(_){ return 'pl-PL'; }
  };

  let recording = false;
  let mediaRec = null;
  let mediaStream = null;
  let chunks = [];
  let opId = 0; // cancel stale callbacks

  function setUI(on){
    recording = on;
    btn.classList.toggle('is-recording', !!on);
    btn.textContent = on ? '⏹' : '🎤';
  }

  function stopTracks(){
    try{
      if(mediaStream){
        mediaStream.getTracks().forEach(t=>{ try{ t.stop(); }catch(_){ } });
      }
    }catch(_){}
    mediaStream = null;
  }

  function blobToBase64(blob){
    return new Promise((resolve, reject)=>{
      try{
        const r = new FileReader();
        r.onload = ()=> {
          const s = String(r.result || '');
          const b64 = s.includes(',') ? s.split(',')[1] : s;
          resolve(b64);
        };
        r.onerror = ()=> reject(r.error || new Error('FileReader error'));
        r.readAsDataURL(blob);
      }catch(e){ reject(e); }
    });
  }

  async function transcribe(blob, mime){
    const b64 = await blobToBase64(blob);
    const r = await fetch(`${API_BASE}/ai/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ audio: b64, mime: mime || blob.type || 'audio/webm', language: getLang() })
    });
    const j = await r.json().catch(()=> ({}));
    if(!r.ok || !j || j.success !== true){
      throw new Error((j && j.error) ? j.error : ('Transcribe failed ' + r.status));
    }
    return String(j.text || '').trim();
  }

  async function startMedia(){
    const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
    mediaStream = stream;
    chunks = [];
    let opts = {};
    try{
      const prefer = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/ogg','audio/mp4'];
      for(const m of prefer){
        if(window.MediaRecorder && typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(m)){
          opts.mimeType = m;
          break;
        }
      }
    }catch(_){}
    mediaRec = new MediaRecorder(stream, opts);
    mediaRec.ondataavailable = (e)=>{ try{ if(e.data && e.data.size>0) chunks.push(e.data); }catch(_){} };
    return true;
  }

  async function start(){
    if(recording) return;
    const my = ++opId;

    // Prefer stable flow: record → server STT
    if(navigator.mediaDevices && window.MediaRecorder){
      try{
        await startMedia();
        setUI(true);
        mediaRec.onstop = async ()=>{
          const mine = my;
          const localChunks = chunks.slice();
          const mime = (mediaRec && mediaRec.mimeType) ? mediaRec.mimeType : '';
          setUI(false);
          stopTracks();

          if(mine !== opId) return; // cancelled
          try{
            const blob = new Blob(localChunks, { type: mime || 'audio/webm' });
            const text = await transcribe(blob, mime);
            if(!text) return;
            const prev = String(inp.value || '').trim();
            inp.value = (prev ? (prev + ' ') : '') + text;
            try{ inp.focus(); }catch(_){}
          }catch(e){
            // If STT is not available, do not spam the chat. Just show a minimal error.
            if(typeof pushMsg === 'function'){
              pushMsg('assistant', TT('ai.voice_failed', null, 'Не смог распознать голос. Проверь AI ключ / доступ.'));
            }
          }
        };
        mediaRec.start();
        return;
      }catch(_e){
        // fallthrough to Web Speech if available
        stopTracks();
        setUI(false);
      }
    }

    // Fallback: Web Speech API (device-dependent)
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR){
      if(typeof pushMsg === 'function'){
        pushMsg('assistant', TT('ai.voice_unsupported', null, 'Голосовой ввод недоступен в этом браузере.'));
      }
      return;
    }

    try{
      const rec = new SR();
      rec.lang = getLang();
      rec.interimResults = false;
      rec.continuous = false;

      setUI(true);
      rec.onresult = (ev)=>{
        try{
          const t = ev.results && ev.results[0] && ev.results[0][0] ? ev.results[0][0].transcript : '';
          const text = String(t || '').trim();
          if(text){
            const prev = String(inp.value || '').trim();
            inp.value = (prev ? (prev + ' ') : '') + text;
            try{ inp.focus(); }catch(_){}
          }
        }catch(_){}
      };
      rec.onerror = ()=> setUI(false);
      rec.onend = ()=> setUI(false);
      rec.start();
    }catch(_e){
      setUI(false);
      if(typeof pushMsg === 'function'){
        pushMsg('assistant', TT('ai.voice_failed', null, 'Не смог включить голосовой ввод.'));
      }
    }
  }

  function stop(){
    // Stop either MediaRecorder or SpeechRecognition (if running)
    const my = ++opId;
    try{
      if(mediaRec && mediaRec.state !== 'inactive'){
        mediaRec.stop();
        return;
      }
    }catch(_){}
    // If we reached here, nothing to stop
    setUI(false);
    stopTracks();
  }

  btn.addEventListener('click', ()=>{
    if(recording) stop();
    else start();
  });
})();;
// Initial render
renderChat();

  }catch(e){
    console.warn('home/ai wiring error', e);
  }
  // Tabs (with gate)
  document.querySelectorAll('.tabs .tab').forEach(t=>{
    t.addEventListener('click', ()=>{
      // Если раздел заблокирован — ведём в Ustawienia
      if (t.classList.contains('disabled')) {
        document.querySelector('[data-sec=ustawienia]')?.click();
        return;
      }

      const secId = t.dataset.sec;
      if (!secId) return;

      // Панель = раздел pulpit (дневной обзор)
      if (secId === 'pulpit' && window.appGoSection) {
        window.appGoSection('pulpit');
        return;
      }

      // Остальные вкладки ведут в свои разделы
      if (window.appGoSection) {
        window.appGoSection(secId);
      }
    });
  });

  // Buttons
  $id('backHomeBtn')?.addEventListener('click', ()=> { try{ if(window.appGoHome) window.appGoHome(); }catch(_e){} });
  $id('settingsBtn')?.addEventListener('click', ()=> window.appGoSection && appGoSection('ustawienia'));
  $id('runAIAll')?.addEventListener('click', runAIAll);
  $id('makePlan')?.addEventListener('click', renderPlan);
  $id('applyPlan')?.addEventListener('click', renderPlan);
   $id('applyMinPay')?.addEventListener('click', () => {
    try {
      // Заглушка: просто пересчитать план и сохранить
      render();
      saveLocal();
      pushState();
    } catch (e) {
      console.warn('applyMinPay error', e);
    }
  });

  $id('syncNow')?.addEventListener('click', fetchSources);
  $id('closeDay')?.addEventListener('click', openCloseDayModal);
  $id('closeDayCancel')?.addEventListener('click', closeCloseDayModal);

  $id('addToday')?.addEventListener('click', openAddTodayModal);
  $id('addTodayCancel')?.addEventListener('click', closeAddTodayModal);
  $id('addBankBtn')?.addEventListener('click', goAddBank);
  $id('addCashBtn')?.addEventListener('click', goAddCash);
  $id('addBillsBtn')?.addEventListener('click', goAddBills);

  $id('exportBook')?.addEventListener('click', exportBookCSV);
  $id('exportTxCSV')?.addEventListener('click', exportTxCSV);
  $id('exportBillsCSV')?.addEventListener('click', exportBillsCSV);
  $id('exportCashCSV')?.addEventListener('click', exportCashCSV);


  $id('runDayAI')?.addEventListener('click', ()=>{ try{ fetchSources(); }catch(e){ console.warn('runDayAI error', e); } });
  $id('openAIQuestions')?.addEventListener('click', ()=>{
    try{
      if(window.appGoSection) window.appGoSection('aiAssist');
      const inp = document.getElementById('aiChatInput');
      if(inp){
        inp.focus();
        try{ inp.scrollIntoView({block:'center'}); }catch(_){}
      }
    }catch(e){
      console.warn('openAIQuestions error', e);
    }
  });


// File/url
// Безопасный импорт файлов с честным сообщением пилоту
async function safeImportFile(kindLabel, importerFn, file){
  try{
    const rows = await importerFn(file);
    return Array.isArray(rows) ? rows : [];
  }catch(err){
    console.error("Ошибка импорта (" + kindLabel + ")", err);
    alert(
      "Ошибка при импорте файла (" + kindLabel + ").\n\n" +
      "Для пилота: попробуйте другой экспорт (CSV) или пришлите файл Никите, чтобы мы допилили импорт."
    );
    return [];
  }
}

$id('txFile')?.addEventListener('change', async e=>{
  const f = e.target.files[0];
  if(!f) return;

  // Защищённый импорт выписки
  const newRows = await safeImportFile("выписка", importTxByFile, f);

  if(!newRows.length){
alert(
  "Не могу распознать файл.\n\n" +
  "Как это работает сейчас:\n" +
  "- если это CSV, приложение может спросить номера колонок: дата, сумма, описание, контрагент;\n" +
  "- если таких окон не было, файл вообще не читается как таблица.\n\n" +
  "Лучше всего сейчас работает простой CSV-экспорт из банка или Stripe.\n" +
  "Если это уже CSV и ошибка повторяется – пришлите файл команде OneTapDay, формат добавим в импорт."
);
    e.target.value = "";
    return;
  }

  const normalized = normalizeImportedTxRows(newRows);

  if(!normalized.length){
    alert("Не могу распознать файл. Проверьте формат или выберите колонки вручную.");
    e.target.value = "";
    return;
  }

   if(typeof confirmTxImport === "function"){
    const ok = confirmTxImport(normalized);
    if(!ok){
      alert("Импорт отменён.");
      e.target.value = "";
      return;
    }
  }

// P0: сначала привязываем импорт к счёту (чтобы сразу было понятно, откуда выписка)
if(typeof assignImportedTxToAccount === "function"){
  assignImportedTxToAccount(normalized);
}

// P0: merge без потери пользовательских правок + защита от повторного/частичного импорта
const existingTx = Array.isArray(tx) ? tx : [];

function _otdNormTxt(s){
  return String(s||'').trim().toLowerCase().replace(/\s+/g,' ').slice(0,120);
}
function _otdAmt(v){
  try{ return (typeof asNum==="function") ? asNum(v) : Number(String(v||'').replace(',','.')); }catch(_){ return 0; }
}
function _otdTxFp(r){
  const d = String(toISO(getVal(r,["Data księgowania","Data","date","Дата"])||"") || "").slice(0,10);
  const amt = _otdAmt(getVal(r,["Kwota","Kwота","amount","Kwota_raw"])||0);
  const cur = String(getVal(r,["Waluta","currency","Валюта"])||"PLN").toUpperCase().trim();
  const desc = _otdNormTxt(getVal(r,["Tytuł/Opis","Opis transakcji","Opis","description","Описание"])||"");
  const cp = _otdNormTxt(getVal(r,["Kontrahent","Counterparty","Контрагент"])||"");
  const bal = _otdNormTxt(getVal(r,["Saldo po operacji","Saldo po","balance"])||"");
  // intentionally NOT including account in fp (so re-assigning account doesn't break dedupe)
  return [d, Math.round(amt*100), cur, desc, cp, bal].join("|");
}
function _otdBankId(r){
  const raw = String(getVal(r,["ID transakcji","Transaction ID","Id transakcji","ID","id"])||"").trim();
  return raw || "";
}
function _otdEnrichKeep(existing, incoming){
  // fill only blanks; never overwrite user's category/status if already set
  if(!existing || !incoming) return;
  Object.keys(incoming).forEach(k=>{
    const v = incoming[k];
    if(v === undefined || v === null) return;
    const cur = existing[k];
    const empty = (cur === undefined || cur === null || cur === "");
    if(empty && v !== "") existing[k] = v;
  });
  // ensure account fields
  if(incoming._acc && !existing._acc) existing._acc = incoming._acc;
  if(incoming["ID konta"] && !existing["ID konta"]) existing["ID konta"] = incoming["ID konta"];
}

// Build multiset of existing fingerprints + fast bankId lookup
const bankIdSet = new Set();
const fpToIdxs = new Map();
existingTx.forEach((r, idx)=>{
  if(!r) return;
  const bid = _otdBankId(r);
  if(bid) bankIdSet.add(bid);
  const fp = _otdTxFp(r);
  if(!fpToIdxs.has(fp)) fpToIdxs.set(fp, []);
  fpToIdxs.get(fp).push(idx);
});
const fpUsed = new Map();

const toAdd = [];
normalized.forEach(r=>{
  if(!r) return;

  const bid = _otdBankId(r);
  if(bid){
    if(bankIdSet.has(bid)){
      // duplicate by bank transaction id -> enrich and skip adding
      const fp = _otdTxFp(r);
      const list = fpToIdxs.get(fp) || [];
      const used = fpUsed.get(fp) || 0;
      if(list.length && used < list.length){
        _otdEnrichKeep(existingTx[list[used]], r);
        fpUsed.set(fp, used+1);
      }
      return;
    }
    // IMPORTANT: dedupe внутри импорта по bankId (если файл содержит повтор)
    bankIdSet.add(bid);
  }

  const fp = _otdTxFp(r);
  const list = fpToIdxs.get(fp) || [];
  const used = fpUsed.get(fp) || 0;
  if(list.length && used < list.length){
    // duplicate by fingerprint -> enrich existing row and skip adding
    _otdEnrichKeep(existingTx[list[used]], r);
    fpUsed.set(fp, used+1);
    return;
  }

  toAdd.push(r);
  // NOTE: we intentionally do NOT "dedupe inside the same file" by fp, because identical operations may be real.
});

tx = existingTx.concat(toAdd);

if(typeof ensureTxIds === "function") ensureTxIds();

// Нормальные счета по картам из файла

  // Нормальные счета по картам из файла
  ensureCardAccountsFromTx();

  // Убиваем мусорные авто-счета вида tx-2025-...
  dropTxGeneratedAccounts();

  // ВАЖНО: НЕ вызываем inferAccounts()

  render();
  saveLocal();
  pushState();

  // Сбрасываем input, чтобы можно было залить тот же файл ещё раз
  e.target.value = "";
});



  $id('txImage')?.addEventListener('change', async (e)=>{ 
    const files = [...(e.target.files || [])];
    if(!files.length) return;
    try{
      if(window.OTD_DocVault?.addFiles){
        await window.OTD_DocVault.addFiles(files, { source:'image', type:'statement' });
        try{ await window.OTD_DocVault.refresh?.(null); }catch(_){}
        try{ window.appGoSection?.('docs'); }catch(_){}
        try{ toast?.('Dodano do Dokumentów (OCR wyłączony)'); }catch(_){}
      }else{
        alert('Dokumenty: moduł DocVault nie jest gotowy.');
      }
    }catch(err){
      console.warn('txImage->DocVault error', err);
      alert('Nie udało się dodać plików do Dokumentów.');
    }finally{
      try{ e.target.value = ''; }catch(_){}
    }
  });

  $id('billFile')?.addEventListener('change', async e=>{
  const f = e.target.files[0];
  if(!f) return;

  // Защищённый импорт фактур
  const newRows = await safeImportFile("фактуры", importBillsByFile, f);

  if(!newRows.length){
    alert("Не могу распознать файл фактур. Проверьте формат или попробуйте CSV.");
    e.target.value = "";
    return;
  }

  const normalized = normalizeImportedBillsRows(newRows);

  if(!normalized.length){
    alert("Файл фактур распознан, но данные пустые.");
    e.target.value = "";
    return;
  }

  const ok = (typeof confirmBillsImport === "function")
    ? confirmBillsImport(normalized)
    : confirm(TT("dialogs.import_invoices_from_file", null, "Импортировать фактуры из файла?"));

  if(!ok){
    alert("Импорт отменён.");
    e.target.value = "";
    return;
  }

  // ВАЖНО: не стираем старые фактуры
  bills = Array.isArray(bills) ? bills : [];
  bills.push(...normalized);

  saveLocal();
  render();
  pushState();

  e.target.value = "";
});


  $id('billImage')?.addEventListener('change', async (e)=>{ 
    const files = [...(e.target.files || [])];
    if(!files.length) return;
    try{
      if(window.OTD_DocVault?.addFiles){
        await window.OTD_DocVault.addFiles(files, { source:'image', type:'invoice' });
        try{ await window.OTD_DocVault.refresh?.(null); }catch(_){}
        try{ window.appGoSection?.('docs'); }catch(_){}
        try{ toast?.('Dodano do Dokumentów (OCR wyłączony)'); }catch(_){}
      }else{
        alert('Dokumenty: moduł DocVault nie jest gotowy.');
      }
    }catch(err){
      console.warn('billImage->DocVault error', err);
      alert('Nie udało się dodać plików do Dokumentów.');
    }finally{
      try{ e.target.value = ''; }catch(_){}
    }
  });

  // Cash quick & ops
function quickCashReadAmount(){
  const el = $id('quickAmt');
  if (!el) return NaN;
  const raw = String(el.value || "").replace(",", ".");
  const n = (typeof asNum === "function") ? asNum(raw) : Number(raw);
  return n;
}

function quickCashAdd(kind){
  const amtEl  = $id('quickAmt');
  const noteEl = $id('quickNote');
  const catSel = $id('quickCashCat');
  if (!amtEl) return;

  const amount  = quickCashReadAmount();
  const comment = (noteEl?.value || "").trim();
  const cat     = catSel ? (catSel.value || "") : "";

  if (!amount || !isFinite(amount)) {
    alert("Сначала введите сумму");
    return;
  }

  if (typeof addKasa !== "function") {
    console.warn("addKasa is not a function");
    return;
  }

  addKasa(kind, amount, comment, 'manual', cat);

  amtEl.value = "";
  if (noteEl) noteEl.value = "";
}

function quickCashClose(){
  if (typeof kasaBalance !== "function") {
    console.warn("kasaBalance is not a function");
    return;
  }
  const current = kasaBalance().toFixed(2);
  const a = prompt('Итог в кассе (PLN):', current);
  if (a === null) return;
  const v = (typeof asNum === "function") ? asNum(a) : Number(String(a).replace(",", "."));
  if (isNaN(v)) {
    alert('Сумма некорректна');
    return;
  }
  addKasa('zamknięcie', v, 'close', 'manual');
}

// безопасно навешиваем обработчики при загрузке
$id('addIn')?.addEventListener('click', ()=> quickCashAdd('przyjęcie'));
$id('addOut')?.addEventListener('click', ()=> quickCashAdd('wydanie'));
$id('cashClose')?.addEventListener('click', ()=> quickCashClose());

// Save on unload (sendBeacon fallback)
  window.addEventListener('beforeunload', ()=>{
    if(!REMOTE_OK) return;
    try{
      const email=localStorage.getItem(USER_KEY)||"";
      if(!email) return;
      const body={
        email,
        tx: _otdGetJSON('tx_manual_import', []),
        bills: _otdGetJSON('bills_manual_import', []),
        kasa: _otdGetJSON('kasa', []),
        accMeta: _otdGetJSON('accMeta', {}),
        settings: stateKeys.reduce((m,k)=> (m[k]=localStorage.getItem(k), m), {})
      };
      const blob=new Blob([JSON.stringify(body)],{type:'application/json'});
      navigator.sendBeacon && navigator.sendBeacon(`${API_BASE}/state/save`, blob);
    }catch(e){}
  });
});// Speech

// Cash voice (LIVE + AI categorize):
// - Live text while speaking (Web Speech API) where available
// - Fallback: record → server STT (/api/ai/transcribe)
// - Then (optional): AI parse (/api/ai/cash/parse) to detect amount(s) + category(ies)
// Notes:
// - Single op: NO auto-save. User confirms by tapping "Zapisz".
// - Multiple ops in one phrase: we ask confirmation to add them.
(() => {
  const micBtn = $id('micBtn');
  if(!micBtn || micBtn.dataset.voiceBound === '1') return;
  micBtn.dataset.voiceBound = '1';

  // ---------- mini toast (bottom overlay) ----------
  let toastEl = $id('cashVoiceToast');
  if(!toastEl){
    toastEl = document.createElement('div');
    toastEl.id = 'cashVoiceToast';
    toastEl.style.position = 'fixed';
    toastEl.style.zIndex = '9999';
    toastEl.style.padding = '10px 12px';
    toastEl.style.borderRadius = '14px';
    toastEl.style.background = 'rgba(0,0,0,0.72)';
    toastEl.style.border = '1px solid rgba(255,255,255,0.10)';
    toastEl.style.color = '#fff';
    toastEl.style.fontSize = '14px';
    toastEl.style.lineHeight = '1.25';
    toastEl.style.backdropFilter = 'blur(10px)';
    toastEl.style.display = 'none';
    toastEl.style.pointerEvents = 'none';
    document.body.appendChild(toastEl);
  }

  let toastHideT = null;

  function _cashVoiceActionsRect(){
    try{
      // prefer kasa bar
      const root = document.querySelector('.section#kasa.active') || $id('kasa') || document;
      const actions = (root && root.querySelector) ? (root.querySelector('.q-actions') || root.querySelector('#cashQuickActions')) : null;
      const el = actions || document.querySelector('.q-actions') || null;
      return el ? el.getBoundingClientRect() : null;
    }catch(_){
      return null;
    }
  }

  function _cashVoiceToastReposition(){
    try{
      const r = _cashVoiceActionsRect();
      if(!r) return;
      const inset = 14; // keep inside the pill
      toastEl.style.left = (r.left + inset) + 'px';
      toastEl.style.width = Math.max(140, (r.width - inset*2)) + 'px';
      toastEl.style.right = 'auto';
      toastEl.style.transform = 'none';
      // place above the bottom action bar
      toastEl.style.bottom = (window.innerHeight - r.top + 10) + 'px';
    }catch(_){}
  }

  window.addEventListener('resize', ()=>{ try{ if(toastEl && toastEl.style.display !== 'none') _cashVoiceToastReposition(); }catch(_){} });

  function setStatus(text, sticky){
    try{
      if(toastHideT){ clearTimeout(toastHideT); toastHideT = null; }
      if(!text){
        toastEl.style.display = 'none';
        toastEl.textContent = '';
        return;
      }
      _cashVoiceToastReposition();
      toastEl.textContent = text;
      toastEl.style.display = 'block';
      if(!sticky){
        toastHideT = setTimeout(()=>{ try{ toastEl.style.display='none'; }catch(_){} }, 3500);
      }
    }catch(_){}
  }

  // ---------- helpers ----------
  function getLang(){
    // prefer explicit selector if present (cash sheet)
    try{
      const sel = $id('speechLang');
      const v = sel && sel.value ? String(sel.value) : '';
      if(v){
        try{ localStorage.setItem('speechLang', v); }catch(_){}
        return v;
      }
    }catch(_){}
    return localStorage.getItem('speechLang')
      || localStorage.getItem('otd_lang')
      || 'pl-PL';
  }

  function showCashSheet(kind){
    // IMPORTANT: in this MVP the cash sheet is opened via backdrop display:flex (cashSheetBackdrop)
    const sheet = $id('cashSheet');
    const backdrop = $id('cashSheetBackdrop') || $id('sheetBackdrop');

    try{
      if(backdrop){
        backdrop.style.display = 'flex';
        if(backdrop.classList) backdrop.classList.add('show');
      }
      if(sheet && sheet.classList) sheet.classList.add('open');
    }catch(_){}

    // select type
    const outBtn = $id('cashTypeOut');
    const inBtn = $id('cashTypeIn');
    const k = String(kind || '').toLowerCase();
    const isIn = (k === 'in' || k.includes('przyj') || k === 'przyjęcie' || k === 'przyjecie');
    if(isIn){
      if(inBtn) inBtn.click();
    }else{
      if(outBtn) outBtn.click();
    }

    // categories must be filled
    try{ if(typeof fillQuickCashCat === 'function') fillQuickCashCat(); }catch(_){}
  }

  function prefillSingle(item, rawText){
    try{
      const _k = String((item && item.kind) || '').toLowerCase();
      const kind = (_k === 'in' || _k.includes('przyj') || _k === 'przyjęcie' || _k === 'przyjecie') ? 'in' : 'out';
      const amt = Number(item && item.amount);
      const note = String((item && item.note) || '').trim() || String(rawText || '').trim();
      const catId = String((item && item.categoryId) || '').trim();

      showCashSheet(kind);

      const amtEl = $id('quickAmt');
      if(amtEl && isFinite(amt)) amtEl.value = Math.abs(amt).toFixed(2);

      const noteEl = $id('quickNote');
      if(noteEl) noteEl.value = note;

      const catEl = $id('quickCashCat');
      if(catEl && catId){
        // if option exists, set it
        const has = Array.from(catEl.options || []).some(o => String(o.value) === catId);
        if(has) catEl.value = catId;
      }
    }catch(e){
      console.warn('prefillSingle error', e);
    }
  }

  function fmtItemLine(it){
    try{
      const _k = String(it && it.kind || '').toLowerCase();
      const sign = (_k === 'in' || _k.includes('przyj') || _k === 'przyjęcie' || _k === 'przyjecie') ? '+' : '-';
      const amt = isFinite(Number(it.amount)) ? Math.abs(Number(it.amount)).toFixed(2) : String(it.amount||'');
      const note = String(it.note || '').trim();
      const cat = String(it.categoryId || '').trim();
      return `${sign}${amt} | ${note}${cat ? ' | ' + cat : ''}`;
    }catch(_){
      return '';
    }
  }

  // ---------- fallback parser (no AI) ----------
  function parseCash(text){
    const t = String(text||'').trim();
    if(!t) return { kind:'out', amount:0, note:'' };

    const low = t.toLowerCase();

    // amounts (supports 50, 50.5, 50,50, -50)
    const nums = [];
    const re = /[-+]?\d+(?:[.,]\d{1,2})?/g;
    let m;
    while((m = re.exec(t))){
      const raw = m[0];
      const n = Number(String(raw).replace(',', '.'));
      if(isFinite(n)) nums.push(n);
    }

    // determine sign/kind
    let kind = 'out';
    const incomeHints = ['przychód','wpływ','wplyw','dostałem','otrzymałem','zarobiłem','plus','+','przyjęcie','wplata','deposit','income','received','got paid'];
    const expenseHints = ['wydatek','wydatki','kupiłem','kupilem','zapłaciłem','zaplacilem','płaciłem','placilem','minus','-','zapłata','zaplata','spent','paid','purchase','wydaj','wydałem','wydałem'];
    if(incomeHints.some(h => low.includes(h))) kind = 'in';
    if(expenseHints.some(h => low.includes(h))) kind = 'out';

    // choose amount: prefer explicit sign in text, else first number
    let amount = 0;
    if(nums.length){
      // if user said "minus 50" but without '-', nums has 50; keep kind logic above
      amount = Math.abs(nums[0]);
    }

    // strip numbers and keywords for note
    let note = t
      .replace(re, ' ')
      .replace(/\b(minus|plus|wydatek|wydatki|przychód|przychod|przyjęcie|przyjecie|spent|paid|income|deposit)\b/gi,' ')
      .replace(/\s+/g,' ')
      .trim();

    return { kind, amount, note };
  }

  // ---------- AI parse ----------
  async function aiParseCash(text){
    const t = String(text||'').trim();
    if(!t) return null;
    try{
      const r = await fetch(`${API_BASE}/ai/cash/parse`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'include',
        body: JSON.stringify({ text: t, lang: getLang() })
      });
      const j = await r.json().catch(()=> ({}));
      if(!r.ok || !j || j.success !== true || !Array.isArray(j.items)) return null;
      const items = j.items.filter(it => it && isFinite(Number(it.amount)) && Number(it.amount) !== 0);
      return items.length ? items : null;
    }catch(_e){
      return null;
    }
  }

  async function handleFinalText(text){
    const t = String(text||'').trim();
    if(!t){ setStatus('', false); return; }

    // quick show what we heard
    setStatus('🎙️ ' + t, false);

    // try AI parse (amount + category, possibly multiple ops)
    const items = await aiParseCash(t);
    if(items && items.length){
      if(items.length === 1){
        const it = items[0] || {};
        try{
          const _k = String(it && it.kind || '').toLowerCase();
          const kind = (_k === 'in' || _k.includes('przyj') || _k.includes('przych') || _k.includes('income') || _k.includes('deposit') || _k === 'przyjęcie' || _k === 'przyjecie') ? 'przyjęcie' : 'wydanie';
          const amt = Math.abs(Number(it.amount));
          const note = String(it.note || '').trim() || t;
          const cat  = String(it.categoryId || '').trim();

          // Auto-save single operation (no manual confirmation needed)
          if(typeof addKasa === 'function' && isFinite(amt) && amt !== 0){
            addKasa(kind, amt, note, 'voice-ai', cat);
            try{ if(typeof render === 'function') render(); }catch(_){}
            setStatus('✅ Zapisano z głosu', false);
          }else{
            prefillSingle(it, t);
          }
        }catch(_e){
          prefillSingle(it, t);
        }
        return;
      }

      const lines = items.map(fmtItemLine).filter(Boolean).join('\n');
      const ok = confirm(`Rozpoznałem ${items.length} operacje:\n\n${lines}\n\nDodać je do kasy?`);
      if(ok){
        try{
          for(const it of items){
            const _k = String(it && it.kind || '').toLowerCase();
            const kind = (_k === 'in' || _k.includes('przyj') || _k === 'przyjęcie' || _k === 'przyjecie') ? 'przyjęcie' : 'wydanie';
            const amt = Math.abs(Number(it.amount));
            const note = String(it.note || '').trim();
            const cat = String(it.categoryId || '').trim();
            if(typeof addKasa === 'function') addKasa(kind, amt, note, 'voice-ai', cat);
          }
          try{ if(typeof render === 'function') render(); }catch(_){}
          setStatus(`✅ Dodano ${items.length}`, false);
        }catch(_e){
          // fallback: prefill first item
          prefillSingle(items[0], t);
        }
      }else{
        prefillSingle(items[0], t);
      }
      return;
    }

    // fallback heuristic
    const p = parseCash(t);
    prefillSingle({ kind: p.kind, amount: p.amount, note: p.note, categoryId: '' }, t);
  }

  // ---------- UI state ----------
  function setUI(on){
    try{
      micBtn.classList.toggle('recording', !!on);
      // DON'T replace innerHTML: it breaks layout (and you wanted it to stay iPhone-like)
      const ico = micBtn.querySelector('.q-ico');
      if(ico) ico.textContent = on ? '⏹' : '🎤';
    }catch(_){}
  }

  // ---------- Mode A: Live transcription via Web Speech API ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let speechRec = null;
  let liveText = '';
  let isRecording = false;
  let finalizePending = false;
  let finalizedOnce = false;

  function startLive(){
    if(!SR) return false;
    try{
      liveText = '';
      finalizePending = false;
      finalizedOnce = false;

      speechRec = new SR();
      speechRec.lang = getLang();
      speechRec.continuous = true;
      speechRec.interimResults = true;
      speechRec.maxAlternatives = 1;

      speechRec.onresult = (e)=>{
        try{
          let finalT = '';
          let interimT = '';
          for(let i = e.resultIndex; i < e.results.length; i++){
            const r = e.results[i];
            const chunk = (r && r[0] && r[0].transcript) ? String(r[0].transcript) : '';
            if(!chunk) continue;
            if(r.isFinal) finalT += chunk + ' ';
            else interimT += chunk + ' ';
          }
          const merged = (finalT + interimT).trim();
          if(merged){
            liveText = merged;
            setStatus('🎙️ ' + merged, true);
          }else{
            setStatus('🎙️ ...', true);
          }
        }catch(_){}
      };
      speechRec.onerror = (e)=>{
        setStatus('🎙️ Błąd głosu: ' + (e && e.error ? e.error : ''), false);
      };
      speechRec.onend = ()=>{
        const pending = finalizePending;
        const text = String(liveText || '').trim();
        if(finalizedOnce){
          speechRec = null;
          finalizePending = false;
          isRecording = false;
          setUI(false);
          return;
        }
        speechRec = null;
        finalizePending = false;
      finalizedOnce = false;
        isRecording = false;
        setUI(false);
        if(pending){
          setStatus('🎙️ Przetwarzam…', true);
          finalizedOnce = true;
          handleFinalText(text);
        }else{
          if(text){ finalizedOnce = true; handleFinalText(text); }
          else setStatus('', false);
        }
      };

      isRecording = true;
      setUI(true);
      setStatus('🎙️ ...', true);
      speechRec.start();
      return true;
    }catch(_e){
      speechRec = null;
      return false;
    }
  }

  function stopLive(){
    try{
      if(!speechRec){
        finalizePending = false;
      finalizedOnce = false;
        isRecording = false;
        setUI(false);
        return;
      }
      finalizePending = true;
      setStatus('🎙️ Przetwarzam…', true);

      try{ speechRec.stop(); }catch(e){ try{ speechRec.abort && speechRec.abort(); }catch(_){ } }

      // Some browsers never fire onend reliably. Force finalize after a short delay.
      setTimeout(()=>{
        try{
          if(!speechRec) return; // onend already handled it
          const text = String(liveText || '').trim();
          try{ speechRec.abort && speechRec.abort(); }catch(_){}
          speechRec = null;
          finalizePending = false;
      finalizedOnce = false;
          isRecording = false;
          setUI(false);
          if(text){ finalizedOnce = true; handleFinalText(text); }
          else setStatus('', false);
        }catch(_){}
      }, 1200);
    }catch(_){
      speechRec = null;
      finalizePending = false;
      finalizedOnce = false;
      isRecording = false;
      setUI(false);
    }
  }

  // ---------- Mode B: Server STT fallback ----------
  let mediaRec = null;
  let mediaStream = null;
  let chunks = [];

  function stopTracks(){
    try{
      if(mediaStream){
        mediaStream.getTracks().forEach(t=>{ try{ t.stop(); }catch(_){ } });
      }
    }catch(_){}
    mediaStream = null;
  }

  function blobToBase64(blob){
    return new Promise((resolve, reject)=>{
      try{
        const r = new FileReader();
        r.onload = ()=> {
          const s = String(r.result || '');
          const b64 = s.includes(',') ? s.split(',')[1] : s;
          resolve(b64);
        };
        r.onerror = ()=> reject(r.error || new Error('FileReader error'));
        r.readAsDataURL(blob);
      }catch(e){ reject(e); }
    });
  }

  async function transcribe(blob, mime){
    const b64 = await blobToBase64(blob);
    const r = await fetch(`${API_BASE}/ai/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ audio: b64, mime: mime || blob.type || 'audio/webm', language: getLang() })
    });
    const j = await r.json().catch(()=> ({}));
    if(!r.ok || !j || j.success !== true){
      throw new Error((j && j.error) ? j.error : ('Transcribe failed ' + r.status));
    }
    return String(j.text || '').trim();
  }

  async function startMedia(){
    const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
    mediaStream = stream;
    chunks = [];
    let opts = {};
    try{
      const prefer = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/ogg','audio/mp4'];
      for(const m of prefer){
        if(window.MediaRecorder && typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(m)){
          opts.mimeType = m;
          break;
        }
      }
    }catch(_){}
    mediaRec = new MediaRecorder(stream, opts);
    mediaRec.ondataavailable = (e)=>{ try{ if(e.data && e.data.size>0) chunks.push(e.data); }catch(_){} };
    return true;
  }

  async function startServerSTT(){
    if(!(navigator.mediaDevices && window.MediaRecorder)) return false;

    try{
      await startMedia();
      isRecording = true;
      setUI(true);
      setStatus('🎙️ Nagrywanie…', true);

      mediaRec.onstop = async ()=>{
        const localChunks = chunks.slice();
        const mime = (mediaRec && mediaRec.mimeType) ? mediaRec.mimeType : '';
        isRecording = false;
        setUI(false);
        stopTracks();

        try{
          setStatus('🎙️ Przetwarzam…', true);
          const blob = new Blob(localChunks, { type: mime || 'audio/webm' });
          const text = await transcribe(blob, mime);
          finalizedOnce = true;
          handleFinalText(text);
        }catch(_e){
          setStatus('🎙️ Nie rozpoznałem. Sprawdź klucz AI / dostęp.', false);
        }
      };

      mediaRec.start();
      return true;
    }catch(_e){
      stopTracks();
      isRecording = false;
      setUI(false);
      return false;
    }
  }

  function stopServerSTT(){
    try{
      if(mediaRec && mediaRec.state !== 'inactive'){
        setStatus('🎙️ Przetwarzam…', true);
        mediaRec.stop();
        return;
      }
    }catch(_){}
    isRecording = false;
    setUI(false);
    stopTracks();
  }

  // ---------- Click handler ----------
  micBtn.addEventListener('click', ()=>{
    if(isRecording){
      if(speechRec) stopLive();
      else stopServerSTT();
      return;
    }

    // Prefer live UX (ChatGPT-like): show text while speaking.
    const okLive = startLive();
    if(okLive) return;

    // Fallback to server STT (record → transcribe)
    startServerSTT();
  });

})();


/* === Settings MVP bindings (Save/Clear) ===
   Keep this tiny and stable: settings screen is intentionally minimal now.
*/
(function(){
  // Make settings buttons unbreakable: render() may rebuild DOM, so we use delegated handlers.
  function doSaveSettingsLocal(){
    try{
      if(typeof saveLocal==='function') saveLocal();
      if(typeof inferAccounts==='function') inferAccounts();
      if(typeof render==='function') render();
    }catch(e){
      console.warn('applySettings error', e);
    }
  }

  function doClearHistoryLocal(){
    try{
      const ok = confirm(TT('dialogs.clear_local_history', null, 'Wyczyścić lokalną historię? (Transakcje, faktury, kasa)\n\nKategorie zostaną.'));
      if(!ok) return;

      try{ window.tx = []; }catch(e){}
      try{ window.bills = []; }catch(e){}
      try{ window.kasa = []; }catch(e){}
      try{ window.accMeta = {}; }catch(e){}

      const keysToRemove = [
        'tx_manual_import','bills_manual_import','kasa','accMeta',
        'txUrl','billUrl',
        'tx_last_import','bill_last_import','cash_last_import'
      ];
      keysToRemove.forEach(k=>{ try{ localStorage.removeItem(k); }catch(e){} });

      if(typeof inferAccounts==='function') try{ inferAccounts(); }catch(e){}
      if(typeof render==='function') try{ render(); }catch(e){}
      alert('Wyczyszczono lokalnie ✅');
    }catch(e){
      console.warn('clearAll error', e);
    }
  }

  // Expose for debugging / optional inline onclick.
  try{ window._otdSaveSettings = doSaveSettingsLocal; }catch(_){ }
  try{ window._otdClearHistoryLocal = doClearHistoryLocal; }catch(_){ }

  function delegatedSettingsHandler(e){
    const t = e.target;
    if(!t) return;

    const clearBtn = t.closest && t.closest('#clearAll');
    if(clearBtn){
      e.preventDefault();
      e.stopPropagation();
      doClearHistoryLocal();
      return;
    }

    const saveBtn = t.closest && t.closest('#applySettings');
    if(saveBtn){
      e.preventDefault();
      e.stopPropagation();
      doSaveSettingsLocal();
    }
  }

  // Capture phase to survive any stopPropagation in the app.
  document.addEventListener('click', delegatedSettingsHandler, true);
  document.addEventListener('pointerup', delegatedSettingsHandler, true);
})();

