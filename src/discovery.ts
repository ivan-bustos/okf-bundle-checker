import { constants } from 'node:fs';
import { lstat, opendir, realpath, open } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, sep } from 'node:path';

export class OperationalError extends Error {
  constructor(readonly code: string, message: string, readonly path?: string) { super(message); this.name = 'OperationalError'; }
}
export interface DiscoveryLimits { maxEntries: number; maxTotalBytes: number; maxDocumentBytes: number; maxDepth: number }
export const DEFAULT_LIMITS: DiscoveryLimits = { maxEntries: 10_000, maxTotalBytes: 64 * 1024 * 1024, maxDocumentBytes: 1024 * 1024, maxDepth: 64 };
export interface BundleEntry { path: string; kind: 'directory' | 'markdown' | 'asset'; bytes: number }
export interface BundleScope {
  entries: BundleEntry[]; documents: { path: string; bytes: Uint8Array }[];
  exclusions: string[]; excludedEntries: number; totalBytes: number; conceptCount: number;
}
export const comparePaths = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
function contained(root: string, target: string): boolean { const p = relative(root, target); return p === '' || (!isAbsolute(p) && p !== '..' && !p.startsWith(`..${sep}`)); }
function exclusionMatcher(pattern: string): (path: string) => boolean {
  if (!pattern || pattern.length > 256 || pattern.startsWith('/') || pattern.includes('\\') || /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(pattern) || pattern.split('/').some(p => p === '.' || p === '..' || p === '')) throw new OperationalError('invalid-exclusion', 'Exclusions must be normalized relative glob paths up to 256 characters.');
  const parts = pattern.split('/');
  if (parts.some(part => part.includes('**') && part !== '**')) throw new OperationalError('invalid-exclusion', 'Double-star must occupy a whole path segment.');
  const segmentMatches = (glob: string, value: string): boolean => {
    let previous = new Array<boolean>(value.length + 1).fill(false); previous[0] = true;
    for (const token of glob) {
      const next = new Array<boolean>(value.length + 1).fill(false);
      next[0] = token === '*' && previous[0]!;
      for (let j = 1; j <= value.length; j++) next[j] = token === '*' ? previous[j]! || next[j - 1]! : previous[j - 1]! && (token === '?' || token === value[j - 1]);
      previous = next;
    }
    return previous[value.length]!;
  };
  return path => {
    const segments = path.replace(/\/$/, '').split('/');
    let previous = new Array<boolean>(segments.length + 1).fill(false); previous[0] = true;
    for (const part of parts) {
      const next = new Array<boolean>(segments.length + 1).fill(false);
      next[0] = part === '**' && previous[0]!;
      for (let j = 1; j <= segments.length; j++) next[j] = part === '**' ? previous[j]! || next[j - 1]! : previous[j - 1]! && segmentMatches(part, segments[j - 1]!);
      previous = next;
    }
    return previous[segments.length]!;
  };
}

