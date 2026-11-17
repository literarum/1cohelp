'use strict';

/**
 * Чек-лист по главному алгоритму: во время звонка отмечать пройденные шаги.
 * Состояние — в localStorage (переживает перезагрузку), сбрасывается кнопкой
 * или автоматически при «Новом обращении».
 */

export const CHECKLIST_KEY = 'copilot.mainChecklist.v1';

export function readChecklist() {
    try {
        const raw = JSON.parse(localStorage.getItem(CHECKLIST_KEY) || 'null');
        return Array.isArray(raw?.done) ? new Set(raw.done.filter(Number.isInteger)) : new Set();
    } catch {
        return new Set();
    }
}

export function writeChecklist(done) {
    try {
        if (!done.size) localStorage.removeItem(CHECKLIST_KEY);
        else localStorage.setItem(CHECKLIST_KEY, JSON.stringify({ done: [...done].sort((a, b) => a - b), updatedAt: Date.now() }));
    } catch {
        /* хранилище недоступно */
    }
}

export function formatProgress(doneCount, total) {
    return total ? `Пройдено ${doneCount} из ${total}` : '';
}

let observer = null;

function decorate(container) {
    const steps = Array.from(container.querySelectorAll(':scope > .algorithm-step[data-step-index], .algorithm-step[data-step-index]'));
    const done = readChecklist();
    for (const step of steps) {
        const idx = Number(step.getAttribute('data-step-index'));
        let btn = step.querySelector(':scope > .mc-toggle');
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mc-toggle';
            btn.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i>';
            step.appendChild(btn);
        }
        const isDone = done.has(idx);
        btn.setAttribute('aria-pressed', String(isDone));
        btn.title = isDone ? 'Шаг пройден — нажмите, чтобы снять отметку' : 'Отметить шаг пройденным';
        btn.setAttribute('aria-label', `${btn.title}: шаг ${idx + 1}`);
        step.classList.toggle('mc-done', isDone);
    }
    const bar = ensureBar(container);
    const total = steps.length;
    const count = steps.filter((s) => done.has(Number(s.getAttribute('data-step-index')))).length;
    bar.hidden = count === 0;
    bar.querySelector('[data-mc-text]').textContent = formatProgress(count, total);
    bar.querySelector('[data-mc-fill]').style.width = total ? `${(count / total) * 100}%` : '0%';
}

function ensureBar(container) {
    let bar = document.getElementById('mainChecklistBar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'mainChecklistBar';
        bar.className = 'mc-bar';
        bar.setAttribute('role', 'status');
        bar.innerHTML = '<span data-mc-text></span><span class="mc-track" aria-hidden="true"><span data-mc-fill></span></span><button type="button" class="mc-reset">Сбросить</button>';
        container.parentElement?.insertBefore(bar, container);
        bar.querySelector('.mc-reset').addEventListener('click', () => {
            writeChecklist(new Set());
            decorate(container);
        });
    }
    return bar;
}

export function initMainChecklist() {
    const container = document.getElementById('mainAlgorithm');
    if (!container || observer) return;
    container.addEventListener(
        'click',
        (e) => {
            const btn = e.target instanceof Element ? e.target.closest('.mc-toggle') : null;
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            const idx = Number(btn.closest('[data-step-index]')?.getAttribute('data-step-index'));
            if (!Number.isInteger(idx)) return;
            const done = readChecklist();
            if (done.has(idx)) done.delete(idx);
            else done.add(idx);
            writeChecklist(done);
            decorate(container);
        },
        true,
    );
    let scheduled = false;
    observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            observer.disconnect();
            decorate(container);
            observer.observe(container, { childList: true, subtree: false });
        });
    });
    decorate(container);
    observer.observe(container, { childList: true, subtree: false });
    document.addEventListener('copilot1co:new-appeal', () => {
        writeChecklist(new Set());
        decorate(container);
    });
}
