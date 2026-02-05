'use strict';

/**
 * Модуль управления перезагрузкой приложения
 */

let deps = {
    showNotification: null,
};

/**
 * Устанавливает зависимости модуля
 */
export function setAppReloadDependencies(dependencies) {
    if (dependencies.showNotification) deps.showNotification = dependencies.showNotification;
    console.log('[app-reload.js] Зависимости установлены');
}

/**
 * Выполняет перезагрузку приложения с подтверждением
 */
export function forceReloadApp() {
    const confirmation = confirm(
        'Вы уверены, что хотите перезагрузить приложение?\n\n' +
            'Это действие аналогично обновлению страницы в браузере (F5).\n' +
            'Если вы хотите гарантированно загрузить последнюю версию после обновления, ' +
            "используйте 'жесткую перезагрузку' вашего браузера (обычно Ctrl+F5 или Cmd+Shift+R).",
    );

    if (confirmation) {
        console.log('Перезагрузка приложения по запросу пользователя...');
        if (deps.showNotification) {
            deps.showNotification('Перезагрузка приложения...', 'info');
        }
        setTimeout(() => {
            window.location.reload();
        }, 500);
    } else {
        console.log('Перезагрузка отменена пользователем.');
    }
}

/**
 * Инициализирует кнопку перезагрузки
 */
export function initReloadButton() {
    const reloadBtn = document.getElementById('forceReloadBtn');
    if (reloadBtn) {
        reloadBtn.addEventListener('click', forceReloadApp);
        console.log('Кнопка перезагрузки инициализирована.');
    } else {
        console.warn('Кнопка перезагрузки #forceReloadBtn не найдена.');
    }
}
