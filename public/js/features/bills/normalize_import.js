// Extracted from public/js/app/app.js (lines 1832-2871)
// ===== BILLS IMPORT NORMALIZE (MVP) =====
function normalizeImportedBillsRows(rows){
  const arr = Array.isArray(rows) ? rows : [];
  const out = [];

  arr.forEach(r=>{
    if(!r || typeof r !== "object") return;

    const nr = { ...r };

    const number =
      getVal(r, ["Numer faktury","Nr faktury","Invoice number","Номер фактуры","Номер рахунку","Номер"]) || "";

    const date =
      getVal(r, ["Data","Date","Дата","Data wystawienia","Дата виставлення"]) || "";

    const due =
      getVal(r, ["Termin płatności","Due date","Срок оплаты","Термін оплати"]) || "";

    const seller =
      getVal(r, ["Kontrahent","Sprzedawca","Seller","Контрагент","Постачальник"]) || "";

    const amountRaw =
      getVal(r, ["Kwota","Amount","Suma","Сума","Kwota brutto","Brutto"]) || "";

    const currency =
      getVal(r, ["Waluta","Currency","Валюта"]) || "PLN";

    const cat =
      getVal(r, ["Kategoria","Category","category","Категорія","Категория"]) || "";

    const amount = (typeof asNum === "function")
      ? asNum(amountRaw)
      : Number(String(amountRaw).replace(",", "."));

    // Канонизируем ключи под твой UI
    if(number) nr["Numer faktury"] = String(number).trim();
    if(date) nr["Data"] = String(date).trim();
    if(due) nr["Termin płatności"] = String(due).trim();
    if(seller) nr["Kontrahent"] = String(seller).trim();

    nr["Kwota"] = amount || 0;
    nr["Waluta"] = String(currency || "PLN").trim();

    if(cat) nr["Kategoria"] = String(cat).trim();

    // Минимальный статус по умолчанию
    if(!getVal(nr, ["Status","status"])){
      nr["Status"] = "Oczekuje";
    }

    out.push(nr);
  });

  return out;
}

// Превью для фактур
function buildBillsPreviewText(rows){
  const arr = Array.isArray(rows) ? rows : [];
  const sample = arr.slice(0, 10);

  let txt = "Превью фактур (первые " + sample.length + " из " + arr.length + ")\n\n";

  sample.forEach((r, i)=>{
    const n = getVal(r, ["Numer faktury","Invoice number","Номер"]) || "";
    const d = getVal(r, ["Data","Дата"]) || "";
    const s = getVal(r, ["Kontrahent","Seller","Контрагент"]) || "";
    const a = getVal(r, ["Kwota","Amount","Suma","Сума"]) || 0;
    const c = getVal(r, ["Waluta","Currency","Валюта"]) || "PLN";

    txt += (i+1) + ") " + String(n) + " | " + String(d) + " | " + String(s) +
      " | " + String(a) + " " + String(c) + "\n";
  });

  return txt;
}

function confirmBillsImport(rows){
  const preview = buildBillsPreviewText(rows);
  return confirm(TT("dialogs.import_invoices_confirm", {preview: preview}, preview + "\n\nИмпортировать эти фактуры?"));
}

// Роутер фактур: используем твой общий импорт файлов
async function importBillsByFile(f){
  // safety лимит, если ты уже вставлял - дубль не страшен
  const MAX_IMPORT_MB = 5;
  const MAX_IMPORT_BYTES = MAX_IMPORT_MB * 1024 * 1024;
  if(f && f.size && f.size > MAX_IMPORT_BYTES){
    alert(TT("alerts.file_too_big_mvp_short", {mb: MAX_IMPORT_MB}, "Файл слишком большой для MVP-импорта ({mb}MB). Рекомендуем CSV."));
    return [];
  }

  // Если у тебя уже есть универсальный роутер
  if(typeof importTxByFile === "function"){
    return await importTxByFile(f);
  }

  // Фоллбек
  const name = String(f?.name || "").toLowerCase();
  if(name.endsWith(".xlsx") || name.endsWith(".xls")){
    if(typeof XLSX === "undefined"){
      alert(TT("alerts.xlsx_not_supported", null, "XLSX не поддерживается в этой сборке (библиотека не подключена)."));
      return [];
    }
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
    return Array.isArray(json) ? json : [];
  }

  const text = await f.text();
  if(typeof parseCSV === "function") return parseCSV(text) || [];
  return [];
}
// ===== /BILLS IMPORT NORMALIZE =====


const MERCHANT_MAP = {
  'żabka':'food',
  'zabka':'food',
  'biedronka':'food',
  'lidl':'food',
  'carrefour':'food',
  'kaufland':'food',
  'auchan':'food',
  'hebe':'food',
  'rossmann':'home',
  'ikea':'home',
  'castorama':'home',
  'leroy':'home',
  'orlen':'fuel',
  'bp ':'fuel',
  'shell':'fuel',
  'circle k':'fuel',
  'statoil':'fuel'
};

