export type ParsedMemoryIndexArgs =
  | {
      kind: 'help'
    }
  | {
      kind: 'error'
      message: string
    }
  | {
      kind: 'run'
      rootDir: string
      outputDir?: string
      maxTranscripts?: number
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

export function parseMemoryIndexArgs(input: string): ParsedMemoryIndexArgs {
  const tokens = tokenizeArgs(input)
  if (tokens[0] === 'build') {
    tokens.shift()
  }

  let rootDir = '.'
  let outputDir: string | undefined
  let maxTranscripts: number | undefined

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index] ?? ''

    if (token === '--help' || token === '-h') {
      return { kind: 'help' }
    }

    if (token.startsWith('--output=')) {
      outputDir = token.slice('--output='.length)
      if (!outputDir) {
        return {
          kind: 'error',
          message: 'Missing value for --output.',
        }
      }
      continue
    }

    if (token === '--output' || token === '-o') {
      outputDir = tokens[index + 1]
      if (!outputDir) {
        return {
          kind: 'error',
          message: 'Missing value for --output.',
        }
      }
      index++
      continue
    }

    if (token.startsWith('--max-transcripts=')) {
      const rawValue = token.slice('--max-transcripts='.length)
      const parsed = Number.parseInt(rawValue, 10)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return {
          kind: 'error',
          message: `Invalid --max-transcripts value: ${rawValue}`,
        }
      }
      maxTranscripts = parsed
      continue
    }

    if (token === '--max-transcripts') {
      const rawValue = tokens[index + 1]
      const parsed = Number.parseInt(rawValue ?? '', 10)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return {
          kind: 'error',
          message: `Invalid --max-transcripts value: ${rawValue ?? ''}`,
        }
      }
      maxTranscripts = parsed
      index++
      continue
    }

    if (token.startsWith('-')) {
      return {
        kind: 'error',
        message: `Unknown flag: ${token}`,
      }
    }

    if (rootDir !== '.') {
      return {
        kind: 'error',
        message: 'Only one path argument is supported.',
      }
    }

    rootDir = token
  }

  return {
    kind: 'run',
    rootDir,
    outputDir,
    maxTranscripts,
  }
}
