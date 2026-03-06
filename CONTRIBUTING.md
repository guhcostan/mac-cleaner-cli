# Contributing to Mac Cleaner CLI

Thank you for your interest in contributing! This project is community-driven and every contribution matters — from fixing a typo to adding a new scanner.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [How to Contribute](#how-to-contribute)
- [Adding a New Scanner](#adding-a-new-scanner)
- [Coding Standards](#coding-standards)
- [Submitting a Pull Request](#submitting-a-pull-request)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it. Please report unacceptable behavior to the project maintainers.

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally
3. **Set up** the development environment
4. **Make** your changes
5. **Submit** a Pull Request

## Development Setup

**Requirements:**
- [Bun](https://bun.sh) >= 1.0
- macOS (the tool is macOS-only)
- Node.js >= 20.12.0

```bash
# Clone your fork
git clone https://github.com/<your-username>/mac-cleaner-cli.git
cd mac-cleaner-cli

# Install dependencies
bun install

# Run in development mode
bun run dev

# Run tests
bun run test

# Run linter
bun run lint

# Build
bun run build
```

## Project Structure

```
src/
├── index.ts              # CLI entry point (commander setup)
├── types.ts              # Shared types and CATEGORIES registry
├── commands/             # CLI command handlers
│   ├── interactive.ts    # Main interactive clean flow
│   ├── clean.ts          # Clean execution logic
│   ├── scan.ts           # Scan command
│   ├── uninstall.ts      # App uninstaller
│   └── maintenance.ts    # Maintenance tasks
├── scanners/             # One file per cleanable category
│   ├── base-scanner.ts   # Abstract base class
│   ├── system-cache.ts
│   ├── browser-cache.ts
│   └── ...
├── pickers/              # Interactive file selection UI
├── maintenance/          # DNS flush, purgeable space
└── utils/                # Shared utilities (fs, size, config, etc.)
```

## How to Contribute

### Reporting Bugs

Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.yml) template. Include:
- macOS version
- Tool version (`mac-cleaner-cli -V`)
- Steps to reproduce
- Expected vs actual behavior

### Suggesting Features

Use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.yml) template. Check existing issues and the [IDEAS.md](IDEAS.md) before opening a new one.

### Picking an Issue

Look for issues labeled:
- **`good first issue`** — great for first-time contributors
- **`help wanted`** — we'd love community help here
- **`enhancement`** — new features up for grabs

## Adding a New Scanner

Scanners are the core of this tool. Each one handles a specific category of junk files.

**Step 1 — Register the category in `src/types.ts`:**

```typescript
// Add to CategoryId type
export type CategoryId = ... | 'your-category';

// Add to CATEGORIES record
'your-category': {
  id: 'your-category',
  name: 'Human Readable Name',
  group: 'System Junk', // or 'Development' | 'Storage' | 'Browsers' | 'Large Files'
  description: 'Short description of what it cleans',
  safetyLevel: 'safe', // 'safe' | 'moderate' | 'risky'
  safetyNote: 'Optional note shown to user before cleaning', // for moderate/risky
},
```

**Step 2 — Create the scanner file `src/scanners/your-category.ts`:**

```typescript
import { BaseScanner } from './base-scanner.js';
import { CATEGORIES } from '../types.js';
import type { CleanableItem, ScanResult, ScannerOptions } from '../types.js';

export class YourCategoryScanner extends BaseScanner {
  constructor() {
    super(CATEGORIES['your-category']);
  }

  async scan(_options?: ScannerOptions): Promise<ScanResult> {
    const items: CleanableItem[] = [];
    // ... find files and populate items
    return this.buildResult(items);
  }
}
```

**Step 3 — Register it in `src/scanners/index.ts`.**

**Step 4 — Write tests in `src/scanners/your-category.test.ts`.**

## Coding Standards

- **No comments** — code should be self-documenting through clear naming
- **No magic numbers** — use named constants
- **Tests required** — every new feature or bug fix needs tests
- **TypeScript strict** — no `any`, no `@ts-ignore`
- **Self-contained** — scanners should not depend on each other

Before submitting:

```bash
bun run lint      # must pass
bun run test      # must pass, no regressions
bun run build     # must compile
```

## Submitting a Pull Request

1. Create a branch from `main`: `git checkout -b feat/my-feature`
2. Make your changes and commit using [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` new features
   - `fix:` bug fixes
   - `chore:` maintenance (deps, config)
   - `docs:` documentation only
   - `test:` test-only changes
   - `refactor:` code restructuring without behavior change
3. Push and open a PR against `main`
4. Fill in the PR template

PRs are reviewed within a few days. We may suggest changes — please don't take it personally, it's how open source works!

---

**Thank you for contributing.** Every PR, issue, and star helps keep this project alive. 🧹
