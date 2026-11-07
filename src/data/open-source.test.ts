import { describe, expect, test } from 'bun:test'

import { openSourceProjects } from './open-source'

describe('curated open source projects', () => {
  test('contains the explicitly selected ShenYu project', () => {
    expect(openSourceProjects.map((project) => project.repository)).toEqual([
      'apache/shenyu',
    ])
  })

  test('links representative contributions to their upstream PRs', () => {
    for (const project of openSourceProjects) {
      expect(project.description.length).toBeGreaterThan(0)
      expect(project.descriptionEn.length).toBeGreaterThan(0)
      expect(new Set(project.contributions.map((pr) => pr.number)).size).toBe(
        project.contributions.length,
      )
      for (const pr of project.contributions) {
        expect(pr.href).toBe(
          `https://github.com/${project.repository}/pull/${pr.number}`,
        )
        expect(pr.title.length).toBeGreaterThan(0)
        expect(pr.titleEn.length).toBeGreaterThan(0)
      }
    }
  })
})
