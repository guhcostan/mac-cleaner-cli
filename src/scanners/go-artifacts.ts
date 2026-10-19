import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type ScanResult, type ScannerOptions } from '../types.js';
import { scanRepoArtifacts } from '../repo-artifacts/walker.js';

export class GoArtifactsScanner extends BaseScanner {
  category = CATEGORIES['go-artifacts'];
  async scan(options?: ScannerOptions): Promise<ScanResult> {
    return (await scanRepoArtifacts([this.category], options))[0];
  }
}
