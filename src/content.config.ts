import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

function removeDupsAndLowerCase(array: string[]) {
  if (!array.length) return array
  const lowercaseItems = array.map((str) => str.toLowerCase())
  const distinctItems = new Set(lowercaseItems)
  return Array.from(distinctItems)
}

// Shared schemas so the Chinese collections and their English mirrors stay in sync.
const blogSchema = ({ image }: { image: (...args: any[]) => any }) =>
  z.object({
    // Required
    title: z.string().max(60),
    description: z.string().max(160),
    publishDate: z.coerce.date(),
    // Optional
    updatedDate: z.coerce.date().optional(),
    heroImage: z
      .object({
        src: image(),
        alt: z.string().optional(),
        inferSize: z.boolean().optional(),
        width: z.number().optional(),
        height: z.number().optional(),

        color: z.string().optional()
      })
      .optional(),
    tags: z.array(z.string()).default([]).transform(removeDupsAndLowerCase),
    language: z.string().optional(),
    ogImage: z.string().optional(),
    // For English mirrors: the Chinese entry's URL path after `/blog/`
    // (e.g. `20251216---normalization/post`). Drives en routing + hreflang.
    translationKey: z.string().optional(),
    tocDepth: z.number().int().min(2).max(6).optional(),
    tocLabels: z.record(z.string(), z.string()).optional(),
    draft: z.boolean().default(false),
    comment: z.boolean().default(true)
  })

// Chinese (default) blog posts: every `post.mdx` EXCEPT English mirrors `post.en.mdx`.
const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: ['**/*.{md,mdx}', '!**/*.en.{md,mdx}'] }),
  schema: blogSchema
})

// English mirrors: `post.en.mdx` siblings, kept in a separate collection so they
// never leak into the Chinese blog list / RSS / OG generation.
const blogEn = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.en.{md,mdx}' }),
  schema: blogSchema
})

export const collections = { blog, blogEn }
