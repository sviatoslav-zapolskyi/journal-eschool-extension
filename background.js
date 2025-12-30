chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    console.log(details)
    if (!details.requestHeaders) return;

    console.log('listener not returned')

    const apiKeyHeader = details.requestHeaders.find(
      h => h.name.toLowerCase() === 'api-key'
    );

    if (apiKeyHeader?.value) {
      console.log(
        '[api-key]',
        apiKeyHeader.value,
        '→',
        details.url
      );
    }
  },
  {
    urls: ['https://journal.eschool-ua.com/*']
  },
  ['requestHeaders']
);

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'POPUP_DIMENSIONS') {
    console.log('[popup dims]', message.payload, 'from', sender?.id || sender?.tab?.id || 'popup');
  }
  if (message?.type === 'SUBMENU_SELECT') {
    try {
      console.log('[SUBMENU_SELECT]', message.mode, '->', message.label, message.item || '');
    } catch (e) {}
  }
  return false;
});
