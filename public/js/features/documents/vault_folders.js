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
    { id:'incoming', labelKey:'vault.tabs.incoming', fallback:'Incoming' },
    { id:'outgoing', labelKey:'vault.tabs.outgoing', fallback:'Issued' },
    { id:'tax',      labelKey:'vault.tabs.tax',      fallback:'ZUS/PIT' },
    { id:'proof',    labelKey:'vault.tabs.proof',    fallback:'Proof' },
    { id:'other',    labelKey:'vault.tabs.other',    fallback:'Other' }
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
    const lbl = TT(cat.labelKey || ('vault.tabs.'+cat.id), null, cat.fallback || cat.label || cat.id);
    return `<button type="button" class="${cls} small" data-cat="${esc(cat.id)}">${esc(lbl)}</button>`;
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
          await syncSmart().catch(err=>setStatus(TT('common.error_prefix', {msg:(err && err.message)?err.message:String(err)}, 'Error: {msg}')));
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
            <div style="font-weight:900;font-size:18px" data-i18n="vault.modal_title">${TT('vault.modal_title', null, 'My documents')}</div>
            <div style="opacity:.75;font-size:12px;margin-top:2px" data-i18n="vault.modal_desc">${TT('vault.modal_desc', null, 'Folders and files inside OneTapDay. Not lost in chat, not lost in gallery.')}</div>
          </div>
          <button id="otdVaultClose" class="btn ghost" type="button" data-i18n="common.close">${TT('common.close', null, 'Close')}</button>
        </div>

        <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-top:12px">
          <div style="min-width:160px">
            <div class="muted small" style="margin-bottom:6px" data-i18n="vault.ui.month">${TT('vault.ui.month', null, 'Month')}</div>
            <select id="otdVaultMonthSel" style="width:100%;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff"></select>
          </div>
          <div style="flex:1;min-width:240px">
            <div class="muted small" style="margin-bottom:6px" data-i18n="vault.ui.section">${TT('vault.ui.section', null, 'Section')}</div>
            <div id="otdVaultCatBtns" style="display:flex;gap:8px;flex-wrap:wrap"></div>
          </div>
          <button id="otdVaultFoldersToggle" class="btn ghost" type="button" data-i18n="vault.ui.folders">${TT('vault.ui.folders', null, 'Folders')}</button>
        </div>

        <div id="otdVaultFoldersPanel" style="display:none;margin-top:12px">
          <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
            <div style="flex:1;min-width:220px">
              <div class="muted small" style="margin-bottom:6px" data-i18n="vault.ui.folder">${TT('vault.ui.folder', null, 'Folder')}</div>
              <select id="otdVaultFolderSel" style="width:100%;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff"></select>
            </div>
            <div style="min-width:220px;flex:1">
              <div class="muted small" style="margin-bottom:6px" data-i18n="vault.ui.new_folder">${TT('vault.ui.new_folder', null, 'New folder')}</div>
              <div style="display:flex;gap:8px">
                <input id="otdVaultNewFolder" data-i18n-ph="vault.ui.new_folder_ph" placeholder="e.g. 2025-12 / VAT / rent" style="flex:1;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff" />
                <button id="otdVaultCreateFolder" class="btn secondary" type="button" data-i18n="vault.ui.create_folder">${TT('vault.ui.create_folder', null, 'Create')}</button>
              </div>
            
          <div style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <div class="muted small" data-i18n="vault.ui.accountant_access">${TT('vault.ui.accountant_access', null, 'Accountant access')}</div>
            <button id="otdVaultShareToggle" class="btn secondary small" type="button">...</button>
            <div id="otdVaultShareState" class="muted small" style="opacity:.8"></div>
          </div>
        </div>
          </div>
        </div>

        <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <label class="btn secondary" style="cursor:pointer">
            <input id="otdVaultFileInput" type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" multiple style="display:none" />
            <span data-i18n="vault.ui.select_files">${TT('vault.ui.select_files', null, 'Select files')}</span>
          </label>
          <button id="otdVaultUploadBtn" class="btn" type="button" data-i18n="vault.ui.upload_to_folder">${TT('vault.ui.upload_to_folder', null, 'Upload to folder')}</button>
          <div id="otdVaultStatus" class="muted small" style="opacity:.85"></div>
        </div>

        <div style="margin-top:12px">
          <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:8px">
            <div style="font-weight:800" data-i18n="vault.ui.files">${TT('vault.ui.files', null, 'Files')}</div>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
              <input id="otdVaultSearch" data-i18n-ph="vault.ui.search_ph" placeholder="Search" style="padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff;min-width:180px" />
              <button id="otdVaultExportBtn" class="btn ghost small" type="button" data-i18n="vault.ui.export_month">${TT('vault.ui.export_month', null, 'Export month')}</button>
              <div id="otdVaultBulkBar" style="display:none;gap:8px;align-items:center;flex-wrap:wrap"></div>
            </div>
          </div>
          <div id="otdVaultFiles" style="display:flex;flex-direction:column;gap:8px"></div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    modal = wrap;
    try{ if (window.i18n && typeof i18n.apply==='function') i18n.apply(); }catch(_){ }

    wrap.addEventListener('click', (e)=>{ if (e.target === wrap) close(); });
    wrap.querySelector('#otdVaultClose')?.addEventListener('click', close);
    wrap.querySelector('#otdVaultCreateFolder')?.addEventListener('click', onCreateFolder);
    wrap.querySelector('#otdVaultUploadBtn')?.addEventListener('click', onUpload);
    wrap.querySelector('#otdVaultShareToggle')?.addEventListener('click', ()=>{
      onToggleShare().catch(err=>setStatus(TT('common.error_prefix', {msg:(err && err.message)?err.message:String(err)}, 'Error: {msg}')));
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
      await syncSmart().catch(err=>setStatus(TT('common.error_prefix', {msg:(err && err.message)?err.message:String(err)}, 'Error: {msg}')));
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
    syncSmart().catch(err=>setStatus(TT('common.error_prefix', {msg:(err && err.message)?err.message:String(err)}, 'Error: {msg}')));
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
    setStatus(TT('vault.status.pick_hint', null, 'Select files and attach to the request.'));
    return new Promise((resolve)=>{ vaultPickResolve = resolve; });
  }

  async function refresh(selectFolderId){
    setStatus(TT('vault.status.loading', null, 'Loading...'));
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
      box.innerHTML = `<div class="muted small" data-i18n="vault.ui.empty">${TT('vault.ui.empty', null, 'Empty for now. Upload files here.')}</div>`;
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
            setStatus(TT('vault.status.attaching', null, 'Attaching...'));
            const rid = vaultPickCtx.requestId;
            await apiJson('/api/client/requests/attach-vault','POST',{ requestId: rid, fileIds: Array.from(bulkSelected) });
            bulkReset();
            setStatus(TT('vault.status.attached', null, 'Attached.'));
            if (vaultPickResolve){ try{ vaultPickResolve(true); }catch(_){ } }
            vaultPickResolve = null;
            vaultPickCtx = null;
            setTimeout(()=>{ try{ close(); }catch(_){ } }, 400);
          }catch(err){
            setStatus(TT('common.error_prefix', {msg:(err && err.message)?err.message:String(err)}, 'Error: {msg}'));
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
          const ok = confirm(TT('dialogs.delete_files', {n: bulkSelected.size}, 'Delete selected files ({n})?'));
          if (!ok) return;
          try{
            setStatus(TT('vault.status.deleting', null, 'Deleting...'));
            await apiJson('/api/docs/files/bulk-delete','POST',{ fileIds: Array.from(bulkSelected) });
            bulkReset();
            await refresh(modal.querySelector('#otdVaultFolderSel')?.value || '');
            setStatus(TT('vault.status.deleted', null, 'Deleted.'));
            setTimeout(()=>setStatus(''), 900);
          }catch(err){
            setStatus(TT('common.error_prefix', {msg:(err && err.message)?err.message:String(err)}, 'Error: {msg}'));
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
              <a class="btn ghost small" href="${esc(f.fileUrl||'#')}" target="_blank" rel="noopener" data-i18n="vault.file_actions.open">${TT('vault.file_actions.open', null, 'Open')}</a>
              <button class="btn ghost small" type="button" data-docact="rename" data-fid="${esc(f.id)}" data-i18n="vault.file_actions.rename">${TT('vault.file_actions.rename', null, 'Name')}</button>
              <button class="btn ghost small" type="button" data-docact="move" data-fid="${esc(f.id)}" data-i18n="vault.ui.section">${TT('vault.ui.section', null, 'Section')}</button>
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
          const next = prompt(TT('vault.prompt.rename', null, 'New file name'), current);
          if (next === null) return;
          const name = String(next||'').trim();
          if (!name) { setStatus(TT('vault.errors.name_empty', null, 'Name cannot be empty.')); return; }
          setStatus(TT('vault.status.saving_name', null, 'Saving name...'));
          await apiJson('/api/docs/files/rename','POST',{ fileId: fid, fileName: name });
          await refresh(modal.querySelector('#otdVaultFolderSel')?.value || '');
          setStatus(TT('vault.status.done', null, 'Done.'));
          setTimeout(()=>setStatus(''), 900);
        }
        if (act === 'delete') {
          const ok = confirm(TT('dialogs.delete_file', null, 'Delete this file? It will be removed from OneTapDay.'));
          if (!ok) return;
          setStatus(TT('vault.status.deleting', null, 'Deleting...'));
          await apiJson('/api/docs/files/delete','POST',{ fileId: fid });
          // keep bulk selection consistent
          bulkSelected.delete(String(fid));
          await refresh(modal.querySelector('#otdVaultFolderSel')?.value || '');
          setStatus(TT('vault.status.deleted', null, 'Deleted.'));
          setTimeout(()=>setStatus(''), 900);
        }
        if (act === 'move') {
          showMoveDialog(file);
        }
      } catch(err){
        setStatus(TT('common.error_prefix', {msg:(err && err.message)?err.message:String(err)}, 'Error: {msg}'));
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
          <div id="otdMoveTitle" style="font-weight:900" data-i18n="vault.move.title_one">${TT('vault.move.title_one', null, 'Move file')}</div>
          <button id="otdMoveClose" class="btn ghost small" type="button" data-i18n="common.close">${TT('common.close', null, 'Close')}</button>
        </div>

        <div class="muted small" style="margin-top:6px" data-i18n="vault.move.help">${TT('vault.move.help', null, 'Choose a new month/section or a specific folder.')}</div>

        <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div style="min-width:160px;flex:1">
            <div class="muted small" style="margin-bottom:6px" data-i18n="vault.ui.month">${TT('vault.ui.month', null, 'Month')}</div>
            <select id="otdMoveMonth" style="width:100%;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff"></select>
          </div>
          <div style="flex:2;min-width:220px">
            <div class="muted small" style="margin-bottom:6px" data-i18n="vault.ui.section">${TT('vault.ui.section', null, 'Section')}</div>
            <div id="otdMoveCats" style="display:flex;gap:8px;flex-wrap:wrap"></div>
          </div>
        </div>

        <div style="margin-top:12px">
          <div class="muted small" style="margin-bottom:6px" data-i18n="vault.ui.or_folder">${TT('vault.ui.or_folder', null, 'Or folder')}</div>
          <select id="otdMoveFolder" style="width:100%;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff"></select>
          <div class="muted small" style="opacity:.8;margin-top:6px" data-i18n="vault.move.folder_priority">${TT('vault.move.folder_priority', null, 'If a folder is selected, it has priority over month/section.')}</div>
        </div>

        <div style="margin-top:14px;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
          <button id="otdMoveDo" class="btn" type="button">${TT('buttons.move', null, 'Przenieś')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(d);
    try{ if (window.i18n && typeof i18n.apply==='function') i18n.apply(); }catch(_){ }
    d.addEventListener('click', (e)=>{ if (e.target === d) hideMove(); });
    d.querySelector('#otdMoveClose')?.addEventListener('click', hideMove);
    d.querySelector('#otdMoveDo')?.addEventListener('click', ()=>{
      doMove().catch(err=>setStatus(TT('common.error_prefix', {msg:(err && err.message)?err.message:String(err)}, 'Error: {msg}')));
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
      title.textContent = (n === 1)
      ? TT('vault.move.title_one', null, 'Move file')
      : TT('vault.move.title_many', {n:n}, 'Move {n} files');
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
    fsel.innerHTML = `<option value="">${TT('vault.ui.not_selected', null, '(not selected)')}</option>` + folders.map(f=>`<option value="${esc(f.id)}">${esc(f.name||f.id)}</option>`).join('');
    fsel.onchange = ()=>{ moveCtx.folderId = fsel.value || ''; };

    moveDlg.style.display = 'flex';
  }
  function hideMove(){ if (moveDlg) moveDlg.style.display = 'none'; }

  async function doMove(){
    const fileIds = (moveCtx.fileIds||[]).map(x=>String(x||'')).filter(Boolean);
    if (!fileIds.length) return;
    setStatus(TT('vault.status.moving', null, 'Moving...'));
    if (moveCtx.folderId){
      await apiJson('/api/docs/files/bulk-move','POST',{ fileIds, folderId: moveCtx.folderId });
    } else {
      await apiJson('/api/docs/files/bulk-move','POST',{ fileIds, month: moveCtx.month, category: moveCtx.cat });
    }
    hideMove();
    await refresh(modal.querySelector('#otdVaultFolderSel')?.value || '');
    setStatus(TT('vault.status.done', null, 'Done.'));
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
    btn.textContent = shared ? TT('vault.share_close_access', null, 'Close access') : TT('vault.share_open_access', null, 'Open access');
    st.textContent = shared ? TT('vault.share_status_on', null, 'Accountant can see this folder') : TT('vault.share_status_off', null, 'Accountant cannot see this folder');
  }

  async function onToggleShare(){
    const sel = modal && modal.querySelector('#otdVaultFolderSel');
    const folderId = sel && sel.value ? sel.value : '';
    if (!folderId) { setStatus(TT('vault.share_choose_folder', null, 'Choose a folder')); return; }
    const cur = getFolderShared(folderId);
    const next = !cur;
    setStatus(next ? TT('vault.share_opening', null, 'Opening access...') : TT('vault.share_closing', null, 'Closing access...'));
    await apiJson('/api/docs/folders/share', 'POST', { folderId, shared: next });
    await refresh(folderId);
    renderShare(folderId);
    setStatus(next ? TT('vault.share_opened', null, 'Access opened') : TT('vault.share_closed', null, 'Access closed'));
    setTimeout(()=>setStatus(''), 1200);
  }

async function onCreateFolder(){
    const inp = modal.querySelector('#otdVaultNewFolder');
    const name = (inp.value||'').trim();
    if (!name) { setStatus(TT('vault.errors.folder_name_required', null, 'Enter folder name.')); return; }
    setStatus(TT('vault.status.creating_folder', null, 'Creating folder...'));
    await apiJson('/api/docs/folders/create','POST',{ name });
    inp.value='';
    await refresh();
    setStatus(TT('vault.status.folder_created', null, 'Folder created.'));
    setTimeout(()=>setStatus(''), 1200);
  }

  async function onUpload(){
    const sel = modal.querySelector('#otdVaultFolderSel');
    let folderId = sel && sel.value ? sel.value : '';
    if (!folderId){
      setStatus(TT('vault.status.creating_folder', null, 'Creating folder...'));
      try{ await syncSmart(); }catch(e){ setStatus(TT('common.error_prefix', {msg:(e && e.message)?e.message:String(e)}, 'Error: {msg}')); return; }
      folderId = (sel && sel.value) ? sel.value : '';
    }
    if (!folderId) { setStatus(TT('vault.errors.choose_folder_first', null, 'Create or select a folder first.')); return; }
    const input = modal.querySelector('#otdVaultFileInput');
    const files = Array.from(input.files || []);
    if (!files.length) { setStatus(TT('vault.errors.choose_files', null, 'Select files.')); return; }

    setStatus(TT('vault.status.upload_progress', {i:0,n:files.length}, 'Uploading {i}/{n}...'));
    for (let i=0; i<files.length; i++){
      const f = files[i];
      const dataUrl = await new Promise((resolve, reject)=>{
        const r = new FileReader();
        r.onload = ()=>resolve(String(r.result||''));
        r.onerror = ()=>reject(new Error('File read error'));
        r.readAsDataURL(f);
      });
      await apiJson('/api/docs/upload','POST',{ folderId, fileName: f.name, dataUrl });
      setStatus(TT('vault.status.upload_progress', {i:i+1,n:files.length}, 'Uploading {i}/{n}...'));
    }
    input.value='';
    await refresh();
    setStatus(TT('vault.status.done', null, 'Done.'));
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
