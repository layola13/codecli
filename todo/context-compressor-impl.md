# Context 压缩器实现文档

## 一、实现概述

在 `src/context/compression/` 目录下实现了完整的 Context 压缩引擎，将原始对话流压缩为结构化的 Python 状态文件（`session_state.py`），供 AI 在后续对话中读取。

### 文件清单

| 文件 | 行数 | 职责 |
|---|---|---|
| `models.ts` | 160 | 数据模型：枚举、接口、SessionState |
| `utils.ts` | 110 | 工具函数：相似度、转义、分词、原子写入 |
| `extractors.ts` | 470 | 规则提取器：7 个检测器类 |
| `merger.ts` | 310 | 状态合并器：增量合并 + 衰减清理 |
| `serializer.ts` | 310 | Python 序列化器：10 段结构化输出 |
| `engine.ts` | 220 | 主引擎：编排提取→合并→持久化 |
| `index.ts` | 50 | Barrel 导出 |

总计约 **1630 行**新代码。

---

## 二、数据模型设计（models.ts）

### 枚举

```typescript
enum DecisionStatus { PROPOSED, ACCEPTED, REJECTED, SUPERSEDED, REVERTED }
enum FactConfidence { CERTAIN, INFERRED, UNCERTAIN }
enum TaskStatus     { PLANNED, IN_PROGRESS, BLOCKED, DONE, ABANDONED }
```

### 接口（全部纯数据，无方法）

| 接口 | 用途 | 关键字段 |
|---|---|---|
| `Decision` | 决策点 | topic, choice, status, alternativesRejected, supersedes |
| `Constraint` | 约束条件 | category, rule, severity(hard/soft), isActive |
| `TaskRecord` | 任务记录 | description, status, subtasks, completedSubtasks, blockers |
| `KnowledgeFact` | 知识事实 | key, value, confidence, linkedSkeleton |
| `CodeAnchor` | 代码锚点 | filePath, lineStart/End, action, skeletonPath |
| `ErrorMemory` | 错误记忆 | approach, failureReason, relatedFiles |
| `ExtractionResult` | 单轮提取结果 | decisions[], constraints[], facts[], taskUpdates[], ... |
| `SessionState` | 完整会话状态 | 包含以上所有槽位 + 元数据 + 压缩指标 |

**设计决策：** 所有序列化逻辑放在 `serializer.ts`，不在接口上定义 `toPythonLine()` 方法。这样模型和输出格式解耦，以后换输出格式（Markdown、YAML）不用改模型。

### SessionState 向后兼容

保留原有字段（`primaryGoal`, `decisions`, `constraints`, `tasks`, `lastUpdatedTurn`），新增字段全部 `optional`：

```typescript
interface SessionState {
  // 原有（必有）
  primaryGoal: string
  decisions: Decision[]
  constraints: Constraint[]
  tasks: TaskRecord[]
  lastUpdatedTurn: number

  // 新增（optional，向后兼容）
  sessionId?: string
  facts?: KnowledgeFact[]
  codeAnchors?: CodeAnchor[]
  errorMemories?: ErrorMemory[]
  secondaryGoals?: string[]
  // ... 元数据、项目上下文、压缩指标
}
```

---

## 三、工具函数（utils.ts）

### similarity(a, b): number

Jaccard 相似度，支持中英文混合：

```typescript
function tokenize(s: string): Set<string> {
  // 英文: /[a-z0-9]+/ 提取，转小写
  // 中文: 每个汉字独立 token (\u4e00-\u9fff)
}
// Jaccard = |A ∩ B| / |A ∪ B|
```

### 阈值常量

```typescript
const SIMILARITY = {
  CONSTRAINT_MERGE: 0.7,  // 约束合并阈值
  ERROR_MERGE: 0.6,       // 错误合并阈值
  TASK_MATCH: 0.3,        // 任务匹配阈值
}
```

### stripCodeBlocks(text): string

剥离 ```...``` 代码块，替换为 `[CODE_BLOCK]`。所有检测器在 `MasterExtractor.extract()` 中先对文本做此处理，防止代码中的关键词被误提取为决策/约束。

### 其他工具

- `toVarName(s)` — 转合法 Python 变量名
- `escape(s)` — 转义用于 Python 字符串（截断至 150 字符）
- `makeId(prefix, content, turn)` — 稳定哈希 ID
- `atomicWrite(path, content)` — tmp + rename 原子写入

---

## 四、规则提取器（extractors.ts）

### 架构

7 个独立的检测器类，由 `MasterExtractor` 统一协调：

```
MasterExtractor.extract(text, role, turn, currentState)
  │
  ├─ 1. stripCodeBlocks(text) → cleanText
  ├─ 2. GoalDetector.detect(cleanText, role, turn, currentGoal)
  ├─ 3. DecisionDetector.detect(cleanText, role, turn)
  ├─ 4. ConstraintDetector.detect(cleanText, role, turn)
  ├─ 5. FactDetector.detect(cleanText, role, turn)
  ├─ 6. ProgressDetector.detect(cleanText, role, turn)
  ├─ 7. AnchorDetector.detect(text, role, turn)       ← 用原始文本
  └─ 8. ErrorMemoryDetector.detect(cleanText, role, turn)
```

