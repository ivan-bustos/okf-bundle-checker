# OKF v0.3 beta: normative audit and supported scope

`1.0.0-beta.2` is an **unpublished validator beta**, not a complete OKF consumer.
Authority is [SPEC.md at 527e81aff55992be21507e97004286789126f88c](https://github.com/open-knowledge-format/open-knowledge-format/blob/527e81aff55992be21507e97004286789126f88c/SPEC.md),
Version 0.3, checked on 2026-11-19. [The pin](spec-pin-v03.json) records
its SHA-256 and byte count. The upstream validator is not the normative source.
The [v0.2 pin](spec-pin.json) and [legacy audit](rule-matrix.md) remain intact.
No specification or bundle resource is downloaded at runtime.

## Version selection and compatibility

A root `index.md` declaration selects `0.2` or `0.3` before checking any
concept. String and numeric declarations are accepted (quoting is recommended).
A supported declaration wins over configuration. With no declaration,
`spec_version: '0.3'` in the checker configuration selects v0.3; otherwise
unversioned bundles retain the legacy **0.2** profile. `inspectCompliance`
uses declarations with an unversioned 0.2 default. Low-level `parseDocument`,
`checkCompliance`, `parseTimestamp` and `checkMetadata` also default to 0.2;
callers selecting v0.3 must pass the version consistently.

Unknown versions produce operational exit 2, rather than pretending to validate
an unknown standard. This is a deliberate limitation relative to §12's best-effort
consumer SHOULD. v0.1-specific fallbacks are not implemented.

JSON remains `schemaVersion: 1`; `specVersion` now identifies the selected
profile, and tool version is `1.0.0-beta.2`. Exit 0/1/2 and deterministic ordering
are unchanged. Existing Q001–Q010 settings retain their defaults. v0.3 adds fixed
quality warning **W120** for each safely parsed untyped Markdown document.
W120 does not count as a compliance failure, but `--fail-on warning` includes it.
It is not a configurable Q rule. Compliance-only inspection omits W120.

## Audit of normative changes and consumer requirements

| Spec sections | Implemented behavior | Scope and limitations |
| --- | --- | --- |
| §2–3, §11.1; §13.2 concept discovery | Non-reserved Markdown with absent/null/empty type or no frontmatter is `other`, gets W120, and is excluded from concept counts, metadata checks, outgoing-link checks and expected index coverage. Typed README/AGENTS/SKILL files remain concepts. Invalid YAML/non-mappings still fail C001; malformed nonempty type fails C002. | No filename allowlist. Reserved files never become concepts. v0.3 can have zero concepts. v0.2 retains C001/C002 and the empty-scope operational guard. Discovery's low-level `conceptCount` remains a filename candidate count; reports use parsed classification. |
| §3.2 filesystem | Hidden entries excluded, bounded inventory, no outside reads. | All symlinks are refused, including internal ones; this is a documented operational profile, not spec invalidity. |
| §4, §4.1 extensions/YAML | YAML 1.2 core mappings, duplicate rejection, unknown keys at all levels retained; explicit standard `!!timestamp` accepted in v0.3 as inert timestamp text. | Custom tags, aliases, non-string keys and resource-limit excesses remain operational limitations. No write/reserialization operations, so producer preservation duties do not apply. |
| §4.2 bodies | CommonMark/GFM parser; code and HTML are inert. | No claim-to-source footnote join or semantic/body validation. |
| §5 timestamp forms | v0.3 date-only means midnight UTC; RFC3339 date-times require seconds and an explicit `Z`/colon offset; quoted, plain YAML and explicitly tagged timestamps work. Offset normalization and exact fractional comparisons supported. Legacy ISO forms retained only in 0.2. | Leap-second value 60 uses inherited POSIX rollover; historical leap-second occurrence is not validated. No local timezone inference. `--now` retains its existing explicitly-offset datetime contract. |
| §5.1 provenance | Optional shape guidance, entry resource requirement, source time/window checks, single source mapping supported. | No source credibility scoring, recursive lineage, network lookup or descriptor interpretation. |
| §5.2–5.3 verification currency | Checks event shapes and timestamps; accepts bare mapping or list and arbitrary nonempty actor strings. | **No trust tier is calculated or reported.** Historical events are not treated as current confirmations, and no verification/identity is certified. A future tier implementation must compare each event with generated.at; malformed times cannot establish currency. |
| §5.4 status, superseded_by | Unknown status remains quality guidance; superseded_by string shape checked. | No current-knowledge filtering, replacement following, chain/cycle checking or graph building. Raw metadata is preserved. |
| §5.5 freshness | Opt-in Q010 compares stale_after only. In 0.3 malformed nonempty deadlines produce Q010 even with Q008 off; null/empty deadlines are absent. Exact equality is stale. | With Q010 off the report makes no freshness assessment. A clean report is never a claim that content is fresh. |
| §6 paths; §13.1 breaking change | Body links remain file-relative/root-relative. Exported `resolvePathField` uses the same contained inventory resolver; 0.3 bare values are file-relative only. Legacy 0.2/unversioned calls retry the root only after a missing relative target. | **CLI Q002 checks body links, not metadata path-field targets.** Pass individual path/URI values to the helper; scope descriptors are not paths. No path-field graph edges or missing computation-file assessment. Unsafe outside paths are never followed. Existing resolver safety restrictions (including drive-style/single-letter schemes) remain. |
| §7 actor convention | Unknown scheme identifiers are accepted, without a registry or human-identity inference. | No actor tier classification. Only a future exact human: classifier may grant human-reviewed status. |
| §8, §8.1 root metadata | v0.3 root index accepts title/description/license and extension keys, with or without okf_version when configured for 0.3. Nested frontmatter fails C003. | No SPDX expression validation or index generation. v0.2 root exception remains version-only. |
| §9 log | v0.3 prohibits all frontmatter. Existing valid-calendar H2 date checks remain. | No newest-first ordering or prose/action vocabulary enforcement. Extra heading structure is not exhaustively validated. |
| §10 runtime/parameters/computation | Q009 warns on missing runtime for Attested Computation; parameters accept a single mapping, require name/type, default omitted required to false. Inline discovery recognizes fenced blocks under Computation at any ATX level and ends at equal/higher heading. | No runtime execution, parameter binding, receipt/verdict verification, attester ABI, or attested/attestable flag. Multiple blocks receive advisory quality guidance. Files referenced by computation are not opened. |
| §11.2 normalization | v0.3 optional null, empty string/list values are absent; sources/verified/parameters accept singleton items. Incomplete family entries produce quality guidance, not compliance rejection. | tags are retained as inert metadata and are not interpreted or split. Unknown vocabulary remains data, with optional guidance. |
| §12, §13 and Appendix B | Explicit version dispatch and immutable pins; pre-1.0 minor breaking changes isolated. | No automatic migration, no v0.1 timestamp/Citations fallback. Deferred runtime/cache/relationship features remain outside this beta. |

The supported validation profile is intentionally narrower than full consumer
conformance. No successful report certifies knowledge correctness, freshness
when disabled, trust, attestability, attestation, or every normative consumer duty.

## Regression evidence

`test/v03.test.mjs` covers typed/untyped differential behavior, index coverage,
root/log metadata, version dispatch, timestamps and offsets, tagged YAML,
fail-closed freshness with Q008 disabled, computation parameters/headings,
relative path precedence and legacy fallback, and CLI exit 0/1/2. Existing v0.2
fixtures remain unchanged. `npm run check` runs lint, types, build, the full
suite and an installed-package smoke; `npm run smoke:ci` verifies the CI examples.
