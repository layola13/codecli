# 为什么新增功能总要 patch `cli.js`

## 1. 先说结论

当前仓库的本地构建默认走的是：

1. 先把 `src/commands/index/cliBundleEntry.ts` 打成 `src/commands/index/cliBundle.mjs`
2. 再用 `cli.js` 作为主入口执行 `bun --compile --published`

所以真正被编译成二进制入口的，不是完整源码入口 `src/entrypoints/cli.tsx`，而是 **上游 npm 发布包恢复出来的 `cli.js`**。

这意味着：

- 你在 `src/` 里新增功能，不一定会自动进入最终可执行文件
- 只有已经被 `cli.js` 引用到的代码，才会被 `--published` 路径带进最终二进制
- 因此，凡是“要接到主 CLI 命令系统里”的新增功能，通常都需要对 `cli.js` 做一次补丁注入

## 2. 为什么会这样

这个目录不是完整的“官方源码仓库可直接重建发布包”的形态，而是从已发布包逆向恢复出来的工作树。

当前构建策略选择的是更稳的一条路：

- 保留上游发布入口 `cli.js`
- 只把我们自己新增或恢复出来的命令 bundle 单独挂进去
- 最后直接把这个 patched `cli.js` 编译成 Bun 二进制

这样做的好处是：

- 更贴近真实发布物
- 不需要把整套上游源码打包链完全恢复
- 编译成功率高

代价是：

- 主命令注册表仍然掌握在 `cli.js` 手里
- `src/` 中新增的命令，必须想办法接入到 `cli.js`

## 3. 当前 patch 到底在做什么

当前脚本是 [`scripts/patch-cli-sidecar.mjs`](/home/vscode/projects/claudecode/package/claude-code-2.1.88/scripts/patch-cli-sidecar.mjs)。

它的职责不是“任意修改 `cli.js`”，而是做两类非常具体的补丁：

1. 把 `src/commands/index/cliBundle.mjs` 导出的命令对象注入到 `cli.js`
2. 把 `package.json.version` 同步到 `cli.js` 中所有 Claude Code 版本块

命令注入目前包含：

- `indexBuiltinCommand`
- `pinBuiltinCommand`
- `unpinBuiltinCommand`

也就是说，`src/commands/index/cliBundleEntry.ts` 虽然能产出独立 bundle，但如果不 patch `cli.js`：

- `cli.js` 不会 import 这些命令
- 主命令列表里不会注册这些命令
- 编译出来的 `claudecode` 也就不会认识这些命令

## 4. 为什么“新增功能”经常触发这个问题

因为你现在新增的大多不是“被某个已有模块自动调用的内部逻辑”，而是：

- 新的 builtin command
- 新的 slash command
- 新的主 CLI 注册项
- 新的入口级行为

这些功能都需要经过“主入口注册表”才能生效。

而当前主入口注册表仍然在 `cli.js` 这个发布 bundle 里，不在你可直接维护的 `src/main.tsx` 构建结果里。

所以会表现为：

- 代码已经写在 `src/` 里了
- bundle 也打出来了
- 但最终 `claudecode` 里还是没有这个功能

根因不是代码没写对，而是 **入口没有接上**。

## 5. 哪些改动通常必须 patch `cli.js`

以下改动大概率需要：

- 新增 builtin command，并希望 `claudecode <command>` 直接可用
- 修改主命令集合的注册顺序或可见性
- 修改 `--version`、`--help`、包名/产品名等入口级展示
- 修改 `cli.js` 中已经硬编码的发布时常量

## 6. 哪些改动通常不需要 patch `cli.js`

以下改动通常不需要：

- 已经被 `cli.js` 引用到的模块内部逻辑调整
- 已有命令执行路径中的实现细节修复
- `src/commands/index/cliBundle.mjs` 已导出且已接入的命令内部行为修改

判断标准很简单：

- 如果改动只是“已有入口下面的实现”，通常不用 patch
- 如果改动需要“让入口认识一个新东西”，通常要 patch

## 7. 为什么之前看起来“没有说明”

因为这个 patch 本质上是仓库本地构建策略的一部分，不是上游官方源码结构的一部分。

上游发布物默认不会附带“你本地如何把逆向恢复出来的 sidecar 命令重新接回去”的文档；这属于当前仓库为适配本地重编译而额外维护的知识。

之前仓库里已经有：

- `scripts/patch-cli-sidecar.mjs`
- `build:command-bundle`
- `compile:bun`

但缺少一份明确说明“为什么这一步存在”的文档，所以读起来像是“有个神秘 patch 必须跑”，而不是“入口接线步骤”。

## 8. 以后新增命令时的判断流程

1. 先在 `src/` 中实现命令逻辑
2. 确认它是否已经被某个现有入口引用
3. 如果它是新命令且最终要出现在主 CLI 中，就需要让 `cli.js` 能 import 并注册它
4. 优先把这种接线写进 `scripts/patch-cli-sidecar.mjs`，不要手工直接改 `cli.js`
5. 重新执行 `bun run compile:bun`
6. 用 `--help`、命令名、`--version` 做结果验证

## 9. 当前仓库的推荐原则

- `package.json` 是版本号单一来源
- `scripts/patch-cli-sidecar.mjs` 是 published 入口补丁入口
- 尽量把对 `cli.js` 的修改收敛到脚本里，不要手工散改
- 如果未来能恢复完整源码级构建，再考虑彻底取消 `--published` 路径下的 patch

## 10. 一句话总结

现在不是“新增功能一定要 patch `cli.js`”，而是：

**只要新增功能需要进入当前 published 主入口，而当前主入口仍是上游恢复的 `cli.js`，就必须通过 patch 把它接进去。**
