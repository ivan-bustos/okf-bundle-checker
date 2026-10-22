import type { BundleEntry } from './discovery.js';

export type UnsafeLinkReason = 'invalid-source' | 'unsafe-characters' | 'drive-path' | 'malformed-encoding' | 'encoded-separator' | 'outside-bundle';
export type LinkResolution =
  | { kind: 'external' }
  | { kind: 'unsafe'; reason: UnsafeLinkReason }
  | { kind: 'missing'; path: string; query: string; fragment: string }
  | { kind: 'resolved'; path: string; targetKind: BundleEntry['kind']; query: string; fragment: string };

const unsafeCharacters = /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069\\]/;
const loneSurrogate = /[\ud800-\udfff]/u;
const drivePath = /^[A-Za-z]:/;
function validSource(path: string): boolean {
  return path.length > 0 && !unsafeCharacters.test(path) && !loneSurrogate.test(path) && path.split('/').every(part => part !== '' && part !== '.' && part !== '..' && !drivePath.test(part));
}

/** Resolve against an inert inventory snapshot, never the host filesystem or network. */
export function createLinkResolver(entries: readonly BundleEntry[]): (sourcePath: string, url: string) => LinkResolution {
  const targets = new Map<string, BundleEntry['kind']>();
  for (const entry of entries) if (!targets.has(entry.path)) targets.set(entry.path, entry.kind);
  const resolve = (sourcePath: string, url: string): LinkResolution => {
    if (unsafeCharacters.test(url) || /^\s/.test(url)) return { kind: 'unsafe', reason: 'unsafe-characters' };
    // A drive prefix is ambiguous even though it superficially resembles a URI scheme.
    if (drivePath.test(url)) return { kind: 'unsafe', reason: 'drive-path' };
    if (url.startsWith('//') || /^[A-Za-z][A-Za-z\d+.-]*:/.test(url)) return { kind: 'external' };
    if (!validSource(sourcePath)) return { kind: 'unsafe', reason: 'invalid-source' };
    const hash = url.indexOf('#');
    const fragment = hash < 0 ? '' : url.slice(hash + 1);
    const beforeFragment = hash < 0 ? url : url.slice(0, hash);
    const question = beforeFragment.indexOf('?');
    const query = question < 0 ? '' : beforeFragment.slice(question + 1);
    const href = question < 0 ? beforeFragment : beforeFragment.slice(0, question);
    let path = sourcePath;
    let directory = false;
    if (href !== '') {
      const stack = href.startsWith('/') ? [] : sourcePath.split('/').slice(0, -1);
      const segments = href.split('/');
      for (let index = 0; index < segments.length; index++) {
        let part: string;
        if (loneSurrogate.test(segments[index]!)) return { kind: 'unsafe', reason: 'malformed-encoding' };
        try { part = decodeURIComponent(segments[index]!); }
        catch { return { kind: 'unsafe', reason: 'malformed-encoding' }; }
        if (/[/\\]/.test(part)) return { kind: 'unsafe', reason: 'encoded-separator' };
        if (unsafeCharacters.test(part)) return { kind: 'unsafe', reason: 'unsafe-characters' };
        if (drivePath.test(part)) return { kind: 'unsafe', reason: 'drive-path' };
        if (index === segments.length - 1) directory = part === '' || part === '.' || part === '..';
        if (part === '' || part === '.') continue;
        if (part === '..') {
          if (stack.length === 0) return { kind: 'unsafe', reason: 'outside-bundle' };
          stack.pop();
        } else stack.push(part);
      }
      path = stack.join('/');
    }
    // The bundle root exists implicitly. A directory remains a directory, not its optional index.
    const targetKind = path === '' ? 'directory' : targets.get(path);
    if (targetKind === undefined || (directory && targetKind !== 'directory')) return { kind: 'missing', path, query, fragment };
    return { kind: 'resolved', path, targetKind, query, fragment };
  };
  return resolve;
}

/** Convenience entry point; batch callers can reuse createLinkResolver's lookup. */
export function resolveLink(sourcePath: string, url: string, entries: readonly BundleEntry[]): LinkResolution {
  return createLinkResolver(entries)(sourcePath, url);
}
