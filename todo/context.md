

# Context 压缩器：完整明细实现方案

## 一、问题定义：为什么"对话历史"是 LLM 最大的性能瓶颈

```
典型场景：你和 Cursor Agent 讨论了 40 轮，消耗了 80,000 tokens。

第 41 轮时：
- Agent 已经忘了第 5 轮你说的"不要用 Axios"
- Agent 重复建议你用已经被否决的方案
- Agent 读不到第 12 轮你确认的数据库 Schema 设计
- 因为前 40 轮的原始文本塞满了 Context Window

根本原因：
  原始对话 = 信号(5%) + 噪音(95%)
  信号 = 决策、约束、进度、锚点
  噪音 = 寒暄、重复、废弃的讨论分支、冗长的代码块
```

---

## 二、压缩器架构总览

```
┌─────────────────────────────────────────────────────────┐
│                    对话流 (Raw Stream)                    │
│  User: "不要用 Axios，改用原生 fetch"                      │
│  Agent: "好的，我会使用 fetch API..."                      │
│  User: "AuthService 需要支持多租户"                        │
│  Agent: "我建议使用 Schema-per-tenant..."                  │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              第一层：规则提取器 (Rule Extractor)            │
│  - 检测决策语句 (Decision Detector)                       │
│  - 检测否定/拒绝 (Rejection Detector)                     │
│  - 检测任务完成 (Progress Detector)                       │
│  - 检测代码锚点 (Anchor Detector)                         │
│  - 检测约束条件 (Constraint Detector)                     │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              第二层：状态合并器 (State Merger)              │
│  - 增量合并 (Incremental Merge)                          │
│  - 冲突解决 (Conflict Resolution)                        │
│  - 版本标记 (Version Tagging)                            │
│  - 衰减淘汰 (Decay & Eviction)                          │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              第三层：Python 序列化器 (Serializer)          │
│  - 输出 session_state.py                                │
│  - 输出 session_history.py (归档)                       │
│  - 输出 session_metrics.py (诊断)                       │
└─────────────────────────────────────────────────────────┘
```

---

## 三、核心数据模型

```python
# context_compressor/models.py
# ────────────────────────────────────────────────────────────────
# Context 压缩器的核心数据模型
# 每一个字段都有明确的语义定义和更新规则
# ────────────────────────────────────────────────────────────────

from __future__ import annotations
import time
import hashlib
from dataclasses import dataclass, field
from typing import Any, Optional, Literal
from enum import Enum


# ═══════════════════════════════════════════════════════════════
# 1. 原子级数据单元 (Atomic Units)
# ═══════════════════════════════════════════════════════════════

class DecisionStatus(Enum):
    """决策的生命周期状态"""
    PROPOSED = "proposed"       # 被提出但未确认
    ACCEPTED = "accepted"       # 被用户确认采纳
    REJECTED = "rejected"       # 被用户明确拒绝
    SUPERSEDED = "superseded"   # 被更新的决策覆盖
    REVERTED = "reverted"       # 被回滚到之前的状态


class FactConfidence(Enum):
    """知识事实的置信度"""
    CERTAIN = "certain"         # 用户明确陈述或代码中验证
    INFERRED = "inferred"       # 从上下文推断
    UNCERTAIN = "uncertain"     # 模糊信息，需要确认


class TaskStatus(Enum):
    """任务状态"""
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    DONE = "done"
    ABANDONED = "abandoned"


@dataclass
class Decision:
    """
    一个决策点
    
    更新规则：
    - 新决策如果与旧决策的 topic 相同，旧决策标记为 SUPERSEDED
    - 被拒绝的决策永远不会被自动恢复
    - 每个决策必须记录 reason（防止重复讨论）
    """
    id: str                     # 唯一标识: "decision_{topic_hash}_{turn}"
    topic: str                  # 决策主题: "http_client_choice"
    choice: str                 # 最终选择: "native fetch"
    alternatives_rejected: list[str] = field(default_factory=list)
    reason: str = ""            # 选择原因
    status: DecisionStatus = DecisionStatus.ACCEPTED
    created_at_turn: int = 0    # 在第几轮创建
    updated_at_turn: int = 0    # 最后更新轮次
    supersedes: Optional[str] = None  # 覆盖了哪个旧决策的 id
    
    def to_python_line(self) -> str:
        """序列化为一行 Python 赋值语句"""
        var_name = _to_var_name(self.topic)
        rejected = self.alternatives_rejected
        comment_parts = [f"turn {self.created_at_turn}"]
        if rejected:
            comment_parts.append(f"rejected: {rejected}")
        if self.reason:
            comment_parts.append(self.reason[:60])
        comment = " | ".join(comment_parts)
        return f'        {var_name} = "{_escape(self.choice)}"  # {comment}'


@dataclass
class Constraint:
    """
    约束条件：用户明确设定的"不可违反"的规则
    
    更新规则：
    - 约束一旦设定，只有用户明确撤销才能移除
    - 约束冲突时，后设定的覆盖先设定的（但保留历史记录）
    """
    id: str
    category: str               # "technology" | "architecture" | "style" | "process"
    rule: str                   # "不要使用 Axios"
    reason: str = ""            # "项目规定使用原生 API"
    severity: str = "hard"      # "hard" = 必须遵守 | "soft" = 建议遵守
    created_at_turn: int = 0
    is_active: bool = True      # 是否仍然有效
    
    def to_python_line(self) -> str:
        var_name = _to_var_name(f"{self.category}_{self.id[-6:]}")
        severity_marker = "🚫" if self.severity == "hard" else "⚠️"
        return (
            f'        {var_name} = '
            f'"{_escape(self.rule)}"'
            f'  # {severity_marker} {self.reason[:40]}'
        )


@dataclass
class KnowledgeFact:
    """
    知识事实：关于项目、技术或业务的确定性信息
    
    更新规则：
    - 同一 key 的事实被更新时，保留最新值
    - confidence == UNCERTAIN 的事实在 10 轮后自动衰减
    - 与代码骨架关联的事实永不衰减
    """
    key: str                    # "database_type" | "api_base_url" | ...
    value: Any                  # "PostgreSQL" | "https://api.example.com"
    category: str = "general"   # "tech_stack" | "business" | "architecture"
    confidence: FactConfidence = FactConfidence.CERTAIN
    source_turn: int = 0        # 在哪一轮获得这个信息
    linked_skeleton: Optional[str] = None  # 关联的骨架路径
    
    def to_python_line(self) -> str:
        var_name = _to_var_name(self.key)
        conf_marker = {
            FactConfidence.CERTAIN: "✓",
            FactConfidence.INFERRED: "~",
            FactConfidence.UNCERTAIN: "?"
        }[self.confidence]
        
        value_str = f'"{_escape(str(self.value))}"' \
            if isinstance(self.value, str) else repr(self.value)
        
        parts = [f"{conf_marker} turn {self.source_turn}"]
        if self.linked_skeleton:
            parts.append(f"→ {self.linked_skeleton}")
        comment = " | ".join(parts)
        
        return f'        {var_name} = {value_str}  # {comment}'


@dataclass
class TaskRecord:
    """
    任务进度记录
    
    更新规则：
    - Agent 报告完成某步骤时，移入 completed
    - 如果出错，记录错误信息并标记为 BLOCKED
    - ABANDONED 的任务保留 30 轮后自动清除
    """
    id: str
    description: str
    status: TaskStatus = TaskStatus.PLANNED
    subtasks: list[str] = field(default_factory=list)
    completed_subtasks: list[str] = field(default_factory=list)
    blockers: list[str] = field(default_factory=list)
    artifacts: list[str] = field(default_factory=list)   # 产出的文件路径
    error_log: list[str] = field(default_factory=list)    # 失败记录
    created_at_turn: int = 0
    updated_at_turn: int = 0
    
    def to_python_block(self, indent: int = 2) -> list[str]:
        prefix = "    " * indent
        lines = []
        var_name = _to_var_name(self.id)
        
        lines.append(f"{prefix}class {var_name}:")
        lines.append(
            f'{prefix}    description = '
            f'"{_escape(self.description)}"'
        )
        lines.append(
            f'{prefix}    status = "{self.status.value}"'
        )
        
        if self.completed_subtasks:
            lines.append(
                f"{prefix}    completed = "
                f"{self.completed_subtasks}"
            )
        
        remaining = [
            s for s in self.subtasks 
            if s not in self.completed_subtasks
        ]
        if remaining:
            lines.append(
                f"{prefix}    remaining = {remaining}"
            )
        
        if self.blockers:
            lines.append(
                f"{prefix}    blockers = {self.blockers}"
            )
        
        if self.artifacts:
            lines.append(
                f"{prefix}    artifacts = {self.artifacts}"
            )
        
        if self.error_log:
            lines.append(f"{prefix}    # Past errors (DO NOT repeat):")
            for err in self.error_log[-3:]:
                lines.append(
                    f'{prefix}    # ✗ {_escape(err)[:80]}'
                )
        
        return lines


@dataclass
class CodeAnchor:
    """
    代码锚点：当前讨论涉及的代码位置
    
    更新规则：
    - 每次 Agent 读取或修改文件时，自动添加/更新锚点
    - 最多保留 20 个最近的锚点
    - 如果锚点关联了骨架路径，标记为 persistent
    """
    file_path: str
    line_start: int = 0
    line_end: int = 0
    symbol_name: str = ""       # "AuthService.validate"
    skeleton_path: Optional[str] = None  # 对应的骨架文件路径
    action: str = "read"        # "read" | "modified" | "created" | "deleted"
    turn: int = 0
    note: str = ""              # "发现了一个竞态条件"
    
    def to_python_line(self) -> str:
        location = f"{self.file_path}:{self.line_start}"
        if self.line_end > self.line_start:
            location += f"-{self.line_end}"
        
        parts = [f'"{location}"']
        if self.symbol_name:
            parts.append(f"symbol={self.symbol_name}")
        parts.append(f"action={self.action}")
        if self.skeleton_path:
            parts.append(f"skeleton={self.skeleton_path}")
        if self.note:
            parts.append(f"note=\"{_escape(self.note)[:50]}\"")
        
        return f"        ({', '.join(parts)}),"


@dataclass 
class ErrorMemory:
    """
    错误记忆：记录失败的尝试，防止重复犯错
    
    更新规则：
    - 每次 Agent 尝试但失败的方案都必须记录
    - 错误记忆永不自动衰减（除非用户要求重试）
    - 带有具体的"为什么失败"信息
    """
    approach: str               # "尝试使用 Webpack 5 的 Module Federation"
    failure_reason: str          # "与 Next.js 13 的 App Router 不兼容"
    turn: int = 0
    related_files: list[str] = field(default_factory=list)
    
    def to_python_line(self) -> str:
        return (
            f'        "{_escape(self.approach)[:60]}"'
            f'  # ✗ {_escape(self.failure_reason)[:50]} '
            f'(turn {self.turn})'
        )


# ═══════════════════════════════════════════════════════════════
# 2. 完整状态容器 (State Container)
# ═══════════════════════════════════════════════════════════════

@dataclass
class SessionState:
    """
    完整的会话状态：所有压缩后的信息都存在这里
    
    大小控制：
    - decisions: 最多 30 条 (SUPERSEDED 的定期清理)
    - constraints: 最多 20 条 (is_active=False 的定期清理)
    - facts: 最多 50 条 (UNCERTAIN 的定期衰减)
    - tasks: 最多 15 条 (DONE/ABANDONED 超过 30 轮的清理)
    - code_anchors: 最多 20 条 (按 turn 排序保留最新的)
    - error_memories: 最多 10 条 (永不自动清除)
    """
    # ── 元数据 ──
    session_id: str = ""
    primary_goal: str = ""
    goal_status: str = "in_progress"
    total_turns: int = 0
    created_at: float = 0.0
    last_updated: float = 0.0
    
    # ── 项目上下文（通常在前 5 轮就确定） ──
    project_name: str = ""
    project_type: str = ""      # web / cli / library / microservice
    tech_stack: list[str] = field(default_factory=list)
    architecture_style: str = ""
    
    # ── 六大状态槽位 (Six State Slots) ──
    decisions: list[Decision] = field(default_factory=list)
    constraints: list[Constraint] = field(default_factory=list)
    facts: list[KnowledgeFact] = field(default_factory=list)
    tasks: list[TaskRecord] = field(default_factory=list)
    code_anchors: list[CodeAnchor] = field(default_factory=list)
    error_memories: list[ErrorMemory] = field(default_factory=list)
    
    # ── 用户偏好 ──
    preferences: dict[str, str] = field(default_factory=dict)
    
    # ── 压缩指标 ──
    raw_chars_ingested: int = 0
    compressed_chars: int = 0


# ═══════════════════════════════════════════════════════════════
# 3. 工具函数
# ═══════════════════════════════════════════════════════════════

def _to_var_name(s: str) -> str:
    """将任意字符串转为合法的 Python 变量名"""
    import re
    s = re.sub(r'[^a-zA-Z0-9_]', '_', s)
    s = re.sub(r'_+', '_', s).strip('_')
    if s and s[0].isdigit():
        s = '_' + s
    return s.lower()[:40] or "unknown"


def _escape(s: str) -> str:
    """转义字符串"""
    return (s
        .replace('\\', '\\\\')
        .replace('"', '\\"')
        .replace('\n', ' ')
        .replace('\r', '')
        .strip()
    )[:150]


def _make_id(prefix: str, content: str, turn: int) -> str:
    """生成稳定的唯一标识"""
    hash_input = f"{content}_{turn}"
    short_hash = hashlib.md5(
        hash_input.encode()
    ).hexdigest()[:8]
    return f"{prefix}_{short_hash}"
```

