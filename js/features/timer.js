'use strict';

import { TIMER_STATE_KEY } from '../constants.js';
import { State } from '../app/state.js';
import { NotificationService } from '../services/notification.js';

// ============================================================================
// TIMER SYSTEM
// ============================================================================

// Timer state variables
let notificationPermissionState = null;
let timerInterval = null;
const timerDefaultDuration = 110;
let timerCurrentSetDuration = timerDefaultDuration;
let targetEndTime = 0;
let timeLeftVisual = timerDefaultDuration;
let isTimerRunning = false;
let originalDocumentTitle = '';

// DOM element references
let timerDisplayElement,
    timerToggleButton,
    timerResetButton,
    timerIncreaseButton,
    timerDecreaseButton;
let timerToggleIcon;

// Helper function to show in-app notification
function showNotification(message, type = 'success', duration = 5000) {
    if (typeof NotificationService !== 'undefined' && NotificationService.add) {
        NotificationService.add(message, type, { duration });
    } else if (typeof window.showNotification === 'function') {
        window.showNotification(message, type, duration);
    } else {
        console.log(`[Notification] ${type}: ${message}`);
    }
}

/**
 * Request permission for browser notifications
 */
export async function requestAppNotificationPermission() {
    if (!('Notification' in window)) {
        console.warn('Этот браузер не поддерживает десктопные уведомления.');
        notificationPermissionState = 'denied';
        return false;
    }

    const currentBrowserPermission = Notification.permission;
    console.log(
        `requestAppNotificationPermission: Текущее Notification.permission = '${currentBrowserPermission}'`,
    );

    if (currentBrowserPermission === 'granted') {
        console.log(
            'requestAppNotificationPermission: Разрешение на уведомления уже предоставлено.',
        );
        if (notificationPermissionState !== 'granted') {
            notificationPermissionState = 'granted';
        }
        return true;
    }

    if (currentBrowserPermission === 'denied') {
        console.log(
            'requestAppNotificationPermission: Разрешение на уведомления было ранее отклонено браузером.',
        );
        if (notificationPermissionState !== 'denied') {
            notificationPermissionState = 'denied';
        }
        return false;
    }

    console.log(
        'requestAppNotificationPermission: Запрашиваем разрешение у пользователя (Notification.requestPermission)...',
    );
    try {
        const permissionResult = await Notification.requestPermission();
        console.log(
            `requestAppNotificationPermission: Результат Notification.requestPermission() = '${permissionResult}'`,
        );
        notificationPermissionState = permissionResult;

        if (permissionResult === 'granted') {
            console.log('requestAppNotificationPermission: Пользователь предоставил разрешение.');
            return true;
        } else if (permissionResult === 'denied') {
            console.log('requestAppNotificationPermission: Пользователь отклонил запрос.');
            return false;
        } else {
            console.log(
                "requestAppNotificationPermission: Пользователь закрыл диалог запроса или статус остался 'default'.",
            );
            return false;
        }
    } catch (error) {
        console.error(
            'requestAppNotificationPermission: Ошибка при вызове Notification.requestPermission():',
            error,
        );
        notificationPermissionState = 'denied';
        return false;
    }
}

/**
 * Show a system notification
 */
