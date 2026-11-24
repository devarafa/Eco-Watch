import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ChatAssistant from './components/ChatAssistant.jsx';
import Analysis from './pages/Analysis.jsx';
import Home from './pages/Home.jsx';
import ProjectDetails from './pages/ProjectDetails.jsx';
import Report from './pages/Report.jsx';

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    root.style.scrollBehavior = previous;
  }, [pathname]);

  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <div className="app-shell">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/report" element={<Report />} />
          <Route path="/project-details" element={<ProjectDetails />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ChatAssistant />
      </div>
    </>
  );
}
