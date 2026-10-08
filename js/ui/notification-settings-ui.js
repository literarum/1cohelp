'use strict';

/**
 * Окно «Уведомления» (Настройки → Уведомления). Все изменения применяются сразу и хранятся в
 * localStorage (см. services/notification-prefs.js). Окно строится из JS и открывается штатным
 * openAnimatedModal, поэтому получает общие механики модалок (фокус, Esc, «Назад» на телефоне).
 */

import {
    getPrefs,
    setPrefs,
    resetPrefs,
    unmuteNotification,
    clearMuted,
    onPrefsChange,
    isInDndWindow,
    TOAST_POSITIONS,
    TYPE_LABELS,
} from '../services/notification-prefs.js';
import { NotificationService } from '../services/notification.js';
import { createAppToggle } from './app-toggle.js';
import { openAnimatedModal, closeAnimatedModal } from '../utils/modal.js';

const MODAL_ID = 'notificationSettingsModal';
const TYPE_ICONS = {
    success: 'fa-check-circle',
    info: 'fa-info-circle',
    warning: 'fa-exclamation-triangle',
    error: 'fa-times-circle',
};
const TYPE_HINT = {
    success: 'Подтверждения: «Сохранено», «Скопировано»',
    info: 'Подсказки и сообщения о ходе работы',
    warning: 'Предупреждения о возможных проблемах',
    error: 'Ошибки и сбои (рекомендуем оставить включёнными)',
};

function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
}

function row(title, hint, control) {
    const r = el('div', 'ns-row');
    const left = el('div', 'ns-row__text');
    left.appendChild(el('div', 'ns-row__title', title));
    if (hint) left.appendChild(el('div', 'ns-row__hint', hint));
    r.appendChild(left);
    r.appendChild(control);
    return r;
}

function toggleControl(id, checked, onChange, label) {
    const { root, input } = createAppToggle({ id, checked });
    input.setAttribute('aria-label', label);
    input.addEventListener('change', () => onChange(input.checked));
    return { root, input };
}

function section(title, icon) {
    const s = el('section', 'ns-section');
    const h = el('h3', 'ns-section__title');
    const i = el('i', `fas ${icon}`);
    i.setAttribute('aria-hidden', 'true');
    h.append(i, document.createTextNode(title));
    s.appendChild(h);
    return s;
}

export function formatSeconds(ms) {
    const s = ms / 1000;
    return `${s % 1 === 0 ? s : s.toFixed(1)} с`;
}

