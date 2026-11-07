import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('./appearance.js', import.meta.url), 'utf8')

function setup(stored?: string, blocked = false) {
  const values = new Map<string, string>([['theme', 'dark']])
  if (stored !== undefined) values.set('joye:appearance', stored)
  const documentEvents = new Map<string, (event?: any) => void>()
  const windowEvents = new Map<string, (event?: any) => void>()
  const attrs = new Map<string, string>()
  const label = { textContent: '' }
  class Element {
    closest() {
      return button
    }
  }
  const button = Object.assign(new Element(), {
    dataset: {
      paperLabel: '切换为纸感外观',
      originalLabel: '恢复原版外观',
      paperText: '纸感',
      originalText: '外观',
    },
    title: '',
    setAttribute: (key: string, value: string) => attrs.set(key, value),
    querySelector: () => label,
  })
  const root = {
    dataset: {} as Record<string, string>,
    classList: new Set(['dark']),
  }
  const document = {
    documentElement: root,
    querySelectorAll: () => [button],
    addEventListener: (name: string, listener: (event?: any) => void) => {
      documentEvents.set(name, listener)
    },
  }
  const window = {
    addEventListener: (name: string, listener: (event?: any) => void) => {
      windowEvents.set(name, listener)
    },
  }
  let fail = blocked
  const context = {
    document,
    window,
    Element,
    localStorage: {
      getItem: (key: string) => {
        if (fail) throw new Error('SecurityError')
        return values.get(key) ?? null
      },
      setItem: (key: string, value: string) => {
        if (fail) throw new Error('QuotaExceededError')
        values.set(key, value)
      },
    },
  }
  runInNewContext(source, context)
  return {
    values,
    root,
    attrs,
    label,
    document,
    button,
    documentEvents,
    windowEvents,
    block: () => {
      fail = true
    },
    click: () => documentEvents.get('click')!({ target: button }),
    rerun: () => runInNewContext(source, context),
  }
}

describe('independent appearance runtime', () => {
  test('defaults to the unmodified original; invalid preferences are ignored', () => {
    expect(setup().root.dataset.appearance).toBe('original')
    expect(setup('unknown').root.dataset.appearance).toBe('original')
  })

  test('restores paper synchronously before body/controls are required', () => {
    const app = setup('paper')
    expect(app.root.dataset.appearance).toBe('paper')
    expect(app.attrs.get('aria-pressed')).toBe('true')
    expect(app.label.textContent).toBe('纸感')
  })

  test('toggles both ways without changing the theme key or dark class', () => {
    const app = setup()
    app.click()
    expect(app.values.get('joye:appearance')).toBe('paper')
    expect(app.attrs.get('aria-label')).toBe('恢复原版外观')
    app.click()
    expect(app.values.get('joye:appearance')).toBe('original')
    expect(app.attrs.get('aria-pressed')).toBe('false')
    expect(app.values.get('theme')).toBe('dark')
    expect(app.root.classList.has('dark')).toBe(true)
  })

  test('blocked storage does not prevent either toggle', () => {
    const app = setup(undefined, true)
    app.click()
    expect(app.root.dataset.appearance).toBe('paper')
    app.click()
    expect(app.root.dataset.appearance).toBe('original')
  })

  test('write failures after a successful read still apply the appearance', () => {
    const app = setup('paper')
    app.block()
    app.click()
    expect(app.root.dataset.appearance).toBe('original')
  })

  test('refresh restores the independently persisted preference', () => {
    const app = setup()
    app.click()
    expect(
      setup(app.values.get('joye:appearance')).root.dataset.appearance,
    ).toBe('paper')
  })

  test('Astro navigation applies preference before swap and on the new root', () => {
    const app = setup('paper')
    const nextRoot = { dataset: {} as Record<string, string> }
    app.documentEvents.get('astro:before-swap')!({
      newDocument: {
        documentElement: nextRoot,
        querySelectorAll: () => [],
      },
    })
    expect(nextRoot.dataset.appearance).toBe('paper')
    app.document.documentElement = nextRoot as typeof app.root
    app.documentEvents.get('astro:page-load')!()
    app.click()
    expect(nextRoot.dataset.appearance).toBe('original')
  })

  test('re-executing inline head does not replace live event handlers', () => {
    const app = setup('paper')
    const listener = app.documentEvents.get('click')
    app.rerun()
    expect(app.documentEvents.get('click')).toBe(listener)
  })

  test('cross-tab changes sync appearance, ignoring unrelated theme storage', () => {
    const app = setup()
    app.values.set('joye:appearance', 'paper')
    app.windowEvents.get('storage')!({ key: 'theme' })
    expect(app.root.dataset.appearance).toBe('original')
    app.windowEvents.get('storage')!({ key: 'joye:appearance' })
    expect(app.root.dataset.appearance).toBe('paper')
    app.values.clear()
    app.windowEvents.get('storage')!({ key: null })
    expect(app.root.dataset.appearance).toBe('original')
  })
})

test('paper stylesheet scopes every rule to the opt-in attribute and loads no remote assets', () => {
  const css = readFileSync(
    new URL('../assets/styles/paper.css', import.meta.url),
    'utf8',
  )
  // Grouping at-rules contain selectors, not declarations. Walk braces rather
  // than treating an entire @media block as a single unscoped selector.
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  let start = 0
  let count = 0
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '{') {
      const prelude = source.slice(start, index).trim()
      if (prelude.startsWith('@')) {
        expect(prelude).toMatch(/^@media\b/)
      } else {
        for (const selector of prelude.split(/,\s*(?=html)/)) {
          expect(
            selector.trim().startsWith("html[data-appearance='paper']"),
          ).toBe(true)
          count++
        }
      }
      start = index + 1
    } else if (source[index] === '}') {
      start = index + 1
    }
  }
  expect(count).toBeGreaterThan(10)
  expect(css).not.toMatch(/@import|url\(/)
  expect(css).toContain("html[data-appearance='paper'].dark")
})
