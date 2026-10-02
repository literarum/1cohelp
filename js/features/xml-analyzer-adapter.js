'use strict';

/**
 * Браузерный адаптер API для анализатора XML (замена Electron API).
 * readFileContent(File) → { data }, parseCertificate(base64) → certObject, exportCertsToZip(certs) → download.
 */

import { describeCertificate, parseCertificateBase64, parseCertificateDer } from './xml-analyzer-crypto.js';
import { buildZipStored } from './xml-analyzer-zip.js';

let jszipPromise = null;

const LIB_LOAD_TIMEOUT_MS = 10000;

/** Динамический импорт с таймаутом (только запасной путь чтения нестандартных ZIP); неудача не кэшируется. */
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

function loadJSZip() {
    return jszipPromise || loadExternalModule('https://esm.sh/jszip@3.10.1', (p) => (jszipPromise = p));
}

/** UTF-16 без BOM: «<\0?\0» или «\0<\0?». */
function sniffUtf16WithoutBom(bytes) {
    if (bytes.length < 4) return null;
    if (bytes[0] === 0x3c && bytes[1] === 0x00 && bytes[2] !== 0x00) return 'utf-16le';
    if (bytes[0] === 0x00 && bytes[1] === 0x3c && bytes[2] === 0x00) return 'utf-16be';
    return null;
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
    if (enc === 'cp1251' || enc === 'cp-1251' || enc === 'win-1251') return 'windows-1251';
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
 * @returns {{text:string, encoding:string, note:string}}
 */
export function decodeBytesDetailed(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'utf-16le', note: '' };
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        return { text: new TextDecoder('utf-16be').decode(bytes), encoding: 'utf-16be', note: '' };
    }
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8', note: '' };
    }
    const sniffed = sniffUtf16WithoutBom(bytes);
    if (sniffed) return { text: new TextDecoder(sniffed).decode(bytes), encoding: sniffed, note: '' };
    const detected = detectXmlEncoding(bytes);
    if (detected && !/^utf-16/.test(detected)) {
        if (detected === 'utf-8') {
            try {
                return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8', note: '' };
            } catch {
                return {
                    text: new TextDecoder('windows-1251').decode(bytes),
                    encoding: 'windows-1251',
                    note: 'В декларации указана кодировка UTF-8, но содержимое ей не соответствует — прочитано как windows-1251.',
                };
            }
        }
        try {
            return { text: new TextDecoder(detected).decode(bytes), encoding: detected, note: '' };
        } catch {
            // падаем в автоопределение ниже
        }
    }
    try {
        return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8', note: '' };
    } catch {
        return {
            text: new TextDecoder('windows-1251').decode(bytes),
            encoding: 'windows-1251',
            note: 'Кодировка не указана и не UTF-8 — файл прочитан как windows-1251.',
        };
    }
}


const MAX_INPUT_FILE_BYTES = 200 * 1024 * 1024;
const MAX_ZIP_ENTRY_BYTES = 200 * 1024 * 1024;
const MAX_ZIP_ENTRIES_LISTED = 300;

/** Бинарный файл: NUL-байты в начале (кроме UTF-16 с BOM). */
function looksLikeBinary(bytes) {
    if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) {
        return false;
    }
    if (sniffUtf16WithoutBom(bytes)) return false;
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

const TEXT_EXT_RE = /\.(xml|json|txt|xsd|xsl|xslt|svg|xbrl|fb2|html?|csv)$/i;

async function entriesFromZipStandalone(zipBuffer) {
    const all = (await listZipEntriesStandalone(zipBuffer)).filter((e) => isUsableZipEntry(e.name, e));
    const xml = all.filter((e) => /\.xml$/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name));
    const json = all.filter((e) => /\.json$/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name));
    const other = all.filter((e) => /\.(txt|xsd|xsl|xslt|xbrl)$/i.test(e.name));
    const picked = [...xml, ...json, ...other].slice(0, MAX_ZIP_ENTRIES_LISTED);
    return picked.map((e) => ({
        name: e.name,
        size: e.size,
        read: async () => {
            if (e.size > MAX_ZIP_ENTRY_BYTES) throw new Error(`Файл ${e.name} в архиве слишком большой`);
            const bytes = await e.read();
            if (looksLikeBinary(bytes)) throw new Error(`Файл ${e.name} не похож на текст/XML`);
            return decodeBytesDetailed(bytes);
        },
    }));
}

async function entriesFromZipJsZip(zipBuffer) {
    let JSZip;
    try {
        JSZip = await loadJSZip();
    } catch {
        throw new Error(
            'Не удалось прочитать архив: он повреждён, зашифрован или использует неподдерживаемый формат (запасной модуль чтения ZIP недоступен без сети). Распакуйте архив и загрузите XML напрямую.',
        );
    }
    let zip;
    try {
        zip = await JSZip.loadAsync(zipBuffer);
    } catch (e) {
        throw new Error(`Ошибка чтения архива: ${e.message}`);
    }
    const names = Object.keys(zip.files)
        .filter((name) => isUsableZipEntry(name, zip.files[name]) && TEXT_EXT_RE.test(name) && /\.(xml|json|txt)$/i.test(name))
        .sort()
        .slice(0, MAX_ZIP_ENTRIES_LISTED);
    return names.map((name) => ({
        name,
        size: zip.files[name]?._data?.uncompressedSize || 0,
        read: async () => {
            const bytes = await zip.files[name].async('arraybuffer');
            if (bytes.byteLength > MAX_ZIP_ENTRY_BYTES) throw new Error(`Файл ${name} в архиве слишком большой`);
            return decodeBytesDetailed(bytes);
        },
    }));
}

