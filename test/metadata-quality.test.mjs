import test from 'node:test';
import assert from 'node:assert/strict';
import { stringify } from 'yaml';
import { parseDocument } from '../dist/parser.js';
import { checkCompliance } from '../dist/compliance.js';
import { checkMetadata } from '../dist/metadata-quality.js';

const rules = Object.freeze({ Q001: 'off', Q002: 'off', Q003: 'off', Q004: 'off', Q005: 'off', Q006: 'warning', Q007: 'warning', Q008: 'warning', Q009: 'warning' });
const instant = '2026-06-30T14:00:00Z';
const parse = (metadata = {}, body = '', path = 'concept.md') => parseDocument(path, new TextEncoder().encode(`---\n${stringify({ type: 'Custom Type', ...metadata })}---\n${body}`));
const check = (metadata, body, policy = rules) => checkMetadata(parse(metadata, body), policy);
const fields = findings => findings.map(finding => finding.message.split(' must ')[0]);
const inline = '# Computation\n\n```sql\nSELECT 1;\n```\n';
const computation = extra => ({ type: 'Attested Computation', runtime: 'new/custom-runtime', computation: '/queries/query.sql', ...extra });

test('missing optional families and unknown types/extensions are accepted', () => {
  assert.deepEqual(check({}), []);
  assert.deepEqual(check({ type: 'Attested Computation' }), []);
  assert.deepEqual(check({ type: 'Unregistered', runtime: [], executor: false, custom: { generated: 123 }, timestamp: 'legacy-extension' }), []);
  assert.deepEqual(check({ status: 'stable', extension: { nested: ['arbitrary', 42] } }), []);
});

test('metadata checking skips reserved, invalid and unparseable documents', () => {
  for (const path of ['index.md', 'sub/index.md', 'log.md']) assert.deepEqual(checkMetadata(parse({ sources: false }, '', path), rules), []);
  for (const text of ['plain text', '---\n- not a mapping\n---', '---\nsources: [\n---']) {
    assert.deepEqual(checkMetadata(parseDocument('a.md', new TextEncoder().encode(text)), rules), []);
  }
});

test('Q006 accepts scope descriptors, optional source signals and per-source overrides', () => {
  assert.deepEqual(check({
    sources: [
      { resource: 'all queries in BigQuery project X' },
      { resource: 'references/source.md', id: '', title: '', author: 'team:finance', usage_count: 0.5, last_modified: instant, usage_window: { from: instant, to: instant, extension: true }, custom: [] },
    ], usage_window: { from: instant, to: instant },
  }), []);
  assert.deepEqual(check({ sources: [] }), []);
});

test('Q006 checks one finding per invalid source field without cascading from non-mappings', () => {
  for (const value of [null, {}, 'not-a-list', 10]) assert.deepEqual(fields(check({ sources: value })), ['sources']);
  const result = check({ sources: [null, [], {}, { resource: '', id: 1, title: false, author: [], usage_count: -1, last_modified: '2026-06-30' }] });
  assert.deepEqual(fields(result), ['sources[0]', 'sources[1]', 'sources[2].resource', 'sources[3].resource', 'sources[3].id', 'sources[3].title', 'sources[3].author', 'sources[3].usage_count', 'sources[3].last_modified']);
  assert.ok(result.every(finding => finding.ruleId === 'Q006' && finding.message.includes('§5.1') && finding.remediation.includes('§5.1')));
});

test('Q006 rejects non-finite/non-number/negative usage counts without imposing integers', () => {
  for (const usage_count of [-1, NaN, Infinity, -Infinity, '2', null, false, {}]) {
    assert.deepEqual(fields(check({ sources: [{ resource: 'scope', usage_count }] })), ['sources[0].usage_count']);
  }
  for (const usage_count of [0, 1, 0.125, Number.MAX_VALUE]) assert.deepEqual(check({ sources: [{ resource: 'scope', usage_count }] }), []);
});

test('Q006 usage windows require their documented from/to members, not inferred ordering', () => {
  assert.deepEqual(fields(check({ usage_window: 'last month' })), ['usage_window']);
  assert.deepEqual(fields(check({ usage_window: {} })), ['usage_window.from', 'usage_window.to']);
  assert.deepEqual(fields(check({ sources: [{ resource: 'scope', usage_window: { from: 'yesterday', to: null } }] })), ['sources[0].usage_window.from', 'sources[0].usage_window.to']);
  assert.deepEqual(check({ usage_window: { from: '2026-07-01T00:00:00Z', to: instant } }), []);
});

test('Q007 consumes bare verified mappings as one event without mutation', () => {
  const event = { by: 'human:reviewer', at: instant, extension: ['retained'] };
  const bare = parse({ generated: { by: 'arbitrary-actor', unknown: true }, verified: event });
  const before = JSON.stringify(bare);
  assert.deepEqual(checkMetadata(bare, rules), []);
  assert.equal(JSON.stringify(bare), before);
  assert.deepEqual(check({ verified: [event, { by: 'process:nightly', at: instant }] }), []);
  assert.deepEqual(check({ verified: [] }), []);
});

