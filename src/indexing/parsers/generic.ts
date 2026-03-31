import type { ClassIR, FunctionIR, ModuleIR } from '../ir.js'
import {
  computeBraceDepths,
  computeLineStarts,
  dedupeStrings,
  extractAwaitTargets,
  extractCallTargets,
  extractRaisedTargets,
  lineRangeFromOffsets,
  normalizeWhitespace,
  parseParametersFromSignature,
  relativePathToModuleId,
  sanitizeForStructure,
} from '../parserUtils.js'
import type { ParseContext } from './base.js'

function extractImports(text: string): string[] {
  const imports: string[] = []

  for (const match of text.matchAll(
    /^\s*(?:import|use|require|include|#include|from)\s+([A-Za-z0-9_./:<>"'-]+)/gm,
  )) {
    if (match[1]) {
      imports.push(match[1].replaceAll(/[<>"']/g, ''))
    }
  }

  return dedupeStrings(imports)
}

function buildGenericFunctionIR(args: {
  lineStarts: number[]
  moduleId: string
  name: string
  paramsText: string
  returnType?: string
  sourceText: string
  startOffset: number
  endOffsetExclusive: number
}): FunctionIR {
  return {
    kind: 'function',
    name: args.name,
    qualifiedName: `${args.moduleId}::${args.name}`,
    params: parseParametersFromSignature(args.paramsText),
    returns: args.returnType,
    decorators: [],
    calls: extractCallTargets(args.sourceText),
    awaits: extractAwaitTargets(args.sourceText),
    raises: extractRaisedTargets(args.sourceText),
    isAsync: /\basync\b/.test(args.sourceText),
    isPublic: !args.name.startsWith('_'),
    exported: !args.name.startsWith('_'),
    sourceLines: lineRangeFromOffsets(
      args.lineStarts,
      args.startOffset,
      args.endOffsetExclusive,
    ),
  }
}

function extractClasses(args: {
  lineStarts: number[]
  moduleId: string
  sanitizedText: string
  text: string
}): ClassIR[] {
  const classes: ClassIR[] = []
  const braceDepths = computeBraceDepths(args.sanitizedText)
  const classRegex =
    /(?:^|[\n;])\s*(?:pub\s+)?(?:abstract\s+)?(?:class|struct|trait|interface|enum|impl)\s+([A-Za-z_][A-Za-z0-9_:]*)/gm

  for (const match of args.sanitizedText.matchAll(classRegex)) {
    const name = match[1]
    if (!name) {
      continue
    }

    const nameIndex = (match.index ?? 0) + match[0].lastIndexOf(name)
    if ((braceDepths[nameIndex] ?? 0) !== 0) {
      continue
    }

    const bodyStartIndex = args.sanitizedText.indexOf('{', nameIndex)
    const bodyEndIndex =
      bodyStartIndex >= 0
        ? args.sanitizedText.indexOf('}', bodyStartIndex)
        : args.sanitizedText.indexOf('\n', nameIndex)

    classes.push({
      name,
      qualifiedName: `${args.moduleId}::${name}`,
      bases: [],
      dependsOn: [],
      methods: [],
      exported: true,
      sourceLines: lineRangeFromOffsets(
        args.lineStarts,
        nameIndex,
        bodyEndIndex >= 0 ? bodyEndIndex + 1 : nameIndex + name.length,
      ),
    })
  }

  return classes
}

function extractFunctions(args: {
  lineStarts: number[]
  moduleId: string
  sanitizedText: string
  text: string
}): FunctionIR[] {
  const functions: FunctionIR[] = []
  const braceDepths = computeBraceDepths(args.sanitizedText)
  const regexes = [
    /(?:^|[\n;])\s*(?:pub\s+)?(?:async\s+)?(?:fn|func|function|def)\s+([A-Za-z_][A-Za-z0-9_:]*)\s*\(([^)]*)\)/gm,
    /(?:^|[\n;])\s*[A-Za-z_][A-Za-z0-9_<>\s:*&]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*\{/gm,
  ]

  for (const regex of regexes) {
    for (const match of args.sanitizedText.matchAll(regex)) {
      const name = match[1]
      if (!name) {
        continue
      }

      const nameIndex = (match.index ?? 0) + match[0].lastIndexOf(name)
      if ((braceDepths[nameIndex] ?? 0) !== 0) {
        continue
      }

      const bodyEnd = args.sanitizedText.indexOf('\n', nameIndex)
      functions.push(
        buildGenericFunctionIR({
          lineStarts: args.lineStarts,
          moduleId: args.moduleId,
          name,
          paramsText: normalizeWhitespace(match[2] ?? ''),
          sourceText: args.text.slice(match.index ?? 0, bodyEnd >= 0 ? bodyEnd : undefined),
          startOffset: nameIndex,
          endOffsetExclusive:
            bodyEnd >= 0 ? bodyEnd : nameIndex + name.length,
        }),
      )
    }
  }

  return dedupeStrings(functions.map(fn => fn.qualifiedName))
    .map(name => functions.find(fn => fn.qualifiedName === name))
    .filter((fn): fn is FunctionIR => Boolean(fn))
}

export function parseGenericModule(
  context: ParseContext,
  extraNotes: string[] = [],
  extraErrors: string[] = [],
): ModuleIR {
  const moduleId = relativePathToModuleId(context.file.relativePath)
  const text = context.source.text
  const sanitizedText = sanitizeForStructure(text)
  const lineStarts = computeLineStarts(text)

  return {
    moduleId,
    sourcePath: context.file.absolutePath,
    relativePath: context.file.relativePath,
    language: context.file.language,
    parseMode: context.source.truncated ? 'generic-truncated' : 'generic-pattern',
    imports: extractImports(text),
    exports: [],
    classes: extractClasses({
      lineStarts,
      moduleId,
      sanitizedText,
      text,
    }),
    functions: extractFunctions({
      lineStarts,
      moduleId,
      sanitizedText,
      text,
    }),
    notes: dedupeStrings([
      ...extraNotes,
      ...(context.source.truncated
        ? [`source truncated to ${context.config.maxFileBytes} bytes before parsing`]
        : []),
    ]),
    errors: dedupeStrings(extraErrors),
    sourceBytes: context.source.byteSize,
    lineCount: lineStarts.length,
    truncated: context.source.truncated,
  }
}

