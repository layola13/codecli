export type SearchResult = {
  path: string
  score: number
}

export type AsyncLoadResult = {
  queryable: Promise<void>
  done: Promise<void>
}

export interface FileIndexBackend {
  loadFromFileList(fileList: string[]): void
  loadFromFileListAsync(fileList: string[]): AsyncLoadResult
  search(query: string, limit: number): SearchResult[]
}

export const TOP_LEVEL_CACHE_LIMIT = 100
export const MAX_QUERY_LEN = 64
// Yield to event loop after this many ms of sync work. Chunk sizes are
// time-based (not count-based) so slow machines get smaller chunks and
// stay responsive — 5k paths is ~2ms on M-series but could be 15ms+ on
// older Windows hardware.
export const CHUNK_MS = 4

export function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}
