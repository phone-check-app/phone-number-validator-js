/**
 * `phone-validate` CLI entry point.
 *
 * Wired into `package.json#bin` so `bun add -g @phonecheck/phone-number-validator-js`
 * (or the npm equivalent) installs a `phone-validate` command.
 */
import '../index'; // installs the default Node FS resource loader
import { helpText, parseArgs } from './parse-args';
import { run } from './run';

export type { CliArgError, ParsedArgs, ParsedHelp, ParsedVersion, ParseResult } from './parse-args';
export { helpText, parseArgs } from './parse-args';
export type { CliRunDeps } from './run';
export { exitCodeFor, logFileNameFor, run } from './run';

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const parsed = parseArgs(argv);

  if (parsed.kind === 'help') {
    process.stdout.write(`${helpText()}\n`);
    return 0;
  }
  if (parsed.kind === 'version') {
    try {
      const pkg = require('../../package.json') as { version: string };
      process.stdout.write(`${pkg.version}\n`);
    } catch {
      process.stdout.write('unknown\n');
    }
    return 0;
  }
  if (parsed.kind === 'error') {
    for (const msg of parsed.messages) process.stderr.write(`${msg}\n`);
    process.stderr.write(`\nRun with --help for usage.\n`);
    return parsed.exitCode;
  }

  return run(parsed);
}

const isDirectInvocation =
  (typeof import.meta !== 'undefined' && (import.meta as { main?: boolean }).main === true) ||
  (typeof require !== 'undefined' && require.main === module);

if (isDirectInvocation) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      process.stderr.write(
        `Unexpected error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
      );
      process.exit(1);
    });
}
