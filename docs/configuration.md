# Configurable quality and reporting

The `okf-checker check` command implements the local/CI contract for the
`1.0.0-beta.1` beta. See [installation and CI](installation-ci.md) for source,
local-package and conditional npm installation options.

```sh
node dist/cli.js check ./knowledge
node dist/cli.js check ./knowledge --config ./policy.yml --format json --output ./report.json --fail-on warning
```

Configuration precedence: explicit `--config` selects that file only. Otherwise,
read `.okf-validator.yml` in the current working directory, not the bundle root.
Only an absent implicit file falls back to defaults. CLI `--fail-on` overrides the
file's threshold. Duplicate or unknown flags, unknown keys/rules, invalid values,
unsupported spec versions, unreadable files, aliases/tags and duplicate YAML keys
fail operationally (exit 2). Empty YAML is not a mapping; use `{}` for defaults.

```yaml
spec_version: '0.2'
fail_on: error
exclude:
  - vendor/**
index_scope: all
rules:
  Q001: warning
  Q002: error
  Q003: off
  Q004: warning
  Q005: warning
  Q006: warning
  Q007: warning
  Q008: warning
  Q009: warning
  Q010: off
```

Q001–Q009 default to warning. Q010 (freshness) defaults to off. All quality
rules allow `off`, `warning` or `error`.
C001–C003 are always errors. Explicit `error` is accepted for a compliance rule;
any attempt to disable/demote it, or configure reserved C004, is rejected.
Promotion of quality to error never changes its `quality` layer. The default
threshold is `error`; `warning` fails on warnings and errors. An `off` rule emits
nothing. Exclusions apply before all rules and appear in scope metadata.
`index_scope: root` applies Q003–Q005 only to the root; `all` includes every
ancestor directory containing a scoped concept. Q001 still checks parseable scoped concepts, including those with missing frontmatter; Q002 still checks
links in all scoped parsed documents, including reserved indexes and logs. Index absence is quality, never hard compliance.

Validation is offline and read-only. Reports are explicitly requested outputs,
not bundle rewrites. `--output` must be outside the bundle and must not replace the
selected configuration; symlink, hard-linked and special-file outputs are refused.
A completed report is written to a temporary file and renamed only after the
whole check finishes. An existing ordinary report file can be replaced, even
when findings cause exit 1. An operational failure leaves it untouched; an old
report is not evidence that a new run passed. Missing output directories are not
created. Keep input/config/output directories stable; portable Node file APIs do
not defend against a hostile concurrent process renaming ancestors.

## Report contract (schemaVersion 1)

JSON contains `completed: true`, tool name/version, pinned `specVersion`, resolved
threshold/rule severities/index scope, scope counts/exclusions, counts by layer
and severity, findings, and the resulting exit code. When Q010 is enabled,
`freshness: { evaluatedAt: <ISO datetime> }` records the single reference time
used for the entire check. This field is absent when Q010 is off; default reports
remain clock-independent. The resolved rules object gains `Q010: off`. No
absolute input/config paths, machine environment or source bodies are included. Findings
carry rule ID, layer, severity, relative path, message, remediation and available
line/column. Missing-link findings use the expected target path and a separate `source` reference with its document path/location. Missing-index findings use the expected index path; missing-coverage findings identify the existing index and name the omitted target.
Ordering is case-sensitive path, line, column, rule ID, message, then remediation and source reference path/location.
Text derives from the same findings but presents errors first, then warnings, grouped by path with a rule-count overview. Within each section it retains deterministic path/location/rule ordering. Every finding and remediation remains visible; JSON ordering and schema are unchanged. Text escapes source-derived terminal controls and directional/line-separator characters before applying optional styling.

- Exit 0: check completed below the configured threshold, possibly with warnings.
- Exit 1: check completed with a finding at/above threshold.
- Exit 2: check incomplete due to invalid configuration, unsupported version,
  unreadable/unsafe/empty concept scope, output failure, interruption or tool error.

With `--format json`, stdout is exactly one JSON report plus newline, unless
`--output` is supplied, in which case stdout is empty. Operational errors are a
single diagnostic JSON object on stderr with `completed: false`. Failures before
report delivery leave stdout empty. An output-device failure can leave partial
bytes and exits 2, so consumers must check the exit status and parse the full
report rather than trusting a prefix. No partial findings count as an all-clear. SIGINT/SIGTERM cancel before
publication at asynchronous checkpoints; no immediate preemption of a synchronous
parser is promised. The legacy `inspect` subcommand remains compliance-only and
uses its original foundation JSON shape; use `check` for configurable quality.

## Optional metadata interpretation

Q006 checks supplied provenance shapes and owns source timestamps; Q007 checks
supplied generation/verification events and owns their timestamps. A bare
`verified` mapping is one event, not a malformed list. Q008 checks supplied status
and `stale_after` syntax, avoiding duplicate timestamp findings. Q010 separately
checks freshness only when enabled and the deadline is well-formed. Extension fields and
absent families remain accepted. No actor identities or trust claims are inferred.
Q009 activates only for exact type `Attested Computation` with a supplied
computation-contract field; then runtime and a computation path or inline body
are expected. Optional parameters/executor/attester/receipt are checked only when
present. Both fenced and indented inline code are accepted: §10.3 describes a
fence, while the pinned canonical examples use indented code. This conservative
interpretation is a quality policy, not a new conformance requirement. Resources
remain inert strings; the checker never invokes them or validates their availability.

