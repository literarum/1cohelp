'use strict';

/**
 * Единая версия query-параметра ?v= для статики и precache в sw.js.
 * Чеклист релиза (все три значения должны совпадать по смыслу «версия активов»):
 * 1) ASSET_QUERY_VERSION ниже
 * 2) `?v=` у css/script/entry в index.html
 * 3) ASSET_QUERY_VERSION в site/sw.js (precache URL)
 * При смене только логики SW (стратегии кэша) дополнительно увеличить VERSION в sw.js.
 */
export const ASSET_QUERY_VERSION = '20260403pwa';
