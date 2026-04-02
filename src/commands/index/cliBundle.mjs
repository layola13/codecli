// src/commands/index/cliBundleEntry.ts
import { execFileSync } from "child_process";
import { mkdir as mkdir5, readFile as readFile2, rm as rm3, stat as stat2, writeFile as writeFile4 } from "fs/promises";
import { homedir } from "os";
import { join as join7, relative as relative3, resolve as resolve2 } from "path";

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

// node_modules/@anthropic-ai/sdk/internal/tslib.mjs
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m")
    throw new TypeError("Private method is not writable");
  if (kind === "a" && !f)
    throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
    throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f)
    throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
    throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}

// node_modules/@anthropic-ai/sdk/internal/utils/uuid.mjs
var uuid4 = function() {
  const { crypto } = globalThis;
  if (crypto?.randomUUID) {
    uuid4 = crypto.randomUUID.bind(crypto);
    return crypto.randomUUID();
  }
  const u8 = new Uint8Array(1);
  const randomByte = crypto ? () => crypto.getRandomValues(u8)[0] : () => Math.random() * 255 & 255;
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ randomByte() & 15 >> +c / 4).toString(16));
};

// node_modules/@anthropic-ai/sdk/internal/errors.mjs
function isAbortError(err) {
  return typeof err === "object" && err !== null && (("name" in err) && err.name === "AbortError" || ("message" in err) && String(err.message).includes("FetchRequestCanceledException"));
}
var castToError = (err) => {
  if (err instanceof Error)
    return err;
  if (typeof err === "object" && err !== null) {
    try {
      if (Object.prototype.toString.call(err) === "[object Error]") {
        const error = new Error(err.message, err.cause ? { cause: err.cause } : {});
        if (err.stack)
          error.stack = err.stack;
        if (err.cause && !error.cause)
          error.cause = err.cause;
        if (err.name)
          error.name = err.name;
        return error;
      }
    } catch {}
    try {
      return new Error(JSON.stringify(err));
    } catch {}
  }
  return new Error(err);
};

// node_modules/@anthropic-ai/sdk/core/error.mjs
class AnthropicError extends Error {
}

class APIError extends AnthropicError {
  constructor(status, error, message, headers, type) {
    super(`${APIError.makeMessage(status, error, message)}`);
    this.status = status;
    this.headers = headers;
    this.requestID = headers?.get("request-id");
    this.error = error;
    this.type = type ?? null;
  }
  static makeMessage(status, error, message) {
    const msg = error?.message ? typeof error.message === "string" ? error.message : JSON.stringify(error.message) : error ? JSON.stringify(error) : message;
    if (status && msg) {
      return `${status} ${msg}`;
    }
    if (status) {
      return `${status} status code (no body)`;
    }
    if (msg) {
      return msg;
    }
    return "(no status code or body)";
  }
  static generate(status, errorResponse, message, headers) {
    if (!status || !headers) {
      return new APIConnectionError({ message, cause: castToError(errorResponse) });
    }
    const error = errorResponse;
    const type = error?.["error"]?.["type"];
    if (status === 400) {
      return new BadRequestError(status, error, message, headers, type);
    }
    if (status === 401) {
      return new AuthenticationError(status, error, message, headers, type);
    }
    if (status === 403) {
      return new PermissionDeniedError(status, error, message, headers, type);
    }
    if (status === 404) {
      return new NotFoundError(status, error, message, headers, type);
    }
    if (status === 409) {
      return new ConflictError(status, error, message, headers, type);
    }
    if (status === 422) {
      return new UnprocessableEntityError(status, error, message, headers, type);
    }
    if (status === 429) {
      return new RateLimitError(status, error, message, headers, type);
    }
    if (status >= 500) {
      return new InternalServerError(status, error, message, headers, type);
    }
    return new APIError(status, error, message, headers, type);
  }
}

class APIUserAbortError extends APIError {
  constructor({ message } = {}) {
    super(undefined, undefined, message || "Request was aborted.", undefined);
  }
}

class APIConnectionError extends APIError {
  constructor({ message, cause }) {
    super(undefined, undefined, message || "Connection error.", undefined);
    if (cause)
      this.cause = cause;
  }
}

class APIConnectionTimeoutError extends APIConnectionError {
  constructor({ message } = {}) {
    super({ message: message ?? "Request timed out." });
  }
}

class BadRequestError extends APIError {
}

class AuthenticationError extends APIError {
}

class PermissionDeniedError extends APIError {
}

class NotFoundError extends APIError {
}

class ConflictError extends APIError {
}

class UnprocessableEntityError extends APIError {
}

class RateLimitError extends APIError {
}

class InternalServerError extends APIError {
}

// node_modules/@anthropic-ai/sdk/internal/utils/values.mjs
var startsWithSchemeRegexp = /^[a-z][a-z0-9+.-]*:/i;
var isAbsoluteURL = (url) => {
  return startsWithSchemeRegexp.test(url);
};
var isArray = (val) => (isArray = Array.isArray, isArray(val));
var isReadonlyArray = isArray;
function maybeObj(x) {
  if (typeof x !== "object") {
    return {};
  }
  return x ?? {};
}
function isEmptyObj(obj) {
  if (!obj)
    return true;
  for (const _k in obj)
    return false;
  return true;
}
function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
var validatePositiveInteger = (name, n) => {
  if (typeof n !== "number" || !Number.isInteger(n)) {
    throw new AnthropicError(`${name} must be an integer`);
  }
  if (n < 0) {
    throw new AnthropicError(`${name} must be a positive integer`);
  }
  return n;
};
var safeJSON = (text) => {
  try {
    return JSON.parse(text);
  } catch (err) {
    return;
  }
};

// node_modules/@anthropic-ai/sdk/internal/utils/sleep.mjs
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// node_modules/@anthropic-ai/sdk/version.mjs
var VERSION = "0.81.0";

