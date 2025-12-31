// Extracted from public/js/app/app.js (lines 1258-1664)
// ===== Categories & spending breakdown =====

const DEFAULT_SP_CATS = [
  {id:'food',  labelKey:'spending.cat_food',  emoji:'🍞'},
  {id:'fuel',  labelKey:'spending.cat_fuel',  emoji:'⛽'},
  {id:'home',  labelKey:'spending.cat_home',  emoji:'🏠'},
  {id:'subs',  labelKey:'spending.cat_subs',  emoji:'💳'},
  {id:'other', labelKey:'spending.cat_other', emoji:'📦'},
  {id:'salary',labelKey:'spending.cat_salary',emoji:'💰'}
];

function loadUserSpCats(){
  try{
    const raw = localStorage.getItem('otd_sp_cats');
    if(!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  }catch(e){
    console.warn('spcats load', e);
    return [];
  }
}

function saveUserSpCats(arr){
  try{
    localStorage.setItem('otd_sp_cats', JSON.stringify(arr || []));
  }catch(e){
    console.warn('spcats save', e);
  }
}

function getAllSpCats(){
  // user categories are stored in localStorage; make sure default categories stay language-aware
  let extra = loadUserSpCats();

  try{
    const defaultIds = new Set((DEFAULT_SP_CATS||[]).map(c=>String(c.id)));
    const known = {
      food:   ['Продукты','Produkty','Food','Продукти'],
      fuel:   ['Топливо','Paliwo','Fuel','Паливо'],
      home:   ['Дом','Dom','Home','Дім'],
      subs:   ['Подписки','Subskrypcje','Subscriptions','Підписки'],
      other:  ['Другое','Inne','Other','Інше'],
      salary: ['Зарплата','Wynagrodzenie','Salary','Зарплата']
    };
    extra = (Array.isArray(extra) ? extra : []).filter(c=>{
      const id = String((c && c.id) || '');
      if(!id) return false;
      if(!defaultIds.has(id)) return true;
      const lbl = String((c && c.label) || '').trim();
      if(!lbl) return false;
      const list = known[id] || [];
      // if the label equals one of the default translations, drop override and use i18n labelKey
      return !list.includes(lbl);
    });
  }catch(_e){}

  const byId = {};
  (DEFAULT_SP_CATS||[]).forEach(c=>byId[c.id]=c);
  (extra||[]).forEach(c=>byId[c.id]=c);
  return Object.values(byId);
}

function getCatById(id){
  if(!id) return null;
  const cats = getAllSpCats();
  return cats.find(c=>String(c.id)===String(id)) || null;
}
function resolveSpCatLabel(cat){
  if(!cat) return '';
  if(cat.labelKey){
    const v = TT(cat.labelKey);
    if(v && v !== cat.labelKey) return v;
  }

  const raw = String(cat.label||'').trim();
  if(raw){
    const n = raw.toLowerCase();
    const alias = {
      'food':'spending.cat_food',
      'fuel':'spending.cat_fuel',
      'home':'spending.cat_home',
      'subscriptions':'spending.cat_subs',
      'subs':'spending.cat_subs',
      'other':'spending.cat_other',
      'salary':'spending.cat_salary'
    };
    if(alias[n]){
      const v2 = TT(alias[n]);
      if(v2 && v2 !== alias[n]) return v2;
    }
    return raw;
  }

  return cat.id || '';
}

function formatCatLabel(id){
  if(!id) return "—";
  const c = getCatById(id);
  if(!c) return id;
  const em = c.emoji || "📦";
  const lbl = resolveSpCatLabel(c) || id;
  return `${em} ${lbl}`;
}

function fillQuickCashCat(){
  const sel = $id('quickCashCat');
  if(!sel) return;
  const current = sel.value || "";
  const cats = getAllSpCats();
  sel.innerHTML = '';
  sel.appendChild(new Option(TT("cash.opt_category", null, "Категория"), ""));
  cats.forEach(c=>{
    sel.appendChild(new Option(`${c.emoji||"📦"} ${resolveSpCatLabel(c)||c.id}`, c.id));
  });
  sel.value = current;
}


let catModalState = null;

function getMerchantKeyFor(kind, obj){
  try{
    if(kind==='tx'){
      return String(getVal(obj,["Kontrahent","Counterparty"]) || getVal(obj,["Tytuł/Opis","Opis","title"]) || "").trim().toLowerCase();
    }
    if(kind==='bill'){
      return String(getVal(obj,["Dostawca","Supplier"]) || getVal(obj,["Numer faktury","Invoice number"]) || "").trim().toLowerCase();
    }
    if(kind==='kasa'){
      return String(obj.source || obj.comment || "").trim().toLowerCase();
    }
  }catch(e){}
  return "";
}

function openCatModal(kind, id){
  const sel = $id('catSelect');
  const chk = $id('catApplySame');
  const mSave = $id('catSaveBtn');
  const mCancel = $id('catCancelBtn');
  const overlay = $id('catModal');
  if(!sel || !overlay) return;

  // Always bring the category modal on top.
  // On mobile Safari, multiple overlays with the same z-index can make the picker appear “dead”.
  try{
    if(overlay.parentElement !== document.body) document.body.appendChild(overlay);
    else document.body.appendChild(overlay); // move to the end so it stays above other overlays
    overlay.style.zIndex = '99999';
  }catch(_){ }

  const cats = getAllSpCats();
  sel.innerHTML = '';
  sel.appendChild(new Option("— без категории —", ""));
  cats.forEach(c=>{
    const opt = new Option(`${c.emoji||"📦"} ${c.label||c.id}`, c.id);
    sel.appendChild(opt);
  });

  let currentObj = null;
  if(kind==='tx') currentObj = tx.find(x=> String(getVal(x,["ID transakcji","ID","id"])||"")===String(id));
  if(kind==='bill') currentObj = bills.find(x=> String(getVal(x,["Numer faktury","Numer фактуры","Invoice number"])||"")===String(id));
  if(kind==='kasa') currentObj = kasa.find(x=> String(x.id)===String(id));

  const currentCat = kind==='kasa' ? (currentObj?.category||"") : (getVal(currentObj,["Kategoria","Category","category"]) || "");
  sel.value = currentCat || "";
  if(chk) chk.checked = false;

  catModalState = {kind, id};

  overlay.classList.add('show');

  const close = ()=>{
    overlay.classList.remove('show');
    catModalState = null;
  };

  mCancel && (mCancel.onclick = close);

  mSave && (mSave.onclick = ()=>{
    if(!catModalState) return close();
    const newCat = sel.value || "";
    const applySame = chk && chk.checked;

    if(catModalState.kind==='kasa'){
      const idx = kasa.findIndex(x=> String(x.id)===String(catModalState.id));
      if(idx>=0){
        kasa[idx].category = newCat;
      }
      if(applySame){
        const key = getMerchantKeyFor('kasa', kasa[idx]||{});
        kasa.forEach(k=>{
          if(!k.category && getMerchantKeyFor('kasa', k)===key){
            k.category = newCat;
          }
        });
      }
    }

    if(catModalState.kind==='tx'){
      const idx = tx.findIndex(x=> String(getVal(x,["ID transakcji","ID","id"])||"")===String(catModalState.id));
      if(idx>=0){
        tx[idx]["Kategoria"] = newCat;
      }
      if(applySame){
        const key = getMerchantKeyFor('tx', tx[idx]||{});
        tx.forEach(r=>{
          const has = getVal(r,["Kategoria","Category","category"]);
          if(!has && getMerchantKeyFor('tx', r)===key){
            r["Kategoria"] = newCat;
          }
        });
      }
    }

    if(catModalState.kind==='bill'){
      const idx = bills.findIndex(x=> String(getVal(x,["Numer faktury","Numer фактуры","Invoice number"])||"")===String(catModalState.id));
      if(idx>=0){
        bills[idx]["Kategoria"] = newCat;
      }
      if(applySame){
        const key = getMerchantKeyFor('bill', bills[idx]||{});
        bills.forEach(r=>{
          const has = getVal(r,["Kategoria","Category","category"]);
          if(!has && getMerchantKeyFor('bill', r)===key){
            r["Kategoria"] = newCat;
          }
        });
      }
    }
if(catModalState.kind==='kasa'){
  const idx = (kasa || []).findIndex(x => String(x.id || '') === String(catModalState.id));
  if(idx >= 0){
    kasa[idx].category = newCat;
  }

  // applySame для кассы можно сделать мягко по comment/source
  if(applySame && idx >= 0){
    const key = getMerchantKeyFor ? getMerchantKeyFor('kasa', kasa[idx]||{}) : (
      (kasa[idx].source || kasa[idx].comment || "")
    );

    (kasa || []).forEach(r=>{
      const has = String(r.category || r.Kategoria || "").trim();
      const rKey = getMerchantKeyFor ? getMerchantKeyFor('kasa', r) : (r.source || r.comment || "");
      if(!has && rKey === key){
        r.category = newCat;
      }
    });
  }
}


    saveLocal(); render(); pushState();
    try{
      if(window._otdUpdateUncatBadge) window._otdUpdateUncatBadge();
      const um = document.getElementById('uncatModal');
      if(um && um.classList.contains('show') && window._otdRenderUncatList) window._otdRenderUncatList();
    }catch(e){}

    close();
  });
}

/* === CSV IMPORT LITE WIZARD (MVP) === */
function parseCsvRows(text){
  const lines = String(text||'').split(/\r?\n/).filter(l=>l.trim().length);
  if(lines.length < 2) return { header: [], rows: [], delim: ',' };

  const delim = (lines[0].includes(';') && !lines[0].includes(',')) ? ';' : ',';
  const header = lines[0].split(delim).map(s=>s.trim());
  const rows = lines.slice(1).map(l=> l.split(delim));
  return { header, rows, delim };
}

function guessColIndex(header, variants){
  const low = header.map(h=>String(h||'').toLowerCase());
  for(const v of variants){
    const i = low.indexOf(String(v).toLowerCase());
    if(i >= 0) return i;
  }
  return -1;
}

function runCsvMapWizard(header){
  const list = header.map((h,i)=> `${i}: ${h}`).join('\n');

  alert(
    "Файл не распознан автоматически.\n" +
    "Выберите колонки вручную.\n\n" +
    "Колонки:\n" + list
  );

  const dateIdx = Number(prompt(TT("prompts.col_date", {list:list}, "Номер колонки ДАТЫ:\n\n{list}"), "0"));
  const amountIdx = Number(prompt(TT("prompts.col_amount", {list:list}, "Номер колонки СУММЫ:\n\n{list}"), "1"));
  const descIdx = Number(prompt(TT("prompts.col_desc2", {list:list}, "Номер колонки ОПИСАНИЯ (если нет — оставь пустым):\n\n{list}"), "2"));
  const cpIdx = Number(prompt(TT("prompts.col_counterparty2", {list:list}, "Номер колонки КОНТРАГЕНТА (если нет — оставь пустым):\n\n{list}"), "3"));

  if(Number.isNaN(dateIdx) || Number.isNaN(amountIdx)){
    throw new Error("Wizard cancelled");
  }

  return {
    dateIdx,
    amountIdx,
    descIdx: Number.isNaN(descIdx) ? -1 : descIdx,
    cpIdx: Number.isNaN(cpIdx) ? -1 : cpIdx
  };
}

function buildTxFromMappedRows(header, rows, mapping){
  const out = [];
  rows.forEach((cells)=>{
    const date = (cells[mapping.dateIdx] || "").trim();
    const amountRaw = (cells[mapping.amountIdx] || "").trim();
    if(!date || !amountRaw) return;

    const amount = (typeof asNum === "function")
      ? asNum(amountRaw)
      : Number(String(amountRaw).replace(',', '.'));

    if(!amount) return;

    const desc = mapping.descIdx >= 0 ? (cells[mapping.descIdx] || "").trim() : "";
    const cp = mapping.cpIdx >= 0 ? (cells[mapping.cpIdx] || "").trim() : "";

    out.push({
      "Data": date,
      "Kwota": amount,
      "Opis": desc,
      "Kontrahent": cp,
      "_src": "csv_wizard"
    });
  });
  return out;
}

async function importTxCsvLiteWizard(text){
  const { header, rows } = parseCsvRows(text);
  if(!header.length) throw new Error("empty csv");

  let dateIdx = guessColIndex(header, ["data","date","booking date","transaction date"]);
  let amountIdx = guessColIndex(header, ["kwota","amount","suma","value"]);
  let descIdx = guessColIndex(header, ["opis","description","tytuł/opis","title"]);
  let cpIdx = guessColIndex(header, ["kontrahent","counterparty","nazwa"]);

  let mapping = { dateIdx, amountIdx, descIdx, cpIdx };

  if(dateIdx < 0 || amountIdx < 0){
    mapping = runCsvMapWizard(header);
  }

  const newTx = buildTxFromMappedRows(header, rows, mapping);
  if(!newTx.length) throw new Error("no rows parsed");
  return newTx;
}
/* === /CSV IMPORT LITE WIZARD === */

// Ручная привязка импортированных транзакций к счёту
function assignImportedTxToAccount(imported){
  if(!Array.isArray(imported) || !imported.length) return imported;

  accMeta = accMeta && typeof accMeta === "object" ? accMeta : {};

  // Собираем список счетов для выбора
  const ids = Object.keys(accMeta);
  const list = ids.map(id=>{
    const acc = accMeta[id] || {};
    const name = acc.name || id;
    const type = acc.type || "";
    const cur = acc.currency || acc.cur || "";
    let label = name;
    if(type) label += " ("+type+")";
    if(cur) label += " ["+cur+"]";
    return { id, label };
  });

  let chosenId = null;

  if(list.length === 0){
    // нет ни одного счёта — создаём тех-счёт для импортов
    if(!accMeta["imported_acc"]){
      accMeta["imported_acc"] = {
        name: "Imported account",
        type: "imported",
        currency: "PLN",
        include: true
      };
    }
    chosenId = "imported_acc";
  }else if(list.length === 1){
    // один счёт — не мучаем пользователя выбором
    chosenId = list[0].id;
  }else{
    // несколько счетов — даём человеку выбрать
    const msg =
      "К какому счёту относится эта выписка?\n\n" +
      list.map((a,idx)=> idx + ": " + a.label).join("\n") +
      "\n\nВведите номер счёта (или отмените, чтобы пропустить привязку).";

    const ans = prompt(msg, "0");
    if(ans === null){
      // пользователь отменил — ничего не трогаем
      return imported;
    }
    const idx = Number(ans);
    if(!Number.isNaN(idx) && idx >= 0 && idx < list.length){
      chosenId = list[idx].id;
    }
  }

  if(!chosenId) return imported;

  imported.forEach(t=>{
    if(t){
      if(!t._acc) t._acc = chosenId;
      // make account visible to exporters & account manager (most code reads 'ID konta')
      if(!getVal(t,["ID konta","IBAN","account"])) t["ID konta"] = chosenId;
    }
  });

  return imported;
}


