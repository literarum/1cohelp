import { RevocationService } from '../services/revocation-service.js';
import {
    FNS_CRL_URLS,
    REVOCATION_DESKTOP_APP_DOWNLOAD_URL,
    REVOCATION_LOCAL_HELPER_BASE_URL,
    REVOCATION_LOCAL_HELPER_ENABLED,
    REVOCATION_NETWORK_POLICY,
    REVOCATION_PROXY_ENABLED,
    REVOCATION_PROXY_FAILURE_RATE_THRESHOLD,
    REVOCATION_PROXY_MIN_ATTEMPTS,
    REVOCATION_PROXY_URL,
    REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER,
} from '../config/revocation-sources.js';
import {
    detectDownloadPlatform,
    getDownloadUrl,
    getHelperRunCommand,
    getHelperUnloadCommand,
    probeHelperAvailability,
    triggerDownload,
} from './revocation-helper-probe.js';
import { ingestRuntimeHubIssue } from './runtime-issue-hub.js';

const FNS_DEBUG_TAG = '[FNS Revocation]';

/** Fallback URL for install scripts when origin (e.g. GitHub Pages) returns 404. */
const RAW_INSTALL_SCRIPT_BASE =
    'https://raw.githubusercontent.com/literarum/Copilot-1CO-2.0/main/site';

const CERT_BASE64_MIN_LENGTH = 100;
const CLIENT_POLICY_VALUES = new Set([
    'backend_first',
    'browser_prefer',
    'browser_only',
    'server_only',
]);

function createError(message, code, details = null) {
    const error = new Error(message);
    error.code = code;
    if (details) {
        error.details = details;
    }
    return error;
}

function bytesPreviewHex(bytes, limit = 16) {
    return bytesToHex(bytes.slice(0, limit));
}

function logDebug(event) {
    try {
        const payload = {
            timestamp: new Date().toISOString(),
            ...event,
        };
        console.info(FNS_DEBUG_TAG, payload);
    } catch {
        // No-op: diagnostic logging should never break flow.
    }
}

function resolveNetworkPolicy() {
    return CLIENT_POLICY_VALUES.has(REVOCATION_NETWORK_POLICY)
        ? REVOCATION_NETWORK_POLICY
        : 'browser_prefer';
}

function shouldAttemptBrowserFetch(url) {
    return resolveNetworkPolicy() !== 'backend_first' && Boolean(url);
}

const LOCAL_HELPER_FETCH_TIMEOUT_MS = 30000;
const LOCAL_HELPER_RETRY_DELAY_MS = 800;

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 8192;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

/**
 * Fetches each CRL URL via local helper from the browser; returns crlEntries with data (base64) or null.
 * Used when REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER is true so the user's machine does the FNS request.
 */
async function buildCrlEntriesViaLocalHelper(resolvedCrlUrls, helperBaseUrl) {
    const base = String(helperBaseUrl || '')
        .trim()
        .replace(/\/$/, '');
    if (!base)
        return resolvedCrlUrls.map((url) => ({
            url,
            data: null,
            clientErrorCode: 'local_helper_not_configured',
            viaLocalHelper: false,
        }));

    const entries = await Promise.all(
        resolvedCrlUrls.map(async (url) => {
            const attempt = async () => {
                const controller = new AbortController();
                const timeoutId = setTimeout(
                    () => controller.abort(),
                    LOCAL_HELPER_FETCH_TIMEOUT_MS,
                );
                try {
                    const res = await fetch(`${base}/helper?url=${encodeURIComponent(url)}`, {
                        method: 'GET',
                        signal: controller.signal,
                    });
                    clearTimeout(timeoutId);
                    if (!res.ok) {
                        return {
                            url,
                            data: null,
                            clientErrorCode: 'local_helper_failed',
                            clientErrorMessage: `HTTP ${res.status}`,
                            viaLocalHelper: false,
                        };
                    }
                    const buf = await res.arrayBuffer();
                    const data = arrayBufferToBase64(buf);
                    return { url, data, viaLocalHelper: true };
                } catch (e) {
                    clearTimeout(timeoutId);
                    const notRunning =
                        e?.name === 'AbortError' ||
                        (typeof e?.message === 'string' &&
                            (e.message.includes('fetch') || e.message.includes('Failed')));
                    return {
                        url,
                        data: null,
                        clientErrorCode: notRunning
                            ? 'local_helper_not_running'
                            : 'local_helper_failed',
                        clientErrorMessage: e?.message || String(e),
                        viaLocalHelper: false,
                    };
                }
            };
            let entry = await attempt();
            if (!entry.data && entry.clientErrorCode === 'local_helper_failed') {
                await new Promise((r) => setTimeout(r, LOCAL_HELPER_RETRY_DELAY_MS));
                const retryEntry = await attempt();
                if (retryEntry.data) entry = retryEntry;
            }
            return entry;
        }),
    );
    return entries;
}

function buildBackendFirstEntries(urls) {
    return urls.map((url) => ({
        url,
        data: null,
        clientErrorCode: 'backend_first_mode',
        clientErrorMessage: 'browser direct fetch disabled in backend-first mode',
    }));
}

const PUBLIC_CRL_HOSTS = new Set(['pki.tax.gov.ru', 'uc.nalog.ru', 'cdp.tax.gov.ru']);

function isPrivateLikeCrlHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    if (!host) return true;
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    if (/^c\d{4}-/i.test(host)) return true;
    if (
        /^10\.|^127\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
        host === '::1'
    ) {
        return true;
    }
    return false;
}

function buildBackendReachableCrlUrls(urls) {
    const normalized = [];
    for (const rawUrl of Array.isArray(urls) ? urls : []) {
        try {
            const parsed = new URL(String(rawUrl || '').trim());
            if (!['http:', 'https:'].includes(parsed.protocol)) continue;
            const host = parsed.hostname.toLowerCase();
            if (PUBLIC_CRL_HOSTS.has(host)) {
                normalized.push(`${parsed.protocol}//${host}${parsed.pathname}${parsed.search}`);
                continue;
            }
            if (isPrivateLikeCrlHost(host)) {
                normalized.push(
                    `https://pki.tax.gov.ru${parsed.pathname}${parsed.search}`,
                    `https://uc.nalog.ru${parsed.pathname}${parsed.search}`,
                );
            }
        } catch {
            // Ignore malformed URL in certificate extensions.
        }
    }
    return Array.from(new Set(normalized));
}

function resolveCrlUrls(certInfoData = null) {
    const certCdpUrls = buildBackendReachableCrlUrls(certInfoData?.crlDistributionPoints || []);
    const baseUrls = certCdpUrls.length > 0 ? certCdpUrls : [...FNS_CRL_URLS];
    if (!REVOCATION_PROXY_ENABLED || !REVOCATION_PROXY_URL) {
        return baseUrls;
    }
    const proxyBase = REVOCATION_PROXY_URL.replace(/\/$/, '');
    return baseUrls.map((url) => `${proxyBase}?url=${encodeURIComponent(url)}`);
}

function isCertificateExpired(certInfoData, nowMs = Date.now()) {
    const expiryMs = Number(certInfoData?.notAfterEpochMs);
    if (!Number.isFinite(expiryMs)) return false;
    return nowMs > expiryMs;
}

function resolveFinalRevocationState(hasCrlRevocation, certExpired) {
    if (hasCrlRevocation) return { revoked: true, reason: 'crl' };
    if (certExpired) return { revoked: true, reason: 'expired' };
    return { revoked: false, reason: null };
}

/**
 * Отделяет подтверждённый «не отозван» от случая, когда CRL/API не дали достоверного ответа.
 * @param {{ revoked: boolean, reason?: string|null }} finalRevocationState
 * @param {number} successfulChecks
 * @param {number} failedChecks
 * @param {string|null|undefined} batchLevelError
 */
export function deriveFnsCertRevocationUiModel(
    finalRevocationState,
    successfulChecks,
    failedChecks,
    batchLevelError,
) {
    const hasPartialResult = failedChecks > 0 || Boolean(batchLevelError);
    const statusUnknown =
        !finalRevocationState.revoked && (successfulChecks === 0 || hasPartialResult);
    return { hasPartialResult, statusUnknown };
}

