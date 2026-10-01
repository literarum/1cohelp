'use strict';

/**
 * Браузерный адаптер API для анализатора XML (замена Electron API).
 * readFileContent(File) → { data }, parseCertificate(base64) → certObject, exportCertsToZip(certs) → download.
 */

let forgePromise = null;
let jszipPromise = null;

const LIB_LOAD_TIMEOUT_MS = 10000;

/** Динамический импорт с таймаутом; неудача не кэшируется (можно повторить после восстановления сети). */
function loadExternalModule(url, assign) {
    const attempt = Promise.race([
        import(url).then((m) => m.default),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Таймаут загрузки ${url}`)), LIB_LOAD_TIMEOUT_MS),
        ),
    ]);
    assign(attempt);
    attempt.catch(() => assign(null));
    return attempt;
}

function loadForge() {
    return forgePromise || loadExternalModule('https://esm.sh/node-forge@1.3.1', (p) => (forgePromise = p));
}

function loadJSZip() {
    return jszipPromise || loadExternalModule('https://esm.sh/jszip@3.10.1', (p) => (jszipPromise = p));
}

/**
 * Определяет кодировку из XML-декларации в первых байтах (Latin-1 для поиска).
 * Возвращает любую метку, которую понимает TextDecoder (windows-1251, koi8-r, utf-16 и т.д.).
 * @param {Uint8Array} bytes - первые байты файла
 * @returns {string|null} - нормализованная метка кодировки или null (по умолчанию UTF-8)
 */
function detectXmlEncoding(bytes) {
    if (!bytes || bytes.length < 20) return null;
    const head = String.fromCharCode.apply(null, bytes.subarray(0, Math.min(600, bytes.length)));
    const m = head.match(/encoding\s*=\s*["']([^"']+)["']/i);
    if (!m) return null;
    const enc = (m[1] || '').trim().toLowerCase();
    if (enc === 'cp1251') return 'windows-1251';
    if (enc === 'utf8') return 'utf-8';
    try {
        new TextDecoder(enc);
        return enc;
    } catch {
        return null;
    }
}

/**
 * Декодирует байты в строку с учётом BOM (UTF-8/UTF-16) и XML-декларации encoding.
 * Без декларации: строгий UTF-8, при невалидных последовательностях — windows-1251
 * (типичный случай старых выгрузок без encoding).
 * @param {ArrayBuffer|Uint8Array} buf - сырые байты
 * @returns {string}
 */
function decodeBytesToXmlString(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        return new TextDecoder('utf-16le').decode(bytes);
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        return new TextDecoder('utf-16be').decode(bytes);
    }
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        return new TextDecoder('utf-8').decode(bytes);
    }
    const detected = detectXmlEncoding(bytes);
    if (detected) {
        try {
            return new TextDecoder(detected).decode(bytes);
        } catch {
            // падаем в автоопределение ниже
        }
    }
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        return new TextDecoder('windows-1251').decode(bytes);
    }
}

const MAX_INPUT_FILE_BYTES = 150 * 1024 * 1024;
const MAX_ZIP_ENTRY_BYTES = 100 * 1024 * 1024;

/** Бинарный файл: NUL-байты в начале (кроме UTF-16 с BOM). */
function looksLikeBinary(bytes) {
    if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) {
        return false;
    }
    const n = Math.min(bytes.length, 4096);
    for (let i = 0; i < n; i++) if (bytes[i] === 0) return true;
    return false;
}

/** Служебные записи архиватора macOS и каталоги пропускаем. */
function isUsableZipEntry(name, entry) {
    if (!entry || entry.dir) return false;
    if (/(^|\/)__MACOSX\//.test(name)) return false;
    if (/(^|\/)\._[^/]*$/.test(name)) return false;
    return true;
}

/**
 * Автономное чтение ZIP без внешних библиотек (методы 0 «stored» и 8 «deflate»).
 * Использует встроенный DecompressionStream('deflate-raw').
 * @param {ArrayBuffer} zipBuffer
 * @returns {Promise<Array<{name:string, size:number, read:()=>Promise<Uint8Array>}>>}
 * @throws {Error} при неподдерживаемом формате (ZIP64, шифрование, иной метод сжатия) — вызывающий код откатывается на JSZip.
 */
export async function listZipEntriesStandalone(zipBuffer) {
    const bytes = new Uint8Array(zipBuffer);
    const view = new DataView(zipBuffer);
    if (typeof DecompressionStream !== 'function') throw new Error('DecompressionStream недоступен');
    // End Of Central Directory: сигнатура 0x06054b50, ищем с конца (комментарий ≤ 65535 байт).
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
        if (view.getUint32(i, true) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new Error('Не найден конец центрального каталога ZIP');
    const total = view.getUint16(eocd + 10, true);
    let cdOffset = view.getUint32(eocd + 16, true);
    if (total === 0xffff || cdOffset === 0xffffffff) throw new Error('ZIP64 не поддерживается');
    const decoder = new TextDecoder('utf-8');
    const entries = [];
    for (let n = 0; n < total; n++) {
        if (cdOffset + 46 > bytes.length || view.getUint32(cdOffset, true) !== 0x02014b50) {
            throw new Error('Повреждён центральный каталог ZIP');
        }
        const flags = view.getUint16(cdOffset + 8, true);
        const method = view.getUint16(cdOffset + 10, true);
        const compSize = view.getUint32(cdOffset + 20, true);
        const size = view.getUint32(cdOffset + 24, true);
        const nameLen = view.getUint16(cdOffset + 28, true);
        const extraLen = view.getUint16(cdOffset + 30, true);
        const commentLen = view.getUint16(cdOffset + 32, true);
        const localOffset = view.getUint32(cdOffset + 42, true);
        const rawName = bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen);
        const name =
            flags & 0x800 ? decoder.decode(rawName) : new TextDecoder('windows-1251').decode(rawName);
        cdOffset += 46 + nameLen + extraLen + commentLen;
        const isDir = name.endsWith('/');
        entries.push({
            name,
            size,
            dir: isDir,
            read: async () => {
                if (flags & 1) throw new Error('Архив зашифрован');
                if (view.getUint32(localOffset, true) !== 0x04034b50) {
                    throw new Error('Повреждён локальный заголовок ZIP');
                }
                const start =
                    localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
                const data = bytes.subarray(start, start + compSize);
                if (method === 0) return data;
                if (method !== 8) throw new Error(`Метод сжатия ${method} не поддерживается`);
                if (size > MAX_ZIP_ENTRY_BYTES) throw new Error('Файл в архиве слишком большой');
                const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
                const out = new Uint8Array(await new Response(stream).arrayBuffer());
                if (out.length > MAX_ZIP_ENTRY_BYTES) throw new Error('Файл в архиве слишком большой');
                return out;
            },
        });
    }
    return entries;
}

async function extractXmlFromZipStandalone(zipBuffer) {
    const entries = (await listZipEntriesStandalone(zipBuffer)).filter((e) => isUsableZipEntry(e.name, e));
    const byExt = (re) => entries.filter((e) => re.test(e.name)).sort((a, b) => a.name.localeCompare(b.name));
    const firstXml = byExt(/\.xml$/i)[0];
    const entry = firstXml || byExt(/\.json$/i)[0];
    if (!entry) return { error: 'В архиве не найдено XML или JSON файлов.' };
    if (entry.size > MAX_ZIP_ENTRY_BYTES) return { error: `Файл ${entry.name} в архиве слишком большой (> 100 МБ).` };
    return { data: decodeBytesToXmlString(await entry.read()) };
}

/**
 * Извлекает первый XML (или JSON при отсутствии XML) из архива ZIP.
 * @param {ArrayBuffer} zipBuffer - сырые байты ZIP
 * @returns {Promise<{ data: string }|{ error: string }>}
 */
async function extractXmlFromZip(zipBuffer) {
    try {
        return await extractXmlFromZipStandalone(zipBuffer);
    } catch (e) {
        console.warn('[xml-analyzer-adapter] автономный ZIP не справился, пробуем JSZip:', e.message);
    }
    let JSZip;
    try {
        JSZip = await loadJSZip();
    } catch {
        return {
            error: 'Не удалось прочитать архив: он повреждён, зашифрован или использует неподдерживаемый формат (запасной модуль чтения ZIP недоступен без сети). Распакуйте архив и загрузите XML напрямую.',
        };
    }
    let zip;
    try {
        zip = await JSZip.loadAsync(zipBuffer);
    } catch (e) {
        return { error: `Ошибка чтения архива: ${e.message}` };
    }
    const xmlFiles = Object.keys(zip.files)
        .filter((name) => isUsableZipEntry(name, zip.files[name]) && /\.xml$/i.test(name))
        .sort();
    const jsonFiles = Object.keys(zip.files)
        .filter((name) => isUsableZipEntry(name, zip.files[name]) && /\.json$/i.test(name))
        .sort();
    const firstXml = xmlFiles[0];
    const firstJson = jsonFiles[0];
    const entryName = firstXml || firstJson;
    if (!entryName) {
        return { error: 'В архиве не найдено XML или JSON файлов.' };
    }
    const declaredSize = zip.files[entryName]?._data?.uncompressedSize;
    if (typeof declaredSize === 'number' && declaredSize > MAX_ZIP_ENTRY_BYTES) {
        return { error: `Файл ${entryName} в архиве слишком большой (> 100 МБ).` };
    }
    let entryBytes;
    try {
        entryBytes = await zip.files[entryName].async('arraybuffer');
        if (entryBytes.byteLength > MAX_ZIP_ENTRY_BYTES) {
            return { error: `Файл ${entryName} в архиве слишком большой (> 100 МБ).` };
        }
    } catch (e) {
        return { error: `Ошибка извлечения ${entryName}: ${e.message}` };
    }
    const data = firstXml
        ? decodeBytesToXmlString(entryBytes)
        : decodeBytesToXmlString(entryBytes);
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
    if (file.size > MAX_INPUT_FILE_BYTES) {
        return Promise.resolve({ error: 'Файл слишком большой (максимум 150 МБ).' });
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
                if (looksLikeBinary(new Uint8Array(buf))) {
                    resolve({
                        error: 'Файл не похож на XML/JSON/текст (бинарное содержимое). Поддерживаются .xml, .json, .txt и .zip.',
                    });
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


// ---------- Автономный (без внешних библиотек) разбор сертификата X.509 ----------
// Используется, когда node-forge не загрузился (офлайн): даёт отпечаток, серийный номер,
// срок действия, субъекта и издателя — всё, что нужно для отчёта по XML.

const OID_NAMES = {
    '2.5.4.3': 'CN',
    '2.5.4.6': 'C',
    '2.5.4.7': 'L',
    '2.5.4.8': 'ST',
    '2.5.4.10': 'O',
    '2.5.4.11': 'OU',
    '2.5.4.4': 'SN',
    '2.5.4.42': 'G',
    '2.5.4.12': 'T',
    '1.2.643.3.131.1.1': 'INN',
    '1.2.643.100.1': 'OGRN',
    '1.2.643.100.3': 'SNILS',
    '1.2.643.100.4': 'OGRNIP',
};

function readDer(bytes, pos) {
    if (pos + 2 > bytes.length) throw new Error('DER: обрыв данных');
    const tag = bytes[pos];
    let len = bytes[pos + 1];
    let hdr = 2;
    if (len & 0x80) {
        const n = len & 0x7f;
        if (n < 1 || n > 4 || pos + 2 + n > bytes.length) throw new Error('DER: некорректная длина');
        len = 0;
        for (let i = 0; i < n; i++) len = len * 256 + bytes[pos + 2 + i];
        hdr += n;
    }
    const start = pos + hdr;
    const end = start + len;
    if (end > bytes.length) throw new Error('DER: длина выходит за пределы');
    return { tag, start, end };
}

function derChildren(bytes, node) {
    const out = [];
    let pos = node.start;
    while (pos < node.end) {
        const child = readDer(bytes, pos);
        out.push(child);
        pos = child.end;
    }
    return out;
}

function derOidToString(bytes, node) {
    const b = bytes.subarray(node.start, node.end);
    if (!b.length) return '';
    const parts = [Math.floor(b[0] / 40), b[0] % 40];
    let v = 0;
    for (let i = 1; i < b.length; i++) {
        v = v * 128 + (b[i] & 0x7f);
        if (!(b[i] & 0x80)) {
            parts.push(v);
            v = 0;
        }
    }
    return parts.join('.');
}

function derStringValue(bytes, node) {
    const raw = bytes.subarray(node.start, node.end);
    // 0x0C UTF8String, 0x13 PrintableString, 0x16 IA5String, 0x1E BMPString, 0x14 T61String
    if (node.tag === 0x1e) return new TextDecoder('utf-16be').decode(raw);
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(raw);
    } catch {
        return new TextDecoder('windows-1251').decode(raw);
    }
}

function derName(bytes, node) {
    const result = {};
    for (const set of derChildren(bytes, node)) {
        for (const attr of derChildren(bytes, set)) {
            const [oidNode, valNode] = derChildren(bytes, attr);
            if (!oidNode || !valNode || oidNode.tag !== 0x06) continue;
            const oid = derOidToString(bytes, oidNode);
            result[OID_NAMES[oid] || oid] = derStringValue(bytes, valNode);
        }
    }
    return result;
}

function derTime(bytes, node) {
    const str = String.fromCharCode(...bytes.subarray(node.start, node.end));
    let m;
    if (node.tag === 0x17) {
        m = str.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/);
        if (!m) return null;
        const yy = parseInt(m[1], 10);
        m[1] = String(yy >= 50 ? 1900 + yy : 2000 + yy);
    } else if (node.tag === 0x18) {
        m = str.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/);
        if (!m) return null;
    } else {
        return null;
    }
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
    return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {Uint8Array} der
 * @returns {{version:number, serialNumber:string, subject:object, issuer:object, validity:{notBefore:Date|null,notAfter:Date|null}}}
 */
export function parseCertificateStandalone(der) {
    const cert = readDer(der, 0);
    if (cert.tag !== 0x30) throw new Error('Неверная структура сертификата.');
    const tbs = derChildren(der, cert)[0];
    if (!tbs || tbs.tag !== 0x30) throw new Error('TBSCertificate не найден.');
    const f = derChildren(der, tbs);
    let i = 0;
    let version = 1;
    if (f[i] && f[i].tag === 0xa0) {
        const v = derChildren(der, f[i])[0];
        if (v && v.tag === 0x02) version = der[v.start + (v.end - v.start) - 1] + 1;
        i++;
    }
    const serial = f[i++];
    i++; // signature algorithm
    const issuer = f[i++];
    const validity = f[i++];
    const subject = f[i++];
    if (!serial || !issuer || !validity || !subject) throw new Error('Неполный сертификат.');
    const [nb, na] = derChildren(der, validity);
    return {
        version,
        serialNumber: Array.from(der.subarray(serial.start, serial.end))
            .map((x) => x.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase(),
        issuer: derName(der, issuer),
        subject: derName(der, subject),
        validity: { notBefore: nb ? derTime(der, nb) : null, notAfter: na ? derTime(der, na) : null },
    };
}

async function sha1HexUpper(bytes) {
    const digest = await crypto.subtle.digest('SHA-1', bytes);
    return Array.from(new Uint8Array(digest))
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
}

async function parseCertificateWithoutForge(base64Cert) {
    const bin = atob(base64Cert.replace(/\s+/g, ''));
    const der = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
    const info = parseCertificateStandalone(der);
    const ownerFio = info.subject.CN || `${info.subject.G || ''} ${info.subject.SN || ''}`.trim();
    return {
        thumbprint: await sha1HexUpper(der),
        isParsed: false,
        version: info.version,
        serialNumber: info.serialNumber,
        validity: info.validity,
        subject: info.subject,
        issuer: info.issuer,
        ownerFio: ownerFio || 'Не удалось извлечь',
        orgName: info.subject.O || ownerFio || 'Не удалось извлечь',
        extensions: [],
        base64: base64Cert,
        certObject: null,
    };
}

/**
 * Парсит сертификат из base64 (браузер: node-forge).
 * @param {string} base64Cert
 * @returns {Promise<{ thumbprint?, isParsed?, subject?, issuer?, certObject?, error? }>}
 */
export async function parseCertificate(base64Cert) {
    if (!base64Cert) return { error: 'Данные сертификата не предоставлены.' };
    let forge;
    try {
        forge = await loadForge();
    } catch {
        // node-forge недоступен (офлайн) — автономный разбор без внешних библиотек.
        try {
            return await parseCertificateWithoutForge(base64Cert);
        } catch (e) {
            return { error: `Не удалось распарсить сертификат: ${e.message}` };
        }
    }
    try {
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
