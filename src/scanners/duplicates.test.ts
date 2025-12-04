import { describe, it, expect } from 'vitest';
import { DuplicatesScanner } from './duplicates.js';

describe('DuplicatesScanner', () => {
  const scanner = new DuplicatesScanner();

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('duplicates');
    expect(scanner.category.name).toBe('Duplicate Files');
    expect(scanner.category.group).toBe('Storage');
    expect(scanner.category.safetyLevel).toBe('risky');
  });

  it('should clean empty items array', async () => {
    const result = await scanner.clean([]);

    expect(result.category.id).toBe('duplicates');
    expect(result.cleanedItems).toBe(0);
  });

  it('should clean with dry run', async () => {
    const result = await scanner.clean([], true);

    expect(result.category.id).toBe('duplicates');
  });
});