Q004 accepts a link to an existing immediate child's `index.md` as navigation to
that child directory, as well as a direct directory link. The resolver still
keeps directory and index-file identities separate. Linking a directory does not
invent or require its optional index. Duplicate index entries do not produce
repeated Q005 findings when one entry supplies meaningful descriptive text.

## Opt-in freshness and reproducible checks

Q010 is an **unreleased source-checkout feature**; it is not in published beta.1.
It reports a quality finding when the reference instant is **at or after** a
concept's valid `stale_after` (`now >= stale_after`, pinned §5.5). There is no
extra age threshold. Missing deadlines are allowed; malformed supplied deadlines
belong to Q008 and are skipped by Q010 even if Q008 is off. `draft`, `stable`,
`deprecated`, and omitted status are treated alike. Indexes, logs and documents
without a successfully parsed frontmatter mapping are not assessed for freshness.

Enable a CI freshness gate in a policy file:

```yaml
rules:
  Q010: error
```

`Q010: warning` alone remains advisory at the default `fail_on: error` threshold.
Pair it with `fail_on: warning` (or `--fail-on warning`) to fail on warnings too.
This is always quality guidance, never a new compliance rule. Keep Q008 enabled
if a gate must also flag malformed deadline syntax; set `Q008: error` if those
findings must fail at the error threshold.

The checker captures the system clock **once at check start** when Q010 is on.
Use `--now` to supply a fixed reference instant for tests, archived validation
or reproducible reports. The flag does not enable Q010 by itself. Do not leave a
fixed historical value in a production gate meant to assess present freshness.

```sh
node dist/cli.js examples/ci/bundles/stale-deadline \
  --config examples/ci/policies/strict-freshness.yml \
  --now 2026-06-30T14:00:00Z --format json
```

That synthetic example exits 1 at the exact deadline; the same command with
`default.yml` exits 0 with no freshness finding. See all four
[CI freshness cases](../examples/ci/README.md).

The reusable engine accepts the same reference time as a fourth argument,
preserving the existing third `AbortSignal` argument:

```js
const policy = defaultPolicy();
policy.rules.Q010 = 'error';
const report = await checkBundle('./knowledge', policy, undefined, {
  now: '2026-06-30T14:00:00Z',
});
```

`CheckOptions` is exported as a TypeScript type. Prefer deriving policies from
`defaultPolicy()`; complete typed rule literals now also include Q010. An invalid
reference time fails operationally with `invalid-clock` / exit 2, even when Q010
is disabled. `inspect` remains compliance-only and does not accept `--now`.

Both deadlines and reference times accept the same explicitly offset calendar
forms as Q008: basic/extended dates and times, omitted seconds, dot/comma
fractional seconds, and `Z`, `+hh`, `+hhmm`, or `+hh:mm` (also negative offsets).
Offsets are compared as instants, independent of the host timezone. Fractions
retain all supplied digits; there is no millisecond rounding of a deadline.
Hour `24:00` rolls to the next day. Existing accepted second `60` rolls to the
next minute under the system's POSIX-clock convention, including its fraction;
no historical leap-second table or astronomical-time claim is added. For example,
`2016-12-31T23:59:60Z` compares equal to `2017-01-01T00:00:00Z`.

Enabled JSON reports contain `freshness.evaluatedAt` (the provided string, or the
sampled UTC time), and text shows it too. Use the recorded instant with `--now`
to repeat the check. Identical inputs, policies and fixed times produce identical
reports. No input is rewritten; a finding asks for review before moving a deadline.

## Readable text and terminal color

Text reports show a result/summary, counts per rule, and separate error/warning
sections grouped by path. Each finding retains its rule ID, layer, severity,
location, explanation and fix; missing targets retain their source reference.
Color is supplementary: the same labels and content appear without it.
Use the [rule catalog](rules.md) to interpret each code and choose remediation.

`--color auto` is the default. It colors interactive stdout only, not pipes or
`--output` files, and respects a nonempty `NO_COLOR` environment variable and
`TERM=dumb`. `--color never` always disables styling; `--color always` explicitly
forces it for text, including redirected output or an output file, overriding
those environment hints. JSON reports, legacy `inspect` output and operational
JSON diagnostics never contain styling, regardless of color choice.

```sh
node dist/cli.js check ./knowledge --color never
node dist/cli.js check ./knowledge --color always
node dist/cli.js check ./knowledge --format json --output ./report.json
```

Changing presentation does not alter rules, findings, thresholds or exit codes.
For stable machine consumption, use JSON rather than parsing the human layout.
The programmatic `renderReport` defaults to plain text; pass `{color: true}` as
its third argument to opt into ANSI styling.
