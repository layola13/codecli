/**
 * State Merger for the Context Compression Engine.
 *
 * Handles incremental merging of extraction results into the session state
 * with deduplication, similarity-based merging, decay, and eviction.
 */

import {
  type Decision,
  DecisionStatus,
  type Constraint,
  type TaskRecord,
  type SessionState,
  type KnowledgeFact,
  FactConfidence,
  type CodeAnchor,
  type ErrorMemory,
} from './models.js'
import type { ExtractionResult } from './extractors.js'
import { similarity, SIMILARITY } from './utils.js'

// ── Capacity constants ─────────────────────────────────────────────────────

export const MAX = {
  DECISIONS: 30,
  CONSTRAINTS: 20,
  FACTS: 50,
  TASKS: 15,
  ANCHORS: 20,
  ERRORS: 10,
}

// ── State Merger ───────────────────────────────────────────────────────────

export class StateMerger {
  merge(
    state: SessionState,
    extraction: ExtractionResult,
    turn: number,
  ): SessionState {
    const next: SessionState = {
      ...state,
      lastUpdatedTurn: turn,
      decisions: [...state.decisions],
      constraints: [...state.constraints],
      tasks: [...state.tasks],
      facts: state.facts ? [...state.facts] : [],
      codeAnchors: state.codeAnchors ? [...state.codeAnchors] : [],
      errorMemories: state.errorMemories ? [...state.errorMemories] : [],
    }

    // Goal update
    if (extraction.goalUpdate) {
      next.primaryGoal = extraction.goalUpdate
    }

    // Merge each type
    for (const dec of extraction.decisions) {
      this._mergeDecision(next, dec)
    }
    for (const con of extraction.constraints) {
      this._mergeConstraint(next, con)
    }
    for (const fact of extraction.factUpdates) {
      this._mergeFact(next, fact)
    }
    for (const taskUpdate of extraction.tasks) {
      this._mergeTask(next, taskUpdate, turn)
    }
    for (const anchor of extraction.codeAnchors) {
      this._mergeAnchor(next, anchor)
    }
    for (const error of extraction.errorMemories) {
      this._mergeError(next, error)
    }

    // Decay and eviction
    this._decayAndEvict(next, turn)

    // Trim to limits
    this._trimToLimits(next)

    return next
  }

  // ── Decision merge ───────────────────────────────────────────────────────

  private _mergeDecision(state: SessionState, newDecision: Decision): void {
    const existingIdx = state.decisions.findIndex(
      d => d.topic === newDecision.topic && d.status !== DecisionStatus.SUPERSEDED,
    )

    if (existingIdx >= 0) {
      const existing = state.decisions[existingIdx]
      if (newDecision.status === DecisionStatus.REJECTED) {
        if (
          existing.status === DecisionStatus.ACCEPTED &&
          !this._rejectsCurrentChoice(existing, newDecision)
        ) {
          state.decisions[existingIdx] = {
            ...existing,
            alternativesRejected: this._mergeRejectedAlternatives(
              existing.alternativesRejected,
              newDecision.alternativesRejected,
            ),
          }
          return
        }

        state.decisions[existingIdx] = { ...existing, status: DecisionStatus.SUPERSEDED }
        state.decisions.push(newDecision)
      } else if (newDecision.status === DecisionStatus.ACCEPTED) {
        const priorRejected =
          existing.status === DecisionStatus.REJECTED
            ? existing.alternativesRejected
            : existing.choice && existing.choice !== '[REJECTED]'
              ? [existing.choice]
              : []

        state.decisions[existingIdx] = {
          ...newDecision,
          alternativesRejected: this._mergeRejectedAlternatives(
            existing.alternativesRejected,
            priorRejected,
            newDecision.alternativesRejected,
          ),
        }
      } else if (newDecision.status === DecisionStatus.REVERTED) {
        state.decisions[existingIdx] = { ...existing, status: DecisionStatus.SUPERSEDED }
        state.decisions.push(newDecision)
      } else if (newDecision.status === DecisionStatus.PROPOSED) {
        // Don't override accepted with proposed
        if (existing.status !== DecisionStatus.ACCEPTED) {
          state.decisions[existingIdx] = newDecision
        }
      }
    } else {
      state.decisions.push(newDecision)
    }
  }

  private _mergeRejectedAlternatives(...lists: string[][]): string[] {
    return Array.from(new Set(lists.flat().filter(Boolean)))
  }

