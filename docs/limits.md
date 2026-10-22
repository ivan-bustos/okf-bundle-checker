# Initial bounded-input profile

These are implementation safety limits, not new OKF conformance rules. Inputs
outside this profile return operational status 2. Validation is read-only.

| Limit | Initial value |
|---|---|
| Visited directory entries (including excluded entries) | 10,000 |
| Aggregate included regular-file sizes (assets included) | 64 MiB |
| One Markdown document | 1 MiB |
| YAML frontmatter | 256 KiB |
| YAML nesting | 32 |
| YAML/Markdown syntax nodes | 100,000 each |
| Directory nesting | 64 |
| Exclusion patterns | 100, 256 characters each |
| Logical path | 4,096 UTF-16 code units |

Enumeration uses bounded directory iteration before sorting. File reads use
bounded buffers; assets are inventoried, never opened. YAML aliases, custom tags and non-string mapping keys are an unsupported parser profile, reported operationally rather than as
proof of invalid OKF. Duplicate YAML keys and non-mapping frontmatter are rejected.
Markdown links come from an AST, including reference links; code and HTML are not
executed. Parser byte ceilings bound work before AST allocation; node checks are
post-parse and are not a hard wall-clock memory/CPU sandbox. Future performance
acceptance must measure representative and hostile inputs (#12).

Exclusions match normalized POSIX-relative paths, case-sensitively. `*` matches
within one segment, `?` matches one character, and `**` occupies a full segment
and matches zero or more segments. `vendor/**` prunes that directory. No negation,
brace expansion, hidden Git ignore behavior or external configuration is implied.
Dynamic-programming matching avoids catastrophic regex backtracking. Reports
include sorted exclusions and the number of excluded encountered entries; a
pruned subtree is one excluded entry, not a guessed count of its descendants.

All symlinks, including internal symlinks and chains, are refused without reading
their targets. Special devices/FIFOs are refused. Portable case-fold or Unicode
normalization collisions are operational unsupported input, not claims of format
invalidity. Exact logical case is otherwise retained. Terminal and bidi controls
and backslashes in names are refused rather than echoed ambiguously.

Use a **stable local snapshot**: concurrent mutation by another process is not
supported. Descriptor/stat/realpath checks detect common changes, but Node's
portable path APIs are not an OS sandbox against a hostile process racing ancestor
renames. Run against a private immutable copy when other actors can mutate the
input. Never run this tool as a privilege boundary for an attacker-controlled
live filesystem. No promise of throughput or memory usage beyond tested evidence
is made in this foundation batch.

Log entries are read as H2 date headings following §9's documented layout; H1 is
the optional title. Calendar-valid YYYY-MM-DD is required, including leap years.
Root version accepts YAML string `"0.2"` or numeric `0.2`; other shapes/versions are
unsupported operationally. No minimum body length or mandatory heading is added.

Policy files are limited to 64 KiB, 32 YAML levels and 10,000 YAML nodes; aliases,
custom tags, duplicate/non-string keys and unknown schema members are invalid
configuration. Only the requested config (or cwd default) is read. These limits
are checked before conversion and do not change the bundle's conformance rules.
