import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, mkdir, readFile, readdir, writeFile, rm, symlink, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const cliEntry = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const guardEntry = fileURLToPath(new URL('./helpers/guarded-check.mjs', import.meta.url));
const concept = (body = '', metadata = 'type: Custom\ndescription: A useful synthetic concept.') => `---\n${metadata}\n---\n${body}\n`;
async function fixture(t, files) {
  // macOS and caller-selected TMPDIR values may contain symlinked ancestors.
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'okf-acceptance-')));
  const bundle = join(cwd, 'bundle');
  await mkdir(bundle);
  t.after(() => rm(cwd, {recursive: true, force: true}));
  for (const [path, data] of Object.entries(files)) {
    await mkdir(dirname(join(bundle, path)), {recursive: true});
    await writeFile(join(bundle, path), data);
  }
  return {cwd, bundle};
}
function invoke(cwd, args, env = {}) {
  const result = spawnSync(process.execPath, [cliEntry, ...args], {cwd, encoding: 'utf8', timeout: 20_000, maxBuffer: 8 * 1024 * 1024, env: {...process.env, ...env}});
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null, result.stderr);
  return result;
}
function check(input, extra = [], env) {
  const result = invoke(input.cwd, ['check', input.bundle, '--format', 'json', ...extra], env);
  if (result.status === 2) return {...result, diagnostic: JSON.parse(result.stderr)};
  assert.equal(result.stderr, '');
  return {...result, report: JSON.parse(result.stdout)};
}
function guarded(input, extra = {}) {
  const options = {bundle: input.bundle, args: ['check', input.bundle, '--format', 'json'], ...extra};
  const child = spawnSync(process.execPath, [guardEntry, JSON.stringify(options)], {cwd: input.cwd, encoding: 'utf8', timeout: 20_000, maxBuffer: 8 * 1024 * 1024});
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stderr, '');
  const result = JSON.parse(child.stdout);
  assert.deepEqual(result.blocked, [], 'Validation must not even attempt a guarded effect');
  return result;
}
function operational(result, code) {
  assert.equal(result.status, 2, result.stdout);
  assert.equal(result.stdout, '');
  const diagnostic = JSON.parse(result.stderr);
  assert.equal(diagnostic.completed, false);
  assert.equal(diagnostic.error, code);
  return diagnostic;
}
const ids = report => [...new Set(report.findings.map(item => item.ruleId))].sort();

test('PDF: minimal type-only concept passes compliance and optional quality can be disabled', async t => {
  const input = await fixture(t, {'minimal.md': concept('', 'type: My Custom Type')});
  const result = check(input);
  assert.equal(result.status, 0);
  assert.equal(result.report.counts.compliance, 0);
  assert.deepEqual(ids(result.report), ['Q001', 'Q003']);
  assert.ok(result.report.findings.every(item => item.layer === 'quality' && item.severity === 'warning'));
  await writeFile(join(input.cwd, '.okf-validator.yml'), 'rules: {Q001: off, Q003: off}\n');
  assert.deepEqual(check(input).report.findings, []);
});

test('PDF: malformed YAML and missing type give stable C001/C002 findings and exit 1', async t => {
  const input = await fixture(t, {'bad-yaml.md': '---\ntype: [\n---\n', 'missing-type.md': '---\ndescription: No type\n---\n'});
  const first = check(input);
  assert.equal(first.status, 1);
  assert.deepEqual(first.report.findings.filter(item => item.layer === 'compliance').map(item => [item.path, item.ruleId, item.severity]), [['bad-yaml.md', 'C001', 'error'], ['missing-type.md', 'C002', 'error']]);
  assert.ok(first.report.findings.filter(item => item.layer === 'compliance').every(item => item.position.line > 0 && item.position.column > 0));
  assert.equal(check(input).stdout, first.stdout);
});

