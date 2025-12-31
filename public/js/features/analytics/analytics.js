// Extracted from public/js/app/app.js (lines 856-1257)
// ===== Analytics (Qalta-like) =====
let __analyticsDays = 365;

function setAnalyticsDays(d){
  const v = parseInt(d, 10);
  if (!v || !isFinite(v)) return;
  __analyticsDays = v;
  try { localStorage.setItem('otd_analytics_days', String(v)); } catch(e){}
}
function getAnalyticsDays(){
  try {
    const raw = localStorage.getItem('otd_analytics_days');
    const v = parseInt(raw, 10);
    if (v && isFinite(v)) return v;
  } catch(e){}
  return __analyticsDays || 365;
}
function analyticsLabel(){
  const c = getAnalyticsCustomRange();
  if(c && c.from && c.to){
    return (TT('analytics.range_custom', null, 'Zakres') + ': ' + c.from + ' – ' + c.to);
  }
  const days = getAnalyticsDays();
  if (days <= 30) return TT('analytics.range_30d_label', null, 'Ostatnie 30 dni');
  if (days <= 90) return TT('analytics.range_90d_label', null, 'Ostatnie 90 dni');
  return TT('analytics.range_12m_label', null, 'Ostatnie 12 miesięcy');
}

// ===== Custom analytics range (stored in localStorage) =====
function setAnalyticsCustomRange(fromISO, toISO){
  const from = String(fromISO||'').trim();
  const to = String(toISO||'').trim();
  if(!from || !to) return;
  try{ localStorage.setItem('otd_analytics_range', JSON.stringify({from, to})); }catch(e){}
}
function clearAnalyticsCustomRange(){
  try{ localStorage.removeItem('otd_analytics_range'); }catch(e){}
}
function getAnalyticsCustomRange(){
  try{
    const raw = localStorage.getItem('otd_analytics_range');
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(!obj || !obj.from || !obj.to) return null;
    return { from: String(obj.from), to: String(obj.to) };
  }catch(e){ return null; }
}
function _rangeIsoCustom(startISO, endISO){
  const start = String(startISO||'').slice(0,10);
  const end = String(endISO||'').slice(0,10);
  if(!start || !end) return _rangeIsoDays(30);
  let d = start;
  const list = [];
  let guard = 0;
  while(d <= end && guard < 4000){
    list.push(d);
    d = _isoAddDays(d, 1);
    guard++;
  }
  return { start, end, list };
}
function getAnalyticsRangeWithList(pack){
  const c = getAnalyticsCustomRange();
  if(c && c.from && c.to){
    return _rangeIsoCustom(c.from, c.to);
  }
  const days = pack && pack.days ? pack.days : getAnalyticsDays();
  return _rangeIsoDays(days);
}
function getAnalyticsRange(pack){
  const r = getAnalyticsRangeWithList(pack);
  return { start: r.start, end: r.end };
}


function setAnalyticsButtons(){
  const b30 = document.getElementById('analyticsRange30');
  const b90 = document.getElementById('analyticsRange90');
  const b365 = document.getElementById('analyticsRange365');
  const bCustom = document.getElementById('analyticsRangeCustom');

  if (b30) b30.className = 'btn ghost';
  if (b90) b90.className = 'btn ghost';
  if (b365) b365.className = 'btn ghost';
  if (bCustom) bCustom.className = 'btn ghost';

  const c = getAnalyticsCustomRange();
  if(c){
    if (bCustom) bCustom.className = 'btn';
    return;
  }

  const days = getAnalyticsDays();
  if (days <= 30 && b30) b30.className = 'btn';
  else if (days <= 90 && b90) b90.className = 'btn';
  else if (b365) b365.className = 'btn';
}

function _localISODate(dt){
  const d = new Date(dt);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,10);
}
function _isoAddDays(iso, add){
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + add);
  return _localISODate(d);
}
function _rangeIsoDays(days){
  days = (days && isFinite(days)) ? Math.max(1, Math.floor(days)) : 30;
  const end = _localISODate(new Date());
  const start = _isoAddDays(end, -(days - 1));
  const list = [];
  for(let i=0;i<days;i++) list.push(_isoAddDays(start, i));
  return {start, end, list};
}