注意：`AnchorDetector` 使用原始文本（非 strip 后的），因为文件路径检测不需要剥离代码块。

### DecisionDetector

| 消息来源 | 检测模式 | 产出状态 |
|---|---|---|
| user | "就用 X" / "Go with X" | ACCEPTED |
| user | "不要用 X" / "Don't use X" | REJECTED |
| assistant | "I suggest using X" | PROPOSED |

PROPOSED 的决策只有用户后续确认才升级为 ACCEPTED。

**主题推断（inferTopic）：** 通过关键词映射到 `database_choice`、`http_client_choice` 等标准化 topic。

### ConstraintDetector

仅从 user 消息提取：
- **硬约束**：必须/一定要/must → `severity: hard`
- **软约束**：尽量/优先/prefer → `severity: soft`
- **禁止约束**：不允许/禁止/must not → 加 `FORBIDDEN:` 前缀

自动分类（technology / architecture / style）。

### FactDetector

按 category 检测事实性信息：database, language, framework, api_url, version。
- user 明确陈述 → `CERTAIN`
- assistant 推断 → `INFERRED`

### AnchorDetector

接收 `skeletonIndex`（`__index__.py` 的 SYMBOL_MAP），将文件路径关联到骨架路径：
- 用户提及 `src/auth/service.ts` → 找到对应的 `skeleton/src/auth/service.py`
- Agent 操作模式："I read/modified/created file X"

### ErrorMemoryDetector

检测失败信号："doesn't work" / "失败" / Error 堆栈。

### ProgressDetector

检测完成/阻塞/新任务信号，返回 `TaskUpdate[]`。

---

## 五、状态合并器（merger.ts）

### 合并逻辑

#### Decision 合并

```
Case 1: 同 topic 无活跃决策 → 直接添加
Case 2: 新 ACCEPTED + 旧 ACCEPTED → 旧标记 SUPERSEDED，合并 rejected alternatives
Case 3: 新 REJECTED + 旧 PROPOSED → 旧标记 REJECTED
Case 4: 新 PROPOSED + 旧 ACCEPTED → 忽略（用户已确认）
```

#### Constraint 合并

- 相似度 > 0.7 时合并（同一 category）
- hard 覆盖 soft
- 新规则覆盖旧规则

#### Fact 合并

- 同 key 直接覆盖
- CERTAIN > INFERRED > UNCERTAIN（低置信度不能覆盖高置信度）
- 同步更新 `techStack`

#### Task 合并

- `complete` → 模糊匹配（Jaccard > 0.3）找到任务，加到 `completedSubtasks`
- `block` → 标记 BLOCKED，记录 blocker
- `create` → 检查是否已有相似任务，避免重复

#### Anchor 合并

- 同文件保留操作优先级最高的（created > modified > read > referenced）

#### Error 合并

- 相似度 > 0.6 时合并，保留更详细的 `failureReason`
- **永不自动删除**

### 衰减与清理（decayAndEvict）

| 槽位 | 容量上限 | 衰减规则 |
|---|---|---|
| Decisions | 30 | SUPERSEDED >20 轮删除，超容量按 ACCEPTED > REJECTED > PROPOSED 排序 |
| Constraints | 20 | 非活跃 >20 轮删除 |
| Facts | 50 | UNCERTAIN >15 轮删除，超容量按 CERTAIN > INFERRED > UNCERTAIN 排序 |
| Tasks | 15 | DONE/ABANDONED >30 轮删除，超容量按 IN_PROGRESS > BLOCKED > PLANNED 排序 |
| Anchors | 20 | 保留最新的 20 个（按 turn 倒序） |
| Errors | 10 | 仅容量控制，不衰减 |

---

## 六、Python 序列化器（serializer.ts）

### 输出结构（10 段）

