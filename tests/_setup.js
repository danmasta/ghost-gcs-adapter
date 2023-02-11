const chai = require('chai');
const GhostGCSAdapter = require('../index');

beforeEach(() => {
    global.assert = chai.assert;
    global.expect = chai.expect;
    global.should = chai.should();
    global.GhostGCSAdapter = GhostGCSAdapter;
    global.adapter = new GhostGCSAdapter({
        bucket: 'test'
    });
    global.images = {
        test: {
            fieldname: 'file',
            originalname: 'test.jpg',
            encoding: '7bit',
            mimetype: 'image/jpeg',
            destination: '/tmp',
            filename: '863a23eb110d177eb4a8305817dcfe81',
            path: '/tmp/863a23eb110d177eb4a8305817dcfe81_processed',
            size: 320585,
            name: 'test.jpg',
            type: 'image/jpeg',
            ext: '.jpg'
        },
        space: {
            fieldname: 'file',
            originalname: 'test image.jpg',
            encoding: '7bit',
            mimetype: 'image/jpeg',
            destination: '/tmp',
            filename: '22a9cd23586cd2d323d854feddb3fa13',
            path: '/tmp/22a9cd23586cd2d323d854feddb3fa13_processed',
            size: 320585,
            name: 'test image.jpg',
            type: 'image/jpeg',
            ext: '.jpg'
        }
    }
});
