// Extracted from public/js/app/app.js (lines 4417-4608)
/* ==== UNIFIED BOOK ==== */
function bookRows(){
  const rows=[];
  (tx||[]).forEach(r=>{
    rows.push({
      date: toISO(getVal(r,["Data księgowania","Data","date","Дата"]))||today(),
      source: 'bank',
      account: getVal(r,["ID konta","IBAN","account"]) || r._acc || 'UNKNOWN',
      counterparty: getVal(r,["Kontrahent","Counterparty"])||'',
      desc: getVal(r,["Tytuł/Opis","Opis","title"])||'',
      amount: asNum(getVal(r,["Kwota","Kwота","amount","Kwota_raw"]))||0,
      currency: (getVal(r,["Waluta","currency"])||'PLN').toUpperCase(),
      type:'', no:'', doc_date:'', due:'', status: getVal(r,["Status transakcji","status"])||''
    });
  });
  (bills||[]).forEach(b=>{
    const amt = -Math.abs(asNum(getVal(b,["Kwota do zapłaty","Kwota","Kwота"]))||0);
    rows.push({
      date: toISO(getVal(b,["Data wystawienia","IssueDate"]))||toISO(getVal(b,["Termin płatności","Termin"]))||today(),
      source:'invoice',
      account:'',
      counterparty: getVal(b,["Dostawca","Supplier"])||'',
      desc: 'INVOICE',
      amount: amt,
      currency: (getVal(b,["Waluta","currency"])||'PLN').toUpperCase(),
      type:'INVOICE', no:getVal(b,["Numer faktury","Invoice number"])||'',
      doc_date: toISO(getVal(b,["Data wystawienia","IssueDate"]))||'',
      due: toISO(getVal(b,["Termin płatności","Termin"]))||'',
      status: getVal(b,["Status faktury","Status"])||''
    });
  });
  (kasa||[]).forEach(k=>{
    rows.push({
      date: k.date||today(), source:'cash', account:'KASA', counterparty:'', desc:k.comment||k.source||'',
      amount: (k.type==='wydanie'?-1:1)*Math.abs(k.amount||0), currency:'PLN', type:'CASH', no:'', doc_date:'', due:'', status:''
    });
  });
  return rows.sort((a,b)=> (a.date<b.date?-1: a.date>b.date?1:0));
}
function _otdParsePeriodInput(raw){
  const s = String(raw||'').trim();
  if(!s) return null;

  // month: YYYY-MM
  if(/^\d{4}-\d{2}$/.test(s)){
    const [y,m] = s.split('-').map(n=>parseInt(n,10));
    if(!y || !m) return null;
    const from = new Date(Date.UTC(y, m-1, 1));
    const to   = new Date(Date.UTC(y, m, 1)); // exclusive
    return { from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10), label: s };
  }

  // range: YYYY-MM-DD..YYYY-MM-DD
  const m = s.match(/^(\d{4}-\d{2}-\d{2})\s*\.\.\s*(\d{4}-\d{2}-\d{2})$/);
  if(m){
    const a = new Date(m[1]+'T00:00:00Z');
    const b = new Date(m[2]+'T00:00:00Z');
    if(!isFinite(a.getTime()) || !isFinite(b.getTime())) return null;
    // inclusive end -> exclusive next day
    const to = new Date(b.getTime() + 24*3600*1000);
    return { from: m[1], to: to.toISOString().slice(0,10), label: m[1] + '..' + m[2] };
  }

  return null;
}
function _otdAskExportPeriod(){
  const now = new Date();
  const y = now.getFullYear();
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const def = `${y}-${mm}`;
  const raw = prompt(
    "Export period:\n- month: YYYY-MM\n- range: YYYY-MM-DD..YYYY-MM-DD\n\nExample: 2025-12 or 2025-12-01..2025-12-31",
    def
  );
  if(raw === null) return null;
  const p = _otdParsePeriodInput(raw);
  if(!p){
    alert(TT("alerts.invalid_period", null, "Неверный период. Используй YYYY-MM или YYYY-MM-DD..YYYY-MM-DD"));
    return null;
  }
  return p;
}
function _otdInPeriod(dateISO, period){
  const d = String(dateISO||'').slice(0,10);
  if(!d) return false;
  return (d >= period.from && d < period.to);
}

