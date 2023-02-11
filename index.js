const GhostStorageAdapterBase = require('ghost-storage-base');
const _ = require('lodash');
const Storage = require('@google-cloud/storage').Storage;
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const interpolate = require('@danmasta/interpolate');
const asciiCharMap = require('./lib/ascii-char-map');

const defaults = {
    bucket: undefined,
    protocol: 'https',
    host: 'storage.googleapis.com',
    storageOptions: undefined,
    hash: false,
    hashAlgorithm: 'md5',
    hashLength: 16,
    prefix: undefined,
    unique: true,
    template: undefined,
    incremental: false,
    asciiFolding: true,
    lowercase: false
};

class GhostGCSError extends Error {
    constructor (str) {
        let msg = `Ghost GCS Adapter Error: ${str}`;
        super(msg);
        Error.captureStackTrace(this, GhostGCSError);
        this.name = 'GhostGCSAdapterError';
        this.code = 'GCSADAPTERERROR';
    }
}

class GhostStorageAdapterGCS extends GhostStorageAdapterBase {

    constructor (opts) {

        super(opts);

        this.opts = opts = _.defaults(opts, defaults);

        if (!_.isString(opts.prefix)) {
            opts.prefix = '';
        }

        if (!_.isString(opts.host) || opts.host.length < 1) {
            opts.host = defaults.host;
        }

        if (!opts.template) {
            if (opts.hash) {
                opts.template = '{{hashstr}}{{ext}}';
            } else {
                opts.template = '{{basename}}{{ext}}';
            }
        }

        this.storage = new Storage(opts.storageOptions);
        this.bucket = this.storage.bucket(opts.bucket);

    }

    // generates a hash string of image contents
    // accepts a ghost image object
    // returns promose that resolves with image object
    getImageHashStr (image) {

        return new Promise((resolve, reject) => {

            if (this.opts.hash) {

                let stream = fs.createReadStream(image.path);

                image.hash = crypto.createHash(this.opts.hashAlgorithm);

                stream.on('error', err => {
                    reject(new GhostGCSError(err.message));
                });

                stream.on('end', () => {
                    resolve(image);
                });

                stream.on('data', chunk => {
                    image.hash.update(chunk);
                });

            } else {
                resolve(image);
            }

        });

    }

    // accepts a ghost image object
    // returns an absolute url path
    getGCSPathAbsolute (image) {

        let str = this.opts.protocol + '://';

        if (this.opts.host === defaults.host) {
            str += path.join(this.opts.host, this.opts.bucket, image.targetDir, image.name);
        } else {
            str += path.join(this.opts.host, image.targetDir, image.name);
        }

        return this.sanitize(str);

    }

    // accepts a ghost image object
    // returns a relative url path
    getGCSPathRelative (image) {

        let str = path.join(image.targetDir, image.name);

        return this.sanitize(str);

    }

    // accepts a ghost image object
    // returns a promise that resolves with a ghost image object after upload completes
    uploadGCSImage (image) {

        return new Promise((resolve, reject) => {

            let read = fs.createReadStream(image.path);
            let write = this.bucket.file(image.gcsPathRelative).createWriteStream();

            read
            .on('error', err => {
                reject(new GhostGCSError(err.message));
            })
            .pipe(write)
            .on('error', err => {
                reject(new GhostGCSError(err.message));
            })
            .on('finish', res => {
                resolve(image);
            });

        });

    }

    // handles hashing and desired unique-ness of filenames
    // accepts a ghost image object
    // returns string file name
    getGCSImageName (image) {

        if (this.opts.hash && image.hash) {

            if (this.opts.unique) {
                if (!this.opts.incremental) {
                    image.hash.update(crypto.randomBytes(20));
                }
            }

            image.hashstr = image.hash.digest('hex').slice(-this.opts.hashLength);

        } else {

            if (this.opts.unique) {
                if (!this.opts.incremental) {
                    image.basename += '-' + crypto.randomBytes(3).toString('hex');
                }
            }

        }

        return interpolate.parse(this.opts.template, { params: image });

    }

