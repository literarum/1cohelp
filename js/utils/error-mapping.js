'use strict';

/**
 * Приводит технические ошибки HTTP/сети/бэкенда к человекочитаемым сообщениям.
 */
export function mapToUserError(error) {
    if (!error) {
        return 'Неизвестная ошибка. Попробуйте повторить действие позже.';
    }

    if (typeof error === 'string') {
        return error;
    }

    if (error.userMessage) {
        return error.userMessage;
    }

    if (error.backendError || error.technicalMessage) {
        return 'Сервер вернул ошибку при выполнении операции. Попробуйте ещё раз или обратитесь к администратору.';
    }

    if (error.name === 'TypeError') {
        return 'Не удалось выполнить сетевой запрос. Проверьте подключение к интернету.';
    }

    return error.message || 'Неизвестная ошибка.';
}