function _formatPLN(x){
  const v = Number(x || 0);
  const s = (Math.round(v*100)/100).toFixed(2).replace(/\.00$/,'');
  return s + ' PLN';
}

function _buildPeriodPack(){
  const {start, end, list} = getAnalyticsRangeWithList(null);
const map = {};
  const txArr = Array.isArray(tx) ? tx : [];
  const kasaArr = Array.isArray(kasa) ? kasa : [];

  let income = 0;
  let expense = 0;

  // BANK TX
  txArr.forEach(r=>{
    const d = toISO(getVal(r,["Data księgowania","Data","date","Дата"]));
    if(!d) return;
    if(d < start || d > end) return;

    const amt = asNum(getVal(r,["Kwota","Kwота","amount","Kwota_raw"])||0);
    if(!amt) return;

    map[d] = (map[d] || 0) + amt;
    if(amt > 0) income += amt;
    if(amt < 0) expense += Math.abs(amt);
  });

  // CASH (KASA)
  kasaArr.forEach(k=>{
    const d = String(k.date||"").slice(0,10);
    if(!d) return;
    if(d < start || d > end) return;

    const signed = (typeof getSignedKasaAmount === 'function')
      ? getSignedKasaAmount(k)
      : Number(k.amount||0);

    if(!signed) return;

    map[d] = (map[d] || 0) + signed;
    if(signed > 0) income += signed;
    if(signed < 0) expense += Math.abs(signed);
  });

  const series = list.map(d=>({date:d, value:(map[d]||0)}));
  const net = income - expense;

  const days = list.length;
  return {days, start, end, list, series, income, expense, net};
}

function renderAnalytics(){
  setAnalyticsButtons();

  const labelEl = document.getElementById('analyticsRangeLabel');
  if(labelEl) labelEl.textContent = analyticsLabel();

  const pack = _buildPeriodPack();

  renderAnalyticsTrend(pack);
  renderAnalyticsKpis(pack);
  renderAnalyticsDonut(pack);
  renderAnalyticsTopMerchants(pack);
}

