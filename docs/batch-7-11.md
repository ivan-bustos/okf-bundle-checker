# Quality/configuration/reporting acceptance map (#7–#11)

Historical batch record. The later owner-approved identity and release preparation
are documented in [release readiness](release-readiness.md); pending decisions below
describe the state of this earlier batch, not the current release candidate.

Base: merged foundation PR #15, main commit
`252d8918ca2d1b4550f9609962c7b08d476ef564`.
This batch does not duplicate #2–#6 or change the shared compliance fixture contract.

- #7: `metadata-quality.ts` and focused tests cover Q006–Q009, absent families,
  partial/malformed shapes, bare verification mappings, custom extensions/types,
  inert computation resources and all severity settings. See configuration.md
  for explicit conservative interpretations and per-family timestamp ownership.
- #8: `resolver.ts` and tests cover root/document-relative, encoded and fragment/query
  links, exact-case targets, directories/assets, escaping paths and external schemes.
  Q002 is quality-only and never follows a link or checks network availability.
- #9: `index-quality.ts` and tests cover Q001 descriptions, Q003 root/all index scope,
  Q004 concept/child-directory coverage, Q005 AST entry descriptions, duplicate
  entries, empty selected inventories, exclusions and each rule's severity/disablement.
- #10: `config.ts` and table-driven tests cover explicit/cwd/default precedence,
  CLI threshold override, bounded safe parsing, unknown schema/rule rejection,
  compliance immutability and resolved policy reporting.
- #11: `report.ts`, `cli.ts` and integration tests cover `check`, requested options,
  text/JSON parity, stable order/counts, quality versus compliance, threshold exits,
  operational failures, interruption and safe report-file handling. Packed-install
  smoke exercises both legacy `inspect` and new `check`.

The existing private development command remains `okf-checker-dev check`.
Final public package/CLI spelling is explicitly **pending owner decision** in #14;
this batch does not invent that choice. #11's implementation is reviewable, but
its final-name acceptance remains open. This map is not evidence of merge state.
Refer to the PR for exact test counts, tested commit and CI results. Offline
security/performance acceptance (#12), portable installation handoff (#13), and
release decisions (#14) are not claimed complete here.
