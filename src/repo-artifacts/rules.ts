import { constants } from 'fs';
import { access, lstat } from 'fs/promises';
import { basename, dirname, join } from 'path';
import type { Ecosystem, RepoCategoryId } from '../types.js';

export interface ArtifactRule {
  category: RepoCategoryId;
  ecosystem: Ecosystem;
  names: readonly string[];
  marker: string;
  requiresIgnoredDirectory: boolean;
}

export const RULES: readonly ArtifactRule[] = [
  { category: 'node-modules', ecosystem: 'node', names: ['node_modules'], marker: 'package.json', requiresIgnoredDirectory: false },
  { category: 'node-build-artifacts', ecosystem: 'node', names: ['.next', '.turbo', '.parcel-cache'], marker: 'package.json', requiresIgnoredDirectory: false },
  { category: 'node-build-artifacts', ecosystem: 'node', names: ['coverage', 'dist', 'build', 'out', '.cache'], marker: 'package.json', requiresIgnoredDirectory: true },
  { category: 'rust-artifacts', ecosystem: 'rust', names: ['target'], marker: 'Cargo.toml', requiresIgnoredDirectory: false },
  { category: 'go-artifacts', ecosystem: 'go', names: ['bin', 'dist'], marker: 'go.mod', requiresIgnoredDirectory: true },
];

export function isRepoCategory(id: string): id is RepoCategoryId {
  return RULES.some((rule) => rule.category === id);
}

export async function hasMarker(parent: string, marker: string): Promise<boolean> {
  const path = join(parent, marker);
  try {
    const stats = await lstat(path);
    if (!stats.isFile() || stats.isSymbolicLink()) return false;
    await access(path, constants.R_OK);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function classify(path: string, categories: readonly RepoCategoryId[]): Promise<ArtifactRule | undefined> {
  for (const rule of RULES) {
    if (categories.includes(rule.category) && rule.names.includes(basename(path)) && await hasMarker(dirname(path), rule.marker)) return rule;
  }
  return undefined;
}