test('PDF: broken links remain quality with warning/error/off, including index references', async t => {
  const input = await fixture(t, {'a.md': concept('[Missing](absent.md)'), 'index.md': '- [A](a.md) - A concept.\n- [Missing][ref] - A missing entry.\n\n[ref]: absent.md\n'});
  for (const [severity, status, count] of [['warning', 0, 2], ['error', 1, 2], ['off', 0, 0]]) {
    await writeFile(join(input.cwd, '.okf-validator.yml'), `rules: {Q002: ${severity}}\n`);
    const result = check(input);
    assert.equal(result.status, status);
    assert.equal(result.report.counts.compliance, 0);
    const links = result.report.findings.filter(item => item.ruleId === 'Q002');
    assert.equal(links.length, count);
    assert.ok(links.every(item => item.layer === 'quality' && item.severity === severity && item.path === 'absent.md' && item.source.position.line > 0));
  }
});

test('PDF: root/document-relative and reference links resolve nested paths, directories and assets', async t => {
  const input = await fixture(t, {
    'root.md': concept(),
    'nested/a.md': concept('[Root](/root.md#heading)\n[Sibling][ref]\n[Asset](../assets/image.svg?view=1)\n[Directory](../loose/)\n\n[ref]: ./deep/b.md\n\n`[Not a link](no.md)`\n\n```md\n[Not a link](no.md)\n```\n\n<a href="no.md">Ignored HTML</a>\n[External](https://example.invalid/unreachable)'),
    'nested/deep/b.md': concept(), 'loose/child.md': concept(), 'assets/image.svg': '<svg/>',
  });
  const result = check(input);
  assert.equal(result.status, 0);
  assert.equal(result.report.findings.filter(item => item.ruleId === 'Q002').length, 0);
});

test('PDF: reserved indexes accept root version and flag uncovered concepts without requiring type', async t => {
  const input = await fixture(t, {'index.md': '---\nokf_version: "0.2"\n---\n- [Included](included.md) - Included.\n- [Child](child/) - Child directory without an index.\n', 'included.md': concept(), 'omitted.md': concept(), 'child/a.md': concept(), 'log.md': '# Log\n## 2024-02-29\nLeap day.\n'});
  const result = check(input);
  assert.equal(result.report.counts.compliance, 0);
  const coverage = result.report.findings.filter(item => item.ruleId === 'Q004');
  assert.equal(coverage.length, 1);
  assert.match(coverage[0].message, /omitted\.md/);
  assert.equal(result.report.findings.some(item => item.ruleId === 'Q002'), false, 'A directory does not require a child index');
  await writeFile(join(input.bundle, 'child', 'index.md'), '---\nokf_version: "0.2"\n---\n');
  assert.deepEqual(check(input).report.findings.filter(item => item.layer === 'compliance').map(item => [item.ruleId, item.path]), [['C003', 'child/index.md']]);
});

test('PDF/audit: custom types/extensions pass and conditional metadata stays configurable quality', async t => {
  const input = await fixture(t, {
    'custom.md': concept('', 'type: Unregistered Custom Type\ndescription: Custom\nunknown_extension: {arbitrary: [values]}'),
    'conditional.md': concept('', 'type: Attested Computation\ndescription: Conditional\nsources: false\ngenerated: {}\nstatus: other\ncomputation: ./job.js'),
  });
  const result = check(input);
  assert.equal(result.status, 0);
  assert.equal(result.report.counts.compliance, 0);
  for (const id of ['Q006', 'Q007', 'Q008', 'Q009']) assert.ok(ids(result.report).includes(id));
  await writeFile(join(input.cwd, '.okf-validator.yml'), 'rules: {Q006: error, Q007: error, Q008: error, Q009: error}\n');
  const strict = check(input);
  assert.equal(strict.status, 1);
  assert.equal(strict.report.counts.compliance, 0);
  assert.ok(strict.report.findings.filter(item => item.severity === 'error').every(item => item.layer === 'quality'));
});

test('PDF/audit: all versioned shared compliance fixtures pass through the public CLI', async t => {
  const {cwd} = await fixture(t, {});
  const root = fileURLToPath(new URL('../tests/fixtures/shared/', import.meta.url));
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  for (const item of manifest.cases) {
    const result = check({cwd, bundle: join(root, item.directory)});
    assert.equal(result.status, item.complianceRuleIds.length ? 1 : 0, item.directory);
    assert.deepEqual([...new Set(result.report.findings.filter(finding => finding.layer === 'compliance').map(finding => finding.ruleId))].sort(), item.complianceRuleIds, item.directory);
  }
});

