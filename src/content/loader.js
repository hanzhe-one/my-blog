const posts = import.meta.glob('/src/content/posts/*.md', { query: '?raw', import: 'default', eager: true });
const notes = import.meta.glob('/src/content/notes/*.md', { query: '?raw', import: 'default', eager: true });

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { data: {}, content: raw };

  const frontmatter = {};
  match[1].split('\n').forEach((line) => {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) {
      try {
        frontmatter[key.trim()] = JSON.parse(rest.join(':').trim());
      } catch {
        frontmatter[key.trim()] = rest.join(':').trim();
      }
    }
  });

  return { data: frontmatter, content: match[2] };
}

function slugify(path) {
  return path.split('/').pop().replace('.md', '');
}

export function getAllPosts() {
  return Object.entries(posts).map(([path, raw]) => {
    const { data, content } = parseFrontmatter(raw);
    return { ...data, slug: slugify(path), content };
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function getAllNotes() {
  return Object.entries(notes).map(([path, raw]) => {
    const { data, content } = parseFrontmatter(raw);
    return { ...data, slug: slugify(path), content };
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function getPostBySlug(slug) {
  return getAllPosts().find((p) => p.slug === slug);
}

export function getNoteBySlug(slug) {
  return getAllNotes().find((n) => n.slug === slug);
}