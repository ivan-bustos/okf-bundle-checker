import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {useColor,run} from '../dist/cli.js';
const entry=resolve('dist/cli.js');
const ansi=/\u001b\[[0-9;]*m/g;
async function fixture(t){const cwd=await mkdtemp(join(tmpdir(),'okf-color-'));t.after(()=>rm(cwd,{recursive:true,force:true}));const bundle=join(cwd,'bundle');await mkdir(bundle);await writeFile(join(bundle,'a.md'),'---\ntype: Custom\n---\n');return {cwd,bundle};}
function invoke(input,args=[],env={}){return spawnSync(process.execPath,[entry,'check',input.bundle,...args],{cwd:input.cwd,encoding:'utf8',env:{...process.env,TERM:'xterm',NO_COLOR:'',...env}});}
test('color auto honors destination, terminal capabilities and NO_COLOR; explicit choice wins',()=>{
 for(const tty of [false,true])for(const file of [false,true])for(const term of [undefined,'dumb','xterm'])for(const noColor of [undefined,'','1','0']){
  const env={TERM:term,NO_COLOR:noColor};assert.equal(useColor('auto',tty,env,file),tty&&!file&&term!=='dumb'&&!noColor);
  assert.equal(useColor('always',tty,env,file),true);assert.equal(useColor('never',tty,env,file),false);
 }
});
test('redirected CLI text is plain by default and explicit ANSI changes no findings or status',async t=>{
 const input=await fixture(t);const plain=invoke(input);const forced=invoke(input,['--color','always'],{NO_COLOR:'1'});const never=invoke(input,['--color','never']);
 assert.equal(plain.status,0,plain.stderr);assert.equal(forced.status,plain.status);assert.equal(forced.stderr,'');assert.equal(never.stdout,plain.stdout);assert.ok(!plain.stdout.includes('\u001b'));assert.ok(forced.stdout.includes('\u001b['));assert.equal(forced.stdout.replace(ansi,''),plain.stdout);
 assert.equal(invoke(input,['--color','always','--fail-on','warning']).status,1);
});
test('JSON output and operational diagnostics never acquire ANSI, even with explicit color',async t=>{
 const input=await fixture(t);const plain=invoke(input,['--format','json']);const forced=invoke(input,['--format','json','--color','always']);assert.equal(forced.stdout,plain.stdout);assert.ok(!forced.stdout.includes('\u001b'));assert.equal(JSON.parse(forced.stdout).schemaVersion,1);
 for(const args of [['--color','invalid'],['--color'],['--color','auto','--color','never']]){const result=invoke(input,args);assert.equal(result.status,2);assert.equal(result.stdout,'');assert.equal(JSON.parse(result.stderr).error,'usage');assert.ok(!result.stderr.includes('\u001b'));}
});
test('injected interactive output colors automatically while file output remains plain',async t=>{
 const input=await fixture(t);let stdout='',stderr='';const options={isTTY:true,env:{TERM:'xterm'}};
 const execute=async(args,presentation=options)=>{stdout='';stderr='';return run(['check',input.bundle,...args],x=>{stdout+=x;},x=>{stderr+=x;},undefined,presentation);};
 assert.equal(await execute([]),0,stderr);assert.ok(stdout.includes('\u001b['));const colored=stdout;
 assert.equal(await execute([], {isTTY:true,env:{TERM:'xterm',NO_COLOR:'1'}}),0);assert.equal(stdout,colored.replace(ansi,''));const plain=stdout;
 const output=join(input.cwd,'report.txt');assert.equal(await execute(['--output',output]),0);assert.equal(stdout,'');assert.equal(await readFile(output,'utf8'),plain);
 assert.equal(await execute(['--output',output,'--color','always']),0);assert.equal(await readFile(output,'utf8'),colored);
 assert.equal(await execute(['--output',output,'--format','json','--color','always']),0);assert.ok(!((await readFile(output,'utf8')).includes('\u001b')));assert.equal(JSON.parse(await readFile(output,'utf8')).completed,true);
});
