import { mkdir, rm } from 'fs/promises'
import { join } from 'path'
import type { CodeIndexBuildOptions } from './config.js'
import { resolveCodeIndexConfig } from './config.js'
import { discoverSourceFiles } from './discovery.js'
import { emitSkeletonTree } from './emitter.js'
import type { CodeIndexManifest, ModuleIR } from './ir.js'
import { relativePathToModuleId } from './parserUtils.js'
import { parseGenericModule } from './parsers/generic.js'
import { parsePythonModule } from './parsers/python.js'
import { parseTypeScriptLikeModule } from './parsers/typescriptLike.js'
import { readSourceText } from './source.js'
import { buildEdges, writeIndexFiles } from './indexWriter.js'
import {
  type CodeIndexSkillPaths,
  writeCodeIndexSkills,
} from './skillWriter.js'

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export type BuildCodeIndexResult = {
  manifest: CodeIndexManifest
  outputDir: string
  rootDir: string
  skillPaths: CodeIndexSkillPaths
}

function buildReadErrorModule(file: {
  absolutePath: string
  language: ModuleIR['language']
  relativePath: string
}): ModuleIR {
  return {
    moduleId: relativePathToModuleId(file.relativePath),
    sourcePath: file.absolutePath,
    relativePath: file.relativePath,
    language: file.language,
    parseMode: 'read-error',
    imports: [],
    importStubs: [],
    exports: [],
    classes: [],
    functions: [],
    notes: [],
    errors: ['failed to read source file'],
    sourceBytes: 0,
    lineCount: 0,
    truncated: false,
  }
}

async function prepareOutputDirectory(outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true })
  await rm(join(outputDir, 'skeleton'), { recursive: true, force: true })
  await rm(join(outputDir, 'index'), { recursive: true, force: true })
  await mkdir(join(outputDir, 'skeleton'), { recursive: true })
  await mkdir(join(outputDir, 'index'), { recursive: true })
}

function parseModule(context: Parameters<typeof parseGenericModule>[0]): ModuleIR {
  switch (context.file.language) {
    case 'typescript':
    case 'javascript':
      return parseTypeScriptLikeModule(context)
    case 'python':
      return parsePythonModule(context)
    default:
      return parseGenericModule(context)
  }
}

export async function buildCodeIndex(
  options: CodeIndexBuildOptions = {},
): Promise<BuildCodeIndexResult> {
  const config = resolveCodeIndexConfig(options)
  await prepareOutputDirectory(config.outputDir)

  const files = await discoverSourceFiles(config)
  const modules: ModuleIR[] = []

  for (const file of files) {
    let source
    try {
      source = await readSourceText(file.absolutePath, config.maxFileBytes)
    } catch (error) {
      const failedModule = buildReadErrorModule(file)
      failedModule.errors = [`read error: ${describeError(error)}`]
      modules.push(failedModule)
      continue
    }

    try {
      modules.push(
        parseModule({
          config,
          file,
          source,
        }),
      )
    } catch (error) {
      const fallback = parseGenericModule(
        {
          config,
          file,
          source,
        },
        ['parser fell back to generic pattern matching'],
        [`parse error: ${describeError(error)}`],
      )
      fallback.parseMode = source.truncated
        ? `fallback-${file.language}-truncated`
        : `fallback-${file.language}`
      modules.push(fallback)
    }
  }

  await emitSkeletonTree(modules, config.outputDir)
  const edges = buildEdges(modules)
  const manifest = await writeIndexFiles({
    edges,
    modules,
    outputDir: config.outputDir,
    rootDir: config.rootDir,
  })
  const skillPaths = await writeCodeIndexSkills({
    outputDir: config.outputDir,
    rootDir: config.rootDir,
  })

  return {
    manifest,
    outputDir: config.outputDir,
    rootDir: config.rootDir,
    skillPaths,
  }
}
