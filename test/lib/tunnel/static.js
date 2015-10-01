import sinon from 'sinon';
import { expect } from 'chai';

import Tunnel from '../../../lib/tunnel';

describe('static methods', () => {
  describe('Tunnel.getLogger', () => {
    it('should return same argument if it is an object', () => {
      let logger = {};
      expect(Tunnel.getLogger(logger)).to.equal(logger);
    });

    it('should return default logger if there is no argument', () => {
      let logger = Tunnel.getLogger();

      expect(logger.info).to.be.an('function');
      expect(logger.error).to.be.an('function');
    });

    it('should return default logger if argument is undefined', () => {
      let logger = Tunnel.getLogger(undefined);

      expect(logger.info).to.be.an('function');
      expect(logger.error).to.be.an('function');
    });
  });

  describe('Tunnel.getPort', () => {
    it('should return default port if there is no argument', () => {
      expect(Tunnel.getPort()).to.equal(8000);
    });

    it('should return same number that was passed', () => {
      expect(Tunnel.getPort(1)).to.equal(1);
    });

    it('should return port within the range', () => {
      expect(Tunnel.getPort([1,5])).to.be.within(1, 5);
    });
  });

  describe('Tunnel.getRandom', () => {
    it('should return number within the range', () => {
      expect(Tunnel.getPort([1,5])).to.be.within(1, 5);
    });
  });
});

