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
let timerRafId = null; // зарезервировано: rAF-цикл убран (лишняя нагрузка CPU), поле оставлено для совместимости
let lastTimerTickAt = 0;
let timerWatchdogId = null;
const TIMER_WATCHDOG_INTERVAL_MS = 3000;
const TIMER_STALL_THRESHOLD_MS = 2500;
const timerDefaultDuration = 110;
let timerCurrentSetDuration = timerDefaultDuration;
let targetEndTime = 0;
let timeLeftVisual = timerDefaultDuration;
let isTimerRunning = false;
let originalDocumentTitle = '';
/** Точный остаток (мс) на момент паузы: возобновление идёт без округления до секунд (нет дрейфа). */
let pausedRemainingMs = null;
/** Таймер истёк и пользователь ещё не начал новый отсчёт (держит статичное красное состояние). */
let timerExpired = false;
/** Пользователь «погасил» пульсацию истёкшего таймера (клик/закрытие модалки). */
let timerExpiredAcked = false;

/** Подробный лог только при localStorage.copilotDebug === '1'. */
function dlog(...args) {
    try {
        if (localStorage.getItem('copilotDebug') === '1') console.log(...args);
    } catch {
        /* localStorage недоступен */
    }
}

/** Секунды для отображения: округление ВВЕРХ (00:00 показывается только в момент окончания). */
function secondsLeftFromMs(ms) {
    return Math.max(0, Math.ceil(ms / 1000));
}

// Aggressive notification: title/favicon flash when tab is in background
const TIMER_END_FLASH_TITLE = '⏰ ВЕРНИСЬ К КЛИЕНТУ!';
const TITLE_FLASH_INTERVAL_MS = 600;
let titleFlashIntervalId = null;
let faviconFlashIntervalId = null;
let originalFaviconHref = null;
const ALERT_FAVICON_SVG =
    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="%23DC2626"/><text x="16" y="22" font-size="18" text-anchor="middle">⏰</text></svg>';

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
        dlog(`[Notification] ${type}: ${message}`);
    }
}

/**
 * Воспроизвести короткий звуковой сигнал при окончании таймера (Web Audio API).
 * Запасной канал внимания, когда системное уведомление без звука или недоступно.
 * Не прерывает выполнение при ошибке (autoplay policy, отсутствие поддержки).
 */
function playTimerEndSound() {
    try {
        const Ctx =
            typeof AudioContext !== 'undefined'
                ? AudioContext
                : typeof window !== 'undefined' && window.webkitAudioContext
                  ? window.webkitAudioContext
                  : null;
        if (!Ctx) return;
        const ctx = new Ctx();
        const playBeep = (startTime) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.15, startTime);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);
            osc.start(startTime);
            osc.stop(startTime + 0.15);
        };
        playBeep(0);
        playBeep(0.4);
        playBeep(0.8);
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch {
        // Игнорируем: автоплей заблокирован или API недоступен
    }
}

/**
 * Start flashing tab title when timer ended and tab is in background.
 */
function startTitleFlash() {
    stopTitleFlash();
    titleFlashIntervalId = setInterval(() => {
        document.title =
            document.title === TIMER_END_FLASH_TITLE
                ? originalDocumentTitle
                : TIMER_END_FLASH_TITLE;
    }, TITLE_FLASH_INTERVAL_MS);
}

/**
 * Stop title flash and restore original title.
 */
function stopTitleFlash() {
    if (titleFlashIntervalId) {
        clearInterval(titleFlashIntervalId);
        titleFlashIntervalId = null;
    }
    if (originalDocumentTitle) {
        document.title = originalDocumentTitle;
    }
}

/**
 * Start flashing favicon when timer ended and tab is in background.
 */
function startFaviconFlash() {
    stopFaviconFlash();
    const link = document.querySelector('link[rel="icon"]');
    if (!link) return;
    if (originalFaviconHref === null) {
        originalFaviconHref = link.href;
    }
    let showAlert = true;
    faviconFlashIntervalId = setInterval(() => {
        if (link.parentNode) {
            link.href = showAlert ? ALERT_FAVICON_SVG : originalFaviconHref;
            showAlert = !showAlert;
        }
    }, TITLE_FLASH_INTERVAL_MS);
}

/**
 * Stop favicon flash and restore original favicon.
 */
function stopFaviconFlash() {
    if (faviconFlashIntervalId) {
        clearInterval(faviconFlashIntervalId);
        faviconFlashIntervalId = null;
    }
    if (originalFaviconHref) {
        const link = document.querySelector('link[rel="icon"]');
        if (link) link.href = originalFaviconHref;
    }
}

