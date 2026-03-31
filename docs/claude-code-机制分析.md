# Claude Code 2.1.88 机制分析

本文基于当前工作区里的打包源码树分析，不是基于外部文档。重点回答四个问题：

1. 上下文压缩是怎么做的
2. 并行任务是怎么设计的
3. 任务系统是如何调动的
4. 大文件是如何读取的

先给结论：这个工具的上下文管理不是“单点压缩”，而是分层治理。请求发出前先做轻量裁剪，请求即将超阈值时再做摘要压缩；如果已经有会话记忆，还会优先走“会话记忆替代摘要”的路径。

## 1. 上下文压缩

### 1.1 入口顺序

主查询循环在 `src/query.ts:365-455` 里把压缩前处理排成了固定流水线：

`applyToolResultBudget -> snip -> microcompact -> contextCollapse.applyCollapsesIfNeeded -> autoCompact`

这几个阶段不是互斥关系，而是叠加关系：

- `applyToolResultBudget` 先限制单条消息里工具结果的聚合体积，减少历史工具输出对上下文的占用。
- `snip` 会在历史上做裁剪，并把释放出的 token 数传给后面的自动压缩判断，避免阈值判断还拿旧 usage。
- `microcompact` 在真正发 API 请求之前先做“微压缩”。
- `contextCollapse` 如果打开，会先把折叠视图投影出来，尽量避免直接走全量摘要压缩。
- 最后才是 `autoCompactIfNeeded()`。

`getMessagesAfterCompactBoundary()` 会在每轮开始时只取最近一次 compact 边界之后的消息视图，避免已经被总结过的旧历史反复进入主循环，见 `src/utils/messages.ts:4643-4655`。

### 1.2 microcompact：请求前的轻量压缩

`microcompactMessages()` 在 `src/services/compact/microCompact.ts:253-293`，它有两条主要路径：

#### A. 时间触发型 microcompact

`maybeTimeBasedMicrocompact()` 在 `src/services/compact/microCompact.ts:446-520`。

设计意图是：如果距离上一次 assistant 回复已经太久，服务端 prompt cache 大概率已经冷掉，那就没必要维持旧的完整工具结果了，直接把旧 `tool_result` 内容改写成清空占位文本，只保留最近若干个结果。

特点：

- 它直接改本地消息内容，而不是做 cache edit。
- 只在主线程 querySource 上触发。
- 清理后会 `resetMicrocompactState()`，避免下一轮缓存编辑仍然引用已经不存在的旧服务端缓存条目。

这条路径更像“在冷缓存前提下主动瘦身”。

#### B. 缓存编辑型 microcompact

`cachedMicrocompactPath()` 在 `src/services/compact/microCompact.ts:305-399`。

这条路径不改本地消息，而是：

1. 扫描历史 assistant 中可压缩的 `tool_use` id
2. 在对应 user 消息里登记 `tool_result`
3. 调用 cached microcompact 模块决定删哪些工具结果
4. 生成 `cache_edits`，挂到 `pendingCacheEdits`

所以它的核心不是“改消息”，而是“告诉 API 层删缓存中的某些旧工具结果引用”，这样可以保住 prompt cache 前缀。`query.ts:420-425` 会把这些待提交的 cache edits 暂存起来，等 API 响应回来后，再用真实的 `cache_deleted_input_tokens` 生成 microcompact 边界消息，见 `src/query.ts:866-891`。

### 1.3 autoCompact：真正的摘要压缩

`autoCompactIfNeeded()` 在 `src/services/compact/autoCompact.ts:241-345`。

它分三步：

1. `shouldAutoCompact()` 判断是否达到阈值，见 `src/services/compact/autoCompact.ts:160-239`
2. 如果可以，先尝试 `trySessionMemoryCompaction()`
3. 会话记忆不可用时，再退回 `compactConversation()`

自动压缩还有两个重要保护：

- 递归保护：`querySource === 'session_memory'` 或 `'compact'` 时直接禁止，避免 fork agent 套娃死锁，见 `src/services/compact/autoCompact.ts:169-173`
- 熔断器：连续失败达到上限后，本会话后续不再反复尝试自动压缩，见 `src/services/compact/autoCompact.ts:257-265`

另外，`CONTEXT_COLLAPSE` 打开时，`shouldAutoCompact()` 会直接返回 false，把“上下文头寸管理”交给 collapse 机制本身，见 `src/services/compact/autoCompact.ts:201-223`。这也是为什么当前实现里“collapse”与“autocompact”是竞争关系，前者优先。

