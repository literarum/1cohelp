'use strict';

/**
 * Единый «набор» для модалок добавления/редактирования записей:
 * шапка с иконкой и подсказкой, пометки обязательных полей, счётчики, Ctrl+Enter,
 * отслеживание несохранённых изменений (через unsaved-changes-registry), закрытие с подтверждением,
 * пакетная инлайн-валидация, состояние кнопки сохранения и подсказки тегов.
 *
 * Чистые функции (detectPastedKind, snapshotForm) не зависят от окружения приложения.
 */

import { registerModalDirtyCheck } from './unsaved-changes-registry.js';
import { showUnsavedConfirmModal } from './unsaved-confirm-modal.js';
import {
    attachCharCounter,
    bindCtrlEnterSubmit,
    setFieldError,
    clearFieldError,
    autoClearErrorOnInput,
    validateInn,
    normalizeUrlInput,
    formatPhoneRu,
} from './form-helpers.js';
import { flashButtonSuccess, shakeField, prefersReducedMotion } from './motion.js';
import { normalizeTagToken } from '../features/global-tags.js';

const SUBTITLE_DEFAULT =
    'Поля со <span class="text-red-500">*</span> обязательны · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> — сохранить · <kbd>Esc</kbd> — закрыть';

/**
 * Определяет тип вставленной строки: ИНН (с контрольной суммой), ссылка, телефон.
 * @param {string} raw
 * @returns {{ kind: 'inn'|'url'|'phone'|'unknown', value: string, validInn?: boolean }}
 */
export function detectPastedKind(raw) {
    const text = String(raw ?? '').trim();
    if (!text || text.length > 300) return { kind: 'unknown', value: text };
    const digits = text.replace(/[\s-]/g, '');
    if (/^\d{10}$|^\d{12}$/.test(digits)) {
        return { kind: 'inn', value: digits, validInn: validateInn(digits).ok };
    }
    if (/^(https?:\/\/|www\.)\S+$/i.test(text) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(text)) {
        const n = normalizeUrlInput(text);
        if (n.ok && n.url) return { kind: 'url', value: n.url };
    }
    if (/^(\+7|8|7)[\s(.-]*\d{3}[\s).-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}$/.test(text)) {
        const f = formatPhoneRu(text);
        if (f.startsWith('+7')) return { kind: 'phone', value: f };
    }
    return { kind: 'unknown', value: text };
}

/**
 * Строка-слепок значений полей формы (для сравнения «до/после»).
 * @param {ParentNode} root
 * @returns {string}
 */
export function snapshotForm(root) {
    const out = {};
    if (!root) return '{}';
    root.querySelectorAll('input, select, textarea').forEach((el) => {
        const type = el.type;
        if (type === 'button' || type === 'submit' || type === 'reset' || type === 'hidden') return;
        const key = el.id || el.name;
        if (!key) return;
        if (type === 'radio') {
            if (el.checked) out['r:' + (el.name || key)] = el.value;
        } else if (type === 'checkbox') out[key] = el.checked;
        else if (type === 'file') out[key] = el.files ? el.files.length : 0;
        else out[key] = el.value;
    });
    return JSON.stringify(out);
}

/** Запомнить текущие значения как «чистое» состояние (вызывать сразу после заполнения формы). */
export function captureFormBaseline(modal, root) {
    if (!modal) return;
    const scope = root || modal._kitRoot || modal.querySelector('form') || modal;
    modal._kitRoot = scope;
    modal._kitBaseline = snapshotForm(scope);
}

/** Сбросить «чистое» состояние (после закрытия/сохранения). */
export function clearFormBaseline(modal) {
    if (!modal) return;
    modal._kitBaseline = null;
}

export function isFormDirty(modal) {
    if (!modal || modal._kitBaseline == null) return false;
    try {
        if (snapshotForm(modal._kitRoot || modal) !== modal._kitBaseline) return true;
        if (typeof modal._kitExtraDirty === 'function' && modal._kitExtraDirty()) return true;
    } catch (_) {
        /* ignore */
    }
    return false;
}

/**
 * Зарегистрировать модалку в реестре несохранённых изменений (идемпотентно).
 * @param {HTMLElement} modal
 * @param {{ extraDirty?: () => boolean }} [opts]
 */
export function registerFormDirty(modal, opts = {}) {
    if (!modal || !modal.id) return;
    if (typeof opts.extraDirty === 'function') modal._kitExtraDirty = opts.extraDirty;
    registerModalDirtyCheck(modal.id, (m) => isFormDirty(m));
}

/**
 * Закрыть модалку: при несохранённых изменениях — подтверждение «Выйти без сохранения».
 * @param {HTMLElement} modal
 * @param {() => void} perform фактическое закрытие
 * @returns {Promise<boolean>} true — закрыто
 */
