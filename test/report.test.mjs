import test from 'node:test';
import assert from 'node:assert/strict';
import {stripVTControlCharacters} from 'node:util';
import {createReport,renderReport,safeText} from '../dist/report.js';
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
  const a=createReport(scope,missing,defaultPolicy());const b=createReport(scope,[...missing].reverse(),defaultPolicy());assert.deepEqual(a,b);assert.equal(a.findings.length,2);assert.equal(a.findings[0].source.path,'a\u001b.md');const text=renderReport(a,'text');assert.match(text,/Referenced from: a\\u001b\.md:3:2/);assert.ok(!text.includes('\u001b'));
});

test('text has a counted rule overview, error-first sections and one header per path per severity',()=>{
  const report=createReport(scope,[
    {...finding('Q002','a.md'),message:'Unresolved link',remediation:'Restore target',source:{path:'index.md',position:{line:8,column:3}}},
    {...finding('C002','z.md','error','compliance'),position:{line:4,column:2},message:'Missing type',remediation:'Add type'},
    {...finding('Q001','a.md'),position:{line:9,column:1},message:'Missing title',remediation:'Add title'},
    {...finding('Q002','a.md'),message:'Another unresolved link',remediation:'Correct target',source:{path:'notes.md'}},
    {...finding('C001','b.md','error','compliance'),message:'Invalid mapping',remediation:'Use mapping'},
  ],defaultPolicy());
  const text=renderReport(report,'text');
  assert.equal(text,[
    'OKF 0.2 | completed | 1 concepts | fail on error',
    'Findings: 2 errors, 3 warnings (2 compliance, 3 quality)',
    'Scope: 1 entries, 1 documents, 1 bytes; 0 encountered entries excluded',
    'Exclusions: (none)',
    '',
    'Rule counts:',
    '  C001 compliance/error: 1 finding',
    '  C002 compliance/error: 1 finding',
    '  Q001 quality/warning: 1 finding',
    '  Q002 quality/warning: 2 findings',
    '',
    'Errors (2)',
    '----------',
    '',
    'Path: b.md (1 finding)',
    '  C001 compliance/error | Position: not specified',
    '    Message: Invalid mapping',
    '    Fix: Use mapping',
    '',
    'Path: z.md (1 finding)',
    '  C002 compliance/error | Position: line 4, column 2',
    '    Message: Missing type',
    '    Fix: Add type',
    '',
    'Warnings (3)',
    '------------',
    '',
    'Path: a.md (3 findings)',
    '  Q002 quality/warning | Position: not specified',
    '    Referenced from: notes.md',
    '    Message: Another unresolved link',
    '    Fix: Correct target',
    '',
    '  Q002 quality/warning | Position: not specified',
    '    Referenced from: index.md:8:3',
    '    Message: Unresolved link',
    '    Fix: Restore target',
    '',
    '  Q001 quality/warning | Position: line 9, column 1',
    '    Message: Missing title',
    '    Fix: Add title',
    '',
    'Result: threshold reached',
    '',
  ].join('\n'));
  assert.ok(text.indexOf('Path: z.md')<text.indexOf('Path: a.md'));
  assert.equal((text.match(/^Path: a\.md/gm)??[]).length,1);
});

test('quality errors remain quality and a path may appear once in each severity section',()=>{
  const report=createReport(scope,[finding('Q002','same.md'),finding('Q002','same.md','error')],defaultPolicy());
  const text=renderReport(report,'text');
  assert.match(text,/Findings: 1 errors, 1 warnings \(0 compliance, 2 quality\)/);
  assert.match(text,/Rule counts:\n  Q002 quality\/error: 1 finding\n  Q002 quality\/warning: 1 finding/);
  assert.equal((text.match(/^Path: same\.md \(1 finding\)$/gm)??[]).length,2);
  assert.match(text,/Errors \(1\)[\s\S]*Q002 quality\/error \| Position: not specified[\s\S]*Warnings \(1\)[\s\S]*Q002 quality\/warning \| Position: not specified/);
});

