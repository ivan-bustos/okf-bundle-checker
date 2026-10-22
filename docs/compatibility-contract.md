# OKF compatibility contract

Contract revision: `okf-tools-0.2-1`. Describes checker behavior and interoperability
expectations for independent viewer implementations. No shared runtime or
synchronized release is required.

## Source and authority

The normative source is [SPEC.md at 0b87c52c](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/0b87c52c6ef999286c745e19998fdfcd03d5dbee/SPEC.md).
`spec-pin.json` records the SHA-256 of the exact 37,748 source bytes. The
validator never downloads a specification or schema during validation.
The PDF's C004 proposal is refined by the owner's October 21 decision:
stricter optional metadata checks are configurable quality rules, not
unconditional conformance failures. See `rule-matrix.md` for the audit.

## Documents and identity

- A logical file path is a case-sensitive, bundle-relative POSIX path. Host
  filesystem case folding must not make `Concept.md` equal `concept.md`.
- Only exact lowercase `.md` suffixes identify OKF Markdown documents. The
  exact basenames `index.md` and `log.md` are reserved at every depth (§3.1).
  `Index.md` is therefore a concept, not an index.
- A concept ID removes only the final `.md` suffix (§2). The viewer's file/node
  ID may retain `.md`; it is not presented as the normative concept ID.
- Every other `.md` document requires a parseable mapping frontmatter and
  a non-empty string `type` (§4/§11). No body heading, title, description,
  index, known taxonomy, or optional metadata family is universally required.
- Unknown fields/types are preserved as data. A bare `verified` mapping is
  consumed as one verification event, not rejected (§5.2/§11).
- Invalid documents remain discoverable in the viewer. The checker reports
  defects without deleting or rewriting any input.

## Paths and links

These resolution details beyond explicit §6 wording are tool interoperability
choices, not additional OKF conformance requirements.

1. Parse Markdown syntax, including reference links, rather than extracting
   links from raw text. Inline/fenced code is not a source of graph links.
2. A single leading `/` means bundle-root-relative, never the host root.
   Other local paths resolve relative to the containing document (§6.1).
3. Normalize `.` and `..` segments; do not traverse above the bundle root.
   The filesystem reader must enforce containment independently of the resolver.
4. Decode percent escapes once per segment. Reject malformed encoding, encoded
   separators, NUL/control characters and backslash/drive-path ambiguity; do not
   repeatedly decode or use host path normalization on untrusted URL text.
5. Preserve spelling/case and do not append `.md`. Split query/fragment from
   the file target. A fragment remains available for viewer navigation; heading
   anchor validation is deferred by the checker MVP. Query text is not part of
   the filesystem target identity.
6. Directory paths identify directories. Do not pretend a missing optional
   child `index.md` exists, and do not conflate a directory with its index.
7. Schemes and protocol-relative URLs are external; do not fetch them. Assets
   may be valid internal link targets, even though they are not concepts.
8. Missing targets are tolerated by compliance (§6.1/§11); Q002 may report them
   with configurable severity. Escaping/unsupported paths are never followed.

## Reserved files and versions

`index.md` may be absent. Nested indexes have no frontmatter (§8). Root
`index.md` has a narrowly scoped exception for `okf_version` (§8/§12), not
permission to turn the reserved file into a concept. An absent declaration
uses the selected tool spec profile; `"0.2"` selects this pinned profile.
An explicitly unsupported version is an operational `unsupported-version`
result, not C004 or an assertion that the bundle is invalid. This deliberate
checker policy differs from the best-effort consumer SHOULD in §12; the viewer
can still show such documents with a compatibility notice.

A `log.md` represents dated prose, not a concept. Its date headings follow
`YYYY-MM-DD` (§9). The example title, action labels, and descriptions are not
mandatory. The audit distinguishes explicit requirements from ambiguity around
empty logs and extra sections; it must not silently invent a required title.

## Local-only and bounded behavior

No bundle content is executed, uploaded, or used to fetch remote resources.
HTML, scripts, YAML tags/aliases, computations, executors and attesters are
untrusted data. Tool budgets and exclusions define inspected scope and appear
in diagnostics; a budget/read failure cannot become an all-clear result.
The checker rejects invalid UTF-8 concepts under C001 (§4). Resource-limit or
unsafe-parser-feature refusals are documented operational limitations rather
than claims that those tool limits define OKF.
The viewer uses safe rendering, capability-based import and recoverable errors.

## Shared fixture evidence

`tests/fixtures/shared/manifest.json` lists synthetic cases and separate
checker-compliance/viewer expectations. Do not replace these fixtures with
private Jira exports. Both products may copy the versioned fixtures and add
product-specific assertions; compatibility changes require updating the
contract and expected results in both repositories.