export function showAppNotification(title, body) {
    if (!('Notification' in window)) {
        console.warn(
            'Попытка показать уведомление, но браузер их не поддерживает. Используется alert.',
        );
        const alertMessage = body ? `${title}\n${body}` : title;
        alert(alertMessage);
        return;
    }

    const currentBrowserPermission = Notification.permission;
    if (notificationPermissionState !== currentBrowserPermission) {
        console.log(
            `showAppNotification: Синхронизация notificationPermissionState. Старое: '${notificationPermissionState}', Новое (из Notification.permission): '${currentBrowserPermission}'.`,
        );
        notificationPermissionState = currentBrowserPermission;
    }

    if (notificationPermissionState === 'granted') {
        try {
            const iconLink = document.querySelector('link[rel="icon"]');
            const notificationOptions = {
                body: body || '',
                silent: true,
                requireInteraction: true,
            };

            let iconUsedInThisAttempt = false;
            if (iconLink && iconLink.href) {
                try {
                    const fullIconUrl = new URL(iconLink.href, window.location.origin).href;
                    notificationOptions.icon = fullIconUrl;
                    iconUsedInThisAttempt = true;
                    console.log('Иконка для уведомления установлена:', fullIconUrl);
                } catch (e) {
                    console.warn(
                        'Некорректный URL иконки, уведомление будет без иконки:',
                        iconLink.href,
                        e,
                    );
                }
            } else {
                console.log(
                    'Иконка для уведомлений не найдена или не указана, уведомление будет без иконки.',
                );
            }

            console.log(
                'showAppNotification: Попытка создать и показать уведомление с опциями:',
                JSON.stringify(notificationOptions),
            );
            const notification = new Notification(title, notificationOptions);

            notification.onclick = () => {
                window.focus();
                notification.close();
                console.log('Уведомление нажато и закрыто, фокус на окне.');
            };

            notification.onshow = () => {
                console.log('Уведомление успешно ПОКАЗАНО системой:', title);
            };

            notification.onerror = (err) => {
                console.error(
                    'Ошибка при отображении уведомления системой (первичная попытка):',
                    err,
                );
                if (err && typeof err.message !== 'undefined')
                    console.error('Сообщение об ошибке (первичная попытка): ', err.message);
                if (err && typeof err.name !== 'undefined')
                    console.error('Имя ошибки (первичная попытка): ', err.name);
                console.log('Полный объект ошибки (первичная попытка):');
                console.dir(err);

                if (iconUsedInThisAttempt) {
                    console.warn(
                        'Первичная ошибка была при показе уведомления с иконкой. Попытка показать уведомление БЕЗ ИКОНКИ...',
                    );
                    const fallbackOptions = { ...notificationOptions };
                    delete fallbackOptions.icon;
                    console.log(
                        'showAppNotification: Попытка создать и показать резервное уведомление (без иконки) с опциями:',
                        JSON.stringify(fallbackOptions),
                    );

                    try {
                        const fallbackNotification = new Notification(title, fallbackOptions);
                        fallbackNotification.onclick = () => {
                            window.focus();
                            fallbackNotification.close();
                            console.log('Резервное уведомление (без иконки) нажато и закрыто.');
                        };
                        fallbackNotification.onshow = () => {
                            console.log(
                                'Резервное уведомление (без иконки) успешно ПОКАЗАНО системой:',
                                title,
                            );
                        };
                        fallbackNotification.onerror = (e2) => {
                            console.error(
                                'Ошибка при отображении РЕЗЕРВНОГО уведомления (без иконки):',
                                e2,
                            );
                            if (e2 && typeof e2.message !== 'undefined')
                                console.error('Сообщение об ошибке (резервное): ', e2.message);
                            if (e2 && typeof e2.name !== 'undefined')
                                console.error('Имя ошибки (резервное): ', e2.name);
                            console.log('Полный объект ошибки (резервное уведомление):');
                            console.dir(e2);

                            showNotification(
                                "Не удалось показать системное уведомление (даже резервное без иконки). Проверьте настройки браузера и ОС (например, 'Фокусировка внимания' в Windows).",
                                'error',
                                12000,
                            );
                            const alertMessageError = body
                                ? `${title}\n${body}\n(Ошибка системного уведомления)`
                                : `${title}\n(Ошибка системного уведомления)`;
                            alert(alertMessageError);
                        };
                        console.log(
                            'Резервное уведомление (без иконки) создано. Ожидание onshow/onerror...',
                        );
                        return;
                    } catch (e2_create) {
                        console.error(
                            'Критическая ошибка при СОЗДАНИИ РЕЗЕРВНОГО уведомления (без иконки):',
                            e2_create,
                        );
                    }
                }

                console.warn(
                    'Не удалось показать системное уведомление (либо первичная попытка без иконки, либо резервная попытка также не удалась). Используется кастомное уведомление на странице и alert.',
                );
                showNotification(
                    "Не удалось показать системное уведомление. Проверьте настройки браузера и операционной системы (например, 'Фокусировка внимания' в Windows или разрешения для браузера в центре уведомлений).",
                    'error',
                    10000,
                );
                const alertMessageError = body
                    ? `${title}\n${body}\n(Ошибка системного уведомления)`
                    : `${title}\n(Ошибка системного уведомления)`;
                alert(alertMessageError);
            };

            console.log('Объект Notification успешно создан (основная попытка):', title);
        } catch (e_create) {
            console.error(
                'Критическая ошибка при СОЗДАНИИ объекта Notification (основная попытка):',
                e_create,
            );
            showNotification(
                `Критическая ошибка при создании системного уведомления: ${e_create.message}. Проверьте консоль.`,
                'error',
                8000,
            );
            const alertMessageCatch = body ? `${title}\n${body}` : title;
            alert(alertMessageCatch);
        }
    } else if (notificationPermissionState === 'denied') {
        const alertMessage = body ? `${title}\n${body}` : title;
        console.warn(
            `Системные уведомления отклонены (статус: ${notificationPermissionState}). Используется alert: ${alertMessage}`,
        );
        alert(alertMessage);
        showNotification(
            "Системные уведомления заблокированы. Чтобы их получать, измените настройки браузера (обычно, клик по замку в адресной строке) и проверьте системные настройки Windows (раздел 'Уведомления и действия', 'Фокусировка внимания').",
            'warning',
            10000,
        );
    } else {
        const alertMessage = body ? `${title}\n${body}` : title;
        console.warn(
            `Разрешение на системные уведомления не определено (статус: ${notificationPermissionState}). Используется alert: ${alertMessage}`,
        );
        alert(alertMessage);
        showNotification(
            'Для получения системных уведомлений, пожалуйста, разрешите их в появившемся запросе браузера. Если запрос не появляется, проверьте настройки разрешений для этого сайта в браузере и системные настройки Windows.',
            'info',
            10000,
        );
    }
}

