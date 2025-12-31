// Extracted from public/js/app/app.js (lines 719-855)
// ==== TREND & SPENDING PANELS ====

// Build daily net movement (bank + cash) for last 30 days
function buildTrendSeries(days){
  days = (days && isFinite(days)) ? Math.max(1, Math.floor(days)) : 30;
  const map = {};
  const txArr = Array.isArray(tx) ? tx : [];
  const kasaArr = Array.isArray(kasa) ? kasa : [];

  txArr.forEach(r=>{
    const d = toISO(getVal(r,["Data księgowania","Data","date","Дата"]));
    if(!d) return;
    const amt = asNum(getVal(r,["Kwota","Kwота","amount","Kwota_raw"])||0);
    if(!amt) return;
    map[d] = (map[d] || 0) + amt;
  });

  kasaArr.forEach(k=>{
    const d = String(k.date||"").slice(0,10);
    if(!d) return;
    const amt = Number(k.amount||0);
    if(!amt) return;
    map[d] = (map[d] || 0) + amt;
  });

  const dates = Object.keys(map).sort();
  if(!dates.length) return [];
  const last = dates.slice(-days);
  return last.map(d=>({date:d, value:map[d]}));
}


function renderTrendChart(){
  const wrap = document.getElementById('trendChart');
  const chip = document.getElementById('trendChange');
  if(!wrap || !chip) return;

  const series = buildTrendSeries();
  _trendSeries = series;
  if(!series || !series.length){
    wrap.innerHTML = '<div class="muted small">Мало данных, чтобы показать движение.</div>';
    chip.textContent = '—';
    chip.className = 'trendChip';
    return;
  }

  const values = series.map(p=>p.value);
  const max = Math.max.apply(null, values);
  const min = Math.min.apply(null, values);
  const range = (max - min) || 1;

  const pts = series.map((p, idx)=>{
    const x = series.length === 1 ? 50 : (idx/(series.length-1))*100;
    const norm = (p.value - min)/range;
    const y = 90 - norm*70;
    return x.toFixed(2)+','+y.toFixed(2);
  }).join(' ');

  const start = series[0].value;
  const end   = series[series.length-1].value;
  const diff  = end - start;
  const pct   = start === 0 ? 0 : (diff/start)*100;

  const up = diff >= 0;
  _trendColor = up ? '#47b500' : '#ff4f4f';
  chip.textContent = (up?'+':'')+diff.toFixed(0)+' PLN ('+pct.toFixed(1)+'%)';
  chip.className = 'trendChip '+(up?'up':'down');

  const color = _trendColor;

  const svg = [
    '<svg viewBox="0 0 100 100" preserveAspectRatio="none">',
      '<defs>',
        '<linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">',
          '<stop offset="0%" stop-color="',color,'" stop-opacity="0.30" />',
          '<stop offset="100%" stop-color="',color,'" stop-opacity="0" />',
        '</linearGradient>',
      '</defs>',
      '<polyline fill="none" stroke="',color,'" stroke-width="1.5" points="',pts,'" />',
      '<polygon fill="url(#trendFill)" points="0,100 ',pts,' 100,100" />',
    '</svg>',
    '<div class="trendCursorLine" id="trendCursorLine" style="display:none"></div>',
    '<div class="trendTooltip" id="trendTooltip" style="display:none"></div>'
  ].join('');
  wrap.innerHTML = svg;
}

function formatTrendLabel(point){
  if(!point) return '';
  const d = point.date || '';
  const short = d ? d.slice(8,10)+'.'+d.slice(5,7) : '';
  const val = (point.value||0).toFixed(0);
  return (short?short+' · ':'')+val+' PLN';
}

function handleTrendHover(clientX){
  if(!_trendSeries || !_trendSeries.length) return;
  const wrap = document.getElementById('trendChart');
  const cursor = document.getElementById('trendCursorLine');
  const tip = document.getElementById('trendTooltip');
  if(!wrap || !cursor || !tip) return;
  const rect = wrap.getBoundingClientRect();
  const xRel = (clientX - rect.left) / rect.width;
  if(xRel < 0 || xRel > 1) return;
  const lastIdx = _trendSeries.length - 1;
  const idx = Math.max(0, Math.min(lastIdx, Math.round(xRel * lastIdx)));
  const pt = _trendSeries[idx];
  const xPerc = lastIdx === 0 ? 50 : (idx/lastIdx)*100;

  cursor.style.left = xPerc + '%';
  cursor.style.display = 'block';

  tip.textContent = formatTrendLabel(pt);
  tip.style.left = xPerc + '%';
  tip.style.display = 'block';
}

function clearTrendHover(){
  const cursor = document.getElementById('trendCursorLine');
  const tip = document.getElementById('trendTooltip');
  if(cursor) cursor.style.display = 'none';
  if(tip) tip.style.display = 'none';
}

function initTrendInteractions(){
  const wrap = document.getElementById('trendChart');
  if(!wrap) return;
  wrap.addEventListener('mousemove', (e)=>handleTrendHover(e.clientX));
  wrap.addEventListener('mouseleave', clearTrendHover);
  wrap.addEventListener('touchmove', (e)=>{
    if(e.touches && e.touches.length){
      handleTrendHover(e.touches[0].clientX);
    }
  }, {passive:true});
  wrap.addEventListener('touchend', clearTrendHover);
}

