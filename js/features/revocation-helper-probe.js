/**
 * Revocation helper availability probe and inline download.
 * Probes localhost:7777/health at app load; triggers OS-aware download when helper is missing.
 */

const PROBE_TIMEOUT_MS = 2000;

let ingestUnavailable = false;
function sendAgentDebugLog(payload) {
    if (ingestUnavailable) return;
    if (
        typeof window !== 'undefined' &&
        window.location &&
        !/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
    )
        return;
    // #region agent log
    fetch('http://127.0.0.1:7520/ingest/374fe693-b6e8-47c0-81cf-9d56349887e0', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '979877' },
        body: JSON.stringify({ sessionId: '979877', ...payload, timestamp: Date.now() }),
    }).catch(() => {
        ingestUnavailable = true;
    });
    // #endregion
}

if (typeof window !== 'undefined') {
    window.__revocationHelperAvailable = null;
}

/**
 * Probes helper or revocation API availability.
 * @param {string} baseUrl - e.g. 'http://localhost:7777' or 'https://functions.yandexcloud.net/...'
 * @param {{ path?: string }} [options] - path: '/health' for local helper, '/api/health' for Yandex/API
 * @returns {Promise<boolean>}
 */
export async function probeHelperAvailability(baseUrl, options = {}) {
    const path = options.path ?? '/health';
    const base = String(baseUrl || '')
        .trim()
        .replace(/\/$/, '');
    if (!base) return false;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
        const res = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
            method: 'GET',
            signal: controller.signal,
        });
        // #region agent log
        sendAgentDebugLog({
            runId: 'pre-fix',
            hypothesisId: 'H5',
            location: 'revocation-helper-probe.js:probeHelperAvailability',
            message: 'Helper health response',
            data: { base, status: res.status, ok: res.ok },
        });
        // #endregion
        clearTimeout(timeoutId);
        if (!res.ok) return false;
        const data = await res.json();
        return data?.ok === true;
    } catch (error) {
        // #region agent log
        sendAgentDebugLog({
            runId: 'pre-fix',
            hypothesisId: 'H5',
            location: 'revocation-helper-probe.js:probeHelperAvailability',
            message: 'Helper health request failed',
            data: {
                base,
                errorName: error?.name || 'unknown',
                errorMessage: error?.message || 'unknown',
            },
        });
        // #endregion
        clearTimeout(timeoutId);
        return false;
    }
}

/**
 * Detects platform for download file selection.
 * @returns {'windows'|'macos'|'linux'}
 */
export function detectDownloadPlatform() {
    const ua = navigator.userAgent || '';
    const plat = navigator.platform || '';
    if (/Win/i.test(ua) || /Windows/i.test(ua) || plat.indexOf('Win') >= 0) return 'windows';
    if (/Mac/i.test(ua) || /iPhone|iPad/i.test(ua) || plat.indexOf('Mac') >= 0) return 'macos';
    return 'linux';
}

/**
 * Command to run the already-installed CRL-Helper in the console (paths match install scripts).
 * @param {'windows'|'macos'|'linux'} platform
 * @returns {string} Command to copy into terminal/PowerShell, or empty if unknown
 */
export function getHelperRunCommand(platform) {
    switch (platform) {
        case 'macos':
            return '"$HOME/Library/Application Support/CRL-Helper/CRL-Helper-macos" &';
        case 'linux':
            return '"$HOME/.local/share/CRL-Helper/CRL-Helper-linux" &';
        case 'windows':
            return '& "$env:LOCALAPPDATA\\CRL-Helper\\CRL-Helper.exe"';
        default:
            return '';
    }
}

/**
 * Command to stop the CRL-Helper (free port 7777). On macOS, killing by port is more reliable than launchctl unload (which can fail with "Input/output error" on Sonoma+).
 * @param {'windows'|'macos'|'linux'} platform
 * @returns {string} Command to copy, or empty if not applicable
 */
export function getHelperUnloadCommand(platform) {
    if (platform === 'macos') {
        return 'lsof -ti:7777 | xargs kill 2>/dev/null; launchctl bootout gui/$(id -u) "$HOME/Library/LaunchAgents/ru.crl.helper.plist" 2>/dev/null; true';
    }
    return '';
}

/**
 * Canonical download path. macOS had a historical path at /downloads/; we keep it as fallback.
 * @param {'windows'|'macos'|'linux'} platform
 * @returns {string}
 */
export function getDownloadUrl(platform) {
    switch (platform) {
        case 'windows':
            return '/files/CRL-Helper-windows.exe';
        case 'macos':
            return '/files/CRL-Helper-macos.zip';
        case 'linux':
            return '/files/CRL-Helper-linux.zip';
        default:
            return '/files/CRL-Helper-linux.zip';
    }
}

