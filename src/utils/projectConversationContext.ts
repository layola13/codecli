import { homedir } from 'os'
import { join, relative, resolve } from 'path'
import { getProjectDir } from './sessionStoragePortable.js'

function isWithinOrEqual(baseDir: string, targetPath: string): boolean {
  const relativePath = relative(baseDir, targetPath)
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !relativePath.startsWith('../'))
  )
}

export function getProjectConversationContextDir(rootDir: string): string {
  return join(resolve(rootDir), '.claude', 'projects', 'context')
}

export function getProjectConversationTranscriptsDir(rootDir: string): string {
  return join(getProjectConversationContextDir(rootDir), 'transcripts')
}

export function getProjectConversationFileHistoryDir(rootDir: string): string {
  return join(getProjectConversationContextDir(rootDir), 'file-history')
}

export function getProjectConversationBackupPath(args: {
  rootDir: string
  sessionId: string
  backupFileName: string
}): string {
  return join(
    getProjectConversationFileHistoryDir(args.rootDir),
    args.sessionId,
    args.backupFileName,
  )
}

export function getProjectConversationMirrorPath(args: {
  rootDir: string
  transcriptPath: string
}): string | null {
  const transcriptRoot = getProjectDir(resolve(args.rootDir))
  const absoluteTranscriptPath = resolve(args.transcriptPath)
  if (!isWithinOrEqual(transcriptRoot, absoluteTranscriptPath)) {
    return null
  }
  return join(
    getProjectConversationTranscriptsDir(args.rootDir),
    relative(transcriptRoot, absoluteTranscriptPath),
  )
}

export function getCodexConfigHomeDir(): string {
  return (process.env.CODEX_HOME ?? join(homedir(), '.codex')).normalize('NFC')
}

export function getCodexSessionsDir(): string {
  return join(getCodexConfigHomeDir(), 'sessions')
}

export function matchesProjectConversationRoot(
  rootDir: string,
  candidateCwd: string,
): boolean {
  const normalizedRoot = resolve(rootDir)
  const normalizedCandidate = resolve(candidateCwd)
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}/`)
  )
}
