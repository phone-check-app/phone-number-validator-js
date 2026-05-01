/**
 * Output formatters for the CLI. The runner picks one based on `--format`.
 *
 *   pretty  — colored, human-friendly summary (default)
 *   text    — plain ASCII single-line + KV pairs (for piping)
 *   json    — full result as a single JSON line (for tooling)
 */
import type { PhoneValidationResult } from '../serverless/_shared/dispatch';

interface ColorFns {
  green: (s: string) => string;
  red: (s: string) => string;
  yellow: (s: string) => string;
  cyan: (s: string) => string;
  dim: (s: string) => string;
  bold: (s: string) => string;
}

function colorize(): ColorFns {
  const enabled = process.stdout.isTTY && process.env.NO_COLOR !== '1';
  const wrap = (open: string, close: string) => (s: string) => (enabled ? `\x1b[${open}m${s}\x1b[${close}m` : s);
  return {
    green: wrap('32', '39'),
    red: wrap('31', '39'),
    yellow: wrap('33', '39'),
    cyan: wrap('36', '39'),
    dim: wrap('2', '22'),
    bold: wrap('1', '22'),
  };
}

export function verdictLine(result: PhoneValidationResult): string {
  const c = colorize();
  if (!result.valid) return c.red(`✗ INVALID  ${result.input}`);
  return c.green(`✓ VALID    ${result.formatted?.e164 ?? result.input}`);
}

export function formatJson(result: PhoneValidationResult): string {
  return JSON.stringify(result);
}

export function formatText(result: PhoneValidationResult): string {
  const lines: string[] = [];
  lines.push(verdictLine(result));
  if (!result.valid) {
    if (result.error) lines.push(`  error=${result.error}`);
    return lines.join('\n');
  }
  lines.push(`  country=${result.country ?? '_'} type=${result.type ?? '_'}`);
  lines.push(`  e164=${result.formatted?.e164}`);
  lines.push(`  national=${result.formatted?.national}`);
  lines.push(`  international=${result.formatted?.international}`);
  if (result.geocode) lines.push(`  geocode=${result.geocode}`);
  if (result.carrier) lines.push(`  carrier=${result.carrier}`);
  if (result.timezones?.length) lines.push(`  timezones=${result.timezones.join(', ')}`);
  return lines.join('\n');
}

export function formatPretty(result: PhoneValidationResult): string {
  const c = colorize();
  const lines: string[] = [];
  lines.push(verdictLine(result));
  lines.push('');

  if (!result.valid) {
    if (result.error) lines.push(`  ${c.dim('error:')}        ${c.red(result.error)}`);
    return lines.join('\n');
  }

  lines.push(c.bold('Summary'));
  lines.push(
    `  ${c.dim('country:')}      ${c.cyan(result.country ?? '—')} ${c.dim(`(+${result.countryCallingCode})`)}`
  );
  lines.push(`  ${c.dim('type:')}         ${result.type ?? '—'}`);
  lines.push('');
  lines.push(c.bold('Formatted'));
  lines.push(`  ${c.dim('E.164:')}        ${result.formatted?.e164}`);
  lines.push(`  ${c.dim('national:')}     ${result.formatted?.national}`);
  lines.push(`  ${c.dim('international:')} ${result.formatted?.international}`);
  lines.push(`  ${c.dim('RFC3966:')}      ${result.formatted?.rfc3966}`);

  if (result.geocode || result.carrier || result.timezones?.length) {
    lines.push('');
    lines.push(c.bold('Enrichment'));
    if (result.geocode) lines.push(`  ${c.dim('geocode:')}      ${result.geocode}`);
    if (result.carrier) lines.push(`  ${c.dim('carrier:')}      ${result.carrier}`);
    if (result.timezones?.length) {
      lines.push(`  ${c.dim('timezones:')}    ${result.timezones.join(', ')}`);
    }
  }

  return lines.join('\n');
}
