# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **`mac-cleaner-cli app install`** (alias `app update`) installs or updates the menu bar app: it downloads the build for your Mac from the latest GitHub release, verifies its SHA-256 digest and installs it into `/Applications` (or `~/Applications`), with `--no-open` and `--dir`. Because the download doesn't carry the quarantine attribute, the unsigned app opens without the Gatekeeper prompt
- **`install.sh`** for installing the app without Node.js: `curl -fsSL https://guhcostan.github.io/mac-cleaner-cli/install.sh | bash`
- CI installs the app with both installers on macOS and checks the bundle, its signature and that it isn't quarantined

## [1.4.0] - 2026-09-30

### Added
- **Desktop app (`desktop/`)** — a macOS menu bar app built with Electron on top of the CLI scanners: daily automatic clean of safe categories (runs on wake if the Mac was asleep), one-click Clean Now, Deep Clean with a reviewable preview and explicit confirmation before permanently deleting, run history, notifications, launch at login and Full Disk Access guidance. Packaged as `.dmg`/`.zip` for Apple Silicon and Intel by the new `Desktop App` workflow and attached to GitHub releases
- **`scan` command** — scan without deleting; supports `--category`, `--verbose`, and `--json` for scripts and integrations
- **`clean` command** — non-interactive cleaning for automation: `--all`, `--categories <ids>`, `--yes`, `--dry-run`, `--unsafe`
- **Visual size bars** in the category picker to spot the biggest space savings at a glance (idea from #46 by @alibosworth)
- **Full Disk Access detection** — interactive mode shows a one-time hint when the terminal lacks Full Disk Access, instead of failing later with permission errors (#61)
- **`--dry-run` in the interactive mode**, safety icons and legend in the picker, and the risky categories' warnings shown right before confirming (#78)
- **Real, opt-in backups** — with `"backupEnabled": true` in `~/.maccleanerrc`, items are moved to `~/.mac-cleaner-cli/backup/` instead of deleted, and `backup --restore <dir>` brings them back (#79)
- **`maintenance --timemachine` asks before deleting snapshots**, with new `--dry-run` and `--yes` flags (#85)
- **`MAC_CLEANER_DEBUG=1`** prints every path a scan skipped and why; categories that fail to scan are listed, reported in `scan --json`, and make the CLI exit with code 1 (#82)

### Fixed
- Never list live sockets or the runtime directories that hold them (e.g. `$TMPDIR/podman`) as reclaimable temp files (#71)
- The interactive confirmation now defaults to **No**, so a distracted Enter never deletes files (#75)
- Docker cleanup only prunes the resource types you selected (it used to run `docker system prune -af` regardless) and never touches volumes (#76)
- Every risky category (iOS backups, mail attachments, duplicates, language files) now requires reviewing files one by one, and opens with nothing pre-selected (#77)
- Dry runs report protected paths as failures instead of promising space the real run would never free (#78)
- Commander pinned to `^14`, since v15 requires Node 22.12+ while the CLI supports Node 20 (#84)

### Security
- Sanitize control, ANSI and bidi characters in file names before printing them, use absolute paths for `sudo`, `pbcopy` and `du`, tighten the backup restore boundary, and run CI with a read-only token by default (#80)

### Changed
- `homebrew` and `docker` are now labelled **moderate** instead of safe, with notes explaining what their cleanup really removes; the `language-files` warning now says it breaks the app's code signature (#76)
- More test coverage for maintenance tasks, Docker, Homebrew and config, with coverage thresholds raised to 90% (#81)
- Clean errors now include a breakdown by error code (e.g. `Failed to remove 40 items (32 EPERM, 8 EACCES)`) so permission issues are distinguishable from real failures
- `--help` now shows the correct binary name (`mac-cleaner-cli` instead of `mac-cleaner`)
- CI now also tests on Node 24, and npm releases are published with provenance attestation

## [1.3.5] - 2026-06-09

### Security
- Fix TOCTOU race condition in config file loading (`access()` + `readFile()` replaced with direct `readFile()`)
- Use unpredictable temp directories in tests (`randomBytes` / `mkdtemp` instead of predictable paths)

## [1.3.4] - 2026-06-09

### Fixed
- README images (banner + demo GIF) now render correctly on npmjs.com using absolute URLs

## [1.3.3] - 2026-06-09

### Fixed
- Silence `EPERM` errors when removing system-owned temp files (e.g. `/var/folders/.../T/com.apple.*`) — macOS SIP/TCC returns `EPERM` for these, which is expected and not actionable. Previously flooded output with dozens of error lines.

### Changed
- Bump `tsdown` from 0.21.10 to 0.22.0
- Bump `typescript` from 5.9.3 to 6.0.3
- Add `types: ["node"]` to tsconfig for TypeScript 6 compatibility

## [1.3.1] - 2026-01-15

### Changed
- Bump `tsdown` from 0.18.4 to 0.19.0

## [1.3.0] - 2025-12-23

### Added
- **File Picker Sublist** — interactive dual-pane file selection within categories
  - Select specific files before cleaning
  - Directory grouping and pagination
  - Arrow key navigation (`←` back, `→` enter)
  - Copy directory paths to clipboard
  - Enabled by default for `large-files` and `downloads`

### Fixed
- 12 security vulnerabilities fixed
- TOCTOU protection — re-verify file type before deletion
- System path protection — block deletion of protected paths
- Path traversal fixes — validate restore paths
- Command injection prevention — replaced `exec()` with `spawn()`
- Browser not opening during tests
- Homebrew scanner now uses secure command execution

### Changed
- Config validation with bounds checking
- Proper sudo handling with privilege checking
- Improved error handling and user feedback
- Updated `tsdown` to 0.18.1, `@types/node` to 25.0.1

## [1.2.0] - 2025-12-15

### Added
- Donation link shown after successful cleanup (Ko-fi)

## [1.1.9] - 2025-12-12

### Fixed
- Symlink size calculation
- Graceful shutdown on SIGINT / SIGTERM / SIGQUIT

## [1.1.8] - 2025-12-10

### Fixed
- Node.js minimum version requirement clarification

## [1.1.2] - 2025-12-04

### Fixed
- `npx` command not working correctly

## [1.1.1] - 2025-12-04

### Fixed
- Parallel scanner execution

## [1.1.0] - 2025-12-04

### Added
- Uninstall command — remove apps with all associated files
- Maintenance command — flush DNS cache and free purgeable space
- Config command — manage configuration file
- Backup command — manage file deletion backups
- `--risky` flag to include risky categories
- `--file-picker` flag to force file picker for all categories
- `--absolute-paths` flag

## [1.0.0] - 2025-12-04

### Added
- Initial release
- Interactive scanner for 16 categories (system cache, logs, browser cache, dev cache, trash, downloads, docker, homebrew, iOS backups, mail attachments, language files, large files, node modules, duplicates, launch agents)
- Safe / Moderate / Risky safety levels
- Progress bars and formatted output

[Unreleased]: https://github.com/guhcostan/mac-cleaner-cli/compare/v1.3.5...HEAD
[1.3.5]: https://github.com/guhcostan/mac-cleaner-cli/compare/v1.3.4...v1.3.5
[1.3.4]: https://github.com/guhcostan/mac-cleaner-cli/compare/v1.3.3...v1.3.4
[1.3.3]: https://github.com/guhcostan/mac-cleaner-cli/compare/v1.3.1...v1.3.3
[1.3.1]: https://github.com/guhcostan/mac-cleaner-cli/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/guhcostan/mac-cleaner-cli/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/guhcostan/mac-cleaner-cli/compare/v1.1.9...v1.2.0
[1.1.9]: https://github.com/guhcostan/mac-cleaner-cli/compare/v1.1.8...v1.1.9
[1.1.8]: https://github.com/guhcostan/mac-cleaner-cli/compare/v1.1.0...v1.1.8
[1.1.0]: https://github.com/guhcostan/mac-cleaner-cli/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/guhcostan/mac-cleaner-cli/releases/tag/v1.0.0