```python
"""
══════════════════════════════════════════════════════════════
SESSION CONTEXT STATE (Auto-maintained)
Last updated: 2026-04-01 12:34:56
Turns processed: 42
Raw input: 85,000 chars
Compressed to: 3,200 chars (ratio: 26.6:1)

AI INSTRUCTIONS:
- Read Session.goal FIRST
- Check Session.Constraints BEFORE writing code
- ...
══════════════════════════════════════════════════════════════
"""

class Session:
    # ═══ PRIMARY GOAL ═══
    goal = "实现用户认证系统"
    goal_status = "in_progress"

    # ═══ PROJECT CONTEXT ═══
    project = "my-app"
    project_type = "web"
    tech_stack = ["TypeScript", "React", "PostgreSQL"]

    # ═══ DECISIONS ═══
    class Decisions:
        # ── Confirmed (MUST follow) ──
        http_client_choice = "native fetch"  # turn 5 | rejected: Axios

        # ── Rejected (DO NOT suggest again) ──
        # ✗ database_choice: "MongoDB"  # reason: 项目规定用 PostgreSQL

        # ── Proposed (awaiting confirmation) ──
        state_management_choice = "zustand"  # turn 38

    # ═══ CONSTRAINTS ═══
    class Constraints:
        # ── Hard (MUST obey) ──
        technology_con_1a2b3c = "不要使用 Axios"  # MUST follow
        # ── Soft (prefer to follow) ──
        style_con_4d5e6f = "尽量使用函数式组件"  # Recommended

    # ═══ KNOWLEDGE BASE ═══
    class Knowledge:
        # ── tech_stack ──
        database = "PostgreSQL"  # ✓ turn 3
        framework = "React"  # ✓ turn 1

    # ═══ TASK PROGRESS ═══
    class Tasks:
        # ── Active ──
        class task_auth_module:
            description = "实现认证模块"
            status = "in_progress"
            completed = ["登录页面"]
            remaining = ["JWT 验证", "权限中间件"]

        # ── Recently Completed ──
        # ✓ 数据库 schema 设计 (turn 8)

    # ═══ CODE ANCHORS ═══
    code_anchors = [
        ("src/auth/service.ts:42-80", action=modified, skeleton=skeleton/src/auth/service.py),
    ]

    # ═══ ERROR MEMORY ═══
    failed_approaches = [
        "尝试使用 Webpack 5 的 Module Federation"  # ✗ 与 Next.js 13 App Router 不兼容 (turn 15)
    ]
```

### 序列化函数（独立函数，不在 model 上）

```typescript
function decisionToPythonLine(d: Decision): string
function constraintToPythonLine(c: Constraint): string
function factToPythonLine(f: KnowledgeFact): string
function anchorToPythonLine(a: CodeAnchor): string
function errorToPythonLine(e: ErrorMemory): string
function taskToPythonBlock(t: TaskRecord, indent: number): string[]
```

所有 `toPython*` 函数集中在 `serializer.ts`，模型接口保持纯数据。

---

## 七、主引擎（engine.ts）

### ContextCompressorEngine

```typescript
const engine = new ContextCompressorEngine({
  outputDir: '.claude/context',       // 默认
  skeletonIndex: SYMBOL_MAP,           // 可选，关联 __index__.py
  autoSave: true,                      // 每轮自动保存
  saveEveryNTurns: 1,                  // 每 N 轮保存一次
  debug: false,                        // 调试模式
})
```

### API

| 方法 | 说明 |
|---|---|
| `ingest(role, content, turn)` | 摄入一轮对话，返回更新后的状态 |
| `ingestBatch(messages[])` | 批量摄入（禁用自动保存，结束后保存一次） |
| `save()` | 写入磁盘 |
| `getStats()` | 获取压缩统计 |
| `getPython()` | 获取 Python 字符串（不保存） |
| `reset()` | 重置所有状态 |

### 双文件持久化

```
.claude/context/
├── session_state.py    ← AI 消费（人类可读的 Python）
└── session_state.json  ← 程序恢复（精确 JSON 反序列化）
```

加载优先级：JSON > Python 正则降级。

### 错误处理

所有调用包在 `try/catch` 中，失败时：
- 记录错误到 console.error（debug 模式）
- 返回上一个有效状态
- **不 throw，不阻塞对话主流程**

---

## 八、与现有系统的集成点

### 1. 与 __index__.py 集成

`AnchorDetector` 接受 `skeletonIndex` 参数（`__index__.py` 的 SYMBOL_MAP），将代码锚点关联到骨架路径：

```typescript
const skeletonIndex = new Map(Object.entries(INDEX_PY.SYMBOL_MAP))
const engine = new ContextCompressorEngine({ skeletonIndex })
```

### 2. 触发机制（待 Phase 6 实现）

| 触发点 | 时机 |
|---|---|
| 自动触发 | 每轮 Agent 回复完成后 |
| 命令触发 | `/compress` 手动压缩 |
| 被动加载 | 新对话开始时读取 session_state.py 注入 system prompt |

---

## 九、遗留的扁平函数（向后兼容）

以下旧函数标记为 `@deprecated` 但保留：

- `extractFromTurn(text, role, turn)` → 内部调用 `MasterExtractor`
- `serializeToPython(state)` → 内部调用 `StateSerializer`
- `createEmptySessionState()` → 从 `models.ts` 移到 `serializer.ts` 再导出

等 engine.ts 稳定后可清理。

---

## 十、待后续实现

| 项目 | 说明 |
|---|---|
| `/compress` 命令 | 在 `src/commands/` 中注册 |
| 对话 hook 注入 | 在主循环中注册 post-turn hook |
| LLM 增强层 | 可选，用轻量 LLM 增强规则提取精度 |
| 单元测试 | `__tests__/` 目录，每个检测器的正例/反例 |
| session_history.py | 历史归档文件 |
| session_metrics.py | 诊断指标文件 |