---

## 四、规则提取器（Rule Extractor）

```python
# context_compressor/extractors.py
# ────────────────────────────────────────────────────────────────
# 从原始对话文本中提取结构化信息的规则引擎
# 
# 设计原则：
# - 宁可漏提，不可误提（precision > recall）
# - 每种提取器独立运行，互不干扰
# - 提取结果都是原子级数据单元（Decision / Constraint / ...）
# ────────────────────────────────────────────────────────────────

from __future__ import annotations
import re
from dataclasses import dataclass, field
from typing import Optional

from .models import (
    Decision, DecisionStatus,
    Constraint,
    KnowledgeFact, FactConfidence,
    TaskRecord, TaskStatus,
    CodeAnchor,
    ErrorMemory,
    _make_id, _to_var_name
)


# ═══════════════════════════════════════════════════════════════
# 1. 提取结果容器
# ═══════════════════════════════════════════════════════════════

@dataclass
class ExtractionResult:
    """单轮对话的提取结果"""
    decisions: list[Decision] = field(default_factory=list)
    constraints: list[Constraint] = field(default_factory=list)
    facts: list[KnowledgeFact] = field(default_factory=list)
    task_updates: list[dict] = field(default_factory=list)
    code_anchors: list[CodeAnchor] = field(default_factory=list)
    error_memories: list[ErrorMemory] = field(default_factory=list)
    goal_update: Optional[str] = None
    preference_updates: dict[str, str] = field(default_factory=dict)


# ═══════════════════════════════════════════════════════════════
# 2. 决策检测器 (Decision Detector)
# ═══════════════════════════════════════════════════════════════

class DecisionDetector:
    """
    检测对话中的决策性语句
    
    正面决策模式（用户确认某个选择）：
      "就用 X"  "我决定用 X"  "选择 X"  "Go with X"
      "let's use X"  "we'll go with X"  "确认使用 X"
    
    否定决策模式（用户拒绝某个选择）：
      "不要用 X"  "不想要 X"  "别用 X"
      "don't use X"  "reject X"  "not X"
    """
    
    # 正面决策的语言模式
    ACCEPTANCE_PATTERNS = [
        # 中文
        (r'(?:就|决定|选择|采用|确认|确定)(?:使?用|采用)\s*(.+?)(?:[,，。.;；！!]|$)', 'zh'),
        (r'(?:用|使用)\s*(.+?)(?:吧|好了|就行)(?:[,，。.;；！!]|$)', 'zh'),
        (r'方案[是选]?\s*(.+?)(?:[,，。.;；！!]|$)', 'zh'),
        # 英文
        (r"(?:let'?s?\s+(?:use|go\s+with|adopt|choose))\s+(.+?)(?:[,.\s;!]|$)", 'en'),
        (r"(?:we(?:'ll)?\s+(?:use|go\s+with))\s+(.+?)(?:[,.\s;!]|$)", 'en'),
        (r"(?:i\s+(?:decide|choose|prefer|want)\s+(?:to\s+use\s+)?)\s*(.+?)(?:[,.\s;!]|$)", 'en'),
        (r"(?:go\s+with|stick\s+with|proceed\s+with)\s+(.+?)(?:[,.\s;!]|$)", 'en'),
    ]
    
    # 否定决策的语言模式
    REJECTION_PATTERNS = [
        # 中文
        (r'(?:不要|不想|别|不用|禁止|不能)(?:使?用|采用)?\s*(.+?)(?:[,，。.;；！!]|$)', 'zh'),
        (r'(.+?)(?:不行|不好|算了|放弃|不合适)', 'zh'),
        # 英文
        (r"(?:don'?t\s+use|avoid|reject|no\s+(?:more\s+)?)\s*(.+?)(?:[,.\s;!]|$)", 'en'),
        (r"(?:not\s+(?:going\s+to\s+use|using))\s+(.+?)(?:[,.\s;!]|$)", 'en'),
        (r"(.+?)\s+(?:is\s+(?:not\s+)?(?:suitable|appropriate|good)|won'?t\s+work)", 'en'),
    ]
    
    def detect(self, text: str, role: str, turn: int) -> list[Decision]:
        """从一段文本中检测决策"""
        decisions = []
        text_lower = text.lower().strip()
        
        # 只从用户消息中提取确认/拒绝决策
        # 从 Agent 消息中只提取 PROPOSED 状态的建议
        
        if role == "user":
            # 检测接受
            for pattern, lang in self.ACCEPTANCE_PATTERNS:
                matches = re.finditer(pattern, text, re.IGNORECASE)
                for match in matches:
                    choice = match.group(1).strip()
                    if len(choice) < 2 or len(choice) > 100:
                        continue
                    
                    topic = self._infer_topic(choice, text)
                    decisions.append(Decision(
                        id=_make_id("dec", topic, turn),
                        topic=topic,
                        choice=choice,
                        reason=self._extract_reason(text, match.end()),
                        status=DecisionStatus.ACCEPTED,
                        created_at_turn=turn,
                        updated_at_turn=turn
                    ))
            
            # 检测拒绝
            for pattern, lang in self.REJECTION_PATTERNS:
                matches = re.finditer(pattern, text, re.IGNORECASE)
                for match in matches:
                    rejected_thing = match.group(1).strip()
                    if len(rejected_thing) < 2 or len(rejected_thing) > 100:
                        continue
                    
                    topic = self._infer_topic(rejected_thing, text)
                    decisions.append(Decision(
                        id=_make_id("dec_rej", topic, turn),
                        topic=topic,
                        choice="[REJECTED]",
                        alternatives_rejected=[rejected_thing],
                        reason=self._extract_reason(text, match.end()),
                        status=DecisionStatus.REJECTED,
                        created_at_turn=turn,
                        updated_at_turn=turn
                    ))
        
        elif role == "assistant":
            # Agent 的建议标记为 PROPOSED
            suggest_patterns = [
                r"(?:i\s+(?:suggest|recommend|propose))\s+(?:using\s+)?(.+?)(?:[,.\s;!]|$)",
                r"(?:建议|推荐)(?:使?用)?\s*(.+?)(?:[,，。.;；！!]|$)",
                r"(?:we\s+(?:could|should|can)\s+use)\s+(.+?)(?:[,.\s;!]|$)",
                r"(?:可以(?:考虑|尝试)?(?:使?用)?)\s*(.+?)(?:[,，。.;；！!]|$)",
            ]
            for pattern in suggest_patterns:
                matches = re.finditer(pattern, text, re.IGNORECASE)
                for match in matches:
                    suggestion = match.group(1).strip()
                    if len(suggestion) < 2 or len(suggestion) > 100:
                        continue
                    
                    topic = self._infer_topic(suggestion, text)
                    decisions.append(Decision(
                        id=_make_id("dec_prop", topic, turn),
                        topic=topic,
                        choice=suggestion,
                        status=DecisionStatus.PROPOSED,
                        created_at_turn=turn,
                        updated_at_turn=turn
                    ))
        
        return decisions
    
    def _infer_topic(self, choice: str, context: str) -> str:
        """
        从选择内容和上下文推断决策主题
        
        例如：
          choice="PostgreSQL", context="数据库选型" -> "database_choice"
          choice="fetch", context="HTTP client" -> "http_client_choice"
        """
        # 关键词到主题的映射
        topic_keywords = {
            "database": ["postgres", "mysql", "mongo", "sqlite", 
                        "数据库", "db", "database", "redis"],
            "http_client": ["fetch", "axios", "got", "request", 
                           "http", "client", "api调用"],
            "auth_strategy": ["jwt", "oauth", "session", "token", 
                             "认证", "auth", "login"],
            "framework": ["react", "vue", "angular", "next", 
                         "express", "fastapi", "框架"],
            "state_management": ["redux", "zustand", "mobx", 
                                "pinia", "状态管理"],
            "testing": ["jest", "vitest", "pytest", "测试", 
                       "test", "testing"],
            "deployment": ["docker", "k8s", "kubernetes", "vercel", 
                          "部署", "deploy"],
            "styling": ["tailwind", "css", "styled", "sass", 
                       "样式", "style"],
            "orm": ["prisma", "typeorm", "drizzle", "sequelize", 
                   "sqlalchemy"],
            "bundler": ["webpack", "vite", "esbuild", "rollup", 
                       "turbopack", "打包"],
            "architecture": ["monolith", "microservice", "serverless",
                            "架构", "模式", "pattern"],
        }
        
        combined = f"{choice} {context}".lower()
        
        for topic, keywords in topic_keywords.items():
            if any(kw in combined for kw in keywords):
                return f"{topic}_choice"
        
        # 回退：用 choice 本身生成 topic
        return f"choice_{_to_var_name(choice[:20])}"
    
    def _extract_reason(self, text: str, match_end: int) -> str:
        """提取决策后面的原因说明"""
        remaining = text[match_end:match_end + 200].strip()
        
        reason_patterns = [
            r'(?:因为|原因是|由于|because|since|due to|as)\s*(.+?)(?:[。.;；]|$)',
            r'(?:,\s*|，\s*)(.+?)(?:[。.;；]|$)',
        ]
        
        for pattern in reason_patterns:
            match = re.search(pattern, remaining, re.IGNORECASE)
            if match:
                return match.group(1).strip()[:100]
        
        return ""


# ═══════════════════════════════════════════════════════════════
# 3. 约束检测器 (Constraint Detector)
# ═══════════════════════════════════════════════════════════════

class ConstraintDetector:
    """
    检测用户设定的约束条件
    
    硬约束：必须遵守
      "必须用 X"  "一定要 X"  "不允许 Y"  "must use X"
    
    软约束：建议遵守
      "尽量用 X"  "优先 X"  "prefer X"  "ideally X"
    """
    
    HARD_CONSTRAINT_PATTERNS = [
        # 强制要求
        (r'(?:必须|一定要|务必|强制|只能)(?:使?用)?\s*(.+?)(?:[,，。.;；！!]|$)', 'hard'),
        (r'(?:must|have\s+to|required\s+to|shall)\s+(?:use\s+)?(.+?)(?:[,.\s;!]|$)', 'hard'),
        # 强制禁止
        (r'(?:不允许|禁止|严禁|绝不|不可以)(?:使?用)?\s*(.+?)(?:[,，。.;；！!]|$)', 'hard_forbid'),
        (r'(?:must\s+not|forbidden|prohibited|never)\s+(?:use\s+)?(.+?)(?:[,.\s;!]|$)', 'hard_forbid'),
    ]
    
    SOFT_CONSTRAINT_PATTERNS = [
        (r'(?:尽量|优先|最好|倾向于?)(?:使?用)?\s*(.+?)(?:[,，。.;；！!]|$)', 'soft'),
        (r'(?:prefer|ideally|if\s+possible)\s+(?:use\s+)?(.+?)(?:[,.\s;!]|$)', 'soft'),
    ]
    
    def detect(self, text: str, role: str, turn: int) -> list[Constraint]:
        """只从用户消息中提取约束"""
        if role != "user":
            return []
        
        constraints = []
        
        for pattern, severity_type in self.HARD_CONSTRAINT_PATTERNS:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                rule_content = match.group(1).strip()
                if len(rule_content) < 2 or len(rule_content) > 100:
                    continue
                
                if severity_type == "hard_forbid":
                    rule_content = f"FORBIDDEN: {rule_content}"
                
                category = self._categorize_constraint(rule_content)
                constraints.append(Constraint(
                    id=_make_id("con", rule_content, turn),
                    category=category,
                    rule=rule_content,
                    reason=self._extract_reason(text, match.end()),
                    severity="hard",
                    created_at_turn=turn
                ))
        
        for pattern, _ in self.SOFT_CONSTRAINT_PATTERNS:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                rule_content = match.group(1).strip()
                if len(rule_content) < 2 or len(rule_content) > 100:
                    continue
                
                category = self._categorize_constraint(rule_content)
                constraints.append(Constraint(
                    id=_make_id("con_soft", rule_content, turn),
                    category=category,
                    rule=rule_content,
                    severity="soft",
                    created_at_turn=turn
                ))
        
        return constraints
    
    def _categorize_constraint(self, rule: str) -> str:
        rule_lower = rule.lower()
        
        tech_keywords = [
            "library", "framework", "tool", "sdk", "api",
            "库", "框架", "工具"
        ]
        arch_keywords = [
            "pattern", "architecture", "structure", "layer",
            "模式", "架构", "结构"
        ]
        style_keywords = [
            "naming", "format", "indent", "comment", "style",
            "命名", "格式", "缩进", "注释", "风格"
        ]
        
        if any(kw in rule_lower for kw in tech_keywords):
            return "technology"
        elif any(kw in rule_lower for kw in arch_keywords):
            return "architecture"
        elif any(kw in rule_lower for kw in style_keywords):
            return "style"
        return "general"
    
    def _extract_reason(self, text: str, match_end: int) -> str:
        remaining = text[match_end:match_end + 150].strip()
        reason_match = re.search(
            r'(?:因为|because|since|due to|,\s*)\s*(.+?)(?:[。.;；]|$)', 
            remaining, 
            re.IGNORECASE
        )
        return reason_match.group(1).strip()[:80] if reason_match else ""


# ═══════════════════════════════════════════════════════════════
# 4. 进度检测器 (Progress Detector)
# ═══════════════════════════════════════════════════════════════

class ProgressDetector:
    """
    检测任务进度变化
    
    完成信号：
      "完成了 X"  "X 已经好了"  "X done"  "finished X"
      Agent: "I've created/modified/updated file X"
    
    阻塞信号：
      "X 遇到问题"  "X 报错了"  "X failed"  "stuck on X"
    
    新任务信号：
      "接下来做 X"  "下一步 X"  "next: X"  "todo: X"
    """
    
    COMPLETION_PATTERNS = [
        r'(?:完成了|做好了|搞定了|已经好了)\s*(.+?)(?:[,，。.;；！!]|$)',
        r'(.+?)(?:完成|搞定|做好)了',
        r"(?:finished|completed|done\s+with|created|implemented)\s+(.+?)(?:[,.\s;!]|$)",
        r"(?:i'?ve?\s+(?:created|modified|updated|fixed|implemented))\s+(.+?)(?:[,.\s;!]|$)",
    ]
    
    BLOCKER_PATTERNS = [
        r'(?:遇到问题|报错|出错|卡住|失败)\s*(.+?)(?:[,，。.;；！!]|$)',
        r'(.+?)(?:报错|出错|失败|不行)了?',
        r"(?:error|failed|stuck|blocked|issue)\s+(?:with|on|in)?\s*(.+?)(?:[,.\s;!]|$)",
        r"(.+?)\s+(?:doesn'?t\s+work|is\s+broken|failed|errored)",
    ]
    
    NEW_TASK_PATTERNS = [
        r'(?:接下来|下一步|然后|待办|需要做)\s*(.+?)(?:[,，。.;；！!]|$)',
        r"(?:next|todo|then|now\s+(?:let'?s?|we\s+need\s+to))\s+(.+?)(?:[,.\s;!]|$)",
    ]
    
    def detect(
        self, text: str, role: str, turn: int
    ) -> list[dict]:
        """
        返回任务更新指令列表
        每个指令格式: {
            "action": "complete" | "block" | "create",
            "description": str,
            "detail": str
        }
        """
        updates = []
        
        for pattern in self.COMPLETION_PATTERNS:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                desc = match.group(1).strip()
                if 2 < len(desc) < 100:
                    updates.append({
                        "action": "complete",
                        "description": desc,
                        "detail": "",
                        "turn": turn
                    })
        
        for pattern in self.BLOCKER_PATTERNS:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                desc = match.group(1).strip()
                if 2 < len(desc) < 100:
                    # 提取具体错误信息
                    error_detail = self._extract_error_detail(
                        text, match.end()
                    )
                    updates.append({
                        "action": "block",
                        "description": desc,
                        "detail": error_detail,
                        "turn": turn
                    })
        
        for pattern in self.NEW_TASK_PATTERNS:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                desc = match.group(1).strip()
                if 2 < len(desc) < 100:
                    updates.append({
                        "action": "create",
                        "description": desc,
                        "detail": "",
                        "turn": turn
                    })
        
        return updates
    
    def _extract_error_detail(self, text: str, pos: int) -> str:
        """提取错误信息中的具体细节"""
        remaining = text[pos:pos + 300]
        
        # 查找错误信息特征
        error_patterns = [
            r'(?:Error|TypeError|SyntaxError|RuntimeError)[:\s]+(.+?)(?:\n|$)',
            r'(?:错误信息|报错内容)[：:]\s*(.+?)(?:\n|$)',
            r'`([^`]+(?:Error|error|Exception)[^`]*)`',
        ]
        
        for pattern in error_patterns:
            match = re.search(pattern, remaining)
            if match:
                return match.group(1).strip()[:100]
        
        return ""


# ═══════════════════════════════════════════════════════════════
# 5. 代码锚点检测器 (Anchor Detector)
# ═══════════════════════════════════════════════════════════════

class AnchorDetector:
    """
    检测对话中提及的代码位置
    
    文件路径模式：
      "src/auth/service.ts"  "./components/Header.tsx"
      "在 utils.py 的第 42 行"  "line 42 of utils.py"
    
    符号引用模式：
      "AuthService 类"  "validate 函数"
      "the AuthService class"  "the validate() method"
    
    Agent 操作模式：
      "I read file src/..."  "Modified src/..."
      "Created new file..."
    """
    
    # 文件路径正则
    FILE_PATH_PATTERN = re.compile(
        r'(?:^|\s|[`"\'])'                    # 前缀
        r'((?:[\w\-./]+/)?'                    # 可选目录
        r'[\w\-]+\.'                            # 文件名
        r'(?:ts|tsx|js|jsx|py|rs|go|java|'     # 扩展名
        r'cpp|c|h|hpp|rb|php|swift|kt))'
        r'(?:\s|[`"\']|$|[,.:;])',             # 后缀
        re.MULTILINE
    )
    
    # 行号引用
    LINE_REF_PATTERN = re.compile(
        r'(?:(?:第|line|行|L)\s*(\d+)\s*(?:行|line)?'
        r'(?:\s*(?:到|to|-)\s*(\d+))?)',
        re.IGNORECASE
    )
    
    # Agent 文件操作
    AGENT_ACTION_PATTERNS = [
        (re.compile(
            r"(?:read|reading|读取?了?)\s+(?:file\s+)?[`'\"]?"
            r"([\w\-./]+\.[\w]+)", 
            re.IGNORECASE
        ), "read"),
        (re.compile(
            r"(?:modif(?:y|ied)|updat(?:e|ed)|chang(?:e|ed)|修改了?)\s+"
            r"(?:file\s+)?[`'\"]?([\w\-./]+\.[\w]+)", 
            re.IGNORECASE
        ), "modified"),
        (re.compile(
            r"(?:creat(?:e|ed)|writ(?:e|ten)|新建了?|创建了?)\s+"
            r"(?:file\s+)?[`'\"]?([\w\-./]+\.[\w]+)", 
            re.IGNORECASE
        ), "created"),
    ]
    
    def __init__(self, skeleton_index: dict = None):
        """
        skeleton_index: 骨架索引的 SYMBOL_MAP
        用于将文件路径映射到对应的骨架路径
        """
        self.skeleton_index = skeleton_index or {}
    
    def detect(
        self, text: str, role: str, turn: int
    ) -> list[CodeAnchor]:
        anchors = []
        
        # 1. 检测文件路径引用
        for match in self.FILE_PATH_PATTERN.finditer(text):
            file_path = match.group(1)
            
            # 查找关联的行号
            line_start, line_end = 0, 0
            nearby_text = text[
                max(0, match.start() - 50):match.end() + 50
            ]
            line_match = self.LINE_REF_PATTERN.search(nearby_text)
            if line_match:
                line_start = int(line_match.group(1))
                line_end = int(
                    line_match.group(2)
                ) if line_match.group(2) else line_start
            
            # 查找对应的骨架路径
            skeleton_path = self._find_skeleton_path(file_path)
            
            anchors.append(CodeAnchor(
                file_path=file_path,
                line_start=line_start,
                line_end=line_end,
                skeleton_path=skeleton_path,
                action="referenced",
                turn=turn
            ))
        
        # 2. 检测 Agent 的文件操作
        if role == "assistant":
            for pattern, action in self.AGENT_ACTION_PATTERNS:
                for match in pattern.finditer(text):
                    file_path = match.group(1)
                    skeleton_path = self._find_skeleton_path(file_path)
                    
                    anchors.append(CodeAnchor(
                        file_path=file_path,
                        skeleton_path=skeleton_path,
                        action=action,
                        turn=turn
                    ))
        
        # 3. 去重（同一文件在一轮中只保留最重要的操作）
        anchors = self._deduplicate(anchors)
        
        return anchors
    
    def _find_skeleton_path(self, file_path: str) -> Optional[str]:
        """将源文件路径映射到骨架路径"""
        # 在骨架索引中查找
        for symbol, skel_path in self.skeleton_index.items():
            if file_path in skel_path or skel_path.endswith(
                file_path.replace('.ts', '.py')
                         .replace('.tsx', '.py')
                         .replace('.js', '.py')
            ):
                return skel_path
        return None
    
    def _deduplicate(self, anchors: list[CodeAnchor]) -> list[CodeAnchor]:
        """去重：同一文件保留最重要的操作"""
        seen = {}
        action_priority = {
            "created": 4, "modified": 3, 
            "read": 2, "referenced": 1
        }
        
        for anchor in anchors:
            key = anchor.file_path
            if key not in seen or action_priority.get(
                anchor.action, 0
            ) > action_priority.get(
                seen[key].action, 0
            ):
                seen[key] = anchor
        
        return list(seen.values())


