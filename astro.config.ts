import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'
import { rehypeHeadingIds } from '@astrojs/markdown-remark'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import vercel from '@astrojs/vercel'
import AstroPureIntegration from 'astro-pure'
import { defineConfig, svgoOptimizer } from 'astro/config'
import rehypeKatex from 'rehype-katex'
import remarkCjkFriendly from 'remark-cjk-friendly'
import remarkMath from 'remark-math'

// Local integrations
import rehypeAutolinkHeadings from './src/plugins/rehype-auto-link-headings.ts'
import remarkReadingTime from './src/plugins/remark-reading-time.ts'
// Shiki
import {
  addCollapse,
  addCopyButton,
  addLanguage,
  addTitle,
  updateStyle
} from './src/plugins/shiki-custom-transformers.ts'
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerRemoveNotationEscape
} from './src/plugins/shiki-official/transformers.ts'
import config from './src/site.config.ts'

const excludedSitemapPathPatterns = [
  /^\/(?:en\/)?404\/?$/,
  /^\/(?:en\/)?search\/?$/,
  /^\/api(?:\/|$)/,
  /^\/\.well-known\/joye-manifest\.json$/
]

const shouldIncludeInSitemap = (page: string) => {
  const { pathname } = new URL(page)
  return !excludedSitemapPathPatterns.some((pattern) => pattern.test(pathname))
}

const exposeSingleSitemap = (): AstroIntegration => ({
  name: 'expose-single-sitemap',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      const outputDir = fileURLToPath(dir)
      await copyFile(join(outputDir, 'sitemap-0.xml'), join(outputDir, 'sitemap.xml'))
    }
  }
})

const bilingualReadingTime = (): AstroIntegration => ({
  name: 'bilingual-reading-time',
  hooks: {
    'astro:config:setup': ({ updateConfig }) => {
      // Run after astro-pure's reading-time plugin so this bilingual estimate wins.
      updateConfig({
        markdown: {
          remarkPlugins: [remarkReadingTime]
        }
      })
    }
  }
})

// https://astro.build/config
export default defineConfig({
  // [Basic]
  site: 'https://xiaozheblog.vercel.app',
  // Deploy to a sub path
  // https://astro-pure.js.org/docs/setup/deployment#platform-with-base-path
  // base: '/astro-pure/',
  trailingSlash: 'never',
  // root: './my-project-directory',
  server: { host: true },
  // https://docs.astro.build/en/guides/prefetch/
  prefetch: {
    // prefetchAll: true,
    defaultStrategy: 'viewport'
  },

  // [Adapter]
  // https://docs.astro.build/en/guides/deploy/
  // 1. Vercel (serverless)
  adapter: vercel({ imageService: true }),
  output: 'server',
  // 2. Vercel (static)
  // adapter: vercelStatic(),
  // 3. Local (standalone)
  // adapter: node({ mode: 'standalone' }),
  // output: 'server',

  // [Assets]
  image: {
    responsiveStyles: true,
    service: { entrypoint: 'astro/assets/services/sharp' },
    // domains: ['ghchart.rshah.org'],
    remotePatterns: [{ protocol: 'https' }]
  },
  // fonts: [],

  // [Markdown]
  markdown: {
    // remark-cjk-friendly：修复 **加粗** 紧贴全角标点时不渲染的 CommonMark flanking 问题
    remarkPlugins: [remarkMath, remarkCjkFriendly],
    rehypePlugins: [
      [rehypeKatex, {}],
      rehypeHeadingIds,
      [
        rehypeAutolinkHeadings,
        {
          behavior: 'append',
          properties: { className: ['anchor'] },
          content: { type: 'text', value: '#' }
        }
      ]
    ],
    // https://docs.astro.build/en/guides/syntax-highlighting/
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark'
      },
      transformers: [
        // Two copies of @shikijs/types (one under node_modules
        // and another nested under @astrojs/markdown-remark → shiki).
        // Official transformers
        // @ts-ignore this happens due to multiple versions of shiki types
        transformerNotationDiff(),
        // @ts-ignore this happens due to multiple versions of shiki types
        transformerNotationHighlight(),
        // @ts-ignore this happens due to multiple versions of shiki types
        transformerRemoveNotationEscape(),
        // Custom transformers
        // @ts-ignore this happens due to multiple versions of shiki types
        updateStyle(),
        // @ts-ignore this happens due to multiple versions of shiki types
        addTitle(),
        // @ts-ignore this happens due to multiple versions of shiki types
        addLanguage(),
        // @ts-ignore this happens due to multiple versions of shiki types
        addCopyButton(2000), // timeout in ms
        // @ts-ignore this happens due to multiple versions of shiki types
        addCollapse(15) // max lines that needs to collapse
      ]
    }
  },

  // [Integrations]
  integrations: [
    sitemap({
      filter: shouldIncludeInSitemap,
      i18n: {
        defaultLocale: 'zh',
        locales: {
          zh: 'zh-CN',
          en: 'en'
        }
      }
    }),
    exposeSingleSitemap(),
    // astro-pure will automatically add sitemap, mdx & unocss
    AstroPureIntegration(config),
    bilingualReadingTime(),
    react()
  ],

  // [Experimental]
  experimental: {
    // Allow compatible editors to support intellisense features for content collection entries
    // https://docs.astro.build/en/reference/experimental-flags/content-intellisense/
    contentIntellisense: true,
    // Enable SVGO optimization for SVG assets
    // https://docs.astro.build/en/reference/experimental-flags/svg-optimization/
    svgOptimizer: svgoOptimizer(),
    // Enables pre-rendering your prefetched pages on the client in supported browsers.
    // https://docs.astro.build/en/reference/experimental-flags/client-prerender/
    clientPrerender: true,
    // https://docs.astro.build/en/reference/experimental-flags/queued-rendering/
    queuedRendering: {
      enabled: true
    }
  },

  vite: {
    plugins: [
      //   visualizer({
      //     emitFile: true,
      //     filename: 'stats.html'
      //   })
    ],
    resolve: {
      dedupe: ['react', 'react-dom']
    },
    ssr: {
      external: ['@resvg/resvg-js'],
      noExternal: ['satori']
    },
    optimizeDeps: {
      include: [
        'satori',
        'linebreak',
        'base64-js',
        'unicode-trie',
        'unicode-properties',
        '@waline/client',
        'recaptcha-v3'
      ],
      esbuildOptions: {
        plugins: [
          {
            name: 'externalize-virtual-modules',
            setup(build) {
              build.onResolve({ filter: /^virtual:/ }, (args) => ({
                path: args.path,
                external: true
              }))
            }
          }
        ]
      }
    }
  }
})
