# claudecode 编译与安装文档

## 0.获取

```bash
    npm install -g reverse-sourcemap
    curl -O https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.88.tgz
    tar xvzf claude-code-2.1.88.tgz
    cd package
    reverse-sourcemap --output-dir ./claude-code-2.1.88 cli.js.map
```

## 1. 目标

将原始发布程序名 `claude` 改为本地可执行文件名 `claudecode`，并使用 Bun 编译、安装到当前用户目录。

当前本地约定：

- 包名：`claudecode`
- 可执行名：`claudecode`
- 编译产物：`dist/claudecode`
- 安装位置：`~/.local/bin/claudecode`

预览版补充约定：

- 预览可执行名：`claudenative`
- 预览编译产物：`dist/claudenative`
- 预览安装位置：`~/.local/bin/claudenative`

## 2. 当前目录说明

这个目录最初不是完整的“可从 `src/` 直接重建”的源码树：

- 根目录缺失原始 `package.json`
- `src/` 依赖部分生成文件，但当前目录里并不完整
- `node_modules` 是裁剪后的发布依赖，不适合直接做源码级重打包

因此当前采用两条编译路径：

1. 默认本地路径：直接从 `src/entrypoints/cli.tsx` 做源码级 Bun 编译
2. 兼容兜底路径：继续保留基于发布包 `cli.js` 的 patch 编译

其中本地开发默认走第一条，不再依赖 `cli.js patch`。

## 3. 前置条件

需要本机已经安装 Bun。

检查命令：

```bash
bun --version
```

当前环境实测版本：

```text
1.3.11
```

## 4. 关键文件

当前源码直编依赖这些文件：

- `package.json`
- `scripts/bun-build.mjs`
- `scripts/postinstall.sh`
- `src/entrypoints/cli.tsx`
- `shims/*`
- `vendor/audio-capture/*`
- `vendor/ripgrep/*`

其中：

- `package.json` 已改成 `claudecode`，并补齐了源码直编依赖
- `scripts/bun-build.mjs` 支持 `--source` / `--published` 显式选择编译入口
- `scripts/postinstall.sh` 会补齐 `@ant/*` stub，以及修复本地 `sandbox-runtime` 的包入口
- `cli.js` 和 `scripts/patch-cli-sidecar.mjs` 现在仅用于兼容兜底的发布包编译

## 5. `cli.js` 的获取方式

这里的 `cli.js` 不是当前目录里的 `src/` 直接编出来的。

实际采用的方法是从 npm 上拿同版本发布包，再把里面的 `cli.js` 提取出来：

```bash
mkdir -p .tmp
cd .tmp
npm pack @anthropic-ai/claude-code@2.1.88 --silent
tar -xzf anthropic-ai-claude-code-2.1.88.tgz
cp package/cli.js ../cli.js
```

实际恢复时还一并取回了这些运行时文件：

```bash
cp package/sdk-tools.d.ts ../sdk-tools.d.ts
cp package/LICENSE.md ../LICENSE.md
cp package/README.md ../README.md
cp package/bun.lock ../bun.lock
cp -R package/vendor/audio-capture ../vendor/audio-capture
cp -R package/vendor/ripgrep ../vendor/ripgrep
```

所以更准确地说：

- `cli.js` 是“从同版本已发布 tarball 恢复出来的入口文件”
- 不是“由当前目录源码自动生成的 bundle”

## 6. 编译命令

首次安装依赖时建议：

```bash
AUTHORIZED=1 bun install
```

其中 `AUTHORIZED=1` 只是绕过上游保留的发布保护脚本，不影响本地开发编译。

在项目根目录执行默认本地编译：

```bash
bun run compile:bun
```

现在默认本地构建链是：

```bash
bun scripts/bun-build.mjs --compile --source
```

预览版本地构建链是：

```bash
bun scripts/bun-build.mjs --compile --source --preview
```

如果你想先清空旧产物，再做一次干净重编译，执行：

```bash
rm -rf dist
bun run compile:bun
```

其中：

- 入口：`src/entrypoints/cli.tsx`
- 输出：`dist/claudecode`
- 类型：Bun standalone executable
- `/index`、`/pin`、`/unpin`、`/compress`、`/compress-status` 都直接来自源码命令注册链

如果要构建预览版，可直接执行：

```bash
bun run compile:bun:preview
```

其中：

- 入口：`src/entrypoints/cli.tsx`
- 输出：`dist/claudenative`
- 类型：Bun standalone executable
- 会同时开启 `process.env.USER_TYPE === 'ant'` 与原先 `"external" === 'ant'` 对应的 preview 分支
- 当前实测 `--help` 已包含 `--delegate-permissions`、`task`、`log`、`export`、`rollback`、`up`
- 不额外切换 Bun `feature()` 宏对应的内部实验能力
- 运行时 API 地址不做硬编码，直接读取 `ANTHROPIC_BASE_URL`

预览版联机测试建议直接按环境变量传入代理地址：

