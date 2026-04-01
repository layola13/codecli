import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import type { CodeIndexManifest, EdgeIR, FunctionIR, ModuleIR } from './ir.js'

function makeEdgeId(index: number): string {
  return `edge-${index.toString().padStart(6, '0')}`
}

function renderFunctionSignature(fn: FunctionIR): string {
  const params = fn.params
    .map(param =>
      param.annotation
        ? `${param.name}: ${param.annotation}`
        : param.name,
    )
    .join(', ')

  return `${fn.name}(${params})${fn.returns ? ` -> ${fn.returns}` : ''}`
}

export function buildEdges(modules: readonly ModuleIR[]): EdgeIR[] {
  const edges: EdgeIR[] = []

  for (const module of modules) {
    for (const imported of module.imports) {
      edges.push({
        edgeId: makeEdgeId(edges.length + 1),
        kind: 'imports',
        source: module.moduleId,
        target: imported,
        sourceFile: module.relativePath,
      })
    }

    for (const cls of module.classes) {
      for (const base of cls.bases) {
        edges.push({
          edgeId: makeEdgeId(edges.length + 1),
          kind: 'inherits',
          source: cls.qualifiedName,
          target: base,
          sourceFile: module.relativePath,
          sourceSymbol: cls.qualifiedName,
          lineStart: cls.sourceLines.start,
          lineEnd: cls.sourceLines.end,
        })
      }

      for (const dependency of cls.dependsOn) {
        edges.push({
          edgeId: makeEdgeId(edges.length + 1),
          kind: 'depends_on',
          source: cls.qualifiedName,
          target: dependency,
          sourceFile: module.relativePath,
          sourceSymbol: cls.qualifiedName,
          lineStart: cls.sourceLines.start,
          lineEnd: cls.sourceLines.end,
        })
      }

      for (const method of cls.methods) {
        for (const call of method.calls) {
          edges.push({
            edgeId: makeEdgeId(edges.length + 1),
            kind: 'calls',
            source: method.qualifiedName,
            target: call,
            sourceFile: module.relativePath,
            sourceSymbol: method.qualifiedName,
            lineStart: method.sourceLines.start,
            lineEnd: method.sourceLines.end,
          })
        }
      }
    }

    for (const fn of module.functions) {
      for (const call of fn.calls) {
        edges.push({
          edgeId: makeEdgeId(edges.length + 1),
          kind: 'calls',
          source: fn.qualifiedName,
          target: call,
          sourceFile: module.relativePath,
          sourceSymbol: fn.qualifiedName,
          lineStart: fn.sourceLines.start,
          lineEnd: fn.sourceLines.end,
        })
      }
    }
  }

  return edges
}

export function buildManifest(args: {
  edges: readonly EdgeIR[]
  modules: readonly ModuleIR[]
  outputDir: string
  rootDir: string
}): CodeIndexManifest {
  const languages: Record<string, number> = {}
  const parseModes: Record<string, number> = {}
  let classCount = 0
  let functionCount = 0
  let methodCount = 0
  let truncatedCount = 0

  for (const module of args.modules) {
    languages[module.language] = (languages[module.language] ?? 0) + 1
    parseModes[module.parseMode] = (parseModes[module.parseMode] ?? 0) + 1
    classCount += module.classes.length
    functionCount += module.functions.length
    methodCount += module.classes.reduce(
      (count, cls) => count + cls.methods.length,
      0,
    )
    truncatedCount += module.truncated ? 1 : 0
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
    parseModes,
  }
}

