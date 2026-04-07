export type MemoryIndexBuildPhase =
  | 'discover'
  | 'extract'
  | 'diff'
  | 'analyze'
  | 'write'
  | 'skills'
  | 'complete'

export type MemoryIndexBuildProgress = {
  phase: MemoryIndexBuildPhase
  message: string
  completed?: number
  total?: number
}

export type MemoryIndexProgressCallback = (
  progress: MemoryIndexBuildProgress,
) => void | Promise<void>
