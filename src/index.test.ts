import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import pkg from '../package.json' with { type: 'json' };

describe('CLI version', () => {
  it('should display the version from package.json', () => {
    const output = execSync('bun src/index.ts --version').toString().trim();
    expect(output).toBe(pkg.version);
  });

  it('should not display a hardcoded version', () => {
    const output = execSync('bun src/index.ts --version').toString().trim();
    expect(output).not.toBe('1.1.0');
  });
});