  private _rejectsCurrentChoice(existing: Decision, rejection: Decision): boolean {
    const currentChoice = existing.choice.toLowerCase()
    return rejection.alternativesRejected.some(rejected => {
      const value = rejected.toLowerCase()
      return (
        value === currentChoice ||
        value.includes(currentChoice) ||
        currentChoice.includes(value)
      )
    })
  }

  // ── Constraint merge ─────────────────────────────────────────────────────

  private _mergeConstraint(state: SessionState, newConstraint: Constraint): void {
    // Check for similar existing constraints
    for (let i = 0; i < state.constraints.length; i++) {
      const existing = state.constraints[i]
      if (!existing.isActive) continue

      if (existing.rule === newConstraint.rule) {
        // Exact match — don't duplicate
        return
      }

      if (similarity(existing.rule, newConstraint.rule) > SIMILARITY.CONSTRAINT_MERGE) {
        // Similar — hard overrides soft
        if (newConstraint.severity === 'hard' && existing.severity === 'soft') {
          state.constraints[i] = newConstraint
        }
        return
      }
    }

    state.constraints.push(newConstraint)
  }

  // ── Fact merge ───────────────────────────────────────────────────────────

  private _mergeFact(state: SessionState, newFact: KnowledgeFact): void {
    if (!state.facts) state.facts = []

    const confidenceOrder: FactConfidence[] = [
      FactConfidence.CERTAIN,
      FactConfidence.INFERRED,
      FactConfidence.UNCERTAIN,
    ]

    const existingIdx = state.facts.findIndex(
      f => f.key === newFact.key && f.category === newFact.category,
    )

    if (existingIdx >= 0) {
      const existing = state.facts[existingIdx]
      const existingConfidence = confidenceOrder.indexOf(existing.confidence)
      const newConfidence = confidenceOrder.indexOf(newFact.confidence)

      if (newConfidence <= existingConfidence) {
        // New fact has equal or higher confidence — update
        state.facts[existingIdx] = newFact
      }
    } else {
      state.facts.push(newFact)
    }
  }

  // ── Task merge ───────────────────────────────────────────────────────────

  private _mergeTask(
    state: SessionState,
    taskUpdate: ExtractionResult['tasks'][number],
    turn: number,
  ): void {
    switch (taskUpdate.action) {
      case 'create': {
        const existing = this._findMatchingTask(state, taskUpdate.description, true)
        if (existing) {
          existing.description = taskUpdate.description
          existing.status = 'planned'
          existing.turn = turn
          return
        }

        state.tasks.push({
          id: `task_${turn}_${state.tasks.length}`,
          description: taskUpdate.description,
          status: 'planned',
          completedSubtasks: [],
          remainingSubtasks: [],
          artifacts: [],
          turn,
        })
        break
      }

      case 'complete': {
        const match = this._findMatchingTask(state, taskUpdate.description, true)
        if (match) {
          match.description = taskUpdate.description
          match.status = 'done'
          if (!match.completedSubtasks.includes(taskUpdate.description)) {
            match.completedSubtasks.push(taskUpdate.description)
          }
          match.turn = turn
        } else {
          state.tasks.push({
            id: `task_${turn}_${state.tasks.length}`,
            description: taskUpdate.description,
            status: 'done',
            completedSubtasks: [taskUpdate.description],
            remainingSubtasks: [],
            artifacts: [],
            turn,
          })
        }
        break
      }

      case 'block': {
        const blocked =
          this._findMatchingTask(state, taskUpdate.description, true) ||
          state.tasks.find(t => t.status === 'in_progress' || t.status === 'planned')
        if (blocked) {
          blocked.description = taskUpdate.description
          blocked.status = 'blocked'
          blocked.turn = turn
        } else {
          state.tasks.push({
            id: `task_${turn}_${state.tasks.length}`,
            description: taskUpdate.description,
            status: 'blocked',
            completedSubtasks: [],
            remainingSubtasks: [],
            artifacts: [],
            turn,
          })
        }
        break
      }
    }
  }

  /**
   * Find a matching task by Jaccard similarity on description.
   */
  _findMatchingTask(
    state: SessionState,
    description: string,
    includeCompleted: boolean = false,
  ): TaskRecord | null {
    for (const task of state.tasks) {
      if (
        !includeCompleted &&
        (task.status === 'done' || task.status === 'abandoned')
      ) {
        continue
      }

      if (
        task.status === 'in_progress' ||
        task.status === 'planned' ||
        (includeCompleted && task.status === 'done') ||
        task.description.toLowerCase().includes(description.toLowerCase().slice(0, 20))
      ) {
        return task
      }
      if (similarity(task.description, description) > SIMILARITY.TASK_MATCH) {
        return task
      }
    }
    return null
  }

