/**
 * Утилита для загрузки HTML шаблонов
 * Используется для динамической загрузки компонентов UI
 */

/**
 * Загружает HTML шаблон из файла
 * @param {string} templatePath - путь к шаблону относительно templates/
 * @returns {Promise<string>} HTML содержимое шаблона
 */
export async function loadTemplate(templatePath) {
    try {
        const response = await fetch(`templates/${templatePath}`);
        if (!response.ok) {
            throw new Error(`Failed to load template: ${templatePath}`);
        }
        return await response.text();
    } catch (error) {
        console.error(`Error loading template ${templatePath}:`, error);
        throw error;
    }
}

/**
 * Загружает шаблон и вставляет его в указанный элемент
 * @param {string} templatePath - путь к шаблону
 * @param {string|HTMLElement} target - селектор или элемент для вставки
 * @param {Object} options - опции загрузки
 */
export async function loadTemplateIntoElement(templatePath, target, options = {}) {
    const html = await loadTemplate(templatePath);
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    
    if (!element) {
        throw new Error(`Target element not found: ${target}`);
    }
    
    if (options.replace) {
        element.innerHTML = html;
    } else {
        element.insertAdjacentHTML(options.position || 'beforeend', html);
    }
    
    return element;
}

/**
 * Кэш для загруженных шаблонов
 */
const templateCache = new Map();

/**
 * Загружает шаблон с кэшированием
 * @param {string} templatePath - путь к шаблону
 * @returns {Promise<string>} HTML содержимое шаблона
 */
export async function loadTemplateCached(templatePath) {
    if (templateCache.has(templatePath)) {
        return templateCache.get(templatePath);
    }
    
    const html = await loadTemplate(templatePath);
    templateCache.set(templatePath, html);
    return html;
}

/**
 * Предзагружает список шаблонов
 * @param {string[]} templatePaths - массив путей к шаблонам
 */
export async function preloadTemplates(templatePaths) {
    const promises = templatePaths.map(path => loadTemplateCached(path));
    await Promise.all(promises);
    console.log(`Preloaded ${templatePaths.length} templates`);
}
