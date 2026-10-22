# First-batch acceptance map

Historical batch record. The later owner-approved identity and release preparation
are documented in [release readiness](release-readiness.md); pending decisions below
describe the state of this earlier batch, not the current release candidate.

- #2: spec-pin.json records immutable revision, exact checksum and byte length;
  rule-matrix.md audits hard versus advisory rules; shared synthetic fixtures are
  mirrored by viewer without a package/runtime dependency.
- #3: private TypeScript/Node foundation, lockfile, independent modules, strict
  typecheck, lint, tests, CI matrix and installed-package smoke. Release choices
  remain explicitly deferred, not guessed.
- #4: sorted bounded offline discovery, assets, scoped exclusions, symlink and
  collision refusal, unreadable/empty/limit failures. Tests include adversarial
  wildcard patterns and terminal controls. Stable snapshot requirement documented.
- #5: fatal UTF-8, safe bounded YAML, original positions, inert Markdown AST,
  inline/reference links, code exclusion and reserved-file classification.
- #6: C001/C002/C003 audited compliance, supported-version handling and synthetic
  pass/fail fixtures. C004 is reserved; optional families do not become hard errors.

This map describes implementation evidence, not merged state or completion of
later quality/config/reporting/security-release gates. See the feature PR for the
exact tested commit, counts and CI results. No source bundle is uploaded by the
checker. All committed fixtures are synthetic.
