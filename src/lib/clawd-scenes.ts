// One place for every Clawd scene: the artwork file in /public/clawd and its
// bilingual accessible label. The GIF files stay byte-identical to the upstream
// Clawd Stickers artwork; only the companion PNG (first frame) is generated here.
export const clawdSceneAssets = {
  hello: 'hello',
  coffee: 'coffee',
  notfound: 'notfound',
  bye: 'bye',
  'search-idle': 'todo',
  'search-thinking': 'thinking',
  'search-empty': 'bug',
  'search-error': 'error',
  'search-success': 'passed',
  about: 'duck',
  projects: 'subagents',
  'blog-list': 'plan',
  copied: 'passed',
} as const

export type ClawdScene = keyof typeof clawdSceneAssets

export const clawdSceneLabels: Record<ClawdScene, [string, string]> = {
  hello: ['Clawd 挥手欢迎你', 'Clawd waves hello'],
  coffee: ['Clawd 喝杯咖啡，继续开源实践', 'Clawd takes a coffee break'],
  notfound: ['Clawd 也没找到这个页面', 'Clawd cannot find this page either'],
  bye: ['Clawd 挥手道别，谢谢阅读', 'Clawd waves goodbye — thanks for reading'],
  'search-idle': [
    'Clawd 拿着清单待命，输入关键词开始搜索',
    'Clawd is on standby — type a keyword to start searching',
  ],
  'search-thinking': [
    'Clawd 正在翻找站内文章…',
    'Clawd is digging through the posts…',
  ],
  'search-empty': [
    'Clawd 没翻到匹配的文章，倒是抓到一只 bug',
    'Clawd found no matching posts, only a bug',
  ],
  'search-error': ['Clawd 遇上搜索服务报错', 'Clawd hit a search error'],
  'search-success': ['Clawd 翻到了匹配的文章', 'Clawd found matching posts'],
  about: [
    'Clawd 找小黄鸭一起看关于页',
    'Clawd and a rubber duck on the about page',
  ],
  projects: [
    'Clawd 带着子代理一起研究贡献记录',
    'Clawd and its subagents review the contributions',
  ],
  'blog-list': [
    'Clawd 规划着先读哪一篇',
    'Clawd plans which post to read first',
  ],
  copied: ['代码已复制到剪贴板', 'Code copied to the clipboard'],
}

// Scenes that are visible as soon as the page paints in paper mode.
export const eagerClawdScenes: readonly ClawdScene[] = ['hello', 'notfound']

export const isClawdScene = (value: string): value is ClawdScene =>
  Object.hasOwn(clawdSceneAssets, value)

export const clawdAssetFor = (scene: ClawdScene) => clawdSceneAssets[scene]
