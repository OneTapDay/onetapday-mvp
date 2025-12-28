// public/i18n_pack/i18n.js
// Lightweight i18n engine for OneTapDay (PL default). Supports:
// - data-i18n (textContent)
// - data-i18n-ph (placeholder)
// - data-i18n-title (title)
// - data-i18n-aria (aria-label)
// - data-i18n-value (value)
// - nested keys via dot-notation
// - {var} interpolation
// Persists selected language to localStorage (otd_lang) and to server (POST /api/user/lang) when logged-in.

(function () {
  const LS_KEY = 'otd_lang';
const I18N_VER = '2025-12-28-03'; // cache-bust
  const DEFAULT_LANG = 'pl';
  const SUPPORTED = new Set(['pl','en','ru','uk']);

  function normLang(l){
    const v = String(l || '').toLowerCase().trim();
    return SUPPORTED.has(v) ? v : DEFAULT_LANG;
  }

  function getByPath(obj, path){
    if (!obj || !path) return undefined;
    const parts = String(path).split('.');
    let cur = obj;
    for (const p of parts){
      if (!cur || typeof cur !== 'object') return undefined;
      cur = cur[p];
    }
    return cur;
  }

  function interpolate(str, vars){
    if (!vars) return str;
    return String(str).replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
  }

  async function safeFetchJSON(url){
    try{
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) return { ok:false, status:r.status, data:null };
      const data = await r.json();
      return { ok:true, status:r.status, data };
    } catch(e){
      return { ok:false, status:0, data:null };
    }
  }

  async function persistLangToServer(lang){
    try{
      const r = await fetch('/api/user/lang', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ lang })
      });
      // 401 is normal on unauth pages
      return r.ok;
    } catch(e){
      return false;
    }
  }

  const i18n = {
    lang: DEFAULT_LANG,
    data: {},
    async load(l) {
      const lang = normLang(l);
      i18n.lang = lang;
      localStorage.setItem(LS_KEY, lang);

      try {
        const res = await fetch(`/i18n_pack/i18n/${lang}.json?v=${encodeURIComponent(I18N_VER)}`, { credentials: 'same-origin', cache: 'no-store' });
        if (!res.ok) throw new Error('Missing i18n JSON for ' + lang);
        i18n.data = await res.json();
      } catch (e) {
        console.warn('[i18n] load failed', e);
        if (lang !== DEFAULT_LANG) {
          return i18n.load(DEFAULT_LANG);
        }
      }

      i18n.apply();
      try{ document.dispatchEvent(new CustomEvent('otd:lang', { detail: { lang: i18n.lang } })); }catch(e){}
      // best-effort persistence (no blocking)
      persistLangToServer(lang);
      return true;
    },
    t(key, vars){
      const v = getByPath(i18n.data, key);
      if (v === undefined || v === null) return key;
      if (typeof v === 'string') return interpolate(v, vars);
      return v;
    },
    apply(){
      const q = (sel) => Array.from(document.querySelectorAll(sel));

      q('[data-i18n]').forEach(el => {
        const k = el.getAttribute('data-i18n');
        const v = i18n.t(k);
        if (typeof v === 'string' && v !== k) el.textContent = v;
      });

      q('[data-i18n-ph]').forEach(el => {
        const k = el.getAttribute('data-i18n-ph');
        const v = i18n.t(k);
        if (typeof v === 'string' && v !== k) el.setAttribute('placeholder', v);
      });

      q('[data-i18n-title]').forEach(el => {
        const k = el.getAttribute('data-i18n-title');
        const v = i18n.t(k);
        if (typeof v === 'string' && v !== k) el.setAttribute('title', v);
      });

      q('[data-i18n-aria]').forEach(el => {
        const k = el.getAttribute('data-i18n-aria');
        const v = i18n.t(k);
        if (typeof v === 'string' && v !== k) el.setAttribute('aria-label', v);
      });

      q('[data-i18n-value]').forEach(el => {
        const k = el.getAttribute('data-i18n-value');
        const v = i18n.t(k);
        if (typeof v === 'string' && v !== k) el.value = v;
      });

      // also update document language attribute
      document.documentElement.setAttribute('lang', i18n.lang);
    },
    async init(){
      // Prefer local selection, then server account language (if logged in)
      const local = normLang(localStorage.getItem(LS_KEY));
      i18n.lang = local;

      // attempt to read account settings
      const me = await safeFetchJSON('/me');
      if (me.ok && me.data && me.data.user && me.data.user.lang) {
        const accLang = normLang(me.data.user.lang);
        if (accLang !== local) {
          localStorage.setItem(LS_KEY, accLang);
          return i18n.load(accLang);
        }
      }
      return i18n.load(local);
    }
  };

  window.i18n = i18n;

  document.addEventListener('DOMContentLoaded', () => {
    // language buttons anywhere in the app: <button data-lang="pl">PL</button>
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-lang]') : null;
      if (!btn) return;
      const lang = btn.getAttribute('data-lang');
      if (!lang) return;
      e.preventDefault();
      i18n.load(lang);
    });

    i18n.init();
  });
})();