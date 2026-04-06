import type { CodeIndexConfig } from './config.js'
import type { DiscoveredSourceFile } from './discovery.js'
import type { ModuleIR } from './ir.js'
import { relativePathToModuleId } from './parserUtils.js'
import { parseGenericModule } from './parsers/generic.js'
import { parsePythonModule } from './parsers/python.js'
import { parseTypeScriptLikeModule } from './parsers/typescriptLike.js'
import { readSourceText } from './source.js'

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function buildReadErrorModule(file: DiscoveredSourceFile): ModuleIR {
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

function createParserConfig(maxFileBytes: number): CodeIndexConfig {
  return {
    rootDir: '',
    outputDir: '',
    outputDirName: '',
    maxFileBytes,
    parseWorkers: 1,
    ignoredDirNames: new Set<string>(),
  }
}

function parseModule(context: {
  config: CodeIndexConfig
  file: DiscoveredSourceFile
  source: Awaited<ReturnType<typeof readSourceText>>
}): ModuleIR {
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

export type BuiltinParseRequest = {
  file: DiscoveredSourceFile
  maxFileBytes: number
}

export async function parseModuleWithBuiltinParsers(
  args: BuiltinParseRequest,
): Promise<ModuleIR> {
  const config = createParserConfig(args.maxFileBytes)

  let source
  try {
    source = await readSourceText(args.file.absolutePath, config.maxFileBytes)
  } catch (error) {
    const failedModule = buildReadErrorModule(args.file)
    failedModule.errors = [`read error: ${describeError(error)}`]
    return failedModule
  }

  try {
    return parseModule({
      config,
      file: args.file,
      source,
    })
  } catch (error) {
    const fallback = parseGenericModule(
      {
        config,
        file: args.file,
        source,
      },
      ['parser fell back to generic pattern matching'],
      [`parse error: ${describeError(error)}`],
    )
    fallback.parseMode = source.truncated
      ? `fallback-${args.file.language}-truncated`
      : `fallback-${args.file.language}`
    return fallback
  }
}