function buildModal() {
    const modal = el(
        'div',
        'fixed inset-0 bg-black bg-opacity-60 hidden z-[85] p-4 overflow-y-auto',
    );
    modal.id = MODAL_ID;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'notificationSettingsTitle');

    const shell = el('div', 'flex items-center justify-center min-h-full');
    const panel = el(
        'div',
        'bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[88vh] flex flex-col modal-inner-container notif-settings',
    );
    const head = el('div', 'p-5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0');
    const headRow = el('div', 'flex justify-between items-center gap-3');
    const title = el('h2', 'text-xl font-bold flex items-center');
    title.id = 'notificationSettingsTitle';
    title.innerHTML = '<i class="fas fa-bell mr-3 text-primary" aria-hidden="true"></i>Уведомления';
    const close = el(
        'button',
        'p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
    );
    close.type = 'button';
    close.id = 'closeNotificationSettingsModalBtn';
    close.title = 'Закрыть (Esc)';
    close.setAttribute('aria-label', 'Закрыть');
    close.innerHTML = '<i class="fas fa-times text-xl" aria-hidden="true"></i>';
    headRow.append(title, close);
    head.appendChild(headRow);

    const body = el('div', 'p-5 overflow-y-auto flex-1 min-h-0 ns-body');
    body.id = 'notificationSettingsBody';

    const foot = el(
        'div',
        'p-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-2 justify-between flex-shrink-0',
    );
    const reset = el('button', 'ns-btn', 'Сбросить настройки');
    reset.type = 'button';
    reset.id = 'notificationSettingsResetBtn';
    const test = el('button', 'ns-btn', 'Показать пример');
    test.type = 'button';
    test.id = 'notificationSettingsTestBtn';
    const ok = el('button', 'ns-btn ns-btn--primary', 'Готово');
    ok.type = 'button';
    ok.id = 'notificationSettingsDoneBtn';
    const left = el('div', 'flex flex-wrap gap-2');
    left.append(reset, test);
    foot.append(left, ok);

    panel.append(head, body, foot);
    shell.appendChild(panel);
    modal.appendChild(shell);
    document.body.appendChild(modal);

    const doClose = () => closeAnimatedModal(modal);
    close.addEventListener('click', doClose);
    ok.addEventListener('click', doClose);
    test.addEventListener('click', () => {
        const base = { force: true, dedupe: false };
        NotificationService.show({ ...base, type: 'success', message: 'Так выглядит успешное действие.' });
        NotificationService.show({ ...base, type: 'info', message: 'Так выглядит информационное сообщение.' });
        NotificationService.show({
            ...base,
            type: 'warning',
            message: 'Так выглядит предупреждение.',
            sticky: false,
            muteable: false,
        });
        NotificationService.show({
            ...base,
            type: 'error',
            title: 'Пример ошибки',
            message: 'Так выглядит ошибка с кнопками действий.',
            muteable: false,
            diagnostics: false,
        });
    });
    reset.addEventListener('click', () => {
        resetPrefs({ keepMuted: true });
        render(body);
    });
    modal.addEventListener('mousedown', (e) => {
        if (e.target === modal || e.target === shell) modal._downOnBackdrop = true;
        else modal._downOnBackdrop = false;
    });
    modal.addEventListener('click', (e) => {
        if ((e.target === modal || e.target === shell) && modal._downOnBackdrop) doClose();
    });
    return modal;
}

