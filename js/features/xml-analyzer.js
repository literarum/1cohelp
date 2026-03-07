'use strict';

import { installBrowserElectronAPI } from './xml-analyzer-adapter.js';
import { createXmlAnalyzerApp } from './xml-analyzer-app.js';

let appInstance = null;

/**
 * Инициализирует анализатор XML для ТП 1СО внутри указанного контейнера вкладки.
 * Вызывать при первом показе вкладки «Анализатор XML» (например по событию copilot1co:tabShown).
 * @param {HTMLElement} rootElement - корневой элемент вкладки (#xmlAnalyzerContent)
 */
export function initXmlAnalyzer(rootElement) {
    if (!rootElement) return;
    if (appInstance) return;

    installBrowserElectronAPI();
    appInstance = createXmlAnalyzerApp(rootElement);
}
