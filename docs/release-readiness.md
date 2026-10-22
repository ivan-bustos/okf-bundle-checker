# Alpha status and validation boundaries

`1.0.0-alpha.1` is the first alpha version of **OKF Bundle Checker**. This checkout
prepares that version; it does not establish that an npm artifact or GitHub release
is available. The [installation guide](installation-ci.md) includes source and
local-package options that work independently of registry availability.

| Item | Alpha target |
| --- | --- |
| Package / command | `okf-bundle-checker` / `okf-checker` |
| Version | `1.0.0-alpha.1` |
| License | [MIT](../LICENSE) |
| Supported Node lines | 22 and 24 |
| CI matrix | Linux, Windows and macOS, on both Node lines |
| Specification | OKF v0.2, pinned to `0b87c52c6ef999286c745e19998fdfcd03d5dbee` |
| Report format | JSON `schemaVersion: 1`, plus human-readable text |

This is a prerelease, not a stable 1.0 API or production-readiness guarantee.
Rules, configuration, programmatic interfaces and report details may change
before the stable release. Pin the exact version and review the
[changelog](../CHANGELOG.md) before upgrading.

## Implemented and covered by automated checks

- A narrow normative compliance core, C001–C003, separated from configurable
  quality advice, Q001–Q009. Custom types, extensions and absent optional metadata
  are accepted. See the [rule catalog](rules.md) and [normative audit](rule-matrix.md).
- Explicit configuration precedence, scoped exclusions, fixed compliance errors
  and configurable quality severities. See [configuration](configuration.md).
- Deterministic JSON, readable text with optional color, and distinct exit codes
  for completed below-threshold checks (0), completed findings (1) and incomplete
  operational failures (2).
- Synthetic positive, negative, hostile-input, offline, path-containment,
  interrupted-output and deterministic-report cases. See the
  [acceptance map](acceptance.md) and [compatibility contract](compatibility-contract.md).
- Package-install smoke checks and runnable CI examples exercising both expected
  passing and failing results. See [installation and CI](installation-ci.md).

Reproduce the repository checks from this revision:

```sh
npm ci --ignore-scripts
npm run check
npm run smoke:ci
```

A configured matrix is not proof that a particular revision passed it. The
[repository checks](https://github.com/ivan-bustos/okf-bundle-checker/actions/workflows/check.yml)
provide results for individual commits; local Linux results do not establish
Windows, macOS or another Node version's result. Historical measurements in the
acceptance map describe their recorded snapshot, not a performance commitment
for this alpha. `npm run benchmark` produces new observations for the current host.

## Supported safety boundary

Validation is offline, read-only and bounded by a documented
[input profile](limits.md). It does not upload bundles, open linked computation
resources, execute embedded content or check remote URL availability. Dependency
installation and any CI artifact upload are separate operations.

Use a stable local snapshot. Resource limits are not a hard CPU/memory sandbox,
and portable filesystem checks do not protect against a hostile concurrent
process racing path changes. Symlinks, special files, unsupported parser features
and empty concept scopes are refused with operational exit 2 rather than reported
as successfully validated. Reports can contain filenames, link targets and finding
messages; handle them with the same care as the corresponding bundle metadata.

## Not included in this alpha

Factual correctness or trust judgments, automatic rewriting, hosted dashboards,
computation execution or attestation, external URL availability, heading-anchor
validation, baselines, index generation, automatic PR comments, native code
annotations and SARIF output are outside the implemented scope.

The [issue tracker](https://github.com/ivan-bustos/okf-bundle-checker/issues) records
known work. For a bug report, include the checker/Node versions, OS, policy and
a minimal synthetic reproduction, without private bundle content or secrets.

## Provenance and assets

The [specification pin](spec-pin.json) records its immutable source and checksum;
validation does not download a moving upstream version. Compatibility and CI
fixtures are synthetic. The original `assets/logo.svg` contains no remote assets,
scripts or fonts and is covered by the repository's MIT license.
