import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushDnsCache, freePurgeableSpace } from './index.js';
import { exec } from 'child_process';

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;

describe('maintenance tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('flushDnsCache', () => {
    it('should return a result object', async () => {
      vi.mocked(exec).mockImplementation(((_cmd: string, callback: ExecCallback) => {
        callback(null, '', '');
      }) as typeof exec);

      const result = await flushDnsCache();

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.message).toBe('string');
    });
  });

  describe('freePurgeableSpace', () => {
    it('should return a result object', async () => {
      vi.mocked(exec).mockImplementation(((_cmd: string, callback: ExecCallback) => {
        callback(null, '', '');
      }) as typeof exec);

      const result = await freePurgeableSpace();

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.message).toBe('string');
    });
  });
});





