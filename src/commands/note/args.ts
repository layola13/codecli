export type NoteInputFormat = 'txt' | 'pdf' | 'md'

export type ParsedNoteArgs =
  | {
      kind: 'help'
    }
  | {
      kind: 'error'
      message: string
    }
  | {
      kind: 'run'
      rootPath: string
      outputDir?: string
      format?: NoteInputFormat
    }

function tokenizeArgs(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaping = false

  for (const char of input.trim()) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }

    if (char === '\\') {
      escaping = true
      continue
    }

    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (current) {
    tokens.push(current)
  }

  return tokens
}

function isFormat(value: string): value is NoteInputFormat {
  return value === 'txt' || value === 'pdf' || value === 'md'
}

export function parseNoteArgs(input: string): ParsedNoteArgs {
  const tokens = tokenizeArgs(input)
  let rootPath = '.'
  let outputDir: string | undefined
  let format: NoteInputFormat | undefined

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index] ?? ''

    if (token === '--help' || token === '-h') {
      return { kind: 'help' }
    }

    if (token.startsWith('--output=')) {
      outputDir = token.slice('--output='.length)
      if (!outputDir) {
        return { kind: 'error', message: 'Missing value for --output.' }
      }
      continue
    }

    if (token === '--output' || token === '-o') {
      outputDir = tokens[index + 1]
      if (!outputDir) {
        return { kind: 'error', message: 'Missing value for --output.' }
      }
      index++
      continue
    }

    if (token.startsWith('--format=')) {
      const rawFormat = token.slice('--format='.length)
      if (!isFormat(rawFormat)) {
        return { kind: 'error', message: `Invalid --format value: ${rawFormat}` }
      }
      format = rawFormat
      continue
    }

    if (token === '--format') {
      const rawFormat = tokens[index + 1]
      if (!rawFormat || !isFormat(rawFormat)) {
        return {
          kind: 'error',
          message: `Invalid --format value: ${rawFormat ?? ''}`,
        }
      }
      format = rawFormat
      index++
      continue
    }

    if (token.startsWith('-')) {
      return { kind: 'error', message: `Unknown flag: ${token}` }
    }

    if (rootPath !== '.') {
      return { kind: 'error', message: 'Only one path argument is supported.' }
    }

    rootPath = token
  }

  return {
    kind: 'run',
    rootPath,
    outputDir,
    format,
  }
}
