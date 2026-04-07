import { describe, expect, it, mock } from 'bun:test'
import { readFile } from 'fs/promises'
import {
  getConciseModeOptIn,
  getQuietModeOptIn,
  setConciseModeOptIn,
  setQuietModeOptIn,
} from '../bootstrap/state.js'

mock.module('color-diff-napi', () => ({
  ColorDiff: class {},
  ColorFile: class {},
  getSyntaxTheme: () => null,
}))

type OnDoneCall = {
  message: string
  options?: {
    display?: string
    metaMessages?: string[]
  }
}

async function runCommand(
  commandPromise: Promise<{
    default: {
      load: () => Promise<{ call: (...args: unknown[]) => Promise<unknown> }>
    }
  }>,
  args: string,
): Promise<OnDoneCall> {
  const command = (await commandPromise).default
  const loaded = await command.load()
  let doneCall: OnDoneCall | null = null

  await loaded.call(
    (message, options) => {
      doneCall = { message, options }
    },
    {
      setAppState(update) {
        update({
          toolPermissionContext: {
            mode: 'default',
            additionalWorkingDirectories: new Map(),
            alwaysAllowRules: {},
            alwaysDenyRules: {},
            alwaysAskRules: {},
            isBypassPermissionsModeAvailable: false,
          },
        } as never)
      },
    } as never,
    args,
  )

  if (doneCall === null) {
    throw new Error('Expected command to call onDone')
  }

  return doneCall
}

describe('output mode command reminders', () => {
  it('/quiet off does not re-enable unsolicited milestone updates', async () => {
    const previousQuiet = getQuietModeOptIn()
    setQuietModeOptIn(true)

    try {
      const result = await runCommand(import('./quiet.js'), 'off')

      expect(result.message).toBe('Quiet mode disabled')
      expect(result.options?.metaMessages?.[0]).toContain(
        'Default behavior still avoids unsolicited progress updates',
      )
      expect(result.options?.metaMessages?.[0]).not.toContain(
        'Normal milestone updates are allowed again',
      )
    } finally {
      setQuietModeOptIn(previousQuiet)
    }
  })

  it('/concise on only tightens required user-visible messages', async () => {
    const previousConcise = getConciseModeOptIn()
    setConciseModeOptIn(false)

    try {
      const result = await runCommand(import('./concise.js'), 'on')

      expect(result.message).toBe('Concise mode enabled')
      expect(result.options?.metaMessages?.[0]).toContain(
        'If you need to send a blocker, confirmation, requested progress update, or final result, keep it brief',
      )
      expect(result.options?.metaMessages?.[0]).not.toContain(
        'Keep intermediate updates very short',
      )
    } finally {
      setConciseModeOptIn(previousConcise)
    }
  })

  it('/autocontinue reminders do not suggest phase-completion announcements', async () => {
    const source = await readFile(
      new URL('./autocontinue.ts', import.meta.url),
      'utf8',
    )

    expect(source).toContain('do not stop just to announce phase completions')
    expect(source).not.toContain('ask before proceeding to the next phase')
  })
})