/** Offline snapshot discovery. Do not mutate a bundle concurrently with a check. */
export async function discoverBundle(input: string, options: { exclusions?: string[]; limits?: Partial<DiscoveryLimits> } = {}): Promise<BundleScope> {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  for (const n of Object.values(limits)) if (!Number.isSafeInteger(n) || n < 1) throw new OperationalError('invalid-limit', 'Limits must be positive safe integers.');
  const exclusions = [...new Set(options.exclusions ?? [])].sort(comparePaths);
  if (exclusions.length > 100) throw new OperationalError('invalid-exclusion', 'At most 100 exclusions are supported.');
  const matchers = exclusions.map(exclusionMatcher);
  const result: BundleScope = { entries: [], documents: [], exclusions, excludedEntries: 0, totalBytes: 0, conceptCount: 0 };
  try {
    const rootStat = await lstat(input);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new OperationalError('invalid-root', 'Input must be a real directory, not a symbolic link.');
    const root = await realpath(input);
    let visited = 0;
    const logicalNames = new Set<string>();
    async function walk(directory: string, prefix: string, depth: number): Promise<void> {
      if (depth > limits.maxDepth) throw new OperationalError('depth-limit', 'Directory depth exceeds the configured limit.', prefix);
      const names: string[] = [];
      const handle = await opendir(directory);
      for await (const entry of handle) {
        if (++visited > limits.maxEntries) throw new OperationalError('entry-limit', 'Bundle entry limit exceeded.');
        names.push(entry.name);
      }
      names.sort(comparePaths);
      for (const name of names) {
        const logical = prefix ? `${prefix}/${name}` : name;
        if (logical.length > 4096 || /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069\\]/.test(name)) throw new OperationalError('unsafe-path', 'A filename cannot be represented safely and portably.');
        // A directory glob like vendor/** also prunes vendor itself.
        if (matchers.some(m => m(logical))) { result.excludedEntries++; continue; }
        const collisionKey = logical.normalize('NFC').toLowerCase();
        if (logicalNames.has(collisionKey)) throw new OperationalError('path-collision', 'Paths collide on a supported filesystem.', logical);
        logicalNames.add(collisionKey);
        const absolute = join(directory, name);
        const stat = await lstat(absolute);
        if (stat.isSymbolicLink()) throw new OperationalError('symlink', 'Symbolic links are unsupported; no link target was read.', logical);
        const resolved = await realpath(absolute);
        if (!contained(root, resolved) || resolved !== absolute) throw new OperationalError('outside-root', 'Path resolves outside its discovered location.', logical);
        if (stat.isDirectory()) {
          result.entries.push({ path: logical, kind: 'directory', bytes: 0 });
          await walk(absolute, logical, depth + 1);
        } else if (stat.isFile()) {
          result.totalBytes += stat.size;
          if (result.totalBytes > limits.maxTotalBytes) throw new OperationalError('byte-limit', 'Bundle byte limit exceeded.');
          const markdown = name.endsWith('.md');
          result.entries.push({ path: logical, kind: markdown ? 'markdown' : 'asset', bytes: stat.size });
          if (!markdown) continue;
          if (stat.size > limits.maxDocumentBytes) throw new OperationalError('document-limit', 'Markdown file exceeds the configured limit.', logical);
          const file = await open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
          try {
            const opened = await file.stat();
            if (!opened.isFile() || opened.ino !== stat.ino || opened.dev !== stat.dev || opened.size !== stat.size || await realpath(absolute) !== resolved) throw new OperationalError('input-changed', 'Input changed during discovery. Retry against a stable snapshot.', logical);
            // Bounded descriptor read: no readFile allocation based on a racing file size.
            const bytes = new Uint8Array(limits.maxDocumentBytes + 1);
            let length = 0;
            while (length < bytes.length) {
              const read = await file.read(bytes, length, bytes.length - length, length);
              if (read.bytesRead === 0) break;
              length += read.bytesRead;
            }
            const after = await file.stat();
            if (length > limits.maxDocumentBytes) throw new OperationalError('document-limit', 'Markdown file exceeds the configured limit.', logical);
            if (length !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs || await realpath(absolute) !== resolved) throw new OperationalError('input-changed', 'Input changed during discovery. Retry against a stable snapshot.', logical);
            result.documents.push({ path: logical, bytes: bytes.slice(0, length) });
            if (!['index.md', 'log.md'].includes(basename(logical))) result.conceptCount++;
          } finally { await file.close(); }
        } else throw new OperationalError('unsupported-entry', 'Only regular files and directories are supported.', logical);
      }
    }
    await walk(root, '', 0);
    if (result.conceptCount === 0) throw new OperationalError('empty-scope', 'No concept documents were found in the selected scope.');
    result.entries.sort((a,b) => comparePaths(a.path,b.path));
    result.documents.sort((a,b) => comparePaths(a.path,b.path));
    return result;
  } catch (error) {
    if (error instanceof OperationalError) throw error;
    throw new OperationalError('unreadable-input', 'Unable to read the complete selected scope.');
  }
}
