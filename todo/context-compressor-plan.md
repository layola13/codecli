# Context 压缩器实现计划 v2

## 修正汇总（基于评审）

| # | 问题 | 修正 |
|---|---|---|
| 1 | toPythonLine() 不应放在 interface 上 | 序列化函数集中在 serializer.ts |
| 2 | 正则解析 Python 恢复状态太脆弱 | 双文件持久化：.py（AI 消费）+ .json（程序恢复） |
| 3 | ExtractionResult 缺少 goalUpdate | 补充 |
| 4 | "重写"风险高 | 改为"扩展"，保留已有代码 |
| 5 | 相似度算法未明确规格 | 明确分词策略 + 阈值常量 |
| 6 | 缺少错误处理 | 横切规则：静默降级，不阻塞主流程 |
| 7 | 缺少测试策略 | 新增 __tests__/ 目录 |
| 8 | 缺少触发机制 | 新增 hook 注入 + /compress 命令 |
| 9 | 缺少 utils.ts | 新增工具函数文件 |

---

## 横切规则（所有 Phase 必须遵守）

1. **压缩器失败 = 静默降级**，不阻塞用户对话主流程
2. **所有检测器先剥离代码块**再分析
3. **每个 Phase 完成后系统必须能编译运行**

---

## Phase 1a: 新增枚举和接口（不动已有代码）

### 文件：`models.ts` — 扩展

保留已有：
- `DecisionStatus`（保留 ACCEPTED, REJECTED, SUPERSEDED；新增 REVERTED）
- `Decision` interface
- `Constraint` interface
- `TaskRecord` interface
- `SessionState` interface

新增枚举：
```typescript
enum FactConfidence { CERTAIN = 'certain', INFERRED = 'inferred', UNCERTAIN = 'uncertain' }
enum TaskStatus { PLANNED = 'planned', IN_PROGRESS = 'in_progress', BLOCKED = 'blocked', DONE = 'done', ABANDONED = 'abandoned' }
```

新增接口：
```typescript
interface KnowledgeFact {
  key: string; value: any; category: string;
  confidence: FactConfidence; sourceTurn: number;
  linkedSkeleton?: string;
}

interface CodeAnchor {
  filePath: string; lineStart: number; lineEnd: number;
  symbolName: string; skeletonPath?: string;
  action: string; turn: number; note: string;
}

interface ErrorMemory {
  approach: string; failureReason: string;
  turn: number; relatedFiles: string[];
}
```

扩展 SessionState（新增字段，旧字段保留）：
```typescript
interface SessionState {
  // 保留原有
  primaryGoal: string;
  decisions: Decision[];
  constraints: Constraint[];
  tasks: TaskRecord[];
  lastUpdatedTurn: number;
  // 新增
  sessionId?: string; goalStatus?: string; totalTurns?: number;
  projectName?: string; projectType?: string; techStack?: string[];
  architectureStyle?: string;
  facts?: KnowledgeFact[];
  codeAnchors?: CodeAnchor[];
  errorMemories?: ErrorMemory[];
  secondaryGoals?: string[];
  preferences?: Record<string, string>;
  rawCharsIngested?: number; compressedChars?: number;
}
```

**验证点**：已有代码仍然能编译运行（新增字段都是 optional）

---

## Phase 1b: 新建 utils.ts

### 文件：`src/context/compression/utils.ts` — 新建

```typescript
// 分词 + Jaccard 相似度
function similarity(a: string, b: string): number
  // 英文：按 /[a-z0-9]+/ 提取，转小写
  // 中文：每个汉字独立 token
  // Jaccard = |A∩B| / |A∪B|

// 阈值常量
const SIMILARITY = { CONSTRAINT_MERGE: 0.7, ERROR_MERGE: 0.6, TASK_MATCH: 0.3 }

// 字符串工具
function toVarName(s: string): string     // 转合法 Python 变量名
function escape(s: string): string        // 转义用于 Python 字符串
function stripCodeBlocks(text: string): string  // 剥离 ```...``` 代码块
function makeId(prefix: string, content: string, turn: number): string

// 文件工具
function atomicWrite(path: string, content: string): void  // tmp + rename
```

---

## Phase 2a: 新增 GoalDetector + FactDetector + MasterExtractor

### 文件：`extractors.ts` — 扩展

保留已有函数：
- `extractFromTurn(text, role, turn): ExtractionResult`（扁平函数，标记 @deprecated）

新增类检测器（与旧函数并行存在）：
```typescript
class GoalDetector {
  detect(text, role, turn, currentGoal): string | null
  // GOAL_PATTERNS: 我想/我需要/goal is/please help
  // GOAL_CHANGE_PATTERNS: 改为/变成/change to/switch to
  // 仅 role=user，仅前3轮或无目标时检测
}

class FactDetector {
  detect(text, role, turn): KnowledgeFact[]
  // FACT_PATTERNS 按 category: database, language, framework, api_url, version
  // user → CERTAIN, assistant → INFERRED
}

class MasterExtractor {
  extract(text, role, turn, currentState): ExtractionResult
  // 第一步：stripCodeBlocks(text)
  // 按优先级调用：Goal → Decision → Constraint → Fact → Progress → Anchor → Error
}
```

