/**
 * Client behaviour for the GitHub contribution calendar.
 *
 * Everything here is imported from a bundled `<script>` module, so it runs
 * after the SSR markup is parsed. The critical detail — and the regression the
 * grid shipped with — is that any cell created at runtime must inherit Astro's
 * style-scope token, otherwise the scoped palette in GitHubContributions.astro
 * no longer matches and freshly fetched cells render transparent.
 */
import {
  buildContributionWeeks,
  contributionCellSpecs,
  contributionMonthLabels,
  contributionScope,
  createContributionCell,
  scopeClassName,
  syncContributionLayers
} from './contributions-grid'

function makeOdometer(container, options) {
  const cols = Array.from(container.querySelectorAll('[data-odo-col]'))
  const reels = cols.map((col) => col.querySelector('[data-odo-reel]'))
  const max = cols.length
  const padToFull = !!(options && options.padToFull)
  const stagger = (options && options.stagger) ?? 100

  return function setValue(value) {
    const v = Math.max(0, value | 0)
    const str = String(v).padStart(max, '0')
    const meaningful = padToFull ? max : String(v).length
    for (let i = 0; i < max; i++) {
      const col = cols[i]
      const reel = reels[i]
      const isLeading = i < max - meaningful
      col.dataset.hidden = isLeading ? 'true' : 'false'
      col.style.flexBasis = isLeading ? '0px' : '0.6em'
      col.style.opacity = isLeading ? '0' : '1'
      const order = i - (max - meaningful)
      reel.style.transitionDelay = order >= 0 ? `${order * stagger}ms` : '0ms'
      reel.style.transform = `translateY(-${parseInt(str[i], 10)}em)`
    }
  }
}

/** Prefer the element's own scope token, falling back to its container. */
function pickScope(primary, fallback) {
  const own = contributionScope(primary)
  if (own.classes.length > 0 || own.attrs.length > 0) return own
  return contributionScope(fallback)
}

/** Replace only the children so the layer keeps its own Astro scope class. */
function rebuildLayer(layer, weeks, withData) {
  if (!layer) return null
  const scope = pickScope(layer.querySelector('.gh-cell'), layer)
  const fragment = document.createDocumentFragment()
  for (const spec of contributionCellSpecs(weeks, withData)) {
    fragment.appendChild(createContributionCell(document, spec, scope))
  }
  layer.replaceChildren(fragment)
  return layer
}

/** Keep the month row aligned with the week count without losing scope. */
function syncMonthLabels(container, labels) {
  if (!container) return
  const spans = Array.from(container.querySelectorAll('span'))
  if (spans.length === labels.length) {
    labels.forEach((label, index) => {
      if (spans[index].textContent !== label) spans[index].textContent = label
    })
    return
  }
  const scope = pickScope(spans[0], container)
  const fragment = document.createDocumentFragment()
  for (const label of labels) {
    const span = document.createElement('span')
    span.className = scopeClassName('', scope)
    span.textContent = label
    fragment.appendChild(span)
  }
  container.replaceChildren(fragment)
}

