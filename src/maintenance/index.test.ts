import { describe, it, expect } from 'vitest';
import { flushDnsCache, freePurgeableSpace } from './index.js';

describe('maintenance tasks', () => {
  describe('flushDnsCache', () => {
    it('should return a result object', async () => {
      const result = await flushDnsCache();

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.message).toBe('string');
    });
  });

  describe('freePurgeableSpace', () => {
    it('should return a result object', async () => {
      const result = await freePurgeableSpace();

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.message).toBe('string');
    });
  });
});




