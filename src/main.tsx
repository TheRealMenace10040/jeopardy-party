import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles.css';
import { Home } from './pages/Home';
import { TeamPage } from './pages/TeamPage';
import { TvPage } from './pages/TvPage';
import { HostHome } from './pages/HostHome';
import { Editor } from './pages/Editor';
import { HostRoom } from './pages/HostRoom';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/join/:code?" element={<TeamPage />} />
      <Route path="/tv/:code?" element={<TvPage />} />
      <Route path="/host" element={<HostHome />} />
      <Route path="/host/edit/:id" element={<Editor />} />
      <Route path="/host/room/:id" element={<HostRoom />} />
      <Route path="*" element={<Home />} />
    </Routes>
  </BrowserRouter>,
);