test('Q007 generated.by is required, generated.at is optional and verified by/at are required', () => {
  assert.deepEqual(fields(check({ generated: {} })), ['generated.by']);
  assert.deepEqual(fields(check({ generated: { by: ' ', at: '2026-06-30' }, verified: {} })), ['generated.by', 'generated.at', 'verified.by', 'verified.at']);
  assert.deepEqual(fields(check({ generated: [], verified: [false, {}, { by: 123, at: false }] })), ['generated', 'verified[0]', 'verified[1].by', 'verified[1].at', 'verified[2].by', 'verified[2].at']);
  for (const verified of [null, 'human:reviewer', true]) assert.deepEqual(fields(check({ verified })), ['verified']);
  assert.ok(check({ verified: {} }).every(finding => finding.message.includes('§5.2')));
});

test('Q008 accepts all documented status values and rejects coercible/non-string values', () => {
  for (const status of ['draft', 'stable', 'deprecated']) assert.deepEqual(check({ status }), []);
  for (const status of ['other', 'Stable', '', null, ['stable'], { toString: 'stable' }, true]) {
    const result = check({ status });
    assert.deepEqual(fields(result), ['status']);
    assert.equal(result[0].ruleId, 'Q008');
    assert.match(result[0].message, /§5\.4/);
  }
});

test('timestamp checks require explicit offsets and real calendar/time components', () => {
  const invalid = ['2026-06-30', '2026-06-30T14:00:00', '2025-02-29T00:00:00Z', '1900-02-29T00:00:00Z', '2026-04-31T00:00:00Z', '2026-00-01T00:00:00Z', '2026-13-01T00:00:00Z', '2026-06-00T00:00:00Z', '2026-06-30T25:00:00Z', '2026-06-30T24:01:00Z', '2026-06-30T14:60:00Z', '2026-06-30T14:00:61Z', '2026-06-30T14:00:00+24:00', '2026-06-30T14:00:00+05:60', false, null, [], 2026];
  for (const stale_after of invalid) {
    const result = check({ stale_after });
    assert.deepEqual(fields(result), ['stale_after'], JSON.stringify(stale_after));
    assert.match(result[0].message, /§5\.5/);
  }
  const valid = [instant, '2024-02-29T00:00:00+05:30', '2000-02-29T00:00:00-07:00', '2026-06-30T14:00Z', '2026-06-30T14:00:00.123456Z', '2026-06-30T14:00:00,5+05', '20260630T140000+0530', '2026-06-30T24:00:00Z', '2016-12-31T23:59:60Z'];
  for (const stale_after of valid) assert.deepEqual(check({ stale_after }), [], stale_after);
});

test('timestamps belong to their metadata family, with no duplicate lifecycle findings', () => {
  const result = check({ sources: [{ resource: 'scope', last_modified: false }], generated: { by: 'actor', at: false }, verified: { by: 'actor', at: false }, stale_after: false });
  assert.deepEqual(result.map(finding => finding.ruleId), ['Q006', 'Q007', 'Q007', 'Q008']);
  assert.equal(new Set(result.map(finding => finding.message)).size, result.length);
});

test('Q009 activation is exact-type and present-family only; required runtime is scoped', () => {
  assert.deepEqual(check({ type: 'Attested Computation' }), []);
  assert.deepEqual(check({ type: 'Custom Computation', computation: false, parameters: null }), []);
  assert.deepEqual(fields(check({ type: 'Attested Computation', computation: './q.sql' })), ['runtime']);
  for (const runtime of [null, 7, [], '', ' ']) assert.deepEqual(fields(check(computation({ runtime }))), ['runtime']);
  assert.deepEqual(check(computation({ runtime: 'my-new-runtime/2027' })), []);
});

test('Q009 accepts documented parameters, executor/receipt/attester and extension fields', () => {
  assert.deepEqual(check(computation({
    parameters: [{ name: 'year', type: 'domain-specific-type', required: true, custom: {} }],
    executor: { resource: 'https://example.invalid/do-not-fetch', receipt: ['job_id', 'executed_sql', 'result'], extension: null },
    attester: { resource: 'references/attester.py', unknown: 123 },
  })), []);
  assert.deepEqual(check(computation({ parameters: [], executor: { resource: './executor.sh' }, attester: { resource: './attester.py' } })), []);
});

