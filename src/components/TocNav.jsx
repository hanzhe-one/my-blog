import { useEffect, useState } from 'react';

export default function TocNav({ headings }) {
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    if (!headings || headings.length === 0) return;

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
    for (const { id } of headings) {
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

  if (!headings || headings.length < 2) return null;

  return (
    <nav
      className="w-56 shrink-0 self-start sticky top-24 hidden lg:block"
      style={{ background: '#faf9f6', borderRadius: 8, padding: 16 }}
    >
      <div style={{ fontSize: 12, color: '#999', marginBottom: 8, fontWeight: 500 }}>
        目录
      </div>
      {headings.map((h) => {
        const isActive = activeId === h.id;
        return (
          <div
            key={h.id}
            onClick={() => {
              document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="group"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 0',
              paddingLeft: (h.level - 2) * 24,
              cursor: 'pointer',
              borderRadius: 4,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = '#f0f0ee';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: isActive ? '#f56c6c' : '#ccc',
                flexShrink: 0,
                transition: 'background 0.15s',
              }}
            />
            <span
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? '#333' : '#595959',
                transition: 'color 0.15s',
              }}
            >
              {h.text}
            </span>
          </div>
        );
      })}
    </nav>
  );
}
