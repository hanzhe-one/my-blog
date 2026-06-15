import { Link } from 'react-router-dom';
import { getAllPosts } from '../content/loader';

const posts = getAllPosts();

export default function Blog() {
  return (
    <div className="w-full">
      <h1 className="mb-8 text-3xl font-bold">Blog</h1>
      {posts.length === 0 && <p className="text-[var(--muted-fg)]">暂无文章</p>}
      <div className="space-y-6">
        {posts.map((post) => (
          <article
            key={post.slug}
            className="group cursor-pointer rounded-lg border border-transparent p-4 transition-all hover:border-[var(--border)] hover:bg-[var(--muted)]"
          >
            <Link to={`/blog/${post.slug}`}>
              <h2 className="text-xl font-semibold group-hover:text-[#659EB9]">{post.title}</h2>
              <p className="mt-1">{post.content.replace(/[#*`\[\]]/g, '').slice(0, 150)}...</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {post.tags?.map((tag) => (
                  <span key={tag} className="rounded-md bg-[var(--muted)] px-2 py-1">{tag}</span>
                ))}
                <span className="text-[var(--muted-fg)]">{post.date}</span>
              </div>
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}