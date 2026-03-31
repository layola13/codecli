import { describe, expect, it } from 'bun:test'
import { parseIndexArgs, tokenizeIndexArgs } from './args.js'

describe('/index args', () => {
  it('tokenizes quoted paths', () => {
    expect(tokenizeIndexArgs('"src dir" --output ".code index"')).toEqual([
      'src dir',
      '--output',
      '.code index',
    ])
  })

  it('parses a path and flags', () => {
    expect(
      parseIndexArgs('src --output .code_index --max-file-bytes 1024'),
    ).toEqual({
      kind: 'run',
      rootDir: 'src',
      outputDir: '.code_index',
      maxFileBytes: 1024,
    })
  })

  it('accepts an optional build subcommand prefix', () => {
    expect(parseIndexArgs('build src')).toEqual({
      kind: 'run',
      rootDir: 'src',
      outputDir: undefined,
      maxFileBytes: undefined,
    })
  })

  it('rejects unknown flags', () => {
    expect(parseIndexArgs('--wat')).toEqual({
      kind: 'error',
      message: 'Unknown flag: --wat',
    })
  })

  it('rejects missing output values', () => {
    expect(parseIndexArgs('--output')).toEqual({
      kind: 'error',
      message: 'Missing value for --output.',
    })
  })
})

