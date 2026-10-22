import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parseDocument } from '../dist/parser.js';
import { discoverBundle } from '../dist/discovery.js';
import { checkIndexQuality } from '../dist/index-quality.js';

const ids = ['Q001', 'Q002', 'Q003', 'Q004', 'Q005', 'Q006', 'Q007', 'Q008', 'Q009'];
const rules = (enabled = {}) => Object.fromEntries(ids.map(id => [id, enabled[id] ?? 'off']));
const concept = (body = '', description = 'A useful concept.') => `---\ntype: Custom\n${description === null ? '' : `description: ${JSON.stringify(description)}\n`}---\n${body}`;
function fixture(files, extra = []) {
  const entries = new Map();
  const documents = [];
  for (const [path, text] of Object.entries(files)) {
    const bytes = new TextEncoder().encode(text);
    entries.set(path, { path, kind: path.endsWith('.md') ? 'markdown' : 'asset', bytes: bytes.length });
    const parts = path.split('/');
    for (let depth = 1; depth < parts.length; depth++) {
      const directory = parts.slice(0, depth).join('/');
      entries.set(directory, { path: directory, kind: 'directory', bytes: 0 });
    }
    if (path.endsWith('.md')) documents.push(parseDocument(path, bytes));
  }
  const scope = { entries: [...entries.values(), ...extra], documents: [], exclusions: [], excludedEntries: 0, totalBytes: 0, conceptCount: documents.filter(document => document.kind === 'concept').length };
  return { documents, scope };
}
function check(files, enabled, indexScope = 'all', extra = []) {
  const { documents, scope } = fixture(files, extra);
  return checkIndexQuality(documents, scope, rules(enabled), indexScope);
}

test('Q001 checks string presence rather than content truth, titles or reserved documents', () => {
  const files = { 'a.md': concept('', null), 'b.md': concept('', ''), 'c.md': concept('', ' \t '), 'd.md': '---\ntype: Custom\ndescription: 4\n---', 'e.md': '---\ntype: Custom\ndescription: [a]\n---', 'good.md': concept('', 'Not an independently verified claim.'), 'index.md': '# Index', 'sub/log.md': '## 2026-01-01', 'Index.md': concept('', null) };
  const result = check(files, { Q001: 'warning' });
  assert.deepEqual(result.map(item => item.path), ['Index.md', 'a.md', 'b.md', 'c.md', 'd.md', 'e.md']);
  assert.equal(result.find(item => item.path === 'd.md').position.line, 3);
  assert.equal(check({ 'a.md': 'no frontmatter' }, { Q001: 'warning' }).length, 1);
  assert.equal(check({ 'a.md': '---\ntype: [\n---' }, { Q001: 'warning' }).length, 0, 'invalid YAML cannot establish a missing description');
});

test('Q002 follows parsed inline/reference/image links, not code, HTML, frontmatter or external URLs', () => {
  const body = '[Root](/root.md#absent)\n[Asset](../asset.svg?x=1)\n[Dir](../loose/)\n[Self](#absent)\n[External](https://example.invalid/not-there)\n[Missing][TARGET]\n![Missing image](../missing.svg)\n[Escapes](../../private.md)\n\n[TARGET]: missing.md\n\n`[Fake](inline.md)`\n\n```md\n[Fake](code.md)\n```\n\n<a href="html.md">HTML</a>';
  const result = check({ 'root.md': concept(), 'nested/a.md': concept(body), 'loose/b.md': concept(), 'asset.svg': '<svg />' }, { Q002: 'warning' });
  assert.equal(result.length, 3);
  assert.ok(result.some(item => item.message.includes('nested/missing.md')));
  assert.ok(result.some(item => item.message.includes('missing.svg')));
  assert.ok(result.some(item => item.message.includes('escapes')));
  assert.ok(result.every(item => (item.source?.path ?? item.path) === 'nested/a.md' && (item.source?.position ?? item.position).line >= 10 && item.layer === 'quality'));
  assert.deepEqual(result.filter(item => item.source).map(item => item.path), ['missing.svg', 'nested/missing.md']);
  assert.ok(result.filter(item => item.source).every(item => item.position === undefined));
  assert.doesNotMatch(JSON.stringify(result), /inline\.md|code\.md|html\.md|private\.md/);
});