function renderAnalyticsTrend(pack){
  const wrap = document.getElementById('analyticsChart');
  if(!wrap) return;

  const chip = document.getElementById('analyticsNetChip');
  const movementEl = document.getElementById('analyticsMovementTotal');

  const series = pack && Array.isArray(pack.series) ? pack.series : [];
  const list = pack && Array.isArray(pack.list) ? pack.list : series.map(p=>p.date);
  const nonZero = series.some(p => !!p.value);

  if(!series.length || !nonZero){
    wrap.innerHTML = '<div class="analyticsEmpty">'+escapeHtml(TT('analytics.empty_trend', null, 'Brak danych do wykresu. Załaduj wyciąg lub dodaj ruch w kasie.'))+'</div>';
    if(chip){
      chip.textContent = '—';
      chip.className = 'trendChip';
    }
    if(movementEl) movementEl.textContent = '—';
    return;
  }

  // ---- bucketize (daily -> weekly -> monthly) so the chart doesn't look like a dead ECG
  const days = pack && pack.days ? pack.days : series.length;

  function nextYM(ym){
    const y = parseInt(String(ym||'').slice(0,4),10);
    const m = parseInt(String(ym||'').slice(5,7),10);
    if(!y || !m) return null;
    const d = new Date(y, m-1, 1);
    d.setMonth(d.getMonth()+1);
    const yy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    return yy + '-' + mm;
  }

  let buckets = [];
  if(days > 120){
    const map = {};
    series.forEach(p=>{
      const ym = String(p.date||'').slice(0,7);
      if(!ym) return;
      map[ym] = (map[ym] || 0) + Number(p.value||0);
    });
    const startYM = String(list[0]||'').slice(0,7);
    const endYM = String(list[list.length-1]||'').slice(0,7);
    let cur = startYM;
    let guard = 0;
    while(cur && cur <= endYM && guard < 36){
      buckets.push({ label: cur, range: cur, value: Number(map[cur]||0) });
      cur = nextYM(cur);
      guard++;
    }
  } else if(days > 45){
    const chunk = 7;
    for(let i=0;i<series.length;i+=chunk){
      const a = (list[i] || (series[i] && series[i].date) || '').slice(0,10);
      const b = (list[Math.min(i+chunk-1, list.length-1)] || (series[Math.min(i+chunk-1, series.length-1)] && series[Math.min(i+chunk-1, series.length-1)].date) || '').slice(0,10);
      let sum = 0;
      for(let j=i;j<Math.min(i+chunk, series.length);j++) sum += Number(series[j].value||0);
      const label = a ? a.slice(5) : '';
      buckets.push({ label, range: (a && b) ? (a + ' – ' + b) : (a || b), value: sum });
    }
  } else {
    buckets = series.map(p=>({ label: String(p.date||'').slice(0,10), range: String(p.date||'').slice(0,10), value: Number(p.value||0) }));
  }

  const vals = buckets.map(b=>Number(b.value||0));
  const max = Math.max.apply(null, vals);
  const min = Math.min.apply(null, vals);
  const absMax = Math.max(Math.abs(min), Math.abs(max)) || 1;

  const up = (pack.net || 0) >= 0;
  const colorUp = 'var(--accent)';
  const colorDown = 'rgba(255,64,64,0.9)';

  if(chip){
    chip.textContent = (up?'+':'') + _formatPLN(Math.abs(pack.net || 0)).replace(' PLN',' PLN');
    chip.className = 'trendChip ' + (up ? 'up' : 'down');
  }
  if(movementEl){
    const maxTxt = (max>=0?'+':'-') + _formatPLN(Math.abs(max));
    const minTxt = (min>=0?'+':'-') + _formatPLN(Math.abs(min));
    movementEl.textContent = 'Netto: ' + (up?'+':'-') + _formatPLN(Math.abs(pack.net || 0)) + ' • Max: ' + maxTxt + ' • Min: ' + minTxt;
  }

  // ---- SVG bars + line + baseline
  const n = Math.max(1, buckets.length);
  const barW = 100 / n;
  const gap = Math.min(0.9, barW * 0.28);
  const w = Math.max(0.4, barW - gap);
  const y0 = 50;
  const scale = 40;

  function y(v){
    return y0 - (Number(v||0) / absMax) * scale;
  }

  const bars = buckets.map((b, i)=>{
    const v = Number(b.value||0);
    const x = i*barW + gap/2;
    const yv = y(v);
    const yTop = Math.min(y0, yv);
    const h = Math.max(0.8, Math.abs(yv - y0));
    const fill = v >= 0 ? colorUp : colorDown;
    const op = v === 0 ? 0.15 : 0.75;
    return `<rect x="${x.toFixed(2)}" y="${yTop.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="1.2" fill="${fill}" fill-opacity="${op}" data-i="${i}"></rect>`;
  }).join('');

  const pts = buckets.map((b,i)=>{
    const x = i*barW + barW/2;
    const yy = y(b.value);
    return x.toFixed(2)+','+yy.toFixed(2);
  }).join(' ');

  const svg = `
<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Movement">
  <line x1="0" y1="${y0}" x2="100" y2="${y0}" stroke="rgba(255,255,255,0.18)" stroke-width="1"></line>
  ${bars}
  <polyline points="${pts}" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"></polyline>
</svg>`.trim();

  wrap.innerHTML = svg + '<div class="trendCursorLine" style="display:none"></div><div class="trendTooltip" style="display:none"></div>';

  // ---- hover tooltip (cheap, but effective)
  const lineEl = wrap.querySelector('.trendCursorLine');
  const tipEl = wrap.querySelector('.trendTooltip');

  wrap.onmousemove = (e)=>{
    const rect = wrap.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / Math.max(1, rect.width);
    const idx = Math.max(0, Math.min(n-1, Math.floor(rel * n)));
    const b = buckets[idx];
    if(!b) return;

    const xPx = (idx + 0.5) / n * rect.width;

    if(lineEl){
      lineEl.style.display = 'block';
      lineEl.style.left = (xPx|0) + 'px';
    }
    if(tipEl){
      const v = Number(b.value||0);
      const txt = (b.range ? (b.range + ' • ') : '') + (v>=0?'+':'-') + _formatPLN(Math.abs(v));
      tipEl.textContent = txt;
      tipEl.style.display = 'block';
      tipEl.style.left = (xPx|0) + 'px';
      tipEl.style.top = (e.clientY - rect.top) + 'px';
    }
  };
  wrap.onmouseleave = ()=>{
    if(lineEl) lineEl.style.display = 'none';
    if(tipEl) tipEl.style.display = 'none';
  };
}

