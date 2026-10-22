# Rule-by-rule reference

Use the rule ID in a finding to jump to its explanation below. This catalog
describes what the checker actually implements, including cases it deliberately
does not validate. All examples are synthetic.

The implementation targets **OKF v0.2 at revision
`0b87c52c6ef999286c745e19998fdfcd03d5dbee`**, not the latest upstream branch.
Section references throughout this page refer to the [pinned specification][spec].
See the [pin and checksum](spec-pin.json), [normative audit](rule-matrix.md),
[configuration guide](configuration.md), and [supported input limits](limits.md).

## Find a rule

| ID | What it checks | Layer and default |
| --- | --- | --- |
| [C001](#c001-concept-encoding-and-frontmatter) | Concept encoding and frontmatter | Compliance, fixed error |
| [C002](#c002-required-concept-type) | Required concept type | Compliance, fixed error |
| [C003](#c003-reserved-index-and-log-documents) | Reserved index and log documents | Compliance, fixed error |
| [C004](#c004-reserved-not-implemented) | Reserved ID, no emitted rule | Not configurable |
| [Q001](#q001-concept-description) | Concept description | Quality, warning |
| [Q002](#q002-local-markdown-links) | Local Markdown links | Quality, warning |
| [Q003](#q003-missing-directory-indexes) | Missing directory indexes | Quality, warning |
| [Q004](#q004-directory-index-coverage) | Directory index coverage | Quality, warning |
| [Q005](#q005-index-entry-descriptions) | Index entry descriptions | Quality, warning |
| [Q006](#q006-provenance-metadata) | Supplied provenance metadata | Quality, warning |
| [Q007](#q007-generation-and-verification-metadata) | Supplied trust metadata | Quality, warning |
| [Q008](#q008-lifecycle-metadata) | Supplied lifecycle metadata | Quality, warning |
| [Q009](#q009-attested-computation-contract) | Supplied computation contract | Quality, warning |

## Severity, scope, and finding locations

- **Compliance** implements the narrow hard-conformance audit in §11. C001–C003
  are always `error`; configuration can restate that severity but cannot disable
  or demote them. The C003 interpretation choices are documented below.
- **Quality** is optional guidance, even where a metadata subsection describes a
  field as required within that family. Q001–Q009 each accept `off`, `warning`,
  or `error` under `rules`. Selecting `error` does not change `layer: quality`
  into a standards violation. `off` suppresses that rule's findings.
- **Failure threshold** is separate from rule severity. The default `fail_on:
  error` fails a completed check only on errors. `fail_on: warning` fails on
  warnings or errors. `--fail-on` overrides the file setting. None of these
  rules has a configurable numeric threshold.
- **Scope** is the discovered inventory after `exclude` patterns are applied.
  Only lowercase `.md` suffixes are Markdown documents; the exact basenames
  `index.md` and `log.md` are reserved at every depth. For example, `Index.md`
  is a concept, while `notes.MD` is an asset. No rule rewrites input files.
- **Index scope** defaults to `all`. `index_scope: root` limits Q003–Q005 to
  root `index.md`; it does not narrow compliance, Q001, Q002, or Q006–Q009.
- **Locations** use bundle-relative paths and one-based line/column values when
  available. Metadata findings point to the top-level metadata key, not
  necessarily the nested field named in the message. Q002 distinguishes the
  missing target from the referring source. Q003 points to the expected index;
  Q004 points to the existing index and names the uncovered target.

For example, this policy makes broken links fail the default threshold, while
keeping description advice non-blocking and suppressing missing-index advice:

```yaml
fail_on: error
rules:
  Q001: warning
  Q002: error
  Q003: off
```

A completed check exits **0** below its threshold or **1** when the threshold is
reached. Operational problems exit **2** and do not establish that a bundle is
invalid or valid. Examples include unsupported declared versions, unreadable
files, symlinks, an empty concept scope, YAML aliases/custom tags/non-string
mapping keys, and resource limits. See [limits](limits.md), not C004, for these
boundaries. The legacy `inspect` command runs compliance only; use `check` for
this full catalog.

Unless shown as a complete document, YAML examples below are frontmatter
fragments inside an otherwise parseable concept with `type: Reference`.
“Accepted” means accepted by the rule being discussed, not necessarily a
warning-free whole bundle.

### Choose the intended bundle scope

Discovery is recursive, including hidden and tooling directories. It does not
automatically apply `.gitignore` or recognize an ordinary project README as
outside OKF. If `workspace/README.md`, `workspace/.tooling/notes.md`, and
`workspace/knowledge/queues.md` are all selected, all three are concept
documents and must meet C001/C002.

Point the command at `workspace/knowledge` when that directory is the intended
bundle. If non-knowledge files genuinely live inside the bundle root, use
intentional exclusions such as `exclude: ['.tooling/**', 'vendor/**']` in your
policy. Exclusion patterns are relative to the bundle root; the implicit
`.okf-validator.yml` is read from the command's working directory, not
automatically from the bundle root.

Do not demote mandatory compliance rules to accommodate unrelated files.
Instead, verify the reported scope and exclusions. Narrowing scope also changes
link resolution and index obligations: a link to an excluded file can produce
Q002 even though the file still exists outside the selected inventory.

## C001: Concept encoding and frontmatter

**Policy:** compliance; fixed `error` (`rules.C001: error` is the only accepted
setting). Sources: [§4, §4.1, §11(1)][spec];
[parser](../src/parser.ts) and [compliance implementation](../src/compliance.ts).

**Triggers:** a concept has invalid UTF-8, no opening frontmatter, no closing
frontmatter delimiter, malformed YAML, duplicate YAML keys, or a YAML value that
is not a mapping. The opening delimiter must be the first line and both
delimiters must be exactly `---` on their own lines. One leading UTF-8 BOM and
LF/CRLF line endings are supported. Blank frontmatter is not an empty mapping;
use `{}` to express an empty mapping explicitly.

**Does not check:** body truth, spelling, minimum length, required headings, or
the `type` value (C002). Empty mapping `{}` passes C001 but fails C002. Parser
resource/profile limitations are operational failures, not C001. Equivalent
encoding or frontmatter diagnostics in reserved files belong to C003. A parser
diagnostic stops later compliance checks on that document to avoid cascading
type errors.

**Example:** `concepts/retry-guide.md` with just a Markdown heading triggers
C001 because it has no frontmatter. This corrected complete document passes it:

```markdown
---
type: Playbook
description: Retry steps for a synthetic queue worker.
---
# Retry guide

Retry only after inspecting the worker's recorded failure.
```

Putting `type: Playbook` and another `type: Reference` in the same mapping also
triggers C001; `---` followed by `- Playbook` is a sequence, not a mapping.

**Fix:** save the document as UTF-8, place one delimited YAML mapping at the
start, and repair YAML syntax or duplicate keys at the reported position.

## C002: Required concept type

**Policy:** compliance; fixed `error` (`rules.C002: error` only). Sources:
[§4.1, §11(2)][spec]; [compliance implementation](../src/compliance.ts).

**Triggers:** a successfully parsed concept mapping has no `type`, or `type`
is not a string, is empty, or contains only whitespace. The finding points to
`type` when present, otherwise the start of frontmatter.

**Does not check:** a type registry, capitalization, a fixed vocabulary, or the
semantics of the selected type. Custom strings are accepted and not rewritten.
Reserved indexes/logs do not require `type`. Malformed or missing frontmatter
is C001, not an additional C002.

**Example:** this fragment triggers C002 because YAML parses `42` as a number:

```yaml
type: 42
description: A synthetic record used to demonstrate type validation.
```

`type: "   "`, `type: null`, and `type: [Reference]` also trigger it.
`type: Queue Recovery Playbook` is an accepted custom type. Even `type: "42"`
passes the implemented string check, although a descriptive name is clearer.

**Fix:** provide a meaningful non-empty string. There is no need to replace a
valid custom type with one of the specification's example types.

## C003: Reserved index and log documents

**Policy:** compliance; fixed `error` (`rules.C003: error` only). Sources:
[§3.1, §8, §9, §11(3), §12][spec];
[compliance implementation](../src/compliance.ts) and
[interpretation audit](rule-matrix.md#version-and-ambiguity-decisions).

**Triggers:** encoding/YAML structural diagnostics in an exact `index.md` or
`log.md`, plus the following reserved-file checks:

- Any frontmatter in a nested `index.md` triggers C003. Root `index.md` may
  have no frontmatter, or a mapping containing **only** `okf_version`.
  An empty mapping, missing version key, or additional key triggers C003.
- In that root-only exception, string `"0.2"` and number `0.2` are supported.
  A different value or shape is operational `unsupported-version`, not C003.
- Any `type` key in a log's frontmatter triggers C003, even if its value is null.
- Each top-level Markdown H2 heading in `log.md` must yield a calendar-valid
  `YYYY-MM-DD` date. For example, `2024-02-29` passes and `2025-02-29` fails.
  H2 includes both `##` and equivalent Setext heading syntax. Use plain date
  text: this check reads direct text/inline-code children, not date text nested
  in emphasis or links.

**Does not check:** whether an index or log exists, a required title, a minimum
number of entries, chronological ordering, or action-label vocabulary. A log
may contain non-`type` frontmatter. H1 is an optional title; other heading depths,
headings nested in blockquotes/lists, paragraphs, and code examples are not
interpreted as dated entries. A top-level H2 such as `## Notes` is still treated
as an entry heading and fails. Index completeness is Q003–Q005, not C003.

**Examples:** accepted root `index.md` frontmatter:

```yaml
okf_version: '0.2'
```

The same frontmatter in `operations/index.md` triggers C003. Adding `title:
Operations` to the root mapping also triggers it. In a synthetic `log.md`,
replace the failing heading with the corrected one:

```markdown
## October 22, 2026
```

```markdown
## 2026-10-22
- Clarified the queue recovery instructions.
```

**Fix:** remove nested-index frontmatter and extra root-index fields, move
concepts out of reserved filenames, and use plain H2 calendar dates for log
entry groups. Do not add a `type` just to satisfy C002: C002 does not apply here.

## C004: Reserved, not implemented

**Policy:** reserved ID; no findings, severity, threshold, or supported
configuration. `rules.C004` is invalid configuration and exits 2, regardless of
the supplied severity. Sources: [§11, §12][spec],
[normative audit](rule-matrix.md#hard-compliance-core), and
[configuration implementation](../src/config.ts).

An earlier design reserved C004 for conditional metadata compliance. That hard
rule is **not implemented**: the audited decision assigns optional-family shape
advice to Q006–Q009 instead. Its reserved status does not promise a future rule
or permit callers to interpret it as a current validation result.

**Example:** `sources: not-a-list` in a valid concept can produce Q006, never
C004. A concept containing only `type: Attested Computation` passes compliance
and does not activate Q009. An unsupported root `okf_version` is an operational
failure, not a hidden C004 finding.

**Fix:** configure the relevant Q006–Q009 rule for your team's desired quality
severity. Remove any `C004` configuration entry; no document change can “fix” a
finding this implementation does not emit.

## Q001: Concept description

**Policy:** quality; default `warning`; configure `rules.Q001` as `off`,
`warning`, or `error`. Sources: [§4.1][spec];
[index-quality implementation](../src/index-quality.ts).

**Triggers:** a concept's `description` is missing, not a string, empty, or
whitespace-only. This also runs on concepts with missing frontmatter, but skips
invalid frontmatter and documents with parser diagnostics.

**Does not check:** a one-sentence limit, length, factual accuracy, grammar,
similarity to the body/title, or agreement with index-entry wording. It does
not require descriptions on reserved index/log documents.

**Example:** `description: [queue, recovery]` triggers Q001. Replace it with:

```yaml
description: Steps for recovering a stalled synthetic queue worker.
```

**Fix:** add a useful non-empty summary string, or disable this optional
editorial policy. A missing description alone is not a compliance violation.

## Q002: Local Markdown links

**Policy:** quality; default `warning`; configure `rules.Q002` as `off`,
`warning`, or `error`. Sources: [§6][spec];
[parser](../src/parser.ts), [resolver](../src/resolver.ts), and
[index-quality implementation](../src/index-quality.ts).

**Triggers:** a parsed local Markdown link or image points to a file, asset, or
directory absent from the selected inventory, or uses a path the safe resolver
cannot follow. Inline and defined reference-style links/images are checked in
concepts, indexes, and logs.

- Paths are case-sensitive POSIX paths, relative to the referring document's
  directory unless they start with `/`, which means the bundle root.
- Queries and fragments do not affect target existence. A fragment-only or
  query-only link points to its source document. A trailing slash requires a
  directory; a directory link does not require `index.md` inside it.
- Percent decoding occurs once per path segment. Malformed encodings, encoded
  slashes/backslashes, drive-style prefixes, raw backslashes, C0/C1 controls, bidi overrides (U+202A–U+202E),
  or bidi isolates (U+2066–U+2069), leading URL whitespace, and paths escaping the bundle are
  rejected as quality findings. An invalid non-normalized source path is also
  refused by the resolver API. Unsafe targets are never followed.
- A link to an excluded target is missing **from the selected scope**, even
  if that target exists on disk. The message is not a claim it was deleted.

**Does not check:** external URLs or their availability; schemes such as
`https:`/`mailto:` and protocol-relative `//` links are not fetched. Markdown
code examples, raw HTML `href`/`src` attributes, YAML resource strings, and
unresolved reference labels parsed as ordinary text are not link targets.
Heading anchors, query validity, and asset contents are not validated.

**Example:** from `guides/retry.md`, with only `concepts/queue.md` present:

```markdown
[Queue](../concepts/Queue.md)
```

This triggers Q002 for `concepts/Queue.md`. Correcting the case to
`[Queue](../concepts/queue.md#recovery)` resolves the file; it does **not** prove
that a `recovery` heading exists. `[Queue](../../concepts/queue.md)` escapes the
root and is refused rather than read outside the bundle.

**Finding location:** missing-target findings use the expected target as `path`
and a separate `source.path`/`source.position` for the link to fix. Repeated links
to the same normalized missing target from one document produce one finding;
links from different source documents remain separate. Unsafe-link findings
point directly to the source, deduplicated by URL within that source.

**Fix:** correct spelling/case/encoding, use a contained path, add the intended
target, or adjust exclusions deliberately. Do not enable network access to
resolve this rule: validation is offline.

## Q003: Missing directory indexes

**Policy:** quality; default `warning`; configure `rules.Q003` as `off`,
`warning`, or `error`. `index_scope: all` is the default; `root` checks only the
root index. Sources: [§8][spec];
[index-quality implementation](../src/index-quality.ts).

**Triggers:** root or an ancestor directory containing at least one scoped
concept has no inventoried Markdown file at its exact `index.md` path. This
includes intermediate directories with concepts only in descendants. A concept
is counted from its filename even if its content has a compliance finding.

**Does not check:** empty, asset-only, or reserved-document-only directory
branches. An existing malformed or empty index is not “missing”; other rules
may apply to its contents. Excluded concepts do not create index obligations.
An entirely empty concept scope is operational exit 2, not an all-clear Q003 run.

**Example:** a bundle containing `operations/queues/retry.md` and no indexes
produces these expected-index paths with `index_scope: all`:

```text
index.md
operations/index.md
operations/queues/index.md
```

With `index_scope: root`, only `index.md` is reported. An `images/` directory
containing only a diagram does not require an index under this policy.

**Fix:** add useful directory indexes, narrow `index_scope`, or turn Q003 off.
Indexes remain optional for compliance. Disabling Q003 does not disable Q004
or Q005 for indexes that already exist.

## Q004: Directory index coverage

**Policy:** quality; default `warning`; configure `rules.Q004` as `off`,
`warning`, or `error`; subject to `index_scope: all|root`. Sources:
[§8][spec]; [index-quality implementation](../src/index-quality.ts).

**Triggers:** an existing index does not contain a resolving Markdown link to
each immediate scoped concept and immediate child directory containing a scoped
concept at any depth. One finding names each uncovered target. Defined
reference links count; link labels and placement within the index do not have
to follow a specific template.

**Does not check:** coverage for absent indexes (Q003), assets, logs, empty or
asset-only branches, or every descendant concept in a parent index. A direct
directory link covers that directory without requiring a child index. A link to
an existing child's `index.md` also covers the child directory. Linking just
`child/concept.md` does not cover the child directory itself. Images, code
examples, external links, wrong-case/missing targets, and raw HTML anchors do
not provide coverage.

**Example:** if root contains `overview.md` and `operations/retry.md`, this
root index leaves `operations` uncovered:

```markdown
- [Overview](overview.md) - Bundle overview.
```

Add this entry; it passes Q004 for the child directory even if
`operations/index.md` does not exist:

```markdown
- [Operations](operations/) - Operational guides.
```

**Fix:** add links to the immediate missing concepts/directories named in the
finding. A Q004 finding is attached to the existing index, with no invented
source line for a link that is absent. Index prose quality is separately Q005.

## Q005: Index entry descriptions

**Policy:** quality; default `warning`; configure `rules.Q005` as `off`,
`warning`, or `error`; subject to `index_scope: all|root`. Sources:
[§8][spec]; [index-quality implementation](../src/index-quality.ts).

**Triggers:** an index link in a list item, table row, or standalone paragraph
has no meaningful descriptive text in that same entry outside its link labels.
Description text must contain at least one Unicode letter, number, or
“other symbol” (for example an emoji); punctuation/separators alone do not
qualify. Ordinary emphasized text and inline code can qualify.

**Does not check:** matching the target's description verbatim, factual quality,
sentence count, or length. Link labels, image/alt text, code blocks, definitions,
raw HTML and its span contents, and nested lists/tables do not supply a parent
entry's description. A link in a heading alone is not an assessed entry.
Local, external, missing, and unsafe link targets can all have Q005 advice;
target existence is Q002. If an entry has multiple links, its description can
satisfy all of them.

**Example:** the first entry triggers Q005; the second fixes it:

```markdown
- [Retry guide](operations/retry.md)
- [Retry guide](operations/retry.md) - Recovery steps for the queue worker.
```

When both appear together, there is **no** Q005 finding for that target:
duplicate local targets are grouped by normalized path, ignoring query/fragment,
and one described occurrence satisfies the rule. External/unsafe URLs group by
their full URL. If none is described, one finding uses the first entry location.
An additional label such as `[More](details.md)` is not descriptive prose.

**Fix:** add a brief summary beside the link in its own list item, paragraph,
or table row, rather than borrowing a nested child's description.

## Shared optional-metadata behavior

Q006–Q009 inspect only concept documents with a successfully parsed frontmatter
mapping and no parser diagnostics. They do not run on indexes or logs. Unknown
extension fields are permitted, and missing optional families alone are not
findings. Explicit `null` is a supplied value and may fail its field's shape.
At most one finding is emitted per rule/field; a non-mapping parent produces a
parent-shape finding rather than a cascade for its missing children.

Supplied timestamps use the same implementation predicate in Q006–Q008:

- A string with a real calendar date, uppercase `T`, and explicit uppercase `Z`
  or numeric UTC offset. Date-only and unzoned local times fail.
- Basic/extended forms, omitted seconds, dot/comma fractional seconds, and
  offsets written `+hh`, `+hhmm`, or `+hh:mm` are accepted. For example,
  `2026-10-22T14:30Z`, `20261022T143000+0530`, and
  `2026-10-22T14:30:00.5Z` pass.
- Calendar leap years are checked. Hours are 00–24, minutes 00–59, seconds
  00–60, offset hours 00–23, and offset minutes 00–59. Hour 24 requires zero
  minutes, seconds, and fraction. Second 60 is accepted without consulting a
  historical leap-second table. This is a bounded structural check, not a full
  temporal/astronomical verification or an RFC 3339-only restriction.

Metadata resource strings are inert. These rules do not fetch URLs, test local
resource availability, interpret source authenticity, or run code.

## Q006: Provenance metadata

**Policy:** quality; default `warning`; configure `rules.Q006` as `off`,
`warning`, or `error`. Sources: [§5.1][spec];
[metadata-quality implementation](../src/metadata-quality.ts).

**Triggers, when supplied:**

- `sources` is not a sequence, or a source entry is not a mapping.
- A source entry lacks a non-empty string `resource`.
- Supplied `id`, `title`, or `author` is not a string. Empty strings are
  permitted for these three optional fields.
- Supplied `usage_count` is not a finite nonnegative number. Fractional numbers
  are permitted; negative values, numeric strings, `.inf`, and `.nan` fail.
- Supplied `last_modified` fails the shared timestamp predicate.
- A top-level or per-source `usage_window` is not a mapping, or lacks valid
  timestamp `from` and `to` members. A top-level window is checked even without
  `sources`.

**Does not check:** source existence or URL syntax, required source IDs, unique
IDs, footnote attribution, author identity, credibility scores, integer-only
counts, or `from <= to` ordering. `sources: []` is accepted. A `resource` can be
a scope description, not just a navigable URL/path. No source metadata is
required on a concept that omits it.

**Example:** this fragment triggers Q006 for a missing resource, a negative
count, and a date without time/offset:

```yaml
sources:
  - title: Synthetic worker activity summary
    usage_count: -3
    last_modified: '2026-10-20'
```

A corrected example is:

```yaml
sources:
  - resource: all queue jobs in the synthetic training project
    title: Synthetic worker activity summary
    usage_count: 3
    last_modified: '2026-10-20T09:00:00Z'
usage_window:
  from: '2026-10-01T00:00:00Z'
  to: '2026-10-21T00:00:00Z'
```

**Fix:** use a list of source mappings, give each a meaningful resource string,
and repair supplied signal/window shapes. Do not invent provenance just to
silence an optional rule.

## Q007: Generation and verification metadata

**Policy:** quality; default `warning`; configure `rules.Q007` as `off`,
`warning`, or `error`. Sources: [§5.2, §7, §11][spec];
[metadata-quality implementation](../src/metadata-quality.ts).

**Triggers, when supplied:** `generated` is not a mapping, its `by` is missing
or not a non-empty string, or its optional `at` fails the shared timestamp
predicate. `verified` must be a mapping or a sequence of mappings. Each
verification event requires a non-empty string `by` and a valid timestamp `at`.
Non-mapping list entries are reported individually.

**Does not check:** actor identity, an actor-name registry/prefix requirement,
whether a claimed reviewer is actually human, verification authenticity,
timestamp ordering, trust tiers, or actual content correctness. `generated.at`
may be absent. Bare `verified: {by, at}` is accepted as one event without
mutating the input; `verified: []` is accepted. Entirely absent families pass.

**Example:** this triggers Q007 because a scalar is not a verification event:

```yaml
verified: human:demo-reviewer
```

The following shapes are accepted:

```yaml
generated:
  by: training-exporter/1
verified:
  by: human:demo-reviewer
  at: '2026-10-22T10:00:00Z'
```

**Fix:** record generation as a mapping and verification as one mapping or a
list of events, retaining only claims you can substantiate. Add each supplied
event's required `by`/`at`; a passing shape is not proof of verification.

## Q008: Lifecycle metadata

**Policy:** quality; default `warning`; configure `rules.Q008` as `off`,
`warning`, or `error`. Sources: [§5.4–§5.5][spec];
[metadata-quality implementation](../src/metadata-quality.ts).

**Triggers, when supplied:** `status` is anything other than the exact string
`draft`, `stable`, or `deprecated`, or `stale_after` fails the shared timestamp
predicate. Values are not trimmed or case-folded.

**Does not check:** whether a concept is currently stale, whether a chosen
deadline is sensible, or whether its content deserves its status. There is no
clock-based warning or configurable freshness threshold. Absent `status` has
the specification's stable default and is not a finding. This rule does not
duplicate source timestamps (Q006) or event timestamps (Q007), and does not
validate arbitrary extension fields named `created_at` or similar.

**Example:** this triggers Q008 for both fields:

```yaml
status: Stable
stale_after: '2026-11-01'
```

Use a documented lowercase status and an explicit timestamp:

```yaml
status: stable
stale_after: '2026-11-01T00:00:00Z'
```

**Fix:** correct or omit the optional metadata as appropriate. A past but
well-formed `stale_after` is accepted by this structural rule; separately
review freshness when your workflow requires it.

## Q009: Attested Computation contract

**Policy:** quality; default `warning`; configure `rules.Q009` as `off`,
`warning`, or `error`. Sources: [§10.2–§10.3, §6.2, §11][spec];
[metadata-quality implementation](../src/metadata-quality.ts).

**Activation:** the type must be exactly `Attested Computation`, **and** at
least one of `runtime`, `parameters`, `computation`, `executor`, or `attester`
must be present. A type-only concept does not activate this rule. An inline
body alone does not activate it, and similarly named fields on custom types
remain extensions.

**Triggers after activation:**

- `runtime` is missing or not a non-empty string. There is no runtime registry.
- Supplied `parameters` is not a sequence, an entry is not a mapping, or an
  entry lacks non-empty string `name`/`type` or boolean `required`.
- Supplied `executor`/`attester` is not a mapping or lacks a non-empty string
  `resource`. Supplied `executor.receipt` must be a sequence of non-empty string
  field names, not actual receipt data. Empty sequences are allowed.
- A supplied `computation` is not a non-empty string, or coexists with an inline
  computation code block. If `computation` is absent, there must be exactly one
  inline code block in the recognized Computation section(s).

**Inline convention:** a top-level H1 whose text, after trimming and unwrapping
Markdown emphasis/links, is exactly `Computation` starts the section. It ends at
the next top-level H1. Fenced and indented code blocks count, including blocks
nested in the section; prose and inline code do not. Counts are combined across
repeated Computation sections. An H2 `## Computation` does not start one. Code
in an Examples section does not count or conflict with a computation path.
Language labels and whether code is non-empty or executable are not checked.

**Does not check:** computation/resource existence, path versus URI validity,
supported runtimes/parameter types, unique parameter or receipt names, execution
results, actual receipt values, or attestation. It never opens a resource or
executes inline code. Parameters, executor, attester, and receipt are not required
when absent. No computation-family omission becomes hard noncompliance.

**Example:** this synthetic contract activates Q009 but triggers it for the
missing runtime and string-valued `required`:

```yaml
type: Attested Computation
computation: references/queue-count.sql
parameters:
  - name: queue_name
    type: string
    required: 'true'
```

Add `runtime: sql` and change `required` to the boolean `true`. Alternatively,
this complete inline document passes Q009 without a computation path:

````markdown
---
type: Attested Computation
description: Demonstrates a constant result for a synthetic training example.
runtime: sql
---
# Computation

```sql
SELECT 1 AS example_count;
```
````

**Fix:** complete the contract you chose to supply, keep receipt declarations
as field-name lists, and choose a computation reference **or** one inline block.
Use Q009 as structural authoring guidance, not as an execution or security audit.

## Implementation and regression evidence

The catalog is backed by [compliance tests](../test/compliance.test.mjs),
[index/link policy tests](../test/index-quality.test.mjs),
[metadata tests](../test/metadata-quality.test.mjs),
[resolver tests](../test/resolver.test.mjs), and
[configuration tests](../test/config.test.mjs). Run `npm run check` for the
repository's complete lint, type, test, and installed-package smoke checks.

[spec]: https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/0b87c52c6ef999286c745e19998fdfcd03d5dbee/SPEC.md