### 1.4 sessionMemoryCompact：用会话记忆替代摘要 API

`trySessionMemoryCompaction()` 在 `src/services/compact/sessionMemoryCompact.ts:514-630`，这是自动压缩优先走的路线。

它不是再调一次摘要模型，而是：

1. 检查 `tengu_session_memory` 和 `tengu_sm_compact` 等开关，见 `src/services/compact/sessionMemoryCompact.ts:403-432`
2. 等待当前 session memory 提取完成，读出已落盘的会话记忆
3. 依据 `lastSummarizedMessageId` 计算“哪些消息已被记忆覆盖”
4. 用 `calculateMessagesToKeepIndex()` 选出需要保留的尾部消息，见 `src/services/compact/sessionMemoryCompact.ts:324-397`
5. 构造新的 compact 结果

这里的关键不是“保留最后 N 条”，而是“保留满足下限的尾部上下文，同时不破坏 API 不变量”：

- 至少保留最小 token 数
- 至少保留若干条有文本块的消息
- 不切断 `tool_use` / `tool_result` 配对
- 不切断共享同一 `message.id` 的 streaming assistant 片段

这部分逻辑在 `adjustIndexToPreserveAPIInvariants()` 里写得很明确，见 `src/services/compact/sessionMemoryCompact.ts:232-314`。

如果基于 session memory 生成的新上下文仍然超过 auto compact 阈值，就会直接放弃这条路线，回退到传统摘要压缩，见 `src/services/compact/sessionMemoryCompact.ts:600-620`。

### 1.5 compactConversation：传统摘要压缩的完整流程

`compactConversation()` 在 `src/services/compact/compact.ts:387-763`。

大致流程是：

1. 执行 pre-compact hooks
2. 构造 summarizer prompt
3. 调用 `streamCompactSummary()`
4. 如果 compact 请求自己也遇到 prompt-too-long，则重试
5. 成功后清空 `readFileState`
6. 并行重建附件
7. 生成新的 compact 边界和摘要消息
8. 记录统计并做 post-compact cleanup

几个关键点：

#### A. 压缩请求本身也会做瘦身

发送给 summarizer 的消息并不是原样传入。`streamCompactSummary()` 内部会先：

- `stripReinjectedAttachments()` 去掉那些之后本来就会重新注入的 attachment
- `stripImagesFromMessages()` 把图片/文档替换成标记文本

见 `src/services/compact/compact.ts:1292-1305`。

这说明 compact 本身也在避免“为了压缩而把不必要的大块内容再喂一遍模型”。

#### B. PTL 重试不是按用户轮次截，而是按 API round 截

当 compact 请求本身返回 prompt-too-long 时，`truncateHeadForPTLRetry()` 会按 API round 分组后，从最旧的 round 开始往前裁，见 `src/services/compact/compact.ts:243-291` 与 `src/services/compact/grouping.ts:3-22`。

设计原因：

- agentic session 里经常只有一个“用户轮次”，但包含很多轮 assistant -> tool_use -> tool_result -> assistant 的 API 往返
- 按用户轮次分组太粗，没法细粒度回退
- 按 assistant message id 切 API round，可以自然保持工具调用配对边界

这是当前实现里非常关键的一点。

#### C. 压缩后的上下文不是“只剩摘要”

压缩成功后，会重建一个新的 post-compact 消息数组。统一拼装函数是 `buildPostCompactMessages()`，见 `src/services/compact/compact.ts:325-338`。

顺序是：

`boundaryMarker -> summaryMessages -> messagesToKeep(可选) -> attachments -> hookResults`

其中：

- `boundaryMarker` 标记一次 compact 边界
- `summaryMessages` 是摘要文本
- `messagesToKeep` 主要出现在 session-memory compact / partial compact 场景
- `attachments` 会补回最近读过的文件、计划文件、plan mode、已调用 skill、异步 agent 状态、工具增量说明等
- `hookResults` 补回 session start hook 产生的上下文

`query.ts:528-535` 会把这个新数组直接作为后续继续请求的上下文。

#### D. 文件与技能会被“有预算地”补回

`createPostCompactFileAttachments()` 会从压缩前的 `readFileState` 里挑最近读过的文件，最多恢复 5 个，每个文件最多 5K token，总预算 50K token，见 `src/services/compact/compact.ts:1415-1464`。