export async function closeWithConfirm(modal, perform) {
    if (modal && isFormDirty(modal)) {
        let leave = true;
        try {
            leave = await showUnsavedConfirmModal();
        } catch (_) {
            leave = true;
        }
        if (!leave) return false;
    }
    clearFormBaseline(modal);
    perform();
    return true;
}

/**
 * Шапка: иконка + заголовок + подзаголовок-подсказка. Идемпотентно; id заголовка сохраняется.
 * @param {HTMLElement} modal
 * @param {{ titleId?: string, icon?: string, subtitle?: string }} [opts]
 */
export function decorateModalHeader(modal, opts = {}) {
    if (!modal) return null;
    const h2 = opts.titleId ? modal.querySelector('#' + opts.titleId) : modal.querySelector('h2');
    if (!h2 || h2.dataset.kitDecorated === '1') return h2 || null;
    h2.dataset.kitDecorated = '1';
    const wrap = document.createElement('div');
    wrap.className = 'form-modal-head';
    if (opts.icon) {
        const ic = document.createElement('span');
        ic.className = 'form-modal-icon';
        ic.setAttribute('aria-hidden', 'true');
        ic.innerHTML = `<i class="fas ${opts.icon}"></i>`;
        wrap.appendChild(ic);
    }
    const text = document.createElement('div');
    text.className = 'form-modal-head-text';
    h2.replaceWith(wrap);
    text.appendChild(h2);
    const p = document.createElement('p');
    p.className = 'form-modal-subtitle';
    p.innerHTML = opts.subtitle || SUBTITLE_DEFAULT;
    text.appendChild(p);
    wrap.appendChild(text);
    return h2;
}

/** Пометить `*` лейблы обязательных полей и проставить aria-required. */
export function markRequiredLabels(root) {
    if (!root) return;
    root.querySelectorAll('input[required], select[required], textarea[required]').forEach((el) => {
        el.setAttribute('aria-required', 'true');
        if (!el.id) return;
        const label = root.querySelector(`label[for="${el.id}"]`);
        if (!label || label.querySelector('.form-required-mark, .text-red-500')) return;
        const s = document.createElement('span');
        s.className = 'form-required-mark';
        s.setAttribute('aria-hidden', 'true');
        s.textContent = ' *';
        label.appendChild(s);
    });
}

/** Пометить «необязательно» лейблы заданных полей (если в тексте ещё нет такой пометки). */
export function markOptionalLabels(root, ids) {
    if (!root) return;
    (ids || []).forEach((id) => {
        const label = root.querySelector(`label[for="${id}"]`);
        if (!label || label.querySelector('.form-optional-mark')) return;
        if (/опцион|необяз/i.test(label.textContent || '')) return;
        const s = document.createElement('span');
        s.className = 'form-optional-mark';
        s.textContent = 'необязательно';
        label.appendChild(s);
    });
}

/**
 * Общая инициализация формы-модалки (идемпотентна по modal._kitEnhanced).
 * @param {HTMLElement} modal
 * @param {HTMLFormElement|null} form
 * @param {{ titleId?: string, icon?: string, subtitle?: string, counters?: Record<string, number>,
 *   optional?: string[], ctrlEnter?: boolean, registerDirty?: boolean, extraDirty?: () => boolean }} [opts]
 */
export function enhanceFormModal(modal, form, opts = {}) {
    if (!modal || modal._kitEnhanced) return;
    modal._kitEnhanced = true;
    if (opts.header !== false) decorateModalHeader(modal, opts);
    markRequiredLabels(modal);
    markOptionalLabels(modal, opts.optional);
    Object.entries(opts.counters || {}).forEach(([id, max]) => {
        const el = modal.querySelector('#' + id);
        if (!el) return;
        if (!el.getAttribute('maxlength')) el.setAttribute('maxlength', String(max));
        attachCharCounter(el, max);
    });
    if (form && opts.ctrlEnter !== false) bindCtrlEnterSubmit(form, modal);
    if (opts.registerDirty !== false) registerFormDirty(modal, { extraDirty: opts.extraDirty });
}

/**
 * Пакетная инлайн-валидация. Показывает ошибки у всех невалидных полей, фокусирует первое.
 * @param {Array<{ input: HTMLElement|null, test: () => string|null|undefined|false }>} rules
 * @returns {boolean} true — всё валидно
 */
export function validateRules(rules) {
    let first = null;
    rules.forEach(({ input }) => input && clearFieldError(input));
    rules.forEach(({ input, test }) => {
        if (!input) return;
        const msg = test();
        if (!msg) return;
        setFieldError(input, msg);
        autoClearErrorOnInput(input);
        shakeField(input);
        if (!first) first = input;
    });
    if (first) {
        try {
            first.focus();
        } catch (_) {
            /* ignore */
        }
        return false;
    }
    return true;
}

