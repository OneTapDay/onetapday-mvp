// Extracted from public/js/app/app.js (lines 290-412)
/* ==== HELPERS ==== */
const $id = id => document.getElementById(id);
const today = () => new Date().toISOString().slice(0,10);
const asNum = v=>{
  if(v==null) return 0; let s=String(v).trim(); if(!s) return 0;
  s=s.replace(/\u00A0/g,' ');
  if(/^(\(|−|-).*\)$/.test(s)) s='-'+s.replace(/^\(|−|-|\)$/g,'');
  if(/^−/.test(s)) s='-'+s.replace(/^−/,'');
  const hasComma=/,/.test(s), hasDot=/\./.test(s);
  s=s.replace(/\b(PLN|zł|zl|zlot|EUR|USD|GBP)\b/ig,'');
  if(hasComma && !hasDot) s=s.replace(/\s/g,'').replace(/,/g,'.'); else s=s.replace(/[\s\u00A0]/g,'').replace(/,/g,'');
  s=s.replace(/[^\d\.\-]/g,'');
  const n=Number(s); return isNaN(n)?0:n;
};

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, (ch)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  }[ch]));
}

function detectCurrency(s){
  s=(s||'').toUpperCase();
  if(/PLN|ZŁ|ZL/.test(s)) return 'PLN';
  if(/EUR/.test(s)) return 'EUR';
  if(/USD|\$/.test(s)) return 'USD';
  return 'PLN';
}
function toISO(d){
  if(!d) return ""; const s=String(d).trim();
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return m[0];
  m=s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if(m){const dd=m[1].padStart(2,'0'),mm=m[2].padStart(2,'0'),yy=m[3].length===2?('20'+m[3]):m[3]; return yy+'-'+mm+'-'+dd;}
  const months = {
    'stycznia':'01','lutego':'02','marca':'03','kwietnia':'04','maja':'05','czerwca':'06','lipca':'07','sierpnia':'08','września':'09','pazdziernika':'10','października':'10','listopada':'11','grudnia':'12',
    'января':'01','февраля':'02','марта':'03','апреля':'04','мая':'05','июня':'06','июля':'07','августа':'08','сентября':'09','октября':'10','ноября':'11','декабря':'12'
  };
  let md = s.match(/(\d{1,2})\s+([A-Za-zА-Яа-яęóąśłżźćńё]+)\s+(\d{4})/);
  if(md){ const dd=md[1].padStart(2,'0'); const mm=months[(md[2]||'').toLowerCase()]||'01'; return md[3]+'-'+mm+'-'+dd; }
  const p=Date.parse(s); if(!isNaN(p)) return new Date(p).toISOString().slice(0,10);
  return "";
}
function fmtAmountRaw(raw){
  const n=asNum(raw); if(!Number.isFinite(n)) return '<span>—</span>';
  const sign=n<0?'-':'+', cls=n<0?'amt-neg':'amt-pos';
  const abs=Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g," ");
  return `<span class="${cls}">${sign} ${abs}</span>`;
}
function smartSplit(line,del){
  let out=[],cur="",q=false;
  for(let i=0;i<line.length;i++){const ch=line[i]; if(ch==='"'){q=!q;continue} if(ch===del && !q){out.push(cur);cur="";} else cur+=ch;}
  out.push(cur); return out;
}
function parseCSV(text){
  if(!text) return []; text=text.replace(/^\uFEFF/,'').replace(/\r/g,"");
  const lines=text.split("\n").filter(l=>l.trim()); if(!lines.length) return [];
  const sep=(lines[0].split(";").length>lines[0].split(",").length)?";":",";
  const head=smartSplit(lines.shift(),sep).map(h=>h.trim());
  return lines.map(line=>{
    const cells=smartSplit(line,sep); const obj={};
    head.forEach((h,i)=>{let v=(cells[i]||"").trim(); v=v.replace(/\u00A0/g,' ').trim(); obj[h]=v;}); return obj;
  });
}
function parseMT940(text){
  if(!text) return [];
  text = text.replace(/\r/g,"");
  const lines = text.split("\n");
  const out = [];
  let current = null;

  function pushCurrent(){
    if(!current) return;
    if(current.date && current.amount){
      out.push({
        "Data": current.date,
        "Kwota": current.amount,
        "Opis": current.desc || "",
        "Kontrahent": current.cp || "",
        "_src": "mt940"
      });
    }
    current = null;
  }

  for(const raw of lines){
    const line = raw.trim();
    if(!line) continue;

    if(line.startsWith(":61:")){
      pushCurrent();
      const body = line.slice(4);
      const m = body.match(/^(\d{6})(\d{4})?([DC])([0-9,.,]+)(.*)$/);
      if(!m){
        continue;
      }
      const yy = parseInt(m[1].slice(0,2),10);
      const mm = m[1].slice(2,4);
      const dd = m[1].slice(4,6);
      const year = yy < 70 ? 2000 + yy : 1900 + yy;
      const dateStr = year + "-" + mm + "-" + dd;
      let amt = String(m[4] || "").replace(',', '.');
      if(m[3] === 'D'){
        if(amt[0] !== '-') amt = "-" + amt;
      }
      current = { date: dateStr, amount: amt, desc: "" };
    }else if(line.startsWith(":86:")){
      if(!current) continue;
      const payload = line.slice(4).trim();
      current.desc = current.desc ? (current.desc + " " + payload) : payload;
    }else{
      if(current && line){
        current.desc = current.desc ? (current.desc + " " + line) : line;
      }
    }
  }

  pushCurrent();
  return out;
}




