import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { isAlias, isMap, isNode, isPair, isScalar, isSeq, LineCounter, parseDocument as parseYaml } from 'yaml';
import type { Root, RootContent, Definition } from 'mdast';

export const PARSER_LIMITS = Object.freeze({ documentBytes: 1024 * 1024, frontmatterBytes: 256 * 1024, yamlDepth: 32, nodes: 100_000 });
export interface SourcePosition { line: number; column: number }
export interface ParseDiagnostic extends SourcePosition { code: string; message: string }
export interface ParsedLink extends SourcePosition { url: string; kind: 'link' | 'image'; reference?: string }
export interface ParsedDocument {
  path: string;
  kind: 'concept' | 'index' | 'log';
  text: string;
  body: string;
  bodyStartLine: number;
  frontmatter: { state: 'missing' | 'mapping' | 'invalid'; data?: Record<string, unknown>; positions: Record<string, SourcePosition> };
  ast: Root;
  links: ParsedLink[];
  diagnostics: ParseDiagnostic[];
}

const markdown = unified().use(remarkParse).use(remarkGfm);
const coreTags = new Set(['tag:yaml.org,2002:str', 'tag:yaml.org,2002:map', 'tag:yaml.org,2002:seq', 'tag:yaml.org,2002:null', 'tag:yaml.org,2002:bool', 'tag:yaml.org,2002:int', 'tag:yaml.org,2002:float']);
const diagnosticMessages: Record<string, string> = {
  encoding: 'Document is not valid UTF-8.',
  limit: 'Document exceeds the parser byte limit.',
  'frontmatter-limit': 'Frontmatter exceeds the parser byte limit.',
  'frontmatter-unterminated': 'Frontmatter is missing a closing delimiter.',
  'yaml-invalid': 'Frontmatter contains invalid YAML.',
  'yaml-non-mapping': 'Frontmatter must be a mapping.',
  'yaml-key-profile': 'Non-string YAML mapping keys are unsupported by this parser.',
  'yaml-alias': 'YAML aliases are unsupported by this bounded parser.',
  'yaml-tag': 'Custom YAML tags are unsupported.',
  'yaml-depth': 'YAML exceeds the nesting or node limit.',
  'markdown-limit': 'Markdown exceeds parser resource limits.',
};

