import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const cli=(...args)=>spawnSync(process.execPath,['dist/cli.js',...args],{encoding:'utf8'});
test('development CLI reports scope and compliance deterministically',()=>{const a=cli('inspect','tests/fixtures/shared/valid-minimal');const b=cli('inspect','tests/fixtures/shared/valid-minimal');assert.equal(a.status,0,a.stderr);assert.equal(a.stdout,b.stdout);const data=JSON.parse(a.stdout);assert.equal(data.mode,'compliance-foundation');assert.equal(data.scope.concepts,1);assert.deepEqual(data.findings,[]);});
test('noncompliance and operational failures differ',()=>{assert.equal(cli('inspect','tests/fixtures/shared/invalid-type').status,1);assert.equal(cli('inspect','absent').status,2);assert.equal(cli('unknown','.').status,2);assert.equal(cli('--help').status,0);});
