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

// ── Models ───────────────────────────────────────────────────────────────────

export {
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

// ── Extractors ───────────────────────────────────────────────────────────────

export {
  extractFromTurn,
  type ExtractionResult,
  MasterExtractor,
  GoalDetector,
  FactDetector,
  DecisionDetector,
  ConstraintDetector,
  AnchorDetector,
  ErrorMemoryDetector,
} from './extractors.js'

// ── Serializer ───────────────────────────────────────────────────────────────

export {
  createEmptySessionState,
  mergeExtractionResult,
  serializeToPython,
  StateSerializer,
  decisionToPythonLine,
  constraintToPythonLine,
  factToPythonLine,
  anchorToPythonLine,
  errorToPythonLine,
  taskToPythonBlock,
  serializeHistoryToPython,
  serializeMetricsToPython,
} from './serializer.js'

// ── Merger ───────────────────────────────────────────────────────────────────

export {
  StateMerger,
  MAX as CAPACITY_LIMITS,
} from './merger.js'

// ── Engine ───────────────────────────────────────────────────────────────────

export {
  ContextCompressorEngine,
  type CompressionStats,
} from './engine.js'

// ── Utils ────────────────────────────────────────────────────────────────────

export {
  similarity,
  SIMILARITY,
  toVarName,
  escape,
  stripCodeBlocks,
  makeId,
  atomicWrite,
} from './utils.js'

export {
  persistCompressedSessionState,
  readCompressedSessionStateForPrompt,
} from './runtime.js'