test('Q002 reports unsupported paths as quality and deduplicates equivalent missing targets', () => {
  const result = check({ 'a.md': concept('[One](missing.md)\n[Two](./missing.md#x)\n![Three](/missing.md?query)\n[Bad](bad%2Fname.md)\n[Bad again](bad%2Fname.md)\n[Drive](C:/outside.md)') }, { Q002: 'error' });
  assert.equal(result.length, 3);
  assert.ok(result.every(item => item.layer === 'quality' && item.severity === 'error'));
  assert.equal(result.find(item => item.path === 'missing.md').source.position.line, 5);
});

test('missing targets keep each distinct origin while duplicate links from one origin collapse', () => {
  const result = check({ 'a.md': concept('[Missing](/missing.md)\n[Again](./missing.md#fragment)'), 'nested/b.md': concept('[Missing](../missing.md?view)') }, { Q002: 'warning' });
  assert.equal(result.length, 2);
  assert.ok(result.every(item => item.path === 'missing.md' && item.position === undefined));
  assert.deepEqual(result.map(item => item.source), [{ path: 'a.md', position: { line: 5, column: 1 } }, { path: 'nested/b.md', position: { line: 5, column: 1 } }]);
});

test('Q003 includes root and concept-directory ancestors, not asset-only or empty directories', () => {
  const result = check({ 'a/b/c.md': concept(), 'images/photo.png': 'image', 'log.md': '## 2026-01-01' }, { Q003: 'warning' }, 'all', [{ path: 'empty', kind: 'directory', bytes: 0 }]);
  assert.deepEqual(result.map(item => item.path), ['a/b/index.md', 'a/index.md', 'index.md']);
  assert.deepEqual(check({}, { Q003: 'warning', Q004: 'warning', Q005: 'warning' }, 'all', [{ path: 'empty', kind: 'directory', bytes: 0 }]), []);
  assert.deepEqual(check({ 'asset.txt': 'data', 'log.md': '## 2026-01-01' }, { Q003: 'warning' }), []);
});

test('root-only scope selects Q003–Q005 indexes without disabling nested Q001/Q002', () => {
  const files = { 'root.md': concept(), 'index.md': '- [Root](root.md) - Good.\n- [Nested](nested/) - A group.', 'nested/a.md': concept('[Missing](missing.md)', null), 'nested/index.md': '- [A](a.md)', 'nested/deep/b.md': concept() };
  assert.deepEqual(check(files, { Q003: 'warning', Q004: 'warning', Q005: 'warning' }, 'root'), []);
  const all = check(files, { Q003: 'warning', Q004: 'warning', Q005: 'warning' });
  assert.deepEqual(all.map(item => item.ruleId), ['Q003', 'Q004', 'Q005']);
  assert.equal(check(files, { Q001: 'warning', Q002: 'warning' }, 'root').length, 2);
});

test('Q004 covers direct concepts and child concept directories without requiring their indexes', () => {
  const files = { 'index.md': '- [A](a.md) - First.\n- [Loose](loose/) - No index needed.\n- [Deep](deep/) - Descendants.\n- [Again](./a.md#part) - Duplicate.', 'a.md': concept(), 'loose/b.md': concept(), 'deep/child/c.md': concept(), 'assets/file.txt': 'data' };
  assert.deepEqual(check(files, { Q004: 'warning' }), []);
  files['b.md'] = concept();
  const result = check(files, { Q004: 'warning' });
  assert.equal(result.length, 1);
  assert.match(result[0].message, /"b\.md"/);
  assert.equal(result[0].path, 'index.md');
});

test('Q004 accepts existing child indexes as directory navigation but not images or code examples', () => {
  const result = check({ 'index.md': '- [Child index](child/index.md) - Explicit index.\n![A](a.md)\n\n`[B](b.md)`\n\n```md\n[C](c.md)\n```', 'a.md': concept(), 'b.md': concept(), 'c.md': concept(), 'child/a.md': concept(), 'child/index.md': '- [A](a.md) - Covered.' }, { Q004: 'warning' });
  assert.equal(result.length, 3);
  assert.ok(result.every(item => item.path === 'index.md'));
  assert.ok(result.every(item => !item.message.includes('"child"')));
});

