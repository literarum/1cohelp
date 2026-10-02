'use strict';

/**
 * Автономный (без внешних библиотек) разбор сертификатов X.509, контейнеров CMS (PKCS#7 SignedData)
 * и поиск подписей XMLDSig/сертификатов в любом XML-документе.
 */

import { NODE_KIND } from './xml-analyzer-model.js';

// ---------------------------------------------------------------------------
// DER
// ---------------------------------------------------------------------------

export function readDer(bytes, pos, limit = bytes.length) {
    if (pos + 2 > limit) throw new Error('DER: обрыв данных');
    const tag = bytes[pos];
    let len = bytes[pos + 1];
    let hdr = 2;
    if (len & 0x80) {
        const n = len & 0x7f;
        if (n < 1 || n > 4 || pos + 2 + n > limit) throw new Error('DER: некорректная длина');
        len = 0;
        for (let i = 0; i < n; i++) len = len * 256 + bytes[pos + 2 + i];
        hdr += n;
    }
    const start = pos + hdr;
    const end = start + len;
    if (end > limit) throw new Error('DER: длина выходит за пределы');
    return { tag, start, end, pos };
}

export function derChildren(bytes, node) {
    const out = [];
    let pos = node.start;
    while (pos < node.end) {
        const c = readDer(bytes, pos, node.end);
        out.push(c);
        pos = c.end;
    }
    return out;
}

export function derOid(bytes, node) {
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

function derString(bytes, node) {
    const raw = bytes.subarray(node.start, node.end);
    if (node.tag === 0x1e) return new TextDecoder('utf-16be').decode(raw);
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(raw);
    } catch {
        return new TextDecoder('windows-1251').decode(raw);
    }
}

function hex(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
    return s.toUpperCase();
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
    } else return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
    return Number.isNaN(d.getTime()) ? null : d;
}

export const OID_NAMES = {
    '2.5.4.3': 'CN',
    '2.5.4.6': 'C',
    '2.5.4.7': 'L',
    '2.5.4.8': 'ST',
    '2.5.4.9': 'STREET',
    '2.5.4.10': 'O',
    '2.5.4.11': 'OU',
    '2.5.4.4': 'SN',
    '2.5.4.42': 'G',
    '2.5.4.12': 'T',
    '1.2.840.113549.1.9.1': 'E',
    '1.2.643.3.131.1.1': 'INN',
    '1.2.643.100.1': 'OGRN',
    '1.2.643.100.3': 'SNILS',
    '1.2.643.100.4': 'INNLE',
    '1.2.643.100.5': 'OGRNIP',
    '1.2.643.100.2.1': 'IdentificationKind',
};

export const ALG_NAMES = {
    '1.2.840.113549.1.1.1': 'RSA',
    '1.2.840.113549.1.1.5': 'RSA + SHA-1',
    '1.2.840.113549.1.1.11': 'RSA + SHA-256',
    '1.2.840.113549.1.1.12': 'RSA + SHA-384',
    '1.2.840.113549.1.1.13': 'RSA + SHA-512',
    '1.2.840.10045.2.1': 'ECDSA',
    '1.2.840.10045.4.3.2': 'ECDSA + SHA-256',
    '1.3.14.3.2.26': 'SHA-1',
    '2.16.840.1.101.3.4.2.1': 'SHA-256',
    '2.16.840.1.101.3.4.2.2': 'SHA-384',
    '2.16.840.1.101.3.4.2.3': 'SHA-512',
    '1.2.643.7.1.1.1.1': 'ГОСТ Р 34.10-2012 (256 бит)',
    '1.2.643.7.1.1.1.2': 'ГОСТ Р 34.10-2012 (512 бит)',
    '1.2.643.7.1.1.3.2': 'ГОСТ Р 34.10-2012 / Стрибог-256',
    '1.2.643.7.1.1.3.3': 'ГОСТ Р 34.10-2012 / Стрибог-512',
    '1.2.643.7.1.1.2.2': 'Стрибог-256 (ГОСТ Р 34.11-2012)',
    '1.2.643.7.1.1.2.3': 'Стрибог-512 (ГОСТ Р 34.11-2012)',
    '1.2.643.2.2.19': 'ГОСТ Р 34.10-2001',
    '1.2.643.2.2.3': 'ГОСТ Р 34.10-2001 / ГОСТ Р 34.11-94',
    '1.2.643.2.2.9': 'ГОСТ Р 34.11-94',
    '1.2.643.2.2.20': 'ГОСТ Р 34.10-94',
};

