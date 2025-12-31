// Extracted from public/js/app/app.js (lines 5052-5130)
/* ==== PLAN / FORECAST / MINPAY (kept) ==== */
function toDueList(mode){
  const t=today(); const excl=$id('excludeBlacklist')?.checked||false;
  return bills.filter(r=>{
    const s=String(getVal(r,["Status faktury","Status фактуры","Status"])||"").toLowerCase();
    if(!["do zapłaty","przeterminowane","к оплате","просрочено","to pay"].includes(s)) return false;
    const d=toISO(getVal(r,["Termin płatności","Termin","Termin платності"])); if(!d) return false;
    if(mode==='today') return d===t;
    if(mode==='7d'){ const dd=new Date(d), tt=new Date(t); return (dd-tt)/86400000 <= 7; }
    return true;
  }).filter(r=>{
    if(String((getVal(r,["Waluta"])||"").toUpperCase())!=="PLN") return false;
    if(excl){
      const bl=(localStorage.getItem('blacklist')||"").toLowerCase();
      const nm=(getVal(r,["Dostawca","Supplier"])||"").toLowerCase();
      if(bl && bl.split(",").some(x=> nm.includes(x.trim()))) return false;
    }
    return true;
  });
}
function buildPlan(){
  const mode=$id('planFilter')?.value||'7d';
  const cand=toDueList(mode).sort((a,b)=>{
    const da=new Date(toISO(getVal(a,["Termin płatności","Termin","Termin платності"])||today()));
    const db=new Date(toISO(getVal(b,["Termin płatności","Termin","Termin платності"])||today()));
    const lateA=da<new Date(today()), lateB=db<new Date(today());
    if(lateA!==lateB) return lateB-lateA;
    return asNum(getVal(b,["Kwota do zapłaty","Kwota"])) - asNum(getVal(a,["Kwota do zapłaty","Kwota"]));
  });
  let left=availableTotal(); const plan=[];
  for(const r of cand){
    const amt=asNum(getVal(r,["Kwota do zapłaty","Kwota"])||0);
    if(amt<=left){ plan.push({r,amt,reason:(toISO(getVal(r,["Termin płatności","Termin"])||today())<today()?"просрочка":"срок")}); left-=amt; }
  }
  return {plan,left,avail:availableTotal()};
}
function renderPlan(){
  const p=buildPlan(); const tb=document.querySelector('#planTable tbody'); if(!tb) return; tb.innerHTML='';
  p.plan.forEach((x,i)=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${i+1}</td><td>${getVal(x.r,["Numer faktury","Numer фактуры"])||""}</td><td>${getVal(x.r,["Dostawca","Supplier"])||""}</td><td>${toISO(getVal(x.r,["Termin płatności","Termin"])||"")}</td><td>${x.amt.toFixed(2)}</td><td>${x.reason}</td>`;
    tb.appendChild(tr);
  });
  const pm=$id('planMeta'); if(pm) pm.textContent = p.plan.length?`Wydamy ${(p.avail-p.left).toFixed(2)} z ${p.avail.toFixed(2)} PLN. Zostanie ${p.left.toFixed(2)} PLN.`:"Plan pusty lub brak środków.";
}
function computeMinPay(){
  const t=today(); const pct=asNum(localStorage.getItem('penaltyPct')||0.05)/100.0;
  const cand=bills.filter(r=>
    String((getVal(r,["Waluta"])||"").toUpperCase())==="PLN" &&
    toISO(getVal(r,["Termin płatności","Termin"])||"")<=t &&
    ["do zapłaty","przeterminowane","к оплате","просрочено"].includes(String(getVal(r,["Status faktury","Status"])||"").toLowerCase())
  ).map(r=>({r,amt:asNum(getVal(r,["Kwota do zapłaty","Kwota"])||0),risk:asNum(getVal(r,["Kwota do zapłaty","Kwota"])||0)*pct}))
   .sort((a,b)=> b.risk-a.risk || b.amt-a.amt);
  return cand[0]||null;
}
function renderMinPay(){
  const m=computeMinPay(); const el=$id('minPayBox'); if(!el) return;
  if(!m){ el.textContent='—'; return; }
  el.textContent = `Оплатить ${getVal(m.r,["Numer faktury","Numer фактуры"])} (${getVal(m.r,["Dostawca","Supplier"])} ) на ${m.amt.toFixed(2)} PLN. Штраф/день ~ ${m.risk.toFixed(2)} PLN.`;
}
function renderForecast(){
  const t=new Date(today());
  const list=toDueList("7d").map(r=>({date:new Date(toISO(getVal(r,["Termin płatności","Termin"]))), amt:asNum(getVal(r,["Kwota do zapłaty","Kwota"])||0)}));
  const days=[...Array(7)].map((_,i)=> new Date(t.getTime()+i*86400000));
  let left=availableTotal(); const out=days.map(d=>({d,due:0,after:0}));
  list.forEach(x=>{ const idx=Math.min(6, Math.max(0, Math.floor((x.date - t)/86400000))); out[idx].due += x.amt; });
  out.forEach(o=>{ left-=o.due; o.after=left; });
  const wrap=$id('forecastBars'); if(!wrap) return; wrap.innerHTML='';
  out.forEach(o=>{
    const div=document.createElement('div'); div.className='bar'+(o.after<0?' neg':'');
    const h=document.createElement('div'); h.className='h'; h.style.height=(Math.min(120,Math.abs(o.after)/100)*0.8+18)+'px';
    div.innerHTML=`<small>${o.d.toISOString().slice(5,10)}</small>`; div.appendChild(h);
    const v=document.createElement('div'); v.textContent = (o.after<0?'-':'')+Math.abs(o.after).toFixed(0)+' PLN'; div.appendChild(v);
    wrap.appendChild(div);
  });
  const firstNeg=out.find(x=>x.after<0); const meta=$id('forecastMeta');
  if(meta) meta.textContent = firstNeg?`Гэп через ${out.indexOf(firstNeg)+1} дн.: не хватает ${Math.abs(firstNeg.after).toFixed(2)} PLN.`:"На 7 дней хватает кассы.";
}