test('Q004 accepts reference-style links, preserves case, and does not duplicate absent-index findings', () => {
  const result = check({ 'index.md': '- [A][ref] - First.\n- [Wrong case](B.md) - Second.\n\n[ref]: /a.md', 'a.md': concept(), 'b.md': concept(), 'loose/c.md': concept() }, { Q003: 'warning', Q004: 'warning' });
  assert.equal(result.filter(item => item.ruleId === 'Q003').length, 1);
  assert.equal(result.filter(item => item.ruleId === 'Q004').length, 2);
  assert.ok(result.filter(item => item.ruleId === 'Q004').every(item => item.path === 'index.md'));
});

test('Q005 accepts descriptive AST text without comparing the target description verbatim', () => {
  const files = { 'index.md': '- [A](a.md) - A different **useful summary**.\n- [B][target] : `a useful code term`\n- [C](c.md) - 🚀\n\n| Item | Description |\n| --- | --- |\n| [D](d.md) | Another explanation. |\n\n[target]: b.md', 'a.md': concept('', 'Original wording.'), 'b.md': concept(), 'c.md': concept(), 'd.md': concept() };
  assert.deepEqual(check(files, { Q005: 'warning' }), []);
});

test('Q005 rejects bare labels, separator-only text, raw HTML and description borrowed from nested entries', () => {
  const index = '- [A](a.md)\n  - [B](b.md) - A child description.\n- **[C](c.md)** - : —\n- [D](d.md) <!-- comment not prose -->\n- [E](e.md) <script>fake</script>\n\n[Paragraph](f.md)\n\n```md\n[Example](not-an-entry.md)\n```';
  const files = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].map(name => [`${name}.md`, concept()]));
  const result = check({ ...files, 'index.md': index }, { Q005: 'warning' });
  assert.equal(result.length, 5);
  assert.deepEqual(result.map(item => item.position.line), [1, 3, 4, 5, 7]);
});

test('Q005 excludes raw HTML span bodies, while recognizing actual prose outside them', () => {
  const hidden = [
    '<script>fake</script>', '<style>fake</style>', '<SCRIPT type="text/javascript">fake</SCRIPT>',
    '<span>fake</span>', '<span><b>fake</b></span>', '<span title="a > b">fake</span>',
    '<script>const template = "<span>";</script>', '<script/>fake', '<style>fake',
    '<img alt="not a description">', '<!-- <span>not a description</span> -->',
  ];
  for (const html of hidden) {
    const result = check({ 'a.md': concept(), 'index.md': `- [A](a.md) ${html}` }, { Q005: 'warning' });
    assert.equal(result.length, 1, html);
    assert.equal(result[0].ruleId, 'Q005');
  }
  for (const description of [
    '<script>fake</script> Real description.', '<style>fake</style> Real description.',
    '<span><b>fake</b></span> Real description.', '<span title="a > b">fake</span> Real description.',
    '<script>const template = "<span>";</script> Real description.',
    '<br> Real description.', '<img alt="ignored"> Real description.',
    '<!-- <span>ignored</span> --> Real description.', 'Real description. <script>fake</script>',
  ]) assert.deepEqual(check({ 'a.md': concept(), 'index.md': `- [A](a.md) ${description}` }, { Q005: 'warning' }), [], description);
});

