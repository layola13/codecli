# /note 当前需求、进度与下一步计划

## 当前任务需求

用户当前对 `/note` 的有效要求：

1. 在 Claude Code 源码基础上开发 `/note` 功能。
2. 输入支持：
   - 单文件
   - 单书文件夹
   - 书库目录（每本书一个文件夹）
3. 输入格式支持：`txt | pdf | md`。
4. 当用户未传 `--format` 时，必须先提示用户选择格式，默认 `txt`。
5. 输出不是总结报告，而是给 LLM 使用的“小说地图”。
6. 输出必须是 **可被 Python 编译器编译的知识图谱骨架工程**。
7. Python 标识符必须英文；中文信息可放在注释中，便于人读。
8. 生成内容里 **不能复制小说原文**，也 **不要总结**。
9. 只能记录映射/引用信息，例如：文件名、章节、`L1:L10`、关系引用、图边等。
10. 骨架应主要来自 Claude Code 内部 agent 分析，而不只是程序批量抽取。
11. 分析维度不是让用户勾选，而是默认全量扩展；当前实现远远不够，用户刚补充指出 **还漏了约 300 个分类**。现有 roles / relations / events / places / factions / abilities / timelines 只是一小部分基础骨架，不是最终范围。
12. 后续设计必须转向“超大分类体系的可扩展骨架”，不能把当前 8 个域误写成需求已基本覆盖。
12. 禁止“小汇报”。

## 当前实现进度

### 已完成

1. `/note` 命令已注册。
2. `src/commands/note/args.ts` 已支持：
   - `[path]`
   - `--format txt|pdf|md`
   - `--output DIR`
3. `src/note/types.ts` 已建立当前**第一层基础域**：
   - chapters
   - roles
   - relations
   - events
   - places
   - factions
   - abilities
   - timelines
   但这只是基础层，距离用户要求的超大分类体系还差很多。
4. `src/note/agentAnalysis.ts` 已扩展到四个新增域：
   - places
   - factions
   - abilities
   - timelines
   并且已补：
   - shard prompt schema
   - sanitize
   - merge
   - 最终 `NoteBook` 返回
5. `src/note/build.ts` 已扩展到四个新增域，已补：
   - scaffold fallback 空数组
   - `places/`
   - `factions/`
   - `abilities/`
   - `timelines/`
   - `place_index.py`
   - `faction_index.py`
   - `ability_index.py`
   - `timeline_index.py`
   - `manifest.py` 计数
   - `book.py` 引用
   - `graph/edges.py`
   - `graph/adjacency.py`
6. `src/commands/note/noteCommand.ts` 已增加新域统计输出。
7. `src/note/build.test.ts` 已补四个新增域断言，并继续校验“不落原文”。
8. 已跑定向测试并通过：
   - `src/note/build.test.ts`
   - `src/commands/note/args.test.ts`

### 还未完成

1. **未传 `--format` 时的交互选择** 还没做。
2. 当前 `/note` 还是 `local` 命令实现，无法直接弹出交互选择界面。
3. 因此，为了满足“先提示用户选格式，默认 txt”这个硬要求，需要调整命令入口实现方式。
4. 更关键的是：当前 schema 只有基础 8 个域，用户已明确指出还漏了约 300 个分类，说明现阶段只是基础骨架，不是接近完成。
5. 需要补一套“大分类体系扩展方案”，把后续几百个分类设计成可持续增长的 Python 骨架结构，而不是继续临时加几个 type。

## 当前判断

当前有两个独立缺口：

### 缺口 1：命令交互形态
- 现在的 `/note` 在 `src/commands/note/index.ts` 中声明为 `type: 'local'`
- 这种实现更适合直接执行
- 但“未传 format 时弹交互选择”更适合 `local-jsx`

### 缺口 2：分类体系严重不足
- 当前只落了基础 8 个域
- 用户刚明确指出还漏了约 300 个分类
- 这意味着不能把接下来的工作理解成“补一个 format 选择就差不多”
- 后续必须引入可扩展的大分类骨架层，否则 schema 会很快失控

所以，下一步虽然仍可先补 `--format` 交互，但中期重点必须转到“大分类体系扩展设计”。

## 下一步计划

### 近期步骤

1. 将 `/note` 从 `local` 改为 `local-jsx` 入口。
2. 新增一个 `/note` 的交互组件或 JSX 命令入口：
   - 如果传了 `--format`，直接沿用当前逻辑执行
   - 如果没传 `--format`，先展示格式选择
3. 格式选项：
   - `txt`
   - `pdf`
   - `md`
   - 默认选中 `txt`
4. 选完格式后，自动继续调用现有 `/note` 构建流程，而不是让用户重新输入命令。
5. 补对应测试：
   - 未传 `--format` 时进入选择流程
   - 已传 `--format` 时直接执行
   - 默认 `txt` 生效

### 中期步骤

6. 梳理“约 300 个分类”的可扩展分层方案。
7. 不再只按单个域零散加类型，而是设计为多层级 Python skeleton 工程，例如：
   - 人物层
   - 组织层
   - 地理层
   - 能力层
   - 物品层
   - 制度/规则层
   - 时间线层
   - 事件层
   - 叙事层
   - 社会关系层
   - 认知/立场层
   - 以及继续细分的二级/三级分类
8. 评估是否需要把当前 `NoteBook` 扩成“基础核心域 + 扩展分类节点”双层结构，以承载几百个分类而不让 TypeScript 类型爆炸。
9. 在此基础上再继续扩展 agent prompt、sanitize、writer、index、graph 输出。

## 备注

用户要求：禁止小汇报。因此这里保存的是接力用的开发备忘，不是给用户的阶段性汇报模板。
