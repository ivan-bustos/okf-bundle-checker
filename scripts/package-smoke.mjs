import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const npmCli=process.env.npm_execpath;
if(!npmCli)throw new Error('Run package smoke through npm run smoke.');
const root=await mkdtemp(join(tmpdir(),'okf checker package-'));
const source=JSON.parse(await readFile('package.json','utf8'));
function run(cmd,args,cwd){const executable=cmd==='npm'?process.execPath:cmd;const argv=cmd==='npm'?[npmCli,...args]:args;const r=spawnSync(executable,argv,{cwd,env:{...process.env,npm_config_cache:join(root,'cache')},encoding:'utf8'});if(r.status!==0)throw new Error(`${cmd} failed: ${r.stderr}`);return r.stdout;}
try{
const packed=JSON.parse(run('npm',['pack','--json','--ignore-scripts','--pack-destination',root],process.cwd()))[0];
if(packed.files.some(f=>/^(?:test|tests|node_modules|\.git)(?:\/|$)/.test(f.path)))throw new Error('Unexpected package contents');
run('npm',['install','--ignore-scripts','--no-audit','--no-fund','--prefix',root,join(root,packed.filename)],process.cwd());
const entry=join(root,'node_modules/okf-bundle-checker/dist/cli.js');
const result=JSON.parse(run(process.execPath,[entry,'inspect',resolve('tests/fixtures/shared/valid-minimal')],root));
if(result.findings.length!==0||result.scope.concepts!==1)throw new Error('Packed CLI check failed');
const full=JSON.parse(run(process.execPath,[entry,'check',resolve('tests/fixtures/shared/valid-minimal'),'--format','json'],root));
if(!full.completed||full.schemaVersion!==1||full.scope.concepts!==1||full.exitCode!==0||full.tool.name!==source.name||full.tool.version!==source.version)throw new Error('Packed quality CLI check failed');
const pkg=JSON.parse(await readFile(join(root,'node_modules/okf-bundle-checker/package.json'),'utf8'));
if(!pkg.private)throw new Error('Unpublished package must remain publication-locked');
if(pkg.name!==source.name||pkg.version!==source.version||pkg.license!=='MIT'||pkg.bin['okf-checker']!=='dist/cli.js')throw new Error('Package identity does not match approved release contract');
for(const path of ['LICENSE','assets/logo.svg','README.md'])if(!packed.files.some(f=>f.path===path))throw new Error('Missing package documentation asset');
const installed=JSON.parse(run('npm',['exec','--offline','--','okf-checker','check',resolve('tests/fixtures/shared/valid-minimal'),'--format','json'],root));
if(installed.tool.name!==source.name||installed.tool.version!==source.version||installed.exitCode!==0)throw new Error('Installed binary identity check failed');
console.log(`Packed CLI smoke passed (${packed.files.length} files).`);
}finally{await rm(root,{recursive:true,force:true});}
