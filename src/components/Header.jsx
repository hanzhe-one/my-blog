import { useState, useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

const navItems = [
  { to: '/blog', label: 'Blog' },
  { to: '/notes', label: 'Notes' },
  { to: '/projects', label: 'Projects' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

export default function Header() {
  const { theme, toggleTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-4 z-50 mx-auto mb-12 flex items-center justify-between rounded-xl border px-4 py-1 transition-all duration-300 max-sm:py-1 sm:rounded-2xl ${
        scrolled
          ? 'border-[var(--border)] bg-[var(--bg)] shadow-[0_0_0_1px_rgba(24,24,27,0.08)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]'
          : 'border-transparent'
      }`}
    >
      <Link to="/" className="z-30 text-xl font-semibold">
        小喆
      </Link>

      <div className="flex items-center gap-2">
        <nav className="hidden items-center sm:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `px-3 py-2 text-sm font-medium transition-colors hover:text-[#659EB9] ${
                  isActive ? 'text-[#659EB9]' : 'text-[var(--fg)]'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={toggleTheme}
          className="rounded-md border p-1.5 transition-colors hover:bg-[var(--muted)]"
          title="Toggle theme"
        >
          <span className="sr-only">Toggle theme</span>
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          </svg>
        </button>

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="rounded-md border p-1.5 transition-colors hover:bg-[var(--muted)] sm:hidden"
        >
          <span className="sr-only">Menu</span>
          <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 rounded-xl border bg-[var(--bg)] p-4 shadow-lg sm:hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `block py-2 text-sm font-medium ${isActive ? 'text-[#659EB9]' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </header>
  );
}