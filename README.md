![OKF Bundle Checker: linked documents with a check mark](assets/logo.svg)

# OKF Bundle Checker

**Check your knowledge bundle before it reaches your team.**

An offline [Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format)
checker for local workflows and CI. It separates specification violations from
configurable quality advice, with clear locations, deterministic reports and
predictable exit codes. It never uploads your bundle or executes its contents.

## Try it from source

Version **0.1.0 is an unpublished release candidate**. There is no published npm
installation claim. After cloning this repository:

```sh
npm ci --ignore-scripts
npm run check
node dist/cli.js check ./knowledge
node dist/cli.js check ./knowledge --format json --output ../okf-report.json
node dist/cli.js check ./knowledge --fail-on warning
```

Use Node **22 or 24**. Linux, Windows and macOS are covered by the CI matrix.
The selected package name is `okf-bundle-checker` and its command is
`okf-checker`; see [local package installation and CI examples](docs/installation-ci.md).
Package installation may access npm. Bundle validation does not need network access.

## What it checks

- **Compliance, C001–C003:** UTF-8 Markdown, YAML structure, required type and
  reserved-document rules against a [pinned OKF v0.2 audit](docs/rule-matrix.md).
- **Quality, Q001–Q009:** descriptions, broken local links, directory indexes,
  index coverage and optional metadata shapes. Set each to `off`, `warning` or
  `error`; quality never becomes a claim of standards noncompliance.
- **Safe operation:** bounded input, no followed bundle symlinks, inert YAML and
  Markdown, case-sensitive logical links, and report writes outside the bundle.

Custom types, unknown extensions and absent optional metadata remain permitted.
Warnings do not fail the default `error` threshold. Empty concept scopes and
incomplete operational failures never report success.

| Exit | Meaning |
|---|---|
| 0 | Check completed below the configured failure threshold |
| 1 | Check completed with findings at or above the threshold |
| 2 | Invalid configuration, unsupported input, unreadable files or operational failure |

[Rule-by-rule reference](docs/rules.md) ·
[Configure rules and reports](docs/configuration.md) ·
[Limits and security boundaries](docs/limits.md) ·
[Acceptance evidence](docs/acceptance.md) ·
[Release handoff](docs/release-readiness.md)

## Development

```sh
npm run check       # lint, strict types, tests and installed-package smoke
npm run benchmark   # representative observations, not a performance guarantee
```

The engine is reusable independently of the CLI. Discovery, parsing, compliance,
quality, configuration and reporting are separate modules. `inspect` retains the
older compliance-only JSON interface; `check` includes configurable quality.
The [roadmap](https://github.com/ivan-bustos/okf-bundle-checker/issues/1) records
implementation scope and review evidence.

## Scope and release status

Structural checks do not establish that knowledge is true. No AI correctness
judgments, rewriting, remote URL checks, attested execution, dashboards, heading
anchor checks, baselines, index generation, automatic PR comments or SARIF are
included. Validate a stable local snapshot, not a hostile concurrently changing
filesystem.

Licensed under [MIT](LICENSE). The package remains `private: true` until separate
publication approval. No npm name reservation, package release, credentials or
deployment is implied by this release candidate. The logo is original repository-native SVG.
