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
      console.log('[SUBMENU_SELECT]', message.mode, '->', message.label, 'id=', message.id, message.item || '');
    } catch (e) {}

    // Try to create a Google Sheet named by the part id (message.id)
    const partId = message.id != null ? String(message.id) : null;
    const submenuLabel = message.label || partId || 'export';
    const makeSpreadsheetTitle = (label) => {
      const iso = new Date().toISOString().replace(/:/g, '-');
      return `Export - ${label} - ${iso}`;
    };
    if (!partId) {
      console.warn('No part id provided, skipping sheet creation');
      return false;
    }
      // First try using a user-provided token stored in chrome.storage.local
      try {
        chrome.storage.local.get(['user_sheets_token'], (res) => {
          const stored = res?.user_sheets_token;
          if (stored) {
            // try using stored token
            (async () => {
              try {
                const body = {
                  properties: { title: makeSpreadsheetTitle(submenuLabel) },
                  sheets: [{ properties: { title: partId } }]
                };
                const r = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
                  method: 'POST',
                  headers: {
                    'Authorization': 'Bearer ' + stored,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(body)
                });
                if (r.ok) {
                  const created = await r.json();
                  console.log('Created spreadsheet (using stored token)', created.spreadsheetUrl, created.spreadsheetId);
                  // open the created spreadsheet in a new tab (popup may be closed)
                  try {
                    if (created && created.spreadsheetUrl) {
                      chrome.tabs.create({ url: created.spreadsheetUrl }, (tab) => {
                        if (chrome.runtime.lastError) console.warn('Failed to open sheet tab (stored_token):', chrome.runtime.lastError.message);
                      });
                    }
                  } catch (e) {
                    console.warn('Error opening sheet tab (stored_token)', e);
                  }
                  try {
                    chrome.runtime.sendMessage({ type: 'SHEET_CREATED', spreadsheetId: created.spreadsheetId, url: created.spreadsheetUrl, partId, via: 'stored_token' }, () => {
                      if (chrome.runtime.lastError) console.warn('SHEET_CREATED message failed (stored_token):', chrome.runtime.lastError.message);
                    });
                  } catch (e) {
                    console.warn('Failed to send SHEET_CREATED (stored_token)', e);
                  }
                  return;
                } else {
                  const txt = await r.text();
                  console.error('Stored token Sheets create failed', r.status, txt);
                  // fallthrough to identity flow
                }
              } catch (err) {
                console.error('Error using stored token for Sheets', err);
              }

              // If stored token failed, try identity flow next
              tryIdentityFlow(partId);
            })();
          } else {
            // no stored token — use identity flow
            tryIdentityFlow(partId);
          }
        });
      } catch (e) {
        console.error('Error reading stored token', e);
        tryIdentityFlow(partId);
      }

      function tryIdentityFlow(partIdLocal) {
        // Acquire OAuth token (requires `identity` permission and oauth2 client in manifest)
        if (!chrome.identity || !chrome.identity.getAuthToken) {
          console.error('chrome.identity.getAuthToken is not available. Ensure `identity` permission and `oauth2` are set in manifest.json.');
          return false;
        }
        chrome.identity.getAuthToken({ interactive: true }, async (token) => {
          if (chrome.runtime.lastError || !token) {
            console.error('Failed to get auth token', chrome.runtime.lastError);
            return;
          }

          try {
            const body = {
              properties: { title: makeSpreadsheetTitle(submenuLabel) },
              sheets: [{ properties: { title: partIdLocal } }]
            };

            const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(body)
            });

            if (!res.ok) {
              const text = await res.text();
              console.error('Sheets create failed', res.status, text);
              return;
            }

            const created = await res.json();
            console.log('Created spreadsheet', created.spreadsheetUrl, created.spreadsheetId);

            // notify popup about created sheet
            // open the created spreadsheet in a new tab (popup may be closed)
            try {
              if (created && created.spreadsheetUrl) {
                chrome.tabs.create({ url: created.spreadsheetUrl }, (tab) => {
                  if (chrome.runtime.lastError) console.warn('Failed to open sheet tab (identity):', chrome.runtime.lastError.message);
                });
              }
            } catch (e) {
              console.warn('Error opening sheet tab (identity)', e);
            }
            try {
              chrome.runtime.sendMessage({ type: 'SHEET_CREATED', spreadsheetId: created.spreadsheetId, url: created.spreadsheetUrl, partId: partIdLocal, via: 'identity' }, () => {
                if (chrome.runtime.lastError) console.warn('SHEET_CREATED message failed (identity):', chrome.runtime.lastError.message);
              });
            } catch (e) {
              console.warn('Failed to send SHEET_CREATED (identity)', e);
            }
          } catch (err) {
            console.error('Error creating sheet', err);
          }
        });
      }
  }
  return false;
});
