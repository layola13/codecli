import { readFile } from 'fs/promises'
import { getSystemPrompt } from '../constants/prompts.js'
import { getSystemContext, getUserContext } from '../context.js'
import type { ToolUseContext } from '../Tool.js'
import { runForkedAgent } from '../utils/forkedAgent.js'
import { createUserMessage, extractTextContent } from '../utils/messages.js'
import { asSystemPrompt } from '../utils/systemPromptType.js'
import type { DiscoveredBook, DiscoveredSourceFile } from './build.js'
import { toPythonSlug } from './naming.js'
import type {
  NoteAbility,
  NoteBook,
  NoteChapter,
  NoteEvent,
  NoteFaction,
  NoteFormat,
  NotePlace,
  NoteRelation,
  NoteRole,
  NoteSourceKind,
  NoteTimeline,
} from './types.js'

type AgentAnalysisInput = {
  book: DiscoveredBook
  sourceKind: NoteSourceKind
  format: NoteFormat
}

type ChapterAgentDraft = {
  chapter: NoteChapter
  roles: NoteRole[]
  relations: NoteRelation[]
  events: NoteEvent[]
  places: NotePlace[]
  factions: NoteFaction[]
  abilities: NoteAbility[]
  timelines: NoteTimeline[]
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

function sanitizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
}