test('PDF: explicit config overrides cwd config, CLI overrides threshold, exclusions are reported', async t => {
  const input = await fixture(t, {'a.md': concept('', 'type: Custom'), 'vendor/invalid.md': 'Invalid concept'});
  await writeFile(join(input.cwd, '.okf-validator.yml'), 'rules: {Q001: error}\n');
  await writeFile(join(input.cwd, 'chosen.yml'), 'fail_on: warning\nexclude: ["vendor/**"]\nrules: {Q001: warning, Q003: off}\n');
  const selected = ['--config', 'chosen.yml'];
  assert.equal(check(input).status, 1);
  const result = check(input, [...selected, '--fail-on', 'error']);
  assert.equal(result.status, 0);
  assert.equal(result.report.rules.Q001, 'warning');
  assert.equal(result.report.threshold, 'error');
  assert.deepEqual(result.report.scope.exclusions, ['vendor/**']);
  assert.equal(result.report.scope.excludedEntries, 1);
  assert.equal(result.report.scope.concepts, 1);
  assert.equal(check(input, selected).status, 1);
  for (const invalid of ['rules: {Q999: warning}', 'rules: {Q001: typo}', 'rules: {C001: off}', 'unexpected: true']) {
    await writeFile(join(input.cwd, 'chosen.yml'), invalid);
    operational(check(input, selected), 'invalid-config');
  }
  await writeFile(join(input.cwd, 'chosen.yml'), 'exclude: ["**"]\n');
  operational(check(input, selected), 'empty-scope');
});

test('PDF: empty reserved-only scope and unsupported version are operational, never false passes', async t => {
  const input = await fixture(t, {'index.md': '# Empty index', 'log.md': '## 2026-10-21\nNo concepts.'});
  operational(check(input), 'empty-scope');
  await writeFile(join(input.bundle, 'a.md'), concept());
  await writeFile(join(input.bundle, 'index.md'), '---\nokf_version: "99"\n---\n');
  operational(check(input), 'unsupported-version');
});

test('PDF: grouped text and JSON retain every finding, provenance, remediation and total', async t => {
  const input = await fixture(t, {'a.md': concept('[Missing](absent.md)', 'description: Missing type'), 'index.md': '- [A](a.md)\n'});
  const result = check(input);
  const text = invoke(input.cwd, ['check', input.bundle]);
  assert.equal(text.status, result.status);
  assert.equal(text.stderr, '');
  assert.equal((text.stdout.match(/^  [CQ]\d{3} (?:compliance|quality)\/(?:error|warning) \| Position:/gm) ?? []).length, result.report.findings.length);
  let previous = text.stdout.indexOf('Errors (');
  for (const severity of ['error', 'warning']) for (const item of result.report.findings.filter(finding => finding.severity === severity)) {
    assert.ok(text.stdout.includes(`Path: ${item.path} (`));
    const position = item.position ? `line ${item.position.line}, column ${item.position.column}` : 'not specified';
    const provenance = item.source ? `    Referenced from: ${item.source.path}${item.source.position ? `:${item.source.position.line}:${item.source.position.column}` : ''}\n` : '';
    const block = `  ${item.ruleId} ${item.layer}/${item.severity} | Position: ${position}\n${provenance}    Message: ${item.message}\n    Fix: ${item.remediation}`;
    const offset = text.stdout.indexOf(block, previous + 1);
    assert.ok(offset > previous, `Missing or unordered text finding: ${item.ruleId}`);
    previous = offset;
  }
  const counts = result.report.counts;
  assert.ok(text.stdout.includes(`Findings: ${counts.errors} errors, ${counts.warnings} warnings (${counts.compliance} compliance, ${counts.quality} quality)`));
  assert.equal(result.report.completed, true);
  assert.equal(result.report.schemaVersion, 1);
  assert.equal(result.report.specVersion, '0.2');
  assert.ok(result.report.tool.name && result.report.tool.version);
});

