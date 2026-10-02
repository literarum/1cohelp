import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationService, showNotification } from './notification.js';

function reset() {
    NotificationService.dismissAll?.();
    document.body.innerHTML = '<div id="notification-container"></div>';
    NotificationService.container = null;
    NotificationService.activeToasts?.clear?.();
    NotificationService.activeImportantNotifications?.clear?.();
    NotificationService.toastQueue.length = 0;
}

describe('NotificationService: единая система тостов', () => {
    beforeEach(reset);

    it('группирует дубликаты со счётчиком', () => {
        const a = NotificationService.add('Одинаковое', 'warning');
        const b = NotificationService.add('Одинаковое', 'warning');
        expect(a).toBe(b);
        expect(document.querySelectorAll('.app-toast').length).toBe(1);
    });

    it('ограничивает число одновременных временных тостов и ставит остальные в очередь', () => {
        for (let i = 0; i < 6; i += 1) NotificationService.info(`Сообщение ${i}`);
        expect(document.querySelectorAll('.app-toast').length).toBe(NotificationService.MAX_VISIBLE_TIMED);
        expect(NotificationService.toastQueue.length).toBe(3);
    });

    it('ошибки не стоят в очереди и получают кнопку «Диагностика»', () => {
        for (let i = 0; i < 4; i += 1) NotificationService.info(`Сообщение ${i}`);
        NotificationService.error({ title: 'Сбой', message: 'Что-то сломалось' });
        const err = document.querySelector('.app-toast--error');
        expect(err).toBeTruthy();
        expect(err.getAttribute('role')).toBe('alert');
        expect(err.textContent).toContain('Диагностика');
    });

    it('совместимость: showImportant / has / dismissImportant', () => {
        NotificationService.showImportant('Важно', 'info', { id: 'imp-1', autoDismissDelay: 0 });
        expect(NotificationService.activeImportantNotifications.has('imp-1')).toBe(true);
        NotificationService.dismissImportant('imp-1');
        expect(NotificationService.has('imp-1') || false).toBe(false);
    });

    it('showNotification-обёртка создаёт тост нужного типа', () => {
        showNotification('Готово', 'success');
        expect(document.querySelector('.app-toast--success')).toBeTruthy();
    });
});
