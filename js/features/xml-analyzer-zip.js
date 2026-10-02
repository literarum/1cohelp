'use strict';

/**
 * Запись ZIP-архива без внешних библиотек (метод «stored», имена в UTF-8).
 * Достаточно для выгрузки сертификатов и экспорта отчётов.
 */

let crcTable = null;

export function crc32(bytes) {
    if (!crcTable) {
        crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            crcTable[n] = c >>> 0;
        }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

/** Делает имена файлов уникальными внутри архива (a.cer, a_2.cer …). */
export function uniqueZipNames(names) {
    const used = new Set();
    return names.map((name) => {
        const safe = String(name || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 150) || 'file';
        let candidate = safe;
        let i = 2;
        const dot = safe.lastIndexOf('.');
        const base = dot > 0 ? safe.slice(0, dot) : safe;
        const ext = dot > 0 ? safe.slice(dot) : '';
        while (used.has(candidate.toLowerCase())) candidate = `${base}_${i++}${ext}`;
        used.add(candidate.toLowerCase());
        return candidate;
    });
}

/**
 * @param {Array<{name:string, data:Uint8Array}>} files
 * @returns {Uint8Array}
 */
export function buildZipStored(files) {
    const enc = new TextEncoder();
    const names = uniqueZipNames(files.map((f) => f.name));
    const parts = [];
    const central = [];
    let offset = 0;
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((Math.max(now.getFullYear(), 1980) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    files.forEach((f, idx) => {
        const nameBytes = enc.encode(names[idx]);
        const data = f.data;
        const crc = crc32(data);
        const local = new Uint8Array(30 + nameBytes.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);
        lv.setUint16(6, 0x800, true);
        lv.setUint16(8, 0, true);
        lv.setUint16(10, dosTime, true);
        lv.setUint16(12, dosDate, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, data.length, true);
        lv.setUint32(22, data.length, true);
        lv.setUint16(26, nameBytes.length, true);
        lv.setUint16(28, 0, true);
        local.set(nameBytes, 30);
        parts.push(local, data);
        const cd = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(cd.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint16(8, 0x800, true);
        cv.setUint16(10, 0, true);
        cv.setUint16(12, dosTime, true);
        cv.setUint16(14, dosDate, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, data.length, true);
        cv.setUint32(24, data.length, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint32(42, offset, true);
        cd.set(nameBytes, 46);
        central.push(cd);
        offset += local.length + data.length;
    });
    const cdSize = central.reduce((s, c) => s + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    const total = offset + cdSize + 22;
    const out = new Uint8Array(total);
    let p = 0;
    for (const part of [...parts, ...central, end]) {
        out.set(part, p);
        p += part.length;
    }
    return out;
}