# ═══════════════════════════════════════════════════════════════
# 6. 错误记忆检测器 (Error Memory Detector)
# ═══════════════════════════════════════════════════════════════

class ErrorMemoryDetector:
    """
    检测失败的尝试，确保 Agent 不会重复犯同样的错误
    
    触发条件：
    1. Agent 报告某个方案失败
    2. 用户说 "这个不行" "这样有问题"
    3. 检测到错误堆栈或异常信息
    """
    
    FAILURE_PATTERNS = [
        r"(?:this\s+(?:approach|method|solution)\s+(?:doesn'?t|won'?t|didn'?t)\s+work)",
        r"(?:这个?(?:方案|方法|办法)(?:不行|有问题|失败|不可行))",
        r"(?:尝试了?\s*(.+?)\s*(?:但是?|不过)\s*(?:失败|报错|不行))",
        r"(?:tried\s+(.+?)\s+but\s+(?:it\s+)?(?:failed|didn'?t\s+work|errored))",
    ]
    
    ERROR_STACK_PATTERN = re.compile(
        r'(?:Error|Exception|Traceback|panic|FATAL)[:\s]+'
        r'(.+?)(?:\n\s+at|\n\n|$)',
        re.MULTILINE | re.IGNORECASE
    )
    
    def detect(
        self, text: str, role: str, turn: int,
        recent_context: str = ""
    ) -> list[ErrorMemory]:
        """
        recent_context: 最近几轮的对话摘要，
        用于理解错误发生的上下文
        """
        errors = []
        
        # 检测失败描述
        for pattern in self.FAILURE_PATTERNS:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                approach = match.group(0)
                if match.lastindex and match.group(1):
                    approach = match.group(1).strip()
                
                # 提取失败原因
                failure_reason = self._extract_failure_reason(
                    text, match.end()
                )
                
                # 提取相关文件
                related_files = self._extract_related_files(text)
                
                errors.append(ErrorMemory(
                    approach=approach[:80],
                    failure_reason=failure_reason,
                    turn=turn,
                    related_files=related_files
                ))
        
        # 检测错误堆栈
        for match in self.ERROR_STACK_PATTERN.finditer(text):
            error_msg = match.group(1).strip()[:100]
            errors.append(ErrorMemory(
                approach=f"Code execution at turn {turn}",
                failure_reason=error_msg,
                turn=turn,
                related_files=self._extract_related_files(text)
            ))
        
        return errors
    
    def _extract_failure_reason(
        self, text: str, pos: int
    ) -> str:
        remaining = text[pos:pos + 200]
        reason_patterns = [
            r'(?:因为|because|since|due\s+to|原因[是：:])\s*(.+?)(?:[。.;；\n]|$)',
            r'(?:问题[是：:]|the\s+(?:issue|problem)\s+(?:is|was))\s*(.+?)(?:[。.;；\n]|$)',
        ]
        for pattern in reason_patterns:
            match = re.search(pattern, remaining, re.IGNORECASE)
            if match:
                return match.group(1).strip()[:80]
        return "Unknown reason"
    
    def _extract_related_files(self, text: str) -> list[str]:
        files = []
        for match in AnchorDetector.FILE_PATH_PATTERN.finditer(text):
            files.append(match.group(1))
        return files[:5]


