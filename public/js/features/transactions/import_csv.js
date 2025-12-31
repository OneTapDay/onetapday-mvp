// Extracted from public/js/app/app.js (lines 413-718)
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