// node_modules/@anthropic-ai/sdk/internal/detect-platform.mjs
var isRunningInBrowser = () => {
  return typeof window !== "undefined" && typeof window.document !== "undefined" && typeof navigator !== "undefined";
};
function getDetectedPlatform() {
  if (typeof Deno !== "undefined" && Deno.build != null) {
    return "deno";
  }
  if (typeof EdgeRuntime !== "undefined") {
    return "edge";
  }
  if (Object.prototype.toString.call(typeof globalThis.process !== "undefined" ? globalThis.process : 0) === "[object process]") {
    return "node";
  }
  return "unknown";
}
var getPlatformProperties = () => {
  const detectedPlatform = getDetectedPlatform();
  if (detectedPlatform === "deno") {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": normalizePlatform(Deno.build.os),
      "X-Stainless-Arch": normalizeArch(Deno.build.arch),
      "X-Stainless-Runtime": "deno",
      "X-Stainless-Runtime-Version": typeof Deno.version === "string" ? Deno.version : Deno.version?.deno ?? "unknown"
    };
  }
  if (typeof EdgeRuntime !== "undefined") {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": "Unknown",
      "X-Stainless-Arch": `other:${EdgeRuntime}`,
      "X-Stainless-Runtime": "edge",
      "X-Stainless-Runtime-Version": globalThis.process.version
    };
  }
  if (detectedPlatform === "node") {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": normalizePlatform(globalThis.process.platform ?? "unknown"),
      "X-Stainless-Arch": normalizeArch(globalThis.process.arch ?? "unknown"),
      "X-Stainless-Runtime": "node",
      "X-Stainless-Runtime-Version": globalThis.process.version ?? "unknown"
    };
  }
  const browserInfo = getBrowserInfo();
  if (browserInfo) {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": "Unknown",
      "X-Stainless-Arch": "unknown",
      "X-Stainless-Runtime": `browser:${browserInfo.browser}`,
      "X-Stainless-Runtime-Version": browserInfo.version
    };
  }
  return {
    "X-Stainless-Lang": "js",
    "X-Stainless-Package-Version": VERSION,
    "X-Stainless-OS": "Unknown",
    "X-Stainless-Arch": "unknown",
    "X-Stainless-Runtime": "unknown",
    "X-Stainless-Runtime-Version": "unknown"
  };
};
function getBrowserInfo() {
  if (typeof navigator === "undefined" || !navigator) {
    return null;
  }
  const browserPatterns = [
    { key: "edge", pattern: /Edge(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "ie", pattern: /MSIE(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "ie", pattern: /Trident(?:.*rv\:(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "chrome", pattern: /Chrome(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "firefox", pattern: /Firefox(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "safari", pattern: /(?:Version\W+(\d+)\.(\d+)(?:\.(\d+))?)?(?:\W+Mobile\S*)?\W+Safari/ }
  ];
  for (const { key, pattern } of browserPatterns) {
    const match = pattern.exec(navigator.userAgent);
    if (match) {
      const major = match[1] || 0;
      const minor = match[2] || 0;
      const patch = match[3] || 0;
      return { browser: key, version: `${major}.${minor}.${patch}` };
    }
  }
  return null;
}
var normalizeArch = (arch) => {
  if (arch === "x32")
    return "x32";
  if (arch === "x86_64" || arch === "x64")
    return "x64";
  if (arch === "arm")
    return "arm";
  if (arch === "aarch64" || arch === "arm64")
    return "arm64";
  if (arch)
    return `other:${arch}`;
  return "unknown";
};
var normalizePlatform = (platform) => {
  platform = platform.toLowerCase();
  if (platform.includes("ios"))
    return "iOS";
  if (platform === "android")
    return "Android";
  if (platform === "darwin")
    return "MacOS";
  if (platform === "win32")
    return "Windows";
  if (platform === "freebsd")
    return "FreeBSD";
  if (platform === "openbsd")
    return "OpenBSD";
  if (platform === "linux")
    return "Linux";
  if (platform)
    return `Other:${platform}`;
  return "Unknown";
};
var _platformHeaders;
var getPlatformHeaders = () => {
  return _platformHeaders ?? (_platformHeaders = getPlatformProperties());
};

// node_modules/@anthropic-ai/sdk/internal/shims.mjs
function getDefaultFetch() {
  if (typeof fetch !== "undefined") {
    return fetch;
  }
  throw new Error("`fetch` is not defined as a global; Either pass `fetch` to the client, `new Anthropic({ fetch })` or polyfill the global, `globalThis.fetch = fetch`");
}
function makeReadableStream(...args) {
  const ReadableStream = globalThis.ReadableStream;
  if (typeof ReadableStream === "undefined") {
    throw new Error("`ReadableStream` is not defined as a global; You will need to polyfill it, `globalThis.ReadableStream = ReadableStream`");
  }
  return new ReadableStream(...args);
}
function ReadableStreamFrom(iterable) {
  let iter = Symbol.asyncIterator in iterable ? iterable[Symbol.asyncIterator]() : iterable[Symbol.iterator]();
  return makeReadableStream({
    start() {},
    async pull(controller) {
      const { done, value } = await iter.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
    async cancel() {
      await iter.return?.();
    }
  });
}
function ReadableStreamToAsyncIterable(stream) {
  if (stream[Symbol.asyncIterator])
    return stream;
  const reader = stream.getReader();
  return {
    async next() {
      try {
        const result = await reader.read();
        if (result?.done)
          reader.releaseLock();
        return result;
      } catch (e) {
        reader.releaseLock();
        throw e;
      }
    },
    async return() {
      const cancelPromise = reader.cancel();
      reader.releaseLock();
      await cancelPromise;
      return { done: true, value: undefined };
    },
    [Symbol.asyncIterator]() {
      return this;
    }
  };
}
async function CancelReadableStream(stream) {
  if (stream === null || typeof stream !== "object")
    return;
  if (stream[Symbol.asyncIterator]) {
    await stream[Symbol.asyncIterator]().return?.();
    return;
  }
  const reader = stream.getReader();
  const cancelPromise = reader.cancel();
  reader.releaseLock();
  await cancelPromise;
}

// node_modules/@anthropic-ai/sdk/internal/request-options.mjs
var FallbackEncoder = ({ headers, body }) => {
  return {
    bodyHeaders: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  };
};

// node_modules/@anthropic-ai/sdk/internal/utils/query.mjs
function stringifyQuery(query) {
  return Object.entries(query).filter(([_, value]) => typeof value !== "undefined").map(([key, value]) => {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    }
    if (value === null) {
      return `${encodeURIComponent(key)}=`;
    }
    throw new AnthropicError(`Cannot stringify type ${typeof value}; Expected string, number, boolean, or null. If you need to pass nested query parameters, you can manually encode them, e.g. { query: { 'foo[key1]': value1, 'foo[key2]': value2 } }, and please open a GitHub issue requesting better support for your use case.`);
  }).join("&");
}

// node_modules/@anthropic-ai/sdk/internal/utils/bytes.mjs
function concatBytes(buffers) {
  let length = 0;
  for (const buffer of buffers) {
    length += buffer.length;
  }
  const output = new Uint8Array(length);
  let index = 0;
  for (const buffer of buffers) {
    output.set(buffer, index);
    index += buffer.length;
  }
  return output;
}
var encodeUTF8_;
function encodeUTF8(str) {
  let encoder;
  return (encodeUTF8_ ?? (encoder = new globalThis.TextEncoder, encodeUTF8_ = encoder.encode.bind(encoder)))(str);
}
var decodeUTF8_;
function decodeUTF8(bytes) {
  let decoder;
  return (decodeUTF8_ ?? (decoder = new globalThis.TextDecoder, decodeUTF8_ = decoder.decode.bind(decoder)))(bytes);
}

// node_modules/@anthropic-ai/sdk/internal/decoders/line.mjs
var _LineDecoder_buffer;
var _LineDecoder_carriageReturnIndex;

class LineDecoder {
  constructor() {
    _LineDecoder_buffer.set(this, undefined);
    _LineDecoder_carriageReturnIndex.set(this, undefined);
    __classPrivateFieldSet(this, _LineDecoder_buffer, new Uint8Array, "f");
    __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, null, "f");
  }
  decode(chunk) {
    if (chunk == null) {
      return [];
    }
    const binaryChunk = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : typeof chunk === "string" ? encodeUTF8(chunk) : chunk;
    __classPrivateFieldSet(this, _LineDecoder_buffer, concatBytes([__classPrivateFieldGet(this, _LineDecoder_buffer, "f"), binaryChunk]), "f");
    const lines = [];
    let patternIndex;
    while ((patternIndex = findNewlineIndex(__classPrivateFieldGet(this, _LineDecoder_buffer, "f"), __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f"))) != null) {
      if (patternIndex.carriage && __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") == null) {
        __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, patternIndex.index, "f");
        continue;
      }
      if (__classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") != null && (patternIndex.index !== __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") + 1 || patternIndex.carriage)) {
        lines.push(decodeUTF8(__classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(0, __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") - 1)));
        __classPrivateFieldSet(this, _LineDecoder_buffer, __classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(__classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f")), "f");
        __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, null, "f");
        continue;
      }
      const endIndex = __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") !== null ? patternIndex.preceding - 1 : patternIndex.preceding;
      const line = decodeUTF8(__classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(0, endIndex));
      lines.push(line);
      __classPrivateFieldSet(this, _LineDecoder_buffer, __classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(patternIndex.index), "f");
      __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, null, "f");
    }
    return lines;
  }
  flush() {
    if (!__classPrivateFieldGet(this, _LineDecoder_buffer, "f").length) {
      return [];
    }
    return this.decode(`
`);
  }
}
_LineDecoder_buffer = new WeakMap, _LineDecoder_carriageReturnIndex = new WeakMap;
LineDecoder.NEWLINE_CHARS = new Set([`
`, "\r"]);
LineDecoder.NEWLINE_REGEXP = /\r\n|[\n\r]/g;
function findNewlineIndex(buffer, startIndex) {
  const newline = 10;
  const carriage = 13;
  for (let i = startIndex ?? 0;i < buffer.length; i++) {
    if (buffer[i] === newline) {
      return { preceding: i, index: i + 1, carriage: false };
    }
    if (buffer[i] === carriage) {
      return { preceding: i, index: i + 1, carriage: true };
    }
  }
  return null;
}
function findDoubleNewlineIndex(buffer) {
  const newline = 10;
  const carriage = 13;
  for (let i = 0;i < buffer.length - 1; i++) {
    if (buffer[i] === newline && buffer[i + 1] === newline) {
      return i + 2;
    }
    if (buffer[i] === carriage && buffer[i + 1] === carriage) {
      return i + 2;
    }
    if (buffer[i] === carriage && buffer[i + 1] === newline && i + 3 < buffer.length && buffer[i + 2] === carriage && buffer[i + 3] === newline) {
      return i + 4;
    }
  }
  return -1;
}

// node_modules/@anthropic-ai/sdk/internal/utils/log.mjs
var levelNumbers = {
  off: 0,
  error: 200,
  warn: 300,
  info: 400,
  debug: 500
};
var parseLogLevel = (maybeLevel, sourceName, client) => {
  if (!maybeLevel) {
    return;
  }
  if (hasOwn(levelNumbers, maybeLevel)) {
    return maybeLevel;
  }
  loggerFor(client).warn(`${sourceName} was set to ${JSON.stringify(maybeLevel)}, expected one of ${JSON.stringify(Object.keys(levelNumbers))}`);
  return;
};
function noop() {}
function makeLogFn(fnLevel, logger, logLevel) {
  if (!logger || levelNumbers[fnLevel] > levelNumbers[logLevel]) {
    return noop;
  } else {
    return logger[fnLevel].bind(logger);
  }
}
var noopLogger = {
  error: noop,
  warn: noop,
  info: noop,
  debug: noop
};
var cachedLoggers = /* @__PURE__ */ new WeakMap;
function loggerFor(client) {
  const logger = client.logger;
  const logLevel = client.logLevel ?? "off";
  if (!logger) {
    return noopLogger;
  }
  const cachedLogger = cachedLoggers.get(logger);
  if (cachedLogger && cachedLogger[0] === logLevel) {
    return cachedLogger[1];
  }
  const levelLogger = {
    error: makeLogFn("error", logger, logLevel),
    warn: makeLogFn("warn", logger, logLevel),
    info: makeLogFn("info", logger, logLevel),
    debug: makeLogFn("debug", logger, logLevel)
  };
  cachedLoggers.set(logger, [logLevel, levelLogger]);
  return levelLogger;
}
var formatRequestDetails = (details) => {
  if (details.options) {
    details.options = { ...details.options };
    delete details.options["headers"];
  }
  if (details.headers) {
    details.headers = Object.fromEntries((details.headers instanceof Headers ? [...details.headers] : Object.entries(details.headers)).map(([name, value]) => [
      name,
      name.toLowerCase() === "x-api-key" || name.toLowerCase() === "authorization" || name.toLowerCase() === "cookie" || name.toLowerCase() === "set-cookie" ? "***" : value
    ]));
  }
  if ("retryOfRequestLogID" in details) {
    if (details.retryOfRequestLogID) {
      details.retryOf = details.retryOfRequestLogID;
    }
    delete details.retryOfRequestLogID;
  }
  return details;
};

// node_modules/@anthropic-ai/sdk/core/streaming.mjs
var _Stream_client;

class Stream {
  constructor(iterator, controller, client) {
    this.iterator = iterator;
    _Stream_client.set(this, undefined);
    this.controller = controller;
    __classPrivateFieldSet(this, _Stream_client, client, "f");
  }
  static fromSSEResponse(response, controller, client) {
    let consumed = false;
    const logger = client ? loggerFor(client) : console;
    async function* iterator() {
      if (consumed) {
        throw new AnthropicError("Cannot iterate over a consumed stream, use `.tee()` to split the stream.");
      }
      consumed = true;
      let done = false;
      try {
        for await (const sse of _iterSSEMessages(response, controller)) {
          if (sse.event === "completion") {
            try {
              yield JSON.parse(sse.data);
            } catch (e) {
              logger.error(`Could not parse message into JSON:`, sse.data);
              logger.error(`From chunk:`, sse.raw);
              throw e;
            }
          }
          if (sse.event === "message_start" || sse.event === "message_delta" || sse.event === "message_stop" || sse.event === "content_block_start" || sse.event === "content_block_delta" || sse.event === "content_block_stop") {
            try {
              yield JSON.parse(sse.data);
            } catch (e) {
              logger.error(`Could not parse message into JSON:`, sse.data);
              logger.error(`From chunk:`, sse.raw);
              throw e;
            }
          }
          if (sse.event === "ping") {
            continue;
          }
          if (sse.event === "error") {
            const body = safeJSON(sse.data) ?? sse.data;
            const type = body?.error?.type;
            throw new APIError(undefined, body, undefined, response.headers, type);
          }
        }
        done = true;
      } catch (e) {
        if (isAbortError(e))
          return;
        throw e;
      } finally {
        if (!done)
          controller.abort();
      }
    }
    return new Stream(iterator, controller, client);
  }
  static fromReadableStream(readableStream, controller, client) {
    let consumed = false;
    async function* iterLines() {
      const lineDecoder = new LineDecoder;
      const iter = ReadableStreamToAsyncIterable(readableStream);
      for await (const chunk of iter) {
        for (const line of lineDecoder.decode(chunk)) {
          yield line;
        }
      }
      for (const line of lineDecoder.flush()) {
        yield line;
      }
    }
    async function* iterator() {
      if (consumed) {
        throw new AnthropicError("Cannot iterate over a consumed stream, use `.tee()` to split the stream.");
      }
      consumed = true;
      let done = false;
      try {
        for await (const line of iterLines()) {
          if (done)
            continue;
          if (line)
            yield JSON.parse(line);
        }
        done = true;
      } catch (e) {
        if (isAbortError(e))
          return;
        throw e;
      } finally {
        if (!done)
          controller.abort();
      }
    }
    return new Stream(iterator, controller, client);
  }
  [(_Stream_client = new WeakMap, Symbol.asyncIterator)]() {
    return this.iterator();
  }
  tee() {
    const left = [];
    const right = [];
    const iterator = this.iterator();
    const teeIterator = (queue) => {
      return {
        next: () => {
          if (queue.length === 0) {
            const result = iterator.next();
            left.push(result);
            right.push(result);
          }
          return queue.shift();
        }
      };
    };
    return [
      new Stream(() => teeIterator(left), this.controller, __classPrivateFieldGet(this, _Stream_client, "f")),
      new Stream(() => teeIterator(right), this.controller, __classPrivateFieldGet(this, _Stream_client, "f"))
    ];
  }
  toReadableStream() {
    const self = this;
    let iter;
    return makeReadableStream({
      async start() {
        iter = self[Symbol.asyncIterator]();
      },
      async pull(ctrl) {
        try {
          const { value, done } = await iter.next();
          if (done)
            return ctrl.close();
          const bytes = encodeUTF8(JSON.stringify(value) + `
`);
          ctrl.enqueue(bytes);
        } catch (err) {
          ctrl.error(err);
        }
      },
      async cancel() {
        await iter.return?.();
      }
    });
  }
}
async function* _iterSSEMessages(response, controller) {
  if (!response.body) {
    controller.abort();
    if (typeof globalThis.navigator !== "undefined" && globalThis.navigator.product === "ReactNative") {
      throw new AnthropicError(`The default react-native fetch implementation does not support streaming. Please use expo/fetch: https://docs.expo.dev/versions/latest/sdk/expo/#expofetch-api`);
    }
    throw new AnthropicError(`Attempted to iterate over a response with no body`);
  }
  const sseDecoder = new SSEDecoder;
  const lineDecoder = new LineDecoder;
  const iter = ReadableStreamToAsyncIterable(response.body);
  for await (const sseChunk of iterSSEChunks(iter)) {
    for (const line of lineDecoder.decode(sseChunk)) {
      const sse = sseDecoder.decode(line);
      if (sse)
        yield sse;
    }
  }
  for (const line of lineDecoder.flush()) {
    const sse = sseDecoder.decode(line);
    if (sse)
      yield sse;
  }
}
async function* iterSSEChunks(iterator) {
  let data = new Uint8Array;
  for await (const chunk of iterator) {
    if (chunk == null) {
      continue;
    }
    const binaryChunk = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : typeof chunk === "string" ? encodeUTF8(chunk) : chunk;
    let newData = new Uint8Array(data.length + binaryChunk.length);
    newData.set(data);
    newData.set(binaryChunk, data.length);
    data = newData;
    let patternIndex;
    while ((patternIndex = findDoubleNewlineIndex(data)) !== -1) {
      yield data.slice(0, patternIndex);
      data = data.slice(patternIndex);
    }
  }
  if (data.length > 0) {
    yield data;
  }
}

class SSEDecoder {
  constructor() {
    this.event = null;
    this.data = [];
    this.chunks = [];
  }
  decode(line) {
    if (line.endsWith("\r")) {
      line = line.substring(0, line.length - 1);
    }
    if (!line) {
      if (!this.event && !this.data.length)
        return null;
      const sse = {
        event: this.event,
        data: this.data.join(`
`),
        raw: this.chunks
      };
      this.event = null;
      this.data = [];
      this.chunks = [];
      return sse;
    }
    this.chunks.push(line);
    if (line.startsWith(":")) {
      return null;
    }
    let [fieldname, _, value] = partition(line, ":");
    if (value.startsWith(" ")) {
      value = value.substring(1);
    }
    if (fieldname === "event") {
      this.event = value;
    } else if (fieldname === "data") {
      this.data.push(value);
    }
    return null;
  }
}
function partition(str, delimiter) {
  const index = str.indexOf(delimiter);
  if (index !== -1) {
    return [str.substring(0, index), delimiter, str.substring(index + delimiter.length)];
  }
  return [str, "", ""];
}

// node_modules/@anthropic-ai/sdk/internal/parse.mjs
async function defaultParseResponse(client, props) {
  const { response, requestLogID, retryOfRequestLogID, startTime } = props;
  const body = await (async () => {
    if (props.options.stream) {
      loggerFor(client).debug("response", response.status, response.url, response.headers, response.body);
      if (props.options.__streamClass) {
        return props.options.__streamClass.fromSSEResponse(response, props.controller);
      }
      return Stream.fromSSEResponse(response, props.controller);
    }
    if (response.status === 204) {
      return null;
    }
    if (props.options.__binaryResponse) {
      return response;
    }
    const contentType = response.headers.get("content-type");
    const mediaType = contentType?.split(";")[0]?.trim();
    const isJSON = mediaType?.includes("application/json") || mediaType?.endsWith("+json");
    if (isJSON) {
      const contentLength = response.headers.get("content-length");
      if (contentLength === "0") {
        return;
      }
      const json = await response.json();
      return addRequestID(json, response);
    }
    const text = await response.text();
    return text;
  })();
  loggerFor(client).debug(`[${requestLogID}] response parsed`, formatRequestDetails({
    retryOfRequestLogID,
    url: response.url,
    status: response.status,
    body,
    durationMs: Date.now() - startTime
  }));
  return body;
}
function addRequestID(value, response) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  return Object.defineProperty(value, "_request_id", {
    value: response.headers.get("request-id"),
    enumerable: false
  });
}

// node_modules/@anthropic-ai/sdk/core/api-promise.mjs
var _APIPromise_client;

class APIPromise extends Promise {
  constructor(client, responsePromise, parseResponse = defaultParseResponse) {
    super((resolve) => {
      resolve(null);
    });
    this.responsePromise = responsePromise;
    this.parseResponse = parseResponse;
    _APIPromise_client.set(this, undefined);
    __classPrivateFieldSet(this, _APIPromise_client, client, "f");
  }
  _thenUnwrap(transform) {
    return new APIPromise(__classPrivateFieldGet(this, _APIPromise_client, "f"), this.responsePromise, async (client, props) => addRequestID(transform(await this.parseResponse(client, props), props), props.response));
  }
  asResponse() {
    return this.responsePromise.then((p) => p.response);
  }
  async withResponse() {
    const [data, response] = await Promise.all([this.parse(), this.asResponse()]);
    return { data, response, request_id: response.headers.get("request-id") };
  }
  parse() {
    if (!this.parsedPromise) {
      this.parsedPromise = this.responsePromise.then((data) => this.parseResponse(__classPrivateFieldGet(this, _APIPromise_client, "f"), data));
    }
    return this.parsedPromise;
  }
  then(onfulfilled, onrejected) {
    return this.parse().then(onfulfilled, onrejected);
  }
  catch(onrejected) {
    return this.parse().catch(onrejected);
  }
  finally(onfinally) {
    return this.parse().finally(onfinally);
  }
}
_APIPromise_client = new WeakMap;

// node_modules/@anthropic-ai/sdk/core/pagination.mjs
var _AbstractPage_client;

class AbstractPage {
  constructor(client, response, body, options) {
    _AbstractPage_client.set(this, undefined);
    __classPrivateFieldSet(this, _AbstractPage_client, client, "f");
    this.options = options;
    this.response = response;
    this.body = body;
  }
  hasNextPage() {
    const items = this.getPaginatedItems();
    if (!items.length)
      return false;
    return this.nextPageRequestOptions() != null;
  }
  async getNextPage() {
    const nextOptions = this.nextPageRequestOptions();
    if (!nextOptions) {
      throw new AnthropicError("No next page expected; please check `.hasNextPage()` before calling `.getNextPage()`.");
    }
    return await __classPrivateFieldGet(this, _AbstractPage_client, "f").requestAPIList(this.constructor, nextOptions);
  }
  async* iterPages() {
    let page = this;
    yield page;
    while (page.hasNextPage()) {
      page = await page.getNextPage();
      yield page;
    }
  }
  async* [(_AbstractPage_client = new WeakMap, Symbol.asyncIterator)]() {
    for await (const page of this.iterPages()) {
      for (const item of page.getPaginatedItems()) {
        yield item;
      }
    }
  }
}

class PagePromise extends APIPromise {
  constructor(client, request, Page) {
    super(client, request, async (client2, props) => new Page(client2, props.response, await defaultParseResponse(client2, props), props.options));
  }
  async* [Symbol.asyncIterator]() {
    const page = await this;
    for await (const item of page) {
      yield item;
    }
  }
}

class Page extends AbstractPage {
  constructor(client, response, body, options) {
    super(client, response, body, options);
    this.data = body.data || [];
    this.has_more = body.has_more || false;
    this.first_id = body.first_id || null;
    this.last_id = body.last_id || null;
  }
  getPaginatedItems() {
    return this.data ?? [];
  }
  hasNextPage() {
    if (this.has_more === false) {
      return false;
    }
    return super.hasNextPage();
  }
  nextPageRequestOptions() {
    if (this.options.query?.["before_id"]) {
      const first_id = this.first_id;
      if (!first_id) {
        return null;
      }
      return {
        ...this.options,
        query: {
          ...maybeObj(this.options.query),
          before_id: first_id
        }
      };
    }
    const cursor = this.last_id;
    if (!cursor) {
      return null;
    }
    return {
      ...this.options,
      query: {
        ...maybeObj(this.options.query),
        after_id: cursor
      }
    };
  }
}
class PageCursor extends AbstractPage {
  constructor(client, response, body, options) {
    super(client, response, body, options);
    this.data = body.data || [];
    this.has_more = body.has_more || false;
    this.next_page = body.next_page || null;
  }
  getPaginatedItems() {
    return this.data ?? [];
  }
  hasNextPage() {
    if (this.has_more === false) {
      return false;
    }
    return super.hasNextPage();
  }
  nextPageRequestOptions() {
    const cursor = this.next_page;
    if (!cursor) {
      return null;
    }
    return {
      ...this.options,
      query: {
        ...maybeObj(this.options.query),
        page: cursor
      }
    };
  }
}

// node_modules/@anthropic-ai/sdk/internal/uploads.mjs
var checkFileSupport = () => {
  if (typeof File === "undefined") {
    const { process: process2 } = globalThis;
    const isOldNode = typeof process2?.versions?.node === "string" && parseInt(process2.versions.node.split(".")) < 20;
    throw new Error("`File` is not defined as a global, which is required for file uploads." + (isOldNode ? " Update to Node 20 LTS or newer, or set `globalThis.File` to `import('node:buffer').File`." : ""));
  }
};
function makeFile(fileBits, fileName, options) {
  checkFileSupport();
  return new File(fileBits, fileName ?? "unknown_file", options);
}
function getName(value, stripPath) {
  const val = typeof value === "object" && value !== null && (("name" in value) && value.name && String(value.name) || ("url" in value) && value.url && String(value.url) || ("filename" in value) && value.filename && String(value.filename) || ("path" in value) && value.path && String(value.path)) || "";
  return stripPath ? val.split(/[\\/]/).pop() || undefined : val;
}
var isAsyncIterable = (value) => value != null && typeof value === "object" && typeof value[Symbol.asyncIterator] === "function";
var multipartFormRequestOptions = async (opts, fetch2, stripFilenames = true) => {
  return { ...opts, body: await createForm(opts.body, fetch2, stripFilenames) };
};
var supportsFormDataMap = /* @__PURE__ */ new WeakMap;
function supportsFormData(fetchObject) {
  const fetch2 = typeof fetchObject === "function" ? fetchObject : fetchObject.fetch;
  const cached = supportsFormDataMap.get(fetch2);
  if (cached)
    return cached;
  const promise = (async () => {
    try {
      const FetchResponse = "Response" in fetch2 ? fetch2.Response : (await fetch2("data:,")).constructor;
      const data = new FormData;
      if (data.toString() === await new FetchResponse(data).text()) {
        return false;
      }
      return true;
    } catch {
      return true;
    }
  })();
  supportsFormDataMap.set(fetch2, promise);
  return promise;
}
var createForm = async (body, fetch2, stripFilenames = true) => {
  if (!await supportsFormData(fetch2)) {
    throw new TypeError("The provided fetch function does not support file uploads with the current global FormData class.");
  }
  const form = new FormData;
  await Promise.all(Object.entries(body || {}).map(([key, value]) => addFormValue(form, key, value, stripFilenames)));
  return form;
};
var isNamedBlob = (value) => value instanceof Blob && ("name" in value);
var addFormValue = async (form, key, value, stripFilenames) => {
  if (value === undefined)
    return;
  if (value == null) {
    throw new TypeError(`Received null for "${key}"; to pass null in FormData, you must use the string 'null'`);
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    form.append(key, String(value));
  } else if (value instanceof Response) {
    let options = {};
    const contentType = value.headers.get("Content-Type");
    if (contentType) {
      options = { type: contentType };
    }
    form.append(key, makeFile([await value.blob()], getName(value, stripFilenames), options));
  } else if (isAsyncIterable(value)) {
    form.append(key, makeFile([await new Response(ReadableStreamFrom(value)).blob()], getName(value, stripFilenames)));
  } else if (isNamedBlob(value)) {
    form.append(key, makeFile([value], getName(value, stripFilenames), { type: value.type }));
  } else if (Array.isArray(value)) {
    await Promise.all(value.map((entry) => addFormValue(form, key + "[]", entry, stripFilenames)));
  } else if (typeof value === "object") {
    await Promise.all(Object.entries(value).map(([name, prop]) => addFormValue(form, `${key}[${name}]`, prop, stripFilenames)));
  } else {
    throw new TypeError(`Invalid value given to form, expected a string, number, boolean, object, Array, File or Blob but got ${value} instead`);
  }
};

// node_modules/@anthropic-ai/sdk/internal/to-file.mjs
var isBlobLike = (value) => value != null && typeof value === "object" && typeof value.size === "number" && typeof value.type === "string" && typeof value.text === "function" && typeof value.slice === "function" && typeof value.arrayBuffer === "function";
var isFileLike = (value) => value != null && typeof value === "object" && typeof value.name === "string" && typeof value.lastModified === "number" && isBlobLike(value);
var isResponseLike = (value) => value != null && typeof value === "object" && typeof value.url === "string" && typeof value.blob === "function";
async function toFile(value, name, options) {
  checkFileSupport();
  value = await value;
  name || (name = getName(value, true));
  if (isFileLike(value)) {
    if (value instanceof File && name == null && options == null) {
      return value;
    }
    return makeFile([await value.arrayBuffer()], name ?? value.name, {
      type: value.type,
      lastModified: value.lastModified,
      ...options
    });
  }
  if (isResponseLike(value)) {
    const blob = await value.blob();
    name || (name = new URL(value.url).pathname.split(/[\\/]/).pop());
    return makeFile(await getBytes(blob), name, options);
  }
  const parts = await getBytes(value);
  if (!options?.type) {
    const type = parts.find((part) => typeof part === "object" && ("type" in part) && part.type);
    if (typeof type === "string") {
      options = { ...options, type };
    }
  }
  return makeFile(parts, name, options);
}
async function getBytes(value) {
  let parts = [];
  if (typeof value === "string" || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    parts.push(value);
  } else if (isBlobLike(value)) {
    parts.push(value instanceof Blob ? value : await value.arrayBuffer());
  } else if (isAsyncIterable(value)) {
    for await (const chunk of value) {
      parts.push(...await getBytes(chunk));
    }
  } else {
    const constructor = value?.constructor?.name;
    throw new Error(`Unexpected data type: ${typeof value}${constructor ? `; constructor: ${constructor}` : ""}${propsForError(value)}`);
  }
  return parts;
}
function propsForError(value) {
  if (typeof value !== "object" || value === null)
    return "";
  const props = Object.getOwnPropertyNames(value);
  return `; props: [${props.map((p) => `"${p}"`).join(", ")}]`;
}
// node_modules/@anthropic-ai/sdk/core/resource.mjs
class APIResource {
  constructor(client) {
    this._client = client;
  }
}

// node_modules/@anthropic-ai/sdk/internal/headers.mjs
var brand_privateNullableHeaders = Symbol.for("brand.privateNullableHeaders");
function* iterateHeaders(headers) {
  if (!headers)
    return;
  if (brand_privateNullableHeaders in headers) {
    const { values, nulls } = headers;
    yield* values.entries();
    for (const name of nulls) {
      yield [name, null];
    }
    return;
  }
  let shouldClear = false;
  let iter;
  if (headers instanceof Headers) {
    iter = headers.entries();
  } else if (isReadonlyArray(headers)) {
    iter = headers;
  } else {
    shouldClear = true;
    iter = Object.entries(headers ?? {});
  }
  for (let row of iter) {
    const name = row[0];
    if (typeof name !== "string")
      throw new TypeError("expected header name to be a string");
    const values = isReadonlyArray(row[1]) ? row[1] : [row[1]];
    let didClear = false;
    for (const value of values) {
      if (value === undefined)
        continue;
      if (shouldClear && !didClear) {
        didClear = true;
        yield [name, null];
      }
      yield [name, value];
    }
  }
}
var buildHeaders = (newHeaders) => {
  const targetHeaders = new Headers;
  const nullHeaders = new Set;
  for (const headers of newHeaders) {
    const seenHeaders = new Set;
    for (const [name, value] of iterateHeaders(headers)) {
      const lowerName = name.toLowerCase();
      if (!seenHeaders.has(lowerName)) {
        targetHeaders.delete(name);
        seenHeaders.add(lowerName);
      }
      if (value === null) {
        targetHeaders.delete(name);
        nullHeaders.add(lowerName);
      } else {
        targetHeaders.append(name, value);
        nullHeaders.delete(lowerName);
      }
    }
  }
  return { [brand_privateNullableHeaders]: true, values: targetHeaders, nulls: nullHeaders };
};

// node_modules/@anthropic-ai/sdk/lib/stainless-helper-header.mjs
var SDK_HELPER_SYMBOL = Symbol("anthropic.sdk.stainlessHelper");
function wasCreatedByStainlessHelper(value) {
  return typeof value === "object" && value !== null && SDK_HELPER_SYMBOL in value;
}
function collectStainlessHelpers(tools, messages) {
  const helpers = new Set;
  if (tools) {
    for (const tool of tools) {
      if (wasCreatedByStainlessHelper(tool)) {
        helpers.add(tool[SDK_HELPER_SYMBOL]);
      }
    }
  }
  if (messages) {
    for (const message of messages) {
      if (wasCreatedByStainlessHelper(message)) {
        helpers.add(message[SDK_HELPER_SYMBOL]);
      }
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (wasCreatedByStainlessHelper(block)) {
            helpers.add(block[SDK_HELPER_SYMBOL]);
          }
        }
      }
    }
  }
  return Array.from(helpers);
}
function stainlessHelperHeader(tools, messages) {
  const helpers = collectStainlessHelpers(tools, messages);
  if (helpers.length === 0)
    return {};
  return { "x-stainless-helper": helpers.join(", ") };
}
function stainlessHelperHeaderFromFile(file) {
  if (wasCreatedByStainlessHelper(file)) {
    return { "x-stainless-helper": file[SDK_HELPER_SYMBOL] };
  }
  return {};
}

// node_modules/@anthropic-ai/sdk/internal/utils/path.mjs
function encodeURIPath(str) {
  return str.replace(/[^A-Za-z0-9\-._~!$&'()*+,;=:@]+/g, encodeURIComponent);
}
var EMPTY = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.create(null));
var createPathTagFunction = (pathEncoder = encodeURIPath) => function path3(statics, ...params) {
  if (statics.length === 1)
    return statics[0];
  let postPath = false;
  const invalidSegments = [];
  const path4 = statics.reduce((previousValue, currentValue, index) => {
    if (/[?#]/.test(currentValue)) {
      postPath = true;
    }
    const value = params[index];
    let encoded = (postPath ? encodeURIComponent : pathEncoder)("" + value);
    if (index !== params.length && (value == null || typeof value === "object" && value.toString === Object.getPrototypeOf(Object.getPrototypeOf(value.hasOwnProperty ?? EMPTY) ?? EMPTY)?.toString)) {
      encoded = value + "";
      invalidSegments.push({
        start: previousValue.length + currentValue.length,
        length: encoded.length,
        error: `Value of type ${Object.prototype.toString.call(value).slice(8, -1)} is not a valid path parameter`
      });
    }
    return previousValue + currentValue + (index === params.length ? "" : encoded);
  }, "");
  const pathOnly = path4.split(/[?#]/, 1)[0];
  const invalidSegmentPattern = /(?<=^|\/)(?:\.|%2e){1,2}(?=\/|$)/gi;
  let match;
  while ((match = invalidSegmentPattern.exec(pathOnly)) !== null) {
    invalidSegments.push({
      start: match.index,
      length: match[0].length,
      error: `Value "${match[0]}" can't be safely passed as a path parameter`
    });
  }
  invalidSegments.sort((a, b) => a.start - b.start);
  if (invalidSegments.length > 0) {
    let lastEnd = 0;
    const underline = invalidSegments.reduce((acc, segment) => {
      const spaces = " ".repeat(segment.start - lastEnd);
      const arrows = "^".repeat(segment.length);
      lastEnd = segment.start + segment.length;
      return acc + spaces + arrows;
    }, "");
    throw new AnthropicError(`Path parameters result in path with invalid segments:
${invalidSegments.map((e) => e.error).join(`
`)}
${path4}
${underline}`);
  }
  return path4;
};
var path3 = /* @__PURE__ */ createPathTagFunction(encodeURIPath);

// node_modules/@anthropic-ai/sdk/resources/beta/files.mjs
class Files extends APIResource {
  list(params = {}, options) {
    const { betas, ...query } = params ?? {};
    return this._client.getAPIList("/v1/files", Page, {
      query,
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "files-api-2025-04-14"].toString() },
        options?.headers
      ])
    });
  }
  delete(fileID, params = {}, options) {
    const { betas } = params ?? {};
    return this._client.delete(path3`/v1/files/${fileID}`, {
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "files-api-2025-04-14"].toString() },
        options?.headers
      ])
    });
  }
  download(fileID, params = {}, options) {
    const { betas } = params ?? {};
    return this._client.get(path3`/v1/files/${fileID}/content`, {
      ...options,
      headers: buildHeaders([
        {
          "anthropic-beta": [...betas ?? [], "files-api-2025-04-14"].toString(),
          Accept: "application/binary"
        },
        options?.headers
      ]),
      __binaryResponse: true
    });
  }
  retrieveMetadata(fileID, params = {}, options) {
    const { betas } = params ?? {};
    return this._client.get(path3`/v1/files/${fileID}`, {
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "files-api-2025-04-14"].toString() },
        options?.headers
      ])
    });
  }
  upload(params, options) {
    const { betas, ...body } = params;
    return this._client.post("/v1/files", multipartFormRequestOptions({
      body,
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "files-api-2025-04-14"].toString() },
        stainlessHelperHeaderFromFile(body.file),
        options?.headers
      ])
    }, this._client));
  }
}