# ═══════════════════════════════════════════════════════════════
# 7. 目标检测器 (Goal Detector)
# ═══════════════════════════════════════════════════════════════

class GoalDetector:
    """
    检测用户的主要目标和次要目标
    
    主目标通常在对话开始时设定
    目标可以在对话过程中被修改
    """
    
    GOAL_PATTERNS = [
        r'(?:我想|我需要|我要|帮我|请|目标是|任务是)\s*(.+?)(?:[,，。.;；！!]|$)',
        r'(?:i\s+(?:want|need)\s+(?:to|you\s+to))\s+(.+?)(?:[,.\s;!]|$)',
        r'(?:(?:the\s+)?goal\s+is\s+(?:to\s+)?)\s*(.+?)(?:[,.\s;!]|$)',
        r'(?:please|help\s+me)\s+(.+?)(?:[,.\s;!]|$)',
    ]
    
    GOAL_CHANGE_PATTERNS = [
        r'(?:改为|变成|换成|改成|instead|change\s+to|switch\s+to)\s+(.+?)(?:[,，。.;；！!]|$)',
        r'(?:不做|不[搞弄])\s*(.+?)\s*了?(?:，|,)\s*(?:改为?|换成?)\s*(.+?)(?:[,，。.;；！!]|$)',
    ]
    
    def detect(
        self, text: str, role: str, turn: int, 
        current_goal: str
    ) -> Optional[str]:
        """返回新的目标文本，如果没有变化返回 None"""
        if role != "user":
            return None
        
        # 检测目标修改
        for pattern in self.GOAL_CHANGE_PATTERNS:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                # 目标发生了变更
                new_goal = match.group(
                    match.lastindex
                ).strip()
                if len(new_goal) > 5:
                    return new_goal
        
        # 检测新目标设定（只在前几轮或当前无目标时）
        if turn <= 3 or not current_goal:
            for pattern in self.GOAL_PATTERNS:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    goal = match.group(1).strip()
                    if len(goal) > 10:  # 避免太短的误检
                        return goal
        
        return None


# ═══════════════════════════════════════════════════════════════
# 8. 知识事实检测器 (Fact Detector)
# ═══════════════════════════════════════════════════════════════

class FactDetector:
    """
    检测对话中提到的技术事实和项目信息
    
    例如：
    - "我们的项目用 TypeScript 写的" -> tech_stack: TypeScript
    - "数据库是 PostgreSQL 14" -> database: PostgreSQL 14
    - "API 的 base URL 是 https://..." -> api_base_url: https://...
    """
    
    FACT_PATTERNS = {
        "database": [
            r'(?:数据库|database)\s*(?:是|用的?是?|=|:)\s*(.+?)(?:[,，。.;；\s]|$)',
            r'(?:using|use)\s+((?:postgres|mysql|mongo|sqlite|redis)\w*)',
        ],
        "language": [
            r'(?:语言|language)\s*(?:是|用的?是?)\s*(.+?)(?:[,，。.;；\s]|$)',
            r'(?:written\s+in|using)\s+(typescript|javascript|python|rust|go|java)',
        ],
        "framework": [
            r'(?:框架|framework)\s*(?:是|用的?是?)\s*(.+?)(?:[,，。.;；\s]|$)',
        ],
        "api_url": [
            r'(?:api|url|地址|endpoint)\s*(?:是|=|:)\s*(https?://\S+)',
        ],
        "version": [
            r'(node|python|rust|go|java|npm|yarn|pnpm)\s*(?:版本|version)?\s*(?:是|=|:)?\s*v?(\d+[\d.]*)',
        ],
        "team_size": [
            r'(?:团队|team)\s*(?:有|size)?\s*(\d+)\s*(?:人|人|members|people)',
        ],
    }
    
    def detect(
        self, text: str, role: str, turn: int
    ) -> list[KnowledgeFact]:
        facts = []
        
        for category, patterns in self.FACT_PATTERNS.items():
            for pattern in patterns:
                for match in re.finditer(
                    pattern, text, re.IGNORECASE
                ):
                    value = match.group(
                        match.lastindex
                    ).strip()
                    if len(value) < 1 or len(value) > 100:
                        continue
                    
                    confidence = (
                        FactConfidence.CERTAIN 
                        if role == "user" 
                        else FactConfidence.INFERRED
                    )
                    
                    facts.append(KnowledgeFact(
                        key=f"{category}",
                        value=value,
                        category="tech_stack" if category in 
                            ["database", "language", "framework"] 
                            else "project_info",
                        confidence=confidence,
                        source_turn=turn
                    ))
        
        return facts


# ═══════════════════════════════════════════════════════════════
# 9. 主提取器：整合所有子检测器
# ═══════════════════════════════════════════════════════════════

class MasterExtractor:
    """
    主提取器：协调所有子检测器，生成完整的提取结果
    
    运行顺序：
    1. GoalDetector (最高优先级)
    2. DecisionDetector
    3. ConstraintDetector
    4. FactDetector
    5. ProgressDetector
    6. AnchorDetector
    7. ErrorMemoryDetector (最后运行，依赖其他信息)
    """
    
    def __init__(self, skeleton_index: dict = None):
        self.goal_detector = GoalDetector()
        self.decision_detector = DecisionDetector()
        self.constraint_detector = ConstraintDetector()
        self.fact_detector = FactDetector()
        self.progress_detector = ProgressDetector()
        self.anchor_detector = AnchorDetector(skeleton_index)
        self.error_detector = ErrorMemoryDetector()
    
    def extract(
        self, 
        text: str, 
        role: str, 
        turn: int,
        current_state: SessionState
    ) -> ExtractionResult:
        """从一轮对话中提取所有结构化信息"""
        
        result = ExtractionResult()
        
        # 1. 目标检测
        new_goal = self.goal_detector.detect(
            text, role, turn, current_state.primary_goal
        )
        if new_goal:
            result.goal_update = new_goal
        
        # 2. 决策检测
        result.decisions = self.decision_detector.detect(
            text, role, turn
        )
        
        # 3. 约束检测
        result.constraints = self.constraint_detector.detect(
            text, role, turn
        )
        
        # 4. 事实检测
        result.facts = self.fact_detector.detect(
            text, role, turn
        )
        
        # 5. 进度检测
        result.task_updates = self.progress_detector.detect(
            text, role, turn
        )
        
        # 6. 锚点检测
        result.code_anchors = self.anchor_detector.detect(
            text, role, turn
        )
        
        # 7. 错误记忆
        result.error_memories = self.error_detector.detect(
            text, role, turn
        )
        
        return result
```

---

## 五、状态合并器（State Merger）

```python
# context_compressor/merger.py
# ────────────────────────────────────────────────────────────────
# 状态合并器：将提取结果增量合并到 SessionState 中
#
# 核心原则：
# 1. 新信息覆盖旧信息（但保留覆盖历史）
# 2. 用户的声明优先于 Agent 的推断
# 3. 定期执行衰减和清理，控制状态体积
# ────────────────────────────────────────────────────────────────

from __future__ import annotations
import time
from typing import Optional

from .models import (
    SessionState, Decision, DecisionStatus,
    Constraint, KnowledgeFact, FactConfidence,
    TaskRecord, TaskStatus, CodeAnchor, ErrorMemory,
    _make_id
)
from .extractors import ExtractionResult


