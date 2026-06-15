import { Link } from 'react-router-dom';
import { getAllPosts } from '../content/loader';

const previewPosts = getAllPosts().slice(0, 3);

export default function Home() {
  return (
    <div className="flex flex-col items-center gap-y-10">
      <section className="flex flex-col items-center gap-y-7">
        <img
          src="/avatar.jpg"
          alt="avatar"
          className="h-28 w-28 rounded-full border p-1"
        />

        <div className="flex flex-col items-center gap-y-4">
          <h1 className="text-3xl font-bold">xiaozhe</h1>
          <div className="flex flex-wrap justify-center gap-x-7 gap-y-3">
            <div className="flex items-center gap-2">
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a9 9 0 0 1 9 9c0 3.074-1.676 5.59-3.442 7.395a20.4 20.4 0 0 1-2.876 2.416l-.426.29-.2.133-.377.24-.336.205-.416.242a1.87 1.87 0 0 1-1.854 0l-.416-.242-.52-.32-.192-.125-.41-.273a20.6 20.6 0 0 1-3.093-2.566C4.676 16.589 3 14.074 3 11a9 9 0 0 1 9-9m0 2a7 7 0 0 0-7 7c0 2.322 1.272 4.36 2.871 5.996a18 18 0 0 0 2.222 1.91l.458.326q.222.155.427.288l.39.25.343.209.289.169.455-.269.367-.23q.293-.186.627-.417l.458-.326a18 18 0 0 0 2.222-1.91C17.728 15.361 19 13.322 19 11a7 7 0 0 0-7 7m0 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8m0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4"/>
              </svg>
              <span>Shandong, China</span>
            </div>
            <a
              href="https://github.com/hanzhe-one"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 transition-opacity hover:opacity-75"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10"/>
              </svg>
              <span>GitHub</span>
            </a>
          </div>
        </div>

        <Link
          to="/contact"
          className="inline-flex items-center gap-3 rounded-full border bg-[var(--bg)] px-4 py-2 text-sm shadow-sm transition-shadow hover:shadow-md"
        >
          <span className="relative flex items-center justify-center">
            <span className="absolute size-2 animate-ping rounded-full border border-green-400 bg-green-400 opacity-75" />
            <span className="size-2 rounded-full bg-green-400" />
          </span>
          <span className="font-medium">Connect Me!</span>
        </Link>
      </section>

      <section className="w-full md:w-4/5 lg:w-5/6">
        <h2 className="mb-6 text-2xl font-bold">Latest Posts</h2>
        {previewPosts.length === 0 && <p className="text-[var(--muted-fg)]">还没有文章</p>}
        <div className="space-y-6">
          {previewPosts.map((post) => (
            <article
              key={post.slug}
              className="group cursor-pointer rounded-lg border border-transparent p-4 transition-all hover:border-[var(--border)] hover:bg-[var(--muted)]"
            >
              <Link to={`/blog/${post.slug}`}>
                <h3 className="text-lg font-semibold group-hover:text-[#659EB9]">{post.title}</h3>
                <p className="mt-1 text-sm">{post.content.replace(/[#*`\[\]]/g, '').slice(0, 100)}...</p>
                <div className="mt-2 flex gap-2 text-xs">
                  {post.tags?.map((tag) => (
                    <span key={tag} className="rounded-md bg-[var(--muted)] px-2 py-1">{tag}</span>
                  ))}
                  <span className="text-[var(--muted-fg)]">{post.date}</span>
                </div>
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}