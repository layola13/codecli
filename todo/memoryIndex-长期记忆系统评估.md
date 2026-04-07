# memoryIndex 长期记忆系统评估

## 结论

**客观评价：这个 `memoryIndex` 已经不是“概念性原型”，而是一个相当完整、能落地工作的长期记忆索引机制；但它还没有达到“长期记忆系统已经完善”的程度，更准确地说是：**

**“索引层和接入层已经比较完整，语义层和持续维护层还不够完善。”**

综合判断：

- **完成度：7.5/10**
- **工程接入度：8.5/10**
- **长期记忆智能性：6.5/10**
- **综合评价：偏强，可用，但还称不上完善。**

---

## 依据

### 1. 已具备独立命令入口，不是临时脚本

- `src/commands/memory-index/index.ts:3` 注册了 `/memory-index`
- `src/commands/memory-index/memoryIndexCommand.ts:114` 是主入口

说明这已经是系统级能力，而不是散落的辅助工具。

### 2. 数据源选择正确，基础较扎实

`src/commands/memory-index/memoryIndexCommand.ts:86` 明确说明输入来自：

- raw transcript JSONL
- `~/.claude/file-history` snapshots

同时明确排除了：

- `.claude/context/session_state.py`
- `.claude/context/session_history.py`
- `.claude/context/session_metrics.py`

这些压缩摘要不被视为 source of truth。这一设计方向是正确的，因为长期记忆如果建立在压缩摘要上，内容容易漂移。

### 3. 产出的索引工件成体系

从 `src/commands/memory-index/memoryIndexCommand.ts:98-110` 可见，系统会生成：

- `.memory_index/index/summary.md`
- `.memory_index/__index__.py`
- `.memory_index/index/events.jsonl`
- `.memory_index/index/sessions.jsonl`
- `.memory_index/index/edges.jsonl`
- `.memory_index/index/transcripts.jsonl`
- `.memory_index/index/architecture.dot`
- `.memory_index/index/sessions.dot`

这说明它不是单一摘要，而是一整套可导航、可追溯的长期历史索引。

### 4. 核心长期记忆类型已经覆盖关键部分

`src/memoryIndex/build.ts` 中定义并抽取了：

- `PromptEvent`，见 `src/memoryIndex/build.ts:41`
- `PlanEvent`，见 `src/memoryIndex/build.ts:57`
- `CodeEditEvent`，见 `src/memoryIndex/build.ts:87`

也就是：

- 用户说了什么
- 做过什么计划
- 改了哪些文件与哪些行段

这三类正是长期协作记忆中最有价值的结构化信息。

### 5. 已真正接入系统提示与工具使用规范

这项能力已被接入多个关键位置：

- `src/constants/prompts.ts:372-414`
- `src/tools/SkillTool/prompt.ts:196`
- `src/tools/FileReadTool/prompt.ts:46`
- `src/tools/BashTool/prompt.ts:14`
- `src/context.ts:198-205`
- `src/utils/messages.ts:3738-3741`

这意味着它不是“实现了但没人用”，而是已经被系统纳入模型行为引导：当任务涉及历史、先前请求、旧计划、早期改动时，应优先使用 `memory-index`。

### 6. 具备技能生成与运行时刷新闭环

`src/memoryIndex/skillWriter.ts:89-147` 会生成：

- `.claude/skills/memory-index/SKILL.md`
- `.codex/skills/memory-index/SKILL.md`
- `.opencode/skills/memory-index/SKILL.md`

随后 `src/commands/memory-index/memoryIndexCommand.ts:193-199` 会刷新 skill runtime。

这说明索引构建完成后，系统可立即获得相应使用说明，不需要额外手工接线。

### 7. 当前分支下基本测试通过

已执行：

```bash
bun test src/memoryIndex/build.test.ts src/commands/memory-index/memoryIndexCommand.test.ts
```

结果：

- **2 pass**
- **0 fail**

相关测试文件：

- `src/memoryIndex/build.test.ts:8-233`
- `src/commands/memory-index/memoryIndexCommand.test.ts:6-63`

说明至少在当前分支下，它是可执行、可验证的，不是空壳实现。

---

## 不足

