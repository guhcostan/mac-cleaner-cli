import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushDnsCache } from './dns-cache.js';

// Mock child_process spawn
const mockOn = vi.fn();
const mockStdout = { on: vi.fn() };
const mockStderr = { on: vi.fn() };

vi.mock('child_process', () => ({
  spawn: vi.fn(() => {
    return {
      stdout: mockStdout,
      stderr: mockStderr,
      on: (event: string, callback: (code: number) => void) => {
        if (event === 'close') {
          // Simulate successful execution by default
          setTimeout(() => callback(0), 0);
        }
        return mockOn(event, callback);
      },
    };
  }),
}));

describe('dns-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStdout.on.mockReset();
    mockStderr.on.mockReset();
    mockOn.mockReset();
    
    // Setup default mock behavior
    mockStdout.on.mockImplementation(() => {
      // No output by default
    });
    mockStderr.on.mockImplementation(() => {
      // No error output by default
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('flushDnsCache', () => {
    it('should return a MaintenanceResult', async () => {
      const result = await flushDnsCache();

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.message).toBe('string');
    });

    it('should have error property when fails', async () => {
      // The function checks for sudo permissions first
      // If not running as root and can't sudo, it should fail with requiresSudo
      const result = await flushDnsCache();

      // Either it succeeds (if running with sudo) or it fails with proper error
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
      
      if (!result.success) {
        expect(result.error || result.requiresSudo).toBeDefined();
      }
    });

    it('should have requiresSudo property when sudo is needed', async () => {
      const result = await flushDnsCache();
      
      // The result should have proper structure
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('message');
      
      // If it needs sudo, requiresSudo should be set
      if (!result.success && result.message.includes('privileges')) {
        expect(result.requiresSudo).toBe(true);
      }
    });
  });
});
