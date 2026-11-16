'use strict';

/**
 * Глубокие ссылки при запуске: ./index.html?tab=bookmarks  или  #tab=reglaments,
 * ?action=search (фокус в поиск), ?action=palette (палитра команд).
 * Используются ярлыками PWA (manifest.webmanifest → shortcuts) и закладками браузера.
 */

const SPECIAL_TABS = new Set(['favorites', 'reminders']);

/**
 * @param {string} search location.search
 * @param {string} hash location.hash
 * @param {string[]} knownTabs
 * @returns {{ tab: string|null, action: 'search'|'palette'|null }}
 */
export function parseDeepLink(search, hash, knownTabs) {
    const params = new URLSearchParams(search || '');
    const hashParams = new URLSearchParams(String(hash || '').replace(/^#/, ''));
    const rawTab = params.get('tab') || hashParams.get('tab');
    const rawAction = params.get('action') || hashParams.get('action');
    const tab =
        rawTab && (knownTabs.includes(rawTab) || SPECIAL_TABS.has(rawTab)) ? rawTab : null;
    const action = rawAction === 'search' || rawAction === 'palette' ? rawAction : null;
    return { tab, action };
}

/** Убрать параметры глубокой ссылки из адреса, чтобы перезагрузка не повторяла переход. */
function cleanUrl() {
    try {
        const url = new URL(window.location.href);
        url.searchParams.delete('tab');
        url.searchParams.delete('action');
        if (/(^#|&)(tab|action)=/.test(url.hash)) url.hash = '';
        history.replaceState(history.state, '', url.toString());
    } catch {
        /* history недоступна */
    }
}

/**
 * @param {{ setActiveTab: (id:string)=>unknown, knownTabs: string[] }} deps
 */
export async function applyDeepLinkOnStartup(deps) {
    if (typeof window === 'undefined') return;
    const { tab, action } = parseDeepLink(window.location.search, window.location.hash, deps.knownTabs);
    if (!tab && !action) return;
    cleanUrl();
    if (tab && typeof deps.setActiveTab === 'function') {
        const btn = document.getElementById(`${tab}Tab`);
        const hiddenPanel = btn && btn.classList.contains('hidden');
        if (!hiddenPanel || SPECIAL_TABS.has(tab)) await deps.setActiveTab(tab);
    }
    if (action === 'search') {
        document.getElementById('searchInput')?.focus();
    } else if (action === 'palette') {
        document.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true }),
        );
    }
}