function renderBook(){
  const tb=document.querySelector('#bookTable tbody'); if(!tb) return; // таблицы нет — тихий выход
  const rows=bookRows();
  rows.forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${r.date}</td><td>${r.source}</td><td>${r.account||'—'}</td><td>${r.counterparty||''}</td><td>${r.desc||''}</td><td>${fmtAmountRaw(r.amount)}</td><td>${r.currency}</td><td>${r.type||''}</td><td>${r.no||''}</td><td>${r.doc_date||''}</td><td>${r.due||''}</td><td>${r.status||''}</td>`;
    tb.appendChild(tr);
  });
}
function exportBookCSV(){
  const period = _otdAskExportPeriod();
  if(!period) return;
  const rows=bookRows().filter(r=>_otdInPeriod(r.date, period));
  if(!rows.length){ alert(TT('alerts.no_data_period', null, 'Нет данных за этот период.')); return; }
  const head=['date','source','account','counterparty','description','amount','currency','doc_type','doc_no','doc_date','due_date','status'];
  const rowsP = rows.filter(r=>_otdInPeriod(r.date, period));
  if(!rowsP.length){ alert(TT('alerts.no_data_period', null, 'Нет данных за этот период.')); return; }
  const csv=[head.join(',')].concat(rowsP.map(r=>[
    r.date,r.source,r.account,(r.counterparty||'').replace(/,/g,' '),(r.desc||'').replace(/,/g,' '),
    (r.amount||0).toFixed(2),r.currency,r.type||'',r.no||'',r.doc_date||'',r.due||'',(r.status||'').replace(/,/g,' ')
  ].join(','))).join('\n');
  const blob=new Blob([csv],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`otd_book_${period.label}.csv`; a.click();
}


function exportTxCSV(){
  const period = _otdAskExportPeriod();
  if(!period) return;
  const head=['date','account','counterparty','description','amount','currency','status'];
  const rows = (tx||[]).map(r=>({
    date: toISO(getVal(r,["Data księgowania","Data","date","Дата"]))||today(),
    account: getVal(r,["ID konta","IBAN","account"])||'UNKNOWN',
    counterparty: getVal(r,["Kontrahent","Counterparty"])||'',
    desc: getVal(r,["Tytuł/Opis","Opis","title"])||'',
    amount: asNum(getVal(r,["Kwota","Kwota","amount","Kwota_raw"]))||0,
    currency: (getVal(r,["Waluta","currency"])||'PLN').toUpperCase(),
    status: getVal(r,["Status transakcji","status"])||''
  }));
  const rowsP = rows.filter(r=>_otdInPeriod(r.date, period));
  if(!rowsP.length){ alert(TT('alerts.no_data_period', null, 'Нет данных за этот период.')); return; }
  const csv=[head.join(',')].concat(rowsP.map(r=>[
    r.date,
    r.account,
    (r.counterparty||'').replace(/,/g,' '),
    (r.desc||'').replace(/,/g,' '),
    (r.amount||0).toFixed(2),
    r.currency,
    (r.status||'').replace(/,/g,' ')
  ].join(','))).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`otd_statement_${period.label}.csv`; a.click();
}

function exportBillsCSV(){
  const period = _otdAskExportPeriod();
  if(!period) return;
  const head=['due_date','invoice_no','supplier','amount','currency','status'];
  const rows = (bills||[]).map(b=>({
    due: toISO(getVal(b,["Termin płatności","Termin"]))||'',
    no: getVal(b,["Numer faktury","Invoice number"])||'',
    supplier: getVal(b,["Dostawca","Supplier"])||'',
    amount: asNum(getVal(b,["Kwota do zapłaty","Kwota","Kwота"]))||0,
    currency: (getVal(b,["Waluta","currency"])||'PLN').toUpperCase(),
    status: getVal(b,["Status faktury","Status"])||''
  }));
  const rowsP = rows.filter(r=>_otdInPeriod(r.date, period));
  if(!rowsP.length){ alert(TT('alerts.no_data_period', null, 'Нет данных за этот период.')); return; }
  const csv=[head.join(',')].concat(rowsP.map(r=>[
    r.due,
    r.no,
    (r.supplier||'').replace(/,/g,' '),
    (r.amount||0).toFixed(2),
    r.currency,
    (r.status||'').replace(/,/g,' ')
  ].join(','))).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`otd_invoices_${period.label}.csv`; a.click();
}

function exportCashCSV(){
  const period = _otdAskExportPeriod();
  if(!period) return;
  const head=['date','type','amount','source','comment'];
  const rows = (kasa||[]).map(k=>({
    date: k.date||today(),
    type: k.type||'',
    amount: (k.type==='wydanie'?-1:1)*Math.abs(k.amount||0),
    source: k.source||'manual',
    comment: k.comment||''
  }));
  const rowsP = rows.filter(r=>_otdInPeriod(r.date, period));
  if(!rowsP.length){ alert(TT('alerts.no_data_period', null, 'Нет данных за этот период.')); return; }
  const csv=[head.join(',')].concat(rowsP.map(r=>[
    r.date,
    r.type,
    (r.amount||0).toFixed(2),
    (r.source||'').replace(/,/g,' '),
    (r.comment||'').replace(/,/g,' ')
  ].join(','))).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`otd_cash_${period.label}.csv`; a.click();
}