function bindFigure(figure) {
  const card = figure.querySelector('.gh-contrib-card')
  const cells = figure.querySelector('[data-cells]')
  const tooltip = figure.querySelector('[data-tooltip]')
  const countOdo = figure.querySelector('[data-odo]')
  const dayOdo = figure.querySelector('[data-day-odo]')
  const yearOdo = figure.querySelector('[data-year-odo]')
  const monthLabel = figure.querySelector('[data-month-label]')
  const noun = figure.querySelector('[data-noun]')
  if (!card || !cells || !tooltip || !countOdo || !dayOdo || !yearOdo || !monthLabel || !noun) {
    return
  }

  if (figure.dataset.ghInitialized === 'true') return
  figure.dataset.ghInitialized = 'true'

  const setCount = makeOdometer(countOdo)
  const setDay = makeOdometer(dayOdo)
  const setYear = makeOdometer(yearOdo, { padToFull: true })
  const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })

  let activeCell = null
  let lastMonthText = ''
  let pinned = false

  const setCountAndNoun = (value) => {
    setCount(value)
    noun.textContent = value === 1 ? 'contribution' : 'contributions'
  }

  const setDate = (iso) => {
    const d = new Date(iso + 'T00:00:00Z')
    const monthText = monthFmt.format(d)
    if (monthText !== lastMonthText) {
      monthLabel.classList.add('swap')
      setTimeout(() => {
        monthLabel.textContent = monthText
        monthLabel.classList.remove('swap')
      }, 140)
      lastMonthText = monthText
    }
    setDay(d.getUTCDate())
    setYear(d.getUTCFullYear())
  }

  const showTooltip = (cell) => {
    // Tooltip lives at figure level (sibling to card) so the card's
    // overflow:hidden + rounded corners can never clip it.
    const cellRect = cell.getBoundingClientRect()
    const figRect = figure.getBoundingClientRect()
    const cardRect = card.getBoundingClientRect()
    const ttRect = tooltip.getBoundingClientRect()

    const halfW = ttRect.width / 2
    const ttHeight = ttRect.height
    const gap = 10
    const cornerInset = 16 // matches rounded-2xl border-radius
    const safeMargin = 4

    const cardLeftInFig = cardRect.left - figRect.left
    const cardRightInFig = cardRect.right - figRect.left
    const minX = cardLeftInFig + cornerInset + halfW + safeMargin
    const maxX = cardRightInFig - cornerInset - halfW - safeMargin
    const desiredX = cellRect.left + cellRect.width / 2 - figRect.left
    const x = minX <= maxX ? Math.max(minX, Math.min(maxX, desiredX)) : desiredX

    const cardTopInFig = cardRect.top - figRect.top
    const cellTopInFig = cellRect.top - figRect.top
    const cellBottomInFig = cellRect.bottom - figRect.top
    const aboveTop = cellTopInFig - ttHeight - gap
    const useBelow = aboveTop < cardTopInFig + cornerInset

    if (useBelow) {
      tooltip.dataset.position = 'below'
      tooltip.style.transform = `translate(${x}px, ${cellBottomInFig + gap}px) translate(-50%, 0)`
    } else {
      tooltip.dataset.position = 'above'
      tooltip.style.transform = `translate(${x}px, ${cellTopInFig - gap}px) translate(-50%, -100%)`
    }
    tooltip.dataset.visible = 'true'
  }

  const hideTooltip = () => {
    tooltip.dataset.visible = 'false'
  }

  const setActive = (cell) => {
    if (activeCell === cell) return
    if (activeCell) activeCell.removeAttribute('data-active')
    activeCell = cell
    if (cell) {
      cell.setAttribute('data-active', 'true')
      const date = cell.getAttribute('data-date')
      const count = parseInt(cell.getAttribute('data-count') || '0', 10)
      if (date) setDate(date)
      setCountAndNoun(count)
    }
  }

  const cellFromEvent = (event) =>
    event.target instanceof Element
      ? event.target.closest('.gh-contrib-base .gh-cell[data-date]')
      : null

  const setSpotlight = (event) => {
    const rect = cells.getBoundingClientRect()
    cells.dataset.spotlight = 'true'
    cells.style.setProperty('--mx', `${event.clientX - rect.left}px`)
    cells.style.setProperty('--my', `${event.clientY - rect.top}px`)
  }

  const resetSpotlight = () => {
    delete cells.dataset.spotlight
    cells.style.setProperty('--mx', '-200px')
    cells.style.setProperty('--my', '-200px')
  }

  // Pointer (mouse + pen): follow the pointer and preview the hovered day.
  cells.addEventListener('pointermove', (event) => {
    setSpotlight(event)
    const cell = cellFromEvent(event)
    if (cell) {
      setActive(cell)
      showTooltip(cell)
    } else if (!pinned) {
      hideTooltip()
    }
  })

  // Touch: a tap pins the tooltip so the finger leaving the cell (which fires
  // pointerleave immediately afterwards) does not wipe the readout.
  cells.addEventListener('pointerdown', (event) => {
    setSpotlight(event)
    const cell = cellFromEvent(event)
    if (!cell) {
      pinned = false
      hideTooltip()
      setActive(null)
      return
    }
    pinned = event.pointerType === 'touch'
    setActive(cell)
    showTooltip(cell)
  })

  cells.addEventListener('pointerleave', () => {
    resetSpotlight()
    if (pinned) return
    hideTooltip()
    setActive(null)
  })

  // Tapping outside the calendar dismisses a pinned tooltip.
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!pinned) return
      if (event.target instanceof Node && figure.contains(event.target)) return
      pinned = false
      hideTooltip()
      setActive(null)
    },
    { passive: true }
  )

  refreshGrid(figure).catch(() => {})
}