/**
 * Дублирующий контур: буфер runtime + зеркало в «Ошибки» машинного отделения (ingest → cockpit).
 */
function recordFnsRevocationHybridFaultToRuntimeHub(
    batchResult,
    results,
    successfulChecks,
    failedChecks,
    finalRevoked,
) {
    if (finalRevoked) return;
    const total = successfulChecks + failedChecks;
    if (total === 0 && !batchResult?.error) return;
    const noSuccess = successfulChecks === 0;
    const hasFault = noSuccess || failedChecks > 0 || Boolean(batchResult?.error);
    if (!hasFault) return;

    const samples = (Array.isArray(results) ? results : [])
        .filter((r) => r.error)
        .slice(0, 5)
        .map((r) => ({
            url: (r.url || '').slice(0, 140),
            code: r.errorCode || null,
            err: (r.error || '').slice(0, 420),
        }));
    const msg =
        noSuccess && failedChecks > 0
            ? `Проверка отзыва ФНС: все ${failedChecks} попыток CRL завершились ошибкой; статус по отзыву неизвестен.`
            : failedChecks > 0
              ? `Проверка отзыва ФНС: ${failedChecks} из ${total} CRL с ошибками; полный вывод о неотзыве недостоверен.`
              : batchResult?.error
                ? `Проверка отзыва ФНС: ошибка пакета — ${batchResult.error}`
                : 'Проверка отзыва ФНС: нет успешных ответов по CRL.';
    ingestRuntimeHubIssue(
        'FNS Revocation',
        msg,
        {
            samples,
            batchError: batchResult?.error || null,
            batchErrorCode: batchResult?.errorCode || null,
            successfulChecks,
            failedChecks,
        },
        { mirror: true },
    );
    try {
        if (typeof console !== 'undefined' && typeof console.error === 'function') {
            console.error(FNS_DEBUG_TAG, msg, {
                samples,
                successfulChecks,
                failedChecks,
                batchError: batchResult?.error || null,
            });
        }
    } catch {
        /* дублирующий контур не должен ломать проверку отзыва */
    }
}

function shouldRecommendProxy(totalChecks, failedChecks) {
    if (REVOCATION_PROXY_ENABLED) return false;
    if (totalChecks < REVOCATION_PROXY_MIN_ATTEMPTS) return false;
    if (totalChecks <= 0) return false;
    const failureRate = failedChecks / totalChecks;
    return failureRate >= REVOCATION_PROXY_FAILURE_RATE_THRESHOLD;
}

const STATUS_TONE_CLASSES = {
    neutral:
        'border-gray-300 dark:border-gray-500 bg-gray-50 dark:bg-gray-600 text-gray-700 dark:text-gray-200',
    success:
        'border-green-200 dark:border-green-600 bg-green-50 dark:bg-green-900/40 text-green-700 dark:text-green-300',
    warn: 'border-yellow-300 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300',
    danger: 'border-red-200 dark:border-red-600 bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300',
};

const OID_LABELS = {
    '2.5.4.3': 'CN',
    '2.5.4.6': 'C',
    '2.5.4.7': 'L',
    '2.5.4.8': 'ST',
    '2.5.4.9': 'STREET',
    '2.5.4.10': 'O',
    '2.5.4.11': 'OU',
    '1.2.840.113549.1.9.1': 'E-mail',
    '1.2.643.100.1': 'ОГРН',
    '1.2.643.100.4': 'ИНН',
};

function bytesToHex(bytes) {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
}

function normalizeHex(hex) {
    const normalized = hex.replace(/^0+/, '');
    return normalized.length ? normalized : '0';
}

function decodePemToDer(text) {
    const base64 = text
        .replace(/-----BEGIN[^-]+-----/g, '')
        .replace(/-----END[^-]+-----/g, '')
        .replace(/\s+/g, '');
    let raw;
    try {
        raw = atob(base64);
    } catch (error) {
        throw createError('Не удалось декодировать PEM сертификата.', 'cert_pem_decode_failed', {
            reason: error?.message || String(error),
        });
    }
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
        bytes[i] = raw.charCodeAt(i);
    }
    return bytes;
}

function isLikelyBase64Text(text) {
    const trimmed = text.trim();
    if (trimmed.length < CERT_BASE64_MIN_LENGTH) return false;
    if (!/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) return false;
    const sanitized = trimmed.replace(/\s+/g, '');
    return sanitized.length % 4 === 0;
}

function decodeRawBase64ToBytes(text) {
    const clean = text.trim().replace(/\s+/g, '');
    try {
        const raw = atob(clean);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
            bytes[i] = raw.charCodeAt(i);
        }
        return bytes;
    } catch (error) {
        throw createError(
            'Не удалось декодировать base64 сертификат.',
            'cert_base64_decode_failed',
            {
                reason: error?.message || String(error),
            },
        );
    }
}

function detectCertificateFormat(bytes) {
    const text = new TextDecoder('utf-8').decode(bytes);
    if (text.includes('BEGIN CERTIFICATE')) {
        return { format: 'pem', text };
    }
    if (isLikelyBase64Text(text)) {
        return { format: 'base64', text };
    }
    return { format: 'der', text };
}

function readDerLength(bytes, offset) {
    const first = bytes[offset];
    if (first < 0x80) {
        return { length: first, byteLength: 1 };
    }
    const numBytes = first & 0x7f;
    let length = 0;
    for (let i = 0; i < numBytes; i++) {
        length = (length << 8) | bytes[offset + 1 + i];
    }
    return { length, byteLength: 1 + numBytes };
}

function parseDerNode(bytes, offset = 0) {
    if (offset >= bytes.length) {
        throw new Error('ASN.1: выход за пределы буфера');
    }
    const tag = bytes[offset];
    const lengthInfo = readDerLength(bytes, offset + 1);
    const headerLength = 1 + lengthInfo.byteLength;
    const valueStart = offset + headerLength;
    const valueEnd = valueStart + lengthInfo.length;

    if (valueEnd > bytes.length) {
        throw new Error('ASN.1: некорректная длина');
    }

    const node = {
        tag,
        length: lengthInfo.length,
        start: offset,
        end: valueEnd,
        valueStart,
        valueEnd,
        children: [],
    };

    const isConstructed = (tag & 0x20) === 0x20;
    if (isConstructed) {
        let cursor = valueStart;
        while (cursor < valueEnd) {
            const child = parseDerNode(bytes, cursor);
            node.children.push(child);
            cursor = child.end;
        }
    }

    return node;
}

function decodeOid(bytes) {
    if (!bytes.length) return '';
    const first = bytes[0];
    const firstPart = Math.floor(first / 40);
    const secondPart = first % 40;
    let oid = `${firstPart}.${secondPart}`;
    let value = 0;
    for (let i = 1; i < bytes.length; i++) {
        value = (value << 7) | (bytes[i] & 0x7f);
        if ((bytes[i] & 0x80) === 0) {
            oid += `.${value}`;
            value = 0;
        }
    }
    return oid;
}

function decodeDerString(node, bytes) {
    const valueBytes = bytes.slice(node.valueStart, node.valueEnd);
    switch (node.tag) {
        case 0x0c:
        case 0x13:
        case 0x16:
        case 0x1a:
            return new TextDecoder('utf-8').decode(valueBytes);
        case 0x1e: {
            const view = new DataView(valueBytes.buffer, valueBytes.byteOffset, valueBytes.length);
            let result = '';
            for (let i = 0; i < view.byteLength; i += 2) {
                result += String.fromCharCode(view.getUint16(i));
            }
            return result;
        }
        default:
            return bytesToHex(valueBytes);
    }
}