function detectCategoryForMerchant(name){
  if(!name) return 'other';
  const key = String(name).toLowerCase();
  for(const k in MERCHANT_MAP){
    if(key.indexOf(k)!==-1) return MERCHANT_MAP[k];
  }
  return 'other';
}

function getMerchantFromTxRow(r){
  return getVal(r,["Kontrahent","Counterparty","Nazwa właściciela rachunku","Tytuł/Opis","Opis","description"]) || "";
}
 function normalizeCatIdByList(x){
  const raw = String(x || "").trim();
  if(!raw) return "";

  const v = raw.toLowerCase();
  const cats = (typeof getAllSpCats === "function") ? getAllSpCats() : [];

  // 1) если пользователь уже ввёл id
  const byId = cats.find(c => String(c.id || "").toLowerCase() === v);
  if(byId) return byId.id;

  // 2) если ввёл label ("Продукты", "Kategoria", etc)
  const byLabel = cats.find(c => String(c.label || "").toLowerCase() === v);
  if(byLabel) return byLabel.id;

  // 3) fallback
  return raw;
}


function resolveCategoryForTx(r){
  const manualRaw =
    getVal(r, ["Kategoria","Category","category","Категория","Категорія"]) || "";
  const manual = normalizeCatIdByList(manualRaw);
  if(manual) return manual;

  const m = getMerchantFromTxRow(r);
  return detectCategoryForMerchant(m);
}


function resolveCategoryForKasa(k){
  const cats = (typeof getAllSpCats === "function") ? getAllSpCats() : [];

  // 1) явное поле категории
  const manualRaw = (k && (
    k.category ||
    k.cat ||
    k.Kategoria ||
    k["Kategoria"] ||
    k["Категория"] ||
    ""
  )) || "";

  const manual = normalizeCatIdByList ? normalizeCatIdByList(manualRaw) : String(manualRaw||"").trim();
  if(manual) return manual;

  // 2) попытка найти категорию в комментарии
  const comment = String((k && (k.comment || k.title || k.source)) || "").toLowerCase();
  if(comment && cats.length){
    const byId = cats.find(c => comment.includes(String(c.id||"").toLowerCase()));
    if(byId) return byId.id;

    const byLabel = cats.find(c => comment.includes(String(c.label||"").toLowerCase()));
    if(byLabel) return byLabel.id;
  }

  // 3) авто
  const m = getMerchantFromKasaRow(k);
  return detectCategoryForMerchant(m);
}



function getMerchantFromKasaRow(k){
  return k.source || k.comment || "";
}


// --- KASA amount sign helpers (global) ---
function isOutKasaRow(k){
  const t = String((k && (k.type || k.flow || k.kind || k.direction)) || "").toLowerCase();
  return (
    t === "out" || t === "expense" || t === "rozchod" ||
    t === "wydanie" || t === "расход" || t === "vydata" || t === "wydatki"
  );
}

function getSignedKasaAmount(k){
  const raw = (typeof asNum === 'function') ? asNum(k?.amount||0) : Number(k?.amount||0);
  if(!raw) return 0;

  // "zamknięcie dnia" / balance set rows should not be treated as movement
  const t = String(k?.type || "").toLowerCase();
  if(t.includes('zamk')) return 0;

  return isOutKasaRow(k) ? -Math.abs(raw) : Math.abs(raw);
}

function buildSpendingAggregates(catId){
  const agg = {};
  const txArr = Array.isArray(tx) ? tx : [];
  const kasaArr = Array.isArray(kasa) ? kasa : [];

  const includeIncome = !!catId;

  function addRow(amount, merchant){
    if(!amount || !merchant) return;
    // In "All" view we keep expenses focus; when a category is selected we also allow income categories (e.g., salary)
    if(!includeIncome && amount > 0) return;
    const key = String(merchant||'').trim();
    if(!key) return;
    agg[key] = (agg[key] || 0) + amount;
  }

txArr.forEach(r=>{
  const m = getMerchantFromTxRow(r);
  const a = asNum(getVal(r,["Kwota","Kwота","amount","Kwota_raw"])||0);
  if(!a) return;

  const cat = resolveCategoryForTx(r);
  if(catId && cat !== catId) return;

  const showMerchant = m || (cat ? ("Категория: " + cat) : "Без контрагента");
  addRow(a, showMerchant);
});



kasaArr.forEach(k=>{
  const a = getSignedKasaAmount(k);
  if(!a) return;

  const cat = resolveCategoryForKasa(k);
  if(catId && cat!==catId) return;

  const m = getMerchantFromKasaRow(k);
  const showMerchant = m || (cat ? ("Категория: " + cat) : "Касса");
  addRow(a, showMerchant);
});


  const list = Object.entries(agg).map(([merchant,sum])=>({merchant,sum}));
  list.sort((a,b)=>a.sum - b.sum);
  return list;
}