function renderAnalyticsKpis(pack){
  const kpis = document.getElementById('analyticsKpis');
  if(!kpis) return;

  const income = Number(pack.income || 0);
  const expense = Number(pack.expense || 0);
  const net = Number(pack.net || 0);
  const up = net >= 0;

  const avg = pack.days ? (net / pack.days) : 0;

  const rows = [
    {label:'Wpływy', value:_formatPLN(income), dot:'var(--accent)'},
    {label:'Wydatki', value:_formatPLN(expense), dot:'rgba(255,255,255,0.45)'},
    {label:'Netto', value:(up?'+':'-') + _formatPLN(Math.abs(net)), dot: up ? 'var(--accent)' : '#ff4f4f'},
    {label:'Średnio / dzień', value:(avg>=0?'+':'-') + _formatPLN(Math.abs(avg)), dot:'rgba(255,255,255,0.25)'}
  ];

  kpis.innerHTML = rows.map(r=>(
    `<span class="kpiPill"><span class="kpiDot" style="background:${r.dot}"></span><span>${r.label}:</span><strong>${r.value}</strong></span>`
  )).join('');
}

function renderAnalyticsDonut(pack){
  const donut = document.getElementById('analyticsDonut');
  const listEl = document.getElementById('analyticsCatList');
  const centerValue = document.getElementById('analyticsDonutValue');
  const centerLabel = document.getElementById('analyticsDonutLabel');
  const totalEl = document.getElementById('analyticsExpenseTotal');
  if(!donut || !listEl) return;

  // NOTE: in the modular build `escHtml` may be defined later; Analytics uses `escapeHtml` here.
  const _esc = (typeof escapeHtml === 'function') ? escapeHtml : (s)=>String(s||'');

  // Use the already built period pack (pack.list) so donut ALWAYS follows 30d/90d/12m/custom.
  const list = (pack && Array.isArray(pack.list) && pack.list.length) ? pack.list : (getAnalyticsRangeWithList(pack).list || []);
  const daySet = new Set(list);
  const start = (pack && pack.start) ? String(pack.start).slice(0,10) : (list[0] || '');
  const end = (pack && pack.end) ? String(pack.end).slice(0,10) : (list[list.length-1] || '');

  function inRangeISO(d){
    const iso = String(d||'').slice(0,10);
    if(!iso) return false;
    if(daySet.size) return daySet.has(iso);
    if(start && end) return (iso >= start && iso <= end);
    return true;
  }

  const totals = {};
  let total = 0;

  const txArr = Array.isArray(tx) ? tx : [];
  const kasaArr = Array.isArray(kasa) ? kasa : [];

  // tx expenses (bank)
  txArr.forEach(r=>{
    const d = String(toISO(getVal(r,["Data księgowania","Data","date","Дата"]))||'').slice(0,10);
    if(!inRangeISO(d)) return;

    const amt = asNum(getVal(r,["Kwota","Kwота","amount","Kwota_raw"])||0);
    if(!(amt < 0)) return;

    const cat = String(getVal(r,["Kategoria","Category","category"])||'uncat');
    totals[cat] = (totals[cat]||0) + Math.abs(amt);
    total += Math.abs(amt);
  });

  // cash expenses (kasa)
  kasaArr.forEach(k=>{
    const d = String(toISO(k.date||k.Data||k["Дата"]||'')||'').slice(0,10);
    if(!inRangeISO(d)) return;

    const signed = (typeof getSignedKasaAmount === 'function') ? getSignedKasaAmount(k) : Number(k.amount||0);
    if(!(signed < 0)) return;

    const cat = String(k.category||k.Kategoria||k["Категория"]||'uncat');
    totals[cat] = (totals[cat]||0) + Math.abs(signed);
    total += Math.abs(signed);
  });

  if(totalEl){
    const label = TT('analytics.total', null, 'Suma');
    totalEl.textContent = label + ': ' + _formatPLN(total);
  }

  if(!total){
    donut.innerHTML = '<div class="analyticsEmpty">'+_esc(TT('analytics.empty_expenses', null, 'Brak danych wydatków w tym okresie.'))+'</div>';
    listEl.innerHTML = '';
    if(centerValue) centerValue.textContent = '—';
    if(centerLabel) centerLabel.textContent = TT('analytics.donut_label', null, 'Wydatki');
    return;
  }

  // Category label helpers (prefer spending categories i18n if available)
  const cats = (typeof getAllSpCats === 'function') ? getAllSpCats() : [];
  const catMap = {};
  cats.forEach(c=>{ catMap[String(c.id)] = c; });

  function labelForCatId(id){
    const key = String(id||'');
    if(key === 'uncat') return '⚠️ ' + TT('spending.uncat', null, 'Bez kategorii');
    if(key === 'rest') return '📦 ' + TT('spending.cat_other', null, 'Inne');
    if(typeof formatCatLabel === 'function'){
      return formatCatLabel(key);
    }
    const c = catMap[key];
    if(c){
      const em = c.emoji || '📦';
      const lbl = (typeof resolveSpCatLabel === 'function') ? resolveSpCatLabel(c) : (c.label || c.id || key);
      return (em ? (em+' ') : '') + (lbl || key);
    }
    return key;
  }

  function colorForCatId(id){
    const key = String(id||'').toLowerCase();
    const palette = {
      food:  'hsl(45, 90%, 58%)',
      fuel:  'hsl(24, 90%, 60%)',
      home:  'hsl(200, 85%, 60%)',
      subs:  'hsl(275, 80%, 65%)',
      salary:'hsl(110, 85%, 55%)',
      other: 'hsl(210, 10%, 65%)',
      uncat: 'hsl(0, 85%, 60%)',
      rest:  'hsl(210, 12%, 62%)'
    };
    if(palette[key]) return palette[key];
    // fallback: deterministic hue per category (so it isn't all green)
    let h = 0;
    for(let i=0;i<key.length;i++) h = (h*31 + key.charCodeAt(i)) % 360;
    const hue = (h + 40) % 360;
    return 'hsl(' + hue + ', 80%, 60%)';
  }

  const rows = Object.keys(totals).map(id=>({
    id,
    name: labelForCatId(id),
    value: totals[id]
  })).sort((a,b)=>b.value - a.value);

  const top = rows.slice(0,6);
  const rest = rows.slice(6);
  if(rest.length){
    const restSum = rest.reduce((a,b)=>a+b.value,0);
    top.push({id:'rest', name: labelForCatId('rest'), value:restSum});
  }

  const colors = top.map(p=>colorForCatId(p.id));

  // svg donut
  const radius = 15.91549430918954; // 2*pi*r ~ 100
  let offset = 25; // start at top
  const segs = top.map((p, i)=>{
    const pct = (p.value / total) * 100;
    const dash = pct.toFixed(3);
    const seg = `<circle class="donutSeg" cx="20" cy="20" r="${radius}"
      fill="transparent" stroke="${colors[i]}" stroke-width="3.6"
      stroke-dasharray="${dash} ${100 - pct}" stroke-dashoffset="${offset}"
      data-a-cat="${_esc(p.id)}" data-a-name="${encodeURIComponent(p.name)}" data-a-val="${p.value}"></circle>`;
    offset -= pct;
    return seg;
  }).join('');

  donut.innerHTML = `<svg viewBox="0 0 40 40" class="donutSvg">${segs}</svg>`;

  // list
  listEl.innerHTML = top.map((p,i)=>{
    const pct = Math.round((p.value / total) * 100);
    return `<div class="analyticsRow" data-a-cat="${_esc(p.id)}" data-a-name="${encodeURIComponent(p.name)}" data-a-val="${p.value}">
      <div class="analyticsRowLeft">
        <span class="analyticsSwatch" style="background:${colors[i]}"></span>
        <span class="analyticsRowName">${_esc(p.name)}</span>
      </div>
      <span class="analyticsRowAmt">${_formatPLN(p.value)} <span class="muted" style="font-weight:700">(${pct}%)</span></span>
    </div>`;
  }).join('');

  // default center
  if(centerValue) centerValue.textContent = _formatPLN(total);
  if(centerLabel) centerLabel.textContent = TT('analytics.donut_label', null, 'Wydatki');

  // click to focus
  listEl.querySelectorAll('.analyticsRow').forEach(row=>{
    row.addEventListener('click', ()=>{
      const val = Number(row.getAttribute('data-a-val')||0);
      const name = decodeURIComponent(row.getAttribute('data-a-name')||'');
      if(centerValue) centerValue.textContent = _formatPLN(val);
      if(centerLabel) centerLabel.textContent = name || TT('analytics.donut_label', null, 'Wydatki');
    });
  });

  donut.querySelectorAll('.donutSeg').forEach(seg=>{
    seg.addEventListener('click', ()=>{
      const val = Number(seg.getAttribute('data-a-val')||0);
      const name = decodeURIComponent(seg.getAttribute('data-a-name')||'');
      if(centerValue) centerValue.textContent = _formatPLN(val);
      if(centerLabel) centerLabel.textContent = name || TT('analytics.donut_label', null, 'Wydatki');
    });
  });
}


