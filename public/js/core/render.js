// Extracted from public/js/app/app.js (lines 4609-5051)
/* ==== RENDER ==== */
function renderKasa(){
  const tb=document.querySelector('#kasaTable tbody'); if(!tb) return; tb.innerHTML='';
  const listKasa=(kasa||[]).slice().reverse();
  listKasa.forEach((k,i)=>{
    const tr=document.createElement('tr');
    const catId = k.category || "";
    tr.innerHTML = `<td>${listKasa.length - i}</td>
      <td>${k.date||today()}</td>
      <td>${k.type||""}</td>
      <td>${Number(k.amount||0).toFixed(2)}</td>
      <td>${k.source||""}</td>
      <td>
        <button data-act="cat" data-kind="kasa" data-id="${k.id}" class="btn ghost" style="padding:4px 8px;font-size:12px">${formatCatLabel(catId)}</button>
      </td>
      <td>${k.comment||""}</td>
      <td class="actions">
        <button data-act="edit" data-kind="kasa" data-id="${k.id}">✎</button>
        <button data-act="del" data-kind="kasa" data-id="${k.id}">🗑</button>
      </td>`;
    tb.appendChild(tr);
  });
  // Qalta-style feed + big numbers (doesn't affect legacy table)
  try{ renderKasaQalta(listKasa); }catch(e){ console.warn('renderKasaQalta', e); }

}
function renderAccounts(){
  const tb=document.querySelector('#autoAcc tbody'); if(!tb) return; tb.innerHTML='';
  accMeta = accMeta && typeof accMeta === 'object' ? accMeta : {};

  // NOTE: accMeta is an object keyed by accountId. Values may not have `.id`.
  Object.entries(accMeta).forEach(([id, metaRaw])=>{
    const a = (metaRaw && typeof metaRaw === 'object') ? metaRaw : (accMeta[id] = {});
    // sane defaults (prevents "undefined" UI and broken handlers)
    if(!a.type) a.type = 'Biznes';
    if(!a.currency) a.currency = 'PLN';
    if(a.start==null) a.start = 0;
    if(a.include==null) a.include = true;

    const displayName = (a.name!=null && String(a.name).trim()!=='') ? String(a.name) : String(id);
    const bal = computeAccountBalance(id);

    const tr=document.createElement('tr');
    tr.innerHTML = `
      <td>
        <input type="text" class="acc-name" data-id="${escapeHtml(id)}" value="${escapeHtml(displayName)}"
               placeholder="${escapeHtml(id)}" style="width:100%;min-width:140px"/>
      </td>
      <td><select data-id="${escapeHtml(id)}" class="acc-type">
            <option ${a.type==="Biznes"?"selected":""}>Biznes</option>
            <option ${a.type==="Osobisty"?"selected":""}>Osobisty</option>
          </select></td>
      <td><select data-id="${escapeHtml(id)}" class="acc-cur">
            <option ${a.currency==="PLN"?"selected":""}>PLN</option>
            <option ${a.currency==="EUR"?"selected":""}>EUR</option>
            <option ${a.currency==="USD"?"selected":""}>USD</option>
            <option ${a.currency==="UAH"?"selected":""}>UAH</option>
          </select></td>
      <td>${asNum(bal).toFixed(2)}</td>
      <td><input type="number" step="0.01" value="${escapeHtml(a.start||0)}" class="acc-start" data-id="${escapeHtml(id)}"/></td>
      <td><input type="checkbox" class="acc-include" data-id="${escapeHtml(id)}" ${a.include?"checked":""}/></td>`;
    tb.appendChild(tr);
  });

  tb.querySelectorAll(".acc-name").forEach(el=>el.addEventListener("change",e=>{
    const id = e.target.dataset.id;
    if(!id) return;
    accMeta[id] = accMeta[id] && typeof accMeta[id] === 'object' ? accMeta[id] : {};
    const v = String(e.target.value||'').trim();
    if(!v || v===id) delete accMeta[id].name; else accMeta[id].name = v;
    saveLocal(); render(); pushState();
  }));
  tb.querySelectorAll(".acc-type").forEach(el=>el.addEventListener("change",e=>{accMeta[e.target.dataset.id] = accMeta[e.target.dataset.id]||{}; accMeta[e.target.dataset.id].type=e.target.value;saveLocal();render();pushState();}));
  tb.querySelectorAll(".acc-cur").forEach(el=>el.addEventListener("change",e=>{accMeta[e.target.dataset.id] = accMeta[e.target.dataset.id]||{}; accMeta[e.target.dataset.id].currency=e.target.value;saveLocal();render();pushState();}));
  tb.querySelectorAll(".acc-start").forEach(el=>el.addEventListener("change",e=>{accMeta[e.target.dataset.id] = accMeta[e.target.dataset.id]||{}; accMeta[e.target.dataset.id].start=asNum(e.target.value);saveLocal();render();pushState();}));
  tb.querySelectorAll(".acc-include").forEach(el=>el.addEventListener("change",e=>{accMeta[e.target.dataset.id] = accMeta[e.target.dataset.id]||{}; accMeta[e.target.dataset.id].include=e.target.checked;saveLocal();render();pushState();}));
}

