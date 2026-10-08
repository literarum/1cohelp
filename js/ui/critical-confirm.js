'use strict';

/**
 * Критичное двухшаговое подтверждение для необратимых «удалить / очистить всё».
 * Шаг 1 — что именно будет потеряно и что останется. Шаг 2 — финальное подтверждение
 * (флажок «Я понимаю…» включает красную кнопку). Esc, крестик, клик по фону и «Отмена» — отмена.
 *
 * @param {Object} o
 * @param {string} o.title            — заголовок («Очистить всё избранное?»)
 * @param {string} o.what             — что будет удалено (одна-две фразы)
 * @param {string[]} [o.consequences] — маркированные последствия/потери
 * @param {string} [o.keeps]          — что НЕ затрагивается
 * @param {string} [o.hint]           — совет (например, сначала сделать экспорт)
 * @param {string} [o.confirmLabel]   — подпись финальной кнопки
 * @param {string} [o.ackText]        — текст флажка
 * @returns {Promise<boolean>}
 */
import { activateModalFocus, deactivateModalFocus } from './modals-manager.js';

let seq = 0;

function esc(s) {
    return String(s ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
}

export function confirmCriticalDeletion(o = {}) {
    if (typeof document === 'undefined') return Promise.resolve(false);
    const id = `criticalConfirm${++seq}`;
    const title = o.title || 'Удалить безвозвратно?';
    const items = Array.isArray(o.consequences) ? o.consequences.filter(Boolean) : [];
    const confirmLabel = o.confirmLabel || 'Да, удалить безвозвратно';
    const ackText =
        o.ackText || 'Я понимаю, что данные будут удалены без возможности восстановления.';

    const modal = document.createElement('div');
    modal.id = id;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', `${id}-title`);
    modal.setAttribute('data-critical-confirm', '');
    modal.className =
        'critical-confirm fixed inset-0 bg-black/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4';
    modal.innerHTML = `
<div class="critical-confirm__panel bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-red-200 dark:border-red-900/60">
  <header class="flex-shrink-0 flex items-center justify-between gap-3 p-4 border-b border-gray-200 dark:border-gray-600">
    <h3 id="${id}-title" class="text-lg font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
      <i class="fas fa-exclamation-triangle" aria-hidden="true"></i><span data-cc-title>${esc(title)}</span>
    </h3>
    <button type="button" data-cc-close class="h-9 w-9 rounded-full flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 text-2xl leading-none" aria-label="Закрыть без удаления">×</button>
  </header>
  <div class="p-4 flex flex-col gap-3 text-sm leading-relaxed text-gray-800 dark:text-gray-200 overflow-y-auto custom-scrollbar">
    <div data-cc-step="1" class="flex flex-col gap-3">
      <p>${esc(o.what || '')}</p>
      ${
          items.length
              ? `<ul class="list-disc pl-5 space-y-1">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
              : ''
      }
      ${o.keeps ? `<p class="text-gray-600 dark:text-gray-400">${esc(o.keeps)}</p>` : ''}
      <p class="font-semibold text-red-700 dark:text-red-400">Это действие нельзя отменить.${o.hint ? ' ' + esc(o.hint) : ''}</p>
    </div>
    <div data-cc-step="2" class="hidden flex flex-col gap-3">
      <p class="font-semibold text-red-700 dark:text-red-400">Последнее подтверждение</p>
      <p>${esc(o.what || title)}</p>
      <label class="flex items-start gap-3 cursor-pointer select-none">
        <input type="checkbox" data-cc-ack class="mt-1 rounded border-gray-300 text-primary focus:ring-primary" />
        <span>${esc(ackText)}</span>
      </label>
    </div>
  </div>
  <footer class="flex-shrink-0 flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 rounded-b-xl">
    <button type="button" data-cc-cancel class="px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-100 dark:hover:bg-gray-700">Отмена</button>
    <button type="button" data-cc-next class="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-medium shadow-sm">Продолжить…</button>
    <button type="button" data-cc-confirm disabled aria-disabled="true" class="hidden px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium shadow-sm">${esc(confirmLabel)}</button>
  </footer>
</div>`;

    return new Promise((resolve) => {
        let done = false;
        const $ = (sel) => modal.querySelector(sel);
        const step1 = $('[data-cc-step="1"]');
        const step2 = $('[data-cc-step="2"]');
        const next = $('[data-cc-next]');
        const confirmBtn = $('[data-cc-confirm]');
        const ack = $('[data-cc-ack]');

        const finish = (result) => {
            if (done) return;
            done = true;
            document.removeEventListener('keydown', onKey, true);
            try {
                deactivateModalFocus(modal);
            } catch {
                /* ignore */
            }
            modal.remove();
            if (!document.querySelector('[role="dialog"].fixed:not(.hidden)')) {
                document.body.classList.remove('overflow-hidden', 'modal-open');
            }
            resolve(result);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                finish(false);
            }
        };

        $('[data-cc-close]').addEventListener('click', () => finish(false));
        $('[data-cc-cancel]').addEventListener('click', () => finish(false));
        modal.addEventListener('mousedown', (e) => {
            if (e.target === modal) finish(false);
        });
        next.addEventListener('click', () => {
            step1.classList.add('hidden');
            step2.classList.remove('hidden');
            next.classList.add('hidden');
            confirmBtn.classList.remove('hidden');
            ack.focus();
        });
        ack.addEventListener('change', () => {
            confirmBtn.disabled = !ack.checked;
            confirmBtn.setAttribute('aria-disabled', String(!ack.checked));
        });
        confirmBtn.addEventListener('click', () => {
            if (ack.checked) finish(true);
        });

        document.body.appendChild(modal);
        document.body.classList.add('overflow-hidden', 'modal-open');
        document.addEventListener('keydown', onKey, true);
        try {
            activateModalFocus(modal);
        } catch {
            /* ignore */
        }
        next.focus();
    });
}
