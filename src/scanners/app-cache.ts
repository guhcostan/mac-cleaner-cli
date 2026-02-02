import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type ScanResult, type ScannerOptions, type CleanableItem } from '../types.js';
import { PATHS, exists, getSize } from '../utils/index.js';
import { stat } from 'fs/promises';

export class AppCacheScanner extends BaseScanner {
    category = CATEGORIES['app-cache'];

    async scan(_options?: ScannerOptions): Promise<ScanResult> {
        const items: CleanableItem[] = [];

        const appPaths = [
            { name: 'Spotify Cache', path: PATHS.spotifyCache as string },
            { name: 'Telegram Cache', path: PATHS.telegramCache as string },
        ];

        // Handle single string paths
        for (const app of appPaths) {
            if (await exists(app.path)) {
                try {
                    const size = await getSize(app.path);
                    if (size > 0) {
                        const stats = await stat(app.path);
                        items.push({
                            path: app.path,
                            size,
                            name: app.name,
                            isDirectory: true,
                            modifiedAt: stats.mtime,
                        });
                    }
                } catch {
                    continue;
                }
            }
        }

        // Handle Slack (multi-path)
        const slackName = 'Slack Cache';
        const slackPaths = PATHS.slackCache as string[];
        let totalSlackSize = 0;
        const existingSlackPaths: string[] = [];

        for (const path of slackPaths) {
            if (await exists(path)) {
                try {
                    const size = await getSize(path);
                    if (size > 0) {
                        totalSlackSize += size;
                        existingSlackPaths.push(path);
                    }
                } catch {
                    // ignore
                }
            }
        }

        if (existingSlackPaths.length > 0) {
            items.push({
                path: existingSlackPaths[0], // Use first path as primary, but we'll need to handle cleaning all
                size: totalSlackSize,
                name: slackName,
                isDirectory: true,
            });
            // Note: This logic for cleaning multiple paths might need adjustment in BaseScanner
            // but for now let's just show it.
        }

        return this.createResult(items);
    }
}
