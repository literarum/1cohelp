'use strict';

/**
 * Браузерный адаптер API для анализатора XML (замена Electron API).
 * readFileContent(File) → { data }, parseCertificate(base64) → certObject, exportCertsToZip(certs) → download.
 */

let forgePromise = null;
let jszipPromise = null;

function loadForge() {
    if (!forgePromise) {
        forgePromise = import('https://esm.sh/node-forge@1.3.1').then((m) => m.default);
    }
    return forgePromise;
}

function loadJSZip() {
    if (!jszipPromise) {
        jszipPromise = import('https://esm.sh/jszip@3.10.1').then((m) => m.default);
    }
    return jszipPromise;
}

/**
 * Определяет кодировку из XML-декларации в первых байтах (Latin-1 для поиска).
 * @param {Uint8Array} bytes - первые байты файла
 * @returns {string|null} - 'windows-1251', 'cp1251', 'utf-8' или null (по умолчанию UTF-8)
 */
function detectXmlEncoding(bytes) {
    if (!bytes || bytes.length < 20) return null;
    const head = String.fromCharCode.apply(null, bytes.subarray(0, Math.min(600, bytes.length)));
    const m = head.match(/encoding\s*=\s*["']([^"']+)["']/i);
    if (!m) return null;
    const enc = (m[1] || '').trim().toLowerCase();
    if (enc === 'windows-1251' || enc === 'cp1251') return 'windows-1251';
    if (enc === 'utf-8' || enc === 'utf8') return 'utf-8';
    return null;
}

/**
 * Декодирует байты в строку с учётом XML-декларации encoding.
 * @param {ArrayBuffer|Uint8Array} buf - сырые байты
 * @returns {string}
 */
function decodeBytesToXmlString(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let encoding = 'UTF-8';
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        encoding = 'UTF-8';
    } else {
        const detected = detectXmlEncoding(bytes);
        if (detected) encoding = detected;
    }
    return new TextDecoder(encoding).decode(bytes);
}

/**
 * Извлекает первый XML (или JSON при отсутствии XML) из архива ZIP.
 * @param {ArrayBuffer} zipBuffer - сырые байты ZIP
 * @returns {Promise<{ data: string }|{ error: string }>}
 */
async function extractXmlFromZip(zipBuffer) {
    const JSZip = await loadJSZip();
    let zip;
    try {
        zip = await JSZip.loadAsync(zipBuffer);
    } catch (e) {
        return { error: `Ошибка чтения архива: ${e.message}` };
    }
    const xmlFiles = Object.keys(zip.files)
        .filter((name) => /\.xml$/i.test(name) && !zip.files[name].dir)
        .sort();
    const jsonFiles = Object.keys(zip.files)
        .filter((name) => /\.json$/i.test(name) && !zip.files[name].dir)
        .sort();
    const firstXml = xmlFiles[0];
    const firstJson = jsonFiles[0];
    const entryName = firstXml || firstJson;
    if (!entryName) {
        return { error: 'В архиве не найдено XML или JSON файлов.' };
    }
    let entryBytes;
    try {
        entryBytes = await zip.files[entryName].async('arraybuffer');
    } catch (e) {
        return { error: `Ошибка извлечения ${entryName}: ${e.message}` };
    }
    const data = firstXml
        ? decodeBytesToXmlString(entryBytes)
        : new TextDecoder('UTF-8').decode(entryBytes);
    return { data };
}

/**
 * Читает содержимое файла (браузер: File API).
 * Поддерживает .xml, .json, .txt и .zip (извлекает первый XML из архива).
 * Для XML с encoding="windows-1251" автоматически использует правильную кодировку.
 * @param {File} file - объект File из input/drop
 * @returns {Promise<{ data: string }|{ error: string }>}
 */
export function readFileContent(file) {
    if (!file || !(file instanceof File)) {
        return Promise.resolve({ error: 'Не передан объект файла.' });
    }
    const isZip = /\.zip$/i.test(file.name);
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const buf = reader.result;
                if (!(buf instanceof ArrayBuffer)) {
                    resolve({ data: String(buf) });
                    return;
                }
                if (isZip) {
                    const result = await extractXmlFromZip(buf);
                    resolve(result);
                    return;
                }
                const data = decodeBytesToXmlString(buf);
                resolve({ data });
            } catch (e) {
                resolve({ error: `Ошибка декодирования: ${e.message}` });
            }
        };
        reader.onerror = () => resolve({ error: 'Ошибка чтения файла.' });
        reader.readAsArrayBuffer(file);
    });
}

function decodeBestEffort(byteString) {
    if (!byteString || typeof byteString !== 'string') return '';
    const arr = new Uint8Array([...byteString].map((c) => c.charCodeAt(0) & 0xff));
    try {
        const utf8 = new TextDecoder('utf-8').decode(arr);
        if ((utf8.match(/\uFFFD/g) || []).length < 2) return utf8;
    } catch {
        // ignore
    }
    try {
        return new TextDecoder('windows-1251').decode(arr);
    } catch {
        return new TextDecoder('utf-8').decode(arr);
    }
}

