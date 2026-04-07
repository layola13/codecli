import { ContextCompressorEngine } from '../../context/compression/engine.js'
import { getContextOutputDir } from '../../context/compression/paths.js'
import type { LocalCommandCall } from '../../types/command.js'

export const call: LocalCommandCall = async () => {
  const engine = new ContextCompressorEngine({
    autoSave: false,
    outputDir: getContextOutputDir(),
  })

  const state = await engine.loadExistingState()
  if (!state) {
    return {
      type: 'text' as const,
      value: [
        'No compressed context found.',
        'Run `/compress` first.',
        '',
        `Expected files:`,
        `  ${engine.outputPythonPath}`,
        `  ${engine.outputHistoryPath}`,
        `  ${engine.outputMetricsPath}`,
        `  ${engine.outputGraphPath}`,
        `  ${engine.outputJsonPath}`,
      ].join('\n'),
    }
  }

  const stats = engine.getStats()
  const compressionRatio =
    stats.compressedChars > 0
      ? (stats.rawCharsIngested / stats.compressedChars).toFixed(2)
      : '0.00'

  return {
    type: 'text' as const,
    value: [
      'Context compression status.',
      '',
      `Session ID: ${state.sessionId ?? 'unknown'}`,
      `Primary goal: ${state.primaryGoal || 'Not yet defined'}`,
      `Last updated turn: ${state.lastUpdatedTurn}`,
      `Total turns: ${stats.totalTurns}`,
      `Raw chars ingested: ${stats.rawCharsIngested}`,
      `Compressed chars: ${stats.compressedChars}`,
      `Compression ratio: ${compressionRatio}x`,
      '',
      'Slot counts:',
      `  Decisions: ${stats.decisions}`,
      `  Constraints: ${stats.constraints}`,
      `  Tasks: ${stats.tasks}`,
      `  Facts: ${stats.facts}`,
      `  Anchors: ${stats.anchors}`,
      `  Errors: ${stats.errors}`,
      '',
      'Files:',
      `  ${engine.outputPythonPath}`,
      `  ${engine.outputHistoryPath}`,
      `  ${engine.outputMetricsPath}`,
      `  ${engine.outputGraphPath}`,
      `  ${engine.outputJsonPath}`,
    ].join('\n'),
  }
}
