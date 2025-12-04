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
      'duplicates',
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
    const riskyCategories = ['downloads', 'ios-backups', 'mail-attachments', 'language-files', 'large-files'];

    for (const id of riskyCategories) {
      expect(CATEGORIES[id as keyof typeof CATEGORIES].safetyLevel).toBe('risky');
    }
  });

  it('should mark safe categories correctly', () => {
    const safeCategories = ['trash', 'browser-cache', 'temp-files', 'homebrew', 'docker'];

    for (const id of safeCategories) {
      expect(CATEGORIES[id as keyof typeof CATEGORIES].safetyLevel).toBe('safe');
    }
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

