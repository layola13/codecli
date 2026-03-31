export const PINNED_FACTS_FILENAME = 'PINNED.md'
export const PINNED_FACTS_HEADER = '# Pinned Facts'
export const PINNED_FACTS_EMPTY_HINT =
  '<!-- No pinned facts yet. Use /pin <text> to add one. -->'

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n?/g, '\n')
}

export function normalizePinnedFact(text: string): string {
  return normalizeLineEndings(text).trim()
}

function normalizePinnedFactForCompare(text: string): string {
  return normalizePinnedFact(text).toLowerCase()
}

function dedupePinnedFacts(facts: readonly string[]): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []

  for (const fact of facts) {
    const normalized = normalizePinnedFact(fact)
    if (!normalized) continue
    const compareKey = normalizePinnedFactForCompare(normalized)
    if (seen.has(compareKey)) continue
    seen.add(compareKey)
    deduped.push(normalized)
  }

  return deduped
}

export function parsePinnedFactsContent(content: string): string[] {
  const facts: string[] = []

  for (const line of normalizeLineEndings(content).split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('- ') && !trimmed.startsWith('* ')) {
      continue
    }
    const fact = normalizePinnedFact(trimmed.slice(2))
    if (fact) {
      facts.push(fact)
    }
  }

  return dedupePinnedFacts(facts)
}

export function renderPinnedFactsContent(facts: readonly string[]): string {
  const deduped = dedupePinnedFacts(facts)
  const lines = [
    PINNED_FACTS_HEADER,
    '',
    'Project-scoped facts explicitly pinned by the user.',
    'Treat these as high-priority stable references for this repository.',
    'Prefer them before re-discovering the same facts. If one appears stale or inaccessible, call that out and ask before replacing it.',
    'Ignore them only if the user explicitly says to ignore pinned facts or removes them with /unpin.',
    '',
    ...(deduped.length > 0
      ? deduped.map(fact => `- ${fact}`)
      : [PINNED_FACTS_EMPTY_HINT]),
  ]

  return `${lines.join('\n')}\n`
}

export function buildPinnedFactsContext(facts: readonly string[]): string | null {
  const deduped = dedupePinnedFacts(facts)
  if (deduped.length === 0) {
    return null
  }

  return [
    'Project-level pinned facts explicitly declared by the user. Treat these as high-priority stable references for this repository.',
    'Prefer using them before rediscovering the same facts with registry scans, filesystem searches, or similar fallback probes.',
    'If a pinned fact appears stale, inaccessible, or contradictory, say so and ask before replacing it.',
    'Ignore these facts only if the user explicitly says to ignore pinned facts.',
    '',
    ...deduped.map(fact => `- ${fact}`),
  ].join('\n')
}

export function findExactPinnedFact(
  facts: readonly string[],
  rawQuery: string,
): string | null {
  const normalizedQuery = normalizePinnedFact(rawQuery)
  if (!normalizedQuery) {
    return null
  }

  const compareKey = normalizePinnedFactForCompare(normalizedQuery)
  return (
    facts.find(fact => normalizePinnedFactForCompare(fact) === compareKey) ??
    null
  )
}

export function countPinnedFactMatches(
  facts: readonly string[],
  rawQuery: string,
): {
  matches: string[]
  normalizedQuery: string
} {
  const normalizedQuery = normalizePinnedFact(rawQuery)
  const compareKey = normalizePinnedFactForCompare(normalizedQuery)
  const exactMatches = facts.filter(
    fact => normalizePinnedFactForCompare(fact) === compareKey,
  )

  return {
    matches:
      exactMatches.length > 0
        ? exactMatches
        : facts.filter(fact =>
            normalizePinnedFactForCompare(fact).includes(compareKey),
          ),
    normalizedQuery,
  }
}
