# Changelog

## 1.0.0

This entry describes the 1.0.0 release contents. Publication is a separate
maintainer action; see the [release guide](docs/release-readiness.md).

### Included

- Offline CLI and reusable TypeScript engine for local Open Knowledge Format
  bundles, targeting the pinned OKF v0.2 specification revision.
- Direct bundle-directory invocation, a current-directory default, explicit
  `check`, and a compliance-only `inspect` interface.
- Compliance rules C001–C003 for concept encoding/frontmatter, required types and
  reserved index/log documents, while accepting custom types and extension metadata.
- Configurable quality rules Q001–Q009 for descriptions, local Markdown links,
  directory indexes and coverage, and supplied provenance, trust, lifecycle and
  computation-contract metadata.
- Opt-in Q010 freshness guidance for `now >= stale_after`. Q010 defaults off;
  supplied deadline syntax is checked separately by Q008. `--now` and the engine's
  optional fixed reference time provide reproducible checks. Enabled freshness
  reports record `freshness.evaluatedAt`.
- Accepted ISO forms, offsets and exact fractional-second boundaries, including
  documented POSIX normalization of hour 24 and accepted second 60.
- YAML policy files with exclusions, root/all index scope, per-rule quality
  severity and an independent failure threshold.
- Deterministic schema-versioned JSON reports and readable text reports with
  grouped findings, remediation and optional terminal color.
- Distinct exit codes: 0 for completed checks below threshold, 1 for completed
  checks with threshold-reaching findings and 2 for incomplete operational checks.
- Bounded discovery/parsing, symlink refusal, inert content handling and safe
  report output outside the input bundle.
- Node 22/24 CI configuration across Linux, Windows and macOS; synthetic acceptance
  fixtures, installed-package/offline npx smoke checks and reusable CI examples.
- Package, CLI and report version identity aligned at `1.0.0`, with `latest` as
  the npm publication tag.

### Validation boundaries

Optional metadata advice remains quality, even when configured as an error.
C004 is reserved and is not an emitted or configurable rule. Validation requires
a stable local snapshot within the supported [input limits](docs/limits.md).
It is not a sandbox for a concurrently changing attacker-controlled filesystem
or a performance guarantee.

There are no factual-correctness judgments, bundle rewrites, remote URL checks,
computation execution/attestation, heading-anchor checks, baselines, index
generation, PR comments, native annotations or SARIF output.
