import { getSystemPrompt } from '../constants/prompts.js'
import { getSystemContext, getUserContext } from '../context.js'
import type { ToolUseContext } from '../Tool.js'
import { runForkedAgent } from '../utils/forkedAgent.js'
import { createUserMessage, extractTextContent } from '../utils/messages.js'
import { asSystemPrompt } from '../utils/systemPromptType.js'
import type {
  MemoryGraphAgentDraft,
  MemoryGraphAnalysisInput,
} from './memoryGraph.js'

function buildAnalysisPrompt(input: MemoryGraphAnalysisInput): string {
  return [
    'You are Claude Code\'s internal memory graph analysis agent.',
    '',
    'Your task is to infer a durable relationship graph from factual project-history input.',
    'Do not produce UI lists, prose summaries, markdown, or commentary.',
    'Return JSON only.',
    '',
    'Hard requirements:',
    '- Build graph topics, not chronological bullet lists.',
    '- Prefer stable themes and decisions over one-off acknowledgements.',
    '- Connect sessions, files, plans, and durable memory objects when they materially reinforce each other.',
    '- Reuse the provided segment_ids exactly; do not invent new segment ids.',
    '- Ignore low-signal one-word turns unless they change a plan or constraint.',
    '- Keep topic titles short and reusable.',
    '',
    'Return exactly one JSON object with this shape:',
    '{',
    '  "topics": [',
    '    {',
    '      "title": "short topic title",',
    '      "summary": "1-sentence explanation of what the topic means",',
    '      "status": "active",',
    '      "session_ids": ["session-id"],',
    '      "file_paths": ["src/file.ts"],',
    '      "plan_ids": ["plan:event-id"],',
    '      "memory_object_ids": ["memory:..."],',
    '      "related_topics": [{"title": "other topic", "reason": "why related"}]',
    '    }',
    '  ],',
    '  "sessions": [',
    '    {',
    '      "session_id": "session-id",',
    '      "title": "short session role title",',
    '      "summary": "what this session changed or reinforced",',
    '      "topic_titles": ["topic title"],',
    '      "file_paths": ["src/file.ts"],',
    '      "plan_ids": ["plan:event-id"],',
    '      "memory_object_ids": ["memory:..."],',
    '      "related_sessions": [{"session_id": "other-session", "reason": "why related"}]',
    '    }',
    '  ],',
    '  "files": [',
    '    {',
    '      "path": "src/file.ts",',
    '      "role": "why this file matters inside the graph",',
    '      "topic_titles": ["topic title"],',
    '      "session_ids": ["session-id"],',
    '      "plan_ids": ["plan:event-id"],',
    '      "memory_object_ids": ["memory:..."]',
    '    }',
    '  ],',
    '  "segments": [',
    '    {',
    '      "segment_id": "known-segment-id-from-input",',
    '      "kind": "prompt | plan | code_edit | non_code_text_edit",',
    '      "session_id": "session-id",',
    '      "title": "short segment label",',
    '      "summary": "what this context segment contributed",',
    '      "topic_titles": ["topic title"],',
    '      "file_paths": ["src/file.ts"],',
    '      "plan_ids": ["plan:event-id"],',
    '      "memory_object_ids": ["memory:..."],',
    '      "source_event_ids": ["prompt:..."],',
    '      "related_segments": [{"segment_id": "other-known-segment-id", "reason": "why related"}]',
    '    }',
    '  ],',
    '  "edges": [',
    '    {',
    '      "source": "session:session-id | topic:topic title | file:path | plan:plan-id | memory:memory-id | segment:segment-id",',
    '      "target": "same format",',
    '      "kind": "drives|implements|depends_on|revises|supersedes|reinforces|constrains|related_to",',
    '      "reason": "short reason"',
    '    }',
    '  ]',
    '}',
    '',
    'Project history facts:',
    JSON.stringify(input, null, 2),
  ].join('\n')
}

function extractJsonObject(text: string): string | null {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null
  }
  return text.slice(firstBrace, lastBrace + 1).trim()
}

function extractAssistantText(messages: ToolUseContext['messages']): string | null {
  const assistantBlocks = messages.flatMap(message =>
    message.type === 'assistant' ? message.message.content : [],
  )
  const text = extractTextContent(assistantBlocks, '\n\n').trim()
  return text || null
}

export async function analyzeMemoryGraphWithAgent(args: {
  context: ToolUseContext
  input: MemoryGraphAnalysisInput
}): Promise<MemoryGraphAgentDraft | null> {
  const [rawSystemPrompt, userContext, systemContext] = await Promise.all([
    getSystemPrompt(
      args.context.options.tools,
      args.context.options.mainLoopModel,
      [],
      args.context.options.mcpClients,
    ),
    getUserContext(),
    getSystemContext(),
  ])

  const result = await runForkedAgent({
    promptMessages: [
      createUserMessage({
        content: buildAnalysisPrompt(args.input),
      }),
    ],
    cacheSafeParams: {
      systemPrompt: asSystemPrompt(rawSystemPrompt),
      userContext,
      systemContext,
      toolUseContext: args.context,
      forkContextMessages: [],
    },
    canUseTool: async () => ({
      behavior: 'deny' as const,
      message: 'Memory graph analysis must not use tools',
      decisionReason: {
        type: 'other' as const,
        reason: 'memory_graph_analysis',
      },
    }),
    querySource: 'memory_index_graph' as never,
    forkLabel: 'memory_index_graph',
    maxTurns: 1,
    skipTranscript: true,
    skipCacheWrite: true,
  })

  const responseText = extractAssistantText(result.messages)
  if (!responseText) {
    return null
  }

  const jsonPayload = extractJsonObject(responseText)
  if (!jsonPayload) {
    return null
  }

  try {
    return JSON.parse(jsonPayload) as MemoryGraphAgentDraft
  } catch {
    return null
  }
}
