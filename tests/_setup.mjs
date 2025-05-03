import { assert, expect, should } from 'chai';
import { resolve } from 'node:path';
import { env } from 'node:process';
import { GCSAdapter } from '../lib/adapter.mjs';

const bucket = env.GCS_TEST_BUCKET;

const img = {
    icon: {
        fieldname: 'file',
        originalname: 'icon.png',
        encoding: '7bit',
        mimetype: 'image/png',
        destination: '/tmp',
        filename: '6a0523b857be3a123a14f34c1817de61', // md5
        path: resolve('tests/img/icon.png'),
        size: 20802,
        name: 'icon.png',
        type: 'image/png',
        ext: '.png'
    },
    logo: {
        fieldname: 'file',
        originalname: 'logo.png',
        encoding: '7bit',
        mimetype: 'image/png',
        destination: '/tmp',
        filename: '2c2fb0406e9d2d258b9d311d1039d23c', // md5
        path: resolve('tests/img/logo.png'),
        size: 201125,
        name: 'logo.png',
        type: 'image/png',
        ext: '.png'
    }
};

const gcs = new GCSAdapter({ bucket });

beforeEach(() => {
    global.assert = assert;
    global.expect = expect;
    global.should = should();
    global.GCSAdapter = GCSAdapter;
    global.gcs = gcs;
});