/**
 * Stop all aggressive notification effects (title + favicon flash).
 */
function stopTimerEndEffects() {
    stopTitleFlash();
    stopFaviconFlash();
}

/** Текст модалки "Вернись к клиенту" (таймер) */
const TIMER_RETURN_TO_CLIENT_TITLE = 'ВЕРНИСЬ К КЛИЕНТУ, ПОТОМ ВСЁ ОСТАЛЬНОЕ!';
const TIMER_RETURN_TO_CLIENT_SUBTITLE = 'НЕ ПОЛУЧАЙ СНИЖЕНИЕ В ПРОСЛУШКЕ!';

/**
 * Показать большое модальное окно "Вернись к клиенту" (вместо браузерного уведомления).
 * Стиль: пульсирующий неоново-красный, в духе приложения.
 */
function showReturnToClientModal() {
    const modal = document.getElementById('timerReturnToClientModal');
    if (!modal) return;

    const titleEl = modal.querySelector('#timerReturnToClientModalTitle');
    const subtitleEl = modal.querySelector('#timerReturnToClientModalBox p');
    if (titleEl) titleEl.textContent = TIMER_RETURN_TO_CLIENT_TITLE;
    if (subtitleEl) subtitleEl.textContent = TIMER_RETURN_TO_CLIENT_SUBTITLE;

    const closeBtn = document.getElementById('timerReturnToClientModalCloseBtn');

    const close = () => {
        acknowledgeTimerExpired();
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden', 'modal-open');
        document.removeEventListener('keydown', onEscape);
        if (closeBtn) closeBtn.removeEventListener('click', onCloseClick);
    };

    const onCloseClick = () => close();
    const onEscape = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
        }
    };

    if (closeBtn) closeBtn.addEventListener('click', onCloseClick);
    document.addEventListener('keydown', onEscape);

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden', 'modal-open');
    try {
        window.focus();
    } catch {
        // Игнорируем: в некоторых браузерах focus() ограничен политикой
    }
    if (closeBtn) closeBtn.focus();
}

/**
 * Уведомления окончания таймера по платформам (максимум внимания):
 * — Десктоп (Chrome, Firefox, Edge, Safari): системное уведомление со звуком (silent: false), requireInteraction, renotify;
 *   при вкладке в фоне дополнительно мигают title и favicon.
 * — Мобильные: системное уведомление при разрешении; при отказе — alert. (vibrate не используется: несовместим с тихим режимом ОС/браузера.)
 * — Звук: Web Audio playTimerEndSound() даёт три коротких сигнала как запас, если системный звук недоступен или отключён.
 * — Видимая вкладка: модалка «Вернись к клиенту» + попытка window.focus() + фокус на кнопке закрытия.
 */

/**
 * Запрос разрешения на системные уведомления.
 * Используется Web Notifications API: поддерживается в современных десктопных браузерах (Chrome, Firefox, Edge, Safari на Windows/macOS/Linux).
 * При отсутствии поддержки или отказе пользователя показ уведомления о завершении таймера делается через alert().
 * На мобильных и в PWA поведение зависит от поддержки браузера.
 */
/**
 * Уведомления при старте таймера: не блокируют отсчёт.
 * Вызов Notification.requestPermission() должен остаться синхронным относительно user gesture
 * (иначе браузер может отклонить запрос); результат обрабатываем в .then().
 */
