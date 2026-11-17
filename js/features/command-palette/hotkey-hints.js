'use strict';

/**
 * Подсказки горячих клавиш в палитре команд (сверено с js/ui/hotkeys-handler.js).
 * Записываются «как на Windows»; на macOS Ctrl/Alt/Shift показываются символами,
 * а Ctrl в сочетаниях с Shift — как ⌘ (обработчики принимают Ctrl или Cmd).
 */
export const HOTKEY_HINTS = Object.freeze({
    'action:openSettings': 'Alt+I',
    'action:openHotkeys': 'Ctrl+Shift+H',
    'action:exportDatabase': 'Alt+Shift+S',
    'action:importDatabase': 'Alt+Shift+O',
    'action:toggleTheme': 'Alt+T',
    'action:forceReload': 'Alt+R',
    'action:openFavorites': 'Alt+L',
    'action:clearClientData': 'Ctrl+Shift+Backspace',
    'action:exportClientDataToTxt': 'Ctrl+Shift+D',
    'action:timerToggle': 'Ctrl+Alt+T',
    'action:timerReset': 'Ctrl+Alt+R',
    'tab:main': 'Alt+H',
});

export function isMacPlatform(nav = typeof navigator !== 'undefined' ? navigator : null) {
    const p = nav?.userAgentData?.platform || nav?.platform || '';
    return /mac|iphone|ipad/i.test(p);
}

/** Текст сочетания для показа. */
export function formatHotkey(combo, mac = isMacPlatform()) {
    if (!combo) return '';
    if (!mac) return combo;
    const parts = combo.split('+');
    const hasAlt = parts.includes('Alt');
    return parts
        .map((p) => {
            if (p === 'Ctrl') return hasAlt ? '⌃' : '⌘';
            if (p === 'Alt') return '⌥';
            if (p === 'Shift') return '⇧';
            if (p === 'Backspace') return '⌫';
            return p;
        })
        .join('');
}

export function hotkeyHintFor(id, mac) {
    const combo = HOTKEY_HINTS[id];
    return combo ? formatHotkey(combo, mac) : '';
}