/**
 * Save timer state to localStorage
 */
export function saveTimerState() {
    try {
        const timerState = {
            timerCurrentSetDuration,
            isTimerRunning,
            targetEndTime: isTimerRunning ? targetEndTime : null,
            timeLeftVisualOnPause: !isTimerRunning ? timeLeftVisual : null,
        };
        localStorage.setItem(TIMER_STATE_KEY, JSON.stringify(timerState));
        console.log('Timer state saved:', timerState);
    } catch (error) {
        console.error('Ошибка сохранения состояния таймера в localStorage:', error);
    }
}

/**
 * Load timer state from localStorage
 */
export function loadTimerState() {
    try {
        const savedStateJSON = localStorage.getItem(TIMER_STATE_KEY);
        if (savedStateJSON) {
            const savedState = JSON.parse(savedStateJSON);
            console.log('Loaded timer state from localStorage:', savedState);

            timerCurrentSetDuration =
                typeof savedState.timerCurrentSetDuration === 'number' &&
                savedState.timerCurrentSetDuration >= 0
                    ? savedState.timerCurrentSetDuration
                    : timerDefaultDuration;

            isTimerRunning =
                typeof savedState.isTimerRunning === 'boolean' ? savedState.isTimerRunning : false;

            if (
                isTimerRunning &&
                typeof savedState.targetEndTime === 'number' &&
                savedState.targetEndTime > 0
            ) {
                targetEndTime = savedState.targetEndTime;
                const now = Date.now();
                timeLeftVisual = Math.max(0, Math.round((targetEndTime - now) / 1000));
                if (timeLeftVisual === 0) {
                    isTimerRunning = false;
                }
            } else {
                isTimerRunning = false;
                targetEndTime = 0;
                timeLeftVisual =
                    typeof savedState.timeLeftVisualOnPause === 'number' &&
                    savedState.timeLeftVisualOnPause >= 0
                        ? savedState.timeLeftVisualOnPause
                        : timerCurrentSetDuration;
            }
            if (timeLeftVisual <= 0 && isTimerRunning && savedState.targetEndTime > 0) {
                console.log('Таймер истек во время отсутствия, вызываем handleTimerEnd.');
                isTimerRunning = false;
            } else if (timeLeftVisual <= 0 && !isTimerRunning) {
                timeLeftVisual = timerCurrentSetDuration;
            }
        } else {
            console.log(
                'Сохраненное состояние таймера не найдено, установка значений по умолчанию.',
            );
            timerCurrentSetDuration = timerDefaultDuration;
            timeLeftVisual = timerCurrentSetDuration;
            isTimerRunning = false;
            targetEndTime = 0;
        }
    } catch (error) {
        console.error('Ошибка загрузки состояния таймера из localStorage:', error);
        timerCurrentSetDuration = timerDefaultDuration;
        timeLeftVisual = timerCurrentSetDuration;
        isTimerRunning = false;
        targetEndTime = 0;
    }
    updateTimerDisplay();
}

