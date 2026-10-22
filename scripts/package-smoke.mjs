import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const root=await mkdtemp(join(tmpdir(),'okf-checker-package-'));
function run(cmd,args,cwd){const r=spawnSync(cmd,args,{cwd,env:{...process.env,npm_config_cache:join(root,'cache')},encoding:'utf8',shell:process.platform==='win32'});if(r.status!==0)throw new Error(`${cmd} failed: ${r.stderr}`);return r.stdout;}
try{
const packed=JSON.parse(run('npm',['pack','--json','--ignore-scripts','--pack-destination',root],process.cwd()))[0];
if(packed.files.some(f=>/^(?:test|tests|node_modules|\.git)(?:\/|$)/.test(f.path)))throw new Error('Unexpected package contents');
run('npm',['install','--ignore-scripts','--no-audit','--no-fund','--prefix',root,join(root,packed.filename)],process.cwd());
const entry=join(root,'node_modules/okf-bundle-checker-development/dist/cli.js');
const result=JSON.parse(run(process.execPath,[entry,'inspect',resolve('tests/fixtures/shared/valid-minimal')],root));
if(result.findings.length!==0||result.scope.concepts!==1)throw new Error('Packed CLI check failed');
const full=JSON.parse(run(process.execPath,[entry,'check',resolve('tests/fixtures/shared/valid-minimal'),'--format','json'],root));
if(!full.completed||full.schemaVersion!==1||full.scope.concepts!==1||full.exitCode!==0)throw new Error('Packed quality CLI check failed');
const pkg=JSON.parse(await readFile(join(root,'node_modules/okf-bundle-checker-development/package.json'),'utf8'));
if(!pkg.private)throw new Error('Development package must remain private');
console.log(`Packed CLI smoke passed (${packed.files.length} files).`);
}finally{await rm(root,{recursive:true,force:true});}
