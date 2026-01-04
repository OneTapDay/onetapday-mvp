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

// ==== i18n helpers (PL default) ====
function _interp(str, vars){
  if (!vars || typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null) ? String(vars[k]) : m);
}
function TT(key, vars, fallback){
  try{
    if (window.i18n && typeof i18n.t === 'function'){
      const v = i18n.t(key, vars);
      if (v === key && fallback != null) return _interp(fallback, vars);
      return v;
    }
  }catch(e){}
  if (fallback != null) return _interp(fallback, vars);
  return key;
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


/* ==== OTD_NOTIF_V2: in-app notifications (accountant) + CHAT ==== */
const _otdNotif = (function(){
  const API = '/api/notifications';
  const API_MARK = '/api/notifications/mark-read';

  const CHAT_API_THREADS = '/api/chat/threads';
  const CHAT_API_HISTORY = '/api/chat/history';
  const CHAT_API_SEND = '/api/chat/send';
  const CHAT_API_MARK_READ = '/api/chat/mark-read';
  const CHAT_API_UNREAD = '/api/chat/unread-count';
  const CHAT_API_STREAM = '/api/chat/stream';

  const SEEN_KEY = 'otd_notif_toast_seen_acc';

  let started = false;

  // view: 'unread' | 'all' | 'chat'
  let view = 'unread';
  let notifUnreadCount = 0;
  let chatUnreadCount = 0;

  const chatState = {
    threads: [],
    active: null, // {id, accountantEmail, clientEmail, meEmail, counterpartEmail, ...}
    messages: [],
    eventSource: null,
    pollTimer: null,
    voice: { recording:false, speechRec:null, mediaRec:null, mediaStream:null, chunks:[], opId:0 },
  };

  function byId(id){ return document.getElementById(id); }
  function normalizeEmail(e){ return String(e||'').trim().toLowerCase(); }

  function injectCss(){
    if (document.getElementById('otdNotifCssAcc')) return;
    const st = document.createElement('style');
    st.id = 'otdNotifCssAcc';
    st.textContent = `
      .otdNotifBell{ position:relative; display:inline-flex; align-items:center; justify-content:center; z-index:9999; display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:999px; background:rgba(0,0,0,.35); border:1px solid rgba(71,181,0,.35); backdrop-filter: blur(10px); cursor:pointer; user-select:none; }
      .otdNotifBell .t{ font-weight:800; color:#dfffd0; font-size:13px; }
      .otdNotifBadge{ min-width:18px; height:18px; padding:0 6px; border-radius:999px; display:inline-flex; align-items:center; justify-content:center; font-size:12px; font-weight:900; color:#0b1a07; background:#47b500; }
      .otdNotifPanel{ position:fixed; top:54px; right:12px; width:min(390px, calc(100vw - 24px)); max-height:60vh; z-index:9999; border-radius:16px; background:rgba(0,0,0,.55); border:1px solid rgba(71,181,0,.25); backdrop-filter: blur(14px); box-shadow: 0 12px 30px rgba(0,0,0,.35); display:none; overflow:hidden; }
      .otdNotifPanel header{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.08); }
      .otdNotifPanel header .h{ font-weight:900; color:#eaffdf; font-size:13px; }
      .otdNotifTabs{ display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
      .otdNotifPanel header button{ background:transparent; border:1px solid rgba(255,255,255,.16); color:#eaffdf; border-radius:12px; padding:6px 10px; cursor:pointer; }
      .otdNotifTabs button.active{ border-color: rgba(71,181,0,.55); background: rgba(71,181,0,.12); }
      .otdNotifBody{ max-height:calc(60vh - 56px); overflow:auto; }
      .otdNotifItem{ padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.08); cursor:pointer; }
      .otdNotifItem:last-child{ border-bottom:none; }
      .otdNotifItem .m{ color:#eaffdf; font-size:13px; line-height:1.25; }
      .otdNotifItem .d{ margin-top:4px; color:rgba(234,255,223,.7); font-size:11px; }
      .otdNotifItem.read{ opacity:.55; }
      .otdNotifToast{ position:fixed; top:12px; left:50%; transform:translateX(-50%); z-index:10000; max-width:min(560px, calc(100vw - 24px)); padding:10px 12px; border-radius:14px; background:rgba(0,0,0,.70); border:1px solid rgba(71,181,0,.30); backdrop-filter: blur(14px); box-shadow: 0 10px 28px rgba(0,0,0,.35); color:#eaffdf; font-size:13px; display:none; }
      .otdNotifToast b{ color:#dfffd0; }

      /* === Chat inside notifications (accountant) === */
      .otdAccChatWrap{ padding:10px 10px 12px; }
      .otdAccChatCard{ border:1px solid rgba(255,255,255,.10); background: rgba(0,0,0,.25); border-radius:14px; overflow:hidden; }
      .otdAccChatThreads{ display:flex; flex-direction:column; }
      .otdAccChatThread{ padding:10px 10px; border-bottom:1px solid rgba(255,255,255,.08); cursor:pointer; display:flex; gap:10px; align-items:flex-start; }
      .otdAccChatThread:last-child{ border-bottom:none; }
      .otdAccChatThread .t{ color:#eaffdf; font-size:13px; font-weight:800; line-height:1.2; }
      .otdAccChatThread .s{ margin-top:4px; color:rgba(234,255,223,.75); font-size:12px; line-height:1.2; }
      .otdAccChatThread .r{ margin-left:auto; display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
      .otdAccChatPill{ min-width:18px; height:18px; padding:0 6px; border-radius:999px; font-size:10px; font-weight:900; color:#0b1a07; background:#47b500; display:inline-flex; align-items:center; justify-content:center; }
      .otdAccChatView{ display:flex; flex-direction:column; height:calc(60vh - 56px - 22px); }
      .otdAccChatTop{ display:flex; gap:8px; align-items:center; padding:10px 10px; border-bottom:1px solid rgba(255,255,255,.08); }
      .otdAccChatTop .back{ border:1px solid rgba(255,255,255,.16); border-radius:12px; padding:6px 10px; background:transparent; color:#eaffdf; cursor:pointer; }
      .otdAccChatTop .who{ color:#eaffdf; font-weight:900; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .otdAccChatMsgs{ flex:1; overflow:auto; padding:10px 10px; display:flex; flex-direction:column; gap:8px; }
      .otdAccChatMsg{ max-width:86%; padding:8px 10px; border-radius:14px; border:1px solid rgba(255,255,255,.10); background: rgba(0,0,0,.25); }
      .otdAccChatMsg.me{ margin-left:auto; border-color: rgba(71,181,0,.35); background: rgba(71,181,0,.10); }
      .otdAccChatMsg .txt{ color:#eaffdf; font-size:13px; line-height:1.25; white-space:pre-wrap; word-break:break-word; }
      .otdAccChatMsg .meta{ margin-top:4px; color:rgba(234,255,223,.65); font-size:10px; display:flex; gap:8px; align-items:center; }
      .otdAccChatMsg .orig{ opacity:.85; font-size:11px; margin-top:6px; border-top:1px dashed rgba(255,255,255,.12); padding-top:6px; color:rgba(234,255,223,.8); }
      .otdAccChatComposer{ display:flex; gap:8px; align-items:flex-end; padding:10px 10px; border-top:1px solid rgba(255,255,255,.08); }
      .otdAccChatComposer textarea{ flex:1; min-height:38px; max-height:120px; resize:vertical; border-radius:12px; border:1px solid rgba(255,255,255,.14); background:rgba(0,0,0,.20); color:#eaffdf; padding:8px 10px; font-size:13px; }
      .otdAccChatIconBtn{ width:40px; height:40px; border-radius:12px; border:1px solid rgba(255,255,255,.16); background:transparent; color:#eaffdf; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; }
      .otdAccChatIconBtn.is-recording{ border-color: rgba(71,181,0,.65); background: rgba(71,181,0,.12); }
      .otdAccChatToggle{ display:flex; align-items:center; gap:6px; padding:6px 8px; border-radius:12px; border:1px solid rgba(255,255,255,.16); color:#eaffdf; font-size:11px; user-select:none; }
      .otdAccChatToggle input{ accent-color:#47b500; }
    `;
    document.head.appendChild(st);
  }

  function ensureUi(){
    injectCss();
    if (byId('otdNotifBellAcc') && byId('otdChatBellAcc')) return;

    const bell = document.createElement('button');
    bell.type = 'button';
    bell.id = 'otdNotifBellAcc';
    bell.className = 'otdNotifBell';
    bell.setAttribute('aria-label', TT('accountant.notifs.aria', null, 'Powiadomienia'));
    bell.innerHTML = `<span class="t">🔔</span><span class="otdNotifBadge" style="display:none">0</span>`;

    const chatBtn = document.createElement('button');
    chatBtn.type = 'button';
    chatBtn.id = 'otdChatBellAcc';
    chatBtn.className = 'otdNotifBell';
    chatBtn.setAttribute('aria-label', TT('accountant.notifs.chat_aria', null, 'Czat'));
    chatBtn.innerHTML = `<span class="t">💬</span><span class="otdNotifBadge" style="display:none">0</span>`;
const panel = document.createElement('div');
    panel.id = 'otdNotifPanelAcc';
    panel.className = 'otdNotifPanel';
    panel.innerHTML = `
      <header>
        <div class="h" data-i18n-html="accountant.notifs.title">${esc(TT('accountant.notifs.title', null, 'Powiadomienia'))}</div>
        <div class="otdNotifTabs">
          <button id="otdNotifShowNewAcc" class="active" type="button" data-i18n-html="accountant.notifs.tab_new">${esc(TT('accountant.notifs.tab_new', null, 'Nowe'))}</button>
          <button id="otdNotifShowAllAcc" type="button" data-i18n-html="accountant.notifs.tab_history">${esc(TT('accountant.notifs.tab_history', null, 'Historia'))}</button>
          <button id="otdNotifShowChatAcc" type="button" data-i18n-html="accountant.notifs.tab_chat">${esc(TT('accountant.notifs.tab_chat', null, 'Czat'))}</button>
          <button id="otdNotifMarkAllAcc" type="button" data-i18n-html="accountant.notifs.tab_read">${esc(TT('accountant.notifs.tab_read', null, 'Przeczytane'))}</button>
        </div>
      </header>
      <div id="otdNotifBodyAcc" class="otdNotifBody">
        <div id="otdNotifListAcc"></div>
        <div id="otdChatWrapAcc" class="otdAccChatWrap" style="display:none"></div>
      </div>
    `;

    const toast = document.createElement('div');
    toast.id = 'otdNotifToastAcc';
    toast.className = 'otdNotifToast';

    // Mount buttons into top bar (prevents overlay with 🌐 and Wyloguj)
    try{
      const row = document.querySelector('.top .row') || document.querySelector('.top');
      const logout = byId('logoutBtn');
      if (row){
        if (logout && logout.parentElement===row){
          row.insertBefore(chatBtn, logout);
          row.insertBefore(bell, logout);
        }else{
          row.appendChild(chatBtn);
          row.appendChild(bell);
        }
      }else{
        document.body.appendChild(chatBtn);
        document.body.appendChild(bell);
      }
    }catch(_){
      document.body.appendChild(chatBtn);
      document.body.appendChild(bell);
    }

    document.body.appendChild(panel);
    document.body.appendChild(toast);
function setActive(btnId){
      ['otdNotifShowNewAcc','otdNotifShowAllAcc','otdNotifShowChatAcc'].forEach(id=>{
        const b = byId(id);
        if (!b) return;
        b.classList.toggle('active', id === btnId);
      });
    }
    function setView(v){
      view = v;
      setActive(v==='unread' ? 'otdNotifShowNewAcc' : (v==='all' ? 'otdNotifShowAllAcc' : 'otdNotifShowChatAcc'));
      const list = byId('otdNotifListAcc');
      const chat = byId('otdChatWrapAcc');
      if (list) list.style.display = (view === 'chat') ? 'none' : 'block';
      if (chat) chat.style.display = (view === 'chat') ? 'block' : 'none';
      if (view !== 'chat') stopChatStream();
    }

    bell.addEventListener('click', async ()=>{
      const shown = panel.style.display === 'block';
      if (shown && view !== 'chat'){
        panel.style.display = 'none';
        stopChatStream();
        return;
      }
      panel.style.display = 'block';
      try{ setView('unread'); }catch(_){}
      try{ await pull(); }catch(_){}
    });

    chatBtn.addEventListener('click', async ()=>{
      const shown = panel.style.display === 'block';
      if (shown && view === 'chat'){
        panel.style.display = 'none';
        stopChatStream();
        return;
      }
      panel.style.display = 'block';
      try{ setView('chat'); }catch(_){}
      try{ await pull(); }catch(_){}
    });

    document.addEventListener('click', (e)=>{
      if (!panel || panel.style.display !== 'block') return;
      if (
        e.target === bell || bell.contains(e.target) ||
        e.target === chatBtn || chatBtn.contains(e.target) ||
        e.target === panel || panel.contains(e.target)
      ) return;
      panel.style.display = 'none';
      stopChatStream();
    });
byId('otdNotifMarkAllAcc')?.addEventListener('click', async ()=>{
      try{
        await fetch(API_MARK, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ all:true }) });
      }catch(_){}
      setView('unread');
      try{ await pull(); }catch(_){}
    });

    byId('otdNotifShowNewAcc')?.addEventListener('click', async ()=>{
      setView('unread');
      try{ await pull(); }catch(_){}
    });

    byId('otdNotifShowAllAcc')?.addEventListener('click', async ()=>{
      setView('all');
      try{ await pull(); }catch(_){}
    });

    byId('otdNotifShowChatAcc')?.addEventListener('click', async ()=>{
      setView('chat');
      try{ await pull(); }catch(_){}
    });

    // keep new dynamic strings in sync with language toggles
    window.addEventListener('otd:lang', ()=>{
      try{
        if (window.i18n && typeof window.i18n.apply === 'function') window.i18n.apply();
      }catch(_){}
      try{ renderChat(); }catch(_){}
    });

    // Default view
    setView(view);
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
    const t = byId('otdNotifToastAcc');
    if (!t) return;
    t.innerHTML = `<b>${esc(TT('accountant.notifs.toast_prefix', null, 'Powiadomienie:'))}</b> ${esc(String(msg||''))}`;
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

  function updateBadge(){
    const badgeNotif = document.querySelector('#otdNotifBellAcc .otdNotifBadge');
    const badgeChat = document.querySelector('#otdChatBellAcc .otdNotifBadge');
    if (badgeNotif){
      badgeNotif.textContent = String(notifUnreadCount || 0);
      badgeNotif.style.display = (notifUnreadCount || 0) > 0 ? 'inline-flex' : 'none';
    }
    if (badgeChat){
      badgeChat.textContent = String(chatUnreadCount || 0);
      badgeChat.style.display = (chatUnreadCount || 0) > 0 ? 'inline-flex' : 'none';
    }
  }

  function renderNotifs(list, mode){
    const listEl = byId('otdNotifListAcc');
    if (!listEl) return;
    const arr = Array.isArray(list) ? list : [];
    if (!arr.length){
      listEl.innerHTML = `<div class="otdNotifItem" style="cursor:default"><div class="m">${mode==='all' ? esc(TT('accountant.notifs.empty_all', null, 'Historia jest pusta.')) : esc(TT('accountant.notifs.empty_new', null, 'Brak nowych powiadomień.'))}</div></div>`;
      return;
    }

    listEl.innerHTML = arr.map(n=>{
      const dt = fmtDate(n.createdAt);
      const readCls = (mode==='all' && n.read) ? ' read' : '';
      const msg = (n && n.i18nKey)
        ? TT(String(n.i18nKey), (n.vars && typeof n.vars==='object')?n.vars:null, String(n.message||''))
        : String(n && n.message || '');
      const chatThread = (n && n.data && n.data.chatThread) ? String(n.data.chatThread) : '';
      return `<div class="otdNotifItem${readCls}" data-id="${esc(n.id)}" data-request="${esc(n.requestId||'')}" data-client="${esc(n.clientEmail||'')}" data-chat="${esc(chatThread)}">
                <div class="m">${esc(msg)}</div>
                <div class="d">${esc(dt)}</div>
              </div>`;
    }).join('');

    listEl.querySelectorAll('.otdNotifItem[data-id]').forEach(el=>{
      el.addEventListener('click', async ()=>{
        const id = el.getAttribute('data-id');
        const rid = el.getAttribute('data-request');
        const ce  = el.getAttribute('data-client');
        const chatThread = el.getAttribute('data-chat');

        try{ await markRead([id]); }catch(_){}

        // If it's a chat notification, jump straight into that chat
        if (chatThread){
          try{
            await openChatByThreadId(chatThread);
            return;
          }catch(_){}
        }

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

  async function fetchUnreadNotifs(){
    try{
      const r = await fetch(API + '?unread=1', { credentials:'include' });
      const j = await r.json().catch(()=>({}));
      return (j && j.notifications) ? j.notifications : [];
    }catch(_){ return []; }
  }

  async function fetchAllNotifs(){
    try{
      const r = await fetch(API, { credentials:'include' });
      const j = await r.json().catch(()=>({}));
      return (j && j.notifications) ? j.notifications : [];
    }catch(_){ return []; }
  }

  async function fetchChatUnread(){
    try{
      const r = await fetch(CHAT_API_UNREAD, { credentials:'include' });
      const j = await r.json().catch(()=>({}));
      return (j && j.success === true) ? Number(j.totalUnread || 0) : 0;
    }catch(_){ return 0; }
  }

  async function fetchChatThreads(){
    try{
      const r = await fetch(CHAT_API_THREADS, { credentials:'include' });
      const j = await r.json().catch(()=>({}));
      const th = (j && j.success === true && Array.isArray(j.threads)) ? j.threads : [];
      const mapped = th.map(t=>({
        ...t,
        lastMessageText: (t.lastMessage != null ? String(t.lastMessage) : ''),
        lastMessageAt: (t.updatedAt || t.lastMessageAt || ''),
        meEmail: (t.meEmail || (j && j.meEmail) || '')
      }));
      chatState.threads = mapped;
      return mapped;
    }catch(_){ chatState.threads = []; return []; }
  }

  async function chatFetchHistory(thread){
    if (!thread) return [];
    const qs = new URLSearchParams({
      accountantEmail: String(thread.accountantEmail || ''),
      clientEmail: String(thread.clientEmail || ''),
      limit: '120'
    });
    const r = await fetch(`${CHAT_API_HISTORY}?${qs.toString()}`, { credentials:'include' });
    const j = await r.json().catch(()=>({}));
    if (!r.ok || !j || j.success !== true) throw new Error((j && j.error) || ('HTTP '+r.status));
    const msgs = Array.isArray(j.messages) ? j.messages : [];
    return msgs;
  }

  async function chatMarkRead(thread){
    if (!thread) return;
    try{
      await fetch(CHAT_API_MARK_READ, {
        method:'POST',
        credentials:'include',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ accountantEmail: thread.accountantEmail, clientEmail: thread.clientEmail })
      });
    }catch(_){}
  }

  function stopChatStream(){
    try{ if(chatState.eventSource) chatState.eventSource.close(); }catch(_){}
    chatState.eventSource = null;
    if (chatState.pollTimer){ try{ clearInterval(chatState.pollTimer); }catch(_){ } }
    chatState.pollTimer = null;
    chatState.voice.opId++;
    try{ if(chatState.voice.speechRec) chatState.voice.speechRec.stop(); }catch(_){}
    chatState.voice.speechRec = null;
    try{
      if(chatState.voice.mediaStream){
        chatState.voice.mediaStream.getTracks().forEach(t=>{ try{ t.stop(); }catch(_){ } });
      }
    }catch(_){}
    chatState.voice.mediaStream = null;
    chatState.voice.mediaRec = null;
    chatState.voice.chunks = [];
    chatState.voice.recording = false;
  }

  function getSpeechLocale(){
    try{
      const lg = (window.i18n && typeof window.i18n.getLang === 'function') ? String(window.i18n.getLang()||'') : '';
      const l = (lg || localStorage.getItem('lang') || 'pl').toLowerCase();
      if (l.startsWith('ru')) return 'ru-RU';
      if (l.startsWith('uk')) return 'uk-UA';
      if (l.startsWith('en')) return 'en-US';
      return 'pl-PL';
    }catch(_){
      return 'pl-PL';
    }
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
    const r = await fetch(`/api/ai/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ audio: b64, mime: mime || blob.type || 'audio/webm', language: getSpeechLocale() })
    });
    const j = await r.json().catch(()=> ({}));
    if(!r.ok || !j || j.success !== true){
      throw new Error((j && j.error) ? j.error : ('Transcribe failed ' + r.status));
    }
    return String(j.text || '').trim();
  }

  function wireChatVoice(btn, inp){
    if (!btn || !inp) return;
    if (btn.dataset && btn.dataset.voiceBound === '1') return;
    try{ btn.dataset.voiceBound = '1'; }catch(_){}

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    function setUI(on){
      chatState.voice.recording = !!on;
      try{
        btn.classList.toggle('is-recording', chatState.voice.recording);
        btn.textContent = chatState.voice.recording ? '⏹' : '🎤';
      }catch(_){}
    }

    function stopTracks(){
      try{
        if(chatState.voice.mediaStream){
          chatState.voice.mediaStream.getTracks().forEach(t=>{ try{ t.stop(); }catch(_){ } });
        }
      }catch(_){}
      chatState.voice.mediaStream = null;
    }

    async function startMedia(){
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      chatState.voice.mediaStream = stream;
      chatState.voice.chunks = [];
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
      chatState.voice.mediaRec = new MediaRecorder(stream, opts);
      chatState.voice.mediaRec.ondataavailable = (e)=>{ try{ if(e.data && e.data.size>0) chatState.voice.chunks.push(e.data); }catch(_){} };
      return true;
    }

    function startSpeech(){
      if(!SR) return false;

      const my = ++chatState.voice.opId;
      try{
        const rec = new SR();
        chatState.voice.speechRec = rec;

        const base = String(inp.value || '').trim();
        const basePrefix = base ? (base + ' ') : '';
        let finalText = '';
        let interimText = '';

        rec.lang = getSpeechLocale();
        rec.interimResults = true;
        rec.continuous = true;

        rec.onresult = (ev)=>{
          if(my !== chatState.voice.opId) return;
          try{
            let interim = '';
            let fin = '';
            const start = (typeof ev.resultIndex === 'number') ? ev.resultIndex : 0;
            for(let i=start; i<(ev.results ? ev.results.length : 0); i++){
              const r = ev.results[i];
              const t = r && r[0] ? String(r[0].transcript || '') : '';
              if(!t) continue;
              if(r.isFinal) fin += t;
              else interim += t;
            }
            if(fin){
              finalText = (finalText ? (finalText + ' ') : '') + String(fin).trim();
            }
            interimText = String(interim || '').trim();
            const combined = (basePrefix + [finalText, interimText].filter(Boolean).join(' ')).trim();
            inp.value = combined || base;
            try{ inp.focus(); }catch(_){}
          }catch(_){}
        };

        rec.onerror = (e)=>{
          if(my !== chatState.voice.opId) return;
          const err = e && e.error ? String(e.error) : '';
          if(chatState.voice.recording && (err === 'no-speech' || err === 'aborted')){
            try{ rec.stop(); }catch(_){}
            return;
          }
          try{ rec.stop(); }catch(_){}
          setUI(false);
        };

        rec.onend = ()=>{
          if(my !== chatState.voice.opId) return;
          chatState.voice.speechRec = null;
          if(chatState.voice.recording){
            setTimeout(()=>{
              try{
                if(chatState.voice.recording){
                  const ok = startSpeech();
                  if(!ok) setUI(false);
                }
              }catch(_e){}
            }, 250);
          }else{
            setUI(false);
          }
        };

        setUI(true);
        rec.start();
        return true;
      }catch(_e){
        chatState.voice.speechRec = null;
        setUI(false);
        return false;
      }
    }

    async function startFallbackMedia(){
      const my = ++chatState.voice.opId;
      if(!(navigator.mediaDevices && window.MediaRecorder)){
        setUI(false);
        return;
      }
      try{
        await startMedia();
        setUI(true);

        chatState.voice.mediaRec.onstop = async ()=>{
          const localChunks = (chatState.voice.chunks || []).slice();
          const mime = (chatState.voice.mediaRec && chatState.voice.mediaRec.mimeType) ? chatState.voice.mediaRec.mimeType : '';
          setUI(false);
          stopTracks();
          if(my !== chatState.voice.opId) return;
          try{
            const blob = new Blob(localChunks, { type: mime || 'audio/webm' });
            const text = await transcribe(blob, mime);
            if(!text) return;
            const prev = String(inp.value || '').trim();
            inp.value = (prev ? (prev + ' ') : '') + text;
            try{ inp.focus(); }catch(_){}
          }catch(_e){}
        };

        chatState.voice.mediaRec.start(250);
      }catch(_e){
        setUI(false);
        stopTracks();
      }
    }

    async function stopAll(){
      chatState.voice.opId++;
      try{ if(chatState.voice.speechRec) chatState.voice.speechRec.stop(); }catch(_){}
      chatState.voice.speechRec = null;
      try{ if(chatState.voice.mediaRec && chatState.voice.mediaRec.state !== 'inactive') chatState.voice.mediaRec.stop(); }catch(_){}
      chatState.voice.mediaRec = null;
      stopTracks();
      setUI(false);
    }

    btn.addEventListener('click', async ()=>{
      try{
        if(chatState.voice.recording){
          await stopAll();
          return;
        }
        // Prefer SpeechRecognition. If not available, record + transcribe.
        const ok = startSpeech();
        if(!ok){
          await startFallbackMedia();
        }
      }catch(_e){
        setUI(false);
      }
    });
  }

  function uniqById(arr){
    const map = new Map();
    (arr||[]).forEach(m=>{
      if(!m || !m.id) return;
      map.set(String(m.id), m);
    });
    return Array.from(map.values()).sort((a,b)=> String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
  }

  function appendChatMessages(msgs){
    const cur = Array.isArray(chatState.messages) ? chatState.messages : [];
    chatState.messages = uniqById(cur.concat(Array.isArray(msgs)?msgs:[])).slice(-200);
    renderChat();
  }

  function renderChat(){
    const wrap = byId('otdChatWrapAcc');
    if (!wrap || view !== 'chat') return;

    // active thread view
    if (chatState.active){
      const th = chatState.active;
      const who = String(th.counterpartEmail || th.clientEmail || th.accountantEmail || '');
      const meEmail = String(th.meEmail || '');
      const msgs = Array.isArray(chatState.messages) ? chatState.messages : [];
      wrap.innerHTML = `
        <div class="otdAccChatCard">
          <div class="otdAccChatView">
            <div class="otdAccChatTop">
              <button class="back" id="otdAccChatBack" type="button">←</button>
              <div class="who">${esc(who)}</div>
              <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
                <span class="otdAccChatPill" title="${esc('unread')}">${Math.max(0, Number(th.unreadCount||0)) || ''}</span>
              </div>
            </div>
            <div class="otdAccChatMsgs" id="otdAccChatMsgs">
              ${msgs.length ? msgs.map(m=>{
                const mine = (normalizeEmail(m.fromEmail||'') === normalizeEmail(meEmail));
                const txt = String(m.text || '');
                const dt = fmtDate(m.createdAt);
                return `
                  <div class="otdAccChatMsg ${mine?'me':''}">
                    <div class="txt">${esc(txt)}</div>
                    <div class="meta"><span>${esc(dt)}</span><span>${mine?'me':'them'}</span></div>
                  </div>
                `;
              }).join('') : `<div class="otdNotifItem" style="cursor:default"><div class="m">${esc(TT('client.chat.loading', null, 'Ładowanie…'))}</div></div>`}
            </div>
            <div class="otdAccChatComposer">
              <button class="otdAccChatIconBtn" id="otdAccChatMic" data-i18n-title="client.chat.mic" title="${esc(TT('client.chat.mic', null, 'Mikrofon'))}">🎤</button>
              <textarea id="otdAccChatInput" data-i18n-ph="client.chat.placeholder" placeholder="${esc(TT('client.chat.placeholder', null, 'Napisz wiadomość…'))}"></textarea>
              <button class="otdAccChatIconBtn" id="otdAccChatSend" data-i18n-title="client.chat.send" title="${esc(TT('client.chat.send', null, 'Wyślij'))}">➤</button>
            </div>
          </div>
        </div>
      `;

      const msgsEl = byId('otdAccChatMsgs');
      if (msgsEl){
        try{ msgsEl.scrollTop = msgsEl.scrollHeight; }catch(_){}
      }

      byId('otdAccChatBack')?.addEventListener('click', async ()=>{
        chatState.active = null;
        chatState.messages = [];
        stopChatStream();
        await pull(); // refresh threads + unread
      });

      const inp = byId('otdAccChatInput');
      const mic = byId('otdAccChatMic');
      const send = byId('otdAccChatSend');

      wireChatVoice(mic, inp);

      async function doSend(){
        const t = chatState.active;
        if (!t) return;
        const text = String(inp.value || '').trim();
        if (!text) return;
        inp.value = '';
        try{
          const r = await fetch(CHAT_API_SEND, {
            method:'POST',
            credentials:'include',
            headers:{ 'Content-Type':'application/json' },
            body: JSON.stringify({ accountantEmail: t.accountantEmail, clientEmail: t.clientEmail, text })
          });
          const j = await r.json().catch(()=>({}));
          if(!r.ok || !j || j.success !== true){
            showToast(TT('client.chat.error_send', null, 'Nie udało się wysłać.'));
            return;
          }
          if(j.message) appendChatMessages([j.message]);
          // refresh threads & badges
          await pullCountsOnly();
        }catch(_){
          showToast(TT('client.chat.error_send', null, 'Nie udało się wysłać.'));
        }
      }

      send?.addEventListener('click', doSend);
      inp?.addEventListener('keydown', (e)=>{
        if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)){
          e.preventDefault();
          doSend();
        }
      });

      return;
    }

    // threads list view
    const th = Array.isArray(chatState.threads) ? chatState.threads : [];
    const empty = !th.length;
    wrap.innerHTML = `
      <div class="otdAccChatCard">
        <div class="otdAccChatThreads">
          ${empty ? `<div class="otdNotifItem" style="cursor:default"><div class="m">${esc(TT('client.chat.threads_empty', null, 'Brak czatów.'))}</div></div>` : ''}
          ${th.map(t=>{
            const who = String(t.counterpartEmail || t.clientEmail || t.accountantEmail || '');
            const last = t.lastMessageText ? String(t.lastMessageText) : '';
            const dt = fmtDate(t.lastMessageAt);
            const uc = Math.max(0, Number(t.unreadCount||0));
            return `
              <div class="otdAccChatThread" data-thread="${esc(t.id)}">
                <div style="min-width:0">
                  <div class="t">${esc(who)}</div>
                  <div class="s">${esc(last || TT('client.chat.loading', null, 'Ładowanie…'))}</div>
                </div>
                <div class="r">
                  ${uc ? `<span class="otdAccChatPill">${uc}</span>` : ``}
                  <span style="color:rgba(234,255,223,.6);font-size:10px">${esc(dt)}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    wrap.querySelectorAll('.otdAccChatThread[data-thread]').forEach(el=>{
      el.addEventListener('click', async ()=>{
        const id = el.getAttribute('data-thread') || '';
        await openChatByThreadId(id);
      });
    });
  }

  async function openChatByThreadId(threadId){
    ensureUi();
    view = 'chat';
    // make sure chat UI is visible
    const list = byId('otdNotifListAcc');
    const chat = byId('otdChatWrapAcc');
    if (list) list.style.display = 'none';
    if (chat) chat.style.display = 'block';
    byId('otdNotifShowNewAcc')?.classList.remove('active');
    byId('otdNotifShowAllAcc')?.classList.remove('active');
    byId('otdNotifShowChatAcc')?.classList.add('active');

    const threads = await fetchChatThreads();
    const t = threads.find(x=> String(x.id||'') === String(threadId||''));
    if(!t){
      chatState.active = null;
      chatState.messages = [];
      renderChat();
      return;
    }
    await openChatThread(t);
  }

  async function openChatThread(thread){
    // Determine counterpart and me
    const meEmail = (me && me.email) ? String(me.email) : '';
    const isMeAccountant = meEmail ? (normalizeEmail(thread.accountantEmail||'') === normalizeEmail(meEmail)) : true;
    const counterpart = isMeAccountant ? thread.clientEmail : thread.accountantEmail;

    chatState.active = Object.assign({}, thread, {
      meEmail,
      counterpartEmail: counterpart
    });

    renderChat();
    stopChatStream();

    try{
      const msgs = await chatFetchHistory(thread);
      chatState.messages = msgs.slice(-200);
      renderChat();
    }catch(_){
      const wrap = byId('otdChatWrapAcc');
      if (wrap) wrap.innerHTML = `<div class="otdNotifItem" style="cursor:default"><div class="m">${esc(TT('client.chat.error_load', null, 'Nie udało się załadować czatu.'))}</div></div>`;
    }

    // mark read + refresh counts
    try{ await chatMarkRead(thread); }catch(_){}
    await pullCountsOnly();

    // Live: SSE stream with polling fallback
    const qs = new URLSearchParams({
      accountantEmail: String(thread.accountantEmail || ''),
      clientEmail: String(thread.clientEmail || ''),
      since: String(Date.now() - 2000)
    });

    try{
      const es = new EventSource(`${CHAT_API_STREAM}?${qs.toString()}`);
      chatState.eventSource = es;

      es.onmessage = (ev)=>{
        try{
          const data = JSON.parse(ev.data || '{}');
          if(data && data.type === 'message' && data.message){
            appendChatMessages([data.message]);
            // in-page heads-up
            try{
              const my = (me && me.email) ? String(me.email) : '';
              if(document.hidden && normalizeEmail(data.message.fromEmail||'') !== normalizeEmail(my) && window.Notification && Notification.permission === 'granted'){
                new Notification('OneTapDay', { body: String(data.message.text||'').slice(0,120) });
              }
            }catch(_){}
          }
        }catch(_){}
      };
      es.onerror = ()=>{
        try{ es.close(); }catch(_){}
        if(chatState.eventSource === es) chatState.eventSource = null;
        chatState.pollTimer = setInterval(async ()=>{
          try{
            if(!chatState.active) return;
            const msgs = await chatFetchHistory(chatState.active);
            appendChatMessages(msgs.slice(-60));
            await pullCountsOnly();
          }catch(_){}
        }, 3000);
      };
    }catch(_e){
      chatState.pollTimer = setInterval(async ()=>{
        try{
          if(!chatState.active) return;
          const msgs = await chatFetchHistory(chatState.active);
          appendChatMessages(msgs.slice(-60));
          await pullCountsOnly();
        }catch(_){}
      }, 3000);
    }
  }

  async function pullCountsOnly(){
    const [unreadNotifs, chatU] = await Promise.all([fetchUnreadNotifs(), fetchChatUnread()]);
    notifUnreadCount = Array.isArray(unreadNotifs) ? unreadNotifs.length : 0;
    chatUnreadCount = Number(chatU||0) || 0;
    updateBadge();
  }

  async function pull(){
    ensureUi();

    // Always refresh counts for badge
    const unreadNotifs = await fetchUnreadNotifs();
    notifUnreadCount = Array.isArray(unreadNotifs) ? unreadNotifs.length : 0;
    chatUnreadCount = await fetchChatUnread();
    updateBadge();

    if (view === 'chat'){
      // threads view when chat not open, otherwise keep current
      await fetchChatThreads();
      renderChat();
      return;
    }

    if (view === 'unread'){
      renderNotifs(unreadNotifs, 'unread');
    } else {
      const all = await fetchAllNotifs();
      renderNotifs(all, 'all');
    }

    // toast for unseen (from unread only)
    try{
      const seen = new Set(getSeen());
      const newly = (unreadNotifs||[]).filter(n=> n && n.id && !seen.has(n.id));
      if (newly.length){
        showToast(newly[0].message || TT('accountant.notifs.new', null, 'Nowe powiadomienie'));
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
    const label = (s==='active')?TT('accountant.status.active', null, 'Aktywny'):(s==='pending')?TT('accountant.status.pending', null, 'Oczekuje'):(s==='declined')?TT('accountant.status.declined', null, 'Odrzucony'):(s==='removed')?TT('accountant.status.removed', null, 'Usunięty'):s;
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
            <button class="smallBtn primary" data-act="select" data-email="${c.clientEmail}">${TT('accountant.btn_open', null, 'Otwórz')}</button>
            <button class="smallBtn" data-act="request" data-email="${c.clientEmail}" ${canReq?'':'disabled'}>${TT('accountant.btn_invite', null, 'Zaproś')}</button>
            <button class="smallBtn danger" data-act="remove" data-email="${c.clientEmail}">${TT('accountant.btn_remove', null, 'Usuń')}</button>
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
          if (!confirm(TT('accountant.confirm_remove_client', null, 'Usunąć klienta z listy?'))) return;
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
      box.innerHTML = `<div class="hintBox">${TT('accountant.hint_no_requests', {email:selectedClientEmail}, 'Brak próśb dla {email}. Kliknij „Nowa prośba”.')}</div>`;
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
            <button class="smallBtn primary" data-ract="package" data-rid="${escapeHtml(r.id)}" data-month="${escapeHtml(r.month||'')}" ${r.month ? '' : 'disabled'}>${TT('accountant.btn_month_package', null, 'Pakiet miesiąca')}</button>
            <button class="smallBtn ghost" data-ract="remind" data-rid="${escapeHtml(r.id)}" ${r.status === 'approved' ? 'disabled' : ''}>${TT('accountant.btn_remind', null, 'Przypomnij')}</button>
            <button class="smallBtn success" data-ract="approve" data-rid="${escapeHtml(r.id)}" ${r.status === 'received' ? '' : 'disabled'}>${TT('accountant.btn_accept', null, 'Akceptuj')}</button>
            <button class="smallBtn danger" data-ract="reject" data-rid="${escapeHtml(r.id)}" ${r.status === 'received' ? '' : 'disabled'}>${TT('accountant.btn_reject', null, 'Odrzuć')}</button>
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
            const note = prompt(TT('accountant.prompt_reject_reason', null, 'Причина отклонения (клиент увидит):'), '');
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
          <div style="font-weight:900">${TT('accountant.btn_deadlines', null, 'Deadline')}</div>
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
      <div id="otdAccDocs" style="position:fixed;inset:0;z-index:99999">
        <div style="position:absolute;inset:0;background:rgba(0,0,0,.55)"></div>
        <div id="otdAccDocsCard" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(900px,96vw);max-height:90vh;overflow:auto;background:rgba(0,0,0,.55);border-radius:18px;border:1px solid rgba(71,181,0,.20);backdrop-filter:blur(14px);box-shadow:0 20px 60px rgba(0,0,0,.55);padding:14px">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
            <div>
              <div style="font-weight:900;font-size:18px;line-height:1.1" data-i18n-html="accountant.docs_modal_title">${esc(TT('accountant.docs_modal_title', null, 'Dokumenty klienta'))}</div>
              <div class="muted small" id="otdDocsClientLabel" style="margin-top:4px"></div>
            </div>
            <button class="btn ghost" id="otdDocsClose" type="button" data-i18n-html="accountant.docs_close">${esc(TT('accountant.docs_close', null, 'Zamknij'))}</button>
          </div>

          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:12px">
            <div style="min-width:160px">
              <div class="muted small" style="margin-bottom:6px" data-i18n-html="accountant.docs_month">${esc(TT('accountant.docs_month', null, 'Miesiąc'))}</div>
              <select id="otdDocsMonthSel" style="width:100%;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff"></select>
            </div>
            <div style="flex:1;min-width:240px">
              <div class="muted small" style="margin-bottom:6px" data-i18n-html="accountant.docs_section">${esc(TT('accountant.docs_section', null, 'Sekcja'))}</div>
              <div id="otdDocsCatBtns" style="display:flex;gap:8px;flex-wrap:wrap"></div>
            </div>
            <button class="btn ghost" id="otdDocsFoldersToggle" type="button" data-i18n-html="accountant.docs_folders">${esc(TT('accountant.docs_folders', null, 'Foldery'))}</button>
            <div class="muted small" id="otdDocsStatus" style="opacity:.85"></div>
          </div>

          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:10px">
            <div style="flex:1;min-width:260px">
              <div class="muted small" style="margin-bottom:6px" data-i18n-html="accountant.docs_search">${esc(TT('accountant.docs_search', null, 'Szukaj'))}</div>
              <input id="otdDocsSearch" type="text" data-i18n-ph="accountant.docs_search_ph" placeholder="${esc(TT('accountant.docs_search_ph', null, 'Szukaj po nazwie pliku…'))}"
                style="width:100%;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff" />
            </div>
            <button class="btn ghost" id="otdDocsClearSearch" type="button" data-i18n-html="accountant.docs_clear">${esc(TT('accountant.docs_clear', null, 'Wyczyść'))}</button>
            <button class="btn secondary" id="otdDocsExportMonth" type="button" data-i18n-html="accountant.docs_export_month">${esc(TT('accountant.docs_export_month', null, 'Eksport pakietu miesiąca'))}</button>
          </div>

          <div id="otdDocsFoldersPanel" style="display:none;margin-top:12px">
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
              <div style="min-width:240px;flex:1">
                <div class="muted small" style="margin-bottom:6px" data-i18n-html="accountant.docs_folder">${esc(TT('accountant.docs_folder', null, 'Folder'))}</div>
                <select id="otdDocsFolderSel" style="width:100%;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff"></select>
              </div>
            </div>
          </div>

          <div style="margin-top:12px">
            <div style="font-weight:800;margin-bottom:8px" data-i18n-html="accountant.docs_files">${esc(TT('accountant.docs_files', null, 'Pliki'))}</div>
            <div id="otdDocsFiles" style="display:flex;flex-direction:column;gap:8px"></div>
          </div>
        </div>
      </div>
    `;    document.body.appendChild(wrap);
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
      box.innerHTML = '<div class="muted small">'+TT('accountant.hint_no_files', null, 'Brak plików w tej teczce.')+'</div>';
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
              <a class="btn ghost small" href="${esc(f.fileUrl||'#')}" target="_blank" rel="noopener">${esc(TT('accountant.btn_open', null, 'Otwórz'))}</a>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
  async function boot(){
  // Globe language menu (UI only)
  try{
    const globe = document.getElementById('otdLangGlobe');
    const menu = document.getElementById('otdLangMenu');
    if (globe && menu){
      const hide = ()=>{ menu.style.display='none'; globe.setAttribute('aria-expanded','false'); };
      globe.addEventListener('click', (e)=>{
        e.preventDefault();
        e.stopPropagation();
        const open = (menu.style.display === 'block');
        menu.style.display = open ? 'none' : 'block';
        globe.setAttribute('aria-expanded', open ? 'false' : 'true');
      });
      menu.addEventListener('click', (e)=>{ e.stopPropagation(); });
      document.addEventListener('click', ()=> hide());
      menu.querySelectorAll('button[data-lang]').forEach(btn=>{
        btn.addEventListener('click', ()=>{ try{ hide(); }catch(_){} });
      });
    }
  }catch(_e){}

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
