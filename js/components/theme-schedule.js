'use strict';

/**
 * Тема по расписанию: в режиме «Авто» вместо системной настройки используется время суток
 * (светлая с «lightFrom», тёмная с «darkFrom»). Хранится в localStorage отдельно от профиля
 * оформления — это настройка рабочего места, применяется сразу, без «Сохранить».
 * Тот же ключ читает ранний скрипт в index.html (тема без мигания при загрузке).
 */

export const THEME_SCHEDULE_KEY = 'copilot.themeSchedule.v1';
export const DEFAULT_THEME_SCHEDULE = Object.freeze({
    enabled: false,
    lightFrom: '08:00',
    darkFrom: '20:00',
});

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseTime(v) {
    const m = TIME_RE.exec(String(v || ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function sanitizeThemeSchedule(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    const lightFrom = parseTime(s.lightFrom) !== null ? s.lightFrom : DEFAULT_THEME_SCHEDULE.lightFrom;
    let darkFrom = parseTime(s.darkFrom) !== null ? s.darkFrom : DEFAULT_THEME_SCHEDULE.darkFrom;
    if (darkFrom === lightFrom) darkFrom = DEFAULT_THEME_SCHEDULE.darkFrom === lightFrom ? '21:00' : DEFAULT_THEME_SCHEDULE.darkFrom;
    return { enabled: s.enabled === true, lightFrom, darkFrom };
}

export function readThemeSchedule() {
    try {
        return sanitizeThemeSchedule(JSON.parse(localStorage.getItem(THEME_SCHEDULE_KEY) || 'null'));
    } catch {
        return { ...DEFAULT_THEME_SCHEDULE };
    }
}

export function writeThemeSchedule(patch) {
    const next = sanitizeThemeSchedule({ ...readThemeSchedule(), ...patch });
    try {
        localStorage.setItem(THEME_SCHEDULE_KEY, JSON.stringify(next));
    } catch {
        /* хранилище недоступно — расписание действует до перезагрузки */
    }
    return next;
}

/** Тёмная ли тема в момент date по расписанию (интервал может переходить через полночь). */
export function isDarkBySchedule(schedule, date = new Date()) {
    const s = sanitizeThemeSchedule(schedule);
    const now = date.getHours() * 60 + date.getMinutes();
    const light = parseTime(s.lightFrom);
    const dark = parseTime(s.darkFrom);
    const isLight = light < dark ? now >= light && now < dark : now >= light || now < dark;
    return !isLight;
}

/** Через сколько миллисекунд следующая смена темы (для таймера). */
export function msUntilNextSwitch(schedule, date = new Date()) {
    const s = sanitizeThemeSchedule(schedule);
    const nowMin = date.getHours() * 60 + date.getMinutes();
    const secs = date.getSeconds() * 1000 + date.getMilliseconds();
    const diff = (target) => ((target - nowMin + 1440) % 1440 || 1440) * 60000 - secs;
    return Math.max(1000, Math.min(diff(parseTime(s.lightFrom)), diff(parseTime(s.darkFrom))));
}

// ------------------------------------------------------------------ интерфейс в «Оформлении»

/**
 * Блок под карточками темы. onChange вызывается после записи настроек
 * (вызывающий переприменяет тему, если сейчас выбран режим «Авто»).
 * @param {{ onChange?: () => void }} [opts]
 */
export function initThemeScheduleUI(opts = {}) {
    const cards = document.querySelector('#appCustomizationModal .ac-theme-cards');
    if (!cards || document.getElementById('acThemeSchedule')) return;
    const s = readThemeSchedule();
    const box = document.createElement('div');
    box.id = 'acThemeSchedule';
    box.className = 'ac-theme-schedule';
    box.innerHTML = `
        <label class="ac-theme-schedule__toggle">
            <input type="checkbox" data-ts="enabled" ${s.enabled ? 'checked' : ''} />
            <span>«Авто» по расписанию, а не по системе</span>
        </label>
        <div class="ac-theme-schedule__times">
            <label>Светлая с <input type="time" data-ts="lightFrom" value="${s.lightFrom}" required /></label>
            <label>Тёмная с <input type="time" data-ts="darkFrom" value="${s.darkFrom}" required /></label>
        </div>
        <p class="ac-theme-schedule__hint" aria-live="polite"></p>`;
    cards.insertAdjacentElement('afterend', box);
    const hint = box.querySelector('.ac-theme-schedule__hint');
    const times = box.querySelector('.ac-theme-schedule__times');
    const sync = () => {
        const cur = readThemeSchedule();
        times.hidden = !cur.enabled;
        const autoSelected = document.querySelector('input[name="themeMode"][value="auto"]')?.checked;
        hint.textContent = !cur.enabled
            ? ''
            : autoSelected
              ? `Сейчас: ${isDarkBySchedule(cur) ? 'тёмная' : 'светлая'}. Смена — автоматически.`
              : 'Действует, когда выбрана тема «Авто».';
    };
    sync();
    box.addEventListener('change', (e) => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement) || !t.dataset.ts) return;
        e.stopPropagation(); // настройка рабочего места: сохраняется сразу, профиль не «грязнится»
        const key = t.dataset.ts;
        if (key === 'enabled') writeThemeSchedule({ enabled: t.checked });
        else if (parseTime(t.value) !== null) writeThemeSchedule({ [key]: t.value });
        else return;
        sync();
        opts.onChange?.();
    });
    cards.addEventListener('change', () => setTimeout(sync, 0));
}