function renderAnalyticsTopMerchants(pack){
  const box = document.getElementById('analyticsTopMerchants');
  const btn = document.getElementById('analyticsOpenSpendingListBtn');
  if(btn){
    btn.onclick = ()=>{ try { if(typeof openSpendingList === 'function') openSpendingList(null); } catch(e){} };
  }
  if(!box) return;

  const {start, end} = getAnalyticsRange(pack);

  const agg = {};
  const txArr = Array.isArray(tx) ? tx : [];
  const kasaArr = Array.isArray(kasa) ? kasa : [];

  txArr.forEach(r=>{
    const d = toISO(getVal(r,["Data księgowania","Data","date","Дата"]));
    if(!d) return;
    if(d < start || d > end) return;

    const amt = asNum(getVal(r,["Kwota","Kwота","amount","Kwota_raw"])||0);
    if(!amt || amt >= 0) return;

    const m = (typeof getMerchantFromTxRow === 'function') ? (getMerchantFromTxRow(r) || 'Kontrahent') : 'Kontrahent';
    agg[m] = (agg[m] || 0) + Math.abs(amt);
  });

  kasaArr.forEach(k=>{
    const d = String(k.date||"").slice(0,10);
    if(!d) return;
    if(d < start || d > end) return;

    const signed = (typeof getSignedKasaAmount === 'function') ? getSignedKasaAmount(k) : Number(k.amount||0);
    if(!signed || signed >= 0) return;

    const m = (typeof getMerchantFromKasaRow === 'function') ? (getMerchantFromKasaRow(k) || 'Kasa') : 'Kasa';
    agg[m] = (agg[m] || 0) + Math.abs(signed);
  });

  const rows = Object.keys(agg).map(k=>({name:k, value:agg[k]})).sort((a,b)=>b.value-a.value).slice(0,6);

  if(!rows.length){
    box.innerHTML = '<div class="analyticsEmpty">Brak danych wydatków w tym okresie.</div>';
    return;
  }

  box.innerHTML = rows.map(r=>(
    `<div class="analyticsRow">
      <div class="analyticsRowLeft">
        <span class="analyticsSwatch" style="background:rgba(71,181,0,0.6)"></span>
        <span class="analyticsRowName">${escapeHtml(r.name)}</span>
      </div>
      <span class="analyticsRowAmt">${_formatPLN(r.value)}</span>
    </div>`
  )).join('');
}