test('Q005 scans hostile raw HTML within a hard subprocess budget', { timeout: 15000 }, () => {
  const script = `
    import assert from 'node:assert/strict';
    import { parseDocument } from ${JSON.stringify(new URL('../dist/parser.js', import.meta.url).href)};
    import { checkIndexQuality } from ${JSON.stringify(new URL('../dist/index-quality.js', import.meta.url).href)};
    const rules = Object.fromEntries(Array.from({ length: 9 }, (_, n) => ['Q00' + (n + 1), n === 4 ? 'warning' : 'off']));
    const scope = { entries: [{ path: 'index.md', kind: 'markdown', bytes: 0 }, { path: 'a.md', kind: 'markdown', bytes: 0 }], documents: [], exclusions: [], excludedEntries: 0, totalBytes: 0, conceptCount: 1 };
    const bodies = [
      '<script>\\n  ' + '<script '.repeat(100000),
      '<div>\\n  ' + '<span '.repeat(100000),
      '<div>\\n  ' + '<span>'.repeat(20000) + '</unknown>'.repeat(20000) + '</span>'.repeat(20000) + '\\n  </div>',
    ];
    for (const body of bodies) {
      const document = parseDocument('index.md', new TextEncoder().encode('- [A](a.md)\\n\\n  ' + body));
      assert.deepEqual(document.diagnostics, []);
      const findings = checkIndexQuality([document], scope, rules, 'all');
      assert.equal(findings.length, 1);
      assert.equal(findings[0].ruleId, 'Q005');
    }
  `;
  // A regressed synchronous regex cannot block the test runner indefinitely.
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 10000, maxBuffer: 16384 });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
});

test('duplicate targets produce one policy finding and one described presentation satisfies Q005', () => {
  let result = check({ 'a.md': concept(), 'index.md': '- [A](a.md)\n- [Again](./a.md#part)\n- [Again](/a.md?view)' }, { Q004: 'warning', Q005: 'warning' });
  assert.equal(result.length, 1);
  assert.equal(result[0].ruleId, 'Q005');
  result = check({ 'a.md': concept(), 'index.md': '- [A](a.md)\n- [Again](./a.md#part) - Description.' }, { Q004: 'warning', Q005: 'warning' });
  assert.deepEqual(result, []);
  const { documents, scope } = fixture({ 'a.md': concept('', null), 'index.md': '' });
  scope.entries.push(...scope.entries.map(entry => ({ ...entry })));
  assert.equal(checkIndexQuality([...documents, ...documents], scope, rules({ Q001: 'warning', Q004: 'warning' }), 'all').length, 2);
});

test('selected discovery exclusions remove concepts/directories from index obligations', async () => {
  const scope = await discoverBundle('tests/fixtures/shared/path-cases', { exclusions: ['nested/**', 'root.md'] });
  const documents = scope.documents.map(file => parseDocument(file.path, file.bytes));
  const result = checkIndexQuality(documents, scope, rules({ Q003: 'warning', Q004: 'warning' }), 'all');
  assert.deepEqual(result.map(item => [item.ruleId, item.path]), [['Q003', 'loose/index.md']]);
  const extraDocument = parseDocument('excluded.md', new TextEncoder().encode(concept('[Bad](missing.md)', null)));
  assert.deepEqual(checkIndexQuality([extraDocument], scope, rules({ Q001: 'warning', Q002: 'warning' }), 'all'), []);
});

test('each Q001–Q005 independently supports off, warning and error without changing layer', () => {
  const files = { 'a.md': concept('[Broken](missing.md)', null), 'b.md': concept(), 'child/c.md': concept(), 'index.md': '- [A](a.md)' };
  for (const id of ids.slice(0, 5)) for (const severity of ['off', 'warning', 'error']) {
    const result = check(files, { [id]: severity });
    if (severity === 'off') assert.deepEqual(result, [], id);
    else {
      assert.ok(result.length > 0, id);
      assert.ok(result.every(item => item.ruleId === id && item.severity === severity && item.layer === 'quality'), id);
      assert.ok(result.every(item => item.message.length > 0 && item.remediation.length > 0));
    }
  }
});

test('finding order is deterministic under document and inventory ordering', () => {
  const { documents, scope } = fixture({ 'z.md': concept('[Bad](missing.md)', null), 'a/b.md': concept('', null), 'index.md': '- [Z](z.md)' });
  const settings = rules(Object.fromEntries(ids.slice(0, 5).map(id => [id, 'warning'])));
  const expected = checkIndexQuality(documents, scope, settings, 'all');
  assert.deepEqual(checkIndexQuality([...documents].reverse(), { ...scope, entries: [...scope.entries].reverse() }, settings, 'all'), expected);
});
