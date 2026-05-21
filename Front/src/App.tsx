import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { CityPage } from './pages/CityPage';
import { ProfilePage } from './pages/ProfilePage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminPage } from './pages/AdminPage';
import { AdminAccessPage } from './pages/AdminAccessPage';
import { RegisterPage } from './pages/RegisterPage';
import { LegalPage } from './pages/LegalPage';
import { TokenShopPage } from './pages/TokenShopPage';
import { AgeGate } from './components/AgeGate';

export function App() {
  return (
    <AgeGate>
      <Routes>
        <Route path="/admin-access" element={<AdminAccessPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/city/:city" element={<CityPage />} />
          <Route path="/profile/:id" element={<ProfilePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/tokens" element={<TokenShopPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/legal/:page" element={<LegalPage />} />
        </Route>
      </Routes>
    </AgeGate>
  );
}
