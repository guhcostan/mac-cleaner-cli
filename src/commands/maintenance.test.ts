import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { maintenanceCommand } from './maintenance.js';
import * as maintenance from '../maintenance/index.js';
import confirm from '@inquirer/confirm';

vi.mock('../maintenance/index.js', () => ({
  flushDnsCache: vi.fn(),
  freePurgeableSpace: vi.fn(),
  clearTimeMachineSnapshots: vi.fn(),
  listTimeMachineSnapshotDates: vi.fn(),
}));

vi.mock('@inquirer/confirm', () => ({
  default: vi.fn(),
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

  describe('--timemachine', () => {
    const twoSnapshots = ['2024-01-15-123456', '2024-01-16-010203'];

    beforeEach(() => {
      vi.mocked(maintenance.clearTimeMachineSnapshots).mockResolvedValue({
        success: true,
        message: 'Deleted 2 Time Machine snapshots',
      });
    });

    it('deletes snapshots after the user confirms', async () => {
      vi.mocked(maintenance.listTimeMachineSnapshotDates).mockResolvedValue({ dates: twoSnapshots });
      vi.mocked(confirm).mockResolvedValue(true);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await maintenanceCommand({ timemachine: true });

      expect(confirm).toHaveBeenCalled();
      expect(maintenance.clearTimeMachineSnapshots).toHaveBeenCalledWith({
        dates: twoSnapshots,
        dryRun: undefined,
      });

      consoleSpy.mockRestore();
    });

    it('deletes nothing when the user declines', async () => {
      vi.mocked(maintenance.listTimeMachineSnapshotDates).mockResolvedValue({ dates: twoSnapshots });
      vi.mocked(confirm).mockResolvedValue(false);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await maintenanceCommand({ timemachine: true });

      expect(maintenance.clearTimeMachineSnapshots).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('cancelled'));
      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('No maintenance tasks'));

      consoleSpy.mockRestore();
    });

    it('does not prompt with --yes', async () => {
      vi.mocked(maintenance.listTimeMachineSnapshotDates).mockResolvedValue({ dates: twoSnapshots });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await maintenanceCommand({ timemachine: true, yes: true });

      expect(confirm).not.toHaveBeenCalled();
      expect(maintenance.clearTimeMachineSnapshots).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('does not prompt with --dry-run and forwards the flag', async () => {
      vi.mocked(maintenance.listTimeMachineSnapshotDates).mockResolvedValue({ dates: twoSnapshots });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await maintenanceCommand({ timemachine: true, dryRun: true });

      expect(confirm).not.toHaveBeenCalled();
      expect(maintenance.clearTimeMachineSnapshots).toHaveBeenCalledWith({
        dates: twoSnapshots,
        dryRun: true,
      });

      consoleSpy.mockRestore();
    });

    it('does not prompt when there are no snapshots', async () => {
      vi.mocked(maintenance.listTimeMachineSnapshotDates).mockResolvedValue({ dates: [] });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await maintenanceCommand({ timemachine: true });

      expect(confirm).not.toHaveBeenCalled();
      expect(maintenance.clearTimeMachineSnapshots).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('surfaces a listing error without prompting', async () => {
      vi.mocked(maintenance.listTimeMachineSnapshotDates).mockResolvedValue({
        dates: [],
        error: 'tmutil not available or Time Machine is not configured on this Mac',
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await maintenanceCommand({ timemachine: true });

      expect(confirm).not.toHaveBeenCalled();
      expect(maintenance.clearTimeMachineSnapshots).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});







