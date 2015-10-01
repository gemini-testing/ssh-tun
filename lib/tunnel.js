require('babel/polyfill');

import * as path from 'path';
import * as net from 'net';
import {readFileSync as read} from 'fs';

import Connection from 'ssh2';
import { extend } from 'lodash';
import * as vow from 'vow';

let defer = Symbol();

export default class Tunnel {

  /**
   * Define all needed properties
   * @param {Object} from
   * @param {String} from.hostname
   * @param {Number} from.port
   * @param {String} from.key - path to the user key
   * @param {Object} to
   * @param {String} to.hostname
   * @param {Number | Array} [to.port = 8000] - number or range
   * @param {String} to.username
   * @return {Tunnel}
   */
  constructor(from, to, logger) {

    /**
     * What hostname/port should we forward from?
     * @type {Object}
     */
    this.from = extend({}, from);

    /**
     * What hostname/port should we forward to?
     * @type {Object}
     */
    this.to = extend({}, to);

    /**
     * Original port range, needed if we infact received port range,
     * so we could extract new port for new connection
     * @type {Number | Array}
     */
    this.portRange = to.port;
    this.to.port = Tunnel.getPort(this.portRange);

    /**
     * Username of the remote host
     * @type {String}
     */
    this.username = to.username || process.env.USER;

    /**
     * Authorization key
     * @type {String}
     */
    this.key = read(from.key || path.join(process.env.HOME, '.ssh', 'id_rsa'));

    /**
     * Deferred object which we will resolve when connect to the remote host
     * @private
     * @type {Object}
     */
    this[defer] = vow.defer();

    /**
     * Promise object which will be resolved when connect to the remote host
     * @type {Object}
     */
    this.promise = this[defer].promise();

    /**
     * Logger that we will use for output info
     * @type {Object}
     */
    this.logger = Tunnel.getLogger(logger);

    /**
     * Our ssh connection
     * @type {Object}
     */
    this.connection = new Connection();

    /**
     * How many times should we try to reconnect?
     * @type {Number}
     */
    this.retryTimes = 0;
  }

  /**
   * Connect to the remote server
   * @param {Number} [retryTimes = 0] - how many times can we try to connect
   */
  connect(retryTimes = 0) {
    this.retryTimes = retryTimes;

    this.connection.connect({
      host: this.to.hostname,
      port: 22,
      username: this.username,
      privateKey: this.key
    });
  }

  /**
   * Close connection to the remote server
   */
  close() {
    this.connection.end();
  }

   /**
   * Helper for the Tunnel#reTry
   * @private
   */
  _reTry() {
    // Close current connection
    this.close();

    // Try new port
    this.to.port = Tunnel.getPort(this.portRange);

    // Recreate the connection
    this.connection = new Connection();

    this.addEvents();

    // Decrement the shot
    this.connect(this.retryTimes - 1);
  }

  /**
   * Try to reconnect to the remote host (has side effect)
   * @param {*} error - error that will be thrown if we don't want to try anymore
   */
  reTry(error) {
    if (this.retryTimes !== 0) {
      this.logger.info('Retrying to connect, %s tries left', this.retryTimes);
      this._reTry();

    } else {
      this[defer].reject(error);
    }
  }

  /**
   * Attach events and deal with them
   */
  addEvents() {
    var streams = [];

    this.connection.on('tcp connection', (info, accept, reject) => {
      let socket;
      let stream = accept();

      stream.pause();

      // Connect to the socket and output the stream
      socket = net.connect(this.from.port, this.from.hostname, () => {
        stream.pipe(socket);
        socket.pipe(stream);

        stream.resume();
      });

      // Store all streams, so we can clean it up afterwards
      streams.push(socket, stream);
    });

    // Wait for remote connection
    this.connection.on('ready', () => {
      this.logger.info('Connection to %s:%s is established', this.to.hostname, this.to.port);

      // Forward all connections to remote address from local hostname and port
      this.connection.forwardIn(this.to.hostname, this.to.port, (error) => {
        if (error) {
          this.logger.error('Forwarding issue %s', error.message);

        } else {
          this[defer].resolve();
        }
      });
    });

    this.connection.on('error', (error) => {
      this.logger.error('Connection error %s', error.message);
      this.reTry();
    });

    this.connection.on('close', (error) => {
      // End all streams, to clean up event loop queue
      streams.forEach((stream) => stream.end());

      if (error) {
        this.logger.error('Connection error %s', error.message);

      } else {
        this.logger.info('Connection closed');
      }
    });
  }

  /**
   * Return logger or return default one is there is none
   * @static
   * @param {Object} [logger]
   * @return {Object}
   */
  static getLogger(logger) {
    if (logger) {
      return logger;
    }

    return {
      info: console.log.bind(console),
      error: console.error.bind(console)
    };
  }

  /**
   * Return default port or passed port or get port within the range
   * @static
   * @param {Number | Array} [port = 8000]
   * @return {Number}
   */
  static getPort(port) {
    port = port || 8000;

    if (Array.isArray(port)) {
      port = Tunnel.getRandom(port[0], port[1]);
    }

    return port;
  }

  /**
   * Get random number
   * @static
   * @param {Number} min
   * @param {Number} max
   * @return {Number}
   */
  static getRandom(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
  }
}
