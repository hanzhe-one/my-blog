import type { APIRoute } from 'astro'
import { isGitHubUsername, loadGitHubContributions } from '@/lib/github-contributions'

// Credentials are read only on the server, never serialized into the response.
export const prerender = false

export const GET: APIRoute = async ({ url }) => {
  const username = url.searchParams.get('username') ?? 'hanzhe-one'
  if (!isGitHubUsername(username)) return json({ error: 'Invalid GitHub username' }, 400)
  try {
    const data = await loadGitHubContributions(username, {
      token: import.meta.env.GITHUB_TOKEN || process.env.GITHUB_TOKEN
    })
    return json(data, 200)
  } catch {
    return json({ error: 'Contribution data is temporarily unavailable. Please visit GitHub or retry later.' }, 503)
  }
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200
        ? 'public, s-maxage=300, stale-while-revalidate=3600'
        : 'no-store'
    }
  })
}
