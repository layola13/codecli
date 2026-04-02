# full preview 设计与落地

## 当前结论

当前 `ant` 分支已经能产出可运行的 v2 preview：

- `--delegate-permissions` 出现在 `--help`
- `task/log/export/error` 命令可注册
- `rollback` / `up` 命令可注册
- `src/screens/REPL.tsx` 中的 ANT-only 组件引用不再缺失
- `bun run verify:preview` 输出 `full-preview-candidate`

## 实际落地方案

### 1. 统一源码分支语义

把源码中的：

- `"external" === 'ant'`
- `'external' === 'ant'`

统一替换为：

```ts
process.env.USER_TYPE === 'ant'
```

这样标准版和预览版都能继续走同一套源码，只靠构建参数分流。

### 2. 在构建时注入不同的 `USER_TYPE`

`scripts/bun-build.mjs` 当前行为：

- 标准构建：`--define process.env.USER_TYPE="external"`
- 预览构建：`--define process.env.USER_TYPE="ant"`

这样 bundler 可以做常量折叠和 DCE，不需要对 bundle 产物做 post-build 字符串替换。

### 3. 补齐缺失 ANT 模块

当前至少已补齐：

- `src/cli/handlers/ant.ts`
- `src/components/AntModelSwitchCallout.tsx`
- `src/components/UndercoverAutoCallout.tsx`
- `src/components/FeedbackSurvey/useFrustrationDetection.ts`
- `src/hooks/notifs/useAntOrgWarningNotification.ts`
- `src/utils/sessionDataUploader.ts`
- `src/cli/up.ts`
- `src/cli/rollback.ts`
- `src/utils/eventLoopStallDetector.ts`
- `src/utils/sdkHeapDumpMonitor.ts`
- `src/utils/ccshareResume.ts`

补齐策略：

1. 必须能注册 CLI 命令的，补最小可调用实现
2. 只为避免模块解析失败的，补 no-op 导出

## 为什么没有采用 Bun `feature()` 宏方案

- Bun 1.3.11 对 `feature()` 的允许位置很窄。
- 这个仓库里很多 `feature()` 存在于 `&&`、JSX 短路、对象 spread、函数体返回值等位置。
- 把这些全部改造成 Bun 可接受的形式，会引入大量非预览目标的侵入式重构。
- 因此 v2 只解决 preview 真正依赖的 `USER_TYPE` 与字面量 ANT 分支，不把 `feature()` 纳入当前范围。

## 构建与验收

```bash
bun run build:bun:preview
bun run compile:bun:preview
bun run verify:preview
./dist/claudenative --help | rg 'delegate-permissions|agent-teams|rollback|task|log|export|up'
bun dist/claudecode.js --version
```

预期结果：

- `verify-preview-build` 输出 `full-preview-candidate`
- help 中能看到 preview CLI 表面
- 标准版 `dist/claudecode` 行为不回归

## 残余风险

- 目前的 stub 主要保证可构建、可注册、可进入帮助页，不保证内部服务语义完整。
- 某些 ANT-only 分支即使已开启，仍可能依赖内部数据源、内部后端或内部发布基础设施。
- `feature()` 宏相关的内部实验路径仍未暴露给 preview。
