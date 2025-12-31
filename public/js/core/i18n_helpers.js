// Extracted from public/js/app/app.js (lines 17-38)
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