    // extends a ghost image object with additional fields
    // accepts a ghost image object and optional targetDir
    // returns an image object
    getGCSImage (image, targetDir) {

        image.targetDir = path.join(this.opts.prefix, targetDir || this.getTargetDir());
        image.basename = path.basename(image.name, image.ext);
        image.hash = null;
        image.hashstr = '';

        return this.getImageHashStr(image).then(image => {

            image.name = this.getGCSImageName(image);

            if (this.opts.unique) {

                if (this.opts.incremental) {

                    return this.getUniqueFileName(image, image.targetDir).then(str => {
                        image.name = path.basename(str);
                        return image;
                    });

                }

            }

            return image;

        }).then(image => {

            image.gcsPathRelative = this.getGCSPathRelative(image);
            image.gcsPathAbsolute = this.getGCSPathAbsolute(image);

            return image;

        });

    }

    // check if file exists in remote bucket
    // returns promise that resolves with true or false
    exists (filename, targetDir) {

        let filepath = this.sanitize(path.join(targetDir || '', filename));

        return this.bucket.file(filepath).exists().then(res => {
            return res[0];
        });

    }

    // save a raw buffer at specified path
    saveRaw (buffer, filePath) {

        let gcsPathRelative = this.sanitize(filePath);
        let gcsPathAbsolute = this.getGCSPathAbsolute({ gcsPathRelative });

        return this.bucket.file(gcsPathRelative).save(buffer).then(() => {
            return gcsPathAbsolute;
        }).catch(err => {
            throw new GhostGCSError(err.message);
        });

    }

    // save file to gcs bucket
    // accepts a ghost image object and optional targetDir
    // returns a promise that resolves with an absolute url
    save (image, targetDir) {

        return this.getGCSImage(image, targetDir).then(image => {
            return this.uploadGCSImage(image);
        }).then(image => {
            return image.gcsPathAbsolute;
        }).catch(err => {
            if (err instanceof GhostGCSError) {
                throw err;
            } else {
                throw new GhostGCSError(err.message);
            }
        });

    }

    serve () {
        return function serveGhostGCSAdapter(req, res, next) {
            next();
        }
    }

    delete (file) {

        return this.bucket.file(this.sanitize(file)).delete().catch(err => {
            throw new GhostGCSError(err.message);
        });

    }

    read (file) {

        return new Promise((resolve, reject) => {

            let res = []
            let stream = this.bucket.file(this.sanitize(file)).createReadStream();

            stream.on('error', err => {
                reject(new GhostGCSError(err.message));
            });

            stream.on('end', () => {
                resolve(Buffer.concat(res));
            });

            stream.on('data', chunk => {
                res.push(chunk);
            });

        });

    }

    // remove leading slashses, add prefix if not set
    normalizeRelativePath (str) {

        // remove leading slashes
        str = str.replace(/^[\\\/]+/, '');

        if (str.indexOf(this.opts.prefix) !== 0) {
            str = path.join(this.opts.prefix, str);
        }

        // convert all backslashes
        str = str.replace(/[\\]+/g, '/');

        return str;

    }


    foldToASCII (str) {

        let res = '';

        for (let i = 0; i < str.length; i++) {
            let code = str.charCodeAt(i);
            if (code < 128) {
                res += str[i];
            } else {
                if (asciiCharMap[code] != undefined) {
                    res += asciiCharMap[code];
                } else {
                    res += str[i];
                }
            }
        }

        return res;

    }

    sanitize (str) {

        // strip xml control characters
        // https://cloud.google.com/storage/docs/objects#naming
        str = str.replace(/[\x7F-\x84\x86-\x9F]/g, '');

        // strip gcs wildcard and versioning characters
        // https://cloud.google.com/storage/docs/objects#naming
        str = str.replace(/[\[\]*?#]/g, '');

        // replace whitespace with hyphens
        str = str.replace(/\s+/g, '-');

        // fold to ascii
        if (this.opts.asciiFolding) {
            str = this.foldToASCII(str);
        }

        if (this.opts.lowercase) {
            str = str.toLowerCase();
        }

        // convert all slashes to forward slash
        str = str.replace(/(?<!:)\/\/+|\\+/g, '/');

        return str;

    }

    // override default ghost filename sanitization
    getSanitizedFileName (str) {
        return this.sanitize(str);
    }

}

module.exports = GhostStorageAdapterGCS;
