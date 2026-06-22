import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from './lib/i18n';
import { LobbyPage } from './pages/LobbyPage';
import { SomSipPage } from './pages/SomSipPage';
import { KhangPage } from './pages/KhangPage';
import { ProfilePage } from './pages/ProfilePage';

export default function App() {
  return (
    <I18nProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LobbyPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/somsip/:roomId" element={<SomSipPage />} />
          <Route path="/khang/:roomId" element={<KhangPage />} />
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  );
}