---

## Phase 2b: 重构 DecisionDetector + ConstraintDetector

### 文件：`extractors.ts` — 扩展

```typescript
class DecisionDetector {
  detect(text, role, turn): Decision[]
  // user 消息：ACCEPTED / REJECTED 检测（保留已有模式 + 新增 REVERTED）
  // assistant 消息：PROPOSED 检测（新增）
  //   "I suggest/recommend/propose using X"
  //   "we could/should/can use X"
  // _inferTopic(): 关键词映射到 topic
  // _extractReason(): 提取 "因为/because" 后的原因
}

class ConstraintDetector {
  detect(text, role, turn): Constraint[]
  // 仅 role=user
  // _categorizeConstraint(): technology / architecture / style / general
  // _extractReason(): 提取约束原因
}
```

---

## Phase 2c: 新增 AnchorDetector + ErrorMemoryDetector

### 文件：`extractors.ts` — 扩展

```typescript
class AnchorDetector {
  constructor(skeletonIndex?: Map<string, string>)
  detect(text, role, turn): CodeAnchor[]
  // FILE_PATH_PATTERN: 匹配 src/foo/bar.ts:42
  // AGENT_ACTION_PATTERNS: "I read/modified/created file X"
  // _findSkeletonPath(): 关联 __index__.py 的 SYMBOL_MAP
  // _deduplicate(): 同文件保留最高优先级操作
}

class ErrorMemoryDetector {
  detect(text, role, turn): ErrorMemory[]
  // FAILURE_PATTERNS: "doesn't work"/"失败"/"不行"
  // ERROR_STACK_PATTERN: Error/Exception/Traceback
  // _extractFailureReason(): 提取 "because/the issue is"
  // _extractRelatedFiles(): 关联的文件路径
}
```

**验证点**：每个检测器独立单测通过

---

## Phase 3: 新建状态合并器

### 文件：`src/context/compression/merger.ts` — 新建

```typescript
class StateMerger {
  merge(state: SessionState, extraction: ExtractionResult, turn: number): SessionState

  // 细粒度合并
  _mergeDecision(state, newDecision)     // topic 相同 → SUPERSEDED 覆盖
  _mergeConstraint(state, newConstraint) // 相似度 >0.7 合并，hard 覆盖 soft
  _mergeFact(state, newFact)             // 同 key 覆盖，CERTAIN > INFERRED > UNCERTAIN
  _mergeTask(state, taskUpdate, turn)    // Jaccard 模糊匹配 + action 分发
  _mergeAnchor(state, newAnchor)         // 同文件更新
  _mergeError(state, newError)           // 相似度 >0.6 合并，永不自动删除

  // 衰减与清理
  _decayAndEvict(state, turn)
  // SUPERSEDED >20 轮删除
  // UNCERTAIN 事实 >15 轮删除
  // DONE/ABANDONED >30 轮删除
  // 非活跃约束 >20 轮删除
  // 超容量按优先级淘汰

  // 辅助
  _findMatchingTask(state, description): TaskRecord | null  // Jaccard > 0.3
}

// 容量常量
const MAX = { DECISIONS: 30, CONSTRAINTS: 20, FACTS: 50, TASKS: 15, ANCHORS: 20, ERRORS: 10 }
```

**验证点**：20+ 边界场景测试

---

## Phase 4: 重构序列化器

### 文件：`serializer.ts` — 扩展

保留已有函数：
- `serializeToPython(state): string`（标记 @deprecated）
- `createEmptySessionState()`

新增类（序列化函数在 serializer 中，不在 model 上）：
```typescript
class StateSerializer {
  serialize(state: SessionState): string
  // 分段输出：
  // 1. Header — 时间戳、轮次、压缩比、AI 指令
  // 2. Goal — 目标 + 状态 + 次要目标
  // 3. ProjectContext — 项目名/类型/技术栈/架构
  // 4. Decisions — 按 ACCEPTED / REJECTED / PROPOSED 分组
  // 5. Constraints — 按 Hard / Soft 分组
  // 6. Knowledge — 按 category 分组
  // 7. Tasks — 活跃 + 最近完成
  // 8. CodeAnchors — 按操作优先级排序
  // 9. ErrorMemory — 失败方案列表
  // 10. Preferences — 用户偏好

  save(state, outputPath): void   // 原子写入，更新 compressedChars
}

// 序列化函数（独立，不在 model 上）
function decisionToPythonLine(d: Decision): string
function constraintToPythonLine(c: Constraint): string
function factToPythonLine(f: KnowledgeFact): string
function anchorToPythonLine(a: CodeAnchor): string
function errorToPythonLine(e: ErrorMemory): string
function taskToPythonBlock(t: TaskRecord, indent: number): string[]
```

