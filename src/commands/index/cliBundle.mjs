// src/commands/index/cliBundleEntry.ts
import { execFileSync } from "child_process";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { homedir } from "os";
import { join as join3, relative, resolve } from "path";

// src/context/compression/engine.ts
import path2 from "path";
import { promises as fs2 } from "fs";

// src/context/compression/utils.ts
import { promises as fs } from "fs";
import path from "path";
var SIMILARITY = {
  CONSTRAINT_MERGE: 0.7,
  ERROR_MERGE: 0.6,
  TASK_MATCH: 0.3
};
function tokenize(s) {
  const latinTokens = s.toLowerCase().match(/[a-z0-9]+/g) || [];
  const hanziTokens = s.match(/[\u4e00-\u9fff]/g) || [];
  return [...latinTokens, ...hanziTokens];
}
function similarity(a, b) {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.length === 0 && tokensB.length === 0)
    return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t))
      intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}
function toVarName(s) {
  let v = s.replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (/^\d/.test(v))
    v = `_${v}`;
  return v.toLowerCase().slice(0, 40) || "unknown";
}
function escape(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, " ").replace(/\r/g, "").trim().slice(0, 150);
}
function stripCodeBlocks(text) {
  return text.replace(/```[\s\S]*?```/g, "");
}
function makeId(prefix, content, turn) {
  const hashInput = `${content}_${turn}`;
  let hash = 0;
  for (let i = 0;i < hashInput.length; i++) {
    const chr = hashInput.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).slice(0, 8);
  return `${prefix}_${hex}`;
}
async function atomicWrite(filePath, content) {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `.tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  try {
    await fs.writeFile(tmpPath, content, "utf-8");
    await fs.rename(tmpPath, filePath);
  } catch (e) {
    try {
      await fs.unlink(tmpPath);
    } catch {}
    throw e;
  }
}

// src/context/compression/extractors.ts
var LOW_SIGNAL_MESSAGE_RE = /^(?:继续|继续吧|继续看看|继续处理|看看|看下|go\s+on|continue|carry\s+on)\s*$/i;
var REQUEST_ACTION_RE = /(?:增加|添加|实现|修复|更新|检查|查看|看看|导出|支持|重构|压缩|编译|打包|验证|补充|安装|运行|改成|改为|改到|移到|输出到|写到|完成|review|implement|add|update|fix|check|verify|export|support|refactor|build|compile|move|write|bump|ship|run)/i;
var CONSTRAINT_SIGNAL_RE = /(?:必须|一定要|务必|强制|只能|不允许|禁止|严禁|绝不|不可以|尽量|优先|最好|倾向|尽可能|不需要|无需|不用|只做到|只需要|仅需要|文件级别|函数级别)/i;
function withGlobal(pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}
function cleanExtractedText(value) {
  return (value || "").trim().replace(/^[`"'“”‘’]+|[`"'“”‘’]+$/g, "").replace(/[，,。.;；！!]+$/g, "").trim();
}
function normalizeClause(clause) {
  return clause.trim().replace(/^[-*•\d.、)\]]+\s*/, "").replace(/^[`"'“”‘’]+|[`"'“”‘’]+$/g, "").replace(/^(?:请你|请|帮我|麻烦|需要|我想|我需要|我要|希望|想要|另外|还有|然后|接下来|那就|现在|对了)\s*/i, "").trim();
}
function splitClauses(text) {
  return text.split(/[\n,，。！？!?；;]+/).flatMap((segment) => segment.split(/\s*(?:另外|并且|而且|同时|以及|also|and\s+then|plus)\s*/i)).map(normalizeClause).filter(Boolean);
}
function isConstraintClause(clause) {
  return CONSTRAINT_SIGNAL_RE.test(clause);
}
function hasActionIntent(clause) {
  return REQUEST_ACTION_RE.test(clause);
}
function looksConstraintLikeDecisionFragment(fragment) {
  const lower = fragment.toLowerCase();
  return ["文件级别", "函数级别", "体积", "大小", "token", "prompt"].some((keyword) => lower.includes(keyword));
}
function uniqueTaskUpdates(tasks) {
  const seen = new Set;
  return tasks.filter((task) => {
    const key = `${task.action}:${task.description.toLowerCase()}`;
    if (seen.has(key))
      return false;
    seen.add(key);
    return true;
  });
}
function extractRequestedClauses(text) {
  return splitClauses(text).filter((clause) => clause.length >= 4 && !LOW_SIGNAL_MESSAGE_RE.test(clause) && !isConstraintClause(clause) && hasActionIntent(clause));
}
var ACCEPTANCE_PATTERNS = [
  [/(?:就|决定|选择|采用|确认|确定)(?:使?用|采用)\s*(.+?)(?:[,，。.;；！!]|$)/, "zh"],
  [/(?:用|使用)\s*(.+?)(?:吧|好了|就行)(?:[,，。.;；！!]|$)/, "zh"],
  [/方案[是选]?\s*(.+?)(?:[,，。.;；！!]|$)/, "zh"],
  [/(?:改用|换用|切换到|切到|改成|改为|改到)\s*(.+?)(?:[,，。.;；！!]|$)/, "zh"],
  [/(?:let'?s?\s+(?:use|go\s+with|adopt|choose))\s+(.+?)(?:[,;!]|$)/i, "en"],
  [/(?:we(?:'ll)?\s+(?:use|go\s+with))\s+(.+?)(?:[,;!]|$)/i, "en"],
  [/(?:i\s+(?:decide|choose|prefer|want)\s+(?:to\s+use\s+)?)\s*(.+?)(?:[,;!]|$)/i, "en"],
  [/(?:go\s+with|stick\s+with|proceed\s+with|switch\s+to|move\s+to|migrate\s+to)\s+(.+?)(?:[,;!]|$)/i, "en"]
];
var REJECTION_PATTERNS = [
  [/(?:不要|不想|不用|禁止|不能)(?:使?用|采用)?\s*(.+?)(?:[,，。.;；！!]|$)/, "zh"],
  [/(?:别(?:使?用|采用))\s*(.+?)(?:[,，。.;；！!]|$)/, "zh"],
  [/(.+?)(?:不行|不好|算了|放弃|不合适)(?:[,，。.;；！!]|$)/, "zh"],
  [/(?:don'?t\s+use|avoid|reject|no\s+(?:more\s+)?)\s*(.+?)(?:[,;!]|$)/i, "en"],
  [/(?:not\s+(?:going\s+to\s+use|using))\s+(.+?)(?:[,;!]|$)/i, "en"],
  [/(.+?)\s+(?:is\s+(?:not\s+)?(?:suitable|appropriate|good)|won'?t\s+work)(?:[,;!]|$)/i, "en"]
];
var PROPOSED_PATTERNS = [
  [/(?:i\s+(?:suggest|recommend|propose))\s+(?:using\s+)?(.+?)(?:[,;!]|$)/i, "en"],
  [/(?:we\s+(?:could|should|can)\s+use)\s+(.+?)(?:[,;!]|$)/i, "en"],
  [/(?:建议|推荐)\s*(.+?)(?:[,，。.;；！!]|$)/, "zh"],
  [/(?:可以(?:考虑|尝试)?(?:使?用)?)\s*(.+?)(?:[,，。.;；！!]|$)/, "zh"]
];
var REVERTED_PATTERNS = [
  [/(?:撤回|回退|恢复|撤销|revert|undo|roll\s+back)\s*(.+?)(?:[,，。.;；！!]|$)/i, "zh"]
];
var TOPIC_KEYWORDS = {
  database: ["postgres", "mysql", "mongo", "sqlite", "redis", "数据库", "db", "database"],
  http_client: ["fetch", "axios", "got", "request", "http", "client"],
  auth_strategy: ["jwt", "oauth", "session", "token", "认证", "auth", "login"],
  framework: ["react", "vue", "angular", "next", "express", "fastapi", "框架"],
  state_management: ["redux", "zustand", "mobx", "pinia", "状态管理"],
  testing: ["jest", "vitest", "pytest", "测试", "test"],
  deployment: ["docker", "k8s", "kubernetes", "vercel", "部署", "deploy"],
  styling: ["tailwind", "css", "styled", "sass", "样式", "style"],
  orm: ["prisma", "typeorm", "drizzle", "sequelize", "sqlalchemy"],
  bundler: ["webpack", "vite", "esbuild", "rollup", "turbopack", "打包"],
  output_location: ["项目根目录", "安装目录", "project root", "output dir", "output directory"]
};

class DecisionDetector {
  detect(text, role, turn) {
    const decisions = [];
    if (role === "user") {
      for (const [pattern] of ACCEPTANCE_PATTERNS) {
        for (const match of text.matchAll(withGlobal(pattern))) {
          const choice = cleanExtractedText(match[1]);
          if (!choice || choice.length < 2 || choice.length > 100)
            continue;
          if (looksConstraintLikeDecisionFragment(choice))
            continue;
          const topic = this._inferTopic(choice, text);
          decisions.push({
            id: makeId("dec", topic, turn),
            topic,
            choice: escape(choice),
            alternativesRejected: [],
            reason: this._extractReason(text),
            status: "accepted" /* ACCEPTED */,
            turn
          });
        }
      }
      for (const [pattern] of REJECTION_PATTERNS) {
        for (const match of text.matchAll(withGlobal(pattern))) {
          const rejected = cleanExtractedText(match[1]);
          if (!rejected || rejected.length < 2 || rejected.length > 100)
            continue;
          if (looksConstraintLikeDecisionFragment(rejected))
            continue;
          const topic = this._inferTopic(rejected, text);
          decisions.push({
            id: makeId("dec_rej", topic, turn),
            topic,
            choice: "[REJECTED]",
            alternativesRejected: [escape(rejected)],
            reason: this._extractReason(text),
            status: "rejected" /* REJECTED */,
            turn
          });
        }
      }
      for (const [pattern] of REVERTED_PATTERNS) {
        for (const match of text.matchAll(withGlobal(pattern))) {
          const reverted = cleanExtractedText(match[1]);
          if (!reverted || reverted.length < 2 || reverted.length > 100)
            continue;
          if (looksConstraintLikeDecisionFragment(reverted))
            continue;
          const topic = this._inferTopic(reverted, text);
          decisions.push({
            id: makeId("dec_rev", topic, turn),
            topic,
            choice: "[REVERTED]",
            alternativesRejected: [escape(reverted)],
            reason: this._extractReason(text),
            status: "reverted" /* REVERTED */,
            turn
          });
        }
      }
    }
    if (role === "assistant") {
      for (const [pattern] of PROPOSED_PATTERNS) {
        for (const match of text.matchAll(withGlobal(pattern))) {
          const choice = cleanExtractedText(match[1]);
          if (!choice || choice.length < 2 || choice.length > 100)
            continue;
          if (looksConstraintLikeDecisionFragment(choice))
            continue;
          const topic = this._inferTopic(choice, text);
          decisions.push({
            id: makeId("dec_prop", topic, turn),
            topic,
            choice: escape(choice),
            alternativesRejected: [],
            reason: this._extractReason(text),
            status: "proposed" /* PROPOSED */,
            turn
          });
        }
      }
    }
    return decisions;
  }
  _inferTopic(choice, context) {
    const combined = `${choice} ${context}`.toLowerCase();
    for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
      if (keywords.some((kw) => combined.includes(kw))) {
        return `${topic}_choice`;
      }
    }
    return `choice_${toVarName(choice.slice(0, 20))}`;
  }
  _extractReason(text) {
    const reasonMatch = text.match(/(?:因为|由于|because|since|the\s+reason\s+is)\s*(.+?)(?:[,，。.;；！!]|$)/i);
    return reasonMatch ? escape(reasonMatch[1]) : "";
  }
}
var HARD_CONSTRAINT_PATTERNS = [
  [/(?:必须|一定要|务必|强制|只能)(?:使?用)?\s*(.+?)(?:[,，。.;；！!]|$)/, "hard"],
  [/(?:must|have\s+to|required\s+to|shall)\s+(?:use\s+)?(.+?)(?:[,;!]|$)/i, "hard"],
  [/(?:不允许|禁止|严禁|绝不|不可以)(?:使?用)?\s*(.+?)(?:[,，。.;；！!]|$)/, "hard_forbid"],
  [/(?:不需要|无需|不用)(?:再)?(?:做到|做|到)?\s*(.+?)(?:即可|就可以|就行|[,，。.;；！!]|$)/, "hard_forbid"],
  [/(?:只做到|做到|只需要|仅需要)\s*(.+?)(?:即可|就可以|就行|为止|[,，。.;；！!]|$)/, "hard"],
  [/(?:must\s+not|forbidden|prohibited|never)\s+(?:use\s+)?(.+?)(?:[,;!]|$)/i, "hard_forbid"]
];
var SOFT_CONSTRAINT_PATTERNS = [
  [/(?:尽量|优先|最好|倾向于?|尽可能)(?:使?用)?\s*(.+?)(?:[,，。.;；！!]|$)/, "soft"],
  [/(?:prefer|ideally|if\s+possible)\s+(?:use\s+)?(.+?)(?:[,;!]|$)/i, "soft"]
];

class ConstraintDetector {
  detect(text, role, turn) {
    if (role !== "user")
      return [];
    const constraints = [];
    for (const [pattern, severityType] of HARD_CONSTRAINT_PATTERNS) {
      for (const match of text.matchAll(withGlobal(pattern))) {
        let rule = cleanExtractedText(match[1]);
        if (!rule || rule.length < 2 || rule.length > 100)
          continue;
        if (severityType === "hard_forbid")
          rule = `FORBIDDEN: ${rule}`;
        constraints.push({
          id: makeId("con", rule, turn),
          category: this._categorizeConstraint(rule),
          rule: escape(rule),
          reason: this._extractReason(text),
          severity: "hard",
          turn,
          isActive: true
        });
      }
    }
    for (const [pattern] of SOFT_CONSTRAINT_PATTERNS) {
      for (const match of text.matchAll(withGlobal(pattern))) {
        const rule = cleanExtractedText(match[1]);
        if (!rule || rule.length < 2 || rule.length > 100)
          continue;
        constraints.push({
          id: makeId("con_soft", rule, turn),
          category: this._categorizeConstraint(rule),
          rule: escape(rule),
          reason: this._extractReason(text),
          severity: "soft",
          turn,
          isActive: true
        });
      }
    }
    return constraints;
  }
  _categorizeConstraint(rule) {
    const lower = rule.toLowerCase();
    if (["library", "framework", "tool", "sdk", "api", "库", "框架"].some((k) => lower.includes(k)))
      return "technology";
    if (["pattern", "architecture", "structure", "layer", "模式", "架构"].some((k) => lower.includes(k)))
      return "architecture";
    if (["naming", "format", "indent", "comment", "style", "命名", "格式"].some((k) => lower.includes(k)))
      return "style";
    if (["token", "size", "volume", "文件级别", "函数级别", "路径", "目录", "输出", "压缩", "prompt"].some((k) => lower.includes(k)))
      return "process";
    return "technology";
  }
  _extractReason(text) {
    const reasonMatch = text.match(/(?:因为|由于|because|since|the\s+reason\s+is)\s*(.+?)(?:[,，。.;；！!]|$)/i);
    return reasonMatch ? escape(reasonMatch[1]) : "";
  }
}
var GOAL_PATTERNS = [
  /(?:我想|我需要|我要|帮我|请|目标是|任务是)\s*(.+?)(?:[,，。.;；！!]|$)/,
  /(?:i\s+(?:want|need)\s+(?:to|you\s+to))\s+(.+?)(?:[,;!]|$)/i,
  /(?:(?:the\s+)?goal\s+is\s+(?:to\s+)?)\s*(.+?)(?:[,;!]|$)/i,
  /(?:为|给|把|在)\s*(.+?(?:增加|添加|实现|修复|更新|检查|导出|支持|重构|压缩|编译|打包|验证|改成|改为|改到).+?)(?:[,，。.;；！!]|$)/
];
var GOAL_CHANGE_PATTERNS = [
  /(?:改为|变成|换成|改成|instead|change\s+to|switch\s+to)\s+(.+?)(?:[,，。.;；！!]|$)/i
];

class GoalDetector {
  detect(text, role, _turn, currentGoal) {
    if (role !== "user")
      return null;
    if (LOW_SIGNAL_MESSAGE_RE.test(text.trim()))
      return null;
    for (const pattern of GOAL_CHANGE_PATTERNS) {
      const match = text.match(pattern);
      const updatedGoal = cleanExtractedText(match?.[1]);
      if (updatedGoal.length > 5)
        return updatedGoal;
    }
    if (currentGoal?.trim()) {
      return null;
    }
    for (const pattern of GOAL_PATTERNS) {
      const match = text.match(pattern);
      const goal = cleanExtractedText(match?.[1]);
      if (goal.length > 6)
        return goal;
    }
    const fallbackGoal = extractRequestedClauses(text)[0];
    if (fallbackGoal && fallbackGoal.length > 6) {
      return fallbackGoal;
    }
    return null;
  }
}
var FACT_PATTERNS = {
  database: [
    /(?:数据库|database)\s*(?:是|用的?是?|=|:)\s*(.+?)(?:[,，。.;；\s]|$)/,
    /(?:using|use)\s+((?:postgres|mysql|mongo|sqlite|redis)\w*)/i
  ],
  language: [
    /(?:语言|language)\s*(?:是|用的?是?)\s*(.+?)(?:[,，。.;；\s]|$)/,
    /(?:written\s+in|using)\s+(typescript|javascript|python|rust|go|java)/i
  ],
  framework: [
    /(?:框架|framework)\s*(?:是|用的?是?)\s*(.+?)(?:[,，。.;；\s]|$)/
  ],
  api_url: [
    /(?:api|url|地址|endpoint)\s*(?:是|=|:)\s*(https?:\/\/\S+)/
  ],
  version: [
    /(?:version|版本(?:号)?)\s*(?:是|=|:|改成|改为|更新到)\s*([0-9A-Za-z._+-]+)(?:[,，。.;；\s]|$)/i
  ],
  build_tool: [
    /(?:用|using)\s+(bun|npm|pnpm|yarn)\s*(?:编译|构建|build|compile)/i,
    /(?:build|compile)\s+with\s+(bun|npm|pnpm|yarn)(?:[,;!]|$)/i
  ]
};

class FactDetector {
  detect(text, role, turn) {
    const facts = [];
    const confidence = role === "user" ? "certain" /* CERTAIN */ : "inferred" /* INFERRED */;
    const categoryByKey = {
      version: "release",
      build_tool: "tooling"
    };
    for (const [category, patterns] of Object.entries(FACT_PATTERNS)) {
      for (const pattern of patterns) {
        for (const match of text.matchAll(withGlobal(pattern))) {
          const value = cleanExtractedText(match[1]);
          if (value && value.length >= 1 && value.length <= 100) {
            facts.push({
              key: category,
              value: escape(value),
              category: categoryByKey[category] || "tech_stack",
              confidence,
              sourceTurn: turn
            });
          }
        }
      }
    }
    return facts;
  }
}
var COMPLETION_PATTERNS = [
  /(?:完成了|做好了|搞定了|已经好了)\s*(.+?)(?:[,，。.;；！!]|$)/,
  /(.+?)(?:完成|搞定|做好)了?/,
  /(?:已(?:经)?|已经)(?:完成|实现|修复|更新|添加|新增|支持|导出|打包|编译)\s*(.+?)(?:[,，。.;；！!]|$)/,
  /(?:finished|completed|done\s+with|created|implemented|added|updated|modified|fixed|rebuilt|wired)\s+(.+?)(?:[,;!]|$)/i,
  /(?:i'?ve?\s+(?:created|modified|updated|fixed|implemented|added|wired|rebuilt))\s+(.+?)(?:[,;!]|$)/i
];
var BLOCKER_PATTERNS = [
  /(?:遇到问题|报错|出错|卡住|失败)\s*(.+?)(?:[,，。.;；！!]|$)/,
  /(.+?)(?:报错|出错|失败|不行)了?/,
  /(?:error|failed|stuck|blocked|issue)\s+(?:with|on|in)?\s*(.+?)(?:[,;!]|$)/i
];
var NEW_TASK_PATTERNS = [
  /(?:接下来|下一步|然后|待办|需要做)\s*(.+?)(?:[,，。.;；！!]|$)/,
  /(?:next|todo|then|now\s+(?:let'?s?|we\s+need\s+to))\s+(.+?)(?:[,;!]|$)/i
];
function detectProgress(text, role, turn) {
  const tasks = [];
  for (const pattern of COMPLETION_PATTERNS) {
    for (const match of text.matchAll(withGlobal(pattern))) {
      const desc = cleanExtractedText(match[1]);
      if (desc && desc.length > 2 && desc.length < 100) {
        tasks.push({ action: "complete", description: desc, detail: "", turn });
      }
    }
  }
  for (const pattern of BLOCKER_PATTERNS) {
    for (const match of text.matchAll(withGlobal(pattern))) {
      const desc = cleanExtractedText(match[1]);
      if (desc && desc.length > 2 && desc.length < 100) {
        tasks.push({ action: "block", description: desc, detail: "", turn });
      }
    }
  }
  for (const pattern of NEW_TASK_PATTERNS) {
    for (const match of text.matchAll(withGlobal(pattern))) {
      const desc = cleanExtractedText(match[1]);
      if (desc && desc.length > 2 && desc.length < 100) {
        tasks.push({ action: "create", description: desc, detail: "", turn });
      }
    }
  }
  if (role === "user") {
    for (const clause of extractRequestedClauses(text)) {
      tasks.push({ action: "create", description: clause, detail: "", turn });
    }
  }
  return uniqueTaskUpdates(tasks);
}
var FILE_PATH_RE = /(?:^|\s|[`"'])((?:[\w\-./]+\/)?[\w\-]+\.(?:ts|tsx|js|jsx|py|rs|go|java|cpp|c|h|hpp|rb|php|swift|kt))(?:\s|[`"']|$|[,.:;])/gm;
var LINE_REF_RE = /(?:(?:第|line|行|L)\s*(\d+)\s*(?:行|line)?(?:\s*(?:到|to|-)\s*(\d+))?)/gi;
var AGENT_ACTION_PATTERNS = [
  [/(?:read|reading|读取?了?)\s+(?:file\s+)?[`'"]?([\w\-./]+\.[\w]+)/i, "read"],
  [/(?:modif(?:y|ied)|updat(?:e|ed)|chang(?:e|ed)|修改了?)\s+(?:file\s+)?[`'"]?([\w\-./]+\.[\w]+)/i, "modified"],
  [/(?:creat(?:e|ed)|writ(?:e|ten)|新建了?|创建了?)\s+(?:file\s+)?[`'"]?([\w\-./]+\.[\w]+)/i, "created"]
];

class AnchorDetector {
  skeletonIndex;
  constructor(skeletonIndex) {
    this.skeletonIndex = skeletonIndex;
  }
  detect(text, role, turn) {
    const anchors = [];
    const seen = new Set;
    for (const match of text.matchAll(FILE_PATH_RE)) {
      const filePath = match[1];
      if (this._isLowValuePath(filePath))
        continue;
      if (seen.has(filePath))
        continue;
      seen.add(filePath);
      let lineStart = 0;
      let lineEnd = 0;
      const nearby = text.slice(Math.max(0, match.index - 50), match.index + match[0].length + 50);
      const lineMatch = Array.from(nearby.matchAll(LINE_REF_RE))[0];
      if (lineMatch) {
        lineStart = parseInt(lineMatch[1], 10);
        lineEnd = lineMatch[2] ? parseInt(lineMatch[2], 10) : lineStart;
      }
      const skeletonPath = this._findSkeletonPath(filePath);
      anchors.push({
        filePath,
        lineStart,
        lineEnd,
        symbolName: "",
        skeletonPath,
        action: "referenced",
        turn,
        note: ""
      });
    }
    if (role === "assistant") {
      for (const [pattern, action] of AGENT_ACTION_PATTERNS) {
        for (const match of text.matchAll(withGlobal(pattern))) {
          const filePath = match[1];
          if (this._isLowValuePath(filePath))
            continue;
          const skeletonPath = this._findSkeletonPath(filePath);
          anchors.push({
            filePath,
            lineStart: 0,
            lineEnd: 0,
            symbolName: "",
            skeletonPath,
            action,
            turn,
            note: ""
          });
        }
      }
    }
    return this._deduplicate(anchors);
  }
  _findSkeletonPath(filePath) {
    if (!this.skeletonIndex)
      return;
    return this.skeletonIndex.get(filePath);
  }
  _isLowValuePath(filePath) {
    return [
      ".code_index/",
      ".codex/",
      ".claude/",
      "node_modules/",
      ".git/",
      "dist/.claude/"
    ].some((prefix) => filePath.startsWith(prefix));
  }
  _deduplicate(anchors) {
    const byFile = new Map;
    const priorityOrder = ["created", "modified", "read", "referenced"];
    for (const anchor of anchors) {
      const existing = byFile.get(anchor.filePath);
      if (!existing) {
        byFile.set(anchor.filePath, anchor);
      } else {
        const existingPriority = priorityOrder.indexOf(existing.action);
        const newPriority = priorityOrder.indexOf(anchor.action);
        if (newPriority < existingPriority) {
          byFile.set(anchor.filePath, anchor);
        }
      }
    }
    return Array.from(byFile.values());
  }
}
var FAILURE_PATTERNS = [
  /(?:this\s+(?:approach|method|solution)\s+(?:doesn'?t|won'?t|didn'?t)\s+work)/i,
  /(?:这个?(?:方案|方法|办法)(?:不行|有问题|失败|不可行))/,
  /(?:尝试了?\s*(.+?)\s*(?:但是?|不过)\s*(?:失败|报错|不行))/,
  /(?:tried\s+(.+?)\s+but\s+(?:it\s+)?(?:failed|didn'?t\s+work|errored))/i
];
var ERROR_STACK_RE = /(?:Error|Exception|Traceback|panic|FATAL)[:\s]+(.+?)(?:\n\s+at|\n\n|$)/gim;

class ErrorMemoryDetector {
  detect(text, _role, turn) {
    const errors = [];
    for (const pattern of FAILURE_PATTERNS) {
      for (const match of text.matchAll(withGlobal(pattern))) {
        const approach = match[1]?.trim() || match[0].slice(0, 80);
        errors.push({
          approach: escape(approach),
          failureReason: this._extractFailureReason(text),
          turn,
          relatedFiles: this._extractRelatedFiles(text)
        });
      }
    }
    for (const match of text.matchAll(ERROR_STACK_RE)) {
      const errorMsg = match[1]?.trim().slice(0, 100) || "Unknown error";
      errors.push({
        approach: `Code execution at turn ${turn}`,
        failureReason: escape(errorMsg),
        turn,
        relatedFiles: this._extractRelatedFiles(text)
      });
    }
    return errors;
  }
  _extractFailureReason(text) {
    const reasonMatch = text.match(/(?:because|the\s+issue\s+is|原因是)\s*(.+?)(?:[,，。.;；！!]|$)/i);
    return reasonMatch ? escape(reasonMatch[1]) : "Detected failure signal";
  }
  _extractRelatedFiles(text) {
    const files = [];
    for (const match of text.matchAll(FILE_PATH_RE)) {
      if (!files.includes(match[1])) {
        files.push(match[1]);
      }
    }
    return files;
  }
}

class MasterExtractor {
  decisionDetector = new DecisionDetector;
  constraintDetector = new ConstraintDetector;
  goalDetector = new GoalDetector;
  factDetector = new FactDetector;
  anchorDetector;
  errorDetector = new ErrorMemoryDetector;
  constructor(skeletonIndex) {
    this.anchorDetector = new AnchorDetector(skeletonIndex);
  }
  extract(text, role, turn, _currentState) {
    const cleanText = stripCodeBlocks(text);
    return {
      goalUpdate: this.goalDetector.detect(cleanText, role, turn, _currentState?.primaryGoal),
      decisions: this.decisionDetector.detect(cleanText, role, turn),
      constraints: this.constraintDetector.detect(cleanText, role, turn),
      factUpdates: this.factDetector.detect(cleanText, role, turn),
      tasks: detectProgress(cleanText, role, turn),
      codeAnchors: this.anchorDetector.detect(cleanText, role, turn),
      errorMemories: this.errorDetector.detect(cleanText, role, turn)
    };
  }
}

// src/context/compression/merger.ts
var MAX = {
  DECISIONS: 30,
  CONSTRAINTS: 20,
  FACTS: 50,
  TASKS: 15,
  ANCHORS: 20,
  ERRORS: 10
};

class StateMerger {
  merge(state, extraction, turn) {
    const next = {
      ...state,
      lastUpdatedTurn: turn,
      decisions: [...state.decisions],
      constraints: [...state.constraints],
      tasks: [...state.tasks],
      facts: state.facts ? [...state.facts] : [],
      codeAnchors: state.codeAnchors ? [...state.codeAnchors] : [],
      errorMemories: state.errorMemories ? [...state.errorMemories] : []
    };
    if (extraction.goalUpdate) {
      next.primaryGoal = extraction.goalUpdate;
    }
    for (const dec of extraction.decisions) {
      this._mergeDecision(next, dec);
    }
    for (const con of extraction.constraints) {
      this._mergeConstraint(next, con);
    }
    for (const fact of extraction.factUpdates) {
      this._mergeFact(next, fact);
    }
    for (const taskUpdate of extraction.tasks) {
      this._mergeTask(next, taskUpdate, turn);
    }
    for (const anchor of extraction.codeAnchors) {
      this._mergeAnchor(next, anchor);
    }
    for (const error of extraction.errorMemories) {
      this._mergeError(next, error);
    }
    this._decayAndEvict(next, turn);
    this._trimToLimits(next);
    return next;
  }
  _mergeDecision(state, newDecision) {
    const existingIdx = state.decisions.findIndex((d) => d.topic === newDecision.topic && d.status !== "superseded" /* SUPERSEDED */);
    if (existingIdx >= 0) {
      const existing = state.decisions[existingIdx];
      if (newDecision.status === "rejected" /* REJECTED */) {
        if (existing.status === "accepted" /* ACCEPTED */ && !this._rejectsCurrentChoice(existing, newDecision)) {
          state.decisions[existingIdx] = {
            ...existing,
            alternativesRejected: this._mergeRejectedAlternatives(existing.alternativesRejected, newDecision.alternativesRejected)
          };
          return;
        }
        state.decisions[existingIdx] = { ...existing, status: "superseded" /* SUPERSEDED */ };
        state.decisions.push(newDecision);
      } else if (newDecision.status === "accepted" /* ACCEPTED */) {
        const priorRejected = existing.status === "rejected" /* REJECTED */ ? existing.alternativesRejected : existing.choice && existing.choice !== "[REJECTED]" ? [existing.choice] : [];
        state.decisions[existingIdx] = {
          ...newDecision,
          alternativesRejected: this._mergeRejectedAlternatives(existing.alternativesRejected, priorRejected, newDecision.alternativesRejected)
        };
      } else if (newDecision.status === "reverted" /* REVERTED */) {
        state.decisions[existingIdx] = { ...existing, status: "superseded" /* SUPERSEDED */ };
        state.decisions.push(newDecision);
      } else if (newDecision.status === "proposed" /* PROPOSED */) {
        if (existing.status !== "accepted" /* ACCEPTED */) {
          state.decisions[existingIdx] = newDecision;
        }
      }
    } else {
      state.decisions.push(newDecision);
    }
  }
  _mergeRejectedAlternatives(...lists) {
    return Array.from(new Set(lists.flat().filter(Boolean)));
  }
  _rejectsCurrentChoice(existing, rejection) {
    const currentChoice = existing.choice.toLowerCase();
    return rejection.alternativesRejected.some((rejected) => {
      const value = rejected.toLowerCase();
      return value === currentChoice || value.includes(currentChoice) || currentChoice.includes(value);
    });
  }
  _mergeConstraint(state, newConstraint) {
    for (let i = 0;i < state.constraints.length; i++) {
      const existing = state.constraints[i];
      if (!existing.isActive)
        continue;
      if (existing.rule === newConstraint.rule) {
        return;
      }
      if (similarity(existing.rule, newConstraint.rule) > SIMILARITY.CONSTRAINT_MERGE) {
        if (newConstraint.severity === "hard" && existing.severity === "soft") {
          state.constraints[i] = newConstraint;
        }
        return;
      }
    }
    state.constraints.push(newConstraint);
  }
  _mergeFact(state, newFact) {
    if (!state.facts)
      state.facts = [];
    const confidenceOrder = [
      "certain" /* CERTAIN */,
      "inferred" /* INFERRED */,
      "uncertain" /* UNCERTAIN */
    ];
    const existingIdx = state.facts.findIndex((f) => f.key === newFact.key && f.category === newFact.category);
    if (existingIdx >= 0) {
      const existing = state.facts[existingIdx];
      const existingConfidence = confidenceOrder.indexOf(existing.confidence);
      const newConfidence = confidenceOrder.indexOf(newFact.confidence);
      if (newConfidence <= existingConfidence) {
        state.facts[existingIdx] = newFact;
      }
    } else {
      state.facts.push(newFact);
    }
  }
  _mergeTask(state, taskUpdate, turn) {
    switch (taskUpdate.action) {
      case "create": {
        const existing = this._findMatchingTask(state, taskUpdate.description, true);
        if (existing) {
          existing.description = taskUpdate.description;
          existing.status = "planned";
          existing.turn = turn;
          return;
        }
        state.tasks.push({
          id: `task_${turn}_${state.tasks.length}`,
          description: taskUpdate.description,
          status: "planned",
          completedSubtasks: [],
          remainingSubtasks: [],
          artifacts: [],
          turn
        });
        break;
      }
      case "complete": {
        const match = this._findMatchingTask(state, taskUpdate.description, true);
        if (match) {
          match.description = taskUpdate.description;
          match.status = "done";
          if (!match.completedSubtasks.includes(taskUpdate.description)) {
            match.completedSubtasks.push(taskUpdate.description);
          }
          match.turn = turn;
        } else {
          state.tasks.push({
            id: `task_${turn}_${state.tasks.length}`,
            description: taskUpdate.description,
            status: "done",
            completedSubtasks: [taskUpdate.description],
            remainingSubtasks: [],
            artifacts: [],
            turn
          });
        }
        break;
      }
      case "block": {
        const blocked = this._findMatchingTask(state, taskUpdate.description, true) || state.tasks.find((t) => t.status === "in_progress" || t.status === "planned");
        if (blocked) {
          blocked.description = taskUpdate.description;
          blocked.status = "blocked";
          blocked.turn = turn;
        } else {
          state.tasks.push({
            id: `task_${turn}_${state.tasks.length}`,
            description: taskUpdate.description,
            status: "blocked",
            completedSubtasks: [],
            remainingSubtasks: [],
            artifacts: [],
            turn
          });
        }
        break;
      }
    }
  }
  _findMatchingTask(state, description, includeCompleted = false) {
    for (const task of state.tasks) {
      if (!includeCompleted && (task.status === "done" || task.status === "abandoned")) {
        continue;
      }
      if (task.status === "in_progress" || task.status === "planned" || includeCompleted && task.status === "done" || task.description.toLowerCase().includes(description.toLowerCase().slice(0, 20))) {
        return task;
      }
      if (similarity(task.description, description) > SIMILARITY.TASK_MATCH) {
        return task;
      }
    }
    return null;
  }
  _mergeAnchor(state, newAnchor) {
    if (!state.codeAnchors)
      state.codeAnchors = [];
    const existingIdx = state.codeAnchors.findIndex((a) => a.filePath === newAnchor.filePath);
    if (existingIdx >= 0) {
      const existing = state.codeAnchors[existingIdx];
      const priorityOrder = ["created", "modified", "read", "referenced"];
      const existingPriority = priorityOrder.indexOf(existing.action);
      const newPriority = priorityOrder.indexOf(newAnchor.action);
      if (newPriority < existingPriority) {
        state.codeAnchors[existingIdx] = newAnchor;
      } else {
        state.codeAnchors[existingIdx] = { ...existing, turn: newAnchor.turn };
      }
    } else {
      state.codeAnchors.push(newAnchor);
    }
  }
  _mergeError(state, newError) {
    if (!state.errorMemories)
      state.errorMemories = [];
    for (const existing of state.errorMemories) {
      if (similarity(existing.approach, newError.approach) > SIMILARITY.ERROR_MERGE || similarity(existing.failureReason, newError.failureReason) > SIMILARITY.ERROR_MERGE) {
        existing.turn = newError.turn;
        return;
      }
    }
    state.errorMemories.push(newError);
  }
  _decayAndEvict(state, currentTurn) {
    state.decisions = state.decisions.filter((d) => !(d.status === "superseded" /* SUPERSEDED */ && currentTurn - d.turn > 20));
    if (state.facts) {
      state.facts = state.facts.filter((f) => !(f.confidence === "uncertain" /* UNCERTAIN */ && currentTurn - f.sourceTurn > 10));
    }
    state.tasks = state.tasks.filter((t) => !((t.status === "done" || t.status === "abandoned") && currentTurn - t.turn > 30));
    state.constraints = state.constraints.filter((c) => !(c.isActive === false && currentTurn - c.turn > 20));
  }
  _trimToLimits(state) {
    const activeDecisions = state.decisions.filter((d) => d.status !== "superseded" /* SUPERSEDED */);
    const supersededDecisions = state.decisions.filter((d) => d.status === "superseded" /* SUPERSEDED */);
    if (activeDecisions.length > MAX.DECISIONS) {
      state.decisions = activeDecisions.slice(-MAX.DECISIONS);
    } else if (activeDecisions.length + supersededDecisions.length > MAX.DECISIONS) {
      const available = MAX.DECISIONS - activeDecisions.length;
      state.decisions = [
        ...activeDecisions,
        ...supersededDecisions.slice(-available)
      ];
    }
    state.constraints = state.constraints.filter((c) => c.isActive).slice(-MAX.CONSTRAINTS);
    if (state.facts && state.facts.length > MAX.FACTS) {
      state.facts = state.facts.slice(-MAX.FACTS);
    }
    if (state.tasks.length > MAX.TASKS) {
      state.tasks = state.tasks.slice(-MAX.TASKS);
    }
    if (state.codeAnchors && state.codeAnchors.length > MAX.ANCHORS) {
      state.codeAnchors = state.codeAnchors.slice(-MAX.ANCHORS);
    }
    if (state.errorMemories && state.errorMemories.length > MAX.ERRORS) {
      state.errorMemories = state.errorMemories.slice(-MAX.ERRORS);
    }
  }
}

// src/context/compression/serializer.ts
function createEmptySessionState() {
  return {
    primaryGoal: "",
    decisions: [],
    constraints: [],
    tasks: [],
    lastUpdatedTurn: 0
  };
}
class StateSerializer {
  serialize(state) {
    const lines = [];
    lines.push("# session_state.py  (auto-generated by context compressor)");
    lines.push("# ════════════════════════════════════════════════════════════════");
    lines.push("# COMPRESSED SESSION STATE");
    lines.push("# This file captures decisions, constraints, and task progress");
    lines.push("# from the conversation. Re-inject into Context on each turn.");
    lines.push(`# Turn: ${state.lastUpdatedTurn}`);
    if (state.totalTurns)
      lines.push(`# Total turns: ${state.totalTurns}`);
    if (state.rawCharsIngested)
      lines.push(`# Raw chars ingested: ${state.rawCharsIngested}`);
    if (state.compressedChars)
      lines.push(`# Compressed chars: ${state.compressedChars}`);
    lines.push("# ════════════════════════════════════════════════════════════════");
    lines.push("from __future__ import annotations");
    lines.push("from typing import Dict, List, Optional");
    lines.push("");
    lines.push("");
    lines.push("class CurrentSession:");
    lines.push(`    primary_goal = ${pyStr(state.primaryGoal || "Not yet defined")}`);
    if (state.goalStatus) {
      lines.push(`    goal_status = ${pyStr(state.goalStatus)}`);
    }
    if (state.secondaryGoals && state.secondaryGoals.length > 0) {
      lines.push(`    secondary_goals = ${pyList(state.secondaryGoals)}`);
    }
    lines.push(`    last_updated_turn = ${state.lastUpdatedTurn}`);
    lines.push("");
    if (state.projectName || state.projectType || state.techStack && state.techStack.length > 0) {
      lines.push("    class ProjectContext:");
      if (state.projectName)
        lines.push(`        project_name = ${pyStr(state.projectName)}`);
      if (state.projectType)
        lines.push(`        project_type = ${pyStr(state.projectType)}`);
      if (state.techStack && state.techStack.length > 0) {
        lines.push(`        tech_stack = ${pyList(state.techStack)}`);
      }
      if (state.architectureStyle)
        lines.push(`        architecture_style = ${pyStr(state.architectureStyle)}`);
      lines.push("");
    }
    lines.push("    class Decisions:");
    const activeDecisions = state.decisions.filter((d) => d.status === "accepted" /* ACCEPTED */);
    const rejectedDecisions = state.decisions.filter((d) => d.status === "rejected" /* REJECTED */);
    const proposedDecisions = state.decisions.filter((d) => d.status === "proposed" /* PROPOSED */);
    if (activeDecisions.length === 0 && rejectedDecisions.length === 0 && proposedDecisions.length === 0) {
      lines.push("        ...  # No decisions recorded yet");
    } else {
      if (activeDecisions.length > 0) {
        lines.push("        # Accepted:");
        for (const dec of activeDecisions) {
          lines.push(decisionToPythonLine(dec, 8));
        }
      }
      if (rejectedDecisions.length > 0) {
        lines.push("");
        lines.push("        # Rejected:");
        for (const dec of rejectedDecisions) {
          lines.push(decisionToPythonLine(dec, 8));
        }
      }
      if (proposedDecisions.length > 0) {
        lines.push("");
        lines.push("        # Proposed (pending confirmation):");
        for (const dec of proposedDecisions) {
          lines.push(decisionToPythonLine(dec, 8));
        }
      }
    }
    lines.push("");
    lines.push("    class Constraints:");
    if (state.constraints.length === 0) {
      lines.push("        ...  # No constraints recorded yet");
    } else {
      const hard = state.constraints.filter((c) => c.severity === "hard");
      const soft = state.constraints.filter((c) => c.severity === "soft");
      if (hard.length > 0) {
        lines.push("        # Hard constraints (MUST follow):");
        for (const con of hard) {
          lines.push(constraintToPythonLine(con, 8));
        }
      }
      if (soft.length > 0) {
        lines.push("");
        lines.push("        # Soft constraints (Recommended):");
        for (const con of soft) {
          lines.push(constraintToPythonLine(con, 8));
        }
      }
    }
    lines.push("");
    if (state.facts && state.facts.length > 0) {
      lines.push("    class Knowledge:");
      const byCategory = new Map;
      for (const f of state.facts) {
        if (!byCategory.has(f.category))
          byCategory.set(f.category, []);
        byCategory.get(f.category).push(f);
      }
      for (const [category, facts] of byCategory) {
        lines.push(`        # ${category}:`);
        for (const f of facts) {
          lines.push(factToPythonLine(f, 8));
        }
      }
      lines.push("");
    }
    lines.push("    class Tasks:");
    if (state.tasks.length === 0) {
      lines.push("        ...  # No tasks recorded yet");
    } else {
      const inProgress = state.tasks.filter((t) => t.status === "in_progress" || t.status === "planned");
      const done = state.tasks.filter((t) => t.status === "done");
      const blocked = state.tasks.filter((t) => t.status === "blocked");
      if (done.length > 0) {
        lines.push("        completed = [");
        for (const t of done) {
          lines.push(`            ${pyStr(t.description)},`);
        }
        lines.push("        ]");
      }
      if (inProgress.length > 0) {
        lines.push("        pending = [");
        for (const t of inProgress) {
          lines.push(`            ${pyStr(t.description)},`);
        }
        lines.push("        ]");
      }
      if (blocked.length > 0) {
        lines.push("        blocked = [");
        for (const t of blocked) {
          lines.push(`            ${pyStr(t.description)},`);
        }
        lines.push("        ]");
      }
    }
    lines.push("");
    if (state.codeAnchors && state.codeAnchors.length > 0) {
      lines.push("    class CodeAnchors:");
      const priorityOrder = ["created", "modified", "read", "referenced"];
      const sorted = [...state.codeAnchors].sort((a, b) => priorityOrder.indexOf(a.action) - priorityOrder.indexOf(b.action));
      for (const anchor of sorted) {
        lines.push(anchorToPythonLine(anchor, 8));
      }
      lines.push("");
    }
    if (state.errorMemories && state.errorMemories.length > 0) {
      lines.push("    class ErrorMemory:");
      lines.push("        # Failed approaches (do not retry):");
      for (const err of state.errorMemories) {
        lines.push(errorToPythonLine(err, 8));
      }
      lines.push("");
    }
    if (state.preferences && Object.keys(state.preferences).length > 0) {
      lines.push("    class Preferences:");
      for (const [key, value] of Object.entries(state.preferences)) {
        lines.push(`        ${toVarName(key)} = ${pyStr(value)}`);
      }
      lines.push("");
    }
    lines.push("def get_context() -> CurrentSession:");
    lines.push('    """Return the current session state for injection into Context."""');
    lines.push("    return CurrentSession");
    lines.push("");
    return lines.join(`
`);
  }
  serializeHistory(state) {
    const lines = [];
    const entries = buildHistoryEntries(state);
    lines.push("# session_history.py  (auto-generated by context compressor)");
    lines.push("# Compact timeline archive for debugging and session recovery.");
    lines.push("from __future__ import annotations");
    lines.push("");
    lines.push("class SessionHistory:");
    lines.push(`    session_id = ${pyStr(state.sessionId || "unknown")}`);
    lines.push(`    total_turns = ${state.totalTurns || 0}`);
    lines.push(`    last_updated_turn = ${state.lastUpdatedTurn || 0}`);
    lines.push(`    primary_goal = ${pyStr(state.primaryGoal || "Not yet defined")}`);
    lines.push("");
    lines.push("    timeline = [");
    if (entries.length === 0) {
      lines.push(`        ${pyStr("turn 0 | no archived events yet")},`);
    } else {
      for (const entry of entries) {
        lines.push(`        ${pyStr(entry)},`);
      }
    }
    lines.push("    ]");
    lines.push("");
    lines.push("def get_history() -> SessionHistory:");
    lines.push("    return SessionHistory");
    lines.push("");
    return lines.join(`
`);
  }
  serializeMetrics(state) {
    const lines = [];
    const rawChars = state.rawCharsIngested || 0;
    const compressedChars = state.compressedChars || 0;
    const compressionRatio = compressedChars > 0 ? Number((rawChars / compressedChars).toFixed(2)) : 0;
    const acceptedDecisions = state.decisions.filter((d) => d.status === "accepted" /* ACCEPTED */).length;
    const rejectedDecisions = state.decisions.filter((d) => d.status === "rejected" /* REJECTED */).length;
    const proposedDecisions = state.decisions.filter((d) => d.status === "proposed" /* PROPOSED */).length;
    const activeConstraints = state.constraints.filter((c) => c.isActive).length;
    const completedTasks = state.tasks.filter((t) => t.status === "done").length;
    const blockedTasks = state.tasks.filter((t) => t.status === "blocked").length;
    lines.push("# session_metrics.py  (auto-generated by context compressor)");
    lines.push("# Diagnostic snapshot for context compression quality and coverage.");
    lines.push("from __future__ import annotations");
    lines.push("");
    lines.push("class SessionMetrics:");
    lines.push(`    session_id = ${pyStr(state.sessionId || "unknown")}`);
    lines.push(`    total_turns = ${state.totalTurns || 0}`);
    lines.push(`    last_updated_turn = ${state.lastUpdatedTurn || 0}`);
    lines.push(`    raw_chars_ingested = ${rawChars}`);
    lines.push(`    compressed_chars = ${compressedChars}`);
    lines.push(`    compression_ratio = ${compressionRatio}`);
    lines.push(`    decisions_total = ${state.decisions.length}`);
    lines.push(`    decisions_accepted = ${acceptedDecisions}`);
    lines.push(`    decisions_rejected = ${rejectedDecisions}`);
    lines.push(`    decisions_proposed = ${proposedDecisions}`);
    lines.push(`    constraints_active = ${activeConstraints}`);
    lines.push(`    tasks_total = ${state.tasks.length}`);
    lines.push(`    tasks_completed = ${completedTasks}`);
    lines.push(`    tasks_blocked = ${blockedTasks}`);
    lines.push(`    facts_total = ${state.facts?.length || 0}`);
    lines.push(`    code_anchors_total = ${state.codeAnchors?.length || 0}`);
    lines.push(`    error_memories_total = ${state.errorMemories?.length || 0}`);
    lines.push("");
    lines.push("def get_metrics() -> SessionMetrics:");
    lines.push("    return SessionMetrics");
    lines.push("");
    return lines.join(`
`);
  }
  async save(state, outputPath) {
    let content = this.serialize(state);
    let compressedChars = content.length;
    for (let iteration = 0;iteration < 3; iteration++) {
      if (state.compressedChars === compressedChars) {
        break;
      }
      state.compressedChars = compressedChars;
      content = this.serialize(state);
      compressedChars = content.length;
    }
    state.compressedChars = compressedChars;
    await atomicWrite(outputPath, content);
  }
  async saveHistory(state, outputPath) {
    await atomicWrite(outputPath, this.serializeHistory(state));
  }
  async saveMetrics(state, outputPath) {
    await atomicWrite(outputPath, this.serializeMetrics(state));
  }
}
function decisionToPythonLine(d, indent = 8) {
  const padding = " ".repeat(indent);
  const varName = toVarName(d.topic);
  const comment = d.alternativesRejected.length > 0 ? `  # rejected: ${d.alternativesRejected.join(", ")}` : "";
  return `${padding}${varName} = ${pyStr(d.choice)}${comment}`;
}
function constraintToPythonLine(c, indent = 8) {
  const padding = " ".repeat(indent);
  const varName = toVarName(`${c.category}_${c.id.slice(-6)}`);
  const severity = c.severity === "hard" ? "# MUST follow" : "# Recommended";
  return `${padding}${varName} = ${pyStr(c.rule)}  ${severity}`;
}
function factToPythonLine(f, indent = 8) {
  const padding = " ".repeat(indent);
  const varName = toVarName(`${f.key}_${f.category}`);
  return `${padding}${varName} = ${pyStr(f.value)}`;
}
function anchorVarName(filePath) {
  const baseName = filePath.split("/").pop() || filePath;
  const stem = baseName.replace(/\.[^.]+$/, "") || baseName;
  let hash = 0;
  for (let i = 0;i < filePath.length; i++) {
    hash = (hash << 5) - hash + filePath.charCodeAt(i);
    hash |= 0;
  }
  return `${toVarName(stem)}_${Math.abs(hash).toString(36).slice(0, 6)}`;
}
function anchorToPythonLine(a, indent = 8) {
  const padding = " ".repeat(indent);
  const varName = anchorVarName(a.filePath);
  const loc = a.lineStart > 0 ? `:${a.lineStart}` : "";
  return `${padding}${varName} = ${pyStr(`${a.filePath}${loc} (${a.action})`)}`;
}
function errorToPythonLine(e, indent = 8) {
  const padding = " ".repeat(indent);
  const varName = toVarName(`failed_${e.approach.slice(0, 20)}`);
  return `${padding}${varName} = ${pyStr(e.approach)}  # reason: ${escape(e.failureReason)}`;
}
function pyStr(value) {
  const escaped = value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `'${escaped}'`;
}
function pyList(items) {
  if (items.length === 0)
    return "[]";
  const quoted = items.map((i) => pyStr(i));
  return `[${quoted.join(", ")}]`;
}
function buildHistoryEntries(state) {
  const entries = [];
  for (const decision of state.decisions) {
    entries.push({
      turn: decision.turn,
      text: `turn ${decision.turn} | decision:${decision.status} | ${decision.topic} -> ${decision.choice}`
    });
  }
  for (const constraint of state.constraints) {
    entries.push({
      turn: constraint.turn,
      text: `turn ${constraint.turn} | constraint:${constraint.severity} | ${constraint.rule}`
    });
  }
  for (const task of state.tasks) {
    entries.push({
      turn: task.turn,
      text: `turn ${task.turn} | task:${task.status} | ${task.description}`
    });
  }
  for (const fact of state.facts || []) {
    entries.push({
      turn: fact.sourceTurn,
      text: `turn ${fact.sourceTurn} | fact:${fact.category} | ${fact.key}=${fact.value}`
    });
  }
  for (const anchor of state.codeAnchors || []) {
    entries.push({
      turn: anchor.turn,
      text: `turn ${anchor.turn} | anchor:${anchor.action} | ${anchor.filePath}`
    });
  }
  for (const error of state.errorMemories || []) {
    entries.push({
      turn: error.turn,
      text: `turn ${error.turn} | error | ${error.approach} -> ${error.failureReason}`
    });
  }
  return entries.sort((a, b) => a.turn - b.turn || a.text.localeCompare(b.text)).map((entry) => escape(entry.text));
}

// src/context/compression/engine.ts
class ContextCompressorEngine {
  state;
  extractor;
  merger;
  serializer;
  outputDir;
  sessionId;
  autoSave;
  saveEveryNTurns;
  debug;
  rawCharsIngested = 0;
  constructor(opts = {}) {
    this.outputDir = opts.outputDir || ".claude/context";
    this.sessionId = opts.sessionId || `session_${Date.now()}`;
    this.autoSave = opts.autoSave !== false;
    this.saveEveryNTurns = opts.saveEveryNTurns || 1;
    this.debug = opts.debug || false;
    this.extractor = new MasterExtractor(opts.skeletonIndex);
    this.merger = new StateMerger;
    this.serializer = new StateSerializer;
    this.state = createEmptySessionState();
    this.state.sessionId = this.sessionId;
    this.syncStateMetrics();
  }
  get outputPythonPath() {
    return path2.join(this.outputDir, "session_state.py");
  }
  get outputJsonPath() {
    return path2.join(this.outputDir, "session_state.json");
  }
  get outputHistoryPath() {
    return path2.join(this.outputDir, "session_history.py");
  }
  get outputMetricsPath() {
    return path2.join(this.outputDir, "session_metrics.py");
  }
  ingest(role, content, turn) {
    try {
      this.rawCharsIngested += content.length;
      const extraction = this.extractor.extract(content, role, turn, this.state);
      this.state = this.merger.merge(this.state, extraction, turn);
      this.state.totalTurns = turn;
      this.state.lastTurnSignature = makeId("turn", `${role}:${content}`, turn);
      this.syncStateMetrics();
      if (this.autoSave && turn % this.saveEveryNTurns === 0) {
        this.saveSync();
      }
      return this.state;
    } catch (e) {
      console.error("[Compressor] ingest failed:", e);
      return this.state;
    }
  }
  ingestBatch(messages) {
    for (const msg of messages) {
      this.ingest(msg.role, msg.content, msg.turn);
    }
    return this.state;
  }
  async save() {
    try {
      await this.ensureOutputDir();
      this.syncStateMetrics();
      await this.serializer.save(this.state, this.outputPythonPath);
      this.syncStateMetrics();
      await this.serializer.saveHistory(this.state, this.outputHistoryPath);
      await this.serializer.saveMetrics(this.state, this.outputMetricsPath);
      await atomicWrite(this.outputJsonPath, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.error("[Compressor] save failed:", e);
    }
  }
  saveSync() {
    try {
      this.syncStateMetrics();
      this.save().catch((e) => console.error("[Compressor] async save failed:", e));
    } catch (e) {
      console.error("[Compressor] saveSync failed:", e);
    }
  }
  getStats() {
    return {
      totalTurns: this.state.totalTurns || 0,
      rawCharsIngested: this.rawCharsIngested,
      compressedChars: this.state.compressedChars || 0,
      decisions: this.state.decisions.length,
      constraints: this.state.constraints.length,
      tasks: this.state.tasks.length,
      facts: this.state.facts?.length || 0,
      anchors: this.state.codeAnchors?.length || 0,
      errors: this.state.errorMemories?.length || 0
    };
  }
  reset() {
    this.state = createEmptySessionState();
    this.state.sessionId = this.sessionId;
    this.rawCharsIngested = 0;
    this.syncStateMetrics();
  }
  getState() {
    return { ...this.state };
  }
  async loadExistingState() {
    try {
      const jsonContent = await fs2.readFile(this.outputJsonPath, "utf-8");
      const parsed = JSON.parse(jsonContent);
      this.state = parsed;
      this.sessionId = parsed.sessionId || this.sessionId;
      this.rawCharsIngested = parsed.rawCharsIngested || 0;
      this.syncStateMetrics();
      return parsed;
    } catch {
      try {
        const pythonContent = await fs2.readFile(this.outputPythonPath, "utf-8");
        const parsed = this._parsePythonState(pythonContent);
        if (parsed) {
          this.state = parsed;
          this.syncStateMetrics();
          return parsed;
        }
      } catch {}
    }
    return null;
  }
  async ensureOutputDir() {
    try {
      await fs2.mkdir(this.outputDir, { recursive: true });
    } catch {}
  }
  syncStateMetrics() {
    this.state.sessionId = this.state.sessionId || this.sessionId;
    this.state.rawCharsIngested = this.rawCharsIngested;
    this.state.totalTurns = this.state.totalTurns || this.state.lastUpdatedTurn;
  }
  _parsePythonState(content) {
    const goalMatch = content.match(/primary_goal\s*=\s*'(.+?)'/);
    if (goalMatch) {
      const state = createEmptySessionState();
      state.primaryGoal = goalMatch[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
      return state;
    }
    return null;
  }
}

// src/context/compression/paths.ts
import { existsSync } from "fs";

// src/bootstrap/state.ts
import { realpathSync } from "fs";
import { cwd } from "process";

// src/utils/crypto.ts
import { randomUUID } from "crypto";

// src/utils/settings/settingsCache.ts
var perSourceCache = new Map;
var parseFileCache = new Map;

// src/utils/signal.ts
function createSignal() {
  const listeners = new Set;
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(...args) {
      for (const listener of listeners)
        listener(...args);
    },
    clear() {
      listeners.clear();
    }
  };
}

// src/bootstrap/state.ts
function getInitialState() {
  let resolvedCwd = "";
  if (typeof process !== "undefined" && typeof process.cwd === "function" && typeof realpathSync === "function") {
    const rawCwd = cwd();
    try {
      resolvedCwd = realpathSync(rawCwd).normalize("NFC");
    } catch {
      resolvedCwd = rawCwd.normalize("NFC");
    }
  }
  const state = {
    originalCwd: resolvedCwd,
    projectRoot: resolvedCwd,
    totalCostUSD: 0,
    totalAPIDuration: 0,
    totalAPIDurationWithoutRetries: 0,
    totalToolDuration: 0,
    turnHookDurationMs: 0,
    turnToolDurationMs: 0,
    turnClassifierDurationMs: 0,
    turnToolCount: 0,
    turnHookCount: 0,
    turnClassifierCount: 0,
    startTime: Date.now(),
    lastInteractionTime: Date.now(),
    totalLinesAdded: 0,
    totalLinesRemoved: 0,
    hasUnknownModelCost: false,
    cwd: resolvedCwd,
    modelUsage: {},
    mainLoopModelOverride: undefined,
    initialMainLoopModel: null,
    modelStrings: null,
    isInteractive: false,
    kairosActive: false,
    strictToolResultPairing: false,
    sdkAgentProgressSummariesEnabled: false,
    userMsgOptIn: false,
    conciseModeOptIn: false,
    quietModeOptIn: false,
    judgeModeOptIn: false,
    autoAllowOptIn: false,
    autoContinueOptIn: false,
    clientType: "cli",
    sessionSource: undefined,
    questionPreviewFormat: undefined,
    sessionIngressToken: undefined,
    oauthTokenFromFd: undefined,
    apiKeyFromFd: undefined,
    flagSettingsPath: undefined,
    flagSettingsInline: null,
    allowedSettingSources: [
      "userSettings",
      "projectSettings",
      "localSettings",
      "flagSettings",
      "policySettings"
    ],
    meter: null,
    sessionCounter: null,
    locCounter: null,
    prCounter: null,
    commitCounter: null,
    costCounter: null,
    tokenCounter: null,
    codeEditToolDecisionCounter: null,
    activeTimeCounter: null,
    statsStore: null,
    sessionId: randomUUID(),
    parentSessionId: undefined,
    loggerProvider: null,
    eventLogger: null,
    meterProvider: null,
    tracerProvider: null,
    agentColorMap: new Map,
    agentColorIndex: 0,
    lastAPIRequest: null,
    lastAPIRequestMessages: null,
    lastClassifierRequests: null,
    cachedClaudeMdContent: null,
    inMemoryErrorLog: [],
    inlinePlugins: [],
    chromeFlagOverride: undefined,
    useCoworkPlugins: false,
    sessionBypassPermissionsMode: false,
    scheduledTasksEnabled: false,
    sessionCronTasks: [],
    sessionCreatedTeams: new Set,
    sessionTrustAccepted: false,
    sessionPersistenceDisabled: false,
    hasExitedPlanMode: false,
    needsPlanModeExitAttachment: false,
    needsAutoModeExitAttachment: false,
    lspRecommendationShownThisSession: false,
    initJsonSchema: null,
    registeredHooks: null,
    planSlugCache: new Map,
    teleportedSessionInfo: null,
    invokedSkills: new Map,
    slowOperations: [],
    sdkBetas: undefined,
    mainThreadAgentType: undefined,
    isRemoteMode: false,
    ...process.env.USER_TYPE === "ant" ? {
      replBridgeActive: false
    } : {},
    directConnectServerUrl: undefined,
    systemPromptSectionCache: new Map,
    lastEmittedDate: null,
    additionalDirectoriesForClaudeMd: [],
    allowedChannels: [],
    hasDevChannels: false,
    sessionProjectDir: null,
    promptCache1hAllowlist: null,
    promptCache1hEligible: null,
    afkModeHeaderLatched: null,
    fastModeHeaderLatched: null,
    cacheEditingHeaderLatched: null,
    thinkingClearLatched: null,
    promptId: null,
    lastMainRequestId: undefined,
    lastApiCompletionTimestamp: null,
    pendingPostCompaction: false
  };
  return state;
}
var STATE = getInitialState();
function getSessionId() {
  return STATE.sessionId;
}
var sessionSwitched = createSignal();
var onSessionSwitch = sessionSwitched.subscribe;
function getOriginalCwd() {
  return STATE.originalCwd;
}
function getProjectRoot() {
  return STATE.projectRoot;
}
function getCwdState() {
  return STATE.cwd;
}

// src/utils/cwd.ts
import { AsyncLocalStorage } from "async_hooks";
var cwdOverrideStorage = new AsyncLocalStorage;
function pwd() {
  return cwdOverrideStorage.getStore() ?? getCwdState();
}
function getCwd() {
  try {
    return pwd();
  } catch {
    return getOriginalCwd();
  }
}

// src/context/compression/paths.ts
import { basename, dirname, join } from "path";
var CONTEXT_DIRNAME = ".claude/context";
function looksLikeSourceCheckoutRoot(dir) {
  return existsSync(join(dir, "package.json")) && existsSync(join(dir, "src")) && existsSync(join(dir, "todo"));
}
function normalizeCompressionProjectRoot(dir) {
  if (basename(dir) !== "dist") {
    return dir;
  }
  const parent = dirname(dir);
  if (parent !== dir && looksLikeSourceCheckoutRoot(parent)) {
    return parent;
  }
  return dir;
}
function getCompressionProjectRoot() {
  try {
    return normalizeCompressionProjectRoot(getProjectRoot());
  } catch {
    try {
      return normalizeCompressionProjectRoot(getOriginalCwd());
    } catch {
      return normalizeCompressionProjectRoot(getCwd());
    }
  }
}
function getContextOutputDir(projectRoot = getCompressionProjectRoot()) {
  return join(projectRoot, CONTEXT_DIRNAME);
}

// src/commands/compress-status/compress-status.ts
var call = async () => {
  const engine = new ContextCompressorEngine({
    autoSave: false,
    outputDir: getContextOutputDir()
  });
  const state = await engine.loadExistingState();
  if (!state) {
    return {
      type: "text",
      value: [
        "No compressed context found.",
        "Run `/compress` first.",
        "",
        `Expected files:`,
        `  ${engine.outputPythonPath}`,
        `  ${engine.outputHistoryPath}`,
        `  ${engine.outputMetricsPath}`,
        `  ${engine.outputJsonPath}`
      ].join(`
`)
    };
  }
  const stats = engine.getStats();
  const compressionRatio = stats.compressedChars > 0 ? (stats.rawCharsIngested / stats.compressedChars).toFixed(2) : "0.00";
  return {
    type: "text",
    value: [
      "Context compression status.",
      "",
      `Session ID: ${state.sessionId ?? "unknown"}`,
      `Primary goal: ${state.primaryGoal || "Not yet defined"}`,
      `Last updated turn: ${state.lastUpdatedTurn}`,
      `Total turns: ${stats.totalTurns}`,
      `Raw chars ingested: ${stats.rawCharsIngested}`,
      `Compressed chars: ${stats.compressedChars}`,
      `Compression ratio: ${compressionRatio}x`,
      "",
      "Slot counts:",
      `  Decisions: ${stats.decisions}`,
      `  Constraints: ${stats.constraints}`,
      `  Tasks: ${stats.tasks}`,
      `  Facts: ${stats.facts}`,
      `  Anchors: ${stats.anchors}`,
      `  Errors: ${stats.errors}`,
      "",
      "Files:",
      `  ${engine.outputPythonPath}`,
      `  ${engine.outputHistoryPath}`,
      `  ${engine.outputMetricsPath}`,
      `  ${engine.outputJsonPath}`
    ].join(`
`)
  };
};

// src/context/compression/summary.ts
import { promises as fs3 } from "fs";
import { join as join2 } from "path";
var SUMMARY_DIRNAME = "tmp";
function formatSummaryDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function formatTimestamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
function toJsonFence(value) {
  return `\`\`\`json
${JSON.stringify(value, null, 2)}
\`\`\``;
}
function renderContent(content) {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content) || content.length === 0) {
    return "";
  }
  return content.map((block) => {
    if (block?.type === "text" && typeof block.text === "string") {
      return block.text.trim();
    }
    if (block?.type === "tool_use") {
      return [
        `Tool use: ${block.name || "unknown"}`,
        toJsonFence(block.input ?? {})
      ].join(`
`);
    }
    if (block?.type === "tool_result") {
      const parts = [
        `Tool result${block.is_error ? " (error)" : ""}:`
      ];
      const inner = renderContent(block.content);
      if (inner) {
        parts.push(inner);
      } else {
        parts.push(toJsonFence(block));
      }
      return parts.join(`
`);
    }
    if (typeof block?.text === "string") {
      return block.text.trim();
    }
    return toJsonFence(block);
  }).filter(Boolean).join(`

`);
}
function getMessageRole(message) {
  return message.message?.role || message.role || message.type || "unknown";
}
function buildSummaryMarkdown(messages, date, projectRoot) {
  const header = [
    "# Conversation Summary",
    "",
    `Generated at: ${formatTimestamp(date)}`,
    `Project root: ${projectRoot}`,
    `Session ID: ${getSessionId()}`,
    `Message count: ${messages.length}`,
    ""
  ];
  const body = messages.map((message, index) => {
    const role = getMessageRole(message);
    const content = renderContent(message.message?.content ?? message.content);
    const metaLine = message.isMeta ? `_Meta message: true_

` : "";
    return [
      `## ${index + 1}. ${role}`,
      "",
      metaLine + (content || "_No textual content_"),
      ""
    ].join(`
`);
  }).join(`
`);
  return `${header.join(`
`)}${body}`.trimEnd() + `
`;
}
function getConversationSummaryPath(projectRoot = getCompressionProjectRoot(), date = new Date) {
  return join2(projectRoot, SUMMARY_DIRNAME, `summary_${formatSummaryDate(date)}.md`);
}
async function persistConversationSummaryMarkdown(messages, options = {}) {
  if (messages.length === 0) {
    return null;
  }
  const projectRoot = options.projectRoot || getCompressionProjectRoot();
  const date = options.date || new Date;
  const outputPath = getConversationSummaryPath(projectRoot, date);
  const content = buildSummaryMarkdown(messages, date, projectRoot);
  await fs3.mkdir(join2(projectRoot, SUMMARY_DIRNAME), { recursive: true });
  await atomicWrite(outputPath, content);
  return outputPath;
}

// src/utils/errors.ts
function errorMessage(e) {
  return e instanceof Error ? e.message : String(e);
}

// src/commands/compress/compress.ts
var USAGE = [
  "Usage: /compress",
  "",
  "Compresses the current conversation context into structured session state.",
  "Outputs both a Python file (for AI consumption) and a JSON file (for program recovery).",
  "",
  "Generated files:",
  "  .claude/context/session_state.py  — structured Python state",
  "  .claude/context/session_history.py — compact timeline archive",
  "  .claude/context/session_metrics.py — compression diagnostics",
  "  .claude/context/session_state.json — full session state"
].join(`
`);
function getMessageText(content) {
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed || null;
  }
  if (!Array.isArray(content)) {
    return null;
  }
  const text = content.filter((block) => block?.type === "text" && typeof block.text === "string").map((block) => block.text).join(`
`).trim();
  return text || null;
}
var call2 = async (_args, context) => {
  try {
    const { messages } = context;
    if (!messages || messages.length === 0) {
      return {
        type: "text",
        value: "No messages in conversation to compress."
      };
    }
    await persistConversationSummaryMarkdown(messages);
    const engine = new ContextCompressorEngine({
      outputDir: getContextOutputDir(),
      sessionId: getSessionId()
    });
    for (let i = 0;i < messages.length; i++) {
      const msg = messages[i];
      const role = msg.role === "human" ? "user" : "assistant";
      const content = getMessageText(msg.content);
      if (!content)
        continue;
      engine.ingest(role, content, i + 1);
    }
    await engine.save();
    const stats = engine.getStats();
    const compressionRatio = stats.compressedChars > 0 ? (stats.rawCharsIngested / stats.compressedChars).toFixed(2) : "0.00";
    const output = [
      "Context compression complete.",
      "",
      `Turns processed: ${stats.totalTurns}`,
      `Raw chars ingested: ${stats.rawCharsIngested}`,
      `Compressed chars: ${stats.compressedChars}`,
      `Compression ratio: ${compressionRatio}x`,
      "",
      "Slot counts:",
      `  Decisions: ${stats.decisions}`,
      `  Constraints: ${stats.constraints}`,
      `  Tasks: ${stats.tasks}`,
      `  Facts: ${stats.facts}`,
      `  Anchors: ${stats.anchors}`,
      `  Errors: ${stats.errors}`,
      "",
      "Generated files:",
      `  ${engine.outputPythonPath}`,
      `  ${engine.outputHistoryPath}`,
      `  ${engine.outputMetricsPath}`,
      `  ${engine.outputJsonPath}`
    ].join(`
`);
    return {
      type: "text",
      value: output
    };
  } catch (error) {
    return {
      type: "text",
      value: `Context compression failed: ${errorMessage(error)}`
    };
  }
};

// src/commands/index/cliBundleEntry.ts
var AUTO_MEMORY_DISABLED_MESSAGE = "Pinned facts are unavailable because auto memory is disabled for this session.";
var PINNED_FACTS_FILENAME = "PINNED.md";
var PINNED_FACTS_HEADER = "# Pinned Facts";
var PINNED_FACTS_EMPTY_HINT = "<!-- No pinned facts yet. Use /pin <text> to add one. -->";
var PINNED_FACTS_SKILL_NAME = "pinned-facts";
var MAX_SANITIZED_LENGTH = 200;
function errorMessage2(error) {
  return error instanceof Error ? error.message : String(error);
}
function isEnvTruthy(value) {
  if (!value)
    return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase().trim());
}
function isEnvDefinedFalsy(value) {
  if (!value)
    return false;
  return ["0", "false", "no", "off"].includes(value.toLowerCase().trim());
}
function isAutoMemoryEnabled() {
  const envVal = process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY;
  if (isEnvTruthy(envVal)) {
    return false;
  }
  if (isEnvDefinedFalsy(envVal)) {
    return true;
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)) {
    return false;
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_REMOTE) && !process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR) {
    return false;
  }
  return true;
}
function simpleHash(input) {
  let hash = 5381;
  for (const char of input) {
    hash = (hash << 5) + hash + char.charCodeAt(0) >>> 0;
  }
  return hash.toString(36);
}
function sanitizePath(value) {
  const sanitized = value.replace(/[^a-zA-Z0-9]/g, "-");
  if (sanitized.length <= MAX_SANITIZED_LENGTH) {
    return sanitized;
  }
  return `${sanitized.slice(0, MAX_SANITIZED_LENGTH)}-${simpleHash(value)}`;
}
function getProjectRoot2() {
  try {
    const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    if (gitRoot) {
      return gitRoot.normalize("NFC");
    }
  } catch {}
  return process.cwd().normalize("NFC");
}
function getPinnedFactsPath() {
  const memoryBase = process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR ?? process.env.CLAUDE_CONFIG_DIR ?? join3(homedir(), ".claude");
  return join3(memoryBase, "projects", sanitizePath(getProjectRoot2()), "memory", PINNED_FACTS_FILENAME);
}
function toPosixPath(value) {
  return value.replaceAll("\\", "/");
}
function formatProjectPath(rootDir, targetPath) {
  const relativePath = toPosixPath(relative(rootDir, targetPath));
  if (!relativePath) {
    return ".";
  }
  if (relativePath === ".." || relativePath.startsWith("../") || relativePath.startsWith("/")) {
    return toPosixPath(targetPath);
  }
  return `./${relativePath}`;
}
function getPinnedFactSkillPaths(rootDir = getProjectRoot2()) {
  return {
    claude: join3(rootDir, ".claude", "skills", PINNED_FACTS_SKILL_NAME, "SKILL.md"),
    codex: join3(rootDir, ".codex", "skills", PINNED_FACTS_SKILL_NAME, "SKILL.md")
  };
}
function normalizeLineEndings(content) {
  return content.replace(/\r\n?/g, `
`);
}
function normalizePinnedFact(text) {
  return normalizeLineEndings(text).trim();
}
function normalizePinnedFactForCompare(text) {
  return normalizePinnedFact(text).toLowerCase();
}
function dedupePinnedFacts(facts) {
  const seen = new Set;
  const deduped = [];
  for (const fact of facts) {
    const normalized = normalizePinnedFact(fact);
    if (!normalized)
      continue;
    const compareKey = normalizePinnedFactForCompare(normalized);
    if (seen.has(compareKey))
      continue;
    seen.add(compareKey);
    deduped.push(normalized);
  }
  return deduped;
}
function parsePinnedFactsContent(content) {
  const facts = [];
  for (const line of normalizeLineEndings(content).split(`
`)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ") && !trimmed.startsWith("* ")) {
      continue;
    }
    const fact = normalizePinnedFact(trimmed.slice(2));
    if (fact) {
      facts.push(fact);
    }
  }
  return dedupePinnedFacts(facts);
}
function renderPinnedFactsContent(facts) {
  const deduped = dedupePinnedFacts(facts);
  const lines = [
    PINNED_FACTS_HEADER,
    "",
    "Project-scoped facts explicitly pinned by the user.",
    "Treat these as high-priority stable references for this repository.",
    "Prefer them before re-discovering the same facts. If one appears stale or inaccessible, call that out and ask before replacing it.",
    "Ignore them only if the user explicitly says to ignore pinned facts or removes them with /unpin.",
    "",
    ...deduped.length > 0 ? deduped.map((fact) => `- ${fact}`) : [PINNED_FACTS_EMPTY_HINT]
  ];
  return `${lines.join(`
`)}
`;
}
function renderPinnedFactsSkill(args) {
  const memoryPath = formatProjectPath(args.rootDir, args.pinnedFactsPath);
  const deduped = dedupePinnedFacts(args.facts);
  return [
    "---",
    `name: ${args.name}`,
    `description: ${args.description}`,
    "---",
    "",
    "# Pinned Facts",
    "",
    "## Instructions",
    "- Treat these pinned facts as high-priority stable project references.",
    "- Prefer them before rerunning filesystem scans, registry lookups, or other rediscovery steps.",
    "- If a fact appears stale, inaccessible, or contradictory, say so before replacing it.",
    `- Source of truth: \`${memoryPath}\`. Update with \`/pin\` and \`/unpin\`.`,
    "",
    "## Facts",
    "",
    ...deduped.map((fact) => `- ${fact}`),
    ""
  ].join(`
`);
}
async function readPinnedFacts() {
  if (!isAutoMemoryEnabled()) {
    return [];
  }
  try {
    const content = await readFile(getPinnedFactsPath(), "utf8");
    return parsePinnedFactsContent(content);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error.code === "ENOENT" || error.code === "EISDIR")) {
      return [];
    }
    throw error;
  }
}
async function writePinnedFacts(facts) {
  const path3 = getPinnedFactsPath();
  await mkdir(resolve(path3, ".."), { recursive: true });
  await writeFile(path3, renderPinnedFactsContent(facts), "utf8");
}
async function syncPinnedFactSkills(facts, path3) {
  const rootDir = getProjectRoot2();
  const skillPaths = getPinnedFactSkillPaths(rootDir);
  if (facts.length === 0) {
    await rm(join3(rootDir, ".claude", "skills", PINNED_FACTS_SKILL_NAME), {
      recursive: true,
      force: true
    });
    await rm(join3(rootDir, ".codex", "skills", PINNED_FACTS_SKILL_NAME), {
      recursive: true,
      force: true
    });
    return skillPaths;
  }
  await mkdir(join3(rootDir, ".claude", "skills", PINNED_FACTS_SKILL_NAME), {
    recursive: true
  });
  await mkdir(join3(rootDir, ".codex", "skills", PINNED_FACTS_SKILL_NAME), {
    recursive: true
  });
  await writeFile(skillPaths.claude, renderPinnedFactsSkill({
    name: PINNED_FACTS_SKILL_NAME,
    description: "Use these project-pinned facts before rediscovering paths, tools, or other stable repository-specific details.",
    facts,
    pinnedFactsPath: path3,
    rootDir
  }), "utf8");
  await writeFile(skillPaths.codex, renderPinnedFactsSkill({
    name: PINNED_FACTS_SKILL_NAME,
    description: "Use these project-pinned facts before rediscovering paths, tools, or other stable repository-specific details.",
    facts,
    pinnedFactsPath: path3,
    rootDir
  }), "utf8");
  return skillPaths;
}
function formatPinnedFactsLocations(args) {
  return [
    `File: ${args.path}`,
    "Project skill files:",
    `- ${args.skillPaths.claude}`,
    `- ${args.skillPaths.codex}`
  ];
}
function formatPinnedFactsList(facts, path3, skillPaths) {
  if (facts.length === 0) {
    return [
      "No pinned facts saved for this project.",
      'Use "/pin <text>" to add one.',
      ...formatPinnedFactsLocations({
        path: path3,
        skillPaths
      })
    ].join(`
`);
  }
  return [
    `Pinned facts for this project (${facts.length}):`,
    ...facts.map((fact, index) => `${index + 1}. ${fact}`),
    "",
    'Use "/pin <text>" to add another or "/unpin <text>" to remove one.',
    ...formatPinnedFactsLocations({
      path: path3,
      skillPaths
    })
  ].join(`
`);
}
function countPinnedFactMatches(facts, rawQuery) {
  const normalizedQuery = normalizePinnedFact(rawQuery);
  const compareKey = normalizePinnedFactForCompare(normalizedQuery);
  const exactMatches = facts.filter((fact) => normalizePinnedFactForCompare(fact) === compareKey);
  return {
    matches: exactMatches.length > 0 ? exactMatches : facts.filter((fact) => normalizePinnedFactForCompare(fact).includes(compareKey)),
    normalizedQuery
  };
}
async function pinCall(args) {
  if (!isAutoMemoryEnabled()) {
    return {
      type: "text",
      value: AUTO_MEMORY_DISABLED_MESSAGE
    };
  }
  const rawFact = args.trim();
  const path3 = getPinnedFactsPath();
  if (!rawFact) {
    const facts = await readPinnedFacts();
    const skillPaths = await syncPinnedFactSkills(facts, path3);
    return {
      type: "text",
      value: formatPinnedFactsList(facts, path3, skillPaths)
    };
  }
  const fact = normalizePinnedFact(rawFact);
  if (!fact) {
    return {
      type: "text",
      value: "Pinned fact cannot be empty."
    };
  }
  try {
    const facts = await readPinnedFacts();
    const exists = facts.find((current) => normalizePinnedFactForCompare(current) === normalizePinnedFactForCompare(fact));
    if (exists) {
      const skillPaths2 = await syncPinnedFactSkills(facts, path3);
      return {
        type: "text",
        value: [
          "Pinned fact already exists for this project:",
          `- ${exists}`,
          "",
          ...formatPinnedFactsLocations({
            path: path3,
            skillPaths: skillPaths2
          })
        ].join(`
`)
      };
    }
    const nextFacts = [...facts, fact];
    await writePinnedFacts(nextFacts);
    const skillPaths = await syncPinnedFactSkills(nextFacts, path3);
    return {
      type: "text",
      value: [
        "Pinned fact saved for this project:",
        `- ${fact}`,
        "",
        ...formatPinnedFactsLocations({
          path: path3,
          skillPaths
        })
      ].join(`
`)
    };
  } catch (error) {
    return {
      type: "text",
      value: `Error updating pinned facts: ${errorMessage2(error)}`
    };
  }
}
async function unpinCall(args) {
  if (!isAutoMemoryEnabled()) {
    return {
      type: "text",
      value: AUTO_MEMORY_DISABLED_MESSAGE
    };
  }
  const query = args.trim();
  if (!query) {
    return {
      type: "text",
      value: "Usage: /unpin <text>"
    };
  }
  try {
    const facts = await readPinnedFacts();
    const path3 = getPinnedFactsPath();
    const { matches, normalizedQuery } = countPinnedFactMatches(facts, query);
    if (!normalizedQuery) {
      return {
        type: "text",
        value: "Pinned fact match text cannot be empty."
      };
    }
    if (matches.length === 0) {
      return {
        type: "text",
        value: `No pinned fact matched "${query}".
File: ${path3}`
      };
    }
    const removed = matches[0];
    let removedOnce = false;
    const remainingFacts = facts.filter((fact) => {
      if (removedOnce || fact !== removed) {
        return true;
      }
      removedOnce = true;
      return false;
    });
    await writePinnedFacts(remainingFacts);
    const skillPaths = await syncPinnedFactSkills(remainingFacts, path3);
    return {
      type: "text",
      value: [
        "Removed pinned fact:",
        `- ${removed}`,
        ...matches.length > 1 ? [
          "",
          `${matches.length} pinned facts matched "${query}"; removed the first exact or substring match.`
        ] : [],
        "",
        `Remaining pinned facts: ${remainingFacts.length}`,
        ...remainingFacts.length === 0 ? ["Project pinned-facts skills removed.", ""] : [],
        ...formatPinnedFactsLocations({
          path: path3,
          skillPaths
        })
      ].join(`
`)
    };
  } catch (error) {
    return {
      type: "text",
      value: `Error updating pinned facts: ${errorMessage2(error)}`
    };
  }
}
var pinBuiltinCommand = {
  type: "local",
  name: "pin",
  description: "Add or inspect project-scoped pinned facts",
  argumentHint: "[text]",
  supportsNonInteractive: true,
  disableModelInvocation: true,
  load: async () => ({
    call: pinCall
  })
};
var unpinBuiltinCommand = {
  type: "local",
  name: "unpin",
  aliases: ["upin"],
  description: "Remove a project-scoped pinned fact",
  argumentHint: "<text>",
  supportsNonInteractive: true,
  disableModelInvocation: true,
  load: async () => ({
    call: unpinCall
  })
};
var compressBuiltinCommand = {
  type: "local",
  name: "compress",
  description: "Compress conversation context into structured session state (.py + .json)",
  argumentHint: "",
  supportsNonInteractive: true,
  disableModelInvocation: true,
  load: async () => ({
    call: call2
  })
};
var compressStatusBuiltinCommand = {
  type: "local",
  name: "compress-status",
  description: "Show saved context compression stats from .claude/context/session_state.{py,json} and related history/metrics files",
  argumentHint: "",
  supportsNonInteractive: true,
  disableModelInvocation: true,
  load: async () => ({
    call
  })
};
var cliBundleEntry_default = [
  pinBuiltinCommand,
  unpinBuiltinCommand,
  compressBuiltinCommand,
  compressStatusBuiltinCommand
];
export {
  unpinBuiltinCommand,
  pinBuiltinCommand,
  cliBundleEntry_default as default,
  compressStatusBuiltinCommand,
  compressBuiltinCommand
};
