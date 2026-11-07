import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { isGitHubUsername, loadGitHubContributions } from './github-contributions'

// Deterministic upstream fixtures only; production never manufactures calendar days.
const day = { date: '2026-01-01', count: 3, level: 2 }
const publicData = { total: { lastYear: 3 }, contributions: [day] }
const githubData = { data: { user: { contributionsCollection: { contributionCalendar: {
  totalContributions: 3,
  weeks: [{ contributionDays: [{ date: day.date, contributionCount: 3, contributionLevel: 'SECOND_QUARTILE' }] }]
} } } } }
const response = (body: unknown) => new Response(JSON.stringify(body))

describe('GitHub contribution loader', () => {
  test('no token uses real public provider without authorization', async () => {
    const result = await loadGitHubContributions('hanzhe-one', { fetcher: (async (url, init) => {
      expect(String(url)).toBe('https://github-contributions-api.jogruber.de/v4/hanzhe-one?y=last')
      expect(new Headers(init?.headers).has('authorization')).toBe(false)
      return response(publicData)
    }) as typeof fetch })
    expect(result).toEqual({ ...publicData, source: 'public' })
  })
  test('authenticated calendar is normalized', async () => {
    const result = await loadGitHubContributions('hanzhe-one', { token: 'test-only',
      fetcher: (async () => response(githubData)) as typeof fetch })
    expect(result).toEqual({ ...publicData, source: 'github' })
  })
  for (const failure of ['http', 'graphql', 'empty', 'json', 'network', 'timeout']) {
    test(`credential upstream ${failure} falls back without forwarding credentials`, async () => {
      let calls = 0
      const result = await loadGitHubContributions('hanzhe-one', {
        token: 'test-only', timeoutMs: 15,
        fetcher: (async (_, init) => {
          if (++calls === 1) {
            if (failure === 'http') return new Response('', { status: 401 })
            if (failure === 'graphql') return response({ errors: [{ message: 'denied' }] })
            if (failure === 'empty') return response({})
            if (failure === 'json') return new Response('not json')
            if (failure === 'network') throw new Error('network')
            return new Promise<Response>(() => {})
          }
          expect(new Headers(init?.headers).has('authorization')).toBe(false)
          return response(publicData)
        }) as typeof fetch
      })
      expect(calls).toBe(2)
      expect(result.contributions).toEqual([day])
      expect(result.source).toBe('public')
    })
  }
  for (const malformed of [
    {}, { total: { lastYear: 0 }, contributions: [] },
    { ...publicData, contributions: [{ ...day, count: -1 }] },
    { ...publicData, contributions: [{ ...day, date: '2026-02-30' }] },
    { ...publicData, contributions: [{ ...day, level: 5 }] },
    { ...publicData, contributions: [day, day] }
  ]) {
    test('missing/malformed public data rejects instead of fabricating zeros', async () => {
      await expect(loadGitHubContributions('hanzhe-one', {
        fetcher: (async () => response(malformed)) as typeof fetch
      })).rejects.toThrow()
    })
  }
  test('a genuine zero contribution calendar is valid', async () => {
    const result = await loadGitHubContributions('hanzhe-one', { fetcher: (async () =>
      response({ total: { lastYear: 0 }, contributions: [{ ...day, count: 0, level: 0 }] })) as typeof fetch })
    expect(result.total.lastYear).toBe(0)
    expect(result.contributions).toHaveLength(1)
  })
  test('public request and body parsing are bounded', async () => {
    await expect(loadGitHubContributions('hanzhe-one', { timeoutMs: 10,
      fetcher: (async () => ({ ok: true, json: () => new Promise(() => {}) })) as unknown as typeof fetch
    })).rejects.toThrow('timed out')
  })
  test('invalid usernames cannot change the upstream URL', () => {
    for (const name of ['', '../foo', 'a?b', 'a/b', '-name', 'a'.repeat(40)]) expect(isGitHubUsername(name)).toBe(false)
    expect(isGitHubUsername('hanzhe-one')).toBe(true)
  })
})

test('calendars remain on project pages, not on either homepage', () => {
  for (const path of ['../pages/index.astro', '../pages/en/index.astro']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    expect(source).not.toContain('GitHubContributions')
    expect(source.indexOf('<OpenSourceProjects')).toBeLessThan(source.indexOf('allPostsByDate.length > 0'))
  }
  for (const path of ['../pages/projects/index.astro', '../pages/en/projects/index.astro']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    expect(source).toContain('<GitHubContributions')
  }
})