/**
 * Состояние кнопки сохранения: loading → (успех: галочка) → исходный вид. Защита от двойного клика.
 * @param {HTMLButtonElement|null} btn
 * @param {string} [loadingText]
 * @returns {null | ((ok?: boolean) => Promise<void>)} null, если отправка уже идёт
 */
export function beginSubmit(btn, loadingText = 'Сохранение...') {
    if (!btn || btn.disabled || btn.dataset.kitBusy === '1') return null;
    const idleHtml = btn.innerHTML;
    btn.dataset.kitBusy = '1';
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-1" aria-hidden="true"></i> ${loadingText}`;
    return async (ok = false) => {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        delete btn.dataset.kitBusy;
        btn.innerHTML = idleHtml;
        if (ok && !prefersReducedMotion()) {
            flashButtonSuccess(btn);
            await new Promise((r) => setTimeout(r, 240));
        }
    };
}

// ---------------------------------------------------------------------------
// Подсказки тегов: быстрые чипы из уже использованных тегов базы
// ---------------------------------------------------------------------------

const TAG_STORES = ['bookmarks', 'reglaments', 'algorithms'];
const TAG_CACHE_TTL_MS = 5 * 60 * 1000;
let tagCache = { at: 0, tags: [], promise: null };

export function invalidateKnownTags() {
    tagCache = { at: 0, tags: [], promise: null };
}

/** Топ используемых тегов (по частоте). Кэш 5 минут; чтение курсором с проекцией — без тяжёлых полей. */
export async function loadKnownTags() {
    if (tagCache.tags.length && Date.now() - tagCache.at < TAG_CACHE_TTL_MS) return tagCache.tags;
    if (tagCache.promise) return tagCache.promise;
    tagCache.promise = (async () => {
        const counts = new Map();
        try {
            const { getAllProjected } = await import('../db/indexeddb.js');
            for (const store of TAG_STORES) {
                try {
                    const lists = await getAllProjected(store, (r) =>
                        r && Array.isArray(r.tags) && r.tags.length ? r.tags : undefined,
                    );
                    lists.forEach((arr) =>
                        arr.forEach((t) => {
                            const n = normalizeTagToken(t);
                            if (n) counts.set(n, (counts.get(n) || 0) + 1);
                        }),
                    );
                } catch (_) {
                    /* хранилища может не быть — пропускаем */
                }
            }
        } catch (_) {
            /* ignore */
        }
        const tags = [...counts.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
            .slice(0, 60)
            .map(([t]) => t);
        tagCache = { at: Date.now(), tags, promise: null };
        return tags;
    })();
    return tagCache.promise;
}

function splitTagInput(value) {
    const parts = String(value || '').split(/[,;\n]/);
    const last = parts.pop() ?? '';
    return { done: parts.map((s) => s.trim()).filter(Boolean), last: last.trim() };
}

/**
 * Чипы быстрых тегов под полем: клик добавляет тег, ввод фильтрует по префиксу.
 * @param {HTMLInputElement|null} input
 */
export function attachTagSuggestions(input) {
    if (!input || input._tagSuggest) return;
    const box = document.createElement('div');
    box.className = 'form-tag-suggest hidden';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Быстрые теги');
    input.insertAdjacentElement('afterend', box);
    input._tagSuggest = box;
    let known = [];
    const render = () => {
        const { done, last } = splitTagInput(input.value);
        const used = new Set(done.map(normalizeTagToken));
        const q = normalizeTagToken(last);
        const list = known
            .filter((t) => !used.has(t) && (!q || (t.startsWith(q) && t !== q)))
            .slice(0, q ? 8 : 10);
        box.textContent = '';
        list.forEach((t) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'form-tag-chip';
            b.textContent = '#' + t;
            b.setAttribute('aria-label', `Добавить тег ${t}`);
            b.addEventListener('mousedown', (e) => e.preventDefault());
            b.addEventListener('click', () => {
                const cur = splitTagInput(input.value);
                const next = [...cur.done, t];
                input.value = next.join(', ') + ', ';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.focus();
            });
            box.appendChild(b);
        });
        box.classList.toggle('hidden', list.length === 0);
    };
    input.addEventListener('input', render);
    input.addEventListener('focus', () => {
        loadKnownTags()
            .then((t) => {
                known = t;
                render();
            })
            .catch(() => {});
    });
    input.addEventListener('blur', () => {
        // Нормализуем «грязный» ввод: лишние запятые/пробелы
        const { done, last } = splitTagInput(input.value);
        const all = last ? [...done, last] : done;
        const cleaned = all.join(', ');
        if (cleaned !== input.value.trim()) {
            input.value = cleaned;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });
}

export { setFieldError, clearFieldError, autoClearErrorOnInput, shakeField };
