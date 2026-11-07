export type Contribution = { date: string; count: number; level: 0 | 1 | 2 | 3 | 4 }
export type ContributionData = {
  total: { lastYear: number }
  contributions: Contribution[]
  source: 'github' | 'public'
}

const LEVELS = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE']
const QUERY = `query($login: String!) {
  user(login: $login) { contributionsCollection { contributionCalendar {
    totalContributions weeks { contributionDays { date contributionCount contributionLevel } }
  } } }
}`
export const CONTRIBUTION_TIMEOUT_MS = 4500
export const isGitHubUsername = (username: string) =>
  /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username)

// Validate both upstreams identically: unavailable/malformed data is never a zero calendar.
function normalize(payload: any, source: ContributionData['source']): ContributionData {
  if (payload.errors?.length) throw new Error('Invalid contribution response')
  const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar
  const days = source === 'github'
    ? calendar?.weeks?.flatMap((week: any) => week.contributionDays?.map((day: any) => ({
        date: day.date, count: day.contributionCount, level: LEVELS.indexOf(day.contributionLevel)
      })))
    : payload.contributions
  const total = source === 'github' ? calendar?.totalContributions : payload.total?.lastYear
  if (!Array.isArray(days) || !days.length || !Number.isInteger(total) || total < 0) {
    throw new Error('Missing contribution calendar')
  }
  const seen = new Set<string>()
  for (const day of days) {
    if (!day || typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date) ||
        !Number.isFinite(Date.parse(day.date)) ||
        new Date(day.date).toISOString().slice(0, 10) !== day.date || seen.has(day.date) ||
        !Number.isInteger(day.count) || day.count < 0 ||
        !Number.isInteger(day.level) || day.level < 0 || day.level > 4) {
      throw new Error('Invalid contribution day')
    }
    seen.add(day.date)
  }
  const today = new Date().toISOString().slice(0, 10)
  const contributions: Contribution[] = days.filter((day: Contribution) => day.date <= today)
    .sort((a: Contribution, b: Contribution) => a.date.localeCompare(b.date))
  if (!contributions.length) throw new Error('No dated contributions')
  return {
    total: { lastYear: contributions.length === days.length ? total :
      contributions.reduce((sum, day) => sum + day.count, 0) },
    contributions,
    source
  }
}

export async function loadGitHubContributions(
  username: string,
  { token, fetcher = fetch, timeoutMs = CONTRIBUTION_TIMEOUT_MS }: {
    token?: string; fetcher?: typeof fetch; timeoutMs?: number
  } = {}
): Promise<ContributionData> {
  if (!isGitHubUsername(username)) throw new Error('Invalid GitHub username')
  async function request(url: string, source: ContributionData['source'], init: RequestInit = {}) {
    // Includes body parsing, not just response headers. Abort stops the underlying network request.
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        (async () => {
          const response = await fetcher(url, { ...init, signal: controller.signal })
          if (!response.ok) throw new Error('Contribution upstream unavailable')
          return normalize(await response.json(), source)
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort()
            reject(new Error('Contribution request timed out'))
          }, timeoutMs)
        })
      ])
    } finally {
      clearTimeout(timer)
    }
  }
  if (token) {
    try {
      return await request('https://api.github.com/graphql', 'github', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
          'User-Agent': 'xiaozheblog.vercel.app' },
        body: JSON.stringify({ query: QUERY, variables: { login: username } })
      })
    } catch {
      // Do not expose upstream errors or credentials. Public fallback receives no auth headers.
    }
  }
  return request(`https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(username)}?y=last`, 'public')
}
