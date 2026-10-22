import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const exampleRoot=join(root,'examples','ci');

/** Execute the real CLI with explicit policy; expected validation failures are not tool failures. */
export async function runCiExamples({cliPath=join(root,'dist','cli.js'),outputDirectory=join(root,'reports','ci-examples')}={}) {
  const output=resolve(outputDirectory);
  const entry=resolve(cliPath);
  const cases=JSON.parse(await readFile(join(exampleRoot,'cases.json'),'utf8'));
  const identity=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
  await mkdir(output,{recursive:true});
  await rm(join(output,'summary.json'),{force:true});
  const results=[];
  for(const example of cases) {
    const reportPath=join(output,`${example.name}.json`);
    // An operational failure must never leave an earlier successful report as evidence.
    await rm(reportPath,{force:true});
    const args=[entry,'check',join(exampleRoot,'bundles',example.bundle),'--config',join(exampleRoot,'policies',example.policy),'--format','json','--output',reportPath];
    if(example.failOn)args.push('--fail-on',example.failOn);
    const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024,windowsHide:true});
    await writeFile(join(output,`${example.name}.stdout.log`),result.stdout??'','utf8');
    await writeFile(join(output,`${example.name}.stderr.log`),result.stderr??'','utf8');
    let failure;
    try {
      assert.ifError(result.error);
      assert.equal(result.signal,null,'CLI must finish without a signal');
      assert.equal(result.status,example.expectedExitCode,`${example.name}: unexpected CLI exit status; see stderr log`);
      assert.equal(result.stdout,'','--output must leave stdout empty');
      assert.equal(result.stderr,'','A completed validation must not emit an operational error');
      const report=JSON.parse(await readFile(reportPath,'utf8'));
      assert.equal(report.schemaVersion,1);
      assert.equal(report.completed,true);
      assert.deepEqual(report.tool,{name:identity.name,version:identity.version},'CLI must match the selected source/package identity');
      assert.equal(report.exitCode,result.status,'JSON and process exit status must agree');
      assert.equal(report.scope.concepts,1);
      assert.equal(report.specVersion,'0.2');
      assert.deepEqual(report.findings.map(({ruleId,layer,severity})=>({ruleId,layer,severity})),example.expectedFindings);
      assert.equal(report.counts.compliance,example.expectedFindings.filter(finding=>finding.layer==='compliance').length);
      assert.equal(report.counts.quality,example.expectedFindings.filter(finding=>finding.layer==='quality').length);
    } catch(error) {
      failure=error instanceof Error?error.message:String(error);
    }
    results.push({name:example.name,expectedExitCode:example.expectedExitCode,actualExitCode:result.status,passed:failure===undefined,...(failure===undefined?{}:{failure})});
  }
  const summary={completed:results.every(result=>result.passed),runtime:process.version,platform:process.platform,arch:process.arch,cases:results};
  await writeFile(join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n','utf8');
  if(!summary.completed)throw new Error(results.filter(result=>!result.passed).map(result=>`${result.name}: ${result.failure}`).join('\n'));
  return summary;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const options={};
    const used=new Set();
    for(let index=2;index<process.argv.length;index+=2) {
      const key=process.argv[index];
      const value=process.argv[index+1];
      if(!['--cli','--output'].includes(key)||!value||value.startsWith('--')||used.has(key))throw new Error('Usage: node scripts/ci-example-smoke.mjs [--cli <cli.js>] [--output <report-directory>]');
      used.add(key);
      options[key==='--cli'?'cliPath':'outputDirectory']=value;
    }
    const summary=await runCiExamples(options);
    for(const result of summary.cases)console.log(`${result.name}: exit ${result.actualExitCode} (expected ${result.expectedExitCode})`);
    console.log('Offline CI example smoke passed; JSON reports, stderr logs and summary collected.');
  } catch(error) {
    console.error(error instanceof Error?error.message:String(error));
    process.exitCode=1;
  }
}
