import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {checkBundle,defaultPolicy,parseDocument,checkCompliance,resolvePathField,inspectCompliance,parseConfig} from '../dist/index.js';
import {parseTimestamp,atOrAfter} from '../dist/timestamp.js';
const parse=(text,path='item.md',version='0.3')=>parseDocument(path,Buffer.from(text),version);
const concept=(extra='',body='')=>`---\ntype: Reference\ndescription: Example\n${extra}\n---\n${body}`;
async function bundle(t,files){const root=await mkdtemp(join(tmpdir(),'okf-v03-'));t.after(()=>rm(root,{recursive:true,force:true}));for(const [path,text] of Object.entries(files)){await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),text);}return root;}
const rootIndex=version=>`---\nokf_version: '${version}'\n---\n`;
const quiet=()=>{const p=defaultPolicy();for(const id of Object.keys(p.rules))p.rules[id]='off';return p;};
test('v0.3 untyped documents differ from legacy compliance and quality scope',async t=>{
 const files={'index.md':rootIndex('0.3'),'README.md':'# Readme\n[broken](missing.md)','docs/guide.md':'---\ntitle: Guide\n---\n[broken](absent.md)','item.md':concept()};
 const root=await bundle(t,files);const report=await checkBundle(root);
 assert.equal(report.specVersion,'0.3');assert.equal(report.scope.concepts,1);assert.equal(report.counts.compliance,0);assert.equal(report.exitCode,0);
 assert.deepEqual(report.findings.filter(x=>x.ruleId==='W120').map(x=>x.path),['README.md','docs/guide.md']);
 assert.ok(!report.findings.some(x=>x.ruleId==='Q002'||x.path==='docs/index.md'||(x.ruleId==='Q004'&&/README|docs/.test(x.message))));
 assert.equal((await inspectCompliance(root)).scope.concepts,1);assert.equal((await inspectCompliance(root)).specVersion,'0.3');
 await writeFile(join(root,'index.md'),rootIndex('0.2'));const legacy=await checkBundle(root);
 assert.equal(legacy.scope.concepts,3);assert.deepEqual(legacy.findings.filter(x=>x.layer==='compliance').map(x=>x.ruleId),['C001','C002']);assert.equal(legacy.exitCode,1);
 await writeFile(join(root,'index.md'),'# Index');assert.equal((await checkBundle(root)).specVersion,'0.2');
 const configured={...quiet(),specVersion:'0.3'};assert.equal((await checkBundle(root,configured)).scope.concepts,1);
});
test('W120 is advisory but participates in warning threshold; adding type changes scope',async t=>{
 const root=await bundle(t,{'index.md':rootIndex('0.3'),'README.md':'Notes'});let p=quiet();
 assert.equal((await checkBundle(root,p)).exitCode,0);p.failOn='warning';assert.equal((await checkBundle(root,p)).exitCode,1);
 await writeFile(join(root,'README.md'),concept());const result=await checkBundle(root,p);assert.equal(result.scope.concepts,1);assert.equal(result.findings.length,0);
});
test('v0.3 root metadata/extensions, nested index and log rules',()=>{
 const root=parse('---\nokf_version: "0.3"\ntitle: Bundle\ndescription: Scope\nlicense: MIT\nx-owner: {name: A}\n---','index.md');assert.deepEqual(checkCompliance(root,'0.3'),[]);
 assert.deepEqual(checkCompliance(parse('---\ntitle: Bundle\n---','index.md'),'0.3'),[]);
 assert.equal(checkCompliance(parse('---\ntitle: Nested\n---','nested/index.md'),'0.3')[0].ruleId,'C003');
 assert.equal(checkCompliance(parse('---\ntitle: Log\n---','log.md'),'0.3')[0].ruleId,'C003');
 assert.deepEqual(checkCompliance(parse('---\ntitle: Log\n---','log.md','0.2')),[]);
 for(const text of ['---\n- item\n---','---\ntitle: [\n---','---\ntitle: a\ntitle: b\n---']) assert.equal(checkCompliance(parse(text),'0.3')[0].ruleId,'C001');
 for(const type of ['null','""','[]','" "']) assert.equal(parse(`---\ntype: ${type}\n---`).kind,'other');
 assert.equal(checkCompliance(parse('---\ntype: 42\n---'),'0.3')[0].ruleId,'C002');
});
test('dispatch rejects unsupported declarations even when root has extension keys',async t=>{
 const root=await bundle(t,{'index.md':'---\nokf_version: "9.9"\ntitle: Bundle\n---'});
 await assert.rejects(checkBundle(root),{code:'unsupported-version'});
 assert.equal(parseConfig(Buffer.from('spec_version: "0.3"')).specVersion,'0.3');
 await writeFile(join(root,'index.md'),rootIndex('0.2'));await writeFile(join(root,'item.md'),concept());assert.equal((await checkBundle(root,{...quiet(),specVersion:'0.3'})).specVersion,'0.2');
});
test('RFC3339 dates, offsets, precision and rejected legacy-only forms',()=>{
 for(const value of ['2024-02-29','2026-06-30T14:00:00Z','2026-06-30t14:00:00z','2026-06-30T19:30:00+05:30'])assert.ok(parseTimestamp(value,'0.3'),value);
 for(const value of ['2025-02-29','2026-06-31','20260630T140000Z','2026-06-30T14:00Z','2026-06-30T24:00:00Z','2026-06-30T14:00:00+0530','2026-06-30T14:00:00,5Z'])assert.equal(parseTimestamp(value,'0.3'),undefined,value);
 assert.ok(parseTimestamp('20260630T140000Z'));assert.equal(parseTimestamp('2026-06-30'),undefined);
 assert.deepEqual(parseTimestamp('2026-06-30T19:30:00+05:30','0.3'),parseTimestamp('2026-06-30T14:00:00Z','0.3'));
 assert.ok(!atOrAfter(parseTimestamp('2026-06-30T00:00:00.000000001Z','0.3'),parseTimestamp('2026-06-30T00:00:00.000000002Z','0.3')));
});
test('v0.3 single-item families, empty values, native timestamps and arbitrary actor schemes',async t=>{
 const root=await bundle(t,{'index.md':rootIndex('0.3'),'item.md':concept('sources: {resource: https://example.com, last_modified: 2026-06-30}\ngenerated: {by: "custom:agent", at: !!timestamp 2026-06-30}\nverified: {by: "other:opaque id", at: "2026-06-30T01:00:00+01:00"}\nstatus: null\nstale_after: ""')});
 const report=await checkBundle(root);assert.ok(!report.findings.some(x=>['Q006','Q007','Q008'].includes(x.ruleId)));
 assert.throws(()=>checkCompliance(parse('---\ntype: X\nat: !!timestamp 2026-06-30\n---','item.md','0.2')),{code:'parser-limit'});
});
test('freshness fails closed independently of Q008, date-only is midnight UTC, null is absent',async t=>{
 const root=await bundle(t,{'index.md':rootIndex('0.3'),'bad.md':concept('stale_after: nonsense'),'due.md':concept('stale_after: 2026-06-30'),'empty.md':concept('stale_after: null')});const p=quiet();p.rules.Q010='error';
 const report=await checkBundle(root,p,undefined,{now:'2026-06-30T00:00:00Z'});assert.equal(report.exitCode,1);assert.deepEqual(report.findings.map(x=>x.path),['bad.md','due.md']);
});
test('v0.3 runtime requirement, parameter default and fenced computation at any heading level',async t=>{
 const root=await bundle(t,{'index.md':rootIndex('0.3'),'item.md':'---\ntype: Attested Computation\nruntime: custom\nparameters: {name: year, type: custom}\n---\n## Computation\n```sql\nSELECT 1\n```\n## Next\n```sql\nSELECT 2\n```'});const p=quiet();p.rules.Q009='warning';assert.deepEqual((await checkBundle(root,p)).findings,[]);
 await writeFile(join(root,'item.md'),'---\ntype: Attested Computation\n---');const missing=await checkBundle(root,p);assert.equal(missing.counts.compliance,0);assert.ok(missing.findings.some(x=>x.message.startsWith('runtime')));
});
test('path fields resolve relative-first with fallback restricted to legacy and no outside reads',()=>{
 const entries=[{path:'target.md',kind:'markdown'},{path:'nested/target.md',kind:'markdown'},{path:'root-only.md',kind:'markdown'},{path:'nested/space name.md',kind:'markdown'}];
 for(const v of ['0.2','0.3'])assert.equal(resolvePathField('nested/a.md','target.md',entries,v).path,'nested/target.md');
 assert.equal(resolvePathField('nested/a.md','root-only.md',entries,'0.3').kind,'missing');assert.equal(resolvePathField('nested/a.md','root-only.md',entries,'0.2').path,'root-only.md');
 assert.equal(resolvePathField('nested/a.md','/root-only.md',entries,'0.3').kind,'resolved');assert.equal(resolvePathField('nested/a.md','space%20name.md',entries,'0.3').kind,'resolved');
 assert.equal(resolvePathField('nested/a.md','../../secret',entries,'0.3').kind,'unsafe');assert.equal(resolvePathField('nested/a.md','custom:thing',entries,'0.3').kind,'external');
});
test('v0.3 CLI preserves exit 0/1/2 and report identity',async t=>{
 const root=await bundle(t,{'index.md':rootIndex('0.3'),'README.md':'Notes'});const run=(...args)=>spawnSync(process.execPath,['dist/cli.js','check',root,'--format','json',...args],{encoding:'utf8'});
 const ok=run();assert.equal(ok.status,0);assert.equal(JSON.parse(ok.stdout).specVersion,'0.3');assert.equal(JSON.parse(ok.stdout).tool.version,JSON.parse(await readFile('package.json','utf8')).version);
 assert.equal(run('--fail-on','warning').status,1);await writeFile(join(root,'index.md'),rootIndex('0.4'));assert.equal(run().status,2);
});

