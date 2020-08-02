# Ghost GCS Storage Adapter
Google Cloud Storage adapter for [ghost](https://ghost.org/) cms platform

Features:
* Easy to use
* Bucket configuration
* Custom protocol and host settings for cdn use
* Custom gcs storage options support
* Hashing algorithm configuration
* Asset path prefixes
* Support for generating unique file names on duplicates
* Custom file name templating

## About
I wanted to deploy [ghost](https://ghost.org/) in a HA environment using gcs as a storage backend, but the current options were out of date or didn't support custom hostnames and/or hashing. This library lets you store ghost assets to gcs with many options for using path prefixes, custom domains, content hashing, and file name templating.

## Usage
### Options
name | type | description
-----|----- | -----------
`bucket` | *`string`* | GCS bucket name. Default is `undefined`
`protocol` | *`string`* | What protocol to use for absolute urls. Default is `https`
`host` | *`string`* | What host to use for absolute urls. You can read about accessing public buckets [here](https://cloud.google.com/storage/docs/access-public-data). Default is `storage.googleapis.com`
`storageOptions` | *`object`* | Custom [storage options](https://googleapis.dev/nodejs/storage/latest/global.html#StorageOptions) for configuring the GCS client. Default is `undefined`
`hash` | *`boolean`* | Wether or not to generate a hash from file contents. Default is `false`
`hashAlgorithm` | *`string`* | Which hashing algorithm to use when generating hashes. Default is `md5`
`hashLength` | *`number`* | Length of hash to use in hash string output. This slice is taken from the end of the string. Setting `0` will use the full hash. Default is `16`
`prefix` | *`string`* | Prefix to use for gcs bucket path. If set, the gcs file path will become: `$prefix/$dir/$filename`. Default is `undefined`
`unique` | *`boolean`* | Wether or not to create unique filenames for duplicate uploads. Default is `true`
`template` | *`string`* | Template string for file names. If `hash` enabled default is: `{{hashstr}}{{ext}}`, otherwise: `{{basename}}{{ext}}`
`incremental` | *`boolean`* | If `true` and `unique` is enabled it will use the ghost default incremental algorithm for file names, appending an integer to the basename. This can be really slow because it has to check if the filepath exists in the bucket for each iteration. If `false` and `unique` is enabled it will just append random bytes to either the hash or the basename. Default is `false`

### Installation
There are currently [3 places](https://github.com/TryGhost/Ghost/blob/3.26.1/core/server/services/adapter-manager/index.js#L7) where ghost will look for storage adapters by default:
```bash
/var/lib/ghost/current/node_modules/storage
/var/lib/ghost/content/adapters/storage -- content path setting
/var/lib/ghost/current/core/server/adapters/storage
```

This means you need to install the plugin and it's dependencies at one of those locations. If you are using a `Dockerfile`, you can do so like this:
```dockerfile
RUN mkdir -p /tmp/gcs ${GHOST_CONTENT}/adapters/storage/gcs && \
    wget -O - "$(npm view @danmasta/ghost-gcs-adapter dist.tarball)" | tar xz -C /tmp/gcs && \
    npm install --prefix /tmp/gcs/package --silent --only=production --no-optional --no-progress && \
    mv /tmp/gcs/package/* ${GHOST_CONTENT}/adapters/storage/gcs
```

Keep in mind that the default ghost docker image creates a [volume](https://github.com/docker-library/ghost/blob/83cacc75655bf26aae65465d66fd1b981e9203d5/3/alpine/Dockerfile#L66) at your ghost content path. This means any changes after the `VOLUME` declaration will be discarded, and you can't add new files to the content dir. You will need to install to another path, or move the files during a run time script after volume mounting.

### Configuration
#### JSON via [ghost config](https://ghost.org/docs/concepts/config/)
```js
{
    "storage": {
        "active": "gcs",
        "gcs": {
            "bucket": "my-gcs-bucket",
            "host": "storage.googleapis.com",
            "protocol": "https",
            "hash": true,
            "hashAlgorithm": "sha512",
            "hashLength": "16"
        }
    }
}
```

#### ENV Variables
```bash
storage__active=gcs
storage__gcs__bucket=my-gcs-bucket
storage__gcs__host=storage.googleapis.com
storage__gcs__protocol=https
storage__gcs__hash=true
storage__gcs__hashAlgorithm=sha512
storage__gcs__hashLength=16
```

### Authentication
The easiest way to authenticate is to use a service account key and set the [application default credentials](https://cloud.google.com/docs/authentication/production) environment variable:
```
GOOGLE_APPLICATION_CREDENTIALS=/var/secrets/google/key.json
```

You can also pass in a custom credential key file path or credentials object via the `storageOptions` setting, see [here](https://googleapis.dev/nodejs/storage/latest/global.html#StorageOptions):
```js
{
    "storage": {
        "active": "gcs",
        "gcs": {
            "storageOptions": { ... }
        }
    }
}
```

## Testing
Testing is currently run using mocha and chai. To execute tests just run `npm run test`. To generate unit test coverage reports just run `npm run coverage`

## Contact
If you have any questions feel free to get in touch
