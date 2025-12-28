// OneTapDay front-end main script
window.__OTD_PATCH = 'P0_XLSX_SIGN_DATE_2025-12-17';
let _trendSeries = null;
let _trendColor = '#47b500';

// Extracted from app.html (v15 helper theme)

/* ==== CONFIG / API ==== */
const API_BASE = '/api';
const SUB_KEY    = 'otd_sub_active';
const SUB_FROM   = 'otd_sub_from';
const SUB_TO     = 'otd_sub_to';
const DEMO_START = 'otd_demo_started_at';
const DEMO_USED  = 'otd_demo_used'; // флаг: демо уже один раз запускали
const USER_KEY = 'otd_user'; // email
const ROLE_KEY = 'otd_role';
// ==== i18n helpers (PL default) ====
// Uses window.i18n from /public/i18n_pack/i18n.js (returns key when missing).
function _interp(str, vars){
  if (!vars || typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null) ? String(vars[k]) : m);
}
function TT(key, vars, fallback){
  try{
    if (window.i18n && typeof i18n.t === 'function'){
      const v = i18n.t(key, vars);
      if (v === key && fallback != null) return _interp(fallback, vars);
      return v;
    }
  }catch(e){}
  if (fallback != null) return _interp(fallback, vars);
  return key;
}

const STATUS_KEY = 'otd_status';
let REMOTE_OK = localStorage.getItem('remote_disabled')==='1' ? false : true;
let CLOUD_READY = false;

/* ==== I18N ==== */
// Old i18n system (M.* dictionaries) removed - now using i18n.js with JSON files

/* LANGUAGE APPLY */
function refreshSpendingI18n(){
  // Spending category chips are rendered dynamically and may appear before i18n JSON is loaded.
  // When language loads (otd:lang), re-render the spending UI so labels are translated immediately.
  try{
    const active = (window._otdSpendingActiveCatId || '');
    if (typeof renderSpendingFilters === 'function') renderSpendingFilters(active || '');
    if (typeof renderSpendingStats === 'function') renderSpendingStats(active ? active : null);
    if (typeof window._otdUpdateUncatBadge === 'function') window._otdUpdateUncatBadge();
  }catch(e){}
}

(function bindLangRerender(){
  if (window.__otd_lang_rerender_bound) return;
  window.__otd_lang_rerender_bound = true;
  document.addEventListener('otd:lang', () => {
    try{ refreshSpendingI18n(); }catch(e){}
  });
})();

/* LANGUAGE APPLY */
function applyLang(lang){
  // Use the new i18n system
  if (window.i18n) {
    window.i18n.load(lang).then(() => {
      // Translations are applied automatically by i18n.apply()
      if (typeof renderCashExamples==='function') renderCashExamples(lang);
      try{ refreshSpendingI18n(); }catch(e){}
    });
  }
}


/* ==== THEME & HELPER STATE ==== */
const THEME_KEY = 'otd_theme';

function applyTheme(theme){
  const body = document.body;
  if(!body) return;
  body.classList.remove('theme-light');
  if(theme==='light'){
    body.classList.add('theme-light');
  }
  localStorage.setItem(THEME_KEY, theme);
  const sel = $id('themeSelect');
  if(sel){
    sel.value = theme;
  }
}

function initTheme(){
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(saved);
}

/* ==== INLINE HELP CONTENT ==== */
const HELP_ANSWERS = {
  ritual:{
    pl:{
      q:"Jak używać OneTapDay na co dzień?",
      a:"Każdego dnia robisz 3 rzeczy: 1) Klikasz 'Dodaj dzisiejsze ruchy' i dodajesz wyciąg bankowy, ruchy kasy lub faktury. 2) Klikasz 'Znajdź i potwierdź płatności' – system dopasuje przelewy do faktur i zaktualizuje statusy. 3) Klikasz 'Zamknij dzień' – widzisz wynik dnia, ryzyko, dni bezpieczeństwa i cel na jutro."
    },
    en:{
      q:"How to use OneTapDay every day?",
      a:"Every day you do 3 steps: 1) Click 'Add today movements' and add bank statement, cash movements or invoices. 2) Click 'Find & confirm payments' – the app matches transfers to invoices and updates statuses. 3) Click 'Close day' – you see daily result, risk, safety days and target for tomorrow."
    },
    ru:{
      q:"Как пользоваться OneTapDay каждый день?",
      a:"Каждый день у тебя 3 шага: 1) Нажимаешь 'Добавить движения за сегодня' и добавляешь выписку банка, движения кассы или счета. 2) Нажимаешь 'Найти и подтвердить платежи' – система сама сопоставит платежи со счетами и обновит статусы. 3) Нажимаешь 'Закрыть день' – видишь итог дня, риск, дни безопасности и цель на завтра."
    },
    uk:{
      q:"Як користуватися OneTapDay щодня?",
      a:"Щодня ти робиш 3 кроки: 1) Натискаєш 'Додати рухи за сьогодні' і додаєш виписку банку, касу або рахунки. 2) Натискаєш 'Знайти та підтвердити платежі' – система зіставляє платежі з рахунками. 3) Натискаєш 'Закрити день' – бачиш результат дня, ризик, дні безпеки та ціль на завтра."
    }
  },
  sync:{
    pl:{
      q:"Co to jest „Synchronizacja”?",
      a:"Synchronizacja odświeża dane z chmury: wyciągi, faktury, ustawienia. Używasz jej gdy pracujesz na kilku urządzeniach lub po imporcie danych z innego miejsca. Jeśli pracujesz tylko na jednym telefonie, zwykle wystarczy kliknąć raz na dzień."
    },
    en:{
      q:"What is 'Synchronisation'?",
      a:"Synchronisation refreshes data from the cloud: statements, invoices, settings. Use it when you work on multiple devices or after importing data elsewhere. If you use only one device, pressing it once per day is usually enough."
    },
    ru:{
      q:"Что такое «Синхронизация»?",
      a:"Синхронизация обновляет данные из облака: выписки, счета, настройки. Нажимай, если работаешь с нескольких устройств или только что что-то импортировал. Если ты работаешь с одного телефона, обычно достаточно раз в день."
    },
    uk:{
      q:"Що таке «Синхронізація»?",
      a:"Синхронізація оновлює дані з хмари: виписки, рахунки, налаштування. Натискай, якщо працюєш з кількох пристроїв або щось імпортував. Якщо один телефон – достатньо раз на день."
    }
  },
  match:{
    pl:{
      q:"Co to są „dopasowania płatności”?",
      a:"To połączenia między operacjami z wyciągu a fakturami. OneTapDay szuka przelewów, które pasują do kwoty i kontrahenta faktury, i oznacza faktury jako opłacone. Dzięki temu nie musisz ręcznie śledzić, co już zapłaciłeś."
    },
    en:{
      q:"What are 'payment matches'?",
      a:"These are links between statement operations and invoices. OneTapDay searches for transfers that match invoice amount and counterparty and marks invoices as paid, so you do not track it manually."
    },
    ru:{
      q:"Что такое «допасывания платежей»?",
      a:"Это связи между операциями по выписке и счетами. OneTapDay ищет платежи, которые совпадают по сумме и контрагенту, и помечает счета как оплаченные. Тебе не нужно вручную отслеживать, что уже оплачено."
    },
    uk:{
      q:"Що таке «співставлення платежів»?",
      a:"Це звʼязки між операціями з виписки та рахунками. OneTapDay шукає платежі, які збігаються за сумою та контрагентом, і позначає рахунки як оплачені."
    }
  },
  close_day:{
    pl:{
      q:"Po co przycisk „Zamknij dzień”?",
      a:"Zamknięcie dnia robi podsumowanie: wynik dnia (ile weszło, ile wyszło), 7 i 30 dni płatności do przodu, poziom ryzyka oraz cel na jutro. Jeśli codziennie zamykasz dzień – zawsze wiesz, czy biznes żyje, czy wchodzisz w minus."
    },
    en:{
      q:"Why do I need 'Close day'?",
      a:"Closing the day shows a summary: daily result, payments for the next 7 and 30 days, risk level and target for tomorrow. If you close every day, you always know if the business is alive or going into red."
    },
    ru:{
      q:"Зачем нужна кнопка «Закрыть день»?",
      a:"Закрытие дня делает срез: итог дня (сколько пришло, сколько ушло), платежи на 7 и 30 дней вперёд, уровень риска и цель на завтра. Если закрывать каждый день – ты всегда видишь, жив бизнес или летит в минус."
    },
    uk:{
      q:"Навіщо кнопка «Закрити день»?",
      a:"Закриття дня дає зріз: результат дня, платежі на 7 і 30 днів вперед, рівень ризику і ціль на завтра."
    }
  },
  risk:{
    pl:{
      q:"Co oznacza kolor ryzyka i dni bezpieczeństwa?",
      a:"Zielony – masz pieniądze na wszystkie płatności w 30 dni. Żółty – starczy na 7 dni, ale nie na cały miesiąc. Czerwony – nie ma pieniędzy na najbliższe 7 dni. Liczba dni bezpieczeństwa pokazuje, ile dni biznes przeżyje przy obecnym tempie, zanim zabraknie na zobowiązania."
    },
    en:{
      q:"What do risk colour and safety days mean?",
      a:"Green – you can cover all payments in the next 30 days. Yellow – you cover only about 7 days. Red – you do not have money for the next 7 days. Safety days tell you how many days your business survives with current cash versus upcoming payments."
    },
    ru:{
      q:"Что значит цвет риска и «дни безопасности»?",
      a:"Зелёный – денег хватает на все платежи в ближайшие 30 дней. Жёлтый – хватает примерно на 7 дней, но не на месяц. Красный – не хватает даже на ближайшую неделю. Дни безопасности показывают, сколько дней бизнес проживёт при текущем запасе денег."
    },
    uk:{
      q:"Що означає колір ризику та «дні безпеки»?",
      a:"Зелений – грошей вистачає на всі платежі у 30 днів. Жовтий – вистачає приблизно на тиждень. Червоний – не вистачає навіть на найближчі 7 днів. Дні безпеки показують, скільки днів бізнес проживе з поточним запасом грошей."
    }
  },
  export:{
    pl:{
      q:"Po co eksport CSV / księgi?",
      a:"Eksport księgi robi plik CSV z wszystkimi ruchami: bank, kasa, faktury. Ten plik możesz wysłać księgowej, wczytać do innego systemu lub trzymać jako backup. To twój dziennik finansowy w jednym pliku."
    },
    en:{
      q:"Why export CSV / ledger?",
      a:"Ledger export creates a CSV file with all movements: bank, cash, invoices. You can send it to your accountant, import into other software or keep as a backup."
    },
    ru:{
      q:"Зачем экспорт CSV / книги?",
      a:"Экспорт книги делает CSV-файл со всеми движениями: банк, касса, счета. Его можно отправить бухгалтеру, загрузить в другую систему или хранить как резервную копию."
    },
    uk:{
      q:"Навіщо експорт CSV / книги?",
      a:"Експорт книги створює CSV з усіма рухами: банк, каса, рахунки. Можна передати бухгалтеру або імпортувати в інші системи."
    }
  },
  cash:{
    pl:{
      q:"Jak pracować z kasą (gotówką)?",
      a:"W zakładce Kasa zapisujesz każdy ruch gotówki: przyjęcie (sprzedaż, wpłata do kasy) i wydanie (zakup, wypłata z kasy). Te ruchy liczą się do dostępnych pieniędzy i podsumowań dnia. Jeśli nie zapisujesz kasy – widzisz tylko część obrazu."
    },
    en:{
      q:"How to work with cash?",
      a:"In the Cash tab you record every cash movement: in (sales, deposit) and out (purchases, withdrawals). Cash is added to available money and daily summaries. If you do not record cash, you only see part of the picture."
    },
    ru:{
      q:"Как работать с кассой (наличкой)?",
      a:"Во вкладке Касса ты записываешь каждое движение налички: приход (продажа, внесение) и расход (покупка, выдача). Эти движения входят в доступные деньги и итоги дня. Если не вести кассу – ты видишь только часть картины."
    },
    uk:{
      q:"Як працювати з касою (готівкою)?",
      a:"У вкладці Каса ти фіксуєш кожен рух готівки: прихід і витрату. Ці рухи входять у доступні гроші та підсумки дня."
    }
  }
};

function getCurrentLang(){
  return localStorage.getItem('otd_lang') || 'pl';
}

function getHelpText(topicKey){
  const lang = getCurrentLang();
  const t = (HELP_ANSWERS[topicKey] && (HELP_ANSWERS[topicKey][lang] || HELP_ANSWERS[topicKey].pl)) || null;
  return t;
}

function showHelpTopic(topicKey){
  const box = $id('helperAnswer');
  if(!box){ return; }
  const t = getHelpText(topicKey);
  if(!t){
    box.innerHTML = '<div>Brak odpowiedzi na to pytanie. Jeśli chcesz, napisz do nas: support@onetapday.com.</div>';
    return;
  }
  box.innerHTML = '<div><strong>'+t.q+'</strong></div><div style="margin-top:4px">'+t.a+'</div>';
}

function toggleHelper(open){
  const panel = $id('helperPanel');
  if(!panel) return;
  if(typeof open==='boolean'){
    panel.classList.toggle('show', open);
  }else{
    panel.classList.toggle('show');
  }
}

/* ==== INLINE HELP INIT ==== */
function initHelper(){
  const fab = $id('helperFab');
  const close = $id('helperClose');
  const topics = document.querySelectorAll('#helperTopics .helper-chip');
  const search = $id('helperSearch');
  fab && fab.addEventListener('click', ()=>toggleHelper());
  close && close.addEventListener('click', ()=>toggleHelper(false));
  topics.forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const key = chip.getAttribute('data-topic');
      if(key) showHelpTopic(key);
    });
  });
  if(search){
    search.addEventListener('keydown', e=>{
      if(e.key==='Enter'){
        const q = (search.value||'').toLowerCase();
        if(!q) return;
        // bardzo proste mapowanie słów kluczowych
        if(q.includes('sync')||q.includes('synchron')||q.includes('синх')) showHelpTopic('sync');
        else if(q.includes('dopas')||q.includes('match')||q.includes('сопост')||q.includes('співстав')) showHelpTopic('match');
        else if(q.includes('zamkn')||q.includes('close')||q.includes('закрыть')||q.includes('закрити')) showHelpTopic('close_day');
        else if(q.includes('ryzyk')||q.includes('risk')||q.includes('безоп')||q.includes('ризик')) showHelpTopic('risk');
        else if(q.includes('csv')||q.includes('eksport')||q.includes('export')||q.includes('книга')) showHelpTopic('export');
        else if(q.includes('kasa')||q.includes('cash')||q.includes('налич')) showHelpTopic('cash');
        else if(q.includes('jak')||q.includes('how')||q.includes('как')||q.includes('як')) showHelpTopic('ritual');
        else showHelpTopic('ritual');
      }
    });
  }
}
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




// ===== TX CSV IMPORT SAFE (MVP) =====
function getTxCsvHeader(text){
  text = String(text||"").replace(/^\uFEFF/,'').replace(/\r/g,"");
  const lines = text.split("\n").filter(l=>l.trim());
  if(!lines.length) return [];
  const sep=(lines[0].split(";").length>lines[0].split(",").length)?";":",";
  return smartSplit(lines[0], sep).map(h=>h.trim());
}

function runTxCsvWizard(header){
  const cleanHeader = (Array.isArray(header) ? header : []).map(h => String(h||"").trim());
  const lower = cleanHeader.map(h => h.toLowerCase());

  function findIndex(candidates){
    // сначала точные совпадения
    for(let i=0;i<lower.length;i++){
      const h = lower[i];
      for(const cand of candidates){
        if(h === cand) return i;
      }
    }
    // потом "похоже на" (для created/available_on и т.п.)
    for(let i=0;i<lower.length;i++){
      const h = lower[i];
      for(const cand of candidates){
        if(h.includes(cand) && h.length <= cand.length + 8){
          return i;
        }
      }
    }
    return -1;
  }

  // дата: PLN-банки + Stripe (created / available_on)
  const dateIdxAuto = findIndex([
    "data księgowania","data zaksięgowania","data operacji",
    "data","date","дата","available_on","created"
  ]);

  // сумма: PLN-банки + Stripe (amount / net)
  const amountIdxAuto = findIndex([
    "kwota","kwота","amount","kwota_raw","net"
  ]);

  // описание
  const descIdxAuto = findIndex([
    "opis","tytuł","tytul","description","statement_descriptor","details"
  ]);

  // контрагент
  const cpIdxAuto = findIndex([
    "kontrahent","nazwa kontrahenta","counterparty",
    "customer","client","sender","recipient","email"
  ]);

  // если нашли хотя бы дату и сумму — предлагаем автонастройку
  if(dateIdxAuto >= 0 && amountIdxAuto >= 0){
    const lines = cleanHeader.map((h,i)=> i + ": " + h).join("\n");
    let autoInfo =
      "Попробовал автоматически подобрать колонки для выписки.\n\n" +
      "Дата: " + dateIdxAuto + " → " + cleanHeader[dateIdxAuto] + "\n" +
      "Сумма: " + amountIdxAuto + " → " + cleanHeader[amountIdxAuto] + "\n";

    if(descIdxAuto >= 0){
      autoInfo += "Описание: " + descIdxAuto + " → " + cleanHeader[descIdxAuto] + "\n";
    }
    if(cpIdxAuto >= 0){
      autoInfo += "Контрагент: " + cpIdxAuto + " → " + cleanHeader[cpIdxAuto] + "\n";
    }

    autoInfo += "\nЕсли всё ок, нажмите OK. Если нет — нажмите Cancel, и можно будет выбрать колонки вручную.\n\n" +
      "Колонки:\n" + lines;

    const useAuto = confirm(autoInfo);
    if(useAuto){
      return {
        dateIdx: dateIdxAuto,
        amountIdx: amountIdxAuto,
        descIdx: descIdxAuto >= 0 ? descIdxAuto : -1,
        cpIdx: cpIdxAuto >= 0 ? cpIdxAuto : -1
      };
    }
  }

  // fallback: старый ручной режим, но с подсказками по индексам
  const list = cleanHeader.map((h,i)=> `${i}: ${h}`).join("\n");
  alert(
    "Файл выписки не распознан автоматически.\n" +
    "Выберите колонки вручную.\n\n" +
    "Колонки:\n" + list
  );

  const dateIdx = Number(
    prompt(TT("prompts.col_date", {list:list}, "Номер колонки ДАТЫ:\n\n{list}"), String(dateIdxAuto >= 0 ? dateIdxAuto : 0))
  );
  const amountIdx = Number(
    prompt(TT("prompts.col_amount", {list:list}, "Номер колонки СУММЫ:\n\n{list}"), String(amountIdxAuto >= 0 ? amountIdxAuto : 1))
  );
  const descIdx = Number(
    prompt(TT("prompts.col_desc", {list:list}, "Номер колонки ОПИСАНИЯ (можно пусто):\n\n{list}"), String(descIdxAuto >= 0 ? descIdxAuto : 2))
  );
  const cpIdx = Number(
    prompt(TT("prompts.col_counterparty", {list:list}, "Номер колонки КОНТРАГЕНТА (можно пусто):\n\n{list}"), String(cpIdxAuto >= 0 ? cpIdxAuto : 3))
  );

  if(Number.isNaN(dateIdx) || Number.isNaN(amountIdx)) return null;

  return {
    dateIdx,
    amountIdx,
    descIdx: Number.isNaN(descIdx) ? -1 : descIdx,
    cpIdx: Number.isNaN(cpIdx) ? -1 : cpIdx
  };
}


function buildTxFromMapping(text, m){
  text = String(text||"").replace(/^\uFEFF/,'').replace(/\r/g,"");
  const lines = text.split("\n").filter(l=>l.trim());
  if(lines.length < 2) return [];

  const sep=(lines[0].split(";").length>lines[0].split(",").length)?";":",";
  lines.shift(); // header line

  const out=[];
  lines.forEach(line=>{
    const cells = smartSplit(line, sep);

    const date = (cells[m.dateIdx]||"").trim();
    const amountRaw = (cells[m.amountIdx]||"").trim();
    if(!date || !amountRaw) return;

    const amount = (typeof asNum === "function")
      ? asNum(amountRaw)
      : Number(String(amountRaw).replace(",", "."));

    if(!amount) return;

    const desc = m.descIdx>=0 ? (cells[m.descIdx]||"").trim() : "";
    const cp = m.cpIdx>=0 ? (cells[m.cpIdx]||"").trim() : "";

    out.push({
      "Data": date,
      "Kwota": amount,
      "Opis": desc,
      "Kontrahent": cp,
      "_src": "csv_wizard"
    });
  });

  return out;
}

function importTxCsvSafe(text){
  const rows = parseCSV(text);

  // Проверка: есть ли хотя бы одна строка с нормальной датой и суммой
  const ok = rows.some(r=>{
    const d = toISO(getVal(r,["Data księgowania","Data","date","Дата"]));
    const a = asNum(getVal(r,["Kwota","Kwота","amount","Kwota_raw"])||0);
    return !!d && !!a;
  });

  if(ok) return rows;

  const header = getTxCsvHeader(text);
  if(!header.length) return [];

  const m = runTxCsvWizard(header);
  if(!m) return [];

  return buildTxFromMapping(text, m);
}
function buildTxPreviewText(rows){
  const arr = Array.isArray(rows) ? rows : [];
  const sample = arr.slice(0, 10);

  const keys = sample[0] ? Object.keys(sample[0]) : [];
  const showKeys = keys.slice(0, 6);

  let txt = "Превью импорта (первые " + sample.length + " из " + arr.length + ")\n\n";

  if(showKeys.length){
    txt += "Колонки: " + showKeys.join(", ") + (keys.length > showKeys.length ? "..." : "") + "\n\n";
  }

  sample.forEach((r, i)=>{
    const line = showKeys.length
      ? showKeys.map(k => String(r[k] ?? "")).join(" | ")
      : JSON.stringify(r);

    txt += (i+1) + ") " + line + "\n";
  });

  return txt;
}

function confirmTxImport(rows){
  const preview = buildTxPreviewText(rows);
  return confirm(TT("dialogs.import_txs_confirm", {preview: preview}, preview + "\n\nИмпортировать эти операции?"));
}

// ===== /TX CSV IMPORT SAFE =====

async function importTxByFile(f){
  // MVP safety: limit file size to reduce risk of XLSX/regex DoS
  const MAX_IMPORT_MB = 5;
  const MAX_IMPORT_BYTES = MAX_IMPORT_MB * 1024 * 1024;

  if(f && f.size && f.size > MAX_IMPORT_BYTES){
    alert(TT("alerts.file_too_big_mvp", {mb: MAX_IMPORT_MB}, "Файл слишком большой для MVP-импорта ({mb}MB). Рекомендуем экспортировать CSV."));
    return [];
  }

  const name = String(f?.name || "").toLowerCase();

  // 1) MT940
  if(name.endsWith(".mt940") || name.endsWith(".sta") || name.includes("mt940")){
    const text = await f.text();

    // если у тебя есть парсер MT940
    if(typeof parseMT940 === "function"){
      const rows = parseMT940(text);
      return Array.isArray(rows) ? rows : [];
    }

    // лёгкая эвристика
    if(text.includes(":61:") || text.includes(":86:")){
      alert(TT("alerts.mt940_not_supported", null, "Похоже на MT940, но парсер не подключён в этой версии."));
      return [];
    }
  }

// 2) XLSX
if(name.endsWith(".xlsx") || name.endsWith(".xls")){
  if(typeof XLSX !== "undefined"){
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];

    // читаем как 2D массив
    const table = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    if(!table.length){
      alert(TT("alerts.xlsx_empty", null, "Пустой XLSX."));
      return [];
    }

    // если первая строка выглядит как заголовок-описание выписки
    let headerRowIndex = 0;
    const firstCell = String((table[0] && table[0][0]) || "").toLowerCase();
    if(firstCell.includes("виписка") || firstCell.includes("выписка") || firstCell.includes("statement")){
      headerRowIndex = 1;
    }

    const header = (table[headerRowIndex] || []).map(h => String(h || "").trim());
    const dataRows = table.slice(headerRowIndex + 1);

    const json = dataRows.map(row=>{
      const o = {};
      header.forEach((h, i)=>{
        if(h) o[h] = row[i];
      });
      return o;
    }).filter(o => Object.keys(o).length);

    return json;
  }

  alert(TT("alerts.xlsx_not_supported", null, "XLSX не поддерживается в этой сборке (библиотека не подключена)."));
  return [];
}


  // 3) CSV и всё текстовое
  const text = await f.text();

  // если это выглядит как MT940 по содержимому
  if(text.includes(":61:") || text.includes(":86:")){
    if(typeof parseMT940 === "function"){
      const rows = parseMT940(text);
      return Array.isArray(rows) ? rows : [];
    }
  }

  // основной безопасный путь
  if(typeof importTxCsvSafe === "function"){
    return importTxCsvSafe(text) || [];
  }

  // fallback на старый парсер, если вдруг так
  if(typeof parseCSV === "function"){
    return parseCSV(text) || [];
  }

  return [];
}

function getVal(obj,keys){
  if(!obj) return ""; for(const k of keys){ if(k in obj && String(obj[k]).trim()!=="") return obj[k]; }
  const low=Object.keys(obj).reduce((m,x)=>(m[x.toLowerCase()]=obj[x],m),{});
  for(const k of keys){const kk=k.toLowerCase(); if(kk in low && String(low[kk]).trim()!="") return low[kk];}
  return "";
}


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
function analyticsLabel(days){
  if (days <= 30) return 'Ostatnie 30 dni';
  if (days <= 90) return 'Ostatnie 90 dni';
  return 'Ostatnie 12 miesięcy';
}
function setAnalyticsButtons(days){
  const b30 = document.getElementById('analyticsRange30');
  const b90 = document.getElementById('analyticsRange90');
  const b365 = document.getElementById('analyticsRange365');
  if (b30) b30.className = 'btn ghost';
  if (b90) b90.className = 'btn ghost';
  if (b365) b365.className = 'btn ghost';
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

function _buildPeriodPack(days){
  const {start, end, list} = _rangeIsoDays(days);

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

  return {days, start, end, list, series, income, expense, net};
}

function renderAnalytics(){
  const days = getAnalyticsDays();
  setAnalyticsButtons(days);

  const labelEl = document.getElementById('analyticsRangeLabel');
  if(labelEl) labelEl.textContent = analyticsLabel(days);

  const pack = _buildPeriodPack(days);

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
  const nonZero = series.some(p => !!p.value);

  if(!series.length || !nonZero){
    wrap.innerHTML = '<div class="analyticsEmpty">Brak danych do wykresu. Załaduj wyciąg lub dodaj ruch w kasie.</div>';
    if(chip){
      chip.textContent = '—';
      chip.className = 'trendChip';
    }
    if(movementEl) movementEl.textContent = '—';
    return;
  }

  const values = series.map(p=>p.value);
  const max = Math.max.apply(null, values);
  const min = Math.min.apply(null, values);
  const range = (max - min) || 1;

  const pts = series.map((p, idx)=>{
    const x = series.length === 1 ? 50 : (idx/(series.length-1))*100;
    const norm = (p.value - min)/range;
    const y = 92 - norm*72;
    return x.toFixed(2)+','+y.toFixed(2);
  }).join(' ');

  const up = (pack.net || 0) >= 0;
  const color = up ? 'var(--accent)' : '#ff4f4f';

  if(chip){
    chip.textContent = (up?'+':'') + _formatPLN(Math.abs(pack.net || 0)).replace(' PLN',' PLN');
    chip.className = 'trendChip ' + (up ? 'up' : 'down');
  }
  if(movementEl){
    movementEl.textContent = 'Netto: ' + (up?'+':'-') + _formatPLN(Math.abs(pack.net || 0));
  }

  const svg = `
<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Trend">
  <defs>
    <linearGradient id="aFill2" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.35"></stop>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"></stop>
    </linearGradient>
  </defs>
  <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></polyline>
  <polyline points="${pts} 100,100 0,100" fill="url(#aFill2)" stroke="none"></polyline>
</svg>`.trim();

  wrap.innerHTML = svg;
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
  const totalEl = document.getElementById('analyticsExpenseTotal');
  const centerValue = document.getElementById('analyticsDonutValue');
  const centerLabel = document.getElementById('analyticsDonutLabel');

  if(!donut || !listEl) return;

  const days = pack && pack.days ? pack.days : getAnalyticsDays();
  const {start, end} = _rangeIsoDays(days);

  const totals = {};
  const txArr = Array.isArray(tx) ? tx : [];
  const kasaArr = Array.isArray(kasa) ? kasa : [];

  // bank tx expenses
  txArr.forEach(r=>{
    const d = toISO(getVal(r,["Data księgowania","Data","date","Дата"]));
    if(!d) return;
    if(d < start || d > end) return;

    const amt = asNum(getVal(r,["Kwota","Kwота","amount","Kwota_raw"])||0);
    if(!amt || amt >= 0) return;

    const cat = (typeof resolveCategoryForTx === 'function') ? (resolveCategoryForTx(r) || 'uncat') : 'uncat';
    totals[cat] = (totals[cat] || 0) + Math.abs(amt);
  });

  // kasa expenses
  kasaArr.forEach(k=>{
    const d = String(k.date||"").slice(0,10);
    if(!d) return;
    if(d < start || d > end) return;

    const signed = (typeof getSignedKasaAmount === 'function') ? getSignedKasaAmount(k) : Number(k.amount||0);
    if(!signed || signed >= 0) return;

    const cat = (typeof resolveCategoryForKasa === 'function') ? (resolveCategoryForKasa(k) || 'uncat') : 'uncat';
    totals[cat] = (totals[cat] || 0) + Math.abs(signed);
  });

  const total = Object.values(totals).reduce((a,b)=>a+b,0);

  if(totalEl) totalEl.textContent = total ? ('Suma: ' + _formatPLN(total)) : '—';
  if(centerValue) centerValue.textContent = total ? _formatPLN(total) : '—';
  if(centerLabel) centerLabel.textContent = 'Wydatki';

  if(!total){
    donut.innerHTML = '<div class="analyticsEmpty">Brak danych wydatków w tym okresie.</div>';
    listEl.innerHTML = '';
    return;
  }

  // prepare parts (top 6 + 'inne')
  const cats = (typeof getAllSpCats === 'function') ? getAllSpCats() : [];
  const catMap = {};
  cats.forEach(c=>{ catMap[c.id] = c; });

  const rows = Object.keys(totals).map(id=>({
    id,
    name: (catMap[id] ? ((catMap[id].emoji||'') + ' ' + (catMap[id].label||id)) : (id==='uncat' ? ('⚠️ ' + TT('spending.uncat', null, 'Bez kategorii')) : id)),
    value: totals[id]
  })).sort((a,b)=>b.value - a.value);

  const top = rows.slice(0,6);
  const rest = rows.slice(6);
  if(rest.length){
    const restSum = rest.reduce((a,b)=>a+b.value,0);
    top.push({id:'rest', name:'📦 Inne', value:restSum});
  }

  // green shades
  const colors = top.map((_,i)=>{
    const light = 45 + (i*7);
    return `hsl(110, 90%, ${Math.min(light, 78)}%)`;
  });

  // svg donut
  const radius = 15.91549430918954; // 2*pi*r ~ 100
  let offset = 25; // start at top
  const segs = top.map((p, i)=>{
    const perc = Math.max(0.5, (p.value / total) * 100);
    const dash = `${perc} ${100 - perc}`;
    const seg = `<circle class="donutSeg" r="${radius}" cx="21" cy="21" fill="transparent"
      stroke="${colors[i]}" stroke-width="3.6" stroke-linecap="round"
      stroke-dasharray="${dash}" stroke-dashoffset="${offset}"></circle>`;
    offset -= perc;
    return seg;
  }).join('');

  donut.innerHTML = `
<svg class="donutSvg" viewBox="0 0 42 42" aria-label="Donut">
  <circle r="${radius}" cx="21" cy="21" fill="transparent" stroke="rgba(255,255,255,0.08)" stroke-width="3.6"></circle>
  ${segs}
</svg>`.trim();

  listEl.innerHTML = top.map((p, i)=>(
    `<div class="analyticsRow" data-a-cat="${p.id}" data-a-name="${encodeURIComponent(p.name)}" data-a-val="${p.value}">
      <div class="analyticsRowLeft">
        <span class="analyticsSwatch" style="background:${colors[i]}"></span>
        <span class="analyticsRowName">${p.name}</span>
      </div>
      <span class="analyticsRowAmt">${_formatPLN(p.value)}</span>
    </div>`
  )).join('');

  // click to focus
  listEl.querySelectorAll('.analyticsRow').forEach(row=>{
    row.addEventListener('click', ()=>{
      const val = Number(row.getAttribute('data-a-val')||0);
      const name = decodeURIComponent(row.getAttribute('data-a-name')||'');
      if(centerValue) centerValue.textContent = _formatPLN(val);
      if(centerLabel) centerLabel.textContent = name || 'Wydatki';
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

  const days = pack && pack.days ? pack.days : getAnalyticsDays();
  const {start, end} = _rangeIsoDays(days);

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

  if (b30) b30.addEventListener('click', ()=>{ setAnalyticsDays(30); renderAnalytics(); });
  if (b90) b90.addEventListener('click', ()=>{ setAnalyticsDays(90); renderAnalytics(); });
  if (b365) b365.addEventListener('click', ()=>{ setAnalyticsDays(365); renderAnalytics(); });

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

// ===== Categories & spending breakdown =====

const DEFAULT_SP_CATS = [
  {id:'food',  labelKey:'spending.cat_food',  emoji:'🍞'},
  {id:'fuel',  labelKey:'spending.cat_fuel',  emoji:'⛽'},
  {id:'home',  labelKey:'spending.cat_home',  emoji:'🏠'},
  {id:'subs',  labelKey:'spending.cat_subs',  emoji:'💳'},
  {id:'other', labelKey:'spending.cat_other', emoji:'📦'},
  {id:'salary',labelKey:'spending.cat_salary',emoji:'💰'}
];

function loadUserSpCats(){
  try{
    const raw = localStorage.getItem('otd_sp_cats');
    if(!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  }catch(e){
    console.warn('spcats load', e);
    return [];
  }
}

function saveUserSpCats(arr){
  try{
    localStorage.setItem('otd_sp_cats', JSON.stringify(arr || []));
  }catch(e){
    console.warn('spcats save', e);
  }
}

function getAllSpCats(){
  // user categories are stored in localStorage; make sure default categories stay language-aware
  let extra = loadUserSpCats();

  try{
    const defaultIds = new Set((DEFAULT_SP_CATS||[]).map(c=>String(c.id)));
    const known = {
      food:   ['Продукты','Produkty','Food','Продукти'],
      fuel:   ['Топливо','Paliwo','Fuel','Паливо'],
      home:   ['Дом','Dom','Home','Дім'],
      subs:   ['Подписки','Subskrypcje','Subscriptions','Підписки'],
      other:  ['Другое','Inne','Other','Інше'],
      salary: ['Зарплата','Wynagrodzenie','Salary','Зарплата']
    };
    extra = (Array.isArray(extra) ? extra : []).filter(c=>{
      const id = String((c && c.id) || '');
      if(!id) return false;
      if(!defaultIds.has(id)) return true;
      const lbl = String((c && c.label) || '').trim();
      if(!lbl) return false;
      const list = known[id] || [];
      // if the label equals one of the default translations, drop override and use i18n labelKey
      return !list.includes(lbl);
    });
  }catch(_e){}

  const byId = {};
  (DEFAULT_SP_CATS||[]).forEach(c=>byId[c.id]=c);
  (extra||[]).forEach(c=>byId[c.id]=c);
  return Object.values(byId);
}

function getCatById(id){
  if(!id) return null;
  const cats = getAllSpCats();
  return cats.find(c=>String(c.id)===String(id)) || null;
}
function resolveSpCatLabel(cat){
  if(!cat) return '';
  if(cat.labelKey){
    const v = TT(cat.labelKey);
    if(v && v !== cat.labelKey) return v;
  }
  return cat.label || cat.id || '';
}

function formatCatLabel(id){
  if(!id) return "—";
  const c = getCatById(id);
  if(!c) return id;
  const em = c.emoji || "📦";
  const lbl = resolveSpCatLabel(c) || id;
  return `${em} ${lbl}`;
}

function fillQuickCashCat(){
  const sel = $id('quickCashCat');
  if(!sel) return;
  const current = sel.value || "";
  const cats = getAllSpCats();
  sel.innerHTML = '';
  sel.appendChild(new Option(TT("cash.opt_category", null, "Категория"), ""));
  cats.forEach(c=>{
    sel.appendChild(new Option(`${c.emoji||"📦"} ${resolveSpCatLabel(c)||c.id}`, c.id));
  });
  sel.value = current;
}


let catModalState = null;

function getMerchantKeyFor(kind, obj){
  try{
    if(kind==='tx'){
      return String(getVal(obj,["Kontrahent","Counterparty"]) || getVal(obj,["Tytuł/Opis","Opis","title"]) || "").trim().toLowerCase();
    }
    if(kind==='bill'){
      return String(getVal(obj,["Dostawca","Supplier"]) || getVal(obj,["Numer faktury","Invoice number"]) || "").trim().toLowerCase();
    }
    if(kind==='kasa'){
      return String(obj.source || obj.comment || "").trim().toLowerCase();
    }
  }catch(e){}
  return "";
}

function openCatModal(kind, id){
  const sel = $id('catSelect');
  const chk = $id('catApplySame');
  const mSave = $id('catSaveBtn');
  const mCancel = $id('catCancelBtn');
  const overlay = $id('catModal');
  if(!sel || !overlay) return;

  // Always bring the category modal on top.
  // On mobile Safari, multiple overlays with the same z-index can make the picker appear “dead”.
  try{
    if(overlay.parentElement !== document.body) document.body.appendChild(overlay);
    else document.body.appendChild(overlay); // move to the end so it stays above other overlays
    overlay.style.zIndex = '99999';
  }catch(_){ }

  const cats = getAllSpCats();
  sel.innerHTML = '';
  sel.appendChild(new Option("— без категории —", ""));
  cats.forEach(c=>{
    const opt = new Option(`${c.emoji||"📦"} ${c.label||c.id}`, c.id);
    sel.appendChild(opt);
  });

  let currentObj = null;
  if(kind==='tx') currentObj = tx.find(x=> String(getVal(x,["ID transakcji","ID","id"])||"")===String(id));
  if(kind==='bill') currentObj = bills.find(x=> String(getVal(x,["Numer faktury","Numer фактуры","Invoice number"])||"")===String(id));
  if(kind==='kasa') currentObj = kasa.find(x=> String(x.id)===String(id));

  const currentCat = kind==='kasa' ? (currentObj?.category||"") : (getVal(currentObj,["Kategoria","Category","category"]) || "");
  sel.value = currentCat || "";
  if(chk) chk.checked = false;

  catModalState = {kind, id};

  overlay.classList.add('show');

  const close = ()=>{
    overlay.classList.remove('show');
    catModalState = null;
  };

  mCancel && (mCancel.onclick = close);

  mSave && (mSave.onclick = ()=>{
    if(!catModalState) return close();
    const newCat = sel.value || "";
    const applySame = chk && chk.checked;

    if(catModalState.kind==='kasa'){
      const idx = kasa.findIndex(x=> String(x.id)===String(catModalState.id));
      if(idx>=0){
        kasa[idx].category = newCat;
      }
      if(applySame){
        const key = getMerchantKeyFor('kasa', kasa[idx]||{});
        kasa.forEach(k=>{
          if(!k.category && getMerchantKeyFor('kasa', k)===key){
            k.category = newCat;
          }
        });
      }
    }

    if(catModalState.kind==='tx'){
      const idx = tx.findIndex(x=> String(getVal(x,["ID transakcji","ID","id"])||"")===String(catModalState.id));
      if(idx>=0){
        tx[idx]["Kategoria"] = newCat;
      }
      if(applySame){
        const key = getMerchantKeyFor('tx', tx[idx]||{});
        tx.forEach(r=>{
          const has = getVal(r,["Kategoria","Category","category"]);
          if(!has && getMerchantKeyFor('tx', r)===key){
            r["Kategoria"] = newCat;
          }
        });
      }
    }

    if(catModalState.kind==='bill'){
      const idx = bills.findIndex(x=> String(getVal(x,["Numer faktury","Numer фактуры","Invoice number"])||"")===String(catModalState.id));
      if(idx>=0){
        bills[idx]["Kategoria"] = newCat;
      }
      if(applySame){
        const key = getMerchantKeyFor('bill', bills[idx]||{});
        bills.forEach(r=>{
          const has = getVal(r,["Kategoria","Category","category"]);
          if(!has && getMerchantKeyFor('bill', r)===key){
            r["Kategoria"] = newCat;
          }
        });
      }
    }
if(catModalState.kind==='kasa'){
  const idx = (kasa || []).findIndex(x => String(x.id || '') === String(catModalState.id));
  if(idx >= 0){
    kasa[idx].category = newCat;
  }

  // applySame для кассы можно сделать мягко по comment/source
  if(applySame && idx >= 0){
    const key = getMerchantKeyFor ? getMerchantKeyFor('kasa', kasa[idx]||{}) : (
      (kasa[idx].source || kasa[idx].comment || "")
    );

    (kasa || []).forEach(r=>{
      const has = String(r.category || r.Kategoria || "").trim();
      const rKey = getMerchantKeyFor ? getMerchantKeyFor('kasa', r) : (r.source || r.comment || "");
      if(!has && rKey === key){
        r.category = newCat;
      }
    });
  }
}


    saveLocal(); render(); pushState();
    try{
      if(window._otdUpdateUncatBadge) window._otdUpdateUncatBadge();
      const um = document.getElementById('uncatModal');
      if(um && um.classList.contains('show') && window._otdRenderUncatList) window._otdRenderUncatList();
    }catch(e){}

    close();
  });
}

/* === CSV IMPORT LITE WIZARD (MVP) === */
function parseCsvRows(text){
  const lines = String(text||'').split(/\r?\n/).filter(l=>l.trim().length);
  if(lines.length < 2) return { header: [], rows: [], delim: ',' };

  const delim = (lines[0].includes(';') && !lines[0].includes(',')) ? ';' : ',';
  const header = lines[0].split(delim).map(s=>s.trim());
  const rows = lines.slice(1).map(l=> l.split(delim));
  return { header, rows, delim };
}

function guessColIndex(header, variants){
  const low = header.map(h=>String(h||'').toLowerCase());
  for(const v of variants){
    const i = low.indexOf(String(v).toLowerCase());
    if(i >= 0) return i;
  }
  return -1;
}

function runCsvMapWizard(header){
  const list = header.map((h,i)=> `${i}: ${h}`).join('\n');

  alert(
    "Файл не распознан автоматически.\n" +
    "Выберите колонки вручную.\n\n" +
    "Колонки:\n" + list
  );

  const dateIdx = Number(prompt(TT("prompts.col_date", {list:list}, "Номер колонки ДАТЫ:\n\n{list}"), "0"));
  const amountIdx = Number(prompt(TT("prompts.col_amount", {list:list}, "Номер колонки СУММЫ:\n\n{list}"), "1"));
  const descIdx = Number(prompt(TT("prompts.col_desc2", {list:list}, "Номер колонки ОПИСАНИЯ (если нет — оставь пустым):\n\n{list}"), "2"));
  const cpIdx = Number(prompt(TT("prompts.col_counterparty2", {list:list}, "Номер колонки КОНТРАГЕНТА (если нет — оставь пустым):\n\n{list}"), "3"));

  if(Number.isNaN(dateIdx) || Number.isNaN(amountIdx)){
    throw new Error("Wizard cancelled");
  }

  return {
    dateIdx,
    amountIdx,
    descIdx: Number.isNaN(descIdx) ? -1 : descIdx,
    cpIdx: Number.isNaN(cpIdx) ? -1 : cpIdx
  };
}

function buildTxFromMappedRows(header, rows, mapping){
  const out = [];
  rows.forEach((cells)=>{
    const date = (cells[mapping.dateIdx] || "").trim();
    const amountRaw = (cells[mapping.amountIdx] || "").trim();
    if(!date || !amountRaw) return;

    const amount = (typeof asNum === "function")
      ? asNum(amountRaw)
      : Number(String(amountRaw).replace(',', '.'));

    if(!amount) return;

    const desc = mapping.descIdx >= 0 ? (cells[mapping.descIdx] || "").trim() : "";
    const cp = mapping.cpIdx >= 0 ? (cells[mapping.cpIdx] || "").trim() : "";

    out.push({
      "Data": date,
      "Kwota": amount,
      "Opis": desc,
      "Kontrahent": cp,
      "_src": "csv_wizard"
    });
  });
  return out;
}

async function importTxCsvLiteWizard(text){
  const { header, rows } = parseCsvRows(text);
  if(!header.length) throw new Error("empty csv");

  let dateIdx = guessColIndex(header, ["data","date","booking date","transaction date"]);
  let amountIdx = guessColIndex(header, ["kwota","amount","suma","value"]);
  let descIdx = guessColIndex(header, ["opis","description","tytuł/opis","title"]);
  let cpIdx = guessColIndex(header, ["kontrahent","counterparty","nazwa"]);

  let mapping = { dateIdx, amountIdx, descIdx, cpIdx };

  if(dateIdx < 0 || amountIdx < 0){
    mapping = runCsvMapWizard(header);
  }

  const newTx = buildTxFromMappedRows(header, rows, mapping);
  if(!newTx.length) throw new Error("no rows parsed");
  return newTx;
}
/* === /CSV IMPORT LITE WIZARD === */

// Ручная привязка импортированных транзакций к счёту
function assignImportedTxToAccount(imported){
  if(!Array.isArray(imported) || !imported.length) return imported;

  accMeta = accMeta && typeof accMeta === "object" ? accMeta : {};

  // Собираем список счетов для выбора
  const ids = Object.keys(accMeta);
  const list = ids.map(id=>{
    const acc = accMeta[id] || {};
    const name = acc.name || id;
    const type = acc.type || "";
    const cur = acc.currency || acc.cur || "";
    let label = name;
    if(type) label += " ("+type+")";
    if(cur) label += " ["+cur+"]";
    return { id, label };
  });

  let chosenId = null;

  if(list.length === 0){
    // нет ни одного счёта — создаём тех-счёт для импортов
    if(!accMeta["imported_acc"]){
      accMeta["imported_acc"] = {
        name: "Imported account",
        type: "imported",
        currency: "PLN",
        include: true
      };
    }
    chosenId = "imported_acc";
  }else if(list.length === 1){
    // один счёт — не мучаем пользователя выбором
    chosenId = list[0].id;
  }else{
    // несколько счетов — даём человеку выбрать
    const msg =
      "К какому счёту относится эта выписка?\n\n" +
      list.map((a,idx)=> idx + ": " + a.label).join("\n") +
      "\n\nВведите номер счёта (или отмените, чтобы пропустить привязку).";

    const ans = prompt(msg, "0");
    if(ans === null){
      // пользователь отменил — ничего не трогаем
      return imported;
    }
    const idx = Number(ans);
    if(!Number.isNaN(idx) && idx >= 0 && idx < list.length){
      chosenId = list[idx].id;
    }
  }

  if(!chosenId) return imported;

  imported.forEach(t=>{
    if(t){
      if(!t._acc) t._acc = chosenId;
      // make account visible to exporters & account manager (most code reads 'ID konta')
      if(!getVal(t,["ID konta","IBAN","account"])) t["ID konta"] = chosenId;
    }
  });

  return imported;
}


// ===== AUTO ACCOUNTS FIX (MVP) =====
function normalizeAutoAccountsAfterImport(){
  try{
    tx = Array.isArray(tx) ? tx : [];
    accMeta = accMeta && typeof accMeta === "object" ? accMeta : {};

    // 1) соберём список аккаунтов, которые выглядят как мусор из inferAccounts
    const keys = Object.keys(accMeta);
    const txLike = keys.filter(k => /^tx-\d{4}-\d{2}-\d{2}/.test(String(k)));

    // если мусора мало - не трогаем
    if(txLike.length < 5) return;

    // 2) создаём единый тех-счёт
    if(!accMeta["imported_acc"]){
      accMeta["imported_acc"] = {
        name: "Imported account",
        currency: "PLN",
        type: "Biznes",
        start: 0
      };
    }

    // 3) помечаем транзакции без нормального счёта
    tx.forEach(r=>{
      if(!r) return;

      const hasAcc =
        (typeof getVal === "function" && getVal(r, [
          "ID konta","ID konta (lub IBAN)","Konto","Account","IBAN",
          "konto","account","iban","id konto","id.conto.iban.account.id"
        ])) ||
        r._acc;

      if(!hasAcc){
        r._acc = "imported_acc";
      }
    });

    // 4) удаляем мусорные авто-счета
    txLike.forEach(k => { delete accMeta[k]; });

    if(typeof saveLocal === "function") saveLocal();
  }catch(e){
    console.error("normalizeAutoAccountsAfterImport error", e);
  }
}
// ===== /AUTO ACCOUNTS FIX (MVP) =====
// ===== XLSX/CSV NORMALIZE TO TX SCHEMA (MVP) =====
function safeStr(x){ return String(x ?? "").trim(); }

function normalizeImportedTxRows(rows){
  const arr = Array.isArray(rows) ? rows : [];
  const out = [];

  arr.forEach(r=>{
    if(!r || typeof r !== "object") return;

    // дата
    const date =
      getVal(r, ["Data","Дата","Дата операції","Data księgowania","Date"]) || "";

    // описание
    const desc =
      getVal(r, ["Opis","Опис","Опис операції","Tytuł/Opis","description","Title"]) || "";

    // карта/счёт из файла (ключ к нормальным аккаунтам)
    const card =
      getVal(r, ["Картка","Karta","Card","Карта"]) || "";

    // суммы: сначала в валюте транзакции, потом карты
    const amountTxRaw =
      getVal(r, ["Kwota","amount","Kwota_raw",
                 "Сума","Сума в валюті транзакції","Сума в валюті операції"]) || "";

    const amountCardRaw =
      getVal(r, ["Сума в валюті картки","Сума в валюті карти","Сума в валюті рахунку","Сума в валюті картки/рахунку","Сума в валюті картки"]) || "";

    const currencyTx =
      getVal(r, ["Waluta","currency",
                 "Валюта","Валюта транзакції","Валюта операції"]) || "";

    const currencyCard =
      getVal(r, ["Валюта картки","Валюта карти","Валюта рахунку","Валюта картки"]) || "";

    const currency = safeStr(currencyTx || currencyCard) || "PLN";

    const cat =
      getVal(r, ["Kategoria","Category","category",
                 "Категорія","Категория"]) || "";

    const cp =
      getVal(r, ["Kontrahent","Counterparty","Контрагент"]) || "";

    const _n = (v)=> (typeof asNum === "function") ? asNum(v) : Number(String(v||"").replace(",", "."));
    const amtTx = _n(amountTxRaw);
    const amtCard = _n(amountCardRaw);

    // переносим знак: если в валюте транзакции нет минуса, но в валюте карты он есть — применяем минус к валюте транзакции
    let kw = 0;
    if(Number.isFinite(amtTx) && amtTx !== 0){
      kw = amtTx;
      if(kw > 0 && Number.isFinite(amtCard) && amtCard < 0) kw = -Math.abs(kw);
      if(kw < 0 && Number.isFinite(amtCard) && amtCard > 0) kw = -Math.abs(kw);
    } else if(Number.isFinite(amtCard) && amtCard !== 0){
      kw = amtCard;
    }

    // если вообще нечего нормализовать - пропускаем
    if(!safeStr(date) && !kw && !safeStr(desc)) return;

    const nr = { ...r };
    const iso = toISO(date);
    nr["Data"] = safeStr(iso || date);
    nr["date"] = safeStr(iso || "");
    if(iso) nr["Data księgowania"] = iso;
    if(iso) nr["Дата"] = iso;
    nr["Kwota"] = kw || 0;
    nr["Opis"] = safeStr(desc);
    nr["Kontrahent"] = safeStr(cp);
    nr["Waluta"] = safeStr(currency) || "PLN";
    if(cat) nr["Kategoria"] = safeStr(cat);

    // стабилизируем аккаунт по "Картка"
    if(card){
      const accId = "card_" + safeStr(card).toLowerCase().replace(/\s+/g,"_").slice(0,40);
      nr._acc = accId;
      nr._accLabel = safeStr(card);
      if(!getVal(nr,["ID konta","IBAN","account"])) nr["ID konta"] = accId;
    }

    out.push(nr);
  });

  return out;
}

function ensureCardAccountsFromTx(){
  accMeta = accMeta && typeof accMeta === "object" ? accMeta : {};
  const arr = Array.isArray(tx) ? tx : [];

  arr.forEach(r=>{
    if(!r || !r._acc || !String(r._acc).startsWith("card_")) return;

    if(!accMeta[r._acc]){
      const label = r._accLabel || r._acc;
      const cur = getVal(r, ["Waluta","Валюта","Валюта транзакції","Валюта картки"]) || "PLN";

      accMeta[r._acc] = {
        name: String(label),
        currency: String(cur),
        type: "Biznes",
        start: 0
      };
    }
  });
}

function dropTxGeneratedAccounts(){
  accMeta = accMeta && typeof accMeta === "object" ? accMeta : {};
  Object.keys(accMeta).forEach(k=>{
    if(/^tx-\d{4}-\d{2}-\d{2}/.test(String(k))){
      delete accMeta[k];
    }
  });
}
// ===== /XLSX/CSV NORMALIZE TO TX SCHEMA =====
// ===== BILLS IMPORT NORMALIZE (MVP) =====
function normalizeImportedBillsRows(rows){
  const arr = Array.isArray(rows) ? rows : [];
  const out = [];

  arr.forEach(r=>{
    if(!r || typeof r !== "object") return;

    const nr = { ...r };

    const number =
      getVal(r, ["Numer faktury","Nr faktury","Invoice number","Номер фактуры","Номер рахунку","Номер"]) || "";

    const date =
      getVal(r, ["Data","Date","Дата","Data wystawienia","Дата виставлення"]) || "";

    const due =
      getVal(r, ["Termin płatności","Due date","Срок оплаты","Термін оплати"]) || "";

    const seller =
      getVal(r, ["Kontrahent","Sprzedawca","Seller","Контрагент","Постачальник"]) || "";

    const amountRaw =
      getVal(r, ["Kwota","Amount","Suma","Сума","Kwota brutto","Brutto"]) || "";

    const currency =
      getVal(r, ["Waluta","Currency","Валюта"]) || "PLN";

    const cat =
      getVal(r, ["Kategoria","Category","category","Категорія","Категория"]) || "";

    const amount = (typeof asNum === "function")
      ? asNum(amountRaw)
      : Number(String(amountRaw).replace(",", "."));

    // Канонизируем ключи под твой UI
    if(number) nr["Numer faktury"] = String(number).trim();
    if(date) nr["Data"] = String(date).trim();
    if(due) nr["Termin płatności"] = String(due).trim();
    if(seller) nr["Kontrahent"] = String(seller).trim();

    nr["Kwota"] = amount || 0;
    nr["Waluta"] = String(currency || "PLN").trim();

    if(cat) nr["Kategoria"] = String(cat).trim();

    // Минимальный статус по умолчанию
    if(!getVal(nr, ["Status","status"])){
      nr["Status"] = "Oczekuje";
    }

    out.push(nr);
  });

  return out;
}

// Превью для фактур
function buildBillsPreviewText(rows){
  const arr = Array.isArray(rows) ? rows : [];
  const sample = arr.slice(0, 10);

  let txt = "Превью фактур (первые " + sample.length + " из " + arr.length + ")\n\n";

  sample.forEach((r, i)=>{
    const n = getVal(r, ["Numer faktury","Invoice number","Номер"]) || "";
    const d = getVal(r, ["Data","Дата"]) || "";
    const s = getVal(r, ["Kontrahent","Seller","Контрагент"]) || "";
    const a = getVal(r, ["Kwota","Amount","Suma","Сума"]) || 0;
    const c = getVal(r, ["Waluta","Currency","Валюта"]) || "PLN";

    txt += (i+1) + ") " + String(n) + " | " + String(d) + " | " + String(s) +
      " | " + String(a) + " " + String(c) + "\n";
  });

  return txt;
}

function confirmBillsImport(rows){
  const preview = buildBillsPreviewText(rows);
  return confirm(TT("dialogs.import_invoices_confirm", {preview: preview}, preview + "\n\nИмпортировать эти фактуры?"));
}

// Роутер фактур: используем твой общий импорт файлов
async function importBillsByFile(f){
  // safety лимит, если ты уже вставлял - дубль не страшен
  const MAX_IMPORT_MB = 5;
  const MAX_IMPORT_BYTES = MAX_IMPORT_MB * 1024 * 1024;
  if(f && f.size && f.size > MAX_IMPORT_BYTES){
    alert(TT("alerts.file_too_big_mvp_short", {mb: MAX_IMPORT_MB}, "Файл слишком большой для MVP-импорта ({mb}MB). Рекомендуем CSV."));
    return [];
  }

  // Если у тебя уже есть универсальный роутер
  if(typeof importTxByFile === "function"){
    return await importTxByFile(f);
  }

  // Фоллбек
  const name = String(f?.name || "").toLowerCase();
  if(name.endsWith(".xlsx") || name.endsWith(".xls")){
    if(typeof XLSX === "undefined"){
      alert(TT("alerts.xlsx_not_supported", null, "XLSX не поддерживается в этой сборке (библиотека не подключена)."));
      return [];
    }
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
    return Array.isArray(json) ? json : [];
  }

  const text = await f.text();
  if(typeof parseCSV === "function") return parseCSV(text) || [];
  return [];
}
// ===== /BILLS IMPORT NORMALIZE =====


const MERCHANT_MAP = {
  'żabka':'food',
  'zabka':'food',
  'biedronka':'food',
  'lidl':'food',
  'carrefour':'food',
  'kaufland':'food',
  'auchan':'food',
  'hebe':'food',
  'rossmann':'home',
  'ikea':'home',
  'castorama':'home',
  'leroy':'home',
  'orlen':'fuel',
  'bp ':'fuel',
  'shell':'fuel',
  'circle k':'fuel',
  'statoil':'fuel'
};

function detectCategoryForMerchant(name){
  if(!name) return 'other';
  const key = String(name).toLowerCase();
  for(const k in MERCHANT_MAP){
    if(key.indexOf(k)!==-1) return MERCHANT_MAP[k];
  }
  return 'other';
}

function getMerchantFromTxRow(r){
  return getVal(r,["Kontrahent","Counterparty","Nazwa właściciela rachunku","Tytuł/Opis","Opis","description"]) || "";
}
 function normalizeCatIdByList(x){
  const raw = String(x || "").trim();
  if(!raw) return "";

  const v = raw.toLowerCase();
  const cats = (typeof getAllSpCats === "function") ? getAllSpCats() : [];

  // 1) если пользователь уже ввёл id
  const byId = cats.find(c => String(c.id || "").toLowerCase() === v);
  if(byId) return byId.id;

  // 2) если ввёл label ("Продукты", "Kategoria", etc)
  const byLabel = cats.find(c => String(c.label || "").toLowerCase() === v);
  if(byLabel) return byLabel.id;

  // 3) fallback
  return raw;
}


function resolveCategoryForTx(r){
  const manualRaw =
    getVal(r, ["Kategoria","Category","category","Категория","Категорія"]) || "";
  const manual = normalizeCatIdByList(manualRaw);
  if(manual) return manual;

  const m = getMerchantFromTxRow(r);
  return detectCategoryForMerchant(m);
}


function resolveCategoryForKasa(k){
  const cats = (typeof getAllSpCats === "function") ? getAllSpCats() : [];

  // 1) явное поле категории
  const manualRaw = (k && (
    k.category ||
    k.cat ||
    k.Kategoria ||
    k["Kategoria"] ||
    k["Категория"] ||
    ""
  )) || "";

  const manual = normalizeCatIdByList ? normalizeCatIdByList(manualRaw) : String(manualRaw||"").trim();
  if(manual) return manual;

  // 2) попытка найти категорию в комментарии
  const comment = String((k && (k.comment || k.title || k.source)) || "").toLowerCase();
  if(comment && cats.length){
    const byId = cats.find(c => comment.includes(String(c.id||"").toLowerCase()));
    if(byId) return byId.id;

    const byLabel = cats.find(c => comment.includes(String(c.label||"").toLowerCase()));
    if(byLabel) return byLabel.id;
  }

  // 3) авто
  const m = getMerchantFromKasaRow(k);
  return detectCategoryForMerchant(m);
}



function getMerchantFromKasaRow(k){
  return k.source || k.comment || "";
}


// --- KASA amount sign helpers (global) ---
function isOutKasaRow(k){
  const t = String((k && (k.type || k.flow || k.kind || k.direction)) || "").toLowerCase();
  return (
    t === "out" || t === "expense" || t === "rozchod" ||
    t === "wydanie" || t === "расход" || t === "vydata" || t === "wydatki"
  );
}

function getSignedKasaAmount(k){
  const raw = (typeof asNum === 'function') ? asNum(k?.amount||0) : Number(k?.amount||0);
  if(!raw) return 0;

  // "zamknięcie dnia" / balance set rows should not be treated as movement
  const t = String(k?.type || "").toLowerCase();
  if(t.includes('zamk')) return 0;

  return isOutKasaRow(k) ? -Math.abs(raw) : Math.abs(raw);
}

function buildSpendingAggregates(catId){
  const agg = {};
  const txArr = Array.isArray(tx) ? tx : [];
  const kasaArr = Array.isArray(kasa) ? kasa : [];

  const includeIncome = !!catId;

  function addRow(amount, merchant){
    if(!amount || !merchant) return;
    // In "All" view we keep expenses focus; when a category is selected we also allow income categories (e.g., salary)
    if(!includeIncome && amount > 0) return;
    const key = String(merchant||'').trim();
    if(!key) return;
    agg[key] = (agg[key] || 0) + amount;
  }

txArr.forEach(r=>{
  const m = getMerchantFromTxRow(r);
  const a = asNum(getVal(r,["Kwota","Kwота","amount","Kwota_raw"])||0);
  if(!a) return;

  const cat = resolveCategoryForTx(r);
  if(catId && cat !== catId) return;

  const showMerchant = m || (cat ? ("Категория: " + cat) : "Без контрагента");
  addRow(a, showMerchant);
});



kasaArr.forEach(k=>{
  const a = getSignedKasaAmount(k);
  if(!a) return;

  const cat = resolveCategoryForKasa(k);
  if(catId && cat!==catId) return;

  const m = getMerchantFromKasaRow(k);
  const showMerchant = m || (cat ? ("Категория: " + cat) : "Касса");
  addRow(a, showMerchant);
});


  const list = Object.entries(agg).map(([merchant,sum])=>({merchant,sum}));
  list.sort((a,b)=>a.sum - b.sum);
  return list;
}

function buildSpendingEntries(catId){
  const out = [];
  const txArr = Array.isArray(tx) ? tx : [];
  const kasaArr = Array.isArray(kasa) ? kasa : [];

  const includeIncome = !!catId;

  function push(kind, id, date, merchant, amount){
    if(!amount) return;
    // In "All" view we keep expenses focus; when a category is selected we also allow income categories
    if(!includeIncome && amount > 0) return;
    out.push({kind, id:String(id||''), date:String(date||''), merchant:String(merchant||''), amount:Number(amount)||0});
  }

  // TX expenses
  txArr.forEach(r=>{
    const amt = asNum(getVal(r,["Kwota","Kwота","amount","Kwota_raw"])||0);
    if(!amt) return;
    if(!includeIncome && amt > 0) return;
    const cat = resolveCategoryForTx(r);
    if(catId && String(cat) !== String(catId)) return;

    const id = String(getVal(r,["ID transakcji","ID","id"])||r.id||"");
    if(!id) return;

    const d = toISO(getVal(r,["Data księgowania","Data","date","Дата"])) || "";
    const merchant = getMerchantFromTxRow(r) || (getVal(r,["Kontrahent","Counterparty"])||"") || "Wyciąg";
    push('tx', id, d, merchant, amt);
  });

  // KASA expenses
  kasaArr.forEach(k=>{
    const amt = getSignedKasaAmount(k);
    if(!amt) return;
    if(!includeIncome && amt > 0) return;
    const cat = resolveCategoryForKasa(k);
    if(catId && String(cat) !== String(catId)) return;

    const id = String(k.id||"");
    if(!id) return;

    const d = String(k.date||"").slice(0,10);
    const merchant = getMerchantFromKasaRow(k) || "Kasa";
    push('kasa', id, d, merchant, amt);
  });

  // sort: newest first by date, then by amount
  out.sort((a,b)=>{
    const da = a.date || '';
    const db = b.date || '';
    if(da !== db) return db.localeCompare(da);
    return (a.amount||0) - (b.amount||0);
  });

  return out;
}

function renderSpendingFilters(activeId){
  const wrap = document.getElementById('spendingFilters');
  if(!wrap) return;
  const cats = getAllSpCats();
  let html = '<button type="button" class="spFilterBtn'+(!activeId?' active':'')+'" data-cat="">'+TT('spending.filter_all', null, 'All')+'</button>';
  cats.forEach(c=>{
    html += '<button type="button" class="spFilterBtn'+(activeId===c.id?' active':'')+'" data-cat="'+c.id+'">'+
      '<span class="emoji">'+(c.emoji||'📦')+'</span><span>'+(resolveSpCatLabel(c)||c.id)+'</span></button>';
  });
  wrap.innerHTML = html;
  wrap.querySelectorAll('.spFilterBtn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-cat') || '';
      renderSpendingFilters(id || '');
      try{ window._otdSpendingActiveCatId = (id||null); }catch(e){}
      renderSpendingStats(id || null);
    });
  });
}

function ensureSpendingListModal(){
  if(document.getElementById('spListModal')) return;
  const overlay = document.createElement('div');
  overlay.id = 'spListModal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card">
      <div style="display:flex;align-items:center;gap:10px">
        <h3 style="margin:0;flex:1" id="spListTitle">Wydatki</h3>
        <button class="btn secondary small" id="spListClose" style="min-width:90px">Zamknij</button>
      </div>
      <div class="muted small" id="spListSubtitle" style="margin:6px 0 10px">—</div>
      <input id="spListSearch" class="input" style="width:100%;margin-bottom:10px" placeholder="Szukaj…"/>
      <div id="spListBody" style="display:flex;flex-direction:column;gap:8px;max-height:55vh;overflow:auto"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = ()=> overlay.classList.remove('show');
  overlay.addEventListener('click', (e)=>{ if(e.target===overlay) close(); });
  overlay.querySelector('#spListClose')?.addEventListener('click', close);
  window._otdCloseSpList = close;
}

function ensureSpendingCategoryModals(){
  // Some builds lost these modals in HTML merges. Create them dynamically so buttons always work.

  // Add/Edit category modal
  if(!document.getElementById('addSpCatModal')){
    const overlay = document.createElement('div');
    overlay.id = 'addSpCatModal';
    overlay.className = 'modal-overlay';
    const emojis = ['🍔','🛒','⛽','🏠','💳','📦','🎁','💡','🧾','🚗','🚌','📱','👶','🐶','🏥','🎓','🎮','✈️','🍻','🧋'];
    overlay.innerHTML = `
      <div class="modal-card" style="max-width:520px">
        <div style="display:flex;align-items:center;gap:10px">
          <h3 style="margin:0;flex:1">Kategoria</h3>
          <button class="btn secondary small" id="spCatCancel" style="min-width:90px">Zamknij</button>
        </div>
        <input type="hidden" id="spCatEditId" value=""/>
        <div class="muted small" style="margin:8px 0 6px">Nazwa</div>
        <input id="spCatName" class="input" style="width:100%" placeholder="Np. Transport"/>
        <div class="muted small" style="margin:10px 0 6px">Ikona (emoji)</div>
        <div id="spCatEmojiList" style="display:flex;gap:8px;flex-wrap:wrap">
          ${emojis.map(e=>`<button type="button" class="btn secondary small" style="padding:6px 10px;border-radius:12px" data-emoji="${e}">${e}</button>`).join('')}
        </div>
        <div class="muted small" style="margin:10px 0 6px">Własne emoji</div>
        <input id="spCatEmojiCustom" class="input" style="width:100%" placeholder="Np. 🧋"/>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap">
          <button class="btn secondary" id="spCatDelete" style="border-color:rgba(255,80,80,.55);color:rgba(255,140,140,.95);display:none">Usuń</button>
          <button class="btn" id="spCatSave">Zapisz</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) overlay.classList.remove('show'); });
  }

  // Category manager modal
  if(!document.getElementById('spCatMgrModal')){
    const overlay = document.createElement('div');
    overlay.id = 'spCatMgrModal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card" style="max-width:640px">
        <div style="display:flex;align-items:center;gap:10px">
          <h3 style="margin:0;flex:1">Kategorie</h3>
          <button class="btn secondary small" id="spCatMgrAdd" style="min-width:110px">Dodaj</button>
          <button class="btn secondary small" id="spCatMgrClose" style="min-width:90px">Zamknij</button>
        </div>
        <div class="muted small" style="margin:6px 0 10px">Edytuj nazwy/emoji. Domyślne możesz tylko „nadpisać”.</div>
        <div id="spCatMgrList" style="display:flex;flex-direction:column;gap:10px;max-height:60vh;overflow:auto"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) overlay.classList.remove('show'); });
  }

  // Uncategorized modal
  if(!document.getElementById('uncatModal')){
    const overlay = document.createElement('div');
    overlay.id = 'uncatModal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card" style="max-width:700px">
        <div style="display:flex;align-items:center;gap:10px">
          <h3 style="margin:0;flex:1">Bez kategorii</h3>
          <button class="btn secondary small" id="uncatClose" style="min-width:90px">Zamknij</button>
        </div>
        <div class="muted small" style="margin:6px 0 10px">Wydatki, które nie mają ustawionej kategorii.</div>
        <div id="uncatList" style="display:flex;flex-direction:column;gap:10px;max-height:60vh;overflow:auto"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) overlay.classList.remove('show'); });
  }
}

function openSpendingList(catId){
  ensureSpendingListModal();
  const overlay = document.getElementById('spListModal');
  const body = document.getElementById('spListBody');
  const title = document.getElementById('spListTitle');
  const sub = document.getElementById('spListSubtitle');
  const search = document.getElementById('spListSearch');

  const cats = getAllSpCats();
  const catObj = catId ? cats.find(c=>String(c.id)===String(catId)) : null;

  const titleKey = 'spending.title';
  let baseTitle = (window.i18n && window.i18n.t) ? (window.i18n.t(titleKey) || '') : '';
  if(!baseTitle || baseTitle === titleKey) baseTitle = 'Wydatki';

  const label = catObj ? ((catObj.emoji||'📦') + ' ' + (catObj.label||catObj.id)) : baseTitle;
  if(title) title.textContent = label;

  const data = buildSpendingEntries(catId);
  const total = data.reduce((s,r)=> s + (Number(r.amount)||0), 0);
  if(sub){
    const sign = total < 0 ? '−' : '+';
    sub.textContent = `Suma: ${sign}${Math.abs(total).toFixed(2)} PLN`;
  }

  function kindLabel(kind){
    if(kind==='kasa') return 'Kasa';
    if(kind==='tx') return 'Wyciąg';
    return kind;
  }

  function renderList(filter){
    const f = String(filter||'').trim().toLowerCase();
    const list = f ? data.filter(r=> (
      String(r.merchant||'').toLowerCase().includes(f) ||
      String(r.date||'').toLowerCase().includes(f) ||
      kindLabel(r.kind).toLowerCase().includes(f)
    )) : data;

    if(!list.length){
      const emptyKey = 'spending.empty';
      let emptyTxt = (window.i18n && window.i18n.t) ? (window.i18n.t(emptyKey) || '') : '';
      if(!emptyTxt || emptyTxt === emptyKey) emptyTxt = 'Brak danych.';
      body.innerHTML = `<div class="muted small">${emptyTxt}</div>`;
      return;
    }

    body.innerHTML = list.slice(0,400).map(r=>{
      const amt = Number(r.amount)||0;
      const sign = amt < 0 ? '−' : '+';
      const val = Math.abs(amt);
      const dateTxt = escapeHtml((r.date||'').slice(0,10));
      const kLbl = kindLabel(r.kind);
      return `
        <div style="display:flex;gap:10px;align-items:center;padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:12px">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.merchant||'—')}</div>
            <div class="muted small">${dateTxt} · ${escapeHtml(kLbl)} · ${sign}${val.toFixed(2)} PLN</div>
          </div>
        </div>
      `;
    }).join('');
  }

  if(search){
    search.value = '';
    search.oninput = ()=> renderList(search.value);
  }
  renderList('');

  overlay.classList.add('show');
}

function renderSpendingStats(catId){
  const box = document.getElementById('spendingStats');
  if(!box) return;

  try{ ensureSpendingListModal(); }catch(e){}

  const data = buildSpendingAggregates(catId);
  if(!data.length){
    const emptyTxt = (window.i18n && window.i18n.t) ? (window.i18n.t('spending.empty') || 'Brak danych.') : 'Brak danych.';
    box.innerHTML = `<div class="muted small">${emptyTxt}</div>`;
    return;
  }

  const top = data.slice(0,3);
  const total = data.reduce((s,r)=> s + (Number(r.sum)||0), 0);

  const rows = top.map(r=>{
    const amt = Number(r.sum)||0;
    const sign = amt < 0 ? '−' : '+';
    const val = Math.abs(amt);
    return `<div style="display:flex;justify-content:space-between;gap:10px">
      <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.merchant||'—')}</span>
      <b>${sign}${Math.round(val)} PLN</b>
    </div>`;
  }).join('');

    const btnKey = 'spending.open_list';
  let btnLabel = (window.i18n && window.i18n.t) ? (window.i18n.t(btnKey) || '') : '';
  if(!btnLabel || btnLabel === btnKey) btnLabel = 'Otwórz listę';

  box.innerHTML = `
    <div class="muted small" style="margin-bottom:6px">Suma: <b>${(total<0?'−':'+')}${Math.round(Math.abs(total))} PLN</b></div>
    <div style="display:flex;flex-direction:column;gap:6px">${rows}</div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
      <button type="button" class="btn secondary small" id="spOpenListBtn">${btnLabel}</button>
    </div>
  `;

  box.querySelector('#spOpenListBtn')?.addEventListener('click', ()=> openSpendingList(catId));
}

function renderSpendingPanel(){
  try{ window._otdSpendingActiveCatId = null; }catch(e){}
  renderSpendingFilters('');
  renderSpendingStats(null);
  try{ if(window._otdUpdateUncatBadge) window._otdUpdateUncatBadge(); }catch(e){}
}

function initSpendingUI(){
  try{ if(typeof ensureSpendingCategoryModals==='function') ensureSpendingCategoryModals(); }catch(e){}

  const addBtn   = document.getElementById('addSpCatBtn');
  const manageBtn= document.getElementById('manageSpCatsBtn');
  const uncatBtn = document.getElementById('uncatBtn');

  // Make "blue links" look like real controls (bigger hit area, consistent with chips)
  try{
    const styleBtn = (b, variant)=>{
      if(!b) return;
      b.classList.remove('linkBtn');
      b.classList.add('btn');
      b.classList.add((variant||'ghost'));
      b.classList.add('small');
      b.style.padding = '6px 10px';
      b.style.borderRadius = '999px';
      b.style.lineHeight = '1';
    };
    styleBtn(addBtn, 'ghost');
    styleBtn(manageBtn, 'ghost');
    // "Bez kategorii" deserves attention
    styleBtn(uncatBtn, 'secondary');
  }catch(e){}

  const modal    = document.getElementById('addSpCatModal');
  const save     = document.getElementById('spCatSave');
  const cancel   = document.getElementById('spCatCancel');
  const delBtn   = document.getElementById('spCatDelete');

  const nameIn   = document.getElementById('spCatName');
  const editIdIn = document.getElementById('spCatEditId');
  const emojiWrap= document.getElementById('spCatEmojiList');
  const emojiCustomIn = document.getElementById('spCatEmojiCustom');

  const mgrModal = document.getElementById('spCatMgrModal');
  const mgrList  = document.getElementById('spCatMgrList');
  const mgrClose = document.getElementById('spCatMgrClose');
  const mgrAdd   = document.getElementById('spCatMgrAdd');

  const uncatModal = document.getElementById('uncatModal');
  const uncatList  = document.getElementById('uncatList');
  const uncatClose = document.getElementById('uncatClose');

  // Run once to avoid duplicating listeners; delegation below keeps buttons working even after re-renders.
  if(window._otdSpendingInitOnce){
    try{ if(typeof window._otdUpdateUncatBadge==='function') window._otdUpdateUncatBadge(); }catch(e){}
    return;
  }
  window._otdSpendingInitOnce = true;

  // Allow manager/uncat to work even if add/edit modal is missing after merges
  const canAddEdit = !!(addBtn && modal && save && cancel && nameIn && emojiWrap);
  if(!canAddEdit){
    console.warn('Spending UI: add/edit modal not found, actions will be limited.');
  }

  let chosenEmoji = '📦';

  function isDefaultCatId(id){
    return (DEFAULT_SP_CATS || []).some(c=>String(c.id)===String(id));
  }

  function slugify(s){
    return String(s||'')
      .toLowerCase()
      .replace(/[\s]+/g,'_')
      .replace(/[^a-z0-9а-яё_]+/gi,'')
      .replace(/^_+|_+$/g,'');
  }

  function openSpCatModal(mode, cat){
    // mode: 'add' | 'edit'
    if(!canAddEdit){
      alert('Brak okna kategorii (addSpCatModal).');
      return;
    }
    const c = cat || {};
    const isEdit = mode==='edit' && c.id;

    if(editIdIn) editIdIn.value = isEdit ? String(c.id) : '';
    if(delBtn) delBtn.style.display = isEdit ? 'inline-flex' : 'none';

    if(nameIn) nameIn.value = isEdit ? (c.label || '') : '';
    if(emojiCustomIn) emojiCustomIn.value = '';

    chosenEmoji = (c.emoji || '📦');
    // highlight emoji button if exists
    emojiWrap.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
    const btnMatch = Array.from(emojiWrap.querySelectorAll('button')).find(b=> (b.textContent||'').trim()===chosenEmoji);
    if(btnMatch) btnMatch.classList.add('active');

    modal.classList.add('show');
  }

  function closeSpCatModal(){
    modal.classList.remove('show');
  }

  if(canAddEdit){
  // Emoji selection
  emojiWrap.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      emojiWrap.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      chosenEmoji = (btn.textContent||'').trim() || '📦';
      if(emojiCustomIn) emojiCustomIn.value = '';
    });
  });

  // Add new category
  addBtn.addEventListener('click', ()=>{
    openSpCatModal('add', null);
  });

  // Cancel
  cancel.addEventListener('click', closeSpCatModal);

  // Delete (remove override or custom)
  if(delBtn){
    delBtn.addEventListener('click', ()=>{
      const id = (editIdIn && editIdIn.value) ? String(editIdIn.value) : '';
      if(!id) return;
      const extras = loadUserSpCats();
      const idx = extras.findIndex(c=>String(c.id)===id);
      if(idx>=0){
        extras.splice(idx,1);
        saveUserSpCats(extras);
      }else{
        // If it's default without override, nothing to delete
      }
      closeSpCatModal();
      render(); pushState();
    });
  }

  // Save add/edit
  save.addEventListener('click', ()=>{
    const label = (nameIn.value||'').trim();
    if(!label) return;

    // pick emoji: custom overrides chosen
    const customEmoji = (emojiCustomIn && emojiCustomIn.value) ? emojiCustomIn.value.trim() : '';
    const emoji = customEmoji || chosenEmoji || '📦';

    const extras = loadUserSpCats();
    let id = (editIdIn && editIdIn.value) ? String(editIdIn.value).trim() : '';

    if(!id){
      // create new id
      const base = slugify(label).slice(0,16) || ('cat_'+Date.now());
      id = ('user_'+base).slice(0,24);
      // avoid collisions
      const all = getAllSpCats().map(c=>String(c.id));
      if(all.includes(id)){
        id = (id + '_' + String(Date.now()).slice(-4)).slice(0,28);
      }
    }

    const cat = {id, label, emoji};

    const idx = extras.findIndex(c=>String(c.id)===String(id));
    if(idx>=0) extras[idx]=cat; else extras.push(cat);
    saveUserSpCats(extras);

    closeSpCatModal();
    render(); pushState();
  });

  } // end canAddEdit

  /* === Category manager === */
  function renderSpCatMgrList(){
    if(!mgrList) return;
    const cats = getAllSpCats();
    const extras = loadUserSpCats();

    mgrList.innerHTML = cats.map(c=>{
      const id = String(c.id||'');
      const hasOverride = extras.some(x=>String(x.id)===id);
      const canDelete = hasOverride || (!isDefaultCatId(id)); // custom cat -> delete fully
      const badge = isDefaultCatId(id) ? (hasOverride ? 'override' : 'default') : 'custom';

      return `
        <div style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:12px">
          <div style="min-width:28px;text-align:center;font-size:18px">${c.emoji||'📦'}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(c.label||id)}</div>
            <div class="muted small">id: ${escapeHtml(id)} · ${badge}</div>
          </div>
          <button class="btn secondary" style="padding:6px 10px;font-size:12px" data-act="spcat-edit" data-id="${escapeHtml(id)}">✎</button>
          <button class="btn secondary" style="padding:6px 10px;font-size:12px;${canDelete?'':'opacity:.35;pointer-events:none'};border-color:rgba(255,80,80,.55);color:rgba(255,140,140,.95)" data-act="spcat-del" data-id="${escapeHtml(id)}">🗑</button>
        </div>
      `;
    }).join('');
  }

  function openSpCatMgr(){
    if(!mgrModal) return;
    renderSpCatMgrList();
    mgrModal.classList.add('show');
  }
  function closeSpCatMgr(){
    if(!mgrModal) return;
    mgrModal.classList.remove('show');
  }

  if(manageBtn){
    manageBtn.addEventListener('click', openSpCatMgr);
  }
  if(mgrClose){
    mgrClose.addEventListener('click', closeSpCatMgr);
  }
  if(mgrAdd){
    mgrAdd.addEventListener('click', ()=>{
      closeSpCatMgr();
      openSpCatModal('add', null);
    });
  }

  // Manager actions via delegation
  if(!window._otdSpCatMgrDelegated){
    window._otdSpCatMgrDelegated = true;
    

  // Keyboard: go home from brand title (Enter/Space)
  const brandHomeKey = $id('brandHome');
  if(brandHomeKey){
    brandHomeKey.addEventListener('keydown', (e)=>{
      if(e.key==='Enter' || e.key===' '){
        e.preventDefault();
        if(window.appGoHome) window.appGoHome();
      }
    });
  }

document.addEventListener('click', (e)=>{
    const b = e.target.closest('button');
    if(!b) return;
    const act = b.getAttribute('data-act');
    if(act==='spcat-edit'){
      const id = b.getAttribute('data-id');
      const cat = getCatById(id);
      closeSpCatMgr();
      openSpCatModal('edit', cat || {id, label:id, emoji:'📦'});
    }
    if(act==='spcat-del'){
      const id = b.getAttribute('data-id');
      if(!id) return;
      const extras = loadUserSpCats();
      const idx = extras.findIndex(c=>String(c.id)===String(id));
      if(idx>=0){
        extras.splice(idx,1);
        saveUserSpCats(extras);
      }else{
        // if it's a custom cat not in extras (shouldn't happen) do nothing
      }
      renderSpCatMgrList();
      render(); pushState();
    }
  }, {capture:false});
  }

  /* === Uncategorized list === */
    function collectUncat(){
    const items = [];

    // Ensure IDs exist (otherwise kasa/tx may be skipped)
    try{ if(typeof ensureTxIds==='function') ensureTxIds(); }catch(e){}
    try{ if(typeof ensureKasaIds==='function') ensureKasaIds(); }catch(e){}

function normUncatCat(v){
      const s = String(v||'').trim();
      if(!s) return '';
      const low = s.toLowerCase();
      if(s==='—' || s==='–' || s==='-' || low==='—' || low==='–' || low==='-') return '';
      if(low==='bez kategorii' || low==='brak kategorii' || low==='brak' || low==='uncategorized' || low==='no category' || low==='none' || low==='без категории' || low==='без категорії') return '';
      return s;
    }

        function explicitTxCat(r){
      const raw = getVal(r,["Kategoria","Category","category"]) || r.category || r.cat || "";
      return normUncatCat(raw);
    }
    function explicitBillCat(r){
      const raw = getVal(r,["Kategoria","Category","category"]) || r.category || r.cat || "";
      return normUncatCat(raw);
    }
    function explicitKasaCat(k){
      const raw = (k && (k.category || k.cat || k.Kategoria || k["Kategoria"] || k["Категория"])) || "";
      return normUncatCat(raw);
    }

    // TX: operations without explicit category (both income and expense)
    (tx||[]).forEach(r=>{
      const amt = asNum(getVal(r,["Kwota","Kwота","amount","Kwota_raw"])||0);
      if(!amt) return;
      const cat = explicitTxCat(r);
      if(cat) return;

      const id = String(getVal(r,["ID transakcji","ID","id"])||r.id||"");
      if(!id) return;

      const d = toISO(getVal(r,["Data księgowania","Data","date","Дата"])) || "";
      const merchant = getMerchantFromTxRow(r) || "Wyciąg";
      items.push({kind:'tx', id, date:d, merchant, amount:amt});
    });

    // KASA: operations without explicit category (both income and expense; exclude zamknięcie)
    (kasa||[]).forEach(k=>{
      const amt = getSignedKasaAmount(k);
      if(!amt) return;
      const cat = explicitKasaCat(k);
      if(cat) return;

      const id = String(k.id||"");
      if(!id) return;

      const d = String(k.date||"").slice(0,10);
      const merchant = getMerchantFromKasaRow(k) || "Kasa";
      items.push({kind:'kasa', id, date:d, merchant, amount:amt});
    });

    // BILLS: invoices without explicit category (treat as expenses)
    (bills||[]).forEach(r=>{
      const cat = explicitBillCat(r);
      if(cat) return;

      const id = String(getVal(r,["Numer faktury","Numer фактуры","Invoice number"])||"");
      if(!id) return;

      const d = toISO(getVal(r,["Termin płatności","Termin платności","Termin платності","Termin","Due date"])||"") || "";
      const supplier = String(getVal(r,["Dostawca","Supplier"])||"Faktura");
      const amtPos = asNum(getVal(r,["Kwota do zapłaty","Kwota","Amount","amount"])||0);
      if(!amtPos) return;
      items.push({kind:'bill', id, date:d, merchant:supplier, amount:-Math.abs(amtPos)});
    });

    // newest first by date
    items.sort((a,b)=>{
      const da = a.date || '';
      const db = b.date || '';
      if(da !== db) return db.localeCompare(da);
      return (a.amount||0) - (b.amount||0);
    });

    return items;
  }

  window._otdCollectUncat = collectUncat;

  function updateUncatBadge(){
    const el = document.getElementById('uncatCount');
    if(!el) return;
    const n = collectUncat().length;
    el.textContent = String(n);
    el.style.display = n ? 'inline-flex' : 'none';
  }

  function renderUncatList(){
    if(!uncatList) return;
    const items = collectUncat();
    if(!items.length){
      uncatList.innerHTML = `<div class="muted small">${(window.t && t('uncat.none')) || 'Brak operacji bez kategorii.'}</div>`;
      return;
    }
    uncatList.innerHTML = items.map(it=>{
      const val = Math.abs(it.amount||0).toFixed(2);
      const sign = (Number(it.amount||0) < 0) ? '−' : '+';
      const title = escapeHtml(it.merchant||'');
            const kindLbl = (it.kind==='kasa') ? 'Kasa' : (it.kind==='bill' ? 'Faktury' : 'Wyciąg');
      return `
        <div style="display:flex;gap:10px;align-items:center;padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:12px">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div>
            <div class="muted small">${escapeHtml(it.date||'')} · ${kindLbl} · ${sign}${val} PLN</div>
          </div>
          <button class="btn" style="padding:6px 10px;font-size:12px" data-act="cat" data-kind="${escapeHtml(it.kind)}" data-id="${escapeHtml(it.id)}">${(window.t && t('uncat.choose')) || 'Wybierz'}</button>
        </div>
      `;
    }).join('');
  }

  function openUncat(){
    if(!uncatModal) return;
    renderUncatList();
    uncatModal.classList.add('show');
  }
  function closeUncat(){
    if(!uncatModal) return;
    uncatModal.classList.remove('show');
  }

  if(uncatBtn){
    uncatBtn.addEventListener('click', openUncat);
  }
  if(uncatClose){
    uncatClose.addEventListener('click', closeUncat);
  }

  // expose helpers for fallback delegation (buttons stay clickable even if direct listeners are lost)
  window._otdOpenSpCatMgr = openSpCatMgr;
  window._otdOpenUncat = openUncat;
  window._otdOpenSpCatAdd = ()=> openSpCatModal('add', null);

  // refresh badge on init and after render()
  try{ updateUncatBadge(); }catch(e){}
  window._otdUpdateUncatBadge = updateUncatBadge;
  window._otdRenderUncatList = renderUncatList;
}

(function bindSpendingToolbarDelegation(){
  if(window._otdSpendingToolbarDelegated) return;
  window._otdSpendingToolbarDelegated = true;

  // Capture-phase delegation: action buttons work even if something re-rendered them.
  document.addEventListener('click', (e)=>{
    const btn = e.target && e.target.closest ? e.target.closest('#addSpCatBtn,#manageSpCatsBtn,#uncatBtn,#spOpenListBtn') : null;
    if(!btn) return;

    // Ensure UI init ran (safe if already inited)
    try{ if(typeof initSpendingUI==='function') initSpendingUI(); }catch(err){}

    if(btn.id==='manageSpCatsBtn' && typeof window._otdOpenSpCatMgr==='function'){
      e.preventDefault(); e.stopPropagation();
      window._otdOpenSpCatMgr();
    }
    if(btn.id==='uncatBtn' && typeof window._otdOpenUncat==='function'){
      e.preventDefault(); e.stopPropagation();
      window._otdOpenUncat();
    }
    if(btn.id==='addSpCatBtn' && typeof window._otdOpenSpCatAdd==='function'){
      e.preventDefault(); e.stopPropagation();
      window._otdOpenSpCatAdd();
    }

if(btn.id==='spOpenListBtn'){
  e.preventDefault(); e.stopPropagation();
  try{
    const cid = (window._otdSpendingActiveCatId===undefined) ? null : window._otdSpendingActiveCatId;
    if(typeof openSpendingList==='function') openSpendingList(cid);
  }catch(err){}
}

  }, true);

  // Default screen: Home (tiles). Start on Home after load.
  window.addEventListener('load', () => {
    try {
      // Always start on Home (tiles) after login/refresh
      if (window.appGoHome) window.appGoHome();
      else if (window.appGoSection) window.appGoSection('pulpit'); // fallback
    } catch (_) {}
  }, { once: true });
})();

/* ==== STATE ==== */
let tx    = [];
let bills = [];
let kasa  = [];
let accMeta = {};
let invoiceTemplates = [];


/* ==== HARD FIX: Spending buttons must always work (Manage categories + Uncategorized) ==== */
(function otdBindSpendingButtonsHard(){
  if(window.__otdSpendingButtonsHardBound) return;
  window.__otdSpendingButtonsHardBound = true;

  // Safe helpers
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
  function asNum(v){ const n = Number(String(v||'').replace(',', '.')); return Number.isFinite(n)?n:0; }
  function normCat(v){
    const s = String(v||'').trim();
    if(!s) return '';
    const low = s.toLowerCase();
    if(s==='—'||s==='–'||s==='-'||low==='—'||low==='–'||low==='-') return '';
    if(low==='bez kategorii'||low==='brak kategorii'||low==='brak'||low==='uncategorized'||low==='no category'||low==='none'||low==='без категории'||low==='без категорії') return '';
    return s;
  }

  // Ensure modal overlays are attached to <body> (iOS Safari + transformed parents can break position:fixed)
  function ensureOnBody(el){
    try{
      if(!el) return;
      if(el.classList && !el.classList.contains('modal-overlay')) el.classList.add('modal-overlay');
      if(el.parentElement !== document.body) document.body.appendChild(el);
    }catch(_){ }
  }


  // Ensure TX/KASA rows have stable ids so "bez kategorii" count matches reality and category picker can find the row.
  function ensureRowId(obj, prefix, fallback){
    if(!obj) return '';
    let id = String(obj.id || obj.ID || obj["ID"] || obj["ID transakcji"] || obj["ID transakcji "] || '').trim();
    if(id) { obj.id = id; return id; }
    id = (prefix || 'row') + '_' + (fallback || Date.now() + '_' + Math.random().toString(16).slice(2));
    obj.id = id;
    return id;
  }

  function getTxMerchant(r){
    try{
      return (typeof getMerchantFromTxRow==='function') ? (getMerchantFromTxRow(r) || '') : (r["Odbiorca"] || r["Nadawca"] || r["Opis"] || r["Tytuł"] || r.merchant || r.opis || '');
    }catch(_){ return r.merchant || ''; }
  }
  function getKasaMerchant(k){
    try{ return (typeof getMerchantFromKasaRow==='function') ? (getMerchantFromKasaRow(k) || '') : (k.note || k.opis || k.title || 'Kasa'); }catch(_){ return k.note || 'Kasa'; }
  }
  function getTxDate(r){
    try{
      const d = (typeof toISO==='function') ? (toISO((r["Data księgowania"]||r.date||r["Дата"]||'') ) || '') : (r.date||'');
      return String(d||'').slice(0,10);
    }catch(_){ return String(r.date||'').slice(0,10); }
  }

  function collectUncatHard(){
    const items = [];
    // Prefer existing ensured IDs if available
    try{ if(typeof ensureTxIds==='function') ensureTxIds(); }catch(_){}
    try{ if(typeof ensureKasaIds==='function') ensureKasaIds(); }catch(_){}

    // TX operations without explicit category (income + expense)
    try{
      (tx||[]).forEach((r, idx)=>{
        // amount
        const amt = asNum((typeof getVal==='function') ? (getVal(r,["Kwota","amount","Kwota_raw"])||0) : (r.Kwota||r.amount||0));
        if(!amt) return;
        const catRaw = (typeof getVal==='function') ? (getVal(r,["Kategoria","Category","category"])||'') : (r.category||r.cat||r.Kategoria||'');
        if(normCat(catRaw)) return;

        const d = getTxDate(r);
        const m = getTxMerchant(r) || 'Wyciąg';
        const fid = [d, Math.round(Math.abs(amt)*100), String(m).slice(0,24), idx].join('|');
        const id = ensureRowId(r, 'tx', fid);

        items.push({kind:'tx', id, date:d, merchant:m, amount:amt});
      });
    }catch(_){}

    // KASA operations without explicit category (income + expense; exclude zamknięcie)
    try{
      (kasa||[]).forEach((k, idx)=>{
        const amt = (typeof getSignedKasaAmount==='function') ? (getSignedKasaAmount(k) || 0) : asNum(k.amount||0);
        if(!amt) return;
        const catRaw = k && (k.category || k.cat || k.Kategoria || k["Kategoria"] || k["Категория"] || '');
        if(normCat(catRaw)) return;

        const d = String(k.date||'').slice(0,10);
        const m = getKasaMerchant(k) || 'Kasa';
        const fid = [d, Math.round(Math.abs(amt)*100), String(m).slice(0,24), idx].join('|');
        const id = ensureRowId(k, 'kasa', fid);

        items.push({kind:'kasa', id, date:d, merchant:m, amount:amt});
      });
    }catch(_){}

    // BILLS as expenses without explicit category
    try{
      (bills||[]).forEach((r, idx)=>{
        const catRaw = (typeof getVal==='function') ? (getVal(r,["Kategoria","Category","category"])||'') : (r.category||r.cat||r.Kategoria||'');
        if(normCat(catRaw)) return;

        const idRaw = (typeof getVal==='function') ? (getVal(r,["Numer faktury","Invoice number","Номер фактуры"])||'') : (r.id||r.number||'');
        const id = String(idRaw||'').trim();
        if(!id) return;

        const d = (typeof toISO==='function') ? (toISO(getVal(r,["Termin płatności","Due date","Termin"])||'')||'') : (r.due||'');
        const supplier = String((typeof getVal==='function') ? (getVal(r,["Dostawca","Supplier"])||'Faktura') : (r.supplier||'Faktura'));
        const amtPos = asNum((typeof getVal==='function') ? (getVal(r,["Kwota do zapłaty","Kwota","Amount","amount"])||0) : (r.amount||0));
        if(!amtPos) return;

        items.push({kind:'bill', id, date:String(d||'').slice(0,10), merchant:supplier, amount:-Math.abs(amtPos)});
      });
    }catch(_){}

    items.sort((a,b)=>{
      const da = a.date || '';
      const db = b.date || '';
      if(da !== db) return db.localeCompare(da);
      return (a.amount||0) - (b.amount||0);
    });
    return items;
  }

  function updateUncatBadgeHard(){
    const el = document.getElementById('uncatCount');
    if(!el) return;
    const n = collectUncatHard().length;
    el.textContent = String(n);
    el.style.display = n ? 'inline-flex' : 'none';
  }

  function openUncatHard(){
  try{ if(typeof ensureSpendingCategoryModals==='function') ensureSpendingCategoryModals(); }catch(_){ }
    const modal = document.getElementById('uncatModal');
    const list  = document.getElementById('uncatList');
    ensureOnBody(modal);
    if(!modal || !list){
      alert('Brak okna: uncatModal/uncatList');
      return;
    }
    const items = collectUncatHard();
    if(!items.length){
      const txt = (window.i18n && window.i18n.t) ? (window.i18n.t('uncat.none') || 'Brak operacji bez kategorii.') : 'Brak operacji bez kategorii.';
      list.innerHTML = `<div class="muted small">${esc(txt)}</div>`;
    }else{
      list.innerHTML = items.map(it=>{
        const val = Math.abs(it.amount||0).toFixed(2);
        const sign = (Number(it.amount||0) < 0) ? '−' : '+';
        const kindLbl = (it.kind==='kasa') ? 'Kasa' : (it.kind==='bill' ? 'Faktury' : 'Wyciąg');
        const btnTxt = (window.i18n && window.i18n.t) ? (window.i18n.t('uncat.choose') || 'Wybierz') : 'Wybierz';
        return `
          <div style="display:flex;gap:10px;align-items:center;padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:12px">
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.merchant||'—')}</div>
              <div class="muted small">${esc(it.date||'')} · ${kindLbl} · ${sign}${val} PLN</div>
            </div>
            <button class="btn" style="padding:6px 10px;font-size:12px" data-act="uncat-pick" data-kind="${esc(it.kind)}" data-id="${esc(it.id)}">${esc(btnTxt)}</button>
          </div>
        `;
      }).join('');
    }
    modal.classList.add('show');
  }

  function closeUncatHard(){
    const modal = document.getElementById('uncatModal');
    if(modal) modal.classList.remove('show');
  }

  function renderSpCatMgrListHard(){
    const list = document.getElementById('spCatMgrList');
    if(!list) return;
    const cats = (typeof getAllSpCats==='function') ? getAllSpCats() : [];
    const extras = (typeof loadUserSpCats==='function') ? loadUserSpCats() : [];
    const isDefault = (id)=> (typeof DEFAULT_SP_CATS!=='undefined' && (DEFAULT_SP_CATS||[]).some(c=>String(c.id)===String(id)));

    list.innerHTML = cats.map(c=>{
      const id = String(c.id||'');
      const hasOverride = extras.some(x=>String(x.id)===id);
      const canDelete = hasOverride || (!isDefault(id));
      const badge = isDefault(id) ? (hasOverride ? 'override' : 'default') : 'custom';
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:12px">
          <div style="min-width:28px;text-align:center;font-size:18px">${esc(c.emoji||'📦')}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.label||id)}</div>
            <div class="muted small">id: ${esc(id)} · ${badge}</div>
          </div>
          <button class="btn secondary" style="padding:6px 10px;font-size:12px" data-act="spcat-edit-hard" data-id="${esc(id)}">✎</button>
          <button class="btn secondary" style="padding:6px 10px;font-size:12px;${canDelete?'':'opacity:.35;pointer-events:none'};border-color:rgba(255,80,80,.55);color:rgba(255,140,140,.95)" data-act="spcat-del-hard" data-id="${esc(id)}">🗑</button>
        </div>
      `;
    }).join('');
  }

  function openSpCatMgrHard(){
  try{ if(typeof ensureSpendingCategoryModals==='function') ensureSpendingCategoryModals(); }catch(_){ }
    const modal = document.getElementById('spCatMgrModal');
    ensureOnBody(modal);
    if(!modal){
      alert('Brak okna: spCatMgrModal');
      return;
    }
    renderSpCatMgrListHard();
    modal.classList.add('show');
  }
  function closeSpCatMgrHard(){
    const modal = document.getElementById('spCatMgrModal');
    if(modal) modal.classList.remove('show');
  }

  function openSpCatAddEditHard(mode, id){
    const modal = document.getElementById('addSpCatModal');
    ensureOnBody(modal);
    const save = document.getElementById('spCatSave');
    const cancel = document.getElementById('spCatCancel');
    const delBtn = document.getElementById('spCatDelete');
    const nameIn = document.getElementById('spCatName');
    const editIdIn = document.getElementById('spCatEditId');
    const emojiWrap = document.getElementById('spCatEmojiList');
    const emojiCustomIn = document.getElementById('spCatEmojiCustom');

    if(!modal || !save || !cancel || !nameIn || !editIdIn || !emojiWrap){
      alert('Brak okna: addSpCatModal');
      return;
    }

    // one-time emoji click binding
    if(!window.__otdSpEmojiBound){
      window.__otdSpEmojiBound = true;
      emojiWrap.querySelectorAll('button').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          emojiWrap.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
          btn.classList.add('active');
          window.__otdSpChosenEmoji = (btn.textContent||'').trim() || '📦';
          if(emojiCustomIn) emojiCustomIn.value = '';
        });
      });
    }

    const cat = (typeof getCatById==='function' && id) ? getCatById(id) : null;
    const isEdit = mode==='edit' && id;

    editIdIn.value = isEdit ? String(id) : '';
    if(delBtn) delBtn.style.display = isEdit ? 'inline-flex' : 'none';

    nameIn.value = isEdit ? String((cat && cat.label) || id || '').trim() : '';
    if(emojiCustomIn) emojiCustomIn.value = '';

    window.__otdSpChosenEmoji = (cat && cat.emoji) ? cat.emoji : '📦';

    // highlight emoji
    emojiWrap.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
    const match = Array.from(emojiWrap.querySelectorAll('button')).find(b=> (b.textContent||'').trim()===window.__otdSpChosenEmoji);
    if(match) match.classList.add('active');

    // Save handler (overwrite to avoid stacking)
    save.onclick = ()=>{
      const label = (nameIn.value||'').trim();
      if(!label) return;

      const customEmoji = (emojiCustomIn && emojiCustomIn.value) ? emojiCustomIn.value.trim() : '';
      const emoji = customEmoji || window.__otdSpChosenEmoji || '📦';

      const extras = (typeof loadUserSpCats==='function') ? loadUserSpCats() : [];
      let cid = editIdIn.value ? String(editIdIn.value).trim() : '';

      function slugify(s){
        return String(s||'').toLowerCase().replace(/[\s]+/g,'_').replace(/[^a-z0-9а-яё_]+/gi,'').replace(/^_+|_+$/g,'');
      }

      if(!cid){
        const base = slugify(label).slice(0,16) || ('cat_'+Date.now());
        cid = ('user_'+base).slice(0,24);
        const all = (typeof getAllSpCats==='function' ? getAllSpCats() : []).map(c=>String(c.id));
        if(all.includes(cid)) cid = (cid + '_' + String(Date.now()).slice(-4)).slice(0,28);
      }

      const obj = {id:cid, label, emoji};
      const idx = extras.findIndex(c=>String(c.id)===String(cid));
      if(idx>=0) extras[idx]=obj; else extras.push(obj);
      try{ if(typeof saveUserSpCats==='function') saveUserSpCats(extras); }catch(_){}

      modal.classList.remove('show');
      // Refresh filters + stats if available
      try{ if(typeof renderSpendingFilters==='function'){ renderSpendingFilters(window._otdSpendingActiveCatId || ''); } }catch(_){}
      try{ if(typeof renderSpendingStats==='function'){ renderSpendingStats(window._otdSpendingActiveCatId || null); } }catch(_){}
      try{ if(typeof render==='function') render(); }catch(_){}
      try{ if(typeof pushState==='function') pushState(); }catch(_){}
      try{ renderSpCatMgrListHard(); }catch(_){}
    };

    cancel.onclick = ()=> modal.classList.remove('show');

    if(delBtn){
      delBtn.onclick = ()=>{
        const cid = editIdIn.value ? String(editIdIn.value).trim() : '';
        if(!cid) return;
        try{
          const extras = (typeof loadUserSpCats==='function') ? loadUserSpCats() : [];
          const idx = extras.findIndex(c=>String(c.id)===String(cid));
          if(idx>=0){ extras.splice(idx,1); if(typeof saveUserSpCats==='function') saveUserSpCats(extras); }
        }catch(_){}
        modal.classList.remove('show');
        try{ renderSpCatMgrListHard(); }catch(_){}
        try{ if(typeof render==='function') render(); }catch(_){}
        try{ if(typeof pushState==='function') pushState(); }catch(_){}
      };
    }

    modal.classList.add('show');
  }

  // Hard bind buttons (onclick beats addEventListener chaos)
  function bindNow(){
    try{ if(typeof ensureSpendingCategoryModals==='function') ensureSpendingCategoryModals(); }catch(_){ }
    const manage = document.getElementById('manageSpCatsBtn');
    const uncat   = document.getElementById('uncatBtn');
    const closeUn = document.getElementById('uncatClose');
    const mgrClose= document.getElementById('spCatMgrClose');
    const mgrAdd  = document.getElementById('spCatMgrAdd');

    // Ensure overlays are direct children of <body> (Safari/iOS sometimes hides fixed overlays inside transformed parents)
    try{ ['spCatMgrModal','uncatModal','addSpCatModal','spListModal','invoiceTplModal'].forEach(id=>{ const el=document.getElementById(id); if(el && el.parentElement!==document.body) document.body.appendChild(el); }); }catch(_){ }

    if(manage) manage.onclick = (e)=>{ try{ e.preventDefault(); e.stopPropagation(); }catch(_){} openSpCatMgrHard(); };
    if(uncat) uncat.onclick   = (e)=>{ try{ e.preventDefault(); e.stopPropagation(); }catch(_){} openUncatHard(); };

    if(closeUn) closeUn.onclick = (e)=>{ try{ e.preventDefault(); }catch(_){} closeUncatHard(); };
    if(mgrClose) mgrClose.onclick = (e)=>{ try{ e.preventDefault(); }catch(_){} closeSpCatMgrHard(); };
    if(mgrAdd) mgrAdd.onclick = (e)=>{ try{ e.preventDefault(); }catch(_){} closeSpCatMgrHard(); openSpCatAddEditHard('add', ''); };

    // Delegation inside lists (edit/delete + pick)
    if(!window.__otdSpendingHardDelegated){
      window.__otdSpendingHardDelegated = true;
      document.addEventListener('click', (e)=>{
        const b = e.target && e.target.closest ? e.target.closest('button') : null;
        if(!b) return;
        const act = b.getAttribute('data-act');
        if(act==='uncat-pick'){
          e.preventDefault();
          const kind = b.getAttribute('data-kind');
          const id   = b.getAttribute('data-id');
          try{
            if(typeof openCatModal==='function') openCatModal(kind, id);
            // keep uncat modal open for batch assigning
            updateUncatBadgeHard();
            // refresh list after assignment (category may no longer be empty)
            setTimeout(()=>{ try{ openUncatHard(); }catch(_){} }, 200);
          }catch(_){}
        }
        if(act==='spcat-edit-hard'){
          e.preventDefault();
          const id = b.getAttribute('data-id');
          closeSpCatMgrHard();
          openSpCatAddEditHard('edit', id);
        }
        if(act==='spcat-del-hard'){
          e.preventDefault();
          const id = b.getAttribute('data-id');
          try{
            const extras = (typeof loadUserSpCats==='function') ? loadUserSpCats() : [];
            const idx = extras.findIndex(c=>String(c.id)===String(id));
            if(idx>=0){ extras.splice(idx,1); if(typeof saveUserSpCats==='function') saveUserSpCats(extras); }
          }catch(_){}
          renderSpCatMgrListHard();
          try{ if(typeof render==='function') render(); }catch(_){}
          try{ if(typeof pushState==='function') pushState(); }catch(_){}
        }
      }, true);
    }

    // Override badge updater so count is correct everywhere
    try{ window._otdUpdateUncatBadge = updateUncatBadgeHard; }catch(_){}
    try{ updateUncatBadgeHard(); }catch(_){}
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', bindNow);
  else bindNow();

})();
const stateKeys = [
  'tx_manual_import',
  'bills_manual_import',
  'kasa',
  'accMeta',
  'cashPLN',
  'penaltyPct',
  'intervalMin',
  'rateEUR',
  'rateUSD',
  'blacklist',
  'autoCash',
  // 👇 подписку и демо больше НЕ пушим в Firebase
  'txUrl',
  'billUrl',
  'otd_lang',
  'speechLang'
];


function ensureTxIds(){
  if(!Array.isArray(tx)) tx = [];
  tx.forEach((r, idx) => {
    if(!r || r.id) return;

    // пытаемся взять уже существующий ID
    let id = getVal(r, ["ID transakcji","ID","id"]);
    if(!id){
      // генерим стабильный id, если его не было
      const baseDate = r["Data księgowania"] || today();
      id = `tx-${baseDate}-${idx}-${Math.random().toString(36).slice(2,8)}`;
    }

    r.id = String(id);

    // чтобы всё было консистентно по полям
    if(!r["ID transakcji"]) {
      r["ID transakcji"] = r.id;
    }
  });
}
function ensureKasaIds(){
  if(!Array.isArray(kasa)) kasa = [];
  kasa.forEach((k, idx) => {
    if(!k || k.id) return;

    // если вдруг где-то уже есть поле ID
    let id = k.ID || k.Id || k["ID"] || k["id"];
    if(!id){
      const baseDate = k.date || today();
      id = `kasa-${baseDate}-${idx}-${Math.random().toString(36).slice(2,8)}`;
    }

    k.id = String(id);
  });
}


  
/* ==== CLOUD SYNC (Firebase, общий стейт для всех устройств) ==== */
function getCloudEmail(){
  return localStorage.getItem(USER_KEY) || '';
}

function buildCloudState(){
  const settings = stateKeys.reduce((m,k)=>{
    m[k] = localStorage.getItem(k);
    return m;
  }, {});
  return {
    tx,
    bills,
    kasa,
    accMeta,
    settings
  };
}

async function pushCloudState(){
  if (!window.FirebaseSync) return;           // /sync-cloud.js ещё не загрузился
  if (!CLOUD_READY) {
    console.log('[cloud] skip push: remote not ready');
    return;
  }
  const email = getCloudEmail();
  if (!email) return;                         // нет email → не знаем куда писать

  try{
    await window.FirebaseSync.saveUserState(email, buildCloudState());
    console.log('[cloud] saved to Firebase');
  }catch(e){
    console.warn('[cloud] save error', e);
  }
}



function applyCloudState(remote){
  if (!remote || typeof remote !== 'object') return;

  try{
    if (Array.isArray(remote.tx)){
      tx = remote.tx;
      _otdSetJSON('tx_manual_import', tx);
    }
    if (Array.isArray(remote.bills)){
      bills = remote.bills;
      _otdSetJSON('bills_manual_import', bills);
    }
    if (Array.isArray(remote.kasa)){
      kasa = remote.kasa;
      _otdSetJSON('kasa', kasa);
    }
    if (remote.accMeta && typeof remote.accMeta === 'object'){
      accMeta = remote.accMeta;
      _otdSetJSON('accMeta', accMeta);
  _otdSetJSON('invoice_templates', invoiceTemplates);
    }
if (remote.settings && typeof remote.settings === 'object'){
  const protectedKeys = new Set([
    SUB_KEY,
    SUB_FROM,
    SUB_TO,
    DEMO_START,
    DEMO_USED
  ]);

  Object.entries(remote.settings).forEach(([k, v])=>{
    // 👇 Никогда не трогаем подписку и демо
    if (protectedKeys.has(k)) return;
    if (typeof v === 'string') localStorage.setItem(k, v);
  });
}


    // пересчитать и перерисовать UI
    inferAccounts();
    render();
  }catch(e){
    console.warn('[cloud] apply error', e);
  }
}

function startCloudSync(){
  const email = getCloudEmail();
  if (!email){
    console.warn('[cloud] no email in localStorage.' + USER_KEY);
    return;
  }

  function tryInit(){
    if (!window.FirebaseSync){
      console.log('[cloud] wait FirebaseSync…');
      setTimeout(tryInit, 500);  // ждём, пока загрузится /sync-cloud.js
      return;
    }

    console.log('[cloud] start for', email);
    try {
      window.FirebaseSync.subscribeUserState(email, (remote) => {
        applyCloudState(remote);   // тянем из облака в локалку
        CLOUD_READY = true;        // только теперь разрешаем pushCloudState()
      });
    } catch (e) {
      console.warn('[cloud] subscribe error', e);
    }
  }

  tryInit();
}



/* ==== REMOTE SYNC (optional) ==== */
async function pullState(){
  if (!REMOTE_OK) return null;
  try {
    const res = await fetch('/app-state', {
      credentials: 'include'
    });
    if (!res.ok) return null;
    const json = await res.json();
    const st = json && json.state ? json.state : {};

    // ВАЖНО:
    // 1) НЕ затираем локальные выписки пустым state с сервера
    // 2) Обновляем только если реально есть данные

    // Выписки (tx)
    if (Array.isArray(st.transactions) && st.transactions.length) {
      _otdSetJSON('tx_manual_import', st.transactions);
    }

    // Фактуры
    if (Array.isArray(st.bills) && st.bills.length) {
      _otdSetJSON('bills_manual_import', st.bills);
    }

    // Касса
    if (Array.isArray(st.cash) && st.cash.length) {
      _otdSetJSON('kasa', st.cash);
    }

    // Метаданные аккаунтов
    if (st.meta && typeof st.meta === 'object') {
      _otdSetJSON('accMeta', st.meta);
    }

    loadLocal();
    inferAccounts();
    render();
    return st;
  } catch (e) {
    console.warn('pullState error', e);
    return null;
  }
}



const pushState = (function(){
  let timer = null;
  let inflight = false;
  return function(){
    if(!REMOTE_OK) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if(inflight) return;
      inflight = true;
      try{
        // гарантируем id перед пушем
        ensureTxIds();

        const state = {
          transactions: tx,
          bills,
          cash: kasa,
          meta: accMeta
        };

        await fetch('/app-state/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ state })
        });
      } catch (e) {
        console.warn('pushState error', e);
      } finally {
        inflight = false;
      }
    }, 600);
  };
})();



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

/* ==== PERSIST LOCAL ==== */
/* ==== P0 RELIABILITY: namespaced localStorage + safe JSON backup ==== */
function _otdSafeEmailKey(email){
  return String(email||'').trim().toLowerCase().replace(/[^a-z0-9@.]/g,'_').slice(0,120);
}
function _otdWsIdStorageKey(){
  const email = localStorage.getItem(USER_KEY) || '';
  const safe = _otdSafeEmailKey(email);
  return safe ? ('otd_ws_id::' + safe) : 'otd_ws_id';
}
function _otdGetWsId(){
  try { return localStorage.getItem(_otdWsIdStorageKey()) || ''; } catch(e){ return ''; }
}
function _otdSetWsId(id){
  try { localStorage.setItem(_otdWsIdStorageKey(), String(id||'')); } catch(e){}
}
function _otdIsWorkspaceScopedKey(baseKey){
  // Workspace-scoped means: should be separated between accounts/clients.
  // Keep this list small and safe; add more when you’re ready.
  const k = String(baseKey || '');
  return k === 'kasa'
    || k === 'tx_manual_import'
    || k === 'bills_manual_import'
    || k === 'accMeta'
    || k === 'invoice_templates'
    || k === 'inventory_templates';
}
function _otdDataKey(baseKey){
  // data keys must be per-user to avoid cross-account mixing;
  // and (for workspace-scoped keys) per-account/client to avoid cross-client mixing.
  const email = localStorage.getItem(USER_KEY) || '';
  const safe = _otdSafeEmailKey(email);
  if(!safe) return baseKey; // guest falls back to legacy key

  if (_otdIsWorkspaceScopedKey(baseKey)) {
    const wsId = _otdGetWsId() || 'ws_default';
    return baseKey + '::' + safe + '::' + wsId;
  }

  return baseKey + '::' + safe;
}
function _otdGetJSON(baseKey, defVal){
  const key = _otdDataKey(baseKey);
  let raw = localStorage.getItem(key);

  // migrate legacy -> namespaced on first run (and legacy per-user -> per-workspace when needed)
  if((raw === null || raw === undefined || raw === "") && key !== baseKey){
    // 1) if this is workspace-scoped key, first try legacy per-user key (without wsId)
    const email = localStorage.getItem(USER_KEY) || '';
    const safe = _otdSafeEmailKey(email);
    if (safe && _otdIsWorkspaceScopedKey(baseKey)) {
      const legacyUserKey = baseKey + '::' + safe; // previous schema: per-user only
      const legacyUserVal = localStorage.getItem(legacyUserKey);
      if (legacyUserVal) {
        try { localStorage.setItem(key, legacyUserVal); } catch(_){}
        raw = legacyUserVal;
      }
    }

    // 2) fallback: super-legacy global key (guest schema)
    if((raw === null || raw === undefined || raw === "") ){
      const legacy = localStorage.getItem(baseKey);
      if(legacy){
        try{ localStorage.setItem(key, legacy); }catch(_){}
        raw = legacy;
      }
    }
  }

  try{
    return JSON.parse(raw || (Array.isArray(defVal)?'[]':'{}'));
  }catch(e){
    // try backup
    const bak = localStorage.getItem(key + '__bak');
    try{
      const parsed = JSON.parse(bak || (Array.isArray(defVal)?'[]':'{}'));
      try{ localStorage.setItem(key, bak); }catch(_){}
      return parsed;
    }catch(_){
      return defVal;
    }
  }
}
function _otdSetJSON(baseKey, value){
  const key = _otdDataKey(baseKey);
  try{
    const prev = localStorage.getItem(key);
    if(prev !== null && prev !== undefined){
      localStorage.setItem(key + '__bak', prev);
    }
    localStorage.setItem(key, JSON.stringify(value));
  }catch(e){
    console.warn('[otd] failed to save', baseKey, e);
  }
}
function _otdSetSchemaV(v){
  try{ localStorage.setItem(_otdDataKey('otd_schema_v'), String(v||'')); }catch(_){}
}
function _otdGetSchemaV(){
  const v = localStorage.getItem(_otdDataKey('otd_schema_v'));
  const n = parseInt(String(v||'0'), 10);
  return Number.isFinite(n) ? n : 0;
}

function loadLocal(){
  // P0: read from namespaced keys (per user), with legacy migration + backup restore
  kasa = _otdGetJSON('kasa', []);
  tx = _otdGetJSON('tx_manual_import', []);
  bills = _otdGetJSON('bills_manual_import', []);
  accMeta = _otdGetJSON('accMeta', {});
  invoiceTemplates = _otdGetJSON('invoice_templates', []);

  // schema marker for future migrations
  if(_otdGetSchemaV() < 2) _otdSetSchemaV(2);

  ensureTxIds();
  ensureKasaIds();
}

function saveLocal(){
  // P0: atomic-ish save with backups
  _otdSetJSON('kasa', kasa);
  _otdSetJSON('tx_manual_import', tx);
  _otdSetJSON('bills_manual_import', bills);
  _otdSetJSON('accMeta', accMeta);

  // NEW: обновляем облако
  pushCloudState();
}


function demoLeftMs(){
  // Prefer explicit demo-until (used by access page + server sync)
  const until = localStorage.getItem('otd_demo_until');
  if(until){
    const end = new Date(until).getTime();
    const left = end - Date.now();
    if(left > 0) return left;
  }

  // Fallback: DEMO_START + 24h (legacy)
  const t = localStorage.getItem(DEMO_START);
  if (t) {
    const start = new Date(t).getTime();
    const left  = (start + 24*3600*1000) - Date.now();
    if (left > 0) return left;
  }

  return 0;
}

function isSubActive(){
  try{
    const flag = localStorage.getItem(SUB_KEY);
    if (flag !== '1') return false;
    const to = localStorage.getItem(SUB_TO) || '';
    if (!to) return true;
    const end = new Date(to).getTime();
    if (!isFinite(end)) return true;
    return end > Date.now();
  }catch(_e){
    return false;
  }
}


function isDemoActive(){ 
  return demoLeftMs() > 0; 
}

function gateAccess(){
  const gate = $id('gate');
  const tabs = document.querySelectorAll('.tabs .tab');
  const isAdmin = localStorage.getItem('otd_isAdmin') === '1';

  if (!gate) return;

  // Админ: всегда полный доступ, без баннеров и блокировок
  if (isAdmin) {
    gate.classList.add('hidden');
    if (document && document.body) {
      document.body.classList.remove('app-locked');
    }
    tabs.forEach(t => t.classList.remove('disabled'));
    return;
  }

  // Обычные пользователи: проверяем демо / подписку
  const ok = isSubActive() || isDemoActive();

  gate.classList.toggle('hidden', ok);

  if (document && document.body) {
    document.body.classList.toggle('app-locked', !ok);
  }

  tabs.forEach(t=>{
    if (t.dataset.sec === 'ustawienia') {
      t.classList.remove('disabled');
    } else {
      t.classList.toggle('disabled', !ok);
    }
  });

  if (!ok){
    const settingsTab = document.querySelector('[data-sec=ustawienia]');
    if (settingsTab) settingsTab.click();
  }
}

function updateSubUI(){
  const box = $id('subStatus');
  if (!box) return;

  const badge = $id('subBadge');

  const lang = (localStorage.getItem('otd_lang') || 'pl').toLowerCase();
  const locale = (lang === 'uk') ? 'uk-UA' : (lang === 'ru') ? 'ru-RU' : (lang === 'en') ? 'en-US' : 'pl-PL';

  const fmtDate = (iso) => {
    try {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso).slice(0,10);
      return d.toLocaleDateString(locale, { year:'numeric', month:'2-digit', day:'2-digit' });
    } catch (e) {
      return iso ? String(iso).slice(0,10) : '—';
    }
  };

  const hasSub  = isSubActive();
  const hasDemo = isDemoActive();

  let badgeText = '—';
  let badgeClass = '';
  let mainText = '—';
  let metaText = '';

  if (hasSub) {
    const toStr = fmtDate(localStorage.getItem(SUB_TO));
    badgeText = TT('sub.badge_active', null, 'ACTIVE');
    badgeClass = 'ok';
    mainText = TT('sub.status_active', { to: toStr }, `Active until ${toStr}`);
    metaText = '';
  } else if (hasDemo) {
    // Demo access: show until date if available
    let endMs = 0;
    const raw = (localStorage.getItem('otd_demo_until') || '').trim();
    if (raw) {
      const n = Number(raw);
      if (!isNaN(n)) endMs = n;
      else {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) endMs = d.getTime();
      }
    }
    if (!endMs) {
      const t = localStorage.getItem(DEMO_START);
      if (t) {
        const start = new Date(t).getTime();
        if (isFinite(start)) endMs = start + 24*3600*1000;
      }
    }

    const toStr = endMs ? fmtDate(new Date(endMs).toISOString()) : '—';
    badgeText = TT('sub.badge_demo', null, 'DEMO');
    badgeClass = 'warn';

    if (toStr && toStr !== '—') {
      mainText = TT('sub.status_demo_until', { to: toStr }, `Demo active until ${toStr}`);
    } else {
      mainText = TT('sub.status_demo', { hours: Math.max(1, Math.ceil(demoLeftMs() / 3600000)) }, 'Demo');
    }
    metaText = '';
  } else {
    badgeText = TT('sub.badge_inactive', null, 'LOCKED');
    badgeClass = 'bad';
    mainText = TT('sub.status_locked', null, TT('sub.status_no_access', null, 'Access locked'));
    metaText = '';
  }

  // Ensure structure exists
  let mainEl = box.querySelector('.subStatusMain');
  let metaEl = box.querySelector('.subStatusMeta');
  if (!mainEl || !metaEl) {
    box.innerHTML = '<div class="subStatusMain"></div><div class="subStatusMeta"></div>';
    mainEl = box.querySelector('.subStatusMain');
    metaEl = box.querySelector('.subStatusMeta');
  }

  if (mainEl) mainEl.textContent = mainText;
  if (metaEl) {
    metaEl.textContent = metaText;
    metaEl.style.display = metaText ? 'block' : 'none';
  }

  box.classList.remove('ok','warn','bad');
  if (badgeClass) box.classList.add(badgeClass);
  box.dataset.state = hasSub ? 'active' : hasDemo ? 'demo' : 'locked';

  if (badge) {
    badge.textContent = badgeText;
    badge.classList.remove('ok','warn','bad');
    if (badgeClass) badge.classList.add(badgeClass);
  }

  // Sync language bar highlight (it was confusing for humans)
  try {
    const bar = $id('langBarMain');
    if (bar) {
      bar.querySelectorAll('button[data-lang]').forEach(btn => {
        btn.classList.toggle('on', (btn.dataset.lang || '').toLowerCase() === lang);
      });
    }
  } catch(_e){}
}

try{ document.addEventListener('otd:lang', ()=>{ try{ updateSubUI(); }catch(_e){} }); }catch(_e){}

// Subscription UI (Settings): plan cards + Stripe redirect
(function(){
  async function getStripeConfig(){
    try{
      const r = await fetch('/stripe-config', { credentials: 'include' });
      if (!r.ok) return null;
      return await r.json();
    }catch(_e){
      return null;
    }
  }

  const __subEnabled = { monthly: true, m6: true, yearly: true };

  function setEnabled(cardId, enabled){
    const card = document.getElementById(cardId);
    if (!card) return;

    const plan = (card.getAttribute('data-plan') || '').toLowerCase();
    const k = (plan === '6m') ? 'm6' : plan;
    if (k) __subEnabled[k] = !!enabled;

    card.dataset.enabled = enabled ? '1' : '0';

    const btn = card.querySelector('.subBuyBtn');
    if (btn){
      // Always clickable in MVP (even if Stripe isn't configured yet)
      btn.disabled = false;
      btn.setAttribute('data-i18n', 'sub.select');
      if (window.i18n && typeof window.i18n.apply === 'function') window.i18n.apply();
    }
    card.classList.toggle('disabled', !enabled);
  }


  async function startCheckout(plan){
    const p = plan || 'monthly';

    // Optional per-plan direct links (handy for quick MVP):
    // localStorage.stripe_link (legacy) for monthly,
    // localStorage.stripe_link_6m / stripe_link_yearly for others.
    const legacyKey = (p === 'monthly') ? 'stripe_link' : `stripe_link_${p}`;
    const direct = (localStorage.getItem(legacyKey) || '').trim();
    if (direct && /^https?:\/\//i.test(direct)){
      window.location.href = direct;
      return;
    }

    let js = null;
    let resp = null;
    try{
      resp = await fetch('/create-checkout-session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: p })
      });
      js = await resp.json().catch(()=>null);
    }catch(e){
      alert(TT('sub.pay_error', null, 'Stripe error'));
      return;
    }

    if (resp && resp.status === 401){
      alert(TT('sub.login_required', null, 'Please login first'));
      return;
    }

    const url = js && (js.sessionUrl || js.url);
    if (resp && resp.ok && url){
      window.location.href = url;
      return;
    }

    const msg = (js && (js.error || js.message)) ? (js.error || js.message) : TT('sub.pay_error', null, 'Stripe error');
    alert(msg);
  }

  async function handlePlan(plan){
    const p = (plan || 'monthly').toLowerCase();
    const k = (p === '6m') ? 'm6' : p;

    if (__subEnabled[k] === false){
      alert(TT('sub.plan_not_available', null, 'Plan is not available yet'));
      return;
    }
    await startCheckout(p);
  }

  function bindCards(){
    const cards = document.querySelectorAll('#subPlansGrid .planCard');
    cards.forEach((card)=>{
      if (card.__otd_bound) return;
      card.__otd_bound = true;

      card.addEventListener('click', (e)=>{
        // Let buttons handle their own clicks
        const t = e && e.target;
        if (t && t.closest && t.closest('button')) return;

        const plan = card.getAttribute('data-plan') || 'monthly';
        handlePlan(plan);
      });
    });
  }

  function bindButtons(){
    const buttons = document.querySelectorAll('.subBuyBtn');
    buttons.forEach((btn)=>{
      if (btn.__otd_bound) return;
      btn.__otd_bound = true;
      btn.addEventListener('click', (e)=>{
        e.preventDefault();
        const plan = btn.getAttribute('data-plan') || 'monthly';
        handlePlan(plan);
      });
    });
  }

  function _normPlan(v){
    if (v && typeof v === 'object') return v;
    return { enabled: !!v };
  }

  function applyPrices(cfg){
    // Prices are fixed in UI/i18n for now (avoid mismatch if Stripe is not configured yet).
    // We only use Stripe config to enable/disable plan buttons.
  }

  function bindTogglePlans(){
    const btn  = document.getElementById('subTogglePlans');
    const wrap = document.getElementById('subPlansWrap');
    if (!btn || !wrap) return;

    const syncLabel = () => {
      btn.setAttribute('data-i18n', wrap.classList.contains('hidden') ? 'sub.choose_plan' : 'sub.hide_plans');
      if (window.i18n && typeof window.i18n.apply === 'function') window.i18n.apply();
    };

    if (!btn.__otd_bound){
      btn.__otd_bound = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        wrap.classList.toggle('hidden');
        syncLabel();
      });
    }

    syncLabel();
  }

  async function init(){
    bindButtons();
    bindCards();
    bindTogglePlans();

    const cfg = await getStripeConfig();
    if (cfg && cfg.plans){
      const p = cfg.plans || {};
      const m  = _normPlan(p.monthly);
      const m6 = _normPlan(p.m6);
      const y  = _normPlan(p.yearly);

      setEnabled('planMonthly', !!m.enabled);
      setEnabled('plan6m', !!m6.enabled);
      setEnabled('planYearly', !!y.enabled);

      applyPrices(cfg);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();





/* ==== WORKSPACES (accounts / clients) ==== */
function _otdIsAccountant(){
  return (localStorage.getItem(ROLE_KEY) || '') === 'accountant';
}
function _otdStatus(){
  return localStorage.getItem(STATUS_KEY) || '';
}
function _otdIsAccountantPro(){
  const st = _otdStatus();
  return isSubActive() || st === 'acct_pro_trial' || st === 'active' || st === 'discount_active';
}
function _otdGetWorkspaces(){
  return _otdGetJSON('otd_workspaces', []);
}
function _otdSetWorkspaces(list){
  _otdSetJSON('otd_workspaces', Array.isArray(list) ? list : []);
}
function _otdEnsureWorkspaces(){
  const role = localStorage.getItem(ROLE_KEY) || 'freelance_business';
  let list = _otdGetWorkspaces();
  if (!Array.isArray(list)) list = [];

  // Only accountants have multiple client workspaces.
  if (role !== 'accountant') {
    // Collapse any legacy multi-workspace setup into a single workspace "main"
    const email = localStorage.getItem(USER_KEY) || '';
    const safe = _otdSafeEmailKey(email);
    const wsKeys = ['kasa','tx_manual_import','bills_manual_import','accMeta','invoice_templates','inventory_templates'];

    const makeWsKey = (baseKey, wsId)=>{
      if (!safe) return baseKey;
      return baseKey + '::' + safe + '::' + wsId;
    };

    const copyIfEmpty = (fromId, toId)=>{
      if (!safe) return;
      wsKeys.forEach(k=>{
        const fromK = makeWsKey(k, fromId);
        const toK = makeWsKey(k, toId);
        const fromV = localStorage.getItem(fromK);
        if (fromV == null) return;
        const toV = localStorage.getItem(toK);
        if (toV == null || toV === '' || toV === 'null' || toV === '[]' || toV === '{}') {
          try { localStorage.setItem(toK, fromV); } catch(e){}
        }
      });
    };

    const existingIds = (list || []).map(w=>w && w.id).filter(Boolean);
    if (!existingIds.includes('main')) {
      // best-effort migration from the earlier accidental "personal/business" split
      copyIfEmpty('personal', 'main');
      copyIfEmpty('business', 'main');
      list = [{ id: 'main', name: 'Основной', type: 'freelance_business' }];
      _otdSetWorkspaces(list);
    } else {
      const main = (list || []).find(w=>w && w.id==='main') || { id:'main', name:'Основной', type:'freelance_business' };
      list = [{ id: 'main', name: (main.name || 'Основной'), type: 'freelance_business' }];
      _otdSetWorkspaces(list);
    }

    _otdSetWsId('main');
    return { list, current: 'main', role };
  }

  // Accountant: client workspaces
  if (list.length === 0) {
    list = [{ id: 'c1', name: 'Клиент 1', type: 'client' }];
    _otdSetWorkspaces(list);
  }

  let cur = _otdGetWsId();
  if (!cur || !list.find(w => w && w.id === cur)) {
    cur = (list[0] && list[0].id) ? list[0].id : 'c1';
    _otdSetWsId(cur);
  }

  return { list, current: cur, role };
}


function renderWorkspaceControls(){
  const card = $id('workspaceCard');
  const sel = $id('workspaceSelect');
  const addBtn = $id('workspaceAdd');
  const rmBtn = $id('workspaceRemove');
  const title = $id('workspaceTitle');
  const desc = $id('workspaceDesc');
  const hint = $id('workspaceLimitHint');

  if (!card || !sel || !title) return;

  const { list, current, role } = _otdEnsureWorkspaces();

  // Only accountants should see/select workspaces (clients)
  if (role !== 'accountant') {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';

  const T = (key, fallback)=>{
    try{
      if (window.i18n && typeof window.i18n.t === 'function') {
        const v = window.i18n.t(key);
        if (v && v !== key) return String(v);
      }
    }catch(e){}
    return fallback;
  };

  // Fill select
  sel.innerHTML = '';
  (list || []).forEach(w => {
    if (!w || !w.id) return;
    const opt = document.createElement('option');
    opt.value = w.id;
    opt.textContent = w.name || w.id;
    if (w.id === current) opt.selected = true;
    sel.appendChild(opt);
  });

  title.textContent = T('settings.clients_title', 'Клиенты');
  if (desc) desc.textContent = T('settings.clients_desc', 'Каждый клиент = отдельный набор данных. В Trial можно вести до 3 клиентов.');
  if (addBtn) { addBtn.style.display = ''; addBtn.textContent = T('settings.btn_add_client', '+ Клиент'); }
  if (rmBtn) { rmBtn.style.display = ''; rmBtn.textContent = T('settings.btn_remove_client', 'Удалить'); rmBtn.disabled = (list || []).length <= 1; }

  if (hint) {
    if (_otdIsAccountantPro()) {
      hint.textContent = T('settings.clients_hint_pro', 'PRO: клиентов без лимита.');
    } else {
      const tmpl = T('settings.clients_hint_trial', 'Trial: {n}/3 клиентов.');
      hint.textContent = tmpl.replace('{n}', String((list || []).length));
    }
  }
}


function _otdClearWorkspaceData(wsId){
  const email = localStorage.getItem(USER_KEY) || '';
  const safe = _otdSafeEmailKey(email);
  if (!safe || !wsId) return;

  const suffix = '::' + safe + '::' + wsId;
  const prefixes = [
    'kasa::',
    'tx_manual_import::',
    'bills_manual_import::',
    'accMeta::',
    'invoice_templates::',
    'inventory_templates::'
  ];

  const toDelete = [];
  for (let i=0; i<localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (!k.endsWith(suffix)) continue;
    if (prefixes.some(p => k.startsWith(p))) toDelete.push(k);
  }
  toDelete.forEach(k => { try { localStorage.removeItem(k); } catch(e) {} });
}

async function _otdStartAccountantProTrial(desiredClients){
  // PRO trial only when attempting to exceed 3 clients.
  if (!_otdIsAccountant()) return { ok:true, started:false };
  if (_otdIsAccountantPro()) return { ok:true, started:false };
  if (desiredClients <= 3) return { ok:true, started:false };

  try {
    const r = await fetch('/accountant/start-pro-trial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ clientsCount: desiredClients })
    });
    const data = await r.json().catch(()=>null);

    if (!r.ok || !data || !data.success) {
      const err = (data && (data.error || data.message)) || ('HTTP ' + r.status);
      return { ok:false, error: err };
    }

    const u = data.user || {};
    if (u.role) localStorage.setItem(ROLE_KEY, u.role);
    if (u.status) localStorage.setItem(STATUS_KEY, u.status);

    // store trial end in demo keys to reuse the existing gate
    if (u.endAt) {
      localStorage.setItem(DEMO_START, u.startAt || new Date().toISOString());
      localStorage.setItem('otd_demo_until', u.endAt);
      localStorage.setItem(DEMO_USED, '1');
    }

    gateAccess();
    updateSubUI();
    return { ok:true, started:true };
  } catch (e) {
    return { ok:false, error: String(e && e.message ? e.message : e) };
  }
}

async function _otdAddClientWorkspace(){
  const { list } = _otdEnsureWorkspaces();
  const desired = (list || []).length + 1;

  if (_otdIsAccountant() && desired > 3 && !_otdIsAccountantPro()) {
    const ok = confirm('Trial позволяет вести до 3 клиентов. Чтобы добавить ещё, включи PRO trial на 7 дней (один раз). Продолжить?');
    if (!ok) return;

    const started = await _otdStartAccountantProTrial(desired);
    if (!started.ok) {
      alert(TT('alerts.pro_trial_enable_failed', {err: (started.error || 'unknown')}, 'Не удалось включить PRO trial: {err}'));
      return;
    }
  }

  const n = (list || []).length + 1;
  let id = 'c' + n;
  while ((list || []).find(w => w && w.id === id)) {
    id = 'c' + Math.floor(Math.random() * 1000000);
  }

  list.push({ id, name: 'Клиент ' + n, type: 'client' });
  _otdSetWorkspaces(list);
  _otdSetWsId(id);

  // reload data for the new workspace
  loadLocal();
  render();
  renderWorkspaceControls();
}

function _otdRemoveCurrentWorkspace(){
  const { list, current, role } = _otdEnsureWorkspaces();
  if (role !== 'accountant') return;
  if (!current) return;
  if ((list || []).length <= 1) return alert(TT('alerts.cannot_delete_last_client', null, 'Нельзя удалить последнего клиента.'));

  const curObj = (list || []).find(w => w && w.id === current);
  const name = (curObj && curObj.name) ? curObj.name : current;

  const ok = confirm(TT("dialogs.delete_client", {name:name}, 'Удалить клиента "{name}"? Данные этого клиента будут стерты локально.'));
  if (!ok) return;

  const nextList = (list || []).filter(w => w && w.id !== current);
  _otdClearWorkspaceData(current);

  _otdSetWorkspaces(nextList);
  const nextId = (nextList[0] && nextList[0].id) ? nextList[0].id : '';
  _otdSetWsId(nextId);

  loadLocal();
  render();
  renderWorkspaceControls();
}

function _otdSwitchWorkspace(wsId){
  if (!wsId) return;
  _otdSetWsId(wsId);
  loadLocal();
  render();
  renderWorkspaceControls();
}

/* ==== AUTOSYNC ==== */
let syncTimer=null, syncing=false;
async function fetchSources(){
  if(syncing) return; syncing=true;
  try{
    const u1=localStorage.getItem('txUrl')||$id('txUrl')?.value||"";
    const u2=localStorage.getItem('billUrl')||$id('billUrl')?.value||"";
  if(u1){const r = await fetch(u1,{cache:'no-store'});tx = parseCSV(await r.text());
  ensureTxIds();
}

    if(u2){ const r2=await fetch(u2,{cache:'no-store'}); bills = parseCSV(await r2.text()); }
    inferAccounts(); render();
    const last=$id('lastSync'); if(last) {
      const syncText = window.i18n && window.i18n.t ? window.i18n.t('buttons.sync') : "Synchronizacja";
      last.textContent = `${syncText}: ${new Date().toLocaleString()}`;
    }
    saveLocal(); pushState();
  }catch(e){
    const last=$id('lastSync'); if(last) last.textContent = 'Error: '+(e?.message||e);
  }finally{ syncing=false; }
}
function scheduleAutosync(){
  clearInterval(syncTimer); const m = parseInt(localStorage.getItem('intervalMin')||'0',10);
  if(m>0 && (localStorage.getItem('txUrl')||localStorage.getItem('billUrl'))){
    syncTimer = setInterval(fetchSources, Math.max(1,m)*60*1000);
  }
}

/* ==== CASH QUICK EXAMPLES ==== */
const cashQuickExamples={pl:["Przyjąć 250 na produkty","Wypłacić 50 na dostawę","Przyjąć 1000 depozyt","Przyjąć 50 na napoje"],
ru:["Принять 250 на продукты","Выдать 50 на доставку","Принять 1000 депозит","Принять 50 на напитки"],
en:["Accept 250 for groceries","Pay out 50 for delivery","Accept 1000 deposit","Accept 50 for drinks"],
uk:["Прийняти 250 на продукти","Видати 50 на доставку","Прийняти 1000 депозит","Прийняти 50 на напої"]};
function renderCashExamples(lang){
  const holder=$id('kasaQuickHolder'); if(!holder) return; holder.innerHTML='';
  const arr=cashQuickExamples[lang]||cashQuickExamples.pl;
  arr.forEach(txt=>{
    const btn=document.createElement('button'); btn.type='button'; btn.textContent=txt;
    btn.addEventListener('click',()=>{
      const numMatch=txt.match(/(-?\d+[.,]?\d*)/); const num=numMatch?asNum(numMatch[1]):0;
      const outRe=/(wyda|wypłac|pay out|видат|выда)/i; const isOut=outRe.test(txt);
      const note=txt.replace(/(-?\d+[.,]?\d*\s*(zł|pln|PLN|USD|EUR)?)/i,"").trim();
      addKasa(isOut?'wydanie':'przyjęcie', num, note||txt, 'quick');
    });
    holder.appendChild(btn);
  });
}

/* ==== UNIFIED BOOK ==== */
function bookRows(){
  const rows=[];
  (tx||[]).forEach(r=>{
    rows.push({
      date: toISO(getVal(r,["Data księgowania","Data","date","Дата"]))||today(),
      source: 'bank',
      account: getVal(r,["ID konta","IBAN","account"]) || r._acc || 'UNKNOWN',
      counterparty: getVal(r,["Kontrahent","Counterparty"])||'',
      desc: getVal(r,["Tytuł/Opis","Opis","title"])||'',
      amount: asNum(getVal(r,["Kwota","Kwота","amount","Kwota_raw"]))||0,
      currency: (getVal(r,["Waluta","currency"])||'PLN').toUpperCase(),
      type:'', no:'', doc_date:'', due:'', status: getVal(r,["Status transakcji","status"])||''
    });
  });
  (bills||[]).forEach(b=>{
    const amt = -Math.abs(asNum(getVal(b,["Kwota do zapłaty","Kwota","Kwота"]))||0);
    rows.push({
      date: toISO(getVal(b,["Data wystawienia","IssueDate"]))||toISO(getVal(b,["Termin płatności","Termin"]))||today(),
      source:'invoice',
      account:'',
      counterparty: getVal(b,["Dostawca","Supplier"])||'',
      desc: 'INVOICE',
      amount: amt,
      currency: (getVal(b,["Waluta","currency"])||'PLN').toUpperCase(),
      type:'INVOICE', no:getVal(b,["Numer faktury","Invoice number"])||'',
      doc_date: toISO(getVal(b,["Data wystawienia","IssueDate"]))||'',
      due: toISO(getVal(b,["Termin płatności","Termin"]))||'',
      status: getVal(b,["Status faktury","Status"])||''
    });
  });
  (kasa||[]).forEach(k=>{
    rows.push({
      date: k.date||today(), source:'cash', account:'KASA', counterparty:'', desc:k.comment||k.source||'',
      amount: (k.type==='wydanie'?-1:1)*Math.abs(k.amount||0), currency:'PLN', type:'CASH', no:'', doc_date:'', due:'', status:''
    });
  });
  return rows.sort((a,b)=> (a.date<b.date?-1: a.date>b.date?1:0));
}
function _otdParsePeriodInput(raw){
  const s = String(raw||'').trim();
  if(!s) return null;

  // month: YYYY-MM
  if(/^\d{4}-\d{2}$/.test(s)){
    const [y,m] = s.split('-').map(n=>parseInt(n,10));
    if(!y || !m) return null;
    const from = new Date(Date.UTC(y, m-1, 1));
    const to   = new Date(Date.UTC(y, m, 1)); // exclusive
    return { from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10), label: s };
  }

  // range: YYYY-MM-DD..YYYY-MM-DD
  const m = s.match(/^(\d{4}-\d{2}-\d{2})\s*\.\.\s*(\d{4}-\d{2}-\d{2})$/);
  if(m){
    const a = new Date(m[1]+'T00:00:00Z');
    const b = new Date(m[2]+'T00:00:00Z');
    if(!isFinite(a.getTime()) || !isFinite(b.getTime())) return null;
    // inclusive end -> exclusive next day
    const to = new Date(b.getTime() + 24*3600*1000);
    return { from: m[1], to: to.toISOString().slice(0,10), label: m[1] + '..' + m[2] };
  }

  return null;
}
function _otdAskExportPeriod(){
  const now = new Date();
  const y = now.getFullYear();
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const def = `${y}-${mm}`;
  const raw = prompt(
    "Export period:\n- month: YYYY-MM\n- range: YYYY-MM-DD..YYYY-MM-DD\n\nExample: 2025-12 or 2025-12-01..2025-12-31",
    def
  );
  if(raw === null) return null;
  const p = _otdParsePeriodInput(raw);
  if(!p){
    alert(TT("alerts.invalid_period", null, "Неверный период. Используй YYYY-MM или YYYY-MM-DD..YYYY-MM-DD"));
    return null;
  }
  return p;
}
function _otdInPeriod(dateISO, period){
  const d = String(dateISO||'').slice(0,10);
  if(!d) return false;
  return (d >= period.from && d < period.to);
}

function renderBook(){
  const tb=document.querySelector('#bookTable tbody'); if(!tb) return; // таблицы нет — тихий выход
  const rows=bookRows();
  rows.forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${r.date}</td><td>${r.source}</td><td>${r.account||'—'}</td><td>${r.counterparty||''}</td><td>${r.desc||''}</td><td>${fmtAmountRaw(r.amount)}</td><td>${r.currency}</td><td>${r.type||''}</td><td>${r.no||''}</td><td>${r.doc_date||''}</td><td>${r.due||''}</td><td>${r.status||''}</td>`;
    tb.appendChild(tr);
  });
}
function exportBookCSV(){
  const period = _otdAskExportPeriod();
  if(!period) return;
  const rows=bookRows().filter(r=>_otdInPeriod(r.date, period));
  if(!rows.length){ alert(TT('alerts.no_data_period', null, 'Нет данных за этот период.')); return; }
  const head=['date','source','account','counterparty','description','amount','currency','doc_type','doc_no','doc_date','due_date','status'];
  const rowsP = rows.filter(r=>_otdInPeriod(r.date, period));
  if(!rowsP.length){ alert(TT('alerts.no_data_period', null, 'Нет данных за этот период.')); return; }
  const csv=[head.join(',')].concat(rowsP.map(r=>[
    r.date,r.source,r.account,(r.counterparty||'').replace(/,/g,' '),(r.desc||'').replace(/,/g,' '),
    (r.amount||0).toFixed(2),r.currency,r.type||'',r.no||'',r.doc_date||'',r.due||'',(r.status||'').replace(/,/g,' ')
  ].join(','))).join('\n');
  const blob=new Blob([csv],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`otd_book_${period.label}.csv`; a.click();
}


function exportTxCSV(){
  const period = _otdAskExportPeriod();
  if(!period) return;
  const head=['date','account','counterparty','description','amount','currency','status'];
  const rows = (tx||[]).map(r=>({
    date: toISO(getVal(r,["Data księgowania","Data","date","Дата"]))||today(),
    account: getVal(r,["ID konta","IBAN","account"])||'UNKNOWN',
    counterparty: getVal(r,["Kontrahent","Counterparty"])||'',
    desc: getVal(r,["Tytuł/Opis","Opis","title"])||'',
    amount: asNum(getVal(r,["Kwota","Kwota","amount","Kwota_raw"]))||0,
    currency: (getVal(r,["Waluta","currency"])||'PLN').toUpperCase(),
    status: getVal(r,["Status transakcji","status"])||''
  }));
  const rowsP = rows.filter(r=>_otdInPeriod(r.date, period));
  if(!rowsP.length){ alert(TT('alerts.no_data_period', null, 'Нет данных за этот период.')); return; }
  const csv=[head.join(',')].concat(rowsP.map(r=>[
    r.date,
    r.account,
    (r.counterparty||'').replace(/,/g,' '),
    (r.desc||'').replace(/,/g,' '),
    (r.amount||0).toFixed(2),
    r.currency,
    (r.status||'').replace(/,/g,' ')
  ].join(','))).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`otd_statement_${period.label}.csv`; a.click();
}

function exportBillsCSV(){
  const period = _otdAskExportPeriod();
  if(!period) return;
  const head=['due_date','invoice_no','supplier','amount','currency','status'];
  const rows = (bills||[]).map(b=>({
    due: toISO(getVal(b,["Termin płatności","Termin"]))||'',
    no: getVal(b,["Numer faktury","Invoice number"])||'',
    supplier: getVal(b,["Dostawca","Supplier"])||'',
    amount: asNum(getVal(b,["Kwota do zapłaty","Kwota","Kwота"]))||0,
    currency: (getVal(b,["Waluta","currency"])||'PLN').toUpperCase(),
    status: getVal(b,["Status faktury","Status"])||''
  }));
  const rowsP = rows.filter(r=>_otdInPeriod(r.date, period));
  if(!rowsP.length){ alert(TT('alerts.no_data_period', null, 'Нет данных за этот период.')); return; }
  const csv=[head.join(',')].concat(rowsP.map(r=>[
    r.due,
    r.no,
    (r.supplier||'').replace(/,/g,' '),
    (r.amount||0).toFixed(2),
    r.currency,
    (r.status||'').replace(/,/g,' ')
  ].join(','))).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`otd_invoices_${period.label}.csv`; a.click();
}

function exportCashCSV(){
  const period = _otdAskExportPeriod();
  if(!period) return;
  const head=['date','type','amount','source','comment'];
  const rows = (kasa||[]).map(k=>({
    date: k.date||today(),
    type: k.type||'',
    amount: (k.type==='wydanie'?-1:1)*Math.abs(k.amount||0),
    source: k.source||'manual',
    comment: k.comment||''
  }));
  const rowsP = rows.filter(r=>_otdInPeriod(r.date, period));
  if(!rowsP.length){ alert(TT('alerts.no_data_period', null, 'Нет данных за этот период.')); return; }
  const csv=[head.join(',')].concat(rowsP.map(r=>[
    r.date,
    r.type,
    (r.amount||0).toFixed(2),
    (r.source||'').replace(/,/g,' '),
    (r.comment||'').replace(/,/g,' ')
  ].join(','))).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`otd_cash_${period.label}.csv`; a.click();
}


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
  Object.values(accMeta).forEach(a=>{
    const bal=computeAccountBalance(a.id);
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${a.id}</td>
      <td><select data-id="${a.id}" class="acc-type">
            <option ${a.type==="Biznes"?"selected":""}>Biznes</option>
            <option ${a.type==="Osobisty"?"selected":""}>Osobisty</option>
          </select></td>
      <td><select data-id="${a.id}" class="acc-cur">
            <option ${a.currency==="PLN"?"selected":""}>PLN</option>
            <option ${a.currency==="EUR"?"selected":""}>EUR</option>
            <option ${a.currency==="USD"?"selected":""}>USD</option>
            <option ${a.currency==="UAH"?"selected":""}>UAH</option>

          </select></td>
      <td>${bal.toFixed(2)}</td>
      <td><input type="number" step="0.01" value="${a.start||0}" class="acc-start" data-id="${a.id}"/></td>
      <td><input type="checkbox" class="acc-include" data-id="${a.id}" ${a.include?"checked":""}/></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll(".acc-type").forEach(el=>el.addEventListener("change",e=>{accMeta[e.target.dataset.id].type=e.target.value;saveLocal();render();pushState();}));
  tb.querySelectorAll(".acc-cur").forEach(el=>el.addEventListener("change",e=>{accMeta[e.target.dataset.id].currency=e.target.value;saveLocal();render();pushState();}));
  tb.querySelectorAll(".acc-start").forEach(el=>el.addEventListener("change",e=>{accMeta[e.target.dataset.id].start=asNum(e.target.value);saveLocal();render();pushState();}));
  tb.querySelectorAll(".acc-include").forEach(el=>el.addEventListener("change",e=>{accMeta[e.target.dataset.id].include=e.target.checked;saveLocal();render();pushState();}));
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

/* ==== KASA CRUD ==== */
function loadKasa(){ kasa = _otdGetJSON('kasa', []); }
function addKasa(type,amount,comment,source,category){
  if(amount==null||isNaN(amount)) return alert("Сумма некорректна");
  const cat = category || ($id('quickCashCat')?.value || "");
  kasa.push({id:Date.now(),date:today(),type,amount:Number(amount),comment:comment||"",source:source||"ручной",category:cat});
  saveLocal(); render(); pushState();
}
function editRow(kind,id){
  if(kind==='kasa'){
    const idx=kasa.findIndex(x=> String(x.id)===String(id)); if(idx<0) return;
    const k=kasa[idx];
    const n=prompt(TT("prompts.amount", null, "Сумма:"), k.amount); if(n===null) return;
    const c=prompt("Комментарий:", k.comment||""); if(c===null) return;
    kasa[idx].amount=asNum(n); kasa[idx].comment=c;
    saveLocal(); render(); pushState(); return;
  }
  if(kind==='tx'){
    const idx=tx.findIndex(x=> (getVal(x,["ID transakcji","ID","id"])||"")===String(id)); if(idx<0) return;
    const r=tx[idx];
    const d=prompt(TT("prompts.date", null, "Дата (YYYY-MM-DD):"), toISO(getVal(r,["Data księgowania","date"])||today())); if(d===null) return;
    const a=prompt(TT("prompts.amount", null, "Сумма:"), getVal(r,["Kwota","Kwota_raw","amount"])||""); if(a===null) return;
    const cp=prompt(TT("prompts.counterparty", null, "Контрагент:"), getVal(r,["Kontrahent","Counterparty"])||""); if(cp===null) return;
    const desc=prompt(TT("prompts.description", null, "Описание:"), getVal(r,["Tytuł/Opis","Opis","title"])||""); if(desc===null) return;

    r["Data księgowania"]=toISO(d)||today();
    r["Kwota"]=asNum(a).toFixed(2);
    r["Waluta"]= detectCurrency(getVal(r,["Waluta"])||'');
    r["Kontrahent"]=cp;
    r["Tytuł/Opis"]=desc;

    saveLocal(); render(); pushState(); return;
  }
  if(kind==='bill'){
    const idx=bills.findIndex(x=> (getVal(x,["Numer faktury","Numer фактуры","Invoice number"])||"")===String(id)); if(idx<0) return;
    const r=bills[idx];
    const due=prompt(TT("prompts.due_date", null, "Срок (YYYY-MM-DD):"), toISO(getVal(r,["Termin płatności","Termin"])||today())); if(due===null) return;
    const amt=prompt(TT("prompts.amount_to_pay", null, "Сумма к оплате:"), getVal(r,["Kwota do zapłaty","Kwota"])||""); if(amt===null) return;
    const sup=prompt(TT("prompts.supplier", null, "Поставщик/контрагент:"), getVal(r,["Dostawca","Supplier"])||""); if(sup===null) return;

    r["Termin płatności"]=toISO(due)||today();
    r["Kwota do zapłaty"]=asNum(amt).toFixed(2);
    r["Waluta"]= detectCurrency(getVal(r,["Waluta"])||'');
    r["Dostawca"]=sup;

    saveLocal(); render(); pushState(); return;
  }
}
function markBillPaid(id){
  const idx=bills.findIndex(x=> (getVal(x,["Numer faktury","Numer фактуры","Invoice number"])||"")===String(id));
  if(idx<0) return;
  const r=bills[idx];
  const ok = confirm(TT("dialogs.mark_invoice_paid", null, "Отметить эту фактуру как оплачено вручную?"));
  if(!ok) return;

  r["Status faktury"] = "opłacone";
  r["Payment ID"] = "manual-" + Date.now();

  saveLocal(); render(); pushState();
}

function delRow(kind,id){
  if(kind==='kasa'){ kasa = kasa.filter(x=> String(x.id)!==String(id)); saveLocal(); render(); pushState(); return; }
  if(kind==='tx'){ tx = tx.filter(x=> (getVal(x,["ID transakcji","ID","id"])||"")!==String(id)); saveLocal(); render(); pushState(); return; }
  if(kind==='bill'){ bills = bills.filter(x=> (getVal(x,["Numer faktury","Numer фактуры","Invoice number"])||"")!==String(id)); saveLocal(); render(); pushState(); return; }
}

/* ==== EVENTS ==== */
document.addEventListener('click',(e)=>{
  const btn=e.target.closest('button'); if(!btn) return;
  const act=btn.getAttribute('data-act'); if(!act) return;
  const kind=btn.getAttribute('data-kind'), id=btn.getAttribute('data-id');

  if(act==='edit') editRow(kind,id);
  if(act==='del') delRow(kind,id);
  if(act==='cat') openCatModal(kind,id);
  if(act==='pay' && kind==='bill') markBillPaid(id);
});

// Переход к конкретному разделу
window.appGoSection = function (secId) {
  const homeEl = document.getElementById('homeScreen');
  const topBar = document.querySelector('.top');

  try {
    const sec = document.getElementById(secId);

    // Если раздела нет — не ломаем всё
    if (!sec) {
      console.warn('appGoSection: section not found:', secId);
      if (homeEl) homeEl.style.display = 'block';
      if (topBar) topBar.classList.remove('hidden');
      return;
    }

    // Прячем домашку
    if (homeEl) {
      homeEl.style.display = 'none';
    }

    // Показываем верхнюю панель
    if (topBar) {
      topBar.classList.remove('hidden');
    }

    // Скрываем все разделы
    document.querySelectorAll('.section').forEach(s => {
      s.classList.remove('active');
      s.style.display = 'none';
    });

    // Включаем нужный
    sec.classList.add('active');
    sec.style.display = 'block';

    // Analytics: render full chart on open
    if (secId === 'analytics') {
      try { renderAnalytics(); } catch(e){ console.warn('analytics', e); }
    }

    // Если есть таб под этот раздел — подсветим его, если нет — просто игнорим
    const tab = document.querySelector('.tabs .tab[data-sec="' + secId + '"]');
    if (tab) {
      document.querySelectorAll('.tabs .tab').forEach(x => x.classList.remove('active'));
      tab.classList.add('active');
    }
  } catch (e) {
    console.warn('appGoSection fatal error', e);
    if (homeEl) homeEl.style.display = 'block';
    if (topBar) topBar.classList.remove('hidden');
  }
};

// Переход на главную (домашний экран с плитками)
window.appGoHome = function () {
  const homeEl = document.getElementById('homeScreen');
  const topBar = document.querySelector('.top');

  // Показываем верхнюю панель
  if (topBar) topBar.classList.remove('hidden');

  // Скрываем все разделы
  document.querySelectorAll('.section').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });

  // Показываем домашку
  if (homeEl) homeEl.style.display = 'block';

  // Снимаем подсветку табов (если есть)
  document.querySelectorAll('.tabs .tab').forEach(x => x.classList.remove('active'));

  try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch(_e){ window.scrollTo(0,0); }
};
// Backward compatibility: some older code used appShowHome
try { if (!window.appShowHome && window.appGoHome) window.appShowHome = window.appGoHome; } catch(_e) {}



   


// Синхронизация статуса пользователя с сервером (для автоматически активированного демо)
async function syncUserStatus(){
  try {
    const resp = await fetch('/me', { credentials: 'include' });
    if (!resp.ok) return;
    const data = await resp.json();
    const user = data && data.user;
    if (!user) return;

    // Role + status (server source of truth)
    if (user.role) localStorage.setItem(ROLE_KEY, user.role);
    if (user.status) localStorage.setItem(STATUS_KEY, user.status);

    // Admin flag
    if (user.isAdmin) {
      localStorage.setItem('otd_isAdmin', '1');
    } else {
      localStorage.removeItem('otd_isAdmin');
    }

    const role = (user.role || localStorage.getItem(ROLE_KEY) || 'freelance_business');

    // Enforce accountant landing (different UI)
    try {
      if (role === 'accountant' && !/\/accountant\.html$/.test(window.location.pathname)) {
        window.location.replace('/accountant.html');
        return;
      }
    } catch(e){}

    const status = (user.status || '');
    // Client-side invite banner (live polling: no need to relogin)
    try {
      const r2 = (role || 'freelance_business');
      if (r2 !== 'accountant' && !window.__OTD_INV_POLL_STARTED) {
        window.__OTD_INV_POLL_STARTED = true;

        async function _otdPullInvites(){
          try{
            const rr = await fetch('/api/client/invites', { credentials:'include' });
            if (!rr.ok) return;
            const jj = await rr.json().catch(()=>({}));
            const invs = (jj && Array.isArray(jj.invites)) ? jj.invites : [];

            const existing = document.getElementById('otdInviteBar');
            if (!invs.length){
              if (existing) existing.remove();
              return;
            }

            const inv = invs[0];
            const sig = String((inv && inv.accountantEmail) || '') + '|' + String((inv && inv.createdAt) || '');
            if (existing && existing.getAttribute('data-sig') === sig) return;
            if (existing) existing.remove();

            const bar = document.createElement('div');
            bar.id = 'otdInviteBar';
            bar.setAttribute('data-sig', sig);
            bar.style.position = 'fixed';
            bar.style.left = '12px';
            bar.style.right = '12px';
            bar.style.top = '12px';
            bar.style.zIndex = '9999';
            bar.style.background = 'rgba(15,18,20,.94)';
            bar.style.border = '1px solid rgba(71,181,0,.45)';
            bar.style.borderRadius = '14px';
            bar.style.padding = '12px';
            bar.style.boxShadow = '0 12px 40px rgba(0,0,0,.35)';
            bar.innerHTML = `
              <div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap">
                <div style="min-width:220px">
                  <div style="font-weight:800">${TT('documents.invite_title', null, 'Приглашение от бухгалтера')}</div>
                  <div style="opacity:.8;font-size:12px;margin-top:4px">${(inv && inv.accountantEmail) ? inv.accountantEmail : ''}</div>
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                  <button id="otdInvAccept" style="background:#47b500;color:#08130a;border:none;border-radius:10px;padding:10px 12px;font-weight:800;cursor:pointer">${TT('documents.btn_accept', null, 'Принять')}</button>
                  <button id="otdInvDecline" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:10px 12px;font-weight:700;cursor:pointer">${TT('documents.btn_decline', null, 'Отклонить')}</button>
                </div>
              </div>
            `;
            document.body.appendChild(bar);

            const send = (action)=>{
              fetch('/api/client/invites/respond', {
                method:'POST',
                headers:{ 'Content-Type':'application/json' },
                credentials:'include',
                body: JSON.stringify({ accountantEmail: inv.accountantEmail, action })
              }).then(()=>{ bar.remove(); location.reload(); }).catch(()=>{ bar.remove(); });
            };
            bar.querySelector('#otdInvAccept')?.addEventListener('click', ()=>send('accept'));
            bar.querySelector('#otdInvDecline')?.addEventListener('click', ()=>send('decline'));
          }catch(_e){}
        }

        _otdPullInvites();
        setInterval(()=>{ try{ if (!document.hidden) _otdPullInvites(); }catch(_){ } }, 15000);
      }
    } catch(e){}

// Client: accountant requests + file upload (jpg/png/pdf) + attach from Vault
    try {
      if ((role || 'freelance_business') !== 'accountant') {

        const ensureClientRequestsUI = ()=>{
          // Button
          if (!document.getElementById('openClientRequestsBtn')) {
            const anchor = document.getElementById('openVaultBtn') || document.querySelector('#docs .row') || document.querySelector('#docs') || document.body;
            const btn = document.createElement('button');
            btn.id = 'openClientRequestsBtn';
            btn.className = 'btn secondary';
            btn.type = 'button';
            btn.textContent = TT('documents.req_btn', null, 'Запросы бухгалтера');
            btn.style.marginLeft = '8px';
            if (anchor && anchor.parentNode) {
              // try to place near Vault button
              if (anchor.id === 'openVaultBtn') anchor.insertAdjacentElement('afterend', btn);
              else anchor.insertAdjacentElement('afterbegin', btn);
            } else {
              document.body.appendChild(btn);
            }
          }

          // Modal
          if (!document.getElementById('clientRequestsModal')) {
            const modal = document.createElement('div');
            modal.id = 'clientRequestsModal';
            modal.style.display = 'none';
            modal.style.position = 'fixed';
            modal.style.left = '0';
            modal.style.top = '0';
            modal.style.right = '0';
            modal.style.bottom = '0';
            modal.style.zIndex = '9998';
            modal.style.background = 'rgba(0,0,0,.55)';
            modal.style.backdropFilter = 'blur(6px)';
            modal.style.overflowY = 'auto';
            modal.style.webkitOverflowScrolling = 'touch';
            modal.innerHTML = `

              <div style="max-width:860px;margin:16px auto;padding:0 12px;min-height:calc(100vh - 32px);display:flex;align-items:flex-start">
                <div class="card" style="padding:14px;border-radius:16px;width:100%;max-height:calc(100vh - 32px);display:flex;flex-direction:column">
                  <div class="row between" style="gap:10px;align-items:center;flex-wrap:wrap">
                    <div>
                      <div style="font-weight:900;font-size:16px">${TT('documents.req_title', null, 'Запросы от бухгалтера')}</div>
                      <div class="muted small" style="margin-top:2px">${TT('documents.req_desc', null, 'Прикрепляй файлы к конкретному запросу.')}</div>
                    </div>
                    <div class="row" style="gap:8px;align-items:center">
                      <button id="clientRequestsClose" class="btn secondary" type="button">${TT('buttons.close', null, 'Закрыть')}</button>
                    </div>
                  </div>
                  <div id="clientReqList" style="margin-top:12px;overflow:auto;flex:1;min-height:180px;padding-right:6px"></div>
                  <input id="clientReqFileInput" type="file" accept=".jpg,.jpeg,.png,.pdf" multiple style="display:none" />
                </div>
              </div>
            `;
            document.body.appendChild(modal);
          }
        };

        ensureClientRequestsUI();

        const btnOpen = document.getElementById('openClientRequestsBtn');
        const modal = document.getElementById('clientRequestsModal');
        const listEl = document.getElementById('clientReqList');
        const closeBtn = document.getElementById('clientRequestsClose');
        const fileInput = document.getElementById('clientReqFileInput');

        let currentRid = null;
        let __otdClientReqModalTimer = null;

        // ---- Client Requests: visible indicator (badge + top bar) ----
        const __otdClientEmail = String((user && user.email) || localStorage.getItem('otd_user') || '').trim().toLowerCase();
        const __otdReqSeenKey = 'otd_req_seen_' + encodeURIComponent(__otdClientEmail || 'anon');
        const __otdReqLastKey = 'otd_req_last_' + encodeURIComponent(__otdClientEmail || 'anon');

        function _otdGetSeenReqIds(){
          try { return JSON.parse(localStorage.getItem(__otdReqSeenKey) || '[]'); } catch(_) { return []; }
        }
        function _otdSetSeenReqIds(arr){
          try { localStorage.setItem(__otdReqSeenKey, JSON.stringify((arr||[]).slice(-500))); } catch(_){}
        }
        function _otdRememberLastOpen(ids){
          try { localStorage.setItem(__otdReqLastKey, JSON.stringify((ids||[]).slice(-500))); } catch(_){}
        }
        function _otdGetLastOpen(){
          try { return JSON.parse(localStorage.getItem(__otdReqLastKey) || '[]'); } catch(_) { return []; }
        }

        function _otdEnsureReqBadge(){
          const btn = document.getElementById('openClientRequestsBtn');
          if (!btn) return null;
          let b = btn.querySelector('.otdReqBadge');
          if (!b){
            b = document.createElement('span');
            b.className = 'otdReqBadge';
            b.style.marginLeft = '8px';
            b.style.minWidth = '18px';
            b.style.height = '18px';
            b.style.padding = '0 6px';
            b.style.borderRadius = '999px';
            b.style.display = 'none';
            b.style.alignItems = 'center';
            b.style.justifyContent = 'center';
            b.style.fontSize = '12px';
            b.style.fontWeight = '900';
            b.style.color = '#0b1a07';
            b.style.background = '#47b500';
            b.style.boxShadow = '0 6px 18px rgba(0,0,0,.25)';
            btn.appendChild(b);
          }
          return b;
        }

        function _otdShowReqBar(payload){
          const existing = document.getElementById('otdReqBar');
          if (existing) return existing;

          const bar = document.createElement('div');
          bar.id = 'otdReqBar';
          bar.style.position = 'fixed';
          bar.style.left = '12px';
          bar.style.right = '12px';
          bar.style.top = '64px';
          bar.style.zIndex = '9999';
          bar.style.background = 'rgba(15,18,20,.94)';
          bar.style.border = '1px solid rgba(71,181,0,.45)';
          bar.style.borderRadius = '14px';
          bar.style.padding = '12px';
          bar.style.boxShadow = '0 12px 40px rgba(0,0,0,.35)';

          const title = payload && payload.title ? payload.title : TT('documents.req_bar_title', {n:1}, 'Новый запрос от бухгалтера (1)');
          const sub = payload && payload.sub ? payload.sub : '';

          bar.innerHTML = `
            <div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap">
              <div style="min-width:220px">
                <div style="font-weight:900">${title}</div>
                ${sub ? `<div style="opacity:.82;font-size:12px;margin-top:4px">${sub}</div>` : ''}
              </div>
              <div style="display:flex;gap:8px;align-items:center">
                <button id="otdReqOpen" style="background:#47b500;color:#08130a;border:none;border-radius:10px;padding:10px 12px;font-weight:900;cursor:pointer">${TT('documents.req_bar_btn_open', null, 'Открыть')}</button>
                <button id="otdReqHide" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:10px 12px;font-weight:800;cursor:pointer">${TT('documents.req_bar_btn_hide', null, 'Скрыть')}</button>
              </div>
            </div>
          `;
          document.body.appendChild(bar);
          return bar;
        }

        function _otdHideReqBar(){
          try{ document.getElementById('otdReqBar')?.remove(); }catch(_){}
        }

        async function _otdFetchClientRequests(){
          const rr = await fetch('/api/client/requests', { credentials:'include' });
          const js = await rr.json().catch(()=> ({}));
          if (!rr.ok) throw new Error((js && js.error) || 'Failed to load requests');
          return (js && js.requests) || [];
        }

        async function _otdUpdateReqIndicators(){
          try{
            const reqs = await _otdFetchClientRequests();
            const openReqs = reqs.filter(r=>{
              const st = String((r && r.status) || 'open');
              return st !== 'approved' && st !== 'rejected';
            });

            const openIds = openReqs.map(r=> String(r.id||'')).filter(Boolean);
            _otdRememberLastOpen(openIds);

            // Badge on the "Запросы бухгалтера" button
            const badge = _otdEnsureReqBadge();
            if (badge){
              badge.textContent = String(openReqs.length || 0);
              badge.style.display = openReqs.length ? 'inline-flex' : 'none';
            }

            // Top bar only for NEW (not seen before)
            const seen = new Set(_otdGetSeenReqIds());
            const newOnes = openReqs.filter(r=> !seen.has(String(r.id||'')));
            if (!newOnes.length){
              _otdHideReqBar();
              return;
            }

            const first = newOnes[0];
            const sub = [
              (first && first.month) ? TT('documents.req_month', {month:first.month}, `Месяц: ${first.month}`) : '',
              (newOnes.length > 1) ? TT('documents.req_more', {n:(newOnes.length-1)}, `Ещё: ${newOnes.length-1}`) : ''
            ].filter(Boolean).join(' • ');

            const barTitle = TT('documents.req_bar_title', { n: newOnes.length }, `Новый запрос от бухгалтера (${newOnes.length})`);
            const bar = _otdShowReqBar({ title: barTitle, sub });
            bar.querySelector('#otdReqOpen')?.addEventListener('click', ()=>{
              try{
                // mark as seen right away so it doesn't blink forever
                const next = Array.from(new Set([ ...seen, ...newOnes.map(x=> String(x.id||'')) ]));
                _otdSetSeenReqIds(next);
                _otdHideReqBar();
              }catch(_){}
              try{ window.OTD_OpenClientRequests ? window.OTD_OpenClientRequests(String(first.id||'')) : document.getElementById('openClientRequestsBtn')?.click(); }catch(_){}
            }, { once:true });

            bar.querySelector('#otdReqHide')?.addEventListener('click', ()=>{
              try{
                const next = Array.from(new Set([ ...seen, ...newOnes.map(x=> String(x.id||'')) ]));
                _otdSetSeenReqIds(next);
              }catch(_){}
              _otdHideReqBar();
            }, { once:true });

          }catch(_e){
            // silence for MVP
          }
        }

        const esc = (s)=> String(s||'')
          .replaceAll('&','&amp;')
          .replaceAll('<','&lt;')
          .replaceAll('>','&gt;')
          .replaceAll('"','&quot;')
          .replaceAll("'","&#039;");

        const reqParts = (items)=>{
          const parts = [];
          if (items && items.bank) parts.push(TT('documents.req_part_statement', null, 'Выписка'));
          if (items && items.invoices) parts.push(TT('documents.req_part_invoices', null, 'Фактуры'));
          if (items && items.receipts) parts.push(TT('documents.req_part_receipts', null, 'Чеки'));
          if (items && items.other) parts.push(TT('documents.req_part_other', null, 'Другое') + ': ' + String(items.other).slice(0,80));
          return parts.join(' • ') || '—';
        };

        const normalizeFiles = (r)=>{
          if (Array.isArray(r && r.files) && r.files.length) return r.files;
          if (r && r.fileUrl) return [{ fileUrl: r.fileUrl, fileName: r.fileName || 'download' }];
          return [];
        };

        async function loadAndRender(focusRid){
          if (!listEl) return;
          listEl.innerHTML = '<div class="muted small">'+TT('documents.req_loading', null, 'Загрузка…')+'</div>';
          try{
            const rr = await fetch('/api/client/requests', { credentials:'include' });
            const js = await rr.json();
            const reqs = (js && js.requests) || [];
            if (!reqs.length){
              listEl.innerHTML = '<div class="hintBox">'+TT('documents.req_empty', null, 'Пока нет запросов от бухгалтера.')+'</div>';
              return;
            }
            listEl.innerHTML = reqs.map(r=>{
              const when = (r.month ? r.month : '—');
              const created = (r.createdAt ? new Date(r.createdAt).toLocaleString() : '');
              const stRaw = String(r.status || 'open');
              const st = (stRaw === 'received') ? TT('documents.req_status_sent', null, 'Отправлено')
                : (stRaw === 'approved') ? TT('documents.req_status_approved', null, 'Принято')
                : (stRaw === 'rejected') ? TT('documents.req_status_rejected', null, 'Отклонено')
                : TT('documents.req_status_pending', null, 'Ожидает');
              const dueTxt = r.dueAt ? new Date(r.dueAt).toLocaleDateString() : '';
              const isOverdue = !!(r.dueAt && stRaw !== 'approved' && Date.now() > new Date(r.dueAt).getTime());

              const showAttach = (stRaw !== 'approved');
              const files = normalizeFiles(r);
                            const filesOpen = (files.length <= 2) ? ' open' : '';
              const fileHtml = files.length
                ? `<details style="margin-top:8px"${filesOpen}>
                     <summary class="muted small" style="cursor:pointer;font-weight:800;list-style:none">${TT('documents.req_files', {n: files.length}, 'Файлы ('+files.length+')')}</summary>
                     <div class="muted small" style="margin-top:8px;display:flex;flex-direction:column;gap:4px">
                       ${files.slice(0,6).map(f=>`<div>• <a href="${esc(f.fileUrl)}" target="_blank" rel="noopener">${esc(f.fileName || 'download')}</a></div>`).join('')}
                       ${files.length>6 ? `<div class="muted small">${TT('documents.req_more_files', {n: files.length-6}, '… и ещё '+(files.length-6))}</div>` : ''}
                     </div>
                   </details>`
                : '';

              return `
                <div class="card" data-rid="${esc(r.id)}" style="padding:12px">
                  <div class="row between" style="gap:10px;align-items:flex-start">
                    <div style="flex:1">
                      <div style="font-weight:900">${esc(when)}</div>
                      <div class="muted" style="margin-top:4px">${esc(reqParts(r.items||{}))}</div>
                      ${r.note ? `<div class="muted small" style="margin-top:6px">${esc(r.note)}</div>` : ''}
                      ${(stRaw==='rejected' && r.decisionNote) ? `<div class="muted small" style="margin-top:6px"><b>${TT('common.accountant', null, 'Бухгалтер')}:</b> ${esc(r.decisionNote)}</div>` : ''}
                      ${(stRaw==='approved') ? `<div class="muted small" style="margin-top:6px"><b>${TT('common.accountant', null, 'Бухгалтер')}:</b> ${TT('documents.req_status_approved', null, 'Принято').toLowerCase()}</div>` : ''}
                      ${fileHtml}
                    </div>
                    <div class="muted small" style="text-align:right">
                      <div class="clientReqStatus" style="display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;border:1px solid rgba(71,181,0,.35);background:rgba(71,181,0,.10);font-weight:900">${esc(st)}</div>
                      ${dueTxt ? `<div class="muted small" style="margin-top:4px">${TT('documents.req_due', null, 'Срок')}: ${esc(dueTxt)}${isOverdue ? ' • <span style="color:#ff5050;font-weight:800">' + TT('documents.req_overdue', null, 'Просрочено') + '</span>' : ''}</div>` : ''}
                    </div>
                  </div>
                  <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
                    ${showAttach ? `
                      <button class="btn secondary" type="button" data-attach="${esc(r.id)}">${TT('documents.req_btn_from_phone', null, 'С телефона')}</button>
                      <button class="btn secondary" type="button" data-attach-vault="${esc(r.id)}" data-month="${esc(when)}">${TT('documents.req_btn_from_vault', null, 'Из “Мои документы”')}</button>
                    ` : `<div class="muted small">${TT('documents.req_closed', null, 'Запрос закрыт.')}</div>`}
                  </div>
                </div>
              `;
            }).join('');

            listEl.querySelectorAll('button[data-attach]').forEach(btn=>{
              btn.addEventListener('click', ()=>{
                currentRid = btn.getAttribute('data-attach');
                if (!fileInput) return;
                fileInput.value = '';
                fileInput.click();
              });
            });

            listEl.querySelectorAll('button[data-attach-vault]').forEach(btn=>{
              btn.addEventListener('click', async ()=>{
                const rid = btn.getAttribute('data-attach-vault');
                const month = btn.getAttribute('data-month') || '';
                currentRid = rid;
                if (!rid) return;

                if (window.OTD_Vault && typeof window.OTD_Vault.openPicker === 'function') {
                  await window.OTD_Vault.openPicker({ requestId: rid, suggestedMonth: month });
                  await loadAndRender(rid);
                } else {
                  alert(TT('documents.req_vault_not_ready', null, '“Мои документы” ещё не готовы в этом билде. Обнови страницу.'));
                }
              });
            });

            if (focusRid) {
              setTimeout(()=>{
                const el = listEl.querySelector(`[data-rid="${focusRid}"]`);
                if (el && el.scrollIntoView) el.scrollIntoView({ behavior:'smooth', block:'start' });
              }, 100);
            }

          } catch(e){
            listEl.innerHTML = '<div class="hintBox">'+TT('documents.req_failed', null, 'Не удалось загрузить запросы.')+'</div>';
          }
        }

        const open = async (focusRid)=>{
          if (!modal) return;
          modal.style.display = 'block';
          await loadAndRender(focusRid);

          // mark currently open requests as "seen" (so the banner/badge doesn't lie)
          if (String(role||'') !== 'accountant') {
            try{
              const reqs = await _otdFetchClientRequests();
              const openIds = (reqs||[]).filter(r=>{
                const st = String((r && r.status) || 'open');
                return st !== 'approved' && st !== 'rejected';
              }).map(r=> String(r && r.id || '')).filter(Boolean);

              const prev = _otdGetSeenReqIds();
              const set = new Set(prev);
              openIds.forEach(id=> set.add(id));
              _otdSetSeenReqIds(Array.from(set));
              _otdHideReqBar();
              _otdUpdateReqIndicators();
            }catch(_){}
          }
          // Auto-refresh while modal is open (so you don't have to relogin)
          try{
            if (__otdClientReqModalTimer) clearInterval(__otdClientReqModalTimer);
            __otdClientReqModalTimer = setInterval(()=>{ try{ if (modal && modal.style.display==='block') loadAndRender(); }catch(_){ } }, 15000);
          }catch(_){}

        };
        const close = ()=>{ if(modal) modal.style.display='none'; try{ if(__otdClientReqModalTimer){ clearInterval(__otdClientReqModalTimer); __otdClientReqModalTimer=null; } }catch(_){ } };

        // Expose for notifications deep-link
        window.OTD_OpenClientRequests = open;

        btnOpen?.addEventListener('click', ()=>open());
        closeBtn?.addEventListener('click', close);
        modal?.addEventListener('click', (e)=>{ if(e.target===modal) close(); });

        // Start request indicator polling for clients (badge + top bar)
        if (String(role||'') !== 'accountant' && !window.__OTD_REQ_INDICATORS_STARTED){
          window.__OTD_REQ_INDICATORS_STARTED = true;
          try{ _otdUpdateReqIndicators(); }catch(_){}
          setInterval(()=>{ try{ _otdUpdateReqIndicators(); }catch(_){ } }, 20000);
        }


        fileInput?.addEventListener('change', async ()=>{
          const files = Array.from(fileInput.files || []);
          if (!files.length || !currentRid) return;
          const allowed = ['image/jpeg','image/png','application/pdf'];

          const MAX = 10;
          const pick = files.slice(0, MAX);

          for (let i=0;i<pick.length;i++){
            const f = pick[i];
            if (!allowed.includes((f.type||'').toLowerCase())){
              alert('Только JPG/PNG/PDF');
              continue;
            }

            let dataUrl = '';
            try{
              dataUrl = await new Promise((resolve, reject)=>{
                const fr = new FileReader();
                fr.onload = ()=> resolve(fr.result);
                fr.onerror = ()=> reject(fr.error || new Error('read failed'));
                fr.readAsDataURL(f);
              });
            } catch(e){
              alert('Не удалось прочитать файл');
              continue;
            }

            // lightweight UI feedback
            const card = listEl?.querySelector(`[data-rid="${currentRid}"]`);
            const stEl = card ? card.querySelector('.clientReqStatus') : null;
            if (stEl) stEl.textContent = `Загрузка… (${i+1}/${pick.length})`;

            try{
              const resp = await fetch('/api/client/requests/upload', {
                method: 'POST',
                headers: { 'Content-Type':'application/json' },
                credentials: 'include',
                body: JSON.stringify({ requestId: currentRid, fileName: f.name, dataUrl })
              });
              const js = await resp.json().catch(()=> ({}));
              if (!resp.ok || !js.success){
                alert((js && js.error) ? js.error : 'Upload failed');
              }
            } catch(e){
              alert('Upload failed');
            }
          }

          await loadAndRender(currentRid);
        });
      }
    } catch(e){}



    // Reset helper that keeps localStorage consistent
    const clearAccess = () => {
      localStorage.removeItem(DEMO_START);
      localStorage.removeItem('otd_demo_until');
      localStorage.removeItem(SUB_KEY);
      localStorage.removeItem(SUB_FROM);
      localStorage.removeItem(SUB_TO);
    };

    if (role === 'accountant') {
      // ACCOUNTANT:
      // - acct_trial / acct_pro_trial => timeboxed trial access (stored in demo keys to reuse gate)
      // - active / discount_active => paid PRO (stored in SUB keys)
      if ((status === 'acct_trial' || status === 'acct_pro_trial') && user.endAt) {
        const end = new Date(user.endAt).getTime();
        if (end > Date.now()) {
          localStorage.setItem(DEMO_START, user.startAt || new Date().toISOString());
          localStorage.setItem('otd_demo_until', user.endAt);
          localStorage.setItem(DEMO_USED, '1');
          // disable SUB markers while in trial
          localStorage.removeItem(SUB_KEY);
          localStorage.removeItem(SUB_FROM);
          localStorage.removeItem(SUB_TO);
        } else {
          // trial ended
          clearAccess();
          localStorage.setItem(DEMO_USED, '1');
        }
      } else if (status === 'active' || status === 'discount_active') {
        // paid PRO
        localStorage.setItem(SUB_KEY,  '1');
        localStorage.setItem(SUB_FROM, user.startAt || '');
        localStorage.setItem(SUB_TO,   user.endAt   || '');
        localStorage.setItem(DEMO_USED, '1');
        localStorage.removeItem(DEMO_START);
        localStorage.removeItem('otd_demo_until');
      } else if (status === 'ended') {
        clearAccess();
        localStorage.setItem(DEMO_USED, '1');
      } else {
        // none / unknown
        clearAccess();
      }
    } else {
      // FREELANCE/BUSINESS: keep legacy heuristic (demo ~= 24h, else subscription)
      const dayMs = 24 * 3600 * 1000;

      if (status === 'active' && user.endAt && user.startAt) {
        const start = new Date(user.startAt).getTime();
        const end   = new Date(user.endAt).getTime();
        const now   = Date.now();
        const span  = end - start;

        if (span <= dayMs + 5 * 60 * 1000) {
          // ~24h => demo
          if (end > now) {
            localStorage.setItem(DEMO_START, user.startAt);
            localStorage.setItem('otd_demo_until', user.endAt);
            localStorage.setItem(DEMO_USED, user.demoUsed ? '1' : '0');
          } else {
            localStorage.setItem(DEMO_USED, '1');
            localStorage.removeItem(DEMO_START);
            localStorage.removeItem('otd_demo_until');
          }
          // subscription off
          localStorage.removeItem(SUB_KEY);
          localStorage.removeItem(SUB_FROM);
          localStorage.removeItem(SUB_TO);
        } else {
          // subscription
          localStorage.setItem(SUB_KEY,  '1');
          localStorage.setItem(SUB_FROM, user.startAt || '');
          localStorage.setItem(SUB_TO,   user.endAt   || '');
          localStorage.setItem(DEMO_USED, '1');
          localStorage.removeItem(DEMO_START);
          localStorage.removeItem('otd_demo_until');
        }
      } else if (user.demoUsed) {
        localStorage.setItem(DEMO_USED, '1');
        localStorage.removeItem(DEMO_START);
        localStorage.removeItem('otd_demo_until');
        localStorage.removeItem(SUB_KEY);
        localStorage.removeItem(SUB_FROM);
        localStorage.removeItem(SUB_TO);
      } else {
        localStorage.removeItem(DEMO_START);
        localStorage.removeItem('otd_demo_until');
        localStorage.removeItem(SUB_KEY);
        localStorage.removeItem(SUB_FROM);
        localStorage.removeItem(SUB_TO);
      }
    }

    gateAccess();
    updateSubUI();
    if (typeof renderWorkspaceControls === 'function') renderWorkspaceControls();
  } catch (e) {
    console.warn('syncUserStatus error', e);
  }
}



document.addEventListener('DOMContentLoaded', async ()=>{
  // Синхронизируем статус пользователя с сервером (для автоматически активированного демо)
  await syncUserStatus();
  
  // Lang bar
  document.querySelectorAll('#langBarMain button').forEach(b=>{
    b.addEventListener('click',()=> applyLang(b.dataset.lang));
  });
  applyLang(localStorage.getItem('otd_lang')||'pl');
  initTheme();
  initHelper();
  initSpendingUI();
  initTrendInteractions();
  initAnalyticsUI();
    // --- Фикс поломанной вёрстки: выносим секции из homeScreen ---
  try {
    const home = document.getElementById('homeScreen');
    const host = document.querySelector('.wrap') || document.body;

    if (home && host) {
      // верхняя панель
      const topBar = document.querySelector('.top');
      if (topBar && home.contains(topBar)) {
        host.appendChild(topBar);
      }

      // основные секции
      const moveIds = [
        'gate',
        'pulpit',
        'analytics',
        'analytics',
        'docs',
        'wyciag',
        'faktury',
        'konta',
        'kasa',
        'ustawienia',
        'aiAssist',
        'reports'
      ];

      moveIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && home.contains(el)) {
          host.appendChild(el);
        }
      });

      // helper-виджеты
      ['helperFab', 'helperPanel'].forEach(id => {
        const el = document.getElementById(id);
        if (el && home.contains(el)) {
          host.appendChild(el);
        }
      });
    }
  } catch (e) {
    console.warn('layout fix failed', e);
  }

  // --- Workspaces (accounts / clients) ---
  try {
    if (typeof renderWorkspaceControls === 'function') renderWorkspaceControls();
    const wsSel = $id('workspaceSelect');
    const wsAdd = $id('workspaceAdd');
    const wsRm  = $id('workspaceRemove');

    if (wsSel && !wsSel.__otd_bound) {
      wsSel.__otd_bound = true;
      wsSel.addEventListener('change', () => _otdSwitchWorkspace(wsSel.value));
    }
    if (wsAdd && !wsAdd.__otd_bound) {
      wsAdd.__otd_bound = true;
      wsAdd.addEventListener('click', () => _otdAddClientWorkspace());
    }
    if (wsRm && !wsRm.__otd_bound) {
      wsRm.__otd_bound = true;
      wsRm.addEventListener('click', () => _otdRemoveCurrentWorkspace());
    }
  } catch (e) {
    console.warn('workspace init failed', e);
  }

  // --- Init local state early (so money/categories show without pressing ritual buttons) ---
  try{
    if(typeof loadLocal === 'function') loadLocal();
    if(typeof ensureTxIds === 'function') ensureTxIds();
    if(typeof ensureKasaIds === 'function') ensureKasaIds();
    if(typeof inferAccounts === 'function') inferAccounts();
    if(typeof render === 'function') render();
    try{ if(typeof renderSpendingPanel==='function') renderSpendingPanel(); }catch(_){}
    try{ if(typeof initSpendingUI==='function') initSpendingUI(); }catch(_){}
  }catch(e){
    console.warn('init local render failed', e);
  }

  // Auto-sync on open if URLs are set (removes the need to mash "Zrób dzień..." every time)
  setTimeout(()=>{
    try{
      const u1 = localStorage.getItem('txUrl') || document.getElementById('txUrl')?.value || '';
      const u2 = localStorage.getItem('billUrl') || document.getElementById('billUrl')?.value || '';
      if((u1||u2) && typeof fetchSources==='function') fetchSources();
    }catch(e){}
  }, 450);

  // Home screen and premium tiles
  try{
    // навешиваем fallback на случай, если inline-обработчик не сработал
    document.querySelectorAll('.homeTile').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const t = btn.dataset.target;
        if(!t) return;
        const map = {docs:'docs',money:'pulpit',ai:'aiAssist',kasa:'kasa',accounts:'konta',reports:'reports'};
        const secId = map[t] || t;
        if(window.appGoSection) window.appGoSection(secId);
      });
    });
    // Docs buttons -> underlying file inputs
    const byId = (id)=>document.getElementById(id);
    byId('docTxCsvBtn')?.addEventListener('click', ()=> byId('txFile')?.click());
    byId('docTxImgBtn')?.addEventListener('click', ()=> byId('txImage')?.click());
    byId('docBillCsvBtn')?.addEventListener('click', ()=> byId('billFile')?.click());
    byId('docBillImgBtn')?.addEventListener('click', ()=> byId('billImage')?.click());
    byId('docCashImgBtn')?.addEventListener('click', ()=> byId('cashPhoto')?.click());
// Docs: accountant tools (no share links)
    byId('docExportTxBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); try{ exportTxCSV(); }catch(err){ console.warn(err); } });
    byId('docExportBillsBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); try{ exportBillsCSV(); }catch(err){ console.warn(err); } });
    byId('docExportBookBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); try{ exportBookCSV(); }catch(err){ console.warn(err); } });
    byId('docExportCashBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); try{ exportCashCSV(); }catch(err){ console.warn(err); } });
    byId('openInvoiceTplBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); openInvoiceTplModal(); });

    byId('openInventoryTplBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); openInventoryTplModal(); });

  // Accountant tools modal (single button in Documents)
  const acctModal = byId('accountantToolsModal');
  const acctPanelExports = byId('acctPanelExports');
  const acctPanelTemplates = byId('acctPanelTemplates');
  const acctTabExports = byId('acctTabExports');
  const acctTabTemplates = byId('acctTabTemplates');

  function acctSwitch(mode){
    const isExports = (mode === 'exports');
    if(acctPanelExports) acctPanelExports.style.display = isExports ? 'flex' : 'none';
    if(acctPanelTemplates) acctPanelTemplates.style.display = isExports ? 'none' : 'flex';
    if(acctTabExports) acctTabExports.className = isExports ? 'btn' : 'btn secondary';
    if(acctTabTemplates) acctTabTemplates.className = isExports ? 'btn secondary' : 'btn';
  }
  function acctOpen(){
    if(!acctModal) return;
    acctModal.classList.add('show');
    acctSwitch('exports');
  }
  function acctClose(){
    acctModal?.classList.remove('show');
  }

  byId('openAccountantToolsBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); acctOpen(); });
  byId('accountantToolsClose')?.addEventListener('click', (e)=>{ e.preventDefault(); acctClose(); });
  acctModal?.addEventListener('click', (e)=>{ if(e.target === acctModal) acctClose(); });

  acctTabExports?.addEventListener('click', (e)=>{ e.preventDefault(); acctSwitch('exports'); });
  acctTabTemplates?.addEventListener('click', (e)=>{ e.preventDefault(); acctSwitch('templates'); });

  // Template helpers
  byId('invoiceTplNew')?.addEventListener('click', (e)=>{ e.preventDefault(); _otdTplClearForm(); toast('Nowy szablon'); });
  byId('inventoryTplNew')?.addEventListener('click', (e)=>{ e.preventDefault(); inventoryTplClearForm(); toast('Nowy szablon'); });
  byId('invoiceVoiceBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); invoiceVoiceDictate(); });

    // Invoice template modal actions
    byId('invoiceTplClose')?.addEventListener('click', (e)=>{ e.preventDefault(); closeInvoiceTplModal(); });
    byId('invoiceTplSave')?.addEventListener('click', (e)=>{ e.preventDefault(); invoiceTplSaveFromForm(); });
    byId('invoiceTplDownloadHTML')?.addEventListener('click', (e)=>{ e.preventDefault(); invoiceTplDownloadHTML(); });
    byId('invoiceTplDownloadCSV')?.addEventListener('click', (e)=>{ e.preventDefault(); invoiceTplDownloadCSV(); });


    // Inventory template modal actions
    byId('inventoryTplClose')?.addEventListener('click', (e)=>{ e.preventDefault(); closeInventoryTplModal(); });
    byId('inventoryTplSave')?.addEventListener('click', (e)=>{ e.preventDefault(); inventoryTplSaveFromForm(); });
    byId('inventoryTplDownloadCSV')?.addEventListener('click', (e)=>{ e.preventDefault(); inventoryTplDownloadCSV(); });
    byId('inventoryTplDownloadXLSX')?.addEventListener('click', (e)=>{ e.preventDefault(); inventoryTplDownloadXLSX(); });
    // Reports buttons reuse existing export actions (если они есть)
    byId('reportsTx')?.addEventListener('click', ()=> byId('exportTxCSV')?.click());
    byId('reportsBills')?.addEventListener('click', ()=> byId('exportBillsCSV')?.click());
    byId('reportsBook')?.addEventListener('click', ()=> byId('exportBook')?.click());

    // AI profile + chat UI (локально, без облачной магии)
const AI_PROFILE_KEY = 'otd_ai_profile';
const AI_CHATS_META_KEY = 'otd_ai_chats_meta_v1';
const AI_CHAT_ACTIVE_KEY = 'otd_ai_chat_active_v1';
const AI_CHAT_PREFIX = 'otd_ai_chat_msgs_';
const LEGACY_AI_CHAT_KEY = 'otd_ai_chat_v1';

const escHtml = (s)=>String(s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const loadJSON = (k, fallback)=>{
  try{ const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : fallback; }catch(e){ return fallback; }
};
const saveJSON = (k, v)=>{ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} };

const tSafe = (key, fallback)=>{
  try{
    if(window.i18n && typeof window.i18n.t==='function'){
      const v = window.i18n.t(key);
      if(!v) return fallback;
      const s = String(v).trim();
      if(!s) return fallback;
      // If i18n returns the key itself, treat as missing
      if(s === key) return fallback;
      return s;
    }
  }catch(e){}
  return fallback;
};


const getProfile = ()=>{
  const p = loadJSON(AI_PROFILE_KEY, null);
  return p && typeof p === 'object' ? p : { type:'solo', niche:'', goal:'survive', incomeTarget:0 };
};

const applyProfileToUI = ()=>{
  const p = getProfile();
  if(byId('aiProfileType')) byId('aiProfileType').value = p.type || 'solo';
  if(byId('aiProfileNiche')) byId('aiProfileNiche').value = p.niche || '';
  if(byId('aiProfileGoal')) byId('aiProfileGoal').value = p.goal || 'survive';
  if(byId('aiProfileIncomeTarget')) byId('aiProfileIncomeTarget').value = p.incomeTarget || '';
  if(byId('aiProfileSaved')) byId('aiProfileSaved').style.display = 'block';
};

const openAiSettings = ()=>{
  const ov = byId('aiSettingsOverlay');
  if(!ov) return;
  ov.classList.add('show');
  applyProfileToUI();
};
const closeAiSettings = ()=>{
  const ov = byId('aiSettingsOverlay');
  if(!ov) return;
  ov.classList.remove('show');
};

// Wire settings modal
byId('aiSettingsBtn')?.addEventListener('click', openAiSettings);
byId('aiSettingsClose')?.addEventListener('click', closeAiSettings);
byId('aiSettingsOverlay')?.addEventListener('click', (e)=>{
  if(e.target === byId('aiSettingsOverlay')) closeAiSettings();
});

// Load saved profile into UI (when elements exist)
try{ applyProfileToUI(); }catch(e){}

byId('aiProfileSave')?.addEventListener('click', ()=>{
  const profile = {
    type: byId('aiProfileType')?.value || 'solo',
    niche: byId('aiProfileNiche')?.value || '',
    goal: byId('aiProfileGoal')?.value || 'survive',
    incomeTarget: Number(byId('aiProfileIncomeTarget')?.value || 0) || 0
  };
  saveJSON(AI_PROFILE_KEY, profile);
  if(byId('aiProfileSaved')) byId('aiProfileSaved').style.display='block';
  closeAiSettings();
});

// Chat history (local, multi-chat)
const getChatsMeta = ()=>{
  let m = loadJSON(AI_CHATS_META_KEY, null);
  if(!Array.isArray(m)) m = [];
  return m;
};
const saveChatsMeta = (arr)=> saveJSON(AI_CHATS_META_KEY, arr);
const getActiveChatId = ()=> localStorage.getItem(AI_CHAT_ACTIVE_KEY) || '';
const setActiveChatId = (id)=>{ try{ localStorage.setItem(AI_CHAT_ACTIVE_KEY, id); }catch(e){} };
const chatKey = (id)=> AI_CHAT_PREFIX + id;
const loadChat = (id)=> loadJSON(chatKey(id), []);
const saveChat = (id, arr)=> saveJSON(chatKey(id), arr);

const makeChatId = ()=> 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const touchChatMeta = (id)=>{
  const meta = getChatsMeta();
  const i = meta.findIndex(x=>x && x.id===id);
  if(i>=0){ meta[i].updatedAt = Date.now(); saveChatsMeta(meta); }
};
const ensureDefaultChat = ()=>{
  // migrate legacy single-chat storage if it exists
  const legacy = loadJSON(LEGACY_AI_CHAT_KEY, null);
  let meta = getChatsMeta();
  if(Array.isArray(legacy) && legacy.length && meta.length===0){
    const id = makeChatId();
    meta = [{ id, title:'Чат', createdAt:Date.now(), updatedAt:Date.now() }];
    saveChatsMeta(meta);
    saveChat(id, legacy);
    try{ localStorage.removeItem(LEGACY_AI_CHAT_KEY); }catch(e){}
    setActiveChatId(id);
  }
  meta = getChatsMeta();
  if(meta.length===0){
    const id = makeChatId();
    meta = [{ id, title:'Чат', createdAt:Date.now(), updatedAt:Date.now() }];
    saveChatsMeta(meta);
    setActiveChatId(id);
  }
  if(!getActiveChatId() && meta[0]?.id) setActiveChatId(meta[0].id);
};

const formatShortDate = (ts)=>{
  try{ const d=new Date(ts||Date.now()); return d.toISOString().slice(0,10); }catch(e){ return ''; }
};

const renderChatList = ()=>{
  const host = byId('aiChatList');
  if(!host) return;
  const meta = getChatsMeta().slice().sort((a,b)=>(b?.updatedAt||0)-(a?.updatedAt||0));
  const active = getActiveChatId();
  host.innerHTML = meta.map(m=>{
    const isA = m.id===active;
    const name = escHtml(m.title || 'Chat');
    const dt = escHtml(formatShortDate(m.updatedAt||m.createdAt));
    return `<div class="aiChatItem ${isA?'active':''}" data-id="${escHtml(m.id)}">
      <div style="min-width:0;flex:1">
        <div class="name">${name}</div>
        <div class="meta">${dt}</div>
      </div>
      <div class="actions">
        <button class="mini" data-act="rename" title="Rename">✎</button>
        <button class="mini" data-act="del" title="Delete">🗑</button>
      </div>
    </div>`;
  }).join('');
};

const openChatDrawer = ()=>{ const d=byId('aiChatDrawer'); if(!d) return; d.classList.add('show'); renderChatList(); };
const closeChatDrawer = ()=>{ const d=byId('aiChatDrawer'); if(!d) return; d.classList.remove('show'); };

byId('aiChatsBtn')?.addEventListener('click', openChatDrawer);
byId('aiChatDrawerClose')?.addEventListener('click', closeChatDrawer);
byId('aiChatDrawer')?.addEventListener('click', (e)=>{ if(e.target===byId('aiChatDrawer')) closeChatDrawer(); });
byId('aiChatNew')?.addEventListener('click', ()=>{
  ensureDefaultChat();
  const meta = getChatsMeta();
  const id = makeChatId();
  meta.unshift({ id, title:'Новый чат', createdAt:Date.now(), updatedAt:Date.now() });
  saveChatsMeta(meta);
  setActiveChatId(id);
  saveChat(id, []);
  renderChat();
  renderChatList();
});

byId('aiChatList')?.addEventListener('click', (e)=>{
  const item = e.target.closest('.aiChatItem');
  if(!item) return;
  const id = item.getAttribute('data-id')||'';
  if(!id) return;
  const act = e.target?.getAttribute?.('data-act');
  if(act==='rename'){
    const meta = getChatsMeta();
    const i = meta.findIndex(x=>x.id===id);
    const cur = i>=0 ? (meta[i].title||'Chat') : 'Chat';
    const nn = prompt(TT("prompts.chat_name", null, "Название чата"), cur);
    if(nn && i>=0){ meta[i].title = String(nn).trim().slice(0,60) || cur; meta[i].updatedAt=Date.now(); saveChatsMeta(meta); renderChatList(); }
    return;
  }
  if(act==='del'){
    const ok = confirm(TT('dialogs.delete_chat', null, 'Удалить чат? (только локально)'));
    if(!ok) return;
    const meta = getChatsMeta().filter(x=>x.id!==id);
    saveChatsMeta(meta);
    try{ localStorage.removeItem(chatKey(id)); }catch(e){}
    if(getActiveChatId()===id){ setActiveChatId(meta[0]?.id || ''); }
    ensureDefaultChat();
    renderChat();
    renderChatList();
    return;
  }
  setActiveChatId(id);
  renderChat();
  closeChatDrawer();
});

ensureDefaultChat();

const renderChat = ()=>{
  const host = byId('aiChatLog');
  if(!host) return;
  ensureDefaultChat();
  const activeId = getActiveChatId();
  let msgs = loadChat(activeId);
  if(!Array.isArray(msgs)) msgs = [];

  // Seed with greeting once (per chat)
  if(msgs.length === 0){
        let greet = tSafe('ai.chat_intro', 'Привет! Я AI‑бухгалтер OneTapDay. С чем разберёмся сегодня: расходы, доход, платежи, долги или налоги?');
    // If i18n returns the key itself (common "missing translation" behavior), fallback to a real greeting.
    if(!greet || greet === 'ai.chat_intro'){
      greet = (window.OTD_AI && typeof window.OTD_AI.greeting==='function')
        ? window.OTD_AI.greeting(getProfile())
        : 'Привет! Я AI‑бухгалтер OneTapDay. С чем разберёмся сегодня: расходы, доход, платежи, долги или налоги?';
    }

    msgs.push({ role:'assistant', text: greet, ts: Date.now() });
    saveChat(activeId, msgs);
    touchChatMeta(activeId);
  }

  host.innerHTML = msgs.map(m=>{
    const role = (m.role === 'user') ? 'user' : 'bot';
    const atts = Array.isArray(m.attachments) ? m.attachments : [];
    let attHtml = '';
    if(atts.length){
      const items = atts.map(a=>{
        const url = String(a.fileUrl || a.url || '').trim();
        const name = String(a.fileName || a.name || 'file').trim();
        const mime = String(a.fileMime || a.mime || '').toLowerCase();
        const safeUrl = url.replace(/"/g,'&quot;');
        const thumb = (mime.startsWith('image/') && url)
          ? '<img class="aiAttachThumb" src="'+safeUrl+'" alt=""/>'
          : '<div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:8px;border:1px solid #242b30;background:#0f1418;font-size:14px">📎</div>';
        return '<a class="aiAttachItem aiAttachLink" href="'+safeUrl+'" target="_blank" rel="noopener">'+thumb+'<div class="aiAttachName">'+escHtml(name)+'</div></a>';
      }).join('');
      attHtml = '<div class="aiAttachList">'+items+'</div>';
    }
    return '<div class="aiMsg '+role+'"><div class="aiBubble">'+escHtml(m.text||'')+attHtml+'</div></div>';
  }).join('');
  host.scrollTop = host.scrollHeight;
};

const pushMsg = (role, text)=>{
  ensureDefaultChat();
  const activeId = getActiveChatId();
  const msgs = loadChat(activeId);
  msgs.push({ role, text, ts: Date.now() });
  saveChat(activeId, msgs);
  touchChatMeta(activeId);
  renderChat();
};


// --- AI chat attachments + voice (MVP: no OCR/AI required) ---
let __otdAiPendingAtt = [];
const __otdAiInboxKey = 'otd_ai_inbox_folder_id';

const __otdAiNowMonth = ()=>{
  try{ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }catch(_){ return ''; }
};

async function __otdAiEnsureInboxFolder(){
  try{
    const cached = localStorage.getItem(__otdAiInboxKey);
    if(cached) return cached;
    const name = TT('ai.inbox_name', null, 'AI Inbox');
    const r = await fetch('/api/docs/folders/create', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name })
    });
    const j = await r.json().catch(()=>null);
    if(r.ok && j && j.success && j.folder && j.folder.id){
      localStorage.setItem(__otdAiInboxKey, j.folder.id);
      return j.folder.id;
    }
  }catch(_e){}
  // fallback: use smart folder for current month/other
  try{
    const month = __otdAiNowMonth();
    const r = await fetch('/api/docs/folders/ensure', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ month, category:'other' })
    });
    const j = await r.json().catch(()=>null);
    if(r.ok && j && j.success && j.folder && j.folder.id){
      return j.folder.id;
    }
  }catch(_e){}
  return '';
}

function __otdAiRenderAttachRow(){
  const row = byId('aiAttachRow');
  if(!row) return;
  if(!__otdAiPendingAtt.length){
    row.style.display = 'none';
    row.innerHTML = '';
    return;
  }
  row.style.display = 'flex';
  row.innerHTML = __otdAiPendingAtt.map((a, idx)=>{
    const name = escHtml(String(a.fileName || 'file'));
    const mime = String(a.fileMime || '').toLowerCase();
    const status = a.status || 'ready';
    const badge = status === 'uploading' ? '⏳' : (status === 'error' ? '⚠️' : '✅');
    const thumb = (mime.startsWith('image/') && a.fileUrl)
      ? '<img class="aiAttachThumb" src="'+String(a.fileUrl).replace(/"/g,'&quot;')+'" alt=""/>'
      : '<div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:8px;border:1px solid #242b30;background:#0f1418;font-size:14px">📎</div>';
    return '<div class="aiAttachItem" data-ai-att-idx="'+idx+'">'+thumb+'<div class="aiAttachName">'+badge+' '+name+'</div><button class="btn ghost aiAttachRemove" type="button" data-ai-att-remove="'+idx+'">×</button></div>';
  }).join('');

  row.querySelectorAll('[data-ai-att-remove]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const i = parseInt(btn.getAttribute('data-ai-att-remove')||'-1',10);
      if(isNaN(i) || i<0) return;
      __otdAiPendingAtt.splice(i,1);
      __otdAiRenderAttachRow();
    });
  });
}

async function __otdAiUploadFileToDocs(file){
  const MAX = 9.5 * 1024 * 1024;
  if(!file) return null;
  if(file.size > MAX){
    return { ok:false, error: TT('ai.file_too_large', null, 'Файл слишком большой (макс 10MB).') };
  }
  const folderId = await __otdAiEnsureInboxFolder();
  if(!folderId){
    return { ok:false, error: TT('ai.file_no_folder', null, 'Не смог создать папку для файлов (Docs).') };
  }
  const dataUrl = await new Promise((resolve, reject)=>{
    const fr = new FileReader();
    fr.onload = ()=> resolve(String(fr.result||''));
    fr.onerror = ()=> reject(new Error('read_failed'));
    fr.readAsDataURL(file);
  });

  const r = await fetch('/api/docs/upload', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ folderId, fileName: file.name || 'file', dataUrl })
  });
  const j = await r.json().catch(()=>null);
  if(r.ok && j && j.success && j.file){
    return { ok:true, file: j.file };
  }
  return { ok:false, error: (j && j.error) ? j.error : 'upload_failed' };
}

async function __otdAiHandleFiles(files){
  const list = Array.from(files || []).slice(0, 6); // MVP: limit burst
  for(const f of list){
    const tmp = { fileName: f.name, fileMime: f.type, fileSize: f.size, status:'uploading' };
    __otdAiPendingAtt.push(tmp);
    __otdAiRenderAttachRow();
    try{
      const up = await __otdAiUploadFileToDocs(f);
      if(up && up.ok && up.file){
        tmp.status = 'ready';
        tmp.fileId = up.file.id;
        tmp.fileUrl = up.file.fileUrl || up.file.url || '';
        tmp.fileMime = up.file.fileMime || tmp.fileMime;
      }else{
        tmp.status = 'error';
        tmp.error = (up && up.error) ? String(up.error) : 'upload_failed';
      }
    }catch(e){
      tmp.status = 'error';
      tmp.error = (e && e.message) ? e.message : 'upload_failed';
    }
    __otdAiRenderAttachRow();
  }
}

function __otdAiAnyUploading(){
  return __otdAiPendingAtt.some(a=>a && a.status === 'uploading');
}

function __otdAiGetReadyAttachments(){
  return __otdAiPendingAtt
    .filter(a=>a && a.status === 'ready' && a.fileUrl)
    .map(a=>({ fileId:a.fileId || '', fileUrl:a.fileUrl || '', fileName:a.fileName || 'file', fileMime:a.fileMime || '' }));
}
// --- end attachments ---
const sendAiChat = async ()=>{
  const inp = byId('aiChatInput');
  if(!inp) return;
  const q = (inp.value||'').trim();
  const hasAtt = Array.isArray(__otdAiPendingAtt) && __otdAiPendingAtt.length;
  if(!q && !hasAtt) return;
  if(__otdAiAnyUploading()){
    pushMsg('assistant', TT('ai.file_uploading_wait', null, 'Подожди: файл ещё загружается.'));
    return;
  }
  const attsReady = __otdAiGetReadyAttachments();
  inp.value = '';

  // Write user message and a pending assistant bubble into the active chat
  ensureDefaultChat();
  const activeId = getActiveChatId();
  const msgs0 = loadChat(activeId);
  msgs0.push({ role:'user', text:(q||TT('ai.sent_files', null, '📎 Файлы')), ts: Date.now(), attachments: attsReady });
  __otdAiPendingAtt = [];
  __otdAiRenderAttachRow();
  msgs0.push({ role:'assistant', text:'⌛ Думаю…', ts: Date.now(), _pending:true });
  saveChat(activeId, msgs0);
  touchChatMeta(activeId);
  renderChat();

  try{
    const profile = getProfile();
    let ans = '';
    if(window.OTD_AI && typeof window.OTD_AI.answer === 'function'){
      ans = await window.OTD_AI.answer(String(q||''), { profile, attachments: attsReady });
    }else{
      ans = 'AI модуль не подключен. Проверь, что загружается /js/ai/ai-client.js.';
    }

    const msgs = loadChat(activeId);
    for(let i=msgs.length-1;i>=0;i--){
      if(msgs[i] && msgs[i]._pending){
        msgs[i].text = ans;
        delete msgs[i]._pending;
        break;
      }
    }
    saveChat(activeId, msgs);
    touchChatMeta(activeId);
    renderChat();
  }catch(e){
    const msgs = loadChat(activeId);
    for(let i=msgs.length-1;i>=0;i--){
      if(msgs[i] && msgs[i]._pending){
        msgs[i].text = 'Не смог ответить: ' + ((e && e.message) ? e.message : 'ошибка');
        delete msgs[i]._pending;
        break;
      }
    }
    saveChat(activeId, msgs);
    touchChatMeta(activeId);
    renderChat();
  }
};

byId('aiChatSend')?.addEventListener('click', sendAiChat);
byId('aiChatInput')?.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter' && !e.shiftKey){
    e.preventDefault();
    sendAiChat();
  }
});


// Attachments UI
byId('aiAttachBtn')?.addEventListener('click', ()=>{
  byId('aiFileInput')?.click();
});
byId('aiFileInput')?.addEventListener('change', (e)=>{
  try{
    const files = e && e.target && e.target.files ? e.target.files : [];
    if(files && files.length) __otdAiHandleFiles(files);
  }catch(_e){}
  try{ e.target.value = ''; }catch(_){}
});

// Voice input (Web Speech API - Chrome)
(function(){
  const btn = byId('aiVoiceBtn');
  const inp = byId('aiChatInput');
  if(!btn || !inp) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){
    btn.style.opacity = '0.55';
    btn.title = TT('ai.voice_unsupported', null, 'Голосовой ввод недоступен в этом браузере');
    return;
  }
  let rec = null;
  let active = false;

  const langMap = { pl:'pl-PL', en:'en-US', ru:'ru-RU', uk:'uk-UA' };
  const getLang = ()=>{
    try{
      const k = String(localStorage.getItem('otd_lang') || 'pl').toLowerCase().trim();
      return langMap[k] || 'pl-PL';
    }catch(_){ return 'pl-PL'; }
  };

  function stop(){
    try{ if(rec) rec.stop(); }catch(_){}
    active = false;
    btn.classList.remove('is-recording');
    btn.textContent = '🎤';
  }

  function start(){
    try{
      rec = new SR();
      rec.lang = getLang();
      rec.interimResults = true;
      rec.continuous = false;

      let finalText = '';
      rec.onresult = (ev)=>{
        try{
          let interim = '';
          for(let i=ev.resultIndex;i<ev.results.length;i++){
            const tr = ev.results[i] && ev.results[i][0] ? ev.results[i][0].transcript : '';
            if(ev.results[i].isFinal) finalText += tr;
            else interim += tr;
          }
          // show interim in input without destroying current text
          const base = inp.value.replace(/\s*\[.*?\]\s*$/,'');
          const combined = (base + ' ' + (finalText + interim)).replace(/\s+/g,' ').trim();
          inp.value = combined;
        }catch(_){}
      };
      rec.onerror = ()=> stop();
      rec.onend = ()=> stop();

      rec.start();
      active = true;
      btn.classList.add('is-recording');
      btn.textContent = '⏹';
    }catch(_e){
      stop();
      pushMsg('assistant', TT('ai.voice_failed', null, 'Не смог включить голосовой ввод.'));
    }
  }

  btn.addEventListener('click', ()=>{
    if(active) stop();
    else start();
  });
})();
// Initial render
renderChat();

  }catch(e){
    console.warn('home/ai wiring error', e);
  }
  // Tabs (with gate)
  document.querySelectorAll('.tabs .tab').forEach(t=>{
    t.addEventListener('click', ()=>{
      // Если раздел заблокирован — ведём в Ustawienia
      if (t.classList.contains('disabled')) {
        document.querySelector('[data-sec=ustawienia]')?.click();
        return;
      }

      const secId = t.dataset.sec;
      if (!secId) return;

      // Панель = раздел pulpit (дневной обзор)
      if (secId === 'pulpit' && window.appGoSection) {
        window.appGoSection('pulpit');
        return;
      }

      // Остальные вкладки ведут в свои разделы
      if (window.appGoSection) {
        window.appGoSection(secId);
      }
    });
  });

  // Buttons
  $id('backHomeBtn')?.addEventListener('click', ()=> { try{ if(window.appGoHome) window.appGoHome(); }catch(_e){} });
  $id('settingsBtn')?.addEventListener('click', ()=> window.appGoSection && appGoSection('ustawienia'));
  $id('runAIAll')?.addEventListener('click', runAIAll);
  $id('makePlan')?.addEventListener('click', renderPlan);
  $id('applyPlan')?.addEventListener('click', renderPlan);
   $id('applyMinPay')?.addEventListener('click', () => {
    try {
      // Заглушка: просто пересчитать план и сохранить
      render();
      saveLocal();
      pushState();
    } catch (e) {
      console.warn('applyMinPay error', e);
    }
  });

  $id('syncNow')?.addEventListener('click', fetchSources);
  $id('closeDay')?.addEventListener('click', openCloseDayModal);
  $id('closeDayCancel')?.addEventListener('click', closeCloseDayModal);

  $id('addToday')?.addEventListener('click', openAddTodayModal);
  $id('addTodayCancel')?.addEventListener('click', closeAddTodayModal);
  $id('addBankBtn')?.addEventListener('click', goAddBank);
  $id('addCashBtn')?.addEventListener('click', goAddCash);
  $id('addBillsBtn')?.addEventListener('click', goAddBills);

  $id('exportBook')?.addEventListener('click', exportBookCSV);
  $id('exportTxCSV')?.addEventListener('click', exportTxCSV);
  $id('exportBillsCSV')?.addEventListener('click', exportBillsCSV);
  $id('exportCashCSV')?.addEventListener('click', exportCashCSV);


  $id('runDayAI')?.addEventListener('click', ()=>{ try{ fetchSources(); }catch(e){ console.warn('runDayAI error', e); } });
  $id('openAIQuestions')?.addEventListener('click', ()=>{
    try{
      if(window.appGoSection) window.appGoSection('aiAssist');
      const inp = document.getElementById('aiChatInput');
      if(inp){
        inp.focus();
        try{ inp.scrollIntoView({block:'center'}); }catch(_){}
      }
    }catch(e){
      console.warn('openAIQuestions error', e);
    }
  });


// File/url
// Безопасный импорт файлов с честным сообщением пилоту
async function safeImportFile(kindLabel, importerFn, file){
  try{
    const rows = await importerFn(file);
    return Array.isArray(rows) ? rows : [];
  }catch(err){
    console.error("Ошибка импорта (" + kindLabel + ")", err);
    alert(
      "Ошибка при импорте файла (" + kindLabel + ").\n\n" +
      "Для пилота: попробуйте другой экспорт (CSV) или пришлите файл Никите, чтобы мы допилили импорт."
    );
    return [];
  }
}

$id('txFile')?.addEventListener('change', async e=>{
  const f = e.target.files[0];
  if(!f) return;

  // Защищённый импорт выписки
  const newRows = await safeImportFile("выписка", importTxByFile, f);

  if(!newRows.length){
alert(
  "Не могу распознать файл.\n\n" +
  "Как это работает сейчас:\n" +
  "- если это CSV, приложение может спросить номера колонок: дата, сумма, описание, контрагент;\n" +
  "- если таких окон не было, файл вообще не читается как таблица.\n\n" +
  "Лучше всего сейчас работает простой CSV-экспорт из банка или Stripe.\n" +
  "Если это уже CSV и ошибка повторяется – пришлите файл команде OneTapDay, формат добавим в импорт."
);
    e.target.value = "";
    return;
  }

  const normalized = normalizeImportedTxRows(newRows);

  if(!normalized.length){
    alert("Не могу распознать файл. Проверьте формат или выберите колонки вручную.");
    e.target.value = "";
    return;
  }

   if(typeof confirmTxImport === "function"){
    const ok = confirmTxImport(normalized);
    if(!ok){
      alert("Импорт отменён.");
      e.target.value = "";
      return;
    }
  }

// P0: сначала привязываем импорт к счёту (чтобы сразу было понятно, откуда выписка)
if(typeof assignImportedTxToAccount === "function"){
  assignImportedTxToAccount(normalized);
}

// P0: merge без потери пользовательских правок + защита от повторного/частичного импорта
const existingTx = Array.isArray(tx) ? tx : [];

function _otdNormTxt(s){
  return String(s||'').trim().toLowerCase().replace(/\s+/g,' ').slice(0,120);
}
function _otdAmt(v){
  try{ return (typeof asNum==="function") ? asNum(v) : Number(String(v||'').replace(',','.')); }catch(_){ return 0; }
}
function _otdTxFp(r){
  const d = String(toISO(getVal(r,["Data księgowania","Data","date","Дата"])||"") || "").slice(0,10);
  const amt = _otdAmt(getVal(r,["Kwota","Kwота","amount","Kwota_raw"])||0);
  const cur = String(getVal(r,["Waluta","currency","Валюта"])||"PLN").toUpperCase().trim();
  const desc = _otdNormTxt(getVal(r,["Tytuł/Opis","Opis transakcji","Opis","description","Описание"])||"");
  const cp = _otdNormTxt(getVal(r,["Kontrahent","Counterparty","Контрагент"])||"");
  const bal = _otdNormTxt(getVal(r,["Saldo po operacji","Saldo po","balance"])||"");
  // intentionally NOT including account in fp (so re-assigning account doesn't break dedupe)
  return [d, Math.round(amt*100), cur, desc, cp, bal].join("|");
}
function _otdBankId(r){
  const raw = String(getVal(r,["ID transakcji","Transaction ID","Id transakcji","ID","id"])||"").trim();
  return raw || "";
}
function _otdEnrichKeep(existing, incoming){
  // fill only blanks; never overwrite user's category/status if already set
  if(!existing || !incoming) return;
  Object.keys(incoming).forEach(k=>{
    const v = incoming[k];
    if(v === undefined || v === null) return;
    const cur = existing[k];
    const empty = (cur === undefined || cur === null || cur === "");
    if(empty && v !== "") existing[k] = v;
  });
  // ensure account fields
  if(incoming._acc && !existing._acc) existing._acc = incoming._acc;
  if(incoming["ID konta"] && !existing["ID konta"]) existing["ID konta"] = incoming["ID konta"];
}

// Build multiset of existing fingerprints + fast bankId lookup
const bankIdSet = new Set();
const fpToIdxs = new Map();
existingTx.forEach((r, idx)=>{
  if(!r) return;
  const bid = _otdBankId(r);
  if(bid) bankIdSet.add(bid);
  const fp = _otdTxFp(r);
  if(!fpToIdxs.has(fp)) fpToIdxs.set(fp, []);
  fpToIdxs.get(fp).push(idx);
});
const fpUsed = new Map();

const toAdd = [];
normalized.forEach(r=>{
  if(!r) return;

  const bid = _otdBankId(r);
  if(bid){
    if(bankIdSet.has(bid)){
      // duplicate by bank transaction id -> enrich and skip adding
      const fp = _otdTxFp(r);
      const list = fpToIdxs.get(fp) || [];
      const used = fpUsed.get(fp) || 0;
      if(list.length && used < list.length){
        _otdEnrichKeep(existingTx[list[used]], r);
        fpUsed.set(fp, used+1);
      }
      return;
    }
    // IMPORTANT: dedupe внутри импорта по bankId (если файл содержит повтор)
    bankIdSet.add(bid);
  }

  const fp = _otdTxFp(r);
  const list = fpToIdxs.get(fp) || [];
  const used = fpUsed.get(fp) || 0;
  if(list.length && used < list.length){
    // duplicate by fingerprint -> enrich existing row and skip adding
    _otdEnrichKeep(existingTx[list[used]], r);
    fpUsed.set(fp, used+1);
    return;
  }

  toAdd.push(r);
  // NOTE: we intentionally do NOT "dedupe inside the same file" by fp, because identical operations may be real.
});

tx = existingTx.concat(toAdd);

if(typeof ensureTxIds === "function") ensureTxIds();

// Нормальные счета по картам из файла

  // Нормальные счета по картам из файла
  ensureCardAccountsFromTx();

  // Убиваем мусорные авто-счета вида tx-2025-...
  dropTxGeneratedAccounts();

  // ВАЖНО: НЕ вызываем inferAccounts()

  render();
  saveLocal();
  pushState();

  // Сбрасываем input, чтобы можно было залить тот же файл ещё раз
  e.target.value = "";
});



  $id('txImage')?.addEventListener('change', async (e)=>{ 
    const files = [...(e.target.files || [])];
    if(!files.length) return;
    try{
      if(window.OTD_DocVault?.addFiles){
        await window.OTD_DocVault.addFiles(files, { source:'image', type:'statement' });
        try{ await window.OTD_DocVault.refresh?.(null); }catch(_){}
        try{ window.appGoSection?.('docs'); }catch(_){}
        try{ toast?.('Dodano do Dokumentów (OCR wyłączony)'); }catch(_){}
      }else{
        alert('Dokumenty: moduł DocVault nie jest gotowy.');
      }
    }catch(err){
      console.warn('txImage->DocVault error', err);
      alert('Nie udało się dodać plików do Dokumentów.');
    }finally{
      try{ e.target.value = ''; }catch(_){}
    }
  });

  $$id('billFile')?.addEventListener('change', async e=>{
  const f = e.target.files[0];
  if(!f) return;

  // Защищённый импорт фактур
  const newRows = await safeImportFile("фактуры", importBillsByFile, f);

  if(!newRows.length){
    alert("Не могу распознать файл фактур. Проверьте формат или попробуйте CSV.");
    e.target.value = "";
    return;
  }

  const normalized = normalizeImportedBillsRows(newRows);

  if(!normalized.length){
    alert("Файл фактур распознан, но данные пустые.");
    e.target.value = "";
    return;
  }

  const ok = (typeof confirmBillsImport === "function")
    ? confirmBillsImport(normalized)
    : confirm(TT("dialogs.import_invoices_from_file", null, "Импортировать фактуры из файла?"));

  if(!ok){
    alert("Импорт отменён.");
    e.target.value = "";
    return;
  }

  // ВАЖНО: не стираем старые фактуры
  bills = Array.isArray(bills) ? bills : [];
  bills.push(...normalized);

  saveLocal();
  render();
  pushState();

  e.target.value = "";
});


  $id('billImage')?.addEventListener('change', async (e)=>{ 
    const files = [...(e.target.files || [])];
    if(!files.length) return;
    try{
      if(window.OTD_DocVault?.addFiles){
        await window.OTD_DocVault.addFiles(files, { source:'image', type:'invoice' });
        try{ await window.OTD_DocVault.refresh?.(null); }catch(_){}
        try{ window.appGoSection?.('docs'); }catch(_){}
        try{ toast?.('Dodano do Dokumentów (OCR wyłączony)'); }catch(_){}
      }else{
        alert('Dokumenty: moduł DocVault nie jest gotowy.');
      }
    }catch(err){
      console.warn('billImage->DocVault error', err);
      alert('Nie udało się dodać plików do Dokumentów.');
    }finally{
      try{ e.target.value = ''; }catch(_){}
    }
  });

  // Cash quick & ops
function quickCashReadAmount(){
  const el = $id('quickAmt');
  if (!el) return NaN;
  const raw = String(el.value || "").replace(",", ".");
  const n = (typeof asNum === "function") ? asNum(raw) : Number(raw);
  return n;
}

function quickCashAdd(kind){
  const amtEl  = $id('quickAmt');
  const noteEl = $id('quickNote');
  const catSel = $id('quickCashCat');
  if (!amtEl) return;

  const amount  = quickCashReadAmount();
  const comment = (noteEl?.value || "").trim();
  const cat     = catSel ? (catSel.value || "") : "";

  if (!amount || !isFinite(amount)) {
    alert("Сначала введите сумму");
    return;
  }

  if (typeof addKasa !== "function") {
    console.warn("addKasa is not a function");
    return;
  }

  addKasa(kind, amount, comment, 'manual', cat);

  amtEl.value = "";
  if (noteEl) noteEl.value = "";
}

function quickCashClose(){
  if (typeof kasaBalance !== "function") {
    console.warn("kasaBalance is not a function");
    return;
  }
  const current = kasaBalance().toFixed(2);
  const a = prompt('Итог в кассе (PLN):', current);
  if (a === null) return;
  const v = (typeof asNum === "function") ? asNum(a) : Number(String(a).replace(",", "."));
  if (isNaN(v)) {
    alert('Сумма некорректна');
    return;
  }
  addKasa('zamknięcie', v, 'close', 'manual');
}

// безопасно навешиваем обработчики при загрузке
$id('addIn')?.addEventListener('click', ()=> quickCashAdd('przyjęcie'));
$id('addOut')?.addEventListener('click', ()=> quickCashAdd('wydanie'));
$id('cashClose')?.addEventListener('click', ()=> quickCashClose());

// Save on unload (sendBeacon fallback)
  window.addEventListener('beforeunload', ()=>{
    if(!REMOTE_OK) return;
    try{
      const email=localStorage.getItem(USER_KEY)||"";
      if(!email) return;
      const body={
        email,
        tx: _otdGetJSON('tx_manual_import', []),
        bills: _otdGetJSON('bills_manual_import', []),
        kasa: _otdGetJSON('kasa', []),
        accMeta: _otdGetJSON('accMeta', {}),
        settings: stateKeys.reduce((m,k)=> (m[k]=localStorage.getItem(k), m), {})
      };
      const blob=new Blob([JSON.stringify(body)],{type:'application/json'});
      navigator.sendBeacon && navigator.sendBeacon(`${API_BASE}/state/save`, blob);
    }catch(e){}
  });
});// Speech
  const micBtn     = $id('micBtn');
  const micStatus  = $id('micStatus');
  const SR         = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!micBtn) {
    // нет кнопки — нечего делать
  } else if (!SR) {
    // браузер не умеет Web Speech API
    try { micBtn.style.display = 'none'; } catch(e){}
    if (micStatus) {
      micStatus.textContent = '🎙️ Голос недоступен в этом браузере';
    }
  } else {
    let rec = null;

    try {
      rec = new SR();
    } catch (e) {
      console.warn('Speech init error', e);
      if (micStatus) micStatus.textContent = '🎙️ Ошибка голоса: ' + e.message;
    }

    if (rec) {
      rec.continuous      = false;
      rec.interimResults  = false;
      rec.maxAlternatives = 1;
      rec.lang            = localStorage.getItem('speechLang') || 'pl-PL';

      // Слова для ПРИХОДА (IN)
      const CMD_IN = [
        // PL
        'przyjęcie','przyjecie','wpłata','wplata','depozyt','depozit',
        // EN
        'plus','income','cash in','received','receive','deposit',
        // RU / UKR
        'плюс','принять','пополнить','пополнил','приход','зачислить'
      ];

      // Слова для РАСХОДА (OUT)
      const CMD_OUT = [
        // PL
        'wyda','wydat','wypłat','wyplata','koszt',
        // EN
        'minus','pay out','payout','expense','cash out','payment',
        // RU / UKR
        'выда','выдать','выдал','расход','списать','минус','выточка'
      ];

      function detectType(text) {
        const t = text.toLowerCase();

        // Знак перед числом: "+200" / "-150"
        const signMatch = t.match(/([+\-−])\s*\d+[.,]?\d*/);
        if (signMatch) {
          const sign = signMatch[1];
          return (sign === '+' ? 'przyjęcie' : 'wydanie');
        }

        // Ключевые слова
        for (const w of CMD_IN)  { if (t.includes(w))  return 'przyjęcie'; }
        for (const w of CMD_OUT) { if (t.includes(w)) return 'wydanie'; }

        // По умолчанию считаем приход
        return 'przyjęcie';
      }

      rec.onstart = () => {
        micBtn.classList.add('on');
        if (micStatus) micStatus.textContent = '🎙️ Слушаю...';
      };

      rec.onerror = (e) => {
        console.warn('Speech error', e);
        if (micStatus) micStatus.textContent = '🎙️ Ошибка: ' + e.error;
      };

      rec.onend = () => {
        micBtn.classList.remove('on');
      };

      rec.onresult = (e) => {
        const text = (e.results[0][0].transcript || "").toLowerCase();

        if (micStatus) {
          micStatus.textContent = '🎙️ ' + text;
        }

        // Ищем число: "200", "200,50", "200.50", с валютой или без
        const numMatch = text.match(/(\d+[.,]?\d*)\s*(zł|pln|eur|usd|злот|евро|доллар)?/i);
        const num = numMatch ? numMatch[1] : null;

        const type = detectType(text);
        const note = text;

        if (!num) {
          if (micStatus) micStatus.textContent = '🎙️ сумма не найдена';
          return;
        }

        if (typeof addKasa !== 'function') {
          console.warn('addKasa is not a function, cannot write cash row');
          return;
        }

        const amount = (typeof asNum === "function")
          ? asNum(num)
          : Number(String(num).replace(',', '.'));

        if (!amount || !isFinite(amount)) {
          if (micStatus) micStatus.textContent = '🎙️ сумма не распознана';
          return;
        }

        addKasa(type, amount, note || 'voice', 'voice');
      };

      micBtn.addEventListener('click', () => {
        if (!rec) return;
        try {
          // иногда помогает сначала оборвать предыдущую сессию
          if (typeof rec.abort === 'function') rec.abort();
          rec.start();
        } catch (e) {
          console.warn('Speech start error', e);
          if (micStatus) micStatus.textContent = '🎙️ не смог запустить: ' + e.message;
        }
      });

      $id('speechLang')?.addEventListener('change', (e) => {
        const lang = e.target.value;
        if (rec) rec.lang = lang;
        try { localStorage.setItem('speechLang', lang); } catch(_) {}
      });
    }
  }

/* === Settings MVP bindings (Save/Clear) ===
   Keep this tiny and stable: settings screen is intentionally minimal now.
*/
(function(){
  // Make settings buttons unbreakable: render() may rebuild DOM, so we use delegated handlers.
  function doSaveSettingsLocal(){
    try{
      if(typeof saveLocal==='function') saveLocal();
      if(typeof inferAccounts==='function') inferAccounts();
      if(typeof render==='function') render();
    }catch(e){
      console.warn('applySettings error', e);
    }
  }

  function doClearHistoryLocal(){
    try{
      const ok = confirm(TT('dialogs.clear_local_history', null, 'Wyczyścić lokalną historię? (Transakcje, faktury, kasa)\n\nKategorie zostaną.'));
      if(!ok) return;

      try{ window.tx = []; }catch(e){}
      try{ window.bills = []; }catch(e){}
      try{ window.kasa = []; }catch(e){}
      try{ window.accMeta = {}; }catch(e){}

      const keysToRemove = [
        'tx_manual_import','bills_manual_import','kasa','accMeta',
        'txUrl','billUrl',
        'tx_last_import','bill_last_import','cash_last_import'
      ];
      keysToRemove.forEach(k=>{ try{ localStorage.removeItem(k); }catch(e){} });

      if(typeof inferAccounts==='function') try{ inferAccounts(); }catch(e){}
      if(typeof render==='function') try{ render(); }catch(e){}
      alert('Wyczyszczono lokalnie ✅');
    }catch(e){
      console.warn('clearAll error', e);
    }
  }

  // Expose for debugging / optional inline onclick.
  try{ window._otdSaveSettings = doSaveSettingsLocal; }catch(_){ }
  try{ window._otdClearHistoryLocal = doClearHistoryLocal; }catch(_){ }

  function delegatedSettingsHandler(e){
    const t = e.target;
    if(!t) return;

    const clearBtn = t.closest && t.closest('#clearAll');
    if(clearBtn){
      e.preventDefault();
      e.stopPropagation();
      doClearHistoryLocal();
      return;
    }

    const saveBtn = t.closest && t.closest('#applySettings');
    if(saveBtn){
      e.preventDefault();
      e.stopPropagation();
      doSaveSettingsLocal();
    }
  }

  // Capture phase to survive any stopPropagation in the app.
  document.addEventListener('click', delegatedSettingsHandler, true);
  document.addEventListener('pointerup', delegatedSettingsHandler, true);
})();

/* ===== Document Vault MVP (v2025-12-18) =====
   Цель: локальный "сейф" документов (IndexedDB) + запросы бухгалтера + пакеты ZIP (store-only).
   Ничего не ломаем: просто добавляем новый слой хранения и UI в разделе #docs.
*/
(function(){
  const VAULT = {};
  const DB_NAME = 'otd_docvault_v1';
  const DB_VER = 1;
  const storeNames = { docs:'docs', files:'files', requests:'requests', packages:'packages' };
  const nowIso = ()=> new Date().toISOString();

  const escapeHtml = (s)=>String(s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  function uuid(){
    try{ if (crypto && crypto.randomUUID) return crypto.randomUUID(); }catch(_){}
    return 'id-'+Math.random().toString(16).slice(2)+'-'+Date.now().toString(16);
  }

  function guessType(file){
    const n = (file?.name||'').toLowerCase();
    const m = (file?.type||'').toLowerCase();
    if (n.includes('mt940') || n.includes('statement') || n.includes('wyciag') || n.endsWith('.csv') || n.endsWith('.ofx') || n.endsWith('.qif') || n.endsWith('.sta') || n.endsWith('.xml') || n.endsWith('.json')) return 'statement';
    if (n.includes('fakt') || n.includes('invoice')) return 'invoice';
    if (n.includes('paragon') || n.includes('receipt')) return 'receipt';
    if (n.includes('umowa') || n.includes('contract')) return 'contract';
    if (n.includes('spis') || n.includes('inventory') || n.includes('inwent')) return 'inventory';
    if (n.includes('zus') || n.includes('urzad') || n.includes('us ') || n.includes('letter') || n.includes('pismo')) return 'letter';
    if (m.startsWith('image/')) return 'receipt';
    return 'other';
  }

  function guessPeriod(file){
    const n = (file?.name||'');
    const m1 = n.match(/(20\d{2})[-_. ]?(0[1-9]|1[0-2])/);
    if (m1) return `${m1[1]}-${m1[2]}`;
    return '';
  }

  async function sha256Hex(blob){
    try{
      const max = 5*1024*1024; // не хешируем гигантов
      if (!blob || blob.size > max) return '';
      const buf = await blob.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buf);
      const arr = Array.from(new Uint8Array(digest));
      return arr.map(b=>b.toString(16).padStart(2,'0')).join('');
    }catch(e){ return ''; }
  }

  function openDb(){
    return new Promise((resolve,reject)=>{
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = ()=>{
        const db = req.result;
        if(!db.objectStoreNames.contains(storeNames.docs)) db.createObjectStore(storeNames.docs, { keyPath:'id' });
        if(!db.objectStoreNames.contains(storeNames.files)) db.createObjectStore(storeNames.files, { keyPath:'id' });
        if(!db.objectStoreNames.contains(storeNames.requests)) db.createObjectStore(storeNames.requests, { keyPath:'id' });
        if(!db.objectStoreNames.contains(storeNames.packages)) db.createObjectStore(storeNames.packages, { keyPath:'id' });
      };
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> reject(req.error);
    });
  }

  function tx(db, stores, mode='readonly'){ return db.transaction(stores, mode); }

  async function put(store, value){
    const db = await openDb();
    return new Promise((resolve,reject)=>{
      const t = tx(db, [store], 'readwrite');
      t.oncomplete = ()=> resolve(true);
      t.onerror = ()=> reject(t.error);
      t.objectStore(store).put(value);
    });
  }

  async function get(store, key){
    const db = await openDb();
    return new Promise((resolve,reject)=>{
      const t = tx(db, [store], 'readonly');
      const req = t.objectStore(store).get(key);
      req.onsuccess = ()=> resolve(req.result || null);
      req.onerror = ()=> reject(req.error);
    });
  }

  async function del(store, key){
    const db = await openDb();
    return new Promise((resolve,reject)=>{
      const t = tx(db, [store], 'readwrite');
      const req = t.objectStore(store).delete(key);
      req.onsuccess = ()=> resolve(true);
      req.onerror = ()=> reject(req.error);
    });
  }

  async function getAll(store){
    const db = await openDb();
    return new Promise((resolve,reject)=>{
      const t = tx(db, [store], 'readonly');
      const req = t.objectStore(store).getAll();
      req.onsuccess = ()=> resolve(req.result || []);
      req.onerror = ()=> reject(req.error);
    });
  }

  function auditAppend(doc, action, extra){
    const item = { ts: nowIso(), action, ...(extra||{}) };
    doc.audit = Array.isArray(doc.audit) ? doc.audit : [];
    doc.audit.unshift(item);
    if (doc.audit.length > 50) doc.audit = doc.audit.slice(0,50);
  }

  async function addFiles(files, opts={}){
    const list = Array.from(files || []);
    for(const file of list){
      const id = uuid();
      const type = opts.type || guessType(file);
      const period = (opts.period || guessPeriod(file) || '').trim();
      const hash = await sha256Hex(file);
      const meta = {
        id,
        name: file?.name || `file-${id}`,
        size: file?.size || 0,
        mime: file?.type || '',
        created_at: nowIso(),
        source: opts.source || 'upload',
        type,
        period,
        counterparty: (opts.counterparty || '').trim(),
        for_accountant: !!opts.for_accountant,
        status: 'new',
        deleted_at: '',
        content_hash: hash,
        links: [],
        audit: []
      };
      auditAppend(meta, 'created', { source: meta.source, type: meta.type });
      await put(storeNames.docs, meta);
      await put(storeNames.files, { id, blob: file });
    }
  }

  function fmtBytes(n){
    if(!Number.isFinite(n) || n<=0) return '0 B';
    const units = ['B','KB','MB','GB'];
    let i=0; let v=n;
    while(v>=1024 && i<units.length-1){ v/=1024; i++; }
    return `${v.toFixed(i===0?0:1)} ${units[i]}`;
  }

  function typeLabel(t){
    const map = {
      statement:'Wyciąg bankowy',
      invoice:'Faktura',
      receipt:'Paragon / rachunek',
      contract:'Umowa',
      inventory:'Inwentaryzacja',
      letter:'Pismo / urząd',
      handover:'Protokół przekazania',
      explain:'Wyjaśnienie przelewu',
      other:'Inne'
    };
    return map[t] || 'Inne';
  }

  function sanitizeName(name){
    return String(name||'file').replace(/[\/\\:*?"<>|]/g,'_').slice(0,160);
  }

  // --- ZIP writer (STORE, без сжатия, зато без библиотек) ---
  const CRC_TABLE = (function(){
    let c; const table = new Uint32Array(256);
    for(let n=0;n<256;n++){
      c = n;
      for(let k=0;k<8;k++) c = (c & 1) ? (0xEDB88320 ^ (c>>>1)) : (c>>>1);
      table[n]=c>>>0;
    }
    return table;
  })();

  function crc32(buf){
    let crc = 0xFFFFFFFF;
    for(let i=0;i<buf.length;i++){
      crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function dosTime(date){
    const d = date instanceof Date ? date : new Date();
    const sec = Math.floor(d.getSeconds()/2);
    const min = d.getMinutes();
    const hour = d.getHours();
    return (hour<<11) | (min<<5) | sec;
  }
  function dosDate(date){
    const d = date instanceof Date ? date : new Date();
    const day = d.getDate();
    const month = d.getMonth()+1;
    const year = d.getFullYear();
    return ((year-1980)<<9) | (month<<5) | day;
  }
  const u16 = (n)=> [n & 0xFF, (n>>>8)&0xFF];
  const u32 = (n)=> [n & 0xFF, (n>>>8)&0xFF, (n>>>16)&0xFF, (n>>>24)&0xFF];

  async function makeZip(fileEntries){
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const dt = new Date();

    for(const ent of fileEntries){
      const name = sanitizeName(ent.name);
      const nameBytes = new TextEncoder().encode(name);
      const dataBuf = new Uint8Array(await ent.blob.arrayBuffer());
      const crc = crc32(dataBuf);
      const mtime = ent.mtime ? new Date(ent.mtime) : dt;
      const modTime = dosTime(mtime);
      const modDate = dosDate(mtime);

      const localHeader = new Uint8Array([
        ...u32(0x04034b50),
        ...u16(20),
        ...u16(0),
        ...u16(0),
        ...u16(modTime),
        ...u16(modDate),
        ...u32(crc),
        ...u32(dataBuf.length),
        ...u32(dataBuf.length),
        ...u16(nameBytes.length),
        ...u16(0)
      ]);
      localParts.push(localHeader, nameBytes, dataBuf);

      const centralHeader = new Uint8Array([
        ...u32(0x02014b50),
        ...u16(20),
        ...u16(20),
        ...u16(0),
        ...u16(0),
        ...u16(modTime),
        ...u16(modDate),
        ...u32(crc),
        ...u32(dataBuf.length),
        ...u32(dataBuf.length),
        ...u16(nameBytes.length),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(offset)
      ]);
      centralParts.push(centralHeader, nameBytes);

      offset += localHeader.length + nameBytes.length + dataBuf.length;
    }

    const centralStart = offset;
    let centralSize = 0;
    for(const part of centralParts) centralSize += part.length;

    const end = new Uint8Array([
      ...u32(0x06054b50),
      ...u16(0), ...u16(0),
      ...u16(fileEntries.length),
      ...u16(fileEntries.length),
      ...u32(centralSize),
      ...u32(centralStart),
      ...u16(0)
    ]);

    return new Blob([...localParts, ...centralParts, end], {type:'application/zip'});
  }

  function downloadBlob(blob, filename){
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 700);
  }

  
  // UI state
  let els = {};
  let state = { docs:[], sel:null, requests:[], packages:[], view:'all', prevView:'all' };

  const q = (id)=>document.getElementById(id);

  function setBtnActive(activeBtn, btns){
    (btns||[]).forEach(b=>{
      if(!b) return;
      b.classList.remove('secondary');
      b.classList.add('ghost');
    });
    if(activeBtn){
      activeBtn.classList.remove('ghost');
      activeBtn.classList.add('secondary');
    }
  }

  function setView(view){
    state.view = view || 'all';

    // Panels
    if(els.panelDocs) els.panelDocs.style.display = (state.view==='all' || state.view==='accountant' || state.view==='trash') ? '' : 'none';
    if(els.panelReq)  els.panelReq.style.display  = (state.view==='requests') ? '' : 'none';
    if(els.tplPanel)  els.tplPanel.style.display  = (state.view==='templates') ? '' : 'none';

    // Tabs
    const tabSet = [els.tabAll, els.tabAcc, els.tabReq, els.tabTrash];
    if(state.view==='all') setBtnActive(els.tabAll, tabSet);
    else if(state.view==='accountant') setBtnActive(els.tabAcc, tabSet);
    else if(state.view==='requests') setBtnActive(els.tabReq, tabSet);
    else if(state.view==='trash') setBtnActive(els.tabTrash, tabSet);
    else setBtnActive(null, tabSet);

    // Highlight "Utwórz dokument" when templates are open
    if(els.createDocBtn){
      if(state.view==='templates'){
        els.createDocBtn.classList.remove('ghost');
        els.createDocBtn.classList.add('secondary');
      }else{
        els.createDocBtn.classList.add('ghost');
        els.createDocBtn.classList.remove('secondary');
      }
    }

    // Details only on docs views
    if(state.view!=='all' && state.view!=='accountant' && state.view!=='trash'){
      closeModal();
      if(els.det) els.det.style.display='none';
      state.sel = null;
    }

    if(state.view==='templates'){
      renderTemplateChooser();
    }

    renderList();
    renderRequests();
  }

  function bindUI(){
    els.addBtn = q('vaultAddBtn');
    els.createDocBtn = q('vaultCreateDocBtn');
    els.shareBtn = q('vaultShareBtn');
    els.sharePeriod = q('vaultSharePeriod');
    els.overlay = q('vaultOverlay');
    els.detClose = q('vaultDetCloseBtn');

    els.input = q('vaultInput');
    els.search = q('vaultSearch');
    els.list = q('vaultList');
    els.stats = q('vaultStats');

    els.panelDocs = q('vaultPanelDocs');
    els.panelReq  = q('vaultPanelReq');
    els.tplPanel  = q('vaultTemplatesPanel');
    els.tplHost   = q('tplFormHost');

    els.tabAll = q('vaultTabAll');
    els.tabAcc = q('vaultTabAcc');
    els.tabReq = q('vaultTabReq');
    els.tabTrash = q('vaultTabTrash');

    // Details
    els.det = q('vaultDetails');
    els.detType = q('vaultDetType');
    els.detName = q('vaultDetName');
    els.detMeta = q('vaultDetMeta');
    els.editType = q('vaultEditType');
    els.editPeriod = q('vaultEditPeriod');
    els.editCounterparty = q('vaultEditCounterparty');
    els.editForAcc = q('vaultEditForAcc');
    els.saveMeta = q('vaultSaveMetaBtn');
    els.download = q('vaultDownloadBtn');
    els.preview = q('vaultPreviewBtn');
    els.trash = q('vaultToTrashBtn');
    els.restore = q('vaultRestoreBtn');
    els.audit = q('vaultAudit');

    // Requests
    els.reqList = q('vaultReqList');
    els.newReqBtn = q('vaultNewReqBtn');

    // Templates
    els.tplHandoverBtn = q('tplHandoverBtn');
    els.tplExplainBtn = q('tplExplainBtn');
    els.tplCloseBtn = q('tplCloseBtn');

    if(!els.addBtn || !els.input || !els.list) return false;

    // Delegated list events (bind once)
    if(!state._listBound){
      state._listBound = true;
      els.list.addEventListener('click', onListClick);
      els.list.addEventListener('change', onListChange);
    }

    // Add doc
    els.addBtn.addEventListener('click', ()=> els.input.click());
    els.input.addEventListener('change', async ()=>{
      if(!els.input.files || !els.input.files.length) return;
      await addFiles(els.input.files, {source:'upload'});
      els.input.value='';
      await refresh();
      setView('all');
    });

    // Search
    els.search?.addEventListener('input', ()=> renderList());
    els.sharePeriod?.addEventListener('input', ()=> renderList());

    // Modal close
    els.overlay?.addEventListener('click', ()=> closeModal());
    els.detClose?.addEventListener('click', ()=> closeModal());

    // Tabs
    els.tabAll?.addEventListener('click', ()=> setView('all'));
    els.tabAcc?.addEventListener('click', ()=> setView('accountant'));
    els.tabReq?.addEventListener('click', ()=> setView('requests'));
    els.tabTrash?.addEventListener('click', ()=> setView('trash'));

    // Create doc (templates)
    els.createDocBtn?.addEventListener('click', ()=>{
      // Inline templates view (no blur/no modal)
      state.prevView = state.view || 'all';
      setView('templates');
    });
    els.tplCloseBtn?.addEventListener('click', ()=>{ setView(state.prevView || 'all'); });

    // Templates buttons
    els.tplHandoverBtn?.addEventListener('click', ()=> renderTemplateHandover());
    els.tplExplainBtn?.addEventListener('click', ()=> renderTemplateExplain());

    // Share to accountant (ZIP)
    els.shareBtn?.addEventListener('click', async ()=>{
      const period = (els.sharePeriod?.value || '').trim();
      await createAccountantPackage(period);
    });

    // Save meta
    els.saveMeta?.addEventListener('click', async ()=>{
      const doc = state.sel;
      if(!doc) return;
      doc.type = els.editType?.value || doc.type;
      doc.period = (els.editPeriod?.value || '').trim();
      doc.counterparty = (els.editCounterparty?.value || '').trim();
      doc.for_accountant = !!(els.editForAcc?.checked);
      auditAppend(doc, 'meta_saved', {type:doc.type, period:doc.period, counterparty:doc.counterparty, for_accountant:doc.for_accountant});
      await put(storeNames.docs, doc);
      await refresh(doc.id);
    });

    // Download
    els.download?.addEventListener('click', async ()=>{
      if(!state.sel) return;
      const f = await get(storeNames.files, state.sel.id);
      if(!f || !f.blob) return alert('Brak pliku w magazynie.');
      downloadBlob(f.blob, sanitizeName(state.sel.name || 'document'));
    });

els.preview?.addEventListener('click', async ()=>{
      if(!state.sel) return;
      await previewDoc(state.sel.id);
    });

    // Trash / restore
    els.trash?.addEventListener('click', async ()=>{
      if(!state.sel) return;
      const doc = state.sel;
      if(doc.deleted_at) return;
      doc.deleted_at = nowIso();
      auditAppend(doc, 'trashed', {});
      await put(storeNames.docs, doc);
      await refresh(null);
    });
    els.restore?.addEventListener('click', async ()=>{
      if(!state.sel) return;
      const doc = state.sel;
      if(!doc.deleted_at) return;
      doc.deleted_at = '';
      auditAppend(doc, 'restored', {});
      await put(storeNames.docs, doc);
      await refresh(doc.id);
    });

    // Requests: new request
    els.newReqBtn?.addEventListener('click', async ()=>{
      const title = prompt('Co prosi księgowy? (np. „Wyciąg 2025-11 + 3 faktury”)','');
      if(!title || !title.trim()) return;
      const req = {
        id: uuid(),
        created_at: nowIso(),
        title: title.trim(),
        items: [{ id: uuid(), text: title.trim(), done:false, doc_id:'' }]
      };
      await put(storeNames.requests, req);
      await refreshRequests();
      setView('requests');
    });

    // Default view
    setView('all');

    return true;
  }

  function visibleDocs(){
    const docs = Array.isArray(state.docs)? state.docs : [];
    const s = (els.search?.value || '').trim().toLowerCase();
    let list = docs.slice();

    if(state.view==='trash'){
      list = list.filter(d=>!!d.deleted_at);
    } else {
      list = list.filter(d=>!d.deleted_at);
    }

    if(state.view==='accountant'){
      list = list.filter(d=>d.for_accountant);
    }

if(s){
      list = list.filter(d=>{
        const hay = `${d.name||''} ${d.type||''} ${d.period||''} ${d.counterparty||''}`.toLowerCase();
        return hay.includes(s);
      });
    }

    // sort: non-deleted first, then by created desc
    list.sort((a,b)=>{
      const ad = a.deleted_at?1:0;
      const bd = b.deleted_at?1:0;
      if(ad!==bd) return ad-bd;
      return (b.created_at||'').localeCompare(a.created_at||'');
    });
    return list;
  }

  async function previewDoc(docId){
    const f = await get(storeNames.files, docId);
    if(!f || !f.blob) return alert('Brak pliku w magazynie.');
    const url = URL.createObjectURL(f.blob);
    window.open(url, '_blank');
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
  }

  function showOverlay(){
    if(els.overlay) els.overlay.style.display = 'block';
  }
  function hideOverlay(){
    if(els.overlay) els.overlay.style.display = 'none';
  }

  function openModal(kind){
    state.modal = kind || null;
    if(kind==='details'){
      showOverlay();
      if(els.det) els.det.style.display = '';
    }
  }

  function closeModal(){
    if(els.det) els.det.style.display = 'none';
    hideOverlay();
    state.modal = null;
  }



  
  function renderList(){
    if(!els.list) return;

    const list = visibleDocs();

    if(els.stats){
      const total = (state.docs||[]).filter(d=>!d.deleted_at).length;
      const accAll = (state.docs||[]).filter(d=>!d.deleted_at && d.for_accountant).length;
      const trash = (state.docs||[]).filter(d=>!!d.deleted_at).length;
      els.stats.textContent = `Dokumenty: ${total} · Do księgowego: ${accAll} · Kosz: ${trash}`;
    }

    const period = (els.sharePeriod?.value || '').trim();
    const packCount = (state.docs||[]).filter(d=>!d.deleted_at && d.for_accountant && (!period || (d.period||'')===period)).length;
    if(els.shareBtn) els.shareBtn.textContent = `Przekaż księgowemu (${packCount})`;

    if(!list.length){
      const msg = state.view==='accountant'
        ? 'Brak dokumentów oznaczonych „Do wysłania”. Zaznacz checkbox przy dokumencie.'
        : (state.view==='trash'
            ? 'Kosz jest pusty.'
            : (state.view==='requests'
                ? 'Brak zapytań od księgowego.'
                : 'Brak dokumentów. Dodaj pliki (PDF/zdjęcia/CSV/XLSX/MT940).'));
      els.list.innerHTML = `<div class="vaultEmpty">${escapeHtml(msg)}</div>`;
      return;
    }

    els.list.innerHTML = list.map(d=>{
      const subParts = [];
      if(d.period) subParts.push(d.period);
      if(d.counterparty) subParts.push(d.counterparty);
      const sub = subParts.join(' · ');
      const isTrash = !!d.deleted_at;

      return `
        <div class="vaultItem ${d.id===state.sel?.id?'active':''}" data-doc="${d.id}">
          <div class="vaultInfo">
            <div class="vaultName">${escapeHtml(d.name||'—')}</div>
            <div class="vaultSub">${escapeHtml(typeLabel(d.type))}${sub?` · ${escapeHtml(sub)}`:''}</div>
          </div>
          <div class="vaultActions">
            <div class="vaultQuick">
              ${!isTrash
                ? `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-action="foracc" data-id="${d.id}" ${d.for_accountant?'checked':''}/> <span class="muted small">Do wysłania</span></label>`
                : `<span class="pill" style="border-color:rgba(239,68,68,.25);color:#fecaca">W koszu</span>`}
              ${!isTrash
                ? `<button class="btn link" data-action="trash" data-id="${d.id}" type="button">Do kosza</button>`
                : `<button class="btn link" data-action="restore" data-id="${d.id}" type="button">Przywróć</button>`}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Delegated list handlers (more reliable than re-binding per render)
  async function onListClick(e){
    const t = e.target;

    // Ignore clicks on checkbox/label so it doesn't open details
    if(t?.matches('input[data-action="foracc"]') || (t?.closest('label') && t.closest('label').querySelector('input[data-action="foracc"]'))){
      return;
    }

    const actBtn = t?.closest('[data-action]');
    if(actBtn){
      const action = actBtn.getAttribute('data-action');
      const id = actBtn.getAttribute('data-id');

      if(action==='trash'){
        e.preventDefault(); e.stopPropagation();
        await toTrash(id);
        if(state.sel && state.sel.id===id){ closeModal(); state.sel=null; }
        await refresh();
        return;
      }
      if(action==='restore'){
        e.preventDefault(); e.stopPropagation();
        await restoreDoc(id);
        if(state.sel && state.sel.id===id){ closeModal(); state.sel=null; }
        await refresh();
        return;
      }
    }

    const item = t?.closest('.vaultItem');
    if(item){
      const id = item.getAttribute('data-doc');
      if(id) selectDoc(id);
    }
  }

  async function onListChange(e){
    const t = e.target;
    if(!t?.matches('input[data-action="foracc"]')) return;
    const id = t.getAttribute('data-id');
    const doc = (state.docs||[]).find(d=>d.id===id);
    if(!doc) return;
    doc.for_accountant = !!t.checked;
    auditAppend(doc, 'for_accountant_set', { for_accountant: doc.for_accountant });
    await put(storeNames.docs, doc);
    renderList();
  }



  function renderDetails(){
    if(!els.det) return;
    const doc = state.sel;
    if(!doc){
      els.det.style.display='none';
      return;
    }
    els.det.style.display='';
    if(els.detType) els.detType.textContent = typeLabel(doc.type);
    if(els.detName) els.detName.textContent = doc.name || '—';

    const metaBits = [];
    if(doc.size) metaBits.push(fmtBytes(doc.size));
    if(doc.mime) metaBits.push(doc.mime);
    if(doc.created_at) metaBits.push(doc.created_at.slice(0,10));
    if(doc.for_accountant) metaBits.push('Dla księgowego');
    if(doc.deleted_at) metaBits.push('W koszu');
    if(els.detMeta) els.detMeta.textContent = metaBits.join(' · ') || '—';

    if(els.editType) els.editType.value = doc.type || 'other';
    if(els.editPeriod) els.editPeriod.value = doc.period || '';
    if(els.editCounterparty) els.editCounterparty.value = doc.counterparty || '';
    if(els.editForAcc) els.editForAcc.checked = !!doc.for_accountant;

    if(els.restore) els.restore.style.display = doc.deleted_at ? '' : 'none';
    if(els.trash) els.trash.style.display = doc.deleted_at ? 'none' : '';

    // Audit
    if(els.audit){
      const lines = (doc.audit||[]).slice().reverse().map(a=>{
        const t = a.at ? a.at : '';
        const ev = a.ev || '';
        const data = a.data ? JSON.stringify(a.data) : '';
        return `${t} — ${ev}${data?` — ${data}`:''}`;
      });
      els.audit.textContent = lines.length ? lines.join('\n') : '—';
    }
  }

  async function selectDoc(id){
    const doc = (state.docs||[]).find(d=>d.id===id);
    state.sel = doc || null;
    renderList();
    renderDetails();
    if(state.sel) openModal('details'); else closeModal();
  }

  async function refresh(selectId=null){
    try{
      state.docs = await getAll(storeNames.docs);
      // keep selection
      if(selectId){
        state.sel = state.docs.find(d=>d.id===selectId) || null;
      } else if(state.sel){
        state.sel = state.docs.find(d=>d.id===state.sel.id) || null;
      }
      renderList();
      renderDetails();
      await refreshRequests();
    }catch(e){
      console.warn('Vault refresh error', e);
      if(els.list) els.list.innerHTML = `<div class="vaultEmpty">Błąd Vault: ${escapeHtml(e?.message || String(e))}</div>`;
    }
  }

  async function refreshRequests(){
    try{
      state.requests = await getAll(storeNames.requests);
      renderRequests();
    }catch(e){
      console.warn('Vault req refresh error', e);
    }
  }

  function renderRequests(){
    if(!els.reqList) return;
    if(state.view!=='requests') return;

    const reqs = (state.requests||[]).sort((a,b)=> (b.created_at||'').localeCompare(a.created_at||''));
    if(!reqs.length){
      els.reqList.innerHTML = `<div class="vaultEmpty">Brak próśb. Dodaj nowe, gdy księgowy prosi o dokumenty.</div>`;
      return;
    }

    const docs = (state.docs||[]).filter(d=>!d.deleted_at);
    const options = ['<option value="">— wybierz dokument —</option>'].concat(
      docs.map(d=>`<option value="${d.id}">${escapeHtml(d.name)} (${typeLabel(d.type)} ${escapeHtml(d.period||'')})</option>`)
    ).join('');

    els.reqList.innerHTML = reqs.map(r=>{
      const itemsHtml = (r.items||[]).map(it=>{
        return `
          <div class="card" style="margin-top:8px;padding:10px">
            <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">
              <label class="muted small" style="display:flex;align-items:center;gap:6px">
                <input type="checkbox" data-req="${r.id}" data-item="${it.id}" ${it.done?'checked':''}/>
                Zrobione
              </label>
              <div style="font-weight:700;flex:1">${escapeHtml(it.text||'')}</div>
            </div>
            <div class="row" style="margin-top:8px;gap:8px;align-items:center;flex-wrap:wrap">
              <select data-req="${r.id}" data-item-doc="${it.id}" style="min-width:260px">
                ${options}
              </select>
              <button class="btn ghost small" data-add-item="${r.id}" type="button">+ punkt</button>
              <button class="btn ghost small" data-del-req="${r.id}" type="button">Usuń</button>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="card" style="margin-top:10px">
          <div style="font-weight:800">${escapeHtml(r.title||'Prośba')}</div>
          ${itemsHtml}
        </div>
      `;
    }).join('');

    // restore selected values
    reqs.forEach(r=>{
      (r.items||[]).forEach(it=>{
        const sel = els.reqList.querySelector(`select[data-req="${r.id}"][data-item-doc="${it.id}"]`);
        if(sel && it.doc_id) sel.value = it.doc_id;
      });
    });

    // handlers
    els.reqList.querySelectorAll('input[type=checkbox][data-req]').forEach(cb=>{
      cb.addEventListener('change', async ()=>{
        const rid = cb.getAttribute('data-req');
        const itemId = cb.getAttribute('data-item');
        const req = reqs.find(x=>x.id===rid);
        if(!req) return;
        const it = (req.items||[]).find(x=>x.id===itemId);
        if(!it) return;
        it.done = !!cb.checked;
        await put(storeNames.requests, req);
        await refreshRequests();
      });
    });

    els.reqList.querySelectorAll('select[data-req][data-item-doc]').forEach(sel=>{
      sel.addEventListener('change', async ()=>{
        const rid = sel.getAttribute('data-req');
        const itemId = sel.getAttribute('data-item-doc');
        const req = reqs.find(x=>x.id===rid);
        if(!req) return;
        const it = (req.items||[]).find(x=>x.id===itemId);
        if(!it) return;
        it.doc_id = sel.value || '';
        await put(storeNames.requests, req);
        await refreshRequests();
      });
    });

    els.reqList.querySelectorAll('[data-add-item]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const rid = btn.getAttribute('data-add-item');
        const req = reqs.find(x=>x.id===rid);
        if(!req) return;
        const text = prompt('Nowy punkt (co jeszcze trzeba dostarczyć?)','');
        if(!text || !text.trim()) return;
        req.items = req.items || [];
        req.items.push({ id: uuid(), text: text.trim(), done:false, doc_id:'' });
        await put(storeNames.requests, req);
        await refreshRequests();
      });
    });

    els.reqList.querySelectorAll('[data-del-req]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const rid = btn.getAttribute('data-del-req');
        if(!confirm(TT('dialogs.delete_request', null, 'Usunąć prośbę?'))) return;
        await del(storeNames.requests, rid);
        await refreshRequests();
      });
    });
  }

  async function createAccountantPackage(period){
    const docs = (state.docs||[]).filter(d=>!d.deleted_at && d.for_accountant);
    const chosen = period ? docs.filter(d=>String(d.period||'')===period) : docs;

    if(!chosen.length){
      alert('Brak dokumentów do przekazania.\nZaznacz „Dla księgowego” w szczegółach dokumentu (i ustaw Okres, jeśli filtrujesz).');
      return;
    }

    const pkgId = uuid();
    const manifest = {
      package_id: pkgId,
      created_at: nowIso(),
      period: period || '',
      mode: 'accountant',
      count: chosen.length,
      docs: chosen.map(d=>({
        id:d.id,
        name:d.name,
        type:d.type,
        period:d.period||'',
        counterparty:d.counterparty||'',
        mime:d.mime||'',
        size:d.size||0,
        content_hash:d.content_hash||''
      }))
    };

    const entries = [];
    // manifest.json
    entries.push({ name: 'manifest.json', blob: new Blob([JSON.stringify(manifest,null,2)], {type:'application/json'}) });

    for(const d of chosen){
      const f = await get(storeNames.files, d.id);
      if(f && f.blob){
        entries.push({ name: sanitizeName(d.name), blob: f.blob });
      }
    }

    const zipBlob = makeZip(entries);
    const safePeriod = period ? period.replace(/[^0-9\-]/g,'') : 'all';
    downloadBlob(zipBlob, `OneTapDay_DlaKsiegowego_${safePeriod}.zip`);

    // optional: audit
    for(const d of chosen){
      const doc = (state.docs||[]).find(x=>x.id===d.id);
      if(doc){
        auditAppend(doc, 'shared_with_accountant', {period: period || ''});
        await put(storeNames.docs, doc);
      }
    }
    await refresh(state.sel?.id || null);
  }

  function renderTemplateChooser(){
    if(!els.tplHost) return;
    els.tplHost.innerHTML = `
      <div class="vaultEmpty">Wybierz szablon powyżej. Wygenerowany plik pojawi się w „Moje dokumenty” i będzie oznaczony jako „Dla księgowego”.</div>
    `;
  }

  function renderTemplateHandover(){
    if(!els.tplHost) return;
    const defaultPeriod = (new Date()).toISOString().slice(0,7);
    els.tplHost.innerHTML = `
      <div class="card" style="padding:12px">
        <div style="font-weight:800">Protokół przekazania dokumentów</div>
        <div class="muted small" style="margin-top:6px">Dowód „przekazałem”. Przydatne, kiedy ktoś udaje, że nic nie dostał.</div>

        <div class="row" style="margin-top:10px;gap:8px;align-items:flex-end;flex-wrap:wrap">
          <label class="muted small">Okres (YYYY-MM)
            <input id="tplHandPeriod" type="text" placeholder="np. 2025-11" value="${defaultPeriod}"/>
          </label>
          <label class="muted small">Nazwa firmy
            <input id="tplHandCompany" type="text" placeholder="Twoja firma"/>
          </label>
          <label class="muted small">Księgowy (opc.)
            <input id="tplHandAcc" type="text" placeholder="Imię / biuro rachunkowe"/>
          </label>
        </div>

        <div class="muted small" style="margin-top:10px">Dokumenty do dołączenia:</div>
        <div id="tplHandDocs" style="margin-top:8px"></div>

        <label class="muted small" style="margin-top:10px;display:block">Komentarz (opc.)
          <input id="tplHandNote" type="text" placeholder="np. brak faktury od X, doślę jutro"/>
        </label>

        <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
          <button class="btn" id="tplHandGen" type="button">Wygeneruj</button>
        </div>
      </div>
    `;

    // Render doc checkboxes
    const docsHost = q('tplHandDocs');
    const period = q('tplHandPeriod')?.value?.trim() || '';
    const docs = (state.docs||[]).filter(d=>!d.deleted_at && d.for_accountant && (!period || d.period===period));
    docsHost.innerHTML = docs.length ? docs.map(d=>`
      <label class="muted small" style="display:flex;gap:8px;align-items:center;margin-top:6px">
        <input type="checkbox" data-docchk="${d.id}" checked/>
        <span>${escapeHtml(d.name)} <span class="muted">(${escapeHtml(typeLabel(d.type))} ${escapeHtml(d.period||'')})</span></span>
      </label>
    `).join('') : `<div class="vaultEmpty">Brak dokumentów oznaczonych „Dla księgowego” dla tego okresu. Oznacz dokumenty i wróć.</div>`;

    // Update list when period changes
    q('tplHandPeriod')?.addEventListener('input', ()=> renderTemplateHandover());

    q('tplHandGen')?.addEventListener('click', async ()=>{
      const periodVal = (q('tplHandPeriod')?.value || '').trim();
      const company = (q('tplHandCompany')?.value || '').trim();
      const accountant = (q('tplHandAcc')?.value || '').trim();
      const note = (q('tplHandNote')?.value || '').trim();

      const checkedIds = Array.from(els.tplHost.querySelectorAll('input[type=checkbox][data-docchk]'))
        .filter(x=>x.checked).map(x=>x.getAttribute('data-docchk'));

      if(!checkedIds.length){
        alert('Zaznacz przynajmniej jeden dokument.');
        return;
      }
      const chosen = (state.docs||[]).filter(d=>checkedIds.includes(d.id));

      const rows = chosen.map((d, i)=>`
        <tr>
          <td style="padding:6px;border:1px solid #333">${i+1}</td>
          <td style="padding:6px;border:1px solid #333">${escapeHtml(d.name||'')}</td>
          <td style="padding:6px;border:1px solid #333">${escapeHtml(typeLabel(d.type))}</td>
          <td style="padding:6px;border:1px solid #333">${escapeHtml(d.period||'')}</td>
        </tr>
      `).join('');

      const html = `
<!doctype html><html><head><meta charset="utf-8"/>
<title>Protokół przekazania</title>
<style>
  body{font-family:Arial, sans-serif; padding:24px; color:#111;}
  h1{font-size:18px;margin:0 0 8px 0;}
  .muted{color:#555;font-size:12px;}
  table{border-collapse:collapse; width:100%; margin-top:12px; font-size:12px;}
  .sig{margin-top:18px; display:flex; gap:40px;}
  .sig div{flex:1;}
  .line{border-top:1px solid #333; margin-top:28px;}
</style>
</head><body>
<h1>Protokół przekazania dokumentów</h1>
<div class="muted">Okres: ${escapeHtml(periodVal||'—')}</div>
<div class="muted">Firma: ${escapeHtml(company||'—')}</div>
<div class="muted">Księgowy: ${escapeHtml(accountant||'—')}</div>

<table>
  <thead>
    <tr>
      <th style="padding:6px;border:1px solid #333;text-align:left">#</th>
      <th style="padding:6px;border:1px solid #333;text-align:left">Dokument</th>
      <th style="padding:6px;border:1px solid #333;text-align:left">Typ</th>
      <th style="padding:6px;border:1px solid #333;text-align:left">Okres</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

${note?`<div class="muted" style="margin-top:12px">Uwagi: ${escapeHtml(note)}</div>`:''}

<div class="sig">
  <div><div class="line"></div><div class="muted">Przekazujący</div></div>
  <div><div class="line"></div><div class="muted">Przyjmujący (księgowy)</div></div>
</div>

<div class="muted" style="margin-top:16px">Wygenerowano w OneTapDay. Możesz wydrukować do PDF.</div>
</body></html>`;

      const filename = sanitizeName(`Protokol_przekazania_${periodVal||'okres'}.html`);
      const file = new File([html], filename, {type:'text/html'});

      await addFiles([file], {source:'template', type:'handover', period:periodVal, counterparty:accountant, for_accountant:true});
      await refresh();
      setView('all');
    });
  }

  function renderTemplateExplain(){
    if(!els.tplHost) return;

    const txList = (typeof _otdGetJSON==='function') ? (_otdGetJSON('tx_manual_import', []) || []) : [];
    const last = (txList||[]).slice().reverse().slice(0,100);

    const opt = ['<option value="">— wybierz transakcję —</option>'].concat(
      last.map(r=>{
        const id = r.id || r["ID transakcji"] || '';
        const date = (r["Data księgowania"] || r["Data transakcji"] || r["Data"] || '').toString();
        const amt = (r["Kwota"] || r["Kwota transakcji"] || r["Amount"] || '').toString();
        const who = (r["Nazwa kontrahenta"] || r["Kontrahent"] || r["Odbiorca/Nadawca"] || r["Opis"] || '').toString();
        const label = `${date} | ${amt} | ${who}`.slice(0,120);
        return `<option value="${escapeHtml(String(id))}">${escapeHtml(label)}</option>`;
      })
    ).join('');

    els.tplHost.innerHTML = `
      <div class="card" style="padding:12px">
        <div style="font-weight:800">Wyjaśnienie przelewu</div>
        <div class="muted small" style="margin-top:6px">Krótki dokument „co to za płatność”. Najczęściej tego brakuje.</div>

        <label class="muted small" style="display:block;margin-top:10px">Transakcja (opcjonalnie)
          <select id="tplExpTx" style="width:100%;margin-top:6px">${opt}</select>
        </label>

        <div class="row" style="margin-top:10px;gap:8px;align-items:flex-end;flex-wrap:wrap">
          <label class="muted small">Data
            <input id="tplExpDate" type="text" placeholder="YYYY-MM-DD"/>
          </label>
          <label class="muted small">Kwota
            <input id="tplExpAmt" type="text" placeholder="np. -1299.00 PLN"/>
          </label>
          <label class="muted small">Kontrahent
            <input id="tplExpWho" type="text" placeholder="np. Landlord"/>
          </label>
        </div>

        <label class="muted small" style="display:block;margin-top:10px">Powód / opis (możesz dyktować)
          <input id="tplExpReason" type="text" placeholder="np. czynsz za listopad 2025"/>
        </label>

        <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
          <button class="btn" id="tplExpGen" type="button">Wygeneruj</button>
        </div>
      </div>
    `;

    // when tx selected, prefill
    q('tplExpTx')?.addEventListener('change', ()=>{
      const id = q('tplExpTx')?.value || '';
      if(!id) return;
      const r = (txList||[]).find(x=>String(x.id || x["ID transakcji"] || '')===String(id));
      if(!r) return;
      const date = (r["Data księgowania"] || r["Data transakcji"] || r["Data"] || '').toString();
      const amt = (r["Kwota"] || r["Kwota transakcji"] || r["Amount"] || '').toString();
      const who = (r["Nazwa kontrahenta"] || r["Kontrahent"] || r["Odbiorca/Nadawca"] || r["Opis"] || '').toString();
      if(q('tplExpDate')) q('tplExpDate').value = date;
      if(q('tplExpAmt')) q('tplExpAmt').value = amt;
      if(q('tplExpWho')) q('tplExpWho').value = who;
    });

    q('tplExpGen')?.addEventListener('click', async ()=>{
      const date = (q('tplExpDate')?.value || '').trim();
      const amt = (q('tplExpAmt')?.value || '').trim();
      const who = (q('tplExpWho')?.value || '').trim();
      const reason = (q('tplExpReason')?.value || '').trim();

      if(!date && !amt && !who && !reason){
        alert('Wypełnij przynajmniej opis.');
        return;
      }

      const period = (date && date.length>=7) ? date.slice(0,7) : '';

      const html = `
<!doctype html><html><head><meta charset="utf-8"/>
<title>Wyjaśnienie przelewu</title>
<style>
  body{font-family:Arial, sans-serif; padding:24px; color:#111;}
  h1{font-size:18px;margin:0 0 8px 0;}
  .muted{color:#555;font-size:12px;}
  .box{border:1px solid #333; padding:12px; margin-top:12px; font-size:12px;}
  .line{border-top:1px solid #333; margin-top:28px; width:240px;}
</style>
</head><body>
<h1>Wyjaśnienie przelewu</h1>
<div class="muted">Okres: ${escapeHtml(period||'—')}</div>

<div class="box">
  <div><b>Data:</b> ${escapeHtml(date||'—')}</div>
  <div><b>Kwota:</b> ${escapeHtml(amt||'—')}</div>
  <div><b>Kontrahent:</b> ${escapeHtml(who||'—')}</div>
  <div style="margin-top:10px"><b>Opis:</b> ${escapeHtml(reason||'—')}</div>
</div>

<div class="line"></div>
<div class="muted">Podpis</div>

<div class="muted" style="margin-top:16px">Wygenerowano w OneTapDay. Możesz wydrukować do PDF.</div>
</body></html>`;

      const safe = (date||'').replace(/[^0-9\-]/g,'') || 'date';
      const filename = sanitizeName(`Wyjasnienie_przelewu_${safe}.html`);
      const file = new File([html], filename, {type:'text/html'});

      await addFiles([file], {source:'template', type:'explain', period, counterparty:who, for_accountant:true});
      await refresh();
      setView('all');
    });
  }

      VAULT.addFiles = addFiles;
  VAULT.refresh = refresh;
  VAULT.setView = setView;
  VAULT.open = setView;

  VAULT.init = async function(){
    if(!bindUI()) return;
    await refresh(null);
  };

  window.OTD_DocVault = VAULT;
})();


document.addEventListener('DOMContentLoaded', ()=>{ 
  try{ window.OTD_DocVault?.init?.(); }catch(e){ console.warn('DocVault init error', e); } 
});


/* ===========================
   Invoice template (local)
   - lives in "Dokumenty" as accountant tool
   - does NOT create records in "Faktury"
   =========================== */

let invoiceTplEditingId = null;

function _otdTplById(id){ return document.getElementById(id); }

function _otdTplEscHtml(s){
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#39;");
}

function _otdTplDownload(filename, content, mime){
  try{
    const blob = new Blob([content], {type: mime || 'text/plain;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ try{ URL.revokeObjectURL(a.href); }catch(_){} a.remove(); }, 0);
  }catch(err){
    console.warn(err);
    toast('Nie udało się pobrać pliku (download).');
  }
}

function _otdTplGetForm(){
  return {
    id: invoiceTplEditingId || ('tpl_' + Date.now()),
    name: (_otdTplById('invoiceTplName')?.value || '').trim() || 'Szablon',
    number: (_otdTplById('invoiceTplNumber')?.value || '').trim(),
    currency: (_otdTplById('invoiceTplCurrency')?.value || '').trim() || 'PLN',
    issue: (_otdTplById('invoiceTplIssue')?.value || '').trim(),
    due: (_otdTplById('invoiceTplDue')?.value || '').trim(),
    seller: (_otdTplById('invoiceTplSeller')?.value || '').trim(),
    buyer: (_otdTplById('invoiceTplBuyer')?.value || '').trim(),
    title: (_otdTplById('invoiceTplTitle')?.value || '').trim(),
    amount: (_otdTplById('invoiceTplAmount')?.value || '').trim(),
    note: (_otdTplById('invoiceTplNote')?.value || '').trim(),
    updatedAt: new Date().toISOString(),
  };
}

function _otdTplFillForm(t){
  if(!t) return;
  invoiceTplEditingId = t.id || null;
  if(_otdTplById('invoiceTplName')) _otdTplById('invoiceTplName').value = t.name || '';
  if(_otdTplById('invoiceTplNumber')) _otdTplById('invoiceTplNumber').value = t.number || '';
  if(_otdTplById('invoiceTplCurrency')) _otdTplById('invoiceTplCurrency').value = t.currency || 'PLN';
  if(_otdTplById('invoiceTplIssue')) _otdTplById('invoiceTplIssue').value = t.issue || '';
  if(_otdTplById('invoiceTplDue')) _otdTplById('invoiceTplDue').value = t.due || '';
  if(_otdTplById('invoiceTplSeller')) _otdTplById('invoiceTplSeller').value = t.seller || '';
  if(_otdTplById('invoiceTplBuyer')) _otdTplById('invoiceTplBuyer').value = t.buyer || '';
  if(_otdTplById('invoiceTplTitle')) _otdTplById('invoiceTplTitle').value = t.title || '';
  if(_otdTplById('invoiceTplAmount')) _otdTplById('invoiceTplAmount').value = t.amount || '';
  if(_otdTplById('invoiceTplNote')) _otdTplById('invoiceTplNote').value = t.note || '';
  invoiceTplUpdateEditState();
}

function _otdTplClearForm(){
  invoiceTplEditingId = null;
  ['invoiceTplName','invoiceTplNumber','invoiceTplCurrency','invoiceTplIssue','invoiceTplDue','invoiceTplSeller','invoiceTplBuyer','invoiceTplTitle','invoiceTplAmount','invoiceTplNote']
    .forEach(id => { const el=_otdTplById(id); if(el) el.value = (id==='invoiceTplCurrency' ? 'PLN' : ''); });
  invoiceTplUpdateEditState();
}

function _otdTplRenderList(){
  const box = _otdTplById('invoiceTplList');
  if(!box) return;
  box.innerHTML = '';
  const arr = Array.isArray(invoiceTemplates) ? invoiceTemplates : [];
  if(arr.length === 0){
    box.innerHTML = '<div class="muted small">Brak zapisanych szablonów.</div>';
    return;
  }
  arr
    .slice()
    .sort((a,b)=> String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))
    .forEach(t=>{
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '8px';
      row.style.alignItems = 'center';

      const left = document.createElement('div');
      left.style.flex = '1';
      left.style.minWidth = '0';
      left.innerHTML = `<div style="font-weight:700">${_otdTplEscHtml(t.name||'Szablon')}</div>
                        <div class="muted small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                          ${_otdTplEscHtml(t.number||'')} ${t.amount ? ('• ' + _otdTplEscHtml(t.amount) + ' ' + _otdTplEscHtml(t.currency||'')) : ''}
                        </div>`;
      row.appendChild(left);

      const btnLoad = document.createElement('button');
      btnLoad.className = 'btn secondary';
      btnLoad.textContent = 'Edytuj';
      btnLoad.onclick = ()=>{ _otdTplFillForm(t); toast('Szablon załadowany.'); };
      row.appendChild(btnLoad);

      const btnDel = document.createElement('button');
      btnDel.className = 'btn ghost';
      btnDel.textContent = 'Usuń';
      btnDel.onclick = ()=>{
        invoiceTemplates = invoiceTemplates.filter(x=>x.id!==t.id);
        saveLocal();
        _otdTplRenderList();
        if(invoiceTplEditingId === t.id) _otdTplClearForm();
        toast('Usunięto.');
      };
      row.appendChild(btnDel);

      box.appendChild(row);
    });
}

function openInvoiceTplModal(){
  const el = _otdTplById('invoiceTplModal');
  if(!el) return;
  el.classList.add('show');
  // refresh from storage in case we came from another tab
  try{ invoiceTemplates = _otdGetJSON('invoice_templates', invoiceTemplates || []); }catch(_){}
  _otdTplRenderList();
  invoiceTplUpdateEditState();
}

function closeInvoiceTplModal(){
  const el = _otdTplById('invoiceTplModal');
  if(!el) return;
  el.classList.remove('show');
}


function invoiceTplUpdateEditState(){
  const label = _otdTplById('invoiceTplEditState');
  const btnSave = _otdTplById('invoiceTplSave');
  if(!btnSave) return;
  if(invoiceTplEditingId){
    if(label) label.textContent = 'Tryb edycji: zapiszesz zmiany w tym szablonie.';
    btnSave.textContent = 'Zapisz zmiany';
  }else{
    if(label) label.textContent = '';
    btnSave.textContent = 'Zapisz';
  }
}

let _invoiceVoiceRec = null;
function invoiceVoiceDictate(){
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!Speech){
    try{ showToast?.('Rozpoznawanie mowy niedostępne w tej przeglądarce'); }catch(_){}
    return;
  }
  if(!_invoiceVoiceRec){
    _invoiceVoiceRec = new Speech();
    _invoiceVoiceRec.interimResults = false;
    _invoiceVoiceRec.maxAlternatives = 1;
    _invoiceVoiceRec.onresult = (e)=>{
      const t = (e?.results?.[0]?.[0]?.transcript || '').trim();
      if(!t) return;
      const active = document.activeElement;
      if(active && (active.tagName==='INPUT' || active.tagName==='TEXTAREA')){
        const prev = active.value || '';
        active.value = prev ? (prev + ' ' + t) : t;
        try{ active.dispatchEvent(new Event('input', {bubbles:true})); }catch(_){}
        return;
      }
      // fallback: title
      const fallback = _otdTplById('invoiceTplTitle') || _otdTplById('invoiceTplNote');
      if(fallback){
        const prev = fallback.value || '';
        fallback.value = prev ? (prev + ' ' + t) : t;
        try{ fallback.dispatchEvent(new Event('input', {bubbles:true})); }catch(_){}
      }
    };
    _invoiceVoiceRec.onerror = ()=>{
      try{ showToast?.('Błąd rozpoznawania mowy'); }catch(_){}
    };
  }
  const langSel = _otdTplById('invoiceVoiceLang');
  _invoiceVoiceRec.lang = (langSel?.value || 'pl-PL');
  try{ showToast?.('Mów teraz…'); }catch(_){}
  try{ _invoiceVoiceRec.start(); }catch(_){}
}


function invoiceTplSaveFromForm(){
  const t = _otdTplGetForm();
  if(!t.seller && !t.buyer && !t.title && !t.amount){
    toast('Wypełnij przynajmniej sprzedawcę/nabywcę/opis/kwotę.');
    return;
  }
  const idx = (invoiceTemplates||[]).findIndex(x=>x.id===t.id);
  if(idx >= 0) invoiceTemplates[idx] = t;
  else invoiceTemplates = [...(invoiceTemplates||[]), t];

  saveLocal();
  _otdTplRenderList();
  invoiceTplUpdateEditState();
  toast('Zapisano szablon.');
}

function _otdTplBuildHtml(t){
  const seller = _otdTplEscHtml(t.seller||'');
  const buyer  = _otdTplEscHtml(t.buyer||'');
  const title  = _otdTplEscHtml(t.title||'Usługa');
  const amount = _otdTplEscHtml(t.amount||'');
  const cur    = _otdTplEscHtml(t.currency||'PLN');
  const num    = _otdTplEscHtml(t.number||'');
  const issue  = _otdTplEscHtml(t.issue||'');
  const due    = _otdTplEscHtml(t.due||'');
  const note   = _otdTplEscHtml(t.note||'');

  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Faktura ${num}</title>
<style>
  body{font-family:Arial, sans-serif; margin:24px; color:#111;}
  .row{display:flex; gap:24px;}
  .col{flex:1;}
  .h{font-size:20px; font-weight:700; margin-bottom:10px;}
  .box{border:1px solid #ddd; border-radius:10px; padding:12px;}
  table{width:100%; border-collapse:collapse; margin-top:14px;}
  th,td{border-bottom:1px solid #eee; padding:8px; text-align:left; vertical-align:top;}
  th{background:#f7f7f7;}
  .right{text-align:right;}
  .muted{color:#666; font-size:12px;}
</style>
</head>
<body>
  <div class="h">Faktura ${num}</div>
  <div class="muted">Data wystawienia: ${issue || '—'} • Termin płatności: ${due || '—'}</div>

  <div class="row" style="margin-top:14px">
    <div class="col box"><div style="font-weight:700;margin-bottom:6px">Sprzedawca</div><div>${seller.replaceAll('\n','<br/>')}</div></div>
    <div class="col box"><div style="font-weight:700;margin-bottom:6px">Nabywca</div><div>${buyer.replaceAll('\n','<br/>')}</div></div>
  </div>

  <table>
    <thead><tr><th>Pozycja</th><th class="right">Kwota</th></tr></thead>
    <tbody><tr><td>${title}</td><td class="right">${amount} ${cur}</td></tr></tbody>
    <tfoot><tr><th class="right">Razem</th><th class="right">${amount} ${cur}</th></tr></tfoot>
  </table>

  ${note ? `<div class="box" style="margin-top:14px"><div style="font-weight:700;margin-bottom:6px">Uwagi</div><div>${note.replaceAll('\n','<br/>')}</div></div>` : ''}

  <div class="muted" style="margin-top:14px">Wygenerowane w OneTapDay (MVP).</div>
</body>
</html>`;
}

function invoiceTplDownloadHTML(){
  const t = _otdTplGetForm();
  const html = _otdTplBuildHtml(t);
  const name = (t.number ? t.number : (t.name||'invoice')).replaceAll(' ','_');
  _otdTplDownload(`Faktura_${name}.html`, html, 'text/html;charset=utf-8');
}

function invoiceTplDownloadCSV(){
  const t = _otdTplGetForm();
  // very simple CSV: one row template
  const cols = ['template_name','invoice_no','issue_date','due_date','seller','buyer','title','amount_gross','currency','note'];
  const row = [
    t.name||'',
    t.number||'',
    t.issue||'',
    t.due||'',
    (t.seller||'').replaceAll('\n',' '),
    (t.buyer||'').replaceAll('\n',' '),
    t.title||'',
    t.amount||'',
    t.currency||'PLN',
    (t.note||'').replaceAll('\n',' ')
  ];
  const esc = (v)=> `"${String(v??'').replaceAll('"','""')}"`;
  const csv = cols.join(',') + "\n" + row.map(esc).join(',');
  const name = (t.name||'invoice_template').replaceAll(' ','_');
  _otdTplDownload(`SzablonFaktury_${name}.csv`, csv, 'text/csv;charset=utf-8');
}


// ===============================
// INVENTORY TEMPLATE (local)
// ===============================
let inventoryTemplates = [];
let inventoryTplEditingName = null;

function openInventoryTplModal(){
  const el = _otdTplById('inventoryTplModal');
  if(!el) return;
  el.classList.add('show');
  try{ inventoryTemplates = _otdGetJSON('inventory_templates', inventoryTemplates || []); }catch(_){}
  _otdInvRenderList();
  inventoryTplUpdateEditState();
}

function closeInventoryTplModal(){
  const el = _otdTplById('inventoryTplModal');
  if(!el) return;
  el.classList.remove('show');
}

function _otdInvGetForm(){
  const get = (id)=> (_otdTplById(id)?.value || '').trim();
  const name = get('inventoryTplName');
  const date = get('inventoryTplDate');
  const location = get('inventoryTplLocation');
  const rowsRaw = get('inventoryTplRows');
  let rows = parseInt(rowsRaw || '50', 10);
  if(isNaN(rows) || rows < 10) rows = 50;
  if(rows > 500) rows = 500;
  return { name, date, location, rows, updatedAt: Date.now() };
}

function _otdInvSetForm(t){
  const set = (id,val)=>{ const el=_otdTplById(id); if(el) el.value = (val||''); };
  set('inventoryTplName', t?.name || '');
  set('inventoryTplDate', t?.date || '');
  set('inventoryTplLocation', t?.location || '');
  set('inventoryTplRows', String(t?.rows || 50));
}


function inventoryTplUpdateEditState(){
  const label = byId('inventoryTplEditState');
  const btnSave = byId('inventoryTplSave');
  if(!btnSave) return;
  if(inventoryTplEditingName){
    if(label) label.textContent = 'Tryb edycji: zapiszesz zmiany w tym szablonie.';
    btnSave.textContent = 'Zapisz zmiany';
  }else{
    if(label) label.textContent = '';
    btnSave.textContent = 'Zapisz';
  }
}

function inventoryTplClearForm(){
  _otdInvSetForm({name:'', place:'', date:'', items:''});
  inventoryTplEditingName = null;
  inventoryTplUpdateEditState();
}


function inventoryTplSaveFromForm(){
  const t = _otdInvGetForm();
  if(!t.name){
    try{ showToast?.('Podaj nazwę szablonu'); }catch(_){}
    return;
  }
  // upsert by name
  try{
    inventoryTemplates = _otdGetJSON('inventory_templates', inventoryTemplates || []);
  }catch(_){}
  const idx = inventoryTemplates.findIndex(x => (x?.name||'').toLowerCase() === t.name.toLowerCase());
  if(idx >= 0) inventoryTemplates[idx] = { ...inventoryTemplates[idx], ...t };
  else inventoryTemplates.unshift(t);
  _otdSetJSON('inventory_templates', inventoryTemplates);
  _otdInvRenderList();
  inventoryTplEditingName = t.name;
  inventoryTplUpdateEditState();
  try{ showToast?.('Zapisano'); }catch(_){}
}

function _otdInvRenderList(){
  const wrap = _otdTplById('inventoryTplList');
  if(!wrap) return;
  wrap.innerHTML = '';
  let list = inventoryTemplates || [];
  try{ list = _otdGetJSON('inventory_templates', list); }catch(_){}
  inventoryTemplates = Array.isArray(list) ? list : [];
  if(inventoryTemplates.length === 0){
    const empty = document.createElement('div');
    empty.className = 'muted small';
    empty.textContent = 'Brak zapisanych szablonów';
    wrap.appendChild(empty);
    return;
  }
  inventoryTemplates.forEach((t, i)=>{
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.border = '1px solid rgba(255,255,255,0.08)';
    row.style.borderRadius = '12px';
    row.style.padding = '8px';
    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.flexDirection = 'column';
    left.style.gap = '2px';
    const title = document.createElement('div');
    title.style.fontWeight = '700';
    title.style.fontSize = '12px';
    title.innerHTML = escapeHtml(t?.name || 'Szablon');
    const meta = document.createElement('div');
    meta.className = 'muted small';
    meta.style.fontSize = '11px';
    const parts = [];
    if(t?.date) parts.push(t.date);
    if(t?.location) parts.push(t.location);
    parts.push(`wiersze: ${t?.rows || 50}`);
    meta.textContent = parts.join(' · ');
    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.gap = '6px';
    const btnLoad = document.createElement('button');
    btnLoad.className = 'btn secondary small';
    btnLoad.textContent = 'Edytuj';
    btnLoad.addEventListener('click', (e)=>{ e.preventDefault(); inventoryTplEditingName = (t?.name || null); _otdInvSetForm(t); inventoryTplUpdateEditState(); toast('Załadowano do edycji'); });

    const btnDel = document.createElement('button');
    btnDel.className = 'btn ghost small';
    btnDel.textContent = 'Usuń';
    btnDel.addEventListener('click', (e)=>{
      e.preventDefault();
      inventoryTemplates = inventoryTemplates.filter((_, idx)=> idx !== i);
      _otdSetJSON('inventory_templates', inventoryTemplates);
      _otdInvRenderList();
    });

    right.appendChild(btnLoad);
    right.appendChild(btnDel);

    row.appendChild(left);
    row.appendChild(right);
    wrap.appendChild(row);
  });
}

function _otdInvBuildHeader(){
  return ['Item name','SKU/Code','Unit','Qty counted','Unit price','Total','VAT rate','Warehouse/Location','Notes'];
}

function inventoryTplDownloadCSV(){
  const t = _otdInvGetForm();
  const header = _otdInvBuildHeader();
  const rows = [];
  rows.push(header);
  const n = t.rows || 50;
  for(let i=0;i<n;i++){
    rows.push(['','','','','','','','','']);
  }
  const csv = rows.map(r => r.map(v => {
    const s = String(v ?? '');
    if(s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replaceAll('"','""')}"`;
    return s;
  }).join(',')).join('\n');
  const name = (t.name || 'inventory').replaceAll(' ','_');
  _otdTplDownload(`Inwentaryzacja_${name}.csv`, csv, 'text/csv;charset=utf-8');
}

function inventoryTplDownloadXLSX(){
  const t = _otdInvGetForm();
  const header = _otdInvBuildHeader();
  const aoa = [];
  // optional metadata row (kept simple)
  if(t.date || t.location){
    aoa.push([`Inventory date: ${t.date || ''}`, `Location: ${t.location || ''}`]);
    aoa.push([]);
  }
  aoa.push(header);
  const n = t.rows || 50;
  for(let i=0;i<n;i++){
    aoa.push(['','','','','','','','','']);
  }

  if(!(window.XLSX && XLSX.utils && XLSX.writeFile)){
    // fallback to CSV
    inventoryTplDownloadCSV();
    try{ showToast?.('Brak XLSX: pobrano CSV'); }catch(_){}
    return;
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
  const name = (t.name || 'inventory').replaceAll(' ','_');
  XLSX.writeFile(wb, `Inwentaryzacja_${name}.xlsx`);
}


/* === QALTA CASH UI glue (visual-only; uses existing kasa data & actions) === */
function _otdCashMonthSums(){
  const now = new Date();
  const ym = now.toISOString().slice(0,7);
  let ins = 0, outs = 0;
  (kasa||[]).forEach(k=>{
    const d = String(k.date||"").slice(0,7);
    if(d !== ym) return;
    if(k.type === 'przyjęcie') ins += Number(k.amount||0);
    if(k.type === 'wydanie') outs += Number(k.amount||0);
  });
  return {ins, outs};
}
function _otdFmtPLN(n){
  try{
    const v = Number(n||0);
    // keep it simple, no locale surprises
    return v.toFixed(2);
  }catch(_){ return String(n||"0.00"); }
}

function renderKasaQalta(listKasa){
  const balEl = $id('cashBalanceBig');
  if(balEl && typeof kasaBalance === 'function'){
    balEl.textContent = _otdFmtPLN(kasaBalance()) + ' PLN';
  }
  const sums = _otdCashMonthSums();
  const inEl = $id('cashMonthIn'); if(inEl) inEl.textContent = '+ ' + _otdFmtPLN(sums.ins);
  const outEl = $id('cashMonthOut'); if(outEl) outEl.textContent = '- ' + _otdFmtPLN(sums.outs);

  const feed = $id('kasaFeed');
  if(!feed) return;
  feed.innerHTML = '';

  const grouped = {};
  (listKasa||[]).forEach(k=>{
    const d = (k.date||today()).slice(0,10);
    (grouped[d] = grouped[d] || []).push(k);
  });

  const days = Object.keys(grouped).sort((a,b)=> b.localeCompare(a));
  days.forEach(day=>{
    const h = document.createElement('div');
    h.className = 'q-day';
    h.textContent = day;
    feed.appendChild(h);

    grouped[day].forEach(k=>{
      const type = k.type || '';
      const isIn = type === 'przyjęcie';
      const isOut = type === 'wydanie';

      // Category-first icon (instead of arrows)
      const rawCat = (k.category || '').toString().trim();
      const rawCatClean = rawCat.replace(/^[^\wА-Яа-яЁё]+/u,'').trim();
      let catObj = null;
      try{
        if(rawCatClean && typeof getCatById === 'function') catObj = getCatById(rawCatClean);
        if(!catObj && rawCatClean && typeof getAllSpCats === 'function'){
          const cats = getAllSpCats() || [];
          catObj = cats.find(c => String(c.label||'').toLowerCase() === rawCatClean.toLowerCase()) || null;
        }
      }catch(e){}

      const catEmoji = (catObj && catObj.emoji) ? catObj.emoji : '';
      const catLabel = (catObj && catObj.label) ? catObj.label : (rawCatClean || '');

      const icon = catEmoji ? catEmoji : (isIn ? '💰' : (isOut ? '🧾' : '📦'));
      const title = (k.comment && String(k.comment).trim()) ? String(k.comment).trim() : (isIn?'Przyjęcie': isOut?'Wydatek':'Kasa');
      const sub = (catLabel && catLabel !== 'Без категории' && catLabel !== '—') ? catLabel : (k.source || '');

      const row = document.createElement('div');
      row.className = 'q-item';
      const amt = Number(k.amount||0);
      const sign = isOut ? '-' : (isIn ? '+' : '');
      const cls = isOut ? 'neg' : (isIn ? 'pos' : '');
      row.innerHTML = `
        <div class="q-left">
          <div class="q-ic">${icon}</div>
          <div class="q-text">
            <div class="q-title">${escapeHtml(title)}</div>
            <div class="q-sub2">${escapeHtml(sub||'')}</div>
          </div>
        </div>
        <div class="q-right">
          <div class="q-amt ${cls}">${sign}${_otdFmtPLN(amt)}</div>
          <div class="q-miniRow">
            <button class="q-mini" data-act="cat" data-kind="kasa" data-id="${k.id}">${TT("cash.btn_cat_short", null, "Кат.")}</button>
            <button class="q-mini" data-act="edit" data-kind="kasa" data-id="${k.id}">✎</button>
            <button class="q-mini" data-act="del" data-kind="kasa" data-id="${k.id}">🗑</button>
          </div>
        </div>`;
      feed.appendChild(row);
    });
  });
}

(function(){
  // UI bindings: menu + cash sheet
  function show(el){ if(el) el.style.display='flex'; }
  function hide(el){ if(el) el.style.display='none'; }

  let cashKind = 'wydanie'; // default: expense

  function setKind(kind){
    cashKind = kind;
    const bOut = $id('cashTypeOut');
    const bIn  = $id('cashTypeIn');
    if(bOut && bIn){
      const outActive = (kind==='wydanie');
      bOut.classList.toggle('active', outActive);
      bIn.classList.toggle('active', !outActive);
      bOut.setAttribute('aria-selected', outActive ? 'true':'false');
      bIn.setAttribute('aria-selected', !outActive ? 'true':'false');
    }
  }

  function openSheet(kind){
    if(kind) setKind(kind);
    const back = $id('cashSheetBackdrop');
    show(back);
    // focus amount quickly
    setTimeout(()=>{ try{ $id('quickAmt')?.focus(); }catch(e){} }, 50);
  }
  function closeSheet(){
    hide($id('cashSheetBackdrop'));
  }

  // Keyboard support: Enter/Space on brand opens the main menu
  document.addEventListener('keydown', (e)=>{
    const a = document.activeElement;
    if(!a) return;
    if(a.id==='brandHome' && (e.key==='Enter' || e.key===' ')){
      e.preventDefault();
      if(window.appGoHome) window.appGoHome();
    }
  });

document.addEventListener('click', (e)=>{
    const t = e.target;


    // Brand click -> go Home
    if(t && (t.id==='brandHome' || (t.closest && t.closest('#brandHome')))){
      // Если меню открыто — закроем, чтобы не путало
      const ov = $id('navOverlay');
      if(ov) hide(ov);
      if(window.appGoHome) window.appGoHome();
      return;
    }

    // Menu overlay
    if(t && t.id==='navBtn'){ const ov=$id('navOverlay'); if(!ov) return; const open = (ov.style.display && ov.style.display!=='none'); if(open){ hide(ov); } else { ov.style.display='flex'; } }
    if(t && t.id==='navClose'){ hide($id('navOverlay')); }
    if(t && (t.id==='navOverlay')){ hide($id('navOverlay')); }

    if(t && t.id==='navSettingsBtn'){ hide($id('navOverlay')); if(window.appGoSection) window.appGoSection('ustawienia'); }
    if(t && t.classList && t.classList.contains('navItem')){
      const sec = t.getAttribute('data-nav');
      hide($id('navOverlay'));
      if(sec==='home'){ if(window.appGoHome) window.appGoHome(); return; }
      if(window.appGoSection) window.appGoSection(sec);
    }

    // Cash action buttons
    if(t && (t.id==='cashBtnAdd' || t.closest && t.closest('#cashBtnAdd'))){ openSheet('wydanie'); }
    if(t && (t.id==='cashBtnPhoto' || t.closest && t.closest('#cashBtnPhoto'))){ $id('cashPhoto')?.click(); }
    if(t && t.id==='cashSheetClose'){ closeSheet(); }
    if(t && t.id==='cashSheetBackdrop'){ closeSheet(); } // click on backdrop
    if(t && t.id==='cashTypeOut'){ setKind('wydanie'); }
    if(t && t.id==='cashTypeIn'){ setKind('przyjęcie'); }
    if(t && t.id==='cashSheetSave'){
      if(typeof quickCashAdd === 'function') quickCashAdd(cashKind);
      closeSheet();
    }
    if(t && t.id==='cashSheetPhoto'){ $id('cashPhoto')?.click(); }
  });

  // Receipt photo OCR -> prefill sheet
  $id('cashPhoto')?.addEventListener('change', async (e)=>{ 
    const f = e.target.files && e.target.files[0];
    if(!f) return;
    try{
      // OCR removed. We store the photo as a document for later AI processing / accountant review.
      if(window.OTD_DocVault?.addFiles){
        await window.OTD_DocVault.addFiles([f], { source:'cash', type:'receipt' });
        try{ await window.OTD_DocVault.refresh?.(null); }catch(_){}
      }
    }catch(err){
      console.warn('cashPhoto->DocVault error', err);
    }
    // Manual entry instead of OCR prefill
    try{ openSheet('wydanie'); }catch(_){}
    try{ e.target.value = ''; }catch(_){}
  });

  })();


/* ==== OTD_NOTIF_V1: in-app notifications (client) ==== */
    (function(){
      if (window.__OTD_NOTIF_INIT) return;
      window.__OTD_NOTIF_INIT = true;

      const API = '/api/notifications';
      const API_MARK = '/api/notifications/mark-read';
      const SEEN_KEY = 'otd_notif_toast_seen';
      let otdNotifShowAll = false;
      let otdNotifUnreadCount = 0;

      function esc(s){ return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;"); }

      function injectCss(){
        if (document.getElementById('otdNotifCss')) return;
        const st = document.createElement('style');
        st.id = 'otdNotifCss';
        st.textContent = `
          .otdNotifBellBtn{ position:relative; display:inline-flex; align-items:center; justify-content:center; }
          .otdBellIcon{ display:block; }
          .otdNotifBellBtn .otdNotifBadge{ position:absolute; top:-4px; right:-4px; min-width:16px; height:16px; padding:0 4px; border-radius:999px; display:inline-flex; align-items:center; justify-content:center; font-size:10px; font-weight:800; color:#0b1a07; background:#47b500; border:1px solid rgba(0,0,0,.35); box-shadow: 0 6px 18px rgba(0,0,0,.25); }
          .otdNotifPanel{ position:fixed; top: calc(env(safe-area-inset-top) + 64px); right:12px; width:min(360px, calc(100vw - 24px)); max-height:60vh; overflow:auto; z-index:9999; border-radius:16px; background:rgba(0,0,0,.55); border:1px solid rgba(71,181,0,.25); backdrop-filter: blur(14px); box-shadow: 0 12px 30px rgba(0,0,0,.35); display:none; }
          .otdNotifPanel header{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.08); }
          .otdNotifPanel header .h{ font-weight:700; color:#eaffdf; font-size:13px; }
          .otdNotifPanel header button{ background:transparent; border:1px solid rgba(255,255,255,.16); color:#eaffdf; border-radius:12px; padding:6px 10px; cursor:pointer; }
          .otdNotifItem{ padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.08); cursor:pointer; }
          .otdNotifItem:last-child{ border-bottom:none; }
          .otdNotifItem .m{ color:#eaffdf; font-size:13px; line-height:1.25; }
          .otdNotifItem .d{ margin-top:4px; color:rgba(234,255,223,.7); font-size:11px; }
          .otdNotifItem.read{ opacity:.55; }
          .otdNotifTabs{ display:flex; gap:6px; align-items:center; }
          .otdNotifTabs button.active{ border-color: rgba(71,181,0,.55); background: rgba(71,181,0,.12); }

          .otdNotifToast{ position:fixed; top:12px; left:50%; transform:translateX(-50%); z-index:10000; max-width:min(520px, calc(100vw - 24px)); padding:10px 12px; border-radius:14px; background:rgba(0,0,0,.70); border:1px solid rgba(71,181,0,.30); backdrop-filter: blur(14px); box-shadow: 0 10px 28px rgba(0,0,0,.35); color:#eaffdf; font-size:13px; display:none; }
          .otdNotifToast b{ color:#dfffd0; }
        `;
        document.head.appendChild(st);
      }

      function ensureUi(){
        injectCss();
        if (document.getElementById('otdNotifBell')) return;
        const bell = document.createElement('button');
        bell.type = 'button';
        bell.id = 'otdNotifBell';
        bell.className = 'iconBtn iconPill otdNotifBellBtn';
        bell.setAttribute('aria-label', TT('client.notifs.aria', null, 'Powiadomienia'));
        bell.innerHTML = `<svg class="otdBellIcon" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="otdNotifBadge" aria-label="0" style="display:none">0</span>`;
        const panel = document.createElement('div');
        panel.id = 'otdNotifPanel';
        panel.className = 'otdNotifPanel';
        panel.innerHTML = `<header><div class="h">${TT('client.notifs.title', null, 'Powiadomienia')}</div><div class="otdNotifTabs"><button id="otdNotifShowNew" class="active">${TT('client.notifs.tab_new', null, 'Nowe')}</button><button id="otdNotifShowAll">${TT('client.notifs.tab_history', null, 'Historia')}</button><button id="otdNotifMarkAll">${TT('client.notifs.tab_read', null, 'Przeczytane')}</button></div></header><div id="otdNotifList"></div>`;
        const toast = document.createElement('div');
        toast.id = 'otdNotifToast';
        toast.className = 'otdNotifToast';

        try{
          const top = document.querySelector('.top');
          const settingsBtn = document.getElementById('navSettingsBtn');
          const right = document.getElementById('topRight') || (settingsBtn ? settingsBtn.parentElement : null);

          if (right && settingsBtn && settingsBtn.parentElement===right) right.insertBefore(bell, settingsBtn);
          else if (right) right.appendChild(bell);
          else if (top && settingsBtn && settingsBtn.parentElement===top) top.insertBefore(bell, settingsBtn);
          else if (top) top.appendChild(bell);
          else document.body.appendChild(bell);
        }catch(_){ document.body.appendChild(bell); }
        document.body.appendChild(panel);
        document.body.appendChild(toast);

bell.addEventListener('click', async ()=>{
          const shown = panel.style.display === 'block';
          panel.style.display = shown ? 'none' : 'block';
          if (!shown) { try{ await pull(); }catch(_){}} 
        });
        document.addEventListener('click', (e)=>{
          if (!panel || panel.style.display !== 'block') return;
          if (e.target === bell || bell.contains(e.target) || e.target === panel || panel.contains(e.target)) return;
          panel.style.display = 'none';
        });
        document.getElementById('otdNotifMarkAll')?.addEventListener('click', async ()=>{
          try{
            await fetch(API_MARK, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({all:true}) });
          }catch(_){}
          try{ await pull(); }catch(_){}
        });

        document.getElementById('otdNotifShowNew')?.addEventListener('click', async ()=>{
          otdNotifShowAll = false;
          document.getElementById('otdNotifShowNew')?.classList.add('active');
          document.getElementById('otdNotifShowAll')?.classList.remove('active');
          try{ await pull(); }catch(_){}
        });
        document.getElementById('otdNotifShowAll')?.addEventListener('click', async ()=>{
          otdNotifShowAll = true;
          document.getElementById('otdNotifShowAll')?.classList.add('active');
          document.getElementById('otdNotifShowNew')?.classList.remove('active');
          try{ await pull(); }catch(_){}
        });

      }

      function getSeen(){
        try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch(_) { return []; }
      }
      function setSeen(arr){
        try { localStorage.setItem(SEEN_KEY, JSON.stringify(arr.slice(-200))); } catch(_){}
      }

      function showToast(msg){
        const t = document.getElementById('otdNotifToast');
        if (!t) return;
        t.innerHTML = `<b>${TT('client.notifs.toast_prefix', null, 'Powiadomienie')}:</b> ${esc(msg)}`;
        t.style.display = 'block';
        clearTimeout(showToast._tm);
        showToast._tm = setTimeout(()=>{ t.style.display = 'none'; }, 4500);
      }

      function fmtDate(iso){
        try { return new Date(iso).toLocaleString(); } catch(_) { return ''; }
      }

      async function markRead(ids){
        if (!ids || !ids.length) return;
        try{
          await fetch(API_MARK, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ids }) });
        }catch(_){}
      }

      function render(list, mode){
        const badge = document.querySelector('#otdNotifBell .otdNotifBadge');
        const listEl = document.getElementById('otdNotifList');
        const cnt = (list||[]).length;
        const unreadCnt = Number(otdNotifUnreadCount || 0);

        if (badge){
          badge.textContent = String(unreadCnt);
          badge.style.display = unreadCnt > 0 ? 'inline-flex' : 'none';
        }
        if (!listEl) return;
        if (!cnt){
          listEl.innerHTML = `<div class="otdNotifItem" style="cursor:default"><div class="m">${mode==='all' ? TT('client.notifs.empty_all', null, 'Historia jest pusta.') : TT('client.notifs.empty_new', null, 'Brak nowych powiadomień.')}</div></div>`;
          return;
        }
        listEl.innerHTML = list.map(n=>{
          let rawMsg = String(n.message || '');
    // language-neutral notifications (preferred)
    if (n.i18nKey) rawMsg = TT(String(n.i18nKey), (n.vars && typeof n.vars === 'object') ? n.vars : null, rawMsg);
    const msg = esc(rawMsg);
          const dt = fmtDate(n.createdAt);
          const readCls = (mode==='all' && n.read) ? ' read' : '';
          return `<div class="otdNotifItem${readCls}" data-id="${esc(n.id)}" data-request="${esc(n.requestId||'')}">
                    <div class="m">${msg}</div>
                    <div class="d">${esc(dt)}</div>
                  </div>`;
        }).join('');
        listEl.querySelectorAll('.otdNotifItem[data-id]').forEach(el=>{
          el.addEventListener('click', async ()=>{
            const id = el.getAttribute('data-id');
            const rid = el.getAttribute('data-request');
            try{ await markRead([id]); }catch(_){}
            // Open requests modal for convenience
            if (rid){
              try{ document.getElementById('openClientRequestsBtn')?.click(); }catch(_){}
            }
            try{ await pull(); }catch(_){}
          });
        });
      }

      async function pull(){
        ensureUi();
        let unreadJson = null;
        try{
          const r = await fetch(API + '?unread=1', { credentials:'include' });
          if (!r.ok) { otdNotifUnreadCount = 0; render([], 'unread'); return; }
          unreadJson = await r.json();
        }catch(_){ return; }

        const unread = (unreadJson && unreadJson.notifications) ? unreadJson.notifications : [];
        otdNotifUnreadCount = unread.length;

        if (!otdNotifShowAll){
          render(unread, 'unread');
        } else {
          try{
            const r2 = await fetch(API, { credentials:'include' });
            const j2 = await r2.json().catch(()=>({}));
            const all = (j2 && j2.notifications) ? j2.notifications : [];
            render(all, 'all');
          } catch(_){
            render(unread, 'unread');
          }
        }

        // Toast only for new ids (local)
        const seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
        const newly = unread.filter(n=> n && n.id && !seen.has(n.id));
        if (newly.length){
          const n0 = newly[0] || {};
          let msg = (n0 && n0.message) ? String(n0.message) : '';
          if (n0 && n0.i18nKey) msg = TT(String(n0.i18nKey), (n0.vars || null), msg);
          showToast(msg || TT('client.notifs.toast_prefix', null, 'Powiadomienie'));
          newly.forEach(n=> seen.add(n.id));
          localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen).slice(-200)));
        }
      }

      function start(){
        ensureUi();
        pull();
        setInterval(pull, 15000);
      }

      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
      else start();
    })();



// ===== Document Vault (client folders + files) =====
(function(){
  function esc(s){ return String(s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
  async function apiJson(url, method, body){
    const opt = { method: method||'GET', credentials:'include', headers:{'Content-Type':'application/json'} };
    if (body) opt.body = JSON.stringify(body);
    const r = await fetch(url, opt);
    const j = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(j && j.error ? j.error : ('HTTP ' + r.status));
    return j;
  }

  let modal = null;
  let vaultState = { folders:[], files:[] };


  // Bulk actions (multi-select files)
  let bulkSelected = new Set();
  let lastVisibleFiles = [];

  function bulkReset(){
    try{ bulkSelected.clear(); }catch(_){ bulkSelected = new Set(); }
  }

  function bulkPruneToVisible(list){
    const vis = new Set((list||[]).map(f=>String((f&&f.id)||'')));
    try{
      Array.from(bulkSelected).forEach(id=>{ if (!vis.has(String(id))) bulkSelected.delete(id); });
    }catch(_){ }
  }

  function renderBulkBar(list){
    const bar = modal && modal.querySelector('#otdVaultBulkBar');
    if (!bar) return;
    const total = (list||[]).length;
    const selected = (bulkSelected && bulkSelected.size) ? bulkSelected.size : 0;
    if (!selected){
      bar.style.display = 'none';
      bar.innerHTML = '';
      return;
    }
    bar.style.display = 'flex';
    const pickMode = !!(vaultPickCtx && vaultPickCtx.requestId);
    bar.innerHTML = `
      <span class="muted small" style="opacity:.85">${TT('vault.bulk.selected', { n: selected }, 'Wybrano: ' + selected)}</span>
      <button type="button" class="btn ghost small" data-bulkact="all">${TT('vault.bulk.select_all', { n: total }, 'Zaznacz wszystko (' + total + ')')}</button>
      <button type="button" class="btn ghost small" data-bulkact="clear">${TT('vault.bulk.reset', null, 'Reset')}</button>
      ${pickMode ? `<button type="button" class="btn small" data-bulkact="attach">${TT('vault.bulk.attach_to_request', null, 'Dołącz do prośby')}</button>
      <button type="button" class="btn ghost small" data-bulkact="cancelPick">${TT('buttons.cancel', null, 'Anuluj')}</button>` : `<button type="button" class="btn small" data-bulkact="move">${TT('buttons.move', null, 'Przenieś')}</button>
      <button type="button" class="btn secondary small" data-bulkact="delete">${TT('buttons.delete', null, 'Usuń')}</button>`}
    `;
  }

  const VAULT_CATS = [
    { id:'incoming', label:'Входящие' },
    { id:'outgoing', label:'Выставленные' },
    { id:'tax', label:'ZUS/PIT' },
    { id:'proof', label:'Подтверждения' },
    { id:'other', label:'Другое' }
  ];

  function curMonth(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    return `${y}-${m}`;
  }

  function monthList(){
  // from 2025-01, forward to (current month + 12)
  const out = [];
  const start = new Date(2025, 0, 1);
  const end = new Date();
  end.setDate(1);
  end.setMonth(end.getMonth() + 12);

  const d = new Date(start.getTime());
  d.setDate(1);
  while (d.getTime() <= end.getTime()){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    out.push(`${y}-${m}`);
    d.setMonth(d.getMonth()+1);
  }
  return out;
}

  function lsGet(k, def){
    try{ const v = localStorage.getItem(k); return v ? v : def; }catch(_){ return def; }
  }
  function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch(_){ }
  }

  let selectedMonth = lsGet('otd_vault_month', curMonth());
  let selectedCat = lsGet('otd_vault_cat', 'incoming');

  let vaultPickCtx = null; // { requestId }
  let vaultPickResolve = null;
  let vaultSearchQ = '';


  function setSelectedMonth(v){ selectedMonth = v || curMonth(); lsSet('otd_vault_month', selectedMonth); }
  function setSelectedCat(v){ selectedCat = v || 'incoming'; lsSet('otd_vault_cat', selectedCat); }

  function catBtnHtml(cat){
    const active = (cat.id === selectedCat);
    const cls = active ? 'btn' : 'btn secondary';
    return `<button type="button" class="${cls} small" data-cat="${esc(cat.id)}">${esc(cat.label)}</button>`;
  }

  function renderSmartControls(){
    if (!modal) return;
    const msel = modal.querySelector('#otdVaultMonthSel');
    if (msel){
      const months = monthList();
      msel.innerHTML = months.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
      if (months.includes(selectedMonth)) msel.value = selectedMonth;
      else { selectedMonth = curMonth(); msel.value = selectedMonth; }
    }
    const box = modal.querySelector('#otdVaultCatBtns');
    if (box){
      box.innerHTML = VAULT_CATS.map(catBtnHtml).join('');
      box.querySelectorAll('button[data-cat]').forEach(b=>{
        b.addEventListener('click', async ()=>{
          const c = b.getAttribute('data-cat') || 'incoming';
          setSelectedCat(c);
          // re-render for active state
          renderSmartControls();
          await syncSmart().catch(err=>setStatus('Ошибка: '+err.message));
        });
      });
    }
  }

  function folderByMeta(month, cat){
    const folders = vaultState.folders || [];
    const hit = folders.find(f=>f && f.meta && f.meta.month === month && f.meta.category === cat);
    return hit ? hit.id : '';
  }

  async function ensureSmartFolder(month, cat){
    const j = await apiJson('/api/docs/folders/ensure','POST',{ month, category: cat });
    return (j && j.folder && j.folder.id) ? j.folder.id : '';
  }

  function onExportMonth(){
    const m = selectedMonth || curMonth();
    const c = selectedCat || 'incoming';
    const url = `/api/docs/export/month?month=${encodeURIComponent(m)}&category=${encodeURIComponent(c)}`;
    try{ window.open(url, '_blank'); }catch(_){ window.location.href = url; }
  }

  async function syncSmart(){
    // Ensure server folder exists for month+category, then refresh and select it.
    const month = selectedMonth || curMonth();
    const cat = selectedCat || 'incoming';
    const fid = await ensureSmartFolder(month, cat);
    await refresh(fid);
  }


  function ensureModal(){
    if (modal) return modal;
    const wrap = document.createElement('div');
    wrap.id = 'otdVaultModal';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:14px;';
    wrap.innerHTML = `
      <style>
        #otdVaultModal select option{ color:#111; background:#fff; }
      </style>
      <div style="width:min(820px,96vw);max-height:90vh;overflow:auto;border-radius:18px;background:rgba(18,22,25,.92);border:1px solid rgba(255,255,255,.10);box-shadow:0 20px 80px rgba(0,0,0,.55);padding:14px">
        <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap">
          <div>
            <div style="font-weight:900;font-size:18px">Мои документы</div>
            <div style="opacity:.75;font-size:12px;margin-top:2px">Папки и файлы внутри OneTapDay. Не теряются в чате, не теряются в галерее.</div>
          </div>
          <button id="otdVaultClose" class="btn ghost" type="button">Закрыть</button>
        </div>

        <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-top:12px">
          <div style="min-width:160px">
            <div class="muted small" style="margin-bottom:6px">Месяц</div>
            <select id="otdVaultMonthSel" style="width:100%;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff"></select>
          </div>
          <div style="flex:1;min-width:240px">
            <div class="muted small" style="margin-bottom:6px">Раздел</div>
            <div id="otdVaultCatBtns" style="display:flex;gap:8px;flex-wrap:wrap"></div>
          </div>
          <button id="otdVaultFoldersToggle" class="btn ghost" type="button">Папки</button>
        </div>

        <div id="otdVaultFoldersPanel" style="display:none;margin-top:12px">
          <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
            <div style="flex:1;min-width:220px">
              <div class="muted small" style="margin-bottom:6px">Папка</div>
              <select id="otdVaultFolderSel" style="width:100%;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff"></select>
            </div>
            <div style="min-width:220px;flex:1">
              <div class="muted small" style="margin-bottom:6px">Новая папка</div>
              <div style="display:flex;gap:8px">
                <input id="otdVaultNewFolder" placeholder="Напр. 2025-12 / VAT / Контракты" style="flex:1;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff" />
                <button id="otdVaultCreateFolder" class="btn secondary" type="button">Создать</button>
              </div>
            
          <div style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <div class="muted small">Доступ бухгалтеру</div>
            <button id="otdVaultShareToggle" class="btn secondary small" type="button">...</button>
            <div id="otdVaultShareState" class="muted small" style="opacity:.8"></div>
          </div>
        </div>
          </div>
        </div>

        <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <label class="btn secondary" style="cursor:pointer">
            <input id="otdVaultFileInput" type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" multiple style="display:none" />
            <span>Выбрать файлы</span>
          </label>
          <button id="otdVaultUploadBtn" class="btn" type="button">Загрузить в папку</button>
          <div id="otdVaultStatus" class="muted small" style="opacity:.85"></div>
        </div>

        <div style="margin-top:12px">
          <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:8px">
            <div style="font-weight:800">Файлы</div>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
              <input id="otdVaultSearch" placeholder="Поиск" style="padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff;min-width:180px" />
              <button id="otdVaultExportBtn" class="btn ghost small" type="button">Экспорт месяца</button>
              <div id="otdVaultBulkBar" style="display:none;gap:8px;align-items:center;flex-wrap:wrap"></div>
            </div>
          </div>
          <div id="otdVaultFiles" style="display:flex;flex-direction:column;gap:8px"></div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    modal = wrap;

    wrap.addEventListener('click', (e)=>{ if (e.target === wrap) close(); });
    wrap.querySelector('#otdVaultClose')?.addEventListener('click', close);
    wrap.querySelector('#otdVaultCreateFolder')?.addEventListener('click', onCreateFolder);
    wrap.querySelector('#otdVaultUploadBtn')?.addEventListener('click', onUpload);
    wrap.querySelector('#otdVaultShareToggle')?.addEventListener('click', ()=>{
      onToggleShare().catch(err=>setStatus('Ошибка: '+(err && err.message ? err.message : err)));
    });
    wrap.querySelector('#otdVaultFolderSel')?.addEventListener('change', ()=>{
      bulkReset();
      const fid = wrap.querySelector('#otdVaultFolderSel')?.value || '';
      renderFiles((vaultState && vaultState.files) ? vaultState.files : [], fid);
      renderShare(fid);
    });
    wrap.querySelector('#otdVaultFoldersToggle')?.addEventListener('click', ()=>{
      const p = wrap.querySelector('#otdVaultFoldersPanel');
      if (!p) return;
      const open = (p.style.display !== 'none');
      p.style.display = open ? 'none' : 'block';
    });
    wrap.querySelector('#otdVaultMonthSel')?.addEventListener('change', async (e)=>{
      setSelectedMonth(e.target && e.target.value ? e.target.value : curMonth());
      await syncSmart().catch(err=>setStatus('Ошибка: '+err.message));
    });
    wrap.querySelector('#otdVaultSearch')?.addEventListener('input', (e)=>{
      vaultSearchQ = String(e.target && e.target.value ? e.target.value : '').trim();
      const fid = wrap.querySelector('#otdVaultFolderSel')?.value || '';
      renderFiles((vaultState && vaultState.files) ? vaultState.files : [], fid);
    });
    wrap.querySelector('#otdVaultExportBtn')?.addEventListener('click', ()=>{
      onExportMonth();
    });

    // render month + category UI
    setTimeout(()=>{ try{ renderSmartControls(); }catch(_){ } }, 0);

    return wrap;
  }

  function open(){
    ensureModal();
    modal.style.display='flex';
    try{ renderSmartControls(); }catch(_){ }
    syncSmart().catch(err=>setStatus('Ошибка: '+err.message));
  }
  function close(){
    if(modal) modal.style.display='none';
    // exit picker mode if active
    if (vaultPickCtx){
      vaultPickCtx = null;
      if (vaultPickResolve){ try{ vaultPickResolve(false); }catch(_){ } }
      vaultPickResolve = null;
      vaultSearchQ = '';
      try{ const si = modal && modal.querySelector('#otdVaultSearch'); if(si) si.value=''; }catch(_){ }
    }
  }

  function setStatus(msg){ const el = modal && modal.querySelector('#otdVaultStatus'); if(el) el.textContent = msg||''; }

  function openPicker(opts){
    const requestId = opts && opts.requestId ? String(opts.requestId) : '';
    const suggestedMonth = opts && opts.suggestedMonth ? String(opts.suggestedMonth) : '';
    if (!requestId) return Promise.resolve(false);
    vaultPickCtx = { requestId };
    if (/^[0-9]{4}-[0-9]{2}$/.test(suggestedMonth)) setSelectedMonth(suggestedMonth);
    open();
    setStatus('Выберите файлы и нажмите “Прикрепить к запросу”.');
    return new Promise((resolve)=>{ vaultPickResolve = resolve; });
  }

  async function refresh(selectFolderId){
    setStatus('Загружаю...');
    const j = await apiJson('/api/docs/state','GET');
    const folders = j.folders || [];
    const files = j.files || [];
    vaultState = { folders, files };
    const sel = modal.querySelector('#otdVaultFolderSel');
    const cur = sel ? (sel.value || '') : '';
    if (sel){
      sel.innerHTML = folders.map(f=>`<option value="${esc(f.id)}">${esc(f.name||f.id)}</option>`).join('');
      const desired = selectFolderId || cur;
      if (desired && folders.some(f=>f.id===desired)) sel.value = desired;
      if (!sel.value && folders.length) sel.value = folders[0].id;
    }

    const folderId = sel ? sel.value : '';
    renderFiles(files, folderId);
    renderShare(folderId);
    setStatus('');
  }
  function renderFiles(allFiles, folderId){
    const box = modal.querySelector('#otdVaultFiles');
    const q = String(vaultSearchQ || '').toLowerCase();
    const list = (allFiles||[])
      .filter(f=>!folderId || f.folderId===folderId)
      .filter(f=>!q || String(f.fileName||'').toLowerCase().includes(q))
      .sort((a,b)=>(String(b.uploadedAt||'').localeCompare(String(a.uploadedAt||''))));

    lastVisibleFiles = list;

    if (!list.length){
      bulkReset();
      renderBulkBar([]);
      box.innerHTML = '<div class="muted small">Пока пусто. Загрузите сюда файлы.</div>';
      return;
    }

    // Keep selection within current folder + render toolbar
    bulkPruneToVisible(list);
    renderBulkBar(list);

    const bulkBar = modal && modal.querySelector('#otdVaultBulkBar');
    if (bulkBar){
      bulkBar.onclick = async (e)=>{
        const b = e.target && e.target.closest ? e.target.closest('button[data-bulkact]') : null;
        if (!b) return;
        const act = b.getAttribute('data-bulkact');

        if (act === 'all'){
          list.forEach(f=>bulkSelected.add(String(f.id||'')));
          renderFiles(allFiles, folderId);
          return;
        }
        if (act === 'clear'){
          bulkReset();
          renderFiles(allFiles, folderId);
          return;
        }
        if (act === 'cancelPick'){
          close();
          return;
        }
        if (act === 'attach'){
          if (!bulkSelected.size || !vaultPickCtx || !vaultPickCtx.requestId) return;
          try{
            setStatus('Прикрепляю к запросу...');
            const rid = vaultPickCtx.requestId;
            await apiJson('/api/client/requests/attach-vault','POST',{ requestId: rid, fileIds: Array.from(bulkSelected) });
            bulkReset();
            setStatus('Прикреплено');
            if (vaultPickResolve){ try{ vaultPickResolve(true); }catch(_){ } }
            vaultPickResolve = null;
            vaultPickCtx = null;
            setTimeout(()=>{ try{ close(); }catch(_){ } }, 400);
          }catch(err){
            setStatus('Ошибка: '+(err && err.message ? err.message : err));
          }
          return;
        }
        if (act === 'move'){
          if (!bulkSelected.size) return;
          showMoveDialogForIds(Array.from(bulkSelected));
          return;
        }
        if (act === 'delete'){
          if (!bulkSelected.size) return;
          const ok = confirm(TT('dialogs.delete_files', {n: bulkSelected.size}, 'Удалить выбранные файлы ({n})?'));
          if (!ok) return;
          try{
            setStatus('Удаляю...');
            await apiJson('/api/docs/files/bulk-delete','POST',{ fileIds: Array.from(bulkSelected) });
            bulkReset();
            await refresh(modal.querySelector('#otdVaultFolderSel')?.value || '');
            setStatus('Удалено');
            setTimeout(()=>setStatus(''), 900);
          }catch(err){
            setStatus('Ошибка: '+(err && err.message ? err.message : err));
          }
          return;
        }
      };
    }

    box.innerHTML = list.map(f=>{
      const dt = f.uploadedAt ? new Date(f.uploadedAt).toLocaleString() : '';
      const size = f.fileSize ? (Math.round((f.fileSize/1024)*10)/10 + ' KB') : '';
      const checked = bulkSelected.has(String(f.id||'')) ? 'checked' : '';
      return `
        <div class="card" style="padding:10px;border-radius:14px">
          <div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap">
            <div style="display:flex;gap:10px;align-items:flex-start;min-width:220px;flex:1">
              <input type="checkbox" data-bsel="1" data-fid="${esc(f.id)}" ${checked} style="margin-top:4px;transform:scale(1.08)" />
              <div>
                <div style="font-weight:800">${esc(f.fileName||'document')}</div>
                <div class="muted small" style="margin-top:4px">${esc(dt)} ${size?('• '+esc(size)):''}</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <a class="btn ghost small" href="${esc(f.fileUrl||'#')}" target="_blank" rel="noopener">Открыть</a>
              <button class="btn ghost small" type="button" data-docact="rename" data-fid="${esc(f.id)}">Имя</button>
              <button class="btn ghost small" type="button" data-docact="move" data-fid="${esc(f.id)}">Раздел</button>
              <button class="btn ghost small" type="button" data-docact="delete" data-fid="${esc(f.id)}">${TT('buttons.delete', null, 'Usuń')}</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    box.onchange = (e)=>{
      const cb = e.target && e.target.matches && e.target.matches('input[type="checkbox"][data-bsel]') ? e.target : null;
      if (!cb) return;
      const fid = cb.getAttribute('data-fid');
      if (!fid) return;
      if (cb.checked) bulkSelected.add(String(fid));
      else bulkSelected.delete(String(fid));
      renderBulkBar(list);
    };

    // One delegated handler for actions
    box.onclick = async (e)=>{
      const btn = e.target && e.target.closest ? e.target.closest('button[data-docact]') : null;
      if (!btn) return;
      const act = btn.getAttribute('data-docact');
      const fid = btn.getAttribute('data-fid');
      if (!fid) return;
      const file = (vaultState.files||[]).find(x=>String(x.id||'')===String(fid));
      if (!file) return;
      try{
        if (act === 'rename') {
          const current = String(file.fileName || 'document');
          const next = prompt('Новое имя файла', current);
          if (next === null) return;
          const name = String(next||'').trim();
          if (!name) { setStatus('Имя не может быть пустым'); return; }
          setStatus('Сохраняю имя...');
          await apiJson('/api/docs/files/rename','POST',{ fileId: fid, fileName: name });
          await refresh(modal.querySelector('#otdVaultFolderSel')?.value || '');
          setStatus('Готово');
          setTimeout(()=>setStatus(''), 900);
        }
        if (act === 'delete') {
          const ok = confirm(TT('dialogs.delete_file', null, 'Удалить файл? Он исчезнет из OneTapDay.'));
          if (!ok) return;
          setStatus('Удаляю...');
          await apiJson('/api/docs/files/delete','POST',{ fileId: fid });
          // keep bulk selection consistent
          bulkSelected.delete(String(fid));
          await refresh(modal.querySelector('#otdVaultFolderSel')?.value || '');
          setStatus('Удалено');
          setTimeout(()=>setStatus(''), 900);
        }
        if (act === 'move') {
          showMoveDialog(file);
        }
      } catch(err){
        setStatus('Ошибка: '+(err && err.message ? err.message : err));
      }
    };
  }

  // --- Move dialog (month+category or explicit folder) ---
  let moveDlg = null;
  let moveCtx = { fileIds:[], month:'', cat:'incoming', folderId:'' };

  function ensureMoveDlg(){
    if (moveDlg) return moveDlg;
    const d = document.createElement('div');
    d.id = 'otdVaultMoveDlg';
    d.style.cssText = 'position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:14px;';
    d.innerHTML = `
      <div style="width:min(520px,96vw);border-radius:18px;background:rgba(18,22,25,.94);border:1px solid rgba(255,255,255,.10);box-shadow:0 20px 80px rgba(0,0,0,.55);padding:14px">
        <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap">
          <div id="otdMoveTitle" style="font-weight:900">Переместить файл</div>
          <button id="otdMoveClose" class="btn ghost small" type="button">Закрыть</button>
        </div>

        <div class="muted small" style="margin-top:6px">Выберите новый месяц/раздел или конкретную папку.</div>

        <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div style="min-width:160px;flex:1">
            <div class="muted small" style="margin-bottom:6px">Месяц</div>
            <select id="otdMoveMonth" style="width:100%;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff"></select>
          </div>
          <div style="flex:2;min-width:220px">
            <div class="muted small" style="margin-bottom:6px">Раздел</div>
            <div id="otdMoveCats" style="display:flex;gap:8px;flex-wrap:wrap"></div>
          </div>
        </div>

        <div style="margin-top:12px">
          <div class="muted small" style="margin-bottom:6px">Или папка</div>
          <select id="otdMoveFolder" style="width:100%;padding:10px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);color:#fff"></select>
          <div class="muted small" style="opacity:.8;margin-top:6px">Если выбрана папка, она приоритетнее месяца/раздела.</div>
        </div>

        <div style="margin-top:14px;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
          <button id="otdMoveDo" class="btn" type="button">${TT('buttons.move', null, 'Przenieś')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(d);
    d.addEventListener('click', (e)=>{ if (e.target === d) hideMove(); });
    d.querySelector('#otdMoveClose')?.addEventListener('click', hideMove);
    d.querySelector('#otdMoveDo')?.addEventListener('click', ()=>{
      doMove().catch(err=>setStatus('Ошибка: '+(err && err.message ? err.message : err)));
    });
    moveDlg = d;
    return d;
  }

  function renderMoveCats(){
    const box = moveDlg.querySelector('#otdMoveCats');
    box.innerHTML = VAULT_CATS.map(cat=>{
      const active = (cat.id === moveCtx.cat);
      const cls = active ? 'btn' : 'btn secondary';
      return `<button type="button" class="${cls} small" data-mcat="${esc(cat.id)}">${esc(cat.label)}</button>`;
    }).join('');
    box.querySelectorAll('button[data-mcat]').forEach(b=>{
      b.addEventListener('click', ()=>{
        moveCtx.cat = b.getAttribute('data-mcat') || 'incoming';
        renderMoveCats();
      });
    });
  }

  function showMoveDialog(file){
    const id = String(file && file.id || '');
    if (!id) return;
    showMoveDialogForIds([id]);
  }

  function showMoveDialogForIds(ids){
    ensureMoveDlg();
    moveCtx.fileIds = Array.isArray(ids) ? ids.map(x=>String(x||'')).filter(Boolean) : [];
    const title = moveDlg.querySelector('#otdMoveTitle');
    if (title){
      const n = moveCtx.fileIds.length || 1;
      title.textContent = n === 1 ? 'Переместить файл' : ('Переместить ' + n + ' файлов');
    }
    moveCtx.month = selectedMonth || curMonth();
    moveCtx.cat = selectedCat || 'incoming';
    moveCtx.folderId = '';

    const msel = moveDlg.querySelector('#otdMoveMonth');
    const months = monthList(18);
    msel.innerHTML = months.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
    msel.value = months.includes(moveCtx.month) ? moveCtx.month : months[0];
    msel.onchange = ()=>{ moveCtx.month = msel.value || curMonth(); };

    renderMoveCats();

    const fsel = moveDlg.querySelector('#otdMoveFolder');
    const folders = (vaultState.folders||[]);
    fsel.innerHTML = `<option value="">(не выбрано)</option>` + folders.map(f=>`<option value="${esc(f.id)}">${esc(f.name||f.id)}</option>`).join('');
    fsel.onchange = ()=>{ moveCtx.folderId = fsel.value || ''; };

    moveDlg.style.display = 'flex';
  }
  function hideMove(){ if (moveDlg) moveDlg.style.display = 'none'; }

  async function doMove(){
    const fileIds = (moveCtx.fileIds||[]).map(x=>String(x||'')).filter(Boolean);
    if (!fileIds.length) return;
    setStatus('Перемещаю...');
    if (moveCtx.folderId){
      await apiJson('/api/docs/files/bulk-move','POST',{ fileIds, folderId: moveCtx.folderId });
    } else {
      await apiJson('/api/docs/files/bulk-move','POST',{ fileIds, month: moveCtx.month, category: moveCtx.cat });
    }
    hideMove();
    await refresh(modal.querySelector('#otdVaultFolderSel')?.value || '');
    setStatus('Готово');
    setTimeout(()=>setStatus(''), 900);
  }

  
  function getFolderShared(folderId){
    const fid = String(folderId||'');
    const f = (vaultState.folders||[]).find(x=>String(x.id||'')===fid);
    if (!f) return true;
    if (typeof f.sharedWithAccountant === 'boolean') return f.sharedWithAccountant;
    if (f.share && typeof f.share.accountant === 'boolean') return f.share.accountant;
    return true; // default shared
  }

  function renderShare(folderId){
    const btn = modal && modal.querySelector('#otdVaultShareToggle');
    const st = modal && modal.querySelector('#otdVaultShareState');
    if (!btn || !st) return;
    const fid = String(folderId||'');
    if (!fid){
      btn.disabled = true;
      btn.textContent = '...';
      st.textContent = '';
      return;
    }
    const shared = getFolderShared(fid);
    btn.disabled = false;
    btn.textContent = shared ? TT('vault.share_close_access', null, 'Закрыть доступ') : TT('vault.share_open_access', null, 'Открыть доступ');
    st.textContent = shared ? TT('vault.share_status_on', null, 'Бухгалтер видит эту папку') : TT('vault.share_status_off', null, 'Бухгалтер НЕ видит эту папку');
  }

  async function onToggleShare(){
    const sel = modal && modal.querySelector('#otdVaultFolderSel');
    const folderId = sel && sel.value ? sel.value : '';
    if (!folderId) { setStatus(TT('vault.share_choose_folder', null, 'Выберите папку')); return; }
    const cur = getFolderShared(folderId);
    const next = !cur;
    setStatus(next ? TT('vault.share_opening', null, 'Открываю доступ...') : TT('vault.share_closing', null, 'Закрываю доступ...'));
    await apiJson('/api/docs/folders/share', 'POST', { folderId, shared: next });
    await refresh(folderId);
    renderShare(folderId);
    setStatus(next ? TT('vault.share_opened', null, 'Доступ открыт') : TT('vault.share_closed', null, 'Доступ закрыт'));
    setTimeout(()=>setStatus(''), 1200);
  }

async function onCreateFolder(){
    const inp = modal.querySelector('#otdVaultNewFolder');
    const name = (inp.value||'').trim();
    if (!name) { setStatus('Введите имя папки'); return; }
    setStatus('Создаю папку...');
    await apiJson('/api/docs/folders/create','POST',{ name });
    inp.value='';
    await refresh();
    setStatus('Папка создана');
    setTimeout(()=>setStatus(''), 1200);
  }

  async function onUpload(){
    const sel = modal.querySelector('#otdVaultFolderSel');
    let folderId = sel && sel.value ? sel.value : '';
    if (!folderId){
      setStatus('Создаю папку...');
      try{ await syncSmart(); }catch(e){ setStatus('Ошибка: '+e.message); return; }
      folderId = (sel && sel.value) ? sel.value : '';
    }
    if (!folderId) { setStatus('Сначала создайте или выберите папку'); return; }
    const input = modal.querySelector('#otdVaultFileInput');
    const files = Array.from(input.files || []);
    if (!files.length) { setStatus('Выберите файлы'); return; }

    setStatus(`Загрузка 0/${files.length}...`);
    for (let i=0; i<files.length; i++){
      const f = files[i];
      const dataUrl = await new Promise((resolve, reject)=>{
        const r = new FileReader();
        r.onload = ()=>resolve(String(r.result||''));
        r.onerror = ()=>reject(new Error('File read error'));
        r.readAsDataURL(f);
      });
      await apiJson('/api/docs/upload','POST',{ folderId, fileName: f.name, dataUrl });
      setStatus(`Загрузка ${i+1}/${files.length}...`);
    }
    input.value='';
    await refresh();
    setStatus('Готово');
    setTimeout(()=>setStatus(''), 1200);
  }


  // Expose Vault API for other modules (e.g., Client Requests: attach from "My documents")
  try{
    window.OTD_Vault = window.OTD_Vault || {};
    window.OTD_Vault.open = open;
    window.OTD_Vault.openPicker = openPicker;
  }catch(_e){}

  function bind(){
    const btn = document.getElementById('openVaultBtn');
    if (btn && !btn.__otd_bound){
      btn.__otd_bound = true;
      btn.addEventListener('click', (e)=>{ e.preventDefault(); open(); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();