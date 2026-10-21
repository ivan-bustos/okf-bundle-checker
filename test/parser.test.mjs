import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument, PARSER_LIMITS } from '../dist/parser.js';
const parse = (text, path = 'concept.md') => parseDocument(path, new TextEncoder().encode(text));

test('minimal concept preserves type and inert extension metadata', () => {
  const doc = parse('---\ntype: Custom\nextra: {nested: [one, two]}\n---\n# Heading\n');
  assert.equal(doc.frontmatter.state, 'mapping');
  assert.equal(doc.frontmatter.data.type, 'Custom');
  assert.deepEqual([...doc.frontmatter.data.extra.nested], ['one', 'two']);
  assert.equal(doc.bodyStartLine, 5);
  assert.equal(doc.ast.children[0].position.start.line, 5);
  assert.equal(doc.frontmatter.positions.type.line, 2);
  assert.deepEqual(doc.diagnostics, []);
});

test('UTF-8 decoding rejects malformed bytes, while initial BOM is tolerated', () => {
  assert.equal(parseDocument('a.md', new Uint8Array([0xff])).diagnostics[0].code, 'encoding');
  assert.equal(parse('\ufeff---\ntype: Thing\n---\n').frontmatter.state, 'mapping');
  assert.equal(parse('---\ntype: Café\n---\n').frontmatter.data.type, 'Café');
});

test('reserved names classify exactly at every directory depth', () => {
  assert.equal(parse('# Index', 'a/index.md').kind, 'index');
  assert.equal(parse('# Log', 'log.md').kind, 'log');
  assert.equal(parse('# Other', 'Index.md').kind, 'concept');
});

test('missing, unterminated and non-mapping frontmatter are distinct', () => {
  assert.equal(parse('# Heading').frontmatter.state, 'missing');
  assert.equal(parse('---\ntype: Thing').diagnostics[0].code, 'frontmatter-unterminated');
  for (const content of ['', '[]', '[one, two]', 'a string', 'null']) {
    assert.equal(parse(`---\n${content}\n---\n`).diagnostics[0].code, 'yaml-non-mapping');
  }
  assert.equal(parse('---\n{}\n---').frontmatter.state, 'mapping');
});

test('duplicate keys and malformed YAML have stable value-free diagnostics', () => {
  const duplicate = parse('---\ntype: SecretValue\ntype: OtherSecret\n---\n');
  assert.equal(duplicate.frontmatter.state, 'invalid');
  assert.equal(duplicate.diagnostics[0].code, 'yaml-invalid');
  assert.equal(duplicate.diagnostics[0].line, 3);
  assert.doesNotMatch(JSON.stringify(duplicate.diagnostics), /SecretValue|OtherSecret/);
  assert.equal(parse('---\ntype: [\n---\n').diagnostics[0].code, 'yaml-invalid');
});

test('aliases, custom constructors and nested non-string keys are not expanded', () => {
  assert.equal(parse('---\ntype: &x Thing\na: *x\n---').diagnostics[0].code, 'yaml-alias');
  assert.ok(parse('---\ntype: !execute arbitrary\n---').diagnostics.some(d => d.code === 'yaml-tag'));
  assert.equal(parse('---\ntype: Thing\na: {1: bad}\n---').frontmatter.state, 'invalid');
});

test('mapping keys cannot mutate prototypes', () => {
  const doc = parse('---\ntype: Thing\n__proto__: {polluted: true}\nconstructor: safe\n---');
  assert.equal(Object.getPrototypeOf(doc.frontmatter.data), null);
  assert.equal(doc.frontmatter.data.__proto__.polluted, true);
  assert.equal({}.polluted, undefined);
});

test('document, frontmatter and depth budgets return deterministic diagnostics', () => {
  assert.equal(parse('a'.repeat(PARSER_LIMITS.documentBytes + 1)).diagnostics[0].code, 'limit');
  assert.equal(parse(`---\ntype: Thing\nx: ${'x'.repeat(PARSER_LIMITS.frontmatterBytes)}\n---`).diagnostics[0].code, 'frontmatter-limit');
  assert.equal(parse(`---\ntype: Thing\nx: ${'['.repeat(40)}0${']'.repeat(40)}\n---`).diagnostics[0].code, 'yaml-depth');
});

test('Markdown AST extracts inline/reference/image links but ignores code and HTML', () => {
  const doc = parse('---\ntype: Thing\n---\n[inline](/a.md) and ![asset](img.png)\n[ref][R]\n\n[R]: ../target.md "title"\n\n`[fake](no.md)`\n\n```md\n[fake](no.md)\n```\n\n<a href="evil.md">text</a>\n');
  assert.deepEqual(doc.links.map(x => x.url), ['/a.md', 'img.png', '../target.md']);
  assert.equal(doc.links[0].line, 4);
  assert.equal(doc.links[2].line, 5);
  assert.ok(doc.ast.children.some(n => n.type === 'code'));
});

test('first definition wins; shortcut/collapsed references work', () => {
  const doc = parse('[sample] [sample][]\n\n[sample]: first.md\n[sample]: second.md\n');
  assert.deepEqual(doc.links.map(x => x.url), ['first.md', 'first.md']);
});

test('CRLF body positions and offsets refer to original decoded document', () => {
  const text = '---\r\ntype: Thing\r\n---\r\n[link](a.md)\r\n';
  const doc = parse(text);
  assert.equal(doc.body, '[link](a.md)\r\n');
  assert.equal(doc.links[0].line, 4);
  assert.equal(doc.ast.children[0].position.start.offset, text.indexOf('[link]'));
});

test('invalid YAML still permits independent inert body parsing', () => {
  const doc = parse('---\ntype: [\n---\n[link](safe.md)');
  assert.equal(doc.frontmatter.state, 'invalid');
  assert.equal(doc.links[0].url, 'safe.md');
  assert.equal(doc.links[0].line, 4);
});

 test('YAML library resource exhaustion is operational, not malformed content', () => {
  const doc = parse('---\ntype: Thing\na: ' + '['.repeat(1000) + '0' + ']'.repeat(1000) + '\n---\n');
  assert.ok(doc.diagnostics.some(x => x.code === 'yaml-depth'));
  assert.ok(!doc.diagnostics.some(x => x.code === 'yaml-invalid'));
});
