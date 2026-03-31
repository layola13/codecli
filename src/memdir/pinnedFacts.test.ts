import { describe, expect, it } from 'bun:test'
import {
  buildPinnedFactsContext,
  findExactPinnedFact,
  parsePinnedFactsContent,
  renderPinnedFactsContent,
} from './pinnedFactsFormat.js'

describe('pinnedFacts', () => {
  it('parses bullet entries and ignores headers or comments', () => {
    const facts = parsePinnedFactsContent(`
# Pinned Facts

Project-scoped facts explicitly pinned by the user.
<!-- No pinned facts yet. Use /pin <text> to add one. -->
- E:\\unreal_engine\\UE_5.7\\Engine\\Binaries\\Win64\\UnrealEditor.exe
* Use the internal staging API first
`)

    expect(facts).toEqual([
      'E:\\unreal_engine\\UE_5.7\\Engine\\Binaries\\Win64\\UnrealEditor.exe',
      'Use the internal staging API first',
    ])
  })

  it('dedupes pinned facts case-insensitively when rendering', () => {
    const content = renderPinnedFactsContent([
      'Use the staging API first',
      'use the staging api first',
      'E:\\unreal_engine\\UE_5.7\\Engine\\Binaries\\Win64\\UnrealEditor.exe',
    ])

    expect(parsePinnedFactsContent(content)).toEqual([
      'Use the staging API first',
      'E:\\unreal_engine\\UE_5.7\\Engine\\Binaries\\Win64\\UnrealEditor.exe',
    ])
  })

  it('treats only exact matches as duplicates', () => {
    expect(
      findExactPinnedFact(['Use the staging API first'], 'Use the staging API'),
    ).toBeNull()
    expect(
      findExactPinnedFact(['Use the staging API first'], 'use the staging api first'),
    ).toBe('Use the staging API first')
  })

  it('builds a high-priority context block for non-empty facts', () => {
    const context = buildPinnedFactsContext([
      'E:\\unreal_engine\\UE_5.7\\Engine\\Binaries\\Win64\\UnrealEditor.exe',
    ])

    expect(context).toContain('high-priority stable references')
    expect(context).toContain('Prefer using them before rediscovering')
    expect(context).toContain(
      '- E:\\unreal_engine\\UE_5.7\\Engine\\Binaries\\Win64\\UnrealEditor.exe',
    )
  })

  it('returns null context when no pinned facts exist', () => {
    expect(buildPinnedFactsContext([])).toBeNull()
  })
})