// node_modules/@anthropic-ai/sdk/resources/beta/models.mjs
class Models extends APIResource {
  retrieve(modelID, params = {}, options) {
    const { betas } = params ?? {};
    return this._client.get(path3`/v1/models/${modelID}?beta=true`, {
      ...options,
      headers: buildHeaders([
        { ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : undefined },
        options?.headers
      ])
    });
  }
  list(params = {}, options) {
    const { betas, ...query } = params ?? {};
    return this._client.getAPIList("/v1/models?beta=true", Page, {
      query,
      ...options,
      headers: buildHeaders([
        { ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : undefined },
        options?.headers
      ])
    });
  }
}
// node_modules/@anthropic-ai/sdk/internal/constants.mjs
var MODEL_NONSTREAMING_TOKENS = {
  "claude-opus-4-20250514": 8192,
  "claude-opus-4-0": 8192,
  "claude-4-opus-20250514": 8192,
  "anthropic.claude-opus-4-20250514-v1:0": 8192,
  "claude-opus-4@20250514": 8192,
  "claude-opus-4-1-20250805": 8192,
  "anthropic.claude-opus-4-1-20250805-v1:0": 8192,
  "claude-opus-4-1@20250805": 8192
};

// node_modules/@anthropic-ai/sdk/lib/beta-parser.mjs
function getOutputFormat(params) {
  return params?.output_format ?? params?.output_config?.format;
}
function maybeParseBetaMessage(message, params, opts) {
  const outputFormat = getOutputFormat(params);
  if (!params || !("parse" in (outputFormat ?? {}))) {
    return {
      ...message,
      content: message.content.map((block) => {
        if (block.type === "text") {
          const parsedBlock = Object.defineProperty({ ...block }, "parsed_output", {
            value: null,
            enumerable: false
          });
          return Object.defineProperty(parsedBlock, "parsed", {
            get() {
              opts.logger.warn("The `parsed` property on `text` blocks is deprecated, please use `parsed_output` instead.");
              return null;
            },
            enumerable: false
          });
        }
        return block;
      }),
      parsed_output: null
    };
  }
  return parseBetaMessage(message, params, opts);
}
function parseBetaMessage(message, params, opts) {
  let firstParsedOutput = null;
  const content = message.content.map((block) => {
    if (block.type === "text") {
      const parsedOutput = parseBetaOutputFormat(params, block.text);
      if (firstParsedOutput === null) {
        firstParsedOutput = parsedOutput;
      }
      const parsedBlock = Object.defineProperty({ ...block }, "parsed_output", {
        value: parsedOutput,
        enumerable: false
      });
      return Object.defineProperty(parsedBlock, "parsed", {
        get() {
          opts.logger.warn("The `parsed` property on `text` blocks is deprecated, please use `parsed_output` instead.");
          return parsedOutput;
        },
        enumerable: false
      });
    }
    return block;
  });
  return {
    ...message,
    content,
    parsed_output: firstParsedOutput
  };
}
function parseBetaOutputFormat(params, content) {
  const outputFormat = getOutputFormat(params);
  if (outputFormat?.type !== "json_schema") {
    return null;
  }
  try {
    if ("parse" in outputFormat) {
      return outputFormat.parse(content);
    }
    return JSON.parse(content);
  } catch (error2) {
    throw new AnthropicError(`Failed to parse structured output: ${error2}`);
  }
}

// node_modules/@anthropic-ai/sdk/_vendor/partial-json-parser/parser.mjs
var tokenize2 = (input) => {
  let current = 0;
  let tokens = [];
  while (current < input.length) {
    let char = input[current];
    if (char === "\\") {
      current++;
      continue;
    }
    if (char === "{") {
      tokens.push({
        type: "brace",
        value: "{"
      });
      current++;
      continue;
    }
    if (char === "}") {
      tokens.push({
        type: "brace",
        value: "}"
      });
      current++;
      continue;
    }
    if (char === "[") {
      tokens.push({
        type: "paren",
        value: "["
      });
      current++;
      continue;
    }
    if (char === "]") {
      tokens.push({
        type: "paren",
        value: "]"
      });
      current++;
      continue;
    }
    if (char === ":") {
      tokens.push({
        type: "separator",
        value: ":"
      });
      current++;
      continue;
    }
    if (char === ",") {
      tokens.push({
        type: "delimiter",
        value: ","
      });
      current++;
      continue;
    }
    if (char === '"') {
      let value = "";
      let danglingQuote = false;
      char = input[++current];
      while (char !== '"') {
        if (current === input.length) {
          danglingQuote = true;
          break;
        }
        if (char === "\\") {
          current++;
          if (current === input.length) {
            danglingQuote = true;
            break;
          }
          value += char + input[current];
          char = input[++current];
        } else {
          value += char;
          char = input[++current];
        }
      }
      char = input[++current];
      if (!danglingQuote) {
        tokens.push({
          type: "string",
          value
        });
      }
      continue;
    }
    let WHITESPACE = /\s/;
    if (char && WHITESPACE.test(char)) {
      current++;
      continue;
    }
    let NUMBERS = /[0-9]/;
    if (char && NUMBERS.test(char) || char === "-" || char === ".") {
      let value = "";
      if (char === "-") {
        value += char;
        char = input[++current];
      }
      while (char && NUMBERS.test(char) || char === ".") {
        value += char;
        char = input[++current];
      }
      tokens.push({
        type: "number",
        value
      });
      continue;
    }
    let LETTERS = /[a-z]/i;
    if (char && LETTERS.test(char)) {
      let value = "";
      while (char && LETTERS.test(char)) {
        if (current === input.length) {
          break;
        }
        value += char;
        char = input[++current];
      }
      if (value == "true" || value == "false" || value === "null") {
        tokens.push({
          type: "name",
          value
        });
      } else {
        current++;
        continue;
      }
      continue;
    }
    current++;
  }
  return tokens;
};
var strip = (tokens) => {
  if (tokens.length === 0) {
    return tokens;
  }
  let lastToken = tokens[tokens.length - 1];
  switch (lastToken.type) {
    case "separator":
      tokens = tokens.slice(0, tokens.length - 1);
      return strip(tokens);
      break;
    case "number":
      let lastCharacterOfLastToken = lastToken.value[lastToken.value.length - 1];
      if (lastCharacterOfLastToken === "." || lastCharacterOfLastToken === "-") {
        tokens = tokens.slice(0, tokens.length - 1);
        return strip(tokens);
      }
    case "string":
      let tokenBeforeTheLastToken = tokens[tokens.length - 2];
      if (tokenBeforeTheLastToken?.type === "delimiter") {
        tokens = tokens.slice(0, tokens.length - 1);
        return strip(tokens);
      } else if (tokenBeforeTheLastToken?.type === "brace" && tokenBeforeTheLastToken.value === "{") {
        tokens = tokens.slice(0, tokens.length - 1);
        return strip(tokens);
      }
      break;
    case "delimiter":
      tokens = tokens.slice(0, tokens.length - 1);
      return strip(tokens);
      break;
  }
  return tokens;
};
var unstrip = (tokens) => {
  let tail = [];
  tokens.map((token) => {
    if (token.type === "brace") {
      if (token.value === "{") {
        tail.push("}");
      } else {
        tail.splice(tail.lastIndexOf("}"), 1);
      }
    }
    if (token.type === "paren") {
      if (token.value === "[") {
        tail.push("]");
      } else {
        tail.splice(tail.lastIndexOf("]"), 1);
      }
    }
  });
  if (tail.length > 0) {
    tail.reverse().map((item) => {
      if (item === "}") {
        tokens.push({
          type: "brace",
          value: "}"
        });
      } else if (item === "]") {
        tokens.push({
          type: "paren",
          value: "]"
        });
      }
    });
  }
  return tokens;
};
var generate = (tokens) => {
  let output = "";
  tokens.map((token) => {
    switch (token.type) {
      case "string":
        output += '"' + token.value + '"';
        break;
      default:
        output += token.value;
        break;
    }
  });
  return output;
};
var partialParse = (input) => JSON.parse(generate(unstrip(strip(tokenize2(input)))));
// node_modules/@anthropic-ai/sdk/lib/BetaMessageStream.mjs
var _BetaMessageStream_instances;
var _BetaMessageStream_currentMessageSnapshot;
var _BetaMessageStream_params;
var _BetaMessageStream_connectedPromise;
var _BetaMessageStream_resolveConnectedPromise;
var _BetaMessageStream_rejectConnectedPromise;
var _BetaMessageStream_endPromise;
var _BetaMessageStream_resolveEndPromise;
var _BetaMessageStream_rejectEndPromise;
var _BetaMessageStream_listeners;
var _BetaMessageStream_ended;
var _BetaMessageStream_errored;
var _BetaMessageStream_aborted;
var _BetaMessageStream_catchingPromiseCreated;
var _BetaMessageStream_response;
var _BetaMessageStream_request_id;
var _BetaMessageStream_logger;
var _BetaMessageStream_getFinalMessage;
var _BetaMessageStream_getFinalText;
var _BetaMessageStream_handleError;
var _BetaMessageStream_beginRequest;
var _BetaMessageStream_addStreamEvent;
var _BetaMessageStream_endRequest;
var _BetaMessageStream_accumulateMessage;
var JSON_BUF_PROPERTY = "__json_buf";
function tracksToolInput(content) {
  return content.type === "tool_use" || content.type === "server_tool_use" || content.type === "mcp_tool_use";
}

