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

## 2. 当前目录说明

这个目录最初不是完整的“可从 `src/` 直接重建”的源码树：

- 根目录缺失原始 `package.json`
- `src/` 依赖部分生成文件，但当前目录里并不完整
- `node_modules` 是裁剪后的发布依赖，不适合直接做源码级重打包

因此当前采用的是：

1. 先重建 `package.json`
2. 从同版本 npm tarball 恢复发布入口 `cli.js`
3. 使用 Bun 直接把发布入口编译成本地二进制

这条路径更稳定，也更贴近“这个包”的真实发布形态。

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

当前编译/安装流程依赖这些文件：

- `package.json`
- `scripts/bun-build.mjs`
- `cli.js`
- `vendor/audio-capture/*`
- `vendor/ripgrep/*`

其中：

- `package.json` 已改成 `claudecode`
- `scripts/bun-build.mjs` 会优先使用根目录 `cli.js` 作为 Bun 编译入口
- `cli.js` 来自 `@anthropic-ai/claude-code@2.1.88` 的发布包

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

在项目根目录执行：

```bash
bun run compile:bun
```

等价逻辑：

- 入口：`cli.js`
- 输出：`dist/claudecode`
- 类型：Bun standalone executable

编译成功后可看到：

```bash
ls -lh dist/claudecode
```

## 7. 安装命令

安装到当前用户目录：

```bash
bun run install:local
```

实际执行的是：

```bash
mkdir -p ~/.local/bin
install -m 755 dist/claudecode ~/.local/bin/claudecode
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

当前实测输出：

```text
2.1.88 (Claude Code)
```

### 验证帮助页

```bash
~/.local/bin/claudecode --help
```

## 9. 已知限制

当前二进制文件名已经改成了 `claudecode`，安装路径也是：

```text
~/.local/bin/claudecode
```

但是因为编译入口使用的是上游已发布的 `cli.js`，它内部仍然保留了上游的部分硬编码文案，所以会看到：

- `--version` 仍显示 `Claude Code`
- `--help` 的 Usage 可能仍显示 `claude`

这不影响可执行文件名、安装位置和实际运行方式，但如果你要把所有 CLI 文案也完全改成 `claudecode`，就需要继续改上游打包后的 `cli.js`，或者回到完整源码仓库做一次真正的源码级重构。

## 10. 重新编译

后续如果你改了 `cli.js`、`package.json` 或 `scripts/bun-build.mjs`，重新执行：

```bash
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

## 12. 推荐使用方式

如果 `~/.local/bin` 已在 `PATH` 中，直接执行：

```bash
claudecode
```

如果没有在 `PATH` 中，临时执行：

```bash
~/.local/bin/claudecode
```
