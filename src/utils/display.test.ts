import { describe, it, expect } from 'vitest';
import { sanitizeDisplayName } from './display.js';

describe('sanitizeDisplayName', () => {
  it('leaves normal names untouched', () => {
    expect(sanitizeDisplayName('My File (1).zip')).toBe('My File (1).zip');
    expect(sanitizeDisplayName('café — résumé.pdf')).toBe('café — résumé.pdf');
  });

  it('strips ANSI escape sequences', () => {
    expect(sanitizeDisplayName('\u001B[31mdanger\u001B[0m.txt')).not.toContain('\u001B');
    expect(sanitizeDisplayName('\u001B[2Kfake.txt')).toBe('\uFFFD[2Kfake.txt');
  });

  it('strips newlines and carriage returns used to forge extra rows', () => {
    expect(sanitizeDisplayName('a.txt\n  ○ system.log')).toBe('a.txt\uFFFD  ○ system.log');
    expect(sanitizeDisplayName('a.txt\rspoof')).toBe('a.txt\uFFFDspoof');
  });

  it('strips bidi overrides and zero-width characters', () => {
    expect(sanitizeDisplayName('gpj.\u202Emalware.exe')).toBe('gpj.\uFFFDmalware.exe');
    expect(sanitizeDisplayName('inv\u200Bisible')).toBe('inv\uFFFDisible');
  });
});