/**
 * Handle timer end
 */
export function handleTimerEnd() {
    isTimerRunning = false;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;

    timeLeftVisual = 0;

    showAppNotification('ВЕРНИСЬ К КЛИЕНТУ!');
    if (originalDocumentTitle) {
        document.title = '⏰ ВРЕМЯ! - ' + originalDocumentTitle;
    } else {
        const currentTitle = document.title;
        if (!currentTitle.startsWith('⏰ ВРЕМЯ! - ')) {
            document.title = '⏰ ВРЕМЯ! - ' + currentTitle;
        }
    }
    updateTimerDisplay();
    saveTimerState();
    console.log('Таймер завершен.');
}

/**
 * Start timer internal
 */
export function startTimerInternal() {
    if (timerInterval) clearInterval(timerInterval);

    if (targetEndTime <= Date.now() && timeLeftVisual > 0) {
        targetEndTime = Date.now() + timeLeftVisual * 1000;
        console.log(
            `Таймер запускается/возобновляется. Новое targetEndTime: ${new Date(
                targetEndTime,
            ).toLocaleTimeString()}`,
        );
    } else if (timeLeftVisual <= 0) {
        console.log('Попытка запуска таймера с нулевым временем. Вызов handleTimerEnd.');
        handleTimerEnd();
        return;
    }

    isTimerRunning = true;

    timerInterval = setInterval(() => {
        const now = Date.now();
        const newTimeLeftVisual = Math.max(0, Math.round((targetEndTime - now) / 1000));

        if (newTimeLeftVisual !== timeLeftVisual) {
            timeLeftVisual = newTimeLeftVisual;
            updateTimerDisplay();
        }

        if (timeLeftVisual <= 0) {
            handleTimerEnd();
        }
        saveTimerState();
    }, 1000);

    const initialTimeLeft = Math.max(0, Math.round((targetEndTime - Date.now()) / 1000));
    if (initialTimeLeft !== timeLeftVisual) {
        timeLeftVisual = initialTimeLeft;
    }
    updateTimerDisplay();
    saveTimerState();
    console.log(
        'Таймер запущен (внутренний интервал). targetEndTime:',
        new Date(targetEndTime).toLocaleTimeString(),
    );
}

/**
 * Pause timer
 */
export function pauseTimer() {
    if (!isTimerRunning) return;
    isTimerRunning = false;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;

    updateTimerDisplay();
    saveTimerState();
    console.log('Таймер на паузе. Оставшееся время для отображения:', timeLeftVisual);
}

/**
 * Toggle timer (start/pause)
 */
