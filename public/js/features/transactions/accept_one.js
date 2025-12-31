// Extracted from public/js/app/app.js (lines 5131-5141)
/* ==== ACCEPT ONE ==== */
function acceptOne(id){
  const b=(bills||[]).find(x=> (getVal(x,["Numer faktury","Numer фактуры","Invoice number"])||"")===id);
  if(!b) return;
  const t=(tx||[]).find(x=> (getVal(x,["ID transakcji","ID","id"])||"")=== (getVal(b,["Kandydat (AI)"])||""));
  if(!t) return;
  t["Status transakcji"]="Sparowane"; t["Powiązana faktura (ID)"]=getVal(b,["Numer faktury","Numer фактуры"]);
  b["Status faktury"]="Opłacone"; b["Data płatności"]=today(); b["Kandydat (AI)"]=b["AI score"]="";
  render(); saveLocal(); pushState();
}

