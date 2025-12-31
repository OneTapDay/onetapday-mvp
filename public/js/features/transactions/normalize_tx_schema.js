// Extracted from public/js/app/app.js (lines 1713-1831)
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