### 1. 它更像“历史索引系统”，还不是“成熟的长期记忆推理系统”

从 `src/memoryIndex/build.ts` 的实现来看，目前能力核心仍是：

- transcript discovery
- event extraction
- snapshot diff
- artifact writing

也就是说它擅长把历史整理成可检索结构，而不是自动形成高层稳定记忆。

它目前更像：

> durable memory map

而不是：

> mature long-term memory model

### 2. 语义抽象层次仍然偏浅

当前抽取的是：

- prompt 原文
- plan 内容
- code edit 文件及 lineRanges

这些足够支持“回看历史”，但距离真正长期记忆还差：

- 用户偏好抽取与归类
- 约束条件归纳
- 决策原因总结
- 跨 session 聚合
- 冲突记忆识别
- 过期记忆衰减
- 同一主题演进链条的稳定归纳

所以它现在更擅长回答“以前发生了什么”，不够擅长回答“长期稳定偏好与结论是什么”。

### 3. stale 问题还主要依赖人工重跑

`src/memoryIndex/skillWriter.ts:84` 明确写到：

- 如果 memory index stale，就 rerun `/memory-index`

这说明当前 freshness 维护主要依赖手工重建，而不是自动增量维护或自动 stale 检测。

对长期记忆系统来说，这是一项明显短板。

### 4. 很多约束仍是 prompt 级，而不是强运行时路由

虽然接入已经很广，但很多行为仍依赖模型遵守规则：

- 碰到历史问题先查 `memory-index`
- 不要把 sessionState 当作真相
- 不要直接去 raw transcript

这属于软约束。若要称为“完善”，通常还应看到更强的运行时策略，例如：

- 自动路由到 memory-index
- 对 transcript 直读施加更严格 gating
- stale 自动告警或自动刷新
- 更明确的 memory-index / code-index 任务分流

### 5. 测试覆盖面仍偏基础

现有测试证明：

- 能构建
- 能产出关键索引
- 命令能工作

但还不足以证明在复杂长期历史下系统仍稳定，例如：

- 多 session 聚合
- sidechain / subagent 关联
- transcript 破损与乱序恢复
- 大规模历史性能
- stale 场景行为
- plan 与 edit 的精确关联
- 更多复杂 content block 形态

所以现阶段测试更多证明“能用”，还不足以证明“很成熟”。

---

## 最终判断

### 可以确认的部分

`memoryIndex` 已经具备：

- 可工作的长期历史索引能力
- 清晰的数据源边界
- 成体系的产物结构
- 与系统 prompt / skill / tool 的深度接入
- 基本可验证性

### 不能过度宣称的部分

它**还不能被称为“完善的长期记忆系统”**，因为：

- 高层语义抽象不够
- freshness 维护不够自动化
- 冲突与时效治理不足
- 更多是 durable index，而非 mature memory intelligence

---

## 一句话结论

**`memoryIndex` 目前是一个“完成度较高的长期记忆索引系统”，但还不是一个“已经完善的长期记忆系统”。它把长期记忆的底座搭起来了，而且搭得不错；但距离真正完善，还差语义抽象、时效治理与自动维护。**

---

## 评测者视角的打分 Rubric

如果站在评测者视角，我会把长期记忆系统拆成 6 个维度来打分。每项 10 分，总分取加权平均。这样比单纯说“好不好”更客观。

### 1. 数据源真实性与可追溯性（权重高）

重点看：

- 是否基于原始记录，而不是压缩摘要或二手总结
- 是否能回溯到原始 transcript / plan / code edit
- 是否明确 source of truth
- 是否能区分真实记录与 lossy summary

`memoryIndex` 在这一项表现较强，因为它明确依赖 raw transcript JSONL 和 `~/.claude/file-history` snapshots，并反复声明压缩 sessionState 不是 source of truth。

**建议评分：9/10**

### 2. 结构化程度与可检索性

重点看：

- 是否只有一份大摘要，还是有分层结构
- 是否同时支持 summary、index、event、edge、graph 几种视角
- 是否便于模型先快速定位，再深入追溯

`memoryIndex` 有 `summary.md`、`__index__.py`、`events.jsonl`、`sessions.jsonl`、`edges.jsonl`、dot 图谱，分层比较清晰。

