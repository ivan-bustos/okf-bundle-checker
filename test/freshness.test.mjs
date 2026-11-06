import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {stringify} from 'yaml';
import {checkBundle,defaultPolicy,parseConfig,parseDocument,renderReport} from '../dist/index.js';
import {checkMetadata} from '../dist/metadata-quality.js';
import {parseTimestamp} from '../dist/timestamp.js';

const reference='2026-06-30T14:00:00Z';
const document=(metadata={},path='concept.md')=>parseDocument(path,new TextEncoder().encode(`---\n${stringify({type:'Custom',description:'Synthetic freshness example.',...metadata})}---\n`));
const policy=(severity='warning')=>({...defaultPolicy(),rules:{...defaultPolicy().rules,Q010:severity}});
const check=(stale_after,now=reference,severity='warning')=>checkMetadata(document({stale_after}),policy(severity).rules,parseTimestamp(now));
const freshness=report=>report.findings.filter(item=>item.ruleId==='Q010');
const cli=(...args)=>spawnSync(process.execPath,[resolve('dist/cli.js'),...args],{encoding:'utf8'});
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'okf freshness '));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const bundle=join(root,'bundle');await mkdir(bundle);
  await writeFile(join(bundle,'concept.md'),`---\ntype: Custom\ndescription: Synthetic freshness example.\nstale_after: '${reference}'\n---\n`);
  await writeFile(join(bundle,'index.md'),'# Index\n\n- [Concept](concept.md) - Synthetic freshness example.\n');
  const config=join(root,'policy.yml');await writeFile(config,'rules: {Q010: error}\n');
  return {root,bundle,config};
}

test('Q010 is opt-in and existing quality defaults and Q008 stay unchanged',()=>{
  const base=defaultPolicy();assert.equal(base.rules.Q010,'off');
  for(const [id,severity] of Object.entries(base.rules))if(id!=='Q010')assert.equal(severity,'warning');
  assert.deepEqual(check(reference,reference,'off'),[]);
  assert.deepEqual(checkMetadata(document({stale_after:reference}),base.rules),[]);
  const legacy={...base.rules};delete legacy.Q010;
  assert.deepEqual(checkMetadata(document({stale_after:reference}),legacy,parseTimestamp(reference)),[]);
  for(const severity of ['off','warning','error'])assert.equal(parseConfig(Buffer.from(`rules: {Q010: ${severity}}`)).rules.Q010,severity);
  assert.equal(parseConfig(Buffer.from('rules: {Q008: error}')).rules.Q010,'off');
  const syntaxOnly=checkMetadata(document({stale_after:'1900-01-01T00:00:00Z'}),{...base.rules,Q008:'error'},parseTimestamp(reference));
  assert.deepEqual(syntaxOnly,[]);
});

test('Q010 flags the exact deadline and past instants, never a future instant',()=>{
  for(const now of ['2026-06-30T13:59:59.999999999Z','2026-06-30T13:59:59Z'])assert.deepEqual(check(reference,now),[]);
  for(const now of [reference,'2026-06-30T14:00:00.000000001Z','2026-07-01T00:00:00Z'])assert.equal(check(reference,now).length,1);
  const item=check(reference)[0];
  assert.equal(item.ruleId,'Q010');assert.equal(item.layer,'quality');assert.equal(item.severity,'warning');
  assert.deepEqual(item.position,document({stale_after:reference}).frontmatter.positions.stale_after);
  assert.match(item.message,/stale_after.*§5\.5/);assert.match(item.remediation,/Review and refresh/);
});

test('equivalent offsets and all accepted ISO calendar/time forms compare by instant',()=>{
  const equivalent=[reference,'20260630T140000Z','2026-06-30T140000Z','20260630T14:00:00Z','2026-06-30T14:00Z','20260630T1400Z','2026-06-30T14:00:00.0000Z','2026-06-30T19:30:00+05:30','20260630T193000+0530','2026-06-30T19:00:00+05','2026-06-30T07:00:00-07:00','2026-06-30T07:00:00-0700','2026-06-30T07:00:00-07','2026-06-30T14:00:00-00:00','2026-07-01T13:59:00+23:59','2026-06-29T14:01:00-23:59'];
  for(const value of equivalent){
    assert.equal(check(value).length,1,value);
    assert.equal(check(reference,value).length,1,value);
    assert.deepEqual(check(value,'2026-06-30T13:59:59.999Z'),[],value);
  }
  assert.deepEqual(check('2026-06-30T14:00:00+00:01'),check('2026-06-30T13:59:00Z'));
  assert.deepEqual(check('2026-06-30T14:00:00-00:01'),[]);
});

