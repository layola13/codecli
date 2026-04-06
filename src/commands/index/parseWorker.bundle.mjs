// src/indexing/parseWorker.ts
import { parentPort } from "node:worker_threads";

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

// src/indexing/parseWorker.ts
function describeError2(error) {
  return error instanceof Error ? error.message : String(error);
}
if (!parentPort) {
  throw new Error("index parse worker requires a parent port");
}
parentPort.on("message", async (request) => {
  let response;
  try {
    response = {
      ok: true,
      module: await parseModuleWithBuiltinParsers(request)
    };
  } catch (error) {
    response = {
      ok: false,
      error: describeError2(error)
    };
  }
  parentPort.postMessage(response);
});
