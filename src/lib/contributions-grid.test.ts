import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  applyContributionCell,
  buildContributionWeeks,
  contributionCellSpec,
  contributionCellSpecs,
  contributionMonthLabels,
  contributionScope,
  createContributionCell,
  normalizeContributionLevel,
  scopeClassName,
  syncContributionLayers,
  type ContributionCell
} from './contributions-grid'

const cell = (date: string, count: number, level: number): ContributionCell => ({ date, count, level })

/** Minimal element stub: stores attributes and keeps classList derived from className. */
function fakeElement(className = '') {
  const attrs = new Map<string, string>()
  const dataKey = (key: string) => `data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
  const dataset = new Proxy({} as Record<string, string>, {
    get: (_, key: string) => attrs.get(dataKey(key)),
    set: (_, key: string, value) => {
      attrs.set(dataKey(key), String(value))
      return true
    },
    has: (_, key: string) => attrs.has(dataKey(key)),
    ownKeys: () => [...attrs.keys()].filter((name) => name.startsWith('data-')).map((name) => name.slice(5))
  })
  return {
    className,
    dataset,
    get classList() {
      return this.className.split(/\s+/).filter(Boolean)
    },
    setAttribute(name: string, value: string) {
      attrs.set(name, value)
    },
    getAttribute(name: string) {
      return attrs.has(name) ? (attrs.get(name) as string) : null
    },
    removeAttribute(name: string) {
      attrs.delete(name)
    },
    getAttributeNames() {
      return [...attrs.keys()]
    },
    attrs
  }
}

type FakeElement = ReturnType<typeof fakeElement>
const asElement = (el: FakeElement) => el as unknown as Element
const fakeDoc = () => ({ createElement: () => fakeElement() }) as unknown as Pick<Document, 'createElement'>
const createSpan = (spec: ReturnType<typeof contributionCellSpec>, scope?: ReturnType<typeof contributionScope>) =>
  createContributionCell(fakeDoc(), spec, scope) as unknown as FakeElement

// A calendar that starts on a Thursday and spans three weeks.
const days: ContributionCell[] = [
  cell('2026-01-01', 0, 0),
  cell('2026-01-02', 1, 1),
  cell('2026-01-03', 2, 2),
  cell('2026-01-04', 3, 3),
  cell('2026-01-05', 4, 4),
  cell('2026-01-06', 5, 4),
  cell('2026-01-07', 6, 4),
  cell('2026-01-08', 7, 4),
  cell('2026-01-09', 1, 1)
]

describe('contribution calendar bucketing', () => {
  test('pads the first week to Sunday and fills 7-day columns', () => {
    const weeks = buildContributionWeeks(days)
    expect(weeks).toHaveLength(2)
    // 2026-01-01 is a Thursday → four leading nulls (Sun..Wed)
    expect(weeks[0].slice(0, 4)).toEqual([null, null, null, null])
    expect(weeks[0][4]?.date).toBe('2026-01-01')
    expect(weeks[0]).toHaveLength(7)
    expect(weeks[1].map((day) => day?.date)).toEqual(['2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'])
  })

  test('drops future days so the last visible cell is today', () => {
    const weeks = buildContributionWeeks(days, '2026-01-08')
    expect(weeks.flat().filter(Boolean).at(-1)?.date).toBe('2026-01-08')
  })

  test('empty input yields no weeks (error is not a zero calendar)', () => {
    expect(buildContributionWeeks([])).toEqual([])
  })

  test('month labels appear once per column and never in column zero', () => {
    const start = Date.UTC(2026, 0, 4) // a Sunday
    const daily: ContributionCell[] = []
    for (let i = 0; i < 91; i++) {
      const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10)
      daily.push(cell(date, 1, 1))
    }
    const labels = contributionMonthLabels(buildContributionWeeks(daily))
    expect(labels[0]).toBe('')
    expect(labels.filter((label) => label === 'feb')).toHaveLength(1)
    expect(labels.filter((label) => label === 'mar')).toHaveLength(1)
    expect(labels.filter(Boolean)).toEqual(['feb', 'mar'])
  })

  test('levels are clamped to the five painted buckets', () => {
    expect(normalizeContributionLevel(-2)).toBe(0)
    expect(normalizeContributionLevel(9)).toBe(4)
    expect(normalizeContributionLevel(Number.NaN)).toBe(0)
    expect(contributionCellSpec(cell('2026-01-01', 99, 7), true).level).toBe('4')
  })
})

describe('Astro style-scope preservation (production heat-map regression)', () => {
  test('scope tokens are read from markup, not hardcoded', () => {
    const el = fakeElement('gh-cell astro-abc123')
    el.setAttribute('data-astro-cid-abc123', '')
    const scope = contributionScope(asElement(el))
    expect(scope.classes).toEqual(['astro-abc123'])
    expect(scope.attrs).toEqual([['data-astro-cid-abc123', '']])
    expect(contributionScope(null)).toEqual({ classes: [], attrs: [] })
  })

  test('created cells carry the scope class so scoped palette rules match', () => {
    const scope = { classes: ['astro-abc123'], attrs: [['data-astro-cid-abc123', '']] as [string, string][] }
    const span = createSpan(contributionCellSpec(cell('2026-01-05', 5, 4), true), scope)
    expect(span.className.split(' ')).toContain('gh-cell')
    expect(span.className.split(' ')).toContain('astro-abc123')
    expect(span.dataset.level).toBe('4')
    expect(span.dataset.date).toBe('2026-01-05')
    expect(span.dataset.count).toBe('5')
    expect(span.getAttribute('data-astro-cid-abc123')).toBe('')
    expect(span.getAttribute('aria-hidden')).toBeNull()
  })

  test('padding cells stay hidden and data-free in both layers', () => {
    const spec = contributionCellSpec(null, true)
    expect(spec.className).toBe('gh-cell gh-cell-pad')
    expect(spec.level).toBe('empty')
    const span = createSpan(spec, { classes: ['astro-abc123'], attrs: [] })
    expect(span.dataset.date).toBeUndefined()
    expect(span.dataset.count).toBeUndefined()
    expect(span.getAttribute('aria-hidden')).toBe('true')
  })

  test('the bright layer never carries tooltip data', () => {
    const span = createSpan(contributionCellSpec(cell('2026-01-05', 5, 3), false), { classes: ['astro-abc123'], attrs: [] })
    expect(span.dataset.level).toBe('3')
    expect(span.dataset.date).toBeUndefined()
    expect(span.dataset.count).toBeUndefined()
  })

  test('scopeClassName merges without duplicating tokens', () => {
    expect(scopeClassName('gh-cell', { classes: ['astro-a', 'gh-cell'], attrs: [] })).toBe('gh-cell astro-a')
    expect(scopeClassName('', { classes: ['astro-a'], attrs: [] })).toBe('astro-a')
  })

  test('in-place updates keep the existing scope class', () => {
    const span = fakeElement('gh-cell astro-abc123')
    applyContributionCell(asElement(span), contributionCellSpec(cell('2026-01-06', 1, 1), true))
    expect(span.className.split(' ')).toEqual(['gh-cell', 'astro-abc123'])
    expect(span.getAttribute('data-level')).toBe('1')
    expect(span.getAttribute('data-date')).toBe('2026-01-06')
    expect(span.getAttribute('data-count')).toBe('1')

    // Same element reused for the bright layer: date/count must be dropped.
    applyContributionCell(asElement(span), contributionCellSpec(cell('2026-01-06', 1, 2), false))
    expect(span.className.split(' ')).toEqual(['gh-cell', 'astro-abc123'])
    expect(span.getAttribute('data-date')).toBeNull()
    expect(span.getAttribute('data-count')).toBeNull()
  })

  test('refresh sync writes levels in place when the grid keeps its shape', () => {
    const weeks = buildContributionWeeks(days)
    const specs = contributionCellSpecs(weeks, true)
    const base = specs.map(() => fakeElement('gh-cell astro-abc123'))
    const bright = specs.map(() => fakeElement('gh-cell astro-abc123'))
    expect(syncContributionLayers(base.map(asElement), bright.map(asElement), weeks)).toBe(true)
    expect(base.map((el) => el.getAttribute('data-level'))).toEqual(specs.map((spec) => spec.level))
    expect(bright.map((el) => el.getAttribute('data-level'))).toEqual(specs.map((spec) => spec.level))
    // Every synced cell still exposes the scope token the CSS needs.
    for (const el of [...base, ...bright]) expect(el.className).toContain('astro-abc123')
  })

  test('refresh reports a shape change so the caller rebuilds instead of misaligning', () => {
    const weeks = buildContributionWeeks(days)
    const base = [fakeElement('gh-cell astro-abc123')]
    const bright = [fakeElement('gh-cell astro-abc123')]
    expect(syncContributionLayers(base.map(asElement), bright.map(asElement), weeks)).toBe(false)
  })
})

describe('component wiring contract', () => {
  const source = readFileSync(new URL('../components/projects/GitHubContributions.astro', import.meta.url), 'utf8')
  const client = readFileSync(new URL('./contributions-client.js', import.meta.url), 'utf8')

  test('the calendar hydrates through a bundled module, not a duplicated inline script', () => {
    expect(source).toContain("import { initContributionCalendars } from '@/lib/contributions-client.js'")
    expect(source).not.toContain('<script is:inline>')
  })

  test('runtime DOM building goes through the scope-aware helpers', () => {
    expect(client).toContain('createContributionCell')
    expect(client).toContain('syncContributionLayers')
    expect(client).not.toMatch(/className\s*=\s*cell\s*\?/)
  })

  test('every heat level has distinct base/bright tokens and a paper override', () => {
    const card = source.slice(source.indexOf('.gh-contrib-card {'), source.indexOf('.gh-contrib-grid {'))
    for (const token of ['empty', '1', '2', '3', '4']) {
      expect(card).toContain(`--gh-base-${token}:`)
      expect(card).toContain(`--gh-bright-${token}:`)
      expect(source).toContain(`--gh-paper-base-${token}:`)
      expect(source).toContain(`--gh-paper-bright-${token}:`)
    }
    expect(source).toContain("html[data-appearance='paper'].dark")
  })
})
