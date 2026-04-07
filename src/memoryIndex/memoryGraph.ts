import { createHash } from 'crypto'

export type MemoryGraphMemoryKind =
  | 'user_preference'
  | 'stable_constraint'
  | 'decision_rationale'
  | 'superseded_decision'

export type MemoryGraphMemoryFact = {
  objectId: string
  kind: MemoryGraphMemoryKind
  status: 'active' | 'superseded'
  lastSeenAt: string
  statement: string
  sessionIds: string[]
}

export type MemoryGraphPlanFact = {
  eventId: string
  sessionId: string
  timestamp: string
  source: string
  preview: string
  transcriptRelativePath: string
  planFilePath?: string
}

export type MemoryGraphSessionFact = {
  sessionId: string
  firstTimestamp?: string
  lastTimestamp?: string
  promptCount: number
  planCount: number
  codeEditCount: number
  latestPromptPreview?: string
  latestPlanPreview?: string
  focusPrompt?: string
  topFiles: Array<{
    path: string
    touches: number
  }>
  agentIds: string[]
  promptPreviews: string[]
  planIds: string[]
  memoryObjectIds: string[]
  recentEdits: Array<{
    path: string
    status: string
    lineRanges: string
    timestamp: string
  }>
  previousSessionId?: string | null
  nextSessionId?: string | null
}

export type MemoryGraphFileFact = {
  path: string
  touchCount: number
  lastEditedAt: string
  lastEditEventId: string
  sessionIds: string[]
  planIds: string[]
  memoryObjectIds: string[]
  recentRanges: Array<{
    sessionId: string
    status: string
    lineRanges: string
  }>
}

export type MemoryGraphSegmentKind =
  | 'prompt'
  | 'plan'
  | 'code_edit'
  | 'non_code_text_edit'

export type MemoryGraphSegmentFact = {
  segmentId: string
  kind: MemoryGraphSegmentKind
  sessionId: string
  timestamp: string
  title: string
  summary: string
  sourceEventIds: string[]
  filePaths: string[]
  planIds: string[]
  memoryObjectIds: string[]
  recentRanges: Array<{
    path: string
    status: string
    lineRanges: string
  }>
}

export type MemoryGraphAnalysisInput = {
  rootDir: string
  generatedAt: string
  sessions: MemoryGraphSessionFact[]
  files: MemoryGraphFileFact[]
  plans: MemoryGraphPlanFact[]
  memoryObjects: MemoryGraphMemoryFact[]
  segments: MemoryGraphSegmentFact[]
}

export type MemoryGraphTopic = {
  topicId: string
  title: string
  summary: string
  status: 'active' | 'superseded'
  sessionIds: string[]
  filePaths: string[]
  planIds: string[]
  memoryObjectIds: string[]
  relatedTopics: Array<{
    topicId: string
    reason: string
  }>
}

export type MemoryGraphSessionNode = {
  sessionId: string
  title: string
  summary: string
  topicIds: string[]
  filePaths: string[]
  planIds: string[]
  memoryObjectIds: string[]
  relatedSessions: Array<{
    sessionId: string
    reason: string
  }>
}

export type MemoryGraphFileNode = {
  path: string
  role: string
  topicIds: string[]
  sessionIds: string[]
  planIds: string[]
  memoryObjectIds: string[]
  recentRanges: Array<{
    sessionId: string
    status: string
    lineRanges: string
  }>
}

export type MemoryGraphSegmentNode = {
  segmentId: string
  kind: MemoryGraphSegmentKind
  sessionId: string
  title: string
  summary: string
  topicIds: string[]
  filePaths: string[]
  planIds: string[]
  memoryObjectIds: string[]
  sourceEventIds: string[]
  recentRanges: Array<{
    path: string
    status: string
    lineRanges: string
  }>
  relatedSegments: Array<{
    segmentId: string
    reason: string
  }>
}

export type MemoryGraphEdge = {
  source: string
  target: string
  kind: string
  reason: string
}

export type MemoryGraphAnalysis = {
  source: 'agent' | 'heuristic'
  generatedAt: string
  model?: string
  topics: MemoryGraphTopic[]
  sessions: MemoryGraphSessionNode[]
  files: MemoryGraphFileNode[]
  segments: MemoryGraphSegmentNode[]
  edges: MemoryGraphEdge[]
}

