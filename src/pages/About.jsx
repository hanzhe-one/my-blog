export default function About() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-8 text-3xl font-bold">About</h1>
      <div className="space-y-4 leading-relaxed">
        <p>
          一个电吉他新手 🎸，正在学习 ollie 的滑板女孩 🛹
        </p>
        <p>
          努力不摆烂学技术 ing 💪
        </p>
        <h2 className="mt-8 text-xl font-semibold">Skills</h2>
        <div className="flex flex-wrap gap-2">
          {['React', 'TypeScript', 'Node.js', 'Python', 'Go', 'Docker', 'PostgreSQL', 'Tailwind CSS', 'Git'].map(
            (skill) => (
              <span
                key={skill}
                className="rounded-md border border-[var(--border)] px-3 py-1 text-sm"
              >
                {skill}
              </span>
            )
          )}
        </div>
      </div>
    </div>
  );
}