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

        sandbox.stub(console, 'info');
        sandbox.stub(childProcess);
        childProcess.spawn.returns(ssh);
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('constructor', function () {
        it('should generate proxy host from host and ports range', function () {
            var tunnel = createTunnel({
                host: 'test_host',
                ports: { min: 0, max: 1 }
            });

            expect(tunnel.proxyHost).to.match(/test_host:\d+/);
        });

        it('should set port as passed in ports if min and max ports are same', function () {
            var tunnel = createTunnel({
                ports: { min: 8080, max: 8080 }
            });

            expect(tunnel.proxyHost).to.have.string(':8080');
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

                    expect(sshArgs[0]).to.match(/-R \d+:localhost:8080/);
                    expect(sshArgs).to.contain('remote_host')
                        .and.to.contain('-N')
                        .and.to.contain('-v');
                });

                it('should spawn tunnel via the default ssh port', function () {
                    createTunnel().open();

                    var sshArgs = childProcess.spawn.lastCall.args[1];

                    expect(sshArgs).to.contain('-p 22');
                });

                it('should spawn tunnel via the specified ssh port', function () {
                    createTunnel({ sshPort: 100500 }).open();

                    var sshArgs = childProcess.spawn.lastCall.args[1];

                    expect(sshArgs).to.contain('-p 100500');
                });

                it('should spawn tunnel to remote host using provided user ', function () {
                    tunnel = createTunnel({
                        host: 'remote_host',
                        user: 'user',
                        localport: 8080
                    });

                    tunnel.open();

                    var sshArgs = childProcess.spawn.lastCall.args[1];

                    expect(sshArgs).to.contain('user@remote_host');
                });

                it('should spawn tunnel with StrictHostKeyChecking=no if host verification is disabled', function () {
                    tunnel = createTunnel({
                        strictHostKeyChecking: false
                    });

                    tunnel.open();

                    var sshArgs = childProcess.spawn.lastCall.args[1];

                    expect(sshArgs).to.contain('-o StrictHostKeyChecking=no');
                });

                it('should spawn tunnel with provided identity file disabled', function () {
                    tunnel = createTunnel({
                        identity: '~/.ssh/id_rsa_alt'
                    });

                    tunnel.open();

                    var sshArgs = childProcess.spawn.lastCall.args[1];

                    expect(sshArgs).to.contain('-i ~/.ssh/id_rsa_alt');
                });

                it('should spawn tunnel with "Compression" param if compression is provided', function () {
                    tunnel = createTunnel({
                        compression: true
                    });

                    tunnel.open();

                    var sshArgs = childProcess.spawn.lastCall.args[1];

                    expect(sshArgs).to.contain('-o Compression=yes');
                });

                it('should spawn tunnel without "Compression" param if compression is undefined', function () {
                    tunnel = createTunnel();

                    tunnel.open();

                    var sshArgs = childProcess.spawn.lastCall.args[1];

                    expect(sshArgs).to.not.contain('-o Compression');
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

                    expect(tunnel.proxyHost).to.match(/^some_ssh_host:\d+/);
                });

                it('should spawn tunnel without deprecated ssh-rsa key algorithms by default', function () {
                    tunnel = createTunnel();

                    tunnel.open();

                    var sshArgs = childProcess.spawn.lastCall.args[1];

                    expect(sshArgs).to.not.contain('-o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedKeyTypes=+ssh-rsa');
                });

                it('should spawn tunnel with ssh-rsa if enableDeprecatedSshRsa option was passed', function () {
                    tunnel = createTunnel({ enableDeprecatedSshRsa: true });

                    tunnel.open();

                    var sshArgs = childProcess.spawn.lastCall.args[1];

                    expect(sshArgs).to.contain('-o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedKeyTypes=+ssh-rsa');
                });

                it('should reject tunnel opening if failed to create tunnel', function () {
                    tunnel = createTunnel();

                    var openPromise = tunnel.open();

                    ssh.stderr.emit('data', 'failed');

                    expect(openPromise).to.be.rejected;
                });

                it('should do nothing if fail occured in stderr after successful tunnel opening', function () {
                    tunnel = createTunnel();

                    tunnel.open();
                    ssh.stderr.emit('data', 'success');
                    ssh.stderr.emit('data', 'failed');

                    expect(console.info)
                        .to.be.not.calledWith(util.format('ERROR: failed to create tunnel to %s.', tunnel.proxyHost));
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

            it('should emit close event', function () {
                tunnel = createTunnel();
                tunnel.open();

                var closeHandler = sandbox.stub();
                tunnel.on('close', closeHandler);
                ssh.emit('close', null, 'SIGKILL');

                return expect(closeHandler).to.be.calledWith(null, 'SIGKILL');
            });

            it('should emit exit event', function () {
                tunnel = createTunnel();
                tunnel.open();

                var exitHandler = sandbox.stub();
                tunnel.on('exit', exitHandler);
                ssh.emit('exit', 0, null);

                return expect(exitHandler).to.be.calledWith(0, null);
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