function initAnalyticsUI(){
  const b30 = document.getElementById('analyticsRange30');
  const b90 = document.getElementById('analyticsRange90');
  const b365 = document.getElementById('analyticsRange365');
  const bCustom = document.getElementById('analyticsRangeCustom');

  if (b30) b30.addEventListener('click', ()=>{ clearAnalyticsCustomRange(); setAnalyticsDays(30); renderAnalytics(); });
  if (b90) b90.addEventListener('click', ()=>{ clearAnalyticsCustomRange(); setAnalyticsDays(90); renderAnalytics(); });
  if (b365) b365.addEventListener('click', ()=>{ clearAnalyticsCustomRange(); setAnalyticsDays(365); renderAnalytics(); });

  // Custom range modal
  const modal = document.getElementById('analyticsRangeModal');
  const inFrom = document.getElementById('analyticsFrom');
  const inTo = document.getElementById('analyticsTo');
  const inMonth = document.getElementById('analyticsMonth');
  const btnApply = document.getElementById('analyticsRangeApply');
  const btnClear = document.getElementById('analyticsRangeClear');
  const btnClose = document.getElementById('analyticsRangeClose');

  function openModal(){
    if(!modal) return;
    const r = getAnalyticsRangeWithList(null);
    if(inFrom) inFrom.value = r.start || '';
    if(inTo) inTo.value = r.end || '';
    if(inMonth) inMonth.value = '';
    modal.style.display = 'flex';
  }
  function closeModal(){
    if(!modal) return;
    modal.style.display = 'none';
  }
  function lastDayOfMonth(ym){
    // ym = YYYY-MM
    const [y,m] = String(ym||'').split('-').map(x=>parseInt(x,10));
    if(!y || !m) return null;
    const d = new Date(y, m, 0); // last day of month
    return d.getDate();
  }

  if(bCustom) bCustom.addEventListener('click', openModal);

  if(modal){
    modal.addEventListener('click', (e)=>{
      if(e.target === modal) closeModal();
    });
  }

  if(btnClose) btnClose.addEventListener('click', closeModal);

  if(btnClear) btnClear.addEventListener('click', ()=>{
    clearAnalyticsCustomRange();
    renderAnalytics();
    closeModal();
  });

  if(inMonth) inMonth.addEventListener('change', ()=>{
    const ym = inMonth.value;
    if(!ym) return;
    const ld = lastDayOfMonth(ym);
    if(!ld) return;
    const from = ym + '-01';
    const to = ym + '-' + String(ld).padStart(2,'0');
    if(inFrom) inFrom.value = from;
    if(inTo) inTo.value = to;
  });

  if(btnApply) btnApply.addEventListener('click', ()=>{
    const from = (inFrom && inFrom.value) ? String(inFrom.value) : '';
    const to = (inTo && inTo.value) ? String(inTo.value) : '';
    if(!from || !to) return;
    if(from > to) return;
    setAnalyticsCustomRange(from, to);
    renderAnalytics();
    closeModal();
  });

  // click on home chart -> analytics
  const card = document.getElementById('trendCard') || document.getElementById('trendChart');
  if (card){
    try { card.style.cursor = 'pointer'; } catch(e){}
    card.addEventListener('click', ()=>{
      try { if (window.appGoSection) window.appGoSection('analytics'); } catch(e){}
    });
    card.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        try { if (window.appGoSection) window.appGoSection('analytics'); } catch(err){}
      }
    });
  }
}

