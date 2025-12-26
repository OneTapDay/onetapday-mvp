(function(){
  const $ = (id)=>document.getElementById(id);

  function esc(s){
    return String(s==null?'':s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }


  async function jget(url){
    const r = await fetch(url, { credentials:'include' });
    const j = r.ok ? await r.json() : null;
    if (!r.ok) throw new Error((j && (j.error || j.message)) || ('HTTP '+r.status));
    return j;
  }
  async function jpost(url, body){
    const r = await fetch(url, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      credentials:'include',
      body: JSON.stringify(body || {})
    });
    const j = r.ok ? await r.json() : null;
    if (!r.ok) throw new Error((j && (j.error || j.message)) || ('HTTP '+r.status));
    return j;
  }

  // Download helper (keeps accountant UI on screen, no white tabs)
  function parseFilenameFromContentDisposition(cd){
    try{
      const v = String(cd || '');
      // filename*=UTF-8''... (RFC 5987)
      const m1 = v.match(/filename\*=(?:UTF-8''|utf-8'')?([^;]+)/i);
      if (m1 && m1[1]) return decodeURIComponent(m1[1].trim().replace(/^"|"$/g,''));
      const m2 = v.match(/filename=([^;]+)/i);
      if (m2 && m2[1]) return m2[1].trim().replace(/^"|"$/g,'');
    }catch(_){}
    return '';
  }

  async function downloadFile(url, fallbackName){
    const r = await fetch(url, { credentials:'include' });
    if (!r.ok){
      const t = await r.text().catch(()=> '');
      throw new Error((t || '').trim() || ('HTTP ' + r.status));
    }
    const blob = await r.blob();
    const cd = r.headers.get('content-disposition') || r.headers.get('Content-Disposition') || '';
    const name = parseFilenameFromContentDisposition(cd) || fallbackName || 'export.zip';

    const a = document.createElement('a');
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ try{ URL.revokeObjectURL(href); }catch(_){} try{ a.remove(); }catch(_){} }, 1200);
    return true;
  }


