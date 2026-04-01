/**
 * Context Compression Engine
 *
 * Compresses raw conversation history into structured Python state objects.
 *
 * Usage:
 *   import { extractFromTurn, mergeExtractionResult, serializeToPython, createEmptySessionState } from './compression'
 *
 *   // On each turn:
 *   const result = extractFromTurn(text, role, turnNumber)
 *   state = mergeExtractionResult(state, result, turnNumber)
 *
 *   // Periodically serialize:
 *   const pythonCode = serializeToPython(state)
 */

export {
  type Decision,
  DecisionStatus,
  type Constraint,
  type TaskRecord,
  type SessionState,
} from './models.js'

export {
  extractFromTurn,
  type ExtractionResult,
} from './extractors.js'

export {
  createEmptySessionState,
  mergeExtractionResult,
  serializeToPython,
} from './serializer.js'