class BetaMessageStream {
  constructor(params, opts) {
    _BetaMessageStream_instances.add(this);
    this.messages = [];
    this.receivedMessages = [];
    _BetaMessageStream_currentMessageSnapshot.set(this, undefined);
    _BetaMessageStream_params.set(this, null);
    this.controller = new AbortController;
    _BetaMessageStream_connectedPromise.set(this, undefined);
    _BetaMessageStream_resolveConnectedPromise.set(this, () => {});
    _BetaMessageStream_rejectConnectedPromise.set(this, () => {});
    _BetaMessageStream_endPromise.set(this, undefined);
    _BetaMessageStream_resolveEndPromise.set(this, () => {});
    _BetaMessageStream_rejectEndPromise.set(this, () => {});
    _BetaMessageStream_listeners.set(this, {});
    _BetaMessageStream_ended.set(this, false);
    _BetaMessageStream_errored.set(this, false);
    _BetaMessageStream_aborted.set(this, false);
    _BetaMessageStream_catchingPromiseCreated.set(this, false);
    _BetaMessageStream_response.set(this, undefined);
    _BetaMessageStream_request_id.set(this, undefined);
    _BetaMessageStream_logger.set(this, undefined);
    _BetaMessageStream_handleError.set(this, (error2) => {
      __classPrivateFieldSet(this, _BetaMessageStream_errored, true, "f");
      if (isAbortError(error2)) {
        error2 = new APIUserAbortError;
      }
      if (error2 instanceof APIUserAbortError) {
        __classPrivateFieldSet(this, _BetaMessageStream_aborted, true, "f");
        return this._emit("abort", error2);
      }
      if (error2 instanceof AnthropicError) {
        return this._emit("error", error2);
      }
      if (error2 instanceof Error) {
        const anthropicError = new AnthropicError(error2.message);
        anthropicError.cause = error2;
        return this._emit("error", anthropicError);
      }
      return this._emit("error", new AnthropicError(String(error2)));
    });
    __classPrivateFieldSet(this, _BetaMessageStream_connectedPromise, new Promise((resolve, reject) => {
      __classPrivateFieldSet(this, _BetaMessageStream_resolveConnectedPromise, resolve, "f");
      __classPrivateFieldSet(this, _BetaMessageStream_rejectConnectedPromise, reject, "f");
    }), "f");
    __classPrivateFieldSet(this, _BetaMessageStream_endPromise, new Promise((resolve, reject) => {
      __classPrivateFieldSet(this, _BetaMessageStream_resolveEndPromise, resolve, "f");
      __classPrivateFieldSet(this, _BetaMessageStream_rejectEndPromise, reject, "f");
    }), "f");
    __classPrivateFieldGet(this, _BetaMessageStream_connectedPromise, "f").catch(() => {});
    __classPrivateFieldGet(this, _BetaMessageStream_endPromise, "f").catch(() => {});
    __classPrivateFieldSet(this, _BetaMessageStream_params, params, "f");
    __classPrivateFieldSet(this, _BetaMessageStream_logger, opts?.logger ?? console, "f");
  }
  get response() {
    return __classPrivateFieldGet(this, _BetaMessageStream_response, "f");
  }
  get request_id() {
    return __classPrivateFieldGet(this, _BetaMessageStream_request_id, "f");
  }
  async withResponse() {
    __classPrivateFieldSet(this, _BetaMessageStream_catchingPromiseCreated, true, "f");
    const response = await __classPrivateFieldGet(this, _BetaMessageStream_connectedPromise, "f");
    if (!response) {
      throw new Error("Could not resolve a `Response` object");
    }
    return {
      data: this,
      response,
      request_id: response.headers.get("request-id")
    };
  }
  static fromReadableStream(stream) {
    const runner = new BetaMessageStream(null);
    runner._run(() => runner._fromReadableStream(stream));
    return runner;
  }
  static createMessage(messages, params, options, { logger } = {}) {
    const runner = new BetaMessageStream(params, { logger });
    for (const message of params.messages) {
      runner._addMessageParam(message);
    }
    __classPrivateFieldSet(runner, _BetaMessageStream_params, { ...params, stream: true }, "f");
    runner._run(() => runner._createMessage(messages, { ...params, stream: true }, { ...options, headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" } }));
    return runner;
  }
  _run(executor) {
    executor().then(() => {
      this._emitFinal();
      this._emit("end");
    }, __classPrivateFieldGet(this, _BetaMessageStream_handleError, "f"));
  }
  _addMessageParam(message) {
    this.messages.push(message);
  }
  _addMessage(message, emit = true) {
    this.receivedMessages.push(message);
    if (emit) {
      this._emit("message", message);
    }
  }
  async _createMessage(messages, params, options) {
    const signal = options?.signal;
    let abortHandler;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      abortHandler = this.controller.abort.bind(this.controller);
      signal.addEventListener("abort", abortHandler);
    }
    try {
      __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_beginRequest).call(this);
      const { response, data: stream } = await messages.create({ ...params, stream: true }, { ...options, signal: this.controller.signal }).withResponse();
      this._connected(response);
      for await (const event of stream) {
        __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_addStreamEvent).call(this, event);
      }
      if (stream.controller.signal?.aborted) {
        throw new APIUserAbortError;
      }
      __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_endRequest).call(this);
    } finally {
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
    }
  }
  _connected(response) {
    if (this.ended)
      return;
    __classPrivateFieldSet(this, _BetaMessageStream_response, response, "f");
    __classPrivateFieldSet(this, _BetaMessageStream_request_id, response?.headers.get("request-id"), "f");
    __classPrivateFieldGet(this, _BetaMessageStream_resolveConnectedPromise, "f").call(this, response);
    this._emit("connect");
  }
  get ended() {
    return __classPrivateFieldGet(this, _BetaMessageStream_ended, "f");
  }
  get errored() {
    return __classPrivateFieldGet(this, _BetaMessageStream_errored, "f");
  }
  get aborted() {
    return __classPrivateFieldGet(this, _BetaMessageStream_aborted, "f");
  }
  abort() {
    this.controller.abort();
  }
  on(event, listener) {
    const listeners = __classPrivateFieldGet(this, _BetaMessageStream_listeners, "f")[event] || (__classPrivateFieldGet(this, _BetaMessageStream_listeners, "f")[event] = []);
    listeners.push({ listener });
    return this;
  }
  off(event, listener) {
    const listeners = __classPrivateFieldGet(this, _BetaMessageStream_listeners, "f")[event];
    if (!listeners)
      return this;
    const index = listeners.findIndex((l) => l.listener === listener);
    if (index >= 0)
      listeners.splice(index, 1);
    return this;
  }
  once(event, listener) {
    const listeners = __classPrivateFieldGet(this, _BetaMessageStream_listeners, "f")[event] || (__classPrivateFieldGet(this, _BetaMessageStream_listeners, "f")[event] = []);
    listeners.push({ listener, once: true });
    return this;
  }
  emitted(event) {
    return new Promise((resolve, reject) => {
      __classPrivateFieldSet(this, _BetaMessageStream_catchingPromiseCreated, true, "f");
      if (event !== "error")
        this.once("error", reject);
      this.once(event, resolve);
    });
  }
  async done() {
    __classPrivateFieldSet(this, _BetaMessageStream_catchingPromiseCreated, true, "f");
    await __classPrivateFieldGet(this, _BetaMessageStream_endPromise, "f");
  }
  get currentMessage() {
    return __classPrivateFieldGet(this, _BetaMessageStream_currentMessageSnapshot, "f");
  }
  async finalMessage() {
    await this.done();
    return __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_getFinalMessage).call(this);
  }
  async finalText() {
    await this.done();
    return __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_getFinalText).call(this);
  }
  _emit(event, ...args) {
    if (__classPrivateFieldGet(this, _BetaMessageStream_ended, "f"))
      return;
    if (event === "end") {
      __classPrivateFieldSet(this, _BetaMessageStream_ended, true, "f");
      __classPrivateFieldGet(this, _BetaMessageStream_resolveEndPromise, "f").call(this);
    }
    const listeners = __classPrivateFieldGet(this, _BetaMessageStream_listeners, "f")[event];
    if (listeners) {
      __classPrivateFieldGet(this, _BetaMessageStream_listeners, "f")[event] = listeners.filter((l) => !l.once);
      listeners.forEach(({ listener }) => listener(...args));
    }
    if (event === "abort") {
      const error2 = args[0];
      if (!__classPrivateFieldGet(this, _BetaMessageStream_catchingPromiseCreated, "f") && !listeners?.length) {
        Promise.reject(error2);
      }
      __classPrivateFieldGet(this, _BetaMessageStream_rejectConnectedPromise, "f").call(this, error2);
      __classPrivateFieldGet(this, _BetaMessageStream_rejectEndPromise, "f").call(this, error2);
      this._emit("end");
      return;
    }
    if (event === "error") {
      const error2 = args[0];
      if (!__classPrivateFieldGet(this, _BetaMessageStream_catchingPromiseCreated, "f") && !listeners?.length) {
        Promise.reject(error2);
      }
      __classPrivateFieldGet(this, _BetaMessageStream_rejectConnectedPromise, "f").call(this, error2);
      __classPrivateFieldGet(this, _BetaMessageStream_rejectEndPromise, "f").call(this, error2);
      this._emit("end");
    }
  }
  _emitFinal() {
    const finalMessage = this.receivedMessages.at(-1);
    if (finalMessage) {
      this._emit("finalMessage", __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_getFinalMessage).call(this));
    }
  }
  async _fromReadableStream(readableStream, options) {
    const signal = options?.signal;
    let abortHandler;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      abortHandler = this.controller.abort.bind(this.controller);
      signal.addEventListener("abort", abortHandler);
    }
    try {
      __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_beginRequest).call(this);
      this._connected(null);
      const stream = Stream.fromReadableStream(readableStream, this.controller);
      for await (const event of stream) {
        __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_addStreamEvent).call(this, event);
      }
      if (stream.controller.signal?.aborted) {
        throw new APIUserAbortError;
      }
      __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_endRequest).call(this);
    } finally {
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
    }
  }
  [(_BetaMessageStream_currentMessageSnapshot = new WeakMap, _BetaMessageStream_params = new WeakMap, _BetaMessageStream_connectedPromise = new WeakMap, _BetaMessageStream_resolveConnectedPromise = new WeakMap, _BetaMessageStream_rejectConnectedPromise = new WeakMap, _BetaMessageStream_endPromise = new WeakMap, _BetaMessageStream_resolveEndPromise = new WeakMap, _BetaMessageStream_rejectEndPromise = new WeakMap, _BetaMessageStream_listeners = new WeakMap, _BetaMessageStream_ended = new WeakMap, _BetaMessageStream_errored = new WeakMap, _BetaMessageStream_aborted = new WeakMap, _BetaMessageStream_catchingPromiseCreated = new WeakMap, _BetaMessageStream_response = new WeakMap, _BetaMessageStream_request_id = new WeakMap, _BetaMessageStream_logger = new WeakMap, _BetaMessageStream_handleError = new WeakMap, _BetaMessageStream_instances = new WeakSet, _BetaMessageStream_getFinalMessage = function _BetaMessageStream_getFinalMessage2() {
    if (this.receivedMessages.length === 0) {
      throw new AnthropicError("stream ended without producing a Message with role=assistant");
    }
    return this.receivedMessages.at(-1);
  }, _BetaMessageStream_getFinalText = function _BetaMessageStream_getFinalText2() {
    if (this.receivedMessages.length === 0) {
      throw new AnthropicError("stream ended without producing a Message with role=assistant");
    }
    const textBlocks = this.receivedMessages.at(-1).content.filter((block) => block.type === "text").map((block) => block.text);
    if (textBlocks.length === 0) {
      throw new AnthropicError("stream ended without producing a content block with type=text");
    }
    return textBlocks.join(" ");
  }, _BetaMessageStream_beginRequest = function _BetaMessageStream_beginRequest2() {
    if (this.ended)
      return;
    __classPrivateFieldSet(this, _BetaMessageStream_currentMessageSnapshot, undefined, "f");
  }, _BetaMessageStream_addStreamEvent = function _BetaMessageStream_addStreamEvent2(event) {
    if (this.ended)
      return;
    const messageSnapshot = __classPrivateFieldGet(this, _BetaMessageStream_instances, "m", _BetaMessageStream_accumulateMessage).call(this, event);
    this._emit("streamEvent", event, messageSnapshot);
    switch (event.type) {
      case "content_block_delta": {
        const content = messageSnapshot.content.at(-1);
        switch (event.delta.type) {
          case "text_delta": {
            if (content.type === "text") {
              this._emit("text", event.delta.text, content.text || "");
            }
            break;
          }
          case "citations_delta": {
            if (content.type === "text") {
              this._emit("citation", event.delta.citation, content.citations ?? []);
            }
            break;
          }
          case "input_json_delta": {
            if (tracksToolInput(content) && content.input) {
              this._emit("inputJson", event.delta.partial_json, content.input);
            }
            break;
          }
          case "thinking_delta": {
            if (content.type === "thinking") {
              this._emit("thinking", event.delta.thinking, content.thinking);
            }
            break;
          }
          case "signature_delta": {
            if (content.type === "thinking") {
              this._emit("signature", content.signature);
            }
            break;
          }
          case "compaction_delta": {
            if (content.type === "compaction" && content.content) {
              this._emit("compaction", content.content);
            }
            break;
          }
          default:
            checkNever(event.delta);
        }
        break;
      }
      case "message_stop": {
        this._addMessageParam(messageSnapshot);
        this._addMessage(maybeParseBetaMessage(messageSnapshot, __classPrivateFieldGet(this, _BetaMessageStream_params, "f"), { logger: __classPrivateFieldGet(this, _BetaMessageStream_logger, "f") }), true);
        break;
      }
      case "content_block_stop": {
        this._emit("contentBlock", messageSnapshot.content.at(-1));
        break;
      }
      case "message_start": {
        __classPrivateFieldSet(this, _BetaMessageStream_currentMessageSnapshot, messageSnapshot, "f");
        break;
      }
      case "content_block_start":
      case "message_delta":
        break;
    }
  }, _BetaMessageStream_endRequest = function _BetaMessageStream_endRequest2() {
    if (this.ended) {
      throw new AnthropicError(`stream has ended, this shouldn't happen`);
    }
    const snapshot = __classPrivateFieldGet(this, _BetaMessageStream_currentMessageSnapshot, "f");
    if (!snapshot) {
      throw new AnthropicError(`request ended without sending any chunks`);
    }
    __classPrivateFieldSet(this, _BetaMessageStream_currentMessageSnapshot, undefined, "f");
    return maybeParseBetaMessage(snapshot, __classPrivateFieldGet(this, _BetaMessageStream_params, "f"), { logger: __classPrivateFieldGet(this, _BetaMessageStream_logger, "f") });
  }, _BetaMessageStream_accumulateMessage = function _BetaMessageStream_accumulateMessage2(event) {
    let snapshot = __classPrivateFieldGet(this, _BetaMessageStream_currentMessageSnapshot, "f");
    if (event.type === "message_start") {
      if (snapshot) {
        throw new AnthropicError(`Unexpected event order, got ${event.type} before receiving "message_stop"`);
      }
      return event.message;
    }
    if (!snapshot) {
      throw new AnthropicError(`Unexpected event order, got ${event.type} before "message_start"`);
    }
    switch (event.type) {
      case "message_stop":
        return snapshot;
      case "message_delta":
        snapshot.container = event.delta.container;
        snapshot.stop_reason = event.delta.stop_reason;
        snapshot.stop_sequence = event.delta.stop_sequence;
        snapshot.usage.output_tokens = event.usage.output_tokens;
        snapshot.context_management = event.context_management;
        if (event.usage.input_tokens != null) {
          snapshot.usage.input_tokens = event.usage.input_tokens;
        }
        if (event.usage.cache_creation_input_tokens != null) {
          snapshot.usage.cache_creation_input_tokens = event.usage.cache_creation_input_tokens;
        }
        if (event.usage.cache_read_input_tokens != null) {
          snapshot.usage.cache_read_input_tokens = event.usage.cache_read_input_tokens;
        }
        if (event.usage.server_tool_use != null) {
          snapshot.usage.server_tool_use = event.usage.server_tool_use;
        }
        if (event.usage.iterations != null) {
          snapshot.usage.iterations = event.usage.iterations;
        }
        return snapshot;
      case "content_block_start":
        snapshot.content.push(event.content_block);
        return snapshot;
      case "content_block_delta": {
        const snapshotContent = snapshot.content.at(event.index);
        switch (event.delta.type) {
          case "text_delta": {
            if (snapshotContent?.type === "text") {
              snapshot.content[event.index] = {
                ...snapshotContent,
                text: (snapshotContent.text || "") + event.delta.text
              };
            }
            break;
          }
          case "citations_delta": {
            if (snapshotContent?.type === "text") {
              snapshot.content[event.index] = {
                ...snapshotContent,
                citations: [...snapshotContent.citations ?? [], event.delta.citation]
              };
            }
            break;
          }
          case "input_json_delta": {
            if (snapshotContent && tracksToolInput(snapshotContent)) {
              let jsonBuf = snapshotContent[JSON_BUF_PROPERTY] || "";
              jsonBuf += event.delta.partial_json;
              const newContent = { ...snapshotContent };
              Object.defineProperty(newContent, JSON_BUF_PROPERTY, {
                value: jsonBuf,
                enumerable: false,
                writable: true
              });
              if (jsonBuf) {
                try {
                  newContent.input = partialParse(jsonBuf);
                } catch (err) {
                  const error2 = new AnthropicError(`Unable to parse tool parameter JSON from model. Please retry your request or adjust your prompt. Error: ${err}. JSON: ${jsonBuf}`);
                  __classPrivateFieldGet(this, _BetaMessageStream_handleError, "f").call(this, error2);
                }
              }
              snapshot.content[event.index] = newContent;
            }
            break;
          }
          case "thinking_delta": {
            if (snapshotContent?.type === "thinking") {
              snapshot.content[event.index] = {
                ...snapshotContent,
                thinking: snapshotContent.thinking + event.delta.thinking
              };
            }
            break;
          }
          case "signature_delta": {
            if (snapshotContent?.type === "thinking") {
              snapshot.content[event.index] = {
                ...snapshotContent,
                signature: event.delta.signature
              };
            }
            break;
          }
          case "compaction_delta": {
            if (snapshotContent?.type === "compaction") {
              snapshot.content[event.index] = {
                ...snapshotContent,
                content: (snapshotContent.content || "") + event.delta.content
              };
            }
            break;
          }
          default:
            checkNever(event.delta);
        }
        return snapshot;
      }
      case "content_block_stop":
        return snapshot;
    }
  }, Symbol.asyncIterator)]() {
    const pushQueue = [];
    const readQueue = [];
    let done = false;
    this.on("streamEvent", (event) => {
      const reader = readQueue.shift();
      if (reader) {
        reader.resolve(event);
      } else {
        pushQueue.push(event);
      }
    });
    this.on("end", () => {
      done = true;
      for (const reader of readQueue) {
        reader.resolve(undefined);
      }
      readQueue.length = 0;
    });
    this.on("abort", (err) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err);
      }
      readQueue.length = 0;
    });
    this.on("error", (err) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err);
      }
      readQueue.length = 0;
    });
    return {
      next: async () => {
        if (!pushQueue.length) {
          if (done) {
            return { value: undefined, done: true };
          }
          return new Promise((resolve, reject) => readQueue.push({ resolve, reject })).then((chunk2) => chunk2 ? { value: chunk2, done: false } : { value: undefined, done: true });
        }
        const chunk = pushQueue.shift();
        return { value: chunk, done: false };
      },
      return: async () => {
        this.abort();
        return { value: undefined, done: true };
      }
    };
  }
  toReadableStream() {
    const stream = new Stream(this[Symbol.asyncIterator].bind(this), this.controller);
    return stream.toReadableStream();
  }
}
function checkNever(x) {}

// node_modules/@anthropic-ai/sdk/lib/tools/ToolError.mjs
class ToolError extends Error {
  constructor(content) {
    const message = typeof content === "string" ? content : content.map((block) => {
      if (block.type === "text")
        return block.text;
      return `[${block.type}]`;
    }).join(" ");
    super(message);
    this.name = "ToolError";
    this.content = content;
  }
}

// node_modules/@anthropic-ai/sdk/lib/tools/CompactionControl.mjs
var DEFAULT_TOKEN_THRESHOLD = 1e5;
var DEFAULT_SUMMARY_PROMPT = `You have been working on the task described above but have not yet completed it. Write a continuation summary that will allow you (or another instance of yourself) to resume work efficiently in a future context window where the conversation history will be replaced with this summary. Your summary should be structured, concise, and actionable. Include:
1. Task Overview
The user's core request and success criteria
Any clarifications or constraints they specified
2. Current State
What has been completed so far
Files created, modified, or analyzed (with paths if relevant)
Key outputs or artifacts produced
3. Important Discoveries
Technical constraints or requirements uncovered
Decisions made and their rationale
Errors encountered and how they were resolved
What approaches were tried that didn't work (and why)
4. Next Steps
Specific actions needed to complete the task
Any blockers or open questions to resolve
Priority order if multiple steps remain
5. Context to Preserve
User preferences or style requirements
Domain-specific details that aren't obvious
Any promises made to the user
Be concise but complete—err on the side of including information that would prevent duplicate work or repeated mistakes. Write in a way that enables immediate resumption of the task.
Wrap your summary in <summary></summary> tags.`;

