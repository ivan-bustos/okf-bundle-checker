import type { SourcePosition } from './parser.js';
export const QUALITY_RULE_IDS = ['Q001','Q002','Q003','Q004','Q005','Q006','Q007','Q008','Q009'] as const;
export type QualityRuleId = typeof QUALITY_RULE_IDS[number];
export type Severity = 'off' | 'warning' | 'error';
export interface QualityFinding { ruleId: QualityRuleId; layer: 'quality'; severity: 'warning'|'error'; path: string; message: string; remediation: string; position?: SourcePosition; source?: {path:string;position?:SourcePosition} }
export interface Policy { specVersion: '0.2'; failOn: 'warning'|'error'; exclusions: string[]; rules: Record<QualityRuleId,Severity>; indexScope: 'all'|'root' }
export function defaultPolicy(): Policy { return { specVersion:'0.2',failOn:'error',exclusions:[],rules:Object.fromEntries(QUALITY_RULE_IDS.map(id=>[id,'warning'])) as Record<QualityRuleId,Severity>,indexScope:'all' }; }
