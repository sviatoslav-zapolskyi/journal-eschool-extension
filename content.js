const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

chrome.runtime.onMessage.addListener((message, sender) => {
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
    credentials: 'include' // cookies з браузера
  })
    .then(res => res.json())
    .then(data => {
      chrome.runtime.sendMessage({
        type: 'PROFILE_DATA',
        firstName: data.FirstName,
        secondName: data.SecondName,
        lastName: data.LastName
      });
    })
    .catch(err => {
      console.error('[profile]', err);
      chrome.runtime.sendMessage({
        type: 'PROFILE_ERROR',
        error: err.toString()
      });
    });
});