function getCertSubject(cert) {
    if (!cert?.subject?.attributes) return {};
    return cert.subject.attributes.reduce((acc, attr) => {
        acc[attr.shortName || attr.type] = attr.value;
        return acc;
    }, {});
}

function getCertIssuer(cert) {
    if (!cert?.issuer?.attributes) return {};
    return cert.issuer.attributes.reduce((acc, attr) => {
        acc[attr.shortName || attr.type] = attr.value;
        return acc;
    }, {});
}

function getCertExtensions(cert) {
    if (!cert?.extensions) return [];
    return cert.extensions.map((ext) => ({
        name: ext.name,
        critical: ext.critical,
        value: ext.value,
        subjectKeyIdentifier:
            ext.name === 'subjectKeyIdentifier' ? ext.subjectKeyIdentifier : undefined,
        authorityKeyIdentifier:
            ext.name === 'authorityKeyIdentifier' ? ext.keyIdentifier : undefined,
    }));
}

function robustParseDate(forge, asn1Date) {
    if (!asn1Date || typeof asn1Date.value !== 'string' || asn1Date.value === '') return null;
    try {
        const type = asn1Date.type;
        let dateStr = asn1Date.value;
        if (type === forge.asn1.Type.UTCTIME) {
            const year = parseInt(dateStr.substring(0, 2), 10);
            dateStr = (year >= 50 ? year + 1900 : year + 2000) + dateStr.substring(2);
        } else if (type !== forge.asn1.Type.GENERALIZEDTIME) {
            return null;
        }
        const isoStr =
            dateStr.substring(0, 4) +
            '-' +
            dateStr.substring(4, 6) +
            '-' +
            dateStr.substring(6, 8) +
            'T' +
            dateStr.substring(8, 10) +
            ':' +
            dateStr.substring(10, 12) +
            ':' +
            dateStr.substring(12, 14) +
            (dateStr.endsWith('Z') ? 'Z' : '');
        const d = new Date(isoStr);
        return isNaN(d.getTime()) ? null : d;
    } catch {
        return null;
    }
}

function extractRdn(forge, sequence) {
    const result = {};
    if (!sequence || sequence.type !== forge.asn1.Type.SEQUENCE) return result;
    const oidNameMap = {
        '2.5.4.3': 'CN',
        '2.5.4.6': 'C',
        '2.5.4.7': 'L',
        '2.5.4.8': 'ST',
        '2.5.4.10': 'O',
        '2.5.4.11': 'OU',
        '2.5.4.4': 'SN',
        '2.5.4.42': 'G',
        '1.2.643.3.131.1.1': 'INN',
        '1.2.643.100.1': 'OGRN',
        '1.2.643.100.3': 'SNILS',
        '1.2.643.100.4': 'OGRNIP',
    };
    for (const set of sequence.value) {
        if (set.type !== forge.asn1.Type.SET) continue;
        for (const attr of set.value) {
            if (attr.type !== forge.asn1.Type.SEQUENCE || attr.value.length < 2) continue;
            const oidNode = attr.value[0];
            const valueNode = attr.value[1];
            if (oidNode.type !== forge.asn1.Type.OID) continue;
            const oid = forge.asn1.derToOid(oidNode.value);
            const strValue = decodeBestEffort(valueNode.value);
            const key = oidNameMap[oid] || oid;
            result[key] = strValue;
        }
    }
    return result;
}

function lightParseCertDetails(forge, derCert) {
    try {
        const asn1 = forge.asn1.fromDer(derCert, false);
        if (asn1.type !== forge.asn1.Type.SEQUENCE || asn1.value.length < 1) {
            throw new Error('Неверная структура сертификата.');
        }
        const tbsCertificate = asn1.value[0];
        if (tbsCertificate.type !== forge.asn1.Type.SEQUENCE)
            throw new Error('TBSCertificate не найден.');
        const tbs = tbsCertificate.value;
        const result = {
            version: 'N/A',
            serialNumber: 'N/A',
            subject: {},
            issuer: {},
            validity: { notBefore: null, notAfter: null },
        };
        let i = 0;
        if (
            i < tbs.length &&
            tbs[i].tagClass === forge.asn1.Class.CONTEXT_SPECIFIC &&
            tbs[i].type === 0
        ) {
            const versionNode = tbs[i].value[0];
            if (versionNode?.type === forge.asn1.Type.INTEGER) {
                result.version = versionNode.value.charCodeAt(0) + 1;
            }
            i++;
        } else {
            result.version = 1;
        }
        if (i < tbs.length && tbs[i].type === forge.asn1.Type.INTEGER) {
            result.serialNumber = forge.util.bytesToHex(tbs[i].value).toUpperCase();
            i++;
        }
        if (i < tbs.length && tbs[i].type === forge.asn1.Type.SEQUENCE) i++;
        if (i < tbs.length && tbs[i].type === forge.asn1.Type.SEQUENCE) {
            result.issuer = extractRdn(forge, tbs[i]);
            i++;
        }
        if (
            i < tbs.length &&
            tbs[i].type === forge.asn1.Type.SEQUENCE &&
            tbs[i].value?.length >= 2
        ) {
            result.validity.notBefore = robustParseDate(forge, tbs[i].value[0]);
            result.validity.notAfter = robustParseDate(forge, tbs[i].value[1]);
            i++;
        }
        if (i < tbs.length && tbs[i].type === forge.asn1.Type.SEQUENCE) {
            result.subject = extractRdn(forge, tbs[i]);
        }
        return result;
    } catch (e) {
        console.warn('[xml-analyzer-adapter] lightParseCertDetails:', e.message);
        return {
            version: 'N/A',
            serialNumber: 'N/A',
            subject: {},
            issuer: {},
            validity: { notBefore: null, notAfter: null },
        };
    }
}

