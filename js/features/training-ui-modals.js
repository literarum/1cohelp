'use strict';

/**
 * Модальные диалоги для режима «Обучение» (без window.prompt): список с поиском, формы.
 */

import {
    isRichTextMeaningfullyEmpty,
    normalizeQuizItem,
} from './training-user-curriculum.js';
import { mountTrainingRichEditor } from './training-rich-editor.js';

let activeOverlay = null;
let keydownTrap = null;

function trapFocus(overlay) {
    const focusable = /** @type {NodeListOf<HTMLElement>} */ (
        overlay.querySelectorAll(
            'button, [href], input, select, textarea, [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
        )
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first) first.focus();

    keydownTrap = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeTrainingModal();
            return;
        }
        if (e.key !== 'Tab' || focusable.length === 0) return;
        if (e.shiftKey) {
            if (document.activeElement === first) {
                e.preventDefault();
                last?.focus();
            }
        } else if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
        }
    };
    document.addEventListener('keydown', keydownTrap, true);
}

/**
 * Закрывает активное модальное окно обучения.
 */
export function closeTrainingModal() {
    if (keydownTrap) {
        document.removeEventListener('keydown', keydownTrap, true);
        keydownTrap = null;
    }
    if (activeOverlay && activeOverlay.parentNode) {
        activeOverlay.parentNode.removeChild(activeOverlay);
    }
    activeOverlay = null;
    document.body.classList.remove('modal-open');
    document.body.classList.remove('overflow-hidden');
}

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.subtitle]
 * @param {HTMLElement} opts.bodyEl
 * @param {() => void} [opts.onCancel]
 * @param {boolean} [opts.wide]
 * @param {string} [opts.modalId]
 * @param {boolean} [opts.showUndoRedo]
 * @param {boolean} [opts.showFullscreen]
 * @param {boolean} [opts.closeOnBackdrop] если true — закрытие по клику на оверлей (по умолчанию false)
 * @param {boolean} [opts.ultraWide] очень широкая панель (редакторы наставника и т.п.)
 */
export function mountTrainingModal(opts) {
    closeTrainingModal();
    const overlay = document.createElement('div');
    if (opts.modalId) overlay.id = opts.modalId;
    overlay.className =
        'training-modal-overlay fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'trainingModalTitle');

    const panel = document.createElement('div');
    const maxW = opts.ultraWide ? 'max-w-4xl' : opts.wide ? 'max-w-2xl' : 'max-w-lg';
    panel.className = `training-modal-panel modal-inner-container relative w-full ${maxW} max-h-[90vh] flex flex-col rounded-2xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-2xl overflow-hidden`;

    const showFs = opts.showFullscreen !== false && !!(opts.wide || opts.ultraWide);
    const showUr = opts.showUndoRedo === true;

    const head = document.createElement('div');
    head.className =
        'flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-600 flex-shrink-0';
    head.innerHTML = `
        <div class="min-w-0 flex-1">
            <h2 id="trainingModalTitle" class="text-lg font-semibold text-gray-900 dark:text-gray-50">${escapeModalHtml(opts.title)}</h2>
            ${opts.subtitle ? `<p class="text-sm text-gray-500 dark:text-gray-400 mt-1">${escapeModalHtml(opts.subtitle)}</p>` : ''}
        </div>
        <div class="flex items-center gap-1 shrink-0">
            ${showUr ? `<button type="button" id="trainingModalUndoBtn" class="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40" aria-label="Отменить" title="Отменить (Ctrl+Z)"><i class="fas fa-undo" aria-hidden="true"></i></button>
            <button type="button" id="trainingModalRedoBtn" class="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40" aria-label="Вернуть" title="Вернуть (Ctrl+Shift+Z)"><i class="fas fa-redo" aria-hidden="true"></i></button>` : ''}
            ${showFs ? `<button type="button" id="trainingModalFsBtn" class="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Развернуть на весь экран" title="Развернуть на весь экран"><i class="fas fa-expand" aria-hidden="true"></i></button>` : ''}
            <button type="button" class="training-modal-close p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Закрыть">
                <i class="fas fa-times" aria-hidden="true"></i>
            </button>
        </div>`;

    const body = document.createElement('div');
    body.id = 'trainingUserCurriculumModalBody';
    body.className =
        'training-modal-body-area flex-1 min-h-0 overflow-y-auto px-5 py-4';
    body.appendChild(opts.bodyEl);

    const closeBtn = head.querySelector('.training-modal-close');
    closeBtn?.addEventListener('click', () => {
        closeTrainingModal();
        opts.onCancel?.();
    });
    if (opts.closeOnBackdrop === true) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeTrainingModal();
                opts.onCancel?.();
            }
        });
    }

    const fsBtn = head.querySelector('#trainingModalFsBtn');
    fsBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        overlay.classList.toggle('training-modal-overlay--fullscreen');
        const isFs = overlay.classList.contains('training-modal-overlay--fullscreen');
        const icon = fsBtn.querySelector('i');
        if (icon) {
            icon.classList.toggle('fa-expand', !isFs);
            icon.classList.toggle('fa-compress', isFs);
        }
        fsBtn.title = isFs ? 'Свернуть' : 'Развернуть на весь экран';
        fsBtn.setAttribute('aria-label', isFs ? 'Свернуть' : 'Развернуть на весь экран');
    });

    panel.appendChild(head);
    panel.appendChild(body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    activeOverlay = overlay;
    document.body.classList.add('modal-open');
    document.body.classList.add('overflow-hidden');
    trapFocus(overlay);
    return { overlay, body, head };
}

function escapeModalHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * @param {object} p
 * @param {string} p.title
 * @param {Array<{ id: string|number, label: string, subtitle?: string }>} p.items
 * @param {(item: object) => void} p.onPick
 */
export function openTrainingPickModal(p) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2" for="trainingPickFilter">Поиск</label>
        <input id="trainingPickFilter" type="search" autocomplete="off"
            class="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm mb-3"
            placeholder="Начните вводить название…" />
        <ul id="trainingPickList" class="space-y-1 max-h-[50vh] overflow-y-auto pr-1"></ul>
        <p id="trainingPickEmpty" class="text-sm text-gray-500 py-6 text-center hidden">Ничего не найдено</p>`;

    const listEl = /** @type {HTMLUListElement} */ (wrap.querySelector('#trainingPickList'));
    const filterEl = /** @type {HTMLInputElement} */ (wrap.querySelector('#trainingPickFilter'));
    const emptyEl = /** @type {HTMLElement} */ (wrap.querySelector('#trainingPickEmpty'));

    function renderList(filter) {
        const q = (filter || '').trim().toLowerCase();
        listEl.innerHTML = '';
        const items = p.items.filter((it) => {
            const hay = `${it.label} ${it.subtitle || ''}`.toLowerCase();
            return !q || hay.includes(q);
        });
        emptyEl.classList.toggle('hidden', items.length > 0);
        items.forEach((it) => {
            const li = document.createElement('li');
            li.innerHTML = `<button type="button" class="training-pick-row w-full text-left px-3 py-2.5 rounded-xl border border-transparent hover:border-primary/40 hover:bg-primary/5 dark:hover:bg-gray-700/50 transition">
                <span class="block text-sm font-medium text-gray-900 dark:text-gray-100">${escapeModalHtml(it.label)}</span>
                ${it.subtitle ? `<span class="block text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">${escapeModalHtml(it.subtitle)}</span>` : ''}
            </button>`;
            const btn = li.querySelector('button');
            btn?.addEventListener('click', () => {
                closeTrainingModal();
                p.onPick(it);
            });
            listEl.appendChild(li);
        });
    }

    filterEl.addEventListener('input', () => renderList(filterEl.value));
    renderList('');

    mountTrainingModal({
        title: p.title,
        bodyEl: wrap,
    });
    requestAnimationFrame(() => filterEl.focus());
}

/**
 * @param {object} p
 * @param {(fields: { front: string, back: string }) => void} p.onSubmit
 */
export function openTrainingManualCardModal(p) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1" for="tcFront">Вопрос / термин</label>
        <textarea id="tcFront" rows="3" class="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm mb-4"></textarea>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1" for="tcBack">Ответ</label>
        <textarea id="tcBack" rows="4" class="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm mb-4"></textarea>
        <div class="flex justify-end gap-2 pt-2">
            <button type="button" id="tcCancel" class="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-sm">Отмена</button>
            <button type="button" id="tcSave" class="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium">Сохранить карточку</button>
        </div>`;

    mountTrainingModal({ title: 'Новая карточка', subtitle: 'Локально, только на этом устройстве', bodyEl: wrap });

    const front = /** @type {HTMLTextAreaElement} */ (wrap.querySelector('#tcFront'));
    const back = /** @type {HTMLTextAreaElement} */ (wrap.querySelector('#tcBack'));
    wrap.querySelector('#tcCancel')?.addEventListener('click', () => closeTrainingModal());
    wrap.querySelector('#tcSave')?.addEventListener('click', () => {
        const f = front?.value?.trim() || '';
        const b = back?.value?.trim() || '';
        if (!f || !b) return;
        closeTrainingModal();
        p.onSubmit({ front: f, back: b });
    });
}

