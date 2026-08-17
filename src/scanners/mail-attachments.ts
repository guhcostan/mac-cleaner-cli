import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type ScanResult, type ScannerOptions } from '../types.js';
import { PATHS, collectDirectoryItems } from '../utils/index.js';

export class MailAttachmentsScanner extends BaseScanner {
  category = CATEGORIES['mail-attachments'];

  async scan(_options?: ScannerOptions): Promise<ScanResult> {
    const items = await collectDirectoryItems([PATHS.mailDownloads]);

    return this.createResult(items);
  }
}







