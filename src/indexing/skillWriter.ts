import { mkdir, rm, writeFile } from 'fs/promises'
import { join, relative } from 'path'

export type CodeIndexSkillPaths = {
  claude: string
  codex: string
}

function toPosixPath(value: string): string {
  return value.replaceAll('\\', '/')
}

function formatProjectPath(rootDir: string, targetPath: string): string {
  const relativePath = toPosixPath(relative(rootDir, targetPath))
  if (!relativePath) {
    return '.'
  }
  if (
    relativePath === '..' ||
    relativePath.startsWith('../') ||
    relativePath.startsWith('/')
  ) {
    return toPosixPath(targetPath)
  }
  return `./${relativePath}`
}

function renderSkillMarkdown(args: {
  description: string
  name: string
  rootDir: string
  outputDir: string
}): string {
  const outputPath = formatProjectPath(args.rootDir, args.outputDir)
  const summaryPath = `${outputPath}/index/summary.md`
  const skeletonPath = `${outputPath}/skeleton`
  const modulesPath = `${outputPath}/index/modules.jsonl`
  const symbolsPath = `${outputPath}/index/symbols.jsonl`
  const edgesPath = `${outputPath}/index/edges.jsonl`

  return [
    '---',
    `name: ${args.name}`,
    `description: ${args.description}`,
    '---',
    '',
    '# Code Index',
    '',
    '## Instructions',
    `- Start with \`${summaryPath}\` for the repo overview.`,
    `- Use \`${skeletonPath}/\` as the primary structure and reference view; skeleton functions include concise stub calls instead of full method bodies.`,
    `- Use \`${modulesPath}\`, \`${symbolsPath}\`, and \`${edgesPath}\` only when you need exact module, symbol, or edge-level detail.`,
    '- The skeleton is valid Python with lightweight call stubs, inheritance, and constructor assignments for easier grep and AST-based lookup.',
    '- If the index is stale after edits, rerun `/index`.',
    '',
  ].join('\n')
}

export async function writeCodeIndexSkills(args: {
  outputDir: string
  rootDir: string
}): Promise<CodeIndexSkillPaths> {
  const paths = {
    claude: join(args.rootDir, '.claude', 'skills', 'code-index', 'SKILL.md'),
    codex: join(args.rootDir, '.codex', 'skills', 'code-index', 'SKILL.md'),
  }

  await rm(join(args.rootDir, '.claude', 'code_index'), {
    recursive: true,
    force: true,
  })
  await rm(join(args.rootDir, '.agent', 'codex_index'), {
    recursive: true,
    force: true,
  })

  await mkdir(join(args.rootDir, '.claude', 'skills', 'code-index'), {
    recursive: true,
  })
  await mkdir(join(args.rootDir, '.codex', 'skills', 'code-index'), {
    recursive: true,
  })

  await writeFile(
    paths.claude,
    renderSkillMarkdown({
      name: 'code-index',
      description:
        'Use the shared code index under .code_index to inspect repo structure, follow imports or calls, and narrow source reads before touching implementation files.',
      rootDir: args.rootDir,
      outputDir: args.outputDir,
    }),
    'utf8',
  )

  await writeFile(
    paths.codex,
    renderSkillMarkdown({
      name: 'code-index',
      description:
        'Use the shared code index under .code_index to inspect repo structure, follow imports or calls, and narrow source reads before editing implementation files.',
      rootDir: args.rootDir,
      outputDir: args.outputDir,
    }),
    'utf8',
  )

  return paths
}
