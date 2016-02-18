global.expect = require('chai').expect;
global.sinon = require('sinon');

require('chai')
    .use(require('sinon-chai'))
    .use(require('chai-as-promised'));