`createSkillAttachmentIfNeeded()` 也会按 token budget 补回本轮真正调用过的 skills，见 `src/services/compact/compact.ts:1494-1534`。

这说明 compact 的目标不是单纯缩小体积，而是“把体积更小但对后续推理最有用的上下文重新拼起来”。

### 1.6 preservedSegment：保尾部消息时如何保持链路

`annotateBoundaryWithPreservedSegment()` 在 `src/services/compact/compact.ts:340-367`。

当压缩后还需要保留一段原始消息时，它会把：

- `headUuid`
- `anchorUuid`
- `tailUuid`

写到 compact boundary 的 metadata 里。这样 loader 在从磁盘恢复链路时，能把“新摘要链”和“旧保留段”重新接起来，而不是把两段历史当成断裂片段。

这在 `sessionMemoryCompact` 和 partial compact 里尤其重要。

### 1.7 contextCollapse：当前包里只能看到外部接口

当前源码包里能看到它在 query 流水线中的接入点与开关逻辑：

- `query.ts:428-447`
- `autoCompact.ts:201-223`
- `postCompactCleanup.ts:42-49`

但 `src/services/contextCollapse/index.js` 的实现文件不在当前工作区源码树里，所以只能确认：

- 它运行在 autocompact 之前
- 它提供的是一种“投影视图 + 持久折叠提交日志”的机制
- 开启后会抑制 proactive autocompact

不能对它的内部折叠算法做更细分析。

## 2. 并行任务设计

这个系统至少有三层并行：

1. 单轮内多个工具调用并行
2. 流式生成期间边收边执行工具
3. 跨 agent / teammate 的后台并行

### 2.1 单轮工具并行：按 concurrency-safe 分批

`runTools()` 在 `src/services/tools/toolOrchestration.ts:19-82`。

它先调用 `partitionToolCalls()`，把工具调用切成两类批次，见 `src/services/tools/toolOrchestration.ts:86-116`：

- 非并发安全工具：一个一批，串行执行
- 并发安全工具：连续的多个合并成一个批次，并行执行

并发安全性来自各个工具自己的 `isConcurrencySafe(input)` 判断，而不是硬编码名字。比如 `TaskCreateTool`、`TaskUpdateTool`、`TaskListTool`、`TaskGetTool` 都声明自己是 concurrency-safe。

真正并发执行发生在 `runToolsConcurrently()`：

- 通过 `all()` 跑多个 async generator
- 并发上限由 `CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY` 控制，默认 10，见 `src/services/tools/toolOrchestration.ts:8-12`

一个细节是：并发批次里的 context modifier 不会立刻写回全局上下文，而是先按 `tool_use_id` 暂存，等该批次工具都结束后，再按原始 block 顺序回放，见 `src/services/tools/toolOrchestration.ts:31-63`。这避免了并行工具对共享上下文乱序写入。

### 2.2 流式工具执行：边收 `tool_use` 边开跑

主 query 循环如果打开 streaming tool execution，会在流开始前创建 `StreamingToolExecutor`，见 `src/query.ts:560-568`。

然后在模型流式输出 assistant block 时：

1. 收到 `tool_use`
2. 立即 `streamingToolExecutor.addTool()`
3. 在同一个 streaming 循环里不断 `getCompletedResults()` 把已经完成的结果吐出来

见 `src/query.ts:826-858`。

`StreamingToolExecutor` 的核心设计在 `src/services/tools/StreamingToolExecutor.ts`：

- `addTool()` 把工具加入队列，并立刻尝试 `processQueue()`，见 `:73-124`
- `canExecuteTool()` 保证“非并发安全工具必须独占；并发安全工具只与并发安全工具一起跑”，见 `:126-145`
- 结果不会按“谁先完成谁先出”完全乱序抛给模型，而是缓冲后按接收顺序 yield，见 `getCompletedResults()` 的 `:412-440`
- progress message 例外，会被立即吐出，不等最终结果，见 `:417-423`

失败控制也很谨慎：

- 只有 Bash 工具错误会级联取消兄弟工具，见 `:354-363`
- 用户中断、streaming fallback、兄弟 Bash 失败，都会生成 synthetic `tool_result`，保证 `tool_use` / `tool_result` 成对，见 `:153-205` 与 `src/query.ts:1011-1029`

