# OKF Bundle Checker

An offline Open Knowledge Format bundle checker for local and CI use.

Implementation is tracked in [the MVP roadmap](https://github.com/ivan-bustos/okf-bundle-checker/issues/1).

## Offline checks

The compliance foundation (#2–#6) and configurable quality/config/reporting
implementation (#7–#11) are available. This is still a private development build,
not a released package. Security/performance acceptance and release handoff
remain separate roadmap gates (#12–#14).

```sh
npm ci --ignore-scripts
npm run check
node dist/cli.js check ./knowledge
node dist/cli.js check ./knowledge --format json --fail-on warning
```

C001–C003 enforce the audited hard core. Q001–Q009 offer configurable quality;
custom types, unknown extensions and absent optional metadata families remain
permitted. Default quality severity is warning, and the default failure threshold
is error. Use explicit policy to make warnings fail CI. An empty concept scope
is an operational failure, not success. No check uploads content, checks external
URL availability, executes computations or certifies factual correctness.

See [configuration and report contract](docs/configuration.md) for precedence,
output safety, exit codes and examples. `inspect` retains the older compliance-only
JSON interface; `check` includes quality. The private binary is `okf-checker-dev`.

## Architecture

- `discovery.ts`: scoped file inventory and bounded reads.
- `parser.ts`: inert UTF-8/YAML/Markdown AST, original source positions and links.
- `compliance.ts`: audited hard rules and finding order.
- `index.ts`: reusable engine composition, independent from the CLI.
- `resolver.ts`, `metadata-quality.ts`, `index-quality.ts`: inventory-only resolution and quality.
- `config.ts`, `policy.ts`: bounded configuration and explicit severity policy.
- `report.ts`, `cli.ts`: deterministic rendering and thin argument/output adapter.

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
