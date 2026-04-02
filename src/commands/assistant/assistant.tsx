import React, { useEffect } from 'react'

type NewInstallWizardProps = {
  defaultDir: string
  onInstalled: (dir: string) => void
  onCancel: () => void
  onError: (message: string) => void
}

export function NewInstallWizard({
  onCancel,
}: NewInstallWizardProps): React.JSX.Element | null {
  useEffect(() => {
    onCancel()
  }, [onCancel])

  return null
}

export async function computeDefaultInstallDir(): Promise<string> {
  return process.cwd()
}