**建议评分：8.5/10**

### 3. 系统集成度与使用闭环

重点看：

- 是否只是“可以生成”，还是系统会主动引导使用
- 是否接入 prompt、skill、tool deferral、system reminder
- 是否有生成 skill + refresh runtime 的闭环

这一项是 `memoryIndex` 的强项。它不只是生成索引，还已经接入 `src/constants/prompts.ts:372-414`、`src/tools/SkillTool/prompt.ts:196`、`src/tools/FileReadTool/prompt.ts:46`、`src/tools/BashTool/prompt.ts:14`、`src/context.ts:198-205` 和 `src/utils/messages.ts:3738-3741`。

**建议评分：9/10**

### 4. 语义抽象与长期记忆智能性

重点看：

- 是否只记录“发生了什么”
- 还是能抽象“偏好、约束、决策原因、长期共识、变化趋势”
- 是否能进行跨 session 聚合与冲突处理

这是当前最明显的弱项。现在更多是 prompt / plan / code edit 索引，而不是高层语义记忆系统。

**建议评分：6/10**

### 5. freshness 与生命周期治理

重点看：

- 是否支持自动增量更新
- 是否有 stale detection
- 是否有过期策略、冲突治理、重建策略
- 是否能避免模型用旧记忆做新判断

当前实现对 stale 的处理仍主要依赖 rerun `/memory-index`，这说明治理机制存在，但自动化程度不高。

**建议评分：5.5/10**

### 6. 鲁棒性与验证覆盖

重点看：

- 是否覆盖多 session、sidechain、损坏 transcript、复杂 content block
- 是否对 plan/edit 关联、性能、边界场景有测试
- 是否能证明在真实复杂历史下稳定工作

当前已有基本测试，但覆盖面仍偏基础。

**建议评分：6.5/10**

### Rubric 汇总结论

如果按评测者视角给一个更结构化的结论，大致会是：

| 维度 | 评分 | 结论 |
| --- | ---: | --- |
| 数据源真实性与可追溯性 | 9.0 | 很强 |
| 结构化程度与可检索性 | 8.5 | 很强 |
| 系统集成度与使用闭环 | 9.0 | 很强 |
| 语义抽象与长期记忆智能性 | 6.0 | 明显不足 |
| freshness 与生命周期治理 | 5.5 | 偏弱 |
| 鲁棒性与验证覆盖 | 6.5 | 中等 |

**综合观感：底层基础设施很强，上层长期记忆智能性还不够成熟。**

---

## 这个实现最强的 3 点

### 1. 数据源选型正确，而且有明确真相边界

这是最重要的一点。`memoryIndex` 没有偷懒去依赖压缩 session 摘要，而是明确以：

- raw transcript JSONL
- `~/.claude/file-history` snapshots

作为事实来源，并通过 `src/context.ts:198-205` 和 `src/utils/memoryIndexGuidance.ts:5-20` 明确压缩摘要不是 source of truth。

这使它具备了“长期记忆可追溯”的根基。

### 2. 系统接入做得非常完整，不是孤立功能

很多类似实现的问题是“能生成，但模型不用”。

`memoryIndex` 的优点在于它已经把自己接进了：

- system prompt
- skill prompt
- read tool guidance
- bash tool guidance
- skill listing reminder

这让它从“文件产物”变成了“系统性工作流的一部分”。这一点是工程成熟度的核心体现。

### 3. 记忆结构分层清晰，既适合预览也适合追溯

它不是把所有信息揉成一个 summary，而是分成：

- 人类快速浏览：`summary.md`
- 模型导航：`__index__.py`
- durable source：`events.jsonl`
- session 汇总：`sessions.jsonl`
- 关系图：`edges.jsonl` / `.dot`

这种分层非常合理，兼顾了可读性、可定位性和 source-of-truth 的稳定性。

---

## 这个实现最弱的 3 点

### 1. 缺少更高层的语义抽象

当前系统能较好回答：

- 以前用户说过什么
- 以前做过什么计划
- 改过哪些文件

但还不够稳定地回答：

- 用户长期偏好是什么
- 哪些约束是持续有效的
- 某个决策为何形成共识
- 哪些旧结论已经被新事实推翻

