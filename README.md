<p align="center">
  <h1 align="center">🧹 Mac Cleaner CLI</h1>
  <p align="center">
    <strong>Free & Open Source Mac cleanup tool</strong>
  </p>
  <p align="center">
    Scan and remove junk files, caches, logs, and more — all from your terminal.
  </p>
</p>

<p align="center">
  <a href="#-mac-cleaner-cli">English</a> •
  <a href="#-hướng-dẫn-sử-dụng-vietnamese">Tiếng Việt</a>
</p>
<p align="center">
  <a href="https://www.npmjs.com/package/mac-cleaner-cli"><img src="https://img.shields.io/npm/v/mac-cleaner-cli?color=cb3837&label=npm&logo=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/mac-cleaner-cli"><img src="https://img.shields.io/npm/dm/mac-cleaner-cli?color=cb3837&logo=npm" alt="npm downloads"></a>
  <a href="https://github.com/guhcostan/mac-cleaner-cli/actions/workflows/ci.yml"><img src="https://github.com/guhcostan/mac-cleaner-cli/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/mac-cleaner-cli" alt="Node.js Version"></a>
  <a href="https://www.apple.com/macos/"><img src="https://img.shields.io/badge/platform-macOS-000?logo=apple" alt="Platform: macOS"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.3-3178c6?logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://socket.dev/npm/package/mac-cleaner-cli"><img src="https://socket.dev/api/badge/npm/package/mac-cleaner-cli" alt="Socket Badge"></a>
</p>

<p align="center">
  <a href="https://github.com/guhcostan/mac-cleaner-cli"><img src="https://img.shields.io/github/stars/guhcostan/mac-cleaner-cli?style=social" alt="GitHub Stars"></a>
</p>

<p align="center">
  <a href="https://ko-fi.com/guhcostan"><img src="https://img.shields.io/badge/Ko--fi-Support_this_project-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Support on Ko-fi"></a>
</p>

<p align="center">
  <strong>🪟 Also available for Windows:</strong> <a href="https://github.com/guhcostan/windows-cleaner-cli">windows-cleaner-cli</a>
</p>

---

## 🆕 What's New

**Deep System Data Cleanup** - The latest update introduces advanced system data detection:
- 🔍 **Deep System Data Scanner**: Automatically detects large folders in Application Support, Containers, and Group Containers (Docker, Zalo, Adobe, Steam, etc.)
- 📱 **Enhanced App Cache**: Now includes Spotify, Slack, and Telegram cache cleaning
- 🛠️ **Xcode Enhancements**: Detects iOS Device Support and Simulators
- ⏱️ **Time Machine Cleanup**: New maintenance command to free purgeable snapshots
- 🇻🇳 **Vietnamese Documentation**: Full Vietnamese translation of usage guide

> 💡 **Real-world results**: Users report freeing **20-40 GB** of System Data with the new Deep Scanner!

---

## ⚡ Quick Start

```bash
npx mac-cleaner-cli
```

That's it! No installation needed. The CLI will:

1. 🔍 **Scan** your Mac for cleanable files
2. 📋 **Show** you what was found with sizes
3. ✅ **Let you select** exactly what to clean
4. 🗑️ **Clean** the selected items safely

## 🎬 See It In Action

