export const REGEX = {
    // XML control characters
    // https://cloud.google.com/storage/docs/objects#naming
    xml: /[\x7F-\x84\x86-\x9F]/g,
    // GCS wildcard and versioning characters
    // https://cloud.google.com/storage/docs/objects#naming
    gcs: /[\[\]*?#]/g,
    whitespace: /\s+/g,
    slash: /(?<!:)\/\/+|\\+/g,
    tpl: /\[([^\[\]]+)\]/g,
    sep: /^[\\/]+|[\\/]+$/g,
    path: /[\\/]+/g
};

export const MAX_NAME_SIZE = 1024;
