import { Link, useParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getPostBySlug, getAllPosts, formatDate, readingTime } from '../content/loader';

export default function BlogPost() {
  const { slug } = useParams();
  const post = getPostBySlug(slug);

  if (!post) {
    return <div className="w-full"><h1 className="text-3xl font-bold">文章不存在</h1></div>;
  }

  return (
    <article className="w-full max-w-2xl mx-auto">
      <Link to="/blog" className="text-sm text-[#659EB9] hover:underline">&larr; 回到博客</Link>
      <h1 className="mt-4 mb-2 text-3xl font-bold">{post.title}</h1>
      <div className="mb-8 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-fg)]">
        <span>{formatDate(post.date)} · {readingTime(post.content)}</span>
        {post.tags?.map((tag) => (
          <span key={tag} className="rounded-md bg-[var(--muted)] px-2 py-1">{tag}</span>
        ))}
      </div>
      <div className="prose prose-sm max-w-none leading-relaxed">
        <Markdown remarkPlugins={[remarkGfm]}>{post.content}</Markdown>
      </div>
    </article>
  );
}

export function BlogListPreview() {
  const posts = getAllPosts().slice(0, 3);
  return (
    <section className="w-full md:w-4/5 lg:w-5/6">
      <h2 className="mb-6 text-2xl font-bold">Latest Posts</h2>
      {posts.length === 0 && <p className="text-[var(--muted-fg)]">还没有文章</p>}
      <div className="space-y-6">
        {posts.map((post) => (
          <article
            key={post.slug}
            className="group cursor-pointer rounded-lg border border-transparent p-4 transition-all hover:border-[var(--border)] hover:bg-[var(--muted)]"
          >
            <Link to={`/blog/${post.slug}`} className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="text-lg font-semibold group-hover:text-[#659EB9]">{post.title}</h3>
                <p className="mt-1 text-sm">{post.content.replace(/[#*`\[\]]/g, '').slice(0, 100)}...</p>
                <div className="mt-2 flex gap-2 text-xs">
                  {post.tags?.map((tag) => (
                    <span key={tag} className="rounded-md bg-[var(--muted)] px-2 py-1">{tag}</span>
                  ))}
                  <span className="text-[var(--muted-fg)]">{formatDate(post.date)} · {readingTime(post.content)}</span>
                </div>
              </div>
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}