```
$ npx mac-cleaner-cli

🧹 Mac Cleaner CLI
──────────────────────────────────────────────────────

Scanning your Mac for cleanable files...

Found 44.8 GB that can be cleaned:

? Select categories to clean (space to toggle, enter to confirm):
❯ ◯ ● Trash                            2.1 GB (45 items)
  ◯ ● Browser Cache                    1.5 GB (3 items)
  ◯ ● Temporary Files                549.2 MB (622 items)
  ◯ ● User Cache Files                15.5 GB (118 items)
  ◯ ● Development Cache               21.9 GB (14 items)
↑↓ navigate • ← back • → enter • space select • a all • i invert • ⏎ submit

# Press → on a supported category to browse and select specific folders/files
? Browsing: Root Scan Results
❯ ◯ 📂 com.apple.Safari                         1.2 GB
  ◯ 📂 com.google.Chrome                        2.3 GB
  ◯ 📂 com.spotify.client                     824.1 MB
↑↓ navigate • ← back • → enter • space select • a all • i invert • ⏎ submit

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

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🚀 **One Command** | Just run `npx mac-cleaner-cli` — no complex flags |
| 🎯 **Interactive** | Select exactly what you want to clean with checkboxes |
| 📁 **File Explorer** | Drill down (`→`) into supported categories to select specific folders/files |
| 🛡️ **Safe by Default** | Risky items hidden unless you use `--risky` |
| 🔍 **Smart Scanning** | Finds caches, logs, dev files, browser data, and more |
| 📱 **App Uninstaller** | Remove apps completely with all associated files |
| 🔧 **Maintenance** | Flush DNS cache, free purgeable space, clean Time Machine snapshots |
| 🧹 **Deep System Data** | Find and clean large app data (Zalo, Adobe, Steam, Docker) |
| 🔒 **Privacy First** | 100% offline — no data ever leaves your machine |
| 📦 **Minimal Dependencies** | Only 5 runtime deps, all from trusted maintainers |

## 🎯 What It Cleans

### 🟢 Safe (always safe to delete)

| Category | What it cleans |
|----------|---------------|
| `trash` | Files in the Trash bin |
| `temp-files` | Temporary files in /tmp and /var/folders |
| `browser-cache` | Chrome, Safari, Firefox, Arc cache |
| `homebrew` | Homebrew download cache |
| `docker` | Unused Docker images, containers, volumes |

### 🟡 Moderate (generally safe)

| Category | What it cleans |
|----------|---------------|
| `system-cache` | Application caches in ~/Library/Caches |
| `system-logs` | System and application logs |
| `dev-cache` | npm, yarn, pip, Xcode DerivedData, CocoaPods, **iOS DeviceSupport**, **Simulators** |
| `node-modules` | Orphaned node_modules in old projects |
| `app-cache` | Spotify, Slack, Telegram cache files |

### 🔴 Risky (use `--risky` flag)

| Category | What it cleans |
|----------|---------------|
| `downloads` | Downloads older than 30 days |
| `ios-backups` | iPhone and iPad backup files |
| `mail-attachments` | Downloaded email attachments |
| `duplicates` | Duplicate files (keeps newest) |
| `large-files` | Files larger than 500MB |
| `language-files` | Unused language localizations |
| **`deep-system-data`** | **Large app data folders (Zalo 20GB+, Docker, Adobe, Steam, etc.)** |

## 📖 Usage

### Basic Usage

```bash
# Interactive mode — scan, select, and clean
npx mac-cleaner-cli

# Include risky categories
npx mac-cleaner-cli --risky

# Enable file picker for all categories
npx mac-cleaner-cli --risky -f
```

### Folder-Level Selection (Interactive)

In interactive mode, you can drill into some categories and select specific folders/files to delete:

- Controls: `↑↓` navigate • `←` back • `→` enter • `space` select • `a` all • `i` invert • `⏎` submit
- Supported categories include: User Cache Files (`system-cache`), Temporary Files (`temp-files`), System Log Files (`system-logs`), Development Cache (`dev-cache`), Browser Cache (`browser-cache`), Homebrew Cache (`homebrew`)

### Uninstall Apps

Remove applications completely with all their preferences, caches, and support files:

```bash
npx mac-cleaner-cli uninstall
```

### Maintenance Tasks

```bash
# Flush DNS cache (may require sudo)
npx mac-cleaner-cli maintenance --dns

# Free purgeable space
npx mac-cleaner-cli maintenance --purgeable

# Clean Time Machine local snapshots (NEW!)
npx mac-cleaner-cli maintenance --timemachine
```

### Other Commands

```bash
# List all available categories
npx mac-cleaner-cli categories

