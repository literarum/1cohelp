'use strict';

/**
 * Модуль для работы с буфером обмена
 * Содержит функции для копирования текста в буфер обмена
 */

let deps = {
    NotificationService: null,
    showNotification: null,
};

/**
 * Устанавливает зависимости модуля
 */
export function setClipboardDependencies(dependencies) {
    if (dependencies.NotificationService) deps.NotificationService = dependencies.NotificationService;
    if (dependencies.showNotification) deps.showNotification = dependencies.showNotification;
    console.log('[clipboard.js] Зависимости установлены');
}

/**
 * Копирует текст в буфер обмена с поддержкой различных методов и верификацией
 * @param {string|any} text - текст для копирования
 * @param {string} successMessage - сообщение при успехе
 * @param {Object} opts - дополнительные опции (selectionEl, range)
 * @returns {Promise<boolean>} - результат операции
 */
export async function copyToClipboard(text, successMessage = 'Скопировано!', opts = {}) {
    const notify = (msg, type = 'success') => {
        if (deps.NotificationService && typeof deps.NotificationService.add === 'function') {
            deps.NotificationService.add(msg, type);
        } else if (deps.showNotification && typeof deps.showNotification === 'function') {
            deps.showNotification(msg, type);
        }
    };

    if (text == null) {
        console.error('[copyToClipboard] Пустое значение');
        notify('Не удалось скопировать', 'error');
        return false;
    }

    const s = typeof text === 'string' ? text : String(text);
    if (!s.length) {
        notify('Не удалось скопировать', 'error');
        return false;
    }

    const prevActive = document.activeElement || null;
    const isTextControl =
        prevActive &&
        (prevActive.tagName === 'TEXTAREA' ||
            (prevActive.tagName === 'INPUT' &&
                /^(text|search|url|tel|password|email|number)$/i.test(prevActive.type)));
    const prevSel = isTextControl
        ? {
              start: prevActive.selectionStart,
              end: prevActive.selectionEnd,
              dir: prevActive.selectionDirection,
          }
        : null;
    const prevScrollTop =
        prevActive && typeof prevActive.scrollTop === 'number' ? prevActive.scrollTop : null;

    const restoreFocus = () => {
        if (!prevActive || typeof prevActive.focus !== 'function') return;
        prevActive.focus({ preventScroll: true });
        if (isTextControl && prevSel && typeof prevActive.setSelectionRange === 'function') {
            try {
                prevActive.setSelectionRange(prevSel.start, prevSel.end, prevSel.dir || 'none');
            } catch {}
        }
        if (prevScrollTop !== null) {
            try {
                prevActive.scrollTop = prevScrollTop;
            } catch {}
        }
    };

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const canRead = !!(navigator.clipboard && navigator.clipboard.readText);

    const normalizeForVerify = (val) => {
        if (typeof val !== 'string') return '';
        return val
            .replace(/\r\n?/g, '\n')
            .replace(/\u00A0/g, ' ')
            .replace(/[ \t]+$/g, '')
            .replace(/\n+$/g, '');
    };

    const verify = async () => {
        if (!canRead) return null;
        try {
            const got = await navigator.clipboard.readText();
            return normalizeForVerify(got) === normalizeForVerify(s);
        } catch {
            return null;
        }
    };

    const trySelectionCopy = () => {
        const el = opts && opts.selectionEl;
        if (!el || typeof el.setSelectionRange !== 'function') return false;
        const [start, end] = Array.isArray(opts.range)
            ? opts.range
            : [el.selectionStart, el.selectionEnd];
        try {
            el.focus();
            el.setSelectionRange(start, end);
            return !!(document.execCommand && document.execCommand('copy'));
        } catch {
            return false;
        }
    };

    let ok = trySelectionCopy();
    if (ok) {
        const v = await verify();
        if (v === false) ok = false;
        if (ok) notify(successMessage, 'success');
        else notify('Не удалось скопировать', 'error');
        restoreFocus();
        setTimeout(restoreFocus, 0);
        return !!ok;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(s);
            let confirmed = await verify();
            if (confirmed === false) {
                await sleep(25);
                confirmed = await verify();
            }
            ok = confirmed !== false;
            if (ok) {
                notify(successMessage, 'success');
                restoreFocus();
                setTimeout(restoreFocus, 0);
                return true;
            }
        } catch (err) {
            console.warn('[copyToClipboard] writeText failed, fallback:', err);
        } finally {
            restoreFocus();
            setTimeout(restoreFocus, 0);
        }
    }

    let taOk = false;
    const ta = document.createElement('textarea');
    ta.value = s;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    try {
        ta.focus();
        ta.select();
        taOk = !!(document.execCommand && document.execCommand('copy'));
    } catch {
        taOk = false;
    } finally {
        document.body.removeChild(ta);
    }

    const v2 = await verify();
    if (v2 === false) taOk = false;
    if (taOk) notify(successMessage, 'success');
    else notify('Не удалось скопировать', 'error');
    restoreFocus();
    setTimeout(restoreFocus, 0);
    return !!taOk;
}
