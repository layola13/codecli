import { basename, extname } from 'path'

export function toPythonSlug(input: string, fallback: string): string {
  const ascii = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()

  if (!ascii) {
    return fallback
  }

  const startsWithDigit = /^\d/.test(ascii)
  return startsWithDigit ? `n_${ascii}` : ascii
}

export function inferEnglishBookId(filePath: string, fallbackIndex: number): string {
  const fileName = basename(filePath, extname(filePath))
  return toPythonSlug(fileName, `book_${String(fallbackIndex).padStart(3, '0')}`)
}