也就是说，它更强于“历史检索”，弱于“长期认知”。

### 2. freshness 和 stale 治理不足

当前 stale 问题主要通过“提醒用户重跑 `/memory-index`”解决。这种方式能用，但不够成熟。

在长期记忆系统里，旧记忆如果不能自动识别和治理，就会成为误导源。现在这部分仍偏手工。

### 3. 测试主要证明“能工作”，还没有充分证明“复杂场景下稳定”

当前测试已经证明：

- 基本事件能被抽取
- 索引能写出
- 命令能运行

但要支撑“长期记忆系统成熟”这个结论，还需要更多复杂历史场景下的验证，例如多 session 聚合、subagent 链路、复杂 content block、异常 transcript、增量更新等。

---

## 如果要把它从 7.5 提到 9 分，最该补哪几项

如果目标不是“小修小补”，而是真正把它从“完成度较高”提升到“接近成熟”，我认为最应该补的是下面 4 组能力。

### 1. 增加高层语义记忆层

这是最重要的一项。

建议在现有 `events.jsonl` 之上，再增加一层从历史中抽象出来的长期语义对象，例如：

- user preference
- stable constraint
- decision rationale
- superseded decision
- recurring topic
- unresolved thread

也就是说，不只保存“原始发生过什么”，还要保存“从这些历史中抽象出的稳定知识是什么”。

这是把系统从 index 升级为 memory 的关键一步。

### 2. 做 stale detection + 增量更新机制

至少应补两类能力：

- 自动识别当前 `.memory_index` 是否落后于最新 transcript / file-history
- 支持增量更新，而不是每次都依赖全量重跑

进一步的话，还可以在 prompt 层注入更明确的 freshness 提示，比如：

- 当前 memory index 构建时间
- 与最新 transcript 的落后程度
- 是否建议自动刷新

只要 freshness 治理到位，可靠性会明显上升。

### 3. 增强 memory-index 与 runtime 的强绑定

现在更多是 prompt 约束。若要冲到 9 分，需要更强的运行时策略，例如：

- 对“历史问题”自动优先路由到 memory-index
- 在读取 transcript 前先检查 memory-index 是否存在且新鲜
- 在 code-index / memory-index 之间建立更稳定的任务分流规则
- 对明显违反流程的 raw transcript 读取增加更强约束

简单说，就是把“建议优先使用”逐步升级为“默认优先使用”。

### 4. 扩大测试矩阵，补复杂历史场景

若要证明它从 7.5 到 9，不只是实现增强，还必须把验证补起来。优先建议补这些测试：

- 多 session 同主题历史聚合
- sidechain / subagent 关联链路
- transcript 损坏、缺行、乱序恢复
- 更复杂的 tool/content block 解析
- stale index 与增量更新场景
- plan 与 code edit 关联精度
- 大项目、多 transcript 下性能边界

没有这类测试，系统即使设计上更强，也很难在评测中拿到更高可信分。

---

## 面向提升到 9 分的优先级建议

如果只能选最关键的三件事，我会按这个顺序推进：

1. **补语义记忆层**：把“历史索引”升级成“长期语义记忆”
2. **补 freshness / stale / incremental update**：解决长期记忆最危险的旧数据问题
3. **补复杂场景测试与 runtime 强约束**：让系统不仅更聪明，而且更可靠

---

## 追加结论

站在评测者视角，这套实现的优点不是“已经像人一样会长期记忆”，而是：

**它已经把长期记忆系统最难替代的基础设施部分做出来了，而且接入得很深。**

它目前的短板也很明确：

**还缺少把历史记录提升为长期稳定知识的那一层能力。**

所以如果继续演进，最值得投入的方向不是继续堆更多索引文件，而是：

- 提升语义抽象
- 提升 freshness 治理
- 提升自动使用与验证能力

---

## 深度分析后的 Todo List

下面这份 todo list 不是泛泛建议，而是基于当前实现形态拆出来的、相对可执行的改进清单。重点是把 `memoryIndex` 从“强索引系统”推进到“更成熟的长期记忆系统”。

我按优先级分成 P0、P1、P2 三层。

### P0：必须优先做，否则上限很难再上去

