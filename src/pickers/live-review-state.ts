import type { CategoryId, CleanableItem } from '../types.js';
export interface LiveRow { category: CategoryId; item: CleanableItem }
export type LiveSort = 'size' | 'mtime' | 'path';
export interface LiveState {
  rows: LiveRow[];
  selected: Set<string>;
  sort: LiveSort;
  query: string;
  page: number;
  cursor: number;
  scanning: boolean;
  cancelled: boolean;
}
export const liveKey = (row: LiveRow): string => row.category + '\0' + row.item.path;
export const initialLiveState = (): LiveState => ({ rows: [], selected: new Set(), sort: 'size', query: '', page: 0, cursor: 0, scanning: true, cancelled: false });
export function liveView(state: LiveState, pageSize = 10): { rows: LiveRow[]; page: number; pages: number } {
  const rows = state.rows.filter((r) => `${r.category} ${r.item.path}`.toLowerCase().includes(state.query.toLowerCase())).sort((a, b) => {
    const primary = state.sort === 'size' ? b.item.size - a.item.size : state.sort === 'mtime' ? +(b.item.newestEntryModifiedAt ?? b.item.modifiedAt ?? 0) - +(a.item.newestEntryModifiedAt ?? a.item.modifiedAt ?? 0) : 0;
    return primary || a.item.path.localeCompare(b.item.path) || a.category.localeCompare(b.category);
  });
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.max(0, Math.min(state.page, pages - 1));
  return { rows: rows.slice(page * pageSize, (page + 1) * pageSize), page, pages };
}
export function addLiveRow(state: LiveState, row: LiveRow): LiveState {
  return { ...state, rows: [...state.rows.filter((r) => liveKey(r) !== liveKey(row)), row] };
}
export function toggleLiveRow(state: LiveState, row: LiveRow): LiveState {
  const selected = new Set(state.selected);
  const key = liveKey(row);
  if (selected.has(key)) selected.delete(key); else selected.add(key);
  return { ...state, selected };
}
export function canSubmitLive(state: LiveState): boolean { return !state.scanning && !state.cancelled; }