export async function toggleTimer() {
    if (isTimerRunning) {
        console.log('toggleTimer: Пауза таймера.');
        pauseTimer();
    } else {
        console.log('toggleTimer: Попытка запуска таймера.');

        if (timeLeftVisual <= 0 && timerCurrentSetDuration > 0) {
            timeLeftVisual = timerCurrentSetDuration;
            targetEndTime = 0;
            console.log(
                `toggleTimer: Время было <= 0, сброшено на ${timeLeftVisual}с из timerCurrentSetDuration.`,
            );
        } else if (timeLeftVisual <= 0 && timerCurrentSetDuration <= 0) {
            timerCurrentSetDuration = timerDefaultDuration;
            timeLeftVisual = timerCurrentSetDuration;
            targetEndTime = 0;
            console.log(
                `toggleTimer: Время и установленная длительность были <=0. Сброшено на ${timerDefaultDuration}с.`,
            );
        }

        let permissionObtainedForNotifications = notificationPermissionState === 'granted';
        if (!permissionObtainedForNotifications) {
            const currentGlobalPermission = Notification.permission;
            if (currentGlobalPermission === 'granted') {
                notificationPermissionState = 'granted';
                permissionObtainedForNotifications = true;
                showNotification('Системные уведомления уже разрешены.', 'info');
            } else if (currentGlobalPermission === 'denied') {
                notificationPermissionState = 'denied';
                permissionObtainedForNotifications = false;
                showNotification(
                    'Уведомления заблокированы. Проверьте настройки браузера и системные настройки Windows.',
                    'info',
                    10000,
                );
            } else {
                permissionObtainedForNotifications = await requestAppNotificationPermission();
                if (permissionObtainedForNotifications) {
                    showNotification('Системные уведомления успешно разрешены!', 'success');
                } else {
                    if (notificationPermissionState === 'denied') {
                        showNotification(
                            'Вы отклонили показ уведомлений. Если передумаете, измените настройки браузера и проверьте системные настройки Windows.',
                            'info',
                            10000,
                        );
                    } else {
                        showNotification(
                            'Запрос на уведомления закрыт без выбора или не был успешно обработан. Уведомления таймера могут не работать.',
                            'warning',
                            10000,
                        );
                    }
                }
            }
        }

        if (originalDocumentTitle && document.title.startsWith('⏰')) {
            document.title = originalDocumentTitle;
        }
        startTimerInternal();
        console.log('toggleTimer: Таймер запущен.');
    }
}

/**
 * Reset timer
 */
export function resetTimer(event) {
    pauseTimer();

    if (event && event.ctrlKey) {
        timerCurrentSetDuration = 0;
        timeLeftVisual = 0;
        console.log('Таймер сброшен в 00:00 (Ctrl+Click).');
    } else {
        timerCurrentSetDuration = timerDefaultDuration;
        timeLeftVisual = timerCurrentSetDuration;
        console.log(`Таймер сброшен на значение по умолчанию: ${timerDefaultDuration} сек.`);
    }

    targetEndTime = 0;

    if (originalDocumentTitle && document.title.startsWith('⏰')) {
        document.title = originalDocumentTitle;
    }
    updateTimerDisplay();
    saveTimerState();
}

/**
 * Adjust timer duration
 */
export function adjustTimerDuration(secondsToAdd) {
    const minDuration = 10;
    const maxDuration = 3600;

    timerCurrentSetDuration = Math.max(
        minDuration,
        Math.min(maxDuration, timerCurrentSetDuration + secondsToAdd),
    );

    if (isTimerRunning) {
        const newEffectiveTimeLeft = Math.max(0, timeLeftVisual + secondsToAdd);
        targetEndTime = Date.now() + newEffectiveTimeLeft * 1000;
        timeLeftVisual = newEffectiveTimeLeft;

        if (timeLeftVisual <= 0) {
            handleTimerEnd();
            return;
        }
    } else {
        timeLeftVisual = timerCurrentSetDuration;
        targetEndTime = 0;
    }
    updateTimerDisplay();
    saveTimerState();
    console.log(
        `Длительность таймера изменена. Новая установленная: ${timerCurrentSetDuration} сек. Текущее отображаемое время: ${timeLeftVisual} сек.`,
    );
}

/**
 * Switch to edit mode for timer segment
 */