#### 1. 引入高层语义记忆对象层

目标：在 `events.jsonl` 之上增加一层更稳定的 memory objects，而不只是事件流。

建议新增的对象类型：

- `user_preference`
- `stable_constraint`
- `decision_rationale`
- `superseded_decision`
- `recurring_topic`
- `open_thread`

建议做法：

- 保留当前 `PromptEvent` / `PlanEvent` / `CodeEditEvent` 作为 source layer
- 新增一层 derived layer，例如 `index/memory_objects.jsonl`
- 每个 memory object 必须带回指针，能追溯到对应 eventId / transcript / plan
- 对 memory object 增加 `confidence`、`firstSeenAt`、`lastSeenAt`、`supersededBy` 等字段

为什么必须先做：

- 当前 `buildSessionSummaries(...)` 和 `buildEdges(...)` 仍然是事件级摘要，见 `src/memoryIndex/build.ts:1784-1795`、`src/memoryIndex/build.ts:1120-1174`
- 没有这一层，就始终只能回答“发生了什么”，不能稳定回答“长期有效的知识是什么”

#### 2. 增加 stale detection 和 freshness 元数据

目标：让系统知道 `.memory_index` 什么时候已经落后，而不是只靠人工 rerun `/memory-index`。

建议新增：

- 在 `manifest.json` 中记录：
  - latestTranscriptMtime
  - latestFileHistoryMtime
  - builtFromTranscriptCount
  - builtAt
- 在 runtime 侧增加 freshness 判断函数
- 在 skill / prompt 中注入更明确的 freshness 提示

建议触点：

- `src/memoryIndex/build.ts`
- `src/commands/memory-index/memoryIndexCommand.ts`
- `src/utils/memoryIndexGuidance.ts`
- `src/context.ts`

最低目标：

- 能判断“当前 `.memory_index` 是否比最新 transcript 老”
- 能在模型准备依赖 memory-index 时提示 stale / fresh

#### 3. 增加增量更新能力，而不是只支持重建

目标：让 memory-index 成为可持续使用的基础设施，而不是偶尔全量重跑的工具。

建议方向：

- 只扫描新 transcript 或变更 transcript
- 只重算受影响 session
- 只更新受影响的 memory objects / edges / sessions summaries

当前实现流程是：

- discover
- extract
- diff
- write
- skills

见 `src/memoryIndex/build.ts:1766-1840`

这很清晰，但目前看更偏全量构建。若没有增量机制，规模上去后 freshness 和成本都会变差。

#### 4. 把“建议先用 memory-index”升级为更强的运行时策略

目标：减少模型绕过 memory-index 直接去翻 transcript 的概率。

建议方向：

- 对明确属于 history / prior plans / why changed 的问题，优先挂载 memory-index
- 在调用 Read/Bash 读取 transcript 前，先判断 memory-index 是否存在且 fresh
- 对 memory-index / code-index 的任务分流做更硬的 runtime 约束

当前接入主要体现在 prompt guidance：

- `src/constants/prompts.ts:401-414`
- `src/tools/SkillTool/prompt.ts:192-200`
- `src/tools/FileReadTool/prompt.ts:42-49`
- `src/tools/BashTool/prompt.ts:13-18`

这些已经很好，但仍然偏软。P0 的目标是把它升级成更接近默认行为的 runtime policy。

---

### P1：应尽快补齐，否则系统可靠性仍然有限

#### 5. 强化多 session 聚合能力

目标：让系统不只按 session 汇总，还能按主题、约束、决策聚合。

当前 `buildSessionSummaries(...)` 主要做的是：

- transcript 数量
- prompt/plan/codeEdit 数量
- latest preview
- top files
- agentIds

见 `src/memoryIndex/build.ts:980-1118`

这能形成 session 视图，但还不能形成“跨 session 的长期主题视图”。

建议新增：

- 按主题聚合的 summaries
- 按文件 + 决策原因聚合的 summaries
- recurring thread 视图
- “同一问题被提了几轮、最后落在何处”的聚合对象

#### 6. 改善 prompt → plan → code edit 的链路建模精度

当前已有基本链路：

- `planned`
- `led_to`
- `touches_file`

见 `src/memoryIndex/build.ts:1150-1170`

