import { expect, it } from 'vitest';
import { addLiveRow, canSubmitLive, initialLiveState, liveKey, liveView, toggleLiveRow, type LiveRow } from './live-review-state.js';
const row = (path: string, size: number, mtime = 1): LiveRow => ({ category: 'rust-artifacts', item: { path, name: path, size, isDirectory: true, newestEntryModifiedAt: new Date(mtime) } });
it('starts empty and cannot submit until scanning finishes', () => {
  const state = initialLiveState();
  expect(state.selected.size).toBe(0);
  expect(canSubmitLive(state)).toBe(false);
  expect(canSubmitLive({ ...state, scanning: false })).toBe(true);
  expect(canSubmitLive({ ...state, scanning: false, cancelled: true })).toBe(false);
});
it('preserves selected identities across arrivals, sorting, searching and paging', () => {
  let state = addLiveRow(initialLiveState(), row('/b', 10));
  state = toggleLiveRow(state, state.rows[0]);
  state = addLiveRow(state, row('/a', 10, 2));
  state = addLiveRow(state, row('/c', 20, 3));
  expect(liveView(state).rows.map((r) => r.item.path)).toEqual(['/c', '/a', '/b']);
  expect(liveView({ ...state, sort: 'path' }).rows.map((r) => r.item.path)).toEqual(['/a', '/b', '/c']);
  expect(liveView({ ...state, sort: 'mtime' }).rows.map((r) => r.item.path)).toEqual(['/c', '/a', '/b']);
  expect(liveView({ ...state, query: '/a' }).rows).toHaveLength(1);
  expect(liveView({ ...state, page: 1 }, 2).rows.map((r) => r.item.path)).toEqual(['/b']);
  expect(state.selected).toEqual(new Set([liveKey(row('/b', 10))]));
  state = addLiveRow(state, row('/b', 30));
  expect(state.rows).toHaveLength(3);
  expect(state.selected.size).toBe(1);
});
