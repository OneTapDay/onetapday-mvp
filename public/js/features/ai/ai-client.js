/* OneTapDay AI Client (server-first)
   Public API: window.OTD_AI.answer(text, ctx) + window.OTD_AI.greeting(profile)

   Patch v2025-12-27: send APP_CONTEXT (redacted) + chat history to server,
   so AI can see real app data.
*/
(function(){
  'use strict';

  // ===== helpers =====
  function getLang(){
    try{ return String(localStorage.getItem('otd_lang')||'pl').toLowerCase().trim(); }catch(_){ return 'pl'; }
  }
  function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  function safeJsonParse(raw, fallback){
    try{ return raw ? JSON.parse(raw) : fallback; }catch(_){ return fallback; }
  }

  function readJSON(baseKey, fallback){
    try{
      if(typeof window !== 'undefined' && typeof window._otdGetJSON === 'function'){
        return window._otdGetJSON(baseKey, fallback);
      }
    }catch(_){/* ignore */}
    return safeJsonParse(localStorage.getItem(baseKey), fallback);
  }

  function toNum(x){
    if(x==null) return 0;
    if(typeof x === 'number' && isFinite(x)) return x;
    const s = String(x).replace(/\s/g,'').replace(',', '.');
    const m = s.match(/-?\d+(\.\d+)?/);
    return m ? (parseFloat(m[0])||0) : 0;
  }

  function pickField(obj, keys){
    if(!obj || typeof obj !== 'object') return '';
    for(const k of keys){
      if(obj[k] != null && String(obj[k]).trim() !== '') return obj[k];
    }
    // fallback: case-insensitive match
    const map = {};
    for(const kk of Object.keys(obj)) map[String(kk).toLowerCase()] = kk;
    for(const k of keys){
      const kk = map[String(k).toLowerCase()];
      if(kk && obj[kk] != null && String(obj[kk]).trim() !== '') return obj[kk];
    }
    return '';
  }

  function parseDateAny(v){
    const s = String(v||'').trim();
    if(!s) return null;
    // ISO yyyy-mm-dd
    let m = s.match(/(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
    if(m){
      const y=+m[1], mo=+m[2]-1, d=+m[3];
      const dt = new Date(Date.UTC(y,mo,d));
      return isNaN(dt.getTime()) ? null : dt;
    }
    // dd.mm.yyyy
    m = s.match(/(\d{1,2})[-.\/](\d{1,2})[-.\/](\d{4})/);
    if(m){
      const d=+m[1], mo=+m[2]-1, y=+m[3];
      const dt = new Date(Date.UTC(y,mo,d));
      return isNaN(dt.getTime()) ? null : dt;
    }
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? null : dt;
  }

  function daysAgoUTC(n){
    const now = new Date();
    const t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - n*86400000;
    return new Date(t);
  }

  // Redaction (basic privacy guard)
  const RE_EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/ig;
  const RE_IBAN  = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/ig;
  const RE_LONGDIG = /\b(?:\d[ -]?){12,}\b/g; // 12+ digits (cards/accounts)
  const RE_PHONE = /(\+?\d[\d\s().-]{8,}\d)/g;

  function redactString(s){
    return String(s)
      .replace(RE_EMAIL, '<email>')
      .replace(RE_IBAN, '<iban>')
      .replace(RE_LONGDIG, '<number>')
      .replace(RE_PHONE, '<phone>');
  }

  function deepRedact(x, depth){
    if(depth>6) return x;
    if(x==null) return x;
    if(typeof x === 'string') return redactString(x);
    if(typeof x === 'number' || typeof x === 'boolean') return x;
    if(Array.isArray(x)) return x.slice(0, 500).map(v=>deepRedact(v, depth+1));
    if(typeof x === 'object'){
      const out = {};
      const keys = Object.keys(x).slice(0, 300);
      for(const k of keys){
        out[k] = deepRedact(x[k], depth+1);
      }
      return out;
    }
    return x;
  }

  async function readDocVaultMeta(limit){
    // Best-effort: only metadata from IndexedDB (no files)
    try{
      const DB_NAME='otd_docvault_v1';
      const DB_VER=1;
      const STORE='docs';
      const openReq = indexedDB.open(DB_NAME, DB_VER);
      const db = await new Promise((resolve, reject)=>{
        openReq.onsuccess = ()=> resolve(openReq.result);
        openReq.onerror = ()=> reject(openReq.error);
        openReq.onupgradeneeded = ()=> { /* ignore */ };
      });
      const tx = db.transaction([STORE], 'readonly');
      const store = tx.objectStore(STORE);
      const all = await new Promise((resolve, reject)=>{
        const req = store.getAll();
        req.onsuccess = ()=> resolve(req.result || []);
        req.onerror = ()=> reject(req.error);
      });
      try{ db.close(); }catch(_){}
      const sorted = all.slice().sort((a,b)=>{
        const da = (a && (a.createdAt||a.ts||a.date)) ? String(a.createdAt||a.ts||a.date) : '';
        const dbb = (b && (b.createdAt||b.ts||b.date)) ? String(b.createdAt||b.ts||b.date) : '';
        return dbb.localeCompare(da);
      });
      const recent = sorted.slice(0, limit||20).map(d=>({
        id: d.id,
        type: d.type,
        title: d.title || d.name || '',
        period: d.period || '',
        status: d.status || '',
        createdAt: d.createdAt || d.ts || d.date || ''
      }));
      return { count: all.length, recent };
    }catch(_){
      return null;
    }
  }

  function calcTxSummary(txArr){
    const txs = Array.isArray(txArr) ? txArr : [];
    const sum = {
      totalCount: txs.length,
      last30: { income:0, expense:0, net:0, topCounterparties:[], topCategories:[] },
      last90: { income:0, expense:0, net:0, topCounterparties:[], topCategories:[] },
      recurring: [] // suspicious recurring small spends
    };

    const cp30 = Object.create(null), cat30 = Object.create(null);
    const cp90 = Object.create(null), cat90 = Object.create(null);
    const occ90 = Object.create(null);

    const d30 = daysAgoUTC(30);
    const d90 = daysAgoUTC(90);

    for(const r of txs){
      const dt = parseDateAny(pickField(r, ["Data księgowania","Data","date","Дата"]));
      const amt = toNum(pickField(r, ["Kwota","amount","Kwota_raw","Kwота"]));
      const cp = String(pickField(r, ["Kontrahent","Counterparty","Payee","Nazwa kontrahenta","Контрагент"])||'').trim();
      const cat = String(pickField(r, ["Kategoria","Category","category","Категория"])||'').trim();
      const inout = amt >= 0 ? 'income' : 'expense';
      const abs = Math.abs(amt);

      if(dt && dt >= d90){
        if(inout==='income') sum.last90.income += abs; else sum.last90.expense += abs;
        sum.last90.net += amt;

        if(cp){
          cp90[cp] = (cp90[cp]||0) + abs;
          occ90[cp] = (occ90[cp]||0) + 1;
        }
        if(cat) cat90[cat] = (cat90[cat]||0) + abs;
      }
      if(dt && dt >= d30){
        if(inout==='income') sum.last30.income += abs; else sum.last30.expense += abs;
        sum.last30.net += amt;

        if(cp) cp30[cp] = (cp30[cp]||0) + abs;
        if(cat) cat30[cat] = (cat30[cat]||0) + abs;
      }
    }

    function topMap(m, n){
      return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k,v])=>({ name:k, amount:Math.round(v*100)/100 }));
    }
    sum.last30.topCounterparties = topMap(cp30, 8);
    sum.last30.topCategories = topMap(cat30, 8);
    sum.last90.topCounterparties = topMap(cp90, 10);
    sum.last90.topCategories = topMap(cat90, 10);

    // recurring: counterparties with 3+ occurrences in last 90 days and avg amount small-ish
    const recurring = [];
    for(const [cp, cnt] of Object.entries(occ90)){
      if(cnt < 3) continue;
      const total = cp90[cp] || 0;
      const avg = total / cnt;
      recurring.push({ counterparty: cp, occurrences: cnt, avgAmount: Math.round(avg*100)/100, totalAmount: Math.round(total*100)/100 });
    }
    recurring.sort((a,b)=> (b.occurrences-a.occurrences) || (b.totalAmount-a.totalAmount));
    sum.recurring = recurring.slice(0, 12);

    // rounding
    for(const k of ['last30','last90']){
      sum[k].income = Math.round(sum[k].income*100)/100;
      sum[k].expense = Math.round(sum[k].expense*100)/100;
      sum[k].net = Math.round(sum[k].net*100)/100;
    }
    return sum;
  }

  function calcBillsSummary(billsArr){
    const bills = Array.isArray(billsArr) ? billsArr : [];
    const out = { totalCount: bills.length, dueNext30: [], overdue: [], byStatus: {} };

    const now = new Date();
    const d30 = new Date(now.getTime() + 30*86400000);

    for(const r of bills){
      const due = parseDateAny(pickField(r, ["Termin płatności","Termin","due","Due date","Termin платності"]));
      const status = String(pickField(r, ["Status faktury","Status","status","Статус"])||'').trim();
      const amt = toNum(pickField(r, ["Kwota do zapłaty","Kwota","amount"]));
      const sup = String(pickField(r, ["Dostawca","Supplier","Kontrahent","Counterparty"])||'').trim();
      const inv = String(pickField(r, ["Numer faktury","Invoice number","Numer","Номер фактуры"])||'').trim();

      out.byStatus[status||''] = (out.byStatus[status||'']||0) + 1;

      if(due){
        if(due < now){
          out.overdue.push({ invoice: inv, supplier: sup, due: due.toISOString().slice(0,10), amount: amt });
        }else if(due <= d30){
          out.dueNext30.push({ invoice: inv, supplier: sup, due: due.toISOString().slice(0,10), amount: amt, status });
        }
      }
    }
    out.overdue.sort((a,b)=> a.due.localeCompare(b.due));
    out.dueNext30.sort((a,b)=> a.due.localeCompare(b.due));
    out.overdue = out.overdue.slice(0, 20);
    out.dueNext30 = out.dueNext30.slice(0, 25);
    return out;
  }

  function calcKasaSummary(kasaArr){
    const k = Array.isArray(kasaArr) ? kasaArr : [];
    const sum = {
      totalCount: k.length,
      estBalance: 0,
      last7:  { income:0, expense:0, net:0, topCategories:[], topSources:[], byType:{}, uncategorizedExpense:0 },
      last30: { income:0, expense:0, net:0, topCategories:[], topSources:[], byType:{}, uncategorizedExpense:0 },
      last90: { income:0, expense:0, net:0, topCategories:[], topSources:[], byType:{}, uncategorizedExpense:0 },
      recurring: [] // recurring cash spends by comment/category
    };

    const d7  = daysAgoUTC(7);
    const d30 = daysAgoUTC(30);
    const d90 = daysAgoUTC(90);

    const catAgg = { last7:Object.create(null), last30:Object.create(null), last90:Object.create(null) };
    const srcAgg = { last7:Object.create(null), last30:Object.create(null), last90:Object.create(null) };
    const occ90  = Object.create(null);

    function normKey(s){
      return String(s||'').trim().toLowerCase().replace(/\s+/g,' ').slice(0,80);
    }
    function addAgg(map, key, delta){
      const k = key || '';
      map[k] = (map[k] || 0) + delta;
    }

    for(const r of k){
      const dt = parseDateAny(r.date);
      const amt = toNum(r.amount);
      const typ = String(r.type||'').toLowerCase();
      const cat = String(r.category||'').trim() || '';
      const src = String(r.source||r.src||'').trim() || '';
      const cmt = String(r.comment||r.title||'').trim() || '';

      // Signed amount (in/out convention)
      let signed = amt;
      if(typ.includes('wyd') || typ==='out' || typ.includes('expense')) signed = -Math.abs(amt);
      else if(typ.includes('przy') || typ==='in' || typ.includes('income')) signed = Math.abs(amt);
      else signed = amt;

      sum.estBalance += signed;

      // last7
      if(dt && dt >= d7){
        if(signed >= 0) sum.last7.income += signed; else sum.last7.expense += Math.abs(signed);
        addAgg(catAgg.last7, cat || '<uncat>', Math.abs(signed));
        addAgg(srcAgg.last7, src || '<source?>', Math.abs(signed));
        const tkey = typ || '<type?>';
        sum.last7.byType[tkey] = (sum.last7.byType[tkey] || 0) + 1;
        if(signed < 0 && (!cat || cat.toLowerCase().includes('bez'))) sum.last7.uncategorizedExpense += Math.abs(signed);
      }

      // last30
      if(dt && dt >= d30){
        if(signed >= 0) sum.last30.income += signed; else sum.last30.expense += Math.abs(signed);
        addAgg(catAgg.last30, cat || '<uncat>', Math.abs(signed));
        addAgg(srcAgg.last30, src || '<source?>', Math.abs(signed));
        const tkey = typ || '<type?>';
        sum.last30.byType[tkey] = (sum.last30.byType[tkey] || 0) + 1;
        if(signed < 0 && (!cat || cat.toLowerCase().includes('bez'))) sum.last30.uncategorizedExpense += Math.abs(signed);
      }

      // last90 + recurring
      if(dt && dt >= d90){
        if(signed >= 0) sum.last90.income += signed; else sum.last90.expense += Math.abs(signed);
        addAgg(catAgg.last90, cat || '<uncat>', Math.abs(signed));
        addAgg(srcAgg.last90, src || '<source?>', Math.abs(signed));
        const tkey = typ || '<type?>';
        sum.last90.byType[tkey] = (sum.last90.byType[tkey] || 0) + 1;
        if(signed < 0 && (!cat || cat.toLowerCase().includes('bez'))) sum.last90.uncategorizedExpense += Math.abs(signed);

        // recurring cash spends: use comment first, else category
        const recKey = normKey(cmt) || normKey(cat) || '<unknown>';
        if(signed < 0){
          occ90[recKey] = occ90[recKey] || { key: recKey, occurrences:0, totalExpense:0 };
          occ90[recKey].occurrences += 1;
          occ90[recKey].totalExpense += Math.abs(signed);
        }
      }
    }

    function topFromAgg(map){
      const arr = Object.entries(map||{}).map(([k,v])=>({ key:k, amount: Math.round(toNum(v)*100)/100 }));
      arr.sort((a,b)=> b.amount-a.amount);
      return arr.slice(0, 8);
    }

    // finalize last windows
    for(const win of ['last7','last30','last90']){
      const w = sum[win];
      w.income  = Math.round(w.income*100)/100;
      w.expense = Math.round(w.expense*100)/100;
      w.net     = Math.round((w.income - w.expense)*100)/100;
      w.topCategories = topFromAgg(catAgg[win]).map(x=>({ category: x.key, amount: x.amount }));
      w.topSources    = topFromAgg(srcAgg[win]).map(x=>({ source: x.key, amount: x.amount }));
      w.uncategorizedExpense = Math.round(toNum(w.uncategorizedExpense)*100)/100;
    }

    // recurring (90d): only if 3+ occurrences
    const recurring = [];
    for(const obj of Object.values(occ90)){
      if(!obj || obj.occurrences < 3) continue;
      const avg = obj.totalExpense / obj.occurrences;
      recurring.push({
        key: obj.key,
        occurrences: obj.occurrences,
        avgExpense: Math.round(avg*100)/100,
        totalExpense: Math.round(obj.totalExpense*100)/100
      });
    }
    recurring.sort((a,b)=> (b.occurrences-a.occurrences) || (b.totalExpense-a.totalExpense));
    sum.recurring = recurring.slice(0, 10);

    sum.estBalance = Math.round(sum.estBalance*100)/100;
    return sum;
  }

  function calcTotalSummary(txSum, kasaSum){
    const out = { last30:{}, last90:{} };
    const wins = ['last30','last90'];
    for(const w of wins){
      const t = (txSum && txSum[w]) ? txSum[w] : { income:0, expense:0, net:0 };
      const k = (kasaSum && kasaSum[w]) ? kasaSum[w] : { income:0, expense:0, net:0 };
      out[w] = {
        income: Math.round((toNum(t.income)+toNum(k.income))*100)/100,
        expense: Math.round((toNum(t.expense)+toNum(k.expense))*100)/100,
        net: Math.round((toNum(t.net)+toNum(k.net))*100)/100,
        bank: { income: Math.round(toNum(t.income)*100)/100, expense: Math.round(toNum(t.expense)*100)/100, net: Math.round(toNum(t.net)*100)/100 },
        cash: { income: Math.round(toNum(k.income)*100)/100, expense: Math.round(toNum(k.expense)*100)/100, net: Math.round(toNum(k.net)*100)/100 }
      };
    }
    return out;
  }

  async function buildAppContext(ctxArg){
    const lang = getLang();

    const txArr = readJSON('tx_manual_import', []);
    const billsArr = readJSON('bills_manual_import', []);
    const kasaArr = readJSON('kasa', []);
    const accMeta = readJSON('accMeta', {});
    const spCats = readJSON('otd_sp_cats', null);

    const settingsKeys = [
      'autoCash','cashPLN','rateEUR','rateUSD','otd_analytics_days','speechLang','intervalMin','penaltyPct','blacklist'
    ];
    const settings = {};
    for(const k of settingsKeys){
      const v = localStorage.getItem(k);
      if(v != null) settings[k] = v;
    }

    // Recent samples (for context, not for full analysis)
    const txRecent = Array.isArray(txArr) ? txArr.slice(-50) : [];
    const billsRecent = Array.isArray(billsArr) ? billsArr.slice(-40) : [];
    const kasaRecent = Array.isArray(kasaArr) ? kasaArr.slice(-60) : [];

    const ctx = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      lang,
      settings,
      accounts: accMeta,
      categories: spCats,
      counts: {
        tx: Array.isArray(txArr) ? txArr.length : 0,
        bills: Array.isArray(billsArr) ? billsArr.length : 0,
        kasa: Array.isArray(kasaArr) ? kasaArr.length : 0
      },
      summaries: (function(){
        const txSummary = calcTxSummary(txArr);
        const billsSummary = calcBillsSummary(billsArr);
        const kasaSummary = calcKasaSummary(kasaArr);
        const totalSummary = calcTotalSummary(txSummary, kasaSummary);
        return {
          tx: txSummary,
          bills: billsSummary,
          kasa: kasaSummary,
          total: totalSummary
        };
      })(),
      recent: {
        tx: txRecent,
        bills: billsRecent,
        kasa: kasaRecent
      }
    };

    // DocVault meta (best effort)
    const dv = await readDocVaultMeta(20);
    if(dv) ctx.documents = dv;

    // Merge optional profile and attachments (explicitly provided by app.js)
    if(ctxArg && ctxArg.profile) ctx.profile = ctxArg.profile;
    if(ctxArg && Array.isArray(ctxArg.attachments)) ctx.attachments = ctxArg.attachments;

    // Redact sensitive strings
    const redacted = deepRedact(ctx, 0);

    // Hard size cap: if still too large, drop raw recent arrays
    try{
      const s = JSON.stringify(redacted);
      if(s.length > 48000){
        // keep only short samples
        if(redacted.recent){
          if(Array.isArray(redacted.recent.tx)) redacted.recent.tx = redacted.recent.tx.slice(-20);
          if(Array.isArray(redacted.recent.bills)) redacted.recent.bills = redacted.recent.bills.slice(-15);
          if(Array.isArray(redacted.recent.kasa)) redacted.recent.kasa = redacted.recent.kasa.slice(-25);
        }
        if(redacted.documents && Array.isArray(redacted.documents.recent)){
          redacted.documents.recent = redacted.documents.recent.slice(0, 10);
        }
      }
    }catch(_){}

    return redacted;
  }

  function loadChatHistory(){
    try{
      const ACTIVE_KEY = 'otd_ai_chat_active_v1';
      const PREFIX = 'otd_ai_chat_msgs_';
      const activeId = localStorage.getItem(ACTIVE_KEY) || '';
      if(!activeId) return [];
      const msgs = safeJsonParse(localStorage.getItem(PREFIX + activeId), []);
      if(!Array.isArray(msgs)) return [];
      // last 14 messages, strip placeholders
      const out = [];
      for(const m of msgs.slice(-20)){
        if(!m || typeof m.text !== 'string') continue;
        const t = String(m.text||'').trim();
        if(!t || t === '⌛ Думаю…') continue;
        out.push({ role: (m.role==='assistant'?'assistant':'user'), text: t, ts: m.ts||Date.now() });
      }
      return out.slice(-14);
    }catch(_){
      return [];
    }
  }

  // ===== UX strings =====
  function greeting(profile){
    const lang = getLang();
    if(lang==='pl'){
      return pick([
        'Cześć! Jestem AI‑konsultant OneTapDay. Napisz, co chcesz poprawić w finansach, a ja spojrzę na Twoje dane i zaproponuję plan.',
        'Hej! Mogę pomóc Ci oszczędzać, kontrolować wydatki i planować inwestycje. Napisz cel na najbliższy miesiąc.'
      ]);
    }
    if(lang==='en'){
      return pick([
        "Hi! I'm OneTapDay AI consultant. Tell me what you want to improve and I'll analyze your data and suggest a plan.",
        "Hey! I can help you save, track spending leaks, and plan investments. What's your goal for this month?"
      ]);
    }
    if(lang==='uk'){
      return pick([
        'Привіт! Я AI‑консультант OneTapDay. Напиши, що хочеш покращити, і я подивлюсь на твої дані та запропоную план.',
        'Хай! Допоможу з економією, контролем витрат і інвестиціями. Яка твоя ціль на цей місяць?'
      ]);
    }
    return pick([
      'Привет! Я AI‑консультант OneTapDay. Напиши, что хочешь улучшить, и я посмотрю на твои данные и предложу план.',
      'Привет! Могу помочь с экономией, контролем трат и инвестициями. Какая цель на ближайший месяц?'
    ]);
  }

  async function answer(text, ctxArg){
    const payload = {
      message: String(text||''),
      // keep compatibility (server now may use these)
      profile: (ctxArg && ctxArg.profile) ? ctxArg.profile : {},
      attachments: (ctxArg && Array.isArray(ctxArg.attachments)) ? ctxArg.attachments : [],
      history: loadChatHistory()
    };

    // attach app context (best effort)
    try{
      payload.context = await buildAppContext(ctxArg||{});
    }catch(_){
      // ignore context failures
    }

    try{
      const r = await fetch('/api/ai/chat', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });

      // Not configured / no billing / no quota etc.
      if(!r.ok){
        let msg = '';
        try{
          const j = await r.json();
          msg = (j && (j.error || j.message)) ? String(j.error || j.message) : '';
        }catch(_){}
        if(r.status===401) return 'AI недоступен: нет авторизации.';
        if(r.status===429) return 'AI недоступен: лимит запросов.';
        if(r.status===503) return 'AI недоступен: не подключен (нет ключа / отключено).';
        if(r.status===502) return 'AI недоступен: ошибка провайдера.';
        return 'AI временно недоступен. ' + (msg ? ('Причина: ' + msg) : 'Попробуй позже.');
      }

      const j = await r.json().catch(()=>null);
      if(j && j.success && typeof j.answer === 'string') return j.answer;
      if(j && typeof j.text === 'string') return j.text;
      return 'AI ответил пусто.';
    }catch(e){
      return 'AI временно недоступен (ошибка сети/сервера).';
    }
  }

  window.OTD_AI = { greeting, answer };
})();
