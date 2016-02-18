var Tunnel = require('../'),
    _ = require('lodash'),
    q = require('q'),
    childProcess = require('child_process'),
    events = require('events'),
    util = require('util');

describe('Tunnel', function () {
    var sandbox = sinon.sandbox.create(),
        tunnel,
        ssh;

    beforeEach(function () {
        ssh = new events.EventEmitter();
        ssh.stderr = new events.EventEmitter();
        ssh.kill = sandbox.stub();

        sandbox.stub(childProcess);
        childProcess.spawn.returns(ssh);
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('constructor', function () {
        it('should generate proxy url from host and ports range', function () {
            var tunnel = createTunnel({
                host: 'test_host',
                ports: { min: 0, max: 1 }
            });

            expect(tunnel.proxyUrl).to.match(/test_host:\d+/);
        });

        it('should set port as passed in ports if min and max ports are same', function () {
            var tunnel = createTunnel({
                ports: { min: 8080, max: 8080 }
            });

            expect(tunnel.proxyUrl).to.have.string(':8080');
        });

        it('should set default timeout as 10 seconds', function () {
            var tunnel = createTunnel(),
                timeout = sandbox.stub(q.makePromise.prototype, 'timeout'); // promise constructor available like this?!

            tunnel.open();

            expect(timeout).to.be.calledWith(10000);
        });
    });

    describe('instance methods', function () {
        describe('open', function () {
            it('should return promise', function () {
                tunnel = createTunnel();

                var result = tunnel.open();

                expect(q.isPromise(result)).to.be.true;
            });

            describe('tunnel spawn and events', function () {
                it('should spawn ssh process', function () {
                    tunnel = createTunnel();

                    tunnel.open();

                    expect(childProcess.spawn).to.be.calledWith('ssh');
                });

                it('should spawn tunnel from localhost to remote host for provided local and remote ' +
                    'ports', function () {
                    tunnel = createTunnel({
                        host: 'remote_host',
                        localport: 8080
                    });

                    tunnel.open();

                    var sshArgs = childProcess.spawn.lastCall.args[1];

                    expect(sshArgs[0]).to.match(/-R:\d+:localhost:8080/);
                    expect(sshArgs).to.contain('remote_host')
                        .and.to.contain('-N')
                        .and.to.contain('-v');
                });

                it('should resolve promise if tunnel successfully created', function () {
                    tunnel = createTunnel();

                    var promise = tunnel.open();

                    ssh.stderr.emit('data', 'success');

                    return expect(promise).to.be.eventually.resolved;
                });

                it('should set resulting host and port to public variable', function () {
                    tunnel = createTunnel({
                        host: 'some_ssh_host'
                    });

                    tunnel.open();

                    ssh.stderr.emit('data', 'success');

                    expect(tunnel.proxyUrl).to.match(/^some_ssh_host:\d+/);
                });

                it('should reject tunnel opening if failed to create tunnel', function () {
                    tunnel = createTunnel();

                    var openPromise = tunnel.open();

                    ssh.stderr.emit('data', 'failed');

                    expect(openPromise).to.be.rejected;
                });

                it('should do nothing if fail occured in stderr after successful tunnel opening', function () {
                    tunnel = createTunnel();

                    var log = sandbox.stub(console, 'log');

                    tunnel.open();
                    ssh.stderr.emit('data', 'success');
                    ssh.stderr.emit('data', 'failed');

                    expect(log)
                        .to.be.not.calledWith(util.format('ERROR: failed to create tunnel to %s.', tunnel.proxyUrl));
                });

                it('should reject tunnel opening if error occured', function () {
                    tunnel = createTunnel();

                    var openPromise = tunnel.open();

                    ssh.emit('error');

                    expect(openPromise).to.be.rejected;
                });

                it('should close tunnel if close event received', function () {
                    tunnel = createTunnel();
                    tunnel.open();

                    var closePromise = tunnel.close();

                    ssh.emit('close');

                    return expect(closePromise).to.be.eventually.resolved;
                });
            });
        });

        describe('close', function () {
            it('should return resolved promise if no tunnel opened', function () {
                tunnel = createTunnel();

                expect(tunnel.close()).to.eventually.resolved;
            });

            it('should return promise if tunnel opened', function () {
                tunnel = createTunnel();
                tunnel.open();

                expect(q.isPromise(tunnel.close())).to.be.true;
            });

            it('should try to kill tunnel using SIGTERM', function () {
                tunnel = createTunnel();
                tunnel.open();
                tunnel.close();

                expect(ssh.kill).to.be.calledWith('SIGTERM');
                expect(ssh.kill).to.be.not.calledWith('SIGKILL');
            });

            it('should try to kill tunnel with SIGKILL if tunnel was not closed in 3000ms after ' +
                'SIGTERM', function () {
                var clock = sinon.useFakeTimers(),
                    closePromise;

                tunnel = createTunnel();
                tunnel.open();

                closePromise = tunnel.close();
                expect(ssh.kill).to.be.calledWith('SIGTERM');

                clock.tick(3100);

                return closePromise.then(function () {
                    expect(ssh.kill).to.be.calledWith('SIGKILL');
                    clock.restore();
                });
            });
        });
    });

    describe('static methods', function () {
        describe('openWithRetries', function () {
            beforeEach(function () {
                sandbox.stub(Tunnel.prototype);
                Tunnel.prototype.open.returns(q());
                Tunnel.prototype.close.returns(q());
            });

            it('should return promise', function () {
                var result = Tunnel.openWithRetries(defaultOpts());

                expect(q.isPromise(result)).to.be.true;
            });

            it('should try to open tunnel with passed opts', function () {
                var opts = defaultOpts();

                Tunnel.openWithRetries(opts);

                expect(Tunnel.prototype.__constructor).to.be.calledWith(opts);
            });

            it('should resolve promise if tunnel opened successfully', function () {
                Tunnel.prototype.open.returns(q());

                return expect(Tunnel.openWithRetries(defaultOpts())).to.be.eventually.resolved;
            });

            it('should resolve promise with tunnel instance', function () {
                Tunnel.prototype.open.returns(q());

                return Tunnel.openWithRetries(defaultOpts()).then(function (tunnel) {
                    expect(tunnel).to.be.instanceOf(Tunnel);
                });
            });

            it('should reject tunnel if failed to open tunnel after retries', function () {
                Tunnel.prototype.open.returns(q.reject());

                return expect(Tunnel.openWithRetries(defaultOpts)).to.be.eventually.rejected;
            });

            it('should retry to create tunnel 5 times by default', function () {
                Tunnel.prototype.open.returns(q.reject());

                return Tunnel.openWithRetries(defaultOpts()).fail(function () {
                    expect(Tunnel.prototype.open.callCount).to.be.equal(5);
                });
            });

            it('should retry create tunnel retries times', function () {
                Tunnel.prototype.open.returns(q.reject());

                return Tunnel.openWithRetries(defaultOpts(), 10).fail(function () {
                    expect(Tunnel.prototype.open.callCount).to.be.equal(10);
                });
            });
        });
    });
});

function createTunnel (opts) {
    opts = opts || {};

    _.defaults(opts, defaultOpts());

    return new Tunnel(opts);
}

function defaultOpts () {
    return {
        host: 'deafault_host',
        ports: { min: 0, max: 1 },
        localport: 0
    };
}
