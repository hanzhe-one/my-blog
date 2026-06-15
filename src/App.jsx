import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import Header from './components/Header';
import Home from './pages/Home';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';
import Notes from './pages/Notes';
import Projects from './pages/Projects';
import About from './pages/About';
import Contact from './pages/Contact';

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <div className="mx-auto flex min-h-screen w-full max-w-[70rem] flex-col px-4 sm:px-7 lg:px-10">
          <Header />
          <main className="flex flex-1 flex-col items-center pb-20">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/blog/:slug" element={<BlogPost />} />
              <Route path="/notes" element={<Notes />} />
              <Route path="/notes/:slug" element={<Notes />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
            </Routes>
          </main>
        </div>
      </ThemeProvider>
    </BrowserRouter>
  );
}