export async function rollback(
  _target?: string,
  _options?: unknown
): Promise<never> {
  process.stderr.write(
    "[ANT] rollback is enabled in this build, but its internal implementation is not available in this repository.\n"
  );
  process.exit(1);
}
