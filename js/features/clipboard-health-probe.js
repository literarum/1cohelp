'use strict';

/** Passive capability check: diagnostics must never replace or inspect user data. */
export function reportClipboardHealth(report) {
    const title = 'Буфер обмена';
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : null;
    if (!clipboard || typeof clipboard.writeText !== 'function') {
        const insecure = typeof window !== 'undefined' && window.isSecureContext === false;
        report('warn', title, insecure
            ? 'Clipboard API недоступен в небезопасном контексте. Откройте приложение по HTTPS.'
            : 'Clipboard API не предоставлен браузером в текущем контексте. Копирование проверяется по явной команде пользователя.');
        return;
    }
    const unfocused = typeof document !== 'undefined' &&
        (document.visibilityState === 'hidden' || (typeof document.hasFocus === 'function' && !document.hasFocus()));
    if (unfocused) {
        report('info', title, 'Проверка записи пропущена: вкладка не в фокусе. Активируйте приложение и воспользуйтесь командой «Копировать». Буфер обмена не изменялся.');
        return;
    }
    report('info', title, 'Clipboard API найден. Запись проверяется только по команде «Копировать», а не фоновым тестом; содержимое буфера не читалось и не изменялось.');
}
