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

    // Автозаполнение браузера / менеджера паролей: поле поиска принимается за «логин» рядом со
    // скрытым полем пароля и получает сохранённое значение (например «100») уже после загрузки.
    // Такое заполнение приходит доверенным input без нажатий клавиш, вставки или перетаскивания —
    // его отбрасываем. Ввод самого пользователя и программные события приложения не трогаем.
    var lastUserGesture = 0;
    function markGesture(event) {
        if (event.target && event.target.id === 'searchInput') lastUserGesture = Date.now();
    }
    ['keydown', 'paste', 'drop', 'compositionstart', 'cut'].forEach(function (type) {
        document.addEventListener(type, markGesture, true);
    });
    document.addEventListener(
        'input',
        function dropAutofill(event) {
            var input = event.target;
            if (!event.isTrusted || !input || input.id !== 'searchInput') return;
            var it = event.inputType || '';
            var gesture = Date.now() - lastUserGesture < 1500;
            if (gesture || it === 'insertFromPaste' || it === 'insertFromDrop' || it === 'insertText' || it.indexOf('delete') === 0) return;
            if (!input.value) return;
            event.stopImmediatePropagation();
            input.value = '';
            document.getElementById('clearSearchInputBtn')?.classList.add('hidden');
        },
        true,
    );

    window.__copilotSearchStartup = Object.freeze({
        initialize: function () {
            if (initialized) return;
            initialized = true;
            resetInheritedState();
            releaseTracking();
        },
    });
})();
