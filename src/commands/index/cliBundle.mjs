// src/commands/index/cliBundleEntry.ts
import { execFileSync } from "child_process";
import { mkdir as mkdir6, readFile as readFile4, rm as rm3, stat as stat5, writeFile as writeFile5 } from "fs/promises";
import { homedir } from "os";
import { join as join8, relative as relative3, resolve as resolve3 } from "path";

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

// src/indexing/build.ts
import { mkdir as mkdir5, readFile as readFile3, stat as stat4 } from "fs/promises";
import { join as join7 } from "path";

// src/indexing/config.ts
import { availableParallelism, cpus } from "os";
import { basename as basename2, resolve } from "path";
var DEFAULT_MAX_FILE_BYTES = 512 * 1024;
var DEFAULT_PARSE_WORKERS = resolveDefaultParseWorkers();
var GENERATED_INDEX_DIR_PREFIXES = [".code_index_", ".index_"];
var LANGUAGE_BY_EXTENSION = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rs": "generic",
  ".go": "generic",
  ".java": "generic",
  ".kt": "generic",
  ".kts": "generic",
  ".swift": "generic",
  ".rb": "generic",
  ".php": "generic",
  ".c": "generic",
  ".h": "generic",
  ".cc": "generic",
  ".hh": "generic",
  ".cpp": "generic",
  ".cppm": "generic",
  ".hpp": "generic",
  ".cxx": "generic",
  ".hxx": "generic",
  ".c++": "generic",
  ".h++": "generic",
  ".ixx": "generic",
  ".mpp": "generic",
  ".ipp": "generic",
  ".inl": "generic",
  ".tpp": "generic",
  ".cs": "generic",
  ".lua": "generic",
  ".sh": "generic",
  ".bash": "generic",
  ".zsh": "generic"
};
var DEFAULT_IGNORED_DIR_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".idea",
  ".vscode",
  ".vs",
  ".cache",
  ".code_index",
  ".history",
  ".summarizer",
  ".usernotice",
  ".usernotic",
  ".venv",
  ".tox",
  "__pycache__",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage",
  "out",
  "target",
  "binaries",
  "intermediate",
  "saved",
  "deriveddatacache",
  "thirdparty",
  "third_party",
  "third-party",
  "cmakefiles",
  "cmake-build-debug",
  "cmake-build-release",
  "tmp",
  ".tmp"
]);
function resolveDefaultParseWorkers() {
  const cpuCount = typeof availableParallelism === "function" ? availableParallelism() : cpus().length;
  if (cpuCount <= 1) {
    return 1;
  }
  return Math.max(1, Math.min(8, cpuCount - 1));
}
function normalizeIgnoredDirName(name) {
  return name.trim().toLowerCase();
}
function isGeneratedIndexDirName(name) {
  const normalized = normalizeIgnoredDirName(name);
  return normalized === ".code_index" || GENERATED_INDEX_DIR_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}
function normalizeParseWorkers(value) {
  if (value === undefined) {
    return DEFAULT_PARSE_WORKERS;
  }
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return Math.max(1, Math.trunc(value));
}
function resolveCodeIndexConfig(options = {}) {
  const cwd2 = process.cwd();
  const rootDir = resolve(cwd2, options.rootDir ?? ".");
  const outputDir = options.outputDir ? resolve(cwd2, options.outputDir) : resolve(rootDir, ".code_index");
  return {
    rootDir,
    outputDir,
    outputDirName: basename2(outputDir),
    maxFiles: options.maxFiles,
    maxFileBytes: options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
    onProgress: options.onProgress,
    parseWorkers: normalizeParseWorkers(options.workers),
    ignoredDirNames: new Set([...DEFAULT_IGNORED_DIR_NAMES, ...options.ignoredDirNames ?? []].map(normalizeIgnoredDirName))
  };
}
function getCodeLanguageForExtension(extension) {
  return LANGUAGE_BY_EXTENSION[extension.toLowerCase()] ?? null;
}

// src/indexing/discovery.ts
import { readdir } from "fs/promises";
import { extname, relative, sep } from "path";

// src/indexing/runtime.ts
var YIELD_INTERVAL = 128;
var YIELD_MS = 8;
function createYieldState() {
  return {
    chunkStart: performance.now(),
    iterations: 0
  };
}
async function maybeYieldToEventLoop(state) {
  state.iterations++;
  if ((state.iterations & YIELD_INTERVAL - 1) !== YIELD_INTERVAL - 1) {
    return;
  }
  if (performance.now() - state.chunkStart <= YIELD_MS) {
    return;
  }
  await new Promise((resolve2) => setImmediate(resolve2));
  state.chunkStart = performance.now();
}

// src/indexing/discovery.ts
var DISCOVERY_PROGRESS_INTERVAL = 256;
function shouldSkipDirectory(absolutePath, dirName, config) {
  if (isGeneratedIndexDirName(dirName)) {
    return true;
  }
  if (config.ignoredDirNames.has(dirName.toLowerCase())) {
    return true;
  }
  if (absolutePath === config.outputDir) {
    return true;
  }
  return absolutePath.startsWith(config.outputDir + sep);
}
async function discoverSourceFiles(config) {
  const discovered = [];
  const yieldState = createYieldState();
  let fileLimitReached = false;
  let lastReportedCount = 0;
  async function reportProgress(force = false) {
    if (!config.onProgress) {
      return;
    }
    if (!force && discovered.length > 0 && discovered.length - lastReportedCount < DISCOVERY_PROGRESS_INTERVAL) {
      return;
    }
    lastReportedCount = discovered.length;
    await config.onProgress({
      phase: "discover",
      message: `Discovered ${discovered.length} source files`,
      completed: discovered.length
    });
  }
  async function walk(dirPath) {
    const entries = await readdir(dirPath, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      await maybeYieldToEventLoop(yieldState);
      const absolutePath = `${dirPath}${sep}${entry.name}`;
      if (entry.isDirectory()) {
        if (shouldSkipDirectory(absolutePath, entry.name, config)) {
          continue;
        }
        if (await walk(absolutePath)) {
          return true;
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const language = getCodeLanguageForExtension(extname(entry.name));
      if (!language) {
        continue;
      }
      discovered.push({
        absolutePath,
        relativePath: relative(config.rootDir, absolutePath).split(sep).join("/"),
        language
      });
      await reportProgress();
      if (config.maxFiles !== undefined && discovered.length >= config.maxFiles) {
        fileLimitReached = true;
        return true;
      }
    }
    return false;
  }
  await walk(config.rootDir);
  await reportProgress(true);
  discovered.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return {
    fileLimitReached,
    files: discovered
  };
}

// src/indexing/emitter.ts
import { mkdir, rm, stat, writeFile } from "fs/promises";
import { dirname as dirname2, join as join3, parse } from "path";

// src/indexing/parserUtils.ts
var PYTHON_KEYWORDS = new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
  "match",
  "case"
]);
var CALL_KEYWORDS = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "function",
  "class",
  "typeof",
  "delete",
  "return",
  "throw",
  "new",
  "await",
  "import",
  "super"
]);
function toPosixPath(value) {
  return value.replaceAll("\\", "/");
}
function relativePathToModuleId(relativePath) {
  return toPosixPath(relativePath);
}
function dedupeStrings(values) {
  const seen = new Set;
  const result = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}