function openCloseDayModal(){
  try{
    const t = today();
    const tt = new Date(t);
    // Today summary (recalculated)
    let inSum = 0, outSum = 0;
    (tx||[]).forEach(r=>{
      const d = toISO(getVal(r,["Data księgowania","Data","date","Дата"]));
      if(!d || d!==t) return;
      const amt = asNum(getVal(r,["Kwota","Kwота","amount","Kwota_raw"])||0);
      if(amt>0) inSum+=amt; else outSum+=amt;
    });
    (kasa||[]).forEach(k=>{
      const d = String(k.date||"").slice(0,10);
      if(!d || d!==t) return;
      const typ = String(k.type||"").toLowerCase();
      const raw = Number(k.amount||0);
      const amt = Math.abs(raw||0);
      if(!amt) return;
      // 'zamknięcie' sets absolute cash balance, it's not a movement
      if(typ==="zamknięcie" || typ==="zamkniecie" || typ==="close") return;
      if(typ==="przyjęcie" || typ==="przyjecie" || typ==="in" || typ==="income") { inSum += amt; return; }
      if(typ==="wydanie" || typ==="out" || typ==="expense") { outSum -= amt; return; }
      // fallback: treat negative as outflow
      if(raw>0) inSum += raw; else outSum += raw;
    });
    const net = inSum+outSum;

    // Obligations 7 / 30
    let sum7 = 0, sum30 = 0;
    (bills||[]).forEach(r=>{
      const s = String(getVal(r,["Status faktury","Status фактуры","Status"])||"").toLowerCase();
      if(!["do zapłaty","przeterminowane","к оплате","просрочено","to pay"].includes(s)) return;
      const cur = String(getVal(r,["Waluta","Waluta "])||"").toUpperCase();
      if(cur!=="PLN") return;
      const di = toISO(getVal(r,["Termin płatności","Termin","Termin платності"]));
      if(!di) return;
      const dd = new Date(di);
      const diff = (dd-tt)/86400000;
      if(diff<0) return;
      const amt = asNum(getVal(r,["Kwota do zapłaty","Kwota","Kwота"])||0);
      if(diff<=7) sum7 += amt;
      if(diff<=30) sum30 += amt;
    });

    const availVal = availableTotal();

    const elToday = $id('cd_today');
    if(elToday){
      if(!inSum && !outSum){
        elToday.textContent = 'Dziś: brak ruchów (bank + kasa).';
      }else{
        elToday.textContent = `Dziś: przychód ${inSum.toFixed(2)} PLN, wydatki ${Math.abs(outSum).toFixed(2)} PLN, wynik ${(net>=0?'+':'-')+Math.abs(net).toFixed(2)} PLN.`;
      }
    }

    const elObl = $id('cd_oblig');
    if(elObl){
      elObl.textContent = `Płatności: w 7 dni ${sum7.toFixed(2)} PLN, w 30 dni ${sum30.toFixed(2)} PLN.`;
    }

    const elRisk = $id('cd_risk');
    if(elRisk){
      if(sum7===0 && sum30===0){
        elRisk.textContent = 'Status: 🟢 Brak zobowiązań w 30 dni.';
      }else if(availVal >= sum30){
        elRisk.textContent = 'Status: 🟢 Bezpiecznie (pokryte 30 dni).';
      }else if(availVal >= sum7){
        elRisk.textContent = 'Status: 🟡 Uwaga (pokryte 7 dni, brak 30 dni).';
      }else{
        elRisk.textContent = 'Status: 🔴 Ryzyko (brak środków na 7 dni).';
      }
    }

    const elTarget = $id('cd_target');
    if(elTarget){
      if(sum30>0){
        const avgNeed = sum30/30;
        elTarget.textContent = `Cel na jutro: przynajmniej ${avgNeed.toFixed(2)} PLN dziennego wyniku, aby pokryć zobowiązania 30 dni.`;
      }else{
        elTarget.textContent = 'Cel na jutro: utrzymaj dodatni wynik dnia.';
      }
    }

    const modal = $id('closeDayModal');
    if(modal){
      modal.classList.add('show');
    }
  }catch(e){
    console.warn('close day error', e);
  }
}

