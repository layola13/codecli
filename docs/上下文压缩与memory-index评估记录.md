# 上下文压缩与 memory-index 评估记录

## 用户问题 1
评估这个工程的上下文压缩原理。

## 评估结论
这个工程的“上下文压缩”本质上是一个**规则抽取 + 增量归并 + 多视图持久化 + prompt 注入**系统，不是 LLM 摘要器。

### 核心链路
1. 从会话消息中筛出可压缩的 user / assistant 文本。
2. 转成 turn 序列，并为每轮生成 signature。
3. 用 `ContextCompressorEngine` 逐轮 ingest。
4. 用规则抽取器提取结构化信息。
5. 用 merger 做去重、覆盖、淘汰。
6. 输出多份文件：
   - `.claude/context/session_state.py`
   - `.claude/context/session_state.json`
   - `.claude/context/session_history.py`
   - `.claude/context/session_metrics.py`
   - `.claude/context/session_graph.py`
7. 在后续构造 user context 时，把 `session_state.py` 读出来注入 prompt。

### 压缩对象
压缩的不是全文，而是结构化槽位，主要包括：
- `primaryGoal`
- `decisions`
- `constraints`
- `tasks`
- `facts`
- `codeAnchors`
- `errorMemories`
- `conversationTurns`

### 关键机制
- **抽取**：依赖正则、关键词、子句切分，强调 precision > recall。
- **归并**：按类型做去重、相似合并、状态覆盖、容量裁剪。
- **序列化**：把状态写成 Python 类结构，便于后续 prompt 注入。
- **图谱**：额外生成 turn 关系图，保留 shared_file / shared_task / same_topic 等连接。
- **增量**：优先 append，只在历史重写时回退为全量重建。

### 优点
- token 性价比高
- 更适合 coding agent 的状态保持
- 支持增量更新
- 输出结构清晰、可解释

### 缺陷
- 规则抽取泛化有限
- 精度优先导致召回不足
- 槽位有上限，提醒会和别的信息竞争
- `session_state` 是 lossy compact summary，不适合承载长期提醒

---

## 用户问题 2
但这种压缩有缺陷，多轮对话后忘记用户之前的提醒，你看看 `.memory_index` 是否有帮助。

## 评估结论
有帮助，而且**正好是为这个问题设计的**。

### 核心判断
- `session_state` 适合做**当前会话的短程压缩态**。
- `.memory_index` 更适合做**跨轮次 / 跨会话的 durable reminder retrieval**。

### 为什么 `session_state` 容易忘提醒
- 容量受限，提醒会和其他信息竞争槽位。
- 抽取器是 heuristic / regex，提醒不一定稳定命中。
- 注入 prompt 时还会再次截断。
- 它被系统自己标注为 lossy compact summary，不是 source of truth。

### 为什么 `.memory_index` 更适合
`.memory_index` 不是读压缩摘要，而是从真实历史构建 durable memory map：
- transcript JSONL
- file-history
- codex sessions

### 它对“用户提醒”的直接帮助
memory object 类型包含：
- `user_preference`
- `stable_constraint`
- `decision_rationale`
- `superseded_decision`

这几类正好覆盖：
- 用户偏好
- 稳定约束
- 为什么这么做
- 哪些旧结论已经失效

### 重要特点
- `events.jsonl` 是 source of truth
- `memory_objects.jsonl` 是 derived semantic layer
- 能追溯 `source_event_ids`
- 能记录 `superseded_decision`

### 总判断
`.memory_index` 能更可靠地保存用户提醒，但它本身只是**长期记忆后端 / 检索层**，并不会自动让主 prompt 记住这些内容。

---

## 用户问题 3
好，你继续。

## 进一步分析：主链路接入现状
当前主上下文链路里：
- **已自动注入**：`pinnedFacts`
- **已自动注入**：`session_state`
- **未自动注入**：`.memory_index` 的内容本身
- **已通过提示词与技能规则接入**：`.memory_index` 的按需 recall

### 当前 `getUserContext()` 的组成
主入口位于 `src/context.ts`，自动注入的只有：
1. `pinnedFacts`
2. `sessionState`
3. `claudeMd`
4. `currentDate`

但这不等于 `.memory_index` 完全没接入主链路。当前实现已经把它接成：
- 历史类任务的**优先 recall 入口**
- 先看索引，再决定是否回退到原始 transcript / plan 的检索层
- 明确低于 `/pin` / `pinnedFacts`，不作为常驻上下文

因此更准确的说法是：
- `pinnedFacts` 是显式常驻层
- `session_state` 是短期工作记忆
- `.memory_index` 是长期历史的**按需回忆层**，不是自动注入层

---

## 三层记忆分工建议

### 1. `pinnedFacts`
定位：**最高优先级、显式声明、必须不丢**

适合保存：
- 工程级稳定事实
- 用户明确要求长期记住的少量硬信息

### 2. `session_state`
定位：**短期工作记忆**

适合保存：
- 当前任务
- 最近决策
- 最近文件锚点
- 最近阻塞
- 当前目标

### 3. `.memory_index`
定位：**长期可检索提醒库**

适合保存：
- 用户偏好
- 稳定约束
- 历史提醒
- 被推翻的旧结论
- 历史计划和修改原因

---