但现在的关联方式仍比较近似，主要依赖 `lastPrompt` 和 snapshot diff。

建议补：

- 更明确的一对多、多对一链路
- 同一 prompt 触发多轮 plan/edit 的聚合
- 区分“计划存在但未执行”和“计划已部分执行”
- 区分“用户说 done”带来的误关联

这一项会直接影响“为什么改了这段代码”的回答质量。

#### 7. 增强 sidechain / subagent 的长期历史建模

当前实现已经记录：

- `isSidechain`
- `agentId`

见 `src/memoryIndex/build.ts:48-55`、`src/memoryIndex/build.ts:107-113`、`src/memoryIndex/build.ts:523-528`

但从当前结构看，更像“记录了字段”，还不是“真正把子代理历史组织成长期可推理对象”。

建议补：

- 主会话与 sidechain 的显式父子关系
- 子代理结论是否被主会话采纳
- 哪些 edits 来自 sidechain 建议
- sidechain 计划与主计划的映射

这会直接提升多 agent 协作场景下的长期记忆质量。

#### 8. 建立 memory-index 质量指标

目标：让这个系统不只“能跑”，还“可衡量”。

建议追踪：

- stale 率
- memory-index 命中率
- transcript fallback 率
- prompt→plan→edit 关联成功率
- memory object 覆盖率
- stale memory 导致错误引用的回归样本数

没有指标，就很难知道从 7.5 到 9 分到底进步了多少。

---

### P2：中期值得做，会明显提升成熟度

#### 9. 扩充测试矩阵

建议优先新增测试：

- 多 session 同主题历史聚合
- transcript 中混合多种 content block
- malformed JSONL / 空行 / 损坏记录恢复
- sidechain / subagent 历史关系
- stale index 检测
- 增量更新行为
- 大量 transcript 下性能边界
- plan 与 code edit 关联的边界用例

当前测试更偏 happy path，这一步是把“能工作”推进到“可信赖”。

#### 10. 为 memory-index 增加显式 schema 文档与版本演进策略

当前已经有 `artifactVersion`，见 `src/memoryIndex/build.ts:18`、`src/memoryIndex/build.ts:1797-1811`。

这是好信号，但还可以继续补：

- 各 jsonl 文件 schema 的明确约束
- 各字段的兼容性说明
- schema 升级策略
- 旧索引的迁移策略

一旦引入 memory objects、stale metadata、增量更新，这部分会变得很重要。

#### 11. 增加面向模型消费的“问题导向入口”

现在模型消费 memory-index 的入口主要是：

- summary
- `__index__.py`
- events/sessions/edges

建议中期增加更明确的入口产物，例如：

- `decision_index.jsonl`
- `preferences.jsonl`
- `open_threads.jsonl`
- `recently_superseded.jsonl`

这样模型不需要每次从 event graph 重新归纳一遍，会显著提升长期记忆使用效率。

#### 12. 补自动刷新或半自动刷新策略

如果系统未来要真正日常可用，建议至少有一种：

- 启动时发现 stale 后提示刷新
- 在 transcript 增量达到阈值后提示刷新
- 手动 `/memory-index` 之外，提供轻量 refresh 模式

这不是最先要做的，但会显著改善实际体验。

---

## 建议的执行顺序

如果只允许按最现实的路径推进，我建议按下面顺序排期：

### 第一阶段

1. stale detection
2. freshness metadata
3. 扩测试矩阵

这一阶段先解决“能不能安全依赖它”的问题。

### 第二阶段

4. memory objects 派生层
5. prompt→plan→edit 链路增强
6. 多 session / sidechain 聚合增强

这一阶段解决“它能不能真正像长期记忆一样工作”的问题。

### 第三阶段

7. 增量更新
8. runtime 强路由
9. 半自动刷新机制
10. 面向模型的问题导向入口

这一阶段解决“它能不能低成本、稳定地长期运行”的问题。

---

## 最终的简化版 Todo 排名

如果只保留最值钱的 6 条，我会给出下面这个版本：

