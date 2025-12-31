// Extracted from public/js/app/app.js (lines 39-74)
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


