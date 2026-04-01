'use strict';

import { linkify as linkifyFn } from '../utils/html.js';

// ============================================================================
// СТИЛИ ДЛЯ УВЕДОМЛЕНИЙ БЕЗ ИКОНОК
// ============================================================================

export function ensureNotificationIconlessStyles() {
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
    } catch {
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
                    linkifyFn(message);
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

    /**
     * Важное уведомление с дополнительными кнопками и режимом «HUD»: первые minVisibleBeforeInteractionDismissMs
     * не закрывается от активности документа; затем — как фоновый HUD (активность → задержка → закрытие).
     * Кнопка ✕ закрывает сразу. Кнопки в панели действий должны сами вызывать dismiss при необходимости.
     * @param {Object} options
     * @param {string} [options.id]
     * @param {string} options.message
     * @param {string} [options.type='warning']
     * @param {Array<{ label: string, onClick?: function, primary?: boolean, id?: string }>} [options.actions]
     * @param {boolean} [options.isDismissible=true]
     * @param {number} [options.minVisibleBeforeInteractionDismissMs=7000]
     * @param {number} [options.dismissAfterActivityDelayMs=2000]
     * @param {function} [options.onDismiss]
     * @param {function(Event): boolean} [options.shouldIgnoreInteractionEvent] — не считать событие «активностью» для автоскрытия (например, клик по модальному окну подтверждения).
     */
    showImportantRich(options = {}) {
        ensureNotificationIconlessStyles();
        const {
            id: fixedId = null,
            message,
            type = 'warning',
            actions = [],
            isDismissible = true,
            minVisibleBeforeInteractionDismissMs = 7000,
            dismissAfterActivityDelayMs = 2000,
            onDismiss = null,
            shouldIgnoreInteractionEvent = null,
        } = options;

        if (!message || typeof message !== 'string') {
            console.warn('[NotificationService.showImportantRich] Пустое сообщение.');
            return;
        }

        const notificationId =
            fixedId ||
            `important-rich-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        if (fixedId && this.activeImportantNotifications.has(fixedId)) {
            this.dismissImportant(fixedId);
        }

        if (!this.importantNotificationsContainer) this.init();

        const outer = document.createElement('div');
        outer.dataset.id = notificationId;
        outer.dataset.richNotification = '1';
        outer.setAttribute('role', 'region');
        outer.setAttribute('aria-label', 'Уведомление приложения');
        outer.classList.add(
            'p-4',
            'rounded-md',
            'shadow-lg',
            'border-l-4',
            'box-border',
            'notification-item',
            'important-notification',
            'flex',
            'flex-col',
            'items-stretch',
            'gap-0',
            'w-full',
        );

        let bgColorClassesArr;
        let textColorClassesArr;
        let borderColorClass;
        switch (type) {
            case 'hyper-alert':
                bgColorClassesArr = ['bg-red-100', 'dark:bg-red-900/95'];
                textColorClassesArr = ['text-red-900', 'dark:text-yellow-200'];
                borderColorClass = 'border-yellow-400 dark:border-yellow-300';
                outer.classList.add('notification-hyper-alert', 'border-4');
                break;
            case 'error':
                bgColorClassesArr = ['bg-red-100', 'dark:bg-red-700/90'];
                textColorClassesArr = ['text-red-700', 'dark:text-red-100'];
                borderColorClass = 'border-red-500';
                break;
            case 'warning':
                bgColorClassesArr = ['bg-yellow-100', 'dark:bg-yellow-600/90'];
                textColorClassesArr = ['text-yellow-700', 'dark:text-yellow-50'];
                borderColorClass = 'border-yellow-500';
                break;
            case 'info':
                bgColorClassesArr = ['bg-blue-100', 'dark:bg-blue-700/90'];
                textColorClassesArr = ['text-blue-700', 'dark:text-blue-100'];
                borderColorClass = 'border-blue-500';
                break;
            case 'success':
            default:
                bgColorClassesArr = ['bg-green-100', 'dark:bg-green-700/90'];
                textColorClassesArr = ['text-green-700', 'dark:text-green-100'];
                borderColorClass = 'border-green-500';
                break;
        }
        if (borderColorClass)
            borderColorClass
                .split(' ')
                .filter((cls) => cls.trim())
                .forEach((cls) => outer.classList.add(cls));
        if (bgColorClassesArr) {
            bgColorClassesArr.forEach((cls) => {
                cls.split(' ')
                    .filter((c) => c.trim())
                    .forEach((subCls) => outer.classList.add(subCls));
            });
        }
        if (textColorClassesArr) {
            textColorClassesArr.forEach((cls) => {
                cls.split(' ')
                    .filter((c) => c.trim())
                    .forEach((subCls) => outer.classList.add(subCls));
            });
        }

        outer.style.transition =
            'transform 0.3s ease-out, opacity 0.3s ease-out, margin-top 0.3s ease-out, margin-bottom 0.3s ease-out, padding-top 0.3s ease-out, padding-bottom 0.3s ease-out, border-width 0.3s ease-out, max-height 0.3s ease-out';
        outer.style.opacity = '0';
        outer.style.transform = 'translateX(100%)';
        outer.style.width = '100%';

        const topRow = document.createElement('div');
        topRow.className = 'flex items-start justify-between gap-3 w-full min-w-0';

        const messageSpan = document.createElement('span');
        messageSpan.className = 'notification-message-span flex-1 text-sm break-words';
        messageSpan.innerHTML = linkifyFn(message);
        topRow.appendChild(messageSpan);

        if (isDismissible) {
            const closeButton = document.createElement('button');
            closeButton.setAttribute('type', 'button');
            closeButton.setAttribute('aria-label', 'Закрыть уведомление');
            closeButton.className =
                'ml-3 p-1 flex-shrink-0 rounded-full hover:bg-black/10 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-current self-start';
            closeButton.innerHTML = `<i class="fas fa-times fa-fw text-base"></i>`;
            closeButton.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof onDismiss === 'function') onDismiss();
                this.dismissImportant(notificationId);
            });
            topRow.appendChild(closeButton);
        }

        const actionsRow = document.createElement('div');
        actionsRow.className =
            'flex flex-wrap gap-2 mt-3 pt-2 border-t border-black/10 dark:border-white/10 w-full';

        for (const action of actions) {
            if (!action || !action.label) continue;
            const btn = document.createElement('button');
            btn.type = 'button';
            const isPrimary = action.primary === true;
            btn.className = isPrimary
                ? 'px-3 py-1.5 rounded-md text-sm font-medium bg-primary hover:bg-secondary text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
                : 'px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 dark:border-gray-600 bg-white/80 dark:bg-gray-800 text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus-visible:ring-2';
            btn.textContent = action.label;
            if (action.id) btn.dataset.actionId = String(action.id);
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof action.onClick === 'function') action.onClick();
            });
            actionsRow.appendChild(btn);
        }

        outer.appendChild(topRow);
        outer.appendChild(actionsRow);

        this.importantNotificationsContainer.appendChild(outer);

        requestAnimationFrame(() => {
            outer.style.opacity = '1';
            outer.style.transform = 'translateX(0)';
        });

        let interactionDismissEnabled = false;
        let postActivityDismissTimeout = null;
        let minVisibleTimeout = null;

        const removeActivityListeners = () => {
            document.removeEventListener('click', onDocumentActivity, false);
            document.removeEventListener('keydown', onDocumentActivity, false);
            document.removeEventListener('touchstart', onDocumentActivity, false);
            document.removeEventListener('scroll', onDocumentActivity, false);
        };

        const onDocumentActivity = (e) => {
            if (!interactionDismissEnabled) return;
            if (typeof shouldIgnoreInteractionEvent === 'function' && shouldIgnoreInteractionEvent(e)) {
                return;
            }
            if (outer.contains(e.target) && e.target.closest('button')) {
                return;
            }
            removeActivityListeners();
            if (postActivityDismissTimeout) clearTimeout(postActivityDismissTimeout);
            postActivityDismissTimeout = setTimeout(() => {
                postActivityDismissTimeout = null;
                if (typeof onDismiss === 'function') onDismiss();
                this.dismissImportant(notificationId);
            }, dismissAfterActivityDelayMs);
        };

        const richCleanup = () => {
            if (minVisibleTimeout) {
                clearTimeout(minVisibleTimeout);
                minVisibleTimeout = null;
            }
            if (postActivityDismissTimeout) {
                clearTimeout(postActivityDismissTimeout);
                postActivityDismissTimeout = null;
            }
            removeActivityListeners();
        };

        minVisibleTimeout = setTimeout(() => {
            minVisibleTimeout = null;
            interactionDismissEnabled = true;
            document.addEventListener('click', onDocumentActivity, false);
            document.addEventListener('keydown', onDocumentActivity, false);
            document.addEventListener('touchstart', onDocumentActivity, { passive: true });
            document.addEventListener('scroll', onDocumentActivity, { passive: true });
        }, minVisibleBeforeInteractionDismissMs);

        this.activeImportantNotifications.set(notificationId, {
            element: outer,
            data: { message, type, id: notificationId, isDismissible, rich: true },
            timeoutId: null,
            richCleanup,
        });
    },

    dismissImportant(notificationId) {
        const notificationData = this.activeImportantNotifications.get(notificationId);
        if (notificationData && notificationData.element) {
            const el = notificationData.element;

            if (typeof notificationData.richCleanup === 'function') {
                try {
                    notificationData.richCleanup();
                } catch (e) {
                    console.warn('[NotificationService] richCleanup error:', e);
                }
            }

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

        const container = document.getElementById('notification-container');
        (container || document.body).appendChild(notificationElement);
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

        let bgColorClassesArr, textColorClassesArr, borderColorClass;

        switch (type) {
            case 'hyper-alert':
                bgColorClassesArr = ['bg-red-100', 'dark:bg-red-900/95'];
                textColorClassesArr = ['text-red-900', 'dark:text-yellow-200'];
                borderColorClass = 'border-yellow-400 dark:border-yellow-300';
                baseClasses.push('notification-hyper-alert', 'border-4');
                break;
            case 'error':
                bgColorClassesArr = ['bg-red-100', 'dark:bg-red-700/90'];
                textColorClassesArr = ['text-red-700', 'dark:text-red-100'];
                borderColorClass = 'border-red-500';
                break;
            case 'warning':
                bgColorClassesArr = ['bg-yellow-100', 'dark:bg-yellow-600/90'];
                textColorClassesArr = ['text-yellow-700', 'dark:text-yellow-50'];
                borderColorClass = 'border-yellow-500';
                break;
            case 'info':
                bgColorClassesArr = ['bg-blue-100', 'dark:bg-blue-700/90'];
                textColorClassesArr = ['text-blue-700', 'dark:text-blue-100'];
                borderColorClass = 'border-blue-500';
                break;
            case 'success':
            default:
                bgColorClassesArr = ['bg-green-100', 'dark:bg-green-700/90'];
                textColorClassesArr = ['text-green-700', 'dark:text-green-100'];
                borderColorClass = 'border-green-500';
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

        const messageSpan = document.createElement('span');
        messageSpan.className = 'notification-message-span flex-1 text-sm break-words';
        messageSpan.innerHTML =
            linkifyFn(message);
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

// ============================================================================
// LEGACY showNotification (message, type, duration) — один тост по id "notification"
// ============================================================================

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
        // ignore stack parse errors
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
        console.log(
            `[ShowNotification_V5.2_INLINE_STYLE] Найдено существующее уведомление (ID: ${NOTIFICATION_ID}). Обновление...`,
        );
        cancelAnimationFrame(Number(notificationElement.dataset.animationFrameId || 0));
        clearTimeout(Number(notificationElement.dataset.hideTimeoutId || 0));
        clearTimeout(Number(notificationElement.dataset.removeTimeoutId || 0));
        notificationElement.style.transform = 'translateX(0)';
        notificationElement.style.opacity = '1';
    } else {
        console.log(
            `[ShowNotification_V5.2_INLINE_STYLE] Существующее уведомление не найдено. Создание нового (ID: ${NOTIFICATION_ID}).`,
        );
        notificationElement = document.createElement('div');
        notificationElement.id = NOTIFICATION_ID;
        notificationElement.setAttribute('role', 'alert');
        notificationElement.style.willChange = 'transform, opacity';
        notificationElement.style.transform = 'translateX(100%)';
        notificationElement.style.opacity = '0';
    }

    let bgColorClass = 'bg-green-500 dark:bg-green-600';

    switch (type) {
        case 'error':
            bgColorClass = 'bg-red-600 dark:bg-red-700';
            break;
        case 'warning':
            bgColorClass = 'bg-yellow-500 dark:bg-yellow-600';
            break;
        case 'info':
            bgColorClass = 'bg-blue-500 dark:bg-blue-600';
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

    if (!closeButton || !messageSpan) {
        notificationElement.innerHTML = '';

        const textContainer = document.createElement('div');
        textContainer.className = 'flex items-center flex-grow min-w-0';

        messageSpan = document.createElement('span');
        messageSpan.className = 'flex-1 notification-message-span';

        textContainer.appendChild(messageSpan);

        closeButton = document.createElement('button');
        closeButton.setAttribute('type', 'button');
        closeButton.setAttribute('aria-label', 'Закрыть уведомление');
        closeButton.className =
            'ml-4 p-1 text-current opacity-70 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-white rounded-full flex items-center justify-center w-6 h-6 leading-none notification-close-btn';
        closeButton.innerHTML = '<i class="fas fa-times fa-sm"></i>';

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'flex items-center justify-between w-full';
        contentWrapper.appendChild(textContainer);
        contentWrapper.appendChild(closeButton);

        notificationElement.appendChild(contentWrapper);
    }

    messageSpan.textContent = message;

    const closeAndRemove = () => {
        if (!document.body.contains(notificationElement)) {
            console.log(
                `[ShowNotification_V5.2_INLINE_STYLE CloseAndRemove] Элемент (msg: "${messageSpan.textContent}") уже удален, выход.`,
            );
            return;
        }
        console.log(
            `[ShowNotification_V5.2_INLINE_STYLE CloseAndRemove] Запуск закрытия для (msg: "${messageSpan.textContent}").`,
        );

        clearTimeout(Number(notificationElement.dataset.hideTimeoutId));
        clearTimeout(Number(notificationElement.dataset.removeTimeoutId));

        notificationElement.style.transform = 'translateX(100%)';
        notificationElement.style.opacity = '0';
        console.log(
            `[ShowNotification_V5.2_INLINE_STYLE CloseAndRemove] Анимация скрытия для (msg: "${messageSpan.textContent}") запущена.`,
        );

        const currentRemoveId = setTimeout(() => {
            if (document.body.contains(notificationElement)) {
                notificationElement.remove();
                console.log(
                    `[ShowNotification_V5.2_INLINE_STYLE CloseAndRemove] Элемент (msg: "${messageSpan.textContent}") удален из DOM по таймеру.`,
                );
            }
        }, FADE_DURATION_MS);
        notificationElement.dataset.removeTimeoutId = currentRemoveId.toString();
    };

    if (closeButton._clickHandler) {
        closeButton.removeEventListener('click', closeButton._clickHandler);
    }
    closeButton._clickHandler = (e) => {
        e.stopPropagation();
        console.log(
            `[ShowNotification_V5.2_INLINE_STYLE] Клик по крестику для (msg: "${messageSpan.textContent}").`,
        );
        closeAndRemove();
    };
    closeButton.addEventListener('click', closeButton._clickHandler);

    if (isNewNotification) {
        const container = document.getElementById('notification-container');
        (container || document.body).appendChild(notificationElement);
        console.log(
            `[ShowNotification_V5.2_INLINE_STYLE] Новое уведомление (msg: "${message}") добавлено в DOM.`,
        );
    }

    if (!isNewNotification) {
        notificationElement.style.transform = 'translateX(100%)';
        notificationElement.style.opacity = '0';
    }

    notificationElement.dataset.animationFrameId = requestAnimationFrame(() => {
        if (document.body.contains(notificationElement)) {
            notificationElement.style.transform = 'translateX(0)';
            notificationElement.style.opacity = '1';
            console.log(
                `[ShowNotification_V5.2_INLINE_STYLE] Анимация появления/обновления для (msg: "${message}") запущена.`,
            );
        }
    }).toString();

    if (duration > 0) {
        const hideTimeoutId = setTimeout(closeAndRemove, duration);
        notificationElement.dataset.hideTimeoutId = hideTimeoutId.toString();
        console.log(
            `[ShowNotification_V5.2_INLINE_STYLE] Установлен hideTimeoutId: ${hideTimeoutId} на ${duration}ms для (msg: "${message}").`,
        );
    } else if (duration === 0) {
        console.log(
            `[ShowNotification_V5.2_INLINE_STYLE] Duration is 0 для (msg: "${message}"). Автоматическое закрытие НЕ будет установлено.`,
        );
    }
}