/** Parse inert data only. No network, disk reads, HTML rendering, or code execution. */
export function parseDocument(path: string, bytes: Uint8Array): ParsedDocument {
  const basename = path.split('/').at(-1);
  const result: ParsedDocument = {
    path, kind: basename === 'index.md' ? 'index' : basename === 'log.md' ? 'log' : 'concept',
    text: '', body: '', bodyStartLine: 1,
    frontmatter: { state: 'missing', positions: Object.create(null) as Record<string, SourcePosition> },
    ast: { type: 'root', children: [] }, links: [], diagnostics: [],
  };
  const issue = (code: string, position: SourcePosition = { line: 1, column: 1 }): void => {
    result.diagnostics.push({ code, message: diagnosticMessages[code] ?? 'Document cannot be parsed safely.', ...position });
  };
  if (bytes.byteLength > PARSER_LIMITS.documentBytes) { issue('limit'); return result; }
  try { result.text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { issue('encoding'); return result; }
  // TextDecoder tolerates and strips exactly one leading UTF-8 BOM. It is not part of the YAML delimiter.
  result.body = result.text;
  const lines = result.text.split(/\r?\n/);
  if (lines[0] === '---') {
    const end = lines.findIndex((line, index) => index > 0 && line === '---');
    result.frontmatter.state = 'invalid';
    if (end === -1) { issue('frontmatter-unterminated'); return result; }
    // Preserve original source offsets and line endings by finding the actual consumed prefix.
    let prefixEnd = 0;
    for (let i = 0; i <= end; i += 1) {
      const newline = result.text.indexOf('\n', prefixEnd);
      prefixEnd = newline === -1 ? result.text.length : newline + 1;
    }
    const yamlText = lines.slice(1, end).join('\n');
    result.body = result.text.slice(prefixEnd);
    result.bodyStartLine = end + 2;
    if (new TextEncoder().encode(yamlText).byteLength > PARSER_LIMITS.frontmatterBytes) issue('frontmatter-limit', { line: 2, column: 1 });
    else {
      const counter = new LineCounter();
      try {
        const yaml = parseYaml(yamlText, { lineCounter: counter, uniqueKeys: true, stringKeys: false, schema: 'core', version: '1.2', strict: true, prettyErrors: false });
        const yamlPosition = (offset: number): SourcePosition => {
          const loc = counter.linePos(offset); return { line: loc.line + 1, column: loc.col };
        };
        if (yaml.errors.length > 0) {
          for (const error of yaml.errors) issue(error.code === 'RESOURCE_EXHAUSTION' ? 'yaml-depth' : 'yaml-invalid', yamlPosition(error.pos[0]));
        } else if (yaml.warnings.length > 0) {
          issue('yaml-tag', yamlPosition(yaml.warnings[0]?.pos[0] ?? 0));
        } else if (!isMap(yaml.contents)) issue('yaml-non-mapping', { line: 2, column: 1 });
        else {
          let count = 0;
          const inspect = (value: unknown, depth: number): string | undefined => {
            count += 1;
            if (count > PARSER_LIMITS.nodes || depth > PARSER_LIMITS.yamlDepth) return 'yaml-depth';
            if (isAlias(value)) return 'yaml-alias';
            if (isNode(value) && value.tag !== undefined && !coreTags.has(value.tag)) return 'yaml-tag';
            if (isPair(value)) {
              if (!isScalar(value.key) || typeof value.key.value !== 'string') return 'yaml-key-profile';
              return inspect(value.key, depth + 1) ?? inspect(value.value, depth + 1);
            }
            if (isMap(value) || isSeq(value)) {
              for (const item of value.items) { const failure = inspect(item, depth + 1); if (failure) return failure; }
            }
            return undefined;
          };
          const failure = inspect(yaml.contents, 0);
          if (failure) issue(failure, { line: 2, column: 1 });
          else {
            const converted = yaml.toJS({ mapAsMap: true, maxAliasCount: 0 }) as Map<unknown, unknown>;
            const plain = (value: unknown): unknown => {
              if (value instanceof Map) {
                const object = Object.create(null) as Record<string, unknown>;
                for (const [key, item] of value) object[String(key)] = plain(item);
                return object;
              }
              return Array.isArray(value) ? value.map(plain) : value;
            };
            result.frontmatter.data = plain(converted) as Record<string, unknown>;
            result.frontmatter.state = 'mapping';
            for (const pair of yaml.contents.items) {
              if (isScalar(pair.key) && typeof pair.key.value === 'string') {
                result.frontmatter.positions[pair.key.value] = yamlPosition(pair.key.range?.[0] ?? 0);
              }
            }
          }
        }
      } catch { issue('yaml-depth', { line: 2, column: 1 }); }
    }
  }
  try {
    result.ast = markdown.parse(result.body);
    const prefixBytes = result.text.length - result.body.length;
    const stack: Array<Root | RootContent> = [result.ast];
    const nodes: Array<Root | RootContent> = [];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) break;
      nodes.push(node);
      if (nodes.length > PARSER_LIMITS.nodes) throw new Error('limit');
      if (node.position) {
        for (const point of [node.position.start, node.position.end]) {
          point.line += result.bodyStartLine - 1;
          if (point.offset !== undefined) point.offset += prefixBytes;
        }
      }
      if ('children' in node) stack.push(...node.children as RootContent[]);
    }
    const definitions = new Map<string, Definition>();
    for (const node of [...nodes].reverse()) {
      if (node.type === 'definition' && !definitions.has(node.identifier)) definitions.set(node.identifier, node);
    }
    for (const node of [...nodes].reverse()) {
      if (node.type === 'link' || node.type === 'image') {
        result.links.push({ url: node.url, kind: node.type, line: node.position?.start.line ?? result.bodyStartLine, column: node.position?.start.column ?? 1 });
      } else if (node.type === 'linkReference' || node.type === 'imageReference') {
        const definition = definitions.get(node.identifier);
        if (definition) result.links.push({ url: definition.url, kind: node.type === 'linkReference' ? 'link' : 'image', reference: node.identifier, line: node.position?.start.line ?? result.bodyStartLine, column: node.position?.start.column ?? 1 });
      }
    }
    result.links.sort((a, b) => a.line - b.line || a.column - b.column);
  } catch {
    result.ast = { type: 'root', children: [] }; result.links = []; issue('markdown-limit', { line: result.bodyStartLine, column: 1 });
  }
  return result;
}