export type MemoryGraphAgentDraft = {
  topics?: Array<{
    title?: string
    summary?: string
    status?: 'active' | 'superseded'
    session_ids?: string[]
    file_paths?: string[]
    plan_ids?: string[]
    memory_object_ids?: string[]
    related_topics?: Array<{
      title?: string
      reason?: string
    }>
  }>
  sessions?: Array<{
    session_id?: string
    title?: string
    summary?: string
    topic_titles?: string[]
    file_paths?: string[]
    plan_ids?: string[]
    memory_object_ids?: string[]
    related_sessions?: Array<{
      session_id?: string
      reason?: string
    }>
  }>
  files?: Array<{
    path?: string
    role?: string
    topic_titles?: string[]
    session_ids?: string[]
    plan_ids?: string[]
    memory_object_ids?: string[]
  }>
  segments?: Array<{
    segment_id?: string
    kind?: MemoryGraphSegmentKind
    session_id?: string
    title?: string
    summary?: string
    topic_titles?: string[]
    file_paths?: string[]
    plan_ids?: string[]
    memory_object_ids?: string[]
    source_event_ids?: string[]
    related_segments?: Array<{
      segment_id?: string
      reason?: string
    }>
  }>
  edges?: Array<{
    source?: string
    target?: string
    kind?: string
    reason?: string
  }>
}

function hashContent(value: string): string {
  return createHash('sha1').update(value).digest('hex')
}

function truncatePreview(value: string, maxChars: number = 160): string {
  const flattened = value.replace(/\s+/g, ' ').trim()
  if (flattened.length <= maxChars) {
    return flattened
  }
  return `${flattened.slice(0, maxChars - 1)}…`
}

