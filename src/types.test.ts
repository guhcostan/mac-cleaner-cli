import { describe, it, expect } from 'vitest';
import { CATEGORIES } from './types.js';

describe('CATEGORIES', () => {
  it('should have all expected categories', () => {
    const expectedIds = [
      'system-cache',
      'system-logs',
      'temp-files',
      'trash',
      'downloads',
      'browser-cache',
      'dev-cache',
      'homebrew',
      'docker',
      'ios-backups',
      'mail-attachments',
      'language-files',
      'large-files',
      'node-modules',
      'git-worktrees',
      'duplicates',
      'launch-agents',
    ];

    expect(Object.keys(CATEGORIES).sort()).toEqual(expectedIds.sort());
  });

  it('should have valid category structure', () => {
    for (const category of Object.values(CATEGORIES)) {
      expect(category).toHaveProperty('id');
      expect(category).toHaveProperty('name');
      expect(category).toHaveProperty('group');
      expect(category).toHaveProperty('description');
      expect(category).toHaveProperty('safetyLevel');

      expect(typeof category.id).toBe('string');
      expect(typeof category.name).toBe('string');
      expect(typeof category.group).toBe('string');
      expect(typeof category.description).toBe('string');
      expect(['safe', 'moderate', 'risky']).toContain(category.safetyLevel);
    }
  });

  it('should have valid safety levels', () => {
    const safeLevels = ['safe', 'moderate', 'risky'];

    for (const category of Object.values(CATEGORIES)) {
      expect(safeLevels).toContain(category.safetyLevel);
    }
  });

  it('should mark risky categories correctly', () => {
    const riskyCategories = ['downloads', 'ios-backups', 'mail-attachments', 'language-files', 'large-files', 'git-worktrees'];

    for (const id of riskyCategories) {
      expect(CATEGORIES[id as keyof typeof CATEGORIES].safetyLevel).toBe('risky');
    }
  });

  it('should mark safe categories correctly', () => {
    // homebrew and docker left this list: both delegate cleanup to an external
    // command that removes more than "cache" (old formula versions, and images
    // not used by a running container).
    const safeCategories = ['trash', 'browser-cache', 'temp-files'];

    for (const id of safeCategories) {
      expect(CATEGORIES[id as keyof typeof CATEGORIES].safetyLevel).toBe('safe');
    }
  });

  // Invariant: a category that delegates cleanup to an external tool cannot be
  // `safe`. The user does not pick item by item there — the command decides, and
  // the effect is broader than the word "cache" suggests.
  it('should never mark externally-cleaned categories as safe', () => {
    const externallyCleaned = ['homebrew', 'docker'] as const;

    for (const id of externallyCleaned) {
      expect(CATEGORIES[id].safetyLevel).not.toBe('safe');
      expect(CATEGORIES[id].safetyNote).toBeDefined();
    }
  });

  // A rule, not a fixed list: any future `risky` category is born requiring
  // per-file review. Without it, checking the category sent 100% of its items
  // to deletion in one keystroke — which is how iOS Backups, Mail Attachments,
  // Duplicates and Language Files ended up with no review at all.
  it('should require per-file selection on EVERY risky category', () => {
    const riskyWithoutFileSelection = Object.values(CATEGORIES)
      .filter((c) => c.safetyLevel === 'risky' && !c.supportsFileSelection)
      .map((c) => c.id);

    expect(riskyWithoutFileSelection).toEqual([]);
  });

  it('should have a safetyNote on EVERY risky category', () => {
    const riskyWithoutNote = Object.values(CATEGORIES)
      .filter((c) => c.safetyLevel === 'risky' && !c.safetyNote)
      .map((c) => c.id);

    expect(riskyWithoutNote).toEqual([]);
  });

  it('should have valid groups', () => {
    const validGroups = ['System Junk', 'Development', 'Storage', 'Browsers', 'Large Files'];

    for (const category of Object.values(CATEGORIES)) {
      expect(validGroups).toContain(category.group);
    }
  });

  it('should have consistent id in key and value', () => {
    for (const [key, category] of Object.entries(CATEGORIES)) {
      expect(key).toBe(category.id);
    }
  });
});