function buildSpendingEntries(catId){
  const out = [];
  const txArr = Array.isArray(tx) ? tx : [];
  const kasaArr = Array.isArray(kasa) ? kasa : [];

  const includeIncome = !!catId;

  function push(kind, id, date, merchant, amount){
    if(!amount) return;
    // In "All" view we keep expenses focus; when a category is selected we also allow income categories
    if(!includeIncome && amount > 0) return;
    out.push({kind, id:String(id||''), date:String(date||''), merchant:String(merchant||''), amount:Number(amount)||0});
  }

  // TX expenses
  txArr.forEach(r=>{
    const amt = asNum(getVal(r,["Kwota","Kwота","amount","Kwota_raw"])||0);
    if(!amt) return;
    if(!includeIncome && amt > 0) return;
    const cat = resolveCategoryForTx(r);
    if(catId && String(cat) !== String(catId)) return;

    const id = String(getVal(r,["ID transakcji","ID","id"])||r.id||"");
    if(!id) return;

    const d = toISO(getVal(r,["Data księgowania","Data","date","Дата"])) || "";
    const merchant = getMerchantFromTxRow(r) || (getVal(r,["Kontrahent","Counterparty"])||"") || "Wyciąg";
    push('tx', id, d, merchant, amt);
  });

  // KASA expenses
  kasaArr.forEach(k=>{
    const amt = getSignedKasaAmount(k);
    if(!amt) return;
    if(!includeIncome && amt > 0) return;
    const cat = resolveCategoryForKasa(k);
    if(catId && String(cat) !== String(catId)) return;

    const id = String(k.id||"");
    if(!id) return;

    const d = String(k.date||"").slice(0,10);
    const merchant = getMerchantFromKasaRow(k) || "Kasa";
    push('kasa', id, d, merchant, amt);
  });

  // sort: newest first by date, then by amount
  out.sort((a,b)=>{
    const da = a.date || '';
    const db = b.date || '';
    if(da !== db) return db.localeCompare(da);
    return (a.amount||0) - (b.amount||0);
  });

  return out;
}

function renderSpendingFilters(activeId){
  const wrap = document.getElementById('spendingFilters');
  if(!wrap) return;
  const cats = getAllSpCats();
  let html = '<button type="button" class="spFilterBtn'+(!activeId?' active':'')+'" data-cat="">'+TT('spending.filter_all', null, 'All')+'</button>';
  cats.forEach(c=>{
    html += '<button type="button" class="spFilterBtn'+(activeId===c.id?' active':'')+'" data-cat="'+c.id+'">'+
      '<span class="emoji">'+(c.emoji||'📦')+'</span><span>'+(resolveSpCatLabel(c)||c.id)+'</span></button>';
  });
  wrap.innerHTML = html;
  wrap.querySelectorAll('.spFilterBtn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-cat') || '';
      renderSpendingFilters(id || '');
      try{ window._otdSpendingActiveCatId = (id||null); }catch(e){}
      renderSpendingStats(id || null);
    });
  });
}

function ensureSpendingListModal(){
  if(document.getElementById('spListModal')) return;
  const overlay = document.createElement('div');
  overlay.id = 'spListModal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card">
      <div style="display:flex;align-items:center;gap:10px">
        <h3 style="margin:0;flex:1" id="spListTitle">Wydatki</h3>
        <button class="btn secondary small" id="spListClose" style="min-width:90px">Zamknij</button>
      </div>
      <div class="muted small" id="spListSubtitle" style="margin:6px 0 10px">—</div>
      <input id="spListSearch" class="input" style="width:100%;margin-bottom:10px" placeholder="Szukaj…"/>
      <div id="spListBody" style="display:flex;flex-direction:column;gap:8px;max-height:55vh;overflow:auto"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = ()=> overlay.classList.remove('show');
  overlay.addEventListener('click', (e)=>{ if(e.target===overlay) close(); });
  overlay.querySelector('#spListClose')?.addEventListener('click', close);
  window._otdCloseSpList = close;
}

