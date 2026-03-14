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
                        if (Object.prototype.hasOwnProperty.call(entry.attrs, k))
                            script.setAttribute(k, entry.attrs[k]);
                    }
                }
                head.appendChild(script);
            } else if (entry.type === 'link' && entry.rel) {
                var link = document.createElement('link');
                link.rel = entry.rel;
                link.href = url;
                if (entry.attrs) {
                    for (var attrKey in entry.attrs) {
                        if (Object.prototype.hasOwnProperty.call(entry.attrs, attrKey))
                            link.setAttribute(attrKey, entry.attrs[attrKey]);
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
     * Returns true if a script vendor is missing (e.g. 404 on local).
     * @param {Object} entry - Registry entry with optional globalName
     * @returns {boolean}
     */
    function isScriptMissing(entry) {
        if (!entry || entry.type !== 'script' || !entry.globalName) return false;
        return typeof global[entry.globalName] === 'undefined';
    }

    /**
     * Returns true if Font Awesome (or other stylesheet vendor) failed to load.
     * @param {string} id - Vendor id (e.g. 'fontawesome')
     * @returns {boolean}
     */
    function isStylesheetMissing(id) {
        if (id !== 'fontawesome') return false;
        var link = document.querySelector('link[href*="fontawesome"]');
        if (!link) return true;
        try {
            return !link.sheet || (link.sheet.cssRules && link.sheet.cssRules.length === 0);
        } catch {
            return false;
        }
    }

    /**
     * Loads one script from URL, then calls next when done (onload or onerror).
     * @param {string} url - Script URL (CDN)
     * @param {Object} [attrs] - Optional attributes (e.g. crossorigin)
     * @param {function()} next - Callback after load or error
     */
    function loadScriptOnce(url, attrs, next) {
        var script = document.createElement('script');
        script.src = url;
        script.async = false;
        script.defer = false;
        if (attrs) {
            for (var k in attrs) {
                if (Object.prototype.hasOwnProperty.call(attrs, k))
                    script.setAttribute(k, attrs[k]);
            }
        }
        script.onload = next;
        script.onerror = next;
        document.head.appendChild(script);
    }

    /**
     * If USE_LOCAL_VENDORS is true, detects vendors that failed to load (404 on local)
     * and loads them from CDN. Call after writeVendors (e.g. setTimeout(..., 100)).
     * @param {string} profile - 'main' | 'standalone' | 'downloads'
     * @param {string} [basePath=''] - Base path (unused for CDN fallback)
     */
    function runVendorFallback(profile, _basePath) {
        if (!USE_LOCAL || !REGISTRY) return;

        var order = PROFILES[profile];
        if (!order || !order.length) return;

        var head = document.head;
        var scriptsToLoad = [];
        var fontawesomeEntry = null;

        for (var i = 0; i < order.length; i++) {
            var entry = REGISTRY[order[i]];
            if (!entry || !entry.cdnUrl) continue;
            if (entry.type === 'script') {
                if (isScriptMissing(entry)) scriptsToLoad.push(entry);
            } else if (entry.type === 'link' && entry.rel === 'stylesheet') {
                if (order[i] === 'fontawesome' && isStylesheetMissing('fontawesome')) {
                    fontawesomeEntry = entry;
                }
            }
        }

        if (fontawesomeEntry) {
            var link = document.createElement('link');
            link.rel = fontawesomeEntry.rel;
            link.href = fontawesomeEntry.cdnUrl;
            head.appendChild(link);
        }

        function loadNext(index) {
            if (index >= scriptsToLoad.length) return;
            var entry = scriptsToLoad[index];
            loadScriptOnce(entry.cdnUrl, entry.attrs, function () {
                loadNext(index + 1);
            });
        }
        loadNext(0);
    }

    /**
     * Waits for Sortable to appear on global (e.g. after fallback load), then calls callback.
     * @param {function(*)} callback - called with global.Sortable or null if timeout
     * @param {number} [maxWaitMs=5000] - max time to wait in ms
     */
    function waitForSortable(callback, maxWaitMs) {
        var limit = maxWaitMs || 5000;
        var start = Date.now();
        var t = setInterval(function () {
            if (typeof global.Sortable !== 'undefined') {
                clearInterval(t);
                callback(global.Sortable);
                return;
            }
            if (Date.now() - start >= limit) {
                clearInterval(t);
                callback(null);
            }
        }, 50);
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
                var attrs =
                    entry.attrs && entry.attrs.crossorigin
                        ? ' crossorigin="' + entry.attrs.crossorigin + '"'
                        : '';
                document.write('<script src="' + url + '"' + attrs + '><' + '/script>');
            } else if (entry.type === 'link' && entry.rel) {
                document.write('<link rel="' + entry.rel + '" href="' + url + '">');
            }
        }
    }

    global.VendorLoader = {
        getVendorUrl: getVendorUrl,
        loadVendors: loadVendors,
        loadTailwindFallback: loadTailwindFallback,
        writeVendors: writeVendors,
        runVendorFallback: runVendorFallback,
        waitForSortable: waitForSortable,
    };
})(typeof window !== 'undefined' ? window : this);
