import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runCiExamples} from '../scripts/ci-example-smoke.mjs';
import YAML from 'yaml';

test('documented CI examples prove passing, compliance and explicit quality gates',async()=>{
  const outputDirectory=await mkdtemp(join(tmpdir(),'okf CI reports '));
  try {
    const summary=await runCiExamples({outputDirectory});
    assert.equal(summary.completed,true);
    assert.deepEqual(summary.cases.map(({name,actualExitCode})=>({name,actualExitCode})),[
      {name:'passing',actualExitCode:0},
      {name:'compliance-failure',actualExitCode:1},
      {name:'quality-failure',actualExitCode:1},
      {name:'quality-warning',actualExitCode:0},
      {name:'quality-threshold',actualExitCode:1}
    ]);
    assert.deepEqual(JSON.parse(await readFile(join(outputDirectory,'summary.json'),'utf8')),summary);
    const first=await readFile(join(outputDirectory,'quality-failure.json'),'utf8');
    await runCiExamples({outputDirectory});
    assert.equal(await readFile(join(outputDirectory,'quality-failure.json'),'utf8'),first,'Identical example checks produce identical reports');
    const report=JSON.parse(first);
    assert.equal(report.findings[0].path,'missing.md');
    assert.equal(report.findings[0].source.path,'concept.md');
    assert.equal(report.counts.compliance,0,'A stricter quality gate must not become compliance');
  } finally {
    await rm(outputDirectory,{recursive:true,force:true});
  }
});

test('CI example runner fails on operational errors and removes stale completed reports',async()=>{
  const outputDirectory=await mkdtemp(join(tmpdir(),'okf CI failure '));
  try {
    await writeFile(join(outputDirectory,'passing.json'),'{"completed":true,"exitCode":0}');
    await assert.rejects(runCiExamples({outputDirectory,cliPath:join(outputDirectory,'missing-cli.js')}));
    const summary=JSON.parse(await readFile(join(outputDirectory,'summary.json'),'utf8'));
    assert.equal(summary.completed,false);
    assert.ok(summary.cases.every(result=>!result.passed));
    await assert.rejects(readFile(join(outputDirectory,'passing.json')),{code:'ENOENT'});
    assert.notEqual(await readFile(join(outputDirectory,'passing.stderr.log'),'utf8'),'');
  } finally {
    await rm(outputDirectory,{recursive:true,force:true});
  }
});


test('inactive GitHub Actions example covers six targets and always collects reports',async()=>{
  const workflow=YAML.parse(await readFile(new URL('../examples/ci/github-actions.yml',import.meta.url),'utf8'));
  const job=workflow.jobs.example;
  assert.deepEqual(workflow.permissions,{contents:'read'});
  assert.deepEqual(job.strategy.matrix.node,[22,24]);
  assert.deepEqual(job.strategy.matrix.os,['ubuntu-latest','windows-latest','macos-latest']);
  assert.equal(job.steps[0].with.ref,'${{ github.sha }}');
  assert.equal(job.steps[0].with['persist-credentials'],false);
  assert.ok(job.steps.some(step=>step.run==='npm ci --ignore-scripts'));
  assert.ok(job.steps.some(step=>step.run==='node scripts/ci-example-smoke.mjs --output reports/ci-examples'));
  const artifact=job.steps.find(step=>step.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(artifact.if,'always()');
  assert.equal(artifact.with.path,'reports/ci-examples/');
});
