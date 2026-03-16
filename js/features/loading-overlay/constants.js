'use strict';

/**
 * Константы оверлея загрузки.
 * Единый источник ключей и значений по умолчанию для раннего скрипта в index.html и модулей приложения.
 * При первом входе (нет сохранённой темы) везде используется тёмная тема.
 */

/** Ключ сохранённого режима темы (dark | light | auto) */
export const THEME_HINT_KEY = 'copilot.theme.hint';

/** Ключ последней разрешённой темы (dark | light) для быстрого отображения без FOUC */
export const THEME_RESOLVED_KEY = 'copilot.theme.resolved';

/** Ключ снимка цветов оверлея (фон, primary, secondary) для согласованности с приложением */
export const OVERLAY_SNAPSHOT_KEY = 'copilot.loading-overlay.snapshot';

/** Тема по умолчанию при первом входе пользователя (без сохранённых настроек) */
export const DEFAULT_THEME = 'dark';

/** Фон оверлея в тёмной теме */
export const OVERLAY_BG_DARK = '#0a0a1a';

/** Фон оверлея в светлой теме */
export const OVERLAY_BG_LIGHT = '#f8fafc';

/** Более глубокий фон для тёмной темы (частицы лучше выделяются) */
export const OVERLAY_BG_DARK_DEEP = '#060612';
