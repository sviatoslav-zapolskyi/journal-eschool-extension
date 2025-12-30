const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

const handlers = Object.create(null);

let isFetchingProfile = false;

// Auto-fetch profile/parts shortly after script injection on journal pages
if (location.hostname && location.hostname.endsWith('journal.eschool-ua.com')) {
    setTimeout(() => {
        try {
            handlers.FETCH_PROFILE && handlers.FETCH_PROFILE();
        } catch (e) {
            /* ignore */
        }
    }, 200);
}

// =====================
// FETCH_PROFILE
// =====================
handlers.FETCH_PROFILE = () => {
    if (isFetchingProfile) return;

    // If we have cached profile/parts in page localStorage, send them immediately
    try {
        const cached = localStorage.getItem('__cached_profile__');
        if (cached) {
            const p = JSON.parse(cached);
            chrome.runtime.sendMessage({
                type: 'PROFILE_DATA',
                firstName: p.FirstName,
                secondName: p.SecondName,
                lastName: p.LastName,
                partsHref: p?.Links?.Parts?.Href || null,
            });
            const cachedParts = localStorage.getItem('__cached_parts__');
            if (cachedParts) {
                try {
                    const partsObj = JSON.parse(cachedParts);
                    const items = partsObj?.Items || partsObj || [];
                    chrome.runtime.sendMessage({ type: 'PARTS_DATA', items: Array.isArray(items) ? items : [] });
                } catch (e) {
                    /* ignore */
                }
            }
        }
    } catch (e) {
        /* ignore parse errors */
    }

    const apiKey = localStorage.getItem('__api_key_value__');
    if (!apiKey) {
        // if no apiKey, and we already sent cached data above, do nothing; otherwise signal error
        const hadCache = !!localStorage.getItem('__cached_profile__');
        if (hadCache) return;
        chrome.runtime.sendMessage({ type: 'PROFILE_ERROR', error: 'api-key not found' });
        return;
    }

    isFetchingProfile = true;

    fetch('https://api.eschool-ua.com/profile', {
        headers: { 'api-key': apiKey },
        credentials: 'include',
    })
        .then((res) => {
            if (res.status === 403) {
                window.location.href = 'https://sep.eschool-ua.com/auth';
                throw new Error('Unauthorized');
            }
            return res.json();
        })
        .then((profile) => {
            try {
                localStorage.setItem('__cached_profile__', JSON.stringify(profile));
            } catch (e) {}

            chrome.runtime.sendMessage({
                type: 'PROFILE_DATA',
                firstName: profile.FirstName,
                secondName: profile.SecondName,
                lastName: profile.LastName,
                partsHref: profile?.Links?.Parts?.Href || null,
            });

            const partsHref = profile?.Links?.Parts?.Href;
            if (partsHref) {
                fetch(partsHref, { headers: { 'api-key': apiKey }, credentials: 'include' })
                    .then((r) => r.json())
                    .then((partsResp) => {
                        try {
                            localStorage.setItem('__cached_parts__', JSON.stringify(partsResp));
                        } catch (e) {}
                        const items = partsResp?.Items || partsResp || [];
                        chrome.runtime.sendMessage({ type: 'PARTS_DATA', items: Array.isArray(items) ? items : [] });
                    })
                    .catch((err) => {
                        chrome.runtime.sendMessage({ type: 'PARTS_ERROR', error: err.toString() });
                    });
            }
        })
        .catch((err) => {
            chrome.runtime.sendMessage({ type: 'PROFILE_ERROR', error: err.toString() });
        })
        .finally(() => {
            isFetchingProfile = false;
        });
};

// =====================
// FETCH_SCHOOLBOYS
// =====================
// Keeping for potential future use, but not called now
handlers.FETCH_SCHOOLBOYS = (message, sendResponse) => {
    const { href, partId } = message;
    if (!href) {
        chrome.runtime.sendMessage({ type: 'SCHOOLBOYS_ERROR', partId, error: 'No href provided' });
        sendResponse({});
        return;
    }
    const apiKey = localStorage.getItem('__api_key_value__');
    if (!apiKey) {
        chrome.runtime.sendMessage({ type: 'SCHOOLBOYS_ERROR', partId, error: 'api-key not found' });
        sendResponse({});
        return;
    }
    fetch(href, {
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
            chrome.runtime.sendMessage({
                type: 'SCHOOLBOYS_DATA',
                partId,
                schoolboys,
            });
            sendResponse({});
        })
        .catch((err) => {
            console.error('Fetch schoolboys error:', err);
            chrome.runtime.sendMessage({
                type: 'SCHOOLBOYS_ERROR',
                partId,
                error: err.message,
            });
            sendResponse({});
        });
};

// =====================
// GET_API_KEY
// =====================
handlers.GET_API_KEY = (message, sendResponse) => {
    const apiKey = localStorage.getItem('__api_key_value__');
    sendResponse({ apiKey: apiKey || null });
};

// =====================
// MESSAGE DISPATCHER
// =====================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handler = handlers[message.type];

    if (!handler) {
        console.warn('[content] unknown message type:', message.type);
        sendResponse({});
        return;
    }

    const result = handler(message, sendResponse);
    if (result && typeof result === 'object' && result.async) {
        return true;
    }
    sendResponse({});
    return;
});
