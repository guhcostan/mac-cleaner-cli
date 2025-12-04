# Clean My Mac CLI

An open-source command-line tool to clean your Mac, inspired by CleanMyMac. Scan and remove junk files, caches, logs, and more.

[![CI](https://github.com/guhcostan/clean-my-mac/actions/workflows/ci.yml/badge.svg)](https://github.com/guhcostan/clean-my-mac/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/clean-my-mac-cli.svg)](https://www.npmjs.com/package/clean-my-mac-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/clean-my-mac-cli)](https://nodejs.org)
[![Platform: macOS](https://img.shields.io/badge/platform-macOS-blue.svg)](https://www.apple.com/macos/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Socket Badge](https://socket.dev/api/badge/npm/package/clean-my-mac-cli)](https://socket.dev/npm/package/clean-my-mac-cli)
[![GitHub Stars](https://img.shields.io/github/stars/guhcostan/clean-my-mac?style=social)](https://github.com/guhcostan/clean-my-mac)

## Quick Start

Just run one command - no installation required:

```bash
npx clean-my-mac-cli
```

That's it! The CLI will:
1. 🔍 Scan your Mac for cleanable files
2. 📋 Show you what was found
3. ✅ Let you select what to clean
4. 🗑️ Clean the selected items

## Features

- **One Command**: Just run `npx clean-my-mac-cli` - no complex flags to remember
- **Interactive**: Select exactly what you want to clean with checkboxes
- **Safe by Default**: Risky items are hidden unless you explicitly include them
- **Smart Scanning**: Finds caches, logs, development files, browser data, and more
- **App Uninstaller**: Remove apps completely with all their associated files
- **Maintenance Tasks**: Flush DNS cache, free purgeable space

## Usage

### Basic Usage (Recommended)

```bash
# Interactive mode - scan, select, and clean
npx clean-my-mac-cli

# Include risky categories (downloads, iOS backups, large files)
npx clean-my-mac-cli --risky
```

### Uninstall Apps

Remove applications completely, including their preferences, caches, and support files:

```bash
npx clean-my-mac-cli uninstall
```

### Maintenance Tasks

```bash
# Flush DNS cache (may require sudo)
npx clean-my-mac-cli maintenance --dns

# Free purgeable space
npx clean-my-mac-cli maintenance --purgeable
```

### Other Commands

```bash
# List all available categories
npx clean-my-mac-cli categories

# Manage configuration
npx clean-my-mac-cli config --init
npx clean-my-mac-cli config --show

# Manage backups
npx clean-my-mac-cli backup --list
npx clean-my-mac-cli backup --clean
```

## Global Installation (Optional)

If you use this tool frequently, install it globally:

```bash
npm install -g clean-my-mac-cli
clean-my-mac
```

## Categories

### System Junk

| Category | Safety | Description |
|----------|--------|-------------|
| `system-cache` | 🟡 Moderate | Application caches in ~/Library/Caches |
| `system-logs` | 🟡 Moderate | System and application logs |
| `temp-files` | 🟢 Safe | Temporary files in /tmp and /var/folders |
| `language-files` | 🔴 Risky | Unused language localizations |

### Development

| Category | Safety | Description |
|----------|--------|-------------|
| `dev-cache` | 🟡 Moderate | npm, yarn, pip, Xcode DerivedData, CocoaPods |
| `homebrew` | 🟢 Safe | Homebrew download cache |
| `docker` | 🟢 Safe | Unused Docker images, containers, volumes |
| `node-modules` | 🟡 Moderate | Orphaned node_modules in old projects |

### Storage

| Category | Safety | Description |
|----------|--------|-------------|
| `trash` | 🟢 Safe | Files in the Trash bin |
| `downloads` | 🔴 Risky | Downloads older than 30 days |
| `ios-backups` | 🔴 Risky | iPhone and iPad backup files |
| `mail-attachments` | 🔴 Risky | Downloaded email attachments |
| `duplicates` | 🔴 Risky | Duplicate files (keeps newest) |

### Browsers

| Category | Safety | Description |
|----------|--------|-------------|
| `browser-cache` | 🟢 Safe | Chrome, Safari, Firefox, Arc cache |

### Large Files

| Category | Safety | Description |
|----------|--------|-------------|
| `large-files` | 🔴 Risky | Files larger than 500MB |

## Safety Levels

- 🟢 **Safe**: Always safe to delete. Files are temporary or will be recreated automatically.
- 🟡 **Moderate**: Generally safe, but may cause minor inconvenience (e.g., apps rebuilding cache).
- 🔴 **Risky**: May contain important data. Hidden by default, use `--risky` to include.

## Example

```
$ npx clean-my-mac-cli

🧹 Clean My Mac
──────────────────────────────────────────────────────

Scanning your Mac for cleanable files...

Found 44.8 GB that can be cleaned:

? Select categories to clean (space to toggle, enter to confirm):
  ◉ 🟢 Trash                            2.1 GB (45 items)
  ◉ 🟢 Browser Cache                    1.5 GB (3 items)
  ◉ 🟢 Temporary Files                549.2 MB (622 items)
  ◉ 🟡 User Cache Files                15.5 GB (118 items)
  ◉ 🟡 Development Cache               21.9 GB (14 items)

Summary:
  Items to delete: 802
  Space to free: 41.5 GB

? Proceed with cleaning? (Y/n)

✓ Cleaning Complete!
──────────────────────────────────────────────────────
  Trash                          ✓ 2.1 GB freed
  Browser Cache                  ✓ 1.5 GB freed
  Temporary Files                ✓ 549.2 MB freed
  User Cache Files               ✓ 15.5 GB freed
  Development Cache              ✓ 21.9 GB freed

──────────────────────────────────────────────────────
🎉 Freed 41.5 GB of disk space!
   Cleaned 802 items
```

## Development

```bash
# Clone the repo
git clone https://github.com/guhcostan/clean-my-mac.git
cd clean-my-mac

# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Run linter
npm run lint

# Type check
npm run typecheck

# Build for production
npm run build
```

## Security

This project takes security seriously:

- **Open Source**: All code is publicly available for audit on [GitHub](https://github.com/guhcostan/clean-my-mac)
- **No Network Requests**: The CLI operates entirely offline - no data leaves your machine
- **Minimal Dependencies**: Only 4 runtime dependencies, all from trusted maintainers
- **CI/CD Pipeline**: Every release is tested with TypeScript type checking, ESLint, and automated tests
- **Code Coverage**: High test coverage ensures reliability and catches regressions
- **Socket.dev Verified**: Dependencies are monitored for supply chain attacks
- **OpenSSF Scorecard**: Security health metrics tracked by the Open Source Security Foundation

If you find a security vulnerability, please report it via [GitHub Security Advisories](https://github.com/guhcostan/clean-my-mac/security/advisories/new).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Disclaimer

This tool deletes files from your system. While we've implemented safety measures, always ensure you have backups of important data. Use at your own risk.
