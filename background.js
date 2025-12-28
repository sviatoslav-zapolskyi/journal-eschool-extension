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