function decodeTimeDetails(node, bytes) {
    const text = new TextDecoder('ascii').decode(bytes.slice(node.valueStart, node.valueEnd));
    const trimmed = text.replace(/Z$/, '');
    if (node.tag === 0x17 && trimmed.length >= 12) {
        const year = parseInt(trimmed.slice(0, 2), 10);
        const fullYear = year < 50 ? 2000 + year : 1900 + year;
        const month = parseInt(trimmed.slice(2, 4), 10) - 1;
        const day = parseInt(trimmed.slice(4, 6), 10);
        const hour = parseInt(trimmed.slice(6, 8), 10);
        const minute = parseInt(trimmed.slice(8, 10), 10);
        const second = parseInt(trimmed.slice(10, 12), 10);
        const date = new Date(Date.UTC(fullYear, month, day, hour, minute, second));
        return { display: date.toLocaleString(), epochMs: date.getTime(), raw: text };
    }
    if (node.tag === 0x18 && trimmed.length >= 14) {
        const fullYear = parseInt(trimmed.slice(0, 4), 10);
        const month = parseInt(trimmed.slice(4, 6), 10) - 1;
        const day = parseInt(trimmed.slice(6, 8), 10);
        const hour = parseInt(trimmed.slice(8, 10), 10);
        const minute = parseInt(trimmed.slice(10, 12), 10);
        const second = parseInt(trimmed.slice(12, 14), 10);
        const date = new Date(Date.UTC(fullYear, month, day, hour, minute, second));
        return { display: date.toLocaleString(), epochMs: date.getTime(), raw: text };
    }
    return { display: text, epochMs: NaN, raw: text };
}

function _decodeTime(node, bytes) {
    return decodeTimeDetails(node, bytes).display;
}

function parseName(node, bytes) {
    if (!node || node.tag !== 0x30) return [];
    const attrs = [];
    node.children.forEach((setNode) => {
        if (setNode.tag !== 0x31) return;
        setNode.children.forEach((seqNode) => {
            if (seqNode.tag !== 0x30 || seqNode.children.length < 2) return;
            const oidNode = seqNode.children[0];
            const valueNode = seqNode.children[1];
            const oid = decodeOid(bytes.slice(oidNode.valueStart, oidNode.valueEnd));
            const label = OID_LABELS[oid] || oid;
            const value = decodeDerString(valueNode, bytes);
            attrs.push({ oid, label, value });
        });
    });
    return attrs;
}

function formatDnAttributes(attrs) {
    if (!Array.isArray(attrs) || attrs.length === 0) return '—';
    return attrs.map((item) => `${item.label}: ${item.value}`).join(', ');
}

/**
 * Показывает тост после копирования команды установки. Платформо-зависимый текст.
 * @param {HTMLElement} container — контейнер, после которого вставляется тост (или в него)
 * @param {'macos'|'linux'|'windows'} platform
 */
