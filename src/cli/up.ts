export async function up(): Promise<never> {
  process.stderr.write(
    "[ANT] up is enabled in this build, but its internal implementation is not available in this repository.\n"
  );
  process.exit(1);
}
