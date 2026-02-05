'use strict';

/**
 * Компонент «Регламенты».
 * Пока делегирует в глобальные функции из script.js.
 * При миграции сюда перенести: loadReglaments, initReglamentsSystem, рендер регламентов.
 */

export function initReglamentsSystem() {
    if (typeof window.initReglamentsSystem === 'function') {
        return window.initReglamentsSystem();
    }
    console.warn('[reglaments.js] initReglamentsSystem не определена в window.');
}

export async function loadReglaments() {
    if (typeof window.loadReglaments === 'function') {
        return window.loadReglaments();
    }
    console.warn('[reglaments.js] loadReglaments не определена в window.');
}
