// src/commands/index/cliBundleEntry.ts
import { execFileSync } from "child_process";
import { mkdir as mkdir5, readFile as readFile2, rm as rm3, stat as stat2, writeFile as writeFile4 } from "fs/promises";
import { homedir } from "os";
import { join as join5, relative as relative3, resolve as resolve2 } from "path";

// src/indexing/build.ts
import { mkdir as mkdir4, rm as rm2 } from "fs/promises";
import { join as join4 } from "path";

// src/indexing/config.ts
import { basename, resolve } from "path";
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
  const cwd = process.cwd();
  const rootDir = resolve(cwd, options.rootDir ?? ".");
  const outputDir = options.outputDir ? resolve(cwd, options.outputDir) : resolve(rootDir, ".code_index");
  return {
    rootDir,
    outputDir,
    outputDirName: basename(outputDir),
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
import { dirname, join, parse } from "path";

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
  let candidate = join(parsed.dir, `${parsed.name}.py`).replaceAll("\\", "/");
  if (!usedPaths.has(candidate)) {
    usedPaths.add(candidate);
    return candidate;
  }
  const disambiguated = join(parsed.dir, `${parsed.name}__${parsed.base.replace(/[^A-Za-z0-9]+/g, "_")}.py`).replaceAll("\\", "/");
  usedPaths.add(disambiguated);
  return disambiguated;
}
async function emitSkeletonTree(modules, outputDir) {
  const skeletonRoot = join(outputDir, "skeleton");
  const usedPaths = new Set;
  for (const module of modules) {
    const relativeTarget = getSkeletonRelativePath(module.relativePath, usedPaths);
    const targetPath = join(skeletonRoot, relativeTarget);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, renderModuleSkeleton(module), "utf8");
  }
  const overview = `...
`;
  await writeFile(join(skeletonRoot, "__root__.py"), overview, "utf8");
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
import { join as join2, parse as parsePath } from "path";
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
        for (const call of method.calls) {
          edges.push({
            edgeId: makeEdgeId(edges.length + 1),
            kind: "calls",
            source: method.qualifiedName,
            target: call,
            sourceFile: module.relativePath,
            sourceSymbol: method.qualifiedName,
            lineStart: method.sourceLines.start,
            lineEnd: method.sourceLines.end
          });
        }
      }
    }
    for (const fn of module.functions) {
      for (const call of fn.calls) {
        edges.push({
          edgeId: makeEdgeId(edges.length + 1),
          kind: "calls",
          source: fn.qualifiedName,
          target: call,
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
async function writeIndexFiles(args) {
  const indexDir = join2(args.outputDir, "index");
  await mkdir2(indexDir, { recursive: true });
  const manifest = buildManifest(args);
  await writeFile2(join2(indexDir, "manifest.json"), JSON.stringify(manifest, null, 2) + `
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
  await writeFile2(join2(indexDir, "modules.jsonl"), moduleLines.join(`
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
  await writeFile2(join2(indexDir, "symbols.jsonl"), symbolLines.join(`
`) + `
`, "utf8");
  await writeFile2(join2(indexDir, "summary.md"), renderSummary({
    edges: args.edges,
    manifest,
    modules: args.modules,
    outputDir: args.outputDir
  }), "utf8");
  await writePythonIndex(args);
  return manifest;
}
function toSkeletonRelativePath(relativePath) {
  const parsed = parsePath(relativePath);
  return join2(parsed.dir, `${parsed.name}.py`).replaceAll("\\", "/");
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
  await writeFile2(join2(outputDir, "__index__.py"), content, "utf8");
}

// src/indexing/skillWriter.ts
import { mkdir as mkdir3, rm, writeFile as writeFile3 } from "fs/promises";
import { join as join3, relative as relative2 } from "path";
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
    `- Start with \`${indexPath}\` for entry points, top directories, and high-priority symbols.`,
    `- Read \`${summaryPath}\` for a human-readable overview.`,
    `- Browse \`${skeletonPath}/\` as the primary structure view; skeleton functions include concise stub calls instead of full method bodies.`,
    `- Use \`${modulesPath}\` and \`${symbolsPath}\` only when you need exact module or symbol-level detail.`,
    "- The skeleton is valid Python with lightweight call stubs, inheritance, and constructor assignments for easier grep and AST-based lookup.",
    "- If the index is stale after edits, rerun `/index`.",
    ""
  ].join(`
`);
}
async function writeCodeIndexSkills(args) {
  const paths = {
    claude: join3(args.rootDir, ".claude", "skills", "code-index", "SKILL.md"),
    codex: join3(args.rootDir, ".codex", "skills", "code-index", "SKILL.md"),
    opencode: join3(args.rootDir, ".opencode", "skills", "code-index", "SKILL.md")
  };
  await rm(join3(args.rootDir, ".claude", "code_index"), {
    recursive: true,
    force: true
  });
  await rm(join3(args.rootDir, ".agent", "codex_index"), {
    recursive: true,
    force: true
  });
  await mkdir3(join3(args.rootDir, ".claude", "skills", "code-index"), {
    recursive: true
  });
  await mkdir3(join3(args.rootDir, ".codex", "skills", "code-index"), {
    recursive: true
  });
  await mkdir3(join3(args.rootDir, ".opencode", "skills", "code-index"), {
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
async function prepareOutputDirectory(outputDir) {
  await mkdir4(outputDir, { recursive: true });
  await rm2(join4(outputDir, "skeleton"), { recursive: true, force: true });
  await rm2(join4(outputDir, "index"), { recursive: true, force: true });
  await mkdir4(join4(outputDir, "skeleton"), { recursive: true });
  await mkdir4(join4(outputDir, "index"), { recursive: true });
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
    } catch (error) {
      const failedModule = buildReadErrorModule(file);
      failedModule.errors = [`read error: ${describeError(error)}`];
      modules.push(failedModule);
      continue;
    }
    try {
      modules.push(parseModule({
        config,
        file,
        source
      }));
    } catch (error) {
      const fallback = parseGenericModule({
        config,
        file,
        source
      }, ["parser fell back to generic pattern matching"], [`parse error: ${describeError(error)}`]);
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
var USAGE = [
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
function errorMessage(error) {
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
function getProjectRoot() {
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
  const memoryBase = process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR ?? process.env.CLAUDE_CONFIG_DIR ?? join5(homedir(), ".claude");
  return join5(memoryBase, "projects", sanitizePath(getProjectRoot()), "memory", PINNED_FACTS_FILENAME);
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
function getPinnedFactSkillPaths(rootDir = getProjectRoot()) {
  return {
    claude: join5(rootDir, ".claude", "skills", PINNED_FACTS_SKILL_NAME, "SKILL.md"),
    codex: join5(rootDir, ".codex", "skills", PINNED_FACTS_SKILL_NAME, "SKILL.md")
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
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error.code === "ENOENT" || error.code === "EISDIR")) {
      return [];
    }
    throw error;
  }
}
async function writePinnedFacts(facts) {
  const path = getPinnedFactsPath();
  await mkdir5(resolve2(path, ".."), { recursive: true });
  await writeFile4(path, renderPinnedFactsContent(facts), "utf8");
}
async function syncPinnedFactSkills(facts, path) {
  const rootDir = getProjectRoot();
  const skillPaths = getPinnedFactSkillPaths(rootDir);
  if (facts.length === 0) {
    await rm3(join5(rootDir, ".claude", "skills", PINNED_FACTS_SKILL_NAME), {
      recursive: true,
      force: true
    });
    await rm3(join5(rootDir, ".codex", "skills", PINNED_FACTS_SKILL_NAME), {
      recursive: true,
      force: true
    });
    return skillPaths;
  }
  await mkdir5(join5(rootDir, ".claude", "skills", PINNED_FACTS_SKILL_NAME), {
    recursive: true
  });
  await mkdir5(join5(rootDir, ".codex", "skills", PINNED_FACTS_SKILL_NAME), {
    recursive: true
  });
  await writeFile4(skillPaths.claude, renderPinnedFactsSkill({
    name: PINNED_FACTS_SKILL_NAME,
    description: "Use these project-pinned facts before rediscovering paths, tools, or other stable repository-specific details.",
    facts,
    pinnedFactsPath: path,
    rootDir
  }), "utf8");
  await writeFile4(skillPaths.codex, renderPinnedFactsSkill({
    name: PINNED_FACTS_SKILL_NAME,
    description: "Use these project-pinned facts before rediscovering paths, tools, or other stable repository-specific details.",
    facts,
    pinnedFactsPath: path,
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
function formatPinnedFactsList(facts, path, skillPaths) {
  if (facts.length === 0) {
    return [
      "No pinned facts saved for this project.",
      'Use "/pin <text>" to add one.',
      ...formatPinnedFactsLocations({
        path,
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
      path,
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
    `- ${join5(args.outputDir, "__index__.py")}  (entry points, top dirs, hot symbols)`,
    `- ${join5(args.outputDir, "index", "summary.md")}`,
    `- ${join5(args.outputDir, "index", "manifest.json")}`,
    `- ${join5(args.outputDir, "skeleton")}`,
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
      value: USAGE
    };
  }
  if (parsed.kind === "error") {
    return {
      type: "text",
      value: `${parsed.message}

${USAGE}`
    };
  }
  const cwd = process.cwd();
  const rootDir = resolve2(cwd, parsed.rootDir);
  const outputDir = parsed.outputDir ? resolve2(cwd, parsed.outputDir) : resolve2(rootDir, ".code_index");
  try {
    const fileStat = await stat2(rootDir);
    if (!fileStat.isDirectory()) {
      return {
        type: "text",
        value: `Index root is not a directory: ${rootDir}`
      };
    }
  } catch (error) {
    return {
      type: "text",
      value: `Cannot access index root: ${errorMessage(error)}`
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
  } catch (error) {
    return {
      type: "text",
      value: `Code index build failed: ${errorMessage(error)}`
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
  const path = getPinnedFactsPath();
  if (!rawFact) {
    const facts = await readPinnedFacts();
    const skillPaths = await syncPinnedFactSkills(facts, path);
    return {
      type: "text",
      value: formatPinnedFactsList(facts, path, skillPaths)
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
      const skillPaths2 = await syncPinnedFactSkills(facts, path);
      return {
        type: "text",
        value: [
          "Pinned fact already exists for this project:",
          `- ${exists}`,
          "",
          ...formatPinnedFactsLocations({
            path,
            skillPaths: skillPaths2
          })
        ].join(`
`)
      };
    }
    const nextFacts = [...facts, fact];
    await writePinnedFacts(nextFacts);
    const skillPaths = await syncPinnedFactSkills(nextFacts, path);
    return {
      type: "text",
      value: [
        "Pinned fact saved for this project:",
        `- ${fact}`,
        "",
        ...formatPinnedFactsLocations({
          path,
          skillPaths
        })
      ].join(`
`)
    };
  } catch (error) {
    return {
      type: "text",
      value: `Error updating pinned facts: ${errorMessage(error)}`
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
    const path = getPinnedFactsPath();
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
File: ${path}`
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
    const skillPaths = await syncPinnedFactSkills(remainingFacts, path);
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
          path,
          skillPaths
        })
      ].join(`
`)
    };
  } catch (error) {
    return {
      type: "text",
      value: `Error updating pinned facts: ${errorMessage(error)}`
    };
  }
}
var indexBuiltinCommand = {
  type: "local",
  name: "index",
  description: "Build a codebase structure index and Python skeleton under .code_index",
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
var cliBundleEntry_default = [indexBuiltinCommand, pinBuiltinCommand, unpinBuiltinCommand];
export {
  unpinBuiltinCommand,
  pinBuiltinCommand,
  indexBuiltinCommand,
  cliBundleEntry_default as default
};
