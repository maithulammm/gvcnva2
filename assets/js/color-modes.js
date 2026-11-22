"use strict";

const COLOR_MODE_KEY='VA_GVCN_COLOR_MODE';
let currentColorMode='light';

/** Chỉ ghi tùy chọn giao diện; không chạm cache dữ liệu hay phiên Microsoft. */
function applyColorMode(mode,persist=false) {
  currentColorMode=mode==='dark'?'dark':'light';
  document.documentElement?.setAttribute('data-bs-theme',currentColorMode);
  const dark=currentColorMode==='dark',label=dark?'Bật giao diện sáng':'Bật giao diện tối';
  const button=document.getElementById('themeToggle');
  if(button){button.setAttribute('aria-pressed',String(dark));button.setAttribute('aria-label',label);button.title=label;}
  const icon=document.getElementById('themeIcon'),text=document.getElementById('themeLabel');
  if(icon)icon.innerHTML=dark?
    '<svg class="bi bi-sun" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8m0 1a3 3 0 1 1 0 6 3 3 0 0 1 0-6M8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0m0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13M0 8a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2A.5.5 0 0 1 0 8m13 0a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2A.5.5 0 0 1 13 8M2.343 2.343a.5.5 0 0 1 .707 0l1.415 1.414a.5.5 0 0 1-.708.708L2.343 3.05a.5.5 0 0 1 0-.707m9.192 9.192a.5.5 0 0 1 .708 0l1.414 1.415a.5.5 0 0 1-.707.707l-1.415-1.414a.5.5 0 0 1 0-.708M13.657 2.343a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 0 1-.708-.708l1.415-1.414a.5.5 0 0 1 .707 0M4.465 11.535a.5.5 0 0 1 0 .708L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.415a.5.5 0 0 1 .708 0"/></svg>':
    '<svg class="bi bi-moon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M6 .278a.77.77 0 0 1 .08.858 7.2 7.2 0 0 0-.878 3.46c0 4.022 3.278 7.281 7.318 7.281q.792 0 1.533-.16a.79.79 0 0 1 .81.316.73.73 0 0 1-.031.893A8.35 8.35 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.75.75 0 0 1 6 .278M4.858 1.311A7.27 7.27 0 0 0 1.025 7.71c0 4.02 3.279 7.28 7.319 7.28a7.32 7.32 0 0 0 5.205-2.162q-.506.062-1.029.063c-4.61 0-8.343-3.714-8.343-8.291 0-1.167.242-2.279.681-3.286"/></svg>';
  if(text)text.textContent=label;
  if(persist)try{localStorage.setItem(COLOR_MODE_KEY,currentColorMode);}catch{/* Vẫn đổi được khi trình duyệt chặn lưu trữ. */}
}
function toggleColorMode(){applyColorMode(currentColorMode==='light'?'dark':'light',true);}

// Mặc định sáng kể cả thiết bị đang dùng chế độ tối; chỉ khôi phục lựa chọn rõ ràng của GV.
try{applyColorMode(localStorage.getItem(COLOR_MODE_KEY));}catch{applyColorMode('light');}
window.addEventListener?.('storage',event=>{if(event.key===COLOR_MODE_KEY)applyColorMode(event.newValue);});