async function refreshGrid(figure) {
  const card = figure.querySelector('.gh-contrib-card')
  const username = card?.dataset.username
  if (!username) return

  let data
  try {
    const res = await fetch(`/api/github-contributions?username=${encodeURIComponent(username)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(11000)
    })
    if (!res.ok) throw new Error('Contribution data unavailable')
    data = await res.json()
  } catch {
    const status = figure.querySelector('[data-contrib-status]')
    if (status) {
      status.textContent = figure.querySelector('.gh-cell[data-date]')
        ? figure.dataset.lang === 'en'
          ? 'Showing previously fetched data; refresh failed.'
          : '当前展示此前获取的数据，刷新暂时失败。'
        : card.dataset.unavailable
    }
    return
  }

  const today = new Date().toISOString().slice(0, 10)
  const contributions = (data.contributions || []).filter((cell) => cell.date <= today)
  if (contributions.length === 0 || !Number.isInteger(data.total?.lastYear)) return

  const status = figure.querySelector('[data-contrib-status]')
  if (status) {
    status.textContent = data.source === 'public' ? card.dataset.publicNotice : card.dataset.githubNotice
  }
  figure.querySelector('.gh-contrib-grid')?.removeAttribute('hidden')

  // Rebuild even when the last date matches: counts can change during the day.
  const weeks = buildContributionWeeks(contributions, today)
  if (weeks.length === 0) return

  let baseLayer = figure.querySelector('.gh-contrib-base')
  let brightLayer = figure.querySelector('.gh-contrib-bright')

  // Preferred path: mutate the server-rendered cells in place. They already
  // carry Astro's scope token, so the scoped palette keeps applying and the
  // pointer listeners on the container stay valid.
  const baseCells = baseLayer ? Array.from(baseLayer.querySelectorAll('.gh-cell')) : []
  const brightCells = brightLayer ? Array.from(brightLayer.querySelectorAll('.gh-cell')) : []
  const cellCount = weeks.flat().length
  if (baseCells.length === cellCount && brightCells.length === cellCount) {
    syncContributionLayers(baseCells, brightCells, weeks)
  } else {
    // Column count changed (a new week started): rebuild, but stamp the same
    // scope token the SSR cells carry onto every created span.
    baseLayer = rebuildLayer(baseLayer, weeks, true)
    brightLayer = rebuildLayer(brightLayer, weeks, false)
  }

  // Reset any active/highlighted state whose node may have been replaced.
  figure.querySelectorAll('.gh-cell[data-active]').forEach((cell) => {
    cell.removeAttribute('data-active')
  })

  card.style.setProperty('--gh-weeks', String(weeks.length))
  syncMonthLabels(figure.querySelector('.gh-contrib-months'), contributionMonthLabels(weeks))

  const totalEl = figure.querySelector('[data-total-label]')
  const total = data.total.lastYear
  if (totalEl) {
    totalEl.textContent = `${total.toLocaleString('en-US')} contributions`
  }
}

export function initContributionCalendars(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') return
  for (const figure of root.querySelectorAll('.gh-contrib')) bindFigure(figure)
}