// node_modules/@anthropic-ai/sdk/lib/tools/BetaToolRunner.mjs
var _BetaToolRunner_instances;
var _BetaToolRunner_consumed;
var _BetaToolRunner_mutated;
var _BetaToolRunner_state;
var _BetaToolRunner_options;
var _BetaToolRunner_message;
var _BetaToolRunner_toolResponse;
var _BetaToolRunner_completion;
var _BetaToolRunner_iterationCount;
var _BetaToolRunner_checkAndCompact;
var _BetaToolRunner_generateToolResponse;
function promiseWithResolvers() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class BetaToolRunner {
  constructor(client, params, options) {
    _BetaToolRunner_instances.add(this);
    this.client = client;
    _BetaToolRunner_consumed.set(this, false);
    _BetaToolRunner_mutated.set(this, false);
    _BetaToolRunner_state.set(this, undefined);
    _BetaToolRunner_options.set(this, undefined);
    _BetaToolRunner_message.set(this, undefined);
    _BetaToolRunner_toolResponse.set(this, undefined);
    _BetaToolRunner_completion.set(this, undefined);
    _BetaToolRunner_iterationCount.set(this, 0);
    __classPrivateFieldSet(this, _BetaToolRunner_state, {
      params: {
        ...params,
        messages: structuredClone(params.messages)
      }
    }, "f");
    const helpers = collectStainlessHelpers(params.tools, params.messages);
    const helperValue = ["BetaToolRunner", ...helpers].join(", ");
    __classPrivateFieldSet(this, _BetaToolRunner_options, {
      ...options,
      headers: buildHeaders([{ "x-stainless-helper": helperValue }, options?.headers])
    }, "f");
    __classPrivateFieldSet(this, _BetaToolRunner_completion, promiseWithResolvers(), "f");
  }
  async* [(_BetaToolRunner_consumed = new WeakMap, _BetaToolRunner_mutated = new WeakMap, _BetaToolRunner_state = new WeakMap, _BetaToolRunner_options = new WeakMap, _BetaToolRunner_message = new WeakMap, _BetaToolRunner_toolResponse = new WeakMap, _BetaToolRunner_completion = new WeakMap, _BetaToolRunner_iterationCount = new WeakMap, _BetaToolRunner_instances = new WeakSet, _BetaToolRunner_checkAndCompact = async function _BetaToolRunner_checkAndCompact2() {
    const compactionControl = __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.compactionControl;
    if (!compactionControl || !compactionControl.enabled) {
      return false;
    }
    let tokensUsed = 0;
    if (__classPrivateFieldGet(this, _BetaToolRunner_message, "f") !== undefined) {
      try {
        const message = await __classPrivateFieldGet(this, _BetaToolRunner_message, "f");
        const totalInputTokens = message.usage.input_tokens + (message.usage.cache_creation_input_tokens ?? 0) + (message.usage.cache_read_input_tokens ?? 0);
        tokensUsed = totalInputTokens + message.usage.output_tokens;
      } catch {
        return false;
      }
    }
    const threshold = compactionControl.contextTokenThreshold ?? DEFAULT_TOKEN_THRESHOLD;
    if (tokensUsed < threshold) {
      return false;
    }
    const model = compactionControl.model ?? __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.model;
    const summaryPrompt = compactionControl.summaryPrompt ?? DEFAULT_SUMMARY_PROMPT;
    const messages = __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.messages;
    if (messages[messages.length - 1].role === "assistant") {
      const lastMessage = messages[messages.length - 1];
      if (Array.isArray(lastMessage.content)) {
        const nonToolBlocks = lastMessage.content.filter((block) => block.type !== "tool_use");
        if (nonToolBlocks.length === 0) {
          messages.pop();
        } else {
          lastMessage.content = nonToolBlocks;
        }
      }
    }
    const response = await this.client.beta.messages.create({
      model,
      messages: [
        ...messages,
        {
          role: "user",
          content: [
            {
              type: "text",
              text: summaryPrompt
            }
          ]
        }
      ],
      max_tokens: __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.max_tokens
    }, {
      headers: { "x-stainless-helper": "compaction" }
    });
    if (response.content[0]?.type !== "text") {
      throw new AnthropicError("Expected text response for compaction");
    }
    __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.messages = [
      {
        role: "user",
        content: response.content
      }
    ];
    return true;
  }, Symbol.asyncIterator)]() {
    var _a;
    if (__classPrivateFieldGet(this, _BetaToolRunner_consumed, "f")) {
      throw new AnthropicError("Cannot iterate over a consumed stream");
    }
    __classPrivateFieldSet(this, _BetaToolRunner_consumed, true, "f");
    __classPrivateFieldSet(this, _BetaToolRunner_mutated, true, "f");
    __classPrivateFieldSet(this, _BetaToolRunner_toolResponse, undefined, "f");
    try {
      while (true) {
        let stream;
        try {
          if (__classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.max_iterations && __classPrivateFieldGet(this, _BetaToolRunner_iterationCount, "f") >= __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.max_iterations) {
            break;
          }
          __classPrivateFieldSet(this, _BetaToolRunner_mutated, false, "f");
          __classPrivateFieldSet(this, _BetaToolRunner_toolResponse, undefined, "f");
          __classPrivateFieldSet(this, _BetaToolRunner_iterationCount, (_a = __classPrivateFieldGet(this, _BetaToolRunner_iterationCount, "f"), _a++, _a), "f");
          __classPrivateFieldSet(this, _BetaToolRunner_message, undefined, "f");
          const { max_iterations, compactionControl, ...params } = __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params;
          if (params.stream) {
            stream = this.client.beta.messages.stream({ ...params }, __classPrivateFieldGet(this, _BetaToolRunner_options, "f"));
            __classPrivateFieldSet(this, _BetaToolRunner_message, stream.finalMessage(), "f");
            __classPrivateFieldGet(this, _BetaToolRunner_message, "f").catch(() => {});
            yield stream;
          } else {
            __classPrivateFieldSet(this, _BetaToolRunner_message, this.client.beta.messages.create({ ...params, stream: false }, __classPrivateFieldGet(this, _BetaToolRunner_options, "f")), "f");
            yield __classPrivateFieldGet(this, _BetaToolRunner_message, "f");
          }
          const isCompacted = await __classPrivateFieldGet(this, _BetaToolRunner_instances, "m", _BetaToolRunner_checkAndCompact).call(this);
          if (!isCompacted) {
            if (!__classPrivateFieldGet(this, _BetaToolRunner_mutated, "f")) {
              const { role, content } = await __classPrivateFieldGet(this, _BetaToolRunner_message, "f");
              __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.messages.push({ role, content });
            }
            const toolMessage = await __classPrivateFieldGet(this, _BetaToolRunner_instances, "m", _BetaToolRunner_generateToolResponse).call(this, __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.messages.at(-1));
            if (toolMessage) {
              __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params.messages.push(toolMessage);
            } else if (!__classPrivateFieldGet(this, _BetaToolRunner_mutated, "f")) {
              break;
            }
          }
        } finally {
          if (stream) {
            stream.abort();
          }
        }
      }
      if (!__classPrivateFieldGet(this, _BetaToolRunner_message, "f")) {
        throw new AnthropicError("ToolRunner concluded without a message from the server");
      }
      __classPrivateFieldGet(this, _BetaToolRunner_completion, "f").resolve(await __classPrivateFieldGet(this, _BetaToolRunner_message, "f"));
    } catch (error2) {
      __classPrivateFieldSet(this, _BetaToolRunner_consumed, false, "f");
      __classPrivateFieldGet(this, _BetaToolRunner_completion, "f").promise.catch(() => {});
      __classPrivateFieldGet(this, _BetaToolRunner_completion, "f").reject(error2);
      __classPrivateFieldSet(this, _BetaToolRunner_completion, promiseWithResolvers(), "f");
      throw error2;
    }
  }
  setMessagesParams(paramsOrMutator) {
    if (typeof paramsOrMutator === "function") {
      __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params = paramsOrMutator(__classPrivateFieldGet(this, _BetaToolRunner_state, "f").params);
    } else {
      __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params = paramsOrMutator;
    }
    __classPrivateFieldSet(this, _BetaToolRunner_mutated, true, "f");
    __classPrivateFieldSet(this, _BetaToolRunner_toolResponse, undefined, "f");
  }
  async generateToolResponse() {
    const message = await __classPrivateFieldGet(this, _BetaToolRunner_message, "f") ?? this.params.messages.at(-1);
    if (!message) {
      return null;
    }
    return __classPrivateFieldGet(this, _BetaToolRunner_instances, "m", _BetaToolRunner_generateToolResponse).call(this, message);
  }
  done() {
    return __classPrivateFieldGet(this, _BetaToolRunner_completion, "f").promise;
  }
  async runUntilDone() {
    if (!__classPrivateFieldGet(this, _BetaToolRunner_consumed, "f")) {
      for await (const _ of this) {}
    }
    return this.done();
  }
  get params() {
    return __classPrivateFieldGet(this, _BetaToolRunner_state, "f").params;
  }
  pushMessages(...messages) {
    this.setMessagesParams((params) => ({
      ...params,
      messages: [...params.messages, ...messages]
    }));
  }
  then(onfulfilled, onrejected) {
    return this.runUntilDone().then(onfulfilled, onrejected);
  }
}
_BetaToolRunner_generateToolResponse = async function _BetaToolRunner_generateToolResponse2(lastMessage) {
  if (__classPrivateFieldGet(this, _BetaToolRunner_toolResponse, "f") !== undefined) {
    return __classPrivateFieldGet(this, _BetaToolRunner_toolResponse, "f");
  }
  __classPrivateFieldSet(this, _BetaToolRunner_toolResponse, generateToolResponse(__classPrivateFieldGet(this, _BetaToolRunner_state, "f").params, lastMessage), "f");
  return __classPrivateFieldGet(this, _BetaToolRunner_toolResponse, "f");
};
async function generateToolResponse(params, lastMessage = params.messages.at(-1)) {
  if (!lastMessage || lastMessage.role !== "assistant" || !lastMessage.content || typeof lastMessage.content === "string") {
    return null;
  }
  const toolUseBlocks = lastMessage.content.filter((content) => content.type === "tool_use");
  if (toolUseBlocks.length === 0) {
    return null;
  }
  const toolResults = await Promise.all(toolUseBlocks.map(async (toolUse) => {
    const tool = params.tools.find((t) => ("name" in t ? t.name : t.mcp_server_name) === toolUse.name);
    if (!tool || !("run" in tool)) {
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: `Error: Tool '${toolUse.name}' not found`,
        is_error: true
      };
    }
    try {
      let input = toolUse.input;
      if ("parse" in tool && tool.parse) {
        input = tool.parse(input);
      }
      const result = await tool.run(input);
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result
      };
    } catch (error2) {
      return {
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: error2 instanceof ToolError ? error2.content : `Error: ${error2 instanceof Error ? error2.message : String(error2)}`,
        is_error: true
      };
    }
  }));
  return {
    role: "user",
    content: toolResults
  };
}

// node_modules/@anthropic-ai/sdk/internal/decoders/jsonl.mjs
class JSONLDecoder {
  constructor(iterator, controller) {
    this.iterator = iterator;
    this.controller = controller;
  }
  async* decoder() {
    const lineDecoder = new LineDecoder;
    for await (const chunk of this.iterator) {
      for (const line of lineDecoder.decode(chunk)) {
        yield JSON.parse(line);
      }
    }
    for (const line of lineDecoder.flush()) {
      yield JSON.parse(line);
    }
  }
  [Symbol.asyncIterator]() {
    return this.decoder();
  }
  static fromResponse(response, controller) {
    if (!response.body) {
      controller.abort();
      if (typeof globalThis.navigator !== "undefined" && globalThis.navigator.product === "ReactNative") {
        throw new AnthropicError(`The default react-native fetch implementation does not support streaming. Please use expo/fetch: https://docs.expo.dev/versions/latest/sdk/expo/#expofetch-api`);
      }
      throw new AnthropicError(`Attempted to iterate over a response with no body`);
    }
    return new JSONLDecoder(ReadableStreamToAsyncIterable(response.body), controller);
  }
}

// node_modules/@anthropic-ai/sdk/resources/beta/messages/batches.mjs
class Batches extends APIResource {
  create(params, options) {
    const { betas, ...body } = params;
    return this._client.post("/v1/messages/batches?beta=true", {
      body,
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "message-batches-2024-09-24"].toString() },
        options?.headers
      ])
    });
  }
  retrieve(messageBatchID, params = {}, options) {
    const { betas } = params ?? {};
    return this._client.get(path3`/v1/messages/batches/${messageBatchID}?beta=true`, {
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "message-batches-2024-09-24"].toString() },
        options?.headers
      ])
    });
  }
  list(params = {}, options) {
    const { betas, ...query } = params ?? {};
    return this._client.getAPIList("/v1/messages/batches?beta=true", Page, {
      query,
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "message-batches-2024-09-24"].toString() },
        options?.headers
      ])
    });
  }
  delete(messageBatchID, params = {}, options) {
    const { betas } = params ?? {};
    return this._client.delete(path3`/v1/messages/batches/${messageBatchID}?beta=true`, {
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "message-batches-2024-09-24"].toString() },
        options?.headers
      ])
    });
  }
  cancel(messageBatchID, params = {}, options) {
    const { betas } = params ?? {};
    return this._client.post(path3`/v1/messages/batches/${messageBatchID}/cancel?beta=true`, {
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "message-batches-2024-09-24"].toString() },
        options?.headers
      ])
    });
  }
  async results(messageBatchID, params = {}, options) {
    const batch = await this.retrieve(messageBatchID);
    if (!batch.results_url) {
      throw new AnthropicError(`No batch \`results_url\`; Has it finished processing? ${batch.processing_status} - ${batch.id}`);
    }
    const { betas } = params ?? {};
    return this._client.get(batch.results_url, {
      ...options,
      headers: buildHeaders([
        {
          "anthropic-beta": [...betas ?? [], "message-batches-2024-09-24"].toString(),
          Accept: "application/binary"
        },
        options?.headers
      ]),
      stream: true,
      __binaryResponse: true
    })._thenUnwrap((_, props) => JSONLDecoder.fromResponse(props.response, props.controller));
  }
}

// node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.mjs
var DEPRECATED_MODELS = {
  "claude-1.3": "November 6th, 2024",
  "claude-1.3-100k": "November 6th, 2024",
  "claude-instant-1.1": "November 6th, 2024",
  "claude-instant-1.1-100k": "November 6th, 2024",
  "claude-instant-1.2": "November 6th, 2024",
  "claude-3-sonnet-20240229": "July 21st, 2025",
  "claude-3-opus-20240229": "January 5th, 2026",
  "claude-2.1": "July 21st, 2025",
  "claude-2.0": "July 21st, 2025",
  "claude-3-7-sonnet-latest": "February 19th, 2026",
  "claude-3-7-sonnet-20250219": "February 19th, 2026"
};
var MODELS_TO_WARN_WITH_THINKING_ENABLED = ["claude-opus-4-6"];

class Messages extends APIResource {
  constructor() {
    super(...arguments);
    this.batches = new Batches(this._client);
  }
  create(params, options) {
    const modifiedParams = transformOutputFormat(params);
    const { betas, ...body } = modifiedParams;
    if (body.model in DEPRECATED_MODELS) {
      console.warn(`The model '${body.model}' is deprecated and will reach end-of-life on ${DEPRECATED_MODELS[body.model]}
Please migrate to a newer model. Visit https://docs.anthropic.com/en/docs/resources/model-deprecations for more information.`);
    }
    if (body.model in MODELS_TO_WARN_WITH_THINKING_ENABLED && body.thinking && body.thinking.type === "enabled") {
      console.warn(`Using Claude with ${body.model} and 'thinking.type=enabled' is deprecated. Use 'thinking.type=adaptive' instead which results in better model performance in our testing: https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking`);
    }
    let timeout = this._client._options.timeout;
    if (!body.stream && timeout == null) {
      const maxNonstreamingTokens = MODEL_NONSTREAMING_TOKENS[body.model] ?? undefined;
      timeout = this._client.calculateNonstreamingTimeout(body.max_tokens, maxNonstreamingTokens);
    }
    const helperHeader = stainlessHelperHeader(body.tools, body.messages);
    return this._client.post("/v1/messages?beta=true", {
      body,
      timeout: timeout ?? 600000,
      ...options,
      headers: buildHeaders([
        { ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : undefined },
        helperHeader,
        options?.headers
      ]),
      stream: modifiedParams.stream ?? false
    });
  }
  parse(params, options) {
    options = {
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...params.betas ?? [], "structured-outputs-2025-12-15"].toString() },
        options?.headers
      ])
    };
    return this.create(params, options).then((message) => parseBetaMessage(message, params, { logger: this._client.logger ?? console }));
  }
  stream(body, options) {
    return BetaMessageStream.createMessage(this, body, options);
  }
  countTokens(params, options) {
    const modifiedParams = transformOutputFormat(params);
    const { betas, ...body } = modifiedParams;
    return this._client.post("/v1/messages/count_tokens?beta=true", {
      body,
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "token-counting-2024-11-01"].toString() },
        options?.headers
      ])
    });
  }
  toolRunner(body, options) {
    return new BetaToolRunner(this._client, body, options);
  }
}
function transformOutputFormat(params) {
  if (!params.output_format) {
    return params;
  }
  if (params.output_config?.format) {
    throw new AnthropicError("Both output_format and output_config.format were provided. " + "Please use only output_config.format (output_format is deprecated).");
  }
  const { output_format, ...rest } = params;
  return {
    ...rest,
    output_config: {
      ...params.output_config,
      format: output_format
    }
  };
}
Messages.Batches = Batches;
Messages.BetaToolRunner = BetaToolRunner;
Messages.ToolError = ToolError;

// node_modules/@anthropic-ai/sdk/resources/beta/skills/versions.mjs
class Versions extends APIResource {
  create(skillID, params = {}, options) {
    const { betas, ...body } = params ?? {};
    return this._client.post(path3`/v1/skills/${skillID}/versions?beta=true`, multipartFormRequestOptions({
      body,
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "skills-2025-10-02"].toString() },
        options?.headers
      ])
    }, this._client));
  }
  retrieve(version, params, options) {
    const { skill_id, betas } = params;
    return this._client.get(path3`/v1/skills/${skill_id}/versions/${version}?beta=true`, {
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "skills-2025-10-02"].toString() },
        options?.headers
      ])
    });
  }
  list(skillID, params = {}, options) {
    const { betas, ...query } = params ?? {};
    return this._client.getAPIList(path3`/v1/skills/${skillID}/versions?beta=true`, PageCursor, {
      query,
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "skills-2025-10-02"].toString() },
        options?.headers
      ])
    });
  }
  delete(version, params, options) {
    const { skill_id, betas } = params;
    return this._client.delete(path3`/v1/skills/${skill_id}/versions/${version}?beta=true`, {
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "skills-2025-10-02"].toString() },
        options?.headers
      ])
    });
  }
}

// node_modules/@anthropic-ai/sdk/resources/beta/skills/skills.mjs
class Skills extends APIResource {
  constructor() {
    super(...arguments);
    this.versions = new Versions(this._client);
  }
  create(params = {}, options) {
    const { betas, ...body } = params ?? {};
    return this._client.post("/v1/skills?beta=true", multipartFormRequestOptions({
      body,
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "skills-2025-10-02"].toString() },
        options?.headers
      ])
    }, this._client, false));
  }
  retrieve(skillID, params = {}, options) {
    const { betas } = params ?? {};
    return this._client.get(path3`/v1/skills/${skillID}?beta=true`, {
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "skills-2025-10-02"].toString() },
        options?.headers
      ])
    });
  }
  list(params = {}, options) {
    const { betas, ...query } = params ?? {};
    return this._client.getAPIList("/v1/skills?beta=true", PageCursor, {
      query,
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "skills-2025-10-02"].toString() },
        options?.headers
      ])
    });
  }
  delete(skillID, params = {}, options) {
    const { betas } = params ?? {};
    return this._client.delete(path3`/v1/skills/${skillID}?beta=true`, {
      ...options,
      headers: buildHeaders([
        { "anthropic-beta": [...betas ?? [], "skills-2025-10-02"].toString() },
        options?.headers
      ])
    });
  }
}
Skills.Versions = Versions;

// node_modules/@anthropic-ai/sdk/resources/beta/beta.mjs
class Beta extends APIResource {
  constructor() {
    super(...arguments);
    this.models = new Models(this._client);
    this.messages = new Messages(this._client);
    this.files = new Files(this._client);
    this.skills = new Skills(this._client);
  }
}
Beta.Models = Models;
Beta.Messages = Messages;
Beta.Files = Files;
Beta.Skills = Skills;
// node_modules/@anthropic-ai/sdk/resources/completions.mjs
class Completions extends APIResource {
  create(params, options) {
    const { betas, ...body } = params;
    return this._client.post("/v1/complete", {
      body,
      timeout: this._client._options.timeout ?? 600000,
      ...options,
      headers: buildHeaders([
        { ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : undefined },
        options?.headers
      ]),
      stream: params.stream ?? false
    });
  }
}
// node_modules/@anthropic-ai/sdk/lib/parser.mjs
function getOutputFormat2(params) {
  return params?.output_config?.format;
}
function maybeParseMessage(message, params, opts) {
  const outputFormat = getOutputFormat2(params);
  if (!params || !("parse" in (outputFormat ?? {}))) {
    return {
      ...message,
      content: message.content.map((block) => {
        if (block.type === "text") {
          const parsedBlock = Object.defineProperty({ ...block }, "parsed_output", {
            value: null,
            enumerable: false
          });
          return parsedBlock;
        }
        return block;
      }),
      parsed_output: null
    };
  }
  return parseMessage(message, params, opts);
}
function parseMessage(message, params, opts) {
  let firstParsedOutput = null;
  const content = message.content.map((block) => {
    if (block.type === "text") {
      const parsedOutput = parseOutputFormat(params, block.text);
      if (firstParsedOutput === null) {
        firstParsedOutput = parsedOutput;
      }
      const parsedBlock = Object.defineProperty({ ...block }, "parsed_output", {
        value: parsedOutput,
        enumerable: false
      });
      return parsedBlock;
    }
    return block;
  });
  return {
    ...message,
    content,
    parsed_output: firstParsedOutput
  };
}
function parseOutputFormat(params, content) {
  const outputFormat = getOutputFormat2(params);
  if (outputFormat?.type !== "json_schema") {
    return null;
  }
  try {
    if ("parse" in outputFormat) {
      return outputFormat.parse(content);
    }
    return JSON.parse(content);
  } catch (error2) {
    throw new AnthropicError(`Failed to parse structured output: ${error2}`);
  }
}

// node_modules/@anthropic-ai/sdk/lib/MessageStream.mjs
var _MessageStream_instances;
var _MessageStream_currentMessageSnapshot;
var _MessageStream_params;
var _MessageStream_connectedPromise;
var _MessageStream_resolveConnectedPromise;
var _MessageStream_rejectConnectedPromise;
var _MessageStream_endPromise;
var _MessageStream_resolveEndPromise;
var _MessageStream_rejectEndPromise;
var _MessageStream_listeners;
var _MessageStream_ended;
var _MessageStream_errored;
var _MessageStream_aborted;
var _MessageStream_catchingPromiseCreated;
var _MessageStream_response;
var _MessageStream_request_id;
var _MessageStream_logger;
var _MessageStream_getFinalMessage;
var _MessageStream_getFinalText;
var _MessageStream_handleError;
var _MessageStream_beginRequest;
var _MessageStream_addStreamEvent;
var _MessageStream_endRequest;
var _MessageStream_accumulateMessage;
var JSON_BUF_PROPERTY2 = "__json_buf";
function tracksToolInput2(content) {
  return content.type === "tool_use" || content.type === "server_tool_use";
}