class StateMerger:
    """
    状态合并器
    
    容量限制（防止状态膨胀）：
    - MAX_DECISIONS = 30
    - MAX_CONSTRAINTS = 20
    - MAX_FACTS = 50
    - MAX_TASKS = 15
    - MAX_ANCHORS = 20
    - MAX_ERRORS = 10
    """
    
    MAX_DECISIONS = 30
    MAX_CONSTRAINTS = 20
    MAX_FACTS = 50
    MAX_TASKS = 15
    MAX_ANCHORS = 20
    MAX_ERRORS = 10
    
    # 不确定事实的衰减周期（超过这么多轮后自动移除）
    UNCERTAIN_FACT_DECAY_TURNS = 15
    
    # 已完成/已放弃的任务保留轮次
    DONE_TASK_RETAIN_TURNS = 30
    
    def merge(
        self, 
        state: SessionState, 
        extraction: ExtractionResult,
        current_turn: int
    ) -> SessionState:
        """
        将一轮提取结果合并到状态中
        返回更新后的 SessionState
        """
        
        # 更新元数据
        state.total_turns = current_turn
        state.last_updated = time.time()
        
        # 1. 合并目标
        if extraction.goal_update:
            if state.primary_goal and state.primary_goal != extraction.goal_update:
                # 旧目标降级为次要目标
                if state.primary_goal not in state.secondary_goals:
                    state.secondary_goals.append(state.primary_goal)
            state.primary_goal = extraction.goal_update
        
        # 2. 合并决策
        for new_decision in extraction.decisions:
            self._merge_decision(state, new_decision)
        
        # 3. 合并约束
        for new_constraint in extraction.constraints:
            self._merge_constraint(state, new_constraint)
        
        # 4. 合并知识事实
        for new_fact in extraction.facts:
            self._merge_fact(state, new_fact)
        
        # 5. 合并任务进度
        for task_update in extraction.task_updates:
            self._merge_task(state, task_update, current_turn)
        
        # 6. 合并代码锚点
        for new_anchor in extraction.code_anchors:
            self._merge_anchor(state, new_anchor)
        
        # 7. 合并错误记忆
        for new_error in extraction.error_memories:
            self._merge_error(state, new_error)
        
        # 8. 合并偏好
        for key, value in extraction.preference_updates.items():
            state.preferences[key] = value
        
        # 9. 执行衰减和清理
        self._decay_and_evict(state, current_turn)
        
        return state
    
    # ── 细粒度合并逻辑 ─────────────────────────────────────────
    
    def _merge_decision(
        self, state: SessionState, new: Decision
    ):
        """
        决策合并规则：
        
        Case 1: 新决策的 topic 不存在 -> 直接添加
        Case 2: 新决策是 ACCEPTED，旧决策是 PROPOSED
                -> 旧决策标记为 SUPERSEDED，添加新决策
        Case 3: 新决策是 ACCEPTED，旧决策也是 ACCEPTED
                -> 旧决策标记为 SUPERSEDED，新决策的
                   supersedes 字段指向旧决策
        Case 4: 新决策是 REJECTED
                -> 查找同 topic 的 PROPOSED 决策标记为 REJECTED
                   同时添加新决策的拒绝记录
        """
        # 查找同 topic 的现有决策
        existing = None
        existing_idx = None
        for i, d in enumerate(state.decisions):
            if d.topic == new.topic and d.status in (
                DecisionStatus.ACCEPTED, DecisionStatus.PROPOSED
            ):
                existing = d
                existing_idx = i
                break
        
        if existing is None:
            # Case 1: 直接添加
            state.decisions.append(new)
        
        elif new.status == DecisionStatus.ACCEPTED:
            # Case 2 & 3: 覆盖旧决策
            existing.status = DecisionStatus.SUPERSEDED
            new.supersedes = existing.id
            
            # 将旧决策的 rejected alternatives 合并
            if existing.alternatives_rejected:
                new.alternatives_rejected.extend(
                    existing.alternatives_rejected
                )
            if existing.choice != new.choice:
                new.alternatives_rejected.append(existing.choice)
            
            state.decisions.append(new)
        
        elif new.status == DecisionStatus.REJECTED:
            # Case 4: 标记旧建议为被拒绝
            if existing.status == DecisionStatus.PROPOSED:
                existing.status = DecisionStatus.REJECTED
                existing.updated_at_turn = new.created_at_turn
            
            # 记录被拒绝的选项（添加到现有 ACCEPTED 决策中）
            for d in state.decisions:
                if d.topic == new.topic and \
                   d.status == DecisionStatus.ACCEPTED:
                    d.alternatives_rejected.extend(
                        new.alternatives_rejected
                    )
                    break
            else:
                # 没有已接受的决策，直接添加拒绝记录
                state.decisions.append(new)
        
        elif new.status == DecisionStatus.PROPOSED:
            # 新建议：如果没有已接受的决策，添加
            if existing.status != DecisionStatus.ACCEPTED:
                state.decisions.append(new)
    
    def _merge_constraint(
        self, state: SessionState, new: Constraint
    ):
        """
        约束合并规则：
        
        - 同一 category 下，rule 内容相似的进行合并
        - hard 约束覆盖 soft 约束
        - 用户明确撤销的约束标记为 is_active = False
        """
        # 查找相似约束
        for existing in state.constraints:
            if existing.category == new.category and \
               self._similarity(existing.rule, new.rule) > 0.7:
                # 更新现有约束
                if new.severity == "hard" and \
                   existing.severity == "soft":
                    existing.severity = "hard"
                existing.rule = new.rule
                existing.reason = new.reason or existing.reason
                existing.is_active = True
                return
        
        # 没找到相似的，直接添加
        state.constraints.append(new)
    
    def _merge_fact(
        self, state: SessionState, new: KnowledgeFact
    ):
        """
        事实合并规则：
        
        - 同 key 的事实直接覆盖（保留最新值）
        - CERTAIN 级别的事实覆盖 INFERRED 和 UNCERTAIN
        - UNCERTAIN 不能覆盖 CERTAIN
        """
        for existing in state.facts:
            if existing.key == new.key:
                # 检查置信度优先级
                confidence_priority = {
                    FactConfidence.CERTAIN: 3,
                    FactConfidence.INFERRED: 2,
                    FactConfidence.UNCERTAIN: 1
                }
                
                new_priority = confidence_priority[new.confidence]
                existing_priority = confidence_priority[
                    existing.confidence
                ]
                
                if new_priority >= existing_priority:
                    existing.value = new.value
                    existing.confidence = new.confidence
                    existing.source_turn = new.source_turn
                    if new.linked_skeleton:
                        existing.linked_skeleton = new.linked_skeleton
                return
        
        # 新事实
        state.facts.append(new)
        
        # 同步更新 tech_stack
        if new.category == "tech_stack" and \
           str(new.value) not in state.tech_stack:
            state.tech_stack.append(str(new.value))
    
    def _merge_task(
        self, state: SessionState, 
        update: dict, current_turn: int
    ):
        """
        任务合并规则：
        
        action == "complete": 
          查找匹配的 pending 任务 -> 标记为 DONE
        action == "block":
          查找匹配的任务 -> 标记为 BLOCKED，记录 blocker
        action == "create":
          创建新的 PLANNED 任务
        """
        action = update["action"]
        description = update["description"]
        
        if action == "complete":
            # 查找最匹配的进行中任务
            best_match = self._find_matching_task(
                state, description
            )
            if best_match:
                # 移动到 completed_subtasks
                if description not in best_match.completed_subtasks:
                    best_match.completed_subtasks.append(description)
                
                # 检查是否所有子任务都完成了
                remaining = [
                    s for s in best_match.subtasks 
                    if s not in best_match.completed_subtasks
                ]
                if not remaining and best_match.subtasks:
                    best_match.status = TaskStatus.DONE
                
                best_match.updated_at_turn = current_turn
            else:
                # 没有匹配的任务，可能是一个独立的完成记录
                # 创建一个已完成的任务记录
                state.tasks.append(TaskRecord(
                    id=_make_id("task", description, current_turn),
                    description=description,
                    status=TaskStatus.DONE,
                    completed_subtasks=[description],
                    created_at_turn=current_turn,
                    updated_at_turn=current_turn
                ))
        
        elif action == "block":
            best_match = self._find_matching_task(
                state, description
            )
            if best_match:
                best_match.status = TaskStatus.BLOCKED
                if update["detail"]:
                    best_match.blockers.append(update["detail"])
                best_match.updated_at_turn = current_turn
            else:
                state.tasks.append(TaskRecord(
                    id=_make_id("task", description, current_turn),
                    description=description,
                    status=TaskStatus.BLOCKED,
                    blockers=[update["detail"]] if update["detail"] else [],
                    created_at_turn=current_turn,
                    updated_at_turn=current_turn
                ))
        
        elif action == "create":
            # 检查是否已有相似任务
            existing = self._find_matching_task(
                state, description
            )
            if not existing:
                state.tasks.append(TaskRecord(
                    id=_make_id("task", description, current_turn),
                    description=description,
                    status=TaskStatus.PLANNED,
                    created_at_turn=current_turn,
                    updated_at_turn=current_turn
                ))
    
    def _merge_anchor(
        self, state: SessionState, new: CodeAnchor
    ):
        """
        锚点合并规则：
        - 同一文件的锚点更新为最新的操作
        - 按 turn 排序，保留最新的 MAX_ANCHORS 个
        """
        # 查找同文件锚点
        for i, existing in enumerate(state.code_anchors):
            if existing.file_path == new.file_path:
                # 更新操作信息
                action_priority = {
                    "created": 4, "modified": 3, 
                    "read": 2, "referenced": 1
                }
                if action_priority.get(
                    new.action, 0
                ) >= action_priority.get(
                    existing.action, 0
                ):
                    state.code_anchors[i] = new
                return
        
        state.code_anchors.append(new)
    
    def _merge_error(
        self, state: SessionState, new: ErrorMemory
    ):
        """
        错误记忆合并规则：
        - 相似的错误进行合并（更新 failure_reason）
        - 永不自动删除
        """
        for existing in state.error_memories:
            if self._similarity(
                existing.approach, new.approach
            ) > 0.6:
                # 合并：保留更详细的描述
                if len(new.failure_reason) > len(
                    existing.failure_reason
                ):
                    existing.failure_reason = new.failure_reason
                existing.related_files = list(set(
                    existing.related_files + new.related_files
                ))
                return
        
        state.error_memories.append(new)
    
    # ── 衰减与清理 ──────────────────────────────────────────────
    
    def _decay_and_evict(
        self, state: SessionState, current_turn: int
    ):
        """
        定期清理过时的信息，控制状态体积
        
        清理规则：
        1. SUPERSEDED 决策：超过 20 轮后删除
        2. UNCERTAIN 事实：超过 UNCERTAIN_FACT_DECAY_TURNS 后删除
        3. DONE 任务：超过 DONE_TASK_RETAIN_TURNS 后删除
        4. 非活跃约束：超过 20 轮后删除
        5. 代码锚点：只保留最新的 MAX_ANCHORS 个
        6. 超出容量限制的，按优先级淘汰
        """
        
        # 1. 清理 SUPERSEDED 决策
        state.decisions = [
            d for d in state.decisions
            if not (
                d.status == DecisionStatus.SUPERSEDED and 
                current_turn - d.updated_at_turn > 20
            )
        ]
        
        # 容量控制：优先保留 ACCEPTED > REJECTED > PROPOSED > SUPERSEDED
        if len(state.decisions) > self.MAX_DECISIONS:
            status_priority = {
                DecisionStatus.ACCEPTED: 4,
                DecisionStatus.REJECTED: 3,  # 拒绝信息也很重要
                DecisionStatus.PROPOSED: 2,
                DecisionStatus.SUPERSEDED: 1,
                DecisionStatus.REVERTED: 0
            }
            state.decisions.sort(
                key=lambda d: (
                    status_priority.get(d.status, 0), 
                    d.updated_at_turn
                ),
                reverse=True
            )
            state.decisions = state.decisions[:self.MAX_DECISIONS]
        
        # 2. 清理 UNCERTAIN 事实
        state.facts = [
            f for f in state.facts
            if not (
                f.confidence == FactConfidence.UNCERTAIN and 
                current_turn - f.source_turn > 
                    self.UNCERTAIN_FACT_DECAY_TURNS
            )
        ]
        
        if len(state.facts) > self.MAX_FACTS:
            confidence_priority = {
                FactConfidence.CERTAIN: 3,
                FactConfidence.INFERRED: 2,
                FactConfidence.UNCERTAIN: 1
            }
            state.facts.sort(
                key=lambda f: (
                    confidence_priority.get(f.confidence, 0),
                    f.source_turn
                ),
                reverse=True
            )
            state.facts = state.facts[:self.MAX_FACTS]
        
        # 3. 清理完成/放弃的任务
        state.tasks = [
            t for t in state.tasks
            if not (
                t.status in (TaskStatus.DONE, TaskStatus.ABANDONED) and 
                current_turn - t.updated_at_turn > 
                    self.DONE_TASK_RETAIN_TURNS
            )
        ]
        
        if len(state.tasks) > self.MAX_TASKS:
            status_priority = {
                TaskStatus.IN_PROGRESS: 5,
                TaskStatus.BLOCKED: 4,
                TaskStatus.PLANNED: 3,
                TaskStatus.DONE: 2,
                TaskStatus.ABANDONED: 1
            }
            state.tasks.sort(
                key=lambda t: (
                    status_priority.get(t.status, 0),
                    t.updated_at_turn
                ),
                reverse=True
            )
            state.tasks = state.tasks[:self.MAX_TASKS]
        
        # 4. 清理非活跃约束
        state.constraints = [
            c for c in state.constraints
            if c.is_active or 
               current_turn - c.created_at_turn <= 20
        ]
        if len(state.constraints) > self.MAX_CONSTRAINTS:
            state.constraints = state.constraints[
                -self.MAX_CONSTRAINTS:
            ]
        
        # 5. 清理代码锚点（保留最新的）
        state.code_anchors.sort(
            key=lambda a: a.turn, reverse=True
        )
        state.code_anchors = state.code_anchors[:self.MAX_ANCHORS]
        
        # 6. 错误记忆容量控制
        if len(state.error_memories) > self.MAX_ERRORS:
            state.error_memories = state.error_memories[
                -self.MAX_ERRORS:
            ]
    
    # ── 辅助方法 ───────────────────────────────────────────────
    
    def _find_matching_task(
        self, state: SessionState, description: str
    ) -> Optional[TaskRecord]:
        """查找与描述最匹配的任务"""
        best_score = 0
        best_task = None
        
        for task in state.tasks:
            if task.status in (
                TaskStatus.DONE, TaskStatus.ABANDONED
            ):
                continue
            
            # 检查描述相似度
            score = self._similarity(
                task.description, description
            )
            
            # 也检查子任务
            for subtask in task.subtasks:
                s = self._similarity(subtask, description)
                score = max(score, s)
            
            if score > best_score and score > 0.3:
                best_score = score
                best_task = task
        
        return best_task
    
    def _similarity(self, a: str, b: str) -> float:
        """
        简单的字符串相似度计算
        基于共同词汇的 Jaccard 相似度
        """
        if not a or not b:
            return 0.0
        
        # 分词（同时支持中英文）
        import re
        words_a = set(
            re.findall(r'[\w\u4e00-\u9fff]+', a.lower())
        )
        words_b = set(
            re.findall(r'[\w\u4e00-\u9fff]+', b.lower())
        )
        
        if not words_a or not words_b:
            return 0.0
        
        intersection = words_a & words_b
        union = words_a | words_b
        
        return len(intersection) / len(union)
