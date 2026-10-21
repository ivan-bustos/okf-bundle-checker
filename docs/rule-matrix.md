# Normative rule audit and stable finding IDs

Pin and checksum: [`spec-pin.json`](spec-pin.json). Section links below refer to
[the pinned specification](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/0b87c52c6ef999286c745e19998fdfcd03d5dbee/SPEC.md), not a moving branch.
This audit is the contract for issues #2 and #6. Implemented-rule availability
must be documented separately; reserving a future ID does not claim it runs.

## Hard compliance core

| ID | Default | Audited meaning | Evidence and limits |
| --- | --- | --- | --- |
| C001 | error | Non-reserved `.md` is UTF-8 Markdown with opening/closing frontmatter delimiters and a parseable YAML mapping. Malformed or missing/non-mapping frontmatter is a finding. | §4, §4.1, §11(1). Empty mapping is structurally parseable but fails C002. YAML duplicate keys are rejected under the documented safe-parser policy; unsupported resource budgets are operational, not proof of nonconformance. |
| C002 | error | Concept `type` is a non-empty string, accepting custom values. Whitespace-only is treated as empty. | §4.1 defines a string and §11(2) requires non-empty type. Unknown keys/types MUST NOT cause rejection (§4.1/§11). |
| C003 | error | Reserved documents retain their purpose. Nested indexes cannot have frontmatter; root index permits only its version declaration exception. Logs' date headings use ISO date form. Reserved documents are never required to have `type`. | §3.1, §8, §9, §11(3), §12. No missing-index error, no required fixed title, no requirement for action-label vocabulary. See interpretation notes below. |
| C004 | reserved; no emitted hard rule | The draft proposed conditional metadata compliance. After §11 audit and owner decision, its optional-family shapes move to Q006–Q009. A version not supported by this implementation is operational. | §11 says other constraints SHOULD be soft guidance; absence of optional families MUST NOT reject. §12 permits declaration and recommends consumer best effort. |

Compliance rules cannot be promoted from quality simply because a team chooses
`error`. Reports retain `layer: quality` for configured quality errors.
A hard failure is not an assessment of factual accuracy, trustworthiness,
external URL availability or computation correctness.

## Consumer duties (not producer-invalidity findings)

- Unknown `type` and extension keys: accept and retain (§4.1).
- Bare `verified: {by, at}`: normalize to a one-element event list (§5.2/§11).
- Missing provenance/trust/lifecycle/computation families: accept (§5.3/§11).
- Broken cross-links and absent indexes: accept for compliance (§6.1/§11).
- Trust inference and staleness are SHOULD guidance; the MVP does not certify
  trust, run an attester, or infer actor facts that are not in the document.
- §7's human actor prefix depends on knowing an actor is human; the checker
  cannot determine authorship facts from arbitrary strings. Shape guidance is
  advisory, never a claim to know the real author.

## Configurable quality catalog

Each quality rule accepts `off`, `warning`, or `error`. Defaults below are
`warning`; missing optional families alone do not trigger Q006–Q009. Unknown
extension keys remain allowed. These IDs are frozen for subsequent tickets.

| ID | Subject | Checks and source |
| --- | --- | --- |
| Q001 | Description | Missing, blank or non-string concept description; not semantic accuracy (§4.1). |
| Q002 | Internal links | Missing local file/directory/asset targets, including reference links. Do not fetch external URLs (§6). |
| Q003 | Missing indexes | Root and selected concept-containing directories lack optional `index.md` (§8). |
| Q004 | Index coverage | Concepts/child concept directories absent from their directory index (§8). Directory links do not require a child index. |
| Q005 | Index descriptions | Entry lacks descriptive text; no verbatim comparison to target description (§8). |
| Q006 | Present provenance metadata | `sources` sequence/entry mapping shape and present entry `resource`; optional id/title/author string shape, finite nonnegative usage counts, timestamp and usage-window forms when supplied (§5.1). Scope-descriptor resources are allowed and not forced to be URLs. |
| Q007 | Present trust metadata | `generated` mapping and its `by`; supplied timestamps; `verified` mapping-or-list of mappings with event `by`/`at`, allowing the bare mapping (§5.2/§7). No requirement to add trust metadata. |
| Q008 | Present lifecycle metadata | Known status values if supplied, and explicitly offset ISO date-time forms for supplied stale_after/timestamps (§5.4–5.5). Absence of status means stable, not an error. |
| Q009 | Present computation contract | For an `Attested Computation`, required runtime and documented parameter/executor/receipt/attester shapes; computation-path versus inline-body convention (§10.2–10.3). No resource is executed. Type-only concepts still pass compliance. |

Timestamp or optional-field issues are advisory regardless of uppercase REQUIRED
in §5/§10: §11's conformance summary deliberately limits rejection. Structural
quality checks must cite the exact clause and not infer additional undocumented
requirements (for example an arbitrary provider registry or a universal runtime
enumeration).

## Version and ambiguity decisions

- `okf_version` is not universally required. `"0.2"` is supported by this pinned
  profile. Other declarations result in operational `unsupported-version`,
  distinct from malformed reserved-file structure. No moving-spec lookup occurs.
- §8 permits root index frontmatter solely for a version declaration. Rejecting
  extra frontmatter keys there is the documented narrow reading of that
  exception, not the concept extension policy (which still accepts unknown keys).
- §9 explicitly requires date-heading form, but does not explicitly prohibit
  frontmatter in log files. Do not introduce a blanket log-frontmatter ban merely
  from absence in the example. A reserved file presented as a concept (a `type`
  field) conflicts with §3.1. Malformed YAML, if present, remains diagnostic.
- The §9 example uses H2 for dates and H1 for title. A validator should inspect
  actual heading syntax rather than dates in code or paragraph prose. It must
  document how additional sections are interpreted, not require example labels.
- Checking a syntactically shaped date is possible; requiring calendar-valid
  dates should be stated as ISO-date interpretation and covered by leap-year tests.
- §11(2)'s phrase “every frontmatter” cannot require `type` on a legitimate root
  version index, because §8/§12 explicitly exempt that reserved file.
- Safe-parser limits, rejected symlinks, unreadable files,
  zero-concept scope and unsupported tool versions are operational diagnostics.
  They do not invent new OKF conformance requirements or yield accidental success.
  Invalid UTF-8 in a concept is C001 because §4 explicitly specifies UTF-8;
  decoding is strict and never silently substitutes replacement characters.

## Evidence

The shared fixture manifest covers minimal custom-type concepts, extension keys,
root-version indexes, reserved-file misuse, missing type/frontmatter, broken
links, optional metadata shape, nested paths, directory links and code examples.
Runtime tests add malformed encodings, YAML resource exhaustion, filesystem
containment and deterministic source locations. Claim only rules actually
implemented in the current batch; the remaining quality catalog is a contract
for later tickets.