这层本质上是在做“流式编排器”，不是简单的 `Promise.all`。

### 2.3 跨 agent / teammate 的后台并行

更高一层的并行来自后台 agent 和 teammates。

几个入口：

- `AgentTool` 支持 `run_in_background`，见 `src/tools/AgentTool/AgentTool.tsx:87` 及 `:567`
- 各类后台 agent / shell / remote agent 都会注册成 runtime task
- 多 agent / swarm teammate 的注册在 `src/tools/shared/spawnMultiAgent.ts:760-819`

这些后台实体不是靠“当前 query 阻塞等待”驱动，而是：

- 在 `AppState.tasks` 中注册运行态任务
- 将输出持续写入磁盘输出文件
- 完成后用 task notification 回送主线程

也就是说，单轮工具并行解决的是“一个 API 回合里多个工具怎么同时跑”，后台 agent 并行解决的是“多个长期工作项怎么脱离当前回合独立推进”。

补充一点：Bash 工具本身的 prompt 也明确鼓励模型把互不依赖的命令并行发出，见 `src/tools/BashTool/prompt.ts:85-109` 和 `src/tools/BashTool/prompt.ts:297-302`。这说明“并行”不仅是运行时能力，也是 prompt 级策略。

## 3. 任务系统如何调动

这里要区分两套“任务”：

1. 持久化任务单：给 agent/teammate 分工用
2. 运行时任务实例：后台 bash、后台 agent、remote agent、teammate 的执行状态

### 3.1 持久化任务单：文件系统就是数据库

`src/utils/tasks.ts` 是核心。

任务单存储位置：

- `~/.claude/tasks/<taskListId>/`

见 `src/utils/tasks.ts:221-230`。

每个任务就是一个 JSON 文件，另外还有：

- `.lock`：任务列表级锁文件
- `.highwatermark`：历史最大 task id，防止 reset / delete 后复用旧 id

见 `src/utils/tasks.ts:91-130`、`src/utils/tasks.ts:501-523`。

### 3.2 任务单如何避免并发冲突

这个任务系统是按“多进程/多 agent 并发操作”设计的，不是假定只有一个进程写。

保护机制：

- `createTask()` 先拿列表锁，再读最高 id，再写新任务，见 `src/utils/tasks.ts:279-308`
- `updateTask()` 对单个任务文件加锁，见 `src/utils/tasks.ts:370-391`
- `claimTask()` 在普通模式下锁任务文件；如果要原子检查“agent 是否正忙”，就改为锁整个任务列表，见 `src/utils/tasks.ts:541-692`

这套语义保证了：

- 不会两个 agent 抢到同一个任务
- 不会 reset 后复用旧编号
- `busy check` 不会出现 TOCTOU 竞态

### 3.3 TaskCreate / TaskList / TaskGet / TaskUpdate 的工作流

几个工具分别是：

- `TaskCreateTool`：建任务，默认 `pending`，见 `src/tools/TaskCreateTool/TaskCreateTool.ts:48-138`
- `TaskListTool`：列任务，会过滤 `_internal` 元数据并把已完成 blocker 剔除，见 `src/tools/TaskListTool/TaskListTool.ts:33-116`
- `TaskGetTool`：取任务详情，见 `src/tools/TaskGetTool/TaskGetTool.ts:38-128`
- `TaskUpdateTool`：更新状态、owner、依赖关系、metadata，见 `src/tools/TaskUpdateTool/TaskUpdateTool.ts:88-405`

`TaskUpdateTool` 里有几个很实际的动作：

- 标为 `completed` 前会跑 completed hooks，失败则阻止关闭任务，见 `:231-265`
- 改 owner 后会写 mailbox 通知新 owner，见 `:276-298`
- `addBlocks` / `addBlockedBy` 会同步维护双向依赖，见 `:300-324`

这说明任务工具不是 UI 糖，而是真正的协同协议层。

### 3.4 watcher 如何自动接单

`useTaskListWatcher()` 在 `src/hooks/useTaskListWatcher.ts:27-189`。

它的模式很直接：

1. watch 任务目录
2. debounce 1 秒
3. `listTasks()`
4. 找到第一个 `pending + 无 owner + blocker 已全部完成` 的任务
5. `claimTask()`
6. 格式化成 prompt，直接提交给当前 agent

见：

