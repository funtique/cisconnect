import { describe, it, expect } from 'vitest';
import { addJitter, getNextPollingDelay, getRandomStartupDelay } from './jitter.js';

describe('Jitter utilities', () => {
  describe('addJitter', () => {
    it('should add jitter to base delay', () => {
      const baseDelay = 1000;
      const jittered = addJitter(baseDelay, 10);
      
      expect(jittered).toBeGreaterThan(0);
      expect(jittered).toBeGreaterThanOrEqual(1000); // Minimum 1 seconde
    });

    it('should respect minimum delay', () => {
      const baseDelay = 500;
      const jittered = addJitter(baseDelay, 50);
      
      expect(jittered).toBeGreaterThanOrEqual(1000);
    });

    it('should handle zero jitter', () => {
      const baseDelay = 2000;
      const jittered = addJitter(baseDelay, 0);
      
      expect(jittered).toBe(baseDelay);
    });
  });

  describe('getNextPollingDelay', () => {
    it('should return jittered delay for polling', () => {
      const pollingSec = 60;
      const delay = getNextPollingDelay(pollingSec);
      
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeGreaterThanOrEqual(1000);
    });

    it('should handle different polling intervals', () => {
      const delays = [30, 60, 120].map(sec => getNextPollingDelay(sec));
      
      delays.forEach(delay => {
        expect(delay).toBeGreaterThan(0);
        expect(delay).toBeGreaterThanOrEqual(1000);
      });
    });
  });

  describe('getRandomStartupDelay', () => {
    it('should return random delay within range', () => {
      const maxDelay = 10000;
      const delay = getRandomStartupDelay(maxDelay);
      
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(maxDelay);
    });

    it('should handle default max delay', () => {
      const delay = getRandomStartupDelay();
      
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(30000);
    });
  });
});