test('Q009 checks each parameter field, with no type registry or duplicate-name restriction', () => {
  assert.deepEqual(fields(check(computation({ parameters: {} }))), ['parameters']);
  const result = check(computation({ parameters: [null, {}, { name: '', type: 3, required: 'yes' }] }));
  assert.deepEqual(fields(result), ['parameters[0]', 'parameters[1].name', 'parameters[1].type', 'parameters[1].required', 'parameters[2].name', 'parameters[2].type', 'parameters[2].required']);
  assert.ok(result.every(finding => finding.message.includes('§10.2')));
  assert.deepEqual(check(computation({ parameters: [{ name: 'a', type: 'custom', required: false }, { name: 'a', type: 'custom', required: true }] })), []);
});

test('Q009 executor/attester are mappings, with resources and receipt field-name sequences', () => {
  assert.deepEqual(fields(check(computation({ executor: null, attester: [] }))), ['executor', 'attester']);
  assert.deepEqual(fields(check(computation({ executor: { receipt: 'job_id' }, attester: {} }))), ['executor.resource', 'executor.receipt', 'attester.resource']);
  assert.deepEqual(fields(check(computation({ executor: { resource: './run', receipt: [null, {}, '', 7] }, attester: { resource: true } }))), ['executor.receipt[0]', 'executor.receipt[1]', 'executor.receipt[2]', 'executor.receipt[3]', 'attester.resource']);
});

test('Q009 accepts fenced and canonical-example indented computations', () => {
  const metadata = { type: 'Attested Computation', runtime: 'python' };
  for (const body of [inline, '# Computation\n\n    SELECT 1;\n', '# **Computation**\n\n~~~python\nraise SystemExit(99)\n~~~\n']) assert.deepEqual(check(metadata, body), []);
  assert.deepEqual(check(metadata, `${inline}\n# Examples\n\n\`\`\`sql\nSELECT 2;\n\`\`\`\n`), []);
});

test('Q009 rejects missing/multiple inline computations and path-plus-inline ambiguity', () => {
  const metadata = { type: 'Attested Computation', runtime: 'python' };
  for (const body of ['', '# Computation\n\n`SELECT 1`', '# Examples\n\n```sql\nSELECT 1;\n```', '# Computation\n\n# Examples\n\n```sql\nSELECT 1;\n```', `${inline}\n\`\`\`sql\nSELECT 2;\n\`\`\``]) {
    const result = check(metadata, body);
    assert.deepEqual(fields(result), ['body.# Computation']);
    assert.match(result[0].message, /§10\.3/);
  }
  assert.deepEqual(fields(check(computation({}), inline)), ['computation']);
  assert.deepEqual(fields(check(computation({ computation: null }), inline)), ['computation']);
  assert.deepEqual(check(computation({}), '# Examples\n\n```sql\nSELECT 1;\n```'), []);
});

test('all metadata rules support off/warning/error while preserving the quality layer', () => {
  const metadata = { type: 'Attested Computation', sources: false, generated: false, status: false, runtime: false, computation: './query.sql' };
  assert.deepEqual(check(metadata, '', Object.fromEntries(Object.keys(rules).map(id => [id, 'off']))), []);
  const warnings = check(metadata);
  assert.deepEqual(warnings.map(finding => finding.ruleId), ['Q006', 'Q007', 'Q008', 'Q009']);
  assert.ok(warnings.every(finding => finding.layer === 'quality' && finding.severity === 'warning'));
  for (const ruleId of ['Q006', 'Q007', 'Q008', 'Q009']) {
    const findings = check(metadata, '', { ...rules, [ruleId]: 'error' });
    assert.ok(findings.filter(finding => finding.ruleId === ruleId).every(finding => finding.severity === 'error' && finding.layer === 'quality'));
    assert.equal(check(metadata, '', { ...rules, [ruleId]: 'off' }).some(finding => finding.ruleId === ruleId), false);
  }
  assert.deepEqual(checkCompliance(parse(metadata)), []);
});

test('findings are deterministic, field-specific and tied to source positions', () => {
  const doc = parse({ sources: [{ resource: 1, title: false }], verified: { at: false }, status: ['stable'] });
  const findings = checkMetadata(doc, rules);
  assert.deepEqual(checkMetadata(doc, rules), findings);
  assert.deepEqual(findings[0].position, doc.frontmatter.positions.sources);
  assert.deepEqual(findings.at(-1).position, doc.frontmatter.positions.status);
  assert.ok(findings.every(finding => finding.path === 'concept.md' && finding.position.line > 0 && finding.position.column > 0 && /§\d/.test(finding.message) && /§\d/.test(finding.remediation)));
  assert.equal(new Set(fields(findings)).size, findings.length);
});

test('computation resources remain inert strings and inline code is never run', () => {
  assert.deepEqual(check(computation({ computation: 'https://example.invalid/will-not-fetch', executor: { resource: 'javascript:throw new Error("must not run")' }, attester: { resource: 'file:///private/never-read' } })), []);
  assert.deepEqual(check({ type: 'Attested Computation', runtime: 'node' }, '# Computation\n\n```js\nthrow new Error("must not run");\n```'), []);
});
