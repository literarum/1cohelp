'use strict';

/**
 * Модальное окно наставника: квиз-пакет (инструкция + вопросы).
 * Разметка вопросов сознательно близка к редактору шага в openUserCurriculumEditorModal —
 * при изменении схемы квиза сверять оба места.
 */

import {
    isRichTextMeaningfullyEmpty,
    normalizeQuizItem,
    sanitizeTrainingBodyHtml,
} from './training-user-curriculum.js';
import { mountTrainingRichEditor } from './training-rich-editor.js';
import { newMentorPackId } from './training-mentor-packs.js';
import { mountTrainingModal, closeTrainingModal } from './training-ui-modals.js';

/**
 * @typedef {import('./training-mentor-packs.js').MentorQuizPack} MentorQuizPack
 */

function parseOptions(text) {
    return String(text || '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
}

/**
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
    const taO = row.querySelector('[data-mq-qopts]');
    const host = row.querySelector('[data-mq-correct-host]');
    if (!taO || !host || !('value' in taO)) return;
    const options = optionsForQuizRow(String(taO.value));
    const prevChecked = row.querySelector('input[data-mq-qcorrect-radio]:checked');
    let sel = prevChecked
        ? parseInt(String(prevChecked.value), 10)
        : parseInt(row.getAttribute('data-mq-sel') || '0', 10);
    if (!Number.isFinite(sel)) sel = 0;
    sel = Math.max(0, Math.min(options.length - 1, sel));
    row.setAttribute('data-mq-sel', String(sel));
    host.innerHTML = '';
    const fs = document.createElement('fieldset');
    fs.className =
        'mq-q-correct-fieldset rounded-lg border border-gray-200 dark:border-gray-600 p-2 space-y-1.5 bg-white/60 dark:bg-gray-900/30';
    const leg = document.createElement('legend');
    leg.className = 'text-xs font-medium text-gray-600 dark:text-gray-400 px-1';
    leg.textContent = 'Верный ответ';
    fs.appendChild(leg);
    options.forEach((_opt, oi) => {
        const id = `mq_correct_${idx}_${oi}`;
        const lab = document.createElement('label');
        lab.className =
            'mq-q-correct-opt flex items-start gap-2 cursor-pointer text-sm text-gray-800 dark:text-gray-100 rounded-md px-1 py-0.5 -mx-0.5';
        lab.setAttribute('for', id);
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `mq_correct_${idx}`;
        radio.id = id;
        radio.setAttribute('data-mq-qcorrect-radio', '');
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
 * @param {HTMLElement} quizQuestionsEl
 * @returns {Array<{ question: string, options: string[], correctIndex: number }>}
 */
function readQuizFromDom(quizQuestionsEl) {
    const blocks = quizQuestionsEl.querySelectorAll('[data-mq-q]');
    /** @type {Array<{ question: string, options: string[], correctIndex: number }>} */
    const out = [];
    blocks.forEach((block) => {
        const qEl = block.querySelector('[data-mq-qtext]');
        const oEl = block.querySelector('[data-mq-qopts]');
        const question = qEl && 'value' in qEl ? String(qEl.value).trim() : '';
        const optsText = oEl && 'value' in oEl ? String(oEl.value) : '';
        const options = optionsForQuizRow(optsText);
        let correctIndex = 0;
        const checked = block.querySelector('input[data-mq-qcorrect-radio]:checked');
        if (checked && checked instanceof HTMLInputElement) {
            const v = parseInt(String(checked.value), 10);
            if (Number.isFinite(v)) correctIndex = v;
        } else {
            const d = block.getAttribute('data-mq-sel');
            const n = parseInt(d || '0', 10);
            if (Number.isFinite(n)) correctIndex = n;
        }
        correctIndex = Math.max(0, Math.min(options.length - 1, correctIndex));
        out.push({ question, options, correctIndex });
    });
    return out;
}

/**
 * @param {HTMLElement} quizQuestionsEl
 * @param {Array<{ question?: string, options?: string[], correctIndex?: number }>} items
 */
function renderQuizQuestions(quizQuestionsEl, items) {
    quizQuestionsEl.innerHTML = '';
    const list =
        Array.isArray(items) && items.length
            ? items
            : [{ question: '', options: [], correctIndex: 0 }];
    list.forEach((item, idx) => {
        const row = document.createElement('div');
        row.setAttribute('data-mq-q', String(idx));
        row.className =
            'rounded-lg border border-gray-200 dark:border-gray-600 p-3 space-y-2 bg-gray-50 dark:bg-gray-900/50';
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
            const cur = readQuizFromDom(quizQuestionsEl);
            if (!cur.length) renderQuizQuestions(quizQuestionsEl, []);
            else renderQuizQuestions(quizQuestionsEl, cur);
        });
        head.appendChild(rm);
        row.appendChild(head);
        const taQ = document.createElement('textarea');
        taQ.setAttribute('data-mq-qtext', '');
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
        taO.setAttribute('data-mq-qopts', '');
        taO.rows = 4;
        taO.className =
            'training-modal-field-resize w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm font-mono text-xs resize-y min-h-[4rem] max-h-[40vh]';
        taO.placeholder = 'Вариант A\nВариант B\nВариант C';
        taO.value = (item.options || []).join('\n');
        row.appendChild(taO);
        const correctHost = document.createElement('div');
        correctHost.setAttribute('data-mq-correct-host', '');
        row.appendChild(correctHost);
        const _olen = optionsForQuizRow(String(taO.value)).length;
        row.setAttribute(
            'data-mq-sel',
            String(Math.max(0, Math.min(_olen - 1, item.correctIndex ?? 0))),
        );
        row.addEventListener('change', (ev) => {
            const t = ev.target;
            if (
                t instanceof HTMLInputElement &&
                t.type === 'radio' &&
                t.hasAttribute('data-mq-qcorrect-radio')
            ) {
                row.setAttribute('data-mq-sel', t.value);
            }
        });
        taO.addEventListener('input', () => syncCorrectAnswerRadios(row, idx));
        syncCorrectAnswerRadios(row, idx);
        quizQuestionsEl.appendChild(row);
    });
}

