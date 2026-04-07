---
name: "memory-index"
description: "Use the generated memory index under ./.memory_index as a durable project memory map for user prompts, plans, and code diffs."
when_to_use: "Use this when the task depends on project history: previous user requests, earlier plans, prior code edits, why code changed, or what happened in earlier sessions. Prefer it before reading raw transcript files or plan files."
---

# Memory Index

## Instructions
- This is a blocking first step whenever `./.memory_index/` already exists and the task is about project history, prior user requests, previous plans, earlier code edits, or why code changed.
- Start with `./.memory_index/index/summary.md` for the high-level view of sessions, prompts, plans, and edits.
- Then read `./.memory_index/project_memory_graph.py` for the project-level relation map: active constraints/preferences, full plan history, session-to-session links, file memory, and compact edit ranges.
- Then read `./.memory_index/__index__.py` for recent sessions, prompts, plans, code edits, semantic memory objects, hot files, and the schema note telling you where the durable memory source lives.
- Use `./.memory_index/index/sessions.jsonl` when you need full-history session summaries for old-memory lookup beyond the recent window.
- Use `./.memory_index/index/sessions.dot` when you need the full-history session timeline and a compact map from sessions to touched files.
- Use `./.memory_index/index/architecture.dot` when you want the recent high-signal event graph between transcripts, prompts, plans, edits, and touched files.
- This memory index is built from raw transcript JSONL under `./.claude/projects/context/transcripts`, project-local file-history snapshots under `./.claude/projects/context/file-history`, matching legacy raw Claude transcript/file-history under `~/.claude/projects` + `~/.claude/file-history` hydrated into the project context, and matching Codex session logs under `~/.codex/sessions`; it is not built from compressed context summary files.
- Use `./.memory_index/index/memory_objects.jsonl` as the derived semantic layer for long-term user preferences, stable constraints, decision rationales, and superseded decisions. When exact wording matters, verify against `./.memory_index/index/events.jsonl`.
- Use `./.memory_index/index/events.jsonl` as the source of truth: `user_prompt.fullText/rawContent` for full user input, `plan.content` for full plan text, and `code_edit.files[].lineRanges` for compact edit locations like `src/foo.ts: L12::L28`.
- Use `./.memory_index/index/edges.jsonl` and `./.memory_index/index/transcripts.jsonl` when you need exact relationships or need to jump back to the source transcript file.
- Do NOT treat `.claude/context/session_state.py`, `.claude/context/session_history.py`, `.claude/context/session_metrics.py`, or session-memory notes as source of truth. Those are lossy compact summaries.
- Treat the memory index as a durable memory map. Summary files are previews; `events.jsonl` is the durable memory source. Only read the raw transcript or plan file when `events.jsonl` does not already preserve the exact detail you need.
- If both `memory-index` and `code-index` exist, use `memory-index` for history/decision/change-tracking questions and `code-index` for repository structure and implementation navigation.
- Only fall back to raw project-local transcript JSONL, matching `~/.codex/sessions` logs, or plan files when the memory index is stale, missing, or insufficient for the question at hand.
- If the memory index is stale after new conversation turns or edits, rerun `/memory-index`.