function computeLineStarts(text) {
  const lineStarts = [0];
  for (let index = 0;index < text.length; index++) {
    if (text.charCodeAt(index) === 10) {
      lineStarts.push(index + 1);
    }
  }
  return lineStarts;
}
function offsetToLine(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = low + high >> 1;
    const value = lineStarts[mid] ?? 0;
    if (value <= offset) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return high + 1;
}
function lineRangeFromOffsets(lineStarts, startOffset, endOffsetExclusive) {
  const endOffset = Math.max(startOffset, endOffsetExclusive - 1);
  return {
    start: offsetToLine(lineStarts, startOffset),
    end: offsetToLine(lineStarts, endOffset)
  };
}
function isRegexLiteralStart(input, index) {
  if (input[index] !== "/" || input[index + 1] === "/" || input[index + 1] === "*") {
    return false;
  }
  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(input[cursor] ?? "")) {
    cursor--;
  }
  if (cursor < 0) {
    return true;
  }
  const previousChar = input[cursor] ?? "";
  if ("([{=,:;!?&|+-*%^~<>".includes(previousChar)) {
    return true;
  }
  let wordEnd = cursor;
  while (cursor >= 0 && /[A-Za-z_$]/.test(input[cursor] ?? "")) {
    cursor--;
  }
  const previousWord = input.slice(cursor + 1, wordEnd + 1);
  return [
    "case",
    "delete",
    "in",
    "instanceof",
    "new",
    "of",
    "return",
    "throw",
    "typeof",
    "void",
    "yield"
  ].includes(previousWord);
}
function pushSameLengthWhitespace(out, input, index, count) {
  for (let offset = 0;offset < count; offset++) {
    const char = input[index + offset] ?? "";
    out.push(char === `
` ? `
` : " ");
  }
}
function sanitizeForStructure(input) {
  const out = [];
  const stack = [{ mode: "normal" }];
  let index = 0;
  while (index < input.length) {
    const current = stack[stack.length - 1] ?? { mode: "normal" };
    const char = input[index] ?? "";
    const next = input[index + 1] ?? "";
    switch (current.mode) {
      case "normal":
      case "template_expr":
        if (char === "/" && next === "/") {
          stack.push({ mode: "line_comment" });
          out.push(" ", " ");
          index += 2;
          continue;
        }
        if (char === "/" && next === "*") {
          stack.push({ mode: "block_comment" });
          out.push(" ", " ");
          index += 2;
          continue;
        }
        if (char === "'" && current.mode !== "regex") {
          stack.push({ mode: "single_quote" });
          out.push("'");
          index++;
          continue;
        }
        if (char === '"') {
          stack.push({ mode: "double_quote" });
          out.push('"');
          index++;
          continue;
        }
        if (char === "`") {
          stack.push({ mode: "template" });
          out.push("`");
          index++;
          continue;
        }
        if (char === "/" && isRegexLiteralStart(input, index)) {
          stack.push({ mode: "regex", inCharacterClass: false });
          out.push("/");
          index++;
          continue;
        }
        if (current.mode === "template_expr") {
          if (char === "{") {
            current.depth++;
          } else if (char === "}") {
            current.depth--;
            if (current.depth === 0) {
              stack.pop();
            }
          }
        }
        out.push(char);
        index++;
        continue;
      case "line_comment":
        if (char === `
`) {
          stack.pop();
          out.push(`
`);
        } else {
          out.push(" ");
        }
        index++;
        continue;
      case "block_comment":
        if (char === "*" && next === "/") {
          stack.pop();
          out.push(" ", " ");
          index += 2;
          continue;
        }
        out.push(char === `
` ? `
` : " ");
        index++;
        continue;
      case "single_quote":
      case "double_quote":
        if (char === "\\") {
          pushSameLengthWhitespace(out, input, index, Math.min(2, input.length - index));
          index += Math.min(2, input.length - index);
          continue;
        }
        if (current.mode === "single_quote" && char === "'" || current.mode === "double_quote" && char === '"') {
          stack.pop();
          out.push(char);
        } else {
          out.push(char === `
` ? `
` : " ");
        }
        index++;
        continue;
      case "template":
        if (char === "\\") {
          pushSameLengthWhitespace(out, input, index, Math.min(2, input.length - index));
          index += Math.min(2, input.length - index);
          continue;
        }
        if (char === "$" && next === "{") {
          stack.push({ mode: "template_expr", depth: 1 });
          out.push("$", "{");
          index += 2;
          continue;
        }
        if (char === "`") {
          stack.pop();
          out.push("`");
        } else {
          out.push(char === `
` ? `
` : " ");
        }
        index++;
        continue;
      case "regex":
        if (char === "\\") {
          pushSameLengthWhitespace(out, input, index, Math.min(2, input.length - index));
          index += Math.min(2, input.length - index);
          continue;
        }
        if (char === "[") {
          current.inCharacterClass = true;
          out.push("[");
          index++;
          continue;
        }
        if (char === "]" && current.inCharacterClass) {
          current.inCharacterClass = false;
          out.push("]");
          index++;
          continue;
        }
        if (char === "/" && !current.inCharacterClass) {
          stack.pop();
          out.push("/");
          index++;
          while (index < input.length && /[A-Za-z]/.test(input[index] ?? "")) {
            out.push(" ");
            index++;
          }
          continue;
        }
        out.push(char === `
` ? `
` : " ");
        index++;
        continue;
    }
  }
  return out.join("");
}
function computeBraceDepths(text) {
  const depths = new Array(text.length + 1);
  let depth = 0;
  for (let index = 0;index < text.length; index++) {
    depths[index] = depth;
    const char = text[index] ?? "";
    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth = Math.max(0, depth - 1);
    }
  }
  depths[text.length] = depth;
  return depths;
}
function findMatchingChar(text, openIndex, openChar, closeChar) {
  let depth = 0;
  for (let index = openIndex;index < text.length; index++) {
    const char = text[index] ?? "";
    if (char === openChar) {
      depth++;
      continue;
    }
    if (char === closeChar) {
      depth--;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}
function skipWhitespace(text, index) {
  let cursor = index;
  while (cursor < text.length && /\s/.test(text[cursor] ?? "")) {
    cursor++;
  }
  return cursor;
}
function isPotentialAngleBracket(text, index) {
  const previous = text[index - 1] ?? "";
  const next = text[index + 1] ?? "";
  return /[\w)\]]/.test(previous) && /[\w([{]/.test(next);
}
function canCloseAngleBracket(text, index) {
  const previous = text[index - 1] ?? "";
  const next = text[index + 1] ?? "";
  return /[\w)\]]/.test(previous) && /[\w,)\]}|&\s]/.test(next);
}
function splitTopLevel(input, separator = ",") {
  const parts = [];
  let start = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let angleDepth = 0;
  let quote = null;
  let escaping = false;
  for (let index = 0;index < input.length; index++) {
    const char = input[index] ?? "";
    if (quote) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") {
      parenDepth++;
      continue;
    }
    if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }
    if (char === "[") {
      bracketDepth++;
      continue;
    }
    if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (char === "{") {
      braceDepth++;
      continue;
    }
    if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (char === "<" && isPotentialAngleBracket(input, index)) {
      angleDepth++;
      continue;
    }
    if (char === ">" && angleDepth > 0 && canCloseAngleBracket(input, index)) {
      angleDepth--;
      continue;
    }
    if (char === separator && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0 && angleDepth === 0) {
      parts.push(input.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(input.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}
function findTopLevelChar(input, candidates) {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let angleDepth = 0;
  let quote = null;
  let escaping = false;
  for (let index = 0;index < input.length; index++) {
    const char = input[index] ?? "";
    if (quote) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") {
      parenDepth++;
      continue;
    }
    if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }
    if (char === "[") {
      bracketDepth++;
      continue;
    }
    if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (char === "{") {
      braceDepth++;
      continue;
    }
    if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (char === "<" && isPotentialAngleBracket(input, index)) {
      angleDepth++;
      continue;
    }
    if (char === ">" && angleDepth > 0 && canCloseAngleBracket(input, index)) {
      angleDepth--;
      continue;
    }
    if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0 && angleDepth === 0 && candidates.includes(char)) {
      return index;
    }
  }
  return -1;
}
function isPrimitiveTypeName(value) {
  return [
    "Any",
    "None",
    "bool",
    "bytes",
    "dict",
    "float",
    "int",
    "list",
    "object",
    "set",
    "str",
    "tuple"
  ].includes(value);
}
function cleanTypeReference(value) {
  return normalizeWhitespace(value).replace(/^:\s*/, "").replace(/[=;,{]+$/, "").trim();
}
function pythonizeType(rawType) {
  const original = cleanTypeReference(rawType ?? "");
  if (!original) {
    return "Any";
  }
  let value = original;
  value = value.replace(/\breadonly\s+/g, "");
  value = value.replace(/\bundefined\b/g, "None");
  value = value.replace(/\bnull\b/g, "None");
  value = value.replace(/\bvoid\b/g, "None");
  value = value.replace(/\bstring\b/g, "str");
  value = value.replace(/\bboolean\b/g, "bool");
  value = value.replace(/\bnumber\b/g, "float");
  value = value.replace(/\bunknown\b/g, "Any");
  value = value.replace(/\bnever\b/g, "Any");
  value = value.replace(/\bobject\b/g, "Any");
  value = value.replace(/\bPromise<([^>]+)>/g, "$1");
  value = value.replace(/\bReadonlyArray<([^>]+)>/g, "list[$1]");
  value = value.replace(/\bArray<([^>]+)>/g, "list[$1]");
  value = value.replace(/\bSet<([^>]+)>/g, "set[$1]");
  value = value.replace(/\bMap<([^,>]+),\s*([^>]+)>/g, "dict[$1, $2]");
  value = value.replace(/\bRecord<([^,>]+),\s*([^>]+)>/g, "dict[$1, $2]");
  value = value.replace(/([A-Za-z_][A-Za-z0-9_$.]*)\[\]/g, "list[$1]");
  value = value.replace(/[!?]/g, "");
  value = value.replace(/\$/g, "_");
  value = value.replace(/\s*\|\s*/g, " | ");
  if (/[{};&]|=>|\bextends\b|\bimplements\b|\bkeyof\b|\btypeof\b|\binfer\b/.test(value)) {
    return "Any";
  }
  if (value.includes("<") || value.includes(">")) {
    return "Any";
  }
  value = value.replace(/[^A-Za-z0-9_.,[\]()| ]/g, "");
  value = normalizeWhitespace(value);
  if (!value || /^[0-9]/.test(value)) {
    return "Any";
  }
  const segments = value.split(/[|,\[\]() ]+/).map((segment) => segment.trim()).filter(Boolean);
  if (segments.some((segment) => !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(segment) && !["list", "dict", "set", "tuple", "Any", "None"].includes(segment))) {
    return "Any";
  }
  return value;
}
function dependencyLabelForParam(param) {
  const annotation = cleanTypeReference(param.annotation ?? "");
  if (annotation) {
    for (const part of annotation.split(/[|,&]/)) {
      const token = part.trim();
      const outer = token.match(/[A-Za-z_][A-Za-z0-9_.]*/);
      if (outer && !isPrimitiveTypeName(pythonizeType(outer[0]))) {
        return outer[0];
      }
    }
  }
  return param.name;
}
function safePythonIdentifier(value, fallback = "value") {
  const stripped = value.trim().replace(/^[@#]+/, "").replace(/[^A-Za-z0-9_]/g, "_");
  const normalized = stripped || fallback;
  const withPrefix = /^[0-9]/.test(normalized) ? `_${normalized}` : normalized;
  if (PYTHON_KEYWORDS.has(withPrefix)) {
    return `${withPrefix}_`;
  }
  return withPrefix;
}
function parseParametersFromSignature(paramsText) {
  return splitTopLevel(paramsText, ",").map((rawParam, index) => parseSingleParameter(rawParam, index)).filter((param) => param !== null);
}
function parseSingleParameter(rawParam, index) {
  let value = normalizeWhitespace(rawParam);
  if (!value) {
    return null;
  }
  value = value.replace(/^(?:(?:public|private|protected|readonly|override|declare|required|final|static)\s+)+/g, "");
  if (value.startsWith("...")) {
    value = `rest_${value.slice(3).trim()}`;
  }
  const assignmentIndex = findTopLevelChar(value, ["="]);
  const defaultValue = assignmentIndex >= 0 ? normalizeWhitespace(value.slice(assignmentIndex + 1)) : undefined;
  if (assignmentIndex >= 0) {
    value = value.slice(0, assignmentIndex).trim();
  }
  const annotationIndex = findTopLevelChar(value, [":"]);
  const annotation = annotationIndex >= 0 ? cleanTypeReference(value.slice(annotationIndex + 1)) : undefined;
  let namePart = annotationIndex >= 0 ? value.slice(0, annotationIndex).trim() : value;
  namePart = namePart.replace(/[!?]$/, "");
  if (namePart === "this" || namePart === "self" || namePart === "cls") {
    return null;
  }
  let name = namePart;
  if (name.startsWith("{") || name.startsWith("[")) {
    name = `arg${index + 1}`;
  }
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
    name = `arg${index + 1}`;
  }
  return {
    name,
    annotation,
    defaultValue
  };
}
function extractCallTargets(bodyText) {
  const sanitized = sanitizeForStructure(bodyText);
  const calls = [];
  const callRegex = /\b(?:new\s+)?([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\s*\(/g;
  for (const match of sanitized.matchAll(callRegex)) {
    const target = match[1]?.trim();
    if (!target) {
      continue;
    }
    const root = target.split(".")[0] ?? target;
    if (CALL_KEYWORDS.has(root)) {
      continue;
    }
    const matchIndex = match.index ?? 0;
    const previousSlice = sanitized.slice(Math.max(0, matchIndex - 12), matchIndex);
    if (/\b(?:function|def|class|new)\s*$/.test(previousSlice) || /(^|[^\w$.])(?:if|for|while|switch|catch)\s*$/.test(previousSlice)) {
      continue;
    }
    calls.push(target);
  }
  return dedupeStrings(calls);
}
function extractAwaitTargets(bodyText) {
  const sanitized = sanitizeForStructure(bodyText);
  const awaits = [];
  const awaitRegex = /\bawait\s+([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\s*\(/g;
  for (const match of sanitized.matchAll(awaitRegex)) {
    const target = match[1]?.trim();
    if (target) {
      awaits.push(target);
    }
  }
  return dedupeStrings(awaits);
}
function extractRaisedTargets(bodyText) {
  const raises = [];
  const normalized = sanitizeForStructure(bodyText);
  for (const match of normalized.matchAll(/\bthrow\s+new\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
    if (match[1]) {
      raises.push(match[1]);
    }
  }
  for (const match of normalized.matchAll(/\braise\s+([A-Za-z_][A-Za-z0-9_.]*)/g)) {
    if (match[1]) {
      raises.push(match[1]);
    }
  }
  return dedupeStrings(raises);
}

// src/indexing/emitter.ts
var EMIT_PROGRESS_INTERVAL = 128;
var EMIT_PROGRESS_INTERVAL_MS = 250;
function dedupeStrings2(values) {
  const seen = new Set;
  const result = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
function renderParam(param) {
  const name = safePythonIdentifier(param.name, "arg");
  const annotation = pythonizeType(param.annotation);
  return `${name}: ${annotation}`;
}
function normalizeReferenceExpression(raw) {
  const superPlaceholder = "__cc_super__";
  let value = raw.trim();
  if (!value) {
    return null;
  }
  value = value.replace(/\?\./g, ".");
  value = value.replace(/!/g, "");
  value = value.replace(/\bthis\b/g, "self");
  value = value.replace(/\bsuper\(\)\b/g, superPlaceholder);
  value = value.replace(/\bsuper\b/g, superPlaceholder);
  value = value.replace(/\bsuper\(\)\./g, `${superPlaceholder}.`);
  value = value.replace(/\bsuper\./g, `${superPlaceholder}.`);
  value = value.replace(/\bnew\s+/g, "");
  value = value.replace(/\$/g, "_");
  value = value.replace(/#/g, "_");
  const segments = value.split(".").filter(Boolean);
  if (segments.length === 0) {
    return null;
  }
  const normalizedSegments = [];
  for (const segment of segments) {
    if (segment === superPlaceholder) {
      normalizedSegments.push("super()");
      continue;
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(segment)) {
      return null;
    }
    normalizedSegments.push(safePythonIdentifier(segment, "ref"));
  }
  return normalizedSegments.join(".");
}
function renderCallExpression(target) {
  const expr = normalizeReferenceExpression(target);
  if (!expr) {
    return null;
  }
  return `${expr}(...)`;
}
function renderRaiseExpression(target) {
  const expr = normalizeReferenceExpression(target);
  if (!expr) {
    return null;
  }
  return `${expr}(...)`;
}
function renderFunctionBody(fn, options) {
  const bodyIndent = `${options.indent}    `;
  const lines = [];
  if (options.insideClass && ["constructor", "__init__"].includes(fn.name)) {
    for (const param of fn.params) {
      if (["this", "self", "cls"].includes(param.name)) {
        continue;
      }
      const name = safePythonIdentifier(param.name, "arg");
      lines.push(`${bodyIndent}self.${name} = ${name}`);
    }
  }
  const awaitTargets = dedupeStrings2(fn.awaits).map(renderCallExpression).filter((value) => Boolean(value));
  const awaitSet = new Set(awaitTargets);
  const raiseTargets = dedupeStrings2(fn.raises).map(renderRaiseExpression).filter((value) => Boolean(value));
  const raiseSet = new Set(raiseTargets);
  const callTargets = dedupeStrings2(fn.calls).map(renderCallExpression).filter((value) => Boolean(value)).filter((value) => !awaitSet.has(value)).filter((value) => !raiseSet.has(value));
  for (const target of awaitTargets) {
    lines.push(`${bodyIndent}await ${target}`);
  }
  const shouldReturnLastCall = pythonizeType(fn.returns) !== "None" && callTargets.length > 0;
  for (const [index, target] of callTargets.entries()) {
    const isLast = index === callTargets.length - 1;
    if (shouldReturnLastCall && isLast) {
      lines.push(`${bodyIndent}return ${target}`);
    } else {
      lines.push(`${bodyIndent}${target}`);
    }
  }
  for (const target of raiseTargets) {
    lines.push(`${bodyIndent}raise ${target}`);
  }
  if (lines.length === 0) {
    return [`${bodyIndent}...`];
  }
  return lines;
}
function renderFunction(fn, options) {
  const indent = options.indent;
  const lines = [];
  if (fn.originPath) {
    lines.push(`${indent}# @origin ${fn.originPath}:${fn.sourceLines.start}`);
  }
  const functionName = fn.name === "constructor" ? "__init__" : safePythonIdentifier(fn.name, "generated_function");
  const params = fn.params.filter((param) => !["this", "self", "cls"].includes(param.name)).map(renderParam);
  if (options.insideClass) {
    params.unshift("self");
  }
  const returns = functionName === "__init__" ? "None" : pythonizeType(fn.returns);
  const prefix = fn.isAsync ? "async " : "";
  lines.push(`${indent}${prefix}def ${functionName}(${params.join(", ")}) -> ${returns}:`);
  lines.push(...renderFunctionBody(fn, options));
  return lines;
}
function renderClass(cls) {
  const lines = [];
  const className = safePythonIdentifier(cls.name, "GeneratedClass");
  const bases = cls.bases.map(normalizeReferenceExpression).filter((value) => Boolean(value));
  lines.push(bases.length > 0 ? `class ${className}(${bases.join(", ")}):` : `class ${className}:`);
  if (cls.methods.length === 0) {
    lines.push("    ...");
    return lines;
  }
  const renderedMethods = cls.methods.flatMap((method, index) => [
    ...index === 0 ? [] : [""],
    ...renderFunction(method, { indent: "    ", insideClass: true })
  ]);
  lines.push(...renderedMethods);
  return lines;
}
function renderModuleSkeleton(module) {
  const lines = ["from __future__ import annotations"];
  if (module.importStubs.length > 0) {
    lines.push("", ...dedupeStrings2(module.importStubs));
  }
  lines.push("");
  if (module.classes.length === 0 && module.functions.length === 0) {
    lines.push("...");
    return lines.join(`
`) + `
`;
  }
  const body = [];
  for (const cls of module.classes) {
    if (body.length > 0) {
      body.push("");
    }
    body.push(...renderClass(cls));
  }
  for (const fn of module.functions) {
    if (body.length > 0) {
      body.push("");
    }
    body.push(...renderFunction(fn, { indent: "", insideClass: false }));
  }
  return [...lines, ...body].join(`
`) + `
`;
}
function getSkeletonRelativePath(relativePath, usedPaths) {
  const parsed = parse(relativePath);
  let candidate = join3(parsed.dir, `${parsed.name}.py`).replaceAll("\\", "/");
  if (!usedPaths.has(candidate)) {
    usedPaths.add(candidate);
    return candidate;
  }
  const disambiguated = join3(parsed.dir, `${parsed.name}__${parsed.base.replace(/[^A-Za-z0-9]+/g, "_")}.py`).replaceAll("\\", "/");
  usedPaths.add(disambiguated);
  return disambiguated;
}
function buildSkeletonAssignmentMap(modules) {
  const usedPaths = new Set;
  const assignments = new Map;
  const sortedModules = [...modules].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  for (const module of sortedModules) {
    assignments.set(module.relativePath, getSkeletonRelativePath(module.relativePath, usedPaths));
  }
  return assignments;
}
async function pathExists(path3) {
  try {
    await stat(path3);
    return true;
  } catch {
    return false;
  }
}
async function emitSkeletonTree(args) {
  const { modules, outputDir } = args;
  const skeletonRoot = join3(outputDir, "skeleton");
  const yieldState = createYieldState();
  const currentAssignments = buildSkeletonAssignmentMap(modules);
  const previousModules = args.previousModulesByPath ? [...args.previousModulesByPath.values()] : [];
  const previousAssignments = buildSkeletonAssignmentMap(previousModules);
  const total = modules.length;
  let completed = 0;
  let lastReportedCompleted = -1;
  let lastReportedAt = 0;
  const reportProgress = async (force = false) => {
    if (!args.onProgress) {
      return;
    }
    const now = Date.now();
    if (!force && completed !== total && completed - lastReportedCompleted < EMIT_PROGRESS_INTERVAL && now - lastReportedAt < EMIT_PROGRESS_INTERVAL_MS) {
      return;
    }
    lastReportedCompleted = completed;
    lastReportedAt = now;
    await args.onProgress({
      phase: "emit",
      message: `Updating skeleton ${completed}/${total} modules`,
      completed,
      total
    });
  };
  const markProcessed = async () => {
    completed++;
    await reportProgress();
  };
  await mkdir(skeletonRoot, { recursive: true });
  await reportProgress(true);
  const staleTargets = new Set;
  for (const [relativePath, previousTarget] of previousAssignments.entries()) {
    const currentTarget = currentAssignments.get(relativePath);
    if (!currentTarget || currentTarget !== previousTarget) {
      staleTargets.add(previousTarget);
    }
  }
  for (const staleTarget of staleTargets) {
    await maybeYieldToEventLoop(yieldState);
    await rm(join3(skeletonRoot, staleTarget), { force: true });
  }
  for (const module of modules) {
    await maybeYieldToEventLoop(yieldState);
    const relativeTarget = currentAssignments.get(module.relativePath);
    if (!relativeTarget) {
      await markProcessed();
      continue;
    }
    const previousTarget = previousAssignments.get(module.relativePath);
    const shouldWrite = !args.previousModulesByPath?.has(module.relativePath) || args.changedModulePaths?.has(module.relativePath) || previousTarget !== relativeTarget;
    if (!shouldWrite) {
      await markProcessed();
      continue;
    }
    const targetPath = join3(skeletonRoot, relativeTarget);
    await mkdir(dirname2(targetPath), { recursive: true });
    await writeFile(targetPath, renderModuleSkeleton(module), "utf8");
    await markProcessed();
  }
  const overview = `...
`;
  const overviewPath = join3(skeletonRoot, "__root__.py");
  const shouldWriteOverview = !args.previousModulesByPath || args.previousModulesByPath.size === 0 || Boolean(args.changedModulePaths?.size) || staleTargets.size > 0 || !await pathExists(overviewPath);
  if (shouldWriteOverview) {
    await writeFile(overviewPath, overview, "utf8");
  }
  if (lastReportedCompleted !== completed) {
    await reportProgress(true);
  }
}

// src/indexing/incremental.ts
import { mkdir as mkdir2, readFile, rename, stat as stat2, writeFile as writeFile2 } from "fs/promises";
import { dirname as dirname3, join as join4 } from "path";
var MODULE_CACHE_VERSION = 1;
var MODULE_CACHE_FILENAME = "module-cache.v1.json";
function cachePath(outputDir) {
  return join4(outputDir, MODULE_CACHE_FILENAME);
}
async function fingerprintSourceFile(absolutePath) {
  try {
    const fileStat = await stat2(absolutePath);
    return {
      mtimeMs: Math.trunc(fileStat.mtimeMs),
      size: fileStat.size
    };
  } catch {
    return null;
  }
}
function fingerprintsEqual(left, right) {
  return left?.size === right?.size && left?.mtimeMs === right?.mtimeMs;
}
async function loadModuleCache(args) {
  const path3 = cachePath(args.outputDir);
  let raw;
  try {
    raw = await readFile(path3, "utf8");
  } catch {
    return new Map;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Map;
  }
  if (parsed.version !== MODULE_CACHE_VERSION || parsed.engine !== args.engine || parsed.rootDir !== args.rootDir || parsed.maxFileBytes !== args.maxFileBytes) {
    return new Map;
  }
  const records = new Map;
  for (const entry of parsed.entries ?? []) {
    if (!entry?.relativePath || !entry.module || !entry.fingerprint) {
      continue;
    }
    records.set(entry.relativePath, {
      fingerprint: entry.fingerprint,
      module: entry.module
    });
  }
  return records;
}
async function writeModuleCache(args) {
  const path3 = cachePath(args.outputDir);
  const tempPath = `${path3}.tmp`;
  await mkdir2(dirname3(path3), { recursive: true });
  const payload = {
    version: MODULE_CACHE_VERSION,
    engine: args.engine,
    rootDir: args.rootDir,
    maxFileBytes: args.maxFileBytes,
    entries: args.entries
  };
  await writeFile2(tempPath, JSON.stringify(payload), "utf8");
  await rename(tempPath, path3);
}

// src/indexing/ir.ts
var CODE_INDEX_ARTIFACT_VERSION = 1;

// src/indexing/parsers/generic.ts
function extractImports(text) {
  const imports = [];
  for (const match of text.matchAll(/^\s*(?:import|use|require|include|#include|from)\s+([A-Za-z0-9_./:<>"'-]+)/gm)) {
    if (match[1]) {
      imports.push(match[1].replaceAll(/[<>"']/g, ""));
    }
  }
  return dedupeStrings(imports);
}
function buildGenericFunctionIR(args) {
  return {
    kind: "function",
    name: args.name,
    qualifiedName: `${args.moduleId}::${args.name}`,
    params: parseParametersFromSignature(args.paramsText),
    returns: args.returnType,
    decorators: [],
    calls: extractCallTargets(args.sourceText),
    awaits: extractAwaitTargets(args.sourceText),
    raises: extractRaisedTargets(args.sourceText),
    isAsync: /\basync\b/.test(args.sourceText),
    isPublic: !args.name.startsWith("_"),
    exported: !args.name.startsWith("_"),
    sourceLines: lineRangeFromOffsets(args.lineStarts, args.startOffset, args.endOffsetExclusive)
  };
}
function extractClasses(args) {
  const classes = [];
  const braceDepths = computeBraceDepths(args.sanitizedText);
  const classRegex = /(?:^|[\n;])\s*(?:pub\s+)?(?:abstract\s+)?(?:class|struct|trait|interface|enum|impl)\s+([A-Za-z_][A-Za-z0-9_:]*)/gm;
  for (const match of args.sanitizedText.matchAll(classRegex)) {
    const name = match[1];
    if (!name) {
      continue;
    }
    const nameIndex = (match.index ?? 0) + match[0].lastIndexOf(name);
    if ((braceDepths[nameIndex] ?? 0) !== 0) {
      continue;
    }
    const bodyStartIndex = args.sanitizedText.indexOf("{", nameIndex);
    const bodyEndIndex = bodyStartIndex >= 0 ? args.sanitizedText.indexOf("}", bodyStartIndex) : args.sanitizedText.indexOf(`
`, nameIndex);
    classes.push({
      name,
      qualifiedName: `${args.moduleId}::${name}`,
      bases: [],
      dependsOn: [],
      methods: [],
      exported: true,
      sourceLines: lineRangeFromOffsets(args.lineStarts, nameIndex, bodyEndIndex >= 0 ? bodyEndIndex + 1 : nameIndex + name.length)
    });
  }
  return classes;
}
function extractFunctions(args) {
  const functions = [];
  const braceDepths = computeBraceDepths(args.sanitizedText);
  const regexes = [
    /(?:^|[\n;])\s*(?:pub\s+)?(?:async\s+)?(?:fn|func|function|def)\s+([A-Za-z_][A-Za-z0-9_:]*)\s*\(([^)]*)\)/gm,
    /(?:^|[\n;])\s*[A-Za-z_][A-Za-z0-9_<>\s:*&]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*\{/gm
  ];
  for (const regex of regexes) {
    for (const match of args.sanitizedText.matchAll(regex)) {
      const name = match[1];
      if (!name) {
        continue;
      }
      const nameIndex = (match.index ?? 0) + match[0].lastIndexOf(name);
      if ((braceDepths[nameIndex] ?? 0) !== 0) {
        continue;
      }
      const bodyEnd = args.sanitizedText.indexOf(`
`, nameIndex);
      functions.push(buildGenericFunctionIR({
        lineStarts: args.lineStarts,
        moduleId: args.moduleId,
        name,
        paramsText: normalizeWhitespace(match[2] ?? ""),
        sourceText: args.text.slice(match.index ?? 0, bodyEnd >= 0 ? bodyEnd : undefined),
        startOffset: nameIndex,
        endOffsetExclusive: bodyEnd >= 0 ? bodyEnd : nameIndex + name.length
      }));
    }
  }
  return dedupeStrings(functions.map((fn) => fn.qualifiedName)).map((name) => functions.find((fn) => fn.qualifiedName === name)).filter((fn) => Boolean(fn));
}
function parseGenericModule(context, extraNotes = [], extraErrors = []) {
  const moduleId = relativePathToModuleId(context.file.relativePath);
  const text = context.source.text;
  const sanitizedText = sanitizeForStructure(text);
  const lineStarts = computeLineStarts(text);
  return {
    moduleId,
    sourcePath: context.file.absolutePath,
    relativePath: context.file.relativePath,
    language: context.file.language,
    parseMode: context.source.truncated ? "generic-truncated" : "generic-pattern",
    imports: extractImports(text),
    importStubs: [],
    exports: [],
    classes: extractClasses({
      lineStarts,
      moduleId,
      sanitizedText,
      text
    }),
    functions: extractFunctions({
      lineStarts,
      moduleId,
      sanitizedText,
      text
    }),
    notes: dedupeStrings([
      ...extraNotes,
      ...context.source.truncated ? [`source truncated to ${context.config.maxFileBytes} bytes before parsing`] : []
    ]),
    errors: dedupeStrings(extraErrors),
    sourceBytes: context.source.byteSize,
    lineCount: lineStarts.length,
    truncated: context.source.truncated
  };
}

// src/indexing/parsers/python.ts
function indentationWidth(line) {
  let width = 0;
  for (const char of line) {
    if (char === " ") {
      width++;
      continue;
    }
    if (char === "\t") {
      width += 4;
      continue;
    }
    break;
  }
  return width;
}
function collectDecorators(lines, startIndex, requiredIndent) {
  const decorators = [];
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      index++;
      continue;
    }
    if (indentationWidth(line) === requiredIndent && line.trimStart().startsWith("@")) {
      decorators.push(line.trim().slice(1));
      index++;
      continue;
    }
    break;
  }
  return { decorators, nextIndex: index };
}
function collectHeader(lines, startIndex) {
  const parts = [];
  let index = startIndex;
  let balance = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    parts.push(trimmed);
    for (const char of trimmed) {
      if ("([{".includes(char)) {
        balance++;
      } else if (")]}".includes(char)) {
        balance = Math.max(0, balance - 1);
      }
    }
    if (balance === 0 && trimmed.endsWith(":")) {
      break;
    }
    index++;
  }
  return {
    endIndex: index,
    text: parts.join(" ")
  };
}
function findBlockEnd(lines, headerEndIndex, headerIndent) {
  let lastIndex = headerEndIndex;
  for (let index = headerEndIndex + 1;index < lines.length; index++) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith("#")) {
      continue;
    }
    const indent = indentationWidth(line);
    if (indent <= headerIndent) {
      return lastIndex;
    }
    lastIndex = index;
  }
  return lines.length - 1;
}
function extractImports2(text) {
  const imports = [];
  for (const match of text.matchAll(/^\s*import\s+([A-Za-z0-9_.,\s]+)(?:\s+as\s+[A-Za-z0-9_]+)?\s*$/gm)) {
    if (match[1]) {
      for (const part of match[1].split(",")) {
        const token = part.trim().split(/\s+as\s+/)[0];
        if (token) {
          imports.push(token);
        }
      }
    }
  }
  for (const match of text.matchAll(/^\s*from\s+([A-Za-z0-9_./]+)\s+import\s+([A-Za-z0-9_.*,\s]+)\s*$/gm)) {
    if (match[1]) {
      imports.push(match[1]);
    }
  }
  return dedupeStrings(imports);
}
function extractImportStubs(text) {
  const stubs = [];
  for (const match of text.matchAll(/^\s*import\s+([A-Za-z0-9_.,\s]+(?:\s+as\s+[A-Za-z0-9_]+)?)\s*$/gm)) {
    const clause = match[1] ?? "";
    for (const part of clause.split(",")) {
      const normalized = normalizeWhitespace(part);
      if (!normalized) {
        continue;
      }
      stubs.push(`import ${normalized}`);
    }
  }
  for (const match of text.matchAll(/^\s*from\s+([A-Za-z0-9_./]+)\s+import\s+([A-Za-z0-9_.*,\s]+)\s*$/gm)) {
    const fromModule = normalizeWhitespace(match[1] ?? "");
    const imported = normalizeWhitespace(match[2] ?? "");
    if (!fromModule || !imported) {
      continue;
    }
    stubs.push(`from ${fromModule} import ${imported}`);
  }
  return dedupeStrings(stubs);
}
function extractExports(text, classes, functions) {
  const explicitExports = [];
  const allMatch = text.match(/__all__\s*=\s*[\[(]([\s\S]*?)[\])]/m);
  if (allMatch?.[1]) {
    for (const item of allMatch[1].matchAll(/['"]([^'"]+)['"]/g)) {
      if (item[1]) {
        explicitExports.push(item[1]);
      }
    }
  }
  if (explicitExports.length > 0) {
    return dedupeStrings(explicitExports);
  }
  return dedupeStrings([
    ...classes.map((cls) => cls.name).filter((name) => !name.startsWith("_")),
    ...functions.map((fn) => fn.name).filter((name) => !name.startsWith("_"))
  ]);
}
function buildPythonFunctionIR(args) {
  const parsed = args.headerText.match(/^(async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*)\)\s*(?:->\s*([^:]+))?:$/);
  const paramsText = parsed?.[3] ?? "";
  const returns = cleanTypeReference(parsed?.[4] ?? "");
  const qualifiedName = args.ownerClassName ? `${args.moduleId}::${args.ownerClassName}.${args.name}` : `${args.moduleId}::${args.name}`;
  return {
    kind: args.isMethod ? "method" : "function",
    name: args.name,
    qualifiedName,
    params: parseParametersFromSignature(paramsText),
    returns: returns || undefined,
    decorators: args.decorators,
    calls: extractCallTargets(args.bodyText),
    awaits: extractAwaitTargets(args.bodyText),
    raises: extractRaisedTargets(args.bodyText),
    isAsync: Boolean(parsed?.[1]),
    isPublic: !args.name.startsWith("_"),
    exported: !args.name.startsWith("_"),
    sourceLines: lineRangeFromOffsets(args.lineStarts, args.lineStarts[args.startLineIndex] ?? 0, (args.lineStarts[args.endLineIndex + 1] ?? Number.MAX_SAFE_INTEGER) - 1)
  };
}
function extractPythonMethods(args) {
  const methods = [];
  for (let index = args.classBodyStartIndex;index <= args.classEndIndex; ) {
    const line = args.lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed) {
      index++;
      continue;
    }
    const indent = indentationWidth(line);
    if (indent <= args.classIndent) {
      index++;
      continue;
    }
    const decoratorBlock = collectDecorators(args.lines, index, indent);
    const definitionIndex = decoratorBlock.nextIndex;
    const definitionLine = args.lines[definitionIndex] ?? "";
    const definitionTrimmed = definitionLine.trim();
    if (!/^(async\s+def|def)\s+/.test(definitionTrimmed)) {
      index = definitionIndex + 1;
      continue;
    }
    const header = collectHeader(args.lines, definitionIndex);
    const endIndex = findBlockEnd(args.lines, header.endIndex, indent);
    const nameMatch = header.text.match(/^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (!nameMatch?.[1]) {
      index = endIndex + 1;
      continue;
    }
    methods.push(buildPythonFunctionIR({
      bodyText: args.lines.slice(header.endIndex + 1, endIndex + 1).join(`
`),
      decorators: decoratorBlock.decorators,
      endLineIndex: endIndex,
      headerText: header.text,
      isMethod: true,
      lineStarts: args.lineStarts,
      moduleId: args.moduleId,
      name: nameMatch[1],
      ownerClassName: args.className,
      startLineIndex: decoratorBlock.decorators.length > 0 ? index : definitionIndex
    }));
    index = endIndex + 1;
  }
  return methods;
}
function parsePythonModule(context) {
  const moduleId = relativePathToModuleId(context.file.relativePath);
  const text = context.source.text;
  const lines = text.split(`
`);
  const lineStarts = computeLineStarts(text);
  const classes = [];
  const functions = [];
  for (let index = 0;index < lines.length; ) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed) {
      index++;
      continue;
    }
    if (indentationWidth(line) !== 0) {
      index++;
      continue;
    }
    const decoratorBlock = collectDecorators(lines, index, 0);
    const definitionIndex = decoratorBlock.nextIndex;
    const definitionLine = lines[definitionIndex] ?? "";
    const definitionTrimmed = definitionLine.trim();
    if (/^class\s+/.test(definitionTrimmed)) {
      const header = collectHeader(lines, definitionIndex);
      const endIndex = findBlockEnd(lines, header.endIndex, 0);
      const classMatch = header.text.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)(?:\(([^)]*)\))?:$/);
      if (classMatch?.[1]) {
        const methods = extractPythonMethods({
          classBodyStartIndex: header.endIndex + 1,
          classEndIndex: endIndex,
          classIndent: 0,
          className: classMatch[1],
          lines,
          lineStarts,
          moduleId
        });
        const constructor = methods.find((method) => method.name === "__init__");
        classes.push({
          name: classMatch[1],
          qualifiedName: `${moduleId}::${classMatch[1]}`,
          bases: classMatch[2] ? dedupeStrings(splitTopLevel(classMatch[2], ",")) : [],
          dependsOn: dedupeStrings((constructor?.params ?? []).map(dependencyLabelForParam)),
          methods,
          exported: !classMatch[1].startsWith("_"),
          sourceLines: lineRangeFromOffsets(lineStarts, lineStarts[decoratorBlock.decorators.length > 0 ? index : definitionIndex] ?? 0, (lineStarts[endIndex + 1] ?? Number.MAX_SAFE_INTEGER) - 1)
        });
      }
      index = endIndex + 1;
      continue;
    }
    if (/^(async\s+def|def)\s+/.test(definitionTrimmed)) {
      const header = collectHeader(lines, definitionIndex);
      const endIndex = findBlockEnd(lines, header.endIndex, 0);
      const functionMatch = header.text.match(/^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
      if (functionMatch?.[1]) {
        functions.push(buildPythonFunctionIR({
          bodyText: lines.slice(header.endIndex + 1, endIndex + 1).join(`
`),
          decorators: decoratorBlock.decorators,
          endLineIndex: endIndex,
          headerText: header.text,
          isMethod: false,
          lineStarts,
          moduleId,
          name: functionMatch[1],
          startLineIndex: decoratorBlock.decorators.length > 0 ? index : definitionIndex
        }));
      }
      index = endIndex + 1;
      continue;
    }
    index = definitionIndex + 1;
  }
  return {
    moduleId,
    sourcePath: context.file.absolutePath,
    relativePath: context.file.relativePath,
    language: context.file.language,
    parseMode: context.source.truncated ? "python-heuristic-truncated" : "python-heuristic",
    imports: extractImports2(text),
    importStubs: extractImportStubs(text),
    exports: extractExports(text, classes, functions),
    classes,
    functions,
    notes: context.source.truncated ? [`source truncated to ${context.config.maxFileBytes} bytes before parsing`] : [],
    errors: [],
    sourceBytes: context.source.byteSize,
    lineCount: lineStarts.length,
    truncated: context.source.truncated
  };
}

// src/indexing/parsers/typescriptLike.ts
import { posix } from "path";
function extractImports3(text) {
  const imports = [];
  for (const match of text.matchAll(/^\s*import[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/gm)) {
    if (match[1]) {
      imports.push(match[1]);
    }
  }
  for (const match of text.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) {
    if (match[1]) {
      imports.push(match[1]);
    }
  }
  for (const match of text.matchAll(/^\s*export[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/gm)) {
    if (match[1]) {
      imports.push(match[1]);
    }
  }
  for (const match of text.matchAll(/^\s*(?:const|let|var)\s+[^=\n]+\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/gm)) {
    if (match[1]) {
      imports.push(match[1]);
    }
  }
  return dedupeStrings(imports);
}
function stripModuleExtension(value) {
  let normalized = value.trim();
  normalized = normalized.replace(/\.(?:[cm]?[jt]sx?|py)$/i, "");
  normalized = normalized.replace(/\/index$/i, "");
  return normalized;
}
function normalizeModuleSegment(value) {
  return safePythonIdentifier(value.replace(/^@/, "").replace(/-/g, "_"), "mod");
}
function toPythonModuleSpecifier(currentRelativePath, rawSpecifier) {
  const specifier = stripModuleExtension(rawSpecifier);
  if (!specifier) {
    return null;
  }
  if (specifier.startsWith(".")) {
    const currentDir = posix.dirname(currentRelativePath.replaceAll("\\", "/"));
    const currentSegments = currentDir === "." ? [] : currentDir.split("/").filter(Boolean);
    const targetPath = posix.normalize(posix.join(currentDir === "." ? "" : currentDir, specifier));
    const targetSegments = targetPath.split("/").filter(Boolean);
    let common = 0;
    while (common < currentSegments.length && common < targetSegments.length && currentSegments[common] === targetSegments[common]) {
      common++;
    }
    const relativeDots = ".".repeat(currentSegments.length - common + 1);
    const remainder = targetSegments.slice(common).map(normalizeModuleSegment).join(".");
    return remainder ? `${relativeDots}${remainder}` : relativeDots;
  }
  return specifier.split("/").filter(Boolean).map(normalizeModuleSegment).join(".");
}
function parseNamedImportList(clause) {
  const inner = clause.trim().replace(/^\{/, "").replace(/\}$/, "");
  return splitTopLevel(inner, ",").map((part) => normalizeWhitespace(part).replace(/^type\s+/, "")).filter(Boolean).map((part) => {
    const aliasMatch = part.match(/^([A-Za-z_$][A-Za-z0-9_$]*)(?:\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*))?$/);
    if (!aliasMatch?.[1]) {
      return null;
    }
    const imported = safePythonIdentifier(aliasMatch[1], "symbol");
    const alias = aliasMatch[2] ? safePythonIdentifier(aliasMatch[2], imported) : null;
    return alias && alias !== imported ? `${imported} as ${alias}` : imported;
  }).filter((part) => Boolean(part));
}
function renderNamespaceImport(moduleSpecifier, alias) {
  if (!moduleSpecifier) {
    return null;
  }
  if (!moduleSpecifier.startsWith(".")) {
    return `import ${moduleSpecifier} as ${alias}`;
  }
  const leadingDots = moduleSpecifier.match(/^\.+/)?.[0] ?? "";
  const remainder = moduleSpecifier.slice(leadingDots.length);
  if (!remainder) {
    return null;
  }
  const parts = remainder.split(".").filter(Boolean);
  const imported = parts.pop();
  if (!imported) {
    return null;
  }
  const prefix = `${leadingDots}${parts.join(".")}`.replace(/\.$/, "");
  return parts.length > 0 ? `from ${prefix} import ${imported} as ${alias}` : `from ${leadingDots} import ${imported} as ${alias}`;
}
function extractImportStubs2(text, currentRelativePath) {
  const stubs = [];
  for (const match of text.matchAll(/^\s*import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]\s*;?$/gm)) {
    const rawClause = normalizeWhitespace((match[1] ?? "").replace(/^type\s+/, ""));
    const moduleSpecifier = toPythonModuleSpecifier(currentRelativePath, match[2] ?? "");
    if (!rawClause || !moduleSpecifier) {
      continue;
    }
    let defaultImport = null;
    let namespaceImport = null;
    const namedImports = [];
    for (const part of splitTopLevel(rawClause, ",")) {
      const normalized = normalizeWhitespace(part);
      if (!normalized) {
        continue;
      }
      if (normalized.startsWith("{")) {
        namedImports.push(...parseNamedImportList(normalized));
        continue;
      }
      const namespaceMatch = normalized.match(/^\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/);
      if (namespaceMatch?.[1]) {
        namespaceImport = safePythonIdentifier(namespaceMatch[1], "namespace_");
        continue;
      }
      defaultImport = safePythonIdentifier(normalized.replace(/^type\s+/, ""), "imported_symbol");
    }
    const importedNames = [
      ...defaultImport ? [defaultImport] : [],
      ...namedImports
    ];
    if (importedNames.length > 0) {
      stubs.push(`from ${moduleSpecifier} import ${importedNames.join(", ")}`);
    }
    if (namespaceImport) {
      const namespaceLine = renderNamespaceImport(moduleSpecifier, namespaceImport);
      if (namespaceLine) {
        stubs.push(namespaceLine);
      }
    }
  }
  for (const match of text.matchAll(/^\s*import\s+['"]([^'"]+)['"]\s*;?$/gm)) {
    const moduleSpecifier = toPythonModuleSpecifier(currentRelativePath, match[1] ?? "");
    if (moduleSpecifier && !moduleSpecifier.startsWith(".")) {
      stubs.push(`import ${moduleSpecifier}`);
    }
  }
  for (const match of text.matchAll(/^\s*(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/gm)) {
    const alias = safePythonIdentifier(match[1] ?? "", "required_module");
    const moduleSpecifier = toPythonModuleSpecifier(currentRelativePath, match[2] ?? "");
    if (!moduleSpecifier) {
      continue;
    }
    const namespaceLine = renderNamespaceImport(moduleSpecifier, alias);
    if (namespaceLine) {
      stubs.push(namespaceLine);
    }
  }
  return dedupeStrings(stubs);
}
function extractExports2(text) {
  const exports = [];
  for (const match of text.matchAll(/^\s*export\s+(?:default\s+)?(?:async\s+)?(?:class|function|const|let|var|type|interface|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm)) {
    if (match[1]) {
      exports.push(match[1]);
    }
  }
  for (const match of text.matchAll(/^\s*export\s+default\b/gm)) {
    if ((match.index ?? 0) >= 0) {
      exports.push("default");
    }
  }
  for (const match of text.matchAll(/^\s*export\s*\{([^}]+)\}/gm)) {
    const names = splitTopLevel(match[1] ?? "", ",");
    for (const name of names) {
      const aliasMatch = name.match(/^\s*([A-Za-z_$][A-Za-z0-9_$]*)(?:\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*))?\s*$/);
      if (aliasMatch?.[2]) {
        exports.push(aliasMatch[2]);
      } else if (aliasMatch?.[1]) {
        exports.push(aliasMatch[1]);
      }
    }
  }
  return dedupeStrings(exports);
}
function findAssignmentOperator(text, startIndex) {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let angleDepth = 0;
  for (let index = startIndex;index < text.length; index++) {
    const char = text[index] ?? "";
    const next = text[index + 1] ?? "";
    const previous = text[index - 1] ?? "";
    if (char === "(") {
      parenDepth++;
      continue;
    }
    if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }
    if (char === "[") {
      bracketDepth++;
      continue;
    }
    if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (char === "{") {
      braceDepth++;
      continue;
    }
    if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (char === "<") {
      angleDepth++;
      continue;
    }
    if (char === ">" && angleDepth > 0) {
      angleDepth--;
      continue;
    }
    if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0 && angleDepth === 0) {
      if (char === ";") {
        return -1;
      }
      if (char === "=" && next !== ">" && next !== "=" && previous !== "=" && previous !== "!" && previous !== "<" && previous !== ">") {
        return index;
      }
    }
  }
  return -1;
}
function findArrowOperator(text, startIndex) {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let angleDepth = 0;
  for (let index = startIndex;index < text.length - 1; index++) {
    const char = text[index] ?? "";
    const next = text[index + 1] ?? "";
    if (char === "(") {
      parenDepth++;
      continue;
    }
    if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }
    if (char === "[") {
      bracketDepth++;
      continue;
    }
    if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (char === "{") {
      braceDepth++;
      continue;
    }
    if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (char === "<") {
      angleDepth++;
      continue;
    }
    if (char === ">" && angleDepth > 0) {
      angleDepth--;
      continue;
    }
    if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0 && angleDepth === 0 && char === "=" && next === ">") {
      return index;
    }
  }
  return -1;
}
function findStatementEnd(text, startIndex) {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  for (let index = startIndex;index < text.length; index++) {
    const char = text[index] ?? "";
    if (char === "(") {
      parenDepth++;
      continue;
    }
    if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }
    if (char === "[") {
      bracketDepth++;
      continue;
    }
    if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (char === "{") {
      braceDepth++;
      continue;
    }
    if (char === "}") {
      if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
        return index;
      }
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      if (char === ";" || char === `
`) {
        return index;
      }
    }
  }
  return text.length;
}
function extractReturnType(text) {
  const trimmed = normalizeWhitespace(text);
  if (!trimmed.startsWith(":")) {
    return;
  }
  const value = cleanTypeReference(trimmed.slice(1));
  return value || undefined;
}
function buildFunctionIR(args) {
  const qualifiedName = args.ownerClassName ? `${args.moduleId}::${args.ownerClassName}.${args.name}` : `${args.moduleId}::${args.name}`;
  return {
    kind: args.kind,
    name: args.name,
    qualifiedName,
    params: parseParametersFromSignature(args.paramsText),
    returns: args.returns,
    decorators: [],
    calls: extractCallTargets(args.bodyText),
    awaits: extractAwaitTargets(args.bodyText),
    raises: extractRaisedTargets(args.bodyText),
    isAsync: args.isAsync,
    isPublic: args.isPublic,
    exported: args.exported,
    sourceLines: lineRangeFromOffsets(args.lineStarts, args.startOffset, args.endOffsetExclusive),
    originPath: args.originPath
  };
}
function extractClassBases(headerText) {
  const results = [];
  const normalized = normalizeWhitespace(headerText);
  const extendsMatch = normalized.match(/\bextends\s+(.+?)(?:\bimplements\b|$)/);
  if (extendsMatch?.[1]) {
    results.push(...splitTopLevel(extendsMatch[1], ","));
  }
  const implementsMatch = normalized.match(/\bimplements\s+(.+)$/);
  if (implementsMatch?.[1]) {
    results.push(...splitTopLevel(implementsMatch[1], ","));
  }
  return dedupeStrings(results.map(cleanTypeReference));
}
function extractClassMethods(args) {
  const methods = [];
  const localDepths = computeBraceDepths(args.sanitizedBody);
  const methodRegex = /(?:^|[\n;])\s*(?:(?:public|private|protected|static|readonly|abstract|override|get|set|declare)\s+)*(async\s+)?(?:(constructor)|([A-Za-z_$][A-Za-z0-9_$]*))\s*(?:<[^>{=;]*>)?\s*\(/g;
  for (const match of args.sanitizedBody.matchAll(methodRegex)) {
    const name = match[2] ?? match[3];
    if (!name) {
      continue;
    }
    const nameIndex = (match.index ?? 0) + (match[0].lastIndexOf(name) >= 0 ? match[0].lastIndexOf(name) : 0);
    if ((localDepths[nameIndex] ?? 0) !== 0) {
      continue;
    }
    const openParenIndex = args.sanitizedBody.indexOf("(", nameIndex);
    const closeParenIndex = findMatchingChar(args.sanitizedBody, openParenIndex, "(", ")");
    if (openParenIndex === -1 || closeParenIndex === -1) {
      continue;
    }
    const afterParamsIndex = skipWhitespace(args.sanitizedBody, closeParenIndex + 1);
    const bodyStartIndex = args.sanitizedBody.indexOf("{", afterParamsIndex);
    const statementTerminatorIndex = args.sanitizedBody.indexOf(";", afterParamsIndex);
    if (bodyStartIndex === -1 || statementTerminatorIndex !== -1 && statementTerminatorIndex < bodyStartIndex) {
      continue;
    }
    const bodyEndIndex = findMatchingChar(args.sanitizedBody, bodyStartIndex, "{", "}");
    if (bodyEndIndex === -1) {
      continue;
    }
    const paramsText = args.bodyText.slice(openParenIndex + 1, closeParenIndex);
    const returnSegment = args.bodyText.slice(afterParamsIndex, bodyStartIndex);
    const bodyText = args.bodyText.slice(bodyStartIndex + 1, bodyEndIndex);
    const modifiersText = normalizeWhitespace(args.bodyText.slice(match.index ?? 0, openParenIndex));
    methods.push(buildFunctionIR({
      bodyText,
      endOffsetExclusive: args.bodyOffset + bodyEndIndex + 1,
      exported: false,
      isAsync: Boolean(match[1]),
      isPublic: !/\bprivate\b/.test(modifiersText) && !/\bprotected\b/.test(modifiersText),
      kind: "method",
      lineStarts: args.lineStarts,
      moduleId: args.moduleId,
      name,
      originPath: args.originPath,
      ownerClassName: args.className,
      paramsText,
      returns: name === "constructor" ? "None" : extractReturnType(returnSegment),
      startOffset: args.bodyOffset + nameIndex
    }));
  }
  return methods;
}
function extractClasses2(args) {
  const classes = [];
  const braceDepths = computeBraceDepths(args.sanitizedText);
  const classRegex = /(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/g;
  for (const match of args.sanitizedText.matchAll(classRegex)) {
    const name = match[1];
    if (!name) {
      continue;
    }
    const classIndex = (match.index ?? 0) + match[0].lastIndexOf("class");
    if ((braceDepths[classIndex] ?? 0) !== 0) {
      continue;
    }
    const bodyStartIndex = args.sanitizedText.indexOf("{", classIndex);
    if (bodyStartIndex === -1) {
      continue;
    }
    const bodyEndIndex = findMatchingChar(args.sanitizedText, bodyStartIndex, "{", "}");
    if (bodyEndIndex === -1) {
      continue;
    }
    const headerText = args.text.slice(classIndex, bodyStartIndex);
    const bodyText = args.text.slice(bodyStartIndex + 1, bodyEndIndex);
    const sanitizedBody = args.sanitizedText.slice(bodyStartIndex + 1, bodyEndIndex);
    const methods = extractClassMethods({
      bodyOffset: bodyStartIndex + 1,
      bodyText,
      className: name,
      lineStarts: args.lineStarts,
      moduleId: args.moduleId,
      originPath: args.originPath,
      sanitizedBody
    });
    const constructorMethod = methods.find((method) => method.name === "constructor");
    classes.push({
      name,
      qualifiedName: `${args.moduleId}::${name}`,
      bases: extractClassBases(headerText),
      dependsOn: dedupeStrings((constructorMethod?.params ?? []).map(dependencyLabelForParam)),
      methods,
      exported: /\bexport\b/.test(match[0]),
      sourceLines: lineRangeFromOffsets(args.lineStarts, classIndex, bodyEndIndex + 1),
      originPath: args.originPath
    });
  }
  return classes;
}
function extractFunctionDeclarations(args) {
  const functions = [];
  const braceDepths = computeBraceDepths(args.sanitizedText);
  const functionRegex = /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:<[^>{=;]*>)?\s*\(/g;
  for (const match of args.sanitizedText.matchAll(functionRegex)) {
    const name = match[1];
    if (!name) {
      continue;
    }
    const functionIndex = (match.index ?? 0) + match[0].lastIndexOf("function");
    if ((braceDepths[functionIndex] ?? 0) !== 0) {
      continue;
    }
    const openParenIndex = args.sanitizedText.indexOf("(", functionIndex);
    const closeParenIndex = findMatchingChar(args.sanitizedText, openParenIndex, "(", ")");
    if (openParenIndex === -1 || closeParenIndex === -1) {
      continue;
    }
    const bodyStartIndex = args.sanitizedText.indexOf("{", skipWhitespace(args.sanitizedText, closeParenIndex + 1));
    if (bodyStartIndex === -1) {
      continue;
    }
    const bodyEndIndex = findMatchingChar(args.sanitizedText, bodyStartIndex, "{", "}");
    if (bodyEndIndex === -1) {
      continue;
    }
    functions.push(buildFunctionIR({
      bodyText: args.text.slice(bodyStartIndex + 1, bodyEndIndex),
      endOffsetExclusive: bodyEndIndex + 1,
      exported: /\bexport\b/.test(match[0]),
      isAsync: /\basync\b/.test(match[0]),
      isPublic: !name.startsWith("_"),
      kind: "function",
      lineStarts: args.lineStarts,
      moduleId: args.moduleId,
      name,
      originPath: args.originPath,
      paramsText: args.text.slice(openParenIndex + 1, closeParenIndex),
      returns: extractReturnType(args.text.slice(closeParenIndex + 1, bodyStartIndex)),
      startOffset: functionIndex
    }));
  }
  return functions;
}
function extractVariableFunctions(args) {
  const functions = [];
  const braceDepths = computeBraceDepths(args.sanitizedText);
  const variableRegex = /(?:export\s+)?(?:default\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/g;
  for (const match of args.sanitizedText.matchAll(variableRegex)) {
    const name = match[1];
    if (!name) {
      continue;
    }
    const nameIndex = (match.index ?? 0) + match[0].lastIndexOf(name);
    if ((braceDepths[nameIndex] ?? 0) !== 0) {
      continue;
    }
    const assignmentIndex = findAssignmentOperator(args.sanitizedText, nameIndex + name.length);
    if (assignmentIndex === -1) {
      continue;
    }
    let valueIndex = skipWhitespace(args.sanitizedText, assignmentIndex + 1);
    let isAsync = false;
    if (args.sanitizedText.startsWith("async", valueIndex) && /[\s(]/.test(args.sanitizedText[valueIndex + 5] ?? " ")) {
      isAsync = true;
      valueIndex = skipWhitespace(args.sanitizedText, valueIndex + 5);
    }
    if (args.sanitizedText.startsWith("function", valueIndex)) {
      const openParenIndex = args.sanitizedText.indexOf("(", valueIndex);
      const closeParenIndex = findMatchingChar(args.sanitizedText, openParenIndex, "(", ")");
      if (openParenIndex === -1 || closeParenIndex === -1) {
        continue;
      }
      const bodyStartIndex2 = args.sanitizedText.indexOf("{", skipWhitespace(args.sanitizedText, closeParenIndex + 1));
      if (bodyStartIndex2 === -1) {
        continue;
      }
      const bodyEndIndex = findMatchingChar(args.sanitizedText, bodyStartIndex2, "{", "}");
      if (bodyEndIndex === -1) {
        continue;
      }
      functions.push(buildFunctionIR({
        bodyText: args.text.slice(bodyStartIndex2 + 1, bodyEndIndex),
        endOffsetExclusive: bodyEndIndex + 1,
        exported: /\bexport\b/.test(match[0]),
        isAsync,
        isPublic: !name.startsWith("_"),
        kind: "function",
        lineStarts: args.lineStarts,
        moduleId: args.moduleId,
        name,
        originPath: args.originPath,
        paramsText: args.text.slice(openParenIndex + 1, closeParenIndex),
        returns: extractReturnType(args.text.slice(closeParenIndex + 1, bodyStartIndex2)),
        startOffset: nameIndex
      }));
      continue;
    }
    let paramsText = "";
    let returnType;
    let searchFrom = valueIndex;
    if (args.sanitizedText[valueIndex] === "(") {
      const closeParenIndex = findMatchingChar(args.sanitizedText, valueIndex, "(", ")");
      if (closeParenIndex === -1) {
        continue;
      }
      paramsText = args.text.slice(valueIndex + 1, closeParenIndex);
      const arrowIndex = findArrowOperator(args.sanitizedText, closeParenIndex + 1);
      if (arrowIndex === -1) {
        continue;
      }
      returnType = extractReturnType(args.text.slice(closeParenIndex + 1, arrowIndex));
      searchFrom = arrowIndex + 2;
    } else {
      const singleParamMatch = args.sanitizedText.slice(valueIndex).match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*=>/);
      if (!singleParamMatch?.[1]) {
        continue;
      }
      paramsText = singleParamMatch[1];
      searchFrom = valueIndex + singleParamMatch[0].length;
    }
    const bodyStartIndex = skipWhitespace(args.sanitizedText, searchFrom);
    if (bodyStartIndex >= args.sanitizedText.length) {
      continue;
    }
    if (args.sanitizedText[bodyStartIndex] === "{") {
      const bodyEndIndex = findMatchingChar(args.sanitizedText, bodyStartIndex, "{", "}");
      if (bodyEndIndex === -1) {
        continue;
      }
      functions.push(buildFunctionIR({
        bodyText: args.text.slice(bodyStartIndex + 1, bodyEndIndex),
        endOffsetExclusive: bodyEndIndex + 1,
        exported: /\bexport\b/.test(match[0]),
        isAsync,
        isPublic: !name.startsWith("_"),
        kind: "function",
        lineStarts: args.lineStarts,
        moduleId: args.moduleId,
        name,
        paramsText,
        returns: returnType,
        startOffset: nameIndex
      }));
      continue;
    }
    const expressionEnd = findStatementEnd(args.sanitizedText, bodyStartIndex);
    functions.push(buildFunctionIR({
      bodyText: args.text.slice(bodyStartIndex, expressionEnd),
      endOffsetExclusive: expressionEnd,
      exported: /\bexport\b/.test(match[0]),
      isAsync,
      isPublic: !name.startsWith("_"),
      kind: "function",
      lineStarts: args.lineStarts,
      moduleId: args.moduleId,
      name,
      originPath: args.originPath,
      paramsText,
      returns: returnType,
      startOffset: nameIndex
    }));
  }
  return functions;
}
function parseTypeScriptLikeModule(context) {
  const moduleId = relativePathToModuleId(context.file.relativePath);
  const text = context.source.text;
  const sanitizedText = sanitizeForStructure(text);
  const lineStarts = computeLineStarts(text);
  const classes = extractClasses2({
    lineStarts,
    moduleId,
    originPath: context.file.relativePath,
    sanitizedText,
    text
  });
  const functions = dedupeStrings([
    ...extractFunctionDeclarations({
      lineStarts,
      moduleId,
      originPath: context.file.relativePath,
      sanitizedText,
      text
    }).map((fn) => fn.qualifiedName),
    ...extractVariableFunctions({
      lineStarts,
      moduleId,
      originPath: context.file.relativePath,
      sanitizedText,
      text
    }).map((fn) => fn.qualifiedName)
  ]);
  const functionMap = new Map;
  for (const fn of [
    ...extractFunctionDeclarations({
      lineStarts,
      moduleId,
      originPath: context.file.relativePath,
      sanitizedText,
      text
    }),
    ...extractVariableFunctions({
      lineStarts,
      moduleId,
      originPath: context.file.relativePath,
      sanitizedText,
      text
    })
  ]) {
    if (!functionMap.has(fn.qualifiedName)) {
      functionMap.set(fn.qualifiedName, fn);
    }
  }
  return {
    moduleId,
    sourcePath: context.file.absolutePath,
    relativePath: context.file.relativePath,
    language: context.file.language,
    parseMode: context.source.truncated ? "ts-heuristic-truncated" : "ts-heuristic",
    imports: extractImports3(text),
    importStubs: extractImportStubs2(text, context.file.relativePath),
    exports: extractExports2(text),
    classes,
    functions: functions.map((name) => functionMap.get(name)).filter(Boolean),
    notes: context.source.truncated ? [`source truncated to ${context.config.maxFileBytes} bytes before parsing`] : [],
    errors: [],
    sourceBytes: context.source.byteSize,
    lineCount: lineStarts.length,
    truncated: context.source.truncated
  };
}

// src/indexing/source.ts
import { open, readFile as readFile2, stat as stat3 } from "fs/promises";
var utf8Decoder = new TextDecoder("utf-8", { fatal: false });
function normalizeDecodedText(text) {
  const withoutBom = text.charCodeAt(0) === 65279 ? text.slice(1) : text;
  return withoutBom.replace(/\r\n?/g, `
`);
}
async function readSourceText(filePath, maxBytes) {
  const fileStat = await stat3(filePath);
  const byteSize = fileStat.size;
  if (byteSize <= maxBytes) {
    const buffer = await readFile2(filePath);
    return {
      text: normalizeDecodedText(utf8Decoder.decode(buffer)),
      byteSize,
      truncated: false
    };
  }
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    return {
      text: normalizeDecodedText(utf8Decoder.decode(buffer.subarray(0, bytesRead))),
      byteSize,
      truncated: true
    };
  } finally {
    await handle.close();
  }
}

// src/indexing/parseBuiltin.ts
function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}
function buildReadErrorModule(file) {
  return {
    moduleId: relativePathToModuleId(file.relativePath),
    sourcePath: file.absolutePath,
    relativePath: file.relativePath,
    language: file.language,
    parseMode: "read-error",
    imports: [],
    importStubs: [],
    exports: [],
    classes: [],
    functions: [],
    notes: [],
    errors: ["failed to read source file"],
    sourceBytes: 0,
    lineCount: 0,
    truncated: false
  };
}
function createParserConfig(maxFileBytes) {
  return {
    rootDir: "",
    outputDir: "",
    outputDirName: "",
    maxFileBytes,
    parseWorkers: 1,
    ignoredDirNames: new Set
  };
}
function parseModule(context) {
  switch (context.file.language) {
    case "typescript":
    case "javascript":
      return parseTypeScriptLikeModule(context);
    case "python":
      return parsePythonModule(context);
    default:
      return parseGenericModule(context);
  }
}
async function parseModuleWithBuiltinParsers(args) {
  const config = createParserConfig(args.maxFileBytes);
  let source;
  try {
    source = await readSourceText(args.file.absolutePath, config.maxFileBytes);
  } catch (error) {
    const failedModule = buildReadErrorModule(args.file);
    failedModule.errors = [`read error: ${describeError(error)}`];
    return failedModule;
  }
  try {
    return parseModule({
      config,
      file: args.file,
      source
    });
  } catch (error) {
    const fallback = parseGenericModule({
      config,
      file: args.file,
      source
    }, ["parser fell back to generic pattern matching"], [`parse error: ${describeError(error)}`]);
    fallback.parseMode = source.truncated ? `fallback-${args.file.language}-truncated` : `fallback-${args.file.language}`;
    return fallback;
  }
}

// src/indexing/parseWorkerPool.ts
import { existsSync as existsSync2 } from "fs";
import { dirname as dirname4, resolve as resolve2 } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { Worker } from "node:worker_threads";
var WORKER_ENTRY_ENV = "CLAUDE_CODE_INDEX_PARSE_WORKER_ENTRY";
function resolveWorkerEntry() {
  const envOverride = process.env[WORKER_ENTRY_ENV];
  if (envOverride) {
    const resolvedOverride = resolve2(process.cwd(), envOverride);
    if (existsSync2(resolvedOverride)) {
      return pathToFileURL(resolvedOverride);
    }
  }
  const candidates = [
    resolve2(process.cwd(), "src/commands/index/parseWorker.bundle.mjs"),
    resolve2(dirname4(process.execPath), "../src/commands/index/parseWorker.bundle.mjs"),
    resolve2(dirname4(fileURLToPath(import.meta.url)), "../commands/index/parseWorker.bundle.mjs"),
    resolve2(process.cwd(), "src/indexing/parseWorker.ts"),
    resolve2(dirname4(process.execPath), "../src/indexing/parseWorker.ts"),
    resolve2(dirname4(fileURLToPath(import.meta.url)), "parseWorker.ts")
  ];
  for (const candidate of candidates) {
    if (existsSync2(candidate)) {
      return pathToFileURL(candidate);
    }
  }
  throw new Error("unable to resolve index parse worker entry");
}

class ParseWorkerClient {
  worker;
  closed = false;
  pending = null;
  constructor() {
    this.worker = new Worker(resolveWorkerEntry());
    this.worker.on("message", this.handleMessage);
    this.worker.on("error", this.handleError);
    this.worker.on("exit", this.handleExit);
  }
  parse(request) {
    if (this.closed) {
      return Promise.reject(new Error("parse worker is closed"));
    }
    if (this.pending) {
      return Promise.reject(new Error("parse worker received overlapping request"));
    }
    return new Promise((resolve3, reject) => {
      this.pending = { resolve: resolve3, reject };
      this.worker.postMessage(request);
    });
  }
  async close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.worker.off("message", this.handleMessage);
    this.worker.off("error", this.handleError);
    this.worker.off("exit", this.handleExit);
    const pending = this.pending;
    this.pending = null;
    pending?.reject(new Error("parse worker closed before request completed"));
    await this.worker.terminate();
  }
  handleMessage = (message) => {
    const pending = this.pending;
    this.pending = null;
    if (!pending) {
      return;
    }
    if (message.ok) {
      pending.resolve(message.module);
      return;
    }
    pending.reject(new Error(message.error));
  };
  handleError = (error) => {
    const pending = this.pending;
    this.pending = null;
    pending?.reject(error);
  };
  handleExit = (code) => {
    if (this.closed || code === 0) {
      return;
    }
    const pending = this.pending;
    this.pending = null;
    pending?.reject(new Error(`parse worker exited with code ${code}`));
  };
}
async function parseModulesWithWorkerPool(args) {
  if (args.files.length === 0) {
    return [];
  }
  const workerCount = Math.max(1, Math.min(args.workerCount, args.files.length));
  const results = new Array(args.files.length);
  const workers = Array.from({ length: workerCount }, () => new ParseWorkerClient);
  let nextIndex = 0;
  try {
    await Promise.all(workers.map(async (worker) => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex++;
        if (currentIndex >= args.files.length) {
          break;
        }
        results[currentIndex] = await worker.parse({
          file: args.files[currentIndex],
          maxFileBytes: args.maxFileBytes
        });
        await args.onParsed?.();
      }
    }));
    return results;
  } finally {
    await Promise.all(workers.map((worker) => worker.close()));
  }
}

