import type { PhrasingContent, RootContent } from 'mdast';
import type { ParsedDocument, SourcePosition } from './parser.js';
import type { QualityFinding, QualityRuleId, Severity } from './policy.js';

type Mapping = Record<string, unknown>;
const mapping = (value: unknown): value is Mapping => typeof value === 'object' && value !== null && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const has = (value: Mapping, key: string): boolean => Object.hasOwn(value, key);
const computationKeys = ['runtime', 'parameters', 'computation', 'executor', 'attester'];

/** Calendar datetimes with an explicit ISO 8601 UTC offset; never infer a local zone. */
function timestamp(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  // ISO permits basic or extended calendar/time forms, omitted seconds, fractional
  // seconds, and offsets written as +hh, +hhmm, or +hh:mm. Do not impose RFC 3339.
  const match = /^(\d{4})(-?)(\d{2})\2(\d{2})T(\d{2})(:?)(\d{2})(?:\6(\d{2})(?:[.,](\d+))?)?(Z|[+-](\d{2})(?::?(\d{2}))?)$/.exec(value);
  if (!match) return false;
  const [, yearText, , monthText, dayText, hourText, , minuteText, secondText, fraction, , offsetHour, offsetMinute] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText ?? 0);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= (days[month - 1] ?? 0)
    && hour <= 24 && minute <= 59 && second <= 60
    && (hour !== 24 || (minute === 0 && second === 0 && !/[1-9]/.test(fraction ?? '')))
    && Number(offsetHour ?? 0) <= 23 && Number(offsetMinute ?? 0) <= 59;
}

function nodeText(node: RootContent | PhrasingContent): string {
  if ('value' in node) return node.value;
  if ('children' in node) return node.children.map(child => nodeText(child as RootContent | PhrasingContent)).join('');
  return '';
}

function inlineComputation(doc: ParsedDocument): { count: number; position?: SourcePosition } {
  let within = false;
  let count = 0;
  let position: SourcePosition | undefined;
  const countCode = (node: RootContent): void => {
    if (node.type === 'code') count += 1;
    else if ('children' in node) node.children.forEach(child => countCode(child as RootContent));
  };
  for (const node of doc.ast.children) {
    if (node.type === 'heading' && node.depth === 1) {
      within = nodeText(node).trim() === 'Computation';
      if (within && !position && node.position) position = { line: node.position.start.line, column: node.position.start.column };
    } else if (within) countCode(node);
  }
  // §10.3 says fenced code, while §10.2 and Appendix A use indented code.
  // Both Markdown code-block forms therefore count; prose or inline code does not.
  return { count, ...(position ? { position } : {}) };
}

