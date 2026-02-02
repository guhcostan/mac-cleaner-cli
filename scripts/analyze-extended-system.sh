#!/bin/bash

# Extended system data analyzer - looks beyond ~/Library

echo "🔍 Extended macOS System Data Analysis"
echo "════════════════════════════════════════════════════════════════"
echo ""

# 1. Check system-wide locations
echo "📂 Checking /Library (System-wide)"
echo "────────────────────────────────────────────────────────────────"
sudo du -h -d 1 /Library 2>/dev/null | sort -rh | head -n 15

echo ""
echo "📂 Checking /private/var (System cache & logs)"
echo "────────────────────────────────────────────────────────────────"
sudo du -h -d 1 /private/var 2>/dev/null | sort -rh | head -n 10

echo ""
echo "📂 Checking /Users (All user data)"
echo "────────────────────────────────────────────────────────────────"
sudo du -h -d 1 /Users 2>/dev/null | sort -rh | head -n 5

echo ""
echo "📂 Checking Time Machine snapshots"
echo "────────────────────────────────────────────────────────────────"
tmutil listlocalsnapshots / 2>/dev/null || echo "No local snapshots or tmutil not available"

echo ""
echo "📂 Largest files on the system (> 1GB)"
echo "────────────────────────────────────────────────────────────────"
echo "⏳ Searching (this may take a moment)..."
sudo find / -type f -size +1G 2>/dev/null | head -n 20

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "💡 The 'System Data' category often includes:"
echo "   • /Library/Application Support"
echo "   • /private/var/vm (swap files)"
echo "   • Local Time Machine snapshots"
echo "   • System caches in /Library/Caches"
echo ""