/**
 * Парсит сертификат из base64 (браузер: node-forge).
 * @param {string} base64Cert
 * @returns {Promise<{ thumbprint?, isParsed?, subject?, issuer?, certObject?, error? }>}
 */
export async function parseCertificate(base64Cert) {
    if (!base64Cert) return { error: 'Данные сертификата не предоставлены.' };
    try {
        const forge = await loadForge();
        const derCert = forge.util.decode64(base64Cert);
        const md = forge.md.sha1.create();
        md.update(derCert);
        const thumbprint = md.digest().toHex().toUpperCase();
        try {
            const asn1 = forge.asn1.fromDer(derCert);
            const cert = forge.pki.certificateFromAsn1(asn1);
            const subject = getCertSubject(cert);
            const issuer = getCertIssuer(cert);
            const ownerFio = subject.CN || `${subject.G || ''} ${subject.SN || ''}`.trim();
            return {
                thumbprint,
                isParsed: true,
                version: cert.version + 1,
                serialNumber: cert.serialNumber?.toUpperCase?.() || 'N/A',
                validity: cert.validity,
                subject,
                issuer,
                ownerFio: ownerFio || 'Не удалось извлечь',
                orgName: subject.O || ownerFio || 'Не удалось извлечь',
                extensions: getCertExtensions(cert),
                base64: base64Cert,
                certObject: cert,
                parseError: null,
            };
        } catch {
            const lightData = lightParseCertDetails(forge, derCert);
            if (!lightData.subject || Object.keys(lightData.subject).length === 0) {
                return { error: 'Не удалось распарсить сертификат.' };
            }
            const ownerFio =
                lightData.subject.CN ||
                `${lightData.subject.G || ''} ${lightData.subject.SN || ''}`.trim();
            return {
                thumbprint,
                isParsed: false,
                version: lightData.version,
                serialNumber: lightData.serialNumber,
                validity: lightData.validity || { notBefore: null, notAfter: null },
                subject: lightData.subject,
                issuer: lightData.issuer,
                ownerFio: ownerFio || 'Не удалось извлечь',
                orgName: lightData.subject.O || ownerFio || 'Не удалось извлечь',
                extensions: [],
                base64: base64Cert,
                certObject: null,
            };
        }
    } catch (err) {
        console.error('[xml-analyzer-adapter] parseCertificate:', err);
        return { error: err.message || 'Ошибка обработки сертификата.' };
    }
}

/**
 * Собирает сертификаты в ZIP и инициирует скачивание (браузер: JSZip).
 * @param {Array<{ base64: string, fileName: string }>} certsArray
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
export async function exportCertsToZip(certsArray) {
    if (!Array.isArray(certsArray) || certsArray.length === 0) {
        return { success: false, message: 'Нет сертификатов для экспорта.' };
    }
    try {
        const JSZip = await loadJSZip();
        const zip = new JSZip();
        for (const cert of certsArray) {
            if (cert.base64 && cert.fileName) {
                const binary = atob(cert.base64);
                const arr = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
                zip.file(cert.fileName, arr);
            }
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `certificates_${Date.now()}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        return { success: true };
    } catch (err) {
        console.error('[xml-analyzer-adapter] exportCertsToZip:', err);
        return { success: false, message: err.message };
    }
}

/**
 * Устанавливает глобальный window.electronAPI для анализатора (только методы, используемые в браузере).
 * Вызывать до инициализации анализатора.
 */
export function installBrowserElectronAPI() {
    window.electronAPI = {
        readFileContent: (file) => readFileContent(file),
        parseCertificate: (base64) => parseCertificate(base64),
        exportCertsToZip: (certs) => exportCertsToZip(certs),
    };
}
