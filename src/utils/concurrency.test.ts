import { describe, it, expect } from 'vitest';
import { mapPool } from './concurrency.js';

describe('mapPool', () => {
  it('should return an empty array for no items', async () => {
    expect(await mapPool([], 4, async () => 1)).toEqual([]);
  });

  it('should preserve input order', async () => {
    const results = await mapPool([5, 1, 3], 2, async (value) => {
      await new Promise((resolve) => setTimeout(resolve, value));
      return value * 2;
    });

    expect(results).toEqual([10, 2, 6]);
  });

  it('should pass the item index to the callback', async () => {
    const results = await mapPool(['a', 'b'], 1, async (item, index) => `${index}:${item}`);

    expect(results).toEqual(['0:a', '1:b']);
  });

  it('should never exceed the concurrency limit', async () => {
    let running = 0;
    let peak = 0;

    await mapPool([1, 2, 3, 4, 5, 6], 2, async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running--;
    });

    expect(peak).toBe(2);
  });

  it('should run at least one task when concurrency is zero or negative', async () => {
    expect(await mapPool([1, 2], 0, async (value) => value)).toEqual([1, 2]);
    expect(await mapPool([1, 2], -5, async (value) => value)).toEqual([1, 2]);
  });

  it('should propagate rejections', async () => {
    await expect(
      mapPool([1], 1, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
  });
});