export function switchToEditMode(unitSpanElement, unitType) {
    if (State.activeEditingUnitElement) {
        commitTimerEdit(false);
    }
    if (State.activeEditingUnitElement) return;

    State.activeEditingUnitElement = unitSpanElement;
    const currentValue = parseInt(unitSpanElement.textContent, 10);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'timer-input-active';
    input.style.width = unitSpanElement.offsetWidth + 'px';
    input.style.height = unitSpanElement.offsetHeight + 'px';
    input.style.textAlign = 'center';
    input.style.fontFamily = 'monospace';
    input.style.fontSize = 'inherit';
    input.style.border = '1px solid var(--color-primary, #9333ea)';
    input.style.borderRadius = '3px';
    input.style.padding = '0 2px';
    input.style.boxSizing = 'border-box';
    input.style.backgroundColor = 'var(--input-bg-color, #fff)';
    input.style.color = 'var(--input-text-color, #000)';

    input.maxLength = 2;
    input.value = String(currentValue).padStart(2, '0');

    input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '');
    });

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            commitTimerEdit(false);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelTimerEdit();
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(() => {
            if (
                timerDisplayElement.contains(input) &&
                State.activeEditingUnitElement === unitSpanElement
            ) {
                commitTimerEdit(false);
            }
        }, 100);
    });

    unitSpanElement.style.display = 'none';
    unitSpanElement.parentNode.insertBefore(input, unitSpanElement.nextSibling);
    if (unitSpanElement === State.timerElements.minutesSpan && State.timerElements.colonSpan) {
        State.timerElements.colonSpan.style.display = 'none';
    } else if (unitSpanElement === State.timerElements.secondsSpan && State.timerElements.colonSpan) {
        State.timerElements.colonSpan.style.display = 'none';
    }
    input.focus();
    input.select();
}

/**
 * Commit timer edit
 */
export function commitTimerEdit(triggerButtonAction = false) {
    if (!State.activeEditingUnitElement) return;

    const inputElement = timerDisplayElement.querySelector('input.timer-input-active');
    if (!inputElement) {
        cancelTimerEdit();
        return;
    }

    let value = parseInt(inputElement.value, 10);

    if (isNaN(value) || value < 0) {
        value = 0;
    } else if (value > 59) {
        value = 59;
    }

    const unitType = State.activeEditingUnitElement.id.includes('Minutes') ? 'minutes' : 'seconds';
    const wasTimerRunning = isTimerRunning;

    if (wasTimerRunning) {
        pauseTimer();
    }

    let currentMinutes = Math.floor(timeLeftVisual / 60);
    let currentSeconds = timeLeftVisual % 60;

    if (unitType === 'minutes') {
        currentMinutes = value;
    } else {
        currentSeconds = value;
    }

    timeLeftVisual = currentMinutes * 60 + currentSeconds;
    timerCurrentSetDuration = timeLeftVisual;

    inputElement.remove();
    State.activeEditingUnitElement.style.display = 'inline-block';
    if (State.timerElements.colonSpan) State.timerElements.colonSpan.style.display = 'inline-block';
    State.activeEditingUnitElement = null;

    updateTimerDisplay();
    saveTimerState();

    if (triggerButtonAction) {
        if (timeLeftVisual > 0) {
            if (!wasTimerRunning) {
                toggleTimer();
            } else {
                startTimerInternal();
            }
        } else if (timeLeftVisual === 0 && wasTimerRunning) {
            handleTimerEnd();
        }
    } else {
        if (wasTimerRunning && timeLeftVisual > 0) {
            isTimerRunning = false;
            updateTimerDisplay();
        } else if (timeLeftVisual === 0) {
            handleTimerEnd();
        }
    }
}

/**
 * Cancel timer edit
 */
export function cancelTimerEdit() {
    if (!State.activeEditingUnitElement) return;

    const inputElement = timerDisplayElement.querySelector('input.timer-input-active');
    if (inputElement) {
        inputElement.remove();
    }
    State.activeEditingUnitElement.style.display = 'inline-block';
    if (State.timerElements.colonSpan) State.timerElements.colonSpan.style.display = 'inline-block';
    State.activeEditingUnitElement = null;
    updateTimerDisplay();
}

