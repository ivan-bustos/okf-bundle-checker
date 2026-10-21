import type { ParsedDocument, SourcePosition } from './parser.js';
import { OperationalError, comparePaths } from './discovery.js';
export interface Finding { ruleId: 'C001'|'C002'|'C003'; layer: 'compliance'; severity: 'error'; path: string; message: string; remediation: string; position?: SourcePosition }
const SPEC_VERSION = '0.2';
function finding(doc: ParsedDocument, ruleId: Finding['ruleId'], message: string, remediation: string, position?: SourcePosition): Finding {
  return { ruleId, layer: 'compliance', severity: 'error', path: doc.path, message, remediation, ...(position ? { position } : {}) };
}
function validDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0,10) === text;
}
export function checkCompliance(doc: ParsedDocument): Finding[] {
  const findings: Finding[] = [];
  for (const diagnostic of doc.diagnostics) {
    if (diagnostic.code.includes('limit') || ['yaml-depth','yaml-alias','yaml-tag','yaml-key-profile'].includes(diagnostic.code)) throw new OperationalError('parser-limit', 'Document exceeds the supported parser resource policy.', doc.path);
    findings.push(finding(doc, doc.kind === 'concept' ? 'C001' : 'C003', 'Document encoding or structure cannot be parsed safely.', 'Use UTF-8 and safe mapping YAML with unique keys and no tags or aliases.', {line:diagnostic.line,column:diagnostic.column}));
  }
  if (doc.diagnostics.length > 0) return findings;
  if (doc.kind === 'concept') {
    if (doc.frontmatter.state !== 'mapping') return [finding(doc,'C001','Concept requires a YAML frontmatter mapping.','Add a YAML mapping delimited by --- at the start of the document.', {line:1,column:1})];
    const type = doc.frontmatter.data?.type;
    if (typeof type !== 'string' || type.trim() === '') findings.push(finding(doc,'C002','Concept type must be a non-empty string.','Set type to a descriptive string; custom types are allowed.',doc.frontmatter.positions.type ?? {line:2,column:1}));
  } else if (doc.kind === 'index') {
    if (doc.frontmatter.state !== 'missing') {
      const data = doc.frontmatter.data;
      if (doc.path !== 'index.md' || doc.frontmatter.state !== 'mapping' || !data || Object.keys(data).some(key=>key !== 'okf_version') || !Object.hasOwn(data,'okf_version')) {
        findings.push(finding(doc,'C003','Index frontmatter is only allowed for the root version declaration.','Remove index frontmatter, or use only okf_version in the root index.',{line:1,column:1}));
      } else if (!((typeof data.okf_version === 'string' || typeof data.okf_version === 'number') && String(data.okf_version) === SPEC_VERSION)) {
        // Unsupported declaration is a tool capability error, never a bundle-invalid finding.
        throw new OperationalError('unsupported-version','This checker supports only an explicitly declared OKF 0.2 version.',doc.path);
      }
    }
  } else {
    if (doc.frontmatter.data && Object.hasOwn(doc.frontmatter.data, 'type')) findings.push(finding(doc,'C003','Reserved log.md cannot be a concept document.','Move the concept to a non-reserved .md filename.',doc.frontmatter.positions.type));
    for (const node of doc.ast.children) {
      // §9 models dated entries at depth 2; depth1 is the optional log title.
      if (node.type !== 'heading' || node.depth !== 2) continue;
      const value = node.children.map(child => 'value' in child ? String(child.value) : '').join('');
      if (!validDate(value)) findings.push(finding(doc,'C003','Log entry heading must use a valid YYYY-MM-DD date.','Use a level-two ISO calendar date heading for each log entry group.',node.position?.start));
    }
  }
  return findings;
}
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a,b)=>comparePaths(a.path,b.path) || (a.position?.line ?? 0)-(b.position?.line ?? 0) || (a.position?.column ?? 0)-(b.position?.column ?? 0) || comparePaths(a.ruleId,b.ruleId) || comparePaths(a.message,b.message));
}
