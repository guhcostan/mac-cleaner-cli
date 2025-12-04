import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProgressBar, createScanProgress, createCleanProgress } from './progress.js';

describe('ProgressBar', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('should create a progress bar with default options', () => {
    const progress = new ProgressBar({ total: 10 });
    expect(progress).toBeDefined();
  });

  it('should update progress', () => {
    const progress = new ProgressBar({ total: 10 });
    progress.update(5);
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should increment progress', () => {
    const progress = new ProgressBar({ total: 10 });
    progress.increment();
    progress.increment();
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should update with label', () => {
    const progress = new ProgressBar({ total: 10, label: 'Initial' });
    progress.update(5, 'Updated');
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should finish and clear line', () => {
    const progress = new ProgressBar({ total: 10 });
    progress.update(10);
    progress.finish();
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should finish with message', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const progress = new ProgressBar({ total: 10 });
    progress.update(10);
    progress.finish('Done!');
    expect(consoleSpy).toHaveBeenCalledWith('Done!');
    consoleSpy.mockRestore();
  });

  it('should handle custom bar width', () => {
    const progress = new ProgressBar({ total: 10, barWidth: 50 });
    progress.update(5);
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should handle percentage display', () => {
    const progress = new ProgressBar({ total: 10, showPercentage: true });
    progress.update(5);
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should handle count display', () => {
    const progress = new ProgressBar({ total: 10, showCount: true });
    progress.update(5);
    expect(stdoutSpy).toHaveBeenCalled();
  });
});

describe('factory functions', () => {
  it('should create scan progress', () => {
    const progress = createScanProgress(10);
    expect(progress).toBeDefined();
  });

  it('should create clean progress', () => {
    const progress = createCleanProgress(10);
    expect(progress).toBeDefined();
  });
});




