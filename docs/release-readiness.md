# Release guide and validation boundaries

This source tree prepares **OKF Bundle Checker 1.0.0**. Creating a tag, publishing
a GitHub release and publishing to npm are separate maintainer actions. Package
metadata does not prove that an artifact is available from either service.
The [installation guide](installation-ci.md) covers source, local-package and npm use.

| Item | Release target |
| --- | --- |
| Package / command | `okf-bundle-checker` / `okf-checker` |
| Version / Git tag | `1.0.0` / `v1.0.0` |
| npm distribution tag | `latest` |
| License | [MIT](../LICENSE) |
| Supported Node lines | 22 and 24 |
| CI matrix | Linux, Windows and macOS, on both Node lines |
| Specification | OKF v0.2, pinned to `0b87c52c6ef999286c745e19998fdfcd03d5dbee` |
| Report format | JSON `schemaVersion: 1`, plus human-readable text |

Pin the exact package version and review the [changelog](../CHANGELOG.md) before
upgrading. The supported runtime, input limits and validation scope below apply
to version 1.0.0.

## Prepare the release

1. Review and merge the 1.0.0 preparation PR. Select the exact merged `main` commit
   to release, record its SHA, and verify that all six Node/OS CI jobs passed for
   that commit. Do not tag the feature-branch tip or a moving, unreviewed revision.
2. From a clean checkout of that commit, install the lockfile and run the checks:

   ```sh
   npm ci --ignore-scripts
   npm run check
   npm run smoke:ci
   git diff --check
   git status --short
   git rev-parse HEAD
   ```

   The working tree must remain clean. The tests compare package/lockfile,
   CLI-help and JSON-report versions and enforce the release metadata. The package
   smoke check installs the tarball, tests its CLI, ESM and TypeScript entrypoints,
   and verifies offline npx invocation and all nine CI examples.
3. Build the deliverable from that same checkout. This Linux shell example writes
   outside the repository so packaging cannot dirty the release source:

   ```sh
   PACKAGE_DIR="$(mktemp -d)"
   npm pack --pack-destination "$PACKAGE_DIR"
   (cd "$PACKAGE_DIR" && sha256sum okf-bundle-checker-1.0.0.tgz > SHA256SUMS.txt)
   printf 'Release artifacts: %s\n' "$PACKAGE_DIR"
   ```

   Inspect the package file list and retain the archive and checksum. Do not
   rebuild from a different commit for publication.
4. When authorized to create the release tag, set `RELEASE_COMMIT` to the recorded
   full commit SHA. The following commands are a maintainer checklist, not an
   action performed by the preparation PR:

   ```sh
   set -eu
   git fetch origin main --tags
   git switch --detach "$RELEASE_COMMIT"
   test -z "$(git status --porcelain)"
   git merge-base --is-ancestor "$RELEASE_COMMIT" origin/main
   test "$(node -p 'require("./package.json").version')" = 1.0.0
   test -z "$(git tag --list v1.0.0)"
   if git ls-remote --exit-code --tags origin refs/tags/v1.0.0; then
     echo "v1.0.0 already exists on origin; stop."
     exit 1
   else
     status=$?
     test "$status" -eq 2 || exit "$status"
   fi
   ```

   The remote check accepts only exit **2**, meaning no matching tag, before
   proceeding. Any authentication/network error or existing tag stops the checklist. Never force or replace an existing release tag.

   ```sh
   git tag -a v1.0.0 "$RELEASE_COMMIT" -m "OKF Bundle Checker 1.0.0"
   git show --no-patch v1.0.0
   git push origin refs/tags/v1.0.0
   ```

   Verify the remote tag resolves to the selected commit. The repository workflow
   runs checks on pushes; it does not publish packages or create GitHub releases.
5. Create the GitHub release for `v1.0.0` when authorized, use the 1.0.0 changelog
   as release notes, and attach the tested archive and `SHA256SUMS.txt`. npm
   publication is handled by the maintainer separately, using the same archive:

   ```sh
   npm publish "$PACKAGE_DIR/okf-bundle-checker-1.0.0.tgz" --access public --tag latest
   npm view okf-bundle-checker@1.0.0 version dist.integrity
   npm view okf-bundle-checker dist-tags --json
   ```

   Confirm the exact version is available and `latest` selects `1.0.0` before
   announcing npm availability. Do not infer publication from a successful build,
   a version field, a Git tag or a GitHub release.

## Implemented and covered by automated checks

- A narrow normative compliance core, C001–C003, separated from configurable
  quality advice, Q001–Q010. Custom types, extensions and absent optional metadata
  are accepted. Q010 is opt-in. See the [rule catalog](rules.md) and [normative audit](rule-matrix.md).
- Explicit configuration precedence, scoped exclusions, fixed compliance errors
  and configurable quality severities. See [configuration](configuration.md).
- Deterministic JSON for the same inputs and reference time, readable text with
  optional color, and distinct exit codes for completed below-threshold checks (0),
  completed findings (1) and incomplete operational failures (2).
- Synthetic positive, negative, hostile-input, offline, path-containment,
  interrupted-output and deterministic-report cases. See the
  [acceptance map](acceptance.md) and [compatibility contract](compatibility-contract.md).
- Package-install smoke checks and runnable CI examples exercising expected
  passing and failing results, including fixed-clock freshness checks.

A configured matrix is not proof that a particular revision passed it. The
[repository checks](https://github.com/ivan-bustos/okf-bundle-checker/actions/workflows/check.yml)
provide results for individual commits; local Linux results do not establish
Windows, macOS or another Node version's result. `npm run benchmark` produces
observations for the current host, not a performance commitment.

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

## Outside the implemented scope

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