/**
 * Update timer display
 */
export function updateTimerDisplay() {
    if (
        !timerDisplayElement ||
        !timerToggleIcon ||
        !State.timerElements.minutesSpan ||
        !State.timerElements.secondsSpan
    ) {
        if (timerDisplayElement && (!State.timerElements.minutesSpan || !State.timerElements.secondsSpan)) {
            const minutes = Math.floor(timeLeftVisual / 60);
            const seconds = timeLeftVisual % 60;
            timerDisplayElement.textContent = `${String(minutes).padStart(2, '0')}:${String(
                seconds,
            ).padStart(2, '0')}`;
        }

        if (timerToggleIcon) {
            if (isTimerRunning) {
                timerToggleIcon.classList.remove('fa-play');
                timerToggleIcon.classList.add('fa-pause');
            } else {
                timerToggleIcon.classList.remove('fa-pause');
                timerToggleIcon.classList.add('fa-play');
            }
        }
        return;
    }

    const minutes = Math.floor(timeLeftVisual / 60);
    const seconds = timeLeftVisual % 60;

    if (State.activeEditingUnitElement !== State.timerElements.minutesSpan) {
        State.timerElements.minutesSpan.textContent = String(minutes).padStart(2, '0');
    }
    if (State.activeEditingUnitElement !== State.timerElements.secondsSpan) {
        State.timerElements.secondsSpan.textContent = String(seconds).padStart(2, '0');
    }

    if (isTimerRunning) {
        timerToggleIcon.classList.remove('fa-play');
        timerToggleIcon.classList.add('fa-pause');
    } else {
        timerToggleIcon.classList.remove('fa-pause');
        timerToggleIcon.classList.add('fa-play');
    }
}

/**
 * Initialize timer system
 */
