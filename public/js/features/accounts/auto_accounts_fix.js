// Extracted from public/js/app/app.js (lines 1665-1712)
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
