'use strict';

/**
 * Модуль управления перезагрузкой приложения
 */

let deps = {
    showNotification: null,
    showAppConfirm: null,
};

function hardReloadWithCacheBypass() {
    try {
        const { location } = window;
        const url = new URL(location.href);
        const cacheBusterParam = '_hardReloadTs';
        url.searchParams.set(cacheBusterParam, Date.now().toString());
        location.replace(url.toString());
    } catch (error) {
        console.warn('[app-reload.js] Не удалось выполнить hard reload через URL, fallback к location.reload().', error);
        window.location.reload();
    }
}

/**
 * Устанавливает зависимости модуля
 */
export function setAppReloadDependencies(dependencies) {
    if (dependencies.showNotification) deps.showNotification = dependencies.showNotification;
    if (dependencies.showAppConfirm) deps.showAppConfirm = dependencies.showAppConfirm;
    console.log('[app-reload.js] Зависимости установлены');
}

/**
 * Выполняет перезагрузку приложения с подтверждением
 */
export async function forceReloadApp() {
    const message =
        'Вы уверены, что хотите перезагрузить приложение с обходом кэша?\n\n' +
        'Это действие максимально приближено к "жесткой перезагрузке" (Ctrl/Cmd+Shift+R):\n' +
        '- в адрес добавляется технический параметр, заставляющий браузер заново загрузить ресурсы.\n' +
        'Точное поведение может зависеть от настроек и расширений вашего браузера.';
    const confirmation = deps.showAppConfirm
        ? await deps.showAppConfirm({
              title: 'Перезагрузка приложения',
              message,
              confirmText: 'Перезагрузить',
              cancelText: 'Отмена',
          })
        : confirm(message);

    if (confirmation) {
        console.log('Перезагрузка приложения по запросу пользователя...');
        if (deps.showNotification) {
            deps.showNotification('Перезагрузка приложения...', 'info');
        }
        setTimeout(() => {
            hardReloadWithCacheBypass();
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
