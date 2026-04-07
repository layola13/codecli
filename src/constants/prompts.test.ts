import { describe, expect, it, mock } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  setAutoContinueOptIn,
  setConciseModeOptIn,
  setQuietModeOptIn,
} from '../bootstrap/state.js'
import { clearSystemPromptSections } from './systemPromptSections.js'
import {
  BRIEF_PROACTIVE_SECTION,
  BRIEF_TOOL_PROMPT,
} from '../tools/BriefTool/prompt.js'

process.env.ANTHROPIC_API_KEY ??= 'test'
process.env.NODE_ENV = 'test'

;(globalThis as typeof globalThis & { MACRO: Record<string, string> }).MACRO = {
  ISSUES_EXPLAINER: '/issue',
  VERSION: 'test',
  BUILD_TIME: '',
  PACKAGE_URL: '@anthropic-ai/claude-code',
  FEEDBACK_CHANNEL: '#claude-code-feedback',
  VERSION_CHANGELOG: '',
  NATIVE_PACKAGE_URL: '',
}

mock.module('color-diff-napi', () => ({
  ColorDiff: class {},
  ColorFile: class {},
  getSyntaxTheme: () => null,
}))

async function buildPrompt(options?: {
  userType?: string
  quiet?: boolean
  autocontinue?: boolean
}): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), 'claude-prompt-test-root-'))
  const configDir = await mkdtemp(
    join(tmpdir(), 'claude-prompt-test-config-'),
  )
  const previousUserType = process.env.USER_TYPE
  const previousConfigDir = process.env.CLAUDE_CONFIG_DIR

  setQuietModeOptIn(options?.quiet ?? false)
  setAutoContinueOptIn(options?.autocontinue ?? false)
  setConciseModeOptIn(false)
  clearSystemPromptSections()

  if (options?.userType === undefined) {
    delete process.env.USER_TYPE
  } else {
    process.env.USER_TYPE = options.userType
  }
  process.env.CLAUDE_CONFIG_DIR = configDir

  try {
    const { getSystemPrompt } = await import('./prompts.js')
    const { runWithCwdOverride } = await import('../utils/cwd.js')
    const prompt = await runWithCwdOverride(rootDir, () =>
      getSystemPrompt([], 'claude-sonnet-4-6'),
    )
    return prompt.join('\n\n')
  } finally {
    clearSystemPromptSections()
    setQuietModeOptIn(false)
    setAutoContinueOptIn(false)
    setConciseModeOptIn(false)

    if (previousUserType === undefined) {
      delete process.env.USER_TYPE
    } else {
      process.env.USER_TYPE = previousUserType
    }

    if (previousConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = previousConfigDir
    }

    await rm(rootDir, { recursive: true, force: true })
    await rm(configDir, { recursive: true, force: true })
  }
}

describe('system prompt progress policy', () => {
  it('defaults to silent execution for external users', async () => {
    const prompt = await buildPrompt()

    expect(prompt).toContain('Default to silent execution while you work.')
    expect(prompt).toContain('Final results or confirmations the user needs to see')
    expect(prompt).not.toContain('Before your first tool call')
    expect(prompt).not.toContain('give short updates at key moments')
    expect(prompt).not.toContain(
      'High-level status updates at natural milestones',
    )
  })

  it('defaults to silent execution for ant users', async () => {
    const prompt = await buildPrompt({ userType: 'ant' })

    expect(prompt).toContain(
      'Do not send acknowledgements, routine progress updates, checkpoint summaries, phase-boundary reports',
    )
    expect(prompt).toContain('Break silence only when one of these is true:')
    expect(prompt).not.toContain('Before your first tool call')
    expect(prompt).not.toContain('give short updates at key moments')
  })

  it('keeps quiet and autocontinue prompts aligned with silent execution', async () => {
    const prompt = await buildPrompt({
      quiet: true,
      autocontinue: true,
    })

    expect(prompt).toContain(
      'Apply an even stricter version of the default silent-execution policy.',
    )
    expect(prompt).toContain(
      'If you can immediately move into the next obvious implementation, debugging, verification, or cleanup step, do so silently.',
    )
    expect(prompt).not.toContain(
      'report once at the end rather than narrating intermediate milestones',
    )
  })

  it('brief prompts require silent work until a blocker or final result', () => {
    expect(BRIEF_TOOL_PROMPT).toContain(
      'a blocker, a required decision, or a completed background task',
    )
    expect(BRIEF_TOOL_PROMPT).not.toContain('unsolicited status update')
    expect(BRIEF_PROACTIVE_SECTION).toContain('do the work silently')
    expect(BRIEF_PROACTIVE_SECTION).toContain(
      'No acknowledgements or checkpoints by default.',
    )
    expect(BRIEF_PROACTIVE_SECTION).not.toContain('ack first')
    expect(BRIEF_PROACTIVE_SECTION).not.toContain('send a checkpoint')
  })
})
