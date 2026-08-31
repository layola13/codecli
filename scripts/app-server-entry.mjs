const args = process.argv.slice(2)

const hasOption = name =>
  args.includes(name) || args.some(arg => arg.startsWith(`${name}=`))

const appServerArgs = []
if (!hasOption('--print') && !hasOption('-p')) {
  appServerArgs.push('--print')
}
if (!hasOption('--input-format')) {
  appServerArgs.push('--input-format', 'stream-json')
}
if (!hasOption('--output-format')) {
  appServerArgs.push('--output-format', 'stream-json')
}
if (!hasOption('--verbose')) {
  appServerArgs.push('--verbose')
}

process.argv = [process.argv[0], process.argv[1], ...appServerArgs, ...args]
await import('../cli.js')