export function initTimerSystem() {
    originalDocumentTitle = document.title;

    timerDisplayElement = document.getElementById('timerDisplay');
    timerToggleButton = document.getElementById('timerToggleButton');
    timerResetButton = document.getElementById('timerResetButton');
    timerIncreaseButton = document.getElementById('timerIncreaseButton');
    timerDecreaseButton = document.getElementById('timerDecreaseButton');

    if (
        !timerDisplayElement ||
        !timerToggleButton ||
        !timerResetButton ||
        !timerIncreaseButton ||
        !timerDecreaseButton
    ) {
        console.error('Ошибка инициализации таймера: не найдены все DOM-элементы.');
        return;
    }

    timerDisplayElement.innerHTML = `
        <span id="timerMinutesDisplay" class="timer-segment" tabindex="0" role="textbox" aria-label="Минуты"></span>
        <span class="timer-colon" aria-hidden="true">:</span>
        <span id="timerSecondsDisplay" class="timer-segment" tabindex="0" role="textbox" aria-label="Секунды"></span>
    `;

    State.timerElements.minutesSpan = document.getElementById('timerMinutesDisplay');
    State.timerElements.secondsSpan = document.getElementById('timerSecondsDisplay');
    State.timerElements.colonSpan = timerDisplayElement.querySelector('.timer-colon');

    timerToggleIcon = timerToggleButton.querySelector('i');
    if (!timerToggleIcon) {
        console.error('Ошибка инициализации таймера: не найдена иконка для кнопки play/pause.');
        return;
    }

    const currentPermission = Notification.permission;
    if (currentPermission === 'granted') {
        notificationPermissionState = 'granted';
    } else if (currentPermission === 'denied') {
        notificationPermissionState = 'denied';
        NotificationService.add(
            'Системные уведомления таймера заблокированы. Вы можете не увидеть оповещение о завершении. Проверьте настройки браузера и Windows.',
            'warning',
            { duration: 10000 },
        );
    } else {
        notificationPermissionState = 'default';
    }

    loadTimerState();

    if (isTimerRunning) {
        const now = Date.now();
        if (targetEndTime > now) {
            timeLeftVisual = Math.max(0, Math.round((targetEndTime - now) / 1000));
            if (timeLeftVisual > 0) {
                startTimerInternal();
                console.log('Таймер был активен, перезапущен после загрузки страницы.');
            } else {
                isTimerRunning = false;
                handleTimerEnd();
                console.log('Таймер истек во время закрытия вкладки/браузера.');
            }
        } else {
            isTimerRunning = false;
            if (timeLeftVisual > 0 && targetEndTime > 0) {
                timeLeftVisual = 0;
            }
            if (timeLeftVisual <= 0) {
                handleTimerEnd();
            }
            console.log('Сохраненное targetEndTime уже в прошлом. Таймер завершен.');
        }
    } else {
        if (timeLeftVisual <= 0 && timerCurrentSetDuration > 0) {
            timeLeftVisual = timerCurrentSetDuration;
        } else if (timeLeftVisual <= 0 && timerCurrentSetDuration <= 0) {
            timeLeftVisual = timerDefaultDuration;
            timerCurrentSetDuration = timerDefaultDuration;
        }
        console.log(
            'Таймер не был активен при загрузке. Отображается сохраненное/установленное время.',
        );
    }

    updateTimerDisplay();

    timerToggleButton.addEventListener('click', () => {
        if (State.activeEditingUnitElement) {
            commitTimerEdit(true);
        } else {
            toggleTimer();
        }
    });
    timerResetButton.addEventListener('click', (event) => {
        if (State.activeEditingUnitElement) {
            cancelTimerEdit();
        }
        resetTimer(event);
    });

    timerIncreaseButton.addEventListener('click', (event) => {
        if (State.activeEditingUnitElement) {
            cancelTimerEdit();
        }
        const amount = event.ctrlKey ? 5 : 30;
        adjustTimerDuration(amount);
    });
    timerDecreaseButton.addEventListener('click', (event) => {
        if (State.activeEditingUnitElement) {
            cancelTimerEdit();
        }
        const amount = event.ctrlKey ? -5 : -30;
        adjustTimerDuration(amount);
    });

    State.timerElements.minutesSpan.addEventListener('click', () =>
        switchToEditMode(State.timerElements.minutesSpan, 'minutes'),
    );
    State.timerElements.secondsSpan.addEventListener('click', () =>
        switchToEditMode(State.timerElements.secondsSpan, 'seconds'),
    );

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && State.activeEditingUnitElement) {
            const inputElement = timerDisplayElement.querySelector('input.timer-input-active');
            if (inputElement && document.activeElement === inputElement) {
                cancelTimerEdit();
            }
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && isTimerRunning) {
            console.log('Вкладка стала видимой, таймер запущен. Проверка и синхронизация времени.');
            const now = Date.now();
            const expectedTimeLeft = Math.max(0, Math.round((targetEndTime - now) / 1000));
            if (Math.abs(expectedTimeLeft - timeLeftVisual) > 2 && timeLeftVisual > 0) {
                console.warn(
                    `Обнаружено расхождение времени при активации вкладки. Ожидалось: ${expectedTimeLeft}, Отображалось: ${timeLeftVisual}. Синхронизация.`,
                );
                timeLeftVisual = expectedTimeLeft;
                if (timeLeftVisual <= 0) {
                    handleTimerEnd();
                } else {
                    updateTimerDisplay();
                    pauseTimer();
                    startTimerInternal();
                }
            } else if (timeLeftVisual <= 0 && targetEndTime > now) {
                timeLeftVisual = expectedTimeLeft;
                console.log(
                    "Таймер 'восстановлен' после неактивности, так как targetEndTime еще не достигнут.",
                );
                updateTimerDisplay();
                if (!timerInterval) {
                    startTimerInternal();
                }
            }
        }
    });

    console.log('Система таймера инициализирована (v_editable_compact_css_driven).');
}

// Export for window access (backward compatibility)
if (typeof window !== 'undefined') {
    window.initTimerSystem = initTimerSystem;
    window.toggleTimer = toggleTimer;
    window.resetTimer = resetTimer;
    window.adjustTimerDuration = adjustTimerDuration;
}
