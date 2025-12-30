const menu = document.getElementById('menu');
const importBtn = document.getElementById('importBtn');
const exportBtn = document.getElementById('exportBtn');
const lastNameEl = document.getElementById('lastName');
const submenu = document.getElementById('submenu');

let partsItems = [];
let hideTimeout = null;
let prevMenuWidth = null;
let activeMain = null; // 'import' | 'export' | null

// Reserve space early on popup open so Chrome sizes the popup appropriately
document.addEventListener('DOMContentLoaded', () => {
  try {
    const preferWidth = 480; // conservative width to fit submenu by default
    const maxAllowed = Math.max(200, window.innerWidth - 16);
    const target = Math.min(preferWidth, maxAllowed);
    menu.style.width = `${target}px`;
    document.body.style.width = `${target}px`;
    // reserve vertical space: set popup height = 3 * current menu height (clamped to viewport)
    setTimeout(() => {
      try {
        const menuH = menu.clientHeight || 80;
        const desired = Math.min(window.innerHeight - 16, menuH * 3);
        menu.style.minHeight = `${menuH}px`;
        document.body.style.height = `${desired}px`;
        // send dimensions to background for inspection (avoid opening DevTools which closes popup)
        try {
          chrome.runtime.sendMessage({
            type: 'POPUP_DIMENSIONS',
            payload: {
              windowInner: { w: window.innerWidth, h: window.innerHeight },
              bodyClient: { w: document.body.clientWidth, h: document.body.clientHeight },
              menuClient: { w: menu.clientWidth, h: menu.clientHeight },
              submenuOffset: { w: submenu.offsetWidth, h: submenu.offsetHeight }
            }
          });
        } catch (e) { /* ignore */ }
      } catch (e) { /* ignore */ }
    }, 0);
  } catch (e) {
    // ignore
  }
});

// also send dimensions each time submenu is shown
const sendDims = () => {
  try {
    chrome.runtime.sendMessage({
      type: 'POPUP_DIMENSIONS',
      payload: {
        windowInner: { w: window.innerWidth, h: window.innerHeight },
        bodyClient: { w: document.body.clientWidth, h: document.body.clientHeight },
        menuClient: { w: menu.clientWidth, h: menu.clientHeight },
        submenuOffset: { w: submenu.offsetWidth, h: submenu.offsetHeight }
      }
    });
  } catch (e) { /* ignore */ }
};

function fetchProfile() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, {
      type: 'FETCH_PROFILE'
    });
  });
}

// отримуємо відповідь від content script
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'PROFILE_DATA') {
    lastNameEl.textContent = `${message.lastName} ${message.firstName[0]}.  ${message.secondName[0]}.` || '—';
  }

  if (message.type === 'PARTS_DATA') {
    partsItems = Array.isArray(message.items) ? message.items : [];
  }

  if (message.type === 'PARTS_ERROR') {
    console.warn('Parts fetch error:', message.error);
    partsItems = [];
  }

  if (message.type === 'PROFILE_ERROR') {
    lastNameEl.textContent = 'Error';
  }
});

importBtn.addEventListener('click', fetchProfile);
exportBtn.addEventListener('click', fetchProfile);

function renderSubmenu(items, mode) {
  submenu.innerHTML = '';
  items.forEach(it => {
    const subject = it.Subject || `#${it.Id}`;
    const className = it.Class || '—';
    const title = it.Title || '';
    const text = `${subject}: ${className} (${title})`;
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.addEventListener('click', () => {
      const submenuLabel = `${subject}: ${className} (${title})`;
      // log locally (visible in popup DevTools) and notify background
      try { console.log(`${mode} -> ${submenuLabel}`); } catch (e) {}
      chrome.runtime.sendMessage({ type: 'SUBMENU_SELECT', mode, label: submenuLabel, item: it });
      hideSubmenu();
    });
    submenu.appendChild(btn);
  });
}

function showSubmenuFor(button, mode) {
  if (!partsItems || !partsItems.length) return;
  renderSubmenu(partsItems, mode);
  const rect = button.getBoundingClientRect();

  // show then measure so we can align relative to viewport
  submenu.classList.add('visible');
  submenu.setAttribute('aria-hidden', 'false');
  submenu.dataset.mode = mode;

  // report dimensions after rendering submenu
  setTimeout(sendDims, 0);

  // ensure submenu width respects max-width in CSS
  const submenuWidth = Math.min(submenu.offsetWidth || 220, 320);
  const submenuHeight = submenu.offsetHeight || 40;

  // ensure popup (body) is wide enough to show menu + submenu side-by-side
  try {
    const neededWidth = menu.offsetWidth + submenuWidth + 24; // extra padding
    const maxAllowed = Math.max(0, window.innerWidth - 16);
    const targetWidth = Math.min(neededWidth, maxAllowed);
    const menuCurrent = menu.clientWidth || 0;
    if (targetWidth > menuCurrent) {
      prevMenuWidth = menu.style.width || '';
      menu.style.width = `${targetWidth}px`;
    }
  } catch (e) {
    // ignore failures
  }

  // Try to position to the right of the button first
  // Prefer right side if there is enough room, otherwise use left side.
  const rightSpace = window.innerWidth - rect.right - 8;
  const leftSpace = rect.left - 8;
  let left;
  if (rightSpace >= submenuWidth) {
    left = rect.right + 8;
  } else if (leftSpace >= submenuWidth) {
    left = rect.left - submenuWidth - 8;
  } else {
    // neither side fully fits; choose side with more space and clamp inside viewport
    if (rightSpace >= leftSpace) {
      left = rect.right + 8;
    } else {
      left = Math.max(8, rect.left - submenuWidth - 8);
    }
  }

  // vertically center to the button
  let top = rect.top + (rect.height - submenuHeight) / 2;
  if (top < 8) top = 8;
  const maxTop = Math.max(8, window.innerHeight - submenuHeight - 8);
  if (top > maxTop) top = maxTop;

  submenu.style.left = `${Math.round(left)}px`;
  submenu.style.top = `${Math.round(top)}px`;
}

function hideSubmenuSoon() {
  clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => {
    submenu.classList.remove('visible');
    submenu.setAttribute('aria-hidden', 'true');
    // restore menu width if we changed it
    if (prevMenuWidth !== null) {
      menu.style.width = prevMenuWidth;
      prevMenuWidth = null;
    }
  }, 200);
}

function hideSubmenu() {
  clearTimeout(hideTimeout);
  submenu.classList.remove('visible');
  submenu.setAttribute('aria-hidden', 'true');
  activeMain = null;
  setActiveButton(null);
  // restore menu width if we changed it
  if (prevMenuWidth !== null) {
    menu.style.width = prevMenuWidth;
    prevMenuWidth = null;
  }
}

function onMainHover(button, mode) {
  if (activeMain !== mode) {
    showSubmenuFor(button, mode);
    activeMain = mode;
    setActiveButton(mode);
  }
}

function setActiveButton(mode) {
  importBtn.classList.toggle('active', mode === 'import');
  exportBtn.classList.toggle('active', mode === 'export');
}

importBtn.addEventListener('mouseenter', () => onMainHover(importBtn, 'import'));
exportBtn.addEventListener('mouseenter', () => onMainHover(exportBtn, 'export'));

// Hide submenu when clicking outside menu and submenu
document.addEventListener('click', (event) => {
  if (!menu.contains(event.target) && !submenu.contains(event.target)) {
    hideSubmenu();
    window.close();
  }
});

// закриття popup
document.addEventListener('click', (event) => {
  if (!menu.contains(event.target)) {
    window.close();
  }
});

// одразу при відкритті popup
fetchProfile();