function renderSummary(args: {
  edges: readonly EdgeIR[]
  manifest: CodeIndexManifest
  modules: readonly ModuleIR[]
  outputDir: string
}): string {
  const largestModules = [...args.modules]
    .sort((left, right) => {
      const leftCount =
        left.functions.length +
        left.classes.length +
        left.classes.reduce((count, cls) => count + cls.methods.length, 0)
      const rightCount =
        right.functions.length +
        right.classes.length +
        right.classes.reduce((count, cls) => count + cls.methods.length, 0)
      return rightCount - leftCount
    })
    .slice(0, 20)

  const lines = [
    '# Code Index Summary',
    '',
    `- root: ${args.manifest.rootDir}`,
    `- output: ${args.outputDir}`,
    `- modules: ${args.manifest.moduleCount}`,
    `- classes: ${args.manifest.classCount}`,
    `- functions: ${args.manifest.functionCount}`,
    `- methods: ${args.manifest.methodCount}`,
    `- edges: ${args.manifest.edgeCount}`,
    `- truncated_files: ${args.manifest.truncatedCount}`,
    '',
    '## Languages',
    ...Object.entries(args.manifest.languages).map(
      ([language, count]) => `- ${language}: ${count}`,
    ),
    '',
    '## Parse Modes',
    ...Object.entries(args.manifest.parseModes).map(
      ([mode, count]) => `- ${mode}: ${count}`,
    ),
    '',
    '## Largest Modules',
    '| Module | Classes | Functions | Methods | Imports | Parse mode |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
    ...largestModules.map(module => {
      const methods = module.classes.reduce(
        (count, cls) => count + cls.methods.length,
        0,
      )
      return `| ${module.relativePath.replaceAll('|', '\\|')} | ${module.classes.length} | ${module.functions.length} | ${methods} | ${module.imports.length} | ${module.parseMode} |`
    }),
  ]

  const failedModules = args.modules.filter(module => module.errors.length > 0)
  if (failedModules.length > 0) {
    lines.push('', '## Parse Errors')
    for (const module of failedModules.slice(0, 20)) {
      lines.push(`- ${module.relativePath}: ${module.errors.join('; ')}`)
    }
  }

  return lines.join('\n') + '\n'
}

export async function writeIndexFiles(args: {
  edges: readonly EdgeIR[]
  modules: readonly ModuleIR[]
  outputDir: string
  rootDir: string
}): Promise<CodeIndexManifest> {
  const indexDir = join(args.outputDir, 'index')
  await mkdir(indexDir, { recursive: true })

  const manifest = buildManifest(args)
  await writeFile(
    join(indexDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8',
  )

  const moduleLines = args.modules.map(module =>
    JSON.stringify({
      module_id: module.moduleId,
      path: module.relativePath,
      lang: module.language,
      imports_count: module.imports.length,
      classes_count: module.classes.length,
      functions_count: module.functions.length,
      methods_count: module.classes.reduce(
        (count, cls) => count + cls.methods.length,
        0,
      ),
      parse_mode: module.parseMode,
      truncated: module.truncated,
      notes: module.notes,
      errors: module.errors,
    }),
  )
  await writeFile(join(indexDir, 'modules.jsonl'), moduleLines.join('\n') + '\n', 'utf8')

  const symbolLines: string[] = []
  for (const module of args.modules) {
    for (const cls of module.classes) {
      symbolLines.push(
        JSON.stringify({
          symbol_id: `${module.moduleId}::class:${cls.name}`,
          module_id: module.moduleId,
          kind: 'class',
          qualified_name: cls.qualifiedName,
          signature: cls.bases.length > 0 ? `class ${cls.name}(${cls.bases.join(', ')})` : `class ${cls.name}`,
          source_lines: cls.sourceLines,
        }),
      )

      for (const method of cls.methods) {
        symbolLines.push(
          JSON.stringify({
            symbol_id: `${module.moduleId}::method:${cls.name}.${method.name}`,
            module_id: module.moduleId,
            kind: 'method',
            qualified_name: method.qualifiedName,
            signature: renderFunctionSignature(method),
            source_lines: method.sourceLines,
          }),
        )
      }
    }

    for (const fn of module.functions) {
      symbolLines.push(
        JSON.stringify({
          symbol_id: `${module.moduleId}::function:${fn.name}`,
          module_id: module.moduleId,
          kind: 'function',
          qualified_name: fn.qualifiedName,
          signature: renderFunctionSignature(fn),
          source_lines: fn.sourceLines,
        }),
      )
    }
  }
  await writeFile(join(indexDir, 'symbols.jsonl'), symbolLines.join('\n') + '\n', 'utf8')

  await writeFile(
    join(indexDir, 'edges.jsonl'),
    args.edges.map(edge => JSON.stringify(edge)).join('\n') + '\n',
    'utf8',
  )

  await writeFile(
    join(indexDir, 'summary.md'),
    renderSummary({
      edges: args.edges,
      manifest,
      modules: args.modules,
      outputDir: args.outputDir,
    }),
    'utf8',
  )

  return manifest
}
