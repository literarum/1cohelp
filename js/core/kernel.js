'use strict';

const coreServices = Object.create(null);

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function registerCoreServices(services = {}) {
    if (!isPlainObject(services)) return;
    Object.entries(services).forEach(([key, value]) => {
        if (!key) return;
        if (typeof value === 'undefined') return;
        coreServices[key] = value;
    });
}

export function getCoreService(name) {
    if (!name) return null;
    return Object.prototype.hasOwnProperty.call(coreServices, name) ? coreServices[name] : null;
}

export function getCoreServicesSnapshot() {
    return { ...coreServices };
}

export function resetCoreServices() {
    Object.keys(coreServices).forEach((key) => {
        delete coreServices[key];
    });
}

export function notify(message, type = 'info', options = {}) {
    const notificationService = getCoreService('NotificationService');
    const showNotification = getCoreService('showNotification');
    const normalizedOptions = typeof options === 'number' ? { duration: options } : options || {};
    const duration = typeof normalizedOptions.duration === 'number' ? normalizedOptions.duration : 5000;

    if (notificationService && typeof notificationService.add === 'function') {
        notificationService.add(message, type, normalizedOptions);
        return true;
    }

    if (typeof showNotification === 'function') {
        showNotification(message, type, duration);
        return true;
    }

    console.warn('[Kernel] Notification services are unavailable.', { message, type, options });
    return false;
}
