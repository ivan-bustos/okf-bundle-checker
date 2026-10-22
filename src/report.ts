import { comparePaths } from './discovery.js';
import type { Finding as ComplianceFinding } from './compliance.js';
import type { QualityFinding, Policy } from './policy.js';
export type Finding = ComplianceFinding | QualityFinding;
export interface ScopeSummary { entries:number; concepts:number; documents:number; totalBytes:number; exclusions:string[]; excludedEntries:number }
export interface Report {
  schemaVersion:1; completed:true; tool:{name:'okf-bundle-checker-development';version:'0.0.0'}; specVersion:'0.2';
  threshold:Policy['failOn']; rules:Policy['rules']; indexScope:Policy['indexScope']; scope:ScopeSummary;
  counts:{compliance:number;quality:number;errors:number;warnings:number}; findings:Finding[]; exitCode:0|1;
}
export function orderedFindings(findings:Finding[]):Finding[] {
  return [...findings].sort((a,b)=>comparePaths(a.path,b.path)||(a.position?.line??0)-(b.position?.line??0)||(a.position?.column??0)-(b.position?.column??0)||comparePaths(a.ruleId,b.ruleId)||comparePaths(a.message,b.message)||comparePaths(a.remediation,b.remediation)||comparePaths('source' in a?a.source?.path??'':'','source' in b?b.source?.path??'':'')||('source' in a?a.source?.position?.line??0:0)-('source' in b?b.source?.position?.line??0:0)||('source' in a?a.source?.position?.column??0:0)-('source' in b?b.source?.position?.column??0:0));
}
export function createReport(scope:ScopeSummary,findings:Finding[],policy:Policy):Report {
  const sorted=orderedFindings(findings);
  const counts={compliance:sorted.filter(x=>x.layer==='compliance').length,quality:sorted.filter(x=>x.layer==='quality').length,errors:sorted.filter(x=>x.severity==='error').length,warnings:sorted.filter(x=>x.severity==='warning').length};
  return {schemaVersion:1,completed:true,tool:{name:'okf-bundle-checker-development',version:'0.0.0'},specVersion:policy.specVersion,threshold:policy.failOn,rules:{...policy.rules},indexScope:policy.indexScope,scope,counts,findings:sorted,exitCode:counts.errors>0||(policy.failOn==='warning'&&counts.warnings>0)?1:0};
}
/** Escape source-derived controls so text output cannot issue terminal commands. */
export function safeText(text:string):string { return text.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,char=>`\\u${char.charCodeAt(0).toString(16).padStart(4,'0')}`); }
export function renderReport(report:Report,format:'text'|'json'):string {
  if(format==='json') return JSON.stringify(report,null,2)+'\n';
  const lines=[`OKF ${report.specVersion} | completed | ${report.scope.concepts} concepts | fail on ${report.threshold}`,`Findings: ${report.counts.errors} errors, ${report.counts.warnings} warnings (${report.counts.compliance} compliance, ${report.counts.quality} quality)`,`Scope: ${report.scope.entries} entries, ${report.scope.documents} documents, ${report.scope.totalBytes} bytes; ${report.scope.excludedEntries} encountered entries excluded`,`Exclusions: ${report.scope.exclusions.length?report.scope.exclusions.map(safeText).join(', '):'(none)'}`];
  for(const item of report.findings) lines.push(`${safeText(item.path)}${item.position?`:${item.position.line}:${item.position.column}`:''} ${'source' in item&&item.source?` (referenced from ${safeText(item.source.path)}${item.source.position?`:${item.source.position.line}:${item.source.position.column}`:''})`:''} ${item.ruleId} ${item.layer}/${item.severity}: ${safeText(item.message)}\n  ${safeText(item.remediation)}`);
  lines.push(`Result: ${report.exitCode===0?'below threshold':'threshold reached'}`);
  return lines.join('\n')+'\n';
}
