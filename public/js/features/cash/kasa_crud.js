// Extracted from public/js/app/app.js (lines 5142-5208)
/* ==== KASA CRUD ==== */
function loadKasa(){ kasa = _otdGetJSON('kasa', []); }
function addKasa(type,amount,comment,source,category){
  if(amount==null||isNaN(amount)) return alert("Сумма некорректна");
  const cat = category || ($id('quickCashCat')?.value || "");
  const __id = Date.now() + Math.floor(Math.random()*1000);
  kasa.push({id:__id,date:today(),type,amount:Number(amount),comment:comment||"",source:source||"ручной",category:cat});
  saveLocal(); render(); pushState();
  return __id;
}
function editRow(kind,id){
  if(kind==='kasa'){
    const idx=kasa.findIndex(x=> String(x.id)===String(id)); if(idx<0) return;
    const k=kasa[idx];
    const n=prompt(TT("prompts.amount", null, "Сумма:"), k.amount); if(n===null) return;
    const c=prompt("Комментарий:", k.comment||""); if(c===null) return;
    kasa[idx].amount=asNum(n); kasa[idx].comment=c;
    saveLocal(); render(); pushState(); return;
  }
  if(kind==='tx'){
    const idx=tx.findIndex(x=> (getVal(x,["ID transakcji","ID","id"])||"")===String(id)); if(idx<0) return;
    const r=tx[idx];
    const d=prompt(TT("prompts.date", null, "Дата (YYYY-MM-DD):"), toISO(getVal(r,["Data księgowania","date"])||today())); if(d===null) return;
    const a=prompt(TT("prompts.amount", null, "Сумма:"), getVal(r,["Kwota","Kwota_raw","amount"])||""); if(a===null) return;
    const cp=prompt(TT("prompts.counterparty", null, "Контрагент:"), getVal(r,["Kontrahent","Counterparty"])||""); if(cp===null) return;
    const desc=prompt(TT("prompts.description", null, "Описание:"), getVal(r,["Tytuł/Opis","Opis","title"])||""); if(desc===null) return;

    r["Data księgowania"]=toISO(d)||today();
    r["Kwota"]=asNum(a).toFixed(2);
    r["Waluta"]= detectCurrency(getVal(r,["Waluta"])||'');
    r["Kontrahent"]=cp;
    r["Tytuł/Opis"]=desc;

    saveLocal(); render(); pushState(); return;
  }
  if(kind==='bill'){
    const idx=bills.findIndex(x=> (getVal(x,["Numer faktury","Numer фактуры","Invoice number"])||"")===String(id)); if(idx<0) return;
    const r=bills[idx];
    const due=prompt(TT("prompts.due_date", null, "Срок (YYYY-MM-DD):"), toISO(getVal(r,["Termin płatności","Termin"])||today())); if(due===null) return;
    const amt=prompt(TT("prompts.amount_to_pay", null, "Сумма к оплате:"), getVal(r,["Kwota do zapłaty","Kwota"])||""); if(amt===null) return;
    const sup=prompt(TT("prompts.supplier", null, "Поставщик/контрагент:"), getVal(r,["Dostawca","Supplier"])||""); if(sup===null) return;

    r["Termin płatności"]=toISO(due)||today();
    r["Kwota do zapłaty"]=asNum(amt).toFixed(2);
    r["Waluta"]= detectCurrency(getVal(r,["Waluta"])||'');
    r["Dostawca"]=sup;

    saveLocal(); render(); pushState(); return;
  }
}
function markBillPaid(id){
  const idx=bills.findIndex(x=> (getVal(x,["Numer faktury","Numer фактуры","Invoice number"])||"")===String(id));
  if(idx<0) return;
  const r=bills[idx];
  const ok = confirm(TT("dialogs.mark_invoice_paid", null, "Отметить эту фактуру как оплачено вручную?"));
  if(!ok) return;

  r["Status faktury"] = "opłacone";
  r["Payment ID"] = "manual-" + Date.now();

  saveLocal(); render(); pushState();
}

function delRow(kind,id){
  if(kind==='kasa'){ kasa = kasa.filter(x=> String(x.id)!==String(id)); saveLocal(); render(); pushState(); return; }
  if(kind==='tx'){ tx = tx.filter(x=> (getVal(x,["ID transakcji","ID","id"])||"")!==String(id)); saveLocal(); render(); pushState(); return; }
  if(kind==='bill'){ bills = bills.filter(x=> (getVal(x,["Numer faktury","Numer фактуры","Invoice number"])||"")!==String(id)); saveLocal(); render(); pushState(); return; }
}