const EKU_NAMES = {
    '1.3.6.1.5.5.7.3.1': 'Проверка подлинности сервера',
    '1.3.6.1.5.5.7.3.2': 'Проверка подлинности клиента',
    '1.3.6.1.5.5.7.3.3': 'Подписывание кода',
    '1.3.6.1.5.5.7.3.4': 'Защищённая электронная почта',
    '1.3.6.1.5.5.7.3.8': 'Штамп времени',
    '1.3.6.1.5.5.7.3.9': 'Подписывание OCSP',
};

const KEY_USAGE = [
    'Цифровая подпись',
    'Неотрекаемость',
    'Шифрование ключей',
    'Шифрование данных',
    'Согласование ключей',
    'Подпись сертификатов',
    'Подпись CRL',
    'Только шифрование',
    'Только расшифрование',
];

function derName(bytes, node) {
    const result = {};
    for (const set of derChildren(bytes, node)) {
        for (const attr of derChildren(bytes, set)) {
            const [oidNode, valNode] = derChildren(bytes, attr);
            if (!oidNode || !valNode || oidNode.tag !== 0x06) continue;
            const oid = derOid(bytes, oidNode);
            const key = OID_NAMES[oid] || oid;
            const val = derString(bytes, valNode);
            result[key] = key in result ? result[key] + '; ' + val : val;
        }
    }
    return result;
}

function algName(bytes, algNode) {
    try {
        const [oid] = derChildren(bytes, algNode);
        const o = derOid(bytes, oid);
        return { oid: o, name: ALG_NAMES[o] || o };
    } catch {
        return { oid: '', name: '' };
    }
}

function parseExtensions(bytes, extsNode) {
    const out = [];
    let seq;
    try {
        seq = derChildren(bytes, extsNode)[0];
    } catch {
        return out;
    }
    if (!seq) return out;
    for (const ext of derChildren(bytes, seq)) {
        try {
            const f = derChildren(bytes, ext);
            const oid = derOid(bytes, f[0]);
            let critical = false;
            let valNode = f[1];
            if (f[1].tag === 0x01) {
                critical = bytes[f[1].start] !== 0;
                valNode = f[2];
            }
            const inner = valNode && valNode.tag === 0x04 ? readDer(bytes, valNode.start, valNode.end) : null;
            const item = { oid, critical, name: oid };
            if (oid === '2.5.29.15' && inner && inner.tag === 0x03) {
                const unused = bytes[inner.start];
                const bits = bytes.subarray(inner.start + 1, inner.end);
                const list = [];
                for (let i = 0; i < KEY_USAGE.length; i++) {
                    const byte = bits[i >> 3];
                    if (byte !== undefined && (byte & (0x80 >> (i & 7))) && !((i >> 3) === bits.length - 1 && (i & 7) >= 8 - unused)) {
                        list.push(KEY_USAGE[i]);
                    }
                }
                item.name = 'keyUsage';
                item.keyUsage = list;
            } else if (oid === '2.5.29.37' && inner) {
                item.name = 'extKeyUsage';
                item.extKeyUsage = derChildren(bytes, inner).map((o) => {
                    const id = derOid(bytes, o);
                    return EKU_NAMES[id] || id;
                });
            } else if (oid === '2.5.29.14' && inner) {
                item.name = 'subjectKeyIdentifier';
                const o = readDer(bytes, inner.start, inner.end);
                item.subjectKeyIdentifier = hex(bytes.subarray(o.start, o.end));
            } else if (oid === '2.5.29.35' && inner) {
                item.name = 'authorityKeyIdentifier';
                const kids = derChildren(bytes, inner);
                const k = kids.find((x) => x.tag === 0x80);
                if (k) item.keyIdentifier = hex(bytes.subarray(k.start, k.end));
            } else if (oid === '2.5.29.19' && inner) {
                item.name = 'basicConstraints';
                const kids = derChildren(bytes, inner);
                item.cA = kids.length > 0 && kids[0].tag === 0x01 && bytes[kids[0].start] !== 0;
            } else if (oid === '2.5.29.31' && inner) {
                item.name = 'cRLDistributionPoints';
                const ascii = String.fromCharCode(...bytes.subarray(inner.start, inner.end));
                item.urls = ascii.match(/https?:\/\/[\x21-\x7e]+/gi) || [];
            }
            out.push(item);
        } catch {
            // пропускаем повреждённое расширение
        }
    }
    return out;
}

