// Extracted from public/js/app/app.js (lines 3516-3554)
/* ==== MONEY / RATES ==== */
function rate(cur){
  cur=String(cur||"PLN").toUpperCase();
  if(cur==='PLN') return 1;
  if(cur==='EUR') return asNum(localStorage.getItem('rateEUR')||4.3);
  if(cur==='USD') return asNum(localStorage.getItem('rateUSD')||3.95);
  return 1;
}
function computeAccountBalance(accId){
  const rows=tx.filter(r=> (getVal(r,["ID konta","IBAN","account","ID"])||"UNKNOWN")===accId);
  const withSaldo = rows.filter(r=> getVal(r,["Saldo po operacji","Saldo","saldo"]));
  if(withSaldo.length){ const last=withSaldo[withSaldo.length-1]; return asNum(getVal(last,["Saldo po operacji","Saldo","saldo"])); }
  const start=Number((accMeta[accId]||{}).start||0);
  const sum=rows.reduce((s,r)=> s+asNum(getVal(r,["Kwota","Kwота","amount","Kwota_raw"])) ,0);
  return start+sum;
}
function bankAvailablePLN(){
  let sum=0;
  Object.values(accMeta).filter(a=>a.include).forEach(a=>{
    sum+=computeAccountBalance(a.id)*rate(a.currency);
  });
  return sum;
}
function kasaBalance(){
  let bal=0;
  kasa.forEach(k=>{
    if(k.type==='przyjęcie') bal+=k.amount;
    if(k.type==='wydanie') bal-=k.amount;
    if(k.type==='zamknięcie') bal = k.amount;
  });
  return bal;
}
function availableTotal(){
  const auto = localStorage.getItem('autoCash')==='1';
  const manual = asNum(localStorage.getItem('cashPLN')||0);
  const kas = kasaBalance();
  return auto ? (bankAvailablePLN()+kas) : (manual+kas);
}