test('fractional seconds retain exact precision and accept commas without premature staleness',()=>{
  assert.deepEqual(check('2026-06-30T14:00:00.0000000000000000001Z'),[]);
  for(const suffix of ['.123456Z',',123456+00','.1234560000000000000Z']){
    const deadline=`2026-06-30T14:00:00${suffix}`;
    assert.deepEqual(check(deadline,'2026-06-30T14:00:00.123455999999Z'),[]);
    assert.equal(check(deadline,'2026-06-30T14:00:00.123456Z').length,1);
  }
  assert.deepEqual(check('2026-06-30T14:00:00.01Z','2026-06-30T14:00:00.001Z'),[]);
  assert.equal(check('2026-06-30T14:00:00,5+05','2026-06-30T09:00:00.500Z').length,1);
});

test('calendar limits, early years, 24:00 and accepted second 60 use documented POSIX rollover',()=>{
  for(const [deadline,now] of [
    ['2026-06-30T24:00:00Z','2026-07-01T00:00:00Z'],
    ['2026-06-30T24:00Z','2026-07-01T00:00:00Z'],
    ['20261231T240000,000Z','2027-01-01T00:00:00Z'],
    ['2016-12-31T23:59:60Z','2017-01-01T00:00:00Z'],
    ['2016-12-31T23:59:60.5Z','2017-01-01T00:00:00.5Z'],
    ['2026-06-30T14:30:60Z','2026-06-30T14:31:00Z'],
    ['0000-02-29T00:00:00Z','0000-02-29T00:00:00Z'],
    ['0099-12-31T24:00Z','0100-01-01T00:00:00Z'],
    ['9999-12-31T23:59:59Z','9999-12-31T23:59:59Z'],
    ['9999-12-31T24:00Z','9999-12-31T23:00-01'],
    ['0000-01-01T00:00+02','0000-01-01T01:00+03'],
  ])assert.equal(check(deadline,now).length,1,deadline);
  assert.deepEqual(check('1969-12-31T23:59:59.5001Z','1969-12-31T23:59:59.5Z'),[]);
  assert.deepEqual(check('0100-01-01T00:00:00Z','0099-12-31T23:59:59Z'),[]);
  assert.deepEqual(check('2016-12-31T23:59:60Z','2016-12-31T23:59:59.999Z'),[]);
  assert.deepEqual(check('2000-02-29T00:00:00Z','2000-02-28T23:59:59Z'),[]);
});

test('missing/malformed deadlines stay solely with Q008, including when Q008 is off',()=>{
  assert.deepEqual(checkMetadata(document(),policy().rules,parseTimestamp(reference)),[]);
  assert.deepEqual(checkMetadata(document({stale_after:reference}),{...policy().rules,Q008:'off'},parseTimestamp(reference)).map(item=>item.ruleId),['Q010']);
  const invalid=[null,false,2026,{},[], '', 'yesterday','2026-06-30','2026-06-30T14:00:00','2026-06-30t14:00:00z','2026-04-31T00:00:00Z','1900-02-29T00:00:00Z','2026-06-30T24:00:00.1Z','2026-06-30T14:00:61Z','2026-06-30T14:00:00+24','2026-06-30T14:00:00+00:60'];
  for(const stale_after of invalid){
    assert.deepEqual(check(stale_after).map(item=>item.ruleId),['Q008'],JSON.stringify(stale_after));
    assert.deepEqual(checkMetadata(document({stale_after}),{...policy().rules,Q008:'off'},parseTimestamp(reference)),[]);
  }
});

