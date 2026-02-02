# 🚀 v1.4.0 - Deep System Data Cleanup

## 🎉 Major Release: Free 20-40 GB of System Data!

This release introduces the most requested feature: **Deep System Data Scanner** - helping you identify and clean the mysterious "System Data" that consumes 100+ GB on macOS.

---

## ⭐ Highlights

### 🔍 Deep System Data Scanner
Find and clean large app folders that contribute to System Data:
- **Zalo**: 15-20 GB (chat cache)
- **Docker**: 20-30 GB (orphaned containers)  
- **Adobe**: 5-10 GB (media cache)
- **Steam**: 1-3 GB (shader cache)
- **Google**: 5-10 GB (Chrome/Drive)

**Usage:**
```bash
npx mac-cleaner-cli --risky
# Select "Deep System Data" → Use arrow keys to choose what to delete
```

### Real Results 📊
```
Before: System Data = 111 GB
After:  System Data = 40 GB
Freed:  71 GB in 5 minutes! ✨
```

---

## 🆕 New Features

### 📱 Enhanced App Cache
- Spotify cache detection
- Slack multi-path cache
- Telegram Group Container cache

### 🛠️ Xcode Improvements
- iOS Device Support (5-10 GB)
- Simulators cleanup
- Enhanced dev-cache scanner

### ⏱️ Time Machine Maintenance
```bash
npx mac-cleaner-cli maintenance --timemachine
```
Cleans local Time Machine snapshots to free purgeable space.

### 🇻🇳 Vietnamese Support
Full Vietnamese documentation for Vietnamese-speaking users.

---

## 📦 Installation

```bash
# Run without installing
npx mac-cleaner-cli --risky

# Or install globally
npm install -g mac-cleaner-cli
mac-cleaner-cli --risky
```

---

## 🎯 Quick Start Guide

**1. Scan for Deep System Data:**
```bash
npx mac-cleaner-cli --risky
```

**2. Navigate to "Deep System Data":**
- Use arrow keys (↓↑) to move
- Press → to see detailed file list
- Press SPACE to select items

**3. Common cleanup targets:**
- Zalo chat cache: `~/Library/Application Support/ZaloData`
- Docker: `~/Library/Containers/com.docker.docker`
- Adobe cache: `~/Library/Application Support/Adobe`

**4. Confirm and clean:**
- Review selected items
- Press ENTER to proceed
- May require `sudo` for some items

---

## 📈 What Changed

### Added
- Deep System Data scanner (`deep-system-data` category)
- App Cache scanner for Spotify, Slack, Telegram
- Time Machine snapshot cleanup
- Vietnamese documentation
- Shell scripts for cache analysis

### Enhanced  
- Xcode scanner now includes iOS DeviceSupport & Simulators
- Better path handling for system locations
- Improved error messages for permission issues
- Interactive file selection UI

### Documentation
- New CHANGELOG.md
- Vietnamese README section
- PR and Issue templates
- Real-world usage examples

---

## 🔐 Security

- ✅ Safe by default (Deep Scanner requires `--risky` flag)
- ✅ Path validation prevents system file deletion
- ✅ Sudo detection with user-friendly prompts
- ✅ No breaking changes to existing features

---

## 🐛 Bug Fixes

- Fixed import paths in utility modules
- Improved HOME directory handling
- Better error handling for protected directories

---

## 💬 Feedback Welcome!

This is a major feature release. If you:
- 🎉 Freed significant space, share your results!
- 🐛 Found a bug, please open an issue
- 💡 Have suggestions, we'd love to hear them
- 🌍 Want to add more language support, PRs welcome!

---

## 🙏 Credits

Thanks to everyone who reported "System Data" issues and helped test this release!

**Special thanks:**
- Community feedback on macOS storage issues
- Testers who validated the 20-40 GB claim
- Vietnamese translation contributors

---

## 📚 Resources

- [Full Changelog](CHANGELOG.md)
- [Vietnamese Guide](README.md#-hướng-dẫn-sử-dụng-vietnamese)
- [GitHub Repository](https://github.com/guhcostan/mac-cleaner-cli)
- [Report Issues](https://github.com/guhcostan/mac-cleaner-cli/issues)

---

**Download:** `npm install -g mac-cleaner-cli@1.4.0`

**Enjoy your reclaimed disk space!** 🎊
