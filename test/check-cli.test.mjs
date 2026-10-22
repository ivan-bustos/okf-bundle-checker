import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync,spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {run} from '../dist/cli.js';
import {checkBundle} from '../dist/index.js';
const entry=resolve('dist/cli.js');
const cli=(cwd,...args)=>spawnSync(process.execPath,[entry,...args],{cwd,encoding:'utf8'});
async function fixture(){const root=await mkdtemp(join(tmpdir(),'okf-cli-'));const bundle=join(root,'bundle');await mkdir(bundle);await writeFile(join(bundle,'a.md'),'---\ntype: Custom\n---\n');return {root,bundle};}
test('check command emits pure deterministic JSON and threshold exit behavior',async()=>{
  const {root,bundle}=await fixture();try{
    const a=cli(root,'check',bundle,'--format','json');const b=cli(root,'check',bundle,'--format','json');assert.equal(a.status,0,a.stderr);assert.equal(a.stderr,'');assert.equal(a.stdout,b.stdout);const report=JSON.parse(a.stdout);assert.equal(report.completed,true);assert.equal(report.counts.compliance,0);assert.ok(report.counts.warnings>0);assert.ok(!a.stdout.includes(root));
    assert.equal(cli(root,'check',bundle,'--fail-on','warning').status,1);
    await writeFile(join(root,'.okf-validator.yml'),'rules: {Q001: error}\n');assert.equal(cli(root,'check',bundle).status,1);
    await writeFile(join(root,'.okf-validator.yml'),'rules: {Q001: off, Q003: off}\n');assert.equal(JSON.parse(cli(root,'check',bundle,'--format','json').stdout).findings.length,0);
    await writeFile(join(bundle,'a.md'),'---\ntype: ""\n---\n');assert.equal(cli(root,'check',bundle).status,1);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('operational failures never emit success JSON or a report file',async()=>{
  const {root,bundle}=await fixture();try{
    const target=join(root,'report.json');await writeFile(target,'previous');
    for(const args of [['check',join(root,'missing')],['check',bundle,'--config','missing.yml'],['check',bundle,'--format','xml'],['check',bundle,'--fail-on','none'],['check',bundle,'--format'],['check',bundle,'--format','json','--format','json']]){
      const result=cli(root,...args,'--output',target);assert.equal(result.status,2,result.stdout);assert.equal(result.stdout,'');assert.equal(JSON.parse(result.stderr).completed,false);assert.equal(await readFile(target,'utf8'),'previous');
    }
    await writeFile(join(root,'.okf-validator.yml'),'spec_version: "0.3"\n');assert.equal(cli(root,'check',bundle).status,2);
    await writeFile(join(root,'.okf-validator.yml'),'exclude: ["../bad"]\n');assert.equal(cli(root,'check',bundle).status,2);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('report output is complete, outside inputs and reports write failures',async()=>{
  const {root,bundle}=await fixture();try{
    const target=join(root,'report.json');const args=['check',bundle,'--format','json','--output',target];const result=cli(root,...args);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'');assert.equal(result.stderr,'');assert.equal(JSON.parse(await readFile(target,'utf8')).completed,true);
    assert.equal(cli(root,'check',bundle,'--output',join(root,'missing','report')).status,2);
    const original=await readFile(join(bundle,'a.md'),'utf8');assert.equal(cli(root,'check',bundle,'--output',join(bundle,'a.md')).status,2);assert.equal(await readFile(join(bundle,'a.md'),'utf8'),original);
    await writeFile(join(root,'.okf-validator.yml'),'{}');assert.equal(cli(root,'check',bundle,'--output',join(root,'.okf-validator.yml')).status,2);assert.equal(await readFile(join(root,'.okf-validator.yml'),'utf8'),'{}');
    const failed=cli(root,'check',bundle,'--fail-on','warning','--format','json','--output',target);assert.equal(failed.status,1);assert.equal(JSON.parse(await readFile(target,'utf8')).exitCode,1);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('cancellation gives operational result and preserves existing reports',async()=>{
  const {root,bundle}=await fixture();try{
    const controller=new AbortController();controller.abort();let stdout='',stderr='';
    const result=await run(['check',bundle,'--format','json'],x=>stdout+=x,x=>stderr+=x,controller.signal);assert.equal(result,2);assert.equal(stdout,'');assert.equal(JSON.parse(stderr).error,'interrupted');
    await assert.rejects(checkBundle(bundle,undefined,controller.signal),{code:'interrupted'});
    const during=new AbortController();const promise=checkBundle(bundle,undefined,during.signal);setImmediate(()=>during.abort());await assert.rejects(promise,{code:'interrupted'});
    const legacy=new AbortController();let legacyOut='',legacyErr='';const inspection=run(['inspect',bundle],text=>{legacyOut+=text;},text=>{legacyErr+=text;},legacy.signal);setImmediate(()=>legacy.abort());assert.equal(await inspection,2);assert.equal(legacyOut,'');assert.equal(JSON.parse(legacyErr).error,'interrupted');
  }finally{await rm(root,{recursive:true,force:true});}
});
test('asynchronous output delivery failure is operational without raw stack',async()=>{
  const {root,bundle}=await fixture();try{let diagnostic='';const result=await run(['check',bundle],async()=>{throw new Error('private stream details');},text=>{diagnostic+=text;});assert.equal(result,2);assert.equal(JSON.parse(diagnostic).completed,false);assert.ok(!diagnostic.includes('private stream details'));}finally{await rm(root,{recursive:true,force:true});}
});
test('report cannot replace configuration through case-insensitive alias',async t=>{
  const {root,bundle}=await fixture();try{const config=join(root,'policy.yml');await writeFile(config,'{}');const alias=join(root,'POLICY.YML');try{await readFile(alias);}catch(error){if(error.code==='ENOENT'){t.skip('Case-sensitive filesystem');return;}throw error;}const result=cli(root,'check',bundle,'--config',config,'--output',alias);assert.equal(result.status,2);assert.equal(await readFile(config,'utf8'),'{}');}finally{await rm(root,{recursive:true,force:true});}
});
test('closed stdout pipe exits operationally without an unhandled error stack',async()=>{
  const {root,bundle}=await fixture();try{
    await writeFile(join(bundle,'a.md'),'---\ntype: X\n---\n'+Array.from({length:2000},(_,i)=>`[link](absent${i}.md)`).join('\n'));
    const child=spawn(process.execPath,[entry,'check',bundle,'--format','json'],{cwd:root,stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
    child.stdout.once('data',()=>child.stdout.destroy());
    const code=await new Promise((done,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('CLI did not finish after pipe closure'));},15000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',code=>{clearTimeout(timer);done(code);});});
    assert.equal(code,2,stderr);assert.equal(JSON.parse(stderr).error,'output-write');assert.ok(!stderr.includes('Error:'));
  }finally{await rm(root,{recursive:true,force:true});}
});

test('CLI executes through linked directories without running when imported',async()=>{
  const {root,bundle}=await fixture();try{
    const alias=join(root,'linked-dist');await symlink(dirname(entry),alias,'junction');
    for(const flags of [[],['--preserve-symlinks-main']])for(const args of [['inspect',bundle],['check',bundle,'--format','json']]){
      const result=spawnSync(process.execPath,[...flags,join(alias,'cli.js'),...args],{cwd:root,encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');assert.equal(JSON.parse(result.stdout).scope.concepts,1);
    }
    const imported=spawnSync(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(new URL('../dist/cli.js',import.meta.url).href)})`],{cwd:root,encoding:'utf8'});
    assert.equal(imported.status,0,imported.stderr);assert.equal(imported.stdout,'');assert.equal(imported.stderr,'');
    const missing=spawnSync(process.execPath,['--input-type=module','-e',`process.argv[1]=${JSON.stringify(join(root,'absent.js'))}; const before=process.listenerCount('SIGINT'); await import(${JSON.stringify(new URL('../dist/cli.js',import.meta.url).href)}); if(process.exitCode!==undefined||process.listenerCount('SIGINT')!==before)throw new Error('Import changed process behavior');`],{cwd:root,encoding:'utf8'});
    assert.equal(missing.status,0,missing.stderr);assert.equal(missing.stdout,'');assert.equal(missing.stderr,'');
  }finally{await rm(root,{recursive:true,force:true});}
});
