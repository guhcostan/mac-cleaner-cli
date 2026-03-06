# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/guhcostan/mac-cleaner-cli/compare/v1.3.1...HEAD
[1.3.1]: https://github.com/guhcostan/mac-cleaner-cli/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/guhcostan/mac-cleaner-cli/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/guhcostan/mac-cleaner-cli/compare/v1.1.9...v1.2.0
[1.1.9]: https://github.com/guhcostan/mac-cleaner-cli/compare/v1.1.8...v1.1.9
[1.1.8]: https://github.com/guhcostan/mac-cleaner-cli/compare/v1.1.0...v1.1.8
[1.1.0]: https://github.com/guhcostan/mac-cleaner-cli/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/guhcostan/mac-cleaner-cli/releases/tag/v1.0.0
