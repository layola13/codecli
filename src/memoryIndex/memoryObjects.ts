import { createHash } from 'crypto'

export type MemoryObjectKind =
  | 'user_preference'
  | 'stable_constraint'
  | 'decision_rationale'
  | 'superseded_decision'

export type MemoryObjectStatus = 'active' | 'superseded'

export type MemoryObjectPromptInput = {
  eventId: string
  sessionId: string
  transcriptRelativePath: string
  timestamp: string
  isSidechain?: boolean
  agentId?: string
  normalizedText: string
  fullText: string
}

export type MemoryObjectPlanInput = {
  eventId: string
  sessionId: string
  transcriptRelativePath: string
  timestamp: string
  isSidechain?: boolean
  agentId?: string
  content: string
}

export type MemoryObjectEvidence = {
  eventId: string
  source: 'prompt' | 'plan'
  timestamp: string
  transcript: string
  excerpt: string
}

export type MemoryObject = {
  objectId: string
  kind: MemoryObjectKind
  title: string
  statement: string
  confidence: number
  status: MemoryObjectStatus
  firstSeenAt: string
  lastSeenAt: string
  sessionIds: string[]
  transcriptRelativePaths: string[]
  sourceEventIds: string[]
  evidence: MemoryObjectEvidence[]
  derivedFrom: 'heuristic'
  sourceLayer: 'events'
  supersededBy?: string
  supersededStatement?: string
  replacementStatement?: string
  tags: string[]
}

type RawMemoryObject = {
  kind: MemoryObjectKind
  statement: string
  confidence: number
  eventId: string
  sessionId: string
  transcriptRelativePath: string
  timestamp: string
  source: 'prompt' | 'plan'
  excerpt: string
  tags: string[]
  supersededStatement?: string
  replacementStatement?: string
}

const CHINESE_STOPWORDS = new Set([
  '这个',
  '那个',
  '当前',
  '现在',
  '这里',
  '理论',
  '理论上',
  '应该',
  '需要',
  '希望',
  '优先',
  '最好',
  '请',
  '必须',
  '不要',
  '不能',
  '保留',
  '改成',
  '改为',
  '改用',
  '换成',
  '换为',
  '而不是',
  '这样',
  '因为',
  '所以',
  '为了',
  '避免',
])

const ENGLISH_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'to',
  'of',
  'for',
  'with',
  'that',
  'this',
  'should',
  'must',
  'need',
  'needs',
  'prefer',
  'preferred',
  'please',
  'keep',
  'use',
  'instead',
  'rather',
  'than',
  'because',
  'avoid',
  'always',
  'never',
  'dont',
  'do',
  'not',
  'only',
])

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[，。！？!?,;；:：]+$/g, '').trim()
}

function stripWrapperNoise(value: string): string {
  return value
    .replace(/^"+|"+$/g, '')
    .replace(/^'+|'+$/g, '')
    .replace(/^Requirement Changes And Overrides-?\s*/iu, '')
    .replace(/\s+\(Active\)$/iu, '')
    .trim()
}

function stripMarkdownNoise(value: string): string {
  return value
    .replace(/^#{1,6}\s+/g, '')
    .replace(/^[-*+]\s+/g, '')
    .replace(/^\d+[.)]\s+/g, '')
    .trim()
}

function splitIntoCandidateSegments(text: string): string[] {
  const normalized = text
    .replace(/\r/g, '\n')
    .replace(/[。！？!?]+/g, match => `${match}\n`)
    .replace(/[；;]+/g, match => `${match}\n`)

  return normalized
    .split(/\n+/)
    .map(part =>
      stripWrapperNoise(stripMarkdownNoise(normalizeWhitespace(part))),
    )
    .map(part => trimTrailingPunctuation(part))
    .filter(part => part.length >= 8)
}

function stripRationaleClause(value: string): string {
  return value
    .replace(/\s*(因为|原因是|为了|以便|这样|否则|避免|所以).*/u, '')
    .replace(/\s*\b(because|so that|to avoid|to keep|since)\b.*/iu, '')
    .trim()
}