function showCopyToast(container, platform) {
    const pasteHint = platform === 'windows' ? 'Ctrl+V' : 'Cmd+V или Ctrl+V';
    const openHint =
        platform === 'macos'
            ? 'Откройте Терминал (Cmd+Пробел → Терминал)'
            : platform === 'windows'
              ? 'Откройте PowerShell (Win+X → Терминал)'
              : 'Откройте Терминал';
    const msg = `Команда скопирована. ${openHint}, вставьте (${pasteHint}) и нажмите Enter.`;
    const isDark = document.documentElement.classList.contains('dark');
    const toast = document.createElement('div');
    toast.setAttribute('role', 'status');
    toast.className =
        'mt-4 px-5 py-4 rounded-xl text-base font-medium transition-opacity duration-200 flex items-center gap-3';
    toast.style.cssText = isDark
        ? 'background:rgba(6,95,70,0.45);color:#a7f3d0;border:1px solid #059669;'
        : 'background:#ecfdf5;color:#065f46;border:1px solid #6ee7b7;';
    toast.innerHTML = `<i class="fas fa-check-circle" style="color:${isDark ? '#34d399' : '#059669'};"></i><span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'transition-opacity', 'duration-300');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

function formatDnAsLines(attrs) {
    if (!Array.isArray(attrs) || attrs.length === 0) return null;
    return attrs.map((item) => `${item.label}: ${item.value}`).join('\n');
}

function extractCdpUrlsFromBytes(bytes) {
    const text = new TextDecoder('latin1').decode(bytes);
    const matches = text.match(/https?:\/\/[A-Za-z0-9._:-]+\/cdp\/[0-9a-f]{40}\.crl/gi) || [];
    return buildBackendReachableCrlUrls(matches);
}

function renderCertificateInfo(certInfo, certInfoData, fileName) {
    certInfo.innerHTML = '';

    const card = document.createElement('div');
    card.className =
        'rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 overflow-hidden text-sm';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Данные сертификата');

    const header = document.createElement('div');
    header.className =
        'px-4 py-3 bg-gray-50 dark:bg-gray-700/60 border-b border-gray-200 dark:border-gray-600';
    header.setAttribute('data-fns-cert-header', '');
    header.innerHTML =
        '<span class="inline-flex items-center gap-2"><i class="fas fa-certificate text-primary opacity-80"></i><span class="font-semibold text-gray-900 dark:text-gray-100">Данные сертификата</span></span>';
    card.appendChild(header);

    /* Светящаяся панель статуса: обновляется после завершения проверки (runCheck). Красная — ИСТЕК/ОТОЗВАН, зелёная — ДЕЙСТВИТЕЛЕН. */
    const statusPanel = document.createElement('div');
    statusPanel.setAttribute('data-fns-cert-status-panel', '');
    statusPanel.className = 'fns-cert-status-panel fns-cert-status-panel--pending';
    statusPanel.textContent = 'Ожидание проверки';
    card.appendChild(statusPanel);

    const body = document.createElement('div');
    body.className = 'p-4';

    const mainTable = document.createElement('table');
    mainTable.className = 'fns-cert-table';
    mainTable.setAttribute('role', 'grid');
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th scope="col">Поле</th><th scope="col">Значение</th></tr>';
    mainTable.appendChild(thead);
    const tbody = document.createElement('tbody');

    const addRow = (label, value, options = {}) => {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.scope = 'row';
        th.className = 'fns-cert-table__label';
        th.textContent = label;
        tr.appendChild(th);
        const td = document.createElement('td');
        const baseValueClass = options.mono
            ? 'fns-cert-table__value fns-cert-table__value--mono'
            : 'fns-cert-table__value';
        td.className = baseValueClass;
        const safeValue = value || '—';
        if (options.lines && safeValue && String(safeValue).includes('\n')) {
            td.innerHTML = String(safeValue)
                .split('\n')
                .map((line) => `<span class="block">${escapeHtmlForCert(line)}</span>`)
                .join('');
        } else {
            td.textContent = safeValue;
        }
        tr.appendChild(td);
        tbody.appendChild(tr);
    };

    addRow('Файл', fileName);
    addRow('Серийный номер', certInfoData.serialHex, { mono: true });

    const issuerStr =
        formatDnAsLines(certInfoData.issuer) || formatDnAttributes(certInfoData.issuer);
    addRow('Издатель (CA)', issuerStr, { lines: issuerStr && issuerStr.includes('\n') });

    const subjectStr =
        formatDnAsLines(certInfoData.subject) || formatDnAttributes(certInfoData.subject);
    addRow('Владелец (Subject)', subjectStr, { lines: subjectStr && subjectStr.includes('\n') });

    const notBefore = escapeHtmlForCert(certInfoData.notBefore || '—');
    const notAfter = escapeHtmlForCert(certInfoData.notAfter || '—');
    addRow('Срок действия', `С ${notBefore}\nДо ${notAfter}`, { lines: true });

    mainTable.appendChild(tbody);
    body.appendChild(mainTable);

    card.appendChild(body);
    certInfo.appendChild(card);
}

function escapeHtmlForCert(s) {
    if (typeof s !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

function parseCertificate(buffer) {
    let bytes = new Uint8Array(buffer);
    const detected = detectCertificateFormat(bytes);

    if (detected.format === 'pem') {
        bytes = decodePemToDer(detected.text);
    } else if (detected.format === 'base64') {
        bytes = decodeRawBase64ToBytes(detected.text);
    }

    let root;
    try {
        root = parseDerNode(bytes);
    } catch (error) {
        throw createError(
            'Структура сертификата ASN.1 повреждена или не поддерживается.',
            'cert_asn1_failed',
            {
                reason: error?.message || String(error),
                detectedFormat: detected.format,
                bytes: bytes.length,
                hexPreview: bytesPreviewHex(bytes),
            },
        );
    }

    const tbs = root.children[0];
    if (!tbs || tbs.tag !== 0x30) {
        throw createError('Не удалось прочитать сертификат.', 'cert_tbs_not_found', {
            detectedFormat: detected.format,
            rootTag: root?.tag,
            tbsTag: tbs?.tag,
            bytes: bytes.length,
            hexPreview: bytesPreviewHex(bytes),
        });
    }

    const tbsChildren = tbs.children;
    let cursor = 0;
    if (tbsChildren[0]?.tag === 0xa0) {
        cursor += 1;
    }

    const serialNode = tbsChildren[cursor];
    const issuerNode = tbsChildren[cursor + 2];
    const validityNode = tbsChildren[cursor + 3];
    const subjectNode = tbsChildren[cursor + 4];

    const serialHex = bytesToHex(bytes.slice(serialNode.valueStart, serialNode.valueEnd));
    const validityChildren = validityNode?.children || [];
    const notBeforeDetails = validityChildren[0]
        ? decodeTimeDetails(validityChildren[0], bytes)
        : { display: '—', epochMs: NaN };
    const notAfterDetails = validityChildren[1]
        ? decodeTimeDetails(validityChildren[1], bytes)
        : { display: '—', epochMs: NaN };
    const cdpUrls = extractCdpUrlsFromBytes(bytes);

    return {
        serialHex,
        serialNormalized: normalizeHex(serialHex),
        issuer: parseName(issuerNode, bytes),
        subject: parseName(subjectNode, bytes),
        notBefore: notBeforeDetails.display,
        notAfter: notAfterDetails.display,
        notBeforeEpochMs: notBeforeDetails.epochMs,
        notAfterEpochMs: notAfterDetails.epochMs,
        crlDistributionPoints: cdpUrls,
        formatDetected: detected.format,
        bytesLength: bytes.length,
    };
}

export function initFNSCertificateRevocationSystem() {
    const certInput = document.getElementById('fnsCertFileInput');
    const certInfo = document.getElementById('fnsCertInfo');
    const resetBtn = document.getElementById('fnsCertResetBtn');
    const statusEl = document.getElementById('fnsCrlStatus');
    const detailsEl = document.getElementById('fnsCrlDetails');
    const dropZone = document.getElementById('fnsCertDropZone');
    const contentShell = document.querySelector('#fnsCertContent .fns-cert-shell');

    if (!certInput || !certInfo || !resetBtn || !statusEl) {
        console.warn('[FNS Cert Revocation] Не найдены элементы интерфейса.');
        return;
    }
    if (dropZone?.dataset.fnsCertInitialized === '1') {
        return;
    }
    if (dropZone) {
        dropZone.dataset.fnsCertInitialized = '1';
    }

    const installGate = document.getElementById('fnsCertInstallGate');
    const mainBlock = document.getElementById('fnsCertMainBlock');
    const probeStatusEl = document.getElementById('fnsCertProbeStatus');

    const setCertSectionVisibility = (available, probing = false) => {
        if (!REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER || !installGate || !mainBlock) {
            if (mainBlock) mainBlock.classList.remove('hidden');
            return;
        }
        const showGate = !available && !probing;
        const showMain = available;
        const showProbe = probing;
        if (probeStatusEl) probeStatusEl.classList.toggle('hidden', !showProbe);
        installGate.classList.toggle('hidden', !showGate);
        mainBlock.classList.toggle('hidden', !showMain);
    };

    /**
     * Renders the install-gate screen (install + run command, copy buttons). Used on first load and when redirecting from server-network failure.
     */
    function renderInstallGateContent(installGateEl, platform, origin) {
        let installCmd = '';
        let installCmdFallback = '';
        let terminalHint = '';
        if (platform === 'macos') {
            installCmd = `curl -fsSL "${origin}/install-mac.sh" | bash -s -- "${origin}"`;
            installCmdFallback = `curl -fsSL "${RAW_INSTALL_SCRIPT_BASE}/install-mac.sh" | bash -s -- "${origin}"`;
            terminalHint = 'Терминал (Cmd + Пробел → «Терминал»)';
        } else if (platform === 'linux') {
            installCmd = `curl -fsSL "${origin}/install-linux.sh" | bash -s -- "${origin}"`;
            installCmdFallback = `curl -fsSL "${RAW_INSTALL_SCRIPT_BASE}/install-linux.sh" | bash -s -- "${origin}"`;
            terminalHint = 'Терминал';
        } else if (platform === 'windows') {
            installCmd = `$env:CRL_INSTALL_BASE='${origin}'; irm '${origin}/install-windows.ps1' | iex`;
            installCmdFallback = `$env:CRL_INSTALL_BASE='${origin}'; irm '${RAW_INSTALL_SCRIPT_BASE}/install-windows.ps1' | iex`;
            terminalHint = 'PowerShell (Win + X → «Терминал» или Win + R → powershell)';
        }
        if (!installCmd) return;
        installGateEl.className =
            'w-full mb-4 p-6 md:p-8 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 shadow-sm';
        const cmdEscaped = escapeHtml(installCmd);
        const cmdFallbackEscaped = installCmdFallback ? escapeHtml(installCmdFallback) : '';
        const runCmd = getHelperRunCommand(platform);
        const unloadCmd = getHelperUnloadCommand(platform);
        const runCmdEscaped = runCmd ? escapeHtml(runCmd) : '';
        const unloadCmdEscaped = unloadCmd ? escapeHtml(unloadCmd) : '';
        installGateEl.innerHTML = `
            <div class="w-full">
                <p class="text-sm font-medium text-amber-700 dark:text-amber-400 mb-4" role="status">
                    <i class="fas fa-info-circle mr-1"></i>Проверка: компонента не запущена. Установите её (команда ниже) или запустите уже установленную.
                </p>
                <h3 class="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-3">
                    <i class="fas fa-shield-alt text-green-600 dark:text-green-400"></i>
                    Безопасная локальная проверка
                </h3>
                <p class="text-lg md:text-xl text-gray-800 dark:text-gray-200 mb-6 leading-relaxed">
                    Чтобы проверка сертификатов проходила <strong class="text-gray-900 dark:text-gray-100">только на вашем компьютере</strong> (без передачи данных на сервер), требуется небольшая системная компонента.
                </p>
                <ul class="list-disc list-inside mb-8 text-base md:text-lg text-gray-700 dark:text-gray-300 space-y-3 max-w-2xl">
                    <li>Установка выполняется <strong>только один раз</strong>.</li>
                    <li>Команда <strong>полностью безопасна</strong> и проверена.</li>
                    <li>Компонента взаимодействует <strong>только с этим разделом</strong> и не влияет на систему.</li>
                </ul>
                <p class="text-base md:text-lg text-gray-700 dark:text-gray-300 mb-4">
                    Нажмите кнопку ниже — команда скопируется. Откройте <strong>${terminalHint}</strong>, вставьте (Cmd+V или Ctrl+V) и нажмите Enter:
                </p>
                <div class="flex flex-col sm:flex-row gap-3 mb-4">
                    <code data-fns-install-cmd class="flex-1 p-4 bg-gray-100 dark:bg-gray-800 rounded-xl font-mono text-sm md:text-base border border-gray-300 dark:border-gray-600 cursor-copy overflow-x-auto select-all hover:border-primary/50 transition-colors" title="Нажмите, чтобы скопировать">${cmdEscaped}</code>
                    <button type="button" data-fns-copy-cmd class="shrink-0 px-6 py-3.5 rounded-xl bg-primary hover:bg-secondary text-white text-base font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm">
                        <i class="fas fa-copy"></i><span>Скопировать команду</span>
                    </button>
                </div>
                ${
                    cmdFallbackEscaped
                        ? `
                <p class="text-sm text-amber-700 dark:text-amber-400 mb-2 mt-4">Если команда выше выдаёт ошибку 404, используйте (скрипт с GitHub):</p>
                <div class="flex flex-col sm:flex-row gap-3 mb-4">
                    <code data-fns-install-cmd-fallback class="flex-1 p-4 bg-gray-100 dark:bg-gray-800 rounded-xl font-mono text-sm border border-gray-300 dark:border-gray-600 cursor-copy overflow-x-auto select-all hover:border-primary/50 transition-colors" title="Нажмите, чтобы скопировать">${cmdFallbackEscaped}</code>
                    <button type="button" data-fns-copy-cmd-fallback class="shrink-0 px-4 py-3 rounded-xl border border-amber-500/50 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors flex items-center justify-center gap-2">
                        <i class="fas fa-copy"></i><span>Скопировать запасную команду</span>
                    </button>
                </div>`
                        : ''
                }
                <p class="text-sm md:text-base text-gray-500 dark:text-gray-400 mb-4">
                    После запуска команды в Терминале страница обновится автоматически или нажмите «Проверить снова».
                </p>
                <button type="button" data-fns-probe-again class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
                    <i class="fas fa-sync-alt"></i><span>Проверить снова</span>
                </button>
                ${
                    runCmdEscaped
                        ? `
                <div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-600">
                    <p class="text-base md:text-lg text-gray-700 dark:text-gray-300 mb-2">
                        <strong>Уже устанавливали?</strong> Если компонента не запущена, скопируйте команду запуска и выполните в <strong>${terminalHint}</strong>:
                    </p>
                    ${
                        platform === 'macos'
                            ? `
                    <p class="text-sm text-amber-700 dark:text-amber-400 mb-2">
                        Если macOS пишет «Объект от неподтвержденного разработчика»: <strong>Системные настройки</strong> → <strong>Конфиденциальность и безопасность</strong> → внизу нажмите <strong>«Всё равно открыть»</strong> рядом с CRL-Helper-macos.
                    </p>
                    <p class="text-sm text-amber-700 dark:text-amber-400 mb-3">
                        Если при запуске появляется <strong>«Адрес уже используется»</strong> (Address already in use): сначала остановите службу (команда ниже), затем снова запустите компоненту.
                    </p>`
                            : ''
                    }
                    ${
                        unloadCmdEscaped && platform === 'macos'
                            ? `
                    <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">Освободить порт 7777 (завершить процесс и/или остановить службу):</p>
                    <div class="flex flex-col sm:flex-row gap-3 mb-3">
                        <code data-fns-unload-cmd class="flex-1 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg font-mono text-xs border border-gray-300 dark:border-gray-600 cursor-copy overflow-x-auto" title="Нажмите, чтобы скопировать">${unloadCmdEscaped}</code>
                        <button type="button" data-fns-copy-unload-cmd class="shrink-0 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors flex items-center gap-1">
                            <i class="fas fa-copy"></i><span>Скопировать</span>
                        </button>
                    </div>`
                            : ''
                    }
                    <p class="text-base md:text-lg text-gray-700 dark:text-gray-300 mb-2">Команда запуска:</p>
                    <div class="flex flex-col sm:flex-row gap-3 mb-2">
                        <code data-fns-run-cmd class="flex-1 p-4 bg-gray-100 dark:bg-gray-800 rounded-xl font-mono text-sm md:text-base border border-gray-300 dark:border-gray-600 cursor-copy overflow-x-auto select-all hover:border-primary/50 transition-colors" title="Нажмите, чтобы скопировать">${runCmdEscaped}</code>
                        <button type="button" data-fns-copy-run-cmd class="shrink-0 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2">
                            <i class="fas fa-copy"></i><span>Скопировать команду запуска</span>
                        </button>
                    </div>
                    <p class="text-sm text-green-700 dark:text-green-400 mt-4 mb-1"><strong>Если бинарник не запускается:</strong> при наличии Node.js 18+ откройте папку с исходным кодом проекта в Терминале и выполните <code class="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">node helper/crl-helper.js</code> (оставьте окно открытым). Порт 7777 будет занят этим процессом.</p>
                </div>`
                        : ''
                }
            </div>
        `;
        const codeEl = installGateEl.querySelector('[data-fns-install-cmd]');
        const codeFallbackEl = installGateEl.querySelector('[data-fns-install-cmd-fallback]');
        const copyBtn = installGateEl.querySelector('[data-fns-copy-cmd]');
        const copyFallbackBtn = installGateEl.querySelector('[data-fns-copy-cmd-fallback]');
        const runCmdEl = installGateEl.querySelector('[data-fns-run-cmd]');
        const copyRunBtn = installGateEl.querySelector('[data-fns-copy-run-cmd]');
        const unloadCmdEl = installGateEl.querySelector('[data-fns-unload-cmd]');
        const copyUnloadBtn = installGateEl.querySelector('[data-fns-copy-unload-cmd]');
        const probeAgainBtn = installGateEl.querySelector('[data-fns-probe-again]');
        const runProbeAndMaybeShowMain = async () => {
            const ok = await probeHelperAvailability(REVOCATION_LOCAL_HELPER_BASE_URL);
            if (ok) {
                if (typeof window !== 'undefined') window.__revocationHelperAvailable = true;
                setCertSectionVisibility(true);
                installGateEl.innerHTML = '';
            }
        };
        if (probeAgainBtn) {
            probeAgainBtn.addEventListener('click', () => {
                probeAgainBtn.disabled = true;
                probeAgainBtn.innerHTML =
                    '<i class="fas fa-spinner fa-spin"></i><span>Проверяю…</span>';
                runProbeAndMaybeShowMain().finally(() => {
                    probeAgainBtn.disabled = false;
                    probeAgainBtn.innerHTML =
                        '<i class="fas fa-sync-alt"></i><span>Проверить снова</span>';
                });
            });
        }
        const showToast = () => showCopyToast(installGateEl, platform);
        const doCopy = async () => {
            try {
                await navigator.clipboard.writeText(installCmd);
                showToast();
            } catch {
                if (codeEl) {
                    const range = document.createRange();
                    range.selectNodeContents(codeEl);
                    const sel = window.getSelection();
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                    try {
                        document.execCommand('copy');
                        showToast();
                    } catch {
                        /* copy failed */
                    }
                    sel?.removeAllRanges();
                }
            }
        };
        const doCopyRun = async () => {
            if (!runCmd) return;
            try {
                await navigator.clipboard.writeText(runCmd);
                showToast();
            } catch {
                if (runCmdEl) {
                    const range = document.createRange();
                    range.selectNodeContents(runCmdEl);
                    const sel = window.getSelection();
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                    try {
                        document.execCommand('copy');
                        showToast();
                    } catch {
                        /* copy failed */
                    }
                    sel?.removeAllRanges();
                }
            }
        };
        const doCopyUnload = async () => {
            if (!unloadCmd) return;
            try {
                await navigator.clipboard.writeText(unloadCmd);
                showToast();
            } catch {
                if (unloadCmdEl) {
                    const range = document.createRange();
                    range.selectNodeContents(unloadCmdEl);
                    const sel = window.getSelection();
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                    try {
                        document.execCommand('copy');
                        showToast();
                    } catch {
                        /* copy failed */
                    }
                    sel?.removeAllRanges();
                }
            }
        };
        const doCopyFallback = async () => {
            if (!installCmdFallback) return;
            try {
                await navigator.clipboard.writeText(installCmdFallback);
                showToast();
            } catch {
                if (codeFallbackEl) {
                    const range = document.createRange();
                    range.selectNodeContents(codeFallbackEl);
                    const sel = window.getSelection();
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                    try {
                        document.execCommand('copy');
                        showToast();
                    } catch {
                        /* copy failed */
                    }
                    sel?.removeAllRanges();
                }
            }
        };
        if (copyBtn) copyBtn.addEventListener('click', doCopy);
        if (codeEl) codeEl.addEventListener('click', doCopy);
        if (copyFallbackBtn) copyFallbackBtn.addEventListener('click', doCopyFallback);
        if (codeFallbackEl) codeFallbackEl.addEventListener('click', doCopyFallback);
        if (copyRunBtn) copyRunBtn.addEventListener('click', doCopyRun);
        if (runCmdEl) runCmdEl.addEventListener('click', doCopyRun);
        if (copyUnloadBtn) copyUnloadBtn.addEventListener('click', doCopyUnload);
        if (unloadCmdEl) unloadCmdEl.addEventListener('click', doCopyUnload);
    }

    if (
        installGate &&
        REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER &&
        REVOCATION_DESKTOP_APP_DOWNLOAD_URL &&
        REVOCATION_LOCAL_HELPER_BASE_URL
    ) {
        (async () => {
            let available = window.__revocationHelperAvailable;
            if (available === null) {
                setCertSectionVisibility(false, true);
                available = await probeHelperAvailability(REVOCATION_LOCAL_HELPER_BASE_URL);
                if (typeof window !== 'undefined') window.__revocationHelperAvailable = available;
            }
            if (available) {
                setCertSectionVisibility(true);
            } else {
                setCertSectionVisibility(false);
                const platform = detectDownloadPlatform();
                const origin = typeof window !== 'undefined' ? window.location.origin : '';
                let _installCmd = '';
                if (platform === 'macos' || platform === 'linux' || platform === 'windows') {
                    renderInstallGateContent(installGate, platform, origin);
                } else {
                    installGate.innerHTML =
                        '<button type="button" class="px-4 py-2 rounded-lg bg-primary hover:bg-secondary text-white text-sm font-medium transition-colors">Установить</button>';
                    installGate.querySelector('button').addEventListener('click', async () => {
                        const url = getDownloadUrl(platform);
                        const filenameOrNull = await triggerDownload();
                        if (!filenameOrNull) {
                            logDebug({ stage: 'downloadUnavailable', platform, url });
                            const btn = installGate.querySelector('button');
                            btn.textContent = 'Сборка недоступна или файл повреждён';
                            btn.className =
                                'px-4 py-2 rounded-lg bg-gray-400 dark:bg-gray-600 text-gray-200 dark:text-gray-300 text-sm font-medium cursor-not-allowed';
                            return;
                        }
                        installGate.querySelector('button').textContent =
                            platform === 'windows'
                                ? 'Запустите файл после загрузки'
                                : 'Распакуйте ZIP и запустите CRL-Helper';
                        installGate.querySelector('button').disabled = true;

                        const pollInterval = setInterval(() => {
                            probeHelperAvailability(REVOCATION_LOCAL_HELPER_BASE_URL).then((ok) => {
                                if (ok) {
                                    window.__revocationHelperAvailable = true;
                                    clearInterval(pollInterval);
                                    setCertSectionVisibility(true);
                                    installGate.innerHTML = '';
                                }
                            });
                        }, 10000);
                        setTimeout(() => clearInterval(pollInterval), 60000);
                    });
                }

                const PROBE_INTERVAL_MS = 3000;
                const PROBE_FIRST_DELAY_MS = 2000;
                const PROBE_WINDOW_MS = 120000;
                const PROBE_MAX_CONSECUTIVE_FAILURES = 5;
                let probeFailCount = 0;
                const doProbe = () => {
                    probeHelperAvailability(REVOCATION_LOCAL_HELPER_BASE_URL).then((ok) => {
                        if (ok) {
                            window.__revocationHelperAvailable = true;
                            clearInterval(checkInterval);
                            setCertSectionVisibility(true);
                            installGate.innerHTML = '';
                        } else {
                            probeFailCount += 1;
                            if (probeFailCount >= PROBE_MAX_CONSECUTIVE_FAILURES) {
                                clearInterval(checkInterval);
                            }
                        }
                    });
                };
                const checkInterval = setInterval(doProbe, PROBE_INTERVAL_MS);
                setTimeout(doProbe, PROBE_FIRST_DELAY_MS);
                setTimeout(() => clearInterval(checkInterval), PROBE_WINDOW_MS);
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') doProbe();
                });
            }
        })();
    } else {
        setCertSectionVisibility(true);
    }

    document.addEventListener('copilot1co:tabShown', async (e) => {
        if (
            e?.detail?.tabId !== 'fnsCert' ||
            !REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER ||
            !installGate ||
            !mainBlock
        )
            return;
        const available = await probeHelperAvailability(REVOCATION_LOCAL_HELPER_BASE_URL);
        if (typeof window !== 'undefined') window.__revocationHelperAvailable = available;
        setCertSectionVisibility(available);
        if (!available) {
            installGate.classList.remove('hidden');
            mainBlock.classList.add('hidden');
            const platform = detectDownloadPlatform();
            const origin = typeof window !== 'undefined' ? window.location.origin : '';
            if (platform === 'macos' || platform === 'linux' || platform === 'windows') {
                renderInstallGateContent(installGate, platform, origin);
            }
        }
    });

    let isChecking = false;
    let activeRunId = 0;

    const setStatus = (text, tone = 'neutral', showSpinner = false) => {
        const baseClass = `flex-1 rounded-md border py-2 px-3 text-sm flex items-center gap-3 transition-opacity duration-200 ${STATUS_TONE_CLASSES[tone] || STATUS_TONE_CLASSES.neutral}`;
        if (showSpinner) {
            const spinnerHtml =
                '<span class="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" aria-hidden="true"></span>';
            statusEl.innerHTML = `${spinnerHtml}<span>${escapeHtml(text)}</span>`;
        } else {
            statusEl.textContent = text;
        }
        statusEl.className = baseClass;
    };

    function escapeHtml(s) {
        if (typeof s !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    const setUploadDisabled = (disabled) => {
        certInput.disabled = disabled;
        if (!dropZone) return;
        dropZone.classList.toggle('cursor-pointer', !disabled);
        dropZone.classList.toggle('opacity-60', disabled);
        dropZone.classList.toggle('cursor-not-allowed', disabled);
        dropZone.classList.toggle('pointer-events-none', disabled);
        dropZone.setAttribute('aria-disabled', String(Boolean(disabled)));
    };

    const resetOutput = (options = {}) => {
        const { idleMessage = 'Ожидание сертификата', showSpinner = false } = options;
        setStatus(idleMessage, 'neutral', showSpinner);
        if (detailsEl) {
            detailsEl.innerHTML = '';
            detailsEl.classList.add('hidden');
        }
        if (contentShell) {
            contentShell.classList.remove('fns-cert-shell-danger', 'fns-cert-shell-warning');
        }
    };

    const resetAll = () => {
        activeRunId += 1;
        isChecking = false;
        certInput.value = '';
        certInfo.innerHTML = '';
        if (detailsEl) detailsEl.innerHTML = '';
        if (dropZone) {
            dropZone.classList.remove(
                'border-primary',
                'bg-gray-50',
                'dark:bg-gray-700/50',
                'hidden',
            );
        }
        if (contentShell) {
            contentShell.classList.remove('fns-cert-shell-danger', 'fns-cert-shell-warning');
        }
        setUploadDisabled(false);
        resetOutput();
    };

    resetOutput();

    async function runCheck() {
        if (isChecking) return;
        const runId = ++activeRunId;
        resetOutput();
        const file = certInput.files?.[0];
        if (!file) {
            setStatus('Перетащите сертификат сюда', 'neutral');
            return;
        }

        isChecking = true;
        setUploadDisabled(true);
        try {
            setStatus('Читаем сертификат…', 'neutral', true);
            const certBuffer = await file.arrayBuffer();
            logDebug({
                stage: 'readCertificate',
                source: 'client',
                runId,
                bytes: certBuffer.byteLength,
                fileName: file.name,
            });
            if (runId !== activeRunId) return;
            const certInfoData = parseCertificate(certBuffer);
            logDebug({
                stage: 'parseCertificate',
                source: 'client',
                runId,
                formatDetected: certInfoData.formatDetected,
                bytes: certInfoData.bytesLength,
                serial: certInfoData.serialNormalized,
            });
            renderCertificateInfo(certInfo, certInfoData, file.name);
            if (dropZone) {
                dropZone.classList.add('hidden');
            }

            const resolvedCrlUrls = resolveCrlUrls(certInfoData);
            let crlEntries;
            if (REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER && REVOCATION_LOCAL_HELPER_BASE_URL) {
                setStatus('Загружаем списки отзыва…', 'neutral', true);
                crlEntries = await buildCrlEntriesViaLocalHelper(
                    resolvedCrlUrls,
                    REVOCATION_LOCAL_HELPER_BASE_URL,
                );
            } else {
                setStatus('Загружаем списки отзыва…', 'neutral', true);
                crlEntries = buildBackendFirstEntries(resolvedCrlUrls);
            }
            if (runId !== activeRunId) return;

            const clientFailedEntries = crlEntries.filter((e) => !e.data);
            const localHelperSuccessCount = crlEntries.filter(
                (e) => e.data && e.viaLocalHelper,
            ).length;
            setStatus('Проверяем отзыв…', 'neutral', true);

            const helperBaseUrlToSend = REVOCATION_LOCAL_HELPER_ENABLED
                ? REVOCATION_LOCAL_HELPER_BASE_URL
                : '';
            const batchResult = await RevocationService.checkRevocationHybrid(
                certInfoData.serialNormalized,
                crlEntries,
                {
                    networkPolicy: resolveNetworkPolicy(),
                    helperBaseUrl: helperBaseUrlToSend,
                },
            );
            if (runId !== activeRunId) return;
            const results = batchResult.results;

            let revokedSource = null;
            let successfulChecks = 0;
            let failedChecks = 0;
            const detailList = document.createElement('ul');
            detailList.className = 'space-y-2';

            results.forEach((entry, i) => {
                const url = entry.url || 'Неизвестный URL';
                const crlEntry = crlEntries[i];
                const source = crlEntry?.viaLocalHelper
                    ? 'локальный helper'
                    : entry.source === 'client'
                      ? 'клиент'
                      : entry.source === 'local-helper'
                        ? 'локальный-helper (сервер)'
                        : entry.source === 'server-proxy'
                          ? 'сервер+прокси'
                          : 'сервер';
                const item = document.createElement('li');
                item.className =
                    'rounded-md border border-gray-200 dark:border-gray-500 bg-gray-50 dark:bg-gray-600 p-2 text-xs text-gray-700 dark:text-gray-200';

                if (entry.error) {
                    failedChecks += 1;
                    const codePart = entry.errorCode ? ` (код: ${entry.errorCode})` : '';
                    const attemptPart =
                        Array.isArray(entry.attemptPath) && entry.attemptPath.length
                            ? ` [пути: ${entry.attemptPath.map((p) => `${p.source}:${p.errorCode || 'ok'}`).join(' -> ')}]`
                            : '';
                    item.textContent = `[${source}] ${url}: ${entry.error}${codePart}${attemptPart}`;
                } else if (entry.revoked) {
                    successfulChecks += 1;
                    if (!revokedSource) revokedSource = url;
                    item.textContent = `[${source}] ${url}: найден в списке отзыва.`;
                } else {
                    successfulChecks += 1;
                    item.textContent = `[${source}] ${url}: в списке отзыва не обнаружен.`;
                }
                detailList.appendChild(item);
            });

            let redirectToInstallGate = false;
            const certExpired = isCertificateExpired(certInfoData);
            const finalRevocationState = resolveFinalRevocationState(
                Boolean(revokedSource),
                certExpired,
            );
            const uiModel = deriveFnsCertRevocationUiModel(
                finalRevocationState,
                successfulChecks,
                failedChecks,
                batchResult?.error,
            );
            recordFnsRevocationHybridFaultToRuntimeHub(
                batchResult,
                results,
                successfulChecks,
                failedChecks,
                finalRevocationState.revoked,
            );

            logDebug({
                stage: 'checkRevocationHybrid',
                source: 'client',
                runId,
                successfulChecks,
                failedChecks,
                proxyEnabled: REVOCATION_PROXY_ENABLED,
                networkPolicy: resolveNetworkPolicy(),
                localHelperEnabled: REVOCATION_LOCAL_HELPER_ENABLED,
                errorCode: batchResult?.errorCode || null,
                errorMessage: batchResult?.error || null,
                verdictUnknown: uiModel.statusUnknown,
                errorCodesSample: results
                    .filter((r) => r.errorCode)
                    .slice(0, 6)
                    .map((r) => r.errorCode),
            });
            const serverNetworkCodes = new Set(['crl_fetch_network', 'crl_fetch_timeout']);
            const failedResults = results.filter((r) => r.error);
            const _hasNetworkFailures = failedResults.some(
                (r) =>
                    (r.source === 'server' || r.source === 'server-proxy') &&
                    serverNetworkCodes.has(r.errorCode),
            );

            if (detailsEl) {
                detailsEl.innerHTML = '';
                const summary = document.createElement('div');
                summary.className =
                    'mb-3 rounded-lg border p-3 text-sm flex items-start gap-2 ' +
                    (finalRevocationState.revoked
                        ? 'border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                        : uiModel.statusUnknown
                          ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/25 text-amber-900 dark:text-amber-200'
                          : 'border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300');
                const isRevoked = finalRevocationState.revoked;
                const isExpiredOnly = finalRevocationState.reason === 'expired';
                let summaryTitle;
                if (isRevoked) {
                    summaryTitle = isExpiredOnly
                        ? 'По результатам проверки сертификат истёк'
                        : 'По результатам проверки сертификат отозван';
                } else if (uiModel.statusUnknown) {
                    summaryTitle =
                        successfulChecks === 0
                            ? 'Ошибка проверки отзыва: статус сертификата по CRL неизвестен'
                            : 'Проверка отзыва неполная: нельзя утверждать, что сертификат не отозван';
                } else {
                    summaryTitle = 'По результатам проверки сертификат не отозван';
                }
                summary.innerHTML = `<i class="fas fa-shield-alt mt-0.5"></i><div class="font-semibold">${escapeHtmlForCert(summaryTitle)}</div>`;
                detailsEl.appendChild(summary);
                if (contentShell) {
                    contentShell.classList.toggle('fns-cert-shell-danger', Boolean(isRevoked));
                    contentShell.classList.toggle(
                        'fns-cert-shell-warning',
                        Boolean(uiModel.statusUnknown && !isRevoked),
                    );
                }

                const statusPanelEl = certInfo.querySelector('[data-fns-cert-status-panel]');
                if (statusPanelEl) {
                    statusPanelEl.classList.remove(
                        'fns-cert-status-panel--pending',
                        'fns-cert-status-panel--danger',
                        'fns-cert-status-panel--success',
                        'fns-cert-status-panel--unknown',
                    );
                    if (isRevoked) {
                        statusPanelEl.classList.add('fns-cert-status-panel--danger');
                        statusPanelEl.textContent = isExpiredOnly ? 'ИСТЕК' : 'ОТОЗВАН';
                    } else if (uiModel.statusUnknown) {
                        statusPanelEl.classList.add('fns-cert-status-panel--unknown');
                        statusPanelEl.textContent = 'НЕИЗВЕСТЕН';
                    } else {
                        statusPanelEl.classList.add('fns-cert-status-panel--success');
                        statusPanelEl.textContent = 'ДЕЙСТВИТЕЛЕН';
                    }
                }
                const usedLocalHelperFromBrowser =
                    REVOCATION_USE_LOCAL_HELPER_FROM_BROWSER && REVOCATION_LOCAL_HELPER_BASE_URL;
                const allFailed = usedLocalHelperFromBrowser && localHelperSuccessCount === 0;
                const allFailuresFromServerNetwork =
                    failedResults.length > 0 &&
                    failedResults.every(
                        (r) =>
                            (r.source === 'server' || r.source === 'server-proxy') &&
                            serverNetworkCodes.has(r.errorCode),
                    );
                if (allFailed && clientFailedEntries.length > 0) {
                    const clientInfo = document.createElement('li');
                    clientInfo.className =
                        'rounded-md border border-gray-200 dark:border-gray-500 bg-gray-50 dark:bg-gray-600 p-2 text-xs text-gray-700 dark:text-gray-300';
                    if (successfulChecks > 0) {
                        const someServerNetworkFailed = failedResults.some(
                            (r) =>
                                (r.source === 'server' || r.source === 'server-proxy') &&
                                serverNetworkCodes.has(r.errorCode),
                        );
                        clientInfo.textContent = someServerNetworkFailed
                            ? `Локальный helper не загрузил списки; проверка выполнена через сервер. Часть списков не получена (ошибка сети) — ${successfulChecks} из ${results.length} проверено.`
                            : 'Локальный helper не загрузил списки; проверка выполнена через сервер.';
                    } else {
                        const onlyNotRunningOrMissing = clientFailedEntries.every(
                            (entry) =>
                                entry.clientErrorCode === 'local_helper_not_running' ||
                                entry.clientErrorCode === 'local_helper_not_configured',
                        );
                        const hasUpstreamError = clientFailedEntries.some(
                            (e) =>
                                e.clientErrorCode === 'local_helper_failed' &&
                                /HTTP (502|503|504)/.test(e.clientErrorMessage || ''),
                        );
                        if (allFailuresFromServerNetwork) {
                            redirectToInstallGate = true;
                            setCertSectionVisibility(false);
                            const platformRedirect = detectDownloadPlatform();
                            const originRedirect =
                                typeof window !== 'undefined' ? window.location.origin : '';
                            renderInstallGateContent(installGate, platformRedirect, originRedirect);
                            if (detailsEl) {
                                detailsEl.innerHTML = '';
                                detailsEl.classList.add('hidden');
                            }
                        } else {
                            clientInfo.textContent = onlyNotRunningOrMissing
                                ? 'Локальный helper не установлен или не запущен. Нажмите «Установить» выше.'
                                : hasUpstreamError
                                  ? 'Серверы ФНС временно недоступны (502/504) или превышено время ожидания. Проверьте интернет/VPN и попробуйте позже.'
                                  : 'Локальный helper установлен, но не может загрузить списки отзыва. Проверьте интернет/VPN и перезапустите helper.';
                        }
                    }
                    const didRedirectToInstallGate =
                        allFailuresFromServerNetwork && successfulChecks === 0;
                    if (!didRedirectToInstallGate) {
                        detailList.insertBefore(clientInfo, detailList.firstChild);
                    }
                } else if (
                    usedLocalHelperFromBrowser &&
                    clientFailedEntries.length > 0 &&
                    !allFailed
                ) {
                    const clientInfo = document.createElement('li');
                    clientInfo.className =
                        'rounded-md border border-gray-200 dark:border-gray-500 bg-gray-50 dark:bg-gray-600 p-2 text-xs text-gray-700 dark:text-gray-300';
                    clientInfo.textContent = `${localHelperSuccessCount} из ${crlEntries.length} списков загружено.`;
                    detailList.insertBefore(clientInfo, detailList.firstChild);
                } else if (!usedLocalHelperFromBrowser && clientFailedEntries.length > 0) {
                    const clientInfo = document.createElement('li');
                    clientInfo.className =
                        'rounded-md border border-gray-200 dark:border-gray-500 bg-gray-50 dark:bg-gray-600 p-2 text-xs text-gray-700 dark:text-gray-300';
                    clientInfo.textContent = 'Режим backend-first: клиентские загрузки отключены.';
                    detailList.insertBefore(clientInfo, detailList.firstChild);
                }
                // Дополнительное пояснение по истечению срока действия сертификата выводить не требуется.
                if (detailList.children.length > 0 && !redirectToInstallGate) {
                    const useToggle = detailList.children.length > 1;
                    if (useToggle) {
                        const toggle = document.createElement('button');
                        toggle.type = 'button';
                        toggle.className = 'text-xs text-primary hover:underline';
                        toggle.textContent = 'Подробнее';
                        toggle.dataset.expanded = '0';
                        detailList.classList.add('hidden');
                        toggle.addEventListener('click', () => {
                            const exp = toggle.dataset.expanded === '1';
                            toggle.dataset.expanded = exp ? '0' : '1';
                            detailList.classList.toggle('hidden', exp);
                            toggle.textContent = exp ? 'Подробнее' : 'Скрыть';
                        });
                        detailsEl.appendChild(toggle);
                    }
                    detailsEl.appendChild(detailList);
                    detailsEl.classList.remove('hidden');
                } else {
                    detailsEl.appendChild(detailList);
                }
            }

            if (finalRevocationState.revoked) {
                setStatus(
                    finalRevocationState.reason === 'expired'
                        ? '\u2716 Результат: сертификат недействителен (срок действия истёк)'
                        : '\u2716 Результат: сертификат отозван',
                    'danger',
                );
            } else if (!uiModel.statusUnknown) {
                setStatus('\u2713 Результат: сертификат действителен (по успешно проверенным CRL)', 'success');
            } else if (successfulChecks === 0) {
                setStatus(
                    '\u2716 Результат: проверка отзыва не завершена — статус сертификата неизвестен',
                    'warn',
                );
            } else {
                setStatus(
                    '\u25B3 Результат: проверка отзыва неполная — статус по отзыву не подтверждён',
                    'warn',
                );
            }
        } catch (error) {
            if (runId !== activeRunId) return;
            logDebug({
                stage: 'runCheck',
                source: 'client',
                runId,
                errorCode: error?.code || 'unknown',
                errorMessage: error?.message || String(error),
            });
            try {
                ingestRuntimeHubIssue(
                    'FNS Revocation',
                    error?.message || String(error),
                    { stage: 'runCheck', runId },
                    { mirror: true },
                );
            } catch {
                /* ignore */
            }
            setStatus('\u2716 Ошибка', 'danger');
            if (detailsEl) {
                detailsEl.innerHTML = `<p class="text-xs text-gray-600 dark:text-gray-400">${String(error?.message || error).slice(0, 120)}</p>`;
                detailsEl.classList.remove('hidden');
            }
        } finally {
            if (runId === activeRunId) {
                isChecking = false;
                setUploadDisabled(false);
            }
        }
    }

    const dropZoneHint = document.getElementById('fnsCertDropZoneHint');
    const DROP_HINT_DEFAULT = 'Перетащите сертификат сюда или нажмите для выбора';
    const DROP_HINT_DRAG = 'Отпустите для загрузки';

    if (dropZone) {
        dropZone.addEventListener('click', () => {
            if (!isChecking) certInput.click();
        });
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('border-primary', 'bg-gray-50', 'dark:bg-gray-700/50');
            if (dropZoneHint)
                dropZoneHint.innerHTML = `<i class="fas fa-download mr-2 text-primary"></i>${DROP_HINT_DRAG}`;
        });
        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('border-primary', 'bg-gray-50', 'dark:bg-gray-700/50');
            if (dropZoneHint)
                dropZoneHint.innerHTML = `<i class="fas fa-certificate mr-2 text-gray-400"></i>${DROP_HINT_DEFAULT}`;
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isChecking) return;
            dropZone.classList.remove('border-primary', 'bg-gray-50', 'dark:bg-gray-700/50');
            if (dropZoneHint)
                dropZoneHint.innerHTML = `<i class="fas fa-certificate mr-2 text-gray-400"></i>${DROP_HINT_DEFAULT}`;
            const file = e.dataTransfer?.files?.[0];
            if (file && /\.(pem|cer|crt|der)$/i.test(file.name)) {
                const dt = new DataTransfer();
                dt.items.add(file);
                certInput.files = dt.files;
                runCheck();
            }
        });
    }

    certInput.addEventListener('change', () => {
        if (isChecking) return;
        const file = certInput.files?.[0];
        if (file) runCheck();
        else {
            certInfo.textContent = '';
            resetOutput();
        }
    });

    resetBtn.addEventListener('click', () => {
        resetAll();
    });
}

if (typeof window !== 'undefined') {
    window.initFNSCertificateRevocationSystem = initFNSCertificateRevocationSystem;
}

export const __testables = {
    detectCertificateFormat,
    decodeRawBase64ToBytes,
    deriveFnsCertRevocationUiModel,
    isCertificateExpired,
    parseCertificate,
    resolveCrlUrls,
    resolveFinalRevocationState,
    resolveNetworkPolicy,
    shouldAttemptBrowserFetch,
    shouldRecommendProxy,
};