/** @param {'windows'|'macos'|'linux'} platform */
function getDownloadUrlFallbacks(platform) {
    const rawBase = 'https://raw.githubusercontent.com/literarum/Copilot-1CO-2.0/main/site';
    if (platform === 'macos') {
        return [
            '/files/CRL-Helper-macos.zip',
            `${rawBase}/files/CRL-Helper-macos.zip`,
            '/downloads/CRL-Helper-macos',
        ];
    }
    if (platform === 'linux') {
        return [
            '/files/CRL-Helper-linux.zip',
            `${rawBase}/files/CRL-Helper-linux.zip`,
            '/downloads/CRL-Helper-linux',
        ];
    }
    return [
        '/files/CRL-Helper-windows.exe',
        `${rawBase}/files/CRL-Helper-windows.exe`,
        '/downloads/CRL-Helper-windows.exe',
    ];
}

/**
 * Guards against false-positive binary headers when server returns HTML fallback.
 * @param {Blob} blob
 * @returns {Promise<boolean>}
 */
async function isHtmlLikeBlob(blob) {
    if (!blob || blob.size === 0) return true;
    const probeText = await blob.slice(0, 1024).text();
    const normalized = probeText.trim().toLowerCase();
    return (
        normalized.startsWith('<!doctype html') ||
        normalized.startsWith('<html') ||
        normalized.includes('<head') ||
        normalized.includes('<body')
    );
}

/**
 * Triggers download of the correct helper binary for the current OS.
 * No new tab; file downloads inline.
 * Returns false if file is unavailable (404/not binary); caller may show notification.
 * @returns {Promise<boolean>} true if download was triggered, false if file unavailable
 */
export async function triggerDownload() {
    const platform = detectDownloadPlatform();
    const urls = getDownloadUrlFallbacks(platform);
    const filename =
        platform === 'windows'
            ? 'CRL-Helper-windows.exe'
            : platform === 'macos'
              ? 'CRL-Helper-macos.zip'
              : 'CRL-Helper-linux.zip';
    // #region agent log
    sendAgentDebugLog({
        runId: 'pre-fix',
        hypothesisId: 'H1',
        location: 'revocation-helper-probe.js:triggerDownload',
        message: 'Download flow started',
        data: {
            platform,
            urls,
            filename,
            origin: typeof window !== 'undefined' ? window.location.origin : '',
        },
    });
    // #endregion

    let resolvedUrl = null;
    let resolvedBlob = null;
    for (const url of urls) {
        const fullUrl = new URL(url, window.location.origin).href;
        let getRes;
        try {
            getRes = await fetch(fullUrl, { method: 'GET', cache: 'no-store' });
        } catch (error) {
            // #region agent log
            sendAgentDebugLog({
                runId: 'pre-fix',
                hypothesisId: 'H3',
                location: 'revocation-helper-probe.js:triggerDownload',
                message: 'Candidate request failed',
                data: {
                    url,
                    fullUrl,
                    errorName: error?.name || 'unknown',
                    errorMessage: error?.message || 'unknown',
                },
            });
            // #endregion
            continue;
        }
        if (!getRes.ok) {
            // #region agent log
            sendAgentDebugLog({
                runId: 'pre-fix',
                hypothesisId: 'H1',
                location: 'revocation-helper-probe.js:triggerDownload',
                message: 'Candidate rejected by HTTP status',
                data: { url, fullUrl, status: getRes.status, ok: getRes.ok },
            });
            // #endregion
            continue;
        }
        const ct = (getRes.headers.get('Content-Type') || '').toLowerCase();
        const cd = (getRes.headers.get('Content-Disposition') || '').toLowerCase();
        const blob = await getRes.blob();
        const snippet = (await blob.slice(0, 120).text()).slice(0, 120);
        // #region agent log
        sendAgentDebugLog({
            runId: 'pre-fix',
            hypothesisId: 'H4',
            location: 'revocation-helper-probe.js:triggerDownload',
            message: 'Candidate payload inspected',
            data: {
                url,
                status: getRes.status,
                contentType: ct,
                contentDisposition: cd,
                size: blob.size,
                snippet,
            },
        });
        // #endregion
        if (ct.includes('text/html') || ct.includes('text/plain')) continue;
        if (await isHtmlLikeBlob(blob)) continue;
        resolvedBlob = blob;
        resolvedUrl = url;
        break;
    }
    if (!resolvedUrl || !resolvedBlob) {
        // #region agent log
        sendAgentDebugLog({
            runId: 'pre-fix',
            hypothesisId: 'H1',
            location: 'revocation-helper-probe.js:triggerDownload',
            message: 'No valid download candidate',
            data: { platform, urls },
        });
        // #endregion
        return null;
    }

    const finalFilename = resolvedUrl.split('/').pop();
    // #region agent log
    sendAgentDebugLog({
        runId: 'pre-fix',
        hypothesisId: 'H4',
        location: 'revocation-helper-probe.js:triggerDownload',
        message: 'Download candidate selected',
        data: { resolvedUrl, filename: finalFilename, size: resolvedBlob.size },
    });
    // #endregion

    const a = document.createElement('a');
    const objectUrl = URL.createObjectURL(resolvedBlob);
    a.href = objectUrl;
    a.download = finalFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
    return finalFilename;
}

/**
 * Returns current cached helper availability (null = unknown, true/false = probed).
 * @returns {boolean|null}
 */
export function isHelperAvailable() {
    return typeof window !== 'undefined' ? window.__revocationHelperAvailable : null;
}