1. **做 stale detection 与 freshness metadata**
2. **补多场景测试，尤其是多 session / malformed transcript / sidechain**
3. **引入高层 memory objects 层，而不只保留 events**
4. **增强 prompt → plan → code edit 的因果链精度**
5. **做增量更新，降低全量重建依赖**
6. **把 memory-index 从 prompt 建议升级为更强的 runtime 优先路由**

---

## 关于 agent 辅助的说明

理论上这类深度评估确实适合 agent 并行辅助，尤其适合拆成：

- 架构分析 agent
- 测试覆盖 agent
- 运行时接入 agent

但这次两个 agent 在隔离 worktree 中都看不到你当前未提交的 memory-index 实现，因此无法基于最新代码做可信结论。这也说明一个现实问题：当前这套能力很大一部分还处在未提交状态，不利于稳定评估和并行分析。

因此本次 todo list 仍以当前主会话中已直接读取的源码为准。若后续把 memory-index 相关改动提交到可见分支，再让 agent 并行做第二轮深挖，会更高效也更准确。

---

## 基于本轮代码更新的重新评估

这一次不是局部补丁，而是明显的架构升级。相较于前一轮评估，这版实现已经不再只是“事件级索引 + 路由提示”，而是开始形成：

- 事件层：`events.jsonl`
- 语义层：`memory_objects.jsonl`
- 项目级上下文层：project-local transcripts / file-history / Codex sessions
- 压缩图层：conversation graph + incremental append

因此，这次评估结论需要上调。

### 本轮最重要的新增价值

#### 1. 语义层已经真正出现，不再只是事件流

`src/commands/memory-index/memoryIndexCommand.ts:95-108` 已经把 `memory_objects.jsonl` 作为正式输出的一部分。

`src/memoryIndex/build.ts:23-28` 引入了：

- `buildMemoryObjects`
- `countMemoryObjectsByKind`
- `MemoryObject`

而 `src/memoryIndex/memoryObjects.ts:1-58` 定义了明确的长期语义对象类型：

- `user_preference`
- `stable_constraint`
- `decision_rationale`
- `superseded_decision`

这意味着系统已经开始从“历史事件”抽出“长期稳定知识”。这是从 7.5 分向上走的核心原因。

#### 2. 数据源升级为项目级上下文聚合，而不是单一 transcript

`src/utils/projectConversationContext.ts:12-57` 新增了项目级上下文路径能力，覆盖：

- `./.claude/projects/context/transcripts`
- `./.claude/projects/context/file-history`
- `~/.codex/sessions`

而 `src/memoryIndex/build.ts:184-235` 已经把这些纳入 manifest 和 build options。

`src/commands/memory-index/memoryIndexCommand.ts:85-88` 也明确把输入源描述为：

- project transcript context
- project file-history context
- Codex sessions matching this project

这说明 memory-index 已开始从“单一会话索引”走向“项目级长期上下文汇聚”。

#### 3. context compression 开始具备结构图和增量追加能力

`src/context/compression/runtime.ts:10-18` 新增了 `session_graph.py` 输出。

`src/context/compression/runtime.ts:155-176` 已经开始做：

- `loadExistingState()`
- `conversationTurns`
- `lastTurnSignature`
- `canAppendIncrementally`

`src/context/compression/engine.ts:93-110` 会把每轮 turn 转成 `ConversationTurnRecord`。

`src/context/compression/graph.ts:101-206` 则在构建 turn 之间的关系：

- `assistant_response`
- `continues`
- `shared_file`
- `shared_task`
- `shared_constraint`
- `shared_decision`
- `same_topic`

这说明压缩层不再只是“摘要”，而开始向“可追踪的关系图”演进。这对长期记忆系统是非常关键的底座升级。

---

## 本轮测试信号也更强了

这次实现不是只加功能，也同步补了测试：

- `src/memoryIndex/memoryObjects.test.ts`
- `src/memoryIndex/build.test.ts`
- `src/context/compression/runtime.test.ts`
- `src/context/compression/engine.test.ts`

尤其是：

- `src/memoryIndex/memoryObjects.test.ts:4-179` 已经覆盖语义对象抽取
- 过滤 sidechain research prompts
- 过滤 boilerplate/system noise
- 处理 superseded decision 的坏样本
- 区分 durable preference 与 one-off task request

而 `src/memoryIndex/build.test.ts:146-266` 已经开始校验：

