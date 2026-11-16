'use strict';

/**
 * Синхронизирует <meta name="theme-color"> (цвет адресной строки / заголовка окна PWA)
 * с фоном текущей темы: раньше он был всегда тёмным, даже в светлой теме.
 */

/** rgb(18, 18, 31) / rgba(...) → #12121f; прозрачный или нераспознанный → null. */
export function cssColorToHex(color) {
    const m = String(color || '').match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/i);
    if (!m) return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null;
    if (m[4] !== undefined && Number(m[4]) === 0) return null;
    return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
}

function currentBackground() {
    const body = document.body;
    const candidates = [body, document.documentElement];
    for (const el of candidates) {
        if (!el) continue;
        const hex = cssColorToHex(getComputedStyle(el).backgroundColor);
        if (hex) return hex;
    }
    return document.documentElement.classList.contains('dark') ? '#12121f' : '#ffffff';
}

export function syncThemeColorMeta() {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
    }
    const color = currentBackground();
    if (meta.content !== color) meta.content = color;
}

let observer = null;
export function initThemeColorMeta() {
    if (observer || typeof MutationObserver !== 'function') return;
    let raf = 0;
    const schedule = () => {
        cancelAnimationFrame(raf);
        // Фон меняется с переходом — берём цвет после него.
        raf = requestAnimationFrame(() => setTimeout(syncThemeColorMeta, 350));
    };
    observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    schedule();
}
