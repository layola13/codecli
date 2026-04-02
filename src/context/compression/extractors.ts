/**
 * Rule-based extractors for the Context Compression Engine.
 *
 * Design principle: precision > recall — avoid false positives.
 *
 * All detectors now use class-based architecture. The legacy flat function
 * extractFromTurn() is retained for backward compatibility (@deprecated).
 */

import {
  type Decision,
  DecisionStatus,
  type Constraint,
  type SessionState,
  type KnowledgeFact,
  FactConfidence,
  type CodeAnchor,
  type ErrorMemory,
} from './models.js'
import {
  toVarName,
  escape,
  stripCodeBlocks,
  makeId,
} from './utils.js'

// ── Extraction Result ──────────────────────────────────────────────────────

export type ExtractionResult = {
  decisions: Decision[]
  constraints: Constraint[]
  tasks: Array<{
    action: 'complete' | 'block' | 'create'
    description: string
    detail: string
    turn: number
  }>
  codeAnchors: CodeAnchor[]
  errorMemories: ErrorMemory[]
  goalUpdate: string | null
  factUpdates: KnowledgeFact[]
}

const LOW_SIGNAL_MESSAGE_RE =
  /^(?:继续|继续吧|继续看看|继续处理|看看|看下|go\s+on|continue|carry\s+on)\s*$/i

const REQUEST_ACTION_RE =
  /(?:增加|添加|实现|修复|更新|检查|查看|看看|导出|支持|重构|压缩|编译|打包|验证|补充|安装|运行|改成|改为|改到|移到|输出到|写到|完成|review|implement|add|update|fix|check|verify|export|support|refactor|build|compile|move|write|bump|ship|run)/i

const CONSTRAINT_SIGNAL_RE =
  /(?:必须|一定要|务必|强制|只能|不允许|禁止|严禁|绝不|不可以|尽量|优先|最好|倾向|尽可能|不需要|无需|不用|只做到|只需要|仅需要|文件级别|函数级别)/i

function withGlobal(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes('g')
    ? pattern.flags
    : `${pattern.flags}g`
  return new RegExp(pattern.source, flags)
}

