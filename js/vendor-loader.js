/**
 * Loads vendor scripts/styles from config: injects <script> / <link> in order.
 * Depends on VendorConfig (load vendor-config.js before this file).
 */
(function (global) {
    'use strict';

    var Config = global.VendorConfig;
    if (!Config || !Config.VENDOR_REGISTRY) {
        console.error('VendorLoader: VendorConfig not found. Load vendor-config.js first.');
        return;
    }

    var REGISTRY = Config.VENDOR_REGISTRY;
    var USE_LOCAL = Config.USE_LOCAL_VENDORS;
    var PROFILES = Config.PAGE_PROFILES;

    /**
     * Returns URL for a vendor (local or CDN).
     * @param {string} id - Vendor id from VENDOR_REGISTRY
     * @param {string} [basePath=''] - Base path for local assets (e.g. '../' for downloads/)
     * @returns {string}
     */
    function getVendorUrl(id, basePath) {
        basePath = basePath || '';
        var entry = REGISTRY[id];
        if (!entry) return '';
        if (USE_LOCAL && entry.localPath) {
            return basePath + entry.localPath;
        }
        return entry.cdnUrl || '';
    }

    /**
     * Injects script or link into document.head in order (no async/defer for scripts).
     * @param {string} profile - 'main' | 'standalone' | 'downloads'
     * @param {string} [basePath=''] - Base path for local URLs
     */
    function loadVendors(profile, basePath) {
        basePath = basePath || '';
        var order = PROFILES[profile];
        if (!order || !order.length) return;

        var head = document.head;
        for (var i = 0; i < order.length; i++) {
            var entry = REGISTRY[order[i]];
            if (!entry) continue;
            var url = USE_LOCAL && entry.localPath ? basePath + entry.localPath : entry.cdnUrl;
            if (!url) continue;

            if (entry.type === 'script') {
                var script = document.createElement('script');
                script.src = url;
                script.async = false;
                script.defer = false;
                if (entry.attrs) {
                    for (var k in entry.attrs) {
                        if (entry.attrs.hasOwnProperty(k)) script.setAttribute(k, entry.attrs[k]);
                    }
                }
                head.appendChild(script);
            } else if (entry.type === 'link' && entry.rel) {
                var link = document.createElement('link');
                link.rel = entry.rel;
                link.href = url;
                if (entry.attrs) {
                    for (var k in entry.attrs) {
                        if (entry.attrs.hasOwnProperty(k)) link.setAttribute(k, entry.attrs[k]);
                    }
                }
                head.appendChild(link);
            }
        }
    }

    /**
     * Injects Tailwind fallback script (for use when tailwind.generated.css fails to load).
     * @param {string} [basePath=''] - Base path for local URL
     * @returns {HTMLScriptElement} The injected script element (e.g. for onload)
     */
    function loadTailwindFallback(basePath) {
        basePath = basePath || '';
        var entry = REGISTRY['tailwind-fallback'];
        if (!entry) return null;
        var url = USE_LOCAL && entry.localPath ? basePath + entry.localPath : entry.cdnUrl;
        if (!url) return null;
        var script = document.createElement('script');
        script.src = url;
        script.async = false;
        script.defer = false;
        document.head.appendChild(script);
        return script;
    }

    /**
     * Writes vendor script/link tags into the document stream (synchronous load order).
     * Use this in static HTML so vendors load before subsequent inline scripts.
     * @param {string} profile - 'main' | 'standalone' | 'downloads'
     * @param {string} [basePath=''] - Base path for local URLs
     */
    function writeVendors(profile, basePath) {
        basePath = basePath || '';
        var order = PROFILES[profile];
        if (!order || !order.length) return;
        for (var i = 0; i < order.length; i++) {
            var entry = REGISTRY[order[i]];
            if (!entry) continue;
            var url = USE_LOCAL && entry.localPath ? basePath + entry.localPath : entry.cdnUrl;
            if (!url) continue;
            if (entry.type === 'script') {
                var attrs = (entry.attrs && entry.attrs.crossorigin) ? ' crossorigin="' + entry.attrs.crossorigin + '"' : '';
                document.write('<script src="' + url + '"' + attrs + '><\/script>');
            } else if (entry.type === 'link' && entry.rel) {
                document.write('<link rel="' + entry.rel + '" href="' + url + '">');
            }
        }
    }

    global.VendorLoader = {
        getVendorUrl: getVendorUrl,
        loadVendors: loadVendors,
        loadTailwindFallback: loadTailwindFallback,
        writeVendors: writeVendors
    };
})(typeof window !== 'undefined' ? window : this);