test('v0.3 reserved-only scope is valid, and inspect CLI reports the selected version',async t=>{
 const root=await bundle(t,{'index.md':rootIndex('0.3')});assert.equal((await checkBundle(root)).scope.concepts,0);
 const result=spawnSync(process.execPath,['dist/cli.js','inspect',root],{encoding:'utf8'});assert.equal(result.status,0);assert.equal(JSON.parse(result.stdout).specVersion,'0.3');
});

test('v0.3 computation accepts nested fences and requires an ATX opening heading',async t=>{
 const root=await bundle(t,{'index.md':rootIndex('0.3'),'item.md':''});const p=quiet();p.rules.Q009='warning';
 const check=async body=>{await writeFile(join(root,'item.md'),'---\ntype: Attested Computation\nruntime: sql\n---\n'+body);return (await checkBundle(root,p)).findings;};
 for(const body of ['## Computation\n- ```sql\n  SELECT 1\n  ```','## Computation\n> ```sql\n> SELECT 1\n> ```','  ## Computation\n  ```sql\nSELECT 1\n  ```','## Computation\n### Detail\n```sql\nSELECT 1\n```'])assert.deepEqual(await check(body),[],body);
 for(const body of ['Computation\n-----------\n```sql\nSELECT 1\n```','Computation\n===========\n```sql\nSELECT 1\n```','## Computation\n    ```sql\n    SELECT 1\n    ```','## Computation\n## Next\n```sql\nSELECT 1\n```','## Computation\nNext\n----\n```sql\nSELECT 1\n```'])assert.ok((await check(body)).some(x=>x.message.startsWith('body.# Computation')),body);
 await writeFile(join(root,'index.md'),rootIndex('0.2'));assert.deepEqual(await check('Computation\n===========\n```sql\nSELECT 1\n```'),[],'legacy Setext behavior remains');
});
test('excluded root metadata still selects the version without entering rule scope',async t=>{
 const root=await bundle(t,{'index.md':rootIndex('0.3')+'[broken](absent.md)','README.md':'Notes','hidden/bad.md':'---\na: ['});
 const p=defaultPolicy();p.exclusions=['index.md','hidden/**'];
 const report=await checkBundle(root,p);assert.equal(report.specVersion,'0.3');assert.equal(report.scope.documents,1);assert.equal(report.scope.entries,1);assert.equal(report.scope.excludedEntries,2);assert.deepEqual(report.findings.map(x=>x.ruleId),['W120']);
 assert.equal(report.scope.totalBytes,Buffer.byteLength(rootIndex('0.3')+'[broken](absent.md)Notes'));
 assert.equal((await inspectCompliance(root,{exclusions:p.exclusions})).specVersion,'0.3');
 await writeFile(join(root,'index.md'),rootIndex('0.2'));p.specVersion='0.3';const legacy=await checkBundle(root,p);assert.equal(legacy.specVersion,'0.2');assert.ok(legacy.findings.some(x=>x.ruleId==='C001'));
 await writeFile(join(root,'index.md'),rootIndex('0.4'));await assert.rejects(checkBundle(root,p),{code:'unsupported-version'});await assert.rejects(inspectCompliance(root,{exclusions:p.exclusions}),{code:'unsupported-version'});
});
test('excluded version metadata stays bounded and malformed input fails closed',async t=>{
 const root=await bundle(t,{'index.md':rootIndex('0.3'),'README.md':'Notes'});
 await assert.rejects(inspectCompliance(root,{exclusions:['index.md'],limits:{maxDocumentBytes:8}}),{code:'document-limit'});
 await assert.rejects(inspectCompliance(root,{exclusions:['index.md'],limits:{maxTotalBytes:8}}),{code:'byte-limit'});
 await writeFile(join(root,'index.md'),'---\nokf_version: [\n---');await assert.rejects(inspectCompliance(root,{exclusions:['index.md']}),{code:'invalid-version-metadata'});
});
test('excluded root index symlink is refused without reading its target',async t=>{
 const {symlink}=await import('node:fs/promises');const root=await bundle(t,{'README.md':'Notes'});const outside=await bundle(t,{'target.md':rootIndex('0.3')});
 try{await symlink(join(outside,'target.md'),join(root,'index.md'));}catch(error){if(['EPERM','EACCES','ENOSYS'].includes(error.code)){t.skip('Symlink creation unavailable');return;}throw error;}
 await assert.rejects(inspectCompliance(root,{exclusions:['index.md']}),{code:'symlink'});
});
test('an excluded directory named index.md is never traversed for metadata',async t=>{
 const root=await bundle(t,{'index.md/bad.md':'---\na: [','item.md':concept()});const result=await inspectCompliance(root,{exclusions:['index.md']});assert.equal(result.specVersion,'0.2');assert.equal(result.scope.documents,1);assert.deepEqual(result.findings,[]);
});
