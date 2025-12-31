// Extracted from public/js/app/app.js (lines 2880-3317)
/* ==== HARD FIX: Spending buttons must always work (Manage categories + Uncategorized) ==== */
(function otdBindSpendingButtonsHard(){
  if(window.__otdSpendingButtonsHardBound) return;
  window.__otdSpendingButtonsHardBound = true;

  // Safe helpers
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
  function asNum(v){ const n = Number(String(v||'').replace(',', '.')); return Number.isFinite(n)?n:0; }
  function normCat(v){
    const s = String(v||'').trim();
    if(!s) return '';
    const low = s.toLowerCase();
    if(s==='—'||s==='–'||s==='-'||low==='—'||low==='–'||low==='-') return '';
    if(low==='bez kategorii'||low==='brak kategorii'||low==='brak'||low==='uncategorized'||low==='no category'||low==='none'||low==='без категории'||low==='без категорії') return '';
    return s;
  }

  // Ensure modal overlays are attached to <body> (iOS Safari + transformed parents can break position:fixed)
  function ensureOnBody(el){
    try{
      if(!el) return;
      if(el.classList && !el.classList.contains('modal-overlay')) el.classList.add('modal-overlay');
      if(el.parentElement !== document.body) document.body.appendChild(el);
    }catch(_){ }
  }


  // Ensure TX/KASA rows have stable ids so "bez kategorii" count matches reality and category picker can find the row.
  function ensureRowId(obj, prefix, fallback){
    if(!obj) return '';
    let id = String(obj.id || obj.ID || obj["ID"] || obj["ID transakcji"] || obj["ID transakcji "] || '').trim();
    if(id) { obj.id = id; return id; }
    id = (prefix || 'row') + '_' + (fallback || Date.now() + '_' + Math.random().toString(16).slice(2));
    obj.id = id;
    return id;
  }

  function getTxMerchant(r){
    try{
      return (typeof getMerchantFromTxRow==='function') ? (getMerchantFromTxRow(r) || '') : (r["Odbiorca"] || r["Nadawca"] || r["Opis"] || r["Tytuł"] || r.merchant || r.opis || '');
    }catch(_){ return r.merchant || ''; }
  }
  function getKasaMerchant(k){
    try{ return (typeof getMerchantFromKasaRow==='function') ? (getMerchantFromKasaRow(k) || '') : (k.note || k.opis || k.title || 'Kasa'); }catch(_){ return k.note || 'Kasa'; }
  }
  function getTxDate(r){
    try{
      const d = (typeof toISO==='function') ? (toISO((r["Data księgowania"]||r.date||r["Дата"]||'') ) || '') : (r.date||'');
      return String(d||'').slice(0,10);
    }catch(_){ return String(r.date||'').slice(0,10); }
  }

  function collectUncatHard(){
    const items = [];
    // Prefer existing ensured IDs if available
    try{ if(typeof ensureTxIds==='function') ensureTxIds(); }catch(_){}
    try{ if(typeof ensureKasaIds==='function') ensureKasaIds(); }catch(_){}

    // TX operations without explicit category (income + expense)
    try{
      (tx||[]).forEach((r, idx)=>{
        // amount
        const amt = asNum((typeof getVal==='function') ? (getVal(r,["Kwota","amount","Kwota_raw"])||0) : (r.Kwota||r.amount||0));
        if(!amt) return;
        const catRaw = (typeof getVal==='function') ? (getVal(r,["Kategoria","Category","category"])||'') : (r.category||r.cat||r.Kategoria||'');
        if(normCat(catRaw)) return;

        const d = getTxDate(r);
        const m = getTxMerchant(r) || 'Wyciąg';
        const fid = [d, Math.round(Math.abs(amt)*100), String(m).slice(0,24), idx].join('|');
        const id = ensureRowId(r, 'tx', fid);

        items.push({kind:'tx', id, date:d, merchant:m, amount:amt});
      });
    }catch(_){}

    // KASA operations without explicit category (income + expense; exclude zamknięcie)
    try{
      (kasa||[]).forEach((k, idx)=>{
        const amt = (typeof getSignedKasaAmount==='function') ? (getSignedKasaAmount(k) || 0) : asNum(k.amount||0);
        if(!amt) return;
        const catRaw = k && (k.category || k.cat || k.Kategoria || k["Kategoria"] || k["Категория"] || '');
        if(normCat(catRaw)) return;

        const d = String(k.date||'').slice(0,10);
        const m = getKasaMerchant(k) || 'Kasa';
        const fid = [d, Math.round(Math.abs(amt)*100), String(m).slice(0,24), idx].join('|');
        const id = ensureRowId(k, 'kasa', fid);

        items.push({kind:'kasa', id, date:d, merchant:m, amount:amt});
      });
    }catch(_){}

    // BILLS as expenses without explicit category
    try{
      (bills||[]).forEach((r, idx)=>{
        const catRaw = (typeof getVal==='function') ? (getVal(r,["Kategoria","Category","category"])||'') : (r.category||r.cat||r.Kategoria||'');
        if(normCat(catRaw)) return;

        const idRaw = (typeof getVal==='function') ? (getVal(r,["Numer faktury","Invoice number","Номер фактуры"])||'') : (r.id||r.number||'');
        const id = String(idRaw||'').trim();
        if(!id) return;

        const d = (typeof toISO==='function') ? (toISO(getVal(r,["Termin płatności","Due date","Termin"])||'')||'') : (r.due||'');
        const supplier = String((typeof getVal==='function') ? (getVal(r,["Dostawca","Supplier"])||'Faktura') : (r.supplier||'Faktura'));
        const amtPos = asNum((typeof getVal==='function') ? (getVal(r,["Kwota do zapłaty","Kwota","Amount","amount"])||0) : (r.amount||0));
        if(!amtPos) return;

        items.push({kind:'bill', id, date:String(d||'').slice(0,10), merchant:supplier, amount:-Math.abs(amtPos)});
      });
    }catch(_){}

    items.sort((a,b)=>{
      const da = a.date || '';
      const db = b.date || '';
      if(da !== db) return db.localeCompare(da);
      return (a.amount||0) - (b.amount||0);
    });
    return items;
  }

  function updateUncatBadgeHard(){
    const el = document.getElementById('uncatCount');
    if(!el) return;
    const n = collectUncatHard().length;
    el.textContent = String(n);
    el.style.display = n ? 'inline-flex' : 'none';
  }

  function openUncatHard(){
  try{ if(typeof ensureSpendingCategoryModals==='function') ensureSpendingCategoryModals(); }catch(_){ }
    const modal = document.getElementById('uncatModal');
    const list  = document.getElementById('uncatList');
    ensureOnBody(modal);
    if(!modal || !list){
      alert('Brak okna: uncatModal/uncatList');
      return;
    }
    const items = collectUncatHard();
    if(!items.length){
      const txt = (window.i18n && window.i18n.t) ? (window.i18n.t('uncat.none') || 'Brak operacji bez kategorii.') : 'Brak operacji bez kategorii.';
      list.innerHTML = `<div class="muted small">${esc(txt)}</div>`;
    }else{
      list.innerHTML = items.map(it=>{
        const val = Math.abs(it.amount||0).toFixed(2);
        const sign = (Number(it.amount||0) < 0) ? '−' : '+';
        const kindLbl = (it.kind==='kasa') ? 'Kasa' : (it.kind==='bill' ? 'Faktury' : 'Wyciąg');
        const btnTxt = (window.i18n && window.i18n.t) ? (window.i18n.t('uncat.choose') || 'Wybierz') : 'Wybierz';
        return `
          <div style="display:flex;gap:10px;align-items:center;padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:12px">
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.merchant||'—')}</div>
              <div class="muted small">${esc(it.date||'')} · ${kindLbl} · ${sign}${val} PLN</div>
            </div>
            <button class="btn" style="padding:6px 10px;font-size:12px" data-act="uncat-pick" data-kind="${esc(it.kind)}" data-id="${esc(it.id)}">${esc(btnTxt)}</button>
          </div>
        `;
      }).join('');
    }
    modal.classList.add('show');
  }

  function closeUncatHard(){
    const modal = document.getElementById('uncatModal');
    if(modal) modal.classList.remove('show');
  }

  function renderSpCatMgrListHard(){
    const list = document.getElementById('spCatMgrList');
    if(!list) return;
    const cats = (typeof getAllSpCats==='function') ? getAllSpCats() : [];
    const extras = (typeof loadUserSpCats==='function') ? loadUserSpCats() : [];
    const isDefault = (id)=> (typeof DEFAULT_SP_CATS!=='undefined' && (DEFAULT_SP_CATS||[]).some(c=>String(c.id)===String(id)));

    list.innerHTML = cats.map(c=>{
      const id = String(c.id||'');
      const hasOverride = extras.some(x=>String(x.id)===id);
      const canDelete = hasOverride || (!isDefault(id));
      const badge = isDefault(id) ? (hasOverride ? 'override' : 'default') : 'custom';
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:12px">
          <div style="min-width:28px;text-align:center;font-size:18px">${esc(c.emoji||'📦')}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.label||id)}</div>
            <div class="muted small">id: ${esc(id)} · ${badge}</div>
          </div>
          <button class="btn secondary" style="padding:6px 10px;font-size:12px" data-act="spcat-edit-hard" data-id="${esc(id)}">✎</button>
          <button class="btn secondary" style="padding:6px 10px;font-size:12px;${canDelete?'':'opacity:.35;pointer-events:none'};border-color:rgba(255,80,80,.55);color:rgba(255,140,140,.95)" data-act="spcat-del-hard" data-id="${esc(id)}">🗑</button>
        </div>
      `;
    }).join('');
  }

  function openSpCatMgrHard(){
  try{ if(typeof ensureSpendingCategoryModals==='function') ensureSpendingCategoryModals(); }catch(_){ }
    const modal = document.getElementById('spCatMgrModal');
    ensureOnBody(modal);
    if(!modal){
      alert('Brak okna: spCatMgrModal');
      return;
    }
    renderSpCatMgrListHard();
    modal.classList.add('show');
  }
  function closeSpCatMgrHard(){
    const modal = document.getElementById('spCatMgrModal');
    if(modal) modal.classList.remove('show');
  }

  function openSpCatAddEditHard(mode, id){
    const modal = document.getElementById('addSpCatModal');
    ensureOnBody(modal);
    const save = document.getElementById('spCatSave');
    const cancel = document.getElementById('spCatCancel');
    const delBtn = document.getElementById('spCatDelete');
    const nameIn = document.getElementById('spCatName');
    const editIdIn = document.getElementById('spCatEditId');
    const emojiWrap = document.getElementById('spCatEmojiList');
    const emojiCustomIn = document.getElementById('spCatEmojiCustom');

    if(!modal || !save || !cancel || !nameIn || !editIdIn || !emojiWrap){
      alert('Brak okna: addSpCatModal');
      return;
    }

    // one-time emoji click binding
    if(!window.__otdSpEmojiBound){
      window.__otdSpEmojiBound = true;
      emojiWrap.querySelectorAll('button').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          emojiWrap.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
          btn.classList.add('active');
          window.__otdSpChosenEmoji = (btn.textContent||'').trim() || '📦';
          if(emojiCustomIn) emojiCustomIn.value = '';
        });
      });
    }

    const cat = (typeof getCatById==='function' && id) ? getCatById(id) : null;
    const isEdit = mode==='edit' && id;

    editIdIn.value = isEdit ? String(id) : '';
    if(delBtn) delBtn.style.display = isEdit ? 'inline-flex' : 'none';

    nameIn.value = isEdit ? String((cat && cat.label) || id || '').trim() : '';
    if(emojiCustomIn) emojiCustomIn.value = '';

    window.__otdSpChosenEmoji = (cat && cat.emoji) ? cat.emoji : '📦';

    // highlight emoji
    emojiWrap.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
    const match = Array.from(emojiWrap.querySelectorAll('button')).find(b=> (b.textContent||'').trim()===window.__otdSpChosenEmoji);
    if(match) match.classList.add('active');

    // Save handler (overwrite to avoid stacking)
    save.onclick = ()=>{
      const label = (nameIn.value||'').trim();
      if(!label) return;

      const customEmoji = (emojiCustomIn && emojiCustomIn.value) ? emojiCustomIn.value.trim() : '';
      const emoji = customEmoji || window.__otdSpChosenEmoji || '📦';

      const extras = (typeof loadUserSpCats==='function') ? loadUserSpCats() : [];
      let cid = editIdIn.value ? String(editIdIn.value).trim() : '';

      function slugify(s){
        return String(s||'').toLowerCase().replace(/[\s]+/g,'_').replace(/[^a-z0-9а-яё_]+/gi,'').replace(/^_+|_+$/g,'');
      }

      if(!cid){
        const base = slugify(label).slice(0,16) || ('cat_'+Date.now());
        cid = ('user_'+base).slice(0,24);
        const all = (typeof getAllSpCats==='function' ? getAllSpCats() : []).map(c=>String(c.id));
        if(all.includes(cid)) cid = (cid + '_' + String(Date.now()).slice(-4)).slice(0,28);
      }

      const obj = {id:cid, label, emoji};
      const idx = extras.findIndex(c=>String(c.id)===String(cid));
      if(idx>=0) extras[idx]=obj; else extras.push(obj);
      try{ if(typeof saveUserSpCats==='function') saveUserSpCats(extras); }catch(_){}

      modal.classList.remove('show');
      // Refresh filters + stats if available
      try{ if(typeof renderSpendingFilters==='function'){ renderSpendingFilters(window._otdSpendingActiveCatId || ''); } }catch(_){}
      try{ if(typeof renderSpendingStats==='function'){ renderSpendingStats(window._otdSpendingActiveCatId || null); } }catch(_){}
      try{ if(typeof render==='function') render(); }catch(_){}
      try{ if(typeof pushState==='function') pushState(); }catch(_){}
      try{ renderSpCatMgrListHard(); }catch(_){}
    };

    cancel.onclick = ()=> modal.classList.remove('show');

    if(delBtn){
      delBtn.onclick = ()=>{
        const cid = editIdIn.value ? String(editIdIn.value).trim() : '';
        if(!cid) return;
        try{
          const extras = (typeof loadUserSpCats==='function') ? loadUserSpCats() : [];
          const idx = extras.findIndex(c=>String(c.id)===String(cid));
          if(idx>=0){ extras.splice(idx,1); if(typeof saveUserSpCats==='function') saveUserSpCats(extras); }
        }catch(_){}
        modal.classList.remove('show');
        try{ renderSpCatMgrListHard(); }catch(_){}
        try{ if(typeof render==='function') render(); }catch(_){}
        try{ if(typeof pushState==='function') pushState(); }catch(_){}
      };
    }

    modal.classList.add('show');
  }

  // Hard bind buttons (onclick beats addEventListener chaos)
  function bindNow(){
    try{ if(typeof ensureSpendingCategoryModals==='function') ensureSpendingCategoryModals(); }catch(_){ }
    const manage = document.getElementById('manageSpCatsBtn');
    const uncat   = document.getElementById('uncatBtn');
    const closeUn = document.getElementById('uncatClose');
    const mgrClose= document.getElementById('spCatMgrClose');
    const mgrAdd  = document.getElementById('spCatMgrAdd');

    // Ensure overlays are direct children of <body> (Safari/iOS sometimes hides fixed overlays inside transformed parents)
    try{ ['spCatMgrModal','uncatModal','addSpCatModal','spListModal','invoiceTplModal'].forEach(id=>{ const el=document.getElementById(id); if(el && el.parentElement!==document.body) document.body.appendChild(el); }); }catch(_){ }

    if(manage) manage.onclick = (e)=>{ try{ e.preventDefault(); e.stopPropagation(); }catch(_){} openSpCatMgrHard(); };
    if(uncat) uncat.onclick   = (e)=>{ try{ e.preventDefault(); e.stopPropagation(); }catch(_){} openUncatHard(); };

    if(closeUn) closeUn.onclick = (e)=>{ try{ e.preventDefault(); }catch(_){} closeUncatHard(); };
    if(mgrClose) mgrClose.onclick = (e)=>{ try{ e.preventDefault(); }catch(_){} closeSpCatMgrHard(); };
    if(mgrAdd) mgrAdd.onclick = (e)=>{ try{ e.preventDefault(); }catch(_){} closeSpCatMgrHard(); openSpCatAddEditHard('add', ''); };

    // Delegation inside lists (edit/delete + pick)
    if(!window.__otdSpendingHardDelegated){
      window.__otdSpendingHardDelegated = true;
      document.addEventListener('click', (e)=>{
        const b = e.target && e.target.closest ? e.target.closest('button') : null;
        if(!b) return;
        const act = b.getAttribute('data-act');
        if(act==='uncat-pick'){
          e.preventDefault();
          const kind = b.getAttribute('data-kind');
          const id   = b.getAttribute('data-id');
          try{
            if(typeof openCatModal==='function') openCatModal(kind, id);
            // keep uncat modal open for batch assigning
            updateUncatBadgeHard();
            // refresh list after assignment (category may no longer be empty)
            setTimeout(()=>{ try{ openUncatHard(); }catch(_){} }, 200);
          }catch(_){}
        }
        if(act==='spcat-edit-hard'){
          e.preventDefault();
          const id = b.getAttribute('data-id');
          closeSpCatMgrHard();
          openSpCatAddEditHard('edit', id);
        }
        if(act==='spcat-del-hard'){
          e.preventDefault();
          const id = b.getAttribute('data-id');
          try{
            const extras = (typeof loadUserSpCats==='function') ? loadUserSpCats() : [];
            const idx = extras.findIndex(c=>String(c.id)===String(id));
            if(idx>=0){ extras.splice(idx,1); if(typeof saveUserSpCats==='function') saveUserSpCats(extras); }
          }catch(_){}
          renderSpCatMgrListHard();
          try{ if(typeof render==='function') render(); }catch(_){}
          try{ if(typeof pushState==='function') pushState(); }catch(_){}
        }
      }, true);
    }

    // Override badge updater so count is correct everywhere
    try{ window._otdUpdateUncatBadge = updateUncatBadgeHard; }catch(_){}
    try{ updateUncatBadgeHard(); }catch(_){}
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', bindNow);
  else bindNow();

})();
const stateKeys = [
  'tx_manual_import',
  'bills_manual_import',
  'kasa',
  'accMeta',
  'cashPLN',
  'penaltyPct',
  'intervalMin',
  'rateEUR',
  'rateUSD',
  'blacklist',
  'autoCash',
  // 👇 подписку и демо больше НЕ пушим в Firebase
  'txUrl',
  'billUrl',
  'otd_lang',
  'speechLang'
];


function ensureTxIds(){
  if(!Array.isArray(tx)) tx = [];
  tx.forEach((r, idx) => {
    if(!r || r.id) return;

    // пытаемся взять уже существующий ID
    let id = getVal(r, ["ID transakcji","ID","id"]);
    if(!id){
      // генерим стабильный id, если его не было
      const baseDate = r["Data księgowania"] || today();
      id = `tx-${baseDate}-${idx}-${Math.random().toString(36).slice(2,8)}`;
    }

    r.id = String(id);

    // чтобы всё было консистентно по полям
    if(!r["ID transakcji"]) {
      r["ID transakcji"] = r.id;
    }
  });
}
function ensureKasaIds(){
  if(!Array.isArray(kasa)) kasa = [];
  kasa.forEach((k, idx) => {
    if(!k || k.id) return;

    // если вдруг где-то уже есть поле ID
    let id = k.ID || k.Id || k["ID"] || k["id"];
    if(!id){
      const baseDate = k.date || today();
      id = `kasa-${baseDate}-${idx}-${Math.random().toString(36).slice(2,8)}`;
    }

    k.id = String(id);
  });
}


  
