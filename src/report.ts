import { comparePaths } from './discovery.js';
import type { Finding as ComplianceFinding } from './compliance.js';
import type { QualityFinding, Policy } from './policy.js';
export type Finding = ComplianceFinding | QualityFinding;
export interface ScopeSummary { entries:number; concepts:number; documents:number; totalBytes:number; exclusions:string[]; excludedEntries:number }
export interface Report {
  schemaVersion:1; completed:true; tool:{name:'okf-bundle-checker';version:'1.0.0-alpha.1'}; specVersion:'0.2';
  threshold:Policy['failOn']; rules:Policy['rules']; indexScope:Policy['indexScope']; scope:ScopeSummary;
  counts:{compliance:number;quality:number;errors:number;warnings:number}; findings:Finding[]; exitCode:0|1;
}
export function orderedFindings(findings:Finding[]):Finding[] {
  return [...findings].sort((a,b)=>comparePaths(a.path,b.path)||(a.position?.line??0)-(b.position?.line??0)||(a.position?.column??0)-(b.position?.column??0)||comparePaths(a.ruleId,b.ruleId)||comparePaths(a.message,b.message)||comparePaths(a.remediation,b.remediation)||comparePaths('source' in a?a.source?.path??'':'','source' in b?b.source?.path??'':'')||('source' in a?a.source?.position?.line??0:0)-('source' in b?b.source?.position?.line??0:0)||('source' in a?a.source?.position?.column??0:0)-('source' in b?b.source?.position?.column??0:0));
}
export function createReport(scope:ScopeSummary,findings:Finding[],policy:Policy):Report {
  const sorted=orderedFindings(findings);
  const counts={compliance:sorted.filter(x=>x.layer==='compliance').length,quality:sorted.filter(x=>x.layer==='quality').length,errors:sorted.filter(x=>x.severity==='error').length,warnings:sorted.filter(x=>x.severity==='warning').length};
  return {schemaVersion:1,completed:true,tool:{name:'okf-bundle-checker',version:'1.0.0-alpha.1'},specVersion:policy.specVersion,threshold:policy.failOn,rules:{...policy.rules},indexScope:policy.indexScope,scope,counts,findings:sorted,exitCode:counts.errors>0||(policy.failOn==='warning'&&counts.warnings>0)?1:0};
}
/** Escape source controls, direction changes and line separators before adding trusted styling. */
export function safeText(text:string):string { return text.replace(/[\x00-\x1f\x7f-\x9f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g,char=>`\\u${char.charCodeAt(0).toString(16).padStart(4,'0')}`); }

const styles={heading:'1',error:'31',warning:'33',label:'36'} as const;
type RuleCount={ruleId:Finding['ruleId'];layer:Finding['layer'];severity:Finding['severity'];count:number};

function ruleCounts(findings:Finding[]):RuleCount[] {
  const groups=new Map<string,RuleCount>();
  for(const item of findings){
    const key=JSON.stringify([item.ruleId,item.layer,item.severity]);
    const existing=groups.get(key);
    if(existing) existing.count++;
    else groups.set(key,{ruleId:item.ruleId,layer:item.layer,severity:item.severity,count:1});
  }
  return [...groups.values()].sort((a,b)=>Number(a.severity==='warning')-Number(b.severity==='warning')||comparePaths(a.ruleId,b.ruleId)||comparePaths(a.layer,b.layer));
}

/** Text is a presentation view; JSON and the report's canonical finding order stay unchanged. */
export function renderReport(report:Report,format:'text'|'json',options:{color?:boolean}={}):string {
  if(format==='json') return JSON.stringify(report,null,2)+'\n';
  const style=(text:string,kind:keyof typeof styles):string=>options.color===true?`\u001b[${styles[kind]}m${text}\u001b[0m`:text;
  const label=(text:string):string=>style(text,'label');
  const lines=[
    style(safeText(`OKF ${report.specVersion} | completed | ${report.scope.concepts} concepts | fail on ${report.threshold}`),'heading'),
    safeText(`Findings: ${report.counts.errors} errors, ${report.counts.warnings} warnings (${report.counts.compliance} compliance, ${report.counts.quality} quality)`),
    safeText(`Scope: ${report.scope.entries} entries, ${report.scope.documents} documents, ${report.scope.totalBytes} bytes; ${report.scope.excludedEntries} encountered entries excluded`),
    `Exclusions: ${report.scope.exclusions.length?report.scope.exclusions.map(safeText).join(', '):'(none)'}`,
    '',
    style('Rule counts:','heading'),
  ];
  const counts=ruleCounts(report.findings);
  for(const rule of counts) lines.push(`  ${style(safeText(`${rule.ruleId} ${rule.layer}/${rule.severity}`),rule.severity)}: ${rule.count} ${rule.count===1?'finding':'findings'}`);
  if(counts.length===0) lines.push('  (none)');

  const ordered=orderedFindings(report.findings);
  for(const severity of ['error','warning'] as const){
    const findings=ordered.filter(item=>item.severity===severity);
    if(findings.length===0) continue;
    const heading=`${severity==='error'?'Errors':'Warnings'} (${findings.length})`;
    lines.push('',style(heading,severity),'-'.repeat(heading.length));
    const paths=new Map<string,Finding[]>();
    for(const item of findings){
      const group=paths.get(item.path);
      if(group) group.push(item);
      else paths.set(item.path,[item]);
    }
    for(const [path,items] of paths){
      lines.push('',style(`Path: ${safeText(path)} (${items.length} ${items.length===1?'finding':'findings'})`,'heading'));
      for(const [index,item] of items.entries()){
        if(index>0) lines.push('');
        const position=item.position?`line ${item.position.line}, column ${item.position.column}`:'not specified';
        lines.push(`  ${style(safeText(`${item.ruleId} ${item.layer}/${item.severity}`),severity)} | ${label('Position:')} ${safeText(position)}`);
        if('source' in item&&item.source){
          const source=`${item.source.path}${item.source.position?`:${item.source.position.line}:${item.source.position.column}`:''}`;
          lines.push(`    ${label('Referenced from:')} ${safeText(source)}`);
        }
        lines.push(`    ${label('Message:')} ${safeText(item.message)}`,`    ${label('Fix:')} ${safeText(item.remediation)}`);
      }
    }
  }
  if(ordered.length===0) lines.push('','No findings.');
  lines.push('',style(`Result: ${report.exitCode===0?'below threshold':'threshold reached'}`,'heading'));
  return lines.join('\n')+'\n';
}