/**
 * Разбор DER-сертификата X.509.
 * @param {Uint8Array} der
 */
export function parseCertificateDer(der) {
    const cert = readDer(der, 0);
    if (cert.tag !== 0x30) throw new Error('Неверная структура сертификата.');
    const top = derChildren(der, cert);
    const tbs = top[0];
    if (!tbs || tbs.tag !== 0x30) throw new Error('TBSCertificate не найден.');
    const f = derChildren(der, tbs);
    let i = 0;
    let version = 1;
    if (f[i] && f[i].tag === 0xa0) {
        const v = derChildren(der, f[i])[0];
        if (v && v.tag === 0x02) version = der[v.end - 1] + 1;
        i++;
    }
    const serial = f[i++];
    const sigAlg = f[i++];
    const issuer = f[i++];
    const validity = f[i++];
    const subject = f[i++];
    const spki = f[i++];
    if (!serial || serial.tag !== 0x02 || !issuer || !validity || !subject) throw new Error('Неполный сертификат.');
    if (validity.tag !== 0x30 || issuer.tag !== 0x30 || subject.tag !== 0x30) throw new Error('Некорректная структура сертификата.');
    const [nb, na] = derChildren(der, validity);
    const extNode = f.slice(i).find((x) => x.tag === 0xa3);
    return {
        version,
        serialNumber: hex(der.subarray(serial.start, serial.end)),
        signatureAlgorithm: sigAlg ? algName(der, sigAlg) : { oid: '', name: '' },
        publicKeyAlgorithm: spki ? algName(der, derChildren(der, spki)[0]) : { oid: '', name: '' },
        issuer: derName(der, issuer),
        subject: derName(der, subject),
        validity: { notBefore: nb ? derTime(der, nb) : null, notAfter: na ? derTime(der, na) : null },
        extensions: extNode ? parseExtensions(der, extNode) : [],
    };
}

async function digestHex(algo, bytes) {
    const d = await crypto.subtle.digest(algo, bytes);
    return hex(new Uint8Array(d));
}

export function base64ToBytes(b64) {
    const clean = String(b64)
        .replace(/-----(BEGIN|END)[^-]*-----/g, '')
        .replace(/[\s\r\n]+/g, '')
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    if (!clean || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) return null;
    const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4);
    let bin;
    try {
        bin = atob(padded);
    } catch {
        return null;
    }
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

export function bytesToBase64(bytes) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
}

/** Сертификат в формате, совместимом с остальным анализатором. */
export async function describeCertificate(der, base64) {
    const info = parseCertificateDer(der);
    const ownerFio = info.subject.CN || `${info.subject.G || ''} ${info.subject.SN || ''}`.trim();
    const b64 = base64 || bytesToBase64(der);
    return {
        thumbprint: await digestHex('SHA-1', der),
        thumbprintSha256: await digestHex('SHA-256', der),
        isParsed: false,
        version: info.version,
        serialNumber: info.serialNumber,
        validity: info.validity,
        subject: info.subject,
        issuer: info.issuer,
        signatureAlgorithm: info.signatureAlgorithm,
        publicKeyAlgorithm: info.publicKeyAlgorithm,
        ownerFio: ownerFio || 'Не удалось извлечь',
        orgName: info.subject.O || ownerFio || 'Не удалось извлечь',
        extensions: info.extensions,
        selfSigned: JSON.stringify(info.subject) === JSON.stringify(info.issuer),
        base64: b64,
        certObject: null,
    };
}

export async function parseCertificateBase64(b64) {
    const der = base64ToBytes(b64);
    if (!der || der.length < 20) throw new Error('Данные не похожи на сертификат (не base64).');
    return describeCertificate(der, String(b64).replace(/\s+/g, ''));
}

const OID_SIGNED_DATA = '1.2.840.113549.1.7.2';
const OID_SIGNING_TIME = '1.2.840.113549.1.9.5';

