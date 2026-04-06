'use strict';

// ============================================================================
// КОНФИГУРАЦИЯ ХРАНИЛИЩ INDEXEDDB
// ============================================================================

export const storeConfigs = [
    {
        name: 'algorithms',
        options: { keyPath: 'section' },
    },
    {
        name: 'links',
        options: { keyPath: 'id', autoIncrement: true },
        indexes: [{ name: 'category', keyPath: 'category', options: { unique: false } }],
    },
    {
        name: 'bookmarks',
        options: { keyPath: 'id', autoIncrement: true },
        indexes: [{ name: 'folder', keyPath: 'folder', options: { unique: false } }],
    },
    {
        name: 'reglaments',
        options: { keyPath: 'id', autoIncrement: true },
        indexes: [{ name: 'category', keyPath: 'category', options: { unique: false } }],
    },
    {
        name: 'clientData',
        options: { keyPath: 'id' },
    },
    {
        name: 'preferences',
        options: { keyPath: 'id' },
    },
    {
        name: 'bookmarkFolders',
        options: { keyPath: 'id', autoIncrement: true },
    },
    {
        name: 'extLinks',
        options: { keyPath: 'id', autoIncrement: true },
        indexes: [{ name: 'category', keyPath: 'category', options: { unique: false } }],
    },
    {
        name: 'extLinkCategories',
        options: { keyPath: 'id', autoIncrement: true },
        indexes: [{ name: 'name', keyPath: 'name', options: { unique: true } }],
    },
    {
        name: 'searchIndex',
        options: { keyPath: 'word' },
    },
    {
        name: 'screenshots',
        options: { keyPath: 'id', autoIncrement: true },
        indexes: [
            { name: 'parentId', keyPath: 'parentId', options: { unique: false } },
            { name: 'parentType', keyPath: 'parentType', options: { unique: false } },
        ],
    },
    {
        name: 'blacklistedClients',
        options: { keyPath: 'id', autoIncrement: true },
        indexes: [
            { name: 'inn', keyPath: 'inn', options: { unique: false } },
            { name: 'phone', keyPath: 'phone', options: { unique: false } },
            { name: 'organizationName', keyPath: 'organizationNameLc', options: { unique: false } },
            { name: 'level', keyPath: 'level', options: { unique: false } },
            { name: 'dateAdded', keyPath: 'dateAdded', options: { unique: false } },
        ],
    },
    {
        name: 'favorites',
        options: { keyPath: 'id', autoIncrement: true },
        indexes: [
            {
                name: 'unique_favorite',
                keyPath: ['itemType', 'originalItemId'],
                options: { unique: true },
            },
            { name: 'itemType', keyPath: 'itemType', options: { unique: false } },
            { name: 'dateAdded', keyPath: 'dateAdded', options: { unique: false } },
        ],
    },
    {
        name: 'pdfFiles',
        options: { keyPath: 'id', autoIncrement: true },
        indexes: [
            { name: 'parentKey', keyPath: 'parentKey', options: { unique: false } },
            { name: 'uploadedAt', keyPath: 'uploadedAt', options: { unique: false } },
        ],
    },
    {
        name: 'recentlyDeleted',
        options: { keyPath: 'id', autoIncrement: true },
        indexes: [
            { name: 'storeName', keyPath: 'storeName', options: { unique: false } },
            { name: 'entityId', keyPath: 'entityId', options: { unique: false } },
            { name: 'deletedAt', keyPath: 'deletedAt', options: { unique: false } },
        ],
    },
    {
        name: 'entityEditHistory',
        options: { keyPath: 'id' },
    },
    {
        name: 'reminders',
        options: { keyPath: 'id', autoIncrement: true },
        indexes: [
            { name: 'dueAt', keyPath: 'dueAt', options: { unique: false } },
            { name: 'status', keyPath: 'status', options: { unique: false } },
            {
                name: 'contextLookup',
                keyPath: ['contextType', 'contextId'],
                options: { unique: false },
            },
        ],
    },
    {
        name: 'trainingProgress',
        options: { keyPath: 'id' },
    },
    {
        name: 'trainingSrsCards',
        options: { keyPath: 'id', autoIncrement: true },
        indexes: [
            { name: 'dueAt', keyPath: 'dueAt', options: { unique: false } },
            { name: 'sourceType', keyPath: 'sourceType', options: { unique: false } },
        ],
    },
    {
        name: 'trainingWeakSpots',
        options: { keyPath: 'id', autoIncrement: true },
        indexes: [{ name: 'stepKey', keyPath: 'stepKey', options: { unique: false } }],
    },
    {
        name: 'trainingUserCurriculum',
        options: { keyPath: 'id' },
    },
    {
        name: 'trainingBuiltinCurriculum',
        options: { keyPath: 'id' },
    },
    {
        name: 'mentorQuizPackages',
        options: { keyPath: 'id' },
    },
    {
        name: 'clientAnalyticsFiles',
        options: { keyPath: 'id', autoIncrement: true },
        indexes: [
            { name: 'uploadedAt', keyPath: 'uploadedAt', options: { unique: false } },
            { name: 'textSha256', keyPath: 'textSha256', options: { unique: false } },
        ],
    },
    {
        name: 'clientAnalyticsRecords',
        options: { keyPath: 'id', autoIncrement: true },
        indexes: [
            { name: 'inn', keyPath: 'inn', options: { unique: false } },
            { name: 'sourceFileId', keyPath: 'sourceFileId', options: { unique: false } },
            { name: 'uploadedAt', keyPath: 'uploadedAt', options: { unique: false } },
        ],
    },
];