class MessageStream {
  constructor(params, opts) {
    _MessageStream_instances.add(this);
    this.messages = [];
    this.receivedMessages = [];
    _MessageStream_currentMessageSnapshot.set(this, undefined);
    _MessageStream_params.set(this, null);
    this.controller = new AbortController;
    _MessageStream_connectedPromise.set(this, undefined);
    _MessageStream_resolveConnectedPromise.set(this, () => {});
    _MessageStream_rejectConnectedPromise.set(this, () => {});
    _MessageStream_endPromise.set(this, undefined);
    _MessageStream_resolveEndPromise.set(this, () => {});
    _MessageStream_rejectEndPromise.set(this, () => {});
    _MessageStream_listeners.set(this, {});
    _MessageStream_ended.set(this, false);
    _MessageStream_errored.set(this, false);
    _MessageStream_aborted.set(this, false);
    _MessageStream_catchingPromiseCreated.set(this, false);
    _MessageStream_response.set(this, undefined);
    _MessageStream_request_id.set(this, undefined);
    _MessageStream_logger.set(this, undefined);
    _MessageStream_handleError.set(this, (error2) => {
      __classPrivateFieldSet(this, _MessageStream_errored, true, "f");
      if (isAbortError(error2)) {
        error2 = new APIUserAbortError;
      }
      if (error2 instanceof APIUserAbortError) {
        __classPrivateFieldSet(this, _MessageStream_aborted, true, "f");
        return this._emit("abort", error2);
      }
      if (error2 instanceof AnthropicError) {
        return this._emit("error", error2);
      }
      if (error2 instanceof Error) {
        const anthropicError = new AnthropicError(error2.message);
        anthropicError.cause = error2;
        return this._emit("error", anthropicError);
      }
      return this._emit("error", new AnthropicError(String(error2)));
    });
    __classPrivateFieldSet(this, _MessageStream_connectedPromise, new Promise((resolve, reject) => {
      __classPrivateFieldSet(this, _MessageStream_resolveConnectedPromise, resolve, "f");
      __classPrivateFieldSet(this, _MessageStream_rejectConnectedPromise, reject, "f");
    }), "f");
    __classPrivateFieldSet(this, _MessageStream_endPromise, new Promise((resolve, reject) => {
      __classPrivateFieldSet(this, _MessageStream_resolveEndPromise, resolve, "f");
      __classPrivateFieldSet(this, _MessageStream_rejectEndPromise, reject, "f");
    }), "f");
    __classPrivateFieldGet(this, _MessageStream_connectedPromise, "f").catch(() => {});
    __classPrivateFieldGet(this, _MessageStream_endPromise, "f").catch(() => {});
    __classPrivateFieldSet(this, _MessageStream_params, params, "f");
    __classPrivateFieldSet(this, _MessageStream_logger, opts?.logger ?? console, "f");
  }
  get response() {
    return __classPrivateFieldGet(this, _MessageStream_response, "f");
  }
  get request_id() {
    return __classPrivateFieldGet(this, _MessageStream_request_id, "f");
  }
  async withResponse() {
    __classPrivateFieldSet(this, _MessageStream_catchingPromiseCreated, true, "f");
    const response = await __classPrivateFieldGet(this, _MessageStream_connectedPromise, "f");
    if (!response) {
      throw new Error("Could not resolve a `Response` object");
    }
    return {
      data: this,
      response,
      request_id: response.headers.get("request-id")
    };
  }
  static fromReadableStream(stream) {
    const runner = new MessageStream(null);
    runner._run(() => runner._fromReadableStream(stream));
    return runner;
  }
  static createMessage(messages, params, options, { logger } = {}) {
    const runner = new MessageStream(params, { logger });
    for (const message of params.messages) {
      runner._addMessageParam(message);
    }
    __classPrivateFieldSet(runner, _MessageStream_params, { ...params, stream: true }, "f");
    runner._run(() => runner._createMessage(messages, { ...params, stream: true }, { ...options, headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" } }));
    return runner;
  }
  _run(executor) {
    executor().then(() => {
      this._emitFinal();
      this._emit("end");
    }, __classPrivateFieldGet(this, _MessageStream_handleError, "f"));
  }
  _addMessageParam(message) {
    this.messages.push(message);
  }
  _addMessage(message, emit = true) {
    this.receivedMessages.push(message);
    if (emit) {
      this._emit("message", message);
    }
  }
  async _createMessage(messages, params, options) {
    const signal = options?.signal;
    let abortHandler;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      abortHandler = this.controller.abort.bind(this.controller);
      signal.addEventListener("abort", abortHandler);
    }
    try {
      __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_beginRequest).call(this);
      const { response, data: stream } = await messages.create({ ...params, stream: true }, { ...options, signal: this.controller.signal }).withResponse();
      this._connected(response);
      for await (const event of stream) {
        __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_addStreamEvent).call(this, event);
      }
      if (stream.controller.signal?.aborted) {
        throw new APIUserAbortError;
      }
      __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_endRequest).call(this);
    } finally {
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
    }
  }
  _connected(response) {
    if (this.ended)
      return;
    __classPrivateFieldSet(this, _MessageStream_response, response, "f");
    __classPrivateFieldSet(this, _MessageStream_request_id, response?.headers.get("request-id"), "f");
    __classPrivateFieldGet(this, _MessageStream_resolveConnectedPromise, "f").call(this, response);
    this._emit("connect");
  }
  get ended() {
    return __classPrivateFieldGet(this, _MessageStream_ended, "f");
  }
  get errored() {
    return __classPrivateFieldGet(this, _MessageStream_errored, "f");
  }
  get aborted() {
    return __classPrivateFieldGet(this, _MessageStream_aborted, "f");
  }
  abort() {
    this.controller.abort();
  }
  on(event, listener) {
    const listeners = __classPrivateFieldGet(this, _MessageStream_listeners, "f")[event] || (__classPrivateFieldGet(this, _MessageStream_listeners, "f")[event] = []);
    listeners.push({ listener });
    return this;
  }
  off(event, listener) {
    const listeners = __classPrivateFieldGet(this, _MessageStream_listeners, "f")[event];
    if (!listeners)
      return this;
    const index = listeners.findIndex((l) => l.listener === listener);
    if (index >= 0)
      listeners.splice(index, 1);
    return this;
  }
  once(event, listener) {
    const listeners = __classPrivateFieldGet(this, _MessageStream_listeners, "f")[event] || (__classPrivateFieldGet(this, _MessageStream_listeners, "f")[event] = []);
    listeners.push({ listener, once: true });
    return this;
  }
  emitted(event) {
    return new Promise((resolve, reject) => {
      __classPrivateFieldSet(this, _MessageStream_catchingPromiseCreated, true, "f");
      if (event !== "error")
        this.once("error", reject);
      this.once(event, resolve);
    });
  }
  async done() {
    __classPrivateFieldSet(this, _MessageStream_catchingPromiseCreated, true, "f");
    await __classPrivateFieldGet(this, _MessageStream_endPromise, "f");
  }
  get currentMessage() {
    return __classPrivateFieldGet(this, _MessageStream_currentMessageSnapshot, "f");
  }
  async finalMessage() {
    await this.done();
    return __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_getFinalMessage).call(this);
  }
  async finalText() {
    await this.done();
    return __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_getFinalText).call(this);
  }
  _emit(event, ...args) {
    if (__classPrivateFieldGet(this, _MessageStream_ended, "f"))
      return;
    if (event === "end") {
      __classPrivateFieldSet(this, _MessageStream_ended, true, "f");
      __classPrivateFieldGet(this, _MessageStream_resolveEndPromise, "f").call(this);
    }
    const listeners = __classPrivateFieldGet(this, _MessageStream_listeners, "f")[event];
    if (listeners) {
      __classPrivateFieldGet(this, _MessageStream_listeners, "f")[event] = listeners.filter((l) => !l.once);
      listeners.forEach(({ listener }) => listener(...args));
    }
    if (event === "abort") {
      const error2 = args[0];
      if (!__classPrivateFieldGet(this, _MessageStream_catchingPromiseCreated, "f") && !listeners?.length) {
        Promise.reject(error2);
      }
      __classPrivateFieldGet(this, _MessageStream_rejectConnectedPromise, "f").call(this, error2);
      __classPrivateFieldGet(this, _MessageStream_rejectEndPromise, "f").call(this, error2);
      this._emit("end");
      return;
    }
    if (event === "error") {
      const error2 = args[0];
      if (!__classPrivateFieldGet(this, _MessageStream_catchingPromiseCreated, "f") && !listeners?.length) {
        Promise.reject(error2);
      }
      __classPrivateFieldGet(this, _MessageStream_rejectConnectedPromise, "f").call(this, error2);
      __classPrivateFieldGet(this, _MessageStream_rejectEndPromise, "f").call(this, error2);
      this._emit("end");
    }
  }
  _emitFinal() {
    const finalMessage = this.receivedMessages.at(-1);
    if (finalMessage) {
      this._emit("finalMessage", __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_getFinalMessage).call(this));
    }
  }
  async _fromReadableStream(readableStream, options) {
    const signal = options?.signal;
    let abortHandler;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      abortHandler = this.controller.abort.bind(this.controller);
      signal.addEventListener("abort", abortHandler);
    }
    try {
      __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_beginRequest).call(this);
      this._connected(null);
      const stream = Stream.fromReadableStream(readableStream, this.controller);
      for await (const event of stream) {
        __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_addStreamEvent).call(this, event);
      }
      if (stream.controller.signal?.aborted) {
        throw new APIUserAbortError;
      }
      __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_endRequest).call(this);
    } finally {
      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }
    }
  }
  [(_MessageStream_currentMessageSnapshot = new WeakMap, _MessageStream_params = new WeakMap, _MessageStream_connectedPromise = new WeakMap, _MessageStream_resolveConnectedPromise = new WeakMap, _MessageStream_rejectConnectedPromise = new WeakMap, _MessageStream_endPromise = new WeakMap, _MessageStream_resolveEndPromise = new WeakMap, _MessageStream_rejectEndPromise = new WeakMap, _MessageStream_listeners = new WeakMap, _MessageStream_ended = new WeakMap, _MessageStream_errored = new WeakMap, _MessageStream_aborted = new WeakMap, _MessageStream_catchingPromiseCreated = new WeakMap, _MessageStream_response = new WeakMap, _MessageStream_request_id = new WeakMap, _MessageStream_logger = new WeakMap, _MessageStream_handleError = new WeakMap, _MessageStream_instances = new WeakSet, _MessageStream_getFinalMessage = function _MessageStream_getFinalMessage2() {
    if (this.receivedMessages.length === 0) {
      throw new AnthropicError("stream ended without producing a Message with role=assistant");
    }
    return this.receivedMessages.at(-1);
  }, _MessageStream_getFinalText = function _MessageStream_getFinalText2() {
    if (this.receivedMessages.length === 0) {
      throw new AnthropicError("stream ended without producing a Message with role=assistant");
    }
    const textBlocks = this.receivedMessages.at(-1).content.filter((block) => block.type === "text").map((block) => block.text);
    if (textBlocks.length === 0) {
      throw new AnthropicError("stream ended without producing a content block with type=text");
    }
    return textBlocks.join(" ");
  }, _MessageStream_beginRequest = function _MessageStream_beginRequest2() {
    if (this.ended)
      return;
    __classPrivateFieldSet(this, _MessageStream_currentMessageSnapshot, undefined, "f");
  }, _MessageStream_addStreamEvent = function _MessageStream_addStreamEvent2(event) {
    if (this.ended)
      return;
    const messageSnapshot = __classPrivateFieldGet(this, _MessageStream_instances, "m", _MessageStream_accumulateMessage).call(this, event);
    this._emit("streamEvent", event, messageSnapshot);
    switch (event.type) {
      case "content_block_delta": {
        const content = messageSnapshot.content.at(-1);
        switch (event.delta.type) {
          case "text_delta": {
            if (content.type === "text") {
              this._emit("text", event.delta.text, content.text || "");
            }
            break;
          }
          case "citations_delta": {
            if (content.type === "text") {
              this._emit("citation", event.delta.citation, content.citations ?? []);
            }
            break;
          }
          case "input_json_delta": {
            if (tracksToolInput2(content) && content.input) {
              this._emit("inputJson", event.delta.partial_json, content.input);
            }
            break;
          }
          case "thinking_delta": {
            if (content.type === "thinking") {
              this._emit("thinking", event.delta.thinking, content.thinking);
            }
            break;
          }
          case "signature_delta": {
            if (content.type === "thinking") {
              this._emit("signature", content.signature);
            }
            break;
          }
          default:
            checkNever2(event.delta);
        }
        break;
      }
      case "message_stop": {
        this._addMessageParam(messageSnapshot);
        this._addMessage(maybeParseMessage(messageSnapshot, __classPrivateFieldGet(this, _MessageStream_params, "f"), { logger: __classPrivateFieldGet(this, _MessageStream_logger, "f") }), true);
        break;
      }
      case "content_block_stop": {
        this._emit("contentBlock", messageSnapshot.content.at(-1));
        break;
      }
      case "message_start": {
        __classPrivateFieldSet(this, _MessageStream_currentMessageSnapshot, messageSnapshot, "f");
        break;
      }
      case "content_block_start":
      case "message_delta":
        break;
    }
  }, _MessageStream_endRequest = function _MessageStream_endRequest2() {
    if (this.ended) {
      throw new AnthropicError(`stream has ended, this shouldn't happen`);
    }
    const snapshot = __classPrivateFieldGet(this, _MessageStream_currentMessageSnapshot, "f");
    if (!snapshot) {
      throw new AnthropicError(`request ended without sending any chunks`);
    }
    __classPrivateFieldSet(this, _MessageStream_currentMessageSnapshot, undefined, "f");
    return maybeParseMessage(snapshot, __classPrivateFieldGet(this, _MessageStream_params, "f"), { logger: __classPrivateFieldGet(this, _MessageStream_logger, "f") });
  }, _MessageStream_accumulateMessage = function _MessageStream_accumulateMessage2(event) {
    let snapshot = __classPrivateFieldGet(this, _MessageStream_currentMessageSnapshot, "f");
    if (event.type === "message_start") {
      if (snapshot) {
        throw new AnthropicError(`Unexpected event order, got ${event.type} before receiving "message_stop"`);
      }
      return event.message;
    }
    if (!snapshot) {
      throw new AnthropicError(`Unexpected event order, got ${event.type} before "message_start"`);
    }
    switch (event.type) {
      case "message_stop":
        return snapshot;
      case "message_delta":
        snapshot.stop_reason = event.delta.stop_reason;
        snapshot.stop_sequence = event.delta.stop_sequence;
        snapshot.usage.output_tokens = event.usage.output_tokens;
        if (event.usage.input_tokens != null) {
          snapshot.usage.input_tokens = event.usage.input_tokens;
        }
        if (event.usage.cache_creation_input_tokens != null) {
          snapshot.usage.cache_creation_input_tokens = event.usage.cache_creation_input_tokens;
        }
        if (event.usage.cache_read_input_tokens != null) {
          snapshot.usage.cache_read_input_tokens = event.usage.cache_read_input_tokens;
        }
        if (event.usage.server_tool_use != null) {
          snapshot.usage.server_tool_use = event.usage.server_tool_use;
        }
        return snapshot;
      case "content_block_start":
        snapshot.content.push({ ...event.content_block });
        return snapshot;
      case "content_block_delta": {
        const snapshotContent = snapshot.content.at(event.index);
        switch (event.delta.type) {
          case "text_delta": {
            if (snapshotContent?.type === "text") {
              snapshot.content[event.index] = {
                ...snapshotContent,
                text: (snapshotContent.text || "") + event.delta.text
              };
            }
            break;
          }
          case "citations_delta": {
            if (snapshotContent?.type === "text") {
              snapshot.content[event.index] = {
                ...snapshotContent,
                citations: [...snapshotContent.citations ?? [], event.delta.citation]
              };
            }
            break;
          }
          case "input_json_delta": {
            if (snapshotContent && tracksToolInput2(snapshotContent)) {
              let jsonBuf = snapshotContent[JSON_BUF_PROPERTY2] || "";
              jsonBuf += event.delta.partial_json;
              const newContent = { ...snapshotContent };
              Object.defineProperty(newContent, JSON_BUF_PROPERTY2, {
                value: jsonBuf,
                enumerable: false,
                writable: true
              });
              if (jsonBuf) {
                newContent.input = partialParse(jsonBuf);
              }
              snapshot.content[event.index] = newContent;
            }
            break;
          }
          case "thinking_delta": {
            if (snapshotContent?.type === "thinking") {
              snapshot.content[event.index] = {
                ...snapshotContent,
                thinking: snapshotContent.thinking + event.delta.thinking
              };
            }
            break;
          }
          case "signature_delta": {
            if (snapshotContent?.type === "thinking") {
              snapshot.content[event.index] = {
                ...snapshotContent,
                signature: event.delta.signature
              };
            }
            break;
          }
          default:
            checkNever2(event.delta);
        }
        return snapshot;
      }
      case "content_block_stop":
        return snapshot;
    }
  }, Symbol.asyncIterator)]() {
    const pushQueue = [];
    const readQueue = [];
    let done = false;
    this.on("streamEvent", (event) => {
      const reader = readQueue.shift();
      if (reader) {
        reader.resolve(event);
      } else {
        pushQueue.push(event);
      }
    });
    this.on("end", () => {
      done = true;
      for (const reader of readQueue) {
        reader.resolve(undefined);
      }
      readQueue.length = 0;
    });
    this.on("abort", (err) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err);
      }
      readQueue.length = 0;
    });
    this.on("error", (err) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err);
      }
      readQueue.length = 0;
    });
    return {
      next: async () => {
        if (!pushQueue.length) {
          if (done) {
            return { value: undefined, done: true };
          }
          return new Promise((resolve, reject) => readQueue.push({ resolve, reject })).then((chunk2) => chunk2 ? { value: chunk2, done: false } : { value: undefined, done: true });
        }
        const chunk = pushQueue.shift();
        return { value: chunk, done: false };
      },
      return: async () => {
        this.abort();
        return { value: undefined, done: true };
      }
    };
  }
  toReadableStream() {
    const stream = new Stream(this[Symbol.asyncIterator].bind(this), this.controller);
    return stream.toReadableStream();
  }
}
function checkNever2(x) {}

// node_modules/@anthropic-ai/sdk/resources/messages/batches.mjs
class Batches2 extends APIResource {
  create(body, options) {
    return this._client.post("/v1/messages/batches", { body, ...options });
  }
  retrieve(messageBatchID, options) {
    return this._client.get(path3`/v1/messages/batches/${messageBatchID}`, options);
  }
  list(query = {}, options) {
    return this._client.getAPIList("/v1/messages/batches", Page, { query, ...options });
  }
  delete(messageBatchID, options) {
    return this._client.delete(path3`/v1/messages/batches/${messageBatchID}`, options);
  }
  cancel(messageBatchID, options) {
    return this._client.post(path3`/v1/messages/batches/${messageBatchID}/cancel`, options);
  }
  async results(messageBatchID, options) {
    const batch = await this.retrieve(messageBatchID);
    if (!batch.results_url) {
      throw new AnthropicError(`No batch \`results_url\`; Has it finished processing? ${batch.processing_status} - ${batch.id}`);
    }
    return this._client.get(batch.results_url, {
      ...options,
      headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
      stream: true,
      __binaryResponse: true
    })._thenUnwrap((_, props) => JSONLDecoder.fromResponse(props.response, props.controller));
  }
}

