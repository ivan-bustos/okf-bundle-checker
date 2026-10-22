# Pinned installation and portable CI

## Release status and supported targets

The intended npm package is `okf-bundle-checker`, command `okf-checker`, initial
version `0.1.0`, licensed MIT. This repository is release preparation, not an npm
publication: `private: true` remains a deliberate publication guard. No released
registry version or package-name availability is claimed here. Do not run an
unverified registry install or use `npx` to resolve the intended name implicitly.

Node 22 and Node 24 are the validation matrix targets on Linux, Windows and macOS.
The CLI is Node-based and uses no OS-specific validator executable. The package's
Node engine range is an installation constraint, not evidence for untested major versions
or every OS distribution. Claim a runtime/OS combination as verified only when its
job passed for the exact release-candidate commit; a workflow definition is not a
passing result. The source and local-package examples below work before publication.

The normative specification is also pinned: OKF v0.2 at
`0b87c52c6ef999286c745e19998fdfcd03d5dbee`. The checked-in
[`spec-pin.json`](spec-pin.json) records the source and checksum. Validation does
not download that source or consult a moving branch.

## Install from a reviewed source revision (Linux CI)

Start with an authorized checkout of this repository at a reviewed full commit
SHA. Configure your CI checkout step with that immutable SHA, not `main`, a moving
feature branch, or `latest`. The GitHub example uses its exact event commit
(`${{ github.sha }}`); an external consuming project should supply its own reviewed
checker commit. Keep `package-lock.json` from that same revision.

From the checkout root, with Node 22 or 24 and npm available:

```sh
# Record the actual immutable source identity in the build log/artifact metadata.
git rev-parse HEAD
npm ci --ignore-scripts
npm run build
node dist/cli.js check examples/ci/bundles/passing \
  --config examples/ci/policies/default.yml
node scripts/ci-example-smoke.mjs --output reports/ci-examples
```

`npm ci` uses the checked-in lockfile and may access the npm registry for dependencies.
After dependencies and the built CLI are present, validation is offline. There is
no publishing credential, service account, external validator, or Git-provider API
call in the check command. A checkout or dependency download is an installation
step, not part of bundle validation. For network-isolated CI, provision the reviewed
checkout, dependencies and runtime in the CI image or an approved dependency cache
before disabling network access; installing an uncached package is not an offline
operation.

The same check used locally is used in CI:

```sh
node dist/cli.js check ./knowledge --config ./policy.yml
```

Run from a known working directory. An explicit `--config` avoids accidentally
inheriting a developer's `.okf-validator.yml`; see
[configuration precedence](configuration.md). Do not place generated reports
inside `./knowledge`.

## Install a local, pinned package without publishing

A local npm tarball tests the real installed command while the package stays
private. Build it from the reviewed source checkout, record its SHA-256 checksum,
and retain that exact artifact rather than repacking an arbitrary branch later.
This Linux example uses temporary paths and assumes the checkout has been built:

```sh
CHECKER_SOURCE="$PWD"
PACKAGE_DIR="$(mktemp -d)"
INSTALL_DIR="$(mktemp -d)"
# Use a writable cache even in CI images without a writable home directory.
export npm_config_cache="$INSTALL_DIR/npm-cache"
npm pack --ignore-scripts --pack-destination "$PACKAGE_DIR"
sha256sum "$PACKAGE_DIR/okf-bundle-checker-0.1.0.tgz"
npm install --ignore-scripts --no-audit --no-fund \
  --prefix "$INSTALL_DIR" "$PACKAGE_DIR/okf-bundle-checker-0.1.0.tgz"
"$INSTALL_DIR/node_modules/.bin/okf-checker" check \
  "$CHECKER_SOURCE/examples/ci/bundles/passing" \
  --config "$CHECKER_SOURCE/examples/ci/policies/default.yml"
node scripts/ci-example-smoke.mjs \
  --cli "$INSTALL_DIR/node_modules/okf-bundle-checker/dist/cli.js" \
  --output reports/installed-ci-examples
```

This installs only a local tarball for the checker itself; npm may still fetch its
runtime dependencies. The source lockfile pins source builds, but a standalone
`npm install` may resolve transitive dependencies again. For reproducible consumer
installs, retain and review the consumer lockfile and artifact, then use `npm ci`
with that lockfile. Installing a private local tarball does not publish it.

The underlying cross-platform invocation is
`node <installation>/node_modules/okf-bundle-checker/dist/cli.js check <bundle>`.
On Windows, an npm-generated `.bin` command shim ends in `.cmd`; the smoke runner
uses `process.execPath` directly, so its behavior does not depend on shell shims.
Temporary directories in this example can be removed once their artifacts and
reports are no longer needed.

## Published install template: blocked until a release exists

The following is deliberately gated and is NOT a working released-install claim.
Only after separately authorized publication and verification of the actual release
should the placeholder be replaced with its exact reviewed version. The planned
`0.1.0` is not evidence that that version currently exists. Never substitute
`latest`, a range, an unreviewed package, or an unverified namespace collision.

```sh
CHECKER_RELEASE_VERSION='REPLACE_WITH_VERIFIED_PUBLISHED_VERSION'
# Deliberately stops before npm until an exact release version has been selected.
node -e 'if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(process.argv[1])) { console.error("No verified released checker version is configured."); process.exit(2); }' \
  "$CHECKER_RELEASE_VERSION" || exit "$?"
npm install --ignore-scripts --no-audit --no-fund --save-exact \
  "okf-bundle-checker@$CHECKER_RELEASE_VERSION"
./node_modules/.bin/okf-checker check ./knowledge --config ./policy.yml
```

Commit the resulting approved consumer lockfile and use `npm ci --ignore-scripts`
on later CI runs. The final released-install example must name the actual pinned
published version and be revalidated before this gate is removed. This document
and its examples do not grant publication approval or require npm publishing tokens.

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
remain outside this MVP. Structural checks are not a factual-correctness guarantee.