// src/indexing/indexWriter.ts
import { mkdir as mkdir3, writeFile as writeFile3 } from "fs/promises";
import { join as join5, parse as parsePath, posix as posix2 } from "path";
function makeEdgeId(index) {
  return `edge-${index.toString().padStart(6, "0")}`;
}
function renderFunctionSignature(fn) {
  const params = fn.params.map((param) => param.annotation ? `${param.name}: ${param.annotation}` : param.name).join(", ");
  return `${fn.name}(${params})${fn.returns ? ` -> ${fn.returns}` : ""}`;
}
async function buildEdges(modules) {
  const edges = [];
  const yieldState = createYieldState();
  for (const module of modules) {
    await maybeYieldToEventLoop(yieldState);
    for (const imported of module.imports) {
      edges.push({
        edgeId: makeEdgeId(edges.length + 1),
        kind: "imports",
        source: module.moduleId,
        target: imported,
        sourceFile: module.relativePath
      });
    }
    for (const cls of module.classes) {
      for (const base of cls.bases) {
        edges.push({
          edgeId: makeEdgeId(edges.length + 1),
          kind: "inherits",
          source: cls.qualifiedName,
          target: base,
          sourceFile: module.relativePath,
          sourceSymbol: cls.qualifiedName,
          lineStart: cls.sourceLines.start,
          lineEnd: cls.sourceLines.end
        });
      }
      for (const dependency of cls.dependsOn) {
        edges.push({
          edgeId: makeEdgeId(edges.length + 1),
          kind: "depends_on",
          source: cls.qualifiedName,
          target: dependency,
          sourceFile: module.relativePath,
          sourceSymbol: cls.qualifiedName,
          lineStart: cls.sourceLines.start,
          lineEnd: cls.sourceLines.end
        });
      }
      for (const method of cls.methods) {
        for (const call3 of method.calls) {
          edges.push({
            edgeId: makeEdgeId(edges.length + 1),
            kind: "calls",
            source: method.qualifiedName,
            target: call3,
            sourceFile: module.relativePath,
            sourceSymbol: method.qualifiedName,
            lineStart: method.sourceLines.start,
            lineEnd: method.sourceLines.end
          });
        }
      }
    }
    for (const fn of module.functions) {
      for (const call3 of fn.calls) {
        edges.push({
          edgeId: makeEdgeId(edges.length + 1),
          kind: "calls",
          source: fn.qualifiedName,
          target: call3,
          sourceFile: module.relativePath,
          sourceSymbol: fn.qualifiedName,
          lineStart: fn.sourceLines.start,
          lineEnd: fn.sourceLines.end
        });
      }
    }
  }
  return edges;
}
function buildManifest(args) {
  const languages = {};
  const parseModes = {};
  let classCount = 0;
  let functionCount = 0;
  let methodCount = 0;
  let truncatedCount = 0;
  for (const module of args.modules) {
    languages[module.language] = (languages[module.language] ?? 0) + 1;
    parseModes[module.parseMode] = (parseModes[module.parseMode] ?? 0) + 1;
    classCount += module.classes.length;
    functionCount += module.functions.length;
    methodCount += module.classes.reduce((count, cls) => count + cls.methods.length, 0);
    truncatedCount += module.truncated ? 1 : 0;
  }
  return {
    artifactVersion: CODE_INDEX_ARTIFACT_VERSION,
    rootDir: args.rootDir,
    outputDir: args.outputDir,
    createdAt: new Date().toISOString(),
    moduleCount: args.modules.length,
    classCount,
    functionCount,
    methodCount,
    edgeCount: args.edges.length,
    fileLimit: args.maxFiles,
    fileLimitReached: args.fileLimitReached,
    truncatedCount,
    languages,
    parseModes
  };
}
function renderSummary(args) {
  const largestModules = [...args.modules].sort((left, right) => {
    const leftCount = left.functions.length + left.classes.length + left.classes.reduce((count, cls) => count + cls.methods.length, 0);
    const rightCount = right.functions.length + right.classes.length + right.classes.reduce((count, cls) => count + cls.methods.length, 0);
    return rightCount - leftCount;
  }).slice(0, 20);
  const lines = [
    "# Code Index Summary",
    "",
    `- root: ${args.manifest.rootDir}`,
    `- output: ${args.outputDir}`,
    `- modules: ${args.manifest.moduleCount}`,
    `- classes: ${args.manifest.classCount}`,
    `- functions: ${args.manifest.functionCount}`,
    `- methods: ${args.manifest.methodCount}`,
    `- edges: ${args.manifest.edgeCount}`,
    `- file_limit: ${args.manifest.fileLimit ?? "none"}`,
    `- file_limit_reached: ${args.manifest.fileLimitReached ? "yes" : "no"}`,
    `- truncated_files: ${args.manifest.truncatedCount}`,
    "",
    "## Languages",
    ...Object.entries(args.manifest.languages).map(([language, count]) => `- ${language}: ${count}`),
    "",
    "## Parse Modes",
    ...Object.entries(args.manifest.parseModes).map(([mode, count]) => `- ${mode}: ${count}`),
    "",
    "## Largest Modules",
    "| Module | Classes | Functions | Methods | Imports | Parse mode |",
    "| --- | ---: | ---: | ---: | ---: | --- |",
    ...largestModules.map((module) => {
      const methods = module.classes.reduce((count, cls) => count + cls.methods.length, 0);
      return `| ${module.relativePath.replaceAll("|", "\\|")} | ${module.classes.length} | ${module.functions.length} | ${methods} | ${module.imports.length} | ${module.parseMode} |`;
    })
  ];
  const failedModules = args.modules.filter((module) => module.errors.length > 0);
  if (failedModules.length > 0) {
    lines.push("", "## Parse Errors");
    for (const module of failedModules.slice(0, 20)) {
      lines.push(`- ${module.relativePath}: ${module.errors.join("; ")}`);
    }
  }
  return lines.join(`
`) + `
`;
}
var JS_LIKE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs"
];
function normalizePathish(value) {
  const trimmed = value.trim().replaceAll("\\", "/");
  if (!trimmed) {
    return "";
  }
  const withoutDotPrefix = trimmed.startsWith("./") ? trimmed.slice(2) : trimmed;
  return withoutDotPrefix.replace(/\/+$/g, "");
}
function stripModuleExtension2(value) {
  return value.replace(/\.(?:[cm]?[jt]sx?|py)$/i, "");
}
function relatedImportExtensions(relativePath) {
  const extension = posix2.extname(relativePath).toLowerCase();
  if (JS_LIKE_EXTENSIONS.includes(extension)) {
    return JS_LIKE_EXTENSIONS;
  }
  if (extension === ".py") {
    return [".py"];
  }
  return extension ? [extension] : [];
}
function addModuleAlias(aliasMap, alias, targetPath) {
  const normalized = normalizePathish(alias);
  if (!normalized || aliasMap.has(normalized)) {
    return;
  }
  aliasMap.set(normalized, targetPath);
}
function collectModuleAliases(relativePath) {
  const normalized = normalizePathish(relativePath);
  const stripped = stripModuleExtension2(normalized);
  const aliases = new Set([normalized, stripped]);
  for (const extension of relatedImportExtensions(normalized)) {
    aliases.add(`${stripped}${extension}`);
  }
  if (stripped.endsWith("/index")) {
    const directoryAlias = stripped.slice(0, -"/index".length);
    if (directoryAlias) {
      aliases.add(directoryAlias);
    }
  }
  return [...aliases];
}
function buildModuleAliasMap(modules) {
  const aliasMap = new Map;
  const sortedModules = [...modules].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  for (const module of sortedModules) {
    for (const alias of collectModuleAliases(module.relativePath)) {
      addModuleAlias(aliasMap, alias, module.relativePath);
    }
  }
  return aliasMap;
}
function resolveRelativePathSpecifier(currentRelativePath, specifier) {
  const currentDir = posix2.dirname(currentRelativePath);
  const baseDir = currentDir === "." ? "" : currentDir;
  const resolved = posix2.normalize(posix2.join(baseDir, specifier));
  return normalizePathish(resolved);
}
function resolveRelativePythonSpecifier(currentRelativePath, specifier) {
  if (specifier.includes("/")) {
    return null;
  }
  const match = specifier.match(/^(\.+)(.*)$/);
  if (!match?.[1]) {
    return null;
  }
  const currentDir = posix2.dirname(currentRelativePath);
  const currentSegments = currentDir === "." ? [] : currentDir.split("/").filter(Boolean);
  const parentSteps = Math.max(0, match[1].length - 1);
  if (parentSteps > currentSegments.length) {
    return null;
  }
  const targetSegments = currentSegments.slice(0, currentSegments.length - parentSteps);
  const remainder = match[2] ?? "";
  if (remainder) {
    targetSegments.push(...remainder.split(".").filter(Boolean));
  }
  return normalizePathish(targetSegments.join("/"));
}
function resolveImportToModulePath(args) {
  const normalizedSpecifier = normalizePathish(args.specifier).replace(/^node:/, "");
  if (!normalizedSpecifier) {
    return null;
  }
  const candidates = new Set;
  const addCandidate = (value) => {
    if (!value) {
      return;
    }
    const normalized = normalizePathish(value);
    if (!normalized) {
      return;
    }
    candidates.add(normalized);
    candidates.add(stripModuleExtension2(normalized));
  };
  if (normalizedSpecifier.startsWith(".")) {
    addCandidate(resolveRelativePathSpecifier(args.importerPath, normalizedSpecifier));
    addCandidate(resolveRelativePythonSpecifier(args.importerPath, normalizedSpecifier));
  } else {
    addCandidate(normalizedSpecifier);
    if (!normalizedSpecifier.includes("/")) {
      addCandidate(normalizedSpecifier.replaceAll(".", "/"));
    }
  }
  for (const candidate of candidates) {
    const resolved = args.aliasMap.get(candidate);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}
async function buildFileDependencyEdges(modules) {
  const aliasMap = buildModuleAliasMap(modules);
  const seenEdges = new Set;
  const edges = [];
  const yieldState = createYieldState();
  for (const module of modules) {
    await maybeYieldToEventLoop(yieldState);
    for (const imported of module.imports) {
      const targetPath = resolveImportToModulePath({
        aliasMap,
        importerPath: module.relativePath,
        specifier: imported
      });
      if (!targetPath || targetPath === module.relativePath) {
        continue;
      }
      const edgeKey = `${module.relativePath}
${targetPath}`;
      if (seenEdges.has(edgeKey)) {
        continue;
      }
      seenEdges.add(edgeKey);
      edges.push({
        sourcePath: module.relativePath,
        targetPath
      });
    }
  }
  return edges.sort((left, right) => {
    const sourceCompare = left.sourcePath.localeCompare(right.sourcePath);
    if (sourceCompare !== 0) {
      return sourceCompare;
    }
    return left.targetPath.localeCompare(right.targetPath);
  });
}
function escapeDotLabel(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, " ").replace(/\r/g, "");
}
async function renderArchitectureDot(modules) {
  const edges = await buildFileDependencyEdges(modules);
  const nodePaths = [...new Set(edges.flatMap((edge) => [edge.sourcePath, edge.targetPath]))].sort((left, right) => left.localeCompare(right));
  const nodeIds = new Map;
  const lines = ["digraph{"];
  for (const [index, nodePath] of nodePaths.entries()) {
    const nodeId = `n${index.toString(36)}`;
    nodeIds.set(nodePath, nodeId);
    lines.push(`${nodeId}[label="${escapeDotLabel(nodePath)}"]`);
  }
  for (const edge of edges) {
    const sourceId = nodeIds.get(edge.sourcePath);
    const targetId = nodeIds.get(edge.targetPath);
    if (!sourceId || !targetId) {
      continue;
    }
    lines.push(`${sourceId}->${targetId}`);
  }
  lines.push("}");
  return lines.join(`
`) + `
`;
}
async function writeIndexFiles(args) {
  const indexDir = join5(args.outputDir, "index");
  await mkdir3(indexDir, { recursive: true });
  const manifest = buildManifest(args);
  await writeFile3(join5(indexDir, "manifest.json"), JSON.stringify(manifest, null, 2) + `
`, "utf8");
  const moduleLines = args.modules.map((module) => JSON.stringify({
    module_id: module.moduleId,
    path: module.relativePath,
    lang: module.language,
    imports_count: module.imports.length,
    classes_count: module.classes.length,
    functions_count: module.functions.length,
    methods_count: module.classes.reduce((count, cls) => count + cls.methods.length, 0),
    parse_mode: module.parseMode,
    truncated: module.truncated,
    notes: module.notes,
    errors: module.errors
  }));
  await writeFile3(join5(indexDir, "modules.jsonl"), moduleLines.join(`
`) + `
`, "utf8");
  const symbolLines = [];
  const yieldState = createYieldState();
  for (const module of args.modules) {
    await maybeYieldToEventLoop(yieldState);
    for (const cls of module.classes) {
      symbolLines.push(JSON.stringify({
        symbol_id: `${module.moduleId}::class:${cls.name}`,
        module_id: module.moduleId,
        kind: "class",
        qualified_name: cls.qualifiedName,
        signature: cls.bases.length > 0 ? `class ${cls.name}(${cls.bases.join(", ")})` : `class ${cls.name}`,
        source_lines: cls.sourceLines
      }));
      for (const method of cls.methods) {
        symbolLines.push(JSON.stringify({
          symbol_id: `${module.moduleId}::method:${cls.name}.${method.name}`,
          module_id: module.moduleId,
          kind: "method",
          qualified_name: method.qualifiedName,
          signature: renderFunctionSignature(method),
          source_lines: method.sourceLines
        }));
      }
    }
    for (const fn of module.functions) {
      symbolLines.push(JSON.stringify({
        symbol_id: `${module.moduleId}::function:${fn.name}`,
        module_id: module.moduleId,
        kind: "function",
        qualified_name: fn.qualifiedName,
        signature: renderFunctionSignature(fn),
        source_lines: fn.sourceLines
      }));
    }
  }
  await writeFile3(join5(indexDir, "symbols.jsonl"), symbolLines.join(`
`) + `
`, "utf8");
  const edgeLines = args.edges.map((edge) => JSON.stringify(edge));
  await writeFile3(join5(indexDir, "edges.jsonl"), edgeLines.join(`
`) + `
`, "utf8");
  await writeFile3(join5(indexDir, "summary.md"), renderSummary({
    edges: args.edges,
    manifest,
    modules: args.modules,
    outputDir: args.outputDir
  }), "utf8");
  await writeFile3(join5(indexDir, "architecture.dot"), await renderArchitectureDot(args.modules), "utf8");
  await writePythonIndex(args);
  return manifest;
}
function toSkeletonRelativePath(relativePath) {
  const parsed = parsePath(relativePath);
  return join5(parsed.dir, `${parsed.name}.py`).replaceAll("\\", "/");
}
function escapePythonString(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, " ").replace(/\r/g, "");
}
function isMinifiedSymbol(name) {
  if (/^[$_]\d+$/.test(name))
    return true;
  if (/^[$_][a-zA-Z]\d*$/.test(name) && name.length <= 3)
    return true;
  if (/^_[a-zA-Z]\d+$/.test(name) && name.length <= 4)
    return true;
  if (/^\$_/.test(name))
    return true;
  if (/^_temp\d*$/.test(name))
    return true;
  if (/^[A-Za-z_]\d{1,2}$/.test(name))
    return true;
  if (/^__\d+$/.test(name))
    return true;
  return false;
}
function isBundledModule(module) {
  return module.relativePath === "cli.js" || module.relativePath === "cli.ts";
}
function computeCallFrequency(edges, modules) {
  const bundledFiles = new Set(modules.filter(isBundledModule).map((m) => m.relativePath));
  const freq = new Map;
  for (const edge of edges) {
    if (edge.kind !== "calls")
      continue;
    if (bundledFiles.has(edge.sourceFile))
      continue;
    const count = freq.get(edge.target) ?? 0;
    freq.set(edge.target, count + 1);
  }
  return freq;
}
function detectEntryPoints(modules) {
  const entryPoints = [];
  const seen = new Set;
  const entryPatterns = [
    { pattern: /^src\/main\.tsx?$/, name: "CLI_MAIN", desc: "Primary CLI entry point" },
    { pattern: /^src\/entrypoints\/cli\.tsx?$/, name: "CLI_BOOTSTRAP", desc: "CLI bootstrap wrapper" },
    { pattern: /^src\/entrypoints\/mcp\.tsx?$/, name: "MCP_SERVER", desc: "MCP server mode" },
    { pattern: /^src\/entrypoints\/init\.tsx?$/, name: "CLI_INIT", desc: "CLI initialization side-effects" },
    { pattern: /^src\/query\.tsx?$/, name: "QUERY_ENGINE", desc: "Core query execution engine" },
    { pattern: /^src\/QueryEngine\.tsx?$/, name: "QUERY_ORCHESTRATOR", desc: "Higher-level query orchestrator" },
    { pattern: /^src\/tools\.tsx?$/, name: "TOOL_REGISTRY", desc: "Tool definition registry" },
    { pattern: /^src\/commands\.tsx?$/, name: "COMMAND_REGISTRY", desc: "Slash command registry" },
    { pattern: /^src\/tasks\.tsx?$/, name: "TASK_REGISTRY", desc: "Task type registry" },
    { pattern: /^src\/Task\.tsx?$/, name: "TASK_TYPES", desc: "Core task type system" },
    { pattern: /^src\/Tool\.tsx?$/, name: "TOOL_TYPES", desc: "Tool type system and interfaces" },
    { pattern: /^src\/state\/AppStateStore\.tsx?$/, name: "APP_STATE", desc: "Canonical application state definition" },
    { pattern: /^src\/context\.tsx?$/, name: "CONTEXT_BUILDERS", desc: "System/user context builders" },
    { pattern: /^src\/cost-tracker\.tsx?$/, name: "COST_TRACKER", desc: "Cost/token tracking" },
    { pattern: /^src\/setup\.tsx?$/, name: "SESSION_SETUP", desc: "Session setup and worktree creation" }
  ];
  for (const module of modules) {
    for (const ep of entryPatterns) {
      if (ep.pattern.test(module.relativePath) && !seen.has(ep.name)) {
        seen.add(ep.name);
        entryPoints.push({
          name: ep.name,
          path: `skeleton/${toSkeletonRelativePath(module.relativePath)}`,
          description: ep.desc
        });
      }
    }
  }
  return entryPoints;
}
async function writePythonIndex(args) {
  const { modules, edges, outputDir } = args;
  const callFreq = computeCallFrequency(edges, modules);
  const entryPoints = detectEntryPoints(modules);
  const dirCounts = new Map;
  for (const module of modules) {
    const parsed = parsePath(module.relativePath);
    const dir = parsed.dir || ".";
    dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
  }
  const topDirs = [...dirCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  const BUILTIN_FILTER = new Set([
    "join",
    "Error",
    "map",
    "filter",
    "async",
    "trim",
    "test",
    "String",
    "Date",
    "Set",
    "includes",
    "parseInt",
    "resolve",
    "slice",
    "replace",
    "split",
    "concat",
    "push",
    "pop",
    "shift",
    "unshift",
    "forEach",
    "reduce",
    "find",
    "some",
    "every",
    "indexOf",
    "match",
    "exec",
    "toString",
    "valueOf",
    "hasOwnProperty",
    "constructor",
    "prototype",
    "apply",
    "call",
    "bind"
  ]);
  const topCalled = [...callFreq.entries()].filter(([symbol]) => !isMinifiedSymbol(symbol)).filter(([symbol]) => !BUILTIN_FILTER.has(symbol)).sort((a, b) => b[1] - a[1]).slice(0, 30);
  const lines = [];
  lines.push("# __index__.py  (auto-generated navigation bus)");
  lines.push("# ════════════════════════════════════════════════════════════════");
  lines.push("# PROJECT LOGIC INDEX — compact navigation layer");
  lines.push("#");
  lines.push("# For full data see:");
  lines.push("#   index/symbols.jsonl   — all symbols with signatures");
  lines.push("#   index/modules.jsonl   — module metadata & classes");
  lines.push("#   index/summary.md      — human-readable overview");
  lines.push("# ════════════════════════════════════════════════════════════════");
  lines.push("from __future__ import annotations");
  lines.push("from typing import Dict, List");
  lines.push("");
  lines.push("# ── 1. Entry Points ─────────────────────────────────────────────");
  lines.push("# Named entry points: CLI, MCP, query engine, tool/command registries.");
  lines.push("");
  lines.push("ENTRY_POINTS: Dict[str, str] = {");
  for (const ep of entryPoints) {
    const escapedPath = escapePythonString(ep.path);
    lines.push(`    '${ep.name}': '${escapedPath}',  # ${ep.description}`);
  }
  lines.push("}");
  lines.push("");
  lines.push("# ── 2. Top Directories (by module count) ─────────────────────────");
  lines.push("# Quick map of where the bulk of code lives.");
  lines.push("");
  lines.push("TOP_DIRECTORIES: Dict[str, int] = {");
  for (const [dir, count] of topDirs) {
    const escapedDir = escapePythonString(dir);
    lines.push(`    '${escapedDir}': ${count},`);
  }
  lines.push("}");
  lines.push("");
  lines.push("# ── 3. High-Priority Symbols (by call frequency) ────────────────");
  lines.push("# Project-specific symbols called most frequently — core building blocks.");
  lines.push("");
  lines.push("HIGH_PRIORITY_SYMBOLS: Dict[str, int] = {");
  for (const [symbol, count] of topCalled) {
    const escaped = escapePythonString(symbol);
    lines.push(`    '${escaped}': ${count},`);
  }
  lines.push("}");
  lines.push("");
  lines.push("# ── 4. Navigation Helpers ────────────────────────────────────────");
  lines.push("# Convenience functions for AI-assisted code navigation.");
  lines.push("# All read from local state; no filesystem access needed.");
  lines.push("");
  lines.push("_ENTRY: Dict[str, str] = ENTRY_POINTS");
  lines.push("_TOP_DIRS: Dict[str, int] = TOP_DIRECTORIES");
  lines.push("_HOT: Dict[str, int] = HIGH_PRIORITY_SYMBOLS");
  lines.push("");
  lines.push("");
  lines.push("def entry_point(name: str) -> str:");
  lines.push('    """Return the skeleton path for a named entry point."""');
  lines.push('    return _ENTRY.get(name, f"Unknown entry point: {name}")');
  lines.push("");
  lines.push("");
  lines.push("def hot_symbols(n: int = 10) -> List[str]:");
  lines.push('    """Return the top-N most-called project symbols."""');
  lines.push("    return list(_HOT)[:n]");
  lines.push("");
  lines.push("");
  lines.push("def module_count(dir_path: str) -> int:");
  lines.push('    """Return the number of modules in a source directory."""');
  lines.push("    return _TOP_DIRS.get(dir_path, 0)");
  lines.push("");
  lines.push("");
  lines.push("def directory_overview() -> Dict[str, int]:");
  lines.push('    """Return all top directories with their module counts."""');
  lines.push("    return dict(_TOP_DIRS)");
  lines.push("");
  const content = lines.join(`
`);
  await writeFile3(join5(outputDir, "__index__.py"), content, "utf8");
}

// src/indexing/skillWriter.ts
import { mkdir as mkdir4, rm as rm2, writeFile as writeFile4 } from "fs/promises";
import { join as join6, relative as relative2 } from "path";
function resolveCodeIndexSkillPaths(args) {
  return {
    claude: join6(args.rootDir, ".claude", "skills", "code-index", "SKILL.md"),
    codex: join6(args.rootDir, ".codex", "skills", "code-index", "SKILL.md"),
    opencode: join6(args.rootDir, ".opencode", "skills", "code-index", "SKILL.md")
  };
}
function toPosixPath2(value) {
  return value.replaceAll("\\", "/");
}
function formatProjectPath(rootDir, targetPath) {
  const relativePath = toPosixPath2(relative2(rootDir, targetPath));
  if (!relativePath) {
    return ".";
  }
  if (relativePath === ".." || relativePath.startsWith("../") || relativePath.startsWith("/")) {
    return toPosixPath2(targetPath);
  }
  return `./${relativePath}`;
}
function formatFrontmatterValue(value) {
  return JSON.stringify(value);
}
function renderSkillMarkdown(args) {
  const outputPath = formatProjectPath(args.rootDir, args.outputDir);
  const architecturePath = `${outputPath}/index/architecture.dot`;
  const summaryPath = `${outputPath}/index/summary.md`;
  const skeletonPath = `${outputPath}/skeleton`;
  const indexPath = `${outputPath}/__index__.py`;
  const modulesPath = `${outputPath}/index/modules.jsonl`;
  const symbolsPath = `${outputPath}/index/symbols.jsonl`;
  return [
    "---",
    `name: ${formatFrontmatterValue(args.name)}`,
    `description: ${formatFrontmatterValue(args.description)}`,
    `when_to_use: ${formatFrontmatterValue(args.whenToUse)}`,
    "---",
    "",
    "# Code Index",
    "",
    "## Instructions",
    `- This is a blocking first step whenever \`${outputPath}/\` already exists and you need repository structure, dependency tracing, symbol lookup, or implementation-file discovery.`,
    `- Start with \`${architecturePath}\` for the smallest file-level dependency map. Outgoing edges show what a file depends on; incoming edges show likely impact.`,
    `- Then use \`${indexPath}\` for entry points, top directories, and high-priority symbols.`,
    `- Read \`${summaryPath}\` for a human-readable overview.`,
    `- Browse \`${skeletonPath}/\` when you need method-level detail; skeleton functions include concise stub calls instead of full method bodies.`,
    "- Treat the code index and skeleton as a code map only. After they identify candidate files, read the original source before asserting implementation details, quoting behavior, or editing code.",
    `- Use \`${modulesPath}\` and \`${symbolsPath}\` only when you need exact module or symbol-level detail.`,
    "- In large repositories, you must use this index before broad repo-wide Grep/Glob scans or raw source-file sweeps until the index proves stale or the needed detail is missing.",
    "- If a file is missing from the DOT, no internal file-level dependency edge was resolved for it; jump straight to the skeleton or JSON index.",
    "- The skeleton is valid Python with lightweight call stubs, inheritance, and constructor assignments for easier grep and AST-based lookup.",
    "- The skeleton is not the source of truth for exact logic, syntax, comments, formatting, or language-specific edge cases; confirm against the original files before making precise code claims.",
    "- Only fall back to full source-file reads when the index is stale, missing, or insufficient for the question at hand.",
    "- If the index is stale after edits, rerun `/index`.",
    ""
  ].join(`
`);
}
async function writeCodeIndexSkills(args) {
  const paths = resolveCodeIndexSkillPaths({
    rootDir: args.rootDir
  });
  await rm2(join6(args.rootDir, ".claude", "code_index"), {
    recursive: true,
    force: true
  });
  await rm2(join6(args.rootDir, ".agent", "codex_index"), {
    recursive: true,
    force: true
  });
  await mkdir4(join6(args.rootDir, ".claude", "skills", "code-index"), {
    recursive: true
  });
  await mkdir4(join6(args.rootDir, ".codex", "skills", "code-index"), {
    recursive: true
  });
  await mkdir4(join6(args.rootDir, ".opencode", "skills", "code-index"), {
    recursive: true
  });
  const claudeDescription = `Use the generated code index under ${formatProjectPath(args.rootDir, args.outputDir)} as a code map to inspect repo structure, follow imports or calls, and narrow source reads before touching implementation files.`;
  const codexDescription = `Use the generated code index under ${formatProjectPath(args.rootDir, args.outputDir)} as a code map to inspect repo structure, follow imports or calls, and narrow source reads before editing implementation files.`;
  const opencodeDescription = `Use the generated code index under ${formatProjectPath(args.rootDir, args.outputDir)} as a code map to inspect repo structure, navigate entry points, and find implementation files.`;
  const whenToUse = "Use this as a blocking first step when a code index already exists and the task involves repository analysis, architecture tracing, symbol lookup, dependency follow-up, or locating implementation files. In large repos, use it before broad Grep/Glob scans or repo-wide source reads unless the index is stale or missing.";
  await writeFile4(paths.claude, renderSkillMarkdown({
    name: "code-index",
    description: claudeDescription,
    rootDir: args.rootDir,
    outputDir: args.outputDir,
    whenToUse
  }), "utf8");
  await writeFile4(paths.codex, renderSkillMarkdown({
    name: "code-index",
    description: codexDescription,
    rootDir: args.rootDir,
    outputDir: args.outputDir,
    whenToUse
  }), "utf8");
  await writeFile4(paths.opencode, renderSkillMarkdown({
    name: "code-index",
    description: opencodeDescription,
    rootDir: args.rootDir,
    outputDir: args.outputDir,
    whenToUse
  }), "utf8");
  return paths;
}

// src/indexing/build.ts
var PARSE_PROGRESS_INTERVAL = 32;
var PARSE_PROGRESS_INTERVAL_MS = 250;
async function reportProgress(callback, progress) {
  await callback?.(progress);
}
function createParseProgressReporter(args) {
  let completed = 0;
  let lastReportedCompleted = -1;
  let lastReportedAt = 0;
  const emit = async (force = false) => {
    if (!args.onProgress) {
      return;
    }
    const now = Date.now();
    if (!force && completed !== args.total && completed - lastReportedCompleted < PARSE_PROGRESS_INTERVAL && now - lastReportedAt < PARSE_PROGRESS_INTERVAL_MS) {
      return;
    }
    lastReportedCompleted = completed;
    lastReportedAt = now;
    await args.onProgress({
      phase: "parse",
      message: args.total === 0 ? `Parse complete: reused ${args.reusedFiles} cached files${args.removedFiles > 0 ? `, removed ${args.removedFiles}` : ""}` : `Parsing ${completed}/${args.total} changed files (reused ${args.reusedFiles}${args.removedFiles > 0 ? `, removed ${args.removedFiles}` : ""})`,
      completed,
      total: args.total
    });
  };
  return {
    async increment() {
      completed++;
      await emit();
    },
    async reset() {
      completed = 0;
      lastReportedCompleted = -1;
      lastReportedAt = 0;
      await emit(true);
    },
    async start() {
      await emit(true);
    },
    async finish() {
      completed = args.total;
      await emit(true);
    }
  };
}
async function prepareOutputDirectory(outputDir) {
  await mkdir5(outputDir, { recursive: true });
  await mkdir5(join7(outputDir, "skeleton"), { recursive: true });
  await mkdir5(join7(outputDir, "index"), { recursive: true });
}
async function parseModuleWithBuiltin(args) {
  return parseModuleWithBuiltinParsers({
    file: args.file,
    maxFileBytes: args.config.maxFileBytes
  });
}
async function parseFilesSequentially(args) {
  for (const entry of args.entries) {
    await maybeYieldToEventLoop(args.yieldState);
    args.modules[entry.index] = await args.parse({
      config: args.config,
      file: entry.file
    });
    await args.onParsed?.();
  }
}
async function parseFiles(args) {
  const entries = args.files.map((file, index) => ({
    file,
    index
  }));
  const modules = new Array(entries.length);
  const fingerprints = new Map;
  const cache = await loadModuleCache({
    engine: args.engine,
    maxFileBytes: args.config.maxFileBytes,
    outputDir: args.config.outputDir,
    rootDir: args.config.rootDir
  });
  const entriesToParse = [];
  const cacheYieldState = createYieldState();
  const previousModulesByPath = new Map([...cache.entries()].map(([relativePath, record]) => [
    relativePath,
    record.module
  ]));
  const currentModulePaths = new Set(entries.map((entry) => entry.file.relativePath));
  const removedModulePaths = new Set;
  for (const relativePath of cache.keys()) {
    if (!currentModulePaths.has(relativePath)) {
      removedModulePaths.add(relativePath);
    }
  }
  for (const entry of entries) {
    await maybeYieldToEventLoop(cacheYieldState);
    const fingerprint = await fingerprintSourceFile(entry.file.absolutePath);
    if (fingerprint) {
      fingerprints.set(entry.file.relativePath, fingerprint);
    }
    const cached = cache.get(entry.file.relativePath);
    if (fingerprint && cached && fingerprintsEqual(fingerprint, cached.fingerprint)) {
      modules[entry.index] = cached.module;
      continue;
    }
    entriesToParse.push(entry);
  }
  const incremental = {
    cacheHits: entries.length - entriesToParse.length,
    cacheMisses: entriesToParse.length,
    removedFiles: removedModulePaths.size
  };
  const parseProgress = createParseProgressReporter({
    onProgress: args.config.onProgress,
    removedFiles: incremental.removedFiles,
    reusedFiles: incremental.cacheHits,
    total: incremental.cacheMisses
  });
  const changedModulePaths = new Set(entriesToParse.map((entry) => entry.file.relativePath));
  if (entriesToParse.length === 0) {
    await parseProgress.start();
    await persistModuleCache({
      config: args.config,
      engine: args.engine,
      entries,
      fingerprints,
      modules
    });
    return {
      changedModulePaths,
      incremental,
      modules,
      parseWorkers: 0,
      previousModulesByPath,
      removedModulePaths
    };
  }
  if (args.config.parseWorkers <= 1 || entriesToParse.length <= 1) {
    await parseProgress.start();
    await parseFilesSequentially({
      config: args.config,
      entries: entriesToParse,
      modules,
      onParsed: () => parseProgress.increment(),
      parse: args.parse,
      yieldState: createYieldState()
    });
    await parseProgress.finish();
    await persistModuleCache({
      config: args.config,
      engine: args.engine,
      entries,
      fingerprints,
      modules
    });
    return {
      changedModulePaths,
      incremental,
      modules,
      parseWorkers: 1,
      previousModulesByPath,
      removedModulePaths
    };
  }
  const workerCount = Math.min(args.config.parseWorkers, entriesToParse.length);
  try {
    await parseProgress.start();
    const workerModules = await parseModulesWithWorkerPool({
      files: entriesToParse.map((entry) => entry.file),
      maxFileBytes: args.config.maxFileBytes,
      onParsed: () => parseProgress.increment(),
      workerCount
    });
    for (const [index, module] of workerModules.entries()) {
      modules[entriesToParse[index].index] = module;
    }
    await parseProgress.finish();
    await persistModuleCache({
      config: args.config,
      engine: args.engine,
      entries,
      fingerprints,
      modules
    });
    return {
      changedModulePaths,
      incremental,
      modules,
      parseWorkers: workerCount,
      previousModulesByPath,
      removedModulePaths
    };
  } catch {
    await parseProgress.reset();
    await parseFilesSequentially({
      config: args.config,
      entries: entriesToParse,
      modules,
      onParsed: () => parseProgress.increment(),
      parse: args.parse,
      yieldState: createYieldState()
    });
    await parseProgress.finish();
    await persistModuleCache({
      config: args.config,
      engine: args.engine,
      entries,
      fingerprints,
      modules
    });
    return {
      changedModulePaths,
      incremental,
      modules,
      parseWorkers: 1,
      previousModulesByPath,
      removedModulePaths
    };
  }
}
async function persistModuleCache(args) {
  try {
    await writeModuleCache({
      engine: args.engine,
      maxFileBytes: args.config.maxFileBytes,
      outputDir: args.config.outputDir,
      rootDir: args.config.rootDir,
      entries: args.entries.map((entry) => {
        const fingerprint = args.fingerprints.get(entry.file.relativePath);
        const module = args.modules[entry.index];
        if (!fingerprint || !module) {
          return null;
        }
        return {
          relativePath: entry.file.relativePath,
          fingerprint,
          module
        };
      }).filter((value) => Boolean(value))
    });
  } catch {}
}
function resolveCodeIndexArtifactPaths(outputDir) {
  const indexDir = join7(outputDir, "index");
  return {
    architectureDot: join7(indexDir, "architecture.dot"),
    edgesJsonl: join7(indexDir, "edges.jsonl"),
    manifestJson: join7(indexDir, "manifest.json"),
    modulesJsonl: join7(indexDir, "modules.jsonl"),
    pythonIndex: join7(outputDir, "__index__.py"),
    summaryMd: join7(indexDir, "summary.md"),
    symbolsJsonl: join7(indexDir, "symbols.jsonl")
  };
}
async function pathExists2(path3) {
  try {
    await stat4(path3);
    return true;
  } catch {
    return false;
  }
}
async function readPreviousManifest(outputDir) {
  try {
    const raw = await readFile3(resolveCodeIndexArtifactPaths(outputDir).manifestJson, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function reusePreviousOutputsIfUnchanged(args) {
  if (args.incremental.cacheMisses > 0 || args.incremental.removedFiles > 0) {
    return null;
  }
  const manifest = await readPreviousManifest(args.config.outputDir);
  if (!manifest) {
    return null;
  }
  if (manifest.artifactVersion !== CODE_INDEX_ARTIFACT_VERSION || manifest.rootDir !== args.config.rootDir || manifest.outputDir !== args.config.outputDir || manifest.fileLimit !== args.config.maxFiles || manifest.fileLimitReached !== args.fileLimitReached || manifest.moduleCount !== args.modules.length) {
    return null;
  }
  const artifactPaths = resolveCodeIndexArtifactPaths(args.config.outputDir);
  const requiredPaths = [
    artifactPaths.architectureDot,
    artifactPaths.edgesJsonl,
    artifactPaths.manifestJson,
    artifactPaths.modulesJsonl,
    artifactPaths.pythonIndex,
    artifactPaths.summaryMd,
    artifactPaths.symbolsJsonl
  ];
  for (const requiredPath of requiredPaths) {
    if (!await pathExists2(requiredPath)) {
      return null;
    }
  }
  return {
    manifest
  };
}
async function buildCodeIndex(options = {}) {
  return buildCodeIndexWithDiscovery(options, {
    discover: discoverSourceFiles,
    engine: "typescript",
    parse: parseModuleWithBuiltin
  });
}
async function buildCodeIndexWithDiscovery(options, args) {
  const totalStartedAt = performance.now();
  const config = resolveCodeIndexConfig(options);
  await prepareOutputDirectory(config.outputDir);
  await reportProgress(config.onProgress, {
    phase: "discover",
    message: `Scanning ${config.rootDir} for source files`
  });
  const discoverStartedAt = performance.now();
  const discovery = await args.discover(config);
  const discoverMs = performance.now() - discoverStartedAt;
  const files = discovery.files;
  await reportProgress(config.onProgress, {
    phase: "discover",
    message: `Found ${files.length} source files`,
    completed: files.length,
    total: files.length
  });
  const parseStartedAt = performance.now();
  const parsed = await parseFiles({
    config,
    engine: args.engine,
    files,
    parse: args.parse
  });
  const parseMs = performance.now() - parseStartedAt;
  const modules = parsed.modules;
  const emitSkeletonStartedAt = performance.now();
  await emitSkeletonTree({
    modules,
    outputDir: config.outputDir,
    changedModulePaths: parsed.changedModulePaths,
    onProgress: config.onProgress,
    previousModulesByPath: parsed.previousModulesByPath
  });
  const emitSkeletonMs = performance.now() - emitSkeletonStartedAt;
  const reusedOutputs = await reusePreviousOutputsIfUnchanged({
    config,
    fileLimitReached: discovery.fileLimitReached,
    incremental: parsed.incremental,
    modules
  });
  let buildEdgesMs = 0;
  let writeIndexFilesMs = 0;
  let writeSkillsMs = 0;
  let manifest;
  let skillPaths;
  if (reusedOutputs) {
    manifest = reusedOutputs.manifest;
  } else {
    await reportProgress(config.onProgress, {
      phase: "edges",
      message: `Building dependency edges for ${modules.length} modules`,
      completed: modules.length,
      total: modules.length
    });
    const buildEdgesStartedAt = performance.now();
    const edges = await buildEdges(modules);
    buildEdgesMs = performance.now() - buildEdgesStartedAt;
    await reportProgress(config.onProgress, {
      phase: "write",
      message: `Writing code index artifacts`,
      completed: modules.length,
      total: modules.length
    });
    const writeIndexFilesStartedAt = performance.now();
    manifest = await writeIndexFiles({
      edges,
      fileLimitReached: discovery.fileLimitReached,
      maxFiles: config.maxFiles,
      modules,
      outputDir: config.outputDir,
      rootDir: config.rootDir
    });
    writeIndexFilesMs = performance.now() - writeIndexFilesStartedAt;
  }
  await reportProgress(config.onProgress, {
    phase: "skills",
    message: `Refreshing code-index skills`
  });
  const writeSkillsStartedAt = performance.now();
  skillPaths = await writeCodeIndexSkills({
    outputDir: config.outputDir,
    rootDir: config.rootDir
  });
  writeSkillsMs = performance.now() - writeSkillsStartedAt;
  const totalMs = performance.now() - totalStartedAt;
  await reportProgress(config.onProgress, {
    phase: "complete",
    message: `Code index ready in ${Math.round(totalMs)}ms`,
    completed: manifest.moduleCount,
    total: manifest.moduleCount
  });
  return {
    engine: args.engine,
    fileLimitReached: discovery.fileLimitReached,
    incremental: parsed.incremental,
    maxFiles: config.maxFiles,
    manifest,
    outputDir: config.outputDir,
    parseWorkers: parsed.parseWorkers,
    rootDir: config.rootDir,
    skillPaths,
    timings: {
      buildEdgesMs,
      discoverMs,
      emitSkeletonMs,
      parseMs,
      totalMs,
      writeIndexFilesMs,
      writeSkillsMs
    }
  };
}

// src/commands/index/args.ts
function tokenizeIndexArgs(input) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaping = false;
  for (const char of input.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}
function parseIndexArgs(input) {
  const tokens = tokenizeIndexArgs(input);
  if (tokens[0] === "build") {
    tokens.shift();
  }
  let rootDir = ".";
  const ignoredDirNames = [];
  let maxFiles;
  let outputDir;
  let maxFileBytes;
  let workers;
  for (let index = 0;index < tokens.length; index++) {
    const token = tokens[index] ?? "";
    if (token === "--help" || token === "-h") {
      return { kind: "help" };
    }
    if (token.startsWith("--output=")) {
      outputDir = token.slice("--output=".length);
      if (!outputDir) {
        return {
          kind: "error",
          message: "Missing value for --output."
        };
      }
      continue;
    }
    if (token === "--output" || token === "-o") {
      outputDir = tokens[index + 1];
      if (!outputDir) {
        return {
          kind: "error",
          message: "Missing value for --output."
        };
      }
      index++;
      continue;
    }
    if (token.startsWith("--max-file-bytes=")) {
      const rawValue = token.slice("--max-file-bytes=".length);
      const parsed = Number.parseInt(rawValue, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return {
          kind: "error",
          message: `Invalid --max-file-bytes value: ${rawValue}`
        };
      }
      maxFileBytes = parsed;
      continue;
    }
    if (token === "--max-file-bytes") {
      const rawValue = tokens[index + 1];
      const parsed = Number.parseInt(rawValue ?? "", 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return {
          kind: "error",
          message: `Invalid --max-file-bytes value: ${rawValue ?? ""}`
        };
      }
      maxFileBytes = parsed;
      index++;
      continue;
    }
    if (token.startsWith("--max-files=")) {
      const rawValue = token.slice("--max-files=".length);
      const parsed = Number.parseInt(rawValue, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return {
          kind: "error",
          message: `Invalid --max-files value: ${rawValue}`
        };
      }
      maxFiles = parsed;
      continue;
    }
    if (token === "--max-files") {
      const rawValue = tokens[index + 1];
      const parsed = Number.parseInt(rawValue ?? "", 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return {
          kind: "error",
          message: `Invalid --max-files value: ${rawValue ?? ""}`
        };
      }
      maxFiles = parsed;
      index++;
      continue;
    }
    if (token.startsWith("--workers=")) {
      const rawValue = token.slice("--workers=".length);
      const parsed = Number.parseInt(rawValue, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return {
          kind: "error",
          message: `Invalid --workers value: ${rawValue}`
        };
      }
      workers = parsed;
      continue;
    }
    if (token === "--workers") {
      const rawValue = tokens[index + 1];
      const parsed = Number.parseInt(rawValue ?? "", 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return {
          kind: "error",
          message: `Invalid --workers value: ${rawValue ?? ""}`
        };
      }
      workers = parsed;
      index++;
      continue;
    }
    if (token.startsWith("--ignore-dir=")) {
      const ignoredDir = token.slice("--ignore-dir=".length).trim();
      if (!ignoredDir) {
        return {
          kind: "error",
          message: "Missing value for --ignore-dir."
        };
      }
      ignoredDirNames.push(ignoredDir);
      continue;
    }
    if (token === "--ignore-dir") {
      const ignoredDir = tokens[index + 1]?.trim();
      if (!ignoredDir) {
        return {
          kind: "error",
          message: "Missing value for --ignore-dir."
        };
      }
      ignoredDirNames.push(ignoredDir);
      index++;
      continue;
    }
    if (token.startsWith("-")) {
      return { kind: "error", message: `Unknown flag: ${token}` };
    }
    if (rootDir !== ".") {
      return {
        kind: "error",
        message: "Only one path argument is supported."
      };
    }
    rootDir = token;
  }
  return {
    kind: "run",
    ignoredDirNames: ignoredDirNames.length > 0 ? ignoredDirNames : undefined,
    maxFiles,
    maxFileBytes,
    outputDir,
    rootDir,
    workers
  };
}

// src/commands/index/cliBundleEntry.ts
var USAGE2 = [
  "Usage: /index [path] [--output DIR] [--max-file-bytes N] [--max-files N] [--workers N] [--ignore-dir NAME]",
  "",
  "Examples:",
  "  /index",
  "  /index src",
  "  /index . --output .code_index",
  "  /index --max-file-bytes 1048576",
  "  /index . --workers 8",
  "  /index . --max-files 20000 --ignore-dir ThirdParty"
].join(`
`);
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
  const memoryBase = process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR ?? process.env.CLAUDE_CONFIG_DIR ?? join8(homedir(), ".claude");
  return join8(memoryBase, "projects", sanitizePath(getProjectRoot2()), "memory", PINNED_FACTS_FILENAME);
}
function toPosixPath3(value) {
  return value.replaceAll("\\", "/");
}
function formatProjectPath2(rootDir, targetPath) {
  const relativePath = toPosixPath3(relative3(rootDir, targetPath));
  if (!relativePath) {
    return ".";
  }
  if (relativePath === ".." || relativePath.startsWith("../") || relativePath.startsWith("/")) {
    return toPosixPath3(targetPath);
  }
  return `./${relativePath}`;
}
function getPinnedFactSkillPaths(rootDir = getProjectRoot2()) {
  return {
    claude: join8(rootDir, ".claude", "skills", PINNED_FACTS_SKILL_NAME, "SKILL.md"),
    codex: join8(rootDir, ".codex", "skills", PINNED_FACTS_SKILL_NAME, "SKILL.md")
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
  const memoryPath = formatProjectPath2(args.rootDir, args.pinnedFactsPath);
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
    const content = await readFile4(getPinnedFactsPath(), "utf8");
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
  await mkdir6(resolve3(path3, ".."), { recursive: true });
  await writeFile5(path3, renderPinnedFactsContent(facts), "utf8");
}
async function syncPinnedFactSkills(facts, path3) {
  const rootDir = getProjectRoot2();
  const skillPaths = getPinnedFactSkillPaths(rootDir);
  if (facts.length === 0) {
    await rm3(join8(rootDir, ".claude", "skills", PINNED_FACTS_SKILL_NAME), {
      recursive: true,
      force: true
    });
    await rm3(join8(rootDir, ".codex", "skills", PINNED_FACTS_SKILL_NAME), {
      recursive: true,
      force: true
    });
    return skillPaths;
  }
  await mkdir6(join8(rootDir, ".claude", "skills", PINNED_FACTS_SKILL_NAME), {
    recursive: true
  });
  await mkdir6(join8(rootDir, ".codex", "skills", PINNED_FACTS_SKILL_NAME), {
    recursive: true
  });
  await writeFile5(skillPaths.claude, renderPinnedFactsSkill({
    name: PINNED_FACTS_SKILL_NAME,
    description: "Use these project-pinned facts before rediscovering paths, tools, or other stable repository-specific details.",
    facts,
    pinnedFactsPath: path3,
    rootDir
  }), "utf8");
  await writeFile5(skillPaths.codex, renderPinnedFactsSkill({
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
function formatResult(args) {
  const { manifest, outputDir, rootDir, skillPaths, timings } = args.result;
  const languageSummary = Object.entries(manifest.languages).map(([language, count]) => `${language}: ${count}`).join(" | ");
  return [
    "Code index build complete.",
    `Engine: ${args.result.engine}`,
    `Workers: ${args.result.parseWorkers}`,
    `Incremental: reused ${args.result.incremental.cacheHits} | parsed ${args.result.incremental.cacheMisses}`,
    `Duration: ${formatDuration(timings.totalMs)}`,
    `Phases: discover ${formatDuration(timings.discoverMs)} | parse ${formatDuration(timings.parseMs)} | emit ${formatDuration(timings.emitSkeletonMs)} | edges ${formatDuration(timings.buildEdgesMs)} | write ${formatDuration(timings.writeIndexFilesMs)} | skills ${formatDuration(timings.writeSkillsMs)}`,
    `Root: ${rootDir}`,
    `Output: ${outputDir}`,
    `Modules: ${manifest.moduleCount}`,
    `Classes: ${manifest.classCount}`,
    `Functions: ${manifest.functionCount}`,
    `Methods: ${manifest.methodCount}`,
    `Edges: ${manifest.edgeCount}`,
    `File limit: ${manifest.fileLimit ?? "none"}${manifest.fileLimitReached ? " (reached)" : ""}`,
    `Truncated files: ${manifest.truncatedCount}`,
    `Languages: ${languageSummary || "none"}`,
    "",
    "Generated:",
    `- ${join8(outputDir, "index", "architecture.dot")}  (file-level dependency map)`,
    `- ${join8(outputDir, "__index__.py")}  (entry points, top dirs, hot symbols)`,
    `- ${join8(outputDir, "index", "summary.md")}`,
    `- ${join8(outputDir, "index", "manifest.json")}`,
    `- ${join8(outputDir, "skeleton")}`,
    `- ${skillPaths.claude}`,
    `- ${skillPaths.codex}`,
    `- ${skillPaths.opencode}`
  ].join(`
`);
}
function formatDuration(durationMs) {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }
  const seconds = durationMs / 1000;
  const precision = seconds >= 10 ? 1 : 2;
  return `${seconds.toFixed(precision)}s (${Math.round(durationMs)}ms)`;
}
async function indexCall(args) {
  const parsed = parseIndexArgs(args);
  if (parsed.kind === "help") {
    return {
      type: "text",
      value: USAGE2
    };
  }
  if (parsed.kind === "error") {
    return {
      type: "text",
      value: `${parsed.message}

${USAGE2}`
    };
  }
  const cwd2 = process.cwd();
  const rootDir = resolve3(cwd2, parsed.rootDir);
  const outputDir = parsed.outputDir ? resolve3(cwd2, parsed.outputDir) : resolve3(rootDir, ".code_index");
  try {
    const fileStat = await stat5(rootDir);
    if (!fileStat.isDirectory()) {
      return {
        type: "text",
        value: `Index root is not a directory: ${rootDir}`
      };
    }
  } catch (error) {
    return {
      type: "text",
      value: `Cannot access index root: ${errorMessage2(error)}`
    };
  }
  try {
    const result = await buildCodeIndex({
      ignoredDirNames: parsed.ignoredDirNames,
      maxFiles: parsed.maxFiles,
      rootDir,
      outputDir,
      maxFileBytes: parsed.maxFileBytes,
      workers: parsed.workers
    });
    return {
      type: "text",
      value: formatResult({ result })
    };
  } catch (error) {
    return {
      type: "text",
      value: `Code index build failed: ${errorMessage2(error)}`
    };
  }
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
var indexBuiltinCommand = {
  type: "local",
  name: "index",
  description: "Build a codebase structure index, file dependency DOT, and Python skeleton under .code_index",
  argumentHint: "[path] [--output DIR] [--max-file-bytes N] [--max-files N] [--ignore-dir NAME]",
  supportsNonInteractive: true,
  disableModelInvocation: true,
  load: async () => ({
    call: indexCall
  })
};
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
  indexBuiltinCommand,
  pinBuiltinCommand,
  unpinBuiltinCommand,
  compressBuiltinCommand,
  compressStatusBuiltinCommand
];
export {
  unpinBuiltinCommand,
  pinBuiltinCommand,
  indexBuiltinCommand,
  cliBundleEntry_default as default,
  compressStatusBuiltinCommand,
  compressBuiltinCommand
};
