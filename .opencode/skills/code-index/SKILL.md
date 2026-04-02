---
name: code-index
description: Use the shared code index under .code_index to inspect repo structure, navigate entry points, and find implementation files.
---

# Code Index

## Instructions
- Start with `./.code_index/index/architecture.dot` for the smallest file-level dependency map. Outgoing edges show what a file depends on; incoming edges show likely impact.
- Then use `./.code_index/__index__.py` for entry points, top directories, and high-priority symbols.
- Read `./.code_index/index/summary.md` for a human-readable overview.
- Browse `./.code_index/skeleton/` when you need method-level detail; skeleton functions include concise stub calls instead of full method bodies.
- Use `./.code_index/index/modules.jsonl` and `./.code_index/index/symbols.jsonl` only when you need exact module or symbol-level detail.
- If a file is missing from the DOT, no internal file-level dependency edge was resolved for it; jump straight to the skeleton or JSON index.
- The skeleton is valid Python with lightweight call stubs, inheritance, and constructor assignments for easier grep and AST-based lookup.
- If the index is stale after edits, rerun `/index`.
