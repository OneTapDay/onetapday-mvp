/* OneTapDay AI Tools (local, no server) v17
   Purpose: give "IQ 200" answers by computing from your real data, not hallucinating.
   Reads state from localStorage (tx_manual_import, bills_manual_import, kasa, accMeta).
*/
(function(){
  'use strict';

  function asNum(v){
    const n = Number(String(v==null?'':v).replace(/\s/g,'').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  function normCat(v){
    const s = String(v||'').trim();
    if(!s) return '';
    const low = s.toLowerCase();
    if(s==='—'||s==='–'||s==='-') return '';
    if(low==='bez kategorii'||low==='brak kategorii'||low==='brak'||low==='uncategorized'||low==='no category'||low==='none'||low==='без категории'||low==='без категорії') return '';
    return s;
  }

  function loadJson(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      if(!raw) return fallback;
      return JSON.parse(raw);
    }catch(_){
      return fallback;
    }
  }

  function pick(obj, keys){
    for(const k of keys){
      if(obj && obj[k]!=null && String(obj[k]).trim()!=='') return obj[k];
    }
    return '';
  }

  function getDateISO(v){
    const s = String(v||'').trim();
    if(!s) return '';
    // already ISO
    if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
    // dd.mm.yyyy
    const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
    if(m) return `${m[3]}-${m[2]}-${m[1]}`;
    return s.slice(0,10);
  }

  function toSignedAmountFromTx(r){
    const plus = pick(r, ['Kwota(+)','Kwota (+)','Kwota +','AmountIn','In','przychód','Przychód']);
    const minus= pick(r, ['Kwota(-)','Kwota (-)','Kwota -','AmountOut','Out','wydatek','Wydatek']);
    const any  = pick(r, ['Kwota','Amount','amount','kwota']);
    if(String(plus).trim()!=='') return Math.abs(asNum(plus));
    if(String(minus).trim()!=='') return -Math.abs(asNum(minus));
    const n = asNum(any);
    // if any is provided without sign, treat it as-is
    return n;
  }

  function toSignedAmountFromKasa(k){
    const type = String(pick(k,['type','Typ','TYP','rodzaj'])).toLowerCase();
    const amt = asNum(pick(k,['amount','Kwota','kwota','KWOTA']));
    if(type.includes('wydan') || type.includes('wydatek') || type.includes('out')) return -Math.abs(amt);
    return Math.abs(amt);
  }

  function normalizeTxRow(r){
    const id = String(pick(r,['id','ID transakcji','ID','Id','ID transakcji '])||'').trim();
    const date = getDateISO(pick(r,['Data księgowania','Data','date']));
    const merchant = String(pick(r,['Kontrahent','Tytuł/Opis','Opis','merchant','source','comment','Nazwa','Name'])||'').trim();
    const category = normCat(pick(r,['Kategoria','Category','category']));
    const amount = toSignedAmountFromTx(r);
    const currency = String(pick(r,['Waluta','Currency','currency'])||'PLN').trim() || 'PLN';
    const source = 'wyciag';
    return { kind:'tx', id, date, merchant, category, amount, currency, source, raw:r };
  }

  function normalizeKasaRow(k){
    const id = String(pick(k,['id','ID','Id'])||'').trim();
    const date = getDateISO(pick(k,['date','Data','DATA']));
    const merchant = String(pick(k,['comment','Komentarz','KOMENTARZ','source','Zrodlo','Źródło'])||'').trim();
    const category = normCat(pick(k,['category','Kategoria','Category']));
    const amount = toSignedAmountFromKasa(k);
    const currency = 'PLN';
    const source = String(pick(k,['source','Zrodlo','Źródło'])||'kasa').trim() || 'kasa';
    return { kind:'kasa', id, date, merchant, category, amount, currency, source, raw:k };
  }

  function getAllEntries(){
    const tx = loadJson('tx_manual_import', []);
    const kasa = loadJson('kasa', []);
    const entries = [];
    (Array.isArray(tx)?tx:[]).forEach(r=>{ try{ entries.push(normalizeTxRow(r)); }catch(_){} });
    (Array.isArray(kasa)?kasa:[]).forEach(k=>{ try{ entries.push(normalizeKasaRow(k)); }catch(_){} });
    // bills can be added later (when invoice -> payment linking is stable)
    return entries.filter(e=>e && e.date);
  }

  function daysAgoISO(days){
    const d = new Date();
    d.setDate(d.getDate() - Number(days||0));
    return d.toISOString().slice(0,10);
  }

  function filterByDays(entries, days){
    if(!days) return entries;
    const min = daysAgoISO(days);
    return entries.filter(e=> String(e.date) >= min);
  }

  function sum(entries){ return entries.reduce((a,e)=>a + (Number(e.amount)||0), 0); }

  function groupByCategory(entries){
    const m = new Map();
    for(const e of entries){
      const cat = e.category || '';
      const prev = m.get(cat) || 0;
      m.set(cat, prev + (Number(e.amount)||0));
    }
    return m;
  }

  function topCats(entries, type /* 'spend'|'income' */){
    const filtered = entries.filter(e=>{
      if(type==='spend') return (Number(e.amount)||0) < 0;
      if(type==='income') return (Number(e.amount)||0) > 0;
      return true;
    });
    const m = groupByCategory(filtered);
    const arr = [];
    for(const [cat,val] of m.entries()){
      if(!cat) continue;
      arr.push({ category:cat, amount:val });
    }
    arr.sort((a,b)=> Math.abs(b.amount) - Math.abs(a.amount));
    return arr;
  }

  function uncategorized(entries){
    return entries.filter(e=> !e.category );
  }

  function fmtMoney(n){
    const v = Number(n)||0;
    const s = Math.abs(v).toFixed(2);
    const sign = v>0 ? '+' : (v<0 ? '−' : '');
    return `${sign}${s} PLN`;
  }

  function shortRow(e){
    const a = fmtMoney(e.amount);
    const m = (e.merchant||'').slice(0,60) || (e.kind==='kasa'?'Kasa':'Wyciąg');
    return `${e.date} · ${m} · ${a}`;
  }

  function computeCashPosition(entries, daysForAvg){
    // Kasa balance from kasa entries (all time)
    const kasaAll = entries.filter(e=>e.kind==='kasa');
    const kasaBal = sum(kasaAll);

    // Bank balance is not reliable without real bank balances.
    // We'll estimate as net of tx entries (all time). It's "movement", not "saldo".
    const txAll = entries.filter(e=>e.kind==='tx');
    const txNet = sum(txAll);

    // Recent burn (avg daily expense)
    const recent = filterByDays(entries, daysForAvg||14).filter(e=>e.amount<0);
    const burn = Math.abs(sum(recent));
    const avgDaily = (daysForAvg ? (burn / Math.max(1, Number(daysForAvg))) : 0);

    return { kasaBal, txNet, avgDaily };
  }


  // ---- Extra helpers for richer AI answers (v17) ----
  function listCategories(entries){
    const set = new Set();
    for(const e of entries){
      const c = (e.category||'').trim();
      if(c) set.add(c);
    }
    return Array.from(set.values()).sort((a,b)=>a.localeCompare(b));
  }

  function filterByCategory(entries, category){
    const key = String(category||'').trim().toLowerCase();
    return entries.filter(e=> String(e.category||'').trim().toLowerCase()===key);
  }

  function normMerchant(s){
    s = String(s||'').toLowerCase();
    s = s.replace(/\d+/g,'').replace(/[^\p{L}\s]+/gu,' ').replace(/\s+/g,' ').trim();
    return s;
  }

  function groupByMerchant(entries){
    const m = new Map();
    for(const e of entries){
      const k = normMerchant(e.merchant||'') || '(brak opisu)';
      const prev = m.get(k) || { merchant:k, count:0, sum:0, lastDate:'' };
      prev.count += 1;
      prev.sum += (Number(e.amount)||0);
      if(!prev.lastDate || String(e.date)>prev.lastDate) prev.lastDate = String(e.date);
      m.set(k, prev);
    }
    return m;
  }

  function topMerchants(entries, type /* spend|income */){
    const filtered = entries.filter(e=>{
      if(type==='spend') return (Number(e.amount)||0) < 0;
      if(type==='income') return (Number(e.amount)||0) > 0;
      return true;
    });
    const m = groupByMerchant(filtered);
    const arr = Array.from(m.values());
    arr.sort((a,b)=>Math.abs(b.sum)-Math.abs(a.sum));
    return arr;
  }

  function median(values){
    const arr = (values||[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
    if(arr.length===0) return 0;
    const mid = Math.floor(arr.length/2);
    return arr.length%2 ? arr[mid] : (arr[mid-1]+arr[mid])/2;
  }

  function detectRecurring(entries, daysWindow){
    // naive subscription detector: same merchant, same sign, repeats at least 3 times
    const recent = filterByDays(entries, daysWindow||120);
    const byM = new Map();
    for(const e of recent){
      const key = normMerchant(e.merchant||'');
      if(!key) continue;
      const sign = e.amount<0 ? 'out' : 'in';
      const k = key+'|'+sign;
      const arr = byM.get(k) || [];
      arr.push(e);
      byM.set(k, arr);
    }
    const out = [];
    for(const [k,arr] of byM.entries()){
      if(arr.length<3) continue;
      arr.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
      // compute gaps
      const gaps = [];
      for(let i=1;i<arr.length;i++){
        const d1 = new Date(arr[i-1].date);
        const d2 = new Date(arr[i].date);
        const gap = Math.round((d2-d1)/(1000*60*60*24));
        if(Number.isFinite(gap)) gaps.push(gap);
      }
      const gmed = median(gaps);
      // monthly-ish or weekly-ish
      const isMonthly = gmed>=26 && gmed<=33;
      const isWeekly = gmed>=6 && gmed<=8;
      if(!isMonthly && !isWeekly) continue;
      const avgAmt = sum(arr)/arr.length;
      out.push({
        merchant: k.split('|')[0],
        sign: k.split('|')[1],
        count: arr.length,
        cadenceDays: gmed,
        avgAmount: avgAmt,
        lastDate: arr[arr.length-1].date
      });
    }
    out.sort((a,b)=>Math.abs(b.avgAmount)-Math.abs(a.avgAmount));
    return out;
  }

  // Expose a small stable API
  window.OTD_AITOOLS = {
    getAllEntries,
    filterByDays,
    topCats,
    topMerchants,
    uncategorized,
    listCategories,
    filterByCategory,
    detectRecurring,
    fmtMoney,
    shortRow,
    computeCashPosition,
    sum,
    median
  };
})();