/**
 * @param {object} p
 * @param {(note: string) => void} p.onSubmit
 */
export function openTrainingWeakNoteModal(p) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1" for="twNote">Как не повторить ошибку</label>
        <textarea id="twNote" rows="4" maxlength="800"
            class="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm mb-2"
            placeholder="Коротко: триггер, проверка, эскалация…"></textarea>
        <p class="text-xs text-gray-500 mb-4">До 800 символов. Сохраняется только локально.</p>
        <div class="flex justify-end gap-2">
            <button type="button" id="twCancel" class="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-sm">Отмена</button>
            <button type="button" id="twSave" class="px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-medium">Сохранить в слабые места</button>
        </div>`;

    mountTrainingModal({ title: 'Слабое место', subtitle: 'Зафиксируйте урок', bodyEl: wrap });

    const ta = /** @type {HTMLTextAreaElement} */ (wrap.querySelector('#twNote'));
    wrap.querySelector('#twCancel')?.addEventListener('click', () => closeTrainingModal());
    wrap.querySelector('#twSave')?.addEventListener('click', () => {
        const n = ta?.value?.trim() || '';
        if (!n) return;
        closeTrainingModal();
        p.onSubmit(n);
    });
    requestAnimationFrame(() => ta?.focus());
}

/**
 * @typedef {import('./training-curriculum.js').TrainingTrack} TrainingTrack
 * @typedef {import('./training-curriculum.js').TrainingStep} TrainingStep
 * @typedef {import('./training-curriculum.js').TrainingQuizItem} TrainingQuizItem
 */

/**
 * @param {object} p
 * @param {TrainingTrack | null} [p.initialTrack]
 * @param {(track: TrainingTrack) => Promise<void>} p.onSave
 * @param {(id: string) => Promise<void>} [p.onDelete]
 * @param {'user'|'builtin'} [p.mode] встроенный трек — без удаления модуля
 */
export function openUserCurriculumEditorModal(p) {
    const isBuiltin = p.mode === 'builtin';
    const initial = p.initialTrack;
    /** @type {TrainingTrack} */
    const draft = initial
        ? {
              ...initial,
              steps: Array.isArray(initial.steps) ? [...initial.steps] : [],
          }
        : {
              id: '',
              title: '',
              subtitle: '',
              mode: 'textbook',
              steps: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
          };

    let editingStepIndex = /** @type {number | null} */ (null);

    const wrap = document.createElement('div');
    wrap.className = 'training-user-editor space-y-4';
    wrap.innerHTML = `
        <div class="training-user-editor-blur-when-step space-y-4">
        <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1" for="uctTitle">Название модуля</label>
            <textarea id="uctTitle" rows="2" maxlength="500"
                class="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm training-modal-field-resize resize-y min-h-[2.75rem] max-h-[30vh]"></textarea>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1" for="uctSubtitle">Подзаголовок (необязательно)</label>
            <textarea id="uctSubtitle" rows="2" maxlength="500"
                class="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm training-modal-field-resize resize-y min-h-[2.5rem] max-h-[24vh]"></textarea>
        </div>
        <div class="rounded-xl border border-gray-200 dark:border-gray-600 p-3 bg-gray-50/80 dark:bg-gray-900/40">
            <div class="flex items-center justify-between gap-2 mb-2">
                <span class="text-sm font-semibold text-gray-800 dark:text-gray-100">Шаги учебника</span>
                <button type="button" id="uctAddStep" class="text-sm px-3 py-1.5 rounded-lg bg-primary text-white font-medium">Добавить шаг</button>
            </div>
            <ul id="uctStepList" class="hidden space-y-2 list-none max-h-[min(28vh,420px)] min-h-[120px] resize-y overflow-y-auto pr-1 border border-dashed border-gray-200 dark:border-gray-600 rounded-lg p-1" aria-label="Список шагов модуля"></ul>
            <p id="uctStepEmpty" class="text-sm text-gray-500 py-3 text-center">Пока нет шагов — добавьте первый.</p>
        </div>
        </div>
        <div id="uctStepEditor" class="training-user-editor-step-panel hidden rounded-xl border border-primary/30 dark:border-primary/40 p-4 space-y-3 bg-white dark:bg-gray-800/90">
            <p class="text-sm font-semibold text-gray-800 dark:text-gray-100" id="uctStepEditorTitle">Новый шаг</p>
            <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1" for="uctStepTitle">Заголовок шага</label>
                <input id="uctStepTitle" type="text" maxlength="500" class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm" />
            </div>
            <div>
                <span id="uctStepBodyLabel" class="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Текст шага</span>
                <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Оформление — кнопками ниже. Вставка из буфера — только текст, без скрытого форматирования.</p>
                <div id="uctStepBodyHost" class="training-rich-editor-host" role="group" aria-labelledby="uctStepBodyLabel"></div>
            </div>
            <div class="border-t border-gray-200 dark:border-gray-600 pt-3 space-y-2">
                <label class="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input type="checkbox" id="uctHasQuiz" class="rounded border-gray-400" />
                    Мини-квиз для этого шага
                </label>
                <div id="uctQuizBox" class="hidden space-y-3">
                    <div id="uctQuizQuestions" class="space-y-3"></div>
                    <button type="button" id="uctQuizAddQ" class="text-xs px-2 py-1 rounded border border-gray-400 dark:border-gray-500">+ Вопрос</button>
                </div>
            </div>
            <div class="flex justify-end gap-2 pt-2">
                <button type="button" id="uctStepCancel" class="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm">Отмена</button>
                <button type="button" id="uctStepSave" class="px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium">Сохранить шаг</button>
            </div>
        </div>
        <div class="training-user-editor-blur-when-step">
        <div class="flex flex-wrap justify-between gap-2 pt-2 border-t border-gray-200 dark:border-gray-600">
            <div class="flex flex-wrap gap-2 items-center">
                <button type="button" id="uctDeleteTrack" class="px-3 py-2 rounded-xl text-sm text-red-600 bg-red-500/10 dark:bg-red-950/25 hover:bg-red-500/15 dark:hover:bg-red-950/40 hidden">Удалить модуль</button>
            </div>
            <div class="flex gap-2 ml-auto">
                <button type="button" id="uctCancelAll" class="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-sm">Закрыть</button>
                <button type="button" id="uctSaveTrack" class="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium">Сохранить модуль</button>
            </div>
        </div>
        </div>`;

    const titleEl = /** @type {HTMLTextAreaElement} */ (wrap.querySelector('#uctTitle'));
    const subEl = /** @type {HTMLTextAreaElement} */ (wrap.querySelector('#uctSubtitle'));
    const listEl = /** @type {HTMLUListElement} */ (wrap.querySelector('#uctStepList'));
    const emptyEl = /** @type {HTMLElement} */ (wrap.querySelector('#uctStepEmpty'));
    const editorEl = /** @type {HTMLElement} */ (wrap.querySelector('#uctStepEditor'));
    const stepTitleEl = /** @type {HTMLInputElement} */ (wrap.querySelector('#uctStepTitle'));
    const stepBodyHost = /** @type {HTMLElement | null} */ (wrap.querySelector('#uctStepBodyHost'));
    /** @type {ReturnType<typeof mountTrainingRichEditor> | null} */
    let stepBodyRich = null;
    const hasQuizEl = /** @type {HTMLInputElement} */ (wrap.querySelector('#uctHasQuiz'));
    const quizBox = /** @type {HTMLElement} */ (wrap.querySelector('#uctQuizBox'));
    const quizQuestionsEl = /** @type {HTMLElement} */ (wrap.querySelector('#uctQuizQuestions'));

    titleEl.value = draft.title || '';
    subEl.value = draft.subtitle || '';

    const delTrackBtn = /** @type {HTMLButtonElement | null} */ (wrap.querySelector('#uctDeleteTrack'));
    if (!isBuiltin && initial?.id) {
        delTrackBtn?.classList.remove('hidden');
    }

    /** @type {string[]} */
    let hist = [];
    let histPtr = 0;
    function snap() {
        return JSON.stringify({
            title: draft.title,
            subtitle: draft.subtitle || '',
            steps: JSON.parse(JSON.stringify(draft.steps)),
            createdAt: draft.createdAt,
            updatedAt: draft.updatedAt,
            id: draft.id,
        });
    }
    function applySnap(s) {
        const o = JSON.parse(s);
        draft.title = o.title;
        draft.subtitle = o.subtitle;
        draft.steps = o.steps;
        draft.createdAt = o.createdAt;
        draft.updatedAt = o.updatedAt;
        draft.id = o.id;
        titleEl.value = draft.title || '';
        subEl.value = draft.subtitle || '';
        renderStepList();
        clearStepEditor();
    }
    function recordHistory() {
        hist = hist.slice(0, histPtr + 1);
        hist.push(snap());
        histPtr = hist.length - 1;
        if (hist.length > 40) {
            hist.shift();
            histPtr--;
        }
        syncUr();
    }
    function doUndo() {
        if (histPtr <= 0) return;
        histPtr--;
        applySnap(hist[histPtr]);
        syncUr();
    }
    function doRedo() {
        if (histPtr >= hist.length - 1) return;
        histPtr++;
        applySnap(hist[histPtr]);
        syncUr();
    }
    function syncUr() {
        const ub = document.getElementById('trainingModalUndoBtn');
        const rb = document.getElementById('trainingModalRedoBtn');
        if (ub) ub.disabled = histPtr <= 0;
        if (rb) rb.disabled = histPtr >= hist.length - 1;
    }

    function parseOptions(text) {
        return String(text || '')
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);
    }

    /**
     * Как при сохранении: минимум два варианта (пустые строки допускаются в черновике).
     * @param {string} optsText
     * @returns {string[]}
     */
    function optionsForQuizRow(optsText) {
        let options = parseOptions(optsText);
        if (options.length < 2) {
            options = options.length === 1 ? [...options, ''] : ['', ''];
        }
        return options;
    }

    /**
     * @param {HTMLElement} row
     * @param {number} idx
     */
    function syncCorrectAnswerRadios(row, idx) {
        const taO = row.querySelector('[data-uct-qopts]');
        const host = row.querySelector('[data-uct-correct-host]');
        if (!taO || !host || !('value' in taO)) return;
        const options = optionsForQuizRow(String(taO.value));
        const prevChecked = row.querySelector('input[data-uct-qcorrect-radio]:checked');
        let sel = prevChecked
            ? parseInt(String(prevChecked.value), 10)
            : parseInt(row.getAttribute('data-uct-sel') || '0', 10);
        if (!Number.isFinite(sel)) sel = 0;
        sel = Math.max(0, Math.min(options.length - 1, sel));
        row.setAttribute('data-uct-sel', String(sel));
        host.innerHTML = '';
        const fs = document.createElement('fieldset');
        fs.className =
            'uct-q-correct-fieldset rounded-lg border border-gray-200 dark:border-gray-600 p-2 space-y-1.5 bg-white/60 dark:bg-gray-900/30';
        const leg = document.createElement('legend');
        leg.className = 'text-xs font-medium text-gray-600 dark:text-gray-400 px-1';
        leg.textContent = 'Верный ответ';
        fs.appendChild(leg);
        options.forEach((_opt, oi) => {
            const id = `uct_correct_${idx}_${oi}`;
            const lab = document.createElement('label');
            lab.className =
                'uct-q-correct-opt flex items-start gap-2 cursor-pointer text-sm text-gray-800 dark:text-gray-100 rounded-md px-1 py-0.5 -mx-0.5';
            lab.setAttribute('for', id);
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = `uct_correct_${idx}`;
            radio.id = id;
            radio.setAttribute('data-uct-qcorrect-radio', '');
            radio.value = String(oi);
            radio.className = 'mt-1 shrink-0';
            if (oi === sel) radio.checked = true;
            const span = document.createElement('span');
            span.className = 'min-w-0 leading-snug';
            const raw = String(options[oi] ?? '').trim();
            const line = `${oi + 1}. ${raw || '…'}`;
            span.textContent = line.length > 100 ? `${line.slice(0, 97).trim()}…` : line;
            lab.appendChild(radio);
            lab.appendChild(span);
            fs.appendChild(lab);
        });
        host.appendChild(fs);
    }

    /**
     * Черновики вопросов в редакторе (в т.ч. неполные — для «+ Вопрос»).
     * @returns {Array<{ question: string, options: string[], correctIndex: number }>}
     */
    function readQuizFromDom() {
        if (!hasQuizEl.checked) return [];
        const blocks = quizQuestionsEl.querySelectorAll('[data-uct-q]');
        /** @type {Array<{ question: string, options: string[], correctIndex: number }>} */
        const out = [];
        blocks.forEach((block) => {
            const qEl = block.querySelector('[data-uct-qtext]');
            const oEl = block.querySelector('[data-uct-qopts]');
            const question = qEl && 'value' in qEl ? String(qEl.value).trim() : '';
            const optsText = oEl && 'value' in oEl ? String(oEl.value) : '';
            const options = optionsForQuizRow(optsText);
            let correctIndex = 0;
            const checked = block.querySelector('input[data-uct-qcorrect-radio]:checked');
            if (checked && checked instanceof HTMLInputElement) {
                const v = parseInt(String(checked.value), 10);
                if (Number.isFinite(v)) correctIndex = v;
            } else {
                const d = block.getAttribute('data-uct-sel');
                const n = parseInt(d || '0', 10);
                if (Number.isFinite(n)) correctIndex = n;
            }
            correctIndex = Math.max(0, Math.min(options.length - 1, correctIndex));
            out.push({ question, options, correctIndex });
        });
        return out;
    }

    function renderQuizQuestions(quiz) {
        quizQuestionsEl.innerHTML = '';
        const items = Array.isArray(quiz) && quiz.length ? quiz : [{ question: '', options: [], correctIndex: 0 }];
        items.forEach((item, idx) => {
            const row = document.createElement('div');
            row.setAttribute('data-uct-q', String(idx));
            row.className = 'rounded-lg border border-gray-200 dark:border-gray-600 p-3 space-y-2 bg-gray-50 dark:bg-gray-900/50';
            const head = document.createElement('div');
            head.className = 'flex justify-between items-center gap-2';
            head.innerHTML = `<span class="text-xs font-medium text-gray-600 dark:text-gray-400">Вопрос ${idx + 1}</span>`;
            const rm = document.createElement('button');
            rm.type = 'button';
            rm.className =
                'training-modal-step-icon training-modal-danger-icon p-1.5 rounded-lg text-red-600';
            rm.setAttribute('aria-label', 'Удалить вопрос');
            rm.innerHTML = '<i class="fas fa-trash-alt text-xs" aria-hidden="true"></i>';
            rm.addEventListener('click', () => {
                row.remove();
                const cur = readQuizFromDom();
                if (!cur.length) renderQuizQuestions([]);
                else renderQuizQuestions(cur);
            });
            head.appendChild(rm);
            row.appendChild(head);
            const taQ = document.createElement('textarea');
            taQ.setAttribute('data-uct-qtext', '');
            taQ.rows = 2;
            taQ.maxLength = 2000;
            taQ.className =
                'training-modal-field-resize w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm resize-y min-h-[3rem] max-h-[40vh]';
            taQ.placeholder = 'Формулировка вопроса';
            taQ.value = item.question || '';
            row.appendChild(taQ);
            const lbO = document.createElement('label');
            lbO.className = 'block text-xs text-gray-500';
            lbO.textContent = 'Варианты (по одному в строке, минимум 2)';
            row.appendChild(lbO);
            const taO = document.createElement('textarea');
            taO.setAttribute('data-uct-qopts', '');
            taO.rows = 4;
            taO.className =
                'training-modal-field-resize w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm font-mono text-xs resize-y min-h-[4rem] max-h-[40vh]';
            taO.placeholder = 'Вариант A\nВариант B\nВариант C';
            taO.value = (item.options || []).join('\n');
            row.appendChild(taO);
            const correctHost = document.createElement('div');
            correctHost.setAttribute('data-uct-correct-host', '');
            row.appendChild(correctHost);
            const _olen = optionsForQuizRow(String(taO.value)).length;
            row.setAttribute(
                'data-uct-sel',
                String(Math.max(0, Math.min(_olen - 1, item.correctIndex ?? 0))),
            );
            row.addEventListener('change', (ev) => {
                const t = ev.target;
                if (t instanceof HTMLInputElement && t.type === 'radio' && t.hasAttribute('data-uct-qcorrect-radio')) {
                    row.setAttribute('data-uct-sel', t.value);
                }
            });
            taO.addEventListener('input', () => syncCorrectAnswerRadios(row, idx));
            syncCorrectAnswerRadios(row, idx);
            quizQuestionsEl.appendChild(row);
        });
    }

    function setStepFocusMode(on) {
        wrap.classList.toggle('training-user-editor--step-focus', on);
        wrap.querySelectorAll('.training-user-editor-blur-when-step').forEach((node) => {
            if (node instanceof HTMLElement) {
                node.inert = on;
            }
        });
    }

    function clearStepEditor() {
        editingStepIndex = null;
        editorEl.classList.add('hidden');
        setStepFocusMode(false);
        stepTitleEl.value = '';
        stepBodyRich?.destroy();
        stepBodyRich = null;
        if (stepBodyHost) stepBodyHost.innerHTML = '';
        hasQuizEl.checked = false;
        quizBox.classList.add('hidden');
        renderQuizQuestions([]);
    }

    function openStepEditor(index) {
        editingStepIndex = index;
        editorEl.classList.remove('hidden');
        const edTitle = wrap.querySelector('#uctStepEditorTitle');
        if (edTitle) edTitle.textContent = index === null ? 'Новый шаг' : 'Редактирование шага';
        editorEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        stepBodyRich?.destroy();
        stepBodyRich = null;
        if (stepBodyHost) stepBodyHost.innerHTML = '';
        if (stepBodyHost) {
            stepBodyRich = mountTrainingRichEditor(stepBodyHost, {
                ariaLabel: 'Текст шага',
                placeholder: 'Начните вводить материал шага…',
            });
        }
        if (index === null) {
            stepTitleEl.value = '';
            stepBodyRich?.setHtml('');
            hasQuizEl.checked = false;
            quizBox.classList.add('hidden');
            renderQuizQuestions([]);
        } else {
            const s = draft.steps[index];
            if (!s) return clearStepEditor();
            stepTitleEl.value = s.title;
            stepBodyRich?.setHtml(s.bodyHtml || '');
            const hasQ = !!(s.quiz && s.quiz.length);
            hasQuizEl.checked = hasQ;
            quizBox.classList.toggle('hidden', !hasQ);
            renderQuizQuestions(hasQ ? s.quiz : []);
        }
        setStepFocusMode(true);
        stepTitleEl.focus();
    }

    function handleStepListClick(e) {
        const btn = e.target.closest?.('button[data-act]');
        if (!btn || !(btn instanceof HTMLElement) || !listEl.contains(btn)) return;
        const act = btn.getAttribute('data-act');
        const si = parseInt(btn.getAttribute('data-idx') || '0', 10);
        if (act === 'up' && si > 0) {
            [draft.steps[si - 1], draft.steps[si]] = [draft.steps[si], draft.steps[si - 1]];
            renderStepList();
            recordHistory();
        } else if (act === 'down' && si < draft.steps.length - 1) {
            [draft.steps[si + 1], draft.steps[si]] = [draft.steps[si], draft.steps[si + 1]];
            renderStepList();
            recordHistory();
        } else if (act === 'edit') {
            openStepEditor(si);
        } else if (act === 'del') {
            draft.steps.splice(si, 1);
            clearStepEditor();
            renderStepList();
            recordHistory();
        }
    }

    function renderStepList() {
        listEl.innerHTML = '';
        const hasSteps = draft.steps.length > 0;
        listEl.classList.toggle('hidden', !hasSteps);
        listEl.setAttribute('aria-hidden', hasSteps ? 'false' : 'true');
        emptyEl.classList.toggle('hidden', hasSteps);
        draft.steps.forEach((s, i) => {
            const li = document.createElement('li');
            li.className =
                'flex flex-wrap items-center gap-2 p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600';
            li.innerHTML = `
                <span class="flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-gray-100 truncate">${escapeModalHtml(s.title)}</span>
                <button type="button" data-idx="${i}" data-act="up" class="training-modal-step-move text-primary text-xs px-2 py-1 rounded-lg" aria-label="Выше">↑</button>
                <button type="button" data-idx="${i}" data-act="down" class="training-modal-step-move text-primary text-xs px-2 py-1 rounded-lg" aria-label="Ниже">↓</button>
                <button type="button" data-idx="${i}" data-act="edit" class="training-modal-step-icon p-1.5 rounded-lg text-primary" aria-label="Изменить"><i class="fas fa-pen text-xs" aria-hidden="true"></i></button>
                <button type="button" data-idx="${i}" data-act="del" class="training-modal-step-icon training-modal-danger-icon p-1.5 rounded-lg text-red-600" aria-label="Удалить шаг"><i class="fas fa-trash-alt text-xs" aria-hidden="true"></i></button>`;
            listEl.appendChild(li);
        });
    }

    hasQuizEl.addEventListener('change', () => {
        quizBox.classList.toggle('hidden', !hasQuizEl.checked);
        if (hasQuizEl.checked && !quizQuestionsEl.querySelector('[data-uct-q]')) {
            renderQuizQuestions([]);
        }
    });

    wrap.querySelector('#uctQuizAddQ')?.addEventListener('click', () => {
        const cur = readQuizFromDom();
        cur.push({ question: '', options: [], correctIndex: 0 });
        renderQuizQuestions(cur);
    });

    wrap.querySelector('#uctAddStep')?.addEventListener('click', () => openStepEditor(null));

    wrap.querySelector('#uctStepCancel')?.addEventListener('click', () => clearStepEditor());

    wrap.querySelector('#uctStepSave')?.addEventListener('click', () => {
        const st = stepTitleEl.value.trim();
        const body = stepBodyRich?.getHtml() ?? '';
        const shake = (/** @type {HTMLElement | null} */ el) =>
            el?.animate(
                [
                    { transform: 'translateX(0)' },
                    { transform: 'translateX(-4px)' },
                    { transform: 'translateX(4px)' },
                    { transform: 'translateX(0)' },
                ],
                { duration: 280 },
            );
        if (!st) {
            shake(stepTitleEl);
            return;
        }
        if (isRichTextMeaningfullyEmpty(body)) {
            shake(stepBodyHost);
            return;
        }
        const rawQuiz = readQuizFromDom();
        const qz = rawQuiz.map((q) => normalizeQuizItem(q)).filter(Boolean);
        if (hasQuizEl.checked && !qz.length) {
            shake(quizBox);
            return;
        }
        /** @type {TrainingStep} */
        const step = {
            id:
                editingStepIndex !== null && draft.steps[editingStepIndex]
                    ? draft.steps[editingStepIndex].id
                    : '',
            title: st,
            bodyHtml: body,
        };
        if (!step.id) {
            step.id =
                typeof crypto !== 'undefined' && crypto.randomUUID
                    ? `st-${crypto.randomUUID().slice(0, 10)}`
                    : `st-${Date.now().toString(36)}`;
        }
        if (qz.length) step.quiz = qz;
        if (editingStepIndex === null) {
            draft.steps.push(step);
        } else {
            draft.steps[editingStepIndex] = step;
        }
        clearStepEditor();
        renderStepList();
        recordHistory();
    });

    wrap.querySelector('#uctCancelAll')?.addEventListener('click', () => closeTrainingModal());

    wrap.querySelector('#uctDeleteTrack')?.addEventListener('click', async () => {
        if (!initial?.id || !p.onDelete) return;
        try {
            await p.onDelete(initial.id);
        } catch {
            // родитель показывает уведомление
        }
    });

    wrap.querySelector('#uctSaveTrack')?.addEventListener('click', async () => {
        const tit = titleEl.value.trim();
        if (!tit) {
            titleEl.focus();
            return;
        }
        if (draft.steps.length < 1) {
            depsNotifyMissingSteps();
            return;
        }
        draft.title = tit;
        draft.subtitle = subEl.value.trim();
        try {
            await p.onSave(/** @type {TrainingTrack} */ (draft));
            closeTrainingModal();
        } catch {
            // окно открыто — пользователь может исправить и повторить
        }
    });

    function depsNotifyMissingSteps() {
        const w = /** @type {HTMLElement} */ (wrap.querySelector('#uctSaveTrack'));
        w?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 280 });
    }

    hist.push(snap());
    histPtr = 0;

    mountTrainingModal({
        title: isBuiltin
            ? `Стандартные материалы: ${initial?.title || 'редактор'}`
            : initial
              ? 'Редактировать модуль'
              : 'Новый учебный модуль',
        bodyEl: wrap,
        wide: true,
        showUndoRedo: true,
        showFullscreen: true,
        modalId: 'trainingUserCurriculumModal',
    });

    const trainingModalEl = document.getElementById('trainingUserCurriculumModal');
    trainingModalEl?.addEventListener(
        'keydown',
        (e) => {
            if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
            e.preventDefault();
            if (e.shiftKey) doRedo();
            else doUndo();
        },
        true,
    );
    document.getElementById('trainingModalUndoBtn')?.addEventListener('click', () => doUndo());
    document.getElementById('trainingModalRedoBtn')?.addEventListener('click', () => doRedo());
    syncUr();

    if (!listEl.dataset.stepListBound) {
        listEl.dataset.stepListBound = '1';
        listEl.addEventListener('click', handleStepListClick);
    }

    renderStepList();
}

