import { Link, useParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import TocNav from '../components/TocNav';
import { headingComponents, extractHeadings } from '../components/headingComponents';
import { getNoteBySlug, getAllNotes, formatDate, readingTime } from '../content/loader';

export default function Notes() {
  const { slug } = useParams();
  if (slug) return <NoteDetail slug={slug} />;

  const notes = getAllNotes();
  return (
    <div className="w-full">
      <h1 className="mb-8 text-3xl font-bold">Notes</h1>
      {notes.length === 0 && <p className="text-[var(--muted-fg)]">暂无笔记</p>}
      <div className="grid gap-6 sm:grid-cols-2">
        {notes.map((note) => (
          <Link
            key={note.slug}
            to={`/notes/${note.slug}`}
            className="group rounded-lg border border-[var(--border)] p-5 transition-shadow hover:shadow-md"
          >
            <h2 className="text-lg font-semibold group-hover:text-[#659EB9]">{note.title}</h2>
            <p className="mt-2 text-sm">{note.content.replace(/[#*`[\]]/g, '').slice(0, 80)}...</p>
            <span className="mt-3 block text-xs text-[var(--muted-fg)]">{formatDate(note.date)} · {readingTime(note.content)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function NoteDetail({ slug }) {
  const note = getNoteBySlug(slug);

  if (!note) {
    return <div className="w-full"><h1 className="text-3xl font-bold">笔记不存在</h1></div>;
  }

  const headings = extractHeadings(note.content);

  return (
    <div className="flex w-full max-w-5xl gap-8">
      <TocNav headings={headings} />
      <article className="min-w-0 flex-1 max-w-2xl mx-auto lg:mx-0">
        <Link to="/notes" className="text-sm text-[#659EB9] hover:underline">&larr; 回到笔记</Link>
        <h1 className="mt-4 mb-2 text-3xl font-bold">{note.title}</h1>
        <div className="mb-8 text-xs text-[var(--muted-fg)]">{formatDate(note.date)} · {readingTime(note.content)}</div>
        <div className="max-w-none leading-relaxed prose prose-sm">
          <Markdown remarkPlugins={[remarkGfm]} components={headingComponents}>{note.content}</Markdown>
        </div>
      </article>
    </div>
  );
}