```

---

## 六、Python 序列化器（Serializer）

```python
# context_compressor/serializer.py
# ────────────────────────────────────────────────────────────────
# 将 SessionState 序列化为人类和 LLM 都能阅读的 Python 文件
#
# 输出格式设计原则：
# 1. 合法的 Python 3 语法（可以被 exec/import）
# 2. 层级清晰（用嵌套 class 代替嵌套 dict）
# 3. 注释即元数据（turn number、confidence 等写在注释中）
# 4. 关键信息上移（最重要的内容在文件顶部）
# ────────────────────────────────────────────────────────────────

from __future__ import annotations
import os
import time
from datetime import datetime

from .models import (
    SessionState, Decision, DecisionStatus,
    Constraint, KnowledgeFact, FactConfidence,
    TaskRecord, TaskStatus, CodeAnchor, ErrorMemory,
    _escape, _to_var_name
)


class StateSerializer:
    """
    将 SessionState 序列化为 .py 文件
    
    输出文件结构：
    ┌─────────────────────────────────────┐
    │  Header (stats & compression ratio) │
    │  class Session:                      │
    │      goal = "..."                    │
    │      class Decisions: ...            │
    │      class Constraints: ...          │
    │      class Knowledge: ...            │
    │      class Tasks: ...                │
    │      class CodeAnchors: ...          │
    │      class ErrorMemory: ...          │
    │      class Preferences: ...          │
    └─────────────────────────────────────┘
    """
    
    def serialize(
        self, state: SessionState
    ) -> str:
        """将 SessionState 序列化为完整的 Python 代码"""
        
        lines = []
        
        # ── 文件头 ──
        lines.extend(self._emit_header(state))
        lines.append("")
        
        # ── 主类 ──
        lines.append("class Session:")
        lines.append(
            '    """Current session state. '
            'AI: read this FIRST before any action."""'
        )
        lines.append("")
        
        # ── 目标（最高优先级信息） ──
        lines.extend(self._emit_goal(state))
        lines.append("")
        
        # ── 项目上下文 ──
        lines.extend(self._emit_project_context(state))
        lines.append("")
        
        # ── 决策（第二重要） ──
        lines.extend(self._emit_decisions(state))
        lines.append("")
        
        # ── 约束（第三重要） ──
        lines.extend(self._emit_constraints(state))
        lines.append("")
        
        # ── 知识事实 ──
        lines.extend(self._emit_knowledge(state))
        lines.append("")
        
        # ── 任务进度 ──
        lines.extend(self._emit_tasks(state))
        lines.append("")
        
        # ── 代码锚点 ──
        lines.extend(self._emit_anchors(state))
        lines.append("")
        
        # ── 错误记忆 ──
        lines.extend(self._emit_errors(state))
        lines.append("")
        
        # ── 偏好 ──
        lines.extend(self._emit_preferences(state))
        
        return "\n".join(lines)
    
    def save(
        self, state: SessionState, 
        output_path: str = ".cursor/context/session_state.py"
    ):
        """序列化并保存到文件"""
        content = self.serialize(state)
        
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # 先写入临时文件再重命名（原子性写入）
        tmp_path = output_path + ".tmp"
        with open(tmp_path, 'w', encoding='utf-8') as f:
            f.write(content)
        os.replace(tmp_path, output_path)
        
        # 更新压缩指标
        state.compressed_chars = len(content)
    
    # ── 各部分序列化 ──────────────────────────────────────────
    
    def _emit_header(self, state: SessionState) -> list[str]:
        lines = []
        
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        ratio = state.raw_chars_ingested / max(
            state.compressed_chars or 1, 1
        )
        
        lines.append('"""')
        lines.append("=" * 58)
        lines.append("SESSION CONTEXT STATE (Auto-maintained)")
        lines.append(f"Last updated: {now}")
        lines.append(f"Turns processed: {state.total_turns}")
        lines.append(
            f"Raw input: {state.raw_chars_ingested:,} chars"
        )
        
        if state.compressed_chars:
            lines.append(
                f"Compressed to: {state.compressed_chars:,} chars "
                f"(ratio: {ratio:.1f}:1)"
            )
        
        lines.append("")
        lines.append("AI INSTRUCTIONS:")
        lines.append(
            "- Read Session.goal FIRST"
        )
        lines.append(
            "- Check Session.Constraints BEFORE writing code"
        )
        lines.append(
            "- Check Session.ErrorMemory "
            "to avoid repeating mistakes"
        )
        lines.append(
            "- Use Session.CodeAnchors "
            "for precise file locations"
        )
        lines.append("=" * 58)
        lines.append('"""')
        
        return lines
    
    def _emit_goal(self, state: SessionState) -> list[str]:
        lines = []
        lines.append("    # ═══ PRIMARY GOAL ═══")
        lines.append(
            f'    goal = '
            f'"{_escape(state.primary_goal)}"'
        )
        lines.append(
            f'    goal_status = "{state.goal_status}"'
            f'  # [in_progress | completed | pivoted]'
        )
        
        if state.secondary_goals:
            lines.append(
                f"    secondary_goals = ["
            )
            for sg in state.secondary_goals:
                lines.append(
                    f'        "{_escape(sg)}",'
                )
            lines.append("    ]")
        
        return lines
    
    def _emit_project_context(
        self, state: SessionState
    ) -> list[str]:
        lines = []
        lines.append("    # ═══ PROJECT CONTEXT ═══")
        
        if state.project_name:
            lines.append(
                f'    project = "{_escape(state.project_name)}"'
            )
        if state.project_type:
            lines.append(
                f'    project_type = '
                f'"{state.project_type}"'
            )
        if state.tech_stack:
            lines.append(
                f"    tech_stack = {state.tech_stack}"
            )
        if state.architecture_style:
            lines.append(
                f'    architecture = '
                f'"{state.architecture_style}"'
            )
        
        return lines
    
    def _emit_decisions(
        self, state: SessionState
    ) -> list[str]:
        lines = []
        
        # 分类：已确认 vs 已拒绝 vs 待确认
        accepted = [
            d for d in state.decisions 
            if d.status == DecisionStatus.ACCEPTED
        ]
        rejected = [
            d for d in state.decisions 
            if d.status == DecisionStatus.REJECTED
        ]
        proposed = [
            d for d in state.decisions 
            if d.status == DecisionStatus.PROPOSED
        ]
        
        lines.append("    # ═══ DECISIONS ═══")
        
        if accepted or rejected or proposed:
            lines.append("    class Decisions:")
            lines.append(
                '        """Confirmed choices. '
                'DO NOT contradict these."""'
            )
            
            if accepted:
                lines.append("")
                lines.append(
                    "        # ── Confirmed (MUST follow) ──"
                )
                for d in accepted:
                    lines.append(d.to_python_line())
                    if d.alternatives_rejected:
                        lines.append(
                            f"        # ↳ rejected alternatives: "
                            f"{d.alternatives_rejected}"
                        )
            
            if rejected:
                lines.append("")
                lines.append(
                    "        # ── Rejected "
                    "(DO NOT suggest again) ──"
                )
                for d in rejected:
                    var = _to_var_name(d.topic)
                    lines.append(
                        f'        # 🚫 {var}: '
                        f'"{_escape(d.alternatives_rejected[0] if d.alternatives_rejected else d.choice)}"'
                        f'  # reason: {_escape(d.reason)[:50]}'
                    )
            
            if proposed:
                lines.append("")
                lines.append(
                    "        # ── Proposed "
                    "(awaiting user confirmation) ──"
                )
                for d in proposed:
                    lines.append(d.to_python_line())
        else:
            lines.append(
                "    # (no decisions recorded yet)"
            )
        
        return lines
    
    def _emit_constraints(
        self, state: SessionState
    ) -> list[str]:
        lines = []
        
        active = [
            c for c in state.constraints if c.is_active
        ]
        hard = [c for c in active if c.severity == "hard"]
        soft = [c for c in active if c.severity == "soft"]
        
        lines.append("    # ═══ CONSTRAINTS ═══")
        
        if hard or soft:
            lines.append("    class Constraints:")
            lines.append(
                '        """Rules that MUST be followed."""'
            )
            
            if hard:
                lines.append("")
                lines.append(
                    "        # ── Hard (MUST obey) ──"
                )
                for c in hard:
                    lines.append(c.to_python_line())
            
            if soft:
                lines.append("")
                lines.append(
                    "        # ── Soft (prefer to follow) ──"
                )
                for c in soft:
                    lines.append(c.to_python_line())
        else:
            lines.append(
                "    # (no constraints recorded yet)"
            )
        
        return lines
    
    def _emit_knowledge(
        self, state: SessionState
    ) -> list[str]:
        lines = []
        
        lines.append("    # ═══ KNOWLEDGE BASE ═══")
        
        if state.facts:
            lines.append("    class Knowledge:")
            lines.append(
                '        """Verified facts about '
                'the project."""'
            )
            
            # 按 category 分组
            by_category: dict[str, list] = {}
            for f in state.facts:
                by_category.setdefault(
                    f.category, []
                ).append(f)
            
            for category, facts in sorted(
                by_category.items()
            ):
                lines.append("")
                lines.append(
                    f"        # ── {category} ──"
                )
                for fact in facts:
                    lines.append(fact.to_python_line())
        else:
            lines.append(
                "    # (no knowledge facts yet)"
            )
        
        return lines
    
    def _emit_tasks(
        self, state: SessionState
    ) -> list[str]:
        lines = []
        
        lines.append("    # ═══ TASK PROGRESS ═══")
        
        active_tasks = [
            t for t in state.tasks 
            if t.status not in (
                TaskStatus.DONE, TaskStatus.ABANDONED
            )
        ]
        recent_done = [
            t for t in state.tasks 
            if t.status == TaskStatus.DONE
        ][-5:]  # 最近 5 个完成的
        
        if active_tasks or recent_done:
            lines.append("    class Tasks:")
            
            if active_tasks:
                lines.append("")
                lines.append(
                    "        # ── Active ──"
                )
                for task in active_tasks:
                    task_lines = task.to_python_block(
                        indent=2
                    )
                    lines.extend(task_lines)
                    lines.append("")
            
            if recent_done:
                lines.append(
                    "        # ── Recently Completed ──"
                )
                for task in recent_done:
                    lines.append(
                        f'        # ✓ {_escape(task.description)[:60]} '
                        f'(turn {task.updated_at_turn})'
                    )
        else:
            lines.append(
                "    # (no tasks tracked yet)"
            )
        
        return lines
    
    def _emit_anchors(
        self, state: SessionState
    ) -> list[str]:
        lines = []
        
        lines.append("    # ═══ CODE ANCHORS ═══")
        lines.append(
            "    # Files currently relevant "
            "to this conversation"
        )
        
        if state.code_anchors:
            lines.append("    code_anchors = [")
            
            # 按 action 优先级排序
            sorted_anchors = sorted(
                state.code_anchors,
                key=lambda a: {
                    "created": 4, "modified": 3, 
                    "read": 2, "referenced": 1
                }.get(a.action, 0),
                reverse=True
            )
            
            for anchor in sorted_anchors:
                lines.append(anchor.to_python_line())
            
            lines.append("    ]")
        else:
            lines.append(
                "    code_anchors = []"
            )
        
        return lines
    
    def _emit_errors(
        self, state: SessionState
    ) -> list[str]:
        lines = []
        
        lines.append("    # ═══ ERROR MEMORY ═══")
        lines.append(
            "    # ⚠️ AI: DO NOT repeat these approaches!"
        )
        
        if state.error_memories:
            lines.append("    failed_approaches = [")
            for err in state.error_memories:
                lines.append(err.to_python_line())
            lines.append("    ]")
        else:
            lines.append(
                "    failed_approaches = []"
                "  # (no failures recorded)"
            )
        
        return lines
    
    def _emit_preferences(
        self, state: SessionState
    ) -> list[str]:
        lines = []
        
        if state.preferences:
            lines.append("    # ═══ PREFERENCES ═══")
            lines.append("    class Preferences:")
            for key, value in state.preferences.items():
                lines.append(
                    f'        {_to_var_name(key)} = '
                    f'"{_escape(value)}"'
                )
        
        return lines
```

---

## 七、完整的压缩器主引擎

```python
# context_compressor/engine.py
# ────────────────────────────────────────────────────────────────
# Context 压缩器主引擎
# 将所有组件组装为一个完整的流水线
# ────────────────────────────────────────────────────────────────