function closeCloseDayModal(){
  const modal = $id('closeDayModal');
  if(modal){
    modal.classList.remove('show');
  }
}


function runAIAll(){
  try{
    if(typeof runAI==='function') runAI();
    if(typeof acceptSafe==='function') acceptSafe();
  }catch(e){
    console.warn('runAIAll error', e);
  }
}

function openAddTodayModal(){
  const modal = $id('addTodayModal');
  if(modal){
    modal.classList.add('show');
  }
}

function closeAddTodayModal(){
  const modal = $id('addTodayModal');
  if(modal){
    modal.classList.remove('show');
  }
}

function goAddBank(){
  const tab = document.querySelector('.tabs .tab[data-sec="wyciag"]');
  if(tab) tab.click();
  closeAddTodayModal();
}

function goAddCash(){
  const tab = document.querySelector('.tabs .tab[data-sec="kasa"]');
  if(tab) tab.click();
  closeAddTodayModal();
}

function goAddBills(){
  const tab = document.querySelector('.tabs .tab[data-sec="faktury"]');
  if(tab) tab.click();
  closeAddTodayModal();
}

function render(){
  // KPIs
  const dueToday=(bills||[]).filter(r=>{
    const s=String(getVal(r,["Status faktury","Status фактуры","Status"])||"").toLowerCase();
    return ["do zapłaty","przeterminowane","к оплате","просрочено","to pay"].includes(s) &&
           toISO(getVal(r,["Termin płatności","Termin","Termin платності"]))===today();
  }).length;
  const unmatch=(tx||[]).filter(r=> String(getVal(r,["Status transakcji","status"])||"").toLowerCase()!=="sparowane").length;
  $id('kpiDue')&&( $id('kpiDue').textContent = dueToday );
  $id('kpiUnmatch')&&( $id('kpiUnmatch').textContent = unmatch );
  const bankPLN=bankAvailablePLN(); $id('kpiBank')&&( $id('kpiBank').textContent = bankPLN.toFixed(2) );
  const kas=kasaBalance(); $id('kpiCash')&&( $id('kpiCash').textContent = kas.toFixed(2) );
  const avail=availableTotal(); $id('kpiAvail')&&( $id('kpiAvail').textContent = avail.toFixed(2) );
  const sumDue=(bills||[]).filter(r=>
    String((getVal(r,["Waluta","Waluta "])||"").toUpperCase())==="PLN" &&
    toISO(getVal(r,["Termin płatności","Termin","Termin платності"]))<=today() &&
    ["do zapłaty","przeterminowane","к оплате","просрочено"].includes(String(getVal(r,["Status faktury","Status"])||"").toLowerCase())
  ).reduce((s,r)=> s+asNum(getVal(r,["Kwota do zapłaty","Kwota","Kwота"])||0),0);
  $id('kpiGap')&&( $id('kpiGap').textContent = Math.max(0,sumDue-avail).toFixed(2) );

  

  // Today summary (bank + cash)
  try{
    const t = today();
    let inSum = 0, outSum = 0;
    (tx||[]).forEach(r=>{
      const d = toISO(getVal(r,["Data księgowania","Data","date","Дата"]));
      if(!d || d!==t) return;
      const amt = asNum(getVal(r,["Kwota","Kwота","amount","Kwota_raw"])||0);
      if(amt>0) inSum+=amt; else outSum+=amt;
    });
    (kasa||[]).forEach(k=>{
      const d = String(k.date||"").slice(0,10);
      if(!d || d!==t) return;
      const typ = String(k.type||"").toLowerCase();
      const raw = Number(k.amount||0);
      const amt = Math.abs(raw||0);
      if(!amt) return;
      // 'zamknięcie' sets absolute cash balance, it's not a movement
      if(typ==="zamknięcie" || typ==="zamkniecie" || typ==="close") return;
      if(typ==="przyjęcie" || typ==="przyjecie" || typ==="in" || typ==="income") { inSum += amt; return; }
      if(typ==="wydanie" || typ==="out" || typ==="expense") { outSum -= amt; return; }
      // fallback: treat negative as outflow
      if(raw>0) inSum += raw; else outSum += raw;
    });
    const net = inSum+outSum;
    if($id('todayIn'))  $id('todayIn').textContent  = inSum ? inSum.toFixed(2)+' PLN' : '—';
    if($id('todayOut')) $id('todayOut').textContent = outSum ? Math.abs(outSum).toFixed(2)+' PLN' : '—';
    if($id('todayNet')) $id('todayNet').textContent = net ? ((net>=0?'+':'-')+Math.abs(net).toFixed(2)+' PLN') : '—';
  }catch(e){ console.warn('today summary error', e); }

  // Obligations 7 / 30 days (PLN, only unpaid)
  try{
    const t = today();
    const tt = new Date(t);
    let sum7 = 0, sum30 = 0;
    const upcoming = [];
    (bills||[]).forEach(r=>{
      const s = String(getVal(r,["Status faktury","Status фактуры","Status"])||"").toLowerCase();
      if(!["do zapłaty","przeterminowane","к оплате","просрочено","to pay"].includes(s)) return;
      const cur = String(getVal(r,["Waluta","Waluta "])||"").toUpperCase();
      if(cur!=="PLN") return;
      const di = toISO(getVal(r,["Termin płatności","Termin","Termin платності"]));
      if(!di) return;
      const dd = new Date(di);
      const diff = (dd-tt)/86400000;
      if(diff<0) return;
      const amt = asNum(getVal(r,["Kwota do zapłaty","Kwota","Kwота"])||0);
      const who = String(getVal(r,["Dostawca","Kontrahent","Supplier"])||"");
      if(diff<=7) sum7 += amt;
      if(diff<=30) sum30 += amt;
      if(diff<=30) upcoming.push({di, amt, who});
    });
    if($id('oblig7'))  $id('oblig7').textContent  = sum7 ? sum7.toFixed(2)+' PLN' : '—';
    if($id('oblig30')) $id('oblig30').textContent = sum30 ? sum30.toFixed(2)+' PLN' : '—';

    const availVal = typeof avail==='number' ? avail : availableTotal();

    // Risk light
    const riskEl = $id('riskLight');
    if(riskEl){
      if(sum7===0 && sum30===0){
        riskEl.textContent = '🟢 Brak zobowiązań w 30 dni';
      }else{
        if(availVal >= sum30){
          riskEl.textContent = '🟢 Bezpiecznie (pokryte 30 dni)';
        }else if(availVal >= sum7){
          riskEl.textContent = '🟡 Uwaga (pokryte 7 dni, brak 30 dni)';
        }else{
          riskEl.textContent = '🔴 Ryzyko (brak środków na 7 dni)';
        }
      }
    }

    // Days of safety
    const daysEl = $id('daysSafe');
    if(daysEl){
      if(sum30>0){
        const dailyNeed = sum30/30;
        const days = dailyNeed>0 ? Math.floor(availVal/dailyNeed) : 0;
        if(days>=30) daysEl.textContent = 'Dni bezpieczeństwa: ≥30';
        else if(days>=7) daysEl.textContent = 'Dni bezpieczeństwa: '+days;
        else daysEl.textContent = 'Dni bezpieczeństwa: <7';
      }else if(sum7>0){
        const dailyNeed = sum7/7;
        const days = dailyNeed>0 ? Math.floor(availVal/dailyNeed) : 0;
        if(days>=7) daysEl.textContent = 'Dni bezpieczeństwa: ≥7';
        else daysEl.textContent = 'Dni bezpieczeństwa: <7';
      }else{
        daysEl.textContent = 'Dni bezpieczeństwa: brak zobowiązań';
      }
    }

    // Hide safety pill when there are no upcoming obligations
    if(daysEl){
      try{ daysEl.style.display = (sum7===0 && sum30===0) ? 'none' : ''; }catch(e){}
    }

    // Next payments (3 nearest within 30 days)
    const nextEl = $id('nextPayments');
    if(nextEl){
      if(!upcoming.length){
        nextEl.textContent = 'Brak nadchodzących płatności w 30 dni.';
      }else{
        upcoming.sort((a,b)=>a.di.localeCompare(b.di));
        const top3 = upcoming.slice(0,3);
        nextEl.innerHTML = top3.map(x=>{
          const d = x.di;
          const a = (x.amt||0).toFixed(2)+' PLN';
          const w = x.who ? (' – '+x.who.replace(/</g,'&lt;').replace(/>/g,'&gt;')) : '';
          return d+' | '+a+w;
        }).join('<br>');
      }
    }
  }catch(e){ console.warn('obligations summary error', e); }

  // Last 7 days insight
  try{
    const t = today();
    const tt = new Date(t);
    const from = new Date(tt.getTime()-6*86400000);
    let in7 = 0, out7 = 0;
    const inRange = (dstr)=>{
      if(!dstr) return false;
      const d = new Date(dstr);
      return d>=from && d<=tt;
    };
    (tx||[]).forEach(r=>{
      const d = toISO(getVal(r,["Data księgowania","Data","date","Дата"]));
      if(!inRange(d)) return;
      const amt = asNum(getVal(r,["Kwota","Kwота","amount","Kwota_raw"])||0);
      if(amt>0) in7+=amt; else out7+=amt;
    });
    (kasa||[]).forEach(k=>{
      const d = String(k.date||"").slice(0,10);
      if(!inRange(d)) return;
      const typ = String(k.type||"").toLowerCase();
      const raw = Number(k.amount||0);
      const amt = Math.abs(raw||0);
      if(!amt) return;
      // 'zamknięcie' sets absolute cash balance, it's not a movement
      if(typ==="zamknięcie" || typ==="zamkniecie" || typ==="close") return;
      if(typ==="przyjęcie" || typ==="przyjecie" || typ==="in" || typ==="income") { in7 += amt; return; }
      if(typ==="wydanie" || typ==="out" || typ==="expense") { out7 -= amt; return; }
      // fallback: treat negative as outflow
      if(raw>0) in7 += raw; else out7 += raw;
    });
    const net7 = in7+out7;
    const el = $id('last7Text');
    if(el){
      if(!in7 && !out7){
        el.textContent = 'Brak danych za ostatnie 7 dni.';
      }else{
        el.textContent = `Ostatnie 7 dni: przychód ${in7.toFixed(2)} PLN, wydatki ${Math.abs(out7).toFixed(2)} PLN, wynik ${(net7>=0?'+':'-')+Math.abs(net7).toFixed(2)} PLN.`;
      }
    }
  }catch(e){ console.warn('last7 summary error', e); }

// TX table
  const txBody=document.querySelector('#txTable tbody'); if(txBody){
    txBody.innerHTML='';
    const listTx=(tx||[]).slice().reverse();
    listTx.forEach(r=>{
      const id=getVal(r,["ID transakcji","ID","id"])||("noid-"+Math.random());
      const curStr = getVal(r,["Waluta","currency"])||''; const cur = detectCurrency(curStr);
      const catId = getVal(r,["Kategoria","Category","category"]) || "";
      const tr=document.createElement('tr');
      tr.innerHTML = `<td>${toISO(getVal(r,["Data księgowania","Data","date","Дата"]))}</td>
        <td>${getVal(r,["ID konta","IBAN","account"])||"—"}</td>
        <td>${getVal(r,["Kontrahent","Counterparty"])||""}</td>
        <td>${getVal(r,["Tytuł/Opis","Opis","title"])||""}</td>
        <td>
          <button data-act="cat" data-kind="tx" data-id="${id}" class="btn ghost" style="padding:4px 8px;font-size:12px">${formatCatLabel(catId)}</button>
        </td>
        <td>${fmtAmountRaw(getVal(r,["Kwota","Kwота","amount","Kwota_raw"]))}</td>
        <td>${cur}</td>
        <td>${getVal(r,["Status transakcji","status"])||""}</td>
        <td class="actions">
          <button data-act="edit" data-kind="tx" data-id="${id}">✎</button>
          <button data-act="del" data-kind="tx" data-id="${id}">🗑</button>
        </td>`;
      txBody.appendChild(tr);
    });
  }

  // Bills
  const billBody=document.querySelector('#billTable tbody'); if(billBody){
    billBody.innerHTML='';
    const listBills=(bills||[]).slice().reverse();
    listBills.forEach(r=>{
      const s=String(getVal(r,["Status faktury","Status фактуры","Status"])||"").toLowerCase();
      const cls=(s.includes('przetermin')||s.includes('проср'))?'overdue':'due';
      const cand=getVal(r,["Kandydat (AI)"])||"";
      const score=getVal(r,["AI score"])||"";
      const id=getVal(r,["Numer faktury","Numer фактуры","Invoice number"])||("noinv-"+Math.random());
      const cur = detectCurrency(getVal(r,["Waluta","currency"])||'');
      const catId = getVal(r,["Kategoria","Category","category"]) || "";
      const tr=document.createElement('tr');
      tr.innerHTML = `<td>${toISO(getVal(r,["Termin płatności","Termin","Termin платності"])||"")}</td>
        <td>${getVal(r,["Numer faktury","Numer фактуры","Invoice number"])||""}</td>
        <td>${getVal(r,["Dostawca","Supplier"])||""}</td>
        <td>${getVal(r,["Kwota do zapłaty","Kwota","Kwota"])||""}</td>
        <td>${cur}</td>
        <td>
          <button data-act="cat" data-kind="bill" data-id="${id}" class="btn ghost" style="padding:4px 8px;font-size:12px">${formatCatLabel(catId)}</button>
        </td>
        <td><span class="badge ${cls}">${getVal(r,["Status faktury","Status фактуры","Status"])||""}</span></td>
        <td>${cand?('<span class="badge cand">'+cand+'</span>'):'—'}</td>
        <td>${score?('<span class="badge ai">'+score+'</span>'):'—'}</td>
        <td class="actions">
          ${cand?('<button class="btn secondary btn-accept" data-invid="'+id+'">OK</button>'):''}
          <button data-act="pay" data-kind="bill" data-id="${id}">✓</button>
          <button data-act="edit" data-kind="bill" data-id="${id}">✎</button>
          <button data-act="del" data-kind="bill" data-id="${id}">🗑</button>
        </td>`;
      billBody.appendChild(tr);
    });
    document.querySelectorAll(".btn-accept").forEach(b=> b.addEventListener('click',()=>acceptOne(b.getAttribute('data-invid'))));
  }

  try{ renderTrendChart(); }catch(e){ console.warn('trend', e); }
  try{ renderSpendingPanel(); }catch(e){ console.warn('spend', e); }
  try{ fillQuickCashCat(); }catch(e){ console.warn('quick cat', e); }
  renderMinPay(); renderForecast(); renderAccounts(); renderKasa(); renderBook(); updateSubUI(); gateAccess();
}

