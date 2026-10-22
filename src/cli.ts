#!/usr/bin/env node
import { setImmediate } from 'node:timers/promises';
import { constants } from 'node:fs';
import { lstat, open, realpath, rename, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { checkBundle, inspectCompliance, loadPolicy, OperationalError, renderReport } from './index.js';
const HELP='Usage: okf-checker check <bundle-directory> [--config <file>] [--format text|json] [--output <file>] [--fail-on error|warning]\nDefaults: cwd .okf-validator.yml if present; text output; fail on error.\nOffline: no bundle uploads, remote URL checks or content execution.\ninspect <bundle-directory> retains the compliance-only foundation JSON interface.\nRelease candidate 0.1.0; npm publication is not yet authorized.\n';
interface Options { root:string; format:'text'|'json'; configPath?:string; output?:string; failOn?:string }
function argumentsFor(args:string[]):Options {
  if(args[0]!=='check'||!args[1]||args[1].startsWith('-'))throw new OperationalError('usage','Expected check and a bundle directory. Use --help.');
  const options:Options={root:args[1],format:'text'}; const used=new Set<string>();
  for(let i=2;i<args.length;i+=2) {
    const key=args[i]; const value=args[i+1];
    if(!key||!value||value.startsWith('--')||used.has(key))throw new OperationalError('usage','Flags require one value and cannot be repeated.'); used.add(key);
    if(key==='--config')options.configPath=value;
    else if(key==='--output')options.output=value;
    else if(key==='--fail-on')options.failOn=value;
    else if(key==='--format'&&(value==='text'||value==='json'))options.format=value;
    else throw new OperationalError('usage','Unknown option or unsupported format. Use --help.');
  }
  return options;
}
function contained(root:string,target:string):boolean { const value=relative(root,target);return value===''||(!isAbsolute(value)&&value!=='..'&&!value.startsWith(`..${process.platform==='win32'?'\\':'/'}`)); }
async function writeReport(path:string,text:string,bundle:string,configPath:string,signal?:AbortSignal):Promise<void> {
  const target=resolve(path); let temp:string|undefined;
  try {
    const parent=await realpath(dirname(target)); const root=await realpath(bundle);
    const configuration=resolve(configPath);
    if(target===configuration)throw new OperationalError('unsafe-output','Report destination must not replace the configuration.');
    try {if(await realpath(configuration)===join(parent,basename(target)))throw new OperationalError('unsafe-output','Report destination must not replace the configuration.');}catch(error){if(error instanceof OperationalError)throw error;}
    if(contained(root,join(parent,basename(target))))throw new OperationalError('unsafe-output','Report destination must be outside the input bundle.');
    try { const stat=await lstat(target); let configIdentity;try{configIdentity=await lstat(configuration);}catch{}
      if(configIdentity&&stat.dev===configIdentity.dev&&stat.ino===configIdentity.ino)throw new OperationalError('unsafe-output','Report destination must not replace the configuration.');
      if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1)throw new OperationalError('unsafe-output','Report destination must be an ordinary non-linked file.'); }
    catch(error) { if(!(typeof error==='object'&&error!==null&&'code' in error&&error.code==='ENOENT'))throw error; }
    temp=join(parent,`.okf-report-${randomUUID()}.tmp`);
    const handle=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600);
    try {await handle.writeFile(text,'utf8');await handle.sync();}finally{await handle.close();}
    if(signal?.aborted)throw new OperationalError('interrupted','Check interrupted before report publication.');
    await rename(temp,target);temp=undefined;
  } catch(error) { if(error instanceof OperationalError)throw error; throw new OperationalError('report-write','Unable to save the report; no completed report was published.'); }
  finally {if(temp)await rm(temp,{force:true});}
}
export async function run(args:string[],out:(text:string)=>void|Promise<void>,err:(text:string)=>void|Promise<void>,signal?:AbortSignal):Promise<number> {
  try {
    if(args.length===1&&(args[0]==='--help'||args[0]==='-h')) {await out(HELP);return 0;}
    if(signal?.aborted)throw new OperationalError('interrupted','Check interrupted before completion.');
    // Two event-loop turns before publication service signals queued during parsing.
    if(args.length===2&&args[0]==='inspect'&&args[1]&&!args[1].startsWith('-')) {
      const result=await inspectCompliance(args[1],{},signal);await setImmediate();await setImmediate();if(signal?.aborted)throw new OperationalError('interrupted','Check interrupted before completion.');await out(JSON.stringify({foundationSchemaVersion:1,mode:'compliance-foundation',specVersion:'0.2',...result})+'\n');return result.findings.length?1:0;
    }
    const options=argumentsFor(args);
    const policy=await loadPolicy({...options.configPath!==undefined?{configPath:options.configPath}:{},...options.failOn!==undefined?{failOn:options.failOn}:{}});
    const report=await checkBundle(options.root,policy,signal);const text=renderReport(report,options.format);
    await setImmediate();await setImmediate();if(signal?.aborted)throw new OperationalError('interrupted','Check interrupted before report publication.');
    if(options.output!==undefined)await writeReport(options.output,text,options.root,options.configPath??'.okf-validator.yml',signal);else await out(text);
    return report.exitCode;
  } catch(error) {
    await err(JSON.stringify({schemaVersion:1,completed:false,error:error instanceof OperationalError?error.code:'internal-error',message:error instanceof OperationalError?error.message:'Unable to complete the check safely.',...(error instanceof OperationalError&&error.path?{path:error.path}:{})})+'\n');return 2;
  }
}
// Node canonicalizes module paths, including macOS temporary-directory aliases and npm bin links.
const invokedEntry=process.argv[1]?await realpath(process.argv[1]).catch(()=>undefined):undefined;
if(invokedEntry!==undefined&&invokedEntry===await realpath(fileURLToPath(import.meta.url)).catch(()=>undefined)) {
  const controller=new AbortController(); const stop=()=>controller.abort(); process.once('SIGINT',stop);process.once('SIGTERM',stop);
  // Writable errors arrive asynchronously; callbacks make them part of the operational result.
  process.stdout.on('error',()=>{});process.stderr.on('error',()=>{});
  const write=(stream:NodeJS.WriteStream,text:string)=>new Promise<void>((done,reject)=>stream.write(text,error=>error?reject(new OperationalError('output-write','Unable to deliver the report output.')):done()));
  try {process.exitCode=await run(process.argv.slice(2),text=>write(process.stdout,text),text=>write(process.stderr,text),controller.signal);}
  catch {process.exitCode=2;}
  finally {process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