- `manifest.memoryObjectCount`
- `memory_objects.jsonl`
- summary 中的 derived semantic layer
- `RECENT_MEMORY_OBJECTS`
- sidechain prompt 不进入语义层
- Codex sessions ingestion

相比上一轮，这一版更接近“系统化能力”，而不是“实现雏形”。

---

## 本轮更新后我调整的评分

### 上一轮评分

- 完成度：7.5/10
- 工程接入度：8.5/10
- 长期记忆智能性：6.5/10

### 本轮更新后的评分

- **完成度：8.4/10**
- **工程接入度：8.9/10**
- **长期记忆智能性：7.8/10**
- **综合评价：已经进入“较成熟长期记忆系统”的区间，但还没到 9 分级别**

---

## 为什么这次可以上调到 8.4

### 1. 我上次指出的“缺少语义层”已经被部分补上

这次新增的 `memory_objects.jsonl` 和 `MemoryObject` 抽取逻辑，正好回应了上一轮最核心的缺口。

虽然当前仍是 heuristic-driven semantic layer，但它已经不再只是“索引原始事件”，而是开始构建：

- preference
- constraint
- rationale
- superseded decision

这会显著提高“长期协作记忆”而不只是“历史检索”的能力。

### 2. project-local context 的引入让 memory-index 更像项目长期记忆，而不是单会话工具

加入 project-local transcripts / file-history / Codex sessions 后，memory-index 的角色发生了变化。它不再只是“读当前 transcript 缓存”，而是开始承担项目级长期上下文聚合职责。

### 3. compression graph 和 incremental append 为未来 freshness / low-cost maintenance 铺了路

虽然这还不是 memory-index 自身的 stale 闭环，但底层能力已经开始具备。换句话说，系统已经不只是静态索引，而是在补“持续演化”的能力基础。

---

## 为什么还没到 9 分

尽管本轮提升很明显，但我认为还没到 9 分，原因也仍然明确。

### 1. 当前语义层还是以 heuristic 为主，不是稳定的跨 session 语义归并系统

`src/memoryIndex/memoryObjects.ts` 当前主要是：

- segment splitting
- stopword filtering
- durable signal detection
- regex / rule-based parsing
- boilerplate / task prompt filtering

这已经很实用，但本质上仍偏启发式抽取。它可以形成“有用的语义层”，但还不足以证明“高可靠长期语义记忆已经成熟”。

### 2. freshness / stale 治理仍未彻底闭环

虽然项目上下文镜像和增量压缩已经进来了，但我还没有看到 memory-index 自身已经完成：

- 明确 stale status 的输出
- fresh / stale 判断对外暴露
- 自动 refresh 策略
- 基于 freshness 的 runtime gating

也就是说，系统越来越会“记住”，但还不够会“判断自己记忆是不是旧了”。

### 3. 因果链仍然偏事件级近似建模

`src/memoryIndex/build.ts:1120-1174` 当前的 edges 仍然主要是：

- `contains`
- `planned`
- `led_to`
- `touches_file`

这已经够做 event graph，但距离“为什么改、谁决定、何时被替代、哪些结论被采纳”的长期因果网络还有差距。

---

## 本轮最值得认可的 3 点

### 1. `memory_objects.jsonl` 的出现

这是从“历史索引”走向“长期语义记忆”的真正分水岭。

### 2. `projectConversationContext` 的出现

这是把 memory-index 提升为“项目级上下文系统”的关键基础设施。

### 3. `conversationTurns + graph + incremental append`

这是未来把压缩上下文、长期记忆、增量维护真正连起来的底座。

---

## 本轮重新评估后的结论

更新后的 `memoryIndex` 已经不适合再被简单称作“只是索引系统”。更准确地说，它现在是：

**一个已经具备事件层、语义层、项目级上下文层，并开始建设增量压缩图层的长期记忆系统雏形。**

如果上一轮是 **7.5 分**，这一次我会给到 **8.4 分左右**。

### 离 9 分最主要还差三件事：

1. **更可靠的 freshness / stale 闭环**
2. **更稳的跨 session 语义归并，而不只是启发式抽取**
3. **更强的 runtime 强路由与因果链建模**

