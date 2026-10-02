'use strict';

/**
 * Общие помощники форм добавления/редактирования записей:
 * нормализация ввода (URL, ИНН, телефон), инлайн-ошибки, счётчики символов, Ctrl+Enter.
 * Чистые функции (normalize, validate, format) не зависят от DOM и покрыты тестами.
 */

const UNSAFE_SCHEME_RE = /^(javascript|data|vbscript):/i;

/**
 * Нормализует URL, введённый пользователем.
 * "example.com/x" → "https://example.com/x"; схемы javascript:/data:/vbscript: запрещены.
 * @param {string} raw
 * @returns {{ ok: boolean, url: string, error?: string }}
 */
export function normalizeUrlInput(raw) {
    const value = String(raw ?? '').trim();
    if (!value) return { ok: true, url: '' };
    if (UNSAFE_SCHEME_RE.test(value)) {
        return { ok: false, url: value, error: 'Эта схема ссылки не поддерживается' };
    }
    let candidate = value;
    if (candidate.slice(0, 2) === '\x2f\x2f') candidate = 'https:' + candidate;
    else if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
        if (/\s/.test(candidate) || !candidate.includes('.')) {
            return {
                ok: false,
                url: value,
                error: 'Введите корректный адрес, например https://example.com',
            };
        }
        candidate = 'https://' + candidate;
    }
    try {
        const parsed = new URL(candidate);
        if (UNSAFE_SCHEME_RE.test(parsed.protocol)) {
            return { ok: false, url: value, error: 'Эта схема ссылки не поддерживается' };
        }
        return { ok: true, url: candidate };
    } catch {
        return {
            ok: false,
            url: value,
            error: 'Введите корректный адрес, например https://example.com',
        };
    }
}

/**
 * Проверка ИНН по контрольной сумме (10 цифр — юрлицо, 12 — физлицо/ИП).
 * @param {string} raw
 * @returns {{ ok: boolean, digits: string, error?: string }}
 */
export function validateInn(raw) {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (digits.length !== 10 && digits.length !== 12) {
        return { ok: false, digits, error: 'ИНН должен содержать 10 или 12 цифр' };
    }
    const d = digits.split('').map(Number);
    const check = (coeffs) =>
        (coeffs.reduce((sum, c, i) => sum + c * d[i], 0) % 11) % 10;
    let valid;
    if (digits.length === 10) {
        valid = check([2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[9];
    } else {
        valid =
            check([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[10] &&
            check([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[11];
    }
    return valid
        ? { ok: true, digits }
        : { ok: false, digits, error: 'ИНН не прошёл проверку контрольной суммы — проверьте цифры' };
}

/**
 * Форматирует российский телефон: 89991234567 → +7 (999) 123-45-67. Нераспознанное — как есть.
 * @param {string} raw
 */
export function formatPhoneRu(raw) {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (digits.length !== 11 || !/^[78]/.test(digits)) return String(raw ?? '').trim();
    const d = digits.slice(1);
    return `+7 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}`;
}

/** Показать инлайн-ошибку под полем (role=alert, aria-invalid, связь aria-describedby). */
export function setFieldError(input, message) {
    if (!input) return;
    clearFieldError(input);
    const id = (input.id || input.name || 'field') + 'Error';
    const p = document.createElement('p');
    p.className = 'form-field-error';
    p.id = id;
    p.setAttribute('role', 'alert');
    p.textContent = message;
    input.insertAdjacentElement('afterend', p);
    input.classList.add('form-field-invalid');
    input.setAttribute('aria-invalid', 'true');
    const prev = input.getAttribute('aria-describedby');
    input.dataset.prevDescribedby = prev || '';
    input.setAttribute('aria-describedby', prev ? `${prev} ${id}` : id);
}

export function clearFieldError(input) {
    if (!input) return;
    const next = input.nextElementSibling;
    if (next && next.classList.contains('form-field-error')) next.remove();
    input.classList.remove('form-field-invalid');
    input.removeAttribute('aria-invalid');
    if ('prevDescribedby' in input.dataset) {
        if (input.dataset.prevDescribedby) {
            input.setAttribute('aria-describedby', input.dataset.prevDescribedby);
        } else input.removeAttribute('aria-describedby');
        delete input.dataset.prevDescribedby;
    }
}

/** Очищать ошибку поля при вводе (идемпотентно). */
export function autoClearErrorOnInput(input) {
    if (!input || input._autoClearErr) return;
    input._autoClearErr = true;
    input.addEventListener('input', () => clearFieldError(input));
}

/** Счётчик символов под полем с maxlength (идемпотентно). */
export function attachCharCounter(input, max) {
    if (!input) return;
    const limit = max || Number(input.getAttribute('maxlength')) || 0;
    if (!limit || input._charCounter) return;
    const c = document.createElement('div');
    c.className = 'form-char-counter';
    c.setAttribute('aria-hidden', 'true');
    input.insertAdjacentElement('afterend', c);
    input._charCounter = c;
    const update = () => {
        const n = input.value.length;
        c.textContent = `${n} / ${limit}`;
        c.classList.toggle('is-near-limit', n >= limit * 0.9);
    };
    input.addEventListener('input', update);
    update();
}

/**
 * Ctrl/Cmd+Enter в форме = сохранить (кроме кнопок/ссылок). Идемпотентно.
 * @param {HTMLFormElement} form
 * @param {HTMLElement} [scope] элемент, на котором слушаем (по умолчанию форма)
 */
export function bindCtrlEnterSubmit(form, scope) {
    const host = scope || form;
    if (!form || !host || host._ctrlEnterBound) return;
    host._ctrlEnterBound = true;
    host.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.isComposing) return;
        e.preventDefault();
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    });
}

export { shakeField } from './motion.js';
