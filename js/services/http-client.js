'use strict';

import { REVOCATION_API_BASE_URL } from '../config.js';
import { NotificationService } from './notification.js';

const DEFAULT_TIMEOUT_MS = 15000;

function buildBaseUrl() {
    const explicitBase =
        typeof REVOCATION_API_BASE_URL === 'string' && REVOCATION_API_BASE_URL.trim();
    if (explicitBase) {
        return explicitBase.trim().replace(/\/$/, '');
    }
    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
    }
    return '';
}

const API_BASE_URL = buildBaseUrl();

async function withTimeout(promise, timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (!timeoutMs || timeoutMs <= 0) return promise;
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(
                () => reject(new Error('Превышено время ожидания ответа сервера')),
                timeoutMs,
            ),
        ),
    ]);
}

function normalizeError(error, response) {
    if (response) {
        return {
            userMessage: 'Сервер вернул ошибку при выполнении запроса.',
            technicalMessage: `${response.status} ${response.statusText}`,
            status: response.status,
        };
    }
    return {
        userMessage: 'Не удалось выполнить запрос. Проверьте соединение с интернетом.',
        technicalMessage: error?.message || String(error || 'Unknown error'),
        status: null,
    };
}

export const HttpClient = {
    baseUrl: API_BASE_URL,

    async request(
        path,
        { method = 'GET', headers = {}, body, timeoutMs, suppressNotifications } = {},
    ) {
        const url =
            this.baseUrl && !/^https?:\/\//i.test(path)
                ? `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
                : path;

        const finalHeaders = {
            ...headers,
        };

        let payload = body;
        if (body && typeof body === 'object' && !(body instanceof FormData)) {
            finalHeaders['Content-Type'] = finalHeaders['Content-Type'] || 'application/json';
            payload = JSON.stringify(body);
        }

        let response;
        try {
            response = await withTimeout(
                fetch(url, {
                    method,
                    headers: finalHeaders,
                    body: payload,
                }),
                timeoutMs ?? DEFAULT_TIMEOUT_MS,
            );
        } catch (error) {
            const normalized = normalizeError(error);
            if (!suppressNotifications) {
                NotificationService.add(normalized.userMessage, 'error', { important: true });
            }
            throw normalized;
        }

        let data = null;
        const contentType = (response.headers.get('Content-Type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
            data = await response.json().catch(() => null);
        } else if (contentType.startsWith('text/')) {
            data = await response.text().catch(() => null);
        } else {
            data = await response.arrayBuffer().catch(() => null);
        }

        if (!response.ok) {
            const backendError =
                data && typeof data === 'object' && data.error
                    ? String(data.error)
                    : `${response.status} ${response.statusText}`;
            const normalized = normalizeError(new Error(backendError), response);
            if (!suppressNotifications) {
                NotificationService.add(normalized.userMessage, 'error', { important: true });
            }
            throw { ...normalized, backendError, data };
        }

        return { data, response };
    },

    get(path, options = {}) {
        return this.request(path, { ...options, method: 'GET' });
    },

    post(path, body, options = {}) {
        return this.request(path, { ...options, method: 'POST', body });
    },
};