- 选任务：`src/hooks/useTaskListWatcher.ts:86-98`
- 可接任务判定：`src/hooks/useTaskListWatcher.ts:191-207`
- 转成 prompt：`src/hooks/useTaskListWatcher.ts:213-220`

如果 prompt 提交失败，还会把 owner 释放掉，见 `src/hooks/useTaskListWatcher.ts:116-123`。

所以“任务系统如何调动”里最关键的一点是：任务不是只存在于文件里，watcher 会把它们自动拉进 agent 主循环。

### 3.5 运行时任务：AppState 中的执行实体

另一套系统是 `AppState.tasks`。统一类型在 `src/Task.ts:6-57`：

- `local_bash`
- `local_agent`
- `remote_agent`
- `in_process_teammate`
- `local_workflow`
- `monitor_mcp`
- `dream`

`createTaskStateBase()` 会给每个运行时任务分配：

- 随机 task id
- `outputFile`
- `outputOffset`
- `notified`

见 `src/Task.ts:108-125`。

运行态注册统一走 `registerTask()`，见 `src/utils/task/framework.ts:74-117`。注册后会发 `task_started` SDK 事件。

例如：

- 本地后台 agent 注册在 `LocalAgentTask`，见 `src/tasks/LocalAgentTask/LocalAgentTask.tsx:460-578`
- 进程内 teammate / tmux teammate 也会注册成 task，见 `src/tools/shared/spawnMultiAgent.ts:760-819`

### 3.6 输出、轮询和通知是怎么串起来的

运行时任务的输出不是全放内存里，而是落盘到任务输出文件。

核心在 `src/utils/task/diskOutput.ts`：

- 每个任务对应一个 `<taskId>.output` 文件，见 `:72-74`
- `DiskTaskOutput` 维护一个写队列，单 drain loop 顺序刷盘，避免链式 Promise 造成内存滞留，见 `:89-230`
- 单任务输出文件硬上限 5GB，见 `:23-31`

框架层再通过 `pollTasks()` 定时轮询，见 `src/utils/task/framework.ts:251-289`：

1. `generateTaskAttachments()` 读取任务输出增量
2. 更新 `outputOffset`
3. 对完成任务发 `task-notification`
4. 对已通知且终态的任务做驱逐

后台 agent 自己也会在结束时主动 `enqueuePendingNotification()`，例如 `LocalAgentTask` 的 `enqueueAgentNotification()`，见 `src/tasks/LocalAgentTask/LocalAgentTask.tsx:197-262`。所以通知机制是“框架轮询 + 任务类型自带完成回调”双轨并存。

## 4. 大文件如何读取

### 4.1 输入模型：行范围 + token/字节双限额

`FileReadTool` 的输入定义在 `src/tools/FileReadTool/FileReadTool.ts:227-242`：

- `file_path`
- `offset`
- `limit`
- `pages`（PDF 专用）

对文本文件它是“按行读取”，不是按字节分页。真正的限额有两层：

- 字节上限：`maxSizeBytes`
- token 上限：`maxTokens`

定义在 `src/tools/FileReadTool/limits.ts:1-18`。

这两层限制作用点不同：

- `maxSizeBytes` 主要防止读取阶段直接吞掉过大文本
- `maxTokens` 在内容读出后再做校验，防止“虽然字节没超，但模型侧 token 太大”

### 4.2 `offset` / `limit` 的真实语义

文本读取时会把用户输入的 1-based `offset` 转成内部 0-based line offset，见 `src/tools/FileReadTool/FileReadTool.ts:1019-1027`。

一个重要细节：

- 如果没有给 `limit`，`readFileInRange()` 会带上 `maxSizeBytes`
- 如果显式给了 `limit`，这里会把 `maxBytes` 传成 `undefined`

也就是：

- “读整文件”时，按文件整体大小先挡一遍
- “读明确范围”时，允许大文件进入，但只读取目标行范围，后面再做 token 校验

这正是它支持“超大文件靠 offset/limit 精确切片”的关键。

### 4.3 `readFileInRange()`：小文件走 fast path，大文件走 streaming path

核心逻辑在 `src/utils/readFileInRange.ts:73-122`。

#### Fast path

条件：

- 普通文件
- 小于 10MB

实现：

- 直接 `readFile()`
- 内存里按换行切

见 `src/utils/readFileInRange.ts:95-111` 与 `:128-194`。

优点是快，适合常见源码文件。

#### Streaming path

条件：

