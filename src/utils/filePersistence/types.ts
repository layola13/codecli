export type FailedPersistence = {
  path: string
  error: string
}

export type PersistedFile = {
  path: string
  fileId: string
}

export type TurnStartTime = number

export type FilesPersistedEventData = {
  files: PersistedFile[]
  failed: FailedPersistence[]
  durationMs: number
}

export const DEFAULT_UPLOAD_CONCURRENCY = 4
export const FILE_COUNT_LIMIT = 100
export const OUTPUTS_SUBDIR = 'outputs'
