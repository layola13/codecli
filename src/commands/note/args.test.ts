import { describe, expect, it } from 'bun:test'
import { parseNoteArgs } from './args.js'

describe('parseNoteArgs', () => {
  it('parses root, output, and format', () => {
    expect(parseNoteArgs('books --output .note_index --format txt')).toEqual({
      kind: 'run',
      rootPath: 'books',
      outputDir: '.note_index',
      format: 'txt',
    })
  })

  it('defaults to run without explicit format', () => {
    expect(parseNoteArgs('books')).toEqual({
      kind: 'run',
      rootPath: 'books',
      outputDir: undefined,
      format: undefined,
    })
  })

  it('rejects invalid format values', () => {
    expect(parseNoteArgs('--format docx')).toEqual({
      kind: 'error',
      message: 'Invalid --format value: docx',
    })
  })
})
