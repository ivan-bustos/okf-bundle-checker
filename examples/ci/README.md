# Offline CI fixtures

These are small, synthetic bundles for testing the documented command, not real
knowledge or the cross-project compatibility fixtures. Run from a built checkout:

```sh
node scripts/ci-example-smoke.mjs --output reports/ci-examples
```

The runner invokes the real CLI as a Node child process without a shell. It uses
explicit policies, checks both process and JSON results, and collects one JSON
report plus stdout/stderr logs per case and a `summary.json` file. It exits zero
only if every expected result is verified; any mismatch, incomplete check, missing
report or malformed JSON fails the runner. Each case has a 30-second safety timeout,
not a performance promise. Previously collected per-case reports are removed before
the next check so an operational failure cannot look like an earlier success.

Expected cases in [`cases.json`](cases.json):

- `passing`: exit 0 and no findings.
- `compliance-failure`: exit 1, C002 compliance/error for a missing required type.
- `quality-failure`: exit 1, Q002 quality/error because `strict-links.yml` explicitly
  promotes the broken-link policy. There are no compliance findings.
- `quality-warning`: the same broken link at default warning severity, exit 0.
- `quality-threshold`: the same warning with `--fail-on warning`, exit 1; its layer
  and severity stay quality/warning.

The first three cases demonstrate the required passing and failing CI gates. The
last two show that optional quality policy is not specification conformance.
`missing.md` is deliberately absent from the quality-failure bundle. Do not fix it.

[`github-actions.yml`](github-actions.yml) is an inactive, source-install example.
It uses the immutable workflow-event commit, the checked-in npm lockfile, and
Node 22/24 across Linux, Windows and macOS. It is not evidence that every matrix
job has passed and does not claim a published package is available. See
[installation and CI](../../docs/installation-ci.md) for pinned installation, generic
Linux CI, report collection and the runtime-support boundary.
