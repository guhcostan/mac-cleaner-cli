import { describe, it, expect } from 'vitest';
import { flushDnsCache, type MaintenanceResult } from './dns-cache.js';

describe('dns-cache', () => {
  describe('flushDnsCache', () => {
    it('should return a MaintenanceResult', async () => {
      const result = await flushDnsCache();

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.message).toBe('string');
    });

    it('should have error property when fails', async () => {
      const result = await flushDnsCache();

      // In CI without sudo, this will fail
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it('should return proper message format', async () => {
      const result = await flushDnsCache();

      if (result.success) {
        expect(result.message).toContain('successfully');
      } else {
        expect(result.message).toContain('Failed');
      }
    });
  });
});
