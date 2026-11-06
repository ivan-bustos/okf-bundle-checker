export { discoverBundle, OperationalError, DEFAULT_LIMITS } from './discovery.js';
export { parseDocument } from './parser.js';
export { checkCompliance, sortFindings } from './compliance.js';
import { discoverBundle } from './discovery.js';
import { parseDocument } from './parser.js';
import { checkCompliance, sortFindings } from './compliance.js';
/** Compatibility API: compliance-only. Use checkBundle for resolved quality policy. */
export async function inspectCompliance(root: string, options: Parameters<typeof discoverBundle>[1] = {}, signal?:AbortSignal) {
  const scope = await discoverBundle(root, options);
  const documents = [];
  for(const doc of scope.documents) {
    await setImmediate();await setImmediate();
    if(signal?.aborted)throw new OperationalError('interrupted','Inspection interrupted before completion.');
    documents.push(parseDocument(doc.path,doc.bytes));
  }
  const findings = sortFindings(documents.flatMap(checkCompliance));
  return { scope: {entries:scope.entries.length,concepts:scope.conceptCount,documents:scope.documents.length,totalBytes:scope.totalBytes,exclusions:scope.exclusions,excludedEntries:scope.excludedEntries}, findings };
}

export { loadPolicy, parseConfig } from './config.js';
export { defaultPolicy } from './policy.js';
export { createReport, renderReport } from './report.js';
export { resolveLink } from './resolver.js';
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
  const scope=await discoverBundle(root,{exclusions:policy.exclusions});
  const documents=[]; const compliance=[];
  for(const input of scope.documents) {
    await checkpoint(); const doc=parseDocument(input.path,input.bytes); documents.push(doc); compliance.push(...checkCompliance(doc));
  }
  await checkpoint();
  const quality=documents.flatMap(doc=>checkMetadata(doc,policy.rules,now));
  quality.push(...checkIndexQuality(documents,scope,policy.rules,policy.indexScope));
  await checkpoint();
  return createReport({entries:scope.entries.length,concepts:scope.conceptCount,documents:documents.length,totalBytes:scope.totalBytes,exclusions:scope.exclusions,excludedEntries:scope.excludedEntries},[...compliance,...quality],policy,freshnessEnabled&&evaluatedAt!==undefined?{evaluatedAt}:undefined);
}

export type { Report, Finding, ScopeSummary } from './report.js';
export type { Policy, Severity, QualityRuleId } from './policy.js';
