// Extracted from public/js/app/app.js (lines 7317-9185)
/* ===== Document Vault MVP (v2025-12-18) =====
   Цель: локальный "сейф" документов (IndexedDB) + запросы бухгалтера + пакеты ZIP (store-only).
   Ничего не ломаем: просто добавляем новый слой хранения и UI в разделе #docs.
*/
(function(){
  const VAULT = {};
  const DB_NAME = 'otd_docvault_v1';
  const DB_VER = 1;
  const storeNames = { docs:'docs', files:'files', requests:'requests', packages:'packages' };
  const nowIso = ()=> new Date().toISOString();

  const escapeHtml = (s)=>String(s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  function uuid(){
    try{ if (crypto && crypto.randomUUID) return crypto.randomUUID(); }catch(_){}
    return 'id-'+Math.random().toString(16).slice(2)+'-'+Date.now().toString(16);
  }

  function guessType(file){
    const n = (file?.name||'').toLowerCase();
    const m = (file?.type||'').toLowerCase();
    if (n.includes('mt940') || n.includes('statement') || n.includes('wyciag') || n.endsWith('.csv') || n.endsWith('.ofx') || n.endsWith('.qif') || n.endsWith('.sta') || n.endsWith('.xml') || n.endsWith('.json')) return 'statement';
    if (n.includes('fakt') || n.includes('invoice')) return 'invoice';
    if (n.includes('paragon') || n.includes('receipt')) return 'receipt';
    if (n.includes('umowa') || n.includes('contract')) return 'contract';
    if (n.includes('spis') || n.includes('inventory') || n.includes('inwent')) return 'inventory';
    if (n.includes('zus') || n.includes('urzad') || n.includes('us ') || n.includes('letter') || n.includes('pismo')) return 'letter';
    if (m.startsWith('image/')) return 'receipt';
    return 'other';
  }

  function guessPeriod(file){
    const n = (file?.name||'');
    const m1 = n.match(/(20\d{2})[-_. ]?(0[1-9]|1[0-2])/);
    if (m1) return `${m1[1]}-${m1[2]}`;
    return '';
  }

  async function sha256Hex(blob){
    try{
      const max = 5*1024*1024; // не хешируем гигантов
      if (!blob || blob.size > max) return '';
      const buf = await blob.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buf);
      const arr = Array.from(new Uint8Array(digest));
      return arr.map(b=>b.toString(16).padStart(2,'0')).join('');
    }catch(e){ return ''; }
  }

  function openDb(){
    return new Promise((resolve,reject)=>{
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = ()=>{
        const db = req.result;
        if(!db.objectStoreNames.contains(storeNames.docs)) db.createObjectStore(storeNames.docs, { keyPath:'id' });
        if(!db.objectStoreNames.contains(storeNames.files)) db.createObjectStore(storeNames.files, { keyPath:'id' });
        if(!db.objectStoreNames.contains(storeNames.requests)) db.createObjectStore(storeNames.requests, { keyPath:'id' });
        if(!db.objectStoreNames.contains(storeNames.packages)) db.createObjectStore(storeNames.packages, { keyPath:'id' });
      };
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> reject(req.error);
    });
  }

  function tx(db, stores, mode='readonly'){ return db.transaction(stores, mode); }

  async function put(store, value){
    const db = await openDb();
    return new Promise((resolve,reject)=>{
      const t = tx(db, [store], 'readwrite');
      t.oncomplete = ()=> resolve(true);
      t.onerror = ()=> reject(t.error);
      t.objectStore(store).put(value);
    });
  }

  async function get(store, key){
    const db = await openDb();
    return new Promise((resolve,reject)=>{
      const t = tx(db, [store], 'readonly');
      const req = t.objectStore(store).get(key);
      req.onsuccess = ()=> resolve(req.result || null);
      req.onerror = ()=> reject(req.error);
    });
  }

  async function del(store, key){
    const db = await openDb();
    return new Promise((resolve,reject)=>{
      const t = tx(db, [store], 'readwrite');
      const req = t.objectStore(store).delete(key);
      req.onsuccess = ()=> resolve(true);
      req.onerror = ()=> reject(req.error);
    });
  }

  async function getAll(store){
    const db = await openDb();
    return new Promise((resolve,reject)=>{
      const t = tx(db, [store], 'readonly');
      const req = t.objectStore(store).getAll();
      req.onsuccess = ()=> resolve(req.result || []);
      req.onerror = ()=> reject(req.error);
    });
  }

  function auditAppend(doc, action, extra){
    const item = { ts: nowIso(), action, ...(extra||{}) };
    doc.audit = Array.isArray(doc.audit) ? doc.audit : [];
    doc.audit.unshift(item);
    if (doc.audit.length > 50) doc.audit = doc.audit.slice(0,50);
  }

  async function addFiles(files, opts={}){
    const list = Array.from(files || []);
    for(const file of list){
      const id = uuid();
      const type = opts.type || guessType(file);
      const period = (opts.period || guessPeriod(file) || '').trim();
      const hash = await sha256Hex(file);
      const meta = {
        id,
        name: file?.name || `file-${id}`,
        size: file?.size || 0,
        mime: file?.type || '',
        created_at: nowIso(),
        source: opts.source || 'upload',
        type,
        period,
        counterparty: (opts.counterparty || '').trim(),
        for_accountant: !!opts.for_accountant,
        status: 'new',
        deleted_at: '',
        content_hash: hash,
        links: [],
        audit: []
      };
      auditAppend(meta, 'created', { source: meta.source, type: meta.type });
      await put(storeNames.docs, meta);
      await put(storeNames.files, { id, blob: file });
    }
  }

  function fmtBytes(n){
    if(!Number.isFinite(n) || n<=0) return '0 B';
    const units = ['B','KB','MB','GB'];
    let i=0; let v=n;
    while(v>=1024 && i<units.length-1){ v/=1024; i++; }
    return `${v.toFixed(i===0?0:1)} ${units[i]}`;
  }

  function typeLabel(t){
    const map = {
      statement:'Wyciąg bankowy',
      invoice:'Faktura',
      receipt:'Paragon / rachunek',
      contract:'Umowa',
      inventory:'Inwentaryzacja',
      letter:'Pismo / urząd',
      handover:'Protokół przekazania',
      explain:'Wyjaśnienie przelewu',
      other:'Inne'
    };
    return map[t] || 'Inne';
  }

  function sanitizeName(name){
    return String(name||'file').replace(/[\/\\:*?"<>|]/g,'_').slice(0,160);
  }

  // --- ZIP writer (STORE, без сжатия, зато без библиотек) ---
  const CRC_TABLE = (function(){
    let c; const table = new Uint32Array(256);
    for(let n=0;n<256;n++){
      c = n;
      for(let k=0;k<8;k++) c = (c & 1) ? (0xEDB88320 ^ (c>>>1)) : (c>>>1);
      table[n]=c>>>0;
    }
    return table;
  })();

  function crc32(buf){
    let crc = 0xFFFFFFFF;
    for(let i=0;i<buf.length;i++){
      crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function dosTime(date){
    const d = date instanceof Date ? date : new Date();
    const sec = Math.floor(d.getSeconds()/2);
    const min = d.getMinutes();
    const hour = d.getHours();
    return (hour<<11) | (min<<5) | sec;
  }
  function dosDate(date){
    const d = date instanceof Date ? date : new Date();
    const day = d.getDate();
    const month = d.getMonth()+1;
    const year = d.getFullYear();
    return ((year-1980)<<9) | (month<<5) | day;
  }
  const u16 = (n)=> [n & 0xFF, (n>>>8)&0xFF];
  const u32 = (n)=> [n & 0xFF, (n>>>8)&0xFF, (n>>>16)&0xFF, (n>>>24)&0xFF];

  async function makeZip(fileEntries){
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const dt = new Date();

    for(const ent of fileEntries){
      const name = sanitizeName(ent.name);
      const nameBytes = new TextEncoder().encode(name);
      const dataBuf = new Uint8Array(await ent.blob.arrayBuffer());
      const crc = crc32(dataBuf);
      const mtime = ent.mtime ? new Date(ent.mtime) : dt;
      const modTime = dosTime(mtime);
      const modDate = dosDate(mtime);

      const localHeader = new Uint8Array([
        ...u32(0x04034b50),
        ...u16(20),
        ...u16(0),
        ...u16(0),
        ...u16(modTime),
        ...u16(modDate),
        ...u32(crc),
        ...u32(dataBuf.length),
        ...u32(dataBuf.length),
        ...u16(nameBytes.length),
        ...u16(0)
      ]);
      localParts.push(localHeader, nameBytes, dataBuf);

      const centralHeader = new Uint8Array([
        ...u32(0x02014b50),
        ...u16(20),
        ...u16(20),
        ...u16(0),
        ...u16(0),
        ...u16(modTime),
        ...u16(modDate),
        ...u32(crc),
        ...u32(dataBuf.length),
        ...u32(dataBuf.length),
        ...u16(nameBytes.length),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(offset)
      ]);
      centralParts.push(centralHeader, nameBytes);

      offset += localHeader.length + nameBytes.length + dataBuf.length;
    }

    const centralStart = offset;
    let centralSize = 0;
    for(const part of centralParts) centralSize += part.length;

    const end = new Uint8Array([
      ...u32(0x06054b50),
      ...u16(0), ...u16(0),
      ...u16(fileEntries.length),
      ...u16(fileEntries.length),
      ...u32(centralSize),
      ...u32(centralStart),
      ...u16(0)
    ]);

    return new Blob([...localParts, ...centralParts, end], {type:'application/zip'});
  }

  function downloadBlob(blob, filename){
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 700);
  }

  
  // UI state
  let els = {};
  let state = { docs:[], sel:null, requests:[], packages:[], view:'all', prevView:'all' };

  const q = (id)=>document.getElementById(id);

  function setBtnActive(activeBtn, btns){
    (btns||[]).forEach(b=>{
      if(!b) return;
      b.classList.remove('secondary');
      b.classList.add('ghost');
    });
    if(activeBtn){
      activeBtn.classList.remove('ghost');
      activeBtn.classList.add('secondary');
    }
  }

  function setView(view){
    state.view = view || 'all';

    // Panels
    if(els.panelDocs) els.panelDocs.style.display = (state.view==='all' || state.view==='accountant' || state.view==='trash') ? '' : 'none';
    if(els.panelReq)  els.panelReq.style.display  = (state.view==='requests') ? '' : 'none';
    if(els.tplPanel)  els.tplPanel.style.display  = (state.view==='templates') ? '' : 'none';

    // Tabs
    const tabSet = [els.tabAll, els.tabAcc, els.tabReq, els.tabTrash];
    if(state.view==='all') setBtnActive(els.tabAll, tabSet);
    else if(state.view==='accountant') setBtnActive(els.tabAcc, tabSet);
    else if(state.view==='requests') setBtnActive(els.tabReq, tabSet);
    else if(state.view==='trash') setBtnActive(els.tabTrash, tabSet);
    else setBtnActive(null, tabSet);

    // Highlight "Utwórz dokument" when templates are open
    if(els.createDocBtn){
      if(state.view==='templates'){
        els.createDocBtn.classList.remove('ghost');
        els.createDocBtn.classList.add('secondary');
      }else{
        els.createDocBtn.classList.add('ghost');
        els.createDocBtn.classList.remove('secondary');
      }
    }

    // Details only on docs views
    if(state.view!=='all' && state.view!=='accountant' && state.view!=='trash'){
      closeModal();
      if(els.det) els.det.style.display='none';
      state.sel = null;
    }

    if(state.view==='templates'){
      renderTemplateChooser();
    }

    renderList();
    renderRequests();
  }

  function bindUI(){
    els.addBtn = q('vaultAddBtn');
    els.createDocBtn = q('vaultCreateDocBtn');
    els.shareBtn = q('vaultShareBtn');
    els.sharePeriod = q('vaultSharePeriod');
    els.overlay = q('vaultOverlay');
    els.detClose = q('vaultDetCloseBtn');

    els.input = q('vaultInput');
    els.search = q('vaultSearch');
    els.list = q('vaultList');
    els.stats = q('vaultStats');

    els.panelDocs = q('vaultPanelDocs');
    els.panelReq  = q('vaultPanelReq');
    els.tplPanel  = q('vaultTemplatesPanel');
    els.tplHost   = q('tplFormHost');

    els.tabAll = q('vaultTabAll');
    els.tabAcc = q('vaultTabAcc');
    els.tabReq = q('vaultTabReq');
    els.tabTrash = q('vaultTabTrash');

    // Details
    els.det = q('vaultDetails');
    els.detType = q('vaultDetType');
    els.detName = q('vaultDetName');
    els.detMeta = q('vaultDetMeta');
    els.editType = q('vaultEditType');
    els.editPeriod = q('vaultEditPeriod');
    els.editCounterparty = q('vaultEditCounterparty');
    els.editForAcc = q('vaultEditForAcc');
    els.saveMeta = q('vaultSaveMetaBtn');
    els.download = q('vaultDownloadBtn');
    els.preview = q('vaultPreviewBtn');
    els.trash = q('vaultToTrashBtn');
    els.restore = q('vaultRestoreBtn');
    els.audit = q('vaultAudit');

    // Requests
    els.reqList = q('vaultReqList');
    els.newReqBtn = q('vaultNewReqBtn');

    // Templates
    els.tplHandoverBtn = q('tplHandoverBtn');
    els.tplExplainBtn = q('tplExplainBtn');
    els.tplCloseBtn = q('tplCloseBtn');

    if(!els.addBtn || !els.input || !els.list) return false;

    // Delegated list events (bind once)
    if(!state._listBound){
      state._listBound = true;
      els.list.addEventListener('click', onListClick);
      els.list.addEventListener('change', onListChange);
    }

    // Add doc
    els.addBtn.addEventListener('click', ()=> els.input.click());
    els.input.addEventListener('change', async ()=>{
      if(!els.input.files || !els.input.files.length) return;
      await addFiles(els.input.files, {source:'upload'});
      els.input.value='';
      await refresh();
      setView('all');
    });

    // Search
    els.search?.addEventListener('input', ()=> renderList());
    els.sharePeriod?.addEventListener('input', ()=> renderList());

    // Modal close
    els.overlay?.addEventListener('click', ()=> closeModal());
    els.detClose?.addEventListener('click', ()=> closeModal());

    // Tabs
    els.tabAll?.addEventListener('click', ()=> setView('all'));
    els.tabAcc?.addEventListener('click', ()=> setView('accountant'));
    els.tabReq?.addEventListener('click', ()=> setView('requests'));
    els.tabTrash?.addEventListener('click', ()=> setView('trash'));

    // Create doc (templates)
    els.createDocBtn?.addEventListener('click', ()=>{
      // Inline templates view (no blur/no modal)
      state.prevView = state.view || 'all';
      setView('templates');
    });
    els.tplCloseBtn?.addEventListener('click', ()=>{ setView(state.prevView || 'all'); });

    // Templates buttons
    els.tplHandoverBtn?.addEventListener('click', ()=> renderTemplateHandover());
    els.tplExplainBtn?.addEventListener('click', ()=> renderTemplateExplain());

    // Share to accountant (ZIP)
    els.shareBtn?.addEventListener('click', async ()=>{
      const period = (els.sharePeriod?.value || '').trim();
      await createAccountantPackage(period);
    });

    // Save meta
    els.saveMeta?.addEventListener('click', async ()=>{
      const doc = state.sel;
      if(!doc) return;
      doc.type = els.editType?.value || doc.type;
      doc.period = (els.editPeriod?.value || '').trim();
      doc.counterparty = (els.editCounterparty?.value || '').trim();
      doc.for_accountant = !!(els.editForAcc?.checked);
      auditAppend(doc, 'meta_saved', {type:doc.type, period:doc.period, counterparty:doc.counterparty, for_accountant:doc.for_accountant});
      await put(storeNames.docs, doc);
      await refresh(doc.id);
    });

    // Download
    els.download?.addEventListener('click', async ()=>{
      if(!state.sel) return;
      const f = await get(storeNames.files, state.sel.id);
      if(!f || !f.blob) return alert('Brak pliku w magazynie.');
      downloadBlob(f.blob, sanitizeName(state.sel.name || 'document'));
    });

els.preview?.addEventListener('click', async ()=>{
      if(!state.sel) return;
      await previewDoc(state.sel.id);
    });

    // Trash / restore
    els.trash?.addEventListener('click', async ()=>{
      if(!state.sel) return;
      const doc = state.sel;
      if(doc.deleted_at) return;
      doc.deleted_at = nowIso();
      auditAppend(doc, 'trashed', {});
      await put(storeNames.docs, doc);
      await refresh(null);
    });
    els.restore?.addEventListener('click', async ()=>{
      if(!state.sel) return;
      const doc = state.sel;
      if(!doc.deleted_at) return;
      doc.deleted_at = '';
      auditAppend(doc, 'restored', {});
      await put(storeNames.docs, doc);
      await refresh(doc.id);
    });

    // Requests: new request
    els.newReqBtn?.addEventListener('click', async ()=>{
      const title = prompt('Co prosi księgowy? (np. „Wyciąg 2025-11 + 3 faktury”)','');
      if(!title || !title.trim()) return;
      const req = {
        id: uuid(),
        created_at: nowIso(),
        title: title.trim(),
        items: [{ id: uuid(), text: title.trim(), done:false, doc_id:'' }]
      };
      await put(storeNames.requests, req);
      await refreshRequests();
      setView('requests');
    });

    // Default view
    setView('all');

    return true;
  }

  function visibleDocs(){
    const docs = Array.isArray(state.docs)? state.docs : [];
    const s = (els.search?.value || '').trim().toLowerCase();
    let list = docs.slice();

    if(state.view==='trash'){
      list = list.filter(d=>!!d.deleted_at);
    } else {
      list = list.filter(d=>!d.deleted_at);
    }

    if(state.view==='accountant'){
      list = list.filter(d=>d.for_accountant);
    }

if(s){
      list = list.filter(d=>{
        const hay = `${d.name||''} ${d.type||''} ${d.period||''} ${d.counterparty||''}`.toLowerCase();
        return hay.includes(s);
      });
    }

    // sort: non-deleted first, then by created desc
    list.sort((a,b)=>{
      const ad = a.deleted_at?1:0;
      const bd = b.deleted_at?1:0;
      if(ad!==bd) return ad-bd;
      return (b.created_at||'').localeCompare(a.created_at||'');
    });
    return list;
  }

  async function previewDoc(docId){
    const f = await get(storeNames.files, docId);
    if(!f || !f.blob) return alert('Brak pliku w magazynie.');
    const url = URL.createObjectURL(f.blob);
    window.open(url, '_blank');
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
  }

  function showOverlay(){
    if(els.overlay) els.overlay.style.display = 'block';
  }
  function hideOverlay(){
    if(els.overlay) els.overlay.style.display = 'none';
  }

  function openModal(kind){
    state.modal = kind || null;
    if(kind==='details'){
      showOverlay();
      if(els.det) els.det.style.display = '';
    }
  }

  function closeModal(){
    if(els.det) els.det.style.display = 'none';
    hideOverlay();
    state.modal = null;
  }



  
  function renderList(){
    if(!els.list) return;

    const list = visibleDocs();

    if(els.stats){
      const total = (state.docs||[]).filter(d=>!d.deleted_at).length;
      const accAll = (state.docs||[]).filter(d=>!d.deleted_at && d.for_accountant).length;
      const trash = (state.docs||[]).filter(d=>!!d.deleted_at).length;
      els.stats.textContent = `Dokumenty: ${total} · Do księgowego: ${accAll} · Kosz: ${trash}`;
    }

    const period = (els.sharePeriod?.value || '').trim();
    const packCount = (state.docs||[]).filter(d=>!d.deleted_at && d.for_accountant && (!period || (d.period||'')===period)).length;
    if(els.shareBtn) els.shareBtn.textContent = `Przekaż księgowemu (${packCount})`;

    if(!list.length){
      const msg = state.view==='accountant'
        ? 'Brak dokumentów oznaczonych „Do wysłania”. Zaznacz checkbox przy dokumencie.'
        : (state.view==='trash'
            ? 'Kosz jest pusty.'
            : (state.view==='requests'
                ? 'Brak zapytań od księgowego.'
                : 'Brak dokumentów. Dodaj pliki (PDF/zdjęcia/CSV/XLSX/MT940).'));
      els.list.innerHTML = `<div class="vaultEmpty">${escapeHtml(msg)}</div>`;
      return;
    }

    els.list.innerHTML = list.map(d=>{
      const subParts = [];
      if(d.period) subParts.push(d.period);
      if(d.counterparty) subParts.push(d.counterparty);
      const sub = subParts.join(' · ');
      const isTrash = !!d.deleted_at;

      return `
        <div class="vaultItem ${d.id===state.sel?.id?'active':''}" data-doc="${d.id}">
          <div class="vaultInfo">
            <div class="vaultName">${escapeHtml(d.name||'—')}</div>
            <div class="vaultSub">${escapeHtml(typeLabel(d.type))}${sub?` · ${escapeHtml(sub)}`:''}</div>
          </div>
          <div class="vaultActions">
            <div class="vaultQuick">
              ${!isTrash
                ? `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-action="foracc" data-id="${d.id}" ${d.for_accountant?'checked':''}/> <span class="muted small">Do wysłania</span></label>`
                : `<span class="pill" style="border-color:rgba(239,68,68,.25);color:#fecaca">W koszu</span>`}
              ${!isTrash
                ? `<button class="btn link" data-action="trash" data-id="${d.id}" type="button">Do kosza</button>`
                : `<button class="btn link" data-action="restore" data-id="${d.id}" type="button">Przywróć</button>`}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Delegated list handlers (more reliable than re-binding per render)
  async function onListClick(e){
    const t = e.target;

    // Ignore clicks on checkbox/label so it doesn't open details
    if(t?.matches('input[data-action="foracc"]') || (t?.closest('label') && t.closest('label').querySelector('input[data-action="foracc"]'))){
      return;
    }

    const actBtn = t?.closest('[data-action]');
    if(actBtn){
      const action = actBtn.getAttribute('data-action');
      const id = actBtn.getAttribute('data-id');

      if(action==='trash'){
        e.preventDefault(); e.stopPropagation();
        await toTrash(id);
        if(state.sel && state.sel.id===id){ closeModal(); state.sel=null; }
        await refresh();
        return;
      }
      if(action==='restore'){
        e.preventDefault(); e.stopPropagation();
        await restoreDoc(id);
        if(state.sel && state.sel.id===id){ closeModal(); state.sel=null; }
        await refresh();
        return;
      }
    }

    const item = t?.closest('.vaultItem');
    if(item){
      const id = item.getAttribute('data-doc');
      if(id) selectDoc(id);
    }
  }

  async function onListChange(e){
    const t = e.target;
    if(!t?.matches('input[data-action="foracc"]')) return;
    const id = t.getAttribute('data-id');
    const doc = (state.docs||[]).find(d=>d.id===id);
    if(!doc) return;
    doc.for_accountant = !!t.checked;
    auditAppend(doc, 'for_accountant_set', { for_accountant: doc.for_accountant });
    await put(storeNames.docs, doc);
    renderList();
  }



  function renderDetails(){
    if(!els.det) return;
    const doc = state.sel;
    if(!doc){
      els.det.style.display='none';
      return;
    }
    els.det.style.display='';
    if(els.detType) els.detType.textContent = typeLabel(doc.type);
    if(els.detName) els.detName.textContent = doc.name || '—';

    const metaBits = [];
    if(doc.size) metaBits.push(fmtBytes(doc.size));
    if(doc.mime) metaBits.push(doc.mime);
    if(doc.created_at) metaBits.push(doc.created_at.slice(0,10));
    if(doc.for_accountant) metaBits.push('Dla księgowego');
    if(doc.deleted_at) metaBits.push('W koszu');
    if(els.detMeta) els.detMeta.textContent = metaBits.join(' · ') || '—';

    if(els.editType) els.editType.value = doc.type || 'other';
    if(els.editPeriod) els.editPeriod.value = doc.period || '';
    if(els.editCounterparty) els.editCounterparty.value = doc.counterparty || '';
    if(els.editForAcc) els.editForAcc.checked = !!doc.for_accountant;

    if(els.restore) els.restore.style.display = doc.deleted_at ? '' : 'none';
    if(els.trash) els.trash.style.display = doc.deleted_at ? 'none' : '';

    // Audit
    if(els.audit){
      const lines = (doc.audit||[]).slice().reverse().map(a=>{
        const t = a.at ? a.at : '';
        const ev = a.ev || '';
        const data = a.data ? JSON.stringify(a.data) : '';
        return `${t} — ${ev}${data?` — ${data}`:''}`;
      });
      els.audit.textContent = lines.length ? lines.join('\n') : '—';
    }
  }

  async function selectDoc(id){
    const doc = (state.docs||[]).find(d=>d.id===id);
    state.sel = doc || null;
    renderList();
    renderDetails();
    if(state.sel) openModal('details'); else closeModal();
  }

  async function refresh(selectId=null){
    try{
      state.docs = await getAll(storeNames.docs);
      // keep selection
      if(selectId){
        state.sel = state.docs.find(d=>d.id===selectId) || null;
      } else if(state.sel){
        state.sel = state.docs.find(d=>d.id===state.sel.id) || null;
      }
      renderList();
      renderDetails();
      await refreshRequests();
    }catch(e){
      console.warn('Vault refresh error', e);
      if(els.list) els.list.innerHTML = `<div class="vaultEmpty">Błąd Vault: ${escapeHtml(e?.message || String(e))}</div>`;
    }
  }

  async function refreshRequests(){
    try{
      state.requests = await getAll(storeNames.requests);
      renderRequests();
    }catch(e){
      console.warn('Vault req refresh error', e);
    }
  }

  function renderRequests(){
    if(!els.reqList) return;
    if(state.view!=='requests') return;

    const reqs = (state.requests||[]).sort((a,b)=> (b.created_at||'').localeCompare(a.created_at||''));
    if(!reqs.length){
      els.reqList.innerHTML = `<div class="vaultEmpty">Brak próśb. Dodaj nowe, gdy księgowy prosi o dokumenty.</div>`;
      return;
    }

    const docs = (state.docs||[]).filter(d=>!d.deleted_at);
    const options = ['<option value="">— wybierz dokument —</option>'].concat(
      docs.map(d=>`<option value="${d.id}">${escapeHtml(d.name)} (${typeLabel(d.type)} ${escapeHtml(d.period||'')})</option>`)
    ).join('');

    els.reqList.innerHTML = reqs.map(r=>{
      const itemsHtml = (r.items||[]).map(it=>{
        return `
          <div class="card" style="margin-top:8px;padding:10px">
            <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">
              <label class="muted small" style="display:flex;align-items:center;gap:6px">
                <input type="checkbox" data-req="${r.id}" data-item="${it.id}" ${it.done?'checked':''}/>
                Zrobione
              </label>
              <div style="font-weight:700;flex:1">${escapeHtml(it.text||'')}</div>
            </div>
            <div class="row" style="margin-top:8px;gap:8px;align-items:center;flex-wrap:wrap">
              <select data-req="${r.id}" data-item-doc="${it.id}" style="min-width:260px">
                ${options}
              </select>
              <button class="btn ghost small" data-add-item="${r.id}" type="button">+ punkt</button>
              <button class="btn ghost small" data-del-req="${r.id}" type="button">Usuń</button>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="card" style="margin-top:10px">
          <div style="font-weight:800">${escapeHtml(r.title||'Prośba')}</div>
          ${itemsHtml}
        </div>
      `;
    }).join('');

    // restore selected values
    reqs.forEach(r=>{
      (r.items||[]).forEach(it=>{
        const sel = els.reqList.querySelector(`select[data-req="${r.id}"][data-item-doc="${it.id}"]`);
        if(sel && it.doc_id) sel.value = it.doc_id;
      });
    });

    // handlers
    els.reqList.querySelectorAll('input[type=checkbox][data-req]').forEach(cb=>{
      cb.addEventListener('change', async ()=>{
        const rid = cb.getAttribute('data-req');
        const itemId = cb.getAttribute('data-item');
        const req = reqs.find(x=>x.id===rid);
        if(!req) return;
        const it = (req.items||[]).find(x=>x.id===itemId);
        if(!it) return;
        it.done = !!cb.checked;
        await put(storeNames.requests, req);
        await refreshRequests();
      });
    });

    els.reqList.querySelectorAll('select[data-req][data-item-doc]').forEach(sel=>{
      sel.addEventListener('change', async ()=>{
        const rid = sel.getAttribute('data-req');
        const itemId = sel.getAttribute('data-item-doc');
        const req = reqs.find(x=>x.id===rid);
        if(!req) return;
        const it = (req.items||[]).find(x=>x.id===itemId);
        if(!it) return;
        it.doc_id = sel.value || '';
        await put(storeNames.requests, req);
        await refreshRequests();
      });
    });

    els.reqList.querySelectorAll('[data-add-item]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const rid = btn.getAttribute('data-add-item');
        const req = reqs.find(x=>x.id===rid);
        if(!req) return;
        const text = prompt('Nowy punkt (co jeszcze trzeba dostarczyć?)','');
        if(!text || !text.trim()) return;
        req.items = req.items || [];
        req.items.push({ id: uuid(), text: text.trim(), done:false, doc_id:'' });
        await put(storeNames.requests, req);
        await refreshRequests();
      });
    });

    els.reqList.querySelectorAll('[data-del-req]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const rid = btn.getAttribute('data-del-req');
        if(!confirm(TT('dialogs.delete_request', null, 'Usunąć prośbę?'))) return;
        await del(storeNames.requests, rid);
        await refreshRequests();
      });
    });
  }

  async function createAccountantPackage(period){
    const docs = (state.docs||[]).filter(d=>!d.deleted_at && d.for_accountant);
    const chosen = period ? docs.filter(d=>String(d.period||'')===period) : docs;

    if(!chosen.length){
      alert('Brak dokumentów do przekazania.\nZaznacz „Dla księgowego” w szczegółach dokumentu (i ustaw Okres, jeśli filtrujesz).');
      return;
    }

    const pkgId = uuid();
    const manifest = {
      package_id: pkgId,
      created_at: nowIso(),
      period: period || '',
      mode: 'accountant',
      count: chosen.length,
      docs: chosen.map(d=>({
        id:d.id,
        name:d.name,
        type:d.type,
        period:d.period||'',
        counterparty:d.counterparty||'',
        mime:d.mime||'',
        size:d.size||0,
        content_hash:d.content_hash||''
      }))
    };

    const entries = [];
    // manifest.json
    entries.push({ name: 'manifest.json', blob: new Blob([JSON.stringify(manifest,null,2)], {type:'application/json'}) });

    for(const d of chosen){
      const f = await get(storeNames.files, d.id);
      if(f && f.blob){
        entries.push({ name: sanitizeName(d.name), blob: f.blob });
      }
    }

    const zipBlob = makeZip(entries);
    const safePeriod = period ? period.replace(/[^0-9\-]/g,'') : 'all';
    downloadBlob(zipBlob, `OneTapDay_DlaKsiegowego_${safePeriod}.zip`);

    // optional: audit
    for(const d of chosen){
      const doc = (state.docs||[]).find(x=>x.id===d.id);
      if(doc){
        auditAppend(doc, 'shared_with_accountant', {period: period || ''});
        await put(storeNames.docs, doc);
      }
    }
    await refresh(state.sel?.id || null);
  }

  function renderTemplateChooser(){
    if(!els.tplHost) return;
    els.tplHost.innerHTML = `
      <div class="vaultEmpty">Wybierz szablon powyżej. Wygenerowany plik pojawi się w „Moje dokumenty” i będzie oznaczony jako „Dla księgowego”.</div>
    `;
  }

  function renderTemplateHandover(){
    if(!els.tplHost) return;
    const defaultPeriod = (new Date()).toISOString().slice(0,7);
    els.tplHost.innerHTML = `
      <div class="card" style="padding:12px">
        <div style="font-weight:800">Protokół przekazania dokumentów</div>
        <div class="muted small" style="margin-top:6px">Dowód „przekazałem”. Przydatne, kiedy ktoś udaje, że nic nie dostał.</div>

        <div class="row" style="margin-top:10px;gap:8px;align-items:flex-end;flex-wrap:wrap">
          <label class="muted small">Okres (YYYY-MM)
            <input id="tplHandPeriod" type="text" placeholder="np. 2025-11" value="${defaultPeriod}"/>
          </label>
          <label class="muted small">Nazwa firmy
            <input id="tplHandCompany" type="text" placeholder="Twoja firma"/>
          </label>
          <label class="muted small">Księgowy (opc.)
            <input id="tplHandAcc" type="text" placeholder="Imię / biuro rachunkowe"/>
          </label>
        </div>

        <div class="muted small" style="margin-top:10px">Dokumenty do dołączenia:</div>
        <div id="tplHandDocs" style="margin-top:8px"></div>

        <label class="muted small" style="margin-top:10px;display:block">Komentarz (opc.)
          <input id="tplHandNote" type="text" placeholder="np. brak faktury od X, doślę jutro"/>
        </label>

        <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
          <button class="btn" id="tplHandGen" type="button">Wygeneruj</button>
        </div>
      </div>
    `;

    // Render doc checkboxes
    const docsHost = q('tplHandDocs');
    const period = q('tplHandPeriod')?.value?.trim() || '';
    const docs = (state.docs||[]).filter(d=>!d.deleted_at && d.for_accountant && (!period || d.period===period));
    docsHost.innerHTML = docs.length ? docs.map(d=>`
      <label class="muted small" style="display:flex;gap:8px;align-items:center;margin-top:6px">
        <input type="checkbox" data-docchk="${d.id}" checked/>
        <span>${escapeHtml(d.name)} <span class="muted">(${escapeHtml(typeLabel(d.type))} ${escapeHtml(d.period||'')})</span></span>
      </label>
    `).join('') : `<div class="vaultEmpty">Brak dokumentów oznaczonych „Dla księgowego” dla tego okresu. Oznacz dokumenty i wróć.</div>`;

    // Update list when period changes
    q('tplHandPeriod')?.addEventListener('input', ()=> renderTemplateHandover());

    q('tplHandGen')?.addEventListener('click', async ()=>{
      const periodVal = (q('tplHandPeriod')?.value || '').trim();
      const company = (q('tplHandCompany')?.value || '').trim();
      const accountant = (q('tplHandAcc')?.value || '').trim();
      const note = (q('tplHandNote')?.value || '').trim();

      const checkedIds = Array.from(els.tplHost.querySelectorAll('input[type=checkbox][data-docchk]'))
        .filter(x=>x.checked).map(x=>x.getAttribute('data-docchk'));

      if(!checkedIds.length){
        alert('Zaznacz przynajmniej jeden dokument.');
        return;
      }
      const chosen = (state.docs||[]).filter(d=>checkedIds.includes(d.id));

      const rows = chosen.map((d, i)=>`
        <tr>
          <td style="padding:6px;border:1px solid #333">${i+1}</td>
          <td style="padding:6px;border:1px solid #333">${escapeHtml(d.name||'')}</td>
          <td style="padding:6px;border:1px solid #333">${escapeHtml(typeLabel(d.type))}</td>
          <td style="padding:6px;border:1px solid #333">${escapeHtml(d.period||'')}</td>
        </tr>
      `).join('');

      const html = `
<!doctype html><html><head><meta charset="utf-8"/>
<title>Protokół przekazania</title>
<style>
  body{font-family:Arial, sans-serif; padding:24px; color:#111;}
  h1{font-size:18px;margin:0 0 8px 0;}
  .muted{color:#555;font-size:12px;}
  table{border-collapse:collapse; width:100%; margin-top:12px; font-size:12px;}
  .sig{margin-top:18px; display:flex; gap:40px;}
  .sig div{flex:1;}
  .line{border-top:1px solid #333; margin-top:28px;}
</style>
</head><body>
<h1>Protokół przekazania dokumentów</h1>
<div class="muted">Okres: ${escapeHtml(periodVal||'—')}</div>
<div class="muted">Firma: ${escapeHtml(company||'—')}</div>
<div class="muted">Księgowy: ${escapeHtml(accountant||'—')}</div>

<table>
  <thead>
    <tr>
      <th style="padding:6px;border:1px solid #333;text-align:left">#</th>
      <th style="padding:6px;border:1px solid #333;text-align:left">Dokument</th>
      <th style="padding:6px;border:1px solid #333;text-align:left">Typ</th>
      <th style="padding:6px;border:1px solid #333;text-align:left">Okres</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

${note?`<div class="muted" style="margin-top:12px">Uwagi: ${escapeHtml(note)}</div>`:''}

<div class="sig">
  <div><div class="line"></div><div class="muted">Przekazujący</div></div>
  <div><div class="line"></div><div class="muted">Przyjmujący (księgowy)</div></div>
</div>

<div class="muted" style="margin-top:16px">Wygenerowano w OneTapDay. Możesz wydrukować do PDF.</div>
</body></html>`;

      const filename = sanitizeName(`Protokol_przekazania_${periodVal||'okres'}.html`);
      const file = new File([html], filename, {type:'text/html'});

      await addFiles([file], {source:'template', type:'handover', period:periodVal, counterparty:accountant, for_accountant:true});
      await refresh();
      setView('all');
    });
  }

  function renderTemplateExplain(){
    if(!els.tplHost) return;

    const txList = (typeof _otdGetJSON==='function') ? (_otdGetJSON('tx_manual_import', []) || []) : [];
    const last = (txList||[]).slice().reverse().slice(0,100);

    const opt = ['<option value="">— wybierz transakcję —</option>'].concat(
      last.map(r=>{
        const id = r.id || r["ID transakcji"] || '';
        const date = (r["Data księgowania"] || r["Data transakcji"] || r["Data"] || '').toString();
        const amt = (r["Kwota"] || r["Kwota transakcji"] || r["Amount"] || '').toString();
        const who = (r["Nazwa kontrahenta"] || r["Kontrahent"] || r["Odbiorca/Nadawca"] || r["Opis"] || '').toString();
        const label = `${date} | ${amt} | ${who}`.slice(0,120);
        return `<option value="${escapeHtml(String(id))}">${escapeHtml(label)}</option>`;
      })
    ).join('');

    els.tplHost.innerHTML = `
      <div class="card" style="padding:12px">
        <div style="font-weight:800">Wyjaśnienie przelewu</div>
        <div class="muted small" style="margin-top:6px">Krótki dokument „co to za płatność”. Najczęściej tego brakuje.</div>

        <label class="muted small" style="display:block;margin-top:10px">Transakcja (opcjonalnie)
          <select id="tplExpTx" style="width:100%;margin-top:6px">${opt}</select>
        </label>

        <div class="row" style="margin-top:10px;gap:8px;align-items:flex-end;flex-wrap:wrap">
          <label class="muted small">Data
            <input id="tplExpDate" type="text" placeholder="YYYY-MM-DD"/>
          </label>
          <label class="muted small">Kwota
            <input id="tplExpAmt" type="text" placeholder="np. -1299.00 PLN"/>
          </label>
          <label class="muted small">Kontrahent
            <input id="tplExpWho" type="text" placeholder="np. Landlord"/>
          </label>
        </div>

        <label class="muted small" style="display:block;margin-top:10px">Powód / opis (możesz dyktować)
          <input id="tplExpReason" type="text" placeholder="np. czynsz za listopad 2025"/>
        </label>

        <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
          <button class="btn" id="tplExpGen" type="button">Wygeneruj</button>
        </div>
      </div>
    `;

    // when tx selected, prefill
    q('tplExpTx')?.addEventListener('change', ()=>{
      const id = q('tplExpTx')?.value || '';
      if(!id) return;
      const r = (txList||[]).find(x=>String(x.id || x["ID transakcji"] || '')===String(id));
      if(!r) return;
      const date = (r["Data księgowania"] || r["Data transakcji"] || r["Data"] || '').toString();
      const amt = (r["Kwota"] || r["Kwota transakcji"] || r["Amount"] || '').toString();
      const who = (r["Nazwa kontrahenta"] || r["Kontrahent"] || r["Odbiorca/Nadawca"] || r["Opis"] || '').toString();
      if(q('tplExpDate')) q('tplExpDate').value = date;
      if(q('tplExpAmt')) q('tplExpAmt').value = amt;
      if(q('tplExpWho')) q('tplExpWho').value = who;
    });

    q('tplExpGen')?.addEventListener('click', async ()=>{
      const date = (q('tplExpDate')?.value || '').trim();
      const amt = (q('tplExpAmt')?.value || '').trim();
      const who = (q('tplExpWho')?.value || '').trim();
      const reason = (q('tplExpReason')?.value || '').trim();

      if(!date && !amt && !who && !reason){
        alert('Wypełnij przynajmniej opis.');
        return;
      }

      const period = (date && date.length>=7) ? date.slice(0,7) : '';

      const html = `
<!doctype html><html><head><meta charset="utf-8"/>
<title>Wyjaśnienie przelewu</title>
<style>
  body{font-family:Arial, sans-serif; padding:24px; color:#111;}
  h1{font-size:18px;margin:0 0 8px 0;}
  .muted{color:#555;font-size:12px;}
  .box{border:1px solid #333; padding:12px; margin-top:12px; font-size:12px;}
  .line{border-top:1px solid #333; margin-top:28px; width:240px;}
</style>
</head><body>
<h1>Wyjaśnienie przelewu</h1>
<div class="muted">Okres: ${escapeHtml(period||'—')}</div>

<div class="box">
  <div><b>Data:</b> ${escapeHtml(date||'—')}</div>
  <div><b>Kwota:</b> ${escapeHtml(amt||'—')}</div>
  <div><b>Kontrahent:</b> ${escapeHtml(who||'—')}</div>
  <div style="margin-top:10px"><b>Opis:</b> ${escapeHtml(reason||'—')}</div>
</div>

<div class="line"></div>
<div class="muted">Podpis</div>

<div class="muted" style="margin-top:16px">Wygenerowano w OneTapDay. Możesz wydrukować do PDF.</div>
</body></html>`;

      const safe = (date||'').replace(/[^0-9\-]/g,'') || 'date';
      const filename = sanitizeName(`Wyjasnienie_przelewu_${safe}.html`);
      const file = new File([html], filename, {type:'text/html'});

      await addFiles([file], {source:'template', type:'explain', period, counterparty:who, for_accountant:true});
      await refresh();
      setView('all');
    });
  }

      VAULT.addFiles = addFiles;
  VAULT.refresh = refresh;
  VAULT.setView = setView;
  VAULT.open = setView;

  VAULT.init = async function(){
    if(!bindUI()) return;
    await refresh(null);
  };

  window.OTD_DocVault = VAULT;
})();


document.addEventListener('DOMContentLoaded', ()=>{ 
  try{ window.OTD_DocVault?.init?.(); }catch(e){ console.warn('DocVault init error', e); } 
});


/* ===========================
   Invoice template (local)
   - lives in "Dokumenty" as accountant tool
   - does NOT create records in "Faktury"
   =========================== */

let invoiceTplEditingId = null;

function _otdTplById(id){ return document.getElementById(id); }

function _otdTplEscHtml(s){
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#39;");
}

function _otdTplDownload(filename, content, mime){
  try{
    const blob = new Blob([content], {type: mime || 'text/plain;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ try{ URL.revokeObjectURL(a.href); }catch(_){} a.remove(); }, 0);
  }catch(err){
    console.warn(err);
    toast('Nie udało się pobrać pliku (download).');
  }
}

function _otdTplGetForm(){
  return {
    id: invoiceTplEditingId || ('tpl_' + Date.now()),
    name: (_otdTplById('invoiceTplName')?.value || '').trim() || 'Szablon',
    number: (_otdTplById('invoiceTplNumber')?.value || '').trim(),
    currency: (_otdTplById('invoiceTplCurrency')?.value || '').trim() || 'PLN',
    issue: (_otdTplById('invoiceTplIssue')?.value || '').trim(),
    due: (_otdTplById('invoiceTplDue')?.value || '').trim(),
    seller: (_otdTplById('invoiceTplSeller')?.value || '').trim(),
    buyer: (_otdTplById('invoiceTplBuyer')?.value || '').trim(),
    title: (_otdTplById('invoiceTplTitle')?.value || '').trim(),
    amount: (_otdTplById('invoiceTplAmount')?.value || '').trim(),
    note: (_otdTplById('invoiceTplNote')?.value || '').trim(),
    updatedAt: new Date().toISOString(),
  };
}

function _otdTplFillForm(t){
  if(!t) return;
  invoiceTplEditingId = t.id || null;
  if(_otdTplById('invoiceTplName')) _otdTplById('invoiceTplName').value = t.name || '';
  if(_otdTplById('invoiceTplNumber')) _otdTplById('invoiceTplNumber').value = t.number || '';
  if(_otdTplById('invoiceTplCurrency')) _otdTplById('invoiceTplCurrency').value = t.currency || 'PLN';
  if(_otdTplById('invoiceTplIssue')) _otdTplById('invoiceTplIssue').value = t.issue || '';
  if(_otdTplById('invoiceTplDue')) _otdTplById('invoiceTplDue').value = t.due || '';
  if(_otdTplById('invoiceTplSeller')) _otdTplById('invoiceTplSeller').value = t.seller || '';
  if(_otdTplById('invoiceTplBuyer')) _otdTplById('invoiceTplBuyer').value = t.buyer || '';
  if(_otdTplById('invoiceTplTitle')) _otdTplById('invoiceTplTitle').value = t.title || '';
  if(_otdTplById('invoiceTplAmount')) _otdTplById('invoiceTplAmount').value = t.amount || '';
  if(_otdTplById('invoiceTplNote')) _otdTplById('invoiceTplNote').value = t.note || '';
  invoiceTplUpdateEditState();
}

function _otdTplClearForm(){
  invoiceTplEditingId = null;
  ['invoiceTplName','invoiceTplNumber','invoiceTplCurrency','invoiceTplIssue','invoiceTplDue','invoiceTplSeller','invoiceTplBuyer','invoiceTplTitle','invoiceTplAmount','invoiceTplNote']
    .forEach(id => { const el=_otdTplById(id); if(el) el.value = (id==='invoiceTplCurrency' ? 'PLN' : ''); });
  invoiceTplUpdateEditState();
}

function _otdTplRenderList(){
  const box = _otdTplById('invoiceTplList');
  if(!box) return;
  box.innerHTML = '';
  const arr = Array.isArray(invoiceTemplates) ? invoiceTemplates : [];
  if(arr.length === 0){
    box.innerHTML = '<div class="muted small">Brak zapisanych szablonów.</div>';
    return;
  }
  arr
    .slice()
    .sort((a,b)=> String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))
    .forEach(t=>{
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '8px';
      row.style.alignItems = 'center';

      const left = document.createElement('div');
      left.style.flex = '1';
      left.style.minWidth = '0';
      left.innerHTML = `<div style="font-weight:700">${_otdTplEscHtml(t.name||'Szablon')}</div>
                        <div class="muted small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                          ${_otdTplEscHtml(t.number||'')} ${t.amount ? ('• ' + _otdTplEscHtml(t.amount) + ' ' + _otdTplEscHtml(t.currency||'')) : ''}
                        </div>`;
      row.appendChild(left);

      const btnLoad = document.createElement('button');
      btnLoad.className = 'btn secondary';
      btnLoad.textContent = 'Edytuj';
      btnLoad.onclick = ()=>{ _otdTplFillForm(t); toast('Szablon załadowany.'); };
      row.appendChild(btnLoad);

      const btnDel = document.createElement('button');
      btnDel.className = 'btn ghost';
      btnDel.textContent = 'Usuń';
      btnDel.onclick = ()=>{
        invoiceTemplates = invoiceTemplates.filter(x=>x.id!==t.id);
        saveLocal();
        _otdTplRenderList();
        if(invoiceTplEditingId === t.id) _otdTplClearForm();
        toast('Usunięto.');
      };
      row.appendChild(btnDel);

      box.appendChild(row);
    });
}

function openInvoiceTplModal(){
  const el = _otdTplById('invoiceTplModal');
  if(!el) return;
  el.classList.add('show');
  // refresh from storage in case we came from another tab
  try{ invoiceTemplates = _otdGetJSON('invoice_templates', invoiceTemplates || []); }catch(_){}
  _otdTplRenderList();
  invoiceTplUpdateEditState();
}

function closeInvoiceTplModal(){
  const el = _otdTplById('invoiceTplModal');
  if(!el) return;
  el.classList.remove('show');
}


function invoiceTplUpdateEditState(){
  const label = _otdTplById('invoiceTplEditState');
  const btnSave = _otdTplById('invoiceTplSave');
  if(!btnSave) return;
  if(invoiceTplEditingId){
    if(label) label.textContent = 'Tryb edycji: zapiszesz zmiany w tym szablonie.';
    btnSave.textContent = 'Zapisz zmiany';
  }else{
    if(label) label.textContent = '';
    btnSave.textContent = 'Zapisz';
  }
}

let _invoiceVoiceRec = null;
function invoiceVoiceDictate(){
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!Speech){
    try{ showToast?.('Rozpoznawanie mowy niedostępne w tej przeglądarce'); }catch(_){}
    return;
  }
  if(!_invoiceVoiceRec){
    _invoiceVoiceRec = new Speech();
    _invoiceVoiceRec.interimResults = false;
    _invoiceVoiceRec.maxAlternatives = 1;
    _invoiceVoiceRec.onresult = (e)=>{
      const t = (e?.results?.[0]?.[0]?.transcript || '').trim();
      if(!t) return;
      const active = document.activeElement;
      if(active && (active.tagName==='INPUT' || active.tagName==='TEXTAREA')){
        const prev = active.value || '';
        active.value = prev ? (prev + ' ' + t) : t;
        try{ active.dispatchEvent(new Event('input', {bubbles:true})); }catch(_){}
        return;
      }
      // fallback: title
      const fallback = _otdTplById('invoiceTplTitle') || _otdTplById('invoiceTplNote');
      if(fallback){
        const prev = fallback.value || '';
        fallback.value = prev ? (prev + ' ' + t) : t;
        try{ fallback.dispatchEvent(new Event('input', {bubbles:true})); }catch(_){}
      }
    };
    _invoiceVoiceRec.onerror = ()=>{
      try{ showToast?.('Błąd rozpoznawania mowy'); }catch(_){}
    };
  }
  const langSel = _otdTplById('invoiceVoiceLang');
  _invoiceVoiceRec.lang = (langSel?.value || 'pl-PL');
  try{ showToast?.('Mów teraz…'); }catch(_){}
  try{ _invoiceVoiceRec.start(); }catch(_){}
}


function invoiceTplSaveFromForm(){
  const t = _otdTplGetForm();
  if(!t.seller && !t.buyer && !t.title && !t.amount){
    toast('Wypełnij przynajmniej sprzedawcę/nabywcę/opis/kwotę.');
    return;
  }
  const idx = (invoiceTemplates||[]).findIndex(x=>x.id===t.id);
  if(idx >= 0) invoiceTemplates[idx] = t;
  else invoiceTemplates = [...(invoiceTemplates||[]), t];

  saveLocal();
  _otdTplRenderList();
  invoiceTplUpdateEditState();
  toast('Zapisano szablon.');
}

function _otdTplBuildHtml(t){
  const seller = _otdTplEscHtml(t.seller||'');
  const buyer  = _otdTplEscHtml(t.buyer||'');
  const title  = _otdTplEscHtml(t.title||'Usługa');
  const amount = _otdTplEscHtml(t.amount||'');
  const cur    = _otdTplEscHtml(t.currency||'PLN');
  const num    = _otdTplEscHtml(t.number||'');
  const issue  = _otdTplEscHtml(t.issue||'');
  const due    = _otdTplEscHtml(t.due||'');
  const note   = _otdTplEscHtml(t.note||'');

  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Faktura ${num}</title>
<style>
  body{font-family:Arial, sans-serif; margin:24px; color:#111;}
  .row{display:flex; gap:24px;}
  .col{flex:1;}
  .h{font-size:20px; font-weight:700; margin-bottom:10px;}
  .box{border:1px solid #ddd; border-radius:10px; padding:12px;}
  table{width:100%; border-collapse:collapse; margin-top:14px;}
  th,td{border-bottom:1px solid #eee; padding:8px; text-align:left; vertical-align:top;}
  th{background:#f7f7f7;}
  .right{text-align:right;}
  .muted{color:#666; font-size:12px;}
</style>
</head>
<body>
  <div class="h">Faktura ${num}</div>
  <div class="muted">Data wystawienia: ${issue || '—'} • Termin płatności: ${due || '—'}</div>

  <div class="row" style="margin-top:14px">
    <div class="col box"><div style="font-weight:700;margin-bottom:6px">Sprzedawca</div><div>${seller.replaceAll('\n','<br/>')}</div></div>
    <div class="col box"><div style="font-weight:700;margin-bottom:6px">Nabywca</div><div>${buyer.replaceAll('\n','<br/>')}</div></div>
  </div>

  <table>
    <thead><tr><th>Pozycja</th><th class="right">Kwota</th></tr></thead>
    <tbody><tr><td>${title}</td><td class="right">${amount} ${cur}</td></tr></tbody>
    <tfoot><tr><th class="right">Razem</th><th class="right">${amount} ${cur}</th></tr></tfoot>
  </table>

  ${note ? `<div class="box" style="margin-top:14px"><div style="font-weight:700;margin-bottom:6px">Uwagi</div><div>${note.replaceAll('\n','<br/>')}</div></div>` : ''}

  <div class="muted" style="margin-top:14px">Wygenerowane w OneTapDay (MVP).</div>
</body>
</html>`;
}

function invoiceTplDownloadHTML(){
  const t = _otdTplGetForm();
  const html = _otdTplBuildHtml(t);
  const name = (t.number ? t.number : (t.name||'invoice')).replaceAll(' ','_');
  _otdTplDownload(`Faktura_${name}.html`, html, 'text/html;charset=utf-8');
}

function invoiceTplDownloadCSV(){
  const t = _otdTplGetForm();
  // very simple CSV: one row template
  const cols = ['template_name','invoice_no','issue_date','due_date','seller','buyer','title','amount_gross','currency','note'];
  const row = [
    t.name||'',
    t.number||'',
    t.issue||'',
    t.due||'',
    (t.seller||'').replaceAll('\n',' '),
    (t.buyer||'').replaceAll('\n',' '),
    t.title||'',
    t.amount||'',
    t.currency||'PLN',
    (t.note||'').replaceAll('\n',' ')
  ];
  const esc = (v)=> `"${String(v??'').replaceAll('"','""')}"`;
  const csv = cols.join(',') + "\n" + row.map(esc).join(',');
  const name = (t.name||'invoice_template').replaceAll(' ','_');
  _otdTplDownload(`SzablonFaktury_${name}.csv`, csv, 'text/csv;charset=utf-8');
}


// ===============================
// INVENTORY TEMPLATE (local)
// ===============================
let inventoryTemplates = [];
let inventoryTplEditingName = null;

function openInventoryTplModal(){
  const el = _otdTplById('inventoryTplModal');
  if(!el) return;
  el.classList.add('show');
  try{ inventoryTemplates = _otdGetJSON('inventory_templates', inventoryTemplates || []); }catch(_){}
  _otdInvRenderList();
  inventoryTplUpdateEditState();
}

function closeInventoryTplModal(){
  const el = _otdTplById('inventoryTplModal');
  if(!el) return;
  el.classList.remove('show');
}

function _otdInvGetForm(){
  const get = (id)=> (_otdTplById(id)?.value || '').trim();
  const name = get('inventoryTplName');
  const date = get('inventoryTplDate');
  const location = get('inventoryTplLocation');
  const rowsRaw = get('inventoryTplRows');
  let rows = parseInt(rowsRaw || '50', 10);
  if(isNaN(rows) || rows < 10) rows = 50;
  if(rows > 500) rows = 500;
  return { name, date, location, rows, updatedAt: Date.now() };
}

function _otdInvSetForm(t){
  const set = (id,val)=>{ const el=_otdTplById(id); if(el) el.value = (val||''); };
  set('inventoryTplName', t?.name || '');
  set('inventoryTplDate', t?.date || '');
  set('inventoryTplLocation', t?.location || '');
  set('inventoryTplRows', String(t?.rows || 50));
}


function inventoryTplUpdateEditState(){
  const label = byId('inventoryTplEditState');
  const btnSave = byId('inventoryTplSave');
  if(!btnSave) return;
  if(inventoryTplEditingName){
    if(label) label.textContent = 'Tryb edycji: zapiszesz zmiany w tym szablonie.';
    btnSave.textContent = 'Zapisz zmiany';
  }else{
    if(label) label.textContent = '';
    btnSave.textContent = 'Zapisz';
  }
}

function inventoryTplClearForm(){
  _otdInvSetForm({name:'', place:'', date:'', items:''});
  inventoryTplEditingName = null;
  inventoryTplUpdateEditState();
}


function inventoryTplSaveFromForm(){
  const t = _otdInvGetForm();
  if(!t.name){
    try{ showToast?.('Podaj nazwę szablonu'); }catch(_){}
    return;
  }
  // upsert by name
  try{
    inventoryTemplates = _otdGetJSON('inventory_templates', inventoryTemplates || []);
  }catch(_){}
  const idx = inventoryTemplates.findIndex(x => (x?.name||'').toLowerCase() === t.name.toLowerCase());
  if(idx >= 0) inventoryTemplates[idx] = { ...inventoryTemplates[idx], ...t };
  else inventoryTemplates.unshift(t);
  _otdSetJSON('inventory_templates', inventoryTemplates);
  _otdInvRenderList();
  inventoryTplEditingName = t.name;
  inventoryTplUpdateEditState();
  try{ showToast?.('Zapisano'); }catch(_){}
}

function _otdInvRenderList(){
  const wrap = _otdTplById('inventoryTplList');
  if(!wrap) return;
  wrap.innerHTML = '';
  let list = inventoryTemplates || [];
  try{ list = _otdGetJSON('inventory_templates', list); }catch(_){}
  inventoryTemplates = Array.isArray(list) ? list : [];
  if(inventoryTemplates.length === 0){
    const empty = document.createElement('div');
    empty.className = 'muted small';
    empty.textContent = 'Brak zapisanych szablonów';
    wrap.appendChild(empty);
    return;
  }
  inventoryTemplates.forEach((t, i)=>{
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.border = '1px solid rgba(255,255,255,0.08)';
    row.style.borderRadius = '12px';
    row.style.padding = '8px';
    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.flexDirection = 'column';
    left.style.gap = '2px';
    const title = document.createElement('div');
    title.style.fontWeight = '700';
    title.style.fontSize = '12px';
    title.innerHTML = escapeHtml(t?.name || 'Szablon');
    const meta = document.createElement('div');
    meta.className = 'muted small';
    meta.style.fontSize = '11px';
    const parts = [];
    if(t?.date) parts.push(t.date);
    if(t?.location) parts.push(t.location);
    parts.push(`wiersze: ${t?.rows || 50}`);
    meta.textContent = parts.join(' · ');
    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.gap = '6px';
    const btnLoad = document.createElement('button');
    btnLoad.className = 'btn secondary small';
    btnLoad.textContent = 'Edytuj';
    btnLoad.addEventListener('click', (e)=>{ e.preventDefault(); inventoryTplEditingName = (t?.name || null); _otdInvSetForm(t); inventoryTplUpdateEditState(); toast('Załadowano do edycji'); });

    const btnDel = document.createElement('button');
    btnDel.className = 'btn ghost small';
    btnDel.textContent = 'Usuń';
    btnDel.addEventListener('click', (e)=>{
      e.preventDefault();
      inventoryTemplates = inventoryTemplates.filter((_, idx)=> idx !== i);
      _otdSetJSON('inventory_templates', inventoryTemplates);
      _otdInvRenderList();
    });

    right.appendChild(btnLoad);
    right.appendChild(btnDel);

    row.appendChild(left);
    row.appendChild(right);
    wrap.appendChild(row);
  });
}

function _otdInvBuildHeader(){
  return ['Item name','SKU/Code','Unit','Qty counted','Unit price','Total','VAT rate','Warehouse/Location','Notes'];
}

function inventoryTplDownloadCSV(){
  const t = _otdInvGetForm();
  const header = _otdInvBuildHeader();
  const rows = [];
  rows.push(header);
  const n = t.rows || 50;
  for(let i=0;i<n;i++){
    rows.push(['','','','','','','','','']);
  }
  const csv = rows.map(r => r.map(v => {
    const s = String(v ?? '');
    if(s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replaceAll('"','""')}"`;
    return s;
  }).join(',')).join('\n');
  const name = (t.name || 'inventory').replaceAll(' ','_');
  _otdTplDownload(`Inwentaryzacja_${name}.csv`, csv, 'text/csv;charset=utf-8');
}

function inventoryTplDownloadXLSX(){
  const t = _otdInvGetForm();
  const header = _otdInvBuildHeader();
  const aoa = [];
  // optional metadata row (kept simple)
  if(t.date || t.location){
    aoa.push([`Inventory date: ${t.date || ''}`, `Location: ${t.location || ''}`]);
    aoa.push([]);
  }
  aoa.push(header);
  const n = t.rows || 50;
  for(let i=0;i<n;i++){
    aoa.push(['','','','','','','','','']);
  }

  if(!(window.XLSX && XLSX.utils && XLSX.writeFile)){
    // fallback to CSV
    inventoryTplDownloadCSV();
    try{ showToast?.('Brak XLSX: pobrano CSV'); }catch(_){}
    return;
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
  const name = (t.name || 'inventory').replaceAll(' ','_');
  XLSX.writeFile(wb, `Inwentaryzacja_${name}.xlsx`);
}


/* === QALTA CASH UI glue (visual-only; uses existing kasa data & actions) === */
function _otdCashMonthSums(){
  const now = new Date();
  const ym = now.toISOString().slice(0,7);
  let ins = 0, outs = 0;
  (kasa||[]).forEach(k=>{
    const d = String(k.date||"").slice(0,7);
    if(d !== ym) return;
    if(k.type === 'przyjęcie') ins += Number(k.amount||0);
    if(k.type === 'wydanie') outs += Number(k.amount||0);
  });
  return {ins, outs};
}
function _otdFmtPLN(n){
  try{
    const v = Number(n||0);
    // keep it simple, no locale surprises
    return v.toFixed(2);
  }catch(_){ return String(n||"0.00"); }
}

function renderKasaQalta(listKasa){
  const balEl = $id('cashBalanceBig');
  if(balEl && typeof kasaBalance === 'function'){
    balEl.textContent = _otdFmtPLN(kasaBalance()) + ' PLN';
  }
  const sums = _otdCashMonthSums();
  const inEl = $id('cashMonthIn'); if(inEl) inEl.textContent = '+ ' + _otdFmtPLN(sums.ins);
  const outEl = $id('cashMonthOut'); if(outEl) outEl.textContent = '- ' + _otdFmtPLN(sums.outs);

  const feed = $id('kasaFeed');
  if(!feed) return;
  feed.innerHTML = '';

  const grouped = {};
  (listKasa||[]).forEach(k=>{
    const d = (k.date||today()).slice(0,10);
    (grouped[d] = grouped[d] || []).push(k);
  });

  const days = Object.keys(grouped).sort((a,b)=> b.localeCompare(a));
  days.forEach(day=>{
    const h = document.createElement('div');
    h.className = 'q-day';
    h.textContent = day;
    feed.appendChild(h);

    grouped[day].forEach(k=>{
      const type = k.type || '';
      const isIn = type === 'przyjęcie';
      const isOut = type === 'wydanie';

      // Category-first icon (instead of arrows)
      const rawCat = (k.category || '').toString().trim();
      const rawCatClean = rawCat.replace(/^[^\wА-Яа-яЁё]+/u,'').trim();
      let catObj = null;
      try{
        if(rawCatClean && typeof getCatById === 'function') catObj = getCatById(rawCatClean);
        if(!catObj && rawCatClean && typeof getAllSpCats === 'function'){
          const cats = getAllSpCats() || [];
          catObj = cats.find(c => String(c.label||'').toLowerCase() === rawCatClean.toLowerCase()) || null;
        }
      }catch(e){}

      const catEmoji = (catObj && catObj.emoji) ? catObj.emoji : '';
      const catLabel = (catObj && catObj.label) ? catObj.label : (rawCatClean || '');

      const icon = catEmoji ? catEmoji : (isIn ? '💰' : (isOut ? '🧾' : '📦'));
      const title = (k.comment && String(k.comment).trim()) ? String(k.comment).trim() : (isIn?'Przyjęcie': isOut?'Wydatek':'Kasa');
      const sub = (catLabel && catLabel !== 'Без категории' && catLabel !== '—') ? catLabel : (k.source || '');

      const row = document.createElement('div');
      row.className = 'q-item';
      const amt = Number(k.amount||0);
      const sign = isOut ? '-' : (isIn ? '+' : '');
      const cls = isOut ? 'neg' : (isIn ? 'pos' : '');
      row.innerHTML = `
        <div class="q-left">
          <div class="q-ic">${icon}</div>
          <div class="q-text">
            <div class="q-title">${escapeHtml(title)}</div>
            <div class="q-sub2">${escapeHtml(sub||'')}</div>
          </div>
        </div>
        <div class="q-right">
          <div class="q-amt ${cls}">${sign}${_otdFmtPLN(amt)}</div>
          <div class="q-miniRow">
            <button class="q-mini" data-act="cat" data-kind="kasa" data-id="${k.id}">${TT("cash.btn_cat_short", null, "Кат.")}</button>
            <button class="q-mini" data-act="edit" data-kind="kasa" data-id="${k.id}">✎</button>
            <button class="q-mini" data-act="del" data-kind="kasa" data-id="${k.id}">🗑</button>
          </div>
        </div>`;
      feed.appendChild(row);
    });
  });
}

(function(){
  // UI bindings: menu + cash sheet
  function show(el){ if(el) el.style.display='flex'; }
  function hide(el){ if(el) el.style.display='none'; }

  let cashKind = 'wydanie'; // default: expense

  function setKind(kind){
    cashKind = kind;
    const bOut = $id('cashTypeOut');
    const bIn  = $id('cashTypeIn');
    if(bOut && bIn){
      const outActive = (kind==='wydanie');
      bOut.classList.toggle('active', outActive);
      bIn.classList.toggle('active', !outActive);
      bOut.setAttribute('aria-selected', outActive ? 'true':'false');
      bIn.setAttribute('aria-selected', !outActive ? 'true':'false');
    }
  }

  function openSheet(kind){
    if(kind) setKind(kind);
    const back = $id('cashSheetBackdrop');
    show(back);
    // focus amount quickly
    setTimeout(()=>{ try{ $id('quickAmt')?.focus(); }catch(e){} }, 50);
  }
  function closeSheet(){
    hide($id('cashSheetBackdrop'));
  }

  // Keyboard support: Enter/Space on brand opens the main menu
  document.addEventListener('keydown', (e)=>{
    const a = document.activeElement;
    if(!a) return;
    if(a.id==='brandHome' && (e.key==='Enter' || e.key===' ')){
      e.preventDefault();
      if(window.appGoHome) window.appGoHome();
    }
  });

document.addEventListener('click', (e)=>{
    const t = e.target;


    // Brand click -> go Home
    if(t && (t.id==='brandHome' || (t.closest && t.closest('#brandHome')))){
      // Если меню открыто — закроем, чтобы не путало
      const ov = $id('navOverlay');
      if(ov) hide(ov);
      if(window.appGoHome) window.appGoHome();
      return;
    }

    // Menu overlay
    if(t && t.id==='navBtn'){ const ov=$id('navOverlay'); if(!ov) return; const open = (ov.style.display && ov.style.display!=='none'); if(open){ hide(ov); } else { ov.style.display='flex'; } }
    if(t && t.id==='navClose'){ hide($id('navOverlay')); }
    if(t && (t.id==='navOverlay')){ hide($id('navOverlay')); }

    if(t && t.id==='navSettingsBtn'){ hide($id('navOverlay')); if(window.appGoSection) window.appGoSection('ustawienia'); }
    if(t && t.classList && t.classList.contains('navItem')){
      const sec = t.getAttribute('data-nav');
      hide($id('navOverlay'));
      if(sec==='home'){ if(window.appGoHome) window.appGoHome(); return; }
      if(window.appGoSection) window.appGoSection(sec);
    }

    // Cash action buttons
    if(t && (t.id==='cashBtnAdd' || t.closest && t.closest('#cashBtnAdd'))){ openSheet('wydanie'); }
    if(t && (t.id==='cashBtnPhoto' || t.closest && t.closest('#cashBtnPhoto'))){ $id('cashPhoto')?.click(); }
    if(t && t.id==='cashSheetClose'){ closeSheet(); }
    if(t && t.id==='cashSheetBackdrop'){ closeSheet(); } // click on backdrop
    if(t && t.id==='cashTypeOut'){ setKind('wydanie'); }
    if(t && t.id==='cashTypeIn'){ setKind('przyjęcie'); }
    if(t && t.id==='cashSheetSave'){
      if(typeof quickCashAdd === 'function') quickCashAdd(cashKind);
      closeSheet();
    }
    if(t && t.id==='cashSheetPhoto'){ $id('cashPhoto')?.click(); }
  });

  // Receipt photo OCR -> prefill sheet
  $id('cashPhoto')?.addEventListener('change', async (e)=>{ 
    const f = e.target.files && e.target.files[0];
    if(!f) return;
    try{
      // OCR removed. We store the photo as a document for later AI processing / accountant review.
      if(window.OTD_DocVault?.addFiles){
        await window.OTD_DocVault.addFiles([f], { source:'cash', type:'receipt' });
        try{ await window.OTD_DocVault.refresh?.(null); }catch(_){}
      }
    }catch(err){
      console.warn('cashPhoto->DocVault error', err);
    }
    // Manual entry instead of OCR prefill
    try{ openSheet('wydanie'); }catch(_){}
    try{ e.target.value = ''; }catch(_){}
  });

  })();


