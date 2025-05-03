require('@tryghost/config');
var errors = require('lo/errors');
require('node:path');

class GCSAdapterError extends errors.BaseError {
    static code = 'ERR_GCS_ADAPTER';
}

exports.GCSAdapterError = GCSAdapterError;
