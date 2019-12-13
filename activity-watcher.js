'use strict';

var inherit = require('inherit');

var ActivityWatcher = inherit({
    /**
     * @param {number} timeout
     * @param {function} fn
     */
    __constructor: function (timeout, fn) {
        this._timeout = timeout;
        this._lastUpdate = null;
        this._fn = fn;
        this._timer = null;

        this.update();
    },

    update: function () {
        this._lastUpdate = Date.now();
    },

    start: function () {
        if (this._timer) {
            return;
        }

        var _this = this;

        this._timer = setTimeout(function () {
            clearTimeout(_this._timer);
            _this._timer = null;

            if ((Date.now() - _this._lastUpdate) >= _this._timeout) {
                _this._fn();
            } else {
                _this.start();
            }
        }, _this._timeout / 2).unref();
    },
});

module.exports = ActivityWatcher;
