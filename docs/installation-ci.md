# Installation and portable CI

## Version and supported targets

This guide targets **`okf-bundle-checker@1.0.0-alpha.1`**, with the command
`okf-checker`. It is an alpha, not a stable 1.0 release. This checkout does not
establish that the version is available on npm; the source and local-package
options below work independently of registry availability.

Use Node **22 or 24**. The CI matrix covers both Node lines on Linux, Windows and
macOS. The CLI is Node-based and uses no OS-specific validator executable. The
engine range does not establish support for untested Node majors or every OS
version. Check the [CI results](https://github.com/ivan-bustos/okf-bundle-checker/actions/workflows/check.yml)
for the exact revision: a configured matrix is not a passing result.

Validation targets OKF v0.2 at
`0b87c52c6ef999286c745e19998fdfcd03d5dbee`. The checked-in
[`spec-pin.json`](spec-pin.json) records the source and checksum. Validation does
not download that source or consult a moving branch.

## Run from source

Use a checkout or source archive for a reviewed revision of
[this repository](https://github.com/ivan-bustos/okf-bundle-checker), with its
matching `package-lock.json`. For reproducible CI, select an immutable full
commit SHA rather than a moving branch. Record the revision with your build
artifacts; in a Git checkout, `git rev-parse HEAD` reports it.

From the source root, with Node 22 or 24 and npm available:

```sh
npm ci --ignore-scripts
npm run build
node dist/cli.js check examples/ci/bundles/passing --config examples/ci/policies/default.yml
node scripts/ci-example-smoke.mjs --output reports/ci-examples
```

To check your own bundle, use the same command locally and in CI:

```sh
node dist/cli.js check ./knowledge --config ./policy.yml
```

`./knowledge` and `./policy.yml` are your bundle and policy paths. Run from a known
working directory. An explicit `--config` avoids inheriting an unintended
`.okf-validator.yml`; see [configuration precedence](configuration.md). Point the
command at the intended knowledge directory rather than a project root containing
unrelated Markdown. Do not place generated reports inside the bundle.

`npm ci` uses the checked-in lockfile and may access the registry. After dependencies
and the built CLI are present, validation is offline. The check command requires
no account credentials, external validator or Git-provider API.
For isolated CI, provision the runtime, reviewed source and dependencies in the
image or an approved cache before disabling the network. An uncached install is
not an offline operation.

## Install a local npm tarball

A local tarball lets you use the installed command without a registry release.
Build it from the reviewed source checkout or source archive and retain its
checksum alongside that exact artifact. This **Linux shell** example runs
from the source root:

```sh
npm ci --ignore-scripts
npm run build
CHECKER_SOURCE="$PWD"
PACKAGE_DIR="$(mktemp -d)"
INSTALL_DIR="$(mktemp -d)"
# Use a writable cache in CI images without a writable home directory.
export npm_config_cache="$INSTALL_DIR/npm-cache"
npm pack --ignore-scripts --pack-destination "$PACKAGE_DIR"
sha256sum "$PACKAGE_DIR/okf-bundle-checker-1.0.0-alpha.1.tgz"
npm install --ignore-scripts --no-audit --no-fund \
  --prefix "$INSTALL_DIR" "$PACKAGE_DIR/okf-bundle-checker-1.0.0-alpha.1.tgz"
"$INSTALL_DIR/node_modules/.bin/okf-checker" check \
  "$CHECKER_SOURCE/examples/ci/bundles/passing" \
  --config "$CHECKER_SOURCE/examples/ci/policies/default.yml"
node scripts/ci-example-smoke.mjs \
  --cli "$INSTALL_DIR/node_modules/okf-bundle-checker/dist/cli.js" \
  --output reports/installed-ci-examples
```

The checker artifact is local; npm may still fetch its runtime dependencies. A
standalone install can resolve transitive dependencies again. For reproducible
consumer installs, retain the artifact and review the consuming project's lockfile,
then use `npm ci --ignore-scripts` with that lockfile on subsequent runs.

The underlying cross-platform invocation is:

```text
node <installation>/node_modules/okf-bundle-checker/dist/cli.js check <bundle>
```

On Windows, npm's `.bin` command shim ends in `.cmd`. The smoke runner invokes Node
directly and does not depend on shell shims. The shell variables, `mktemp` and
`sha256sum` above are Linux conveniences, not requirements of the checker. Remove
temporary directories when their artifacts and reports are no longer needed.

## Install from npm once the alpha is available

The command below is conditional on **this exact version** being available from
the project's npm package. Verify the package metadata points to this repository
before installing it. If it is not available, use a source or local-tarball install
above rather than selecting an unrelated package or an implicit `npx` download.

From a consuming project, pin the version explicitly:

```sh
npm install --ignore-scripts --no-audit --no-fund --save-dev --save-exact okf-bundle-checker@1.0.0-alpha.1
./node_modules/.bin/okf-checker check ./knowledge --config ./policy.yml
```

Retain the resulting consumer lockfile and use `npm ci --ignore-scripts` in CI.
Do not rely on `latest` or a version range for a reproducible alpha installation.
The same `check` flags, reports and exit codes apply to source and installed usage.

## Exit status and fixture evidence

A check returns:

- `0`: completed below the selected failure threshold. Warnings may still exist.
- `1`: completed with compliance or configured quality findings at/above threshold.
- `2`: incomplete because of configuration, unsupported version, unreadable/unsafe
  input, empty concept scope, output failure, cancellation, or a tool error. Never
  interpret this as a clean bundle or as an expected validation finding.

The synthetic examples run the same real CLI, not a mock:

```sh
# 0: no findings.
node dist/cli.js check examples/ci/bundles/passing \
  --config examples/ci/policies/default.yml

# 1: C002 compliance/error, missing required type.
node dist/cli.js check examples/ci/bundles/compliance-failure \
  --config examples/ci/policies/default.yml

# 1: Q002 quality/error, explicitly promoted broken-link policy.
node dist/cli.js check examples/ci/bundles/quality-failure \
  --config examples/ci/policies/strict-links.yml
```

Do not put those three commands under an unconditional `set -e` and expect all
three to run. Use the smoke runner to assert the intentional failures, or capture
each status explicitly. The runner also verifies the broken-link bundle exits 0
under default warning severity, and exits 1 with `--fail-on warning` without
changing its quality layer. Its own exit code is 0 only when all expected results
and reports match, otherwise 1. This harness exit is distinct from checker exit 2.

[`examples/ci/github-actions.yml`](../examples/ci/github-actions.yml) demonstrates
checkout, Node setup, lockfile install, build, expected-result assertions and
`if: always()` report collection on all six Node/OS combinations. It stays under
`examples/`, so it is not an enabled workflow or a claim of completed matrix runs.
The repository's active checks can run the same smoke command. To verify the
examples with an installed tarball, use the runner's `--cli` option as shown above.

## Generic Linux CI and report collection

A shell runner should propagate the checker's actual status while preserving reports
from completed failing checks. This POSIX shell example deliberately handles
nonzero status rather than masking it with `|| true` or a pipeline:

```sh
set -eu
REPORT_DIR="$(mktemp -d)"
# Store REPORT_DIR as your CI system's artifact path before this step exits.
printf 'Report directory: %s\n' "$REPORT_DIR"
status=0
node dist/cli.js check ./knowledge --config ./policy.yml \
  --format json --output "$REPORT_DIR/report.json" \
  >"$REPORT_DIR/stdout.log" 2>"$REPORT_DIR/stderr.log" || status=$?
printf '%s\n' "$status" >"$REPORT_DIR/exit-code.txt"
# Configure a separate always-run artifact step for this directory.
exit "$status"
```

`--output` requires an existing directory outside the bundle. Both completed exit
0 and exit 1 checks create a complete JSON report; stdout is empty. Exit 2 emits a
diagnostic on stderr and may leave a previous report untouched. Use a fresh report
directory per run as above, collect stderr and the exit code, and verify both
`completed: true` and a matching `exitCode` before consuming JSON. A stale or partial
file must never be treated as a current success. See the full
[report/output safety contract](configuration.md).

Reports can contain bundle-relative filenames, link targets and finding messages.
Keep artifact retention and access appropriate to the bundle; report collection is
an explicit CI upload, separate from the offline checker, and never needs the
bundle source bodies. The example workflow uploads only synthetic reports/logs.

Validation does not upload bundles, check external URL availability, execute
embedded computation, contact Git-provider APIs, post PR comments, create native
code annotations or emit SARIF. Automatic PR comments, native annotations and SARIF
remain outside this alpha. Structural checks are not a factual-correctness guarantee.
