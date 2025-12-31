// Extracted from public/js/app/app.js (lines 4368-4396)
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

