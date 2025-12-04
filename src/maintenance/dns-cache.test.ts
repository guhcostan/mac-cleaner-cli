import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create a mock execAsync function
const mockExecAsync = vi.fn();

// Mock the module
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: () => mockExecAsync,
}));

// Import after mocking
import { flushDnsCache } from './dns-cache.js';

describe('dns-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('flushDnsCache', () => {
    it('should return success when DNS cache is flushed', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

      const result = await flushDnsCache();

      expect(result.success).toBe(true);
      expect(result.message).toContain('successfully');
    });

    it('should return failure when DNS flush fails', async () => {
      mockExecAsync.mockRejectedValue(new Error('Permission denied'));

      const result = await flushDnsCache();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed');
      expect(result.error).toBeDefined();
    });

    it('should handle non-Error exceptions', async () => {
      mockExecAsync.mockRejectedValue('string error');

      const result = await flushDnsCache();

      expect(result.success).toBe(false);
      expect(result.error).toBe('string error');
    });
  });
});
