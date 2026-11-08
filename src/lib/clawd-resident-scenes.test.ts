import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { clawdSceneAssets, clawdSceneLabels } from './clawd-scenes'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('resident Clawd scene regressions', () => {
  test('new scenes have their own unmodified GIF and first-frame PNG', () => {
    const upstreamHashes = {
      ultrathink: 'eb5aaa13b9cbd77e4f5ac9074640a475a7c6f07349eaee886bd9e1f7fb0d543f',
      works: '95257747923f90130ec3176e9f76943b9da362c85ece1120b3eb8b089132e2bd',
      lgtm: 'e973425a1cc08ce7ca81b1f491992f76c46a1dbe68e77a25ded454c5518892bc',
    }
    for (const scene of ['ultrathink', 'works', 'lgtm'] as const) {
      expect(clawdSceneAssets[scene]).toBe(scene)
      const gif = readFileSync(new URL(`../../public/clawd/${scene}.gif`, import.meta.url))
      expect(createHash('sha256').update(gif).digest('hex')).toBe(upstreamHashes[scene])
      const png = readFileSync(new URL(`../../public/clawd/${scene}.png`, import.meta.url))
      expect(png.subarray(1, 4).toString()).toBe('PNG')
    }
  })

  test('homepage coffee is a sibling before dialog, never in the inactive dialog slot', () => {
    const disclosure = read('../components/home/ProjectDisclosure.astro')
    const template = disclosure.split('---')[2].split('<script>')[0]
    expect(template).toMatch(/<div class="project-glass">\s*<Mascot scene="coffee" lang=\{lang\} \/>\s*<button/)
    expect(template.indexOf('scene="coffee"')).toBeLessThan(template.indexOf('<dialog'))
    expect(template.match(/scene="coffee"/g)).toHaveLength(1)
    expect(template.slice(template.indexOf('<dialog'))).not.toContain('scene="coffee"')
    expect(template.slice(0, template.indexOf('<dialog'))).not.toContain('data-clawd-inactive')
    expect(disclosure).toContain("dialog.setAttribute('data-clawd-inactive', '')")
    expect(disclosure).toMatch(/\.project-glass\s*\{\s*position: relative;/)
    const projects = read('../components/projects/OpenSourceProjects.astro')
    expect(projects).toContain('showCoffee = true')
    expect(projects).toContain('{showCoffee && <Mascot scene="coffee" lang={lang} />}')
  })

  test('both homepages mount ultrathink in article sidebar and suppress modal coffee', () => {
    for (const locale of ['', 'en/']) {
      const source = read(`../pages/${locale}index.astro`)
      expect(source).toMatch(/<OpenSourceProjects[^>]*showCoffee=\{false\}/)
      expect(source).toMatch(/<Section title="Blog">\s*<Mascot slot="mascot" scene="ultrathink"/)
      expect(source).toContain(locale ? 'scene="ultrathink" lang="en"' : 'scene="ultrathink" />')
    }
    expect(read('../components/home/Section.astro')).toContain("<slot name='mascot' />")
  })

  test('both Projects pages retain coffee and subagents alongside works and LGTM', () => {
    for (const locale of ['', 'en/']) {
      const source = read(`../pages/${locale}projects/index.astro`)
      expect(source).toMatch(/<Mascot scene='works'/)
      expect(source).toMatch(/<Mascot scene='projects'/)
      expect(source).toMatch(/<ContributionScene[^>]*>\s*<GitHubContributions[^>]*\/>\s*<\/ContributionScene>/)
      expect(source).not.toContain('showCoffee={false}')
      if (locale) {
        expect(source).toContain("scene='works' lang='en'")
        expect(source).toContain("<ContributionScene lang='en'>")
      }
    }
  })

  test('LGTM stays outside calendar scope, at left on desktop and upper-left on mobile', () => {
    const wrapper = read('../components/projects/ContributionScene.astro')
    expect(wrapper).toMatch(/<Mascot scene="lgtm" lang=\{lang\} \/>\s*<div class="contribution-calendar"><slot \/><\/div>/)
    expect(wrapper).toContain('display: contents')
    expect(wrapper).toContain('grid-template-columns: 1fr')
    expect(wrapper).toContain('@media (min-width: 768px)')
    expect(wrapper).toContain('grid-template-columns: 4rem minmax(0, 1fr)')
    expect(wrapper).not.toContain('<script>')
    expect(wrapper).not.toContain('.gh-contrib')
    expect(clawdSceneLabels.lgtm[0]).toContain('不代表 PR 评审状态')
    expect(clawdSceneLabels.lgtm[1]).toContain('not a PR review status')
  })

  test('resident scenes use shared paper-only, pause/reduced-motion and drag behavior', () => {
    const mascot = read('../components/Mascot.astro')
    for (const scene of ['ultrathink', 'works', 'lgtm']) {
      expect(mascot).toContain(`.clawd-${scene} img`)
      expect(mascot).toContain(`:global(html[data-appearance='paper']) .clawd-${scene}`)
    }
    expect(mascot).toContain('installClawdDrag()')
    expect(mascot).not.toMatch(/\ssrc=/)
    const motion = read('./clawd-motion.js')
    expect(motion).toContain("preference === 'on' && !media.matches")
    expect(motion).toContain('image.dataset.still')
  })
})
