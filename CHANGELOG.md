# Changelog

## 1.0.0-alpha.1

First alpha of OKF Bundle Checker. The version is prepared in this repository;
this entry does not claim that an npm package or GitHub release is available.

### Added

- Offline CLI and reusable engine for local Open Knowledge Format bundles,
  targeting a pinned OKF v0.2 specification revision.
- Compliance rules C001–C003 for concept encoding/frontmatter, required types and
  reserved index/log documents, while accepting custom types and extension metadata.
- Configurable quality rules Q001–Q009 for descriptions, local Markdown links,
  directory indexes and coverage, and supplied provenance, trust, lifecycle and
  computation-contract metadata.
- YAML policy files with exclusions, root/all index scope, per-rule quality
  severity and an independent failure threshold.
- Deterministic schema-versioned JSON reports and readable text reports with
  grouped findings, remediation and optional terminal color.
- Distinct exit codes: 0 for completed checks below threshold, 1 for completed
  checks with threshold-reaching findings and 2 for incomplete operational checks.
- Bounded discovery/parsing, symlink refusal, inert content handling and safe
  report output outside the input bundle.
- Node 22/24 CI coverage across Linux, Windows and macOS; synthetic acceptance
  fixtures, installed-package smoke checks and reusable CI examples.
- Rule-by-rule documentation, configuration and installation guides, MIT license
  and original SVG logo.

### Compatibility and known limits

- This is a prerelease. APIs, configuration and report details may change before
  stable 1.0. Pin the exact version and review changes before upgrading.
- `check` includes configurable quality; legacy `inspect` retains its original
  compliance-only JSON interface.
- Optional metadata advice remains quality, even when configured as an error.
  C004 is reserved and is not an emitted or configurable rule.
- Validation requires a stable local snapshot within the supported
  [input limits](docs/limits.md). It is not a sandbox for a concurrently changing
  attacker-controlled filesystem or a performance guarantee.
- No factual-correctness judgments, bundle rewriting, remote URL checks,
  computation execution/attestation, heading-anchor checks, baselines, index
  generation, PR comments, native annotations or SARIF output.

See [alpha status and validation boundaries](docs/release-readiness.md) and the
[issue tracker](https://github.com/ivan-bustos/okf-bundle-checker/issues) for details.
