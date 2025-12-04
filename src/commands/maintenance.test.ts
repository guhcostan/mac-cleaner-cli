import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { maintenanceCommand } from './maintenance.js';
import * as maintenance from '../maintenance/index.js';

vi.mock('../maintenance/index.js', () => ({
  flushDnsCache: vi.fn(),
  freePurgeableSpace: vi.fn(),
}));

describe('maintenance command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should show message when no tasks specified', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await maintenanceCommand({});

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No maintenance tasks'));

    consoleSpy.mockRestore();
  });

  it('should flush DNS cache when --dns specified', async () => {
    vi.mocked(maintenance.flushDnsCache).mockResolvedValue({
      success: true,
      message: 'DNS cache flushed',
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await maintenanceCommand({ dns: true });

    expect(maintenance.flushDnsCache).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should free purgeable space when --purgeable specified', async () => {
    vi.mocked(maintenance.freePurgeableSpace).mockResolvedValue({
      success: true,
      message: 'Purgeable space freed',
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await maintenanceCommand({ purgeable: true });

    expect(maintenance.freePurgeableSpace).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should run both tasks when both flags specified', async () => {
    vi.mocked(maintenance.flushDnsCache).mockResolvedValue({
      success: true,
      message: 'DNS cache flushed',
    });
    vi.mocked(maintenance.freePurgeableSpace).mockResolvedValue({
      success: true,
      message: 'Purgeable space freed',
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await maintenanceCommand({ dns: true, purgeable: true });

    expect(maintenance.flushDnsCache).toHaveBeenCalled();
    expect(maintenance.freePurgeableSpace).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should handle failed tasks', async () => {
    vi.mocked(maintenance.flushDnsCache).mockResolvedValue({
      success: false,
      message: 'Failed to flush DNS cache',
      error: 'Permission denied',
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await maintenanceCommand({ dns: true });

    expect(maintenance.flushDnsCache).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});




