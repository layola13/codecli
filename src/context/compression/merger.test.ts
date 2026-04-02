import { describe, expect, it } from 'bun:test'
import { StateMerger } from './merger.js'
import {
  createEmptySessionState,
} from './serializer.js'
import {
  DecisionStatus,
  FactConfidence,
} from './models.js'
import type { ExtractionResult } from './extractors.js'

function emptyExtraction(): ExtractionResult {
  return {
    decisions: [],
    constraints: [],
    tasks: [],
    codeAnchors: [],
    errorMemories: [],
    goalUpdate: null,
    factUpdates: [],
  }
}

describe('StateMerger', () => {
  it('replaces an accepted decision and retains the previous choice as rejected context', () => {
    const merger = new StateMerger()
    const initial = createEmptySessionState()
    initial.decisions = [
      {
        id: 'dec_old',
        topic: 'http_client_choice',
        choice: 'axios',
        alternativesRejected: [],
        reason: '',
        status: DecisionStatus.ACCEPTED,
        turn: 1,
      },
    ]

    const next = merger.merge(
      initial,
      {
        ...emptyExtraction(),
        decisions: [
          {
            id: 'dec_new',
            topic: 'http_client_choice',
            choice: 'fetch',
            alternativesRejected: [],
            reason: 'project policy',
            status: DecisionStatus.ACCEPTED,
            turn: 2,
          },
        ],
      },
      2,
    )

    expect(next.decisions).toHaveLength(1)
    expect(next.decisions[0]?.choice).toBe('fetch')
    expect(next.decisions[0]?.alternativesRejected).toContain('axios')
  })

  it('upgrades similar soft constraints to hard and decays stale uncertain facts', () => {
    const merger = new StateMerger()
    const initial = createEmptySessionState()
    initial.constraints = [
      {
        id: 'con_soft',
        category: 'technology',
        rule: 'use native fetch',
        reason: '',
        severity: 'soft',
        turn: 1,
        isActive: true,
      },
    ]
    initial.facts = [
      {
        key: 'database',
        value: 'maybe postgres',
        category: 'tech_stack',
        confidence: FactConfidence.UNCERTAIN,
        sourceTurn: 1,
      },
    ]

    const next = merger.merge(
      initial,
      {
        ...emptyExtraction(),
        constraints: [
          {
            id: 'con_hard',
            category: 'technology',
            rule: 'must use native fetch',
            reason: 'policy',
            severity: 'hard',
            turn: 20,
            isActive: true,
          },
        ],
      },
      20,
    )

    expect(next.constraints).toHaveLength(1)
    expect(next.constraints[0]?.severity).toBe('hard')
    expect(next.constraints[0]?.rule).toContain('fetch')
    expect(next.facts).toHaveLength(0)
  })

  it('keeps an accepted choice while recording rejected alternatives from the same topic', () => {
    const merger = new StateMerger()
    const initial = createEmptySessionState()

    const next = merger.merge(
      initial,
      {
        ...emptyExtraction(),
        decisions: [
          {
            id: 'dec_rej',
            topic: 'http_client_choice',
            choice: '[REJECTED]',
            alternativesRejected: ['axios'],
            reason: '',
            status: DecisionStatus.REJECTED,
            turn: 2,
          },
          {
            id: 'dec_acc',
            topic: 'http_client_choice',
            choice: 'fetch',
            alternativesRejected: [],
            reason: '',
            status: DecisionStatus.ACCEPTED,
            turn: 2,
          },
        ],
      },
      2,
    )

    expect(next.decisions).toHaveLength(1)
    expect(next.decisions[0]?.choice).toBe('fetch')
    expect(next.decisions[0]?.alternativesRejected).toContain('axios')
  })

  it('creates completed tasks even when no planned task existed yet', () => {
    const merger = new StateMerger()
    const initial = createEmptySessionState()

    const next = merger.merge(
      initial,
      {
        ...emptyExtraction(),
        tasks: [
          {
            action: 'complete',
            description: 'updated src/indexing/indexWriter.ts to export the DOT graph',
            detail: '',
            turn: 4,
          },
        ],
      },
      4,
    )

    expect(next.tasks).toHaveLength(1)
    expect(next.tasks[0]?.status).toBe('done')
    expect(next.tasks[0]?.description).toContain('indexWriter.ts')
  })
})
