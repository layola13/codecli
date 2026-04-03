import React from 'react'
import { Box, Text } from '../../ink.js'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import { gracefulShutdownSync } from '../../utils/gracefulShutdown.js'
import { Select } from '../CustomSelect/index.js'

type Props = {
  onDone(): void
  onCancel(): void
  isDocker: boolean
  isBubblewrap: boolean
  isSandbox: boolean
  hasInternet: boolean
}

export function DspWarningDialog({
  onDone,
  onCancel,
  isDocker,
  isBubblewrap,
  isSandbox,
  hasInternet,
}: Props): React.ReactNode {
  useKeybinding('confirm:no', () => {
    onCancel()
  }, { context: 'Confirmation' })

  const onChange = (value: string) => {
    if (value === 'exit') {
      gracefulShutdownSync(1)
      return
    }
    if (value === 'continue') {
      onDone()
    }
  }

  const options = [
    { label: 'I understand the risks, continue', value: 'continue' },
    { label: 'No, exit', value: 'exit' },
  ]

  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      <Box flexDirection="column" gap={1}>
        <Text bold={true}>⚠ Security Warning: --dangerously-skip-permissions</Text>
        <Text>
          This flag skips all permission prompts, allowing Claude Code to
          read, edit, and execute files without confirmation.
        </Text>
        <Text>
          Environment check: Docker: {String(isDocker)}, Sandbox: {String(isSandbox)}, Bubblewrap: {String(isBubblewrap)}, Internet: {String(hasInternet)}
        </Text>
        <Text color="warning">
          This is intended for isolated sandbox environments. Using it on a
          regular machine with internet access is dangerous.
        </Text>
        <Text dimColor={true}>
          See{' '}
          <Text>
            https://code.claude.com/docs/en/security
          </Text>
        </Text>
      </Box>
      <Select
        options={options}
        onChange={onChange}
        onCancel={onCancel}
        visibleOptionCount={2}
      />
    </Box>
  )
}