function kickOffTimerNotificationPermissionFromUserGesture() {
    if (!('Notification' in window)) return;
    const currentGlobalPermission = Notification.permission;
    if (currentGlobalPermission === 'granted') {
        if (notificationPermissionState !== 'granted') {
            notificationPermissionState = 'granted';
        }
        /* granted: только синхронизация внутреннего состояния, без тоста при каждом старте. */
        return;
    }
    if (currentGlobalPermission === 'denied') {
        notificationPermissionState = 'denied';
        showNotification(
            'Уведомления заблокированы. Проверьте настройки браузера и ОС (Windows: «Фокусировка внимания», macOS: «Не беспокоить»).',
            'info',
            10000,
        );
        return;
    }
    try {
        const permP = Notification.requestPermission();
        if (permP && typeof permP.then === 'function') {
            void permP
                .then((permissionResult) => {
                    notificationPermissionState = permissionResult;
                    if (permissionResult === 'granted') {
                        showNotification('Системные уведомления успешно разрешены!', 'success');
                    } else if (permissionResult === 'denied') {
                        showNotification(
                            'Вы отклонили показ уведомлений. Если передумаете, измените настройки браузера и ОС (Windows/macOS).',
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
                })
                .catch((error) => {
                    console.error(
                        'kickOffTimerNotificationPermissionFromUserGesture: requestPermission',
                        error,
                    );
                    notificationPermissionState = 'denied';
                });
        }
    } catch (error) {
        console.error(
            'kickOffTimerNotificationPermissionFromUserGesture: синхронная ошибка requestPermission',
            error,
        );
        notificationPermissionState = 'denied';
    }
}

export async function requestAppNotificationPermission() {
    if (!('Notification' in window)) {
        console.warn('Этот браузер не поддерживает десктопные уведомления.');
        notificationPermissionState = 'denied';
        return false;
    }

    const currentBrowserPermission = Notification.permission;
    dlog(
        `requestAppNotificationPermission: Текущее Notification.permission = '${currentBrowserPermission}'`,
    );

    if (currentBrowserPermission === 'granted') {
        dlog(
            'requestAppNotificationPermission: Разрешение на уведомления уже предоставлено.',
        );
        if (notificationPermissionState !== 'granted') {
            notificationPermissionState = 'granted';
        }
        return true;
    }

    if (currentBrowserPermission === 'denied') {
        dlog(
            'requestAppNotificationPermission: Разрешение на уведомления было ранее отклонено браузером.',
        );
        if (notificationPermissionState !== 'denied') {
            notificationPermissionState = 'denied';
        }
        return false;
    }

    dlog(
        'requestAppNotificationPermission: Запрашиваем разрешение у пользователя (Notification.requestPermission)...',
    );
    try {
        const permissionResult = await Notification.requestPermission();
        dlog(
            `requestAppNotificationPermission: Результат Notification.requestPermission() = '${permissionResult}'`,
        );
        notificationPermissionState = permissionResult;

        if (permissionResult === 'granted') {
            dlog('requestAppNotificationPermission: Пользователь предоставил разрешение.');
            return true;
        } else if (permissionResult === 'denied') {
            dlog('requestAppNotificationPermission: Пользователь отклонил запрос.');
            return false;
        } else {
            dlog(
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
        dlog(
            `showAppNotification: Синхронизация notificationPermissionState. Старое: '${notificationPermissionState}', Новое (из Notification.permission): '${currentBrowserPermission}'.`,
        );
        notificationPermissionState = currentBrowserPermission;
    }

    if (notificationPermissionState === 'granted') {
        try {
            const iconLink = document.querySelector('link[rel="icon"]');
            const notificationOptions = {
                body: body || '',
                silent: false,
                requireInteraction: true,
                tag: 'copilot-timer-end',
                renotify: true,
            };

            let iconUsedInThisAttempt = false;
            if (iconLink && iconLink.href) {
                try {
                    const fullIconUrl = new URL(iconLink.href, window.location.origin).href;
                    notificationOptions.icon = fullIconUrl;
                    iconUsedInThisAttempt = true;
                    dlog('Иконка для уведомления установлена:', fullIconUrl);
                } catch (e) {
                    console.warn(
                        'Некорректный URL иконки, уведомление будет без иконки:',
                        iconLink.href,
                        e,
                    );
                }
            } else {
                dlog(
                    'Иконка для уведомлений не найдена или не указана, уведомление будет без иконки.',
                );
            }

            dlog(
                'showAppNotification: Попытка создать и показать уведомление с опциями:',
                JSON.stringify(notificationOptions),
            );
            const notification = new Notification(title, notificationOptions);

            notification.onclick = () => {
                window.focus();
                notification.close();
                dlog('Уведомление нажато и закрыто, фокус на окне.');
            };

            notification.onshow = () => {
                dlog('Уведомление успешно ПОКАЗАНО системой:', title);
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
                dlog('Полный объект ошибки (первичная попытка):');
                console.dir(err);

                if (iconUsedInThisAttempt) {
                    console.warn(
                        'Первичная ошибка была при показе уведомления с иконкой. Попытка показать уведомление БЕЗ ИКОНКИ...',
                    );
                    const fallbackOptions = { ...notificationOptions };
                    delete fallbackOptions.icon;
                    dlog(
                        'showAppNotification: Попытка создать и показать резервное уведомление (без иконки) с опциями:',
                        JSON.stringify(fallbackOptions),
                    );

                    try {
                        const fallbackNotification = new Notification(title, fallbackOptions);
                        fallbackNotification.onclick = () => {
                            window.focus();
                            fallbackNotification.close();
                            dlog('Резервное уведомление (без иконки) нажато и закрыто.');
                        };
                        fallbackNotification.onshow = () => {
                            dlog(
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
                            dlog('Полный объект ошибки (резервное уведомление):');
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
                        dlog(
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

            dlog('Объект Notification успешно создан (основная попытка):', title);
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
            timeLeftMsOnPause: !isTimerRunning && pausedRemainingMs != null ? pausedRemainingMs : null,
        };
        localStorage.setItem(TIMER_STATE_KEY, JSON.stringify(timerState));
        dlog('Timer state saved:', timerState);
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
            dlog('Loaded timer state from localStorage:', savedState);

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
                timeLeftVisual = secondsLeftFromMs(targetEndTime - now);
                if (targetEndTime - now <= 0) {
                    isTimerRunning = false;
                    handleTimerEnd();
                    return;
                }
            } else {
                isTimerRunning = false;
                targetEndTime = 0;
                timeLeftVisual =
                    typeof savedState.timeLeftVisualOnPause === 'number' &&
                    savedState.timeLeftVisualOnPause >= 0
                        ? savedState.timeLeftVisualOnPause
                        : timerCurrentSetDuration;
                pausedRemainingMs =
                    typeof savedState.timeLeftMsOnPause === 'number' &&
                    savedState.timeLeftMsOnPause > 0 &&
                    secondsLeftFromMs(savedState.timeLeftMsOnPause) === timeLeftVisual
                        ? savedState.timeLeftMsOnPause
                        : null;
            }
            if (timeLeftVisual <= 0 && !isTimerRunning) {
                timeLeftVisual = timerCurrentSetDuration;
            }
        } else {
            dlog(
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
    // Защита от повторного срабатывания (tick + visibilitychange + watchdog): модалка и уведомление — один раз.
    if (timerExpired && !isTimerRunning) return;
    isTimerRunning = false;
    clearTick();
    pausedRemainingMs = null;
    targetEndTime = 0;
    timeLeftVisual = 0;
    timerExpired = true;
    timerExpiredAcked = false;

    showReturnToClientModal();
    showAppNotification(TIMER_RETURN_TO_CLIENT_TITLE, TIMER_RETURN_TO_CLIENT_SUBTITLE);
    playTimerEndSound();
    if (document.hidden) {
        startTitleFlash();
        startFaviconFlash();
    } else {
        if (originalDocumentTitle) {
            document.title = '⏰ ВРЕМЯ! - ' + originalDocumentTitle;
        } else {
            const currentTitle = document.title;
            if (!currentTitle.startsWith('⏰ ВРЕМЯ! - ')) {
                document.title = '⏰ ВРЕМЯ! - ' + currentTitle;
            }
        }
    }
    updateTimerDisplay();
    saveTimerState();
    dlog('Таймер завершен.');
}

/** Сбросить состояние «истёк» (начат новый отсчёт, сброс, ручная правка). */
function clearExpiredState() {
    timerExpired = false;
    timerExpiredAcked = false;
}

/**
 * «Погасить» пульсацию истёкшего таймера: статичный красный остаётся, движение прекращается.
 */
export function acknowledgeTimerExpired() {
    if (!timerExpired || timerExpiredAcked) return;
    timerExpiredAcked = true;
    updateTimerDisplay();
}

function clearTick() {
    if (timerInterval) clearTimeout(timerInterval);
    timerInterval = null;
    if (timerRafId) {
        cancelAnimationFrame(timerRafId);
        timerRafId = null;
    }
}

/**
 * Самокорректирующийся тик: следующий вызов планируется ровно на момент смены отображаемой секунды
 * (по targetEndTime), поэтому нет накопления дрейфа setInterval, а 00:00 наступает точно в срок.
 */
function timerTick() {
    timerInterval = null;
    if (!isTimerRunning) return;
    const now = Date.now();
    lastTimerTickAt = now;
    const remainingMs = targetEndTime - now;
    if (remainingMs <= 0) {
        timeLeftVisual = 0;
        handleTimerEnd();
        return;
    }
    const secs = secondsLeftFromMs(remainingMs);
    if (secs !== timeLeftVisual) {
        timeLeftVisual = secs;
        updateTimerDisplay();
    }
    scheduleNextTick(remainingMs);
}

/** Следующий тик — когда ceil(remaining/1000) уменьшится на 1 (но не реже раза в секунду). */
function scheduleNextTick(remainingMs) {
    const secs = secondsLeftFromMs(remainingMs);
    const untilNextChange = remainingMs - (secs - 1) * 1000;
    timerInterval = setTimeout(timerTick, Math.min(1000, Math.max(16, untilNextChange)));
}

/**
 * Start timer internal.
 * Если таймер уже идёт и targetEndTime в будущем — только перезапускает тик (targetEndTime не трогаем:
 * иначе округлённое отображаемое значение давало бы дрейф и «продление» при простое).
 */
export function startTimerInternal() {
    clearTick();
    const now = Date.now();

    if (isTimerRunning && targetEndTime > 0) {
        if (targetEndTime <= now) {
            handleTimerEnd();
            return;
        }
    } else {
        const baseMs = pausedRemainingMs != null ? pausedRemainingMs : timeLeftVisual * 1000;
        if (baseMs <= 0) {
            dlog('Попытка запуска таймера с нулевым временем. Вызов handleTimerEnd.');
            handleTimerEnd();
            return;
        }
        targetEndTime = now + baseMs;
    }
    pausedRemainingMs = null;
    clearExpiredState();
    isTimerRunning = true;
    lastTimerTickAt = now;
    timeLeftVisual = secondsLeftFromMs(targetEndTime - now);
    updateTimerDisplay();
    saveTimerState();
    scheduleNextTick(targetEndTime - now);
    dlog('Таймер запущен. targetEndTime:', new Date(targetEndTime).toLocaleTimeString('ru-RU'));
}

/**
 * Pause timer
 */
export function pauseTimer() {
    if (!isTimerRunning) return;
    const remainingMs = Math.max(0, targetEndTime - Date.now());
    isTimerRunning = false;
    clearTick();
    pausedRemainingMs = remainingMs > 0 ? remainingMs : null;
    timeLeftVisual = secondsLeftFromMs(remainingMs);
    targetEndTime = 0;

    updateTimerDisplay();
    saveTimerState();
    dlog('Таймер на паузе. Оставшееся время для отображения:', timeLeftVisual);
}

/** Состояние «таймер запущен» для UI (глобальное меню, палитра). */
export function getTimerRunning() {
    return isTimerRunning;
}

export async function toggleTimer() {
    if (isTimerRunning) {
        pauseTimer();
    } else {
        stopTimerEndEffects();

        if (timeLeftVisual <= 0 && timerCurrentSetDuration > 0) {
            timeLeftVisual = timerCurrentSetDuration;
            pausedRemainingMs = null;
            targetEndTime = 0;
        } else if (timeLeftVisual <= 0 && timerCurrentSetDuration <= 0) {
            timerCurrentSetDuration = timerDefaultDuration;
            timeLeftVisual = timerCurrentSetDuration;
            pausedRemainingMs = null;
            targetEndTime = 0;
        }

        if (originalDocumentTitle && document.title.startsWith('⏰')) {
            document.title = originalDocumentTitle;
        }
        // Основной контур: отсчёт запускается сразу, без ожидания Notification.requestPermission()
        // (иначе при «зависшем» диалоге или медленном WebView таймер не стартует вообще).
        startTimerInternal();
        kickOffTimerNotificationPermissionFromUserGesture();
    }
}

/**
 * Reset timer
 */
export function resetTimer(event) {
    pauseTimer();
    stopTimerEndEffects();
    clearExpiredState();
    pausedRemainingMs = null;

    if (event && (event.ctrlKey || event.metaKey)) {
        timerCurrentSetDuration = 0;
        timeLeftVisual = 0;
        dlog('Таймер сброшен в 00:00 (Ctrl/Cmd+Click).');
    } else {
        timerCurrentSetDuration = timerDefaultDuration;
        timeLeftVisual = timerCurrentSetDuration;
    }

    targetEndTime = 0;

    if (originalDocumentTitle && document.title.startsWith('⏰')) {
        document.title = originalDocumentTitle;
    }
    updateTimerDisplay();
    saveTimerState();
}

/**
 * Adjust timer duration (кнопки +/-: 5 с, Ctrl — 10 с, Ctrl+Shift — 30 с)
 */
export function adjustTimerDuration(secondsToAdd) {
    const minDuration = 10;
    const maxDuration = 3600;

    if (timerExpired) {
        stopTimerEndEffects();
        clearExpiredState();
        if (originalDocumentTitle && document.title.startsWith('⏰')) {
            document.title = originalDocumentTitle;
        }
    }

    if (isTimerRunning) {
        // Сдвигаем сам момент окончания: без округления и без потери долей секунды.
        const newTarget = targetEndTime + secondsToAdd * 1000;
        const maxTarget = Date.now() + maxDuration * 1000;
        targetEndTime = Math.min(newTarget, maxTarget);
        timerCurrentSetDuration = Math.max(
            minDuration,
            Math.min(maxDuration, timerCurrentSetDuration + secondsToAdd),
        );
        if (targetEndTime <= Date.now()) {
            timeLeftVisual = 0;
            handleTimerEnd();
            return;
        }
        timeLeftVisual = secondsLeftFromMs(targetEndTime - Date.now());
        startTimerInternal(); // перепланировать тик под новый targetEndTime
        return;
    }

    const untouched = pausedRemainingMs == null && timeLeftVisual === timerCurrentSetDuration;
    if (untouched || timeLeftVisual <= 0) {
        timerCurrentSetDuration = Math.max(
            minDuration,
            Math.min(maxDuration, timerCurrentSetDuration + secondsToAdd),
        );
        timeLeftVisual = timerCurrentSetDuration;
        pausedRemainingMs = null;
    } else {
        // Пауза посреди отсчёта: правим остаток, а не сбрасываем прогресс на полную длительность.
        const base = pausedRemainingMs != null ? pausedRemainingMs : timeLeftVisual * 1000;
        const next = Math.max(1000, Math.min(maxDuration * 1000, base + secondsToAdd * 1000));
        pausedRemainingMs = next;
        timeLeftVisual = secondsLeftFromMs(next);
        timerCurrentSetDuration = Math.max(
            timerCurrentSetDuration,
            Math.min(maxDuration, timeLeftVisual),
        );
    }
    targetEndTime = 0;
    updateTimerDisplay();
    saveTimerState();
}

/**
 * Switch to edit mode for timer segment
 */
export function switchToEditMode(unitSpanElement, _unitType) {
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
    input.style.border = '1px solid var(--color-primary)';
    input.style.borderRadius = '3px';
    input.style.padding = '0 2px';
    input.style.boxSizing = 'border-box';
    input.style.backgroundColor = 'var(--color-input-bg)';
    input.style.color = 'var(--color-text-primary)';

    const isMinutes = unitSpanElement === State.timerElements.minutesSpan;
    input.maxLength = 2;
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', isMinutes ? 'Минуты' : 'Секунды');
    input.value = String(isNaN(currentValue) ? 0 : currentValue).padStart(2, '0');

    // Переход к соседнему полю: сначала фиксируем текущее, затем открываем следующее.
    const goTo = (targetSpan) => {
        commitTimerEdit(false);
        if (targetSpan) switchToEditMode(targetSpan, targetSpan === State.timerElements.minutesSpan ? 'minutes' : 'seconds');
    };

    input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '');
        // Два введённых символа = поле заполнено: минуты → сразу секунды, секунды → применить.
        if (input.value.length >= 2) {
            if (isMinutes) goTo(State.timerElements.secondsSpan);
            else commitTimerEdit(false);
        }
    });

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            commitTimerEdit(false);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelTimerEdit();
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const step = (event.shiftKey ? 10 : 1) * (event.key === 'ArrowUp' ? 1 : -1);
            const max = isMinutes ? 60 : 59;
            const cur = parseInt(input.value, 10) || 0;
            input.value = String(Math.min(max, Math.max(0, cur + step))).padStart(2, '0');
            input.select();
        } else if (event.key === 'Tab') {
            // Tab / Shift+Tab ходят между минутами и секундами, не выпадая из таймера.
            if (isMinutes && !event.shiftKey) {
                event.preventDefault();
                goTo(State.timerElements.secondsSpan);
            } else if (!isMinutes && event.shiftKey) {
                event.preventDefault();
                goTo(State.timerElements.minutesSpan);
            }
        } else if (isMinutes && (event.key === ':' || event.key === '.' || event.key === ',')) {
            event.preventDefault();
            goTo(State.timerElements.secondsSpan);
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
    // Двоеточие остаётся на месте: при вводе видно «25 : 50», а не два «слипшихся» числа.
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

    // Секунды > 59 переносятся в минуты (90 → 01:30), общий предел — 60:00.
    timeLeftVisual = Math.min(3600, currentMinutes * 60 + currentSeconds);
    timerCurrentSetDuration = timeLeftVisual;
    pausedRemainingMs = null;
    targetEndTime = 0;
    if (timerExpired) {
        stopTimerEndEffects();
        if (originalDocumentTitle && document.title.startsWith('⏰')) {
            document.title = originalDocumentTitle;
        }
    }
    clearExpiredState();

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
    } else if (timeLeftVisual === 0 && wasTimerRunning) {
        handleTimerEnd();
    } else {
        updateTimerDisplay();
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
 * Ensure timer DOM refs are valid and bound to the live document.
 * If elements were detached (e.g. re-render), re-resolve by id so updates hit visible UI.
 */
function ensureTimerDOMRefs() {
    const inDoc = (el) => el && typeof document.contains === 'function' && document.contains(el);
    if (timerDisplayElement && !inDoc(timerDisplayElement)) {
        timerDisplayElement = null;
        State.timerElements.minutesSpan = null;
        State.timerElements.secondsSpan = null;
        State.timerElements.colonSpan = null;
    }
    if (!timerDisplayElement) {
        timerDisplayElement = document.getElementById('timerDisplay');
    }
    if (
        timerDisplayElement &&
        (!State.timerElements.minutesSpan || !inDoc(State.timerElements.minutesSpan))
    ) {
        State.timerElements.minutesSpan = document.getElementById('timerMinutesDisplay');
        State.timerElements.secondsSpan = document.getElementById('timerSecondsDisplay');
        State.timerElements.colonSpan =
            timerDisplayElement && timerDisplayElement.querySelector('.timer-colon');
    }
    if (timerToggleButton && !inDoc(timerToggleButton)) timerToggleButton = null;
    if (!timerToggleButton) {
        timerToggleButton = document.getElementById('timerToggleButton');
    }
    if (timerToggleButton) {
        const icon = timerToggleButton.querySelector('i');
        if (icon) timerToggleIcon = icon;
    }
}

/**
 * Update timer display
 */
export function updateTimerDisplay() {
    ensureTimerDOMRefs();

    if (
        !timerDisplayElement ||
        !timerToggleIcon ||
        !State.timerElements.minutesSpan ||
        !State.timerElements.secondsSpan
    ) {
        if (
            timerDisplayElement &&
            (!State.timerElements.minutesSpan || !State.timerElements.secondsSpan)
        ) {
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
        applyTimerStageClasses();
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

    applyTimerStageClasses();
}

/** Порог стадии «скоро конец»: 20% длительности, но не меньше 15 и не больше 60 секунд. */
export function getTimerWarnThreshold(duration) {
    const d = Number(duration) || 0;
    return Math.min(60, Math.max(15, Math.round(d * 0.2)));
}

/**
 * Стадии: normal → warn (последние ~20%/≤60 с) → urgent (≤10 с) → expired (00:00).
 * Только классы на #timerDisplay: вся анимация в CSS (transform/opacity), JS не рисует кадры.
 */
function applyTimerStageClasses() {
    if (!timerDisplayElement) return;
    const cl = timerDisplayElement.classList;
    const running = isTimerRunning;
    const expired = timerExpired && !running && timeLeftVisual <= 0;
    const urgent = running && timeLeftVisual <= 10;
    const warnLate = running && !urgent && timeLeftVisual <= Math.ceil(getTimerWarnThreshold(timerCurrentSetDuration) / 2);
    const warn = running && !urgent && timeLeftVisual <= getTimerWarnThreshold(timerCurrentSetDuration);
    cl.toggle('timer-zero', expired);
    cl.toggle('timer-urgent', urgent);
    cl.toggle('timer-warn', warn);
    cl.toggle('timer-warn-late', warnLate);
    cl.toggle('timer-acked', expired && timerExpiredAcked);
    const stage = expired ? 'expired' : urgent ? 'urgent' : warn ? 'warn' : 'normal';
    if (timerDisplayElement.dataset.stage !== stage) timerDisplayElement.dataset.stage = stage;
    const wrap = timerDisplayElement.parentElement;
    if (wrap && wrap.id === 'appTimer' && wrap.dataset.stage !== stage) wrap.dataset.stage = stage;
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

    if ('Notification' in window) {
        const currentPermission = Notification.permission;
        if (currentPermission === 'granted') {
            notificationPermissionState = 'granted';
        } else if (currentPermission === 'denied') {
            // Состояние запоминаем молча: предупреждение при каждом открытии приложения — шум.
            // Пользователь увидит подсказку при запуске таймера (kickOffTimerNotificationPermissionFromUserGesture).
            notificationPermissionState = 'denied';
        } else {
            notificationPermissionState = 'default';
        }
    } else {
        notificationPermissionState = 'denied';
    }

    loadTimerState();

    if (isTimerRunning) {
        // Таймер шёл до перезагрузки: продолжаем строго от сохранённого targetEndTime.
        if (targetEndTime > Date.now()) {
            startTimerInternal();
            dlog('Таймер был активен, перезапущен после загрузки страницы.');
        } else {
            isTimerRunning = false;
            handleTimerEnd();
        }
    } else if (!timerExpired) {
        if (timeLeftVisual <= 0 && timerCurrentSetDuration > 0) {
            timeLeftVisual = timerCurrentSetDuration;
        } else if (timeLeftVisual <= 0 && timerCurrentSetDuration <= 0) {
            timeLeftVisual = timerDefaultDuration;
            timerCurrentSetDuration = timerDefaultDuration;
        }
    }

    updateTimerDisplay();

    timerToggleButton.addEventListener('click', () => {
        if (State.activeEditingUnitElement) {
            commitTimerEdit(true);
        } else {
            toggleTimer();
        }
    });
    // Клик по цифрам или кнопкам таймера «гасит» пульсацию истёкшего таймера (захват: до режима правки).
    timerDisplayElement.addEventListener('pointerdown', () => acknowledgeTimerExpired(), true);
    timerResetButton.addEventListener('click', (event) => {
        if (State.activeEditingUnitElement) {
            cancelTimerEdit();
        }
        resetTimer(event);
    });

    const modKey = (e) => e.ctrlKey || e.metaKey;
    timerIncreaseButton.addEventListener('click', (event) => {
        if (State.activeEditingUnitElement) {
            cancelTimerEdit();
        }
        const amount = modKey(event) && event.shiftKey ? 30 : modKey(event) ? 10 : 5;
        adjustTimerDuration(amount);
    });
    timerDecreaseButton.addEventListener('click', (event) => {
        if (State.activeEditingUnitElement) {
            cancelTimerEdit();
        }
        const amount = modKey(event) && event.shiftKey ? -30 : modKey(event) ? -10 : -5;
        adjustTimerDuration(amount);
    });

    State.timerElements.minutesSpan.addEventListener('click', () =>
        switchToEditMode(State.timerElements.minutesSpan, 'minutes'),
    );
    State.timerElements.secondsSpan.addEventListener('click', () =>
        switchToEditMode(State.timerElements.secondsSpan, 'seconds'),
    );

    // Управление сегментами без мыши: Enter/цифра — ввод, ↑/↓ — ±1 (минута или секунда), колесо — то же.
    [
        [State.timerElements.minutesSpan, 'minutes', 60],
        [State.timerElements.secondsSpan, 'seconds', 1],
    ].forEach(([span, unit, secs]) => {
        span.addEventListener('keydown', (event) => {
            if (State.activeEditingUnitElement) return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                switchToEditMode(span, unit);
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault();
                adjustTimerDuration((event.key === 'ArrowUp' ? 1 : -1) * secs * (event.shiftKey ? 10 : 1));
            } else if (/^\d$/.test(event.key)) {
                event.preventDefault();
                switchToEditMode(span, unit);
                const inp = timerDisplayElement.querySelector('input.timer-input-active');
                if (inp) inp.value = event.key;
            }
        });
        span.addEventListener(
            'wheel',
            (event) => {
                if (State.activeEditingUnitElement || !event.deltaY) return;
                event.preventDefault();
                adjustTimerDuration((event.deltaY < 0 ? 1 : -1) * secs);
            },
            { passive: false },
        );
        span.title = unit === 'minutes'
            ? 'Минуты: клик или цифра — ввод, ↑/↓ или колесо — ±1 мин'
            : 'Секунды: клик или цифра — ввод, ↑/↓ или колесо — ±1 с (больше 59 переносится в минуты)';
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && State.activeEditingUnitElement) {
            const inputElement = timerDisplayElement.querySelector('input.timer-input-active');
            if (inputElement && document.activeElement === inputElement) {
                cancelTimerEdit();
            }
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            stopTimerEndEffects();
        }
        if (document.visibilityState === 'visible' && isTimerRunning) {
            // Фоновые вкладки троттлят таймеры браузера: пересчитываем остаток от targetEndTime
            // (не от отображаемого значения) и перепланируем тик.
            startTimerInternal();
        }
    });

    if (timerWatchdogId != null) {
        clearInterval(timerWatchdogId);
        timerWatchdogId = null;
    }
    timerWatchdogId = setInterval(() => {
        if (
            document.hidden ||
            !isTimerRunning ||
            Date.now() - lastTimerTickAt <= TIMER_STALL_THRESHOLD_MS
        ) {
            return;
        }
        console.warn(
            'Таймер: интервал не срабатывал >2.5с при видимой вкладке. Перезапуск интервала.',
        );
        startTimerInternal();
    }, TIMER_WATCHDOG_INTERVAL_MS);

    dlog('Система таймера инициализирована (v_editable_compact_css_driven).');
}

// Export for window access (backward compatibility)
if (typeof window !== 'undefined') {
    window.initTimerSystem = initTimerSystem;
    window.toggleTimer = toggleTimer;
    window.resetTimer = resetTimer;
    window.adjustTimerDuration = adjustTimerDuration;
}
