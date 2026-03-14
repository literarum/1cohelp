/**
 * Central vendor registry: CDN and local URLs for third-party libs.
 * Toggle USE_LOCAL_VENDORS to switch between CDN and self-hosted (site/vendor/).
 */
(function (global) {
    'use strict';

    var USE_LOCAL_VENDORS = true;

    /** Optional globalName: used by runVendorFallback to detect 404 (script not executed). */
    var VENDOR_REGISTRY = {
        sortablejs: {
            id: 'sortablejs',
            type: 'script',
            cdnUrl: 'https://cdn.jsdelivr.net/npm/sortablejs@1.14.0/Sortable.min.js',
            localPath: 'vendor/sortablejs/1.14.0/Sortable.min.js',
            globalName: 'Sortable',
        },
        'pdf-lib': {
            id: 'pdf-lib',
            type: 'script',
            cdnUrl: 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
            localPath: 'vendor/pdf-lib/1.17.1/pdf-lib.min.js',
            attrs: { crossorigin: 'anonymous' },
            globalName: 'PDFLib',
        },
        fontkit: {
            id: 'fontkit',
            type: 'script',
            cdnUrl: 'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js',
            localPath: 'vendor/fontkit/1.1.1/fontkit.umd.min.js',
            attrs: { crossorigin: 'anonymous' },
            globalName: 'fontkit',
        },
        xlsx: {
            id: 'xlsx',
            type: 'script',
            cdnUrl: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
            localPath: 'vendor/xlsx/0.20.3/xlsx.full.min.js',
            globalName: 'XLSX',
        },
        fontawesome: {
            id: 'fontawesome',
            type: 'link',
            cdnUrl: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
            localPath: 'vendor/fontawesome/6.4.0/css/all.min.css',
            rel: 'stylesheet',
        },
        'tailwind-fallback': {
            id: 'tailwind-fallback',
            type: 'script',
            cdnUrl: 'https://cdn.tailwindcss.com',
            localPath: 'vendor/tailwind-fallback/tailwind.min.js',
        },
    };

    /** Load order for main app: scripts first (pdf-lib before fontkit), then Font Awesome. */
    var MAIN_ORDER = ['sortablejs', 'pdf-lib', 'fontkit', 'xlsx', 'fontawesome'];
    /** Standalone page: Font Awesome + Tailwind CSS (via built file; no script). */
    var STANDALONE_ORDER = ['fontawesome'];
    /** Downloads page: Tailwind only (CSS or fallback script). */
    var DOWNLOADS_ORDER = [];

    var PAGE_PROFILES = {
        main: MAIN_ORDER,
        standalone: STANDALONE_ORDER,
        downloads: DOWNLOADS_ORDER,
    };

    global.VendorConfig = {
        USE_LOCAL_VENDORS: USE_LOCAL_VENDORS,
        VENDOR_REGISTRY: VENDOR_REGISTRY,
        PAGE_PROFILES: PAGE_PROFILES,
    };
})(typeof window !== 'undefined' ? window : this);
