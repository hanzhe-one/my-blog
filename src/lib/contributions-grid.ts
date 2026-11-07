/**
 * Framework-free helpers for the GitHub contribution calendar.
 *
 * The calendar renders cells twice (a muted base layer and a saturated
 * "spotlight" layer). Both the SSR template and the client-side refresh must
 * produce exactly the same DOM contract, otherwise the scoped styles in
 * `GitHubContributions.astro` stop matching. Keeping the builders here means
 * the two paths cannot drift and the refresh can be unit-tested without a
 * browser.
 */

export type ContributionCell = {
  date: string
  count: number
  level: number
}

export type ContributionWeek = (ContributionCell | null)[]

export const MAX_CONTRIBUTION_LEVEL = 4

/** Clamp an upstream level so a rogue value can never fall outside the palette. */
export function normalizeContributionLevel(level: number): number {
  if (!Number.isFinite(level)) return 0
  return Math.min(MAX_CONTRIBUTION_LEVEL, Math.max(0, Math.trunc(level)))
}

/**
 * Bucket a chronological (oldest-first) day list into Sunday-aligned weeks.
 * `todayISO` drops any day the upstream API overshoots into the future.
 */
export function buildContributionWeeks(
  cells: readonly ContributionCell[],
  todayISO?: string
): ContributionWeek[] {
  const filtered = todayISO ? cells.filter((cell) => cell.date <= todayISO) : cells.slice()
  if (filtered.length === 0) return []

  // Leading padding so the first column starts on Sunday; UTC avoids local-TZ drift.
  const leading = new Date(`${filtered[0].date}T00:00:00Z`).getUTCDay()
  const weeks: ContributionWeek[] = []
  let week: ContributionWeek = Array(leading).fill(null)
  for (const cell of filtered) {
    week.push(cell)
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length > 0) weeks.push(week)
  return weeks
}

/**
 * Month abbreviation for each week column, only when the month first appears
 * in that column. The first column stays blank (no room for a label).
 */
export function contributionMonthLabels(weeks: readonly ContributionWeek[]): string[] {
  return weeks.map((week, index) => {
    const firstReal = week.find((cell): cell is ContributionCell => cell !== null)
    if (!firstReal || index === 0) return ''
    const month = new Date(`${firstReal.date}T00:00:00Z`).getUTCMonth()
    const prevWeek = weeks[index - 1]
    const prevReal = prevWeek?.find((cell): cell is ContributionCell => cell !== null)
    if (!prevReal) return ''
    if (new Date(`${prevReal.date}T00:00:00Z`).getUTCMonth() === month) return ''
    return new Date(`${firstReal.date}T00:00:00Z`)
      .toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
      .toLowerCase()
  })
}

/** Flattened column-major cell list (same order the grid lays cells out). */
export function contributionCellSpecs(
  weeks: readonly ContributionWeek[],
  withData: boolean
): CellSpec[] {
  return weeks.flat().map((cell) => contributionCellSpec(cell, withData))
}

export type CellSpec = {
  className: string
  level: string
  date?: string
  count?: string
  ariaHidden: boolean
  dataAttributes: boolean
}

export function contributionCellSpec(cell: ContributionCell | null, withData: boolean): CellSpec {
  if (!cell) {
    return {
      className: 'gh-cell gh-cell-pad',
      level: 'empty',
      ariaHidden: true,
      dataAttributes: false
    }
  }
  return {
    className: 'gh-cell',
    level: String(normalizeContributionLevel(cell.level)),
    date: cell.date,
    count: String(cell.count),
    ariaHidden: false,
    dataAttributes: withData
  }
}

/**
 * Astro scopes component `<style>` blocks by tagging every element it renders
 * with a class such as `astro-nznuvqpk` (older versions also emit
 * `data-astro-cid-*` attributes). Selectors compile to
 * `.gh-cell:where(.astro-nznuvqpk)`, so any element created at runtime MUST
 * carry that token or it silently loses every colour rule. Read it off the
 * server-rendered markup instead of hardcoding the hash.
 */
export type ScopeToken = {
  classes: string[]
  attrs: [string, string][]
}

const SCOPE_CLASS_PREFIX = 'astro-'
const SCOPE_ATTR_PREFIX = 'data-astro-cid-'

export function contributionScope(el: Element | null | undefined): ScopeToken {
  if (!el) return { classes: [], attrs: [] }
  const classes = Array.from(el.classList).filter((name) => name.startsWith(SCOPE_CLASS_PREFIX))
  const attrs = el
    .getAttributeNames()
    .filter((name) => name.startsWith(SCOPE_ATTR_PREFIX))
    .map((name): [string, string] => [name, el.getAttribute(name) ?? ''])
  return { classes, attrs }
}

export function scopeClassName(base: string, scope: ScopeToken | undefined): string {
  const names = [base, ...(scope?.classes ?? [])].filter(Boolean)
  return Array.from(new Set(names.flatMap((name) => name.split(/\s+/)).filter(Boolean))).join(' ')
}

/** Create a cell that the scoped heat palette can actually paint. */
export function createContributionCell(
  doc: Pick<Document, 'createElement'>,
  spec: CellSpec,
  scope?: ScopeToken
): HTMLSpanElement {
  const span = doc.createElement('span') as HTMLSpanElement
  span.className = scopeClassName(spec.className, scope)
  span.dataset.level = spec.level
  if (spec.dataAttributes && spec.date) span.dataset.date = spec.date
  if (spec.dataAttributes && spec.count !== undefined) span.dataset.count = spec.count
  if (spec.ariaHidden) span.setAttribute('aria-hidden', 'true')
  for (const [name, value] of scope?.attrs ?? []) span.setAttribute(name, value)
  return span
}

/**
 * Rewrite an existing cell in place, preserving its Astro scope token. Updating
 * in place is preferred over rebuilding: it keeps event delegation, the active
 * cell and the browser's paint work intact.
 */
export function applyContributionCell(el: Element, spec: CellSpec): void {
  const kept = Array.from(el.classList).filter((name) => name.startsWith(SCOPE_CLASS_PREFIX))
  el.className = scopeClassName(spec.className, { classes: kept, attrs: [] })
  el.setAttribute('data-level', spec.level)
  if (spec.dataAttributes && spec.date) el.setAttribute('data-date', spec.date)
  else el.removeAttribute('data-date')
  if (spec.dataAttributes && spec.count !== undefined) el.setAttribute('data-count', spec.count)
  else el.removeAttribute('data-count')
  if (spec.ariaHidden) el.setAttribute('aria-hidden', 'true')
  else el.removeAttribute('aria-hidden')
}

/**
 * Sync both layers from the fetched calendar. Returns false when the column
 * count changed, meaning the caller must rebuild the layers (the in-place path
 * cannot resize a CSS grid).
 */
export function syncContributionLayers(
  baseCells: readonly Element[],
  brightCells: readonly Element[],
  weeks: readonly ContributionWeek[]
): boolean {
  const flat = weeks.flat()
  if (baseCells.length !== flat.length || brightCells.length !== flat.length) return false
  flat.forEach((cell, index) => {
    applyContributionCell(baseCells[index], contributionCellSpec(cell, true))
    applyContributionCell(brightCells[index], contributionCellSpec(cell, false))
  })
  return true
}
