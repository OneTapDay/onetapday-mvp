// Extracted from public/js/app/app.js (lines 9186-9405)
/* ==== OTD_NOTIF_V1: in-app notifications (client) ==== */
    (function(){
      if (window.__OTD_NOTIF_INIT) return;
      window.__OTD_NOTIF_INIT = true;

      const API = '/api/notifications';
      const API_MARK = '/api/notifications/mark-read';
      const SEEN_KEY = 'otd_notif_toast_seen';
      let otdNotifShowAll = false;
      let otdNotifUnreadCount = 0;

      function esc(s){ return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;"); }

      function injectCss(){
        if (document.getElementById('otdNotifCss')) return;
        const st = document.createElement('style');
        st.id = 'otdNotifCss';
        st.textContent = `
          .otdNotifBellBtn{ position:relative; display:inline-flex; align-items:center; justify-content:center; }
          .otdBellIcon{ display:block; }
          .otdNotifBellBtn .otdNotifBadge{ position:absolute; top:-4px; right:-4px; min-width:16px; height:16px; padding:0 4px; border-radius:999px; display:inline-flex; align-items:center; justify-content:center; font-size:10px; font-weight:800; color:#0b1a07; background:#47b500; border:1px solid rgba(0,0,0,.35); box-shadow: 0 6px 18px rgba(0,0,0,.25); }
          .otdNotifPanel{ position:fixed; top: calc(env(safe-area-inset-top) + 64px); right:12px; width:min(360px, calc(100vw - 24px)); max-height:60vh; overflow:auto; z-index:9999; border-radius:16px; background:rgba(0,0,0,.55); border:1px solid rgba(71,181,0,.25); backdrop-filter: blur(14px); box-shadow: 0 12px 30px rgba(0,0,0,.35); display:none; }
          .otdNotifPanel header{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.08); }
          .otdNotifPanel header .h{ font-weight:700; color:#eaffdf; font-size:13px; }
          .otdNotifPanel header button{ background:transparent; border:1px solid rgba(255,255,255,.16); color:#eaffdf; border-radius:12px; padding:6px 10px; cursor:pointer; }
          .otdNotifItem{ padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.08); cursor:pointer; }
          .otdNotifItem:last-child{ border-bottom:none; }
          .otdNotifItem .m{ color:#eaffdf; font-size:13px; line-height:1.25; }
          .otdNotifItem .d{ margin-top:4px; color:rgba(234,255,223,.7); font-size:11px; }
          .otdNotifItem.read{ opacity:.55; }
          .otdNotifTabs{ display:flex; gap:6px; align-items:center; }
          .otdNotifTabs button.active{ border-color: rgba(71,181,0,.55); background: rgba(71,181,0,.12); }

          .otdNotifToast{ position:fixed; top:12px; left:50%; transform:translateX(-50%); z-index:10000; max-width:min(520px, calc(100vw - 24px)); padding:10px 12px; border-radius:14px; background:rgba(0,0,0,.70); border:1px solid rgba(71,181,0,.30); backdrop-filter: blur(14px); box-shadow: 0 10px 28px rgba(0,0,0,.35); color:#eaffdf; font-size:13px; display:none; }
          .otdNotifToast b{ color:#dfffd0; }
        `;
        document.head.appendChild(st);
      }

      function ensureUi(){
        injectCss();
        if (document.getElementById('otdNotifBell')) return;
        const bell = document.createElement('button');
        bell.type = 'button';
        bell.id = 'otdNotifBell';
        bell.className = 'iconBtn iconPill otdNotifBellBtn';
        bell.setAttribute('aria-label', TT('client.notifs.aria', null, 'Powiadomienia'));
        bell.innerHTML = `<svg class="otdBellIcon" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="otdNotifBadge" aria-label="0" style="display:none">0</span>`;
        const panel = document.createElement('div');
        panel.id = 'otdNotifPanel';
        panel.className = 'otdNotifPanel';
        panel.innerHTML = `<header><div class="h">${TT('client.notifs.title', null, 'Powiadomienia')}</div><div class="otdNotifTabs"><button id="otdNotifShowNew" class="active">${TT('client.notifs.tab_new', null, 'Nowe')}</button><button id="otdNotifShowAll">${TT('client.notifs.tab_history', null, 'Historia')}</button><button id="otdNotifMarkAll">${TT('client.notifs.tab_read', null, 'Przeczytane')}</button></div></header><div id="otdNotifList"></div>`;
        const toast = document.createElement('div');
        toast.id = 'otdNotifToast';
        toast.className = 'otdNotifToast';

        try{
          const top = document.querySelector('.top');
          const settingsBtn = document.getElementById('navSettingsBtn');
          const right = document.getElementById('topRight') || (settingsBtn ? settingsBtn.parentElement : null);

          if (right && settingsBtn && settingsBtn.parentElement===right) right.insertBefore(bell, settingsBtn);
          else if (right) right.appendChild(bell);
          else if (top && settingsBtn && settingsBtn.parentElement===top) top.insertBefore(bell, settingsBtn);
          else if (top) top.appendChild(bell);
          else document.body.appendChild(bell);
        }catch(_){ document.body.appendChild(bell); }
        document.body.appendChild(panel);
        document.body.appendChild(toast);

bell.addEventListener('click', async ()=>{
          const shown = panel.style.display === 'block';
          panel.style.display = shown ? 'none' : 'block';
          if (!shown) { try{ await pull(); }catch(_){}} 
        });
        document.addEventListener('click', (e)=>{
          if (!panel || panel.style.display !== 'block') return;
          if (e.target === bell || bell.contains(e.target) || e.target === panel || panel.contains(e.target)) return;
          panel.style.display = 'none';
        });
        document.getElementById('otdNotifMarkAll')?.addEventListener('click', async ()=>{
          try{
            await fetch(API_MARK, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({all:true}) });
          }catch(_){}
          try{ await pull(); }catch(_){}
        });

        document.getElementById('otdNotifShowNew')?.addEventListener('click', async ()=>{
          otdNotifShowAll = false;
          document.getElementById('otdNotifShowNew')?.classList.add('active');
          document.getElementById('otdNotifShowAll')?.classList.remove('active');
          try{ await pull(); }catch(_){}
        });
        document.getElementById('otdNotifShowAll')?.addEventListener('click', async ()=>{
          otdNotifShowAll = true;
          document.getElementById('otdNotifShowAll')?.classList.add('active');
          document.getElementById('otdNotifShowNew')?.classList.remove('active');
          try{ await pull(); }catch(_){}
        });

      }

      function getSeen(){
        try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch(_) { return []; }
      }
      function setSeen(arr){
        try { localStorage.setItem(SEEN_KEY, JSON.stringify(arr.slice(-200))); } catch(_){}
      }

      function showToast(msg){
        const t = document.getElementById('otdNotifToast');
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

      function render(list, mode){
        const badge = document.querySelector('#otdNotifBell .otdNotifBadge');
        const listEl = document.getElementById('otdNotifList');
        const cnt = (list||[]).length;
        const unreadCnt = Number(otdNotifUnreadCount || 0);

        if (badge){
          badge.textContent = String(unreadCnt);
          badge.style.display = unreadCnt > 0 ? 'inline-flex' : 'none';
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
          return `<div class="otdNotifItem${readCls}" data-id="${esc(n.id)}" data-request="${esc(n.requestId||'')}">
                    <div class="m">${msg}</div>
                    <div class="d">${esc(dt)}</div>
                  </div>`;
        }).join('');
        listEl.querySelectorAll('.otdNotifItem[data-id]').forEach(el=>{
          el.addEventListener('click', async ()=>{
            const id = el.getAttribute('data-id');
            const rid = el.getAttribute('data-request');
            try{ await markRead([id]); }catch(_){}
            // Open requests modal for convenience
            if (rid){
              try{ document.getElementById('openClientRequestsBtn')?.click(); }catch(_){}
            }
            try{ await pull(); }catch(_){}
          });
        });
      }

      async function pull(){
        ensureUi();
        let unreadJson = null;
        try{
          const r = await fetch(API + '?unread=1', { credentials:'include' });
          if (!r.ok) { otdNotifUnreadCount = 0; render([], 'unread'); return; }
          unreadJson = await r.json();
        }catch(_){ return; }

        const unread = (unreadJson && unreadJson.notifications) ? unreadJson.notifications : [];
        otdNotifUnreadCount = unread.length;

        if (!otdNotifShowAll){
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

        // Toast only for new ids (local)
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
      }

      function start(){
        ensureUi();
        pull();
        setInterval(pull, 15000);
      }

      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
      else start();
    })();



