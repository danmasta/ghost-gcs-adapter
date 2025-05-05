var lo = require('lo');
var node_buffer = require('node:buffer');
var node_crypto = require('node:crypto');
var node_fs = require('node:fs');
var node_path = require('node:path');
var promises = require('node:stream/promises');
var node_url = require('node:url');
var constants = require('./constants.cjs');
var util = require('./util.cjs');

class GCSFile {

    // Note: Requires at least file.name to exist
    constructor (file, gcs, _dir, url) {
        if (!file || !gcs) {
            throw new util.GCSAdapterError('File object and Adapter instance are required');
        }
        let { contentPath } = gcs;
        let { bucket, prefix, type, passthrough, addPrefixToURL, addBucketToURL } = gcs.opts;
        let dir = _dir ?? file.dir;
        if (dir) {
            dir = lo.split(dir, constants.REGEX.path);
            if ((passthrough && !url) || dir[0] === contentPath) {
                if (dir[0] === contentPath) {
                    dir.shift();
                }
                if (dir[0] === type) {
                    dir.shift();
                }
                if (prefix && addPrefixToURL && dir[0] === prefix) {
                    dir.shift();
                }
            } else {
                if (addBucketToURL && dir[0] === bucket) {
                    dir.shift();
                }
                if (prefix && addPrefixToURL && dir[0] === prefix) {
                    dir.shift();
                }
                if (dir[0] === type) {
                    dir.shift();
                }
            }
            file.dir = node_path.join(...dir);
        } else {
            file.dir = gcs.getTargetDir();
        }
        if (!file.ext) {
            file.ext = node_path.extname(file.name);
        }
        if (!file.base) {
            file.base = file.name;
            file.name = node_path.basename(file.name, file.ext);
        }
        this.file = file;
        this.gcs = gcs;
        this.computed = null;
        this.local = !!file.path;
    }

    // Create GCS file instance from a path string
    // Eg: '/size/w1000/2025/05/962ddac76cbed183.png'
    static fromPath (path, gcs, _dir) {
        if (!path) {
            throw new util.GCSAdapterError('Path is required');
        }
        let { dir, base, name, ext } = node_path.parse(path);
        return new GCSFile({
            base,
            name,
            ext,
            path: null,
            dir
        }, gcs, _dir);
    }

    // Create GCS file instance from a file object
    // Eg: { name: 'logo.png', path: '/tmp/1dcfb58793ac8c55126faf8f0baed066' }
    static fromFile (file, gcs, dir) {
        return new GCSFile(file, gcs, dir);
    }

    // Create GCS file instance from a URL (serve path) string
    // Eg: http://localhost:2368/content/media/2025/05/ac7eda454295301a.mp4
    // Eg: /content/images/2025/05/7a472491071c0b5c.png
    static fromURL (urlOrPath, gcs) {
        if (!urlOrPath) {
            throw new util.GCSAdapterError('URL is required');
        }
        let url, abs;
        if (urlOrPath.includes('://')) {
            url = new node_url.URL(urlOrPath);
            abs = true;
        } else {
            url = node_url.pathToFileURL(urlOrPath);
        }
        let { dir, base, name, ext } = node_path.parse(url.pathname);
        return new GCSFile({
            base,
            name,
            ext,
            path: null,
            dir
        }, gcs, undefined, abs);
    }

    // Get serve path (return path for ghost)
    async serve () {
        let { signed, passthrough } = this.gcs.opts;
        if (signed) {
            return this.getSignedUrl();
        }
        if (passthrough) {
            return this.passthrough();
        }
        return this.absolute();
    }