function stripMarkdownNoise(value: string): string {
  return value
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`/g, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeLabel(value: string, fallback: string): string {
  const cleaned = stripMarkdownNoise(value)
    .replace(/^[^\p{L}\p{N}]+/gu, '')
    .replace(/[，。！？!?,;；:：]+$/gu, '')
    .trim()
  return truncatePreview(cleaned || fallback, 96)
}

function isLowSignalPrompt(value: string | undefined): boolean {
  if (!value) {
    return true
  }
  return (
    value.length < 4 ||
    /^\[(request interrupted|interrupted)/iu.test(value) ||
    /task-notification>|<task-notification>|<tool-use-id>|<output-file>/iu.test(
      value,
    ) ||
    /^(是|对|好|继续|hello)[，。!！?？\s]*$/u.test(value)
  )
}

function topicIdFromTitle(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (slug.length >= 4) {
    return `topic:${slug.slice(0, 48)}`
  }
  return `topic:${hashContent(title).slice(0, 12)}`
}

function chooseSessionFocus(session: MemoryGraphSessionFact): string {
  const candidatePrompts = [
    session.focusPrompt,
    session.latestPromptPreview,
    ...session.promptPreviews,
  ].filter((value): value is string => Boolean(value))
  const meaningfulPrompt = candidatePrompts.find(
    value => !isLowSignalPrompt(value),
  )
  return (
    meaningfulPrompt ??
    session.latestPlanPreview ??
    session.topFiles[0]?.path ??
    session.sessionId
  )
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function dedupeByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const item of items) {
    const key = getKey(item)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(item)
  }
  return result
}

function buildTopicSummary(session: MemoryGraphSessionFact): string {
  return truncatePreview(
    session.latestPlanPreview ??
      chooseSessionFocus(session) ??
      session.recentEdits[0]?.path ??
      session.sessionId,
    180,
  )
}

function buildFileRole(args: {
  file: MemoryGraphFileFact
  topicTitle: string | undefined
}): string {
  if (args.topicTitle) {
    return `Implements or supports ${args.topicTitle}`
  }
  return `Touched in ${args.file.sessionIds.length} memory sessions`
}

function makeEdge(
  source: string,
  target: string,
  kind: string,
  reason: string,
): MemoryGraphEdge {
  return {
    source,
    target,
    kind,
    reason: truncatePreview(reason || kind, 140),
  }
}

export function buildHeuristicMemoryGraphAnalysis(
  input: MemoryGraphAnalysisInput,
): MemoryGraphAnalysis {
  const selectedSessions = input.sessions
    .filter(
      session =>
        session.planCount > 0 ||
        session.codeEditCount > 0 ||
        session.memoryObjectIds.length > 0 ||
        session.promptCount > 2,
    )
    .slice(0, 18)

  const topicAcc = new Map<
    string,
    Omit<MemoryGraphTopic, 'relatedTopics'> & {
      relatedTopicIds: Set<string>
    }
  >()

  for (const session of selectedSessions) {
    const title = normalizeLabel(
      session.latestPlanPreview ?? chooseSessionFocus(session),
      session.sessionId,
    )
    const topicId = topicIdFromTitle(title)
    const existing = topicAcc.get(topicId)
    if (existing) {
      existing.sessionIds = dedupeStrings([...existing.sessionIds, session.sessionId])
      existing.filePaths = dedupeStrings([
        ...existing.filePaths,
        ...session.topFiles.map(file => file.path),
        ...session.recentEdits.map(edit => edit.path),
      ]).slice(0, 12)
      existing.planIds = dedupeStrings([
        ...existing.planIds,
        ...session.planIds,
      ]).slice(0, 8)
      existing.memoryObjectIds = dedupeStrings([
        ...existing.memoryObjectIds,
        ...session.memoryObjectIds,
      ]).slice(0, 8)
      if (existing.summary.length < session.latestPlanPreview?.length ?? 0) {
        existing.summary = buildTopicSummary(session)
      }
      continue
    }

    topicAcc.set(topicId, {
      topicId,
      title,
      summary: buildTopicSummary(session),
      status: 'active',
      sessionIds: [session.sessionId],
      filePaths: dedupeStrings([
        ...session.topFiles.map(file => file.path),
        ...session.recentEdits.map(edit => edit.path),
      ]).slice(0, 12),
      planIds: session.planIds.slice(0, 8),
      memoryObjectIds: session.memoryObjectIds.slice(0, 8),
      relatedTopicIds: new Set<string>(),
    })
  }

  if (topicAcc.size === 0) {
    const fallbackFile = input.files[0]
    if (fallbackFile) {
      const title = normalizeLabel(fallbackFile.path, 'Project memory')
      topicAcc.set(topicIdFromTitle(title), {
        topicId: topicIdFromTitle(title),
        title,
        summary: `Tracks edits around ${fallbackFile.path}`,
        status: 'active',
        sessionIds: fallbackFile.sessionIds.slice(0, 6),
        filePaths: [fallbackFile.path],
        planIds: fallbackFile.planIds.slice(0, 4),
        memoryObjectIds: fallbackFile.memoryObjectIds.slice(0, 4),
        relatedTopicIds: new Set<string>(),
      })
    }
  }

  const topics = [...topicAcc.values()]
  for (let index = 0; index < topics.length; index++) {
    const topic = topics[index]!
    for (let candidateIndex = index + 1; candidateIndex < topics.length; candidateIndex++) {
      const candidate = topics[candidateIndex]!
      const sharedFiles = topic.filePaths.filter(path =>
        candidate.filePaths.includes(path),
      )
      const sharedMemory = topic.memoryObjectIds.filter(id =>
        candidate.memoryObjectIds.includes(id),
      )
      if (sharedFiles.length === 0 && sharedMemory.length === 0) {
        continue
      }
      topic.relatedTopicIds.add(candidate.topicId)
      candidate.relatedTopicIds.add(topic.topicId)
    }
  }

  const normalizedTopics: MemoryGraphTopic[] = topics.map(topic => ({
    topicId: topic.topicId,
    title: topic.title,
    summary: topic.summary,
    status: topic.status,
    sessionIds: topic.sessionIds,
    filePaths: topic.filePaths,
    planIds: topic.planIds,
    memoryObjectIds: topic.memoryObjectIds,
    relatedTopics: [...topic.relatedTopicIds]
      .sort((left, right) => left.localeCompare(right))
      .map(topicId => ({
        topicId,
        reason: 'shared files or durable memory',
      })),
  }))

  const topicIdsBySession = new Map<string, string[]>()
  for (const topic of normalizedTopics) {
    for (const sessionId of topic.sessionIds) {
      const existing = topicIdsBySession.get(sessionId) ?? []
      topicIdsBySession.set(sessionId, dedupeStrings([...existing, topic.topicId]))
    }
  }

  const topicIdsByFile = new Map<string, string[]>()
  for (const topic of normalizedTopics) {
    for (const path of topic.filePaths) {
      const existing = topicIdsByFile.get(path) ?? []
      topicIdsByFile.set(path, dedupeStrings([...existing, topic.topicId]))
    }
  }

  const sessions: MemoryGraphSessionNode[] = selectedSessions.map(session => ({
    sessionId: session.sessionId,
    title: normalizeLabel(chooseSessionFocus(session), session.sessionId),
    summary: buildTopicSummary(session),
    topicIds: topicIdsBySession.get(session.sessionId) ?? [],
    filePaths: dedupeStrings([
      ...session.topFiles.map(file => file.path),
      ...session.recentEdits.map(edit => edit.path),
    ]).slice(0, 8),
    planIds: session.planIds.slice(0, 6),
    memoryObjectIds: session.memoryObjectIds.slice(0, 6),
    relatedSessions: dedupeByKey(
      [
        session.previousSessionId
          ? {
              sessionId: session.previousSessionId,
              reason: 'previous session',
            }
          : null,
        session.nextSessionId
          ? {
              sessionId: session.nextSessionId,
              reason: 'next session',
            }
          : null,
      ].filter((value): value is { sessionId: string; reason: string } => value !== null),
      value => value.sessionId,
    ),
  }))

  const selectedFilePaths = dedupeStrings(
    normalizedTopics.flatMap(topic => topic.filePaths),
  )
  const files: MemoryGraphFileNode[] = input.files
    .filter(file => selectedFilePaths.includes(file.path))
    .slice(0, 24)
    .map(file => ({
      path: file.path,
      role: buildFileRole({
        file,
        topicTitle: normalizedTopics.find(topic => topic.filePaths.includes(file.path))
          ?.title,
      }),
      topicIds: topicIdsByFile.get(file.path) ?? [],
      sessionIds: file.sessionIds.slice(0, 8),
      planIds: file.planIds.slice(0, 6),
      memoryObjectIds: file.memoryObjectIds.slice(0, 6),
      recentRanges: file.recentRanges.slice(0, 5),
    }))

  const selectedSegments = input.segments
    .filter(segment =>
      selectedSessions.some(session => session.sessionId === segment.sessionId),
    )
    .slice(0, 48)
  const orderedSegments = [...selectedSegments].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp),
  )
  const segments: MemoryGraphSegmentNode[] = orderedSegments.map(
    (segment, index): MemoryGraphSegmentNode => {
      const topicIds = dedupeStrings(
        normalizedTopics
          .filter(
            topic =>
              topic.sessionIds.includes(segment.sessionId) ||
              segment.filePaths.some(path => topic.filePaths.includes(path)) ||
              segment.planIds.some(planId => topic.planIds.includes(planId)) ||
              segment.memoryObjectIds.some(memoryId =>
                topic.memoryObjectIds.includes(memoryId),
              ),
          )
          .map(topic => topic.topicId),
      ).slice(0, 6)

      const adjacentSegments = [
        orderedSegments[index - 1],
        orderedSegments[index + 1],
      ].filter(
        (value): value is MemoryGraphSegmentFact =>
          Boolean(value) && value.sessionId === segment.sessionId,
      )
      const sharedContextSegments = orderedSegments.filter(candidate => {
        if (candidate.segmentId === segment.segmentId) {
          return false
        }
        return (
          candidate.sessionId === segment.sessionId ||
          candidate.filePaths.some(path => segment.filePaths.includes(path)) ||
          candidate.planIds.some(planId => segment.planIds.includes(planId)) ||
          candidate.memoryObjectIds.some(memoryId =>
            segment.memoryObjectIds.includes(memoryId),
          )
        )
      })

      const relatedSegments = dedupeByKey(
        [
          ...adjacentSegments.map(candidate => ({
            segmentId: candidate.segmentId,
            reason: 'adjacent session context',
          })),
          ...sharedContextSegments.map(candidate => ({
            segmentId: candidate.segmentId,
            reason: candidate.filePaths.some(path =>
              segment.filePaths.includes(path),
            )
              ? 'shared file'
              : candidate.planIds.some(planId => segment.planIds.includes(planId))
                ? 'shared plan'
                : candidate.memoryObjectIds.some(memoryId =>
                    segment.memoryObjectIds.includes(memoryId),
                  )
                  ? 'shared durable memory'
                  : 'shared session context',
          })),
        ],
        value => value.segmentId,
      ).slice(0, 6)

      return {
        segmentId: segment.segmentId,
        kind: segment.kind,
        sessionId: segment.sessionId,
        title: normalizeLabel(segment.title, segment.segmentId),
        summary: truncatePreview(segment.summary || segment.title, 180),
        topicIds,
        filePaths: segment.filePaths.slice(0, 8),
        planIds: segment.planIds.slice(0, 6),
        memoryObjectIds: segment.memoryObjectIds.slice(0, 6),
        sourceEventIds: segment.sourceEventIds.slice(0, 8),
        recentRanges: segment.recentRanges.slice(0, 6),
        relatedSegments,
      }
    },
  )

  const edges: MemoryGraphEdge[] = []
  for (const topic of normalizedTopics) {
    for (const sessionId of topic.sessionIds) {
      edges.push(
        makeEdge(
          `session:${sessionId}`,
          `topic:${topic.topicId}`,
          'drives',
          `${sessionId} drives ${topic.title}`,
        ),
      )
    }
    for (const path of topic.filePaths) {
      edges.push(
        makeEdge(
          `topic:${topic.topicId}`,
          `file:${path}`,
          'implemented_by',
          `${path} implements ${topic.title}`,
        ),
      )
    }
    for (const memoryObjectId of topic.memoryObjectIds) {
      edges.push(
        makeEdge(
          `topic:${topic.topicId}`,
          `memory:${memoryObjectId}`,
          'constrained_by',
          memoryObjectId,
        ),
      )
    }
    for (const planId of topic.planIds) {
      edges.push(
        makeEdge(
          `plan:${planId}`,
          `topic:${topic.topicId}`,
          'shapes',
          planId,
        ),
      )
    }
    for (const relatedTopic of topic.relatedTopics) {
      edges.push(
        makeEdge(
          `topic:${topic.topicId}`,
          `topic:${relatedTopic.topicId}`,
          'related_to',
          relatedTopic.reason,
        ),
      )
    }
  }
  for (const session of sessions) {
    for (const relatedSession of session.relatedSessions) {
      edges.push(
        makeEdge(
          `session:${session.sessionId}`,
          `session:${relatedSession.sessionId}`,
          'follows',
          relatedSession.reason,
        ),
      )
    }
  }
  for (const segment of segments) {
    edges.push(
      makeEdge(
        `session:${segment.sessionId}`,
        `segment:${segment.segmentId}`,
        'contains',
        `${segment.sessionId} contains ${segment.title}`,
      ),
    )
    for (const topicId of segment.topicIds) {
      edges.push(
        makeEdge(
          `segment:${segment.segmentId}`,
          `topic:${topicId}`,
          'supports',
          `${segment.title} supports ${topicId}`,
        ),
      )
    }
    for (const filePath of segment.filePaths) {
      edges.push(
        makeEdge(
          `segment:${segment.segmentId}`,
          `file:${filePath}`,
          'touches',
          `${segment.title} touches ${filePath}`,
        ),
      )
    }
    for (const planId of segment.planIds) {
      edges.push(
        makeEdge(
          `segment:${segment.segmentId}`,
          `plan:${planId}`,
          'references',
          `${segment.title} references ${planId}`,
        ),
      )
    }
    for (const memoryObjectId of segment.memoryObjectIds) {
      edges.push(
        makeEdge(
          `segment:${segment.segmentId}`,
          `memory:${memoryObjectId}`,
          'recalls',
          `${segment.title} recalls ${memoryObjectId}`,
        ),
      )
    }
    for (const relatedSegment of segment.relatedSegments) {
      edges.push(
        makeEdge(
          `segment:${segment.segmentId}`,
          `segment:${relatedSegment.segmentId}`,
          'related_to',
          relatedSegment.reason,
        ),
      )
    }
  }

  return {
    source: 'heuristic',
    generatedAt: input.generatedAt,
    topics: normalizedTopics,
    sessions,
    files,
    segments,
    edges: dedupeByKey(edges, edge =>
      `${edge.source}|${edge.target}|${edge.kind}|${edge.reason}`,
    ),
  }
}

function parseEdgeRef(
  value: string | undefined,
): { kind: string; id: string } | null {
  if (!value) {
    return null
  }
  const separator = value.indexOf(':')
  if (separator <= 0 || separator === value.length - 1) {
    return null
  }
  return {
    kind: value.slice(0, separator),
    id: value.slice(separator + 1),
  }
}

export function normalizeMemoryGraphAnalysis(args: {
  input: MemoryGraphAnalysisInput
  draft: MemoryGraphAgentDraft | null | undefined
  model?: string
}): MemoryGraphAnalysis {
  const fallback = buildHeuristicMemoryGraphAnalysis(args.input)
  if (!args.draft) {
    return fallback
  }

  const knownSessionIds = new Set(args.input.sessions.map(session => session.sessionId))
  const knownFilePaths = new Set(args.input.files.map(file => file.path))
  const knownPlanIds = new Set(args.input.plans.map(plan => plan.eventId))
  const knownMemoryIds = new Set(
    args.input.memoryObjects.map(memoryObject => memoryObject.objectId),
  )
  const knownSegmentIds = new Set(args.input.segments.map(segment => segment.segmentId))
  const knownSourceEventIds = new Set(
    args.input.segments.flatMap(segment => segment.sourceEventIds),
  )

  const topicTitleToId = new Map<string, string>()
  const topics: MemoryGraphTopic[] = []
  for (const draftTopic of args.draft.topics ?? []) {
    const title = normalizeLabel(draftTopic.title ?? '', '')
    if (!title) {
      continue
    }
    const topicId = topicIdFromTitle(title)
    topicTitleToId.set(title, topicId)
    topics.push({
      topicId,
      title,
      summary: truncatePreview(
        stripMarkdownNoise(draftTopic.summary ?? '') || title,
        180,
      ),
      status: draftTopic.status === 'superseded' ? 'superseded' : 'active',
      sessionIds: dedupeStrings(draftTopic.session_ids ?? []).filter(sessionId =>
        knownSessionIds.has(sessionId),
      ),
      filePaths: dedupeStrings(draftTopic.file_paths ?? []).filter(path =>
        knownFilePaths.has(path),
      ),
      planIds: dedupeStrings(draftTopic.plan_ids ?? []).filter(planId =>
        knownPlanIds.has(planId),
      ),
      memoryObjectIds: dedupeStrings(draftTopic.memory_object_ids ?? []).filter(
        memoryObjectId => knownMemoryIds.has(memoryObjectId),
      ),
      relatedTopics: [],
    })
  }

  if (topics.length === 0) {
    return fallback
  }

  const resolvedTopicIds = new Set(topics.map(topic => topic.topicId))
  for (const [index, draftTopic] of (args.draft.topics ?? []).entries()) {
    const topic = topics[index]
    if (!topic) {
      continue
    }
    topic.relatedTopics = dedupeByKey(
      (draftTopic.related_topics ?? [])
        .map(related => {
          const title = normalizeLabel(related.title ?? '', '')
          if (!title) {
            return null
          }
          const topicId = topicTitleToId.get(title)
          if (!topicId || !resolvedTopicIds.has(topicId) || topicId === topic.topicId) {
            return null
          }
          return {
            topicId,
            reason: truncatePreview(related.reason ?? 'related topic', 120),
          }
        })
        .filter(
          (value): value is { topicId: string; reason: string } => value !== null,
        ),
      value => value.topicId,
    )
  }

  const fallbackSessionsById = new Map(
    fallback.sessions.map(session => [session.sessionId, session]),
  )
  const sessions: MemoryGraphSessionNode[] = dedupeByKey(
    [
      ...(args.draft.sessions ?? []).map(draftSession => {
        const sessionId = draftSession.session_id
        if (!sessionId || !knownSessionIds.has(sessionId)) {
          return null
        }
        const fallbackSession = fallbackSessionsById.get(sessionId)
        return {
          sessionId,
          title: normalizeLabel(
            draftSession.title ??
              fallbackSession?.title ??
              sessionId,
            sessionId,
          ),
          summary: truncatePreview(
            stripMarkdownNoise(
              draftSession.summary ?? fallbackSession?.summary ?? sessionId,
            ),
            180,
          ),
          topicIds: dedupeStrings(
            (draftSession.topic_titles ?? [])
              .map(title => topicTitleToId.get(normalizeLabel(title, '')))
              .filter((value): value is string => Boolean(value)),
          ),
          filePaths: dedupeStrings(draftSession.file_paths ?? []).filter(path =>
            knownFilePaths.has(path),
          ),
          planIds: dedupeStrings(draftSession.plan_ids ?? []).filter(planId =>
            knownPlanIds.has(planId),
          ),
          memoryObjectIds: dedupeStrings(
            draftSession.memory_object_ids ?? [],
          ).filter(memoryObjectId => knownMemoryIds.has(memoryObjectId)),
          relatedSessions: dedupeByKey(
            (draftSession.related_sessions ?? [])
              .map(relatedSession => {
                if (
                  !relatedSession.session_id ||
                  !knownSessionIds.has(relatedSession.session_id) ||
                  relatedSession.session_id === sessionId
                ) {
                  return null
                }
                return {
                  sessionId: relatedSession.session_id,
                  reason: truncatePreview(
                    relatedSession.reason ?? 'related session',
                    120,
                  ),
                }
              })
              .filter(
                (
                  value,
                ): value is { sessionId: string; reason: string } => value !== null,
              ),
            value => value.sessionId,
          ),
        }
      }),
      ...fallback.sessions,
    ].filter((value): value is MemoryGraphSessionNode => value !== null),
    session => session.sessionId,
  )

  const fallbackFilesByPath = new Map(
    fallback.files.map(file => [file.path, file]),
  )
  const files: MemoryGraphFileNode[] = dedupeByKey(
    [
      ...(args.draft.files ?? []).map(draftFile => {
        const path = draftFile.path
        if (!path || !knownFilePaths.has(path)) {
          return null
        }
        const fallbackFile = fallbackFilesByPath.get(path)
        return {
          path,
          role: truncatePreview(
            stripMarkdownNoise(
              draftFile.role ?? fallbackFile?.role ?? `Supports ${path}`,
            ),
            140,
          ),
          topicIds: dedupeStrings(
            (draftFile.topic_titles ?? [])
              .map(title => topicTitleToId.get(normalizeLabel(title, '')))
              .filter((value): value is string => Boolean(value)),
          ),
          sessionIds: dedupeStrings(draftFile.session_ids ?? []).filter(sessionId =>
            knownSessionIds.has(sessionId),
          ),
          planIds: dedupeStrings(draftFile.plan_ids ?? []).filter(planId =>
            knownPlanIds.has(planId),
          ),
          memoryObjectIds: dedupeStrings(
            draftFile.memory_object_ids ?? [],
          ).filter(memoryObjectId => knownMemoryIds.has(memoryObjectId)),
          recentRanges: fallbackFile?.recentRanges ?? [],
        }
      }),
      ...fallback.files,
    ].filter((value): value is MemoryGraphFileNode => value !== null),
    file => file.path,
  )

  const fallbackSegmentsById = new Map(
    fallback.segments.map(segment => [segment.segmentId, segment]),
  )
  const segments: MemoryGraphSegmentNode[] = dedupeByKey(
    [
      ...(args.draft.segments ?? []).map(draftSegment => {
        const segmentId = draftSegment.segment_id
        if (!segmentId || !knownSegmentIds.has(segmentId)) {
          return null
        }
        const fallbackSegment = fallbackSegmentsById.get(segmentId)
        if (!fallbackSegment) {
          return null
        }
        const sessionId =
          draftSegment.session_id && knownSessionIds.has(draftSegment.session_id)
            ? draftSegment.session_id
            : fallbackSegment.sessionId
        return {
          segmentId,
          kind: draftSegment.kind ?? fallbackSegment.kind,
          sessionId,
          title: normalizeLabel(
            draftSegment.title ?? fallbackSegment.title,
            fallbackSegment.title,
          ),
          summary: truncatePreview(
            stripMarkdownNoise(
              draftSegment.summary ?? fallbackSegment.summary ?? fallbackSegment.title,
            ),
            180,
          ),
          topicIds: dedupeStrings(
            (draftSegment.topic_titles ?? [])
              .map(title => topicTitleToId.get(normalizeLabel(title, '')))
              .filter((value): value is string => Boolean(value)),
          ),
          filePaths: dedupeStrings(draftSegment.file_paths ?? []).filter(path =>
            knownFilePaths.has(path),
          ),
          planIds: dedupeStrings(draftSegment.plan_ids ?? []).filter(planId =>
            knownPlanIds.has(planId),
          ),
          memoryObjectIds: dedupeStrings(
            draftSegment.memory_object_ids ?? [],
          ).filter(memoryObjectId => knownMemoryIds.has(memoryObjectId)),
          sourceEventIds: dedupeStrings(
            draftSegment.source_event_ids ?? fallbackSegment.sourceEventIds,
          ).filter(sourceEventId => knownSourceEventIds.has(sourceEventId)),
          recentRanges: fallbackSegment.recentRanges,
          relatedSegments: dedupeByKey(
            (draftSegment.related_segments ?? [])
              .map(relatedSegment => {
                if (
                  !relatedSegment.segment_id ||
                  !knownSegmentIds.has(relatedSegment.segment_id) ||
                  relatedSegment.segment_id === segmentId
                ) {
                  return null
                }
                return {
                  segmentId: relatedSegment.segment_id,
                  reason: truncatePreview(
                    relatedSegment.reason ?? 'related segment',
                    120,
                  ),
                }
              })
              .filter(
                (
                  value,
                ): value is { segmentId: string; reason: string } => value !== null,
              ),
            value => value.segmentId,
          ),
        }
      }),
      ...fallback.segments,
    ].filter((value): value is MemoryGraphSegmentNode => value !== null),
    segment => segment.segmentId,
  )

  const normalizeNodeRef = (
    ref: { kind: string; id: string },
  ): string | null => {
    if (ref.kind === 'topic') {
      const normalizedTitle = normalizeLabel(ref.id, '')
      if (topicTitleToId.has(normalizedTitle)) {
        return `topic:${topicTitleToId.get(normalizedTitle)}`
      }
      return ref.id.startsWith('topic:') ? ref.id : null
    }
    if (ref.kind === 'session' && knownSessionIds.has(ref.id)) {
      return `session:${ref.id}`
    }
    if (ref.kind === 'file' && knownFilePaths.has(ref.id)) {
      return `file:${ref.id}`
    }
    if (ref.kind === 'plan' && knownPlanIds.has(ref.id)) {
      return `plan:${ref.id}`
    }
    if (ref.kind === 'memory' && knownMemoryIds.has(ref.id)) {
      return `memory:${ref.id}`
    }
    if (ref.kind === 'segment' && knownSegmentIds.has(ref.id)) {
      return `segment:${ref.id}`
    }
    return null
  }

  const normalizedEdges = dedupeByKey(
    (args.draft.edges ?? [])
      .map(edge => {
        const source = parseEdgeRef(edge.source)
        const target = parseEdgeRef(edge.target)
        if (!source || !target || !edge.kind) {
          return null
        }

        const sourceKey = normalizeNodeRef(source)
        const targetKey = normalizeNodeRef(target)

        if (!sourceKey || !targetKey) {
          return null
        }

        return makeEdge(
          sourceKey,
          targetKey,
          edge.kind,
          edge.reason ?? edge.kind,
        )
      })
      .filter((value): value is MemoryGraphEdge => value !== null),
    edge => `${edge.source}|${edge.target}|${edge.kind}|${edge.reason}`,
  )

  const graph = {
    source: 'agent' as const,
    generatedAt: args.input.generatedAt,
    model: args.model,
    topics,
    sessions,
    files,
    segments,
    edges:
      normalizedEdges.length > 0
        ? dedupeByKey(
            [...normalizedEdges, ...fallback.edges],
            edge => `${edge.source}|${edge.target}|${edge.kind}|${edge.reason}`,
          )
        : fallback.edges,
  }

  return graph
}

function dotId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '_')
}

function dotLabel(value: string): string {
  return value.replace(/"/g, '\\"')
}

export function renderMemoryGraphDot(analysis: MemoryGraphAnalysis): string {
  const lines = [
    'digraph memory_graph {',
    '  rankdir=LR;',
    '  graph [fontname="Helvetica"];',
    '  node [fontname="Helvetica", shape=box, style=rounded];',
    '  edge [fontname="Helvetica"];',
    '',
  ]

  for (const topic of analysis.topics) {
    lines.push(
      `  ${dotId(`topic:${topic.topicId}`)} [shape=ellipse, style="filled", fillcolor="#f3f0d7", label="${dotLabel(topic.title)}"];`,
    )
  }
  for (const session of analysis.sessions) {
    lines.push(
      `  ${dotId(`session:${session.sessionId}`)} [shape=box, style="filled", fillcolor="#d9eef7", label="${dotLabel(session.title)}"];`,
    )
  }
  for (const file of analysis.files) {
    lines.push(
      `  ${dotId(`file:${file.path}`)} [shape=box, style="filled", fillcolor="#ececec", label="${dotLabel(file.path)}"];`,
    )
  }
  for (const segment of analysis.segments) {
    lines.push(
      `  ${dotId(`segment:${segment.segmentId}`)} [shape=note, style="filled", fillcolor="#f9e0c7", label="${dotLabel(`${segment.kind}\\n${truncatePreview(segment.title, 72)}`)}"];`,
    )
  }
  lines.push('')

  for (const edge of analysis.edges) {
    if (
      edge.source.startsWith('plan:') ||
      edge.source.startsWith('memory:') ||
      edge.target.startsWith('plan:') ||
      edge.target.startsWith('memory:')
    ) {
      continue
    }
    lines.push(
      `  ${dotId(edge.source)} -> ${dotId(edge.target)} [label="${dotLabel(edge.kind)}"];`,
    )
  }

  lines.push('}')
  return lines.join('\n')
}
