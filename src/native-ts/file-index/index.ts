import { type AsyncLoadResult, CHUNK_MS, type SearchResult, yieldToEventLoop } from './shared.js'
import { TypeScriptFileIndex } from './typescript.js'

export { CHUNK_MS, yieldToEventLoop, TypeScriptFileIndex }
export type { SearchResult } from './shared.js'

type FileIndexBackend = {
  loadFromFileList(fileList: string[]): void
  loadFromFileListAsync(fileList: string[]): AsyncLoadResult
  search(query: string, limit: number): SearchResult[]
}

export class FileIndex implements FileIndexBackend {
  private readonly backend: FileIndexBackend

  constructor() {
    this.backend = new TypeScriptFileIndex()
  }

  loadFromFileList(fileList: string[]): void {
    this.backend.loadFromFileList(fileList)
  }

  loadFromFileListAsync(fileList: string[]): AsyncLoadResult {
    return this.backend.loadFromFileListAsync(fileList)
  }

  search(query: string, limit: number): SearchResult[] {
    return this.backend.search(query, limit)
  }
}

export default FileIndex
export type { FileIndex as FileIndexType }
