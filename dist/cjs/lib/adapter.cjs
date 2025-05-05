var storage = require('@google-cloud/storage');
var config = require('@tryghost/config');
var GhostErrors = require('@tryghost/errors');
var StorageAdapterBase = require('ghost-storage-base');
var lo = require('lo');
var promises = require('node:stream/promises');
var constants = require('./constants.cjs');
var file = require('./file.cjs');
var util = require('./util.cjs');

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
    type: 'images',
    addPrefixToURL: false
};

class GCSAdapter extends StorageAdapterBase {

    constructor (opts) {
        super(opts);
        this.opts = opts = lo.defaults(opts, defs);
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
        opts.addBucketToURL = false;
        if (opts.host === defs.host) {
            opts.addPrefixToURL = true;
            if (opts.virtual) {
                opts.host = opts.bucket + '.' + opts.host;
            } else {
                opts.addBucketToURL = true;
            }
        }
        if (opts.signed) {
            opts.addPrefixToURL = true;
            if (!opts.virtual) {
                opts.addBucketToURL = true;
            }
        }
        this.contentPath = config.get('paths:contentPath') ?? 'content';
        this.storage = new storage.Storage(opts.storage);
        this.bucket = this.storage.bucket(opts.bucket);
    }

    fromPath (path, dir) {
        return file.fromPath(path, this, dir);
    }

    fromFile (file$1, dir) {
        return file.fromFile(file$1, this, dir);
    }

    fromURL (url) {
        return file.fromURL(url, this);
    }

    // Check if file exists in GCS
    // Accepts a file path/name and optional target dir
    // Returns Boolean
    // Note: Used by image size (srcset) middleware
    // https://github.com/TryGhost/Ghost/blob/80aa346307fd3e6e57465cebdde4a8a292c722f3/ghost/core/core/frontend/web/middleware/handle-image-sizes.js#L114
    async exists (path, dir) {
        const file = this.fromPath(path, dir);
        return file.exists();
    }

    // Read file from GCS as Buffer
    // Accepts a file path/name
    // Returns Buffer
    // Note: Used by image size (srcset) middleware
    // https://github.com/TryGhost/Ghost/blob/80aa346307fd3e6e57465cebdde4a8a292c722f3/ghost/core/core/frontend/web/middleware/handle-image-sizes.js#L121
    async read ({ path }={}) {
        const file = this.fromPath(path);
        try {
            return file.read();
        } catch (err) {
            throw new util.GCSAdapterError(err.message);
        }
    }

    // Save file to GCS
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
            throw new util.GCSAdapterError(err.message);
        }
    }

    // Save a raw Buffer to GCS
    // Acceps a file Buffer and file path/name
    // Returns the computed path String to serve file from
    // Note: Used by image size (srcset) middleware
    // https://github.com/TryGhost/Ghost/blob/80aa346307fd3e6e57465cebdde4a8a292c722f3/ghost/core/core/frontend/web/middleware/handle-image-sizes.js#L135
    async saveRaw (buffer, path) {
        const file = this.fromPath(path);
        try {
            await file.write(buffer);
            return file.serve();
        } catch (err) {
            throw new util.GCSAdapterError(err.message);
        }
    }

    // Delete file from GCS
    // Accepts a file path/name and optional target dir
    // Returns Undefined or throws Error on failure
    // Note: Used in media handler
    // https://github.com/TryGhost/Ghost/blob/6af4d8f01df657ad9ba425f7ac78b50d0088068d/ghost/core/core/server/api/endpoints/media.js#L44C36-L44C42
    async delete (path, dir) {
        const file = this.fromPath(path, dir);
        try {
            await file.delete();
        } catch (err) {
            // Note: Ignore Not Found error until media handler is patched
            // https://github.com/TryGhost/Ghost/pull/23156
            if (err.code === 404) {
                return;
            }
            throw new util.GCSAdapterError(err.message);
        }
    }

    // Serve GCS files from content path
    // Note: Serve handler only gets called on getContentPath(TYPE)
    // If we enable passthrough and return URLs other than contentPath/TYPE (absolute)
    // this route handler will not get called
    serve () {
        const gcs = this;
        return async function GCSAdapterServe (req, res, next) {
            let file;
            try {
                file = gcs.fromPath(req.path);
                // Note: Need to set some headers
                await promises.pipeline(
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

    // Convert a computed serve url to GCS relative path
    // Accepts a computed serve url (returned from save, saveRaw)
    // Returns a GCS relative path
    // Note: Used in media and image handlers
    // https://github.com/TryGhost/Ghost/blob/6af4d8f01df657ad9ba425f7ac78b50d0088068d/ghost/core/core/server/api/endpoints/media.js#L39
    // https://github.com/TryGhost/Ghost/blob/6af4d8f01df657ad9ba425f7ac78b50d0088068d/ghost/core/core/server/api/endpoints/images.js#L61
    urlToPath (url) {
        const file = this.fromURL(url);
        return file.relative();
    }

    // Sanitize file paths for GCS
    // https://cloud.google.com/storage/docs/objects#naming
    sanitize (str='') {
        const { opts } = this;
        // Remove XML control characters
        str = str.replace(constants.REGEX.xml, '');
        // Remove GCS wildcard and versioning characters
        str = str.replace(constants.REGEX.gcs, '');
        // Replace whitespace with hyphens
        str = str.replace(constants.REGEX.whitespace, '-');
        // Remove diacritics
        if (opts.deburr ?? opts.asciiFolding) {
            str = lo.deburr(str);
        }
        // Lowercase
        if (opts.lowercase) {
            str = str.toLowerCase();
        }
        // Replace slashes with forward slash
        return str.replace(constants.REGEX.slash, '/');
    }

    sanitizeFileName (str) {
        return this.sanitize(str);
    }

    getSanitizedFileName (str) {
        return this.sanitize(str);
    }

    static StorageAdapterBase;

}

exports.StorageAdapterBase = StorageAdapterBase;
exports.GCSAdapter = GCSAdapter;
exports.default = GCSAdapter;
