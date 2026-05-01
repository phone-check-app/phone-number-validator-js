/**
 * Minimal flag parser for the `phone-validate` CLI.
 *
 * Hand-rolled because the surface is small (~12 flags) and pulling in
 * `commander` / `yargs` would balloon the published bundle for every
 * consumer regardless of whether they use the CLI.
 *
 * The parser is table-driven: `BOOLEAN_FLAGS` and `VALUE_FLAGS` map flag
 * names to small applicator functions that mutate the result. New flags get
 * one new map entry — no extra switch cases.
 */
import type { CarrierLocale, GeocoderLocale } from '../types';

export interface ParsedArgs {
  /** Phone number to validate (positional). */
  phoneNumber: string;
  defaultCountry?: string;
  locale: GeocoderLocale;
  carrierLocale: CarrierLocale;
  // Enrichment toggles — let users opt out of BSON loads when they only
  // need format validation (faster + works without `resources/`).
  enrichGeocode: boolean;
  enrichCarrier: boolean;
  enrichTimezones: boolean;
  /** Output format. */
  format: 'text' | 'json' | 'pretty';
  quiet: boolean;
  debug: boolean;
  /** Directory to write the JSON result; null disables file logging. */
  logDir: string | null;
}

export interface ParsedHelp {
  kind: 'help';
}

export interface ParsedVersion {
  kind: 'version';
}

export interface CliArgError {
  kind: 'error';
  messages: string[];
  exitCode: number;
}

export type ParseResult = ({ kind: 'args' } & ParsedArgs) | ParsedHelp | ParsedVersion | CliArgError;

const HELP_TEXT = `phone-validate <phone-number> [options]

Parse and enrich an international phone number — geocoding (city / region),
original carrier, timezone(s), formatted variants, and number type. By
default, runs the full enrichment pipeline, prints a colored summary to
stdout, and writes the JSON result to ./logs/.

Options:
  --country <CC>                 Default country (e.g. US, DE) when the input
                                 lacks a leading +. Pass-through to libphonenumber.
  --locale <code>                Geocoder locale: en, de, fr, es, ...    (default: en)
  --carrier-locale <code>        Carrier locale: en, ar, zh, ...         (default: en)

  --geocode, --no-geocode        Look up city / region                   (default: on)
  --carrier-info, --no-carrier-info
                                 Look up original carrier                (default: on)
  --timezones, --no-timezones    Look up IANA timezone(s)                (default: on)
  --enrich, --no-enrich          Master toggle for all three above       (default: on)

  --format <text|json|pretty>    Stdout format                           (default: pretty)
  --log-dir <path>               Directory to write the JSON result      (default: ./logs)
  --no-log-file                  Skip writing the result file
  --quiet                        Print only the final verdict to stdout
  --debug                        Verbose logging

  -h, --help                     Show this help
  -v, --version                  Print version

Examples:
  # Parse + enrich an E.164 number
  phone-validate +14155552671

  # Parse a national number with a country fallback
  phone-validate "(415) 555-2671" --country US

  # German locale for the geocoder
  phone-validate +41431234567 --locale de

  # Format-only validation (skips BSON loads — fastest)
  phone-validate +14155552671 --no-enrich

  # Just timezone, skip geocode + carrier
  phone-validate +14155552671 --no-geocode --no-carrier-info

  # Pipe JSON to jq for tooling
  phone-validate +14155552671 --format json --quiet --no-log-file | jq

  # Silent verdict for shell scripting (exit code 0=valid, 1=invalid)
  phone-validate "+14155552671" --quiet --no-log-file
  if phone-validate "$NUMBER" --quiet --no-log-file > /dev/null; then …
`;

interface ParseState {
  result: ParsedArgs;
  logFile: boolean;
}

type BooleanApplicator = (state: ParseState, on: boolean) => void;
type ValueApplicator = (state: ParseState, value: string, errors: string[]) => void;