/**
 * Читает файл и возвращает список документов: для обычного файла — один, для ZIP — все XML/JSON/TXT внутри.
 * @param {File} file
 * @param {{onProgress?:(ratio:number)=>void}} [opts]
 * @returns {Promise<{error:string}|{entries:Array<{name:string,size:number,read:()=>Promise<{text:string,encoding:string,note:string}>}>}>}
 */
export function readFileEntries(file, opts = {}) {
    if (!file || typeof file.size !== 'number' || typeof file.name !== 'string') {
        return Promise.resolve({ error: 'Не передан объект файла.' });
    }
    if (file.size > MAX_INPUT_FILE_BYTES) {
        return Promise.resolve({ error: 'Файл слишком большой (максимум 200 МБ).' });
    }
    if (file.size === 0) return Promise.resolve({ error: 'Файл пуст.' });
    const isZip = /\.zip$/i.test(file.name);
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onprogress = (e) => {
            if (opts.onProgress && e.lengthComputable) opts.onProgress(e.loaded / e.total);
        };
        reader.onload = async () => {
            try {
                const buf = reader.result;
                if (!(buf instanceof ArrayBuffer)) {
                    resolve({ error: 'Не удалось прочитать файл.' });
                    return;
                }
                const head = new Uint8Array(buf, 0, Math.min(buf.byteLength, 8));
                const looksZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
                if (isZip || looksZip) {
                    let entries;
                    try {
                        entries = await entriesFromZipStandalone(buf);
                    } catch (e) {
                        console.warn('[xml-analyzer-adapter] автономный ZIP не справился, пробуем JSZip:', e.message);
                        try {
                            entries = await entriesFromZipJsZip(buf);
                        } catch (e2) {
                            resolve({ error: e2.message });
                            return;
                        }
                    }
                    if (!entries.length) {
                        resolve({ error: 'В архиве не найдено XML или JSON файлов.' });
                        return;
                    }
                    resolve({ entries });
                    return;
                }
                const bytes = new Uint8Array(buf);
                if (looksLikeBinary(bytes)) {
                    resolve({
                        error: 'Файл не похож на XML/JSON/текст (бинарное содержимое). Поддерживаются .xml, .json, .txt и .zip.',
                    });
                    return;
                }
                resolve({
                    entries: [
                        {
                            name: file.name,
                            size: file.size,
                            read: async () => decodeBytesDetailed(bytes),
                        },
                    ],
                });
            } catch (e) {
                resolve({ error: `Ошибка декодирования: ${e.message}` });
            }
        };
        reader.onerror = () => resolve({ error: 'Ошибка чтения файла.' });
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Совместимый вариант: содержимое первого документа файла/архива.
 * @param {File} file
 * @returns {Promise<{ data: string, encoding?: string, note?: string, name?: string }|{ error: string }>}
 */
export async function readFileContent(file) {
    if (!file || !(file instanceof File)) return { error: 'Не передан объект файла.' };
    const r = await readFileEntries(file);
    if (r.error) return { error: r.error };
    try {
        const d = await r.entries[0].read();
        return { data: d.text, encoding: d.encoding, note: d.note, name: r.entries[0].name };
    } catch (e) {
        return { error: e.message };
    }
}

/**
 * Разбирает сертификат из base64 автономно (без внешних библиотек и сети).
 * @param {string} base64Cert
 */
export async function parseCertificate(base64Cert) {
    if (!base64Cert) return { error: 'Данные сертификата не предоставлены.' };
    try {
        return await parseCertificateBase64(base64Cert);
    } catch (e) {
        return { error: `Не удалось распарсить сертификат: ${e.message}` };
    }
}

/** Совместимость: разбор DER-сертификата (синхронно, без отпечатков). */
export function parseCertificateStandalone(der) {
    return parseCertificateDer(der);
}

/**
 * Собирает сертификаты в ZIP (собственная запись архива) и инициирует скачивание.
 * @param {Array<{ base64: string, fileName: string }>} certsArray
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
export async function exportCertsToZip(certsArray) {
    if (!Array.isArray(certsArray) || certsArray.length === 0) {
        return { success: false, message: 'Нет сертификатов для экспорта.' };
    }
    try {
        const files = [];
        for (const cert of certsArray) {
            if (!cert.base64 || !cert.fileName) continue;
            const binary = atob(String(cert.base64).replace(/\s+/g, ''));
            const arr = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
            files.push({ name: cert.fileName, data: arr });
        }
        if (!files.length) return { success: false, message: 'Нет сертификатов для экспорта.' };
        const blob = new Blob([buildZipStored(files)], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `certificates_${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
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
        readFileEntries: (file, opts) => readFileEntries(file, opts),
        parseCertificate: (base64) => parseCertificate(base64),
        exportCertsToZip: (certs) => exportCertsToZip(certs),
    };
}

export { describeCertificate };
