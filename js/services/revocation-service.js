'use strict';

import { HttpClient } from './http-client.js';

/**
 * Сервис проверки отзыва сертификатов.
 * Инкапсулирует работу с `/api/revocation/check` и форматирует ответ для UI.
 */
export const RevocationService = {
    /**
     * Проверяет статус отзыва по серийному номеру и URL списка отзыва.
     * @param {string} serial - серийный номер сертификата
     * @param {string} listUrl - URL списка отзыва (CRL/JSON/текст)
     * @returns {Promise<{revoked: boolean, serial: string|null, error: string|null}>}
     */
    async checkRevocation(serial, listUrl) {
        if (!serial || !listUrl) {
            return {
                revoked: false,
                serial: serial || null,
                error: 'Не хватает данных для проверки: серийный номер или URL списка отзыва.',
            };
        }

        try {
            const { data } = await HttpClient.post('/api/revocation/check', {
                serial,
                listUrl,
            });

            if (!data || typeof data !== 'object') {
                return {
                    revoked: false,
                    serial: serial || null,
                    error: 'Некорректный ответ сервера при проверке отзыва.',
                };
            }

            const normalizedSerial = data.serial || serial;

            if (data.error) {
                return {
                    revoked: Boolean(data.revoked) === true,
                    serial: normalizedSerial,
                    errorCode: data.errorCode ? String(data.errorCode) : null,
                    error: String(data.error),
                };
            }

            return {
                revoked: Boolean(data.revoked) === true,
                serial: normalizedSerial,
                errorCode: null,
                error: null,
            };
        } catch (err) {
            const technical =
                err?.technicalMessage || err?.backendError || err?.message || String(err);
            return {
                revoked: false,
                serial: serial || null,
                errorCode: 'http_request_failed',
                error: technical,
            };
        }
    },

    /**
     * Проверяет отзыв по нескольким URL списков отзыва за один запрос.
     * @param {string} serial - серийный номер сертификата
     * @param {string[]} listUrls - список URL CRL
     * @returns {Promise<{serial: string|null, revoked: boolean, results: Array<{url: string, revoked: boolean, error: string|null}>, error: string|null}>}
     */
    async checkRevocationBatch(serial, listUrls) {
        if (!serial || !Array.isArray(listUrls) || listUrls.length === 0) {
            return {
                serial: serial || null,
                revoked: false,
                results: [],
                error: 'Не хватает данных для пакетной проверки отзыва.',
            };
        }

        try {
            const { data } = await HttpClient.post('/api/revocation/check', {
                serial,
                listUrls,
            });

            if (!data || typeof data !== 'object') {
                return {
                    serial: serial || null,
                    revoked: false,
                    results: [],
                    error: 'Некорректный ответ сервера при пакетной проверке отзыва.',
                };
            }

            return {
                serial: data.serial || serial,
                revoked: Boolean(data.revoked) === true,
                results: Array.isArray(data.results) ? data.results : [],
                errorCode: data.errorCode ? String(data.errorCode) : null,
                error: data.error ? String(data.error) : null,
            };
        } catch (err) {
            const technical =
                err?.technicalMessage || err?.backendError || err?.message || String(err);
            return {
                serial: serial || null,
                revoked: false,
                results: [],
                errorCode: 'http_request_failed',
                error: technical,
            };
        }
    },

    /**
     * Гибридная проверка: часть CRL скачана клиентом (base64), остальные — через сервер.
     * @param {string} serial - серийный номер сертификата
     * @param {Array<{url: string, data: string|null}>} crlEntries - массив записей (data — base64 CRL или null)
     * @returns {Promise<{serial: string|null, revoked: boolean, results: Array, error: string|null}>}
     */
    async checkRevocationHybrid(serial, crlEntries, options = {}) {
        if (!serial || !Array.isArray(crlEntries) || crlEntries.length === 0) {
            return {
                serial: serial || null,
                revoked: false,
                results: [],
                error: 'Не хватает данных для гибридной проверки отзыва.',
            };
        }

        try {
            const { data } = await HttpClient.post(
                '/api/revocation/check',
                {
                    serial,
                    crlEntries,
                    networkPolicy: options.networkPolicy || null,
                    helperBaseUrl: options.helperBaseUrl || null,
                },
                { timeoutMs: 65000, suppressNotifications: false },
            );

            if (!data || typeof data !== 'object') {
                return {
                    serial: serial || null,
                    revoked: false,
                    results: [],
                    error: 'Некорректный ответ сервера при гибридной проверке отзыва.',
                };
            }

            return {
                serial: data.serial || serial,
                revoked: Boolean(data.revoked) === true,
                results: Array.isArray(data.results) ? data.results : [],
                errorCode: data.errorCode ? String(data.errorCode) : null,
                error: data.error ? String(data.error) : null,
            };
        } catch (err) {
            const technical =
                err?.technicalMessage || err?.backendError || err?.message || String(err);
            return {
                serial: serial || null,
                revoked: false,
                results: [],
                errorCode: 'http_request_failed',
                error: technical,
            };
        }
    },
};
