'use strict';

export function ensureNotificationIconlessStyles() {
    // Функция теперь в NotificationService, но оставляем заглушку для совместимости
}

export function showNotification(message, type = 'success', duration = 5000) {
    ensureNotificationIconlessStyles();
    console.log(
        `[SHOW_NOTIFICATION_CALL_V5.2_INLINE_STYLE] Message: "${message}", Type: "${type}", Duration: ${duration}, Timestamp: ${new Date().toISOString()}`,
    );
    let callStackInfo = 'N/A';
    try {
        const err = new Error();
        if (err.stack) {
            const stackLines = err.stack.split('\n');
            callStackInfo = stackLines
                .slice(2, 5)
                .map((line) => line.trim())
                .join(' -> ');
        }
    } catch {
        // stack parsing is diagnostic-only
    }
    console.log(`[SHOW_NOTIFICATION_CALL_STACK_V5.2_INLINE_STYLE] Called from: ${callStackInfo}`);

    if (!message || typeof message !== 'string' || message.trim() === '') {
        console.warn(
            '[ShowNotification_V5.2_INLINE_STYLE] Вызван с пустым или невалидным сообщением. Уведомление не будет показано.',
            { messageContent: message, type, duration },
        );
        return;
    }

    const FADE_DURATION_MS = 300;
    const NOTIFICATION_ID = 'notification';

    let notificationElement = document.getElementById(NOTIFICATION_ID);
    let isNewNotification = !notificationElement;

    if (notificationElement) {
        cancelAnimationFrame(Number(notificationElement.dataset.animationFrameId || 0));
        clearTimeout(Number(notificationElement.dataset.hideTimeoutId || 0));
        clearTimeout(Number(notificationElement.dataset.removeTimeoutId || 0));
        notificationElement.style.transform = 'translateX(0)';
        notificationElement.style.opacity = '1';
    } else {
        notificationElement = document.createElement('div');
        notificationElement.id = NOTIFICATION_ID;
        notificationElement.setAttribute('role', 'alert');
        notificationElement.style.willChange = 'transform, opacity';
        notificationElement.style.transform = 'translateX(100%)';
        notificationElement.style.opacity = '0';
    }

    let bgColorClass = 'bg-green-500 dark:bg-green-600';
    let iconClass = 'fa-check-circle';

    switch (type) {
        case 'error':
            bgColorClass = 'bg-red-600 dark:bg-red-700';
            iconClass = 'fa-times-circle';
            break;
        case 'warning':
            bgColorClass = 'bg-yellow-500 dark:bg-yellow-600';
            iconClass = 'fa-exclamation-triangle';
            break;
        case 'info':
            bgColorClass = 'bg-blue-500 dark:bg-blue-600';
            iconClass = 'fa-info-circle';
            break;
    }

    const colorClassesToRemove = [
        'bg-green-500',
        'dark:bg-green-600',
        'bg-red-600',
        'dark:bg-red-700',
        'bg-yellow-500',
        'dark:bg-yellow-600',
        'bg-blue-500',
        'dark:bg-blue-600',
    ];
    notificationElement.classList.remove(...colorClassesToRemove);

    notificationElement.className = `fixed p-4 rounded-lg shadow-xl text-white text-sm font-medium transform transition-all duration-${FADE_DURATION_MS} ease-out max-w-sm sm:max-w-md ${bgColorClass}`;

    notificationElement.style.top = '20px';
    notificationElement.style.right = '20px';
    notificationElement.style.bottom = 'auto';
    notificationElement.style.left = 'auto';
    notificationElement.style.zIndex = '200000';

    let closeButton = notificationElement.querySelector('.notification-close-btn');
    let messageSpan = notificationElement.querySelector('.notification-message-span');
    let iconElement = notificationElement.querySelector('.notification-icon-i');

    if (!messageSpan) {
        notificationElement.innerHTML = `
            <div class="flex items-center justify-between w-full">
                <div class="flex items-center">
                    <i class="notification-icon-i fas ${iconClass} mr-2"></i>
                    <span class="notification-message-span"></span>
                </div>
                <button type="button" class="notification-close-btn ml-2 text-white hover:text-gray-200">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        closeButton = notificationElement.querySelector('.notification-close-btn');
        messageSpan = notificationElement.querySelector('.notification-message-span');
        iconElement = notificationElement.querySelector('.notification-icon-i');
        isNewNotification = true;
    }

    if (messageSpan) messageSpan.textContent = message;
    if (iconElement) iconElement.className = `notification-icon-i fas ${iconClass} mr-2`;

    if (closeButton) {
        const oldHandler = closeButton._notificationCloseHandler;
        if (oldHandler) closeButton.removeEventListener('click', oldHandler);
        const newHandler = () => {
            if (!notificationElement) return;
            notificationElement.classList.add('opacity-0', 'translate-x-full');
            const removeTimeoutId = setTimeout(() => {
                notificationElement?.remove();
            }, FADE_DURATION_MS);
            notificationElement.dataset.removeTimeoutId = String(removeTimeoutId);
        };
        closeButton.addEventListener('click', newHandler);
        closeButton._notificationCloseHandler = newHandler;
    }

    if (isNewNotification) {
        document.body.appendChild(notificationElement);
        requestAnimationFrame(() => {
            notificationElement.style.transform = 'translateX(0)';
            notificationElement.style.opacity = '1';
        });
    }

    const hideTimeoutId = setTimeout(() => {
        notificationElement.style.transform = 'translateX(100%)';
        notificationElement.style.opacity = '0';
        const removeTimeoutId = setTimeout(() => {
            notificationElement?.remove();
        }, FADE_DURATION_MS);
        notificationElement.dataset.removeTimeoutId = String(removeTimeoutId);
    }, duration);

    notificationElement.dataset.hideTimeoutId = String(hideTimeoutId);
}
