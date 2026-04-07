/**
 * Context Compressor Engine — main orchestrator.
 *
 * Ingests conversation turns, extracts structured atoms, merges them into
 * session state, and persists dual-format output (.py + .json).
 */

import path from 'path'
import { promises as fs } from 'fs'
import { type SessionState } from './models.js'
import { MasterExtractor } from './extractors.js'
import { buildConversationTurnRecord } from './graph.js'
import { StateMerger } from './merger.js'
import { StateSerializer, createEmptySessionState } from './serializer.js'
import { atomicWrite, makeId } from './utils.js'

export interface CompressionStats {
  totalTurns: number
  rawCharsIngested: number
  compressedChars: number
  decisions: number
  constraints: number
  tasks: number
  facts: number
  anchors: number
  errors: number
}

interface CompressorOptions {
  outputDir?: string
  skeletonIndex?: Map<string, string>
  autoSave?: boolean
  saveEveryNTurns?: number
  debug?: boolean
  sessionId?: string
}

export class ContextCompressorEngine {
  private state: SessionState
  private extractor: MasterExtractor
  private merger: StateMerger
  private serializer: StateSerializer
  private outputDir: string
  private sessionId: string
  private autoSave: boolean
  private saveEveryNTurns: number
  private debug: boolean
  private rawCharsIngested: number = 0

  constructor(opts: CompressorOptions = {}) {
    this.outputDir = opts.outputDir || '.claude/context'
    this.sessionId = opts.sessionId || `session_${Date.now()}`
    this.autoSave = opts.autoSave !== false
    this.saveEveryNTurns = opts.saveEveryNTurns || 1
    this.debug = opts.debug || false

    this.extractor = new MasterExtractor(opts.skeletonIndex)
    this.merger = new StateMerger()
    this.serializer = new StateSerializer()
    this.state = createEmptySessionState()
    this.state.sessionId = this.sessionId
    this.syncStateMetrics()
  }

  get outputPythonPath(): string {
    return path.join(this.outputDir, 'session_state.py')
  }

  get outputJsonPath(): string {
    return path.join(this.outputDir, 'session_state.json')
  }

  get outputHistoryPath(): string {
    return path.join(this.outputDir, 'session_history.py')
  }

  get outputMetricsPath(): string {
    return path.join(this.outputDir, 'session_metrics.py')
  }

  get outputGraphPath(): string {
    return path.join(this.outputDir, 'session_graph.py')
  }

  /**
   * Ingest a single conversation turn.
   * Silent failure: catches errors and returns current state.
   */
  ingest(role: string, content: string, turn: number): SessionState {
    try {
      this.rawCharsIngested += content.length

      const extraction = this.extractor.extract(content, role, turn, this.state)
      const conversationTurns = this.state.conversationTurns || []
      const normalizedRole = role === 'assistant' ? 'assistant' : 'user'
      this.state = this.merger.merge(this.state, extraction, turn)
      this.state.conversationTurns = [
        ...conversationTurns,
        buildConversationTurnRecord(
          normalizedRole,
          content,
          turn,
          makeId('turn', `${role}:${content}`, turn),
          extraction,
          conversationTurns,
        ),
      ]
      this.state.totalTurns = turn
      this.state.lastTurnSignature = makeId('turn', `${role}:${content}`, turn)
      this.syncStateMetrics()

      if (this.autoSave && turn % this.saveEveryNTurns === 0) {
        this.saveSync()
      }

      return this.state
    } catch (e) {
      console.error('[Compressor] ingest failed:', e)
      return this.state
    }
  }

  /**
   * Ingest multiple messages in batch.
   */
  ingestBatch(messages: Array<{ role: string; content: string; turn: number }>): SessionState {
    for (const msg of messages) {
      this.ingest(msg.role, msg.content, msg.turn)
    }
    return this.state
  }

  /**
   * Save state to disk (async).
   */
  async save(): Promise<void> {
    try {
      await this.ensureOutputDir()
      this.syncStateMetrics()
      await this.serializer.save(this.state, this.outputPythonPath)
      this.syncStateMetrics()
      await this.serializer.saveHistory(this.state, this.outputHistoryPath)
      await this.serializer.saveMetrics(this.state, this.outputMetricsPath)
      await this.serializer.saveGraph(this.state, this.outputGraphPath)
      await atomicWrite(this.outputJsonPath, JSON.stringify(this.state, null, 2))
    } catch (e) {
      console.error('[Compressor] save failed:', e)
    }
  }

  /**
   * Save state to disk (sync, for use within ingest).
   */
  private saveSync(): void {
    try {
      this.syncStateMetrics()
      this.save().catch(e => console.error('[Compressor] async save failed:', e))
    } catch (e) {
      console.error('[Compressor] saveSync failed:', e)
    }
  }

  /**
   * Get compression statistics.
   */
  getStats(): CompressionStats {
    return {
      totalTurns: this.state.totalTurns || 0,
      rawCharsIngested: this.rawCharsIngested,
      compressedChars: this.state.compressedChars || 0,
      decisions: this.state.decisions.length,
      constraints: this.state.constraints.length,
      tasks: this.state.tasks.length,
      facts: this.state.facts?.length || 0,
      anchors: this.state.codeAnchors?.length || 0,
      errors: this.state.errorMemories?.length || 0,
    }
  }

  /**
   * Reset the engine to empty state.
   */
  reset(): void {
    this.state = createEmptySessionState()
    this.state.sessionId = this.sessionId
    this.rawCharsIngested = 0
    this.syncStateMetrics()
  }

  /**
   * Get the current session state.
   */
  getState(): SessionState {
    return { ...this.state }
  }

  /**
   * Load existing state from disk.
   * Priority: JSON > Python (regex fallback) > empty
   */
  async loadExistingState(): Promise<SessionState | null> {
    try {
      // Try JSON first
      const jsonContent = await fs.readFile(this.outputJsonPath, 'utf-8')
      const parsed = JSON.parse(jsonContent) as SessionState
      this.state = parsed
      this.state.conversationTurns = this.state.conversationTurns || []
      this.sessionId = parsed.sessionId || this.sessionId
      this.rawCharsIngested = parsed.rawCharsIngested || 0
      this.syncStateMetrics()
      return parsed
    } catch {
      // JSON not available, try Python
      try {
        const pythonContent = await fs.readFile(this.outputPythonPath, 'utf-8')
        const parsed = this._parsePythonState(pythonContent)
        if (parsed) {
          this.state = parsed
          this.syncStateMetrics()
          return parsed
        }
      } catch {
        // Python file not available either
      }
    }
    return null
  }

  private async ensureOutputDir(): Promise<void> {
    try {
      await fs.mkdir(this.outputDir, { recursive: true })
    } catch {
      // Directory may already exist
    }
  }

  private syncStateMetrics(): void {
    this.state.sessionId = this.state.sessionId || this.sessionId
    this.state.rawCharsIngested = this.rawCharsIngested
    this.state.totalTurns = this.state.totalTurns || this.state.lastUpdatedTurn
    this.state.conversationTurns = this.state.conversationTurns || []
  }

  private _parsePythonState(content: string): SessionState | null {
    // Fallback: extract goal from Python file via regex
    const goalMatch = content.match(/primary_goal\s*=\s*'(.+?)'/)
    if (goalMatch) {
      const state = createEmptySessionState()
      state.primaryGoal = goalMatch[1]
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, '\\')
      return state
    }
    return null
  }
}
