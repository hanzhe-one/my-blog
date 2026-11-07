export type Contribution = {
  number: number
  title: string
  titleEn: string
  href: string
}

// Curated by the author, not a list of starred/forked repositories.
// Keep PR status on GitHub rather than presenting a stale cached merge status.
export const openSourceProjects = [
  {
    id: 'apache-shenyu',
    name: 'Apache ShenYu',
    repository: 'apache/shenyu',
    href: 'https://github.com/apache/shenyu',
    description: 'Java 原生 API 网关，支持协议转换、流量控制与插件扩展。',
    descriptionEn:
      'A Java-native API gateway with protocol conversion, traffic control and plugins.',
    contribution: '围绕负载均衡、JWT 认证和配置同步，参与问题修复与性能优化。',
    contributionEn:
      'Contributing fixes and performance improvements to load balancing, JWT authentication and configuration sync.',
    tags: ['Java', 'API Gateway', 'Open Source'],
    contributions: [
      {
        number: 8234,
        title: '避免健康探测期间持有配置锁',
        titleEn: 'Release the configuration lock during health probes',
        href: 'https://github.com/apache/shenyu/pull/8234',
      },
      {
        number: 8295,
        title: '补全 JWT Bearer 认证挑战',
        titleEn: 'Return JWT Bearer authentication challenges',
        href: 'https://github.com/apache/shenyu/pull/8295',
      },
      {
        number: 7865,
        title: '使用结构化 JSON 同步配置',
        titleEn: 'Send configuration envelopes as structured JSON',
        href: 'https://github.com/apache/shenyu/pull/7865',
      },
    ] satisfies Contribution[],
  },
]
