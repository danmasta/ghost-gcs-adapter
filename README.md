# Ghost GCS Storage Adapter
Google Cloud Storage adapter for [ghost](https://github.com/TryGhost/Ghost) CMS

#### Features:
* Easy to use
* Bucket and path prefix configuration
* Custom protocol and host settings for CDN use
* Custom GCS [storage options](https://googleapis.dev/nodejs/storage/latest/global.html#StorageOptions) configuration
* Hashing support and algorithm configuration
* Multiple options for generating unique file names and hashes
* Custom file name templating
* Sanitization of file names
* Support for removing diacritics
* Passthrough mode for hosting files from your ghost server
* Support for signed URLs
* Multiple [adapters](#adapters) for all content types (files, images, media)
* Works for ghost versions v4.x and v5.x

## About

## Usage
### Options
Name | Type | Description
-----|----- | -----------
`bucket` | *`string`* | GCS bucket name. Required. Default is `undefined`
`protocol` | *`string`* | Protocol to use for absolute URLs. Default is `https`
`host` | *`string`* | Host to use for absolute URLs. This can be your domain, CDN host name, load balancer IP address, etc. Default is `storage.googleapis.com`
`storage` | *`object`* | Custom [storage options](https://googleapis.dev/nodejs/storage/latest/global.html#StorageOptions) for configuring the underlying GCS client. Default is `undefined`
`hash` | *`boolean`* | Wether or not to generate a hash from file contents. Only used to set the file name template if not defined. Default is `false`
`hashAlgorithm` | *`string`* | Algorithm to use when generating hashes. Default is `md5`
`hashLength` | *`number`* | Length of hash to use in hash string output. Slice is taken from the end of the string. Setting `0` will use the full hash. Default is `16`
`prefix` | *`string`* | Prefix to use for file path. If set, the GCS file path will become: `PREFIX/TYPE/DIR/NAME`. Default is `undefined`
`template` | *`string`* | Template string for file name templating. If `hash` is `true` default is: `[hash][ext]`, otherwise: `[name][ext]`
`deburr` | *`boolean`* | Enable removal of diacritic marks. Default is `true`
`lowercase` | *`boolean`* | Convert all characters in the file name to lowercase. Default is `true`
`signed` | *`boolean`* | Enable using [signed URLs](https://cloud.google.com/storage/docs/access-control/signed-urls). Default is `false`
`expires` | *`number`* | Expiration time for signed URLs in milliseconds. Max value is 7 days. Default is `86400000` (24 hours)
`filename` | *`string`* | File name generation method. Options are: `original`, `originalhash`, `hash`, `unique`, `hashunique`, `random`, `ghost`, `custom`. Setting to `custom` will enable using the `template` option. Default is `original`
`virtual` | *`boolean`* | Enable using virtual hosted-style URLs (bucket name in host name) when serving from GCS. Default is `true`
`passthrough` | *`boolean`* | Enable serving files from your ghost server. Returned URLs are absolute based on your content path. All requested files get proxied from your ghost backend to GCS. Enables you to host files from private buckets. Default is `true`
`type` | *`string`* | Which [storage type](https://ghost.org/docs/config/#available-storage-features) to use. One of: `files`, `images`, `media`. Default is `images`


<!-- `unique` | *`boolean`* | Wether or not to create unique filenames for duplicate uploads. Default is `true`
`incremental` | *`boolean`* | If `true` and `unique` is enabled it will use the ghost default incremental algorithm for file names, appending an integer to the basename. This can be really slow because it has to check if the filepath exists in the bucket for each iteration. If `false` and `unique` is enabled it will just append random bytes to either the hash or the basename. Default is `false` -->

## Features
### Filenames
### Sanitization
There is some default sanitization of file names that always happens and a couple optional features like ascii folding and lowercasing.

The default sanitization includes removing xml control characters and GCS wildcard characters as noted [here](https://cloud.google.com/storage/docs/objects#naming) in the GCS documentation. It will also replace all whitespace with hypens, and convert all back slashes to forward slashes.

### Signed URLs

### Passthrough

### Adapters
This package exposes multiple storage adapter entrypoints for each storage type (files, images, media). You can configure each one separately and store to different backend buckets, prefixes, CDNs, hosts, etc. Or send them all to the same place, it's up to you.

When configuring the adapter name to use, you can use any of:
* `gcs`
* `gcs/files`
* `gcs/images`
* `gcs/media`

You can configure all 3 through ghost config or env variables. You can see examples here in [config.json](tests/config.json) and [.env](tests/.env).

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
```json
{
    "storage": {
        "active": "gcs",
        "gcs": {
            "bucket": "bucket-name",
            "host": "storage.googleapis.com",
            "protocol": "https",
            "filename": "hash",
            "hashAlgorithm": "sha512",
            "hashLength": "16"
        }
    }
}
```

### Environment Variables
```sh
storage__active=gcs
storage__gcs__bucket=bucket-name
storage__gcs__host=storage.googleapis.com
storage__gcs__protocol=https
storage__gcs__filename=hash
storage__gcs__hashAlgorithm=sha512
storage__gcs__hashLength=16
```

### Authentication
The easiest way to authenticate is to use a service account key and set the [application default credentials](https://cloud.google.com/docs/authentication/production) environment variable:
```sh
GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/google/key.json
```

You can also pass in a custom credential key file path or credentials object via the `storage` setting, see [here](https://googleapis.dev/nodejs/storage/latest/global.html#StorageOptions):
```json
{
    "storage": {
        "active": "gcs",
        "gcs": {
            "storage": { ... }
        }
    }
}
```

## Testing
Tests are currently run using mocha and chai. To execute tests run `make test`. To generate unit test coverage reports run `make coverage`

## Contact
If you have any questions feel free to get in touch
