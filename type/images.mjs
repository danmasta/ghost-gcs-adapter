import { GCSAdapter, StorageAdapterBase } from '../lib/adapter.mjs';

// Note: Fix Adapter does not inherit from base class limitation
// https://github.com/TryGhost/Ghost/blob/6af4d8f01df657ad9ba425f7ac78b50d0088068d/ghost/core/core/server/services/adapter-manager/AdapterManager.js#L135
export default class Images extends StorageAdapterBase {
    constructor (opts) {
        return new GCSAdapter({ ...opts, type: 'images' });
    }
}
