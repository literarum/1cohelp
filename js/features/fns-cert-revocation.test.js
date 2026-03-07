import { beforeEach, describe, expect, it, vi } from 'vitest';

class MockClassList {
    constructor() {
        this._set = new Set();
    }

    add(...tokens) {
        tokens.forEach((token) => this._set.add(token));
    }

    remove(...tokens) {
        tokens.forEach((token) => this._set.delete(token));
    }

    toggle(token, force) {
        if (force === true) {
            this._set.add(token);
            return true;
        }
        if (force === false) {
            this._set.delete(token);
            return false;
        }
        if (this._set.has(token)) {
            this._set.delete(token);
            return false;
        }
        this._set.add(token);
        return true;
    }
}

class MockElement {
    constructor(id) {
        this.id = id;
        this.dataset = {};
        this.textContent = '';
        this.innerHTML = '';
        this.className = '';
        this.disabled = false;
        this.value = '';
        this.files = [];
        this.attributes = new Map();
        this.classList = new MockClassList();
        this.listeners = new Map();
        this._clickCount = 0;
    }

    addEventListener(type, cb) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(cb);
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    click() {
        this._clickCount += 1;
        const handlers = this.listeners.get('click') || [];
        handlers.forEach((cb) => cb({ preventDefault() {}, stopPropagation() {} }));
    }
}

describe('FNS certificate revocation UI smoke', () => {
    let elements;
    let initFNSCertificateRevocationSystem;

    beforeEach(async () => {
        elements = {
            fnsCertFileInput: new MockElement('fnsCertFileInput'),
            fnsCertInfo: new MockElement('fnsCertInfo'),
            fnsCertResetBtn: new MockElement('fnsCertResetBtn'),
            fnsCrlStatus: new MockElement('fnsCrlStatus'),
            fnsCrlDetails: new MockElement('fnsCrlDetails'),
            fnsCertDropZone: new MockElement('fnsCertDropZone'),
        };

        globalThis.window = {};
        const docListeners = new Map();
        globalThis.document = {
            createElement: vi.fn(() => new MockElement('created')),
            getElementById: vi.fn((id) => elements[id] || null),
            querySelector: vi.fn(() => null),
            addEventListener: vi.fn((type, cb) => {
                if (!docListeners.has(type)) docListeners.set(type, []);
                docListeners.get(type).push(cb);
            }),
        };

        ({ initFNSCertificateRevocationSystem } = await import('./fns-cert-revocation.js'));
    });

    it('does not bind duplicate dropzone click handler on repeated init', () => {
        const certInput = elements.fnsCertFileInput;
        const dropZone = elements.fnsCertDropZone;
        const inputClickSpy = vi.fn();
        certInput.click = inputClickSpy;

        initFNSCertificateRevocationSystem();
        initFNSCertificateRevocationSystem();

        dropZone.click();

        expect(inputClickSpy).toHaveBeenCalledTimes(1);
    });

    it('reset button fully clears UI output', () => {
        const certInput = elements.fnsCertFileInput;
        const certInfo = elements.fnsCertInfo;
        const details = elements.fnsCrlDetails;
        const status = elements.fnsCrlStatus;
        const resetBtn = elements.fnsCertResetBtn;

        initFNSCertificateRevocationSystem();

        certInput.value = 'fake-path';
        certInfo.innerHTML = '<div>filled</div>';
        details.innerHTML = '<ul><li>details</li></ul>';
        status.textContent = 'old status';

        resetBtn.click();

        expect(certInput.value).toBe('');
        expect(certInfo.innerHTML).toBe('');
        expect(details.innerHTML).toBe('');
        expect(status.textContent).toBe('Ожидание сертификата');
    });
});
