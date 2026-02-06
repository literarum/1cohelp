# План миграции UI из god-мегафайлов

## Цель
Профессиональная миграция UI из `index.html` и `script.js` в модульную файловую структуру.

## Текущее состояние
- `index.html`: ~4,415 строк, ~240KB (встроенные CSS стили и HTML разметка)
- `script.js`: ~12,416 строк, ~600KB (много функций, но уже использует импорты)

## Структура миграции

### 1. CSS стили (из index.html)
- `css/base/variables.css` - CSS переменные
- `css/base/base.css` - базовые стили
- `css/components/modals.css` - стили модальных окон
- `css/components/scrollbar.css` - стили скроллбара
- `css/components/tabs.css` - стили табов
- `css/components/search.css` - стили поиска
- `css/components/components.css` - общие компоненты
- `css/components/theming.css` - темизация
- `css/components/animations.css` - анимации
- `css/main.css` - главный файл, импортирующий все остальные

### 2. HTML шаблоны (из index.html)
- `templates/components/header.html` - шапка приложения
- `templates/components/tabs.html` - навигационные табы
- `templates/components/main-content.html` - главный контент
- `templates/modals/algorithm-modal.html` - модальное окно алгоритма
- `templates/modals/edit-modal.html` - модальное окно редактирования
- `templates/modals/add-modal.html` - модальное окно добавления
- `templates/modals/bookmark-modal.html` - модальное окно закладки
- `templates/modals/reglament-modal.html` - модальное окно регламента
- `templates/modals/hotkeys-modal.html` - модальное окно горячих клавиш
- `templates/modals/cib-link-modal.html` - модальное окно ссылок 1С
- `templates/modals/confirm-clear-data-modal.html` - модальное окно подтверждения очистки
- `templates/modals/customize-ui-modal.html` - модальное окно настройки UI

### 3. UI компоненты JavaScript (из script.js)
- `js/ui/header.js` - компонент шапки
- `js/ui/tabs.js` - компонент табов (уже существует, возможно расширить)
- `js/ui/modals.js` - компонент модальных окон
- `js/ui/sections.js` - компонент секций контента

## Алгоритм выполнения

1. ✅ Создать структуру папок
2. ⏳ Извлечь CSS стили в отдельные файлы
3. ⏳ Извлечь HTML шаблоны в отдельные файлы
4. ⏳ Создать UI компоненты для рендеринга
5. ⏳ Обновить index.html для использования новых CSS и шаблонов
6. ⏳ Обновить script.js для использования новых UI компонентов
7. ⏳ Протестировать приложение

## Примечания
- Сохранить все функциональные возможности
- Сохранить все стили и анимации
- Обеспечить обратную совместимость
- Минимизировать изменения в логике приложения
