import React, { useEffect } from 'react'

type AssistantSessionChooserProps = {
  sessions: unknown[]
  onSelect: (id: string) => void
  onCancel: () => void
}

export function AssistantSessionChooser({
  onCancel,
}: AssistantSessionChooserProps): React.JSX.Element | null {
  useEffect(() => {
    onCancel()
  }, [onCancel])

  return null
}