## 最终判断
当前遗忘问题的根因不是 `.memory_index` 无效，而是：

> **长期记忆层虽然已经有入口，但它不是 `/pin` 那种常驻层，而是按需回想层。**

也就是说：
- `session_state` 不应该继续硬扛长期提醒
- `.memory_index` 不应被粗暴塞进每轮 prompt
- 正确方向是把 `.memory_index` 维持为“历史相关任务时优先调用的 recall 入口”

---

## 改造方向建议
推荐采用：

### 常驻层
- `pinnedFacts`
- `sessionState`

### 按需层
当任务涉及以下信号时，优先调用 `.memory_index` 做 recall：
- “之前”
- “你忘了”
- “按以前说的”
- “历史”
- “为什么改”
- “之前用户提醒”

### 优先级原则
- `/pin` / `pinnedFacts` 仍然是最高优先级硬事实
- `.memory_index` 不是第二个 `/pin`
- 但在需要查历史时，`.memory_index` 应优先于直接翻 transcript / plan

### 目标
让系统形成：
- `session_state` 管短期连续性
- `.memory_index` 管长期提醒与历史回忆
- `pinnedFacts` 管最高优先级硬事实

---

## 一句话总结
这个仓库的遗忘问题，本质不是压缩算法单点问题，而是：

> **短期压缩层是常驻的，长期记忆层是按需的；真正要优化的是 recall 策略，而不是把 `.memory_index` 变成另一个 `/pin`。**

---

## 补充修正：按最新 memory_index 版本更新后的评估

前面的判断方向没有错，但对 **最新版 memory_index 的完成度偏保守**。最新实现已经不只是“事件索引 + 语义对象层”，而是明确演进成了：

- **事件真相层**：`index/events.jsonl`
- **派生语义层**：`index/memory_objects.jsonl`
- **图谱分析层**：`index/memory_graph.json` + `index/memory_graph.dot`
- **Python 导航层**：`project_memory_graph.py` + `skeleton/__index__.py`
- **分片可视化层**：`index/dot/manifest.json` + 各类 session/topic shard DOT

### 修正后的定位
最新版 `.memory_index` 更准确的定位不是“长期记忆索引”，而是：

> **一个以真实 transcript / file-history / codex session 为证据底座，向上构建语义对象、关系图谱、Python skeleton 与 DOT 导航视图的项目历史导航系统。**

### 为什么要修正这个结论
因为最新实现已经明确产出并暴露以下核心产物：
- `project_memory_graph.py`
- `index/memory_graph.json`
- `index/memory_graph.dot`
- `skeleton/__index__.py`
- `index/dot/manifest.json`
- `__index__.py`

这说明 memory_index 已经不是“只给检索层准备 JSONL 数据”，而是开始提供：
- 面向 LLM 的 Python 骨架导航
- 面向结构化分析的规范化 graph JSON
- 面向可视化与人工核查的 DOT 分片图
- 面向近期回忆的导航总线 `__index__.py`

### 最新版最值得上调评价的三个点

#### 1. 图谱层已经成为正式层，不再只是附属实验
`buildMemoryIndex()` 在完成 prompts / plans / code_edits / memory_objects / files 之后，会继续：
- 组装 graph input
- 走 agent 或 heuristic 的 graph analysis
- 归一化成正式 graphAnalysis
- 写出 JSON / DOT / Python graph / skeleton / shard DOT

这意味着图谱层已经是 build pipeline 的正式组成部分，而不是临时附属输出。

#### 2. Python skeleton 层让长期记忆真正变成“可导航工程”
`skeleton/__index__.py` 以及 `segments/`、`topics/` 目录的存在，说明系统已经在模仿 `.code_index` 的成功经验，把长期记忆组织成：
- topic 模块
- segment 模块
- 可索引的 Python 入口

这比单纯 JSONL 强很多，因为它更适合作为 LLM 的“项目历史地图”。

#### 3. 分片 DOT 说明它已经开始认真处理规模问题
`index/dot/manifest.json` 和 session/topic shard DOT 的设计，说明实现者已经意识到：
- 全量图会太大
- 必须拆 shard
- 需要 overview + shard manifest 的双层组织

这不是小修小补，而是典型的“系统已经开始考虑大规模历史导航”的信号。

### 修正后的总体判断
如果按最新版重新评价：

- `context compression` 仍然主要是 **短期 continuity 层**
- `memory_index` 已经应被视为 **项目历史导航总线 / 长期记忆地图系统**

也就是说，之前那句“memory_index 比 context compression 更成熟”仍然成立，而且现在应该说得更明确：

> **在当前版本里，memory_index 的架构成熟度已经明显高于 context compression。**

### 修正后的评分

#### context compression
- 架构方向：8.5/10
- 工程落地：7.5/10
- 语义精度：5.5/10
- 综合：7/10

#### 最新版 memory_index
- 架构方向：9.3/10
- 工程落地：8.8/10
- 事实可靠性：8.5/10
- 语义抽象可靠性：7.5/10
- 综合：8.8/10

### 修正后的最终一句话

> **最新版 memory_index 已经不只是“长期记忆索引”，而是在向“项目历史导航系统”收敛；相比之下，context compression 依然更像一个服务于当前 prompt continuity 的短期压缩层。**
