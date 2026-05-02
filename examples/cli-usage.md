# `phone-validate` CLI walkthrough

The published package installs a `phone-validate` binary you can use to
validate and enrich a single number from the shell.

## Install

```bash
bun add -g @phonecheck/phone-number-validator-js
# or
npm install -g @phonecheck/phone-number-validator-js
```

## Quick checks

```bash
$ phone-validate +14155552671
✓ VALID    +14155552671

Summary
  country:      US (+1)
  type:         FIXED_LINE_OR_MOBILE

Formatted
  E.164:        +14155552671
  national:     (415) 555-2671
  international: +1 415 555 2671
  RFC3966:      tel:+14155552671

Enrichment
  geocode:      San Francisco
  timezones:    America/Los_Angeles

Log written: /Users/you/work/logs/phone-validate-2026-01-15T120000Z-+14155552671.json
```

## National format with a country fallback

```bash
$ phone-validate "(415) 555-2671" --country US
```

## Locale-aware geocoding

```bash
$ phone-validate +41431234567 --locale de
✓ VALID    +41431234567
…
Enrichment
  geocode:      Zürich
```

## JSON for tooling

```bash
$ phone-validate +14155552671 --format json --quiet --no-log-file | jq '.geocode'
"San Francisco"
```

## Shell scripting

Exit codes: `0` valid, `1` invalid / unparseable, `2` bad CLI args.

```bash
#!/usr/bin/env bash
set -e
NUMBER="$1"
if phone-validate "$NUMBER" --quiet --no-log-file > /dev/null; then
  echo "$NUMBER ✓"
else
  echo "$NUMBER ✗"
  exit 1
fi
```

## Logs directory

By default a JSON copy of the result lands in `./logs/` with a timestamped
filename. Override with `--log-dir /path` or disable with `--no-log-file`.
