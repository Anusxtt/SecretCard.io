import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LobbyPage } from './pages/LobbyPage';
import { SomSipPage } from './pages/SomSipPage';
import { KhangPage } from './pages/KhangPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/somsip/:roomId" element={<SomSipPage />} />
        <Route path="/khang/:roomId" element={<KhangPage />} />
      </Routes>
    </BrowserRouter>
  );
}
