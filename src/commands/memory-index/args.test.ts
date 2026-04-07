import { describe, expect, it } from 'bun:test'
import { parseMemoryIndexArgs } from './args.js'

describe('parseMemoryIndexArgs', () => {
  it('parses root, output, and max-transcripts', () => {
    expect(
      parseMemoryIndexArgs(
        'src --output .memory_cache --max-transcripts 25',
      ),
    ).toEqual({
      kind: 'run',
      rootDir: 'src',
      outputDir: '.memory_cache',
      maxTranscripts: 25,
    })
  })

  it('rejects unknown flags', () => {
    expect(parseMemoryIndexArgs('--wat')).toEqual({
      kind: 'error',
      message: 'Unknown flag: --wat',
    })
  })
})
