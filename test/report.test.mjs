import test from 'node:test';
import assert from 'node:assert/strict';
import {createReport,renderReport} from '../dist/report.js';
import {defaultPolicy} from '../dist/policy.js';
const scope={entries:1,concepts:1,documents:1,totalBytes:1,exclusions:[],excludedEntries:0};
const finding=(ruleId,path,severity='warning',layer='quality')=>({ruleId,path,severity,layer,message:'message',remediation:'fix'});
test('report keeps quality separate at every threshold and severity',()=>{
  for(const failOn of ['error','warning'])for(const severity of ['warning','error']){
    const report=createReport(scope,[finding('Q001','a.md',severity)],{...defaultPolicy(),failOn});assert.equal(report.exitCode,failOn==='warning'||severity==='error'?1:0);assert.equal(report.counts.compliance,0);assert.equal(report.counts.quality,1);assert.equal(report.findings[0].layer,'quality');
    const json=JSON.parse(renderReport(report,'json'));assert.deepEqual(json,report);assert.match(renderReport(report,'text'),new RegExp(`Q001 quality/${severity}`));assert.equal(report.schemaVersion,1);assert.equal(report.completed,true);
  }
});
test('report sorting uses path location ID and stable message/remediation ties',()=>{
  const findings=[finding('Q002','b.md'),{...finding('Q001','a.md'),position:{line:2,column:1}},finding('C001','a.md','error','compliance'),finding('Q002','a.md'),finding('Q001','a.md')];
  const a=createReport(scope,findings,defaultPolicy());const b=createReport(scope,[...findings].reverse(),defaultPolicy());assert.deepEqual(a,b);assert.deepEqual(a.findings.map(x=>x.ruleId),['C001','Q001','Q002','Q001','Q002']);assert.equal(a.exitCode,1);
});
test('text renderer escapes terminal controls without changing JSON source data',()=>{
  const report=createReport(scope,[{...finding('Q001','a.md'),message:'unsafe\u001b[31m\u202e'}],defaultPolicy());assert.ok(!renderReport(report,'text').includes('\u001b'));assert.match(renderReport(report,'text'),/\\u001b/);assert.equal(JSON.parse(renderReport(report,'json')).findings[0].message,report.findings[0].message);
});
test('missing-target provenance sorts deterministically and renders safe source locations',()=>{
  const missing=[{...finding('Q002','missing.md'),source:{path:'z.md',position:{line:9,column:1}}},{...finding('Q002','missing.md'),source:{path:'a\u001b.md',position:{line:3,column:2}}}];
  const a=createReport(scope,missing,defaultPolicy());const b=createReport(scope,[...missing].reverse(),defaultPolicy());assert.deepEqual(a,b);assert.equal(a.findings.length,2);assert.equal(a.findings[0].source.path,'a\u001b.md');const text=renderReport(a,'text');assert.match(text,/referenced from a\\u001b\.md:3:2/);assert.ok(!text.includes('\u001b'));
});
