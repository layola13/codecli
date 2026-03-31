import { mkdir, writeFile } from 'fs/promises'
import { dirname, join, parse } from 'path'
import type { ClassIR, FunctionIR, ModuleIR } from './ir.js'
import { pythonizeType, safePythonIdentifier } from './parserUtils.js'

function renderParam(param: FunctionIR['params'][number]): string {
  const name = safePythonIdentifier(param.name, 'arg')
  const annotation = pythonizeType(param.annotation)
  return `${name}: ${annotation}`
}

function renderFunction(
  fn: FunctionIR,
  options: { indent: string; insideClass: boolean },
): string[] {
  const indent = options.indent
  const lines: string[] = []
  const functionName =
    fn.name === 'constructor'
      ? '__init__'
      : safePythonIdentifier(fn.name, 'generated_function')
  const params = fn.params
    .filter(param => !['this', 'self', 'cls'].includes(param.name))
    .map(renderParam)

  if (options.insideClass) {
    params.unshift('self')
  }

  const returns =
    functionName === '__init__' ? 'None' : pythonizeType(fn.returns)
  const prefix = fn.isAsync ? 'async ' : ''
  lines.push(
    `${indent}${prefix}def ${functionName}(${params.join(', ')}) -> ${returns}:`,
  )
  lines.push(`${indent}    ...`)
  return lines
}

function renderClass(cls: ClassIR): string[] {
  const lines: string[] = []
  const className = safePythonIdentifier(cls.name, 'GeneratedClass')
  lines.push(`class ${className}:`)

  if (cls.methods.length === 0) {
    lines.push('    ...')
    return lines
  }

  const renderedMethods = cls.methods.flatMap((method, index) => [
    ...(index === 0 ? [] : ['']),
    ...renderFunction(method, { indent: '    ', insideClass: true }),
  ])
  lines.push(...renderedMethods)
  return lines
}

function renderModuleSkeleton(module: ModuleIR): string {
  const lines: string[] = []

  if (module.classes.length === 0 && module.functions.length === 0) {
    lines.push('...')
    return lines.join('\n') + '\n'
  }

  const body: string[] = []
  for (const cls of module.classes) {
    if (body.length > 0) {
      body.push('')
    }
    body.push(...renderClass(cls))
  }

  for (const fn of module.functions) {
    if (body.length > 0) {
      body.push('')
    }
    body.push(...renderFunction(fn, { indent: '', insideClass: false }))
  }

  return [...lines, ...body].join('\n') + '\n'
}

function getSkeletonRelativePath(
  relativePath: string,
  usedPaths: Set<string>,
): string {
  const parsed = parse(relativePath)
  let candidate = join(parsed.dir, `${parsed.name}.py`).replaceAll('\\', '/')
  if (!usedPaths.has(candidate)) {
    usedPaths.add(candidate)
    return candidate
  }

  const disambiguated = join(
    parsed.dir,
    `${parsed.name}__${parsed.base.replace(/[^A-Za-z0-9]+/g, '_')}.py`,
  ).replaceAll('\\', '/')
  usedPaths.add(disambiguated)
  return disambiguated
}

export async function emitSkeletonTree(
  modules: readonly ModuleIR[],
  outputDir: string,
): Promise<void> {
  const skeletonRoot = join(outputDir, 'skeleton')
  const usedPaths = new Set<string>()

  for (const module of modules) {
    const relativeTarget = getSkeletonRelativePath(module.relativePath, usedPaths)
    const targetPath = join(skeletonRoot, relativeTarget)
    await mkdir(dirname(targetPath), { recursive: true })
    await writeFile(targetPath, renderModuleSkeleton(module), 'utf8')
  }

  const overview = '...\n'
  await writeFile(join(skeletonRoot, '__root__.py'), overview, 'utf8')
}
