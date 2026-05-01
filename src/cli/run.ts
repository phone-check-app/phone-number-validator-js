/**
 * CLI runner — turns ParsedArgs into a `validateSingle` invocation, formats
 * the output, and optionally writes the structured result to a log file.
 *
 * Returns the process exit code:
 *   0 — phone parses + is valid
 *   1 — phone is invalid / unparseable
 *   2 — bad CLI arguments (handled in `index.ts` before reaching here)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PhoneValidationResult } from '../serverless/_shared/dispatch';
import { validateSingle } from '../serverless/_shared/dispatch';
import { formatJson, formatPretty, formatText, verdictLine } from './format';
import type { ParsedArgs } from './parse-args';

export interface CliRunDeps {
  validate?: typeof validateSingle;
  writeFile?: (path: string, contents: string) => void;
  ensureDir?: (path: string) => void;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  now?: () => Date;
}

const FORMATTERS: Record<ParsedArgs['format'], (r: PhoneValidationResult) => string> = {
  json: formatJson,
  text: formatText,
  pretty: formatPretty,
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function logFileNameFor(phoneNumber: string, when: Date): string {
  const safe = phoneNumber.replace(/[^a-zA-Z0-9._+-]+/g, '_');
  const stamp =
    `${when.getUTCFullYear()}-${pad(when.getUTCMonth() + 1)}-${pad(when.getUTCDate())}` +
    `T${pad(when.getUTCHours())}${pad(when.getUTCMinutes())}${pad(when.getUTCSeconds())}Z`;
  return `phone-validate-${stamp}-${safe}.json`;
}

function debugLine(args: ParsedArgs): string {
  return (
    `Validating "${args.phoneNumber}" ` +
    `(country=${args.defaultCountry ?? 'auto'}, locale=${args.locale}, ` +
    `carrier=${args.carrierLocale}, geocode=${args.enrichGeocode}, ` +
    `carrier-info=${args.enrichCarrier}, timezones=${args.enrichTimezones})`
  );
}

function renderOutput(args: ParsedArgs, result: PhoneValidationResult): string {
  if (args.quiet) return verdictLine(result);
  return FORMATTERS[args.format](result);
}

interface FsDeps {
  writeFile: (path: string, contents: string) => void;
  ensureDir: (path: string) => void;
  now: () => Date;
}

function persistLog(
  logDir: string,
  phoneNumber: string,
  result: PhoneValidationResult,
  deps: FsDeps
): { ok: true; path: string } | { ok: false; error: string } {
  try {
    const dir = resolve(logDir);
    deps.ensureDir(dir);
    const path = resolve(dir, logFileNameFor(phoneNumber, deps.now()));
    deps.writeFile(path, JSON.stringify(result, null, 2));
    return { ok: true, path };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function run(args: ParsedArgs, deps: CliRunDeps = {}): Promise<number> {
  const validate = deps.validate ?? validateSingle;
  const stdout = deps.stdout ?? ((line) => process.stdout.write(`${line}\n`));
  const stderr = deps.stderr ?? ((line) => process.stderr.write(`${line}\n`));
  const fsDeps: FsDeps = {
    writeFile: deps.writeFile ?? ((path, contents) => writeFileSync(path, contents, 'utf8')),
    ensureDir: deps.ensureDir ?? ((path) => mkdirSync(path, { recursive: true })),
    now: deps.now ?? (() => new Date()),
  };

  if (args.debug) stderr(debugLine(args));

  const result = await validate(args.phoneNumber, {
    defaultCountry: args.defaultCountry,
    locale: args.locale,
    carrierLocale: args.carrierLocale,
    geocode: args.enrichGeocode,
    carrier: args.enrichCarrier,
    timezones: args.enrichTimezones,
  });

  stdout(renderOutput(args, result));

  if (args.logDir) {
    const log = persistLog(args.logDir, args.phoneNumber, result, fsDeps);
    if (!log.ok) stderr(`Warning: failed to write log file: ${log.error}`);
    else if (!args.quiet) stderr(`Log written: ${log.path}`);
  }

  return exitCodeFor(result);
}

export function exitCodeFor(result: PhoneValidationResult): number {
  return result.valid ? 0 : 1;
}
