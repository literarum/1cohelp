/* Run before the parser reaches the search field: browser-restored form
   state is transient, while genuine edits during a slow boot must survive. */
(function installSearchStartup() {
    'use strict';
    if (window.__copilotSearchStartup) return;

    var userEdited = false;
    var initialized = false;
    var firstPageShown = false;
    var pageSyncFinished = false;

    function trackUserEdit(event) {
        if (event.isTrusted && event.target && event.target.id === 'searchInput') {
            userEdited = true;
        }
    }

    function releaseTracking() {
        if (!initialized || !pageSyncFinished) return;
        document.removeEventListener('beforeinput', trackUserEdit, true);
        document.removeEventListener('input', trackUserEdit, true);
    }

    function resetInheritedState() {
        if (userEdited) return;
        var input = document.getElementById('searchInput');
        if (!input) return;
        var changed = input.value !== '';
        input.value = '';
        document.getElementById('clearSearchInputBtn')?.classList.add('hidden');
        var results = document.getElementById('searchResults');
        if (results) {
            results.classList.add('hidden');
            results.replaceChildren();
        }
        if (changed) input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    document.addEventListener('beforeinput', trackUserEdit, true);
    document.addEventListener('input', trackUserEdit, true);
    document.addEventListener('DOMContentLoaded', resetInheritedState, { once: true });
    window.addEventListener('pageshow', function onPageShow(event) {
        if (event.persisted || firstPageShown) return;
        firstPageShown = true;
        // Run after restoration and other first-pageshow listeners. A real edit
        // made in between is protected by the early capture listeners above.
        window.setTimeout(function () {
            resetInheritedState();
            pageSyncFinished = true;
            releaseTracking();
        }, 0);
    });

    window.__copilotSearchStartup = Object.freeze({
        initialize: function () {
            if (initialized) return;
            initialized = true;
            resetInheritedState();
            releaseTracking();
        },
    });
})();
