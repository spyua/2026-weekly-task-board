// ============================================================
// APP — Theme & Initialization
// ============================================================
const THEME_KEY = 'spyua_theme';

function initTheme(){
  const saved=localStorage.getItem(THEME_KEY);
  if(saved==='light') document.documentElement.setAttribute('data-theme','light');
}

function toggleTheme(){
  const isLight=document.documentElement.getAttribute('data-theme')==='light';
  if(isLight){
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem(THEME_KEY,'dark');
  }else{
    document.documentElement.setAttribute('data-theme','light');
    localStorage.setItem(THEME_KEY,'light');
  }
  render();
}

// --- Boot ---
initTheme();
STATE = loadLocal();
render();
