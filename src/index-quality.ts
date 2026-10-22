import type { Root, RootContent } from 'mdast';
import { comparePaths, type BundleScope } from './discovery.js';
import type { ParsedDocument, SourcePosition } from './parser.js';
import type { QualityFinding, QualityRuleId, Severity } from './policy.js';
import { createLinkResolver, type LinkResolution, type UnsafeLinkReason } from './resolver.js';

type AstNode = Root | RootContent;
const parentDirectory = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/')));
const indexPath = (directory: string): string => directory ? `${directory}/index.md` : 'index.md';
const isConcept = (path: string): boolean => path.endsWith('.md') && !['index.md', 'log.md'].includes(path.split('/').at(-1)!);
const unsafeMessages: Record<UnsafeLinkReason, string> = {
  'invalid-source': 'Link source is not a normalized bundle-relative path.',
  'unsafe-characters': 'Local link contains unsupported or unsafe characters.',
  'drive-path': 'Local link has an ambiguous drive-style path.',
  'malformed-encoding': 'Local link contains malformed percent encoding.',
  'encoded-separator': 'Local link contains an encoded path separator.',
  'outside-bundle': 'Local link escapes the bundle root.',
};

function children(node: AstNode): RootContent[] { return 'children' in node ? node.children as RootContent[] : []; }
function position(node: AstNode, document: ParsedDocument): SourcePosition {
  return { line: node.position?.start.line ?? document.bodyStartLine, column: node.position?.start.column ?? 1 };
}

const voidHtmlElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const rawTextHtmlElements = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext']);
interface HtmlSpanState { open: string[]; positions: Map<string, number[]> }
const asciiLetter = (code: number): boolean => (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
const tagNameCharacter = (code: number): boolean => asciiLetter(code) || (code >= 48 && code <= 57) || code === 45 || code === 58;
const tagDelimiter = (code: number): boolean => code === 32 || code === 9 || code === 10 || code === 12 || code === 13 || code === 47 || code === 62;

/** Consume a candidate's tail once; an unquoted < starts a new candidate. */
function htmlTagEnd(value: string, start: number): { next: number; closed: boolean } {
  let quote = 0;
  for (let cursor = start; cursor < value.length; cursor++) {
    const code = value.charCodeAt(cursor);
    if (quote !== 0) { if (code === quote) quote = 0; }
    else if (code === 34 || code === 39) quote = code;
    else if (code === 62) return { next: cursor + 1, closed: true };
    else if (code === 60) return { next: cursor, closed: false };
  }
  return { next: value.length, closed: false };
}

function closeHtmlSpan(state: HtmlSpanState, name: string): void {
  const start = state.positions.get(name)?.at(-1);
  if (start === undefined) return;
  // Each opening tag is removed once. Unknown closes require no depth scan.
  while (state.open.length > start) {
    const closed = state.open.pop()!;
    const positions = state.positions.get(closed)!;
    positions.pop();
    if (positions.length === 0) state.positions.delete(closed);
  }
}

/** Track inert HTML spans across adjacent Markdown AST nodes without rendering HTML. */
function updateHtmlSpans(value: string, state: HtmlSpanState): void {
  let cursor = 0;
  while (cursor < value.length) {
    const start = value.indexOf('<', cursor);
    if (start === -1) return;
    cursor = start + 1;
    const current = state.open.at(-1);
    if (current && rawTextHtmlElements.has(current)) {
      // Raw-text bodies only recognize their matching close. In particular,
      // repeated unfinished <script prefixes must never rescan the whole tail.
      const end = start + 2 + current.length;
      if (value.charCodeAt(start + 1) !== 47 || value.slice(start + 2, end).toLowerCase() !== current || !tagDelimiter(value.charCodeAt(end))) continue;
      const token = htmlTagEnd(value, end);
      cursor = token.next;
      if (token.closed) closeHtmlSpan(state, current);
      continue;
    }
    // Consume comments/declarations as opaque data, including apparent tags.
    let terminator: string | undefined;
    let contentStart = cursor;
    if (value.startsWith('<!--', start)) { terminator = '-->'; contentStart = start + 4; }
    else if (value.startsWith('<![CDATA[', start)) { terminator = ']]>'; contentStart = start + 9; }
    else if (value.startsWith('<?', start)) { terminator = '?>'; contentStart = start + 2; }
    else if (value.startsWith('<!', start)) { terminator = '>'; contentStart = start + 2; }
    if (terminator) {
      const end = value.indexOf(terminator, contentStart);
      cursor = end === -1 ? value.length : end + terminator.length;
      continue;
    }
    const closing = value.charCodeAt(cursor) === 47;
    if (closing) cursor++;
    const nameStart = cursor;
    if (!asciiLetter(value.charCodeAt(nameStart))) continue;
    while (tagNameCharacter(value.charCodeAt(cursor))) cursor++;
    if (!tagDelimiter(value.charCodeAt(cursor))) continue;
    const name = value.slice(nameStart, cursor).toLowerCase();
    const token = htmlTagEnd(value, cursor);
    cursor = token.next;
    if (!token.closed) continue;
    if (closing) closeHtmlSpan(state, name);
    else if (!voidHtmlElements.has(name)) {
      // A trailing slash does not self-close a non-void HTML element.
      if (!state.positions.has(name)) state.positions.set(name, []);
      state.positions.get(name)!.push(state.open.length);
      state.open.push(name);
    }
  }
}

/** Labels, HTML, images and nested entries are not descriptions of the enclosing entry. */
function hasDescription(entry: AstNode): boolean {
  const stack: AstNode[] = [entry];
  const htmlSpans: HtmlSpanState = { open: [], positions: new Map() };
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type === 'html') { updateHtmlSpans(node.value, htmlSpans); continue; }
    if (['link', 'linkReference', 'image', 'imageReference', 'code', 'definition'].includes(node.type) || (node !== entry && ['list', 'table'].includes(node.type))) continue;
    if (htmlSpans.open.length === 0 && (node.type === 'text' || node.type === 'inlineCode') && /[\p{L}\p{N}\p{So}]/u.test(node.value)) return true;
    // HTML state must be consumed in source order, not reverse tree order.
    stack.push(...children(node).slice().reverse());
  }
  return false;
}

