(function () {
  const STORAGE_API_KEY_VALUE = '__api_key_value__';
  const STORAGE_API_KEY_UPDATED_AT = '__api_key_updated_at__';

  function readApiKey() {
    return localStorage.getItem(STORAGE_API_KEY_VALUE);
  }

  function saveApiKeyIfChanged(newKey, source) {
    try {
      const storedKey = readApiKey();

      if (storedKey === newKey) {
        return; // ключ не змінився
      }

      localStorage.setItem(STORAGE_API_KEY_VALUE, newKey);
      localStorage.setItem(STORAGE_API_KEY_UPDATED_AT, Date.now().toString());

      console.log(`renewed api-key: ${newKey}`)

    } catch (e) {
      console.warn('[api-key] localStorage error', e);
    }
  }

  // ---------- FETCH ----------
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const [input, init] = args;
    const url = typeof input === 'string' ? input : input?.url;

    if (url && url.includes('journal.eschool-ua.com')) {
      const headers = init?.headers;

      let apiKey =
        headers?.['api-key'] ||
        headers?.['Api-Key'] ||
        headers?.get?.('api-key');

      if (apiKey) {
        saveApiKeyIfChanged(apiKey, 'fetch');
      }
    }

    return originalFetch.apply(this, args);
  };

  // ---------- XHR ----------
  const XHRSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  const XHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    this._headers = this._headers || {};
    this._headers[name.toLowerCase()] = value;
    return XHRSetHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    const apiKey = this._headers?.['api-key'];

    if (apiKey) {
      saveApiKeyIfChanged(apiKey, 'xhr');
    }

    return XHRSend.apply(this, arguments);
  };
})();
