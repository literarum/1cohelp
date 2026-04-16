'use strict';

/**
 * Публичный API оверлея загрузки.
 * Централизованная точка входа для приложения и интеграции (app-init, onload, theme, import-export и т.д.).
 */

export { loadingOverlayManager } from './manager.js';
export {
    resolveThemeFromStorage,
    readStoredOverlaySnapshot,
    applyLoadingOverlayThemeVars,
} from './theme-resolver.js';
export { getThemeProfile } from './particles-config.js';
export {
    THEME_HINT_KEY,
    THEME_RESOLVED_KEY,
    OVERLAY_SNAPSHOT_KEY,
    DEFAULT_THEME,
    OVERLAY_BG_DARK,
    OVERLAY_BG_LIGHT,
    OVERLAY_BG_DARK_DEEP,
} from './constants.js';
