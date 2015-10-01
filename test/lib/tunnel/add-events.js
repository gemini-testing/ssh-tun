import EventEmitter from 'events';
import { Readable } from 'stream';

import sinon from 'sinon';
import { expect } from 'chai';
import rewire from 'rewire';

import Connection from 'ssh2';

let Tunnel = rewire('../../../lib/tunnel');

describe('Tunnel#addEvents', () => {
  var to;
  var from;
  var logger;
  var tunnel;
  var stubs = {};

  beforeEach(() => {
    from = {
      hostname: 'a',
      port: 1,
      key: __filename
    };

    to = {
      username: 'me',
      hostname: 'b',
      port: 2
    };

    logger = { info: () => {}, error: () => {} };

    tunnel = new Tunnel(from, to, logger);

    var EE;

    // For Node .10
    if (typeof EventEmitter === 'object') {
      EE = EventEmitter.EventEmitter;
    } else {
      EE = EventEmitter;
    }

    tunnel.connection = new EE();
    tunnel.connection.forwardIn = sinon.stub();
  });

  afterEach(() => {
    for (let stub in stubs) {
      stubs[stub].restore();
    }
  });

  it('should deal with "tcp connection"', () => {
    let stream = {
      pipe: sinon.stub(),
      pause: sinon.stub(),
      resume: sinon.stub()
    };

    let socket = {
      pipe: sinon.stub()
    };

    let net = {
      connect: sinon.stub().returns(socket)
    };

    tunnel.addEvents();

    Tunnel.__set__('net', net);

    tunnel.connection.emit('tcp connection', 1, function() {
      return stream;
    }, 2);

    expect(stream.pause.calledOnce).to.equal(true);
    expect(net.connect.calledOnce).to.equal(true);

    let args = net.connect.getCall(0).args;

    expect(args[0]).to.equal(1);
    expect(args[1]).to.equal('a');

    expect(stream.resume.callCount).to.equal(0);

    args[2].call();

    expect(stream.pipe.getCall(0).args[0]).to.equal(socket);
    expect(socket.pipe.getCall(0).args[0]).to.equal(stream);
    expect(stream.resume.callCount).to.equal(1);
  });

  it('should deal with "ready" event', function() {
    stubs = {
      info: sinon.stub(logger, 'info')
    };

    tunnel.addEvents();
    tunnel.connection.emit('ready');

    var args = logger.info.getCall(0).args;
    expect(args[0]).to.equal('Connection to %s:%s is established');
    expect(args[1]).to.equal('b');
    expect(args[2]).to.equal(2);

    args = tunnel.connection.forwardIn.getCall(0).args;
    expect(args).to.contain('b', 2);

    expect(args[2]).to.be.a('function');
  });

  it('should correctly deal with error of "connection#forwardIn" method', function() {
    stubs = {
      error: sinon.stub(logger, 'error')
    };

    tunnel.addEvents();
    tunnel.connection.emit('ready');

    var args = tunnel.connection.forwardIn.getCall(0).args;
    expect(args[2]).to.be.a('function');

    args[2].call(this, {
      message: 'test'
    });

    expect(stubs.error.getCall(0).args[0]).to.equal('Forwarding issue %s');
    expect(stubs.error.getCall(0).args[1]).to.equal('test');
  });

  it('should correctly execute "connection#forwardIn" method', function() {
    stubs = {
      error: sinon.stub(logger, 'error')
    };

    tunnel.addEvents();
    expect(tunnel.promise.isResolved()).to.equal(false);
    tunnel.connection.emit('ready');

    var args = tunnel.connection.forwardIn.getCall(0).args;
    expect(args[2]).to.be.a('function');

    args[2].call(this);

    expect(stubs.error.callCount).to.equal(0);
    expect(tunnel.promise.isResolved()).to.equal(true);
  });

  it('should deal with "error" event', function() {
    stubs = {
      error: sinon.stub(logger, 'error'),
      reTry: sinon.stub(tunnel, 'reTry')
    };

    tunnel.addEvents();

    tunnel.connection.emit('error', {
      message: 'test'
    });

    expect(stubs.error.getCall(0).args[0]).to.equal('Connection error %s');
    expect(stubs.error.getCall(0).args[1]).to.equal('test');
    expect(stubs.reTry.calledOnce).to.equal(true);
  });

  it('should deal with "close" event without error', function() {
    stubs = {
      error: sinon.stub(logger, 'error'),
      info: sinon.stub(logger, 'info'),
      reTry: sinon.stub(tunnel, 'reTry')
    };

    tunnel.addEvents();

    tunnel.connection.emit('close');

    expect(stubs.error.callCount).to.equal(0);
    expect(stubs.info.calledOnce).to.equal(true);
    expect(stubs.info.getCall(0).args[0]).to.equal('Connection closed');
  });

  it('should deal with "close" event with error', function() {
    stubs = {
      error: sinon.stub(logger, 'error'),
      info: sinon.stub(logger, 'info'),
      reTry: sinon.stub(tunnel, 'reTry')
    };

    tunnel.addEvents();

    tunnel.connection.emit('close', {
      message: 'test'
    });

    expect(stubs.info.callCount).to.equal(0);
    expect(stubs.error.calledOnce).to.equal(true);

    expect(stubs.error.getCall(0).args[0]).to.equal('Connection error %s');
    expect(stubs.error.getCall(0).args[1]).to.equal('test');
  });
});
