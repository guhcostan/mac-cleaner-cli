#!/usr/bin/env node

/**
 * Standalone script to analyze cache folders on macOS
 * Usage: npm run analyze-cache
 */

import { analyzeCacheFolders, printCacheReport } from './utils/cache-analyzer.js';

async function main() {
    console.log('🧹 Mac Cache Analyzer');
    console.log('Scanning all cache folders in ~/Library/Caches...\n');

    const items = await analyzeCacheFolders(10); // Show caches >= 10 MB
    printCacheReport(items);

    // Export to JSON for further analysis
    const jsonOutput = JSON.stringify(items, null, 2);
    console.log('\n📝 You can also export this data to JSON for further analysis.');
    console.log('Copy the output below if needed:\n');
    console.log(jsonOutput);
}

main().catch(console.error);