  // ── Anchor merge ─────────────────────────────────────────────────────────

  private _mergeAnchor(state: SessionState, newAnchor: CodeAnchor): void {
    if (!state.codeAnchors) state.codeAnchors = []

    const existingIdx = state.codeAnchors.findIndex(
      a => a.filePath === newAnchor.filePath,
    )

    if (existingIdx >= 0) {
      const existing = state.codeAnchors[existingIdx]
      const priorityOrder = ['created', 'modified', 'read', 'referenced']
      const existingPriority = priorityOrder.indexOf(existing.action)
      const newPriority = priorityOrder.indexOf(newAnchor.action)

      if (newPriority < existingPriority) {
        state.codeAnchors[existingIdx] = newAnchor
      } else {
        // Update turn but keep existing action
        state.codeAnchors[existingIdx] = { ...existing, turn: newAnchor.turn }
      }
    } else {
      state.codeAnchors.push(newAnchor)
    }
  }

  // ── Error merge ──────────────────────────────────────────────────────────

  private _mergeError(state: SessionState, newError: ErrorMemory): void {
    if (!state.errorMemories) state.errorMemories = []

    // Check for similar existing errors
    for (const existing of state.errorMemories) {
      if (
        similarity(existing.approach, newError.approach) > SIMILARITY.ERROR_MERGE ||
        similarity(existing.failureReason, newError.failureReason) > SIMILARITY.ERROR_MERGE
      ) {
        // Similar error — update turn but don't duplicate
        existing.turn = newError.turn
        return
      }
    }

    state.errorMemories.push(newError)
  }

  // ── Decay and eviction ───────────────────────────────────────────────────

  private _decayAndEvict(state: SessionState, currentTurn: number): void {
    // SUPERSEDED decisions > 20 turns old → remove
    state.decisions = state.decisions.filter(
      d =>
        !(d.status === DecisionStatus.SUPERSEDED && currentTurn - d.turn > 20),
    )

    // UNCERTAIN facts > 15 turns old → remove
    if (state.facts) {
      state.facts = state.facts.filter(
        f =>
          !(f.confidence === FactConfidence.UNCERTAIN && currentTurn - f.sourceTurn > 10),
      )
    }

    // DONE/ABANDONED tasks > 30 turns old → remove
    state.tasks = state.tasks.filter(
      t =>
        !((t.status === 'done' || t.status === 'abandoned') && currentTurn - t.turn > 30),
    )

    // Inactive constraints > 20 turns old → remove
    state.constraints = state.constraints.filter(
      c => !(c.isActive === false && currentTurn - c.turn > 20),
    )
  }

  // ── Trim to capacity limits ──────────────────────────────────────────────

  private _trimToLimits(state: SessionState): void {
    // Decisions: keep active first, then superseded
    const activeDecisions = state.decisions.filter(d => d.status !== DecisionStatus.SUPERSEDED)
    const supersededDecisions = state.decisions.filter(d => d.status === DecisionStatus.SUPERSEDED)
    if (activeDecisions.length > MAX.DECISIONS) {
      state.decisions = activeDecisions.slice(-MAX.DECISIONS)
    } else if (activeDecisions.length + supersededDecisions.length > MAX.DECISIONS) {
      const available = MAX.DECISIONS - activeDecisions.length
      state.decisions = [
        ...activeDecisions,
        ...supersededDecisions.slice(-available),
      ]
    }

    // Constraints
    state.constraints = state.constraints.filter(c => c.isActive).slice(-MAX.CONSTRAINTS)

    // Facts
    if (state.facts && state.facts.length > MAX.FACTS) {
      state.facts = state.facts.slice(-MAX.FACTS)
    }

    // Tasks
    if (state.tasks.length > MAX.TASKS) {
      state.tasks = state.tasks.slice(-MAX.TASKS)
    }

    // Anchors
    if (state.codeAnchors && state.codeAnchors.length > MAX.ANCHORS) {
      state.codeAnchors = state.codeAnchors.slice(-MAX.ANCHORS)
    }

    // Errors
    if (state.errorMemories && state.errorMemories.length > MAX.ERRORS) {
      state.errorMemories = state.errorMemories.slice(-MAX.ERRORS)
    }
  }
}