# Manage configuration
npx mac-cleaner-cli config --init
npx mac-cleaner-cli config --show

# Manage backups
npx mac-cleaner-cli backup --list
npx mac-cleaner-cli backup --clean
```

### Other flags

```bash
# Show help
npx mac-cleaner-cli -h  # or --help
# Show version
npx mac-cleaner-cli -V  # or --version
# Directory paths shown in absolute format
npx mac-cleaner-cli -A  # or --absolute-paths
```

## 💻 Global Installation

If you use this tool frequently:

```bash
npm install -g mac-cleaner-cli
mac-cleaner-cli
```

## 🔒 Security

| | |
|---|---|
| ✅ **Open Source** | All code publicly available for audit |
| ✅ **No Network** | Operates 100% offline |
| ✅ **Minimal Deps** | Only 5 runtime dependencies |
| ✅ **CI/CD** | Every release tested with TypeScript, ESLint, and automated tests |
| ✅ **Socket.dev** | Dependencies monitored for supply chain attacks |

Found a vulnerability? Report it via [GitHub Security Advisories](https://github.com/guhcostan/mac-cleaner-cli/security/advisories/new).

## 🛠️ Development

```bash
git clone https://github.com/guhcostan/mac-cleaner-cli.git
cd mac-cleaner-cli
npm install
npm run dev      # Run in dev mode
npm test         # Run tests
npm run lint     # Run linter
npm run build    # Build for production
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 💚 Support

If this tool saved you time or disk space, consider supporting the project!

<p align="center">
  <a href="https://ko-fi.com/guhcostan"><img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support on Ko-fi"></a>
</p>

Your support helps maintain and improve this tool. Thank you! 🙏


---

# 🇻🇳 Hướng dẫn sử dụng (Vietnamese)

## 🆕 Tính năng mới

**Dọn dẹp Dữ liệu Hệ thống Chuyên sâu** - Phiên bản mới nhất bổ sung khả năng phát hiện dữ liệu hệ thống nâng cao:
- 🔍 **Deep System Data Scanner**: Tự động phát hiện các thư mục lớn trong Application Support, Containers (Docker, Zalo, Adobe, Steam, v.v.)
- 📱 **Cache ứng dụng nâng cao**: Hỗ trợ dọn Spotify, Slack, Telegram
- 🛠️ **Cải tiến Xcode**: Phát hiện iOS Device Support và Simulators
- ⏱️ **Dọn Time Machine**: Lệnh bảo trì mới để giải phóng snapshots

> 💡 **Kết quả thực tế**: Người dùng đã giải phóng được **20-40 GB** Dữ liệu Hệ thống với Deep Scanner!

---

## ⚡ Bắt đầu nhanh

```bash
npx mac-cleaner-cli
```

Chỉ vậy thôi! Không cần cài đặt. CLI sẽ:

1. 🔍 **Quét** máy Mac của bạn để tìm các tệp có thể dọn dẹp
2. 📋 **Hiển thị** kết quả tìm thấy kèm theo dung lượng
3. ✅ **Cho phép bạn chọn** chính xác những gì muốn dọn dẹp
4. 🗑️ **Dọn dẹp** các mục đã chọn một cách an toàn

## ✨ Tính năng chính

| Tính năng | Mô tả |
|---------|-------------|
| 🚀 **Một câu lệnh** | Chỉ cần chạy `npx mac-cleaner-cli` — không cần cờ phức tạp |
| 🎯 **Tương tác trực quan** | Chọn chính xác những gì bạn muốn dọn dẹp bằng các hộp kiểm |
| 📁 **Khám phá tệp** | Đi sâu (`→`) vào các danh mục được hỗ trợ để chọn các thư mục/tệp cụ thể |
| 🛡️ **An toàn mặc định** | Các mục rủi ro sẽ bị ẩn trừ khi bạn sử dụng cờ `--risky` |
| 🔍 **Quét thông minh** | Tìm bộ nhớ đệm, nhật ký, tệp phát triển, dữ liệu trình duyệt và hơn thế nữa |
| 📱 **Gỡ cài đặt ứng dụng** | Xóa ứng dụng hoàn toàn cùng với tất cả các tệp liên quan |
| 🔧 **Bảo trì** | Xóa bộ nhớ đệm DNS, giải phóng dung lượng có thể thu hồi |
| 🔒 **Quyền riêng tư** | 100% ngoại tuyến — không có dữ liệu nào rời khỏi máy của bạn |

