// Extracted from public/js/app/app.js (lines 9186-9405)
/* ==== OTD_NOTIF_V1: in-app notifications (client) + CHAT ==== */
(function(){
  if (window.__OTD_NOTIF_INIT) return;
  window.__OTD_NOTIF_INIT = true;

  const API = '/api/notifications';
  const API_MARK = '/api/notifications/mark-read';

  const CHAT_API_THREADS = '/api/chat/threads';
  const CHAT_API_HISTORY = '/api/chat/history';
  const CHAT_API_SEND = '/api/chat/send';
  const CHAT_API_MARK_READ = '/api/chat/mark-read';
  const CHAT_API_UNREAD = '/api/chat/unread-count';
  const CHAT_API_STREAM = '/api/chat/stream';

  const SEEN_KEY = 'otd_notif_toast_seen';

  let otdNotifShowAll = false;
  let otdNotifUnreadCount = 0; // combined: notifications + chat
  let otdChatUnreadCount = 0;

  const chatState = {
    threads: [],
    active: null, // { accountantEmail, clientEmail, counterpartEmail, ... }
    messages: [],
    eventSource: null,
    pollTimer: null,
    voice: { recording:false, speechRec:null, mediaRec:null, mediaStream:null, chunks:[], opId:0 },
    meEmail: ''
  };

  function esc(s){ return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;"); }
  function byId(id){ return document.getElementById(id); }

  function injectCss(){
    if (document.getElementById('otdNotifCss')) return;
    const st = document.createElement('style');
    st.id = 'otdNotifCss';
    st.textContent = `
      .otdNotifBellBtn{ position:relative; display:inline-flex; align-items:center; justify-content:center; }
      .otdBellIcon{ display:block; }
      .otdNotifBellBtn .otdNotifBadge{ position:absolute; top:-4px; right:-4px; min-width:16px; height:16px; padding:0 4px; border-radius:999px; display:inline-flex; align-items:center; justify-content:center; font-size:10px; font-weight:800; color:#0b1a07; background:#47b500; border:1px solid rgba(0,0,0,.35); box-shadow: 0 6px 18px rgba(0,0,0,.25); }
      .otdNotifPanel{ position:fixed; top: calc(env(safe-area-inset-top) + 64px); right:12px; width:min(360px, calc(100vw - 24px)); max-height:60vh; z-index:9999; border-radius:16px; background:rgba(0,0,0,.55); border:1px solid rgba(71,181,0,.25); backdrop-filter: blur(14px); box-shadow: 0 12px 30px rgba(0,0,0,.35); display:none; overflow:hidden; }
      .otdNotifPanel header{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.08); }
      .otdNotifPanel header .h{ font-weight:700; color:#eaffdf; font-size:13px; }
      .otdNotifPanel header button{ background:transparent; border:1px solid rgba(255,255,255,.16); color:#eaffdf; border-radius:12px; padding:6px 10px; cursor:pointer; }
      .otdNotifTabs{ display:flex; gap:6px; align-items:center; }
      .otdNotifTabs button.active{ border-color: rgba(71,181,0,.55); background: rgba(71,181,0,.12); }

      .otdNotifBody{ max-height:calc(60vh - 56px); overflow:auto; }
      .otdNotifItem{ padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.08); cursor:pointer; }
      .otdNotifItem:last-child{ border-bottom:none; }
      .otdNotifItem .m{ color:#eaffdf; font-size:13px; line-height:1.25; }
      .otdNotifItem .d{ margin-top:4px; color:rgba(234,255,223,.7); font-size:11px; }
      .otdNotifItem.read{ opacity:.55; }

      .otdNotifToast{ position:fixed; top:12px; left:50%; transform:translateX(-50%); z-index:10000; max-width:min(520px, calc(100vw - 24px)); padding:10px 12px; border-radius:14px; background:rgba(0,0,0,.70); border:1px solid rgba(71,181,0,.30); backdrop-filter: blur(14px); box-shadow: 0 10px 28px rgba(0,0,0,.35); color:#eaffdf; font-size:13px; display:none; }
      .otdNotifToast b{ color:#dfffd0; }

      /* === Chat inside notifications === */
      .otdChatWrap{ padding:10px 10px 12px; }
      .otdChatCard{ border:1px solid rgba(255,255,255,.10); background: rgba(0,0,0,.25); border-radius:14px; overflow:hidden; }
      .otdChatThreads{ display:flex; flex-direction:column; }
      .otdChatThread{ padding:10px 10px; border-bottom:1px solid rgba(255,255,255,.08); cursor:pointer; display:flex; gap:10px; align-items:flex-start; }
      .otdChatThread:last-child{ border-bottom:none; }
      .otdChatThread .t{ color:#eaffdf; font-size:13px; font-weight:700; line-height:1.2; }
      .otdChatThread .s{ margin-top:4px; color:rgba(234,255,223,.75); font-size:12px; line-height:1.2; }
      .otdChatThread .r{ margin-left:auto; display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
      .otdChatPill{ min-width:18px; height:18px; padding:0 6px; border-radius:999px; font-size:10px; font-weight:800; color:#0b1a07; background:#47b500; display:inline-flex; align-items:center; justify-content:center; }
      .otdChatView{ display:flex; flex-direction:column; height:calc(60vh - 56px - 22px); } /* panel max - header - padding */
      .otdChatTop{ display:flex; gap:8px; align-items:center; padding:10px 10px; border-bottom:1px solid rgba(255,255,255,.08); }
      .otdChatTop .back{ border:1px solid rgba(255,255,255,.16); border-radius:12px; padding:6px 10px; background:transparent; color:#eaffdf; cursor:pointer; }
      .otdChatTop .who{ color:#eaffdf; font-weight:800; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .otdChatMsgs{ flex:1; overflow:auto; padding:10px 10px; display:flex; flex-direction:column; gap:8px; }
      .otdChatMsg{ max-width:86%; padding:8px 10px; border-radius:14px; border:1px solid rgba(255,255,255,.10); background: rgba(0,0,0,.25); }
      .otdChatMsg.me{ margin-left:auto; border-color: rgba(71,181,0,.35); background: rgba(71,181,0,.10); }
      .otdChatMsg .txt{ color:#eaffdf; font-size:13px; line-height:1.25; white-space:pre-wrap; word-break:break-word; }
      .otdChatMsg .meta{ margin-top:4px; color:rgba(234,255,223,.65); font-size:10px; display:flex; gap:8px; align-items:center; }
      .otdChatMsg .orig{ opacity:.85; font-size:11px; margin-top:6px; border-top:1px dashed rgba(255,255,255,.12); padding-top:6px; color:rgba(234,255,223,.8); }
      .otdChatComposer{ display:flex; gap:8px; align-items:flex-end; padding:10px 10px; border-top:1px solid rgba(255,255,255,.08); }
      .otdChatComposer textarea{ flex:1; min-height:38px; max-height:120px; resize:vertical; border-radius:12px; border:1px solid rgba(255,255,255,.14); background:rgba(0,0,0,.20); color:#eaffdf; padding:8px 10px; font-size:13px; }
      .otdChatIconBtn{ width:40px; height:40px; border-radius:12px; border:1px solid rgba(255,255,255,.16); background:transparent; color:#eaffdf; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; }
      .otdChatIconBtn.is-recording{ border-color: rgba(71,181,0,.65); background: rgba(71,181,0,.12); }
      .otdChatToggle{ display:flex; align-items:center; gap:6px; padding:6px 8px; border-radius:12px; border:1px solid rgba(255,255,255,.16); color:#eaffdf; font-size:11px; user-select:none; }
      .otdChatToggle input{ accent-color:#47b500; }
    `;
    document.head.appendChild(st);
  }

  function ensureUi(){
  injectCss();
  if (byId('otdNotifBell')) return;

  const bell = document.createElement('button');
  bell.type = 'button';
  bell.id = 'otdNotifBell';
  bell.className = 'iconBtn iconPill otdNotifBellBtn';
  bell.setAttribute('aria-label', TT('client.notifs.aria', null, 'Powiadomienia'));
  bell.innerHTML = `<svg class="otdBellIcon" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="otdNotifBadge" aria-label="0" style="display:none">0</span>`;

  const chatBtn = document.createElement('button');
  chatBtn.type = 'button';
  chatBtn.id = 'otdChatBell';
  chatBtn.className = 'iconBtn iconPill otdNotifBellBtn otdChatBellBtn';
  chatBtn.setAttribute('aria-label', TT('client.chat.aria', null, 'Czat'));
  chatBtn.innerHTML = `<svg class="otdBellIcon" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-2.93-.38-4.18-1.05L3 20l1.09-4.32A8.46 8.46 0 0 1 3.5 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="otdNotifBadge" style="display:none">0</span>`;

  // Notifications panel (no chat tab)
  const panel = document.createElement('div');
  panel.id = 'otdNotifPanel';
  panel.className = 'otdNotifPanel';
  panel.innerHTML = `
    <header>
      <div class="h">${TT('client.notifs.title', null, 'Powiadomienia')}</div>
      <div class="otdNotifTabs">
        <button id="otdNotifShowNew" class="active">${TT('client.notifs.tab_new', null, 'Nowe')}</button>
        <button id="otdNotifShowAll">${TT('client.notifs.tab_history', null, 'Historia')}</button>
        <button id="otdNotifMarkAll">${TT('client.notifs.tab_read', null, 'Przeczytane')}</button>
      </div>
    </header>
    <div id="otdNotifBody" class="otdNotifBody">
      <div id="otdNotifListWrap"><div id="otdNotifList"></div></div>
    </div>
  `;

  // Chat panel (opened ONLY by chat button or from a notification)
  const chatPanel = document.createElement('div');
  chatPanel.id = 'otdChatPanel';
  chatPanel.className = 'otdNotifPanel otdChatPanel';
  chatPanel.innerHTML = `
    <header>
      <div class="h">${TT('client.notifs.tab_chat', null, 'Czat')}</div>
      <div class="otdNotifTabs">
        <button id="otdChatClose" title="${TT('client.chat.close', null, 'Zamknij')}">✕</button>
      </div>
    </header>
    <div class="otdNotifBody">
      <div id="otdChatWrap" class="otdChatWrap"></div>
    </div>
  `;

  const toast = document.createElement('div');
  toast.id = 'otdNotifToast';
  toast.className = 'otdNotifToast';

  // Place buttons into the existing top bar (keep original order: Settings -> Chat -> Bell)
  const right = byId('topRight') || document.querySelector('.topRight') || null;
  const top = document.querySelector('#topBar') || document.querySelector('.top') || null;

  try{
    if (right){
      right.appendChild(chatBtn);
      right.appendChild(bell);
    } else if (top){
      top.appendChild(chatBtn);
      top.appendChild(bell);
    } else {
      document.body.appendChild(chatBtn);
      document.body.appendChild(bell);
    }
  }catch(_){
    document.body.appendChild(chatBtn);
    document.body.appendChild(bell);
  }

  document.body.appendChild(panel);
  document.body.appendChild(chatPanel);
  document.body.appendChild(toast);

  function setTabs(){
    byId('otdNotifShowNew')?.classList.toggle('active', !otdNotifShowAll);
    byId('otdNotifShowAll')?.classList.toggle('active', !!otdNotifShowAll);
  }

  function closeNotif(){
    panel.style.display = 'none';
  }
  function closeChat(){
    chatPanel.style.display = 'none';
    stopChatStream();
  }

  bell.addEventListener('click', async ()=>{
    const shown = panel.style.display === 'block';
    if (shown){
      closeNotif();
      return;
    }
    closeChat();
    panel.style.display = 'block';
    try{ await pull(); }catch(_){}
  });

  chatBtn.addEventListener('click', async ()=>{
    const shown = chatPanel.style.display === 'block';
    if (shown){
      closeChat();
      return;
    }
    closeNotif();
    chatPanel.style.display = 'block';
    try{ await openChatHome(); }catch(_){}
    try{ await pull(); }catch(_){}
  });

  byId('otdChatClose')?.addEventListener('click', (e)=>{
    e.preventDefault();
    closeChat();
  });

  document.addEventListener('click', (e)=>{
    const t = e.target;
    const notifOpen = panel && panel.style.display === 'block';
    const chatOpen = chatPanel && chatPanel.style.display === 'block';

    if (notifOpen){
      if (t === bell || bell.contains(t) || t === panel || panel.contains(t)) return;
    }
    if (chatOpen){
      if (t === chatBtn || chatBtn.contains(t) || t === chatPanel || chatPanel.contains(t)) return;
    }
    if (notifOpen) closeNotif();
    if (chatOpen) closeChat();
  });

  byId('otdNotifMarkAll')?.addEventListener('click', async ()=>{
    try{
      await fetch(API_MARK, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({all:true}) });
    }catch(_){}
    try{ await pull(); }catch(_){}
  });

  byId('otdNotifShowNew')?.addEventListener('click', async ()=>{
    otdNotifShowAll = false;
    setTabs();
    try{ await pull(); }catch(_){}
  });

  byId('otdNotifShowAll')?.addEventListener('click', async ()=>{
    otdNotifShowAll = true;
    setTabs();
    try{ await pull(); }catch(_){}
  });
}

async function showChatPanel(threadId){
  ensureUi();
  const notifPanel = byId('otdNotifPanel');
  const chatPanel = byId('otdChatPanel');
  if (!chatPanel) return;

  try{ if (notifPanel) notifPanel.style.display = 'none'; }catch(_){}
  chatPanel.style.display = 'block';

  try{ await openChatHome(threadId); }catch(_){}
  try{ await pull(); }catch(_){}
}

  function showToast(msg){
    const t = byId('otdNotifToast');
    if (!t) return;
    t.innerHTML = `<b>${TT('client.notifs.toast_prefix', null, 'Powiadomienie')}:</b> ${esc(msg)}`;
    t.style.display = 'block';
    clearTimeout(showToast._tm);
    showToast._tm = setTimeout(()=>{ t.style.display = 'none'; }, 4500);
  }

  function fmtDate(iso){
    try { return new Date(iso).toLocaleString(); } catch(_) { return ''; }
  }

  async function markRead(ids){
    if (!ids || !ids.length) return;
    try{
      await fetch(API_MARK, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ids }) });
    }catch(_){}
  }

  function renderNotifications(list, mode){
    const bellBadge = document.querySelector('#otdNotifBell .otdNotifBadge');
    const chatBadge = document.querySelector('#otdChatBell .otdNotifBadge');
    const listEl = byId('otdNotifList');
    const cnt = (list||[]).length;

    // badges
    if (bellBadge){
      bellBadge.textContent = String(otdNotifUnreadCount || 0);
      bellBadge.style.display = (otdNotifUnreadCount || 0) > 0 ? 'inline-flex' : 'none';
    }
    if (chatBadge){
      chatBadge.textContent = String(otdChatUnreadCount || 0);
      chatBadge.style.display = (otdChatUnreadCount || 0) > 0 ? 'inline-flex' : 'none';
    }

    if (!listEl) return;
    if (!cnt){
      listEl.innerHTML = `<div class="otdNotifItem" style="cursor:default"><div class="m">${mode==='all' ? TT('client.notifs.empty_all', null, 'Historia jest pusta.') : TT('client.notifs.empty_new', null, 'Brak nowych powiadomień.')}</div></div>`;
      return;
    }
    listEl.innerHTML = list.map(n=>{
      let rawMsg = String(n.message || '');
      // language-neutral notifications (preferred)
      if (n.i18nKey) rawMsg = TT(String(n.i18nKey), (n.vars && typeof n.vars === 'object') ? n.vars : null, rawMsg);
      const msg = esc(rawMsg);
      const dt = fmtDate(n.createdAt);
      const readCls = (mode==='all' && n.read) ? ' read' : '';
      return `<div class="otdNotifItem${readCls}" data-id="${esc(n.id)}" data-request="${esc(n.requestId||'')}" data-chat="${esc(n.chatThread||'')}">
                <div class="m">${msg}</div>
                <div class="d">${esc(dt)}</div>
              </div>`;
    }).join('');
    listEl.querySelectorAll('.otdNotifItem[data-id]').forEach(el=>{
      el.addEventListener('click', async ()=>{
        const id = el.getAttribute('data-id');
        const rid = el.getAttribute('data-request');
        const cth = el.getAttribute('data-chat');
        try{ await markRead([id]); }catch(_){}
        // Open requests modal for convenience
        if (rid){
          try{ byId('openClientRequestsBtn')?.click(); }catch(_){}
        }
        // If notification contains a chat thread, jump to chat (dedicated panel)
        if (cth){
          try{ await showChatPanel(cth); }catch(_){}
        }
        try{ await pull(); }catch(_){}
      });
    });
  }

  /* ==========================
     Chat UI + logic
     ========================== */

  function getSpeechLocale(){
    const langMap = { pl:'pl-PL', en:'en-US', ru:'ru-RU', uk:'uk-UA', ua:'uk-UA' };
    try{
      const cached = String(localStorage.getItem('speechLocale') || localStorage.getItem('speechLang') || '').trim();
      if (cached) {
        if (cached.includes('-')) return cached;
        const k2 = cached.toLowerCase();
        return langMap[k2] || 'pl-PL';
      }
      const k = String(localStorage.getItem('otd_lang') || 'pl').toLowerCase().trim();
      return langMap[k] || 'pl-PL';
    }catch(_){
      return 'pl-PL';
    }
  }

  function stopChatStream(){
    try{ if(chatState.eventSource){ chatState.eventSource.close(); } }catch(_){}
    chatState.eventSource = null;
    try{ if(chatState.pollTimer){ clearInterval(chatState.pollTimer); } }catch(_){}
    chatState.pollTimer = null;
  }


  async function ensureMeEmail(){
    if (chatState.meEmail) return chatState.meEmail;
    try{
      const r = await fetch('/me', { credentials:'include' });
      const j = await r.json().catch(()=>({}));
      const email = j && j.user && j.user.email ? String(j.user.email).toLowerCase().trim() : '';
      if (email) chatState.meEmail = email;
      return chatState.meEmail || '';
    }catch(_){
      return '';
    }
  }

  async function chatUnreadCount(){
    try{
      const r = await fetch(CHAT_API_UNREAD, { credentials:'include' });
      const j = await r.json().catch(()=>({}));
      if(!r.ok || !j) return 0;
      return Number(j.totalUnread || 0) || 0;
    }catch(_){
      return 0;
    }
  }

  async function chatFetchThreads(){
    const r = await fetch(CHAT_API_THREADS, { credentials:'include' });
    const j = await r.json().catch(()=>({}));
    if(!r.ok || !j || j.success !== true) throw new Error((j && j.error) ? j.error : 'threads');
    return Array.isArray(j.threads) ? j.threads : [];
  }

  async function chatFetchHistory(th){
    const qs = new URLSearchParams({
      accountantEmail: String(th.accountantEmail || ''),
      clientEmail: String(th.clientEmail || ''),
      limit: '120'
    });
    const r = await fetch(`${CHAT_API_HISTORY}?${qs.toString()}`, { credentials:'include' });
    const j = await r.json().catch(()=>({}));
    if(!r.ok || !j || j.success !== true) throw new Error((j && j.error) ? j.error : 'history');
    return Array.isArray(j.messages) ? j.messages : [];
  }

  function chatRenderHome(threads){
    const wrap = byId('otdChatWrap');
    if(!wrap) return;

    const empty = !threads || !threads.length;
    wrap.innerHTML = `
      <div class="otdChatCard">
        <div class="otdChatThreads" id="otdChatThreads">
          ${empty ? `<div class="otdNotifItem" style="cursor:default"><div class="m">${esc(TT('client.chat.threads_empty', null, 'Brak czatów.'))}</div></div>` : ''}
        </div>
      </div>
    `;

    const list = byId('otdChatThreads');
    if(!list || empty) return;

    list.innerHTML = threads.map(t=>{
      const who = esc(String(t.counterpartEmail || '').trim() || '—');
      const last = esc(String(t.lastMessage || '').trim());
      const dt = t.updatedAt ? fmtDate(t.updatedAt) : '';
      const unread = Number(t.unreadCount || 0) || 0;
      return `
        <div class="otdChatThread" data-thread="${esc(t.id||'')}" data-a="${esc(t.accountantEmail||'')}" data-c="${esc(t.clientEmail||'')}">
          <div style="min-width:0">
            <div class="t">${who}</div>
            <div class="s">${last || esc(TT('client.chat.loading', null, 'Ładowanie…'))}</div>
          </div>
          <div class="r">
            ${unread>0 ? `<span class="otdChatPill">${unread}</span>` : `<span style="height:18px"></span>`}
            <div style="color:rgba(234,255,223,.55); font-size:10px">${esc(dt)}</div>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.otdChatThread').forEach(el=>{
      el.addEventListener('click', async ()=>{
        const id = el.getAttribute('data-thread');
        // Prefer thread id (robust across casing/normalization), fallback to emails.
        let th = threads.find(x => String(x.id||'') === String(id||''));
        if(!th){
          const a = el.getAttribute('data-a');
          const c = el.getAttribute('data-c');
          th = threads.find(x => String(x.accountantEmail||'')===String(a||'') && String(x.clientEmail||'')===String(c||''));
        }
        if(!th) return;
        await chatOpenThread(th);
      });
    });
  }

  function chatMsgHtml(m, myEmail){
    const from = String(m.fromEmail || '').toLowerCase().trim();
    const mine = from && myEmail && from === myEmail;
    const cls = mine ? 'otdChatMsg me' : 'otdChatMsg';
    const txt = esc(String(m.text || '').trim());
    const dt = m.createdAt ? fmtDate(m.createdAt) : '';
    const orig = (m.originalText && String(m.originalText).trim() && String(m.originalText).trim() !== String(m.text||'').trim()) ? esc(String(m.originalText).trim()) : '';
    return `
      <div class="${cls}">
        <div class="txt">${txt}</div>
        ${orig ? `<div class="orig">${esc(TT('client.chat.original', null, 'Oryginał'))}: ${orig}</div>` : ``}
        <div class="meta"><span>${esc(dt)}</span></div>
      </div>
    `;
  }

  async function chatOpenThread(th){
    await ensureMeEmail();
    const wrap = byId('otdChatWrap');
    if(!wrap) return;

    chatState.active = th;
    chatState.messages = [];

    wrap.innerHTML = `
      <div class="otdChatCard otdChatView">
        <div class="otdChatTop">
          <button class="back" id="otdChatBack">←</button>
          <div class="who" title="${esc(th.counterpartEmail||'')}">${esc(th.counterpartEmail||'')}</div>
        </div>
        <div class="otdChatMsgs" id="otdChatMsgs"></div>
        <div class="otdChatComposer">
          <button class="otdChatIconBtn" id="otdChatMic" data-i18n-title="client.chat.mic" title="${esc(TT('client.chat.mic', null, 'Mikrofon'))}">🎤</button>
          <textarea id="otdChatInput" data-i18n-ph="client.chat.placeholder" placeholder="${esc(TT('client.chat.placeholder', null, 'Napisz wiadomość…'))}"></textarea>
          <button class="otdChatIconBtn" id="otdChatSend" data-i18n-title="client.chat.send" title="${esc(TT('client.chat.send', null, 'Wyślij'))}">➤</button>
        </div>
      </div>
    `;

    // re-apply i18n on injected UI
    try{ if(window.i18n && typeof window.i18n.apply === 'function') window.i18n.apply(); }catch(_){}

    byId('otdChatBack')?.addEventListener('click', async ()=>{
      stopChatStream();
      chatState.active = null;
      await openChatHome();
    });

    const msgsEl = byId('otdChatMsgs');
    if (msgsEl) msgsEl.innerHTML = `<div class="otdNotifItem" style="cursor:default"><div class="m">${esc(TT('client.chat.loading', null, 'Ładowanie…'))}</div></div>`;

    // Load history + mark read
    try{
      const msgs = await chatFetchHistory(th);
      chatState.messages = msgs;
      renderChatMessages();
      await fetch(CHAT_API_MARK_READ, {
        method:'POST',
        credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ accountantEmail: th.accountantEmail, clientEmail: th.clientEmail })
      }).catch(()=>{});
    }catch(e){
      if (msgsEl) msgsEl.innerHTML = `<div class="otdNotifItem" style="cursor:default"><div class="m">${esc(TT('client.chat.error_load', null, 'Nie udało się załadować czatu.'))}</div></div>`;
    }

    wireChatComposer();
    startChatStream(th);
  }

  async function openChatHome(openThreadId){
    await ensureMeEmail();
    const wrap = byId('otdChatWrap');
    if(!wrap) return;

    stopChatStream();
    chatState.active = null;
    chatState.messages = [];

    wrap.innerHTML = `<div class="otdNotifItem" style="cursor:default"><div class="m">${esc(TT('client.chat.loading', null, 'Ładowanie…'))}</div></div>`;

    try{
      const threads = await chatFetchThreads();
      chatState.threads = threads;
      chatRenderHome(threads);

      // optionally open thread by id (from notification)
      if(openThreadId){
        const th = threads.find(t => String(t.id||'') === String(openThreadId||''));
        if(th) await chatOpenThread(th);
      }
    }catch(_e){
      wrap.innerHTML = `<div class="otdNotifItem" style="cursor:default"><div class="m">${esc(TT('client.chat.error_load', null, 'Nie udało się załadować czatu.'))}</div></div>`;
    }
  }

  function renderChatMessages(){
    const msgsEl = byId('otdChatMsgs');
    if(!msgsEl) return;
    const my = String((chatState.meEmail || '')).toLowerCase().trim();

    msgsEl.innerHTML = (chatState.messages || []).map(m => chatMsgHtml(m, my)).join('') || '';
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function appendChatMessages(newMsgs){
    if(!newMsgs || !newMsgs.length) return;
    const seen = new Set((chatState.messages || []).map(m => String(m.id||'')));
    newMsgs.forEach(m=>{
      const id = String(m && m.id ? m.id : '');
      if(!id || seen.has(id)) return;
      chatState.messages.push(m);
    });
    // keep last 300
    if(chatState.messages.length > 300) chatState.messages = chatState.messages.slice(-300);
    renderChatMessages();
  }

  function startChatStream(th){
    stopChatStream();

    const qs = new URLSearchParams({
      accountantEmail: String(th.accountantEmail || ''),
      clientEmail: String(th.clientEmail || ''),
      since: String(Date.now() - 2000)
    });

    // Prefer SSE. If it fails, fallback to polling.
    try{
      const es = new EventSource(`${CHAT_API_STREAM}?${qs.toString()}`);
      chatState.eventSource = es;

      es.onmessage = (ev)=>{
        try{
          const data = JSON.parse(ev.data || '{}');
          if(data && data.type === 'message' && data.message) appendChatMessages([data.message]);
        }catch(_){}
      };
      es.onerror = ()=>{
        try{ es.close(); }catch(_){}
        if(chatState.eventSource === es) chatState.eventSource = null;
        // Poll fallback
        chatState.pollTimer = setInterval(async ()=>{
          try{
            if(!chatState.active) return;
            const msgs = await chatFetchHistory(chatState.active);
            // cheap diff: keep last 60 from server
            appendChatMessages(msgs.slice(-60));
          }catch(_){}
        }, 3000);
      };
    }catch(_e){
      chatState.pollTimer = setInterval(async ()=>{
        try{
          if(!chatState.active) return;
          const msgs = await chatFetchHistory(chatState.active);
          appendChatMessages(msgs.slice(-60));
        }catch(_){}
      }, 3000);
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

  function wireChatVoice(){
    const btn = byId('otdChatMic');
    const inp = byId('otdChatInput');
    if(!btn || !inp) return;

    // prevent duplicates
    if(btn.dataset && btn.dataset.voiceBound === '1') return;
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

        chatState.voice.mediaRec.start();
      }catch(_e){
        setUI(false);
        stopTracks();
      }
    }

    function start(){
      if(chatState.voice.recording) return;
      if(startSpeech()) return;
      startFallbackMedia();
    }

    function stop(){
      ++chatState.voice.opId;
      try{
        if(chatState.voice.speechRec){
          try{ chatState.voice.speechRec.stop(); }catch(_){}
        }
      }catch(_){}
      chatState.voice.speechRec = null;

      try{
        if(chatState.voice.mediaRec && chatState.voice.mediaRec.state !== 'inactive'){
          try{ chatState.voice.mediaRec.stop(); }catch(_){}
          setUI(false);
          stopTracks();
          return;
        }
      }catch(_){}
      setUI(false);
      stopTracks();
    }

    btn.addEventListener('click', ()=>{
      if(chatState.voice.recording) stop();
      else start();
    });
  }

  function wireChatComposer(){
    wireChatVoice();

    const btnSend = byId('otdChatSend');
    const inp = byId('otdChatInput');

    async function send(){
      const th = chatState.active;
      if(!th) return;

      const text = String(inp.value || '').trim();
      if(!text) return;

      // optimistic UI (show pending)
      const pendingId = 'pending_' + Math.random().toString(16).slice(2);
      const nowIso = new Date().toISOString();
      appendChatMessages([{ id: pendingId, fromEmail: String(chatState.meEmail||'').toLowerCase(), text, originalText:'', createdAt: nowIso }]);
      inp.value = '';

      try{
        const r = await fetch(CHAT_API_SEND, {
          method:'POST',
          credentials:'include',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            accountantEmail: th.accountantEmail,
            clientEmail: th.clientEmail,
            text
          })
        });
        const j = await r.json().catch(()=>({}));
        if(!r.ok || !j || j.success !== true) throw new Error((j && j.error) ? j.error : 'send');

        // replace pending
        chatState.messages = (chatState.messages || []).filter(m => String(m.id||'') !== pendingId);
        appendChatMessages([j.message]);
      }catch(_e){
        // remove pending + show toast
        chatState.messages = (chatState.messages || []).filter(m => String(m.id||'') !== pendingId);
        renderChatMessages();
        showToast(TT('client.chat.error_send', null, 'Nie udało się wysłać.'));
      }

      // refresh counts
      try{ await pull(); }catch(_){}
    }

    btnSend?.addEventListener('click', send);
    inp?.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter' && !e.shiftKey){
        e.preventDefault();
        send();
      }
    });
  }

  /* ==========================
     Notifications pull (badge + toast)
     ========================== */

  async function pull(){
    ensureUi();

    // unread notifications
    let unreadJson = null;
    let unread = [];
    try{
      const r = await fetch(API + '?unread=1', { credentials:'include' });
      if (!r.ok) { unread = []; }
      else unreadJson = await r.json();
    }catch(_){ unread = []; }

    unread = (unreadJson && unreadJson.notifications) ? unreadJson.notifications : [];
    const unreadNotifCount = unread.length;

    // unread chat
    otdChatUnreadCount = await chatUnreadCount();

    // combined badge
    otdNotifUnreadCount = unreadNotifCount;

    // Render notifications list (chat is in a separate panel)
    if (!otdNotifShowAll){
      renderNotifications(unread, 'unread');
    } else {
      try{
        const r2 = await fetch(API, { credentials:'include' });
        const j2 = await r2.json().catch(()=>({}));
        const all = (j2 && j2.notifications) ? j2.notifications : [];
        renderNotifications(all, 'all');
      } catch(_){
        renderNotifications(unread, 'unread');
      }
    }

    // Toast only for new ids (local) - notifications only
    try{
      const seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
      const newly = unread.filter(n=> n && n.id && !seen.has(n.id));
      if (newly.length){
        const n0 = newly[0] || {};
        let msg = (n0 && n0.message) ? String(n0.message) : '';
        if (n0 && n0.i18nKey) msg = TT(String(n0.i18nKey), (n0.vars || null), msg);
        showToast(msg || TT('client.notifs.toast_prefix', null, 'Powiadomienie'));
        newly.forEach(n=> seen.add(n.id));
        localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen).slice(-200)));
      }
    }catch(_){}
  }

  function start(){
    ensureUi();
    ensureMeEmail();
    pull();
    setInterval(pull, 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
