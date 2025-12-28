const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'FETCH_PROFILE') return;

  const apiKey = localStorage.getItem('__api_key_value__');

  if (!apiKey) {
    chrome.runtime.sendMessage({
      type: 'PROFILE_ERROR',
      error: 'api-key not found'
    });
    return;
  }

  fetch('https://api.eschool-ua.com/profile', {
    method: 'GET',
    headers: {
      'api-key': apiKey
    },
    credentials: 'include'
  })
    .then(async (response) => {
      // 🔴 403 → редирект
      if (response.status === 403) {
        console.warn('[profile] 403 → redirect to auth');

        window.location.href = 'https://sep.eschool-ua.com/auth';

        chrome.runtime.sendMessage({
          type: 'PROFILE_ERROR',
          error: 'Unauthorized'
        });

        return null;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json();
    })
    .then((data) => {
      if (!data) return;

      chrome.runtime.sendMessage({
        type: 'PROFILE_DATA',
        firstName: data.FirstName,
        secondName: data.SecondName,
        lastName: data.LastName
      });
    })
    .catch((err) => {
      console.error('[profile]', err);
      chrome.runtime.sendMessage({
        type: 'PROFILE_ERROR',
        error: err.toString()
      });
    });
});
