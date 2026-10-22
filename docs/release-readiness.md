# Release readiness: 0.1.0

This is a reviewable **unpublished release candidate**, not a package publication.
The owner approved the following choices on October 22, 2026:

| Item | Decision |
|---|---|
| Package | `okf-bundle-checker` |
| Command | `okf-checker` |
| Initial version | `0.1.0` |
| License | MIT, see [LICENSE](../LICENSE) |
| Intended registry | npm |
| Supported runtime lines | Node 22 and 24 |
| Tested OS matrix | Linux, Windows, macOS |

The package deliberately retains `private: true`. No credentials, npm namespace
reservation, registry ownership, publication, tag, GitHub release or deployment
has been created or authorized by this preparation. A package name in this table
is a product decision, not a claim that it is available in npm. A later authorized
publication must recheck ownership/availability and confirm the exact artifact.

## Acceptance checklist

- [x] Audit the pinned OKF v0.2 source and distinguish normative hard rules from
  configurable advice: [rule matrix](rule-matrix.md), [spec pin](spec-pin.json).
- [x] Preserve custom types, extension metadata and absent optional families.
- [x] Document all defaults, precedence, exclusions and rule severities:
  [configuration](configuration.md).
- [x] Distinguish completed below-threshold (0), completed findings (1), and
  incomplete operational failures (2). Version report schema and tool identity.
- [x] Add positive, negative, hostile, offline, deterministic, path and output tests:
  [acceptance map](acceptance.md).
- [x] Add runnable source/local-tarball and CI examples, with public installation
  explicitly gated until a release exists: [installation and CI](installation-ci.md).
- [x] Verify packed metadata, MIT license, original SVG logo, installed binary,
  compliance and quality modes; test a temporary installation path containing spaces.
- [x] Document bounded-input and stable-snapshot limitations: [limits](limits.md).
- [ ] Confirm the final feature commit's complete CI matrix in the pull request
  before approving this candidate for merge. Historical main/PR runs are not
  substitutes for final-commit evidence.
- [ ] Separately authorize and verify any actual publication. This is not required
  to finish release preparation and remains outside this implementation task.

The final pull request records exact commit, CI links and current evidence.
Run `npm ci --ignore-scripts && npm run check` from that revision to reproduce the
checks. `npm run benchmark` records observations, not an SLA. Nothing here grants
permission to merge or publish automatically.

## Out of scope

AI correctness judgments, automatic rewriting, hosted dashboards, external URL
availability, Git-provider APIs during validation, attested execution, heading
anchor validation, baselines and index generation remain excluded. Automatic PR
comments, native annotations and SARIF are not part of this MVP. Structural
validation does not establish that a document is true or its linked resources are safe.

## Provenance and assets

The logo in `assets/logo.svg` is original repository-native vector artwork, with
no remote assets, scripts or fonts. README references it by a relative path, and
packaged documentation includes it. It is covered by this repository's MIT license.
The license text follows the [Open Source Initiative MIT template](https://opensource.org/license/mit).
Shared compatibility fixtures remain synthetic and unchanged; private project
bundles are not bundled in tests or documentation.