## 🎯 Danh mục dọn dẹp

### 🟢 An toàn (luôn an toàn để xóa)

| Danh mục | Những gì sẽ được dọn dẹp |
|----------|---------------|
| `trash` | Tệp trong Thùng rác |
| `temp-files` | Tệp tạm thời trong /tmp và /var/folders |
| `browser-cache` | Bộ nhớ đệm Chrome, Safari, Firefox, Arc |
| `homebrew` | Bộ nhớ đệm tải xuống của Homebrew |
| `docker` | Hình ảnh, container, volume Docker không sử dụng |

### 🟡 Trung bình (thường là an toàn)

| Danh mục | Những gì sẽ được dọn dẹp |
|----------|---------------|
| `system-cache` | Bộ nhớ đệm ứng dụng trong ~/Library/Caches |
| `system-logs` | Nhật ký hệ thống và ứng dụng |
| `dev-cache` | npm, yarn, pip, Xcode DerivedData, CocoaPods, **iOS DeviceSupport**, **Simulators** |
| `node-modules` | Thư mục node_modules dư thừa trong các dự án cũ |
| `app-cache` | Cache của Spotify, Slack, Telegram |

### 🔴 Rủi ro (sử dụng cờ `--risky`)

| Danh mục | Những gì sẽ được dọn dẹp |
|----------|---------------|
| `downloads` | Tải xuống cũ hơn 30 ngày |
| `ios-backups` | Tệp sao lưu iPhone và iPad |
| `mail-attachments` | Tệp đính kèm email đã tải xuống |
| `duplicates` | Tệp trùng lặp (giữ lại bản mới nhất) |
| `large-files` | Tệp lớn hơn 500MB |
| `language-files` | Các tệp ngôn ngữ không sử dụng |
| **`deep-system-data`** | **Thư mục dữ liệu ứng dụng lớn (Zalo 20GB+, Docker, Adobe, Steam, v.v.)** |

## 📖 Cách sử dụng

### Sử dụng cơ bản

```bash
# Chế độ tương tác — quét, chọn và dọn dẹp
npx mac-cleaner-cli

# Bao gồm các danh mục rủi ro
npx mac-cleaner-cli --risky

# Bật trình chọn tệp cho tất cả các danh mục
npx mac-cleaner-cli --risky -f
```

### Gỡ cài đặt ứng dụng

Xóa hoàn toàn ứng dụng cùng với các tùy chỉnh, bộ nhớ đệm và tệp hỗ trợ:

```bash
npx mac-cleaner-cli uninstall
```

### Tác vụ bảo trì

```bash
# Xóa bộ nhớ đệm DNS (có thể yêu cầu sudo)
npx mac-cleaner-cli maintenance --dns

# Giải phóng dung lượng có thể thu hồi (purgeable space)
npx mac-cleaner-cli maintenance --purgeable

# Dọn dẹp bản sao lưu Time Machine cục bộ (MỚI!)
npx mac-cleaner-cli maintenance --timemachine
```

## 💻 Cài đặt toàn cục (tùy chọn)

Nếu bạn sử dụng công cụ này thường xuyên:

```bash
npm install -g mac-cleaner-cli
mac-cleaner-cli
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>⚠️ Disclaimer</strong><br>
  This tool deletes files from your system. While we've implemented safety measures, always ensure you have backups of important data.
</p>

<p align="center">
  Made with ❤️ for Mac users everywhere
</p>
