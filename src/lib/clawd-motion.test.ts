import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const source = readFileSync(
  new URL('./clawd-motion.js', import.meta.url),
  'utf8',
)
function setup({
  paper = true,
  reduced = false,
  stored = null as string | null,
  blocked = false,
} = {}) {
  const events = new Map<string, (event?: any) => void>()
  const windowEvents = new Map<string, (event?: any) => void>()
  const attrs = new Map<string, string>()
  const image = {
    dataset: { gif: '/clawd/hello.gif', still: '/clawd/hello.png' },
    getAttribute: (key: string) => attrs.get(key),
    setAttribute: (key: string, value: string) => attrs.set(key, value),
    removeAttribute: (key: string) => attrs.delete(key),
  }
  class Element {
    closest() {
      return button
    }
  }
  const button = Object.assign(new Element(), {
    dataset: { onLabel: 'on', offLabel: 'off', reducedLabel: 'reduced' },
    disabled: false,
    textContent: '',
    setAttribute: (key: string, value: string) => attrs.set(key, value),
  })
  let mediaChange = () => {}
  let mutation = () => {}
  const media = {
    matches: reduced,
    addEventListener: (_: string, fn: () => void) => {
      mediaChange = fn
    },
  }
  const root = { dataset: { appearance: paper ? 'paper' : 'original' } }
  const document = {
    documentElement: root,
    querySelectorAll: (selector: string) =>
      selector === '[data-clawd-image]' ? [image] : [button],
    addEventListener: (name: string, fn: (event?: any) => void) =>
      events.set(name, fn),
  }
  const context = {
    document,
    Element,
    MutationObserver: class {
      constructor(fn: () => void) {
        mutation = fn
      }
      disconnect() {}
      observe() {}
    },
    window: {
      matchMedia: () => media,
      addEventListener: (name: string, fn: (event?: any) => void) =>
        windowEvents.set(name, fn),
    },
    localStorage: {
      getItem: () => {
        if (blocked) throw Error('blocked')
        return stored
      },
      setItem: (_: string, value: string) => {
        if (blocked) throw Error('blocked')
        stored = value
      },
    },
  }
  runInNewContext(source, context)
  return {
    attrs,
    button,
    root,
    document,
    events,
    windowEvents,
    saved: () => stored,
    click: () => events.get('click')!({ target: button }),
    appearance: (value: string) => {
      root.dataset.appearance = value
      mutation()
    },
    reduce: (value: boolean) => {
      media.matches = value
      mediaChange()
    },
    rerun: () => runInNewContext(source, context),
  }
}

describe('Clawd paper-only motion runtime', () => {
  test('original appearance loads neither GIF nor PNG', () => {
    const app = setup({ paper: false })
    expect(app.attrs.has('src')).toBe(false)
    app.appearance('paper')
    expect(app.attrs.get('src')).toBe('/clawd/hello.gif')
    app.appearance('original')
    expect(app.attrs.has('src')).toBe(false)
  })
  test('manual pause uses PNG, persists and restores after refresh', () => {
    const app = setup()
    app.click()
    expect(app.saved()).toBe('off')
    expect(app.attrs.get('src')).toBe('/clawd/hello.png')
    expect(app.attrs.get('aria-pressed')).toBe('false')
    expect(setup({ stored: app.saved() }).button.textContent).toBe('off')
    app.click()
    expect(app.attrs.get('src')).toBe('/clawd/hello.gif')
  })
  test('reduced motion wins even over on preference and updates live', () => {
    const app = setup({ reduced: true, stored: 'on' })
    expect(app.attrs.get('src')).toBe('/clawd/hello.png')
    expect(app.button.disabled).toBe(true)
    app.click()
    expect(app.saved()).toBe('on')
    app.reduce(false)
    expect(app.button.disabled).toBe(false)
    expect(app.attrs.get('src')).toBe('/clawd/hello.gif')
    app.click()
    app.reduce(true)
    app.reduce(false)
    expect(app.attrs.get('src')).toBe('/clawd/hello.png')
  })
  test('blocked storage does not break the control', () => {
    const app = setup({ blocked: true })
    app.click()
    expect(app.attrs.get('src')).toBe('/clawd/hello.png')
    app.windowEvents.get('storage')!({ key: null })
    expect(app.attrs.get('src')).toBe('/clawd/hello.png')
  })
  test('Astro page load resyncs and inline execution does not duplicate listeners', () => {
    const app = setup({ stored: 'off' })
    const listener = app.events.get('click')
    app.rerun()
    expect(app.events.get('click')).toBe(listener)
    app.events.get('astro:page-load')!()
    expect(app.attrs.get('src')).toBe('/clawd/hello.png')
  })
  test('unrelated cross-tab preferences are ignored; motion events resync', () => {
    const app = setup()
    app.attrs.delete('src')
    app.windowEvents.get('storage')!({ key: 'theme' })
    expect(app.attrs.has('src')).toBe(false)
    app.windowEvents.get('storage')!({ key: 'joye:clawd-motion' })
    expect(app.attrs.get('src')).toBe('/clawd/hello.gif')
  })
})

test('all four GIF and PNG assets exist and initial markup has no eager src', () => {
  for (const scene of ['hello', 'coffee', 'notfound', 'bye']) {
    const gif = readFileSync(
      new URL(`../../public/clawd/${scene}.gif`, import.meta.url),
    )
    expect(gif.subarray(0, 3).toString()).toBe('GIF')
    const png = readFileSync(
      new URL(`../../public/clawd/${scene}.png`, import.meta.url),
    )
    expect(png.subarray(1, 4).toString()).toBe('PNG')
  }
  const component = readFileSync(
    new URL('../components/Mascot.astro', import.meta.url),
    'utf8',
  )
  expect(component).not.toMatch(/\ssrc=/)
  expect(component).toContain('data-still=')
  const licence = readFileSync(
    new URL('../../public/clawd/LICENSE-ART', import.meta.url),
    'utf8',
  )
  expect(licence).toContain('CC BY-NC-SA 4.0')
  expect(licence).toContain('It grants no')
})

test('bilingual pages and shared layouts retain all contextual mascot scenes', () => {
  const read = (path: string) =>
    readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const path of ['../pages/index.astro', '../pages/en/index.astro']) {
    expect(read(path)).toMatch(/scene=['"]hello['"]/)
  }
  for (const path of ['../pages/404.astro', '../pages/en/404.astro']) {
    expect(read(path)).toMatch(/scene=['"]notfound['"]/)
  }
  expect(read('../layouts/BlogPost.astro')).toMatch(/scene=['"]bye['"]/)
  expect(read('../components/projects/OpenSourceProjects.astro')).toMatch(
    /scene=['"]coffee['"]/,
  )
  const controls = read('../components/ClawdControls.astro')
  expect(controls).toContain('https://github.com/alwinecor/clawd-stickers')
  expect(controls).toContain('/clawd/LICENSE-ART')
  expect(controls).toContain('Pillow')
})
