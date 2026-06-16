import { useEffect, useState } from 'react';

function TocItem({ item, activeId, onItemClick }) {
  const isActive = activeId === item.id;
  const hasChildren = item.children && item.children.length > 0;

  return (
    <li className={`toc-tl-item ${isActive ? 'active' : ''} ${hasChildren ? 'expanded' : ''}`}>
      <a
        href={`#${item.id}`}
        onClick={(e) => {
          e.preventDefault();
          onItemClick(item.id);
        }}
      >
        <span className="toc-tl-dot" />
        <span className="toc-tl-label">{item.text}</span>
      </a>
      {hasChildren && (
        <ul className="toc-tl-children">
          {item.children.map((child) => (
            <TocItem key={child.id} item={child} activeId={activeId} onItemClick={onItemClick} />
          ))}
        </ul>
      )}
    </li>
  );
}

function countAll(items) {
  let n = 0;
  for (const item of items) {
    n++;
    if (item.children) n += countAll(item.children);
  }
  return n;
}

export default function TocNav({ headings }) {
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    if (!headings || headings.length === 0) return;

    const ids = [];
    function collectIds(items) {
      for (const item of items) {
        ids.push(item.id);
        if (item.children) collectIds(item.children);
      }
    }
    collectIds(headings);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-30% 0px -70% 0px' }
    );

    const els = [];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) {
        observer.observe(el);
        els.push(el);
      }
    }

    return () => {
      for (const el of els) observer.unobserve(el);
    };
  }, [headings]);

  if (!headings || headings.length === 0 || countAll(headings) < 2) return null;

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <nav className="toc-nav">
      <div className="toc-tl-header">目录</div>
      <ul className="toc-tl-list">
        {headings.map((item) => (
          <TocItem key={item.id} item={item} activeId={activeId} onItemClick={scrollTo} />
        ))}
      </ul>
    </nav>
  );
}
