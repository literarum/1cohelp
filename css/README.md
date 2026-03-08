# CSS структура

## Описание

Стили приложения разнесены по модулям: переменные и база, компоненты, темизация, утилиты. Точка входа — `main.css`.

## Структура

```
css/
├── main.css              # Точка входа: импортирует все модули по порядку каскада
├── inline-styles.css     # Скроллбар и кнопки (подключается из main.css)
├── styles.css            # Deprecated: только @import main.css (обратная совместимость)
├── base/
│   └── base.css         # Базовые стили: html, body, layout, FNS cert, focus
├── theme/
│   ├── variables.css     # Переменные темы и семантическая палитра
│   ├── dark-overrides.css # Тёмная тема (html.dark)
│   └── custom-theme.css  # Кастомная тема (body.custom-background-active)
├── components/
│   ├── modals.css
│   ├── scrollbar.css
│   ├── tabs.css
│   ├── search.css
│   ├── sortable.css
│   ├── color-picker.css
│   ├── lightbox.css
│   ├── cards-timer.css
│   ├── buttons.css       # Заглушка (кнопки внутри custom-theme.css)
│   ├── pdf-dropzone.css
│   ├── folders-examples.css
│   └── health-modal.css
├── layout/
│   └── copyright.css     # Копирайт, header primary, кнопки хедера
└── utilities/
    ├── animations.css
    ├── helpers.css
    └── elevation.css     # Тени (--shadow-sm/md/lg/xl)
```

## Порядок импортов в main.css

1. `theme/variables.css` — переменные и семантика
2. `base/base.css` — база и layout
3. Компоненты (modals → scrollbar → tabs → search → sortable → color-picker → lightbox → cards-timer → buttons)
4. `theme/dark-overrides.css`, `theme/custom-theme.css`
5. Утилиты и layout: animations, helpers, copyright, elevation
6. Оставшиеся компоненты: pdf-dropzone, folders-examples, health-modal
7. `inline-styles.css`

## Использование

В `index.html` подключается один файл:

```html
<link rel="stylesheet" href="css/main.css" />
```

Старые ссылки на `css/styles.css` по-прежнему работают: `styles.css` содержит только `@import url('./main.css');`.
