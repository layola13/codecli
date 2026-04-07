import type { ExtractionResult } from './extractors.js'
import type {
  ConversationLink,
  ConversationTurnRecord,
  Decision,
} from './models.js'
import { escape, similarity, stripCodeBlocks } from './utils.js'

const MAX_LINKS_PER_TURN = 6
const RELATION_WINDOW = 12

function summarizeContent(content: string): string {
  const flattened = stripCodeBlocks(content)
    .replace(/\s+/g, ' ')
    .trim()

  if (!flattened) {
    return 'empty turn'
  }

  const primaryClause = flattened
    .split(/(?:\r?\n|[。！？!?;；])/)
    .map(part => part.trim())
    .find(Boolean)

  return escape((primaryClause || flattened).slice(0, 120))
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }

  return result
}

function decisionLabel(decision: Decision): string {
  if (decision.choice && decision.choice !== '[REJECTED]' && decision.choice !== '[REVERTED]') {
    return `${decision.topic}:${decision.choice}`
  }

  const fallback = decision.alternativesRejected[0] || decision.topic
  return `${decision.topic}:${fallback}`
}

function normalizeForOverlap(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`'"]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function sharedItems(current: string[], previous: string[]): string[] {
  if (current.length === 0 || previous.length === 0) {
    return []
  }

  const previousIndex = new Map<string, string>()
  for (const value of previous) {
    previousIndex.set(normalizeForOverlap(value), value)
  }

  const matches = current
    .map(value => {
      const normalized = normalizeForOverlap(value)
      const exact = previousIndex.get(normalized)
      if (exact) return exact

      for (const [candidate, original] of previousIndex) {
        if (!candidate || !normalized) continue
        if (candidate.includes(normalized) || normalized.includes(candidate)) {
          return original
        }
      }

      return null
    })
    .filter((value): value is string => Boolean(value))

  return uniqueStrings(matches)
}

function pushLink(
  links: ConversationLink[],
  seen: Set<string>,
  link: ConversationLink,
): void {
  if (!link.note.trim()) return
  const key = `${link.kind}:${link.targetTurn}:${link.note}`
  if (seen.has(key)) return
  seen.add(key)
  links.push(link)
}

export function buildConversationTurnRecord(
  role: 'user' | 'assistant',
  content: string,
  turn: number,
  signature: string,
  extraction: ExtractionResult,
  priorTurns: ConversationTurnRecord[],
): ConversationTurnRecord {
  const summary = summarizeContent(content)
  const referencedFiles = uniqueStrings(
    extraction.codeAnchors.map(anchor => anchor.filePath),
  )
  const tasks = uniqueStrings(extraction.tasks.map(task => task.description))
  const constraints = uniqueStrings(
    extraction.constraints.map(constraint => constraint.rule),
  )
  const decisions = uniqueStrings(
    extraction.decisions.map(decision => decisionLabel(decision)),
  )
  const facts = uniqueStrings(
    extraction.factUpdates.map(fact => `${fact.key}=${fact.value}`),
  )

  const links: ConversationLink[] = []
  const seen = new Set<string>()
  const previousTurn = priorTurns.at(-1)

  if (previousTurn) {
    pushLink(links, seen, {
      kind:
        role === 'assistant' && previousTurn.role === 'user'
          ? 'assistant_response'
          : 'continues',
      targetTurn: previousTurn.turn,
      note: previousTurn.summary,
    })
  }

  for (const candidate of priorTurns.slice(-RELATION_WINDOW).reverse()) {
    if (links.length >= MAX_LINKS_PER_TURN) break

    const sharedFiles = sharedItems(referencedFiles, candidate.referencedFiles)
    if (sharedFiles.length > 0) {
      pushLink(links, seen, {
        kind: 'shared_file',
        targetTurn: candidate.turn,
        note: sharedFiles.slice(0, 2).join(', '),
      })
    }

    if (links.length >= MAX_LINKS_PER_TURN) break

    const sharedTaskValues = sharedItems(tasks, candidate.tasks)
    if (sharedTaskValues.length > 0) {
      pushLink(links, seen, {
        kind: 'shared_task',
        targetTurn: candidate.turn,
        note: sharedTaskValues[0],
      })
    }

    if (links.length >= MAX_LINKS_PER_TURN) break

    const sharedConstraintValues = sharedItems(constraints, candidate.constraints)
    if (sharedConstraintValues.length > 0) {
      pushLink(links, seen, {
        kind: 'shared_constraint',
        targetTurn: candidate.turn,
        note: sharedConstraintValues[0],
      })
    }

    if (links.length >= MAX_LINKS_PER_TURN) break

    const sharedDecisionValues = sharedItems(decisions, candidate.decisions)
    if (sharedDecisionValues.length > 0) {
      pushLink(links, seen, {
        kind: 'shared_decision',
        targetTurn: candidate.turn,
        note: sharedDecisionValues[0],
      })
    }

    if (links.length >= MAX_LINKS_PER_TURN) break

    if (summary && candidate.summary && similarity(summary, candidate.summary) >= 0.22) {
      pushLink(links, seen, {
        kind: 'same_topic',
        targetTurn: candidate.turn,
        note: candidate.summary,
      })
    }
  }

  return {
    turn,
    role,
    signature,
    summary,
    referencedFiles,
    tasks,
    constraints,
    decisions,
    facts,
    links: links.slice(0, MAX_LINKS_PER_TURN),
  }
}
