// Extracted from public/js/app/app.js (lines 3318-3431)
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