test('freshness applies regardless of status, never to reserved or unparseable documents',()=>{
  for(const status of [undefined,'draft','stable','deprecated']){
    const metadata={stale_after:reference,...(status===undefined?{}:{status})};
    const doc=document(metadata);const before=JSON.stringify(doc);
    assert.equal(checkMetadata(doc,policy().rules,parseTimestamp(reference)).length,1);
    assert.equal(JSON.stringify(doc),before);
  }
  for(const path of ['index.md','sub/index.md','log.md'])assert.deepEqual(checkMetadata(document({stale_after:reference},path),policy().rules,parseTimestamp(reference)),[]);
  for(const source of ['text','---\n- sequence\n---','---\nstale_after: [\n---'])assert.deepEqual(checkMetadata(parseDocument('concept.md',Buffer.from(source)),policy().rules,parseTimestamp(reference)),[]);
});

test('engine API fixed clock, severity, threshold and reports remain reproducible',async t=>{
  const {bundle}=await fixture(t);
  const normal=await checkBundle(bundle,defaultPolicy(),undefined,{now:reference});
  assert.deepEqual(normal.findings,[]);assert.equal(normal.exitCode,0);assert.equal('freshness' in normal,false);
  for(const severity of ['warning','error'])for(const failOn of ['warning','error']){
    const p={...policy(severity),failOn};
    const report=await checkBundle(bundle,p,undefined,{now:reference});
    assert.equal(report.exitCode,severity==='error'||failOn==='warning'?1:0);
    assert.equal(report.counts.compliance,0);assert.equal(freshness(report)[0].severity,severity);
    assert.deepEqual(report.freshness,{evaluatedAt:reference});
    assert.deepEqual(await checkBundle(bundle,p,undefined,{now:reference}),report);
    assert.match(renderReport(report,'text'),/Freshness evaluated at: 2026-06-30T14:00:00Z/);
  }
  await assert.rejects(checkBundle(bundle,policy(),undefined,{now:'bad'}),{code:'invalid-clock'});
  await assert.rejects(checkBundle(bundle,defaultPolicy(),undefined,{now:'2026-06-30'}),{code:'invalid-clock'});
  const controller=new AbortController();controller.abort();
  await assert.rejects(checkBundle(bundle,policy(),controller.signal,{now:reference}),{code:'interrupted'});
});

test('one live reference instant is sampled at the beginning of the bundle check',async t=>{
  const {bundle}=await fixture(t);
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-06-30T13:59:59Z').getTime()});
  const pending=checkBundle(bundle,policy());
  t.mock.timers.tick(2000);
  const report=await pending;
  assert.deepEqual(freshness(report),[]);
  assert.deepEqual(report.freshness,{evaluatedAt:'2026-06-30T13:59:59.000Z'});
  assert.equal(freshness(await checkBundle(bundle,policy())).length,1);
});

test('CLI fixed-clock gate accepts ISO alternatives, handles boundaries and rejects invalid clocks safely',async t=>{
  const {root,bundle,config}=await fixture(t);
  for(const [now,exit] of [['20260630T135959Z',0],['2026-06-30T19:30+05:30',1],['2026-06-30T14:00:00.0000001Z',1]]){
    const result=cli(bundle,'--config',config,'--format','json','--now',now);
    assert.equal(result.status,exit,result.stderr);assert.equal(result.stderr,'');
    const report=JSON.parse(result.stdout);assert.equal(report.exitCode,exit);assert.equal(report.counts.compliance,0);
    assert.deepEqual(report.freshness,{evaluatedAt:now});
  }
  const target=join(root,'report.json');await writeFile(target,'previous report');
  for(const args of [['--now','tomorrow'],['--now','2026-06-30'],['--now','2026-06-30T14:00:00'],['--now',reference,'--now',reference],['--now']]){
    const result=cli(bundle,'--config',config,'--output',target,...args);
    assert.equal(result.status,2);assert.equal(result.stdout,'');assert.equal(JSON.parse(result.stderr).completed,false);
    assert.equal(await readFile(target,'utf8'),'previous report');
  }
  const disabled=join(root,'disabled.yml');await writeFile(disabled,'{}');
  const invalidDisabled=cli(bundle,'--config',disabled,'--now','invalid');
  assert.equal(invalidDisabled.status,2);assert.equal(JSON.parse(invalidDisabled.stderr).error,'invalid-clock');
  const inspect=cli('inspect',bundle);assert.equal(inspect.status,0);assert.deepEqual(JSON.parse(inspect.stdout).findings,[]);
  const help=cli('--help');assert.match(help.stdout,/--now/);assert.match(help.stdout,/Q010 is opt-in/);
});