function ensureSpendingCategoryModals(){
  // Some builds lost these modals in HTML merges. Create them dynamically so buttons always work.

  // Add/Edit category modal
  if(!document.getElementById('addSpCatModal')){
    const overlay = document.createElement('div');
    overlay.id = 'addSpCatModal';
    overlay.className = 'modal-overlay';
    const emojis = ['🍔','🛒','⛽','🏠','💳','📦','🎁','💡','🧾','🚗','🚌','📱','👶','🐶','🏥','🎓','🎮','✈️','🍻','🧋'];
    overlay.innerHTML = `
      <div class="modal-card" style="max-width:520px">
        <div style="display:flex;align-items:center;gap:10px">
          <h3 style="margin:0;flex:1">Kategoria</h3>
          <button class="btn secondary small" id="spCatCancel" style="min-width:90px">Zamknij</button>
        </div>
        <input type="hidden" id="spCatEditId" value=""/>
        <div class="muted small" style="margin:8px 0 6px">Nazwa</div>
        <input id="spCatName" class="input" style="width:100%" placeholder="Np. Transport"/>
        <div class="muted small" style="margin:10px 0 6px">Ikona (emoji)</div>
        <div id="spCatEmojiList" style="display:flex;gap:8px;flex-wrap:wrap">
          ${emojis.map(e=>`<button type="button" class="btn secondary small" style="padding:6px 10px;border-radius:12px" data-emoji="${e}">${e}</button>`).join('')}
        </div>
        <div class="muted small" style="margin:10px 0 6px">Własne emoji</div>
        <input id="spCatEmojiCustom" class="input" style="width:100%" placeholder="Np. 🧋"/>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap">
          <button class="btn secondary" id="spCatDelete" style="border-color:rgba(255,80,80,.55);color:rgba(255,140,140,.95);display:none">Usuń</button>
          <button class="btn" id="spCatSave">Zapisz</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) overlay.classList.remove('show'); });
  }

  // Category manager modal
  if(!document.getElementById('spCatMgrModal')){
    const overlay = document.createElement('div');
    overlay.id = 'spCatMgrModal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card" style="max-width:640px">
        <div style="display:flex;align-items:center;gap:10px">
          <h3 style="margin:0;flex:1">Kategorie</h3>
          <button class="btn secondary small" id="spCatMgrAdd" style="min-width:110px">Dodaj</button>
          <button class="btn secondary small" id="spCatMgrClose" style="min-width:90px">Zamknij</button>
        </div>
        <div class="muted small" style="margin:6px 0 10px">Edytuj nazwy/emoji. Domyślne możesz tylko „nadpisać”.</div>
        <div id="spCatMgrList" style="display:flex;flex-direction:column;gap:10px;max-height:60vh;overflow:auto"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) overlay.classList.remove('show'); });
  }

  // Uncategorized modal
  if(!document.getElementById('uncatModal')){
    const overlay = document.createElement('div');
    overlay.id = 'uncatModal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card" style="max-width:700px">
        <div style="display:flex;align-items:center;gap:10px">
          <h3 style="margin:0;flex:1">Bez kategorii</h3>
          <button class="btn secondary small" id="uncatClose" style="min-width:90px">Zamknij</button>
        </div>
        <div class="muted small" style="margin:6px 0 10px">Wydatki, które nie mają ustawionej kategorii.</div>
        <div id="uncatList" style="display:flex;flex-direction:column;gap:10px;max-height:60vh;overflow:auto"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) overlay.classList.remove('show'); });
  }
}

function openSpendingList(catId){
  ensureSpendingListModal();
  const overlay = document.getElementById('spListModal');
  const body = document.getElementById('spListBody');
  const title = document.getElementById('spListTitle');
  const sub = document.getElementById('spListSubtitle');
  const search = document.getElementById('spListSearch');

  const cats = getAllSpCats();
  const catObj = catId ? cats.find(c=>String(c.id)===String(catId)) : null;

  const titleKey = 'spending.title';
  let baseTitle = (window.i18n && window.i18n.t) ? (window.i18n.t(titleKey) || '') : '';
  if(!baseTitle || baseTitle === titleKey) baseTitle = 'Wydatki';

  const label = catObj ? ((catObj.emoji||'📦') + ' ' + (catObj.label||catObj.id)) : baseTitle;
  if(title) title.textContent = label;

  const data = buildSpendingEntries(catId);
  const total = data.reduce((s,r)=> s + (Number(r.amount)||0), 0);
  if(sub){
    const sign = total < 0 ? '−' : '+';
    sub.textContent = `Suma: ${sign}${Math.abs(total).toFixed(2)} PLN`;
  }

  function kindLabel(kind){
    if(kind==='kasa') return 'Kasa';
    if(kind==='tx') return 'Wyciąg';
    return kind;
  }

  function renderList(filter){
    const f = String(filter||'').trim().toLowerCase();
    const list = f ? data.filter(r=> (
      String(r.merchant||'').toLowerCase().includes(f) ||
      String(r.date||'').toLowerCase().includes(f) ||
      kindLabel(r.kind).toLowerCase().includes(f)
    )) : data;

    if(!list.length){
      const emptyKey = 'spending.empty';
      let emptyTxt = (window.i18n && window.i18n.t) ? (window.i18n.t(emptyKey) || '') : '';
      if(!emptyTxt || emptyTxt === emptyKey) emptyTxt = 'Brak danych.';
      body.innerHTML = `<div class="muted small">${emptyTxt}</div>`;
      return;
    }

    body.innerHTML = list.slice(0,400).map(r=>{
      const amt = Number(r.amount)||0;
      const sign = amt < 0 ? '−' : '+';
      const val = Math.abs(amt);
      const dateTxt = escapeHtml((r.date||'').slice(0,10));
      const kLbl = kindLabel(r.kind);
      return `
        <div style="display:flex;gap:10px;align-items:center;padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:12px">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.merchant||'—')}</div>
            <div class="muted small">${dateTxt} · ${escapeHtml(kLbl)} · ${sign}${val.toFixed(2)} PLN</div>
          </div>
        </div>
      `;
    }).join('');
  }

  if(search){
    search.value = '';
    search.oninput = ()=> renderList(search.value);
  }
  renderList('');

  overlay.classList.add('show');
}

function renderSpendingStats(catId){
  const box = document.getElementById('spendingStats');
  if(!box) return;

  try{ ensureSpendingListModal(); }catch(e){}

  const data = buildSpendingAggregates(catId);
  if(!data.length){
    const emptyTxt = (window.i18n && window.i18n.t) ? (window.i18n.t('spending.empty') || 'Brak danych.') : 'Brak danych.';
    box.innerHTML = `<div class="muted small">${emptyTxt}</div>`;
    return;
  }

  const top = data.slice(0,3);
  const total = data.reduce((s,r)=> s + (Number(r.sum)||0), 0);

  const rows = top.map(r=>{
    const amt = Number(r.sum)||0;
    const sign = amt < 0 ? '−' : '+';
    const val = Math.abs(amt);
    return `<div style="display:flex;justify-content:space-between;gap:10px">
      <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.merchant||'—')}</span>
      <b>${sign}${Math.round(val)} PLN</b>
    </div>`;
  }).join('');

    const btnKey = 'spending.open_list';
  let btnLabel = (window.i18n && window.i18n.t) ? (window.i18n.t(btnKey) || '') : '';
  if(!btnLabel || btnLabel === btnKey) btnLabel = 'Otwórz listę';

  box.innerHTML = `
    <div class="muted small" style="margin-bottom:6px">Suma: <b>${(total<0?'−':'+')}${Math.round(Math.abs(total))} PLN</b></div>
    <div style="display:flex;flex-direction:column;gap:6px">${rows}</div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
      <button type="button" class="btn secondary small" id="spOpenListBtn">${btnLabel}</button>
    </div>
  `;

  box.querySelector('#spOpenListBtn')?.addEventListener('click', ()=> openSpendingList(catId));
}

function renderSpendingPanel(){
  try{ window._otdSpendingActiveCatId = null; }catch(e){}
  renderSpendingFilters('');
  renderSpendingStats(null);
  try{ if(window._otdUpdateUncatBadge) window._otdUpdateUncatBadge(); }catch(e){}
}

function initSpendingUI(){
  try{ if(typeof ensureSpendingCategoryModals==='function') ensureSpendingCategoryModals(); }catch(e){}

  const addBtn   = document.getElementById('addSpCatBtn');
  const manageBtn= document.getElementById('manageSpCatsBtn');
  const uncatBtn = document.getElementById('uncatBtn');

  // Make "blue links" look like real controls (bigger hit area, consistent with chips)
  try{
    const styleBtn = (b, variant)=>{
      if(!b) return;
      b.classList.remove('linkBtn');
      b.classList.add('btn');
      b.classList.add((variant||'ghost'));
      b.classList.add('small');
      b.style.padding = '6px 10px';
      b.style.borderRadius = '999px';
      b.style.lineHeight = '1';
    };
    styleBtn(addBtn, 'ghost');
    styleBtn(manageBtn, 'ghost');
    // "Bez kategorii" deserves attention
    styleBtn(uncatBtn, 'secondary');
  }catch(e){}

  const modal    = document.getElementById('addSpCatModal');
  const save     = document.getElementById('spCatSave');
  const cancel   = document.getElementById('spCatCancel');
  const delBtn   = document.getElementById('spCatDelete');

  const nameIn   = document.getElementById('spCatName');
  const editIdIn = document.getElementById('spCatEditId');
  const emojiWrap= document.getElementById('spCatEmojiList');
  const emojiCustomIn = document.getElementById('spCatEmojiCustom');

  const mgrModal = document.getElementById('spCatMgrModal');
  const mgrList  = document.getElementById('spCatMgrList');
  const mgrClose = document.getElementById('spCatMgrClose');
  const mgrAdd   = document.getElementById('spCatMgrAdd');

  const uncatModal = document.getElementById('uncatModal');
  const uncatList  = document.getElementById('uncatList');
  const uncatClose = document.getElementById('uncatClose');

  // Run once to avoid duplicating listeners; delegation below keeps buttons working even after re-renders.
  if(window._otdSpendingInitOnce){
    try{ if(typeof window._otdUpdateUncatBadge==='function') window._otdUpdateUncatBadge(); }catch(e){}
    return;
  }
  window._otdSpendingInitOnce = true;

  // Allow manager/uncat to work even if add/edit modal is missing after merges
  const canAddEdit = !!(addBtn && modal && save && cancel && nameIn && emojiWrap);
  if(!canAddEdit){
    console.warn('Spending UI: add/edit modal not found, actions will be limited.');
  }

  let chosenEmoji = '📦';

  function isDefaultCatId(id){
    return (DEFAULT_SP_CATS || []).some(c=>String(c.id)===String(id));
  }

  function slugify(s){
    return String(s||'')
      .toLowerCase()
      .replace(/[\s]+/g,'_')
      .replace(/[^a-z0-9а-яё_]+/gi,'')
      .replace(/^_+|_+$/g,'');
  }

  function openSpCatModal(mode, cat){
    // mode: 'add' | 'edit'
    if(!canAddEdit){
      alert('Brak okna kategorii (addSpCatModal).');
      return;
    }
    const c = cat || {};
    const isEdit = mode==='edit' && c.id;

    if(editIdIn) editIdIn.value = isEdit ? String(c.id) : '';
    if(delBtn) delBtn.style.display = isEdit ? 'inline-flex' : 'none';

    if(nameIn) nameIn.value = isEdit ? (c.label || '') : '';
    if(emojiCustomIn) emojiCustomIn.value = '';

    chosenEmoji = (c.emoji || '📦');
    // highlight emoji button if exists
    emojiWrap.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
    const btnMatch = Array.from(emojiWrap.querySelectorAll('button')).find(b=> (b.textContent||'').trim()===chosenEmoji);
    if(btnMatch) btnMatch.classList.add('active');

    modal.classList.add('show');
  }

  function closeSpCatModal(){
    modal.classList.remove('show');
  }

  if(canAddEdit){
  // Emoji selection
  emojiWrap.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      emojiWrap.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      chosenEmoji = (btn.textContent||'').trim() || '📦';
      if(emojiCustomIn) emojiCustomIn.value = '';
    });
  });

  // Add new category
  addBtn.addEventListener('click', ()=>{
    openSpCatModal('add', null);
  });

  // Cancel
  cancel.addEventListener('click', closeSpCatModal);

  // Delete (remove override or custom)
  if(delBtn){
    delBtn.addEventListener('click', ()=>{
      const id = (editIdIn && editIdIn.value) ? String(editIdIn.value) : '';
      if(!id) return;
      const extras = loadUserSpCats();
      const idx = extras.findIndex(c=>String(c.id)===id);
      if(idx>=0){
        extras.splice(idx,1);
        saveUserSpCats(extras);
      }else{
        // If it's default without override, nothing to delete
      }
      closeSpCatModal();
      render(); pushState();
    });
  }

  // Save add/edit
  save.addEventListener('click', ()=>{
    const label = (nameIn.value||'').trim();
    if(!label) return;

    // pick emoji: custom overrides chosen
    const customEmoji = (emojiCustomIn && emojiCustomIn.value) ? emojiCustomIn.value.trim() : '';
    const emoji = customEmoji || chosenEmoji || '📦';

    const extras = loadUserSpCats();
    let id = (editIdIn && editIdIn.value) ? String(editIdIn.value).trim() : '';

    if(!id){
      // create new id
      const base = slugify(label).slice(0,16) || ('cat_'+Date.now());
      id = ('user_'+base).slice(0,24);
      // avoid collisions
      const all = getAllSpCats().map(c=>String(c.id));
      if(all.includes(id)){
        id = (id + '_' + String(Date.now()).slice(-4)).slice(0,28);
      }
    }

    const cat = {id, label, emoji};

    const idx = extras.findIndex(c=>String(c.id)===String(id));
    if(idx>=0) extras[idx]=cat; else extras.push(cat);
    saveUserSpCats(extras);

    closeSpCatModal();
    render(); pushState();
  });

  } // end canAddEdit

  /* === Category manager === */
  function renderSpCatMgrList(){
    if(!mgrList) return;
    const cats = getAllSpCats();
    const extras = loadUserSpCats();

    mgrList.innerHTML = cats.map(c=>{
      const id = String(c.id||'');
      const hasOverride = extras.some(x=>String(x.id)===id);
      const canDelete = hasOverride || (!isDefaultCatId(id)); // custom cat -> delete fully
      const badge = isDefaultCatId(id) ? (hasOverride ? 'override' : 'default') : 'custom';

      return `
        <div style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:12px">
          <div style="min-width:28px;text-align:center;font-size:18px">${c.emoji||'📦'}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(c.label||id)}</div>
            <div class="muted small">id: ${escapeHtml(id)} · ${badge}</div>
          </div>
          <button class="btn secondary" style="padding:6px 10px;font-size:12px" data-act="spcat-edit" data-id="${escapeHtml(id)}">✎</button>
          <button class="btn secondary" style="padding:6px 10px;font-size:12px;${canDelete?'':'opacity:.35;pointer-events:none'};border-color:rgba(255,80,80,.55);color:rgba(255,140,140,.95)" data-act="spcat-del" data-id="${escapeHtml(id)}">🗑</button>
        </div>
      `;
    }).join('');
  }

  function openSpCatMgr(){
    if(!mgrModal) return;
    renderSpCatMgrList();
    mgrModal.classList.add('show');
  }
  function closeSpCatMgr(){
    if(!mgrModal) return;
    mgrModal.classList.remove('show');
  }

  if(manageBtn){
    manageBtn.addEventListener('click', openSpCatMgr);
  }
  if(mgrClose){
    mgrClose.addEventListener('click', closeSpCatMgr);
  }
  if(mgrAdd){
    mgrAdd.addEventListener('click', ()=>{
      closeSpCatMgr();
      openSpCatModal('add', null);
    });
  }

  // Manager actions via delegation
  if(!window._otdSpCatMgrDelegated){
    window._otdSpCatMgrDelegated = true;
    

  // Keyboard: go home from brand title (Enter/Space)
  const brandHomeKey = $id('brandHome');
  if(brandHomeKey){
    brandHomeKey.addEventListener('keydown', (e)=>{
      if(e.key==='Enter' || e.key===' '){
        e.preventDefault();
        if(window.appGoHome) window.appGoHome();
      }
    });
  }

document.addEventListener('click', (e)=>{
    const b = e.target.closest('button');
    if(!b) return;
    const act = b.getAttribute('data-act');
    if(act==='spcat-edit'){
      const id = b.getAttribute('data-id');
      const cat = getCatById(id);
      closeSpCatMgr();
      openSpCatModal('edit', cat || {id, label:id, emoji:'📦'});
    }
    if(act==='spcat-del'){
      const id = b.getAttribute('data-id');
      if(!id) return;
      const extras = loadUserSpCats();
      const idx = extras.findIndex(c=>String(c.id)===String(id));
      if(idx>=0){
        extras.splice(idx,1);
        saveUserSpCats(extras);
      }else{
        // if it's a custom cat not in extras (shouldn't happen) do nothing
      }
      renderSpCatMgrList();
      render(); pushState();
    }
  }, {capture:false});
  }

  /* === Uncategorized list === */
    function collectUncat(){
    const items = [];

    // Ensure IDs exist (otherwise kasa/tx may be skipped)
    try{ if(typeof ensureTxIds==='function') ensureTxIds(); }catch(e){}
    try{ if(typeof ensureKasaIds==='function') ensureKasaIds(); }catch(e){}

function normUncatCat(v){
      const s = String(v||'').trim();
      if(!s) return '';
      const low = s.toLowerCase();
      if(s==='—' || s==='–' || s==='-' || low==='—' || low==='–' || low==='-') return '';
      if(low==='bez kategorii' || low==='brak kategorii' || low==='brak' || low==='uncategorized' || low==='no category' || low==='none' || low==='без категории' || low==='без категорії') return '';
      return s;
    }

        function explicitTxCat(r){
      const raw = getVal(r,["Kategoria","Category","category"]) || r.category || r.cat || "";
      return normUncatCat(raw);
    }
    function explicitBillCat(r){
      const raw = getVal(r,["Kategoria","Category","category"]) || r.category || r.cat || "";
      return normUncatCat(raw);
    }
    function explicitKasaCat(k){
      const raw = (k && (k.category || k.cat || k.Kategoria || k["Kategoria"] || k["Категория"])) || "";
      return normUncatCat(raw);
    }

    // TX: operations without explicit category (both income and expense)
    (tx||[]).forEach(r=>{
      const amt = asNum(getVal(r,["Kwota","Kwота","amount","Kwota_raw"])||0);
      if(!amt) return;
      const cat = explicitTxCat(r);
      if(cat) return;

      const id = String(getVal(r,["ID transakcji","ID","id"])||r.id||"");
      if(!id) return;

      const d = toISO(getVal(r,["Data księgowania","Data","date","Дата"])) || "";
      const merchant = getMerchantFromTxRow(r) || "Wyciąg";
      items.push({kind:'tx', id, date:d, merchant, amount:amt});
    });

    // KASA: operations without explicit category (both income and expense; exclude zamknięcie)
    (kasa||[]).forEach(k=>{
      const amt = getSignedKasaAmount(k);
      if(!amt) return;
      const cat = explicitKasaCat(k);
      if(cat) return;

      const id = String(k.id||"");
      if(!id) return;

      const d = String(k.date||"").slice(0,10);
      const merchant = getMerchantFromKasaRow(k) || "Kasa";
      items.push({kind:'kasa', id, date:d, merchant, amount:amt});
    });

    // BILLS: invoices without explicit category (treat as expenses)
    (bills||[]).forEach(r=>{
      const cat = explicitBillCat(r);
      if(cat) return;

      const id = String(getVal(r,["Numer faktury","Numer фактуры","Invoice number"])||"");
      if(!id) return;

      const d = toISO(getVal(r,["Termin płatności","Termin платności","Termin платності","Termin","Due date"])||"") || "";
      const supplier = String(getVal(r,["Dostawca","Supplier"])||"Faktura");
      const amtPos = asNum(getVal(r,["Kwota do zapłaty","Kwota","Amount","amount"])||0);
      if(!amtPos) return;
      items.push({kind:'bill', id, date:d, merchant:supplier, amount:-Math.abs(amtPos)});
    });

    // newest first by date
    items.sort((a,b)=>{
      const da = a.date || '';
      const db = b.date || '';
      if(da !== db) return db.localeCompare(da);
      return (a.amount||0) - (b.amount||0);
    });

    return items;
  }

  window._otdCollectUncat = collectUncat;

  function updateUncatBadge(){
    const el = document.getElementById('uncatCount');
    if(!el) return;
    const n = collectUncat().length;
    el.textContent = String(n);
    el.style.display = n ? 'inline-flex' : 'none';
  }

  function renderUncatList(){
    if(!uncatList) return;
    const items = collectUncat();
    if(!items.length){
      uncatList.innerHTML = `<div class="muted small">${(window.t && t('uncat.none')) || 'Brak operacji bez kategorii.'}</div>`;
      return;
    }
    uncatList.innerHTML = items.map(it=>{
      const val = Math.abs(it.amount||0).toFixed(2);
      const sign = (Number(it.amount||0) < 0) ? '−' : '+';
      const title = escapeHtml(it.merchant||'');
            const kindLbl = (it.kind==='kasa') ? 'Kasa' : (it.kind==='bill' ? 'Faktury' : 'Wyciąg');
      return `
        <div style="display:flex;gap:10px;align-items:center;padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:12px">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div>
            <div class="muted small">${escapeHtml(it.date||'')} · ${kindLbl} · ${sign}${val} PLN</div>
          </div>
          <button class="btn" style="padding:6px 10px;font-size:12px" data-act="cat" data-kind="${escapeHtml(it.kind)}" data-id="${escapeHtml(it.id)}">${(window.t && t('uncat.choose')) || 'Wybierz'}</button>
        </div>
      `;
    }).join('');
  }

  function openUncat(){
    if(!uncatModal) return;
    renderUncatList();
    uncatModal.classList.add('show');
  }
  function closeUncat(){
    if(!uncatModal) return;
    uncatModal.classList.remove('show');
  }

  if(uncatBtn){
    uncatBtn.addEventListener('click', openUncat);
  }
  if(uncatClose){
    uncatClose.addEventListener('click', closeUncat);
  }

  // expose helpers for fallback delegation (buttons stay clickable even if direct listeners are lost)
  window._otdOpenSpCatMgr = openSpCatMgr;
  window._otdOpenUncat = openUncat;
  window._otdOpenSpCatAdd = ()=> openSpCatModal('add', null);

  // refresh badge on init and after render()
  try{ updateUncatBadge(); }catch(e){}
  window._otdUpdateUncatBadge = updateUncatBadge;
  window._otdRenderUncatList = renderUncatList;
}

(function bindSpendingToolbarDelegation(){
  if(window._otdSpendingToolbarDelegated) return;
  window._otdSpendingToolbarDelegated = true;

  // Capture-phase delegation: action buttons work even if something re-rendered them.
  document.addEventListener('click', (e)=>{
    const btn = e.target && e.target.closest ? e.target.closest('#addSpCatBtn,#manageSpCatsBtn,#uncatBtn,#spOpenListBtn') : null;
    if(!btn) return;

    // Ensure UI init ran (safe if already inited)
    try{ if(typeof initSpendingUI==='function') initSpendingUI(); }catch(err){}

    if(btn.id==='manageSpCatsBtn' && typeof window._otdOpenSpCatMgr==='function'){
      e.preventDefault(); e.stopPropagation();
      window._otdOpenSpCatMgr();
    }
    if(btn.id==='uncatBtn' && typeof window._otdOpenUncat==='function'){
      e.preventDefault(); e.stopPropagation();
      window._otdOpenUncat();
    }
    if(btn.id==='addSpCatBtn' && typeof window._otdOpenSpCatAdd==='function'){
      e.preventDefault(); e.stopPropagation();
      window._otdOpenSpCatAdd();
    }

if(btn.id==='spOpenListBtn'){
  e.preventDefault(); e.stopPropagation();
  try{
    const cid = (window._otdSpendingActiveCatId===undefined) ? null : window._otdSpendingActiveCatId;
    if(typeof openSpendingList==='function') openSpendingList(cid);
  }catch(err){}
}

  }, true);

  // Default screen: Home (tiles). Start on Home after load.
  window.addEventListener('load', () => {
    try {
      // Always start on Home (tiles) after login/refresh
      if (window.appGoHome) window.appGoHome();
      else if (window.appGoSection) window.appGoSection('pulpit'); // fallback
    } catch (_) {}
  }, { once: true });
})();