function cleanExtractedText(value: string | undefined): string {
  return (value || '')
    .trim()
    .replace(/^[`"'“”‘’]+|[`"'“”‘’]+$/g, '')
    .replace(/[，,。.;；！!]+$/g, '')
    .trim()
}

function normalizeClause(clause: string): string {
  return clause
    .trim()
    .replace(/^[-*•\d.、)\]]+\s*/, '')
    .replace(/^[`"'“”‘’]+|[`"'“”‘’]+$/g, '')
    .replace(/^(?:请你|请|帮我|麻烦|需要|我想|我需要|我要|希望|想要|另外|还有|然后|接下来|那就|现在|对了)\s*/i, '')
    .trim()
}

function splitClauses(text: string): string[] {
  return text
    .split(/[\n,，。！？!?；;]+/)
    .flatMap(segment => segment.split(/\s*(?:另外|并且|而且|同时|以及|also|and\s+then|plus)\s*/i))
    .map(normalizeClause)
    .filter(Boolean)
}

function isConstraintClause(clause: string): boolean {
  return CONSTRAINT_SIGNAL_RE.test(clause)
}

function hasActionIntent(clause: string): boolean {
  return REQUEST_ACTION_RE.test(clause)
}

function looksConstraintLikeDecisionFragment(fragment: string): boolean {
  const lower = fragment.toLowerCase()
  return ['文件级别', '函数级别', '体积', '大小', 'token', 'prompt'].some(
    keyword => lower.includes(keyword),
  )
}

function uniqueTaskUpdates(
  tasks: ExtractionResult['tasks'],
): ExtractionResult['tasks'] {
  const seen = new Set<string>()
  return tasks.filter(task => {
    const key = `${task.action}:${task.description.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function extractRequestedClauses(text: string): string[] {
  return splitClauses(text).filter(
    clause =>
      clause.length >= 4 &&
      !LOW_SIGNAL_MESSAGE_RE.test(clause) &&
      !isConstraintClause(clause) &&
      hasActionIntent(clause),
  )
}

// ── Decision Detector ──────────────────────────────────────────────────────

const ACCEPTANCE_PATTERNS: Array<[RegExp, string]> = [
  [/(?:就|决定|选择|采用|确认|确定)(?:使?用|采用)\s*(.+?)(?:[,，。.;；！!]|$)/, 'zh'],
  [/(?:用|使用)\s*(.+?)(?:吧|好了|就行)(?:[,，。.;；！!]|$)/, 'zh'],
  [/方案[是选]?\s*(.+?)(?:[,，。.;；！!]|$)/, 'zh'],
  [/(?:改用|换用|切换到|切到|改成|改为|改到)\s*(.+?)(?:[,，。.;；！!]|$)/, 'zh'],
  [/(?:let'?s?\s+(?:use|go\s+with|adopt|choose))\s+(.+?)(?:[,;!]|$)/i, 'en'],
  [/(?:we(?:'ll)?\s+(?:use|go\s+with))\s+(.+?)(?:[,;!]|$)/i, 'en'],
  [/(?:i\s+(?:decide|choose|prefer|want)\s+(?:to\s+use\s+)?)\s*(.+?)(?:[,;!]|$)/i, 'en'],
  [/(?:go\s+with|stick\s+with|proceed\s+with|switch\s+to|move\s+to|migrate\s+to)\s+(.+?)(?:[,;!]|$)/i, 'en'],
]

const REJECTION_PATTERNS: Array<[RegExp, string]> = [
  [/(?:不要|不想|不用|禁止|不能)(?:使?用|采用)?\s*(.+?)(?:[,，。.;；！!]|$)/, 'zh'],
  [/(?:别(?:使?用|采用))\s*(.+?)(?:[,，。.;；！!]|$)/, 'zh'],
  [/(.+?)(?:不行|不好|算了|放弃|不合适)(?:[,，。.;；！!]|$)/, 'zh'],
  [/(?:don'?t\s+use|avoid|reject|no\s+(?:more\s+)?)\s*(.+?)(?:[,;!]|$)/i, 'en'],
  [/(?:not\s+(?:going\s+to\s+use|using))\s+(.+?)(?:[,;!]|$)/i, 'en'],
  [/(.+?)\s+(?:is\s+(?:not\s+)?(?:suitable|appropriate|good)|won'?t\s+work)(?:[,;!]|$)/i, 'en'],
]

const PROPOSED_PATTERNS: Array<[RegExp, string]> = [
  [/(?:i\s+(?:suggest|recommend|propose))\s+(?:using\s+)?(.+?)(?:[,;!]|$)/i, 'en'],
  [/(?:we\s+(?:could|should|can)\s+use)\s+(.+?)(?:[,;!]|$)/i, 'en'],
  [/(?:建议|推荐)\s*(.+?)(?:[,，。.;；！!]|$)/, 'zh'],
  [/(?:可以(?:考虑|尝试)?(?:使?用)?)\s*(.+?)(?:[,，。.;；！!]|$)/, 'zh'],
]

const REVERTED_PATTERNS: Array<[RegExp, string]> = [
  [/(?:撤回|回退|恢复|撤销|revert|undo|roll\s+back)\s*(.+?)(?:[,，。.;；！!]|$)/i, 'zh'],
]

const TOPIC_KEYWORDS: Record<string, string[]> = {
  database: ['postgres', 'mysql', 'mongo', 'sqlite', 'redis', '数据库', 'db', 'database'],
  http_client: ['fetch', 'axios', 'got', 'request', 'http', 'client'],
  auth_strategy: ['jwt', 'oauth', 'session', 'token', '认证', 'auth', 'login'],
  framework: ['react', 'vue', 'angular', 'next', 'express', 'fastapi', '框架'],
  state_management: ['redux', 'zustand', 'mobx', 'pinia', '状态管理'],
  testing: ['jest', 'vitest', 'pytest', '测试', 'test'],
  deployment: ['docker', 'k8s', 'kubernetes', 'vercel', '部署', 'deploy'],
  styling: ['tailwind', 'css', 'styled', 'sass', '样式', 'style'],
  orm: ['prisma', 'typeorm', 'drizzle', 'sequelize', 'sqlalchemy'],
  bundler: ['webpack', 'vite', 'esbuild', 'rollup', 'turbopack', '打包'],
  output_location: ['项目根目录', '安装目录', 'project root', 'output dir', 'output directory'],
}

export class DecisionDetector {
  detect(text: string, role: string, turn: number): Decision[] {
    const decisions: Decision[] = []

    if (role === 'user') {
      for (const [pattern] of ACCEPTANCE_PATTERNS) {
        for (const match of text.matchAll(withGlobal(pattern))) {
          const choice = cleanExtractedText(match[1])
          if (!choice || choice.length < 2 || choice.length > 100) continue
          if (looksConstraintLikeDecisionFragment(choice)) continue
          const topic = this._inferTopic(choice, text)
          decisions.push({
            id: makeId('dec', topic, turn),
            topic,
            choice: escape(choice),
            alternativesRejected: [],
            reason: this._extractReason(text),
            status: DecisionStatus.ACCEPTED,
            turn,
          })
        }
      }

      for (const [pattern] of REJECTION_PATTERNS) {
        for (const match of text.matchAll(withGlobal(pattern))) {
          const rejected = cleanExtractedText(match[1])
          if (!rejected || rejected.length < 2 || rejected.length > 100) continue
          if (looksConstraintLikeDecisionFragment(rejected)) continue
          const topic = this._inferTopic(rejected, text)
          decisions.push({
            id: makeId('dec_rej', topic, turn),
            topic,
            choice: '[REJECTED]',
            alternativesRejected: [escape(rejected)],
            reason: this._extractReason(text),
            status: DecisionStatus.REJECTED,
            turn,
          })
        }
      }

      for (const [pattern] of REVERTED_PATTERNS) {
        for (const match of text.matchAll(withGlobal(pattern))) {
          const reverted = cleanExtractedText(match[1])
          if (!reverted || reverted.length < 2 || reverted.length > 100) continue
          if (looksConstraintLikeDecisionFragment(reverted)) continue
          const topic = this._inferTopic(reverted, text)
          decisions.push({
            id: makeId('dec_rev', topic, turn),
            topic,
            choice: '[REVERTED]',
            alternativesRejected: [escape(reverted)],
            reason: this._extractReason(text),
            status: DecisionStatus.REVERTED,
            turn,
          })
        }
      }
    }

    if (role === 'assistant') {
      for (const [pattern] of PROPOSED_PATTERNS) {
        for (const match of text.matchAll(withGlobal(pattern))) {
          const choice = cleanExtractedText(match[1])
          if (!choice || choice.length < 2 || choice.length > 100) continue
          if (looksConstraintLikeDecisionFragment(choice)) continue
          const topic = this._inferTopic(choice, text)
          decisions.push({
            id: makeId('dec_prop', topic, turn),
            topic,
            choice: escape(choice),
            alternativesRejected: [],
            reason: this._extractReason(text),
            status: DecisionStatus.PROPOSED,
            turn,
          })
        }
      }
    }

    return decisions
  }

  private _inferTopic(choice: string, context: string): string {
    const combined = `${choice} ${context}`.toLowerCase()
    for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
      if (keywords.some(kw => combined.includes(kw))) {
        return `${topic}_choice`
      }
    }
    return `choice_${toVarName(choice.slice(0, 20))}`
  }

  private _extractReason(text: string): string {
    const reasonMatch = text.match(/(?:因为|由于|because|since|the\s+reason\s+is)\s*(.+?)(?:[,，。.;；！!]|$)/i)
    return reasonMatch ? escape(reasonMatch[1]) : ''
  }
}

// ── Constraint Detector ────────────────────────────────────────────────────

const HARD_CONSTRAINT_PATTERNS: Array<[RegExp, string]> = [
  [/(?:必须|一定要|务必|强制|只能)(?:使?用)?\s*(.+?)(?:[,，。.;；！!]|$)/, 'hard'],
  [/(?:must|have\s+to|required\s+to|shall)\s+(?:use\s+)?(.+?)(?:[,;!]|$)/i, 'hard'],
  [/(?:不允许|禁止|严禁|绝不|不可以)(?:使?用)?\s*(.+?)(?:[,，。.;；！!]|$)/, 'hard_forbid'],
  [/(?:不需要|无需|不用)(?:再)?(?:做到|做|到)?\s*(.+?)(?:即可|就可以|就行|[,，。.;；！!]|$)/, 'hard_forbid'],
  [/(?:只做到|做到|只需要|仅需要)\s*(.+?)(?:即可|就可以|就行|为止|[,，。.;；！!]|$)/, 'hard'],
  [/(?:must\s+not|forbidden|prohibited|never)\s+(?:use\s+)?(.+?)(?:[,;!]|$)/i, 'hard_forbid'],
]

const SOFT_CONSTRAINT_PATTERNS: Array<[RegExp, string]> = [
  [/(?:尽量|优先|最好|倾向于?|尽可能)(?:使?用)?\s*(.+?)(?:[,，。.;；！!]|$)/, 'soft'],
  [/(?:prefer|ideally|if\s+possible)\s+(?:use\s+)?(.+?)(?:[,;!]|$)/i, 'soft'],
]

export class ConstraintDetector {
  detect(text: string, role: string, turn: number): Constraint[] {
    if (role !== 'user') return []

    const constraints: Constraint[] = []

    for (const [pattern, severityType] of HARD_CONSTRAINT_PATTERNS) {
      for (const match of text.matchAll(withGlobal(pattern))) {
        let rule = cleanExtractedText(match[1])
        if (!rule || rule.length < 2 || rule.length > 100) continue
        if (severityType === 'hard_forbid') rule = `FORBIDDEN: ${rule}`
        constraints.push({
          id: makeId('con', rule, turn),
          category: this._categorizeConstraint(rule),
          rule: escape(rule),
          reason: this._extractReason(text),
          severity: 'hard',
          turn,
          isActive: true,
        })
      }
    }

    for (const [pattern] of SOFT_CONSTRAINT_PATTERNS) {
      for (const match of text.matchAll(withGlobal(pattern))) {
        const rule = cleanExtractedText(match[1])
        if (!rule || rule.length < 2 || rule.length > 100) continue
        constraints.push({
          id: makeId('con_soft', rule, turn),
          category: this._categorizeConstraint(rule),
          rule: escape(rule),
          reason: this._extractReason(text),
          severity: 'soft',
          turn,
          isActive: true,
        })
      }
    }

    return constraints
  }

  private _categorizeConstraint(rule: string): Constraint['category'] {
    const lower = rule.toLowerCase()
    if (['library', 'framework', 'tool', 'sdk', 'api', '库', '框架'].some(k => lower.includes(k))) return 'technology'
    if (['pattern', 'architecture', 'structure', 'layer', '模式', '架构'].some(k => lower.includes(k))) return 'architecture'
    if (['naming', 'format', 'indent', 'comment', 'style', '命名', '格式'].some(k => lower.includes(k))) return 'style'
    if (['token', 'size', 'volume', '文件级别', '函数级别', '路径', '目录', '输出', '压缩', 'prompt'].some(k => lower.includes(k))) return 'process'
    return 'technology'
  }

  private _extractReason(text: string): string {
    const reasonMatch = text.match(/(?:因为|由于|because|since|the\s+reason\s+is)\s*(.+?)(?:[,，。.;；！!]|$)/i)
    return reasonMatch ? escape(reasonMatch[1]) : ''
  }
}

// ── Goal Detector ──────────────────────────────────────────────────────────

const GOAL_PATTERNS = [
  /(?:我想|我需要|我要|帮我|请|目标是|任务是)\s*(.+?)(?:[,，。.;；！!]|$)/,
  /(?:i\s+(?:want|need)\s+(?:to|you\s+to))\s+(.+?)(?:[,;!]|$)/i,
  /(?:(?:the\s+)?goal\s+is\s+(?:to\s+)?)\s*(.+?)(?:[,;!]|$)/i,
  /(?:为|给|把|在)\s*(.+?(?:增加|添加|实现|修复|更新|检查|导出|支持|重构|压缩|编译|打包|验证|改成|改为|改到).+?)(?:[,，。.;；！!]|$)/,
]

const GOAL_CHANGE_PATTERNS = [
  /(?:改为|变成|换成|改成|instead|change\s+to|switch\s+to)\s+(.+?)(?:[,，。.;；！!]|$)/i,
]

export class GoalDetector {
  detect(text: string, role: string, _turn: number, currentGoal?: string): string | null {
    if (role !== 'user') return null
    if (LOW_SIGNAL_MESSAGE_RE.test(text.trim())) return null

    for (const pattern of GOAL_CHANGE_PATTERNS) {
      const match = text.match(pattern)
      const updatedGoal = cleanExtractedText(match?.[1])
      if (updatedGoal.length > 5) return updatedGoal
    }

    if (currentGoal?.trim()) {
      return null
    }

    for (const pattern of GOAL_PATTERNS) {
      const match = text.match(pattern)
      const goal = cleanExtractedText(match?.[1])
      if (goal.length > 6) return goal
    }

    const fallbackGoal = extractRequestedClauses(text)[0]
    if (fallbackGoal && fallbackGoal.length > 6) {
      return fallbackGoal
    }

    return null
  }
}

// ── Fact Detector ──────────────────────────────────────────────────────────

const FACT_PATTERNS: Record<string, RegExp[]> = {
  database: [
    /(?:数据库|database)\s*(?:是|用的?是?|=|:)\s*(.+?)(?:[,，。.;；\s]|$)/,
    /(?:using|use)\s+((?:postgres|mysql|mongo|sqlite|redis)\w*)/i,
  ],
  language: [
    /(?:语言|language)\s*(?:是|用的?是?)\s*(.+?)(?:[,，。.;；\s]|$)/,
    /(?:written\s+in|using)\s+(typescript|javascript|python|rust|go|java)/i,
  ],
  framework: [
    /(?:框架|framework)\s*(?:是|用的?是?)\s*(.+?)(?:[,，。.;；\s]|$)/,
  ],
  api_url: [
    /(?:api|url|地址|endpoint)\s*(?:是|=|:)\s*(https?:\/\/\S+)/,
  ],
  version: [
    /(?:version|版本(?:号)?)\s*(?:是|=|:|改成|改为|更新到)\s*([0-9A-Za-z._+-]+)(?:[,，。.;；\s]|$)/i,
  ],
  build_tool: [
    /(?:用|using)\s+(bun|npm|pnpm|yarn)\s*(?:编译|构建|build|compile)/i,
    /(?:build|compile)\s+with\s+(bun|npm|pnpm|yarn)(?:[,;!]|$)/i,
  ],
}

export class FactDetector {
  detect(text: string, role: string, turn: number): KnowledgeFact[] {
    const facts: KnowledgeFact[] = []
    const confidence = role === 'user' ? FactConfidence.CERTAIN : FactConfidence.INFERRED
    const categoryByKey: Record<string, string> = {
      version: 'release',
      build_tool: 'tooling',
    }

    for (const [category, patterns] of Object.entries(FACT_PATTERNS)) {
      for (const pattern of patterns) {
        for (const match of text.matchAll(withGlobal(pattern))) {
          const value = cleanExtractedText(match[1])
          if (value && value.length >= 1 && value.length <= 100) {
            facts.push({
              key: category,
              value: escape(value),
              category: categoryByKey[category] || 'tech_stack',
              confidence,
              sourceTurn: turn,
            })
          }
        }
      }
    }

    return facts
  }
}

// ── Progress Detector ──────────────────────────────────────────────────────

const COMPLETION_PATTERNS = [
  /(?:完成了|做好了|搞定了|已经好了)\s*(.+?)(?:[,，。.;；！!]|$)/,
  /(.+?)(?:完成|搞定|做好)了?/,
  /(?:已(?:经)?|已经)(?:完成|实现|修复|更新|添加|新增|支持|导出|打包|编译)\s*(.+?)(?:[,，。.;；！!]|$)/,
  /(?:finished|completed|done\s+with|created|implemented|added|updated|modified|fixed|rebuilt|wired)\s+(.+?)(?:[,;!]|$)/i,
  /(?:i'?ve?\s+(?:created|modified|updated|fixed|implemented|added|wired|rebuilt))\s+(.+?)(?:[,;!]|$)/i,
]

const BLOCKER_PATTERNS = [
  /(?:遇到问题|报错|出错|卡住|失败)\s*(.+?)(?:[,，。.;；！!]|$)/,
  /(.+?)(?:报错|出错|失败|不行)了?/,
  /(?:error|failed|stuck|blocked|issue)\s+(?:with|on|in)?\s*(.+?)(?:[,;!]|$)/i,
]

const NEW_TASK_PATTERNS = [
  /(?:接下来|下一步|然后|待办|需要做)\s*(.+?)(?:[,，。.;；！!]|$)/,
  /(?:next|todo|then|now\s+(?:let'?s?|we\s+need\s+to))\s+(.+?)(?:[,;!]|$)/i,
]

function detectProgress(
  text: string,
  role: string,
  turn: number,
): ExtractionResult['tasks'] {
  const tasks: ExtractionResult['tasks'] = []

  for (const pattern of COMPLETION_PATTERNS) {
    for (const match of text.matchAll(withGlobal(pattern))) {
      const desc = cleanExtractedText(match[1])
      if (desc && desc.length > 2 && desc.length < 100) {
        tasks.push({ action: 'complete', description: desc, detail: '', turn })
      }
    }
  }

  for (const pattern of BLOCKER_PATTERNS) {
    for (const match of text.matchAll(withGlobal(pattern))) {
      const desc = cleanExtractedText(match[1])
      if (desc && desc.length > 2 && desc.length < 100) {
        tasks.push({ action: 'block', description: desc, detail: '', turn })
      }
    }
  }

  for (const pattern of NEW_TASK_PATTERNS) {
    for (const match of text.matchAll(withGlobal(pattern))) {
      const desc = cleanExtractedText(match[1])
      if (desc && desc.length > 2 && desc.length < 100) {
        tasks.push({ action: 'create', description: desc, detail: '', turn })
      }
    }
  }

  if (role === 'user') {
    for (const clause of extractRequestedClauses(text)) {
      tasks.push({ action: 'create', description: clause, detail: '', turn })
    }
  }

  return uniqueTaskUpdates(tasks)
}

// ── Code Anchor Detector ──────────────────────────────────────────────────

const FILE_PATH_RE =
  /(?:^|\s|[`"'])((?:[\w\-./]+\/)?[\w\-]+\.(?:ts|tsx|js|jsx|py|rs|go|java|cpp|c|h|hpp|rb|php|swift|kt))(?:\s|[`"']|$|[,.:;])/gm

const LINE_REF_RE =
  /(?:(?:第|line|行|L)\s*(\d+)\s*(?:行|line)?(?:\s*(?:到|to|-)\s*(\d+))?)/gi

const AGENT_ACTION_PATTERNS: Array<[RegExp, string]> = [
  [/(?:read|reading|读取?了?)\s+(?:file\s+)?[`'"]?([\w\-./]+\.[\w]+)/i, 'read'],
  [/(?:modif(?:y|ied)|updat(?:e|ed)|chang(?:e|ed)|修改了?)\s+(?:file\s+)?[`'"]?([\w\-./]+\.[\w]+)/i, 'modified'],
  [/(?:creat(?:e|ed)|writ(?:e|ten)|新建了?|创建了?)\s+(?:file\s+)?[`'"]?([\w\-./]+\.[\w]+)/i, 'created'],
]

export class AnchorDetector {
  private skeletonIndex?: Map<string, string>

  constructor(skeletonIndex?: Map<string, string>) {
    this.skeletonIndex = skeletonIndex
  }

  detect(text: string, role: string, turn: number): CodeAnchor[] {
    const anchors: CodeAnchor[] = []
    const seen = new Set<string>()

    for (const match of text.matchAll(FILE_PATH_RE)) {
      const filePath = match[1]
      if (this._isLowValuePath(filePath)) continue
      if (seen.has(filePath)) continue
      seen.add(filePath)

      let lineStart = 0
      let lineEnd = 0
      const nearby = text.slice(Math.max(0, match.index - 50), match.index + match[0].length + 50)
      const lineMatch = Array.from(nearby.matchAll(LINE_REF_RE))[0]
      if (lineMatch) {
        lineStart = parseInt(lineMatch[1], 10)
        lineEnd = lineMatch[2] ? parseInt(lineMatch[2], 10) : lineStart
      }

      const skeletonPath = this._findSkeletonPath(filePath)
      anchors.push({
        filePath,
        lineStart,
        lineEnd,
        symbolName: '',
        skeletonPath,
        action: 'referenced',
        turn,
        note: '',
      })
    }

    if (role === 'assistant') {
      for (const [pattern, action] of AGENT_ACTION_PATTERNS) {
        for (const match of text.matchAll(withGlobal(pattern))) {
          const filePath = match[1]
          if (this._isLowValuePath(filePath)) continue
          const skeletonPath = this._findSkeletonPath(filePath)
          anchors.push({
            filePath,
            lineStart: 0,
            lineEnd: 0,
            symbolName: '',
            skeletonPath,
            action,
            turn,
            note: '',
          })
        }
      }
    }

    return this._deduplicate(anchors)
  }

  private _findSkeletonPath(filePath: string): string | undefined {
    if (!this.skeletonIndex) return undefined
    return this.skeletonIndex.get(filePath)
  }

  private _isLowValuePath(filePath: string): boolean {
    return [
      '.code_index/',
      '.codex/',
      '.claude/',
      'node_modules/',
      '.git/',
      'dist/.claude/',
    ].some(prefix => filePath.startsWith(prefix))
  }

  private _deduplicate(anchors: CodeAnchor[]): CodeAnchor[] {
    const byFile = new Map<string, CodeAnchor>()
    const priorityOrder = ['created', 'modified', 'read', 'referenced']

    for (const anchor of anchors) {
      const existing = byFile.get(anchor.filePath)
      if (!existing) {
        byFile.set(anchor.filePath, anchor)
      } else {
        const existingPriority = priorityOrder.indexOf(existing.action)
        const newPriority = priorityOrder.indexOf(anchor.action)
        if (newPriority < existingPriority) {
          byFile.set(anchor.filePath, anchor)
        }
      }
    }

    return Array.from(byFile.values())
  }
}

// ── Error Memory Detector ──────────────────────────────────────────────────

const FAILURE_PATTERNS = [
  /(?:this\s+(?:approach|method|solution)\s+(?:doesn'?t|won'?t|didn'?t)\s+work)/i,
  /(?:这个?(?:方案|方法|办法)(?:不行|有问题|失败|不可行))/,
  /(?:尝试了?\s*(.+?)\s*(?:但是?|不过)\s*(?:失败|报错|不行))/,
  /(?:tried\s+(.+?)\s+but\s+(?:it\s+)?(?:failed|didn'?t\s+work|errored))/i,
]

const ERROR_STACK_RE =
  /(?:Error|Exception|Traceback|panic|FATAL)[:\s]+(.+?)(?:\n\s+at|\n\n|$)/gim

export class ErrorMemoryDetector {
  detect(text: string, _role: string, turn: number): ErrorMemory[] {
    const errors: ErrorMemory[] = []

    for (const pattern of FAILURE_PATTERNS) {
      for (const match of text.matchAll(withGlobal(pattern))) {
        const approach = match[1]?.trim() || match[0].slice(0, 80)
        errors.push({
          approach: escape(approach),
          failureReason: this._extractFailureReason(text),
          turn,
          relatedFiles: this._extractRelatedFiles(text),
        })
      }
    }

    for (const match of text.matchAll(ERROR_STACK_RE)) {
      const errorMsg = match[1]?.trim().slice(0, 100) || 'Unknown error'
      errors.push({
        approach: `Code execution at turn ${turn}`,
        failureReason: escape(errorMsg),
        turn,
        relatedFiles: this._extractRelatedFiles(text),
      })
    }

    return errors
  }

  private _extractFailureReason(text: string): string {
    const reasonMatch = text.match(/(?:because|the\s+issue\s+is|原因是)\s*(.+?)(?:[,，。.;；！!]|$)/i)
    return reasonMatch ? escape(reasonMatch[1]) : 'Detected failure signal'
  }

  private _extractRelatedFiles(text: string): string[] {
    const files: string[] = []
    for (const match of text.matchAll(FILE_PATH_RE)) {
      if (!files.includes(match[1])) {
        files.push(match[1])
      }
    }
    return files
  }
}

// ── Master Extractor ───────────────────────────────────────────────────────

export class MasterExtractor {
  private decisionDetector = new DecisionDetector()
  private constraintDetector = new ConstraintDetector()
  private goalDetector = new GoalDetector()
  private factDetector = new FactDetector()
  private anchorDetector: AnchorDetector
  private errorDetector = new ErrorMemoryDetector()

  constructor(skeletonIndex?: Map<string, string>) {
    this.anchorDetector = new AnchorDetector(skeletonIndex)
  }

  extract(text: string, role: string, turn: number, _currentState?: SessionState): ExtractionResult {
    // First strip code blocks before analysis
    const cleanText = stripCodeBlocks(text)

    return {
      goalUpdate: this.goalDetector.detect(cleanText, role, turn, _currentState?.primaryGoal),
      decisions: this.decisionDetector.detect(cleanText, role, turn),
      constraints: this.constraintDetector.detect(cleanText, role, turn),
      factUpdates: this.factDetector.detect(cleanText, role, turn),
      tasks: detectProgress(cleanText, role, turn),
      codeAnchors: this.anchorDetector.detect(cleanText, role, turn),
      errorMemories: this.errorDetector.detect(cleanText, role, turn),
    }
  }
}

// ── Legacy Extractor (backward compatibility) ──────────────────────────────

/**
 * @deprecated Use MasterExtractor.extract() instead.
 * Kept for backward compatibility.
 */
export function extractFromTurn(
  text: string,
  role: string,
  turn: number,
): ExtractionResult {
  const master = new MasterExtractor()
  return master.extract(text, role, turn)
}
