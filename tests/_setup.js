const chai = require('chai');

beforeEach(() => {
    global.assert = chai.assert;
    global.expect = chai.expect;
    global.should = chai.should();
});
