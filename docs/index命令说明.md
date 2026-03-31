# /index 命令说明

## 目标

`/index` 用来给当前代码库生成一份可读、可枚举、可二次消费的结构化索引。

它会生成：

1. Python skeleton 工程
2. JSONL 结构化索引
3. 指向共享索引的 skill 文档

默认输出目录：

`./.code_index/`

## 用法

```text
/index
/index src
/index . --output .code_index
/index --max-file-bytes 1048576
```

参数说明：

- `path`：可选，索引根目录，默认当前工作目录
- `--output DIR`：可选，输出目录，默认 `<root>/.code_index`
- `--max-file-bytes N`：可选，单文件最大读取字节数，默认 `524288`

## 输出结构

```text
.code_index/
├── skeleton/
│   ├── __root__.py
│   └── ...
└── index/
    ├── manifest.json
    ├── modules.jsonl
    ├── symbols.jsonl
    ├── edges.jsonl
    └── summary.md

.claude/
└── skills/
    └── code-index/
        └── SKILL.md

.codex/
└── skills/
    └── code-index/
        └── SKILL.md
```

## 当前实现特点

- 内置在 Claude Code 里，不需要外部工具链
- TypeScript/TSX/JavaScript/JSX 走启发式结构解析
- Python 走缩进和函数头解析
- 其他语言走 generic fallback
- 单文件解析失败不会中断全局构建
- 大文件会按 `--max-file-bytes` 截断读取，并在索引中记录

## 代码位置

- `src/commands/index/`
- `src/indexing/`

## 当前仓库样例结果

当前仓库已经生成一版：

- `.code_index/index/summary.md`
- `.code_index/index/manifest.json`
- `.code_index/skeleton/`
