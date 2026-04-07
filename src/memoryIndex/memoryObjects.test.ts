import { describe, expect, it } from 'bun:test'
import { buildMemoryObjects } from './memoryObjects.js'

describe('memoryObjects', () => {
  it('extracts preferences, constraints, rationales, and superseded decisions', () => {
    const objects = buildMemoryObjects({
      prompts: [
        {
          eventId: 'prompt:1',
          sessionId: 'session-1',
          transcriptRelativePath: 'session-1.jsonl',
          timestamp: '2026-04-06T00:00:01.000Z',
          normalizedText:
            '不要用 Axios，改用 fetch。优先保持 index 简单，因为这样更稳定。',
          fullText:
            '不要用 Axios，改用 fetch。优先保持 index 简单，因为这样更稳定。',
        },
        {
          eventId: 'prompt:2',
          sessionId: 'session-1',
          transcriptRelativePath: 'session-1.jsonl',
          timestamp: '2026-04-06T00:00:03.000Z',
          normalizedText: '这个约束必须长期有效，不要回退到 Axios。',
          fullText: '这个约束必须长期有效，不要回退到 Axios。',
        },
      ],
      plans: [
        {
          eventId: 'plan:1',
          sessionId: 'session-1',
          transcriptRelativePath: 'session-1.jsonl',
          timestamp: '2026-04-06T00:00:02.000Z',
          content: '因为 Axios 会让实现更复杂，所以这里保持简单。',
        },
      ],
    })

    expect(objects.some(object => object.kind === 'user_preference')).toBe(true)
    expect(objects.some(object => object.kind === 'stable_constraint')).toBe(true)
    expect(objects.some(object => object.kind === 'decision_rationale')).toBe(true)
    expect(
      objects.some(
        object =>
          object.kind === 'superseded_decision' &&
          object.replacementStatement?.includes('fetch'),
      ),
    ).toBe(true)
  })

  it('ignores subagent research prompts and boilerplate from semantic memory', () => {
    const objects = buildMemoryObjects({
      prompts: [
        {
          eventId: 'prompt:sidechain',
          sessionId: 'session-sidechain',
          transcriptRelativePath: 'session-1/subagents/agent-1.jsonl',
          timestamp: '2026-04-06T00:01:00.000Z',
          isSidechain: true,
          agentId: 'agent-1',
          normalizedText:
            'Deeply analyze the memory-index system. This is research only, do not write code. Focus on current tests.',
          fullText:
            'Deeply analyze the memory-index system. This is research only, do not write code. Focus on current tests.',
        },
        {
          eventId: 'prompt:boilerplate',
          sessionId: 'session-main',
          transcriptRelativePath: 'session-main.jsonl',
          timestamp: '2026-04-06T00:01:10.000Z',
          normalizedText:
            'Continue the conversation from where it left off without asking the user any further questions.',
          fullText:
            'Continue the conversation from where it left off without asking the user any further questions.',
        },
        {
          eventId: 'prompt:system',
          sessionId: 'session-main',
          transcriptRelativePath: 'session-main.jsonl',
          timestamp: '2026-04-06T00:01:20.000Z',
          normalizedText: '[System] Initialized (fires only once)',
          fullText: '[System] Initialized (fires only once)',
        },
        {
          eventId: 'prompt:stdout',
          sessionId: 'session-main',
          transcriptRelativePath: 'session-main.jsonl',
          timestamp: '2026-04-06T00:01:30.000Z',
          normalizedText:
            '<local-command-stdout>Set model to Sonnet 4.6 (default)</local-command-stdout>',
          fullText:
            '<local-command-stdout>Set model to Sonnet 4.6 (default)</local-command-stdout>',
        },
      ],
      plans: [],
    })

    expect(objects).toHaveLength(0)
  })

  it('rejects malformed superseded decisions and trims replacement request tails', () => {
    const objects = buildMemoryObjects({
      prompts: [
        {
          eventId: 'prompt:bad-negative',
          sessionId: 'session-1',
          transcriptRelativePath: 'session-1.jsonl',
          timestamp: '2026-04-06T00:02:00.000Z',
          normalizedText: '不是在等待，也不是我没继续',
          fullText: '不是在等待，也不是我没继续',
        },
        {
          eventId: 'prompt:good-negative',
          sessionId: 'session-1',
          transcriptRelativePath: 'session-1.jsonl',
          timestamp: '2026-04-06T00:02:10.000Z',
          normalizedText:
            '不是这个工程的问题，是上游大模型的问题，你评估上游大模型要如何才能支持并行agent。',
          fullText:
            '不是这个工程的问题，是上游大模型的问题，你评估上游大模型要如何才能支持并行agent。',
        },
      ],
      plans: [],
    })

    expect(
      objects.some(
        object =>
          object.kind === 'superseded_decision' &&
          object.statement.includes('我没继续'),
      ),
    ).toBe(false)

    const superseded = objects.find(
      object => object.kind === 'superseded_decision',
    )
    expect(superseded?.supersededStatement).toBe('这个工程的问题')
    expect(superseded?.replacementStatement).toBe('上游大模型的问题')
  })

  it('keeps durable priorities but drops one-off task requests from preferences', () => {
    const objects = buildMemoryObjects({
      prompts: [
        {
          eventId: 'prompt:priority',
          sessionId: 'session-1',
          transcriptRelativePath: 'session-1.jsonl',
          timestamp: '2026-04-06T00:03:00.000Z',
          normalizedText: '首要解决 cpp,c,c# 支持。',
          fullText: '首要解决 cpp,c,c# 支持。',
        },
        {
          eventId: 'prompt:task',
          sessionId: 'session-1',
          transcriptRelativePath: 'session-1.jsonl',
          timestamp: '2026-04-06T00:03:10.000Z',
          normalizedText:
            "'/home/vscode/projects/claudecode/package/claude-code-2.1.88/.code_index/skeleton/src/*.py'我想讲这里的所有py生成dot依赖，参考**是的，下面重点推荐",
          fullText:
            "'/home/vscode/projects/claudecode/package/claude-code-2.1.88/.code_index/skeleton/src/*.py'我想讲这里的所有py生成dot依赖，参考**是的，下面重点推荐",
        },
      ],
      plans: [],
    })

    expect(
      objects.some(
        object =>
          object.kind === 'user_preference' &&
          object.statement.includes('cpp,c,c#'),
      ),
    ).toBe(true)
    expect(
      objects.some(
        object =>
          object.kind === 'user_preference' &&
          object.statement.includes('.code_index/skeleton/src/*.py'),
      ),
    ).toBe(false)
  })
})
