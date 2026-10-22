# Configurable quality and reporting

The owner-approved binary is `okf-checker`. Its `check` subcommand implements
the local/CI contract. Version 0.1.0 is prepared locally but has not been published.
Nothing here claims a published install.

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
```

All Q001–Q009 rules default to warning and allow `off`, `warning` or `error`.
C001–C003 are always errors. Explicit `error` is accepted for a compliance rule;
any attempt to disable/demote it, or configure reserved C004, is rejected.
Promotion of quality to error never changes its `quality` layer. The default
threshold is `error`; `warning` fails on warnings and errors. An `off` rule emits
nothing. Exclusions apply before all rules and appear in scope metadata.
`index_scope: root` applies Q003–Q005 only to the root; `all` includes every
ancestor directory containing a scoped concept. Q001/Q002 still inspect all
scoped documents. Index absence is quality, never hard compliance.

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
and severity, findings, and the resulting exit code. No timestamps, absolute
input/config paths, machine environment or source bodies are included. Findings
carry rule ID, layer, severity, relative path, message, remediation and available
line/column. Missing-link findings use the expected target path and a separate `source` reference with its document path/location. Missing-index findings use the expected index path; missing-coverage findings identify the existing index and name the omitted target.
Ordering is case-sensitive path, line, column, rule ID, message, then remediation and source reference path/location.
Text derives from the same report and escapes terminal controls.

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
and `stale_after`, avoiding duplicate timestamp findings. Extension fields and
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