// node_modules/@anthropic-ai/sdk/resources/messages/messages.mjs
class Messages2 extends APIResource {
  constructor() {
    super(...arguments);
    this.batches = new Batches2(this._client);
  }
  create(body, options) {
    if (body.model in DEPRECATED_MODELS2) {
      console.warn(`The model '${body.model}' is deprecated and will reach end-of-life on ${DEPRECATED_MODELS2[body.model]}
Please migrate to a newer model. Visit https://docs.anthropic.com/en/docs/resources/model-deprecations for more information.`);
    }
    if (body.model in MODELS_TO_WARN_WITH_THINKING_ENABLED2 && body.thinking && body.thinking.type === "enabled") {
      console.warn(`Using Claude with ${body.model} and 'thinking.type=enabled' is deprecated. Use 'thinking.type=adaptive' instead which results in better model performance in our testing: https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking`);
    }
    let timeout = this._client._options.timeout;
    if (!body.stream && timeout == null) {
      const maxNonstreamingTokens = MODEL_NONSTREAMING_TOKENS[body.model] ?? undefined;
      timeout = this._client.calculateNonstreamingTimeout(body.max_tokens, maxNonstreamingTokens);
    }
    const helperHeader = stainlessHelperHeader(body.tools, body.messages);
    return this._client.post("/v1/messages", {
      body,
      timeout: timeout ?? 600000,
      ...options,
      headers: buildHeaders([helperHeader, options?.headers]),
      stream: body.stream ?? false
    });
  }
  parse(params, options) {
    return this.create(params, options).then((message) => parseMessage(message, params, { logger: this._client.logger ?? console }));
  }
  stream(body, options) {
    return MessageStream.createMessage(this, body, options, { logger: this._client.logger ?? console });
  }
  countTokens(body, options) {
    return this._client.post("/v1/messages/count_tokens", { body, ...options });
  }
}
var DEPRECATED_MODELS2 = {
  "claude-1.3": "November 6th, 2024",
  "claude-1.3-100k": "November 6th, 2024",
  "claude-instant-1.1": "November 6th, 2024",
  "claude-instant-1.1-100k": "November 6th, 2024",
  "claude-instant-1.2": "November 6th, 2024",
  "claude-3-sonnet-20240229": "July 21st, 2025",
  "claude-3-opus-20240229": "January 5th, 2026",
  "claude-2.1": "July 21st, 2025",
  "claude-2.0": "July 21st, 2025",
  "claude-3-7-sonnet-latest": "February 19th, 2026",
  "claude-3-7-sonnet-20250219": "February 19th, 2026",
  "claude-3-5-haiku-latest": "February 19th, 2026",
  "claude-3-5-haiku-20241022": "February 19th, 2026"
};
var MODELS_TO_WARN_WITH_THINKING_ENABLED2 = ["claude-opus-4-6"];
Messages2.Batches = Batches2;
// node_modules/@anthropic-ai/sdk/resources/models.mjs
class Models2 extends APIResource {
  retrieve(modelID, params = {}, options) {
    const { betas } = params ?? {};
    return this._client.get(path3`/v1/models/${modelID}`, {
      ...options,
      headers: buildHeaders([
        { ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : undefined },
        options?.headers
      ])
    });
  }
  list(params = {}, options) {
    const { betas, ...query } = params ?? {};
    return this._client.getAPIList("/v1/models", Page, {
      query,
      ...options,
      headers: buildHeaders([
        { ...betas?.toString() != null ? { "anthropic-beta": betas?.toString() } : undefined },
        options?.headers
      ])
    });
  }
}
// node_modules/@anthropic-ai/sdk/internal/utils/env.mjs
var readEnv = (env) => {
  if (typeof globalThis.process !== "undefined") {
    return globalThis.process.env?.[env]?.trim() ?? undefined;
  }
  if (typeof globalThis.Deno !== "undefined") {
    return globalThis.Deno.env?.get?.(env)?.trim();
  }
  return;
};

// node_modules/@anthropic-ai/sdk/client.mjs
var _BaseAnthropic_instances;
var _a;
var _BaseAnthropic_encoder;
var _BaseAnthropic_baseURLOverridden;
var HUMAN_PROMPT = "\\n\\nHuman:";
var AI_PROMPT = "\\n\\nAssistant:";

class BaseAnthropic {
  constructor({ baseURL = readEnv("ANTHROPIC_BASE_URL"), apiKey = readEnv("ANTHROPIC_API_KEY") ?? null, authToken = readEnv("ANTHROPIC_AUTH_TOKEN") ?? null, ...opts } = {}) {
    _BaseAnthropic_instances.add(this);
    _BaseAnthropic_encoder.set(this, undefined);
    const options = {
      apiKey,
      authToken,
      ...opts,
      baseURL: baseURL || `https://api.anthropic.com`
    };
    if (!options.dangerouslyAllowBrowser && isRunningInBrowser()) {
      throw new AnthropicError(`It looks like you're running in a browser-like environment.

This is disabled by default, as it risks exposing your secret API credentials to attackers.
If you understand the risks and have appropriate mitigations in place,
you can set the \`dangerouslyAllowBrowser\` option to \`true\`, e.g.,

new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
`);
    }
    this.baseURL = options.baseURL;
    this.timeout = options.timeout ?? _a.DEFAULT_TIMEOUT;
    this.logger = options.logger ?? console;
    const defaultLogLevel = "warn";
    this.logLevel = defaultLogLevel;
    this.logLevel = parseLogLevel(options.logLevel, "ClientOptions.logLevel", this) ?? parseLogLevel(readEnv("ANTHROPIC_LOG"), "process.env['ANTHROPIC_LOG']", this) ?? defaultLogLevel;
    this.fetchOptions = options.fetchOptions;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetch = options.fetch ?? getDefaultFetch();
    __classPrivateFieldSet(this, _BaseAnthropic_encoder, FallbackEncoder, "f");
    this._options = options;
    this.apiKey = typeof apiKey === "string" ? apiKey : null;
    this.authToken = authToken;
  }
  withOptions(options) {
    const client = new this.constructor({
      ...this._options,
      baseURL: this.baseURL,
      maxRetries: this.maxRetries,
      timeout: this.timeout,
      logger: this.logger,
      logLevel: this.logLevel,
      fetch: this.fetch,
      fetchOptions: this.fetchOptions,
      apiKey: this.apiKey,
      authToken: this.authToken,
      ...options
    });
    return client;
  }
  defaultQuery() {
    return this._options.defaultQuery;
  }
  validateHeaders({ values, nulls }) {
    if (values.get("x-api-key") || values.get("authorization")) {
      return;
    }
    if (this.apiKey && values.get("x-api-key")) {
      return;
    }
    if (nulls.has("x-api-key")) {
      return;
    }
    if (this.authToken && values.get("authorization")) {
      return;
    }
    if (nulls.has("authorization")) {
      return;
    }
    throw new Error('Could not resolve authentication method. Expected either apiKey or authToken to be set. Or for one of the "X-Api-Key" or "Authorization" headers to be explicitly omitted');
  }
  async authHeaders(opts) {
    return buildHeaders([await this.apiKeyAuth(opts), await this.bearerAuth(opts)]);
  }
  async apiKeyAuth(opts) {
    if (this.apiKey == null) {
      return;
    }
    return buildHeaders([{ "X-Api-Key": this.apiKey }]);
  }
  async bearerAuth(opts) {
    if (this.authToken == null) {
      return;
    }
    return buildHeaders([{ Authorization: `Bearer ${this.authToken}` }]);
  }
  stringifyQuery(query) {
    return stringifyQuery(query);
  }
  getUserAgent() {
    return `${this.constructor.name}/JS ${VERSION}`;
  }
  defaultIdempotencyKey() {
    return `stainless-node-retry-${uuid4()}`;
  }
  makeStatusError(status, error2, message, headers) {
    return APIError.generate(status, error2, message, headers);
  }
  buildURL(path4, query, defaultBaseURL) {
    const baseURL = !__classPrivateFieldGet(this, _BaseAnthropic_instances, "m", _BaseAnthropic_baseURLOverridden).call(this) && defaultBaseURL || this.baseURL;
    const url = isAbsoluteURL(path4) ? new URL(path4) : new URL(baseURL + (baseURL.endsWith("/") && path4.startsWith("/") ? path4.slice(1) : path4));
    const defaultQuery = this.defaultQuery();
    const pathQuery = Object.fromEntries(url.searchParams);
    if (!isEmptyObj(defaultQuery) || !isEmptyObj(pathQuery)) {
      query = { ...pathQuery, ...defaultQuery, ...query };
    }
    if (typeof query === "object" && query && !Array.isArray(query)) {
      url.search = this.stringifyQuery(query);
    }
    return url.toString();
  }
  _calculateNonstreamingTimeout(maxTokens) {
    const defaultTimeout = 10 * 60;
    const expectedTimeout = 60 * 60 * maxTokens / 128000;
    if (expectedTimeout > defaultTimeout) {
      throw new AnthropicError("Streaming is required for operations that may take longer than 10 minutes. " + "See https://github.com/anthropics/anthropic-sdk-typescript#streaming-responses for more details");
    }
    return defaultTimeout * 1000;
  }
  async prepareOptions(options) {}
  async prepareRequest(request, { url, options }) {}
  get(path4, opts) {
    return this.methodRequest("get", path4, opts);
  }
  post(path4, opts) {
    return this.methodRequest("post", path4, opts);
  }
  patch(path4, opts) {
    return this.methodRequest("patch", path4, opts);
  }
  put(path4, opts) {
    return this.methodRequest("put", path4, opts);
  }
  delete(path4, opts) {
    return this.methodRequest("delete", path4, opts);
  }
  methodRequest(method, path4, opts) {
    return this.request(Promise.resolve(opts).then((opts2) => {
      return { method, path: path4, ...opts2 };
    }));
  }
  request(options, remainingRetries = null) {
    return new APIPromise(this, this.makeRequest(options, remainingRetries, undefined));
  }
  async makeRequest(optionsInput, retriesRemaining, retryOfRequestLogID) {
    const options = await optionsInput;
    const maxRetries = options.maxRetries ?? this.maxRetries;
    if (retriesRemaining == null) {
      retriesRemaining = maxRetries;
    }
    await this.prepareOptions(options);
    const { req, url, timeout } = await this.buildRequest(options, {
      retryCount: maxRetries - retriesRemaining
    });
    await this.prepareRequest(req, { url, options });
    const requestLogID = "log_" + (Math.random() * (1 << 24) | 0).toString(16).padStart(6, "0");
    const retryLogStr = retryOfRequestLogID === undefined ? "" : `, retryOf: ${retryOfRequestLogID}`;
    const startTime = Date.now();
    loggerFor(this).debug(`[${requestLogID}] sending request`, formatRequestDetails({
      retryOfRequestLogID,
      method: options.method,
      url,
      options,
      headers: req.headers
    }));
    if (options.signal?.aborted) {
      throw new APIUserAbortError;
    }
    const controller = new AbortController;
    const response = await this.fetchWithTimeout(url, req, timeout, controller).catch(castToError);
    const headersTime = Date.now();
    if (response instanceof globalThis.Error) {
      const retryMessage = `retrying, ${retriesRemaining} attempts remaining`;
      if (options.signal?.aborted) {
        throw new APIUserAbortError;
      }
      const isTimeout = isAbortError(response) || /timed? ?out/i.test(String(response) + ("cause" in response ? String(response.cause) : ""));
      if (retriesRemaining) {
        loggerFor(this).info(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} - ${retryMessage}`);
        loggerFor(this).debug(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} (${retryMessage})`, formatRequestDetails({
          retryOfRequestLogID,
          url,
          durationMs: headersTime - startTime,
          message: response.message
        }));
        return this.retryRequest(options, retriesRemaining, retryOfRequestLogID ?? requestLogID);
      }
      loggerFor(this).info(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} - error; no more retries left`);
      loggerFor(this).debug(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} (error; no more retries left)`, formatRequestDetails({
        retryOfRequestLogID,
        url,
        durationMs: headersTime - startTime,
        message: response.message
      }));
      if (isTimeout) {
        throw new APIConnectionTimeoutError;
      }
      throw new APIConnectionError({ cause: response });
    }
    const specialHeaders = [...response.headers.entries()].filter(([name]) => name === "request-id").map(([name, value]) => ", " + name + ": " + JSON.stringify(value)).join("");
    const responseInfo = `[${requestLogID}${retryLogStr}${specialHeaders}] ${req.method} ${url} ${response.ok ? "succeeded" : "failed"} with status ${response.status} in ${headersTime - startTime}ms`;
    if (!response.ok) {
      const shouldRetry = await this.shouldRetry(response);
      if (retriesRemaining && shouldRetry) {
        const retryMessage2 = `retrying, ${retriesRemaining} attempts remaining`;
        await CancelReadableStream(response.body);
        loggerFor(this).info(`${responseInfo} - ${retryMessage2}`);
        loggerFor(this).debug(`[${requestLogID}] response error (${retryMessage2})`, formatRequestDetails({
          retryOfRequestLogID,
          url: response.url,
          status: response.status,
          headers: response.headers,
          durationMs: headersTime - startTime
        }));
        return this.retryRequest(options, retriesRemaining, retryOfRequestLogID ?? requestLogID, response.headers);
      }
      const retryMessage = shouldRetry ? `error; no more retries left` : `error; not retryable`;
      loggerFor(this).info(`${responseInfo} - ${retryMessage}`);
      const errText = await response.text().catch((err2) => castToError(err2).message);
      const errJSON = safeJSON(errText);
      const errMessage = errJSON ? undefined : errText;
      loggerFor(this).debug(`[${requestLogID}] response error (${retryMessage})`, formatRequestDetails({
        retryOfRequestLogID,
        url: response.url,
        status: response.status,
        headers: response.headers,
        message: errMessage,
        durationMs: Date.now() - startTime
      }));
      const err = this.makeStatusError(response.status, errJSON, errMessage, response.headers);
      throw err;
    }
    loggerFor(this).info(responseInfo);
    loggerFor(this).debug(`[${requestLogID}] response start`, formatRequestDetails({
      retryOfRequestLogID,
      url: response.url,
      status: response.status,
      headers: response.headers,
      durationMs: headersTime - startTime
    }));
    return { response, options, controller, requestLogID, retryOfRequestLogID, startTime };
  }
  getAPIList(path4, Page2, opts) {
    return this.requestAPIList(Page2, opts && "then" in opts ? opts.then((opts2) => ({ method: "get", path: path4, ...opts2 })) : { method: "get", path: path4, ...opts });
  }
  requestAPIList(Page2, options) {
    const request = this.makeRequest(options, null, undefined);
    return new PagePromise(this, request, Page2);
  }
  async fetchWithTimeout(url, init, ms, controller) {
    const { signal, method, ...options } = init || {};
    const abort = this._makeAbort(controller);
    if (signal)
      signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, ms);
    const isReadableBody = globalThis.ReadableStream && options.body instanceof globalThis.ReadableStream || typeof options.body === "object" && options.body !== null && Symbol.asyncIterator in options.body;
    const fetchOptions = {
      signal: controller.signal,
      ...isReadableBody ? { duplex: "half" } : {},
      method: "GET",
      ...options
    };
    if (method) {
      fetchOptions.method = method.toUpperCase();
    }
    try {
      return await this.fetch.call(undefined, url, fetchOptions);
    } finally {
      clearTimeout(timeout);
    }
  }
  async shouldRetry(response) {
    const shouldRetryHeader = response.headers.get("x-should-retry");
    if (shouldRetryHeader === "true")
      return true;
    if (shouldRetryHeader === "false")
      return false;
    if (response.status === 408)
      return true;
    if (response.status === 409)
      return true;
    if (response.status === 429)
      return true;
    if (response.status >= 500)
      return true;
    return false;
  }
  async retryRequest(options, retriesRemaining, requestLogID, responseHeaders) {
    let timeoutMillis;
    const retryAfterMillisHeader = responseHeaders?.get("retry-after-ms");
    if (retryAfterMillisHeader) {
      const timeoutMs = parseFloat(retryAfterMillisHeader);
      if (!Number.isNaN(timeoutMs)) {
        timeoutMillis = timeoutMs;
      }
    }
    const retryAfterHeader = responseHeaders?.get("retry-after");
    if (retryAfterHeader && !timeoutMillis) {
      const timeoutSeconds = parseFloat(retryAfterHeader);
      if (!Number.isNaN(timeoutSeconds)) {
        timeoutMillis = timeoutSeconds * 1000;
      } else {
        timeoutMillis = Date.parse(retryAfterHeader) - Date.now();
      }
    }
    if (timeoutMillis === undefined) {
      const maxRetries = options.maxRetries ?? this.maxRetries;
      timeoutMillis = this.calculateDefaultRetryTimeoutMillis(retriesRemaining, maxRetries);
    }
    await sleep(timeoutMillis);
    return this.makeRequest(options, retriesRemaining - 1, requestLogID);
  }
  calculateDefaultRetryTimeoutMillis(retriesRemaining, maxRetries) {
    const initialRetryDelay = 0.5;
    const maxRetryDelay = 8;
    const numRetries = maxRetries - retriesRemaining;
    const sleepSeconds = Math.min(initialRetryDelay * Math.pow(2, numRetries), maxRetryDelay);
    const jitter = 1 - Math.random() * 0.25;
    return sleepSeconds * jitter * 1000;
  }
  calculateNonstreamingTimeout(maxTokens, maxNonstreamingTokens) {
    const maxTime = 60 * 60 * 1000;
    const defaultTime = 60 * 10 * 1000;
    const expectedTime = maxTime * maxTokens / 128000;
    if (expectedTime > defaultTime || maxNonstreamingTokens != null && maxTokens > maxNonstreamingTokens) {
      throw new AnthropicError("Streaming is required for operations that may take longer than 10 minutes. See https://github.com/anthropics/anthropic-sdk-typescript#long-requests for more details");
    }
    return defaultTime;
  }
  async buildRequest(inputOptions, { retryCount = 0 } = {}) {
    const options = { ...inputOptions };
    const { method, path: path4, query, defaultBaseURL } = options;
    const url = this.buildURL(path4, query, defaultBaseURL);
    if ("timeout" in options)
      validatePositiveInteger("timeout", options.timeout);
    options.timeout = options.timeout ?? this.timeout;
    const { bodyHeaders, body } = this.buildBody({ options });
    const reqHeaders = await this.buildHeaders({ options: inputOptions, method, bodyHeaders, retryCount });
    const req = {
      method,
      headers: reqHeaders,
      ...options.signal && { signal: options.signal },
      ...globalThis.ReadableStream && body instanceof globalThis.ReadableStream && { duplex: "half" },
      ...body && { body },
      ...this.fetchOptions ?? {},
      ...options.fetchOptions ?? {}
    };
    return { req, url, timeout: options.timeout };
  }
  async buildHeaders({ options, method, bodyHeaders, retryCount }) {
    let idempotencyHeaders = {};
    if (this.idempotencyHeader && method !== "get") {
      if (!options.idempotencyKey)
        options.idempotencyKey = this.defaultIdempotencyKey();
      idempotencyHeaders[this.idempotencyHeader] = options.idempotencyKey;
    }
    const headers = buildHeaders([
      idempotencyHeaders,
      {
        Accept: "application/json",
        "User-Agent": this.getUserAgent(),
        "X-Stainless-Retry-Count": String(retryCount),
        ...options.timeout ? { "X-Stainless-Timeout": String(Math.trunc(options.timeout / 1000)) } : {},
        ...getPlatformHeaders(),
        ...this._options.dangerouslyAllowBrowser ? { "anthropic-dangerous-direct-browser-access": "true" } : undefined,
        "anthropic-version": "2023-06-01"
      },
      await this.authHeaders(options),
      this._options.defaultHeaders,
      bodyHeaders,
      options.headers
    ]);
    this.validateHeaders(headers);
    return headers.values;
  }
  _makeAbort(controller) {
    return () => controller.abort();
  }
  buildBody({ options: { body, headers: rawHeaders } }) {
    if (!body) {
      return { bodyHeaders: undefined, body: undefined };
    }
    const headers = buildHeaders([rawHeaders]);
    if (ArrayBuffer.isView(body) || body instanceof ArrayBuffer || body instanceof DataView || typeof body === "string" && headers.values.has("content-type") || globalThis.Blob && body instanceof globalThis.Blob || body instanceof FormData || body instanceof URLSearchParams || globalThis.ReadableStream && body instanceof globalThis.ReadableStream) {
      return { bodyHeaders: undefined, body };
    } else if (typeof body === "object" && ((Symbol.asyncIterator in body) || (Symbol.iterator in body) && ("next" in body) && typeof body.next === "function")) {
      return { bodyHeaders: undefined, body: ReadableStreamFrom(body) };
    } else if (typeof body === "object" && headers.values.get("content-type") === "application/x-www-form-urlencoded") {
      return {
        bodyHeaders: { "content-type": "application/x-www-form-urlencoded" },
        body: this.stringifyQuery(body)
      };
    } else {
      return __classPrivateFieldGet(this, _BaseAnthropic_encoder, "f").call(this, { body, headers });
    }
  }
}
_a = BaseAnthropic, _BaseAnthropic_encoder = new WeakMap, _BaseAnthropic_instances = new WeakSet, _BaseAnthropic_baseURLOverridden = function _BaseAnthropic_baseURLOverridden2() {
  return this.baseURL !== "https://api.anthropic.com";
};
BaseAnthropic.Anthropic = _a;
BaseAnthropic.HUMAN_PROMPT = HUMAN_PROMPT;
BaseAnthropic.AI_PROMPT = AI_PROMPT;
BaseAnthropic.DEFAULT_TIMEOUT = 600000;
BaseAnthropic.AnthropicError = AnthropicError;
BaseAnthropic.APIError = APIError;
BaseAnthropic.APIConnectionError = APIConnectionError;
BaseAnthropic.APIConnectionTimeoutError = APIConnectionTimeoutError;
BaseAnthropic.APIUserAbortError = APIUserAbortError;
BaseAnthropic.NotFoundError = NotFoundError;
BaseAnthropic.ConflictError = ConflictError;
BaseAnthropic.RateLimitError = RateLimitError;
BaseAnthropic.BadRequestError = BadRequestError;
BaseAnthropic.AuthenticationError = AuthenticationError;
BaseAnthropic.InternalServerError = InternalServerError;
BaseAnthropic.PermissionDeniedError = PermissionDeniedError;
BaseAnthropic.UnprocessableEntityError = UnprocessableEntityError;
BaseAnthropic.toFile = toFile;

