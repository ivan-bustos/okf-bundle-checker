import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadPolicy,parseConfig} from '../dist/config.js';
const parse=text=>parseConfig(new TextEncoder().encode(text));
test('configuration validates schema, versions, rule severities and compliance immutability',()=>{
  assert.equal(parse('spec_version: 0.2\nfail_on: warning\nrules:\n  Q001: off\n  Q009: error\n  C001: error').rules.Q009,'error');
  for(const source of ['unknown: true','rules: {Q010: error}','rules: {C004: error}','rules: {C002: off}','rules: {Q001: false}','rules: []','rules: {Q001: {toString: error}}','fail_on: info','index_scope: deep','exclude: text','exclude: [1]','spec_version: [0.2]','spec_version: 0.3','[]','a: [','rules: {Q001: off, Q001: error}','rules: &a {Q001: off}\nexclude: *a','rules: !custom {}','\u0000'])assert.throws(()=>parse(source),{name:'OperationalError'},source);
});
test('config resource limits fail closed',()=>{
  assert.throws(()=>parse('a'.repeat(65537)),{code:'invalid-config'});
  assert.throws(()=>parse('rules: '+ '['.repeat(1000)+'0'+']'.repeat(1000)),{code:'invalid-config'});
  assert.throws(()=>parseConfig(new Uint8Array([0xff])),{code:'invalid-config'});
});
test('defaults, cwd config, explicit config and CLI threshold precedence',async()=>{
  const root=await mkdtemp(join(tmpdir(),'checker-config-'));
  try {
    const base=await loadPolicy({cwd:root});assert.equal(base.failOn,'error');assert.equal(base.rules.Q001,'warning');
    await writeFile(join(root,'.okf-validator.yml'),'fail_on: warning\nrules: {Q001: off}\nexclude: [vendor/**]\nindex_scope: root\n');
    await writeFile(join(root,'explicit.yml'),'fail_on: error\nrules: {Q001: error}\n');
    for(const [options,threshold,severity] of [[{},'warning','off'],[{failOn:'error'},'error','off'],[{configPath:'explicit.yml'},'error','error'],[{configPath:'explicit.yml',failOn:'warning'},'warning','error']]){
      const actual=await loadPolicy({cwd:root,...options});assert.equal(actual.failOn,threshold);assert.equal(actual.rules.Q001,severity);assert.equal(actual.rules.Q009,'warning');
    }
    assert.deepEqual((await loadPolicy({cwd:root})).exclusions,['vendor/**']);
    await assert.rejects(loadPolicy({cwd:root,configPath:'missing'}),{code:'unreadable-config'});
    await assert.rejects(loadPolicy({cwd:root,failOn:'invalid'}),{code:'invalid-config'});
    await mkdir(join(root,'directory'));await assert.rejects(loadPolicy({cwd:root,configPath:'directory'}),{code:'invalid-config'});
    await writeFile(join(root,'.okf-validator.yml'),'typo: true');await assert.rejects(loadPolicy({cwd:root}),{code:'invalid-config'});
  }finally{await rm(root,{recursive:true,force:true});}
});
test('config symlinks are not followed',async t=>{
  const root=await mkdtemp(join(tmpdir(),'checker-config-link-'));
  try{await writeFile(join(root,'real'),'{}');try{await symlink(join(root,'real'),join(root,'link'));}catch(e){if(e.code==='EPERM'){t.skip('Host disallows symlink creation');return;}throw e;}
    await assert.rejects(loadPolicy({cwd:root,configPath:'link'}),{code:'invalid-config'});
  }finally{await rm(root,{recursive:true,force:true});}
});
