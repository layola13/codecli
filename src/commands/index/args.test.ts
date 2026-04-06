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
      parseIndexArgs('src --output .code_index --max-file-bytes 1024 --workers 4'),
    ).toEqual({
      kind: 'run',
      rootDir: 'src',
      outputDir: '.code_index',
      ignoredDirNames: undefined,
      maxFiles: undefined,
      maxFileBytes: 1024,
      workers: 4,
    })
  })

  it('parses max-files and repeated ignore-dir flags', () => {
    expect(
      parseIndexArgs(
        'src --max-files 5000 --ignore-dir ThirdParty --ignore-dir Intermediate',
      ),
    ).toEqual({
      kind: 'run',
      rootDir: 'src',
      outputDir: undefined,
      ignoredDirNames: ['ThirdParty', 'Intermediate'],
      maxFiles: 5000,
      maxFileBytes: undefined,
      workers: undefined,
    })
  })

  it('accepts an optional build subcommand prefix', () => {
    expect(parseIndexArgs('build src')).toEqual({
      kind: 'run',
      rootDir: 'src',
      ignoredDirNames: undefined,
      maxFiles: undefined,
      outputDir: undefined,
      maxFileBytes: undefined,
      workers: undefined,
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

  it('rejects invalid max-files values', () => {
    expect(parseIndexArgs('--max-files 0')).toEqual({
      kind: 'error',
      message: 'Invalid --max-files value: 0',
    })
  })

  it('rejects invalid workers values', () => {
    expect(parseIndexArgs('--workers 0')).toEqual({
      kind: 'error',
      message: 'Invalid --workers value: 0',
    })
  })
})