test('determinism: identical snapshots ignore discovery creation order, absolute roots, locale and timezone', async t => {
  const files = {'z.md': concept('[Missing](/missing.md)', 'type: Custom'), 'nested/a.md': concept('[Missing](../missing.md)', 'type: Custom'), 'index.md': '- [Z](z.md)\n', 'Café.md': concept('', 'type: Custom')};
  const first = await fixture(t, files);
  const second = await fixture(t, Object.fromEntries(Object.entries(files).reverse()));
  const baseline = check(first).stdout;
  for (const input of [first, second]) for (const env of [{TZ: 'UTC', LANG: 'C'}, {TZ: 'Pacific/Honolulu', LANG: 'tr_TR.UTF-8'}, {TZ: 'Asia/Tokyo', LANG: 'en_US.UTF-8'}]) {
    assert.equal(check(input, [], env).stdout, baseline);
  }
  assert.ok(!baseline.includes(first.cwd) && !baseline.includes(second.cwd));
});

test('portable identity: exact logical case is required even on case-insensitive hosts', async t => {
  const input = await fixture(t, {
    'Exact.md': concept(),
    'nested/a.md': concept('[Exact](/Exact.md)\n[Wrong case](/exact.md)\n[Asset](/data.MD)'),
    'data.MD': 'Not Markdown: no required frontmatter.',
    'Index.md': concept(),
  });
  const result = check(input);
  assert.equal(result.report.scope.concepts, 3);
  assert.equal(result.report.scope.documents, 3);
  assert.equal(result.report.counts.compliance, 0);
  assert.deepEqual(result.report.findings.filter(item => item.ruleId === 'Q002').map(item => item.path), ['exact.md']);
  assert.ok(result.report.findings.some(item => item.ruleId === 'Q003' && item.path === 'index.md'), 'Index.md must not stand in for index.md');
});

test('offline/inert: external URLs, YAML strings, HTML, fenced code and computation assets have no effects', async t => {
  const input = await fixture(t, {});
  const marker = join(input.cwd, 'must-not-be-created');
  const payload = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed')`;
  const body = `<script>${payload}</script>\n\n<img src="https://example.invalid/image.svg" onerror="${payload}">\n\n[External](https://example.invalid/unreachable)\n[Mail](mailto:nobody@example.invalid)\n[Script](javascript:alert%281%29)\n\n\`$(${payload})\`\n\n\`\`\`js\n${payload}\n\`\`\`\n`;
  await writeFile(join(input.bundle, 'a.md'), concept(body, `type: Custom\ndescription: Inert content\nunknown: ${JSON.stringify(payload)}`));
  await writeFile(join(input.bundle, 'computed.md'), concept('', 'type: Attested Computation\ndescription: Inert computation\nruntime: node\ncomputation: ./execute.cjs\nexecutor: {resource: "https://example.invalid/execute"}\nattester: {resource: ./attest.sh}'));
  await writeFile(join(input.bundle, 'inline.md'), concept(`# Computation\n\n\`\`\`js\n${payload}\n\`\`\`\n`, 'type: Attested Computation\ndescription: Inline computation\nruntime: node'));
  const assets = [join(input.bundle, 'execute.cjs'), join(input.bundle, 'attest.sh')];
  await writeFile(assets[0], payload);
  await writeFile(assets[1], `#!/bin/sh\ntouch '${marker}'\n`);
  const before = await Promise.all(['a.md', 'computed.md', 'inline.md', 'execute.cjs', 'attest.sh'].map(path => readFile(join(input.bundle, path))));
  const result = guarded(input, {forbiddenReads: assets});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).counts.compliance, 0);
  await assert.rejects(readFile(marker), {code: 'ENOENT'});
  assert.deepEqual(await Promise.all(['a.md', 'computed.md', 'inline.md', 'execute.cjs', 'attest.sh'].map(path => readFile(join(input.bundle, path)))), before);
});

test('hostile YAML: constructors and alias-heavy/deep/oversized documents fail without executing', async t => {
  const input = await fixture(t, {'a.md': concept()});
  const contents = [
    '---\ntype: Custom\npayload: !!js/function "function () { process.exit(99) }"\n---\n',
    `---\ntype: Custom\nseed: &seed [one, two]\nreferences: [${Array(4000).fill('*seed').join(', ')}]\n---\n`,
    `---\ntype: Custom\nvalue: ${'['.repeat(1000)}0${']'.repeat(1000)}\n---\n`,
    `---\ntype: Custom\nvalue: ${'x'.repeat(256 * 1024)}\n---\n`,
  ];
  for (const content of contents) {
    await writeFile(join(input.bundle, 'a.md'), content);
    operational(guarded(input), 'parser-limit');
  }
  await writeFile(join(input.bundle, 'a.md'), 'x'.repeat(1024 * 1024 + 1));
  operational(guarded(input), 'document-limit');
});

