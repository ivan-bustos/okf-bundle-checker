export { discoverBundle, OperationalError, DEFAULT_LIMITS } from './discovery.js';
export { parseDocument } from './parser.js';
export { checkCompliance, sortFindings } from './compliance.js';
import { discoverBundle } from './discovery.js';
import { parseDocument } from './parser.js';
import { checkCompliance, sortFindings } from './compliance.js';
/** Foundation API: compliance-only. Quality/config/resolution are later roadmap tickets. */
export async function inspectCompliance(root: string, options: Parameters<typeof discoverBundle>[1] = {}) {
  const scope = await discoverBundle(root, options);
  const documents = scope.documents.map(doc=>parseDocument(doc.path, doc.bytes));
  const findings = sortFindings(documents.flatMap(checkCompliance));
  return { scope: {entries:scope.entries.length,concepts:scope.conceptCount,documents:scope.documents.length,totalBytes:scope.totalBytes,exclusions:scope.exclusions,excludedEntries:scope.excludedEntries}, findings };
}