const BOOLEAN_FLAGS: Record<string, BooleanApplicator> = {
  enrich: (s, on) => {
    // Master toggle — flips all three at once.
    s.result.enrichGeocode = on;
    s.result.enrichCarrier = on;
    s.result.enrichTimezones = on;
  },
  geocode: (s, on) => {
    s.result.enrichGeocode = on;
  },
  'carrier-info': (s, on) => {
    s.result.enrichCarrier = on;
  },
  timezones: (s, on) => {
    s.result.enrichTimezones = on;
  },
  'log-file': (s, on) => {
    s.logFile = on;
  },
  quiet: (s, on) => {
    s.result.quiet = on;
  },
  debug: (s, on) => {
    s.result.debug = on;
  },
};

const FORMAT_VALUES = new Set(['text', 'json', 'pretty']);

const VALUE_FLAGS: Record<string, ValueApplicator> = {
  country: (s, value) => {
    s.result.defaultCountry = value.toUpperCase();
  },
  locale: (s, value) => {
    s.result.locale = value as GeocoderLocale;
  },
  'carrier-locale': (s, value) => {
    s.result.carrierLocale = value as CarrierLocale;
  },
  format: (s, value, errors) => {
    if (!FORMAT_VALUES.has(value)) {
      errors.push(`--format must be one of text|json|pretty (got "${value}")`);
      return;
    }
    s.result.format = value as ParsedArgs['format'];
  },
  'log-dir': (s, value) => {
    s.result.logDir = value;
  },
};

interface FlagToken {
  /** The dashless flag name; `no-` prefix already stripped for boolean lookups. */
  name: string;
  /** True when boolean flag was passed positively, false for `--no-...`. */
  positive: boolean;
  /** Inline `--flag=value` body if present. */
  inlineValue: string | undefined;
}

/** Strip leading `--` and split on `=`. Returns null for non-flag tokens. */
function tokenize(token: string): FlagToken | null {
  if (!token.startsWith('--')) return null;
  const eqIdx = token.indexOf('=');
  const rawName = eqIdx === -1 ? token.slice(2) : token.slice(2, eqIdx);
  const inlineValue = eqIdx === -1 ? undefined : token.slice(eqIdx + 1);
  if (rawName.startsWith('no-')) return { name: rawName.slice(3), positive: false, inlineValue };
  return { name: rawName, positive: true, inlineValue };
}

function defaultArgs(): ParsedArgs {
  return {
    phoneNumber: '',
    locale: 'en',
    carrierLocale: 'en',
    enrichGeocode: true,
    enrichCarrier: true,
    enrichTimezones: true,
    format: 'pretty',
    quiet: false,
    debug: false,
    logDir: './logs',
  };
}

export function parseArgs(argv: readonly string[]): ParseResult {
  const errors: string[] = [];
  const positional: string[] = [];
  const state: ParseState = { result: defaultArgs(), logFile: true };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined) continue;

    // Positional (the phone number).
    if (!token.startsWith('-')) {
      positional.push(token);
      continue;
    }

    if (token === '-h' || token === '--help') return { kind: 'help' };
    if (token === '-v' || token === '--version') return { kind: 'version' };

    const flag = tokenize(token);
    if (!flag) {
      errors.push(`Unknown short flag: "${token}"`);
      continue;
    }

    const boolApply = BOOLEAN_FLAGS[flag.name];
    if (boolApply) {
      boolApply(state, flag.positive);
      continue;
    }

    // Value flags only accept the positive form (--country, not --no-country).
    const valueApply = VALUE_FLAGS[flag.name];
    if (valueApply && flag.positive) {
      const value = flag.inlineValue ?? argv[++i];
      if (value === undefined) {
        errors.push(`Flag --${flag.name} requires a value`);
        continue;
      }
      valueApply(state, value, errors);
      continue;
    }

    errors.push(`Unknown flag: "${token}"`);
  }

  if (!state.logFile) state.result.logDir = null;

  if (positional.length === 0) errors.push('Missing required argument: <phone-number>');
  if (positional.length > 1) {
    errors.push(`Expected one phone number, got ${positional.length}: ${positional.join(', ')}`);
  }

  if (errors.length > 0) return { kind: 'error', messages: errors, exitCode: 2 };

  const [phoneNumber] = positional;
  if (!phoneNumber) return { kind: 'error', messages: ['Missing required argument: <phone-number>'], exitCode: 2 };
  state.result.phoneNumber = phoneNumber;
  return { kind: 'args', ...state.result };
}

export function helpText(): string {
  return HELP_TEXT;
}