test('empty report says no findings without adding empty severity sections',()=>{
  const report=createReport(scope,[],defaultPolicy());
  const text=renderReport(report,'text');
  assert.match(text,/Findings: 0 errors, 0 warnings \(0 compliance, 0 quality\)/);
  assert.match(text,/Rule counts:\n  \(none\)\n\nNo findings\.\n\nResult: below threshold\n$/);
  assert.doesNotMatch(text,/^(Errors|Warnings) \(/m);
  assert.equal(report.exitCode,0);
});

test('default and disabled color are identical; opt-in styling only adds trusted ANSI',()=>{
  const report=createReport(scope,[finding('C001','error.md','error','compliance'),finding('Q002','warning.md')],defaultPolicy());
  const plain=renderReport(report,'text');
  const color=renderReport(report,'text',{color:true});
  assert.equal(renderReport(report,'text',{color:false}),plain);
  assert.equal(renderReport(report,'text',{}),plain);
  assert.doesNotMatch(plain,/\u001b/);
  assert.match(color,/\u001b\[31m/);
  assert.match(color,/\u001b\[33m/);
  assert.equal(stripVTControlCharacters(color),plain);
  assert.doesNotMatch(color.replace(/\u001b\[(?:0|1|31|33|36)m/g,''),/\u001b/);
});

test('safe text escapes control, bidi and line separators but preserves printable Unicode',()=>{
  const controls=Array.from({length:32},(_,index)=>String.fromCharCode(index)).join('')+
    Array.from({length:33},(_,index)=>String.fromCharCode(index+127)).join('')+
    '\u061c\u200e\u200f\u2028\u2029\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069';
  const escaped=[...controls].map(char=>`\\u${char.charCodeAt(0).toString(16).padStart(4,'0')}`).join('');
  assert.equal(safeText(controls),escaped);
  assert.equal(safeText('Café/日本語.md'), 'Café/日本語.md');
});

test('every source text field is escaped before styling and cannot forge a new finding or heading',()=>{
  const attack='\u001b]8;;https://invalid.example\u0007\u001b[31m\r\nErrors (999)\u2028\u2029\u061c\u200e\u200f\u202e\u2066';
  const escaped=safeText(attack);
  const report=createReport({...scope,exclusions:[`exclude${attack}`]},[{
    ...finding(`Q002${attack}`,`target${attack}.md`),
    message:`message${attack}`,
    remediation:`fix${attack}`,
    source:{path:`source${attack}.md`,position:{line:8,column:2}},
  }],defaultPolicy());
  const plain=renderReport(report,'text');
  const color=renderReport(report,'text',{color:true});
  for(const expected of [
    `Exclusions: exclude${escaped}`,
    `Path: target${escaped}.md (1 finding)`,
    `Q002${escaped} quality/warning`,
    `Referenced from: source${escaped}.md:8:2`,
    `Message: message${escaped}`,
    `Fix: fix${escaped}`,
  ]) assert.ok(plain.includes(expected),`Missing escaped field: ${expected}`);
  assert.doesNotMatch(plain,/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/);
  assert.doesNotMatch(plain,/^Errors \(999\)$/m);
  assert.equal(stripVTControlCharacters(color),plain);
  assert.equal(renderReport(report,'json',{color:true}),JSON.stringify(report,null,2)+'\n');
  assert.equal(JSON.parse(renderReport(report,'json')).findings[0].source.path,`source${attack}.md`);
});

test('rendering is deterministic without mutating report content, canonical order or JSON bytes',()=>{
  const input=[
    {...finding('Q002','a.md'),source:{path:'z.md',position:{line:9,column:2}}},
    finding('C001','z.md','error','compliance'),
    {...finding('Q002','a.md'),source:{path:'b.md',position:{line:1,column:3}}},
  ];
  const report=createReport(scope,input,defaultPolicy());
  const expectedJson=JSON.stringify(report,null,2)+'\n';
  const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value)) freeze(child);}};
  freeze(report);
  const plain=renderReport(report,'text');
  const color=renderReport(report,'text',{color:true});
  for(let iteration=0;iteration<4;iteration++){
    assert.equal(renderReport(report,'text'),plain);
    assert.equal(renderReport(report,'text',{color:true}),color);
    assert.equal(renderReport(report,'json'),expectedJson);
    assert.equal(renderReport(report,'json',{color:true}),expectedJson);
    assert.equal(renderReport(report,'json',{color:false}),expectedJson);
  }
  assert.equal(renderReport(createReport(scope,[...input].reverse(),defaultPolicy()),'text'),plain);
  assert.equal(renderReport({...report,findings:[...report.findings].reverse()},'text'),plain);
  assert.equal(report.findings[0].path,'a.md');
});

test('dense synthetic reports keep every finding and source context without repeating target headers',()=>{
  const findings=[
    ...Array.from({length:63},(_,index)=>({...finding(index<58?'C002':'C001',`concept-${index%7}.md`,'error','compliance'),message:`error-message-${index}`,remediation:`error-fix-${index}`})),
    ...Array.from({length:268},(_,index)=>({...finding(index<201?'Q002':'Q001',index<201?'missing.md':`concept-${index%7}.md`),message:`warning-message-${index}`,remediation:`warning-fix-${index}`,...(index<201?{source:{path:`source-${index}.md`,position:{line:index+1,column:1}}}:{})})),
  ];
  const report=createReport(scope,findings,defaultPolicy());
  const plain=renderReport(report,'text');
  assert.match(plain,/Findings: 63 errors, 268 warnings \(63 compliance, 268 quality\)/);
  assert.match(plain,/C002 compliance\/error: 58 findings/);
  assert.match(plain,/Q002 quality\/warning: 201 findings/);
  assert.equal((plain.match(/^    Message:/gm)??[]).length,331);
  assert.equal((plain.match(/^    Fix:/gm)??[]).length,331);
  assert.equal((plain.match(/^    Referenced from:/gm)??[]).length,201);
  assert.equal((plain.match(/^Path: missing\.md \(201 findings\)$/gm)??[]).length,1);
  for(const item of findings){
    assert.ok(plain.includes(`    Message: ${item.message}\n    Fix: ${item.remediation}\n`));
    if(item.source) assert.ok(plain.includes(`    Referenced from: ${item.source.path}:${item.source.position.line}:1\n`));
  }
  assert.equal(stripVTControlCharacters(renderReport(report,'text',{color:true})),plain);
});
