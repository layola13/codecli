import React, { useEffect } from 'react'

type SnapshotUpdateDialogProps = {
  agentType: string
  scope: unknown
  snapshotTimestamp: string
  onComplete: (choice: 'merge' | 'keep' | 'replace') => void
  onCancel: () => void
}

export function SnapshotUpdateDialog({
  onCancel,
}: SnapshotUpdateDialogProps): React.JSX.Element | null {
  useEffect(() => {
    onCancel()
  }, [onCancel])

  return null
}

export function buildMergePrompt(_args?: unknown): string {
  return ''
}
