import { describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildCodeIndex } from './build.js'

describe('buildCodeIndex', () => {
  it('emits skeleton and json indexes for ts and python inputs', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'claude-code-index-'))

    try {
      await writeFile(
        join(rootDir, 'service.ts'),
        `import { db } from './db'
export class OrderService extends BaseService {
  constructor(private readonly paymentService: PaymentService, private readonly db: Database) {}
  async createOrder(userId: string, cart: Cart): Promise<Order> {
    await this.paymentService.charge(userId)
    return db.save(cart)
  }
}
export const helper = async (value: string): Promise<void> => {
  await logValue(value)
}
`,
        'utf8',
      )

      await writeFile(
        join(rootDir, 'worker.py'),
        `import os

class Worker(BaseWorker):
    def __init__(self, client: Client, repo: Repo):
        self.client = client
        self.repo = repo

    async def run(self, task_id: str) -> Result:
        await self.client.fetch(task_id)
        return self.repo.save(task_id)

def top_level(value: str) -> None:
    raise RuntimeError(value)
`,
        'utf8',
      )

      const result = await buildCodeIndex({
        rootDir,
        outputDir: join(rootDir, '.code_index'),
      })

      expect(result.manifest.moduleCount).toBe(2)
      expect(result.manifest.classCount).toBe(2)
      expect(result.manifest.functionCount).toBe(2)

      const serviceSkeleton = await readFile(
        join(rootDir, '.code_index', 'skeleton', 'service.py'),
        'utf8',
      )
      expect(serviceSkeleton).toContain('class OrderService:')
      expect(serviceSkeleton).toContain('async def helper(value: str) -> None:')
      expect(serviceSkeleton).toContain('# calls: this.paymentService.charge, db.save')

      const workerSkeleton = await readFile(
        join(rootDir, '.code_index', 'skeleton', 'worker.py'),
        'utf8',
      )
      expect(workerSkeleton).toContain('def __init__(self, client: Client, repo: Repo) -> None:')
      expect(workerSkeleton).toContain('async def run(self, task_id: str) -> Result:')

      const manifestText = await readFile(
        join(rootDir, '.code_index', 'index', 'manifest.json'),
        'utf8',
      )
      expect(manifestText).toContain('"moduleCount": 2')

      const edgesText = await readFile(
        join(rootDir, '.code_index', 'index', 'edges.jsonl'),
        'utf8',
      )
      expect(edgesText).toContain('"kind":"imports"')
      expect(edgesText).toContain('"kind":"calls"')

      const claudeSkillText = await readFile(
        join(rootDir, '.claude', 'skills', 'code-index', 'SKILL.md'),
        'utf8',
      )
      expect(claudeSkillText).toContain('name: code-index')
      expect(claudeSkillText).toContain('`./.code_index/skeleton/`')

      const codexSkillText = await readFile(
        join(rootDir, '.codex', 'skills', 'code-index', 'SKILL.md'),
        'utf8',
      )
      expect(codexSkillText).toContain('name: code-index')
      expect(codexSkillText).toContain('`./.code_index/index/summary.md`')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
