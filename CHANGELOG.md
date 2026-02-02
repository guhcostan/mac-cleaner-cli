# Changelog

All notable changes to this project will be documented in this file.

## [1.4.0] - 2026-02-02

### 🆕 Added - Deep System Data Cleanup

#### New Features
- **Deep System Data Scanner** (`deep-system-data`) - Automatically detects and cleans large folders:
  - Application Support folders (Zalo, Adobe, Steam, Google, etc.)
  - Containers (Docker, sandboxed apps)
  - Group Containers (Telegram, Messenger, etc.)
  - Supports interactive file selection with drill-down capability
  - Real-world results: Users report freeing 20-40 GB of System Data!

- **Enhanced App Cache Scanner** (`app-cache`)
  - Spotify cache detection
  - Slack cache (multiple paths)
  - Telegram cache in Group Containers

- **Xcode Enhancements** (in `dev-cache`)
  - iOS Device Support (often 5-10 GB)
  - Simulators detection
  - Archives cleanup

- **Time Machine Maintenance**
  - New `--timemachine` flag for `maintenance` command
  - Cleans local Time Machine snapshots
  - Can free up significant purgeable space

- **Vietnamese Documentation**
  - Full Vietnamese translation of README
  - Language navigation at the top of README
  - SEO-optimized for Vietnamese users

#### Developer Tools
- **Cache Analysis Scripts**
  - `scripts/analyze-cache.sh` - Fast cache folder analysis
  - `scripts/analyze-system-data.sh` - Comprehensive system data breakdown
  - `scripts/analyze-extended-system.sh` - System-wide analysis (requires sudo)

### 🔧 Improved
- Lowered minimum detection threshold for better coverage
- Enhanced path handling for system locations
- Better error messages for permission-denied scenarios
- Improved file selection UI hints

### 📝 Documentation
- Added "What's New" section highlighting latest features
- Updated feature comparison table
- Enhanced category descriptions with real-world examples
- Added Vietnamese usage guide

### 🐛 Bug Fixes
- Fixed import paths in utils
- Corrected HOME directory handling
- Improved error handling for protected directories

---

## [1.3.1] - Previous Release

### Features
- Basic cache cleaning
- Browser cache detection
- Development cache (npm, yarn, pip)
- Homebrew cache cleanup
- Docker cleanup
- System logs and temp files
- Application uninstaller
- DNS cache flush
- Purgeable space cleanup

---

## Migration Notes

### For Users
1. Run with `--risky` flag to access the new Deep System Data scanner
2. Use arrow keys (→) to drill down into categories for file selection
3. Common big items found by Deep Scanner:
   - **Zalo**: 15-20 GB (chat history cache)
   - **Docker**: 20-30 GB (old containers/images)
   - **Adobe**: 5-10 GB (media cache files)
   - **Steam**: 1-3 GB (shader cache)
   - **Google**: 5-10 GB (Chrome/Drive cache)

### For Developers
- New scanner type: `DeepSystemDataScanner`
- New category ID: `deep-system-data`
- Enhanced `PATHS` utility with app-specific paths
- Time Machine maintenance utilities in `src/maintenance/`

---

## SEO Keywords
mac cleaner, system data, zalo cache, docker cleanup, adobe cache, telegram cleanup, spotify cache, deep clean macos, free disk space, xcode simulator cleanup, ios device support, time machine snapshots, vietnamese mac cleaner
