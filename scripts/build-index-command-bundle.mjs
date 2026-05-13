#!/usr/bin/env bun

const builds = [
  {
    entrypoint: 'src/commands/index/cliBundleEntry.ts',
    outfile: 'src/commands/index/cliBundle.mjs',
  },
]

for (const build of builds) {
  const proc = Bun.spawn(
    [
      process.execPath,
      'build',
      build.entrypoint,
      '--target=node',
      '--format=esm',
      `--outfile=${build.outfile}`,
    ],
    {
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    },
  )

  const exitCode = await proc.exited
  if (exitCode !== 0) {
    process.exit(exitCode)
  }
}