interface IndexEntry { url: string; described: boolean; position: SourcePosition }
function indexEntries(document: ParsedDocument): IndexEntry[] {
  const definitions = new Map<string, string>();
  const stack: AstNode[] = [document.ast];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type === 'definition' && !definitions.has(node.identifier)) definitions.set(node.identifier, node.url);
    stack.push(...children(node).slice().reverse());
  }
  const entries: IndexEntry[] = [];
  const descriptions = new Map<AstNode, boolean>();
  const pending: { node: AstNode; entry?: AstNode }[] = [{ node: document.ast }];
  while (pending.length > 0) {
    const current = pending.pop()!;
    const node = current.node;
    let entry = current.entry;
    if (node.type === 'listItem' || node.type === 'tableRow' || (node.type === 'paragraph' && !entry)) entry = node;
    if ((node.type === 'link' || node.type === 'linkReference') && entry) {
      const url = node.type === 'link' ? node.url : definitions.get(node.identifier);
      if (url !== undefined) {
        if (!descriptions.has(entry)) descriptions.set(entry, hasDescription(entry));
        entries.push({ url, described: descriptions.get(entry)!, position: position(node, document) });
      }
    }
    for (const child of children(node).slice().reverse()) pending.push({ node: child, ...(entry ? { entry } : {}) });
  }
  return entries;
}

function targetKey(resolution: LinkResolution, url: string): string {
  return resolution.kind === 'resolved' || resolution.kind === 'missing' ? `local:${resolution.path}` : `${resolution.kind}:${url}`;
}

