import { expect, it } from 'vitest';
import { PassThrough } from 'stream';
import { liveReviewPrompt } from './live-review.js';
import { CATEGORIES, type ScannerOptions, type ScanSummary } from '../types.js';
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
const category = CATEGORIES['rust-artifacts'];
const items = Array.from({ length: 12 }, (_, i) => ({ path: `/fixture/${i}/target`, name: String(i), size: i + 1, isDirectory: true }));
const summary = { results: [{ category, items, totalSize: 78 }], totalSize: 78, totalItems: 12 };
function terminal() {
  const input = new PassThrough(); const output = new PassThrough(); let text = '';
  output.on('data', (data: Buffer) => { text += data.toString(); });
  return { input, output, text: () => text };
}
it('handles actual keypress/render cycles while retaining only explicit selections', async () => {
  const io = terminal(); let events!: ScannerOptions; let complete!: (summary: ScanSummary) => void;
  const promise = liveReviewPrompt({ scan: (options) => { events = options; return new Promise((resolve) => { complete = resolve; }); } }, io);
  let settled = false; void promise.then(() => { settled = true; });
  await tick(); io.input.write('\r'); await tick();
  expect(settled).toBe(false); expect(io.text()).toContain('Enter cannot submit cleanup');
  events.onEvent?.({ type: 'candidate', runId: 'test', category: category.id, item: items[0] });
  await tick(); io.input.write(' '); await tick();
  for (const item of items.slice(1)) events.onEvent?.({ type: 'candidate', runId: 'test', category: category.id, item });
  events.onEvent?.({ type: 'warning', runId: 'test', reason: 'fixture warning' });
  events.onEvent?.({ type: 'progress', runId: 'test', completed: 1 });
  await tick(); io.input.write('p/0\rnbms\u001b[B\u001b[A'); await tick();
  expect(io.text()).toContain('1 selected'); expect(io.text()).toContain('Search: 0');
  io.input.write('/\u007f\rnb'); await tick(); expect(io.text()).toContain('page 2/2');
  complete(summary); await tick(); io.input.write('\r');
  const result = await promise;
  expect([...result.selected.get(category.id)!]).toEqual([items[0].path]); expect(result.cancelled).toBe(false);
  io.input.end();
});
it('read-only review includes risky candidates but space never selects them', async () => {
  const io = terminal();
  const promise = liveReviewPrompt({ readOnly: true, scan: async (options) => {
    options.onEvent?.({ type: 'candidate', runId: 'test', category: 'node-build-artifacts', item: items[0] }); return summary;
  } }, io);
  await tick(); io.input.write(' \r');
  expect((await promise).selected.size).toBe(0); expect(io.text()).toContain('(read only)'); io.input.end();
});
it('hides risky rows by default and aborts on q without a selection', async () => {
  const io = terminal(); let events!: ScannerOptions;
  const promise = liveReviewPrompt({ scan: (options) => { events = options; options.onEvent?.({ type: 'candidate', runId: 'test', category: 'node-build-artifacts', item: items[0] }); return new Promise(() => {}); } }, io);
  await tick(); expect(io.text()).toContain('0 candidates'); io.input.write('q');
  const result = await promise; expect(result.cancelled).toBe(true); expect(events.signal?.aborted).toBe(true); expect(result.selected.size).toBe(0);
  events.onEvent?.({ type: 'warning', runId: 'late', reason: 'late' }); io.input.end();
});
it('can review opted-in risky rows and cancel a failed or aborted scan', async () => {
  for (const mode of ['failed', 'aborted'] as const) {
    const io = terminal();
    const promise = liveReviewPrompt({ includeRisky: true, scan: async (options) => {
      options.onEvent?.({ type: 'candidate', runId: 'test', category: 'node-build-artifacts', item: items[0] });
      if (mode === 'failed') throw new Error('fixture error');
      return { ...summary, cancelled: true };
    } }, io);
    await tick(); io.input.write('\r'); await tick(); io.input.write('\u001b');
    expect((await promise).cancelled).toBe(true); io.input.end();
  }
});