/* ==== OTD_NOTIF_V2: in-app notifications (accountant) ==== */
const _otdNotif = (function(){
  const API = '/api/notifications';
  const API_MARK = '/api/notifications/mark-read';
  const SEEN_KEY = 'otd_notif_toast_seen_acc';
  let started = false;
  let showAll = false;
  let unreadCount = 0;

  function injectCss(){
    if (document.getElementById('otdNotifCssAcc')) return;
    const st = document.createElement('style');
    st.id = 'otdNotifCssAcc';
    st.textContent = `
      .otdNotifBell{ position:fixed; top:12px; right:12px; z-index:9999; display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:999px; background:rgba(0,0,0,.35); border:1px solid rgba(71,181,0,.35); backdrop-filter: blur(10px); cursor:pointer; user-select:none; }
      .otdNotifBell .t{ font-weight:800; color:#dfffd0; font-size:13px; }
      .otdNotifBadge{ min-width:18px; height:18px; padding:0 6px; border-radius:999px; display:inline-flex; align-items:center; justify-content:center; font-size:12px; font-weight:900; color:#0b1a07; background:#47b500; }
      .otdNotifPanel{ position:fixed; top:54px; right:12px; width:min(380px, calc(100vw - 24px)); max-height:60vh; overflow:auto; z-index:9999; border-radius:16px; background:rgba(0,0,0,.55); border:1px solid rgba(71,181,0,.25); backdrop-filter: blur(14px); box-shadow: 0 12px 30px rgba(0,0,0,.35); display:none; }
      .otdNotifPanel header{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.08); }
      .otdNotifPanel header .h{ font-weight:900; color:#eaffdf; font-size:13px; }
      .otdNotifTabs{ display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
      .otdNotifPanel header button{ background:transparent; border:1px solid rgba(255,255,255,.16); color:#eaffdf; border-radius:12px; padding:6px 10px; cursor:pointer; }
      .otdNotifTabs button.active{ border-color: rgba(71,181,0,.55); background: rgba(71,181,0,.12); }
      .otdNotifItem{ padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.08); cursor:pointer; }
      .otdNotifItem:last-child{ border-bottom:none; }
      .otdNotifItem .m{ color:#eaffdf; font-size:13px; line-height:1.25; }
      .otdNotifItem .d{ margin-top:4px; color:rgba(234,255,223,.7); font-size:11px; }
      .otdNotifItem.read{ opacity:.55; }
      .otdNotifToast{ position:fixed; top:12px; left:50%; transform:translateX(-50%); z-index:10000; max-width:min(560px, calc(100vw - 24px)); padding:10px 12px; border-radius:14px; background:rgba(0,0,0,.70); border:1px solid rgba(71,181,0,.30); backdrop-filter: blur(14px); box-shadow: 0 10px 28px rgba(0,0,0,.35); color:#eaffdf; font-size:13px; display:none; }
      .otdNotifToast b{ color:#dfffd0; }
    `;
    document.head.appendChild(st);
  }

  function ensureUi(){
    injectCss();
    if (document.getElementById('otdNotifBellAcc')) return;

    const bell = document.createElement('div');
    bell.id = 'otdNotifBellAcc';
    bell.className = 'otdNotifBell';
    bell.innerHTML = `<span class="t">🔔</span><span class="t">Уведомления</span><span class="otdNotifBadge" style="display:none">0</span>`;

    const panel = document.createElement('div');
    panel.id = 'otdNotifPanelAcc';
    panel.className = 'otdNotifPanel';
    panel.innerHTML = `
      <header>
        <div class="h">Уведомления</div>
        <div class="otdNotifTabs">
          <button id="otdNotifShowNewAcc" class="active" type="button">Новые</button>
          <button id="otdNotifShowAllAcc" type="button">История</button>
          <button id="otdNotifMarkAllAcc" type="button">Прочитано</button>
        </div>
      </header>
      <div id="otdNotifListAcc"></div>
    `;

    const toast = document.createElement('div');
    toast.id = 'otdNotifToastAcc';
    toast.className = 'otdNotifToast';

    document.body.appendChild(bell);
    document.body.appendChild(panel);
    document.body.appendChild(toast);

    bell.addEventListener('click', async ()=>{
      const shown = panel.style.display === 'block';
      panel.style.display = shown ? 'none' : 'block';
      if (!shown) { try{ await pull(); }catch(_){ } }
    });

    document.addEventListener('click', (e)=>{
      if (!panel || panel.style.display !== 'block') return;
      if (e.target === bell || bell.contains(e.target) || e.target === panel || panel.contains(e.target)) return;
      panel.style.display = 'none';
    });

    document.getElementById('otdNotifMarkAllAcc')?.addEventListener('click', async ()=>{
      try{
        await fetch(API_MARK, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ all:true }) });
      }catch(_){}
      try{ await pull(); }catch(_){}
    });

    document.getElementById('otdNotifShowNewAcc')?.addEventListener('click', async ()=>{
      showAll = false;
      document.getElementById('otdNotifShowNewAcc')?.classList.add('active');
      document.getElementById('otdNotifShowAllAcc')?.classList.remove('active');
      try{ await pull(); }catch(_){}
    });

    document.getElementById('otdNotifShowAllAcc')?.addEventListener('click', async ()=>{
      showAll = true;
      document.getElementById('otdNotifShowAllAcc')?.classList.add('active');
      document.getElementById('otdNotifShowNewAcc')?.classList.remove('active');
      try{ await pull(); }catch(_){}
    });
  }

  function getSeen(){
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch(_) { return []; }
  }
  function setSeen(arr){
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(arr.slice(-200))); } catch(_){}
  }

  function fmtDate(iso){
    try { return new Date(iso).toLocaleString(); } catch(_) { return ''; }
  }

  function showToast(msg){
    const t = document.getElementById('otdNotifToastAcc');
    if (!t) return;
    t.innerHTML = `<b>Уведомление:</b> ${esc(String(msg||''))}`;
    t.style.display = 'block';
    clearTimeout(showToast._tm);
    showToast._tm = setTimeout(()=>{ t.style.display = 'none'; }, 4500);
  }

  async function markRead(ids){
    if (!ids || !ids.length) return;
    try{
      await fetch(API_MARK, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ids }) });
    }catch(_){}
  }

  function scrollToRequest(rid){
    if (!rid) return;
    const cards = document.querySelectorAll('[data-reqid]');
    for (const c of cards){
      if (c.getAttribute('data-reqid') === rid){
        try{ c.scrollIntoView({ behavior:'smooth', block:'start' }); }catch(_){ c.scrollIntoView(); }
        c.style.boxShadow = '0 0 0 2px rgba(71,181,0,.55), 0 12px 30px rgba(0,0,0,.35)';
        setTimeout(()=>{ try{ c.style.boxShadow = ''; }catch(_){ } }, 1400);
        break;
      }
    }
  }

  function render(list, mode){
    const badge = document.querySelector('#otdNotifBellAcc .otdNotifBadge');
    const listEl = document.getElementById('otdNotifListAcc');

    if (badge){
      badge.textContent = String(unreadCount || 0);
      badge.style.display = (unreadCount > 0) ? 'inline-flex' : 'none';
    }
    if (!listEl) return;

    const arr = Array.isArray(list) ? list : [];
    if (!arr.length){
      listEl.innerHTML = `<div class="otdNotifItem" style="cursor:default"><div class="m">${mode==='all' ? 'История пуста.' : 'Пока нет новых уведомлений.'}</div></div>`;
      return;
    }

    listEl.innerHTML = arr.map(n=>{
      const dt = fmtDate(n.createdAt);
      const readCls = (mode==='all' && n.read) ? ' read' : '';
      return `<div class="otdNotifItem${readCls}" data-id="${esc(n.id)}" data-request="${esc(n.requestId||'')}" data-client="${esc(n.clientEmail||'')}">
                <div class="m">${esc(n.message || '')}</div>
                <div class="d">${esc(dt)}</div>
              </div>`;
    }).join('');

    listEl.querySelectorAll('.otdNotifItem[data-id]').forEach(el=>{
      el.addEventListener('click', async ()=>{
        const id = el.getAttribute('data-id');
        const rid = el.getAttribute('data-request');
        const ce  = el.getAttribute('data-client');

        try{ await markRead([id]); }catch(_){}

        // quick jump: select client + open request
        if (ce){
          try{
            selectedClientEmail = ce;
            if ($('newReqBtn')) $('newReqBtn').disabled = false;
            if ($('openClientDocsBtn')) $('openClientDocsBtn').disabled = false;
            renderClients();
            await loadRequests();
          }catch(_){}
        }
        if (rid){
          setTimeout(()=>scrollToRequest(rid), 50);
        }

        try{ await pull(); }catch(_){}
      });
    });
  }

  async function pull(){
    ensureUi();

    // always pull unread to keep badge + toast sane
    let unread = [];
    try{
      const r = await fetch(API + '?unread=1', { credentials:'include' });
      const j = await r.json().catch(()=>({}));
      unread = (j && j.notifications) ? j.notifications : [];
    }catch(_){ unread = []; }

    unreadCount = unread.length;

    if (!showAll){
      render(unread, 'unread');
    } else {
      try{
        const r2 = await fetch(API, { credentials:'include' });
        const j2 = await r2.json().catch(()=>({}));
        const all = (j2 && j2.notifications) ? j2.notifications : [];
        render(all, 'all');
      } catch(_){
        render(unread, 'unread');
      }
    }

    // toast for unseen (from unread only)
    try{
      const seen = new Set(getSeen());
      const newly = unread.filter(n=> n && n.id && !seen.has(n.id));
      if (newly.length){
        showToast(newly[0].message || 'Новое уведомление');
        newly.forEach(n=> seen.add(n.id));
        setSeen(Array.from(seen));
      }
    }catch(_){}
  }

  function start(){
    if (started) return;
    started = true;
    ensureUi();
    pull();
    setInterval(pull, 15000);
  }

  return { start, pull };
})();



  let me = null;
  let clients = [];
  let selectedClientEmail = '';

  // Auto-refresh requests list for selected client (so you see uploads/status without reloading)
  let __otdReqPollTimer = null;
  function startReqPoll(){
    if (__otdReqPollTimer) return;
    __otdReqPollTimer = setInterval(()=>{ 
      try{ 
        if (document.hidden) return;
        if (selectedClientEmail) loadRequests(); 
      }catch(_){ }
    }, 15000);
  }


  function pill(status){
    const s = (status||'pending').toLowerCase();
    const cls = (s==='active')?'active':(s==='pending')?'pending':(s==='declined')?'declined':(s==='removed')?'removed':'pending';
    const label = (s==='active')?'Активен':(s==='pending')?'Ожидает':(s==='declined')?'Отклонён':(s==='removed')?'Удалён':s;
    return `<span class="pill ${cls}">${label}</span>`;
  }

  function show(el, on){ if(!el) return; el.style.display = on ? 'flex' : 'none'; }
  function showBlock(el, on){ if(!el) return; el.style.display = on ? 'block' : 'none'; }
  function setText(el, t){ if(el) el.textContent = t; }

  function renderClients(){
    const table = $('clientsTable');
    const tbody = $('clientsTbody');
    const hint = $('clientsHint');

    if (!clients.length){
      showBlock(table, false);
      showBlock(hint, true);
      return;
    }
    showBlock(hint, false);
    showBlock(table, true);
    tbody.innerHTML = clients.map(c=>{
      const sel = (c.clientEmail === selectedClientEmail) ? 'sel' : '';
      const title = [c.clientEmail, c.company ? ('• '+c.company) : '', c.clientName ? ('• '+c.clientName) : ''].filter(Boolean).join(' ');
      const canReq = (c.status === 'active');
      return `
        <tr class="${sel}" data-email="${c.clientEmail}">
          <td>${title}</td>
          <td>${pill(c.status)}</td>
          <td>
            <button class="smallBtn primary" data-act="select" data-email="${c.clientEmail}">Открыть</button>
            <button class="smallBtn" data-act="request" data-email="${c.clientEmail}" ${canReq?'':'disabled'}>Запросить</button>
            <button class="smallBtn danger" data-act="remove" data-email="${c.clientEmail}">Убрать</button>
          </td>
        </tr>
      `;
    }).join('');

    // bind actions
    tbody.querySelectorAll('button[data-act]').forEach(b=>{
      b.addEventListener('click', async (e)=>{
        e.preventDefault();
        const act = b.getAttribute('data-act');
        const email = b.getAttribute('data-email');
        if (!email) return;

        if (act === 'select'){
          selectedClientEmail = email;
          $('newReqBtn').disabled = false;
          if ($('openClientDocsBtn')) $('openClientDocsBtn').disabled = false;
          setText($('reqHint'), '');
          await loadRequests();
        startReqPoll();
    try{ _otdNotif.start(); }catch(e){}

          renderClients();
          return;
        }
        if (act === 'request'){
          selectedClientEmail = email;
          openReqModal();
          renderClients();
          return;
        }
        if (act === 'remove'){
          if (!confirm('Убрать клиента из списка?')) return;
          try {
            await jpost('/api/accountant/clients/remove', { clientEmail: email });
            await loadClients();
          } catch(err){
            alert('Ошибка: '+(err && err.message ? err.message : err));
          }
        }
      });
    });

    // row click = select
    tbody.querySelectorAll('tr[data-email]').forEach(tr=>{
      tr.addEventListener('click', async (e)=>{
        if (e.target && e.target.tagName === 'BUTTON') return;
        const email = tr.getAttribute('data-email');
        selectedClientEmail = email;
        $('newReqBtn').disabled = false;
          if ($('openClientDocsBtn')) $('openClientDocsBtn').disabled = false;
        await loadRequests();
        startReqPoll();
    try{ _otdNotif.start(); }catch(e){}

        renderClients();
      });
    });
  }

  function renderReqList(list){
    const box = $('reqList');
    const dlBar = $('reqDeadlineBar');
    if (!selectedClientEmail){
      box.innerHTML = '';
      setText($('reqHint'), 'Выбери клиента слева, чтобы создать запрос.');
      if (dlBar) dlBar.style.display = 'none';
      return;
    }
    const reqs = Array.isArray(list) ? list : [];
    try { renderDeadlineBar(reqs); } catch(_){ if (dlBar) dlBar.style.display='none'; }
    if (!reqs.length){
      box.innerHTML = `<div class="hintBox">Пока нет запросов для <b>${selectedClientEmail}</b>. Нажми “Новый запрос”.</div>`;
      return;
    }

    box.innerHTML = reqs.map(r=>{
      const items = r.items || {};
      const parts = [];
      if (items.bank) parts.push('Выписка');
      if (items.invoices) parts.push('Фактуры');
      if (items.receipts) parts.push('Чеки');
      if (items.other) parts.push('Другое: '+String(items.other).slice(0,80));
      const when = (r.month ? r.month : '—');
      const created = (r.createdAt ? new Date(r.createdAt).toLocaleString() : '');
      const st = (r.status || 'open');
      const stLabel = (st === 'received') ? 'Получено'
        : (st === 'approved') ? 'Принято'
        : (st === 'rejected') ? 'Отклонено'
        : 'Ожидает';

      const pillBg = (st === 'received' || st === 'approved')
        ? 'rgba(71,181,0,.15)'
        : (st === 'rejected')
          ? 'rgba(255,80,80,.12)'
          : 'rgba(255,255,255,.06)';

      const pillColor = (st === 'received' || st === 'approved')
        ? '#47b500'
        : (st === 'rejected')
          ? '#ff5050'
          : '#b8c1c7';

      const dueTxt = r.dueAt ? new Date(r.dueAt).toLocaleDateString() : '';
      const isOverdue = !!(r.dueAt && (st !== 'approved') && (Date.now() > new Date(r.dueAt).getTime()) && (st === 'open' || st === 'received' || st === 'rejected'));
      const files = (Array.isArray(r.files) && r.files.length) ? r.files : (r.fileUrl ? [{ fileUrl: r.fileUrl, fileName: r.fileName||'download' }] : []);
      const fileHtml = files.length ? `
        <div class="muted small" style="margin-top:8px">
          <div style="font-weight:800;margin-bottom:4px">Файлы (${files.length})</div>
          <div style="display:flex;flex-direction:column;gap:4px">
            ${files.slice(0,8).map(f=>`<div>• <a href="${esc(f.fileUrl)}" target="_blank" rel="noopener">${esc(f.fileName||'download')}</a></div>`).join('')}
            ${files.length>8 ? `<div class="muted small">… и ещё ${files.length-8}</div>` : ``}
          </div>
        </div>
      ` : '';

      return `
        <div class="card" data-reqid="${escapeHtml(r.id)}" style="padding:12px;margin-bottom:10px">
          <div class="row between">
            <div>
              <div style="font-weight:900">${when} • ${selectedClientEmail}</div>
              <div class="muted" style="margin-top:4px">${parts.join(' • ') || '—'}</div>
            </div>
            <div class="muted" style="text-align:right">
              <div style="display:inline-block;padding:4px 10px;border-radius:999px;border:1px solid rgba(71,181,0,.35);background:${pillBg};color:${pillColor};font-size:12px;font-weight:800">${stLabel}</div>
              ${dueTxt ? `<div class="muted small" style="margin-top:6px">Срок: ${dueTxt}${isOverdue ? ' • <span style="color:#ff5050;font-weight:800">Просрочено</span>' : ''}</div>` : ''}
              <div style="margin-top:6px">${created}</div>
            </div>
          </div>
          ${r.note ? `<div class="muted" style="margin-top:8px">${escapeHtml(r.note)}</div>` : ''}
          ${(r.status === 'rejected' && r.decisionNote) ? `<div class="muted small" style="margin-top:8px"><b>Причина:</b> ${escapeHtml(r.decisionNote)}</div>` : ''}
          ${(r.status === 'approved') ? `<div class="muted small" style="margin-top:8px"><b>Статус:</b> принято</div>` : ''}
          ${fileHtml}
          <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap;justify-content:flex-end">
            <button class="smallBtn primary" data-ract="package" data-rid="${escapeHtml(r.id)}" data-month="${escapeHtml(r.month||'')}" ${r.month ? '' : 'disabled'}>Пакет месяца</button>
            <button class="smallBtn ghost" data-ract="remind" data-rid="${escapeHtml(r.id)}" ${r.status === 'approved' ? 'disabled' : ''}>Напомнить</button>
            <button class="smallBtn success" data-ract="approve" data-rid="${escapeHtml(r.id)}" ${r.status === 'received' ? '' : 'disabled'}>Принять</button>
            <button class="smallBtn danger" data-ract="reject" data-rid="${escapeHtml(r.id)}" ${r.status === 'received' ? '' : 'disabled'}>Отклонить</button>
          </div>
        </div>
      `;
    }).join('');

    // bind request actions
    box.querySelectorAll('button[data-ract]').forEach(btn=>{
      btn.addEventListener('click', async (e)=>{
        e.preventDefault();
        const act = btn.getAttribute('data-ract');
        const rid = btn.getAttribute('data-rid');
        if (!rid) return;
        try{
          if (act === 'remind'){
            await jpost('/api/accountant/requests/remind', { requestId: rid });
            alert('Напоминание отправлено');
          } else if (act === 'package'){
            const m = btn.getAttribute('data-month') || '';
            if (!m) return alert('У запроса не указан месяц.');
            const url = `/api/accountant/docs/export/month?clientEmail=${encodeURIComponent(selectedClientEmail)}&month=${encodeURIComponent(m)}`;

            const oldTxt = btn.textContent;
            btn.textContent = 'Готовлю…';
            btn.disabled = true;

            try{
              const safeClient = String(selectedClientEmail||'client').replace(/[^a-z0-9]+/gi,'_').slice(0,40) || 'client';
              await downloadFile(url, `OneTapDay_${safeClient}_${m}.zip`);
            } finally {
              btn.textContent = oldTxt;
              btn.disabled = false;
            }
          } else if (act === 'approve'){
            if (!confirm('Принять документы?')) return;
            await jpost('/api/accountant/requests/decide', { requestId: rid, action: 'approve' });
          } else if (act === 'reject'){
            const note = prompt('Причина отклонения (клиент увидит):', '');
            if (!note) return;
            await jpost('/api/accountant/requests/decide', { requestId: rid, action: 'reject', note });
          }
          await loadRequests();
          try{ _otdNotif.start(); }catch(e){}
        }catch(err){
          alert('Ошибка: ' + (err && err.message ? err.message : err));
        }
      });
    });
  }

  function renderDeadlineBar(reqs){
    const bar = $('reqDeadlineBar');
    if (!bar) return;
    const now = Date.now();
    const list = (Array.isArray(reqs) ? reqs : []).filter(r=>r && String(r.status||'open') !== 'approved');
    if (!selectedClientEmail || !list.length){
      bar.style.display = 'none';
      return;
    }

    const MS_DAY = 24*60*60*1000;
    const overdue = list.filter(r=>{
      if (!r.dueAt) return false;
      const t = new Date(r.dueAt).getTime();
      return !isNaN(t) && (t < now);
    });
    const soon = list.filter(r=>{
      if (!r.dueAt) return false;
      const t = new Date(r.dueAt).getTime();
      if (isNaN(t)) return false;
      const diff = t - now;
      return diff >= 0 && diff <= 3*MS_DAY;
    });
    const noDue = list.filter(r=>!r.dueAt);
    const next = list
      .filter(r=>r.dueAt && !isNaN(new Date(r.dueAt).getTime()))
      .slice()
      .sort((a,b)=> new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0];
    const nextTxt = next ? new Date(next.dueAt).toLocaleDateString() : '—';

    bar.style.display = 'block';
    bar.innerHTML = `
      <div class="hintBox" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between">
        <div>
          <div style="font-weight:900">Дедлайны</div>
          <div class="muted small" style="margin-top:4px">
            Просрочено: <b>${overdue.length}</b> • В ближайшие 3 дня: <b>${soon.length}</b> • Без срока: <b>${noDue.length}</b> • Ближайший: <b>${escapeHtml(nextTxt)}</b>
          </div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap;justify-content:flex-end">
          <button class="smallBtn" id="dlRemindOverdue" ${overdue.length ? '' : 'disabled'}>Напомнить просроченным</button>
          <button class="smallBtn" id="dlRemindSoon" ${soon.length ? '' : 'disabled'}>Напомнить на 3 дня</button>
        </div>
      </div>
    `;

    async function bulkRemind(arr, label){
      const SKIP_WINDOW_H = 12;
      const actionable = (arr||[]).filter(r=>{
        if (!r.lastRemindedAt) return true;
        const t = new Date(r.lastRemindedAt).getTime();
        return isNaN(t) || ((now - t) > SKIP_WINDOW_H*60*60*1000);
      });
      const skipped = (arr||[]).length - actionable.length;
      if (!actionable.length){
        alert(skipped ? `Уже напоминали недавно. Подожди или отправь вручную.` : 'Нечего напоминать.');
        return;
      }
      if (!confirm(`Отправить напоминание (${label}) клиенту ${selectedClientEmail}?\n\nОтправится: ${actionable.length}${skipped ? `, пропущено (уже напоминали): ${skipped}` : ''}`)) return;

      let ok = 0, fail = 0;
      for (const r of actionable){
        try{
          await jpost('/api/accountant/requests/remind', { requestId: r.id });
          ok++;
        }catch(e){ fail++; }
      }
      alert(`Готово: ${ok} отправлено${skipped ? `, ${skipped} пропущено` : ''}${fail ? `, ошибок: ${fail}` : ''}`);
      await loadRequests();
    }

    bar.querySelector('#dlRemindOverdue')?.addEventListener('click', ()=>bulkRemind(overdue, 'Просрочено'));
    bar.querySelector('#dlRemindSoon')?.addEventListener('click', ()=>bulkRemind(soon, '3 дня'));
  }

  function escapeHtml(s){
    return String(s==null?'':s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function fmtYMD(d){
    try {
      const y = d.getFullYear();
      const m = String(d.getMonth()+1).padStart(2,'0');
      const day = String(d.getDate()).padStart(2,'0');
      return `${y}-${m}-${day}`;
    } catch(_) { return ''; }
  }

  async function loadClients(){
    const data = await jget('/api/accountant/clients');
    clients = (data && data.clients) || [];
    // keep selection valid
    if (selectedClientEmail && !clients.some(c=>c.clientEmail===selectedClientEmail)) selectedClientEmail = '';
    renderClients();
  }

  async function loadRequests(){
    if (!selectedClientEmail) return renderReqList([]);
    try {
      const data = await jget('/api/accountant/requests?clientEmail=' + encodeURIComponent(selectedClientEmail));
      renderReqList((data && data.requests) || []);
    } catch(e){
      renderReqList([]);
    }
  }

  function openClientModal(){
    $('clientErr').style.display='none';
    $('clientOk').style.display='none';
    $('clientEmail').value='';
    $('clientName').value='';
    $('clientCompany').value='';
    $('clientModalBack').style.display='flex';
    setTimeout(()=> $('clientEmail')?.focus(), 50);
  }
  function closeClientModal(){ $('clientModalBack').style.display='none'; }

  async function saveClient(){
    const email = ($('clientEmail').value||'').trim();
    const name = ($('clientName').value||'').trim();
    const company = ($('clientCompany').value||'').trim();
    const errEl = $('clientErr');
    const okEl = $('clientOk');
    errEl.style.display='none'; okEl.style.display='none';
    try{
      await jpost('/api/accountant/clients/add', { clientEmail: email, clientName: name, company });
      okEl.textContent = 'Приглашение отправлено. Клиент увидит его в приложении.';
      okEl.style.display='block';
      await loadClients();
      setTimeout(closeClientModal, 550);
    }catch(err){
      errEl.textContent = 'Ошибка: ' + (err && err.message ? err.message : err);
      errEl.style.display='block';
    }
  }

  function openReqModal(){
    if (!selectedClientEmail) return;
    $('reqErr').style.display='none';
    $('reqOk').style.display='none';
    $('itBank').checked = true;
    $('itInvoices').checked = true;
    $('itReceipts').checked = false;
    $('itOther').value = '';
    $('reqNote').value = '';
    $('reqClientLine').textContent = 'Клиент: ' + selectedClientEmail;

    // Месяц должен быть всегда видимым и начинаться с 2025 года
    const ym = curMonth();
    const sel = $('reqMonth');
    try {
      const months = monthList();
      if (sel && String(sel.tagName||'').toUpperCase() === 'SELECT') {
        sel.innerHTML = months.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
        if (months.includes(ym)) sel.value = ym;
        else {
          sel.innerHTML = `<option value="${esc(ym)}">${esc(ym)}</option>` + sel.innerHTML;
          sel.value = ym;
        }
      } else if (sel) {
        sel.value = ym;
      }
    } catch(e){
      if (sel) sel.value = ym;
    }

    // default due date = +7 days (optional)
    try {
      const due = new Date();
      due.setDate(due.getDate() + 7);
      const dueEl = $('reqDue');
      if (dueEl) dueEl.value = fmtYMD(due);
    } catch(e){}

    $('reqModalBack').style.display='flex';
  }
  function closeReqModal(){ $('reqModalBack').style.display='none'; }

  async function createReq(){
    const errEl = $('reqErr');
    const okEl = $('reqOk');
    errEl.style.display='none'; okEl.style.display='none';

    const month = ($('reqMonth').value||'').trim();
    const items = {
      bank: !!$('itBank').checked,
      invoices: !!$('itInvoices').checked,
      receipts: !!$('itReceipts').checked
    };
    const other = ($('itOther').value||'').trim();
    if (other) items.other = other;
    const note = ($('reqNote').value||'').trim();
    const dueDate = ($('reqDue') && $('reqDue').value ? String($('reqDue').value).trim() : '');

    try{
      await jpost('/api/accountant/requests/create', { clientEmail: selectedClientEmail, month, dueDate, items, note });
      okEl.textContent = 'Запрос создан. Клиент увидит его в приложении.';
      okEl.style.display='block';
      await loadRequests();
    try{ _otdNotif.start(); }catch(e){}

      setTimeout(closeReqModal, 550);
    }catch(err){
      errEl.textContent = 'Ошибка: ' + (err && err.message ? err.message : err);
      errEl.style.display='block';
    }
  }

  // ===== Client Documents (Vault) =====
  let docsModal = null;
  let docsState = { folders:[], files:[], selectedFolder:'', query:'' };

const DOC_CATS = [
  { id:'incoming', label:'Входящие' },
  { id:'outgoing', label:'Выставленные' },
  { id:'tax', label:'ZUS/PIT' },
  { id:'proof', label:'Подтверждения' },
  { id:'other', label:'Другое' }
];

function curMonth(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  return `${y}-${m}`;
}

function monthList(){
  // from 2025-01, forward to (current month + 12)
  const out = [];
  const start = new Date(2025, 0, 1);
  const end = new Date();
  end.setDate(1);
  end.setMonth(end.getMonth() + 12);

  const d = new Date(start.getTime());
  d.setDate(1);
  while (d.getTime() <= end.getTime()){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    out.push(`${y}-${m}`);
    d.setMonth(d.getMonth()+1);
  }
  return out;
}

function lsGet(k, def){
  try{ const v = localStorage.getItem(k); return v ? v : def; }catch(_){ return def; }
}
function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch(_){ } }

let docsMonth = lsGet('otd_docs_month', curMonth());
let docsCat = lsGet('otd_docs_cat', 'incoming');

function setDocsMonth(v){ docsMonth = v || curMonth(); lsSet('otd_docs_month', docsMonth); }
function setDocsCat(v){ docsCat = v || 'incoming'; lsSet('otd_docs_cat', docsCat); }

function catBtnHtml(cat){
  const active = (cat.id === docsCat);
  const cls = active ? 'btn' : 'btn secondary';
  return `<button type="button" class="${cls} small" data-cat="${esc(cat.id)}">${esc(cat.label)}</button>`;
}

function renderDocsSmartControls(){
  if (!docsModal) return;
  const msel = docsModal.querySelector('#otdDocsMonthSel');
  if (msel){
    const months = monthList();
    msel.innerHTML = months.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
    if (months.includes(docsMonth)) msel.value = docsMonth;
    else { docsMonth = curMonth(); msel.value = docsMonth; }
  }
  const box = docsModal.querySelector('#otdDocsCatBtns');
  if (box){
    box.innerHTML = DOC_CATS.map(catBtnHtml).join('');
    box.querySelectorAll('button[data-cat]').forEach(b=>{
      b.addEventListener('click', ()=>{
        setDocsCat(b.getAttribute('data-cat') || 'incoming');
        renderDocsSmartControls();
        selectDocsSmartFolder();
      });
    });
  }
}

function folderByMeta(month, cat){
  const folders = docsState.folders || [];
  const hit = folders.find(f=>f && f.meta && f.meta.month === month && f.meta.category === cat);
  return hit ? hit.id : '';
}

function selectDocsSmartFolder(){
  if (!docsModal) return;
  const sel = docsModal.querySelector('#otdDocsFolderSel');
  const target = folderByMeta(docsMonth, docsCat);
  if (sel && target && (docsState.folders||[]).some(f=>f.id===target)){
    sel.value = target;
    docsState.selectedFolder = target;
    renderDocsFiles();
    return;
  }
  // fallback: keep current selection
  docsState.selectedFolder = sel ? (sel.value || '') : docsState.selectedFolder;
  renderDocsFiles();
}

  function ensureDocsModal(){
    if (docsModal) return docsModal;
    const wrap = document.createElement('div');
    wrap.id = 'otdDocsModalBack';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:14px;';
    wrap.innerHTML = `
      <style>
        #otdDocsModalBack select option{ color:#111; background:#fff; }
      </style>
      <div style="width:min(900px,96vw);max-height:90vh;overflow:auto;border-radius:18px;background:rgba(18,22,25,.92);border:1px solid rgba(255,255,255,.10);box-shadow:0 20px 80px rgba(0,0,0,.55);padding:14px">
        <div class="row between" style="align-items:flex-start;gap:10px;flex-wrap:wrap">
          <div>
            <div style="font-weight:900;font-size:18px">Документы клиента</div>
            <div class="muted small" id="otdDocsClientLabel" style="margin-top:2px"></div>
          </div>
          <button class="btn ghost" id="otdDocsClose" type="button">Закрыть</button>
        </div>
<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:12px">
  <div style="min-width:160px">
    <div class="muted small" style="margin-bottom:6px">Месяц</div>
    <select id="otdDocsMonthSel" style="width:100%;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff"></select>
  </div>
  <div style="flex:1;min-width:240px">
    <div class="muted small" style="margin-bottom:6px">Раздел</div>
    <div id="otdDocsCatBtns" style="display:flex;gap:8px;flex-wrap:wrap"></div>
  </div>
  <button class="btn ghost" id="otdDocsFoldersToggle" type="button">Папки</button>
  <div class="muted small" id="otdDocsStatus" style="opacity:.85"></div>
</div>

<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:10px">
  <div style="flex:1;min-width:260px">
    <div class="muted small" style="margin-bottom:6px">Поиск</div>
    <input id="otdDocsSearch" type="text" placeholder="Поиск по имени файла…" style="width:100%;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff" />
  </div>
  <button class="btn ghost" id="otdDocsClearSearch" type="button">Очистить</button>
  <button class="btn secondary" id="otdDocsExportMonth" type="button">Экспорт пакета месяца</button>
</div>

<div id="otdDocsFoldersPanel" style="display:none;margin-top:12px">
  <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
    <div style="min-width:240px;flex:1">
      <div class="muted small" style="margin-bottom:6px">Папка</div>
      <select id="otdDocsFolderSel" style="width:100%;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff"></select>
    </div>
  </div>
</div>

        <div style="margin-top:12px">
          <div style="font-weight:800;margin-bottom:8px">Файлы</div>
          <div id="otdDocsFiles" style="display:flex;flex-direction:column;gap:8px"></div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    docsModal = wrap;
    wrap.addEventListener('click', (e)=>{ if (e.target === wrap) closeDocsModal(); });
    wrap.querySelector('#otdDocsClose')?.addEventListener('click', closeDocsModal);
    wrap.querySelector('#otdDocsFoldersToggle')?.addEventListener('click', ()=>{
      const p = wrap.querySelector('#otdDocsFoldersPanel');
      if (!p) return;
      const open = (p.style.display !== 'none');
      p.style.display = open ? 'none' : 'block';
    });
    wrap.querySelector('#otdDocsMonthSel')?.addEventListener('change', (e)=>{
      setDocsMonth(e.target && e.target.value ? e.target.value : curMonth());
      renderDocsSmartControls();
      selectDocsSmartFolder();
    });

    // Search + export
    wrap.querySelector('#otdDocsSearch')?.addEventListener('input', (e)=>{
      docsState.query = String((e && e.target && e.target.value) ? e.target.value : '').trim();
      renderDocsFiles();
    });
    wrap.querySelector('#otdDocsClearSearch')?.addEventListener('click', ()=>{
      const s = wrap.querySelector('#otdDocsSearch');
      if (s) s.value = '';
      docsState.query = '';
      renderDocsFiles();
    });
    wrap.querySelector('#otdDocsExportMonth')?.addEventListener('click', ()=>{
      if (!selectedClientEmail) return;
      const m = docsMonth || curMonth();
      const url = `/api/accountant/docs/export/month?clientEmail=${encodeURIComponent(selectedClientEmail)}&month=${encodeURIComponent(m)}`;
      window.open(url, '_blank');
    });

    wrap.querySelector('#otdDocsFolderSel')?.addEventListener('change', ()=>{
      docsState.selectedFolder = wrap.querySelector('#otdDocsFolderSel').value || '';
      renderDocsFiles();
    });
    return docsModal;
  }

  function setDocsStatus(msg){
    const el = docsModal && docsModal.querySelector('#otdDocsStatus');
    if (el) el.textContent = msg || '';
  }

  function openDocsModal(){
    if (!selectedClientEmail) return;
    ensureDocsModal();
    docsModal.style.display='flex';
    const label = docsModal.querySelector('#otdDocsClientLabel');
    if (label) label.textContent = selectedClientEmail;
    try{ renderDocsSmartControls(); }catch(_){ }
    loadClientDocs().catch(err=>setDocsStatus('Ошибка: ' + (err && err.message ? err.message : err)));
  }
  function closeDocsModal(){
    if (docsModal) docsModal.style.display='none';
  }

  async function loadClientDocs(){
    if (!selectedClientEmail) return;
    setDocsStatus('Загружаю...');
    const j = await jget('/api/accountant/docs?clientEmail=' + encodeURIComponent(selectedClientEmail));
    docsState.folders = j.folders || [];
    docsState.files = j.files || [];
    const sel = docsModal.querySelector('#otdDocsFolderSel');
    const cur = docsState.selectedFolder || sel.value;
    sel.innerHTML = (docsState.folders||[]).map(f=>`<option value="${esc(f.id)}">${esc(f.name||f.id)}</option>`).join('');
    if (cur && (docsState.folders||[]).some(f=>f.id===cur)) { sel.value = cur; docsState.selectedFolder = cur; }
    if (!sel.value && docsState.folders.length) { sel.value = docsState.folders[0].id; docsState.selectedFolder = sel.value; }
    try{ renderDocsSmartControls(); }catch(_){ }
    selectDocsSmartFolder();
    setDocsStatus('');
  }

  function renderDocsFiles(){
    const box = docsModal.querySelector('#otdDocsFiles');
    const fid = docsState.selectedFolder || '';
    const q = String(docsState.query||'').trim().toLowerCase();
    const list = (docsState.files||[])
      .filter(f=>!fid || f.folderId===fid)
      .filter(f=>{
        if (!q) return true;
        const name = String(f && f.fileName ? f.fileName : '').toLowerCase();
        return name.includes(q);
      })
      .sort((a,b)=>(String(b.uploadedAt||'').localeCompare(String(a.uploadedAt||''))));
    if (!list.length){
      box.innerHTML = '<div class="muted small">Пока нет файлов в этой папке.</div>';
      return;
    }
    box.innerHTML = list.map(f=>{
      const dt = f.uploadedAt ? new Date(f.uploadedAt).toLocaleString() : '';
      const size = f.fileSize ? Math.round((f.fileSize/1024)*10)/10 + ' KB' : '';
      return `
        <div class="card" style="padding:10px;border-radius:14px">
          <div class="row between" style="gap:10px;flex-wrap:wrap;align-items:flex-start">
            <div style="min-width:220px">
              <div style="font-weight:800">${esc(f.fileName||'document')}</div>
              <div class="muted small" style="margin-top:4px">${esc(dt)} ${size?('• '+esc(size)):""}</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <a class="btn ghost small" href="${esc(f.fileUrl||'#')}" target="_blank" rel="noopener">Открыть</a>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
  async function boot(){
    // auth check
    try{
      const data = await jget('/me');
      me = data && data.user;
    }catch(e){
      window.location.href = '/';
      return;
    }
    const role = (me && me.role) || '';
    if (role !== 'accountant'){
      window.location.href = '/app.html';
      return;
    }

    $('logoutBtn')?.addEventListener('click', async ()=>{
      try{ await fetch('/logout', { credentials:'include' }); }catch(e){}
      window.location.href = '/';
    });

    $('addClientBtn')?.addEventListener('click', openClientModal);
    $('closeClientModal')?.addEventListener('click', closeClientModal);
    $('clientModalBack')?.addEventListener('click', (e)=>{ if(e.target === $('clientModalBack')) closeClientModal(); });
    $('saveClientBtn')?.addEventListener('click', saveClient);

    $('newReqBtn')?.addEventListener('click', openReqModal);
    $('openClientDocsBtn')?.addEventListener('click', openDocsModal);
    $('closeReqModal')?.addEventListener('click', closeReqModal);
    $('reqModalBack')?.addEventListener('click', (e)=>{ if(e.target === $('reqModalBack')) closeReqModal(); });
    $('createReqBtn')?.addEventListener('click', createReq);

    await loadClients();
    await loadRequests();
    try{ _otdNotif.start(); }catch(e){}

  }

  boot();
})();