function render(body) {
    const p = getPrefs();
    body.textContent = '';

    // --- Общие ---
    const general = section('Общие', 'fa-sliders-h');
    const master = toggleControl(
        'nsEnabled',
        p.enabled,
        (v) => {
            setPrefs({ enabled: v });
            render(body);
        },
        'Показывать уведомления',
    );
    general.appendChild(
        row(
            'Показывать уведомления',
            'Главный выключатель. Служебные индикаторы выполнения операций остаются.',
            master.root,
        ),
    );
    body.appendChild(general);

    const disabledNote = !p.enabled;

    // --- Типы ---
    const types = section('Какие уведомления показывать', 'fa-filter');
    for (const t of Object.keys(TYPE_LABELS)) {
        const tg = toggleControl(
            `nsType_${t}`,
            p.types[t],
            (v) => setPrefs({ types: { [t]: v } }),
            TYPE_LABELS[t],
        );
        if (disabledNote) tg.input.disabled = true;
        const r = row(TYPE_LABELS[t], TYPE_HINT[t], tg.root);
        const ic = el('i', `fas ${TYPE_ICONS[t]} ns-type-icon ns-type-icon--${t}`);
        ic.setAttribute('aria-hidden', 'true');
        r.insertBefore(ic, r.firstChild);
        types.appendChild(r);
    }
    body.appendChild(types);

    // --- Поведение ---
    const beh = section('Поведение', 'fa-hourglass-half');

    const durWrap = el('div', 'ns-range');
    const dur = document.createElement('input');
    dur.type = 'range';
    dur.min = '0.5';
    dur.max = '3';
    dur.step = '0.25';
    dur.value = String(p.durationScale);
    dur.id = 'nsDuration';
    dur.setAttribute('aria-label', 'Длительность показа');
    const durVal = el('output', 'ns-range__val');
    const showDur = () => {
        const v = Number(dur.value);
        durVal.textContent = `×${v}  (успех ≈ ${formatSeconds(3500 * v)}, ошибка ≈ ${formatSeconds(9000 * v)})`;
    };
    showDur();
    dur.addEventListener('input', showDur);
    dur.addEventListener('change', () => setPrefs({ durationScale: Number(dur.value) }));
    durWrap.append(dur, durVal);
    beh.appendChild(row('Как долго показывать', 'Сдвиньте влево — исчезают быстрее, вправо — дольше.', durWrap));

    const maxWrap = el('div', 'ns-stepper');
    const minus = el('button', 'ns-btn ns-btn--icon', '−');
    minus.type = 'button';
    minus.setAttribute('aria-label', 'Меньше');
    const maxVal = el('span', 'ns-stepper__val', String(p.maxVisible));
    const plus = el('button', 'ns-btn ns-btn--icon', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', 'Больше');
    const stepMax = (d) => {
        const n = Math.min(6, Math.max(1, getPrefs().maxVisible + d));
        setPrefs({ maxVisible: n });
        maxVal.textContent = String(n);
    };
    minus.addEventListener('click', () => stepMax(-1));
    plus.addEventListener('click', () => stepMax(1));
    maxWrap.append(minus, maxVal, plus);
    beh.appendChild(row('Одновременно на экране', 'Остальные ждут в очереди. Ошибки показываются сразу.', maxWrap));

    beh.appendChild(
        row(
            'Группировать одинаковые',
            'Повторы объединяются в одно уведомление со счётчиком ×N.',
            toggleControl('nsGroup', p.groupDuplicates, (v) => setPrefs({ groupDuplicates: v }), 'Группировать').root,
        ),
    );
    beh.appendChild(
        row(
            'Пауза при наведении',
            'Пока курсор над уведомлением, таймер закрытия стоит.',
            toggleControl('nsHover', p.pauseOnHover, (v) => setPrefs({ pauseOnHover: v }), 'Пауза').root,
        ),
    );
    body.appendChild(beh);

    // --- Вид ---
    const look = section('Расположение', 'fa-arrows-alt');
    const grid = el('div', 'ns-pos-grid');
    grid.setAttribute('role', 'radiogroup');
    grid.setAttribute('aria-label', 'Расположение уведомлений');
    for (const [id, label] of TOAST_POSITIONS) {
        const b = el('button', 'ns-pos' + (p.position === id ? ' is-active' : ''));
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(p.position === id));
        b.dataset.pos = id;
        const mini = el('span', `ns-pos__mini ns-pos__mini--${id}`);
        mini.setAttribute('aria-hidden', 'true');
        mini.appendChild(el('i'));
        b.append(mini, el('span', 'ns-pos__label', label));
        b.addEventListener('click', () => {
            setPrefs({ position: id });
            grid.querySelectorAll('.ns-pos').forEach((x) => {
                const on = x === b;
                x.classList.toggle('is-active', on);
                x.setAttribute('aria-checked', String(on));
            });
        });
        grid.appendChild(b);
    }
    look.appendChild(grid);
    look.appendChild(el('p', 'ns-note', 'На телефоне уведомления всегда показываются сверху на всю ширину. Пока открыто окно, стопка уходит вниз, чтобы не закрывать кнопки.'));
    body.appendChild(look);

    // --- Кнопки на карточках ---
    const btns = section('Кнопки в уведомлениях', 'fa-hand-pointer');
    btns.appendChild(
        row(
            '«Диагностика» у ошибок',
            'Открывает самодиагностику с контекстом ошибки.',
            toggleControl('nsDiag', p.showDiagnosticsButton, (v) => setPrefs({ showDiagnosticsButton: v }), 'Диагностика').root,
        ),
    );
    btns.appendChild(
        row(
            '«Больше не показывать»',
            'Позволяет заглушить конкретную ошибку или постоянное предупреждение. Список ниже.',
            toggleControl('nsMuteBtn', p.showMuteButton, (v) => setPrefs({ showMuteButton: v }), 'Больше не показывать').root,
        ),
    );
    body.appendChild(btns);

    // --- DND ---
    const dnd = section('Не беспокоить', 'fa-moon');
    const dndCtl = el('div', 'ns-dnd');
    const mkTime = (id, val, key, label) => {
        const i = document.createElement('input');
        i.type = 'time';
        i.id = id;
        i.value = val;
        i.className = 'ns-time';
        i.setAttribute('aria-label', label);
        i.addEventListener('change', () => {
            if (/^\d\d:\d\d$/.test(i.value)) setPrefs({ dnd: { [key]: i.value } });
            updateDndState();
        });
        return i;
    };
    const fromI = mkTime('nsDndFrom', p.dnd.from, 'from', 'Начало');
    const toI = mkTime('nsDndTo', p.dnd.to, 'to', 'Конец');
    const state = el('span', 'ns-dnd__state');
    const updateDndState = () => {
        const cur = getPrefs();
        state.textContent = cur.dnd.enabled
            ? isInDndWindow(cur.dnd)
                ? 'Сейчас действует: показываются только ошибки'
                : 'Сейчас не действует'
            : '';
    };
    const dndToggle = toggleControl(
        'nsDnd',
        p.dnd.enabled,
        (v) => {
            setPrefs({ dnd: { enabled: v } });
            fromI.disabled = toI.disabled = !v;
            updateDndState();
        },
        'Не беспокоить',
    );
    fromI.disabled = toI.disabled = !p.dnd.enabled;
    dndCtl.append(dndToggle.root, el('span', 'ns-dnd__sep', 'с'), fromI, el('span', 'ns-dnd__sep', 'до'), toI);
    const dndRow = row('По расписанию', 'В это время показываются только ошибки; остальное не всплывает.', dndCtl);
    dnd.appendChild(dndRow);
    dnd.appendChild(state);
    updateDndState();
    body.appendChild(dnd);

    // --- Заглушённые ---
    const muted = section('Скрытые уведомления', 'fa-bell-slash');
    const keys = Object.keys(p.muted);
    if (!keys.length) {
        muted.appendChild(el('p', 'ns-note', 'Пусто. Здесь появятся уведомления, у которых вы нажали «Больше не показывать».'));
    } else {
        const list = el('ul', 'ns-muted');
        keys
            .sort((a, b) => p.muted[b].ts - p.muted[a].ts)
            .forEach((k) => {
                const m = p.muted[k];
                const li = el('li', 'ns-muted__item');
                const ic = el('i', `fas ${TYPE_ICONS[m.type] || 'fa-bell-slash'} ns-type-icon ns-type-icon--${m.type}`);
                ic.setAttribute('aria-hidden', 'true');
                const text = el('span', 'ns-muted__text', m.label);
                text.title = m.label;
                const back = el('button', 'ns-btn ns-btn--small', 'Вернуть');
                back.type = 'button';
                back.addEventListener('click', () => {
                    unmuteNotification(k);
                    render(body);
                });
                li.append(ic, text, back);
                list.appendChild(li);
            });
        muted.appendChild(list);
        const all = el('button', 'ns-btn ns-btn--small', 'Вернуть все');
        all.type = 'button';
        all.addEventListener('click', () => {
            clearMuted();
            render(body);
        });
        muted.appendChild(all);
    }
    body.appendChild(muted);
}

let modalRef = null;

export function openNotificationSettings() {
    if (!modalRef || !document.body.contains(modalRef)) modalRef = buildModal();
    render(modalRef.querySelector('#notificationSettingsBody'));
    openAnimatedModal(modalRef);
}

export function initNotificationSettingsUI() {
    const btn = document.getElementById('openNotificationSettingsBtn');
    if (btn && !btn.dataset.nsBound) {
        btn.dataset.nsBound = '1';
        btn.addEventListener('click', openNotificationSettings);
    }
    // если список скрытых изменился из другого места (кнопка «Больше не показывать»), перерисуем открытое окно
    onPrefsChange(() => {
        if (modalRef && !modalRef.classList.contains('hidden') && !modalRef._rendering) {
            const active = document.activeElement;
            if (active && modalRef.contains(active) && /^(INPUT|BUTTON)$/.test(active.tagName)) return;
            render(modalRef.querySelector('#notificationSettingsBody'));
        }
    });
}
