import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createReport} from '../dist/report.js';
import {defaultPolicy} from '../dist/policy.js';

const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const lock=JSON.parse(await readFile(new URL('../package-lock.json',import.meta.url),'utf8'));

test('release identity agrees across package, lockfile, help and report',()=>{
  assert.match(pkg.version,/^\d+\.\d+\.\d+$/);
  assert.equal(pkg.name,'okf-bundle-checker');
  assert.equal(lock.name,pkg.name);
  assert.equal(lock.version,pkg.version);
  assert.equal(lock.packages[''].name,pkg.name);
  assert.equal(lock.packages[''].version,pkg.version);
  assert.notEqual(pkg.private,true);
  assert.deepEqual(pkg.publishConfig,{access:'public',tag:'latest'});
  const help=spawnSync(process.execPath,[fileURLToPath(new URL('../dist/cli.js',import.meta.url)),'--help'],{encoding:'utf8'});
  assert.equal(help.status,0,help.stderr);
  assert.equal(help.stderr,'');
  assert.ok(help.stdout.includes(`Version ${pkg.version}.`));
  const scope={entries:1,concepts:1,documents:1,totalBytes:1,exclusions:[],excludedEntries:0};
  assert.deepEqual(createReport(scope,[],defaultPolicy()).tool,{name:pkg.name,version:pkg.version});
});

test('release documentation uses the matching tag and current release language',async()=>{
  const docs=(await readdir(new URL('../docs/',import.meta.url))).filter(file=>file.endsWith('.md')).map(file=>`docs/${file}`);
  for(const path of ['README.md','CHANGELOG.md','examples/ci/README.md',...docs]) {
    const content=await readFile(new URL(`../${path}`,import.meta.url),'utf8');
    assert.doesNotMatch(content,/\b(?:alpha|beta|prerelease|pre-release|unreleased|temporary)\b|previous versions?/i,`${path}: obsolete release-stage language`);
  }
  const release=await readFile(new URL('../docs/release-readiness.md',import.meta.url),'utf8');
  assert.ok(release.includes(`\`${pkg.version}\` / \`v${pkg.version}\``),'release tag must match the package version');
  const changelog=await readFile(new URL('../CHANGELOG.md',import.meta.url),'utf8');
  assert.ok(changelog.split(/\r?\n/).includes(`## ${pkg.version}`),'changelog must describe the package version');
});
