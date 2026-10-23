import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,cp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const entry=resolve('dist/cli.js');
const valid=resolve('tests/fixtures/shared/valid-minimal');
const invoke=(args,cwd=process.cwd())=>spawnSync(process.execPath,[entry,...args],{cwd,encoding:'utf8'});
test('direct directory and explicit check produce identical JSON and exit codes',()=>{
  for(const folder of ['valid-minimal','invalid-type']){
    const path=resolve('tests/fixtures/shared',folder);
    const a=invoke([path,'--format','json']);const b=invoke(['check',path,'--format','json']);
    assert.equal(a.status,b.status);assert.equal(a.stdout,b.stdout);assert.equal(a.stderr,b.stderr);
  }
});
test('no arguments and flags-only check cwd, preserving configuration and output safety',async()=>{
  const root=await mkdtemp(join(tmpdir(),'okf shorthand '));
  try{
    await cp(valid,root,{recursive:true});
    const plain=invoke([],root);const explicit=invoke(['check','.'],root);
    assert.equal(plain.status,0,plain.stderr);assert.equal(plain.stdout,explicit.stdout);
    const json=invoke(['--format','json'],root);assert.equal(json.status,0,json.stderr);assert.equal(JSON.parse(json.stdout).scope.concepts,1);
    const unsafe=invoke(['--output','report.json'],root);assert.equal(unsafe.status,2);assert.equal(JSON.parse(unsafe.stderr).error,'unsafe-output');
    await writeFile(join(root,'.okf-validator.yml'),'unknownSetting: true\n');
    assert.equal(invoke([],root).status,2);assert.equal(invoke(['check','.'],root).status,2);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('paths with spaces or reserved command names work when explicitly relative',async()=>{
  const root=await mkdtemp(join(tmpdir(),'okf shorthand '));
  try{
    for(const name of ['knowledge folder','check','inspect','-bundle']){
      await cp(valid,join(root,name),{recursive:true});
      const r=invoke([`./${name}`,'--format','json'],root);assert.equal(r.status,0,r.stderr);
    }
  }finally{await rm(root,{recursive:true,force:true});}
});
test('malformed commands and unsupported fixes remain operational usage errors',()=>{
  for(const args of [['check'],['inspect'],['inspect',valid,'--format','json'],[valid,'other'],['--fix'],[valid,'--fix'],[valid,'--format'],[valid,'--format','json','--format','text'],['--unknown','yes']]){
    const r=invoke(args);assert.equal(r.status,2,JSON.stringify(args));assert.equal(r.stdout,'');assert.equal(JSON.parse(r.stderr).error,'usage');
  }
  assert.equal(invoke(['--help']).status,0);assert.equal(invoke([resolve('absent-folder')]).status,2);
});