/** Optional quality guidance only. No resource is opened, fetched, or executed. */
export function checkMetadata(doc: ParsedDocument, rules: Record<QualityRuleId, Severity>): QualityFinding[] {
  const data = doc.frontmatter.data;
  if (doc.kind !== 'concept' || doc.frontmatter.state !== 'mapping' || !data || doc.diagnostics.length > 0) return [];
  const findings: QualityFinding[] = [];
  const emitted = new Set<string>();
  const add = (ruleId: QualityRuleId, field: string, section: string, problem: string, remedy: string, position?: SourcePosition): void => {
    const severity = rules[ruleId];
    const identity = `${ruleId}:${field}`;
    if (severity === 'off' || emitted.has(identity)) return;
    emitted.add(identity);
    const topKey = field.split(/[.[]/, 1)[0] ?? field;
    const source = position ?? doc.frontmatter.positions[topKey] ?? doc.frontmatter.positions.type ?? { line: 2, column: 1 };
    findings.push({ ruleId, layer: 'quality', severity, path: doc.path,
      message: `${field} ${problem} (${section}).`, remediation: `${remedy} See ${section}.`, position: source });
  };
  const stringField = (rule: QualityRuleId, object: Mapping, key: string, field: string, section: string, required = false): void => {
    if ((required || has(object, key)) && !(required ? nonempty(object[key]) : typeof object[key] === 'string')) {
      add(rule, field, section, required ? 'must be a non-empty string' : 'must be a string', `Use ${required ? 'a non-empty' : 'a'} string for ${field}; unknown extension keys remain allowed.`);
    }
  };
  const timeField = (rule: QualityRuleId, object: Mapping, key: string, field: string, section: string, required = false): void => {
    if ((required || has(object, key)) && !timestamp(object[key])) {
      add(rule, field, section, 'must be an ISO 8601 datetime with an explicit UTC offset', `Use a calendar datetime such as 2026-06-30T14:00:00Z for ${field}.`);
    }
  };
  const window = (object: Mapping, field: string): void => {
    if (!has(object, 'usage_window')) return;
    if (!mapping(object.usage_window)) add('Q006', field, '§5.1', 'must be a mapping with from and to datetimes', 'Use usage_window: { from: <datetime>, to: <datetime> }.');
    else {
      timeField('Q006', object.usage_window, 'from', `${field}.from`, '§5.1', true);
      timeField('Q006', object.usage_window, 'to', `${field}.to`, '§5.1', true);
    }
  };

  if (rules.Q006 !== 'off') {
    if (has(data, 'sources')) {
      if (!Array.isArray(data.sources)) add('Q006', 'sources', '§5.1', 'must be a sequence of source mappings', 'Use sources: [] or a list of mappings containing resource.');
      else data.sources.forEach((source: unknown, index: number) => {
        const field = `sources[${index}]`;
        if (!mapping(source)) { add('Q006', field, '§5.1', 'must be a mapping', 'Use a source mapping containing resource.'); return; }
        stringField('Q006', source, 'resource', `${field}.resource`, '§5.1', true);
        for (const key of ['id', 'title', 'author']) stringField('Q006', source, key, `${field}.${key}`, '§5.1');
        if (has(source, 'usage_count') && !(typeof source.usage_count === 'number' && Number.isFinite(source.usage_count) && source.usage_count >= 0)) {
          add('Q006', `${field}.usage_count`, '§5.1', 'must be a finite nonnegative number', 'Use a finite nonnegative usage count, not a credibility score.');
        }
        timeField('Q006', source, 'last_modified', `${field}.last_modified`, '§5.1');
        window(source, `${field}.usage_window`);
      });
    }
    window(data, 'usage_window');
  }

  if (rules.Q007 !== 'off') {
    if (has(data, 'generated')) {
      if (!mapping(data.generated)) add('Q007', 'generated', '§5.2', 'must be a mapping', 'Use generated: { by: <actor>, at: <datetime> }; at may be omitted.');
      else {
        stringField('Q007', data.generated, 'by', 'generated.by', '§5.2/§7', true);
        timeField('Q007', data.generated, 'at', 'generated.at', '§5.2');
      }
    }
    if (has(data, 'verified')) {
      // A bare mapping is one event (§5.2/§11), without mutating the input.
      const bare = mapping(data.verified);
      const events = bare ? [data.verified] : data.verified;
      if (!Array.isArray(events)) add('Q007', 'verified', '§5.2', 'must be a mapping or a sequence of verification events', 'Use verified: { by: <actor>, at: <datetime> } or a list of those mappings.');
      else events.forEach((event: unknown, index: number) => {
        const field = bare ? 'verified' : `verified[${index}]`;
        if (!mapping(event)) { add('Q007', field, '§5.2', 'must be a verification-event mapping', 'Use a mapping with by and at for each verification event.'); return; }
        stringField('Q007', event, 'by', `${field}.by`, '§5.2/§7', true);
        timeField('Q007', event, 'at', `${field}.at`, '§5.2', true);
      });
    }
  }

  if (rules.Q008 !== 'off') {
    if (has(data, 'status') && !(typeof data.status === 'string' && ['draft', 'stable', 'deprecated'].includes(data.status))) {
      add('Q008', 'status', '§5.4', 'must be draft, stable, or deprecated', 'Use a documented status value, or omit status to mean stable.');
    }
    timeField('Q008', data, 'stale_after', 'stale_after', '§5.5');
  }

  // A type-only concept has no computation family to assess (§11). Custom
  // concepts may use these names as extensions without adopting this contract.
  if (rules.Q009 !== 'off' && data.type === 'Attested Computation' && computationKeys.some(key => has(data, key))) {
    stringField('Q009', data, 'runtime', 'runtime', '§10.2', true);
    if (has(data, 'parameters')) {
      if (!Array.isArray(data.parameters)) add('Q009', 'parameters', '§10.2', 'must be a sequence of parameter mappings', 'Use parameters: [] or mappings with name, type, and required.');
      else data.parameters.forEach((parameter: unknown, index: number) => {
        const field = `parameters[${index}]`;
        if (!mapping(parameter)) { add('Q009', field, '§10.2', 'must be a parameter mapping', 'Use a mapping with name, type, and required.'); return; }
        stringField('Q009', parameter, 'name', `${field}.name`, '§10.2', true);
        stringField('Q009', parameter, 'type', `${field}.type`, '§10.2', true);
        if (typeof parameter.required !== 'boolean') add('Q009', `${field}.required`, '§10.2', 'must be a boolean', 'Use required: true or required: false for the parameter.');
      });
    }
    for (const key of ['executor', 'attester']) {
      if (!has(data, key)) continue;
      const contract = data[key];
      if (!mapping(contract)) { add('Q009', key, '§10.2', 'must be a mapping', `Use ${key}: { resource: <path-or-URI> }.`); continue; }
      stringField('Q009', contract, 'resource', `${key}.resource`, '§10.2/§6.2', true);
      if (key === 'executor' && has(contract, 'receipt')) {
        if (!Array.isArray(contract.receipt)) add('Q009', 'executor.receipt', '§10.2', 'must be a sequence of receipt field names', 'Declare receipt fields as strings, for example receipt: [job_id, executed_sql, result].');
        else contract.receipt.forEach((field: unknown, index: number) => {
          if (!nonempty(field)) add('Q009', `executor.receipt[${index}]`, '§10.2', 'must be a non-empty field-name string', 'Use the name of a field the executor returns; receipt values are runtime artifacts, not bundle metadata.');
        });
      }
    }
    const inline = inlineComputation(doc);
    if (has(data, 'computation')) {
      stringField('Q009', data, 'computation', 'computation', '§10.2/§6.2', true);
      if (inline.count > 0) add('Q009', 'computation', '§10.3', 'must not coexist with an inline computation block', 'Choose a computation path or one inline code block under # Computation, not both.');
    } else if (inline.count !== 1) {
      add('Q009', 'body.# Computation', '§10.3', 'must contain one code block when computation is absent', 'Provide one fenced or indented code block under # Computation (§10.2 examples), or set computation to a path.', inline.position ?? { line: doc.bodyStartLine, column: 1 });
    }
  }
  return findings;
}