    // Absolute GCS signed URL
    // https://cloud.google.com/storage/docs/access-control/signed-urls
    // https://googleapis.dev/nodejs/storage/latest/File.html#getSignedUrl
    // Note: Regular ADC crendentials won't work. You need to either
    //   download a service account key json file from the cloud console or
    //   use service account impersonation:
    // https://cloud.google.com/iam/docs/service-account-types#default
    // gcloud auth application-default login --impersonate-service-account $SERVICE_ACCOUNT_EMAIL
    // Note: You need to have the "Service Account Token Creator" role in gcloud IAM
    // https://cloud.google.com/docs/authentication/use-service-account-impersonation#required-roles
    // Note: Max expires time is 7 days
    async getSignedUrl () {
        let { expires, virtual } = this.gcs.opts;
        let [url] = await this.gcsFile().getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + expires,
            virtualHostedStyle: virtual
        });
        return url;
    }

    // Absolute URL path for serving from ghost content path
    // Note: Includes content path
    // Note: Needs to be absolute otherwise path will be relative to ghost admin
    passthrough () {
        let { file, gcs, computed } = this;
        let { dir, base } = file;
        let { contentPath } = gcs;
        let { type, prefix, addPrefixToURL } = gcs.opts;
        let path = [contentPath, type];
        // Note: Optionally add prefix to URL path
        if (prefix && addPrefixToURL) {
            path.push(prefix);
        }
        path.push(dir, computed || base);
        return gcs.sanitize('/' + node_path.join(...path));
    }

    // Absolute path to GCS bucket or hostname
    absolute () {
        let { file, gcs, computed } = this;
        let { dir, base } = file;
        let { type, prefix, protocol, host, bucket, virtual, addBucketToURL, addPrefixToURL } = gcs.opts;
        let path = [host];
        // Note: Only needed for GCS paths
        if (addBucketToURL) {
            path.push(bucket);
        }
        // Note: Optionally add prefix to URL path (Required for GCS paths)
        if (prefix && addPrefixToURL) {
            path.push(prefix);
        }
        path.push(type, dir, computed || base);
        return gcs.sanitize(protocol + '://' + node_path.join(...path));
    }

    // Relative object path in GCS
    // Note: Does not include content path
    relative () {
        let { file, gcs, computed } = this;
        let { dir, base } = file;
        let { prefix, type } = gcs.opts;
        // Note: Always add prefix to GCS object path
        return gcs.sanitize(node_path.join(prefix, type, dir, computed || base));
    }

    // Write to GCS from local path
    async upload () {
        await this.getComputedName();
        await promises.pipeline(
            this.fileReadStream(),
            this.gcsWriteStream()
        );
    }

    // Check if file exists in GCS
    async exists () {
        let [exists] = await this.gcsFile().exists();
        return exists;
    }

    // Read from GCS to Buffer
    async read () {
        let res = [];
        await promises.pipeline(
            this.gcsReadStream(),
            async function* (source) {
                for await (const chunk of source) {
                    res.push(chunk);
                }
            }
        );
        return node_buffer.Buffer.concat(res);
    }

    // Write to GCS from Buffer
    async write (buffer) {
        return this.gcsFile().save(buffer);
    }

    // Delete from GCS
    async delete () {
        return this.gcsFile().delete();
    }

    fileReadStream () {
        return node_fs.createReadStream(this.file.path);
    }

    gcsReadStream () {
        return this.gcsFile().createReadStream();
    }

    gcsWriteStream () {
        return this.gcsFile().createWriteStream();
    }

    gcsFile () {
        return this.gcs.bucket.file(this.relative());
    }

    async hash (random) {
        let { hashAlgorithm, hashLength } = this.gcs.opts;
        let hash = node_crypto.createHash(hashAlgorithm);
        await promises.pipeline(
            this.fileReadStream(),
            hash
        );
        if (random) {
            hash = hash.copy().update(node_crypto.randomBytes(32));
        }
        return hash.digest('hex').slice(-hashLength);
    }

    random (size=32) {
        let { hashLength } = this.gcs.opts;
        return node_crypto.randomBytes(size).toString('hex').slice(-hashLength);
    }

    async getComputedName () {
        let { file, gcs } = this;
        let { filename, template } = gcs.opts;
        let { name, base, dir, ext } = file;
        switch (filename) {
            // Keep original name
            case 'original':{
                break;
            }
            // Original name plus hash of contents
            case 'originalhash':{
                let hash = await this.hash();
                base = name + '-' + hash + ext;
                break;
            }
            // Hash of contents
            case 'hash': {
                let hash = await this.hash();
                base = hash + ext;
                break;
            }
            // Name plus random bytes
            case 'unique': {
                let bytes = this.random();
                base = name + '-' + bytes + ext;
                break;
            }
            // Hash of contents plus random bytes
            case 'hashunique': {
                let hash = await this.hash(true);
                base = hash + ext;
                break;
            }
            // Random bytes
            case 'random': {
                let bytes = this.random();
                base = bytes + ext;
                break;
            }
            // Defer to ghost default method
            case 'ghost': {
                // Note: Adds dir to basename, need to remove
                [file.name, file.base] = [file.base, file.name];
                base = gcs.getUniqueSecureFilePath(file, dir);
                [file.name, file.base] = [file.base, file.name];
                break;
            }
            // Custom user defined template
            case 'custom': {
                let hash;
                if (template.includes('hash')) {
                    hash = await this.hash();
                }
                base = template.replace(constants.REGEX.tpl, (match, key) => {
                    switch (key) {
                        case 'hash':
                            return hash;
                        case 'random':
                            return this.random();
                        default:
                            return file[key] ?? '';
                    }
                });
                break;
            }
        }
        return this.computed = base;
    }

}

const { fromPath, fromFile, fromURL } = GCSFile;

exports.GCSFile = GCSFile;
exports.default = GCSFile;
exports.fromFile = fromFile;
exports.fromPath = fromPath;
exports.fromURL = fromURL;
