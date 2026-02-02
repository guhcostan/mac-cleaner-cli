#!/bin/bash

# Comprehensive system data analyzer for macOS
# This script scans multiple locations where "System Data" might accumulate

echo "🔍 macOS System Data Analyzer"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Function to print section header
print_section() {
    echo ""
    echo "📂 $1"
    echo "────────────────────────────────────────────────────────────────"
}

# 1. User Caches
print_section "User Caches (~/Library/Caches)"
du -h -d 1 ~/Library/Caches 2>/dev/null | sort -rh | head -n 10

# 2. Application Support
print_section "Application Support (~/Library/Application Support)"
du -h -d 1 ~/Library/Application\ Support 2>/dev/null | sort -rh | head -n 10

# 3. Containers (Sandboxed apps)
print_section "App Containers (~/Library/Containers)"
du -h -d 1 ~/Library/Containers 2>/dev/null | sort -rh | head -n 10

# 4. Group Containers
print_section "Group Containers (~/Library/Group Containers)"
du -h -d 1 ~/Library/Group\ Containers 2>/dev/null | sort -rh | head -n 10

# 5. Developer (Xcode, iOS backups, etc.)
if [ -d ~/Library/Developer ]; then
    print_section "Developer Files (~/Library/Developer)"
    du -h -d 1 ~/Library/Developer 2>/dev/null | sort -rh | head -n 10
fi

# 6. Mobile Device Backups (iOS)
if [ -d ~/Library/Application\ Support/MobileSync/Backup ]; then
    print_section "iOS Device Backups"
    du -h -d 1 ~/Library/Application\ Support/MobileSync/Backup 2>/dev/null | sort -rh | head -n 5
fi

# 7. Mail Downloads
if [ -d ~/Library/Mail ]; then
    print_section "Mail Data"
    du -h -d 1 ~/Library/Mail 2>/dev/null | sort -rh | head -n 5
fi

# 8. Logs
print_section "System Logs (~/Library/Logs)"
du -h -d 1 ~/Library/Logs 2>/dev/null | sort -rh | head -n 10

# 9. Safari
if [ -d ~/Library/Safari ]; then
    print_section "Safari Data (~/Library/Safari)"
    du -h ~/Library/Safari 2>/dev/null
fi

# 10. Overall Summary
print_section "Overall Library Size"
du -h -d 0 ~/Library 2>/dev/null

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "💡 Key areas to check:"
echo "   • Application Support: Apps like CapCut, Adobe store data here"
echo "   • Containers: Sandboxed apps (Discord, Telegram, etc.)"
echo "   • Developer: Xcode caches, iOS simulators, device support"
echo "   • MobileSync/Backup: iPhone/iPad backups (can be HUGE!)"
echo ""
echo "🧹 To see your entire Library structure sorted by size:"
echo "   du -h ~/Library | sort -rh | head -n 50"
echo ""