- 大文件
- 非普通文件
- pipe / device / 其他特殊文件

实现：

- `createReadStream()`
- 手动扫描 `\n`
- 只累计目标范围内的行
- 范围外的内容只计数，不保留

见 `src/utils/readFileInRange.ts:197-383`。

这意味着即使读的是超大文件，也不会因为“只想看前几十行”就把整文件内容堆进内存。

另外，streaming path 还专门处理了“超长单行导致 partial 无限积累”的问题，超过截断预算时会主动停止累计，见 `src/utils/readFileInRange.ts:287-299`。

### 4.4 文本读取之后还会做 token 校验

`validateContentTokens()` 在 `src/tools/FileReadTool/FileReadTool.ts:755-772`。

它先做 rough estimate，只有接近阈值时才调 `countTokensWithAPI()`，避免每次读文件都付一次 token 计数 API 成本。

也就是：

- 先用便宜估算筛掉绝大多数小文件
- 快到阈值再用真实 token 计数精确判断

### 4.5 read dedup：重复读同一范围时不再回灌全文

`FileReadTool.call()` 开头有一段很重要的 dedup，见 `src/tools/FileReadTool/FileReadTool.ts:523-573`。

逻辑是：

1. 看 `readFileState` 里是否已经读过同一路径、同一 `offset/limit`
2. 再检查磁盘 mtime 是否没变
3. 如果没变，直接返回 `file_unchanged`

对应的 `tool_result` 会变成一个 stub，而不是重新把全文发给模型，见 `src/tools/FileReadTool/FileReadTool.ts:686-691`。

`readFileState` 本身是一个带大小上限的 LRU cache，见 `src/utils/fileStateCache.ts:4-38` 与 `:95-106`。这也是为什么它能兼顾 dedup 和内存控制。

### 4.6 Notebook、Image、PDF 都走专门分支

`callInner()` 在 `src/tools/FileReadTool/FileReadTool.ts:804-1085`，不是所有文件都按文本处理。

#### Notebook

`.ipynb` 会走 `readNotebook()`，把 cell 全部结构化读出，见 `:821-863`。

特点：

- 先按 JSON 字节数检查大小
- 再按 token 检查
- 会写入 `readFileState`

#### Image

图片走 `readImageWithTokenBudget()`，见 `:865-891` 与 `:1097-1140`。

特点：

- 文件只读一次
- 先做标准 resize/downsample
- 如果估算 token 仍超预算，再从同一 buffer 做更激进压缩
- 不走文本的 `maxSizeBytes` 限制
- 不参与 `readFileState` dedup

#### PDF

PDF 有两种模式，见 `:893-1017`：

- 指定 `pages`：抽页为图片，按页送进模型
- 不指定 `pages`：小 PDF 且模型支持时直接当 document 读；太大或模型不支持时，要求用户改用 `pages`

这里还有限制：

- 超过 `PDF_AT_MENTION_INLINE_THRESHOLD` 页数就不能整本读
- 每次 `pages` 最多 `PDF_MAX_PAGES_PER_READ`

### 4.7 特殊文件与危险路径也做了防御

`validateInput()` 在 `src/tools/FileReadTool/FileReadTool.ts:418-495`。

它会在真正 I/O 前拦掉：

- deny rule 命中的路径
- 大部分二进制文件
- 会阻塞或无限输出的 device file，比如 `/dev/zero`、`/dev/random`、`/dev/stdin`

这部分是为了防止“读文件工具把自己卡死”。

## 总结

这套实现的核心风格是“把大问题拆成几层小机制”：

- 上下文压缩不是只靠一次摘要，而是预算裁剪、微压缩、折叠、自动 compact、session memory compact 叠加
- 并行不是单一 `Promise.all`，而是工具级并发、流式边收边跑、后台 agent 三层协同
- 任务系统不是单纯内存队列，而是“磁盘任务单 + AppState 运行态任务 + 输出文件 + 通知队列”的组合
- 大文件读取不是简单 `readFile`，而是按文件类型分流，并用行范围、字节限制、token 限制、流式读取和 dedup 共同控成本

如果要继续深挖，最值得再看的两个点是：

- `src/services/contextCollapse/*` 的内部实现
- `src/tools/AgentTool/runAgent.ts` 到各类 `Task` 的后台执行闭环

但前者在当前打包源码树里并不完整，后者则属于“多 agent 后台执行”的更深一层实现。
