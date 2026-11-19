import type { ParsedDocument } from './parser.js';
import { OperationalError } from './discovery.js';
export type SpecVersion = '0.2' | '0.3';
/** A root declaration wins; unversioned inputs retain the configured legacy default. */
export function bundleVersion(root: ParsedDocument | undefined, fallback: SpecVersion = '0.2'): SpecVersion {
  const data = root?.frontmatter.data;
  if (!data || !Object.hasOwn(data, 'okf_version')) return fallback;
  const value = data.okf_version;
  if ((typeof value === 'string' || typeof value === 'number') && (String(value) === '0.2' || String(value) === '0.3')) return String(value) as SpecVersion;
  throw new OperationalError('unsupported-version', 'Supported OKF versions are 0.2 and 0.3.', 'index.md');
}
