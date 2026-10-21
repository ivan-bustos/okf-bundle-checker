# OKF Bundle Checker

An offline Open Knowledge Format bundle checker for local and CI use.

Implementation is tracked in [the MVP roadmap](https://github.com/ivan-bustos/okf-bundle-checker/issues/1).

## Foundation batch (#2–#6)

This branch is a **compliance foundation, not the finished MVP CLI**. It pins and
audits OKF v0.2, discovers an offline bundle safely, parses Markdown/YAML with
source locations, and implements hard checks C001–C003. Custom types, unknown
metadata, missing optional descriptions/indexes, and broken links do not cause
compliance findings. The stricter quality rules, resolver, configuration and
final `check`/text-report contract are later roadmap tickets (#7–#11).

```sh
npm ci --ignore-scripts
npm run check
node dist/cli.js inspect ./knowledge
```

`inspect` is deliberately a development command. It emits a deterministic
foundation JSON report, returning 0 for no compliance findings, 1 for compliance
findings and 2 for an operational failure. A zero exit **does not certify the
whole MVP quality policy**. An empty concept scope is an operational failure.
No validation request uses a network connection or executes bundle content.

## Architecture

- `discovery.ts`: scoped file inventory and bounded reads.
- `parser.ts`: inert UTF-8/YAML/Markdown AST, original source positions and links.
- `compliance.ts`: audited hard rules and finding order.
- `index.ts`: reusable engine composition, independent from the CLI.
- `cli.ts`: development-only argument/output adapter; later policy and final report
  layers can call the engine without invoking the CLI.

`npm run lint` performs an AST-based unsafe-syntax check plus whitespace checks;
`npm run typecheck` applies strict TypeScript checks. `npm test` runs unit,
fixture, filesystem and CLI tests. `npm run smoke` builds a private local tarball,
installs it into a temporary directory and checks the installed CLI. Package
installation may access npm; bundle validation itself does not.

CI candidates are Node 22 and 24 on Linux, Windows and macOS. Support is claimed
only for completed CI evidence, not inferred from the matrix. The local tested
runtime is recorded in the PR. See [limits](docs/limits.md) and the
[normative audit](docs/rule-matrix.md).

## Owner decisions before release

The package name `okf-bundle-checker-development`, binary `okf-checker-dev`, and
version `0.0.0` are private development placeholders, not a published identity.
Package/CLI name, supported release runtime range, license, version, distribution
registry and release approval remain owner decisions in #14. No license grant or
publication is implied by this repository bootstrap. Do not publish this package.
