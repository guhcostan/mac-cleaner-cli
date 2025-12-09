import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushDnsCache } from './dns-cache.js';
import { exec } from 'child_process';

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;

describe('dns-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('flushDnsCache', () => {
    it('should return a MaintenanceResult', async () => {
      vi.mocked(exec).mockImplementation(((_cmd: string, callback: ExecCallback) => {
        callback(null, '', '');
      }) as typeof exec);

      const result = await flushDnsCache();

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.message).toBe('string');
    });

    it('should have error property when fails', async () => {
      vi.mocked(exec).mockImplementation(((_cmd: string, callback: ExecCallback) => {
        callback(new Error('Permission denied'), '', '');
      }) as typeof exec);

      const result = await flushDnsCache();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return proper message format', async () => {
      vi.mocked(exec).mockImplementation(((_cmd: string, callback: ExecCallback) => {
        callback(null, '', '');
      }) as typeof exec);

      const result = await flushDnsCache();

      expect(result.success).toBe(true);
      expect(result.message).toContain('successfully');
    });
  });
});
