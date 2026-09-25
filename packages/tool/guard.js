// The command boundary every bin shares. `--help` prints the usage line and
// exits 0. An unexpected failure prints one line and exits 2; `--debug`
// lets the stack through. Refusals are not failures: each command prints
// its reason and exits 1 on its own.

/**
 * @param {string} usage one line, starting with the command name
 * @param {string[]} [argv]
 */
export function guard(usage, argv) {
  const args = argv || process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write('usage: ' + usage + '\n');
    process.exit(0);
  }
  const debug = args.includes('--debug');
  /** @param {unknown} error */
  const fail = (error) => {
    if (debug) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write('error: ' + message + '\n');
    process.exit(2);
  };
  process.on('uncaughtException', fail);
  process.on('unhandledRejection', fail);
}
