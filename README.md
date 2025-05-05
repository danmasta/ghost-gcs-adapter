# Ghost GCS Storage Adapter
Google Cloud Storage adapter for [ghost](https://github.com/TryGhost/Ghost) CMS

#### Features:
* Easy to use
* Bucket and path prefix configuration
* Custom protocol and host settings for CDN use
* Custom GCS client [configuration](https://googleapis.dev/nodejs/storage/latest/global.html#StorageOptions)
* Hashing support and algorithm configuration
* Multiple options for generating unique file names and hashes
* Custom file name templating
* Sanitization of file names
* Support for removing diacritics
* [Passthrough](#passthrough) mode for hosting files from your ghost backend
* Support for using [signed URLs](#signed-urls)
* Multiple [adapters](#adapters) for each content type (files, images, media)
* Works for ghost versions v4.x and v5.x

## About
[Storage adapter](https://ghost.org/docs/config/#storage-adapters) for ghost CMS that allows you to store (and serve) content from GCS. Supports many configurable options including path prefixes, custom domains, CDNs, content hashing, file name templating, network passthrough, and signed URLs.

## Usage
### Options
Name | Type | Description
-----|----- | -----------
`bucket` | *`string`* | GCS bucket name. Required. Default is `undefined`
`protocol` | *`string`* | Protocol to use for absolute URLs. Default is `https`
`host` | *`string`* | Host to use for absolute URLs. This can be your domain, CDN host name, load balancer IP address, etc. Default is `storage.googleapis.com`
`storage` | *`object`* | Custom [storage options](https://googleapis.dev/nodejs/storage/latest/global.html#StorageOptions) for configuring the underlying GCS client. Default is `undefined`
`hash` | *`boolean`* | Whether or not to generate a hash from file contents. Only used to set the file name template if not defined. Default is `false`
`hashAlgorithm` | *`string`* | Algorithm to use when generating hashes. Default is `md5`
`hashLength` | *`number`* | Length of hash to use in hash string output. Slice is taken from the end of the string. Setting `0` will use the full hash. Default is `16`
`prefix` | *`string`* | Prefix to use for GCS object path. If set, the GCS file path will become: `PREFIX/TYPE/DIR/NAME`. Default is `undefined`
`template` | *`string`* | Template string for file name templating. If `hash` is `true` default is: `[hash][ext]`, otherwise: `[name][ext]`
`deburr` | *`boolean`* | Enable removal of diacritic marks. Default is `true`
`lowercase` | *`boolean`* | Convert all characters in the file name to lowercase. Default is `true`
`signed` | *`boolean`* | Enable using [signed URLs](#signed-urls). Default is `false`
`expires` | *`number`* | Expiration time for signed URLs in milliseconds. Max value is 7 days. Default is `86400000` (24 hours)
`filename` | *`string`* | File name generation method. Options are: `original`, `originalhash`, `hash`, `unique`, `hashunique`, `random`, `ghost`, `custom`. Setting to `custom` will enable using the `template` option. Default is `original`
`virtual` | *`boolean`* | Enable using virtual hosted-style URLs (bucket name in host name) when serving from GCS. Default is `true`
`passthrough` | *`boolean`* | Enable serving files from your ghost backend. Returned URLs are absolute based on your content path. All requested files get proxied from your ghost backend to GCS. Enables you to host files from private buckets. Default is `true`
`type` | *`string`* | Which [storage type](https://ghost.org/docs/config/#available-storage-features) to use. One of: `files`, `images`, `media`. Default is `images`
`addPrefixToURL` | *`string`* | Whether or not to also include prefix in URLs. Default is `false`

## Features
### File Names
You can configure file name generation a couple different ways. The simplest is using one of the pre-defined `filename` options:

Option | Description | Example
-------|-------------|--------
`original` | Keep the original file name | `logo.png`
`originalhash` | Original file name plus content hash | `logo-8b9d311d1039d23c.png`
`hash` | Content hash | `8b9d311d1039d23c.png`
`unique` | Original file name plus random bytes | `logo-0369f2920cec69db.png`
`hashunique` | Hash of content plus random bytes | `9ddf4fa107affb71.png`
`random` | Random bytes | `2a6ffa69076df2e1.png`
`ghost` | Defer to ghost's [`getUniqueSecureFilePath`](https://github.com/TryGhost/Ghost-Storage-Base/blob/5dbd3825845c2de36f2d5bc57a20235deb80f0e4/BaseStorage.js#L43) method | `logo-1a2b3c4d5e6f7890.png`
`custom` | Use custom user defined template | `[hash][random][ext]`

When the `filename` option is set to `custom`, it will use the `template` option and interpolate values from the file object properties plus a couple extra fields. The available fields are:

#### Images, Media:
```js
{
    fieldname: 'file',
    originalname: 'logo.png',
    encoding: '7bit',
    mimetype: 'image/png',
    destination: '/tmp',
    filename: '8c9c6d7981a5142d',
    path: '/tmp/8c9c6d7981a5142d_processed',
    size: 201125,
    name: 'logo',
    type: 'image/png',
    ext: '.png',
    dir: 'images/2025/05',
    base: 'logo.png',
    hash,
    random
}
```
#### Files:
```js
{
    name: 'logo',
    path: '/tmp/35a829d402d2a01b',
    dir: 'files/2025/05',
    ext: '.png',
    base: 'logo.png',
    hash,
    random
}
```

### Sanitization
There is some default sanitization of file names that always takes place and a couple optional features like removing diacritics and lowercasing.

The default sanitization includes removing XML control characters and GCS wildcard characters, as described in the GCS [docs](https://cloud.google.com/storage/docs/objects#naming). It will also replace all whitespace with hyphens, and convert all back slashes to forward slashes.

### Adapters
This package exposes multiple storage adapter entrypoints for each content type (files, images, media). You can configure each one separately and use different backend buckets, prefixes, CDNs, hosts, etc. Or send them all to the same place, it's up to you.

When configuring an adapter, you can use any of the following names:
* `gcs`
* `gcs/files`
* `gcs/images`
* `gcs/media`

You can configure all 3 through ghost config or env variables. You can see examples here in [config.json](tests/config.json) and [.env](tests/.env).

### Passthrough
Passthrough mode allows you to serve files like they were hosted directly on your ghost backend. It returns URLs that look like:
```
/content/images/2025/05/logo.png
```
When ghost receives a request for that URL, it is passed to the adapter's `serve()` handler, which will then lookup the file in GCS and stream the content back to the user. This is a highly flexible option that also allows you to serve content from private buckets. It's great for prototyping, testing, or lower traffic environments like dev, staging, etc.

A caveat, though, is that caching is entirely dependent on the user's browser configuration. And all bytes transmitted this way will incur network costs from your hosting provider, which are usually much higher than serving content from a CDN. For high traffic sites this can increase your network traffic usage quite a bit.

### Signed URLs
Using [signed URLs](https://cloud.google.com/storage/docs/access-control/signed-urls) is another way to serve sensitive and/or private content. It works by returning absolute signed URLs from GCS, which look [like](https://cloud.google.com/storage/docs/access-control/signed-urls#example):
```
https://storage.googleapis.com/example-bucket/content/images/2025/05/logo.png?X-Goog-Signature=SIGNATURE
```
A caveat here is that signed URLs are time limited and expire after a maximum of 7 days. After that they stop working and there is no way to refresh the file URLs in ghost currently.

It's a good option for short lived testing environments where you might want time limited URLs that expire. It's also good for local testing or prototyping with sensitive content you don't want public. Because of the expiring nature of the URLs, it's not really viable for long term production site usage, unless you want to manually delete and re-upload the files when they expire.

*Note: If testing signed URLs locally, you will need to authenticate as a [service account](#service-accounts)*

## Installation
There are [3 places](https://github.com/TryGhost/Ghost/blob/2d9443f89f12ccb26520f52be23df1118be960c2/ghost/core/core/server/services/adapter-manager/index.js#L8) ghost will look for storage adapters:
```
/var/lib/ghost/current/node_modules/storage
/var/lib/ghost/content/adapters/storage
/var/lib/ghost/current/core/server/adapters/storage
```
This means you need to install the plugin and it's dependencies at one of these locations. If you are using a `Dockerfile`, you can do so like:
```dockerfile
ARG GCS_ADAPTER_VERSION="master"
RUN mkdir -p /tmp/gcs && \
    curl -fsSL "https://api.github.com/repos/danmasta/ghost-gcs-adapter/tarball/${GCS_ADAPTER_VERSION}" | tar xz --strip-components=1 -C /tmp/gcs && \
    npm install --prefix /tmp/gcs --omit=dev --omit=optional --no-progress --loglevel error && \
    mv /tmp/gcs "${GHOST_INSTALL}/current/core/server/adapters/storage"
```
If you want to pin to a specific [version](https://github.com/danmasta/ghost-gcs-adapter/tags) you can do that too:
```sh
GCS_ADAPTER_VERSION=v1.0.2
```

## Configuration
### JSON via [Ghost Config](https://ghost.org/docs/config/#storage-adapters)
```js
{
    "storage": {
        "active": "gcs",
        "gcs": {
            "bucket": "example-bucket",
            "host": "storage.googleapis.com",
            "protocol": "https",
            "filename": "hash",
            "hashAlgorithm": "sha512",
            "hashLength": 16
        }
    }
}
```

### Environment Variables
```sh
storage__active=gcs
storage__gcs__bucket=example-bucket
storage__gcs__host=storage.googleapis.com
storage__gcs__protocol=https
storage__gcs__filename=hash
storage__gcs__hashAlgorithm=sha512
storage__gcs__hashLength=16
```

### Authentication
The easiest way to authenticate is to use a service account key and set the [application default credentials](https://cloud.google.com/docs/authentication#adc) environment variable:
```sh
GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/google/key.json
```
You can also pass in a custom credential key file path or credentials object via the `storage` setting, see [here](https://googleapis.dev/nodejs/storage/latest/global.html#StorageOptions):
```js
{
    "storage": {
        "active": "gcs",
        "gcs": {
            "storage": {
                ...
            }
        }
    }
}
```
### Service Accounts
If you want to generate signed URLs, you need to be authenticated as a [service account](https://cloud.google.com/iam/docs/service-account-overview). User ADC credentials don't work. This means you need to either download a service account key json file from the cloud console and configure that as the ADC credentials, or use [service account impersonation](https://cloud.google.com/iam/docs/service-account-impersonation). To use service account impersonation locally, you can run:
```sh
gcloud auth application-default login --impersonate-service-account $SERVICE_ACCOUNT_EMAIL
```
*Note: You will need to have the [`Service Account Token Creator`](https://cloud.google.com/docs/authentication/use-service-account-impersonation#required-roles) role in gcloud IAM. It is not enabled by default, even for project owners*

You can use the [default](https://cloud.google.com/iam/docs/service-account-types#default) service account, or create a new one. Then just make sure it has permissions to access the bucket you want to use.

## Testing
Tests are currently run using mocha and chai. To execute tests run `make test`. To generate unit test coverage reports run `make coverage`

### Ghost
If you want to test the adapter locally with ghost, you can run `make run` to start a ghost container with the adapter mounted inside. It will also mount your default gcloud ADC credentials. So if you are already authenticated with glcoud CLI, you just need to pass a bucket name as an argument or set it via the environment variable `GCS_TEST_BUCKET`.
```sh
make run BUCKET=example-bucket
```

## Contact
If you have any questions feel free to get in touch
