import { useEffect, useState, useMemo } from 'react';

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function TableOfContents({ content }) {
  const headings = useMemo(() => {
    const regex = /^(#{1,3})\s+(.+)$/gm;
    const results = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      results.push({
        level: match[1].length,
        text: match[2].trim(),
        id: slugify(match[2].trim()),
      });
    }
    return results;
  }, [content]);

  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -65% 0px' }
    );

    for (const { id } of headings) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 2) return null;

  return (
    <nav className="sticky top-24 w-56 shrink-0 self-start hidden xl:block">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--muted-fg)]">
        Table of Contents
      </h2>
      <ul className="space-y-0.5 text-sm">
        {headings.map(({ level, text, id }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`block rounded-md px-3 py-1.5 transition-colors ${
                activeId === id
                  ? 'bg-[var(--muted)] text-[#659EB9] font-medium'
                  : 'text-[var(--muted-fg)] hover:text-[var(--fg)]'
              }`}
              style={{ paddingLeft: `${(level - 1) * 12 + 12}px` }}
            >
              {text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
