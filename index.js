'use strict';

var inherit = require('inherit'),
    q = require('q'),
    childProcess = require('child_process'),
    util = require('util'),
    EventEmitter = require('events').EventEmitter;

var DEFAULTS = {
    MAX_RETRIES: 5,
    CONNECT_TIMEOUT: 10000,
    SSH_PORT: 22
};

var Tunnel = inherit(EventEmitter, {
    /**
     * Constuctor
     * @param {object} opts tunnel options
     * @param {string} opts.host remote host address
     * @param {object} opts.ports remote host ports range
     * @param {number} opts.localport local port number
     * @param {string} [opts.user] remote host user
     * @param {string} [opts.sshPort=22] host port to create tunnel
     * @param {number} [opts.maxRetries=5] max attempts to create tunnel
     * @param {number} [opts.connectTimeout=10000] ssh connect timeout
     * @param {boolean} [opts.strictHostKeyChecking=true] verify host authenticity
     * @param {string} [opts.identity] private key for public key authentication
     * @param {boolean} [opts.compression] use compression
     */
    __constructor: function (opts) {
        EventEmitter.call(this);

        this.host = opts.host;
        this.port = this._generateRandomPort(opts.ports);
        this._sshPort = opts.sshPort || DEFAULTS.SSH_PORT;
        this.user = opts.user;
        this.proxyHost = util.format('%s:%d', this.host, this.port);
        this.proxyUrl = this.proxyHost; // deprecated, use proxyHost
        this._localPort = opts.localport;
        this._connectTimeout = opts.connectTimeout || DEFAULTS.CONNECT_TIMEOUT;
        this._tunnel = null;
        this._tunnelDeferred = q.defer();
        this._closeDeferred = q.defer();
        this._strictHostKeyChecking = opts.strictHostKeyChecking === undefined ? true : opts.strictHostKeyChecking;
        this._compression = opts.compression;
        this._identity = opts.identity;
    },

    /**
     * Tries to open ssh connection to remote server
     * @returns {Promise}
     */
    open: function () {
        var _this = this;

        console.info('INFO: creating tunnel to %s', this.proxyHost);

        this._tunnel = childProcess.spawn('ssh', this._buildSSHArgs());

        var cleanup = function () {
            _this._tunnel.stderr.removeAllListeners('data');
        };

        this._tunnel.stderr.on('data', function (data) {
            if (/success/.test(data)) {
                cleanup();
                return _this._resolveTunnel();
            }

            if (/failed/.test(data)) {
                cleanup();
                return _this._rejectTunnel();
            }
        });

        this._tunnel.on('exit', function (code, signal) {
            _this.emit('exit', code, signal);
        });

        this._tunnel.on('close', function (code, signal) {
            _this.emit('close', code, signal);
            return _this._closeTunnel(code);
        });

        this._tunnel.on('error', function () {
            return _this._rejectTunnel();
        });

        return _this._tunnelDeferred.promise.timeout(this._connectTimeout);
    },

    /**
     * Closes connection. If no connection established does nothing
     * @returns {Promise}
     */
    close: function () {
        if (!this._tunnel) {
            return q();
        }

        var _this = this;

        this._tunnel.kill('SIGTERM');
        return this._closeDeferred.promise.timeout(3000).fail(function () {
            _this._tunnel.kill('SIGKILL');
            return _this._closeTunnel(-1);
        });
    },

    _resolveTunnel: function () {
        console.info('INFO: Tunnel created to %s', this.proxyHost);
        this._tunnelDeferred.resolve();
    },

    _rejectTunnel: function () {
        var message = util.format('ERROR: failed to create tunnel to %s.', this.proxyHost),
            error = new Error(message);

        console.info(message);
        this._tunnelDeferred.reject(error);
    },

    _closeTunnel: function (exitCode) {
        console.info('INFO: Tunnel to %s closed. Exit code: %d', this.proxyHost, exitCode);
        this._closeDeferred.resolve();
    },

    _buildSSHArgs: function () {
        return [
            util.format('-R %d:localhost:%d', this.port, this._localPort),
            '-N',
            '-v',
            this._strictHostKeyChecking === false ? '-o StrictHostKeyChecking=no' : '',
            this._compression !== undefined ?
                util.format('-o Compression=%s', this._compression ? 'yes' : 'no')
                : '',
            this._identity ? util.format('-i %s', this._identity) : '',
            util.format('-p %d', this._sshPort),
            (this.user ? this.user + '@' : '') + this.host
        ].filter(Boolean);
    },

    _generateRandomPort: function (ports) {
        var min = ports.min,
            max = ports.max;

        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
});

/**
 * Tries to open tunnel several times
 * @param {object} opts opts which will be passed to created tunnel
 * @param {number} retries amount of retries to open tunnel
 * @returns {Promise}
 */
Tunnel.openWithRetries = function (opts, retries) {
    retries = retries || DEFAULTS.MAX_RETRIES;

    function retry_(retriesLeft) {
        if (!retriesLeft) {
            return q.reject(util.format('ERROR: failed to create tunnel after %d attempts', retries));
        }

        var tunnel = new Tunnel(opts);

        return tunnel.open()
            .then(function () {
                return q.resolve(tunnel);
            })
            .fail(function () {
                return tunnel.close()
                    .then(retry_.bind(null, retriesLeft - 1));
            });
    }

    return retry_(retries);
};

module.exports = Tunnel;