function sanitizeLineRange(value: string, fallback: string): string {
  return /^L\d+:L\d+$/.test(value) ? value : fallback
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function mergeStringArrays(left: string[], right: string[]): string[] {
  return dedupeStrings([...left, ...right])
}

function fallbackChapterId(sourceFile: string, index: number): string {
  return `chapter_${String(index + 1).padStart(3, '0')}_${toPythonSlug(sourceFile.replace(/\.[^.]+$/u, ''), `chapter_${String(index + 1).padStart(3, '0')}`)}`
}

function fallbackRoleId(index: number): string {
  return `role_${String(index + 1).padStart(3, '0')}`
}

function fallbackRelationId(index: number): string {
  return `relation_${String(index + 1).padStart(3, '0')}`
}

function fallbackEventId(index: number): string {
  return `event_${String(index + 1).padStart(3, '0')}`
}

function fallbackPlaceId(index: number): string {
  return `place_${String(index + 1).padStart(3, '0')}`
}

function fallbackFactionId(index: number): string {
  return `faction_${String(index + 1).padStart(3, '0')}`
}

function fallbackAbilityId(index: number): string {
  return `ability_${String(index + 1).padStart(3, '0')}`
}

function fallbackTimelineId(index: number): string {
  return `timeline_${String(index + 1).padStart(3, '0')}`
}

function sanitizeRoleRef(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function sanitizeChapterRef(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function sanitizeLabel(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function sanitizeNameEn(value: unknown, fallback: string): string {
  return typeof value === 'string' ? toPythonSlug(value, fallback) : fallback
}

function sanitizeNameZh(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function sanitizeSourceFiles(sourceFile: string, value: unknown): string[] {
  return dedupeStrings([sourceFile, ...sanitizeStringArray(value)])
}

function sanitizeRanges(value: unknown): string[] {
  return sanitizeStringArray(value).map(range => sanitizeLineRange(range, 'L1:L1'))
}

function sanitizeTimelineLabel(value: unknown, fallback: string): string {
  return typeof value === 'string' ? toPythonSlug(value, fallback) : fallback
}

function sanitizeChapterDraft(args: {
  value: unknown
  sourceFile: DiscoveredSourceFile
  chapterIndex: number
}): ChapterAgentDraft | null {
  if (!args.value || typeof args.value !== 'object') {
    return null
  }

  const record = args.value as Record<string, unknown>
  const defaultChapterId = fallbackChapterId(
    args.sourceFile.relativePath,
    args.chapterIndex,
  )

  const chapter: NoteChapter = {
    chapterId:
      typeof record.chapterId === 'string'
        ? toPythonSlug(record.chapterId, defaultChapterId)
        : defaultChapterId,
    titleZh:
      typeof record.titleZh === 'string'
        ? record.titleZh
        : args.sourceFile.relativePath.replace(/\.[^.]+$/u, ''),
    titleEn:
      typeof record.titleEn === 'string'
        ? toPythonSlug(record.titleEn, defaultChapterId)
        : defaultChapterId,
    sourceFile: args.sourceFile.relativePath,
    lineRange: sanitizeLineRange(
      typeof record.lineRange === 'string' ? record.lineRange : '',
      'L1:L1',
    ),
    roleRefs: sanitizeStringArray(record.roleRefs),
    eventRefs: sanitizeStringArray(record.eventRefs),
    factionRefs: sanitizeStringArray(record.factionRefs),
    placeRefs: sanitizeStringArray(record.placeRefs),
    tags: sanitizeStringArray(record.tags),
  }

  const roles = Array.isArray(record.roles)
    ? record.roles
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((role, index): NoteRole => ({
          nodeId: sanitizeNameEn(role.nodeId, fallbackRoleId(index)),
          canonicalNameEn: sanitizeNameEn(role.canonicalNameEn, fallbackRoleId(index)),
          canonicalNameZh: sanitizeNameZh(role.canonicalNameZh),
          aliasTokensEn: sanitizeStringArray(role.aliasTokensEn),
          aliasTokensZh: sanitizeStringArray(role.aliasTokensZh),
          sourceFiles: sanitizeSourceFiles(args.sourceFile.relativePath, role.sourceFiles),
          chapterRefs: dedupeStrings([chapter.chapterId, ...sanitizeStringArray(role.chapterRefs)]),
          mentionRanges: sanitizeRanges(role.mentionRanges),
          relationRefs: sanitizeStringArray(role.relationRefs),
          eventRefs: sanitizeStringArray(role.eventRefs),
          abilityRefs: sanitizeStringArray(role.abilityRefs),
          factionRefs: sanitizeStringArray(role.factionRefs),
          placeRefs: sanitizeStringArray(role.placeRefs),
          tags: sanitizeStringArray(role.tags),
        }))
    : []

  const relations = Array.isArray(record.relations)
    ? record.relations
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((relation, index): NoteRelation => ({
          nodeId: sanitizeNameEn(relation.nodeId, fallbackRelationId(index)),
          leftRef: sanitizeRoleRef(relation.leftRef),
          rightRef: sanitizeRoleRef(relation.rightRef),
          leftZh: sanitizeNameZh(relation.leftZh),
          rightZh: sanitizeNameZh(relation.rightZh),
          relationTypes: sanitizeStringArray(relation.relationTypes),
          chapterRefs: dedupeStrings([chapter.chapterId, ...sanitizeStringArray(relation.chapterRefs)]),
          evidenceRanges: sanitizeRanges(relation.evidenceRanges),
          eventRefs: sanitizeStringArray(relation.eventRefs),
          tags: sanitizeStringArray(relation.tags),
        }))
    : []

  const events = Array.isArray(record.events)
    ? record.events
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((event, index): NoteEvent => ({
          nodeId: sanitizeNameEn(event.nodeId, fallbackEventId(index)),
          labelZh: sanitizeLabel(event.labelZh),
          chapterRef: sanitizeChapterRef(event.chapterRef, chapter.chapterId),
          sourceFiles: sanitizeSourceFiles(args.sourceFile.relativePath, event.sourceFiles),
          lineRanges: sanitizeRanges(event.lineRanges),
          participantRefs: sanitizeStringArray(event.participantRefs),
          placeRefs: sanitizeStringArray(event.placeRefs),
          relationRefs: sanitizeStringArray(event.relationRefs),
          precedingEventRefs: sanitizeStringArray(event.precedingEventRefs),
          followingEventRefs: sanitizeStringArray(event.followingEventRefs),
          tags: sanitizeStringArray(event.tags),
        }))
    : []

  const places = Array.isArray(record.places)
    ? record.places
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((place, index): NotePlace => ({
          nodeId: sanitizeNameEn(place.nodeId, fallbackPlaceId(index)),
          canonicalNameEn: sanitizeNameEn(place.canonicalNameEn, fallbackPlaceId(index)),
          canonicalNameZh: sanitizeNameZh(place.canonicalNameZh),
          aliasTokensEn: sanitizeStringArray(place.aliasTokensEn),
          aliasTokensZh: sanitizeStringArray(place.aliasTokensZh),
          sourceFiles: sanitizeSourceFiles(args.sourceFile.relativePath, place.sourceFiles),
          chapterRefs: dedupeStrings([chapter.chapterId, ...sanitizeStringArray(place.chapterRefs)]),
          mentionRanges: sanitizeRanges(place.mentionRanges),
          eventRefs: sanitizeStringArray(place.eventRefs),
          roleRefs: sanitizeStringArray(place.roleRefs),
          factionRefs: sanitizeStringArray(place.factionRefs),
          tags: sanitizeStringArray(place.tags),
        }))
    : []

  const factions = Array.isArray(record.factions)
    ? record.factions
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((faction, index): NoteFaction => ({
          nodeId: sanitizeNameEn(faction.nodeId, fallbackFactionId(index)),
          canonicalNameEn: sanitizeNameEn(faction.canonicalNameEn, fallbackFactionId(index)),
          canonicalNameZh: sanitizeNameZh(faction.canonicalNameZh),
          aliasTokensEn: sanitizeStringArray(faction.aliasTokensEn),
          aliasTokensZh: sanitizeStringArray(faction.aliasTokensZh),
          sourceFiles: sanitizeSourceFiles(args.sourceFile.relativePath, faction.sourceFiles),
          chapterRefs: dedupeStrings([chapter.chapterId, ...sanitizeStringArray(faction.chapterRefs)]),
          mentionRanges: sanitizeRanges(faction.mentionRanges),
          roleRefs: sanitizeStringArray(faction.roleRefs),
          eventRefs: sanitizeStringArray(faction.eventRefs),
          placeRefs: sanitizeStringArray(faction.placeRefs),
          tags: sanitizeStringArray(faction.tags),
        }))
    : []

  const abilities = Array.isArray(record.abilities)
    ? record.abilities
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((ability, index): NoteAbility => ({
          nodeId: sanitizeNameEn(ability.nodeId, fallbackAbilityId(index)),
          canonicalNameEn: sanitizeNameEn(ability.canonicalNameEn, fallbackAbilityId(index)),
          canonicalNameZh: sanitizeNameZh(ability.canonicalNameZh),
          aliasTokensEn: sanitizeStringArray(ability.aliasTokensEn),
          aliasTokensZh: sanitizeStringArray(ability.aliasTokensZh),
          ownerRefs: sanitizeStringArray(ability.ownerRefs),
          sourceFiles: sanitizeSourceFiles(args.sourceFile.relativePath, ability.sourceFiles),
          chapterRefs: dedupeStrings([chapter.chapterId, ...sanitizeStringArray(ability.chapterRefs)]),
          mentionRanges: sanitizeRanges(ability.mentionRanges),
          eventRefs: sanitizeStringArray(ability.eventRefs),
          tags: sanitizeStringArray(ability.tags),
        }))
    : []

  const timelines = Array.isArray(record.timelines)
    ? record.timelines
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((timeline, index): NoteTimeline => ({
          nodeId: sanitizeNameEn(timeline.nodeId, fallbackTimelineId(index)),
          labelEn: sanitizeTimelineLabel(timeline.labelEn, fallbackTimelineId(index)),
          labelZh: sanitizeNameZh(timeline.labelZh),
          eventRefs: sanitizeStringArray(timeline.eventRefs),
          chapterRefs: dedupeStrings([chapter.chapterId, ...sanitizeStringArray(timeline.chapterRefs)]),
          tags: sanitizeStringArray(timeline.tags),
        }))
    : []

  return {
    chapter,
    roles,
    relations,
    events,
    places,
    factions,
    abilities,
    timelines,
  }
}

async function buildShardPrompt(args: {
  book: DiscoveredBook
  sourceFile: DiscoveredSourceFile
  chapterIndex: number
}): Promise<string> {
  const content = await readFile(args.sourceFile.absolutePath, 'utf8')
  const numbered = content
    .split(/\r?\n/)
    .map((line, index) => `L${index + 1}\t${line}`)
    .join('\n')

  return [
    'You are Claude Code\'s internal novel-map analysis agent.',
    '',
    'Analyze exactly one source file and return JSON only.',
    'Do NOT write summaries, markdown, explanations, or quote the novel.',
    'Do NOT copy raw sentences into any field.',
    '',
    'Hard requirements:',
    '- Use English identifiers for chapterId/nodeId/canonicalNameEn.',
    '- Chinese is allowed only in *_Zh fields.',
    '- All evidence must use line ranges like L1:L3.',
    '- Prefer empty arrays over invented facts.',
    '- Keep labels map-like and short.',
    '',
    'Return exactly one object with this shape:',
    '{',
    '  "chapterId": "english_id",',
    '  "titleZh": "中文章节标签",',
    '  "titleEn": "english_title",',
    '  "lineRange": "L1:L10",',
    '  "roleRefs": ["role_id"],',
    '  "eventRefs": ["event_id"],',
    '  "factionRefs": [],',
    '  "placeRefs": [],',
    '  "tags": ["tag"],',
    '  "roles": [',
    '    {',
    '      "nodeId": "role_id",',
    '      "canonicalNameEn": "english_name",',
    '      "canonicalNameZh": "中文名",',
    '      "aliasTokensEn": [],',
    '      "aliasTokensZh": [],',
    '      "sourceFiles": ["relative/path.txt"],',
    '      "chapterRefs": ["chapter_id"],',
    '      "mentionRanges": ["L1:L3"],',
    '      "relationRefs": ["relation_id"],',
    '      "eventRefs": ["event_id"],',
    '      "abilityRefs": [],',
    '      "factionRefs": [],',
    '      "placeRefs": [],',
    '      "tags": ["tag"]',
    '    }',
    '  ],',
    '  "relations": [',
    '    {',
    '      "nodeId": "relation_id",',
    '      "leftRef": "role_id",',
    '      "rightRef": "role_id|faction_id|place_id",',
    '      "leftZh": "中文名",',
    '      "rightZh": "中文名",',
    '      "relationTypes": ["ally|enemy|family|mentor|leader|member"],',
    '      "chapterRefs": ["chapter_id"],',
    '      "evidenceRanges": ["L1:L3"],',
    '      "eventRefs": ["event_id"],',
    '      "tags": ["tag"]',
    '    }',
    '  ],',
    '  "events": [',
    '    {',
    '      "nodeId": "event_id",',
    '      "labelZh": "中文事件短标签",',
    '      "chapterRef": "chapter_id",',
    '      "sourceFiles": ["relative/path.txt"],',
    '      "lineRanges": ["L1:L10"],',
    '      "participantRefs": ["role_id"],',
    '      "placeRefs": [],',
    '      "relationRefs": ["relation_id"],',
    '      "precedingEventRefs": [],',
    '      "followingEventRefs": [],',
    '      "tags": ["tag"]',
    '    }',
    '  ],',
    '  "places": [',
    '    {',
    '      "nodeId": "place_id",',
    '      "canonicalNameEn": "place_name",',
    '      "canonicalNameZh": "中文地点名",',
    '      "aliasTokensEn": [],',
    '      "aliasTokensZh": [],',
    '      "sourceFiles": ["relative/path.txt"],',
    '      "chapterRefs": ["chapter_id"],',
    '      "mentionRanges": ["L1:L3"],',
    '      "eventRefs": ["event_id"],',
    '      "roleRefs": ["role_id"],',
    '      "factionRefs": ["faction_id"],',
    '      "tags": ["tag"]',
    '    }',
    '  ],',
    '  "factions": [',
    '    {',
    '      "nodeId": "faction_id",',
    '      "canonicalNameEn": "faction_name",',
    '      "canonicalNameZh": "中文势力名",',
    '      "aliasTokensEn": [],',
    '      "aliasTokensZh": [],',
    '      "sourceFiles": ["relative/path.txt"],',
    '      "chapterRefs": ["chapter_id"],',
    '      "mentionRanges": ["L1:L3"],',
    '      "roleRefs": ["role_id"],',
    '      "eventRefs": ["event_id"],',
    '      "placeRefs": ["place_id"],',
    '      "tags": ["tag"]',
    '    }',
    '  ],',
    '  "abilities": [',
    '    {',
    '      "nodeId": "ability_id",',
    '      "canonicalNameEn": "ability_name",',
    '      "canonicalNameZh": "中文特长名",',
    '      "aliasTokensEn": [],',
    '      "aliasTokensZh": [],',
    '      "ownerRefs": ["role_id"],',
    '      "sourceFiles": ["relative/path.txt"],',
    '      "chapterRefs": ["chapter_id"],',
    '      "mentionRanges": ["L1:L3"],',
    '      "eventRefs": ["event_id"],',
    '      "tags": ["tag"]',
    '    }',
    '  ],',
    '  "timelines": [',
    '    {',
    '      "nodeId": "timeline_id",',
    '      "labelEn": "timeline_label",',
    '      "labelZh": "中文时间线标签",',
    '      "eventRefs": ["event_id"],',
    '      "chapterRefs": ["chapter_id"],',
    '      "tags": ["tag"]',
    '    }',
    '  ]',
    '}',
    '',
    'Book metadata:',
    JSON.stringify(
      {
        bookId: args.book.bookId,
        bookNameZh: args.book.bookNameZh,
        bookNameEn: args.book.bookNameEn,
        sourceFile: args.sourceFile.relativePath,
        chapterIndex: args.chapterIndex + 1,
      },
      null,
      2,
    ),
    '',
    `FILE: ${args.sourceFile.relativePath}`,
    numbered,
  ].join('\n')
}

async function runShardAgent(args: {
  context: ToolUseContext
  prompt: string
}): Promise<unknown | null> {
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
    promptMessages: [createUserMessage({ content: args.prompt })],
    cacheSafeParams: {
      systemPrompt: asSystemPrompt(rawSystemPrompt),
      userContext,
      systemContext,
      toolUseContext: args.context,
      forkContextMessages: [],
    },
    canUseTool: async () => ({
      behavior: 'deny' as const,
      message: 'Note analysis must not use tools',
      decisionReason: {
        type: 'other' as const,
        reason: 'note_analysis',
      },
    }),
    querySource: 'note_analysis' as never,
    forkLabel: 'note_analysis',
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
    return JSON.parse(jsonPayload) as unknown
  } catch {
    return null
  }
}

function mergeRoles(roles: NoteRole[]): NoteRole[] {
  const merged = new Map<string, NoteRole>()

  for (const role of roles) {
    const existing = merged.get(role.nodeId)
    if (!existing) {
      merged.set(role.nodeId, { ...role })
      continue
    }

    merged.set(role.nodeId, {
      ...existing,
      canonicalNameEn: existing.canonicalNameEn || role.canonicalNameEn,
      canonicalNameZh: existing.canonicalNameZh || role.canonicalNameZh,
      aliasTokensEn: mergeStringArrays(existing.aliasTokensEn, role.aliasTokensEn),
      aliasTokensZh: mergeStringArrays(existing.aliasTokensZh, role.aliasTokensZh),
      sourceFiles: mergeStringArrays(existing.sourceFiles, role.sourceFiles),
      chapterRefs: mergeStringArrays(existing.chapterRefs, role.chapterRefs),
      mentionRanges: mergeStringArrays(existing.mentionRanges, role.mentionRanges),
      relationRefs: mergeStringArrays(existing.relationRefs, role.relationRefs),
      eventRefs: mergeStringArrays(existing.eventRefs, role.eventRefs),
      abilityRefs: mergeStringArrays(existing.abilityRefs, role.abilityRefs),
      factionRefs: mergeStringArrays(existing.factionRefs, role.factionRefs),
      placeRefs: mergeStringArrays(existing.placeRefs, role.placeRefs),
      tags: mergeStringArrays(existing.tags, role.tags),
    })
  }

  return [...merged.values()]
}

function mergeRelations(relations: NoteRelation[]): NoteRelation[] {
  const merged = new Map<string, NoteRelation>()

  for (const relation of relations) {
    const existing = merged.get(relation.nodeId)
    if (!existing) {
      merged.set(relation.nodeId, { ...relation })
      continue
    }

    merged.set(relation.nodeId, {
      ...existing,
      leftRef: existing.leftRef || relation.leftRef,
      rightRef: existing.rightRef || relation.rightRef,
      leftZh: existing.leftZh || relation.leftZh,
      rightZh: existing.rightZh || relation.rightZh,
      relationTypes: mergeStringArrays(existing.relationTypes, relation.relationTypes),
      chapterRefs: mergeStringArrays(existing.chapterRefs, relation.chapterRefs),
      evidenceRanges: mergeStringArrays(existing.evidenceRanges, relation.evidenceRanges),
      eventRefs: mergeStringArrays(existing.eventRefs, relation.eventRefs),
      tags: mergeStringArrays(existing.tags, relation.tags),
    })
  }

  return [...merged.values()]
}

function mergeEvents(events: NoteEvent[]): NoteEvent[] {
  const merged = new Map<string, NoteEvent>()

  for (const event of events) {
    const existing = merged.get(event.nodeId)
    if (!existing) {
      merged.set(event.nodeId, { ...event })
      continue
    }

    merged.set(event.nodeId, {
      ...existing,
      labelZh: existing.labelZh || event.labelZh,
      chapterRef: existing.chapterRef || event.chapterRef,
      sourceFiles: mergeStringArrays(existing.sourceFiles, event.sourceFiles),
      lineRanges: mergeStringArrays(existing.lineRanges, event.lineRanges),
      participantRefs: mergeStringArrays(existing.participantRefs, event.participantRefs),
      placeRefs: mergeStringArrays(existing.placeRefs, event.placeRefs),
      relationRefs: mergeStringArrays(existing.relationRefs, event.relationRefs),
      precedingEventRefs: mergeStringArrays(
        existing.precedingEventRefs,
        event.precedingEventRefs,
      ),
      followingEventRefs: mergeStringArrays(
        existing.followingEventRefs,
        event.followingEventRefs,
      ),
      tags: mergeStringArrays(existing.tags, event.tags),
    })
  }

  return [...merged.values()]
}

function mergePlaces(places: NotePlace[]): NotePlace[] {
  const merged = new Map<string, NotePlace>()

  for (const place of places) {
    const existing = merged.get(place.nodeId)
    if (!existing) {
      merged.set(place.nodeId, { ...place })
      continue
    }

    merged.set(place.nodeId, {
      ...existing,
      canonicalNameEn: existing.canonicalNameEn || place.canonicalNameEn,
      canonicalNameZh: existing.canonicalNameZh || place.canonicalNameZh,
      aliasTokensEn: mergeStringArrays(existing.aliasTokensEn, place.aliasTokensEn),
      aliasTokensZh: mergeStringArrays(existing.aliasTokensZh, place.aliasTokensZh),
      sourceFiles: mergeStringArrays(existing.sourceFiles, place.sourceFiles),
      chapterRefs: mergeStringArrays(existing.chapterRefs, place.chapterRefs),
      mentionRanges: mergeStringArrays(existing.mentionRanges, place.mentionRanges),
      eventRefs: mergeStringArrays(existing.eventRefs, place.eventRefs),
      roleRefs: mergeStringArrays(existing.roleRefs, place.roleRefs),
      factionRefs: mergeStringArrays(existing.factionRefs, place.factionRefs),
      tags: mergeStringArrays(existing.tags, place.tags),
    })
  }

  return [...merged.values()]
}

function mergeFactions(factions: NoteFaction[]): NoteFaction[] {
  const merged = new Map<string, NoteFaction>()

  for (const faction of factions) {
    const existing = merged.get(faction.nodeId)
    if (!existing) {
      merged.set(faction.nodeId, { ...faction })
      continue
    }

    merged.set(faction.nodeId, {
      ...existing,
      canonicalNameEn: existing.canonicalNameEn || faction.canonicalNameEn,
      canonicalNameZh: existing.canonicalNameZh || faction.canonicalNameZh,
      aliasTokensEn: mergeStringArrays(existing.aliasTokensEn, faction.aliasTokensEn),
      aliasTokensZh: mergeStringArrays(existing.aliasTokensZh, faction.aliasTokensZh),
      sourceFiles: mergeStringArrays(existing.sourceFiles, faction.sourceFiles),
      chapterRefs: mergeStringArrays(existing.chapterRefs, faction.chapterRefs),
      mentionRanges: mergeStringArrays(existing.mentionRanges, faction.mentionRanges),
      roleRefs: mergeStringArrays(existing.roleRefs, faction.roleRefs),
      eventRefs: mergeStringArrays(existing.eventRefs, faction.eventRefs),
      placeRefs: mergeStringArrays(existing.placeRefs, faction.placeRefs),
      tags: mergeStringArrays(existing.tags, faction.tags),
    })
  }

  return [...merged.values()]
}

function mergeAbilities(abilities: NoteAbility[]): NoteAbility[] {
  const merged = new Map<string, NoteAbility>()

  for (const ability of abilities) {
    const existing = merged.get(ability.nodeId)
    if (!existing) {
      merged.set(ability.nodeId, { ...ability })
      continue
    }

    merged.set(ability.nodeId, {
      ...existing,
      canonicalNameEn: existing.canonicalNameEn || ability.canonicalNameEn,
      canonicalNameZh: existing.canonicalNameZh || ability.canonicalNameZh,
      aliasTokensEn: mergeStringArrays(existing.aliasTokensEn, ability.aliasTokensEn),
      aliasTokensZh: mergeStringArrays(existing.aliasTokensZh, ability.aliasTokensZh),
      ownerRefs: mergeStringArrays(existing.ownerRefs, ability.ownerRefs),
      sourceFiles: mergeStringArrays(existing.sourceFiles, ability.sourceFiles),
      chapterRefs: mergeStringArrays(existing.chapterRefs, ability.chapterRefs),
      mentionRanges: mergeStringArrays(existing.mentionRanges, ability.mentionRanges),
      eventRefs: mergeStringArrays(existing.eventRefs, ability.eventRefs),
      tags: mergeStringArrays(existing.tags, ability.tags),
    })
  }

  return [...merged.values()]
}

function mergeTimelines(timelines: NoteTimeline[]): NoteTimeline[] {
  const merged = new Map<string, NoteTimeline>()

  for (const timeline of timelines) {
    const existing = merged.get(timeline.nodeId)
    if (!existing) {
      merged.set(timeline.nodeId, { ...timeline })
      continue
    }

    merged.set(timeline.nodeId, {
      ...existing,
      labelEn: existing.labelEn || timeline.labelEn,
      labelZh: existing.labelZh || timeline.labelZh,
      eventRefs: mergeStringArrays(existing.eventRefs, timeline.eventRefs),
      chapterRefs: mergeStringArrays(existing.chapterRefs, timeline.chapterRefs),
      tags: mergeStringArrays(existing.tags, timeline.tags),
    })
  }

  return [...merged.values()]
}

function mergeChapterDrafts(args: {
  book: DiscoveredBook
  sourceKind: NoteSourceKind
  format: NoteFormat
  drafts: ChapterAgentDraft[]
}): NoteBook | null {
  if (args.drafts.length === 0) {
    return null
  }

  return {
    bookId: args.book.bookId,
    bookNameZh: args.book.bookNameZh,
    bookNameEn: args.book.bookNameEn,
    format: args.format,
    sourceKind: args.sourceKind,
    sourceRoot: args.book.sourceRoot,
    sourceFiles: args.book.sourceFiles.map(file => file.relativePath),
    chapters: args.drafts.map(draft => draft.chapter),
    roles: mergeRoles(args.drafts.flatMap(draft => draft.roles)),
    relations: mergeRelations(args.drafts.flatMap(draft => draft.relations)),
    events: mergeEvents(args.drafts.flatMap(draft => draft.events)),
    places: mergePlaces(args.drafts.flatMap(draft => draft.places)),
    factions: mergeFactions(args.drafts.flatMap(draft => draft.factions)),
    abilities: mergeAbilities(args.drafts.flatMap(draft => draft.abilities)),
    timelines: mergeTimelines(args.drafts.flatMap(draft => draft.timelines)),
  }
}

export async function analyzeNoteBookWithAgent(args: {
  context: ToolUseContext
  input: AgentAnalysisInput
}): Promise<NoteBook | null> {
  const drafts: ChapterAgentDraft[] = []

  for (const [chapterIndex, sourceFile] of args.input.book.sourceFiles.entries()) {
    const prompt = await buildShardPrompt({
      book: args.input.book,
      sourceFile,
      chapterIndex,
    })
    const parsed = await runShardAgent({
      context: args.context,
      prompt,
    })
    const draft = sanitizeChapterDraft({
      value: parsed,
      sourceFile,
      chapterIndex,
    })
    if (draft) {
      drafts.push(draft)
    }
  }

  return mergeChapterDrafts({
    book: args.input.book,
    sourceKind: args.input.sourceKind,
    format: args.input.format,
    drafts,
  })
}
