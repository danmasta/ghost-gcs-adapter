import config from '@tryghost/config';
import { BaseError } from 'lo/errors';
import { join } from 'node:path';

export class GCSAdapterError extends BaseError {
    static code = 'ERR_GCS_ADAPTER';
}

// Note: Valid content path suffixes defined here:
// https://github.com/TryGhost/Ghost/blob/80aa346307fd3e6e57465cebdde4a8a292c722f3/ghost/core/core/shared/config/helpers.js#L72
export function getContentPath (type) {
    let base = config.get('paths:contentPath') ?? 'content';
    switch (type) {
        case 'images':
            return join(base, 'images/');
        case 'media':
            return join(base, 'media/');
        case 'files':
            return join(base, 'files/');
        case 'themes':
            return join(base, 'themes/');
        case 'adapters':
            return join(base, 'adapters/');
        case 'logs':
            return join(base, 'logs/');
        case 'data':
            return join(base, 'data/');
        case 'settings':
            return join(base, 'settings/');
        case 'public':
            return join(base, 'public/');
        default:
            throw new GCSAdapterError('Invalid content type: %s', type);
    }
};