/**
 * @param {object} p
 * @param {MentorQuizPack | null} [p.initialPack]
 * @param {(pack: MentorQuizPack) => Promise<void>} p.onSave
 */
export function openMentorQuizPackEditorModal(p) {
    const initial = p.initialPack;
    /** @type {MentorQuizPack} */
    const draft = initial
        ? { ...initial, questions: [...initial.questions] }
        : {
              id: '',
              title: '',
              subtitle: '',
              instructionsHtml: '',
              questions: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
          };

    const wrap = document.createElement('div');
    wrap.className = 'training-mentor-editor space-y-4';
    wrap.innerHTML = `
        <p class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            Соберите квиз для ученика. Сохранённый пакет можно <strong>выгрузить в файл</strong> и открыть в другом Copilot 1СО.
            Ученик импортирует файл и нажимает «Отправить в учебник» — модуль появится в разделе «Учебник».
        </p>
        <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1" for="mqTitle">Название теста</label>
            <textarea id="mqTitle" rows="2" maxlength="500"
                class="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm training-modal-field-resize resize-y min-h-[2.75rem] max-h-[20vh]"></textarea>
        </div>
        <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1" for="mqSubtitle">Подзаголовок (необязательно)</label>
            <textarea id="mqSubtitle" rows="2" maxlength="500"
                class="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm training-modal-field-resize resize-y min-h-[2.5rem] max-h-[16vh]"></textarea>
        </div>
        <div>
            <span id="mqInstrLabel" class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Инструкция для ученика</span>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Контекст перед вопросами: цели, ограничения, что учитывать при ответе.</p>
            <div id="mqInstrHost" class="training-rich-editor-host" role="group" aria-labelledby="mqInstrLabel"></div>
        </div>
        <div class="rounded-xl border border-gray-200 dark:border-gray-600 p-3 bg-gray-50/80 dark:bg-gray-900/40">
            <div class="flex items-center justify-between gap-2 mb-2">
                <span class="text-sm font-semibold text-gray-800 dark:text-gray-100">Вопросы</span>
                <button type="button" id="mqAddQ" class="text-sm px-3 py-1.5 rounded-lg bg-primary text-white font-medium">+ Вопрос</button>
            </div>
            <div id="mqQuestions" class="space-y-3 max-h-[min(40vh,480px)] overflow-y-auto pr-1"></div>
        </div>
        <div class="flex flex-wrap justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-600">
            <button type="button" id="mqCancel" class="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-sm">Закрыть</button>
            <button type="button" id="mqSave" class="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium">Сохранить пакет</button>
        </div>`;

    const titleEl = /** @type {HTMLTextAreaElement} */ (wrap.querySelector('#mqTitle'));
    const subEl = /** @type {HTMLTextAreaElement} */ (wrap.querySelector('#mqSubtitle'));
    const instrHost = /** @type {HTMLElement} */ (wrap.querySelector('#mqInstrHost'));
    const quizBox = /** @type {HTMLElement} */ (wrap.querySelector('#mqQuestions'));

    titleEl.value = draft.title || '';
    subEl.value = draft.subtitle || '';

    const instrRich = mountTrainingRichEditor(instrHost, {
        ariaLabel: 'Инструкция для ученика',
        placeholder: 'Кратко опишите задание…',
    });
    instrRich.setHtml(draft.instructionsHtml || '');

    renderQuizQuestions(quizBox, draft.questions.length ? draft.questions : []);

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

    wrap.querySelector('#mqAddQ')?.addEventListener('click', () => {
        const cur = readQuizFromDom(quizBox);
        cur.push({ question: '', options: [], correctIndex: 0 });
        renderQuizQuestions(quizBox, cur);
    });

    wrap.querySelector('#mqCancel')?.addEventListener('click', () => closeTrainingModal());

    wrap.querySelector('#mqSave')?.addEventListener('click', async () => {
        const tit = titleEl.value.trim();
        if (!tit) {
            shake(titleEl);
            titleEl.focus();
            return;
        }
        const body = instrRich.getHtml();
        if (isRichTextMeaningfullyEmpty(body)) {
            shake(instrHost);
            return;
        }
        const rawQuiz = readQuizFromDom(quizBox);
        const qz = rawQuiz.map((q) => normalizeQuizItem(q)).filter(Boolean);
        if (!qz.length) {
            shake(quizBox);
            return;
        }
        const now = new Date().toISOString();
        const packId =
            draft.id && String(draft.id).startsWith('mentor-') ? draft.id : newMentorPackId();
        /** @type {MentorQuizPack} */
        const out = {
            id: packId,
            title: tit,
            subtitle: subEl.value.trim() || undefined,
            instructionsHtml: sanitizeTrainingBodyHtml(body),
            questions: qz,
            createdAt: initial?.createdAt || now,
            updatedAt: now,
        };
        try {
            await p.onSave(/** @type {MentorQuizPack} */ (out));
            closeTrainingModal();
        } catch {
            // окно остаётся открытым
        }
    });

    mountTrainingModal({
        title: initial ? 'Редактирование квиз-пакета' : 'Наставник: новый квиз-тест',
        bodyEl: wrap,
        ultraWide: true,
        showFullscreen: true,
        modalId: 'trainingMentorQuizModal',
    });
}