**验证点**：输出的 Python 文件通过 `python3 -c "import ast; ast.parse(...)")` 语法检查

---

## Phase 5: 新建主引擎

### 文件：`src/context/compression/engine.ts` — 新建

```typescript
class ContextCompressorEngine {
  constructor(opts: {
    outputDir?: string       // default: ".claude/context"
    skeletonIndex?: Map<string, string>
    autoSave?: boolean       // default: true
    saveEveryNTurns?: number // default: 1
    debug?: boolean
  })

  // 核心
  ingest(role: string, content: string, turn: number): SessionState
  ingestBatch(messages: {role, content, turn}[]): SessionState
  save(): void
  getStats(): CompressionStats
  reset(): void

  // 持久化（双文件）
  private outputPythonPath: string  // .claude/context/session_state.py（AI 消费）
  private outputJsonPath: string    // .claude/context/session_state.json（程序恢复）
  private loadExistingState(): void // 优先 JSON，降级 Python 正则

  // 错误处理：所有调用包 try/catch，失败静默降级
  ingest(...) {
    try { /* 提取 + 合并 + 保存 */ }
    catch (e) { console.error('[Compressor]', e); /* 不 throw */ }
    return this.state;
  }
}
```

### 更新 `index.ts` — 导出新模块

```typescript
export { StateMerger } from './merger.js'
export { ContextCompressorEngine } from './engine.js'
export { StateSerializer } from './serializer.js'
export { MasterExtractor, GoalDetector, FactDetector, ... } from './extractors.js'
export { similarity, SIMILARITY_THRESHOLDS, stripCodeBlocks } from './utils.js'
```

---

## Phase 6: 触发机制与集成

### 自动触发（对话 hook）
- 每轮 Agent 回复完成后自动调用 `engine.ingest()`
- 在对话主循环中注册 post-turn hook

### 命令触发
- `/compress` — 手动触发当前对话压缩
- `/compress-status` — 查看压缩统计（轮次、压缩比、各槽位计数）

### 被动加载
- 每次新对话开始时，读取 `.claude/context/session_state.py` 注入 system prompt
- 在 prompt 构建流程中加注入点

---

## Phase 0.5: 测试基础设施

### 文件：`src/context/compression/__tests__/` — 新建

```
models.test.ts        — 接口完整性、枚举值验证
extractors.test.ts    — 每种检测器的正例/反例
  - "不要用 Axios" → Constraint 提取
  - "用 PostgreSQL 吧" → Decision ACCEPTED
  - Agent 建议 X 未确认 → PROPOSED
  - 包含代码块的消息 → 代码块内关键词不误提取
merger.test.ts        — 20+ 边界场景
  - 同 topic 决策更新 3 次 → 只保留最新 ACCEPTED
  - 超容量 → 低优先级正确淘汰
  - UNCERTAIN 事实衰减
serializer.test.ts    — Python 输出语法合法性
engine.test.ts        — 端到端：10 轮对话 → session_state.py
```

---

## 文件变更清单（修正版）

| 文件 | 操作 | 说明 |
|---|---|---|
| `models.ts` | **扩展** | 保留已有类型，新增枚举和接口，扩展 SessionState |
| `utils.ts` | **新建** | similarity, toVarName, escape, stripCodeBlocks, atomicWrite |
| `extractors.ts` | **扩展** | 保留旧函数 @deprecated，新增 class 检测器 |
| `merger.ts` | **新建** | 状态合并器 + 衰减清理 |
| `serializer.ts` | **扩展** | 保留旧函数 @deprecated，新增 StateSerializer 类 |
| `engine.ts` | **新建** | 主引擎 + 双文件持久化 + 静默降级 |
| `index.ts` | **更新** | 导出所有新模块 |
| `__tests__/*.test.ts` | **新建** | 每模块测试 |

---

## 执行顺序

```
Phase 1a → models.ts 扩展（新增枚举、接口、扩展 SessionState）
Phase 1b → utils.ts 新建
           ↓ 验证：编译通过，已有代码无影响

Phase 2a → GoalDetector + FactDetector + MasterExtractor
Phase 2b → DecisionDetector + ConstraintDetector（重构）
Phase 2c → AnchorDetector + ErrorMemoryDetector
           ↓ 验证：每个检测器单测通过

Phase 3  → StateMerger
           ↓ 验证：20+ merge 场景测试通过

Phase 4  → StateSerializer 重构
           ↓ 验证：Python 输出语法合法

Phase 5  → ContextCompressorEngine + 双文件持久化
           ↓ 验证：端到端测试（10 轮对话 → session_state.py + .json）

Phase 6  → hook 注入 + /compress 命令
           ↓ 验证：实际对话中观察 session_state.py 变化
```
