/**
 * Utility functions for the Context Compression Engine.
 */

import { promises as fs } from 'fs'
import path from 'path'

// ── Similarity ───────────────────────────────────────────────────────────────

export const SIMILARITY = {
  CONSTRAINT_MERGE: 0.7,
  ERROR_MERGE: 0.6,
  TASK_MATCH: 0.3,
}

/**
 * Tokenize a string for Jaccard similarity.
 * - English: extract /[a-z0-9]+/ tokens, lowercase
 * - Chinese: each hanzi character is its own token
 */
function tokenize(s: string): string[] {
  const latinTokens = s.toLowerCase().match(/[a-z0-9]+/g) || []
  const hanziTokens = s.match(/[\u4e00-\u9fff]/g) || []
  return [...latinTokens, ...hanziTokens]
}

/**
 * Jaccard similarity coefficient between two strings.
 * Returns 0 if both strings are empty, otherwise |A∩B| / |A∪B|
 */
export function similarity(a: string, b: string): number {
  const tokensA = tokenize(a)
  const tokensB = tokenize(b)

  if (tokensA.length === 0 && tokensB.length === 0) return 0

  const setA = new Set(tokensA)
  const setB = new Set(tokensB)

  let intersection = 0
  for (const t of setA) {
    if (setB.has(t)) intersection++
  }

  const union = new Set([...setA, ...setB]).size
  return union === 0 ? 0 : intersection / union
}

// ── String utilities ─────────────────────────────────────────────────────────

/**
 * Convert a string to a legal Python variable name.
 */
export function toVarName(s: string): string {
  let v = s
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  if (/^\d/.test(v)) v = `_${v}`
  return (v.toLowerCase().slice(0, 40) || 'unknown')
}

/**
 * Escape a string for use in a Python string literal.
 */
export function escape(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .trim()
    .slice(0, 150)
}

/**
 * Strip markdown code blocks from text.
 * Removes ```...``` blocks entirely.
 */
export function stripCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '')
}

/**
 * Generate a deterministic ID from prefix, content, and turn number.
 */
export function makeId(prefix: string, content: string, turn: number): string {
  const hashInput = `${content}_${turn}`
  let hash = 0
  for (let i = 0; i < hashInput.length; i++) {
    const chr = hashInput.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  const hex = Math.abs(hash).toString(16).slice(0, 8)
  return `${prefix}_${hex}`
}

// ── File utilities ───────────────────────────────────────────────────────────

/**
 * Atomically write a file by writing to a temp file first, then renaming.
 */
export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath)
  const tmpPath = path.join(dir, `.tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`)
  try {
    await fs.writeFile(tmpPath, content, 'utf-8')
    await fs.rename(tmpPath, filePath)
  } catch (e) {
    // Clean up temp file on failure
    try {
      await fs.unlink(tmpPath)
    } catch {
      // ignore cleanup errors
    }
    throw e
  }
}
