/** Stage remapped records in memory, then commit all stores atomically. */
export function createMergeWorkspace(db, snapshot, configs) {
    const tables = new Map();
    const writes = new Map();
    const nextKeys = new Map();
    for (const name of Object.keys(snapshot)) {
        const config = configs.find(c => c.name === name);
        if (!config) throw new Error(`Неизвестный раздел слияния: ${name}`);
        const key = config.options.keyPath;
        tables.set(name, new Map(snapshot[name].map(record => [record[key], record])));
        writes.set(name, new Map());
        let highest = 0;
        for (const record of snapshot[name]) if (typeof record[key] === 'number' && record[key] > highest) highest = record[key];
        nextKeys.set(name, highest + 1);
    }
    return {
        get: async (name, key) => tables.get(name)?.get(key),
        put: async (name, source) => {
            const config = configs.find(c => c.name === name);
            const table = tables.get(name);
            if (!table) throw new Error(`Раздел не включён в транзакцию: ${name}`);
            const record = { ...source };
            const key = config.options.keyPath;
            if (record[key] === undefined && config.options.autoIncrement) {
                record[key] = nextKeys.get(name);
            }
            if (record[key] === undefined) throw new Error(`Отсутствует ключ записи: ${name}`);
            if (typeof record[key] === 'number' && record[key] >= nextKeys.get(name)) nextKeys.set(name, record[key] + 1);
            table.set(record[key], record);
            writes.get(name).set(record[key], record);
            return record[key];
        },
        commit: () => new Promise((resolve, reject) => {
            const names = [...writes.keys()];
            if (!names.length) { resolve(); return; }
            const tx = db.transaction(names, 'readwrite');
            let failure;
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(failure || tx.error || new Error('Транзакция слияния отменена.'));
            // Reads and dependent writes are enqueued in IDB callbacks: no async gap
            // can let the transaction auto-commit before all stores are checked.
            let remaining = names.length;
            for (const name of names) {
                const request = tx.objectStore(name).getAll();
                request.onsuccess = () => {
                    if (JSON.stringify(request.result) !== JSON.stringify(snapshot[name])) {
                        failure = new Error('Данные изменились после анализа. Выполните анализ слияния заново.');
                        tx.abort();
                        return;
                    }
                    remaining--;
                    if (remaining) return;
                    try {
                        for (const [storeName, records] of writes) {
                            const store = tx.objectStore(storeName);
                            for (const record of records.values()) store.put(record);
                        }
                    } catch (error) { failure = error; tx.abort(); }
                };
            }
        }),
    };
}
