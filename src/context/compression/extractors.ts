/**
 * Rule-based extractors for the Context Compression Engine.
 * Each extractor processes a conversation turn and extracts structured atoms
 * (decisions, constraints, tasks, code anchors, error memories).
 *
 * Design principle: precision > recall — avoid false positives.
 */

import {
  type Decision,
  DecisionStatus,
  type Constraint,
  type TaskRecord,
} from './models.js'

// ── Helpers ────────────────────────────────────────────────────────────────

function escapeForPython(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .trim()
    .slice(0, 150)
}

function toVarName(s: string): string {
  let v = s.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  if (/^\d/.test(v)) v = `_${v}`
  return (v.toLowerCase().slice(0, 40) || 'unknown')
}

function makeId(prefix: string, content: string, turn: number): string {
  const hashInput = `${content}_${turn}`
  let hash = 0
  for (let i = 0; i < hashInput.length; i++) {
    const chr = hashInput.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  const hex = Math.abs(hash).toString(16).slice(0, 8)
  return `${prefix}_${hex}`
}

// ── Extraction Result ──────────────────────────────────────────────────────

export type ExtractionResult = {
  decisions: Decision[]
  constraints: Constraint[]
  tasks: Array<{ action: 'complete' | 'block' | 'create'; description: string; detail: string; turn: number }>
  codeAnchors: Array<{
    filePath: string
    lineStart: number
    lineEnd: number
    symbolName: string
    action: string
    turn: number
    note: string
  }>
  errorMemories: Array<{
    approach: string
    failureReason: string
    turn: number
    relatedFiles: string[]
  }>
  goalUpdate: string | null
  factUpdates: Array<{ key: string; value: string; category: string }>
}

const EMPTY_RESULT: ExtractionResult = {
  decisions: [],
  constraints: [],
  tasks: [],
  codeAnchors: [],
  errorMemories: [],
  goalUpdate: null,
  factUpdates: [],
}

// ── Decision Detector ──────────────────────────────────────────────────────

const ACCEPTANCE_PATTERNS: Array<[RegExp, string]> = [
  [/(?:就|决定|选择|采用|确认|确定)(?:使?用|采用)\s*(.+?)(?:[,，。.;；！!]|$)/, 'zh'],
  [/(?:用|使用)\s*(.+?)(?:吧|好了|就行)(?:[,，。.;；！!]|$)/, 'zh'],
  [/方案[是选]?\s*(.+?)(?:[,，。.;；！!]|$)/, 'zh'],
  [/(?:let'?s?\s+(?:use|go\s+with|adopt|choose))\s+(.+?)(?:[,.\s;!]|$)/i, 'en'],
  [/(?:we(?:'ll)?\s+(?:use|go\s+with))\s+(.+?)(?:[,.\s;!]|$)/i, 'en'],
  [/(?:go\s+with|stick\s+with|proceed\s+with)\s+(.+?)(?:[,.\s;!]|$)/i, 'en'],
]

const REJECTION_PATTERNS: Array<[RegExp, string]> = [
  [/(?:不要|不想|别|不用|禁止|不能)(?:使?用|采用)?\s*(.+?)(?:[,，。.;；！!]|$)/, 'zh'],
  [/(?:don'?t\s+use|avoid|reject|no\s+(?:more\s+)?)\s*(.+?)(?:[,.\s;!]|$)/i, 'en'],
  [/(?:not\s+(?:going\s+to\s+use|using))\s+(.+?)(?:[,.\s;!]|$)/i, 'en'],
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
}

function inferTopic(choice: string, context: string): string {
  const combined = `${choice} ${context}`.toLowerCase()
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some(kw => combined.includes(kw))) {
      return `${topic}_choice`
    }
  }
  return `choice_${toVarName(choice.slice(0, 20))}`
}

function detectDecisions(text: string, role: string, turn: number): Decision[] {
  const decisions: Decision[] = []

  if (role === 'user') {
    for (const [pattern] of ACCEPTANCE_PATTERNS) {
      for (const match of text.matchAll(new RegExp(pattern, 'g'))) {
        const choice = match[1]?.trim()
        if (!choice || choice.length < 2 || choice.length > 100) continue
        const topic = inferTopic(choice, text)
        decisions.push({
          id: makeId('dec', topic, turn),
          topic,
          choice: escapeForPython(choice),
          alternativesRejected: [],
          reason: '',
          status: DecisionStatus.ACCEPTED,
          turn,
        })
      }
    }

    for (const [pattern] of REJECTION_PATTERNS) {
      for (const match of text.matchAll(new RegExp(pattern, 'g'))) {
        const rejected = match[1]?.trim()
        if (!rejected || rejected.length < 2 || rejected.length > 100) continue
        const topic = inferTopic(rejected, text)
        decisions.push({
          id: makeId('dec_rej', topic, turn),
          topic,
          choice: '[REJECTED]',
          alternativesRejected: [escapeForPython(rejected)],
          reason: '',
          status: DecisionStatus.REJECTED,
          turn,
        })
      }
    }
  }

  return decisions
}

// ── Constraint Detector ────────────────────────────────────────────────────

const HARD_CONSTRAINT_PATTERNS: Array<[RegExp, string]> = [
  [/(?:必须|一定要|务必|强制|只能)(?:使?用)?\s*(.+?)(?:[,，。.;；！!]|$)/, 'hard'],
  [/(?:must|have\s+to|required\s+to|shall)\s+(?:use\s+)?(.+?)(?:[,.\s;!]|$)/i, 'hard'],
  [/(?:不允许|禁止|严禁|绝不|不可以)(?:使?用)?\s*(.+?)(?:[,，。.;；！!]|$)/, 'hard_forbid'],
  [/(?:must\s+not|forbidden|prohibited|never)\s+(?:use\s+)?(.+?)(?:[,.\s;!]|$)/i, 'hard_forbid'],
]

const SOFT_CONSTRAINT_PATTERNS: Array<[RegExp, string]> = [
  [/(?:尽量|优先|最好|倾向于?)(?:使?用)?\s*(.+?)(?:[,，。.;；！!]|$)/, 'soft'],
  [/(?:prefer|ideally|if\s+possible)\s+(?:use\s+)?(.+?)(?:[,.\s;!]|$)/i, 'soft'],
]

function categorizeConstraint(rule: string): Constraint['category'] {
  const lower = rule.toLowerCase()
  if (['library', 'framework', 'tool', 'sdk', 'api', '库', '框架'].some(k => lower.includes(k))) return 'technology'
  if (['pattern', 'architecture', 'structure', 'layer', '模式', '架构'].some(k => lower.includes(k))) return 'architecture'
  if (['naming', 'format', 'indent', 'comment', 'style', '命名', '格式'].some(k => lower.includes(k))) return 'style'
  return 'technology'
}

function detectConstraints(text: string, role: string, turn: number): Constraint[] {
  if (role !== 'user') return []

  const constraints: Constraint[] = []

  for (const [pattern, severityType] of HARD_CONSTRAINT_PATTERNS) {
    for (const match of text.matchAll(new RegExp(pattern, 'g'))) {
      let rule = match[1]?.trim()
      if (!rule || rule.length < 2 || rule.length > 100) continue
      if (severityType === 'hard_forbid') rule = `FORBIDDEN: ${rule}`
      constraints.push({
        id: makeId('con', rule, turn),
        category: categorizeConstraint(rule),
        rule: escapeForPython(rule),
        reason: '',
        severity: 'hard',
        turn,
        isActive: true,
      })
    }
  }

  for (const [pattern] of SOFT_CONSTRAINT_PATTERNS) {
    for (const match of text.matchAll(new RegExp(pattern, 'g'))) {
      const rule = match[1]?.trim()
      if (!rule || rule.length < 2 || rule.length > 100) continue
      constraints.push({
        id: makeId('con_soft', rule, turn),
        category: categorizeConstraint(rule),
        rule: escapeForPython(rule),
        reason: '',
        severity: 'soft',
        turn,
        isActive: true,
      })
    }
  }

  return constraints
}

// ── Progress Detector ──────────────────────────────────────────────────────

const COMPLETION_PATTERNS = [
  /(?:完成了|做好了|搞定了|已经好了)\s*(.+?)(?:[,，。.;；！!]|$)/,
  /(.+?)(?:完成|搞定|做好)了/,
  /(?:finished|completed|done\s+with|created|implemented)\s+(.+?)(?:[,.\s;!]|$)/i,
  /(?:i'?ve?\s+(?:created|modified|updated|fixed|implemented))\s+(.+?)(?:[,.\s;!]|$)/i,
]

const BLOCKER_PATTERNS = [
  /(?:遇到问题|报错|出错|卡住|失败)\s*(.+?)(?:[,，。.;；！!]|$)/,
  /(.+?)(?:报错|出错|失败|不行)了?/,
  /(?:error|failed|stuck|blocked|issue)\s+(?:with|on|in)?\s*(.+?)(?:[,.\s;!]|$)/i,
]

const NEW_TASK_PATTERNS = [
  /(?:接下来|下一步|然后|待办|需要做)\s*(.+?)(?:[,，。.;；！!]|$)/,
  /(?:next|todo|then|now\s+(?:let'?s?|we\s+need\s+to))\s+(.+?)(?:[,.\s;!]|$)/i,
]

function detectProgress(
  text: string,
  _role: string,
  turn: number,
): ExtractionResult['tasks'] {
  const tasks: ExtractionResult['tasks'] = []

  for (const pattern of COMPLETION_PATTERNS) {
    for (const match of text.matchAll(new RegExp(pattern, 'g'))) {
      const desc = match[1]?.trim()
      if (desc && desc.length > 2 && desc.length < 100) {
        tasks.push({ action: 'complete', description: desc, detail: '', turn })
      }
    }
  }

  for (const pattern of BLOCKER_PATTERNS) {
    for (const match of text.matchAll(new RegExp(pattern, 'g'))) {
      const desc = match[1]?.trim()
      if (desc && desc.length > 2 && desc.length < 100) {
        tasks.push({ action: 'block', description: desc, detail: '', turn })
      }
    }
  }

  for (const pattern of NEW_TASK_PATTERNS) {
    for (const match of text.matchAll(new RegExp(pattern, 'g'))) {
      const desc = match[1]?.trim()
      if (desc && desc.length > 2 && desc.length < 100) {
        tasks.push({ action: 'create', description: desc, detail: '', turn })
      }
    }
  }

  return tasks
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

function detectCodeAnchors(
  text: string,
  role: string,
  turn: number,
): ExtractionResult['codeAnchors'] {
  const anchors: ExtractionResult['codeAnchors'] = []
  const seen = new Set<string>()

  for (const match of text.matchAll(FILE_PATH_RE)) {
    const filePath = match[1]
    if (seen.has(filePath)) continue
    seen.add(filePath)

    let lineStart = 0
    let lineEnd = 0
    const nearby = text.slice(Math.max(0, match.index - 50), match.index + match[0].length + 50)
    const lineMatch = nearby.match(LINE_REF_RE)
    if (lineMatch) {
      lineStart = parseInt(lineMatch[1], 10)
      lineEnd = lineMatch[2] ? parseInt(lineMatch[2], 10) : lineStart
    }

    anchors.push({ filePath, lineStart, lineEnd, symbolName: '', action: 'referenced', turn, note: '' })
  }

  if (role === 'assistant') {
    for (const [pattern, action] of AGENT_ACTION_PATTERNS) {
      for (const match of text.matchAll(new RegExp(pattern, 'g'))) {
        const filePath = match[1]
        if (!seen.has(filePath)) {
          seen.add(filePath)
          anchors.push({ filePath, lineStart: 0, lineEnd: 0, symbolName: '', action, turn, note: '' })
        }
      }
    }
  }

  return anchors
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

function detectErrorMemories(
  text: string,
  _role: string,
  turn: number,
): ExtractionResult['errorMemories'] {
  const errors: ExtractionResult['errorMemories'] = []

  for (const pattern of FAILURE_PATTERNS) {
    for (const match of text.matchAll(new RegExp(pattern, 'g'))) {
      const approach = match[1]?.trim() || match[0].slice(0, 80)
      errors.push({
        approach: escapeForPython(approach),
        failureReason: 'Detected failure signal',
        turn,
        relatedFiles: [],
      })
    }
  }

  for (const match of text.matchAll(ERROR_STACK_RE)) {
    const errorMsg = match[1]?.trim().slice(0, 100) || 'Unknown error'
    errors.push({
      approach: `Code execution at turn ${turn}`,
      failureReason: escapeForPython(errorMsg),
      turn,
      relatedFiles: [],
    })
  }

  return errors
}

// ── Goal Detector ──────────────────────────────────────────────────────────

const GOAL_PATTERNS = [
  /(?:我想|我需要|我要|帮我|请|目标是|任务是)\s*(.+?)(?:[,，。.;；！!]|$)/,
  /(?:i\s+(?:want|need)\s+(?:to|you\s+to))\s+(.+?)(?:[,.\s;!]|$)/i,
  /(?:(?:the\s+)?goal\s+is\s+(?:to\s+)?)\s*(.+?)(?:[,.\s;!]|$)/i,
]

const GOAL_CHANGE_PATTERNS = [
  /(?:改为|变成|换成|改成|instead|change\s+to|switch\s+to)\s+(.+?)(?:[,，。.;；！!]|$)/i,
]

function detectGoal(
  text: string,
  role: string,
  turn: number,
): string | null {
  if (role !== 'user') return null

  for (const pattern of GOAL_CHANGE_PATTERNS) {
    const match = text.match(pattern)
    if (match && match[1]?.trim().length > 5) return match[1].trim()
  }

  if (turn <= 3) {
    for (const pattern of GOAL_PATTERNS) {
      const match = text.match(pattern)
      if (match && match[1]?.trim().length > 10) return match[1].trim()
    }
  }

  return null
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
}

function detectFacts(
  text: string,
  _role: string,
  turn: number,
): ExtractionResult['factUpdates'] {
  const facts: ExtractionResult['factUpdates'] = []

  for (const [category, patterns] of Object.entries(FACT_PATTERNS)) {
    for (const pattern of patterns) {
      for (const match of text.matchAll(new RegExp(pattern, 'g'))) {
        const value = match[1]?.trim()
        if (value && value.length >= 1 && value.length <= 100) {
          facts.push({ key: category, value: escapeForPython(value), category: 'tech_stack' })
        }
      }
    }
  }

  return facts
}

// ── Master Extractor ───────────────────────────────────────────────────────

export function extractFromTurn(
  text: string,
  role: string,
  turn: number,
): ExtractionResult {
  return {
    decisions: detectDecisions(text, role, turn),
    constraints: detectConstraints(text, role, turn),
    tasks: detectProgress(text, role, turn),
    codeAnchors: detectCodeAnchors(text, role, turn),
    errorMemories: detectErrorMemories(text, role, turn),
    goalUpdate: detectGoal(text, role, turn),
    factUpdates: detectFacts(text, role, turn),
  }
}
