import { describe, it, expect } from 'vitest';
import { NodeModulesScanner } from './node-modules.js';

describe('NodeModulesScanner', () => {
  const scanner = new NodeModulesScanner();

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('node-modules');
    expect(scanner.category.name).toBe('Node Modules');
    expect(scanner.category.group).toBe('Development');
    expect(scanner.category.safetyLevel).toBe('moderate');
  });

  it('should clean empty items array', async () => {
    const result = await scanner.clean([]);

    expect(result.category.id).toBe('node-modules');
    expect(result.cleanedItems).toBe(0);
  });

  it('should clean with dry run', async () => {
    const result = await scanner.clean([], true);

    expect(result.category.id).toBe('node-modules');
  });
});
