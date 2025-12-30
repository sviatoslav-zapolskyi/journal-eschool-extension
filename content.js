const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

const handlers = Object.create(null);

let isFetchingProfile = false;

// =====================
// FETCH_PROFILE
// =====================
handlers.FETCH_PROFILE = () => {
  if (isFetchingProfile) return;

  const apiKey = localStorage.getItem('__api_key_value__');
  if (!apiKey) {
    chrome.runtime.sendMessage({
      type: 'PROFILE_ERROR',
      error: 'api-key not found'
    });
    return;
  }

  isFetchingProfile = true;

  fetch('https://api.eschool-ua.com/profile', {
    headers: { 'api-key': apiKey },
    credentials: 'include'
  })
    .then(res => {
      if (res.status === 403) {
        window.location.href = 'https://sep.eschool-ua.com/auth';
        throw new Error('Unauthorized');
      }
      return res.json();
    })
    .then(profile => {
      chrome.runtime.sendMessage({
        type: 'PROFILE_DATA',
        firstName: profile.FirstName,
        secondName: profile.SecondName,
        lastName: profile.LastName
      });
    })
    .catch(err => {
      chrome.runtime.sendMessage({
        type: 'PROFILE_ERROR',
        error: err.toString()
      });
    })
    .finally(() => {
      isFetchingProfile = false;
    });
};

// =====================
// MESSAGE DISPATCHER
// =====================
chrome.runtime.onMessage.addListener((message) => {
  const handler = handlers[message.type];

  if (!handler) {
    console.warn('[content] unknown message type:', message.type);
    return false;
  }

  handler(message);
  return false;
});