class Anthropic extends BaseAnthropic {
  constructor() {
    super(...arguments);
    this.completions = new Completions(this);
    this.messages = new Messages2(this);
    this.models = new Models2(this);
    this.beta = new Beta(this);
  }
}
Anthropic.Completions = Completions;
Anthropic.Messages = Messages2;
Anthropic.Models = Models2;
Anthropic.Beta = Beta;
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
  } catch (error2) {
    return {
      type: "text",
      value: `Context compression failed: ${errorMessage(error2)}`
    };
  }
};

// src/indexing/build.ts
import { mkdir as mkdir4, rm as rm2 } from "fs/promises";
import { join as join6 } from "path";

// src/indexing/config.ts
import { basename as basename2, resolve } from "path";
var DEFAULT_MAX_FILE_BYTES = 512 * 1024;
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
  ".hpp": "generic",
  ".cxx": "generic",
  ".hxx": "generic",
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
  "tmp",
  ".tmp"
]);
function resolveCodeIndexConfig(options = {}) {
  const cwd2 = process.cwd();
  const rootDir = resolve(cwd2, options.rootDir ?? ".");
  const outputDir = options.outputDir ? resolve(cwd2, options.outputDir) : resolve(rootDir, ".code_index");
  return {
    rootDir,
    outputDir,
    outputDirName: basename2(outputDir),
    maxFileBytes: options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
    ignoredDirNames: new Set(DEFAULT_IGNORED_DIR_NAMES)
  };
}
function getCodeLanguageForExtension(extension) {
  return LANGUAGE_BY_EXTENSION[extension.toLowerCase()] ?? null;
}

// src/indexing/discovery.ts
import { readdir } from "fs/promises";
import { extname, relative, sep } from "path";
function shouldSkipDirectory(absolutePath, dirName, config) {
  if (config.ignoredDirNames.has(dirName)) {
    return true;
  }
  if (absolutePath === config.outputDir) {
    return true;
  }
  return absolutePath.startsWith(config.outputDir + sep);
}
async function discoverSourceFiles(config) {
  const discovered = [];
  async function walk(dirPath) {
    const entries = await readdir(dirPath, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolutePath = `${dirPath}${sep}${entry.name}`;
      if (entry.isDirectory()) {
        if (shouldSkipDirectory(absolutePath, entry.name, config)) {
          continue;
        }
        await walk(absolutePath);
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
    }
  }
  await walk(config.rootDir);
  discovered.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return discovered;
}

// src/indexing/emitter.ts
import { mkdir, writeFile } from "fs/promises";
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
async function emitSkeletonTree(modules, outputDir) {
  const skeletonRoot = join3(outputDir, "skeleton");
  const usedPaths = new Set;
  for (const module of modules) {
    const relativeTarget = getSkeletonRelativePath(module.relativePath, usedPaths);
    const targetPath = join3(skeletonRoot, relativeTarget);
    await mkdir(dirname2(targetPath), { recursive: true });
    await writeFile(targetPath, renderModuleSkeleton(module), "utf8");
  }
  const overview = `...
`;
  await writeFile(join3(skeletonRoot, "__root__.py"), overview, "utf8");
}

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
import { open, readFile, stat } from "fs/promises";
var utf8Decoder = new TextDecoder("utf-8", { fatal: false });
function normalizeDecodedText(text) {
  const withoutBom = text.charCodeAt(0) === 65279 ? text.slice(1) : text;
  return withoutBom.replace(/\r\n?/g, `
`);
}
async function readSourceText(filePath, maxBytes) {
  const fileStat = await stat(filePath);
  const byteSize = fileStat.size;
  if (byteSize <= maxBytes) {
    const buffer = await readFile(filePath);
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

// src/indexing/indexWriter.ts
import { mkdir as mkdir2, writeFile as writeFile2 } from "fs/promises";
import { join as join4, parse as parsePath, posix as posix2 } from "path";
function makeEdgeId(index) {
  return `edge-${index.toString().padStart(6, "0")}`;
}
function renderFunctionSignature(fn) {
  const params = fn.params.map((param) => param.annotation ? `${param.name}: ${param.annotation}` : param.name).join(", ");
  return `${fn.name}(${params})${fn.returns ? ` -> ${fn.returns}` : ""}`;
}
function buildEdges(modules) {
  const edges = [];
  for (const module of modules) {
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
    rootDir: args.rootDir,
    outputDir: args.outputDir,
    createdAt: new Date().toISOString(),
    moduleCount: args.modules.length,
    classCount,
    functionCount,
    methodCount,
    edgeCount: args.edges.length,
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
function buildFileDependencyEdges(modules) {
  const aliasMap = buildModuleAliasMap(modules);
  const seenEdges = new Set;
  const edges = [];
  for (const module of modules) {
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
function renderArchitectureDot(modules) {
  const edges = buildFileDependencyEdges(modules);
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
  const indexDir = join4(args.outputDir, "index");
  await mkdir2(indexDir, { recursive: true });
  const manifest = buildManifest(args);
  await writeFile2(join4(indexDir, "manifest.json"), JSON.stringify(manifest, null, 2) + `
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
  await writeFile2(join4(indexDir, "modules.jsonl"), moduleLines.join(`
`) + `
`, "utf8");
  const symbolLines = [];
  for (const module of args.modules) {
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
  await writeFile2(join4(indexDir, "symbols.jsonl"), symbolLines.join(`
`) + `
`, "utf8");
  const edgeLines = args.edges.map((edge) => JSON.stringify(edge));
  await writeFile2(join4(indexDir, "edges.jsonl"), edgeLines.join(`
`) + `
`, "utf8");
  await writeFile2(join4(indexDir, "summary.md"), renderSummary({
    edges: args.edges,
    manifest,
    modules: args.modules,
    outputDir: args.outputDir
  }), "utf8");
  await writeFile2(join4(indexDir, "architecture.dot"), renderArchitectureDot(args.modules), "utf8");
  await writePythonIndex(args);
  return manifest;
}
function toSkeletonRelativePath(relativePath) {
  const parsed = parsePath(relativePath);
  return join4(parsed.dir, `${parsed.name}.py`).replaceAll("\\", "/");
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
  await writeFile2(join4(outputDir, "__index__.py"), content, "utf8");
}

// src/indexing/skillWriter.ts
import { mkdir as mkdir3, rm, writeFile as writeFile3 } from "fs/promises";
import { join as join5, relative as relative2 } from "path";
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
    `name: ${args.name}`,
    `description: ${args.description}`,
    "---",
    "",
    "# Code Index",
    "",
    "## Instructions",
    `- Start with \`${architecturePath}\` for the smallest file-level dependency map. Outgoing edges show what a file depends on; incoming edges show likely impact.`,
    `- Then use \`${indexPath}\` for entry points, top directories, and high-priority symbols.`,
    `- Read \`${summaryPath}\` for a human-readable overview.`,
    `- Browse \`${skeletonPath}/\` when you need method-level detail; skeleton functions include concise stub calls instead of full method bodies.`,
    `- Use \`${modulesPath}\` and \`${symbolsPath}\` only when you need exact module or symbol-level detail.`,
    "- If a file is missing from the DOT, no internal file-level dependency edge was resolved for it; jump straight to the skeleton or JSON index.",
    "- The skeleton is valid Python with lightweight call stubs, inheritance, and constructor assignments for easier grep and AST-based lookup.",
    "- If the index is stale after edits, rerun `/index`.",
    ""
  ].join(`
`);
}
async function writeCodeIndexSkills(args) {
  const paths = {
    claude: join5(args.rootDir, ".claude", "skills", "code-index", "SKILL.md"),
    codex: join5(args.rootDir, ".codex", "skills", "code-index", "SKILL.md"),
    opencode: join5(args.rootDir, ".opencode", "skills", "code-index", "SKILL.md")
  };
  await rm(join5(args.rootDir, ".claude", "code_index"), {
    recursive: true,
    force: true
  });
  await rm(join5(args.rootDir, ".agent", "codex_index"), {
    recursive: true,
    force: true
  });
  await mkdir3(join5(args.rootDir, ".claude", "skills", "code-index"), {
    recursive: true
  });
  await mkdir3(join5(args.rootDir, ".codex", "skills", "code-index"), {
    recursive: true
  });
  await mkdir3(join5(args.rootDir, ".opencode", "skills", "code-index"), {
    recursive: true
  });
  const claudeDescription = "Use the shared code index under .code_index to inspect repo structure, follow imports or calls, and narrow source reads before touching implementation files.";
  const codexDescription = "Use the shared code index under .code_index to inspect repo structure, follow imports or calls, and narrow source reads before editing implementation files.";
  const opencodeDescription = "Use the shared code index under .code_index to inspect repo structure, navigate entry points, and find implementation files.";
  await writeFile3(paths.claude, renderSkillMarkdown({
    name: "code-index",
    description: claudeDescription,
    rootDir: args.rootDir,
    outputDir: args.outputDir
  }), "utf8");
  await writeFile3(paths.codex, renderSkillMarkdown({
    name: "code-index",
    description: codexDescription,
    rootDir: args.rootDir,
    outputDir: args.outputDir
  }), "utf8");
  await writeFile3(paths.opencode, renderSkillMarkdown({
    name: "code-index",
    description: opencodeDescription,
    rootDir: args.rootDir,
    outputDir: args.outputDir
  }), "utf8");
  return paths;
}

// src/indexing/build.ts
function describeError(error2) {
  return error2 instanceof Error ? error2.message : String(error2);
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
async function prepareOutputDirectory(outputDir) {
  await mkdir4(outputDir, { recursive: true });
  await rm2(join6(outputDir, "skeleton"), { recursive: true, force: true });
  await rm2(join6(outputDir, "index"), { recursive: true, force: true });
  await mkdir4(join6(outputDir, "skeleton"), { recursive: true });
  await mkdir4(join6(outputDir, "index"), { recursive: true });
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
async function buildCodeIndex(options = {}) {
  const config = resolveCodeIndexConfig(options);
  await prepareOutputDirectory(config.outputDir);
  const files = await discoverSourceFiles(config);
  const modules = [];
  for (const file of files) {
    let source;
    try {
      source = await readSourceText(file.absolutePath, config.maxFileBytes);
    } catch (error2) {
      const failedModule = buildReadErrorModule(file);
      failedModule.errors = [`read error: ${describeError(error2)}`];
      modules.push(failedModule);
      continue;
    }
    try {
      modules.push(parseModule({
        config,
        file,
        source
      }));
    } catch (error2) {
      const fallback = parseGenericModule({
        config,
        file,
        source
      }, ["parser fell back to generic pattern matching"], [`parse error: ${describeError(error2)}`]);
      fallback.parseMode = source.truncated ? `fallback-${file.language}-truncated` : `fallback-${file.language}`;
      modules.push(fallback);
    }
  }
  await emitSkeletonTree(modules, config.outputDir);
  const edges = buildEdges(modules);
  const manifest = await writeIndexFiles({
    edges,
    modules,
    outputDir: config.outputDir,
    rootDir: config.rootDir
  });
  const skillPaths = await writeCodeIndexSkills({
    outputDir: config.outputDir,
    rootDir: config.rootDir
  });
  return {
    manifest,
    outputDir: config.outputDir,
    rootDir: config.rootDir,
    skillPaths
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
  let outputDir;
  let maxFileBytes;
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
    maxFileBytes,
    outputDir,
    rootDir
  };
}

// src/commands/index/cliBundleEntry.ts
var USAGE2 = [
  "Usage: /index [path] [--output DIR] [--max-file-bytes N]",
  "",
  "Examples:",
  "  /index",
  "  /index src",
  "  /index . --output .code_index",
  "  /index --max-file-bytes 1048576"
].join(`
`);
var AUTO_MEMORY_DISABLED_MESSAGE = "Pinned facts are unavailable because auto memory is disabled for this session.";
var PINNED_FACTS_FILENAME = "PINNED.md";
var PINNED_FACTS_HEADER = "# Pinned Facts";
var PINNED_FACTS_EMPTY_HINT = "<!-- No pinned facts yet. Use /pin <text> to add one. -->";
var PINNED_FACTS_SKILL_NAME = "pinned-facts";
var MAX_SANITIZED_LENGTH = 200;
function errorMessage2(error2) {
  return error2 instanceof Error ? error2.message : String(error2);
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
  const memoryBase = process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR ?? process.env.CLAUDE_CONFIG_DIR ?? join7(homedir(), ".claude");
  return join7(memoryBase, "projects", sanitizePath(getProjectRoot2()), "memory", PINNED_FACTS_FILENAME);
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
    claude: join7(rootDir, ".claude", "skills", PINNED_FACTS_SKILL_NAME, "SKILL.md"),
    codex: join7(rootDir, ".codex", "skills", PINNED_FACTS_SKILL_NAME, "SKILL.md")
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
    const content = await readFile2(getPinnedFactsPath(), "utf8");
    return parsePinnedFactsContent(content);
  } catch (error2) {
    if (error2 && typeof error2 === "object" && "code" in error2 && (error2.code === "ENOENT" || error2.code === "EISDIR")) {
      return [];
    }
    throw error2;
  }
}
async function writePinnedFacts(facts) {
  const path4 = getPinnedFactsPath();
  await mkdir5(resolve2(path4, ".."), { recursive: true });
  await writeFile4(path4, renderPinnedFactsContent(facts), "utf8");
}
async function syncPinnedFactSkills(facts, path4) {
  const rootDir = getProjectRoot2();
  const skillPaths = getPinnedFactSkillPaths(rootDir);
  if (facts.length === 0) {
    await rm3(join7(rootDir, ".claude", "skills", PINNED_FACTS_SKILL_NAME), {
      recursive: true,
      force: true
    });
    await rm3(join7(rootDir, ".codex", "skills", PINNED_FACTS_SKILL_NAME), {
      recursive: true,
      force: true
    });
    return skillPaths;
  }
  await mkdir5(join7(rootDir, ".claude", "skills", PINNED_FACTS_SKILL_NAME), {
    recursive: true
  });
  await mkdir5(join7(rootDir, ".codex", "skills", PINNED_FACTS_SKILL_NAME), {
    recursive: true
  });
  await writeFile4(skillPaths.claude, renderPinnedFactsSkill({
    name: PINNED_FACTS_SKILL_NAME,
    description: "Use these project-pinned facts before rediscovering paths, tools, or other stable repository-specific details.",
    facts,
    pinnedFactsPath: path4,
    rootDir
  }), "utf8");
  await writeFile4(skillPaths.codex, renderPinnedFactsSkill({
    name: PINNED_FACTS_SKILL_NAME,
    description: "Use these project-pinned facts before rediscovering paths, tools, or other stable repository-specific details.",
    facts,
    pinnedFactsPath: path4,
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
function formatPinnedFactsList(facts, path4, skillPaths) {
  if (facts.length === 0) {
    return [
      "No pinned facts saved for this project.",
      'Use "/pin <text>" to add one.',
      ...formatPinnedFactsLocations({
        path: path4,
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
      path: path4,
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
  const languageSummary = Object.entries(args.manifest.languages).map(([language, count]) => `${language}: ${count}`).join(" | ");
  return [
    "Code index build complete.",
    `Root: ${args.rootDir}`,
    `Output: ${args.outputDir}`,
    `Modules: ${args.manifest.moduleCount}`,
    `Classes: ${args.manifest.classCount}`,
    `Functions: ${args.manifest.functionCount}`,
    `Methods: ${args.manifest.methodCount}`,
    `Edges: ${args.manifest.edgeCount}`,
    `Truncated files: ${args.manifest.truncatedCount}`,
    `Languages: ${languageSummary || "none"}`,
    "",
    "Generated:",
    `- ${join7(args.outputDir, "index", "architecture.dot")}  (file-level dependency map)`,
    `- ${join7(args.outputDir, "__index__.py")}  (entry points, top dirs, hot symbols)`,
    `- ${join7(args.outputDir, "index", "summary.md")}`,
    `- ${join7(args.outputDir, "index", "manifest.json")}`,
    `- ${join7(args.outputDir, "skeleton")}`,
    `- ${args.skillPaths.claude}`,
    `- ${args.skillPaths.codex}`,
    `- ${args.skillPaths.opencode}`
  ].join(`
`);
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
  const rootDir = resolve2(cwd2, parsed.rootDir);
  const outputDir = parsed.outputDir ? resolve2(cwd2, parsed.outputDir) : resolve2(rootDir, ".code_index");
  try {
    const fileStat = await stat2(rootDir);
    if (!fileStat.isDirectory()) {
      return {
        type: "text",
        value: `Index root is not a directory: ${rootDir}`
      };
    }
  } catch (error2) {
    return {
      type: "text",
      value: `Cannot access index root: ${errorMessage2(error2)}`
    };
  }
  try {
    const result = await buildCodeIndex({
      rootDir,
      outputDir,
      maxFileBytes: parsed.maxFileBytes
    });
    return {
      type: "text",
      value: formatResult({
        manifest: result.manifest,
        outputDir: result.outputDir,
        rootDir: result.rootDir,
        skillPaths: result.skillPaths
      })
    };
  } catch (error2) {
    return {
      type: "text",
      value: `Code index build failed: ${errorMessage2(error2)}`
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
  const path4 = getPinnedFactsPath();
  if (!rawFact) {
    const facts = await readPinnedFacts();
    const skillPaths = await syncPinnedFactSkills(facts, path4);
    return {
      type: "text",
      value: formatPinnedFactsList(facts, path4, skillPaths)
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
      const skillPaths2 = await syncPinnedFactSkills(facts, path4);
      return {
        type: "text",
        value: [
          "Pinned fact already exists for this project:",
          `- ${exists}`,
          "",
          ...formatPinnedFactsLocations({
            path: path4,
            skillPaths: skillPaths2
          })
        ].join(`
`)
      };
    }
    const nextFacts = [...facts, fact];
    await writePinnedFacts(nextFacts);
    const skillPaths = await syncPinnedFactSkills(nextFacts, path4);
    return {
      type: "text",
      value: [
        "Pinned fact saved for this project:",
        `- ${fact}`,
        "",
        ...formatPinnedFactsLocations({
          path: path4,
          skillPaths
        })
      ].join(`
`)
    };
  } catch (error2) {
    return {
      type: "text",
      value: `Error updating pinned facts: ${errorMessage2(error2)}`
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
    const path4 = getPinnedFactsPath();
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
File: ${path4}`
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
    const skillPaths = await syncPinnedFactSkills(remainingFacts, path4);
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
          path: path4,
          skillPaths
        })
      ].join(`
`)
    };
  } catch (error2) {
    return {
      type: "text",
      value: `Error updating pinned facts: ${errorMessage2(error2)}`
    };
  }
}
var indexBuiltinCommand = {
  type: "local",
  name: "index",
  description: "Build a codebase structure index, file dependency DOT, and Python skeleton under .code_index",
  argumentHint: "[path] [--output DIR] [--max-file-bytes N]",
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
