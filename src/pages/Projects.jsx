const projects = [
  {
    name: 'Project Alpha',
    desc: 'A full-stack web application built with React and Node.js',
    tags: ['React', 'Node.js', 'PostgreSQL'],
    url: 'https://github.com',
  },
  {
    name: 'Project Beta',
    desc: 'Mobile-first responsive design system',
    tags: ['CSS', 'Storybook', 'TypeScript'],
    url: 'https://github.com',
  },
  {
    name: 'Project Gamma',
    desc: 'CLI tool for automated workflow management',
    tags: ['Go', 'CLI', 'Docker'],
    url: 'https://github.com',
  },
];

export default function Projects() {
  return (
    <div className="w-full">
      <h1 className="mb-8 text-3xl font-bold">Projects</h1>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <a
            key={p.name}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-lg border border-[var(--border)] p-5 transition-shadow hover:shadow-md"
          >
            <h2 className="text-lg font-semibold group-hover:text-[#659EB9]">{p.name}</h2>
            <p className="mt-2 text-sm">{p.desc}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {p.tags.map((tag) => (
                <span key={tag} className="rounded-md bg-[var(--muted))] px-2 py-0.5 text-xs">
                  {tag}
                </span>
              ))}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}