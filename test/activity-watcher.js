var ActivityWatcher = require('../activity-watcher');

describe('ActivityWatcher', function () {
    var sandbox = sinon.sandbox.create();
    var clock, fnSpy, am;

    beforeEach(function () {
        clock = sandbox.useFakeTimers();
        fnSpy = sandbox.spy();
        am = new ActivityWatcher(5000, fnSpy);

        am.start();
    });

    afterEach(function () {
        sandbox.reset();
    });

    it('should execute given function when timeout is exceeded', function () {
        clock.tick(6000);

        expect(fnSpy).to.be.calledWith();
    });

    it('should not execute given function when timeout is not exceeded', function () {
        clock.tick(3000);

        expect(fnSpy).to.not.be.calledWith();
    });

    it('should update last activity', function () {
        clock.tick(3000);

        am.update();

        clock.tick(3000);

        expect(fnSpy).to.not.be.calledWith();

        clock.tick(6000);

        expect(fnSpy).to.be.calledWith();
    });
});
