// Extracted from public/js/app/app.js (lines 3555-3604)
/* ==== AI MATCH (unchanged core scoring) ==== */
function normName(s){s=(s||"").toString().toLowerCase().replace(/[.,]/g," ").replace(/\s+/g," ").trim();["sp z oo","sp. z o.o.","spolka","spółka","sa","s.a","ooo"].forEach(t=>s=s.replace(t,""));return s}
function nameSimilar(a,b){a=normName(a);b=normName(b);if(!a||!b) return 0;if(a===b) return 1;if(a.includes(b)||b.includes(a)) return 0.8;return 0}
function scoreMatch(bill,tr){
  let score=0;
  const bAmt=asNum(getVal(bill,["Kwota do zapłaty","Kwота do заплаты","Kwota","amount"]));
  const tAmt=Math.abs(asNum(getVal(tr,["Kwota","Kwота","amount","Kwota_raw"])));
  const bCur=(getVal(bill,["Waluta","currency"])||"").toUpperCase();
  const tCur=(getVal(tr,["Waluta","currency"])||"").toUpperCase();
  if(bAmt>0 && tAmt>0 && Math.abs(bAmt-tAmt)<0.01 && (bCur===tCur || !bCur || !tCur)) score+=60;
  const inv=String(getVal(bill,["Numer faktury","Numer фактуры","Invoice number"])||"").toLowerCase();
  const desc=String(getVal(tr,["Tytuł/Opis","Opis","Title","description"])||"").toLowerCase();
  if(inv && desc.includes(inv)) score+=25;
  if(nameSimilar(getVal(bill,["Dostawca","Supplier"]), getVal(tr,["Kontrahent","Counterparty"]))>=0.8) score+=10;
  if(asNum(getVal(tr,["Kwota","amount"]))<0) score+=5;
  return {score:Math.min(100,score)};
}
function runAI(){
  bills.forEach(b=>{
    const status=String(getVal(b,["Status faktury","Status фактуры","Status"])||"").toLowerCase();
    if(status.includes("opłacone")||status.includes("paid")||status.includes("оплачено")) return;
    let best=null;
    tx.forEach(t=>{
      if(String(getVal(t,["Status transakcji","status"])||"").toLowerCase()==="sparowane") return;
      if(asNum(getVal(t,["Kwota","amount"]))>=0) return;
      const s=scoreMatch(b,t);
      if(!best || s.score>best.s) best={t,s:s.score};
    });
    if(best && best.s>=85){
      best.t["Status transakcji"]="Sparowane";
      best.t["Powiązana faktura (ID)"]=getVal(b,["Numer faktury","Numer фактуры"]);
      b["Status faktury"]="Opłacone"; b["Data płatności"]=today();
    }else if(best && best.s>=55){
      b["Kandydat (AI)"]=getVal(best.t,["ID transakcji"]);
      b["AI score"]=best.s;
    }else{ b["Kandydat (AI)"]=""; b["AI score"]=""; }
  });
  render(); saveLocal(); pushState();
}
function acceptSafe(){
  bills.filter(b=> Number(getVal(b,["AI score"])||0)>=85).forEach(b=>{
    const t=tx.find(t=> getVal(t,["ID transakcji"])===getVal(b,["Kandydat (AI)"]));
    if(!t) return;
    t["Status transakcji"]="Sparowane";
    t["Powiązana faktura (ID)"]=getVal(b,["Numer faktury","Numer фактуры"]);
    b["Status faktury"]="Opłacone"; b["Data płatności"]=today(); b["Kandydat (AI)"]=b["AI score"]="";
  });
  render(); saveLocal(); pushState();
}