/**
 * Разбор контейнера CMS SignedData (отсоединённая/присоединённая подпись).
 * @returns {Promise<{signers:Array, certs:Array, detached:boolean, digestAlgorithms:string[]}>}
 */
export async function parseCms(der) {
    const top = readDer(der, 0);
    if (top.tag !== 0x30) throw new Error('Не CMS');
    const [oidNode, explicit] = derChildren(der, top);
    if (!oidNode || oidNode.tag !== 0x06 || derOid(der, oidNode) !== OID_SIGNED_DATA || !explicit || explicit.tag !== 0xa0) {
        throw new Error('Не CMS SignedData');
    }
    const sd = derChildren(der, explicit)[0];
    const parts = derChildren(der, sd);
    // [0]=version, [1]=digestAlgorithms SET, [2]=encapContentInfo, затем необязательные [0] certs, [1] crls, signerInfos SET
    const digestAlgs = parts[1] ? derChildren(der, parts[1]).map((a) => algName(der, a).name) : [];
    const encap = parts[2];
    const detached = encap ? derChildren(der, encap).length < 2 : true;
    const certsNode = parts.find((p) => p.tag === 0xa0);
    const signersNode = [...parts].reverse().find((p) => p.tag === 0x31);
    const certs = [];
    if (certsNode) {
        for (const c of derChildren(der, certsNode)) {
            if (c.tag !== 0x30) continue;
            try {
                const certBytes = der.subarray(c.pos, c.end);
                certs.push(await describeCertificate(certBytes));
            } catch (e) {
                certs.push({ error: e.message });
            }
        }
    }
    const signers = [];
    if (signersNode) {
        for (const s of derChildren(der, signersNode)) {
            try {
                const f = derChildren(der, s);
                const sid = f[1];
                let signer = {};
                if (sid && sid.tag === 0x30) {
                    const [iss, ser] = derChildren(der, sid);
                    signer = {
                        issuer: iss ? derName(der, iss) : {},
                        serialNumber: ser ? hex(der.subarray(ser.start, ser.end)) : '',
                    };
                }
                signer.digestAlgorithm = f[2] ? algName(der, f[2]).name : '';
                const attrs = f.find((x) => x.tag === 0xa0);
                if (attrs) {
                    for (const a of derChildren(der, attrs)) {
                        const [o, setNode] = derChildren(der, a);
                        if (o && derOid(der, o) === OID_SIGNING_TIME && setNode) {
                            const t = derChildren(der, setNode)[0];
                            if (t) signer.signingTime = derTime(der, t);
                        }
                    }
                }
                const sigAlgIdx = f.findIndex((x, idx) => idx >= 3 && x.tag === 0x30);
                if (sigAlgIdx > 0) signer.signatureAlgorithm = algName(der, f[sigAlgIdx]).name;
                signers.push(signer);
            } catch {
                signers.push({ error: 'не удалось разобрать SignerInfo' });
            }
        }
    }
    return { signers, certs, detached, digestAlgorithms: digestAlgs };
}

/**
 * Определяет содержимое двоичного блока: сертификат, CMS или неизвестное.
 */
export async function analyzeBlob(bytes) {
    if (!bytes || bytes.length < 16 || bytes[0] !== 0x30) return { type: 'unknown' };
    try {
        const cms = await parseCms(bytes);
        return { type: 'cms', cms };
    } catch {
        // не CMS
    }
    try {
        const cert = await describeCertificate(bytes);
        return { type: 'certificate', cert };
    } catch {
        return { type: 'unknown' };
    }
}

// ---------------------------------------------------------------------------
// Статус срока действия
// ---------------------------------------------------------------------------

/**
 * @returns {{state:'valid'|'expired'|'notyet'|'soon'|'unknown', days:number|null, label:string}}
 */
export function certValidityState(validity, now = new Date(), soonDays = 30) {
    const nb = validity && validity.notBefore ? new Date(validity.notBefore) : null;
    const na = validity && validity.notAfter ? new Date(validity.notAfter) : null;
    if (!na || Number.isNaN(na.getTime())) return { state: 'unknown', days: null, label: 'срок действия неизвестен' };
    const fmt = (d) => d.toLocaleDateString('ru-RU');
    if (nb && !Number.isNaN(nb.getTime()) && now < nb) {
        return { state: 'notyet', days: Math.ceil((nb - now) / 86400000), label: `ещё не действует (с ${fmt(nb)})` };
    }
    const days = Math.ceil((na - now) / 86400000);
    if (days < 0) return { state: 'expired', days, label: `истёк ${fmt(na)} (${-days} дн. назад)` };
    if (days <= soonDays) return { state: 'soon', days, label: `истекает ${fmt(na)} (через ${days} дн.)` };
    return { state: 'valid', days, label: `действует до ${fmt(na)}` };
}

