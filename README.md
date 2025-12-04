# Clean My Mac CLI

An open-source command-line tool to clean your Mac, inspired by CleanMyMac. Scan and remove junk files, caches, logs, and more.

## Features

- **Smart Scanning**: Automatically detects cleanable files across multiple categories
- **Safety Levels**: Items are classified as safe, moderate, or risky to prevent accidental data loss
- **Interactive Selection**: Choose exactly what to clean with an interactive checkbox interface
- **Dry Run Mode**: Preview what would be cleaned without actually deleting anything
- **Multiple Categories**: Clean system caches, logs, browser data, development files, and more

## Installation

### Using Homebrew (Recommended)

```bash
brew tap yourusername/clean-my-mac
brew install clean-my-mac
```

### Using npm

```bash
npm install -g clean-my-mac
```

### From Source

```bash
git clone https://github.com/yourusername/clean-my-mac.git
cd clean-my-mac
npm install
npm run build
npm link
```

## Usage

### Scan for Cleanable Files

```bash
# Full scan
clean-my-mac scan

# Detailed scan with file breakdown
clean-my-mac scan --verbose

# Scan specific category
clean-my-mac scan --category dev-cache

# List all available categories
clean-my-mac scan --list
```

### Clean Files

```bash
# Interactive cleaning (recommended)
clean-my-mac clean

# Preview what would be cleaned
clean-my-mac clean --dry-run

# Clean all safe and moderate categories
clean-my-mac clean --all --yes

# Include risky categories (downloads, iOS backups, etc)
clean-my-mac clean --all --yes --unsafe
```

### Maintenance Tasks

```bash
# Flush DNS cache
clean-my-mac maintenance --dns

# Free purgeable space
clean-my-mac maintenance --purgeable

# Run both
clean-my-mac maintenance --dns --purgeable
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

### Storage

| Category | Safety | Description |
|----------|--------|-------------|
| `trash` | 🟢 Safe | Files in the Trash bin |
| `downloads` | 🔴 Risky | Downloads older than 30 days |
| `ios-backups` | 🔴 Risky | iPhone and iPad backup files |
| `mail-attachments` | 🔴 Risky | Downloaded email attachments |

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
- 🔴 **Risky**: May contain important data. Requires `--unsafe` flag and individual file selection.

## Example Output

```
Scanning your Mac...

Scan Results
────────────────────────────────────────────────────────────

System Junk
  🟡 User Cache Files                15.5 GB (118 items)
  🟡 System Log Files               102.4 MB (80 items)
  🟢 Temporary Files                549.2 MB (622 items)
  🔴 Language Files                  68.9 MB (535 items)

Development
  🟡 Development Cache               21.9 GB (14 items)
  🟢 Homebrew Cache                 225.6 MB (1 items)
  🟢 Docker                           4.9 GB (3 items)

Browsers
  🟢 Browser Cache                    1.5 GB (3 items)

────────────────────────────────────────────────────────────
Total: 44.8 GB can be cleaned (1377 items)

Safety: 🟢 safe  🟡 moderate  🔴 risky (use --unsafe)
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev -- scan

# Run tests
npm test

# Run linter
npm run lint

# Type check
npm run typecheck

# Build for production
npm run build
```

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

This tool deletes files from your system. While we've implemented safety measures, always use `--dry-run` first to preview changes, and ensure you have backups of important data. Use at your own risk.

