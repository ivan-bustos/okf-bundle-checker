# Offline, security and portability acceptance

This is the evidence map for [issue #12](https://github.com/ivan-bustos/okf-bundle-checker/issues/12).
It covers the October 21, 2026 draft specification's acceptance criteria, with
the owner's later normative-audit clarification: optional metadata families are
Q006–Q009 quality rules, not the draft C004 hard-compliance proposal.
The [pinned audit](rule-matrix.md) and [compatibility contract](compatibility-contract.md)
remain authoritative for that distinction.

## Reproduce

```sh
npm ci --ignore-scripts
npm run check
npm run build
node --test test/acceptance.test.mjs
node scripts/benchmark.mjs
```

Installation can access npm. The checker does not need network access when
validating a bundle. All acceptance and benchmark corpora are synthetic and are
created in temporary directories, then removed. No private bundle is required.

`test/acceptance.test.mjs` drives the built public CLI or its exported `run`
entry point in a separate process. The normal `npm test` includes this suite;
there is no separate opt-in security test gate.

## Requirement-to-evidence map

| Acceptance requirement | Automated evidence |
| --- | --- |
| Type-only concept passes compliance; absent optional descriptions/indexes are quality-only | `PDF: minimal type-only concept…` checks default warning behavior and explicit disablement. |
| Malformed YAML and missing type yield stable C001/C002 and exit 1 | `PDF: malformed YAML and missing type…` verifies positions and repeated byte-identical JSON. Parser/compliance tests additionally cover mapping shapes, duplicates and UTF-8. |
| Broken links stay quality, with error/off policy control | `PDF: broken links remain quality…` exercises both concept and index links through the CLI. |
| Root/document-relative, nested and reference-style links | `PDF: root/document-relative…` includes assets, a directory without an index, code examples, HTML and external URLs. Resolver/index-quality tests cover percent encoding and query/fragment handling. |
| Reserved files, root version exception and index coverage | `PDF: reserved indexes…` covers a root version declaration, omitted concept, valid leap-day log and invalid nested-index frontmatter. |
| Custom types/extensions and audited conditional metadata | `PDF/audit: custom types/extensions…` verifies Q006–Q009 remain quality even when promoted to errors. `PDF/audit: all versioned shared compliance fixtures…` executes every fixture in the shared manifest through the CLI. Focused metadata tests cover individual audited field clauses. |
| Config precedence and exclusions | `PDF: explicit config overrides…` covers explicit-versus-cwd selection, CLI threshold override, excluded entry counts, invalid rules/severities/compliance demotion and empty selected scope. |
| Empty scope and unsupported version return exit 2 | `PDF: empty reserved-only scope…` and configuration tests require a non-success operational result. |
| Text and JSON carry equivalent findings | `PDF: text and JSON…` checks every ordered finding, path, location, provenance, layer, severity, message, remediation and total, not just exit status. |
| Passing/failing GitHub Actions example | `test/ci-examples.test.mjs` and `scripts/ci-example-smoke.mjs` exercise the version-pinned handoff examples. See [installation and CI](installation-ci.md). The release registry is not probed or published by acceptance tests. |
| No network dependence or bundle execution | `offline/inert: external URLs…` runs under self-tested network/process/evaluation guards, includes HTML, scripts, shell-like text, YAML strings, inline computations, and computation/executor/attester resources. Computation assets are explicitly forbidden reads, a write canary remains absent, and all input bytes remain unchanged. |
| YAML constructors, aliases, nesting and size limits | `hostile YAML: constructors…` checks custom constructor tags, 4,000 aliases, 1,000 nesting levels, excessive frontmatter, and a >1 MiB document. Operational failures cannot become successful reports. |
| Malformed encoding | `hostile encoding: invalid UTF-8…` requires C001 and exit 1, distinguishing invalid format from operational resource refusal. |
| Traversal and symlink containment | `containment: traversal…` rejects ordinary/encoded parent traversal and encoded separators without opening an existing outside canary; `containment: a real escaping symlink…` fails before target read. Discovery tests also cover links/chains and containment budgets. |
| Hostile filenames and terminal controls | `portable hostile filenames…` supplies control/bidi/backslash names through the directory boundary, even when the host cannot create those names. They must be rejected before read and must not leak raw into diagnostics. Report tests also escape source-derived controls. |
| Unreadable input/configuration | `read failures: EACCES…` injects actual filesystem API failures for a selected concept, nested directory and explicit policy. Each test asserts the injected operation was reached. It cannot pass merely because root or Windows ignores POSIX permission bits. |
| Output failure is not success or input loss | `output failures: failed atomic publication…` injects rename failure, requires exit 2, checks the previous report survives and temporary files are removed. CLI tests separately cover unsafe destinations, interruption and broken output pipes. |
| Deterministic logical results | `determinism: identical snapshots…` repeats JSON across reversed file-creation order, distinct temporary roots, locales and time zones. Report unit tests cover ordering and ties. Benchmark repeats assert byte-identical JSON. |
| Cross-platform case-sensitive identity | `portable identity: exact logical case…` always runs: `Exact.md` exists, `exact.md` must still be missing, uppercase `.MD` is an asset, and `Index.md` is a concept rather than a reserved index. No case-insensitive-host skip hides this assertion. |

## What the instrumentation proves, and what it does not

`test/helpers/guarded-check.mjs` installs guards before importing the checker and
synchronizes modified Node built-in exports. It records and rejects calls to
HTTP/HTTPS/HTTP2, DNS, TCP/TLS/UDP, fetch/WebSocket, child processes, workers,
eval/Function and VM evaluation entry points. Representative guards self-test
before validation. Even a caught forbidden call fails the parent assertion.
The file-read guards separately detect attempts to open specified resources or
outside canaries. Permission failures are injected at filesystem APIs, without
changing the checker's production error handling or reducing its checks.

This is regression instrumentation, not an operating-system network namespace,
complete JavaScript sandbox, fuzzing proof or protection against malicious code
inside the checker itself. It verifies the tested validation paths and fixtures.
The package is intended to read untrusted inert bundle data, not to sandbox
arbitrary plugins or run bundle programs.

A stable local snapshot is required. The [bounded-input profile](limits.md)
documents parser/discovery budgets and the limits of portable race protection.
The 20-second subprocess test timeout prevents a hung regression test; it is not
a supported-bundle performance promise. AST limits are not hard CPU/RSS limits.

## Platform evidence

The CI matrix selects Node 22 and Node 24 on Linux, Windows and macOS. A configured
matrix is not evidence that a commit passed it. Inspect the PR checks for the
exact release-candidate SHA before claiming the full matrix is verified.

Local evidence collected on October 22, 2026:

- Linux x64, kernel 6.18.55, Node 24.19.0.
- The new focused acceptance suite: 20 passed, 0 failed, 0 skipped.
- Full local test suite at this working-tree snapshot: 115 passed, 0 failed,
  1 expected case-sensitive-filesystem skip (116 total).
- Full final-commit checks and the six CI combinations must be associated with
  their actual run/commit evidence in the PR. This document does not substitute
  local Linux execution for macOS, Windows or Node 22 execution.

An actual symlink test may skip only when the host refuses creation; that skip is
reported. The older discovery case-collision fixture skips on filesystems that
cannot hold both names, and the output case-alias test skips on case-sensitive
filesystems. The new exact-case logical-link assertion is unconditional on every
host. Synthetic hostile-name and EACCES tests are also unconditional. Temporary
fixtures and guard targets use canonical paths so symlinked temp directories
(such as macOS `/var` aliases) do not silently bypass fault injection.

## Representative performance measurements

Reproduce with `node scripts/benchmark.mjs` after building. Three synthetic
corpora contain 25, 250 and 1,000 concepts with descriptions, valid optional
metadata, root and group indexes, local/reference/directory/asset/external links,
and inert code examples. Every corpus is expected to yield zero findings; this
is asserted, as is identical JSON across repeats.

Each corpus runs in its own subprocess. Fixture generation and module/process
startup are excluded from timing. After one warmup, three measurements include
discovery, document reads, UTF-8/YAML/Markdown parsing, all default rules and JSON
rendering. They are warm-cache measurements, not cold-disk or CLI-startup latency.
Peak RSS is the whole subprocess lifetime peak, including imports, setup,
warmup and all measured iterations, not an engine-only allocation measurement.

Measured October 22, 2026 at 17:52 UTC on Linux x64, Node 24.19.0, an AMD EPYC 9V74
host exposing 9 logical CPUs. Other workloads and host scheduling were not
controlled; these are observations, not dedicated-hardware results.

| Concepts / documents | Input bytes | Timed samples (ms) | Median (ms) | Concepts/sec at median | Process peak RSS (KiB) |
| --- | ---: | --- | ---: | ---: | ---: |
| 25 / 31 | 96,334 | 164.36, 124.17, 84.74 | 124.17 | 201.34 | 118,944 |
| 250 / 261 | 804,129 | 706.02, 643.15, 739.84 | 706.02 | 354.10 | 258,260 |
| 1,000 / 1,021 | 3,163,519 | 2,284.71, 2,403.28, 2,415.75 | 2,403.28 | 416.10 | 370,404 |

The script emits machine-readable JSON with runtime/host details, samples,
counts, bytes, memory observations and deterministic report SHA-256 values.
These results do not establish a throughput SLA, maximum supported bundle size,
linear scaling, worst-case behavior or a memory ceiling. The configured safety
budgets remain documented separately; adversarial structures can cost much more
than these representative corpora. No network or computation work is included.
