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
];
