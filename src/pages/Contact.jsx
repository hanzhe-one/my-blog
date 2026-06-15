export default function Contact() {
  const handleSubmit = (e) => {
    e.preventDefault();
    alert('Form submitted! (Demo only)');
  };

  return (
    <div className="mx-auto w-full max-w-xl">
      <h1 className="mb-8 text-3xl font-bold">Contact</h1>
      <p className="mb-6">Have a question or want to work together? Drop me a message!</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium">
            Name
          </label>
          <input
            id="name"
            type="text"
            required
            className="w-full rounded-lg border border-[var(--border)] bg-transparent px-4 py-2 outline-none focus:border-[#659EB9]"
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            className="w-full rounded-lg border border-[var(--border)] bg-transparent px-4 py-2 outline-none focus:border-[#659EB9]"
          />
        </div>
        <div>
          <label htmlFor="message" className="mb-1 block text-sm font-medium">
            Message
          </label>
          <textarea
            id="message"
            rows={5}
            required
            className="w-full rounded-lg border border-[var(--border)] bg-transparent px-4 py-2 outline-none focus:border-[#659EB9]"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-[#659EB9] px-6 py-2 text-white transition-opacity hover:opacity-90"
        >
          Send Message
        </button>
      </form>
    </div>
  );
}