/** Independent Q001–Q005 policies over the already-discovered selected scope. */
export function checkIndexQuality(documents: ParsedDocument[], scope: BundleScope, rules: Record<QualityRuleId, Severity>, indexScope: 'all' | 'root'): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const seen = new Set<string>();
  const emit = (ruleId: QualityRuleId, path: string, identity: string, message: string, remediation: string, at?: SourcePosition, source?: QualityFinding['source']): void => {
    const severity = rules[ruleId];
    const key = JSON.stringify([ruleId, path, identity]);
    if (severity === 'off' || seen.has(key)) return;
    seen.add(key);
    findings.push({ ruleId, layer: 'quality', severity, path, message, remediation, ...(at ? { position: at } : {}), ...(source ? { source } : {}) });
  };
  const entries = new Map(scope.entries.map(entry => [entry.path, entry]));
  const selectedDocuments = new Map<string, ParsedDocument>();
  for (const document of documents) if (entries.get(document.path)?.kind === 'markdown' && !selectedDocuments.has(document.path)) selectedDocuments.set(document.path, document);
  const sortedDocuments = [...selectedDocuments.values()].sort((a, b) => comparePaths(a.path, b.path));
  const resolve = createLinkResolver(scope.entries);
  const directories = new Set<string>();
  const expected = new Map<string, Set<string>>();
  const addExpected = (directory: string, target: string): void => {
    if (!expected.has(directory)) expected.set(directory, new Set());
    expected.get(directory)!.add(target);
  };
  for (const entry of entries.values()) {
    if (entry.kind !== 'markdown' || !isConcept(entry.path)) continue;
    let directory = parentDirectory(entry.path);
    addExpected(directory, entry.path);
    while (true) {
      directories.add(directory);
      if (directory === '') break;
      const parent = parentDirectory(directory);
      addExpected(parent, directory);
      directory = parent;
    }
  }

  for (const document of sortedDocuments) {
    if (document.kind === 'concept' && document.frontmatter.state !== 'invalid' && document.diagnostics.length === 0) {
      const description = document.frontmatter.data?.description;
      if (typeof description !== 'string' || description.trim() === '') emit('Q001', document.path, 'description', 'Concept description is missing, blank or not a string (§4.1).', 'Add a non-empty description string; no factual or wording comparison is performed.', document.frontmatter.positions.description ?? { line: 1, column: 1 });
    }
    if (rules.Q002 !== 'off') for (const link of document.links) {
      const result = resolve(document.path, link.url);
      if (result.kind === 'missing') emit('Q002', result.path, document.path, `Local link target ${JSON.stringify(result.path)} is missing from the selected scope (§6).`, 'Correct the case-sensitive path or include the intended file, asset or directory in scope.', undefined, { path: document.path, position: { line: link.line, column: link.column } });
      else if (result.kind === 'unsafe') emit('Q002', document.path, targetKey(result, link.url), `${unsafeMessages[result.reason]} The target was not followed (§6).`, 'Use a contained POSIX bundle path with valid single-pass percent encoding and no drive prefix.', { line: link.line, column: link.column });
    }
  }
  for (const directory of [...directories].sort(comparePaths)) {
    if (indexScope === 'root' && directory !== '') continue;
    const path = indexPath(directory);
    if (entries.get(path)?.kind !== 'markdown') emit('Q003', path, 'index', 'Concept-containing directory has no optional index.md (§8).', 'Add a directory index, change index scope, or disable this advisory policy.');
  }
  for (const document of sortedDocuments) {
    if (document.kind !== 'index' || (indexScope === 'root' && document.path !== 'index.md')) continue;
    const covered = new Set<string>();
    for (const link of document.links) {
      if (link.kind !== 'link') continue;
      const result = resolve(document.path, link.url);
      if (result.kind === 'resolved') {
        covered.add(result.path);
        // An explicit existing child index is also useful directory navigation (§8).
        // This coverage policy does not change the resolver's distinct target identities.
        if (result.targetKind === 'markdown' && result.path.split('/').at(-1) === 'index.md') covered.add(parentDirectory(result.path));
      }
    }
    for (const target of [...(expected.get(parentDirectory(document.path)) ?? [])].sort(comparePaths)) {
      if (!covered.has(target)) emit('Q004', document.path, target, `Index does not link to ${JSON.stringify(target)} (§8).`, 'Add a Markdown link to the immediate concept or child concept directory; a directory needs no child index.');
    }
    if (rules.Q005 !== 'off') {
      const descriptions = new Map<string, { described: boolean; position: SourcePosition }>();
      for (const entry of indexEntries(document)) {
        const key = targetKey(resolve(document.path, entry.url), entry.url);
        const existing = descriptions.get(key);
        if (existing) existing.described ||= entry.described;
        else descriptions.set(key, { described: entry.described, position: entry.position });
      }
      for (const [key, entry] of descriptions) if (!entry.described) emit('Q005', document.path, key, 'Index entry has no descriptive text beyond its link label (§8).', 'Add a short description in the same list item, paragraph or table row; exact target-description wording is not required.', entry.position);
    }
  }
  return findings.sort((a, b) => comparePaths(a.path, b.path) || (a.position?.line ?? 0) - (b.position?.line ?? 0) || (a.position?.column ?? 0) - (b.position?.column ?? 0) || comparePaths(a.ruleId, b.ruleId) || comparePaths(a.message, b.message));
}
