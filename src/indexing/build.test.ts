import { describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildCodeIndex } from './build.js'

describe('buildCodeIndex', () => {
  it('emits skeleton, json indexes, dot map, and skills for ts and python inputs', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'claude-code-index-'))

    try {
      await mkdir(join(rootDir, 'src'), { recursive: true })

      await writeFile(
        join(rootDir, 'service.ts'),
        `import { join } from 'path'
import { db } from './db'
import type { Cart, Order } from './types'
export class OrderService extends BaseService {
  constructor(private readonly paymentService: PaymentService, private readonly db: Database) {}
  async createOrder(userId: string, cart: Cart): Promise<Order> {
    join('orders', userId)
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
        join(rootDir, 'db.ts'),
        `export const db = {
  save(value: unknown): unknown {
    return value
  },
}
`,
        'utf8',
      )

      await writeFile(
        join(rootDir, 'types.ts'),
        `export type Cart = {
  id: string
}

export type Order = {
  id: string
}
`,
        'utf8',
      )

      await writeFile(
        join(rootDir, 'src', 'utils.ts'),
        `export const formatOrder = 'format-order'
`,
        'utf8',
      )

      await writeFile(
        join(rootDir, 'entry.ts'),
        `import React from 'react'
import { formatOrder } from 'src/utils.js'

export const ENTRY = formatOrder
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

      expect(result.manifest.moduleCount).toBe(6)
      expect(result.manifest.classCount).toBe(2)
      expect(result.manifest.functionCount).toBe(2)

      const serviceSkeleton = await readFile(
        join(rootDir, '.code_index', 'skeleton', 'service.py'),
        'utf8',
      )
      expect(serviceSkeleton).toContain('from __future__ import annotations')
      expect(serviceSkeleton).toContain('from .db import db')
      expect(serviceSkeleton).toContain('from .types import Cart, Order')
      expect(serviceSkeleton).toContain('class OrderService(BaseService):')
      expect(serviceSkeleton).toContain('def __init__(self, paymentService: PaymentService, db: Database) -> None:')
      expect(serviceSkeleton).toContain('self.paymentService = paymentService')
      expect(serviceSkeleton).toContain('self.db = db')
      expect(serviceSkeleton).toContain('await self.paymentService.charge(...)')
      expect(serviceSkeleton).toContain('return db.save(...)')
      expect(serviceSkeleton).toContain('async def helper(value: str) -> None:')
      expect(serviceSkeleton).toContain('await logValue(...)')

      const workerSkeleton = await readFile(
        join(rootDir, '.code_index', 'skeleton', 'worker.py'),
        'utf8',
      )
      expect(workerSkeleton).toContain('import os')
      expect(workerSkeleton).toContain('class Worker(BaseWorker):')
      expect(workerSkeleton).toContain('def __init__(self, client: Client, repo: Repo) -> None:')
      expect(workerSkeleton).toContain('self.client = client')
      expect(workerSkeleton).toContain('self.repo = repo')
      expect(workerSkeleton).toContain('async def run(self, task_id: str) -> Result:')
      expect(workerSkeleton).toContain('await self.client.fetch(...)')
      expect(workerSkeleton).toContain('return self.repo.save(...)')
      expect(workerSkeleton).toContain('raise RuntimeError(...)')
      expect(workerSkeleton).not.toContain('\n    RuntimeError(...)\n')

      const rootSkeleton = await readFile(
        join(rootDir, '.code_index', 'skeleton', '__root__.py'),
        'utf8',
      )
      expect(rootSkeleton).toBe('...\n')

      const manifestText = await readFile(
        join(rootDir, '.code_index', 'index', 'manifest.json'),
        'utf8',
      )
      expect(manifestText).toContain('"moduleCount": 6')

      const edgesText = await readFile(
        join(rootDir, '.code_index', 'index', 'edges.jsonl'),
        'utf8',
      )
      expect(edgesText).toContain('"kind":"imports"')
      expect(edgesText).toContain('"kind":"calls"')

      const architectureDot = await readFile(
        join(rootDir, '.code_index', 'index', 'architecture.dot'),
        'utf8',
      )
      expect(architectureDot).toStartWith('digraph{')
      expect(architectureDot).not.toContain('subgraph')
      expect(architectureDot).not.toContain('color=')
      expect(architectureDot).not.toContain('shape=')
      expect(architectureDot).not.toContain('worker.py')
      expect(architectureDot).not.toContain('react')
      expect(architectureDot).not.toContain('path')
      expect(architectureDot).not.toContain('OrderService')

      const nodeToPath = new Map<string, string>()
      const fileEdges: string[] = []
      for (const line of architectureDot.trim().split('\n')) {
        const nodeMatch = line.match(/^(n[0-9a-z]+)\[label="([^"]+)"\]$/)
        if (nodeMatch?.[1] && nodeMatch[2]) {
          nodeToPath.set(nodeMatch[1], nodeMatch[2])
        }

        const edgeMatch = line.match(/^(n[0-9a-z]+)->(n[0-9a-z]+)$/)
        if (edgeMatch?.[1] && edgeMatch[2]) {
          const sourcePath = nodeToPath.get(edgeMatch[1])
          const targetPath = nodeToPath.get(edgeMatch[2])
          if (sourcePath && targetPath) {
            fileEdges.push(`${sourcePath}->${targetPath}`)
          }
        }
      }

      expect(fileEdges).toContain('entry.ts->src/utils.ts')
      expect(fileEdges).toContain('service.ts->db.ts')
      expect(fileEdges).toContain('service.ts->types.ts')

      const claudeSkillText = await readFile(
        join(rootDir, '.claude', 'skills', 'code-index', 'SKILL.md'),
        'utf8',
      )
      expect(claudeSkillText).toContain('name: code-index')
      expect(claudeSkillText).toContain('`./.code_index/index/architecture.dot`')
      expect(claudeSkillText).toContain('`./.code_index/skeleton/`')
      expect(claudeSkillText).toContain('If a file is missing from the DOT')
      expect(claudeSkillText).toContain('valid Python with lightweight call stubs')
      expect(claudeSkillText).not.toContain('references.jsonl')
      expect(claudeSkillText).not.toContain('source_lines')

      const codexSkillText = await readFile(
        join(rootDir, '.codex', 'skills', 'code-index', 'SKILL.md'),
        'utf8',
      )
      expect(codexSkillText).toContain('name: code-index')
      expect(codexSkillText).toContain('`./.code_index/index/architecture.dot`')
      expect(codexSkillText).toContain('`./.code_index/index/summary.md`')
      expect(codexSkillText).toContain('valid Python with lightweight call stubs')
      expect(codexSkillText).not.toContain('references.jsonl')
      expect(codexSkillText).not.toContain('source_lines')

      const opencodeSkillText = await readFile(
        join(rootDir, '.opencode', 'skills', 'code-index', 'SKILL.md'),
        'utf8',
      )
      expect(opencodeSkillText).toContain('name: code-index')
      expect(opencodeSkillText).toContain('`./.code_index/index/architecture.dot`')
      expect(opencodeSkillText).toContain('method-level detail')
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