from __future__ import annotations
import os
import json
import time
from typing import Optional

from .models import SessionState, _make_id
from .extractors import MasterExtractor, ExtractionResult
from .merger import StateMerger
from .serializer import StateSerializer


class ContextCompressorEngine:
    """
    Context 压缩器主引擎
    
    使用方式：
    
    ```python
    engine = ContextCompressorEngine(
        output_path=".cursor/context/session_state.py",
        skeleton_index=SYMBOL_MAP  # 可选：关联代码骨架
    )
    
    # 每一轮对话后调用
    engine.ingest("user", "不要用 Axios，必须用原生 fetch", turn=5)
    engine.ingest("assistant", "好的，我会使用 fetch...", turn=5)
    
    # 自动更新 session_state.py
    ```
    """
    
    def __init__(
        self,
        output_path: str = ".cursor/context/session_state.py",
        skeleton_index: dict = None,
        auto_save: bool = True,
        save_every_n_turns: int = 1,
        debug: bool = False
    ):
        self.output_path = output_path
        self.auto_save = auto_save
        self.save_every_n_turns = save_every_n_turns
        self.debug = debug
        
        # 核心组件
        self.state = SessionState(
            session_id=_make_id("session", str(time.time()), 0),
            created_at=time.time()
        )
        self.extractor = MasterExtractor(skeleton_index)
        self.merger = StateMerger()
        self.serializer = StateSerializer()
        
        # 原始历史（仅用于调试和指标计算）
        self._raw_turns: list[dict] = []
        self._unsaved_turns = 0
        
        # 尝试加载已有状态
        self._load_existing_state()
    
    def ingest(
        self, role: str, content: str, turn: int
    ) -> SessionState:
        """
        摄入一轮对话，返回更新后的状态
        
        Args:
            role: "user" 或 "assistant"
            content: 消息文本内容
            turn: 当前轮次编号
        
        Returns:
            更新后的 SessionState
        """
        # 1. 记录原始输入（用于压缩比计算）
        self.state.raw_chars_ingested += len(content)
        self._raw_turns.append({
            "role": role, 
            "content": content, 
            "turn": turn,
            "timestamp": time.time()
        })
        
        if self.debug:
            print(
                f"\n[Compressor] Ingesting turn {turn} "
                f"({role}, {len(content)} chars)"
            )
        
        # 2. 提取结构化信息
        extraction = self.extractor.extract(
            text=content,
            role=role,
            turn=turn,
            current_state=self.state
        )
        
        if self.debug:
            self._print_extraction_summary(extraction)
        
        # 3. 合并到状态
        self.state = self.merger.merge(
            state=self.state,
            extraction=extraction,
            current_turn=turn
        )
        
        # 4. 自动保存
        self._unsaved_turns += 1
        if self.auto_save and \
           self._unsaved_turns >= self.save_every_n_turns:
            self.save()
            self._unsaved_turns = 0
        
        return self.state
    
    def ingest_batch(
        self, messages: list[dict]
    ) -> SessionState:
        """
        批量摄入多轮对话
        
        messages 格式:
        [
            {"role": "user", "content": "...", "turn": 1},
            {"role": "assistant", "content": "...", "turn": 1},
            ...
        ]
        """
        # 临时关闭自动保存
        original_auto_save = self.auto_save
        self.auto_save = False
        
        for msg in messages:
            self.ingest(
                role=msg["role"],
                content=msg["content"],
                turn=msg.get("turn", 0)
            )
        
        self.auto_save = original_auto_save
        
        # 批量结束后保存一次
        if self.auto_save:
            self.save()
        
        return self.state
    
    def save(self):
        """保存当前状态到文件"""
        self.serializer.save(self.state, self.output_path)
        
        if self.debug:
            ratio = self.state.raw_chars_ingested / max(
                self.state.compressed_chars, 1
            )
            print(
                f"[Compressor] Saved to {self.output_path}"
            )
            print(
                f"  Raw: {self.state.raw_chars_ingested:,} "
                f"chars | Compressed: "
                f"{self.state.compressed_chars:,} chars | "
                f"Ratio: {ratio:.1f}:1"
            )
    
    def get_state_as_python(self) -> str:
        """获取当前状态的 Python 代码表示"""
        return self.serializer.serialize(self.state)
    
    def get_state_as_dict(self) -> dict:
        """获取当前状态的字典表示（用于调试）"""
        import dataclasses
        return dataclasses.asdict(self.state)
    
    def get_compression_stats(self) -> dict:
        """获取压缩统计信息"""
        compressed = self.state.compressed_chars or \
            len(self.serializer.serialize(self.state))
        raw = self.state.raw_chars_ingested
        
        return {
            "total_turns": self.state.total_turns,
            "raw_chars": raw,
            "compressed_chars": compressed,
            "compression_ratio": raw / max(compressed, 1),
            "decisions_count": len(self.state.decisions),
            "constraints_count": len(self.state.constraints),
            "facts_count": len(self.state.facts),
            "tasks_count": len(self.state.tasks),
            "anchors_count": len(self.state.code_anchors),
            "errors_count": len(self.state.error_memories),
            "estimated_tokens": compressed // 4,
        }
    
    def reset(self):
        """重置所有状态（开始新会话）"""
        self.state = SessionState(
            session_id=_make_id(
                "session", str(time.time()), 0
            ),
            created_at=time.time()
        )
        self._raw_turns = []
        self._unsaved_turns = 0
    
    # ── 持久化 ─────────────────────────────────────────────────
    
    def _load_existing_state(self):
        """
        从文件加载已有状态
        
        使用 AST 解析已有的 session_state.py，
        恢复 SessionState 对象
        """
        if not os.path.exists(self.output_path):
            return
        
        try:
            with open(self.output_path, 'r') as f:
                content = f.read()
            
            # 解析关键字段
            self._parse_existing_python(content)
            
            if self.debug:
                print(
                    f"[Compressor] Loaded existing state "
                    f"from {self.output_path}"
                )
                print(
                    f"  Goal: {self.state.primary_goal[:50]}"
                )
                print(
                    f"  Decisions: "
                    f"{len(self.state.decisions)}"
                )
                print(
                    f"  Constraints: "
                    f"{len(self.state.constraints)}"
                )
        except Exception as e:
            if self.debug:
                print(
                    f"[Compressor] Could not load "
                    f"existing state: {e}"
                )
    
    def _parse_existing_python(self, content: str):
        """
        从已有的 Python 文件中恢复状态
        使用正则提取关键字段（比 exec 更安全）
        """
        import re
        
        # 提取 goal
        goal_match = re.search(
            r'goal\s*=\s*"(.+?)"', content
        )
        if goal_match:
            self.state.primary_goal = goal_match.group(1)
        
        # 提取 goal_status
        status_match = re.search(
            r'goal_status\s*=\s*"(.+?)"', content
        )
        if status_match:
            self.state.goal_status = status_match.group(1)
        
        # 提取 tech_stack
        stack_match = re.search(
            r'tech_stack\s*=\s*\[(.+?)\]', content
        )
        if stack_match:
            items = re.findall(
                r'"(.+?)"', stack_match.group(1)
            )
            self.state.tech_stack = items
        
        # 提取 total_turns
        turns_match = re.search(
            r'Turns processed:\s*(\d+)', content
        )
        if turns_match:
            self.state.total_turns = int(
                turns_match.group(1)
            )
    
    # ── 调试工具 ───────────────────────────────────────────────
    
    def _print_extraction_summary(
        self, extraction: ExtractionResult
    ):
        """打印提取结果摘要"""
        items = []
        if extraction.decisions:
            items.append(
                f"{len(extraction.decisions)} decisions"
            )
        if extraction.constraints:
            items.append(
                f"{len(extraction.constraints)} constraints"
            )
        if extraction.facts:
            items.append(
                f"{len(extraction.facts)} facts"
            )
        if extraction.task_updates:
            items.append(
                f"{len(extraction.task_updates)} task updates"
            )
        if extraction.code_anchors:
            items.append(
                f"{len(extraction.code_anchors)} anchors"
            )
        if extraction.error_memories:
            items.append(
                f"{len(extraction.error_memories)} errors"
            )
        if extraction.goal_update:
            items.append(
                f"goal: {extraction.goal_update[:30]}"
            )
        
        if items:
            print(
                f"  Extracted: {', '.join(items)}"
            )
        else:
            print("  Extracted: (nothing new)")
```

---

## 八、LLM 增强层（可选）

```python
# context_compressor/llm_enhancer.py
# ────────────────────────────────────────────────────────────────
# 用轻量级 LLM 增强规则提取器的精度
# 当规则提取器无法处理复杂语义时，交由 LLM 判断
# ────────────────────────────────────────────────────────────────

from __future__ import annotations
from typing import Optional


class LLMEnhancer:
    """
    LLM 增强层
    
    使用场景：
    1. 规则提取器无法判断的模糊语句
    2. 复杂的多轮推理（如："之前说的那个方案改一下"）
    3. 定期做全量状态审查（每 20 轮一次）
    
    成本控制：
    - 使用最便宜的模型（GPT-4o-mini / Claude Haiku）
    - 每次调用限制 500 token 输出
    - 只在规则提取器"不确定"时才调用
    """
    
    # ── 增量更新 Prompt ──
    INCREMENTAL_PROMPT = '''You are a Context State Manager.
Your job: update a Python state object based on new conversation.

CURRENT STATE:
```python
{current_state}
```

NEW CONVERSATION (turn {turn}):
[{role}]: {content}

INSTRUCTIONS:
1. If the user made a DECISION, add/update Decisions class
2. If the user set a CONSTRAINT, add to Constraints class  
3. If a task progressed, update Tasks class
4. If something FAILED, add to failed_approaches list
5. Output ONLY the CHANGED sections of the Python class
6. If nothing meaningful changed, output: NO_CHANGE

Output format - only the changed sections:
```python
# CHANGED SECTIONS ONLY:
...
```'''

    # ── 全量审查 Prompt ──
    AUDIT_PROMPT = '''You are a Context State Auditor.
Review this session state for consistency and completeness.

CURRENT STATE:
```python
{current_state}
```

RECENT CONVERSATION (last 5 turns):
{recent_turns}

CHECK:
1. Are all decisions still valid? (no contradictions?)
2. Are there decisions in the conversation NOT captured?
3. Are there constraints mentioned but not recorded?
4. Are task statuses accurate?
5. Should any items be marked as SUPERSEDED or removed?

Output a corrected Python state (full class), 
or "STATE_OK" if everything is correct.'''

    def __init__(self, llm_client=None, model: str = "gpt-4o-mini"):
        self.llm_client = llm_client
        self.model = model
        self._call_count = 0
        self._total_tokens = 0
    
    async def enhance_extraction(
        self,
        content: str,
        role: str,
        turn: int,
        current_state_python: str,
        rule_extraction_was_empty: bool = False
    ) -> Optional[str]:
        """
        当规则提取器返回空结果但消息看起来有信息量时，
        使用 LLM 进行深层提取
        
        返回: 更新后的 Python 代码片段，或 None
        """
        if not self.llm_client:
            return None
        
        # 只在规则提取器"失手"时才调用 LLM
        if not rule_extraction_was_empty:
            return None
        
        # 消息太短不值得调用 LLM
        if len(content) < 20:
            return None
        
        prompt = self.INCREMENTAL_PROMPT.format(
            current_state=current_state_python,
            turn=turn,
            role=role,
            content=content[:1000]  # 限制输入长度
        )
        
        try:
            response = await self.llm_client.chat(
                model=self.model,
                messages=[
                    {"role": "user", "content": prompt}
                ],
                max_tokens=500,
                temperature=0.0
            )
            
            self._call_count += 1
            self._total_tokens += response.usage.total_tokens
            
            result = response.content.strip()
            if result == "NO_CHANGE":
                return None
            
            return result
            
        except Exception as e:
            print(
                f"[LLM Enhancer] Error: {e}"
            )
            return None
    
    async def audit_state(
        self,
        current_state_python: str,
        recent_turns: list[dict]
    ) -> Optional[str]:
        """
        全量审查状态一致性
        建议每 20 轮调用一次
        
        返回: 修正后的 Python 代码，或 None（表示状态正确）
        """
        if not self.llm_client:
            return None
        
        turns_text = "\n".join(
            f"[Turn {t['turn']}][{t['role']}]: "
            f"{t['content'][:200]}"
            for t in recent_turns[-5:]
        )
        
        prompt = self.AUDIT_PROMPT.format(
            current_state=current_state_python,
            recent_turns=turns_text
        )
        
        try:
            response = await self.llm_client.chat(
                model=self.model,
                messages=[
                    {"role": "user", "content": prompt}
                ],
                max_tokens=1500,
                temperature=0.0
            )
            
            self._call_count += 1
            self._total_tokens += response.usage.total_tokens
            
            result = response.content.strip()
            if result == "STATE_OK":
                return None
            
            return result
            
        except Exception as e:
            print(
                f"[LLM Enhancer] Audit error: {e}"
            )
            return None
    
    def get_usage_stats(self) -> dict:
        return {
            "llm_calls": self._call_count,
            "total_tokens": self._total_tokens,
            "estimated_cost_usd": self._total_tokens * 0.00015 / 1000
        }
