import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isAlias, isMap, isNode, isPair, isScalar, isSeq, parseDocument } from 'yaml';
import { OperationalError } from './discovery.js';
import { defaultPolicy, QUALITY_RULE_IDS } from './policy.js';
import type { Policy, QualityRuleId, Severity } from './policy.js';
const MAX_CONFIG_BYTES = 64 * 1024;
function fail(): never { throw new OperationalError('invalid-config','Configuration must match the documented safe policy schema.'); };
const mapping = (value: unknown): value is Record<string,unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export function parseConfig(bytes: Uint8Array): Partial<Policy> {
  if (bytes.length > MAX_CONFIG_BYTES) fail();
  let value: unknown;
  try {
    const text = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    const doc = parseDocument(text,{schema:'core',version:'1.2',uniqueKeys:true,strict:true,prettyErrors:false});
    if (doc.errors.length || doc.warnings.length || !isMap(doc.contents)) fail();
    let nodes=0;
    const visit=(node:unknown,depth:number):void=>{
      if (++nodes>10_000 || depth>32 || isAlias(node)) fail();
      if (isNode(node) && node.tag && !['tag:yaml.org,2002:str','tag:yaml.org,2002:map','tag:yaml.org,2002:seq','tag:yaml.org,2002:null','tag:yaml.org,2002:bool','tag:yaml.org,2002:int','tag:yaml.org,2002:float'].includes(node.tag)) fail();
      if (isPair(node)) { if (!isScalar(node.key) || typeof node.key.value!=='string') fail(); visit(node.value,depth+1); }
      else if (isMap(node)||isSeq(node)) for(const item of node.items) visit(item,depth+1);
    };
    visit(doc.contents,0); value=doc.toJS({maxAliasCount:0});
  } catch { return fail(); }
  if (!mapping(value)) fail();
  for(const key of Object.keys(value)) if(!['spec_version','fail_on','exclude','rules','index_scope'].includes(key)) fail();
  const result:Partial<Policy>={};
  if ('spec_version' in value) { if(value.spec_version!=='0.2' && value.spec_version!==0.2) throw new OperationalError('unsupported-version','Only the pinned OKF 0.2 profile is supported.'); result.specVersion='0.2'; }
  if ('fail_on' in value) { if(value.fail_on!=='error' && value.fail_on!=='warning') fail(); result.failOn=value.fail_on; }
  if ('index_scope' in value) { if(value.index_scope!=='all' && value.index_scope!=='root') fail(); result.indexScope=value.index_scope; }
  if ('exclude' in value) {
    if(!Array.isArray(value.exclude)||value.exclude.length>100||value.exclude.some(x=>typeof x!=='string')) fail();
    result.exclusions=value.exclude as string[];
  }
  if ('rules' in value) {
    if(!mapping(value.rules)) fail();
    const rules=defaultPolicy().rules;
    for(const [id,severity] of Object.entries(value.rules)) {
      if(['C001','C002','C003'].includes(id)) { if(severity!=='error') fail(); continue; }
      if(!QUALITY_RULE_IDS.includes(id as QualityRuleId)||typeof severity!=='string'||!['off','warning','error'].includes(severity)) fail();
      rules[id as QualityRuleId]=severity as Severity;
    }
    result.rules=rules;
  }
  return result;
}
/** Only absence of the implicit cwd config falls back to defaults. Explicit paths fail closed. */
export async function loadPolicy(options: {cwd?:string; configPath?:string; failOn?:string}={}):Promise<Policy> {
  const path=resolve(options.cwd??process.cwd(),options.configPath??'.okf-validator.yml');
  let parsed:Partial<Policy>={}; let detected=false;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const before=await lstat(path); detected=true;
    if(!before.isFile()||before.isSymbolicLink()||before.size>MAX_CONFIG_BYTES) fail();
    handle=await open(path,constants.O_RDONLY | (constants.O_NOFOLLOW??0));
    const after=await handle.stat();
    if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size) fail();
    const buffer=Buffer.alloc(MAX_CONFIG_BYTES+1); let length=0;
    while(length<buffer.length) { const read=await handle.read(buffer,length,buffer.length-length,null); if(!read.bytesRead)break; length+=read.bytesRead; }
    const end=await handle.stat(); if(end.size!==after.size||end.mtimeMs!==after.mtimeMs||end.ctimeMs!==after.ctimeMs)fail();
    parsed=parseConfig(buffer.subarray(0,length));
  } catch(error) {
    if(error instanceof OperationalError) throw error;
    if(!(!detected && options.configPath===undefined && typeof error==='object' && error!==null && 'code' in error && error.code==='ENOENT')) throw new OperationalError('unreadable-config','Unable to read the selected configuration safely.');
  } finally { await handle?.close(); }
  const policy={...defaultPolicy(),...parsed};
  if(options.failOn!==undefined) { if(options.failOn!=='warning'&&options.failOn!=='error')fail(); policy.failOn=options.failOn; }
  return policy;
}
