// Extracted from public/js/app/app.js (lines 9406-10109)
// ===== Document Vault (client folders + files) =====
(function(){
  function esc(s){ return String(s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
  async function apiJson(url, method, body){
    const opt = { method: method||'GET', credentials:'include', headers:{'Content-Type':'application/json'} };
    if (body) opt.body = JSON.stringify(body);
    const r = await fetch(url, opt);
    const j = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(j && j.error ? j.error : ('HTTP ' + r.status));
    return j;
  }

  let modal = null;
  let vaultState = { folders:[], files:[] };


  // Bulk actions (multi-select files)
  let bulkSelected = new Set();
  let lastVisibleFiles = [];

  function bulkReset(){
    try{ bulkSelected.clear(); }catch(_){ bulkSelected = new Set(); }
  }

  function bulkPruneToVisible(list){
    const vis = new Set((list||[]).map(f=>String((f&&f.id)||'')));
    try{
      Array.from(bulkSelected).forEach(id=>{ if (!vis.has(String(id))) bulkSelected.delete(id); });
    }catch(_){ }
  }

  function renderBulkBar(list){
    const bar = modal && modal.querySelector('#otdVaultBulkBar');
    if (!bar) return;
    const total = (list||[]).length;
    const selected = (bulkSelected && bulkSelected.size) ? bulkSelected.size : 0;
    if (!selected){
      bar.style.display = 'none';
      bar.innerHTML = '';
      return;
    }
    bar.style.display = 'flex';
    const pickMode = !!(vaultPickCtx && vaultPickCtx.requestId);
    bar.innerHTML = `
      <span class="muted small" style="opacity:.85">${TT('vault.bulk.selected', { n: selected }, 'Wybrano: ' + selected)}</span>
      <button type="button" class="btn ghost small" data-bulkact="all">${TT('vault.bulk.select_all', { n: total }, 'Zaznacz wszystko (' + total + ')')}</button>
      <button type="button" class="btn ghost small" data-bulkact="clear">${TT('vault.bulk.reset', null, 'Reset')}</button>
      ${pickMode ? `<button type="button" class="btn small" data-bulkact="attach">${TT('vault.bulk.attach_to_request', null, 'Dołącz do prośby')}</button>
      <button type="button" class="btn ghost small" data-bulkact="cancelPick">${TT('buttons.cancel', null, 'Anuluj')}</button>` : `<button type="button" class="btn small" data-bulkact="move">${TT('buttons.move', null, 'Przenieś')}</button>
      <button type="button" class="btn secondary small" data-bulkact="delete">${TT('buttons.delete', null, 'Usuń')}</button>`}
    `;
  }

  const VAULT_CATS = [
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
  function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch(_){ }
  }

  let selectedMonth = lsGet('otd_vault_month', curMonth());
  let selectedCat = lsGet('otd_vault_cat', 'incoming');

  let vaultPickCtx = null; // { requestId }
  let vaultPickResolve = null;
  let vaultSearchQ = '';


  function setSelectedMonth(v){ selectedMonth = v || curMonth(); lsSet('otd_vault_month', selectedMonth); }
  function setSelectedCat(v){ selectedCat = v || 'incoming'; lsSet('otd_vault_cat', selectedCat); }

  function catBtnHtml(cat){
    const active = (cat.id === selectedCat);
    const cls = active ? 'btn' : 'btn secondary';
    return `<button type="button" class="${cls} small" data-cat="${esc(cat.id)}">${esc(cat.label)}</button>`;
  }

  function renderSmartControls(){
    if (!modal) return;
    const msel = modal.querySelector('#otdVaultMonthSel');
    if (msel){
      const months = monthList();
      msel.innerHTML = months.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
      if (months.includes(selectedMonth)) msel.value = selectedMonth;
      else { selectedMonth = curMonth(); msel.value = selectedMonth; }
    }
    const box = modal.querySelector('#otdVaultCatBtns');
    if (box){
      box.innerHTML = VAULT_CATS.map(catBtnHtml).join('');
      box.querySelectorAll('button[data-cat]').forEach(b=>{
        b.addEventListener('click', async ()=>{
          const c = b.getAttribute('data-cat') || 'incoming';
          setSelectedCat(c);
          // re-render for active state
          renderSmartControls();
          await syncSmart().catch(err=>setStatus('Ошибка: '+err.message));
        });
      });
    }
  }

  function folderByMeta(month, cat){
    const folders = vaultState.folders || [];
    const hit = folders.find(f=>f && f.meta && f.meta.month === month && f.meta.category === cat);
    return hit ? hit.id : '';
  }

  async function ensureSmartFolder(month, cat){
    const j = await apiJson('/api/docs/folders/ensure','POST',{ month, category: cat });
    return (j && j.folder && j.folder.id) ? j.folder.id : '';
  }

  function onExportMonth(){
    const m = selectedMonth || curMonth();
    const c = selectedCat || 'incoming';
    const url = `/api/docs/export/month?month=${encodeURIComponent(m)}&category=${encodeURIComponent(c)}`;
    try{ window.open(url, '_blank'); }catch(_){ window.location.href = url; }
  }

  async function syncSmart(){
    // Ensure server folder exists for month+category, then refresh and select it.
    const month = selectedMonth || curMonth();
    const cat = selectedCat || 'incoming';
    const fid = await ensureSmartFolder(month, cat);
    await refresh(fid);
  }


  function ensureModal(){
    if (modal) return modal;
    const wrap = document.createElement('div');
    wrap.id = 'otdVaultModal';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:14px;';
    wrap.innerHTML = `
      <style>
        #otdVaultModal select option{ color:#111; background:#fff; }
      </style>
      <div style="width:min(820px,96vw);max-height:90vh;overflow:auto;border-radius:18px;background:rgba(18,22,25,.92);border:1px solid rgba(255,255,255,.10);box-shadow:0 20px 80px rgba(0,0,0,.55);padding:14px">
        <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap">
          <div>
            <div style="font-weight:900;font-size:18px">Мои документы</div>
            <div style="opacity:.75;font-size:12px;margin-top:2px">Папки и файлы внутри OneTapDay. Не теряются в чате, не теряются в галерее.</div>
          </div>
          <button id="otdVaultClose" class="btn ghost" type="button">Закрыть</button>
        </div>

        <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-top:12px">
          <div style="min-width:160px">
            <div class="muted small" style="margin-bottom:6px">Месяц</div>
            <select id="otdVaultMonthSel" style="width:100%;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff"></select>
          </div>
          <div style="flex:1;min-width:240px">
            <div class="muted small" style="margin-bottom:6px">Раздел</div>
            <div id="otdVaultCatBtns" style="display:flex;gap:8px;flex-wrap:wrap"></div>
          </div>
          <button id="otdVaultFoldersToggle" class="btn ghost" type="button">Папки</button>
        </div>

        <div id="otdVaultFoldersPanel" style="display:none;margin-top:12px">
          <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
            <div style="flex:1;min-width:220px">
              <div class="muted small" style="margin-bottom:6px">Папка</div>
              <select id="otdVaultFolderSel" style="width:100%;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff"></select>
            </div>
            <div style="min-width:220px;flex:1">
              <div class="muted small" style="margin-bottom:6px">Новая папка</div>
              <div style="display:flex;gap:8px">
                <input id="otdVaultNewFolder" placeholder="Напр. 2025-12 / VAT / Контракты" style="flex:1;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff" />
                <button id="otdVaultCreateFolder" class="btn secondary" type="button">Создать</button>
              </div>
            
          <div style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <div class="muted small">Доступ бухгалтеру</div>
            <button id="otdVaultShareToggle" class="btn secondary small" type="button">...</button>
            <div id="otdVaultShareState" class="muted small" style="opacity:.8"></div>
          </div>
        </div>
          </div>
        </div>

        <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <label class="btn secondary" style="cursor:pointer">
            <input id="otdVaultFileInput" type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" multiple style="display:none" />
            <span>Выбрать файлы</span>
          </label>
          <button id="otdVaultUploadBtn" class="btn" type="button">Загрузить в папку</button>
          <div id="otdVaultStatus" class="muted small" style="opacity:.85"></div>
        </div>

        <div style="margin-top:12px">
          <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:8px">
            <div style="font-weight:800">Файлы</div>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
              <input id="otdVaultSearch" placeholder="Поиск" style="padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff;min-width:180px" />
              <button id="otdVaultExportBtn" class="btn ghost small" type="button">Экспорт месяца</button>
              <div id="otdVaultBulkBar" style="display:none;gap:8px;align-items:center;flex-wrap:wrap"></div>
            </div>
          </div>
          <div id="otdVaultFiles" style="display:flex;flex-direction:column;gap:8px"></div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    modal = wrap;

    wrap.addEventListener('click', (e)=>{ if (e.target === wrap) close(); });
    wrap.querySelector('#otdVaultClose')?.addEventListener('click', close);
    wrap.querySelector('#otdVaultCreateFolder')?.addEventListener('click', onCreateFolder);
    wrap.querySelector('#otdVaultUploadBtn')?.addEventListener('click', onUpload);
    wrap.querySelector('#otdVaultShareToggle')?.addEventListener('click', ()=>{
      onToggleShare().catch(err=>setStatus('Ошибка: '+(err && err.message ? err.message : err)));
    });
    wrap.querySelector('#otdVaultFolderSel')?.addEventListener('change', ()=>{
      bulkReset();
      const fid = wrap.querySelector('#otdVaultFolderSel')?.value || '';
      renderFiles((vaultState && vaultState.files) ? vaultState.files : [], fid);
      renderShare(fid);
    });
    wrap.querySelector('#otdVaultFoldersToggle')?.addEventListener('click', ()=>{
      const p = wrap.querySelector('#otdVaultFoldersPanel');
      if (!p) return;
      const open = (p.style.display !== 'none');
      p.style.display = open ? 'none' : 'block';
    });
    wrap.querySelector('#otdVaultMonthSel')?.addEventListener('change', async (e)=>{
      setSelectedMonth(e.target && e.target.value ? e.target.value : curMonth());
      await syncSmart().catch(err=>setStatus('Ошибка: '+err.message));
    });
    wrap.querySelector('#otdVaultSearch')?.addEventListener('input', (e)=>{
      vaultSearchQ = String(e.target && e.target.value ? e.target.value : '').trim();
      const fid = wrap.querySelector('#otdVaultFolderSel')?.value || '';
      renderFiles((vaultState && vaultState.files) ? vaultState.files : [], fid);
    });
    wrap.querySelector('#otdVaultExportBtn')?.addEventListener('click', ()=>{
      onExportMonth();
    });

    // render month + category UI
    setTimeout(()=>{ try{ renderSmartControls(); }catch(_){ } }, 0);

    return wrap;
  }

  function open(){
    ensureModal();
    modal.style.display='flex';
    try{ renderSmartControls(); }catch(_){ }
    syncSmart().catch(err=>setStatus('Ошибка: '+err.message));
  }
  function close(){
    if(modal) modal.style.display='none';
    // exit picker mode if active
    if (vaultPickCtx){
      vaultPickCtx = null;
      if (vaultPickResolve){ try{ vaultPickResolve(false); }catch(_){ } }
      vaultPickResolve = null;
      vaultSearchQ = '';
      try{ const si = modal && modal.querySelector('#otdVaultSearch'); if(si) si.value=''; }catch(_){ }
    }
  }

  function setStatus(msg){ const el = modal && modal.querySelector('#otdVaultStatus'); if(el) el.textContent = msg||''; }

  function openPicker(opts){
    const requestId = opts && opts.requestId ? String(opts.requestId) : '';
    const suggestedMonth = opts && opts.suggestedMonth ? String(opts.suggestedMonth) : '';
    if (!requestId) return Promise.resolve(false);
    vaultPickCtx = { requestId };
    if (/^[0-9]{4}-[0-9]{2}$/.test(suggestedMonth)) setSelectedMonth(suggestedMonth);
    open();
    setStatus('Выберите файлы и нажмите “Прикрепить к запросу”.');
    return new Promise((resolve)=>{ vaultPickResolve = resolve; });
  }

  async function refresh(selectFolderId){
    setStatus('Загружаю...');
    const j = await apiJson('/api/docs/state','GET');
    const folders = j.folders || [];
    const files = j.files || [];
    vaultState = { folders, files };
    const sel = modal.querySelector('#otdVaultFolderSel');
    const cur = sel ? (sel.value || '') : '';
    if (sel){
      sel.innerHTML = folders.map(f=>`<option value="${esc(f.id)}">${esc(f.name||f.id)}</option>`).join('');
      const desired = selectFolderId || cur;
      if (desired && folders.some(f=>f.id===desired)) sel.value = desired;
      if (!sel.value && folders.length) sel.value = folders[0].id;
    }

    const folderId = sel ? sel.value : '';
    renderFiles(files, folderId);
    renderShare(folderId);
    setStatus('');
  }
  function renderFiles(allFiles, folderId){
    const box = modal.querySelector('#otdVaultFiles');
    const q = String(vaultSearchQ || '').toLowerCase();
    const list = (allFiles||[])
      .filter(f=>!folderId || f.folderId===folderId)
      .filter(f=>!q || String(f.fileName||'').toLowerCase().includes(q))
      .sort((a,b)=>(String(b.uploadedAt||'').localeCompare(String(a.uploadedAt||''))));

    lastVisibleFiles = list;

    if (!list.length){
      bulkReset();
      renderBulkBar([]);
      box.innerHTML = '<div class="muted small">Пока пусто. Загрузите сюда файлы.</div>';
      return;
    }

    // Keep selection within current folder + render toolbar
    bulkPruneToVisible(list);
    renderBulkBar(list);

    const bulkBar = modal && modal.querySelector('#otdVaultBulkBar');
    if (bulkBar){
      bulkBar.onclick = async (e)=>{
        const b = e.target && e.target.closest ? e.target.closest('button[data-bulkact]') : null;
        if (!b) return;
        const act = b.getAttribute('data-bulkact');

        if (act === 'all'){
          list.forEach(f=>bulkSelected.add(String(f.id||'')));
          renderFiles(allFiles, folderId);
          return;
        }
        if (act === 'clear'){
          bulkReset();
          renderFiles(allFiles, folderId);
          return;
        }
        if (act === 'cancelPick'){
          close();
          return;
        }
        if (act === 'attach'){
          if (!bulkSelected.size || !vaultPickCtx || !vaultPickCtx.requestId) return;
          try{
            setStatus('Прикрепляю к запросу...');
            const rid = vaultPickCtx.requestId;
            await apiJson('/api/client/requests/attach-vault','POST',{ requestId: rid, fileIds: Array.from(bulkSelected) });
            bulkReset();
            setStatus('Прикреплено');
            if (vaultPickResolve){ try{ vaultPickResolve(true); }catch(_){ } }
            vaultPickResolve = null;
            vaultPickCtx = null;
            setTimeout(()=>{ try{ close(); }catch(_){ } }, 400);
          }catch(err){
            setStatus('Ошибка: '+(err && err.message ? err.message : err));
          }
          return;
        }
        if (act === 'move'){
          if (!bulkSelected.size) return;
          showMoveDialogForIds(Array.from(bulkSelected));
          return;
        }
        if (act === 'delete'){
          if (!bulkSelected.size) return;
          const ok = confirm(TT('dialogs.delete_files', {n: bulkSelected.size}, 'Удалить выбранные файлы ({n})?'));
          if (!ok) return;
          try{
            setStatus('Удаляю...');
            await apiJson('/api/docs/files/bulk-delete','POST',{ fileIds: Array.from(bulkSelected) });
            bulkReset();
            await refresh(modal.querySelector('#otdVaultFolderSel')?.value || '');
            setStatus('Удалено');
            setTimeout(()=>setStatus(''), 900);
          }catch(err){
            setStatus('Ошибка: '+(err && err.message ? err.message : err));
          }
          return;
        }
      };
    }

    box.innerHTML = list.map(f=>{
      const dt = f.uploadedAt ? new Date(f.uploadedAt).toLocaleString() : '';
      const size = f.fileSize ? (Math.round((f.fileSize/1024)*10)/10 + ' KB') : '';
      const checked = bulkSelected.has(String(f.id||'')) ? 'checked' : '';
      return `
        <div class="card" style="padding:10px;border-radius:14px">
          <div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap">
            <div style="display:flex;gap:10px;align-items:flex-start;min-width:220px;flex:1">
              <input type="checkbox" data-bsel="1" data-fid="${esc(f.id)}" ${checked} style="margin-top:4px;transform:scale(1.08)" />
              <div>
                <div style="font-weight:800">${esc(f.fileName||'document')}</div>
                <div class="muted small" style="margin-top:4px">${esc(dt)} ${size?('• '+esc(size)):''}</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <a class="btn ghost small" href="${esc(f.fileUrl||'#')}" target="_blank" rel="noopener">Открыть</a>
              <button class="btn ghost small" type="button" data-docact="rename" data-fid="${esc(f.id)}">Имя</button>
              <button class="btn ghost small" type="button" data-docact="move" data-fid="${esc(f.id)}">Раздел</button>
              <button class="btn ghost small" type="button" data-docact="delete" data-fid="${esc(f.id)}">${TT('buttons.delete', null, 'Usuń')}</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    box.onchange = (e)=>{
      const cb = e.target && e.target.matches && e.target.matches('input[type="checkbox"][data-bsel]') ? e.target : null;
      if (!cb) return;
      const fid = cb.getAttribute('data-fid');
      if (!fid) return;
      if (cb.checked) bulkSelected.add(String(fid));
      else bulkSelected.delete(String(fid));
      renderBulkBar(list);
    };

    // One delegated handler for actions
    box.onclick = async (e)=>{
      const btn = e.target && e.target.closest ? e.target.closest('button[data-docact]') : null;
      if (!btn) return;
      const act = btn.getAttribute('data-docact');
      const fid = btn.getAttribute('data-fid');
      if (!fid) return;
      const file = (vaultState.files||[]).find(x=>String(x.id||'')===String(fid));
      if (!file) return;
      try{
        if (act === 'rename') {
          const current = String(file.fileName || 'document');
          const next = prompt('Новое имя файла', current);
          if (next === null) return;
          const name = String(next||'').trim();
          if (!name) { setStatus('Имя не может быть пустым'); return; }
          setStatus('Сохраняю имя...');
          await apiJson('/api/docs/files/rename','POST',{ fileId: fid, fileName: name });
          await refresh(modal.querySelector('#otdVaultFolderSel')?.value || '');
          setStatus('Готово');
          setTimeout(()=>setStatus(''), 900);
        }
        if (act === 'delete') {
          const ok = confirm(TT('dialogs.delete_file', null, 'Удалить файл? Он исчезнет из OneTapDay.'));
          if (!ok) return;
          setStatus('Удаляю...');
          await apiJson('/api/docs/files/delete','POST',{ fileId: fid });
          // keep bulk selection consistent
          bulkSelected.delete(String(fid));
          await refresh(modal.querySelector('#otdVaultFolderSel')?.value || '');
          setStatus('Удалено');
          setTimeout(()=>setStatus(''), 900);
        }
        if (act === 'move') {
          showMoveDialog(file);
        }
      } catch(err){
        setStatus('Ошибка: '+(err && err.message ? err.message : err));
      }
    };
  }

  // --- Move dialog (month+category or explicit folder) ---
  let moveDlg = null;
  let moveCtx = { fileIds:[], month:'', cat:'incoming', folderId:'' };

  function ensureMoveDlg(){
    if (moveDlg) return moveDlg;
    const d = document.createElement('div');
    d.id = 'otdVaultMoveDlg';
    d.style.cssText = 'position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:14px;';
    d.innerHTML = `
      <div style="width:min(520px,96vw);border-radius:18px;background:rgba(18,22,25,.94);border:1px solid rgba(255,255,255,.10);box-shadow:0 20px 80px rgba(0,0,0,.55);padding:14px">
        <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap">
          <div id="otdMoveTitle" style="font-weight:900">Переместить файл</div>
          <button id="otdMoveClose" class="btn ghost small" type="button">Закрыть</button>
        </div>

        <div class="muted small" style="margin-top:6px">Выберите новый месяц/раздел или конкретную папку.</div>

        <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div style="min-width:160px;flex:1">
            <div class="muted small" style="margin-bottom:6px">Месяц</div>
            <select id="otdMoveMonth" style="width:100%;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff"></select>
          </div>
          <div style="flex:2;min-width:220px">
            <div class="muted small" style="margin-bottom:6px">Раздел</div>
            <div id="otdMoveCats" style="display:flex;gap:8px;flex-wrap:wrap"></div>
          </div>
        </div>

        <div style="margin-top:12px">
          <div class="muted small" style="margin-bottom:6px">Или папка</div>
          <select id="otdMoveFolder" style="width:100%;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff"></select>
          <div class="muted small" style="opacity:.8;margin-top:6px">Если выбрана папка, она приоритетнее месяца/раздела.</div>
        </div>

        <div style="margin-top:14px;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
          <button id="otdMoveDo" class="btn" type="button">${TT('buttons.move', null, 'Przenieś')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(d);
    d.addEventListener('click', (e)=>{ if (e.target === d) hideMove(); });
    d.querySelector('#otdMoveClose')?.addEventListener('click', hideMove);
    d.querySelector('#otdMoveDo')?.addEventListener('click', ()=>{
      doMove().catch(err=>setStatus('Ошибка: '+(err && err.message ? err.message : err)));
    });
    moveDlg = d;
    return d;
  }

  function renderMoveCats(){
    const box = moveDlg.querySelector('#otdMoveCats');
    box.innerHTML = VAULT_CATS.map(cat=>{
      const active = (cat.id === moveCtx.cat);
      const cls = active ? 'btn' : 'btn secondary';
      return `<button type="button" class="${cls} small" data-mcat="${esc(cat.id)}">${esc(cat.label)}</button>`;
    }).join('');
    box.querySelectorAll('button[data-mcat]').forEach(b=>{
      b.addEventListener('click', ()=>{
        moveCtx.cat = b.getAttribute('data-mcat') || 'incoming';
        renderMoveCats();
      });
    });
  }

  function showMoveDialog(file){
    const id = String(file && file.id || '');
    if (!id) return;
    showMoveDialogForIds([id]);
  }

  function showMoveDialogForIds(ids){
    ensureMoveDlg();
    moveCtx.fileIds = Array.isArray(ids) ? ids.map(x=>String(x||'')).filter(Boolean) : [];
    const title = moveDlg.querySelector('#otdMoveTitle');
    if (title){
      const n = moveCtx.fileIds.length || 1;
      title.textContent = n === 1 ? 'Переместить файл' : ('Переместить ' + n + ' файлов');
    }
    moveCtx.month = selectedMonth || curMonth();
    moveCtx.cat = selectedCat || 'incoming';
    moveCtx.folderId = '';

    const msel = moveDlg.querySelector('#otdMoveMonth');
    const months = monthList(18);
    msel.innerHTML = months.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
    msel.value = months.includes(moveCtx.month) ? moveCtx.month : months[0];
    msel.onchange = ()=>{ moveCtx.month = msel.value || curMonth(); };

    renderMoveCats();

    const fsel = moveDlg.querySelector('#otdMoveFolder');
    const folders = (vaultState.folders||[]);
    fsel.innerHTML = `<option value="">(не выбрано)</option>` + folders.map(f=>`<option value="${esc(f.id)}">${esc(f.name||f.id)}</option>`).join('');
    fsel.onchange = ()=>{ moveCtx.folderId = fsel.value || ''; };

    moveDlg.style.display = 'flex';
  }
  function hideMove(){ if (moveDlg) moveDlg.style.display = 'none'; }

  async function doMove(){
    const fileIds = (moveCtx.fileIds||[]).map(x=>String(x||'')).filter(Boolean);
    if (!fileIds.length) return;
    setStatus('Перемещаю...');
    if (moveCtx.folderId){
      await apiJson('/api/docs/files/bulk-move','POST',{ fileIds, folderId: moveCtx.folderId });
    } else {
      await apiJson('/api/docs/files/bulk-move','POST',{ fileIds, month: moveCtx.month, category: moveCtx.cat });
    }
    hideMove();
    await refresh(modal.querySelector('#otdVaultFolderSel')?.value || '');
    setStatus('Готово');
    setTimeout(()=>setStatus(''), 900);
  }

  
  function getFolderShared(folderId){
    const fid = String(folderId||'');
    const f = (vaultState.folders||[]).find(x=>String(x.id||'')===fid);
    if (!f) return true;
    if (typeof f.sharedWithAccountant === 'boolean') return f.sharedWithAccountant;
    if (f.share && typeof f.share.accountant === 'boolean') return f.share.accountant;
    return true; // default shared
  }

  function renderShare(folderId){
    const btn = modal && modal.querySelector('#otdVaultShareToggle');
    const st = modal && modal.querySelector('#otdVaultShareState');
    if (!btn || !st) return;
    const fid = String(folderId||'');
    if (!fid){
      btn.disabled = true;
      btn.textContent = '...';
      st.textContent = '';
      return;
    }
    const shared = getFolderShared(fid);
    btn.disabled = false;
    btn.textContent = shared ? TT('vault.share_close_access', null, 'Закрыть доступ') : TT('vault.share_open_access', null, 'Открыть доступ');
    st.textContent = shared ? TT('vault.share_status_on', null, 'Бухгалтер видит эту папку') : TT('vault.share_status_off', null, 'Бухгалтер НЕ видит эту папку');
  }

  async function onToggleShare(){
    const sel = modal && modal.querySelector('#otdVaultFolderSel');
    const folderId = sel && sel.value ? sel.value : '';
    if (!folderId) { setStatus(TT('vault.share_choose_folder', null, 'Выберите папку')); return; }
    const cur = getFolderShared(folderId);
    const next = !cur;
    setStatus(next ? TT('vault.share_opening', null, 'Открываю доступ...') : TT('vault.share_closing', null, 'Закрываю доступ...'));
    await apiJson('/api/docs/folders/share', 'POST', { folderId, shared: next });
    await refresh(folderId);
    renderShare(folderId);
    setStatus(next ? TT('vault.share_opened', null, 'Доступ открыт') : TT('vault.share_closed', null, 'Доступ закрыт'));
    setTimeout(()=>setStatus(''), 1200);
  }

async function onCreateFolder(){
    const inp = modal.querySelector('#otdVaultNewFolder');
    const name = (inp.value||'').trim();
    if (!name) { setStatus('Введите имя папки'); return; }
    setStatus('Создаю папку...');
    await apiJson('/api/docs/folders/create','POST',{ name });
    inp.value='';
    await refresh();
    setStatus('Папка создана');
    setTimeout(()=>setStatus(''), 1200);
  }

  async function onUpload(){
    const sel = modal.querySelector('#otdVaultFolderSel');
    let folderId = sel && sel.value ? sel.value : '';
    if (!folderId){
      setStatus('Создаю папку...');
      try{ await syncSmart(); }catch(e){ setStatus('Ошибка: '+e.message); return; }
      folderId = (sel && sel.value) ? sel.value : '';
    }
    if (!folderId) { setStatus('Сначала создайте или выберите папку'); return; }
    const input = modal.querySelector('#otdVaultFileInput');
    const files = Array.from(input.files || []);
    if (!files.length) { setStatus('Выберите файлы'); return; }

    setStatus(`Загрузка 0/${files.length}...`);
    for (let i=0; i<files.length; i++){
      const f = files[i];
      const dataUrl = await new Promise((resolve, reject)=>{
        const r = new FileReader();
        r.onload = ()=>resolve(String(r.result||''));
        r.onerror = ()=>reject(new Error('File read error'));
        r.readAsDataURL(f);
      });
      await apiJson('/api/docs/upload','POST',{ folderId, fileName: f.name, dataUrl });
      setStatus(`Загрузка ${i+1}/${files.length}...`);
    }
    input.value='';
    await refresh();
    setStatus('Готово');
    setTimeout(()=>setStatus(''), 1200);
  }


  // Expose Vault API for other modules (e.g., Client Requests: attach from "My documents")
  try{
    window.OTD_Vault = window.OTD_Vault || {};
    window.OTD_Vault.open = open;
    window.OTD_Vault.openPicker = openPicker;
  }catch(_e){}

  function bind(){
    const btn = document.getElementById('openVaultBtn');
    if (btn && !btn.__otd_bound){
      btn.__otd_bound = true;
      btn.addEventListener('click', (e)=>{ e.preventDefault(); open(); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