```

---

## 九、实际输出示例

经过 25 轮对话后，`session_state.py` 的实际内容：

```python
# .cursor/context/session_state.py

"""
==========================================================
SESSION CONTEXT STATE (Auto-maintained)
Last updated: 2025-01-15 14:32:18
Turns processed: 25
Raw input: 48,320 chars
Compressed to: 2,180 chars (ratio: 22.2:1)

AI INSTRUCTIONS:
- Read Session.goal FIRST
- Check Session.Constraints BEFORE writing code
- Check Session.ErrorMemory to avoid repeating mistakes
- Use Session.CodeAnchors for precise file locations
==========================================================
"""

class Session:
    """Current session state. AI: read this FIRST before any action."""

    # ═══ PRIMARY GOAL ═══
    goal = "Refactor AuthService to support Multi-Tenant OAuth with Auth0"
    goal_status = "in_progress"  # [in_progress | completed | pivoted]

    # ═══ PROJECT CONTEXT ═══
    project = "acme-saas-platform"
    project_type = "microservice"
    tech_stack = ["TypeScript", "Next.js 14", "PostgreSQL 15", "Redis"]
    architecture = "Schema-per-tenant microservices"

    # ═══ DECISIONS ═══
    class Decisions:
        """Confirmed choices. DO NOT contradict these."""

        # ── Confirmed (MUST follow) ──
        auth_provider_choice = "Auth0"  # turn 3 | rejected: ['Keycloak', 'Firebase Auth']
        # ↳ rejected alternatives: ['Keycloak', 'Firebase Auth']
        database_choice = "PostgreSQL with schema-per-tenant"  # turn 5 | security isolation
        http_client_choice = "native fetch"  # turn 8 | rejected: ['Axios']
        # ↳ rejected alternatives: ['Axios']
        session_strategy_choice = "JWT with refresh token rotation"  # turn 12
        tenant_resolution_choice = "subdomain-based"  # turn 15

        # ── Rejected (DO NOT suggest again) ──
        # 🚫 auth_provider: "Keycloak"  # reason: Too complex for our team size
        # 🚫 auth_provider: "Firebase Auth"  # reason: Vendor lock-in concerns
        # 🚫 http_client: "Axios"  # reason: Project mandates native APIs
        # 🚫 multitenancy: "Shared table with tenant_id column"  # reason: Security isolation

    # ═══ CONSTRAINTS ═══
    class Constraints:
        """Rules that MUST be followed."""

        # ── Hard (MUST obey) ──
        technology_con_8a3f = "FORBIDDEN: Axios"  # 🚫 Project uses native fetch only
        technology_con_b2e1 = "FORBIDDEN: lodash"  # 🚫 Use native Array/Object methods
        architecture_con_c4d2 = "Must use Repository Pattern for all DB access"  # 🚫
        architecture_con_d5e3 = "Must use Dependency Injection (no singletons)"  # 🚫

        # ── Soft (prefer to follow) ──
        style_con_f7a4 = "Prefer functional composition over class inheritance"  # ⚠️

    # ═══ KNOWLEDGE BASE ═══
    class Knowledge:
        """Verified facts about the project."""

        # ── tech_stack ──
        database = "PostgreSQL 15"  # ✓ turn 2
        language = "TypeScript 5.3"  # ✓ turn 1
        framework = "Next.js 14 App Router"  # ✓ turn 1

        # ── project_info ──
        api_url = "https://api.acme-platform.com"  # ✓ turn 7
        version = "Node 20.x"  # ✓ turn 1
        team_size = "4"  # ✓ turn 4

        # ── architecture ──
        tenant_isolation = "Each tenant gets own PostgreSQL schema"  # ✓ turn 5 | → skeleton/db/tenant_manager.py
        auth_flow = "Auth0 Universal Login -> JWT -> middleware validation"  # ✓ turn 12

    # ═══ TASK PROGRESS ═══
    class Tasks:

        # ── Active ──
        class task_implement_auth0:
            description = "Implement Auth0 provider with tenant-aware callbacks"
            status = "in_progress"
            completed = [
                "Created IOAuthProvider interface",
                "Implemented Auth0Client wrapper",
                "Added tenant_id to JWT custom claims"
            ]
            remaining = [
                "Implement callback handler with tenant resolution",
                "Add token refresh with rotation",
                "Write integration tests"
            ]

        class task_update_middleware:
            description = "Update auth middleware to inject tenant context"
            status = "planned"
            remaining = [
                "Parse tenant from subdomain",
                "Validate tenant exists in registry",
                "Set tenant schema in DB connection"
            ]

        # ── Recently Completed ──
        # ✓ Analyzed existing auth system (turn 6)
        # ✓ Designed IOAuthProvider interface (turn 10)
        # ✓ Created Auth0Client wrapper class (turn 18)

    # ═══ CODE ANCHORS ═══
    # Files currently relevant to this conversation
    code_anchors = [
        ("src/auth/providers/auth0.ts:1-180", symbol=Auth0Provider, action=modified, skeleton=skeleton/auth/providers/auth0.py),
        ("src/auth/interfaces.ts:1-45", symbol=IOAuthProvider, action=created, skeleton=skeleton/auth/interfaces.py),
        ("src/middleware/tenant.ts:30-85", symbol=TenantMiddleware, action=read, skeleton=skeleton/middleware/tenant.py),
        ("src/db/tenant-manager.ts:1-120", symbol=TenantSchemaManager, action=read, skeleton=skeleton/db/tenant_manager.py),
        ("src/config/auth.ts:1-25", symbol=AuthConfig, action=modified),
    ]

    # ═══ ERROR MEMORY ═══
    # ⚠️ AI: DO NOT repeat these approaches!
    failed_approaches = [
        "Used Axios for Auth0 token exchange"  # ✗ Project forbids Axios, use native fetch (turn 9)
        "Stored tenant_id in cookie instead of JWT"  # ✗ Security: cookies can be tampered with (turn 14)
        "Used singleton pattern for DB connection pool"  # ✗ Violates DI constraint, causes test isolation issues (turn 20)
    ]

    # ═══ PREFERENCES ═══
    class Preferences:
        code_style = "functional"
        error_handling = "explicit Result types over try-catch"
        response_verbosity = "concise, code-first"
```

---

## 十、性能与容量分析

```
┌─────────────────────────────────────────────────────────────┐
│  COMPRESSION PERFORMANCE ANALYSIS                           │
├─────────────────────────────┬───────────────────────────────┤
│  对话轮次                    │  25 轮                        │
│  原始对话文本                │  48,320 字符 (~12,000 tokens) │
│  压缩后状态文件              │  2,180 字符 (~550 tokens)     │
│  压缩比                     │  22.2:1                       │
├─────────────────────────────┼───────────────────────────────┤
│  状态文件各部分 Token 消耗    │                               │
│    Header                   │  ~80 tokens                   │
│    Goal + Context           │  ~50 tokens                   │
│    Decisions                │  ~120 tokens                  │
│    Constraints              │  ~60 tokens                   │
│    Knowledge                │  ~70 tokens                   │
│    Tasks                    │  ~100 tokens                  │
│    CodeAnchors              │  ~50 tokens                   │
│    ErrorMemory              │  ~30 tokens                   │
├─────────────────────────────┼───────────────────────────────┤
│  与骨架系统联合使用           │                               │
│    session_state.py         │  ~550 tokens                  │
│    skeleton/__init__.py     │  ~2,000 tokens (大型项目)      │
│    当前讨论的 skeleton.py    │  ~500 tokens                  │
│    合计常驻 Context          │  ~3,050 tokens                │
│                             │                               │
│    128k Context 可用率       │  97.6% 留给实际工作            │
│    200k Context 可用率       │  98.5% 留给实际工作            │
└─────────────────────────────┴───────────────────────────────┘
```

---

## 十一、与骨架系统的完整集成

```python
# integration.py
# ────────────────────────────────────────────────────────────────
# 骨架系统 + 压缩器 = 完整的 AI 代码理解引擎
# ────────────────────────────────────────────────────────────────

import os
from context_compressor.engine import ContextCompressorEngine


class AICodeEngine:
    """
    完整的 AI 代码理解引擎
    
    空间维度 (WHERE)：骨架工程 skeleton/
    时间维度 (WHEN)：压缩状态 session_state.py
    寻址维度 (HOW)：导航索引 __init__.py
    """
    
    def __init__(self, project_root: str):
        self.project_root = project_root
        self.skeleton_dir = os.path.join(
            project_root, ".cursor", "skeleton"
        )
        self.context_dir = os.path.join(
            project_root, ".cursor", "context"
        )
        
        # 加载骨架索引
        skeleton_index = self._load_skeleton_index()
        
        # 初始化压缩器（关联骨架）
        self.compressor = ContextCompressorEngine(
            output_path=os.path.join(
                self.context_dir, "session_state.py"
            ),
            skeleton_index=skeleton_index,
            auto_save=True,
            debug=True
        )
    
    def _load_skeleton_index(self) -> dict:
        """加载骨架的 SYMBOL_MAP"""
        init_path = os.path.join(
            self.skeleton_dir, "__init__.py"
        )
        if not os.path.exists(init_path):
            return {}
        
        # 解析 SYMBOL_MAP
        symbol_map = {}
        with open(init_path) as f:
            content = f.read()
        
        import re
        pattern = re.compile(
            r'"(\w+)":\s*"(.+?)"', re.MULTILINE
        )
        for match in pattern.finditer(content):
            symbol_map[match.group(1)] = match.group(2)
        
        return symbol_map
    
    def get_ai_context_prompt(self) -> str:
        """
        生成注入到 AI 的完整上下文 Prompt
        
        这个 Prompt 包含：
        1. 项目骨架索引（空间维度）
        2. 会话状态（时间维度）
        3. 导航指令（行为维度）
        """
        parts = []
        
        # 1. 骨架索引
        init_path = os.path.join(
            self.skeleton_dir, "__init__.py"
        )
        if os.path.exists(init_path):
            with open(init_path) as f:
                parts.append(
                    "# === PROJECT SKELETON INDEX ===\n"
                    + f.read()
                )
        
        # 2. 会话状态
        state_path = os.path.join(
            self.context_dir, "session_state.py"
        )
        if os.path.exists(state_path):
            with open(state_path) as f:
                parts.append(
                    "# === SESSION STATE ===\n" 
                    + f.read()
                )
        
        # 3. 导航指令
        parts.append("""
# === NAVIGATION PROTOCOL ===
# 1. Check Session.Constraints BEFORE any code generation
# 2. Check Session.ErrorMemory to avoid past mistakes
# 3. Use SYMBOL_MAP to find any class/function
# 4. Use @origin annotations for exact source locations
# 5. Update Session by reporting: decisions, progress, errors
""")
        
        return "\n\n".join(parts)
    
    def process_conversation_turn(
        self, role: str, content: str, turn: int
    ):
        """处理一轮对话"""
        self.compressor.ingest(role, content, turn)
    
    def get_stats(self) -> dict:
        """获取引擎统计"""
        return {
            "compressor": self.compressor.get_compression_stats(),
            "skeleton_exists": os.path.exists(self.skeleton_dir),
            "context_exists": os.path.exists(
                os.path.join(
                    self.context_dir, "session_state.py"
                )
            )
        }
```

这就是 Context 压缩器的**完整明细**实现。每一层的职责、每一条数据的更新规则、每一种边界情况的处理逻辑，都有明确的代码和注释说明。