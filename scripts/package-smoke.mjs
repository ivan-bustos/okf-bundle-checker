import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
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
if(pkg.private===true||pkg.publishConfig?.tag!=='alpha'||pkg.publishConfig?.access!=='public')throw new Error('Alpha package metadata is inconsistent');
if(pkg.types!=='./dist/index.d.ts'||pkg.exports?.['.']?.types!==pkg.types||pkg.exports?.['.']?.import!=='./dist/index.js')throw new Error('Missing ESM or TypeScript entrypoint');
if(pkg.name!==source.name||pkg.version!==source.version||pkg.license!=='MIT'||pkg.bin['okf-checker']!=='dist/cli.js')throw new Error('Package identity does not match approved release contract');
for(const path of ['LICENSE','assets/logo.svg','README.md','CHANGELOG.md','dist/index.js','dist/index.d.ts'])if(!packed.files.some(f=>f.path===path))throw new Error('Missing package documentation asset');
const installed=JSON.parse(run('npm',['exec','--offline','--','okf-checker','check',resolve('tests/fixtures/shared/valid-minimal'),'--format','json'],root));
if(installed.tool.name!==source.name||installed.tool.version!==source.version||installed.exitCode!==0)throw new Error('Installed binary identity check failed');
const api=JSON.parse(run(process.execPath,['--input-type=module','-e',`const api=await import('okf-bundle-checker'); console.log(JSON.stringify({check:typeof api.checkBundle,render:typeof api.renderReport,policy:typeof api.defaultPolicy}));`],root));
if(api.check!=='function'||api.render!=='function'||api.policy!=='function')throw new Error('Installed public ESM entrypoint failed');
await writeFile(join(root,'consumer.mts'),`import {checkBundle,renderReport,defaultPolicy,type Policy,type Report} from 'okf-bundle-checker';\nconst policy:Policy=defaultPolicy();\nconst report:Report=await checkBundle('synthetic-bundle',policy);\nconst text:string=renderReport(report,'text',{color:false});\nvoid text;\n`);
run(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'--noEmit','--strict','--module','NodeNext','--moduleResolution','NodeNext','--target','ES2022','consumer.mts'],root);
const modules=(await readdir('src')).filter(name=>name.endsWith('.ts')).map(name=>name.slice(0,-3));
const outputs=new Set(modules.flatMap(name=>[`dist/${name}.js`,`dist/${name}.d.ts`]));
if(packed.files.some(file=>file.path.startsWith('dist/')&&!outputs.has(file.path)))throw new Error('Unexpected generated package file');
if(packed.files.some(file=>/(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|id_rsa|[^/]*\.(?:pem|key|p12|pfx))$/i.test(file.path)))throw new Error('Sensitive-looking package file');
console.log(`Packed CLI smoke passed (${packed.files.length} files).`);
}finally{await rm(root,{recursive:true,force:true});}