function normalizeForKey(value: string): string {
  return normalizeWhitespace(
    value
      .toLowerCase()
      .replace(/[“”"'`]/g, '')
      .replace(/[，。！？!?,;；:：()[\]{}<>]/g, ' ')
      .replace(/\b(do not|don't|must|should|prefer|please|keep|use|instead|rather than|because|always|never|only|cannot|can't)\b/gi, ' ')
      .replace(/\b(应该|必须|不要|不能|优先|希望|最好|请|保留|改成|改为|改用|换成|换为|而不是|因为|所以|为了|避免)\b/gu, ' '),
  )
}

function tokenizeComparable(value: string): string[] {
  const tokens = normalizeForKey(value).match(
    /[a-z0-9_./-]{2,}|[\u4e00-\u9fff]{2,}/g,
  )
  if (!tokens) {
    return []
  }
  return tokens.filter(token => {
    if (/^[\u4e00-\u9fff]+$/u.test(token)) {
      return !CHINESE_STOPWORDS.has(token)
    }
    return !ENGLISH_STOPWORDS.has(token)
  })
}

function countComparableTokens(value: string): number {
  return tokenizeComparable(value).length
}

function isSidechainSource(args: {
  isSidechain?: boolean
  agentId?: string
  transcriptRelativePath: string
}): boolean {
  return (
    args.isSidechain === true ||
    Boolean(args.agentId) ||
    args.transcriptRelativePath.includes('/subagents/')
  )
}

function looksLikeQuestion(segment: string): boolean {
  return (
    /[?？]/u.test(segment) ||
    /(为什么|为何|怎么|如何|是否|是不是|能不能|可不可以|要不要|有没有)/u.test(
      segment,
    ) ||
    /\b(why|how|what|which|can|could|should|would)\b/iu.test(segment) ||
    /(吗|呢)$/u.test(segment)
  )
}

function looksLikeBoilerplateNoise(segment: string): boolean {
  return (
    /^response:/iu.test(segment) ||
    /^\[system\]/iu.test(segment) ||
    /^unknown skill:/iu.test(segment) ||
    /^<[^>]+>/u.test(segment) ||
    /<\/[^>]+>$/u.test(segment) ||
    /^(?:bash|zsh|sh):/iu.test(segment) ||
    /^[a-z0-9._-]+@[a-z0-9._-]+:.*[$#]\s+/iu.test(segment) ||
    /\u001b\[[0-9;]*m/u.test(segment) ||
    /^continue the conversation from where it left off\b/iu.test(segment) ||
    /^resume directly\b/iu.test(segment) ||
    /^requirement changes and overrides\b/iu.test(segment) ||
    /\bdo not acknowledge the summary\b/iu.test(segment) ||
    /\bthis is research only\b/iu.test(segment) ||
    /\bread source directly before making claims\b/iu.test(segment) ||
    /\breport in under \d+ words\b/iu.test(segment)
  )
}

function looksLikeTaskInstruction(segment: string): boolean {
  return (
    /^(?:deeply\s+)?(?:analyze|assess|evaluate|inspect|implement|check|verify|continue|resume|focus on|read|report|return|create|write|scan|find|review|benchmark|compare|save)\b/iu.test(
      segment,
    ) ||
    /^(?:深度?分析|分析|评估|检查|验证|实现|继续|恢复|聚焦|阅读|报告|返回|生成|扫描|查看|找出|审查|比较|测试|保存|将结果保存|写入)/u.test(
      segment,
    ) ||
    /^based on the original task\b/iu.test(segment)
  )
}

function hasTaskVerb(segment: string): boolean {
  return (
    /\b(analyze|assess|evaluate|inspect|implement|check|verify|read|report|return|create|write|scan|find|review|benchmark|compare|save|build|run|test|edit|modify)\b/iu.test(
      segment,
    ) ||
    /(分析|评估|检查|验证|实现|生成|扫描|查看|找出|比较|测试|保存|写入|读取|修改|新增|添加|删除|构建|运行|研究|调研|输出|编辑|修复)/u.test(
      segment,
    )
  )
}

function hasFormattingNoise(segment: string): boolean {
  return (
    /->/.test(segment) ||
    /\(Active\)/iu.test(segment) ||
    /\*\*/.test(segment) ||
    /`{1,3}/.test(segment)
  )
}

function hasDurablePreferenceSignal(segment: string): boolean {
  return (
    /(默认|以后|长期|一直|偏好|习惯|一律|优先保持|优先支持|优先解决|首要|重点是|重点就是|保留|我更希望|我希望|我更想|我倾向|最好)/u.test(
      segment,
    ) ||
    /\b(prefer|preferred|default|going forward|for future|always keep|prioritize)\b/iu.test(
      segment,
    )
  )
}

function isLowQualitySemanticSegment(
  segment: string,
  maxLength: number,
): boolean {
  return (
    !segment ||
    segment.length > maxLength ||
    looksLikeQuestion(segment) ||
    looksLikeBoilerplateNoise(segment)
  )
}

function shouldKeepConstraintSegment(segment: string): boolean {
  const statement = normalizeDirectiveStatement(segment)
  if (isLowQualitySemanticSegment(statement, 220)) {
    return false
  }
  if (looksLikeTaskInstruction(statement)) {
    return false
  }
  if (countComparableTokens(statement) < 2) {
    return false
  }
  if (hasFormattingNoise(statement) && hasTaskVerb(statement)) {
    return false
  }
  return true
}

function shouldKeepPreferenceSegment(segment: string): boolean {
  const statement = normalizeDirectiveStatement(segment)
  if (isLowQualitySemanticSegment(statement, 220)) {
    return false
  }
  if (looksLikeTaskInstruction(statement)) {
    return false
  }
  if (countComparableTokens(statement) < 2) {
    return false
  }
  const durableSignal = hasDurablePreferenceSignal(statement)
  if (!durableSignal && hasTaskVerb(statement)) {
    return false
  }
  if (!durableSignal && hasFormattingNoise(statement)) {
    return false
  }
  return true
}

function shouldKeepRationaleSegment(segment: string): boolean {
  const statement = trimTrailingPunctuation(stripWrapperNoise(segment))
  if (isLowQualitySemanticSegment(statement, 260)) {
    return false
  }
  if (looksLikeTaskInstruction(statement)) {
    return false
  }
  return countComparableTokens(statement) >= 3
}

function computeTags(text: string): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const token of tokenizeComparable(text)) {
    if (seen.has(token)) {
      continue
    }
    seen.add(token)
    tags.push(token)
    if (tags.length >= 8) {
      break
    }
  }
  return tags
}

function shorten(value: string, maxChars: number = 96): string {
  if (value.length <= maxChars) {
    return value
  }
  return `${value.slice(0, maxChars - 1).trimEnd()}…`
}

function makeObjectId(kind: MemoryObjectKind, statement: string): string {
  const hash = createHash('sha1')
    .update(`${kind}:${normalizeForKey(statement)}`)
    .digest('hex')
    .slice(0, 12)
  return `memory:${kind}:${hash}`
}

function overlapEnough(left: string, right: string): boolean {
  const leftKey = normalizeForKey(left)
  const rightKey = normalizeForKey(right)
  if (!leftKey || !rightKey) {
    return false
  }
  if (leftKey.includes(rightKey) || rightKey.includes(leftKey)) {
    return true
  }

  const leftTokens = new Set(tokenizeComparable(leftKey))
  const rightTokens = new Set(tokenizeComparable(rightKey))
  let overlap = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap++
    }
  }
  return overlap >= Math.min(2, Math.max(1, Math.min(leftTokens.size, rightTokens.size)))
}

function stripTrailingRequestTail(value: string): string {
  const clauses = value
    .split(/[，,]/u)
    .map(part => normalizeWhitespace(part))
    .filter(Boolean)
  if (clauses.length <= 1) {
    return value
  }
  const [first, second] = clauses
  if (
    second &&
    /^(请|你|帮我|给我|继续|然后|再|同时|顺便|报告|返回|生成|实现|验证|检查|分析|评估|写|读|查看|测试|保存|focus on|report|read|implement|verify|check|analyze|assess|evaluate|inspect|create|find|review|compare|benchmark|save)/iu.test(
      second,
    )
  ) {
    return first
  }
  return value
}

function normalizeSupersededFragment(value: string): string {
  return trimTrailingPunctuation(
    stripTrailingRequestTail(stripRationaleClause(stripWrapperNoise(value))),
  ).replace(/^[，,。；;:："'`./\\\s-]+/u, '')
}

function isValidSupersededFragment(value: string): boolean {
  if (!value) {
    return false
  }
  if (looksLikeQuestion(value) || looksLikeBoilerplateNoise(value)) {
    return false
  }
  if (hasFormattingNoise(value)) {
    return false
  }
  if (/^(?:也)?不是/u.test(value)) {
    return false
  }
  if (/的$/u.test(value) && countComparableTokens(value) <= 1) {
    return false
  }
  if (value.length < 2 || value.length > 96) {
    return false
  }
  if (value.split(/[，,；;]/u).length > 2) {
    return false
  }
  return countComparableTokens(value) >= 1
}

function parseSupersededDecision(segment: string): {
  supersededStatement: string
  replacementStatement: string
  statement: string
  confidence: number
} | null {
  const rules: Array<{
    regex: RegExp
    map: (match: RegExpExecArray) => { oldValue: string; newValue: string } | null
  }> = [
    {
      regex: /(?:不要|别)\s*(.+?)(?:，|,)?\s*(?:改成|改用|换成|换为|改为|用)\s*(.+)/u,
      map: match =>
        match[1] && match[2]
          ? { oldValue: match[1], newValue: match[2] }
          : null,
    },
    {
      regex: /不是\s*(.+?)\s*而是\s*(.+)/u,
      map: match =>
        match[1] && match[2]
          ? { oldValue: match[1], newValue: match[2] }
          : null,
    },
    {
      regex: /不是\s*(.+?)(?:，|,)\s*是\s*(.+)/u,
      map: match =>
        match[1] && match[2]
          ? { oldValue: match[1], newValue: match[2] }
          : null,
    },
    {
      regex: /从\s*(.+?)(?:改成|改用|换成|切到|切换到|换为|改为)\s*(.+)/u,
      map: match =>
        match[1] && match[2]
          ? { oldValue: match[1], newValue: match[2] }
          : null,
    },
    {
      regex:
        /\b(?:do not|don't)\s+use\s+(.+?)(?:,|;)?\s*(?:use|switch to|replace(?: it)? with)\s+(.+)/iu,
      map: match =>
        match[1] && match[2]
          ? { oldValue: match[1], newValue: match[2] }
          : null,
    },
    {
      regex:
        /\binstead of\s+(.+?)(?:,|;)?\s*(?:use|prefer|switch to)\s+(.+)/iu,
      map: match =>
        match[1] && match[2]
          ? { oldValue: match[1], newValue: match[2] }
          : null,
    },
  ]

  for (const rule of rules) {
    const match = rule.regex.exec(segment)
    const parsed = match ? rule.map(match) : null
    if (!parsed) {
      continue
    }
    const supersededStatement = normalizeSupersededFragment(parsed.oldValue)
    const replacementStatement = normalizeSupersededFragment(parsed.newValue)
    if (
      !isValidSupersededFragment(supersededStatement) ||
      !isValidSupersededFragment(replacementStatement)
    ) {
      continue
    }
    return {
      supersededStatement,
      replacementStatement,
      statement: `Use ${replacementStatement} instead of ${supersededStatement}`,
      confidence: 0.96,
    }
  }

  return null
}

function isConstraintSegment(segment: string): boolean {
  return (
    /(必须|不能|不要|别|只能|一定|长期有效|不要回退|不可)/u.test(segment) ||
    /\b(must|do not|don't|never|always|only|cannot|can't)\b/iu.test(segment)
  )
}

function isPreferenceSegment(segment: string): boolean {
  return (
    /(优先|希望|最好|保留|首要|重点是|重点就是|优先级|先做|建议|默认|以后|一直|偏好|习惯|倾向)/u.test(
      segment,
    ) ||
    /\b(prefer|preferred|priority|prioritize|keep|default|usually|habit|going forward)\b/iu.test(
      segment,
    )
  )
}

function isRationaleSegment(segment: string): boolean {
  return (
    /(因为|原因|为了|以便|否则|避免|这样|所以)/u.test(segment) ||
    /\b(because|so that|to avoid|to keep|since|why)\b/iu.test(segment)
  )
}

function normalizeDirectiveStatement(segment: string): string {
  const cleaned = trimTrailingPunctuation(
    stripRationaleClause(stripWrapperNoise(segment)),
  )
  return cleaned
    .replace(/^(我觉得|我希望|希望|请|理论上|理论可以|理论应该)\s*/u, '')
    .trim()
}

function makeExcerpt(segment: string): string {
  return shorten(trimTrailingPunctuation(segment), 180)
}

function buildRawObject(args: {
  kind: MemoryObjectKind
  statement: string
  confidence: number
  eventId: string
  sessionId: string
  transcriptRelativePath: string
  timestamp: string
  source: 'prompt' | 'plan'
  excerpt: string
  supersededStatement?: string
  replacementStatement?: string
}): RawMemoryObject {
  return {
    kind: args.kind,
    statement: args.statement,
    confidence: args.confidence,
    eventId: args.eventId,
    sessionId: args.sessionId,
    transcriptRelativePath: args.transcriptRelativePath,
    timestamp: args.timestamp,
    source: args.source,
    excerpt: args.excerpt,
    tags: computeTags(
      [args.statement, args.supersededStatement, args.replacementStatement]
        .filter(Boolean)
        .join(' '),
    ),
    supersededStatement: args.supersededStatement,
    replacementStatement: args.replacementStatement,
  }
}

function buildPromptMemoryObjects(prompt: MemoryObjectPromptInput): RawMemoryObject[] {
  const objects: RawMemoryObject[] = []
  const text = prompt.normalizedText || prompt.fullText
  const sidechainSource = isSidechainSource(prompt)

  for (const segment of splitIntoCandidateSegments(text)) {
    if (looksLikeBoilerplateNoise(segment)) {
      continue
    }
    const excerpt = makeExcerpt(segment)
    const superseded = sidechainSource ? null : parseSupersededDecision(segment)
    if (superseded) {
      objects.push(
        buildRawObject({
          kind: 'superseded_decision',
          statement: superseded.statement,
          confidence: superseded.confidence,
          eventId: prompt.eventId,
          sessionId: prompt.sessionId,
          transcriptRelativePath: prompt.transcriptRelativePath,
          timestamp: prompt.timestamp,
          source: 'prompt',
          excerpt,
          supersededStatement: superseded.supersededStatement,
          replacementStatement: superseded.replacementStatement,
        }),
      )
    }

    if (
      !sidechainSource &&
      isConstraintSegment(segment) &&
      shouldKeepConstraintSegment(segment)
    ) {
      const statement = normalizeDirectiveStatement(segment)
      if (statement) {
        objects.push(
          buildRawObject({
            kind: 'stable_constraint',
            statement,
            confidence: 0.9,
            eventId: prompt.eventId,
            sessionId: prompt.sessionId,
            transcriptRelativePath: prompt.transcriptRelativePath,
            timestamp: prompt.timestamp,
            source: 'prompt',
            excerpt,
          }),
        )
      }
    } else if (
      !sidechainSource &&
      isPreferenceSegment(segment) &&
      shouldKeepPreferenceSegment(segment)
    ) {
      const statement = normalizeDirectiveStatement(segment)
      if (statement) {
        objects.push(
          buildRawObject({
            kind: 'user_preference',
            statement,
            confidence: 0.78,
            eventId: prompt.eventId,
            sessionId: prompt.sessionId,
            transcriptRelativePath: prompt.transcriptRelativePath,
            timestamp: prompt.timestamp,
            source: 'prompt',
            excerpt,
          }),
        )
      }
    }

    if (
      !sidechainSource &&
      isRationaleSegment(segment) &&
      shouldKeepRationaleSegment(segment)
    ) {
      const statement = trimTrailingPunctuation(segment)
      if (statement) {
        objects.push(
          buildRawObject({
            kind: 'decision_rationale',
            statement,
            confidence: 0.72,
            eventId: prompt.eventId,
            sessionId: prompt.sessionId,
            transcriptRelativePath: prompt.transcriptRelativePath,
            timestamp: prompt.timestamp,
            source: 'prompt',
            excerpt,
          }),
        )
      }
    }
  }

  return objects
}

function buildPlanMemoryObjects(plan: MemoryObjectPlanInput): RawMemoryObject[] {
  const objects: RawMemoryObject[] = []
  if (isSidechainSource(plan)) {
    return objects
  }

  for (const segment of splitIntoCandidateSegments(plan.content)) {
    if (!isRationaleSegment(segment) || !shouldKeepRationaleSegment(segment)) {
      continue
    }
    const statement = trimTrailingPunctuation(segment)
    if (!statement) {
      continue
    }
    objects.push(
      buildRawObject({
        kind: 'decision_rationale',
        statement,
        confidence: 0.68,
        eventId: plan.eventId,
        sessionId: plan.sessionId,
        transcriptRelativePath: plan.transcriptRelativePath,
        timestamp: plan.timestamp,
        source: 'plan',
        excerpt: makeExcerpt(segment),
      }),
    )
  }

  return objects
}

function mergeMemoryObjects(rawObjects: RawMemoryObject[]): MemoryObject[] {
  const merged = new Map<string, MemoryObject>()

  for (const object of rawObjects) {
    const objectId = makeObjectId(object.kind, object.statement)
    const existing = merged.get(objectId)
    if (!existing) {
      merged.set(objectId, {
        objectId,
        kind: object.kind,
        title: shorten(object.statement, 72),
        statement: object.statement,
        confidence: object.confidence,
        status: 'active',
        firstSeenAt: object.timestamp,
        lastSeenAt: object.timestamp,
        sessionIds: [object.sessionId],
        transcriptRelativePaths: [object.transcriptRelativePath],
        sourceEventIds: [object.eventId],
        evidence: [
          {
            eventId: object.eventId,
            source: object.source,
            timestamp: object.timestamp,
            transcript: object.transcriptRelativePath,
            excerpt: object.excerpt,
          },
        ],
        derivedFrom: 'heuristic',
        sourceLayer: 'events',
        supersededStatement: object.supersededStatement,
        replacementStatement: object.replacementStatement,
        tags: object.tags,
      })
      continue
    }

    existing.confidence = Math.max(existing.confidence, object.confidence)
    existing.firstSeenAt =
      existing.firstSeenAt.localeCompare(object.timestamp) <= 0
        ? existing.firstSeenAt
        : object.timestamp
    existing.lastSeenAt =
      existing.lastSeenAt.localeCompare(object.timestamp) >= 0
        ? existing.lastSeenAt
        : object.timestamp
    if (!existing.sessionIds.includes(object.sessionId)) {
      existing.sessionIds.push(object.sessionId)
      existing.sessionIds.sort((left, right) => left.localeCompare(right))
    }
    if (!existing.transcriptRelativePaths.includes(object.transcriptRelativePath)) {
      existing.transcriptRelativePaths.push(object.transcriptRelativePath)
      existing.transcriptRelativePaths.sort((left, right) =>
        left.localeCompare(right),
      )
    }
    if (!existing.sourceEventIds.includes(object.eventId)) {
      existing.sourceEventIds.push(object.eventId)
      existing.sourceEventIds.sort((left, right) => left.localeCompare(right))
    }
    if (
      !existing.evidence.some(
        evidence =>
          evidence.eventId === object.eventId && evidence.excerpt === object.excerpt,
      )
    ) {
      existing.evidence.push({
        eventId: object.eventId,
        source: object.source,
        timestamp: object.timestamp,
        transcript: object.transcriptRelativePath,
        excerpt: object.excerpt,
      })
      existing.evidence.sort((left, right) =>
        left.timestamp.localeCompare(right.timestamp),
      )
    }
    for (const tag of object.tags) {
      if (!existing.tags.includes(tag)) {
        existing.tags.push(tag)
      }
    }
  }

  return [...merged.values()].sort((left, right) =>
    right.lastSeenAt.localeCompare(left.lastSeenAt),
  )
}

function applySupersededLinks(objects: MemoryObject[]): void {
  const sorted = [...objects].sort((left, right) =>
    left.firstSeenAt.localeCompare(right.firstSeenAt),
  )

  for (const object of sorted) {
    if (object.kind !== 'superseded_decision') {
      continue
    }
    const supersededStatement = object.supersededStatement
    if (!supersededStatement) {
      continue
    }

    for (const candidate of sorted) {
      if (
        candidate.objectId === object.objectId ||
        candidate.kind === 'superseded_decision' ||
        candidate.status === 'superseded' ||
        candidate.lastSeenAt.localeCompare(object.lastSeenAt) > 0
      ) {
        continue
      }

      if (
        object.replacementStatement &&
        overlapEnough(candidate.statement, object.replacementStatement)
      ) {
        continue
      }

      if (overlapEnough(candidate.statement, supersededStatement)) {
        candidate.status = 'superseded'
        candidate.supersededBy = object.objectId
      }
    }
  }
}

export function countMemoryObjectsByKind(
  objects: MemoryObject[],
): Record<MemoryObjectKind, number> {
  return {
    user_preference: objects.filter(object => object.kind === 'user_preference')
      .length,
    stable_constraint: objects.filter(object => object.kind === 'stable_constraint')
      .length,
    decision_rationale: objects.filter(object => object.kind === 'decision_rationale')
      .length,
    superseded_decision: objects.filter(object => object.kind === 'superseded_decision')
      .length,
  }
}

export function buildMemoryObjects(args: {
  prompts: MemoryObjectPromptInput[]
  plans: MemoryObjectPlanInput[]
}): MemoryObject[] {
  const rawObjects: RawMemoryObject[] = []

  for (const prompt of args.prompts) {
    rawObjects.push(...buildPromptMemoryObjects(prompt))
  }

  for (const plan of args.plans) {
    rawObjects.push(...buildPlanMemoryObjects(plan))
  }

  const merged = mergeMemoryObjects(rawObjects)
  applySupersededLinks(merged)
  return merged.sort((left, right) =>
    right.lastSeenAt.localeCompare(left.lastSeenAt),
  )
}
