# Beta.2 status and release handoff

`1.0.0-beta.2` is an **unpublished source beta** targeting OKF v0.3 and retaining
v0.2 compatibility. beta.1 already exists, so its version is not reused.
No release tag, npm publication, merge or deployment is part of this change.
PR #24 and its separate 1.0.0 preparation branch are not modified.

| Item | Target |
| --- | --- |
| Package / CLI | okf-bundle-checker / okf-checker |
| Version / eventual npm tag | 1.0.0-beta.2 / beta |
| Node / CI | Node 22 and 24; Linux, macOS, Windows |
| Spec pins | [v0.3](spec-pin-v03.json), [v0.2](spec-pin.json) |
| Report | schemaVersion 1; selected specVersion 0.2 or 0.3 |
| Scope | [Normative audit and limitations](v03-support.md) |

Before any separately authorized publication, review the PR, select the exact
merged commit and verify that commit's CI matrix. Run `npm ci --ignore-scripts`,
`npm run check`, `npm run smoke:ci`, inspect `npm pack --dry-run`, and confirm
version availability again. Review the tarball and checksums. Tagging and npm
publication are separate maintainer actions; never infer release from a green PR.

The beta does not claim full OKF consumer support, trust tiers, runtime
attestation, metadata-path graph construction or semantic correctness. See the
[installation guide](installation-ci.md) for source/local-package usage.
