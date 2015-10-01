import {readFileSync as read} from 'fs';

import sinon from 'sinon';
import { expect } from 'chai';
import rewire from 'rewire';

let Tunnel = rewire('../../../lib/tunnel');

describe('Tunnel methods', () => {
  var path = Tunnel.__get__('path');

  // babel side effect :-(
  var Connection = Tunnel.__get__('_ssh22');

  beforeEach(() => {
    sinon.stub(Connection, 'default', () => {
      return {
        connect: sinon.stub(),
        on: sinon.stub(),
        end: sinon.stub()
      };
    });
    sinon.stub(path, 'join', () => __filename);
  });

  afterEach(() => {
    path.join.restore();
    Connection.default.restore();
  });

  describe('Tunnel#connect', () => {
    it('should invoke ssh "connect" method', () => {
      let from = {
        hostname: 'a',
        port: 1,
        key: __filename
      };

      let to = {
        username: 'me',
        hostname: 'b',
        port: 2
      };

      let tunnel = new Tunnel(from, to);
      tunnel.connect(2);

      var call = tunnel.connection.connect.getCall(0).args[0];
      expect(call.host).to.equal('b');
      expect(call.port).to.equal(22);
      expect(call.username).to.equal('me');
      expect(call.privateKey).to.be.an.instanceof(Buffer);

      expect(tunnel.retryTimes).to.equal(2);
    });

    it('should invoke ssh "connect" method without arguments', () => {
      let from = {
        hostname: 'a',
        port: 1,
        key: __filename
      };

      let to = {
        username: 'me',
        hostname: 'b',
        port: 2
      };

      let tunnel = new Tunnel(from, to);
      tunnel.connect();

      expect(tunnel.retryTimes).to.equal(0);
    });
  });

  describe('Tunnel#close', () => {
    it('should close connection', () => {
      let from = {
        hostname: 'a',
        port: 1,
        key: __filename
      };

      let to = {
        username: 'me',
        hostname: 'b',
        port: 2
      };

      let tunnel = new Tunnel(from, to);
      tunnel.connect();
      tunnel.close();

      expect(tunnel.connection.end.calledOnce).to.equal(true);
    });
  });

  describe('Tunnel#reTry', () => {
    var stubs = {};

    afterEach(() => {
      for (let stub in stubs) {
        stubs[stub].restore();
      }
    });

    it('should try to reconnect when there is no more attemps', () => {
      let from = {
        hostname: 'a',
        port: 1
      };

      let to = {
        username: 'me',
        hostname: 'b',
        port: [1,5]
      };

      let logger = { info: () => {}};

      let tunnel = new Tunnel(from, to, logger);
      stubs = {
        info: sinon.stub(logger, 'info'),
        addEvents: sinon.stub(tunnel, 'addEvents'),
        connect: sinon.stub(tunnel, 'connect')
      };

      let promise = tunnel.promise;

      tunnel.connect();
      tunnel.reTry('test');

      return promise.fail((error) => {
        expect(error).to.equal('test');

        expect(stubs.info.callCount).to.equal(0);
        expect(stubs.addEvents.callCount).to.equal(0);
        expect(stubs.connect.callCount).to.equal(1);
        expect(tunnel.connection.end.callCount).to.equal(0);
      });
    });

    it('should try to reconnect when there is one more attemp', () => {
      let from = {
        hostname: 'a',
        port: 1
      };

      let to = {
        username: 'me',
        hostname: 'b',
        port: [1,5]
      };

      let logger = { info: () => {} };

      let tunnel = new Tunnel(from, to, logger);
      stubs = {
        info: sinon.stub(logger, 'info'),
        addEvents: sinon.stub(tunnel, 'addEvents')
      };

      let promise = tunnel.promise;

      tunnel.connect(1);
      tunnel.reTry('test');
      tunnel.reTry('test');

      return promise.fail((error) => {
        expect(error).to.equal('test');

        expect(stubs.info.callCount).to.equal(1);
        expect(stubs.addEvents.callCount).to.equal(1);
        expect(tunnel.connection.connect.callCount).to.equal(1);
        expect(tunnel.connection.end.callCount).to.equal(0);

        expect(stubs.info.getCall(0).args[0]).to.equal('Retrying to connect, %s tries left');
        expect(stubs.info.getCall(0).args[1]).to.equal(1);
      });
    });
  });
});

