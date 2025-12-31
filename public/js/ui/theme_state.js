// Extracted from public/js/app/app.js (lines 75-96)
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

