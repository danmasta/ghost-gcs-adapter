import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { basename, extname, join, parse } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { URL, pathToFileURL } from 'node:url';
import { REGEX } from './constants.mjs';
import { GCSAdapterError } from './util.mjs';

export class GCSFile {

    // Requires at least file.name to exist
    constructor (file, gcs, dir, type) {
        if (!file || !gcs) {
            throw new GCSAdapterError('File object and Adapter instance are required');
        }
        let { opts } = gcs;
        file.dir = join(opts.prefix, type ?? opts.type, dir ?? gcs.getTargetDir());
        if (!file.ext) {
            file.ext = extname(file.name);
        }
        if (!file.base) {
            file.base = file.name;
            file.name = basename(file.name, file.ext);
        }
        this.file = file;
        this.gcs = gcs;
        this.computed = null;
        this.local = !!file.path;
    }

    // Create gcs file instance from a path string
    // Eg: '/size/w1000/2025/05/962ddac76cbed183.png'
    static FromPath (path, gcs, target) {
        if (!path) {
            throw new GCSAdapterError('Path is required');
        }
        let { dir, base, name, ext } = parse(path);
        return new GCSFile({
            base,
            name,
            ext,
            path: null
        }, gcs, target || dir);
    }

    // Create gcs file instance from a file object
    // Eg: { name: 'logo.png', path: '/tmp/1dcfb58793ac8c55126faf8f0baed066' }
    static FromFile (file, gcs, dir) {
        return new GCSFile(file, gcs, dir);
    }

    // Create gcs file instance from a URL (serve path) string
    // Eg: http://localhost:2368/content/media/2025/05/ac7eda454295301a.mp4
    // Eg: /content/images/2025/05/7a472491071c0b5c.png
    static FromURL (urlOrPath, gcs) {
        if (!urlOrPath) {
            throw new GCSAdapterError('URL is required');
        }
        let { contentPath } = gcs;
        let { bucket, passthrough, addBucketToPath, type } = gcs.opts;
        let url;
        if (urlOrPath.includes('://')) {
            url = new URL(urlOrPath);
        } else {
            url = pathToFileURL(urlOrPath);
        }
        let { dir, base, name, ext } = parse(url.pathname);
        if (passthrough && dir.indexOf(contentPath) === 1) {
            dir = dir.slice(contentPath.length + 1);
        }
        if (addBucketToPath && dir.indexOf(bucket) === 1) {
            dir = dir.slice(bucket.length + 1);
        }
        if (dir.indexOf(type) === 1) {
            dir = dir.slice(type.length + 1);
        }
        return new GCSFile({
            base,
            name,
            ext,
            path: null
        }, gcs, dir, '');
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

    // Absolute path to gcs bucket or hostname
    absolute () {
        let { file, gcs, computed } = this;
        let { protocol, host, bucket, addBucketToPath } = gcs.opts;
        let proto = protocol + '://';
        if (computed) {
            if (addBucketToPath) {
                return proto + join(host, bucket, computed);
            } else {
                return proto + join(host, computed);
            }
        }
        if (addBucketToPath) {
            return gcs.sanitize(proto + join(host, bucket, file.dir, file.base));
        } else {
            return gcs.sanitize(proto + join(host, file.dir, file.base));
        }
    }

    // Relative path in gcs
    // Note: Does not include content path
    relative () {
        let { file, gcs, computed } = this;
        if (computed) {
            return computed;
        }
        return gcs.sanitize(join(file.dir, file.base));
    }

    // Absolute url path for serving from ghost content path
    // Note: Includes content path
    // Note: Needs to be absolute otherwise path will be relative to ghost admin
    passthrough () {
        let { file, gcs, computed } = this;
        if (computed) {
            return '/' + join(gcs.contentPath, computed);
        }
        return gcs.sanitize('/' + join(gcs.contentPath, file.dir, file.base));
    }

    // Absolute gcs signed url
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

    // Write to gcs from local path
    async upload () {
        await this.getComputedName();
        await pipeline(
            this.fileReadStream(),
            this.gcsWriteStream()
        );
    }

    // Check if file exists in gcs
    async exists () {
        let [exists] = await this.gcsFile().exists();
        return exists;
    }

    // Read from gcs to buffer
    async read () {
        let res = [];
        await pipeline(
            this.gcsReadStream(),
            async function* (source) {
                for await (const chunk of source) {
                    res.push(chunk);
                }
            }
        )
        return Buffer.concat(res);
    }

    // Write to gcs from buffer
    async write (buffer) {
        return this.gcsFile().save(buffer);
    }

    // Delete from gcs
    async delete () {
        return this.gcsFile().delete();
    }

    fileReadStream () {
        return createReadStream(this.file.path);
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
        let hash = createHash(hashAlgorithm);
        await pipeline(
            this.fileReadStream(),
            hash
        );
        if (random) {
            hash = hash.copy().update(randomBytes(8));
        }
        return hash.digest('hex').slice(-hashLength);
    }

    random (size=8) {
        let { hashLength } = this.gcs.opts;
        return randomBytes(size).toString('hex').slice(-hashLength);
    }

    async getComputedName () {
        let { file, gcs } = this;
        let { filename, template, hashLength } = gcs.opts;
        let { name, base, dir, ext } = file;
        switch (filename) {
            // Hash based on file contents
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
            // Hash based on file contents plus random bytes
            case 'hashunique': {
                let hash = await this.hash(true);
                base = hash + ext;
                break;
            }
            // Defer to ghost default method
            case 'ghost': {
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
                base = template.replace(REGEX.tpl, (match, key) => {
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
            default:
                break;
        }
        return this.computed = gcs.sanitize(join(dir, base));
    }

}

export const { FromPath, FromFile, FromURL } = GCSFile;

export default GCSFile;
