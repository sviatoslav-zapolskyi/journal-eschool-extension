const menu = document.getElementById('menu');
const importBtn = document.getElementById('importBtn');
const exportBtn = document.getElementById('exportBtn');
const lastNameEl = document.getElementById('lastName');

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

  if (message.type === 'PROFILE_ERROR') {
    lastNameEl.textContent = 'Error';
  }
});

importBtn.addEventListener('click', fetchProfile);
exportBtn.addEventListener('click', fetchProfile);

// закриття popup
document.addEventListener('click', (event) => {
  if (!menu.contains(event.target)) {
    window.close();
  }
});

// одразу при відкритті popup
fetchProfile();