```bash
env ANTHROPIC_BASE_URL=http://your-proxy.example ./dist/claudenative --print "hello"
```

如果要跑预览冒烟脚本，也同样按环境变量传入：

```bash
env ANTHROPIC_BASE_URL=http://your-proxy.example bun run smoke:preview
```

`smoke:preview` 在检测到 `ANTHROPIC_BASE_URL` 后，会额外执行一次 `--print "hello"` 联机检查；未设置时只做离线命令可用性检查。

兼容兜底的发布包路径保留为：

```bash
bun run compile:bun:published
```

它的等价逻辑仍然是：

- 先生成：`src/commands/index/cliBundle.mjs`
- 再执行：`scripts/patch-cli-sidecar.mjs`
- 入口：`cli.js`
- 额外挂载：`src/commands/index/cliBundle.mjs`
- 输出：`dist/claudecode`
- 类型：Bun standalone executable

这里最容易误解的一点现在变成：

- 默认 `compile:bun` 已经不再走 `cli.js`
- `src/commands/index/cliBundle.mjs` 只在 `compile:bun:published` 这条兼容路径里作为 sidecar 使用
- 只有继续走发布包编译时，新增命令才需要通过 `scripts/patch-cli-sidecar.mjs` 注入到 `cli.js`

详细说明见：

- `docs/cli.js-patch机制说明.md`

编译成功后可看到：

```bash
ls -lh dist/claudecode
```

本次实测也已验证过下面这条干净编译链是可用的：

```bash
rm -rf dist
bun run compile:bun
```

## 7. 安装命令

安装到当前用户目录：

```bash
bun run install:local
```

实际执行的是：

```bash
mkdir -p ~/.local/bin
cp dist/claudecode ~/.local/bin/claudecode.tmp
chmod 755 ~/.local/bin/claudecode.tmp
mv ~/.local/bin/claudecode.tmp ~/.local/bin/claudecode
```

如果要一条命令完成重新编译和安装，可以直接执行：

```bash
bun run rebuild:local
```

预览版对应命令：

```bash
bun run rebuild:local:preview
```

## 8. 验证

### 验证二进制存在

```bash
ls -l ~/.local/bin/claudecode
file ~/.local/bin/claudecode
```

### 验证版本

```bash
~/.local/bin/claudecode --version
```

当前实测输出应类似：

```text
2.1.88+local.3 (Claude Code)
```

### 验证帮助页

```bash
~/.local/bin/claudecode --help
```

### 验证预览版分层

```bash
bun run verify:preview
bun run smoke:preview
./dist/claudenative --help | rg 'delegate-permissions|agent-teams|rollback|task|log|export|up'
```

默认会检查 `dist/claudenative.js`，若不存在则回退到 `dist/claudenative`。
当前预期输出为 `Tier: full-preview-candidate`。

## 9. 已知限制

当前二进制文件名已经改成了 `claudecode`，安装路径也是：

```text
~/.local/bin/claudecode
```

默认本地编译现在已经不走上游发布入口 `cli.js`，但产品名文案本身仍然大多沿用上游，所以会看到：

- `--version` 仍显示 `Claude Code`
- `--help` 的 Usage 可能仍显示 `claude`

这不影响可执行文件名、安装位置和实际运行方式，但如果你要把所有 CLI 文案也完全改成 `claudecode`，就需要继续改上游打包后的 `cli.js`，或者回到完整源码仓库做一次真正的源码级重构。

## 10. 重新编译

后续如果你改了源码、`package.json` 或 `scripts/bun-build.mjs`，重新执行：

```bash
bun run compile:bun
bun run install:local
```

如果你希望每次都先删除旧产物，再重新编译：

```bash
rm -rf dist
bun run compile:bun
bun run install:local
```

## 11. 卸载

删除本地安装文件即可：

```bash
rm -f ~/.local/bin/claudecode
```

如果还要清理编译产物：

```bash
rm -f dist/claudecode
```

## 12. 修改版本号

现在版本号已经改成 **单一来源**：

- 唯一手工修改位置：`package.json`

构建时会自动同步到两条路径：

- `scripts/bun-build.mjs` 会读取 `package.json.version`
- `scripts/patch-cli-sidecar.mjs` 会把 `cli.js` 中的发布版本块同步成 `package.json.version`

### 修改步骤

```bash
# 1. 只修改 package.json
sed -i 's/"version": "2.1.88+local.3"/"version": "2.1.88+local.4"/' package.json

# 2. 重新编译安装
bun run compile:bun
bun run install:local

# 3. 验证
~/.local/bin/claudecode --version
```

### 验证版本号同步

```bash
grep '"version"' package.json
~/.local/bin/claudecode --version
```

---

## 13. 推荐使用方式

如果 `~/.local/bin` 已在 `PATH` 中，直接执行：

```bash
claudecode
```

如果没有在 `PATH` 中，临时执行：

```bash
~/.local/bin/claudecode
```
