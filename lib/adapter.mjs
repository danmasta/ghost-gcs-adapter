import { Storage } from '@google-cloud/storage';
import config from '@tryghost/config';
import GhostErrors from '@tryghost/errors';
import StorageAdapterBase from 'ghost-storage-base';
import { deburr, defaults } from 'lo';
import { pipeline } from 'node:stream/promises';
import { REGEX } from './constants.mjs';
import { FromFile, FromPath, FromURL } from './file.mjs';
import { GCSAdapterError } from './util.mjs';
const { NotFoundError, BadRequestError, NoPermissionError, InternalServerError, UnauthorizedError } = GhostErrors;

const defs = {
    bucket: undefined,
    protocol: 'https',
    host: 'storage.googleapis.com',
    storage: undefined,
    hash: false,
    hashAlgorithm: 'md5',
    hashLength: 16,
    prefix: undefined,
    template: undefined,
    deburr: true,
    lowercase: true,
    signed: false,
    expires: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    filename: 'original',
    virtual: true,
    passthrough: true,
    type: 'images'
};

export class GCSAdapter extends StorageAdapterBase {

    constructor (opts) {
        super(opts);
        this.opts = opts = defaults(opts, defs);
        if (!opts.prefix) {
            opts.prefix = '';
        }
        if (!opts.template) {
            if (opts.hash) {
                opts.template = '[hash][ext]';
            } else {
                opts.template = '[name][ext]';
            }
        }
        if (!opts.host) {
            opts.host = defs.host;
        }
        if (opts.host === defs.host) {
            if (opts.virtual) {
                opts.host = opts.bucket + '.' + opts.host;
            }
        }
        opts.addBucketToPath = !opts.virtual;
        this.contentPath = config.get('paths:contentPath') ?? 'content';
        this.storage = new Storage(opts.storage);
        this.bucket = this.storage.bucket(opts.bucket);
    }

    fromPath (path, dir) {
        return FromPath(path, this, dir);
    }

    fromFile (file, dir) {
        return FromFile(file, this, dir);
    }

    fromURL (url) {
        return FromURL(url, this);
    }

    // Check if file exists in gcs
    // Accepts a file path/name and optional target dir
    // Returns Boolean
    // Note: Used by image size (srcset) middleware
    // https://github.com/TryGhost/Ghost/blob/80aa346307fd3e6e57465cebdde4a8a292c722f3/ghost/core/core/frontend/web/middleware/handle-image-sizes.js#L114
    async exists (path, dir) {
        const file = this.fromPath(path, dir);
        return file.exists();
    }

    // Read file from gcs as buffer
    // Accepts a file path/name
    // Returns Buffer
    // Note: Used by image size (srcset) middleware
    // https://github.com/TryGhost/Ghost/blob/80aa346307fd3e6e57465cebdde4a8a292c722f3/ghost/core/core/frontend/web/middleware/handle-image-sizes.js#L121
    async read ({ path }={}) {
        const file = this.fromPath(path);
        try {
            return file.read();
        } catch (err) {
            throw new GCSAdapterError(err.message);
        }
    }

    // Save file to gcs
    // Accepts a file object and optional target dir
    // Returns the computed path String to serve file from
    // Note: Example in LocalStorageBase class:
    // https://github.com/TryGhost/Ghost/blob/9114c9894430f577ea612a9340b0b4813133c000/ghost/core/core/server/adapters/storage/LocalStorageBase.js#L50
    async save (obj, dir) {
        const file = this.fromFile(obj, dir);
        try {
            await file.upload();
            return file.serve();
        } catch (err) {
            throw new GCSAdapterError(err.message);
        }
    }

    // Save a raw buffer to gcs
    // Acceps a file buffer and file path/name
    // Returns the computed path String to serve file from
    // Note: Used by image size (srcset) middleware
    // https://github.com/TryGhost/Ghost/blob/80aa346307fd3e6e57465cebdde4a8a292c722f3/ghost/core/core/frontend/web/middleware/handle-image-sizes.js#L135
    async saveRaw (buffer, path) {
        const file = this.fromPath(path);
        try {
            await file.write(buffer);
            return file.serve();
        } catch (err) {
            throw new GCSAdapterError(err.message);
        }
    }

    // Delete file from gcs
    // Accepts a file path/name and optional target dir
    // Returns Undefined or throws Error on failure
    // Note: Used in media handler
    // https://github.com/TryGhost/Ghost/blob/6af4d8f01df657ad9ba425f7ac78b50d0088068d/ghost/core/core/server/api/endpoints/media.js#L44C36-L44C42
    async delete (path, dir) {
        const file = this.fromPath(path, dir);
        try {
            await file.delete();
        } catch (err) {
            throw new GCSAdapterError(err.message);
        }
    }

    // Serve gcs files from content path
    // Note: Serve handler only gets called on getContentPath(TYPE)
    // If we enable passthrough and return urls other than contentPath/TYPE (absolute)
    // this route handler will not get called
    serve () {
        const gcs = this;
        return async function GCSAdapterServe (req, res, next) {
            let file;
            try {
                file = gcs.fromPath(req.path);
                // Note: Need to set some headers
                await pipeline(
                    file.gcsReadStream(),
                    res
                );
            } catch (err) {
                switch (err.code) {
                    case 400:
                        next(new BadRequestError({ err }));
                        break;
                    case 401:
                        next(new UnauthorizedError({ err }));
                        break;
                    case 403:
                        next(new NoPermissionError({ err }));
                        break;
                    case 404:
                        next(new NotFoundError({
                            message: err.message,
                            code: 'STATIC_FILE_NOT_FOUND',
                            property: file.relative()
                        }));
                        break;
                    default:
                        next(new InternalServerError({ err }));
                }
            }
        }
    }

    // Convert a file computed serve url to gcs relative path
    // Accepts a computed serve url (returned from save, saveRaw)
    // Returns a gcs relative path
    // Note: Used in media and image handlers
    // https://github.com/TryGhost/Ghost/blob/6af4d8f01df657ad9ba425f7ac78b50d0088068d/ghost/core/core/server/api/endpoints/media.js#L39
    // https://github.com/TryGhost/Ghost/blob/6af4d8f01df657ad9ba425f7ac78b50d0088068d/ghost/core/core/server/api/endpoints/images.js#L61
    urlToPath (url) {
        const file = this.fromURL(url);
        return file.relative();
    }

    // Sanitize file paths for gcs
    // https://cloud.google.com/storage/docs/objects#naming
    sanitize (str='') {
        const { opts } = this;
        // Remove XML control characters
        str = str.replace(REGEX.xml, '');
        // Remove GCS wildcard and versioning characters
        str = str.replace(REGEX.gcs, '');
        // Replace whitespace with hyphens
        str = str.replace(REGEX.whitespace, '-');
        // Remove diacritics
        if (opts.deburr ?? opts.asciiFolding) {
            str = deburr(str);
        }
        // Lowercase
        if (opts.lowercase) {
            str = str.toLowerCase();
        }
        // Replace slashes with forward slash
        return str.replace(REGEX.slash, '/');
    }

    sanitizeFileName (str) {
        return this.sanitize(str);
    }

    getSanitizedFileName (str) {
        return this.sanitize(str);
    }

    static StorageAdapterBase;

}

export {
    StorageAdapterBase
};

export default GCSAdapter;
