// Representative local measurements, not a throughput or memory guarantee.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {arch, cpus, platform, release, tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {checkBundle, renderReport} from '../dist/index.js';

const profiles = [
  {name: 'small', concepts: 25, groups: 5},
  {name: 'medium', concepts: 250, groups: 10},
  {name: 'large', concepts: 1000, groups: 20},
];
const iterations = 3;
const rounded = number => Math.round(number * 100) / 100;
const digest = value => createHash('sha256').update(value).digest('hex');
const conceptName = index => `concept-${String(index).padStart(4, '0')}.md`;
const groupName = index => `group-${String(index).padStart(2, '0')}`;

async function measure(profile) {
  const root = await mkdtemp(join(tmpdir(), `okf-benchmark-${profile.name}-`));
  try {
    const bundle = join(root, 'bundle');
    await mkdir(bundle);
    const payload = 'Synthetic explanatory prose. '.repeat(90);
    const members = Array.from({length: profile.groups}, () => []);
    for (let index = 0; index < profile.concepts; index++) members[index % profile.groups].push(index);
    const rootIndex = ['---', 'okf_version: "0.2"', '---', '# Representative bundle'];
    for (let group = 0; group < profile.groups; group++) {
      const directory = groupName(group);
      await mkdir(join(bundle, directory));
      rootIndex.push(`- [${directory}](${directory}/) - A synthetic concept group.`);
      const indexLines = ['# Concepts'];
      for (const index of members[group]) {
        const name = conceptName(index);
        const neighbor = (index + 1) % profile.concepts;
        const target = `/${groupName(neighbor % profile.groups)}/${conceptName(neighbor)}`;
        const content = [
          '---', 'type: Reference', 'description: A synthetic performance concept.',
          'sources: [{resource: "synthetic benchmark", count: 1}]',
          'verified: {by: "human:benchmark", at: "2026-10-21T12:00:00Z"}',
          'status: stable', '---', `# Concept ${index}`, '', payload, '',
          `[Neighbor](${target})`, '[Asset](../asset.txt)', '[Group](./)',
          '[Reference][neighbor]', `[neighbor]: ${target}`, '',
          '[External](https://example.invalid/not-fetched)',
          '`[Ignored](code-only.md)`', '', '```js', 'throw new Error("not executed");', '```', '',
        ].join('\n');
        await writeFile(join(bundle, directory, name), content);
        indexLines.push(`- [Concept ${index}](${name}) - A useful synthetic reference.`);
      }
      await writeFile(join(bundle, directory, 'index.md'), indexLines.join('\n') + '\n');
    }
    await writeFile(join(bundle, 'index.md'), rootIndex.join('\n') + '\n');
    await writeFile(join(bundle, 'asset.txt'), 'Synthetic asset.\n'.repeat(1024));
    const once = async () => {
      const start = performance.now();
      const report = await checkBundle(bundle);
      const json = renderReport(report, 'json');
      const milliseconds = performance.now() - start;
      assert.equal(report.exitCode, 0);
      assert.equal(report.findings.length, 0, 'Benchmark corpus should have no findings');
      return {report, json, milliseconds};
    };
    const warmup = await once();
    const samples = [];
    for (let iteration = 0; iteration < iterations; iteration++) {
      const value = await once();
      assert.equal(value.json, warmup.json, 'Identical measurements must produce byte-identical JSON');
      samples.push(value.milliseconds);
    }
    const ordered = [...samples].sort((a, b) => a - b);
    const median = ordered[Math.floor(ordered.length / 2)];
    return {
      profile: profile.name,
      concepts: profile.concepts,
      directories: profile.groups,
      documents: warmup.report.scope.documents,
      entries: warmup.report.scope.entries,
      totalInputBytes: warmup.report.scope.totalBytes,
      findings: warmup.report.findings.length,
      warmupMs: rounded(warmup.milliseconds),
      samplesMs: samples.map(rounded),
      medianMs: rounded(median),
      conceptsPerSecondAtMedian: rounded(profile.concepts * 1000 / median),
      processPeakRssKiB: process.resourceUsage().maxRSS,
      deterministicReportSha256: digest(warmup.json),
    };
  } finally {
    await rm(root, {recursive: true, force: true});
  }
}

if (process.argv[2] === '--worker') {
  const profile = profiles.find(item => item.name === process.argv[3]);
  if (!profile || process.argv.length !== 4) throw new Error('Unknown benchmark worker profile');
  process.stdout.write(JSON.stringify(await measure(profile)) + '\n');
} else {
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/benchmark.mjs');
  const results = [];
  for (const profile of profiles) {
    // A separate process per corpus makes memory observations independent.
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--worker', profile.name], {encoding: 'utf8', timeout: 120_000, maxBuffer: 2 * 1024 * 1024});
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error(`Benchmark ${profile.name} failed (${child.status}): ${child.stderr}`);
    results.push(JSON.parse(child.stdout));
  }
  process.stdout.write(JSON.stringify({
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    environment: {node: process.version, platform: platform(), release: release(), arch: arch(), logicalCpus: cpus().length, cpuModel: cpus()[0]?.model ?? 'unknown'},
    method: {
      measured: 'Engine discovery, UTF-8/YAML/Markdown parsing, all default rules and JSON rendering',
      excluded: 'Dependency installation, process/module startup, synthetic fixture creation and cleanup',
      warmupsPerProfile: 1,
      timedRunsPerProfile: iterations,
      rss: 'Per-profile process lifetime peak RSS, including imports, fixture setup and warmup; not an engine-only memory bound',
      caveat: 'Synthetic local warm-cache measurements; not a service-level objective or worst-case bound',
    },
    results,
  }, null, 2) + '\n');
}
