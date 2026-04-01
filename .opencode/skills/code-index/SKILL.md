---
name: code-index
description: Use the shared code index under .code_index to inspect repo structure, navigate entry points, and find implementation files.
---

# Code Index

## Instructions
- Start with `./.code_index/__index__.py` for entry points, top directories, and high-priority symbols.
- Read `./.code_index/index/summary.md` for a human-readable overview.
- Browse `./.code_index/skeleton/` as the primary structure view; skeleton functions include concise stub calls instead of full method bodies.
- Use `./.code_index/index/modules.jsonl` and `./.code_index/index/symbols.jsonl` only when you need exact module or symbol-level detail.
- The skeleton is valid Python with lightweight call stubs, inheritance, and constructor assignments for easier grep and AST-based lookup.
- If the index is stale after edits, rerun `/index`.
