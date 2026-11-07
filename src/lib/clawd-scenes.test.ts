import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  clawdAssetFor,
  clawdSceneAssets,
  clawdSceneLabels,
  eagerClawdScenes,
  type ClawdScene,
} from './clawd-scenes'

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')
const sceneKeys = Object.keys(clawdSceneAssets) as ClawdScene[]

describe('Clawd scene catalogue', () => {
  test('keeps the original four scenes untouched', () => {
    for (const scene of [
      'hello',
      'coffee',
      'notfound',
      'bye',
    ] as ClawdScene[]) {
      expect(clawdSceneAssets[scene]).toBe(scene)
    }
  })

  test('maps every interactive and resident scene to a dedicated sticker', () => {
    expect(clawdSceneAssets['search-idle']).toBe('todo')
    expect(clawdSceneAssets['search-thinking']).toBe('thinking')
    expect(clawdSceneAssets['search-empty']).toBe('bug')
    expect(clawdSceneAssets['search-error']).toBe('error')
    expect(clawdSceneAssets['search-success']).toBe('passed')
    expect(clawdSceneAssets.about).toBe('duck')
    expect(clawdSceneAssets.projects).toBe('subagents')
    expect(clawdSceneAssets['blog-list']).toBe('plan')
    expect(clawdSceneAssets.copied).toBe('passed')
  })

  test('search states do not all fall back to the 404 sticker', () => {
    const assets = [
      clawdSceneAssets['search-idle'],
      clawdSceneAssets['search-thinking'],
      clawdSceneAssets['search-empty'],
      clawdSceneAssets['search-error'],
      clawdSceneAssets['search-success'],
    ]
    expect(new Set(assets).size).toBe(assets.length)
    expect(assets).not.toContain('notfound')
  })

  test('every scene has a non-empty bilingual label', () => {
    for (const scene of sceneKeys) {
      const labels = clawdSceneLabels[scene]
      expect(labels).toHaveLength(2)
      expect(labels[0].length).toBeGreaterThan(0)
      expect(labels[1].length).toBeGreaterThan(0)
      expect(labels[0]).not.toBe(labels[1])
    }
  })

  test('only the first-paint scenes stay eager', () => {
    expect([...eagerClawdScenes]).toEqual(['hello', 'notfound'])
  })

  test('asset files exist as GIF plus Pillow first-frame PNG', () => {
    for (const scene of sceneKeys) {
      const asset = clawdAssetFor(scene)
      const gif = readFileSync(
        new URL(`../../public/clawd/${asset}.gif`, import.meta.url),
      )
      expect(gif.subarray(0, 3).toString()).toBe('GIF')
      const png = readFileSync(
        new URL(`../../public/clawd/${asset}.png`, import.meta.url),
      )
      expect(png.subarray(1, 4).toString()).toBe('PNG')
    }
  })
})

test('Mascot renders through the catalogue and never hardcodes a src', () => {
  const component = read('../components/Mascot.astro')
  expect(component).toContain('clawdAssetFor')
  expect(component).toContain('clawdSceneLabels')
  expect(component).toContain('type ClawdScene')
  expect(component).toContain('eagerClawdScenes.includes(scene)')
  expect(component).not.toMatch(/\ssrc=/)
  expect(component).toContain('data-still=')
  expect(component).toContain('data-gif=')
})

describe('Search mascot states', () => {
  const search = read('../components/search/SiteSearch.astro')

  test('declares one wrapper per state and reuses the scene catalogue', () => {
    for (const state of ['idle', 'thinking', 'empty', 'error', 'success']) {
      expect(search).toMatch(new RegExp(`data-search-scene=["']${state}["']`))
    }
    expect(search).toMatch(/<Mascot scene=["']search-idle["']/)
    expect(search).toMatch(/<Mascot scene=["']search-thinking["']/)
    expect(search).toMatch(/<Mascot scene=["']search-empty["']/)
    expect(search).toMatch(/<Mascot scene=["']search-error["']/)
    expect(search).toMatch(/<Mascot scene=["']search-success["']/)
  })

  test('every state starts hidden so nothing loads before use', () => {
    const wrappers =
      search.match(/<div data-search-scene=["'][a-z]+["'][^>]*>/g) ?? []
    expect(wrappers).toHaveLength(5)
    for (const wrapper of wrappers) expect(wrapper).toContain('hidden')
  })

  test('state transitions follow the real search lifecycle', () => {
    expect(search).toContain("setScene('thinking')")
    expect(search).toContain("setScene('empty')")
    expect(search).toContain("setScene('error')")
    expect(search).toContain('showSuccess()')
    expect(search).toContain("document.activeElement === input ? 'idle' : null")
    expect(search).toContain('if (request.signal.aborted) return')
  })

  test('English search page passes the locale through', () => {
    expect(read('../pages/en/search/index.astro')).toContain(
      "<SiteSearch lang='en' />",
    )
    expect(read('../pages/search/index.astro')).toContain('<SiteSearch />')
  })
})

describe('Copy success feedback', () => {
  const feedback = read('../components/ClawdCopyFeedback.astro')
  const script = read('./clawd-copy-feedback.js')

  test('waits for the site copy button to report .copied', () => {
    expect(feedback).toContain('data-clawd-copy-feedback')
    expect(script).toContain("target.matches('button.copy')")
    expect(script).toContain("target.classList.contains('copied')")
    expect(script).toContain("attributeFilter: ['class']")
    expect(feedback).toContain('hidden')
  })

  test('does not fake the clipboard result itself', () => {
    expect(script).not.toContain('navigator.clipboard')
    expect(script).not.toContain('clipboard.writeText(')
    expect(feedback).toContain('Mascot scene="copied"')
  })

  test('shows briefly and retires the sticker', () => {
    expect(script).toContain('bubble.hidden = true')
    expect(script).toMatch(/}, 1800\)/)
  })

  test('is mounted once by the shared layout', () => {
    const layout = read('../layouts/BaseLayout.astro')
    expect(layout).toContain(
      "import ClawdCopyFeedback from '@/components/ClawdCopyFeedback.astro'",
    )
    expect(layout).toContain('<ClawdCopyFeedback lang={lang} />')
  })
})

test('resident scenes live on about, projects and blog list pages in both locales', () => {
  const pairs: [string, RegExp][] = [
    ['../pages/about/index.astro', /scene='about'/],
    ['../pages/en/about/index.astro', /scene='about' lang='en'/],
    ['../pages/projects/index.astro', /scene='projects'/],
    ['../pages/en/projects/index.astro', /scene='projects' lang='en'/],
    ['../pages/blog/[...page].astro', /scene='blog-list'/],
    ['../pages/en/blog/[...page].astro', /scene='blog-list' lang='en'/],
  ]
  for (const [path, pattern] of pairs) expect(read(path)).toMatch(pattern)
})
