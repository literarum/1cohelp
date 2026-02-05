'use strict';

import { escapeHtml } from '../utils/html.js';

// ============================================================================
// СТИЛИ ДЛЯ УВЕДОМЛЕНИЙ БЕЗ ИКОНОК
// ============================================================================

function ensureNotificationIconlessStyles() {
    try {
        if (document.getElementById('notification-iconless-css')) return;
        const style = document.createElement('style');
        style.id = 'notification-iconless-css';
        style.textContent = `
/* Уведомления: только текст — без галочек и крестиков */
.notification-item .notification-close-btn { display: none !important; }
.notification-item .notification-icon-i { display: none !important; }
/* Иконка как первый <i.fas> в контенте уведомления (оба механизма рендера) */
.notification-item > div > i.fas { display: none !important; }
`;
        document.head.appendChild(style);
    } catch (e) {
        /* no-op */
    }
}

// ============================================================================
// СЕРВИС УВЕДОМЛЕНИЙ
// ============================================================================

export const NotificationService = {
    importantNotificationsContainer: null,
    activeImportantNotifications: new Map(),
    temporaryNotificationElement: null,
    temporaryNotificationHideTimeout: null,
    temporaryNotificationRemoveTimeout: null,
    defaultTemporaryDuration: 3000,
    FADE_DURATION_MS: 300,
    NOTIFICATION_WIDTH: '380px',
    TEMPORARY_NOTIFICATION_TOP: '20px',
    IMPORTANT_CONTAINER_TOP_WITH_TEMP: '90px',
    IMPORTANT_CONTAINER_TOP_NO_TEMP: '20px',
    isTemporaryNotificationVisible: false,

    init() {
        if (
            this.importantNotificationsContainer &&
            document.body.contains(this.importantNotificationsContainer)
        ) {
            console.log('NotificationService already initialized and container exists.');
            return;
        }

        let container = document.getElementById('important-notifications-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'important-notifications-container';
            document.body.appendChild(container);
        }
        this.importantNotificationsContainer = container;
        this._applyContainerStyles();
        this._updateImportantContainerPosition(false);
        console.log('NotificationService initialized.');
    },

    _applyContainerStyles() {
        if (!this.importantNotificationsContainer) return;
        const s = this.importantNotificationsContainer.style;
        s.position = 'fixed';
        s.right = '20px';
        s.width = this.NOTIFICATION_WIDTH;
        s.overflowY = 'auto';
        s.overflowX = 'hidden';
        s.zIndex = '199990';
        s.display = 'flex';
        s.flexDirection = 'column-reverse';
        s.gap = '10px';
        s.transition = 'top 0.3s ease-out, max-height 0.3s ease-out';
        this.importantNotificationsContainer.classList.add('custom-scrollbar');
    },

    _updateImportantContainerPosition(animate = true) {
        if (!this.importantNotificationsContainer) {
            console.warn('_updateImportantContainerPosition called but container is null.');
            return;
        }
        const newTop = this.isTemporaryNotificationVisible
            ? this.IMPORTANT_CONTAINER_TOP_WITH_TEMP
            : this.IMPORTANT_CONTAINER_TOP_NO_TEMP;

        this.importantNotificationsContainer.style.top = newTop;
        this.importantNotificationsContainer.style.maxHeight = `calc(100vh - ${parseFloat(
            newTop,
        )}px - 20px)`;

        if (!animate) {
            this.importantNotificationsContainer.style.transition = 'none';
            requestAnimationFrame(() => {
                if (this.importantNotificationsContainer) {
                    this.importantNotificationsContainer.style.transition =
                        'top 0.3s ease-out, max-height 0.3s ease-out';
                }
            });
        }
        console.log(
            `Important container position updated. New top: ${newTop}, isTemporaryVisible: ${this.isTemporaryNotificationVisible}`,
        );
    },

    add(message, type = 'info', options = {}) {
        ensureNotificationIconlessStyles();
        const {
            duration = this.defaultTemporaryDuration,
            important = false,
            id = null,
            isDismissible = true,
            onClick = null,
            autoDismissDelay = null,
        } = options;

        if (!this.importantNotificationsContainer && important) {
            this.init();
        }

        if (important) {
            this.showImportant(message, type, { id, isDismissible, onClick, autoDismissDelay });
        } else {
            this.showTemporary(message, type, duration, { onClick });
        }
    },

    showImportant(message, type, options = {}) {
        const { id, isDismissible = true, onClick, autoDismissDelay = null } = options;
        const notificationId =
            id || `important-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        if (id && this.activeImportantNotifications.has(id)) {
            const existing = this.activeImportantNotifications.get(id);
            const messageSpan = existing.element.querySelector('.notification-message-span');
            if (messageSpan) {
                const formattedMessage =
                    typeof window.linkify === 'function'
                        ? window.linkify(message)
                        : escapeHtml(message);
                if (messageSpan.innerHTML !== formattedMessage) {
                    messageSpan.innerHTML = formattedMessage;
                }
            }
            if (existing.timeoutId) {
                clearTimeout(existing.timeoutId);
                existing.timeoutId = null;
            }
            if (autoDismissDelay && autoDismissDelay > 0 && isDismissible) {
                existing.timeoutId = setTimeout(
                    () => this.dismissImportant(notificationId),
                    autoDismissDelay,
                );
                this.activeImportantNotifications.set(notificationId, {
                    ...existing,
                    timeoutId: existing.timeoutId,
                });
            }
            existing.element.classList.add('notification-updated-shake');
            setTimeout(() => existing.element.classList.remove('notification-updated-shake'), 500);
            console.log(`Important notification with id ${id} updated.`);
            return;
        }

        if (!this.importantNotificationsContainer) this.init();

        const notificationElement = this._createNotificationElement(
            message,
            type,
            notificationId,
            true,
            isDismissible,
            onClick,
        );
        this.importantNotificationsContainer.appendChild(notificationElement);

        requestAnimationFrame(() => {
            notificationElement.style.opacity = '1';
            notificationElement.style.transform = 'translateX(0)';
        });

        let timeoutIdForAutoDismiss = null;
        if (autoDismissDelay && autoDismissDelay > 0 && isDismissible) {
            timeoutIdForAutoDismiss = setTimeout(() => {
                this.dismissImportant(notificationId);
            }, autoDismissDelay);
        }

        this.activeImportantNotifications.set(notificationId, {
            element: notificationElement,
            data: { message, type, id: notificationId, isDismissible },
            timeoutId: timeoutIdForAutoDismiss,
        });
    },

    dismissImportant(notificationId) {
        const notificationData = this.activeImportantNotifications.get(notificationId);
        if (notificationData && notificationData.element) {
            const el = notificationData.element;

            if (notificationData.timeoutId) {
                clearTimeout(notificationData.timeoutId);
            }

            el.style.opacity = '0';
            el.style.transform = 'translateX(100%)';
            el.style.maxHeight = `${el.offsetHeight}px`;
            requestAnimationFrame(() => {
                el.style.maxHeight = '0px';
                el.style.paddingTop = '0px';
                el.style.paddingBottom = '0px';
                el.style.marginTop = '0px';
                el.style.marginBottom = '0px';
                el.style.borderWidth = '0px';
                el.style.overflow = 'hidden';
            });

            setTimeout(() => {
                if (el.parentElement) {
                    el.remove();
                }
                this.activeImportantNotifications.delete(notificationId);
            }, this.FADE_DURATION_MS + 50);
        }
    },

    showTemporary(message, type, duration, options = {}) {
        const { onClick } = options;

        if (
            this.temporaryNotificationElement &&
            document.body.contains(this.temporaryNotificationElement)
        ) {
            console.log('Dismissing previous temporary notification before showing new one.');
            clearTimeout(this.temporaryNotificationHideTimeout);
            clearTimeout(this.temporaryNotificationRemoveTimeout);
            this._dismissTemporary(
                this.temporaryNotificationElement,
                this.temporaryNotificationElement.dataset.id,
                false,
            );
            this.temporaryNotificationElement = null;
        } else {
            this.isTemporaryNotificationVisible = false;
        }

        const tempNotificationId = `temp-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 9)}`;
        const notificationElement = this._createNotificationElement(
            message,
            type,
            tempNotificationId,
            false,
            true,
            onClick,
        );

        notificationElement.style.position = 'fixed';
        notificationElement.style.top = this.TEMPORARY_NOTIFICATION_TOP;
        notificationElement.style.right = '20px';
        notificationElement.style.zIndex = '200000';
        notificationElement.style.width = this.NOTIFICATION_WIDTH;
        notificationElement.style.willChange = 'transform, opacity';

        document.body.appendChild(notificationElement);
        this.temporaryNotificationElement = notificationElement;

        if (!this.isTemporaryNotificationVisible) {
            this.isTemporaryNotificationVisible = true;
            this._updateImportantContainerPosition();
        }

        requestAnimationFrame(() => {
            notificationElement.style.transform = 'translateX(0)';
            notificationElement.style.opacity = '1';
        });

        if (duration > 0) {
            this.temporaryNotificationHideTimeout = setTimeout(() => {
                this._dismissTemporary(notificationElement, tempNotificationId, true);
            }, duration);
        }
    },

    _dismissTemporary(element, id, updatePositionAfterDismiss) {
        if (!element || !document.body.contains(element)) {
            if (
                this.temporaryNotificationElement &&
                this.temporaryNotificationElement.dataset.id === id
            ) {
                this.isTemporaryNotificationVisible = false;
                this.temporaryNotificationElement = null;
                if (updatePositionAfterDismiss) this._updateImportantContainerPosition();
            }
            return;
        }

        element.style.transform = 'translateX(100%)';
        element.style.opacity = '0';

        clearTimeout(this.temporaryNotificationRemoveTimeout);
        this.temporaryNotificationRemoveTimeout = setTimeout(() => {
            if (document.body.contains(element)) element.remove();
            if (
                this.temporaryNotificationElement &&
                this.temporaryNotificationElement.dataset.id === id
            ) {
                this.temporaryNotificationElement = null;
                this.isTemporaryNotificationVisible = false;
                if (updatePositionAfterDismiss) {
                    this._updateImportantContainerPosition();
                }
            }
        }, this.FADE_DURATION_MS);
    },

    _createNotificationElement(
        message,
        type,
        notificationId,
        isImportant,
        isDismissible,
        onClickCallback,
    ) {
        const notificationElement = document.createElement('div');
        notificationElement.dataset.id = notificationId;

        let baseClasses = ['notification-item', `notification-type-${type}`];
        if (isImportant) baseClasses.push('important-notification');
        else baseClasses.push('temporary-notification');

        let bgColorClassesArr, iconClass, textColorClassesArr, borderColorClass;

        switch (type) {
            case 'hyper-alert':
                bgColorClassesArr = ['bg-red-100', 'dark:bg-red-900/95'];
                textColorClassesArr = ['text-red-900', 'dark:text-yellow-200'];
                borderColorClass = 'border-yellow-400 dark:border-yellow-300';
                iconClass = 'fa-biohazard text-yellow-400 dark:text-yellow-300';
                baseClasses.push('notification-hyper-alert', 'border-4');
                break;
            case 'error':
                bgColorClassesArr = ['bg-red-100', 'dark:bg-red-700/90'];
                textColorClassesArr = ['text-red-700', 'dark:text-red-100'];
                borderColorClass = 'border-red-500';
                iconClass = 'fa-times-circle text-red-500 dark:text-red-400';
                break;
            case 'warning':
                bgColorClassesArr = ['bg-yellow-100', 'dark:bg-yellow-600/90'];
                textColorClassesArr = ['text-yellow-700', 'dark:text-yellow-50'];
                borderColorClass = 'border-yellow-500';
                iconClass = 'fa-exclamation-triangle text-yellow-500 dark:text-yellow-300';
                break;
            case 'info':
                bgColorClassesArr = ['bg-blue-100', 'dark:bg-blue-700/90'];
                textColorClassesArr = ['text-blue-700', 'dark:text-blue-100'];
                borderColorClass = 'border-blue-500';
                iconClass = 'fa-info-circle text-blue-500 dark:text-blue-400';
                break;
            case 'success':
            default:
                bgColorClassesArr = ['bg-green-100', 'dark:bg-green-700/90'];
                textColorClassesArr = ['text-green-700', 'dark:text-green-100'];
                borderColorClass = 'border-green-500';
                iconClass = 'fa-check-circle text-green-500 dark:text-green-400';
                break;
        }

        notificationElement.classList.add(
            'p-4',
            'rounded-md',
            'shadow-lg',
            'flex',
            'items-center',
            'justify-between',
            'gap-3',
            'border-l-4',
            'box-border',
            ...baseClasses,
        );
        if (borderColorClass)
            borderColorClass
                .split(' ')
                .filter((cls) => cls.trim())
                .forEach((cls) => notificationElement.classList.add(cls));
        if (bgColorClassesArr && Array.isArray(bgColorClassesArr)) {
            bgColorClassesArr.forEach((cls) => {
                cls.split(' ')
                    .filter((c) => c.trim())
                    .forEach((subCls) => notificationElement.classList.add(subCls));
            });
        }
        if (textColorClassesArr && Array.isArray(textColorClassesArr)) {
            textColorClassesArr.forEach((cls) => {
                cls.split(' ')
                    .filter((c) => c.trim())
                    .forEach((subCls) => notificationElement.classList.add(subCls));
            });
        }

        notificationElement.style.transition =
            'transform 0.3s ease-out, opacity 0.3s ease-out, margin-top 0.3s ease-out, margin-bottom 0.3s ease-out, padding-top 0.3s ease-out, padding-bottom 0.3s ease-out, border-width 0.3s ease-out, max-height 0.3s ease-out';
        notificationElement.style.opacity = '0';
        notificationElement.style.transform = 'translateX(100%)';

        if (isImportant) {
            notificationElement.style.width = '100%';
        }

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'flex items-center flex-grow min-w-0';

        const iconElement = document.createElement('i');
        const [mainIconClass, ...colorIconClasses] = iconClass.split(' ');
        iconElement.className = `fas ${mainIconClass} mr-3 text-xl flex-shrink-0`;
        colorIconClasses.forEach((cls) => iconElement.classList.add(cls));
        try {
            iconElement.style.color = 'var(--color-primary)';
        } catch (e) {}

        contentWrapper.appendChild(iconElement);

        const messageSpan = document.createElement('span');
        messageSpan.className = 'notification-message-span flex-1 text-sm break-words';
        messageSpan.innerHTML =
            typeof window.linkify === 'function'
                ? window.linkify(message)
                : escapeHtml(message);
        contentWrapper.appendChild(messageSpan);

        notificationElement.appendChild(contentWrapper);

        if (isDismissible) {
            const closeButton = document.createElement('button');
            closeButton.setAttribute('type', 'button');
            closeButton.setAttribute('aria-label', 'Закрыть уведомление');
            closeButton.className =
                'ml-3 p-1 flex-shrink-0 rounded-full hover:bg-black/10 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-current self-center';
            closeButton.innerHTML = `<i class="fas fa-times fa-fw text-base"></i>`;

            closeButton.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isImportant) {
                    this.dismissImportant(notificationId);
                } else {
                    this._dismissTemporary(notificationElement, notificationId, true);
                }
            });
            notificationElement.appendChild(closeButton);
        }

        if (typeof onClickCallback === 'function') {
            notificationElement.style.cursor = 'pointer';
            notificationElement.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                onClickCallback();
            });
        }
        return notificationElement;
    },
};