test('hostile encoding: invalid UTF-8 is a compliance error, not silently repaired or operational', async t => {
  const input = await fixture(t, {'a.md': Buffer.from([0x2d, 0x2d, 0x2d, 0x0a, 0xff])});
  const result = guarded(input);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout).findings.filter(item => item.layer === 'compliance').map(item => item.ruleId), ['C001']);
});

test('containment: traversal/encoded separators never open an existing outside file', async t => {
  const input = await fixture(t, {'a.md': concept('[Outside](../outside.md)\n[Encoded](%2e%2e/outside.md)\n[Separator](..%2foutside.md)\n[Backslash](..%5coutside.md)')});
  const outside = join(input.cwd, 'outside.md');
  await writeFile(outside, 'PRIVATE_SENTINEL_MUST_NOT_APPEAR');
  const result = guarded(input, {forbiddenReads: [outside]});
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.counts.compliance, 0);
  assert.equal(report.findings.filter(item => item.ruleId === 'Q002').length, 4);
  assert.ok(!result.stdout.includes('PRIVATE_SENTINEL'));
});

test('containment: a real escaping symlink is refused before its target is opened', async t => {
  const input = await fixture(t, {'a.md': concept()});
  const outside = join(input.cwd, 'outside.md');
  await writeFile(outside, 'PRIVATE_SENTINEL_MUST_NOT_APPEAR');
  try { await symlink(outside, join(input.bundle, 'escape.md')); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {t.skip(`Host cannot create a symlink: ${error.code}`); return;}
    throw error;
  }
  operational(guarded(input, {forbiddenReads: [outside]}), 'symlink');
});

test('portable hostile filenames: terminal/bidi controls fail before a file read and never leak to output', async t => {
  const input = await fixture(t, {'a.md': concept()});
  for (const name of ['bad\u001b[31m.md', 'bad\u009b31m.md', 'bad\u202ereversed.md', 'bad\\path.md']) {
    const result = guarded(input, {syntheticName: name});
    operational(result, 'unsafe-path');
    assert.ok(!result.stderr.includes(name));
    assert.equal(result.opened.some(path => path.endsWith(name)), false);
  }
});

test('read failures: EACCES for a concept, directory and explicit config cannot become an all-clear', async t => {
  const input = await fixture(t, {'a.md': concept(), 'nested/b.md': concept()});
  await writeFile(join(input.cwd, 'policy.yml'), '{}\n');
  for (const [operation, path, code] of [['open', join(input.bundle, 'a.md'), 'unreadable-input'], ['opendir', join(input.bundle, 'nested'), 'unreadable-input'], ['open', join(input.cwd, 'policy.yml'), 'unreadable-config']]) {
    const result = guarded(input, {args: ['check', input.bundle, '--format', 'json', '--config', 'policy.yml'], fault: {operation, path}});
    operational(result, code);
    assert.deepEqual(result.injected, [operation], 'The permission failure must actually be exercised, including when tests run as root');
    assert.ok(!result.stderr.includes(path));
  }
});

test('output failures: failed atomic publication preserves old report and cleans the temporary file', async t => {
  const input = await fixture(t, {'a.md': concept()});
  const output = join(input.cwd, 'report.json');
  await writeFile(output, 'previous report\n');
  const before = await readdir(input.cwd);
  const result = guarded(input, {args: ['check', input.bundle, '--format', 'json', '--output', output], fault: {operation: 'rename', path: output}});
  operational(result, 'report-write');
  assert.deepEqual(result.injected, ['rename']);
  assert.equal(await readFile(output, 'utf8'), 'previous report\n');
  assert.deepEqual(await readdir(input.cwd), before, 'Temporary report must be removed after failed publication');
});
