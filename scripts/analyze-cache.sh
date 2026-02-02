#!/bin/bash

# Script to analyze cache folders using native macOS commands
# This is faster and more reliable than recursive Node.js scanning

echo "🧹 Mac Cache Analyzer (Fast Mode)"
echo "─────────────────────────────────────────────"
echo ""
echo "📊 Top 20 Largest Cache Folders in ~/Library/Caches:"
echo ""

# Use du (disk usage) to list all cache folders with their sizes
# -h: human-readable sizes
# -d 1: depth 1 (only direct subdirectories)
# Sort by size and show top 20
du -h -d 1 ~/Library/Caches 2>/dev/null | sort -rh | head -n 20

echo ""
echo "─────────────────────────────────────────────"
echo "💡 Tip: Look for folders like:"
echo "   • com.capcut.capcut (CapCut)"
echo "   • com.spotify.client (Spotify)"
echo "   • com.tinyspeck.slack (Slack)"
echo "   • Adobe folders"
echo "   • Google Chrome/Safari"
echo ""
echo "To clean a specific folder:"
echo "   rm -rf ~/Library/Caches/[folder-name]"
echo ""
