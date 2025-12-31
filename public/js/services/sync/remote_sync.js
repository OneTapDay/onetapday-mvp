// Extracted from public/js/app/app.js (lines 3432-3515)
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