// ---------------------------------------------------------------------------
// Поиск подписей и сертификатов в XML-документе
// ---------------------------------------------------------------------------

const B64_LIKE = /^[A-Za-z0-9+/_\-\s=]+$/;
const NAME_HINT = /(signature|sign|подпис|эп$|эцп|cert|сертификат|cms|p7|pkcs|ключпровер|x509)/i;

function subtreeFind(doc, root, localName) {
    const out = [];
    const end = root + doc.sub[root];
    for (let i = root; i <= end; i++) {
        if (doc.kind[i] === NODE_KIND.ELEMENT && doc.localName(i) === localName) out.push(i);
    }
    return out;
}

/**
 * Ищет в документе подписи XMLDSig, сертификаты и CMS-контейнеры (любой корень, любые пространства имён).
 * @param {import('./xml-analyzer-model.js').XmlDoc} doc
 * @returns {Promise<{signatures:Array, certificates:Array, cms:Array, blobs:number, issues:string[]}>}
 */
export async function findSignatures(doc, { maxBlobs = 200, maxBlobChars = 6_000_000 } = {}) {
    const result = { signatures: [], certificates: [], cms: [], blobs: 0, issues: [] };
    const seen = new Set();
    const keyOf = (b64) => b64.length + ':' + b64.slice(0, 40) + b64.slice(-40);

    // 1) XMLDSig: элементы Signature, внутри которых есть SignedInfo
    const sigNodes = [];
    for (let i = 1; i < doc.n; i++) {
        if (doc.kind[i] === NODE_KIND.ELEMENT && doc.localName(i) === 'Signature' && doc.sub[i] > 0) {
            if (subtreeFind(doc, i, 'SignedInfo').length) sigNodes.push(i);
            if (sigNodes.length >= 200) break;
        }
    }
    for (const sn of sigNodes) {
        const sig = {
            node: sn,
            canonicalization: '',
            signatureMethod: '',
            digestMethods: [],
            references: [],
            valueLength: 0,
            signingTime: '',
            subjectNames: [],
            certs: [],
        };
        const algOf = (name) => {
            const e = subtreeFind(doc, sn, name)[0];
            return e ? doc.attrLocal(e, 'Algorithm') || '' : '';
        };
        sig.canonicalization = algOf('CanonicalizationMethod');
        sig.signatureMethod = algOf('SignatureMethod');
        sig.digestMethods = [...new Set(subtreeFind(doc, sn, 'DigestMethod').map((e) => doc.attrLocal(e, 'Algorithm') || ''))].filter(Boolean);
        sig.references = subtreeFind(doc, sn, 'Reference').map((e) => doc.attrLocal(e, 'URI') ?? '').slice(0, 20);
        const sv = subtreeFind(doc, sn, 'SignatureValue')[0];
        if (sv) sig.valueLength = doc.textContent(sv, 20000).replace(/\s+/g, '').length;
        const st = subtreeFind(doc, sn, 'SigningTime')[0];
        if (st) sig.signingTime = doc.textContent(st, 100).trim();
        sig.subjectNames = subtreeFind(doc, sn, 'X509SubjectName').map((e) => doc.textContent(e, 2000).trim());
        for (const c of subtreeFind(doc, sn, 'X509Certificate')) {
            const b64 = doc.textContent(c, maxBlobChars).replace(/\s+/g, '');
            if (!b64) continue;
            seen.add(keyOf(b64));
            result.blobs++;
            try {
                const cert = await parseCertificateBase64(b64);
                cert.node = c;
                cert.source = 'XMLDSig';
                sig.certs.push(cert);
                result.certificates.push(cert);
            } catch (e) {
                const entry = { error: e.message, node: c, source: 'XMLDSig' };
                sig.certs.push(entry);
                result.issues.push(`Не удалось разобрать сертификат в подписи: ${e.message}`);
            }
        }
        result.signatures.push(sig);
    }

    // 2) Произвольные base64-блоки (CMS/сертификаты) по имени-подсказке или заголовку DER
    const cand = [];
    for (let i = 1; i < doc.n && cand.length < maxBlobs * 4; i++) {
        const ts = doc.ts[i];
        if (ts < 0) continue;
        const k = doc.kind[i];
        if (k !== NODE_KIND.ELEMENT && k !== NODE_KIND.TEXT && k !== NODE_KIND.CDATA) continue;
        const len = doc.te[i] - ts;
        if (len < 200 || len > maxBlobChars) continue;
        cand.push(i);
    }
    for (const i of cand) {
        if (result.blobs >= maxBlobs) {
            result.issues.push(`Проверены не все двоичные блоки: достигнут предел ${maxBlobs}`);
            break;
        }
        const own = doc.ownTextRaw(i).trim();
        if (!B64_LIKE.test(own)) continue;
        const b64 = own.replace(/\s+/g, '');
        if (seen.has(keyOf(b64))) continue;
        const owner = doc.kind[i] === NODE_KIND.ELEMENT ? i : doc.parent[i];
        const nm = doc.name(owner);
        const parentNm = doc.name(doc.parent[owner]);
        if (!(NAME_HINT.test(nm) || NAME_HINT.test(parentNm) || b64.startsWith('MI'))) continue;
        const bytes = base64ToBytes(b64);
        if (!bytes) continue;
        seen.add(keyOf(b64));
        result.blobs++;
        const r = await analyzeBlob(bytes);
        if (r.type === 'certificate') {
            r.cert.node = owner;
            r.cert.source = `элемент <${nm}>`;
            result.certificates.push(r.cert);
        } else if (r.type === 'cms') {
            r.cms.node = owner;
            r.cms.source = `элемент <${nm}>`;
            r.cms.size = bytes.length;
            result.cms.push(r.cms);
            for (const c of r.cms.certs) {
                if (!c.error) {
                    c.node = owner;
                    c.source = `подпись CMS в <${nm}>`;
                    result.certificates.push(c);
                }
            }
        }
    }
    // 3) Атрибуты с base64 (например Подпись="…")
    for (let i = 1; i < doc.n && result.blobs < maxBlobs; i++) {
        if (doc.kind[i] !== NODE_KIND.ELEMENT || !doc.aCnt[i]) continue;
        const s = doc.aStart[i];
        for (let a = 0; a < doc.aCnt[i]; a++) {
            const len = doc.aVe[s + a] - doc.aVs[s + a];
            if (len < 200 || len > maxBlobChars) continue;
            const raw = doc.src.slice(doc.aVs[s + a], doc.aVe[s + a]);
            if (!B64_LIKE.test(raw)) continue;
            const b64 = raw.replace(/\s+/g, '');
            if (seen.has(keyOf(b64))) continue;
            const an = doc.names[doc.aName[s + a]];
            if (!(NAME_HINT.test(an) || b64.startsWith('MI'))) continue;
            const bytes = base64ToBytes(b64);
            if (!bytes) continue;
            seen.add(keyOf(b64));
            result.blobs++;
            const r = await analyzeBlob(bytes);
            if (r.type === 'certificate') {
                r.cert.node = i;
                r.cert.source = `атрибут ${an}`;
                result.certificates.push(r.cert);
            } else if (r.type === 'cms') {
                r.cms.node = i;
                r.cms.source = `атрибут ${an}`;
                result.cms.push(r.cms);
                for (const c of r.cms.certs) if (!c.error) result.certificates.push({ ...c, node: i, source: `подпись CMS в ${an}` });
            }
        }
    }
    // уникальность сертификатов по отпечатку
    const uniq = new Map();
    for (const c of result.certificates) if (c.thumbprint && !uniq.has(c.thumbprint)) uniq.set(c.thumbprint, c);
    result.certificates = [...uniq.values()];
    return result;
}

export function certToPem(base64) {
    const b = String(base64 || '').replace(/\s+/g, '');
    return `-----BEGIN CERTIFICATE-----\n${b.replace(/(.{64})/g, '$1\n').trim()}\n-----END CERTIFICATE-----\n`;
}
