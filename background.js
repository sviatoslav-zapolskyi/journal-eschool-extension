chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
        console.log(details);
        if (!details.requestHeaders) return;

        console.log('listener not returned');

        const apiKeyHeader = details.requestHeaders.find((h) => h.name.toLowerCase() === 'api-key');

        if (apiKeyHeader?.value) {
            console.log('[api-key]', apiKeyHeader.value, '→', details.url);
        }
    },
    {
        urls: ['https://journal.eschool-ua.com/*'],
    },
    ['requestHeaders']
);

let pendingSchoolboysRequests = {}; // No longer needed, but keeping for now if other uses

async function appendStudentData(spreadsheetId, sheetTitle, token, students) {
    if (students.length === 0) return;

    const values = [['Прізвище', "Ім'я"], ...students.map((s) => [s.LastName || '', s.FirstName || ''])];

    const appendBody = {
        values,
        majorDimension: 'ROWS',
    };

    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetTitle}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(appendBody),
        });

        if (res.ok) {
            console.log('Student data appended to sheet');
        } else {
            const text = await res.text();
            console.error('Failed to append student data:', res.status, text);
        }
    } catch (err) {
        console.error('Error appending student data:', err);
    }
}

function makeSpreadsheetTitle(label) {
    return `${label} - ${new Date().toLocaleString()}`;
}

async function createAndPopulateSheet(partId, label, students, token, via) {
    const title = makeSpreadsheetTitle(label);
    const body = {
        properties: { title },
        sheets: [{ properties: { title: partId } }],
    };

    try {
        const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`HTTP ${res.status}: ${text}`);
        }

        const created = await res.json();
        console.log(`Created spreadsheet (${via})`, created.spreadsheetUrl, created.spreadsheetId);

        // open the created spreadsheet in a new tab
        try {
            if (created && created.spreadsheetUrl) {
                chrome.tabs.create({ url: created.spreadsheetUrl }, (tab) => {
                    if (chrome.runtime.lastError) console.warn(`Failed to open sheet tab (${via}):`, chrome.runtime.lastError.message);
                });
            }
        } catch (e) {
            console.warn(`Error opening sheet tab (${via})`, e);
        }

        // notify popup about created sheet
        try {
            chrome.runtime.sendMessage(
                {
                    type: 'SHEET_CREATED',
                    spreadsheetId: created.spreadsheetId,
                    url: created.spreadsheetUrl,
                    partId,
                    via,
                },
                () => {
                    if (chrome.runtime.lastError) console.warn(`SHEET_CREATED message failed (${via}):`, chrome.runtime.lastError.message);
                }
            );
        } catch (e) {
            console.warn(`Failed to send SHEET_CREATED (${via})`, e);
        }

        // append student data if any
        await appendStudentData(created.spreadsheetId, partId, token, students);
    } catch (err) {
        console.error(`Error creating sheet (${via}):`, err);
    }
}

function handleExport(partId, label, students, item) {
    if (!partId) {
        console.warn('No part id provided, skipping sheet creation');
        return;
    }

    // First try using a user-provided token stored in chrome.storage.local
    chrome.storage.local.get(['user_sheets_token'], (res) => {
        const stored = res?.user_sheets_token;
        if (stored) {
            // try using stored token
            (async () => {
                try {
                    await createAndPopulateSheet(partId, label, students, stored, 'stored_token');
                    return;
                } catch (err) {
                    console.error('Stored token failed, trying identity');
                }

                // If stored token failed, try identity flow next
                tryIdentityFlow(partId, label, students);
            })();
        } else {
            // no stored token — use identity flow
            tryIdentityFlow(partId, label, students);
        }
    });

    function tryIdentityFlow(partIdLocal, labelLocal, studentsLocal) {
        // Acquire OAuth token
        if (!chrome.identity || !chrome.identity.getAuthToken) {
            console.error('chrome.identity.getAuthToken is not available. Ensure `identity` permission and `oauth2` are set in manifest.json.');
            return;
        }
        chrome.identity.getAuthToken({ interactive: true }, async (token) => {
            if (chrome.runtime.lastError || !token) {
                console.error('Failed to get auth token', chrome.runtime.lastError);
                return;
            }

            try {
                await createAndPopulateSheet(partIdLocal, labelLocal, studentsLocal, token, 'identity');
            } catch (err) {
                console.error('Error in identity flow', err);
            }
        });
    }
}

chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.type === 'POPUP_DIMENSIONS') {
        console.log('[popup dims]', message.payload, 'from', sender?.id || sender?.tab?.id || 'popup');
    }

    // No API_KEY_DATA handler needed now

    if (message?.type === 'SUBMENU_SELECT') {
        try {
            console.log('[SUBMENU_SELECT]', message.mode, '->', message.label, 'id=', message.id, message.item || '');
        } catch (e) {}

        if (message.mode === 'export') {
            const partId = message.id != null ? String(message.id) : null;
            const submenuLabel = message.label || partId || 'export';
            const item = message.item;

            if (!partId) {
                console.warn('No part id provided, skipping sheet creation');
                return false;
            }

            const schoolboysHref = item?.Links?.Schoolboys?.Href;

            if (schoolboysHref && item) {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs.length > 0) {
                        const tab = tabs[0];
                        if (tab.url && tab.url.includes('journal.eschool-ua.com')) {
                            const tabId = tab.id;
                            // First get apiKey from content script
                            chrome.tabs.sendMessage(tabId, { type: 'GET_API_KEY' }, (response) => {
                                if (chrome.runtime.lastError) {
                                    console.error('Failed to get apiKey:', chrome.runtime.lastError.message);
                                    handleExport(partId, submenuLabel, [], item);
                                    return;
                                }
                                const apiKey = response?.apiKey;
                                if (!apiKey) {
                                    console.warn('No apiKey received, creating empty sheet');
                                    handleExport(partId, submenuLabel, [], item);
                                    return;
                                }
                                // Fetch schoolboys in background
                                fetch(schoolboysHref, {
                                    method: 'GET',
                                    headers: { 'api-key': apiKey },
                                    credentials: 'include',
                                })
                                    .then((res) => {
                                        if (!res.ok) {
                                            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                                        }
                                        return res.json();
                                    })
                                    .then((schoolboys) => {
                                        console.log('[background] Schoolboys fetched:', schoolboys);
                                        const students = schoolboys?.Items || [];
                                        console.log(
                                            '[background] Students data:',
                                            students.map((s) => ({ lastName: s.LastName, firstName: s.FirstName }))
                                        );
                                        handleExport(partId, submenuLabel, students, item);
                                    })
                                    .catch((err) => {
                                        console.error('Fetch schoolboys error in background:', err);
                                        handleExport(partId, submenuLabel, [], item);
                                    });
                            });
                        } else {
                            console.warn('Active tab is not journal page, creating empty sheet');
                            handleExport(partId, submenuLabel, [], item);
                        }
                    } else {
                        // No active tab, create empty sheet
                        handleExport(partId, submenuLabel, [], item);
                    }
                });
            } else {
                // No schoolboys href, create empty sheet
                handleExport(partId, submenuLabel, [], item);
            }
        }
    }
    return false;
});
