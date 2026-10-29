import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('FNS certificate revocation UI smoke', () => {
    let elements;
    let initFNSCertificateRevocationSystem;

    beforeEach(async () => {
        document.body.innerHTML = `
            <input id="fnsCertFileInput" type="file">
            <div id="fnsCertInfo"></div>
            <button id="fnsCertResetBtn" type="button"></button>
            <div id="fnsCrlStatus"></div>
            <div id="fnsCrlDetails"></div>
            <div id="fnsCertDropZone"></div>
        `;
        elements = Object.fromEntries(
            [...document.body.querySelectorAll('[id]')].map((element) => [element.id, element]),
        );
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

        // jsdom has no OS file picker; emulate only its selected-value property.
        Object.defineProperty(certInput, 'value', {
            configurable: true,
            writable: true,
            value: 'fake-path',
        });
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
