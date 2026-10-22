![OKF Bundle Checker: linked documents with a check mark](assets/logo.svg)

# OKF Bundle Checker

**Check your knowledge bundle before it reaches your team.**

An offline [Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format)
checker for local workflows and CI. Catch structural violations, broken local
links and missing index coverage without uploading your bundle or executing its
contents. Standards compliance and configurable quality advice stay separate.

**First alpha: `1.0.0-alpha.1`.** This checkout prepares the alpha; it does not
claim an npm release is already available. Expect changes before a stable 1.0
release. See the [changelog](CHANGELOG.md) and [alpha status](docs/release-readiness.md).

## Quick start

Use Node **22 or 24**. From a checkout or extracted source archive of this version:

```sh
npm ci --ignore-scripts
npm run build
node dist/cli.js check ./knowledge
```

Replace `./knowledge` with your bundle directory, not an entire project that also
contains unrelated Markdown. To try a bundled passing example, use
`examples/ci/bundles/passing`.

The package name is `okf-bundle-checker` and the installed command is
`okf-checker`. See [installation and CI](docs/installation-ci.md) for local
tarball installation and the exact-version npm command to use once available.
Dependency installation may access npm; bundle validation works offline.
The CI matrix covers Node 22 and 24 on Linux, Windows and macOS.

## Use it locally or in CI

```sh
# Check with the default policy: compliance errors fail, quality warnings do not.
node dist/cli.js check ./knowledge

# Select a policy explicitly and save a machine-readable report outside the bundle.
node dist/cli.js check ./knowledge --config ./policy.yml --format json --output ./okf-report.json

# Fail on warnings too, or disable terminal styling.
node dist/cli.js check ./knowledge --fail-on warning
node dist/cli.js check ./knowledge --color never
```

By default, the checker reads `.okf-validator.yml` from the working directory if
present. `--config` selects a different file. Text reports group findings by
severity and path, with locations, rule IDs and suggested fixes. Color is automatic
for interactive terminals; `--color always|never|auto` controls it explicitly.
JSON reports are deterministic and never colored.

| Exit | Meaning |
| --- | --- |
| 0 | Check completed below the selected failure threshold; warnings may remain |
| 1 | Check completed with findings at or above the threshold |
| 2 | Check could not complete: invalid configuration, unsupported or unreadable input, or another operational failure |

Treat exit 2 as an incomplete check, never a clean bundle. A report's parent
directory must already exist outside the bundle. See the
[configuration and report contract](docs/configuration.md) for safe CI handling.

## What it checks

- **Compliance, C001–C003:** UTF-8 Markdown, YAML frontmatter, required concept
  type and reserved index/log rules from a [pinned OKF v0.2 audit](docs/rule-matrix.md).
- **Quality, Q001–Q009:** descriptions, local links, directory indexes, index
  coverage and supplied metadata shapes. Each rule accepts `off`, `warning` or
  `error`. Promoting quality to an error does not make it standards noncompliance.
- **Bounded, read-only validation:** no followed bundle symlinks, no execution of
  YAML or Markdown content, case-sensitive logical links and reports written
  outside the bundle.

Custom types, extension metadata and absent optional metadata remain permitted.
See the [rule-by-rule catalog](docs/rules.md) for examples and remediation, and
[input limits](docs/limits.md) for the supported filesystem and parser profile.

## Alpha boundaries

Structural checks do not prove that knowledge is true or safe to act on. There
are no AI judgments, rewrites, external URL checks, computation execution,
heading-anchor checks, baselines, index generation, PR comments or SARIF output.
Check a stable local snapshot, not a hostile concurrently changing filesystem.
This alpha is not a production-readiness or performance guarantee.

[Report a bug](https://github.com/ivan-bustos/okf-bundle-checker/issues/new) with the
checker version, Node version, OS, relevant policy and a small synthetic example.
Do not include private bundle content or secrets. See
[existing issues](https://github.com/ivan-bustos/okf-bundle-checker/issues) for known
work and the [acceptance evidence](docs/acceptance.md) for test coverage and its limits.

## Development

```sh
npm run check       # lint, strict types, tests and installed-package smoke
npm run smoke:ci    # assert passing/failing CI examples and collect reports
npm run benchmark   # representative observations, not a performance guarantee
```

The engine is reusable independently of the CLI. `inspect` preserves the older
compliance-only JSON interface; `check` includes configurable quality.

Licensed under [MIT](LICENSE), including the original repository-native SVG logo.
