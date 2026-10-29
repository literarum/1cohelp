import { beforeEach, describe, expect, it } from 'vitest';
import {
    getDefaultGoogleScriptUrl,
    getGoogleScriptUrl,
    hasCustomGoogleScriptUrl,
    isValidGoogleScriptUrl,
    setGoogleScriptUrl,
} from './google-docs.js';

const publishedEndpoint =
    'https://script.google.com/macros/s/AKfycbwiIAQyofB2cPtJEL0V_eqz3kuv7ll1rS1BxQkZOKKVrEH4hOVr2zumn5DYGpO6oHjVgg/exec';

describe('published Google Docs endpoint and user overrides', () => {
    beforeEach(() => localStorage.clear());

    it('uses the verified public deployment on a fresh installation', () => {
        expect(getDefaultGoogleScriptUrl()).toBe(publishedEndpoint);
        expect(getGoogleScriptUrl()).toBe(publishedEndpoint);
        expect(isValidGoogleScriptUrl(publishedEndpoint)).toBe(true);
        expect(hasCustomGoogleScriptUrl()).toBe(false);
    });

    it('preserves an explicit custom deployment and restores the built-in address on reset', () => {
        const custom = 'https://script.google.com/macros/s/custom-deployment-1234567890/exec';
        expect(setGoogleScriptUrl(custom)).toBe(true);
        expect(getGoogleScriptUrl()).toBe(custom);
        expect(hasCustomGoogleScriptUrl()).toBe(true);
        expect(setGoogleScriptUrl('')).toBe(true);
        expect(getGoogleScriptUrl()).toBe(publishedEndpoint);
        expect(hasCustomGoogleScriptUrl()).toBe(false);
    });

    it('rejects a foreign host without changing the saved deployment', () => {
        expect(setGoogleScriptUrl(publishedEndpoint)).toBe(true);
        expect(setGoogleScriptUrl('https://example.com/macros/s/custom-deployment-1234567890/exec')).toBe(false);
        expect(getGoogleScriptUrl()).toBe(publishedEndpoint);
    });
});
