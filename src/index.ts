import { bundleVersion } from './version.js';
export { discoverBundle, OperationalError, DEFAULT_LIMITS } from './discovery.js';
export { parseDocument } from './parser.js';
export { checkCompliance, sortFindings } from './compliance.js';
import { discoverBundle } from './discovery.js';
import { parseDocument } from './parser.js';
import { checkCompliance, sortFindings } from './compliance.js';
/** Compatibility API: compliance-only. Use checkBundle for resolved quality policy. */
export async function inspectCompliance(root: string, options: Parameters<typeof discoverBundle>[1] = {}, signal?:AbortSignal) {
  const scope = await discoverBundle(root, {...options,allowEmpty:true});
  const rootInput = scope.documents.find(doc => doc.path === 'index.md');
  const version = bundleVersion(rootInput ? parseDocument(rootInput.path,rootInput.bytes,'0.3') : undefined);
  if(version==='0.2' && scope.conceptCount===0) throw new OperationalError('empty-scope','No concept documents were found in the selected scope.');
  const documents = [];
  for(const doc of scope.documents) {
    await setImmediate();await setImmediate();
    if(signal?.aborted)throw new OperationalError('interrupted','Inspection interrupted before completion.');
    documents.push(parseDocument(doc.path,doc.bytes,version));
  }
  const findings = sortFindings(documents.flatMap(doc => checkCompliance(doc, version)));
  return { specVersion:version, scope: {entries:scope.entries.length,concepts:documents.filter(doc=>doc.kind==='concept').length,documents:scope.documents.length,totalBytes:scope.totalBytes,exclusions:scope.exclusions,excludedEntries:scope.excludedEntries}, findings };
}

export { loadPolicy, parseConfig } from './config.js';
export { defaultPolicy } from './policy.js';
export { createReport, renderReport } from './report.js';
export { resolveLink, resolvePathField } from './resolver.js';
import { setImmediate } from 'node:timers/promises';
import { OperationalError } from './discovery.js';
import { defaultPolicy } from './policy.js';
import type { Policy } from './policy.js';
import { createReport } from './report.js';
import { parseTimestamp } from './timestamp.js';
import { checkMetadata } from './metadata-quality.js';
import { checkIndexQuality } from './index-quality.js';
export interface CheckOptions {
  /** Fixed ISO 8601 instant with an explicit offset; otherwise sample the clock once. */
  now?: string;
}
/** Complete offline check. Cancellation never returns a success-shaped report. */
export async function checkBundle(root:string,policy:Policy=defaultPolicy(),signal?:AbortSignal,options:CheckOptions={}) {
  const freshnessEnabled=policy.rules.Q010==='warning'||policy.rules.Q010==='error';
  const evaluatedAt=options.now ?? (freshnessEnabled ? new Date().toISOString() : undefined);
  const now=evaluatedAt===undefined ? undefined : parseTimestamp(evaluatedAt);
  if(evaluatedAt!==undefined&&!now)throw new OperationalError('invalid-clock','The reference time must be an ISO 8601 datetime with an explicit UTC offset.');
  // Two check phases force an intervening poll so queued OS signals are delivered.
  const checkpoint=async()=>{ await setImmediate();await setImmediate(); if(signal?.aborted)throw new OperationalError('interrupted','Check interrupted before completion.'); };
  await checkpoint();
  const scope=await discoverBundle(root,{exclusions:policy.exclusions,allowEmpty:true});
  const rootInput=scope.documents.find(doc=>doc.path==='index.md');
  const version=bundleVersion(rootInput ? parseDocument(rootInput.path,rootInput.bytes,'0.3') : undefined,policy.specVersion);
  if(version==='0.2' && scope.conceptCount===0) throw new OperationalError('empty-scope','No concept documents were found in the selected scope.');
  const documents=[]; const compliance=[];
  for(const input of scope.documents) {
    await checkpoint(); const doc=parseDocument(input.path,input.bytes,version); documents.push(doc); compliance.push(...checkCompliance(doc,version));
  }
  await checkpoint();
  const quality=documents.flatMap(doc=>checkMetadata(doc,policy.rules,now,version));
  const skipped=documents.filter(doc=>doc.kind==='other').map(doc=>({ruleId:'W120' as const,layer:'quality' as const,severity:'warning' as const,path:doc.path,message:'Untyped Markdown is not a concept and is skipped (OKF 0.3 §3.2).',remediation:'Add a non-empty type only if this document should be a concept.'}));
  quality.push(...checkIndexQuality(documents,scope,policy.rules,policy.indexScope));
  await checkpoint();
  return createReport({entries:scope.entries.length,concepts:documents.filter(doc=>doc.kind==='concept').length,documents:documents.length,totalBytes:scope.totalBytes,exclusions:scope.exclusions,excludedEntries:scope.excludedEntries},[...compliance,...quality,...skipped],{...policy,specVersion:version},freshnessEnabled&&evaluatedAt!==undefined?{evaluatedAt}:undefined);
}

export type { Report, Finding, ScopeSummary } from './report.js';
export type { Policy, Severity, QualityRuleId } from './policy.js';
